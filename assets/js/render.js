// [L-0] 파일 다운로드 가이드
// ==============================================
function showGuide(pf) {
  const guides = {
    bm: `📋 배민 매출/매입 다운로드 방법

1. 배민 사장님 사이트 접속
2. [부가세신고내역] 클릭
3. 기간선택 → 월별 선택
4. [부가세 신고자료 받기] 클릭
5. [메일] 클릭
6. "매출 상세내역"과 "매입 상세내역" 두 개만 선택
7. [메일 보내기] 클릭
8. 메일에서 두 파일을 컴퓨터에 다운로드
9. 두 파일을 함께 업로드`,

    cp: `📋 쿠팡이츠 매출 다운로드 방법

1. 쿠팡이츠 사장님 사이트 접속
2. [매출관리] 클릭
3. 날짜 선택
4. [다운로드] 클릭`,

    tg: `📋 땡겨요 매출 다운로드 방법

1. 땡겨요 사장님 셀프서비스 사이트 접속
2. [정산내역] 클릭
3. ⚠️ 조회하지 말고 [정산내역 받기] 버튼 클릭
4. [건별정산내역] 클릭
5. 날짜 선택
6. [다운로드] 클릭`,

    yg: `📋 요기요 매출 다운로드 방법

1. 요기요 사장님 사이트 접속
2. 왼쪽 메뉴에서 [주문/세금] 클릭
3. 날짜선택에서 [월별] 클릭 → 날짜 선택 → [조회] 클릭
4. [상세 내역 다운로드] 버튼 클릭
5. [주문별 내역] 선택
6. [다운로드] 클릭`,
  };
  alert(guides[pf] || '가이드 준비 중');
}

// [L] 업로드 UI 업데이트
// ==============================================
function updateUploadUI(pf) {
  const tagsEl = document.getElementById('tags-' + pf);
  if (tagsEl) {
    // 월별로 매출/매입 합쳐서 표시
    const monthMap = {};
    FILES[pf].forEach(f => {
      const baseKey = f.key.replace('_purchase','');
      const basePeriod = f.period.replace(' 매입','');
      if (!monthMap[baseKey]) monthMap[baseKey] = {period:basePeriod, sales:false, purchase:false};
      if (f.key.includes('_purchase')) monthMap[baseKey].purchase = true;
      else {
        monthMap[baseKey].sales = true;
        // 쿠팡/땡겨요는 매출+매입 통합 파일
        const d = DB[pf] && DB[pf][baseKey];
        if (d && d._hasPurchaseData && !f.key.includes('_purchase')) monthMap[baseKey].purchase = true;
      }
    });
    tagsEl.innerHTML = Object.values(monthMap).map(m => {
      const label = m.sales && m.purchase ? m.period + ' 매출+매입'
                  : m.purchase ? m.period + ' 매입'
                  : m.period + ' 매출';
      const cls = m.sales && m.purchase ? 'both' : m.purchase ? 'pur' : '';
      return `<span class="utag ${pf} ${cls}">${label}</span>`;
    }).join('');
  }
  const boxEl = document.getElementById('box-' + pf);
  if (boxEl && FILES[pf].length > 0) boxEl.classList.add('loaded');
}
function updateFileList() {
  const pfLabel = {bm:'배민', cp:'쿠팡', tg:'땡겨요', yg:'요기요'};
  const pfColor = {bm:'var(--grn)', cp:'var(--red)', tg:'#2D9E6B', yg:'#E5302A'};
  const all = [
    ...FILES.bm.map(f=>({...f,pf:'bm'})),
    ...FILES.cp.map(f=>({...f,pf:'cp'})),
    ...FILES.tg.map(f=>({...f,pf:'tg'})),
    ...FILES.yg.map(f=>({...f,pf:'yg'})),
  ].sort((a,b)=>a.key.localeCompare(b.key));
  const card = document.getElementById('file-list-card');
  const grid = document.getElementById('file-grid');
  if (!all.length) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  document.getElementById('file-count').textContent = `(${all.length}개)`;
  grid.innerHTML = all.map(f => `
    <div class="file-item" style="border-left:3px solid ${pfColor[f.pf]}">
      <div>
        <div style="font-size:11px;font-weight:700;color:${pfColor[f.pf]}">${pfLabel[f.pf]} ${f.period}</div>
        <div style="font-size:10px;color:var(--muted)">${f.filename.length>22?f.filename.slice(0,20)+'...':f.filename}</div>
      </div>
      <button class="file-del" onclick="removeFile('${f.pf}','${f.key}')">×</button>
    </div>`).join('');
  updateHeaderPeriod();
}
function removeFile(pf, key) {
  // 매입 파일 삭제 시 해당 월 매출 데이터의 수수료 정보 초기화
  if (key.endsWith('_purchase')) {
    const moKey = key.replace('_purchase','');
    if (DB[pf][moKey]) {
      DB[pf][moKey]._hasPurchaseData = false;
      DB[pf][moKey].fee = 0;
      DB[pf][moKey].delivery = 0;
      DB[pf][moKey].feeRate = 0;
    }
  } else {
    delete DB[pf][key];
  }
  FILES[pf] = FILES[pf].filter(f => f.key !== key);
  deleteFromSupabase(pf, key).catch(e => console.warn(e));
  updateUploadUI(pf); updateFileList(); renderAll();
}
function clearAll() {
  ['bm','cp','tg','yg'].forEach(pf => {
    Object.keys(DB[pf]).forEach(k => delete DB[pf][k]);
    FILES[pf] = [];
    ['tags-','box-'].forEach(pre => {
      const el = document.getElementById(pre+pf);
      if(el){ if(pre==='tags-') el.innerHTML=''; else el.classList.remove('loaded'); }
    });
  });
  clearAllSupabase().catch(e => console.warn(e));
  updateFileList();
  renderAll();
}
function updateHeaderPeriod() {
  const months = allMonths();
  if (!months.length) { document.getElementById('hd-period').textContent = '파일을 업로드해주세요'; return; }
  const f = months[0].replace('-','년 ')+'월', l = months[months.length-1].replace('-','년 ')+'월';
  document.getElementById('hd-period').textContent = f + (months.length > 1 ? ' ~ '+l : '');
}

// ==============================================
// [M] 데이터 집계
// ==============================================
let SEL = new Set(['all']); // 다중 월 선택 (Set)
let SEL_PF = new Set(['bm','cp','tg','yg']); // 플랫폼 필터

function getFilteredMonths() {
  const months = allMonths();
  if (SEL.has('all')) return months;
  return months.filter(m => SEL.has(m));
}

