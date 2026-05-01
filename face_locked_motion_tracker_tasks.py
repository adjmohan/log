import argparse
import pickle
import sqlite3
import time
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python.core.base_options import BaseOptions
from mediapipe.tasks.python import vision as mp_vision

# requests is imported lazily where needed to avoid hard dependency at module import
from datetime import datetime

try:
    import onnxruntime as ort
except Exception:
    ort = None


DB_PATH = Path("face_auth.db")
MODEL_DIR = Path("models")
FACE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
POSE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
HAND_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
ARCFACE_MODEL_URL = "https://huggingface.co/ApacheOne/insightface/resolve/main/insightface/models/buffalo_l/w600k_r50.onnx"
DEFAULT_CAMERA_WIDTH = 640
DEFAULT_CAMERA_HEIGHT = 480
DEFAULT_TARGET_FPS = 20.0
DEFAULT_PROCESS_EVERY_N_FRAME = 2
ARCFACE_DET_SIZE = (640, 640)
ARCFACE_EMBEDDING_SIZE = 512
ARCFACE_INPUT_SIZE = (112, 112)
ARCFACE_DEFAULT_THRESHOLD = 0.6
ARCFACE_LOCK_TIMEOUT_SECONDS = 2.0

EXERCISE_CONFIG: Dict[str, Dict[str, float]] = {
    "pushups": {"met": 8.0, "down": 70.0, "up": 160.0},
    "squats": {"met": 5.0, "down": 85.0, "up": 155.0},
    "lunges": {"met": 4.8, "down": 80.0, "up": 155.0},
    "situps": {"met": 4.5, "down": 75.0, "up": 150.0},
    "crunches": {"met": 3.8, "down": 65.0, "up": 145.0},
    "burpees": {"met": 10.0, "down": 80.0, "up": 150.0},
    "mountain_climbers": {"met": 8.5, "down": 100.0, "up": 155.0},
    "high_knees": {"met": 9.0, "down": 95.0, "up": 150.0},
    "jumping_jacks": {"met": 8.0, "down": 0.0, "up": 1.0},
    "bicycle_crunches": {"met": 4.6, "down": 0.0, "up": 1.0},
}


def calculate_angle(a: List[float], b: List[float], c: List[float]) -> float:
    a_arr = np.array(a)
    b_arr = np.array(b)
    c_arr = np.array(c)
    radians = np.arctan2(c_arr[1] - b_arr[1], c_arr[0] - b_arr[0]) - np.arctan2(a_arr[1] - b_arr[1], a_arr[0] - b_arr[0])
    angle = abs(radians * 180.0 / np.pi)
    if angle > 180.0:
        angle = 360.0 - angle
    return float(angle)


def distance_2d(a: List[float], b: List[float]) -> float:
    return float(np.linalg.norm(np.array(a) - np.array(b)))


def smooth_value(new_value: float, previous_value: Optional[float], alpha: float = 0.2) -> float:
    if previous_value is None:
        return new_value
    return alpha * new_value + (1.0 - alpha) * previous_value


def get_point(landmarks: List[Any], index: int) -> List[float]:
    landmark = landmarks[index]
    return [float(landmark.x), float(landmark.y)]


def visibility_score(landmarks: List[Any], indexes: Tuple[int, int, int]) -> float:
    return float(sum(getattr(landmarks[i], "visibility", 0.0) for i in indexes))


def choose_side(landmarks: List[Any], left_indexes: Tuple[int, int, int], right_indexes: Tuple[int, int, int]) -> str:
    return "left" if visibility_score(landmarks, left_indexes) >= visibility_score(landmarks, right_indexes) else "right"


