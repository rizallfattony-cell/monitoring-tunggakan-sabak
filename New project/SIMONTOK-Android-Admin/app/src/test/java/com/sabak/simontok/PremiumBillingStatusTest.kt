package com.sabak.simontok

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PremiumBillingStatusTest {
    private fun status() = PremiumBillingStatus(
        enrolled = true, billingMonth = "2026-10-01", packageCode = "P3", amount = 50000,
        shouldRemind = true, accessBlocked = false, serverDate = "2026-10-25",
        serverNowMillis = 100_000, nextCheckMillis = 200_000
    )

    @Test fun validLeaseUsesElapsedTime() {
        val lease = PremiumBillingLease(status(), 1000, 7)
        assertTrue(lease.isFresh(1000, 7))
        assertTrue(lease.isFresh(100_999, 7))
        assertFalse(lease.isFresh(101_000, 7))
    }

    @Test fun restartingPhoneInvalidatesOfflineGrant() {
        assertFalse(PremiumBillingLease(status(), 1000, 7).isFresh(2000, 8))
    }

    @Test fun elapsedClockCannotGoBackwards() {
        assertFalse(PremiumBillingLease(status(), 1000, 7).isFresh(999, 7))
    }

    @Test fun legacyDeviceCannotReuseDiskCacheWithoutBootIdentity() {
        assertFalse(PremiumBillingLease(status(), 1000, -1, false).isFresh(2000, -1))
        assertTrue(PremiumBillingLease(status(), 1000, -1, true).isFresh(2000, -1))
    }

    @Test(expected = IllegalArgumentException::class)
    fun serverCannotGrantMoreThanOneDayOffline() {
        status().copy(nextCheckMillis = 100_000 + 86_400_001)
    }

    @Test(expected = IllegalArgumentException::class)
    fun invalidExpiryIsRejected() {
        status().copy(nextCheckMillis = 100_000)
    }

    @Test(expected = IllegalArgumentException::class)
    fun paidStatusCannotDemandPayment() {
        status().copy(paidAt = "2026-10-25")
    }

    @Test(expected = IllegalArgumentException::class)
    fun missingMonthCannotLookLikeValidBill() {
        status().copy(billingMonth = "")
    }

    @Test(expected = IllegalArgumentException::class)
    fun exemptAccountCannotBeBlocked() {
        status().copy(enrolled = false, accessBlocked = true)
    }
}
