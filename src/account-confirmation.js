import { normalizeCashReality, captureTemporalMemory, createScenarioPatch, saveScenarioDraft, deleteScenarioDraft } from './v8-cash-reality.js';
import { commitRealityCapture } from './v12-reality-capture.js';
import { updateConditionDetails } from './v9-condition-identity.js';
import { buildProductStateEnvelope } from './state-envelope.js';
import { shanghaiDate } from './forecast-lookup.js';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = value => JSON.parse(JSON.stringify(value));
const canonical = value => JSON.stringify(value, (_, item) => record(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
function invalid() { const error = Error('confirmed_operation_invalid'); error.code = 'invalid_confirmed_operation'; throw error; }
function keys(value, allowed) { if (!record(value) || Object.keys(value).some(key => !allowed.includes(key))) invalid(); }
function money(value) { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || !Number.isSafeInteger(Math.round(value * 100)) || Math.round(value * 100) / 100 !== value) invalid(); }
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid();
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) invalid();
}
function patchFields(patch) {
  keys(patch, ['name','amount','frequency','startDate','endDate','nextOccurrence','status','includedInDailyFloor']);
  if (!Object.keys(patch).length) invalid();
  if (Object.hasOwn(patch,'amount')) money(patch.amount);
  if (Object.hasOwn(patch,'name') && (typeof patch.name !== 'string' || !patch.name.trim() || patch.name.length > 80)) invalid();
  if (Object.hasOwn(patch,'frequency') && !['daily','weekly','monthly','once'].includes(patch.frequency)) invalid();
  if (Object.hasOwn(patch,'status') && !['confirmed','paused','ended'].includes(patch.status)) invalid();
  if (Object.hasOwn(patch,'includedInDailyFloor') && typeof patch.includedInDailyFloor !== 'boolean') invalid();
  for (const key of ['startDate','endDate','nextOccurrence']) if (Object.hasOwn(patch,key)) date(patch[key]);
}

/** Reject lossy normalization at the account boundary; migrations must be reviewed first. */
export function validateAccountState(value) {
  if (!record(value) || value.schemaVersion !== 9) invalid();
  const envelope = buildProductStateEnvelope(value);
  if (canonical(envelope) !== canonical(value)) invalid();
  for (const key of ['records','missions','jobs','projects','progressLogs','weeklyReviews','phaseArchives','actionThreads','pilots','reports']) {
    if (Object.hasOwn(value,key) && !Array.isArray(value[key])) invalid();
  }
  if (!record(value.cashReality) || canonical(normalizeCashReality(value.cashReality)) !== canonical(value.cashReality)) invalid();
  for (const key of ['conditions','events','occurrenceResolutions','scenarioDrafts','realitySnapshots','forecastSnapshots']) {
    const items = value.cashReality[key];
    if (items.length > 5000 || new Set(items.map(item => item.id)).size !== items.length) invalid();
  }
  return clone(value);
}

