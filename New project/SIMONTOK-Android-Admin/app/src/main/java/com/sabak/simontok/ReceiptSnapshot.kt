package com.sabak.simontok

import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

internal fun receiptIsoDate(date: Date = Date()): String =
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(date)

internal fun receiptMonth(date: Date = Date()): String =
    SimpleDateFormat("yyyy-MM", Locale.US).apply { timeZone = TimeZone.getTimeZone("Asia/Jakarta") }.format(date)

internal data class ReceiptIdentity(
    val id: String = UUID.randomUUID().toString(),
    val date: Date = Date(),
    val transactionId: String = newReceiptTransactionId(),
    val reference: String = newReceiptReference()
)

internal data class ReceiptSnapshot(val json: JSONObject) {
    val id: String get() = json.getString("id")
    val text: String get() = json.getString("print_text")

    companion object {
        fun create(identity: ReceiptIdentity, row: CustomerDebt, meter: ReceiptMeter?, settings: ReceiptSettings, extra: Long): ReceiptSnapshot {
            val base = row.rptag.toLong()
            val admin = settings.adminFee.toLong()
            require(base >= 0 && extra >= 0 && admin >= 0)
            val total = Math.addExact(Math.addExact(base, extra), admin)
            val printedAt = receiptIsoDate(identity.date)
            val text = buildReceiptText(row.copy(rptag = base.toDouble()), meter, settings.copy(adminFee = admin.toDouble()),
                extra.toDouble(), identity.date, identity.transactionId, identity.reference)
            return ReceiptSnapshot(JSONObject().apply {
                put("id", identity.id)
                put("format_version", 1)
                put("printed_at", printedAt)
                put("transaction_id", identity.transactionId)
                put("reference", identity.reference)
                put("idpel", row.idpel)
                put("customer_name", row.nama)
                put("tariff", row.tarif)
                put("power", row.daya)
                put("address", row.alamat)
                put("kolok", row.kolok)
                put("koked", row.koked)
                put("stand_meter", listOfNotNull(meter?.standAwal, meter?.standAkhir).joinToString("-"))
                put("bill_month", receiptMonth(identity.date))
                put("base_amount", base)
                put("extra_amount", extra)
                put("admin_amount", admin)
                put("total_amount", total)
                put("store_name", settings.namaToko)
                put("store_address", settings.alamatToko)
                put("print_text", text)
            })
        }
    }
}

internal data class ReceiptHistoryEntry(
    val metadata: JSONObject,
    val snapshot: ReceiptSnapshot?,
    val synced: Boolean,
    val reprintCount: Long,
    val uncertain: Boolean = false,
    val uncertainReprints: Long = 0
) {
    val id: String get() = metadata.getString("id")
}
