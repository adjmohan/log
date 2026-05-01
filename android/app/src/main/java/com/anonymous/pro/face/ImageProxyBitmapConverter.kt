package com.anonymous.pro.face

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.Matrix
import android.graphics.Rect
import android.graphics.YuvImage
import androidx.camera.core.ImageProxy
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer

object ImageProxyBitmapConverter {

    fun toBitmap(imageProxy: ImageProxy): Bitmap? {
        return try {
            val nv21 = yuv420ToNv21(imageProxy)
            val yuvImage = YuvImage(
                nv21,
                ImageFormat.NV21,
                imageProxy.width,
                imageProxy.height,
                null
            )

            val out = ByteArrayOutputStream()
            yuvImage.compressToJpeg(Rect(0, 0, imageProxy.width, imageProxy.height), 95, out)
            val bytes = out.toByteArray()
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        } catch (_: Exception) {
            null
        }
    }

    fun rotate(bitmap: Bitmap, rotationDegrees: Int): Bitmap {
        if (rotationDegrees == 0) {
            return bitmap
        }

        val matrix = Matrix().apply {
            postRotate(rotationDegrees.toFloat())
        }

        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    }

    private fun yuv420ToNv21(imageProxy: ImageProxy): ByteArray {
        val yBuffer: ByteBuffer = imageProxy.planes[0].buffer
        val uBuffer: ByteBuffer = imageProxy.planes[1].buffer
        val vBuffer: ByteBuffer = imageProxy.planes[2].buffer

        val ySize = yBuffer.remaining()
        val uSize = uBuffer.remaining()
        val vSize = vBuffer.remaining()

        val nv21 = ByteArray(ySize + uSize + vSize)

        yBuffer.get(nv21, 0, ySize)
        val uBytes = ByteArray(uSize).also { uBuffer.duplicate().get(it) }
        val vBytes = ByteArray(vSize).also { vBuffer.duplicate().get(it) }

        // NV21 expects interleaved VU data.
        val chromaHeight = imageProxy.height / 2
        val chromaWidth = imageProxy.width / 2
        val uRowStride = imageProxy.planes[1].rowStride
        val vRowStride = imageProxy.planes[2].rowStride
        val uPixelStride = imageProxy.planes[1].pixelStride
        val vPixelStride = imageProxy.planes[2].pixelStride

        var offset = ySize
        for (row in 0 until chromaHeight) {
            val uRowStart = row * uRowStride
            val vRowStart = row * vRowStride
            for (col in 0 until chromaWidth) {
                val uIndex = uRowStart + col * uPixelStride
                val vIndex = vRowStart + col * vPixelStride

                nv21[offset++] = if (vIndex < vBytes.size) vBytes[vIndex] else 0.toByte()
                nv21[offset++] = if (uIndex < uBytes.size) uBytes[uIndex] else 0.toByte()
            }
        }

        return nv21
    }
}