class MotionCounter:
    def __init__(self, exercise: str, weight_kg: float = 70.0):
        if exercise not in EXERCISE_CONFIG:
            raise ValueError(f"Unsupported exercise: {exercise}")
        self.exercise = exercise
        self.weight_kg = weight_kg
        self.met = EXERCISE_CONFIG[exercise]["met"]
        self.down_threshold = EXERCISE_CONFIG[exercise]["down"]
        self.up_threshold = EXERCISE_CONFIG[exercise]["up"]
        self.stage: str = "none"
        self.count: int = 0
        self.rejected_reps: int = 0
        self.form_quality: float = 1.0
        self.smoothed_metric: Optional[float] = None
        self.rep_start_time: Optional[float] = None
        self.last_rep_time: Optional[float] = None
        self.rep_durations: List[float] = []
        self.start_time: float = time.time()

    def update(self, landmarks: List[Any], current_time: float) -> float:
        if self.exercise == "pushups":
            return self._detect_pushups(landmarks, current_time)
        if self.exercise == "squats":
            return self._detect_squats(landmarks, current_time)
        if self.exercise == "lunges":
            return self._detect_lunges(landmarks, current_time)
        if self.exercise == "situps":
            return self._detect_situps(landmarks, current_time)
        if self.exercise == "crunches":
            return self._detect_crunches(landmarks, current_time)
        if self.exercise == "burpees":
            return self._detect_burpees(landmarks, current_time)
        if self.exercise == "mountain_climbers":
            return self._detect_mountain_climbers(landmarks, current_time)
        if self.exercise == "high_knees":
            return self._detect_high_knees(landmarks, current_time)
        if self.exercise == "jumping_jacks":
            return self._detect_jumping_jacks(landmarks, current_time)
        if self.exercise == "bicycle_crunches":
            return self._detect_bicycle_crunches(landmarks, current_time)
        return 0.0

    def _count_valid_rep(self, current_time: float, form_score: float) -> bool:
        rep_duration = None if self.last_rep_time is None else current_time - self.last_rep_time
        if rep_duration is None:
            self.last_rep_time = current_time
            self.count += 1
            self.rep_durations.append(0.0)
            return True

        rep_duration_ms = rep_duration * 1000.0
        tempo_ok = rep_duration_ms >= 800.0
        form_ok = form_score >= 0.7

        if tempo_ok and form_ok:
            self.count += 1
            self.rep_durations.append(rep_duration_ms)
            self.last_rep_time = current_time
            return True

        self.rejected_reps += 1
        return False

    def _detect_pushups(self, landmarks: List[Any], current_time: float) -> float:
        side = choose_side(landmarks, (11, 13, 15), (12, 14, 16))
        if side == "left":
            shoulder = get_point(landmarks, 11)
            elbow = get_point(landmarks, 13)
            wrist = get_point(landmarks, 15)
            hip = get_point(landmarks, 23)
            ankle = get_point(landmarks, 27)
        else:
            shoulder = get_point(landmarks, 12)
            elbow = get_point(landmarks, 14)
            wrist = get_point(landmarks, 16)
            hip = get_point(landmarks, 24)
            ankle = get_point(landmarks, 28)

        raw_angle = calculate_angle(shoulder, elbow, wrist)
        self.smoothed_metric = smooth_value(raw_angle, self.smoothed_metric, 0.2)
        angle = self.smoothed_metric

        body_angle = calculate_angle(shoulder, hip, ankle)
        form_score = max(0.0, 1.0 - abs(body_angle - 180.0) / 60.0)
        self.form_quality = form_score

        if angle < self.down_threshold:
            if self.stage != "down":
                self.rep_start_time = current_time
            self.stage = "down"

        if angle > self.up_threshold and self.stage == "down":
            self.stage = "up"
            self._count_valid_rep(current_time, form_score)

        return angle

    def _detect_squats(self, landmarks: List[Any], current_time: float) -> float:
        side = choose_side(landmarks, (23, 25, 27), (24, 26, 28))
        if side == "left":
            hip = get_point(landmarks, 23)
            knee = get_point(landmarks, 25)
            ankle = get_point(landmarks, 27)
            shoulder = get_point(landmarks, 11)
        else:
            hip = get_point(landmarks, 24)
            knee = get_point(landmarks, 26)
            ankle = get_point(landmarks, 28)
            shoulder = get_point(landmarks, 12)

        raw_angle = calculate_angle(hip, knee, ankle)
        self.smoothed_metric = smooth_value(raw_angle, self.smoothed_metric, 0.2)
        angle = self.smoothed_metric

        torso_angle = calculate_angle(shoulder, hip, ankle)
        form_score = max(0.0, 1.0 - abs(torso_angle - 180.0) / 70.0)
        self.form_quality = form_score

        if angle < self.down_threshold:
            if self.stage != "down":
                self.rep_start_time = current_time
            self.stage = "down"

        if angle > self.up_threshold and self.stage == "down":
            self.stage = "up"
            self._count_valid_rep(current_time, form_score)

        return angle

    def _detect_lunges(self, landmarks: List[Any], current_time: float) -> float:
        return self._detect_squats(landmarks, current_time)

    def _detect_situps(self, landmarks: List[Any], current_time: float) -> float:
        shoulder = get_point(landmarks, 11)
        hip = get_point(landmarks, 23)
        knee = get_point(landmarks, 25)
        raw_angle = calculate_angle(shoulder, hip, knee)
        self.smoothed_metric = smooth_value(raw_angle, self.smoothed_metric, 0.2)
        angle = self.smoothed_metric
        self.form_quality = 1.0
        if angle < self.down_threshold:
            self.stage = "down"
        if angle > self.up_threshold and self.stage == "down":
            self.stage = "up"
            self._count_valid_rep(current_time, 1.0)
        return angle

    def _detect_crunches(self, landmarks: List[Any], current_time: float) -> float:
        return self._detect_situps(landmarks, current_time)

    def _detect_burpees(self, landmarks: List[Any], current_time: float) -> float:
        return self._detect_squats(landmarks, current_time)

    def _detect_mountain_climbers(self, landmarks: List[Any], current_time: float) -> float:
        side = choose_side(landmarks, (23, 25, 27), (24, 26, 28))
        if side == "left":
            hip = get_point(landmarks, 23)
            knee = get_point(landmarks, 25)
            ankle = get_point(landmarks, 27)
        else:
            hip = get_point(landmarks, 24)
            knee = get_point(landmarks, 26)
            ankle = get_point(landmarks, 28)
        raw_angle = calculate_angle(hip, knee, ankle)
        self.smoothed_metric = smooth_value(raw_angle, self.smoothed_metric, 0.2)
        angle = self.smoothed_metric
        self.form_quality = 1.0
        if angle < self.down_threshold:
            self.stage = "down"
        if angle > self.up_threshold and self.stage == "down":
            self.stage = "up"
            self._count_valid_rep(current_time, 1.0)
        return angle

    def _detect_high_knees(self, landmarks: List[Any], current_time: float) -> float:
        return self._detect_mountain_climbers(landmarks, current_time)

    def _detect_jumping_jacks(self, landmarks: List[Any], current_time: float) -> float:
        left_wrist = get_point(landmarks, 15)
        right_wrist = get_point(landmarks, 16)
        left_ankle = get_point(landmarks, 27)
        right_ankle = get_point(landmarks, 28)
        left_shoulder = get_point(landmarks, 11)
        right_shoulder = get_point(landmarks, 12)

        wrist_distance = distance_2d(left_wrist, right_wrist) / max(distance_2d(left_shoulder, right_shoulder), 1e-6)
        ankle_distance = distance_2d(left_ankle, right_ankle) / max(distance_2d(left_shoulder, right_shoulder), 1e-6)
        score = (wrist_distance + ankle_distance) / 2.0
        self.smoothed_metric = smooth_value(score, self.smoothed_metric, 0.2)
        metric = self.smoothed_metric

        if metric < 0.9:
            self.stage = "closed"
        if metric > 1.3 and self.stage == "closed":
            self.stage = "open"
            self._count_valid_rep(current_time, 1.0)

        return metric

    def _detect_bicycle_crunches(self, landmarks: List[Any], current_time: float) -> float:
        left_elbow = get_point(landmarks, 13)
        right_elbow = get_point(landmarks, 14)
        left_knee = get_point(landmarks, 25)
        right_knee = get_point(landmarks, 26)

        cross_1 = distance_2d(left_elbow, right_knee)
        cross_2 = distance_2d(right_elbow, left_knee)
        score = min(cross_1, cross_2)
        self.smoothed_metric = smooth_value(score, self.smoothed_metric, 0.2)
        metric = self.smoothed_metric

        if metric > 0.28:
            self.stage = "open"
        if metric < 0.20 and self.stage == "open":
            self.stage = "closed"
            self._count_valid_rep(current_time, 1.0)

        return metric

    def get_calories(self, elapsed_seconds: float) -> float:
        hours = elapsed_seconds / 3600.0
        return self.met * self.weight_kg * hours

    def get_stats(self):
        avg_rep_time = float(np.mean(self.rep_durations)) if self.rep_durations else 0.0
        fastest_rep = float(min(self.rep_durations)) if self.rep_durations else 0.0
        slowest_rep = float(max(self.rep_durations)) if self.rep_durations else 0.0
        total_active_time = float(np.sum(self.rep_durations)) if self.rep_durations else 0.0
        return {
            "reps": self.count,
            "rejectedReps": self.rejected_reps,
            "formQuality": self.form_quality,
            "avgRepTime": avg_rep_time,
            "fastestRep": fastest_rep,
            "slowestRep": slowest_rep,
            "totalTime": total_active_time,
        }
