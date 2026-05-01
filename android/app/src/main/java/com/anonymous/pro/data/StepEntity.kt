package com.anonymous.pro.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "StepEntity")
data class StepEntity(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val steps: Int,
    val timestamp: Long,
    val synced: Boolean = false
)
