package com.anonymous.pro.sync

import android.util.Log
import com.anonymous.pro.HealthConnectManager
import com.anonymous.pro.data.FaceDao
import com.anonymous.pro.data.StepDao
import com.anonymous.pro.data.WorkoutDao
import com.anonymous.pro.face.FaceEmbeddingSerializer
import com.anonymous.pro.net.BackendApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class SyncManager(
    private val dao: StepDao,
    private val workoutDao: WorkoutDao,
    private val faceDao: FaceDao,
    private val health: HealthConnectManager,
    private val backend: BackendApiClient
) {

    suspend fun sync() {
        syncSteps()
        syncWorkouts()
        syncFaces()
    }

    private suspend fun syncSteps() {
        val unsynced = dao.getUnsynced()
        if (unsynced.isEmpty()) return

        Log.d("SyncManager", "Syncing ${unsynced.size} step entries...")

        for (data in unsynced) {
            try {
                health.insertSteps(data.steps)
                backend.saveStepDelta(data.steps, data.timestamp)
                dao.markSynced(data.id)
            } catch (e: Exception) {
                Log.e("SyncManager", "Failed to sync steps: ${e.message}")
            }
        }
    }

    private suspend fun syncWorkouts() {
        val unsynced = workoutDao.getUnsynced()
        if (unsynced.isEmpty()) return

        Log.d("SyncManager", "Syncing ${unsynced.size} workouts...")

        for (workout in unsynced) {
            try {
                backend.saveWorkout(workout)
                workoutDao.markSynced(workout.id)
            } catch (e: Exception) {
                Log.e("SyncManager", "Failed to sync workout: ${e.message}")
            }
        }
    }

    private suspend fun syncFaces() {
        val unsynced = faceDao.getUnsynced()
        Log.d("SyncManager", "SyncFaces check: Found ${unsynced.size} unsynced faces in local DB")
        
        if (unsynced.isEmpty()) return

        Log.d("SyncManager", "Syncing ${unsynced.size} face embeddings to server...")

        for (face in unsynced) {
            try {
                val embedding = FaceEmbeddingSerializer.fromCsv(face.embeddingCsv)
                backend.saveFace(face.userId, embedding)
                faceDao.markSynced(face.userId)
            } catch (e: Exception) {
                Log.e("SyncManager", "Failed to sync face: ${e.message}")
            }
        }
    }
}