def init_db() -> None:
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS face_profiles (
                user_id TEXT PRIMARY KEY,
                encoding BLOB NOT NULL,
                created_at INTEGER NOT NULL
            )
            """
        )
        conn.commit()


def save_face_encoding(user_id: str, encoding: np.ndarray) -> None:
    init_db()
    payload = pickle.dumps(encoding.astype(np.float32))
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO face_profiles (user_id, encoding, created_at)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                encoding = excluded.encoding,
                created_at = excluded.created_at
            """,
            (user_id, payload, int(time.time())),
        )
        conn.commit()


def load_face_encoding(user_id: str) -> Optional[np.ndarray]:
    init_db()
    with sqlite3.connect(DB_PATH) as conn:
        row = conn.execute("SELECT encoding FROM face_profiles WHERE user_id = ?", (user_id,)).fetchone()
    if not row:
        return None
    return pickle.loads(row[0])


class OnnxArcFace:
    def __init__(self, model_path: Path, force_cpu: bool = False):
        if ort is None:
            raise RuntimeError("onnxruntime is required. Install it with: pip install onnxruntime")

        providers = ["CPUExecutionProvider"]
        available = set(ort.get_available_providers())
        if not force_cpu and "CUDAExecutionProvider" in available:
            providers.insert(0, "CUDAExecutionProvider")

        self.session = ort.InferenceSession(str(model_path), providers=providers)
        self.input_name = self.session.get_inputs()[0].name

    def embed(self, frame_bgr: np.ndarray, face_landmarks: Any) -> np.ndarray:
        crop = crop_face_from_landmarks(frame_bgr, face_landmarks)
        if crop is None:
            return np.empty((0,), dtype=np.float32)

        face = cv2.resize(crop, ARCFACE_INPUT_SIZE)
        face = cv2.cvtColor(face, cv2.COLOR_BGR2RGB).astype(np.float32)
        face = (face - 127.5) / 127.5
        face = np.transpose(face, (2, 0, 1))[None, :, :, :]
        embedding = self.session.run(None, {self.input_name: face})[0][0]
        return normalize_embedding(embedding)


