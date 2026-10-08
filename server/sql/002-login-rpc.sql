-- Candidate only. Apply 001 first. Requires explicit cloud permission approval.
-- Configuration starts EMPTY: no caller can use these functions until an
-- administrator confirms the platform-verified dedicated service sub and caps.
BEGIN;
CREATE TABLE IF NOT EXISTS buffer_auth_private.login_rpc_config (
  scope text PRIMARY KEY CHECK (scope ~ '^[a-z0-9_-]{1,64}$'),
  service_user_id text NOT NULL CHECK (service_user_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  max_per_minute integer NOT NULL CHECK (max_per_minute BETWEEN 1 AND 60),
  max_daily_requests integer NOT NULL CHECK (max_daily_requests BETWEEN 1 AND 10000)
);
REVOKE ALL ON SCHEMA buffer_auth_private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA buffer_auth_private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.buffer_login_admit(p_scope text,p_identity text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE cfg buffer_auth_private.login_rpc_config%ROWTYPE; affected integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR p_scope IS NULL OR p_identity IS NULL
    OR p_scope !~ '^[a-z0-9_-]{1,64}$' OR p_identity !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'login_guard_denied';
  END IF;
  SELECT * INTO cfg FROM buffer_auth_private.login_rpc_config WHERE scope=p_scope;
  IF NOT FOUND OR auth.uid() IS DISTINCT FROM cfg.service_user_id THEN RAISE EXCEPTION 'login_guard_denied'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('buffer-login:' || p_scope,0));
  DELETE FROM buffer_auth_private.login_budgets WHERE scope=p_scope AND created_at < CURRENT_TIMESTAMP - INTERVAL '2 days';
  INSERT INTO buffer_auth_private.login_budgets AS budget(scope,bucket,identity,hits)
    VALUES(p_scope,'d:' || to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD'),'*',1)
    ON CONFLICT(scope,bucket,identity) DO UPDATE SET hits=budget.hits+1 WHERE budget.hits < cfg.max_daily_requests;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected<>1 THEN RETURN false; END IF;
  INSERT INTO buffer_auth_private.login_budgets AS budget(scope,bucket,identity,hits)
    VALUES(p_scope,'m:' || to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD-HH24-MI'),p_identity,1)
    ON CONFLICT(scope,bucket,identity) DO UPDATE SET hits=budget.hits+1 WHERE budget.hits < cfg.max_per_minute;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected=1;
END $$;

CREATE OR REPLACE FUNCTION public.buffer_login_consume(p_scope text,p_digest text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE service_id text; affected integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR p_scope IS NULL OR p_digest IS NULL
    OR p_scope !~ '^[a-z0-9_-]{1,64}$' OR p_digest !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'login_guard_denied';
  END IF;
  SELECT service_user_id INTO service_id FROM buffer_auth_private.login_rpc_config WHERE scope=p_scope;
  IF NOT FOUND OR auth.uid() IS DISTINCT FROM service_id THEN RAISE EXCEPTION 'login_guard_denied'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('buffer-login:' || p_scope,0));
  DELETE FROM buffer_auth_private.login_codes WHERE scope=p_scope AND created_at < CURRENT_TIMESTAMP - INTERVAL '1 day';
  INSERT INTO buffer_auth_private.login_codes(scope,digest) VALUES(p_scope,p_digest) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected=1;
END $$;
REVOKE ALL ON FUNCTION public.buffer_login_admit(text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.buffer_login_consume(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buffer_login_admit(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buffer_login_consume(text,text) TO authenticated;
COMMIT;
