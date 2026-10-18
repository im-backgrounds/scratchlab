import { getBrowserStorage } from "./chart-storage.js";
import { safeGetItem, safeSetItem } from "./storage-utils.js";

export const BEGINNER_COURSE_STORAGE_KEY = "scratchlab.beginner-course";
export const BEGINNER_COURSE_VERSION = 1;
export const BEGINNER_COURSE_STAGES = Object.freeze([
  Object.freeze({
    id: "baby-scratch",
    name: "Baby Scratch",
    chartId: "baby-scratch",
    targetBpm: null,
  }),
  Object.freeze({
    id: "forward-scratch",
    name: "Forward Scratch",
    chartId: "forward-scratch",
    targetBpm: null,
  }),
  Object.freeze({
    id: "baby-scratch-bpm90",
    name: "Baby Scratch BPM90",
    chartId: "baby-scratch",
    targetBpm: 90,
  }),
  Object.freeze({
    id: "baby-scratch-bpm100",
    name: "Baby Scratch BPM100",
    chartId: "baby-scratch",
    targetBpm: 100,
  }),
  Object.freeze({
    id: "chirp",
    name: "Chirp",
    chartId: "chirp-scratch",
    targetBpm: null,
  }),
]);

function normalizeCompletedStages(ids) {
  const highestCompletedIndex = ids.reduce((highest, id) => {
    const index = BEGINNER_COURSE_STAGES.findIndex((stage) => stage.id === id);
    return Math.max(highest, index);
  }, -1);
  return BEGINNER_COURSE_STAGES.slice(0, highestCompletedIndex + 1).map(
    (stage) => stage.id,
  );
}

function createProgress(completedStageIds = [], updatedAt = null) {
  return {
    version: BEGINNER_COURSE_VERSION,
    courseId: "beginner",
    completedStageIds: normalizeCompletedStages(completedStageIds),
    updatedAt,
  };
}

export function getNextBeginnerStageId(progress) {
  return BEGINNER_COURSE_STAGES.find((stage) =>
    !progress.completedStageIds.includes(stage.id)
  )?.id ?? null;
}

export function createBeginnerCourseRepository(
  storage = getBrowserStorage(),
) {
  let progress = createProgress();
  let writable = storage !== null;
  let blockedReason = storage ? null : "unavailable";

  return {
    get available() {
      return storage !== null;
    },
    get progress() {
      return progress;
    },
    load() {
      if (!storage) {
        writable = false;
        blockedReason = "unavailable";
        return { ok: false, reason: "unavailable" };
      }
      const result = safeGetItem(storage, BEGINNER_COURSE_STORAGE_KEY);
      if (!result.ok) {
        writable = false;
        blockedReason = "read-failed";
        return { ok: false, reason: "read-failed" };
      }
      const raw = result.value;
      if (raw === null) return { ok: true, progress };
      try {
        const data = JSON.parse(raw);
        if (
          !data || typeof data !== "object" ||
          data.courseId !== "beginner" ||
          !Number.isInteger(data.version) ||
          !Array.isArray(data.completedStageIds)
        ) {
          return { ok: false, reason: "corrupt" };
        }
        if (data.version > BEGINNER_COURSE_VERSION) {
          writable = false;
          blockedReason = "future-version";
          return { ok: false, reason: "future-version" };
        }
        if (data.version !== BEGINNER_COURSE_VERSION) {
          return { ok: false, reason: "corrupt" };
        }
        const updatedAt = typeof data.updatedAt === "string" &&
            !Number.isNaN(Date.parse(data.updatedAt))
          ? data.updatedAt
          : null;
        progress = createProgress(
          data.completedStageIds.filter((id) => typeof id === "string"),
          updatedAt,
        );
        return { ok: true, progress };
      } catch {
        return { ok: false, reason: "corrupt" };
      }
    },
    complete(stageId) {
      if (!storage || !writable) {
        return { ok: false, reason: blockedReason ?? "unavailable" };
      }
      const stageIndex = BEGINNER_COURSE_STAGES.findIndex((stage) =>
        stage.id === stageId
      );
      if (stageIndex < 0) return { ok: false, reason: "invalid-stage" };
      const completedStageIds = normalizeCompletedStages([
        ...progress.completedStageIds,
        stageId,
      ]);
      const nextProgress = {
        ...createProgress(completedStageIds, new Date().toISOString()),
      };
      try {
        const result = safeSetItem(
          storage,
          BEGINNER_COURSE_STORAGE_KEY,
          JSON.stringify(nextProgress),
        );
        if (!result.ok) return { ok: false, reason: "write-failed" };
      } catch {
        return { ok: false, reason: "write-failed" };
      }
      progress = nextProgress;
      return { ok: true, progress };
    },
  };
}
