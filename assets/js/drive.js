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
function showUploadProgress(text, pct, current, total) {
  const el = document.getElementById('uploadProgress');
  if (!el) return;
  el.classList.add('active');
  document.getElementById('uploadProgressText').textContent = text;
  document.getElementById('uploadProgressPct').textContent = (total > 1 ? `${current}/${total}개 ` : '') + Math.round(pct) + '%';
  document.getElementById('uploadProgressFill').style.width = pct + '%';
}
function hideUploadProgress() {
  const el = document.getElementById('uploadProgress');
  if (el) setTimeout(() => el.classList.remove('active'), 1500);
}

async function loadXlsx2(files, pf) {
  let fileArr = Array.from(files);
  const label = pf==='bm'?'배민':pf==='cp'?'쿠팡이츠':pf==='yg'?'요기요':pf==='ts'?'가게(토스)':'땡겨요';

  let loaded = 0, failed = 0, skipped = 0;
  const skippedNames = [];
  const total = fileArr.length;
  showUploadProgress(`${label} ${total}개 파일 준비 중...`, 0, 0, total);

  for (let fi = 0; fi < fileArr.length; fi++) {
    const file = fileArr[fi];
    const fileNum = fi + 1;
    try {
      // 1단계: 파일 읽기
      const stepBase = (fi / total) * 100;
      const stepSize = 100 / total;
      showUploadProgress(`${label} 파일 읽는 중... (${fileNum}/${total})`, stepBase + stepSize * 0.1, fileNum, total);

      const buf = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      });

      // 2단계: 파싱
      showUploadProgress(`${label} 파싱 중... (${fileNum}/${total})`, stepBase + stepSize * 0.3, fileNum, total);

      const _ce = console.error;
      console.error = (...args) => { if (!(args[0]||'').toString().includes('uncompressed')) _ce.apply(console, args); };
      const wb = XLSX.read(buf, {type:'array', cellDates:true, WTF:false});
      console.error = _ce;

      let data;
      if      (pf === 'bm') data = /정산명세서/.test(file.name) ? parseBM_settlement(wb, file.name) : /매입상세내역/.test(file.name) ? parseBM_purchase_xlsx(wb, file.name) : parseBM_xlsx(wb, file.name);
      else if (pf === 'cp') data = parseCP_xlsx(wb, file.name);
      else if (pf === 'yg') data = parseYG_xlsx(wb, file.name);
      else if (pf === 'ts') data = parseTS_xlsx(wb, file.name);
      else                  data = parseTG_xlsx(wb, file.name);

      // 3단계: 중복 체크 — 같은 파일명이 DB에 있으면 내용 비교
      const existingFile = (FILES[pf]||[]).find(f => f.filename === file.name);
      if (existingFile) {
        const items = Array.isArray(data) ? data : [data];
        const key0 = items[0].ym[0] + '-' + String(items[0].ym[1]).padStart(2,'0');
        const existing = DB[pf][key0];
        if (existing) {
          // 핵심 필드 비교 (매출, 수수료, 배달비 등)
          const same = items.every(d => {
            const k = d.ym[0] + '-' + String(d.ym[1]).padStart(2,'0');
            const ex = DB[pf][k];
            if (!ex) return false;
            return ex.totalRev === d.totalRev && ex.finalSettle === d.finalSettle;
          });
          if (same) {
            skipped++; skippedNames.push(file.name);
            showUploadProgress(`${label} 중복 건너뜀 (${fileNum}/${total})`, stepBase + stepSize, fileNum, total);
            continue;
          }
        }
      }

      // 4단계: DB 저장
      showUploadProgress(`${label} 저장 중... (${fileNum}/${total})`, stepBase + stepSize * 0.6, fileNum, total);
      await storeData(pf, data, file.name);
      loaded++;

      // 4단계: 완료
      showUploadProgress(`${label} 처리 중... (${loaded}/${total})`, stepBase + stepSize, loaded, total);
    } catch(err) {
      failed++;
      const msg = /password.protected/i.test(err.message)
        ? '암호가 걸린 파일입니다. 암호를 푸시고 다시 다운로드해주세요. (데이터 탭 가이드 참고)'
        : err.message;
      console.warn(`파일 오류(${file.name}):`, msg);
      toastCenter(`⚠️ ${file.name}: ${msg}`);
    }
  }

  showUploadProgress(`완료! ${loaded}개 성공${skipped ? `, ${skipped}개 중복` : ''}${failed ? `, ${failed}개 실패` : ''}`, 100, loaded, total);
  hideUploadProgress();
  if (skipped) toastCenter(`중복 파일 ${skipped}개 업로드 제외:\n${skippedNames.join('\n')}`);
  else toastCenter(`${label} ${loaded}개 파일 업로드 완료!${failed ? ` (${failed}개 실패)` : ''}`);
}

// ==============================================
// [K] 페이지 로드 초기화
// ==============================================
// 초기화는 index.html의 initApp()에서 처리
// drive.js는 파서/업로드 함수만 제공
