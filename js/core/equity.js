// 勝率（エクイティ）計算。相手の手札と残りのボードをランダムに配って何度も試す（モンテカルロ法）。

import { fullDeck } from './cards.js';
import { scoreHand } from './evaluator.js';

/**
 * @param {object} o
 * @param {number[]} o.hole 自分の手札2枚
 * @param {number[]} [o.board] 見えているボード（0〜5枚）
 * @param {number} [o.opponents] 相手の人数
 * @param {number} [o.iterations]
 * @param {() => number} [o.rng]
 * @param {number[]} [o.dead] 既に見えていて使われないカード
 * @param {(((c1:number, c2:number) => boolean) | null)[]} [o.ranges] 相手ごとの「持っていそうな手」の判定。null ならランダム
 * @returns {{win:number, tie:number, lose:number, equity:number}} いずれも 0〜1
 */
export function estimateEquity({ hole, board = [], opponents = 1, iterations = 1000, rng = Math.random, dead = [], ranges = null }) {
  const known = new Set([...hole, ...board, ...dead]);
  const rest = fullDeck().filter((c) => !known.has(c));
  const boardNeed = 5 - board.length;
  const need = opponents * 2 + boardNeed;
  if (need > rest.length) throw new Error('カードが足りません');

  const mine = new Array(7);
  const theirs = new Array(7);
  mine[0] = hole[0];
  mine[1] = hole[1];
  for (let i = 0; i < board.length; i++) {
    mine[2 + i] = board[i];
    theirs[2 + i] = board[i];
  }

  let win = 0;
  let tie = 0;
  let equity = 0;
  for (let it = 0; it < iterations; it++) {
    // 先頭 need 枚だけ部分シャッフル
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(rng() * (rest.length - i));
      const t = rest[i];
      rest[i] = rest[j];
      rest[j] = t;
    }
    for (let i = 0; i < boardNeed; i++) {
      mine[2 + board.length + i] = rest[i];
      theirs[2 + board.length + i] = rest[i];
    }
    const myScore = scoreHand(mine);
    let best = -1;
    let tiedCount = 0;
    if (ranges) drawRangedHands(rest, boardNeed, opponents, ranges, rng);
    for (let o = 0; o < opponents; o++) {
      theirs[0] = rest[boardNeed + o * 2];
      theirs[1] = rest[boardNeed + o * 2 + 1];
      const s = scoreHand(theirs);
      if (s > best) {
        best = s;
        tiedCount = 1;
      } else if (s === best) tiedCount++;
    }
    if (myScore > best) {
      win++;
      equity += 1;
    } else if (myScore === best) {
      tie++;
      equity += 1 / (tiedCount + 1);
    }
  }
  return {
    win: win / iterations,
    tie: tie / iterations,
    lose: (iterations - win - tie) / iterations,
    equity: equity / iterations,
  };
}

const MAX_TRIES = 25;

/**
 * 相手の手札をレンジに合うように選び直す（棄却サンプリング）。
 * rest[boardNeed + o*2], rest[boardNeed + o*2 + 1] に o番目の相手の手札を置く。
 */
function drawRangedHands(rest, boardNeed, opponents, ranges, rng) {
  for (let o = 0; o < opponents; o++) {
    const accept = ranges[o];
    const i = boardNeed + o * 2;
    if (!accept) continue;
    const span = rest.length - i;
    for (let t = 0; t < MAX_TRIES; t++) {
      if (accept(rest[i], rest[i + 1])) break;
      // 未使用のカードから2枚選び直す
      const a = i + Math.floor(rng() * span);
      let tmp = rest[i];
      rest[i] = rest[a];
      rest[a] = tmp;
      const b = i + 1 + Math.floor(rng() * (span - 1));
      tmp = rest[i + 1];
      rest[i + 1] = rest[b];
      rest[b] = tmp;
    }
  }
}

/** ポットオッズ: コールに必要な勝率（0〜1） */
export function potOdds(toCall, pot) {
  if (toCall <= 0) return 0;
  return toCall / (pot + toCall);
}
