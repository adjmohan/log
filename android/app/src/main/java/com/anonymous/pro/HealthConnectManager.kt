package com.anonymous.pro

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Instant
import java.time.temporal.ChronoUnit

class HealthConnectManager(context: Context) {

    private val client = HealthConnectClient.getOrCreate(context)

    fun permissions(): Set<String> {
        return setOf(
            HealthPermission.getReadPermission(StepsRecord::class),
            HealthPermission.getWritePermission(StepsRecord::class)
        )
    }

    fun permissionRequestContract() = PermissionController.createRequestPermissionResultContract()

    suspend fun hasPermissions(): Boolean {
        return client.permissionController.getGrantedPermissions().containsAll(permissions())
    }

    suspend fun insertSteps(steps: Int) {
        if (steps <= 0) {
            return
        }

        if (!hasPermissions()) {
            return
        }

        val now = Instant.now()
        val record = StepsRecord(
            count = steps.toLong(),
            startTime = now.minusSeconds(60),
            endTime = now,
            startZoneOffset = null,
            endZoneOffset = null
        )

        client.insertRecords(listOf(record))
    }

    suspend fun readSteps(): Long {
        if (!hasPermissions()) {
            return 0L
        }

        val end = Instant.now()
        val start = end.minus(1, ChronoUnit.DAYS)

        val response = client.readRecords(
            ReadRecordsRequest(
                recordType = StepsRecord::class,
                timeRangeFilter = TimeRangeFilter.between(start, end)
            )
        )

        return response.records.sumOf { it.count }
    }
}
