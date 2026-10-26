package com.sabak.simontok

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Logout
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.ReceiptLong
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material.icons.outlined.WaterDrop
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.core.content.FileProvider
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessaging
import java.io.File
import java.util.Date
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.atomic.AtomicInteger
import kotlin.concurrent.thread
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.coroutines.launch
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver

private val DeepTeal = Color(0xFF00546D)
private val BrightTeal = Color(0xFF13AFC4)
private val AppYellow = Color(0xFFF7D915)
private val AppBg = Color(0xFFF6FBFE)
private val TextMain = Color(0xFF0F172A)
private val TextMuted = Color(0xFF667085)
private val Line = Color(0xFFD7E0EA)
private const val PREMIUM_NOTIFICATION_CHANNEL_ID = "premium_requests"
private val MarkColors = listOf(
    Color.White,
    Color(0xFFFFF6D8),
    Color(0xFFEAF7EE),
    Color(0xFFFFE8EA),
    Color(0xFFEAF2FF)
)

private object AppMemoryCache {
    var home: CachedHome? = null
}

private data class CachedHome(
    val accessToken: String,
    val username: String,
    val rows: List<CustomerDebt>,
    val allRows: List<CustomerDebt>,
    val meters: Map<String, ReceiptMeter>,
    val dataVersion: String?
)

private sealed class SyncState {
    data object Idle : SyncState()
    data class Running(val message: String, val progress: Float) : SyncState()
    data class Done(val message: String) : SyncState()
}

private sealed class DataUpdateNotice {
    data object None : DataUpdateNotice()
    data class UpdateAvailable(val uploadedAt: String) : DataUpdateNotice()
    data class Updated(val uploadedAt: String?) : DataUpdateNotice()
}

private sealed class AppVersionState {
    data object Checking : AppVersionState()
    data object Allowed : AppVersionState()
    data class Required(val release: AppRelease) : AppVersionState()
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        createNotificationChannels()
        requestBluetoothPermissions()
        val sessionStore = SessionStore(this)
        val markStore = CustomerMarkStore(this)
        val offlineDataStore = OfflineDataStore(this)
        val receiptSettingsStore = ReceiptSettingsStore(this)
        val premiumStatusStore = PremiumStatusStore(this)
        val customerScrollStore = CustomerScrollStore(this)
        val deviceStore = DeviceStore(this)
        val printer = BluetoothReceiptPrinter(this)
        val api = SupabaseApi()

        setContent {
            MaterialTheme {
                AppVersionGate(api = api) {
                    SimontokApp(
                        api = api,
                        sessionStore = sessionStore,
                        markStore = markStore,
                        offlineDataStore = offlineDataStore,
                        receiptSettingsStore = receiptSettingsStore,
                        premiumStatusStore = premiumStatusStore,
                        customerScrollStore = customerScrollStore,
                        deviceStore = deviceStore,
                        printer = printer,
                        requestBluetoothPermissions = { requestBluetoothPermissions() }
                    )
                }
            }
        }
    }

    fun requestBluetoothPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            requestPermissions(
                arrayOf(
                    Manifest.permission.BLUETOOTH_CONNECT,
                    Manifest.permission.BLUETOOTH_SCAN
                ),
                20
            )
        } else {
            requestPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION), 20)
        }
    }

    fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 30)
        }
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val premiumChannel = NotificationChannel(
            PREMIUM_NOTIFICATION_CHANNEL_ID,
            "Pengajuan Premium",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Notifikasi pengajuan Premium baru untuk admin"
            enableVibration(true)
        }
        val debtChannel = NotificationChannel(
            DEBT_NOTIFICATION_CHANNEL_ID,
            "Pembaruan Tunggakan",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Notifikasi saat admin memperbarui data tunggakan"
            enableVibration(true)
        }
        getSystemService(NotificationManager::class.java).createNotificationChannels(listOf(premiumChannel, debtChannel))
    }
}

@Composable
private fun AppVersionGate(api: SupabaseApi, content: @Composable () -> Unit) {
    var state by remember { mutableStateOf<AppVersionState>(AppVersionState.Checking) }
    var checkRequest by remember { mutableStateOf(0) }

    LaunchedEffect(checkRequest) {
        if (state != AppVersionState.Allowed && state !is AppVersionState.Required) state = AppVersionState.Checking
        val release = withContext(Dispatchers.IO) { runCatching { api.fetchAppRelease() }.getOrNull() }
        state = if (release != null && release.forceUpdate &&
            compareAppVersions(BuildConfig.VERSION_NAME, release.minimumVersion) < 0
        ) {
            AppVersionState.Required(release)
        } else {
            AppVersionState.Allowed
        }
    }

    LaunchedEffect(Unit) {
        while (true) {
            delay(5 * 60 * 1000L)
            checkRequest += 1
        }
    }

    when (val current = state) {
        AppVersionState.Checking -> LoadingScreen()
        AppVersionState.Allowed -> content()
        is AppVersionState.Required -> ForceUpdateScreen(
            release = current.release,
            onRetry = { checkRequest += 1 }
        )
    }
}

@Composable
private fun ForceUpdateScreen(release: AppRelease, onRetry: () -> Unit) {
    val context = LocalContext.current
    Box(
        modifier = Modifier.fillMaxSize().background(AppBg).padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
        ) {
            Column(
                modifier = Modifier.padding(26.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Icon(Icons.Outlined.Lock, contentDescription = null, tint = DeepTeal, modifier = Modifier.size(52.dp))
                Spacer(Modifier.height(14.dp))
                Text("Pembaruan Wajib", fontSize = 24.sp, fontWeight = FontWeight.Black, color = TextMain)
                Spacer(Modifier.height(8.dp))
                Text(
                    release.message.ifBlank { "Silakan perbarui aplikasi untuk melanjutkan." },
                    fontSize = 14.sp,
                    color = TextMuted
                )
                Spacer(Modifier.height(10.dp))
                Text(
                    "Versi saat ini ${BuildConfig.VERSION_NAME} | Versi terbaru ${release.latestVersion}",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = DeepTeal
                )
                Spacer(Modifier.height(22.dp))
                if (release.downloadUrl.isNotBlank()) {
                    UpdateActionButton("Unduh Pembaruan") {
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(release.downloadUrl)))
                    }
                    Spacer(Modifier.height(10.dp))
                }
                UpdateActionButton("Periksa Lagi", filled = false, onClick = onRetry)
            }
        }
    }
}

@Composable
private fun UpdateActionButton(text: String, filled: Boolean = true, onClick: () -> Unit) {
    val background = if (filled) DeepTeal else Color.White
    val foreground = if (filled) Color.White else DeepTeal
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(52.dp)
            .background(background, RoundedCornerShape(10.dp))
            .border(1.dp, DeepTeal, RoundedCornerShape(10.dp))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Text(text, color = foreground, fontWeight = FontWeight.Bold)
    }
}

private fun compareAppVersions(left: String, right: String): Int {
    val leftParts = left.split('.').map { it.takeWhile(Char::isDigit).toIntOrNull() ?: 0 }
    val rightParts = right.split('.').map { it.takeWhile(Char::isDigit).toIntOrNull() ?: 0 }
    repeat(maxOf(leftParts.size, rightParts.size)) { index ->
        val comparison = (leftParts.getOrNull(index) ?: 0).compareTo(rightParts.getOrNull(index) ?: 0)
        if (comparison != 0) return comparison
    }
    return 0
}

