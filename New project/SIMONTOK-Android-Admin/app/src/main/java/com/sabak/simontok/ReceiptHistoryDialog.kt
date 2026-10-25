package com.sabak.simontok

import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

internal fun sendReceiptAndRecord(context: Context, username: String, snapshot: ReceiptSnapshot, reprint: Boolean,
    send: (String) -> Unit) {
    ReceiptHistoryStore(context).use { store ->
        if(!reprint) store.stage(username,snapshot)
        val eventId=if(reprint) store.stageReprint(username,snapshot.id) else null
        var delivered=false
        try {
            send(snapshot.text)
            delivered=true
            if(eventId!=null) store.finishReprint(username,eventId,true) else store.sent(username,snapshot)
        } catch(error: Exception) {
            if(!delivered && !reprint) store.failed(username,snapshot.id)
            if(!delivered && eventId!=null) store.finishReprint(username,eventId,false)
            if(delivered) throw IllegalStateException("Struk sudah dikirim, tetapi riwayat belum tersimpan. Jangan buat transaksi baru; periksa Riwayat Cetak.",error)
            throw error
        }
    }
    ReceiptHistorySync.schedule(context)
}

@Composable
internal fun ReceiptHistoryDialog(context: Context, username: String, printer: BluetoothReceiptPrinter,
    printerAddress: String, onDismiss: () -> Unit) {
    var month by remember { mutableStateOf(receiptMonth()) }
    var query by remember { mutableStateOf("") }
    var pageSize by remember { mutableStateOf(50) }
    var remoteTotal by remember { mutableStateOf(0) }
    var entries by remember { mutableStateOf<List<ReceiptHistoryEntry>>(emptyList()) }
    var message by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var refresh by remember { mutableStateOf(0) }
    var selected by remember { mutableStateOf<Pair<ReceiptHistoryEntry,ReceiptSnapshot>?>(null) }
    val scope=rememberCoroutineScope()

    suspend fun readLocal() {
        entries=withContext(Dispatchers.IO) { ReceiptHistoryStore(context).use { it.list(username,month,query,pageSize+1) } }
    }
    LaunchedEffect(month,query,refresh) {
        pageSize=50
        readLocal()
        busy=true
        val result=withContext(Dispatchers.IO) { runCatching { ReceiptHistorySync.loadPage(context,username,month,query,0) } }
        result.onSuccess { remoteTotal=it; message="" }.onFailure { message="Offline / server belum siap. Menampilkan riwayat yang tersimpan di HP ini." }
        readLocal()
        busy=false
    }
    Dialog(onDismissRequest={ if(!busy) onDismiss() },properties=DialogProperties(usePlatformDefaultWidth=false)) {
        Surface(Modifier.fillMaxWidth().fillMaxHeight(0.94f).padding(12.dp),shape=MaterialTheme.shapes.medium,color=Color.White) {
            Column(Modifier.padding(16.dp),verticalArrangement=Arrangement.spacedBy(8.dp)) {
                Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) {
                    Text("Riwayat Cetak",fontSize=20.sp,fontWeight=FontWeight.Bold)
                    IconButton(onClick=onDismiss,enabled=!busy) { Icon(Icons.Outlined.Close,"Tutup riwayat") }
                }
                Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) {
                    IconButton(onClick={ month=shiftReceiptMonth(month,-1) },enabled=!busy) { Icon(Icons.Outlined.ChevronLeft,"Bulan sebelumnya") }
                    Text(month,modifier=Modifier.padding(top=14.dp),fontWeight=FontWeight.Bold)
                    IconButton(onClick={ month=shiftReceiptMonth(month,1) },enabled=!busy) { Icon(Icons.Outlined.ChevronRight,"Bulan berikutnya") }
                    IconButton(onClick={ refresh++ },enabled=!busy) { Icon(Icons.Outlined.Refresh,"Sinkronkan riwayat") }
                }
                OutlinedTextField(value=query,onValueChange={ query=it },label={Text("IDPEL, nama, atau referensi")},singleLine=true,modifier=Modifier.fillMaxWidth())
                if(busy) LinearProgressIndicator(Modifier.fillMaxWidth(),color=Color(0xFF087E8B))
                if(message.isNotEmpty()) Text(message,fontSize=12.sp)
                if(entries.isEmpty() && !busy) Text("Belum ada riwayat pada bulan ini.",modifier=Modifier.padding(16.dp))
                LazyColumn(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(8.dp)) {
                    items(entries.take(pageSize),key={it.id}) { entry ->
                        OutlinedCard(onClick={
                            if(!busy) scope.launch {
                                busy=true
                                val result=withContext(Dispatchers.IO) { runCatching { ReceiptHistorySync.snapshot(context,username,entry) } }
                                result.onSuccess { selected=entry to it }.onFailure { message="Struk belum tersimpan di HP ini. Sambungkan internet untuk mengunduhnya." }
                                busy=false
                            }
                        },modifier=Modifier.fillMaxWidth(),shape=RoundedCornerShape(8.dp),colors=CardDefaults.outlinedCardColors(containerColor=Color.White)) {
                            Column(Modifier.padding(12.dp),verticalArrangement=Arrangement.spacedBy(4.dp)) {
                                Text(entry.metadata.optString("customer_name"),fontWeight=FontWeight.Bold)
                                Text(entry.metadata.optString("idpel"),fontSize=13.sp)
                                Text(receiptDisplayTime(entry.metadata.getString("printed_at")),fontSize=12.sp)
                                Text("Total ${formatRupiah(entry.metadata.optDouble("total_amount"))}  |  Tambahan ${formatRupiah(entry.metadata.optDouble("extra_amount"))}",fontSize=12.sp)
                                Text(if(entry.uncertain || entry.uncertainReprints>0) "Hasil cetak belum pasti: perlu diperiksa" else "Cetak ulang ${entry.reprintCount} kali - ${if(entry.synced) "Tersinkron" else "Menunggu sinkronisasi"}",fontSize=11.sp)
                            }
                        }
                    }
                    if(entries.size>pageSize || remoteTotal>pageSize) item {
                        TextButton(onClick={ scope.launch {
                            busy=true
                            val offset=pageSize
                            pageSize+=50
                            withContext(Dispatchers.IO) { runCatching { ReceiptHistorySync.loadPage(context,username,month,query,offset) } }
                                .onSuccess { remoteTotal=it }.onFailure { message="Menampilkan data lokal. Sinkronisasi belum tersedia." }
                            readLocal()
                            busy=false
                        } },enabled=!busy) { Text("Muat lagi") }
                    }
                }
            }
        }
    }
    selected?.let { (entry,snapshot) ->
        Dialog(onDismissRequest={if(!busy) selected=null},properties=DialogProperties(usePlatformDefaultWidth=false)) {
            Surface(Modifier.fillMaxWidth().fillMaxHeight(0.9f).padding(12.dp),shape=MaterialTheme.shapes.medium,color=Color.White) {
                Column(Modifier.padding(16.dp),verticalArrangement=Arrangement.spacedBy(8.dp)) {
                    Text("Struk Asli",fontWeight=FontWeight.Bold,fontSize=18.sp)
                    Text(snapshot.text,fontFamily=FontFamily.Monospace,fontSize=11.sp,lineHeight=15.sp,
                        modifier=Modifier.weight(1f).verticalScroll(rememberScrollState()))
                    if(entry.uncertain || entry.uncertainReprints>0) Text("Aplikasi tertutup sebelum hasil pengiriman tercatat. Periksa struk terlebih dahulu.",fontSize=12.sp)
                    Button(onClick={ scope.launch {
                        busy=true
                        val result=withContext(Dispatchers.IO) { runCatching {
                            if(entry.uncertain) {
                                ReceiptHistoryStore(context).use { it.sent(username,snapshot) }
                                ReceiptHistorySync.schedule(context)
                            } else if(entry.uncertainReprints>0) {
                                ReceiptHistoryStore(context).use { it.confirmInterruptedReprints(username,snapshot.id) }
                                ReceiptHistorySync.schedule(context)
                            } else sendReceiptAndRecord(context,username,snapshot,true) { printer.print(printerAddress,it) }
                        } }
                        message=result.fold({if(entry.uncertain) "Riwayat dikonfirmasi dan menunggu sinkronisasi." else "Struk asli berhasil dikirim ulang ke printer."},{it.message ?: "Gagal mencetak ulang."})
                        selected=null
                        readLocal()
                        busy=false
                    } },enabled=!busy,modifier=Modifier.fillMaxWidth(),colors=ButtonDefaults.buttonColors(containerColor=Color(0xFF087E8B))) { Text(if(entry.uncertain || entry.uncertainReprints>0) "Konfirmasi Sudah Tercetak" else "Cetak Ulang") }
                    if(entry.uncertain || entry.uncertainReprints>0) TextButton(onClick={ scope.launch {
                        busy=true
                        withContext(Dispatchers.IO) { ReceiptHistoryStore(context).use {
                            if(entry.uncertain) it.failed(username,entry.id) else it.discardInterruptedReprints(username,entry.id)
                        } }
                        selected=null
                        readLocal()
                        message="Cetak yang belum selesai dibatalkan. Tidak dihitung sebagai pendapatan atau cetak ulang."
                        busy=false
                    } },enabled=!busy,modifier=Modifier.fillMaxWidth()) { Text("Tidak Tercetak") }
                    OutlinedButton(onClick={selected=null},enabled=!busy,modifier=Modifier.fillMaxWidth(),colors=ButtonDefaults.outlinedButtonColors(contentColor=Color(0xFF087E8B))) { Text("Tutup") }
                }
            }
        }
    }
}

internal fun shiftReceiptMonth(month: String, shift: Int): String {
    val calendar=Calendar.getInstance(TimeZone.getTimeZone("Asia/Jakarta"))
    calendar.time=SimpleDateFormat("yyyy-MM-dd",Locale.US).apply { timeZone=calendar.timeZone }.parse("$month-01")!!
    calendar.add(Calendar.MONTH,shift)
    return receiptMonth(calendar.time)
}

internal fun receiptDisplayTime(value: String): String = runCatching {
    val date=SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss",Locale.US).apply { timeZone=TimeZone.getTimeZone("UTC") }.parse(value.take(19))!!
    SimpleDateFormat("dd MMM yyyy HH:mm:ss",Locale("id","ID")).apply { timeZone=TimeZone.getTimeZone("Asia/Jakarta") }.format(date)
}.getOrDefault(value)
