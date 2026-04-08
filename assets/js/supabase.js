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

// ── 접근 인증 ──
async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

let _loginAttempts = 0;
let _lockUntil = 0;

async function attemptLogin() {
  const input = document.getElementById('loginPw') || document.getElementById('login-pw');
  const errEl = document.getElementById('loginError') || document.getElementById('login-error');
  const btn   = document.getElementById('loginBtn') || document.getElementById('login-btn');
  const pw    = input.value.trim();

  // 클라이언트 잠금 확인
  if (Date.now() < _lockUntil) {
    const sec = Math.ceil((_lockUntil - Date.now()) / 1000);
    errEl.textContent = `${sec}초 후 다시 시도해주세요`;
    return;
  }

  if (!pw) { errEl.textContent = '비밀번호를 입력하세요'; return; }
  if (!/^\d+$/.test(pw)) { errEl.textContent = '숫자만 입력 가능합니다'; input.value = ''; return; }

  btn.disabled = true;
  btn.textContent = '확인 중...';
  errEl.textContent = '';

  try {
    const sb = getSb();
    if (!sb) throw new Error('DB 연결 실패');

    const hash = await sha256(pw);
    const { data, error } = await sb.rpc('verify_access', { p_hash: hash });

    if (error) {
      _loginAttempts++;
      if (/locked|Too many/i.test(error.message)) {
        _lockUntil = Date.now() + 60000;
        errEl.textContent = '시도 횟수 초과 — 60초 후 다시 시도';
      } else if (_loginAttempts >= 5) {
        _lockUntil = Date.now() + 60000;
        errEl.textContent = '5회 실패 — 60초 잠금';
      } else {
        errEl.textContent = `비밀번호가 틀렸습니다 (${_loginAttempts}/5)`;
      }
      input.value = '';
      input.focus();
    } else {
      // 성공 — 로그인 비밀번호를 DB 작업에도 자동 사용
      sessionStorage.setItem('bbalgan_auth', Date.now().toString());
      sessionStorage.setItem('bbalgan_sb_pw', pw);
      _loginAttempts = 0;
      if (typeof showApp === 'function') showApp();
      else {
        const lo = document.getElementById('loginOverlay') || document.getElementById('login-overlay');
        if (lo) lo.style.display = 'none';
        const aw = document.getElementById('app-wrap') || document.getElementById('appContainer');
        if (aw) aw.style.display = '';
      }
    }
  } catch(e) {
    errEl.textContent = '서버 연결 오류: ' + e.message;
  }

  btn.disabled = false;
  btn.textContent = '확인';
}

// 페이지 로드 시 세션 확인
function checkAuth() {
  const auth = sessionStorage.getItem('bbalgan_auth');
  if (auth) {
    if (typeof showApp === 'function') showApp();
    else {
      const lo = document.getElementById('loginOverlay') || document.getElementById('login-overlay');
      if (lo) lo.style.display = 'none';
      const aw = document.getElementById('app-wrap') || document.getElementById('appContainer');
      if (aw) aw.style.display = '';
    }
  }
}

// 숫자만 입력 + Enter 키
document.addEventListener('DOMContentLoaded', () => {
  const pwInput = document.getElementById('loginPw') || document.getElementById('login-pw');
  if (pwInput) {
    pwInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { attemptLogin(); return; }
      // 숫자, Backspace, Delete, Tab, 방향키만 허용
      if (!/^\d$/.test(e.key) && !['Backspace','Delete','Tab','ArrowLeft','ArrowRight'].includes(e.key) && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
      }
    });
    // 붙여넣기 시 숫자만 필터링
    pwInput.addEventListener('paste', e => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
      pwInput.value = text;
    });
  }
  checkAuth();
});

// ── Supabase 데이터 비밀번호 (로그인 비밀번호 자동 사용) ──
function getSbPassword() {
  let pw = sessionStorage.getItem('bbalgan_sb_pw') || localStorage.getItem('bbalgan_sb_pw') || '';
  if (!pw) {
    pw = prompt('데이터 비밀번호를 입력하세요:');
    if (pw) sessionStorage.setItem('bbalgan_sb_pw', pw);
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

      // 설정 데이터 복원
      if (pf === 'settings' && key === 'config') {
        Object.assign(S, row.data);
        localStorage.setItem('bbalgan_v2', JSON.stringify(S));
        applySettingsToUI();
        return;
      }

      if (!DB[pf]) return;

      DB[pf][key] = row.data;
      // 새 구조에서 합산 데이터가 없으면 recalcMerged 실행
      if (row.data && row.data.sales && typeof recalcMerged === 'function') {
        recalcMerged(row.data);
      }
      // FILES 복원 (매출)
      FILES[pf] = FILES[pf].filter(f => f.key !== key && f.key !== key+'_purchase');
      if (row.data && (row.data._hasSales !== false)) {
        FILES[pf].push({ key, period: row.period, filename: row.data._salesFilename || row.filename || '' });
      }
      // 매입 파일 정보도 복원
      if (row.data && (row.data._hasPurchase || row.data._purchaseFilename)) {
        FILES[pf].push({
          key: key + '_purchase',
          period: row.data._purchasePeriod || row.period + ' 매입',
          filename: row.data._purchaseFilename || ''
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
  if (!sb) { toast('⚠️ DB 연결 없음'); return false; }

  const pw = getSbPassword();
  if (!pw) { toast('⚠️ DB 비밀번호가 필요합니다'); return false; }

  const { error } = await sb.rpc('clear_all_sales', {
    p_password: pw
  });

  if (error) {
    console.warn('[Supabase] 전체 삭제 실패:', error.message);
    if (/password|Invalid/i.test(error.message)) {
      localStorage.removeItem('bbalgan_sb_pw');
      toast('⚠️ DB 비밀번호 오류 — 다시 시도해주세요');
    } else {
      toast('⚠️ DB 삭제 실패: ' + error.message);
    }
    return false;
  }
  return true;
}