def ensure_arcface_model() -> Path:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    model_path = MODEL_DIR / "w600k_r50.onnx"
    if model_path.exists() and model_path.stat().st_size > 100_000_000:
        return model_path

    print("Downloading ArcFace ONNX model. This is about 174 MB and happens once...")
    urllib.request.urlretrieve(ARCFACE_MODEL_URL, model_path)
    return model_path


def ensure_model_file(filename: str, url: str, min_size_bytes: int = 100_000) -> Path:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    model_path = MODEL_DIR / filename
    if model_path.exists() and model_path.stat().st_size >= min_size_bytes:
        return model_path

    print(f"Downloading {filename}. This happens once...")
    urllib.request.urlretrieve(url, model_path)
    return model_path


def build_arcface_app(force_cpu: bool = False) -> OnnxArcFace:
    return OnnxArcFace(ensure_arcface_model(), force_cpu=force_cpu)


def crop_face_from_landmarks(frame_bgr: np.ndarray, face_landmarks: Any) -> Optional[np.ndarray]:
    if not face_landmarks:
        return None

    height, width = frame_bgr.shape[:2]
    xs = np.array([float(lm.x) for lm in face_landmarks], dtype=np.float32) * width
    ys = np.array([float(lm.y) for lm in face_landmarks], dtype=np.float32) * height
    if xs.size == 0 or ys.size == 0:
        return None

    min_x, max_x = float(xs.min()), float(xs.max())
    min_y, max_y = float(ys.min()), float(ys.max())
    face_w = max_x - min_x
    face_h = max_y - min_y
    if face_w < 20 or face_h < 20:
        return None

    pad_x = face_w * 0.35
    pad_y = face_h * 0.45
    x1 = max(0, int(min_x - pad_x))
    y1 = max(0, int(min_y - pad_y))
    x2 = min(width, int(max_x + pad_x))
    y2 = min(height, int(max_y + pad_y))
    if x2 <= x1 or y2 <= y1:
        return None
    return frame_bgr[y1:y2, x1:x2]


