// 勝率計算を画面の処理とは別のスレッドで行う
import { estimateEquity } from '../core/equity.js';

self.onmessage = (e) => {
  const { id, args } = e.data;
  self.postMessage({ id, result: estimateEquity(args) });
};
