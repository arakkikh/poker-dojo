// 全テストの実行。
//   macOS:   ./tests/run.sh
//   Node.js: node tests/run.js
//   ブラウザ: tests/index.html を開く
import { run } from './lib.js';
import './evaluator.test.js';
import './game.test.js';
import './equity.test.js';
import './cpu.test.js';
import './content.test.js';

const log = globalThis.__testLog || globalThis.print || ((s) => console.log(s));
const ok = await run(log);

if (typeof process !== 'undefined' && process.exit) process.exit(ok ? 0 : 1);
else if (!globalThis.__testLog && !ok) throw new Error('テストに失敗しました');
