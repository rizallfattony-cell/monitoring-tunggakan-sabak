package com.sabak.simontok

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.style.TextOverflow
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
internal fun ReceiptHistoryScreen(
    modifier: Modifier = Modifier,
    context: Context,
    username: String,
    printer: BluetoothReceiptPrinter,
    printerAddress: String
) {
    val deepTeal = Color(0xFF004D56)
    val canvas = Color(0xFFE8EEF3)
    val ink = Color(0xFF090D16)
    val muted = Color(0xFF334155)
    var month by remember { mutableStateOf(receiptMonth()) }
    var query by remember { mutableStateOf("") }
    var pageSize by remember { mutableStateOf(50) }
    var remoteTotal by remember { mutableStateOf(0) }
    var entries by remember { mutableStateOf<List<ReceiptHistoryEntry>>(emptyList()) }
    var message by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var refresh by remember { mutableStateOf(0) }
    var selected by remember { mutableStateOf<Pair<ReceiptHistoryEntry, ReceiptSnapshot>?>(null) }
    val scope = rememberCoroutineScope()

    suspend fun readLocal() {
        entries = withContext(Dispatchers.IO) { ReceiptHistoryStore(context).use { it.list(username, month, query, pageSize + 1) } }
    }
    suspend fun openEntry(entry: ReceiptHistoryEntry) {
        busy = true
        val result = withContext(Dispatchers.IO) { runCatching { ReceiptHistorySync.snapshot(context, username, entry) } }
        result.onSuccess { selected = entry to it }
            .onFailure { message = "Struk belum tersimpan di HP ini. Sambungkan internet untuk mengunduhnya." }
        busy = false
    }
    LaunchedEffect(month, query, refresh) {
        pageSize = 50
        readLocal()
        busy = true
        val result = withContext(Dispatchers.IO) { runCatching { ReceiptHistorySync.loadPage(context, username, month, query, 0) } }
        result.onSuccess { remoteTotal = it; message = "" }
            .onFailure { message = "Offline / server belum siap. Menampilkan riwayat yang tersimpan di HP ini." }
        readLocal()
        busy = false
    }

    val visibleEntries = entries.take(pageSize)
    val totalAmount = visibleEntries.sumOf { it.metadata.optDouble("total_amount") }
    Column(modifier.fillMaxSize().background(canvas)) {
        Row(
            Modifier.fillMaxWidth().background(deepTeal).border(2.dp, ink).padding(horizontal = 16.dp, vertical = 13.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(Modifier.weight(1f)) {
                Text("Riwayat Cetak", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Black)
                Text("Struk asli dan cetak ulang", color = Color(0xFFCCFBF1), fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }
            Box(
                Modifier.background(Color.White, RoundedCornerShape(8.dp)).border(2.dp, ink, RoundedCornerShape(8.dp)).padding(horizontal = 9.dp, vertical = 6.dp)
            ) { Text(month.uppercase(), color = ink, fontSize = 10.sp, fontWeight = FontWeight.Black) }
        }
        Column(Modifier.weight(1f).fillMaxWidth().padding(horizontal = 14.dp, vertical = 13.dp), verticalArrangement = Arrangement.spacedBy(11.dp)) {
            Row(
                Modifier.fillMaxWidth().height(72.dp).background(Color.White, RoundedCornerShape(14.dp)).border(2.dp, ink, RoundedCornerShape(14.dp))
            ) {
                Column(Modifier.weight(5f).fillMaxHeight().padding(11.dp), verticalArrangement = Arrangement.Center) {
                    Text("STRUK BULAN INI", color = muted, fontSize = 9.sp, fontWeight = FontWeight.Black)
                    Text("${visibleEntries.size} Struk", color = ink, fontSize = 19.sp, fontWeight = FontWeight.Black)
                }
                Box(Modifier.width(2.dp).fillMaxHeight().background(Color(0xFFCBD5E1)))
                Column(Modifier.weight(7f).fillMaxHeight().background(Color(0xFFF8FAFC)).padding(11.dp), verticalArrangement = Arrangement.Center) {
                    Text("TOTAL TERCETAK", color = muted, fontSize = 9.sp, fontWeight = FontWeight.Black)
                    Text(formatRupiah(totalAmount), color = deepTeal, fontSize = 17.sp, fontWeight = FontWeight.Black)
                }
            }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                IconButton(onClick = { month = shiftReceiptMonth(month, -1) }, enabled = !busy) { Icon(Icons.Outlined.ChevronLeft, "Bulan sebelumnya", tint = ink) }
                Text(month, color = ink, fontSize = 12.sp, fontWeight = FontWeight.Black)
                IconButton(onClick = { month = shiftReceiptMonth(month, 1) }, enabled = !busy) { Icon(Icons.Outlined.ChevronRight, "Bulan berikutnya", tint = ink) }
                IconButton(onClick = { refresh++ }, enabled = !busy) { Icon(Icons.Outlined.Refresh, "Sinkronkan riwayat", tint = deepTeal) }
            }
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                placeholder = { Text("Cari IDPEL / Nama Pelanggan di riwayat...", fontSize = 12.sp, color = Color(0xFF475569)) },
                leadingIcon = { Icon(Icons.Outlined.Search, null, tint = ink) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().height(52.dp),
                shape = RoundedCornerShape(11.dp),
                colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = ink, unfocusedBorderColor = ink, focusedContainerColor = Color.White, unfocusedContainerColor = Color.White)
            )
            if (busy) LinearProgressIndicator(Modifier.fillMaxWidth(), color = deepTeal, trackColor = Color.White)
            if (message.isNotEmpty()) Text(message, color = muted, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            if (visibleEntries.isEmpty() && !busy) {
                Box(Modifier.fillMaxWidth().background(Color.White, RoundedCornerShape(14.dp)).border(2.dp, ink, RoundedCornerShape(14.dp)).padding(24.dp), contentAlignment = Alignment.Center) {
                    Text("Belum ada riwayat pada bulan ini.", color = muted, fontWeight = FontWeight.Bold)
                }
            }
            LazyColumn(Modifier.weight(1f).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(11.dp)) {
                items(visibleEntries, key = { it.id }) { entry ->
                    val uncertain = entry.uncertain || entry.uncertainReprints > 0
                    Column(
                        Modifier.fillMaxWidth().background(Color.White, RoundedCornerShape(14.dp)).border(2.dp, ink, RoundedCornerShape(14.dp)).padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Row(verticalAlignment = Alignment.Top) {
                            Column(Modifier.weight(1f)) {
                                Text(entry.metadata.optString("customer_name"), color = ink, fontSize = 14.sp, fontWeight = FontWeight.Black, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(entry.metadata.optString("idpel"), color = muted, fontSize = 12.sp, fontWeight = FontWeight.Black)
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Box(Modifier.background(if (uncertain) Color(0xFFFEF3C7) else Color(0xFFDCFCE7), RoundedCornerShape(5.dp)).border(1.dp, if (uncertain) Color(0xFFB45309) else Color(0xFF15803D), RoundedCornerShape(5.dp)).padding(horizontal = 7.dp, vertical = 2.dp)) {
                                    Text(if (uncertain) "PERLU DIPERIKSA" else "STRUK ASLI", color = if (uncertain) Color(0xFF78350F) else Color(0xFF14532D), fontSize = 8.sp, fontWeight = FontWeight.Black)
                                }
                                Text(formatRupiah(entry.metadata.optDouble("total_amount")), color = deepTeal, fontSize = 16.sp, fontWeight = FontWeight.Black)
                            }
                        }
                        Row(Modifier.fillMaxWidth().background(Color(0xFFF1F5F9), RoundedCornerShape(10.dp)).border(2.dp, Color(0xFF94A3B8), RoundedCornerShape(10.dp)).padding(9.dp)) {
                            Column(Modifier.weight(1f)) {
                                Text("WAKTU CETAK", color = Color(0xFF475569), fontSize = 8.sp, fontWeight = FontWeight.Black)
                                Text(receiptDisplayTime(entry.metadata.optString("printed_at")), color = ink, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text("CETAK ULANG", color = Color(0xFF475569), fontSize = 8.sp, fontWeight = FontWeight.Black)
                                Text("${entry.reprintCount} kali", color = ink, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                        Row(
                            Modifier.fillMaxWidth().height(48.dp).background(Color(0xFF005F6B), RoundedCornerShape(11.dp)).border(2.dp, ink, RoundedCornerShape(11.dp)).clickable(enabled = !busy) { scope.launch { openEntry(entry) } },
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Outlined.Print, null, tint = Color.White, modifier = Modifier.size(19.dp))
                            Spacer(Modifier.width(7.dp))
                            Text(if (uncertain) "Periksa Struk" else "Cetak Ulang", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Black)
                        }
                    }
                }
                if (entries.size > pageSize || remoteTotal > pageSize) item {
                    Button(onClick = { scope.launch {
                        busy = true
                        val offset = pageSize
                        pageSize += 50
                        withContext(Dispatchers.IO) { runCatching { ReceiptHistorySync.loadPage(context, username, month, query, offset) } }
                            .onSuccess { remoteTotal = it }.onFailure { message = "Menampilkan data lokal. Sinkronisasi belum tersedia." }
                        readLocal()
                        busy = false
                    } }, enabled = !busy, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = deepTeal)) { Text("Muat lagi", fontWeight = FontWeight.Black) }
                }
            }
        }
    }

    selected?.let { (entry, snapshot) ->
        HistorySnapshotDialog(
            entry = entry,
            snapshot = snapshot,
            busy = busy,
            onDismiss = { selected = null },
            onAction = { scope.launch {
                busy = true
                val result = withContext(Dispatchers.IO) { runCatching {
                    if (entry.uncertain) {
                        ReceiptHistoryStore(context).use { it.sent(username, snapshot) }
                        ReceiptHistorySync.schedule(context)
                    } else if (entry.uncertainReprints > 0) {
                        ReceiptHistoryStore(context).use { it.confirmInterruptedReprints(username, snapshot.id) }
                        ReceiptHistorySync.schedule(context)
                    } else sendReceiptAndRecord(context, username, snapshot, true) { printer.print(printerAddress, it) }
                } }
                message = result.fold({ if (entry.uncertain) "Riwayat dikonfirmasi dan menunggu sinkronisasi." else "Struk asli berhasil dikirim ulang ke printer." }, { it.message ?: "Gagal mencetak ulang." })
                selected = null
                readLocal()
                busy = false
            } }
        )
    }
}

@Composable
private fun HistorySnapshotDialog(
    entry: ReceiptHistoryEntry,
    snapshot: ReceiptSnapshot,
    busy: Boolean,
    onDismiss: () -> Unit,
    onAction: () -> Unit
) {
    Dialog(onDismissRequest = { if (!busy) onDismiss() }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxWidth().fillMaxHeight(0.92f).padding(8.dp).border(2.dp, Color(0xFF090D16), RoundedCornerShape(14.dp)), shape = RoundedCornerShape(14.dp), color = Color(0xFFE8EEF3)) {
            Column {
                Row(Modifier.fillMaxWidth().background(Color(0xFF004D56)).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Struk Asli", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Black)
                        Text(entry.metadata.optString("idpel"), color = Color(0xFFCCFBF1), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                    IconButton(onClick = onDismiss, enabled = !busy) { Icon(Icons.Outlined.Close, "Tutup", tint = Color.White) }
                }
                Text(snapshot.text, fontFamily = FontFamily.Monospace, fontSize = 11.sp, lineHeight = 15.sp, color = Color(0xFF090D16), modifier = Modifier.weight(1f).fillMaxWidth().padding(14.dp).background(Color.White).border(2.dp, Color(0xFF64748B)).padding(12.dp).verticalScroll(rememberScrollState()))
                Button(onClick = onAction, enabled = !busy, modifier = Modifier.fillMaxWidth().height(54.dp).padding(horizontal = 12.dp, vertical = 5.dp), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF004D56))) {
                    Text(if (entry.uncertain || entry.uncertainReprints > 0) "Konfirmasi Sudah Tercetak" else "Cetak Ulang", fontWeight = FontWeight.Black)
                }
            }
        }
    }
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
