/* ═══════════════════════════════════════════
   자동 마진 계산기 대시보드 — 메인 앱 로직
   ═══════════════════════════════════════════ */

function pfSvg(letter, color) {
  return `<svg viewBox="0 0 32 32" width="20" height="20"><rect rx="6" width="32" height="32" fill="${color}"/><text x="16" y="22" text-anchor="middle" fill="#fff" font-size="18" font-weight="700" font-family="var(--font)">${letter}</text></svg>`;
}
const PLATFORMS = {
  bm: { name: '배민', icon: pfSvg('배','#2AC1BC'), color: '#30d158' },
  cp: { name: '쿠팡이츠', icon: pfSvg('쿠','#FF2F6E'), color: '#ff453a' },
  tg: { name: '땡겨요', icon: pfSvg('땡','#FF5722'), color: '#2D9E6B' },
  yg: { name: '요기요', icon: pfSvg('요','#FA0050'), color: '#E5302A' },
  ts: { name: '가게', icon: pfSvg('T','#1B64DA'), color: '#6366f1' },
  nv: { name: '네이버', icon: pfSvg('N','#03C75A'), color: '#03C75A' },
  di: { name: '두잇', icon: pfSvg('D','#FF6B35'), color: '#FF6B35' }
};
const PF_LIST = ['bm','cp','tg','yg','ts','nv','di'];
let selectedMonths = [];
let selectedPlatform = 'all';

/* ═══ FORMATTING ═══ */
function fmt(n) { return n == null || isNaN(n) ? '-' : Math.round(n).toLocaleString('ko-KR'); }
function fmtW(n) { if (n == null || isNaN(n)) return '-'; return Math.abs(n) >= 10000 ? (n/10000).toFixed(1)+'만' : fmt(n); }
function fmtPct(n) { return n == null || isNaN(n) ? '-' : n.toFixed(1)+'%'; }

/* ═══ LOGIN ═══ */
function doLogin() { attemptLogin(); }

function showApp() {
  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('loadingScreen').style.display = 'flex';
  initApp();
}

let _loadingCurrent = 0;
let _loadingAnim = null;

function setLoading(pct, text, sub) {
  if (_loadingAnim) { clearInterval(_loadingAnim); _loadingAnim = null; }
  _loadingCurrent = pct;
  _applyLoading(pct);
  if (text) document.getElementById('loadingText').textContent = text;
  if (sub) document.getElementById('loadingSub').textContent = sub;
}

function _applyLoading(pct) {
  const ring = document.getElementById('loadingRing');
  const circ = 2 * Math.PI * 48;
  if (ring) ring.setAttribute('stroke-dashoffset', circ - (circ * pct / 100));
  const pctEl = document.getElementById('loadingPct');
  if (pctEl) pctEl.textContent = Math.round(pct) + '%';
}

// 목표치까지 부드럽게 올라가는 애니메이션 (await 가능)
function animateLoading(target, text, sub) {
  if (_loadingAnim) { clearInterval(_loadingAnim); _loadingAnim = null; }
  if (text) document.getElementById('loadingText').textContent = text;
  if (sub) document.getElementById('loadingSub').textContent = sub;
  return new Promise(resolve => {
    _loadingAnim = setInterval(() => {
      if (_loadingCurrent < target) {
        _loadingCurrent += 0.5;
        _applyLoading(Math.min(_loadingCurrent, target));
      } else {
        clearInterval(_loadingAnim); _loadingAnim = null;
        resolve();
      }
    }, 50);
  });
}

function hideLoading() {
  const ring = document.querySelector('.loading-ring');
  if (ring) ring.classList.add('done');
  setLoading(100, '완료!', '');
  setTimeout(() => {
    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('mainNav').style.display = 'flex';
    document.getElementById('appContainer').style.display = 'block';
    if (window.innerWidth <= 768) document.getElementById('mobileNav').style.display = 'block';
  }, 500);
}

async function initApp() {
  setLoading(5, '설정 불러오는 중...', '로컬 설정을 복원합니다');
  loadSettings();
  try { applySettingsToUI(); } catch(e) {}
  setLoading(10, '설정 완료', '');

  // Supabase 로드 중 30→65까지 부드럽게 올라감
  const loadingPromise = animateLoading(65, '데이터 불러오는 중...', 'Supabase에서 매출 데이터를 복원합니다');
  try { await loadFromSupabase(); } catch(e) { console.warn('Supabase 로드:', e.message); }
  // 로드 완료 → 애니메이션 중단하고 70으로
  if (_loadingAnim) { clearInterval(_loadingAnim); _loadingAnim = null; }
  setLoading(70, '데이터 처리 중...', '수수료 모드를 적용합니다');
  try { if (typeof applyFeeModes === 'function') applyFeeModes(); } catch(e) {}

  setLoading(80, '화면 준비 중...', '대시보드를 렌더링합니다');
  initFeeToggleUI();
  try { renderMenuCost(); updateSimulatorMenu(); } catch(e) {}
  setLoading(85);
  renderFileList();
  setLoading(90);
  updateBEP();
  setLoading(95);
  refreshAll();

  hideLoading();
}

/* ═══ 수수료 모드 글로벌 토글 ═══ */
function toggleGlobalFeeMode(isManual) {
  const mode = isManual ? 'manual' : 'db';
  const text = document.getElementById('feeModeText');
  if (text) text.textContent = isManual ? '직접입력' : 'DB평균';

  ['bm','cp','tg','yg'].forEach(pf => {
    if (typeof setFeeMode === 'function') setFeeMode(pf, mode);
    else S['feeMode_'+pf] = mode;
  });

  localStorage.setItem('bbalgan_v2', JSON.stringify(S));
  refreshAll();
}

function initFeeToggleUI() {
  const toggle = document.getElementById('globalFeeToggle');
  const text = document.getElementById('feeModeText');
  if (!toggle) return;
  // 현재 모드 확인 (하나라도 manual이면 manual)
  const isManual = ['bm','cp','tg','yg'].some(pf => S['feeMode_'+pf] === 'manual');
  toggle.checked = isManual;
  if (text) text.textContent = isManual ? '직접입력' : 'DB평균';
}

/* ═══ render.js/drive.js 오버라이드 ═══ */
window.renderAll = function() { renderFileList(); refreshAll(); };
window.updateFileList = function() { renderFileList(); };
window.updateUploadUI = function() {};
window.updateHeaderPeriod = function() {};

/* ═══ TAB NAVIGATION ═══ */
function switchTab(tab) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.mobile-nav-item').forEach(t => t.classList.remove('active'));
  document.getElementById('page-' + tab)?.classList.add('active');
  document.querySelectorAll(`[data-tab="${tab}"]`).forEach(t => t.classList.add('active'));
  if (tab === 'dashboard') refreshDashboard();
  if (tab === 'diagnosis') refreshDiagnosis();
  if (tab === 'settings') { loadSettings(); applySettingsToUI(); updateBEP(); }
}

function toggleMobileNav() {
  const nav = document.getElementById('mobileNav');
  nav.style.display = nav.style.display === 'block' ? 'none' : 'block';
}

