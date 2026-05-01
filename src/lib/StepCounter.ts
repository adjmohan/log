import { getNormalizedMotionDelta, getPoseMotionProfile, type PoseMotionProfile } from './PoseUtils';

type PoseLandmark = { x: number; y: number; visibility?: number };
type StepDirection = 'up' | 'down';
type FootSide = 'left' | 'right';

const BASE_STEP_DELTA_THRESHOLD = 0.0045;
const BASE_HIP_STEP_DELTA_THRESHOLD = 0.003;
const STEP_MIN_INTERVAL_MS = 320;
const STEP_MIN_VISIBILITY = 0.55;
const STEP_CONFIRMATION_FRAMES = 2;
const CLOSE_PROXIMITY_THRESHOLD = 0.6;
const CLOSE_PROXIMITY_MULTIPLIER = 1.5;
const STEP_CENTER_DRIFT_RATIO = 0.14;
const STEP_FOOT_GAP_RATIO = 0.085;
const STEP_HIP_GAP_RATIO = 0.75;

export class StepCounter {
  private count = 0;
  private lastFootY: number | null = null;
  private lastHipY: number | null = null;
  private lastLeftAnkleY: number | null = null;
  private lastRightAnkleY: number | null = null;
  private lastFootDirection: StepDirection | null = null;
  private lastHipDirection: StepDirection | null = null;
  private lastLiftedFoot: FootSide | null = null;
  private lastStepAt = 0;
  private lastMotionProfile: PoseMotionProfile | null = null;
  private stableMotionFrames = 0;

  update(landmarks: PoseLandmark[]): number {
    if (!landmarks || landmarks.length === 0) return this.count;

    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];

    if (!leftAnkle || !rightAnkle || !leftHip || !rightHip || !leftShoulder || !rightShoulder) {
      this.stableMotionFrames = 0;
      this.lastFootDirection = null;
      this.lastHipDirection = null;
      this.lastLiftedFoot = null;
      return this.count;
    }

    const motionProfile = getPoseMotionProfile(landmarks);
    const avgFootY = (leftAnkle.y + rightAnkle.y) / 2;
    const avgHipY = (leftHip.y + rightHip.y) / 2;

    if (!motionProfile || motionProfile.visibility < STEP_MIN_VISIBILITY) {
      this.stableMotionFrames = 0;
      this.lastMotionProfile = motionProfile;
      this.lastFootY = avgFootY;
      this.lastHipY = avgHipY;
      this.lastLeftAnkleY = leftAnkle.y;
      this.lastRightAnkleY = rightAnkle.y;
      this.lastFootDirection = null;
      this.lastHipDirection = null;
      this.lastLiftedFoot = null;
      return this.count;
    }

    const now = Date.now();
    const centerDrift = getNormalizedMotionDelta(motionProfile, this.lastMotionProfile);
    const proximityFactor = motionProfile.center.y > CLOSE_PROXIMITY_THRESHOLD ? CLOSE_PROXIMITY_MULTIPLIER : 1.0;
    const stepDeltaThreshold = Math.max(BASE_STEP_DELTA_THRESHOLD * proximityFactor, motionProfile.torsoLength * 0.03);
    const hipDeltaThreshold = Math.max(BASE_HIP_STEP_DELTA_THRESHOLD * proximityFactor, motionProfile.torsoLength * 0.02);
    const footGapThreshold = Math.max(motionProfile.torsoLength * STEP_FOOT_GAP_RATIO, 0.012) * proximityFactor;
    const isStable = centerDrift <= motionProfile.torsoLength * STEP_CENTER_DRIFT_RATIO;

    this.stableMotionFrames = isStable ? this.stableMotionFrames + 1 : 0;

    const canCount = now - this.lastStepAt >= STEP_MIN_INTERVAL_MS && this.stableMotionFrames >= STEP_CONFIRMATION_FRAMES;
    let counted = false;

    if (this.lastFootY !== null) {
      const footDelta = avgFootY - this.lastFootY;
      const footDirection: StepDirection = footDelta > 0 ? 'down' : 'up';
      const changedDirection = this.lastFootDirection !== null && this.lastFootDirection !== footDirection;
      const liftedFoot: FootSide = leftAnkle.y < rightAnkle.y ? 'left' : 'right';
      const footGap = Math.abs(leftAnkle.y - rightAnkle.y);
      const leftFootDelta = this.lastLeftAnkleY === null ? 0 : leftAnkle.y - this.lastLeftAnkleY;
      const rightFootDelta = this.lastRightAnkleY === null ? 0 : rightAnkle.y - this.lastRightAnkleY;
      const movingTogether =
        Math.sign(leftFootDelta) === Math.sign(rightFootDelta) &&
        Math.abs(Math.abs(leftFootDelta) - Math.abs(rightFootDelta)) < motionProfile.torsoLength * 0.03;

      const cadenceSignal =
        canCount &&
        isStable &&
        changedDirection &&
        Math.abs(footDelta) > stepDeltaThreshold &&
        footGap > footGapThreshold &&
        !movingTogether;

      const liftSignal =
        canCount &&
        isStable &&
        footGap > footGapThreshold &&
        this.lastLiftedFoot !== null &&
        this.lastLiftedFoot !== liftedFoot &&
        Math.max(Math.abs(leftFootDelta), Math.abs(rightFootDelta)) > stepDeltaThreshold * 0.8;

      if (cadenceSignal || liftSignal) {
        this.count += 1;
        this.lastStepAt = now;
        this.lastLiftedFoot = liftedFoot;
        counted = true;
      }

      if (!counted && this.lastHipY !== null) {
        const hipDelta = avgHipY - this.lastHipY;
        const hipDirection: StepDirection = hipDelta > 0 ? 'down' : 'up';
        const hipChangedDirection = this.lastHipDirection !== null && this.lastHipDirection !== hipDirection;
        const hipSignal =
          canCount &&
          isStable &&
          hipChangedDirection &&
          Math.abs(hipDelta) > hipDeltaThreshold &&
          footGap > footGapThreshold * STEP_HIP_GAP_RATIO;

        if (hipSignal) {
          this.count += 1;
          this.lastStepAt = now;
          this.lastLiftedFoot = liftedFoot;
        }

        this.lastHipDirection = hipDirection;
      }

      this.lastFootDirection = footDirection;
    }

    this.lastMotionProfile = motionProfile;
    this.lastFootY = avgFootY;
    this.lastHipY = avgHipY;
    this.lastLeftAnkleY = leftAnkle.y;
    this.lastRightAnkleY = rightAnkle.y;

    return this.count;
  }

  getCount() {
    return this.count;
  }

  reset() {
    this.count = 0;
    this.lastFootY = null;
    this.lastHipY = null;
    this.lastLeftAnkleY = null;
    this.lastRightAnkleY = null;
    this.lastFootDirection = null;
    this.lastHipDirection = null;
    this.lastLiftedFoot = null;
    this.lastStepAt = 0;
    this.lastMotionProfile = null;
    this.stableMotionFrames = 0;
  }
}