import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  Keyboard,
  Mic,
  PencilLine,
  RefreshCw,
  ShieldCheck,
  Trash2,
  WalletCards,
  X
} from 'lucide-react';
import {
  buildRealityCaptureContext
} from './v12-reality-capture.js';
import { createV12_1RealityParser } from './v12-1-browser-adapter.js';

const MONEY = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 2 });
const CANDIDATE_LABELS = {
  balance_confirmation: '当前余额',
  one_off_income: '已发生收入',
  one_off_expense: '已发生支出',
  known_future_income: '未来确定收入',
  known_future_expense: '未来确定支出',
  recurring_income: '固定收入',
  recurring_expense: '固定支出',
  existing_occurrence_confirmation: '原预计事项',
  existing_occurrence_amount_change: '原预计事项，金额不同',
  existing_occurrence_date_change: '原预计事项，日期不同',
  existing_occurrence_not_occurred: '原预计事项，这次没发生',
  condition_update: '已有规律更新',
  condition_pause: '已有规律暂停',
  condition_end: '已有规律结束'
};

function formatDate(value) {
  if (!value) return '日期待确认';
  return new Date(`${value}T12:00:00`).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function candidateAmount(candidate) {
  if (!Number.isFinite(candidate.amount)) return null;
  const sign = ['one_off_expense', 'known_future_expense', 'recurring_expense'].includes(candidate.type) ? '−' : ['one_off_income', 'known_future_income', 'recurring_income'].includes(candidate.type) ? '＋' : '';
  return `${sign}${MONEY.format(candidate.amount)}`;
}

export function RealityCapturePanel({ open, reality, asOf, onClose, onCommit, onNavigate }) {
  const [mode, setMode] = useState('home');
  const [balance, setBalance] = useState('');
  const [message, setMessage] = useState('');
  const [parseResult, setParseResult] = useState(null);
  const [parseSource, setParseSource] = useState('natural_language');
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState('');
  const [dueEdit, setDueEdit] = useState(null);
  const [complete, setComplete] = useState(null);
  const [voiceState, setVoiceState] = useState('idle');
  const [voiceMessage, setVoiceMessage] = useState('');
  const panelRef = useRef(null);
  const recognitionRef = useRef(null);
  const parser = useMemo(() => createV12_1RealityParser(), []);
  const context = useMemo(() => buildRealityCaptureContext(reality, {
    asOf,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
  }), [reality, asOf]);
  const currentBalance = context.currentBalance;

  const reset = () => {
    setMode('home');
    setBalance('');
    setMessage('');
    setParseResult(null);
    setParseSource('natural_language');
    setParsing(false);
    setError('');
    setDueEdit(null);
    setComplete(null);
    setVoiceState('idle');
    setVoiceMessage('');
  };

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const frame = requestAnimationFrame(() => panelRef.current?.querySelector('button, input, textarea')?.focus());
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      recognitionRef.current?.abort?.();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  if (!open) return null;

  const commit = (candidates, provenance) => {
    setError('');
    try {
      const result = onCommit(candidates, provenance);
      setComplete(result.summary);
      setMode('complete');
    } catch (commitError) {
      setError(commitError instanceof Error ? commitError.message : '这次变化没有写入，请重新确认。');
    }
  };

  const parseText = async (text, provenance = 'natural_language') => {
    setParsing(true);
    setError('');
    setParseResult(null);
    setParseSource(provenance);
    const result = await parser.parse(text, context);
    setParseResult(result);
    setParsing(false);
    if (['candidates', 'partial'].includes(result.status) && result.candidates?.length) setMode('confirm');
  };

  const startVoice = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceState('unsupported');
      setVoiceMessage('这台设备的浏览器暂时不能可靠转写语音，请改用文字。');
      return;
    }
    try {
      const recognition = new Recognition();
      recognition.lang = 'zh-CN';
      recognition.interimResults = false;
      recognition.continuous = false;
      recognition.onstart = () => { setVoiceState('listening'); setVoiceMessage('正在听，只会先转成文字。'); };
      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim() || '';
        setMessage(transcript);
        setVoiceState('ready');
        setVoiceMessage('语音已转成文字，正在整理事实。');
        if (transcript) parseText(transcript, 'voice');
      };
      recognition.onerror = (event) => {
        setVoiceState('denied');
        setVoiceMessage(event.error === 'not-allowed' ? '麦克风权限未开启，文字输入仍可直接使用。' : '语音没有转写成功，请改用文字。');
      };
      recognition.onend = () => setVoiceState((value) => value === 'listening' ? 'idle' : value);
      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setVoiceState('unsupported');
      setVoiceMessage('语音不可用，请改用文字。');
    }
  };

  const submitBalance = (event) => {
    event.preventDefault();
    const amount = Number(balance);
    if (!Number.isFinite(amount) || amount < 0) {
      setError('请输入现在实际可以使用的现金总额。');
      return;
    }
    commit([{ type: 'balance_confirmation', amount, occurredAt: asOf }], 'manual_balance');
  };

  const confirmDue = (occurrence, type, value = {}) => commit([{
    type,
    occurrenceId: occurrence.id,
    name: occurrence.conditionName,
    ...value
  }], 'quick_occurrence');

  const updateCandidate = (index, patch) => setParseResult((current) => ({
    ...current,
    candidates: current.candidates.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)
  }));
  const removeCandidate = (index) => setParseResult((current) => ({ ...current, candidates: current.candidates.filter((_, itemIndex) => itemIndex !== index) }));

  return <div className="v12-capture-backdrop" data-v12-capture onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside ref={panelRef} className={`v12-capture-panel is-${mode}`} role="dialog" aria-modal="true" aria-label="现实有变化" data-skin-region="panel">
      <header className="v12-capture-header">
        <div>
          <span>现实有变化</span>
          <h2>{mode === 'home' ? '让 Buffer 重新看清现在' : mode === 'balance' ? '确认现在有多少钱' : mode === 'language' ? '说一句发生了什么' : mode === 'confirm' ? '我理解为' : mode === 'precise' ? '精确修改' : '现实已更新'}</h2>
        </div>
        <button type="button" className="v12-icon-button" aria-label="关闭现实更新" onClick={onClose}><X size={19} /></button>
      </header>

      <div className="v12-capture-status" aria-live="polite">{error || (parsing ? '正在整理这句话里的现实变化……' : voiceMessage)}</div>

      {mode === 'home' ? <div className="v12-capture-home">
        {context.dueOccurrences.length ? <section className="v12-due-section" aria-label={`${context.dueOccurrences.length} 项原预计事项待确认`}>
          <header><div><CalendarDays size={18} /><span>待确认</span></div><strong>{context.dueOccurrences.length} 项原预计事项日期已到</strong></header>
          {context.dueOccurrences.map((occurrence) => <article className="v12-due-card" key={occurrence.id} data-skin-region="card">
            <div className="v12-due-fact"><span>{formatDate(occurrence.expectedDate)}</span><strong>{occurrence.conditionName}</strong><b>{occurrence.direction === 'expense' ? '−' : '＋'}{MONEY.format(occurrence.expectedAmount)}</b></div>
            <div className="v12-due-actions">
              <button type="button" className="is-primary" onClick={() => confirmDue(occurrence, 'existing_occurrence_confirmation')}><Check size={16} /> 如期发生</button>
              <button type="button" onClick={() => setDueEdit({ occurrence, kind: 'amount', value: String(occurrence.expectedAmount) })}>金额不同</button>
              <button type="button" onClick={() => setDueEdit({ occurrence, kind: 'date', value: occurrence.expectedDate })}>日期不同</button>
              <button type="button" onClick={() => confirmDue(occurrence, 'existing_occurrence_not_occurred')}>这次没发生</button>
            </div>
            {dueEdit?.occurrence.id === occurrence.id ? <form className="v12-due-edit" onSubmit={(event) => {
              event.preventDefault();
              if (dueEdit.kind === 'amount') confirmDue(occurrence, 'existing_occurrence_amount_change', { amount: Number(dueEdit.value) });
              else confirmDue(occurrence, 'existing_occurrence_date_change', { actualDate: dueEdit.value });
            }}>
              <label>{dueEdit.kind === 'amount' ? '实际是多少？' : '实际发生在哪一天？'}<input autoFocus required type={dueEdit.kind === 'amount' ? 'number' : 'date'} min={dueEdit.kind === 'amount' ? '0' : undefined} step={dueEdit.kind === 'amount' ? '0.01' : undefined} value={dueEdit.value} onChange={(event) => setDueEdit({ ...dueEdit, value: event.target.value })} /></label>
              <button type="button" onClick={() => setDueEdit(null)}>取消</button><button type="submit" className="is-primary">确认</button>
            </form> : null}
          </article>)}
        </section> : null}

        <section className="v12-paths" aria-label="更新现实的方式">
          <button type="button" className="v12-path is-balance" onClick={() => setMode('balance')}>
            <WalletCards size={23} /><span><strong>确认现在有多少钱</strong><small>{currentBalance === null ? '用一个数字建立现金起点' : `上次确认 ${MONEY.format(currentBalance)}`}</small></span><ChevronRight size={18} />
          </button>
          <button type="button" className="v12-path is-language" onClick={() => setMode('language')}>
            <Keyboard size={23} /><span><strong>说一句发生了什么</strong><small>先整理成事实，确认后才会写入</small></span><ChevronRight size={18} />
          </button>
          <button type="button" className="v12-precise-link" onClick={() => setMode('precise')}><PencilLine size={16} /> 精确修改 <ChevronRight size={16} /></button>
        </section>
      </div> : null}

      {mode === 'balance' ? <form className="v12-balance-form" onSubmit={submitBalance}>
        <button type="button" className="v12-back" onClick={() => setMode('home')}><ArrowLeft size={16} /> 返回</button>
        <p>这里填写的是 Buffer 当前用于计算未来的实际可用现金总额。</p>
        <label><span>现在实际可以使用的现金是多少？</span><div className="v12-money-input"><b>¥</b><input autoFocus required inputMode="decimal" type="number" min="0" step="0.01" value={balance} onChange={(event) => setBalance(event.target.value)} placeholder="0.00" /></div></label>
        <aside><CircleDollarSign size={17} /><div><span>上次确认</span><strong>{currentBalance === null ? '尚未确认' : MONEY.format(currentBalance)}</strong><small>{context.balanceConfirmedAt ? new Date(context.balanceConfirmedAt).toLocaleString('zh-CN') : '没有需要解释的差额'}</small></div></aside>
        <small className="v12-boundary-note"><ShieldCheck size={15} /> 不用逐个填写银行、微信、支付宝或现金，也不用解释中间差额。</small>
        <footer><button type="button" onClick={() => setMode('home')}>取消</button><button type="submit" className="is-primary">确认这个余额</button></footer>
      </form> : null}

      {mode === 'language' ? <form className="v12-language-form" onSubmit={(event) => { event.preventDefault(); parseText(message); }}>
        <button type="button" className="v12-back" onClick={() => setMode('home')}><ArrowLeft size={16} /> 返回</button>
        <p>写下已经发生或已经确定的变化。系统只整理事实，不会直接修改现实。</p>
        <label><span className="sr-only">发生了什么</span><textarea autoFocus required value={message} onChange={(event) => setMessage(event.target.value)} placeholder="今天交了1500房租，现在还有4200" rows="5" /></label>
        <div className="v12-language-actions">
          <button type="button" aria-label="使用语音输入" className={voiceState === 'listening' ? 'is-listening' : ''} onClick={startVoice}><Mic size={18} /> {voiceState === 'listening' ? '正在听' : '用语音说'}</button>
          <button type="submit" className="is-primary" disabled={parsing || !message.trim()}>{parsing ? '正在整理' : '整理成事实'} <ChevronRight size={17} /></button>
        </div>
        <small className="v12-parser-note">必要文字会发送到模型服务整理。完整历史、备份和无关条件不会发送。只有你确认后，变化才会进入 Reality。</small>
        {parseResult?.status === 'clarification' ? <section className="v12-clarification"><strong>{parseResult.clarifications?.[0]?.question || '还需要确认一个事实。'}</strong>{parseResult.clarifications?.[0]?.choices?.length ? <div>{parseResult.clarifications[0].choices.map((choice) => <button type="button" key={choice.id} onClick={() => { setParseResult({ status: 'candidates', candidates: [{ type: 'existing_occurrence_confirmation', occurrenceId: choice.id, name: choice.conditionName }] }); setMode('confirm'); }}>{choice.conditionName}<small>{formatDate(choice.expectedDate)} · {choice.expectedAmount == null ? '金额待确认' : MONEY.format(choice.expectedAmount)}</small></button>)}</div> : null}</section> : null}
        {parseResult?.status === 'scenario' ? <section className="v12-scenario-boundary"><strong>这是一个模拟变化</strong><p>它没有进入现实。你可以到“未来”里模拟。</p><button type="button" onClick={() => { onClose(); onNavigate('future'); }}>在未来中模拟</button></section> : null}
        {parseResult?.status === 'unsupported' ? <section className="v12-parser-error"><strong>没有找到可确认的现实变化</strong><p>原句还在，你可以改得更具体，或直接确认余额。</p><div><button type="button" onClick={() => setMode('balance')}>确认余额</button><button type="button" onClick={() => setMode('precise')}>精确修改</button></div></section> : null}
        {parseResult?.status === 'error' ? <section className="v12-parser-error"><strong>暂时不能自动整理这句话</strong><p>原句已保留：{parseResult.originalText || message}</p><p>余额确认和已有事项仍然可用。</p><div><button type="button" onClick={() => parseText(message, parseSource)}><RefreshCw size={16} /> 重新解析</button><button type="button" onClick={() => setMode('precise')}>精确修改</button><button type="button" onClick={() => setMode('balance')}>确认余额</button></div></section> : null}
      </form> : null}

      {mode === 'confirm' && parseResult?.candidates ? <section className="v12-confirm-surface">
        <button type="button" className="v12-back" onClick={() => setMode('language')}><ArrowLeft size={16} /> 修改原句</button>
        <p>请看清这些事实。现在还没有写入现实。</p>
        {parseResult.status === 'partial' ? <aside className="v12-partial-note">已整理出明确部分，下面只保留一个还需要确认的问题。</aside> : null}
        {parseResult.scenarioItems?.length ? <aside className="v12-scenario-note">假设部分没有进入现实；这次只确认下面已经发生或已经确定的事实。</aside> : null}
        <div className="v12-candidate-list">
          {parseResult.candidates.map((candidate, index) => <article key={`${candidate.type}-${index}`} className="v12-candidate" data-skin-region="card">
            <div><span>{CANDIDATE_LABELS[candidate.type] || '现实变化'}</span><strong>{candidate.name || CANDIDATE_LABELS[candidate.type]}</strong>{candidate.occurrenceId || candidate.conditionId ? <small>匹配到已有内容</small> : null}</div>
            <div className="v12-candidate-value">
              {Number.isFinite(candidate.amount) ? <label><span className="sr-only">金额</span><input aria-label={`${candidate.name || CANDIDATE_LABELS[candidate.type]}金额`} type="number" min="0" step="0.01" value={candidate.amount} onChange={(event) => updateCandidate(index, { amount: Number(event.target.value) })} /></label> : null}
              <b>{candidateAmount(candidate)}</b>
              <small>{candidate.startDate ? `从 ${candidate.startDate} 开始` : formatDate(candidate.actualDate || candidate.occurredAt || asOf)}{candidate.frequency === 'monthly' ? ' · 每月' : ''}</small>
            </div>
            <button type="button" className="v12-remove" aria-label={`移除${candidate.name || '这项变化'}`} onClick={() => removeCandidate(index)}><Trash2 size={16} /></button>
          </article>)}
        </div>
        {parseResult.clarifications?.length ? <section className="v12-inline-clarification"><strong>{parseResult.clarifications[0].question}</strong>{parseResult.clarifications[0].choices?.length ? <div>{parseResult.clarifications[0].choices.map((choice) => <span key={choice.id}>{choice.conditionName} · {formatDate(choice.expectedDate)}</span>)}</div> : <small>这部分不会进入本次确认。</small>}</section> : null}
        <footer><span>{parseResult.candidates.length} 项变化会一起确认，任何一项无效都不会写入。</span><button type="button" className="is-primary" disabled={!parseResult.candidates.length} onClick={() => commit(parseResult.candidates, parseSource)}>确认这些变化</button></footer>
      </section> : null}

      {mode === 'precise' ? <section className="v12-precise-surface">
        <button type="button" className="v12-back" onClick={() => setMode('home')}><ArrowLeft size={16} /> 返回</button>
        <p>只有需要逐项修改时才进入这里。</p>
        <button type="button" onClick={() => setMode('balance')}><WalletCards size={20} /><span><strong>当前余额</strong><small>只确认一个实际可用现金总额</small></span><ChevronRight size={17} /></button>
        <button type="button" onClick={() => { onClose(); onNavigate('conditions'); }}><RefreshCw size={20} /><span><strong>固定收入、固定支出与未来事项</strong><small>修改持续影响未来的规律</small></span><ChevronRight size={17} /></button>
        <button type="button" onClick={() => { onClose(); onNavigate('records'); }}><PencilLine size={20} /><span><strong>已有变化记录</strong><small>查看过去本人确认的事实</small></span><ChevronRight size={17} /></button>
      </section> : null}

      {mode === 'complete' ? <section className="v12-complete-surface">
        <div className="v12-complete-mark"><Check size={25} /></div>
        <span>现实已更新</span>
        <strong>{complete?.balanceAfter == null ? '当前余额保持未知' : MONEY.format(complete.balanceAfter)}</strong>
        <p>未来已重新计算</p>
        <div><button type="button" onClick={() => { onClose(); onNavigate('now'); }}>查看现在</button><button type="button" className="is-primary" onClick={() => { onClose(); onNavigate('future'); }}>查看未来</button></div>
      </section> : null}
    </aside>
  </div>;
}
