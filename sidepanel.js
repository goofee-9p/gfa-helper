// ============================================================
// Constants — 지면 프리셋 정의
// ============================================================
const PRESETS = {
  'native-group': {
    label: '네이티브 광고그룹',
    placement: '네이티브',
    // 사이즈별로 묶은 순서: 기본(1,2) → 피드형(3,4) → 스퀘어형(5,6) → 피드형(2:3)(7,8)
    rows: [
      { 혜택: '할인', sizeLabel: '기본',         suffix: '',           type: 'image-banner', imgSize: '1250×560',  ctaSlots: true  },
      { 혜택: '사은', sizeLabel: '기본',         suffix: '',           type: 'image-banner', imgSize: '1250×560',  ctaSlots: true  },
      { 혜택: '할인', sizeLabel: '피드형',       suffix: '_피드형',     type: 'native-image', imgSize: '1200×628',  ctaSlots: false },
      { 혜택: '사은', sizeLabel: '피드형',       suffix: '_피드형',     type: 'native-image', imgSize: '1200×628',  ctaSlots: false },
      { 혜택: '할인', sizeLabel: '스퀘어형',     suffix: '_스퀘어형',   type: 'native-image', imgSize: '1200×1200', ctaSlots: false },
      { 혜택: '사은', sizeLabel: '스퀘어형',     suffix: '_스퀘어형',   type: 'native-image', imgSize: '1200×1200', ctaSlots: false },
      { 혜택: '할인', sizeLabel: '피드형(2:3)', suffix: '_피드형(2:3)', type: 'native-image', imgSize: '1200×1800', ctaSlots: false },
      { 혜택: '사은', sizeLabel: '피드형(2:3)', suffix: '_피드형(2:3)', type: 'native-image', imgSize: '1200×1800', ctaSlots: false },
    ],
  },
};

// 네이티브 배너형 — 소재 유형을 배너형(모바일)+배너형(PC)로만 남기는 신규 슬롯.
// 저장 시 GFA가 소재명 뒤에 _배너형(PC) / _배너형(모바일)을 자동으로 붙이므로 suffix는 비워둔다.
const NATIVE_BANNER_ROWS = [
  { 혜택: '할인', sizeLabel: '배너형', suffix: '', type: 'native-image', imgSize: '342×228', ctaSlots: false, bannerTemplate: true },
  { 혜택: '사은', sizeLabel: '배너형', suffix: '', type: 'native-image', imgSize: '342×228', ctaSlots: false, bannerTemplate: true },
];

function getNativePreset() {
  const base = PRESETS['native-group'];
  const rows = base.rows.slice();
  if ($('includeBannerType')?.checked) rows.push(...NATIVE_BANNER_ROWS);
  return { ...base, rows };
}

const TARGET_TO_ABBREV = {
  '맞춤타겟': '맞춤타겟',
  '고객여정+알림받기타겟': '고객여정+알림받기타겟',
  '관심사+구매의도': '관심사+구매의도',
  'CRM유사타겟': 'CRM유사타겟',
  '리타겟': '리타겟',
};

const TARGET_TO_NT_KEYWORD = {
  '맞춤타겟': 'custom_image',
  '고객여정+알림받기타겟': 'notify_image',
  '관심사+구매의도': 'interest_image',
  'CRM유사타겟': 'lookalike_image',
  '리타겟': 're_image',
};

const TARGET_OPTIONS_BY_PURPOSE = {
  '트래픽': ['맞춤타겟', '고객여정+알림받기타겟', '관심사+구매의도'],
  '전환': ['CRM유사타겟', '리타겟'],
};

// 쇼핑프로모션은 전환만 + 다른 타겟셋
const SHOPPING_TARGET_OPTIONS = ['리타겟', '고객여정+알림받기타겟'];

const BANNER_COMBOS = {
  'discount1-gift1': [
    { 혜택: '할인', 번호: '1' },
    { 혜택: '사은', 번호: '1' },
  ],
  'discount1-discount2': [
    { 혜택: '할인', 번호: '1' },
    { 혜택: '할인', 번호: '2' },
  ],
  'gift1-gift2': [
    { 혜택: '사은', 번호: '1' },
    { 혜택: '사은', 번호: '2' },
  ],
};

// 쇼핑프로모션 배너 조합 (이미지 2개 → 사용자가 입력하는 페이로드는 2개,
// GFA가 PC/모바일 각각 자동 생성해서 총 4개 소재 등록됨)
const SHOPPING_BANNER_COMBOS = {
  'discount-discount': [
    { 혜택: '할인', 번호: '1' },
    { 혜택: '할인', 번호: '2' },
  ],
  'discount-gift': [
    { 혜택: '할인', 번호: '1' },
    { 혜택: '사은', 번호: '1' },
  ],
  'gift-gift': [
    { 혜택: '사은', 번호: '1' },
    { 혜택: '사은', 번호: '2' },
  ],
};

const $ = (id) => document.getElementById(id);
// 헤더에 status 표시 안 함. 에러는 alert로, 정보는 콘솔에만.
const setStatus = (msg, isErr = false) => {
  if (isErr) {
    console.warn('[GFA Helper]', msg);
    alert(msg);
  } else {
    console.log('[GFA Helper]', msg);
  }
};

// ============================================================
// State persist
// ============================================================
const STATE_KEYS = ['activeChannel', 'promoName', 'promoDate', 'promoCode', 'landingUrl', 'useNtParams',
  'urlInput', 'purpose', 'target', 'bannerCombo', 'profileName',
  'smartUrlInput', 'smartPurpose', 'smartTarget', 'smartDiscountCount', 'smartGiftCount', 'smartUspCount', 'smartHeight',
  'shoppingUrlInput', 'shoppingPurpose', 'shoppingTarget', 'shoppingBannerCombo', 'shoppingCta',
  'cta1', 'cta2', 'cta3',
  'includeBannerType', 'bannerAdCopy', 'bannerDesc1', 'bannerDesc2', 'bannerDesc3',
  'bannerLongDesc1', 'bannerLongDesc2',
  'copy'];

