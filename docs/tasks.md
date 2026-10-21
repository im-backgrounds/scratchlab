# ScratchLab Tasks

最終更新: 2026-10

## Status Legend

- [ ] 未着手
- [~] 作業中・追加検証待ち
- [x] 完了

## Current Implementation

**Event Model v2 — Completed**

現在のブランチを正式実装とする。
採点モデルは`EVENT_MODEL_VERSION = 2`。保存形式のバージョンとは独立。
Migration・データ初期化・変換・v1との互換レイヤー作成は行わない。 旧Migration
EpicとData Reset Validationは対象外とし、残タスクへ持ち越さない。
既存Storage・Progress・Achievementの処理とデータは維持する。

## Completed

### Epic 1 — Design Freeze

- [x] [Event Model v2仕様](event-model-v2.md)を正式版として確定

### Epic 2 — Expected Timeline

- [x] `createExpectedTimeline`でストローク・フェーダー変化を生成
- [x] 同方向継続を統合、FC3の閉開を保持
- [x] Baby・Chirp・Flareの期待イベントを再生成
- [x] 実アプリのv1期待生成経路を置換

### Epic 3 — Boundary Rework

- [x] 小節・ループ・デモ切替で物理状態を保持
- [x] 境界由来のreset・強制Stop生成を撤去
- [x] Loop Boundary snapshot・半開区間を定義
- [x] アプリ・Matching・Timing・Overlayへ接続
- [x] 境界でのイベント増殖とループ跨ぎの回帰テスト

### Epic 4 — Stop Handling Rework

- [x] Mouse／MIDIの停止観測とタイマー処理を共通化
- [x] 最後の入力元への引き継ぎ、操作解除時のキャンセル
- [x] 物理StopとLoop Boundaryを分離
- [x] Stop観測保持と方向状態更新を接続
- [x] Stopを採点・Timing・Overlayから除外

### Epic 5 — Matching Engine

- [x] レーン別の共通照合、対応ペア・Missing・Extra保持
- [x] Initial State Validationとクリア防止
- [x] 継続観測は一致に含め、架空入力を生成しない
- [x] Baby・Chirp・Flareの圧縮済み理想入力100%

### Epic 6 — Timing Analysis

- [x] Matchingと同じ対応ペアを利用
- [x] Signed Error、Average Error、Max Error、Timing Accuracy、Measured Count
- [x] Stop・境界・継続観測を除外
- [x] Missing／Extraを0msで補完しない
- [x] 測定件数0の指標はnull

### Epic 7 — Controller Overlay

- [x] SAMPLE＝Expected、YOU＝Recorded、ERROR＝Matching
- [x] Missing・Extra・Initial State Error表示
- [x] Matching／Timingと件数一致
- [x] 独自の期待生成・LCS照合処理を撤去
- [x] デモ除外、未到来イベントのMissing防止

### App Integration

- [x] BPM Challenge・Beginner Course・直後の結果・Controller Overlayへ接続
- [x] 同じ分析結果を共有し、別譜面へ流用しない
- [x] 保存形式維持、過去記録の未採点と再挑戦案内
- [x] 記録上限超過時の判定・進捗更新防止
- [x] Mouse＋Keyboard／模擬MIDIでBaby・Chirp・Flare 100%
- [x] Deprecated注記、README・Roadmap・リリースノート整理

既存のBPM Challenge、Practice Mode、Previous Result、Practice History、 Growth
Charts、Achievement、Beginner Course、初回ガイドの提供は継続する。

### MIDI Setup

- [x] 入力デバイス一覧・接続状態・入力デバイス選択を専用画面に集約
- [x] 選択デバイスを保存し、再読込後に復元
- [x] Crossfader／Scratch入力確認と最新20件のMIDI診断ログ
- [x] Lap 1をウォームアップ、Lap 2〜3を自動記録・採点し、Lap 3終了時に停止
- [x] Challengeの再挑戦と既存マッピング保存を維持

## Remaining

### 実機MIDI検証

