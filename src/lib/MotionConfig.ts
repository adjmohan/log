/**
 * Motion Detection Configuration
 * Dynamically adjusted based on user proximity to camera
 */

export const MOTION_CONFIG = {
  // Distance thresholds adjusted for proximity
  STEP_DELTA_THRESHOLD: 0.0045,           // Base: vertical body movement
  HIP_STEP_DELTA_THRESHOLD: 0.003,        // Hip oscillation signal
  STEP_MIN_INTERVAL_MS: 320,              // Minimum milliseconds between step counts
  STEP_FALLBACK_INTERVAL_MS: 1200,        // Fallback if walking detected but no direct signal
  
  // Proximity detection: if nose Y > CLOSE_PROXIMITY_THRESHOLD, person is close to camera
  CLOSE_PROXIMITY_THRESHOLD: 0.6,
  CLOSE_PROXIMITY_MULTIPLIER: 1.5,        // 1.5x stricter thresholds when person is close
  
  // Ankle-based detection
  FOOT_GAP_BASE_THRESHOLD: 0.012,         // Vertical gap between ankles
  
  // Pose processing
  POSE_PROCESS_INTERVAL_MS: 33,           // ~30fps
  
  // Face detection
  FACE_CHECK_INTERVAL_MS: 1500,           // Less frequent face verification
  FACE_MATCH_DISTANCE_THRESHOLD: 1.05,    // Euclidean distance threshold for match
  FACE_MIN_WIDTH_THRESHOLD: 0.18,         // Minimum face width as % of frame
  FACE_CENTER_THRESHOLD: 0.15,            // How far from center before "re-center your face"\n  FACE_TRACK_MAX_DRIFT: 0.08,             // Max drift for tracking existing face lock\n  FACE_SCAN_MIN_FRAMES: 5,                // Frames needed for stable face detection\n  \n  // Voice/audio\n  POSE_VOICE_COOLDOWN_MS: 2500,          // Prevent voice spam\n  \n  // Data sync\n  DATA_SYNC_INTERVAL_MS: 15000,          // Send fitness data every 15s\n  \n  // Canvas optimization\n  MAX_CANVAS_WIDTH: 640,\n  MAX_CANVAS_HEIGHT: 480,\n};\n\n/**\n * Get adjusted thresholds based on user proximity\n */\nexport function getAdjustedThresholds(proximityY: number) {\n  const isClose = proximityY > MOTION_CONFIG.CLOSE_PROXIMITY_THRESHOLD;\n  const multiplier = isClose ? MOTION_CONFIG.CLOSE_PROXIMITY_MULTIPLIER : 1.0;\n  \n  return {\n    stepDeltaThreshold: MOTION_CONFIG.STEP_DELTA_THRESHOLD * multiplier,\n    footGapThreshold: MOTION_CONFIG.FOOT_GAP_BASE_THRESHOLD * multiplier,\n    proximityFactor: multiplier,\n    isClose,\n  };\n}\n"