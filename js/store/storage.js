// 成績・進行状況の保存（localStorage）

import { MISSIONS, CARD_BACKS } from '../content/missions.js';

const KEY = 'poker-dojo';
const VERSION = 1;

function defaultData() {
  return {
    version: VERSION,
    stats: {
      hands: 0, // プレイしたハンド数
      handsWon: 0, // ポットを獲得したハンド数
      vpip: 0, // プリフロップで自分から参加した（コール/レイズ）ハンド数
      pfr: 0, // プリフロップでレイズしたハンド数
      showdowns: 0,
      showdownsWon: 0,
      biggestPot: 0,
      totalNet: 0,
      matchesWon: 0, // CPUのチップを全部取った回数
      tournaments: 0,
      tournamentWins: 0,
      bestPlace: null,
    },
    profile: {
      coins: 0,
      cardBacks: ['red'], // 持っているカードの裏デザイン
      cardBack: 'red',
    },
    collection: {}, // 役カテゴリ番号 -> { count, firstAt }
    progress: {
      lessons: {}, // 章ID -> { done: true, quizBest: 正解数, quizTotal }
      drills: {}, // ドリルID -> { plays, best, lastScore }
      missions: {}, // ミッションID -> { at: 達成日時, claimed: 報酬を受け取ったか }
    },
    settings: {},
  };
}

/** 古い形式のデータを新しい形式に揃える（今後バージョンが上がったらここに移行処理を書く） */
function migrate(data) {
  const base = defaultData();
  return {
    ...base,
    ...data,
    version: VERSION,
    stats: { ...base.stats, ...(data.stats || {}) },
    profile: { ...base.profile, ...(data.profile || {}) },
    collection: { ...(data.collection || {}) },
    progress: {
      lessons: { ...((data.progress && data.progress.lessons) || {}) },
      drills: { ...((data.progress && data.progress.drills) || {}) },
      missions: { ...((data.progress && data.progress.missions) || {}) },
    },
    settings: { ...base.settings, ...(data.settings || {}) },
  };
}

let cache = null;

export function load() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? migrate(JSON.parse(raw)) : defaultData();
  } catch {
    cache = defaultData();
  }
  return cache;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // プライベートブラウズなどで保存できなくても遊べるようにする
  }
}

export function update(fn) {
  const data = load();
  fn(data);
  save();
  return data;
}

export function resetAll() {
  cache = defaultData();
  save();
}

/**
 * 1ハンドの結果を記録する
 * @returns {{newCategory:number|null}} 図鑑に初登録された役があれば返す
 */
export function recordHand({ net, won, vpip, pfr, showdown, showdownWon, potWon, category }) {
  let newCategory = null;
  update((d) => {
    const s = d.stats;
    s.hands++;
    if (won) s.handsWon++;
    if (vpip) s.vpip++;
    if (pfr) s.pfr++;
    if (showdown) s.showdowns++;
    if (showdownWon) s.showdownsWon++;
    s.biggestPot = Math.max(s.biggestPot, potWon || 0);
    s.totalNet += net;
    if (category != null) {
      const entry = d.collection[category];
      if (entry) entry.count++;
      else {
        d.collection[category] = { count: 1, firstAt: new Date().toISOString() };
        newCategory = category;
      }
    }
  });
  return { newCategory };
}

// ---------------- ミッション・コイン ----------------

/**
 * 出来事 ctx でミッションを判定し、新しく達成したものを返す
 * @returns {typeof MISSIONS}
 */
export function checkMissions(ctx) {
  const data = load();
  const done = MISSIONS.filter((m) => !data.progress.missions[m.id] && safeCheck(m, ctx, data));
  if (done.length) {
    update((d) => {
      for (const m of done) d.progress.missions[m.id] = { at: new Date().toISOString(), claimed: false };
    });
  }
  return done;
}

function safeCheck(m, ctx, data) {
  try {
    return !!m.check(ctx, data);
  } catch {
    return false;
  }
}

/** 達成済みミッションの報酬を受け取る */
export function claimMission(id) {
  const m = MISSIONS.find((x) => x.id === id);
  let got = 0;
  update((d) => {
    const st = d.progress.missions[id];
    if (!m || !st || st.claimed) return;
    st.claimed = true;
    d.profile.coins += m.reward;
    got = m.reward;
  });
  return got;
}

export function addCoins(n) {
  update((d) => {
    d.profile.coins += n;
  });
}

/** カードの裏デザインを買う（コイン不足なら false） */
export function buyCardBack(id) {
  const item = CARD_BACKS.find((c) => c.id === id);
  let ok = false;
  update((d) => {
    if (!item || d.profile.cardBacks.includes(id) || d.profile.coins < item.price) return;
    d.profile.coins -= item.price;
    d.profile.cardBacks.push(id);
    d.profile.cardBack = id;
    ok = true;
  });
  return ok;
}

export function setCardBack(id) {
  update((d) => {
    if (d.profile.cardBacks.includes(id)) d.profile.cardBack = id;
  });
}

/** トーナメントの結果を記録して、賞品のコインを渡す */
export function recordTournament(place, prize) {
  update((d) => {
    const s = d.stats;
    s.tournaments++;
    if (place === 1) s.tournamentWins++;
    s.bestPlace = s.bestPlace == null ? place : Math.min(s.bestPlace, place);
    d.profile.coins += prize;
  });
}
