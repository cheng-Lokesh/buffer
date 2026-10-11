-- Candidate migration, NOT a public launch. Empty config denies all access.
-- Backend key stays on the server; callers additionally need their own user JWT.
-- No owner argument: auth.uid() is the only account selector.
BEGIN;
-- Never adopt or replace same-named objects from an unknown/partial install.
DO $$ BEGIN
  IF pg_catalog.to_regnamespace('buffer_sync_private') IS NOT NULL
    OR pg_catalog.to_regclass('buffer_sync_private.config') IS NOT NULL
    OR pg_catalog.to_regclass('buffer_sync_private.accounts') IS NOT NULL
    OR pg_catalog.to_regclass('buffer_sync_private.receipts') IS NOT NULL
    OR pg_catalog.to_regprocedure('buffer_sync_private.owner(text)') IS NOT NULL
    OR pg_catalog.to_regprocedure('public.buffer_sync_read(text)') IS NOT NULL
    OR pg_catalog.to_regprocedure('public.buffer_sync_receipt(text,bigint,bigint,bigint,text)') IS NOT NULL
    OR pg_catalog.to_regprocedure('public.buffer_sync_commit(text,bigint,bigint,jsonb,text,text,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'account_sync_migration_conflict';
  END IF;
END $$;
CREATE SCHEMA buffer_sync_private;
CREATE TABLE buffer_sync_private.config (
  singleton boolean PRIMARY KEY CHECK(singleton),
  backend_key text NOT NULL CHECK(backend_key ~ '^[a-f0-9]{64}$'),
  service_user_id text NOT NULL CHECK(service_user_id ~ '^[A-Za-z0-9_-]{1,128}$')
);
CREATE TABLE buffer_sync_private.accounts (
  account_id text PRIMARY KEY,
  revision bigint NOT NULL CHECK(revision BETWEEN 0 AND 9007199254740990),
  deletion_generation bigint NOT NULL CHECK(deletion_generation BETWEEN 0 AND 9007199254740990),
  state jsonb CHECK(state IS NULL OR (jsonb_typeof(state)='object' AND octet_length(state::text)<=1048576))
);
CREATE TABLE buffer_sync_private.receipts (
  account_id text NOT NULL REFERENCES buffer_sync_private.accounts(account_id),
  generation bigint NOT NULL,
  operation_id text NOT NULL CHECK(operation_id ~ '^[A-Za-z0-9_-]{16,128}$'),
  digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
  result jsonb NOT NULL,
  PRIMARY KEY(account_id,generation,operation_id)
);
REVOKE ALL ON SCHEMA buffer_sync_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE buffer_sync_private.config,buffer_sync_private.accounts,buffer_sync_private.receipts FROM PUBLIC,anon,authenticated;

CREATE FUNCTION buffer_sync_private.owner(p_key text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE cfg buffer_sync_private.config%ROWTYPE; uid text;
BEGIN
  uid:=auth.uid();
  SELECT * INTO cfg FROM buffer_sync_private.config WHERE singleton;
  IF NOT FOUND OR p_key IS DISTINCT FROM cfg.backend_key OR auth.role() IS DISTINCT FROM 'authenticated'
    OR uid IS NULL OR uid !~ '^[A-Za-z0-9_-]{1,128}$' OR uid=cfg.service_user_id THEN
    RAISE EXCEPTION 'sync_denied';
  END IF;
  RETURN uid;
END $$;
REVOKE ALL ON FUNCTION buffer_sync_private.owner(text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.buffer_sync_read(p_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid text; item buffer_sync_private.accounts%ROWTYPE;
BEGIN
  uid:=buffer_sync_private.owner(p_key);
  SELECT * INTO item FROM buffer_sync_private.accounts WHERE account_id=uid;
  IF NOT FOUND THEN RETURN jsonb_build_object('revision',0,'deletionGeneration',0,'state',NULL); END IF;
  RETURN jsonb_build_object('revision',item.revision,'deletionGeneration',item.deletion_generation,'state',item.state);
END $$;

CREATE FUNCTION public.buffer_sync_receipt(p_key text,p_revision bigint,p_generation bigint,p_receipt_generation bigint,p_operation_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid text; item buffer_sync_private.accounts%ROWTYPE; receipt jsonb;
BEGIN
  uid:=buffer_sync_private.owner(p_key);
  -- Same per-owner lock as commit ensures the version check and receipt lookup
  -- cannot straddle a deletion. No provider/network call holds this lock.
  PERFORM pg_advisory_xact_lock(hashtextextended('buffer-sync:'||uid,0));
  SELECT * INTO item FROM buffer_sync_private.accounts WHERE account_id=uid;
  IF NOT FOUND THEN item.revision:=0; item.deletion_generation:=0; END IF;
  IF p_revision IS DISTINCT FROM item.revision OR p_generation IS DISTINCT FROM item.deletion_generation THEN
    RETURN jsonb_build_object('stale',true);
  END IF;
  SELECT jsonb_build_object('digest',digest,'result',result) INTO receipt
    FROM buffer_sync_private.receipts WHERE account_id=uid AND generation=p_receipt_generation AND operation_id=p_operation_id;
  RETURN jsonb_build_object('stale',false,'receipt',receipt);
END $$;

CREATE FUNCTION public.buffer_sync_commit(p_key text,p_revision bigint,p_generation bigint,p_next jsonb,p_operation_id text,p_digest text,p_result jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid text; item buffer_sync_private.accounts%ROWTYPE; nr bigint; ng bigint; next_state jsonb;
BEGIN
  uid:=buffer_sync_private.owner(p_key);
  PERFORM pg_advisory_xact_lock(hashtextextended('buffer-sync:'||uid,0));
  SELECT * INTO item FROM buffer_sync_private.accounts WHERE account_id=uid;
  IF NOT FOUND THEN item.revision:=0; item.deletion_generation:=0; END IF;
  IF p_revision IS DISTINCT FROM item.revision OR p_generation IS DISTINCT FROM item.deletion_generation THEN RETURN false; END IF;
  IF p_next IS NULL OR jsonb_typeof(p_next) IS DISTINCT FROM 'object' OR p_result IS DISTINCT FROM p_next
    OR p_operation_id IS NULL OR p_operation_id !~ '^[A-Za-z0-9_-]{16,128}$'
    OR p_digest IS NULL OR p_digest !~ '^[a-f0-9]{64}$'
    OR (SELECT count(*) FROM jsonb_object_keys(p_next))<>3 THEN RAISE EXCEPTION 'sync_invalid'; END IF;
  BEGIN
    nr:=(p_next->>'revision')::bigint; ng:=(p_next->>'deletionGeneration')::bigint;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'sync_invalid'; END;
  next_state:=nullif(p_next->'state','null'::jsonb);
  IF p_next->'revision' IS DISTINCT FROM to_jsonb(nr) OR p_next->'deletionGeneration' IS DISTINCT FROM to_jsonb(ng)
    OR nr IS DISTINCT FROM item.revision+1 OR nr>9007199254740990 OR ng IS NULL
    OR ng NOT IN(item.deletion_generation,item.deletion_generation+1) OR ng>9007199254740990
    OR NOT(p_next ? 'state') OR ((ng=item.deletion_generation+1) IS DISTINCT FROM (next_state IS NULL))
    OR (next_state IS NOT NULL AND (jsonb_typeof(next_state)<>'object' OR octet_length(next_state::text)>1048576)) THEN
    RAISE EXCEPTION 'sync_invalid';
  END IF;
  INSERT INTO buffer_sync_private.accounts(account_id,revision,deletion_generation,state) VALUES(uid,nr,ng,next_state)
    ON CONFLICT(account_id) DO UPDATE SET revision=nr,deletion_generation=ng,state=next_state;
  -- Purge all prior financial receipt bodies on delete; preserve its tombstone.
  IF next_state IS NULL THEN DELETE FROM buffer_sync_private.receipts WHERE account_id=uid; END IF;
  INSERT INTO buffer_sync_private.receipts(account_id,generation,operation_id,digest,result)
    VALUES(uid,item.deletion_generation,p_operation_id,p_digest,p_result);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.buffer_sync_read(text),public.buffer_sync_receipt(text,bigint,bigint,bigint,text),public.buffer_sync_commit(text,bigint,bigint,jsonb,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.buffer_sync_read(text),public.buffer_sync_receipt(text,bigint,bigint,bigint,text),public.buffer_sync_commit(text,bigint,bigint,jsonb,text,text,jsonb) TO authenticated;
COMMIT;
