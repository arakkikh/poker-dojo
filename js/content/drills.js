// 練習ドリルの問題を自動で作る。
// 問題: { prompt, visuals: [{label, cards}], choices: string[], answer: 番号, explain(HTML) }

import { shuffledDeck, shuffle, cardLabel } from '../core/cards.js';
import { scoreHand, evaluateHand, categoryOf, CATEGORY_NAMES } from '../core/evaluator.js';
import { estimateEquity, potOdds } from '../core/equity.js';
import { countOuts } from '../ai/cpu.js';
import { chenScore } from '../ai/preflop.js';
import { preflopAdvice } from '../ai/advisor.js';

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];
const pct = (x) => `${Math.round(x * 100)}%`;

/** 正解を含む選択肢をシャッフルして { choices, answer } を返す */
function withChoices(correct, wrongs, rng) {
  const choices = shuffle([correct, ...wrongs], rng);
  return { choices, answer: choices.indexOf(correct) };
}

// ---------- どっちが強い？ ----------
function genCompare(rng) {
  // 半分は同じ役どうし（キッカー勝負）になるまで作り直す
  const wantSame = rng() < 0.5;
  for (let t = 0; t < 200; t++) {
    const d = shuffledDeck(rng);
    const board = d.slice(0, 5);
    const a = d.slice(5, 7);
    const b = d.slice(7, 9);
    const ea = evaluateHand([...a, ...board]);
    const eb = evaluateHand([...b, ...board]);
    if (wantSame && ea.category !== eb.category && t < 199) continue;
    const result = ea.score > eb.score ? 0 : ea.score < eb.score ? 1 : 2;
    const five = (e) => e.best.map(cardLabel).join(' ');
    let explain = `A: <b>${ea.description}</b>（${five(ea)}）<br>B: <b>${eb.description}</b>（${five(eb)}）<br>`;
    if (result === 2) explain += '役も残りのカードも同じなので引き分けです。';
    else if (ea.category === eb.category) explain += '同じ役なので、使う5枚を大きい順に1枚ずつ比べて決まります（キッカー）。';
    else explain += `${CATEGORY_NAMES[Math.max(ea.category, eb.category)]}の方が強い役です。`;
    return {
      prompt: 'どっちの手が強い？',
      visuals: [
        { label: 'ボード', cards: board },
        { label: 'A の手札', cards: a },
        { label: 'B の手札', cards: b },
      ],
      choices: ['A の勝ち', 'B の勝ち', '引き分け'],
      answer: result,
      explain,
    };
  }
  throw new Error('問題を作れませんでした');
}

// ---------- 役の名前 ----------
function genName(rng) {
  const target = Math.floor(rng() * 8); // ハイカード〜フォーカード
  let hand = null;
  for (let t = 0; t < 30000; t++) {
    const d = shuffledDeck(rng).slice(0, 7);
    if (categoryOf(scoreHand(d)) === target) {
      hand = d;
      break;
    }
  }
  if (!hand) hand = shuffledDeck(rng).slice(0, 7);
  const ev = evaluateHand(hand);
  const others = CATEGORY_NAMES.slice(0, 9).filter((n) => n !== ev.name);
  // 近い役を誤答に混ぜる
  const near = others.filter((n) => Math.abs(CATEGORY_NAMES.indexOf(n) - ev.category) <= 2);
  const wrongs = shuffle([...near], rng).slice(0, 2);
  while (wrongs.length < 3) {
    const n = pick(others, rng);
    if (!wrongs.includes(n)) wrongs.push(n);
  }
  return {
    prompt: '手札とボード、7枚で一番強い役は？',
    visuals: [
      { label: '手札', cards: hand.slice(0, 2) },
      { label: 'ボード', cards: hand.slice(2) },
    ],
    ...withChoices(ev.name, wrongs, rng),
    explain: `正解は <b>${ev.description}</b>。<br>使う5枚: ${ev.best.map(cardLabel).join(' ')}`,
    bestCards: ev.best,
  };
}

// ---------- 参加すべき？ ----------
const POSITIONS_6 = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
const POSITION_NAMES = { UTG: 'UTG（最初）', MP: 'MP', CO: 'CO（ボタンの右）', BTN: 'ボタン', SB: 'SB', BB: 'BB' };

