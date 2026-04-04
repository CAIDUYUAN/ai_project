// [B] 데이터 저장소
// ==============================================
const DB    = { bm:{}, cp:{}, tg:{}, yg:{} };  // tg = 땡겨요, yg = 요기요
const FILES = { bm:[], cp:[], tg:[], yg:[] };

// ==============================================
// [C] 헬퍼 유틸
// ==============================================
const W         = n  => '₩' + Math.round(n||0).toLocaleString('ko-KR');
const Pct       = (a,b) => b ? (a/b*100).toFixed(1)+'%' : '0%';
const fixedCost = () => S.rent + S.mgmt + S.util + S.pack + S.etc;
const bmFeeRate = () => (S.bmComm + S.bmPg + S.bmVat + S.bmExtra) / 100;
const allMonths = () => [...new Set([...Object.keys(DB.bm), ...Object.keys(DB.cp), ...Object.keys(DB.tg), ...Object.keys(DB.yg)])].sort();

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
  if (id === 'menucost') renderMenuCost();
  if (id === 'calendar') renderCalendar();
  if (id === 'diagnosis') renderDiagnosis();
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
// [E2] 파싱 - 배민 매입 엑셀 (XLSX)
// ==============================================
function parseBM_purchase_xlsx(wb, filename) {
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});

  // 파일명에서 연월 추출
  const mf = filename.match(/(\d{4})년(\d{2})월/);
  if (!mf) throw new Error('배민 매입 파일명에서 연월을 추출할 수 없습니다');
  const yr = +mf[1], mn = +mf[2];
  const period = yr+'년 '+mn+'월';

  // 헤더 행 찾기 (일자, 서비스, 수수료유형 등)
  let hi = -1;
  for (let i=0; i<Math.min(rows.length,15); i++) {
    if ((rows[i]||[]).some(v => v && /수수료유형/.test(String(v)))) { hi=i; break; }
  }
  if (hi < 0) throw new Error('배민 매입 헤더를 찾을 수 없습니다');

  const headers = (rows[hi]||[]).map(v => String(v||'').trim());
  const ci = {
    date:    headers.findIndex(h => /^일자$/.test(h)),
    service: headers.findIndex(h => /^서비스$/.test(h)),
    feeType: headers.findIndex(h => /수수료유형/.test(h)),
    amount:  headers.findIndex(h => /^합계$/.test(h)),
    supplyAmt: headers.findIndex(h => /공급가액/.test(h)),
    vat:     headers.findIndex(h => /부가세액/.test(h)),
  };

  let totalFee=0, totalDelivery=0, totalAd=0;
  // 서비스별 집계: {서비스명: {count, fee, delivery, ad, total}}
  const services = {};

  for (let i=hi+1; i<rows.length; i++) {
    const r = rows[i];
    if (!r || !r[ci.date] || r[ci.date]==='계') continue;
    const feeType = String(r[ci.feeType]||'').trim();
    const amount = Number(r[ci.amount])||0;
    const serviceName = ci.service >= 0 ? String(r[ci.service]||'').trim() : '';

    // 배민부담금액은 제외
    if (/배민부담금액/.test(feeType)) continue;

    // 서비스별 집계
    if (serviceName) {
      if (!services[serviceName]) services[serviceName] = {count:0, fee:0, delivery:0, ad:0, total:0};
      services[serviceName].count++;
      services[serviceName].total += amount;
      if (/배달비/.test(feeType)) services[serviceName].delivery += amount;
      else if (/광고이용료/.test(feeType)) services[serviceName].ad += amount;
      else services[serviceName].fee += amount;
    }

    // 전체 합계
    if (/배달비/.test(feeType)) totalDelivery += amount;
    else if (/광고이용료/.test(feeType)) totalAd += amount;
    else totalFee += amount;
  }

  return {
    type: 'purchase', ym:[yr,mn], period,
    fee: totalFee, delivery: totalDelivery, ad: totalAd,
    services  // 서비스별 상세 데이터
  };
}

