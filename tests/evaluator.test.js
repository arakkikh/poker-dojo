import { test, assert } from './lib.js';
import { parseCards, fullDeck, shuffle, seededRandom, rankOf, suitOf, cardToString } from '../js/core/cards.js';
import {
  scoreHand,
  evaluateHand,
  categoryOf,
  HIGH_CARD,
  ONE_PAIR,
  TWO_PAIR,
  THREE_OF_A_KIND,
  STRAIGHT,
  FLUSH,
  FULL_HOUSE,
  FOUR_OF_A_KIND,
  STRAIGHT_FLUSH,
  ROYAL_FLUSH,
} from '../js/core/evaluator.js';

const cat = (s) => categoryOf(scoreHand(parseCards(s)));
const score = (s) => scoreHand(parseCards(s));
const stronger = (a, b) => assert.ok(score(a) > score(b), `「${a}」は「${b}」より強いはず`);
const tie = (a, b) => assert.equal(score(a), score(b), `「${a}」と「${b}」は引き分けのはず`);

// --- カード ---
test('カード: 文字列との相互変換', () => {
  assert.equal(cardToString(parseCards('As')[0]), 'As');
  assert.equal(cardToString(parseCards('10h')[0]), 'Th');
  assert.equal(rankOf(parseCards('2c')[0]), 0);
  assert.equal(suitOf(parseCards('2c')[0]), 3);
  assert.throws(() => parseCards('1x'));
});

// --- 各役の判定（5枚） ---
test('役判定: 各カテゴリを正しく判定（5枚）', () => {
  assert.equal(cat('As Ks Qs Js Ts'), ROYAL_FLUSH);
  assert.equal(cat('9h 8h 7h 6h 5h'), STRAIGHT_FLUSH);
  assert.equal(cat('5d 4d 3d 2d Ad'), STRAIGHT_FLUSH);
  assert.equal(cat('7s 7h 7d 7c 2s'), FOUR_OF_A_KIND);
  assert.equal(cat('Ks Kh Kd 4c 4s'), FULL_HOUSE);
  assert.equal(cat('As 9s 7s 4s 2s'), FLUSH);
  assert.equal(cat('Ts 9h 8d 7c 6s'), STRAIGHT);
  assert.equal(cat('5s 4h 3d 2c As'), STRAIGHT);
  assert.equal(cat('As Kh Qd Jc Ts'), STRAIGHT);
  assert.equal(cat('Qs Qh Qd 9c 2s'), THREE_OF_A_KIND);
  assert.equal(cat('Js Jh 4d 4c As'), TWO_PAIR);
  assert.equal(cat('8s 8h Kd 4c 2s'), ONE_PAIR);
  assert.equal(cat('As Jh 9d 6c 3s'), HIGH_CARD);
});

test('役判定: ストレートにならない形（回り込み・4枚）', () => {
  assert.equal(cat('Qs Kh Ad 2c 3s'), HIGH_CARD, 'Q-K-A-2-3 はストレートではない');
  assert.equal(cat('As Kh Qd Jc 9s'), HIGH_CARD);
  assert.equal(cat('As 2s 3s 4s 6h'), HIGH_CARD);
});

// --- 役同士の強さ ---
test('強さ: 役の順位', () => {
  const ladder = [
    'As Ks Qs Js Ts',
    'Kh Qh Jh Th 9h',
    '2s 2h 2d 2c 3s',
    'Ks Kh Kd 4c 4s',
    'As 9s 7s 4s 2s',
    'Ts 9h 8d 7c 6s',
    'Qs Qh Qd 9c 2s',
    'Js Jh 4d 4c As',
    '8s 8h Kd 4c 2s',
    'As Jh 9d 6c 3s',
  ];
  for (let i = 0; i + 1 < ladder.length; i++) stronger(ladder[i], ladder[i + 1]);
});

test('強さ: ストレートは高い方が強く、A-5（ホイール）が最弱', () => {
  stronger('6s 5h 4d 3c 2s', '5s 4h 3d 2c As');
  stronger('As Kh Qd Jc Ts', 'Ks Qh Jd Tc 9s');
  stronger('6h 5h 4h 3h 2h', '5d 4d 3d 2d Ad');
});

