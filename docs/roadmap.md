# ScratchLab Roadmap

## Product Vision

ScratchLabはブラウザー上で学べるDJスクラッチ練習アプリ。

目標：

- 初心者でも独学でスクラッチを学べる
- MIDIコントローラーで実践練習できる
- BPMチャレンジで成長を実感できる
- 毎日練習したくなる体験を提供する
- 音・譜面・入力を同時に確認しながら上達できる

## Development Documents

- [Product vision](vision.md): target users, principles, and product boundaries
- [Roadmap](roadmap.md): release themes and feature priorities
- [Task backlog](tasks.md): actionable work ordered to match this roadmap
- [Milestones](milestones.md): milestone outcomes and completion gates
- [Architecture decisions](architecture-decisions.md): technical constraints and accepted decisions
- [Feature specifications](feature-specs/):
  - [Beginner course](feature-specs/beginner-course.md)
  - [Keyboard input](feature-specs/keyboard-input.md)
  - [Input audio monitoring](feature-specs/input-audio-monitoring.md)
  - [Controller overlay](feature-specs/controller-overlay.md)
  - [Achievement system](feature-specs/achievement-system.md)
  - [Practice history](feature-specs/practice-history.md)
  - [BPM Challenge](feature-specs/bpm-challenge.md)
  - [Timing analysis](feature-specs/timing-analysis.md)
  - [Monetization](feature-specs/monetization.md)

Feature specifications describe intended behavior; roadmap checkboxes track delivery status. Keep both in sync when scope or priority changes.

---

# Copilot Rules

以下を必ず守ること。

- roadmap.md の Priority 順で実装する
- 一度に複数機能を実装しない
- 実装前に影響ファイルを調査する
- 実装前に計画を提示する
- テストが存在する場合は更新する
- README が影響を受ける場合は更新する
- 既存機能を削除しない
- UI変更時はスクリーンショット候補を提案する
- 可能な限り Native JavaScript を維持する
- GitHub Pages のシンプルな構成を維持する

---

# Development Workflow

## Prototype Mode（デフォルト）

目的：
素早く機能開発を進める

ルール：

- README更新不要
- スクリーンショット更新不要
- テスト追加不要
- テスト更新不要
- リファクタリング不要
- 最小変更で実装する
- 動作することを最優先にする
- 実装後は変更内容のみ報告する

対象：

- 新機能追加
- UI改善
- チュートリアル
- Achievement
- グラフ
- SNS共有
- オーバーレイ表示
- 音声モニタリング

---

## Stabilization Mode

目的：
リリース前の品質向上

ルール：

- 関連テストのみ更新
- 影響範囲を確認
- README更新
- 不要コード削除
- 軽量なリファクタリング実施

対象：

- 大型機能完了時
- v0.x マイルストーン完了時

---

## Release Mode

目的：
公開前の最終確認

ルール：

- 全テスト実行
- テスト失敗ゼロ
- README更新
- スクリーンショット更新
- Roadmap更新
- GitHub Pages動作確認
- 主要機能の手動確認

対象：

- v0.5
- v1.0
- 公開リリース

---

## Testing Rules

以下の場合のみテスト作成・更新を行う

- BPM Challenge採点ロジック変更
- MIDIイベント変換変更
- 譜面コンパイル変更
- LocalStorage保存ロジック変更
- 既存テスト失敗修正

以下ではテスト不要

- UIレイアウト変更
- チュートリアル
- Achievement
- 履歴画面
- グラフ表示
- SNS共有
- ロードマップ更新
- README修正
- 音量調整UI

---

## Copilot Agent Instructions

デフォルトは Prototype Mode とする。

実装時は以下を優先する。

1. 最小変更
2. 既存機能維持
3. 実装速度
4. コード可読性
5. テスト

明示的に Stabilization Mode または Release Mode が指定されていない限り、

- README更新しない
- テスト追加しない
- テスト更新しない
- スクリーンショット更新しない
- 全テスト実行しない

実装完了後は以下のみ報告する。

- 変更したファイル
- 実装内容
- 手動確認手順
- 残課題

---

# v0.2 Learning Experience

## 初回チュートリアル

### 目的

初心者の離脱率を下げる

### 完了条件

- [x] 初回アクセス時に表示
- [x] スキップ可能
- [x] LocalStorage保存
- [x] 再表示可能

---

## Beginnerコース

### 目的

何を練習すればよいか分からない問題を解決する

### コース

- [x] Baby Scratch
- [x] Forward Scratch
- [x] Baby Scratch BPM90
- [x] Baby Scratch BPM100
- [x] Chirp

### 完了条件

- [x] コース一覧表示
- [x] 進捗表示
- [x] クリア判定
- [x] 次の課題を提案

---

## キーボード入力対応

### 目的

MIDI機器を持たないユーザーでも遊べるようにする

### キーマップ

- [x] ← Forward
- [x] → Backward
- [x] Space Fader

### 完了条件

- [x] BPM Challenge対応
- [x] MIDIと共存可能
- [x] 入力イベント記録対応