// 네이티브 배너형 전용 문구 — 사이드패널 입력 id ↔ 페이로드 키
const BANNER_TEXT_FIELDS = [
  { id: 'bannerAdCopy', key: '광고문구' },
  { id: 'bannerDesc1', key: '설명문구1' },
  { id: 'bannerDesc2', key: '설명문구2' },
  { id: 'bannerDesc3', key: '설명문구3' },
  { id: 'bannerLongDesc1', key: '긴설명문구1' },
  { id: 'bannerLongDesc2', key: '긴설명문구2' },
];

function getFieldValue(el) {
  return el.type === 'checkbox' ? el.checked : el.value;
}

function setFieldValue(el, value) {
  if (el.type === 'checkbox') {
    el.checked = value !== false;
  } else {
    el.value = value;
  }
}

async function saveState() {
  const data = {};
  for (const k of STATE_KEYS) {
    const el = $(k);
    if (el) data[k] = getFieldValue(el);
  }
  await chrome.storage.local.set({ gfaHelperState: data });
}
async function loadState() {
  const { gfaHelperState } = await chrome.storage.local.get(['gfaHelperState']);
  if (gfaHelperState) {
    if (gfaHelperState.promoCode === undefined && gfaHelperState.landingCode !== undefined) {
      gfaHelperState.promoCode = gfaHelperState.landingCode;
    }
    for (const k of STATE_KEYS) {
      const el = $(k);
      if (el && gfaHelperState[k] !== undefined) setFieldValue(el, gfaHelperState[k]);
    }
  }
  if (!$('promoName')?.value.trim()) $('promoName').value = '260000-00_프로모션명';
  if (!$('promoCode')?.value.trim()) $('promoCode').value = 'promotion_260000-00';
  const profileName = $('profileName');
  if (profileName) profileName.value = '지누스';
  const useNtParams = $('useNtParams');
  if (useNtParams && (!gfaHelperState || gfaHelperState.useNtParams === undefined)) useNtParams.checked = true;
  // D 카피 기본값 (비어있을 때만 채움)
  if ($('copy') && !$('copy').value.trim()) $('copy').value = buildDefaultCopy();
  // 네이티브 CTA 슬롯 기본값
  const ctaDefaults = ['지누스 6월 이벤트', '지누스가 JUNE비한 이벤트', '최대 할인 + 사은품 증정'];
  ['cta1', 'cta2', 'cta3'].forEach((k, i) => {
    if ($(k) && !$(k).value.trim()) $(k).value = ctaDefaults[i];
  });
  setActiveChannel($('activeChannel')?.value || 'native', { skipSave: true });
  updateTargetOptions('purpose', 'target');
  updateTargetOptions('smartPurpose', 'smartTarget');
  populateShoppingTarget();
  updateCharCounts();
  updatePreview();
}

// "단 일주일, 지누스가 준비한 {프로모션명} 한정 다양한 혜택을 만나보세요."
// promoName이 "260601-07_봄이벤트" 형태면 날짜 prefix 떼고 "봄이벤트"만 사용
function buildDefaultCopy() {
  const raw = ($('promoName')?.value || '').trim();
  let name = raw;
  const m = raw.match(/^\d{6}-\d{1,2}_(.+)$/);
  if (m) name = m[1].trim();
  if (!name || name === '프로모션명') name = '프로모션명';
  return `단 일주일, 지누스가 준비한 ${name} 한정 다양한 혜택을 만나보세요.`;
}

function updateImageSizeGuide(channel) {
  const el = $('imageSizeGuide');
  if (!el) return;
  if (channel === 'shopping') {
    el.textContent = '750×500 · 20KB~500KB';
  } else if (channel === 'smart') {
    el.textContent = '750×280 / 750×160';
  } else {
    // 네이티브는 슬롯마다 다른 사이즈라 헤더에는 비워둠
    el.textContent = '';
  }
}

function populateShoppingTarget() {
  const targetEl = $('shoppingTarget');
  if (!targetEl) return;
  const prev = targetEl.value;
  targetEl.innerHTML = [`<option value="">선택하기</option>`]
    .concat(SHOPPING_TARGET_OPTIONS.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`))
    .join('');
  targetEl.value = SHOPPING_TARGET_OPTIONS.includes(prev) ? prev : SHOPPING_TARGET_OPTIONS[0];
  if (!SHOPPING_TARGET_OPTIONS.includes(prev)) targetEl.value = '';
}

function updateTargetOptions(purposeId = 'purpose', targetId = 'target') {
  const purposeEl = $(purposeId);
  const targetEl = $(targetId);
  if (!purposeEl || !targetEl) return;

  const purpose = purposeEl.value || '';
  const options = purpose ? (TARGET_OPTIONS_BY_PURPOSE[purpose] || []) : [];
  const prev = targetEl.value;
  targetEl.innerHTML = [`<option value="">선택하기</option>`]
    .concat(options.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`))
    .join('');
  targetEl.value = options.includes(prev) ? prev : '';
}

function getActiveChannel() {
  return $('activeChannel')?.value || 'native';
}

function setActiveChannel(channel, { skipSave = false } = {}) {
  const next = ['native', 'smart', 'shopping'].includes(channel) ? channel : 'native';
  const prev = getActiveChannel();
  if ($('activeChannel')) $('activeChannel').value = next;
  document.body.dataset.channel = next;
  if ($('copySectionText')) {
    $('copySectionText').textContent = next === 'smart' ? 'D. 광고 안내 문구' : 'D. 공통 카피';
  }
  updateImageSizeGuide(next);
  document.querySelectorAll('.channel-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.channel === next);
  });
  document.querySelectorAll('.channel-panel').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.panel === next);
  });
  if ($('preset')) $('preset').value = next === 'native' ? 'native-group' : next === 'smart' ? 'smart-channel' : 'shopping';
  if (prev !== next && !skipSave) clearImageFiles();
  if (!skipSave) saveState();
}

// ============================================================
// Char counts
// ============================================================
function updateCharCounts() {
  document.querySelectorAll('.charcount').forEach(c => {
    const id = c.dataset.for;
    const input = $(id);
    if (!input) return;
    const v = input.value || '';
    const len = [...v].length;
    const max = parseInt(input.getAttribute('maxlength') || '0', 10) || 15;
    c.textContent = `${len}/${max}`;
    c.classList.toggle('over', len > max);
  });
}