function aggregate() {
  const months   = allMonths();
  const filtered = getFilteredMonths();
  let tR=0,tFee=0,tDel=0,tCpn=0,tOrd=0;
  let bmR=0,bmFee=0,bmDel=0,bmCpn=0,bmOrd=0,bmAd=0;
  let cpR=0,cpFee=0,cpDel=0,cpCpn=0,cpOrd=0,cpAd=0;
  let tgR=0,tgFee=0,tgDel=0,tgOrd=0,tgAd=0;
  let ygR=0,ygFee=0,ygDel=0,ygOrd=0,ygAd=0;
  const dailyBM={}, dailyCP={}, dailyTG={}, dailyYG={};

  filtered.forEach(mo => {
    const bm=DB.bm[mo], cp=DB.cp[mo], tg=DB.tg[mo], yg=DB.yg[mo];
    if (bm && SEL_PF.has('bm')) {
      tR+=bm.totalRev; tFee+=bm.fee; tDel+=bm.delivery; tCpn+=bm.coupon; tOrd+=bm.orders;
      bmR+=bm.totalRev; bmFee+=bm.fee; bmDel+=bm.delivery; bmCpn+=bm.coupon; bmOrd+=bm.orders; bmAd+=(bm.ad||0);
      Object.entries(bm.daily).forEach(([d,v])=>{ if(!dailyBM[d])dailyBM[d]={rev:0,orders:0}; dailyBM[d].rev+=v.rev; dailyBM[d].orders+=v.orders; });
    }
    if (cp && SEL_PF.has('cp')) {
      tR+=cp.totalRev; tFee+=cp.fee; tDel+=cp.delivery; tCpn+=cp.coupon; tOrd+=cp.orders;
      cpR+=cp.totalRev; cpFee+=cp.fee; cpDel+=cp.delivery; cpCpn+=cp.coupon; cpOrd+=cp.orders; cpAd+=(cp.ad||0);
      Object.entries(cp.daily).forEach(([d,v])=>{ if(!dailyCP[d])dailyCP[d]={rev:0,orders:0}; dailyCP[d].rev+=v.rev; dailyCP[d].orders+=v.orders; });
    }
    if (tg && SEL_PF.has('tg')) {
      tR+=tg.totalRev; tFee+=tg.fee; tDel+=tg.delivery; tOrd+=tg.orders;
      tgR+=tg.totalRev; tgFee+=tg.fee; tgDel+=tg.delivery; tgOrd+=tg.orders; tgAd+=(tg.ad||0);
      Object.entries(tg.daily).forEach(([d,v])=>{ if(!dailyTG[d])dailyTG[d]={rev:0,orders:0}; dailyTG[d].rev+=v.rev; dailyTG[d].orders+=v.orders; });
    }
    if (yg && SEL_PF.has('yg')) {
      tR+=yg.totalRev; tFee+=yg.fee; tDel+=(yg.delivery||0); tOrd+=yg.orders;
      ygR+=yg.totalRev; ygFee+=yg.fee; ygDel+=(yg.delivery||0); ygOrd+=yg.orders; ygAd+=(yg.ad||0);
      Object.entries(yg.daily).forEach(([d,v])=>{ if(!dailyYG[d])dailyYG[d]={rev:0,orders:0}; dailyYG[d].rev+=v.rev; dailyYG[d].orders+=v.orders; });
    }
  });

  const tAd = bmAd + cpAd + tgAd + ygAd;
  const tDeduct = tFee + tDel + tCpn + tAd;
  const deposit = tR - tDeduct;
  const fixed   = fixedCost() * filtered.length;
  const prf     = deposit - fixed;
  const net     = prf - tR * S.cogs / 100;
  const afr     = tR ? tDeduct/tR : 0.28;
  const bepMo   = fixedCost() / (1 - S.cogs/100 - afr);
  const bep     = bepMo * filtered.length;

  return {
    tR, tFee, tDel, tCpn, tAd, tDeduct, deposit, fixed, prf, net, tOrd,
    days: new Set([...Object.keys(dailyBM),...Object.keys(dailyCP),...Object.keys(dailyTG),...Object.keys(dailyYG)]).size,
    months, filtered, dailyBM, dailyCP, dailyTG, dailyYG, bep, bepMo,
    bm:{r:bmR, fee:bmFee, del:bmDel, cpn:bmCpn, ord:bmOrd, ad:bmAd},
    cp:{r:cpR, fee:cpFee, del:cpDel, cpn:cpCpn, ord:cpOrd, ad:cpAd},
    tg:{r:tgR, fee:tgFee, del:tgDel, cpn:0,     ord:tgOrd, ad:tgAd},
    yg:{r:ygR, fee:ygFee, del:ygDel, cpn:0,     ord:ygOrd, ad:ygAd},
  };
}

// ==============================================
// [N] 월 선택 버튼
// ==============================================
function selectMonth(mo, e) {
  if (mo === 'all') {
    SEL = new Set(['all']);
  } else if (e && (e.ctrlKey || e.metaKey)) {
    // Ctrl 클릭: 다중 선택 토글
    SEL.delete('all');
    if (SEL.has(mo)) SEL.delete(mo);
    else SEL.add(mo);
    if (SEL.size === 0) SEL = new Set(['all']);
  } else {
    SEL = new Set([mo]);
  }
  // 달력 동기화
  if (!SEL.has('all') && SEL.size === 1) {
    const [y, m] = [...SEL][0].split('-').map(Number);
    calY = y; calM = m - 1;
  }
  renderOverview(); renderCompare(); renderCalendar(); renderDiagnosis();
}
function togglePlatform(pf) {
  if (SEL_PF.has(pf)) SEL_PF.delete(pf);
  else SEL_PF.add(pf);
  if (SEL_PF.size === 0) SEL_PF = new Set(['bm','cp','tg','yg']); // 전부 해제 시 전체 선택
  renderOverview(); renderCompare(); renderCalendar(); renderDiagnosis();
}
function renderMonthBtns(containerId) {
  const el = document.getElementById(containerId); if(!el) return;
  el.innerHTML = '';

  // 플랫폼 필터 버튼
  const pfBar = document.createElement('div');
  pfBar.style.cssText = 'display:flex;gap:4px;margin-bottom:6px;flex-wrap:wrap';
  const pfList = [
    {pf:'bm', name:'🛵 배민', color:'var(--grn)'},
    {pf:'cp', name:'🧡 쿠팡', color:'var(--danger)'},
    {pf:'tg', name:'🟢 땡겨요', color:'#2D9E6B'},
    {pf:'yg', name:'🟠 요기요', color:'#E5302A'},
  ];
  pfList.forEach(({pf, name, color}) => {
    const btn = document.createElement('button');
    const active = SEL_PF.has(pf);
    btn.className = 'mbtn';
    btn.style.cssText = active
      ? `background:${color};color:#fff;border-color:${color};font-weight:700;font-size:11px`
      : `opacity:0.4;font-size:11px`;
    btn.textContent = name;
    btn.onclick = () => togglePlatform(pf);
    pfBar.appendChild(btn);
  });
  el.appendChild(pfBar);

  // 월 선택 버튼
  const monthBar = document.createElement('div');
  monthBar.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap';

  const allBtn = document.createElement('button');
  allBtn.className = 'mbtn' + (SEL.has('all')?' active':'');
  allBtn.textContent = '전체';
  allBtn.onclick = (e) => selectMonth('all', e);
  monthBar.appendChild(allBtn);

  allMonths().forEach(mo => {
    const btn = document.createElement('button');
    btn.className = 'mbtn' + (SEL.has(mo)?' active':'');
    btn.textContent = mo.replace('-','년 ')+'월';
    btn.onclick = (e) => selectMonth(mo, e);
    btn.title = 'Ctrl+클릭으로 다중 선택';
    monthBar.appendChild(btn);
  });
  el.appendChild(monthBar);
}

// ==============================================
// [O] 렌더 진입점
// ==============================================
function renderAll() {
  if (!allMonths().length) return;
  const id = (document.querySelector('.panel.active')?.id || '').replace('panel-','');
  if (id === 'overview') renderOverview();
  if (id === 'compare')  renderCompare();
  if (id === 'calendar') renderCalendar();
}

// ==============================================
// [P] 종합현황 렌더
// ==============================================
// ── 경고 클릭 → 해당 탭+위치로 이동 ──
function goToWarning(tab, targetId) {
  goTab(tab);
  // 진단센터 서브탭 처리
  if (tab === 'diagnosis' && targetId.startsWith('diag-')) {
    const subId = targetId.replace('diag-','');
    switchDiag(subId);
  }
  setTimeout(() => {
    const el = document.getElementById(targetId);
    if (el) {
      el.scrollIntoView({behavior:'smooth', block:'center'});
      // 하이라이트 효과
      el.style.transition = 'box-shadow 0.3s';
      el.style.boxShadow = '0 0 0 3px var(--red)';
      setTimeout(() => { el.style.boxShadow = ''; }, 2000);
    }
  }, 300);
}

