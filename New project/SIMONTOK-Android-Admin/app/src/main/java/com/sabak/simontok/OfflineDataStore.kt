package com.sabak.simontok

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

class OfflineDataStore(context: Context) {
    private val prefs = context.getSharedPreferences("offline_data", Context.MODE_PRIVATE)

    fun save(
        username: String,
        ownRows: List<CustomerDebt>,
        allRows: List<CustomerDebt>,
        meters: Map<String, ReceiptMeter>,
        dataVersion: String?,
        fullSyncComplete: Boolean
    ) {
        prefs.edit()
            .putString("username", username)
            .putString("own_rows", JSONArray(ownRows.map { it.toJson() }).toString())
            .putString("all_rows", JSONArray(allRows.map { it.toJson() }).toString())
            .putString("meters", JSONArray(meters.values.map { it.toJson() }).toString())
            .putString("data_version", dataVersion.orEmpty())
            .putInt("sync_format", if (fullSyncComplete) OFFLINE_SYNC_FORMAT else 0)
            .apply()
    }

    fun read(username: String): OfflineCache? {
        val savedUsername = prefs.getString("username", "").orEmpty()
        if (!savedUsername.equals(username, ignoreCase = true)) return null
        if (!prefs.contains("own_rows")) return null
        val ownRows = parseRows(prefs.getString("own_rows", "[]").orEmpty())
        val fullSyncComplete = prefs.getInt("sync_format", 0) == OFFLINE_SYNC_FORMAT
        return OfflineCache(
            ownRows = ownRows,
            allRows = if (fullSyncComplete) parseRows(prefs.getString("all_rows", "[]").orEmpty()) else emptyList(),
            meters = if (fullSyncComplete) parseMeters(prefs.getString("meters", "[]").orEmpty()) else emptyMap(),
            dataVersion = prefs.getString("data_version", "").orEmpty().ifBlank { null },
            fullSyncComplete = fullSyncComplete
        )
    }

    fun clear() {
        prefs.edit().clear().apply()
    }

    private fun parseRows(raw: String): List<CustomerDebt> {
        val array = JSONArray(raw.ifBlank { "[]" })
        return List(array.length()) { index -> array.getJSONObject(index).toCustomerDebt() }
    }

    private fun parseMeters(raw: String): Map<String, ReceiptMeter> {
        val array = JSONArray(raw.ifBlank { "[]" })
        return List(array.length()) { index ->
            val item = array.getJSONObject(index)
            ReceiptMeter(
                idpel = item.optString("idpel"),
                standAwal = item.optString("stand_awal"),
                standAkhir = item.optString("stand_akhir")
            )
        }.associateBy { it.idpel }
    }

    private companion object {
        const val OFFLINE_SYNC_FORMAT = 2
    }
}

data class OfflineCache(
    val ownRows: List<CustomerDebt>,
    val allRows: List<CustomerDebt>,
    val meters: Map<String, ReceiptMeter>,
    val dataVersion: String?,
    val fullSyncComplete: Boolean
)

fun CustomerDebt.toJson(): JSONObject {
    return JSONObject()
        .put("petugas", petugas)
        .put("idpel", idpel)
        .put("nama", nama)
        .put("tarif", tarif)
        .put("daya", daya)
        .put("alamat", alamat)
        .put("lembar", lembar)
        .put("kolok", kolok)
        .put("koked", koked)
        .put("rptag", rptag)
        .put("uploaded_at", uploadedAt)
}

fun ReceiptMeter.toJson(): JSONObject {
    return JSONObject()
        .put("idpel", idpel)
        .put("stand_awal", standAwal)
        .put("stand_akhir", standAkhir)
}

fun JSONObject.toCustomerDebt(): CustomerDebt {
    return CustomerDebt(
        petugas = optString("petugas"),
        idpel = optString("idpel"),
        nama = optString("nama"),
        tarif = optString("tarif"),
        daya = optString("daya"),
        alamat = optString("alamat"),
        lembar = optDouble("lembar", 0.0).toInt(),
        kolok = optString("kolok"),
        koked = optString("koked"),
        rptag = optDouble("rptag", 0.0),
        uploadedAt = optString("uploaded_at")
    )
}