// ============================================================
// Sojae generation
// ============================================================
function inferLandingCode(promoName) {
  const normalized = (promoName || '').toLowerCase().replace(/\s+/g, '');
  if (/june|6월|준비한6월|너를위해준비한/.test(normalized)) return 'juneevent';

  const ascii = normalized.replace(/[^a-z0-9]+/g, '');
  return ascii || 'promotion';
}

function getNtMedium(preset, purpose) {
  const placement = preset?.placement || '네이티브';
  // 주의: 'shoppinpromotion'은 네이버 실제 표기 (g 누락된 게 정상)
  const placementKey = placement === '스마트채널' ? 'smartchannel'
    : placement === '쇼핑프로모션' ? 'shoppinpromotion'
    : 'native';
  const purposeKey = purpose === '전환' ? 'conversion_pur' : 'traffic';
  return `${placementKey}_${purposeKey}`;
}

// promoName 앞부분에서 기간 패턴 추출 (예: "260413-19_봄침실세일" → "260413-19")
function extractPeriodFromPromoName(promoName) {
  const m = (promoName || '').trim().match(/(\d{6}-\d{1,2})/);
  return m ? m[1] : '';
}

// promoCode + promoDate 결합 → P_{code}_{date} 형태
function buildNtDetail(promoCode, promoName, promoDate) {
  const rawCode = (promoCode || '').trim();
  const code = rawCode || inferLandingCode(promoName);
  // 이미 코드에 기간 형태 포함된 경우 그대로
  if (/_\d{6}/.test(code)) return `P_${code}`;
  const date = (promoDate || '').trim() || extractPeriodFromPromoName(promoName);
  if (date) return `P_${code}_${date}`;
  return `P_${code}`;
}

function buildTrackedLandingUrl(baseUrl, { promoName, promoCode, promoDate, purpose, target, preset, useNtParams }) {
  const trimmed = (baseUrl || '').trim();
  if (!trimmed) return '';
  if (!useNtParams) return trimmed;

  try {
    const url = new URL(trimmed);
    url.searchParams.set('nt_source', 'gfa');
    url.searchParams.set('nt_medium', getNtMedium(preset, purpose));
    url.searchParams.set('nt_detail', buildNtDetail(promoCode, promoName, promoDate));
    url.searchParams.set('nt_keyword', TARGET_TO_NT_KEYWORD[target] || 'custom_image');
    return url.toString();
  } catch (e) {
    console.warn('[GFA Helper] 랜딩 URL 파싱 실패:', e);
    return trimmed;
  }
}

function getSmartRows() {
  const height = getSmartChannelHeight();
  const specs = [
    { benefit: '할인', count: clampCount($('smartDiscountCount')?.value) },
    { benefit: '사은', count: clampCount($('smartGiftCount')?.value) },
    { benefit: 'USP', count: clampCount($('smartUspCount')?.value) },
  ];
  const rows = [];
  specs.forEach(spec => {
    for (let i = 1; i <= spec.count; i++) {
      rows.push({
        혜택: spec.benefit,
        sizeLabel: `750×${height}`,
        suffix: `_750×${height}`,
        type: 'image-banner',
        imgSize: `750×${height}`,
        ctaSlots: false,
        smartChannel: true,
        number: String(i),
      });
    }
  });
  return rows;
}

function clampCount(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(15, n));
}

function getSmartChannelHeight() {
  const h = parseInt($('smartHeight')?.value || $('activeChannel')?.dataset.smartHeight || '280', 10);
  return h === 160 ? 160 : 280;
}

function setSmartChannelHeight(height) {
  const next = height === 160 ? 160 : 280;
  if ($('smartHeight')) $('smartHeight').value = String(next);
  if ($('activeChannel')) $('activeChannel').dataset.smartHeight = String(next);
  updateImageSizeGuide(getActiveChannel());
}

function getActiveConfig() {
  const channel = getActiveChannel();
  if (channel === 'smart') {
    const height = getSmartChannelHeight();
    return {
      channel,
      urlInputId: 'smartUrlInput',
      purpose: $('smartPurpose')?.value || '',
      target: $('smartTarget')?.value || '',
      preset: {
        label: `스마트채널 750×${height}`,
        placement: '스마트채널',
        rows: getSmartRows(),
      },
    };
  }
  if (channel === 'shopping') {
    return {
      channel,
      urlInputId: 'shoppingUrlInput',
      purpose: '전환',
      target: $('shoppingTarget')?.value || '',
      preset: {
        label: '쇼핑프로모션',
        placement: '쇼핑프로모션',
        rows: getShoppingRows(),
      },
    };
  }
  return {
    channel,
    urlInputId: 'urlInput',
    purpose: $('purpose')?.value || '',
    target: $('target')?.value || '',
    preset: getNativePreset(),
  };
}

// 쇼핑프로모션 — 사용자는 이미지 2개 입력, GFA가 PC/모바일 자동 분할해 4개 생성
// 그래서 사이드패널 슬롯은 2개로 표시 (각 슬롯이 PC+모바일 페어를 의미)
function getShoppingRows() {
  const combo = SHOPPING_BANNER_COMBOS[$('shoppingBannerCombo')?.value]
    || SHOPPING_BANNER_COMBOS['discount-discount'];
  return combo.map((spec, i) => ({
    혜택: spec.혜택,
    sizeLabel: '쇼핑프로모션',
    suffix: '',
    type: 'shopping',
    imgSize: '750×500',
    ctaSlots: false,
    shopping: true,
    number: spec.번호,
  }));
}

