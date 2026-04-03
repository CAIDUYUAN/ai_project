// ==============================================
// [MC] 메뉴 원가 분석 (2중가격제 - 할인금액 방식)
// ==============================================

let MENU_DATA = [];
let MENU_DATA_ORIG = [];
let menuSortKey = 'name';
let menuSortAsc = true;

const PFS = ['bm','cp','tg','yg'];
const pfName = pf => ({bm:'배민',cp:'쿠팡이츠',tg:'땡겨요',yg:'요기요'}[pf] || pf);
const pfIcon = pf => ({bm:'🛵',cp:'❤️',tg:'🟢',yg:'🟠'}[pf] || '');

// ── 플랫폼별 수수료율/배달비 ──
function pfFeeRate(pf) {
  return (S[pf+'Comm'] + S[pf+'Pg'] + S[pf+'Vat'] + S[pf+'Extra']) / 100;
}
function pfDel(pf) { return S[pf+'Del'] || 0; }

// ── 메뉴별 계산 ──
function calcMenuItem(item, idx) {
  const costTotal = item.food + item.sauce + item.pack + item.side + item.etc;
  const storeActual = item.price - (item.discount || 0); // 가게 실제판매가
  const storeCostRate = storeActual ? (costTotal / storeActual * 100) : 0;
  const storeProfit = storeActual - costTotal;
  const storeMarginRate = storeActual ? (storeProfit / storeActual * 100) : 0;

  let grade, gradeClass;
  if (storeCostRate < 35) { grade = '양호'; gradeClass = 'mc-good'; }
  else if (storeCostRate <= 50) { grade = '주의'; gradeClass = 'mc-warn'; }
  else { grade = '위험'; gradeClass = 'mc-bad'; }

  // 플랫폼별 계산
  const profits = {};
  const recPrices = {}; // 가게 순수익과 동일하려면 필요한 판매가
  PFS.forEach(pf => {
    const pfPrice = item['pf_'+pf+'_price'] || item.price;
    const pfDiscount = item['pf_'+pf+'_discount'] || 0;
    const pfActual = pfPrice - pfDiscount; // 플랫폼 실제판매가
    profits[pf] = pfActual * (1 - pfFeeRate(pf)) - pfDel(pf) - costTotal;
    // 적정판매가: 가게 순수익과 동일하려면 판매가가 얼마여야 하나
    const feeRate = pfFeeRate(pf);
    const neededActual = feeRate < 1 ? Math.ceil((storeProfit + costTotal + pfDel(pf)) / (1 - feeRate)) : 0;
    recPrices[pf] = neededActual + pfDiscount; // 할인금액 더해서 적정 판매가
  });

  const bestPf = PFS.reduce((a, b) => profits[a] > profits[b] ? a : b);
  const worstPf = PFS.reduce((a, b) => profits[a] < profits[b] ? a : b);

  return { ...item, idx, costTotal, storeActual, storeCostRate, storeProfit, storeMarginRate,
           grade, gradeClass, profits, recPrices, bestPf, worstPf };
}

