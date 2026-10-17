// 卓で見たプレイヤーの傾向を覚える（上級CPUが相手のクセを突くために使う）

export function createMemory() {
  return {};
}

function entry(memory, id) {
  if (!memory[id]) memory[id] = { hands: 0, vpip: 0, pfr: 0, facedBet: 0, foldToBet: 0 };
  return memory[id];
}

/** 終了したハンドのイベントから各プレイヤーの傾向を更新する */
export function observeHand(memory, hand) {
  const actions = hand.events.filter((e) => e.type === 'action');
  for (const p of hand.players) {
    const m = entry(memory, p.id);
    m.hands++;
    const pre = actions.filter((e) => e.playerId === p.id && e.street === 'preflop');
    if (pre.some((e) => e.action === 'call' || e.isRaise || e.action === 'allin')) m.vpip++;
    if (pre.some((e) => e.isRaise)) m.pfr++;
  }
  // フロップ以降、ベットに直面したときに降りたか
  for (const street of ['flop', 'turn', 'river']) {
    let betOpen = false;
    for (const e of actions.filter((a) => a.street === street)) {
      if (betOpen) {
        const m = entry(memory, e.playerId);
        m.facedBet++;
        if (e.action === 'fold') m.foldToBet++;
      }
      if (e.isRaise) betOpen = true;
    }
  }
}

/**
 * 傾向（サンプルが少ないうちは平均的な値に寄せる）
 * @returns {{vpip:number, pfr:number, foldToBet:number, hands:number}}
 */
export function tendencies(memory, id) {
  const m = (memory && memory[id]) || { hands: 0, vpip: 0, pfr: 0, facedBet: 0, foldToBet: 0 };
  const prior = 6; // 平均的なプレイヤー6ハンド分を混ぜる
  return {
    hands: m.hands,
    vpip: (m.vpip + 0.3 * prior) / (m.hands + prior),
    pfr: (m.pfr + 0.15 * prior) / (m.hands + prior),
    foldToBet: (m.foldToBet + 0.45 * prior) / (m.facedBet + prior),
  };
}
