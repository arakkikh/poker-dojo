import { test, assert } from './lib.js';
import { parseCards, seededRandom, fullDeck } from '../js/core/cards.js';
import { scoreHand } from '../js/core/evaluator.js';
import { estimateEquity, potOdds } from '../js/core/equity.js';
import { chenScore, handNotation } from '../js/ai/preflop.js';

const eq = (hole, board = '', opponents = 1) =>
  estimateEquity({
    hole: parseCards(hole),
    board: board ? parseCards(board) : [],
    opponents,
    iterations: 20000,
    rng: seededRandom(99),
  });
const near = (actual, expected, tol, msg) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg}: 期待値 ${expected}±${tol} / 実際 ${actual.toFixed(3)}`);

test('勝率: 有名なプリフロップの勝率（対ランダム1人）', () => {
  near(eq('As Ah').equity, 0.852, 0.015, 'AA');
  near(eq('Ks Kh').equity, 0.824, 0.015, 'KK');
  near(eq('As Ks').equity, 0.670, 0.015, 'AKs');
  near(eq('7s 2h').equity, 0.346, 0.015, '72o');
});

test('勝率: 相手が増えると下がる', () => {
  near(eq('As Ah', '', 3).equity, 0.64, 0.02, 'AA 対3人');
});

test('勝率: ナッツ（最強の手）なら100%', () => {
  const r = eq('As Ks', 'Qs Js Ts 2c 3d');
  assert.equal(r.equity, 1);
  assert.equal(r.win, 1);
});

test('勝率: ボードだけで役が完成していると引き分けが多い', () => {
  const r = eq('2c 3d', 'As Ks Qs Js Ts');
  assert.equal(r.tie, 1);
  assert.equal(r.equity, 0.5);
});

test('勝率: リバーで全数え上げした正確な値とモンテカルロが一致', () => {
  for (const [hole, board] of [
    ['As 5s', 'Ks 8s 2d 3c 9h'],
    ['Td Tc', 'Ah 7h 4s Qc Ts'],
    ['8c 7c', '6d 5h 2s Kh Kd'],
  ]) {
    const h = parseCards(hole);
    const b = parseCards(board);
    const known = new Set([...h, ...b]);
    const rest = fullDeck().filter((c) => !known.has(c));
    const my = scoreHand([...h, ...b]);
    let exact = 0;
    let combos = 0;
    for (let i = 0; i < rest.length; i++)
      for (let j = i + 1; j < rest.length; j++) {
        const opp = scoreHand([rest[i], rest[j], ...b]);
        exact += my > opp ? 1 : my === opp ? 0.5 : 0;
        combos++;
      }
    assert.equal(combos, 990);
    near(eq(hole, board).equity, exact / combos, 0.01, hole + ' / ' + board);
  }
});

test('ポットオッズ', () => {
  assert.equal(potOdds(0, 100), 0);
  assert.equal(potOdds(50, 100), 50 / 150);
  assert.equal(potOdds(100, 100), 0.5);
});

test('スターティングハンド: 表記とチェン点数', () => {
  assert.equal(handNotation(...parseCards('Ks As')), 'AKs');
  assert.equal(handNotation(...parseCards('2h 7c')), '72o');
  assert.equal(handNotation(...parseCards('Qh Qc')), 'QQ');
  assert.equal(chenScore(...parseCards('As Ah')), 20);
  assert.equal(chenScore(...parseCards('As Ks')), 12);
  assert.equal(chenScore(...parseCards('Ah Kc')), 10);
  assert.equal(chenScore(...parseCards('2h 2c')), 5);
  assert.equal(chenScore(...parseCards('Js Ts')), 9);
  assert.equal(chenScore(...parseCards('7h 2c')), -1);
});
