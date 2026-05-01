import { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  CheckCircle2,
  CircleHelp,
  ThumbsUp,
  X,
  XCircle,
} from "lucide-react";
import type { ExerciseType } from "../types";
import { PoseVision } from "../lib/PoseVision";
import { FaceVision } from "../lib/FaceVision";
import { HandVision } from "../lib/HandVision";
import { RepCounter } from "../lib/RepCounter";
import { StepCounter } from "../lib/StepCounter";
import { MediaOptimization } from "../lib/MediaOptimization";
import { useAuth } from "../contexts/AuthContext";
import { getFaceEmbedding, getServerUserProfile } from "../api/face";
import { calculateAngle } from "../lib/PoseUtils";
import { DrawingUtils, PoseLandmarker } from "@mediapipe/tasks-vision";
import { trackWorkoutSession } from "../services/fitnessStorage";
import { sendFitnessDelta } from "../services/syncQueue";

type Phase = "permission" | "loading" | "active";
type SessionState = "idle" | "countdown" | "running";
type MotionType = "thumbs_up" | "none";

type FaceBox = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

const FACE_CHECK_INTERVAL_SLOW = 5000;
const FACE_CHECK_INTERVAL_FAST = 500;
const CAMERA_WIDTH = 480;
const CAMERA_HEIGHT = 360;
const DRAW_POSE_SKELETON = false;
const FACE_MATCH_SIMILARITY_THRESHOLD = 0.82;
const FACE_TRACK_MAX_DRIFT = 0.14;
const VOICE_REPEAT_COOLDOWN_MS = 3000;
const FACE_MIN_WIDTH_THRESHOLD = 0.18; // ~120px equivalent in normalized coords (0-1)
const FACE_CENTER_THRESHOLD = 0.2; // Normalized drift allowed from center
const FACE_UNLOCK_TIMEOUT_MS = 6500;
const FACE_MISS_STREAK_LIMIT = 2;
const HAND_PROCESS_INTERVAL_MS = 120;
const THUMBS_UP_CONFIDENCE_THRESHOLD = 0.75;
const THUMBS_UP_HOLD_MS = 500;
const FACE_SCAN_MIN_FRAMES = 2;
const WORKOUT_COUNTDOWN_SECONDS = 3;
const AUTO_START_DELAY_MS = 2200;
const DEFAULT_WEIGHT_KG = 70;
const DATA_SYNC_INTERVAL_MS = 15000;
const TARGET_FPS = 24;
const FACE_CHECK_EVERY_N_FRAMES = 5;
const HAND_CHECK_EVERY_N_FRAMES = 3;
const MIN_POSE_CONFIDENCE = 0.5;
const REP_ACCEPT_INTERVAL_MS = 900;
const POSE_SMOOTH_WINDOW = 4;
const REP_PHASE_DOWN_ANGLE = 90;
const REP_PHASE_UP_ANGLE = 160;

type PoseLandmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
  [key: string]: number | undefined;
};

type HandMotionResult = {
  thumbsUp: boolean;
  confidence: number;
};

function CameraLayer({
  videoRef,
  canvasRef,
}: {
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
}) {
  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }}
      />
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: "scaleX(-1)",
          zIndex: 2,
        }}
      />
    </>
  );
}

