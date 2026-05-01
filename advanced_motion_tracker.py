import argparse
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import cv2
import mediapipe as mp
import numpy as np


mp_drawing = mp.solutions.drawing_utils
mp_pose = mp.solutions.pose

CAMERA_WIDTH = 640
CAMERA_HEIGHT = 480
TARGET_PROCESS_INTERVAL_SECONDS = 0.05
PROCESS_EVERY_N_FRAME = 2
DRAW_LANDMARKS = False


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
    a = np.array(a)
    b = np.array(b)
    c = np.array(c)
    radians = np.arctan2(c[1] - b[1], c[0] - b[0]) - np.arctan2(a[1] - b[1], a[0] - b[0])
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


@dataclass
class RepStats:
    reps: int = 0
    rejected_reps: int = 0
    form_quality: float = 1.0
    avg_rep_time: float = 0.0
    fastest_rep: float = 0.0
    slowest_rep: float = 0.0
    total_active_time: float = 0.0


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

    def update(self, landmarks: List[Any], current_time: float) -> Dict[str, Any]:
        result = self._detect_motion(landmarks, current_time)
        return result

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

    def _detect_motion(self, landmarks: List[Any], current_time: float) -> Dict[str, Any]:
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
        return {"angle": None, "feedback": []}

    def _detect_pushups(self, landmarks: List[Any], current_time: float) -> Dict[str, Any]:
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

        feedback: List[str] = []
        if body_angle < 160.0:
            feedback.append("Keep body straight")

        if angle < self.down_threshold:
            if self.stage != "down":
                self.rep_start_time = current_time
            self.stage = "down"

        if angle > self.up_threshold and self.stage == "down":
            self.stage = "up"
            self._count_valid_rep(current_time, form_score)

        return {"angle": angle, "form_score": form_score, "feedback": feedback}

    def _detect_squats(self, landmarks: List[Any], current_time: float) -> Dict[str, Any]:
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

        feedback: List[str] = []
        if torso_angle < 160.0:
            feedback.append("Keep chest up")

        if angle < self.down_threshold:
            self.stage = "down"

        if angle > self.up_threshold and self.stage == "down":
            self.stage = "up"
            self._count_valid_rep(current_time, form_score)

        return {"angle": angle, "form_score": form_score, "feedback": feedback}

    def _detect_lunges(self, landmarks: List[Any], current_time: float) -> Dict[str, Any]:
        return self._detect_squats(landmarks, current_time)

    def _detect_situps(self, landmarks: List[Any], current_time: float) -> Dict[str, Any]:
        shoulder = get_point(landmarks, 11)
        hip = get_point(landmarks, 23)
        knee = get_point(landmarks, 25)
        raw_angle = calculate_angle(shoulder, hip, knee)
        self.smoothed_metric = smooth_value(raw_angle, self.smoothed_metric, 0.2)
        angle = self.smoothed_metric

        form_score = 1.0
        self.form_quality = form_score

        if angle < self.down_threshold:
            self.stage = "down"
        if angle > self.up_threshold and self.stage == "down":
            self.stage = "up"
            self._count_valid_rep(current_time, form_score)

        return {"angle": angle, "form_score": form_score, "feedback": []}

    def _detect_crunches(self, landmarks: List[Any], current_time: float) -> Dict[str, Any]:
        return self._detect_situps(landmarks, current_time)

    def _detect_burpees(self, landmarks: List[Any], current_time: float) -> Dict[str, Any]:
        return self._detect_squats(landmarks, current_time)

    def _detect_mountain_climbers(self, landmarks: List[Any], current_time: float) -> Dict[str, Any]:
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

        form_score = 1.0
        self.form_quality = form_score

        if angle < self.down_threshold:
            self.stage = "down"
        if angle > self.up_threshold and self.stage == "down":
            self.stage = "up"
            self._count_valid_rep(current_time, form_score)

        return {"angle": angle, "form_score": form_score, "feedback": []}

    def _detect_high_knees(self, landmarks: List[Any], current_time: float) -> Dict[str, Any]:
        return self._detect_mountain_climbers(landmarks, current_time)

    def _detect_jumping_jacks(self, landmarks: List[Any], current_time: float) -> Dict[str, Any]:
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

        return {"angle": metric, "form_score": 1.0, "feedback": []}

    def _detect_bicycle_crunches(self, landmarks: List[Any], current_time: float) -> Dict[str, Any]:
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

        return {"angle": metric, "form_score": 1.0, "feedback": []}

    def get_calories(self, elapsed_seconds: float) -> float:
        hours = elapsed_seconds / 3600.0
        return self.met * self.weight_kg * hours

    def get_stats(self) -> RepStats:
        avg_rep_time = float(np.mean(self.rep_durations)) if self.rep_durations else 0.0
        fastest_rep = float(min(self.rep_durations)) if self.rep_durations else 0.0
        slowest_rep = float(max(self.rep_durations)) if self.rep_durations else 0.0
        total_active_time = float(np.sum(self.rep_durations)) if self.rep_durations else 0.0
        return RepStats(
            reps=self.count,
            rejected_reps=self.rejected_reps,
            form_quality=self.form_quality,
            avg_rep_time=avg_rep_time,
            fastest_rep=fastest_rep,
            slowest_rep=slowest_rep,
            total_active_time=total_active_time,
        )


