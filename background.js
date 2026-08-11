chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

function encodePayload(obj) {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function buildUrl(template, payload) {
  const sep = template.includes('#') ? template.split('#')[0] : template;
  return sep + '#gfa=' + encodePayload(payload);
}

// ============================================================
// 상태 보존
// MV3 서비스 워커는 30초만 놀아도 잠들면서 메모리를 통째로 잃는다.
// 탭 목록·배치 진행 상황을 세션 스토리지에 같이 써 둬야
// "일괄 저장이 가끔 안 먹는" 현상과 배치가 중간에 멈추는 현상이 안 생긴다.
// ============================================================
const STATE_KEY = 'gfaRuntimeState';
const IMAGE_KEY = (batchId) => `gfaImages_${batchId}`;

const imageBatches = {};
const runBatches = {};
const uploadLocks = {};
let latestOpenedMaterialTabs = [];
let hydrated = null;

function snapshot() {
  const batches = {};
  for (const [id, b] of Object.entries(runBatches)) {
    batches[id] = {
      urlTemplate: b.urlTemplate,
      items: b.items,
      imageBatchId: b.imageBatchId,
      tabIds: b.tabIds,
      finished: [...b.finished],
      returnTabId: b.returnTabId,
      opening: b.opening,
    };
  }
  return { batches, uploadLocks, latestOpenedMaterialTabs };
}

async function persist() {
  try {
    await chrome.storage.session.set({ [STATE_KEY]: snapshot() });
  } catch (e) {
    console.warn('[GFA Helper] 상태 저장 실패:', e);
  }
}

async function hydrate() {
  if (hydrated) return hydrated;
  hydrated = (async () => {
    try {
      const { [STATE_KEY]: saved } = await chrome.storage.session.get([STATE_KEY]);
      if (!saved) return;
      if (!latestOpenedMaterialTabs.length) latestOpenedMaterialTabs = saved.latestOpenedMaterialTabs || [];
      for (const [key, value] of Object.entries(saved.uploadLocks || {})) {
        if (!uploadLocks[key]) uploadLocks[key] = value;
      }
      for (const [id, b] of Object.entries(saved.batches || {})) {
        if (runBatches[id]) continue;
        runBatches[id] = { ...b, finished: new Set(b.finished || []), stallTimer: null };
      }
    } catch (e) {
      console.warn('[GFA Helper] 상태 복원 실패:', e);
    }
  })();
  return hydrated;
}

async function putImages(batchId, assets) {
  imageBatches[batchId] = assets;
  try {
    await chrome.storage.session.set({ [IMAGE_KEY(batchId)]: assets });
  } catch (e) {
    // 용량 초과 등 — 메모리에는 남아 있으므로 워커가 안 잠들면 정상 동작
    console.warn('[GFA Helper] 이미지 임시 저장 실패:', e);
  }
}

async function takeImage(batchId, idx) {
  if (imageBatches[batchId]) return imageBatches[batchId][idx] || null;
  try {
    const { [IMAGE_KEY(batchId)]: assets } = await chrome.storage.session.get([IMAGE_KEY(batchId)]);
    if (Array.isArray(assets)) {
      imageBatches[batchId] = assets;
      return assets[idx] || null;
    }
  } catch (e) {
    console.warn('[GFA Helper] 이미지 복원 실패:', e);
  }
  return null;
}

// ============================================================
// 배치 진행
// 크롬은 백그라운드 탭의 타이머를 1초(오래 두면 1분) 단위로 늦춘다.
// → 숨은 탭은 사실상 일을 못 하므로, 탭은 전부 미리 열어 SPA 로딩만 굴려두고
//   실제 자동입력은 "활성화된 탭"에서만 한 개씩 순서대로 돌린다.
//   (콘텐츠 스크립트가 화면에 뜰 때까지 기다렸다 시작한다)
// ============================================================
const TAB_STALL_MS = 120000;

async function openBatchTabs(batchId) {
  const batch = runBatches[batchId];
  if (!batch) return;
  for (let i = 0; i < batch.items.length; i++) {
    if (batch.tabIds[i] != null) continue;
    const url = buildUrl(batch.urlTemplate, {
      idx: i,
      total: batch.items.length,
      imageBatchId: batch.imageBatchId,
      imageAssetIdx: i,
      data: batch.items[i],
    });
    const tab = await chrome.tabs.create({ url, active: false });
    batch.tabIds[i] = tab.id;
    if (!latestOpenedMaterialTabs.includes(tab.id)) latestOpenedMaterialTabs.push(tab.id);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  batch.opening = false;
  await persist();
  await activateNext(batchId);
}

function pingStart(tabId, attempt = 0) {
  chrome.tabs.sendMessage(tabId, { type: 'startAutofill' }).catch(() => {
    if (attempt < 8) setTimeout(() => pingStart(tabId, attempt + 1), 800);
  });
}

function clearStall(batch) {
  if (batch?.stallTimer) {
    clearTimeout(batch.stallTimer);
    batch.stallTimer = null;
  }
}

async function activateNext(batchId) {
  const batch = runBatches[batchId];
  if (!batch) return;
  clearStall(batch);

  const next = batch.tabIds.findIndex((tabId, i) => tabId != null && !batch.finished.has(i));
  if (next === -1) {
    await finishBatch(batchId);
    return;
  }

  const tabId = batch.tabIds[next];
  try {
    await chrome.tabs.update(tabId, { active: true });
  } catch (e) {
    // 탭이 이미 닫혔으면 건너뛰고 다음으로
    batch.finished.add(next);
    await persist();
    await activateNext(batchId);
    return;
  }
  // 창을 최소화했거나 다른 창에 있으면 활성 탭이어도 document.hidden이 유지되므로
  // 명시적으로 "네 차례" 신호를 보낸다 (콘텐츠 스크립트가 아직 준비 중일 수 있어 재시도)
  pingStart(tabId);
  // 자동입력 완료 신호가 안 오는 탭이 배치를 영영 붙잡지 않도록
  batch.stallTimer = setTimeout(() => { markFinished(batchId, next); }, TAB_STALL_MS);
  notifyProgress(batchId);
  await persist();
}

async function markFinished(batchId, idx) {
  // 자동입력이 (성공이든 실패든) 끝난 소재는 업로드 순번에서도 빼 준다
  const lock = uploadLocks[batchId] || (uploadLocks[batchId] = { holders: {}, done: {}, maxParallel: 1 });
  lock.done[idx] = true;

  const batch = runBatches[batchId];
  if (!batch) return;
  batch.finished.add(idx);
  if (batch.opening) {
    await persist();
    return; // 탭을 다 연 뒤 openBatchTabs가 이어서 진행
  }
  await activateNext(batchId);
}

async function finishBatch(batchId) {
  const batch = runBatches[batchId];
  if (!batch) return;
  clearStall(batch);
  notifyProgress(batchId, true);
  if (batch.returnTabId != null) {
    try { await chrome.tabs.update(batch.returnTabId, { active: true }); } catch (e) { /* 닫혔으면 무시 */ }
  }
  delete runBatches[batchId];
  await persist();
}

function notifyProgress(batchId, done = false) {
  const batch = runBatches[batchId];
  const total = batch?.items.length ?? 0;
  const finished = batch?.finished.size ?? total;
  chrome.runtime.sendMessage({
    type: 'batchProgress',
    batchId,
    total,
    finished,
    done: done || !batch,
  }).catch(() => {});
}

function pendingBatchCount() {
  return Object.values(runBatches)
    .reduce((sum, batch) => sum + Math.max(0, batch.items.length - batch.finished.size), 0);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'importSmartEditor') {
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = tab?.url || '';
      const isLocalSmartEditor = /^file:\/\/.*smartchannel_editor_.*\.html/i.test(url);
      const isBannerEditorApp = /^https:\/\/banner-editor-xi\.vercel\.app\//i.test(url);
      if (!tab?.id || (!isLocalSmartEditor && !isBannerEditorApp)) {
        sendResponse({ ok: false, error: '스마트채널 에디터 탭을 활성화한 뒤 다시 시도하세요.' });
        return;
      }

      const height = Number(msg.height) || 280;
      const frameResults = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        world: 'MAIN',
        func: (h) => {
          try {
            if (typeof slots === 'undefined' || !Array.isArray(slots) || !slots.length) {
              return { ok: false, error: '에디터에 소재 슬롯이 없습니다.' };
            }
            if (typeof paintCanvas !== 'function') {
              return { ok: false, error: '에디터 렌더 함수(paintCanvas)를 찾지 못했습니다.' };
            }
            if (typeof render === 'function') render();

            const canvasWidth = typeof W === 'number' ? W : 750;
            const sanitize = (name, idx) => {
              const cleaned = String(name || '')
                .replace(/[\/\\:*?"<>|]/g, '_')
                .replace(/\s+/g, '_')
                .replace(/_+/g, '_')
                .replace(/^_+|_+$/g, '');
              return cleaned || `smartchannel_${String(idx + 1).padStart(2, '0')}`;
            };

            const assets = slots.slice(0, 9).map((slot, idx) => {
              const canvas = document.createElement('canvas');
              canvas.width = canvasWidth;
              canvas.height = h;
              const savedGuide = typeof guideAllOn === 'undefined' ? false : guideAllOn;
              if (typeof guideAllOn !== 'undefined') guideAllOn = false;
              paintCanvas(canvas.getContext('2d'), slot, h);
              if (typeof guideAllOn !== 'undefined') guideAllOn = savedGuide;
              return {
                name: `${sanitize(slot.name, idx)}_750x${h}.png`,
                type: 'image/png',
                dataUrl: canvas.toDataURL('image/png'),
              };
            });

            return { ok: true, height: h, count: assets.length, assets };
          } catch (e) {
            return { ok: false, error: e?.message || String(e) };
          }
        },
        args: [height],
      });
      const result = frameResults.find((frame) => frame.result?.ok)?.result
        || frameResults.find((frame) => frame.result?.error)?.result;
      sendResponse(result || { ok: false, error: '스마트채널 에디터 iframe에서 소재를 찾지 못했습니다.' });
    })().catch((e) => sendResponse({ ok: false, error: e?.message || String(e) }));
    return true;
  }

  if (msg.type === 'openBatch') {
    (async () => {
      await hydrate();
      const { urlTemplate, items, imageAssets = [] } = msg;
      const imageBatchId = 'batch_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      await putImages(imageBatchId, imageAssets);

      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

      runBatches[imageBatchId] = {
        urlTemplate,
        items,
        imageBatchId,
        tabIds: [],
        finished: new Set(),
        returnTabId: activeTab?.id ?? null,
        opening: true,
        stallTimer: null,
      };
      // 이전 배치 탭 목록은 지우지 않고 누적 — 네이티브 열고 스마트채널 열면
      // 앞 배치가 "열린 소재 저장"에서 통째로 빠지던 문제
      sendResponse({ ok: true, count: items.length });
      await openBatchTabs(imageBatchId);
    })();
    return true;
  }

  if (msg.type === 'autofillDone') {
    (async () => {
      await hydrate();
      const batchId = msg.imageBatchId;
      const idx = Number(msg.idx);
      if (batchId && Number.isFinite(idx)) await markFinished(batchId, idx);
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.type === 'resetOpenedMaterials') {
    (async () => {
      await hydrate();
      latestOpenedMaterialTabs = [];
      await persist();
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.type === 'getImageAsset') {
    (async () => {
      await hydrate();
      const asset = await takeImage(msg.imageBatchId, msg.imageAssetIdx);
      sendResponse({ ok: !!asset, asset });
    })();
    return true;
  }

  if (msg.type === 'acquireUploadLock') {
    (async () => {
      await hydrate();
      const key = msg.imageBatchId || 'global';
      const owner = msg.owner || `${sender.tab?.id || 'tab'}_${Date.now()}`;
      const now = Date.now();
      const idx = Number.isFinite(Number(msg.idx)) ? Number(msg.idx) : null;
      // GFA 이미지 보관함은 계정 전체가 공유라, 두 탭이 동시에 올리면 서로의 이미지를
      // 집어갈 수 있다. 업로드는 무조건 한 번에 하나만.
      // (활성 탭 하나씩 진행하므로 실제로는 대기 없이 바로 통과한다)
      const maxParallel = 1;
      const state = uploadLocks[key] || { holders: {}, done: {}, maxParallel };
      state.maxParallel = maxParallel;
      for (const [holder, info] of Object.entries(state.holders)) {
        if (now - info.at > 180000) {
          // 죽은 탭이 계속 순번을 잡고 있으면 뒤 탭이 영원히 못 올라가므로 완료 처리
          if (info.idx !== null && info.idx !== undefined) state.done[info.idx] = true;
          delete state.holders[holder];
        }
      }
      let firstPending = 0;
      if (idx !== null) {
        while (state.done[firstPending]) firstPending++;
      }
      const inWindow = idx === null || idx < firstPending + maxParallel;
      const holderCount = Object.keys(state.holders).length;
      uploadLocks[key] = state;
      if (state.holders[owner] || (inWindow && holderCount < maxParallel)) {
        state.holders[owner] = { at: now, idx, tabId: sender.tab?.id ?? null };
        sendResponse({ ok: true, granted: true, owner, firstPending, maxParallel });
      } else {
        sendResponse({ ok: true, granted: false, firstPending, maxParallel, active: holderCount });
      }
      await persist();
    })();
    return true;
  }

  if (msg.type === 'releaseUploadLock') {
    (async () => {
      await hydrate();
      const key = msg.imageBatchId || 'global';
      const owner = msg.owner || '';
      const state = uploadLocks[key];
      if (state?.holders?.[owner]) {
        const idx = state.holders[owner].idx;
        delete state.holders[owner];
        if (idx !== null && idx !== undefined) state.done[idx] = true;
        if (!Object.keys(state.holders).length && Object.keys(state.done).length > 1000) delete uploadLocks[key];
      }
      sendResponse({ ok: true });
      await persist();
    })();
    return true;
  }

  if (msg.type === 'saveOpenedMaterials') {
    (async () => {
      await hydrate();
      const tabIds = [...new Set(latestOpenedMaterialTabs)];
      const pending = pendingBatchCount();
      const results = [];
      for (const tabId of tabIds) {
        try {
          const tab = await chrome.tabs.get(tabId);
          if (!tab?.url || !/^https:\/\/(ads|gfa)\.naver\.com\//.test(tab.url)) {
            results.push({ tabId, ok: false, error: 'GFA 탭 아님' });
            continue;
          }
          const res = await chrome.tabs.sendMessage(tabId, { type: 'saveCreative', force: !!msg.force });
          results.push({ tabId, ok: !!res?.ok, error: res?.error || '' });
        } catch (e) {
          results.push({ tabId, ok: false, error: e?.message || String(e) });
        }
      }
      // 저장에 성공한 탭은 목록에서 빼서 두 번 저장되는 일이 없게 한다 (실패분만 남김)
      latestOpenedMaterialTabs = results.filter(r => !r.ok).map(r => r.tabId);
      await persist();
      sendResponse({
        ok: true,
        pending,
        total: results.length,
        saved: results.filter(r => r.ok).length,
        failed: results.filter(r => !r.ok).length,
        results,
      });
    })();
    return true;
  }
});

// 탭을 닫으면 그 탭이 쥐고 있던 업로드 순번과 배치 순번을 즉시 풀어준다.
// (안 그러면 배치가 그 탭에서 멈춘 채 안 넘어감)
chrome.tabs.onRemoved.addListener((tabId) => {
  (async () => {
    await hydrate();
    for (const state of Object.values(uploadLocks)) {
      for (const [holder, info] of Object.entries(state.holders || {})) {
        if (info.tabId !== tabId) continue;
        if (info.idx !== null && info.idx !== undefined) state.done[info.idx] = true;
        delete state.holders[holder];
      }
    }
    latestOpenedMaterialTabs = latestOpenedMaterialTabs.filter(id => id !== tabId);
    for (const [batchId, batch] of Object.entries(runBatches)) {
      const idx = batch.tabIds.indexOf(tabId);
      if (idx >= 0) await markFinished(batchId, idx);
    }
    await persist();
  })().catch(e => console.warn('[GFA Helper] 탭 정리 실패:', e));
});