function buildPayloads() {
  const promoName = $('promoName').value.trim();
  const promoCode = $('promoCode').value.trim();
  const landingUrl = $('landingUrl').value.trim();
  const useNtParams = $('useNtParams')?.checked !== false;
  const { purpose, target, preset } = getActiveConfig();
  if (!preset) return [];
  const bannerCombo = BANNER_COMBOS[$('bannerCombo')?.value] || BANNER_COMBOS['discount1-discount2'];
  const namePurpose = purpose || '목적선택';
  const nameTarget = target || '타겟선택';

  const promoDate = $('promoDate')?.value || '';
  const trackedLandingUrl = buildTrackedLandingUrl(landingUrl, {
    promoName,
    promoCode,
    promoDate,
    purpose,
    target,
    preset,
    useNtParams,
  });

  const ctas = [
    { text: $('cta1').value.trim(), url: trackedLandingUrl },
    { text: $('cta2').value.trim(), url: trackedLandingUrl },
    { text: $('cta3').value.trim(), url: trackedLandingUrl },
  ].filter(c => c.text.length > 0);

  // 공통 카피 1개 — 모든 8개 소재에 동일 적용
  const commonCopy = $('copy').value.trim();

  const profileName = $('profileName').value.trim() || '지누스';

  const shoppingCta = $('shoppingCta')?.value || '더 알아보기';

  let bannerIndex = 0;
  const payloads = preset.rows.map((row, i) => {
    const nativeComboSpec = (!row.smartChannel && !row.shopping)
      ? (row.type === 'image-banner' ? bannerCombo[bannerIndex++] : bannerCombo[i % 2])
      : null;
    const benefit = nativeComboSpec?.혜택 || row.혜택;
    const number = row.number || (row.smartChannel ? String(i + 1) : (nativeComboSpec?.번호 || '1'));
    // 소재명: {프로모션명}_{목적}_{타겟}_{지면}_{혜택}_{번호}{suffix}
    const name = `${promoName}_${namePurpose}_${nameTarget}_${preset.placement}_${benefit}_${number}${row.suffix}`;
    const copy = commonCopy;
    const base = {
      소재명: name,
      소재타입: row.type,
      이미지사이즈: row.imgSize,
      지면: preset.placement,
      스마트채널: !!row.smartChannel,
      쇼핑프로모션: !!row.shopping,
      혜택: benefit,
      번호: number,
      sizeLabel: row.sizeLabel,
      목적: purpose,
      랜딩URL: trackedLandingUrl,
      프로필이름: profileName,
    };
    if (row.shopping) {
      // 쇼핑프로모션: GFA에서 "네이티브 이미지" 라디오, 칩은 PC+모바일 유지
      base['소재타입'] = 'native-image';
      base['광고문구'] = copy;
      base['행동유도'] = shoppingCta; // "더 알아보기" or "라이브 보기"
      base['쇼핑프로모션'] = true;
    } else if (row.bannerTemplate) {
      // 네이티브 배너형: 칩을 배너형(모바일)+배너형(PC)로 맞추고 전용 문구를 채움
      base['배너형'] = true;
      BANNER_TEXT_FIELDS.forEach(({ id, key }) => {
        base[key] = $(id)?.value.trim() || '';
      });
    } else if (row.type === 'image-banner') {
      base['안내문구'] = copy;
      if (row.ctaSlots) base['ctaSlots'] = ctas;
    } else {
      base['광고문구'] = copy;
    }
    return base;
  });
  return payloads;
}

// ============================================================
// Preview
// ============================================================
let lastPayloads = [];
let imageAssetsByIndex = [];
let pendingImageSlotIndex = null;

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function getImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('이미지 크기 확인 실패'));
    };
    img.src = url;
  });
}

function parseSizeLabel(label) {
  const [w, h] = String(label || '').split(/[x×]/i).map(v => parseInt(v.trim(), 10));
  return Number.isFinite(w) && Number.isFinite(h) ? { width: w, height: h } : null;
}

function getImageRule(sizeLabel) {
  const size = parseSizeLabel(sizeLabel);
  if (!size) return null;
  const key = `${size.width}x${size.height}`;
  const rules = {
    // 네이티브
    '1250x560':  { min: 50 * 1024,  max: 250 * 1024,        label: '1250×560',  range: '50KB 이상, 250KB 이하' },
    '1200x628':  { min: 50 * 1024,  max: 500 * 1024,        label: '1200×628',  range: '50KB 이상, 500KB 이하' },
    '1200x1200': { min: 80 * 1024,  max: 800 * 1024,        label: '1200×1200', range: '80KB 이상, 800KB 이하' },
    '1200x1800': { min: 100 * 1024, max: 1.2 * 1024 * 1024, label: '1200×1800', range: '100KB 이상, 1.2MB 이하' },
    // 네이티브 배너형
    '342x228':   { min: 10 * 1024,  max: 130 * 1024,        label: '342×228',   range: '10KB 이상, 130KB 이하' },
    // 쇼핑프로모션
    '750x500':   { min: 20 * 1024,  max: 500 * 1024,        label: '750×500',   range: '20KB 이상, 500KB 이하' },
  };
  return rules[key] ? { ...rules[key], ...size } : null;
}

function getRuleForSlot(slotIndex) {
  const label = lastPayloads[slotIndex]?.['이미지사이즈'];
  const rule = getImageRule(label);
  if (rule) return rule;
  // 용량 기준이 따로 없는 지면(스마트채널)은 픽셀 크기만 기준으로 삼는다
  const size = parseSizeLabel(label);
  return size ? { ...size, min: 0, max: Infinity, label: String(label), range: '' } : null;
}

// 파일명에서 혜택·번호 힌트 추출 (예: "260810_할인_2_750x280.png" → 할인 2번)
function parseFilenameHint(name) {
  const s = String(name || '').toLowerCase();
  let benefit = '';
  if (/할인|discount|sale/.test(s)) benefit = '할인';
  else if (/사은|gift/.test(s)) benefit = '사은';
  else if (/usp/.test(s)) benefit = 'USP';
  const m = s.match(/(?:할인|사은|usp|discount|gift|sale)[\s_-]*(\d{1,2})/);
  return { benefit, number: m ? String(parseInt(m[1], 10)) : '' };
}

