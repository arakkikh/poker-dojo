import { test, assert } from './lib.js';
import { parseCards, seededRandom } from '../js/core/cards.js';
import { scoreHand } from '../js/core/evaluator.js';
import { LESSONS, HAND_RANKING } from '../js/content/lessons.js';
import { DRILLS } from '../js/content/drills.js';
import { preflopAdvice, postflopAdvice, judge } from '../js/ai/advisor.js';

test('レッスン: 全ての章に手順とクイズがあり、正解番号とカード表記が正しい', () => {
  const ids = new Set();
  for (const l of LESSONS) {
    assert.ok(!ids.has(l.id), `章IDの重複 ${l.id}`);
    ids.add(l.id);
    assert.ok(l.steps.length >= 3 && l.quiz.length >= 3, l.id);
    for (const s of l.steps) {
      if (s.cards) parseCards(s.cards);
      if (s.board) parseCards(s.board);
    }
    for (const q of l.quiz) {
      assert.ok(q.answer >= 0 && q.answer < q.choices.length, `${l.id}: ${q.q}`);
      assert.ok(q.explain, `${l.id}: 解説がない`);
      if (q.cards) parseCards(q.cards);
    }
  }
});

test('レッスン: 役一覧は強い順に並んでいる', () => {
  for (let i = 0; i + 1 < HAND_RANKING.length; i++) {
    assert.ok(scoreHand(parseCards(HAND_RANKING[i].cards)) > scoreHand(parseCards(HAND_RANKING[i + 1].cards)), HAND_RANKING[i].name);
  }
});

test('ドリル: 全種類の問題を各100問作れて、正解番号が選択肢の範囲内', () => {
  const rng = seededRandom(5);
  for (const d of DRILLS) {
    for (let i = 0; i < 100; i++) {
      const q = d.generate(rng);
      assert.ok(q.answer >= 0 && q.answer < q.choices.length, `${d.id}: 正解番号`);
      assert.equal(new Set(q.choices).size, q.choices.length, `${d.id}: 選択肢が重複 ${q.choices}`);
      assert.ok(q.explain && q.prompt, d.id);
    }
  }
});

test('ドリル「どっちが強い？」: 正解が役判定と一致', () => {
  const rng = seededRandom(9);
  const drill = DRILLS.find((d) => d.id === 'compare');
  for (let i = 0; i < 200; i++) {
    const q = drill.generate(rng);
    const [board, a, b] = q.visuals.map((v) => v.cards);
    const sa = scoreHand([...a, ...board]);
    const sb = scoreHand([...b, ...board]);
    assert.equal(q.answer, sa > sb ? 0 : sa < sb ? 1 : 2);
  }
});

test('ドリル「アウツ」: 正解の枚数が4枚以上', () => {
  const rng = seededRandom(1);
  const drill = DRILLS.find((d) => d.id === 'outs');
  for (let i = 0; i < 50; i++) {
    const q = drill.generate(rng);
    assert.ok(parseInt(q.choices[q.answer], 10) >= 4);
  }
});

test('アドバイス（プリフロップ）: AAはレイズ、72oはフォールド、ボタンのA-10はレイズ', () => {
  const base = { numPlayers: 6, toCallBB: 1, raised: false, canCheck: false };
  assert.equal(preflopAdvice({ ...base, hole: parseCards('As Ah'), position: 'UTG' }).action, 'raise');
  assert.equal(preflopAdvice({ ...base, hole: parseCards('7c 2d'), position: 'BTN' }).action, 'fold');
  assert.equal(preflopAdvice({ ...base, hole: parseCards('As Td'), position: 'BTN' }).action, 'raise');
  assert.equal(preflopAdvice({ ...base, hole: parseCards('As Td'), position: 'UTG' }).action, 'fold');
  assert.equal(preflopAdvice({ ...base, hole: parseCards('7c 2d'), position: 'BB', canCheck: true, toCallBB: 0 }).action, 'check');
  assert.equal(preflopAdvice({ ...base, hole: parseCards('Ks Kh'), position: 'BB', raised: true, toCallBB: 30 }).action, 'raise');
});

test('アドバイス（フロップ以降）: ポットオッズで判断する', () => {
  const common = { opponents: 1, street: 'turn', hole: parseCards('2c 3d'), board: parseCards('Kh 9s 7d Jc') };
  assert.equal(postflopAdvice({ ...common, equity: 0.3, toCall: 50, pot: 150 }).action, 'call'); // 必要 25%
  assert.equal(postflopAdvice({ ...common, equity: 0.2, toCall: 50, pot: 150 }).action, 'fold');
  assert.equal(postflopAdvice({ ...common, equity: 0.9, toCall: 0, pot: 100 }).action, 'bet');
  assert.equal(postflopAdvice({ ...common, equity: 0.4, toCall: 0, pot: 100 }).action, 'check');
});

test('判定: おすすめとの比較', () => {
  assert.equal(judge('call', { action: 'call' }).mark, 'good');
  assert.equal(judge('fold', { action: 'call' }).mark, 'bad');
  assert.equal(judge('call', { action: 'fold' }).mark, 'bad');
  assert.equal(judge('raise', { action: 'call' }).mark, 'ok');
  assert.equal(judge('raise', { action: 'check', alt: 'bet' }).mark, 'good');
  assert.equal(judge('call', { action: 'fold' }, 'preflop').text, '弱い手で参加しすぎ');
});

test('アドバイスの理由: 手の5段階評価と言葉が食い違わない', () => {
  const base = { numPlayers: 4, toCallBB: 1, raised: false, canCheck: false };
  const kq = preflopAdvice({ ...base, hole: parseCards('Kc Qs'), position: 'UTG' });
  assert.equal(kq.action, 'raise');
  assert.ok(kq.reason.includes('（まあまあ）') && !kq.reason.includes('強い手'), kq.reason);
  const aa = preflopAdvice({ ...base, hole: parseCards('As Ah'), position: 'UTG' });
  assert.ok(aa.reason.includes('とても強い手'), aa.reason);
  const ak = preflopAdvice({ ...base, hole: parseCards('Ah Kc'), position: 'UTG' });
  assert.ok(ak.reason.includes('（強い）は強い手'), ak.reason);
});
