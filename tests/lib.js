// 依存なしの小さなテストランナー。jsc / Node.js / ブラウザのどれでも動く。

const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

export class AssertionError extends Error {}

export const assert = {
  ok(value, msg = '値が真ではありません') {
    if (!value) throw new AssertionError(msg);
  },
  equal(actual, expected, msg = '') {
    if (actual !== expected) {
      throw new AssertionError(`${msg} 期待値: ${fmt(expected)} / 実際: ${fmt(actual)}`);
    }
  },
  deepEqual(actual, expected, msg = '') {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new AssertionError(`${msg} 期待値: ${fmt(expected)} / 実際: ${fmt(actual)}`);
    }
  },
  throws(fn, msg = '例外が発生しませんでした') {
    try {
      fn();
    } catch {
      return;
    }
    throw new AssertionError(msg);
  },
};

function fmt(v) {
  return typeof v === 'string' ? `"${v}"` : JSON.stringify(v);
}

export async function run(log) {
  let passed = 0;
  const failures = [];
  const start = Date.now();
  for (const t of tests) {
    try {
      await t.fn();
      passed++;
      log(`  ✓ ${t.name}`);
    } catch (e) {
      failures.push(t.name);
      log(`  ✗ ${t.name}\n      ${e && e.message}`);
      if (!(e instanceof AssertionError) && e && e.stack) log(e.stack);
    }
  }
  log(`\n${passed} 件成功 / ${failures.length} 件失敗 (${Date.now() - start}ms)`);
  return failures.length === 0;
}
