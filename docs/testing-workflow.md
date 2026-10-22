# 開発者向けテスト手順

この文書は、ローカルのテスト・チェックとGitHub
Actionsの現行手順をまとめたものです。
テスト分類の詳細は[テスト技術参照](testing-and-legacy-apis.md#テスト分類)、 MIDI
E2EのシナリオとSimulatorの仕組みは
[MIDI E2E Suite](../tests/e2e/midi/README.md)を参照してください。

## テスト構成

| 種別               | 対象と目的                                                                                                                              | ローカル実行                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Unit tests         | `tests/`のdomain、state、features、services、UIなどのテストで、各機能と回帰を検証します。v1特性の再現テストも既存スイートに含まれます。 | `deno test --allow-read=tests/ui/snapshots --ignore=tests/e2e`                               |
| Browser / MIDI E2E | 実際のアプリをChromiumで起動し、仮想MIDI入力を使ってChallengeの入力から結果までを検証します。実機MIDIは不要です。                       | 下記「MIDI E2E」                                                                             |
| Coverage           | Unit test実行時に読み込まれた対象モジュールの計測結果をテキストとHTMLに出力します。E2Eは含みません。                                    | `deno task coverage`                                                                         |
| Type check         | アプリのエントリーポイントとdomain、features、state、UIのテストを型チェックします。                                                     | `deno check src/app.js tests/domain/*.js tests/features/*.js tests/state/*.js tests/ui/*.js` |
| Lint               | `src/`と`tests/`のLintを実行します。                                                                                                    | `deno lint src tests`                                                                        |
| Format             | リポジトリ全体のフォーマットを確認します。SVG snapshotは対象外です。                                                                    | `deno fmt --check --unstable-component --ignore='tests/ui/snapshots/*.svg' .`                |

Issue #17・Event Model v2の受入条件や旧テストの位置づけは
[テスト分類](testing-and-legacy-apis.md#テスト分類)を確認してください。
Coverageの割合だけで受入や採点の正しさを判断しません。

## 必要な環境

- Deno 2。通常のチェック、Unit tests、Coverageに必要です。
- Node.js 22とnpm。MIDI E2E用Chromiumを初めて導入するときに必要です。
- MIDI E2EはPlaywright
  1.56.1のChromiumを使います。アプリ本体にnpm依存やビルド手順はありません。

## ローカル実行

リポジトリのルートで実行します。Denoは追加のパッケージセットアップなしで使えます。

### 標準チェックとUnit tests

CIと同じコマンドは次のとおりです。

```sh
deno fmt --check --unstable-component --ignore='tests/ui/snapshots/*.svg' .
deno check src/app.js tests/domain/*.js tests/features/*.js tests/state/*.js tests/ui/*.js
deno lint src tests
deno test --allow-read=tests/ui/snapshots --ignore=tests/e2e
```

Unit testsだけを実行するときは最後の`deno test`を使います。
Coverageタスクも同じUnit test
suiteを実行するため、両方実行するとテストが重複します。

### Coverage

```sh
deno task coverage
```

このタスクはUnit testsを実行し、テキスト集計を`coverage/summary.txt`、
HTMLレポートを`coverage/html/index.html`に生成します。HTMLレポートは
ブラウザーで`coverage/html/index.html`を開いて確認できます。
タスクとレポート生成の実装は[Coverage設定](../deno.json)と
[生成スクリプト](../scripts/coverage.sh)を参照してください。

現在の範囲はUnit
testsで読み込まれ、`^file:.*/src/`のincludeパターンに一致するモジュールです。
テストコード、スクリプト、依存パッケージ、Browser E2Eは含まれません。
未ロードの`src/`モジュールは0%として分母に加えられず、集計値はアプリ全体のカバー率を示しません。
Coverage閾値はありません。

**既知の制限:**
include正規表現はリポジトリルートからのパスに限定されていません。
パス内に`/src/`があるファイルにも一致し得るという指摘があり、このIssueの変更では修正していません。
したがって対象範囲はスクリプトの現在の正規表現に基づくもので、
厳密にリポジトリ直下の`src/`だけであることは保証されません。

### Browser / MIDI E2E

リポジトリルートから、初回はChromiumを導入し、続けてcheckとtestを実行します。

```sh
deno task --config tests/e2e/deno.json install-browser
deno task --config tests/e2e/deno.json check
deno task --config tests/e2e/deno.json test
```

ブラウザー導入にはNode.js 22／npm、Deno taskのcheck/testにはDeno 2と
Playwright専用Chromiumが必要です。テストは実機MIDIや外部サーバーを使わず、
Simulator経由でアプリの入力からChallenge結果までを確認します。
E2Eに含まれるシナリオと個別のBPM Challenge回帰実行方法は
[MIDI E2E Suite](../tests/e2e/midi/README.md)を参照してください。

## GitHub Actionsでの確認

`.github/workflows/deno-ci.yml`はpushとpull requestで次の2ジョブを実行します。

- **Format, check, and test** (`ubuntu-latest`): Deno v2.xを設定し、Format、
  Type check、Lint、Coverage付きUnit testを実行します。Coverageタスクが
  `coverage/summary.txt`とHTMLを生成し、Job Summaryへテキスト集計を追加します。
  `unit-test-coverage` ArtifactにHTMLとsummaryを14日間保存します。
- **MIDI E2E suite** (`ubuntu-24.04`): Deno v2.xとNode.js 22を設定し、
  `npx --yes playwright@1.56.1 install --with-deps chromium`でChromiumを導入して、
  `deno task check`と`deno task test`を実行します。

CI結果を確認するには、該当するpushまたはpull requestの **Actions** チェックから
各ジョブの結果とログを開きます。Coverageの数値は成功した **Format, check, and
test** ジョブのSummaryにあります。HTMLを確認する場合は
ワークフロー実行のSummaryページにあるArtifactsから`unit-test-coverage`を
ダウンロードして展開し、展開先の`html/index.html`を開きます
（ローカル生成時は`coverage/html/index.html`です）。Artifactは14日後に失効します。
Coverageは情報提供で、閾値によるCI合否判定はありません。

## トラブルシューティング

- **Chromiumの起動・取得に失敗する:** Deno 2、Node.js 22、npmを確認し、
  初回導入コマンドを再実行してください。ローカルコマンドはPlaywright専用Chromiumを
  導入します。CIではOS依存も含む`install --with-deps chromium`を実行します。
- **E2EでMIDI接続に失敗する:** このE2Eは実機ではなく仮想MIDIを使います。
  まずブラウザー導入が完了していることを確認し、E2Eの`check`、`test`を順に実行してください。
  実機固有の接続問題の確認にはなりません。
- **Coverageが失敗する:** `deno task coverage`はテストまたはレポート生成の失敗で
  非ゼロ終了します。コマンド出力で失敗した段階を確認してください。
  出力先はGit管理対象外の`coverage/`です。
- **ローカルとCIの結果が異なる:** Denoのバージョンを確認し、各ジョブの実行環境
  （標準チェックは`ubuntu-latest`、MIDI
  E2Eは`ubuntu-24.04`）とログを比較してください。
  E2EのPlaywrightバージョンは1.56.1です。
