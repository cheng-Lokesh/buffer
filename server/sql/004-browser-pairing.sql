-- Candidate only: do not apply until the cloud permission change is confirmed.
-- This store contains hashes and server-encrypted grants, never plaintext tickets.
-- All RPCs require the dedicated server identity AND a server-only key.
-- Approval owner must first be established by fresh WeChat exchange + provider
-- profile verification in the HTTP service; no client owner is accepted there.
BEGIN;
CREATE SCHEMA IF NOT EXISTS buffer_pair_private;
CREATE TABLE IF NOT EXISTS buffer_pair_private.config (
  singleton boolean PRIMARY KEY CHECK(singleton),
  backend_key text NOT NULL CHECK(backend_key ~ '^[a-f0-9]{64}$'),
  service_user_id text NOT NULL CHECK(service_user_id ~ '^[A-Za-z0-9_-]{1,128}$')
);
CREATE TABLE IF NOT EXISTS buffer_pair_private.challenges (
  challenge_hash text PRIMARY KEY CHECK(challenge_hash ~ '^[a-f0-9]{64}$'),
  code_hash text UNIQUE NOT NULL CHECK(code_hash ~ '^[a-f0-9]{64}$'),
  browser_hash text NOT NULL CHECK(browser_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  account_id text,
  sealed_grant text,
  CHECK((account_id IS NULL AND sealed_grant IS NULL) OR
    (account_id ~ '^[A-Za-z0-9_-]{1,128}$' AND octet_length(sealed_grant) BETWEEN 1 AND 24576))
);
CREATE INDEX IF NOT EXISTS buffer_pair_expiry ON buffer_pair_private.challenges(expires_at);
REVOKE ALL ON SCHEMA buffer_pair_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA buffer_pair_private FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION buffer_pair_private.authorize(p_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE cfg buffer_pair_private.config%ROWTYPE;
BEGIN
  SELECT * INTO cfg FROM buffer_pair_private.config WHERE singleton;
  IF NOT FOUND OR p_key IS DISTINCT FROM cfg.backend_key
    OR auth.role() IS DISTINCT FROM 'authenticated'
    OR auth.uid() IS DISTINCT FROM cfg.service_user_id THEN
    RAISE EXCEPTION 'pair_denied';
  END IF;
END $$;
REVOKE ALL ON FUNCTION buffer_pair_private.authorize(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.buffer_pair_create(p_key text,p_challenge text,p_code text,p_browser text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE inserted integer;
BEGIN
  PERFORM buffer_pair_private.authorize(p_key);
  IF p_challenge IS NULL OR p_challenge !~ '^[a-f0-9]{64}$'
    OR p_code IS NULL OR p_code !~ '^[a-f0-9]{64}$'
    OR p_browser IS NULL OR p_browser !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'pair_invalid';
  END IF;
  -- Serialize capacity checks across processes, not a memory-only counter.
  PERFORM pg_advisory_xact_lock(710035004);
  DELETE FROM buffer_pair_private.challenges WHERE expires_at<=clock_timestamp();
  IF (SELECT count(*) FROM buffer_pair_private.challenges)>=1000 THEN
    RAISE EXCEPTION 'pair_capacity';
  END IF;
  INSERT INTO buffer_pair_private.challenges(challenge_hash,code_hash,browser_hash,expires_at)
    VALUES(p_challenge,p_code,p_browser,clock_timestamp()+interval '2 minutes')
    ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted=ROW_COUNT;
  RETURN inserted=1;
END $$;

CREATE OR REPLACE FUNCTION public.buffer_pair_approve(p_key text,p_code text,p_owner text,p_sealed text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE changed integer;
BEGIN
  PERFORM buffer_pair_private.authorize(p_key);
  IF p_code IS NULL OR p_code !~ '^[a-f0-9]{64}$'
    OR p_owner IS NULL OR p_owner !~ '^[A-Za-z0-9_-]{1,128}$'
    OR p_sealed IS NULL OR octet_length(p_sealed) NOT BETWEEN 1 AND 24576 THEN
    RAISE EXCEPTION 'pair_invalid';
  END IF;
  UPDATE buffer_pair_private.challenges SET account_id=p_owner,sealed_grant=p_sealed
    WHERE code_hash=p_code AND expires_at>clock_timestamp() AND account_id IS NULL;
  GET DIAGNOSTICS changed=ROW_COUNT;
  RETURN changed=1;
END $$;

CREATE OR REPLACE FUNCTION public.buffer_pair_consume(p_key text,p_challenge text,p_browser text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item buffer_pair_private.challenges%ROWTYPE;
BEGIN
  PERFORM buffer_pair_private.authorize(p_key);
  IF p_challenge IS NULL OR p_challenge !~ '^[a-f0-9]{64}$'
    OR p_browser IS NULL OR p_browser !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'pair_invalid';
  END IF;
  DELETE FROM buffer_pair_private.challenges WHERE challenge_hash=p_challenge
    AND browser_hash=p_browser AND expires_at>clock_timestamp() AND account_id IS NOT NULL
    RETURNING * INTO item;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('accountId',item.account_id,'sealedGrant',item.sealed_grant);
END $$;
REVOKE ALL ON FUNCTION public.buffer_pair_create(text,text,text,text),
  public.buffer_pair_approve(text,text,text,text),public.buffer_pair_consume(text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.buffer_pair_create(text,text,text,text),
  public.buffer_pair_approve(text,text,text,text),public.buffer_pair_consume(text,text,text) TO authenticated;
COMMIT;
