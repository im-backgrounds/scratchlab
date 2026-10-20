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

3対象譜面のブラウザー確認は完了済み。自動E2Eスイートと全譜面の網羅は未完了。

### Ghost Foundation — High

- [ ] 比較用の記録・対応ペアの扱いを設計
- [ ] Best Run／Previous Run比較
- [ ] Ghost Overlay

共通Meaning Eventと対応ペアは利用できるが、Ghost機能自体は未実装。

### Replay Viewer — Medium

- [ ] Replay保存・再生
- [ ] Seek・巻き戻し

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