/* ═══ FILE HANDLING ═══ */
function handleFiles(files) {
  // 플랫폼별로 그룹핑하여 한번에 전달
  const groups = {};
  Array.from(files).forEach(file => {
    const fn = file.name;
    let pf = null;
    if (/매출리포트/.test(fn)) pf = 'ts';
    else if (/매출상세내역|매입상세내역|배민/.test(fn)) pf = 'bm';
    else if (/coupang|쿠팡/.test(fn)) pf = 'cp';
    else if (/땡겨요|정산내역/.test(fn)) pf = 'tg';
    else if (/요기요/.test(fn)) pf = 'yg';
    if (!pf) { toastCenter(`"${fn}" — 플랫폼을 인식할 수 없습니다.`); return; }
    if (!groups[pf]) groups[pf] = [];
    groups[pf].push(file);
  });
  Object.entries(groups).forEach(([pf, fileList]) => {
    loadXlsx2(fileList, pf);
  });
}

function renderFileList() {
  const container = document.getElementById('fileListContainer');
  if (!container) return;

  // 플랫폼별 그룹핑
  const groups = {};
  PF_LIST.forEach(pf => {
    const files = (FILES[pf]||[]).map(f => ({ ...f, pf }));
    if (files.length) groups[pf] = files.sort((a,b) => a.key.localeCompare(b.key));
  });

  if (!Object.keys(groups).length) { container.innerHTML = ''; return; }

  container.innerHTML = Object.entries(groups).map(([pf, files]) => {
    const p = PLATFORMS[pf];
    const SHOW = 3;
    const hasMore = files.length > SHOW;
    const fileItems = files.map((f, i) => {
      const tag = (f.key.includes('purchase') || (f.period && f.period.includes('매입')) || (f.filename && /매입/.test(f.filename)))
        ? '<span class="file-tag purchase">매입</span>'
        : '<span class="file-tag sales">매출</span>';
      return `<div class="file-item" ${i >= SHOW ? 'style="display:none;" data-extra="'+pf+'"' : ''}>
        <div class="file-icon ${pf}">${p.icon || ''}</div>
        <div class="file-info">
          <div class="file-name">${f.filename}</div>
          <div class="file-meta"><span>${p.name}</span><span>${f.period}</span>${tag}</div>
        </div>
        <button class="file-delete" onclick="removeFile('${f.pf}','${f.key}')">✕</button>
      </div>`;
    }).join('');

    const moreBtn = hasMore
      ? `<button class="btn-more" id="more-${pf}" onclick="toggleFileMore('${pf}')">${files.length - SHOW}개 더보기 ▼</button>`
      : '';

    return `<div class="file-group">
      <div class="file-group-header">${p.icon || ''} <span>${p.name}</span><span class="file-group-count">${files.length}개</span></div>
      ${fileItems}${moreBtn}
      <button class="btn-clear-pf" onclick="clearPlatformData('${pf}')">🗑️ 전체 삭제</button>
    </div>`;
  }).join('');
}

function toggleFileMore(pf) {
  const extras = document.querySelectorAll(`[data-extra="${pf}"]`);
  const btn = document.getElementById('more-' + pf);
  const visible = extras[0]?.style.display !== 'none';
  extras.forEach(el => el.style.display = visible ? 'none' : 'flex');
  if (btn) btn.textContent = visible ? `${extras.length}개 더보기 ▼` : '접기 ▲';
}

async function clearAllData() {
  if (!confirm('모든 데이터를 삭제하시겠습니까?')) return;
  await clearAll();
  renderFileList();
  refreshAll();
}

async function clearPlatformData(pf) {
  const p = PLATFORMS[pf];
  if (!confirm(`${p.name}의 모든 데이터를 삭제하시겠습니까?`)) return;

  // DB에서 해당 플랫폼 데이터 삭제
  const keys = Object.keys(DB[pf]);
  const purchaseKeys = (FILES[pf]||[]).filter(f => f.key.includes('purchase')).map(f => f.key);
  const allKeys = [...new Set([...keys, ...purchaseKeys])];

  for (const key of allKeys) {
    await deleteFromSupabase(pf, key).catch(e => console.warn(e));
  }

  // 로컬 메모리 삭제
  Object.keys(DB[pf]).forEach(k => delete DB[pf][k]);
  FILES[pf] = [];

  toast(`${p.name} 데이터가 삭제되었습니다.`);
  updateUploadUI(pf);
  renderFileList();
  refreshAll();
}

/* ═══ DATA AGGREGATION ═══ */
function getAllMonths() { return allMonths(); }

function getFilteredData() {
  const months = selectedMonths.length > 0 ? selectedMonths : getAllMonths().slice(0, 1);
  const platforms = selectedPlatform === 'all' ? PF_LIST : [selectedPlatform];
  let tR=0, tOrd=0, tFee=0, tDel=0, tCpn=0, tAd=0;
  const dailyAll = {};
  const platformSummary = {};

  platforms.forEach(p => {
    platformSummary[p] = { totalRev:0, orders:0, fee:0, delivery:0, coupon:0, ad:0,
      broker:0, pgFee:0, delFee:0, adSupply:0, adVat:0,
      shopCoupon:0, instantDel:0, instantFood:0, vat:0, instantDisc:0 };
    months.forEach(m => {
      const d = DB[p]?.[m]; if (!d) return;
      platformSummary[p].totalRev += d.totalRev||0;
      platformSummary[p].orders += d.orders||0;
      platformSummary[p].fee += d.fee||0;
      platformSummary[p].delivery += d.delivery||0;
      platformSummary[p].coupon += d.coupon||0;
      platformSummary[p].ad += d.ad||0;
      // 개별 항목
      platformSummary[p].broker += d.broker||0;
      platformSummary[p].pgFee += d.pgFee||0;
      platformSummary[p].delFee += d.delFee||0;
      platformSummary[p].adSupply += d.adSupply||0;
      platformSummary[p].adVat += d.adVat||0;
      platformSummary[p].shopCoupon += d.shopCoupon||0;
      platformSummary[p].instantDel += d.instantDel||0;
      platformSummary[p].instantFood += d.instantFood||0;
      platformSummary[p].vat += d.vat||0;
      platformSummary[p].instantDisc += d.instantDisc||0;
      platformSummary[p].settleAN = (platformSummary[p].settleAN||0) + (d.settleAN||0);
      platformSummary[p].promo = (platformSummary[p].promo||0) + (d.promo||0);
      platformSummary[p].refund = (platformSummary[p].refund||0) + (d.refund||0);
      platformSummary[p].finalSettle = (platformSummary[p].settleAN||0) + (platformSummary[p].promo||0) + (platformSummary[p].refund||0);
      tR += d.totalRev||0; tOrd += d.orders||0; tFee += d.fee||0; tDel += d.delivery||0; tCpn += d.coupon||0; tAd += d.ad||0;
      if (d.daily) Object.entries(d.daily).forEach(([day, dd]) => {
        if (!dailyAll[day]) dailyAll[day] = {};
        if (!dailyAll[day][p]) dailyAll[day][p] = { rev:0, orders:0 };
        dailyAll[day][p].rev += dd.rev||0; dailyAll[day][p].orders += dd.orders||0;
      });
    });
  });

  const totalDeductions = tFee + tDel + tCpn + tAd;
  const matCost = tR * (S.cogs / 100);
  const fixedCosts = fixedCost() * months.length;
  const netProfit = tR - matCost - totalDeductions - fixedCosts;
  const deposit = tR - totalDeductions;
  const marginRate = tR > 0 ? (netProfit / tR * 100) : 0;
  const hourly = netProfit / (26 * 10 * Math.max(1, months.length));
  const perOrder = tOrd > 0 ? netProfit / tOrd : 0;

  return { totalRev:tR, totalOrders:tOrd, totalFee:tFee, totalDelivery:tDel, totalCoupon:tCpn, totalAd:tAd, totalDeductions, matCost, fixedCosts, netProfit, deposit, marginRate, hourly, perOrder, dailyAll, platformSummary, months };
}

