// トーナメントのルール（ブラインドの上がり方・順位・賞品）

export const BLIND_LEVELS = [
  { sb: 10, bb: 20, ante: 0 },
  { sb: 15, bb: 30, ante: 0 },
  { sb: 25, bb: 50, ante: 0 },
  { sb: 50, bb: 100, ante: 10 },
  { sb: 75, bb: 150, ante: 15 },
  { sb: 100, bb: 200, ante: 25 },
  { sb: 150, bb: 300, ante: 25 },
  { sb: 200, bb: 400, ante: 50 },
  { sb: 300, bb: 600, ante: 75 },
  { sb: 500, bb: 1000, ante: 100 },
  { sb: 800, bb: 1600, ante: 200 },
  { sb: 1000, bb: 2000, ante: 300 },
];

export const TOURNAMENT_SPEEDS = {
  normal: { label: 'ふつう', handsPerLevel: 8 },
  turbo: { label: 'ターボ', handsPerLevel: 5 },
};

export const TOURNAMENT_STACK = 1500;

/** n ハンド目（1始まり）のブラインドのレベル番号（0始まり） */
export function levelIndexForHand(handNumber, handsPerLevel) {
  const idx = Math.floor((handNumber - 1) / handsPerLevel);
  return Math.min(idx, BLIND_LEVELS.length - 1);
}

/** 次のレベルまでの残りハンド数（最終レベルなら null） */
export function handsUntilNextLevel(handNumber, handsPerLevel) {
  if (levelIndexForHand(handNumber, handsPerLevel) >= BLIND_LEVELS.length - 1) return null;
  return handsPerLevel - ((handNumber - 1) % handsPerLevel);
}

/**
 * このハンドで脱落したプレイヤーに順位を付ける。
 * 同じハンドで複数人が脱落したら、ハンド開始時のチップが多かった人を上位にする。
 * @param {{id:string, startStack:number, stack:number}[]} handPlayers ハンド参加者
 * @param {number} remainingBefore ハンド開始時に残っていた人数
 * @returns {{id:string, place:number}[]}
 */
export function placeEliminated(handPlayers, remainingBefore) {
  const busted = handPlayers.filter((p) => p.stack <= 0).sort((a, b) => a.startStack - b.startStack);
  // 開始時チップが少ない順に下位から
  return busted.map((p, i) => ({ id: p.id, place: remainingBefore - i }));
}

/** 順位ごとのコイン報酬 */
export function prizeFor(place, players) {
  if (place === 1) return 300;
  if (place === 2) return 150;
  if (place === 3 && players >= 5) return 80;
  return 20; // 参加賞
}
