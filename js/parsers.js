// [B] 데이터 저장소
// ==============================================
const DB    = { bm:{}, cp:{}, tg:{} };  // tg = 땡겨요
const FILES = { bm:[], cp:[], tg:[] };

// ==============================================
// [C] 헬퍼 유틸
// ==============================================
const W         = n  => '₩' + Math.round(n||0).toLocaleString('ko-KR');
const Pct       = (a,b) => b ? (a/b*100).toFixed(1)+'%' : '0%';
const fixedCost = () => S.rent + S.mgmt + S.util + S.pack + S.etc;
const bmFeeRate = () => (S.bmComm + S.bmPg + S.bmVat + S.bmExtra) / 100;
const allMonths = () => [...new Set([...Object.keys(DB.bm), ...Object.keys(DB.cp), ...Object.keys(DB.tg)])].sort();

function couponAmt(orderAmt) {
  if (orderAmt >= S.cp3Min) return S.cp3Amt;
  if (orderAmt >= S.cp2Min) return S.cp2Amt;
  if (orderAmt >= S.cp1Min) return S.cp1Amt;
  return 0;
}
function fmtDate(d) {
  if (!d) return '';
  if (d instanceof Date) return d.toISOString().substring(0,10);
  return String(d).substring(0,10);
}
function set(id, val) { const el = document.getElementById(id); if(el) el.textContent = val; }
function setKpi(id, val, isPos) {
  const el = document.getElementById(id); if(!el) return;
  el.textContent = val; el.className = 'kpi-value ' + (isPos ? 'pos' : 'neg');
}
function setGauge(key, pct) {
  const p = Math.min(pct, 100);
  const fill  = document.getElementById('g-'  + key);
  const label = document.getElementById('gp-' + key);
  if (fill)  fill.style.width    = p + '%';
  if (label) label.textContent   = pct.toFixed(1) + '%';
}
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}
function goTab(id) {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + id));
  if (id === 'overview') renderOverview();
  if (id === 'compare')  renderCompare();
  if (id === 'calendar') renderCalendar();
  if (id === 'settings') { applySettingsToUI(); calcBEPSummary(); }
}
document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => goTab(btn.dataset.tab)));

// ==============================================
// [D] 파싱 - 배민 공통 재계산
// ==============================================
function recalcBM(d) {
  const fr   = bmFeeRate();
  d.fee      = d.totalRev * fr;
  d.feeRate  = fr;
  d.delivery = d.orders * S.bmDel;
  if (d._orderAmounts) d.coupon = d._orderAmounts.reduce((s,a) => s + couponAmt(a), 0);
}

// ==============================================
// [E] 파싱 - 배민 엑셀 (XLSX)
// ==============================================
function parseBM_xlsx(wb, filename) {
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});
  let period = '기간 미상', ym = null;

  // 파일명에서 연월 추출
  const mf = filename.match(/(\d{4})년(\d{2})월/);
  if (mf) { period = mf[1]+'년 '+mf[2]+'월'; ym = [+mf[1], +mf[2]]; }
  else {
    for (let i = 0; i < 10 && !ym; i++) {
      (rows[i]||[]).forEach(v => {
        if (typeof v === 'string') {
          const mm = v.match(/(\d{4})-(\d{2})/);
          if (mm && !ym) { ym = [+mm[1], +mm[2]]; period = mm[1]+'년 '+mm[2]+'월'; }
        }
      });
    }
    if (!ym) throw new Error('연월 파악 불가');
  }

  // 주문번호별 합산 (취소 제외)
  const orderMap = {};
  for (let i = 12; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[0] || r[0] === '계') break;
    if ((r[2]||'').includes('배민부담금액')) continue;
    const ds = fmtDate(r[0]), on = r[1], amt = Number(r[6])||0;
    if (!ds || !on) continue;
    if (!orderMap[on]) orderMap[on] = {date:ds, total:0};
    orderMap[on].total += amt;
  }

  // daily 집계
  const daily = {}; let totalOrders = 0, totalCoupon = 0;
  for (const [, o] of Object.entries(orderMap)) {
    if (o.total <= 0) continue;
    if (!daily[o.date]) daily[o.date] = {rev:0, orders:0, coupon:0};
    daily[o.date].rev    += o.total;
    daily[o.date].orders += 1;
    const cpn = couponAmt(o.total);
    daily[o.date].coupon += cpn; totalCoupon += cpn; totalOrders++;
  }

  const totalRev    = Object.values(daily).reduce((s,v) => s + v.rev, 0);
  const orderAmounts = Object.values(orderMap).filter(o => o.total > 0).map(o => o.total);
  const d = {period, ym, totalRev, orders:totalOrders, daily, fee:0, feeRate:0, delivery:0, coupon:totalCoupon, _orderAmounts:orderAmounts};
  recalcBM(d);
  return d;
}

