package com.sabak.simontok

import android.graphics.Bitmap
import androidx.activity.ComponentActivity
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import java.io.File
import org.junit.Rule
import org.junit.Test

class EnergyLoadingScreenTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    @Test fun showsCurrentStageAndInstalledVersion() {
        val checking = mutableStateOf(true)
        compose.setContent { EnergyLoadingScreen(checking.value) }
        compose.onNodeWithText("Versi " + BuildConfig.VERSION_NAME).assertIsDisplayed()
        compose.onNodeWithText("Memeriksa versi aplikasi...").assertIsDisplayed()
        compose.onNodeWithText("1 / 2").assertIsDisplayed()
        val frame = compose.onRoot().captureToImage().asAndroidBitmap()
        File(compose.activity.cacheDir, "energy-splash-preview.png").outputStream().use {
            frame.compress(Bitmap.CompressFormat.PNG, 100, it)
        }
        compose.runOnIdle { checking.value = false }
        compose.onNodeWithText("Membuka sesi petugas...").assertIsDisplayed()
        compose.onNodeWithText("2 / 2").assertIsDisplayed()
    }
}
