export type RangeTab = "today" | "week" | "month";
export type ActivityKind = "walking" | "running";

export interface DailyFitnessRecord {
  dateKey: string;
  walkingSteps: number;
  walkingCalories: number;
  runningSteps: number;
  runningCalories: number;
  workoutReps: number;
  workoutCalories: number;
  workoutCount: number;
}

interface FitnessStorageShape {
  records: Record<string, DailyFitnessRecord>;
}

const STORAGE_KEY = "ai-fitness-v1";
export const FITNESS_STORAGE_UPDATED_EVENT = "fitness-storage-updated";

const emptyRecord = (dateKey: string): DailyFitnessRecord => ({
  dateKey,
  walkingSteps: 0,
  walkingCalories: 0,
  runningSteps: 0,
  runningCalories: 0,
  workoutReps: 0,
  workoutCalories: 0,
  workoutCount: 0,
});

const toDateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const parseDateKey = (dateKey: string) => {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

const getWeekStart = (date: Date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getMonthStart = (date: Date) => {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

const readStorage = (): FitnessStorageShape => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { records: {} };
    }

    const parsed = JSON.parse(raw) as FitnessStorageShape;
    return {
      records: parsed?.records || {},
    };
  } catch {
    return { records: {} };
  }
};

const writeStorage = (data: FitnessStorageShape) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

const emitFitnessStorageUpdated = (record: DailyFitnessRecord) => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(FITNESS_STORAGE_UPDATED_EVENT, {
      detail: {
        dateKey: record.dateKey,
      },
    })
  );
};

export const trackActivity = (
  kind: ActivityKind,
  stepIncrement: number,
  calorieIncrement: number,
  at: Date = new Date()
) => {
  const data = readStorage();
  const dateKey = toDateKey(at);
  const existing = data.records[dateKey] || emptyRecord(dateKey);

  const updated: DailyFitnessRecord = {
    ...existing,
    walkingSteps: kind === "walking" ? existing.walkingSteps + stepIncrement : existing.walkingSteps,
    walkingCalories: kind === "walking" ? existing.walkingCalories + calorieIncrement : existing.walkingCalories,
    runningSteps: kind === "running" ? existing.runningSteps + stepIncrement : existing.runningSteps,
    runningCalories: kind === "running" ? existing.runningCalories + calorieIncrement : existing.runningCalories,
  };

  data.records[dateKey] = updated;
  writeStorage(data);
  emitFitnessStorageUpdated(updated);

  return updated;
};

export const trackWorkoutSession = (
  reps: number,
  calories: number,
  at: Date = new Date()
) => {
  const data = readStorage();
  const dateKey = toDateKey(at);
  const existing = data.records[dateKey] || emptyRecord(dateKey);

  const updated: DailyFitnessRecord = {
    ...existing,
    workoutReps: existing.workoutReps + reps,
    workoutCalories: existing.workoutCalories + calories,
    workoutCount: existing.workoutCount + 1,
  };

  data.records[dateKey] = updated;
  writeStorage(data);
  emitFitnessStorageUpdated(updated);

  return updated;
};

export const getDailyRecord = (at: Date = new Date()): DailyFitnessRecord => {
  const dateKey = toDateKey(at);
  const data = readStorage();
  return data.records[dateKey] || emptyRecord(dateKey);
};

export const aggregateFitnessRange = (range: RangeTab, now: Date = new Date()) => {
  const data = readStorage();

  let start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (range === "week") {
    start = getWeekStart(now);
  }

  if (range === "month") {
    start = getMonthStart(now);
  }

  const totals = {
    walkingSteps: 0,
    walkingCalories: 0,
    runningSteps: 0,
    runningCalories: 0,
    workoutReps: 0,
    workoutCalories: 0,
    workoutCount: 0,
  };

  Object.values(data.records).forEach((record) => {
    const d = parseDateKey(record.dateKey);
    d.setHours(0, 0, 0, 0);
    if (d < start || d > now) return;

    totals.walkingSteps += record.walkingSteps;
    totals.walkingCalories += record.walkingCalories;
    totals.runningSteps += record.runningSteps;
    totals.runningCalories += record.runningCalories;
    totals.workoutReps += record.workoutReps;
    totals.workoutCalories += record.workoutCalories;
    totals.workoutCount += record.workoutCount;
  });

  return totals;
};