@Composable
private fun SimontokApp(
    api: SupabaseApi,
    sessionStore: SessionStore,
    markStore: CustomerMarkStore,
    offlineDataStore: OfflineDataStore,
    receiptSettingsStore: ReceiptSettingsStore,
    premiumStatusStore: PremiumStatusStore,
    customerScrollStore: CustomerScrollStore,
    deviceStore: DeviceStore,
    printer: BluetoothReceiptPrinter,
    requestBluetoothPermissions: () -> Unit
) {
    var session by remember { mutableStateOf(sessionStore.read()) }
    var syncState by remember { mutableStateOf<SyncState>(SyncState.Idle) }
    var dataNotice by remember { mutableStateOf<DataUpdateNotice>(DataUpdateNotice.None) }
    var backgroundSyncRunning by remember { mutableStateOf(false) }
    val sessionEpoch = remember { AtomicInteger(0) }
    val sessionLock = remember { Any() }
    var screenState by remember {
        mutableStateOf<ScreenState>(
            AppMemoryCache.home
                ?.takeIf { it.accessToken == session?.accessToken }
                ?.let { ScreenState.Home(username = it.username, rows = it.rows) }
                ?: ScreenState.Loading
        )
    }

    LaunchedEffect(session?.accessToken) {
        val current = session
        if (current?.accessToken.isNullOrBlank()) {
            screenState = ScreenState.Login
        } else if (AppMemoryCache.home?.accessToken == current.accessToken && screenState is ScreenState.Home) {
            return@LaunchedEffect
        } else {
            val offline = offlineDataStore.read(current.username)
            if (offline != null) {
                val rows = sortCustomerRows(offline.ownRows)
                AppMemoryCache.home = CachedHome(current.accessToken, current.username, rows, offline.allRows, offline.meters, offline.dataVersion)
                screenState = ScreenState.Home(username = current.username, rows = rows)
            } else {
                screenState = ScreenState.Loading
                thread {
                    var shouldClearSession = false
                    val nextState = runCatching {
                        val cache = loadLoginCache(api, offlineDataStore, current.accessToken, current.username)
                        AppMemoryCache.home = cache
                        ScreenState.Home(username = current.username, rows = cache.rows)
                    }.getOrElse {
                        sessionEpoch.incrementAndGet()
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
    }

    fun freshSessionBlocking(): UserSession {
        val epoch = sessionEpoch.get()
        val current = session ?: throw IllegalStateException("Sesi login habis. Silakan login ulang.")
        val refreshed = api.refreshSession(current)
        synchronized(sessionLock) {
            if (sessionEpoch.get() != epoch || session == null) {
                throw IllegalStateException("Sesi sudah ditutup.")
            }
            sessionStore.save(refreshed)
        }
        runOnMainThread {
            if (sessionEpoch.get() == epoch && session != null) {
                session = refreshed
            }
        }
        return refreshed
    }

    fun refreshDebtData(current: UserSession?, automatic: Boolean = false, notificationVersion: String? = null) {
        if (automatic && backgroundSyncRunning) return
        if (!automatic && syncState is SyncState.Running) return
        val previousVersion = AppMemoryCache.home?.dataVersion
        if (automatic) {
            backgroundSyncRunning = true
        } else {
            syncState = SyncState.Running("Mengambil data online...", 0.1f)
        }
        thread {
            val result = runCatching {
                val activeSession = runCatching { freshSessionBlocking() }
                    .getOrElse { current ?: throw IllegalStateException("Sesi login habis. Silakan login ulang.") }
                    val cache = refreshOnlineCache(
                        api = api,
                        offlineDataStore = offlineDataStore,
                        accessToken = activeSession.accessToken,
                        username = activeSession.username,
                        refreshHeavyData = !automatic,
                        onProgress = { message, progress ->
                            if (!automatic) {
                                runOnMainThread { syncState = SyncState.Running(message, progress) }
                            }
                        }
                    )
                    api.acknowledgeMonitoringSync(
                        accessToken = activeSession.accessToken,
                        username = activeSession.username,
                        deviceId = deviceStore.deviceId(),
                        dataVersion = notificationVersion ?: cache.dataVersion
                    )
                    cache
            }
            runOnMainThread {
                if (automatic) backgroundSyncRunning = false
                result.onSuccess { cache ->
                    val hasUpdate = cache.dataVersion != previousVersion
                    AppMemoryCache.home = cache
                    screenState = ScreenState.Home(username = cache.username, rows = cache.rows)
                    if (automatic) {
                        if (hasUpdate) dataNotice = DataUpdateNotice.Updated(cache.dataVersion)
                    } else {
                        dataNotice = DataUpdateNotice.Updated(cache.dataVersion)
                        syncState = SyncState.Done("Data tunggakan Anda sudah terupdate.")
                    }
                }.onFailure {
                    if (!automatic) {
                        syncState = SyncState.Done("Refresh gagal: ${it.message ?: "periksa koneksi."}")
                    }
                }
            }
        }
    }

    when (val currentState = screenState) {
        ScreenState.Loading -> LoadingScreen()
        ScreenState.Login -> LoginScreen(error = null, onLogin = { username, password ->
            screenState = ScreenState.Loading
            api.login(username, password) { result ->
                result.onSuccess { newSession ->
                    sessionEpoch.incrementAndGet()
                    sessionStore.save(newSession)
                    session = newSession
                }.onFailure {
                    screenState = ScreenState.LoginWithError(it.message ?: "Login gagal.")
                }
            }
        })
        is ScreenState.LoginWithError -> LoginScreen(error = currentState.message, onLogin = { username, password ->
            screenState = ScreenState.Loading
            api.login(username, password) { result ->
                result.onSuccess { newSession ->
                    sessionEpoch.incrementAndGet()
                    sessionStore.save(newSession)
                    session = newSession
                }.onFailure {
                    screenState = ScreenState.LoginWithError(it.message ?: "Login gagal.")
                }
            }
        })
        is ScreenState.Home -> PremiumBillingGate(
            username = currentState.username,
            accessToken = session?.accessToken.orEmpty(),
            api = api,
            freshSession = { freshSessionBlocking() },
            onLogout = {
                sessionEpoch.incrementAndGet()
                synchronized(sessionLock) { sessionStore.clear() }
                offlineDataStore.clear()
                AppMemoryCache.home = null
                dataNotice = DataUpdateNotice.None
                session = null
                screenState = ScreenState.Login
            }
        ) {
          HomeScreen(
            username = currentState.username,
            accessToken = session?.accessToken.orEmpty(),
            rows = currentState.rows,
            api = api,
            markStore = markStore,
            offlineDataStore = offlineDataStore,
            receiptSettingsStore = receiptSettingsStore,
            premiumStatusStore = premiumStatusStore,
            customerScrollStore = customerScrollStore,
            deviceStore = deviceStore,
            printer = printer,
            requestBluetoothPermissions = requestBluetoothPermissions,
            freshSession = { freshSessionBlocking() },
            syncState = syncState,
            dataVersion = AppMemoryCache.home?.dataVersion,
            dataNotice = dataNotice,
            onDataNoticeChange = { dataNotice = it },
            onRefresh = {
                refreshDebtData(session)
            },
            onUpdateAvailable = { latestVersion ->
                if (latestVersion.isNotBlank()) {
                    dataNotice = DataUpdateNotice.UpdateAvailable(latestVersion)
                }
                refreshDebtData(session, automatic = true, notificationVersion = latestVersion)
            },
            onLogout = {
                sessionEpoch.incrementAndGet()
                synchronized(sessionLock) { sessionStore.clear() }
                offlineDataStore.clear()
                AppMemoryCache.home = null
                dataNotice = DataUpdateNotice.None
                session = null
                screenState = ScreenState.Login
            }
          )
        }
    }
}

private fun runOnMainThread(action: () -> Unit) {
    android.os.Handler(android.os.Looper.getMainLooper()).post(action)
}

private fun premiumAdminMessage(request: PremiumAdminRequest): String {
    val time = request.createdAt.takeIf(String::isNotBlank)?.let(::formatDataVersionTime).orEmpty()
    return if (request.requestType == "device_reset") {
        "Permintaan verifikasi device dari ${request.username}${if (time.isBlank()) "." else " pada $time."}"
    } else {
        "${request.username} mengajukan Premium ${request.packageCode} senilai ${formatRupiah(request.amount.toDouble())}${if (time.isBlank()) "." else " pada $time."}"
    }
}

private fun showPremiumAdminNotification(context: Context, request: PremiumAdminRequest) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) return

    val openAppIntent = Intent(context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
    }
    val pendingIntent = PendingIntent.getActivity(
        context,
        request.id.hashCode(),
        openAppIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val title = if (request.requestType == "device_reset") {
        "Verifikasi Device Baru"
    } else {
        "Pengajuan Premium Baru"
    }
    val message = premiumAdminMessage(request)
    val notification = NotificationCompat.Builder(context, PREMIUM_NOTIFICATION_CHANNEL_ID)
        .setSmallIcon(android.R.drawable.ic_dialog_info)
        .setContentTitle(title)
        .setContentText(message)
        .setStyle(NotificationCompat.BigTextStyle().bigText(message))
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setCategory(NotificationCompat.CATEGORY_MESSAGE)
        .setAutoCancel(true)
        .setContentIntent(pendingIntent)
        .build()
    NotificationManagerCompat.from(context).notify(request.id.hashCode(), notification)
}

private fun formatDataVersionTime(value: String): String {
    val date = parseDataVersionDate(value) ?: return value
    return SimpleDateFormat("dd MMM yyyy HH:mm", Locale("id", "ID")).format(date)
}

private fun formatUpdateBannerTime(value: String?): String {
    val date = value?.let { parseDataVersionDate(it) } ?: Date()
    return SimpleDateFormat("dd MMM yyyy HH:mm", Locale("id", "ID")).format(date)
}

private fun parseDataVersionDate(value: String): Date? {
    val inputFormats = listOf(
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        },
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        },
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", Locale.US),
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.US)
    )
    return inputFormats.firstNotNullOfOrNull { format ->
        runCatching { format.parse(value) }.getOrNull()
    }
}

private fun refreshOnlineCache(
    api: SupabaseApi,
    offlineDataStore: OfflineDataStore,
    accessToken: String,
    username: String,
    refreshHeavyData: Boolean = true,
    onProgress: (String, Float) -> Unit = { _, _ -> }
): CachedHome {
    onProgress("Mengambil data petugas...", 0.2f)
    val ownRows = sortCustomerRows(api.fetchRemainingCustomers(accessToken, username))
    val dataVersion = api.buildDebtFingerprint(ownRows) ?: api.fetchLatestDebtUploadAt(accessToken, username)
    val cached = AppMemoryCache.home?.takeIf { it.username == username }
    val allRows = if (refreshHeavyData || cached == null || cached.allRows.isEmpty()) {
        onProgress("Mengambil seluruh saldo akhir untuk cetak...", 0.55f)
        api.fetchAllRemainingCustomers(accessToken) { count ->
            val progress = (0.28f + (count.coerceAtMost(20000) / 20000f) * 0.44f).coerceAtMost(0.72f)
            onProgress("Mengambil saldo akhir: $count data...", progress)
        }
    } else {
        cached.allRows
    }
    val meters = if (refreshHeavyData || cached == null || cached.meters.isEmpty()) {
        onProgress("Mengambil stand meter...", 0.82f)
        api.fetchReceiptMeters(accessToken) { count ->
            val progress = (0.72f + (count.coerceAtMost(20000) / 20000f) * 0.18f).coerceAtMost(0.9f)
            onProgress("Mengambil stand meter: $count data...", progress)
        }
    } else {
        onProgress("Menyimpan data terbaru...", 0.85f)
        cached.meters
    }
    onProgress("Menyimpan data offline...", 0.95f)
    offlineDataStore.save(username, ownRows, allRows, meters, dataVersion)
    onProgress("Selesai.", 1f)
    return CachedHome(accessToken, username, ownRows, allRows, meters, dataVersion)
}

private fun loadLoginCache(
    api: SupabaseApi,
    offlineDataStore: OfflineDataStore,
    accessToken: String,
    username: String
): CachedHome {
    val ownRows = sortCustomerRows(api.fetchRemainingCustomers(accessToken, username))
    val dataVersion = api.buildDebtFingerprint(ownRows) ?: api.fetchLatestDebtUploadAt(accessToken, username)
    val existing = offlineDataStore.read(username)
    val allRows = existing?.allRows.orEmpty()
    val meters = existing?.meters.orEmpty()
    offlineDataStore.save(username, ownRows, allRows, meters, dataVersion)
    return CachedHome(accessToken, username, ownRows, allRows, meters, dataVersion)
}

@Composable
private fun LoadingScreen() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(AppBg),
        contentAlignment = Alignment.Center
    ) {
        CircularProgressIndicator(color = BrightTeal)
    }
}

@Composable
private fun LoginScreen(error: String?, onLogin: (String, String) -> Unit) {
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF7FCFF))
    ) {
        DecorativeLoginBackground()
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(28.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 26.dp, vertical = 34.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    SimontokLogo()
                    Spacer(Modifier.height(14.dp))
                    Text(
                        "SIMONTOK",
                        fontSize = 34.sp,
                        fontWeight = FontWeight.Black,
                        color = DeepTeal,
                        letterSpacing = 4.sp
                    )
                    Spacer(Modifier.height(16.dp))
                    AccentDivider()
                    Spacer(Modifier.height(26.dp))
                    OutlinedTextField(
                        value = username,
                        onValueChange = { username = it.uppercase() },
                        placeholder = { Text("Username") },
                        leadingIcon = { Icon(Icons.Outlined.Person, contentDescription = null, tint = DeepTeal) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
                        shape = RoundedCornerShape(10.dp),
                        colors = loginFieldColors(),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(64.dp)
                    )
                    Spacer(Modifier.height(16.dp))
                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it },
                        placeholder = { Text("Password") },
                        leadingIcon = { Icon(Icons.Outlined.Lock, contentDescription = null, tint = DeepTeal) },
                        trailingIcon = {
                            IconButton(onClick = { passwordVisible = !passwordVisible }) {
                                Icon(
                                    if (passwordVisible) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                                    contentDescription = if (passwordVisible) "Sembunyikan password" else "Tampilkan password",
                                    tint = TextMuted
                                )
                            }
                        },
                        singleLine = true,
                        visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                        shape = RoundedCornerShape(10.dp),
                        colors = loginFieldColors(),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(64.dp)
                    )
                    if (!error.isNullOrBlank()) {
                        Spacer(Modifier.height(10.dp))
                        Text(error, color = Color(0xFFC1121F), fontSize = 13.sp)
                    }
                    Spacer(Modifier.height(18.dp))
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(60.dp)
                            .background(
                                Brush.horizontalGradient(listOf(BrightTeal, DeepTeal)),
                                RoundedCornerShape(12.dp)
                            )
                            .clickable { onLogin(username.trim(), password) },
                        contentAlignment = Alignment.Center
                    ) {
                        Text("LOGIN", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.height(18.dp))
                    Text("Built BY Rizal Fatoni", color = TextMuted, fontSize = 12.sp)
                }
            }
        }
    }
}

@Composable
private fun loginFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = BrightTeal,
    unfocusedBorderColor = Color(0xFF78C6D7),
    focusedContainerColor = Color.White,
    unfocusedContainerColor = Color.White,
    cursorColor = DeepTeal
)

@Composable
private fun DecorativeLoginBackground() {
    Canvas(Modifier.fillMaxSize()) {
        drawCircle(DeepTeal, radius = size.width * 0.34f, center = androidx.compose.ui.geometry.Offset(-size.width * 0.04f, -size.width * 0.08f))
        drawCircle(Color(0xFFE7F4FA), radius = size.width * 0.24f, center = androidx.compose.ui.geometry.Offset(size.width * 1.02f, -size.width * 0.02f))
        drawCircle(Color(0xFFE7F4FA), radius = size.width * 0.28f, center = androidx.compose.ui.geometry.Offset(-size.width * 0.05f, size.height * 0.98f))
        drawCircle(AppYellow, radius = size.width * 0.27f, center = androidx.compose.ui.geometry.Offset(size.width * 1.02f, size.height * 0.96f))
        repeat(6) { x ->
            repeat(4) { y ->
                drawCircle(
                    Color(0xFFBFE1EC),
                    radius = 3.2.dp.toPx(),
                    center = androidx.compose.ui.geometry.Offset(size.width * 0.72f + x * 20.dp.toPx(), size.height * 0.08f + y * 20.dp.toPx())
                )
            }
        }
    }
}

