package com.sabak.simontok

data class PremiumBillingStatus(
    val enrolled: Boolean,
    val billingMonth: String = "",
    val packageCode: String = "",
    val amount: Long = 0,
    val dueStart: String = "",
    val dueEnd: String = "",
    val lockStart: String = "",
    val paidAt: String = "",
    val shouldRemind: Boolean,
    val accessBlocked: Boolean,
    val serverDate: String,
    val serverNowMillis: Long,
    val nextCheckMillis: Long
) {
    init {
        require(serverNowMillis > 0 && nextCheckMillis > serverNowMillis)
        require(nextCheckMillis - serverNowMillis <= 86_400_000L)
        require(!accessBlocked || (enrolled && shouldRemind))
        require(!shouldRemind || (enrolled && paidAt.isBlank()))
        require(!enrolled || (amount >= 0 && billingMonth.matches(Regex("\\d{4}-\\d{2}-01"))))
    }

    val reminderKey: String get() = "$billingMonth:$serverDate"
}

data class PremiumBillingLease(
    val status: PremiumBillingStatus,
    val checkedElapsedMillis: Long,
    val bootCount: Int,
    val fromCurrentProcess: Boolean = true
) {
    fun isFresh(nowElapsedMillis: Long, currentBootCount: Int): Boolean {
        if (nowElapsedMillis < checkedElapsedMillis) return false
        if (bootCount >= 0 && currentBootCount >= 0) {
            if (bootCount != currentBootCount) return false
        } else if (!fromCurrentProcess) {
            return false
        }
        return remainingMillis(nowElapsedMillis) > 0
    }

    fun remainingMillis(nowElapsedMillis: Long): Long =
        status.nextCheckMillis - status.serverNowMillis - (nowElapsedMillis - checkedElapsedMillis)
}
