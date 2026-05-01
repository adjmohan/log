package com.anonymous.pro.net

import android.content.Context
import android.util.Log
import com.anonymous.pro.data.WorkoutEntity
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedWriter
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class BackendApiClient(
    private val context: Context
) {

    private val baseUrls = listOf(
        "http://10.108.30.52:3000",
        "http://10.0.2.2:3000",
        "http://127.0.0.1:3000"
    )

    suspend fun saveStepDelta(steps: Int, timestamp: Long) {
        postJson(
            "/save-data",
            JSONObject()
                .put("userId", resolveUserId())
                .put("steps", steps)
                .put("calories", 0)
                .put("activity", "Walking")
                .put("timestamp", timestamp)
        )
    }

    suspend fun saveWorkout(workout: WorkoutEntity) {
        postJson(
            "/save-workout",
            JSONObject()
                .put("userId", workout.userId)
                .put("exercise", workout.exercise)
                .put("reps", workout.reps)
                .put("durationSeconds", workout.durationSeconds)
                .put("calories", workout.calories)
                .put("timestamp", workout.timestamp)
        )
    }

    suspend fun saveFace(userId: String, embedding: FloatArray) {
        postJson(
            "/save-face",
            JSONObject()
                .put("userId", userId)
                .put("embedding", JSONArray(embedding.toList()))
        )
    }

    private fun postJson(path: String, body: JSONObject) {
        var lastError: Exception? = null

        for (base in baseUrls) {
            try {
                val urlString = base + path
                Log.d("BackendApiClient", "Attempting POST to: $urlString")
                
                val connection = (URL(urlString).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 5000
                    readTimeout = 5000
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                }

                BufferedWriter(OutputStreamWriter(connection.outputStream)).use { writer ->
                    writer.write(body.toString())
                }

                val code = connection.responseCode
                if (code in 200..299) {
                    Log.i("BackendApiClient", "Success: $urlString (HTTP $code)")
                    connection.disconnect()
                    return
                }

                val errorBody = connection.errorStream?.bufferedReader()?.readText() ?: ""
                Log.e("BackendApiClient", "Server returned error $code from $urlString: $errorBody")
                
                lastError = RuntimeException("HTTP $code: $errorBody")
                connection.disconnect()
            } catch (error: Exception) {
                Log.e("BackendApiClient", "Failed to connect to $base: ${error.message}")
                lastError = error
            }
        }

        Log.e("BackendApiClient", "All backend attempts failed. Final error: ${lastError?.message}")
        throw lastError ?: RuntimeException("Backend request failed")
    }

    private fun resolveUserId(): String {
        return try {
            val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
            val raw = prefs.getString("user", null) ?: return "local"
            val json = JSONObject(raw)
            json.optString("userId", "local")
        } catch (_: Exception) {
            "local"
        }
    }
}
