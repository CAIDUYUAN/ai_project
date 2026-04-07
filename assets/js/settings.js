// [A] 설정 관리 (S 객체)
// ==============================================
const S = {
  rent:800000, mgmt:100000, util:150000, pack:100000, etc:50000, living:2000000,
  cogs:35,
  bmComm:6.8, bmPg:1.3, bmVat:0.68, bmExtra:0, bmDel:3100,
  cpComm:7.8, cpPg:2.8, cpVat:2.5,  cpExtra:0, cpDel:3400,
  tgComm:9.0, tgPg:3.3, tgVat:0, tgExtra:0, tgDel:2500,
  ygComm:12.5, ygPg:3.3, ygVat:0, ygExtra:0, ygDel:3000,
  cp1Min:14900, cp1Amt:1000,
  cp2Min:25000, cp2Amt:2000,
  cp3Min:35000, cp3Amt:3000,
  // 수수료 모드
  feeMode_bm:'db', feeMode_cp:'db', feeMode_tg:'db', feeMode_yg:'db',
  // 직접입력 저장값
  manual_bmComm:6.8, manual_bmPg:1.3, manual_bmVat:0.68, manual_bmExtra:0, manual_bmDel:3100,
  manual_cpComm:7.8, manual_cpPg:2.8, manual_cpVat:2.5, manual_cpExtra:0, manual_cpDel:3400,
  manual_tgComm:9.0, manual_tgPg:3.3, manual_tgVat:0, manual_tgExtra:0, manual_tgDel:2500,
  manual_ygComm:12.5, manual_ygPg:3.3, manual_ygVat:0, manual_ygExtra:0, manual_ygDel:3000,
};