function findAutoImageSlot(dim, usedSlots) {
  const channel = getActiveChannel();
  // 스마트채널도 드롭 순서가 아니라 픽셀 크기 + 파일명으로 슬롯을 찾는다
  if (channel !== 'native' && channel !== 'smart') return null;
  const { benefit: wantBenefit, number: wantNumber } = parseFilenameHint(findAutoImageSlot.currentFileName);

  const candidates = [];
  for (let i = 0; i < lastPayloads.length; i++) {
    if (usedSlots.has(i) || imageAssetsByIndex[i]) continue;
    const rule = getRuleForSlot(i);
    if (rule && rule.width === dim.width && rule.height === dim.height) candidates.push(i);
  }
  if (!candidates.length) return null;

  if (wantBenefit && wantNumber) {
    const exact = candidates.find(i => lastPayloads[i]?.['혜택'] === wantBenefit
      && String(lastPayloads[i]?.['번호'] || '') === wantNumber);
    if (exact !== undefined) return exact;
  }
  if (wantBenefit) {
    const byBenefit = candidates.find(i => lastPayloads[i]?.['혜택'] === wantBenefit);
    if (byBenefit !== undefined) return byBenefit;
  }
  return candidates[0];
}

async function validateImageFileForSlot(file, slotIndex, knownDim = null) {
  const payload = lastPayloads[slotIndex];
  const rule = getRuleForSlot(slotIndex);
  if (!rule || !payload) return { ok: true };

  const dim = knownDim || await getImageDimensions(file);
  if (dim.width !== rule.width || dim.height !== rule.height) {
    return {
      ok: false,
      error: `${payload['혜택']}${payload['번호']} 소재는 ${rule.label} 이미지만 넣을 수 있습니다.\n선택한 파일: ${dim.width}×${dim.height}`,
    };
  }
  if (Number.isFinite(rule.max) && (file.size < rule.min || file.size > rule.max)) {
    const kb = Math.round(file.size / 1024);
    return {
      ok: false,
      error: `${payload['혜택']}${payload['번호']} ${rule.label} 용량 기준을 벗어났습니다.\n기준: ${rule.range}\n선택한 파일: ${kb}KB`,
    };
  }
  return { ok: true };
}

function firstEmptyImageIndex() {
  const idx = imageAssetsByIndex.findIndex(asset => !asset);
  return idx >= 0 ? idx : imageAssetsByIndex.length;
}

async function setImageFiles(files, { append = true, startIndex = null } = {}) {
  const imageFiles = Array.from(files).filter(f => /^image\/(png|jpeg)$/.test(f.type));
  if (!lastPayloads.length) {
    updatePreview();
  }
  if (!lastPayloads.length) {
    alert('소재 슬롯을 먼저 만들 수 없습니다.\n네이티브/스마트채널/쇼핑프로모션 탭과 소재 개수를 확인해주세요.');
    return;
  }
  // 스마트채널은 750×280 / 750×160 중 어느 세트를 떨궜는지 파일에서 알아내 높이를 맞춰준다
  // (높이가 어긋난 채로 검사하면 멀쩡한 이미지가 전부 반려됨)
  if (getActiveChannel() === 'smart' && startIndex === null && imageFiles.length) {
    try {
      const first = await getImageDimensions(imageFiles[0]);
      if (first.width === 750 && (first.height === 160 || first.height === 280)
          && first.height !== getSmartChannelHeight()) {
        setSmartChannelHeight(first.height);
        updatePreview();
        saveState();
      }
    } catch (e) {
      console.warn('[GFA Helper] 스마트채널 높이 자동 판별 실패:', e);
    }
  }

  const baseIndex = startIndex !== null ? startIndex : (append ? imageAssetsByIndex.length : 0);
  const accepted = [];
  const rejected = [];
  const usedSlots = new Set();
  const autoMatch = startIndex === null && ['native', 'smart'].includes(getActiveChannel());
  for (let i = 0; i < imageFiles.length; i++) {
    const file = imageFiles[i];
    let dim = null;
    let slotIndex = baseIndex + i;
    if (autoMatch) {
      try {
        dim = await getImageDimensions(file);
        findAutoImageSlot.currentFileName = file.name;
        const matchedSlot = findAutoImageSlot(dim, usedSlots);
        findAutoImageSlot.currentFileName = '';
        if (matchedSlot === null) {
          rejected.push(`${file.name}\n해당 크기(${dim.width}×${dim.height})에 맞는 빈 슬롯이 없습니다.`);
          continue;
        }
        slotIndex = matchedSlot;
      } catch (e) {
        rejected.push(`${file.name}\n${e.message || e}`);
        continue;
      }
    }
    if (slotIndex >= lastPayloads.length) {
      rejected.push(`${file.name}\n생성된 소재 슬롯(${lastPayloads.length}개)을 초과했습니다.`);
      continue;
    }
    try {
      const validation = await validateImageFileForSlot(file, slotIndex, dim);
      if (!validation.ok) {
        rejected.push(`${file.name}\n${validation.error}`);
        continue;
      }
      if (!dim) dim = await getImageDimensions(file);
      accepted.push({ file, slotIndex, dim });
      usedSlots.add(slotIndex);
    } catch (e) {
      rejected.push(`${file.name}\n${e.message || e}`);
    }
  }
  if (rejected.length) {
    alert('이미지 규격이 맞지 않아 제외했습니다.\n\n' + rejected.join('\n\n'));
  }
  const newAssets = await Promise.all(accepted.map(async ({ file, slotIndex, dim }) => ({
    slotIndex,
    name: file.name,
    type: file.type || 'image/jpeg',
    width: dim?.width || null,
    height: dim?.height || null,
    bytes: file.size,
    dataUrl: await fileToDataUrl(file),
  })));
  if (!newAssets.length) return;
  const next = append ? imageAssetsByIndex.slice() : [];
  newAssets.forEach(({ slotIndex, ...asset }) => { next[slotIndex] = asset; });
  imageAssetsByIndex = next;
  updateImageMatchList();
}

function clearImageFiles() {
  imageAssetsByIndex = [];
  const input = $('imageFileInput');
  if (input) input.value = '';
  updateImageMatchList();
}