def draw_overlay(image: np.ndarray, exercise: str, reps: int, rejected: int, calories: float, angle: Optional[float], form_quality: float, avg_rep_time: float) -> None:
    color = (0, 255, 0) if form_quality > 0.8 else (0, 165, 255) if form_quality > 0.6 else (0, 0, 255)
    cv2.rectangle(image, (10, 10), (430, 230), (20, 20, 20), -1)
    cv2.putText(image, f"Exercise: {exercise}", (20, 45), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2)
    cv2.putText(image, f"Reps: {reps} | Rejected: {rejected}", (20, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
    cv2.putText(image, f"Calories: {calories:.2f} kcal", (20, 115), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
    cv2.putText(image, f"Angle: {0 if angle is None else int(angle)}", (20, 150), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
    cv2.putText(image, f"Form: {form_quality:.2f}", (20, 185), cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)
    cv2.putText(image, f"Avg rep: {avg_rep_time:.0f} ms", (20, 220), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (200, 200, 200), 2)


def configure_camera(cap: cv2.VideoCapture, width: int = CAMERA_WIDTH, height: int = CAMERA_HEIGHT) -> None:
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
    cap.set(cv2.CAP_PROP_FPS, int(1 / TARGET_PROCESS_INTERVAL_SECONDS))


def main() -> None:
    parser = argparse.ArgumentParser(description="Advanced MediaPipe motion tracker for reps and calories")
    parser.add_argument("--exercise", choices=sorted(EXERCISE_CONFIG.keys()), default="pushups")
    parser.add_argument("--weight", type=float, default=70.0)
    parser.add_argument("--camera", type=int, default=0)
    args = parser.parse_args()

    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open camera {args.camera}")
    configure_camera(cap)

    tracker = MotionCounter(args.exercise, args.weight)
    start_time = time.time()
    frame_count = 0
    prev_process_time = 0.0

    with mp_pose.Pose(min_detection_confidence=0.5, min_tracking_confidence=0.5, model_complexity=0) as pose:
        while cap.isOpened():
            success, frame = cap.read()
            if not success:
                break
            frame = cv2.resize(frame, (CAMERA_WIDTH, CAMERA_HEIGHT))

            frame_count += 1
            now = time.time()
            if frame_count % PROCESS_EVERY_N_FRAME != 0 or now - prev_process_time < TARGET_PROCESS_INTERVAL_SECONDS:
                cv2.imshow("Advanced Motion Tracker", frame)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break
                continue
            prev_process_time = now

            image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            image.flags.writeable = False
            results = pose.process(image)
            image.flags.writeable = True
            image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)

            angle: Optional[float] = None
            form_quality = tracker.form_quality
            avg_rep_time = tracker.get_stats().avg_rep_time

            if results.pose_landmarks:
                landmarks = results.pose_landmarks.landmark
                payload = tracker.update(landmarks, time.time())
                angle = payload.get("angle")
                form_quality = float(payload.get("form_score", form_quality))
                avg_rep_time = tracker.get_stats().avg_rep_time
                if DRAW_LANDMARKS:
                    mp_drawing.draw_landmarks(image, results.pose_landmarks, mp_pose.POSE_CONNECTIONS)

            elapsed_seconds = time.time() - start_time
            calories = tracker.get_calories(elapsed_seconds)
            stats = tracker.get_stats()

            draw_overlay(
                image=image,
                exercise=args.exercise,
                reps=stats.reps,
                rejected=stats.rejected_reps,
                calories=calories,
                angle=angle,
                form_quality=form_quality,
                avg_rep_time=avg_rep_time,
            )

            cv2.imshow("Advanced Motion Tracker", image)
            if cv2.waitKey(10) & 0xFF == ord("q"):
                break

    cap.release()
    cv2.destroyAllWindows()

    final_stats = tracker.get_stats()
    print("\nWORKOUT SUMMARY")
    print("-" * 40)
    print(f"Exercise: {args.exercise}")
    print(f"Valid reps: {final_stats.reps}")
    print(f"Rejected reps: {final_stats.rejected_reps}")
    print(f"Form quality: {final_stats.form_quality:.2f}")
    print(f"Avg rep time: {final_stats.avg_rep_time:.0f} ms")
    print(f"Fastest rep: {final_stats.fastest_rep:.0f} ms")
    print(f"Slowest rep: {final_stats.slowest_rep:.0f} ms")
    print(f"Calories: {tracker.get_calories(time.time() - start_time):.2f} kcal")


if __name__ == "__main__":
    main()
