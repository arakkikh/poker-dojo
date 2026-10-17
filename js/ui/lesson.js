// 入門レッスン画面

import { LESSONS, HAND_RANKING } from '../content/lessons.js';
import { parseCards } from '../core/cards.js';
import { load, update } from '../store/storage.js';
import { cardHTML } from './cards.js';
import { escapeHTML } from './util.js';

const cardsRow = (str, label) =>
  `<div class="card-row">${label ? `<span class="row-label">${label}</span>` : ''}<div class="cards">${parseCards(str).map((c) => cardHTML(c)).join('')}</div></div>`;

function rankingHTML() {
  return `<ol class="ranking">${HAND_RANKING.map(
    (h, i) => `<li><div class="rk-head"><span class="rk-no">${i + 1}</span><b>${h.name}</b></div>
      <div class="cards">${parseCards(h.cards).map((c) => cardHTML(c)).join('')}</div><small>${h.desc}</small></li>`,
  ).join('')}</ol>`;
}

export function mountLesson(app, { navigate }) {
  let view = { screen: 'list' };

  const header = (title, back) => `
    <div class="setup-head">
      <button class="back-btn" data-act="${back}" aria-label="戻る">‹</button>
      <h2>${title}</h2>
    </div>`;

  function renderList() {
    const prog = load().progress.lessons;
    const done = LESSONS.filter((l) => prog[l.id] && prog[l.id].done).length;
    app.innerHTML = `
      <div class="page">
        ${header('📘 入門レッスン', 'home')}
        <div class="progress-line"><div style="width:${(done / LESSONS.length) * 100}%"></div></div>
        <p class="page-note">${done} / ${LESSONS.length} 章クリア。上から順に進めるのがおすすめです</p>
        <div class="menu">
          ${LESSONS.map((l, i) => {
            const p = prog[l.id];
            const status = p && p.done ? `<span class="badge-done">✓ ${p.quizBest}/${p.quizTotal}</span>` : '<span aria-hidden="true">›</span>';
            return `<button class="menu-item ${p && p.done ? 'done' : ''}" data-chapter="${i}">
              <span class="icon">${l.icon}</span>
              <span class="label"><b>第${i + 1}章 ${l.title}</b><small>${l.summary}</small></span>
              ${status}
            </button>`;
          }).join('')}
        </div>
      </div>`;
  }

  function renderStep() {
    const lesson = LESSONS[view.chapter];
    const step = lesson.steps[view.step];
    const last = view.step === lesson.steps.length - 1;
    const dots = lesson.steps.map((_, i) => `<span class="${i === view.step ? 'on' : i < view.step ? 'past' : ''}"></span>`).join('');
    app.innerHTML = `
      <div class="page lesson">
        ${header(`第${view.chapter + 1}章 ${lesson.title}`, 'list')}
        <div class="dots">${dots}</div>
        <article class="lesson-card">
          <h3>${step.title}</h3>
          ${step.cards || step.board ? `<div class="visual">${step.cards ? cardsRow(step.cards, '手札') : ''}${step.board ? cardsRow(step.board, 'ボード') : ''}</div>` : ''}
          ${step.ranking ? rankingHTML() : ''}
          <div class="lesson-body">${step.body}</div>
        </article>
        <div class="nav-row">
          <button class="btn" data-act="prev" ${view.step === 0 ? 'disabled' : ''}>前へ</button>
          <button class="btn btn-primary" data-act="next">${last ? 'ミニクイズへ ✏️' : '次へ'}</button>
        </div>
      </div>`;
  }

  function renderQuiz() {
    const lesson = LESSONS[view.chapter];
    const q = lesson.quiz[view.q];
    const answered = view.picked != null;
    const correct = answered && view.picked === q.answer;
    app.innerHTML = `
      <div class="page lesson">
        ${header(`第${view.chapter + 1}章 ミニクイズ`, 'list')}
        <p class="quiz-count">問題 ${view.q + 1} / ${lesson.quiz.length}　正解 ${view.score}</p>
        <article class="lesson-card">
          <h3 class="quiz-q">${q.q}</h3>
          ${q.cards ? `<div class="visual">${cardsRow(q.cards)}</div>` : ''}
          <div class="choices">
            ${q.choices
              .map((c, i) => {
                let cls = '';
                if (answered && i === q.answer) cls = 'correct';
                else if (answered && i === view.picked) cls = 'wrong';
                return `<button class="choice ${cls}" data-choice="${i}" ${answered ? 'disabled' : ''}>${escapeHTML(c)}</button>`;
              })
              .join('')}
          </div>
          ${answered ? `<div class="feedback ${correct ? 'ok' : 'ng'}"><b>${correct ? '⭕ 正解！' : '❌ ざんねん'}</b><br>${q.explain}</div>` : ''}
        </article>
        ${answered ? `<div class="nav-row single"><button class="btn btn-primary" data-act="next-q">${view.q === lesson.quiz.length - 1 ? '結果を見る' : '次の問題'}</button></div>` : ''}
      </div>`;
  }

  function renderDone() {
    const lesson = LESSONS[view.chapter];
    const total = lesson.quiz.length;
    const perfect = view.score === total;
    const hasNext = view.chapter < LESSONS.length - 1;
    update((d) => {
      const prev = d.progress.lessons[lesson.id];
      d.progress.lessons[lesson.id] = {
        done: true,
        quizBest: Math.max(view.score, prev ? prev.quizBest : 0),
        quizTotal: total,
      };
    });
    app.innerHTML = `
      <div class="page lesson">
        ${header(`第${view.chapter + 1}章 クリア`, 'list')}
        <article class="lesson-card center">
          <div class="big-emoji">${perfect ? '🎉' : '👍'}</div>
          <h3>「${lesson.title}」クリア！</h3>
          <p>クイズ ${view.score} / ${total} 問正解${perfect ? '　パーフェクト！' : ''}</p>
        </article>
        <div class="stack-btns">
          ${hasNext ? `<button class="btn btn-primary" data-act="next-chapter">次の章へ（第${view.chapter + 2}章）</button>` : '<button class="btn btn-primary" data-act="to-cash">全章クリア！対戦で試してみよう</button>'}
          <button class="btn" data-act="retry">もう一度クイズ</button>
          <button class="btn" data-act="list">章の一覧へ</button>
        </div>
      </div>`;
  }

  function render() {
    window.scrollTo(0, 0);
    if (view.screen === 'list') renderList();
    else if (view.screen === 'step') renderStep();
    else if (view.screen === 'quiz') renderQuiz();
    else renderDone();
  }

  const startQuiz = () => {
    view = { ...view, screen: 'quiz', q: 0, score: 0, picked: null };
  };

  app.addEventListener('click', (e) => {
    const chapterBtn = e.target.closest('[data-chapter]');
    if (chapterBtn) {
      view = { screen: 'step', chapter: Number(chapterBtn.dataset.chapter), step: 0 };
      render();
      return;
    }
    const choice = e.target.closest('[data-choice]');
    if (choice && view.picked == null) {
      view.picked = Number(choice.dataset.choice);
      if (view.picked === LESSONS[view.chapter].quiz[view.q].answer) view.score++;
      renderQuiz();
      return;
    }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const lesson = LESSONS[view.chapter];
    switch (btn.dataset.act) {
      case 'home':
        navigate('home');
        return;
      case 'list':
        view = { screen: 'list' };
        break;
      case 'prev':
        view.step = Math.max(0, view.step - 1);
        break;
      case 'next':
        if (view.step < lesson.steps.length - 1) view.step++;
        else startQuiz();
        break;
      case 'next-q':
        if (view.q < lesson.quiz.length - 1) {
          view.q++;
          view.picked = null;
        } else view.screen = 'done';
        break;
      case 'retry':
        startQuiz();
        break;
      case 'next-chapter':
        view = { screen: 'step', chapter: view.chapter + 1, step: 0 };
        break;
      case 'to-cash':
        navigate('cash');
        return;
      default:
        return;
    }
    render();
  });

  render();
}
