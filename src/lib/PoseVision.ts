import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

export class PoseVision {
  private static instance: PoseLandmarker | null = null;

  static async getInstance() {
    if (this.instance) return this.instance;

    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );

    try {
      this.instance = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
          delegate: "CPU"
        },
        runningMode: "VIDEO",
        numPoses: 5
      });
    } catch (error) {
      console.warn("[PoseVision] CPU delegate failed, retrying on GPU.", error);
      this.instance = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numPoses: 5
      });
    }

    return this.instance;
  }

  static calculateAngle(a: any, b: any, c: any) {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs((radians * 180.0) / Math.PI);
    if (angle > 180.0) angle = 360 - angle;
    return angle;
  }
}