function updateImageMatchList() {
  const list = $('imageMatchList');
  if (!list) return;
  list.innerHTML = '';
  list.classList.toggle('smart-layout', getActiveChannel() === 'smart');
  if (!lastPayloads.length) {
    list.innerHTML = '<div class="hint">소재 미리보기가 생성되면 이미지 매칭이 표시됩니다.</div>';
    return;
  }
  lastPayloads.forEach((p, i) => {
    const asset = imageAssetsByIndex[i];
    const row = document.createElement('div');
    row.className = 'image-match-row' + (asset ? '' : ' missing');
    row.dataset.imgIdx = String(i);
    row.draggable = !!asset;
    const typeLabel = p['스마트채널']
      ? '스마트채널'
      : p['배너형'] ? '네이티브 배너형'
      : p['소재타입'] === 'image-banner' ? '이미지 배너' : '네이티브';
    const displaySize = p['이미지사이즈'];
    const assetMeta = asset
      ? `${asset.width && asset.height ? `${asset.width}×${asset.height}` : displaySize} · ${Math.round((asset.bytes || 0) / 1024)}KB · ${asset.name}`
      : '';
    const [w, h] = String(p['이미지사이즈'] || '').split(/[x×]/i).map(v => parseInt(v.trim(), 10));
    if (w > 0 && h > 0) row.style.setProperty('--thumb-ratio', `${w} / ${h}`);
    row.innerHTML = `
      <div class="slot-no">${i + 1}</div>
      <div class="slot-main">
        <div class="slot-title">${escapeHtml(p['혜택'])}${escapeHtml(p['번호'] || '1')} · ${escapeHtml(typeLabel)}</div>
        ${asset ? `<div class="slot-meta">${escapeHtml(assetMeta)}</div>` : ''}
      </div>
      <div class="slot-thumb">
        ${asset
          ? `<img src="${asset.dataUrl}" alt="${escapeHtml(asset.name)}"><button type="button" class="image-remove" data-idx="${i}" title="이 슬롯 비우기">×</button>`
          : `<span class="thumb-placeholder">${escapeHtml(displaySize)}</span>`
        }
      </div>
    `;
    list.appendChild(row);
  });
}

function updatePreview() {
  const list = $('previewList');
  const cnt = $('previewCount');
  const payloads = buildPayloads();
  lastPayloads = payloads;
  if (imageAssetsByIndex.length > payloads.length) {
    imageAssetsByIndex = imageAssetsByIndex.slice(0, payloads.length);
  }
  cnt.textContent = `${payloads.length}개`;
  cnt.classList.toggle('is-empty', payloads.length === 0);

  list.innerHTML = '';
  if (payloads.length === 0) {
    list.innerHTML = '<div class="preview-empty">프로모션·광고그룹 정보를 입력하세요</div>';
    $('openBatchBtn').disabled = true;
    updateImageMatchList();
    return;
  }
  payloads.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'preview-row';
    const isImageBanner = p['소재타입'] === 'image-banner';
    const isShopping = !!p['쇼핑프로모션'];
    const isBannerTemplate = !!p['배너형'];
    const hasCta = Array.isArray(p['ctaSlots']);
    const badgeLabel = isShopping ? 'SP' : p['스마트채널'] ? 'SC' : isBannerTemplate ? 'NB' : isImageBanner ? 'IB' : 'NI';
    const badgeClass = isShopping ? 'shopping' : p['스마트채널'] ? 'smart' : isBannerTemplate ? 'nativebanner' : isImageBanner ? 'banner' : 'native';
    const tooltip = isShopping ? '쇼핑프로모션 (PC+모바일 자동 분할)'
      : p['스마트채널'] ? '스마트채널 이미지'
      : isBannerTemplate ? '네이티브 배너형 (모바일+PC, 소재명 접미사 GFA 자동 부착)'
      : isImageBanner ? (hasCta ? '이미지 배너 + CTA 슬롯' : '이미지 배너')
      : '네이티브 이미지 (CTA 기본값 유지)';
    row.innerHTML = `
      <span class="type-badge ${badgeClass}" title="${tooltip}">${badgeLabel}${hasCta ? '+' : ''}</span>
      <span class="name">${escapeHtml(p['소재명'])}${isBannerTemplate ? '<em class="auto-suffix">_배너형(PC)/(모바일)</em>' : ''}</span>
      <span class="size">${escapeHtml(p['이미지사이즈'])}</span>
    `;
    list.appendChild(row);
  });
  // Enable button if URL captured + ≥1 row
  const cfg = getActiveConfig();
  const url = cfg.urlInputId ? ($(cfg.urlInputId)?.value || '').trim() : '';
  $('openBatchBtn').disabled = !url || payloads.length === 0;
  updateImageMatchList();
}

function getSelectedPayloadsWithAssets() {
  const items = [];
  const imageAssets = [];
  lastPayloads.forEach((payload, idx) => {
    items.push(payload);
    imageAssets.push(imageAssetsByIndex[idx] || null);
  });
  return { items, imageAssets };
}

