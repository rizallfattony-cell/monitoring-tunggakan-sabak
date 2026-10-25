package com.sabak.simontok

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PremiumBillingReminderTest {
    @Test fun firstLaunchIsDue() = assertTrue(BillingReminderCadence().isDue(1000))

    @Test fun pollsAndResumesDoNotResetCadence() {
        val cadence = BillingReminderCadence()
        cadence.recordInteraction(1000)
        assertFalse(cadence.isDue(1000))
        assertFalse(cadence.isDue(1000 + 5 * 60_000))
        assertFalse(cadence.isDue(1000 + BILLING_REMINDER_INTERVAL_MS - 1))
        assertTrue(cadence.isDue(1000 + BILLING_REMINDER_INTERVAL_MS))
    }

    @Test fun dismissingWaitsAnotherHour() {
        val cadence = BillingReminderCadence()
        cadence.recordInteraction(0)
        cadence.recordInteraction(30 * 60_000)
        assertFalse(cadence.isDue(BILLING_REMINDER_INTERVAL_MS))
        assertTrue(cadence.isDue(90 * 60_000))
    }

    @Test fun trueNewLaunchGetsNewCadence() {
        val previous = BillingReminderCadence()
        previous.recordInteraction(1000)
        assertFalse(previous.isDue(2000))
        assertTrue(BillingReminderCadence().isDue(2000))
    }

    @Test fun accountNumbersAreExactTextIncludingLeadingZeros() {
        assertEquals(listOf("085783042643", "220701016142501", "0796885247", "1100010691225"), premiumPaymentAccounts.map { it.number })
    }

    @Test fun namedPackagesAndLegacyNamesAreReadable() {
        assertEquals("SIMONTOK PREMIUM", premiumPackageLabel("P1"))
        assertEquals("SIMONTOK PREMIUM", premiumPackageLabel("P2"))
        assertEquals("SIMONTOK PREMIUM", premiumPackageLabel("P3"))
        assertEquals("SIMONTOK PREMIUM", premiumPackageLabel("SIMONTOK_PREMIUM"))
        assertEquals("BILLMAN PRO", premiumPackageLabel("BILLMAN_PRO"))
    }
}
