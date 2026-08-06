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

async function openNextBatchTab(batchId) {
  const batch = runBatches[batchId];
  if (!batch || batch.nextIndex >= batch.items.length) {
    delete runBatches[batchId];
    return;
  }

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
  latestOpenedMaterialTabs.push(tab.id);
}

async function openBatchTabsFast(batchId) {
  const batch = runBatches[batchId];
  if (!batch) return;
  while (batch.nextIndex < batch.items.length) {
    await openNextBatchTab(batchId);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  delete runBatches[batchId];
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
      };
      latestOpenedMaterialTabs = [];
      await openBatchTabsFast(imageBatchId);
      sendResponse({ ok: true, count: items.length });
    })();
    return true;
  }
  if (msg.type === 'autofillDone') {
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
    const maxParallel = Math.max(1, Math.min(4, Number(msg.maxParallel) || 2));
    const state = uploadLocks[key] || { holders: {}, done: {}, maxParallel };
    state.maxParallel = maxParallel;
    for (const [holder, info] of Object.entries(state.holders)) {
      if (now - info.at > 120000) delete state.holders[holder];
    }
    let firstPending = 0;
    if (idx !== null) {
      while (state.done[firstPending]) firstPending++;
    }
    const inWindow = idx === null || idx < firstPending + maxParallel;
    const holderCount = Object.keys(state.holders).length;
    if (state.holders[owner] || (inWindow && holderCount < maxParallel)) {
      state.holders[owner] = { at: now, idx };
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
      const results = [];
      for (const tabId of tabIds) {
        try {
          const tab = await chrome.tabs.get(tabId);
          if (!tab?.url || !/^https:\/\/(ads|gfa)\.naver\.com\//.test(tab.url)) {
            results.push({ tabId, ok: false, error: 'GFA 탭 아님' });
            continue;
          }
          const res = await chrome.tabs.sendMessage(tabId, { type: 'saveCreative' });
          results.push({ tabId, ok: !!res?.ok, error: res?.error || '' });
        } catch (e) {
          results.push({ tabId, ok: false, error: e?.message || String(e) });
        }
      }
      latestOpenedMaterialTabs = tabIds.filter(tabId => results.some(r => r.tabId === tabId && r.ok !== false));
      sendResponse({
        ok: true,
        total: results.length,
        saved: results.filter(r => r.ok).length,
        failed: results.filter(r => !r.ok).length,
        results,
      });
    })();
    return true;
  }
});