/* ═══ DASHBOARD ═══ */
function refreshDashboard() {
  const am = getAllMonths();
  const hasData = am.length > 0;
  document.getElementById('dashboardEmpty').style.display = hasData ? 'none' : 'block';
  if (!hasData) return;
  if (selectedMonths.length === 0) selectedMonths = [am[0]];

  document.getElementById('monthPills').innerHTML = am.map(m => {
    const [y,mo] = m.split('-');
    return `<button class="pill ${selectedMonths.includes(m)?'active':''}" onclick="toggleMonth('${m}')">${y}년 ${parseInt(mo)}월</button>`;
  }).join('');

  const data = getFilteredData();
  [() => updateKPIs(data),
   () => updateDiagnosisBanner(data),
   () => updateStoreVsDelivery(data),
   () => updateRevDonut(data),
   () => updateDailyChart(data),
   () => updateMonthlyTrend(),
   () => updatePlatformGrid(data),
   () => updateServiceTable(data),
   () => updateCalendar(data),
   () => updateMonthlySummary(),
  ].forEach(fn => { try { fn(); } catch(e) { console.warn('Dashboard:', e.message); } });
}

function toggleMonth(m) {
  const idx = selectedMonths.indexOf(m);
  if (idx >= 0) { if (selectedMonths.length > 1) selectedMonths.splice(idx, 1); }
  else selectedMonths.push(m);
  refreshDashboard();
}

function togglePlatform(p) {
  selectedPlatform = p;
  document.querySelectorAll('#platformPills .pill').forEach(btn => btn.classList.toggle('active', btn.dataset.p === p));
  refreshDashboard();
}

function updateKPIs(data) {
  document.getElementById('kpiRevenue').textContent = fmtW(data.totalRev) + '원';
  document.getElementById('kpiProfit').textContent = fmtW(data.netProfit) + '원';
  document.getElementById('kpiProfit').style.color = data.netProfit >= 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('kpiProfitSub').textContent = `마진율 ${fmtPct(data.marginRate)}`;
  document.getElementById('kpiProfitSub').className = `kpi-sub ${data.marginRate >= 15 ? 'up' : 'down'}`;
  document.getElementById('kpiHourly').textContent = fmt(Math.round(data.hourly)) + '원';
  document.getElementById('kpiHourly').style.color = data.hourly >= 9860 ? 'var(--green)' : data.hourly >= 7000 ? 'var(--orange)' : 'var(--red)';
  document.getElementById('kpiDeposit').textContent = fmtW(data.deposit) + '원';
  document.getElementById('kpiDeduction').textContent = fmtW(data.totalDeductions) + '원';
  document.getElementById('kpiDeduction').style.color = 'var(--red)';
  document.getElementById('kpiDedSub').textContent = `매출 대비 ${fmtPct(data.totalRev > 0 ? data.totalDeductions/data.totalRev*100 : 0)}`;
  document.getElementById('kpiPerOrder').textContent = fmt(Math.round(data.perOrder)) + '원';
  document.getElementById('kpiPerSub').textContent = `주문 ${fmt(data.totalOrders)}건`;
}

function updateDiagnosisBanner(data) {
  const alerts = [];
  if (data.marginRate < 10) alerts.push({ type:'danger', text:`⚠️ 마진율 ${fmtPct(data.marginRate)} — 심각하게 낮습니다!` });
  else if (data.marginRate < 20) alerts.push({ type:'warning', text:`⚡ 마진율 ${fmtPct(data.marginRate)} — 개선이 필요합니다.` });
  if (data.hourly < 9860) alerts.push({ type:'warning', text:`💰 시급 ${fmt(Math.round(data.hourly))}원 — 최저시급(9,860원) 미만입니다.` });
  if (data.netProfit < 0) alerts.push({ type:'danger', text:`🚨 순수익 적자 ${fmtW(data.netProfit)}원 — 즉시 원인 분석 필요!` });
  if (!alerts.length) alerts.push({ type:'success', text:'✅ 전체적으로 양호합니다.' });
  document.getElementById('diagnosisBanner').innerHTML = alerts.map(a => `<div class="alert alert-${a.type}" onclick="switchTab('diagnosis')">${a.text}</div>`).join('');
}

function updateDailyChart(data) {
  const chart = document.getElementById('dailyChart');
  const days = Object.keys(data.dailyAll).sort();
  if (!days.length) { chart.innerHTML = '<div class="empty-state" style="padding:20px;"><div class="empty-desc">일별 데이터가 없습니다</div></div>'; return; }
  const maxRev = Math.max(...days.map(d => Object.values(data.dailyAll[d]).reduce((s,v) => s + v.rev, 0)), 1);
  // 년월 구간 파악
  let lastYM = '';
  const ymRanges = []; // {label, startIdx, endIdx}
  days.forEach((d, i) => {
    const [yr, mm] = d.split('-');
    const ym = yr + '-' + mm;
    if (ym !== lastYM) {
      ymRanges.push({ label: `${yr}년 ${parseInt(mm)}월`, startIdx: i, endIdx: i });
      lastYM = ym;
    } else {
      ymRanges[ymRanges.length - 1].endIdx = i;
    }
  });

  chart.innerHTML = days.map((d, i) => {
    const dayData = data.dailyAll[d];
    const segs = PF_LIST.map(p => dayData[p] ? `<div class="bar-segment ${p}" style="height:${Math.max(0,(dayData[p].rev/maxRev)*180)}px;" title="${PLATFORMS[p].name}: ${fmt(dayData[p].rev)}원"></div>` : '').join('');
    const [yr, mm, dy] = d.split('-');
    // 해당 월의 첫 번째 날이면 년월 마커 표시
    const ymInfo = ymRanges.find(r => r.startIdx === i);
    const ymMarker = ymInfo ? `<div class="bar-ym-marker">${ymInfo.label}</div>` : '';
    return `<div class="bar-group${ymInfo ? ' ym-start' : ''}"><div class="bar-stack">${segs}</div><div class="bar-label">${parseInt(dy)}일</div>${ymMarker}</div>`;
  }).join('');
}

