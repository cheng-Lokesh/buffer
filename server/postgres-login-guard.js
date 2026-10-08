import {createHmac} from 'node:crypto';
import {isIP} from 'node:net';

/** pool must be a real server-side PostgreSQL pool. Install the private schema
 * separately; no client SDK, memory fallback, forwarded-header trust or defaults. */
export function createPostgresLoginGuard({pool,scope,hashSecret,maxPerMinute,maxDailyRequests}={}) {
  if(typeof pool?.connect!=='function' || typeof scope!=='string' || !/^[a-z0-9_-]{1,64}$/.test(scope)
    || typeof hashSecret!=='string' || hashSecret.length<32
    || !Number.isInteger(maxPerMinute) || maxPerMinute<1 || maxPerMinute>60
    || !Number.isInteger(maxDailyRequests) || maxDailyRequests<1 || maxDailyRequests>10000) throw new Error('login_guard_config_invalid');
  async function transaction(work) {
    let client;
    try {
      client=await pool.connect();
      await client.query('BEGIN');
      await client.query('SET LOCAL statement_timeout = 3000');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',[`buffer-login:${scope}`]);
      const result=await work(client);
      await client.query('COMMIT');
      return result;
    } catch {
      try {await client?.query('ROLLBACK');} catch { /* preserve sanitized error */ }
      throw new Error('login_guard_unavailable');
    } finally {client?.release();}
  }
  return {
    async admit(context) {
      const address=context?.remoteAddress;
      if(typeof address!=='string' || !isIP(address)) return false;
      const identity=createHmac('sha256',hashSecret).update(address).digest('hex');
      return transaction(async client=>{
        await client.query('DELETE FROM buffer_auth_private.login_budgets WHERE scope=$1 AND created_at < CURRENT_TIMESTAMP - INTERVAL \'2 days\'',[scope]);
        const daily=await client.query(`INSERT INTO buffer_auth_private.login_budgets(scope,bucket,identity,hits)
          VALUES($1, 'd:' || to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD'), '*', 1)
          ON CONFLICT(scope,bucket,identity) DO UPDATE SET hits=login_budgets.hits+1
          WHERE login_budgets.hits < $2 RETURNING hits AS max_daily`,[scope,maxDailyRequests]);
        if(daily.rows.length!==1) return false;
        const minute=await client.query(`INSERT INTO buffer_auth_private.login_budgets(scope,bucket,identity,hits)
          VALUES($1, 'm:' || to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD-HH24-MI'), $2, 1)
          ON CONFLICT(scope,bucket,identity) DO UPDATE SET hits=login_budgets.hits+1
          WHERE login_budgets.hits < $3 RETURNING hits AS max_minute`,[scope,identity,maxPerMinute]);
        return minute.rows.length===1;
      });
    },
    async consumeCode(digest) {
      if(typeof digest!=='string' || !/^[a-f0-9]{64}$/.test(digest)) throw new Error('login_code_hash_invalid');
      return transaction(async client=>{
        await client.query('DELETE FROM buffer_auth_private.login_codes WHERE scope=$1 AND created_at < CURRENT_TIMESTAMP - INTERVAL \'1 day\'',[scope]);
        const result=await client.query('INSERT INTO buffer_auth_private.login_codes(scope,digest) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING digest',[scope,digest]);
        return result.rows.length===1;
      });
    },
  };
}
