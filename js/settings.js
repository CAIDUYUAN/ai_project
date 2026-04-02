// [A] 설정 관리 (S 객체)
// ==============================================
const S = {
  rent:800000, mgmt:100000, util:150000, pack:100000, etc:50000, living:2000000,
  cogs:35,
  bmComm:6.8, bmPg:1.3, bmVat:0.68, bmExtra:0, bmDel:3100,
  cpComm:7.8, cpPg:2.8, cpVat:2.5,  cpExtra:0, cpDel:3400,
  tgFee:9.0, tgDel:0,  // 땡겨요: 수수료 9% + 카드 3.3% = 12.3%, 배달비 0(자체배달)
  cp1Min:14900, cp1Amt:1000,
  cp2Min:25000, cp2Amt:2000,
  cp3Min:35000, cp3Amt:3000,
};

function loadSettings() {
  try { Object.assign(S, JSON.parse(localStorage.getItem('bbalgan_v2') || '{}')); } catch(e) {}
}
function saveSettings() {
  const g = id => parseFloat(document.getElementById(id)?.value) || 0;
  Object.assign(S, {
    rent:g('s-rent'), mgmt:g('s-mgmt'), util:g('s-util'), pack:g('s-pack'), etc:g('s-etc'), living:g('s-living'), cogs:g('s-cogs'),
    bmComm:g('s-bm-comm'), bmPg:g('s-bm-pg'), bmVat:g('s-bm-vat'), bmExtra:g('s-bm-extra'), bmDel:g('s-bm-del'),
    cpComm:g('s-cp-comm'), cpPg:g('s-cp-pg'), cpVat:g('s-cp-vat'), cpExtra:g('s-cp-extra'), cpDel:g('s-cp-del'),
    cp1Min:g('s-cp1-min'), cp1Amt:g('s-cp1-amt'),
    cp2Min:g('s-cp2-min'), cp2Amt:g('s-cp2-amt'),
    cp3Min:g('s-cp3-min'), cp3Amt:g('s-cp3-amt'),
  });
  localStorage.setItem('bbalgan_v2', JSON.stringify(S));
  Object.values(DB.bm).forEach(d => recalcBM(d));
  document.getElementById('hd-bm-del').textContent = S.bmDel.toLocaleString() + '원';
  document.getElementById('hd-cp-del').textContent = S.cpDel.toLocaleString() + '원';
  updateCouponPreview();
  renderAll();
  calcBEPSummary();
  toast('⚙️ 설정 저장됐어요!');
}
function applySettingsToUI() {
  const s = (id, v) => { const el = document.getElementById(id); if(el) el.value = v; };
  s('s-rent',S.rent); s('s-mgmt',S.mgmt); s('s-util',S.util); s('s-pack',S.pack); s('s-etc',S.etc); s('s-living',S.living); s('s-cogs',S.cogs);
  s('s-bm-comm',S.bmComm); s('s-bm-pg',S.bmPg); s('s-bm-vat',S.bmVat); s('s-bm-extra',S.bmExtra); s('s-bm-del',S.bmDel);
  s('s-cp-comm',S.cpComm); s('s-cp-pg',S.cpPg); s('s-cp-vat',S.cpVat); s('s-cp-extra',S.cpExtra); s('s-cp-del',S.cpDel);
  s('s-cp1-min',S.cp1Min); s('s-cp1-amt',S.cp1Amt);
  s('s-cp2-min',S.cp2Min); s('s-cp2-amt',S.cp2Amt);
  s('s-cp3-min',S.cp3Min); s('s-cp3-amt',S.cp3Amt);
  updateFeeTotal('bm'); updateFeeTotal('cp'); updateCouponPreview();
}
function updateFeeTotal(pf) {
  const g = id => parseFloat(document.getElementById(id)?.value) || 0;
  const tot = pf === 'bm'
    ? g('s-bm-comm') + g('s-bm-pg') + g('s-bm-vat') + g('s-bm-extra')
    : g('s-cp-comm') + g('s-cp-pg') + g('s-cp-vat') + g('s-cp-extra');
  const el = document.getElementById(pf + '-fee-total');
  if (el) el.textContent = tot.toFixed(2) + '%';
}
function updateCouponPreview() {
  const g = id => parseInt(document.getElementById(id)?.value) || 0;
  const el = document.getElementById('coupon-preview');
  if (el) el.innerHTML = [
    {min:g('s-cp1-min'), amt:g('s-cp1-amt')},
    {min:g('s-cp2-min'), amt:g('s-cp2-amt')},
    {min:g('s-cp3-min'), amt:g('s-cp3-amt')},
  ].map(t => `<span style="margin-right:16px">₩${t.min.toLocaleString()} 이상 → <strong style="color:#f87171">-₩${t.amt.toLocaleString()}</strong></span>`).join('');
}
