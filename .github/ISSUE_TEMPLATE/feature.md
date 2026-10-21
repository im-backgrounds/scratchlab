---
name: Feature
about: ScratchLabの新機能・ユーザー体験の改善を提案する
title: "[Feature] "
labels: type:feature
---

## 目的

誰のどのような課題を、どのように解決する機能ですか。

## 背景

現状の困りごと、利用場面、関連するIssueや仕様があれば記載してください。

## 要件

- [ ] ユーザーが行えること・確認できることを具体的に記載する
- [ ] 対象となる画面、譜面、入力方法を記載する
- [ ] 対象外にすること・制約を記載する

## BPM Challengeとの関係

- [ ] BPM Challengeに関係する
- [ ] Beginner Courseに関係する
- [ ] どちらにも関係しない

該当する場合、開始条件、進行、合否、結果・進捗への影響を記載してください。
ChallengeのAccuracyまたはTiming Analysisを変更する場合は、
それぞれの変更内容と相互の関係を明記してください。

## Event Model v2との関係

- [ ] 採点・Meaning Event・Matchingに関係する
- [ ] Timing Analysisに関係する
- [ ] Controller Overlayに関係する
- [ ] 入力イベント（Mouse／Keyboard／MIDI）に関係する
- [ ] 関係しない

該当する場合は、変更が必要なイベント・レーン・状態を記載してください。
新しい採点モデルや譜面固有の採点ルールを前提にせず、関連する仕様との整合を確認してください。

## 完了条件

- [ ] ユーザーやシステムから確認可能な受け入れ条件を記載する
- [ ] 既存機能・データへの影響と、後方互換性の要件を記載する
- [ ] 未対応事項や制約を明確にする

## テスト条件

- [ ] 想定するユニット・回帰・境界条件テストを記載する
- [ ] UI変更は確認する画面・操作を記載する
- [ ] MIDI E2Eやブラウザー確認が必要なら対象を記載する
- [ ] 不要なテストがあれば理由を記載する

採点に関係する場合は、Expected／Recorded／Matching、Missing／Extra、
初期状態、Loop Boundary、Stop、Timingのうち該当する検証項目を記載してください。
影響する譜面・入力経路も指定してください。

## ドキュメント更新判断

- [ ] README.mdを更新する（ユーザー向けの挙動・設定・制約が変わる）
- [ ] README.mdは更新不要（理由: ）
- [ ] docs/roadmap.mdを更新する（優先度・マイルストーン・プロジェクト状況が変わる）
- [ ] docs/roadmap.mdは更新不要（理由: ）
- [ ] docs/tasks.mdを更新する（追跡中の作業・検証項目が変わる）
- [ ] docs/tasks.mdは更新不要（理由: ）
- [ ] 関連する機能仕様・アーキテクチャ文書を更新する（対象: ）
- [ ] 関連する機能仕様・アーキテクチャ文書は更新不要（理由: ）

## 関連資料

- [BPM Challenge仕様](../../docs/feature-specs/bpm-challenge.md)
- [Event Model v2](../../docs/event-model-v2.md)
- [Roadmap](../../docs/roadmap.md)
- [Tasks](../../docs/tasks.md)
- 関連Issue・Pull Request:
