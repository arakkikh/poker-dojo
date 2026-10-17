import { test, assert } from './lib.js';
import { parseCards, seededRandom } from '../js/core/cards.js';
import { Hand, Table } from '../js/core/game.js';

const players = (...stacks) => stacks.map((s, i) => ({ id: 'p' + i, name: 'P' + i, stack: s }));
const holes = (...strs) => strs.map(parseCards);

test('1対1: ボタンがSB。プリフロップはSBから、フロップ以降はBBから行動', () => {
  const h = new Hand({ players: players(1000, 1000), buttonIndex: 0, smallBlind: 50, bigBlind: 100 });
  assert.equal(h.players[0].bet, 50);
  assert.equal(h.players[1].bet, 100);
  assert.equal(h.currentPlayer.id, 'p0');
  assert.equal(h.legalActions().toCall, 50);
  h.act({ type: 'call' });
  // BBにはチェックかレイズの選択権（オプション）がある
  assert.equal(h.currentPlayer.id, 'p1');
  assert.ok(h.legalActions().canCheck);
  h.act({ type: 'check' });
  assert.equal(h.street, 'flop');
  assert.equal(h.board.length, 3);
  assert.equal(h.currentPlayer.id, 'p1', 'フロップはBBから');
  assert.equal(h.pot, 200);
});

test('フォールドで残り1人ならポットを獲得', () => {
  const h = new Hand({ players: players(1000, 1000), buttonIndex: 0, smallBlind: 50, bigBlind: 100 });
  h.act({ type: 'fold' });
  assert.ok(h.isComplete);
  assert.equal(h.results.net.p0, -50);
  assert.equal(h.results.net.p1, 50);
  assert.ok(h.results.uncontested);
});

test('レイズ額: 最低レイズは直前のレイズ幅以上', () => {
  const h = new Hand({ players: players(5000, 5000), buttonIndex: 0, smallBlind: 50, bigBlind: 100 });
  assert.equal(h.legalActions().minRaiseTo, 200);
  assert.throws(() => h.act({ type: 'raise', amount: 150 }));
  h.act({ type: 'raise', amount: 400 }); // 300 のレイズ
  assert.equal(h.legalActions().minRaiseTo, 700);
  h.act({ type: 'raise', amount: 700 });
  assert.equal(h.legalActions().minRaiseTo, 1000);
  h.act({ type: 'call' });
  assert.equal(h.street, 'flop');
  assert.equal(h.pot, 1400);
  // フロップの最低ベットはBB
  assert.ok(h.legalActions().isBet);
  assert.equal(h.legalActions().minRaiseTo, 100);
});

test('ショーダウン: 強い手がポットを獲得し、役の説明が付く', () => {
  const h = new Hand({
    players: players(1000, 1000),
    buttonIndex: 0,
    smallBlind: 50,
    bigBlind: 100,
    presetHoles: holes('As Ah', 'Ks Kh'),
    presetBoard: parseCards('2c 7d 9s Jc 3h'),
  });
  h.act({ type: 'call' });
  h.act({ type: 'check' });
  for (let i = 0; i < 6; i++) h.act({ type: 'check' });
  assert.ok(h.isComplete);
  assert.equal(h.results.net.p0, 100);
  assert.equal(h.results.pots[0].description, 'Aのワンペア');
  assert.ok(h.events.some((e) => e.type === 'showdown'));
});

