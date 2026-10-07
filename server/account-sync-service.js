import { createHash } from 'node:crypto';

const MAX_COMMAND_BYTES = 32 * 1024;
const KEYS = new Set(['protocolVersion', 'schemaVersion', 'operationId', 'baseRevision', 'deletionGeneration', 'confirmed', 'migrationApproved', 'operation']);
const TYPES = new Set(['confirm_reality', 'import_local', 'delete_all']);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const version = value => Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER;
const response = (status, body) => new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'vary': 'Cookie, Authorization'}});
const canonical = value => JSON.stringify(value, (_, item) => record(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const fingerprint = command => createHash('sha256').update(canonical(command)).digest('hex');
const publicView = row => ({protocolVersion:1, schemaVersion:9, revision:row.revision, deletionGeneration:row.deletionGeneration, state:row.state});

async function readCommand(request) {
  const reader = request.body?.getReader();
  if (!reader) return {error:400};
  const chunks = []; let bytes = 0;
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_COMMAND_BYTES) { await reader.cancel(); return {error:413}; }
      chunks.push(value);
    }
    return {command:JSON.parse(Buffer.concat(chunks).toString('utf8'))};
  } catch { return {error:400}; }
  finally { reader.releaseLock(); }
}

function validCommand(command) {
  return record(command) && Object.keys(command).every(key => KEYS.has(key))
    && command.protocolVersion === 1 && command.schemaVersion === 9
    && typeof command.operationId === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(command.operationId)
    && version(command.baseRevision) && version(command.deletionGeneration)
    && command.confirmed === true && record(command.operation) && TYPES.has(command.operation.type)
    && (command.operation.type !== 'import_local' || command.migrationApproved === true)
    && (command.operation.type !== 'delete_all' || Object.keys(command.operation).length === 1);
}

/**
 * Server-side sync boundary, not an identity provider or a production database.
 * Adapters MUST verify session control, provide durable serializable per-account
 * transactions (including receipts), and validate/apply confirmed domain operations.
 * Deliberately not mounted on the public/private pilot server until those exist.
 * No default/mock authentication, persistence or permissive domain validator.
 */
export function createAccountSyncService({authenticate, repository, applyConfirmedOperation} = {}) {
  if (typeof authenticate !== 'function' || typeof repository?.transaction !== 'function' || typeof applyConfirmedOperation !== 'function') throw new Error('account_sync_adapters_required');
  return async function handle(request) {
    try {
      const principal = await authenticate(request);
      if (!principal || typeof principal.accountId !== 'string' || !principal.accountId) return response(401, {code:'authentication_required'});
      if (!['GET', 'POST'].includes(request.method)) return response(405, {code:'method_not_allowed'});
      let command;
      if (request.method === 'POST') {
        const input = await readCommand(request);
        if (input.error) return response(input.error, {code:input.error === 413 ? 'command_too_large' : 'invalid_command'});
        command = input.command;
        if (!validCommand(command)) return response(400, {code:'invalid_command'});
      }
      return await repository.transaction(principal.accountId, async tx => {
        const stored = await tx.read();
        const row = stored || {revision:0, deletionGeneration:0, state:null};
        if (!version(row.revision) || !version(row.deletionGeneration)) throw new Error('invalid_account_version');
        if (!command) return response(200, publicView(row));
        const digest = fingerprint(command);
        const conflict = code => response(409, {code, current:publicView(row)});
        if (command.deletionGeneration !== row.deletionGeneration) {
          // A delete retry can acknowledge its tombstone, but an old confirmation
          // receipt must never disclose/revive the deleted snapshot.
          if (command.operation.type === 'delete_all' && command.deletionGeneration + 1 === row.deletionGeneration) {
            const receipt = await tx.getReceipt(command.deletionGeneration, command.operationId);
            if (receipt?.digest === digest) return response(200, receipt.result);
          }
          return conflict('deletion_generation_conflict');
        }
        const receipt = await tx.getReceipt(command.deletionGeneration, command.operationId);
        if (receipt) return receipt.digest === digest ? response(200, receipt.result) : conflict('operation_id_conflict');
        if (command.baseRevision !== row.revision) return conflict('revision_conflict');
        if (command.operation.type === 'import_local' && row.state !== null) return conflict('migration_requires_empty_account');
        let state = null;
        if (command.operation.type !== 'delete_all') {
          const result = await applyConfirmedOperation({state:structuredClone(row.state), operation:structuredClone(command.operation)});
          if (!record(result) || !Object.hasOwn(result, 'state') || result.state == null) throw new Error('invalid_domain_result');
          state = structuredClone(result.state);
        }
        const next = {revision:row.revision + 1, deletionGeneration:row.deletionGeneration + (command.operation.type === 'delete_all' ? 1 : 0), state};
        const result = publicView(next);
        // Receipt and snapshot must commit atomically; failure cannot acknowledge success.
        await tx.write(next);
        await tx.putReceipt(command.deletionGeneration, command.operationId, {digest, result});
        return response(200, result);
      });
    } catch { return response(503, {code:'sync_unavailable'}); }
  };
}
