// ==============================================
// [SB] Supabase 연동
// ==============================================

// ── Supabase 설정 (프로젝트 생성 후 입력) ──
const SUPABASE_URL  = 'https://ioimvffcrsosckruuhcx.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvaW12ZmZjcnNvc2NrcnV1aGN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMDE5MjAsImV4cCI6MjA5MDc3NzkyMH0.NwPSYTeHJKvs-bG2KGH4ovPyh4RX9U2cCHsBVKO32x0';

let _sb = null;
function getSb() {
  if (!_sb && SUPABASE_URL && SUPABASE_KEY) {
    _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return _sb;
}

// ── 비밀번호 관리 ──
function getSbPassword() {
  let pw = localStorage.getItem('bbalgan_sb_pw');
  if (!pw) {
    pw = prompt('Supabase 저장 비밀번호를 입력하세요:');
    if (pw) localStorage.setItem('bbalgan_sb_pw', pw);
  }
  return pw || '';
}

// ── Supabase에 저장 (UPSERT) ──
async function saveToSupabase(pf, key, data, filename) {
  const sb = getSb();
  if (!sb) return;

  // 저장 전 내부 전용 필드 제거 (용량 절약)
  const clean = {...data};
  delete clean._pendingPurchase;

  const pw = getSbPassword();
  if (!pw) return;

  const { error } = await sb.rpc('upsert_sales', {
    p_password: pw,
    p_platform: pf,
    p_ym_key:   key,
    p_period:   data.period || key,
    p_filename: filename || '',
    p_data:     clean
  });

  if (error) {
    console.warn('[Supabase] 저장 실패:', error.message);
    if (/password|Invalid/i.test(error.message)) {
      localStorage.removeItem('bbalgan_sb_pw');
      toast('⚠️ Supabase 비밀번호 오류');
    }
  }
}

// ── Supabase에서 전체 데이터 로드 ──
async function loadFromSupabase() {
  const sb = getSb();
  if (!sb) return;

  try {
    const { data: rows, error } = await sb
      .from('sales_data')
      .select('platform, ym_key, period, filename, data')
      .order('ym_key');

    if (error) throw error;
    if (!rows || !rows.length) return;

    let count = 0;
    rows.forEach(row => {
      const pf = row.platform;
      const key = row.ym_key;
      if (!DB[pf]) return;

      DB[pf][key] = row.data;
      // FILES 복원 (매출)
      FILES[pf] = FILES[pf].filter(f => f.key !== key && f.key !== key+'_purchase');
      FILES[pf].push({ key, period: row.period, filename: row.filename || '' });
      // 매입 파일 정보도 복원
      if (row.data && row.data._purchaseFilename) {
        FILES[pf].push({
          key: key + '_purchase',
          period: row.data._purchasePeriod || row.period + ' 매입',
          filename: row.data._purchaseFilename
        });
      }
      count++;
    });

    // 정렬
    ['bm','cp','tg','yg'].forEach(pf => {
      FILES[pf].sort((a,b) => a.key.localeCompare(b.key));
      updateUploadUI(pf);
    });
    updateFileList();
    renderAll();

    if (count > 0) toast(`☁️ ${count}개 데이터 복원 완료`);
  } catch (e) {
    console.warn('[Supabase] 로드 실패:', e.message);
  }
}

// ── Supabase에서 삭제 ──
async function deleteFromSupabase(pf, key) {
  const sb = getSb();
  if (!sb) return;

  const pw = getSbPassword();
  if (!pw) return;

  const { error } = await sb.rpc('delete_sales', {
    p_password: pw,
    p_platform: pf,
    p_ym_key:   key
  });

  if (error) console.warn('[Supabase] 삭제 실패:', error.message);
}

// ── Supabase 전체 삭제 ──
async function clearAllSupabase() {
  const sb = getSb();
  if (!sb) return;

  const pw = getSbPassword();
  if (!pw) return;

  const { error } = await sb.rpc('clear_all_sales', {
    p_password: pw
  });

  if (error) console.warn('[Supabase] 전체 삭제 실패:', error.message);
}
