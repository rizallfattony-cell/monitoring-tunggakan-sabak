package com.sabak.simontok

import android.content.Intent
import android.content.Context
import android.net.Uri
import android.os.SystemClock
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.ViewModelProvider
import java.io.IOException
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

internal class BillingSessionExpired : IOException("Sesi pembayaran perlu diperbarui.")

private val BillingBlue = Color(0xFF0069E8)
private val BillingInk = Color(0xFF102443)
private val BillingMuted = Color(0xFF5B6C85)

@Composable
internal fun PremiumBillingGate(
    username: String,
    accessToken: String,
    api: SupabaseApi,
    freshSession: () -> UserSession,
    onLogout: () -> Unit,
    fetchStatus: (String) -> PremiumBillingStatus = api::fetchPremiumBillingStatus,
    content: @Composable () -> Unit
) {
    val context = LocalContext.current
    val store = remember { PremiumBillingStore(context.applicationContext) }
    val lifecycle = (context as ComponentActivity).lifecycle
    val token by rememberUpdatedState(accessToken)
    val refreshSession by rememberUpdatedState(freshSession)
    val statusLoader by rememberUpdatedState(fetchStatus)
    val bootCount = remember { store.bootCount() }
    val reminder = remember(username) {
        ViewModelProvider(context)[PremiumBillingReminderModel::class.java].forUser(username)
    }
    var lease by remember(username) { mutableStateOf(store.read(username)) }
    var nowElapsed by remember { mutableStateOf(SystemClock.elapsedRealtime()) }
    var request by remember(username) { mutableStateOf(0) }
    var checking by remember(username) { mutableStateOf(false) }
    var error by remember(username) { mutableStateOf<String?>(null) }
    var showReminder by remember(username) { mutableStateOf(false) }
    var showAccounts by remember(username) { mutableStateOf(false) }

    DisposableEffect(lifecycle, username) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                nowElapsed = SystemClock.elapsedRealtime()
                if (!checking) request += 1
            }
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }

    LaunchedEffect(username, request) {
        checking = true
        error = null
        val startedAt = SystemClock.elapsedRealtime()
        val result = withContext(Dispatchers.IO) {
            runCatching {
                try {
                    statusLoader(token)
                } catch (_: BillingSessionExpired) {
                    statusLoader(refreshSession().accessToken)
                }
            }
        }
        result.onSuccess { status ->
            val next = PremiumBillingLease(status, startedAt, bootCount)
            store.save(username, next)
            lease = next
        }.onFailure {
            error = "Belum dapat memeriksa pembayaran. Periksa koneksi lalu coba lagi."
        }
        nowElapsed = SystemClock.elapsedRealtime()
        checking = false
    }

    // Monotonic time prevents changing the phone clock from extending an access lease.
    LaunchedEffect(lease) {
        val current = lease ?: return@LaunchedEffect
        if (current.isFresh(SystemClock.elapsedRealtime(), bootCount)) {
            delay(current.remainingMillis(SystemClock.elapsedRealtime()).coerceAtLeast(1))
            nowElapsed = SystemClock.elapsedRealtime()
            request += 1
        }
    }

    LaunchedEffect(username) {
        while (true) {
            delay(5 * 60_000L)
            if (lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED) && !checking) request += 1
        }
    }

    val current = lease
    val blocked = current?.status?.accessBlocked == true
    val fresh = current?.isFresh(nowElapsed, bootCount) == true
    val reminderEligible = fresh && current?.status?.shouldRemind == true && !blocked
    LaunchedEffect(current?.status?.shouldRemind) {
        if (current?.status?.shouldRemind != true) {
            showReminder = false
            showAccounts = false
        }
    }
    val dismissReminder = {
        reminder.recordInteraction(SystemClock.elapsedRealtime())
        showReminder = false
    }
    LaunchedEffect(username, reminderEligible) {
        while (reminderEligible) {
            val now = SystemClock.elapsedRealtime()
            if (lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED) && !showReminder && !showAccounts && reminder.isDue(now)) {
                reminder.recordInteraction(now)
                showReminder = true
            }
            delay(30_000)
        }
    }
    BackHandler(enabled = blocked || !fresh) { }
    val retry = { if (!checking) request += 1 }
    val confirm = {
        val status = current?.status
        val period = status?.billingMonth?.let(::billingMonthLabel).orEmpty()
        val amount = status?.amount?.let(::billingRupiah).orEmpty()
        dismissReminder()
        showAccounts = false
        val message = "Halo Admin, saya $username ingin konfirmasi pembayaran ${premiumPackageLabel(status?.packageCode.orEmpty())} bulan $period sebesar $amount. Mohon pengecekan pembayaran saya."
        openPremiumAdmin(context, message)
        Unit
    }

    if (blocked) {
        BillingGateBackground {
            PremiumBillingNotice(
                status = current!!.status, error = error,
                onPay = { showAccounts = true }, onConfirm = confirm, onLogout = onLogout
            )
        }
    } else if (!fresh) {
        BillingGateBackground {
            Card(shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
                Column(Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    if (checking) CircularProgressIndicator(color = BillingBlue)
                    Text(if (checking) "Memeriksa pembayaran" else "Verifikasi pembayaran diperlukan", color = BillingInk, fontSize = 21.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
                    Text(error ?: "Hubungkan internet untuk memeriksa status pembayaran terbaru.", color = BillingMuted, textAlign = TextAlign.Center)
                    Button(onClick = retry, enabled = !checking, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = BillingBlue)) { Text("Coba lagi") }
                    TextButton(onClick = onLogout, colors = ButtonDefaults.textButtonColors(contentColor = BillingBlue)) { Text("Keluar akun") }
                }
            }
        }
    } else {
        content()
        if (current!!.status.shouldRemind && showReminder) {
            Dialog(
                onDismissRequest = dismissReminder,
                properties = DialogProperties(usePlatformDefaultWidth = false)
            ) {
                Box(Modifier.fillMaxWidth().padding(20.dp).widthIn(max = 440.dp)) {
                    PremiumBillingNotice(
                        status = current.status, error = error,
                        onClose = dismissReminder,
                        onPay = { showAccounts = true }, onConfirm = confirm
                    )
                }
            }
        }
    }
    if (showAccounts && current?.status?.shouldRemind == true) {
        PremiumPaymentAccountsDialog(onDismiss = { showAccounts = false }, onConfirm = confirm)
    }
}

