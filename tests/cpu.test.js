import { test, assert } from './lib.js';
import { parseCards, seededRandom, shuffledDeck } from '../js/core/cards.js';
import { Hand, Table } from '../js/core/game.js';
import { decide, countOuts } from '../js/ai/cpu.js';
import { PERSONALITIES, LEVELS, createCpu } from '../js/ai/personalities.js';
import { createMemory, observeHand, tendencies } from '../js/ai/memory.js';
import { estimateEquity } from '../js/core/equity.js';
import { topRange, handPercentile } from '../js/ai/preflop.js';

const players = (...stacks) => stacks.map((s, i) => ({ id: 'p' + i, name: 'P' + i, stack: s }));
const LEVEL_IDS = Object.keys(LEVELS);
const PERSONALITY_IDS = Object.keys(PERSONALITIES);

test('CPU: 全ての強さ×性格で、6人卓を最後まで不正なく対戦できる', () => {
  const rng = seededRandom(3);
  let hands = 0;
  for (const level of LEVEL_IDS) {
    const cpus = PERSONALITY_IDS.concat(PERSONALITY_IDS.slice(0, 2)).map((pid, i) => ({ id: 'c' + i, name: 'C' + i, stack: 1000, pid }));
    const table = new Table({ players: cpus, smallBlind: 10, bigBlind: 20, rng });
    const memory = createMemory();
    for (let k = 0; k < 60; k++) {
      const h = table.startHand();
      if (!h) break;
      while (!h.isComplete) {
        const id = h.currentPlayer.id;
        const pid = cpus.find((c) => c.id === id).pid;
        const a = decide(h.viewFor(id), { level, personality: pid, memory, rng, iterations: 60 });
        assert.ok(typeof a.reason === 'string' && a.reason.length > 0, '理由が付いている');
        h.act(a); // 不正な行動なら例外
      }
      observeHand(memory, h);
      table.settleHand();
      hands++;
    }
    assert.equal(table.players.reduce((s, p) => s + p.stack, 0), 6000);
  }
  assert.ok(hands > 100, `ハンド数 ${hands}`);
});

test('CPU: AAはプリフロップで降りない（全ての強さ×性格）', () => {
  for (const level of LEVEL_IDS)
    for (const personality of PERSONALITY_IDS)
      for (let seed = 0; seed < 10; seed++) {
        const h = new Hand({
          players: players(5000, 5000),
          buttonIndex: 0,
          smallBlind: 50,
          bigBlind: 100,
          presetHoles: [parseCards('Ks Kh'), parseCards('As Ah')],
        });
        h.act({ type: 'allin' });
        const a = decide(h.viewFor('p1'), { level, personality, rng: seededRandom(seed) });
        assert.ok(a.type !== 'fold', `${level}/${personality}`);
      }
});

test('CPU: 72o は大きなレイズに降りる（全ての強さ×性格）', () => {
  for (const level of LEVEL_IDS)
    for (const personality of PERSONALITY_IDS) {
      const h = new Hand({
        players: players(5000, 5000),
        buttonIndex: 0,
        smallBlind: 50,
        bigBlind: 100,
        presetHoles: [parseCards('Ks Kh'), parseCards('7c 2d')],
      });
      h.act({ type: 'raise', amount: 1000 });
      for (let seed = 0; seed < 10; seed++) {
        assert.equal(decide(h.viewFor('p1'), { level, personality, rng: seededRandom(seed) }).type, 'fold', `${level}/${personality}`);
      }
    }
});

test('CPU: ナッツを持っていれば降りない', () => {
  for (const level of LEVEL_IDS) {
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
    h.act({ type: 'raise', amount: 3000 });
    for (let seed = 0; seed < 10; seed++) {
      const a = decide(h.viewFor('p0'), { level, rng: seededRandom(seed), iterations: 200 });
      assert.ok(a.type === 'call' || a.type === 'raise', level);
    }
  }
});

/** 先頭で行動する（誰も参加していない）場面で、ランダムな手に対する参加率・レイズ率を測る */
function preflopRates(personality, level = 'intermediate') {
  const rng = seededRandom(11);
  let vpip = 0;
  let pfr = 0;
  const N = 1500;
  for (let i = 0; i < N; i++) {
    const deck = shuffledDeck(rng);
    const h = new Hand({
      players: players(2000, 2000, 2000, 2000, 2000, 2000),
      buttonIndex: 0,
      smallBlind: 10,
      bigBlind: 20,
      presetHoles: [0, 1, 2, 3, 4, 5].map((k) => [deck[k * 2], deck[k * 2 + 1]]),
    });
    // 最初に行動する p3（UTG）の判断を数える
    const id = h.currentPlayer.id;
    const a = decide(h.viewFor(id), { level, personality, rng });
    if (a.type === 'call' || a.type === 'raise') vpip++;
    if (a.type === 'raise') pfr++;
  }
  return { vpip: vpip / N, pfr: pfr / N };
}

test('性格: 参加率は コール好き > 攻撃型 > 堅実型 > 慎重型、レイズ率は攻撃型が最も高い', () => {
  const r = Object.fromEntries(PERSONALITY_IDS.map((p) => [p, preflopRates(p)]));
  const fmt = (x) => (x * 100).toFixed(0) + '%';
  const summary = PERSONALITY_IDS.map((p) => `${PERSONALITIES[p].label} 参加${fmt(r[p].vpip)}/レイズ${fmt(r[p].pfr)}`).join(', ');
  assert.ok(r.station.vpip > r.aggressive.vpip, summary);
  assert.ok(r.aggressive.vpip > r.solid.vpip, summary);
  assert.ok(r.solid.vpip > r.cautious.vpip, summary);
  for (const p of ['station', 'solid', 'cautious']) assert.ok(r.aggressive.pfr > r[p].pfr, summary);
  assert.ok(r.station.pfr < r.station.vpip / 2, 'コール好きは主にコールで参加: ' + summary);
});