test('引き分け: ポットを分け、端数はボタンの左隣から', () => {
  // 3人: p0がボタン、p1 SB(25)、p2 BB(50)。p0とp1が同じ役。
  const h = new Hand({
    players: players(1000, 1000, 1000),
    buttonIndex: 0,
    smallBlind: 25,
    bigBlind: 50,
    presetHoles: holes('2c 3d', '2h 3s', '7h 8s'),
    presetBoard: parseCards('As Ks Qd Jd Tc'), // 全員ブロードウェイのストレート
  });
  h.act({ type: 'call' }); // p0
  h.act({ type: 'call' }); // p1
  h.act({ type: 'check' }); // p2
  for (let i = 0; i < 9; i++) h.act({ type: 'check' });
  assert.equal(h.pot, 150);
  assert.equal(h.results.pots[0].winners.length, 3);
  assert.equal(h.players.reduce((s, p) => s + p.stack, 0), 3000);

  // 端数あり: 2人で 101 を分ける
  const h2 = new Hand({
    players: players(1000, 1000, 1000),
    buttonIndex: 0,
    smallBlind: 1,
    bigBlind: 50,
    presetHoles: holes('2c 3d', '2h 3s', '7h 8s'),
    presetBoard: parseCards('As Ks Qd Jd 9c'),
  });
  h2.act({ type: 'call' }); // p0 50
  h2.act({ type: 'fold' }); // p1 1 で降りる
  h2.act({ type: 'check' }); // p2
  for (let i = 0; i < 6; i++) h2.act({ type: 'check' });
  // ボード A K Q J 9 で p0,p2 共に Aハイ…p2は 8,7 → A K Q J 9 で同じ
  assert.equal(h2.pot, 101);
  const pot = h2.results.pots[0];
  assert.equal(pot.winners.join(), 'p2,p0', 'ボタン(p0)の左隣から順');
  assert.equal(h2.results.net.p2, 1, 'p2 は 51 獲得（+1）');
  assert.equal(h2.results.net.p0, 0, 'p0 は 50 獲得（±0）');
});

test('サイドポット: ショートスタックのオールイン', () => {
  // p0: 100 (最強), p1: 300 (2番目), p2: 300 (最弱)
  const h = new Hand({
    players: players(100, 300, 300),
    buttonIndex: 0,
    smallBlind: 10,
    bigBlind: 20,
    presetHoles: holes('As Ah', 'Ks Kh', 'Qs Qh'),
    presetBoard: parseCards('2c 7d 9s Jc 3h'),
  });
  h.act({ type: 'allin' }); // p0 100
  h.act({ type: 'allin' }); // p1 300
  h.act({ type: 'call' }); // p2 300
  assert.ok(h.isComplete);
  const pots = h.results.pots;
  assert.equal(pots.length, 2);
  assert.equal(pots[0].amount, 300);
  assert.deepEqual(pots[0].winners, ['p0']);
  assert.equal(pots[1].amount, 400);
  assert.deepEqual(pots[1].winners, ['p1']);
  assert.deepEqual(
    h.players.map((p) => p.stack),
    [300, 400, 0],
  );
  assert.ok(h.events.some((e) => e.type === 'reveal'), 'オールインで手札が公開される');
  assert.equal(h.board.length, 5);
});

test('サイドポット: フォールドした人のチップもポットに入る', () => {
  // p0: 50でオールイン(最強)、p1: 1000、p2: 1000。p2 がターンで降りる
  const h = new Hand({
    players: players(1000, 50, 1000),
    buttonIndex: 0,
    smallBlind: 10,
    bigBlind: 20,
    presetHoles: holes('Qs Qh', 'As Ah', '7s 2h'),
    presetBoard: parseCards('2c 7d 9s Jc 3h'),
  });
  // 順番: p0(BTN) → p1(SB) → p2(BB)
  h.act({ type: 'raise', amount: 200 }); // p0
  h.act({ type: 'allin' }); // p1 50
  h.act({ type: 'call' }); // p2 200
  // フロップ: p2 → p0 （p1 はオールイン）
  h.act({ type: 'raise', amount: 300 }); // p2 ベット
  h.act({ type: 'call' }); // p0
  h.act({ type: 'check' }); // p2 ターン
  h.act({ type: 'raise', amount: 400 }); // p0
  h.act({ type: 'fold' }); // p2
  assert.ok(h.isComplete);
  const pots = h.results.pots;
  // メイン: 50×3 = 150 → p1、サイド: (200-50)×2 + 300×2 = 900 → p0
  assert.equal(pots[0].amount, 150);
  assert.deepEqual(pots[0].winners, ['p1']);
  assert.equal(pots[1].amount, 900);
  assert.deepEqual(pots[1].winners, ['p0']);
  assert.equal(h.players.reduce((s, p) => s + p.stack, 0), 2050);
});

test('コールされなかったベットは返却される', () => {
  const h = new Hand({
    players: players(1000, 200),
    buttonIndex: 0,
    smallBlind: 10,
    bigBlind: 20,
    presetHoles: holes('As Ah', 'Ks Kh'),
    presetBoard: parseCards('2c 7d 9s Jc 3h'),
  });
  h.act({ type: 'allin' }); // p0 1000
  h.act({ type: 'call' }); // p1 200 でオールイン
  assert.ok(h.isComplete);
  assert.ok(h.events.some((e) => e.type === 'refund' && e.amount === 800));
  assert.equal(h.players[0].stack, 1200);
  assert.equal(h.players[1].stack, 0);
});

