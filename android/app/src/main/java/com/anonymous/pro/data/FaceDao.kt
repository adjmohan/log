package com.anonymous.pro.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface FaceDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(face: FaceEntity)

    @Query("SELECT * FROM faces WHERE synced = 0")
    suspend fun getUnsynced(): List<FaceEntity>

    @Query("UPDATE faces SET synced = 1 WHERE userId = :userId")
    suspend fun markSynced(userId: String)

    @Query("SELECT * FROM faces WHERE userId = :userId LIMIT 1")
    suspend fun getByUserId(userId: String): FaceEntity?
}
