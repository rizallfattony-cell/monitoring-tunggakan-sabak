package com.sabak.simontok

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONObject
import java.util.Locale
import java.util.UUID

internal class ReceiptHistoryStore(context: Context) : SQLiteOpenHelper(context.applicationContext, "receipt_history.db", null, 2) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE receipts (id TEXT PRIMARY KEY, owner TEXT NOT NULL, month TEXT NOT NULL, printed_at TEXT NOT NULL, search TEXT NOT NULL, metadata TEXT NOT NULL, payload TEXT, state TEXT NOT NULL, synced INTEGER NOT NULL DEFAULT 0, remote_reprints INTEGER NOT NULL DEFAULT 0)")
        db.execSQL("CREATE INDEX receipts_owner_month ON receipts(owner,month,printed_at DESC)")
        db.execSQL("CREATE TABLE reprints (id TEXT PRIMARY KEY, receipt_id TEXT NOT NULL, owner TEXT NOT NULL, printed_at TEXT NOT NULL, synced INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'sent')")
    }
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if(oldVersion<2) db.execSQL("ALTER TABLE reprints ADD COLUMN state TEXT NOT NULL DEFAULT 'sent'")
    }
    private fun owner(username: String) = username.trim().uppercase(Locale.US)

    @Synchronized fun stage(username: String, snapshot: ReceiptSnapshot) {
        val j = snapshot.json
        val values = values(username, j).apply {
            put("payload", j.toString())
            put("state", "draft")
        }
        writableDatabase.insertOrThrow("receipts", null, values)
    }

    @Synchronized fun sent(username: String, snapshot: ReceiptSnapshot) {
        val completed = JSONObject(snapshot.json.toString()).put("sent_at", receiptIsoDate())
        val values = ContentValues().apply {
            put("payload", completed.toString())
            put("state", "sent")
        }
        check(writableDatabase.update("receipts", values, "id=? AND owner=? AND state='draft'", arrayOf(snapshot.id, owner(username))) == 1)
    }

    @Synchronized fun failed(username: String, id: String) {
        writableDatabase.delete("receipts", "id=? AND owner=? AND state='draft'", arrayOf(id, owner(username)))
    }

    @Synchronized fun stageReprint(username: String, id: String): String {
        val existing = get(username, id) ?: error("Struk tidak ditemukan")
        check(!existing.uncertain)
        val eventId=UUID.randomUUID().toString()
        writableDatabase.insertOrThrow("reprints", null, ContentValues().apply {
            put("id", eventId)
            put("receipt_id", id)
            put("owner", owner(username))
            put("printed_at", receiptIsoDate())
            put("state", "draft")
        })
        return eventId
    }
    @Synchronized fun finishReprint(username: String, eventId: String, success: Boolean) {
        val args=arrayOf(owner(username),eventId)
        if(success) check(writableDatabase.update("reprints",ContentValues().apply { put("state","sent") },"owner=? AND id=? AND state='draft'",args)==1)
        else writableDatabase.delete("reprints","owner=? AND id=? AND state='draft'",args)
    }
    @Synchronized fun confirmInterruptedReprints(username: String, receiptId: String) {
        writableDatabase.update("reprints",ContentValues().apply { put("state","sent") },"owner=? AND receipt_id=? AND state='draft'",arrayOf(owner(username),receiptId))
    }
    @Synchronized fun discardInterruptedReprints(username: String, receiptId: String) {
        writableDatabase.delete("reprints","owner=? AND receipt_id=? AND state='draft'",arrayOf(owner(username),receiptId))
    }

    @Synchronized fun cacheRemote(username: String, j: JSONObject, payload: JSONObject? = null) {
        val db = writableDatabase
        db.beginTransaction()
        try {
            val existing = get(username, j.getString("id"))
            if (existing == null) {
                db.insertOrThrow("receipts", null, values(username, j).apply {
                    put("state", "sent")
                    put("synced", 1)
                    put("remote_reprints", j.optLong("reprint_count"))
                    if (payload != null) put("payload", payload.toString())
                })
            } else {
                db.execSQL("UPDATE receipts SET remote_reprints=max(remote_reprints,?) WHERE id=? AND owner=?",
                    arrayOf(j.optLong("reprint_count"), j.getString("id"), owner(username)))
                if (payload != null && existing.snapshot == null) db.update("receipts", ContentValues().apply {
                    put("payload", payload.toString())
                }, "id=? AND owner=?", arrayOf(j.getString("id"), owner(username)))
            }
            db.setTransactionSuccessful()
        } finally { db.endTransaction() }
    }

    @Synchronized fun list(username: String, month: String, query: String, limit: Int): List<ReceiptHistoryEntry> {
        val escaped = query.trim().lowercase(Locale.US).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        return readableDatabase.rawQuery("SELECT * FROM receipts WHERE owner=? AND month=? AND search LIKE ? ESCAPE '\\' ORDER BY printed_at DESC,id DESC LIMIT ?",
            arrayOf(owner(username), month, "%$escaped%", limit.toString())).use { c -> buildList { while(c.moveToNext()) add(entry(c)) } }
    }
    @Synchronized fun get(username: String, id: String): ReceiptHistoryEntry? = readableDatabase.rawQuery(
        "SELECT * FROM receipts WHERE owner=? AND id=?", arrayOf(owner(username), id)).use { if(it.moveToFirst()) entry(it) else null }

    @Synchronized fun pending(username: String): List<ReceiptSnapshot> = readableDatabase.rawQuery(
        "SELECT payload FROM receipts WHERE owner=? AND state='sent' AND synced=0 LIMIT 50", arrayOf(owner(username))).use { c ->
        buildList { while(c.moveToNext()) add(ReceiptSnapshot(JSONObject(c.getString(0)))) }
    }
    @Synchronized fun pendingReprints(username: String): List<JSONObject> = readableDatabase.rawQuery(
        "SELECT r.* FROM reprints r JOIN receipts h ON h.id=r.receipt_id WHERE r.owner=? AND r.synced=0 AND r.state='sent' AND h.synced=1 LIMIT 100", arrayOf(owner(username))).use { c ->
        buildList { while(c.moveToNext()) add(JSONObject().put("p_event_id",c.getString(c.getColumnIndexOrThrow("id")))
            .put("p_receipt_id",c.getString(c.getColumnIndexOrThrow("receipt_id"))).put("p_printed_at",c.getString(c.getColumnIndexOrThrow("printed_at")))) }
    }
    @Synchronized fun markSynced(username: String, id: String, reprint: Boolean = false) {
        val db=writableDatabase
        db.beginTransaction()
        try {
            val updated=db.update(if(reprint) "reprints" else "receipts",ContentValues().apply { put("synced",1) },"owner=? AND id=? AND synced=0",arrayOf(owner(username),id))
            if(reprint && updated==1) db.execSQL("UPDATE receipts SET remote_reprints=remote_reprints+1 WHERE owner=? AND id=(SELECT receipt_id FROM reprints WHERE id=? AND owner=?)",arrayOf(owner(username),id,owner(username)))
            db.setTransactionSuccessful()
        } finally { db.endTransaction() }
    }
    @Synchronized fun hasPending(username: String): Boolean = pending(username).isNotEmpty() || pendingReprints(username).isNotEmpty()

    private fun values(username: String, j: JSONObject) = ContentValues().apply {
        put("id",j.getString("id"))
        put("owner",owner(username))
        val printedAt = j.getString("printed_at")
        val date = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss",Locale.US).apply { timeZone=java.util.TimeZone.getTimeZone("UTC") }.parse(printedAt.take(19))!!
        put("month",receiptMonth(date))
        put("printed_at",printedAt)
        put("search",listOf(j.optString("idpel"),j.optString("customer_name"),j.optString("reference")).joinToString(" ").lowercase(Locale.US))
        put("metadata",j.toString())
    }
    private fun entry(c: Cursor): ReceiptHistoryEntry {
        fun string(name: String) = c.getString(c.getColumnIndexOrThrow(name))
        val id=string("id")
        val synced=c.getInt(c.getColumnIndexOrThrow("synced"))==1
        val remote=c.getLong(c.getColumnIndexOrThrow("remote_reprints"))
        val localCount=readableDatabase.rawQuery("SELECT count(*) FROM reprints WHERE receipt_id=? AND owner=? AND state='sent'", arrayOf(id,string("owner"))).use { it.moveToFirst(); it.getLong(0) }
        val pendingCount=readableDatabase.rawQuery("SELECT count(*) FROM reprints WHERE receipt_id=? AND owner=? AND synced=0 AND state='sent'", arrayOf(id,string("owner"))).use { it.moveToFirst(); it.getLong(0) }
        val uncertainCount=readableDatabase.rawQuery("SELECT count(*) FROM reprints WHERE receipt_id=? AND owner=? AND state='draft'", arrayOf(id,string("owner"))).use { it.moveToFirst(); it.getLong(0) }
        return ReceiptHistoryEntry(JSONObject(string("metadata")),string("payload")?.let { ReceiptSnapshot(JSONObject(it)) },synced && pendingCount==0L,
            maxOf(remote+pendingCount,localCount),string("state")=="draft",uncertainCount)
    }
}
