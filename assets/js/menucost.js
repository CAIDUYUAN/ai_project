// ==============================================
// [MC] 메뉴 원가 분석
// ==============================================

let MENU_DATA = [];
let menuSortKey = 'name';
let menuSortAsc = true;

// ── 플랫폼별 수수료율 계산 ──
function pfFeeRate(pf) {
  return (S[pf+'Comm'] + S[pf+'Pg'] + S[pf+'Vat'] + S[pf+'Extra']) / 100;
}
function pfDel(pf) { return S[pf+'Del'] || 0; }

// ── 메뉴별 계산 ──
function calcMenuItem(item) {
  const costTotal = item.food + item.sauce + item.pack + item.side + item.etc;
  const costRate = item.discPrice ? (costTotal / item.discPrice * 100) : 0;

  let grade, gradeClass;
  if (costRate < 35) { grade = '양호'; gradeClass = 'mc-good'; }
  else if (costRate <= 50) { grade = '주의'; gradeClass = 'mc-warn'; }
  else { grade = '위험'; gradeClass = 'mc-bad'; }

  const profits = {};
  ['bm','cp','tg','yg'].forEach(pf => {
    profits[pf] = item.discPrice * (1 - pfFeeRate(pf)) - pfDel(pf) - costTotal;
  });

  const bestPf = Object.keys(profits).reduce((a, b) => profits[a] > profits[b] ? a : b);
  const worstPf = Object.keys(profits).reduce((a, b) => profits[a] < profits[b] ? a : b);

  return { ...item, costTotal, costRate, grade, gradeClass, profits, bestPf, worstPf };
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
        });
      }

      // localStorage에 저장
      localStorage.setItem('menuCostData', JSON.stringify(MENU_DATA));

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
  const headers = ['메뉴명','판매가 (원)','할인후가격 (원)','식재료비 (원)','소스비 (원)','포장재비 (원)\n비닐+숟가락+젓가락+용기','반찬비 (원)\n(용기포함)','기타원가 (원)'];
  const sample = [
    ['상품명1', 13900, 11900, 3800, 500, 600, 400, 300],
    ['상품명2', 16900, 14900, 4800, 600, 650, 450, 300],
  ];

  const ws = XLSX.utils.aoa_to_sheet([
    ['메뉴 원가 입력 파일'],
    ['※ 하늘색 셀에만 직접 입력하세요. 계산은 홈페이지에서 자동으로 처리됩니다.'],
    headers,
    ...sample
  ]);

  // 열 너비 설정
  ws['!cols'] = [
    {wch:12},{wch:12},{wch:14},{wch:12},{wch:10},{wch:18},{wch:14},{wch:12}
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '메뉴원가');
  XLSX.writeFile(wb, 'menu_input_sample.xlsx');
}