def normalize_embedding(embedding: np.ndarray) -> np.ndarray:
    embedding = np.asarray(embedding, dtype=np.float32)
    value_norm = float(np.linalg.norm(embedding))
    if value_norm <= 0 or not np.isfinite(value_norm):
        return np.empty((0,), dtype=np.float32)
    return embedding / value_norm


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    if a.size == 0 or b.size == 0 or a.shape != b.shape:
        return -1.0
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    if denom <= 0 or not np.isfinite(denom):
        return -1.0
    return float(np.dot(a, b) / denom)


def detect_single_arcface_embedding(app: OnnxArcFace, frame: np.ndarray, face_landmarks: List[Any]) -> Tuple[Optional[np.ndarray], int]:
    if len(face_landmarks) != 1:
        return None, len(face_landmarks)
    return app.embed(frame, face_landmarks[0]), 1


def face_landmarks_to_encoding(face_landmarks: Any) -> np.ndarray:
    key_indices = [1, 33, 61, 199, 263, 291, 10, 13, 14, 17, 152, 234, 454, 127, 356, 141, 372, 72, 302]
    points = []
    for index in key_indices:
        if index >= len(face_landmarks):
            continue
        lm = face_landmarks[index]
        points.append([float(lm.x), float(lm.y), float(getattr(lm, "z", 0.0))])

    if len(points) < 8:
        return np.empty((0,), dtype=np.float32)

    points_array = np.array(points, dtype=np.float32)
    center = points_array.mean(axis=0, keepdims=True)
    centered = points_array - center
    left_eye = points_array[1] if len(points_array) > 1 else points_array[0]
    right_eye = points_array[4] if len(points_array) > 4 else points_array[-1]
    eye_distance = np.linalg.norm(left_eye - right_eye)
    scale = eye_distance if eye_distance > 1e-6 else 1.0
    normalized = centered / scale

    distances = []
    for i in range(len(normalized)):
        for j in range(i + 1, len(normalized)):
            d = float(np.linalg.norm(normalized[i] - normalized[j]))
            if 0.001 < d < 3.0:
                distances.append(d)

    if not distances:
        return np.empty((0,), dtype=np.float32)

    vector = np.array(distances, dtype=np.float32)
    norm = float(np.linalg.norm(vector))
    if norm <= 0 or not np.isfinite(norm):
        return np.empty((0,), dtype=np.float32)

    return vector / norm


def compare_encodings(known: np.ndarray, candidate: np.ndarray, tolerance: float = 0.35) -> bool:
    if known.size == 0 or candidate.size == 0 or known.shape != candidate.shape:
        return False
    distance = float(np.linalg.norm(known - candidate))
    return distance <= tolerance


def build_face_landmarker(running_mode):
    model_path = ensure_model_file("face_landmarker.task", FACE_MODEL_URL)
    return mp_vision.FaceLandmarker.create_from_options(
        mp_vision.FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(model_path)),
            running_mode=running_mode,
            num_faces=3,
            output_face_blendshapes=False,
        )
    )


def build_pose_landmarker(running_mode):
    model_path = ensure_model_file("pose_landmarker_lite.task", POSE_MODEL_URL)
    return mp_vision.PoseLandmarker.create_from_options(
        mp_vision.PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(model_path)),
            running_mode=running_mode,
            num_poses=1,
        )
    )


def build_hand_landmarker(running_mode):
    model_path = ensure_model_file("hand_landmarker.task", HAND_MODEL_URL)
    return mp_vision.HandLandmarker.create_from_options(
        mp_vision.HandLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(model_path)),
            running_mode=running_mode,
            num_hands=1,
        )
    )


def image_from_bgr(frame_bgr: np.ndarray) -> mp.Image:
    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    return mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)


def configure_camera(cap: cv2.VideoCapture, width: int, height: int, target_fps: float) -> None:
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
    cap.set(cv2.CAP_PROP_FPS, int(target_fps))