function loadSettings() {
  try { Object.assign(S, JSON.parse(localStorage.getItem('bbalgan_v2') || '{}')); } catch(e) {}
}
async function loadSettingsFromSupabase() {
  const sb = getSb(); if (!sb) return;
  try {
    const { data: rows } = await sb.from('sales_data').select('data').eq('platform','settings').eq('ym_key','config');
    if (rows && rows.length) { Object.assign(S, rows[0].data); localStorage.setItem('bbalgan_v2', JSON.stringify(S)); }
  } catch(e) {}
}
function saveSettings() {
  const g = id => parseFloat(document.getElementById(id)?.value) || 0;
  Object.assign(S, {
    rent:g('s-rent'), mgmt:g('s-mgmt'), util:g('s-util'), pack:g('s-pack'), etc:g('s-etc'), living:g('s-living'), cogs:g('s-cogs'),
    bmComm:g('s-bm-comm'), bmPg:g('s-bm-pg'), bmVat:g('s-bm-vat'), bmExtra:g('s-bm-extra'), bmDel:g('s-bm-del'),
    cpComm:g('s-cp-comm'), cpPg:g('s-cp-pg'), cpVat:g('s-cp-vat'), cpExtra:g('s-cp-extra'), cpDel:g('s-cp-del'),
    tgComm:g('s-tg-comm'), tgPg:g('s-tg-pg'), tgVat:g('s-tg-vat'), tgExtra:g('s-tg-extra'), tgDel:g('s-tg-del'),
    ygComm:g('s-yg-comm'), ygPg:g('s-yg-pg'), ygVat:g('s-yg-vat'), ygExtra:g('s-yg-extra'), ygDel:g('s-yg-del'),
    cp1Min:g('s-cp1-min'), cp1Amt:g('s-cp1-amt'),
    cp2Min:g('s-cp2-min'), cp2Amt:g('s-cp2-amt'),
    cp3Min:g('s-cp3-min'), cp3Amt:g('s-cp3-amt'),
  });
  // manual 모드일 때 직접입력값도 저장
  ['bm','cp','tg','yg'].forEach(pf => {
    if (S['feeMode_'+pf] === 'manual') {
      S['manual_'+pf+'Comm'] = S[pf+'Comm']; S['manual_'+pf+'Pg'] = S[pf+'Pg'];
      S['manual_'+pf+'Vat'] = S[pf+'Vat']; S['manual_'+pf+'Extra'] = S[pf+'Extra'];
      S['manual_'+pf+'Del'] = S[pf+'Del'];
    }
  });
  localStorage.setItem('bbalgan_v2', JSON.stringify(S));
  // Supabase에 설정 저장
  saveToSupabase('settings', 'config', S, 'settings').catch(e => console.warn(e));
  Object.values(DB.bm).forEach(d => recalcBM(d));
  document.getElementById('hd-bm-del').textContent = S.bmDel.toLocaleString() + '원';
  document.getElementById('hd-cp-del').textContent = S.cpDel.toLocaleString() + '원';
  updateCouponPreview();
  renderAll();
  calcBEPSummary();
  if (typeof renderMenuCost === 'function') renderMenuCost();
  toast('⚙️ 설정 저장됐어요!');
}
function resetSettings() {
  if (!confirm('설정을 초기값으로 되돌리시겠습니까?')) return;
  const defaults = {
    rent:800000, mgmt:100000, util:150000, pack:100000, etc:50000, living:2000000, cogs:35,
    bmComm:6.8, bmPg:1.3, bmVat:0.68, bmExtra:0, bmDel:3100,
    cpComm:7.8, cpPg:2.8, cpVat:2.5, cpExtra:0, cpDel:3400,
    tgComm:9.0, tgPg:3.3, tgVat:0, tgExtra:0, tgDel:2500,
    ygComm:12.5, ygPg:3.3, ygVat:0, ygExtra:0, ygDel:3000,
    cp1Min:14900, cp1Amt:1000, cp2Min:25000, cp2Amt:2000, cp3Min:35000, cp3Amt:3000,
  };
  Object.assign(S, defaults);
  applySettingsToUI();
  saveSettings();
  toast('⚙️ 설정이 초기화됐어요!');
}
function applySettingsToUI() {
  const s = (id, v) => { const el = document.getElementById(id); if(el) el.value = v; };
  s('s-rent',S.rent); s('s-mgmt',S.mgmt); s('s-util',S.util); s('s-pack',S.pack); s('s-etc',S.etc); s('s-living',S.living); s('s-cogs',S.cogs);
  s('s-bm-comm',S.bmComm); s('s-bm-pg',S.bmPg); s('s-bm-vat',S.bmVat); s('s-bm-extra',S.bmExtra); s('s-bm-del',S.bmDel);
  s('s-cp-comm',S.cpComm); s('s-cp-pg',S.cpPg); s('s-cp-vat',S.cpVat); s('s-cp-extra',S.cpExtra); s('s-cp-del',S.cpDel);
  s('s-tg-comm',S.tgComm); s('s-tg-pg',S.tgPg); s('s-tg-vat',S.tgVat); s('s-tg-extra',S.tgExtra); s('s-tg-del',S.tgDel);
  s('s-yg-comm',S.ygComm); s('s-yg-pg',S.ygPg); s('s-yg-vat',S.ygVat); s('s-yg-extra',S.ygExtra); s('s-yg-del',S.ygDel);
  s('s-cp1-min',S.cp1Min); s('s-cp1-amt',S.cp1Amt);
  s('s-cp2-min',S.cp2Min); s('s-cp2-amt',S.cp2Amt);
  s('s-cp3-min',S.cp3Min); s('s-cp3-amt',S.cp3Amt);
  updateFeeTotal('bm'); updateFeeTotal('cp'); updateFeeTotal('tg'); updateFeeTotal('yg'); updateCouponPreview();
}
function updateFeeTotal(pf) {
  const g = id => parseFloat(document.getElementById(id)?.value) || 0;
  const tot = g(`s-${pf}-comm`) + g(`s-${pf}-pg`) + g(`s-${pf}-vat`) + g(`s-${pf}-extra`);
  const el = document.getElementById(pf + '-fee-total');
  if (el) el.textContent = tot.toFixed(2) + '%';
}
// ── 수수료 모드 전환 ──
function setFeeMode(pf, mode) {
  // 현재 모드가 manual이면 현재 입력값을 저장
  if (S['feeMode_'+pf] === 'manual') {
    const g = id => parseFloat(document.getElementById(id)?.value) || 0;
    S['manual_'+pf+'Comm'] = g('s-'+pf+'-comm');
    S['manual_'+pf+'Pg'] = g('s-'+pf+'-pg');
    S['manual_'+pf+'Vat'] = g('s-'+pf+'-vat');
    S['manual_'+pf+'Extra'] = g('s-'+pf+'-extra');
    S['manual_'+pf+'Del'] = g('s-'+pf+'-del');
  }

  S['feeMode_'+pf] = mode;

  // 버튼 UI 전환
  document.getElementById('fee-mode-'+pf+'-db').classList.toggle('active', mode === 'db');
  document.getElementById('fee-mode-'+pf+'-manual').classList.toggle('active', mode === 'manual');

  const inputs = ['comm','pg','vat','extra','del'].map(f => document.getElementById('s-'+pf+'-'+f));

  if (mode === 'db') {
    // DB 평균값 계산해서 입력
    const avg = calcDbAvgFee(pf);
    if (avg) {
      S[pf+'Comm'] = avg.comm; S[pf+'Pg'] = avg.pg; S[pf+'Vat'] = avg.vat; S[pf+'Extra'] = avg.extra; S[pf+'Del'] = avg.del;
    }
    inputs.forEach(el => { if (el) { el.readOnly = true; el.style.opacity = '0.6'; } });
  } else {
    // 직접입력 저장값 복원
    S[pf+'Comm'] = S['manual_'+pf+'Comm']; S[pf+'Pg'] = S['manual_'+pf+'Pg'];
    S[pf+'Vat'] = S['manual_'+pf+'Vat']; S[pf+'Extra'] = S['manual_'+pf+'Extra'];
    S[pf+'Del'] = S['manual_'+pf+'Del'];
    inputs.forEach(el => { if (el) { el.readOnly = false; el.style.opacity = '1'; } });
  }

  applySettingsToUI();
  localStorage.setItem('bbalgan_v2', JSON.stringify(S));
  renderAll();
  if (typeof renderMenuCost === 'function') renderMenuCost();
  calcBEPSummary();
}