// ── 메인 렌더 ──
function renderMenuCost() {
  // localStorage에서 복원
  if (!MENU_DATA.length) {
    try {
      const saved = JSON.parse(localStorage.getItem('menuCostData') || '[]');
      if (saved.length) {
        MENU_DATA = saved;
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

  const items = MENU_DATA.map(calcMenuItem);
  document.getElementById('mc-summary').style.display = 'block';
  document.getElementById('mc-table-card').style.display = 'block';

  // 요약 지표
  const avgCost = items.reduce((s, i) => s + i.costRate, 0) / items.length;
  const best = items.reduce((a, b) => a.profits[a.bestPf] > b.profits[b.bestPf] ? a : b);
  const worst = items.reduce((a, b) => a.costRate > b.costRate ? a : b);

  document.getElementById('mc-count').textContent = items.length + '건';
  const avgEl = document.getElementById('mc-avg-cost');
  avgEl.textContent = avgCost.toFixed(1) + '%';
  avgEl.className = 'kpi-value ' + (avgCost > 35 ? 'neg' : 'pos');
  document.getElementById('mc-best').textContent = best.name;
  document.getElementById('mc-best-sub').textContent = pfName(best.bestPf) + ' ' + W(best.profits[best.bestPf]);
  document.getElementById('mc-worst').textContent = worst.name;
  document.getElementById('mc-worst-sub').textContent = '원가율 ' + worst.costRate.toFixed(1) + '%';

  // 카드 리스트
  renderMenuCards(items);

  // 테이블
  renderMenuTable(items);
}

const pfName = pf => ({bm:'배민',cp:'쿠팡이츠',tg:'땡겨요',yg:'요기요'}[pf] || pf);
const pfColor = pf => ({bm:'var(--grn)',cp:'var(--danger)',tg:'#2D9E6B',yg:'#E5302A'}[pf] || 'var(--tx)');

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
        <span style="width:50px;font-size:11px;font-family:var(--mono);color:var(--tx2);text-align:right">${pct.toFixed(1)}%</span>
      </div>`;
    }).join('');

    const totalBarColor = item.costRate >= 50 ? 'var(--danger)' : item.costRate >= 35 ? 'var(--or)' : 'var(--grn)';

    const profitsHtml = ['bm','cp','tg','yg'].map(pf => {
      const val = item.profits[pf];
      const isBest = pf === item.bestPf;
      const isWorst = pf === item.worstPf;
      const bg = isBest ? 'rgba(45,158,107,0.12)' : isWorst ? 'rgba(229,48,42,0.12)' : 'var(--bg3)';
      const icon = isBest ? '✅ ' : isWorst ? '⚠️ ' : '';
      const color = val < 0 ? 'var(--danger)' : 'var(--tx)';
      const loss = val < 0 ? ' (손실)' : '';
      return `<div style="background:${bg};border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:11px;color:var(--tx2);margin-bottom:4px">${icon}${pfName(pf)}</div>
        <div style="font-family:var(--mono);font-size:14px;font-weight:600;color:${color}">${W(val)}${loss}</div>
      </div>`;
    }).join('');

    const badgeColor = item.gradeClass === 'mc-good' ? 'var(--grn)' : item.gradeClass === 'mc-warn' ? 'var(--or)' : 'var(--danger)';

    return `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div>
          <span style="font-size:15px;font-weight:700">${item.name}</span>
          <span style="font-size:12px;color:var(--muted);margin-left:8px">판매가 ${W(item.price)} → 할인가 ${W(item.discPrice)}</span>
        </div>
        <span style="padding:4px 10px;border-radius:8px;font-size:12px;font-weight:700;color:#fff;background:${badgeColor}">${item.grade}</span>
      </div>
      <div style="margin-bottom:12px">
        ${barsHtml}
        <div style="display:flex;align-items:center;gap:8px;margin-top:6px;padding-top:6px;border-top:1px solid var(--bd)">
          <span style="width:60px;font-size:11px;font-weight:700;color:var(--tx);text-align:right">원가합계</span>
          <div style="flex:1;background:var(--bg3);border-radius:4px;height:18px;overflow:hidden">
            <div style="width:${Math.min(item.costRate, 100)}%;height:100%;background:${totalBarColor};border-radius:4px;transition:width .3s"></div>
          </div>
          <span style="width:50px;font-size:11px;font-family:var(--mono);font-weight:700;color:${totalBarColor};text-align:right">${item.costRate.toFixed(1)}%</span>
        </div>
      </div>
      <div style="font-size:12px;font-weight:600;color:var(--tx2);margin-bottom:6px">📦 플랫폼별 순수익 (할인가 - 수수료 - 배달비 - 원가)</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${profitsHtml}</div>
    </div>`;
  }).join('');
}

// ── 테이블 렌더 ──
function renderMenuTable(items) {
  if (!items) items = MENU_DATA.map(calcMenuItem);

  // 정렬
  items.sort((a, b) => {
    let va, vb;
    switch(menuSortKey) {
      case 'name': va = a.name; vb = b.name; return menuSortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      case 'price': va = a.discPrice; vb = b.discPrice; break;
      case 'costTotal': va = a.costTotal; vb = b.costTotal; break;
      case 'costRate': va = a.costRate; vb = b.costRate; break;
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
    const costBg = item.costRate < 35 ? 'rgba(45,158,107,0.15)' : item.costRate <= 50 ? 'rgba(251,191,36,0.15)' : 'rgba(229,48,42,0.15)';
    const profitVals = [item.profits.bm, item.profits.cp, item.profits.tg, item.profits.yg];
    const maxP = Math.max(...profitVals);
    const minP = Math.min(...profitVals);

    const profitCell = (val) => {
      const bg = val === maxP ? 'rgba(45,158,107,0.15)' : val === minP ? 'rgba(229,48,42,0.15)' : '';
      const color = val < 0 ? 'var(--danger)' : 'var(--tx)';
      return `<td style="background:${bg};color:${color}">${W(val)}</td>`;
    };

    return `<tr>
      <td style="text-align:left;font-family:inherit">${item.name}</td>
      <td>${W(item.discPrice)}</td>
      <td>${W(item.costTotal)}</td>
      <td style="background:${costBg};font-weight:600">${item.costRate.toFixed(1)}%</td>
      ${profitCell(item.profits.bm)}
      ${profitCell(item.profits.cp)}
      ${profitCell(item.profits.tg)}
      ${profitCell(item.profits.yg)}
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
