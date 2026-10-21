# Event Model v2 Release Notes

Status: Completed — Official Implementation

現在のブランチをEvent Model v2の正式実装とする。
`src/domain/performance-analysis.js`に`EVENT_MODEL_VERSION = 2`を定義する。
これは採点モデル番号であり、アプリ全体・保存形式のバージョン変更ではない。

## 解決した問題

### 期待イベントと入力イベントの粒度不一致

譜面セル単位の期待イベントを、ストロークと独立したフェーダー変化の Meaning
Eventへ統一した。

- Forward Stroke
- Backward Stroke
- Fader Open
- Fader Close

同方向の連続移動は1ストローク。フェーダーカットは方向をリセットせず、
閉→開の変化として保持する。

### Chirp問題

v1では正しい同方向入力が圧縮される一方、期待側には重複ストロークが残り、
理想入力でも一致率72.3%となる再現条件があった。
v2では同方向継続を両側で統一し、理想入力100%を確認した。
旧結果は不整合を固定する回帰テストとして残す。

### Flare問題

1 Click Flare Orbitもv1では理想入力75.8%となる再現条件があった。
同方向ストロークとフェーダーカットを分離し、v2で100%を確認した。
FC3はForwardと3組のClose／Openを生成し、カットの数を失わない。

### Boundary問題

小節・ループ・デモから記録への切替で物理状態を捨てず、
境界由来の余分な入力と強制Stop生成を防ぐ。 Loop
Boundaryは制御イベントであり採点しない。
記録ループは`[startTime, endTime)`の半開区間で分離し、
境界時刻ちょうどの入力は次ループへ所属させる。

### Stop問題

StopをMouse／MIDIの無入力による物理停止観測として定義し、
ループ終了・記録終了・操作解除と分離した。
Stopは採点・Timing・Overlayから除外する。
停止後の同方向再開は新規ストロークとなる。
入力元切替・観測キャンセル・古いタイマー通知も回帰テストで確認する。

## Overlay統一

Controller Overlay v2は次の共通結果を投影する。

- SAMPLE: Expected Timeline
- YOU: Recorded Timeline
- ERROR: MatchingのMissing・Extra・Initial State Error

旧Overlay専用の期待生成・LCS照合はApp Integrationで撤去済み。
MatchingのMissing／Extra件数と表示件数が一致する。
お手本は採点せず、再生中の未到来イベントをMissingにしない。

## Timing統一

Timing Analysis v2はMatchingの対応ペアを再照合せず利用する。 Average Error・Max
Error・Timing Accuracy・Measured Countを出力する。

Stop・Loop Boundary・継続観測による一致は対象外。
`actualIndex: null`と`timingEligible: false`も除外する。
Missing・Extraは0ms扱いにせず、測定0件なら指標はnull。 Timing
AccuracyはChallenge合否に使用しない。

## Initial State Validation

開始時のフェーダーが開であることを各記録ループのsnapshotで検証する。
未確認または閉の場合は、一致率100%でもクリア・進捗更新を行わない。
後続のフェーダー入力から開始状態を推測しない。

## App Integrationと確認結果

BPM Challenge・Beginner Course・直後の結果・Controller
Overlayは同じ分析結果を利用する。
Mouse＋KeyboardとMIDIも同じ圧縮・Matching・Timing・Overlay経路を使用する。

| 理想入力・記録2ループ | 一致率 | Missing／Extra | Timing測定件数 |
| --------------------- | ------ | -------------- | -------------- |
| Baby Scratch          | 100%   | 0／0           | 16             |
| Chirp Scratch         | 100%   | 0／0           | 92             |
| 1 Click Flare Orbit   | 100%   | 0／0           | 48             |

上記はApp Integration時に、時計制御下のDOM Mouse＋Keyboardイベントと
模擬MIDIによる実アプリの入力経路で確認した結果。
実機MIDIの確認済みという意味ではない。 Missing 1件／Extra 2件／Timing
15件の表示一致、初期状態不正時の進捗更新防止、 Beginner Courseクリア・Previous
Result更新も確認済み。

## データ方針

- Migration・初期化・削除・データ変換は行わない。
- v1スコアとの互換レイヤーは作らない。
- Storage・Progress・Achievementの処理と既存保存形式・データを維持する。
- 実行時の境界・初期状態・対応ペアはメモリー内だけで保持する。
- 再読込／インポートした記録はv2で再採点せず、再挑戦を案内する。
- 過去のスコアは残るが、v2スコアへ換算しない。

## コード・テスト整理

旧採点APIに`@deprecated`を付け、コードとテストは削除しない。
旧APIの呼び出し元と、v2受入・共通回帰・v1特性テストの分類は
[Testing and Legacy APIs](../testing-and-legacy-apis.md#deprecated-api利用箇所)を参照。
停止検出器のタイマー本体はv2でも共有するため、旧APIと一括削除しない。

## 残作業

- 実機MIDI検証
- 全譜面・主要ブラウザーのE2E確認
- Ghost Foundation
- Replay Viewer

これらはEvent Model v2の実装完了とは分けて管理する。
今回のCleanupでは機能追加・採点変更・保存変更を行わない。