function updateServiceTable(data) {
  const tbody = document.getElementById('serviceTableBody');
  if (!tbody) return;

  // 선택된 월의 모든 플랫폼에서 서비스 데이터를 합산
  const merged = {};
  const months = data.months || [];
  const platforms = selectedPlatform === 'all' ? PF_LIST : [selectedPlatform];

  platforms.forEach(pf => {
    months.forEach(m => {
      const d = DB[pf]?.[m];
      if (!d || !d.services) return;
      const pfInfo = PLATFORMS[pf] || {};
      Object.entries(d.services).forEach(([sn, sv]) => {
        const key = pfInfo.name + ' — ' + sn;
        if (!merged[key]) merged[key] = { count:0, fee:0, delivery:0, ad:0, total:0, pfColor: pfInfo.color || '#888', pfIcon: pfInfo.icon || '', pfKey: pfInfo.name };
        merged[key].count += sv.count||0;
        merged[key].fee += sv.fee||0;
        merged[key].delivery += sv.delivery||0;
        merged[key].ad += sv.ad||0;
        merged[key].total += sv.total||0;
      });
    });
  });

  // 플랫폼별 그룹 → 플랫폼 합계 내림차순 → 그룹 내 금액 내림차순
  const pfOrder = {};
  Object.entries(merged).forEach(([name, s]) => {
    const pf = s.pfKey || name.split(' — ')[0];
    if (!pfOrder[pf]) pfOrder[pf] = { total: 0, items: [] };
    pfOrder[pf].total += s.total;
    pfOrder[pf].items.push([name, s]);
  });
  const entries = Object.values(pfOrder)
    .sort((a, b) => b.total - a.total)
    .flatMap(g => g.items.sort((a, b) => b[1].total - a[1].total))
    .filter(([, s]) => s.total > 0);
  if (!entries.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-tertiary);padding:20px;">서비스 데이터가 없습니다</td></tr>'; return; }

  let tCount=0, tFee=0, tDel=0, tAd=0, tTotal=0;
  const rows = entries.map(([name, s]) => {
    tCount += s.count; tFee += s.fee; tDel += s.delivery; tAd += s.ad; tTotal += s.total;
    const cell = v => v > 0 ? `<td class="num" style="color:var(--red);">${fmtW(v)}원</td>` : `<td class="num" style="color:var(--text-quaternary);">-</td>`;
    return `<tr>
      <td><span class="pf-dot" style="background:${s.pfColor}"></span> ${s.pfIcon} ${name}</td>
      <td class="num">${s.count > 0 ? fmt(s.count)+'건' : '<span style="color:var(--text-quaternary);">-</span>'}</td>
      ${cell(s.fee)}${cell(s.delivery)}${cell(s.ad)}
      <td class="num" style="color:var(--red);">${fmtW(s.total)}원</td>
    </tr>`;
  }).join('');

  tbody.innerHTML = rows + `<tr style="font-weight:700;border-top:1px solid var(--border);">
    <td>합계</td>
    <td class="num">${fmt(tCount)}건</td>
    <td class="num" style="color:var(--red);">${fmtW(tFee)}원</td>
    <td class="num" style="color:var(--red);">${fmtW(tDel)}원</td>
    <td class="num" style="color:var(--red);">${fmtW(tAd)}원</td>
    <td class="num" style="color:var(--red);">${fmtW(tTotal)}원</td>
  </tr>`;
}

function updatePlatformGrid(data) {
  const grid = document.getElementById('platformGrid');
  if (!grid) return;
  const isDeliveryPf = pf => !['ts','nv','di'].includes(pf);
  const totalAllRev = data.totalRev || 1;
  const months = data.months || [];
  const totalFixed = fixedCost() * months.length;

  grid.innerHTML = PF_LIST.map(p => {
    const ps = data.platformSummary[p];
    if (!ps || (!ps.totalRev && !ps.orders)) return '';

    const rev = ps.totalRev;
    const orders = ps.orders;
    // 개별 항목이 있으면(쿠팡) 상세 표시, 없으면 합산값으로 표시
    const hasDetail = !!(ps.broker || ps.pgFee || ps.vat);
    const broker = ps.broker||0, pgFee = ps.pgFee||0;
    const fee = ps.fee||0;
    const delFee = ps.delFee || ps.delivery || 0;
    const adSupply = ps.adSupply || ps.ad || 0;
    const vat = ps.vat || 0;
    const coupon = ps.coupon || 0;
    const shopCoupon = ps.shopCoupon || 0;
    const instantDisc = ps.instantDisc || 0;
    const promo = ps.promo || 0;
    const refund = ps.refund || 0;
    // 최종 입금예정
    const totalDeduct = hasDetail
      ? (shopCoupon + broker + pgFee + delFee + adSupply + vat + instantDisc - promo - refund)
      : (fee + delFee + adSupply + coupon);
    const finalSettle = ps.finalSettle || (rev - totalDeduct);
    // 내 비용
    const matCost = Math.round(rev * (S.cogs / 100));
    const revShare = totalAllRev > 0 ? rev / totalAllRev : 0;
    const fixedAlloc = Math.round(totalFixed * revShare);
    const realNet = finalSettle - matCost - fixedAlloc;
    const realMargin = rev > 0 ? (realNet / rev * 100) : 0;
    const marginColor = realMargin>=15?'var(--green)':realMargin>=0?'var(--orange)':'var(--red)';

    const row = (label, val, color) => `<div class="platform-stat"><span class="platform-stat-label">${label}</span><span class="platform-stat-value" style="color:${color};">${val}</span></div>`;
    const sep = `<div style="border-top:1px solid var(--border);margin:2px 0;"></div>`;
    const secLabel = text => `<div style="font-size:11px;color:var(--text-quaternary);padding:4px 0 2px;">${text}</div>`;
    const neg = v => v ? '-'+fmtW(v)+'원' : '0원';
    const negColor = v => v ? 'var(--red)' : 'var(--text-tertiary)';

    // 상세(쿠팡) vs 합산(기타 플랫폼) 분기
    let detailRows;
    if (hasDetail) {
      detailRows = `
      ${row('상점부담 쿠폰', neg(shopCoupon), negColor(shopCoupon))}
      ${row('중개 이용료', neg(broker), negColor(broker))}
      ${row('결제대행사 수수료', neg(pgFee), negColor(pgFee))}
      ${isDeliveryPf(p) ? row('배달비', neg(delFee), negColor(delFee)) : ''}
      ${row('광고비', neg(adSupply), negColor(adSupply))}
      <div class="platform-stat vat-tip-wrap"><span class="platform-stat-label">부가세 <span style="cursor:help;color:var(--accent);font-size:11px;">ⓘ</span></span><span class="platform-stat-value" style="color:${negColor(vat)};">${neg(vat)}</span>
        <div class="vat-tooltip">부가세 = 광고비 VAT + 서비스이용료<br>(중개이용료 + 결제수수료 + 배달비) VAT</div>
      </div>
      ${row('즉시할인금액', neg(instantDisc), negColor(instantDisc))}
      ${promo ? row('프로모션 혜택', '+'+fmtW(promo)+'원', 'var(--green)') : ''}
      ${refund ? row('환급액', '+'+fmtW(refund)+'원', 'var(--green)') : ''}`;
    } else {
      detailRows = `
      ${row('수수료', neg(fee), negColor(fee))}
      ${isDeliveryPf(p) ? row('배달비', neg(delFee), negColor(delFee)) : ''}
      ${row('광고', neg(adSupply), negColor(adSupply))}
      ${row('쿠폰', neg(coupon), negColor(coupon))}`;
    }

    return `<div class="platform-card ${p}">
      <div class="platform-header"><div class="platform-icon" style="background:${PLATFORMS[p].color}22;">${PLATFORMS[p].icon}</div><span class="platform-name">${PLATFORMS[p].name}</span><span style="margin-left:auto;font-size:12px;color:var(--text-tertiary);">${fmt(orders)}건</span></div>
      ${row('매출액', fmtW(rev)+'원', 'var(--text-primary)')}
      ${detailRows}
      ${sep}
      ${row('최종 입금예정금액', fmtW(finalSettle)+'원', 'var(--accent)')}
      ${sep}${secLabel('내 비용')}
      ${row('원가 ('+S.cogs+'%)', '-'+fmtW(matCost)+'원', 'var(--orange)')}
      ${row('고정비 배분', '-'+fmtW(fixedAlloc)+'원', 'var(--orange)')}
      ${sep}
      ${row('실제 순수익', fmtW(realNet)+'원', marginColor)}
    </div>`;
  }).join('') || '<div class="empty-state"><div class="empty-desc">데이터가 없습니다</div></div>';
}