// Set 직후 타겟만 비운다.
// 같은 이미지·URL·목적으로 타겟만 갈아끼우며 반복하는 흐름이라 이미지는 그대로 둔다.
// (타겟이 비면 "소재 Set" 버튼이 타겟 선택을 요구하므로 이전 타겟으로 잘못 도는 사고는 계속 막힌다)
function clearCurrentGroupFieldsAfterSet() {
  const channel = getActiveChannel();
  const targetId = channel === 'smart' ? 'smartTarget' : channel === 'shopping' ? 'shoppingTarget' : 'target';
  if ($(targetId)) $(targetId).value = '';
  updatePreview();
  saveState();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// ============================================================
// URL 캡처
// ============================================================
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function captureGfaUrlTo(inputId) {
  const tab = await getActiveTab();
  if (!tab || !tab.url) { setStatus('활성 탭 없음', true); return; }
  if (!(tab.url.startsWith('https://ads.naver.com/') || tab.url.startsWith('https://gfa.naver.com/'))) {
    setStatus('네이버 광고 관리자 탭에서 다시 시도하세요.', true);
    return;
  }
  const clean = tab.url.split('#')[0];
  $(inputId).value = clean;
  await saveState();
  updatePreview();
  setStatus('URL 캡처 완료');
}

$('captureUrlBtn')?.addEventListener('click', () => captureGfaUrlTo('urlInput'));
$('smartCaptureUrlBtn')?.addEventListener('click', () => captureGfaUrlTo('smartUrlInput'));
$('shoppingCaptureUrlBtn')?.addEventListener('click', () => captureGfaUrlTo('shoppingUrlInput'));

// ============================================================
// 일괄 탭 열기
// ============================================================
$('openBatchBtn').addEventListener('click', async () => {
  const cfg = getActiveConfig();
  const urlTemplate = cfg.urlInputId ? ($(cfg.urlInputId)?.value || '').trim() : '';
  if (!urlTemplate) { setStatus('URL을 먼저 캡처하세요.', true); return; }
  if (!cfg.purpose || !cfg.target) { setStatus('목적과 타겟을 선택하세요.', true); return; }
  const { items, imageAssets } = getSelectedPayloadsWithAssets();
  if (items.length === 0) { setStatus('체크된 소재가 없음.', true); return; }

  if (items.length > 12) {
    if (!confirm(`${items.length}개 탭을 한번에 엽니다. 진행할까요?`)) return;
  }

  if ($('batchStatus')) {
    $('batchStatus').textContent = '탭 여는 중…';
    $('batchStatus').classList.remove('done');
  }
  const res = await chrome.runtime.sendMessage({ type: 'openBatch', urlTemplate, items, imageAssets });
  if (res && res.ok) {
    clearCurrentGroupFieldsAfterSet();
    setStatus(`${res.count}개 탭 열림. 탭이 순서대로 자동 전환되며 입력됩니다.`);
  } else {
    if ($('batchStatus')) $('batchStatus').textContent = '';
    setStatus('탭 열기 실패', true);
  }
});

// 백그라운드가 탭을 순서대로 활성화하며 자동입력을 돌린다 — 그 진행 상황 표시
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== 'batchProgress') return;
  const el = $('batchStatus');
  if (!el) return;
  if (msg.done) {
    el.textContent = `자동입력 완료 — ${msg.total}개. 확인 후 "열린 소재 저장"`;
    el.classList.add('done');
  } else {
    el.textContent = `자동입력 진행 중… ${msg.finished + 1} / ${msg.total}`;
    el.classList.remove('done');
  }
});

$('saveOpenedBtn')?.addEventListener('click', async () => {
  if (!confirm('자동 세팅으로 열린 소재 탭의 저장 버튼을 모두 누를까요?')) return;
  await runSaveOpened(false);
});

async function runSaveOpened(force) {
  setStatus('열린 소재 탭 저장 중...');
  try {
    const res = await chrome.runtime.sendMessage({ type: 'saveOpenedMaterials', force });
    if (!res?.ok) {
      setStatus('열린 소재 저장 실패', true);
      return;
    }
    if (res.pending > 0) {
      alert(`아직 ${res.pending}개 소재 탭이 열리는 중입니다.\n다 열린 뒤 "열린 소재 저장"을 한 번 더 눌러주세요.`);
    }
    if (res.failed > 0) {
      // 자동입력이 덜 된 탭은 저장하지 않고 사유를 돌려준다
      const reasons = (res.results || [])
        .filter(r => !r.ok)
        .map((r, i) => `${i + 1}. ${r.error || '알 수 없는 오류'}`)
        .join('\n');
      const retry = confirm(
        `성공 ${res.saved}개 / 저장 안 함 ${res.failed}개\n\n${reasons}\n\n` +
        `해당 탭은 저장하지 않았습니다.\n탭에서 직접 확인해 고치는 걸 권장합니다.\n\n` +
        `그래도 이대로 저장할까요?`
      );
      if (retry) await runSaveOpened(true);
      return;
    }
    setStatus(`저장 실행: 성공 ${res.saved}개 / 실패 ${res.failed}개`);
  } catch (e) {
    setStatus(`열린 소재 저장 실패: ${e.message || e}`, true);
  }
}

// ============================================================
// Copy native to banner buttons
// ============================================================
document.querySelectorAll('.copy-same').forEach(btn => {
  btn.addEventListener('click', () => {
    const from = $(btn.dataset.from);
    const to = $(btn.dataset.to);
    if (from && to) {
      to.value = from.value;
      saveState();
      updatePreview();
    }
  });
});

// ============================================================
// Image drop / select
// ============================================================
$('chooseImagesBtn')?.addEventListener('click', () => $('imageFileInput')?.click());
$('imageFileInput')?.addEventListener('change', async (e) => {
  const startIndex = pendingImageSlotIndex;
  await setImageFiles(e.target.files || [], { startIndex });
  pendingImageSlotIndex = null;
  e.target.value = '';
  setStatus(`${imageAssetsByIndex.length}개 이미지 불러옴`);
});
$('clearImagesBtn')?.addEventListener('click', () => {
  clearImageFiles();
  setStatus('이미지 세트 초기화 완료');
});

async function importSmartEditorImages(height) {
  if (getActiveChannel() !== 'smart') {
    setStatus('스마트채널 탭에서 다시 시도하세요.', true);
    return;
  }
  setSmartChannelHeight(height);
  updatePreview();
  setStatus(`스마트채널 에디터에서 750×${height} 이미지 가져오는 중...`);
  try {
    const res = await chrome.runtime.sendMessage({ type: 'importSmartEditor', height });
    if (!res?.ok) {
      setStatus(res?.error || '스마트채널 에디터 가져오기 실패', true);
      return;
    }
    imageAssetsByIndex = (res.assets || []).slice(0, lastPayloads.length || 9);
    updateImageMatchList();
    setStatus(`에디터에서 ${imageAssetsByIndex.length}개 이미지 가져옴`);
  } catch (e) {
    setStatus(`가져오기 실패: ${e.message || e}`, true);
  }
}

$('importSmart280Btn')?.addEventListener('click', () => importSmartEditorImages(280));
$('importSmart160Btn')?.addEventListener('click', () => importSmartEditorImages(160));