@Composable
private fun SimontokLogo() {
    Canvas(Modifier.size(86.dp)) {
        val w = size.width
        val h = size.height
        val top = Path().apply {
            moveTo(w * 0.22f, h * 0.22f)
            lineTo(w * 0.78f, h * 0.02f)
            lineTo(w * 0.78f, h * 0.25f)
            lineTo(w * 0.30f, h * 0.48f)
            cubicTo(w * 0.14f, h * 0.42f, w * 0.12f, h * 0.30f, w * 0.22f, h * 0.22f)
            close()
        }
        val middle = Path().apply {
            moveTo(w * 0.30f, h * 0.48f)
            lineTo(w * 0.76f, h * 0.67f)
            lineTo(w * 0.58f, h * 0.78f)
            lineTo(w * 0.20f, h * 0.60f)
            close()
        }
        val bottom = Path().apply {
            moveTo(w * 0.42f, h * 0.74f)
            lineTo(w * 0.80f, h * 0.58f)
            lineTo(w * 0.80f, h * 0.80f)
            lineTo(w * 0.42f, h * 0.98f)
            close()
        }
        drawPath(top, Brush.linearGradient(listOf(DeepTeal, Color(0xFF008EAA))))
        drawPath(middle, Brush.linearGradient(listOf(Color(0xFF00A8C6), Color(0xFFE9F5F8))))
        drawPath(bottom, AppYellow)
    }
}

@Composable
private fun AccentDivider() {
    Row(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.width(48.dp).height(3.dp).background(BrightTeal, RoundedCornerShape(20.dp)))
        Box(Modifier.size(8.dp).background(BrightTeal, RoundedCornerShape(50)))
        Box(Modifier.width(48.dp).height(3.dp).background(AppYellow, RoundedCornerShape(20.dp)))
    }
}

@Composable
private fun HomeScreen(
    username: String,
    accessToken: String,
    rows: List<CustomerDebt>,
    api: SupabaseApi,
    markStore: CustomerMarkStore,
    offlineDataStore: OfflineDataStore,
    receiptSettingsStore: ReceiptSettingsStore,
    premiumStatusStore: PremiumStatusStore,
    customerScrollStore: CustomerScrollStore,
    deviceStore: DeviceStore,
    printer: BluetoothReceiptPrinter,
    requestBluetoothPermissions: () -> Unit,
    freshSession: () -> UserSession,
    syncState: SyncState,
    dataVersion: String?,
    dataNotice: DataUpdateNotice,
    onDataNoticeChange: (DataUpdateNotice) -> Unit,
    onRefresh: () -> Unit,
    onUpdateAvailable: (String) -> Unit,
    onLogout: () -> Unit
) {
    val context = LocalContext.current
    val adminNotificationStore = remember(context) { AdminPremiumNotificationStore(context) }
    var listSearchQuery by remember { mutableStateOf("") }
    val allSortedRows = remember(rows) { sortCustomerRows(rows) }
    val sortedRows = remember(allSortedRows, listSearchQuery) {
        val query = listSearchQuery.trim()
        val idpelQuery = normalizeIdpel(query)
        if (query.isBlank()) {
            allSortedRows
        } else {
            allSortedRows.filter {
                (idpelQuery.isNotBlank() && it.idpel.contains(idpelQuery)) ||
                    it.nama.contains(query, ignoreCase = true)
            }
        }
    }
    val total = allSortedRows.sumOf { it.rptag }
    val petugasName = displayNameForUsername(username, allSortedRows.firstOrNull()?.petugas)
    val marks = remember(allSortedRows) {
        mutableStateMapOf<String, CustomerMark>().also { map ->
            allSortedRows.forEach { row -> map[row.idpel] = markStore.read(row.idpel) }
        }
    }
    var receiptSettings by remember { mutableStateOf(receiptSettingsStore.read()) }
    var showSettings by remember { mutableStateOf(false) }
    var showPrinter by remember { mutableStateOf(false) }
    var showPrintList by remember { mutableStateOf(false) }
    var showReceiptHistory by remember { mutableStateOf(false) }
    var showExportExcel by remember { mutableStateOf(false) }
    var showMoreMenu by remember { mutableStateOf(false) }
    var printMessage by remember { mutableStateOf<String?>(null) }
    var printerDevices by remember { mutableStateOf(printer.pairedDevices()) }
    var scanningPrinter by remember { mutableStateOf(false) }
    var receiptPreview by remember { mutableStateOf<ReceiptPreview?>(null) }
    var premiumStatus by remember(username) {
        mutableStateOf(
            premiumStatusStore.read(username)
                ?: if (isSuperUser(username)) PremiumStatus(packageCode = "P3", activeUntil = "2099-12-31", deviceBound = true) else PremiumStatus()
        )
    }
    var showUpgrade by remember { mutableStateOf(false) }
    var premiumStatusError by remember(username) { mutableStateOf<String?>(null) }
    val premiumScope = rememberCoroutineScope()
    var showAdminPremium by remember { mutableStateOf(false) }
    var adminPremiumRequests by remember { mutableStateOf<List<PremiumAdminRequest>>(emptyList()) }
    var adminPremiumBusyId by remember { mutableStateOf<String?>(null) }
    val collapsedKolok = remember(sortedRows) { mutableStateMapOf<String, Boolean>() }
    val grouped = remember(sortedRows, collapsedKolok.toMap()) { groupedDisplayRows(sortedRows, collapsedKolok) }
    val savedScroll = remember(username) { customerScrollStore.read(username) }
    val customerListState = rememberLazyListState(
        initialFirstVisibleItemIndex = savedScroll.index.coerceIn(0, (grouped.size - 1).coerceAtLeast(0)),
        initialFirstVisibleItemScrollOffset = savedScroll.offset
    )
    val deviceId = remember { deviceStore.deviceId() }
    val standbyStartedAt = remember(accessToken) { System.currentTimeMillis() }
    var lastNotifiedVersion by remember(accessToken) { mutableStateOf(dataVersion.orEmpty()) }

    LaunchedEffect(username) {
        ReceiptHistorySync.schedule(context)
    }

    LaunchedEffect(customerListState, username, listSearchQuery) {
        var lastIndex = customerListState.firstVisibleItemIndex
        var lastOffset = customerListState.firstVisibleItemScrollOffset
        while (true) {
            delay(500)
            if (listSearchQuery.isNotBlank()) continue
            val index = customerListState.firstVisibleItemIndex
            val offset = customerListState.firstVisibleItemScrollOffset
            if (index != lastIndex || offset != lastOffset) {
                customerScrollStore.save(username, index, offset)
                lastIndex = index
                lastOffset = offset
            }
        }
    }

    fun notifyIfFreshUpdate(latestVersion: String?) {
        if (latestVersion.isNullOrBlank()) return
        if (latestVersion == lastNotifiedVersion) return
        val latestTime = parseDataVersionDate(latestVersion)?.time
        val isFreshUpload = latestTime == null || latestTime >= standbyStartedAt - 5_000
        if (!isFreshUpload) return
        lastNotifiedVersion = latestVersion
        onUpdateAvailable(latestVersion)
    }

    suspend fun refreshPremiumStatus() {
        if (accessToken.isBlank()) return
        val result = withContext(Dispatchers.IO) {
            runCatching { api.fetchPremiumStatus(accessToken, username, deviceId) }
                .recoverCatching {
                    val activeSession = freshSession()
                    api.fetchPremiumStatus(activeSession.accessToken, username, deviceId)
                }
        }
        result.onSuccess { status ->
            premiumStatusStore.save(username, status)
            premiumStatus = status
            premiumStatusError = null
        }.onFailure { premiumStatusError = "Status premium belum dapat diperbarui. Periksa koneksi atau hubungi admin." }
    }

    DisposableEffect(context, username, accessToken) {
        val lifecycle = (context as ComponentActivity).lifecycle
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) premiumScope.launch { refreshPremiumStatus() }
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }

    LaunchedEffect(accessToken, username, deviceId) {
        while (accessToken.isNotBlank()) {
            withContext(Dispatchers.IO) {
                runCatching { api.reportMonitoringDevice(accessToken, username, deviceId) }
                    .recoverCatching {
                        val activeSession = freshSession()
                        api.reportMonitoringDevice(activeSession.accessToken, username, deviceId)
                    }
            }
            refreshPremiumStatus()
            delay(5 * 60_000L)
        }
    }

    LaunchedEffect(showMoreMenu) {
        if (showMoreMenu) refreshPremiumStatus()
    }

    LaunchedEffect(accessToken, username) {
        if (accessToken.isBlank()) return@LaunchedEffect
        (context as? MainActivity)?.requestNotificationPermission()
        FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
            thread {
                runCatching {
                    val activeSession = freshSession()
                    api.registerPushToken(activeSession.accessToken, username, token, deviceId)
                }
            }
        }
    }

    DisposableEffect(accessToken, username) {
        DebtPushMessageBus.listener = { message ->
            runOnMainThread {
                printMessage = "${message.body}\n\nData sedang diperbarui otomatis."
                onUpdateAvailable(message.uploadedAt)
            }
        }
        onDispose {
            DebtPushMessageBus.listener = null
        }
    }

    DisposableEffect(accessToken, dataVersion) {
        if (accessToken.isNotBlank()) {
            val subscription = api.subscribeDebtUpdateSignal(
                accessToken = accessToken,
                onUpdate = { latestVersion ->
                    runOnMainThread {
                        if (syncState !is SyncState.Running) {
                            notifyIfFreshUpdate(latestVersion)
                        }
                    }
                },
                onStatus = {}
            )
            onDispose {
                subscription.stop()
            }
        } else {
            onDispose {}
        }
    }

    LaunchedEffect(accessToken, dataVersion) {
        if (accessToken.isNotBlank()) {
            val latestVersion = withContext(Dispatchers.IO) {
                runCatching {
                    val activeSession = freshSession()
                    api.fetchLatestDebtUploadAt(activeSession.accessToken, activeSession.username)
                }.getOrNull()
            }
            if (syncState !is SyncState.Running) {
                notifyIfFreshUpdate(latestVersion)
            }
        }
    }

    LaunchedEffect(accessToken) {
        if (accessToken.isNotBlank()) {
            while (true) {
                delay(5 * 60_000L)
                if (syncState is SyncState.Running) continue
                val latestVersion = withContext(Dispatchers.IO) {
                    runCatching { api.fetchLatestDebtUploadAt(accessToken, username) }
                        .recoverCatching {
                            val activeSession = freshSession()
                            api.fetchLatestDebtUploadAt(activeSession.accessToken, activeSession.username)
                        }
                        .getOrNull()
                }
                notifyIfFreshUpdate(latestVersion)
            }
        }
    }

    Surface(modifier = Modifier.fillMaxSize(), color = AppBg) {
        Column(Modifier.fillMaxSize()) {
            HeaderPanel(
                petugasName = petugasName,
                count = allSortedRows.size,
                total = total,
                searchQuery = listSearchQuery,
                onSearchQueryChange = { listSearchQuery = it },
            )
            SyncProgressBanner(syncState)
            DataUpdateBanner(dataNotice = dataNotice, syncState = syncState, onRefresh = onRefresh)
            PremiumWarningBar(
                premiumStatus = premiumStatus,
                onOpen = { showMoreMenu = true }
            )

            if (allSortedRows.isEmpty()) {
                Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Text("Belum ada data tunggakan.", color = TextMuted)
                }
            } else if (sortedRows.isEmpty()) {
                Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Text("IDPEL tidak ditemukan di list.", color = TextMuted)
                }
            } else {
                LazyColumn(
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                    state = customerListState,
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    items(
                        items = grouped,
                        key = { it.key },
                        contentType = { if (it is DisplayRow.GroupHeader) "header" else "customer" }
                    ) { item ->
                        when (item) {
                            is DisplayRow.GroupHeader -> KolokHeader(
                                header = item,
                                collapsed = collapsedKolok[item.kolok] == true,
                                onToggle = { collapsedKolok[item.kolok] = !(collapsedKolok[item.kolok] == true) }
                            )
                            is DisplayRow.CustomerItem -> {
                                val mark = marks[item.row.idpel] ?: CustomerMark()
                                CustomerCard(
                                    row = item.row,
                                    mark = mark,
                                    onColorChange = {
                                        val next = mark.copy(colorIndex = (mark.colorIndex + 1) % MarkColors.size)
                                        marks[item.row.idpel] = next
                                        markStore.save(item.row.idpel, next)
                                    },
                                    onPrint = {
                                        prepareReceiptPreview(
                                            row = item.row,
                                            accessToken = accessToken,
                                            api = api,
                                            settings = receiptSettings,
                                            premiumStatus = premiumStatus,
                                            onReady = { receiptPreview = it },
                                            onMessage = { printMessage = it }
                                        )
                                    }
                                )
                            }
                        }
                    }
                    item { Spacer(Modifier.height(10.dp)) }
                }
            }
            BottomNavigationBar(
                onHome = { },
                onStruk = { showPrintList = true },
                onMenu = { showMoreMenu = true }
            )
        }
    }

    if (showMoreMenu) {
        MoreMenuDialog(
            receiptSettings = receiptSettings,
            premiumStatus = premiumStatus,
            isAdmin = isSuperUser(username),
            pendingPremiumCount = adminPremiumRequests.size,
            onDismiss = { showMoreMenu = false },
            onAdminPremium = {
                showMoreMenu = false
                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://simontok-superweb.vercel.app/")))
            },
            onExportExcel = {
                showMoreMenu = false
                showExportExcel = true
            },
            onReceiptHistory = {
                showMoreMenu = false
                showReceiptHistory = true
            },
            onPrinter = {
                showMoreMenu = false
                showPrinter = true
            },
            onSettings = {
                showMoreMenu = false
                showSettings = true
            },
            onUpgrade = {
                showMoreMenu = false
                showUpgrade = true
            },
            onVerifyDevice = {
                showMoreMenu = false
                thread {
                    val result = runCatching {
                        val fresh = freshSession()
                        api.submitDeviceResetRequest(fresh.accessToken, username, premiumStatus.packageCode, deviceId)
                    }
                    runOnMainThread {
                        result.onSuccess {
                            printMessage = "Permintaan verifikasi ulang device terkirim. Tunggu admin ACC."
                        }.onFailure {
                            printMessage = "Gagal kirim verifikasi device: ${it.message ?: "periksa koneksi."}"
                        }
                    }
                }
            },
            onLogout = {
                showMoreMenu = false
                FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
                    thread { runCatching { api.unregisterPushToken(accessToken, token) } }
                }
                onLogout()
            }
        )
    }

    if (showAdminPremium && isSuperUser(username)) {
        AdminPremiumDialog(
            requests = adminPremiumRequests,
            busyId = adminPremiumBusyId,
            onDismiss = { if (adminPremiumBusyId == null) showAdminPremium = false },
            onRefresh = {
                thread {
                    val result = runCatching {
                        val fresh = freshSession()
                        api.fetchPendingPremiumRequests(fresh.accessToken)
                    }
                    runOnMainThread {
                        result.onSuccess { adminPremiumRequests = it }
                            .onFailure { printMessage = "Gagal memuat pengajuan: ${it.message ?: "periksa koneksi."}" }
                    }
                }
            },
            onOpenProof = { request ->
                thread {
                    val result = runCatching {
                        val fresh = freshSession()
                        api.createPremiumProofUrl(fresh.accessToken, request.proofPath)
                    }
                    runOnMainThread {
                        result.onSuccess { url ->
                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                        }.onFailure {
                            printMessage = it.message ?: "Gagal membuka bukti pembayaran."
                        }
                    }
                }
            },
            onApprove = { request ->
                adminPremiumBusyId = request.id
                thread {
                    val result = runCatching {
                        val fresh = freshSession()
                        val message = api.approvePremiumRequest(fresh.accessToken, request)
                        val pending = api.fetchPendingPremiumRequests(fresh.accessToken)
                        message to pending
                    }
                    runOnMainThread {
                        adminPremiumBusyId = null
                        result.onSuccess { (message, pending) ->
                            adminPremiumRequests = pending
                            printMessage = message
                        }.onFailure {
                            printMessage = it.message ?: "Gagal menyetujui pengajuan."
                        }
                    }
                }
            },
            onReject = { request ->
                adminPremiumBusyId = request.id
                thread {
                    val result = runCatching {
                        val fresh = freshSession()
                        api.rejectPremiumRequest(fresh.accessToken, request)
                        api.fetchPendingPremiumRequests(fresh.accessToken)
                    }
                    runOnMainThread {
                        adminPremiumBusyId = null
                        result.onSuccess {
                            adminPremiumRequests = it
                            printMessage = "Pengajuan ${request.username} ditolak."
                        }.onFailure {
                            printMessage = it.message ?: "Gagal menolak pengajuan."
                        }
                    }
                }
            }
        )
    }

    if (showSettings) {
        ReceiptSettingsDialog(
            initial = receiptSettings,
            onDismiss = { showSettings = false },
            onSave = {
                receiptSettings = it
                receiptSettingsStore.save(it)
                showSettings = false
                printMessage = "Setting struk disimpan."
            }
        )
    }

    if (showPrinter) {
        PrinterDialog(
            devices = printerDevices,
            scanning = scanningPrinter,
            selected = receiptSettings,
            onDismiss = { showPrinter = false },
            onScan = {
                requestBluetoothPermissions()
                scanningPrinter = true
                printer.discoverDevices(
                    onUpdate = { printerDevices = it },
                    onFinished = {
                        scanningPrinter = false
                        if (it != null) printMessage = it
                    }
                )
            },
            onSelect = { device ->
                runCatching { printer.pair(device.address) }
                val next = receiptSettings.copy(printerName = device.name, printerAddress = device.address)
                receiptSettings = next
                receiptSettingsStore.save(next)
                showPrinter = false
                printMessage = if (device.bonded) {
                    "Printer dipilih: ${device.name}"
                } else {
                    "Printer dipilih. Jika muncul permintaan pairing, tekan Pasangkan."
                }
            }
        )
    }

    if (showUpgrade) {
        PremiumAccessInfoDialog(
            username = username,
            currentStatus = premiumStatus,
            statusError = premiumStatusError,
            onDismiss = { showUpgrade = false }
        )
    }

    if (showPrintList) {
        PrintListDialog(
            rows = allSortedRows,
            onDismiss = { showPrintList = false },
            onPrint = { row ->
                prepareReceiptPreview(row, accessToken, api, receiptSettings, premiumStatus, { receiptPreview = it }) { printMessage = it }
            },
            onSearchIdpel = { idpel ->
                searchReceiptByIdpel(
                    idpel = idpel,
                    accessToken = accessToken,
                    api = api,
                    settings = receiptSettings,
                    premiumStatus = premiumStatus,
                    onReady = { receiptPreview = it },
                    onMessage = { printMessage = it }
                )
            }
        )
    }

    if (showExportExcel) {
        ExportExcelDialog(
            username = username,
            rows = allSortedRows,
            onDismiss = { showExportExcel = false },
            onMessage = { printMessage = it }
        )
    }

    receiptPreview?.let { preview ->
        ReceiptPreviewDialog(
            preview = preview,
            premiumStatus = premiumStatus,
            onDismiss = { receiptPreview = null },
            onPrint = {
                receiptPreview = null
                printPreparedReceipt(preview.snapshot, username, context, receiptSettings, printer) { printMessage = it }
            }
        )
    }

    printMessage?.let { message ->
        MessageDialog(message = message, onDismiss = { printMessage = null })
    }
    if (showReceiptHistory) {
        ReceiptHistoryDialog(context, username, printer, receiptSettings.printerAddress) { showReceiptHistory = false }
    }
}

