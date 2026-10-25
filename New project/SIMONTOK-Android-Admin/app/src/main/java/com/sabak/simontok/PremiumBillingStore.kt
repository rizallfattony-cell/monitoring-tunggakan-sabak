package com.sabak.simontok

import android.content.Context
import android.os.Build
import android.provider.Settings
import org.json.JSONObject
import java.util.Locale

class PremiumBillingStore(private val context: Context) {
    private val prefs = context.getSharedPreferences("premium_billing_v1", Context.MODE_PRIVATE)

    fun bootCount(): Int = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        runCatching { Settings.Global.getInt(context.contentResolver, Settings.Global.BOOT_COUNT) }.getOrDefault(-1)
    } else -1

    fun save(username: String, lease: PremiumBillingLease) {
        val json = lease.status.toJson()
            .put("app_version_code", BuildConfig.VERSION_CODE)
            .put("checked_elapsed_ms", lease.checkedElapsedMillis)
            .put("boot_count", lease.bootCount)
        prefs.edit().putString(username.uppercase(Locale.US), json.toString()).apply()
    }

    fun read(username: String): PremiumBillingLease? = runCatching {
        val raw = prefs.getString(username.uppercase(Locale.US), null) ?: return@runCatching null
        val json = JSONObject(raw)
        if (json.optInt("app_version_code", -1) != BuildConfig.VERSION_CODE) return@runCatching null
        PremiumBillingLease(
            status = json.toPremiumBillingStatus(),
            checkedElapsedMillis = json.getLong("checked_elapsed_ms"),
            bootCount = json.getInt("boot_count"),
            fromCurrentProcess = false
        )
    }.getOrNull()
}

internal fun JSONObject.toPremiumBillingStatus() = PremiumBillingStatus(
    enrolled = getBoolean("enrolled"),
    billingMonth = optString("billing_month", ""),
    packageCode = optString("package_code", ""),
    amount = optLong("amount", 0),
    dueStart = optString("due_start", ""),
    dueEnd = optString("due_end", ""),
    lockStart = optString("lock_start", ""),
    paidAt = if (isNull("paid_at")) "" else optString("paid_at", ""),
    shouldRemind = getBoolean("should_remind"),
    accessBlocked = getBoolean("access_blocked"),
    serverDate = getString("server_date"),
    serverNowMillis = getLong("server_now_ms"),
    nextCheckMillis = getLong("next_check_at_ms")
)

private fun PremiumBillingStatus.toJson() = JSONObject()
    .put("enrolled", enrolled).put("billing_month", billingMonth)
    .put("package_code", packageCode).put("amount", amount)
    .put("due_start", dueStart).put("due_end", dueEnd).put("lock_start", lockStart)
    .put("paid_at", paidAt).put("should_remind", shouldRemind).put("access_blocked", accessBlocked)
    .put("server_date", serverDate).put("server_now_ms", serverNowMillis).put("next_check_at_ms", nextCheckMillis)
