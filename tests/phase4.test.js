import { test, assert } from './lib.js';
import { parseCards, seededRandom } from '../js/core/cards.js';
import { Hand, Table } from '../js/core/game.js';
import { BLIND_LEVELS, levelIndexForHand, handsUntilNextLevel, placeEliminated, prizeFor } from '../js/core/tournament.js';
import { MISSIONS, buildHandSummary } from '../js/content/missions.js';
import { checkMissions, claimMission, load, resetAll, buyCardBack } from '../js/store/storage.js';

const players = (...stacks) => stacks.map((s, i) => ({ id: 'p' + i, name: 'P' + i, stack: s }));

test('トーナメント: ハンド数に応じてブラインドが上がる', () => {
  assert.equal(levelIndexForHand(1, 8), 0);
  assert.equal(levelIndexForHand(8, 8), 0);
  assert.equal(levelIndexForHand(9, 8), 1);
  assert.equal(levelIndexForHand(10000, 8), BLIND_LEVELS.length - 1, '最終レベルで止まる');
  assert.equal(handsUntilNextLevel(1, 8), 8);
  assert.equal(handsUntilNextLevel(8, 8), 1);
  assert.equal(handsUntilNextLevel(10000, 8), null);
  for (let i = 1; i < BLIND_LEVELS.length; i++) assert.ok(BLIND_LEVELS[i].bb > BLIND_LEVELS[i - 1].bb);
});

test('トーナメント: 同時に脱落したら、開始時のチップが少ない人が下位', () => {
  const r = placeEliminated(
    [
      { id: 'a', startStack: 500, stack: 0 },
      { id: 'b', startStack: 200, stack: 0 },
      { id: 'c', startStack: 900, stack: 1600 },
    ],
    5,
  );
  assert.deepEqual(r, [
    { id: 'b', place: 5 },
    { id: 'a', place: 4 },
  ]);
  assert.ok(prizeFor(1, 6) > prizeFor(2, 6));
});

test('トーナメント: アンティ付きでもチップ総量が保たれ、最後に1人が残る', () => {
  const rng = seededRandom(77);
  const table = new Table({ players: players(1500, 1500, 1500, 1500), smallBlind: 10, bigBlind: 20, rng });
  let n = 0;
  while (table.activePlayers().length > 1 && n < 3000) {
    n++;
    const lv = BLIND_LEVELS[levelIndexForHand(n, 3)];
    table.smallBlind = lv.sb;
    table.bigBlind = lv.bb;
    table.ante = lv.ante;
    const h = table.startHand();
    while (!h.isComplete) {
      const legal = h.legalActions();
      h.act(rng() < 0.5 ? { type: legal.canCheck ? 'check' : 'call' } : { type: 'allin' });
    }
    table.settleHand();
    assert.equal(table.players.reduce((s, p) => s + p.stack, 0), 6000);
  }
  assert.equal(table.activePlayers().length, 1);
});

test('ミッション: 定義のIDが重複せず、報酬が正', () => {
  const ids = new Set(MISSIONS.map((m) => m.id));
  assert.equal(ids.size, MISSIONS.length);
  for (const m of MISSIONS) assert.ok(m.reward > 0 && m.title && m.desc, m.id);
});

test('ハンドの要約: オールインでショーダウン勝ち・役・キッカー勝ち', () => {
  const h = new Hand({
    players: players(1000, 1000),
    buttonIndex: 0,
    smallBlind: 10,
    bigBlind: 20,
    presetHoles: [parseCards('As Kd'), parseCards('Ac Qh')],
    presetBoard: parseCards('Ah 9s 6d 4c 2h'),
  });
  h.act({ type: 'allin' });
  h.act({ type: 'call' });
  const s = buildHandSummary(h, 'p0', { levelOf: () => 'advanced' });
  assert.ok(s.won && s.showdownWon && s.allIn);
  assert.ok(s.kickerWin, '同じAのワンペアをKで上回った');
  assert.equal(s.potWon, 2000);
  assert.equal(s.category, 1);
  assert.deepEqual(s.beatLevels, ['advanced']);
  const lose = buildHandSummary(h, 'p1');
  assert.ok(!lose.won && lose.showdown && !lose.showdownWon && !lose.kickerWin);
});

test('ハンドの要約: 役なしでベットして全員を降ろすとブラフ成功', () => {
  const h = new Hand({
    players: players(1000, 1000),
    buttonIndex: 0,
    smallBlind: 10,
    bigBlind: 20,
    presetHoles: [parseCards('7c 2d'), parseCards('Kh Qh')],
    presetBoard: parseCards('Ah 9s 4c 3h Jc'),
  });
  h.act({ type: 'call' });
  h.act({ type: 'check' });
  h.act({ type: 'check' }); // フロップ: p1
  h.act({ type: 'raise', amount: 40 }); // p0 ベット（役なし）
  h.act({ type: 'fold' });
  assert.ok(buildHandSummary(h, 'p0').bluffWin);
  assert.ok(!buildHandSummary(h, 'p1').bluffWin);
});

test('ミッション判定: 達成 → 報酬の受け取り → コインでカードの裏デザインを購入', () => {
  resetAll();
  const summary = { won: true, showdownWon: true, allIn: true, category: 6, potWon: 2500, bluffWin: false, kickerWin: false, beatLevels: [], decisions: 0, goodDecisions: 0, session: { hands: 1, vpip: 1, net: 100 } };
  const done = checkMissions({ type: 'hand', summary }).map((m) => m.id);
  for (const id of ['first-win', 'showdown-win', 'make-fullhouse', 'allin-win', 'big-pot']) assert.ok(done.includes(id), id);
  assert.ok(!done.includes('bluff') && !done.includes('make-quads'));
  assert.equal(checkMissions({ type: 'hand', summary }).length, 0, '同じミッションは二度達成しない');
  const coins = ['first-win', 'make-fullhouse', 'big-pot', 'allin-win'].reduce((s, id) => s + claimMission(id), 0);
  assert.equal(coins, 50 + 120 + 120 + 100);
  assert.equal(claimMission('first-win'), 0, '二重受け取りはできない');
  assert.equal(load().profile.coins, 390);
  assert.ok(buyCardBack('purple'));
  assert.equal(load().profile.coins, 90);
  assert.ok(!buyCardBack('gold'), 'コイン不足');
  assert.equal(load().profile.cardBack, 'purple');
  resetAll();
});

test('PWA: Service Worker のキャッシュ一覧に全ての js/css が載っている', async () => {
  // jsc / ブラウザではファイル一覧を取れないので、Node.js のときだけ確認する
  if (typeof process === 'undefined') return;
  const fs = await import('node:fs');
  const path = await import('node:path');
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(`${dir}/${d.name}`) : [`${dir}/${d.name}`]));
  for (const f of [...walk('js'), ...walk('css')]) assert.ok(sw.includes(`'./${f}'`), `sw.js に ${f} がない`);
});