function updateCalendar(data) {
  const grid = document.getElementById('calGrid');
  const ms = selectedMonths.length > 0 ? selectedMonths : getAllMonths().slice(0,1);
  if (!ms.length) { grid.innerHTML = ''; return; }
  const ym = ms[0]; const [y,m] = ym.split('-').map(Number);
  const fd = new Date(y,m-1,1).getDay(); const dim = new Date(y,m,0).getDate();
  let html = ['일','월','화','수','목','금','토'].map(d => `<div class="cal-header">${d}</div>`).join('');
  for (let i=0; i<fd; i++) html += '<div class="cal-cell empty"></div>';
  for (let d=1; d<=dim; d++) {
    const dk = `${ym}-${String(d).padStart(2,'0')}`;
    const dd = data.dailyAll[dk]; let rev = 0, bars = '';
    if (dd) { rev = Object.values(dd).reduce((s,v)=>s+v.rev,0); bars = PF_LIST.map(p => dd[p]?`<div class="cal-bar" style="background:${PLATFORMS[p].color};"></div>`:'').join(''); }
    html += `<div class="cal-cell"><div class="cal-day">${d}</div><div class="cal-rev">${rev>0?fmtW(rev):''}</div><div class="cal-bars">${bars}</div></div>`;
  }
  grid.innerHTML = html;
}

function updateMonthlySummary() {
  const am = getAllMonths(); const body = document.getElementById('monthlySummaryBody');
  if (!am.length) { body.innerHTML = ''; return; }
  let lastYear = '';
  body.innerHTML = am.map(m => {
    const [yr, mo] = m.split('-'); const vals = {};
    let ded = 0;
    PF_LIST.forEach(p => {
      const d = DB[p]?.[m]; vals[p] = d?.totalRev||0;
      if (d) ded += (d.fee||0)+(d.delivery||0)+(d.coupon||0)+(d.ad||0);
    });
    const tot = PF_LIST.reduce((s,p) => s + vals[p], 0);
    const dep = tot - ded;
    const net = dep - tot*(S.cogs/100) - fixedCost();
    let yearRow = '';
    if (yr !== lastYear) {
      lastYear = yr;
      yearRow = `<tr><td colspan="${PF_LIST.length + 5}" style="text-align:left;font-weight:700;color:var(--accent);padding:10px 8px 4px;border-bottom:1px solid var(--accent);font-size:13px;">${yr}년</td></tr>`;
    }
    return yearRow + `<tr><td>${parseInt(mo)}월</td>${PF_LIST.map(p => `<td class="num">${fmtW(vals[p])}</td>`).join('')}<td class="num total">${fmtW(tot)}</td><td class="num" style="color:var(--red);">${fmtW(ded)}</td><td class="num">${fmtW(dep)}</td><td class="num total" style="color:${net>=0?'var(--green)':'var(--red)'};">${fmtW(net)}</td></tr>`;
  }).join('');
}

/* ═══ 매장 vs 배달 비율 바 ═══ */
function updateStoreVsDelivery(data) {
  const el = document.getElementById('storeVsDelivery');
  if (!el) return;
  const ps = data.platformSummary;
  const storeRev = (ps.ts?.totalRev||0);
  const storeOrd = (ps.ts?.orders||0);
  const delRev = ['bm','cp','tg','yg'].reduce((s,p) => s + (ps[p]?.totalRev||0), 0);
  const delOrd = ['bm','cp','tg','yg'].reduce((s,p) => s + (ps[p]?.orders||0), 0);
  const total = storeRev + delRev;
  if (total === 0) { el.innerHTML = '<div class="text-sm text-tertiary">데이터가 없습니다</div>'; return; }
  const storePct = (storeRev / total * 100).toFixed(0);
  const delPct = (100 - storePct);

  el.innerHTML = `
    <div class="ratio-bar">
      <div class="ratio-bar-seg" style="width:${storePct}%;background:var(--ts-color);">${storePct}%</div>
      <div class="ratio-bar-seg" style="width:${delPct}%;background:var(--orange);">${delPct}%</div>
    </div>
    <div class="ratio-row"><span class="ratio-label">🏪 매장</span><span class="ratio-value">${fmtW(storeRev)}원 (${fmt(storeOrd)}건)</span></div>
    <div class="ratio-row"><span class="ratio-label">🛵 배달</span><span class="ratio-value">${fmtW(delRev)}원 (${fmt(delOrd)}건)</span></div>
    <div class="ratio-row"><span class="ratio-label">합계</span><span class="ratio-value" style="color:var(--text-primary);">${fmtW(total)}원 (${fmt(storeOrd+delOrd)}건)</span></div>
  `;
}

