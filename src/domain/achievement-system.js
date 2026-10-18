import { getBrowserStorage } from "./chart-storage.js";
import { safeGetItem, safeRemoveItem, safeSetItem } from "./storage-utils.js";

export const ACHIEVEMENT_STORAGE_KEY = "scratchlab.achievements";
export const ACHIEVEMENT_VERSION = 1;
export const MAX_PRACTICE_SESSIONS = 500;
const MAX_PRACTICE_DAYS = 30;

export const ACHIEVEMENTS = Object.freeze([
  ...[80, 100, 120, 140].map((target) => ({
    id: `bpm-${target}`,
    category: "bpm",
    target,
    title: `BPM ${target} クリア`,
    description: `BPM Challengeで${target} BPM以上をクリア`,
  })),
  ...[10, 50, 100, 500].map((target) => ({
    id: `practice-${target}`,
    category: "practice",
    target,
    title: `${target} 回練習`,
    description: `有効な練習セッションを${target}回完了`,
  })),
  ...[3, 7, 30].map((target) => ({
    id: `streak-${target}`,
    category: "streak",
    target,
    title: `${target} 日連続`,
    description: `${target}日連続で練習`,
  })),
]);

function emptyProgress() {
  return {
    version: ACHIEVEMENT_VERSION,
    sessions: [],
    practiceDays: [],
    earned: {},
  };
}

function isCalendarDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
}

function localCalendarDay(timestamp) {
  const date = new Date(timestamp);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function retainSessions(sessions) {
  const ordered = [...sessions].sort(
    (a, b) => Date.parse(a.date) - Date.parse(b.date),
  );
  if (ordered.length <= MAX_PRACTICE_SESSIONS) return ordered;

  const recent = ordered.slice(-MAX_PRACTICE_SESSIONS);
  // Preserve the best clear so BPM progress survives session pruning.
  const bestClear = ordered.reduce(
    (best, session) =>
      session.cleared && (!best || session.bpm > best.bpm) ? session : best,
    null,
  );
  if (bestClear && !recent.some((session) => session.id === bestClear.id)) {
    recent[0] = bestClear;
    recent.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  }
  return recent;
}

function normalizeProgress(raw) {
  if (
    !raw || typeof raw !== "object" || Array.isArray(raw) ||
    raw.version !== ACHIEVEMENT_VERSION
  ) return emptyProgress();

  const normalizedSessions = Array.isArray(raw.sessions)
    ? raw.sessions.map((session) => {
      if (
        !session || typeof session !== "object" ||
        typeof session.id !== "string" || !session.id ||
        session.id.length > 200 ||
        typeof session.pattern !== "string" || !session.pattern ||
        session.pattern.length > 100 ||
        typeof session.date !== "string" ||
        !Number.isFinite(Date.parse(session.date)) ||
        !Number.isInteger(session.bpm) || session.bpm < 60 ||
        session.bpm > 180 ||
        typeof session.accuracy !== "number" ||
        !Number.isFinite(session.accuracy) || session.accuracy < 0 ||
        session.accuracy > 100 || typeof session.cleared !== "boolean" ||
        (session.cleared && (
          session.accuracy < 90 || session.bpm < 80 ||
          (session.bpm - 80) % 5 !== 0
        ))
      ) return null;
      return {
        id: session.id,
        date: new Date(session.date).toISOString(),
        pattern: session.pattern,
        bpm: session.bpm,
        accuracy: session.accuracy,
        cleared: session.cleared,
      };
    }).filter(Boolean)
    : [];
  const seenSessionIds = new Set();
  const sessions = normalizedSessions.filter((session) => {
    if (seenSessionIds.has(session.id)) return false;
    seenSessionIds.add(session.id);
    return true;
  });
  const practiceDays = [
    ...new Set([
      ...(Array.isArray(raw.practiceDays)
        ? raw.practiceDays.filter(isCalendarDay)
        : []),
      ...sessions.map((session) => localCalendarDay(session.date)),
    ]),
  ].sort().slice(-MAX_PRACTICE_DAYS);
  const earned = {};
  if (
    raw.earned && typeof raw.earned === "object" &&
    !Array.isArray(raw.earned)
  ) {
    for (const achievement of ACHIEVEMENTS) {
      const timestamp = raw.earned[achievement.id];
      if (
        typeof timestamp === "string" &&
        Number.isFinite(Date.parse(timestamp))
      ) earned[achievement.id] = timestamp;
    }
  }

  return {
    version: ACHIEVEMENT_VERSION,
    sessions: retainSessions(sessions),
    practiceDays,
    earned,
  };
}

function longestStreak(days) {
  let longest = 0;
  let current = 0;
  let previous = null;
  for (const day of days) {
    const value = Date.parse(`${day}T00:00:00.000Z`);
    const consecutive = previous !== null &&
      value - previous === 24 * 60 * 60 * 1000;
    current = consecutive ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = value;
  }
  return longest;
}

function isEligible(achievement, progress, streak) {
  if (achievement.category === "bpm") {
    return progress.sessions.some((session) =>
      session.cleared && session.bpm >= achievement.target
    );
  }
  if (achievement.category === "practice") {
    return progress.sessions.length >= achievement.target;
  }
  return streak >= achievement.target;
}

function describeProgress(progress) {
  const streak = longestStreak(progress.practiceDays);
  const highestClearedBpm = progress.sessions.reduce(
    (highest, session) =>
      session.cleared ? Math.max(highest, session.bpm) : highest,
    0,
  );
  return ACHIEVEMENTS.map((achievement) => {
    const eligible = isEligible(achievement, progress, streak);
    const earnedAt = progress.earned[achievement.id] ?? null;
    let progressText;
    if (achievement.category === "bpm") {
      progressText = highestClearedBpm === 0
        ? `未クリア / ${achievement.target} BPM`
        : `${
          Math.min(highestClearedBpm, achievement.target)
        } / ${achievement.target} BPM`;
    } else if (achievement.category === "practice") {
      progressText = `${
        Math.min(progress.sessions.length, achievement.target)
      } / ${achievement.target} 回`;
    } else {
      progressText = `${
        Math.min(streak, achievement.target)
      } / ${achievement.target} 日`;
    }
    return {
      ...achievement,
      earned: eligible || earnedAt !== null,
      earnedAt,
      progressText,
    };
  });
}

function parseProgress(text) {
  if (!text) return { progress: emptyProgress(), status: "empty" };
  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { progress: emptyProgress(), status: "corrupt" };
    }
    if (!Number.isInteger(data.version) || data.version < 0) {
      return { progress: emptyProgress(), status: "corrupt" };
    }
    if (data.version > ACHIEVEMENT_VERSION) {
      return { progress: emptyProgress(), status: "future" };
    }
    if (data.version !== ACHIEVEMENT_VERSION) {
      return { progress: emptyProgress(), status: "corrupt" };
    }
    return { progress: normalizeProgress(data), status: "ok" };
  } catch {
    return { progress: emptyProgress(), status: "corrupt" };
  }
}

