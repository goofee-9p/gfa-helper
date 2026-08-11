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

const imageBatches = {};
const runBatches = {};
const uploadLocks = {};
let latestOpenedMaterialTabs = [];

// 탭을 한꺼번에 다 열면 (1) 이미지 업로드가 서로 엉키고 (2) 뒤쪽 탭이 백그라운드에서
// 5분 넘게 대기하다 크롬 타이머 스로틀링에 걸려 모달 대기가 통째로 타임아웃 난다.
// → 자동입력이 끝난 탭 수만큼만 다음 탭을 여는 웨이브 방식.
const MAX_CONCURRENT_TABS = 3;
// 자동입력 완료 신호가 안 오는 탭(사용자가 닫음/스크립트 중단)이 큐를 막지 않도록 하는 상한
const TAB_STALL_MS = 150000;

async function openNextBatchTab(batchId) {
  const batch = runBatches[batchId];
  if (!batch) return;
  if (batch.nextIndex >= batch.items.length) {
    if (batch.finished.size >= batch.items.length) delete runBatches[batchId];
    return;
  }
  const running = batch.nextIndex - batch.finished.size;
  if (running >= batch.maxConcurrent) return;

  const i = batch.nextIndex++;
  const url = buildUrl(batch.urlTemplate, {
    idx: i,
    total: batch.items.length,
    imageBatchId: batch.imageBatchId,
    imageAssetIdx: i,
    data: batch.items[i],
  });

  const tab = await chrome.tabs.create({ url, active: false });
  batch.opened.push(tab.id);
  batch.tabIndex[tab.id] = i;
  latestOpenedMaterialTabs.push(tab.id);
  batch.timers[i] = setTimeout(() => markBatchItemFinished(batchId, i), TAB_STALL_MS);
}

function markBatchItemFinished(batchId, idx) {
  // 자동입력이 (성공이든 실패든) 끝난 소재는 업로드 순번에서도 빼 준다.
  // 라디오 실패 등으로 업로드까지 못 간 탭이 뒤 탭의 순번을 잡아두는 걸 막는다.
  const lock = uploadLocks[batchId]
    || (uploadLocks[batchId] = { holders: {}, done: {}, maxParallel: 1 });
  lock.done[idx] = true;

  const batch = runBatches[batchId];
  if (!batch || batch.finished.has(idx)) return;
  batch.finished.add(idx);
  if (batch.timers[idx]) {
    clearTimeout(batch.timers[idx]);
    delete batch.timers[idx];
  }
  openNextBatchTab(batchId);
}

function pendingBatchCount() {
  return Object.values(runBatches)
    .reduce((sum, batch) => sum + Math.max(0, batch.items.length - batch.nextIndex), 0);
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
      const { urlTemplate, items, imageAssets = [] } = msg;
      const imageBatchId = 'batch_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      imageBatches[imageBatchId] = imageAssets;
      setTimeout(() => { delete imageBatches[imageBatchId]; }, 60 * 60 * 1000);

      runBatches[imageBatchId] = {
        urlTemplate,
        items,
        imageBatchId,
        nextIndex: 0,
        opened: [],
        finished: new Set(),
        timers: {},
        tabIndex: {},
        maxConcurrent: MAX_CONCURRENT_TABS,
      };
      // 이전 배치 탭 목록을 지우지 않고 누적 — 네이티브 열고 스마트채널 열면
      // 앞 배치가 "열린 소재 저장"에서 통째로 빠지던 문제
      for (let i = 0; i < MAX_CONCURRENT_TABS; i++) await openNextBatchTab(imageBatchId);
      sendResponse({ ok: true, count: items.length });
    })();
    return true;
  }
  if (msg.type === 'autofillDone') {
    const batchId = msg.imageBatchId;
    const idx = Number(msg.idx);
    if (batchId && Number.isFinite(idx)) markBatchItemFinished(batchId, idx);
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'resetOpenedMaterials') {
    latestOpenedMaterialTabs = [];
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'getImageAsset') {
    const asset = imageBatches[msg.imageBatchId]?.[msg.imageAssetIdx] || null;
    sendResponse({ ok: !!asset, asset });
    return true;
  }
  if (msg.type === 'acquireUploadLock') {
    const key = msg.imageBatchId || 'global';
    const owner = msg.owner || `${sender.tab?.id || 'tab'}_${Date.now()}`;
    const now = Date.now();
    const idx = Number.isFinite(Number(msg.idx)) ? Number(msg.idx) : null;
    // GFA 이미지 보관함은 계정 전체가 공유라, 두 탭이 동시에 올리면 서로의 이미지를
    // 집어갈 수 있다. 업로드는 무조건 한 번에 하나만.
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
    if (state.holders[owner] || (inWindow && holderCount < maxParallel)) {
      state.holders[owner] = { at: now, idx, tabId: sender.tab?.id ?? null };
      uploadLocks[key] = state;
      sendResponse({ ok: true, granted: true, owner, firstPending, maxParallel });
    } else {
      uploadLocks[key] = state;
      sendResponse({ ok: true, granted: false, firstPending, maxParallel, active: holderCount });
    }
    return true;
  }
  if (msg.type === 'releaseUploadLock') {
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
    return true;
  }
  if (msg.type === 'saveOpenedMaterials') {
    (async () => {
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
// (안 그러면 뒤 탭들이 잠금 대기 3분 → 업로드 실패로 줄줄이 밀림)
chrome.tabs.onRemoved.addListener((tabId) => {
  for (const state of Object.values(uploadLocks)) {
    for (const [holder, info] of Object.entries(state.holders || {})) {
      if (info.tabId !== tabId) continue;
      if (info.idx !== null && info.idx !== undefined) state.done[info.idx] = true;
      delete state.holders[holder];
    }
  }
  for (const [batchId, batch] of Object.entries(runBatches)) {
    const idx = batch.tabIndex?.[tabId];
    if (idx !== undefined) markBatchItemFinished(batchId, idx);
  }
  latestOpenedMaterialTabs = latestOpenedMaterialTabs.filter(id => id !== tabId);
});
