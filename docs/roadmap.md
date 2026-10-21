# ScratchLab Roadmap

最終更新: 2026-10

## Vision

ScratchLabを「スクラッチ練習を可視化できるブラウザーDJトレーニングツール」
として育てる。練習・分析・上達確認を軸に、将来のGhost比較やReplayへつなげる。

## Current Status

### Event Model v2 — Completed

現在のブランチをEvent Model v2の正式実装とする。
`performance-analysis.js`の`EVENT_MODEL_VERSION = 2`で採点モデルを明示する。
アプリ全体や保存形式のバージョンとは区別する。

| 完了項目             | 内容                                                   |
| -------------------- | ------------------------------------------------------ |
| Expected Timeline    | ストロークとフェーダー変化のMeaning Event生成          |
| Boundary Rework      | 物理状態保持、半開区間、境界での余分入力防止           |
| Stop Handling Rework | Mouse/MIDIの物理停止観測、境界・採点から分離           |
| Matching Engine      | 共通対応ペア、Missing・Extra・Initial State Validation |
| Timing Analysis      | 同じ対応ペアから4指標を集計、継続観測は対象外          |
| Controller Overlay   | Expected・Recorded・Matchingの共通投影                 |
| App Integration      | Challenge・Beginner Course・直後の結果・Overlayへ接続  |

確認済み:

- Baby Scratch・Chirp Scratch・1 Click Flare Orbitの理想入力100%。
- Mouse＋Keyboardと模擬MIDIで同じ採点結果。
- OverlayのMissing／Extra件数とMatching結果が一致。
- TimingのMeasured CountとOverlayの表示件数が一致。
- 初期フェーダー未確認／閉ではクリア・進捗更新を行わない。
- 過去記録をv2で再採点せず、再挑戦を案内する。

詳細: [設計仕様](event-model-v2.md) /
[リリースノート](releases/event-model-v2.md) / [Tasks](tasks.md)

### 既存の提供機能

BPM Challenge、Practice Mode、Mouse／Keyboard／MIDI入力、Beginner Course、
初回ガイド、Previous Result、Practice History、Growth Charts、Achievement、
譜面作成・保存を引き続き提供する。

### データ方針

- Migration・初期化・データ変換を行わない。
- v1スコアとの互換レイヤーを作らない。
- Storage・Progress・Achievement・LocalStorageの保存形式と既存データは変更しない。
- 保存済みのスコアは残るが、v2へ換算・再検証しない。
- 実行時の境界・初期状態・対応ペアはメモリー内だけで保持する。

旧文書の「Migration必須」「公開前に採点データをリセットする」は撤回する。
Migrationは未完了タスクではなく、本方針の対象外。

## Remaining Work

Event Model v2の実装完了と、以下の追加検証・将来機能は分離する。

### 実機MIDI検証 — High

- [ ] 実コントローラーの方向・フェーダー入力で3対象譜面を確認
- [ ] 連続入力、停止閾値、境界跨ぎを確認
- [ ] Mouseと実機MIDIの結果一致を確認

### E2E確認 — High

- [ ] 全対象譜面・主要ブラウザーでChallenge／Beginner Courseを確認
- [ ] Missing・Extra・初期状態エラー・中断・再挑戦を網羅
- [ ] Previous Result・Timing・Overlayの画面整合を確認

3対象譜面のブラウザー確認とBaby Scratch MIDI E2Eの自動化は完了済み。
全譜面・主要ブラウザーの網羅は未完了。

#### MIDI E2E Test Foundation — Phase 1

- Baby Scratchの仮想Web MIDIによるブラウザーE2Eを追加。
- MIDI接続・Learn割当からRecording・Matching・Timing・Overlay・Challenge結果まで
  本番経路を検証する。Accuracy 100%、Missing 0、Extra 0、Timing有効件数、 80
  BPMクリアと次BPMへの進行を確認する。
- Ghost／Replayの取得・保存だけをE2E専用Nullアダプターで無効化する。
  ReplayRecord・Ghostを入力に利用せず、本番コード・設定は変更しない。
