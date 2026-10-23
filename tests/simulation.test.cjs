'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {Hand, Random, NAMES, format_history} = require('../engine.js');

test('exported betting amounts replay legally and reproduce stacks, boards and pots', () => {
  for (let seed = 0; seed < 100; seed++) {
    const h = new Hand(new Random(seed), seed % 6, [200, 50, 80, 150, 200, 300]);
    const rng = new Random(seed + 20);
    while (!h.done) {
      const l = h.legal();
      const choices = l.check ? ['check'] : ['fold', 'call'];
      if (l.raise) choices.push('raise', 'allin');
      const kind = choices[rng.int(choices.length)];
      h.action(kind, kind === 'raise' ? l.min_to * 2 : null);
    }
    const text = format_history(h, seed + 1);
    const replay = new Hand(new Random(seed), seed % 6, h.starting_stacks);
    for (const line of text.split('\n')) {
      const m = line.match(/^(\w+): (folds|checks|calls|bets|raises)(?: \$([\d.]+))?(?: to \$([\d.]+))?(?: and is all-in)?$/);
      if (!m) continue;
      assert.equal(NAMES[replay.actor], m[1]);
      const kind = {folds: 'fold', checks: 'check', calls: 'call', bets: 'raise', raises: 'raise'}[m[2]];
      if (m[2] === 'calls') assert.equal(+m[3], replay.legal().call);
      if (m[2] === 'raises') assert.equal(+m[3], +m[4] - replay.current_bet / 2);
      replay.action(kind, kind === 'raise' ? +(m[4] || m[3]) * 2 : null);
    }
    assert.ok(replay.done);
    assert.deepEqual(replay.players, h.players);
    assert.deepEqual(replay.board, h.board);
    assert.deepEqual(replay.awards, h.awards);
    assert.match(text, new RegExp(`Total pot \\$${(h.settled_pot / 2).toFixed(2).replace('.', '\\.')} \\| Rake \\$0.00`));
    assert.equal(format_history(h, seed + 1), text);
  }
});
test('export rejects unfinished hands', () => {
  assert.throws(() => format_history(new Hand(new Random(1)), 1), /completed/);
});
