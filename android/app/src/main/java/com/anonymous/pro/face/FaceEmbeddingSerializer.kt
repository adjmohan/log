package com.anonymous.pro.face

object FaceEmbeddingSerializer {

    fun toCsv(embedding: FloatArray): String {
        return embedding.joinToString(",") { value -> "%.6f".format(value) }
    }

    fun fromCsv(csv: String): FloatArray {
        if (csv.isBlank()) {
            return floatArrayOf()
        }

        return csv.split(',').mapNotNull {
            it.trim().toFloatOrNull()
        }.toFloatArray()
    }
}
