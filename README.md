# ポーカー道場

テキサスホールデム・ポーカーを基礎から学べる、iPhone向けの学習＆対戦ゲーム（CPU対戦のみ・ゲーム内チップのみ）。

## 遊び方（ローカル）

ES Modules を使っているため、`index.html` を直接開くのではなく、簡易サーバー経由で開いてください。

```sh
cd poker-dojo
python3 -m http.server 8000
```

- Mac: http://localhost:8000
- iPhone（同じWi-Fi）: `http://<MacのIPアドレス>:8000`（IPは「システム設定 → Wi-Fi → 詳細」で確認）

## テスト

```sh
./tests/run.sh
```

Node.js があれば Node.js で、無ければ macOS 標準の JavaScriptCore で実行します。
ブラウザで `tests/index.html` を開いても実行できます。

## 構成

```
js/core/   ルール・役判定・勝率計算（DOM非依存・テスト対象）
js/ai/     CPUの思考、スターティングハンド評価、初心者向けアドバイス
js/content/ レッスン本文、ドリル問題の自動生成
js/workers/ 勝率計算の Web Worker
js/ui/     画面
js/store/  localStorage への保存
tests/     テスト
```

## 進捗

- [x] フェーズ① 基本ルールで1対1対戦
- [x] フェーズ② 複数人＋CPU強化
- [x] フェーズ③ レッスン・ドリル・ヒント付き対戦
- [ ] フェーズ④ トーナメント・ミッション・成績図鑑
