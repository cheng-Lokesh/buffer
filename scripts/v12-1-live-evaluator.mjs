import { resolveNaturalDateExpression } from '../src/v12-1-reality-parser.js';

function includesAll(actual, expected) {
  const pool = [...actual];
  return expected.every((value) => {
    const index = pool.indexOf(value);
    if (index < 0) return false;
    pool.splice(index, 1);
    return true;
  });
}

export function evaluateLiveParserCase(testCase, interpretation, resolved, latencyMs, context = {}) {
  const expected = testCase.expect;
  const types = interpretation.items.map((item) => item.semanticType);
  const modelAmounts = interpretation.items.filter((item) => Number.isFinite(item.amount)).map((item) => item.amount);
  const dates = interpretation.items.map((item) =>
    resolveNaturalDateExpression(`${item.dateExpression || ''} ${item.evidenceText || ''}`, context.currentDate) || item.resolvedDate
  ).filter(Boolean);
  const scenarioCount = resolved.scenarioItems.length;
  const candidateTypes = resolved.candidates.map((item) => item.type);
  const candidateAmounts = resolved.candidates.filter((item) => Number.isFinite(item.amount)).map((item) => item.amount);
  const amounts = [...modelAmounts];
  candidateAmounts.forEach((amount) => { if (!amounts.includes(amount)) amounts.push(amount); });
  const occurrenceExpected = expected.resolvedTypes?.some((type) => type.startsWith('existing_occurrence_'));
  const conditionExpected = expected.resolvedTypes?.some((type) => ['condition_update', 'condition_end', 'condition_pause'].includes(type));
  const occurrenceResolved = !occurrenceExpected || includesAll(candidateTypes, expected.resolvedTypes);
  const conditionResolved = !conditionExpected || includesAll(candidateTypes, expected.resolvedTypes);
  const safelyClarified = Boolean((expected.clarification || expected.clarificationAllowed || expected.clarificationRequired) && resolved.clarifications.length);
  const semanticNegationError = testCase.category === 'negation' && expected.forbiddenTypes?.some((type) => types.includes(type));
  const expectedCandidateMax = Number.isInteger(expected.candidateMax) ? expected.candidateMax : (expected.types || []).length;
  const extraRealityCandidate = resolved.candidates.length > expectedCandidateMax;
  const inventedAmount = candidateAmounts.some((amount) => !(expected.amounts || []).includes(amount));
  const modelAmountMiss = !includesAll(modelAmounts, expected.amounts || []) && includesAll(amounts, expected.amounts || []);

  const flags = {
    wrongAmount: !includesAll(amounts, expected.amounts || []),
    inventedAmount,
    modelAmountMiss,
    wrongDate: !includesAll(dates, expected.dates || []),
    wrongDirection: false,
    wrongConditionMatch: Boolean(conditionExpected && !conditionResolved && resolved.candidates.length > 0),
    wrongOccurrenceMatch: Boolean(occurrenceExpected && !occurrenceResolved && resolved.candidates.length > 0),
    occurrenceResolutionMiss: Boolean(occurrenceExpected && !occurrenceResolved && !safelyClarified),
    conditionResolutionMiss: Boolean(conditionExpected && !conditionResolved && !safelyClarified),
    scenarioToReality: testCase.category === 'scenario' && resolved.candidates.length > 0,
    negationSemanticError: semanticNegationError,
    negationToPositive: testCase.category === 'negation' && resolved.candidates.length > 0,
    extraRealityCandidate,
    hallucinatedFact: extraRealityCandidate,
    providerDirectWrite: false,
    balanceDuplicate: false
  };

  const statusOk = expected.statusAny.includes(resolved.status);
  const scenarioOk = scenarioCount >= (expected.scenarioMin || 0);
  const clarificationOk = !expected.clarificationRequired || interpretation.clarification !== null || resolved.clarifications.length > 0;
  const resolvedOk = !expected.resolvedTypes || includesAll(candidateTypes, expected.resolvedTypes) || safelyClarified;
  const typesOk = expected.resolvedTypes && resolvedOk
    ? true
    : expected.typesAny ? types.some((type) => expected.typesAny.includes(type)) : includesAll(types, expected.types || []);
  const unsafe = [
    flags.inventedAmount,
    flags.wrongDirection,
    flags.wrongConditionMatch,
    flags.wrongOccurrenceMatch,
    flags.scenarioToReality,
    flags.negationToPositive,
    flags.hallucinatedFact,
    flags.extraRealityCandidate,
    flags.providerDirectWrite,
    flags.balanceDuplicate
  ].some(Boolean);
  const correct = statusOk && typesOk && scenarioOk && clarificationOk && resolvedOk
    && !flags.wrongAmount && !flags.wrongDate && !flags.occurrenceResolutionMiss
    && !flags.conditionResolutionMiss && !flags.negationSemanticError && !unsafe;

  return {
    id: testCase.id,
    category: testCase.category,
    status: interpretation.status,
    verdict: correct
      ? (interpretation.status === 'clarification' || resolved.clarifications.length
          ? 'CORRECT_WITH_CLARIFICATION'
          : 'CORRECT')
      : interpretation.status === 'unsupported' ? 'UNSUPPORTED' : 'WRONG_PARSE',
    latencyMs: Math.round(latencyMs),
    itemCount: interpretation.items.length,
    scenarioCount,
    candidateCount: resolved.candidates.length,
    clarificationCount: resolved.clarifications.length,
    semanticTypes: types,
    modelAmounts,
    amounts,
    resolvedDates: dates,
    realityStatuses: interpretation.items.map((item) => item.realityStatus),
    candidateTypes,
    flags,
    unsafe
  };
}
