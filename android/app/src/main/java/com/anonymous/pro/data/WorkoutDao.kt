package com.anonymous.pro.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query

@Dao
interface WorkoutDao {

    @Insert
    suspend fun insert(workout: WorkoutEntity): Long

    @Query("SELECT * FROM workouts WHERE synced = 0 ORDER BY timestamp ASC")
    suspend fun getUnsynced(): List<WorkoutEntity>

    @Query("UPDATE workouts SET synced = 1 WHERE id = :id")
    suspend fun markSynced(id: Long)
}
