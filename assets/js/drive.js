// [I] DB 저장 공통 (새 구조: sales/purchase 분리)
// ==============================================
async function storeData(pf, data, filename) {
  // 매입 데이터 처리
  if (data && data.type === 'purchase') {
    mergePurchase(pf, data);
    const key = data.ym[0] + '-' + String(data.ym[1]).padStart(2,'0');
    const fnKey = key + '_purchase';
    FILES[pf] = FILES[pf].filter(f => f.key !== fnKey);
    FILES[pf].push({key:fnKey, period:data.period+' 매입', filename});
    FILES[pf].sort((a,b) => a.key.localeCompare(b.key));
    if (DB[pf][key]) {
      DB[pf][key]._purchaseFilename = filename;
      DB[pf][key]._purchasePeriod = data.period + ' 매입';
      await saveToSupabase(pf, key, DB[pf][key], filename).catch(e => console.warn(e));
    }
    updateUploadUI(pf);
    updateFileList();
    renderAll();
    return;
  }

  // 매출 데이터 처리 (배열 지원 - 땡겨요 다중 월)
  const items = Array.isArray(data) ? data : [data];
  for (const d of items) {
    mergeSales(pf, d);
    const key = d.ym[0] + '-' + String(d.ym[1]).padStart(2,'0');
    FILES[pf] = FILES[pf].filter(f => f.key !== key);
    FILES[pf].push({key, period:d.period, filename});
    FILES[pf].sort((a,b) => a.key.localeCompare(b.key));
    if (DB[pf][key]) {
      DB[pf][key]._salesFilename = filename;
      await saveToSupabase(pf, key, DB[pf][key], filename).catch(e => console.warn(e));
    }
  }
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
async function loadXlsx2(files, pf) {
  const fileArr = Array.from(files);
  const label = pf==='bm'?'배민':pf==='cp'?'쿠팡이츠':pf==='yg'?'요기요':'땡겨요';
  let loaded = 0, failed = 0;

  for (const file of fileArr) {
    try {
      const buf = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      });

      // xlsx 경고 억제
      const _ce = console.error;
      console.error = (...args) => { if (!(args[0]||'').toString().includes('uncompressed')) _ce.apply(console, args); };
      const wb = XLSX.read(buf, {type:'array', cellDates:true, WTF:false});
      console.error = _ce;

      let data;
      if      (pf === 'bm') data = /매입상세내역/.test(file.name) ? parseBM_purchase_xlsx(wb, file.name) : parseBM_xlsx(wb, file.name);
      else if (pf === 'cp') data = parseCP_xlsx(wb, file.name);
      else if (pf === 'yg') data = parseYG_xlsx(wb, file.name);
      else                  data = parseTG_xlsx(wb, file.name);

      await storeData(pf, data, file.name);
      loaded++;
      const first = Array.isArray(data) ? data[0] : data;
      toast(`${label} ${first.period} 로드 완료! (${loaded}/${fileArr.length})`);
    } catch(err) {
      failed++;
      console.warn(`파일 오류(${file.name}):`, err.message);
      toast(`⚠️ ${file.name} 오류: ${err.message}`);
    }
  }

  if (fileArr.length > 1) {
    toast(`${label} ${loaded}개 로드 완료${failed ? ` (${failed}개 실패)` : ''}`);
  }
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
  loadFromSupabase().then(() => {
    if (typeof applyFeeModes === 'function') applyFeeModes();
  }).catch(() => {
    if (typeof applyFeeModes === 'function') applyFeeModes();
  });
});
