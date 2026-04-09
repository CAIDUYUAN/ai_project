-- =============================================
-- 빨마라 대시보드 Supabase 설정 SQL
-- Supabase SQL Editor에서 실행하세요
-- =============================================

-- 1. 테이블 생성
CREATE TABLE IF NOT EXISTS sales_data (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('bm', 'cp', 'tg', 'yg', 'ts', 'nv', 'di', 'settings')),
  ym_key TEXT NOT NULL,
  period TEXT NOT NULL,
  filename TEXT,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (platform, ym_key)
);

CREATE INDEX IF NOT EXISTS idx_sales_platform ON sales_data (platform);
CREATE INDEX IF NOT EXISTS idx_sales_ym ON sales_data (ym_key);

-- 2. RLS 활성화
ALTER TABLE sales_data ENABLE ROW LEVEL SECURITY;

-- 읽기: 누구나 가능
CREATE POLICY "Anyone can read" ON sales_data
  FOR SELECT USING (true);

-- 직접 쓰기 차단 (RPC만 허용)
CREATE POLICY "No direct insert" ON sales_data
  FOR INSERT WITH CHECK (false);
CREATE POLICY "No direct update" ON sales_data
  FOR UPDATE USING (false);
CREATE POLICY "No direct delete" ON sales_data
  FOR DELETE USING (false);

-- 3. 비밀번호 설정 테이블
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 비밀번호 설정 (원하는 비밀번호로 변경하세요!)
INSERT INTO app_config (key, value)
VALUES ('store_password', '여기에비밀번호입력')  -- ⚠️ 실행 전 원하는 비밀번호로 변경!
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 접근 비밀번호 (SHA-256 해시로 저장)
INSERT INTO app_config (key, value)
VALUES ('access_password_hash', '9b351ca0387a027c8a45d16d76d3b45911fdbb654a26b0873f5981d932274941')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 로그인 실패 카운터 (브루트포스 방지)
INSERT INTO app_config (key, value)
VALUES ('login_fail_count', '0'), ('login_locked_until', '0')
ON CONFLICT (key) DO NOTHING;

-- app_config RLS (읽기 차단)
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No public access" ON app_config
  FOR SELECT USING (false);

-- 4. 접근 비밀번호 검증 RPC (브루트포스 방지 포함)
CREATE OR REPLACE FUNCTION verify_access(p_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  stored_hash TEXT;
  fail_count INT;
  locked TEXT;
BEGIN
  -- 잠금 확인 (5회 실패 시 60초 잠금)
  SELECT value INTO locked FROM app_config WHERE key = 'login_locked_until';
  IF locked IS NOT NULL AND locked::BIGINT > EXTRACT(EPOCH FROM NOW())::BIGINT THEN
    RAISE EXCEPTION 'Too many attempts. Try again later.';
  END IF;

  -- 해시 비교
  SELECT value INTO stored_hash FROM app_config WHERE key = 'access_password_hash';
  IF stored_hash IS NOT NULL AND p_hash = stored_hash THEN
    -- 성공: 카운터 리셋
    UPDATE app_config SET value = '0' WHERE key = 'login_fail_count';
    RETURN true;
  END IF;

  -- 실패: 카운터 증가
  SELECT COALESCE(value, '0')::INT INTO fail_count FROM app_config WHERE key = 'login_fail_count';
  fail_count := fail_count + 1;
  UPDATE app_config SET value = fail_count::TEXT WHERE key = 'login_fail_count';

  -- 5회 실패 시 60초 잠금
  IF fail_count >= 5 THEN
    UPDATE app_config SET value = (EXTRACT(EPOCH FROM NOW())::BIGINT + 60)::TEXT WHERE key = 'login_locked_until';
    RAISE EXCEPTION 'Account locked for 60 seconds';
  END IF;

  RAISE EXCEPTION 'Invalid password';
END;
$$;

-- 5. UPSERT RPC 함수
CREATE OR REPLACE FUNCTION upsert_sales(
  p_password TEXT,
  p_platform TEXT,
  p_ym_key TEXT,
  p_period TEXT,
  p_filename TEXT,
  p_data JSONB
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  stored_pw TEXT;
BEGIN
  SELECT value INTO stored_pw FROM app_config WHERE key = 'store_password';
  IF stored_pw IS NULL OR p_password != stored_pw THEN
    RAISE EXCEPTION 'Invalid password';
  END IF;

  INSERT INTO sales_data (platform, ym_key, period, filename, data, updated_at)
  VALUES (p_platform, p_ym_key, p_period, p_filename, p_data, NOW())
  ON CONFLICT (platform, ym_key)
  DO UPDATE SET
    period = EXCLUDED.period,
    filename = EXCLUDED.filename,
    data = EXCLUDED.data,
    updated_at = NOW();

  RETURN true;
END;
$$;

-- 5. 삭제 RPC 함수
CREATE OR REPLACE FUNCTION delete_sales(
  p_password TEXT,
  p_platform TEXT,
  p_ym_key TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  stored_pw TEXT;
BEGIN
  SELECT value INTO stored_pw FROM app_config WHERE key = 'store_password';
  IF stored_pw IS NULL OR p_password != stored_pw THEN
    RAISE EXCEPTION 'Invalid password';
  END IF;

  DELETE FROM sales_data WHERE platform = p_platform AND ym_key = p_ym_key;
  RETURN true;
END;
$$;

-- 6. 전체 삭제 RPC 함수
CREATE OR REPLACE FUNCTION clear_all_sales(
  p_password TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  stored_pw TEXT;
BEGIN
  SELECT value INTO stored_pw FROM app_config WHERE key = 'store_password';
  IF stored_pw IS NULL OR p_password != stored_pw THEN
    RAISE EXCEPTION 'Invalid password';
  END IF;

  DELETE FROM sales_data;
  RETURN true;
END;
$$;