test('強さ: キッカーで決着', () => {
  stronger('As Ah Kd 8c 3s', 'Ac Ad Qd Jc Ts'); // ペアのキッカー
  stronger('As Ah Kd 8c 4s', 'Ac Ad Kh 8d 3s'); // 3枚目のキッカーまで
  stronger('Ks Kh 5d 5c As', 'Kd Kc 5h 5s Qs'); // ツーペアのキッカー
  stronger('Ks Kh 6d 6c 2s', 'Kd Kc 5h 5s As'); // ツーペアは2つ目のペアが先
  stronger('As Jh 9d 6c 4s', 'Ad Jc 9h 6s 3d'); // ハイカード5枚目
  stronger('As Js 9s 6s 4s', 'Ad Jd 9d 6d 3d'); // フラッシュ5枚目
  stronger('7s 7h 7d 7c As', '7s 7h 7d 7c Ks'); // フォーカードのキッカー
  stronger('3s 3h 3d 2c 2s', '2h 2d 2c As Ah'); // フルハウスは3枚側が優先
});

test('強さ: スートは関係なく引き分け', () => {
  tie('As Kh Qd Jc 9s', 'Ah Kd Qc Js 9h');
  tie('Ts 9h 8d 7c 6s', 'Th 9d 8c 7s 6h');
  tie('Js Jh 4d 4c As', 'Jd Jc 4s 4h Ah');
});

// --- 7枚から最強の5枚 ---
test('7枚: 最強の5枚を選ぶ', () => {
  assert.equal(cat('As Ks 2h 3d Qs Js Ts'), ROYAL_FLUSH);
  assert.equal(cat('Ah 2h 3h 4h 5h Kh 9c'), STRAIGHT_FLUSH, '5ハイのストフラ（ホイール）');
  assert.equal(cat('Ah Kh 9h 2h 5h 3d 4c'), FLUSH, 'ストレートとフラッシュが別々ならフラッシュ');
  assert.equal(cat('7s 7h 7d Ks Kh Kd 2c'), FULL_HOUSE, 'スリーカード2組はフルハウス');
  assert.equal(cat('As Ah Ks Kh Qs Qh 2c'), TWO_PAIR, 'ペア3組はツーペア');
  assert.equal(cat('9s 8s 7s 6s 2s Td Jh'), FLUSH, 'ストレートもあるがフラッシュが強い');
  assert.equal(cat('6s 7h 8d 9c Tc Jd 2s'), STRAIGHT);
  assert.equal(cat('5s 5h 5d 5c 9s 9h 9d'), FOUR_OF_A_KIND);
});

test('7枚: ペア3組のときは一番高いカードがキッカー', () => {
  tie('As Ah Ks Kh Qs Qh 2c', 'Ad Ac Kd Kc Qd 3h 2s');
  stronger('As Ah Ks Kh 2s 2h Qc', 'Ad Ac Kd Kc 3d 3h Js');
});

test('7枚: スリーカード2組は高い方の3枚＋低い方の2枚', () => {
  stronger('Ks Kh Kd 7c 7s 7h 2c', 'Ks Kh Kd 6c 6s 6h Ac');
  tie('Ks Kh Kd 7c 7s 7h 2c', 'Ks Kh Kd 7c 7s 2h 3c');
});

test('7枚: 6枚以上のフラッシュは上位5枚', () => {
  stronger('As Ks 9s 7s 4s 3s 2s', 'Ah Kh 9h 7h 3h 2h 2c');
});

test('7枚: 長いストレートは一番上を採用', () => {
  const ev = evaluateHand(parseCards('4s 5h 6d 7c 8s 9h Ts'));
  assert.equal(ev.description, '10ハイのストレート');
});

