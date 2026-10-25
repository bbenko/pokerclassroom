'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {Hand, Random, DECK, advice} = require('../engine.js');
const fixture = require('../tests/fixtures/preflop-decisions.json');
const seats = {BTN:0, SB:1, BB:2, UTG:3, HJ:4, CO:5};
function scenarioHand(item) {
  const stacks = Array(6).fill(200);
  for (const [position, bb] of Object.entries(item.stacks || {})) stacks[seats[position]] = bb * 2;
  const h = new Hand(new Random(71), 0, stacks), hero = seats[item.hero];
  const hole = item.cards.split(' '), rest = DECK.filter(c => !hole.includes(c));
  h.holes = h.players.map((_, i) => i === hero ? hole : [rest.pop(), rest.pop()]);
  h.deck = rest;
  for (const [position, action, target] of item.actions || []) {
    for (let steps = 0; h.actor !== seats[position]; steps++) {
      assert.ok(steps < 6 && !h.done && h.street === 0, `Invalid scenario ${item.id}`);
      h.action('fold');
    }
    h.action(action, target === undefined ? null : target * 2);
  }
  for (let steps = 0; h.actor !== hero; steps++) {
    assert.ok(steps < 6 && !h.done && h.street === 0, `Invalid hero decision ${item.id}`);
    h.action('fold');
  }
  h.assert_invariants();
  return h;
}
function checkReport(item, r, h) {
  const failures = [];
  const detail = r.explanation;
  if (!detail || !detail.situation || !detail.why) failures.push('missing decision explanation');
  else {
    const expected = r.graded === false ? [] : r.accepted.filter(a=>a!==r.action).sort();
    if (JSON.stringify(detail.alternatives.map(a=>a.action).sort()) !== JSON.stringify(expected)) failures.push('explanation alternatives do not match accepted actions');
    if (r.graded === false && !detail.coverage) failures.push('missing unsupported-coverage reason');
    if (r.action === 'raise' && r.graded !== false && !detail.sizing) failures.push('missing sizing explanation');
  }
  if (r.action !== item.action) failures.push(`preferred ${r.action}, expected ${item.action}`);
  for (const a of item.required || []) if (!r.accepted.includes(a)) failures.push(`missing accepted ${a}`);
  for (const a of item.forbidden || []) if (r.accepted.includes(a)) failures.push(`incorrectly accepts ${a}`);
  if (item.node && r.context?.node !== item.node) failures.push(`node ${r.context?.node}, expected ${item.node}`);
  if (item.graded !== undefined && (r.graded !== false) !== item.graded) failures.push('incorrect coverage/grading');
  if (item.target && !(r.target >= item.target[0] && r.target <= item.target[1])) failures.push(`size ${r.target} outside ${item.target}`);
  const legal = h.legal();
  if (!r.accepted.includes(r.action)) failures.push('preferred action not accepted');
  if (r.action === 'raise' && (!legal.raise || r.target < legal.min_to || r.target > legal.max_to || !Number.isInteger(r.target * 2))) failures.push('illegal size');
  if (r.accepted.some(a => a === 'raise' ? !legal.raise : a === 'check' ? !legal.check : !legal.fold)) failures.push('illegal accepted action');
  return failures;
}
function evaluatePreflop(out) {
  const results = fixture.cases.flatMap(item => [11, 90421, 310003].map(seed => {
    const h = scenarioHand(item), r = advice(h, h.actor, 160, new Random(seed));
    return {id:item.id, split:item.split || 'development', seed, action:r.action, accepted:r.accepted, target:r.target,
      graded:r.graded !== false, context:r.context, explanation:r.explanation, failures:checkReport(item,r,h)};
  }));
  const summary = {policy:'positional-preflop-v1', cases:fixture.cases.length, runs:results.length,
    passed:results.filter(r => !r.failures.length).length, failed:results.filter(r => r.failures.length).length,
    note:fixture.note, results};
  if (out) {fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'preflop-results.json'),JSON.stringify(summary,null,2)+'\n');}
  return summary;
}
if (require.main === module) {
  const r = evaluatePreflop(process.argv[2] || 'evals/preflop');
  console.log(JSON.stringify({...r,results:r.results.filter(x=>x.failures.length)},null,2));
  if(r.failed) process.exitCode=1;
}
module.exports={scenarioHand,checkReport,evaluatePreflop};
