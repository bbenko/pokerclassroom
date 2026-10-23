'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {Trainer, format_history} = require('../engine.js');

function simulate({count = 1000, seed = 9182, samples = 160, out = 'evals/latest'} = {}) {
  assert.ok(Number.isInteger(count) && count > 0);
  assert.ok(Number.isInteger(seed) && seed >= 0 && seed <= 4294967295);
  assert.ok(Number.isInteger(samples) && samples >= 1 && samples <= 5000);
  // Never silently replace a previous evaluation.
  fs.mkdirSync(out, {recursive: false});
  const trainer = new Trainer(seed, samples);
  const summary = {count, seed, samples, hero_policy: 'coach recommendation', opponent_policy: 'equity-based simulated opponents', stakes: 'synthetic $0.50/$1.00; no rake', stacks: 'alternating equal/mixed, reset each hand', showdowns: 0, side_pot_hands: 0, split_pot_hands: 0, actions: 0, hero_profit_bb: 0, checks: {completed: 0, chip_and_deck_conservation: 0, payouts_balanced: 0}};
  for (let number = 1; number <= count; number++) {
    trainer.new_hand(number % 2 ? 'equal' : 'mixed');
    let decisions = 0;
    while (!trainer.hand.done && decisions++ < 500) trainer.act(trainer.pending.action, trainer.pending.target);
    const h = trainer.hand;
    assert.ok(h.done, `Hand ${number} did not finish`);
    h.assert_invariants();
    assert.equal(h.awards.reduce((n, a) => n + a.amount, 0), h.settled_pot / 2);
    for (const award of h.awards) assert.equal(Object.values(award.payouts).reduce((a, b) => a + b, 0), award.amount);
    summary.checks.completed++; summary.checks.chip_and_deck_conservation++; summary.checks.payouts_balanced++;
    summary.showdowns += Number(h.showdown);
    summary.side_pot_hands += Number(h.awards.length > 1);
    summary.split_pot_hands += Number(h.awards.some(a => a.winners.length > 1));
    summary.actions += h.log.filter(s => /^(\w+) (fold|check|call|bet|raise to)[ .]/.test(s)).length;
    summary.hero_profit_bb += (h.players[0].stack - h.starting_stacks[0]) / 2;
    fs.writeFileSync(path.join(out, `hand-${String(number).padStart(6, '0')}.txt`), format_history(h, number));
    if (number % 100 === 0) console.log(`Completed ${number}/${count} hands`);
  }
  summary.note = 'Consistency checks only; following the coach is not independent validation of strategy. PokerStars-style synthetic histories; third-party importer compatibility is unverified. Fixed timestamp for reproducibility.';
  fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  return summary;
}
if (require.main === module) {
  const [count = '1000', seed = '9182', out = 'evals/latest'] = process.argv.slice(2);
  fs.mkdirSync(path.dirname(out), {recursive: true});
  console.log(JSON.stringify(simulate({count: Number(count), seed: Number(seed), out}), null, 2));
}
module.exports = {simulate};
