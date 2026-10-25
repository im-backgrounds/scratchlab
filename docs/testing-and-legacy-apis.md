# Testing and Legacy APIs

This is a technical reference, not a task backlog. Work and current validation
results are tracked in
[GitHub Issues](https://github.com/im-backgrounds/scratchlab/issues) and
[ScratchLab Development](https://github.com/users/im-backgrounds/projects/3).

## Deprecated API・利用箇所

旧APIは残置する。新しい互換レイヤーを作らず、移行整理を理由に削除しない。
正式ランタイムの採点はv2のみを使用する。

| API                                  | 定義                                 | 呼び出し元・依存                                                                                                                                                                                                                                | 正式API                                   |
| ------------------------------------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `createExpectedEvents`               | `src/domain/performance-analysis.js` | 同ファイルの`analyzePerformanceTiming`、`tests/domain/performance-analysis_test.js`、`tests/domain/challenge-session_test.js`                                                                                                                   | `createExpectedTimeline`                  |
| `analyzePerformance`                 | 同上                                 | 同ファイルの`analyzePerformanceLoops`、`tests/domain/performance-analysis_test.js`、`tests/state/performance-recording_test.js`                                                                                                                 | `matchPerformanceTimeline`                |
| `analyzePerformanceLoops`            | 同上                                 | `tests/domain/performance-analysis_test.js`、`tests/domain/challenge-session_test.js`                                                                                                                                                           | `matchPerformanceTimeline`とv2 Loop State |
| `analyzePerformanceTiming`           | 同上                                 | `tests/domain/performance-analysis_test.js`                                                                                                                                                                                                     | `analyzeTimelineTiming`                   |
| `createExpectedEventTicks`（非公開） | 同上                                 | 同ファイルの`analyzePerformanceTiming`                                                                                                                                                                                                          | `createExpectedTimeline`のtick            |
| `createStopDetector`（公開入口）     | `src/domain/midi-mapping.js`         | 同ファイルの`createStopObserver`、`tests/domain/midi-mapping_test.js`、`tests/domain/performance-analysis_test.js`、`tests/domain/challenge-session_test.js`、`tests/state/midi-recording_test.js`、`tests/state/performance-recording_test.js` | 入力観測は`createStopObserver`            |
| `createStopDetector().flush`         | 同上                                 | 上記のうち`midi-mapping_test.js`、`performance-analysis_test.js`、`challenge-session_test.js`                                                                                                                                                   | v2にflushはない                           |

`createStopDetector`の公開利用は非推奨だが、タイマー本体は
`createStopObserver`が使用する。関数全体を単純削除してはならない。

旧Overlay専用の`getExpectedOverlayEvents`・`getOverlayErrors`と旧描画本体は App
Integrationで撤去済み。復元や`@deprecated`スタブの追加はしない。

### 削除を検討するときの前提

- v1採点4 APIと非公開`createExpectedEventTicks`は、旧回帰テストの保存方法を
  決めてから削除を検討する。
- 停止検出の旧形式公開入口・`flush`は共有タイマーとv1再現テストの依存分離前に
  削除しない。
- `getEventKind`・`alignSequences`・`createEmptyTally`等の共有補助関数は
  v2でも使用する。旧APIと一緒に削除しない。
- テスト全体を不要として削除する判断はしていない。

これらは削除を約束するタスクではない。着手時は根拠と互換性を確認してIssue化する。

## テスト分類

移行を理由にテストを削除・移動・期待値変更しない。
旧仕様の特性テスト成功は、v2の受入成功を意味しない。

### A. Event Model v2受入テスト — 維持

| ファイル                                                     | 対象                                                        |
| ------------------------------------------------------------ | ----------------------------------------------------------- |
| `tests/domain/performance-matching_test.js`                  | 正式モデル番号、理想入力100%、対応ペア、初期状態、半開区間  |
| `tests/domain/timing-analysis-v2_test.js`                    | 共通ペア、4指標、対象外イベント、測定不能                   |
| `tests/domain/performance-overlay_test.js`                   | SAMPLE/YOU/ERRORとMatching/Timing件数一致                   |
| `tests/features/performance-view_test.js`                    | 共通分析、保存形式維持、過去記録未採点、上限超過            |
| `tests/features/practice-view_test.js`                       | デモ除外、将来Missing防止、停止位置固定、遅延Stop、結果共有 |
| `tests/domain/performance-analysis_test.js`の`v2 timeline`群 | Meaning Event生成、同方向統合、FC3、各譜面                  |

### B. 回帰テスト・現行共通機能 — 維持

| ファイル・範囲                                                                                                               | 対象                                                 |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `tests/domain/playback_test.js`、`tests/domain/playback-controller_test.js`、`tests/application/playback-controller_test.js` | 再生規則・タイマーAPI・アプリケーション再生制御      |
| `tests/domain/midi-mapping_test.js`                                                                                          | マッピング、圧縮、停止観測、取消・古いタイマー排除   |
| `tests/domain/challenge-session_test.js`                                                                                     | 進行制御、v2境界・Stop観測、デモから記録への状態保持 |
| `tests/state/performance-recording_test.js`、`midi-recording_test.js`                                                        | 記録・圧縮・保存、v2境界保持                         |
| `tests/domain/performance_test.js`、`bpm-challenge_test.js`                                                                  | 保存とChallengeの既存動作                            |
| その他のdomain/state/uiテスト                                                                                                | 譜面・Builder・Repository・Storage・描画・入力ログ   |

### C. v1特性・不整合再現テスト — 資料として維持

- `performance-analysis_test.js`の旧期待生成・旧照合・旧Timing・flush群。
- 同ファイルの`v1 regression`群：Chirp 72.3%、Flare 75.8%。
  これらは旧結果でありv2の目標値ではない。
- `midi-mapping_test.js`の同方向＋フェーダーカット圧縮の`v1 regression`。
  圧縮動作自体は現行でも正しいため残す。
- `performance-recording_test.js`の小節/ループresetによる重複生成の
  `v1 regression`群。旧処理を明示的に再現する。
- `challenge-session_test.js`の旧flush/境界Stop/旧採点を使う再現群。
- `midi-recording_test.js`と`performance-recording_test.js`の旧Stop形式を使う
  記録テストは既存保存表現の回帰としても維持する。

複数分類が混在するため、Cを含むという理由でファイル単位に削除しない。
全分類を既存の`deno test`で引き続き実行する。

## 記録と現在の結果を区別する

テスト分類・過去の成功記録は現在のCI成功を保証しない。
実施日時・対象コミット・コマンド・結果はIssue/PRに記録する。
実機MIDIとSimulator、自動E2Eと手動、実タッチとエミュレーションを区別する。
実行方法は[README](../README.md#テストチェック)と
[MIDI E2E](../tests/e2e/midi/README.md)を参照。
