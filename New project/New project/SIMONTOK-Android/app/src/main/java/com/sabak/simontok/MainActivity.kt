package com.sabak.simontok

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.concurrent.thread

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val sessionStore = SessionStore(this)
        val api = SupabaseApi()

        setContent {
            SimontokTheme {
                SimontokApp(api = api, sessionStore = sessionStore)
            }
        }
    }
}

@Composable
private fun SimontokApp(api: SupabaseApi, sessionStore: SessionStore) {
    var screenState by remember { mutableStateOf<ScreenState>(ScreenState.Loading) }
    var session by remember { mutableStateOf(sessionStore.read()) }

    LaunchedEffect(session?.accessToken) {
        val current = session
        if (current?.accessToken.isNullOrBlank()) {
            screenState = ScreenState.Login
        } else {
            screenState = ScreenState.Loading
            thread {
                var shouldClearSession = false
                val nextState = runCatching {
                    val rows = api.fetchRemainingCustomers(current!!.accessToken)
                    ScreenState.Home(username = current.username, rows = rows)
                }.getOrElse {
                    sessionStore.clear()
                    shouldClearSession = true
                    ScreenState.LoginWithError("Sesi habis atau gagal memuat data. Silakan login ulang.")
                }
                runOnMainThread {
                    if (shouldClearSession) session = null
                    screenState = nextState
                }
            }
        }
    }

    when (val currentState = screenState) {
        ScreenState.Loading -> LoadingScreen()
        ScreenState.Login -> LoginScreen(
            error = null,
            onLogin = { username, password ->
                screenState = ScreenState.Loading
                api.login(username, password) { result ->
                    result.onSuccess { newSession ->
                        sessionStore.save(newSession)
                        session = newSession
                    }.onFailure {
                        screenState = ScreenState.LoginWithError(it.message ?: "Login gagal.")
                    }
                }
            }
        )
        is ScreenState.LoginWithError -> LoginScreen(
            error = currentState.message,
            onLogin = { username, password ->
                screenState = ScreenState.Loading
                api.login(username, password) { result ->
                    result.onSuccess { newSession ->
                        sessionStore.save(newSession)
                        session = newSession
                    }.onFailure {
                        screenState = ScreenState.LoginWithError(it.message ?: "Login gagal.")
                    }
                }
            }
        )
        is ScreenState.Home -> HomeScreen(
            username = currentState.username,
            rows = currentState.rows,
            onRefresh = {
                screenState = ScreenState.Loading
                val current = session
                thread {
                    val nextState = runCatching {
                        val rows = api.fetchRemainingCustomers(current!!.accessToken)
                        ScreenState.Home(username = current.username, rows = rows)
                    }.getOrElse {
                        ScreenState.Home(username = current?.username.orEmpty(), rows = currentState.rows)
                    }
                    runOnMainThread { screenState = nextState }
                }
            },
            onLogout = {
                sessionStore.clear()
                session = null
                screenState = ScreenState.Login
            }
        )
    }
}

private fun runOnMainThread(action: () -> Unit) {
    android.os.Handler(android.os.Looper.getMainLooper()).post(action)
}

@Composable
private fun LoadingScreen() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFEEF3F7)),
        contentAlignment = Alignment.Center
    ) {
        CircularProgressIndicator(color = Color(0xFF145EA8))
    }
}

@Composable
private fun LoginScreen(error: String?, onLogin: (String, String) -> Unit) {
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = Color(0xFFEEF3F7)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(20.dp),
            verticalArrangement = Arrangement.Center
        ) {
            Text("SIMONTOK", fontSize = 32.sp, fontWeight = FontWeight.Black, color = Color(0xFF145EA8))
            Text("Monitoring tunggakan petugas", color = Color(0xFF5D6673))
            Spacer(Modifier.height(22.dp))
            Card(
                shape = RoundedCornerShape(8.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                Column(Modifier.padding(16.dp)) {
                    OutlinedTextField(
                        value = username,
                        onValueChange = { username = it.uppercase() },
                        label = { Text("Username") },
                        placeholder = { Text("14390.ADRI") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it },
                        label = { Text("Password") },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        modifier = Modifier.fillMaxWidth()
                    )
                    if (!error.isNullOrBlank()) {
                        Spacer(Modifier.height(10.dp))
                        Text(error, color = Color(0xFFC1121F), fontSize = 13.sp)
                    }
                    Spacer(Modifier.height(14.dp))
                    Button(
                        onClick = { onLogin(username.trim(), password) },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Login")
                    }
                }
            }
        }
    }
}

@Composable
private fun HomeScreen(
    username: String,
    rows: List<CustomerDebt>,
    onRefresh: () -> Unit,
    onLogout: () -> Unit
) {
    val total = rows.sumOf { it.rptag }

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = Color(0xFFEEF3F7)
    ) {
        Column(Modifier.fillMaxSize()) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .background(Color(0xFF145EA8))
                    .padding(16.dp)
            ) {
                Text("SIMONTOK", color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.Black)
                Text(username, color = Color(0xFFE5F1FF), fontSize = 13.sp)
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    SummaryCard(title = "Pelanggan", value = rows.size.toString(), modifier = Modifier.weight(1f))
                    SummaryCard(title = "Tagihan", value = formatRupiah(total), modifier = Modifier.weight(1f))
                }
            }
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Daftar Tunggakan", fontWeight = FontWeight.Bold)
                Row {
                    TextButton(onClick = onRefresh) { Text("Refresh") }
                    TextButton(onClick = onLogout) { Text("Logout") }
                }
            }
            if (rows.isEmpty()) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Belum ada data tunggakan.", color = Color(0xFF5D6673))
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(rows, key = { it.idpel }) { row ->
                        CustomerCard(row)
                    }
                }
            }
        }
    }
}

@Composable
private fun SummaryCard(title: String, value: String, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Column(Modifier.padding(12.dp)) {
            Text(title, fontSize = 12.sp, color = Color(0xFF5D6673))
            Text(value, fontSize = 18.sp, fontWeight = FontWeight.Black, color = Color(0xFF17202A))
        }
    }
}

@Composable
private fun CustomerCard(row: CustomerDebt) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(row.nama, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(formatRupiah(row.rptag), fontWeight = FontWeight.Black, color = Color(0xFF145EA8))
            }
            Text("IDPEL ${row.idpel} | ${row.tarif} / ${row.daya}", fontSize = 12.sp, color = Color(0xFF5D6673))
            Text(row.alamat, fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text("Lembar ${row.lembar} | KOLOK ${row.kolok} | KOKED ${row.koked}", fontSize = 12.sp, color = Color(0xFF5D6673))
        }
    }
}

@Composable
private fun SimontokTheme(content: @Composable () -> Unit) {
    MaterialTheme(content = content)
}

private sealed class ScreenState {
    data object Loading : ScreenState()
    data object Login : ScreenState()
    data class LoginWithError(val message: String) : ScreenState()
    data class Home(val username: String, val rows: List<CustomerDebt>) : ScreenState()
}