// 매입 데이터 병합 (bm, tg, yg 공통)
function mergePurchase(pf, purchaseData) {
  const key = purchaseData.ym[0] + '-' + String(purchaseData.ym[1]).padStart(2,'0');
  const existing = DB[pf][key];
  if (existing) {
    existing.fee = purchaseData.fee;
    existing.delivery = purchaseData.delivery || 0;
    existing.feeRate = existing.totalRev ? purchaseData.fee / existing.totalRev : 0;
    existing._hasPurchaseData = true;
    if (purchaseData.services) existing.services = purchaseData.services;
    if (purchaseData.ad) existing.ad = purchaseData.ad;
  } else {
    DB[pf][key] = {
      period: purchaseData.period, ym: purchaseData.ym,
      totalRev:0, orders:0, daily:{},
      fee: purchaseData.fee, delivery: purchaseData.delivery || 0,
      feeRate:0, coupon:0,
      _hasPurchaseData: true,
      services: purchaseData.services || {},
      ad: purchaseData.ad || 0,
    };
  }
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
// [H2] 파싱 - 땡겨요 파일명에서 연월 추출 (공통)
// ==============================================
function parseTG_extractYM(filename) {
  // 새 형식: "땡겨요 2025년 03월 매출" 또는 "땡겨요 2025년 03월 매입"
  const mNew = filename.match(/땡겨요\s*(\d{4})년\s*(\d{1,2})월/);
  if (mNew) {
    const yr = +mNew[1], mn = +mNew[2];
    const isSales = /매출/.test(filename);
    const isPurchase = /매입/.test(filename);
    return { yr, mn, period: yr+'년 '+mn+'월', type: isPurchase ? 'purchase' : 'sales' };
  }
  // 구 형식: YYMMDD_YYMMDD_빨간집_매출내역
  const mOld = filename.match(/^(\d{2})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
  if (mOld) {
    const sy=2000+parseInt(mOld[1]), sm=parseInt(mOld[2]);
    return { yr:sy, mn:sm, period: sy+'년 '+sm+'월', type:'sales' };
  }
  return null;
}

// ==============================================
// [H2-1] 파싱 - 땡겨요 매출 (새 형식 XLSX)
// ==============================================
function parseTG_sales_xlsx(wb, filename) {
  const info = parseTG_extractYM(filename);
  if (!info) throw new Error('파일명에서 연월을 추출할 수 없습니다: ' + filename);
  const { yr, mn, period } = info;

  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});
  const toNum = v => parseFloat(String(v||'').replace(/[,₩"]/g,''))||0;

  // 주문번호 헤더 행 찾기
  let hi = -1;
  for (let i=0; i<Math.min(rows.length,15); i++) {
    if ((rows[i]||[]).some(v => v && /주문번호/.test(String(v)))) { hi=i; break; }
  }
  if (hi < 0) throw new Error('땡겨요 매출 헤더를 찾을 수 없습니다');

  const headers = (rows[hi]||[]).map(v => String(v||'').trim());
  const ci = {
    orderId: headers.findIndex(h => /주문번호/.test(h)),
    date:    headers.findIndex(h => /주문일/.test(h)),
    rev:     headers.findIndex(h => /주문결제/.test(h)),
    discount:headers.findIndex(h => /매출할인/.test(h)),
  };
  if (ci.orderId<0) ci.orderId=0;
  if (ci.date<0)    ci.date=1;
  if (ci.rev<0)     ci.rev=2;

  const daily = {}; let totalOrders=0, totalDiscount=0;
  for (let i=hi+1; i<rows.length; i++) {
    const r = rows[i];
    if (!r || !r[ci.orderId]) continue;
    const oid = String(r[ci.orderId]).trim();
    if (oid === '합 계' || !oid) continue;

    // 날짜 추출: "2026-03-06 17:33:48" 또는 빈 값이면 파일명 기준 월 사용
    let ds = '';
    const rawDate = r[ci.date];
    if (rawDate) {
      if (rawDate instanceof Date) {
        ds = rawDate.toISOString().substring(0,10);
      } else {
        ds = String(rawDate).substring(0,10);
      }
    }
    // 날짜가 없는 행은 해당 월의 데이터로 간주 (포장 주문 등)
    if (!ds || ds.length < 10) ds = `${yr}-${String(mn).padStart(2,'0')}-01`;

    const rev = toNum(r[ci.rev]);
    const disc = ci.discount>=0 ? toNum(r[ci.discount]) : 0;
    if (!rev) continue;

    if (!daily[ds]) daily[ds] = {rev:0, orders:0};
    daily[ds].rev += rev;
    daily[ds].orders++;
    totalOrders++;
    totalDiscount += disc;
  }

  const totalRev = Object.values(daily).reduce((s,v) => s+v.rev, 0);
  // 수수료는 매입 파일에서 가져옴, 없으면 추정치 사용
  const feeRate = 0.09+0.033;

  return {
    period, ym:[yr,mn], totalRev, orders:totalOrders, daily,
    fee:totalRev*feeRate, feeRate, delivery:0, coupon:0, discount:totalDiscount,
    _hasPurchaseData: false
  };
}

// ==============================================
// [H2-2] 파싱 - 땡겨요 매입 (XLSX/XLS)
// ==============================================
function parseTG_purchase_xlsx(wb, filename) {
  const info = parseTG_extractYM(filename);
  if (!info) throw new Error('파일명에서 연월을 추출할 수 없습니다: ' + filename);
  const { yr, mn, period } = info;

  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});
  const toNum = v => parseFloat(String(v||'').replace(/[,₩"]/g,''))||0;

  // 상세 내역 헤더 행 찾기 (날짜, 사업자번호, 주문방법, 수수료유형, 주문번호, 공급대가)
  let hi = -1;
  for (let i=0; i<Math.min(rows.length,25); i++) {
    if ((rows[i]||[]).some(v => v && /수수료유형/.test(String(v)))) { hi=i; break; }
  }
  if (hi < 0) throw new Error('땡겨요 매입 헤더를 찾을 수 없습니다');

  const headers = (rows[hi]||[]).map(v => String(v||'').trim());
  const ci = {
    date:    headers.findIndex(h => /날짜/.test(h)),
    method:  headers.findIndex(h => /주문방법/.test(h)),
    feeType: headers.findIndex(h => /수수료유형/.test(h)),
    orderId: headers.findIndex(h => /주문번호/.test(h)),
    amount:  headers.findIndex(h => /공급대가/.test(h)),
  };

  // 수수료 유형별 합산 + 일별 집계
  let totalFee=0, totalDelivery=0;
  const dailyFees = {};

  for (let i=hi+1; i<rows.length; i++) {
    const r = rows[i];
    if (!r || !r[ci.date]) continue;
    const dateStr = String(r[ci.date]).trim();
    if (dateStr === '합 계' || !dateStr) continue;

    const ds = dateStr.substring(0,10);
    const feeType = String(r[ci.feeType]||'').trim();
    const amount = toNum(r[ci.amount]);

    if (!dailyFees[ds]) dailyFees[ds] = {fee:0, delivery:0};

    if (/땡배달이용료/.test(feeType)) {
      totalDelivery += amount;
      dailyFees[ds].delivery += amount;
    } else {
      // 주문중개이용료, 결제정산이용료 → 수수료
      totalFee += amount;
      dailyFees[ds].fee += amount;
    }
  }

  // 요약 행에서도 확인 (행 10~14 영역)
  let summaryFee=0, summaryDelivery=0;
  for (let i=0; i<Math.min(rows.length,20); i++) {
    const r = rows[i];
    if (!r) continue;
    const label = String(r[0]||'').trim();
    const amount = toNum(r[3]); // 공급대가 컬럼
    if (/주문중개이용료|결제정산이용료/.test(label)) summaryFee += amount;
    if (/땡배달이용료/.test(label)) summaryDelivery += amount;
  }

  return {
    type: 'purchase', ym:[yr,mn], period,
    fee: totalFee || summaryFee,
    delivery: totalDelivery || summaryDelivery,
    dailyFees,
    feeRate: 0 // 매출 데이터와 합칠 때 계산
  };
}


// ==============================================
// [H2-4] 파싱 - 땡겨요 CSV (구 형식, 구글 드라이브용)
// ==============================================
function parseTG(text, filename) {
  const info = parseTG_extractYM(filename);
  // 구 형식 지원
  const mf = filename.match(/^(\d{2})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
  if (!info && !mf) throw new Error('파일명 형식을 인식할 수 없습니다: ' + filename);

  let ymList;
  if (mf) {
    const sy=2000+parseInt(mf[1]), sm=parseInt(mf[2]);
    const ey=2000+parseInt(mf[4]), em=parseInt(mf[5]);
    ymList = [];
    let y=sy, mo=sm;
    while(y<ey||(y===ey&&mo<=em)){ ymList.push([y,mo]); mo++; if(mo>12){mo=1;y++;} }
  } else {
    ymList = [[info.yr, info.mn]];
  }

  const lines = text.split('\n').map(l=>l.trim()).filter(l=>l);
  const splitCSV = line => {
    const r=[]; let c='',q=false;
    for(const ch of line){if(ch==='"')q=!q;else if(ch===','&&!q){r.push(c.trim());c='';}else c+=ch;}
    r.push(c.trim()); return r;
  };
  const toNum = v => parseFloat((v||'').replace(/[,₩"]/g,''))||0;

  // 헤더 행 찾기
  let hi = lines.findIndex(l => l.includes('주문번호') || l.includes('주문일') || l.includes('결제일'));
  if (hi < 0) hi = lines.findIndex(l => l.includes(',') && l.split(',').length > 3);
  const headers = splitCSV(lines[hi]||'');
  const ci = {
    date:   headers.findIndex(h=>/주문일|결제일|날짜/.test(h)),
    rev:    headers.findIndex(h=>/주문결제|주문금액|결제금액|매출금액|총.*금액/.test(h)),
    status: headers.findIndex(h=>/상태|주문상태/.test(h)),
  };
  if(ci.date<0) ci.date=1;
  if(ci.rev<0)  ci.rev=2;

  const daily={}; let totalOrders=0;
  for(let i=hi+1;i<lines.length;i++){
    const r=splitCSV(lines[i]);
    if(!r[ci.date] && !r[0]) continue;
    if(/합\s*계/.test(r[0]||'')) continue;
    const status=r[ci.status]||'';
    if(/취소|환불|cancel/i.test(status)) continue;
    let ds = (r[ci.date]||'').substring(0,10).replace(/[./]/g,'-');
    if (!ds || ds.length<10) ds = `${ymList[0][0]}-${String(ymList[0][1]).padStart(2,'0')}-01`;
    const rev=toNum(r[ci.rev]);
    if(!rev) continue;
    if(!daily[ds]) daily[ds]={rev:0,orders:0};
    daily[ds].rev+=rev; daily[ds].orders++; totalOrders++;
  }

  const totalRev=Object.values(daily).reduce((s,v)=>s+v.rev,0);
  const feeRate=0.09+0.033;

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
      fee:moRev*feeRate, feeRate, delivery:0, coupon:0,
      _hasPurchaseData: false
    };
  });
}

// ==============================================
// [H3] 파싱 - 땡겨요 엑셀 (XLSX) - 새/구 형식 자동 감지
// ==============================================
function parseTG_xlsx(wb, filename) {
  const info = parseTG_extractYM(filename);

  // 새 형식: "땡겨요 YYYY년 MM월 매출/매입"
  if (info) {
    if (info.type === 'purchase') return parseTG_purchase_xlsx(wb, filename);
    return parseTG_sales_xlsx(wb, filename);
  }

  // 구 형식: YYMMDD_YYMMDD_... → CSV 변환 후 parseTG 사용
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});
  let hi = 0;
  for(let i=0;i<Math.min(rows.length,10);i++){
    if((rows[i]||[]).some(v=>v&&/주문일|결제일/.test(String(v)))){ hi=i; break; }
  }
  const csvLines = rows.slice(hi).map(row=>(row||[]).map(cell=>{
    if(cell instanceof Date) { const y=cell.getFullYear(),mo=String(cell.getMonth()+1).padStart(2,'0'),d=String(cell.getDate()).padStart(2,'0'); return `${y}-${mo}-${d}`; }
    const v=String(cell||'');
    return v.includes(',')?'"'+v+'"':v;
  }).join(','));
  return parseTG(csvLines.join('\n'), filename);
}

// ==============================================
// [I1] 파싱 - 요기요 파일명에서 연월 추출
// ==============================================
function parseYG_extractYM(filename) {
  // 파일명 패턴: 사업자번호_매출내역_YYYYMMDD_YYYYMMDD.xlsx 또는 사업자번호_매입내역_YYYYMMDD_YYYYMMDD.xlsx
  const m = filename.match(/_(매출내역|매입내역)_(\d{4})(\d{2})\d{2}_(\d{4})(\d{2})\d{2}/);
  if (!m) return null;
  const type = m[1] === '매입내역' ? 'purchase' : 'sales';
  const yr = +m[2], mn = +m[3];
  return { yr, mn, period: yr+'년 '+mn+'월', type };
}

// ==============================================
// [I2] 파싱 - 요기요 매출 (XLSX)
// ==============================================
function parseYG_sales_xlsx(wb, filename) {
  const info = parseYG_extractYM(filename);
  if (!info) throw new Error('파일명에서 연월을 추출할 수 없습니다: ' + filename);
  const { yr, mn, period } = info;

  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});
  const toNum = v => parseFloat(String(v||'').replace(/[,₩"]/g,''))||0;

  // 행 15~16 영역에서 합계 헤더 찾기 (매출건수, 매출합계)
  let summaryRow = null;
  for (let i=0; i<Math.min(rows.length,20); i++) {
    if ((rows[i]||[]).some(v => v && /매출건수/.test(String(v)))) {
      summaryRow = rows[i+1]; // 데이터는 헤더 바로 다음 행
      break;
    }
  }

  let totalOrders = 0, totalRev = 0;
  if (summaryRow) {
    totalOrders = toNum(summaryRow[0]);
    totalRev = toNum(summaryRow[summaryRow.length-1]); // 마지막 컬럼 = 매출합계
  }

  // 상세 데이터 헤더 찾기 (거래일시, 주문번호 등)
  let detailHi = -1;
  for (let i=0; i<Math.min(rows.length,25); i++) {
    if ((rows[i]||[]).some(v => v && /거래일시/.test(String(v)))) { detailHi=i; break; }
  }

  const daily = {};
  if (detailHi >= 0 && detailHi+1 < rows.length) {
    const headers = (rows[detailHi]||[]).map(v => String(v||'').trim());
    const ci = {
      date: headers.findIndex(h => /거래일시/.test(h)),
      rev:  headers.findIndex(h => /주문금액$/.test(h)),
    };
    if (ci.date < 0) ci.date = 0;
    if (ci.rev < 0) ci.rev = 4; // 주문금액 컬럼

    let detailOrders = 0, detailRev = 0;
    for (let i=detailHi+1; i<rows.length; i++) {
      const r = rows[i];
      if (!r || !r[ci.date]) continue;
      let ds = '';
      const rawDate = r[ci.date];
      if (rawDate instanceof Date) {
        ds = rawDate.toISOString().substring(0,10);
      } else {
        ds = String(rawDate).substring(0,10);
      }
      if (!ds || ds.length < 10) continue;

      const rev = toNum(r[ci.rev]);
      if (!rev) continue;

      if (!daily[ds]) daily[ds] = {rev:0, orders:0};
      daily[ds].rev += rev;
      daily[ds].orders++;
      detailOrders++;
      detailRev += rev;
    }
    if (detailOrders > 0) {
      totalOrders = detailOrders;
      totalRev = detailRev;
    }
  }

  // 상세 데이터가 없으면 월 1일에 총액 할당
  if (Object.keys(daily).length === 0 && totalRev > 0) {
    const ds = `${yr}-${String(mn).padStart(2,'0')}-01`;
    daily[ds] = {rev: totalRev, orders: totalOrders};
  }

  return {
    period, ym:[yr,mn], totalRev, orders:totalOrders, daily,
    fee:0, feeRate:0, delivery:0, coupon:0,
    _hasPurchaseData: false
  };
}

// ==============================================
// [I3] 파싱 - 요기요 매입 (XLSX)
// ==============================================
function parseYG_purchase_xlsx(wb, filename) {
  const info = parseYG_extractYM(filename);
  if (!info) throw new Error('파일명에서 연월을 추출할 수 없습니다: ' + filename);
  const { yr, mn, period } = info;

  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});
  const toNum = v => parseFloat(String(v||'').replace(/[,₩"]/g,''))||0;

  // 합계 행 찾기 (행 14~15 영역: 매수, 공급가액, 세액, 합계)
  let totalFee = 0;
  for (let i=0; i<Math.min(rows.length,20); i++) {
    if ((rows[i]||[]).some(v => v && /합계/.test(String(v)))) {
      // 합계 헤더 다음 행이 데이터
      const dataRow = rows[i+1];
      if (dataRow) {
        // 합계금액 = 마지막 컬럼 또는 인덱스 3
        totalFee = toNum(dataRow[3]) || toNum(dataRow[dataRow.length-1]);
      }
      break;
    }
    // 매수 헤더 찾기
    if ((rows[i]||[]).some(v => v && /매수/.test(String(v)) && /공급가액/.test(String(rows[i]||[])))) {
      const dataRow = rows[i+1];
      if (dataRow) {
        totalFee = toNum(dataRow[3]) || toNum(dataRow[dataRow.length-1]);
      }
      break;
    }
  }

  // 헤더에서 직접 찾기: "매수, 공급가액, 세액, 합계" 패턴
  if (!totalFee) {
    for (let i=0; i<Math.min(rows.length,20); i++) {
      const r = rows[i];
      if (!r) continue;
      const rowStr = (r||[]).map(v=>String(v||'')).join(',');
      if (/매수/.test(rowStr) && /공급가액/.test(rowStr)) {
        const dataRow = rows[i+1];
        if (dataRow) {
          // 합계 컬럼 (보통 인덱스 3)
          totalFee = toNum(dataRow[3]);
        }
        break;
      }
    }
  }

  return {
    type: 'purchase', ym:[yr,mn], period,
    fee: totalFee,
    delivery: 0,
    feeRate: 0
  };
}


// ==============================================
// [I5] 파싱 - 요기요 엑셀 (XLSX) - 매출/매입 자동 감지
// ==============================================
function parseYG_xlsx(wb, filename) {
  const info = parseYG_extractYM(filename);
  if (!info) throw new Error('요기요 파일명을 인식할 수 없습니다: ' + filename);

  if (info.type === 'purchase') return parseYG_purchase_xlsx(wb, filename);
  return parseYG_sales_xlsx(wb, filename);
}