- [ ] 実コントローラーでBaby・Chirp・Flareを確認
- [ ] フェーダー初期状態・連続入力・停止・境界跨ぎを確認
- [ ] Mouseと実機MIDIの同結果を確認

### E2E確認

- [~] 3対象譜面のブラウザー確認済み、全譜面・主要ブラウザーは未完了
- [ ] Forward Scratch・Backward Scratch・Transformerを含む網羅確認
- [ ] 中断・リトライ・初期状態エラー・記録上限の画面確認
- [~] 自動E2Eスイート整備（Baby Scratch MIDI Phase 1追加、全譜面は未完了）

### MIDI E2E Test Foundation — Phase 1

- [x] 仮想Web MIDIデバイスとtimestamp付きsend／sendMany API
- [x] UIからMIDI接続・Learn割当、本番入力→Recording→Matching→Timing→Overlay→結果
- [x] Baby Scratch 100%、Missing 0、Extra
      0、Timing有効件数、Challengeクリアの検証
- [x] Ghost／Replay取得・保存をE2E専用アダプターで無効化（本番コード変更なし）
- [x] 独立Chromium CIジョブ・Simulator単体テスト・実行手順
- [ ] Missing／Extra・初期状態エラー・中断／再挑戦・他譜面へ拡張

詳細: [MIDI E2E](../tests/e2e/midi/README.md)。

### Ghost Foundation

- [x] Phase 1 Ghost Storage: 保存・読込・取得・Best Run更新・Ghost専用クリア
- [x] v2のみ保存、Meaning Eventのみ保持、Timing nullの比較、破損・保存失敗テスト
- [x] Phase 2: クリアしたBPM Challenge結果をGhostRecordへ変換して自動保存
- [x] 未クリア・中断・分析欠損・v1・不正記録・Beginner Courseの保存拒否
- [x] Phase 3: 譜面選択時のBest Run取得とselectedGhostのランタイム保持
- [x] 譜面切替・Ghost無し・破損・読込拒否時のnull化、保存データ非変更テスト
- [x] Phase 5: Ghost Enable Stateとenable／disable／toggle／現在値取得API
- [x] 初期OFF・冪等操作・譜面切替で状態維持・Ghost無し・Storage非アクセスのテスト
- [x] Phase 6: Ghost TimelineのOverlayデータ変換（描画・採点・保存への接続なし）
- [x] Meaning Event保持・境界所属・不変性・再現性・既存YOU投影との整合テスト
- [x] Phase 7: Best Run更新時の元録音コンテキストをメモリー保持し、描画APIへ供給
- [x] SAMPLE／GHOST／YOU／ERRORの描画と4種マーカー・既存集計不変のテスト
- [ ] 再読込後のGhost表示／Replay接続時の元録音コンテキスト供給方法を設計
- [ ] 比較用記録と対応ペアの扱いを設計
- [x] Ghost Overlay描画（同一セッションのコンテキスト付きBest Runのみ）
- [ ] Ghost再生、Best Run／Previous Run比較

保存基盤とBPM Challengeクリア時の自動保存は完了。
譜面一覧・コース選択・起動時の復元後にBest Runを読込する。読込状態は保存しない。
元録音コンテキストを保持するBest RunはGhost行に表示する。ON/OFF操作UIは未接続。
再読込後の保存済みGhostはコンテキスト不足で非表示。Beginner
Courseの保存は対象外。 Ghost
Storageの`clearGhostStorage`は明示呼出し用であり、自動削除・Migrationは行わない。

### Replay Viewer

