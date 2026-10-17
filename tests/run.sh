#!/bin/sh
# Node.js があれば Node で、無ければ macOS 標準の JavaScriptCore でテストを実行する
cd "$(dirname "$0")/.." || exit 1
if command -v node >/dev/null 2>&1; then
  exec node tests/run.js
fi
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc
exec "$JSC" -m tests/run.js
