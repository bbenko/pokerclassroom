'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {best_five,evaluate,compare}=require('../engine.js');
test('winning five selects trips with the two best kickers',()=>{
  const cards='Qc Qd Kh 2c 3s Qs 6s'.split(' ');
  const five=best_five(cards);
  assert.equal(five.length,5);
  assert.equal(new Set(five).size,5);
  assert.ok(!five.includes('2c')&&!five.includes('3s'));
  assert.equal(compare(evaluate(five),evaluate(cards)),0);
});
test('board-only winner leaves both hole cards unused',()=>{
  const board='As Ks Qs Js Ts'.split(' ');
  assert.deepEqual(best_five([...board,'2c','3d']),board);
});
test('wheel straight includes ace and excludes higher kickers',()=>{
  const five=best_five('Ac 2d 3h 4s 5c Kh Qh'.split(' '));
  assert.deepEqual(evaluate(five),[4,5]);
  assert.ok(!five.includes('Kh')&&!five.includes('Qh'));
});
