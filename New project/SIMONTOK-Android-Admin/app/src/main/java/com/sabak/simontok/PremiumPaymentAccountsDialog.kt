package com.sabak.simontok

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties

@Composable
internal fun PremiumPaymentAccountsDialog(
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
    onCopy: ((PremiumPaymentAccount) -> Unit)? = null
) {
    val context = LocalContext.current
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Card(
            Modifier.padding(20.dp).widthIn(max = 440.dp).fillMaxWidth(),
            shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = Color.White)
        ) {
            Column(Modifier.verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Pembayaran Premium", fontSize = 21.sp, fontWeight = FontWeight.Bold, color = Color(0xFF102443))
                Text("Transfer ke salah satu rekening berikut dan konfirmasi ke admin.", fontSize = 14.sp, color = Color(0xFF5B6C85))
                Text("a.n. RIZAL FATONI", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Color(0xFF102443))
                premiumPaymentAccounts.forEach { account ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(account.bank, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0069E8))
                            Text(account.number, fontSize = 17.sp, fontFamily = FontFamily.Monospace, color = Color(0xFF102443))
                        }
                        IconButton(onClick = {
                            if (onCopy != null) onCopy(account) else {
                                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                clipboard.setPrimaryClip(ClipData.newPlainText("Rekening ${account.bank}", account.number))
                                Toast.makeText(context, "Nomor ${account.bank} disalin", Toast.LENGTH_SHORT).show()
                            }
                        }) {
                            Icon(Icons.Outlined.ContentCopy, contentDescription = "Salin ${account.bank}", tint = Color(0xFF0069E8), modifier = Modifier.size(22.dp))
                        }
                    }
                    HorizontalDivider(color = Color(0xFFE5ECF4))
                }
                Button(onClick = onConfirm, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0069E8)), shape = RoundedCornerShape(8.dp)) {
                    Text("Konfirmasi ke Admin")
                }
                TextButton(onClick = onDismiss, modifier = Modifier.align(Alignment.CenterHorizontally)) { Text("Tutup", color = Color(0xFF0069E8)) }
            }
        }
    }
}
