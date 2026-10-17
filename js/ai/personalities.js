// CPU の性格（プレイスタイル）と強さ（読みの深さ）の定義

/**
 * looseness   参加の広さ。正なら弱い手でも参加する（チェン点数への加算）
 * aggression  強い手のときにレイズ/ベットする確率の高さ（0〜1）
 * bluff       弱い手でベットする（ブラフ）傾向（0〜1）。強さの bluffScale を掛けて使う
 * stickiness  降りにくさ。正ならポットオッズより不利でもコールしがち
 */
export const PERSONALITIES = {
  cautious: {
    id: 'cautious',
    label: '慎重型',
    avatar: '🐢',
    desc: '強い手でしか参加しない。少しでも不利だと降りやすい',
    looseness: -1.5,
    aggression: 0.35,
    bluff: 0.04,
    stickiness: -0.06,
  },
  aggressive: {
    id: 'aggressive',
    label: '攻撃型',
    avatar: '🦁',
    desc: 'よく参加し、レイズやブラフで圧力をかけてくる',
    looseness: 1.5,
    aggression: 0.85,
    bluff: 0.32,
    stickiness: 0.02,
  },
  station: {
    id: 'station',
    label: 'コール好き',
    avatar: '🐻',
    desc: 'なかなか降りず、コールでついてくる。自分からはあまり攻めない',
    looseness: 2.5,
    aggression: 0.15,
    bluff: 0.04,
    stickiness: 0.12,
  },
  solid: {
    id: 'solid',
    label: '堅実型',
    avatar: '🦊',
    desc: '参加する手は絞るが、参加したら強気に攻める正統派',
    looseness: -0.5,
    aggression: 0.7,
    bluff: 0.14,
    stickiness: 0,
  },
};

/**
 * bluffScale   性格のブラフ傾向に掛ける倍率（初級は 0 = ブラフしない）
 * noise        判断のブレ（勝率の見積もり誤差）
 * usePosition  ポジションを考えるか
 * usePotOdds   ポットオッズで判断するか
 * useRanges    相手のレンジ（持っていそうな手）を推定するか
 * exploit      相手の傾向を覚えて突くか
 */
export const LEVELS = {
  beginner: {
    id: 'beginner',
    label: '初級',
    desc: '自分の手の強さだけで判断する。ブラフはしない',
    bluffScale: 0,
    noise: 0.12,
    usePosition: false,
    usePotOdds: false,
    useRanges: false,
    exploit: false,
    iterations: 300,
  },
  intermediate: {
    id: 'intermediate',
    label: '中級',
    desc: '勝率とポットオッズ、ポジションを考える。ブラフは控えめ',
    bluffScale: 0.5,
    noise: 0.06,
    usePosition: true,
    usePotOdds: true,
    useRanges: false,
    exploit: false,
    iterations: 500,
  },
  advanced: {
    id: 'advanced',
    label: '上級',
    desc: '相手のレンジを読み、ブラフや継続ベットを使い分ける。あなたのクセも覚える',
    bluffScale: 1,
    noise: 0.02,
    usePosition: true,
    usePotOdds: true,
    useRanges: true,
    exploit: true,
    iterations: 700,
  },
};

const NAMES = ['タケシ', 'ハナコ', 'ケンジ', 'ユミ', 'ゴロウ', 'サクラ', 'ジロウ', 'ミキ', 'ダイスケ', 'アヤ', 'リョウ', 'ナナ', 'シンジ', 'メグ'];

let serial = 0;

/**
 * CPUキャラクターを1人作る
 * @param {object} o
 * @param {string} o.level beginner | intermediate | advanced
 * @param {string} [o.personality] 省略時はランダム
 * @param {string[]} [o.usedNames] 同じ卓で名前が重ならないように
 */
export function createCpu({ level, personality, usedNames = [], rng = Math.random }) {
  const pids = Object.keys(PERSONALITIES);
  const pid = personality || pids[Math.floor(rng() * pids.length)];
  const free = NAMES.filter((n) => !usedNames.includes(n));
  const name = free.length ? free[Math.floor(rng() * free.length)] : `CPU${serial + 1}`;
  const p = PERSONALITIES[pid];
  serial++;
  return {
    id: `cpu${serial}`,
    name,
    avatar: p.avatar,
    level,
    personality: pid,
    style: `${p.label}・${LEVELS[level].label}`,
  };
}