@Composable
private fun HeaderPanel(
    petugasName: String,
    count: Int,
    total: Double,
    searchQuery: String,
    onSearchQueryChange: (String) -> Unit
) {
    Column(Modifier.fillMaxWidth()) {
        Box(
            Modifier
                .fillMaxWidth()
                .height(126.dp)
                .background(Brush.linearGradient(listOf(DeepTeal, Color(0xFF007E9D))))
        ) {
            HeaderDecorations()
            Column(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 12.dp)
                    .align(Alignment.BottomStart)
            ) {
                Text(petugasName, color = Color.White, fontSize = 21.sp, fontWeight = FontWeight.Black)
                Spacer(Modifier.height(7.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    SummaryCard("Pelanggan", count.toString(), SummaryIcon.People, Modifier.weight(1f))
                    SummaryCard("Total Tagihan", formatRupiah(total), SummaryIcon.Bill, Modifier.weight(1f))
                }
            }
        }
        Box(
            Modifier
                .fillMaxWidth()
                .background(Color.White)
                .padding(horizontal = 12.dp, vertical = 8.dp)
        ) {
            TextField(
                value = searchQuery,
                onValueChange = onSearchQueryChange,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(54.dp)
                    .border(1.dp, Line, RoundedCornerShape(9.dp)),
                placeholder = { Text("Cari IDPEL / Nama Pelanggan", fontSize = 12.sp, color = TextMuted) },
                leadingIcon = {
                    Icon(Icons.Outlined.Search, contentDescription = null, tint = BrightTeal, modifier = Modifier.size(18.dp))
                },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
                textStyle = MaterialTheme.typography.bodyMedium.copy(fontSize = 16.sp, fontWeight = FontWeight.Bold),
                colors = androidx.compose.material3.TextFieldDefaults.colors(
                    focusedContainerColor = Color.White,
                    unfocusedContainerColor = Color.White,
                    disabledContainerColor = Color.White,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                    cursorColor = BrightTeal
                )
            )
        }
    }
}

@Composable
private fun SyncProgressBanner(syncState: SyncState) {
    when (syncState) {
        SyncState.Idle -> Unit
        is SyncState.Running -> {
            Column(
                Modifier
                    .fillMaxWidth()
                    .background(Color.White)
                    .padding(horizontal = 12.dp, vertical = 6.dp)
            ) {
                LinearProgressIndicator(
                    progress = { syncState.progress.coerceIn(0f, 1f) },
                    modifier = Modifier.fillMaxWidth(),
                    color = BrightTeal,
                    trackColor = Color(0xFFE6EEF4)
                )
                Spacer(Modifier.height(4.dp))
                Text(syncState.message, fontSize = 11.sp, color = TextMuted)
            }
        }
        is SyncState.Done -> Unit
    }
}

@Composable
private fun DataUpdateBanner(
    dataNotice: DataUpdateNotice,
    syncState: SyncState,
    onRefresh: () -> Unit
) {
    val isLoading = syncState is SyncState.Running
    val message = when (dataNotice) {
        DataUpdateNotice.None -> "Data tunggakan Anda sudah terupdate."
        is DataUpdateNotice.UpdateAvailable -> "Update baru ditemukan - ${formatUpdateBannerTime(dataNotice.uploadedAt)}"
        is DataUpdateNotice.Updated -> "Data update ${formatUpdateBannerTime(dataNotice.uploadedAt)}"
    }
    val bg = when (dataNotice) {
        is DataUpdateNotice.UpdateAvailable -> Color(0xFFFFF8E1)
        else -> Color(0xFFE8F8EE)
    }
    val fg = when (dataNotice) {
        is DataUpdateNotice.UpdateAvailable -> Color(0xFF8A5700)
        else -> Color(0xFF1F7A3A)
    }
    Row(
        Modifier
            .fillMaxWidth()
            .background(bg)
            .padding(horizontal = 12.dp, vertical = 7.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = if (isLoading) "Memperbarui data..." else message,
            modifier = Modifier.weight(1f),
            color = fg,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        if (isLoading) {
            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = BrightTeal)
        } else {
            IconButton(onClick = onRefresh, modifier = Modifier.size(32.dp)) {
                Icon(Icons.Outlined.Refresh, contentDescription = "Refresh data", tint = BrightTeal, modifier = Modifier.size(19.dp))
            }
        }
    }
}

