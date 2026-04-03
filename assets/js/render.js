// [L] 업로드 UI 업데이트
// ==============================================
function updateUploadUI(pf) {
  const tagsEl = document.getElementById('tags-' + pf);
  if (tagsEl) tagsEl.innerHTML = FILES[pf].map(f => `<span class="utag ${pf}">${f.period}</span>`).join('');
  const boxEl = document.getElementById('box-' + pf);
  if (boxEl && FILES[pf].length > 0) boxEl.classList.add('loaded');
}
function updateFileList() {
  const pfLabel = {bm:'배민', cp:'쿠팡', tg:'땡겨요', yg:'요기요'};
  const pfColor = {bm:'var(--grn)', cp:'var(--red)', tg:'#06D6A0', yg:'#FF4500'};
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
let SEL = 'all';

function aggregate(sel) {
  const months   = allMonths();
  const filtered = sel === 'all' ? months : [sel];
  let tR=0,tFee=0,tDel=0,tCpn=0,tOrd=0;
  let bmR=0,bmFee=0,bmDel=0,bmCpn=0,bmOrd=0;
  let cpR=0,cpFee=0,cpDel=0,cpCpn=0,cpOrd=0;
  let tgR=0,tgFee=0,tgDel=0,tgOrd=0;
  let ygR=0,ygFee=0,ygDel=0,ygOrd=0;
  const dailyBM={}, dailyCP={}, dailyTG={}, dailyYG={};

  filtered.forEach(mo => {
    const bm=DB.bm[mo], cp=DB.cp[mo], tg=DB.tg[mo], yg=DB.yg[mo];
    if (bm) {
      tR+=bm.totalRev; tFee+=bm.fee; tDel+=bm.delivery; tCpn+=bm.coupon; tOrd+=bm.orders;
      bmR+=bm.totalRev; bmFee+=bm.fee; bmDel+=bm.delivery; bmCpn+=bm.coupon; bmOrd+=bm.orders;
      Object.entries(bm.daily).forEach(([d,v])=>{ if(!dailyBM[d])dailyBM[d]={rev:0,orders:0}; dailyBM[d].rev+=v.rev; dailyBM[d].orders+=v.orders; });
    }
    if (cp) {
      tR+=cp.totalRev; tFee+=cp.fee; tDel+=cp.delivery; tCpn+=cp.coupon; tOrd+=cp.orders;
      cpR+=cp.totalRev; cpFee+=cp.fee; cpDel+=cp.delivery; cpCpn+=cp.coupon; cpOrd+=cp.orders;
      Object.entries(cp.daily).forEach(([d,v])=>{ if(!dailyCP[d])dailyCP[d]={rev:0,orders:0}; dailyCP[d].rev+=v.rev; dailyCP[d].orders+=v.orders; });
    }
    if (tg) {
      tR+=tg.totalRev; tFee+=tg.fee; tDel+=tg.delivery; tOrd+=tg.orders;
      tgR+=tg.totalRev; tgFee+=tg.fee; tgDel+=tg.delivery; tgOrd+=tg.orders;
      Object.entries(tg.daily).forEach(([d,v])=>{ if(!dailyTG[d])dailyTG[d]={rev:0,orders:0}; dailyTG[d].rev+=v.rev; dailyTG[d].orders+=v.orders; });
    }
    if (yg) {
      tR+=yg.totalRev; tFee+=yg.fee; tDel+=(yg.delivery||0); tOrd+=yg.orders;
      ygR+=yg.totalRev; ygFee+=yg.fee; ygDel+=(yg.delivery||0); ygOrd+=yg.orders;
      Object.entries(yg.daily).forEach(([d,v])=>{ if(!dailyYG[d])dailyYG[d]={rev:0,orders:0}; dailyYG[d].rev+=v.rev; dailyYG[d].orders+=v.orders; });
    }
  });

  const tDeduct = tFee + tDel + tCpn;
  const deposit = tR - tDeduct;
  const fixed   = fixedCost() * filtered.length;
  const prf     = deposit - fixed;
  const net     = prf - tR * S.cogs / 100;
  const afr     = tR ? tDeduct/tR : 0.28;
  const bepMo   = fixedCost() / (1 - S.cogs/100 - afr);
  const bep     = bepMo * filtered.length;

  return {
    tR, tFee, tDel, tCpn, tDeduct, deposit, fixed, prf, net, tOrd,
    days: new Set([...Object.keys(dailyBM),...Object.keys(dailyCP),...Object.keys(dailyTG),...Object.keys(dailyYG)]).size,
    months, filtered, dailyBM, dailyCP, dailyTG, dailyYG, bep, bepMo,
    bm:{r:bmR, fee:bmFee, del:bmDel, cpn:bmCpn, ord:bmOrd},
    cp:{r:cpR, fee:cpFee, del:cpDel, cpn:cpCpn, ord:cpOrd},
    tg:{r:tgR, fee:tgFee, del:tgDel, cpn:0,     ord:tgOrd},
    yg:{r:ygR, fee:ygFee, del:ygDel, cpn:0,     ord:ygOrd},
  };
}

// ==============================================
// [N] 월 선택 버튼
// ==============================================
function selectMonth(mo) {
  SEL = mo;
  // 달력도 선택된 월로 동기화
  if (mo !== 'all') {
    const [y, m] = mo.split('-').map(Number);
    calY = y; calM = m - 1;
  }
  // 모든 탭 렌더
  renderOverview(); renderCompare(); renderCalendar(); renderDiagnosis();
}
function renderMonthBtns(containerId) {
  const el = document.getElementById(containerId); if(!el) return;
  el.innerHTML = '';
  const allBtn = document.createElement('button');
  allBtn.className = 'mbtn' + (SEL==='all'?' active':''); allBtn.textContent = '전체';
  allBtn.onclick = () => selectMonth('all'); el.appendChild(allBtn);
  allMonths().forEach(mo => {
    const btn = document.createElement('button');
    btn.className = 'mbtn' + (SEL===mo?' active':'');
    btn.textContent = mo.replace('-','년 ')+'월';
    btn.onclick = () => selectMonth(mo); el.appendChild(btn);
  });
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
function renderOverview() {
  renderMonthBtns('ov-months');
  const ag = aggregate(SEL);

  // KPI 1행 - 핵심
  set('k-rev', W(ag.tR)); set('k-orders', `주문 ${ag.tOrd}건`);
  setKpi('k-net', W(ag.net), ag.net >= 0);
  set('k-net-sub', `원가율 ${S.cogs}% | 고정비 -${W(ag.fixed)}`);
  const hourly = ag.tOrd > 0 ? Math.round(ag.net / (26 * 10)) : 0;
  set('k-hourly', W(hourly));

  // 경고 배너
  const warnings = [];
  if (ag.tR > 0) {
    const feeRate = ag.tFee / ag.tR * 100;
    const delRate = ag.tDel / ag.tR * 100;
    const fixedRate = ag.fixed / ag.tR * 100;
    if (feeRate > 15) warnings.push('⚠️ 플랫폼 수수료 비중 ' + feeRate.toFixed(1) + '% (권장 15% 이하)');
    if (delRate > 10) warnings.push('⚠️ 배달비 비중 ' + delRate.toFixed(1) + '% (권장 10% 이하)');
    if (fixedRate > 50) warnings.push('⚠️ 고정비가 매출의 ' + fixedRate.toFixed(1) + '%를 차지합니다');
  }
  const banner = document.getElementById('warning-banner');
  const bannerText = document.getElementById('warning-text');
  if (warnings.length) { bannerText.innerHTML = warnings.join('<br>'); banner.style.display = 'block'; }
  else { banner.style.display = 'none'; }

  // KPI 2행 - 상세
  setKpi('k-deposit', W(ag.deposit), ag.deposit >= 0);
  set('k-deposit-sub', `정산율 ${Pct(ag.deposit,ag.tR)} | 차감 -${W(ag.tDeduct)}`);
  set('k-deduct', W(ag.tDeduct));
  set('k-deduct-sub', `수수료 ${W(ag.tFee)} | 배달 ${W(ag.tDel)} | 쿠폰 ${W(ag.tCpn)}`);
  set('k-avg', W(ag.days ? ag.tR/ag.days : 0)); set('k-days', `${ag.days}일 영업`);
  set('k-per-order', W(ag.tOrd ? ag.tR/ag.tOrd : 0));

  // 일별 막대 차트
  const allDays = [...new Set([...Object.keys(ag.dailyBM), ...Object.keys(ag.dailyCP), ...Object.keys(ag.dailyTG), ...Object.keys(ag.dailyYG)])].sort();
  const chart   = document.getElementById('bar-chart'); chart.innerHTML = '';
  const maxRev  = Math.max(...allDays.map(d => (ag.dailyBM[d]?.rev||0)+(ag.dailyCP[d]?.rev||0)+(ag.dailyTG[d]?.rev||0)+(ag.dailyYG[d]?.rev||0)), 1);
  allDays.forEach(day => {
    const bR=ag.dailyBM[day]?.rev||0, cR=ag.dailyCP[day]?.rev||0, gR=ag.dailyTG[day]?.rev||0, yR=ag.dailyYG[day]?.rev||0;
    const tot = bR+cR+gR+yR, H = Math.max(tot/maxRev*82, 2);
    const bH=tot?bR/tot*H:0, cH=tot?cR/tot*H:0, gH=tot?gR/tot*H:0, yH=H-bH-cH-gH;
    const col = document.createElement('div'); col.className = 'bar-col';
    col.innerHTML = `<div class="bar-bm" style="height:${bH}px"></div><div class="bar-cp" style="height:${cH}px"></div><div style="width:100%;background:#06D6A0;min-height:${gR?2:0}px;height:${gH}px"></div><div style="width:100%;background:#FF4500;min-height:${yR?2:0}px;height:${yH}px"></div><div class="bar-label">${parseInt(day.split('-')[2])}</div>`;
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
    if (SEL===mo) tr.style.background='rgba(232,33,10,0.06)';
    tr.innerHTML = `
      <td style="font-weight:${SEL===mo?700:400}">${mo.replace('-','년 ')}월</td>
      <td style="color:#4ade80">${W(bmR)}</td>
      <td style="color:#f87171">${W(cpR)}</td>
      <td style="color:#06D6A0">${W(tgR)}</td>
      <td style="color:#FF4500">${W(ygR)}</td>
      <td style="font-weight:700">${W(tot)}</td>
      <td>${totO}건</td>
      <td class="neg">-${W(deduct)}</td>
      <td style="color:#4ade80;font-weight:700">${W(dep)}</td>
      <td class="${prf>=0?'pos':'neg'}">${W(prf)}</td>`;
    tbody.appendChild(tr);
  });
  // 합계 행
  if (ag.months.length > 1) {
    const totDep=ag.tR-ag.tDeduct, totPrf=totDep-fixed1*ag.months.length;
    const tr = document.createElement('tr'); tr.className='tfoot';
    tr.innerHTML=`<td>합계</td><td style="color:#4ade80">${W(ag.bm.r)}</td><td style="color:#f87171">${W(ag.cp.r)}</td><td style="color:#06D6A0">${W(ag.tg.r)}</td><td style="color:#FF4500">${W(ag.yg.r)}</td><td>${W(ag.tR)}</td><td>${ag.tOrd}건</td><td class="neg">-${W(ag.tDeduct)}</td><td style="color:#4ade80;font-weight:700">${W(totDep)}</td><td class="${totPrf>=0?'pos':'neg'}">${W(totPrf)}</td>`;
    tbody.appendChild(tr);
  }
}

// ==============================================
// [Q] 플랫폼 비교 렌더
// ==============================================
function renderCompare() {
  renderMonthBtns('cmp-months');
  const ag = aggregate(SEL);
  const container = document.getElementById('pcard-container'); container.innerHTML = '';

  [{pf:'bm', name:'배달의민족', color:'#4ade80', dot:'var(--grn)', ...ag.bm},
   {pf:'cp', name:'쿠팡이츠',   color:'#f87171', dot:'var(--red)', ...ag.cp},
   {pf:'tg', name:'땡겨요',     color:'#06D6A0', dot:'#06D6A0',   ...ag.tg},
   {pf:'yg', name:'요기요',     color:'#FF4500', dot:'#FF4500',   ...ag.yg},
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
      ${p.cpn ? `<div class="pcard-row"><span class="l">쿠폰(상점부담)</span><span class="v" style="color:#f87171">-${W(p.cpn)}</span></div>` : ''}
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
      `<span style="color:#4ade80;font-weight:700">${W(bmDep)}</span>`,
      `<span style="color:#f87171;font-weight:700">${W(cpDep)}</span>`,
      `<span style="color:#06D6A0;font-weight:700">${W(tgDep)}</span>`,
      `<span style="color:#FF4500;font-weight:700">${W(ygDep)}</span>`,
      `<span style="color:#4ade80;font-weight:700">${W(ag.deposit)}</span>`],
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
    if (tot > 0 && tot >= dailyTarget) cell.style.background = 'rgba(26,158,107,0.12)';
    else if (tot > 0) cell.style.background = 'rgba(232,33,10,0.08)';
    if (tot > 0) {
      const bw=bR/tot*100, cw=cR/tot*100, gw=gR/tot*100, yw=100-bw-cw-gw;
      cell.innerHTML = `<div class="cal-day">${d}</div><div class="cal-rev">${W(tot).replace('₩','')}</div><div class="cal-orders">${totO}건</div><div class="cal-bar"><div class="cal-bar-bm" style="width:${bw}%"></div><div class="cal-bar-cp" style="width:${cw}%"></div><div style="background:#06D6A0;width:${gw}%"></div><div style="background:#FF4500;width:${yw}%"></div></div>`;
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
  SEL = calY + '-' + String(calM+1).padStart(2,'0');
  renderOverview(); renderCompare(); renderCalendar();
}
function showTooltip(cell, ds, bR, cR, bO, cO, bmMo, cpMo, gR, gO, yR, yO) {
  gR=gR||0; gO=gO||0; yR=yR||0; yO=yO||0;
  const tt   = document.getElementById('cal-tooltip');
  const bFee = bR * bmFeeRate(), cFee = cpMo ? (cpMo.feeRate||0)*cR : 0;
  const bDl  = bO * S.bmDel, cDl = cO * S.cpDel;
  const totalR = bR+cR+gR+yR, totalO = bO+cO+gO+yO;
  let html   = `<div style="font-size:10px;color:var(--muted);margin-bottom:6px;font-weight:600">${ds}</div>`;
  if (bR) html += `<div class="tt-row"><span class="tt-label"><span class="tt-dot" style="background:var(--grn)"></span>배민</span><span class="tt-val" style="color:#4ade80">${W(bR)}</span></div><div class="tt-row"><span class="tt-label" style="padding-left:11px">수수료</span><span class="tt-val neg">-${W(bFee)}</span></div><div class="tt-row"><span class="tt-label" style="padding-left:11px">배달비(${bO}건)</span><span class="tt-val" style="color:var(--or)">-${W(bDl)}</span></div>`;
  if (cR) html += `<div class="tt-row" style="margin-top:3px"><span class="tt-label"><span class="tt-dot" style="background:var(--red)"></span>쿠팡</span><span class="tt-val" style="color:#f87171">${W(cR)}</span></div><div class="tt-row"><span class="tt-label" style="padding-left:11px">수수료</span><span class="tt-val neg">-${W(cFee)}</span></div><div class="tt-row"><span class="tt-label" style="padding-left:11px">배달비(${cO}건)</span><span class="tt-val" style="color:var(--or)">-${W(cDl)}</span></div>`;
  if (gR) html += `<div class="tt-row" style="margin-top:3px"><span class="tt-label"><span class="tt-dot" style="background:#06D6A0"></span>땡겨요</span><span class="tt-val" style="color:#06D6A0">${W(gR)}</span></div>`;
  if (yR) html += `<div class="tt-row" style="margin-top:3px"><span class="tt-label"><span class="tt-dot" style="background:#FF4500"></span>요기요</span><span class="tt-val" style="color:#FF4500">${W(yR)}</span></div>`;
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
    <tr><td><span style="color:#4ade80;font-weight:700">배달의민족</span></td><td>${bO}건</td><td>${W(bR)}</td><td class="neg">-${W(bFee)}</td><td style="color:var(--or)">-${W(bDl)}</td><td style="color:#f87171">-${W(bCpn)}</td><td>${W(bO?bR/bO:0)}</td></tr>
    <tr><td><span style="color:#f87171;font-weight:700">쿠팡이츠</span></td>  <td>${cO}건</td><td>${W(cR)}</td><td class="neg">-${W(cFee)}</td><td style="color:var(--or)">-${W(cDl)}</td><td style="color:#f87171">-${W(cCpn)}</td><td>${W(cO?cR/cO:0)}</td></tr>
    <tr><td><span style="color:#06D6A0;font-weight:700">땡겨요</span></td>    <td>${gO}건</td><td>${W(gR)}</td><td class="neg">-${W(gFee)}</td><td style="color:var(--or)">-${W(gDl)}</td><td style="color:#f87171">-</td><td>${W(gO?gR/gO:0)}</td></tr>
    <tr><td><span style="color:#FF4500;font-weight:700">요기요</span></td>    <td>${yO}건</td><td>${W(yR)}</td><td class="neg">-${W(yFee)}</td><td style="color:var(--or)">-${W(yDl)}</td><td style="color:#f87171">-</td><td>${W(yO?yR/yO:0)}</td></tr>
    <tr class="tfoot"><td>합계</td><td>${bO+cO+gO+yO}건</td><td>${W(bR+cR+gR+yR)}</td><td class="neg">-${W(bFee+cFee+gFee+yFee)}</td><td style="color:var(--or)">-${W(bDl+cDl+gDl+yDl)}</td><td style="color:#f87171">-${W(bCpn+cCpn)}</td><td>${W((bO+cO+gO+yO)?(bR+cR+gR+yR)/(bO+cO+gO+yO):0)}</td></tr>`;
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
  document.querySelectorAll('[data-dtab]').forEach(b => b.classList.remove('active'));
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

function calcCoupon() {
  const cost = parseFloat(document.getElementById('dc-cost')?.value) || 0;
  const price = parseFloat(document.getElementById('dc-price')?.value) || 0;
  const targetMargin = parseFloat(document.getElementById('dc-margin')?.value) || 0;
  const discount = parseFloat(document.getElementById('dc-discount')?.value) || 0;
  const pf = document.getElementById('dc-platform')?.value || 'bm';
  let feeRate;
  if (pf === 'bm') feeRate = (S.bmComm + S.bmPg + S.bmVat + S.bmExtra) / 100;
  else if (pf === 'cp') feeRate = (S.cpComm + S.cpPg + S.cpVat + S.cpExtra) / 100;
  else if (pf === 'tg') feeRate = (S.tgComm + S.tgPg + S.tgVat + S.tgExtra) / 100;
  else feeRate = (S.ygComm + S.ygPg + S.ygVat + S.ygExtra) / 100;
  const delivery = pf === 'bm' ? S.bmDel : pf === 'cp' ? S.cpDel : pf === 'tg' ? S.tgDel : S.ygDel;
  const actualPrice = price - discount;
  const fee = price * feeRate;
  const profit = actualPrice - fee - delivery - cost;
  const profitRate = price > 0 ? (profit / price * 100) : 0;
  let statusColor, statusText;
  if (profitRate >= 20) { statusColor = 'var(--grn)'; statusText = '🟢 안전'; }
  else if (profitRate >= 10) { statusColor = 'var(--or)'; statusText = '🟡 위험'; }
  else { statusColor = 'var(--red)'; statusText = '🔴 손해'; }
  const el = document.getElementById('dc-result');
  if (el) el.innerHTML = '<div style="text-align:center;margin-bottom:12px"><div style="font-size:28px;font-weight:900;color:' + statusColor + '">' + statusText + '</div><div style="font-size:13px;color:var(--muted);margin-top:4px">순수익률 ' + profitRate.toFixed(1) + '%</div></div><div style="font-family:var(--mono);font-size:13px;line-height:2.2"><div style="display:flex;justify-content:space-between"><span>현재 판매가</span><span>' + W(price) + '</span></div><div style="display:flex;justify-content:space-between;color:#f87171"><span>쿠폰 할인</span><span>-' + W(discount) + '</span></div><div style="display:flex;justify-content:space-between"><span>실제 수령가</span><span>' + W(actualPrice) + '</span></div><div style="display:flex;justify-content:space-between;color:#f87171"><span>수수료 (' + (feeRate*100).toFixed(1) + '%)</span><span>-' + W(fee) + '</span></div><div style="display:flex;justify-content:space-between;color:#f87171"><span>배달비</span><span>-' + W(delivery) + '</span></div><div style="display:flex;justify-content:space-between;color:#f87171"><span>원가</span><span>-' + W(cost) + '</span></div><hr style="border:none;border-top:1px solid var(--bd);margin:4px 0"><div style="display:flex;justify-content:space-between;font-weight:700;font-size:15px;color:' + statusColor + '"><span>실제 순수익</span><span>' + W(profit) + ' (' + profitRate.toFixed(1) + '%)</span></div></div>';
  const minPrice = (cost + delivery) / (1 - feeRate - targetMargin/100);
  const reverseEl = document.getElementById('dc-reverse');
  if (reverseEl) reverseEl.innerHTML = '<div class="card-title">🔄 목표 마진 ' + targetMargin + '% 유지하려면?</div><div style="font-size:14px;line-height:2"><div>최소 판매가: <strong style="color:#fcd34d">' + W(Math.ceil(minPrice/100)*100) + '</strong></div><div>쿠폰 ' + W(discount) + ' 할인 시 정가: <strong style="color:#fcd34d">' + W(Math.ceil((minPrice+discount)/100)*100) + '</strong></div><div style="margin-top:6px;padding:8px 12px;border-radius:8px;background:rgba(232,33,10,0.08);border:1px solid rgba(232,33,10,0.2);font-size:12px;color:#f87171">🔴 마지노선: ' + W(Math.ceil(((cost+delivery)/(1-feeRate))/100)*100) + ' 이하로 팔면 무조건 손해</div></div>';
}

function renderDiag1() {
  const ag = aggregate(SEL);
  const netRate = ag.tR > 0 ? (ag.net / ag.tR * 100) : 0;
  let emoji, label, color, desc;
  if (netRate >= 20) { emoji='🟢'; label='정상 운영'; color='var(--grn)'; desc='순수익률 ' + netRate.toFixed(1) + '% — 건강한 수익 구조입니다'; }
  else if (netRate >= 10) { emoji='🟡'; label='위험 구간'; color='var(--or)'; desc='순수익률 ' + netRate.toFixed(1) + '% — 비용 구조 점검이 필요합니다'; }
  else { emoji='🔴'; label='헛돈 구간'; color='var(--red)'; desc='매출 ' + W(ag.tR) + ' 중 실제 손에 쥐는 돈은 ' + W(ag.net) + ' (' + netRate.toFixed(1) + '%)'; }
  const el = document.getElementById('diag1-result');
  if (el) el.innerHTML = '<div style="text-align:center;padding:20px 0"><div style="font-size:16px;color:var(--muted);margin-bottom:8px">이번 달 순수익</div><div style="font-size:36px;font-weight:900;color:' + color + ';margin-bottom:12px">' + W(ag.net) + '</div><div style="font-size:48px;margin-bottom:8px">' + emoji + '</div><div style="font-size:22px;font-weight:700;color:' + color + '">' + label + '</div><div style="font-size:13px;color:var(--muted);margin-top:8px">' + desc + '</div></div><hr style="border:none;border-top:1px solid var(--bd);margin:12px 0"><div style="font-size:12px;color:var(--muted);line-height:2"><div>원가율: ' + S.cogs.toFixed(1) + '% ' + (S.cogs > 35 ? '⚠️' : '✅') + ' (권장 35% 이하)</div><div>수수료율: ' + (ag.tR ? (ag.tFee/ag.tR*100).toFixed(1) : '0') + '% ' + (ag.tR && ag.tFee/ag.tR > 0.15 ? '⚠️' : '✅') + ' (권장 15% 이하)</div><div>고정비 비중: ' + (ag.tR ? (ag.fixed/ag.tR*100).toFixed(1) : '0') + '% ' + (ag.tR && ag.fixed/ag.tR > 0.5 ? '⚠️' : '✅') + ' (권장 50% 이하)</div></div>';
}

function renderLeaks() {
  const ag = aggregate(SEL);
  if (!ag.tR) { document.getElementById('leaks-result').innerHTML = '<div style="text-align:center;color:var(--muted);padding:20px">데이터를 먼저 업로드해주세요</div>'; return; }
  const cogsCost = ag.tR * S.cogs / 100;
  const items = [
    {name:'원가', val:cogsCost, color:'#f87171', warn:S.cogs > 35, tip:'권장 35% 이하'},
    {name:'플랫폼수수료', val:ag.tFee, color:'#fbbf24', warn:ag.tFee/ag.tR > 0.15, tip:'권장 15% 이하'},
    {name:'배달비', val:ag.tDel, color:'#fb923c', warn:ag.tDel/ag.tR > 0.10, tip:'권장 10% 이하'},
    {name:'쿠폰부담', val:ag.tCpn, color:'#f472b6', warn:false, tip:''},
    {name:'고정비', val:ag.fixed, color:'#60a5fa', warn:ag.fixed/ag.tR > 0.50, tip:'권장 매출의 50% 이하'},
    {name:'순수익', val:ag.net, color:'var(--grn)', warn:ag.net < 0, tip:''},
  ];
  const costItems = items.filter(i => i.name !== '순수익').sort((a,b) => b.val - a.val);
  let html = '<div class="card-title">🔍 돈 새는 곳 찾기</div>';
  html += '<div style="margin-bottom:16px">';
  items.forEach(item => {
    const pct = (item.val / ag.tR * 100);
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12px"><div style="width:80px;color:var(--muted)">' + item.name + '</div><div style="flex:1;height:18px;background:rgba(255,255,255,0.05);border-radius:4px;overflow:hidden"><div style="height:100%;width:' + Math.min(pct,100) + '%;background:' + item.color + ';border-radius:4px;transition:width .5s"></div></div><div style="width:100px;text-align:right;font-family:var(--mono)">' + W(item.val) + ' <span style="color:var(--muted)">' + pct.toFixed(1) + '%</span></div><div style="width:20px">' + (item.warn ? '⚠️' : '') + '</div></div>';
  });
  html += '</div>';
  const urgent = costItems.find(i => i.warn);
  if (urgent) html += '<div style="padding:10px 14px;background:rgba(232,33,10,0.08);border:1px solid rgba(232,33,10,0.2);border-radius:8px;font-size:12px;color:#f87171">🚨 가장 시급: <strong>' + urgent.name + '</strong> 절감 (월 ' + W(urgent.val) + ' 지출, 매출의 ' + (urgent.val/ag.tR*100).toFixed(1) + '%)</div>';
  document.getElementById('leaks-result').innerHTML = html;
}

function calcPricing() {
  const material = parseFloat(document.getElementById('dp-material')?.value) || 0;
  const labor = parseFloat(document.getElementById('dp-labor')?.value) || 0;
  const packing = parseFloat(document.getElementById('dp-packing')?.value) || 0;
  const targetMargin = parseFloat(document.getElementById('dp-margin')?.value) || 0;
  const competitor = parseFloat(document.getElementById('dp-competitor')?.value) || 0;
  const totalCost = material + labor + packing;
  const ag = aggregate(SEL);
  const avgOrders = ag.tOrd || 104;
  const platforms = [
    {name:'배민', fee:(S.bmComm+S.bmPg+S.bmVat+S.bmExtra)/100, del:S.bmDel, color:'#4ade80'},
    {name:'쿠팡', fee:(S.cpComm+S.cpPg+S.cpVat+S.cpExtra)/100, del:S.cpDel, color:'#f87171'},
    {name:'땡겨요', fee:(S.tgComm+S.tgPg+S.tgVat+S.tgExtra)/100, del:S.tgDel, color:'#06D6A0'},
    {name:'요기요', fee:(S.ygComm+S.ygPg+S.ygVat+S.ygExtra)/100, del:S.ygDel, color:'#FF4500'},
  ];
  let html = '<div class="card-title">💰 플랫폼별 적정 가격</div>';
  html += '<div style="font-size:12px;color:var(--muted);margin-bottom:10px">원가 합계: ' + W(totalCost) + ' (재료 ' + W(material) + ' + 인건비 ' + W(labor) + ' + 포장 ' + W(packing) + ')</div>';
  platforms.forEach(p => {
    if (!p.fee && !p.del) return;
    const minPrice = (totalCost + p.del) / (1 - p.fee);
    const recPrice = (totalCost + p.del) / (1 - p.fee - targetMargin/100);
    const maxDiscount = recPrice - minPrice;
    html += '<div style="display:flex;gap:12px;margin-bottom:8px;padding:8px 12px;background:rgba(255,255,255,0.03);border-radius:8px;border-left:3px solid ' + p.color + ';font-size:12px"><div style="width:50px;font-weight:700;color:' + p.color + '">' + p.name + '</div><div style="flex:1">최소 <strong>' + W(Math.ceil(minPrice/100)*100) + '</strong> · 권장 <strong style="color:#fcd34d">' + W(Math.ceil(recPrice/100)*100) + '</strong> · 최대 할인 ' + W(Math.floor(maxDiscount/100)*100) + '</div></div>';
  });
  if (competitor > 0) {
    const monthlyLoss = competitor * avgOrders;
    html += '<div style="margin-top:12px;padding:10px 14px;background:rgba(232,33,10,0.08);border:1px solid rgba(232,33,10,0.2);border-radius:8px;font-size:12px;color:#f87171">⚠️ 경쟁사 따라 ' + W(competitor) + ' 할인 시 → 월 ' + avgOrders + '건 기준 <strong>월 ' + W(monthlyLoss) + ' 추가 손실</strong></div>';
  }
  document.getElementById('dp-result').innerHTML = html;
}

function calcAd() {
  const budget = parseFloat(document.getElementById('da-budget')?.value) || 0;
  const orders = parseFloat(document.getElementById('da-orders')?.value) || 0;
  const pf = document.getElementById('da-platform')?.value || 'bm';
  const feeRate = pf === 'bm' ? (S.bmComm+S.bmPg+S.bmVat+S.bmExtra)/100 : (S.cpComm+S.cpPg+S.cpVat+S.cpExtra)/100;
  const delivery = pf === 'bm' ? S.bmDel : S.cpDel;
  const ag = aggregate(SEL);
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
  if (el) el.innerHTML = '<div style="text-align:center;margin-bottom:12px"><div style="font-size:28px;font-weight:900;color:' + (isWorth?'var(--grn)':'var(--red)') + '">' + (isWorth?'🟢 광고 이득':'🔴 광고 손해') + '</div></div><div style="font-family:var(--mono);font-size:13px;line-height:2.2"><div style="display:flex;justify-content:space-between"><span>하루 광고비</span><span>-' + W(budget) + '</span></div><div style="display:flex;justify-content:space-between"><span>추가 매출 (' + orders + '건 × ' + W(avgOrder) + ')</span><span>+' + W(addRev) + '</span></div><div style="display:flex;justify-content:space-between;color:#f87171"><span>추가 수수료+배달비+원가</span><span>-' + W(addFee+addDel+addCost) + '</span></div><hr style="border:none;border-top:1px solid var(--bd);margin:4px 0"><div style="display:flex;justify-content:space-between;font-weight:700;color:' + (isWorth?'var(--grn)':'var(--red)') + '"><span>하루 순이익</span><span>' + W(addProfit) + '</span></div><div style="display:flex;justify-content:space-between"><span>월 환산 (26일)</span><span style="font-weight:700">' + W(monthProfit) + '</span></div></div><div style="margin-top:10px;padding:8px 12px;background:rgba(255,255,255,0.03);border-radius:8px;font-size:12px;color:var(--muted)">💡 손익분기: 하루 <strong style="color:var(--tx)">' + bepOrders + '건</strong> 이상 추가되면 광고가 이득</div>';
}
