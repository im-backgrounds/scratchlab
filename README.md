# ScratchLab

ブラウザーで動作するDJスクラッチ練習アプリです。依存パッケージやビルド手順はありません。JavaScriptはネイティブES Modulesで読み込みます。

## 構成

```text
index.html
assets/css/styles.css
src/
  app.js
  audio/scratch-audio.js
  data/chart-catalog.js
  domain/score-compiler.js
  ui/scratch-visualizer.js
docs/
  project-brief.md
  score-format.md
```

- `src/app.js`: 画面状態、操作、再生進行をまとめるアプリケーション層
- `src/data/chart-catalog.js`: プリセット譜面
- `src/domain/score-compiler.js`: 譜面記号の解析とイベント変換
- `src/audio/scratch-audio.js`: Web Audioによる音源生成と再生
- `src/ui/scratch-visualizer.js`: SVG譜面描画
- `assets/css/styles.css`: アプリ全体のスタイル
- `docs/`: 要件メモと譜面データ仕様

## 起動

ワークスペースのルートで次を実行し、`http://localhost:8000/`を開きます。

```sh
python3 -m http.server 8000
```

## テスト

Denoの組み込みテストランナーでドメイン処理、再生制御、SVG出力の回帰テストを実行します。

```sh
deno test --allow-read=tests/ui/snapshots
```