@Composable
private fun PremiumWarningBar(premiumStatus: PremiumStatus, onOpen: () -> Unit) {
    if (!premiumStatus.hasActivePeriod() || !premiumStatus.boundToOtherDevice) return
    Row(
        Modifier
            .fillMaxWidth()
            .background(Color(0xFFFFF8E1))
            .padding(horizontal = 12.dp, vertical = 7.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            "! Premium aktif di perangkat lain",
            modifier = Modifier.weight(1f),
            color = Color(0xFF8A5700),
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        Text(
            "Periksa",
            color = BrightTeal,
            fontSize = 12.sp,
            fontWeight = FontWeight.Black,
            modifier = Modifier.clickable { onOpen() }.padding(horizontal = 8.dp, vertical = 4.dp)
        )
    }
}

@Composable
private fun BottomNavigationBar(
    onHome: () -> Unit,
    onStruk: () -> Unit,
    onMenu: () -> Unit
) {
    Row(
        Modifier
            .fillMaxWidth()
            .background(Color.White)
            .border(1.dp, Line)
            .padding(horizontal = 12.dp, vertical = 7.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        BottomNavItem("Home", selected = true, onClick = onHome, modifier = Modifier.weight(1f)) {
            Icon(Icons.Outlined.Groups, contentDescription = null, tint = if (it) BrightTeal else TextMuted, modifier = Modifier.size(20.dp))
        }
        BottomNavItem("All Pelanggan", selected = false, onClick = onStruk, modifier = Modifier.weight(1f)) {
            Icon(Icons.Outlined.ReceiptLong, contentDescription = null, tint = if (it) BrightTeal else TextMuted, modifier = Modifier.size(20.dp))
        }
        BottomNavItem("Menu", selected = false, onClick = onMenu, modifier = Modifier.weight(1f)) {
            Icon(Icons.Outlined.Settings, contentDescription = null, tint = if (it) BrightTeal else TextMuted, modifier = Modifier.size(20.dp))
        }
    }
}

@Composable
private fun BottomNavItem(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: @Composable (Boolean) -> Unit
) {
    Column(
        modifier
            .height(46.dp)
            .background(if (selected) Color(0xFFE8F8FB) else Color.White, RoundedCornerShape(14.dp))
            .clickable { onClick() },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        icon(selected)
        Text(label, color = if (selected) BrightTeal else TextMuted, fontSize = 11.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun MoreMenuDialog(
    receiptSettings: ReceiptSettings,
    premiumStatus: PremiumStatus,
    isAdmin: Boolean,
    pendingPremiumCount: Int,
    onDismiss: () -> Unit,
    onAdminPremium: () -> Unit,
    onExportExcel: () -> Unit,
    onReceiptHistory: () -> Unit,
    onPrinter: () -> Unit,
    onSettings: () -> Unit,
    onUpgrade: () -> Unit,
    onVerifyDevice: () -> Unit,
    onLogout: () -> Unit
) {
    Dialog(onDismissRequest = onDismiss) {
        Card(shape = RoundedCornerShape(18.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
            Column(
                Modifier
                    .padding(16.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text("Menu", fontSize = 20.sp, fontWeight = FontWeight.Black, color = TextMain)
                Text("Fitur tambahan aplikasi", color = TextMuted, fontSize = 12.sp)
                Spacer(Modifier.height(8.dp))
                Text("DATA & TOOLS", color = TextMuted, fontSize = 11.sp, fontWeight = FontWeight.Black)
                MoreMenuItem("Riwayat Cetak", "Struk asli dan cetak ulang", onClick = onReceiptHistory) {
                    Icon(Icons.Outlined.ReceiptLong, contentDescription = null, tint = BrightTeal, modifier = Modifier.size(20.dp))
                }
                MoreMenuItem("Export Excel", "Download data berdasarkan KOLOK", onClick = onExportExcel) {
                    Icon(Icons.Outlined.ContentCopy, contentDescription = null, tint = BrightTeal, modifier = Modifier.size(20.dp))
                }
                MoreMenuItem(
                    if (receiptSettings.printerName.isBlank()) "RPP02N / Printer" else receiptSettings.printerName,
                    "Pilih printer struk",
                    onClick = onPrinter
                ) {
                    Icon(Icons.Outlined.ReceiptLong, contentDescription = null, tint = BrightTeal, modifier = Modifier.size(20.dp))
                }
                if (isAdmin) {
                    Spacer(Modifier.height(8.dp))
                    Text("ADMIN", color = TextMuted, fontSize = 11.sp, fontWeight = FontWeight.Black)
                    MoreMenuItem(
                        "Kelola Premium di Web",
                        "Akses premium dan rekap pembayaran",
                        onClick = onAdminPremium
                    ) {
                        Icon(Icons.Outlined.Lock, contentDescription = null, tint = Color(0xFFF39C12), modifier = Modifier.size(20.dp))
                    }
                }
                Spacer(Modifier.height(8.dp))
                Text("AKUN & APLIKASI", color = TextMuted, fontSize = 11.sp, fontWeight = FontWeight.Black)
                MoreMenuItem("Setting", "Pengaturan struk dan admin", onClick = onSettings) {
                    Icon(Icons.Outlined.Settings, contentDescription = null, tint = BrightTeal, modifier = Modifier.size(20.dp))
                }
                if (!isAdmin) {
                    MoreMenuItem(
                        if (premiumStatus.hasActivePeriod()) "Status Premium" else "Upgrade Premium",
                        if (premiumStatus.hasActivePeriod()) "Aktif sampai ${premiumStatus.activeUntil}" else "Hubungi admin untuk aktivasi",
                        onClick = onUpgrade
                    ) {
                        Icon(Icons.Outlined.ReceiptLong, contentDescription = null, tint = BrightTeal, modifier = Modifier.size(20.dp))
                    }
                }
                if (!isAdmin && premiumStatus.boundToOtherDevice) {
                    MoreMenuItem("Verifikasi Device", "Minta admin ACC ulang perangkat", onClick = onVerifyDevice) {
                        Icon(Icons.Outlined.Refresh, contentDescription = null, tint = Color(0xFFF39C12), modifier = Modifier.size(20.dp))
                    }
                }
                Spacer(Modifier.height(8.dp))
                MoreMenuItem("Logout", "Keluar dari akun petugas", onClick = onLogout, danger = true) {
                    Icon(Icons.Outlined.Logout, contentDescription = null, tint = Color(0xFFD64545), modifier = Modifier.size(20.dp))
                }
            }
        }
    }
}

@Composable
private fun AdminPremiumDialog(
    requests: List<PremiumAdminRequest>,
    busyId: String?,
    onDismiss: () -> Unit,
    onRefresh: () -> Unit,
    onOpenProof: (PremiumAdminRequest) -> Unit,
    onApprove: (PremiumAdminRequest) -> Unit,
    onReject: (PremiumAdminRequest) -> Unit
) {
    Dialog(onDismissRequest = onDismiss) {
        Card(
            shape = RoundedCornerShape(18.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            modifier = Modifier.fillMaxWidth().height(580.dp)
        ) {
            Column(Modifier.fillMaxSize().padding(14.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Pengajuan Premium", fontSize = 19.sp, fontWeight = FontWeight.Black, color = TextMain)
                        Text("${requests.size} pengajuan menunggu pemeriksaan", color = TextMuted, fontSize = 11.sp)
                    }
                    Text(
                        "Refresh",
                        color = BrightTeal,
                        fontWeight = FontWeight.Black,
                        modifier = Modifier.clickable(enabled = busyId == null) { onRefresh() }.padding(8.dp)
                    )
                }
                Spacer(Modifier.height(10.dp))
                if (requests.isEmpty()) {
                    Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                        Text("Belum ada pengajuan Premium.", color = TextMuted)
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.weight(1f).fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(9.dp)
                    ) {
                        items(requests, key = { it.id }) { request ->
                            val isDeviceReset = request.requestType == "device_reset"
                            val isBusy = busyId == request.id
                            Card(
                                shape = RoundedCornerShape(12.dp),
                                colors = CardDefaults.cardColors(containerColor = Color(0xFFF7FBFD)),
                                modifier = Modifier.fillMaxWidth().border(1.dp, Line, RoundedCornerShape(12.dp))
                            ) {
                                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                        Column(Modifier.weight(1f)) {
                                            Text(request.username, color = TextMain, fontWeight = FontWeight.Black, fontSize = 15.sp)
                                            Text(
                                                if (isDeviceReset) "VERIFIKASI DEVICE" else "${request.packageCode} - ${formatRupiah(request.amount.toDouble())}",
                                                color = if (isDeviceReset) Color(0xFFF39C12) else BrightTeal,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 12.sp
                                            )
                                        }
                                        if (isBusy) CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 2.dp, color = BrightTeal)
                                    }
                                    Text(
                                        "Dikirim ${request.createdAt.takeIf(String::isNotBlank)?.let(::formatDataVersionTime).orEmpty()}",
                                        color = TextMuted,
                                        fontSize = 11.sp
                                    )
                                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                                        if (!isDeviceReset && request.proofPath.isNotBlank() && request.proofPath != "-") {
                                            AdminActionButton(
                                                label = "Bukti",
                                                color = BrightTeal,
                                                enabled = busyId == null,
                                                onClick = { onOpenProof(request) },
                                                modifier = Modifier.weight(1f)
                                            )
                                        }
                                        AdminActionButton(
                                            label = if (isDeviceReset) "ACC Device" else "ACC 30 Hari",
                                            color = Color(0xFF178A52),
                                            enabled = busyId == null,
                                            onClick = { onApprove(request) },
                                            modifier = Modifier.weight(1f)
                                        )
                                        AdminActionButton(
                                            label = "Tolak",
                                            color = Color(0xFFD64545),
                                            enabled = busyId == null,
                                            onClick = { onReject(request) },
                                            modifier = Modifier.weight(1f)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
                Spacer(Modifier.height(10.dp))
                AdminActionButton(
                    label = "Tutup",
                    color = DeepTeal,
                    enabled = busyId == null,
                    onClick = onDismiss,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    }
}

@Composable
private fun AdminActionButton(
    label: String,
    color: Color,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier
            .height(40.dp)
            .background(if (enabled) color else Color(0xFFB8C2CC), RoundedCornerShape(9.dp))
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Text(label, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Black)
    }
}

@Composable
private fun MoreMenuItem(
    title: String,
    subtitle: String,
    danger: Boolean = false,
    onClick: () -> Unit,
    icon: @Composable () -> Unit
) {
    Row(
        Modifier
            .fillMaxWidth()
            .background(Color.White, RoundedCornerShape(12.dp))
            .clickable { onClick() }
            .padding(vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.size(38.dp).background(if (danger) Color(0xFFFFECEC) else Color(0xFFEAF5F9), RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
            icon()
        }
        Column(Modifier.weight(1f)) {
            Text(title, color = if (danger) Color(0xFFD64545) else TextMain, fontWeight = FontWeight.Black, fontSize = 14.sp)
            Text(subtitle, color = TextMuted, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Text(">", color = TextMuted, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun HeaderDecorations() {
    Canvas(Modifier.fillMaxSize()) {
        drawCircle(Color(0x33002132), radius = size.width * 0.46f, center = androidx.compose.ui.geometry.Offset(size.width * 0.08f, -size.width * 0.18f))
        drawCircle(Color(0x5516C4D7), radius = size.width * 0.18f, center = androidx.compose.ui.geometry.Offset(size.width * 1.02f, size.height * 0.46f))
        repeat(6) { x ->
            repeat(4) { y ->
                drawCircle(
                    Color(0xFF26BDE0),
                    radius = 3.dp.toPx(),
                    center = androidx.compose.ui.geometry.Offset(size.width * 0.82f + x * 18.dp.toPx(), size.height * 0.12f + y * 18.dp.toPx())
                )
            }
        }
    }
}

@Composable
private fun ActionButton(
    text: String,
    filled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: @Composable () -> Unit
) {
    val bg = if (filled) BrightTeal else Color.White
    val fg = if (filled) Color.White else BrightTeal
    Row(
        modifier
            .height(40.dp)
            .background(bg, RoundedCornerShape(10.dp))
            .border(1.dp, BrightTeal, RoundedCornerShape(10.dp))
            .clickable { onClick() },
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        icon()
        Spacer(Modifier.width(8.dp))
        Text(text, color = fg, fontWeight = FontWeight.Bold, fontSize = 14.sp)
    }
}

@Composable
private fun CompactMenuButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: @Composable () -> Unit
) {
    Row(
        modifier
            .height(32.dp)
            .background(Color.White, RoundedCornerShape(9.dp))
            .border(1.dp, Line, RoundedCornerShape(9.dp))
            .clickable { onClick() }
            .padding(horizontal = 8.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        icon()
        Spacer(Modifier.width(5.dp))
        Text(text, color = TextMain, fontWeight = FontWeight.Bold, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun SummaryCard(title: String, value: String, icon: SummaryIcon, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 5.dp)
    ) {
        Row(Modifier.padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier
                    .size(34.dp)
                    .background(Color(0xFFEAF5F9), RoundedCornerShape(50)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = if (icon == SummaryIcon.People) Icons.Outlined.Groups else Icons.Outlined.ReceiptLong,
                    contentDescription = null,
                    tint = BrightTeal,
                    modifier = Modifier.size(20.dp)
                )
            }
            Spacer(Modifier.width(8.dp))
            Column {
                Text(title, fontSize = 11.sp, color = TextMuted)
                Text(value, fontSize = 15.sp, fontWeight = FontWeight.Black, color = TextMain, maxLines = 1)
            }
        }
    }
}

@Composable
private fun KolokHeader(header: DisplayRow.GroupHeader, collapsed: Boolean, onToggle: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 2.dp)
            .clickable { onToggle() },
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFEAF6FB)),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(Modifier.weight(1f)) {
                Text("KOLOK", fontSize = 11.sp, color = BrightTeal, fontWeight = FontWeight.Bold)
                Text(header.kolok.ifBlank { "-" }, fontSize = 17.sp, color = TextMain, fontWeight = FontWeight.Black)
            }
            Box(Modifier.width(1.dp).height(36.dp).background(Line))
            Column(horizontalAlignment = Alignment.End) {
                Text("${header.count} pelanggan", fontSize = 12.sp, color = TextMuted)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(formatRupiah(header.total), fontSize = 16.sp, color = BrightTeal, fontWeight = FontWeight.Black)
                    Spacer(Modifier.width(6.dp))
                    Icon(
                        if (collapsed) Icons.Outlined.ExpandMore else Icons.Outlined.ExpandLess,
                        contentDescription = if (collapsed) "Buka KOLOK" else "Tutup KOLOK",
                        tint = BrightTeal,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun CustomerCard(
    row: CustomerDebt,
    mark: CustomerMark,
    onColorChange: () -> Unit,
    onPrint: () -> Unit
) {
    val clipboard = LocalClipboardManager.current
    val context = LocalContext.current
    val background = MarkColors.getOrElse(mark.colorIndex) { Color.White }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp)
            .border(1.dp, Line, RoundedCornerShape(10.dp)),
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(containerColor = background),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(Modifier.padding(horizontal = 12.dp, vertical = 9.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("ID PEL", fontSize = 11.sp, color = BrightTeal, fontWeight = FontWeight.Bold)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(row.idpel, fontSize = 16.sp, color = TextMain, fontWeight = FontWeight.Black)
                            IconButton(onClick = {
                                clipboard.setText(AnnotatedString(row.idpel))
                                Toast.makeText(context, "IDPEL disalin", Toast.LENGTH_SHORT).show()
                            }, modifier = Modifier.size(34.dp)) {
                                Icon(Icons.Outlined.ContentCopy, contentDescription = "Salin IDPEL", tint = BrightTeal, modifier = Modifier.size(20.dp))
                            }
                        }
                    }
                    Text(formatRupiah(row.rptag), fontWeight = FontWeight.Black, color = BrightTeal, fontSize = 16.sp)
                }
                Text(row.nama.ifBlank { "-" }, fontSize = 15.sp, fontWeight = FontWeight.Black, color = TextMain, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "${row.tarif} / ${row.daya} | Lembar ${row.lembar} | KOLOK ${row.kolok.ifBlank { "-" }} | KOKED ${row.koked.ifBlank { "-" }}",
                        fontSize = 12.sp,
                        color = TextMuted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        row.alamat.ifBlank { "-" },
                        modifier = Modifier.weight(1f),
                        fontSize = 12.sp,
                        color = TextMuted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Spacer(Modifier.width(8.dp))
                    Row(
                        Modifier
                            .background(Color(0xFFE8F8FB), RoundedCornerShape(8.dp))
                            .clickable { onPrint() }
                            .padding(horizontal = 9.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Outlined.ReceiptLong, contentDescription = null, tint = BrightTeal, modifier = Modifier.size(14.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Cetak", color = BrightTeal, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    }
                    Spacer(Modifier.width(6.dp))
                    Row(
                        Modifier
                            .background(Color(0xFFFFF4DF), RoundedCornerShape(8.dp))
                            .clickable { onColorChange() }
                            .padding(horizontal = 10.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Outlined.WaterDrop, contentDescription = null, tint = Color(0xFFF39C12), modifier = Modifier.size(15.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Warna", color = Color(0xFFF39C12), fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun ReceiptSettingsDialog(
    initial: ReceiptSettings,
    onDismiss: () -> Unit,
    onSave: (ReceiptSettings) -> Unit
) {
    var namaToko by remember { mutableStateOf(initial.namaToko) }
    var alamatToko by remember { mutableStateOf(initial.alamatToko) }
    var adminFee by remember { mutableStateOf(initial.adminFee.toLong().toString()) }

    Dialog(onDismissRequest = onDismiss) {
        Card(shape = RoundedCornerShape(14.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Setting Struk", fontSize = 18.sp, fontWeight = FontWeight.Black, color = TextMain)
                TextField(value = namaToko, onValueChange = { namaToko = it }, label = { Text("Nama toko") }, modifier = Modifier.fillMaxWidth())
                TextField(value = alamatToko, onValueChange = { alamatToko = it }, label = { Text("Alamat toko") }, modifier = Modifier.fillMaxWidth())
                TextField(
                    value = adminFee,
                    onValueChange = { adminFee = it.filter(Char::isDigit) },
                    label = { Text("Biaya admin") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth()
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    DialogButton("Batal", filled = false, onClick = onDismiss, modifier = Modifier.weight(1f))
                    DialogButton("Simpan", filled = true, onClick = {
                        onSave(
                            initial.copy(
                                namaToko = namaToko.ifBlank { "PLN MOBILE" },
                                alamatToko = alamatToko.ifBlank { "PLN ULP SABAK" },
                                adminFee = adminFee.toDoubleOrNull() ?: 0.0
                            )
                        )
                    }, modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun PrinterDialog(
    devices: List<ThermalPrinterDevice>,
    scanning: Boolean,
    selected: ReceiptSettings,
    onDismiss: () -> Unit,
    onScan: () -> Unit,
    onSelect: (ThermalPrinterDevice) -> Unit
) {
    Dialog(onDismissRequest = onDismiss) {
        Card(shape = RoundedCornerShape(14.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Printer Bluetooth", fontSize = 18.sp, fontWeight = FontWeight.Black, color = TextMain)
                Text("Klik Cari Printer, lalu pilih printer thermal. Aplikasi akan menyimpan printer pilihan.", color = TextMuted, fontSize = 12.sp)
                DialogButton(
                    if (scanning) "Mencari..." else "Cari Printer",
                    filled = true,
                    onClick = { if (!scanning) onScan() },
                    modifier = Modifier.fillMaxWidth()
                )
                if (devices.isEmpty()) {
                    Text("Belum ada printer terdeteksi. Nyalakan printer, lalu tekan Cari Printer.", color = TextMuted, fontSize = 13.sp)
                } else {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(300.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        items(devices, key = { it.address }) { device ->
                            val active = device.address == selected.printerAddress
                            Row(
                                Modifier
                                    .fillMaxWidth()
                                    .background(if (active) Color(0xFFE8F8FB) else Color.White, RoundedCornerShape(8.dp))
                                    .border(1.dp, if (active) BrightTeal else Line, RoundedCornerShape(8.dp))
                                    .clickable { onSelect(device) }
                                    .padding(10.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(device.name, fontWeight = FontWeight.Bold, color = TextMain)
                                    Text("${device.address} ${if (device.bonded) "- Terhubung" else "- Belum pair"}", color = TextMuted, fontSize = 12.sp)
                                }
                                if (active) Text("Aktif", color = BrightTeal, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                            }
                        }
                    }
                }
                DialogButton("Tutup", filled = false, onClick = onDismiss, modifier = Modifier.fillMaxWidth())
            }
        }
    }
}

@Composable
private fun PrintListDialog(
    rows: List<CustomerDebt>,
    onDismiss: () -> Unit,
    onPrint: (CustomerDebt) -> Unit,
    onSearchIdpel: (String) -> Unit
) {
    var query by remember { mutableStateOf("") }
    val visibleRows = remember(rows, query) {
        rows.filter {
            val q = query.trim()
            q.isBlank() || it.idpel.contains(q, true) || it.nama.contains(q, true)
        }.take(80)
    }

    Dialog(onDismissRequest = onDismiss) {
        Card(shape = RoundedCornerShape(14.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Cetak Struk", fontSize = 18.sp, fontWeight = FontWeight.Black, color = TextMain)
                TextField(value = query, onValueChange = { query = it }, label = { Text("IDPEL") }, modifier = Modifier.fillMaxWidth())
                DialogButton(
                    "CARI IDPEL",
                    filled = true,
                    onClick = {
                        val idpel = query.trim()
                        if (idpel.isNotBlank()) onSearchIdpel(idpel)
                    },
                    modifier = Modifier.fillMaxWidth()
                )
                Text("Bisa cetak IDPEL saldo akhir walaupun tidak tampil di list petugas.", color = TextMuted, fontSize = 11.sp)
                LazyColumn(Modifier.height(360.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(visibleRows, key = { it.idpel }) { row ->
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .border(1.dp, Line, RoundedCornerShape(8.dp))
                                .clickable { onPrint(row) }
                                .padding(9.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(row.idpel, fontWeight = FontWeight.Black, color = TextMain)
                                Text(row.nama, color = TextMuted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                            Text("Cetak", color = BrightTeal, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                        }
                    }
                }
                DialogButton("Tutup", filled = false, onClick = onDismiss, modifier = Modifier.fillMaxWidth())
            }
        }
    }
}

@Composable
private fun ExportExcelDialog(
    username: String,
    rows: List<CustomerDebt>,
    onDismiss: () -> Unit,
    onMessage: (String) -> Unit
) {
    val context = LocalContext.current
    val kolokOptions = remember(rows) { rows.map { normalizeExportKolok(it.kolok) }.distinct().sorted() }
    var selectedKoloks by remember(rows) { mutableStateOf(kolokOptions.toSet()) }
    var adminText by remember { mutableStateOf("0") }
    val adminAmount = parseExportAdminAmount(adminText)
    val exportRows = rows.filter { selectedKoloks.contains(normalizeExportKolok(it.kolok)) }
    val totalTagihan = exportRows.sumOf { it.rptag }
    val totalAdmin = adminAmount * exportRows.size
    val grandTotal = totalTagihan + totalAdmin

    Dialog(onDismissRequest = onDismiss) {
        Card(shape = RoundedCornerShape(14.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
            Column(
                Modifier
                    .padding(14.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text("Export Excel", fontSize = 18.sp, fontWeight = FontWeight.Black, color = TextMain)
                Text("Pilih KOLOK yang ingin diexport, lalu isi admin per pelanggan.", color = TextMuted, fontSize = 12.sp)
                TextField(
                    value = adminText,
                    onValueChange = { adminText = normalizeIdpel(it) },
                    label = { Text("Admin per pelanggan") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    DialogButton("Semua KOLOK", filled = false, onClick = { selectedKoloks = kolokOptions.toSet() }, modifier = Modifier.weight(1f))
                    DialogButton("Kosongkan", filled = false, onClick = { selectedKoloks = emptySet() }, modifier = Modifier.weight(1f))
                }
                kolokOptions.forEach { kolok ->
                    val selected = selectedKoloks.contains(kolok)
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .background(if (selected) Color(0xFFE8F8FB) else Color.White, RoundedCornerShape(9.dp))
                            .border(1.dp, if (selected) BrightTeal else Line, RoundedCornerShape(9.dp))
                            .clickable {
                                selectedKoloks = if (selected) selectedKoloks - kolok else selectedKoloks + kolok
                            }
                            .padding(10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("KOLOK $kolok", modifier = Modifier.weight(1f), fontWeight = FontWeight.Bold, color = TextMain)
                        Text(if (selected) "Dipilih" else "Tidak", color = if (selected) BrightTeal else TextMuted, fontSize = 12.sp)
                    }
                }
                SummaryCard("Pelanggan Export", exportRows.size.toString(), SummaryIcon.People, Modifier.fillMaxWidth())
                SummaryCard("Total + Admin", formatRupiah(grandTotal), SummaryIcon.Bill, Modifier.fillMaxWidth())
                Text("Tagihan ${formatRupiah(totalTagihan)} + Admin ${formatRupiah(totalAdmin)}", color = TextMuted, fontSize = 12.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    DialogButton("Batal", filled = false, onClick = onDismiss, modifier = Modifier.weight(1f))
                    DialogButton(
                        "Export",
                        filled = true,
                        onClick = {
                            if (exportRows.isEmpty()) {
                                onMessage("Pilih minimal satu KOLOK.")
                                return@DialogButton
                            }
                            runCatching {
                                exportCustomerDebtsToExcel(context, username, exportRows, selectedKoloks, adminAmount)
                            }.onSuccess {
                                onDismiss()
                                onMessage("File Excel dibuat. Pilih aplikasi untuk menyimpan atau membagikan.")
                            }.onFailure {
                                onMessage("Gagal export: ${it.message ?: "terjadi kesalahan."}")
                            }
                        },
                        modifier = Modifier.weight(1f)
                    )
                }
            }
        }
    }
}

@Composable
private fun UpgradePremiumDialog(
    username: String,
    accessToken: String,
    api: SupabaseApi,
    freshSession: () -> UserSession,
    currentStatus: PremiumStatus,
    onDismiss: () -> Unit,
    onSubmitted: () -> Unit,
    onMessage: (String) -> Unit
) {
    val context = LocalContext.current
    var selectedPackage by remember { mutableStateOf("P1") }
    var proofUri by remember { mutableStateOf<Uri?>(null) }
    var submitting by remember { mutableStateOf(false) }
    val proofPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        proofUri = uri
    }

    Dialog(onDismissRequest = { if (!submitting) onDismiss() }) {
        Card(shape = RoundedCornerShape(14.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
            Column(
                Modifier
                    .padding(16.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text("Upgrade Premium", fontSize = 18.sp, fontWeight = FontWeight.Black, color = TextMain)
                Text(
                    if (currentStatus.isActive()) "Status saat ini: ${currentStatus.packageCode} aktif sampai ${currentStatus.activeUntil}"
                    else "Status saat ini: FREE",
                    color = TextMuted,
                    fontSize = 12.sp
                )
                listOf("P1", "P2", "P3").forEach { packageCode ->
                    val selected = selectedPackage == packageCode
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .background(if (selected) Color(0xFFE8F8FB) else Color.White, RoundedCornerShape(9.dp))
                            .border(1.dp, if (selected) BrightTeal else Line, RoundedCornerShape(9.dp))
                            .clickable(enabled = !submitting) { selectedPackage = packageCode }
                            .padding(10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(premiumPackageTitle(packageCode), color = TextMain, fontWeight = FontWeight.Black)
                            Text(premiumPackageBenefit(packageCode), color = TextMuted, fontSize = 11.sp)
                        }
                        Text(formatRupiah(premiumPackageAmount(packageCode).toDouble()), color = BrightTeal, fontWeight = FontWeight.Black)
                    }
                }
                Text("Scan QRIS ini sesuai nominal paket, lalu upload screenshot/foto bukti pembayaran.", color = TextMuted, fontSize = 12.sp)
                Image(
                    painter = painterResource(id = R.drawable.qris_premium),
                    contentDescription = "QRIS SIMONTOK Super APP",
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(360.dp)
                        .background(Color.White, RoundedCornerShape(10.dp))
                        .border(1.dp, Line, RoundedCornerShape(10.dp))
                        .padding(8.dp),
                    contentScale = ContentScale.Fit
                )
                DialogButton(
                    if (proofUri == null) "Pilih Bukti Pembayaran" else "Bukti Terpilih",
                    filled = false,
                    onClick = { proofPicker.launch("image/*") },
                    modifier = Modifier.fillMaxWidth()
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    DialogButton("Batal", filled = false, onClick = onDismiss, modifier = Modifier.weight(1f))
                    DialogButton(
                        if (submitting) "Mengirim..." else "Kirim",
                        filled = true,
                        onClick = {
                            val uri = proofUri
                            if (uri == null) {
                                onMessage("Pilih bukti pembayaran dulu.")
                                return@DialogButton
                            }
                            submitting = true
                            thread {
                                val result = runCatching {
                                    val fresh = freshSession()
                                    val mime = context.contentResolver.getType(uri) ?: "image/jpeg"
                                    val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                                        ?: throw IllegalStateException("Bukti pembayaran tidak bisa dibaca.")
                                    api.submitPremiumRequest(fresh.accessToken, username, selectedPackage, bytes, mime)
                                }
                                runOnMainThread {
                                    submitting = false
                                    result.onSuccess { onSubmitted() }
                                        .onFailure { onMessage("Gagal kirim pengajuan: ${it.message ?: "periksa koneksi."}") }
                                }
                            }
                        },
                        modifier = Modifier.weight(1f)
                    )
                }
            }
        }
    }
}

@Composable
private fun MessageDialog(message: String, onDismiss: () -> Unit) {
    Dialog(onDismissRequest = onDismiss) {
        Card(shape = RoundedCornerShape(14.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(message, color = TextMain)
                DialogButton("OK", filled = true, onClick = onDismiss, modifier = Modifier.fillMaxWidth())
            }
        }
    }
}

@Composable
internal fun ReceiptPreviewDialog(
    preview: ReceiptPreview,
    premiumStatus: PremiumStatus,
    onDismiss: () -> Unit,
    onPrint: () -> Unit
) {
    var extraText by remember(preview.row.idpel) { mutableStateOf("") }
    var errorText by remember(preview.row.idpel, premiumStatus) { mutableStateOf<String?>(null) }
    val maxExtra = premiumExtraLimit(premiumStatus)
    val extra = extraText.filter(Char::isDigit).toDoubleOrNull() ?: 0.0
    val normalizedExtra = extra.coerceAtMost(maxExtra ?: extra)
    val snapshot = remember(preview, normalizedExtra) {
        ReceiptSnapshot.create(preview.identity, preview.row, preview.meter, preview.settings, normalizedExtra.toLong())
    }
    val previewText = snapshot.text

    Dialog(onDismissRequest = onDismiss) {
        Card(shape = RoundedCornerShape(14.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Print Preview", fontSize = 18.sp, fontWeight = FontWeight.Black, color = TextMain)
                Text("${preview.row.idpel} - ${preview.row.nama}", color = TextMuted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (premiumStatus.isActive()) {
                    TextField(
                        value = extraText,
                        onValueChange = { raw ->
                            val clean = normalizeIdpel(raw).take(12)
                            val value = clean.toDoubleOrNull() ?: 0.0
                            if (maxExtra != null && value > maxExtra) {
                                extraText = maxExtra.toLong().toString()
                                errorText = "Maksimal tambahan ${formatRupiah(maxExtra)} untuk ${premiumStatus.packageCode}."
                            } else {
                                extraText = clean
                                errorText = null
                            }
                        },
                        label = { Text("Tambah tagihan") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                    )
                    Text(
                        errorText ?: premiumExtraInfo(premiumStatus),
                        color = if (errorText == null) TextMuted else Color(0xFFB42318),
                        fontSize = 11.sp
                    )
                } else {
                    Text(if (premiumStatus.hasActivePeriod()) "Premium belum terhubung ke perangkat ini. Periksa Status Premium pada Menu." else "Fitur tambah tagihan khusus user premium.", color = TextMuted, fontSize = 11.sp)
                }
                LazyColumn(
                    modifier = Modifier
                        .height(320.dp)
                        .fillMaxWidth()
                        .background(Color(0xFFF8FAFC), RoundedCornerShape(8.dp))
                        .border(1.dp, Line, RoundedCornerShape(8.dp))
                        .padding(10.dp)
                ) {
                    item {
                        Text(previewText, color = TextMain, fontSize = 13.sp, lineHeight = 17.sp)
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    DialogButton("Batal", filled = false, onClick = onDismiss, modifier = Modifier.weight(1f))
                    DialogButton("Cetak", filled = true, onClick = {
                        preview.snapshot = snapshot
                        onPrint()
                    }, modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun DialogButton(text: String, filled: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier
            .height(42.dp)
            .background(if (filled) BrightTeal else Color.White, RoundedCornerShape(9.dp))
            .border(1.dp, BrightTeal, RoundedCornerShape(9.dp))
            .clickable { onClick() },
        contentAlignment = Alignment.Center
    ) {
        Text(text, color = if (filled) Color.White else BrightTeal, fontWeight = FontWeight.Bold)
    }
}

private fun prepareReceiptPreview(
    row: CustomerDebt,
    accessToken: String,
    api: SupabaseApi,
    settings: ReceiptSettings,
    premiumStatus: PremiumStatus,
    onReady: (ReceiptPreview) -> Unit,
    onMessage: (String) -> Unit
) {
    thread {
        val result = runCatching {
            val meter = AppMemoryCache.home?.meters?.get(row.idpel)
                ?: runCatching { api.fetchReceiptMeter(accessToken, row.idpel) }.getOrNull()
            ReceiptPreview(row, meter, settings)
        }

        runOnMainThread {
            result.onSuccess(onReady)
                .onFailure { onMessage("Gagal menyiapkan preview: ${it.message ?: "periksa data stand meter."}") }
        }
    }
}

private fun searchReceiptByIdpel(
    idpel: String,
    accessToken: String,
    api: SupabaseApi,
    settings: ReceiptSettings,
    premiumStatus: PremiumStatus,
    onReady: (ReceiptPreview) -> Unit,
    onMessage: (String) -> Unit
) {
    thread {
        val result = runCatching {
            val normalized = normalizeIdpel(idpel)
            val row = AppMemoryCache.home?.allRows?.firstOrNull { normalizeIdpel(it.idpel) == normalized }
                ?: api.fetchRemainingCustomerByIdpel(accessToken, normalized)
                ?: throw IllegalStateException("IDPEL $normalized tidak ditemukan di saldo akhir.")
            val meter = AppMemoryCache.home?.meters?.get(row.idpel)
                ?: runCatching { api.fetchReceiptMeter(accessToken, row.idpel) }.getOrNull()
            ReceiptPreview(row, meter, settings)
        }

        runOnMainThread {
            result.onSuccess(onReady)
                .onFailure { onMessage("Gagal mencari IDPEL: ${it.message ?: "periksa data online."}") }
        }
    }
}

private fun printPreparedReceipt(
    snapshot: ReceiptSnapshot,
    username: String,
    context: Context,
    settings: ReceiptSettings,
    printer: BluetoothReceiptPrinter,
    onMessage: (String) -> Unit
) {
    thread {
        val message = runCatching {
            sendReceiptAndRecord(context, username, snapshot, false) { printer.print(settings.printerAddress, it) }
            "Struk berhasil dikirim ke printer."
        }.getOrElse {
            "Gagal cetak struk: ${it.message ?: "periksa printer dan data stand meter."}"
        }
        runOnMainThread { onMessage(message) }
    }
}

private fun exportCustomerDebtsToExcel(
    context: Context,
    username: String,
    rows: List<CustomerDebt>,
    selectedKoloks: Set<String>,
    adminAmount: Double
) {
    val sortedRows = sortCustomerRows(rows)
    val totalTagihan = sortedRows.sumOf { it.rptag }
    val totalAdmin = adminAmount * sortedRows.size
    val grandTotal = totalTagihan + totalAdmin
    val dateText = SimpleDateFormat("dd-MM-yyyy HH:mm", Locale("id", "ID")).format(Date())
    val fileDate = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date())
    val kolokLabel = selectedKoloks.sorted().joinToString("-").ifBlank { "SEMUA" }
    val safeUsername = username.lowercase(Locale.US).replace(Regex("[^a-z0-9]+"), "-").trim('-').ifBlank { "petugas" }
    val fileName = "simontok-export-$safeUsername-$fileDate.xls"
    val html = buildExportExcelHtml(
        username = username,
        kolokLabel = kolokLabel,
        dateText = dateText,
        rows = sortedRows,
        adminAmount = adminAmount,
        totalTagihan = totalTagihan,
        totalAdmin = totalAdmin,
        grandTotal = grandTotal
    )

    val exportDir = File(context.cacheDir, "exports").apply { mkdirs() }
    val file = File(exportDir, fileName)
    file.writeText(html, Charsets.UTF_8)
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "application/vnd.ms-excel"
        putExtra(Intent.EXTRA_STREAM, uri)
        putExtra(Intent.EXTRA_SUBJECT, "Export Excel SIMONTOK $kolokLabel")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    context.startActivity(Intent.createChooser(intent, "Simpan atau bagikan Excel"))
}

private fun buildExportExcelHtml(
    username: String,
    kolokLabel: String,
    dateText: String,
    rows: List<CustomerDebt>,
    adminAmount: Double,
    totalTagihan: Double,
    totalAdmin: Double,
    grandTotal: Double
): String {
    val headers = listOf(
        "NO",
        "IDPEL",
        "NAMA",
        "TARIF",
        "DAYA",
        "ALAMAT",
        "LEMBAR",
        "KOLOK",
        "KOKED",
        "RP TAGIHAN",
        "ADMIN",
        "TOTAL TAGIHAN + ADMIN"
    )
    val numericColumns = setOf(0, 6, 9, 10, 11)
    val dataRows = rows.mapIndexed { index, row ->
        val total = row.rptag + adminAmount
        listOf(
            (index + 1).toString(),
            row.idpel,
            row.nama,
            row.tarif,
            row.daya,
            row.alamat,
            row.lembar.toString(),
            row.kolok,
            row.koked,
            excelNumber(row.rptag),
            excelNumber(adminAmount),
            excelNumber(total)
        )
    }
    val totalValues = listOf(
        excelNumber(totalTagihan),
        excelNumber(totalAdmin),
        excelNumber(grandTotal)
    )
    val columnWidths = headers.indices.map { index ->
        excelColumnWidth(listOf(headers[index]) + dataRows.map { it[index] })
    }.toMutableList()
    columnWidths[5] = columnWidths[5].coerceAtLeast(230)
    columnWidths[9] = columnWidths[9].coerceAtLeast(105)
    columnWidths[10] = columnWidths[10].coerceAtLeast(90)
    columnWidths[11] = columnWidths[11].coerceAtLeast(145)

    return """
    <?xml version="1.0" encoding="UTF-8"?>
    <?mso-application progid="Excel.Sheet"?>
    <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
      xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
      <Styles>
        <Style ss:ID="Default" ss:Name="Normal">
          <Font ss:FontName="Arial" ss:Size="10"/>
          <Alignment ss:Vertical="Center"/>
        </Style>
        <Style ss:ID="Title">
          <Font ss:FontName="Arial" ss:Size="14" ss:Bold="1"/>
        </Style>
        <Style ss:ID="Meta">
          <Font ss:FontName="Arial" ss:Size="10"/>
        </Style>
        <Style ss:ID="Header">
          <Font ss:FontName="Arial" ss:Size="10" ss:Bold="1"/>
          <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
          <Interior ss:Color="#D9EAF7" ss:Pattern="Solid"/>
          ${excelBorderXml()}
        </Style>
        <Style ss:ID="CellText">
          <Alignment ss:Vertical="Center"/>
          ${excelBorderXml()}
        </Style>
        <Style ss:ID="CellNumber">
          <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
          <NumberFormat ss:Format="#,##0"/>
          ${excelBorderXml()}
        </Style>
        <Style ss:ID="TotalLabel">
          <Font ss:FontName="Arial" ss:Size="10" ss:Bold="1"/>
          <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
          <Interior ss:Color="#FFF2CC" ss:Pattern="Solid"/>
          ${excelBorderXml()}
        </Style>
        <Style ss:ID="TotalNumber">
          <Font ss:FontName="Arial" ss:Size="10" ss:Bold="1"/>
          <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
          <NumberFormat ss:Format="#,##0"/>
          <Interior ss:Color="#FFF2CC" ss:Pattern="Solid"/>
          ${excelBorderXml()}
        </Style>
      </Styles>
      <Worksheet ss:Name="Export">
        <Table>
          ${columnWidths.joinToString("\n") { """<Column ss:AutoFitWidth="1" ss:Width="$it"/>""" }}
          <Row><Cell ss:MergeAcross="11" ss:StyleID="Title"><Data ss:Type="String">EXPORT TUNGGAKAN SIMONTOK</Data></Cell></Row>
          <Row><Cell ss:StyleID="Meta"><Data ss:Type="String">Petugas</Data></Cell><Cell ss:MergeAcross="10" ss:StyleID="Meta"><Data ss:Type="String">: ${escapeExcel(username)}</Data></Cell></Row>
          <Row><Cell ss:StyleID="Meta"><Data ss:Type="String">KOLOK</Data></Cell><Cell ss:MergeAcross="10" ss:StyleID="Meta"><Data ss:Type="String">: ${escapeExcel(kolokLabel)}</Data></Cell></Row>
          <Row><Cell ss:StyleID="Meta"><Data ss:Type="String">Waktu Export</Data></Cell><Cell ss:MergeAcross="10" ss:StyleID="Meta"><Data ss:Type="String">: ${escapeExcel(dateText)}</Data></Cell></Row>
          <Row><Cell ss:StyleID="Meta"><Data ss:Type="String">Admin per pelanggan</Data></Cell><Cell ss:MergeAcross="10" ss:StyleID="Meta"><Data ss:Type="Number">${excelNumber(adminAmount)}</Data></Cell></Row>
          <Row/>
          ${excelXmlRow(headers, "Header", emptySet())}
          ${dataRows.joinToString("\n") { excelXmlRow(it, "CellText", numericColumns) }}
          <Row>
            <Cell ss:MergeAcross="8" ss:StyleID="TotalLabel"><Data ss:Type="String">TOTAL</Data></Cell>
            ${totalValues.joinToString("") { """<Cell ss:StyleID="TotalNumber"><Data ss:Type="Number">$it</Data></Cell>""" }}
          </Row>
        </Table>
        <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
          <FreezePanes/>
          <FrozenNoSplit/>
          <SplitHorizontal>7</SplitHorizontal>
          <TopRowBottomPane>7</TopRowBottomPane>
          <ActivePane>2</ActivePane>
        </WorksheetOptions>
      </Worksheet>
    </Workbook>
    """.trimIndent()
}

private fun excelXmlRow(values: List<String>, styleId: String, numericColumns: Set<Int>): String {
    return values.mapIndexed { index, value ->
        val isNumber = numericColumns.contains(index)
        val style = if (isNumber && styleId != "Header") "CellNumber" else styleId
        val type = if (isNumber && styleId != "Header") "Number" else "String"
        """<Cell ss:StyleID="$style"><Data ss:Type="$type">${escapeExcel(value)}</Data></Cell>"""
    }.joinToString(prefix = "<Row>", postfix = "</Row>", separator = "")
}

private fun excelColumnWidth(values: List<String>): Int {
    val maxLength = values.maxOfOrNull { it.length } ?: 8
    return (maxLength * 7 + 18).coerceIn(42, 280)
}

private fun excelBorderXml(): String {
    return """
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
      </Borders>
    """.trimIndent()
}

private fun parseExportAdminAmount(value: String): Double {
    return value.replace(Regex("[^0-9-]"), "").toDoubleOrNull() ?: 0.0
}

private fun normalizeExportKolok(value: String): String {
    return value.trim().uppercase(Locale.US).ifBlank { "KOSONG" }
}

private fun excelNumber(value: Double): String {
    return value.toLong().toString()
}

private fun escapeExcel(value: String): String {
    return value
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
}

internal data class ReceiptPreview(
    val row: CustomerDebt,
    val meter: ReceiptMeter?,
    val settings: ReceiptSettings,
    val identity: ReceiptIdentity = ReceiptIdentity()
) {
    var snapshot: ReceiptSnapshot = ReceiptSnapshot.create(identity, row, meter, settings, 0)
}

private fun sortCustomerRows(rows: List<CustomerDebt>): List<CustomerDebt> {
    return rows.sortedWith { first, second ->
        val kolokCompare = first.kolok.uppercase().compareTo(second.kolok.uppercase())
        if (kolokCompare != 0) return@sortedWith kolokCompare

        val firstNumber = first.koked.toIntOrNull()
        val secondNumber = second.koked.toIntOrNull()
        if (firstNumber != null && secondNumber != null) {
            firstNumber.compareTo(secondNumber)
        } else {
            first.koked.compareTo(second.koked, ignoreCase = true)
        }
    }
}

private fun groupedDisplayRows(rows: List<CustomerDebt>, collapsedKolok: Map<String, Boolean>): List<DisplayRow> {
    return rows.groupBy { it.kolok }
        .toSortedMap(compareBy { it.uppercase() })
        .flatMap { (kolok, groupRows) ->
            val sorted = sortCustomerRows(groupRows)
            val header = listOf<DisplayRow>(
                DisplayRow.GroupHeader(
                    kolok = kolok,
                    count = sorted.size,
                    total = sorted.sumOf { it.rptag }
                )
            )
            if (collapsedKolok[kolok] == true) header else header + sorted.map { DisplayRow.CustomerItem(it) }
        }
}

private fun usernameToName(username: String): String {
    return username.substringAfter('.', username).replace('.', ' ').uppercase()
}

private fun premiumPackageTitle(packageCode: String): String {
    return premiumPackageLabel(packageCode)
}

private fun premiumPackageBenefit(packageCode: String): String {
    return when (packageCode.uppercase(Locale.US)) {
        "P1" -> "Tambahan tagihan maksimal Rp5.000"
        "P2" -> "Tambahan tagihan maksimal Rp10.000"
        "P3" -> "Tambahan tagihan bebas"
        "SIMONTOK_PREMIUM", "BILLMAN_PRO" -> "Tambahan tagihan bebas"
        else -> "Fitur gratis"
    }
}

private fun premiumExtraLimit(status: PremiumStatus): Double? {
    if (!status.isActive()) return 0.0
    return when (status.packageCode.uppercase(Locale.US)) {
        "P1" -> 5000.0
        "P2" -> 10000.0
        "P3" -> null
        "SIMONTOK_PREMIUM", "BILLMAN_PRO" -> null
        else -> 0.0
    }
}

private fun premiumExtraInfo(status: PremiumStatus): String {
    val limit = premiumExtraLimit(status)
    return when {
        !status.isActive() -> "Premium belum aktif."
        limit == null -> "${premiumPackageLabel(status.packageCode)}: tambahan nominal bebas."
        else -> "${premiumPackageLabel(status.packageCode)}: maksimal tambahan ${formatRupiah(limit)}."
    }
}

private fun displayNameForUsername(username: String, dataName: String?): String {
    val code = username.substringAfter('.', username).trim().uppercase()
    return mapOf(
        "NONET" to "NONET",
        "DWI" to "DWI WIBOWO",
        "RAHUL" to "RAHUL FARISTA R"
    )[code] ?: dataName?.takeIf { it.isNotBlank() } ?: usernameToName(username)
}

private enum class SummaryIcon { People, Bill }

private sealed class DisplayRow(val key: String) {
    data class GroupHeader(val kolok: String, val count: Int, val total: Double) : DisplayRow("kolok-$kolok")
    data class CustomerItem(val row: CustomerDebt) : DisplayRow("idpel-${row.idpel}")
}

private sealed class ScreenState {
    data object Loading : ScreenState()
    data object Login : ScreenState()
    data class LoginWithError(val message: String) : ScreenState()
    data class Home(val username: String, val rows: List<CustomerDebt>) : ScreenState()
}
