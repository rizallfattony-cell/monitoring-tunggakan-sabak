package com.sabak.simontok

import android.content.Context

class ReceiptSettingsStore(context: Context) {
    private val prefs = context.getSharedPreferences("receipt_settings", Context.MODE_PRIVATE)

    fun read(): ReceiptSettings {
        return ReceiptSettings(
            namaToko = prefs.getString("nama_toko", "PLN MOBILE") ?: "PLN MOBILE",
            alamatToko = prefs.getString("alamat_toko", "PLN ULP SABAK") ?: "PLN ULP SABAK",
            adminFee = prefs.getFloat("admin_fee", 5000f).toDouble(),
            printerName = prefs.getString("printer_name", "").orEmpty(),
            printerAddress = prefs.getString("printer_address", "").orEmpty()
        )
    }

    fun save(settings: ReceiptSettings) {
        prefs.edit()
            .putString("nama_toko", settings.namaToko)
            .putString("alamat_toko", settings.alamatToko)
            .putFloat("admin_fee", settings.adminFee.toFloat())
            .putString("printer_name", settings.printerName)
            .putString("printer_address", settings.printerAddress)
            .apply()
    }
}

data class ReceiptSettings(
    val namaToko: String,
    val alamatToko: String,
    val adminFee: Double,
    val printerName: String = "",
    val printerAddress: String = ""
)

data class ReceiptMeter(
    val idpel: String,
    val standAwal: String,
    val standAkhir: String
)

data class ThermalPrinterDevice(
    val name: String,
    val address: String,
    val bonded: Boolean = false
)
