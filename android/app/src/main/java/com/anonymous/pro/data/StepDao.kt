package com.anonymous.pro.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query

@Dao
interface StepDao {

    @Insert
    suspend fun insert(step: StepEntity)

    @Query("SELECT * FROM StepEntity WHERE synced = 0")
    suspend fun getUnsynced(): List<StepEntity>

    @Query("UPDATE StepEntity SET synced = 1 WHERE id = :id")
    suspend fun markSynced(id: Int)
}
