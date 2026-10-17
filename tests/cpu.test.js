import { test, assert } from './lib.js';
import { parseCards, seededRandom } from '../js/core/cards.js';
import { Hand, Table } from '../js/core/game.js';
import { decide } from '../js/ai/cpu.js';

const players = (...stacks) => stacks.map((s, i) => ({ id: 'p' + i, name: 'P' + i, stack: s }));

test('CPU: 常にルール上可能な行動を選び、CPU同士で最後まで対戦できる', () => {
  const rng = seededRandom(3);
  let hands = 0;
  for (let game = 0; game < 20; game++) {
    const table = new Table({ players: players(2000, 2000), smallBlind: 10, bigBlind: 20, rng });
    for (let k = 0; k < 50; k++) {
      const h = table.startHand();
      if (!h) break;
      while (!h.isComplete) {
        const id = h.currentPlayer.id;
        h.act(decide(h.viewFor(id), { rng, iterations: 100 })); // 不正な行動なら act が例外を投げる
      }
      table.settleHand();
      hands++;
    }
    assert.equal(table.players[0].stack + table.players[1].stack, 4000);
  }
  assert.ok(hands > 200, `ハンド数 ${hands}`);
});

test('CPU: AAはプリフロップで降りない', () => {
  for (let seed = 0; seed < 50; seed++) {
    const h = new Hand({
      players: players(5000, 5000),
      buttonIndex: 0,
      smallBlind: 50,
      bigBlind: 100,
      presetHoles: [parseCards('As Ah'), parseCards('7c 2d')],
    });
    const a = decide(h.viewFor('p0'), { rng: seededRandom(seed) });
    assert.ok(a.type !== 'fold');
  }
});

test('CPU: 72o は大きなレイズに降りる', () => {
  const h = new Hand({
    players: players(5000, 5000),
    buttonIndex: 0,
    smallBlind: 50,
    bigBlind: 100,
    presetHoles: [parseCards('Ks Kh'), parseCards('7c 2d')],
  });
  h.act({ type: 'raise', amount: 1000 });
  for (let seed = 0; seed < 20; seed++) {
    assert.equal(decide(h.viewFor('p1'), { rng: seededRandom(seed) }).type, 'fold');
  }
});

test('CPU: ナッツを持っていれば降りない', () => {
  const h = new Hand({
    players: players(5000, 5000),
    buttonIndex: 0,
    smallBlind: 50,
    bigBlind: 100,
    presetHoles: [parseCards('As Ks'), parseCards('2c 3d')],
    presetBoard: parseCards('Qs Js Ts 4h 9c'),
  });
  h.act({ type: 'call' });
  h.act({ type: 'raise', amount: 400 });
  h.act({ type: 'call' });
  // フロップ: p1 が大きくベット
  h.act({ type: 'raise', amount: 3000 });
  for (let seed = 0; seed < 10; seed++) {
    const a = decide(h.viewFor('p0'), { rng: seededRandom(seed), iterations: 200 });
    assert.ok(a.type === 'call' || a.type === 'raise');
  }
});
