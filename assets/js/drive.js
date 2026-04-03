// [I] DB 저장 공통 (땡겨요 다중 월 배열 + 매입 병합 지원)
// ==============================================
function storeData(pf, data, filename) {
  // 요기요 매입 데이터는 별도 처리
  if (pf === 'yg' && data && data.type === 'purchase') {
    mergeYG_purchase(data);
    const key = data.ym[0] + '-' + String(data.ym[1]).padStart(2,'0');
    const fnKey = key + '_purchase';
    FILES[pf] = FILES[pf].filter(f => f.key !== fnKey);
    FILES[pf].push({key:fnKey, period:data.period+' 매입', filename});
    FILES[pf].sort((a,b) => a.key.localeCompare(b.key));
    if (DB.yg[key]) saveToSupabase('yg', key, DB.yg[key], filename).catch(e => console.warn(e));
    updateUploadUI(pf);
    updateFileList();
    renderAll();
    return;
  }

  // 배민 매입 데이터는 별도 처리
  if (pf === 'bm' && data && data.type === 'purchase') {
    mergeBM_purchase(data);
    const key = data.ym[0] + '-' + String(data.ym[1]).padStart(2,'0');
    const fnKey = key + '_purchase';
    FILES[pf] = FILES[pf].filter(f => f.key !== fnKey);
    FILES[pf].push({key:fnKey, period:data.period+' 매입', filename});
    FILES[pf].sort((a,b) => a.key.localeCompare(b.key));
    if (DB.bm[key]) saveToSupabase('bm', key, DB.bm[key], filename).catch(e => console.warn(e));
    updateUploadUI(pf);
    updateFileList();
    renderAll();
    return;
  }

  // 땡겨요 매입 데이터는 별도 처리
  if (pf === 'tg' && data && data.type === 'purchase') {
    mergeTG_purchase(data);
    const key = data.ym[0] + '-' + String(data.ym[1]).padStart(2,'0');
    // 파일 목록에 매입 파일 추가
    const fnKey = key + '_purchase';
    FILES[pf] = FILES[pf].filter(f => f.key !== fnKey);
    FILES[pf].push({key:fnKey, period:data.period+' 매입', filename});
    FILES[pf].sort((a,b) => a.key.localeCompare(b.key));
    // Supabase에 병합된 데이터 저장
    if (DB.tg[key]) saveToSupabase('tg', key, DB.tg[key], filename).catch(e => console.warn(e));
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
        const wb = XLSX.read(e.target.result, {type:'array', cellDates:true});
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
// [K] 구글 드라이브 연동
// ==============================================
function drFolderChange() {
  const m  = document.getElementById('dr-folder').value.match(/folders\/([a-zA-Z0-9_-]+)/);
  const ok = document.getElementById('dr-folder-ok');
  if (m) { ok.textContent = '✓ 폴더 ID: ' + m[1]; ok.style.display = 'block'; }
  else     ok.style.display = 'none';
  drCheckReady();
}
function drCheckReady() {
  const s = document.getElementById('dr-script').value.trim();
  const f = document.getElementById('dr-folder').value.match(/folders\/([a-zA-Z0-9_-]+)/);
  document.getElementById('dr-btn').disabled = !(s && f);
}
function drSetStatus(msg, cls = '') {
  const el = document.getElementById('dr-status');
  el.textContent = msg; el.className = 'drive-status' + (msg ? ' '+cls : ''); el.style.display = msg ? 'block' : 'none';
}
function drSetProgress(v) { document.getElementById('dr-prog').style.display = v ? 'block' : 'none'; }

// 플랫폼 감지 (파일명 기준)
function detectPlatform(name) {
  if (/coupang[_\-]eats/i.test(name))                        return 'cp';
  if (/매출상세내역|매입상세내역/.test(name))                  return 'bm';
  if (/땡겨요/.test(name))                                    return 'tg';
  if (/매출내역/.test(name) && /^\d{6}_\d{6}/.test(name))   return 'tg';
  if (/_매출내역_|_매입내역_/.test(name))                     return 'yg';
  return null;
}

async function loadFromDrive() {
  const scriptUrl = document.getElementById('dr-script').value.trim();
  const folderUrl = document.getElementById('dr-folder').value;
  const mf        = folderUrl.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (!scriptUrl || !mf) return;
  const folderId  = mf[1];

  document.getElementById('dr-btn').disabled = true;
  drSetStatus('📡 구글 드라이브에서 파일 가져오는 중...', 'ld');
  drSetProgress(true);

  try {
    const resp = await fetch(`${scriptUrl}?folderId=${folderId}`);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    if (!data.success) throw new Error(data.error || '드라이브 오류');

    // 중복 제거 (파일명 + 내용 길이가 같으면 하나만 유지)
    const seen  = new Set();
    const files = (data.files || []).filter(f => {
      if (!f.content || f.content.trim().length < 50 || f.type === 'error') return false;
      if (f.name.includes('제목 없는')) return false;
      const key = f.name.trim() + '|' + f.content.trim().length;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });

    if (!files.length) throw new Error('읽을 수 있는 파일이 없습니다.');

    let loaded = 0, failed = 0;
    for (const f of files) {
      const pf = detectPlatform(f.name);
      if (!pf) { console.warn('플랫폼 미인식:', f.name); continue; }
      try {
        // Apps Script 시트 헤더 제거
        const content = f.content.replace(/^=== .+ ===\n/m, '').split(/\n=== /)[0];
        let parsed;
        if      (pf === 'bm') parsed = parseBM_csv(content, f.name);
        else if (pf === 'cp') parsed = parseCP_csv(content, f.name);
        else                  parsed = parseTG(content, f.name);
        storeData(pf, parsed, f.name);
        const first = Array.isArray(parsed) ? parsed[0] : parsed;
        const label = pf==='bm'?'배민':pf==='cp'?'쿠팡이츠':pf==='yg'?'요기요':'땡겨요';
        loaded++;
        toast(`${label} ${first.period} 로드!`);
      } catch(e) { console.warn('파싱 실패:', f.name, e.message); failed++; }
    }

    drSetStatus(`✅ ${loaded}개 로드 완료${failed ? ` (${failed}개 실패)` : ''}`, 'ok');
  } catch(e) {
    drSetStatus('⚠️ ' + e.message, 'er');
  }

  drSetProgress(false);
  document.getElementById('dr-btn').disabled = false;
}

// ==============================================
// [K-0] 아코디언 토글
// ==============================================
function toggleAccordion(id) {
  const hdr  = document.getElementById('hdr-'  + id);
  const body = document.getElementById('body-' + id);
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open',  !isOpen);
  hdr.classList.toggle('open',   !isOpen);
}

// URL 자동 저장 / 복원
window.addEventListener('load', () => {
  loadSettings(); applySettingsToUI();
  document.getElementById('hd-bm-del').textContent = S.bmDel.toLocaleString() + '원';
  document.getElementById('hd-cp-del').textContent = S.cpDel.toLocaleString() + '원';
  calcBEPSummary();
  const sc = localStorage.getItem('dr_script'), fo = localStorage.getItem('dr_folder');
  if (sc) document.getElementById('dr-script').value = sc;
  if (fo) document.getElementById('dr-folder').value = fo;
  if (sc || fo) drFolderChange();
  // Supabase에서 저장된 데이터 복원
  loadFromSupabase();
});
document.addEventListener('input', () => {
  const sc = document.getElementById('dr-script')?.value;
  const fo = document.getElementById('dr-folder')?.value;
  if (sc) localStorage.setItem('dr_script', sc);
  if (fo) localStorage.setItem('dr_folder', fo);
});