// ── DB 평균 수수료 계산 ──
function calcDbAvgFee(pf) {
  const data = DB[pf];
  if (!data || !Object.keys(data).length) return null;

  let totalRev = 0, totalFee = 0, totalDel = 0, months = 0;
  Object.values(data).forEach(d => {
    if (d.totalRev > 0) {
      totalRev += d.totalRev;
      totalFee += d.fee || 0;
      totalDel += d.delivery || 0;
      months++;
    }
  });

  if (!totalRev || !months) return null;

  const avgFeeRate = (totalFee / totalRev * 100);
  const avgDel = Math.round(totalDel / (Object.values(data).reduce((s, d) => s + (d.orders || 0), 0) || 1));

  // 수수료율을 총합으로만 넣고 세부는 0으로 (DB에는 총합만 있음)
  return { comm: parseFloat(avgFeeRate.toFixed(2)), pg: 0, vat: 0, extra: 0, del: avgDel };
}

// ── 서비스별 수수료 집계 (배민) ──
function calcServiceFees(pf) {
  const data = DB[pf];
  if (!data) return {};
  const result = {};
  Object.values(data).forEach(d => {
    if (!d.services) return;
    Object.entries(d.services).forEach(([name, s]) => {
      if (!result[name]) result[name] = {count:0, fee:0, delivery:0, ad:0, total:0};
      result[name].count += s.count || 0;
      result[name].fee += s.fee || 0;
      result[name].delivery += s.delivery || 0;
      result[name].ad += s.ad || 0;
      result[name].total += s.total || 0;
    });
  });
  return result;
}

