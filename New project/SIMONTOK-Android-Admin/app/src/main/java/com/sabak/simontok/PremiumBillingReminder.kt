package com.sabak.simontok

import androidx.lifecycle.ViewModel

internal const val BILLING_REMINDER_INTERVAL_MS = 60 * 60_000L

internal class BillingReminderCadence {
    private var lastInteractionMillis: Long? = null

    fun isDue(nowMillis: Long): Boolean {
        val previous = lastInteractionMillis ?: return true
        return nowMillis >= previous && nowMillis - previous >= BILLING_REMINDER_INTERVAL_MS
    }

    fun recordInteraction(nowMillis: Long) {
        lastInteractionMillis = nowMillis
    }
}

internal class PremiumBillingReminderModel : ViewModel() {
    private val users = mutableMapOf<String, BillingReminderCadence>()
    fun forUser(username: String): BillingReminderCadence = users.getOrPut(username) { BillingReminderCadence() }
}

internal fun premiumPackageLabel(code: String): String = when (code.uppercase()) {
    "BILLMAN_PRO" -> "BILLMAN PRO"
    "SIMONTOK_PREMIUM", "P1", "P2", "P3" -> "SIMONTOK PREMIUM"
    else -> "FREE"
}

internal data class PremiumPaymentAccount(val bank: String, val number: String)

internal val premiumPaymentAccounts = listOf(
    PremiumPaymentAccount("DANA", "085783042643"),
    PremiumPaymentAccount("BRI", "220701016142501"),
    PremiumPaymentAccount("BNI", "0796885247"),
    PremiumPaymentAccount("MANDIRI", "1100010691225")
)
