import { FaceLandmarker, FilesetResolver, DrawingUtils } from "@mediapipe/tasks-vision";

export class FaceVision {
  private static instance: FaceLandmarker | null = null;

  private static normalizeVector(values: number[]) {
    const magnitude = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0));
    if (!Number.isFinite(magnitude) || magnitude <= 0) {
      return values;
    }
    return values.map(v => v / magnitude);
  }

  static async getInstance() {
    if (this.instance) return this.instance;

    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );

    try {
      this.instance = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
          delegate: "CPU"
        },
        outputFaceBlendshapes: true,
        runningMode: "VIDEO",
        numFaces: 5
      });
    } catch (error) {
      console.warn("[FaceVision] CPU delegate failed, retrying on GPU.", error);
      this.instance = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
          delegate: "GPU"
        },
        outputFaceBlendshapes: true,
        runningMode: "VIDEO",
        numFaces: 5
      });
    }

    return this.instance;
  }

  static drawMesh(ctx: CanvasRenderingContext2D, landmarks: any[]) {
    const drawingUtils = new DrawingUtils(ctx);
    drawingUtils.drawConnectors(
      landmarks,
      FaceLandmarker.FACE_LANDMARKS_TESSELATION,
      { color: "#C0C0C070", lineWidth: 1 }
    );
    drawingUtils.drawConnectors(
      landmarks,
      FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
      { color: "#39FF14" }
    );
    drawingUtils.drawConnectors(
      landmarks,
      FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
      { color: "#39FF14" }
    );
    drawingUtils.drawConnectors(
      landmarks,
      FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
      { color: "#E0E0E0", lineWidth: 2 }
    );
  }

  static calculateEmbedding(landmarks: any[]) {
    // ✅ FIX: Use more robust set of facial landmarks (33 points instead of 10)
    // These cover: eyes, nose, mouth, jawline, cheeks
    const keyIndices = [
      33, 263,    // eye centers
      1, 4, 17,   // nose & bridge
      61, 291,    // eye inner corners
      10, 152,    // mouth center
      234, 454,   // ears
      130, 359,   // face sides
      127, 356,   // face lower
      141, 372,   // face edges
      72, 302     // additional face geometry
    ];
    
    // ✅ VALIDATE: Check that landmarks is an array and has data
    if (!Array.isArray(landmarks) || landmarks.length === 0) {
      console.warn('[FaceVision.calculateEmbedding] Invalid landmarks input:', landmarks);
      return [];
    }

    const keyPoints = keyIndices
      .map(idx => landmarks[idx])
      .filter(p => p && typeof p.x === 'number' && typeof p.y === 'number' && typeof p.z === 'number');

    console.log('[FaceVision.calculateEmbedding]', {
      totalLandmarks: landmarks.length,
      keyIndicesRequested: keyIndices.length,
      validKeyPoints: keyPoints.length,
      requiredKeyPoints: Math.ceil(keyIndices.length * 0.8)
    });

    // ✅ FIX: Require at least 80% of points to be valid
    if (keyPoints.length < keyIndices.length * 0.8) {
      console.warn(`[FaceVision.calculateEmbedding] Not enough valid keypoints: ${keyPoints.length}/${keyIndices.length}`);
      return [];
    }

    // ✅ FIX: Better distance metric combining all 3D coordinates
    const distances: number[] = [];
    for (let i = 0; i < keyPoints.length; i++) {
      for (let j = i + 1; j < keyPoints.length; j++) {
        const dx = keyPoints[i].x - keyPoints[j].x;
        const dy = keyPoints[i].y - keyPoints[j].y;
        const dz = (keyPoints[i].z - keyPoints[j].z) * 0.5; // Z has less weight
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        // ✅ Filter out unrealistic distances (noise filtering)
        if (d > 0.001 && d < 2.0) {
          distances.push(d);
        }
      }
    }

    if (distances.length === 0) {
      console.warn('[FaceVision.calculateEmbedding] No valid distances calculated');
      return [];
    }

    // ✅ FIX: Use median-based normalization instead of first distance (more robust)
    const sorted = distances.slice().sort((a, b) => a - b);
    const medianDist = sorted[Math.floor(sorted.length / 2)] || 0.1;
    const normalizedDistances = distances.map(d => d / (medianDist || 0.1));
    const unitVector = this.normalizeVector(normalizedDistances);

    // ✅ VALIDATE: Check that the result is valid
    const embedding = unitVector.map(v => parseFloat(v.toFixed(6)));
    if (embedding.length === 0 || embedding.some(v => !Number.isFinite(v))) {
      console.warn('[FaceVision.calculateEmbedding] Generated embedding is invalid:', embedding);
      return [];
    }

    console.log('[FaceVision.calculateEmbedding] SUCCESS:', {
      embeddingLength: embedding.length,
      sample: embedding.slice(0, 5),
      distanceCount: distances.length,
      medianDistance: parseFloat(medianDist.toFixed(6))
    });

    return embedding;
  }

  static compareEmbeddings(emb1: number[], emb2: number[]) {
    if (emb1.length !== emb2.length) return 0;

    const n1 = this.normalizeVector(emb1);
    const n2 = this.normalizeVector(emb2);

    let dot = 0;
    for (let i = 0; i < n1.length; i++) {
      dot += n1[i] * n2[i];
    }

    // Clamp to [0, 1] for easy thresholding.
    return Math.max(0, Math.min(1, dot));
  }

  static euclideanDistance(emb1: number[], emb2: number[]) {
    if (emb1.length !== emb2.length || emb1.length === 0) {
      return Number.POSITIVE_INFINITY;
    }

    const n1 = this.normalizeVector(emb1);
    const n2 = this.normalizeVector(emb2);

    let sum = 0;
    for (let i = 0; i < n1.length; i++) {
      const diff = n1[i] - n2[i];
      sum += diff * diff;
    }

    return Math.sqrt(sum);
  }
}
