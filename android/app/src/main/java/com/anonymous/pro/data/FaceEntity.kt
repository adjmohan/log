package com.anonymous.pro.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "faces")
data class FaceEntity(
    @PrimaryKey val userId: String,
    val embeddingCsv: String,
    val updatedAt: Long,
    val synced: Boolean = false,
)
