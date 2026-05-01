package com.anonymous.pro.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [StepEntity::class, WorkoutEntity::class, FaceEntity::class],
    version = 2,
    exportSchema = false
)
abstract class StepDatabase : RoomDatabase() {

    abstract fun stepDao(): StepDao
    abstract fun workoutDao(): WorkoutDao
    abstract fun faceDao(): FaceDao

    companion object {
        @Volatile
        private var INSTANCE: StepDatabase? = null

        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS workouts (
                        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        userId TEXT NOT NULL,
                        exercise TEXT NOT NULL,
                        reps INTEGER NOT NULL,
                        durationSeconds INTEGER NOT NULL,
                        calories REAL NOT NULL,
                        timestamp INTEGER NOT NULL,
                        synced INTEGER NOT NULL DEFAULT 0
                    )
                    """.trimIndent()
                )
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS faces (
                        userId TEXT NOT NULL PRIMARY KEY,
                        embeddingCsv TEXT NOT NULL,
                        updatedAt INTEGER NOT NULL,
                        synced INTEGER NOT NULL DEFAULT 0
                    )
                    """.trimIndent()
                )
            }
        }

        fun getInstance(context: Context): StepDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    StepDatabase::class.java,
                    "step-db"
                )
                    .addMigrations(MIGRATION_1_2)
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
