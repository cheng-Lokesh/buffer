import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertTriangle, CalendarRange, ChevronRight, DatabaseBackup, Download, History, Home, RotateCcw, ShieldCheck, SlidersHorizontal, Upload } from 'lucide-react';
import { appendCashEvent, captureTemporalMemory, deleteScenarioDraft, normalizeCashReality, reconcileExpectedOccurrence, saveScenarioDraft } from './v8-cash-reality.js';
import { adaptLegacyCashToV8Reality } from './v8-legacy-adapter.js';
import { updateConditionDetails } from './v9-condition-identity.js';
import { commitRealityCapture } from './v12-reality-capture.js';
import { V8Experience } from './v8-experience.jsx';
import { prepareBackupPreview } from './backup-restore.js';
import { buildProductStateEnvelope } from './state-envelope.js';
import { persistProductState, persistRecoveryCheckpoint } from './product-persistence.js';
import { normalizeRecoveryVault, prepareRecoverySnapshot } from './local-recovery.js';
import { getVisualSkin, loadVisualSkin, persistVisualSkin, VISUAL_SKINS } from './visual-skin-system.js';
import { archiveLegacyProductData, restoreLegacyProductData } from './legacy-data-archive.js';
import './styles.css';
import './v6-extreme.css';
import './visual-skins.css';
import './v8-experience.css';
import './v12-reality-capture.css';

const STATE_KEY = 'buffer-zone.product.state.v1';
const RECOVERY_KEY = 'buffer-zone.recovery.v1';
const BACKUP_META_KEY = 'buffer-zone.backup.meta.v1';
const LEGACY_KEYS = ['buffer-zone.demo.state.v4', 'buffer-zone.demo.state.v3', 'buffer-zone.demo.state.v2', 'buffer-zone.demo.state.v1'];
const SPACES = [
  { id: 'now', label: '现在', Icon: Home },
  { id: 'future', label: '未来', Icon: CalendarRange },
  { id: 'conditions', label: '条件', Icon: SlidersHorizontal },
  { id: 'records', label: '记录', Icon: History }
];

// 自然语言解析只发送当前原句、当前日期和必要相关摘要给模型服务；完整历史、备份、身份资料和无关数据不会发送。
const parserPrivacyDisclosure = '自然语言解析仅发送当前原句、当前日期和必要相关摘要给模型服务；完整历史、备份、身份资料和无关数据不会发送。';
const today = () => new Date().toISOString().slice(0, 10);
const makeId = (prefix) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