/** User-confirmed operations only. Stable IDs make transaction retries deterministic. */
export function applyConfirmedAccountOperation({state,operation,operationId} = {}, options = {}) {
  try {
    if (typeof operationId !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(operationId)) invalid();
    if (!record(operation)) invalid();
    if (operation.type === 'import_local') {
      keys(operation,['type','state']);
      if (state !== null) invalid();
      return {state:validateAccountState(operation.state)};
    }
    if (operation.type !== 'confirm_reality') invalid();
    const stamp = operation.confirmedAt;
    if (typeof stamp !== 'string' || !Number.isFinite(Date.parse(stamp)) || new Date(stamp).toISOString() !== stamp || Date.parse(stamp) > (options.now || Date.now)() + 300000) invalid();
    const asOf = shanghaiDate(stamp);
    const next = state === null ? {schemaVersion:9,cashReality:normalizeCashReality()} : validateAccountState(state);
    const captureOptions = {asOf,confirmedAt:stamp,provenance:operation.provenance || 'precise_edit',makeId:(kind,index)=>`${operationId}-${kind}-${index}`};
    if (operation.action === 'capture') {
      keys(operation,['type','action','confirmedAt','provenance','candidates']);
      if (!Array.isArray(operation.candidates) || operation.candidates.length > 100) invalid();
      for (const candidate of operation.candidates) {
        keys(candidate,['type','name','amount','occurrenceId','conditionId','frequency','occurredAt','actualDate','startDate','endDate','evidenceText']);
        if (Object.hasOwn(candidate,'amount')) money(candidate.amount);
      }
      next.cashReality = commitRealityCapture(next.cashReality,operation.candidates,captureOptions).reality;
    } else if (operation.action === 'confirm_basics') {
      keys(operation,['type','action','confirmedAt','cash']); keys(operation.cash,['balance','reserve','daily']);
      for (const key of ['balance','reserve','daily']) money(operation.cash[key]);
      if (!operation.cash.daily) invalid();
      const tomorrow = new Date(`${asOf}T00:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
      const types = ['reserve','daily_floor'];
      const conditions = next.cashReality.conditions.filter(item=>!types.includes(item.type));
      for (const [type,amount,id] of [['reserve',operation.cash.reserve,'reserve'],['daily_floor',operation.cash.daily,'daily-floor']]) {
        const old = next.cashReality.conditions.find(item=>item.type===type);
        conditions.push({...old,id:old?.id || id,type,amount,status:'confirmed',source:'user_confirmed',confirmedAt:stamp,captureSource:'precise_edit',...(type==='daily_floor'?{frequency:'daily',startDate:tomorrow.toISOString().slice(0,10)}:{})});
      }
      next.cashReality = commitRealityCapture(normalizeCashReality({...next.cashReality,conditions}),[{type:'balance_confirmation',amount:operation.cash.balance}],captureOptions).reality;
    } else if (operation.action === 'edit_condition') {
      keys(operation,['type','action','confirmedAt','conditionId','patch']); patchFields(operation.patch);
      if (!next.cashReality.conditions.some(item=>item.id===operation.conditionId)) invalid();
      next.cashReality = updateConditionDetails(next.cashReality,operation.conditionId,{...operation.patch,captureSource:'precise_edit'},{confirmedAt:stamp});
      if (!next.cashReality.conditions.some(item=>item.id===operation.conditionId)) invalid();
    } else if (operation.action === 'save_scenario') {
      keys(operation,['type','action','confirmedAt','patch']);
      keys(operation.patch,['id','name','version','baseSnapshotId','changes','operations','createdAt','savedAsDraft','neverApplyToReality']);
      const patch = createScenarioPatch({...operation.patch,id:operation.patch.id || `${operationId}-draft`,createdAt:operation.patch.createdAt || stamp});
      for (const item of patch.operations) {
        if (['set_condition','set_status'].includes(item.type) && !next.cashReality.conditions.some(condition=>condition.id===item.conditionId)) invalid();
        if (Object.hasOwn(item,'amount')) money(item.amount);
        if (item.type==='set_condition') patchFields({[item.field]:item.value});
      }
      next.cashReality = saveScenarioDraft(next.cashReality,patch);
      return {state:validateAccountState(next)};
    } else if (operation.action === 'delete_scenario') {
      keys(operation,['type','action','confirmedAt','draftId']);
      if (!next.cashReality.scenarioDrafts.some(item=>item.id===operation.draftId)) invalid();
      next.cashReality = deleteScenarioDraft(next.cashReality,operation.draftId);
      return {state:validateAccountState(next)};
    } else invalid();
    next.cashReality = captureTemporalMemory(next.cashReality,{asOf,capturedAt:stamp,realitySnapshotId:`${operationId}-reality`,forecastSnapshotId:`${operationId}-forecast`}).reality;
    const amount = type => next.cashReality.conditions.find(item=>item.type===type && item.status==='confirmed')?.amount ?? '';
    next.cash = {...next.cash,balance:amount('balance'),reserve:amount('reserve'),daily:amount('daily_floor')};
    next.cashflowConfirmation = {...next.cashflowConfirmation,confirmedAt:stamp};
    return {state:validateAccountState(next)};
  } catch { invalid(); }
}