- [x] Replay Foundation Phase 1: 専用キーのload／save／get／clear API
- [x] ReplayRecord検証、Meaning Event・Stop・Boundaryと録音コンテキスト保存
- [x] 往復一致・譜面独立・破損復旧・不正拒否・入力不変・保存失敗テスト
- [x] Replay Foundation Phase 2: BPM Challengeクリア時だけReplayを自動保存
- [x] 取得一致・録音コンテキスト保持・保存拒否・書込失敗時の結果非変更テスト
- [x] Replay Foundation Phase 3: 譜面選択・起動復元時のselectedReplay読込
- [x] Replay切替・欠損／破損時null・読込結果編集でStorage不変のテスト
- [x] Replay Foundation Phase 4: 純粋なPlayback Modelとseek／reset／getState
- [x] 相対時刻・半開境界・空白null・進捗・全イベント保持・不変性／再現性テスト
- [x] Replay Foundation Phase 5: タイマー非依存のRuntime Controller
- [x] play／pause／stop／seek／tick・終端停止・操作列の再現性／状態不変テスト
- [x] Replay Foundation Phase 6: Replay PanelとPlay／Pause／StopのController接続
- [x] 欠損時無効・状態表示・フレーム進行・Pause／Stop・終端／譜面切替のテスト
- [ ] Replayイベント描画・Ghost／Overlay接続
- [x] ドメインのseek・後方移動
- [x] 再生操作UI（Play／Pause／Stop）
- [x] Replay Foundation Phase 7: range入力からController.seekへ委譲
- [x] バー同期・時刻／ループ更新・Pause／Play中移動・終端／欠損状態のテスト

Phase 1は保存基盤だけ。UI・Overlay・Ghost・Challengeは変更しない。 Phase
2はChallenge結果確定後の保存のみ接続。保存失敗でも結果・Progress・Achievementは維持する。
Migration・既存Ghostの変換や互換読込は行わない。

### その他Backlog

- Advanced Timing: Early/Late分析、Signed Error表示、Heat Map
- Share: Screenshot Export、Result Card、Share URL
- Ranking: Local／Online Ranking、Season System
- Technical Debt: monotonic clock、Multi-tab synchronization、 Storage version
  management、スクリーンショット・関連機能仕様書更新

## Deprecated API・利用箇所

以下は残置する。新しい互換レイヤーを作らず、削除も行わない。
正式ランタイムの採点はv2のみを使用する。

| API                                  | 定義                                 | 現在の呼び出し元                                                                                                                                                                                                                                | 正式API                                   |
| ------------------------------------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `createExpectedEvents`               | `src/domain/performance-analysis.js` | 同ファイルの`analyzePerformanceTiming`、`tests/domain/performance-analysis_test.js`、`tests/domain/challenge-session_test.js`                                                                                                                   | `createExpectedTimeline`                  |
| `analyzePerformance`                 | 同上                                 | 同ファイルの`analyzePerformanceLoops`、`tests/domain/performance-analysis_test.js`、`tests/state/performance-recording_test.js`                                                                                                                 | `matchPerformanceTimeline`                |
| `analyzePerformanceLoops`            | 同上                                 | `tests/domain/performance-analysis_test.js`、`tests/domain/challenge-session_test.js`                                                                                                                                                           | `matchPerformanceTimeline`＋v2 Loop State |
| `analyzePerformanceTiming`           | 同上                                 | `tests/domain/performance-analysis_test.js`                                                                                                                                                                                                     | `analyzeTimelineTiming`                   |
| `createExpectedEventTicks`（非公開） | 同上                                 | 同ファイルの`analyzePerformanceTiming`                                                                                                                                                                                                          | `createExpectedTimeline`のtick            |
| `createStopDetector`（公開入口）     | `src/domain/midi-mapping.js`         | 同ファイルの`createStopObserver`、`tests/domain/midi-mapping_test.js`、`tests/domain/performance-analysis_test.js`、`tests/domain/challenge-session_test.js`、`tests/state/midi-recording_test.js`、`tests/state/performance-recording_test.js` | 入力観測には`createStopObserver`          |
| `createStopDetector().flush`         | 同上                                 | 上記テスト群のうち`midi-mapping_test.js`、`performance-analysis_test.js`、`challenge-session_test.js`                                                                                                                                           | v2にflushはない                           |

`createStopDetector`は公開利用を非推奨とするが、タイマー本体は
`createStopObserver`が現在も利用する。関数全体を単純削除してはならない。