// ── 엑셀 파싱 ──
function loadMenuXlsx(files) {
  if (!files || !files.length) return;
  const file = files[0];
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(e.target.result, {type:'array', WTF:false});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});

      MENU_DATA = [];
      for (let i = 3; i < rows.length; i++) {
        const r = rows[i];
        if (!r[0] || String(r[0]).trim() === '') continue;
        // 컬럼: 메뉴명(0) 가게판매가(1) 할인금액(2)
        //        배민판매(3) 배민할인금액(4) 쿠팡판매(5) 쿠팡할인금액(6)
        //        땡겨요판매(7) 땡겨요할인금액(8) 요기요판매(9) 요기요할인금액(10)
        //        식재료비(11) 소스비(12) 포장재비(13) 반찬비(14) 기타원가(15)
        const storeDiscount = Number(r[2]) || 0;
        MENU_DATA.push({
          name: String(r[0]).trim(),
          price: Number(r[1]) || 0,
          discount: storeDiscount,
          pf_bm_price: Number(r[3]) || Number(r[1]) || 0,
          pf_bm_discount: Number(r[4]) || storeDiscount,
          pf_cp_price: Number(r[5]) || Number(r[1]) || 0,
          pf_cp_discount: Number(r[6]) || storeDiscount,
          pf_tg_price: Number(r[7]) || Number(r[1]) || 0,
          pf_tg_discount: Number(r[8]) || storeDiscount,
          pf_yg_price: Number(r[9]) || Number(r[1]) || 0,
          pf_yg_discount: Number(r[10]) || storeDiscount,
          food: Number(r[11]) || 0,
          sauce: Number(r[12]) || 0,
          pack: Number(r[13]) || 0,
          side: Number(r[14]) || 0,
          etc: Number(r[15]) || 0,
        });
      }

      MENU_DATA_ORIG = JSON.parse(JSON.stringify(MENU_DATA));
      localStorage.setItem('menuCostData', JSON.stringify(MENU_DATA));
      localStorage.setItem('menuCostDataOrig', JSON.stringify(MENU_DATA_ORIG));

      const fnEl = document.getElementById('menu-filename');
      fnEl.textContent = '✅ ' + file.name + ' (' + MENU_DATA.length + '개 메뉴)';
      fnEl.style.display = 'block';
      document.getElementById('box-menu').classList.add('loaded');

      renderMenuCost();
      toast('🧾 메뉴 원가 데이터 로드 완료!');
    } catch(err) {
      alert('파일 오류: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

// ── 샘플 파일 다운로드 ──
function downloadMenuSample() {
  const headers = [
    '메뉴명','가게 판매가(원)','할인금액(원)',
    '배민 판매가(원)','배민 할인금액(원)',
    '쿠팡 판매가(원)','쿠팡 할인금액(원)',
    '땡겨요 판매가(원)','땡겨요 할인금액(원)',
    '요기요 판매가(원)','요기요 할인금액(원)',
    '식재료비(원)','소스비(원)','포장재비\n(비닐+숟가락+젓가락+용기)','반찬비(용기포함)','기타원가(원)',
  ];
  const sample = [
    ['마라탕', 13900, 2000, 15900, 2000, 16900, 2000, 14900, 2000, 15900, 2000, 3800, 500, 600, 400, 300],
    ['꿔바로우', 16900, 2000, 18900, 2000, 19900, 2000, 17900, 2000, 18900, 2000, 4800, 600, 650, 450, 300],
  ];

  const ws = XLSX.utils.aoa_to_sheet([
    ['메뉴 원가 입력 파일 (2중가격제)'],
    ['※ 판매가와 할인금액을 입력하세요. 실제판매가 = 판매가 - 할인금액. 플랫폼 가격을 비워두면 가게 가격이 자동 적용됩니다.'],
    headers,
    ...sample
  ]);

  ws['!cols'] = [
    {wch:12},{wch:14},{wch:12},
    {wch:13},{wch:14},{wch:13},{wch:14},{wch:14},{wch:14},{wch:13},{wch:14},
    {wch:10},{wch:8},{wch:20},{wch:14},{wch:10}
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '메뉴원가');
  XLSX.writeFile(wb, 'menu_input_sample.xlsx');
}

// ── 플랫폼 가격 수정 (input/slider) ──
function updatePfPrice(idx, pf, field, val) {
  val = Number(val) || 0;
  MENU_DATA[idx]['pf_'+pf+'_'+field] = val;

  // input과 slider 동기화
  const inputEl = document.getElementById(`mc-${idx}-${pf}-${field}`);
  const sliderEl = document.getElementById(`mc-${idx}-${pf}-${field}-s`);
  if (inputEl && Number(inputEl.value) !== val) inputEl.value = val;
  if (sliderEl && Number(sliderEl.value) !== val) sliderEl.value = val;

  // 적정판매가, 실제판매가 표시 업데이트
  updatePfDisplay(idx, pf);

  localStorage.setItem('menuCostData', JSON.stringify(MENU_DATA));
  updateMenuCardProfit(idx);
  renderMenuTable();
}

// ── 플랫폼 카드 내 표시 업데이트 ──
function updatePfDisplay(idx, pf) {
  const item = calcMenuItem(MENU_DATA[idx], idx);
  const pfPrice = item['pf_'+pf+'_price'] || item.price;
  const pfDiscount = item['pf_'+pf+'_discount'] || 0;
  const pfActual = pfPrice - pfDiscount;
  const actualEl = document.getElementById(`mc-${idx}-${pf}-actual`);
  if (actualEl) actualEl.textContent = '실제판매가: ' + W(pfActual);
  const recEl = document.getElementById(`mc-${idx}-${pf}-rec`);
  if (recEl) recEl.textContent = W(item.recPrices[pf]);
}

// ── 카드 내 순수익만 업데이트 ──
function updateMenuCardProfit(idx) {
  const item = calcMenuItem(MENU_DATA[idx], idx);
  const profitEl = document.getElementById('mc-profit-' + idx);
  if (profitEl) profitEl.innerHTML = buildProfitGrid(item);
}

// ── 가게 순수익 맞추기 (판매가를 적정판매가로 변경) ──
function matchStoreProfit(idx, pf) {
  const item = calcMenuItem(MENU_DATA[idx], idx);
  MENU_DATA[idx]['pf_'+pf+'_price'] = item.recPrices[pf];
  localStorage.setItem('menuCostData', JSON.stringify(MENU_DATA));
  renderMenuCost();
}

// ── 전체 플랫폼 가게 순수익 맞추기 ──
function matchAllStoreProfit(idx) {
  const item = calcMenuItem(MENU_DATA[idx], idx);
  PFS.forEach(pf => {
    MENU_DATA[idx]['pf_'+pf+'_price'] = item.recPrices[pf];
  });
  localStorage.setItem('menuCostData', JSON.stringify(MENU_DATA));
  renderMenuCost();
  toast('✅ 모든 플랫폼 가격이 가게 순수익 기준으로 설정됐어요!');
}

// ── 메뉴 삭제 ──
function deleteMenuItem(idx) {
  const name = MENU_DATA[idx]?.name || '';
  if (!confirm(`"${name}" 메뉴를 삭제하시겠습니까?`)) return;
  MENU_DATA.splice(idx, 1);
  MENU_DATA_ORIG.splice(idx, 1);
  localStorage.setItem('menuCostData', JSON.stringify(MENU_DATA));
  localStorage.setItem('menuCostDataOrig', JSON.stringify(MENU_DATA_ORIG));
  renderMenuCost();
  toast(`🗑 "${name}" 삭제됨`);
}

// ── 플랫폼 가격 초기화 (엑셀 원본으로) ──
function resetPfPrices(idx) {
  if (!MENU_DATA_ORIG[idx]) return;
  PFS.forEach(pf => {
    MENU_DATA[idx]['pf_'+pf+'_price'] = MENU_DATA_ORIG[idx]['pf_'+pf+'_price'];
    MENU_DATA[idx]['pf_'+pf+'_discount'] = MENU_DATA_ORIG[idx]['pf_'+pf+'_discount'];
  });
  localStorage.setItem('menuCostData', JSON.stringify(MENU_DATA));
  renderMenuCost();
  toast('🔄 가격이 초기화됐어요!');
}

// ── 순수익 그리드 HTML ──
function buildProfitGrid(item) {
  return PFS.map(pf => {
    const pfPrice = item['pf_'+pf+'_price'] || item.price;
    const pfDiscount = item['pf_'+pf+'_discount'] || 0;
    const pfActual = pfPrice - pfDiscount;
    const profit = item.profits[pf];
    const isBest = pf === item.bestPf;
    const isWorst = pf === item.worstPf;
    const bg = isBest ? 'rgba(45,158,107,0.12)' : isWorst ? 'rgba(229,48,42,0.12)' : 'var(--bg3)';
    const icon = isBest ? '✅ ' : isWorst ? '⚠️ ' : '';
    const color = profit < 0 ? 'var(--danger)' : 'var(--tx)';
    const loss = profit < 0 ? ' (손실)' : '';
    const recPrice = item.recPrices[pf];
    const diff = profit - item.storeProfit;
    const diffColor = diff >= 0 ? 'var(--grn)' : 'var(--danger)';
    const diffSign = diff >= 0 ? '+' : '';

    return `<div style="background:${bg};border-radius:10px;padding:12px">
      <div style="font-size:12px;font-weight:600;color:var(--tx2);margin-bottom:6px">${icon}${pfIcon(pf)} ${pfName(pf)}</div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:2px">판매가 ${W(pfPrice)} / 할인금액 ${W(pfDiscount)} / 실제 ${W(pfActual)}</div>
      <div style="font-family:var(--mono);font-size:16px;font-weight:700;color:${color};margin-bottom:4px">순수익 ${W(profit)}${loss}</div>
      <div style="font-size:11px;color:var(--tx2)">적정판매가:
        <strong onclick="matchStoreProfit(${item.idx},'${pf}')" style="color:var(--blue);cursor:pointer;text-decoration:underline;padding:2px 4px;border-radius:4px" title="클릭하면 이 가격으로 적용 (가게 순수익 ${W(item.storeProfit)} 맞춤)">${W(recPrice)}</strong>
        <span style="color:${diffColor};margin-left:4px">(${diffSign}${W(diff)})</span>
      </div>
    </div>`;
  }).join('');
}

// ── 메인 렌더 ──
function renderMenuCost() {
  if (!MENU_DATA.length) {
    try {
      const saved = JSON.parse(localStorage.getItem('menuCostData') || '[]');
      const orig = JSON.parse(localStorage.getItem('menuCostDataOrig') || '[]');
      if (saved.length) {
        MENU_DATA = saved;
        MENU_DATA_ORIG = orig.length ? orig : JSON.parse(JSON.stringify(saved));
        const fnEl = document.getElementById('menu-filename');
        fnEl.textContent = '✅ 저장된 데이터 (' + MENU_DATA.length + '개 메뉴)';
        fnEl.style.display = 'block';
        document.getElementById('box-menu').classList.add('loaded');
      }
    } catch(e) {}
  }

  if (!MENU_DATA.length) {
    document.getElementById('mc-summary').style.display = 'none';
    document.getElementById('mc-cards').innerHTML = '';
    document.getElementById('mc-table-card').style.display = 'none';
    return;
  }

  const items = MENU_DATA.map((d, i) => calcMenuItem(d, i));
  document.getElementById('mc-summary').style.display = 'block';
  document.getElementById('mc-table-card').style.display = 'block';

  const avgCost = items.reduce((s, i) => s + i.storeCostRate, 0) / items.length;
  const best = items.reduce((a, b) => a.profits[a.bestPf] > b.profits[b.bestPf] ? a : b);
  const worst = items.reduce((a, b) => a.storeCostRate > b.storeCostRate ? a : b);

  document.getElementById('mc-count').textContent = items.length + '건';
  const avgEl = document.getElementById('mc-avg-cost');
  avgEl.textContent = avgCost.toFixed(1) + '%';
  avgEl.className = 'kpi-value ' + (avgCost > 35 ? 'neg' : 'pos');
  document.getElementById('mc-best').textContent = best.name;
  document.getElementById('mc-best-sub').textContent = pfName(best.bestPf) + ' ' + W(best.profits[best.bestPf]);
  document.getElementById('mc-worst').textContent = worst.name;
  document.getElementById('mc-worst-sub').textContent = '원가율 ' + worst.storeCostRate.toFixed(1) + '%';

  renderMenuCards(items);
  renderMenuTable(items);
}

// ── 카드 렌더 ──
function renderMenuCards(items) {
  const container = document.getElementById('mc-cards');
  container.innerHTML = items.map(item => {
    const costItems = [
      {name:'식재료비', val:item.food},
      {name:'소스비', val:item.sauce},
      {name:'포장재비', val:item.pack},
      {name:'반찬비', val:item.side},
      {name:'기타원가', val:item.etc},
    ];

    const barsHtml = costItems.map(c => {
      const pct = item.storeActual ? (c.val / item.storeActual * 100) : 0;
      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span style="width:60px;font-size:11px;color:var(--tx2);text-align:right">${c.name}</span>
        <div style="flex:1;background:var(--bg3);border-radius:4px;height:18px;overflow:hidden">
          <div style="width:${Math.min(pct, 100)}%;height:100%;background:${pct > 15 ? 'var(--danger)' : 'var(--grn)'};border-radius:4px;transition:width .3s"></div>
        </div>
        <span style="width:80px;font-size:11px;font-family:var(--mono);color:var(--tx2);text-align:right">${W(c.val)} (${pct.toFixed(1)}%)</span>
      </div>`;
    }).join('');

    const totalBarColor = item.storeCostRate >= 50 ? 'var(--danger)' : item.storeCostRate >= 35 ? 'var(--or)' : 'var(--grn)';
    const profitPct = item.storeActual ? (item.storeProfit / item.storeActual * 100) : 0;
    const profitBarColor = item.storeProfit >= 0 ? 'var(--blue)' : 'var(--danger)';
    const badgeColor = item.gradeClass === 'mc-good' ? 'var(--grn)' : item.gradeClass === 'mc-warn' ? 'var(--or)' : 'var(--danger)';

    // 플랫폼별 가격 편집 UI
    const pfPriceHtml = PFS.map(pf => {
      const pfPrice = item['pf_'+pf+'_price'] || item.price;
      const pfDiscount = item['pf_'+pf+'_discount'] || 0;
      const pfActual = pfPrice - pfDiscount;
      const recPrice = item.recPrices[pf];
      const maxVal = Math.max(pfPrice * 2, 50000);
      return `<div style="background:var(--bg3);border-radius:10px;padding:10px">
        <div style="font-size:12px;font-weight:600;color:var(--tx2);margin-bottom:6px">${pfIcon(pf)} ${pfName(pf)}</div>
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px">
          <span style="font-size:10px;color:var(--muted);width:45px">판매가</span>
          <input id="mc-${item.idx}-${pf}-price" type="number" value="${pfPrice}"
            oninput="updatePfPrice(${item.idx},'${pf}','price',this.value)"
            style="flex:1;width:0;background:var(--bg2);border:1px solid var(--bd);border-radius:6px;padding:4px 6px;color:var(--tx);font-family:var(--mono);font-size:12px;outline:none">
        </div>
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px">
          <span style="font-size:10px;color:var(--muted);width:45px">할인금액</span>
          <input id="mc-${item.idx}-${pf}-discount" type="number" value="${pfDiscount}"
            oninput="updatePfPrice(${item.idx},'${pf}','discount',this.value)"
            style="flex:1;width:0;background:var(--bg2);border:1px solid var(--bd);border-radius:6px;padding:4px 6px;color:var(--tx);font-family:var(--mono);font-size:12px;outline:none">
        </div>
        <input id="mc-${item.idx}-${pf}-price-s" type="range" min="0" max="${maxVal}" step="100" value="${pfPrice}"
          oninput="updatePfPrice(${item.idx},'${pf}','price',this.value)"
          style="width:100%;margin-top:2px">
        <div id="mc-${item.idx}-${pf}-actual" style="font-size:10px;color:var(--muted);margin-top:2px">실제판매가: ${W(pfActual)}</div>
        <div style="font-size:10px;color:var(--blue);margin-top:1px">적정판매가: <span id="mc-${item.idx}-${pf}-rec">${W(recPrice)}</span></div>
      </div>`;
    }).join('');

    return `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div>
          <span style="font-size:15px;font-weight:700">${item.name}</span>
          <span style="font-size:13px;margin-left:10px">판매가 <strong style="color:var(--tx);font-size:14px">${W(item.price)}</strong></span>
          <span style="font-size:12px;color:var(--muted);margin-left:6px">할인 ${W(item.discount)}</span>
          <span style="font-size:12px;color:var(--muted)">→</span>
          <span style="font-size:13px;color:var(--grn);font-weight:600">실제 ${W(item.storeActual)}</span>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <span style="padding:4px 10px;border-radius:8px;font-size:12px;font-weight:700;color:#fff;background:${badgeColor}">${item.grade}</span>
          <button onclick="resetPfPrices(${item.idx})" style="padding:4px 8px;border:1px solid var(--bd);background:var(--bg3);color:var(--tx2);border-radius:6px;font-size:11px;cursor:pointer">🔄 초기화</button>
          <button onclick="deleteMenuItem(${item.idx})" style="padding:4px 8px;border:1px solid var(--danger);background:rgba(229,48,42,0.1);color:var(--danger);border-radius:6px;font-size:11px;cursor:pointer">🗑 삭제</button>
        </div>
      </div>

      <div style="display:flex;gap:12px;margin-bottom:8px;flex-wrap:wrap">
        <span style="font-size:12px;color:var(--grn);font-weight:600">🏪 가게 순수익 ${W(item.storeProfit)} (마진 ${item.storeMarginRate.toFixed(1)}%)</span>
        <button onclick="matchAllStoreProfit(${item.idx})" style="padding:2px 8px;font-size:11px;border:1px solid var(--grn);background:rgba(45,158,107,0.1);color:var(--grn);border-radius:6px;cursor:pointer;font-weight:600">모든 플랫폼 가게 순수익 맞추기</button>
      </div>

      <div style="margin-bottom:12px">
        ${barsHtml}
        <div style="display:flex;align-items:center;gap:8px;margin-top:6px;padding-top:6px;border-top:1px solid var(--bd)">
          <span style="width:60px;font-size:11px;font-weight:700;color:var(--tx);text-align:right">원가합계</span>
          <div style="flex:1;background:var(--bg3);border-radius:4px;height:18px;overflow:hidden">
            <div style="width:${Math.min(item.storeCostRate, 100)}%;height:100%;background:${totalBarColor};border-radius:4px;transition:width .3s"></div>
          </div>
          <span style="width:80px;font-size:11px;font-family:var(--mono);font-weight:700;color:${totalBarColor};text-align:right">${W(item.costTotal)} (${item.storeCostRate.toFixed(1)}%)</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
          <span style="width:60px;font-size:11px;font-weight:700;color:${profitBarColor};text-align:right">순수익</span>
          <div style="flex:1;background:var(--bg3);border-radius:4px;height:18px;overflow:hidden">
            <div style="width:${Math.min(Math.abs(profitPct), 100)}%;height:100%;background:${profitBarColor};border-radius:4px;transition:width .3s"></div>
          </div>
          <span style="width:80px;font-size:11px;font-family:var(--mono);font-weight:700;color:${profitBarColor};text-align:right">${W(item.storeProfit)} (${profitPct.toFixed(1)}%)</span>
        </div>
      </div>

      <div style="font-size:12px;font-weight:600;color:var(--tx2);margin-bottom:6px">💰 플랫폼별 가격 설정 <span style="font-size:10px;font-weight:400;color:var(--muted)">(스크롤바로 판매가 조절)</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">${pfPriceHtml}</div>

      <div style="font-size:12px;font-weight:600;color:var(--tx2);margin-bottom:6px">📦 플랫폼별 순수익 (실제판매가 - 수수료 - 배달비 - 원가)</div>
      <div id="mc-profit-${item.idx}" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${buildProfitGrid(item)}</div>
    </div>`;
  }).join('');
}

// ── 테이블 렌더 ──
function renderMenuTable(items) {
  if (!items) items = MENU_DATA.map((d, i) => calcMenuItem(d, i));

  items.sort((a, b) => {
    let va, vb;
    switch(menuSortKey) {
      case 'name': va = a.name; vb = b.name; return menuSortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      case 'price': va = a.storeActual; vb = b.storeActual; break;
      case 'costTotal': va = a.costTotal; vb = b.costTotal; break;
      case 'costRate': va = a.storeCostRate; vb = b.storeCostRate; break;
      case 'bmProfit': va = a.profits.bm; vb = b.profits.bm; break;
      case 'cpProfit': va = a.profits.cp; vb = b.profits.cp; break;
      case 'tgProfit': va = a.profits.tg; vb = b.profits.tg; break;
      case 'ygProfit': va = a.profits.yg; vb = b.profits.yg; break;
      default: va = a.name; vb = b.name;
    }
    return menuSortAsc ? va - vb : vb - va;
  });

  const tbody = document.getElementById('mc-tbody');
  tbody.innerHTML = items.map(item => {
    const costBg = item.storeCostRate < 35 ? 'rgba(45,158,107,0.15)' : item.storeCostRate <= 50 ? 'rgba(251,191,36,0.15)' : 'rgba(229,48,42,0.15)';
    const profitVals = PFS.map(pf => item.profits[pf]);
    const maxP = Math.max(...profitVals);
    const minP = Math.min(...profitVals);

    const profitCell = (pf) => {
      const val = item.profits[pf];
      const pfPrice = item['pf_'+pf+'_price'] || item.price;
      const pfDiscount = item['pf_'+pf+'_discount'] || 0;
      const bg = val === maxP ? 'rgba(45,158,107,0.15)' : val === minP ? 'rgba(229,48,42,0.15)' : '';
      const color = val < 0 ? 'var(--danger)' : 'var(--tx)';
      return `<td style="background:${bg};color:${color}" title="판매가 ${W(pfPrice)} 할인금액 ${W(pfDiscount)}">${W(val)}</td>`;
    };

    return `<tr>
      <td style="text-align:left;font-family:inherit">${item.name}</td>
      <td>${W(item.storeActual)}</td>
      <td>${W(item.costTotal)}</td>
      <td style="background:${costBg};font-weight:600">${item.storeCostRate.toFixed(1)}%</td>
      ${PFS.map(pf => profitCell(pf)).join('')}
      <td style="font-family:inherit;font-weight:600">${pfName(item.bestPf)}</td>
    </tr>`;
  }).join('');
}

// ── 테이블 정렬 ──
function sortMenuTable(key) {
  if (menuSortKey === key) menuSortAsc = !menuSortAsc;
  else { menuSortKey = key; menuSortAsc = true; }
  renderMenuTable();
}
