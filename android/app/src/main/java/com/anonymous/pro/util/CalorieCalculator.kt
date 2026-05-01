package com.anonymous.pro.util

enum class ExerciseType {
    PUSHUPS,
    SQUATS,
    LUNGES,
    PLANK,
    SITUPS,
    JUMPING_JACKS,
    BURPEES,
    MOUNTAIN_CLIMBERS,
    HIGH_KNEES,
    BICYCLE_CRUNCHES,
}

object CalorieCalculator {

    private const val MET_WALKING = 3.5
    private const val MET_RUNNING = 7.0
    private const val DEFAULT_WEIGHT_KG = 70.0
    private const val DEFAULT_REP_SECONDS = 3.0
    private const val PLANK_SECONDS_PER_REP = 1.0

    private val exerciseMet = mapOf(
        ExerciseType.PUSHUPS to 8.0,
        ExerciseType.SQUATS to 5.0,
        ExerciseType.LUNGES to 5.5,
        ExerciseType.PLANK to 3.3,
        ExerciseType.SITUPS to 4.5,
        ExerciseType.JUMPING_JACKS to 8.0,
        ExerciseType.BURPEES to 10.0,
        ExerciseType.MOUNTAIN_CLIMBERS to 8.5,
        ExerciseType.HIGH_KNEES to 8.0,
        ExerciseType.BICYCLE_CRUNCHES to 4.5,
    )

    fun calculateWorkoutCalories(
        exercise: ExerciseType,
        reps: Int,
        durationSeconds: Long,
        weightKg: Double = DEFAULT_WEIGHT_KG
    ): Double {
        val met = exerciseMet[exercise] ?: 4.5
        val estimatedSeconds = when (exercise) {
            ExerciseType.PLANK -> maxOf(durationSeconds.toDouble(), reps * PLANK_SECONDS_PER_REP)
            else -> maxOf(durationSeconds.toDouble(), reps * DEFAULT_REP_SECONDS)
        }

        return calculateMetCalories(met, weightKg, estimatedSeconds)
    }

    fun calculateStepCalories(
        activityMet: Double,
        activeSeconds: Long,
        weightKg: Double = DEFAULT_WEIGHT_KG
    ): Double {
        return calculateMetCalories(activityMet, weightKg, activeSeconds.toDouble())
    }

    fun walkingMet(): Double = MET_WALKING
    fun runningMet(): Double = MET_RUNNING

    private fun calculateMetCalories(met: Double, weightKg: Double, durationSeconds: Double): Double {
        val durationMinutes = (durationSeconds.coerceAtLeast(1.0)) / 60.0
        return met * weightKg * 3.5 * durationMinutes / 200.0
    }
}
