package com.sabak.simontok

import android.app.job.JobScheduler
import androidx.activity.ComponentActivity
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import android.graphics.Bitmap
import java.io.File
import java.util.Date
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test

class ReceiptHistoryTest {
    @get:Rule val compose=createAndroidComposeRule<ComponentActivity>()
    private val context get()=InstrumentationRegistry.getInstrumentation().targetContext
    private val username="14390.TEST_HISTORY"
    private fun snapshot()=ReceiptSnapshot.create(ReceiptIdentity(),
        CustomerDebt("TEST","00143900001","PELANGGAN UJI","R1","1300","ALAMAT",1,"A","1",100000.0),
        ReceiptMeter("00143900001","100","200"),ReceiptSettings("TOKO UJI","ULP SABAK",5000.0),5000)
    @Before fun clean() {
        context.getSystemService(JobScheduler::class.java).cancel(17401)
        context.deleteDatabase("receipt_history.db")
    }
    @Test fun successAndReprintKeepExactTextAndOneOriginal() {
        val original=snapshot()
        var printed=""
        sendReceiptAndRecord(context,username,original,false) { printed=it }
        val saved=ReceiptHistoryStore(context).use { it.get(username,original.id)!! }
        assertEquals(original.text,printed)
        assertEquals(original.text,saved.snapshot!!.text)
        sendReceiptAndRecord(context,username,saved.snapshot!!,true) { assertEquals(printed,it) }
        ReceiptHistoryStore(context).use {
            val rows=it.list(username,receiptMonth(),"",50)
            assertEquals(1,rows.size)
            assertEquals(1L,rows.first().reprintCount)
            assertEquals(5000L,rows.first().snapshot!!.json.getLong("extra_amount"))
            assertEquals(1,it.pending(username).size)
            assertTrue(it.list("OTHER",receiptMonth(),"",50).isEmpty())
            it.markSynced(username,original.id)
            val event=it.pendingReprints(username).single()
            it.markSynced(username,event.getString("p_event_id"),true)
            it.markSynced(username,event.getString("p_event_id"),true)
            assertEquals(1L,it.get(username,original.id)!!.reprintCount)
            assertFalse(it.hasPending(username))
        }
    }
    @Test fun failedPrinterDoesNotAddRevenueOrOriginal() {
        runCatching { sendReceiptAndRecord(context,username,snapshot(),false) { error("printer offline") } }
        ReceiptHistoryStore(context).use {
            assertTrue(it.list(username,receiptMonth(),"",50).isEmpty())
            assertTrue(it.pending(username).isEmpty())
        }
    }
    @Test fun retriesAfterLostServerAcknowledgementReuseIdsAndNeverDoubleIncome() {
        val original=snapshot()
        sendReceiptAndRecord(context,username,original,false) {}
        val originals=mutableSetOf<String>()
        val reprints=mutableSetOf<String>()
        var loseReply=true
        val upload: (String,JSONObject)->Unit={name,payload ->
            if(name=="save_receipt_history") originals.add(payload.getJSONObject("p_snapshot").getString("id"))
            else reprints.add(payload.getString("p_event_id"))
            if(loseReply) {loseReply=false;throw java.io.IOException("server reply lost")}
        }
        runCatching { ReceiptHistorySync.sync(context,username,upload) }
        ReceiptHistoryStore(context).use { assertEquals(1,it.pending(username).size) }
        ReceiptHistorySync.sync(context,username,upload)
        ReceiptHistorySync.sync(context,username,upload)
        sendReceiptAndRecord(context,username,original,true) {}
        loseReply=true
        runCatching { ReceiptHistorySync.sync(context,username,upload) }
        ReceiptHistorySync.sync(context,username,upload)
        ReceiptHistorySync.sync(context,username,upload)
        assertEquals(1,originals.size)
        assertEquals(1,reprints.size)
        ReceiptHistoryStore(context).use { assertFalse(it.hasPending(username));assertEquals(1L,it.get(username,original.id)!!.reprintCount) }
    }
    @Test fun failedReprintDoesNotIncrementCounter() {
        val original=snapshot()
        sendReceiptAndRecord(context,username,original,false) {}
        runCatching { sendReceiptAndRecord(context,username,original,true) {error("printer offline")} }
        ReceiptHistoryStore(context).use { assertEquals(0L,it.get(username,original.id)!!.reprintCount) }
    }
    @Test fun interruptedReprintWaitsForConfirmationAndKeepsOneOriginal() {
        val original=snapshot()
        sendReceiptAndRecord(context,username,original,false) {}
        ReceiptHistoryStore(context).use { it.stageReprint(username,original.id);it.markSynced(username,original.id) }
        ReceiptHistoryStore(context).use {
            assertEquals(1L,it.get(username,original.id)!!.uncertainReprints)
            assertEquals(0L,it.get(username,original.id)!!.reprintCount)
            assertTrue(it.pendingReprints(username).isEmpty())
            it.confirmInterruptedReprints(username,original.id)
            assertEquals(1L,it.get(username,original.id)!!.reprintCount)
            assertEquals(1,it.pendingReprints(username).size)
        }
    }
    @Test fun interruptedPrintIsNotSyncedAsSuccessful() {
        val original=snapshot()
        ReceiptHistoryStore(context).use { it.stage(username,original) }
        ReceiptHistoryStore(context).use {
            assertTrue(it.get(username,original.id)!!.uncertain)
            assertTrue(it.pending(username).isEmpty())
            it.sent(username,original)
            assertFalse(it.get(username,original.id)!!.uncertain)
            assertEquals(1,it.pending(username).size)
        }
    }
    @Test fun remoteCountsAndOfflineReprintMergeWithoutLosingAcknowledgedEvent() {
        val original=snapshot()
        val metadata=JSONObject(original.json.toString()).put("reprint_count",5)
        ReceiptHistoryStore(context).use { it.cacheRemote(username,metadata,original.json) }
        sendReceiptAndRecord(context,username,original,true) {}
        ReceiptHistoryStore(context).use {
            assertEquals(6L,it.get(username,original.id)!!.reprintCount)
            val event=it.pendingReprints(username).single()
            it.markSynced(username,event.getString("p_event_id"),true)
            assertEquals(6L,it.get(username,original.id)!!.reprintCount)
            it.cacheRemote(username,metadata)
            assertEquals(6L,it.get(username,original.id)!!.reprintCount)
        }
    }
    @Test fun historyUiShowsOfflineSnapshotAndDetailWithoutRegeneration() {
        val original=snapshot()
        sendReceiptAndRecord(context,username,original,false) {}
        compose.setContent { MaterialTheme { ReceiptHistoryDialog(context,username,BluetoothReceiptPrinter(context),"",{}) } }
        compose.waitUntil(10_000) { compose.onAllNodesWithText("PELANGGAN UJI").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("PELANGGAN UJI").assertIsDisplayed()
        save("receipt-history.png")
        compose.onNodeWithText("PELANGGAN UJI").performClick()
        compose.onNodeWithText("Struk Asli").assertIsDisplayed()
        compose.onNodeWithText(original.text).assertExists()
        compose.onNodeWithText("Cetak Ulang").assertIsDisplayed()
        save("receipt-history-detail.png")
    }
    private fun save(name:String) {
        val node=compose.onNode(isDialog() and hasAnyDescendant(hasText(if(name.contains("detail")) "Struk Asli" else "Riwayat Cetak")))
        val bitmap=node.captureToImage().asAndroidBitmap()
        File(context.getExternalFilesDir(null),name).outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG,100,it) }
    }
}
