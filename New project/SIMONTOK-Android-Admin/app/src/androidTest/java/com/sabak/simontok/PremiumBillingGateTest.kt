package com.sabak.simontok

import android.graphics.Bitmap
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.isRoot
import androidx.compose.ui.test.isDialog
import androidx.compose.ui.test.hasAnyDescendant
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.concurrent.atomic.AtomicReference
import java.util.concurrent.atomic.AtomicInteger
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class PremiumBillingGateTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    private fun status(blocked: Boolean = false) = PremiumBillingStatus(
        enrolled = true, billingMonth = "2026-10-01", packageCode = "SIMONTOK_PREMIUM", amount = 50000,
        dueStart = "2026-10-20", dueEnd = "2026-10-31", lockStart = "2026-10-29",
        shouldRemind = true, accessBlocked = blocked, serverDate = "2026-10-25",
        serverNowMillis = 1_000_000, nextCheckMillis = 2_000_000
    )

    @Test fun reminderCanCloseWithoutChangingPayment() {
        var activity: ComponentActivity? = null
        val calls = AtomicInteger(0)
        compose.setContent {
            activity = LocalContext.current as ComponentActivity
            MaterialTheme {
                PremiumBillingGate("TEST_REMINDER_173", "test", SupabaseApi(), { error("Unexpected refresh") }, {}, fetchStatus = { calls.incrementAndGet(); status() }) {
                    Text("FITUR OPERASIONAL")
                }
            }
        }
        compose.waitUntil(10_000) { compose.onAllNodesWithContentDescription("Tutup pengingat").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Pengingat Tagihan").assertIsDisplayed()
        compose.onNodeWithText("Cek Status Pembayaran", substring = true).assertDoesNotExist()
        val pay = compose.onNodeWithText("BAYAR").fetchSemanticsNode().boundsInRoot.top
        val confirm = compose.onNodeWithText("Konfirmasi ke Admin").fetchSemanticsNode().boundsInRoot.top
        assertTrue(pay < confirm)
        saveScreenshot("billing-reminder.png")
        compose.onNodeWithContentDescription("Tutup pengingat").performClick()
        compose.onNodeWithText("Pengingat Tagihan").assertDoesNotExist()
        compose.onNodeWithText("FITUR OPERASIONAL").assertIsDisplayed()
        val previousCalls = calls.get()
        compose.activityRule.scenario.moveToState(Lifecycle.State.STARTED)
        compose.activityRule.scenario.moveToState(Lifecycle.State.RESUMED)
        compose.waitUntil(10_000) { calls.get() > previousCalls }
        compose.onNodeWithText("Pengingat Tagihan").assertDoesNotExist()
    }

    @Test fun lockedGateHidesAllFeaturesThenPaidRefreshUnlocks() {
        val server = AtomicReference(status(blocked = true))
        var activity: ComponentActivity? = null
        compose.setContent {
            activity = LocalContext.current as ComponentActivity
            MaterialTheme {
                PremiumBillingGate("TEST_LOCKED_173", "test", SupabaseApi(), { error("Unexpected refresh") }, {}, fetchStatus = { server.get() }) {
                    Text("FITUR OPERASIONAL")
                }
            }
        }
        compose.waitUntil(10_000) { compose.onAllNodesWithText("Akses Ditangguhkan").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("FITUR OPERASIONAL").assertDoesNotExist()
        compose.onNodeWithContentDescription("Tutup pengingat").assertDoesNotExist()
        compose.runOnUiThread { requireNotNull(activity).onBackPressedDispatcher.onBackPressed() }
        compose.onNodeWithText("Akses Ditangguhkan").assertIsDisplayed()
        compose.onNodeWithText("Konfirmasi ke Admin").performScrollTo().assertIsDisplayed()
        saveScreenshot("billing-locked.png")
        server.set(status().copy(shouldRemind = false, accessBlocked = false, paidAt = "2026-10-25"))
        compose.activityRule.scenario.moveToState(Lifecycle.State.STARTED)
        compose.activityRule.scenario.moveToState(Lifecycle.State.RESUMED)
        compose.waitUntil(10_000) { compose.onAllNodesWithText("FITUR OPERASIONAL").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("FITUR OPERASIONAL").assertIsDisplayed()
        compose.onNodeWithText("Akses Ditangguhkan").assertDoesNotExist()
    }

    @Test fun paymentAccountsAreReadableAndCopyExactNumbers() {
        val copied = AtomicReference<PremiumPaymentAccount?>()
        compose.setContent {
            MaterialTheme {
                PremiumPaymentAccountsDialog(onDismiss = {}, onConfirm = {}, onCopy = { copied.set(it) })
            }
        }
        compose.onNodeWithText("a.n. RIZAL FATONI").assertIsDisplayed()
        premiumPaymentAccounts.forEach { account ->
            compose.onNodeWithText(account.number).performScrollTo().assertIsDisplayed()
            compose.onNodeWithContentDescription("Salin ${account.bank}").performScrollTo().performClick()
            assertEquals(account.number, copied.get()?.number)
        }
        saveScreenshot("billing-accounts.png")
    }

    @Test fun unavailableStatusDoesNotGrantAccess() {
        compose.setContent {
            MaterialTheme {
                PremiumBillingGate("TEST_FAILURE", "test", SupabaseApi(), { error("Unexpected refresh") }, {}, fetchStatus = { throw java.io.IOException("offline") }) {
                    Text("FITUR OPERASIONAL")
                }
            }
        }
        compose.waitUntil(10_000) { compose.onAllNodesWithText("Verifikasi pembayaran diperlukan").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("FITUR OPERASIONAL").assertDoesNotExist()
    }

    private fun saveScreenshot(name: String) {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val node = when (name) {
            "billing-reminder.png" -> compose.onNode(isDialog() and hasAnyDescendant(hasText("Pengingat Tagihan")))
            "billing-accounts.png" -> compose.onNode(isDialog() and hasAnyDescendant(hasText("Pembayaran Premium")))
            else -> compose.onRoot()
        }
        val bitmap = node.captureToImage().asAndroidBitmap()
        File(context.getExternalFilesDir(null), name).outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
}
