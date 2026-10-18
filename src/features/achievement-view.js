export function renderAchievementView({
  repository,
  getMessage,
  achievementUi,
  charts,
}) {
  const result = repository.load();
  const statusMessage = getMessage() || ({
    unavailable: "このブラウザーでは実績を保存できません。",
    corrupt: "実績データを読み込めませんでした。",
    future: "新しいバージョンの実績データがあるため、保存を停止しています。",
  }[result.status] ?? "");
  achievementUi.renderAchievements(result.achievements, statusMessage);
  achievementUi.renderPracticeHistory(
    result.sessions,
    result.status !== "unavailable" && result.status !== "future",
    charts,
  );
}
