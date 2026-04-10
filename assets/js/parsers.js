// [B] 데이터 저장소
// ==============================================
const DB    = { bm:{}, cp:{}, tg:{}, yg:{}, ts:{}, nv:{}, di:{} };
const FILES = { bm:[], cp:[], tg:[], yg:[], ts:[], nv:[], di:[] };

// ==============================================
// [C] 헬퍼 유틸
// ==============================================
const W         = n  => '₩' + Math.round(n||0).toLocaleString('ko-KR');
const Pct       = (a,b) => b ? (a/b*100).toFixed(1)+'%' : '0%';
const fixedCost = () => {
  const base = (S.rent||0)+(S.internet||0)+(S.cardTerminal||0)+(S.cctv||0)+(S.elec||0)+(S.gas||0)+(S.water||0)+(S.pack||0)+(S.etc||0);
  return base + (S.customExpenses||[]).reduce((s,i) => s + (i.amount||0), 0);
};
const bmFeeRate = () => (S.bmComm + S.bmPg + S.bmVat + S.bmExtra) / 100;
const allMonths = () => [...new Set([...Object.keys(DB.bm), ...Object.keys(DB.cp), ...Object.keys(DB.tg), ...Object.keys(DB.yg), ...Object.keys(DB.ts), ...Object.keys(DB.nv), ...Object.keys(DB.di)])].sort();
const toNum     = v => parseFloat(String(v||'').replace(/[,₩"원]/g,''))||0;

function couponAmt(orderAmt) {
  if (orderAmt >= S.cp3Min) return S.cp3Amt;
  if (orderAmt >= S.cp2Min) return S.cp2Amt;
  if (orderAmt >= S.cp1Min) return S.cp1Amt;
  return 0;
}
function fmtDate(d) {
  if (!d) return '';
  if (d instanceof Date) {
    const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${dd}`;
  }
  const s = String(d).substring(0,10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
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
function toastCenter(msg) {
  let el = document.getElementById('toastCenter');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toastCenter';
    el.className = 'toast-center';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
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
// [D] 배민 재계산 (설정 수수료 기반 - 매입 데이터 없을 때)
// ==============================================
// 배민 매출만 있고 매입 없을 때 설정값으로 추정
function recalcBM(d) {
  if (d._hasPurchase) return; // 매입 데이터가 있으면 recalcMerged 사용
  const fr   = bmFeeRate();
  d.fee      = d.totalRev * fr;
  d.feeRate  = fr;
  d.delivery = d.orders * S.bmDel;
  if (d._orderAmounts) d.coupon = d._orderAmounts.reduce((s,a) => s + couponAmt(a), 0);
}

// ==============================================
// [E] 배민 매출 파싱
// 파일명: 매출상세내역_YYYY년MM월DD일(요일)_YYYY년MM월DD일(요일)_사업자번호_날짜.xlsx
// ==============================================
// ==============================================
// [BM-S] 배민 정산명세서 파싱 (이름 기반 컬럼 매핑)
// 파일명: [배달의민족] ... YYYY년 M월 정산명세서.xlsx
// 시트: '상세' — Row4가 소분류 헤더, Row5부터 데이터
// 주문일(col1 정산대상기간) 기준으로 월 분류
// ==============================================
function parseBM_settlement(wb, filename) {
  const sn = wb.SheetNames.find(s => s.includes('상세')) || wb.SheetNames[wb.SheetNames.length-1];
  const ws = wb.Sheets[sn];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});

  // Row4 소분류 헤더에서 이름으로 컬럼 인덱스 매핑
  const h = (rows[4]||[]).map(v => v ? String(v).trim() : '');
  const col = name => h.findIndex(v => v === name);
  const colLike = name => h.findIndex(v => v.includes(name));

  // 컬럼 인덱스 매핑 (이름 기반 — 파일마다 위치 달라도 OK)
  const C = {
    입금일: 0, 정산대상기간: 1, 입금금액: 2, 주문유형: col('주문유형/기타'),
    // 매출
    바로결제: col('바로결제주문금액'), 만나서결제: col('만나서결제주문금액'),
    // 중개이용료
    배민1중개: col('배민1중개이용료'), 알뜰중개: col('알뜰배달 중개이용료'),
    가게배달중개: col('가게배달중개이용료'), 픽업중개: col('픽업중개이용료'),
    // 즉시할인 (가게부담)
    즉시할인: col('주문금액 즉시할인'), 파트너쿠폰: col('파트너부담쿠폰'),
    포장할인: col('포장할인'), 가게주문할인: col('가게주문금액할인'), 메뉴할인: col('메뉴할인'),
    // 배달비
    한집배달비: col('배민1 한집배달 배달비'), 알뜰배달비: col('알뜰배달 배달비'),
    바로결제배달팁: col('바로결제배달팁'), 만나서결제배달팁: col('만나서결제배달팁'),
    // 결제정산수수료
    기본수수료: col('기본수수료(정률)'), 우대수수료: col('우대수수료'),
    // 부가세
    부가세: col('(E) 부가세'),
    // 광고
    광고요금: col('우리가게클릭 이용요금'), 광고부가세: col('부가세'),
    // 기타
    보정금액: col('보정금액'), 부분환불: col('부분환불금액'),
    기타: col('(D) 기타'), 배민오더: col('(G) 배민오더'),
    입금금액H: col('(H) 입금금액'),
  };
  // 광고부가세 = '부가세' 컬럼인데 (E)부가세와 다른 위치
  if (C.광고부가세 === C.부가세 || C.광고부가세 < 0) {
    // '부가세'가 여러 개일 수 있으므로 광고요금 바로 뒤 찾기
    if (C.광고요금 >= 0) C.광고부가세 = h.indexOf('부가세', C.광고요금);
  }

  // 주문일(정산대상기간) 기준 월별 데이터 수집
  const monthData = {};
  const v = (r, idx) => idx >= 0 ? (Number(r[idx])||0) : 0;

  for (let i = 5; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const type = String(r[C.주문유형]||'').trim();
    if (!type) continue;

    // 주문일 파싱 (col1: '2026-01-05' 또는 '2026-01-02 ~ 2026-01-04')
    const periodStr = String(r[C.정산대상기간]||'');
    const dateMatch = periodStr.match(/(\d{4})-(\d{2})/);
    if (!dateMatch) continue;
    const moKey = dateMatch[1] + '-' + dateMatch[2];

    if (!monthData[moKey]) monthData[moKey] = {
      rev:0, broker:0, brokerHome:0, pgFee:0, delFee:0,
      adSupply:0, adVat:0, vat:0, instantDisc:0,
      adjust:0, refund:0, etc:0, bOrder:0, settle:0,
    };
    const md = monthData[moKey];

    // 매출
    md.rev += v(r, C.바로결제) + v(r, C.만나서결제);
    // 중개이용료 (배민부담 포함 — 이미 합산되어 있음)
    md.broker += v(r, C.배민1중개) + v(r, C.알뜰중개) + v(r, C.픽업중개);
    md.brokerHome += v(r, C.가게배달중개);
    // 결제정산수수료
    md.pgFee += v(r, C.기본수수료) + v(r, C.우대수수료);
    // 배달비
    md.delFee += v(r, C.한집배달비) + v(r, C.알뜰배달비) + v(r, C.바로결제배달팁) + v(r, C.만나서결제배달팁);
    // 광고
    md.adSupply += v(r, C.광고요금);
    md.adVat += v(r, C.광고부가세);
    // 부가세
    md.vat += v(r, C.부가세) + v(r, C.광고부가세);
    // 즉시할인 (가게부담)
    md.instantDisc += v(r, C.즉시할인) + v(r, C.파트너쿠폰) + v(r, C.포장할인) + v(r, C.가게주문할인) + v(r, C.메뉴할인);
    // 기타 (입금예정에 합산)
    md.adjust += v(r, C.보정금액);
    md.refund += v(r, C.부분환불);
    md.etc += v(r, C.기타);
    md.bOrder += v(r, C.배민오더);
    // 입금금액
    md.settle += v(r, C.입금금액H);
  }

  // 월별 결과 배열 반환
  const results = Object.entries(monthData).map(([moKey, md]) => {
    const [y, m] = moKey.split('-').map(Number);
    // finalSettle = 입금금액 + 보정 + 환불 + 기타 + 배민오더
    const finalSettle = md.settle;
    return {
      period: y+'년 '+m+'월', ym: [y, m],
      totalRev: md.rev,
      orders: 0, // 정산명세서에 주문건수 없음 — 매출파일에서 보충
      daily: {},
      fee: Math.abs(md.broker) + Math.abs(md.brokerHome) + Math.abs(md.pgFee),
      delivery: Math.abs(md.delFee),
      ad: Math.abs(md.adSupply),
      coupon: Math.abs(md.instantDisc),
      // 개별 항목 (카드 표시용)
      broker: Math.abs(md.broker),
      brokerHome: Math.abs(md.brokerHome),
      pgFee: Math.abs(md.pgFee),
      delFee: Math.abs(md.delFee),
      adSupply: Math.abs(md.adSupply),
      vat: Math.abs(md.vat),
      instantDisc: Math.abs(md.instantDisc),
      // 입금 관련
      adjust: md.adjust, refund: md.refund, etcFee: md.etc, bOrder: md.bOrder,
      finalSettle,
      _hasPurchaseData: true,
      _isSettlement: true,
      services: {},
    };
  });

  if (!results.length) throw new Error('배민 정산명세서에서 데이터를 찾을 수 없습니다.');
  return results;
}

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
    const ds = fmtDate(r[0]), on = r[1], amt = Number(r[6])||0;
    if (!ds || !on) continue;
    if (!orderMap[on]) orderMap[on] = {date:ds, total:0};
    orderMap[on].total += amt;
  }

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
// [E2] 배민 매입 파싱
// 헤더(11행): 일자,서비스,발급구분,수수료유형,증빙구분,발급번호,서비스거래번호,공급가액,부가세,합계,기준금액
// ==============================================
function parseBM_purchase_xlsx(wb, filename) {
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});

  const mf = filename.match(/(\d{4})년(\d{2})월/);
  if (!mf) throw new Error('배민 매입 파일명에서 연월을 추출할 수 없습니다');
  const yr = +mf[1], mn = +mf[2];
  const period = yr+'년 '+mn+'월';

  // 헤더 행 찾기
  let hi = -1;
  for (let i=0; i<Math.min(rows.length,15); i++) {
    if ((rows[i]||[]).some(v => v && /수수료유형/.test(String(v)))) { hi=i; break; }
  }
  if (hi < 0) throw new Error('배민 매입 헤더를 찾을 수 없습니다');

  const headers = (rows[hi]||[]).map(v => String(v||'').trim());
  const ci = {
    date:     headers.findIndex(h => /^일자$/.test(h)),
    service:  headers.findIndex(h => /^서비스$/.test(h)),
    issueType:headers.findIndex(h => /발급구분/.test(h)),
    feeType:  headers.findIndex(h => /수수료유형/.test(h)),
    proofType:headers.findIndex(h => /증빙구분/.test(h)),
    issueNo:  headers.findIndex(h => /발급번호/.test(h)),
    txId:     headers.findIndex(h => /서비스거래번호/.test(h)),
    supply:   headers.findIndex(h => /공급가액/.test(h)),
    vat:      headers.findIndex(h => /부가세/.test(h)),
    total:    headers.findIndex(h => /^합계$/.test(h)),
    orderAmt: headers.findIndex(h => /기준금액/.test(h)),
  };

  let totalFee=0, totalDelivery=0, totalAd=0;
  const services = {};
  // 건별 상세 데이터
  const details = [];
  // 주문번호별 그룹핑 (999 파일의 주문별정리 형태)
  const orderDetails = {};

  for (let i=hi+1; i<rows.length; i++) {
    const r = rows[i];
    if (!r || !r[ci.date] || String(r[ci.date]).trim()==='계') continue;
    const feeType = String(r[ci.feeType]||'').trim();
    const serviceName = ci.service >= 0 ? String(r[ci.service]||'').trim() : '';
    const txId = ci.txId >= 0 ? String(r[ci.txId]||'').trim() : '';
    const supply = Number(r[ci.supply])||0;
    const vat = Number(r[ci.vat])||0;
    const total = Number(r[ci.total])||0;
    const orderAmt = Number(r[ci.orderAmt])||0;
    const ds = fmtDate(r[ci.date]);
    const isBmBurden = /배민부담금액/.test(feeType);

    // 건별 상세 저장
    const detail = {
      date: ds, service: serviceName, txId, orderAmt,
      feeType, supply, vat, total, isBmBurden,
    };
    details.push(detail);

    // 주문번호별 그룹핑
    const groupKey = txId || ds+'_'+serviceName+'_'+i;
    if (!orderDetails[groupKey]) {
      orderDetails[groupKey] = {
        date:ds, service:serviceName, txId, orderAmt,
        settleFee:0, brokerageFee:0, brokerageHomeFee:0, deliveryFee:0, adFee:0,
        supplyTotal:0, vatTotal:0, total:0,
        bmSettleFee:0, bmBrokerageFee:0, bmDeliveryFee:0, bmTotal:0,
        actualTotal:0,
      };
    }
    const od = orderDetails[groupKey];
    if (orderAmt > 0) od.orderAmt = orderAmt;

    // 배민부담금액도 사장님 부담과 합산 (공급가액 기준)
    if (/결제정산/.test(feeType)) { od.settleFee += supply; }
    else if (/중개이용료\(가게배달\)/.test(feeType)) { od.brokerageHomeFee += supply; }
    else if (/중개이용료/.test(feeType)) { od.brokerageFee += supply; }
    else if (/배달비/.test(feeType)) { od.deliveryFee += supply; totalDelivery += supply; }
    else if (/광고이용료/.test(feeType)) { od.adFee += supply; totalAd += supply; }
    if (isBmBurden) { od.bmTotal += total; }
    od.supplyTotal += supply;
    od.vatTotal += vat;
    od.total += total;
    if (!/광고/.test(feeType)) totalFee += supply;
  }

  // 주문별 실부담합계 계산
  Object.values(orderDetails).forEach(od => {
    od.actualTotal = od.total + od.bmTotal;
  });

  // 서비스별 집계 (사장님 부담 기준: 수수료+배달비+광고비)
  Object.values(orderDetails).forEach(od => {
    const sn = od.service === '픽업' ? '포장' : (od.service || '기타');
    if (!services[sn]) services[sn] = {count:0, orderAmt:0, fee:0, delivery:0, ad:0, total:0};
    services[sn].count++;
    services[sn].orderAmt += od.orderAmt;
    services[sn].fee += od.settleFee + od.brokerageFee;
    services[sn].delivery += od.deliveryFee;
    services[sn].ad += od.adFee;
    services[sn].total += (od.settleFee + od.brokerageFee) + od.deliveryFee + od.adFee;
  });

  // 카드용 개별 항목 합산
  let aggBroker=0, aggBrokerHome=0, aggPgFee=0, aggDelFee=0, aggVat=0;
  Object.values(orderDetails).forEach(od => {
    aggBroker += od.brokerageFee;
    aggBrokerHome += od.brokerageHomeFee;
    aggPgFee += od.settleFee;
    aggDelFee += od.deliveryFee;
    aggVat += od.vatTotal;
  });

  return {
    type: 'purchase', ym:[yr,mn], period,
    fee: totalFee, delivery: totalDelivery, ad: totalAd,
    // 카드용 개별 항목 (배민 앱 정산 화면과 동일)
    broker: aggBroker,     // 중개이용료 (공급가액)
    brokerHome: aggBrokerHome, // 중개이용료(가게배달) (공급가액)
    pgFee: aggPgFee,       // 결제정산수수료 (공급가액)
    delFee: aggDelFee,     // 배달비 (공급가액)
    vat: aggVat,           // 부가세 합계
    adSupply: totalAd,     // 광고비 (공급가액, 우리가게클릭)
    services, details, orderDetails: Object.values(orderDetails),
  };
}

// ==============================================
// [E3] DB 구조 통합 관리
// DB[pf][month] = {
//   _files: 1 or 2,        // 파일 수
//   _hasSales: bool,        // 매출 데이터 유무
//   _hasPurchase: bool,     // 매입 데이터 유무
//   period, ym,             // 기본 정보
//   sales: {...},           // 매출 원본 데이터
//   purchase: {...},        // 매입 원본 데이터
//   // 합산 데이터 (화면 표시용)
//   totalRev, orders, daily, fee, delivery, ad, coupon, feeRate, services, ...
// }
// ==============================================

// 매출+매입 합산 계산
function recalcMerged(entry) {
  const s = entry.sales || {};
  const p = entry.purchase || {};
  // 매출 데이터
  entry.totalRev = s.totalRev || 0;
  entry.orders = s.orders || 0;
  entry.daily = s.daily || {};
  entry.coupon = s.coupon || 0;
  // 매입 데이터 (매입 있으면 매입 우선, 없으면 매출 파일의 값 사용)
  const src = entry._hasPurchase ? p : (entry._hasSales ? s : {});
  entry.fee = src.fee || 0;
  entry.delivery = src.delivery || 0;
  entry.ad = src.ad || 0;
  entry.coupon = s.coupon || 0;
  entry.feeRate = entry.totalRev ? entry.fee / entry.totalRev : 0;
  entry.services = src.services || {};
  entry.orderDetails = src.orderDetails || [];
  // 개별 항목 (쿠팡 정산 카드용)
  entry.broker = src.broker || s.broker || 0;
  entry.brokerHome = src.brokerHome || s.brokerHome || 0;
  entry.pgFee = src.pgFee || s.pgFee || 0;
  entry.delFee = src.delFee || s.delFee || 0;
  entry.adSupply = src.adSupply || s.adSupply || 0;
  entry.adVat = src.adVat || s.adVat || 0;
  entry.shopCoupon = src.shopCoupon || s.shopCoupon || 0;
  entry.instantDel = src.instantDel || s.instantDel || 0;
  entry.instantFood = src.instantFood || s.instantFood || 0;
  entry.vat = src.vat || s.vat || 0;
  entry.instantDisc = src.instantDisc || s.instantDisc || 0;
  entry.settleAN = src.settleAN || s.settleAN || 0;
  entry.promo = src.promo || s.promo || 0;
  entry.refund = src.refund || s.refund || 0;
  entry.adjust = src.adjust || s.adjust || 0;
  entry.etcFee = src.etcFee || s.etcFee || 0;
  entry.bOrder = src.bOrder || s.bOrder || 0;
  entry.finalSettle = src.finalSettle || s.finalSettle || ((entry.settleAN||0) + (entry.promo||0) + (entry.refund||0));
  entry._hasPurchaseData = entry._hasPurchase || (s._hasPurchaseData || false);
}

// 매입 데이터 저장
function mergePurchase(pf, purchaseData) {
  const key = purchaseData.ym[0] + '-' + String(purchaseData.ym[1]).padStart(2,'0');
  const existing = DB[pf][key];
  if (existing) {
    existing.purchase = { ...purchaseData };
    existing._hasPurchase = true;
    existing._files = (existing._hasSales ? 1 : 0) + 1;
    recalcMerged(existing);
  } else {
    DB[pf][key] = {
      period: purchaseData.period, ym: purchaseData.ym,
      _files: 1, _hasSales: false, _hasPurchase: true,
      sales: {},
      purchase: { ...purchaseData },
      totalRev:0, orders:0, daily:{}, fee:purchaseData.fee,
      delivery:purchaseData.delivery||0, ad:purchaseData.ad||0,
      feeRate:0, coupon:0, services:purchaseData.services||{},
      _hasPurchaseData: true,
    };
  }
}

// 매출 데이터 저장
function mergeSales(pf, salesData) {
  const key = salesData.ym[0] + '-' + String(salesData.ym[1]).padStart(2,'0');
  const existing = DB[pf][key];
  if (existing) {
    existing.sales = { ...salesData };
    existing._hasSales = true;
    existing._files = 1 + (existing._hasPurchase ? 1 : 0);
    existing.period = salesData.period;
    existing.ym = salesData.ym;
    recalcMerged(existing);
  } else {
    const entry = {
      period: salesData.period, ym: salesData.ym,
      _files: 1, _hasSales: true, _hasPurchase: false,
      sales: { ...salesData },
      purchase: {},
    };
    // 쿠팡/땡겨요/요기요는 매출 파일에 수수료 포함
    if (salesData._hasPurchaseData) {
      entry._hasPurchase = true;
      entry._files = 1;
      entry.purchase = {
        fee: salesData.fee || 0, delivery: salesData.delivery || 0,
        ad: salesData.ad || 0, coupon: salesData.coupon || 0,
        services: salesData.services || {},
        orderDetails: salesData.orderDetails || [],
        summary: salesData.purchaseSummary || null,
      };
    }
    DB[pf][key] = entry;
    recalcMerged(entry);
  }
}

// ==============================================
// [F] 쿠팡이츠 파싱 (매출+매입 통합, 구/신 형식 자동 감지)
// 신형식(2025-04~): 행0=카테고리, 행1=메인헤더, 행2=서브헤더, 43컬럼
// 구형식(~2025-03): 행0=메인헤더, 행1=서브헤더, 32컬럼
// ==============================================
function parseCP_xlsx(wb, filename) {
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});
  const m    = filename.match(/(\d{4})-(\d{2})/);
  if (!m) throw new Error('파일명 형식: coupang_eats_YYYY-MM.xlsx');
  const period = m[1]+'년 '+m[2]+'월', ym = [+m[1], +m[2]];

  // 구/신 형식 자동 감지: 행0에 "주문정보"가 있으면 신형식, "거래일"이 있으면 구형식
  const row0str = (rows[0]||[]).map(v => String(v||'').trim()).join('');
  const isNew = row0str.includes('주문정보');
  const dataStart = isNew ? 3 : 2; // 데이터 시작 행

  // 컬럼 매핑
  let ci, getCols;
  // ── 컬럼 매핑 (A~AN, 총 40열) ──
  // K=10(주문금액=정산기준매출) N=13(상점부담쿠폰)
  // Q=16(중개이용료산정후) S=18(PG수수료) V=21(배달비산정후)
  // W=22(즉시할인배달) X=23(즉시할인음식)
  // AF=31(서비스이용료공급가액=V+S+Q) AI=34(광고공급가액) AJ=35(광고부가세)
  // AN=39(정산금액산정후)
  // 부가세 = AF×10% + AJ
  // 정산공식: AN = K - N - Q - S - V - AI - (AF×10%+AJ) - (W+X)
  if (isNew) {
    ci = {date:0, orderId:2, type:3, txType:8, orderAmt:10, cpBurden:12, shopBurden:13};
    getCols = r => ({
      N: Math.abs(Number(r[13])||0),   // 상점부담쿠폰
      Q: Math.abs(Number(r[16])||0),   // 중개이용료 산정후
      S: Math.abs(Number(r[18])||0),   // 결제대행사 수수료
      V: Math.abs(Number(r[21])||0),   // 배달비 산정후
      W: Math.abs(Number(r[22])||0),   // 즉시할인 배달전용
      X: Math.abs(Number(r[23])||0),   // 즉시할인 음식전용
      AF: Math.abs(Number(r[31])||0),  // 서비스이용료 공급가액 (=V+S+Q)
      AI: Math.abs(Number(r[34])||0),  // 광고 공급가액
      AJ: Math.abs(Number(r[35])||0),  // 광고 부가세
      AN: Number(r[39])||0,            // 정산금액
      AP: Number(r[41])||0,            // 프로모션 혜택
      AQ: Number(r[42])||0,            // 환급액
    });
  } else {
    ci = {date:0, orderId:4, type:2, txType:7, orderAmt:10, cpBurden:12, shopBurden:13};
    getCols = r => ({
      N: Math.abs(Number(r[13])||0),
      Q: Math.abs(Number(r[14])||0),
      S: Math.abs(Number(r[15])||0),
      V: Math.abs(Number(r[16])||0),
      W:0, X:0, AF:0,
      AI: Math.abs(Number(r[30])||0),
      AJ: 0,
      AN: Number(r[31])||0,
      AP: 0, AQ: 0,
    });
  }

  const daily = {};
  let totalFee=0, totalDel=0, totalCoupon=0, totalOrders=0, totalAd=0;
  // 개별 항목 합계
  let tQ=0, tR=0, tV=0, tAG=0, tAI=0, tAJ=0, tN=0, tW=0, tX=0, tAN=0, tAP=0, tAQ=0;
  const orderList = [];

  for (let i = dataStart; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[ci.date]) continue;
    const ds = fmtDate(r[ci.date]);
    if (!ds) continue;

    const txType = String(r[ci.txType]||'').trim();
    const isCancel = /취소|CANCEL/i.test(txType);
    if (txType && !/결제|PAY|취소|CANCEL/i.test(txType)) continue;

    const K = Number(r[ci.orderAmt])||0; // 주문금액 (정산기준 매출)
    if (K === 0) continue;

    const c = getCols(r);

    // 카드 표시 항목 (쿠팡 정산 규칙):
    // 상점쿠폰=N, 중개=Q, PG수수료=S, 배달비=V, 광고=AI
    // 서비스이용료공급가액 AF=V+S+Q, 부가세=AF×10%+AJ, 즉시할인=W+X
    // 정산=K-N-Q-S-V-AI-부가세-(W+X)
    const sign = isCancel ? -1 : 1;
    const vat = Math.round(c.AF * 0.1) + c.AJ;  // 부가세
    const fee = (c.Q + c.S + vat) * sign;         // 수수료 합산 (중개+PG+부가세)
    const delivery = c.V * sign;
    const coupon = (c.N + c.W + c.X) * sign;
    const ad = c.AI * sign;

    if (!daily[ds]) daily[ds] = {rev:0, orders:0};
    daily[ds].rev += K;
    daily[ds].orders += sign;

    totalFee += fee;
    totalDel += delivery;
    totalCoupon += coupon;
    totalAd += ad;
    totalOrders += sign;
    tQ += c.Q*sign; tR += c.S*sign; tV += c.V*sign;
    tAG += vat*sign; tAI += c.AI*sign; tAJ += c.AJ*sign;
    tN += c.N*sign; tW += c.W*sign; tX += c.X*sign;
    tAN += c.AN; tAP += (c.AP||0)*sign; tAQ += (c.AQ||0)*sign;

    if (!isCancel) {
      orderList.push({
        date:ds, orderId:String(r[ci.orderId]||''), type:String(r[ci.type]||''),
        orderAmt:K, fee:Math.abs(fee), realDel:Math.abs(delivery), adAmt:Math.abs(ad),
        shopCoupon:c.N, instantDelDisc:c.W, instantFoodDisc:c.X,
        broker:c.Q, pgFee:c.S, vat,
        delFee:c.V, adSupply:c.AI, adVat:c.AJ,
        settleAmt:c.AN,
      });
    }
  }

  if (totalOrders <= 0) throw new Error('쿠팡이츠 파일에서 데이터를 찾을 수 없습니다.');

  // 서비스(주문유형)별 집계
  const services = {};
  orderList.forEach(o => {
    const sn = o.type || '기타';
    if (!services[sn]) services[sn] = {count:0, orderAmt:0, fee:0, delivery:0, ad:0, total:0};
    services[sn].count++;
    services[sn].orderAmt += o.orderAmt;
    services[sn].fee += o.fee;
    services[sn].delivery += o.realDel;
    services[sn].ad += o.adAmt;
    services[sn].total += o.fee + o.realDel + o.adAmt;
  });

  const totalRev = Object.values(daily).reduce((s,v) => s + v.rev, 0);

  return {
    period, ym, totalRev, orders:totalOrders, daily,
    fee: totalFee, feeRate: totalRev ? totalFee/totalRev : 0,
    delivery: totalDel, coupon: totalCoupon, ad: totalAd,
    // 개별 항목 (카드 표시용)
    broker: tQ, pgFee: tR, delFee: tV,
    adSupply: tAI, adVat: tAJ,
    shopCoupon: tN, instantDel: tW, instantFood: tX,
    vat: tAG, instantDisc: tW + tX,
    settleAN: tAN, promo: tAP, refund: tAQ,
    finalSettle: tAN + tAP + tAQ, // 최종 입금예정 = AN + AP + AQ
    _hasPurchaseData: true,
    orderDetails: orderList, services,
  };
}

// ==============================================
// [G] 땡겨요 파싱 - 건별정산내역
// 파일명: 땡겨요 정산내역(건별).xls / 땡겨요 정산내역(건별) (1).xls
// 헤더: 행38 (가게명x3,년도,월,일,시간,분,초,주문번호,주문유형,배달유형,거래상태,
//        주문금액,배달비,(A)주문결제,...차감금액...,(C)정산금액,입금예정일)
// 다중 월 데이터 포함 가능
// ==============================================
function parseTG_xlsx(wb, filename) {
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});

  // 헤더 행 찾기: "주문번호"와 "주문금액"이 있는 마지막 행
  let hi = -1;
  for (let i=0; i<Math.min(rows.length,50); i++) {
    const row = (rows[i]||[]).map(v=>String(v||'').trim());
    if (row.includes('주문번호') && row.includes('주문금액')) { hi=i; }
  }
  if (hi < 0) throw new Error('땡겨요 헤더를 찾을 수 없습니다');

  const headers = (rows[hi]||[]).map(v => String(v||'').trim());
  const ci = {
    yr:    headers.indexOf('년도'),
    mo:    headers.indexOf('월'),
    day:   headers.indexOf('일'),
    orderId: headers.indexOf('주문번호'),
    orderType: headers.indexOf('주문유형'),
    delType: headers.indexOf('배달유형'),
    status: headers.indexOf('거래상태'),
    orderAmt: headers.indexOf('주문금액'),
    delFee: headers.indexOf('배달비'),
    totalPay: headers.indexOf('(A)주문결제'),
    brokerFee: headers.indexOf('주문중개이용료'),
    settleFee: headers.indexOf('결제정산이용료'),
    ddDelFee: headers.indexOf('땡배달이용료'),
    shopCoupon: headers.indexOf('사장님쿠폰'),
    settle: headers.indexOf('(C)정산금액'),
    depositDate: headers.indexOf('입금(예정)일'),
  };
  // 프로모션 사장님 부담금
  const promoIdx = headers.findIndex(h => /프로모션/.test(h) && /부담/.test(h));

  // 월별 데이터 수집
  const monthData = {};

  for (let i=hi+1; i<rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const firstCell = String(r[0]||'').trim();
    if (/합\s*계/.test(firstCell)) continue;
    if (!r[ci.orderId]) continue;

    const yr = Number(r[ci.yr])||0;
    const mo = Number(r[ci.mo])||0;
    const day = Number(r[ci.day])||0;
    if (!yr || !mo || !day) continue;

    const status = String(r[ci.status]||'').trim();
    if (/취소|환불/.test(status)) continue;

    const moKey = yr+'-'+String(mo).padStart(2,'0');
    const ds = `${yr}-${String(mo).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

    if (!monthData[moKey]) monthData[moKey] = {
      yr, mo, daily:{}, orders:0, totalRev:0,
      totalFee:0, totalDel:0, totalCoupon:0,
      orderList:[],
    };
    const md = monthData[moKey];

    const orderAmt = Number(r[ci.orderAmt])||0;
    const delFee = Number(r[ci.delFee])||0;
    const totalPay = Number(r[ci.totalPay])||0;
    const brokerFee = Math.abs(Number(r[ci.brokerFee])||0);
    const settleFee = Math.abs(Number(r[ci.settleFee])||0);
    const ddDelFee = Math.abs(Number(r[ci.ddDelFee])||0);
    const shopCoupon = Math.abs(Number(r[ci.shopCoupon])||0);
    const promoFee = promoIdx >= 0 ? Math.abs(Number(r[promoIdx])||0) : 0;
    const settleAmt = Number(r[ci.settle])||0;

    if (!md.daily[ds]) md.daily[ds] = {rev:0, orders:0};
    md.daily[ds].rev += orderAmt;
    md.daily[ds].orders++;
    md.orders++;
    md.totalRev += orderAmt;
    md.totalFee += brokerFee + settleFee;
    md.totalDel += ddDelFee;
    md.totalCoupon += shopCoupon + promoFee;

    md.orderList.push({
      date:ds, orderId:String(r[ci.orderId]||''),
      orderType:String(r[ci.orderType]||''), delType:String(r[ci.delType]||''),
      orderAmt, delFee, totalPay,
      brokerFee, settleFee, ddDelFee, shopCoupon, promoFee,
      settleAmt,
    });
  }

  // 월별 서비스별 집계 + 결과 반환
  return Object.entries(monthData).map(([moKey, md]) => {
    const services = {};
    md.orderList.forEach(o => {
      const sn = o.delType || o.orderType || '기타';
      if (!services[sn]) services[sn] = {count:0, orderAmt:0, fee:0, delivery:0, ad:0, total:0};
      services[sn].count++;
      services[sn].orderAmt += o.orderAmt;
      services[sn].fee += o.brokerFee + o.settleFee;
      services[sn].delivery += o.ddDelFee;
      services[sn].total += o.brokerFee + o.settleFee + o.ddDelFee;
    });
    // 개별 항목 합산
    let aggBroker=0, aggSettle=0, aggDel=0, aggCoupon=0, aggPromo=0;
    md.orderList.forEach(o => {
      aggBroker += o.brokerFee||0;
      aggSettle += o.settleFee||0;
      aggDel += o.ddDelFee||0;
      aggCoupon += o.shopCoupon||0;
      aggPromo += o.promoFee||0;
    });
    return {
      period: md.yr+'년 '+md.mo+'월',
      ym: [md.yr, md.mo],
      totalRev: md.totalRev,
      orders: md.orders,
      daily: md.daily,
      fee: md.totalFee,
      feeRate: md.totalRev ? md.totalFee / md.totalRev : 0,
      delivery: md.totalDel,
      coupon: md.totalCoupon,
      // 땡겨요 개별 항목
      broker: aggBroker,       // 주문중개이용료
      pgFee: aggSettle,        // 결제정산이용료
      delFee: aggDel,          // 땡배달이용료
      shopCoupon: aggCoupon,   // 사장님쿠폰
      adSupply: 0,
      vat: 0,
      _hasPurchaseData: true,
      orderDetails: md.orderList, services,
    };
  });
}

// 구 형식 땡겨요 CSV (호환성 유지)
function parseTG(text, filename) {
  const mf = filename.match(/^(\d{2})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
  const mNew = filename.match(/땡겨요\s*(\d{4})년\s*(\d{1,2})월/);
  let ymList;
  if (mf) {
    const sy=2000+parseInt(mf[1]), sm=parseInt(mf[2]);
    const ey=2000+parseInt(mf[4]), em=parseInt(mf[5]);
    ymList = [];
    let y=sy, mo=sm;
    while(y<ey||(y===ey&&mo<=em)){ ymList.push([y,mo]); mo++; if(mo>12){mo=1;y++;} }
  } else if (mNew) {
    ymList = [[+mNew[1], +mNew[2]]];
  } else {
    throw new Error('파일명 형식을 인식할 수 없습니다: ' + filename);
  }

  const lines = text.split('\n').map(l=>l.trim()).filter(l=>l);
  const splitCSV = line => {
    const r=[]; let c='',q=false;
    for(const ch of line){if(ch==='"')q=!q;else if(ch===','&&!q){r.push(c.trim());c='';}else c+=ch;}
    r.push(c.trim()); return r;
  };

  let hi = lines.findIndex(l => l.includes('주문번호') || l.includes('주문일'));
  if (hi < 0) hi = lines.findIndex(l => l.includes(',') && l.split(',').length > 3);
  const headers = splitCSV(lines[hi]||'');
  const ciCSV = {
    date: headers.findIndex(h=>/주문일|결제일|날짜/.test(h)),
    rev:  headers.findIndex(h=>/주문결제|주문금액|결제금액/.test(h)),
    status: headers.findIndex(h=>/상태|주문상태/.test(h)),
  };
  if(ciCSV.date<0) ciCSV.date=1;
  if(ciCSV.rev<0)  ciCSV.rev=2;

  const daily={}; let totalOrders=0;
  for(let i=hi+1;i<lines.length;i++){
    const r=splitCSV(lines[i]);
    if(!r[ciCSV.date] && !r[0]) continue;
    if(/합\s*계/.test(r[0]||'')) continue;
    const status=r[ciCSV.status]||'';
    if(/취소|환불|cancel/i.test(status)) continue;
    let ds = (r[ciCSV.date]||'').substring(0,10).replace(/[./]/g,'-');
    if (!ds || ds.length<10) ds = `${ymList[0][0]}-${String(ymList[0][1]).padStart(2,'0')}-01`;
    const rev=toNum(r[ciCSV.rev]);
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
// [H] 요기요 파싱
// 파일명: 요기요 YYYY년 MM월 매출.xlsx
// 요약 형식 (건별 데이터 없음) - 행0~행21에서 집계
// ==============================================
function parseYG_xlsx(wb, filename) {
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});

  // 파일명에서 연월 추출: "요기요 YYYY년 MM월 매출.xlsx"
  const mNew = filename.match(/요기요\s*(\d{4})년\s*(\d{1,2})월/);
  // 구 형식: "사업자번호_매출내역_YYYYMMDD_YYYYMMDD.xlsx"
  const mOld = filename.match(/_(매출내역|매입내역)_(\d{4})(\d{2})\d{2}_(\d{4})(\d{2})\d{2}/);

  let yr, mn, period, isPurchase = false;
  if (mNew) {
    yr = +mNew[1]; mn = +mNew[2];
    period = yr+'년 '+mn+'월';
  } else if (mOld) {
    yr = +mOld[2]; mn = +mOld[3];
    period = yr+'년 '+mn+'월';
    isPurchase = mOld[1] === '매입내역';
  } else {
    throw new Error('요기요 파일명을 인식할 수 없습니다: ' + filename);
  }

  // 요약 데이터 파싱 (행0~30)
  const summary = {};
  for (let i=0; i<Math.min(rows.length,30); i++) {
    const r = rows[i];
    if (!r) continue;
    const key = String(r[0]||'').trim();
    const label = String(r[1]||'').trim();
    const val = toNum(r[3]);

    if (key === 'A') summary.orderAmt = val;         // 주문금액
    if (key === 'B') summary.cupDeposit = val;        // 일회용컵보증금
    if (key === 'C') summary.deduction = val;         // 차감금액
    if (key === 'C-5') summary.shopCoupon = val;      // 쿠폰(가게부담)
    if (key === 'C-8') summary.brokerFee = val;       // 주문중개이용료
    if (key === 'C-9') summary.deliveryFee = val;     // 배달대행이용료
    if (key === 'C-10') summary.pgFee = val;          // 외부결제이용료
    if (key === 'C-11') summary.timeDealFee = val;    // 요타임딜이용료
    if (key === 'C-12') summary.adFee = val;          // 추천광고이용료
    if (key === 'C-13') summary.etcFee = val;         // 기타서비스이용료
    if (/C-1$/.test(key)) summary.selfDiscount = val; // 사장님자체할인
    if (/C-4/.test(key)) summary.timeDealDisc = val;  // 요타임딜할인(가게부담)
    if (key === 'D') summary.settleAmt = val;         // 정산금액
    if (key === 'E') summary.fieldPaid = val;         // 현장에서 받은 금액
    if (key === 'F') summary.depositAmt = val;        // 입금받으실 금액
  }

  const totalRev = summary.orderAmt || 0;
  const fee = (summary.brokerFee||0) + (summary.pgFee||0) + (summary.timeDealFee||0) + (summary.etcFee||0);
  const delivery = summary.deliveryFee || 0;
  const coupon = (summary.shopCoupon||0) + (summary.selfDiscount||0) + (summary.timeDealDisc||0);
  const ad = summary.adFee || 0;

  // 주문 건수 추정: 배달대행이용료 ÷ 건당 ~3000원(요기요 기본 2900+추가)
  let estOrders = 1;
  if (delivery > 0) {
    estOrders = Math.max(1, Math.round(delivery / 3000));
  } else if (totalRev > 0) {
    estOrders = Math.max(1, Math.round(totalRev / 22000));
  }

  // 일별 데이터 없으므로 월 1일에 총액 할당
  const ds = `${yr}-${String(mn).padStart(2,'0')}-01`;
  const daily = {};
  if (totalRev > 0) daily[ds] = {rev:totalRev, orders:estOrders};

  // 서비스별 집계 (요약 기반)
  const services = {};
  if (summary.brokerFee) services['주문중개'] = {count:0, orderAmt:totalRev, fee:summary.brokerFee||0, delivery:0, ad:0, total:summary.brokerFee||0};
  if (summary.deliveryFee) services['배달대행'] = {count:0, orderAmt:0, fee:0, delivery:summary.deliveryFee||0, ad:0, total:summary.deliveryFee||0};
  if (summary.pgFee) services['외부결제'] = {count:0, orderAmt:0, fee:summary.pgFee||0, delivery:0, ad:0, total:summary.pgFee||0};
  if (summary.adFee) services['추천광고'] = {count:0, orderAmt:0, fee:0, delivery:0, ad:summary.adFee||0, total:summary.adFee||0};
  if (summary.timeDealFee) services['요타임딜'] = {count:0, orderAmt:0, fee:summary.timeDealFee||0, delivery:0, ad:0, total:summary.timeDealFee||0};

  if (isPurchase) {
    return {
      type: 'purchase', ym:[yr,mn], period,
      fee, delivery, ad, summary, services,
    };
  }

  return {
    period, ym:[yr,mn], totalRev, orders:estOrders, daily,
    fee, feeRate: totalRev ? fee/totalRev : 0,
    delivery, coupon, ad,
    // 요기요 개별 항목
    broker: summary.brokerFee||0,      // 주문중개이용료
    pgFee: summary.pgFee||0,           // 외부결제이용료
    delFee: summary.deliveryFee||0,    // 배달대행이용료
    adSupply: summary.adFee||0,        // 추천광고이용료
    shopCoupon: summary.shopCoupon||0, // 쿠폰(가게부담)
    vat: 0,
    _hasPurchaseData: true,
    purchaseSummary: summary, services,
  };
}

// ==============================================
// [TS] 파싱 - 토스포스 매출리포트 (XLSX)
// ==============================================
function parseTS_xlsx(wb, filename) {
  // "결제 상세내역" 시트 찾기
  const sheetName = wb.SheetNames.find(s => s.includes('결제') && s.includes('상세')) || wb.SheetNames[3];
  if (!sheetName) throw new Error('결제 상세내역 시트를 찾을 수 없습니다');
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null, cellDates:true});

  // 헤더 찾기 (결제기준일자 + 주문채널 포함 행)
  let hi = -1;
  for (let i=0; i<Math.min(rows.length, 10); i++) {
    const row = (rows[i]||[]).map(v => String(v||''));
    if (row.some(c => c.includes('결제기준일자')) && row.some(c => c.includes('주문채널'))) { hi = i; break; }
  }
  if (hi < 0) throw new Error('토스포스 헤더를 찾을 수 없습니다');

  const headers = rows[hi].map(v => String(v||'').trim());
  const ci = {
    date:    headers.findIndex(h => h.includes('결제기준일자')),
    time:    headers.findIndex(h => h.includes('결제시각')),
    channel: headers.findIndex(h => h.includes('주문채널')),
    orderId: headers.findIndex(h => h.includes('주문번호')),
    count:   headers.findIndex(h => h.includes('결제건수')),
    amount:  headers.findIndex(h => h.includes('결제금액')),
    method:  headers.findIndex(h => h.includes('결제수단')),
    acquirer:headers.findIndex(h => h.includes('매입사')),
    status:  headers.findIndex(h => h.includes('결제상태')),
  };

  // 1단계: 취소 건의 (날짜+주문번호) 쌍 수집
  const cancelPairs = new Set();
  for (let i = hi+1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const status = String(r[ci.status]||'').trim();
    if (status === '취소') {
      const dateVal = r[ci.date];
      const ds = fmtDate(dateVal);
      const orderId = String(r[ci.orderId]||'');
      if (ds && orderId) cancelPairs.add(ds + '|' + orderId);
    }
  }

  // 2단계: 데이터 수집 (배달 제외 + 취소 쌍 제외)
  const monthData = {};
  for (let i = hi+1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;

    // 설명 행 스킵
    if (r[ci.date] === null || r[ci.date] === '') continue;

    // 주문채널: 배달 제외
    const channel = String(r[ci.channel]||'').trim();
    if (channel === '배달') continue;

    // 결제상태: 취소 제외
    const status = String(r[ci.status]||'').trim();
    if (status === '취소') continue;

    // 같은 날짜+주문번호에 취소가 있으면 승인도 제외
    const dateVal = r[ci.date];
    const ds = fmtDate(dateVal);
    if (!ds) continue;
    const orderId = String(r[ci.orderId]||'');
    if (cancelPairs.has(ds + '|' + orderId)) continue;

    const amount = Math.abs(Number(r[ci.amount])||0);
    if (amount <= 0) continue;

    // 월 키 생성
    const dateMatch = ds.match(/(\d{4})-(\d{2})/);
    if (!dateMatch) continue;
    const ymKey = dateMatch[1] + '-' + dateMatch[2];

    if (!monthData[ymKey]) monthData[ymKey] = { daily:{}, totalRev:0, orders:0 };
    monthData[ymKey].totalRev += amount;
    monthData[ymKey].orders++;
    if (!monthData[ymKey].daily[ds]) monthData[ymKey].daily[ds] = { rev:0, orders:0 };
    monthData[ymKey].daily[ds].rev += amount;
    monthData[ymKey].daily[ds].orders++;
  }

  // 월별 결과 배열 생성
  const results = Object.entries(monthData).map(([ymKey, data]) => {
    const [y, m] = ymKey.split('-').map(Number);
    const period = y + '년 ' + m + '월';
    return {
      period, ym: [y, m],
      totalRev: data.totalRev,
      orders: data.orders,
      daily: data.daily,
      fee: 0, feeRate: 0, delivery: 0, coupon: 0, ad: 0,
    };
  });

  if (!results.length) throw new Error('유효한 가게 매출 데이터가 없습니다 (배달 제외)');
  return results.length === 1 ? results[0] : results;
}
