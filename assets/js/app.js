/* ═══════════════════════════════════════════
   빨마라 대시보드 — 메인 앱 로직
   ═══════════════════════════════════════════ */

const PLATFORMS = {
  bm: { name: '배민', icon: '🛵', color: '#30d158' },
  cp: { name: '쿠팡이츠', icon: '🧡', color: '#ff453a' },
  tg: { name: '땡겨요', icon: '🟢', color: '#2D9E6B' },
  yg: { name: '요기요', icon: '🟠', color: '#E5302A' },
  ts: { name: '가게', icon: '🏪', color: '#6366f1' },
  nv: { name: '네이버', icon: '🟩', color: '#03C75A' },
  di: { name: '두잇', icon: '📱', color: '#FF6B35' }
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
  document.getElementById('mainNav').style.display = 'flex';
  document.getElementById('appContainer').style.display = 'block';
  if (window.innerWidth <= 768) document.getElementById('mobileNav').style.display = 'block';
  initApp();
}

async function initApp() {
  loadSettings();
  try { applySettingsToUI(); } catch(e) {}
  try { await loadFromSupabase(); } catch(e) { console.warn('Supabase 로드:', e.message); }
  try { if (typeof applyFeeModes === 'function') applyFeeModes(); } catch(e) {}
  renderFileList();
  updateBEP();
  refreshAll();
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
  Array.from(files).forEach(file => {
    const fn = file.name;
    let pf = null;
    if (/매출리포트/.test(fn)) pf = 'ts';
    else if (/매출상세내역|매입상세내역|배민/.test(fn)) pf = 'bm';
    else if (/coupang|쿠팡/.test(fn)) pf = 'cp';
    else if (/땡겨요|정산내역/.test(fn)) pf = 'tg';
    else if (/요기요/.test(fn)) pf = 'yg';
    if (!pf) { alert(`"${fn}" — 플랫폼을 인식할 수 없습니다.`); return; }
    loadXlsx2([file], pf);
  });
}

function renderFileList() {
  const container = document.getElementById('fileListContainer');
  if (!container) return;
  const allFiles = [];
  PF_LIST.forEach(pf => {
    (FILES[pf]||[]).forEach(f => allFiles.push({ ...f, pf }));
  });
  allFiles.sort((a,b) => a.key.localeCompare(b.key));

  if (!allFiles.length) { container.innerHTML = ''; return; }
  container.innerHTML = allFiles.map(f => {
    const p = PLATFORMS[f.pf];
    return `<div class="file-item">
      <div class="file-icon ${f.pf}">${p.icon}</div>
      <div class="file-info">
        <div class="file-name">${f.filename}</div>
        <div class="file-meta"><span>${p.name}</span><span>${f.period}</span><span class="file-tag sales">매출</span></div>
      </div>
      <button class="file-delete" onclick="removeFile('${f.pf}','${f.key}')">✕</button>
    </div>`;
  }).join('');
}

