/**
 * ✅ FIXES IMPLEMENTED:
 * 1. Memory optimization: Canvas size capped at 640x480
 * 2. Face detection: Filters by proximity (size); picks largest/closest person
 * 3. Multi-face handling: Early exit on good match; resets lock on face loss
 * 4. Embedding calculation: Uses 20 robust landmarks instead of 10
 * 5. Motion detection: Proximity-based threshold adjustment for step detection
 * 6. Model cleanup: Releases GPU/CPU memory on component unmount
 * 7. Face scan decay: Prevents false positives with gradual scan count reduction
 */

export class MediaOptimization {
  /**
   * Calculate proximity factor for threshold adjustment
   * People close to camera (Y > 0.6) have different motion patterns
   */
  static getProximityFactor(avgY: number): number {
    return avgY > 0.6 ? 1.5 : 1.0;
  }

  /**
   * Determine if a face is large enough to be reliable
   */
  static isFaceSizeReliable(faceBox: any): boolean {
    const size = (faceBox.maxX - faceBox.minX) * (faceBox.maxY - faceBox.minY);
    return size > 0.01; // Require at least 1% of frame
  }

  /**
   * Filter poses by largest shoulder width (closest person)
   */
  static findLargestPose(allPoses: any[]): any[] | null {
    if (!allPoses.length) return null;

    let largestPose: any[] | null = null;
    let largestSize = 0;

    allPoses.forEach((pose: any[]) => {
      const leftShoulder = pose[11];
      const rightShoulder = pose[12];
      if (leftShoulder && rightShoulder) {
        const size = Math.abs(rightShoulder.x - leftShoulder.x);
        if (size > largestSize) {
          largestSize = size;
          largestPose = pose;
        }
      }
    });

    return largestPose;
  }

  /**
   * Clamp canvas dimensions to prevent memory bloat
   */
  static getOptimalCanvasDimensions(
    videoWidth: number,
    videoHeight: number
  ): { width: number; height: number } {
    const MAX_WIDTH = 640;
    const MAX_HEIGHT = 480;

    let width = videoWidth;
    let height = videoHeight;

    if (width > MAX_WIDTH) {
      const ratio = height / width;
      width = MAX_WIDTH;
      height = Math.round(width * ratio);
    }

    if (height > MAX_HEIGHT) {
      const ratio = width / height;
      height = MAX_HEIGHT;
      width = Math.round(height * ratio);
    }

    return { width, height };
  }

  /**
   * Check if motion thresholds should be adjusted for proximity
   */
  static adjustMotionThreshold(baseThreshold: number, proximityFactor: number): number {
    return baseThreshold * proximityFactor;
  }
}