function genPreflop(rng) {
  // ランダムだと弱い手ばかりになるので、半分は中くらい以上の手にする
  let hole;
  const wantPlayable = rng() < 0.55;
  for (let t = 0; t < 500; t++) {
    hole = shuffledDeck(rng).slice(0, 2);
    if (!wantPlayable || chenScore(hole[0], hole[1]) >= 6) break;
  }
  const raised = rng() < 0.3;
  const position = pick(raised ? ['CO', 'BTN', 'SB', 'BB'] : ['UTG', 'MP', 'CO', 'BTN', 'SB'], rng);
  const situation = raised ? '前の人が 3BB にレイズしてきた' : 'あなたの前の人は全員フォールドした';
  const toCallBB = raised ? (position === 'SB' ? 2.5 : position === 'BB' ? 2 : 3) : position === 'SB' ? 0.5 : 1;
  const adv = preflopAdvice({ hole, position, numPlayers: 6, toCallBB, raised, canCheck: false });
  const map = { raise: 'レイズで参加', call: 'コールで参加', fold: 'フォールド', check: 'フォールド' };
  const choices = ['レイズで参加', 'コールで参加', 'フォールド'];
  return {
    prompt: `6人卓で、あなたは<b>${POSITION_NAMES[position]}</b>。${situation}。どうする？`,
    visuals: [{ label: '手札', cards: hole }],
    choices,
    answer: choices.indexOf(map[adv.action]),
    explain: adv.reason,
  };
}

// ---------- アウツ ----------
function drawName(outs) {
  if (outs >= 15) return 'フラッシュドロー＋ストレートドロー';
  if (outs >= 12) return 'フラッシュドロー＋α';
  if (outs === 9) return 'フラッシュドロー';
  if (outs === 8) return '両側が空いたストレートドロー';
  if (outs === 4) return '内側1枚待ちのストレートドロー';
  return 'ドロー';
}

function genOuts(rng) {
  let hole;
  let board;
  let outs = 0;
  const minOuts = rng() < 0.65 ? 8 : 4; // 4枚（内側待ち）ばかりにならないように
  for (let t = 0; t < 5000 && outs < minOuts; t++) {
    const d = shuffledDeck(rng);
    hole = d.slice(0, 2);
    board = d.slice(2, 5);
    outs = countOuts(hole, board);
  }
  const pool = [4, 6, 8, 9, 12, 15].filter((x) => x !== outs);
  const wrongs = shuffle(pool, rng).slice(0, 3);
  const { choices, answer } = withChoices(String(outs), wrongs.map(String), rng);
  return {
    prompt: 'フロップ。次の1枚でストレート以上が完成するカード（アウツ）は何枚？',
    visuals: [
      { label: '手札', cards: hole },
      { label: 'ボード', cards: board },
    ],
    choices: choices.map((c) => `${c}枚`),
    answer,
    explain: `正解は <b>${outs}枚</b>（${drawName(outs)}）。<br>フロップなので「×4の法則」で、リバーまでに完成する確率は約${Math.min(outs * 4, 100)}%です。`,
  };
}

// ---------- 勝率はどのくらい？ ----------
const BUCKETS = ['0〜25%', '25〜50%', '50〜75%', '75〜100%'];

function equityNote(equity, ev, preflop) {
  if (preflop) {
    return equity >= 0.5
      ? '相手の手はランダムなので、大きいカードやペアがあれば50%を超えます。'
      : 'プリフロップでは、弱く見える手でも相手がランダムなら30%以上の勝率があることが多いです。';
  }
  if (ev && ev.category >= 2) return 'ツーペア以上がフロップでできていれば、相手がランダムならかなり有利です。';
  if (ev && ev.category === 1) return 'ペアができていれば、相手がランダムな手なら勝っていることが多いです。';
  return '役がなくても、ターンとリバーで役ができる可能性が残っています。';
}

