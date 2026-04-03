// ==============================================
// [MC] 메뉴 원가 분석 (2중가격제 지원)
// ==============================================

let MENU_DATA = [];        // 현재 데이터 (사용자 수정 반영)
let MENU_DATA_ORIG = [];   // 엑셀 원본 (초기화용)
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
  const storeCostRate = item.discPrice ? (costTotal / item.discPrice * 100) : 0;

  // 가게 마진 (기준)
  const storeProfit = item.discPrice - costTotal;
  const storeMarginRate = item.discPrice ? (storeProfit / item.discPrice * 100) : 0;

  // 마진 판정 (가게 원가율 기준)
  let grade, gradeClass;
  if (storeCostRate < 35) { grade = '양호'; gradeClass = 'mc-good'; }
  else if (storeCostRate <= 50) { grade = '주의'; gradeClass = 'mc-warn'; }
  else { grade = '위험'; gradeClass = 'mc-bad'; }

  // 플랫폼별 계산
  const profits = {};
  const recPrices = {}; // 추천 가격 (가게 마진과 동일하려면)
  PFS.forEach(pf => {
    const pfDisc = item['pf_'+pf+'_disc'] || item.discPrice;
    profits[pf] = pfDisc * (1 - pfFeeRate(pf)) - pfDel(pf) - costTotal;
    // 추천가: 가게 순수익과 동일하려면 플랫폼 할인가가 얼마여야 하나
    const feeRate = pfFeeRate(pf);
    recPrices[pf] = feeRate < 1 ? Math.ceil((storeProfit + costTotal + pfDel(pf)) / (1 - feeRate)) : 0;
  });

  const bestPf = PFS.reduce((a, b) => profits[a] > profits[b] ? a : b);
  const worstPf = PFS.reduce((a, b) => profits[a] < profits[b] ? a : b);

  return { ...item, idx, costTotal, storeCostRate, storeProfit, storeMarginRate,
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
        MENU_DATA.push({
          name: String(r[0]).trim(),
          price: Number(r[1]) || 0,
          discPrice: Number(r[2]) || 0,
          food: Number(r[3]) || 0,
          sauce: Number(r[4]) || 0,
          pack: Number(r[5]) || 0,
          side: Number(r[6]) || 0,
          etc: Number(r[7]) || 0,
          // 플랫폼별 판매가/할인가 (엑셀에 없으면 가게가격 사용)
          pf_bm_price: Number(r[8]) || Number(r[1]) || 0,
          pf_bm_disc:  Number(r[9]) || Number(r[2]) || 0,
          pf_cp_price: Number(r[10]) || Number(r[1]) || 0,
          pf_cp_disc:  Number(r[11]) || Number(r[2]) || 0,
          pf_tg_price: Number(r[12]) || Number(r[1]) || 0,
          pf_tg_disc:  Number(r[13]) || Number(r[2]) || 0,
          pf_yg_price: Number(r[14]) || Number(r[1]) || 0,
          pf_yg_disc:  Number(r[15]) || Number(r[2]) || 0,
        });
      }

      // 원본 백업 + 저장
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
    '메뉴명','가게 판매가\n(원)','가게 할인후가격\n(원)',
    '식재료비\n(원)','소스비\n(원)','포장재비\n(비닐+숟가락+젓가락+용기)','반찬비\n(용기포함)','기타원가\n(원)',
    '배민 판매가\n(원)','배민 할인가\n(원)',
    '쿠팡 판매가\n(원)','쿠팡 할인가\n(원)',
    '땡겨요 판매가\n(원)','땡겨요 할인가\n(원)',
    '요기요 판매가\n(원)','요기요 할인가\n(원)',
  ];
  const sample = [
    ['마라탕', 13900, 11900, 3800, 500, 600, 400, 300, 15900, 13900, 16900, 14900, 14900, 12900, 15900, 13900],
    ['꿔바로우', 16900, 14900, 4800, 600, 650, 450, 300, 18900, 16900, 19900, 17900, 17900, 15900, 18900, 16900],
  ];

  const ws = XLSX.utils.aoa_to_sheet([
    ['메뉴 원가 입력 파일 (2중가격제)'],
    ['※ 하늘색 셀에만 직접 입력하세요. 플랫폼 가격을 비워두면 가게 가격이 자동 적용됩니다.'],
    headers,
    ...sample
  ]);

  ws['!cols'] = [
    {wch:12},{wch:13},{wch:15},{wch:10},{wch:8},{wch:18},{wch:12},{wch:10},
    {wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12}
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

  // DB 저장
  localStorage.setItem('menuCostData', JSON.stringify(MENU_DATA));

  // 해당 메뉴 카드만 업데이트
  updateMenuCardProfit(idx);
  renderMenuTable();
}