旧Overlay専用の`getExpectedOverlayEvents`・`getOverlayErrors`と旧描画本体は App
Integrationで既に撤去済み。現在のコードに定義・利用箇所はないため、
新たに復元したり`@deprecated`スタブを作ったりしない。

### 将来の削除候補（今回の削除なし）

- v1採点4 APIと非公開`createExpectedEventTicks`。
  旧回帰テストの保存方法を決めてから検討する。
- 停止検出の旧形式公開入口・`flush`。
  共有タイマーとv1再現テストの依存を分離する前は削除不可。
- テスト全体を「不要」として削除する候補は現時点ではなし。

`getEventKind`・`alignSequences`・`createEmptyTally`などの共有補助関数は
v2でも利用するため、旧APIと一緒に削除しない。

## テスト分類

テストの削除・移動・期待値変更は行わない。分類は次のとおり。
旧仕様の特性テストが成功しても、v2の受入成功を意味しない。

### A. Event Model v2受入テスト — 維持

| ファイル                                                     | 対象                                                        |
| ------------------------------------------------------------ | ----------------------------------------------------------- |
| `tests/domain/performance-matching_test.js`                  | 正式モデル番号、理想入力100%、対応ペア、初期状態、半開区間  |
| `tests/domain/timing-analysis-v2_test.js`                    | 共通ペア、4指標、対象外イベント、測定不能                   |
| `tests/domain/performance-overlay_test.js`                   | SAMPLE／YOU／ERRORとMatching／Timing件数一致                |
| `tests/features/performance-view_test.js`                    | 共通分析、保存形式維持、過去記録未採点、上限超過            |
| `tests/features/practice-view_test.js`                       | デモ除外、将来Missing防止、停止位置固定、遅延Stop、結果共有 |
| `tests/domain/performance-analysis_test.js`の`v2 timeline`群 | Meaning Event生成、同方向統合、FC3、各譜面                  |

### B. 回帰テスト・現行共通機能 — 維持

| ファイル・範囲                                                        | 対象                                                     |
| --------------------------------------------------------------------- | -------------------------------------------------------- |
| `tests/domain/playback_test.js`、`playback-controller_test.js`        | 境界API、入力増殖防止、再生制御                          |
| `tests/domain/midi-mapping_test.js`                                   | マッピング、圧縮、停止観測、取消・古いタイマー排除       |
| `tests/domain/challenge-session_test.js`                              | 進行制御、v2境界・Stop観測、デモから記録への状態保持     |
| `tests/state/performance-recording_test.js`、`midi-recording_test.js` | 記録・圧縮・保存、v2境界保持                             |
| `tests/domain/performance_test.js`、`bpm-challenge_test.js`           | 保存とChallengeの既存動作                                |
| その他のdomain／state／uiテスト                                       | 譜面・Builder・Repository・Storage・描画・入力ログの回帰 |

### C. v1特性・不整合再現テスト — 資料として維持

- `performance-analysis_test.js`の旧期待生成・旧照合・旧Timing・flush群。
- 同ファイルの`v1 regression`群: Chirp 72.3%／Flare
  75.8%を固定。v2の目標値ではない。
- `midi-mapping_test.js`の同方向＋フェーダーカット圧縮の`v1 regression`。
  圧縮動作自体は現行でも正しいため残す。
- `performance-recording_test.js`の小節／ループresetによる重複生成の
  `v1 regression`群。旧処理を明示的に再現する。
- `challenge-session_test.js`の旧flush／境界Stop／旧採点を使う再現群。
- `midi-recording_test.js`と`performance-recording_test.js`の旧Stop形式を使う
  記録テストは、既存の保存表現の回帰としても維持する。

ファイルには複数分類が混在する。Cを含むという理由でファイル単位の削除をしない。
全分類を既存の`deno test`で引き続き実行する。

## Completion Decision

Event Model v2のExpected・Boundary・Stop・Matching・Timing・Overlay・ App
Integrationは完了。追加検証とGhost／Replayは残作業として独立管理する。
データ移行・リセットは実装せず、完了判定の条件にも含めない。