// ==============================================
// [F] 파싱 - 쿠팡 엑셀 (XLSX)
// ==============================================
function parseCP_xlsx(wb, filename) {
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});
  const m    = filename.match(/(\d{4})-(\d{2})/);
  if (!m) throw new Error('파일명 형식: coupang_eats_YYYY-MM.xlsx');
  const period = m[1]+'년 '+m[2]+'월', ym = [+m[1], +m[2]];

  // 헤더 행 자동 감지 (상위 10행 중 컬럼 수 가장 많은 행)
  let hi = 0, maxCols = 0;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cnt = (rows[i]||[]).filter(v => v !== null && v !== '').length;
    if (cnt > maxCols) { maxCols = cnt; hi = i; }
  }
  const headers = (rows[hi] || []).map(v => String(v || '').trim());

  // 컬럼 인덱스 찾기 — 다양한 컬럼명 대응
  const findCol = (...keywords) => {
    for (const kw of keywords) {
      const i = headers.findIndex(h => h.includes(kw));
      if (i >= 0) return i;
    }
    return -1;
  };
  const ci = {
    date: findCol('날짜','일시','거래일','Date'),
    type: findCol('거래유형','유형','Type'),
    rev:  findCol('주문금액','결제금액','총금액','금액','Amount'),
    fee:  findCol('서비스수수료','수수료','Commission'),
    cpn:  findCol('상점부담','쿠폰','Coupon'),
  };
  if (ci.date < 0) ci.date = 0;
  if (ci.type < 0) ci.type = 8;
  if (ci.rev  < 0) ci.rev  = 9;
  if (ci.fee  < 0) ci.fee  = 16;

  const daily = {}; let totalFee = 0, totalCoupon = 0, totalOrders = 0;

  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(v => v === null || v === '')) continue; // 빈 행 스킵

    const rawDate = r[ci.date];
    if (!rawDate) continue;
    const ds = fmtDate(rawDate);
    if (!ds || ds === 'NaN-NaN-NaN') continue;

    const type = String(r[ci.type] || '').trim();
    // 거래유형이 있으면 PAY/결제만, 없으면 금액 있는 모든 행 포함
    if (type && !/PAY|결제/i.test(type)) continue;

    const rev = Number(r[ci.rev])  || 0;
    if (rev <= 0) continue;

    const fee = Math.abs(Number(r[ci.fee]) || 0);
    const cpn = Math.abs(Number(r[ci.cpn] !== undefined ? r[ci.cpn] : 0) || 0);

    if (!daily[ds]) daily[ds] = {rev:0, orders:0, fee:0, coupon:0};
    daily[ds].rev += rev; daily[ds].orders++;
    daily[ds].fee += fee; daily[ds].coupon += cpn;
    totalFee += fee; totalCoupon += cpn; totalOrders++;
  }

  const totalRev = Object.values(daily).reduce((s,v) => s + v.rev, 0);
  return {period, ym, totalRev, orders:totalOrders, daily,
    fee: totalFee, feeRate: totalRev ? totalFee/totalRev : 0,
    delivery: totalOrders * S.cpDel, coupon: totalCoupon};
}

