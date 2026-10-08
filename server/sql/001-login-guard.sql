-- Run only as the environment administrator, in the confirmed development DB.
-- This creates new private auth metadata tables; no cash/user data is migrated.
BEGIN;
CREATE SCHEMA IF NOT EXISTS buffer_auth_private;
REVOKE ALL ON SCHEMA buffer_auth_private FROM PUBLIC;
CREATE TABLE IF NOT EXISTS buffer_auth_private.login_budgets (
  scope text NOT NULL,
  bucket text NOT NULL,
  identity text NOT NULL,
  hits integer NOT NULL CHECK(hits > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(scope,bucket,identity)
);
CREATE TABLE IF NOT EXISTS buffer_auth_private.login_codes (
  scope text NOT NULL,
  digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(scope,digest)
);
REVOKE ALL ON ALL TABLES IN SCHEMA buffer_auth_private FROM PUBLIC;
COMMIT;
-- Grant schema USAGE and these tables' SELECT/INSERT/UPDATE/DELETE only to the
-- dedicated server login role after its name is verified. Never grant anon or
-- authenticated app users access. A shared anonymous/public DB key is NOT suitable.
