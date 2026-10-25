'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {Hand, Random, advice, COACH_VERSION} = require('../engine.js');
const fixture = require('../tests/fixtures/coach-decisions.json');
function observationHand(observation) {
  return Object.assign(Object.create(Hand.prototype), JSON.parse(JSON.stringify(observation)), {pending: new Set(observation.pending)});
}
function checkExpectation(expected, report) {
  const failures=[];
  for(const action of expected.required || []) if(!report.accepted.includes(action)) failures.push(`missing accepted ${action}`);
  for(const action of expected.forbidden || []) if(report.accepted.includes(action)) failures.push(`incorrectly accepts ${action}`);
  if(expected.preferred && expected.preferred!==report.action) failures.push(`preferred ${report.action}, expected ${expected.preferred}`);
  if(expected.calibration!==undefined && !!report.value_bet_evidence!==expected.calibration) failures.push('incorrect flop-calibration scope');
  if(expected.target_bb && !(report.target>=expected.target_bb[0]&&report.target<=expected.target_bb[1])) failures.push(`target ${report.target} outside expected range`);
  return failures;
}
function evaluateCoach(out = 'evals/coach') {
  const results = fixture.cases.map(item => {
    const hand = observationHand(item.observation);
    const report = advice(hand, hand.actor, 320, new Random(10000 + item.hand));
    return {id: item.id, hand: item.hand, concern: item.review,
      action: report.action, target: report.target, accepted: report.accepted, equity: report.equity, confidence: report.confidence,
      ...(report.policy ? {policy:report.policy,graded:report.graded,context:report.context} : {}),
      reason: report.reason, explanation: report.explanation, value_bet_evidence:report.value_bet_evidence, action_values: report.action_values, review_evidence: report.review_evidence, range_sensitivity: report.range_sensitivity};
  });
  const checks=fixture.cases.filter(item=>item.expectation).flatMap(item=>[13,71,2026].map(seed=>{
    const hand=observationHand(item.observation),report=advice(hand,hand.actor,320,new Random(seed));
    return {id:item.id,seed,action:report.action,accepted:report.accepted,target:report.target,
      failures:checkExpectation(item.expectation,report),value_bet_evidence:report.value_bet_evidence};
  }));
  fs.mkdirSync(out, {recursive: true});
  fs.writeFileSync(path.join(out, 'review-case-results.json'), JSON.stringify({model: COACH_VERSION, note: 'Public decision cases, not solver labels. Action changes alone do not prove correctness.', results, checks}, null, 2) + '\n');
  console.log(JSON.stringify(results.map(r => ({id:r.id,hand:r.hand,action:r.action,target:r.target,accepted:r.accepted,equity:r.equity})), null, 2));
  console.log(`Postflop calibration: ${checks.filter(c=>!c.failures.length).length}/${checks.length} passed.`);
  return {results,checks};
}
if (require.main === module) {
  const out = process.argv[2] || 'evals/coach';
  const evaluated=evaluateCoach(out);
  const failures=evaluated.checks.filter(c=>c.failures.length);
  if(failures.length){console.error(JSON.stringify(failures,null,2));process.exitCode=1;}
  const {evaluatePreflop} = require('./evaluate-preflop.cjs');
  const result = evaluatePreflop(out);
  console.log(`Preflop: ${result.passed}/${result.runs} passed (${result.cases} cases).`);
  if (result.failed) {
    console.error(JSON.stringify(result.results.filter(r => r.failures.length), null, 2));
    process.exitCode = 1;
  }
}
module.exports = {observationHand, evaluateCoach, checkExpectation};