@Composable
private fun BillingGateBackground(content: @Composable () -> Unit) {
    Box(Modifier.fillMaxSize().background(Color(0xFF14365F)).padding(20.dp), contentAlignment = Alignment.Center) {
        Box(Modifier.widthIn(max = 440.dp).fillMaxWidth()) { content() }
    }
}

@Composable
internal fun PremiumBillingNotice(
    status: PremiumBillingStatus,
    error: String? = null,
    onClose: (() -> Unit)? = null,
    onPay: () -> Unit,
    onConfirm: () -> Unit,
    onLogout: (() -> Unit)? = null
) {
    Card(shape = RoundedCornerShape(24.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(22.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Box(Modifier.fillMaxWidth()) {
                Icon(
                    if (status.accessBlocked) Icons.Outlined.Lock else Icons.Outlined.NotificationsActive,
                    contentDescription = null,
                    tint = BillingBlue,
                    modifier = Modifier.align(Alignment.Center).size(68.dp).background(Color(0xFFEAF5FF), CircleShape).padding(16.dp)
                )
                if (onClose != null && !status.accessBlocked) {
                    IconButton(onClick = onClose, modifier = Modifier.align(Alignment.TopEnd)) {
                        Icon(Icons.Outlined.Close, contentDescription = "Tutup pengingat", tint = BillingMuted)
                    }
                }
            }
            Text(if (status.accessBlocked) "Akses Ditangguhkan" else "Pengingat Tagihan", color = BillingInk, fontSize = 25.sp, fontWeight = FontWeight.ExtraBold, textAlign = TextAlign.Center)
            Text("Tagihan ${billingMonthLabel(status.billingMonth)}", color = BillingMuted, fontSize = 15.sp, textAlign = TextAlign.Center)
            Text(billingRupiah(status.amount), color = BillingBlue, fontSize = 38.sp, fontWeight = FontWeight.ExtraBold, textAlign = TextAlign.Center)
            Text(premiumPackageLabel(status.packageCode), color = BillingMuted, fontSize = 13.sp, textAlign = TextAlign.Center)

            Row(
                Modifier.fillMaxWidth().background(Color(0xFFEBF7FF), RoundedCornerShape(8.dp)).padding(14.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Outlined.CalendarMonth, contentDescription = null, tint = BillingBlue, modifier = Modifier.size(30.dp))
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Periode Pembayaran", color = BillingInk, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    Text("Tanggal 20 hingga ${billingDateLabel(status.dueEnd)}", color = BillingInk, fontSize = 13.sp)
                    Text("Berlaku setiap bulan", color = BillingMuted, fontSize = 12.sp)
                }
            }

            Text(
                if (status.accessBlocked) "Fitur aplikasi tidak dapat digunakan sampai pembayaran dikonfirmasi admin."
                else "Segera lakukan pembayaran dan konfirmasi ke admin. Akses dikunci mulai ${billingDateLabel(status.lockStart)} jika belum dibayar.",
                color = BillingInk, fontSize = 14.sp, textAlign = TextAlign.Center
            )
            Text("Pembayaran dan bukti bayar dikonfirmasi secara manual kepada admin.", color = BillingMuted, fontSize = 12.sp, textAlign = TextAlign.Center)
            if (error != null) Text(error, color = MaterialTheme.colorScheme.error, fontSize = 12.sp, textAlign = TextAlign.Center)

            Button(
                onClick = onPay, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(8.dp),
                colors = ButtonDefaults.buttonColors(containerColor = BillingBlue)
            ) { Text("BAYAR", modifier = Modifier.padding(vertical = 5.dp), fontWeight = FontWeight.Bold) }
            OutlinedButton(onClick = onConfirm, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(8.dp), colors = ButtonDefaults.outlinedButtonColors(contentColor = BillingBlue)) { Text("Konfirmasi ke Admin") }
            if (onLogout != null) TextButton(onClick = onLogout, colors = ButtonDefaults.textButtonColors(contentColor = BillingBlue)) { Text("Keluar akun") }
            Text("Terima kasih atas pembayaran tepat waktu.", color = BillingMuted, fontSize = 11.sp, textAlign = TextAlign.Center)
            Spacer(Modifier.height(1.dp))
        }
    }
}

internal fun billingRupiah(amount: Long): String = NumberFormat.getCurrencyInstance(Locale("id", "ID")).apply {
    maximumFractionDigits = 0
}.format(amount)

internal fun billingMonthLabel(value: String): String = billingFormattedDate(value, "MMMM yyyy")
internal fun billingDateLabel(value: String): String = billingFormattedDate(value, "d MMMM yyyy")

private fun billingFormattedDate(value: String, pattern: String): String = runCatching {
    val zone = TimeZone.getTimeZone("Asia/Jakarta")
    val parser = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { isLenient = false; timeZone = zone }
    val date = parser.parse(value) ?: return@runCatching value
    SimpleDateFormat(pattern, Locale("id", "ID")).apply { timeZone = zone }.format(date)
}.getOrDefault(value)

internal fun openPremiumAdmin(context: Context, message: String) {
    val uri = Uri.parse("https://wa.me/6285783042643?text=${Uri.encode(message)}")
    runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, uri)) }.onFailure {
        Toast.makeText(context, "WhatsApp atau browser tidak tersedia.", Toast.LENGTH_LONG).show()
    }
}