test('最低額に満たないオールインでは、行動済みの人はレイズできない', () => {
  // p0 BTN, p1 SB, p2 BB
  const h = new Hand({ players: players(1000, 150, 1000), buttonIndex: 0, smallBlind: 10, bigBlind: 20 });
  h.act({ type: 'raise', amount: 100 }); // p0 100（80のレイズ）
  h.act({ type: 'allin' }); // p1 150（50しか上げていない＝不完全なレイズ）
  assert.ok(h.legalActions().canRaise, 'まだ行動していない p2 はレイズできる');
  h.act({ type: 'call' }); // p2 150
  const legal = h.legalActions();
  assert.equal(h.currentPlayer.id, 'p0');
  assert.equal(legal.toCall, 50);
  assert.ok(!legal.canRaise, 'p0 はコールかフォールドのみ');
});

test('全員オールインならボードを最後まで配ってショーダウン', () => {
  const h = new Hand({ players: players(500, 500), buttonIndex: 1, smallBlind: 50, bigBlind: 100 });
  h.act({ type: 'allin' });
  h.act({ type: 'call' });
  assert.ok(h.isComplete);
  assert.equal(h.board.length, 5);
  assert.equal(h.players[0].stack + h.players[1].stack, 1000);
});

test('ブラインドでオールインになっても進行できる', () => {
  const h = new Hand({ players: players(30, 1000), buttonIndex: 1, smallBlind: 50, bigBlind: 100 });
  // p1 がボタン=SB(50)、p0 が BB だが 30 しかない
  assert.ok(h.players[0].allIn);
  h.act({ type: 'call' }); // p1 はBB額(100)までコール → 超過分 70 は返却される
  assert.ok(h.isComplete);
  assert.equal(h.players[0].stack + h.players[1].stack, 1030);
});

test('ポジション名（6人）', () => {
  const h = new Hand({ players: players(1000, 1000, 1000, 1000, 1000, 1000), buttonIndex: 2, smallBlind: 5, bigBlind: 10 });
  const pos = h.players.map((p) => h.positionOf(p.id));
  assert.deepEqual(pos, ['MP', 'CO', 'BTN', 'SB', 'BB', 'UTG']);
});

test('ランダム対戦（2〜6人・400ゲーム）: チップの総量が常に保たれ、不正な状態にならない', () => {
  const rng = seededRandom(7);
  let played = 0;
  for (let game = 0; game < 400; game++) {
    const n = 2 + Math.floor(rng() * 5);
    const table = new Table({
      players: Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'P' + i, stack: 200 + Math.floor(rng() * 2000) })),
      smallBlind: 10,
      bigBlind: 20,
      rng,
    });
    const total = table.players.reduce((s, p) => s + p.stack, 0);
    for (let k = 0; k < 100; k++) {
      const h = table.startHand();
      if (!h) break;
      let guard = 0;
      while (!h.isComplete) {
        if (++guard > 500) throw new Error('ハンドが終わらない');
        const legal = h.legalActions();
        const r = rng();
        if (r < 0.15 && !legal.canCheck) h.act({ type: 'fold' });
        else if (r < 0.3 && legal.canRaise) {
          const amt = legal.minRaiseTo + Math.floor(rng() * (legal.maxRaiseTo - legal.minRaiseTo + 1));
          h.act({ type: 'raise', amount: amt });
        } else if (r < 0.35 && legal.canRaise) h.act({ type: 'allin' });
        else h.act({ type: legal.canCheck ? 'check' : 'call' });
        if (!h.isComplete) {
          const inPlay = h.players.reduce((s, p) => s + p.stack + p.totalBet, 0);
          assert.equal(inPlay, total, 'ハンド中のチップ総量');
        }
        assert.ok(h.players.every((p) => p.stack >= 0), 'スタックが負');
      }
      assert.equal(h.players.reduce((s, p) => s + p.stack, 0), total, 'ハンド終了後のチップ総量');
      table.settleHand();
      played++;
    }
  }
  assert.ok(played > 1000, `実行ハンド数が少なすぎる: ${played}`);
});
