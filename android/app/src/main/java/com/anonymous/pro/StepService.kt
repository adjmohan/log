package com.anonymous.pro

import android.app.*
import android.content.Context
import android.content.Intent
import android.hardware.*
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import com.anonymous.pro.data.StepDao
import com.anonymous.pro.data.StepDatabase
import com.anonymous.pro.data.StepEntity
import com.anonymous.pro.net.BackendApiClient
import com.anonymous.pro.sync.SyncManager
import com.anonymous.pro.util.isOnline
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.sqrt

class StepService : LifecycleService(), SensorEventListener {

    private lateinit var sensorManager: SensorManager
    private var stepSensor: Sensor? = null
    private var usingHardware = false

    private var initialSteps = -1
    private var currentSteps = 0

    private var lastStepTime = 0L
    private val stepTimes = ArrayDeque<Long>()

    // Advanced filtering
    private val gravity = FloatArray(3)
    private var lastMag = 0f
    private var lastPeakTime = 0L
    private var lastValley = 0f
    private var lastPeak = 0f
    private var direction = 0
    private var lastDirection = 0

    private val MIN_STEP_INTERVAL = 320L
    private val MAX_STEP_INTERVAL = 1200L
    private val STEP_THRESHOLD = 1.4f
    private val SHAKE_LIMIT = 5.0f

    private val channelId = "fitness_channel"
    private val notifId = 1

    private var weightKg = 70.0
    private var userId = "local"
    private val PREFS = "STEP_PREFS"
    private val KEY_STEPS = "steps"
    private val KEY_INITIAL = "initial_steps"

    private var lastNotificationTime = 0L
    private var stepsDisplay = 0
    private var smoothSteps = 0

    private val NOTIFICATION_INTERVAL_MS = 2500L

    // Offline-first sync architecture
    private lateinit var stepDao: StepDao
    private lateinit var healthManager: HealthConnectManager
    private lateinit var syncManager: SyncManager
    private var pendingDeltaSteps = 0
    private var lastBatchWriteTime = 0L

    private val BATCH_WRITE_INTERVAL_MS = 30_000L

    // Lifecycle

    override fun onCreate() {
        super.onCreate()

        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager

        val prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
        currentSteps = prefs.getInt(KEY_STEPS, 0)
        initialSteps = prefs.getInt(KEY_INITIAL, -1)
        stepsDisplay = currentSteps

        loadUserContext()

        val database = StepDatabase.getInstance(applicationContext)
        stepDao = database.stepDao()
        healthManager = HealthConnectManager(applicationContext)
        syncManager = SyncManager(
            dao = stepDao,
            workoutDao = database.workoutDao(),
            faceDao = database.faceDao(),
            health = healthManager,
            backend = BackendApiClient(applicationContext)
        )

        createChannel()
        startForegroundService()
        registerSensor()
    }

    private fun loadUserContext() {
        try {
            val prefs = getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
            val raw = prefs.getString("user", null)
            if (raw != null) {
                val json = org.json.JSONObject(raw)
                userId = json.optString("userId", "local")
                weightKg = json.optDouble("weight", 70.0)
            }
        } catch (_: Exception) {}
    }

    private fun registerSensor() {
        val counter = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)

