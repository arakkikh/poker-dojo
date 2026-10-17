// 勝率計算の呼び出し口。Web Worker が使えればそちらで、使えなければその場で計算する。

import { estimateEquity } from '../core/equity.js';

let worker = null;
let failed = false;
let seq = 0;
const pending = new Map();

function fallbackAll() {
  failed = true;
  worker = null;
  for (const [id, p] of pending) {
    pending.delete(id);
    p.resolve(estimateEquity(p.args));
  }
}

function getWorker() {
  if (failed) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('../workers/equity.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      clearTimeout(p.timer);
      p.resolve(e.data.result);
    };
    worker.onerror = fallbackAll;
  } catch {
    failed = true;
    worker = null;
  }
  return worker;
}

/** @param {Parameters<typeof estimateEquity>[0]} args */
export function computeEquity(args) {
  const w = getWorker();
  if (!w) return Promise.resolve(estimateEquity(args));
  return new Promise((resolve) => {
    const id = ++seq;
    // 古い端末などで Worker が応答しないときは、その場で計算する
    const timer = setTimeout(() => {
      if (pending.delete(id)) resolve(estimateEquity(args));
    }, 4000);
    pending.set(id, { resolve, args, timer });
    w.postMessage({ id, args });
  });
}