const imageDropZone = $('imageDropZone');
if (imageDropZone) {
  imageDropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    imageDropZone.classList.add('dragover');
  });
  imageDropZone.addEventListener('dragleave', () => imageDropZone.classList.remove('dragover'));
  imageDropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    imageDropZone.classList.remove('dragover');
    await setImageFiles(e.dataTransfer.files || [], { startIndex: null });
    setStatus(`${imageAssetsByIndex.length}개 이미지 불러옴`);
  });
}

$('imageMatchList')?.addEventListener('click', (e) => {
  // X 버튼 클릭 → 그 슬롯만 비우기 (파일 선택기 안 띄움)
  const removeBtn = e.target.closest('.image-remove');
  if (removeBtn) {
    e.stopPropagation();
    e.preventDefault();
    const idx = parseInt(removeBtn.dataset.idx, 10);
    if (Number.isFinite(idx)) {
      imageAssetsByIndex[idx] = null;
      updateImageMatchList();
    }
    return;
  }
  const row = e.target.closest('.image-match-row');
  if (!row) return;
  pendingImageSlotIndex = parseInt(row.dataset.imgIdx, 10);
  $('imageFileInput')?.click();
});

$('imageMatchList')?.addEventListener('dragover', (e) => {
  const row = e.target.closest('.image-match-row');
  if (!row) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = e.dataTransfer.types.includes('application/x-gfa-image-slot') ? 'move' : 'copy';
  row.classList.add('dragover');
});

$('imageMatchList')?.addEventListener('dragleave', (e) => {
  const row = e.target.closest('.image-match-row');
  if (row) row.classList.remove('dragover');
});

$('imageMatchList')?.addEventListener('drop', async (e) => {
  const row = e.target.closest('.image-match-row');
  if (!row) return;
  e.preventDefault();
  row.classList.remove('dragover');
  const startIndex = parseInt(row.dataset.imgIdx, 10);
  const fromIndexRaw = e.dataTransfer.getData('application/x-gfa-image-slot');
  if (fromIndexRaw !== '') {
    const fromIndex = parseInt(fromIndexRaw, 10);
    if (Number.isFinite(fromIndex) && Number.isFinite(startIndex) && fromIndex !== startIndex) {
      const next = imageAssetsByIndex.slice();
      [next[fromIndex], next[startIndex]] = [next[startIndex], next[fromIndex]];
      imageAssetsByIndex = next;
      updateImageMatchList();
      setStatus('이미지 슬롯 순서 변경 완료');
    }
    return;
  }
  await setImageFiles(e.dataTransfer.files || [], { startIndex });
  setStatus(`${imageAssetsByIndex.length}개 이미지 불러옴`);
});

$('imageMatchList')?.addEventListener('dragstart', (e) => {
  const row = e.target.closest('.image-match-row');
  if (!row) return;
  const idx = parseInt(row.dataset.imgIdx, 10);
  if (!Number.isFinite(idx) || !imageAssetsByIndex[idx]) {
    e.preventDefault();
    return;
  }
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('application/x-gfa-image-slot', String(idx));
  e.dataTransfer.setData('text/plain', String(idx));
  row.classList.add('dragging');
});

$('imageMatchList')?.addEventListener('dragend', () => {
  document.querySelectorAll('.image-match-row.dragging, .image-match-row.dragover').forEach(row => {
    row.classList.remove('dragging', 'dragover');
  });
});

// ============================================================
// 섹션별 초기화 버튼
// ============================================================
function resetSection(section) {
  const channel = getActiveChannel();
  if (section === 'a') {
    $('promoName').value = '260000-00_프로모션명';
    $('promoCode').value = 'promotion_260000-00';
    $('landingUrl').value = '';
    if ($('useNtParams')) $('useNtParams').checked = true;
  } else if (section === 'b') {
    if (channel === 'native') {
      $('urlInput').value = '';
      $('purpose').value = '';
      updateTargetOptions('purpose', 'target');
      if ($('bannerCombo')) $('bannerCombo').value = 'discount1-discount2';
    } else if (channel === 'smart') {
      $('smartUrlInput').value = '';
      $('smartPurpose').value = '';
      updateTargetOptions('smartPurpose', 'smartTarget');
    } else if (channel === 'shopping') {
      $('shoppingUrlInput').value = '';
      if ($('shoppingTarget')) $('shoppingTarget').value = '';
      if ($('shoppingBannerCombo')) $('shoppingBannerCombo').value = 'discount-discount';
    }
  } else if (section === 'c') {
    if (channel === 'native') {
      $('cta1').value = '지누스 6월 이벤트';
      $('cta2').value = '지누스가 JUNE비한 이벤트';
      $('cta3').value = '최대 할인 + 사은품 증정';
    } else if (channel === 'smart') {
      $('smartDiscountCount').value = '3';
      $('smartGiftCount').value = '3';
      $('smartUspCount').value = '3';
    } else if (channel === 'shopping') {
      if ($('shoppingCta')) $('shoppingCta').value = '더 알아보기';
    }
  } else if (section === 'c2') {
    if ($('includeBannerType')) $('includeBannerType').checked = true;
    BANNER_TEXT_FIELDS.forEach(({ id }) => { if ($(id)) $(id).value = ''; });
  } else if (section === 'd') {
    $('copy').value = buildDefaultCopy();
  }
  updateCharCounts();
  updatePreview();
  saveState();
  const labels = { a: 'A', b: 'B', c: 'C', c2: 'C-2', d: 'D' };
  setStatus(`${labels[section]} 섹션 기본값으로 초기화됨`);
}

document.querySelectorAll('.step-reset').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const section = btn.dataset.reset;
    if (section) resetSection(section);
  });
});

// ============================================================
// Wire up all inputs → save state + update preview
// ============================================================
document.querySelectorAll('.channel-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    setActiveChannel(btn.dataset.channel);
    updatePreview();
  });
});

STATE_KEYS.forEach(k => {
  const el = $(k);
  if (!el) return;
  const eventName = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
  el.addEventListener(eventName, () => {
    if (k === 'purpose') updateTargetOptions('purpose', 'target');
    if (k === 'smartPurpose') updateTargetOptions('smartPurpose', 'smartTarget');
    updateCharCounts();
    updatePreview();
    saveState();
  });
});

// ============================================================
// Init
// ============================================================
(async function init() {
  await loadState();
})();