        if (counter != null) {
            usingHardware = true
            stepSensor = counter
            sensorManager.registerListener(this, counter, SensorManager.SENSOR_DELAY_NORMAL)
        } else {
            usingHardware = false
            stepSensor = sensorManager.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION)
                ?: sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)

            sensorManager.registerListener(this, stepSensor, SensorManager.SENSOR_DELAY_UI)
        }
    }

    private fun startForegroundService() {
        val notification = buildNotification(0, "Starting", 0.0)
        startForeground(notifId, notification)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int =
        START_STICKY

    // Sensor

    override fun onSensorChanged(event: SensorEvent?) {
        event ?: return

        if (usingHardware) {
            handleHardware(event)
            return
        }

        handleAccelerometer(event)
    }

    private fun handleHardware(event: SensorEvent) {
        val total = event.values[0].toInt()

        if (initialSteps == -1) {
            initialSteps = total
            saveInitial()
            return
        }

        val newSteps = (total - initialSteps).coerceAtLeast(0)

        if (newSteps == currentSteps) return

        val delta = newSteps - currentSteps
        if (delta <= 0) return

        currentSteps = newSteps
        val now = System.currentTimeMillis()

        stepTimes.addLast(now)
        if (stepTimes.size > 6) stepTimes.removeFirst()

        lastStepTime = now
        onStepDelta(delta)
        updateUI()
    }

    private fun handleAccelerometer(event: SensorEvent) {
        val now = System.currentTimeMillis()

        val x = event.values[0]
        val y = event.values[1]
        val z = event.values[2]

        // remove gravity (Low Pass Filter)
        val alpha = 0.8f
        gravity[0] = alpha * gravity[0] + (1 - alpha) * x
        gravity[1] = alpha * gravity[1] + (1 - alpha) * y
        gravity[2] = alpha * gravity[2] + (1 - alpha) * z

        val lx = x - gravity[0]
        val ly = y - gravity[1]
        val lz = z - gravity[2]

        val magnitude = sqrt(lx * lx + ly * ly + lz * lz)

        // Shake detection: If magnitude is insanely high, ignore it as noise/shake
        if (magnitude > SHAKE_LIMIT * 3) {
            return
        }

        if (detectStep(magnitude, now)) {
            currentSteps++
            lastStepTime = now

            stepTimes.addLast(now)
            if (stepTimes.size > 10) stepTimes.removeFirst()

            onStepDelta(1)
            updateUI()
        }
        lastMag = magnitude
    }

    private fun detectStep(mag: Float, now: Long): Boolean {
        // Refined timing filter: Human walking cadence is usually 0.4s to 1.2s per step
        if (now - lastStepTime < 320L) return false

        direction = if (mag > lastMag) 1 else -1

        if (direction == -1 && lastDirection == 1) {
            lastPeak = lastMag
            val timeDiff = now - lastPeakTime

            // Dynamic Thresholding + Cadence Check
            if (timeDiff in MIN_STEP_INTERVAL..MAX_STEP_INTERVAL &&
                (lastPeak - lastValley) > STEP_THRESHOLD &&
                (lastPeak - lastValley) < SHAKE_LIMIT
            ) {
                lastPeakTime = now
                lastDirection = direction
                lastMag = mag
                return true
            }
        }

        if (direction == 1 && lastDirection == -1) {
            lastValley = lastMag
        }

        lastDirection = direction
        lastMag = mag
        return false
    }

    // Logic

    private fun updateUI() {
        saveSteps()

        val now = System.currentTimeMillis()

        val displaySteps = getSmoothSteps()

        // update every ~2-3 sec
        if (now - lastNotificationTime < NOTIFICATION_INTERVAL_MS) return
        lastNotificationTime = now

        val mode = detectMode()
        val calories = calculateCalories(mode)

        updateNotification(displaySteps, calories, mode)

        maybeFlushPendingSteps()
    }

    private fun getSmoothSteps(): Int {
        smoothSteps += (currentSteps - smoothSteps) / 3
        stepsDisplay = smoothSteps
        return smoothSteps
    }

    private fun onStepDelta(delta: Int) {
        if (delta <= 0) return
        pendingDeltaSteps += delta
    }

    private fun maybeFlushPendingSteps() {
        val now = System.currentTimeMillis()
        if (now - lastBatchWriteTime < BATCH_WRITE_INTERVAL_MS) {
            return
        }

        flushPendingSteps(now)
    }

    private fun flushPendingSteps(now: Long = System.currentTimeMillis()) {
        val deltaToStore = pendingDeltaSteps
        if (deltaToStore <= 0) {
            return
        }

        pendingDeltaSteps = 0
        lastBatchWriteTime = now

        lifecycleScope.launch {
            stepDao.insert(
                StepEntity(
                    steps = deltaToStore,
                    timestamp = now
                )
            )

            if (isOnline(applicationContext)) {
                syncManager.sync()
            }
        }
    }

    private fun detectMode(): String {
        if (System.currentTimeMillis() - lastStepTime > 7000) return "Idle"

        val avg = getAverageInterval()

        return when {
            avg < 400 -> "Running"
            avg < 900 -> "Walking"
            else -> "Idle"
        }
    }

    private fun getAverageInterval(): Double {
        if (stepTimes.size < 2) return 1000.0
        return stepTimes.zipWithNext { a, b -> b - a }.average()
    }

    private fun calculateCalories(mode: String): Double {
        val met = if (mode == "Running")
            com.anonymous.pro.util.CalorieCalculator.runningMet()
        else
            com.anonymous.pro.util.CalorieCalculator.walkingMet()

        val avgInterval = getAverageInterval()
        // Approximate active duration based on steps and interval
        val activeSeconds = (currentSteps * (avgInterval / 1000.0)).toLong()

        return com.anonymous.pro.util.CalorieCalculator.calculateStepCalories(
            met,
            activeSeconds,
            weightKg
        )
    }

    // Storage

    private fun saveSteps() {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
            .putInt(KEY_STEPS, currentSteps)
            .apply()
    }

    private fun saveInitial() {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
            .putInt(KEY_INITIAL, initialSteps)
            .apply()
    }

    // Notification

    private fun updateNotification(steps: Int, calories: Double, mode: String) {
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(notifId, buildNotification(steps, mode, calories))
    }

    private fun buildNotification(
        steps: Int,
        mode: String,
        calories: Double
    ): Notification {
        return NotificationCompat.Builder(this, channelId)
            .setContentTitle("AI Fitness Tracker")
            .setContentText("$mode | Steps: $steps | ${"%.1f".format(calories)} kcal")
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setOngoing(true)
            .build()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Fitness",
                NotificationManager.IMPORTANCE_LOW
            )
            getSystemService(NotificationManager::class.java)
                .createNotificationChannel(channel)
        }
    }

    // Life

    override fun onDestroy() {
        flushPendingSteps()
        sensorManager.unregisterListener(this)
        super.onDestroy()
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
}