async function clearAllData() {
  if (!confirm('모든 데이터를 삭제하시겠습니까?')) return;
  await clearAll();
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
    platformSummary[p] = { totalRev:0, orders:0, fee:0, delivery:0, coupon:0, ad:0 };
    months.forEach(m => {
      const d = DB[p]?.[m]; if (!d) return;
      platformSummary[p].totalRev += d.totalRev||0;
      platformSummary[p].orders += d.orders||0;
      platformSummary[p].fee += d.fee||0;
      platformSummary[p].delivery += d.delivery||0;
      platformSummary[p].coupon += d.coupon||0;
      platformSummary[p].ad += d.ad||0;
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
  updateKPIs(data);
  updateDiagnosisBanner(data);
  updateStoreVsDelivery(data);
  updateRevDonut(data);
  updateDailyChart(data);
  updateMonthlyTrend();
  updatePlatformGrid(data);
  updateCalendar(data);
  updateMonthlySummary();
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
  chart.innerHTML = days.map(d => {
    const dd = data.dailyAll[d];
    const segs = PF_LIST.map(p => dd[p] ? `<div class="bar-segment ${p}" style="height:${Math.max(0,(dd[p].rev/maxRev)*180)}px;" title="${PLATFORMS[p].name}: ${fmt(dd[p].rev)}원"></div>` : '').join('');
    return `<div class="bar-group"><div class="bar-stack">${segs}</div><div class="bar-label">${parseInt(d.split('-')[2])}</div></div>`;
  }).join('');
}

function updatePlatformGrid(data) {
  const grid = document.getElementById('platformGrid');
  grid.innerHTML = PF_LIST.map(p => {
    const ps = data.platformSummary[p]; if (!ps || !ps.totalRev) return '';
    const dep = ps.totalRev - ps.fee - ps.delivery - ps.coupon - ps.ad;
    const net = dep - ps.totalRev * (S.cogs/100);
    const margin = ps.totalRev > 0 ? (net/ps.totalRev*100) : 0;
    const perOrd = ps.orders > 0 ? net / ps.orders : 0;
    return `<div class="platform-card ${p}">
      <div class="platform-header"><div class="platform-icon" style="background:${PLATFORMS[p].color}22;">${PLATFORMS[p].icon}</div><span class="platform-name">${PLATFORMS[p].name}</span></div>
      <div class="platform-stat"><span class="platform-stat-label">매출</span><span class="platform-stat-value">${fmtW(ps.totalRev)}원</span></div>
      <div class="platform-stat"><span class="platform-stat-label">주문수</span><span class="platform-stat-value">${fmt(ps.orders)}건</span></div>
      <div class="platform-stat"><span class="platform-stat-label">수수료</span><span class="platform-stat-value" style="color:var(--red);">${fmtW(ps.fee)}원 <span style="font-size:11px;color:var(--text-tertiary);">${fmtPct(ps.totalRev>0?ps.fee/ps.totalRev*100:0)}</span></span></div>
      <div class="platform-stat"><span class="platform-stat-label">배달비</span><span class="platform-stat-value" style="color:var(--red);">${fmtW(ps.delivery)}원 <span style="font-size:11px;color:var(--text-tertiary);">${fmtPct(ps.totalRev>0?ps.delivery/ps.totalRev*100:0)}</span></span></div>
      <div class="platform-stat"><span class="platform-stat-label">건당 순수익</span><span class="platform-stat-value" style="color:${perOrd>=0?'var(--green)':'var(--red)'};">${fmt(Math.round(perOrd))}원</span></div>
      <div class="platform-stat"><span class="platform-stat-label">마진율</span><span class="platform-stat-value" style="color:${margin>=15?'var(--green)':margin>=0?'var(--orange)':'var(--red)'};">${fmtPct(margin)}</span></div>
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
  body.innerHTML = am.map(m => {
    const [,mo] = m.split('-'); const vals = {};
    let ded = 0;
    PF_LIST.forEach(p => {
      const d = DB[p]?.[m]; vals[p] = d?.totalRev||0;
      if (d) ded += (d.fee||0)+(d.delivery||0)+(d.coupon||0)+(d.ad||0);
    });
    const tot = PF_LIST.reduce((s,p) => s + vals[p], 0);
    const dep = tot - ded;
    const net = dep - tot*(S.cogs/100) - fixedCost();
    return `<tr><td>${parseInt(mo)}월</td>${PF_LIST.map(p => `<td class="num">${fmtW(vals[p])}</td>`).join('')}<td class="num total">${fmtW(tot)}</td><td class="num" style="color:var(--red);">${fmtW(ded)}</td><td class="num">${fmtW(dep)}</td><td class="num total" style="color:${net>=0?'var(--green)':'var(--red)'};">${fmtW(net)}</td></tr>`;
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
  const w = 800, h = 150, padX = 40, padY = 25;
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
    return `<text class="trend-label" x="${p.x}" y="${h - 5}">${parseInt(mo)}월</text>`;
  }).join('');

  const values = points.map(p =>
    `<text class="trend-value" x="${p.x}" y="${p.y - 10}">${fmtW(p.rev)}</text>`
  ).join('');

  el.innerHTML = `<svg class="trend-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <path class="trend-line" d="${linePath}"/>
    ${dots}${labels}${values}
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
  document.querySelector(`[data-menutab="${tab}"]`).classList.add('active');
  ['menuDesign','menuSimulator'].forEach(id=>document.getElementById(id).style.display='none');
  document.getElementById({design:'menuDesign',simulator:'menuSimulator'}[tab]).style.display='block';
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
  const base = 16000; const mc = base*(S.cogs/100);
  const actual = base-cpn-disc; const fee = actual*fr; const net = actual-mc-fee-del;
  const margin = actual>0?(net/actual*100):0;
  document.getElementById('simActualPrice').textContent = fmt(actual)+'원';
  document.getElementById('simNetProfit').textContent = fmt(Math.round(net))+'원';
  document.getElementById('simNetProfit').style.color = net>=0?'var(--green)':'var(--red)';
  document.getElementById('simTotalFee').textContent = fmt(Math.round(fee+del))+'원';
  document.getElementById('simMarginRate').textContent = fmtPct(margin);
  document.getElementById('simMarginRate').style.color = margin>=15?'var(--green)':margin>=0?'var(--orange)':'var(--red)';
}

/* ═══ GUIDE ═══ */
function showGuide(pf) {
  const guides = {
    bm: '배달의민족 → 셀프서비스 → 정산관리 → 매출상세내역 / 매입상세내역 다운로드\nhttps://ceo.baemin.com',
    cp: '쿠팡이츠 → 정산 → 정산내역 → 엑셀 다운로드\nhttps://store.coupangeats.com',
    tg: '땡겨요 → 정산관리 → 정산내역(건별) 다운로드\nhttps://partner.ttanggeyeo.com',
    yg: '요기요 → 사장님 광장 → 정산 → 매출내역 다운로드\nhttps://ceo.yogiyo.co.kr',
    ts: '토스포스 → 매출 리포트 → 엑셀 내보내기 → "매출리포트-YYMMDD.xlsx"\n\n⚠️ 암호가 걸린 파일은 열 수 없습니다.\n암호 없이 다시 다운로드해주세요.'
  };
  alert(guides[pf]);
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