- Deno CIの独立Chromiumジョブで実行する。全譜面・主要ブラウザーと実機固有の
  接続・遅延確認は引き続き別対象。

実行方法・検証範囲: [MIDI E2E](../tests/e2e/midi/README.md)。

### Ghost Foundation — High

- [x] Phase 1: Best Runの保存・読込・更新・削除API（Event Model v2専用）
- [x] Phase 2: クリアしたBPM Challengeの結果からBest Runを自動更新
- [x] Phase 3: 譜面選択時にBest Runを取得し、ランタイムのselectedGhostへ保持
- [x] Phase 5: GhostのON/OFFをランタイムだけで管理（初期OFF、譜面切替時も維持）
- [x] Phase 6: 元の録音コンテキストからGhost Overlayデータを生成する独立API
- [x] Phase 7: 同一セッションのBest RunをGHOST行へ描画（ON/OFFは未接続）
- [ ] 再読込後のGhostに対する元録音コンテキストの供給方法を設計
- [ ] 比較用の記録・対応ペアの扱いを設計
- [ ] Best Run／Previous Run比較
- [x] Ghost Overlay（元録音コンテキストをメモリーに保持できる記録のみ）

Ghost StorageとBPM Challenge成功時の保存を接続済み。 Accuracy・Timing
Accuracy・RecordedAtでBest Runを選択する。 未クリア・中断・分析失敗・Beginner
Courseは保存しない。 同一セッションで更新したBest RunはController
Overlayへ表示する。
再読込後など元録音コンテキストがないGhostの表示とON/OFF操作UIは未実装。
譜面一覧・コース選択・起動時の選択復元で読込し、Ghost無し／破損時はnullとする。
詳細は[Ghost Foundation](ghost-foundation.md)を参照。

### Replay Viewer — Medium

- [x] Replay Foundation Phase 1: ReplayRecordの独立Storage API・検証・回帰テスト
- [x] Replay Foundation Phase 2: BPM Challengeクリア時のReplay保存接続
- [x] Replay Foundation Phase 3: 譜面選択時のReplay取得とランタイム保持
- [x] Replay Foundation Phase 4: 独立Playback Model（seek／reset／状態取得）
- [x] Replay Foundation Phase 5: tick駆動の独立Runtime
      Controller（play／pause／stop）
- [x] Replay Foundation Phase 6:
      最小Viewer（時刻・ループ・進捗、Play／Pause／Stop）
- [ ] Replayイベント描画・Ghost／Overlay接続
- [x] ドメインのseek・後方移動・ループ境界判定
- [x] 再生操作UI（Play／Pause／Stop）
- [x] Replay Foundation Phase 7: 進捗同期Seek Bar（Pause／Play中の移動）

`scratchlab.replay`にTimeline・境界・録音条件だけを保存する基盤を実装済み。
クリアしたBPM Challengeだけを自動保存する。未クリア・中断・Beginner
Courseは対象外。 Ghost Storage・既存保存データは維持し、Migrationは行わない。
詳細は[Replay Foundation](replay-foundation.md)を参照。

## Post v2 Backlog

以下は改善候補であり、実装時期や提供を確約しない。

- Advanced Timing Analysis: Signed Error表示、Early/Late分析、Heat Map。
  符号付き誤差の保持はv2で実装済み。
- Ranking: Local／Community Ranking。
- Share Features: Result Card、Screenshot Export、Share URL。
- Technical Debt: monotonic clock、Multi-tab synchronization、 Storage version
  management、スクリーンショット・関連機能仕様書の更新。
- Monetization: Ads、Supporter Plan、Premium Analyticsは検討段階。

## Completion Criteria

Event Model v2の完了根拠は、共通モデルによる採点・Timing・Overlay・Beginner
Courseの
接続と3対象譜面の受入確認。Ghost／Replayの完成やデータ移行は完了条件に含めない。
アプリ全体のリリース番号や公開操作は、この整理では変更しない。