function genEquity(rng) {
  const preflop = rng() < 0.4;
  let hole;
  let board;
  let equity;
  // 区切り（25%/50%/75%）のすぐ近くの問題は紛らわしいので作り直す
  for (let t = 0; t < 30; t++) {
    const d = shuffledDeck(rng);
    hole = d.slice(0, 2);
    board = preflop ? [] : d.slice(2, 5);
    ({ equity } = estimateEquity({ hole, board, opponents: 1, iterations: 3000, rng }));
    const nearEdge = [0.25, 0.5, 0.75].some((edge) => Math.abs(equity - edge) < 0.03);
    if (!nearEdge) break;
  }
  const bucket = Math.min(3, Math.floor(equity * 4));
  const ev = board.length ? evaluateHand([...hole, ...board]) : null;
  return {
    prompt: `相手1人（手札はランダム）。${preflop ? 'プリフロップで' : 'フロップで'}、あなたの勝率はどのくらい？`,
    visuals: board.length
      ? [
          { label: '手札', cards: hole },
          { label: 'ボード', cards: board },
        ]
      : [{ label: '手札', cards: hole }],
    choices: BUCKETS,
    answer: bucket,
    explain: `シミュレーションでは約 <b>${pct(equity)}</b>。${ev ? `今の役は「${ev.description}」。` : ''}<br>${equityNote(equity, ev, preflop)}`,
  };
}

// ---------- ポットオッズ ----------
function genPotOdds(rng) {
  const potBefore = pick([100, 120, 150, 200, 240, 300, 400], rng);
  const frac = pick([0.25, 0.33, 0.5, 0.66, 0.75, 1], rng);
  const bet = Math.round((potBefore * frac) / 10) * 10;
  const pot = potBefore + bet; // 相手のベット込み
  const need = potOdds(bet, pot);
  if (rng() < 0.5) {
    // 必要な勝率を答える
    const correct = pct(need);
    const pool = [0.17, 0.2, 0.25, 0.29, 0.33, 0.4, 0.5].map(pct).filter((x) => x !== correct);
    const wrongs = shuffle([...new Set(pool)], rng).slice(0, 3);
    return {
      prompt: `ベット前のポットは ${potBefore}。相手が <b>${bet}</b> ベットした。コールするのに必要な勝率は？`,
      visuals: [],
      ...withChoices(correct, wrongs, rng),
      explain: `相手のベット込みのポットは ${pot}。<br>必要な勝率 ＝ コール額 ÷（ポット＋コール額）<br>＝ ${bet} ÷（${pot}＋${bet}）＝ <b>${correct}</b>`,
    };
  }
  // 勝率を与えてコールかフォールドか
  const margin = pick([-0.12, -0.08, 0.08, 0.12], rng);
  const equity = Math.max(0.08, Math.min(0.9, need + margin));
  const call = equity > need;
  return {
    prompt: `ベット前のポットは ${potBefore}。相手が <b>${bet}</b> ベット。あなたの勝率は約 <b>${pct(equity)}</b>。コールは得？`,
    visuals: [],
    choices: ['コール（得）', 'フォールド（コールは損）'],
    answer: call ? 0 : 1,
    explain: `相手のベット込みのポットは ${pot}。必要な勝率は ${bet} ÷（${pot}＋${bet}）＝ ${pct(need)}。<br>勝率 ${pct(equity)} は${call ? '上回る' : '届かない'}ので、<b>${call ? 'コール' : 'フォールド'}</b>が長い目で見て得です。`,
  };
}

export const DRILLS = [
  { id: 'compare', icon: '⚔️', title: 'どっちが強い？', desc: '2つの手のどちらが勝つか', generate: genCompare },
  { id: 'name', icon: '🏷️', title: '役の名前', desc: '7枚で一番強い役を当てる', generate: genName },
  { id: 'preflop', icon: '✋', title: '参加すべき？', desc: '最初の2枚とポジションで判断', generate: genPreflop },
  { id: 'outs', icon: '🎯', title: 'アウツを数えよう', desc: '完成までのカードの枚数', generate: genOuts },
  { id: 'equity', icon: '📈', title: '勝率はどのくらい？', desc: '勝てる確率を見積もる', generate: genEquity },
  { id: 'potodds', icon: '🧮', title: 'ポットオッズ', desc: 'コールして得か損か', generate: genPotOdds },
];

export const QUESTIONS_PER_DRILL = 10;
