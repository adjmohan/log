package com.anonymous.pro.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "workouts")
data class WorkoutEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val userId: String,
    val exercise: String,
    val reps: Int,
    val durationSeconds: Long,
    val calories: Double,
    val timestamp: Long,
    val synced: Boolean = false,
)