export function createAchievementRepository(
  storage = getBrowserStorage(),
  options = {},
) {
  const key = options.key ?? ACHIEVEMENT_STORAGE_KEY;
  const now = options.now ?? (() => new Date().toISOString());

  function read() {
    if (!storage) return { progress: emptyProgress(), status: "unavailable" };
    const result = safeGetItem(storage, key);
    if (!result.ok) {
      return { progress: emptyProgress(), status: "unavailable" };
    }
    try {
      return parseProgress(result.value);
    } catch {
      return { progress: emptyProgress(), status: "unavailable" };
    }
  }

  function write(progress) {
    try {
      const result = safeSetItem(
        storage,
        key,
        JSON.stringify(normalizeProgress(progress)),
      );
      return result.ok ? { ok: true } : { ok: false, reason: "write-failed" };
    } catch {
      return { ok: false, reason: "write-failed" };
    }
  }

  return {
    get available() {
      return Boolean(storage);
    },
    load() {
      const result = read();
      return {
        status: result.status,
        sessions: result.progress.sessions,
        achievements: describeProgress(result.progress),
      };
    },
    recordSession(
      { id, pattern, bpm, accuracy, cleared, at = now() },
    ) {
      if (
        typeof id !== "string" || !id || id.length > 200 ||
        typeof pattern !== "string" || !pattern || pattern.length > 100 ||
        typeof accuracy !== "number" ||
        !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100 ||
        !Number.isInteger(bpm) || bpm < 60 || bpm > 180 ||
        typeof cleared !== "boolean" || (cleared && (
          accuracy < 90 || bpm < 80 || (bpm - 80) % 5 !== 0
        )) ||
        typeof at !== "string" ||
        !Number.isFinite(Date.parse(at))
      ) return { ok: false, reason: "invalid" };

      const { progress, status } = read();
      if (status === "unavailable") return { ok: false, reason: status };
      if (status === "future") return { ok: false, reason: "future-version" };
      if (progress.sessions.some((session) => session.id === id)) {
        return {
          ok: true,
          newlyEarned: [],
          achievements: describeProgress(progress),
        };
      }

      const before = new Set(
        describeProgress(progress)
          .filter((achievement) => achievement.earned)
          .map((achievement) => achievement.id),
      );
      const timestamp = new Date(at).toISOString();
      progress.sessions.push({
        id,
        date: timestamp,
        pattern,
        bpm,
        accuracy,
        cleared,
      });
      progress.sessions = retainSessions(progress.sessions);
      const day = localCalendarDay(timestamp);
      progress.practiceDays = [
        ...new Set([...progress.practiceDays, day]),
      ].sort().slice(-MAX_PRACTICE_DAYS);

      const newlyEarned = [];
      for (const achievement of describeProgress(progress)) {
        if (achievement.earned && !before.has(achievement.id)) {
          progress.earned[achievement.id] = timestamp;
          newlyEarned.push(achievement.id);
        }
      }

      const result = write(progress);
      if (!result.ok) return result;
      return {
        ok: true,
        newlyEarned,
        achievements: describeProgress(progress),
      };
    },
    clear() {
      const { status } = read();
      if (status === "unavailable") return { ok: false, reason: status };
      if (status === "future") return { ok: false, reason: "future-version" };
      const result = safeRemoveItem(storage, key);
      return result.ok ? { ok: true } : { ok: false, reason: "write-failed" };
    },
  };
}
