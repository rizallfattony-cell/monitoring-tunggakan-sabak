package com.sabak.simontok

import org.junit.Assert.*
import org.junit.Test

class PremiumAccessStatusTest {
    private fun status() = PremiumStatus("SIMONTOK_PREMIUM","2026-11-23",deviceBound=true,activeFrom="2026-10-24")
    @Test fun activeAdriPeriodWorksOnItsBoundDevice() { assertTrue(status().isActive("2026-10-26")) }
    @Test fun otherDeviceRemainsBlockedButPeriodIsStillActive() {
        val other=status().copy(deviceBound=false,boundToOtherDevice=true)
        assertTrue(other.hasActivePeriod("2026-10-26"))
        assertFalse(other.isActive("2026-10-26"))
    }
    @Test fun unboundDeviceIsNotSilentlyGrantedAccess() { assertFalse(status().copy(deviceBound=false).isActive("2026-10-26")) }
    @Test fun missingOrLiteralNullOrImpossibleExpiryNeverGrantsAccess() {
        for(value in listOf(null,"null","","2026-02-30")) assertFalse(status().copy(activeUntil=value).isActive("2026-10-26"))
    }
    @Test fun scheduledAndExpiredPeriodsAreInactive() {
        assertFalse(status().isActive("2026-10-23"))
        assertTrue(status().isActive("2026-11-23"))
        assertFalse(status().isActive("2026-11-24"))
    }
    @Test fun freeAndUnknownPackagesAreInactive() {
        assertFalse(status().copy(packageCode="FREE").isActive("2026-10-26"))
        assertFalse(status().copy(packageCode="UNKNOWN").isActive("2026-10-26"))
    }
}
