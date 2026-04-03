// [I] DB 저장 공통 (땡겨요 다중 월 배열 + 매입 병합 지원)
// ==============================================
function storeData(pf, data, filename) {
  // 매입 데이터는 별도 처리 (bm, tg, yg 공통)
  if (data && data.type === 'purchase' && ['bm','tg','yg'].includes(pf)) {
    mergePurchase(pf, data);
    const key = data.ym[0] + '-' + String(data.ym[1]).padStart(2,'0');
    const fnKey = key + '_purchase';
    FILES[pf] = FILES[pf].filter(f => f.key !== fnKey);
    FILES[pf].push({key:fnKey, period:data.period+' 매입', filename});
    FILES[pf].sort((a,b) => a.key.localeCompare(b.key));
    // 매입 파일 정보를 DB 데이터에 저장 (Supabase 복원용)
    if (DB[pf][key]) {
      DB[pf][key]._purchaseFilename = filename;
      DB[pf][key]._purchasePeriod = data.period + ' 매입';
      saveToSupabase(pf, key, DB[pf][key], filename).catch(e => console.warn(e));
    }
    updateUploadUI(pf);
    updateFileList();
    renderAll();
    return;
  }

  const items = Array.isArray(data) ? data : [data];
  items.forEach(d => {
    const key = d.ym[0] + '-' + String(d.ym[1]).padStart(2,'0');
    // 배민: 매입 데이터가 먼저 로드된 경우 병합
    if (pf === 'bm' && DB.bm[key] && DB.bm[key]._hasPurchaseData) {
      const prev = DB.bm[key];
      d.fee = prev.fee;
      d.delivery = prev.delivery;
      d.feeRate = d.totalRev ? prev.fee / d.totalRev : 0;
      d._hasPurchaseData = true;
    }
    // 요기요: 매입 데이터가 먼저 로드된 경우 병합
    if (pf === 'yg' && DB.yg[key] && DB.yg[key]._hasPurchaseData) {
      const prev = DB.yg[key];
      d.fee = prev.fee;
      d.delivery = prev.delivery;
      d.feeRate = d.totalRev ? prev.fee / d.totalRev : 0;
      d._hasPurchaseData = true;
    }
    // 땡겨요: 매입 데이터가 먼저 로드된 경우 병합
    if (pf === 'tg' && DB.tg[key] && DB.tg[key]._hasPurchaseData) {
      const prev = DB.tg[key];
      d.fee = prev.fee;
      d.delivery = prev.delivery;
      d.feeRate = d.totalRev ? prev.fee / d.totalRev : 0;
      d._hasPurchaseData = true;
    }
    DB[pf][key] = d;
    FILES[pf] = FILES[pf].filter(f => f.key !== key);
    FILES[pf].push({key, period:d.period, filename});
    FILES[pf].sort((a,b) => a.key.localeCompare(b.key));
    // Supabase에 비동기 저장
    saveToSupabase(pf, key, d, filename).catch(e => console.warn(e));
  });
  updateUploadUI(pf);
  updateFileList();
  renderAll();
}

// ==============================================
// [J] 로컬 엑셀 업로드
// ==============================================
function onDrag(e, id)  { e.preventDefault(); document.getElementById(id).classList.add('drag'); }
function offDrag(id)    { document.getElementById(id).classList.remove('drag'); }
function onDrop(e, pf)  { e.preventDefault(); offDrag('box-'+pf); loadXlsx2(e.dataTransfer.files, pf); }
function loadXlsx(inp, pf) { loadXlsx2(inp.files, pf); }
function loadXlsx2(files, pf) {
  Array.from(files).forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, {type:'array', cellDates:true, WTF:false});
        let data;
        if      (pf === 'bm') data = /매입상세내역/.test(file.name) ? parseBM_purchase_xlsx(wb, file.name) : parseBM_xlsx(wb, file.name);
        else if (pf === 'cp') data = parseCP_xlsx(wb, file.name);
        else if (pf === 'yg') data = parseYG_xlsx(wb, file.name);
        else                  data = parseTG_xlsx(wb, file.name);
        storeData(pf, data, file.name);
        const label = pf==='bm'?'배민':pf==='cp'?'쿠팡이츠':pf==='yg'?'요기요':'땡겨요';
        const first = Array.isArray(data) ? data[0] : data;
        toast(`${label} ${first.period} 로드 완료!`);
      } catch(err) { alert(`파일 오류(${file.name}): ${err.message}`); }
    };
    reader.readAsArrayBuffer(file);
  });
}

// ==============================================
// [K] 페이지 로드 초기화
// ==============================================
window.addEventListener('load', () => {
  loadSettings(); applySettingsToUI();
  document.getElementById('hd-bm-del').textContent = S.bmDel.toLocaleString() + '원';
  document.getElementById('hd-cp-del').textContent = S.cpDel.toLocaleString() + '원';
  calcBEPSummary();
  // Supabase에서 저장된 데이터 복원
  loadFromSupabase();
});
