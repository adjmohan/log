import type { ExerciseType } from '../types';
import {
  calculateAngle,
  getNormalizedMotionDelta,
  getPoseMotionProfile,
  smoothAngle,
  validatePushupForm,
  validateSquatForm,
  getRepPace,
  type PoseMotionProfile,
} from './PoseUtils';

export class RepCounter {
  private stage: 'down' | 'up' | 'none' = 'none';
  private count: number = 0;
  private lastAngle: number | null = null;
  private repStartTime: number | null = null;
  private repTimes: number[] = [];
  private lastValidRepTime: number = 0;
  private formQuality: number = 1.0; // 0-1 score
  private rejectedReps: number = 0;
  private lastMotionProfile: PoseMotionProfile | null = null;
  private stableMotionFrames: number = 0;
  private lastMotionDrift: number = 1;
  private downHoldFrames: number = 0;
  private upHoldFrames: number = 0;

  private readonly minVisibility = 0.55;
  private readonly maxNormalizedDrift = 0.16;
  private readonly minStableMotionFrames = 2;
  private readonly minStageFrames = 2;

  // ✅ Enhanced thresholds from Python reference
  private readonly thresholds: Record<ExerciseType, { down: number; up: number }> = {
    pushups: { down: 70, up: 160 },      // Down: angle < 70°, Up: angle > 160°
    squats: { down: 85, up: 155 },       // Similar precision for legs
    plank: { down: 90, up: 180 },        // Plank is a hold, not counted by angle
    lunges: { down: 80, up: 160 },
    situps: { down: 60, up: 150 },
    jumpingJacks: { down: 90, up: 170 },
    burpees: { down: 75, up: 165 },
    mountainClimbers: { down: 85, up: 165 },
    highKnees: { down: 90, up: 170 },
    bicycleCrunches: { down: 70, up: 160 },
  };

  constructor(exercise: ExerciseType) {
    void exercise;
  }

  /**
   * Process landmarks and update rep count
   * @param landmarks MediaPipe pose landmarks
   * @param exercise Exercise type
   * @returns Updated rep count
   */
  update(landmarks: any[], exercise: ExerciseType): number {
    if (!landmarks || landmarks.length === 0) return this.count;

    const motionProfile = getPoseMotionProfile(landmarks);
    if (!this.updateMotionGate(motionProfile)) {
      return this.count;
    }

    const leftShoulder = landmarks[11];
    const leftElbow = landmarks[13];
    const leftWrist = landmarks[15];
    const leftHip = landmarks[23];
    const leftKnee = landmarks[25];
    const leftAnkle = landmarks[27];

    const rightShoulder = landmarks[12];
    const rightElbow = landmarks[14];
    const rightWrist = landmarks[16];
    const rightHip = landmarks[24];
    const rightKnee = landmarks[26];
    const rightAnkle = landmarks[28];

    if (exercise === 'pushups') {
      this.updatePushups(
        leftShoulder, leftElbow, leftWrist, leftHip, leftAnkle,
        rightShoulder, rightElbow, rightWrist, rightHip, rightAnkle,
        motionProfile
      );
    }

    if (exercise === 'squats') {
      this.updateSquats(
        leftHip, leftKnee, leftAnkle, leftShoulder,
        rightHip, rightKnee, rightAnkle, rightShoulder,
        motionProfile
      );
    }

    return this.count;
  }

  private updatePushups(
    lShoulder: any, lElbow: any, lWrist: any, lHip: any, lAnkle: any,
    rShoulder: any, rElbow: any, rWrist: any, rHip: any, rAnkle: any,
    motionProfile: PoseMotionProfile | null
  ) {
    if (!motionProfile) return;

    const leftVis = (lShoulder?.visibility || 0) + (lElbow?.visibility || 0) + (lWrist?.visibility || 0);
    const rightVis = (rShoulder?.visibility || 0) + (rElbow?.visibility || 0) + (rWrist?.visibility || 0);

    const shoulder = leftVis > rightVis ? lShoulder : rShoulder;
    const elbow = leftVis > rightVis ? lElbow : rElbow;
    const wrist = leftVis > rightVis ? lWrist : rWrist;
    const hip = leftVis > rightVis ? lHip : rHip;
    const ankle = leftVis > rightVis ? lAnkle : rAnkle;

    if (!shoulder || !elbow || !wrist || !hip || !ankle) return;

    // ✅ Validate form (shoulders and hips aligned)
    const formCheck = validatePushupForm(shoulder, hip, ankle, elbow);
    this.formQuality = formCheck.alignmentScore;

    // ✅ Calculate angle with smoothing
    let rawAngle = calculateAngle(shoulder, elbow, wrist);
    this.lastAngle = smoothAngle(rawAngle, this.lastAngle, 0.2);
    const angle = this.lastAngle;

    const thresholds = this.thresholds.pushups;

    // ✅ State machine: DOWN when angle < down threshold
    if (angle < thresholds.down) {
      this.downHoldFrames += 1;
      this.upHoldFrames = 0;

      if (this.downHoldFrames >= this.minStageFrames) {
        if (this.stage !== 'down') {
          this.repStartTime = Date.now();
        }
        this.stage = 'down';
      }
    } else {
      this.downHoldFrames = 0;
    }

    // ✅ TRANSITION: UP when angle > up threshold AND was in down
    if (angle > thresholds.up) {
      this.upHoldFrames += 1;
      this.downHoldFrames = 0;

      if (this.upHoldFrames >= this.minStageFrames && this.stage === 'down') {
        this.stage = 'up';

        // ✅ Only count valid reps (good form + not too fast)
        const repTime = Date.now() - (this.repStartTime || Date.now());
        const repPace = getRepPace(repTime);

        if (formCheck.isValid && repPace !== 'fast') {
          this.count++;
          this.repTimes.push(repTime);
          this.lastValidRepTime = Date.now();
        } else {
          this.rejectedReps++;
          console.log(`[RepCounter] Rep rejected:`, {
            formValid: formCheck.isValid,
            pace: repPace,
            formFeedback: formCheck.feedback,
          });
        }
      }
    } else {
      this.upHoldFrames = 0;
    }
  }

