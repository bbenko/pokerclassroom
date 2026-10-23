'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {Hand, Random, advice, COACH_VERSION} = require('../engine.js');
const fixture = require('../tests/fixtures/coach-decisions.json');
function observationHand(observation) {
  return Object.assign(Object.create(Hand.prototype), JSON.parse(JSON.stringify(observation)), {pending: new Set(observation.pending)});
}
function evaluateCoach(out = 'evals/coach') {
  const results = fixture.cases.map(item => {
    const hand = observationHand(item.observation);
    const report = advice(hand, hand.actor, 320, new Random(10000 + item.hand));
    return {id: item.id, hand: item.hand, concern: item.review,
      action: report.action, target: report.target, accepted: report.accepted, equity: report.equity, confidence: report.confidence,
      reason: report.reason, action_values: report.action_values, range_sensitivity: report.range_sensitivity};
  });
  fs.mkdirSync(out, {recursive: true});
  fs.writeFileSync(path.join(out, 'review-case-results.json'), JSON.stringify({model: COACH_VERSION, note: 'Public decision cases, not solver labels. Action changes alone do not prove correctness.', results}, null, 2) + '\n');
  console.log(JSON.stringify(results.map(r => ({id:r.id,hand:r.hand,action:r.action,target:r.target,accepted:r.accepted,equity:r.equity})), null, 2));
  return results;
}
if (require.main === module) evaluateCoach(process.argv[2]);
module.exports = {observationHand, evaluateCoach};
