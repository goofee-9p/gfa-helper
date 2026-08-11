(() => {
  if (window.__gfaHelperLoaded) return;
  window.__gfaHelperLoaded = true;

  // ============================================================
  // 표시 옵션
  // ============================================================
  // 우상단 플로팅 패널 표시 여부 — 기능은 그대로 유지, 화면에만 안 뜸
  // 필요하면 true로 바꾸면 다시 보임
  const SHOW_FLOATING_PANEL = false;

  // ============================================================
  // React-compatible value setter
  // ============================================================
  const setReactValue = (el, value) => {
    const isTextarea = el.tagName === 'TEXTAREA';
    const proto = isTextarea
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  };

  // ============================================================
  // Utility: wait
  // ============================================================
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const normalizeText = (s) => (s || '').replace(/\s+/g, ' ').trim();

  function clickLikeUser(el) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const opts = {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + Math.max(1, rect.width / 2),
      clientY: rect.top + Math.max(1, rect.height / 2),
      view: window,
    };
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new PointerEvent('pointerup', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.click();
  }

  // ============================================================
  // Utility: find input near a label keyword
  // ============================================================
  function findInputByKeyword(keywords, opts = {}) {
    const { tagFilter = ['INPUT', 'TEXTAREA'], nth = 0 } = opts;
    const inputs = Array.from(document.querySelectorAll('input, textarea'))
      .filter(el => tagFilter.includes(el.tagName))
      .filter(el => el.type !== 'hidden' && el.type !== 'radio' && el.type !== 'checkbox' && el.type !== 'file');

    const matches = [];
    for (const el of inputs) {
      // 1) placeholder
      if (el.placeholder && keywords.some(k => new RegExp(k, 'i').test(el.placeholder))) {
        matches.push({ el, score: 3 }); continue;
      }
      // 2) aria-label
      const aria = el.getAttribute('aria-label') || '';
      if (aria && keywords.some(k => new RegExp(k, 'i').test(aria))) {
        matches.push({ el, score: 3 }); continue;
      }
      // 3) label[for=id]
      if (el.id) {
        const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lab && keywords.some(k => new RegExp(k, 'i').test(lab.textContent || ''))) {
          matches.push({ el, score: 2 }); continue;
        }
      }
      // 4) nearby label text (walk up parents, look for label-like text)
      let p = el.parentElement;
      for (let d = 0; d < 4 && p; d++, p = p.parentElement) {
        const txt = (p.textContent || '').slice(0, 200);
        if (keywords.some(k => new RegExp(k, 'i').test(txt))) {
          matches.push({ el, score: 1 - d * 0.1 });
          break;
        }
      }
    }
    matches.sort((a, b) => b.score - a.score);
    return matches[nth]?.el || null;
  }

  // ============================================================
  // Find clickable by text (label / button / span)
  // ============================================================
  function findClickableByText(textRe, maxLen = 30) {
    const candidates = Array.from(document.querySelectorAll('label, button, [role="radio"], [role="button"], a, span, div'));
    for (const el of candidates) {
      const t = (el.textContent || '').trim();
      if (t.length > 0 && t.length <= maxLen && textRe.test(t)) {
        // Skip elements that contain other matching descendants
        const childMatches = Array.from(el.children).some(c => (c.textContent || '').trim().length > 0 && textRe.test((c.textContent || '').trim()) && (c.textContent || '').trim().length <= maxLen);
        if (!childMatches) return el;
      }
    }
    return null;
  }

  // ============================================================
  // Flash element for visual feedback
  // ============================================================
  const flashEl = (el, color = '#22c55e') => {
    if (!el) return;
    const prev = el.style.boxShadow;
    el.style.transition = 'box-shadow 0.2s';
    el.style.boxShadow = `0 0 0 3px ${color}`;
    setTimeout(() => { el.style.boxShadow = prev; }, 600);
  };

  // ============================================================
  // Wait for form ready: poll until any input visible
  // ============================================================
  async function waitForFormReady(maxMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      // creativeName은 모든 폼(IB/NI)의 핵심 필드 — 이게 있으면 폼 준비 완료
      if (document.querySelector('input[name="creativeName"]')) return true;
      // 폴백: 일반 text input이 충분히 있으면 (검색바 외에 폼 입력칸 존재)
      const inputs = document.querySelectorAll('input[type="text"], input:not([type]), textarea');
      if (inputs.length > 4) return true;
      await sleep(300);
    }
    return false;
  }

  // ============================================================
  // Select 소재 타입 radio
  // type: 'image-banner' | 'native-image' | 'collection' | 'video'
  // ============================================================
  const TYPE_LABELS = {
    'image-banner': /^이미지\s*배너$/,
    'native-image': /^네이티브\s*이미지$/,
    'collection':   /^컬렉션$/,
    'video':        /^동영상$/,
  };

  // 소재타입 라디오 클릭 시각 — 변경 확인 다이얼로그 자동 처리용 가드
  let lastTypeClickAt = 0;

  async function selectCreativeType(type) {
    const re = TYPE_LABELS[type];
    if (!re) return { ok: false, error: '알 수 없는 소재타입: ' + type };

    // ads.naver.com: 소재 타입 라디오는 카드 형태. 각 라디오의 부모 컨테이너 텍스트가
    // 정확히 한 타입 라벨만 포함하도록 위로 walk up.
    const allRadios = Array.from(document.querySelectorAll('input[type="radio"]'));

    let best = null;
    let bestDepth = Infinity;
    for (const r of allRadios) {
      let p = r.parentElement;
      let depth = 0;
      while (p && depth < 8) {
        const t = (p.textContent || '').trim().replace(/\s+/g, ' ');
        if (re.test(t)) {
          if (depth < bestDepth) { best = r; bestDepth = depth; }
          break;
        }
        p = p.parentElement;
        depth++;
      }
    }
    if (!best) return { ok: false, error: '소재타입 라디오 못찾음: ' + type };

    const wasChecked = best.checked;
    if (!wasChecked) {
      // 최대 3회 재시도 — 백그라운드 탭에서 race 잘 잡기 위해
      let clicked = false;
      for (let retry = 0; retry < 3 && !clicked; retry++) {
        lastTypeClickAt = Date.now();
        best.click();
        await sleep(400); // 다이얼로그 뜨고 자동 닫히고 라디오 체크 반영 대기

        if (best.checked) { clicked = true; break; }

        // 라디오 click이 안 먹으면 부모 카드 클릭
        let p = best.parentElement;
        for (let d = 0; d < 4 && p && !clicked; d++, p = p.parentElement) {
          lastTypeClickAt = Date.now();
          p.click();
          await sleep(300);
          if (best.checked) { clicked = true; break; }
        }
        if (clicked) break;
        await sleep(400); // 다음 retry 전 추가 대기
      }

      if (!best.checked) {
        return { ok: false, error: '라디오 체크 실패 (3회 재시도 후에도): ' + type };
      }
    }
    flashEl(best, '#3b82f6');

    // 폼이 실제로 type에 맞게 재렌더링될 때까지 대기 (최대 10초)
    if (!wasChecked) {
      const switched = await waitForFormSwitch(type, 10000);
      if (!switched) console.warn('[GFA Helper] 폼 전환 타임아웃: ' + type);
    } else {
      await sleep(300);
    }
    return { ok: true };
  }

  // 폼이 type에 맞는 폼으로 완전히 전환됐는지 엄격 검증
  async function waitForFormSwitch(type, maxMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      if (type === 'image-banner') {
        // IB 폼: altMessage input 있음 + creativeName 있음
        if (document.querySelector('input[name="altMessage"]')
            && document.querySelector('input[name="creativeName"]')) return true;
      } else if (type === 'native-image') {
        // NI 폼: altMessage 없음 + creativeName 있음 + 칩 selector 영역 있음
        const noAlt = !document.querySelector('input[name="altMessage"]');
        const hasCreativeName = !!document.querySelector('input[name="creativeName"]');
        const hasChips = document.querySelectorAll('.ad-cms-select-selection-item').length > 0;
        if (noAlt && hasCreativeName && hasChips) return true;
      } else {
        return true;
      }
      await sleep(200);
    }
    return false;
  }

  function getCheckedCreativeType() {
    const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
    for (const r of radios) {
      if (!r.checked) continue;
      let p = r.parentElement;
      for (let depth = 0; depth < 8 && p; depth++, p = p.parentElement) {
        const t = normalizeText(p.textContent || '');
        const hasBanner = TYPE_LABELS['image-banner'].test(t);
        const hasNative = TYPE_LABELS['native-image'].test(t);
        if (hasBanner && !hasNative) return 'image-banner';
        if (hasNative && !hasBanner) return 'native-image';
      }
    }
    return '';
  }

  async function ensureCreativeTypeReady(type, maxMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      const checked = getCheckedCreativeType();
      const switched = await waitForFormSwitch(type, 800);
      if (checked === type && switched) return { ok: true };
      await sleep(250);
    }
    return {
      ok: false,
      error: `소재 타입 전환 미확정: 기대=${type}, 현재=${getCheckedCreativeType() || '확인불가'}`,
    };
  }

  function parseExpectedSizeLabel(label) {
    const m = String(label || '').match(/(\d+)\s*[x×]\s*(\d+)/i);
    if (!m) return null;
    return { width: parseInt(m[1], 10), height: parseInt(m[2], 10) };
  }

  function getDataUrlDimensions(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('이미지 픽셀 크기 확인 실패'));
      img.src = dataUrl;
    });
  }

  // ============================================================
  // Fill common fields
  // ============================================================
  async function fillInputUntilStable(findEl, value, label, maxMs = 7000) {
    if (!value) return null;
    const start = Date.now();
    let lastEl = null;
    while (Date.now() - start < maxMs) {
      const el = findEl();
      if (el) {
        lastEl = el;
        setReactValue(el, value);
        await sleep(120);
        const current = el.value || '';
        if (current === value) {
          flashEl(el);
          return true;
        }
      }
      await sleep(180);
    }
    if (lastEl) {
      setReactValue(lastEl, value);
      flashEl(lastEl, '#f59e0b');
      await sleep(100);
      return (lastEl.value || '') === value;
    }
    console.warn(`[GFA Helper] ${label} input 못찾음`);
    return false;
  }

  async function fillCommonFields(d) {
    const results = {};

    // 광고 소재 이름 — ads.naver.com 실제 셀렉터
    results['소재명'] = await fillInputUntilStable(
      () => document.querySelector('input[name="creativeName"]')
        || document.querySelector('input#creativeName')
        || findInputByKeyword(['소재.*이름', '광고.*이름', '소재명']),
      d['소재명'],
      '소재명'
    );

    // 랜딩 URL — ads.naver.com 실제 셀렉터
    results['랜딩URL'] = await fillInputUntilStable(
      () => document.querySelector('input[name="link"]')
        || document.querySelector('input#creativeLink')
        || findInputByKeyword(['랜딩.*URL'], { tagFilter: ['INPUT'] }),
      d['랜딩URL'],
      '랜딩 URL'
    );

    return results;
  }

  // Helper: get label-ish context text around an input
  function getLabelContext(el) {
    let p = el.parentElement;
    for (let d = 0; d < 4 && p; d++, p = p.parentElement) {
      const t = (p.textContent || '').slice(0, 200);
      if (t.length > 5) return t;
    }
    return '';
  }

  // ============================================================
  // Fill IMAGE BANNER form
  // ============================================================
  async function fillImageBanner(d) {
    const results = await fillCommonFields(d);

    // 광고 안내 문구 — ads.naver.com에서는 name="altMessage"
    const guideEl = document.querySelector('input[name="altMessage"]')
                 || document.querySelector('textarea[name="altMessage"]')
                 || findInputByKeyword(['안내.*문구', '광고.*안내']);
    if (guideEl && d['안내문구']) {
      setReactValue(guideEl, d['안내문구']);
      flashEl(guideEl);
      results['안내문구'] = true;
    } else if (!d['안내문구']) {
      results['안내문구'] = null;
    } else {
      results['안내문구'] = false;
    }

    const adImageResult = await selectAdImage(d);
    results['광고이미지'] = adImageResult.ok;
    results['광고이미지오류'] = adImageResult.ok === false ? adImageResult.error : '';

    if (d['스마트채널'] || d['지면'] === '스마트채널') {
      results['행동유도_사용'] = null;
      results['프로필이름'] = null;
      results['프로필이미지'] = null;
      results['CTA'] = null;
      return results;
    }

    // 행동 유도 "사용" 라디오 항상 클릭 (기본값이 "사용 안함"이라 안 누르면 입력칸 안 나옴)
    const enabledOk = await enableActionUsage();
    results['행동유도_사용'] = enabledOk;
    await sleep(800); // 프로필 이미지/CTA 영역 렌더링 대기

    // 프로필 이름 (이미지 배너는 행동 유도 사용 후 필드가 열리는 케이스가 있음)
    results['프로필이름'] = await fillProfileName(d['프로필이름']);

    // 프로필 이미지 자동 선택 (첫 번째 로고)
    const piResult = await selectProfileImageWithRetry();
    results['프로필이미지'] = piResult.ok ? true : false;
    results['프로필이미지오류'] = piResult.ok ? '' : piResult.error;
    if (!piResult.ok) console.log('[GFA Helper] 프로필 이미지 자동 선택 실패:', piResult.error);

    if (Array.isArray(d['ctaSlots']) && d['ctaSlots'].length > 0) {
      // 기본 사이즈: 슬롯 1·2·3 채우기
      const slotResults = await fillCtaSlots(d['ctaSlots']);
      results['CTA슬롯'] = slotResults;
    } else {
      // 나머지 사이즈: 드롭다운 "더 알아보기" 기본값 유지
      results['CTA'] = null;
    }

    return results;
  }

  // 행동 유도 "사용" 라디오 활성화
  async function enableActionUsage() {
    // name="r8d" 라디오 사용 (진단 데이터에서 확인됨)
    // value="true" = "사용", value="false" = "사용 안함"
    const r8d = Array.from(document.querySelectorAll('input[type="radio"][name="r8d"]'));
    const useRadio = r8d.find(r => r.value === 'true');
    if (useRadio) {
      if (!useRadio.checked) {
        useRadio.click();
        flashEl(useRadio, '#3b82f6');
      }
      return true;
    }
    // 폴백: name이 다를 수 있으니 텍스트로 찾기
    const allRadios = Array.from(document.querySelectorAll('input[type="radio"]'));
    for (const r of allRadios) {
      const lab = r.closest('label');
      const ctx = (lab?.textContent || r.parentElement?.textContent || '').trim();
      // "사용 안함"이 아니라 정확히 "사용"
      if (/^사용$/.test(ctx) && !r.checked) {
        r.click();
        flashEl(r, '#3b82f6');
        return true;
      }
    }
    return false;
  }

  // ============================================================
  // 프로필 이름 (휴리스틱 — 정확한 셀렉터는 진단 후 확정)
  // ============================================================
  async function fillProfileName(value) {
    if (!value) return null;
    const el = document.querySelector('input[name="profileName"]')
            || document.querySelector('input[path="$.profile.name"]')
            || document.querySelector('input[name="profile"]')
            || findInputByKeyword(['프로필.*이름', '프로필명']);
    if (el) {
      setReactValue(el, value);
      flashEl(el);
      return true;
    }
    return false;
  }

  // ============================================================
  // 프로필 이미지 자동 선택
  // 1) "프로필 이미지" 섹션의 "이미지 추가" 버튼 클릭
  // 2) 모달 뜸
  // 3) 첫 번째 썸네일 클릭
  // 4) 확인 버튼 클릭
  // ============================================================
  async function selectProfileImageWithRetry() {
    let lastError = '';
    for (let attempt = 1; attempt <= 2; attempt++) {
      const result = await selectProfileImage();
      if (result.ok) return result;
      lastError = result.error || '알 수 없는 오류';
      console.log(`[GFA Helper] 프로필 이미지 선택 ${attempt}차 실패: ${lastError}`);
      await sleep(700);
    }
    return { ok: false, error: lastError };
  }

  async function selectProfileImage() {
    const isVisible = (el) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };

    const getVisibleDialogs = () => Array.from(findDialogs()).filter(isVisible);
    const normalizeText = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const imageAddButtons = () => Array.from(document.querySelectorAll('button')).filter(b => {
      const bt = (b.textContent || '').trim();
      return isVisible(b)
        && !b.closest('[role="dialog"], [class*="modal"], [class*="Modal"]')
        && /이미지\s*(추가|업로드)|\+\s*이미지/.test(bt);
    });

    const contextText = (el, maxDepth = 4) => {
      const parts = [];
      let p = el;
      for (let d = 0; d < maxDepth && p; d++, p = p.parentElement) {
        const txt = normalizeText(p.textContent).slice(0, 160);
        if (txt) parts.push(txt);
      }
      return parts.join(' / ');
    };

    function findProfileImageAddButton() {
      const buttons = imageAddButtons();
      const labelEls = Array.from(document.querySelectorAll('label, span, div, p, strong, th, td, h1, h2, h3'))
        .filter(el => {
          if (!isVisible(el)) return false;
          const txt = normalizeText(el.textContent);
          return txt.length <= 80 && /프로필\s*이미지/.test(txt) && !/광고\s*이미지/.test(txt);
        });

      const scored = buttons.map(btn => {
        const btnRect = btn.getBoundingClientRect();
        let profileDepth = null;
        let adDepth = null;
        let p = btn.parentElement;
        for (let d = 0; d < 8 && p; d++, p = p.parentElement) {
          const txt = normalizeText(p.textContent);
          if (profileDepth === null && /프로필\s*이미지/.test(txt)) profileDepth = d;
          if (adDepth === null && /광고\s*이미지/.test(txt)) adDepth = d;
        }

        let nearestLabelDistance = Infinity;
        for (const labelEl of labelEls) {
          const labelRect = labelEl.getBoundingClientRect();
          const vertical = Math.abs(btnRect.top - labelRect.top);
          const horizontal = Math.abs(btnRect.left - labelRect.left);
          nearestLabelDistance = Math.min(nearestLabelDistance, vertical * 3 + horizontal);
        }

        let score = nearestLabelDistance;
        if (profileDepth !== null) score -= 800 - profileDepth * 40;
        if (adDepth !== null && (profileDepth === null || adDepth <= profileDepth)) score += 2000;
        if (/프로필\s*이미지/.test(contextText(btn, 5))) score -= 400;
        return { btn, score };
      }).filter(item => Number.isFinite(item.score));

      scored.sort((a, b) => a.score - b.score);
      return scored[0]?.score < 1500 ? scored[0].btn : null;
    }

    function describeImageAddCandidates() {
      return imageAddButtons().slice(0, 4).map((btn, idx) => {
        const text = normalizeText(btn.textContent);
        const ctx = contextText(btn, 3);
        return `${idx + 1}. ${text || '(텍스트 없음)'} / ${ctx}`;
      }).join(' || ');
    }

    function clickLikeUser(el) {
      el.scrollIntoView?.({ block: 'center', inline: 'center' });
      const rect = el.getBoundingClientRect();
      const init = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      };
      for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
        try {
          el.dispatchEvent(type.startsWith('pointer') ? new PointerEvent(type, init) : new MouseEvent(type, init));
        } catch (e) {
          el.dispatchEvent(new MouseEvent('click', init));
          break;
        }
      }
      try {
        el.click?.();
      } catch (e) {
        el.dispatchEvent(new MouseEvent('click', init));
      }
    }

    function closeDialog(dlg) {
      const closeBtn = dlg.querySelector('.ant-modal-close, [aria-label="Close"], [aria-label="close"]')
        || Array.from(dlg.querySelectorAll('button')).find(b => /^(×|✕|닫기|취소)$/.test(normalizeText(b.textContent)));
      if (closeBtn) closeBtn.click();
    }

    for (const dlg of getVisibleDialogs()) {
      if (/광고\s*이미지\s*추가/.test(dlg.textContent || '')) {
        closeDialog(dlg);
        await sleep(300);
      }
    }

    // 1) "프로필 이미지" 영역 안의 이미지 추가 버튼만 클릭. 광고 이미지 추가로 fallback하지 않음.
    let addBtn = null;
    const buttonStart = Date.now();
    while (Date.now() - buttonStart < 5000 && !addBtn) {
      addBtn = findProfileImageAddButton();
      if (!addBtn) await sleep(200);
    }
    if (!addBtn) return { ok: false, error: '이미지 추가 버튼 못찾음: ' + (describeImageAddCandidates() || '후보 없음') };

    clickLikeUser(addBtn);
    flashEl(addBtn, '#3b82f6');
    await sleep(300);

    // 2) "이미지 선택" 모달 찾기
    let modal = null;
    const start = Date.now();
    while (Date.now() - start < 5000 && !modal) {
      const modals = getVisibleDialogs();
      modal = modals.find(dlg => {
        const txt = dlg.textContent || '';
        return /프로필\s*이미지|로고|이미지\s*선택/.test(txt) && !/광고\s*이미지\s*추가/.test(txt);
      }) || null;
      if (!modal) await sleep(200);
    }
    if (!modal) return { ok: false, error: '이미지 선택 모달 못찾음' };
    if (/광고\s*이미지\s*추가/.test(modal.textContent || '')) {
      closeDialog(modal);
      return { ok: false, error: '광고 이미지 모달이 열림 - 프로필 이미지 버튼 탐색 실패' };
    }

    const getSelectedFileCount = () => {
      const countEl = modal.querySelector('.css-vo6spr');
      const countText = (countEl?.textContent || '').trim();
      if (/^\d+$/.test(countText)) return parseInt(countText, 10);
      const txt = modal.textContent || '';
      const m = txt.match(/선택된\s*파일\s*(\d+)\s*\/\s*\d+/);
      return m ? parseInt(m[1], 10) : null;
    };

    const isTileSelected = (tile) => {
      let p = tile;
      for (let d = 0; d < 4 && p; d++, p = p.parentElement) {
        const cls = String(p.className || '');
        const aria = p.getAttribute?.('aria-selected');
        const checked = p.querySelector?.('input[type="checkbox"]:checked, input[type="radio"]:checked');
        if (aria === 'true' || checked || /selected|active|checked/i.test(cls)) return true;
      }
      return false;
    };

    const waitForSelection = async (tile) => {
      const start = Date.now();
      while (Date.now() - start < 1800) {
        const selectedCount = getSelectedFileCount();
        if (selectedCount === null || selectedCount > 0 || isTileSelected(tile)) return true;
        await sleep(120);
      }
      return false;
    };

    const imageScore = (img) => {
      const text = `${img.alt || ''} ${img.src || ''}`.toLowerCase();
      if (/지누스|zinus|로고|logo/.test(text)) return -10000;
      const rect = img.getBoundingClientRect();
      return rect.top * 10 + rect.left;
    };

    const findImageTile = (img) => {
      let p = img.parentElement;
      let best = img;
      for (let d = 0; d < 6 && p; d++, p = p.parentElement) {
        const cls = String(p.className || '');
        if (/selected|css-3hsv0d|active|checked/i.test(cls) || p.querySelector?.('.anticon-check')) {
          best = p;
          break;
        }
        const rect = p.getBoundingClientRect();
        if (rect.width >= 50 && rect.height >= 50 && p.querySelector?.('img') === img) best = p;
      }
      return best;
    };

    // 3) 첫 번째 보이는 로고/썸네일 클릭
    let firstThumb = null;
    let clickTargets = [];
    const imgs = Array.from(modal.querySelectorAll('img')).filter(img => {
      const rect = img.getBoundingClientRect();
      return isVisible(img) && rect.width >= 30 && rect.height >= 30;
    }).sort((a, b) => imageScore(a) - imageScore(b));
    for (const img of imgs) {
      let p = img.parentElement;
      let candidate = findImageTile(img);
      const targets = [img];
      let blocked = false;
      for (let d = 0; d < 5 && p; d++, p = p.parentElement) {
        const txt = (p.textContent || '').trim();
        if (/업로드|추가/.test(txt) && !/로고|이미지\s*선택/.test(txt)) blocked = true;
        targets.push(p);
        if (['LI', 'LABEL', 'BUTTON'].includes(p.tagName) || p.getAttribute('role') === 'button') {
          candidate = p;
        }
      }
      if (blocked) continue;
      firstThumb = img;
      const tile = findImageTile(img);
      clickTargets = [tile, candidate].filter((el, idx, arr) => el && arr.indexOf(el) === idx);
      break;
    }
    if (!firstThumb) return { ok: false, error: '썸네일 못찾음' };

    let selectedOk = false;
    const initiallySelected = clickTargets.find(target => isTileSelected(target));
    if (initiallySelected || (getSelectedFileCount() || 0) > 0) {
      selectedOk = true;
    } else {
      for (const target of clickTargets) {
        clickLikeUser(target);
        if (await waitForSelection(target)) {
          selectedOk = true;
          break;
        }
      }
    }
    flashEl(firstThumb, '#22c55e');
    if (!selectedOk) return { ok: false, error: '로고 썸네일 클릭 후 선택 카운트가 0입니다' };

    // 4) 선택 반영 후 확인 버튼 클릭
    let confirmBtn = null;
    const confirmStart = Date.now();
    while (Date.now() - confirmStart < 3000 && !confirmBtn) {
      confirmBtn = Array.from(modal.querySelectorAll('button')).find(b => {
        const text = (b.textContent || '').trim();
        return /^확인$/.test(text) && !b.disabled && isVisible(b);
      });
      if (!confirmBtn) await sleep(200);
    }
    if (!confirmBtn) return { ok: false, error: '확인 버튼 못찾음' };

    clickLikeUser(confirmBtn);
    await sleep(500); // 모달 닫힘 대기
    return { ok: true };
  }

  async function getImageAsset(d) {
    if (!d.__imageBatchId && d.__imageBatchId !== 0) return null;
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'getImageAsset',
        imageBatchId: d.__imageBatchId,
        imageAssetIdx: d.__imageAssetIdx,
      });
      return res?.asset || null;
    } catch (e) {
      console.warn('[GFA Helper] 이미지 에셋 조회 실패:', e);
      return null;
    }
  }

  async function acquireUploadLock(d) {
    const imageBatchId = d.__imageBatchId || 'global';
    const owner = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const idx = Number.isFinite(Number(d.__imageAssetIdx)) ? Number(d.__imageAssetIdx) : null;
    const maxParallel = d['스마트채널'] || d['지면'] === '스마트채널' ? 2 : 3;
    const start = Date.now();
    while (Date.now() - start < 180000) {
      try {
        const res = await chrome.runtime.sendMessage({
          type: 'acquireUploadLock',
          imageBatchId,
          owner,
          idx,
          maxParallel,
        });
        if (res?.granted) return { ok: true, imageBatchId, owner, idx };
      } catch (e) {
        return { ok: false, error: e?.message || String(e) };
      }
      await sleep(180);
    }
    return { ok: false, error: '이미지 업로드 잠금 대기 시간 초과' };
  }

  async function releaseUploadLock(lock) {
    if (!lock?.ok) return;
    try {
      await chrome.runtime.sendMessage({
        type: 'releaseUploadLock',
        imageBatchId: lock.imageBatchId,
        owner: lock.owner,
        idx: lock.idx,
      });
    } catch (e) {
      console.warn('[GFA Helper] 이미지 업로드 잠금 해제 실패:', e);
    }
  }

  function dataUrlToFile(dataUrl, name, type) {
    const [meta, body] = dataUrl.split(',');
    const mime = type || (meta.match(/data:([^;]+)/)?.[1]) || 'image/jpeg';
    const bin = atob(body);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], name || 'gfa-image.jpg', { type: mime });
  }

  async function selectAdImage(d) {
    const asset = await getImageAsset(d);
    if (!asset?.dataUrl) return { ok: null, error: '이미지 없음' };

    const expectedSize = parseExpectedSizeLabel(d['이미지사이즈']);
    if (expectedSize) {
      try {
        const actualSize = await getDataUrlDimensions(asset.dataUrl);
        if (actualSize.width !== expectedSize.width || actualSize.height !== expectedSize.height) {
          return {
            ok: false,
            error: `업로드 차단: ${asset.name} 크기 ${actualSize.width}×${actualSize.height}, 기대 ${expectedSize.width}×${expectedSize.height}`,
          };
        }
      } catch (e) {
        return { ok: false, error: `${asset.name} 크기 확인 실패: ${e.message || e}` };
      }
    }

    const typeCheck = await ensureCreativeTypeReady(d['소재타입'] || 'image-banner', 5000);
    if (!typeCheck.ok) return { ok: false, error: `업로드 차단: ${typeCheck.error}` };

    const uploadLock = await acquireUploadLock(d);
    if (!uploadLock.ok) return { ok: false, error: `업로드 차단: ${uploadLock.error}` };
    try {

    const isVisible = (el) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const normalizeText = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const visibleDialogs = () => Array.from(findDialogs()).filter(isVisible);
    const click = (el) => {
      el.scrollIntoView?.({ block: 'center', inline: 'center' });
      el.click();
    };
    const closeAdDialogs = () => {
      for (const dlg of visibleDialogs()) {
        if (/광고\s*이미지\s*추가/.test(dlg.textContent || '')) {
          const close = dlg.querySelector('.ad-cms-modal-close, [aria-label="Close"], [aria-label="close"]');
          if (close) close.click();
        }
      }
    };

    closeAdDialogs();
    await sleep(200);

    const buttons = Array.from(document.querySelectorAll('button')).filter(b =>
      isVisible(b)
      && !b.closest('[role="dialog"], [class*="modal"], [class*="Modal"]')
      && /이미지\s*(추가|업로드)|\+\s*이미지/.test(normalizeText(b.textContent))
    );
    const addBtn = buttons.find(b => {
      let p = b.parentElement;
      for (let depth = 0; depth < 8 && p; depth++, p = p.parentElement) {
        const txt = normalizeText(p.textContent);
        if (/프로필\s*이미지/.test(txt) && !/광고\s*이미지/.test(txt)) return false;
        if (/광고\s*이미지|이미지\s*소재|소재\s*이미지/.test(txt)) return true;
      }
      return false;
    });
    if (!addBtn) return { ok: false, error: '광고 이미지 추가 버튼 못찾음' };

    click(addBtn);

    let modal = null;
    const modalStart = Date.now();
    while (Date.now() - modalStart < 5000 && !modal) {
      modal = visibleDialogs().find(dlg => /광고\s*이미지\s*추가|광고\s*이미지를\s*선택/.test(dlg.textContent || '')) || null;
      if (!modal) await sleep(150);
    }
    if (!modal) return { ok: false, error: '광고 이미지 모달 못찾음' };

    const input = modal.querySelector('input[type="file"]');
    if (!input) return { ok: false, error: '광고 이미지 파일 input 못찾음' };

    const getTiles = () => Array.from(modal.querySelectorAll('.css-3hsv0d'))
      .filter(tile => isVisible(tile));
    const getTilesByPosition = () => getTiles().sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return (ra.top - rb.top) || (ra.left - rb.left);
    });
    const getTileKey = (tile) => {
      const img = tile.querySelector('img');
      return [
        img?.currentSrc || '',
        img?.src || '',
        img?.getAttribute('alt') || '',
      ].join('|');
    };
    const getCount = () => {
      const count = (modal.querySelector('.css-vo6spr')?.textContent || '').trim();
      return /^\d+$/.test(count) ? parseInt(count, 10) : 0;
    };
    const getUploadError = () => {
      const text = normalizeText(modal.textContent || '');
      const m = text.match(/(\d+개의 파일이 업로드에 실패했습니다\.[\s\S]*?(?:비율에 맞는 이미지를 등록해 주세요\.|[^\s]+\.(?:jpg|jpeg|png)))/i);
      if (m) return m[1];
      if (/업로드에 실패했습니다|비율에 맞는 이미지/.test(text)) return text;
      return '';
    };
    const isTileSelected = (tile) => {
      if (!tile) return false;
      if (/selected/i.test(String(tile.className || ''))) return true;
      if (tile.getAttribute('aria-checked') === 'true') return true;
      if (tile.getAttribute('aria-selected') === 'true') return true;
      // 체크마크/선택 아이콘 자식 element
      if (tile.querySelector('[class*="checked" i], [class*="selected" i]')) return true;
      return false;
    };

    // 1) 모달 안에 이미 선택된 타일(이전 캐시) 전부 해제
    //    안 그러면 새 이미지 클릭 후 확인 누를 때 기존 선택된 게 같이 들어감
    let deselectSafety = 0;
    while (deselectSafety++ < 30) {
      if (getCount() === 0) break;
      const tiles = getTiles();
      const sel = tiles.find(t => isTileSelected(t));
      if (!sel) break; // 클래스 기반 감지 실패 시 무한루프 방지
      click(sel);
      await sleep(200);
    }

    // 2) 업로드 전 타일 키 스냅샷
    const beforeKeys = new Set(getTiles().map(getTileKey).filter(Boolean));

    const file = dataUrlToFile(asset.dataUrl, asset.name, asset.type);
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    let newTile = null;
    let stableKey = '';
    let stableCount = 0;
    const uploadStart = Date.now();
    while (Date.now() - uploadStart < 30000) {
      const uploadError = getUploadError();
      if (uploadError) {
        return { ok: false, error: `광고 이미지 업로드 실패: ${asset.name} / ${uploadError}` };
      }
      const topLeftTile = getTilesByPosition()[0] || null;
      const topLeftKey = topLeftTile ? getTileKey(topLeftTile) : '';
      const img = topLeftTile?.querySelector('img');
      const isReadyImage = !!(img?.complete && (img.currentSrc || img.src));
      const isNewTopLeft = !!topLeftKey && !beforeKeys.has(topLeftKey) && isReadyImage;
      if (isNewTopLeft) {
        if (topLeftKey === stableKey) {
          stableCount++;
        } else {
          stableKey = topLeftKey;
          stableCount = 1;
        }
        if (stableCount >= 2) {
          newTile = topLeftTile;
          break;
        }
      } else {
        stableKey = '';
        stableCount = 0;
      }
      await sleep(300);
    }
    if (!newTile) return { ok: false, error: '업로드 후 좌상단 새 이미지 타일 못찾음' };

    // 3) 새 타일이 자동 선택 안 됐으면 클릭으로 선택
    if (!isTileSelected(newTile)) {
      click(newTile);
      const selectStart = Date.now();
      while (Date.now() - selectStart < 3000 && !isTileSelected(newTile) && getCount() === 0) {
        await sleep(150);
      }
    }

    // 4) 검증 — 선택된 타일이 정확히 우리 새 타일 1개여야 함
    if (getCount() === 0 || !isTileSelected(newTile)) {
      return { ok: false, error: '업로드 이미지 선택 실패' };
    }
    // 만약 다른 타일이 또 선택되어 있으면(우리 deselect가 빠뜨린 캐시) 해제 시도
    let extraSafety = 0;
    while (extraSafety++ < 20) {
      const tiles = getTiles();
      const selectedOthers = tiles.filter(t => t !== newTile && isTileSelected(t));
      if (selectedOthers.length === 0) break;
      click(selectedOthers[0]);
      await sleep(150);
    }
    if (!isTileSelected(newTile)) return { ok: false, error: '새 이미지 선택 상태가 해제됨' };

    const okBtn = Array.from(modal.querySelectorAll('button')).find(b => /^확인$/.test(normalizeText(b.textContent)) && !b.disabled);
    if (!okBtn) return { ok: false, error: '광고 이미지 확인 버튼 못찾음' };
    click(okBtn);
    await sleep(700);
    return { ok: true, name: asset.name };
    } finally {
      await releaseUploadLock(uploadLock);
    }
  }

  // ============================================================
  // Fill NATIVE IMAGE form
  // ============================================================
  async function fillNativeImage(d) {
    const isShopping = !!d['쇼핑프로모션'];
    const isBannerTemplate = !!d['배너형'];

    // 배너형은 칩 구성에 따라 설명 문구 입력칸이 새로 렌더링되므로 텍스트 입력 전에 칩부터 확정
    const earlyChipResult = isBannerTemplate
      ? await ensureCreativeTemplates(BANNER_TEMPLATE_LABELS)
      : null;

    const results = await fillCommonFields(d);

    if (isShopping) {
      // 쇼핑프로모션: 칩(배너형 모바일/PC)을 유지함 — 제거 X
      results['소재유형정리'] = { removed: [], failed: [], skipped: '쇼핑프로모션 (칩 유지)' };
    } else if (isBannerTemplate) {
      // 네이티브 배너형: 피드형 등 다른 칩 제거 → 배너형(모바일)+배너형(PC)만 남김
      results['소재유형정리'] = earlyChipResult;
      const chipError = earlyChipResult?.error
        || (earlyChipResult?.missing?.length ? `배너형 칩 없음: ${earlyChipResult.missing.join(', ')}` : '');
      if (chipError) results['소재유형정리오류'] = chipError;
    } else {
      // 네이티브 그룹: 칩 제거 → 피드형만 남김
      const chipResult = await removeChips(['배너형 (모바일)', '배너형(모바일)', '배너형 (PC)', '배너형(PC)']);
      results['소재유형정리'] = chipResult;
      if (chipResult.remaining?.length) {
        results['소재유형정리오류'] = `남은 배너형 칩: ${chipResult.remaining.join(', ')}`;
      }
    }

    // 광고 문구 — ads.naver.com에서는 textarea[name="creativeMessage"]
    const copyEl = document.querySelector('textarea[name="creativeMessage"]')
                || document.querySelector('input[name="creativeMessage"]')
                || findInputByKeyword(['광고.*문구', '소재.*문구', '본문']);
    if (copyEl && d['광고문구']) {
      setReactValue(copyEl, d['광고문구']);
      flashEl(copyEl);
      results['광고문구'] = true;
    } else if (!d['광고문구']) {
      results['광고문구'] = null;
    } else {
      results['광고문구'] = false;
    }

    // 배너형 전용 — 설명 문구1~3 / PC 배너형 긴 설명문구 1~2
    if (isBannerTemplate) {
      results['배너형문구'] = await fillBannerTexts(d);
    }

    const adImageResult = await selectAdImage(d);
    results['광고이미지'] = adImageResult.ok;
    results['광고이미지오류'] = adImageResult.ok === false ? adImageResult.error : '';

    // 프로필 이름
    results['프로필이름'] = await fillProfileName(d['프로필이름']);

    // 프로필 이미지 자동 선택 (첫 번째 썸네일)
    const piResult = await selectProfileImageWithRetry();
    results['프로필이미지'] = piResult.ok ? true : false;
    results['프로필이미지오류'] = piResult.ok ? '' : piResult.error;
    if (!piResult.ok) console.log('[GFA Helper] 프로필 이미지 자동 선택 실패:', piResult.error);

    // 행동 유도 드롭다운 선택
    // 쇼핑프로모션 → 사용자가 선택한 값 ("더 알아보기" / "라이브 보기")
    // 네이티브 전환 → "지금 구매하기"
    // 네이티브 트래픽 → 손 안 댐
    let ctaLabel = null;
    if (isShopping) {
      ctaLabel = d['행동유도'] || '더 알아보기';
    } else if (d['목적'] === '전환') {
      ctaLabel = '지금 구매하기';
    }
    if (ctaLabel) {
      const ctaResult = await selectNativeCallToAction(ctaLabel);
      results['행동유도'] = ctaResult.ok;
      results['행동유도오류'] = ctaResult.ok ? '' : ctaResult.error;
    } else {
      results['행동유도'] = null;
    }

    // CTA slots 1·2·3 (네이티브 이미지에는 보통 없으므로 호출 안 됨)
    if (Array.isArray(d['ctaSlots']) && d['ctaSlots'].length > 0) {
      const slotResults = await fillCtaSlots(d['ctaSlots']);
      results['CTA슬롯'] = slotResults;
    }

    return results;
  }

  async function selectNativeCallToAction(label) {
    const ctaRoot = document.getElementById('$.callToAction')
      || Array.from(document.querySelectorAll('.ad-cms-flex, .NodeProxy-module_column__2MYFU, div'))
        .find(el => /행동\s*유도/.test(normalizeText(el.textContent || ''))
          && el.querySelector('.ad-cms-select'));

    const select = ctaRoot?.querySelector('.ad-cms-select')
      || Array.from(document.querySelectorAll('.ad-cms-select'))
        .find(el => /행동\s*유도/.test(normalizeText(el.closest('.NodeProxy-module_column__2MYFU, form, div')?.textContent || '')));

    if (!select) return { ok: false, error: '행동 유도 셀렉트 못찾음' };

    const current = normalizeText(select.querySelector('.ad-cms-select-content-value, .ad-cms-select-selection-item, .ad-cms-select-selection-placeholder')?.textContent || select.textContent);
    if (current.includes(label)) {
      flashEl(select, '#22c55e');
      return { ok: true, already: true };
    }

    clickLikeUser(select);
    await sleep(350);

    const started = Date.now();
    while (Date.now() - started < 5000) {
      const options = Array.from(document.querySelectorAll(
        '.ad-cms-select-item-option, .ad-cms-select-item, [role="option"]'
      )).filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      const option = options.find(el => normalizeText(el.textContent) === label)
        || options.find(el => normalizeText(el.textContent).includes(label));
      if (option) {
        clickLikeUser(option);
        await sleep(500);
        const next = normalizeText(select.querySelector('.ad-cms-select-content-value, .ad-cms-select-selection-item')?.textContent || select.textContent);
        const ok = next.includes(label) || normalizeText(document.body.textContent).includes(label);
        flashEl(select, ok ? '#22c55e' : '#f59e0b');
        return { ok, selected: label, error: ok ? '' : '행동 유도 선택 후 값 확인 실패' };
      }
      await sleep(200);
    }
    return { ok: false, error: `"${label}" 옵션 못찾음` };
  }

  // ============================================================
  // 칩(태그) 제거 — Ant Design ad-cms-select 멀티셀렉트
  // 진단된 구조:
  //   <span class="ad-cms-select-selection-item" title="배너형 (모바일)">
  //     <span class="ad-cms-select-selection-item-content">배너형 (모바일)</span>
  //     <span class="ad-cms-select-selection-item-remove">  ← 클릭 대상
  //       <span aria-label="close">×</span>
  //     </span>
  //   </span>
  // ============================================================
  async function removeChips(labels) {
    const removed = [];
    const failed = [];
    const normalize = (s) => (s || '').replace(/\s+/g, '').replace(/[()（）]/g, '').trim();
    const targets = labels.map(normalize);
    const isTargetChip = (title) => {
      const t = normalize(title);
      return targets.includes(t) || /배너형.*모바일|모바일.*배너형|배너형.*PC|PC.*배너형/i.test(t);
    };
    const clickRemove = (chip) => {
      const removeBtn = chip.querySelector(
        '.ad-cms-select-selection-item-remove, [aria-label="close"], [aria-label="Close"], .anticon-close'
      );
      if (removeBtn) {
        clickLikeUser(removeBtn);
        return true;
      }
      const closeIcon = Array.from(chip.querySelectorAll('span, svg, button')).find(el =>
        /close|remove|delete/i.test(el.getAttribute?.('aria-label') || el.className || '')
      );
      if (closeIcon) {
        clickLikeUser(closeIcon);
        return true;
      }
      return false;
    };

    // 여러 라운드 — 제거하면 다이얼로그 뜨고 DOM 재배열될 수 있어서 안전하게
    for (let round = 0; round < 10; round++) {
      const chips = Array.from(document.querySelectorAll('.ad-cms-select-selection-item'));
      let didRemove = false;
      for (const chip of chips) {
        const title = chip.getAttribute('title') ||
                      (chip.querySelector('.ad-cms-select-selection-item-content')?.textContent || '').trim();
        if (!isTargetChip(title)) continue;

        if (clickRemove(chip)) {
          lastChipRemoveAt = Date.now(); // 다이얼로그 자동 처리 가드
          removed.push(title);
          didRemove = true;
          await sleep(750); // 다이얼로그 뜨고 자동 닫히고 DOM 재배열 대기
          break; // 한 라운드에 하나만 제거 후 재탐색
        } else {
          failed.push(title + ' (X 버튼 없음)');
        }
      }
      if (!didRemove) break; // 더 이상 제거할 게 없음
    }

    if (removed.length) console.log('[GFA Helper] 칩 제거: ' + removed.join(', '));
    if (failed.length) console.log('[GFA Helper] 칩 제거 실패: ' + failed.join(', '));
    const remaining = Array.from(document.querySelectorAll('.ad-cms-select-selection-item'))
      .map(chip => chip.getAttribute('title') ||
        (chip.querySelector('.ad-cms-select-selection-item-content')?.textContent || '').trim())
      .filter(isTargetChip);
    return { removed, failed, remaining };
  }

  // ============================================================
  // 소재 유형 칩을 지정한 구성으로 맞추기 (없으면 추가, 나머지는 제거)
  // 네이티브 배너형: 배너형(모바일) + 배너형(PC)만 남기고 피드형 등은 전부 제거
  // ============================================================
  const BANNER_TEMPLATE_LABELS = ['배너형 (모바일)', '배너형 (PC)'];

  const normalizeChipLabel = (s) => (s || '').replace(/\s+/g, '').replace(/[()（）]/g, '').trim();

  // 칩/옵션 텍스트에 부가 문구가 붙어도 매칭되도록 (배너형모바일 ≠ 배너형PC 라 오탐 없음)
  const chipLabelMatches = (candidate, label) => {
    const a = normalizeChipLabel(candidate);
    const b = normalizeChipLabel(label);
    return !!a && !!b && (a === b || a.includes(b));
  };

  function findTemplateSelect() {
    return document.querySelector('.ad-cms-select[name="checkedTemplates"]')
      || document.getElementById('$.checkedTemplates')?.querySelector('.ad-cms-select')
      || document.querySelector('.ad-cms-select-multiple')
      || null;
  }

  function getTemplateChips(select) {
    return Array.from((select || document).querySelectorAll('.ad-cms-select-selection-item')).map(el => ({
      el,
      title: el.getAttribute('title')
        || (el.querySelector('.ad-cms-select-selection-item-content')?.textContent || '').trim(),
    }));
  }

  async function ensureCreativeTemplates(keepLabels) {
    const select = findTemplateSelect();
    if (!select) return { removed: [], added: [], failed: [], missing: keepLabels.slice(), error: '소재 유형 셀렉트 못찾음' };

    const removed = [];
    const added = [];
    const failed = [];

    // 0) 이 광고그룹이 배너형을 지원하는지 먼저 확인.
    //    지원 안 하는데 기존 칩부터 지우면 소재 유형이 0개가 돼 폼이 망가짐.
    const available = await listTemplateOptions(select);
    if (available.length) {
      const missingOptions = keepLabels.filter(label =>
        !available.some(opt => chipLabelMatches(opt, label)));
      if (missingOptions.length === keepLabels.length) {
        return {
          removed: [], added: [], failed: [], missing: keepLabels.slice(),
          error: `이 광고그룹에 배너형 소재 유형이 없습니다 (선택 가능: ${available.join(', ')})`,
        };
      }
    }

    // 1) keep 목록에 없는 칩 제거 (한 번에 하나씩 — 제거하면 확인 다이얼로그 + DOM 재배열)
    for (let round = 0; round < 12; round++) {
      const extra = getTemplateChips(select)
        .find(c => !keepLabels.some(label => chipLabelMatches(c.title, label)));
      if (!extra) break;
      const removeBtn = extra.el.querySelector(
        '.ad-cms-select-selection-item-remove, [aria-label="close"], [aria-label="Close"], .anticon-close'
      );
      if (!removeBtn) {
        failed.push(`${extra.title} (X 버튼 없음)`);
        break; // 못 지우면 같은 칩이 계속 걸려 무한루프
      }
      lastChipRemoveAt = Date.now(); // 구성 변경 다이얼로그 자동 확인 가드
      clickLikeUser(removeBtn);
      removed.push(extra.title);
      await sleep(750);
    }

    // 2) 빠진 칩 추가
    for (const label of keepLabels) {
      if (getTemplateChips(select).some(c => chipLabelMatches(c.title, label))) continue;
      if (await addTemplateChip(select, label)) added.push(label);
      else failed.push(`${label} (옵션 선택 실패)`);
    }

    const current = getTemplateChips(select).map(c => c.title);
    const missing = keepLabels.filter(label =>
      !current.some(title => chipLabelMatches(title, label)));
    if (removed.length) console.log('[GFA Helper] 소재 유형 칩 제거: ' + removed.join(', '));
    if (added.length) console.log('[GFA Helper] 소재 유형 칩 추가: ' + added.join(', '));
    if (failed.length) console.log('[GFA Helper] 소재 유형 칩 실패: ' + failed.join(', '));
    return { removed, added, failed, missing, remaining: current };
  }

  // 드롭다운을 잠깐 열어 선택 가능한 소재 유형 목록만 읽고 다시 닫음 (선택은 하지 않음)
  async function listTemplateOptions(select) {
    const searchInput = select.querySelector('input.ad-cms-select-input');
    clickLikeUser(searchInput || select);
    const started = Date.now();
    let labels = [];
    while (Date.now() - started < 3000) {
      labels = Array.from(document.querySelectorAll(
        '.ad-cms-select-item-option, .ad-cms-select-item, [role="option"]'
      )).filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }).map(el => normalizeText(el.textContent)).filter(Boolean);
      if (labels.length) break;
      await sleep(200);
    }
    closeSelectDropdown(searchInput || select);
    await sleep(250);
    return labels;
  }

  async function addTemplateChip(select, label) {
    const searchInput = select.querySelector('input.ad-cms-select-input');
    clickLikeUser(searchInput || select);
    await sleep(350);

    const started = Date.now();
    while (Date.now() - started < 5000) {
      const option = Array.from(document.querySelectorAll(
        '.ad-cms-select-item-option, .ad-cms-select-item, [role="option"]'
      )).filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }).find(el => chipLabelMatches(el.textContent, label));

      if (option) {
        lastChipRemoveAt = Date.now(); // 구성 변경 다이얼로그 자동 확인 가드
        clickLikeUser(option);
        await sleep(700);
        const ok = getTemplateChips(select).some(c => chipLabelMatches(c.title, label));
        closeSelectDropdown(searchInput || select);
        await sleep(250);
        return ok;
      }
      await sleep(200);
    }
    closeSelectDropdown(searchInput || select);
    return false;
  }

  function closeSelectDropdown(el) {
    if (!el) return;
    // 멀티셀렉트는 옵션 클릭 후에도 드롭다운이 열린 채로 남아 다음 조작을 가림
    const opts = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true };
    el.dispatchEvent(new KeyboardEvent('keydown', opts));
    el.dispatchEvent(new KeyboardEvent('keyup', opts));
    if (typeof el.blur === 'function') el.blur();
  }

  // ============================================================
  // 배너형 전용 문구 — 설명 문구1~3 / PC 배너형 긴 설명문구 1~2
  // ============================================================
  const BANNER_TEXT_FIELDS = [
    { key: '설명문구1',   name: 'title',   keywords: ['설명\\s*문구\\s*1', '설명\\s*문구\\s*첫\\s*문장'] },
    { key: '설명문구2',   name: 'content', keywords: ['설명\\s*문구\\s*2', '설명\\s*문구\\s*두\\s*번째'] },
    { key: '설명문구3',   name: 'text3rd', keywords: ['설명\\s*문구\\s*3', '설명\\s*문구\\s*세\\s*번째'] },
    { key: '긴설명문구1', name: 'text4th', keywords: ['긴\\s*설명\\s*문구\\s*1', '긴\\s*설명\\s*문구\\s*첫'] },
    { key: '긴설명문구2', name: 'text5th', keywords: ['긴\\s*설명\\s*문구\\s*2', '긴\\s*설명\\s*문구\\s*두'] },
  ];

  async function fillBannerTexts(d) {
    const out = {};
    for (const field of BANNER_TEXT_FIELDS) {
      const value = d[field.key];
      if (!value) { out[field.key] = null; continue; }
      out[field.key] = await fillInputUntilStable(
        () => document.querySelector(`input[name="${field.name}"]`)
          || document.querySelector(`textarea[name="${field.name}"]`)
          || findInputByKeyword(field.keywords),
        value,
        field.key,
        4000
      );
    }
    const missed = Object.entries(out).filter(([, ok]) => ok === false).map(([key]) => key);
    if (missed.length) console.warn('[GFA Helper] 배너형 문구 입력 실패: ' + missed.join(', '));
    return out;
  }

  // ============================================================
  // Fill CTA slots (text + URL pairs)
  // ============================================================
  async function fillCtaSlots(slots) {
    const slotResults = [];

    // Ensure enough slots exist by clicking "+ 행동 유도 버튼 추가" if needed
    for (let attempt = 0; attempt < slots.length; attempt++) {
      const currentTextInputs = findCtaTextInputs();
      if (currentTextInputs.length >= slots.length) break;
      const addBtn = findClickableByText(/행동.*유도.*(버튼|추가)/, 30);
      if (addBtn) {
        addBtn.click();
        await sleep(400);
      } else {
        break;
      }
    }

    const textInputs = findCtaTextInputs();
    const urlInputs = findCtaUrlInputs();

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const tEl = textInputs[i];
      const uEl = urlInputs[i];
      const res = { idx: i + 1, text: false, url: false };
      if (tEl && slot.text) {
        setReactValue(tEl, slot.text);
        flashEl(tEl);
        res.text = true;
      }
      if (uEl && slot.url) {
        setReactValue(uEl, slot.url);
        flashEl(uEl);
        res.url = true;
      }
      slotResults.push(res);
    }
    return slotResults;
  }

  function findCtaTextInputs() {
    // 진단 결과: input[name="name"] with placeholder "행동 유도 문구를 입력해주세요."
    return Array.from(document.querySelectorAll('input')).filter(el => {
      const ph = el.placeholder || '';
      return /행동\s*유도\s*문구/.test(ph);
    });
  }
  function findCtaUrlInputs() {
    // 진단 결과: input[name="url"] with placeholder "행동 유도 URL을 입력해주세요."
    return Array.from(document.querySelectorAll('input')).filter(el => {
      const ph = el.placeholder || '';
      return /행동\s*유도\s*URL/i.test(ph);
    });
  }

  // ============================================================
  // URL hash payload
  // ============================================================
  function decodePayload() {
    const hash = location.hash;
    const m = hash.match(/gfa=([^&]+)/);
    if (!m) return null;
    try {
      const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const json = new TextDecoder().decode(bytes);
      return JSON.parse(json);
    } catch (e) {
      console.warn('[GFA Helper] hash decode 실패', e);
      return null;
    }
  }

  // ============================================================
  // Floating result panel
  // ============================================================
  function buildPanel(payload, results) {
    // 플로팅 패널 숨김 모드 — 아무 경로로 호출돼도 화면에 안 띄움
    // (필요해지면 SHOW_FLOATING_PANEL=true로 변경)
    if (!SHOW_FLOATING_PANEL) return;
    const old = document.getElementById('__gfa_helper_panel');
    if (old) old.remove();

    const root = document.createElement('div');
    root.id = '__gfa_helper_panel';
    root.style.cssText = `
      position: fixed; top: 12px; right: 12px; z-index: 2147483647;
      width: 360px; max-height: 88vh; overflow-y: auto;
      background: white; border: 1px solid #cbd5e1; border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.15);
      font: 12px/1.4 -apple-system, "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
      color: #1f2937;
    `;

    const d = payload.data || {};
    const idxLabel = `${(payload.idx ?? 0) + 1} / ${payload.total ?? 1}`;
    const typeLabel = d['소재타입'] === 'native-image' ? '네이티브 이미지' : '이미지 배너';

    const fieldRows = [];
    fieldRows.push({ label: '소재명', value: d['소재명'], result: results['소재명'] });
    fieldRows.push({ label: '랜딩 URL', value: d['랜딩URL'], result: results['랜딩URL'] });
    fieldRows.push({
      label: '광고 이미지',
      value: results['광고이미지오류'] || (results['광고이미지'] === true ? '업로드/선택 완료' : '이미지 파일 없음'),
      result: results['광고이미지'],
    });
    if (d['소재타입'] === 'image-banner') {
      fieldRows.push({ label: '광고 안내 문구', value: d['안내문구'], result: results['안내문구'] });
    } else {
      fieldRows.push({ label: '광고 문구', value: d['광고문구'], result: results['광고문구'] });
    }
    fieldRows.push({
      label: '프로필 이미지',
      value: results['프로필이미지오류'] || '첫 번째 로고 자동 선택',
      result: results['프로필이미지'],
    });

    let ctaHtml = '';
    if (d['소재타입'] === 'image-banner' && Array.isArray(d['ctaSlots'])) {
      ctaHtml = '<div style="margin-top:8px;padding:6px;border:1px solid #dbeafe;border-radius:4px;background:#eff6ff;">' +
        '<b style="font-size:11px;color:#1e40af;">행동 유도 슬롯</b>' +
        (results['CTA슬롯'] || []).map((r, i) => {
          const s = d['ctaSlots'][i] || {};
          return `<div style="margin-top:4px;font-size:11px;">
            <span style="display:inline-block;width:20px;font-weight:600;">${i + 1}.</span>
            <span style="color:${r.text ? '#16a34a' : '#dc2626'};">텍스트${r.text ? '✓' : '✗'}</span>
            <span style="color:${r.url ? '#16a34a' : '#dc2626'};margin-left:6px;">URL${r.url ? '✓' : '✗'}</span>
            <div style="margin-left:20px;color:#475569;">${escapeHtml(s.text || '')}</div>
          </div>`;
        }).join('') +
        '</div>';
    } else if (d['소재타입'] === 'native-image') {
      const actionText = d['목적'] === '전환'
        ? `행동 유도 "지금 구매하기" ${results['행동유도'] ? '설정됨' : '설정 실패'}`
        : '행동 유도 기본값 유지';
      ctaHtml = '<div style="margin-top:8px;padding:6px;background:#f1f5f9;border-radius:4px;font-size:11px;color:#475569;">' +
        `※ 네이티브 이미지: ${actionText}` +
        '</div>';
    }

    // 네이티브 이미지: 소재 유형 칩 제거 결과 표시
    let chipHtml = '';
    if (d['소재타입'] === 'native-image' && results['소재유형정리']) {
      const removed = results['소재유형정리'].removed || [];
      chipHtml = `<div style="margin-top:8px;padding:6px;border:1px solid #fde047;background:#fef9c3;border-radius:4px;font-size:11px;color:#854d0e;">
        <b>소재 유형 칩 정리</b><br/>
        ${removed.length > 0
          ? '제거됨: ' + removed.map(x => escapeHtml(x)).join(', ')
          : '<span style="color:#dc2626;">제거 실패 — 수동으로 X 클릭 필요</span>'}
      </div>`;
    }

    const typeFailedBanner = results._typeSwitchFailed
      ? `<div style="margin-bottom:8px;padding:8px;background:#fee2e2;border:1px solid #f87171;border-radius:4px;font-size:11px;color:#991b1b;font-weight:600;">
           ⚠ 소재타입 라디오 클릭 실패 — "자동입력 재시도" 버튼 누르세요
         </div>` : '';
    const formSwitchBanner = results._formSwitchTimeout
      ? `<div style="margin-bottom:8px;padding:8px;background:#fff7ed;border:1px solid #fdba74;border-radius:4px;font-size:11px;color:#9a3412;font-weight:600;">
           ⚠ 소재타입 전환 확인이 늦었습니다. 일부 항목이 실패하면 "자동입력 재시도"를 눌러주세요.
         </div>` : '';

    root.innerHTML = `
      <div style="padding:8px 10px;background:#0f172a;color:white;border-radius:8px 8px 0 0;display:flex;justify-content:space-between;align-items:center;">
        <div><b>GFA 도우미</b> · ${escapeHtml(idxLabel)} · <span style="color:#93c5fd;">${typeLabel}</span></div>
        <button id="__gfa_close" style="background:transparent;color:white;border:none;cursor:pointer;font-size:14px;">✕</button>
      </div>
      <div style="padding:10px;">
        ${typeFailedBanner}
        ${formSwitchBanner}
        <div style="margin-bottom:6px;font-size:11px;color:#64748b;">초록 ✓ 성공 / 빨강 ✗ 실패</div>
        ${fieldRows.map(r => `
          <div style="margin-bottom:6px;padding:5px;border:1px solid #e2e8f0;border-radius:4px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
              <b style="font-size:11px;color:#475569;">${escapeHtml(r.label)}</b>
              <span style="font-size:10px;color:${r.result === true ? '#16a34a' : r.result === false ? '#dc2626' : '#94a3b8'};">${
                r.result === true ? '✓ 입력됨' : r.result === false ? '✗ 못찾음' : '─'
              }</span>
            </div>
            <div style="font-size:11px;background:#f8fafc;padding:3px 5px;border-radius:3px;word-break:break-all;min-height:1.2em;">${escapeHtml(r.value || '') || '<i style="color:#94a3b8">(비어있음)</i>'}</div>
            <div style="display:flex;gap:4px;margin-top:3px;">
              <button data-act="copy" data-val="${escapeAttr(r.value || '')}" style="flex:1;padding:3px;font-size:10px;border:1px solid #cbd5e1;background:white;border-radius:3px;cursor:pointer;">복사</button>
            </div>
          </div>
        `).join('')}
        ${ctaHtml}
        ${chipHtml}
        <div style="margin-top:8px;padding:6px;background:#fef9c3;border:1px solid #fde047;border-radius:4px;font-size:11px;color:#854d0e;">
          ⚠ 권장 이미지 사이즈: <b>${escapeHtml(d['이미지사이즈'] || '?')}</b>
        </div>
        <button id="__gfa_retry" style="width:100%;padding:6px;background:#2563eb;color:white;border:none;border-radius:4px;cursor:pointer;margin-top:6px;font-size:12px;">자동입력 재시도</button>
      </div>
    `;

    document.body.appendChild(root);

    root.querySelector('#__gfa_close').addEventListener('click', () => root.remove());
    root.querySelector('#__gfa_retry').addEventListener('click', async () => {
      const r = await runAutofill(payload);
      buildPanel(payload, r);
    });
    root.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-act="copy"]');
      if (btn) {
        try { await navigator.clipboard.writeText(btn.dataset.val); btn.textContent = '✓'; setTimeout(() => btn.textContent = '복사', 1000); }
        catch (e) { alert('복사 실패: ' + e); }
      }
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }
  function escapeAttr(s) {
    return String(s).replace(/"/g, '&quot;');
  }

  async function clickSaveCreative() {
    const isVisible = (el) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const buttons = Array.from(document.querySelectorAll('button'))
      .filter(b => isVisible(b) && !b.disabled && normalizeText(b.textContent) === '저장');
    const saveBtn = buttons.find(b => !b.closest('#__gfa_helper_panel')) || buttons[0];
    if (!saveBtn) return { ok: false, error: '저장 버튼 못찾음' };
    saveBtn.scrollIntoView?.({ block: 'center', inline: 'center' });
    clickLikeUser(saveBtn);
    await sleep(300);
    return { ok: true };
  }

  // ============================================================
  // Main autofill orchestrator
  // ============================================================
  function getStartupDelay(payload) {
    const type = payload.data?.['소재타입'] || 'image-banner';
    return type === 'native-image' ? 700 : 200;
  }

  async function runAutofill(payload) {
    const d = payload.data || {};
    d.__imageBatchId = payload.imageBatchId;
    d.__imageAssetIdx = payload.imageAssetIdx;
    const type = d['소재타입'] || 'image-banner';

    // 1) Wait for form
    await waitForFormReady();

    // 2) Select 소재타입 radio (이 단계가 폼을 재렌더링)
    const sel = await selectCreativeType(type);
    if (!sel.ok) {
      console.warn('[GFA Helper] 소재타입 선택 실패:', sel.error);
      // 1초 후 1회 더 시도
      await sleep(1000);
      const sel2 = await selectCreativeType(type);
      if (!sel2.ok) {
        console.error('[GFA Helper] 라디오 최종 실패 — 자동입력 중단:', sel2.error);
        return { _typeSwitchFailed: true, _error: sel2.error };
      }
    }
    await waitForFormReady(5000);
    const formSwitched = await waitForFormSwitch(type, type === 'native-image' ? 12000 : 6000);
    if (!formSwitched) console.warn('[GFA Helper] 최종 폼 전환 확인 타임아웃:', type);
    const typeReady = await ensureCreativeTypeReady(type, type === 'native-image' ? 10000 : 6000);
    if (!typeReady.ok) {
      console.error('[GFA Helper] 소재타입 전환 미확정 — 업로드 전 중단:', typeReady.error);
      return { _typeSwitchFailed: true, _error: typeReady.error };
    }

    // 3) Fill type-specific form
    let results;
    if (type === 'native-image') {
      results = await fillNativeImage(d);
    } else {
      results = await fillImageBanner(d);
    }
    if (!formSwitched) results._formSwitchTimeout = true;
    return results;
  }

  // ============================================================
  // Last focused tracker for manual fill
  // ============================================================
  let lastFocused = null;
  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) lastFocused = t;
  }, true);
  const getTargetEl = () => {
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return a;
    if (lastFocused && document.contains(lastFocused)) return lastFocused;
    return null;
  };

  // ============================================================
  // 다이얼로그 자동 처리
  // 1. "권한이 없습니다" → 항상 자동 확인 (안전)
  // 2. "소재 타입을 변경하시겠습니까" → 우리가 라디오 클릭한 직후 5초 내만 자동 확인
  //    (사용자가 직접 작업 중 실수로 클릭한 경우 데이터 잃지 않게)
  // ============================================================
  function findDialogs() {
    return document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="Modal"], [class*="dialog"], [class*="Dialog"], [class*="popup"], [class*="Popup"]');
  }
  function findConfirmButton(dlg) {
    return Array.from(dlg.querySelectorAll('button')).find(b => /^확인$/.test((b.textContent || '').trim()));
  }

  let dismissedCount = 0;
  let lastChipRemoveAt = 0; // 칩 제거 다이얼로그 자동 처리 가드

  function tryDismissDialog(dlg) {
    const txt = (dlg.textContent || '');
    // 1) 권한 다이얼로그 — 항상 처리
    if (/권한이?\s*없습니다|계정\s*권한/.test(txt)) {
      const btn = findConfirmButton(dlg);
      if (btn) {
        btn.click();
        dismissedCount++;
        console.log('[GFA Helper] 권한 다이얼로그 닫음 #' + dismissedCount);
        return true;
      }
    }
    // 2) 소재 타입 변경 확인 — 우리 라디오 클릭 후 5초 내
    if (/소재\s*타입.*변경/.test(txt) && Date.now() - lastTypeClickAt <= 5000) {
      const btn = findConfirmButton(dlg);
      if (btn) {
        btn.click();
        dismissedCount++;
        console.log('[GFA Helper] 소재타입 변경 다이얼로그 닫음 #' + dismissedCount);
        return true;
      }
    }
    // 3) 소재 구성 유형 변경 (칩 제거 시) — 우리 칩 제거 후 5초 내
    if (/소재\s*구성\s*유형.*변경/.test(txt) && Date.now() - lastChipRemoveAt <= 5000) {
      const btn = findConfirmButton(dlg);
      if (btn) {
        btn.click();
        dismissedCount++;
        console.log('[GFA Helper] 소재 구성 유형 변경 다이얼로그 닫음 #' + dismissedCount);
        return true;
      }
    }
    return false;
  }

  function watchDialogs() {
    // 0) 이미 떠있는 다이얼로그 먼저 처리 (init 시점에 권한 다이얼로그가 이미 있을 수 있음)
    const initialDialogs = findDialogs();
    for (const dlg of initialDialogs) tryDismissDialog(dlg);

    // 1) MutationObserver — 다이얼로그 노드 추가 즉시 반응
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          const candidates = [];
          if (node.matches && node.matches('[role="dialog"], [class*="modal"], [class*="Modal"], [class*="dialog"], [class*="Dialog"], [class*="popup"], [class*="Popup"]')) {
            candidates.push(node);
          }
          if (node.querySelectorAll) {
            candidates.push(...node.querySelectorAll('[role="dialog"], [class*="modal"], [class*="Modal"], [class*="dialog"], [class*="Dialog"], [class*="popup"], [class*="Popup"]'));
          }
          for (const dlg of candidates) tryDismissDialog(dlg);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // 2) 백업 폴링 — 첫 5초는 200ms 간격 (race 잡기), 다음 30초 500ms, 이후 60초 5s
    let elapsed = 0;
    const veryFastTimer = setInterval(() => {
      const dialogs = findDialogs();
      for (const dlg of dialogs) tryDismissDialog(dlg);
      elapsed += 200;
      if (elapsed >= 5000) {
        clearInterval(veryFastTimer);
        let mid = 0;
        const midTimer = setInterval(() => {
          const dialogs = findDialogs();
          for (const dlg of dialogs) tryDismissDialog(dlg);
          mid += 500;
          if (mid >= 25000) {
            clearInterval(midTimer);
            const slowTimer = setInterval(() => {
              const dialogs = findDialogs();
              for (const dlg of dialogs) tryDismissDialog(dlg);
            }, 5000);
            setTimeout(() => clearInterval(slowTimer), 60000);
          }
        }, 500);
      }
    }, 200);
  }

  // ============================================================
  // Init
  // ============================================================
  async function init() {
    // 1) 다이얼로그 워처 가장 먼저 (이미 떠있는 것 + 새로 뜨는 것 모두 처리)
    watchDialogs();

    const payload = decodePayload();
    if (!payload) return; // no hash → just a regular page

    // 2) 다이얼로그 워처가 초기 정리할 시간 확보 (200ms 폴러 2~3 cycles)
    await sleep(800);
    const startupDelay = getStartupDelay(payload);
    if (startupDelay > 0) await sleep(startupDelay);

    const results = await runAutofill(payload);
    if (SHOW_FLOATING_PANEL) buildPanel(payload, results);
    chrome.runtime.sendMessage({
      type: 'autofillDone',
      imageBatchId: payload.imageBatchId,
      idx: payload.idx,
      ok: !results._typeSwitchFailed,
    }).catch(() => {});
  }

  // ============================================================
  // Messages from side panel
  // ============================================================
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'fillFocused') {
      const el = getTargetEl();
      if (!el) { sendResponse({ ok: false, error: '입력칸 포커스 필요' }); return; }
      try { setReactValue(el, msg.value ?? ''); flashEl(el); sendResponse({ ok: true }); }
      catch (e) { sendResponse({ ok: false, error: String(e) }); }
      return;
    }
    if (msg.type === 'ping') {
      sendResponse({ ok: true, href: location.href });
      return;
    }
    if (msg.type === 'saveCreative') {
      clickSaveCreative()
        .then(sendResponse)
        .catch(e => sendResponse({ ok: false, error: e?.message || String(e) }));
      return true;
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
