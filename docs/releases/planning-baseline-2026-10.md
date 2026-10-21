# Planning Baseline — 2026-10

これは計画管理をGitHubへ移した際の履歴記録であり、現在の進捗表ではない。
以下の「完了」は移行元文書に記録されていた実装範囲を表し、
現在の全テスト成功、全譜面対応、製品全体の完成を意味しない。

## 移行元

完全な元記述は固定コミットで参照できる。後日の編集により履歴を書き換えない。

- [Roadmapの元記述](https://github.com/im-backgrounds/scratchlab/blob/d7080deccea624b20efa164e802d8f338a34a40c/docs/roadmap.md)
- [Tasksの元記述](https://github.com/im-backgrounds/scratchlab/blob/d7080deccea624b20efa164e802d8f338a34a40c/docs/tasks.md)
- [Milestonesの元記述](https://github.com/im-backgrounds/scratchlab/blob/d7080deccea624b20efa164e802d8f338a34a40c/docs/milestones.md)

## 記録されていた実装

- GitHub運用基盤：Issue Form、Project運用、ラベル体系、README方針、
  Copilot/PRテンプレートのIssue参照と文書確認。
- Event Model v2：Design Freeze、Meaning
  EventのExpected、物理状態を保持する境界、
  Stop観測分離、共通Matching、同じ対応ペアのTiming、共通投影のOverlay、
  Challenge/Beginner/直後の結果への接続。
- v2受入の当時の根拠：Baby/Chirp/1 Click Flare Orbitの圧縮済み理想入力100%、
  Mouse/Keyboardと模擬MIDIの一致、Missing/Extra/Timing表示の一致、
  初期状態と記録上限の進捗更新防止。詳細は
  [Event Model v2リリースノート](event-model-v2.md)を参照。
- MIDI設定：デバイス一覧/選択/復元、入力確認、最新20件ログ、 Lap
  1ウォームアップとLap 2/3の自動記録、終了/再挑戦。
- MIDI E2E Phase 1：仮想Web MIDIとtimestamp付きsend/sendMany、UI接続/Learn、
  本番入力から結果までのBabyシナリオ、Null Ghost/Replayアダプター、 独立Chromium
  CIジョブ、Simulatorテストと実行手順。
- Ghost：Storage/検証、成功Challengeからの保存、Best Run選択/取得、
  メモリーON/OFF API、独立Overlay変換、同一セッションの元コンテキスト保持と
  GHOST行描画。ON/OFF UIと再読込後の表示は未接続だった。
- Replay：専用Storage/検証、成功Challenge保存、譜面選択/起動時取得、
  純粋Playback/seek、Runtime Controller、時刻/Loop/進捗ViewerとSeek Bar。
  イベント描画、Ghost/Overlay接続、音声再現の完成を意味しない。

既存のBPM Challenge、Practice Mode、Previous Result、履歴、Growth、
Achievement、Beginner Course、初回ガイドの提供を継続する整理だった。
個々の現在の契約は各仕様書と実装を参照する。

## 保存・完了判定の制約

Event Model
v2はアプリ/保存形式のバージョンではない。過去のスコアを再採点・換算せず、
再挑戦を案内する。Storage/Progress/Achievement/LocalStorageの既存形式・データを
維持し、分析コンテキストはメモリー内に保持する。旧Migration/Data
Reset案は撤回済みで、 未完了タスクとして復活させない。

Ghost/Replay、実機MIDI、全譜面/主要ブラウザーの追加検証は、
v2基盤の実装完了とは別管理である。現在の保存契約は
[Event Model v2](../event-model-v2.md)と[設計判断](../architecture-decisions.md)が正本。
旧APIの依存・削除前提とテスト分類は[技術参照](../testing-and-legacy-apis.md)に保持する。

## 旧バージョン目標の扱い

旧v0.2 Learning Experienceは初回ガイド・順序付きコース・共通Keyboard入力、 v0.3
RetentionはSAMPLE/YOU音声・Overlay・実績・履歴/成長、 v0.4
Socialは画像・任意共有・4ランク、 v0.5 AnalysisはTiming・Ghost・Replay、
v1.0はMonetization explorationという提案だった。

実装済み部分と未提供部分が混在するため、これらの番号でリリースを約束したり、
一括で完了/未着手のMilestoneを作ったりしていない。
各目標の元のOutcome/Scope/Exit criteriaは上記固定リンクに保存し、
未確約の候補は[Project概要](https://github.com/users/im-backgrounds/projects/3)に移した。
製品原則は[Product Vision](../vision.md)、実行目標は
[GitHub Milestones](https://github.com/im-backgrounds/scratchlab/milestones)を参照する。

## 現在の品質との区別

移行に先立つ調査では#16のタイムゾーン依存と#20のE2E検証順序、
#30/#31の採点契約の不整合が報告されている。過去の完了チェックを根拠に
これらを解決済みとしない。実機MIDI・実タッチ・聴感比較・子どもを含む
ユーザーテストは実施済みとしない。