// ── 서비스별 수수료 UI 업데이트 ──
function updateServiceFeeUI(pf) {
  const el = document.getElementById('svc-fee-' + pf);
  if (!el) return;
  const svcFees = calcServiceFees(pf);
  if (!Object.keys(svcFees).length) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'block';

  // 포장류(우리가게클릭, 픽업, 포장 등) vs 배달류(배민배달, 배민1배달 등) 분류
  let pickupFee=0, pickupDel=0, pickupCount=0;
  let deliveryFee=0, deliveryDel=0, deliveryCount=0;
  const pickupNames = [], deliveryNames = [];

  Object.entries(svcFees).forEach(([name, s]) => {
    if (/배달/.test(name)) {
      deliveryFee += s.fee; deliveryDel += s.delivery; deliveryCount += s.count;
      deliveryNames.push(name);
    } else {
      pickupFee += s.fee; pickupDel += s.delivery; pickupCount += s.count;
      pickupNames.push(name);
    }
  });

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px">
      <div style="background:var(--bg3);border-radius:8px;padding:8px;font-size:11px">
        <div style="font-weight:700;color:var(--blue);margin-bottom:4px">📦 포장/픽업</div>
        <div style="color:var(--tx2)">${pickupNames.join(', ') || '-'}</div>
        <div>건수: <strong>${pickupCount.toLocaleString()}</strong></div>
        <div>수수료: <strong style="color:var(--danger)">${W(pickupFee)}</strong></div>
        <div>배달비: <strong>${W(pickupDel)}</strong></div>
      </div>
      <div style="background:var(--bg3);border-radius:8px;padding:8px;font-size:11px">
        <div style="font-weight:700;color:var(--grn);margin-bottom:4px">🛵 배달</div>
        <div style="color:var(--tx2)">${deliveryNames.join(', ') || '-'}</div>
        <div>건수: <strong>${deliveryCount.toLocaleString()}</strong></div>
        <div>수수료: <strong style="color:var(--danger)">${W(deliveryFee)}</strong></div>
        <div>배달비: <strong>${W(deliveryDel)}</strong></div>
      </div>
    </div>`;
}

// ── 페이지 로드 시 모드 적용 ──
function applyFeeModes() {
  ['bm','cp','tg','yg'].forEach(pf => {
    const mode = S['feeMode_'+pf] || 'db';
    const dbBtn = document.getElementById('fee-mode-'+pf+'-db');
    const manBtn = document.getElementById('fee-mode-'+pf+'-manual');
    if (dbBtn) dbBtn.classList.toggle('active', mode === 'db');
    if (manBtn) manBtn.classList.toggle('active', mode === 'manual');

    const inputs = ['comm','pg','vat','extra','del'].map(f => document.getElementById('s-'+pf+'-'+f));
    if (mode === 'db') {
      const avg = calcDbAvgFee(pf);
      if (avg) {
        S[pf+'Comm'] = avg.comm; S[pf+'Pg'] = avg.pg; S[pf+'Vat'] = avg.vat; S[pf+'Extra'] = avg.extra; S[pf+'Del'] = avg.del;
      }
      inputs.forEach(el => { if (el) { el.readOnly = true; el.style.opacity = '0.6'; } });
    } else {
      inputs.forEach(el => { if (el) { el.readOnly = false; el.style.opacity = '1'; } });
    }
  });
  // UI에 반영 + 전체 재계산
  applySettingsToUI();
  localStorage.setItem('bbalgan_v2', JSON.stringify(S));
  // 서비스별 수수료 UI 업데이트
  ['bm','cp','tg','yg'].forEach(p => updateServiceFeeUI(p));
  renderAll();
  if (typeof renderMenuCost === 'function') renderMenuCost();
  calcBEPSummary();
}

function updateCouponPreview() {
  const g = id => parseInt(document.getElementById(id)?.value) || 0;
  const el = document.getElementById('coupon-preview');
  if (el) el.innerHTML = [
    {min:g('s-cp1-min'), amt:g('s-cp1-amt')},
    {min:g('s-cp2-min'), amt:g('s-cp2-amt')},
    {min:g('s-cp3-min'), amt:g('s-cp3-amt')},
  ].map(t => `<span style="margin-right:16px">₩${t.min.toLocaleString()} 이상 → <strong style="color:var(--red)">-₩${t.amt.toLocaleString()}</strong></span>`).join('');
}
