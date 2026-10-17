// 練習ドリル画面

import { DRILLS, QUESTIONS_PER_DRILL } from '../content/drills.js';
import { load, update, checkMissions } from '../store/storage.js';
import { cardHTML } from './cards.js';
import { escapeHTML, notifyMissions } from './util.js';

function message(score, total) {
  const r = score / total;
  if (r === 1) return 'パーフェクト！完璧です 🎉';
  if (r >= 0.8) return 'すばらしい！かなり身についています';
  if (r >= 0.5) return 'いい調子！解説を読んでもう一度挑戦しよう';
  return 'まずはレッスンを復習してから挑戦してみよう';
}

export function mountDrill(app, { navigate }) {
  let view = { screen: 'menu' };

  const header = (title, back) => `
    <div class="setup-head">
      <button class="back-btn" data-act="${back}" aria-label="戻る">‹</button>
      <h2>${title}</h2>
    </div>`;

  function renderMenu() {
    const prog = load().progress.drills;
    app.innerHTML = `
      <div class="page">
        ${header('🎯 練習ドリル', 'home')}
        <p class="page-note">1回 ${QUESTIONS_PER_DRILL} 問。問題は毎回ランダムに作られます</p>
        <div class="menu">
          ${DRILLS.map((d) => {
            const p = prog[d.id];
            return `<button class="menu-item" data-drill="${d.id}">
              <span class="icon">${d.icon}</span>
              <span class="label"><b>${d.title}</b><small>${d.desc}</small></span>
              ${p ? `<span class="badge-done">最高 ${p.best}/${QUESTIONS_PER_DRILL}</span>` : '<span aria-hidden="true">›</span>'}
            </button>`;
          }).join('')}
        </div>
      </div>`;
  }

  function renderQuestion() {
    const drill = DRILLS.find((d) => d.id === view.drillId);
    const q = view.question;
    const answered = view.picked != null;
    const correct = answered && view.picked === q.answer;
    const highlight = new Set(answered && q.bestCards ? q.bestCards : []);
    app.innerHTML = `
      <div class="page lesson">
        ${header(`${drill.icon} ${drill.title}`, 'menu')}
        <p class="quiz-count">問題 ${view.index + 1} / ${QUESTIONS_PER_DRILL}　正解 ${view.score}</p>
        <article class="lesson-card">
          <h3 class="quiz-q">${q.prompt}</h3>
          ${
            q.visuals.length
              ? `<div class="visual">${q.visuals
                  .map(
                    (v) => `<div class="card-row"><span class="row-label">${v.label}</span>
                    <div class="cards">${v.cards.map((c) => cardHTML(c, highlight.has(c) ? 'highlight' : '')).join('')}</div></div>`,
                  )
                  .join('')}</div>`
              : ''
          }
          <div class="choices ${q.choices.length === 4 ? 'grid2' : ''}">
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
        ${answered ? `<div class="nav-row single"><button class="btn btn-primary" data-act="next-q">${view.index === QUESTIONS_PER_DRILL - 1 ? '結果を見る' : '次の問題'}</button></div>` : ''}
      </div>`;
  }

  function renderResult() {
    const drill = DRILLS.find((d) => d.id === view.drillId);
    let best = 0;
    update((d) => {
      const p = d.progress.drills[drill.id] || { plays: 0, best: 0 };
      p.plays++;
      p.best = Math.max(p.best, view.score);
      p.lastScore = view.score;
      d.progress.drills[drill.id] = p;
      best = p.best;
    });
    notifyMissions(checkMissions({ type: 'drill', id: drill.id, score: view.score, total: QUESTIONS_PER_DRILL }));
    app.innerHTML = `
      <div class="page lesson">
        ${header(`${drill.icon} ${drill.title}`, 'menu')}
        <article class="lesson-card center">
          <div class="big-emoji">${view.score === QUESTIONS_PER_DRILL ? '🏆' : view.score >= 7 ? '🎉' : '📝'}</div>
          <h3>${view.score} / ${QUESTIONS_PER_DRILL} 問正解</h3>
          <p>${message(view.score, QUESTIONS_PER_DRILL)}</p>
          <p class="page-note">これまでの最高: ${best} 問</p>
        </article>
        <div class="stack-btns">
          <button class="btn btn-primary" data-act="retry">もう一度</button>
          <button class="btn" data-act="menu">ドリルの一覧へ</button>
        </div>
      </div>`;
  }

  function newQuestion() {
    const drill = DRILLS.find((d) => d.id === view.drillId);
    view.question = drill.generate(Math.random);
    view.picked = null;
  }

  function start(drillId) {
    view = { screen: 'question', drillId, index: 0, score: 0 };
    newQuestion();
  }

  function render() {
    window.scrollTo(0, 0);
    if (view.screen === 'menu') renderMenu();
    else if (view.screen === 'question') renderQuestion();
    else renderResult();
  }

  app.addEventListener('click', (e) => {
    const drillBtn = e.target.closest('[data-drill]');
    if (drillBtn) {
      start(drillBtn.dataset.drill);
      render();
      return;
    }
    const choice = e.target.closest('[data-choice]');
    if (choice && view.screen === 'question' && view.picked == null) {
      view.picked = Number(choice.dataset.choice);
      if (view.picked === view.question.answer) view.score++;
      renderQuestion();
      return;
    }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    switch (btn.dataset.act) {
      case 'home':
        navigate('home');
        return;
      case 'menu':
        view = { screen: 'menu' };
        break;
      case 'next-q':
        if (view.index < QUESTIONS_PER_DRILL - 1) {
          view.index++;
          newQuestion();
        } else view.screen = 'result';
        break;
      case 'retry':
        start(view.drillId);
        break;
      default:
        return;
    }
    render();
  });

  render();
}
