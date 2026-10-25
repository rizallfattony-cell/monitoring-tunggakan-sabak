package com.sabak.simontok

import android.content.Context
import java.util.UUID

class DeviceStore(context: Context) {
    private val prefs = context.getSharedPreferences("simontok_device", Context.MODE_PRIVATE)

    fun deviceId(): String {
        val existing = prefs.getString("device_id", null)
        if (!existing.isNullOrBlank()) return existing
        val next = UUID.randomUUID().toString()
        prefs.edit().putString("device_id", next).apply()
        return next
    }
}