// ── 카드 내 순수익 부분만 업데이트 ──
function updateMenuCardProfit(idx) {
  const item = calcMenuItem(MENU_DATA[idx], idx);
  const profitEl = document.getElementById('mc-profit-' + idx);
  if (profitEl) profitEl.innerHTML = buildProfitGrid(item);
}

// ── 플랫폼 가격 초기화 (엑셀 원본으로) ──
function resetPfPrices(idx) {
  if (!MENU_DATA_ORIG[idx]) return;
  PFS.forEach(pf => {
    MENU_DATA[idx]['pf_'+pf+'_price'] = MENU_DATA_ORIG[idx]['pf_'+pf+'_price'];
    MENU_DATA[idx]['pf_'+pf+'_disc'] = MENU_DATA_ORIG[idx]['pf_'+pf+'_disc'];
  });
  localStorage.setItem('menuCostData', JSON.stringify(MENU_DATA));
  renderMenuCost();
  toast('🔄 가격이 초기화됐어요!');
}

// ── 추천가 적용 ──
function applyRecPrice(idx, pf) {
  const item = calcMenuItem(MENU_DATA[idx], idx);
  MENU_DATA[idx]['pf_'+pf+'_disc'] = item.recPrices[pf];
  // 판매가도 같이 올림 (할인가 + 기존 판매가-할인가 차이 유지)
  const origDiff = MENU_DATA[idx]['pf_'+pf+'_price'] - MENU_DATA[idx]['pf_'+pf+'_disc'];
  MENU_DATA[idx]['pf_'+pf+'_price'] = item.recPrices[pf] + Math.max(origDiff, 0);
  localStorage.setItem('menuCostData', JSON.stringify(MENU_DATA));
  renderMenuCost();
}

