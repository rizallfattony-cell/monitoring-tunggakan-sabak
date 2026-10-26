package com.sabak.simontok

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog

@Composable
internal fun PremiumAccessInfoDialog(username: String, currentStatus: PremiumStatus, statusError: String? = null, onDismiss: () -> Unit) {
    val context = LocalContext.current
    var showAccounts by remember { mutableStateOf(false) }
    Dialog(onDismissRequest = onDismiss) {
        Card(shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
            Column(Modifier.verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Premium SIMONTOK", fontSize = 21.sp, fontWeight = FontWeight.Bold)
                Text(when {
                    currentStatus.isActive() -> "${premiumPackageLabel(currentStatus.packageCode)} aktif sampai ${billingDateLabel(currentStatus.activeUntil.orEmpty())}"
                    currentStatus.hasActivePeriod() && currentStatus.boundToOtherDevice -> "Paket masih aktif, tetapi terikat di perangkat lain. Hubungi admin untuk reset perangkat."
                    currentStatus.hasActivePeriod() -> "Paket masih aktif. Menunggu pengikatan perangkat saat tersambung internet."
                    else -> "Belum aktif atau masa aktif telah berakhir."
                })
                if (statusError != null) Text(statusError, color = Color(0xFFB42318), fontSize = 13.sp)
                Text("Pembayaran dibuka setiap tanggal 20 hingga akhir bulan. Kirim konfirmasi dan bukti pembayaran langsung ke admin.", fontSize = 14.sp)
                Image(painterResource(R.drawable.qris_premium), contentDescription = "QRIS pembayaran SIMONTOK", modifier = Modifier.fillMaxWidth().heightIn(max = 300.dp), contentScale = ContentScale.Fit)
                Button(onClick = { showAccounts = true }, modifier = Modifier.fillMaxWidth()) { Text("BAYAR") }
                Button(onClick = { openPremiumAdmin(context, "Halo Admin, saya $username ingin konfirmasi pembayaran ${premiumPackageLabel(currentStatus.packageCode)}.") }, modifier = Modifier.fillMaxWidth()) { Text("Konfirmasi ke Admin") }
                TextButton(onClick = onDismiss) { Text("Tutup") }
            }
        }
    }
    if (showAccounts) PremiumPaymentAccountsDialog(onDismiss = { showAccounts = false }, onConfirm = {
        showAccounts = false
        openPremiumAdmin(context, "Halo Admin, saya $username ingin konfirmasi pembayaran ${premiumPackageLabel(currentStatus.packageCode)}.")
    })
}
