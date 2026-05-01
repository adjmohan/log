import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

export class HandVision {
  private static instance: HandLandmarker | null = null;

  static async getInstance() {
    if (this.instance) return this.instance;

    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );

    this.instance = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "CPU",
      },
      runningMode: "VIDEO",
      numHands: 2,
    });

    return this.instance;
  }
}
