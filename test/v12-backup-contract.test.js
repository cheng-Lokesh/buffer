import test from 'node:test';
import assert from 'node:assert/strict';
import { CURRENT_BACKUP_SCHEMA, prepareBackupPreview } from '../src/backup-restore.js';

const cashReality = {
  version: 1,
  conditions: [
    { id: 'balance', type: 'balance', amount: 4360, status: 'confirmed', confirmedAt: '2026-08-25T09:00:00.000Z', source: 'user_confirmed', captureSource: 'manual_balance' }
  ],
  events: [
    { id: 'balance-event', type: 'balance_confirmation', amount: 4360, occurredAt: '2026-08-25', createdAt: '2026-08-25T09:00:00.000Z', source: 'user_confirmed', captureSource: 'manual_balance' }
  ],
  occurrenceResolutions: [], scenarioDrafts: [], realitySnapshots: [], forecastSnapshots: []
};

test('V12 uses schema 9 and round-trips confirmed capture provenance', () => {
  assert.equal(CURRENT_BACKUP_SCHEMA, 9);
  const preview = prepareBackupPreview({ schemaVersion: 9, cashReality });
  assert.equal(preview.ok, true);
  assert.equal(preview.payload.cashReality.conditions[0].captureSource, 'manual_balance');
  assert.equal(preview.payload.cashReality.events[0].captureSource, 'manual_balance');
});

test('transient parser candidates and transactions are excluded from backup restore', () => {
  const preview = prepareBackupPreview({
    schemaVersion: 9,
    cashReality,
    realityCaptureCandidates: [{ type: 'balance_confirmation', amount: 9999 }],
    captureTransaction: { status: 'pending' },
    candidates: [{ type: 'one_off_income', amount: 1 }]
  });
  assert.equal('realityCaptureCandidates' in preview.payload, false);
  assert.equal('captureTransaction' in preview.payload, false);
  assert.equal('candidates' in preview.payload, false);
});

test('old v0.33 cash reality migrates with no invented capture metadata', () => {
  const legacy = structuredClone(cashReality);
  delete legacy.conditions[0].captureSource;
  delete legacy.events[0].captureSource;
  const preview = prepareBackupPreview({ schemaVersion: 9, cashReality: legacy });
  assert.equal('captureSource' in preview.payload.cashReality.conditions[0], false);
  assert.equal('captureSource' in preview.payload.cashReality.events[0], false);
  assert.equal('candidates' in preview.payload.cashReality, false);
});
