// 成績・進行状況の保存（localStorage）

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
    },
    collection: {}, // 役カテゴリ番号 -> { count, firstAt }
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
    collection: { ...(data.collection || {}) },
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