def register_user(
    user_id: str,
    image_path: Optional[str],
    camera_index: int,
    samples: int = 10,
    force_cpu: bool = False,
    width: int = DEFAULT_CAMERA_WIDTH,
    height: int = DEFAULT_CAMERA_HEIGHT,
    target_fps: float = DEFAULT_TARGET_FPS,
) -> None:
    app = build_arcface_app(force_cpu=force_cpu)

    if image_path:
        with build_face_landmarker(mp_vision.RunningMode.IMAGE) as face_landmarker:
            frame = cv2.imread(image_path)
            if frame is None:
                raise FileNotFoundError(f"Could not read image: {image_path}")
            frame = cv2.resize(frame, (width, height))
            face_result = face_landmarker.detect(image_from_bgr(frame))
            faces = face_result.face_landmarks or []
            embedding, face_count = detect_single_arcface_embedding(app, frame, faces)
            if embedding is None:
                raise RuntimeError(f"Expected exactly one face in image, found {face_count}")
            save_face_encoding(user_id, embedding)
            print(f"Saved ArcFace profile for {user_id} from {image_path}")
            return

    cap = cv2.VideoCapture(camera_index)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open camera {camera_index}")
    configure_camera(cap, width, height, target_fps)

    embeddings: List[np.ndarray] = []
    print(f"Look at the camera. Capturing {samples} ArcFace samples...")

    try:
        with build_face_landmarker(mp_vision.RunningMode.VIDEO) as face_landmarker:
            while len(embeddings) < samples:
                success, frame = cap.read()
                if not success:
                    raise RuntimeError("Failed to capture frame for registration")
                frame = cv2.resize(frame, (width, height))
                overlay = frame.copy()
                timestamp_ms = int(time.time() * 1000)
                face_result = face_landmarker.detect_for_video(image_from_bgr(frame), timestamp_ms)
                faces = face_result.face_landmarks or []
                embedding, face_count = detect_single_arcface_embedding(app, frame, faces)

                if embedding is not None:
                    embeddings.append(embedding)
                    cv2.putText(
                        overlay,
                        f"Captured: {len(embeddings)}/{samples}",
                        (20, 40),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        1,
                        (0, 255, 0),
                        2,
                    )
                else:
                    message = "Center one face to register" if face_count == 0 else "Only one face allowed"
                    cv2.putText(overlay, message, (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 255), 2)

                cv2.imshow("Register ArcFace", overlay)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break

        if not embeddings:
            raise RuntimeError("No ArcFace samples captured")

        avg_embedding = normalize_embedding(np.mean(embeddings, axis=0))
        if avg_embedding.size == 0:
            raise RuntimeError("Could not build ArcFace profile")
        save_face_encoding(user_id, avg_embedding)
        print(f"Saved ArcFace profile for {user_id} from {len(embeddings)} samples")
    finally:
        cap.release()
        cv2.destroyAllWindows()


