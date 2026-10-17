// 成績・図鑑画面

import { load } from '../store/storage.js';
import { LESSONS, HAND_RANKING } from '../content/lessons.js';
import { DRILLS, QUESTIONS_PER_DRILL } from '../content/drills.js';
import { parseCards } from '../core/cards.js';
import { cardHTML, backHTML } from './cards.js';
import { fmt } from './util.js';

// 7枚から作ったときの出現率（強い順）
const FREQ = ['0.003%', '0.03%', '0.17%', '2.6%', '3.0%', '4.6%', '4.8%', '23.5%', '43.8%', '17.4%'];

const rate = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '-');

function statRow(label, value, note = '') {
  return `<div class="stat-row"><div><b>${label}</b>${note ? `<small>${note}</small>` : ''}</div><span>${value}</span></div>`;
}

/** 参加率から初心者向けのひとこと */
function styleAdvice(s) {
  if (s.hands < 20) return 'あと少しプレイすると、あなたのプレイスタイルを分析できます（20ハンド以上）。';
  const vpip = s.vpip / s.hands;
  const pfr = s.pfr / s.hands;
  if (vpip > 0.4) return '参加率が高め（ルース）です。弱い手で参加しすぎていないか、スターティングハンドの章を見直してみましょう。';
  if (vpip < 0.15) return '参加率が低め（とても慎重）です。後ろのポジションでは、もう少し広く参加しても大丈夫です。';
  if (pfr < vpip * 0.4) return '参加率はちょうど良いですが、コールが多めです。参加するときはレイズで主導権を取ることも意識しましょう。';
  return '参加率・レイズ率ともにバランスが良いです。タイト＆アグレッシブのお手本どおり！';
}

export function mountStats(app, { navigate }) {
  let tab = 'stats';

  function renderStats(d) {
    const s = d.stats;
    const lessonsDone = LESSONS.filter((l) => d.progress.lessons[l.id]?.done).length;
    return `
      <section class="panel">
        <h3 class="section-title">🃏 対戦</h3>
        ${statRow('プレイしたハンド', fmt(s.hands))}
        ${statRow('ポット獲得率', rate(s.handsWon, s.hands), '獲得したハンドの割合')}
        ${statRow('参加率（VPIP）', rate(s.vpip, s.hands), '自分からチップを出して参加した割合。目安 20〜30%')}
        ${statRow('レイズ率（PFR）', rate(s.pfr, s.hands), 'プリフロップでレイズした割合。目安 15〜25%')}
        ${statRow('ショーダウン勝率', rate(s.showdownsWon, s.showdowns), `手札を見せ合った ${fmt(s.showdowns)} 回のうち勝った割合`)}
        ${statRow('最大獲得ポット', fmt(s.biggestPot))}
        ${statRow('通算収支', `<span class="${s.totalNet >= 0 ? 'plus' : 'minus'}">${s.totalNet >= 0 ? '+' : ''}${fmt(s.totalNet)}</span>`)}
        <p class="advice">💬 ${styleAdvice(s)}</p>
      </section>
      <section class="panel">
        <h3 class="section-title">🏆 トーナメント</h3>
        ${statRow('参加', `${s.tournaments} 回`)}
        ${statRow('優勝', `${s.tournamentWins} 回`)}
        ${statRow('最高順位', s.bestPlace ? `${s.bestPlace} 位` : '-')}
      </section>
      <section class="panel">
        <h3 class="section-title">📘 学習</h3>
        ${statRow('入門レッスン', `${lessonsDone} / ${LESSONS.length} 章`)}
        ${DRILLS.map((dr) => {
          const p = d.progress.drills[dr.id];
          return statRow(`${dr.icon} ${dr.title}`, p ? `最高 ${p.best}/${QUESTIONS_PER_DRILL}（${p.plays}回）` : '未挑戦');
        }).join('')}
      </section>`;
  }

  function renderBook(d) {
    const got = HAND_RANKING.filter((_, i) => d.collection[9 - i]).length;
    return `
      <p class="page-note">対戦でリバーまで残ったときの役が登録されます。${got} / ${HAND_RANKING.length} 種類</p>
      <div class="book">
        ${HAND_RANKING.map((h, i) => {
          const entry = d.collection[9 - i];
          const cards = parseCards(h.cards);
          return `<div class="book-item ${entry ? 'got' : ''}">
            <div class="book-head"><b>${entry ? h.name : '？？？'}</b><small>出現率 ${FREQ[i]}</small></div>
            <div class="cards">${cards.map((c) => (entry ? cardHTML(c) : backHTML())).join('')}</div>
            <small>${entry ? `${entry.count} 回達成・初達成 ${new Date(entry.firstAt).toLocaleDateString('ja-JP')}` : `ヒント: ${h.desc}`}</small>
          </div>`;
        }).join('')}
      </div>`;
  }

  function render() {
    const d = load();
    app.innerHTML = `
      <div class="page">
        <div class="setup-head">
          <button class="back-btn" data-act="home" aria-label="戻る">‹</button>
          <h2>📊 成績・図鑑</h2>
        </div>
        <div class="segmented tabs">
          <button class="${tab === 'stats' ? 'selected' : ''}" data-tab="stats">成績</button>
          <button class="${tab === 'book' ? 'selected' : ''}" data-tab="book">役の図鑑</button>
        </div>
        ${tab === 'stats' ? renderStats(d) : renderBook(d)}
      </div>`;
  }

  app.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.act === 'home') navigate('home');
    else if (t.dataset.tab) {
      tab = t.dataset.tab;
      render();
    }
  });

  render();
}