// ==============================================
// [G] 파싱 - 배민 CSV (구글 드라이브)
// ==============================================
function parseBM_csv(text, filename) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  let period = '기간 미상', ym = null;

  const mf = filename.match(/(\d{4})년(\d{2})월/);
  if (mf) { period = mf[1]+'년 '+mf[2]+'월'; ym = [+mf[1], +mf[2]]; }
  else {
    for (const line of lines.slice(0, 15)) {
      const mm = line.match(/(\d{4})-(\d{2})/);
      if (mm && !ym) { ym = [+mm[1], +mm[2]]; period = mm[1]+'년 '+mm[2]+'월'; }
    }
    if (!ym) throw new Error('연월 파악 불가: ' + filename);
  }

  // CSV 파싱 헬퍼
  const splitCSV = line => {
    const r = []; let c = '', q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) { r.push(c.trim()); c = ''; }
      else c += ch;
    }
    r.push(c.trim()); return r;
  };
  const toNum = v => parseFloat((v||'').replace(/[,₩"]/g,'')) || 0;

  // 헤더 행 찾기
  let hi = lines.findIndex(l => l.includes('일자') && l.includes('서비스거래번호'));
  if (hi < 0) hi = lines.findIndex(l => l.includes(',') && l.split(',').length > 4);
  const headers = splitCSV(lines[hi] || '');
  const ci = {
    date: headers.findIndex(h => h.includes('일자')),
    txid: headers.findIndex(h => h.includes('서비스거래번호')),
    type: headers.findIndex(h => h.includes('매출구분')),
    amt:  headers.findIndex(h => h.includes('합계')),
  };

  const orderMap = {};
  for (let i = hi + 1; i < lines.length; i++) {
    const r = splitCSV(lines[i]);
    const type = r[ci.type] || '';
    if (!type.includes('카드매출') && !type.includes('현금매출')) continue;
    const ds  = (r[ci.date] || '').substring(0, 10);
    const on  = r[ci.txid] || (ds + i);
    const amt = toNum(r[ci.amt]);
    if (!ds || !amt) continue;
    if (!orderMap[on]) orderMap[on] = {date:ds, total:0};
    orderMap[on].total += amt;
  }

  const daily = {}; let totalOrders = 0, totalCoupon = 0;
  for (const [, o] of Object.entries(orderMap)) {
    if (o.total <= 0) continue;
    if (!daily[o.date]) daily[o.date] = {rev:0, orders:0, coupon:0};
    daily[o.date].rev += o.total; daily[o.date].orders++;
    const cpn = couponAmt(o.total);
    daily[o.date].coupon += cpn; totalCoupon += cpn; totalOrders++;
  }

  const totalRev    = Object.values(daily).reduce((s,v) => s + v.rev, 0);
  const orderAmounts = Object.values(orderMap).filter(o => o.total > 0).map(o => o.total);
  const d = {period, ym, totalRev, orders:totalOrders, daily, fee:0, feeRate:0, delivery:0, coupon:totalCoupon, _orderAmounts:orderAmounts};
  recalcBM(d); return d;
}

// ==============================================
// [H] 파싱 - 쿠팡 CSV (구글 드라이브)
// ==============================================
function parseCP_csv(text, filename) {
  const m = filename.match(/(\d{4})-(\d{2})/);
  if (!m) throw new Error('파일명 형식: coupang_eats_YYYY-MM');
  const period = m[1]+'년 '+m[2]+'월', ym = [+m[1], +m[2]];

  const lines  = text.split('\n').map(l => l.trim()).filter(l => l);
  const splitCSV = line => {
    const r = []; let c = '', q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) { r.push(c.trim()); c = ''; }
      else c += ch;
    }
    r.push(c.trim()); return r;
  };
  const toNum = v => parseFloat((v||'').replace(/[,₩"]/g,'')) || 0;

  // 헤더 행 찾기
  let hi = lines.findIndex(l => l.includes('거래유형'));
  if (hi < 0) hi = 2;
  const headers = splitCSV(lines[hi] || '');
  const ci = {
    date: 0,
    type: headers.findIndex(h => h.includes('거래유형')),
    rev:  headers.findIndex(h => h.includes('주문금액') || h.includes('총금액')),
    fee:  headers.findIndex(h => h.includes('서비스수수료')),
    cpn:  headers.findIndex(h => h.includes('상점부담')),
  };
  // fallback 컬럼 인덱스
  if (ci.type < 0) ci.type = 7;
  if (ci.rev  < 0) ci.rev  = 9;
  if (ci.fee  < 0) ci.fee  = 14;

  const daily = {}; let totalFee = 0, totalCoupon = 0, totalOrders = 0;
  for (let i = hi + 1; i < lines.length; i++) {
    const r = splitCSV(lines[i]);
    if (!r[ci.date]) continue;
    const type = r[ci.type] || '';
    if (type && !/PAY|결제/i.test(type)) continue;
    const ds  = r[ci.date].substring(0, 10);
    const rev = toNum(r[ci.rev]);
    const fee = toNum(r[ci.fee]);
    const cpn = toNum(r[ci.cpn]);
    if (!daily[ds]) daily[ds] = {rev:0, orders:0, fee:0, coupon:0};
    daily[ds].rev += rev; daily[ds].orders++; daily[ds].fee += fee; daily[ds].coupon += cpn;
    totalFee += fee; totalCoupon += cpn; totalOrders++;
  }

  const totalRev = Object.values(daily).reduce((s,v) => s + v.rev, 0);
  return {period, ym, totalRev, orders:totalOrders, daily, fee:totalFee, feeRate:totalRev?totalFee/totalRev:0, delivery:totalOrders*S.cpDel, coupon:totalCoupon};
}

// ==============================================
// [H2] 파싱 - 땡겨요 CSV (구글 드라이브 / 엑셀 공통)
// ==============================================
function parseTG(text, filename) {
  // 파일명에서 날짜 추출: 250201_250228_... 형식
  const mf = filename.match(/^(\d{2})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
  if (!mf) throw new Error('파일명 형식: YYMMDD_YYMMDD_빨간집_매출내역');

  const sy=2000+parseInt(mf[1]), sm=parseInt(mf[2]);
  const ey=2000+parseInt(mf[4]), em=parseInt(mf[5]);

  // 연월 목록 생성 (여러 달 가능)
  const ymList = [];
  let y=sy, mo=sm;
  while(y<ey||(y===ey&&mo<=em)){ ymList.push([y,mo]); mo++; if(mo>12){mo=1;y++;} }

  const period = sy+'년 '+sm+'월' + (ymList.length>1 ? ' ~ '+ey+'년 '+em+'월' : '');

  const lines = text.split('\n').map(l=>l.trim()).filter(l=>l);
  const splitCSV = line => {
    const r=[]; let c='',q=false;
    for(const ch of line){if(ch==='"')q=!q;else if(ch===','&&!q){r.push(c.trim());c='';}else c+=ch;}
    r.push(c.trim()); return r;
  };
  const toNum = v => parseFloat((v||'').replace(/[,₩"]/g,''))||0;

  // 헤더 행 찾기
  let hi = lines.findIndex(l => l.includes('주문일') || l.includes('결제일'));
  if (hi < 0) hi = lines.findIndex(l => l.includes(',') && l.split(',').length > 3);
  const headers = splitCSV(lines[hi]||'');
  const ci = {
    date:   headers.findIndex(h=>/주문일|결제일|날짜/.test(h)),
    rev:    headers.findIndex(h=>/주문금액|결제금액|매출금액|총.*금액/.test(h)),
    status: headers.findIndex(h=>/상태|주문상태/.test(h)),
  };
  if(ci.date<0) ci.date=0;
  if(ci.rev<0)  ci.rev=3;

  console.log('[땡겨요 디버그] 헤더행 인덱스:', hi);
  console.log('[땡겨요 디버그] 헤더 컬럼:', headers);
  console.log('[땡겨요 디버그] 컬럼 인덱스 → 날짜:', ci.date, '/ 금액:', ci.rev, '/ 상태:', ci.status);
  console.log('[땡겨요 디버그] 첫 번째 데이터 행:', lines[hi+1]);
  console.log('[땡겨요 디버그] ymList:', ymList);

  const daily={}; let totalOrders=0;
  for(let i=hi+1;i<lines.length;i++){
    const r=splitCSV(lines[i]);
    if(!r[ci.date]) continue;
    // 취소 제외
    const status=r[ci.status]||'';
    if(/취소|환불|cancel/i.test(status)) continue;
    const ds=r[ci.date].substring(0,10).replace(/[./]/g,'-');
    const rev=toNum(r[ci.rev]);
    if(i <= hi+3) console.log(`[땡겨요 디버그] 행${i} → 날짜원본:"${r[ci.date]}" ds:"${ds}" 금액원본:"${r[ci.rev]}" rev:${rev}`);
    if(!rev) continue;
    if(!daily[ds]) daily[ds]={rev:0,orders:0};
    daily[ds].rev+=rev; daily[ds].orders++; totalOrders++;
  }

  const totalRev=Object.values(daily).reduce((s,v)=>s+v.rev,0);
  console.log('[땡겨요 디버그] 파싱 완료 → totalOrders:', totalOrders, '/ totalRev:', totalRev);
  console.log('[땡겨요 디버그] daily 날짜 샘플:', Object.keys(daily).slice(0,5));
  // 땡겨요 수수료: 9% + 카드 3.3%
  const feeRate=0.09+0.033;
  const fee=totalRev*feeRate;
  const delivery=totalOrders*S.tgDel;

  // 여러 달에 걸쳐 있으면 월별로 분리
  return ymList.map(([yr,mn])=>{
    const moStr=String(mn).padStart(2,'0');
    const moDaily={};
    Object.entries(daily).forEach(([ds,v])=>{
      if(ds.startsWith(`${yr}-${moStr}`)) moDaily[ds]=v;
    });
    const moRev=Object.values(moDaily).reduce((s,v)=>s+v.rev,0);
    const moOrd=Object.values(moDaily).reduce((s,v)=>s+v.orders,0);
    return {
      period: yr+'년 '+mn+'월', ym:[yr,mn],
      totalRev:moRev, orders:moOrd, daily:moDaily,
      fee:moRev*feeRate, feeRate, delivery:moOrd*S.tgDel, coupon:0,
    };
  });
}

// ==============================================
// [H3] 파싱 - 땡겨요 엑셀 (XLSX)
// ==============================================
function parseTG_xlsx(wb, filename) {
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});
  // 헤더 행 찾기
  let hi = 0;
  for(let i=0;i<Math.min(rows.length,10);i++){
    if((rows[i]||[]).some(v=>v&&/주문일|결제일/.test(String(v)))){ hi=i; break; }
  }
  const headers=(rows[hi]||[]).map(v=>String(v||''));
  const ci={
    date:   headers.findIndex(h=>/주문일|결제일/.test(h)),
    rev:    headers.findIndex(h=>/주문금액|결제금액|매출금액|총.*금액/.test(h)),
    status: headers.findIndex(h=>/상태/.test(h)),
  };
  if(ci.date<0) ci.date=0;
  if(ci.rev<0)  ci.rev=3;

  // CSV 텍스트로 변환 후 재활용
  const csvLines = rows.slice(hi).map(row=>(row||[]).map(cell=>{
    if(cell instanceof Date) { const y=cell.getFullYear(),mo=String(cell.getMonth()+1).padStart(2,'0'),d=String(cell.getDate()).padStart(2,'0'); return `${y}-${mo}-${d}`; }
    const v=String(cell||'');
    return v.includes(',')?'"'+v+'"':v;
  }).join(','));
  return parseTG(csvLines.join('\n'), filename);
}