function readJson(key, fallback = null) {
  try { return JSON.parse(window.localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}

function loadRawState() {
  const primary = readJson(STATE_KEY);
  if (primary) return primary;
  return LEGACY_KEYS.map((key) => readJson(key)).find(Boolean) || {};
}

function normalizeState(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const restored = restoreLegacyProductData(source, source.legacyArchive);
  return {
    reality: source.cashReality?.conditions?.length
      ? normalizeCashReality(source.cashReality)
      : adaptLegacyCashToV8Reality(restored, { asOf: today(), confirmedAt: source.cashflowConfirmation?.confirmedAt || '' }),
    records: Array.isArray(source.records) ? source.records.filter((item) => item && typeof item === 'object') : [],
    skinId: getVisualSkin(source.visualSkinId || loadVisualSkin(window.localStorage)).id,
    legacyArchive: source.legacyArchive || archiveLegacyProductData(restored)
  };
}

function compactPayload(state) {
  return buildProductStateEnvelope({
    cashReality: state.reality,
    records: state.records,
    visualSkinId: state.skinId,
    legacyArchive: state.legacyArchive
  }, { exportedAt: new Date().toISOString() });
}

function BackupTools({ state, setState, recoveryVault, setRecoveryVault }) {
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(null);
  const [pendingRecovery, setPendingRecovery] = useState(null);
  const [backupMeta, setBackupMeta] = useState(() => readJson(BACKUP_META_KEY, {}));
  const [storageFailure, setStorageFailure] = useState('');
  const snapshotList = recoveryVault.snapshots.slice().reverse();
  const saveCheckpoint = () => persistRecoveryCheckpoint(window.localStorage, {
    recoveryKey: RECOVERY_KEY, payload: compactPayload(state), recoveryVault,
    id: makeId('recovery'), createdAt: new Date().toISOString(), reason: 'before_restore'
  });
  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(compactPayload(state), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `buffer-zone-backup-${today()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    const meta = { lastExportedAt: new Date().toISOString(), fileName: link.download };
    window.localStorage.setItem(BACKUP_META_KEY, JSON.stringify(meta));
    setBackupMeta(meta);
    setMessage('备份已导出。');
  };
  const importBackup = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const preview = prepareBackupPreview(JSON.parse(String(reader.result || '{}')), { fileName: file.name, fileSize: file.size });
        if (!preview.ok) throw new Error(preview.message);
        setPending(preview);
        setMessage('备份校验通过；确认前不会覆盖当前数据。');
      } catch (error) { setMessage(`备份无法读取：${error.message}`); }
    };
    reader.onerror = () => setMessage('备份读取失败；当前数据没有改变。');
    reader.readAsText(file);
  };
  const restorePayload = (payload) => {
    const checkpoint = saveCheckpoint();
    if (!checkpoint.ok) { setStorageFailure(checkpoint.message || '无法建立恢复点'); return false; }
    setRecoveryVault(checkpoint.recoveryVault);
    setState(normalizeState(payload));
    return true;
  };
  return <section className="v8-data-center" data-skin-region="panel">
    <header><div><span><DatabaseBackup size={16} /> 本机数据</span><h2>备份与恢复</h2><p>核心数据默认只保存在当前设备。恢复前总会先检查文件。</p></div><strong className={storageFailure ? 'is-error' : ''}>{storageFailure ? <AlertTriangle size={17} /> : <ShieldCheck size={17} />}{storageFailure ? '保存异常' : '保存正常'}</strong></header>
    <div className="v8-data-summary" data-skin-region="list"><article><span>现实条件</span><strong>{state.reality.conditions.filter((item) => item.status === 'confirmed').length}</strong><small>条已确认</small></article><article><span>现金变化</span><strong>{state.reality.events.length}</strong><small>条本人事实</small></article><article><span>模拟草稿</span><strong>{state.reality.scenarioDrafts.length}</strong><small>份独立保存</small></article><article><span>视觉皮肤</span><strong>{getVisualSkin(state.skinId).shortLabel}</strong><small>会跟随备份</small></article></div>
    <div className="v8-data-actions"><button type="button" className="primary" onClick={exportBackup}><Download size={16} /> 导出备份</button><label><Upload size={16} /> 选择备份<input type="file" accept="application/json" onChange={(event) => { importBackup(event.target.files?.[0]); event.target.value = ''; }} /></label></div>
    <p className="v8-data-status" aria-live="polite">{message || `最近导出：${backupMeta?.lastExportedAt ? new Date(backupMeta.lastExportedAt).toLocaleString('zh-CN') : '还没有'}`}</p>
    {pending ? <section className="v8-backup-preview" data-skin-region="warning"><header><div><span>文件检查通过</span><h3>恢复前看一眼</h3><p>{pending.summary.fileName} · 格式 {pending.summary.schemaVersion}</p></div><ShieldCheck size={22} /></header><dl><div><dt>现实条件</dt><dd>{pending.summary.cashConditions}</dd></div><div><dt>现金变化</dt><dd>{pending.summary.cashEvents}</dd></div><div><dt>模拟草稿</dt><dd>{pending.summary.scenarioDrafts}</dd></div><div><dt>旧版记录</dt><dd>{pending.summary.records}</dd></div></dl><footer><button type="button" onClick={() => setPending(null)}>取消</button><button type="button" className="primary" onClick={() => { if (restorePayload(pending.payload)) { setPending(null); setMessage('备份已恢复。'); } }}>确认恢复</button></footer></section> : null}
    <details className="v8-recovery-list"><summary><RotateCcw size={16} /> 可退回版本 <b>{snapshotList.length}</b></summary><div>{snapshotList.length ? snapshotList.map((point) => <button type="button" key={point.id} onClick={() => setPendingRecovery(prepareRecoverySnapshot(recoveryVault, point.id))}><span>{new Date(point.createdAt).toLocaleString('zh-CN')}</span><ChevronRight size={15} /></button>) : <p>首次成功保存后，这里会自动留下可退回版本。</p>}</div></details>
    {pendingRecovery?.ok ? <section className="v8-backup-preview" data-skin-region="warning"><header><div><span>退回前确认</span><h3>退回这个版本</h3><p>{new Date(pendingRecovery.createdAt).toLocaleString('zh-CN')}</p></div><RotateCcw size={22} /></header><footer><button type="button" onClick={() => setPendingRecovery(null)}>保留现在</button><button type="button" className="primary" onClick={() => { if (restorePayload(pendingRecovery.payload)) { setPendingRecovery(null); setMessage('已退回所选版本。'); } }}>确认退回</button></footer></section> : null}
  </section>;
}

function App() {
  const [state, setState] = useState(() => normalizeState(loadRawState()));
  const [space, setSpace] = useState('now');
  const [skinMenuOpen, setSkinMenuOpen] = useState(false);
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  const [recoveryVault, setRecoveryVault] = useState(() => normalizeRecoveryVault(readJson(RECOVERY_KEY, {})));
  const [storageFailure, setStorageFailure] = useState('');
  useEffect(() => {
    const saved = persistProductState(window.localStorage, { stateKey: STATE_KEY, recoveryKey: RECOVERY_KEY, payload: compactPayload(state), recoveryVault, id: makeId('recovery'), createdAt: new Date().toISOString() });
    if (saved.ok) { setRecoveryVault(saved.recoveryVault); setStorageFailure(''); } else setStorageFailure(saved.message || '本机保存失败');
  }, [state]);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)');
    const update = () => setMobile(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const updateReality = (next) => setState((current) => ({ ...current, reality: normalizeCashReality(next) }));
  const asOf = today();
  const dataPanel = <BackupTools state={state} setState={setState} recoveryVault={recoveryVault} setRecoveryVault={setRecoveryVault} />;
  const handlers = useMemo(() => ({
    onUpdateCondition: (id, patch) => updateReality(updateConditionDetails(state.reality, id, patch, { confirmedAt: new Date().toISOString() })),
    onAddCondition: (type) => {
      const condition = { id: makeId('condition'), type, name: '', amount: 0, status: 'missing', source: 'user_confirmed', frequency: type === 'known_event' ? 'once' : 'monthly', nextOccurrence: asOf, eventKind: type === 'known_event' ? 'expense' : '' };
      updateReality({ ...state.reality, conditions: [...state.reality.conditions, condition] });
      return condition;
    },
    onAppendEvent: (input) => updateReality(appendCashEvent(state.reality, input, { id: makeId('event'), createdAt: new Date().toISOString() })),
    onReconcileOccurrence: (id, input) => updateReality(reconcileExpectedOccurrence(state.reality, id, input, { asOf, id: makeId('resolution'), eventId: makeId('event'), resolvedAt: new Date().toISOString() }).reality),
    onCommitRealityCapture: (candidates, provenance) => {
      const result = commitRealityCapture(state.reality, candidates, { asOf, confirmedAt: new Date().toISOString(), provenance, makeId: (kind, index) => makeId(`${kind}-${index}`) });
      updateReality(captureTemporalMemory(result.reality, { asOf, reason: 'reality_capture_confirmed', realitySnapshotId: makeId('reality'), forecastSnapshotId: makeId('forecast'), capturedAt: new Date().toISOString() }).reality);
      return result;
    },
    onSaveScenarioDraft: (patch) => updateReality(saveScenarioDraft(state.reality, patch)),
    onDeleteScenarioDraft: (id) => updateReality(deleteScenarioDraft(state.reality, id))
  }), [state, asOf]);
  const skinControl = <div className="skin-switcher"><button type="button" aria-label="选择视觉皮肤" onClick={() => setSkinMenuOpen((open) => !open)}>选择视觉皮肤</button>{skinMenuOpen ? <div aria-label="视觉皮肤选项">{VISUAL_SKINS.map((skin) => <button type="button" key={skin.id} aria-pressed={state.skinId === skin.id} onClick={() => { persistVisualSkin(window.localStorage, skin.id); setState((current) => ({ ...current, skinId: skin.id })); setSkinMenuOpen(false); }}>{skin.label}</button>)}</div> : null}</div>;
  return <div className="app-shell" data-skin={state.skinId} data-skin-screen={space}>
    <aside className="sidebar"><div className="brand"><strong>缓冲区</strong><small>现实，不是建议</small></div><nav aria-label="产品空间">{SPACES.map(({ id, label, Icon }) => <button type="button" key={id} className={space === id ? 'active' : ''} onClick={() => setSpace(id)}><Icon size={18} />{label}</button>)}</nav>{mobile ? null : skinControl}</aside>
    {mobile ? <div className="mobile-skin-control">{skinControl}</div> : null}
    <main id="main-content" className="workspace v6-extreme-shell"><section className="screen-body"><V8Experience space={space} reality={state.reality} asOf={asOf} legacyRecords={state.records} onNavigate={setSpace} dataPanel={dataPanel} {...handlers} />{storageFailure ? <p className="v8-data-warning" role="alert">{storageFailure}</p> : null}</section></main>
    <p className="sr-only">{parserPrivacyDisclosure}</p>
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