/* ═══ 매출 구성 도넛 ═══ */
function updateRevDonut(data) {
  const el = document.getElementById('revDonut');
  if (!el) return;
  const items = PF_LIST.map(p => ({
    label: PLATFORMS[p].name,
    value: data.platformSummary[p]?.totalRev||0,
    color: PLATFORMS[p].color
  })).filter(i => i.value > 0);

  if (!items.length) { el.innerHTML = '<div class="text-sm text-tertiary">데이터가 없습니다</div>'; return; }
  const total = items.reduce((s,i) => s + i.value, 0);

  let offset = 0;
  const radius = 50, circ = 2 * Math.PI * radius;
  const segments = items.map(i => {
    const pct = i.value / total;
    const dash = circ * pct;
    const seg = `<circle cx="60" cy="60" r="${radius}" fill="none" stroke="${i.color}" stroke-width="16" stroke-dasharray="${dash} ${circ - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 60 60)"/>`;
    offset += dash;
    return seg;
  }).join('');

  const legend = items.map(i => `
    <div class="donut-legend-item">
      <div class="donut-legend-dot" style="background:${i.color};"></div>
      <span style="flex:1;color:var(--text-secondary);">${i.label}</span>
      <span style="font-weight:600;">${fmtPct(i.value/total*100)}</span>
    </div>
  `).join('');

  el.innerHTML = `
    <div class="donut-chart"><svg viewBox="0 0 120 120">${segments}</svg></div>
    <div class="donut-legend">${legend}</div>
  `;
}

