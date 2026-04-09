// ==============================================
// [L] 파일 삭제 / 전체 삭제
// ==============================================
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
  renderAll();
}
async function clearAll() {
  // 1. DB에서 먼저 삭제
  const dbOk = await clearAllSupabase().catch(() => false);
  if (dbOk === false) return;

  // 2. 로컬 메모리 삭제
  ['bm','cp','tg','yg','ts'].forEach(pf => {
    Object.keys(DB[pf]).forEach(k => delete DB[pf][k]);
    FILES[pf] = [];
  });

  // 3. UI 초기화
  toast('전체 데이터가 삭제되었습니다');
  renderAll();
}