def main() -> None:
    parser = argparse.ArgumentParser(description="Face-locked motion tracker using MediaPipe tasks + SQLite")
    parser.add_argument("--register", metavar="USER_ID", help="Register or update a user face profile")
    parser.add_argument("--image", help="Optional image file to register from")
    parser.add_argument("--user-id", help="User id to authenticate during live tracking")
    parser.add_argument("--camera", type=int, default=0)
    parser.add_argument("--exercise", default="pushups")
    parser.add_argument("--weight", type=float, default=70.0)
    parser.add_argument("--threshold", type=float, default=ARCFACE_DEFAULT_THRESHOLD, help="ArcFace cosine threshold: 0.5 loose, 0.6 balanced, 0.7 strict")
    parser.add_argument("--lock-timeout", type=float, default=ARCFACE_LOCK_TIMEOUT_SECONDS, help="Seconds before locking after the authorized face disappears")
    parser.add_argument("--samples", type=int, default=10, help="ArcFace registration samples to average")
    parser.add_argument("--arcface-cpu", action="store_true", help="Force ArcFace to use CPU instead of GPU")
    parser.add_argument("--width", type=int, default=DEFAULT_CAMERA_WIDTH, help="Camera/process width. Use 480 if 640 still lags.")
    parser.add_argument("--height", type=int, default=DEFAULT_CAMERA_HEIGHT, help="Camera/process height. Use 360 if 480 still lags.")
    parser.add_argument("--target-fps", type=float, default=DEFAULT_TARGET_FPS, help="Maximum processing FPS. 20 means one processed frame every 0.05s.")
    parser.add_argument("--process-every", type=int, default=DEFAULT_PROCESS_EVERY_N_FRAME, help="Process every Nth camera frame. 2 cuts work roughly in half.")
    args = parser.parse_args()
    process_interval_seconds = 1.0 / max(args.target_fps, 1.0)
    process_every = max(args.process_every, 1)

    if args.register:
        register_user(
            args.register,
            args.image,
            args.camera,
            args.samples,
            args.arcface_cpu,
            args.width,
            args.height,
            args.target_fps,
        )
        return

    if not args.user_id:
        raise SystemExit("Provide --user-id for live tracking, or --register to enroll a user")

    known_encoding = load_face_encoding(args.user_id)
    if known_encoding is None:
        raise SystemExit(f"No saved face encoding found for user {args.user_id}")
    known_encoding = normalize_embedding(known_encoding)
    if known_encoding.size == 0:
        raise SystemExit(f"Saved face encoding for user {args.user_id} is invalid. Re-register the user.")
    if known_encoding.size != ARCFACE_EMBEDDING_SIZE:
        raise SystemExit(
            f"Saved face profile for user {args.user_id} is not an ArcFace profile. "
            "Re-register with --register before running ArcFace verification."
        )

    tracker = MotionCounter(args.exercise, args.weight)
    arcface_app = build_arcface_app(force_cpu=args.arcface_cpu)
    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open camera {args.camera}")
    configure_camera(cap, args.width, args.height, args.target_fps)

    authorized = False
    stage = None
    counter = 0
    workout_start = time.time()

    # initialize local controls for thumbs-up start/stop
    thumbs_counter = 0
    workout_running = False
    workout_start_time_local = None
    # hold-time logic: start when thumb-up detected with confidence>0.8 for >0.7s
    thumb_hold_start: Optional[float] = None
    thumb_action_triggered: bool = False
    frame_count = 0
    prev_process_time = 0.0
    last_seen_time = 0.0
    match_score = -1.0
    face_count = 0

    with build_face_landmarker(mp_vision.RunningMode.VIDEO) as face_landmarker, build_pose_landmarker(mp_vision.RunningMode.VIDEO) as pose_landmarker, build_hand_landmarker(mp_vision.RunningMode.VIDEO) as hand_landmarker:
        while cap.isOpened():
            success, frame = cap.read()
            if not success:
                break
            frame = cv2.resize(frame, (args.width, args.height))

            frame_count += 1
            now = time.time()
            if frame_count % process_every != 0 or now - prev_process_time < process_interval_seconds:
                cv2.imshow("Face Locked Motion Tracker", frame)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break
                continue
            prev_process_time = now

            mp_image = image_from_bgr(frame)
            timestamp_ms = int(now * 1000)
            face_result = face_landmarker.detect_for_video(mp_image, timestamp_ms)
            faces = face_result.face_landmarks or []
            current_embedding, face_count = detect_single_arcface_embedding(arcface_app, frame, faces)
            match_score = cosine_similarity(known_encoding, current_embedding) if current_embedding is not None else -1.0

            if current_embedding is not None and match_score >= args.threshold:
                authorized = True
                last_seen_time = now
            elif face_count > 1:
                authorized = False
                workout_running = False
                thumb_hold_start = None
                thumb_action_triggered = False
            elif now - last_seen_time > args.lock_timeout:
                authorized = False
                workout_running = False

            # Hand/thumbs-up detection (toggle start/stop)
            hand_landmarks = None
            if authorized:
                hand_result = hand_landmarker.detect_for_video(mp_image, timestamp_ms)
                hand_landmarks = (hand_result.hand_landmarks or [None])[0]

            thumbs_up_detected = False
            if hand_landmarks is not None:
                try:
                    # indices: 0 wrist, 4 thumb_tip, 5 index_mcp, 8 index_tip, 12 middle_tip, 16 ring_tip, 20 pinky_tip
                    thumb_tip = hand_landmarks[4]
                    index_mcp = hand_landmarks[5]
                    index_tip = hand_landmarks[8]
                    middle_tip = hand_landmarks[12]
                    ring_tip = hand_landmarks[16]
                    pinky_tip = hand_landmarks[20]
                    # Thumb up if thumb tip higher (smaller y) than index_mcp and other finger tips are lower (folded)
                    if thumb_tip.y < index_mcp.y and index_tip.y > index_mcp.y and middle_tip.y > index_mcp.y and ring_tip.y > index_mcp.y and pinky_tip.y > index_mcp.y:
                        thumbs_up_detected = True
                except Exception:
                    thumbs_up_detected = False

            # compute a simple confidence for thumbs-up based on relative positions
            thumb_confidence = 0.0
            if hand_landmarks is not None:
                try:
                    wrist = hand_landmarks[0]
                    thumb_tip = hand_landmarks[4]
                    index_mcp = hand_landmarks[5]
                    index_tip = hand_landmarks[8]
                    middle_tip = hand_landmarks[12]
                    ring_tip = hand_landmarks[16]
                    pinky_tip = hand_landmarks[20]
                    wrist_to_index = max(abs(index_mcp.y - wrist.y), 1e-6)
                    thumb_upness = max(0.0, (index_mcp.y - thumb_tip.y) / wrist_to_index)
                    folded = 0.0
                    for tip in (index_tip, middle_tip, ring_tip, pinky_tip):
                        folded += float(max(0.0, (tip.y - index_mcp.y) / wrist_to_index))
                    fold_score = min(1.0, folded / 4.0)
                    thumb_confidence = float(min(1.0, 0.6 * thumb_upness + 0.4 * fold_score))
                except Exception:
                    thumb_confidence = 0.0

            # hold-time logic: require confidence > 0.8 for > 0.7s to toggle
            time_held = 0.0
            now_ts = time.time()
            if thumbs_up_detected and thumb_confidence > 0.8:
                if thumb_hold_start is None:
                    thumb_hold_start = now_ts
                time_held = now_ts - thumb_hold_start
            else:
                thumb_hold_start = None
                time_held = 0.0

            if time_held > 0.7 and not thumb_action_triggered:
                thumb_action_triggered = True
                workout_running = not workout_running
                if workout_running:
                    workout_start_time_local = time.time()
                    print("Workout started (thumbs-up hold)")
                else:
                    workout_end = time.time()
                    duration = max(0.0, workout_end - (workout_start_time_local or workout_start))
                    calories_session = tracker.get_calories(duration)
                    stats = tracker.get_stats()
                    payload = {
                        "userId": args.user_id,
                        "exercise": tracker.exercise,
                        "reps": int(stats.get("reps", 0)),
                        "durationSeconds": int(duration),
                        "calories": float(calories_session),
                        "timestamp": int(workout_end * 1000),
                    }
                    print("Workout stopped (thumbs-up hold). Saving to server:", payload)
                    def save_workout(payload, url="http://localhost:3000/save-workout"):
                        import requests

                        try:
                            resp = requests.post(url, json=payload, timeout=5.0)
                            print("Server response:", resp.status_code, resp.text)
                            return True
                        except Exception as e:
                            print("Failed to save workout:", e)
                            return False

                    save_workout(payload)

            # reset trigger when user releases thumb
            if not thumbs_up_detected or thumb_confidence <= 0.8:
                thumb_action_triggered = False

            if authorized:
                pose_result = pose_landmarker.detect_for_video(mp_image, timestamp_ms)
                pose_landmarks = (pose_result.pose_landmarks or [None])[0]

                if pose_landmarks is not None and workout_running:
                    tracker.update(pose_landmarks, time.time())
                    stats = tracker.get_stats()
                    counter = stats["reps"]

                    if tracker.exercise == "pushups":
                        shoulder = get_point(pose_landmarks, mp_vision.PoseLandmark.LEFT_SHOULDER.value)
                        elbow = get_point(pose_landmarks, mp_vision.PoseLandmark.LEFT_ELBOW.value)
                        wrist = get_point(pose_landmarks, mp_vision.PoseLandmark.LEFT_WRIST.value)
                        angle = calculate_angle(shoulder, elbow, wrist)
                        if angle > 160:
                            stage = "up"
                        if angle < 70 and stage == "up":
                            stage = "down"

            calories = tracker.get_calories(time.time() - workout_start)
            if face_count > 1:
                label = "MULTI-FACE LOCKED"
            elif authorized:
                label = f"AUTHORIZED {match_score:.2f}"
            elif match_score >= 0:
                label = f"NOT MATCH {match_score:.2f}"
            else:
                label = "LOCKED"
            color = (0, 255, 0) if authorized else (0, 0, 255)

            cv2.putText(frame, label, (10, 40), cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2)
            cv2.putText(frame, f"Reps: {counter}", (10, 80), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
            cv2.putText(frame, f"Calories: {calories:.2f}", (10, 120), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)
            cv2.putText(frame, "MOTION ENABLED" if authorized else "MOTION LOCKED", (10, 160), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)

            cv2.imshow("Face Locked Motion Tracker", frame)
            if cv2.waitKey(10) & 0xFF == ord("q"):
                break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
