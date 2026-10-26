package com.sabak.simontok

import android.graphics.Bitmap
import androidx.activity.ComponentActivity
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import java.io.File

class PremiumAccessActivationTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private val ownDevice = "device-adri-test"
    private fun profile(device: Any = ownDevice) = JSONObject()
        .put("premium_package", "SIMONTOK_PREMIUM")
        .put("premium_active_from", "2020-01-01")
        .put("premium_active_until", "2099-11-23")
        .put("premium_device_id", device)
        .put("device_bound", device == ownDevice)

    @Test fun jsonNullReproducesOldBugButIsNotAnOtherDeviceNow() {
        val json = profile(JSONObject.NULL)
        val oldValue = json.optString("premium_device_id").ifBlank { null }
        assertEquals("null", oldValue)
        val parsed = json.toPremiumAccessStatus(ownDevice)
        assertFalse(parsed.boundToOtherDevice)
        assertFalse(parsed.deviceBound)
        assertFalse(parsed.isActive())
    }
    @Test fun legacyLiteralNullAndMissingDeviceAreAlsoUnbound() {
        for (value in listOf("null", " NULL ", "", "  ")) assertFalse(profile(value).toPremiumAccessStatus(ownDevice).boundToOtherDevice)
        val missing = profile().apply { remove("premium_device_id") }
        assertFalse(missing.toPremiumAccessStatus(ownDevice).boundToOtherDevice)
    }
    @Test fun confirmedOwnDeviceUnlocksExtraAmountInActualReceiptPreview() {
        val status = profile().toPremiumAccessStatus(ownDevice)
        assertTrue(status.isActive())
        val preview = ReceiptPreview(CustomerDebt("ADRI", "00143900001", "PELANGGAN UJI", "R1", "1300", "ALAMAT", 1, "A", "1", 100000.0), null,
            ReceiptSettings("PLN MOBILE", "PLN ULP SABAK", 5000.0))
        compose.setContent { MaterialTheme { ReceiptPreviewDialog(preview, status, {}, {}) } }
        compose.onNodeWithText("Tambah tagihan").assertIsDisplayed().performTextInput("5000")
        compose.onNodeWithText("Fitur tambah tagihan khusus user premium.").assertDoesNotExist()
        val bitmap = compose.onNode(isDialog()).captureToImage().asAndroidBitmap()
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        File(context.getExternalFilesDir(null), "premium-activation-preview.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
    @Test fun realOtherDeviceRemainsLockedAndIsExplained() {
        val status = profile("someone-else").toPremiumAccessStatus(ownDevice)
        assertTrue(status.boundToOtherDevice)
        assertFalse(status.isActive())
        compose.setContent { MaterialTheme { PremiumAccessInfoDialog("TEST_ADRI", status, onDismiss = {}) } }
        compose.onNodeWithText("Paket masih aktif, tetapi terikat di perangkat lain.", substring = true).assertIsDisplayed()
    }
    @Test fun updateDropsLegacyIncorrectPremiumCache() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val prefs = context.getSharedPreferences("premium_status_cache", 0)
        prefs.edit().putString("TEST_ADRI_package", "SIMONTOK_PREMIUM").putString("TEST_ADRI_until", "2099-11-23")
            .putBoolean("TEST_ADRI_other_device", true).putInt("TEST_ADRI_version", BuildConfig.VERSION_CODE-1).commit()
        val store = PremiumStatusStore(context)
        assertNull(store.read("TEST_ADRI"))
        store.save("TEST_ADRI", profile().toPremiumAccessStatus(ownDevice))
        assertTrue(store.read("TEST_ADRI")!!.isActive())
        prefs.edit().clear().commit()
    }
}
