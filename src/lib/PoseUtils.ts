/**
 * Pose Utility Functions
 * Advanced form validation, angle smoothing, and analysis tools
 */

export interface FormCheckResult {
  isValid: boolean;
  alignmentScore: number; // 0-1, higher = better alignment
  feedback: string[];
}

export interface RepStats {
  reps: number;
  avgRepTime: number; // milliseconds
  fastestRep: number;
  slowestRep: number;
  totalTime: number;
  totalCalories: number;
}

export interface PoseMotionProfile {
  center: { x: number; y: number };
  torsoLength: number;
  visibility: number;
}

const MOTION_PROFILE_INDICES = [11, 12, 23, 24, 25, 26, 27, 28];

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Calculate angle between three points (standard trigonometry)
 * Points are expected to have x, y coordinates
 */
export function calculateAngle(a: any, b: any, c: any): number {
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  if (angle > 180.0) angle = 360 - angle;
  return angle;
}

/**
 * Exponential Moving Average (EMA) for angle smoothing
 * Reduces noise without lag
 * @param newValue - latest angle measurement
 * @param prevValue - smoothed value from previous frame
 * @param alpha - smoothing factor (0-1). Lower = more smoothing, ~0.2 recommended
 */
export function smoothAngle(newValue: number, prevValue: number | null, alpha = 0.2): number {
  if (prevValue === null || !Number.isFinite(prevValue)) {
    return newValue;
  }
  return alpha * newValue + (1 - alpha) * prevValue;
}

/**
 * Validate pushup form by checking shoulder-hip alignment
 * Good form: shoulder, hip, and ankle roughly vertical (x-coordinates close)
 */
export function validatePushupForm(
  shoulder: any,
  hip: any,
  ankle: any,
  elbow: any
): FormCheckResult {
  const feedback: string[] = [];
  const scores: number[] = [];

  // Check 1: Shoulder-Hip alignment (body should be straight)
  if (shoulder && hip) {
    const shoulderHipDrift = Math.abs(shoulder.x - hip.x);
    const alignmentPenalty = Math.min(1, shoulderHipDrift / 0.2); // 0.2 = maximum acceptable drift
    const alignmentScore = 1 - alignmentPenalty;
    scores.push(alignmentScore);

    if (shoulderHipDrift > 0.15) {
      feedback.push("Keep your body straight");
    }
  }

  // Check 2: Hip-Ankle alignment
  if (hip && ankle) {
    const hipAnkleDrift = Math.abs(hip.x - ankle.x);
    const alignmentPenalty = Math.min(1, hipAnkleDrift / 0.2);
    const alignmentScore = 1 - alignmentPenalty;
    scores.push(alignmentScore);

    if (hipAnkleDrift > 0.15) {
      feedback.push("Don't sag hips");
    }
  }

  // Check 3: Elbow angle validity (should be between 30° and 180°)
  if (shoulder && elbow && hip) {
    const elbowAngle = calculateAngle(shoulder, elbow, hip);
    if (elbowAngle < 30) {
      feedback.push("Lower arm more");
    } else if (elbowAngle > 170) {
      feedback.push("Keep elbows slightly bent");
    }
  }

  const avgAlignmentScore = scores.length > 0 ? scores.reduce((a, b) => a + b) / scores.length : 0.5;

  return {
    isValid: avgAlignmentScore > 0.7,
    alignmentScore: avgAlignmentScore,
    feedback,
  };
}

/**
 * Validate squat form by checking knee-hip-shoulder alignment
 */
export function validateSquatForm(
  shoulder: any,
  hip: any,
  knee: any,
  ankle: any
): FormCheckResult {
  const feedback: string[] = [];
  const scores: number[] = [];

  // Check 1: Vertical alignment (shoulder-hip-ankle)
  if (shoulder && hip && ankle) {
    const shoulderToHipDrift = Math.abs(shoulder.x - hip.x);
    const hipToAnkleDrift = Math.abs(hip.x - ankle.x);
    const maxDrift = Math.max(shoulderToHipDrift, hipToAnkleDrift);
    const alignmentScore = 1 - Math.min(1, maxDrift / 0.2);
    scores.push(alignmentScore);

    if (maxDrift > 0.15) {
      feedback.push("Keep chest up");
    }
  }

  // Check 2: Knee tracking (knees should align with ankles)
  if (knee && ankle) {
    const kneeAnkleDrift = Math.abs(knee.x - ankle.x);
    const trackingScore = 1 - Math.min(1, kneeAnkleDrift / 0.15);
    scores.push(trackingScore);

    if (kneeAnkleDrift > 0.1) {
      feedback.push("Knees over ankles");
    }
  }

  // Check 3: Depth indicator (knee bend angle)
  if (hip && knee && ankle) {
    const kneeAngle = calculateAngle(hip, knee, ankle);
    if (kneeAngle > 150) {
      feedback.push("Go deeper");
    }
  }

  const avgAlignmentScore = scores.length > 0 ? scores.reduce((a, b) => a + b) / scores.length : 0.5;

  return {
    isValid: avgAlignmentScore > 0.7,
    alignmentScore: avgAlignmentScore,
    feedback,
  };
}

/**
 * Calculate distance between two 2D points
 */
export function distance2D(p1: any, p2: any): number {
  if (!p1 || !p2) return 0;
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Build a compact motion profile for pose stability checks.
 */
export function getPoseMotionProfile(landmarks: any[]): PoseMotionProfile | null {
  if (!landmarks || landmarks.length < 29) return null;

  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];

  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) {
    return null;
  }

  const shoulderCenter = {
    x: average([leftShoulder.x, rightShoulder.x]),
    y: average([leftShoulder.y, rightShoulder.y]),
  };
  const hipCenter = {
    x: average([leftHip.x, rightHip.x]),
    y: average([leftHip.y, rightHip.y]),
  };

  const torsoLength = Math.max(distance2D(shoulderCenter, hipCenter), 0.0001);
  const visibility = average(
    MOTION_PROFILE_INDICES.map((index) => Number(landmarks[index]?.visibility ?? 0))
  );

  return {
    center: {
      x: average([shoulderCenter.x, hipCenter.x]),
      y: average([shoulderCenter.y, hipCenter.y]),
    },
    torsoLength,
    visibility,
  };
}

export function getNormalizedMotionDelta(
  current: PoseMotionProfile | null,
  previous: PoseMotionProfile | null
): number {
  if (!current || !previous) return 0;
  const scale = Math.max(current.torsoLength, previous.torsoLength, 0.0001);
  return distance2D(current.center, previous.center) / scale;
}

/**
 * Interpolate between angles (circular interpolation)
 * Useful for frame-to-frame smoothing
 */
export function interpolateAngle(angle1: number, angle2: number, t: number): number {
  const diff = ((angle2 - angle1 + 180) % 360) - 180;
  return (angle1 + diff * t + 360) % 360;
}

/**
 * Detect if a rep is "too fast" or "too slow"
 * Based on typical rep timing
 */
export function getRepPace(repTimeMs: number): 'fast' | 'normal' | 'slow' {
  if (repTimeMs < 800) return 'fast';    // < 0.8s per rep (very explosive)
  if (repTimeMs < 1500) return 'normal'; // 0.8-1.5s (good control)
  return 'slow';                         // > 1.5s (too slow/paused)
}