// --- 詳細評価 ---
test('evaluateHand: 名前・説明・役の5枚', () => {
  const ev = evaluateHand(parseCards('Kd 2c Ks 7h Kh 7d 3s'));
  assert.equal(ev.name, 'フルハウス');
  assert.equal(ev.description, 'Kと7のフルハウス');
  assert.deepEqual(ev.best.map(cardToString), ['Ks', 'Kh', 'Kd', '7h', '7d']);

  const wheel = evaluateHand(parseCards('Ah 2c 3d 4s 5h Kc Qd'));
  assert.equal(wheel.description, '5ハイのストレート');
  assert.deepEqual(wheel.best.map(cardToString), ['5h', '4s', '3d', '2c', 'Ah']);

  assert.equal(evaluateHand(parseCards('Js Jh 4d 4c As 2d 3c')).description, 'Jと4のツーペア');
  assert.equal(evaluateHand(parseCards('As Jh 9d 6c 3s')).description, 'Aハイ（役なし）');
  assert.equal(evaluateHand(parseCards('Ts Js Qs Ks As')).description, 'ロイヤルフラッシュ');
  assert.throws(() => evaluateHand(parseCards('As Ks Qs Js')));
});

// --- 全数検査: 5枚の組み合わせ 2,598,960 通りの役の出現数が理論値と一致 ---
test('全数検査: 5枚の全組み合わせで役の出現数が理論値と一致', () => {
  const expected = [1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 36, 4];
  const got = new Array(10).fill(0);
  const hand = [0, 0, 0, 0, 0];
  for (let a = 0; a < 52; a++) {
    hand[0] = a;
    for (let b = a + 1; b < 52; b++) {
      hand[1] = b;
      for (let c = b + 1; c < 52; c++) {
        hand[2] = c;
        for (let d = c + 1; d < 52; d++) {
          hand[3] = d;
          for (let e = d + 1; e < 52; e++) {
            hand[4] = e;
            got[categoryOf(scoreHand(hand))]++;
          }
        }
      }
    }
  }
  assert.deepEqual(got, expected);
});

// --- 別実装との突き合わせ ---
// 素朴な（遅いが分かりやすい）参照実装: 5枚をランクの出現数でグループ化して比較キーを作る
function naive5(cards) {
  const ranks = cards.map(rankOf).sort((a, b) => b - a);
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]));
  const uniq = [...new Set(ranks)];
  let straightTop = -1;
  if (uniq.length === 5) {
    if (ranks[0] - ranks[4] === 4) straightTop = ranks[0];
    else if (ranks.join() === '12,3,2,1,0') straightTop = 3;
  }
  const groups = uniq
    .map((r) => [ranks.filter((x) => x === r).length, r])
    .sort((x, y) => y[0] - x[0] || y[1] - x[1]);
  const shape = groups.map((g) => g[0]).join('');
  const tiebreak = groups.map((g) => g[1]);
  let c;
  if (straightTop >= 0 && flush) c = straightTop === 12 ? 9 : 8;
  else if (shape === '41') c = 7;
  else if (shape === '32') c = 6;
  else if (flush) c = 5;
  else if (straightTop >= 0) c = 4;
  else if (shape === '311') c = 3;
  else if (shape === '221') c = 2;
  else if (shape === '2111') c = 1;
  else c = 0;
  return [c, ...(straightTop >= 0 ? [straightTop] : tiebreak)];
}
function cmpKey(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? -1) - (b[i] ?? -1);
    if (d) return d;
  }
  return 0;
}
function naive7(cards) {
  let best = null;
  for (let a = 0; a < 7; a++)
    for (let b = a + 1; b < 7; b++) {
      const five = cards.filter((_, i) => i !== a && i !== b);
      const k = naive5(five);
      if (!best || cmpKey(k, best) > 0) best = k;
    }
  return best;
}

test('突き合わせ: ランダムな7枚×2万組で参照実装と勝敗が一致', () => {
  const rng = seededRandom(12345);
  for (let i = 0; i < 20000; i++) {
    const deck = shuffle(fullDeck(), rng);
    const board = deck.slice(0, 5);
    const h1 = [deck[5], deck[6], ...board];
    const h2 = [deck[7], deck[8], ...board];
    const fast = Math.sign(scoreHand(h1) - scoreHand(h2));
    const slow = Math.sign(cmpKey(naive7(h1), naive7(h2)));
    if (fast !== slow) {
      throw new Error(`不一致: ${h1.map(cardToString).join(' ')} vs ${h2.map(cardToString).join(' ')}`);
    }
    assert.equal(categoryOf(scoreHand(h1)), naive7(h1)[0]);
  }
});