/** リバーで弱い手、相手にチェックされた場面でベット（ブラフ）する割合 */
function bluffRate(level, personality) {
  let bets = 0;
  const N = 300;
  for (let seed = 0; seed < N; seed++) {
    const h = new Hand({
      players: players(5000, 5000),
      buttonIndex: 0,
      smallBlind: 50,
      bigBlind: 100,
      presetHoles: [parseCards('7c 2d'), parseCards('Kd Qd')],
      presetBoard: parseCards('Ah 9s 4c 3h Jc'),
    });
    h.act({ type: 'call' });
    h.act({ type: 'check' });
    for (let i = 0; i < 4; i++) h.act({ type: 'check' }); // フロップ・ターン
    // リバー: p1(BB) が先にチェック → p0 の判断
    h.act({ type: 'check' });
    const a = decide(h.viewFor('p0'), { level, personality, rng: seededRandom(seed), iterations: 150 });
    if (a.type === 'raise') bets++;
  }
  return bets / N;
}

test('ブラフ: 初級はブラフしない。上級の攻撃型はときどきブラフする', () => {
  for (const p of PERSONALITY_IDS) assert.equal(bluffRate('beginner', p), 0, `初級/${p}`);
  const adv = bluffRate('advanced', 'aggressive');
  assert.ok(adv > 0.15 && adv < 0.6, `上級・攻撃型のブラフ率 ${adv}`);
  assert.ok(bluffRate('advanced', 'cautious') < adv, '慎重型は攻撃型よりブラフが少ない');
});

test('強さ: 上級（堅実型）は初級（コール好き）に勝ち越す', () => {
  const rng = seededRandom(2024);
  let advNet = 0;
  for (let match = 0; match < 6; match++) {
    const table = new Table({
      players: [
        { id: 'adv', name: 'A', stack: 2000 },
        { id: 'beg', name: 'B', stack: 2000 },
      ],
      smallBlind: 10,
      bigBlind: 20,
      rng,
    });
    const memory = createMemory();
    for (let k = 0; k < 80; k++) {
      const h = table.startHand();
      if (!h) break;
      while (!h.isComplete) {
        const id = h.currentPlayer.id;
        const opts = id === 'adv' ? { level: 'advanced', personality: 'solid' } : { level: 'beginner', personality: 'station' };
        h.act(decide(h.viewFor(id), { ...opts, memory, rng, iterations: 120 }));
      }
      observeHand(memory, h);
      table.settleHand();
    }
    advNet += table.players[0].stack - 2000;
  }
  assert.ok(advNet > 0, `上級の収支 ${advNet}`);
});

test('レンジ: 強いレンジの相手には勝率が下がる', () => {
  const vsRandom = estimateEquity({ hole: parseCards('Qs Qh'), iterations: 6000, rng: seededRandom(1) }).equity;
  const vsTight = estimateEquity({ hole: parseCards('Qs Qh'), iterations: 6000, rng: seededRandom(1), ranges: [topRange(0.05)] }).equity;
  assert.ok(vsRandom > 0.75, `QQ 対ランダム ${vsRandom}`);
  assert.ok(vsTight < vsRandom - 0.15, `QQ 対上位5% ${vsTight}`);
  assert.equal(handPercentile(...parseCards('As Ah')), 0);
  assert.ok(handPercentile(...parseCards('7c 2d')) > 0.9);
});

test('記憶: 相手の参加率と「ベットに降りる率」を覚える', () => {
  const memory = createMemory();
  for (let i = 0; i < 20; i++) {
    const h = new Hand({ players: players(1000, 1000), buttonIndex: 0, smallBlind: 10, bigBlind: 20 });
    h.act({ type: 'call' }); // p0 は毎回参加
    h.act({ type: 'check' });
    h.act({ type: 'raise', amount: 20 }); // p1 がフロップでベット
    h.act({ type: 'fold' }); // p0 は降りる
    observeHand(memory, h);
  }
  const t = tendencies(memory, 'p0');
  assert.ok(t.vpip > 0.8, `vpip ${t.vpip}`);
  assert.ok(t.foldToBet > 0.8, `foldToBet ${t.foldToBet}`);
  assert.equal(memory.p0.hands, 20);
});

test('アウツ: フラッシュドロー9枚、両面ストレートドロー8枚', () => {
  assert.equal(countOuts(parseCards('As 5s'), parseCards('Ks 8s 2d')), 9);
  assert.equal(countOuts(parseCards('9h 8c'), parseCards('7d 6s 2c')), 8);
  assert.equal(countOuts(parseCards('9s 8s'), parseCards('7s 6d 2s')), 15, 'フラッシュ＋ストレートドロー');
  assert.equal(countOuts(parseCards('As Ks'), parseCards('Qs Js Ts')), 0, '完成済み');
});

test('CPUキャラクター: 名前が重ならない', () => {
  const used = [];
  for (let i = 0; i < 5; i++) {
    const c = createCpu({ level: 'beginner', usedNames: used });
    assert.ok(!used.includes(c.name));
    used.push(c.name);
  }
});