/* ═══ 월별 추이 라인 차트 ═══ */
function updateMonthlyTrend() {
  const el = document.getElementById('monthlyTrend');
  if (!el) return;
  const am = getAllMonths();
  if (am.length < 2) { el.innerHTML = '<div class="text-sm text-tertiary" style="padding:20px;text-align:center;">2개월 이상 데이터가 필요합니다</div>'; return; }

  const monthlyRevs = am.map(m => {
    let rev = 0;
    PF_LIST.forEach(p => { rev += DB[p]?.[m]?.totalRev||0; });
    return { month: m, rev };
  });

  const maxRev = Math.max(...monthlyRevs.map(d => d.rev), 1);
  const w = 800, h = 175, padX = 40, padY = 25;
  const stepX = (w - padX * 2) / Math.max(1, monthlyRevs.length - 1);

  const points = monthlyRevs.map((d, i) => ({
    x: padX + i * stepX,
    y: padY + (1 - d.rev / maxRev) * (h - padY * 2),
    ...d
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

  const dots = points.map(p => `<circle class="trend-dot" cx="${p.x}" cy="${p.y}" r="3"/>`).join('');

  const labels = points.map(p => {
    const [,mo] = p.month.split('-');
    return `<text class="trend-label" x="${p.x}" y="${h - 30}">${parseInt(mo)}월</text>`;
  }).join('');

  // 년도 표시: 년도별 구간에 라벨 + 구분선
  let yearLabels = '';
  let lastYear = '';
  const yearGroups = [];
  points.forEach((p, i) => {
    const yr = p.month.split('-')[0];
    if (yr !== lastYear) {
      if (yearGroups.length) yearGroups[yearGroups.length-1].endX = points[i-1].x;
      yearGroups.push({ year: yr, startX: p.x, endX: p.x });
      lastYear = yr;
    } else {
      yearGroups[yearGroups.length-1].endX = p.x;
    }
  });
  yearLabels = yearGroups.map((g, gi) => {
    const cx = (g.startX + g.endX) / 2;
    const lineY = h - 16;
    let line = `<line x1="${g.startX - 5}" y1="${lineY}" x2="${g.endX + 5}" y2="${lineY}" stroke="var(--accent)" stroke-width="1.5" stroke-opacity="0.4"/>`;
    // 년도 구분 세로선
    let divider = gi > 0 ? `<line x1="${g.startX - 8}" y1="${h - 35}" x2="${g.startX - 8}" y2="${h - 5}" stroke="rgba(255,255,255,0.2)" stroke-width="1" stroke-dasharray="3,2"/>` : '';
    return `${divider}${line}<text class="trend-year" x="${cx}" y="${h - 5}">${g.year}년</text>`;
  }).join('');

  const values = points.map(p =>
    `<text class="trend-value" x="${p.x}" y="${p.y - 10}">${fmtW(p.rev)}</text>`
  ).join('');

  el.innerHTML = `<svg class="trend-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <path class="trend-line" d="${linePath}"/>
    ${dots}${labels}${yearLabels}${values}
  </svg>`;
}

/* ═══ COLLAPSIBLE ═══ */
function toggleCollapse(id) {
  const b = document.getElementById(id);
  const h = b.previousElementSibling;
  b.classList.toggle('open');
  h.classList.toggle('open');
}

/* ═══ BEP ═══ */
function updateBEP() {
  const fixed = fixedCost();
  const mr = (100 - S.cogs - 10) / 100;
  const bep = mr > 0 ? fixed / mr : 0;
  document.getElementById('bepFixed').textContent = fmtW(fixed) + '원';
  document.getElementById('bepRevenue').textContent = fmtW(bep) + '원';
  document.getElementById('bepDaily').textContent = fmtW(bep/26) + '원';
  document.getElementById('bepLiving').textContent = fmtW(mr > 0 ? (fixed+S.living)/mr : 0) + '원';

  // 설정 페이지 소계 업데이트
  const ce = S.customExpenses || [];
  const fixedSub = (S.rent||0) + (S.internet||0) + (S.cardTerminal||0) + (S.cctv||0) + ce.filter(i=>i.category==='fixed').reduce((s,i)=>s+(i.amount||0),0);
  const varSub = (S.elec||0) + (S.gas||0) + (S.water||0) + (S.pack||0) + (S.etc||0) + ce.filter(i=>i.category==='variable').reduce((s,i)=>s+(i.amount||0),0);
  const el = id => document.getElementById(id);
  if (el('fixedSubtotal')) el('fixedSubtotal').textContent = fmt(fixedSub) + '원';
  if (el('varSubtotal')) el('varSubtotal').textContent = fmt(varSub) + '원';
  if (el('totalExpense')) el('totalExpense').textContent = fmt(fixedSub + varSub) + '원';
  if (el('totalNeeded')) el('totalNeeded').textContent = fmt(fixedSub + varSub + (S.living||0)) + '원';
}

/* ═══ DIAGNOSIS ═══ */
function refreshDiagnosis() {
  const data = getFilteredData();
  const profitScore = Math.min(40, Math.max(0, data.marginRate * 2));
  const dedRate = data.totalRev > 0 ? data.totalDeductions/data.totalRev*100 : 50;
  const effScore = Math.min(30, Math.max(0, 50 - dedRate));
  const priceScore = data.perOrder >= 3000 ? 30 : data.perOrder >= 1000 ? 20 : data.perOrder >= 0 ? 10 : 0;
  const total = Math.round(profitScore + effScore + priceScore);
  const color = total >= 70 ? 'var(--green)' : total >= 40 ? 'var(--orange)' : 'var(--red)';
  const ring = document.getElementById('healthRing');
  const circ = 2 * Math.PI * 52;
  ring.style.stroke = color;
  ring.setAttribute('stroke-dashoffset', circ - (circ * total / 100));
  document.getElementById('healthValue').textContent = total;
  document.getElementById('healthValue').style.color = color;
  document.getElementById('healthProfit').textContent = fmtPct(data.marginRate);
  document.getElementById('healthEfficiency').textContent = fmtPct(100 - dedRate);
  document.getElementById('healthPrice').textContent = data.perOrder >= 3000 ? '양호' : data.perOrder >= 0 ? '주의' : '위험';
  document.getElementById('healthProfitBar').style.width = Math.min(100,profitScore/40*100)+'%';
  document.getElementById('healthEffBar').style.width = Math.min(100,effScore/30*100)+'%';
  document.getElementById('healthPriceBar').style.width = Math.min(100,priceScore/30*100)+'%';

  const lc = document.getElementById('leakCards');
  const leaks = Object.entries(data.platformSummary).filter(([,ps])=>ps.totalRev>0).map(([p,ps])=>{
    const net = ps.totalRev - ps.fee - ps.delivery - ps.coupon - ps.ad - ps.totalRev*(S.cogs/100);
    const margin = ps.totalRev > 0 ? net/ps.totalRev*100 : 0;
    return { p, margin, net, feeRate: ps.fee/ps.totalRev*100, delRate: ps.delivery/ps.totalRev*100, ad: ps.ad, ...ps };
  });
  lc.innerHTML = `<div class="platform-grid">${leaks.map(l=>`<div class="platform-card ${l.p}">
    <div class="platform-header"><div class="platform-icon" style="background:${PLATFORMS[l.p].color}22;">${PLATFORMS[l.p].icon}</div><span class="platform-name">${PLATFORMS[l.p].name}</span><span style="margin-left:auto;font-size:14px;font-weight:600;">${l.margin>=25?'🟢 양호':l.margin>=10?'🟡 주의':'🔴 위험'}</span></div>
    <div class="platform-stat"><span class="platform-stat-label">순수익률</span><span class="platform-stat-value" style="color:${l.margin>=15?'var(--green)':'var(--red)'};">${fmtPct(l.margin)}</span></div>
    <div class="platform-stat"><span class="platform-stat-label">수수료율</span><span class="platform-stat-value">${fmtPct(l.feeRate)}</span></div>
    <div class="platform-stat"><span class="platform-stat-label">배달비율</span><span class="platform-stat-value">${fmtPct(l.delRate)}</span></div>
    <div class="platform-stat"><span class="platform-stat-label">순수익</span><span class="platform-stat-value" style="color:${l.net>=0?'var(--green)':'var(--red)'};">${fmtW(l.net)}원</span></div>
  </div>`).join('')}</div>`;

  document.getElementById('hackCards').innerHTML = [
    { p:'good', t:'쿠팡 쿠폰 3구간 활용법', d:'각 구간의 경계 금액 바로 위로 가격을 설정하면 쿠폰 부담을 최소화하면서 노출을 극대화할 수 있습니다.' },
    { p:'good', t:'배민 배달비 최적화', d:'세트메뉴나 추가 사이드로 객단가를 올리면 배달비 비율이 자동으로 줄어듭니다.' },
    { p:'warn', t:'요기요 수수료 주의', d:'중개 수수료 12.5%로 가장 높습니다. 프리미엄 메뉴(고객단가)를 밀어야 수수료 부담을 상쇄할 수 있습니다.' },
  ].map(h=>`<div class="rec-card ${h.p}"><div class="rec-priority ${h.p}">${h.p==='warn'?'주의':'전략'}</div><div class="rec-title">${h.t}</div><div class="rec-desc">${h.d}</div></div>`).join('');
}

function switchDiagTab(tab) {
  document.querySelectorAll('[data-diagtab]').forEach(p=>p.classList.remove('active'));
  document.querySelector(`[data-diagtab="${tab}"]`).classList.add('active');
  ['diagLeaks','diagCosts','diagAds','diagHacks'].forEach(id=>document.getElementById(id).style.display='none');
  document.getElementById({leaks:'diagLeaks',costs:'diagCosts',ads:'diagAds',hacks:'diagHacks'}[tab]).style.display='block';
}

/* ═══ MENU TABS ═══ */
function switchMenuTab(tab) {
  document.querySelectorAll('[data-menutab]').forEach(p=>p.classList.remove('active'));
  document.querySelector(`[data-menutab="${tab}"]`)?.classList.add('active');
  ['menuAnalysis','menuDesign','menuSimulator'].forEach(id=>document.getElementById(id).style.display='none');
  const map = {analysis:'menuAnalysis', design:'menuDesign', simulator:'menuSimulator'};
  document.getElementById(map[tab]).style.display='block';
}

/* ═══ CALCULATORS ═══ */
function getPfFeeRate(pf) {
  return ((S[pf+'Comm']||0) + (S[pf+'Pg']||0) + (S[pf+'Vat']||0)) / 100;
}
function getPfDel(pf) { return S[pf+'Del']||3000; }

function calcCoupon() {
  const cost = +document.getElementById('couponCost').value||0;
  const price = +document.getElementById('couponPrice').value||0;
  const cpn = +document.getElementById('couponAmount').value||0;
  const pf = document.getElementById('couponPlatform').value;
  document.getElementById('couponAmountLabel').textContent = fmt(cpn)+'원';
  const actual = price - cpn;
  const fee = actual * getPfFeeRate(pf);
  const del = getPfDel(pf);
  const net = actual - cost - fee - del;
  const margin = actual > 0 ? (net/actual*100) : 0;
  document.getElementById('couponFee').textContent = fmt(Math.round(fee))+'원';
  document.getElementById('couponDelivery').textContent = fmt(del)+'원';
  document.getElementById('couponProfit').textContent = fmt(Math.round(net))+'원';
  document.getElementById('couponProfit').style.color = net>=0?'var(--green)':'var(--red)';
  document.getElementById('couponMargin').textContent = fmtPct(margin);
  document.getElementById('couponMargin').style.color = margin>=15?'var(--green)':margin>=0?'var(--orange)':'var(--red)';
}

function calcReversePrice() {
  const mc = +document.getElementById('reverseMatCost').value||0;
  const target = +document.getElementById('reverseTarget').value||0;
  [['bm','Bm'],['cp','Cp'],['tg','Tg'],['yg','Yg']].forEach(([p,cap])=>{
    const fr = getPfFeeRate(p);
    const del = getPfDel(p);
    const price = (1-fr)>0 ? (target+mc+del)/(1-fr) : 0;
    document.getElementById('rev'+cap).textContent = fmt(Math.round(price))+'원';
  });
}

function calcAdROI() {
  const budget = +document.getElementById('adBudget').value||0;
  const avgRev = +document.getElementById('adAvgRev').value||18000;
  const mr = (+document.getElementById('adMarginRate').value||25)/100;
  document.getElementById('adBudgetLabel').textContent = fmt(budget)+'원';
  const ppo = avgRev*mr;
  const bep = ppo>0?Math.ceil(budget/ppo):0;
  const est = Math.round(bep*1.5);
  const roi = budget>0?((est*ppo-budget)/budget*100):0;
  const delta = est*ppo-budget;
  document.getElementById('adBEPOrders').textContent = fmt(bep)+'건';
  document.getElementById('adExtraOrders').textContent = '~'+fmt(est)+'건';
  document.getElementById('adROI').textContent = fmtPct(roi);
  document.getElementById('adROI').style.color = roi>=0?'var(--green)':'var(--red)';
  document.getElementById('adProfitDelta').textContent = (delta>=0?'+':'')+fmtW(delta)+'원';
  document.getElementById('adProfitDelta').style.color = delta>=0?'var(--green)':'var(--red)';
}

function runSimulator() {
  const cpn = +document.getElementById('simCoupon').value||0;
  const disc = +document.getElementById('simDiscount').value||0;
  document.getElementById('simCouponLabel').textContent = fmt(cpn)+'원';
  document.getElementById('simDiscountLabel').textContent = fmt(disc)+'원';
  const pf = document.getElementById('simPlatform').value;
  const fr = getPfFeeRate(pf);
  const del = getPfDel(pf);

  // 메뉴 데이터 연동
  let base = 16000, mc = base*(S.cogs/100);
  const menuIdx = +document.getElementById('simMenu')?.value;
  if (typeof MENU_DATA !== 'undefined' && MENU_DATA.length > 0 && MENU_DATA[menuIdx]) {
    const m = MENU_DATA[menuIdx];
    const pfPrice = m['pf_'+pf+'_price'] || m.price;
    const pfDiscount = m['pf_'+pf+'_discount'] || 0;
    base = pfPrice - pfDiscount;
    mc = (m.food||0) + (m.sauce||0) + (m.pack||0) + (m.side||0) + (m.etc||0);
  }

  const actual = base-cpn-disc; const fee = actual*fr; const net = actual-mc-fee-del;
  const margin = actual>0?(net/actual*100):0;
  document.getElementById('simActualPrice').textContent = fmt(actual)+'원';
  document.getElementById('simNetProfit').textContent = fmt(Math.round(net))+'원';
  document.getElementById('simNetProfit').style.color = net>=0?'var(--green)':'var(--red)';
  document.getElementById('simTotalFee').textContent = fmt(Math.round(fee+del))+'원';
  document.getElementById('simMarginRate').textContent = fmtPct(margin);
  document.getElementById('simMarginRate').style.color = margin>=15?'var(--green)':margin>=0?'var(--orange)':'var(--red)';
}

function updateSimulatorMenu() {
  const sel = document.getElementById('simMenu');
  if (!sel) return;
  if (typeof MENU_DATA === 'undefined' || MENU_DATA.length === 0) {
    sel.innerHTML = '<option>메뉴를 먼저 등록하세요</option>';
    return;
  }
  sel.innerHTML = MENU_DATA.map((m, i) =>
    `<option value="${i}">${m.name} (${W(m.price)})</option>`
  ).join('');
  runSimulator();
}

/* ═══ GUIDE (모달) ═══ */
const GUIDES = {
  bm: {
    title: '🛵 배민 다운로드 가이드',
    steps: [
      '<a href="https://ceo.baemin.com" target="_blank">ceo.baemin.com</a> 접속 (배민 셀프서비스)',
      '매출 파일: <b>정산관리</b> → <b>매출상세내역</b> → 월 선택 → 엑셀 다운로드',
      '매입 파일: <b>매입상세내역</b> → 같은 방법으로 다운로드',
      '다운받은 파일을 위 업로드 박스에 드래그'
    ],
    warn: '암호가 걸린 파일은 업로드할 수 없습니다.<br>엑셀에서 열고 → <b>다른 이름으로 저장</b> → 새 파일을 업로드하세요.'
  },
  cp: {
    title: '🧡 쿠팡이츠 다운로드 가이드',
    steps: [
      '<a href="https://store.coupangeats.com" target="_blank">store.coupangeats.com</a> 접속',
      '<b>정산</b> → <b>정산내역</b> → 월 선택',
      '<b>엑셀 다운로드</b> 클릭',
      '다운받은 파일을 위 업로드 박스에 드래그'
    ]
  },
  tg: {
    title: '🟢 땡겨요 다운로드 가이드',
    steps: [
      '<a href="https://partner.ttanggeyeo.com" target="_blank">partner.ttanggeyeo.com</a> 접속',
      '<b>정산관리</b> → <b>정산내역(건별)</b> 선택',
      '기간 선택 후 <b>엑셀 다운로드</b>',
      '다운받은 파일을 위 업로드 박스에 드래그'
    ]
  },
  yg: {
    title: '🟠 요기요 다운로드 가이드',
    steps: [
      '<a href="https://ceo.yogiyo.co.kr" target="_blank">ceo.yogiyo.co.kr</a> 접속 (사장님 광장)',
      '<b>정산</b> → <b>매출내역</b> → 월 선택',
      '<b>엑셀 다운로드</b> 클릭',
      '다운받은 파일을 위 업로드 박스에 드래그'
    ]
  },
  ts: {
    title: '🏪 가게(토스포스) 다운로드 가이드',
    steps: [
      '토스포스 앱 또는 PC → <b>매출 리포트</b>',
      '<b>엑셀 내보내기</b> 클릭 → "매출리포트-YYMMDD.xlsx" 저장',
      '다운받은 파일을 위 업로드 박스에 드래그'
    ],
    warn: '암호가 걸린 파일은 업로드할 수 없습니다.',
    tip: '<b>암호 푸는 방법:</b><br>① 엑셀에서 파일 열기 (암호 입력)<br>② 파일 → 정보 → 통합 문서 보호 → 암호 설정<br>③ 암호 칸을 <b>비우고</b> 확인 → 저장<br><br>또는: 엑셀에서 열고 → <b>다른 이름으로 저장</b>'
  }
};

function showGuide(pf) {
  const g = GUIDES[pf];
  if (!g) return;
  document.getElementById('guideTitle').textContent = g.title;
  let html = g.steps.map((s, i) => `<div class="step"><div class="step-n">${i+1}</div><div class="step-t">${s}</div></div>`).join('');
  if (g.warn) html += `<div class="warn-box">⚠️ ${g.warn}</div>`;
  if (g.tip) html += `<div class="tip-box">💡 ${g.tip}</div>`;
  document.getElementById('guideBody').innerHTML = html;
  document.getElementById('guideModal').classList.add('open');
}

function closeGuide() {
  document.getElementById('guideModal').classList.remove('open');
}

/* ═══ REFRESH ═══ */
function refreshAll() {
  const ct = document.querySelector('.page.active')?.id;
  if (ct === 'page-dashboard') refreshDashboard();
  if (ct === 'page-diagnosis') refreshDiagnosis();
  try { calcCoupon(); calcReversePrice(); calcAdROI(); runSimulator(); } catch(e) {}
}

/* ═══ INIT ═══ */
document.addEventListener('DOMContentLoaded', () => {
  // 로그인 Enter 키
  const pwInput = document.getElementById('loginPw');
  if (pwInput) pwInput.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

  // 드롭존 이벤트
  const dz = document.getElementById('mainDropzone');
  if (dz) {
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
    dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('dragover'); handleFiles(e.dataTransfer.files); });
  }

  // 세션 확인
  if (sessionStorage.getItem('bbalgan_auth')) showApp();
});
