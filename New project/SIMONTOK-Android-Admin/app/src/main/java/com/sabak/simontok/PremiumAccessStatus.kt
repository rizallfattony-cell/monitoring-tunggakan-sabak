package com.sabak.simontok

import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

internal fun premiumTodayWib(): String = SimpleDateFormat("yyyy-MM-dd", Locale.US)
    .apply { timeZone = TimeZone.getTimeZone("Asia/Jakarta") }.format(Date())

internal fun isPremiumDate(value: String?): Boolean {
    if (value == null || !Regex("\\d{4}-\\d{2}-\\d{2}").matches(value)) return false
    return runCatching {
        SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { isLenient = false }.parse(value)
    }.getOrNull() != null
}

internal fun JSONObject.premiumNullableString(key: String): String? {
    if (!has(key) || isNull(key)) return null
    return optString(key).trim().takeUnless { it.isEmpty() || it.equals("null", ignoreCase = true) }
}

internal fun JSONObject.toPremiumAccessStatus(deviceId: String): PremiumStatus {
    val device = premiumNullableString("premium_device_id")
    return PremiumStatus(
        packageCode = premiumNullableString("premium_package")?.uppercase(Locale.US) ?: "FREE",
        activeUntil = premiumNullableString("premium_active_until")?.takeIf(::isPremiumDate),
        activeFrom = premiumNullableString("premium_active_from")?.takeIf(::isPremiumDate),
        deviceBound = device == deviceId && optBoolean("device_bound", false),
        boundToOtherDevice = device != null && device != deviceId
    )
}
