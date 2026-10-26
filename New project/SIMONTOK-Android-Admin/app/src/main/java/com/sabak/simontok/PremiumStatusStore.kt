package com.sabak.simontok

import android.content.Context

class PremiumStatusStore(context: Context) {
    private val prefs = context.getSharedPreferences("premium_status_cache", Context.MODE_PRIVATE)

    fun save(username: String, status: PremiumStatus) {
        val key = username.trim().uppercase()
        if (key.isBlank()) return
        prefs.edit()
            .putString("${key}_package", status.packageCode)
            .putString("${key}_until", status.activeUntil)
            .putString("${key}_from", status.activeFrom)
            .putInt("${key}_version", BuildConfig.VERSION_CODE)
            .putBoolean("${key}_device_bound", status.deviceBound)
            .putBoolean("${key}_other_device", status.boundToOtherDevice)
            .apply()
    }

    fun read(username: String): PremiumStatus? {
        val key = username.trim().uppercase()
        if (key.isBlank() || !prefs.contains("${key}_package") || prefs.getInt("${key}_version", 0) != BuildConfig.VERSION_CODE) return null
        return PremiumStatus(
            packageCode = prefs.getString("${key}_package", "FREE").orEmpty().ifBlank { "FREE" },
            activeUntil = prefs.getString("${key}_until", null),
            activeFrom = prefs.getString("${key}_from", null),
            deviceBound = prefs.getBoolean("${key}_device_bound", false),
            boundToOtherDevice = prefs.getBoolean("${key}_other_device", false)
        )
    }
}