function renderOverview() {
  renderMonthBtns('ov-months');
  const ag = aggregate();

  // KPI 1행 - 핵심
  set('k-rev', W(ag.tR)); set('k-orders', `주문 ${ag.tOrd}건`);
  setKpi('k-net', W(ag.net), ag.net >= 0);
  set('k-net-sub', `원가율 ${S.cogs}% | 고정비 -${W(ag.fixed)}`);
  const hourly = ag.tOrd > 0 ? Math.round(ag.net / (26 * 10)) : 0;
  set('k-hourly', W(hourly));

  // 진단 경고 배너
  const warnings = [];
  if (ag.tR > 0) {
    const feeRate = ag.tFee / ag.tR * 100;
    const delRate = ag.tDel / ag.tR * 100;
    const fixedRate = ag.fixed / ag.tR * 100;
    const netRate = ag.net / ag.tR * 100;
    const adTotal = (ag.bm.ad||0) + (ag.cp.ad||0) + (ag.tg.ad||0) + (ag.yg.ad||0);
    const adRate = adTotal / ag.tR * 100;
    const avgOrder = ag.tOrd ? ag.tR / ag.tOrd : 0;

    if (ag.net < 0)
      warnings.push({icon:'🔴', msg:'순수익이 마이너스입니다! ' + W(ag.net), tab:'overview', target:'k-net', level:'danger'});
    else if (netRate < 5)
      warnings.push({icon:'🟡', msg:'순수익률 ' + netRate.toFixed(1) + '% (매우 낮음, 권장 10% 이상)', tab:'overview', target:'k-net', level:'warn'});

    if (feeRate > 15)
      warnings.push({icon:'🔴', msg:'수수료 비중 ' + feeRate.toFixed(1) + '% (권장 15% 이하)', tab:'compare', target:'cmp-tbody', level:'danger'});
    else if (feeRate > 12)
      warnings.push({icon:'🟡', msg:'수수료 비중 ' + feeRate.toFixed(1) + '% (주의 구간)', tab:'compare', target:'cmp-tbody', level:'warn'});

    if (delRate > 15)
      warnings.push({icon:'🔴', msg:'배달비 비중 ' + delRate.toFixed(1) + '% (매우 높음)', tab:'compare', target:'cmp-tbody', level:'danger'});
    else if (delRate > 10)
      warnings.push({icon:'🟡', msg:'배달비 비중 ' + delRate.toFixed(1) + '% (권장 10% 이하)', tab:'compare', target:'cmp-tbody', level:'warn'});

    if (fixedRate > 50)
      warnings.push({icon:'🔴', msg:'고정비가 매출의 ' + fixedRate.toFixed(1) + '% (과다)', tab:'settings', target:'s-rent', level:'danger'});

    if (adRate > 5)
      warnings.push({icon:'🟡', msg:'광고비 비중 ' + adRate.toFixed(1) + '% (' + W(adTotal) + ')', tab:'diagnosis', target:'diag-adcalc', level:'warn'});
    else if (adTotal > 0 && adRate > 3)
      warnings.push({icon:'🟢', msg:'광고비 ' + W(adTotal) + ' (' + adRate.toFixed(1) + '%)', tab:'diagnosis', target:'diag-adcalc', level:'info'});

    if (avgOrder < 15000 && ag.tOrd > 10)
      warnings.push({icon:'🟡', msg:'건당 평균 ' + W(avgOrder) + ' (단가가 낮음)', tab:'overview', target:'k-per-order', level:'warn'});

    // 플랫폼별 수수료율 비교
    ['bm','cp','tg','yg'].forEach(pf => {
      const p = ag[pf];
      if (p.r > 0 && p.fee / p.r > 0.15) {
        const name = {bm:'배민',cp:'쿠팡',tg:'땡겨요',yg:'요기요'}[pf];
        warnings.push({icon:'🟡', msg:name + ' 수수료율 ' + (p.fee/p.r*100).toFixed(1) + '%', tab:'settings', target:'s-'+pf+'-comm', level:'warn'});
      }
    });

    if (ag.bep > 0 && ag.tR < ag.bep)
      warnings.push({icon:'🔴', msg:'매출이 손익분기점(' + W(ag.bep) + ') 미달!', tab:'settings', target:'bep-summary', level:'danger'});
  }

  const banner = document.getElementById('warning-banner');
  const bannerText = document.getElementById('warning-text');
  if (warnings.length) {
    bannerText.innerHTML = warnings.map(w => {
      const bgColor = w.level === 'danger' ? 'rgba(229,48,42,0.1)' : w.level === 'warn' ? 'rgba(251,191,36,0.1)' : 'rgba(45,158,107,0.1)';
      return `<div onclick="goToWarning('${w.tab}','${w.target}')" style="padding:4px 10px;margin-bottom:3px;border-radius:6px;background:${bgColor};cursor:pointer;transition:opacity .15s" onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'">${w.icon} ${w.msg} <span style="font-size:10px;color:var(--muted)">→ 클릭하여 확인</span></div>`;
    }).join('');
    banner.style.display = 'block';
  } else { banner.style.display = 'none'; }

  // KPI 2행 - 상세
  setKpi('k-deposit', W(ag.deposit), ag.deposit >= 0);
  set('k-deposit-sub', `정산율 ${Pct(ag.deposit,ag.tR)} | 차감 -${W(ag.tDeduct)}`);
  set('k-deduct', W(ag.tDeduct));
  const fP = ag.tR ? (v => (v/ag.tR*100).toFixed(1)+'%') : ()=>'0%';
  set('k-deduct-sub', `수수료 ${W(ag.tFee)} (${fP(ag.tFee)}) | 배달 ${W(ag.tDel)} (${fP(ag.tDel)}) | 쿠폰 ${W(ag.tCpn)} (${fP(ag.tCpn)})${ag.tAd ? ' | 광고 '+W(ag.tAd)+' ('+fP(ag.tAd)+')' : ''}`);
  set('k-per-order', W(ag.tOrd ? ag.tR/ag.tOrd : 0));
  set('k-orders-sub', `${ag.tOrd.toLocaleString()}건 · ${ag.days}일 영업`);

  // 일별 막대 차트
  const allDays = [...new Set([...Object.keys(ag.dailyBM), ...Object.keys(ag.dailyCP), ...Object.keys(ag.dailyTG), ...Object.keys(ag.dailyYG)])].sort();
  const chart   = document.getElementById('bar-chart'); chart.innerHTML = '';
  const maxRev  = Math.max(...allDays.map(d => (ag.dailyBM[d]?.rev||0)+(ag.dailyCP[d]?.rev||0)+(ag.dailyTG[d]?.rev||0)+(ag.dailyYG[d]?.rev||0)), 1);
  allDays.forEach(day => {
    const bR=ag.dailyBM[day]?.rev||0, cR=ag.dailyCP[day]?.rev||0, gR=ag.dailyTG[day]?.rev||0, yR=ag.dailyYG[day]?.rev||0;
    const tot = bR+cR+gR+yR, H = Math.max(tot/maxRev*82, 2);
    const bH=tot?bR/tot*H:0, cH=tot?cR/tot*H:0, gH=tot?gR/tot*H:0, yH=H-bH-cH-gH;
    const col = document.createElement('div'); col.className = 'bar-col';
    col.innerHTML = `<div class="bar-bm" style="height:${bH}px"></div><div class="bar-cp" style="height:${cH}px"></div><div style="width:100%;background:#2D9E6B;min-height:${gR?2:0}px;height:${gH}px"></div><div style="width:100%;background:#E5302A;min-height:${yR?2:0}px;height:${yH}px"></div><div class="bar-label">${parseInt(day.split('-')[2])}</div>`;
    chart.appendChild(col);
  });

  // 월별 요약 테이블
  const tbody  = document.getElementById('monthly-tbody'); tbody.innerHTML = '';
  const fixed1 = fixedCost();
  ag.months.forEach(mo => {
    const bm=DB.bm[mo], cp=DB.cp[mo], tg=DB.tg[mo], yg=DB.yg[mo];
    const bmR=bm?.totalRev||0, cpR=cp?.totalRev||0, tgR=tg?.totalRev||0, ygR=yg?.totalRev||0, tot=bmR+cpR+tgR+ygR;
    const totO   = (bm?.orders||0)+(cp?.orders||0)+(tg?.orders||0)+(yg?.orders||0);
    const deduct = (bm?.fee||0)+(bm?.delivery||0)+(bm?.coupon||0)
                 + (cp?.fee||0)+(cp?.delivery||0)+(cp?.coupon||0)
                 + (tg?.fee||0)+(tg?.delivery||0)
                 + (yg?.fee||0)+(yg?.delivery||0);
    const dep=tot-deduct, prf=dep-fixed1;
    const tr = document.createElement('tr');
    if (SEL.has(mo)) tr.style.background='rgba(229,48,42,0.04)';
    tr.innerHTML = `
      <td style="font-weight:${SEL.has(mo)?700:400}">${mo.replace('-','년 ')}월</td>
      <td style="color:var(--grn)">${W(bmR)}</td>
      <td style="color:var(--danger)">${W(cpR)}</td>
      <td style="color:#2D9E6B">${W(tgR)}</td>
      <td style="color:#E5302A">${W(ygR)}</td>
      <td style="font-weight:700">${W(tot)}</td>
      <td>${totO}건</td>
      <td class="neg">-${W(deduct)}</td>
      <td style="color:var(--grn);font-weight:700">${W(dep)}</td>
      <td class="${prf>=0?'pos':'neg'}">${W(prf)}</td>`;
    tbody.appendChild(tr);
  });
  // 합계 행
  if (ag.months.length > 1) {
    const totDep=ag.tR-ag.tDeduct, totPrf=totDep-fixed1*ag.months.length;
    const tr = document.createElement('tr'); tr.className='tfoot';
    tr.innerHTML=`<td>합계</td><td style="color:var(--grn)">${W(ag.bm.r)}</td><td style="color:var(--danger)">${W(ag.cp.r)}</td><td style="color:#2D9E6B">${W(ag.tg.r)}</td><td style="color:#E5302A">${W(ag.yg.r)}</td><td>${W(ag.tR)}</td><td>${ag.tOrd}건</td><td class="neg">-${W(ag.tDeduct)}</td><td style="color:var(--grn);font-weight:700">${W(totDep)}</td><td class="${totPrf>=0?'pos':'neg'}">${W(totPrf)}</td>`;
    tbody.appendChild(tr);
  }

  // 서비스별 수수료 상세
  renderServiceDetail(ag.filtered);
}