  private updateSquats(
    lHip: any, lKnee: any, lAnkle: any, lShoulder: any,
    rHip: any, rKnee: any, rAnkle: any, rShoulder: any,
    motionProfile: PoseMotionProfile | null
  ) {
    if (!motionProfile) return;

    const leftLegVis = (lHip?.visibility || 0) + (lKnee?.visibility || 0) + (lAnkle?.visibility || 0);
    const rightLegVis = (rHip?.visibility || 0) + (rKnee?.visibility || 0) + (rAnkle?.visibility || 0);

    const hip = leftLegVis > rightLegVis ? lHip : rHip;
    const knee = leftLegVis > rightLegVis ? lKnee : rKnee;
    const ankle = leftLegVis > rightLegVis ? lAnkle : rAnkle;
    const shoulder = leftLegVis > rightLegVis ? lShoulder : rShoulder;

    if (!hip || !knee || !ankle || !shoulder) return;

    // ✅ Validate form
    const formCheck = validateSquatForm(shoulder, hip, knee, ankle);
    this.formQuality = formCheck.alignmentScore;

    // ✅ Calculate angle with smoothing
    let rawAngle = calculateAngle(hip, knee, ankle);
    this.lastAngle = smoothAngle(rawAngle, this.lastAngle, 0.2);
    const angle = this.lastAngle;

    const thresholds = this.thresholds.squats;

    if (angle < thresholds.down) {
      this.downHoldFrames += 1;
      this.upHoldFrames = 0;

      if (this.downHoldFrames >= this.minStageFrames) {
        if (this.stage !== 'down') {
          this.repStartTime = Date.now();
        }
        this.stage = 'down';
      }
    } else {
      this.downHoldFrames = 0;
    }

    if (angle > thresholds.up) {
      this.upHoldFrames += 1;
      this.downHoldFrames = 0;

      if (this.upHoldFrames >= this.minStageFrames && this.stage === 'down') {
        this.stage = 'up';

        const repTime = Date.now() - (this.repStartTime || Date.now());
        const repPace = getRepPace(repTime);

        if (formCheck.isValid && repPace !== 'fast') {
          this.count++;
          this.repTimes.push(repTime);
          this.lastValidRepTime = Date.now();
        } else {
          this.rejectedReps++;
        }
      }
    } else {
      this.upHoldFrames = 0;
    }
  }

  /**
   * Get statistics about the workout
   */
  getStats() {
    const avgRepTime = this.repTimes.length > 0
      ? this.repTimes.reduce((a, b) => a + b) / this.repTimes.length
      : 0;

    const fastestRep = this.repTimes.length > 0 ? Math.min(...this.repTimes) : 0;
    const slowestRep = this.repTimes.length > 0 ? Math.max(...this.repTimes) : 0;
    const totalTime = this.repTimes.reduce((a, b) => a + b, 0);

    return {
      reps: this.count,
      rejectedReps: this.rejectedReps,
      formQuality: this.formQuality,
      avgRepTime,
      fastestRep,
      slowestRep,
      totalTime,
      lastValidRepTime: this.lastValidRepTime,
    };
  }

  getCount() {
    return this.count;
  }

  getRejectedCount() {
    return this.rejectedReps;
  }

  getFormQuality() {
    return this.formQuality;
  }

  getStabilityScore() {
    const motionScore = Math.max(0, 1 - this.lastMotionDrift);
    const frameScore = Math.min(1, this.stableMotionFrames / this.minStableMotionFrames);
    const stageScore = this.stage === 'down' || this.stage === 'up' ? 1 : 0.75;
    return Math.max(0, Math.min(1, motionScore * 0.55 + frameScore * 0.3 + stageScore * 0.15));
  }

  reset() {
    this.count = 0;
    this.rejectedReps = 0;
    this.stage = 'none';
    this.lastAngle = null;
    this.repStartTime = null;
    this.repTimes = [];
    this.lastValidRepTime = 0;
    this.formQuality = 1.0;
    this.lastMotionProfile = null;
    this.stableMotionFrames = 0;
    this.lastMotionDrift = 1;
    this.downHoldFrames = 0;
    this.upHoldFrames = 0;
  }

  private updateMotionGate(motionProfile: PoseMotionProfile | null): boolean {
    if (!motionProfile || motionProfile.visibility < this.minVisibility) {
      this.stableMotionFrames = 0;
      this.lastMotionDrift = 1;
      this.lastMotionProfile = motionProfile;
      return false;
    }

    if (this.lastMotionProfile) {
      const drift = getNormalizedMotionDelta(motionProfile, this.lastMotionProfile);
      this.lastMotionDrift = Math.min(1, drift / this.maxNormalizedDrift);
      if (drift > this.maxNormalizedDrift) {
        this.stableMotionFrames = 0;
        this.lastMotionProfile = motionProfile;
        return false;
      }
    } else {
      this.lastMotionDrift = 0;
    }

    this.stableMotionFrames += 1;
    this.lastMotionProfile = motionProfile;
    return this.stableMotionFrames >= this.minStableMotionFrames;
  }
}