---

# v0.3 Retention

## 入力音モニタリング

### 目的

ユーザーの演奏入力を耳で確認できるようにする

### 機能

- [x] Forward入力時に音を再生
- [x] Backward入力時に音を再生
- [x] Fader Open時のみ出音
- [x] キーボード入力対応
- [x] MIDI入力対応

### 音源分離

- [x] お手本音量調整
- [x] 入力音量調整
- [x] お手本ミュート
- [x] 入力音ミュート

### UI

- [x] SAMPLE表示
- [x] YOU表示
- [x] 現在再生中音源の表示

### 将来拡張

- [ ] 左チャンネル=SAMPLE
- [ ] 右チャンネル=YOU
- [ ] ステレオ分離

### 完了条件

- [x] BPM Challenge中に動作
- [x] MIDI入力と同期
- [x] キーボード入力と同期

---

## コントローラー入力オーバーレイ

### 目的

譜面と実際の演奏を視覚的に比較できるようにする

### 表示内容

- [ ] Forward入力
- [ ] Backward入力
- [ ] Fader Open
- [ ] Fader Close
- [ ] Stop

### 音声連動

- [ ] SAMPLE演奏を表示
- [ ] YOU演奏を表示
- [ ] 再生中音源を表示

### 完了条件

- [ ] BPM Challenge中表示
- [ ] 記録済み演奏を再表示可能
- [ ] MIDI入力履歴と同期
- [ ] 譜面スクロールと同期

### 将来拡張

- [ ] タイミング誤差表示
- [ ] 色による正誤判定
- [ ] ゴースト比較

---

## Achievementシステム

### 完了条件

- [x] Achievementモデル
- [x] LocalStorage保存
- [x] Achievement画面
- [x] ポップアップ表示

---

## BPM達成実績

### 実績

- [x] BPM80達成
- [x] BPM100達成
- [x] BPM120達成
- [x] BPM140達成

---

## 練習回数実績

### 実績

- [x] 10回練習
- [x] 50回練習
- [x] 100回練習
- [x] 500回練習

---

## 連続練習実績

### 実績

- [x] 3日連続
- [x] 7日連続
- [x] 30日連続

---

## 練習履歴

### 保存内容

- [ ] 日付
- [ ] Pattern
- [ ] BPM
- [ ] Accuracy

### 完了条件

- [ ] 履歴保存
- [ ] 履歴一覧
- [ ] 履歴削除

---

## 成長グラフ

### 完了条件

- [ ] 練習回数推移
- [ ] 最高BPM推移
- [ ] 平均Accuracy推移

---

# v0.4 Social

## 成績共有画像

### 表示内容

- [ ] Pattern
- [ ] BPM
- [ ] Accuracy
- [ ] Rank

### 完了条件

- [ ] PNG生成
- [ ] ダウンロード

---

## SNS共有

### 完了条件

- [ ] X共有
- [ ] 共有テキスト生成

---

## ランクシステム

### ランク

- [ ] Bronze
- [ ] Silver
- [ ] Gold
- [ ] Platinum

---

# v0.5 Analysis

## タイミング精度分析

### 指標

- [ ] Average Error
- [ ] Max Error
- [ ] Accuracy

### 完了条件

- [ ] 入力タイミング計測
- [ ] 分析表示
- [ ] BPM Challenge連携

---

## ゴースト比較

### 前提

v0.3の入力オーバーレイ機能を利用する

### 完了条件

- [ ] 理想譜面表示
- [ ] 入力オーバーレイ表示
- [ ] タイミング誤差可視化
- [ ] 入力ズレ強調表示

---

## 演奏リプレイ

### 完了条件

- [ ] 再生機能
- [ ] シークバー
- [ ] イベント可視化

---

# v1.0 Monetization

## 譜面パック

### 無料

- [ ] Beginner Pack
- [ ] Intermediate Pack

### 有料候補

- [ ] Battle Scratch Pack
- [ ] DMC Practice Pack
- [ ] Advanced Flare Pack

---

## Pro分析

### 機能

- [ ] 詳細統計
- [ ] 成長分析
- [ ] 苦手分析

---

## サポーター機能

### 機能

- [ ] GitHub Sponsors導線
- [ ] 支援ページ
- [ ] 特典検討

---

# Priority

現在の優先順位

1. 初回チュートリアル
2. Beginnerコース
3. キーボード入力対応
4. 入力音モニタリング
5. コントローラー入力オーバーレイ
6. Achievementシステム
7. 練習履歴
8. 成長グラフ
9. 成績共有画像・SNS共有・ランク
10. タイミング分析
11. ゴースト比較・演奏リプレイ
12. 収益化の検討

---

# Long Term Vision

理想的な練習体験

譜面を見る
↓
お手本を聞く
↓
自分で演奏する
↓
入力音を聞く
↓
譜面上で比較する
↓
採点される
↓
ズレを確認する
↓
改善する
↓
成長を記録する
↓
共有する