// ── 서비스별 수수료 상세 렌더 ──
function renderServiceDetail(filteredMonths) {
  const card = document.getElementById('svc-detail-card');
  const content = document.getElementById('svc-detail-content');
  if (!card || !content) return;

  const pfLabels = {bm:'🛵 배민', cp:'🧡 쿠팡이츠', tg:'🟢 땡겨요', yg:'🟠 요기요'};
  const pfColors = {bm:'var(--grn)', cp:'var(--danger)', tg:'#2D9E6B', yg:'#E5302A'};
  let hasData = false;
  let html = '';

  ['bm','cp','tg','yg'].forEach(pf => {
    // 선택된 월들의 서비스별 데이터 집계
    const svcTotals = {};
    filteredMonths.forEach(mo => {
      const d = DB[pf][mo];
      if (!d || !d.services) return;
      Object.entries(d.services).forEach(([name, s]) => {
        if (!svcTotals[name]) svcTotals[name] = {count:0, fee:0, delivery:0, ad:0, total:0};
        svcTotals[name].count += s.count || 0;
        svcTotals[name].fee += s.fee || 0;
        svcTotals[name].delivery += s.delivery || 0;
        svcTotals[name].ad += s.ad || 0;
        svcTotals[name].total += s.total || 0;
      });
    });

    if (!Object.keys(svcTotals).length) return;
    hasData = true;

    const svcRows = Object.entries(svcTotals)
      .sort((a,b) => Math.abs(b[1].total) - Math.abs(a[1].total))
      .map(([name, s]) => `
        <tr>
          <td style="text-align:left;font-family:inherit">${name}</td>
          <td>${s.count.toLocaleString()}건</td>
          <td class="neg">${W(s.fee)}</td>
          <td class="neg">${W(s.delivery)}</td>
          <td class="neg">${W(s.ad)}</td>
          <td style="font-weight:700" class="neg">${W(s.total)}</td>
        </tr>`).join('');

    const grandTotal = Object.values(svcTotals).reduce((s,v) => ({
      count:s.count+v.count, fee:s.fee+v.fee, delivery:s.delivery+v.delivery, ad:s.ad+v.ad, total:s.total+v.total
    }), {count:0,fee:0,delivery:0,ad:0,total:0});

    html += `
      <div style="margin-bottom:16px">
        <div style="font-weight:700;color:${pfColors[pf]};margin-bottom:8px;font-size:14px">${pfLabels[pf]}</div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th style="text-align:left">서비스</th><th>건수</th><th>수수료</th><th>배달비</th><th>광고비</th><th>합계</th>
            </tr></thead>
            <tbody>${svcRows}</tbody>
            <tfoot><tr class="tfoot">
              <td style="text-align:left;font-family:inherit">합계</td>
              <td>${grandTotal.count.toLocaleString()}건</td>
              <td class="neg">${W(grandTotal.fee)}</td>
              <td class="neg">${W(grandTotal.delivery)}</td>
              <td class="neg">${W(grandTotal.ad)}</td>
              <td style="font-weight:700" class="neg">${W(grandTotal.total)}</td>
            </tr></tfoot>
          </table>
        </div>
      </div>`;
  });

  if (hasData) {
    card.style.display = 'block';
    content.innerHTML = html;
  } else {
    card.style.display = 'none';
  }
}