// ── 순수익 그리드 HTML 생성 ──
function buildProfitGrid(item) {
  return PFS.map(pf => {
    const pfDisc = item['pf_'+pf+'_disc'] || item.discPrice;
    const pfPrice = item['pf_'+pf+'_price'] || item.price;
    const profit = item.profits[pf];
    const isBest = pf === item.bestPf;
    const isWorst = pf === item.worstPf;
    const bg = isBest ? 'rgba(45,158,107,0.12)' : isWorst ? 'rgba(229,48,42,0.12)' : 'var(--bg3)';
    const icon = isBest ? '✅ ' : isWorst ? '⚠️ ' : '';
    const color = profit < 0 ? 'var(--danger)' : 'var(--tx)';
    const loss = profit < 0 ? ' (손실)' : '';
    const recPrice = item.recPrices[pf];
    const diff = pfDisc - recPrice;
    const diffColor = diff >= 0 ? 'var(--grn)' : 'var(--danger)';
    const diffText = diff >= 0 ? '여유 +' + W(diff) : '부족 ' + W(diff);

    return `<div style="background:${bg};border-radius:10px;padding:12px">
      <div style="font-size:12px;font-weight:600;color:var(--tx2);margin-bottom:6px">${icon}${pfIcon(pf)} ${pfName(pf)}</div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:2px">판매가 ${W(pfPrice)} / 할인가 ${W(pfDisc)}</div>
      <div style="font-family:var(--mono);font-size:16px;font-weight:700;color:${color};margin-bottom:4px">순수익 ${W(profit)}${loss}</div>
      <div style="font-size:11px;color:var(--tx2)">적정 할인가: <strong>${W(recPrice)}</strong>
        <span style="color:${diffColor};margin-left:4px">(${diffText})</span>
        ${diff < 0 ? `<button onclick="applyRecPrice(${item.idx},'${pf}')" style="margin-left:4px;padding:1px 6px;font-size:10px;border:1px solid var(--red);background:none;color:var(--red);border-radius:4px;cursor:pointer">적용</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

// ── 메인 렌더 ──
function renderMenuCost() {
  // localStorage에서 복원
  if (!MENU_DATA.length) {
    try {
      const saved = JSON.parse(localStorage.getItem('menuCostData') || '[]');
      const orig = JSON.parse(localStorage.getItem('menuCostDataOrig') || '[]');
      if (saved.length) {
        MENU_DATA = saved;
        if (orig.length) MENU_DATA_ORIG = orig;
        else MENU_DATA_ORIG = JSON.parse(JSON.stringify(saved));
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

  // 요약 지표
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
      const pct = item.discPrice ? (c.val / item.discPrice * 100) : 0;
      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span style="width:60px;font-size:11px;color:var(--tx2);text-align:right">${c.name}</span>
        <div style="flex:1;background:var(--bg3);border-radius:4px;height:18px;overflow:hidden">
          <div style="width:${Math.min(pct, 100)}%;height:100%;background:${pct > 15 ? 'var(--danger)' : 'var(--grn)'};border-radius:4px;transition:width .3s"></div>
        </div>
        <span style="width:80px;font-size:11px;font-family:var(--mono);color:var(--tx2);text-align:right">${W(c.val)} (${pct.toFixed(1)}%)</span>
      </div>`;
    }).join('');

    const totalBarColor = item.storeCostRate >= 50 ? 'var(--danger)' : item.storeCostRate >= 35 ? 'var(--or)' : 'var(--grn)';
    const profitPct = item.discPrice ? (item.storeProfit / item.discPrice * 100) : 0;
    const profitBarColor = item.storeProfit >= 0 ? 'var(--blue)' : 'var(--danger)';
    const badgeColor = item.gradeClass === 'mc-good' ? 'var(--grn)' : item.gradeClass === 'mc-warn' ? 'var(--or)' : 'var(--danger)';

    // 플랫폼별 가격 편집 UI
    const pfPriceHtml = PFS.map(pf => {
      const pfPrice = item['pf_'+pf+'_price'] || item.price;
      const pfDisc = item['pf_'+pf+'_disc'] || item.discPrice;
      const maxVal = Math.max(pfPrice * 2, 50000);
      return `<div style="background:var(--bg3);border-radius:10px;padding:10px">
        <div style="font-size:12px;font-weight:600;color:var(--tx2);margin-bottom:6px">${pfIcon(pf)} ${pfName(pf)}</div>
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px">
          <span style="font-size:10px;color:var(--muted);width:35px">판매가</span>
          <input id="mc-${item.idx}-${pf}-price" type="number" value="${pfPrice}"
            oninput="updatePfPrice(${item.idx},'${pf}','price',this.value)"
            style="flex:1;width:0;background:var(--bg2);border:1px solid var(--bd);border-radius:6px;padding:4px 6px;color:var(--tx);font-family:var(--mono);font-size:12px;outline:none">
        </div>
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px">
          <span style="font-size:10px;color:var(--muted);width:35px">할인가</span>
          <input id="mc-${item.idx}-${pf}-disc" type="number" value="${pfDisc}"
            oninput="updatePfPrice(${item.idx},'${pf}','disc',this.value)"
            style="flex:1;width:0;background:var(--bg2);border:1px solid var(--bd);border-radius:6px;padding:4px 6px;color:var(--tx);font-family:var(--mono);font-size:12px;outline:none">
        </div>
        <input id="mc-${item.idx}-${pf}-disc-s" type="range" min="0" max="${maxVal}" step="100" value="${pfDisc}"
          oninput="updatePfPrice(${item.idx},'${pf}','disc',this.value)"
          style="width:100%;margin-top:2px">
      </div>`;
    }).join('');

    return `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div>
          <span style="font-size:15px;font-weight:700">${item.name}</span>
          <span style="font-size:12px;color:var(--muted);margin-left:8px">가게 판매가 ${W(item.price)} → 할인가 ${W(item.discPrice)}</span>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <span style="padding:4px 10px;border-radius:8px;font-size:12px;font-weight:700;color:#fff;background:${badgeColor}">${item.grade}</span>
          <button onclick="resetPfPrices(${item.idx})" style="padding:4px 8px;border:1px solid var(--bd);background:var(--bg3);color:var(--tx2);border-radius:6px;font-size:11px;cursor:pointer" title="엑셀 원본 가격으로 초기화">🔄 초기화</button>
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap">
        <span style="font-size:12px;color:var(--grn);font-weight:600">가게 순수익 ${W(item.storeProfit)} (마진 ${item.storeMarginRate.toFixed(1)}%)</span>
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

      <div style="font-size:12px;font-weight:600;color:var(--tx2);margin-bottom:6px">💰 플랫폼별 가격 설정</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">${pfPriceHtml}</div>

      <div style="font-size:12px;font-weight:600;color:var(--tx2);margin-bottom:6px">📦 플랫폼별 순수익 (할인가 - 수수료 - 배달비 - 원가)</div>
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
      case 'price': va = a.discPrice; vb = b.discPrice; break;
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
      const pfDisc = item['pf_'+pf+'_disc'] || item.discPrice;
      const bg = val === maxP ? 'rgba(45,158,107,0.15)' : val === minP ? 'rgba(229,48,42,0.15)' : '';
      const color = val < 0 ? 'var(--danger)' : 'var(--tx)';
      return `<td style="background:${bg};color:${color}" title="할인가 ${W(pfDisc)}">${W(val)}</td>`;
    };

    return `<tr>
      <td style="text-align:left;font-family:inherit">${item.name}</td>
      <td>${W(item.discPrice)}</td>
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