const getFaceBounds = (landmarks: { x: number; y: number }[]): FaceBox => {
  const xs = landmarks.map((l) => l.x);
  const ys = landmarks.map((l) => l.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
};

const isNoseInsideLockedFace = (nose: { x: number; y: number }, box: FaceBox) => {
  const padX = (box.maxX - box.minX) * 0.35;
  const padY = (box.maxY - box.minY) * 0.45;
  return (
    nose.x >= box.minX - padX &&
    nose.x <= box.maxX + padX &&
    nose.y >= box.minY - padY &&
    nose.y <= box.maxY + padY
  );
};

const getFaceCenter = (box: FaceBox) => ({
  x: (box.minX + box.maxX) / 2,
  y: (box.minY + box.maxY) / 2,
});

const getFaceDrift = (a: FaceBox, b: FaceBox) => {
  const ac = getFaceCenter(a);
  const bc = getFaceCenter(b);
  const dx = ac.x - bc.x;
  const dy = ac.y - bc.y;
  return Math.sqrt(dx * dx + dy * dy);
};

const formatDuration = (totalSeconds: number) => {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
};

const detectThumbsUp = (handLandmarks: { x: number; y: number }[] | undefined): HandMotionResult => {
  if (!handLandmarks?.length) {
    return { thumbsUp: false, confidence: 0 };
  }

  const wrist = handLandmarks[0];
  const thumbTip = handLandmarks[4];
  const indexMcp = handLandmarks[5];
  const indexTip = handLandmarks[8];
  const middleTip = handLandmarks[12];
  const ringTip = handLandmarks[16];
  const pinkyTip = handLandmarks[20];

  if (!wrist || !thumbTip || !indexMcp || !indexTip || !middleTip || !ringTip || !pinkyTip) {
    return { thumbsUp: false, confidence: 0 };
  }

  const wristToIndex = Math.max(Math.abs(indexMcp.y - wrist.y), 1e-6);
  const thumbUpness = Math.max(0, (indexMcp.y - thumbTip.y) / wristToIndex);
  const foldedFingers = [indexTip, middleTip, ringTip, pinkyTip].reduce(
    (score, tip) => score + Math.max(0, (tip.y - indexMcp.y) / wristToIndex),
    0
  );
  const foldScore = Math.min(1, foldedFingers / 4);
  const confidence = Math.min(1, 0.6 * thumbUpness + 0.4 * foldScore);
  const thumbsUp =
    thumbTip.y < indexMcp.y &&
    indexTip.y > indexMcp.y &&
    middleTip.y > indexMcp.y &&
    ringTip.y > indexMcp.y &&
    pinkyTip.y > indexMcp.y &&
    confidence >= THUMBS_UP_CONFIDENCE_THRESHOLD;

  return { thumbsUp, confidence };
};

export default function LiveTracking() {
  const { exerciseType } = useParams<{ exerciseType: ExerciseType }>();
  const exercise: ExerciseType = (exerciseType as ExerciseType) || "pushups";
  const { user } = useAuth();
  const navigate = useNavigate();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poseLandmarkerRef = useRef<any>(null);
  const faceLandmarkerRef = useRef<any>(null);
  const handLandmarkerRef = useRef<any>(null);
  const stepCounterRef = useRef(new StepCounter());

  const isVerifiedRef = useRef(false);
  const lastFaceCheckRef = useRef(0);
  const lockedFaceBoxRef = useRef<FaceBox | null>(null);
  const profileEmbeddingRef = useRef<number[] | null>(null);
  const repsRef = useRef(0);
  const stepsRef = useRef(0);
  const elapsedRef = useRef(0);
  const sessionStateRef = useRef<SessionState>("idle");
  const lastSpokenRef = useRef(0);
  const lastSpokenMessageRef = useRef("");
  const isSpeakingRef = useRef(false);
  const stableExerciseFramesRef = useRef(0);
  const faceScanFramesRef = useRef(0);
  const lastFaceSeenAtRef = useRef(0);
  const faceMissStreakRef = useRef(0);
  const poseFrameCountRef = useRef(0);
  const lastHandProcessRef = useRef(0);
  const thumbsUpHoldStartRef = useRef<number | null>(null);
  const thumbsUpActionTriggeredRef = useRef(false);
  const userNameRef = useRef<string>("Mohan");
  const lastCalorieMilestoneRef = useRef(0);
  const workoutCaloriesRef = useRef(0);
  const lastSyncedStepsRef = useRef(0);
  const lastSyncedCaloriesRef = useRef(0);
  const lastRepAcceptedAtRef = useRef(0);
  const poseSmoothBufferRef = useRef<PoseLandmark[][]>([]);
  const repPhaseRef = useRef<"up" | "down">("up");
  const fallbackRepCounterRef = useRef(new RepCounter(exercise));

  const [phase, setPhase] = useState<Phase>("permission");
  const [verified, setVerified] = useState(false);
  const [statusLabel, setStatusLabel] = useState("User Not Verified");
  const [feedback, setFeedback] = useState("Initializing AI...");
  const [, setCameraError] = useState<string | null>(null);
  const [sessionState, setSessionState] = useState<SessionState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [reps, setReps] = useState(0);
  const [steps, setSteps] = useState(0);
  const [motion, setMotion] = useState<MotionType>("none");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [userWeightKg, setUserWeightKg] = useState(DEFAULT_WEIGHT_KG);

  const displayExercise = useMemo(
    () => exercise.replace(/([A-Z])/g, " $1").trim(),
    [exercise]
  );

  const calculateCaloriesAdvanced = ({
    reps: repsValue,
    seconds,
    weight,
    MET = 5,
  }: {
    reps: number;
    seconds: number;
    weight: number;
    MET?: number;
  }) => {
    const timeCalories = (MET * weight * seconds) / 3600;
    const repCalories = repsValue * 0.32 * (weight / 70);
    return timeCalories + repCalories;
  };

  const workoutCalories = calculateCaloriesAdvanced({
    reps,
    seconds: elapsed,
    weight: userWeightKg,
    MET: exercise === "burpees" ? 10 : exercise === "pushups" ? 8 : exercise === "squats" ? 5 : 5,
  });

  useEffect(() => {
    workoutCaloriesRef.current = workoutCalories;
  }, [workoutCalories]);

  useEffect(() => {
    if (!verified && isVerifiedRef.current) {
      speakSmart("User not verified");
    }
    isVerifiedRef.current = verified;
  }, [verified]);

  useEffect(() => {
    repsRef.current = reps;
  }, [reps]);

  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);

  useEffect(() => {
    elapsedRef.current = elapsed;
  }, [elapsed]);

  useEffect(() => {
    sessionStateRef.current = sessionState;
  }, [sessionState]);

  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (verified && sessionState === "running") {
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [verified, sessionState]);

  useEffect(() => {
    if (sessionState === "countdown" && countdown !== null) {
      if (countdown > 0) {
        const t = setTimeout(() => {
          setCountdown(countdown - 1);
          speakSmart(`${countdown - 1}`);
        }, 1000);
        return () => clearTimeout(t);
      } else {
        setSessionState("running");
        setFeedback("Verified. Workout started");
        speakSmart("Go!");
        setCountdown(null);
      }
    }
  }, [sessionState, countdown]);

  const clearAutoStartTimer = () => {
    if (autoStartTimeoutRef.current) {
      clearTimeout(autoStartTimeoutRef.current);
      autoStartTimeoutRef.current = null;
    }
  };

  const getCameraErrorMessage = (err: unknown) => {
    const name = (err as { name?: string })?.name;
    if (name === "NotAllowedError" || name === "SecurityError") {
      return "Camera access denied. Please allow camera permission in app/browser settings.";
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return "No camera found on this device.";
    }
    if (name === "NotReadableError" || name === "TrackStartError") {
      return "Camera is busy in another app. Close other camera apps and retry.";
    }
    return "Unable to start camera. Please try again.";
  };

  const speakSmart = (text: string) => {
    const now = Date.now();

    if (typeof window === "undefined" || !window.speechSynthesis) {
      return;
    }

    // Prevent repeat within cooldown and avoid overlapping voices.
    if (text === lastSpokenMessageRef.current && now - lastSpokenRef.current < VOICE_REPEAT_COOLDOWN_MS) {
      return;
    }

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      isSpeakingRef.current = false;
    }

    const msg = new SpeechSynthesisUtterance(text);
    msg.lang = "en-IN";
    msg.pitch = 1.0;
    msg.rate = 1.0;
    msg.onstart = () => {
      isSpeakingRef.current = true;
    };
    msg.onend = () => {
      isSpeakingRef.current = false;
    };
    msg.onerror = () => {
      isSpeakingRef.current = false;
    };

    lastSpokenRef.current = now;
    lastSpokenMessageRef.current = text;
    window.speechSynthesis.speak(msg);
  };

  const releaseFaceLock = (reason: string, voiceMessage?: string) => {
    if (voiceMessage) {
      speakSmart(voiceMessage);
    }

    setSessionState("idle");
    setCountdown(null);
    lockedFaceBoxRef.current = null;
    setVerified(false);
    isVerifiedRef.current = false;
    setStatusLabel("User Not Verified");
    setFeedback(reason);
    faceScanFramesRef.current = 0;
    faceMissStreakRef.current = 0;
    thumbsUpHoldStartRef.current = null;
    thumbsUpActionTriggeredRef.current = false;
    setMotion("none");
  };

  const startWorkoutCountdown = (spokenMessage = "Starting in 3", feedbackMessage = "Starting workout") => {
    if (!isVerifiedRef.current || sessionStateRef.current !== "idle") {
      return;
    }

    clearAutoStartTimer();
    setSessionState("countdown");
    setCountdown(WORKOUT_COUNTDOWN_SECONDS);
    setFeedback(feedbackMessage);
    speakSmart(spokenMessage);
  };

  const scheduleAutoStart = () => {
    if (!isVerifiedRef.current || sessionStateRef.current !== "idle" || autoStartTimeoutRef.current) {
      return;
    }

    autoStartTimeoutRef.current = window.setTimeout(() => {
      autoStartTimeoutRef.current = null;
      startWorkoutCountdown(
        "No gesture detected. Starting in 3",
        "No thumbs up detected. Auto-starting workout"
      );
    }, AUTO_START_DELAY_MS);
  };

  const runThrottledHandCheck = (video: HTMLVideoElement, nowMs: number) => {
    const handLandmarker = handLandmarkerRef.current;

    if (!handLandmarker || !isVerifiedRef.current) {
      thumbsUpHoldStartRef.current = null;
      thumbsUpActionTriggeredRef.current = false;
      setMotion("none");
      return;
    }

    if (nowMs - lastHandProcessRef.current < HAND_PROCESS_INTERVAL_MS) return;
    lastHandProcessRef.current = nowMs;

    const results = handLandmarker.detectForVideo(video, nowMs);
    const hands: { x: number; y: number }[][] = results?.landmarks ?? results?.handLandmarks ?? [];
    const bestGesture = hands.reduce<HandMotionResult>(
      (best, hand) => {
        const gesture = detectThumbsUp(hand);
        return gesture.confidence > best.confidence ? gesture : best;
      },
      { thumbsUp: false, confidence: 0 }
    );

    if (bestGesture.thumbsUp) {
      setMotion("thumbs_up");

      if (thumbsUpHoldStartRef.current === null) {
        thumbsUpHoldStartRef.current = nowMs;
      }

      const heldMs = nowMs - thumbsUpHoldStartRef.current;
      if (heldMs >= THUMBS_UP_HOLD_MS && !thumbsUpActionTriggeredRef.current) {
        thumbsUpActionTriggeredRef.current = true;
        setFeedback("Thumbs up detected. Starting workout");
        startWorkoutCountdown(
          "Thumbs up detected. Starting in 3",
          "Thumbs up detected. Starting workout"
        );
      }
      return;
    }

    setMotion("none");
    thumbsUpHoldStartRef.current = null;
    thumbsUpActionTriggeredRef.current = false;
  };

  const smoothPose = (pose: PoseLandmark[]) => {
    poseSmoothBufferRef.current.push(pose);
    if (poseSmoothBufferRef.current.length > POSE_SMOOTH_WINDOW) {
      poseSmoothBufferRef.current.shift();
    }

    return pose.map((landmark, index) => {
      const samples = poseSmoothBufferRef.current
        .map((bufferedPose) => bufferedPose[index])
        .filter((sample): sample is PoseLandmark => Boolean(sample));

      if (!samples.length) {
        return landmark;
      }

      const averageValue = (key: keyof PoseLandmark) => {
        const values = samples
          .map((sample) => sample[key])
          .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

        if (!values.length) {
          return landmark[key];
        }

        return values.reduce((sum, value) => sum + value, 0) / values.length;
      };

      return {
        ...landmark,
        x: averageValue("x") ?? landmark.x,
        y: averageValue("y") ?? landmark.y,
        z: averageValue("z") ?? landmark.z,
        visibility: averageValue("visibility") ?? landmark.visibility,
      };
    });
  };

  const getPoseConfidence = (pose: PoseLandmark[] | null) => {
    if (!pose?.length) return 0;

    const confidenceLandmarks = [11, 12, 23, 24, 25, 26, 27, 28]
      .map((index) => Number(pose[index]?.visibility ?? 0))
      .filter((value) => Number.isFinite(value));

    if (!confidenceLandmarks.length) return 0;
    return confidenceLandmarks.reduce((sum, value) => sum + value, 0) / confidenceLandmarks.length;
  };

  const getPoseStabilityScore = (pose: PoseLandmark[] | null) => {
    if (!pose?.length) return 0;

    const recentBuffer = poseSmoothBufferRef.current;
    if (recentBuffer.length < 2) return 0.5;

    let totalDrift = 0;
    let samples = 0;

    for (let i = 1; i < recentBuffer.length; i++) {
      const previousPose = recentBuffer[i - 1];
      const currentPose = recentBuffer[i];
      const previousTorso = calculateAngle(previousPose[11], previousPose[23], previousPose[25]);
      const currentTorso = calculateAngle(currentPose[11], currentPose[23], currentPose[25]);
      totalDrift += Math.abs(currentTorso - previousTorso);
      samples += 1;
    }

    const meanDrift = samples > 0 ? totalDrift / samples : 180;
    const visibility = getPoseConfidence(pose);
    const driftScore = Math.max(0, 1 - meanDrift / 35);

    return Math.max(0, Math.min(1, driftScore * 0.7 + visibility * 0.3));
  };

  const getRepAngle = (pose: PoseLandmark[], currentExercise: ExerciseType) => {
    const chooseSide = (
      leftIndices: [number, number, number],
      rightIndices: [number, number, number]
    ) => {
      const leftScore = leftIndices.reduce((sum, index) => sum + Number(pose[index]?.visibility ?? 0), 0);
      const rightScore = rightIndices.reduce((sum, index) => sum + Number(pose[index]?.visibility ?? 0), 0);
      return leftScore >= rightScore ? leftIndices : rightIndices;
    };

    if (currentExercise === "pushups") {
      const [shoulderIndex, elbowIndex, wristIndex] = chooseSide([11, 13, 15], [12, 14, 16]);
      if (!pose[shoulderIndex] || !pose[elbowIndex] || !pose[wristIndex]) return null;
      return calculateAngle(pose[shoulderIndex], pose[elbowIndex], pose[wristIndex]);
    }

    if (currentExercise === "squats" || currentExercise === "lunges" || currentExercise === "highKnees") {
      const [hipIndex, kneeIndex, ankleIndex] = chooseSide([23, 25, 27], [24, 26, 28]);
      if (!pose[hipIndex] || !pose[kneeIndex] || !pose[ankleIndex]) return null;
      return calculateAngle(pose[hipIndex], pose[kneeIndex], pose[ankleIndex]);
    }

    return null;
  };

  const detectRepAdvanced = (jointAngle: number | null) => {
    if (jointAngle === null || !Number.isFinite(jointAngle)) {
      return false;
    }

    const now = Date.now();

    if (jointAngle < REP_PHASE_DOWN_ANGLE && repPhaseRef.current === "up") {
      repPhaseRef.current = "down";
    }

    if (jointAngle > REP_PHASE_UP_ANGLE && repPhaseRef.current === "down") {
      if (now - lastRepAcceptedAtRef.current > REP_ACCEPT_INTERVAL_MS) {
        repPhaseRef.current = "up";
        lastRepAcceptedAtRef.current = now;
        return true;
      }
    }

    return false;
  };

  const detectSteps = (landmarks: any[]) => {
    const nextCount = stepCounterRef.current.update(landmarks);

    if (nextCount > stepsRef.current) {
      stepsRef.current = nextCount;
      setSteps(nextCount);
      return true;
    }

    return false;
  };

  const stopWorkoutMode = () => {
    if (sessionStateRef.current === "running" && (repsRef.current > 0 || elapsedRef.current > 0)) {
      trackWorkoutSession(repsRef.current, workoutCaloriesRef.current);
    }

    stopWorkoutTracking();
    navigate("/workout-selection");
  };

  useEffect(() => {
    if (steps > 0 && steps % 50 === 0 && steps !== lastCalorieMilestoneRef.current) {
      lastCalorieMilestoneRef.current = steps;
      speakSmart(`You burned ${workoutCalories.toFixed(1)} calories`);
    }
  }, [steps, workoutCalories]);

  useEffect(() => {
    const syncTimer = window.setInterval(() => {
      if (!user?.uid) {
        return;
      }

      if (!isVerifiedRef.current || sessionStateRef.current !== "running") {
        return;
      }

      const totalSteps = stepsRef.current;
      const totalCalories = workoutCaloriesRef.current;

      const stepDelta = Math.max(0, totalSteps - lastSyncedStepsRef.current);
      const calorieDelta = Math.max(0, totalCalories - lastSyncedCaloriesRef.current);

      if (stepDelta <= 0 && calorieDelta <= 0) {
        return;
      }

      const activity = "Workout";

      sendFitnessDelta({
        userId: user.uid,
        steps: stepDelta,
        calories: Number(calorieDelta.toFixed(2)),
        activity,
        timestamp: Date.now(),
      }).catch((error) => {
        console.error("Fitness delta sync failed:", error);
      });

      lastSyncedStepsRef.current = totalSteps;
      lastSyncedCaloriesRef.current = totalCalories;
    }, DATA_SYNC_INTERVAL_MS);

    return () => {
      window.clearInterval(syncTimer);
    };
  }, [user]);

  const openHowTo = () => {
    const query = `${displayExercise} exercise`.toLowerCase().replace(/\s+/g, "+");
    const url = `https://www.youtube.com/results?search_query=${query}`;
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) {
      window.location.href = url;
    }
  };

  const stopWorkoutTracking = () => {
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
      requestRef.current = undefined;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    clearAutoStartTimer();

    const stream = videoRef.current?.srcObject as MediaStream | undefined;
    stream?.getTracks().forEach((track) => track.stop());
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    isSpeakingRef.current = false;
  };

  const requestPermission = async () => {
    try {
      setPhase("loading");
      setCameraError(null);

      if (!navigator.mediaDevices?.getUserMedia) {
        throw { name: "NotSupportedError" };
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: CAMERA_WIDTH },
          height: { ideal: CAMERA_HEIGHT },
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          initModules();
        };
      }
    } catch (err) {
      console.error("Camera permission denied:", err);
      setCameraError(getCameraErrorMessage(err));
      setPhase("permission");
    }
  };

  const initModules = async () => {
    try {
      if (user) {
        userNameRef.current = user.displayName || "Mohan";

        try {
          const embedding = await getFaceEmbedding(user.uid);
          profileEmbeddingRef.current = embedding?.length ? embedding : null;
        } catch (faceError) {
          console.warn("Face profile unavailable.", faceError);
          profileEmbeddingRef.current = null;
        }

        const profile = await getServerUserProfile(user.uid);
        const profileWeight = Number(profile?.weight);
        if (Number.isFinite(profileWeight) && profileWeight > 0) {
          setUserWeightKg(profileWeight);
        }
      }

      const poseLandmarker = await PoseVision.getInstance();
      let faceLandmarker: Awaited<ReturnType<typeof FaceVision.getInstance>> | null = null;
      let handLandmarker: Awaited<ReturnType<typeof HandVision.getInstance>> | null = null;

      try {
        faceLandmarker = await FaceVision.getInstance();
      } catch (faceError) {
        console.warn("Face model unavailable, continuing with pose-only tracking.", faceError);
      }

      try {
        handLandmarker = await HandVision.getInstance();
      } catch (handError) {
        console.warn("Hand model unavailable, workout will start automatically after verification.", handError);
      }

      poseLandmarkerRef.current = poseLandmarker;
      faceLandmarkerRef.current = faceLandmarker;
      handLandmarkerRef.current = handLandmarker;

      setPhase("active");
      if (faceLandmarker && profileEmbeddingRef.current) {
        setFeedback("Show your face for quick verification");
        speakSmart("Show your face for quick verification");
      } else {
        setFeedback("Face profile missing. Complete Face Setup first.");
        setVerified(false);
        isVerifiedRef.current = false;
        setStatusLabel("Face lock required");
        setSessionState("idle");
      }
      startLoop();
    } catch (err) {
      console.error("Failed to init tracking:", err);
      setFeedback("Model loading error");
      setPhase("permission");
    }
  };

  const runThrottledFaceCheck = (video: HTMLVideoElement, nowMs: number) => {
    if (!faceLandmarkerRef.current) {
      return;
    }

    const interval = isVerifiedRef.current ? FACE_CHECK_INTERVAL_SLOW : FACE_CHECK_INTERVAL_FAST;
    if (nowMs - lastFaceCheckRef.current < interval) return;
    lastFaceCheckRef.current = nowMs;

    const results = faceLandmarkerRef.current.detectForVideo(video, nowMs);
    const faces: { x: number; y: number }[][] = results?.faceLandmarks ?? [];
    const faceBoxes = faces.map((face: { x: number; y: number }[]) => getFaceBounds(face));

    type FaceCandidate = {
      box: FaceBox;
      face: { x: number; y: number }[];
      size: number;
      index: number;
    };

    // ✅ FIX: Filter faces by proximity (size) - prioritize larger/closer faces
    const faceWithSizes: FaceCandidate[] = faceBoxes.map((box: FaceBox, i: number): FaceCandidate => ({
      box,
      face: faces[i],
      size: (box.maxX - box.minX) * (box.maxY - box.minY),
      index: i,
    }));
    faceWithSizes.sort((a: FaceCandidate, b: FaceCandidate) => b.size - a.size); // Largest first
    const profileEmbedding = profileEmbeddingRef.current;

    if (!profileEmbedding?.length) {
      setFeedback("Database face missing. Complete Face Setup first.");
      return;
    }

    if (isVerifiedRef.current) {
      const lockedBox = lockedFaceBoxRef.current;
      if (!lockedBox) {
        releaseFaceLock("Face lock lost. Please verify again.");
        return;
      }

      const lockedCandidate = faces.find((face: { x: number; y: number }[]) => {
        const nose = face[0];
        return nose && isNoseInsideLockedFace(nose, lockedBox);
      });

      if (!lockedCandidate) {
        faceMissStreakRef.current += 1;
        const noFaceDuration = Date.now() - lastFaceSeenAtRef.current;
        if (noFaceDuration >= FACE_UNLOCK_TIMEOUT_MS && faceMissStreakRef.current >= FACE_MISS_STREAK_LIMIT) {
          releaseFaceLock("Face tracking lost. Please verify again.", "User verification lost");
        } else {
          setFeedback(faces.length > 1 ? "Keep the verified user centered" : "Keep your verified face in frame");
        }
        return;
      }

      const minDrift = getFaceDrift(getFaceBounds(lockedCandidate), lockedBox);

      if (minDrift <= FACE_TRACK_MAX_DRIFT) {
        lockedFaceBoxRef.current = getFaceBounds(lockedCandidate);
        lastFaceSeenAtRef.current = Date.now();
        faceMissStreakRef.current = 0;
      } else {
        faceMissStreakRef.current += 1;
        const noFaceDuration = Date.now() - lastFaceSeenAtRef.current;
        if (noFaceDuration >= FACE_UNLOCK_TIMEOUT_MS && faceMissStreakRef.current >= FACE_MISS_STREAK_LIMIT) {
          releaseFaceLock("Face tracking lost. Please verify again.", "User verification lost");
        }
      }
      return;
    }

    const bestMatch = faceWithSizes.reduce(
      (best: { index: number; similarity: number } | null, item: FaceCandidate) => {
        if (item.size < 0.01) {
          return best;
        }

        const embedding = FaceVision.calculateEmbedding(item.face);
        if (!embedding.length) {
          return best;
        }

        const similarity = FaceVision.compareEmbeddings(embedding, profileEmbedding);
        if (!best || similarity > best.similarity) {
          return { index: item.index, similarity };
        }

        return best;
      },
      null
    );

    if (!bestMatch || bestMatch.similarity < FACE_MATCH_SIMILARITY_THRESHOLD) {
      if (isVerifiedRef.current) {
        speakSmart("User verification lost");
      }
      setVerified(false);
      isVerifiedRef.current = false;
      setStatusLabel("User Not Verified");
      faceScanFramesRef.current = Math.max(0, faceScanFramesRef.current - 1);
      setFeedback(faceWithSizes.length > 1 ? "Looking for authorized face..." : "Face not detected");
      return;
    }

    const box = faceBoxes[bestMatch.index];
    const faceCenter = getFaceCenter(box);
    const isInside = Math.abs(faceCenter.x - 0.5) < FACE_CENTER_THRESHOLD &&
                     Math.abs(faceCenter.y - 0.5) < FACE_CENTER_THRESHOLD;
    const isSizeOK = (box.maxX - box.minX) > FACE_MIN_WIDTH_THRESHOLD;

    if (isInside && isSizeOK) {
      faceScanFramesRef.current++;

      if (faceScanFramesRef.current >= FACE_SCAN_MIN_FRAMES) {
        if (!isVerifiedRef.current) {
          speakSmart("User verified. Hold a thumbs up or wait for auto start.");
        }
        lockedFaceBoxRef.current = box;
        lastFaceSeenAtRef.current = Date.now();
        faceMissStreakRef.current = 0;
        setVerified(true);
        isVerifiedRef.current = true;
        setStatusLabel("User Verified");
        if (sessionStateRef.current === "idle") {
          if (handLandmarkerRef.current) {
            setFeedback("Hold a thumbs up or wait for auto start");
            scheduleAutoStart();
          } else {
            setFeedback("Verified. Workout started");
            setSessionState("running");
            setCountdown(null);
          }
        }
      } else {
        setFeedback("Verifying identity...");
      }
    } else {
      faceScanFramesRef.current = 0;
      setFeedback(isSizeOK ? "Center your face for verification" : "Move closer to verify");
    }
  };

  const startLoop = () => {
    const runFaceCheckEveryFewFrames = (video: HTMLVideoElement, nowMs: number, frameIndex: number) => {
      if (frameIndex % FACE_CHECK_EVERY_N_FRAMES !== 0) return;
      runThrottledFaceCheck(video, nowMs);
    };

    const runHandCheckLowPriority = (video: HTMLVideoElement, nowMs: number, frameIndex: number) => {
      if (frameIndex % HAND_CHECK_EVERY_N_FRAMES !== 0) return;
      runThrottledHandCheck(video, nowMs);
    };

    let lastFrameTime = 0;

    const loop = (time: number) => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const poseLandmarker = poseLandmarkerRef.current;

      if (!video || !canvas || !poseLandmarker) {
        requestRef.current = requestAnimationFrame(loop);
        return;
      }

      if (time - lastFrameTime < 1000 / TARGET_FPS) {
        requestRef.current = requestAnimationFrame(loop);
        return;
      }

      lastFrameTime = time;

      if (video.readyState >= 2) {
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          requestRef.current = requestAnimationFrame(loop);
          return;
        }

        // ✅ FIX: Set canvas dimensions only if changed (memory optimization)
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = Math.min(video.videoWidth, CAMERA_WIDTH);
          canvas.height = Math.min(video.videoHeight, CAMERA_HEIGHT);
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const frameIndex = poseFrameCountRef.current;
        poseFrameCountRef.current += 1;

        if (frameIndex % 2 !== 0) {
          requestRef.current = requestAnimationFrame(loop);
          return;
        }

        const now = time;
        runFaceCheckEveryFewFrames(video, now, frameIndex);
        runHandCheckLowPriority(video, now, frameIndex);

        const poseResults = poseLandmarker.detectForVideo(video, now);
        const allPoses = poseResults?.landmarks ?? [];

        let trackedPose: PoseLandmark[] | null = null;

        if (allPoses.length > 0) {
          if (isVerifiedRef.current && lockedFaceBoxRef.current) {
            const box = lockedFaceBoxRef.current;
            trackedPose = (allPoses as PoseLandmark[][]).reduce((best: PoseLandmark[] | null, pose: PoseLandmark[]) => {
              const nose = pose[0];
              if (!nose || !isNoseInsideLockedFace(nose, box)) {
                return best;
              }

              if (!best) {
                return pose;
              }

              return getPoseConfidence(pose) >= getPoseConfidence(best) ? pose : best;
            }, null);

            if (!trackedPose) {
              faceMissStreakRef.current += 1;
              const noFaceDuration = Date.now() - lastFaceSeenAtRef.current;
              if (noFaceDuration >= FACE_UNLOCK_TIMEOUT_MS && faceMissStreakRef.current >= FACE_MISS_STREAK_LIMIT) {
                releaseFaceLock("Face tracking lost. Please verify again.", "User verification lost");
              } else {
                setFeedback(allPoses.length > 1 ? "Keep the verified user centered" : "Keep your verified face in frame");
              }
            }
          } else if (!faceLandmarkerRef.current) {
            trackedPose = (MediaOptimization.findLargestPose(allPoses) ?? allPoses[0] ?? null) as PoseLandmark[] | null;
          }

          if (DRAW_POSE_SKELETON) {
            const drawingUtils = new DrawingUtils(ctx);
            allPoses.forEach((pose: any[]) => {
              const isAuthorized = pose === trackedPose;

              drawingUtils.drawConnectors(pose, PoseLandmarker.POSE_CONNECTIONS, {
                color: isAuthorized ? "#4EF2B6" : "rgba(255, 255, 255, 0.2)",
                lineWidth: isAuthorized ? 3 : 1,
              });
              drawingUtils.drawLandmarks(pose, {
                color: isAuthorized ? "#4EF2B6" : "rgba(255, 255, 255, 0.2)",
                lineWidth: isAuthorized ? 2 : 1,
                radius: isAuthorized ? 3 : 2,
              });
            });
          }
        }

        if (trackedPose) {
          if (isVerifiedRef.current && sessionStateRef.current === "running") {
            const smoothedPose = smoothPose(trackedPose);
            const confidence = getPoseConfidence(smoothedPose);
            const stabilityScore = getPoseStabilityScore(smoothedPose);

            if (confidence < MIN_POSE_CONFIDENCE || stabilityScore <= 0.6) {
              requestRef.current = requestAnimationFrame(loop);
              return;
            }

            detectSteps(smoothedPose);

            const phaseRepDetected =
              exercise === "pushups" || exercise === "squats" || exercise === "lunges" || exercise === "highKnees"
                ? detectRepAdvanced(getRepAngle(smoothedPose, exercise))
                : false;

            if (phaseRepDetected) {
              const nextReps = repsRef.current + 1;
              repsRef.current = nextReps;
              setReps(nextReps);
              speakSmart(`Rep ${nextReps}`);
              stableExerciseFramesRef.current = 0;
            } else {
              const currentReps = fallbackRepCounterRef.current.update(smoothedPose, exercise);
              const formQuality = fallbackRepCounterRef.current.getFormQuality();
              const stats = fallbackRepCounterRef.current.getStats();

              if (currentReps > repsRef.current && Date.now() - lastRepAcceptedAtRef.current > REP_ACCEPT_INTERVAL_MS) {
                repsRef.current = currentReps;
                setReps(currentReps);
                lastRepAcceptedAtRef.current = Date.now();
                stableExerciseFramesRef.current = 0;

                if (formQuality > 0.8) {
                  speakSmart(`Rep ${currentReps}. Perfect form!`);
                } else if (formQuality > 0.6) {
                  speakSmart(`Rep ${currentReps}. Keep body straight.`);
                } else {
                  speakSmart(`Rep ${currentReps}. Improve your form.`);
                }

                if (currentReps % 5 === 0) {
                  console.log('[LiveTracking] Rep milestone:', {
                    reps: currentReps,
                    formQuality: formQuality.toFixed(2),
                    stabilityScore: stabilityScore.toFixed(2),
                    avgRepTime: stats.avgRepTime.toFixed(0),
                    rejectedReps: stats.rejectedReps,
                  });
                }
              } else {
                stableExerciseFramesRef.current = 0;
              }
            }
          }
        }
      }

      requestRef.current = requestAnimationFrame(loop);
    };

    requestRef.current = requestAnimationFrame(loop);
  };

  // ✅ FIX: Clean up media models on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      stopWorkoutTracking();
      // Release model instances to free GPU/CPU memory
      poseLandmarkerRef.current = null;
      faceLandmarkerRef.current = null;
      handLandmarkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    requestPermission();

    return () => {
      stopWorkoutTracking();
    };
  }, [exercise]);

  const verifiedColor = verified ? "#4EF2B6" : "#FF6B6B";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "black",
        color: "white",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
        <CameraLayer videoRef={videoRef} canvasRef={canvasRef} />
      </div>

      {countdown !== null && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              minWidth: 170,
              padding: "18px 24px",
              borderRadius: 24,
              textAlign: "center",
              background: "rgba(0, 0, 0, 0.72)",
              border: "1px solid rgba(78, 242, 182, 0.32)",
              boxShadow: "0 18px 60px rgba(0, 0, 0, 0.45)",
              backdropFilter: "blur(10px)",
            }}
          >
            <div style={{ fontSize: 64, lineHeight: 1, fontWeight: 900, color: "#4EF2B6" }}>
              {countdown}
            </div>
            <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: "#E5E7EB" }}>
              {countdown > 0 ? "Workout starts soon" : "Go!"}
            </div>
          </div>
        </div>
      )}

      {/* Camera permission overlay removed as requested */}

      <div
        style={{
          position: "absolute",
          top: 14,
          left: 14,
          right: 14,
          zIndex: 12,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
        }}
      >
        <button
          onClick={stopWorkoutMode}
          style={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            border: "none",
            background: "rgba(0,0,0,0.45)",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <X size={18} />
        </button>

        <div
          style={{
            flex: 1,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "rgba(0, 0, 0, 0.5)",
            border: `1px solid ${verified ? "rgba(78,242,182,0.45)" : "rgba(255,107,107,0.45)"}`,
            borderRadius: 14,
            padding: "8px 12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {verified ? <CheckCircle2 size={18} color={verifiedColor} /> : <XCircle size={18} color={verifiedColor} />}
            <span style={{ fontSize: 13, fontWeight: 700, color: verifiedColor }}>
              {verified ? "User Verified" : "User Not Verified"}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#E5E7EB" }}>
            {motion === "thumbs_up" ? <ThumbsUp size={16} color="#4EF2B6" /> : <span style={{ width: 16 }} />}
            <span style={{ fontSize: 14, fontWeight: 700 }}>{formatDuration(elapsed)}</span>
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: 64,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 12,
          background: "rgba(0,0,0,0.45)",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.16)",
          padding: "8px 12px",
          minWidth: 230,
          textAlign: "center",
        }}
      >
        <p style={{ margin: 0, fontSize: 12, color: "#D1D5DB", fontWeight: 600 }}>{statusLabel}</p>
        <p style={{ margin: "3px 0 0", fontSize: 12, color: "#A7F3D0" }}>{feedback}</p>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 14,
          left: 14,
          right: 14,
          zIndex: 12,
          background: "rgba(0,0,0,0.58)",
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.14)",
          padding: "12px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div>
          <p style={{ margin: 0, fontSize: 12, color: "#9CA3AF", fontWeight: 600 }}>Exercise</p>
          <p style={{ margin: "2px 0 0", fontSize: 16, fontWeight: 800, color: "#F9FAFB" }}>{displayExercise}</p>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#94A3B8" }}>
            Reps {reps} • Calories {workoutCalories.toFixed(1)}
          </p>
        </div>

        <button
          onClick={openHowTo}
          style={{
            minWidth: 116,
            height: 42,
            borderRadius: 12,
            border: "1px solid rgba(78,242,182,0.45)",
            background: "rgba(78,242,182,0.12)",
            color: "#4EF2B6",
            fontWeight: 700,
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <CircleHelp size={16} />
          How to do?
        </button>
      </div>

      {phase === "loading" && null}
    </div>
  );
}
