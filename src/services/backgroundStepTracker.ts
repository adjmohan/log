import { Motion } from "@capacitor/motion";
import { trackActivity, type ActivityKind } from "./fitnessStorage";

const SMOOTHING_ALPHA = 0.8;
const STEP_PEAK_THRESHOLD = 1.2;  // threshold on the smoothed 3D magnitude
const STEP_MIN_INTERVAL_MS = 280;
const STEP_RATE_WINDOW_MS = 10000;
const RUNNING_STEP_RATE_THRESHOLD = 2;
const WALKING_STEP_CALORIES = 0.04;
const RUNNING_STEP_CALORIES = 0.07;

export type TrackerSnapshot = {
  walkingSteps: number;
  walkingCalories: number;
  runningSteps: number;
  runningCalories: number;
  lastKind: ActivityKind;
};

export type TrackerController = {
  stop: () => Promise<void>;
};

export const startBackgroundStepTracker = async (
  onUpdate?: (snapshot: TrackerSnapshot) => void
): Promise<TrackerController> => {
  let smoothMag = 0;
  let prevSmoothMag = 0;
  let prevDelta = 0;
  let lastPeakTime = 0;
  const stepTimestamps: number[] = [];

  let walkingSteps = 0;
  let runningSteps = 0;
  let walkingCalories = 0;
  let runningCalories = 0;
  let lastKind: ActivityKind = "walking";

  const listener = await Motion.addListener("accel", (event) => {
    // Use 3D vector magnitude so step counting works in ANY phone orientation
    const ax = event.acceleration?.x ?? 0;
    const ay = event.acceleration?.y ?? 0;
    const az = event.acceleration?.z ?? 0;
    const magnitude = Math.sqrt(ax * ax + ay * ay + az * az);
    const now = Date.now();
    smoothMag = SMOOTHING_ALPHA * smoothMag + (1 - SMOOTHING_ALPHA) * magnitude;

    const delta = smoothMag - prevSmoothMag;
    const hasPeakPattern = prevDelta > 0 && delta <= 0;

    if (hasPeakPattern && prevSmoothMag > STEP_PEAK_THRESHOLD) {
      if (now - lastPeakTime < STEP_MIN_INTERVAL_MS) {
        prevDelta = delta;
        prevSmoothMag = smoothMag;
        return;
      }

      lastPeakTime = now;

      stepTimestamps.push(now);
      while (stepTimestamps.length && now - stepTimestamps[0] > STEP_RATE_WINDOW_MS) {
        stepTimestamps.shift();
      }

      const stepRate = stepTimestamps.length / (STEP_RATE_WINDOW_MS / 1000);
      const kind: ActivityKind = stepRate > RUNNING_STEP_RATE_THRESHOLD ? "running" : "walking";
      const calorieIncrement = kind === "running" ? RUNNING_STEP_CALORIES : WALKING_STEP_CALORIES;

      if (kind === "walking") {
        walkingSteps += 1;
        walkingCalories += calorieIncrement;
        trackActivity("walking", 1, calorieIncrement);
      } else {
        runningSteps += 1;
        runningCalories += calorieIncrement;
        trackActivity("running", 1, calorieIncrement);
      }

      lastKind = kind;

      onUpdate?.({
        walkingSteps,
        walkingCalories,
        runningSteps,
        runningCalories,
        lastKind,
      });
    }

    prevDelta = delta;
    prevSmoothMag = smoothMag;
  });

  return {
    stop: async () => {
      await listener.remove();
    },
  };
};