// ==============================================
// [Q] 플랫폼 비교 렌더
// ==============================================
function renderCompare() {
  renderMonthBtns('cmp-months');
  const ag = aggregate();
  const container = document.getElementById('pcard-container'); container.innerHTML = '';

  [{pf:'bm', name:'배달의민족', color:'var(--grn)', dot:'var(--grn)', ...ag.bm},
   {pf:'cp', name:'쿠팡이츠',   color:'var(--danger)', dot:'var(--red)', ...ag.cp},
   {pf:'tg', name:'땡겨요',     color:'#2D9E6B', dot:'#2D9E6B',   ...ag.tg},
   {pf:'yg', name:'요기요',     color:'#E5302A', dot:'#E5302A',   ...ag.yg},
  ].forEach(p => {
    const div = document.createElement('div'); div.className = 'pcard';
    const dep = p.r - p.fee - p.del - (p.cpn||0);
    const pfCount = [ag.bm.r,ag.cp.r,ag.tg.r,ag.yg.r].filter(r=>r>0).length || 1;
    const prf = dep - fixedCost() * (ag.filtered.length||1) / pfCount;
    const mg  = p.r ? prf/p.r*100 : 0;
    div.innerHTML = `
      <div class="pcard-head"><div class="pcard-dot" style="background:${p.dot}"></div><div class="pcard-name">${p.name}</div></div>
      <div class="deposit-box"><span class="l">💰 입금예정금액</span><span class="v">${W(dep)}</span></div>
      <div class="pcard-row"><span class="l">총 매출</span>       <span class="v">${W(p.r)}</span></div>
      <div class="pcard-row"><span class="l">주문 건수</span>     <span class="v">${p.ord}건</span></div>
      <div class="pcard-row"><span class="l">건당 평균</span>     <span class="v">${W(p.ord?p.r/p.ord:0)}</span></div>
      <div class="pcard-row"><span class="l">수수료</span>        <span class="v neg">-${W(p.fee)}</span></div>
      <div class="pcard-row"><span class="l">배달비</span>        <span class="v" style="color:var(--or)">-${W(p.del)}</span></div>
      ${p.cpn ? `<div class="pcard-row"><span class="l">쿠폰(상점부담)</span><span class="v" style="color:var(--danger)">-${W(p.cpn)}</span></div>` : ''}
      <hr class="pcard-divider">
      <div class="pcard-row"><span class="l">정산율</span>        <span class="v">${Pct(dep,p.r)}</span></div>
      <div class="pcard-row"><span class="l">순수익(재료前)</span><span class="v ${prf>=0?'pos':'neg'}">${W(prf)}</span></div>
      <div class="pcard-row"><span class="l">마진율</span>        <span class="v ${mg>=20?'pos':mg>=10?'':'neg'}">${mg.toFixed(1)}%</span></div>`;
    container.appendChild(div);
  });

  const bmDep=ag.bm.r-ag.bm.fee-ag.bm.del-ag.bm.cpn;
  const cpDep=ag.cp.r-ag.cp.fee-ag.cp.del-ag.cp.cpn;
  const tgDep=ag.tg.r-ag.tg.fee-ag.tg.del;
  const ygDep=ag.yg.r-ag.yg.fee-ag.yg.del;
  document.getElementById('cmp-tbody').innerHTML = [
    ['총 매출',         W(ag.bm.r),              W(ag.cp.r),              W(ag.tg.r),   W(ag.yg.r),   W(ag.tR)],
    ['주문 건수',       `${ag.bm.ord}건`,         `${ag.cp.ord}건`,         `${ag.tg.ord}건`, `${ag.yg.ord}건`, `${ag.tOrd}건`],
    ['건당 평균',       W(ag.bm.ord?ag.bm.r/ag.bm.ord:0), W(ag.cp.ord?ag.cp.r/ag.cp.ord:0), W(ag.tg.ord?ag.tg.r/ag.tg.ord:0), W(ag.yg.ord?ag.yg.r/ag.yg.ord:0), W(ag.tOrd?ag.tR/ag.tOrd:0)],
    ['수수료',         W(ag.bm.fee),             W(ag.cp.fee),             W(ag.tg.fee), W(ag.yg.fee), W(ag.tFee)],
    ['수수료율',        Pct(ag.bm.fee,ag.bm.r),   Pct(ag.cp.fee,ag.cp.r),   Pct(ag.tg.fee,ag.tg.r), Pct(ag.yg.fee,ag.yg.r), Pct(ag.tFee,ag.tR)],
    ['배달비',         W(ag.bm.del),             W(ag.cp.del),             W(ag.tg.del), W(ag.yg.del), W(ag.tDel)],
    ['쿠폰(상점부담)', W(ag.bm.cpn),             W(ag.cp.cpn),             '-',          '-',          W(ag.tCpn)],
    ['💰 입금예정금액',
      `<span style="color:var(--grn);font-weight:700">${W(bmDep)}</span>`,
      `<span style="color:var(--danger);font-weight:700">${W(cpDep)}</span>`,
      `<span style="color:#2D9E6B;font-weight:700">${W(tgDep)}</span>`,
      `<span style="color:#E5302A;font-weight:700">${W(ygDep)}</span>`,
      `<span style="color:var(--grn);font-weight:700">${W(ag.deposit)}</span>`],
  ].map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td><td style="font-weight:700">${r[5]}</td></tr>`).join('');
}

// ==============================================
// [R] 달력 렌더
// ==============================================
let calY = new Date().getFullYear(), calM = new Date().getMonth();

function renderCalendar() {
  const y = calY, m = calM;
  document.getElementById('cal-title').textContent = `${y}년 ${m+1}월`;
  const grid = document.getElementById('cal-grid'); grid.innerHTML = '';
  ['일','월','화','수','목','금','토'].forEach(d => {
    const el = document.createElement('div'); el.className='cal-dow'; el.textContent=d; grid.appendChild(el);
  });
  const fd = new Date(y,m,1).getDay(), dim = new Date(y,m+1,0).getDate();
  const todayStr = new Date().toISOString().substring(0,10);
  const mo = String(m+1).padStart(2,'0');
  const bmMo = DB.bm[`${y}-${mo}`], cpMo = DB.cp[`${y}-${mo}`], tgMo = DB.tg[`${y}-${mo}`], ygMo = DB.yg[`${y}-${mo}`];
  for (let i=0;i<fd;i++) { const el=document.createElement('div'); el.className='cal-cell empty'; grid.appendChild(el); }
  for (let d=1;d<=dim;d++) {
    const ds = `${y}-${mo}-${String(d).padStart(2,'0')}`;
    const bR = bmMo?.daily[ds]?.rev||0, bO = bmMo?.daily[ds]?.orders||0;
    const cR = cpMo?.daily[ds]?.rev||0, cO = cpMo?.daily[ds]?.orders||0;
    const gR = tgMo?.daily[ds]?.rev||0, gO = tgMo?.daily[ds]?.orders||0;
    const yR = ygMo?.daily[ds]?.rev||0, yO = ygMo?.daily[ds]?.orders||0;
    const tot = bR+cR+gR+yR, totO = bO+cO+gO+yO;
    const cell = document.createElement('div');
    cell.className = 'cal-cell' + (tot>0?' has-data':'') + (ds===todayStr?' today':'');
    const dailyTarget = fixedCost() / 26 / (1 - S.cogs/100 - 0.15);
    if (tot > 0 && tot >= dailyTarget) cell.style.background = 'rgba(45,158,107,0.08)';
    else if (tot > 0) cell.style.background = 'rgba(229,48,42,0.06)';
    if (tot > 0) {
      const bw=bR/tot*100, cw=cR/tot*100, gw=gR/tot*100, yw=100-bw-cw-gw;
      cell.innerHTML = `<div class="cal-day">${d}</div><div class="cal-rev">${W(tot).replace('₩','')}</div><div class="cal-orders">${totO}건</div><div class="cal-bar"><div class="cal-bar-bm" style="width:${bw}%"></div><div class="cal-bar-cp" style="width:${cw}%"></div><div style="background:#2D9E6B;width:${gw}%"></div><div style="background:#E5302A;width:${yw}%"></div></div>`;
      cell.addEventListener('mouseenter', () => showTooltip(cell,ds,bR,cR,bO,cO,bmMo,cpMo,gR,gO,yR,yO));
      cell.addEventListener('mouseleave', hideTooltip);
    } else {
      cell.innerHTML = `<div class="cal-day">${d}</div>`;
    }
    grid.appendChild(cell);
  }
  renderCalSummary(y, m+1, bmMo, cpMo, tgMo, ygMo);
}
function moveMonth(dir) {
  calM += dir;
  if (calM < 0) { calM=11; calY--; } if (calM > 11) { calM=0; calY++; }
  SEL = new Set([calY + '-' + String(calM+1).padStart(2,'0')]);
  renderOverview(); renderCompare(); renderCalendar();
}
function showTooltip(cell, ds, bR, cR, bO, cO, bmMo, cpMo, gR, gO, yR, yO) {
  gR=gR||0; gO=gO||0; yR=yR||0; yO=yO||0;
  const tt   = document.getElementById('cal-tooltip');
  const bFee = bR * bmFeeRate(), cFee = cpMo ? (cpMo.feeRate||0)*cR : 0;
  const bDl  = bO * S.bmDel, cDl = cO * S.cpDel;
  const totalR = bR+cR+gR+yR, totalO = bO+cO+gO+yO;
  let html   = `<div style="font-size:10px;color:var(--muted);margin-bottom:6px;font-weight:600">${ds}</div>`;
  if (bR) html += `<div class="tt-row"><span class="tt-label"><span class="tt-dot" style="background:var(--grn)"></span>배민</span><span class="tt-val" style="color:var(--grn)">${W(bR)}</span></div><div class="tt-row"><span class="tt-label" style="padding-left:11px">수수료</span><span class="tt-val neg">-${W(bFee)}</span></div><div class="tt-row"><span class="tt-label" style="padding-left:11px">배달비(${bO}건)</span><span class="tt-val" style="color:var(--or)">-${W(bDl)}</span></div>`;
  if (cR) html += `<div class="tt-row" style="margin-top:3px"><span class="tt-label"><span class="tt-dot" style="background:var(--red)"></span>쿠팡</span><span class="tt-val" style="color:var(--danger)">${W(cR)}</span></div><div class="tt-row"><span class="tt-label" style="padding-left:11px">수수료</span><span class="tt-val neg">-${W(cFee)}</span></div><div class="tt-row"><span class="tt-label" style="padding-left:11px">배달비(${cO}건)</span><span class="tt-val" style="color:var(--or)">-${W(cDl)}</span></div>`;
  if (gR) html += `<div class="tt-row" style="margin-top:3px"><span class="tt-label"><span class="tt-dot" style="background:#2D9E6B"></span>땡겨요</span><span class="tt-val" style="color:#2D9E6B">${W(gR)}</span></div>`;
  if (yR) html += `<div class="tt-row" style="margin-top:3px"><span class="tt-label"><span class="tt-dot" style="background:#E5302A"></span>요기요</span><span class="tt-val" style="color:#E5302A">${W(yR)}</span></div>`;
  html += `<hr class="tt-divider"><div class="tt-row"><span style="font-weight:700">합계</span><span class="tt-val">${W(totalR)}</span></div><div class="tt-row"><span style="font-size:10px;color:var(--muted)">${totalO}건</span><span style="font-size:10px;color:var(--muted)">건당 ${W(totalO?totalR/totalO:0)}</span></div>`;
  tt.innerHTML = html;
  const cr = cell.getBoundingClientRect(), pr = document.getElementById('cal-grid').getBoundingClientRect();
  let left = cr.left - pr.left + cr.width + 4;
  if (left + 185 > pr.width) left = cr.left - pr.left - 189;
  tt.style.left = left+'px'; tt.style.top = Math.max(0, cr.top-pr.top)+'px'; tt.style.display = 'block';
}
function hideTooltip() { document.getElementById('cal-tooltip').style.display = 'none'; }
function renderCalSummary(y, m, bmMo, cpMo, tgMo, ygMo) {
  const mo = String(m).padStart(2,'0');
  if (!tgMo) tgMo = DB.tg[`${y}-${mo}`];
  if (!ygMo) ygMo = DB.yg[`${y}-${mo}`];
  const bR=bmMo?.totalRev||0, bO=bmMo?.orders||0, bFee=bR*bmFeeRate(), bDl=bO*S.bmDel, bCpn=bmMo?.coupon||0;
  const cR=cpMo?.totalRev||0, cO=cpMo?.orders||0, cFee=cpMo?.fee||0,   cDl=cO*S.cpDel, cCpn=cpMo?.coupon||0;
  const gR=tgMo?.totalRev||0, gO=tgMo?.orders||0, gFee=tgMo?.fee||0,   gDl=tgMo?.delivery||0;
  const yR=ygMo?.totalRev||0, yO=ygMo?.orders||0, yFee=ygMo?.fee||0,   yDl=ygMo?.delivery||0;
  document.getElementById('cal-tbody').innerHTML = `
    <tr><td><span style="color:var(--grn);font-weight:700">배달의민족</span></td><td>${bO}건</td><td>${W(bR)}</td><td class="neg">-${W(bFee)}</td><td style="color:var(--or)">-${W(bDl)}</td><td style="color:var(--danger)">-${W(bCpn)}</td><td>${W(bO?bR/bO:0)}</td></tr>
    <tr><td><span style="color:var(--danger);font-weight:700">쿠팡이츠</span></td>  <td>${cO}건</td><td>${W(cR)}</td><td class="neg">-${W(cFee)}</td><td style="color:var(--or)">-${W(cDl)}</td><td style="color:var(--danger)">-${W(cCpn)}</td><td>${W(cO?cR/cO:0)}</td></tr>
    <tr><td><span style="color:#2D9E6B;font-weight:700">땡겨요</span></td>    <td>${gO}건</td><td>${W(gR)}</td><td class="neg">-${W(gFee)}</td><td style="color:var(--or)">-${W(gDl)}</td><td style="color:var(--danger)">-</td><td>${W(gO?gR/gO:0)}</td></tr>
    <tr><td><span style="color:#E5302A;font-weight:700">요기요</span></td>    <td>${yO}건</td><td>${W(yR)}</td><td class="neg">-${W(yFee)}</td><td style="color:var(--or)">-${W(yDl)}</td><td style="color:var(--danger)">-</td><td>${W(yO?yR/yO:0)}</td></tr>
    <tr class="tfoot"><td>합계</td><td>${bO+cO+gO+yO}건</td><td>${W(bR+cR+gR+yR)}</td><td class="neg">-${W(bFee+cFee+gFee+yFee)}</td><td style="color:var(--or)">-${W(bDl+cDl+gDl+yDl)}</td><td style="color:var(--danger)">-${W(bCpn+cCpn)}</td><td>${W((bO+cO+gO+yO)?(bR+cR+gR+yR)/(bO+cO+gO+yO):0)}</td></tr>`;
}

// ==============================================
// [S] 설정 BEP 요약
// ==============================================
function calcBEPSummary() {
  const fixed = fixedCost(); let tR=0, tD=0;
  allMonths().forEach(mo => {
    const bm=DB.bm[mo], cp=DB.cp[mo], tg=DB.tg[mo], yg=DB.yg[mo];
    if(bm){tR+=bm.totalRev; tD+=bm.fee+bm.delivery+bm.coupon;}
    if(cp){tR+=cp.totalRev; tD+=cp.fee+cp.delivery+cp.coupon;}
    if(tg){tR+=tg.totalRev; tD+=tg.fee+tg.delivery;}
    if(yg){tR+=yg.totalRev; tD+=yg.fee+(yg.delivery||0);}
  });
  const afr=tR?tD/tR:0.28;
  const bep=(fixed)/(1-S.cogs/100-afr);
  const bep2=(fixed+S.living)/(1-S.cogs/100-afr);
  set('s-fixed-total',W(fixed)); set('s-bep',W(bep)); set('s-daily-bep',W(bep/26)); set('s-bep2',W(bep2));
}

// ==============================================
// [T] 진단센터
// ==============================================
function switchDiag(id) {
  document.querySelectorAll('.diag-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.dtab').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById('diag-' + id);
  if (panel) panel.classList.add('active');
  const btn = document.querySelector('[data-dtab="' + id + '"]');
  if (btn) btn.classList.add('active');
  renderDiagnosis();
}

function renderDiagnosis() {
  const activePanel = document.querySelector('.diag-panel.active');
  if (!activePanel) return;
  const id = activePanel.id.replace('diag-','');
  if (id === 'diagnosis1') renderDiag1();
  if (id === 'leaks') renderLeaks();
  if (id === 'coupon') calcCoupon();
  if (id === 'pricing') calcPricing();
  if (id === 'adcalc') calcAd();
}

// 플랫폼별 기본 설정
const COUPON_PF_DEFAULTS = {
  bm: { fee:8.78, del:3100 },
  cp: { fee:13.10, del:3400 },
  tg: { fee:12.30, del:0 },
  yg: { fee:12.50, del:0 },
};

function setCouponPlatform(pf) {
  document.getElementById('dc-platform').value = pf;
  document.querySelectorAll('[data-cpf]').forEach(b => b.classList.toggle('active', b.dataset.cpf === pf));
  // 배달비 기본값 세팅
  const def = COUPON_PF_DEFAULTS[pf];
  document.getElementById('dc-del').value = def.del;
  document.getElementById('dc-del-slider').value = def.del;
  calcCoupon();
}

function syncCoupon(src) {
  // 슬라이더 ↔ 숫자 입력 동기화
  if (src === 'cost')       document.getElementById('dc-cost').value = document.getElementById('dc-cost-slider').value;
  if (src === 'cost-num')   document.getElementById('dc-cost-slider').value = document.getElementById('dc-cost').value;
  if (src === 'price')      document.getElementById('dc-price').value = document.getElementById('dc-price-slider').value;
  if (src === 'price-num')  document.getElementById('dc-price-slider').value = document.getElementById('dc-price').value;
  if (src === 'discount')   document.getElementById('dc-discount').value = document.getElementById('dc-discount-slider').value;
  if (src === 'discount-num') document.getElementById('dc-discount-slider').value = document.getElementById('dc-discount').value;
  if (src === 'del')        document.getElementById('dc-del').value = document.getElementById('dc-del-slider').value;
  if (src === 'del-num')    document.getElementById('dc-del-slider').value = document.getElementById('dc-del').value;
  calcCoupon();
}

function calcCoupon() {
  const cost = parseFloat(document.getElementById('dc-cost')?.value) || 0;
  const price = parseFloat(document.getElementById('dc-price')?.value) || 0;
  const discount = parseFloat(document.getElementById('dc-discount')?.value) || 0;
  const delivery = parseFloat(document.getElementById('dc-del')?.value) || 0;
  const pf = document.getElementById('dc-platform')?.value || 'bm';

  // 수수료율: 설정값에서 가져오기
  let feeRate;
  if (pf === 'bm') feeRate = (S.bmComm + S.bmPg + S.bmVat + S.bmExtra) / 100;
  else if (pf === 'cp') feeRate = (S.cpComm + S.cpPg + S.cpVat + S.cpExtra) / 100;
  else if (pf === 'tg') feeRate = (S.tgComm + S.tgPg + S.tgVat + S.tgExtra) / 100;
  else feeRate = (S.ygComm + S.ygPg + S.ygVat + S.ygExtra) / 100;

  const actualPrice = price - discount;
  // 쿠팡: 쿠폰 차감 전(정가) 기준 수수료 / 나머지: 차감 후(실결제액) 기준
  const feeBase = pf === 'cp' ? price : actualPrice;
  const fee = feeBase * feeRate;
  const feeTooltip = pf === 'cp' ? '쿠폰 차감 전 계산' : '쿠폰 차감 후 계산';
  const profit = actualPrice - fee - delivery - cost;
  const profitRate = price > 0 ? (profit / price * 100) : 0;

  // 판정: 15% 이상 안전, 8~15% 위험, 8% 미만 손해
  let badgeBg, badgeColor, statusText;
  if (profitRate >= 15) { badgeBg='#ECFDF5'; badgeColor='#065F46'; statusText='🟢 안전 구간'; }
  else if (profitRate >= 8) { badgeBg='#FEF9EC'; badgeColor='#92400E'; statusText='🟡 위험 근접'; }
  else { badgeBg='#FEE2E2'; badgeColor='#991B1B'; statusText='🔴 손실 구간'; }

  const row = (label, val, color) => '<div style="display:flex;justify-content:space-between;padding:6px 0' + (color ? ';color:'+color : '') + '"><span>' + label + '</span><span>' + val + '</span></div>';

  const el = document.getElementById('dc-result');
  if (el) el.innerHTML =
    '<div style="text-align:center;margin-bottom:14px">' +
      '<span style="display:inline-block;background:' + badgeBg + ';color:' + badgeColor + ';border-radius:20px;padding:4px 16px;font-size:14px;font-weight:600">' + statusText + '</span>' +
      '<div style="font-size:32px;font-weight:700;margin-top:10px;color:' + (profitRate >= 8 ? 'var(--tx)' : 'var(--danger)') + '">' + W(profit) + '</div>' +
      '<div style="font-size:13px;color:var(--muted)">건당 순수익 · 마진율 ' + profitRate.toFixed(1) + '%</div>' +
    '</div>' +
    '<div style="font-family:var(--mono);font-size:13px;border-top:1px solid var(--bd2);padding-top:10px">' +
      row('정가', W(price), '') +
      row('쿠폰 할인', '-' + W(discount), 'var(--danger)') +
      row('실제 수령가', W(actualPrice), '') +
      '<div style="display:flex;justify-content:space-between;padding:6px 0;color:var(--danger)"><span title="' + feeTooltip + '" style="cursor:help;border-bottom:1px dotted var(--muted)">수수료 (' + (feeRate*100).toFixed(1) + '%) <span style="font-size:10px;color:var(--muted)">ℹ️</span></span><span>-' + W(fee) + '</span></div>' +
      row('배달비', '-' + W(delivery), 'var(--danger)') +
      row('원가', '-' + W(cost), 'var(--danger)') +
      '<div style="border-top:1px solid var(--bd);margin:6px 0"></div>' +
      '<div style="display:flex;justify-content:space-between;font-weight:700;font-size:15px;padding:6px 0;color:' + (profitRate >= 8 ? 'var(--grn)' : 'var(--danger)') + '"><span>건당 순수익</span><span>' + W(profit) + ' (' + profitRate.toFixed(1) + '%)</span></div>' +
    '</div>';

  // 역산: 마진 15% 유지를 위한 가격
  // 쿠팡: profit = (price-disc) - price*rate - del - cost → price = (cost+del+disc+target) / (1-rate)
  // 나머지: profit = actual*(1-rate) - del - cost → actual = (cost+del+target) / (1-rate), price = actual+disc
  const targetMargin = 15;
  let minPrice15, lossPrice;
  if (pf === 'cp') {
    minPrice15 = (cost + delivery + discount) / (1 - feeRate - targetMargin/100);
    lossPrice = (cost + delivery + discount) / (1 - feeRate);
  } else {
    const minActual = (cost + delivery) / (1 - feeRate - targetMargin/100);
    minPrice15 = minActual + discount;
    const lossActual = (cost + delivery) / (1 - feeRate);
    lossPrice = lossActual + discount;
  }
  const reverseEl = document.getElementById('dc-reverse');
  if (reverseEl) reverseEl.innerHTML =
    '<div class="card-title">🔄 마진 15% 유지하려면?</div>' +
    '<div style="font-size:13px;line-height:2.2">' +
      '<div>쿠폰 없이 최소 판매가: <strong style="color:var(--grn)">' + W(Math.ceil(minPrice15/100)*100) + '</strong></div>' +
      '<div>쿠폰 ' + W(discount) + ' 적용 시 정가: <strong style="color:var(--or)">' + W(Math.ceil((minPrice15+discount)/100)*100) + '</strong></div>' +
      '<div style="margin-top:8px;padding:10px 14px;border-radius:10px;background:#FEE2E2;border-left:3px solid var(--danger);font-size:12px;color:#991B1B">' +
        '🔴 마지노선: <strong>' + W(Math.ceil(lossPrice/100)*100) + '</strong> 이하로 팔면 무조건 손해' +
      '</div>' +
    '</div>';
}

function renderDiag1() {
  const ag = aggregate();
  const netRate = ag.tR > 0 ? (ag.net / ag.tR * 100) : 0;
  let emoji, label, color, desc;
  if (netRate >= 20) { emoji='🟢'; label='정상 운영'; color='var(--grn)'; desc='순수익률 ' + netRate.toFixed(1) + '% — 건강한 수익 구조입니다'; }
  else if (netRate >= 10) { emoji='🟡'; label='위험 구간'; color='var(--or)'; desc='순수익률 ' + netRate.toFixed(1) + '% — 비용 구조 점검이 필요합니다'; }
  else { emoji='🔴'; label='헛돈 구간'; color='var(--red)'; desc='매출 ' + W(ag.tR) + ' 중 실제 손에 쥐는 돈은 ' + W(ag.net) + ' (' + netRate.toFixed(1) + '%)'; }
  const el = document.getElementById('diag1-result');
  if (el) el.innerHTML = '<div style="text-align:center;padding:20px 0"><div style="font-size:16px;color:var(--muted);margin-bottom:8px">이번 달 순수익</div><div style="font-size:36px;font-weight:900;color:' + color + ';margin-bottom:12px">' + W(ag.net) + '</div><div style="font-size:48px;margin-bottom:8px">' + emoji + '</div><div style="font-size:22px;font-weight:700;color:' + color + '">' + label + '</div><div style="font-size:13px;color:var(--muted);margin-top:8px">' + desc + '</div></div><hr style="border:none;border-top:1px solid var(--bd);margin:12px 0"><div style="font-size:12px;color:var(--muted);line-height:2"><div>원가율: ' + S.cogs.toFixed(1) + '% ' + (S.cogs > 35 ? '⚠️' : '✅') + ' (권장 35% 이하)</div><div>수수료율: ' + (ag.tR ? (ag.tFee/ag.tR*100).toFixed(1) : '0') + '% ' + (ag.tR && ag.tFee/ag.tR > 0.15 ? '⚠️' : '✅') + ' (권장 15% 이하)</div><div>고정비 비중: ' + (ag.tR ? (ag.fixed/ag.tR*100).toFixed(1) : '0') + '% ' + (ag.tR && ag.fixed/ag.tR > 0.5 ? '⚠️' : '✅') + ' (권장 50% 이하)</div></div>';
}

function renderLeaks() {
  const ag = aggregate();
  if (!ag.tR) { document.getElementById('leaks-result').innerHTML = '<div style="text-align:center;color:var(--muted);padding:20px">데이터를 먼저 업로드해주세요</div>'; return; }
  const cogsCost = ag.tR * S.cogs / 100;
  const items = [
    {name:'원가', val:cogsCost, color:'var(--danger)', warn:S.cogs > 35, tip:'권장 35% 이하'},
    {name:'플랫폼수수료', val:ag.tFee, color:'#fbbf24', warn:ag.tFee/ag.tR > 0.15, tip:'권장 15% 이하'},
    {name:'배달비', val:ag.tDel, color:'#fb923c', warn:ag.tDel/ag.tR > 0.10, tip:'권장 10% 이하'},
    {name:'쿠폰부담', val:ag.tCpn, color:'#f472b6', warn:false, tip:''},
    {name:'고정비', val:ag.fixed, color:'var(--blue)', warn:ag.fixed/ag.tR > 0.50, tip:'권장 매출의 50% 이하'},
    {name:'순수익', val:ag.net, color:'var(--grn)', warn:ag.net < 0, tip:''},
  ];
  const costItems = items.filter(i => i.name !== '순수익').sort((a,b) => b.val - a.val);
  let html = '<div class="card-title">🔍 돈 새는 곳 찾기</div>';
  html += '<div style="margin-bottom:16px">';
  items.forEach(item => {
    const pct = (item.val / ag.tR * 100);
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12px"><div style="width:80px;color:var(--muted)">' + item.name + '</div><div style="flex:1;height:18px;background:var(--bg3);border-radius:4px;overflow:hidden"><div style="height:100%;width:' + Math.min(pct,100) + '%;background:' + item.color + ';border-radius:4px;transition:width .5s"></div></div><div style="width:100px;text-align:right;font-family:var(--mono)">' + W(item.val) + ' <span style="color:var(--muted)">' + pct.toFixed(1) + '%</span></div><div style="width:20px">' + (item.warn ? '⚠️' : '') + '</div></div>';
  });
  html += '</div>';
  const urgent = costItems.find(i => i.warn);
  if (urgent) html += '<div style="padding:10px 14px;background:rgba(229,48,42,0.06);border:1px solid rgba(229,48,42,0.15);border-radius:8px;font-size:12px;color:var(--danger)">🚨 가장 시급: <strong>' + urgent.name + '</strong> 절감 (월 ' + W(urgent.val) + ' 지출, 매출의 ' + (urgent.val/ag.tR*100).toFixed(1) + '%)</div>';
  document.getElementById('leaks-result').innerHTML = html;
}

function calcPricing() {
  const material = parseFloat(document.getElementById('dp-material')?.value) || 0;
  const labor = parseFloat(document.getElementById('dp-labor')?.value) || 0;
  const packing = parseFloat(document.getElementById('dp-packing')?.value) || 0;
  const targetMargin = parseFloat(document.getElementById('dp-margin')?.value) || 0;
  const competitor = parseFloat(document.getElementById('dp-competitor')?.value) || 0;
  const totalCost = material + labor + packing;
  const ag = aggregate();
  const avgOrders = ag.tOrd || 104;
  const platforms = [
    {name:'배민', fee:(S.bmComm+S.bmPg+S.bmVat+S.bmExtra)/100, del:S.bmDel, color:'var(--grn)'},
    {name:'쿠팡', fee:(S.cpComm+S.cpPg+S.cpVat+S.cpExtra)/100, del:S.cpDel, color:'var(--danger)'},
    {name:'땡겨요', fee:(S.tgComm+S.tgPg+S.tgVat+S.tgExtra)/100, del:S.tgDel, color:'#2D9E6B'},
    {name:'요기요', fee:(S.ygComm+S.ygPg+S.ygVat+S.ygExtra)/100, del:S.ygDel, color:'#E5302A'},
  ];
  let html = '<div class="card-title">💰 플랫폼별 적정 가격</div>';
  html += '<div style="font-size:12px;color:var(--muted);margin-bottom:10px">원가 합계: ' + W(totalCost) + ' (재료 ' + W(material) + ' + 인건비 ' + W(labor) + ' + 포장 ' + W(packing) + ')</div>';
  platforms.forEach(p => {
    if (!p.fee && !p.del) return;
    const minPrice = (totalCost + p.del) / (1 - p.fee);
    const recPrice = (totalCost + p.del) / (1 - p.fee - targetMargin/100);
    const maxDiscount = recPrice - minPrice;
    html += '<div style="display:flex;gap:12px;margin-bottom:8px;padding:8px 12px;background:var(--bg);border-radius:8px;border-left:3px solid ' + p.color + ';font-size:12px"><div style="width:50px;font-weight:700;color:' + p.color + '">' + p.name + '</div><div style="flex:1">최소 <strong>' + W(Math.ceil(minPrice/100)*100) + '</strong> · 권장 <strong style="color:var(--or)">' + W(Math.ceil(recPrice/100)*100) + '</strong> · 최대 할인 ' + W(Math.floor(maxDiscount/100)*100) + '</div></div>';
  });
  if (competitor > 0) {
    const monthlyLoss = competitor * avgOrders;
    html += '<div style="margin-top:12px;padding:10px 14px;background:rgba(229,48,42,0.06);border:1px solid rgba(229,48,42,0.15);border-radius:8px;font-size:12px;color:var(--danger)">⚠️ 경쟁사 따라 ' + W(competitor) + ' 할인 시 → 월 ' + avgOrders + '건 기준 <strong>월 ' + W(monthlyLoss) + ' 추가 손실</strong></div>';
  }
  document.getElementById('dp-result').innerHTML = html;
}

function calcAd() {
  const budget = parseFloat(document.getElementById('da-budget')?.value) || 0;
  const orders = parseFloat(document.getElementById('da-orders')?.value) || 0;
  const pf = document.getElementById('da-platform')?.value || 'bm';
  const feeRate = pf === 'bm' ? (S.bmComm+S.bmPg+S.bmVat+S.bmExtra)/100 : (S.cpComm+S.cpPg+S.cpVat+S.cpExtra)/100;
  const delivery = pf === 'bm' ? S.bmDel : S.cpDel;
  const ag = aggregate();
  const pfData = pf === 'bm' ? ag.bm : ag.cp;
  const avgOrder = pfData.ord > 0 ? pfData.r / pfData.ord : 18000;
  const addRev = avgOrder * orders;
  const addFee = addRev * feeRate;
  const addDel = delivery * orders;
  const addCost = addRev * S.cogs / 100;
  const addProfit = addRev - addFee - addDel - addCost - budget;
  const monthProfit = addProfit * 26;
  const bepOrders = budget > 0 ? Math.ceil(budget / (avgOrder * (1 - feeRate - S.cogs/100) - delivery)) : 0;
  const isWorth = addProfit > 0;
  const el = document.getElementById('da-result');
  if (el) el.innerHTML = '<div style="text-align:center;margin-bottom:12px"><div style="font-size:28px;font-weight:900;color:' + (isWorth?'var(--grn)':'var(--red)') + '">' + (isWorth?'🟢 광고 이득':'🔴 광고 손해') + '</div></div><div style="font-family:var(--mono);font-size:13px;line-height:2.2"><div style="display:flex;justify-content:space-between"><span>하루 광고비</span><span>-' + W(budget) + '</span></div><div style="display:flex;justify-content:space-between"><span>추가 매출 (' + orders + '건 × ' + W(avgOrder) + ')</span><span>+' + W(addRev) + '</span></div><div style="display:flex;justify-content:space-between;color:var(--danger)"><span>추가 수수료+배달비+원가</span><span>-' + W(addFee+addDel+addCost) + '</span></div><hr style="border:none;border-top:1px solid var(--bd);margin:4px 0"><div style="display:flex;justify-content:space-between;font-weight:700;color:' + (isWorth?'var(--grn)':'var(--red)') + '"><span>하루 순이익</span><span>' + W(addProfit) + '</span></div><div style="display:flex;justify-content:space-between"><span>월 환산 (26일)</span><span style="font-weight:700">' + W(monthProfit) + '</span></div></div><div style="margin-top:10px;padding:8px 12px;background:var(--bg);border-radius:8px;font-size:12px;color:var(--muted)">💡 손익분기: 하루 <strong style="color:var(--tx)">' + bepOrders + '건</strong> 이상 추가되면 광고가 이득</div>';
}
