package com.sabak.simontok

import android.os.Handler
import android.os.Looper
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.URLEncoder
import java.text.NumberFormat
import java.util.Locale
import kotlin.concurrent.thread

class SupabaseApi {
    private val client = OkHttpClient()
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()
    private val mainHandler = Handler(Looper.getMainLooper())
    private val pageSize = 1000
    private val appVersionHeader = BuildConfig.VERSION_NAME

    fun fetchPremiumBillingStatus(accessToken: String): PremiumBillingStatus {
        val request = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/rest/v1/rpc/get_my_premium_billing_status")
            .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
            .addHeader("Authorization", "Bearer $accessToken")
            .addHeader("x-simontok-version", appVersionHeader)
            .post("{}".toRequestBody(jsonMediaType))
            .build()
        client.newCall(request).execute().use { response ->
            if (response.code == 401) throw BillingSessionExpired()
            if (!response.isSuccessful) throw IOException("Status pembayaran belum dapat diperiksa. Hubungi admin atau coba lagi.")
            return JSONObject(response.body?.string().orEmpty()).toPremiumBillingStatus()
        }
    }

    fun fetchAppRelease(): AppRelease {
        val request = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/rest/v1/monitoring_app_releases?select=latest_version,minimum_version,download_url,message,force_update&id=eq.android&limit=1")
            .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
            .addHeader("x-simontok-version", appVersionHeader)
            .addHeader("Accept", "application/json")
            .get()
            .build()

        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw IOException("Gagal memeriksa versi aplikasi.")
            val rows = JSONArray(body)
            if (rows.length() == 0) return AppRelease()
            val item = rows.getJSONObject(0)
            return AppRelease(
                latestVersion = item.optString("latest_version"),
                minimumVersion = item.optString("minimum_version"),
                downloadUrl = item.optString("download_url"),
                message = item.optString("message"),
                forceUpdate = item.optBoolean("force_update", false)
            )
        }
    }

    fun subscribeDebtUpdateSignal(
        accessToken: String,
        onUpdate: (String) -> Unit,
        onStatus: (String) -> Unit = {}
    ): RealtimeDebtSignalSubscription {
        return RealtimeDebtSignalSubscription(client, accessToken, onUpdate, onStatus).also { it.start() }
    }

    fun login(username: String, password: String, callback: (Result<UserSession>) -> Unit) {
        val normalizedUsername = username.trim().lowercase(Locale.US)
        val email = "$normalizedUsername@${BuildConfig.USERNAME_EMAIL_DOMAIN}"
        val payload = JSONObject()
            .put("email", email)
            .put("password", password)
            .toString()

        val request = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/auth/v1/token?grant_type=password")
            .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
            .addHeader("x-simontok-version", appVersionHeader)
            .addHeader("Content-Type", "application/json")
            .post(payload.toRequestBody(jsonMediaType))
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                post(callback, Result.failure(Exception("Tidak bisa terhubung ke server.")))
            }

            override fun onResponse(call: Call, response: Response) {
                val body = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    post(callback, Result.failure(Exception("Username atau password salah.")))
                    return
                }

                val json = JSONObject(body)
                val accessToken = json.optString("access_token")
                val refreshToken = json.optString("refresh_token")
                if (accessToken.isBlank()) {
                    post(callback, Result.failure(Exception("Token login tidak diterima.")))
                    return
                }

                post(callback, Result.success(UserSession(username = username.uppercase(Locale.US), accessToken = accessToken, refreshToken = refreshToken)))
            }
        })
    }

    fun refreshSession(session: UserSession): UserSession {
        if (session.refreshToken.isBlank()) throw IOException("Sesi login habis. Silakan logout lalu login ulang.")
        val payload = JSONObject()
            .put("refresh_token", session.refreshToken)
            .toString()
        val request = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token")
            .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
            .addHeader("x-simontok-version", appVersionHeader)
            .addHeader("Content-Type", "application/json")
            .post(payload.toRequestBody(jsonMediaType))
            .build()

        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw IOException("Sesi login habis. Silakan logout lalu login ulang.")
            val json = JSONObject(body)
            val accessToken = json.optString("access_token")
            val refreshToken = json.optString("refresh_token", session.refreshToken)
            if (accessToken.isBlank()) throw IOException("Sesi login habis. Silakan logout lalu login ulang.")
            return session.copy(accessToken = accessToken, refreshToken = refreshToken)
        }
    }

    fun registerPushToken(accessToken: String, username: String, token: String, deviceId: String) {
        if (token.isBlank()) return
        val payload = JSONObject()
            .put("p_token", token)
            .put("p_username", username.uppercase(Locale.US))
            .put("p_device_id", deviceId)
            .toString()
        callPushTokenRpc(accessToken, "register_monitoring_push_token", payload)
    }

    fun unregisterPushToken(accessToken: String, token: String) {
        if (token.isBlank()) return
        val payload = JSONObject().put("p_token", token).toString()
        callPushTokenRpc(accessToken, "unregister_monitoring_push_token", payload)
    }

    fun reportMonitoringDevice(accessToken: String, username: String, deviceId: String) {
        val payload = JSONObject()
            .put("p_username", username.uppercase(Locale.US))
            .put("p_device_id", deviceId)
            .put("p_app_version", BuildConfig.VERSION_NAME)
            .toString()
        callPushTokenRpc(accessToken, "report_monitoring_device", payload)
    }

    fun acknowledgeMonitoringSync(
        accessToken: String,
        username: String,
        deviceId: String,
        dataVersion: String?
    ) {
        val payload = JSONObject()
            .put("p_username", username.uppercase(Locale.US))
            .put("p_device_id", deviceId)
            .put("p_app_version", BuildConfig.VERSION_NAME)
            .put("p_data_version", dataVersion.orEmpty())
            .toString()
        callPushTokenRpc(accessToken, "acknowledge_monitoring_sync", payload)
    }

    private fun callPushTokenRpc(accessToken: String, functionName: String, payload: String) {
        val request = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/rest/v1/rpc/$functionName")
            .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
            .addHeader("Authorization", "Bearer $accessToken")
            .addHeader("x-simontok-version", appVersionHeader)
            .addHeader("Content-Type", "application/json")
            .post(payload.toRequestBody(jsonMediaType))
            .build()
        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw IOException("Gagal mendaftarkan notifikasi perangkat: $body")
        }
    }

    fun fetchRemainingCustomers(accessToken: String, username: String): List<CustomerDebt> {
        if (isSuperUser(username)) {
            return fetchAllRemainingCustomers(accessToken)
        }
        val candidates = usernameToPetugasCandidates(username)
        val rows = linkedMapOf<String, CustomerDebt>()
        candidates.forEach { petugas ->
            fetchRemainingCustomersInternal(accessToken, petugas).forEach { row ->
                rows[row.idpel] = row
            }
        }
        return rows.values.toList()
    }

    fun fetchLatestDebtUploadAt(accessToken: String, username: String): String? {
        val versions = mutableListOf<String>()
        runCatching { fetchDebtUpdateSignal(accessToken) }.getOrNull()?.let { versions.add(it) }
        runCatching { fetchLatestDebtUploadAtForPetugas(accessToken, petugas = null) }.getOrNull()?.let { versions.add(it) }
        if (!isSuperUser(username)) {
            usernameToPetugasCandidates(username).forEach { petugas ->
                runCatching { fetchLatestDebtUploadAtForPetugas(accessToken, petugas) }.getOrNull()?.let { versions.add(it) }
            }
        }
        if (versions.isEmpty()) {
            runCatching { fetchLatestDebtUploadAtFromReadableRows(accessToken, username) }.getOrNull()?.let { versions.add(it) }
        }
        if (versions.isEmpty()) {
            runCatching { fetchReadableDebtFingerprint(accessToken, username) }.getOrNull()?.let { versions.add(it) }
        }
        return versions.maxOrNull()
    }

    fun buildDebtFingerprint(rows: List<CustomerDebt>): String? {
        if (rows.isEmpty()) return null
        val latestUpload = rows.mapNotNull { it.uploadedAt.ifBlank { null } }.maxOrNull()
        if (!latestUpload.isNullOrBlank()) return latestUpload
        val count = rows.size
        val total = rows.sumOf { it.rptag }.toLong()
        val ids = rows.asSequence().map { it.idpel }.sorted().take(5).joinToString("-")
        return "rows:$count-total:$total-ids:$ids"
    }

    private fun fetchLatestDebtUploadAtFromReadableRows(accessToken: String, username: String): String? {
        val rows = if (isSuperUser(username)) {
            fetchRemainingCustomersInternal(accessToken, petugas = null)
        } else {
            val merged = linkedMapOf<String, CustomerDebt>()
            usernameToPetugasCandidates(username).forEach { petugas ->
                fetchRemainingCustomersInternal(accessToken, petugas).forEach { row ->
                    merged[row.idpel] = row
                }
            }
            merged.values.toList()
        }
        return rows.mapNotNull { it.uploadedAt.ifBlank { null } }.maxOrNull()
    }

    private fun fetchReadableDebtFingerprint(accessToken: String, username: String): String? {
        val rows = if (isSuperUser(username)) {
            fetchRemainingCustomersFingerprintRows(accessToken, petugas = null)
        } else {
            val merged = linkedMapOf<String, CustomerDebt>()
            usernameToPetugasCandidates(username).forEach { petugas ->
                fetchRemainingCustomersFingerprintRows(accessToken, petugas).forEach { row ->
                    merged[row.idpel] = row
                }
            }
            merged.values.toList()
        }
        return buildDebtFingerprint(rows)
    }

    fun fetchAllRemainingCustomers(accessToken: String, onPage: (Int) -> Unit = {}): List<CustomerDebt> {
        return runCatching { fetchRemainingCustomersInternal(accessToken, petugas = null, onPage = onPage) }
            .getOrElse { fetchPrintRemainingCustomers(accessToken, onPage) }
    }

    private fun fetchRemainingCustomersInternal(
        accessToken: String,
        petugas: String?,
        onPage: (Int) -> Unit = {}
    ): List<CustomerDebt> {
        val allRows = mutableListOf<CustomerDebt>()
        var offset = 0

        while (true) {
            val page = fetchRemainingCustomersPage(accessToken, offset, petugas)
            allRows.addAll(page)
            onPage(allRows.size)
            if (page.size < pageSize) break
            offset += pageSize
        }

        return allRows
    }

    private fun fetchRemainingCustomersFingerprintRows(accessToken: String, petugas: String?): List<CustomerDebt> {
        val petugasFilter = petugas?.let { "&petugas=eq.${encodeQueryValue(it)}" }.orEmpty()
        val request = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/rest/v1/monitoring_remaining_customers?select=petugas,idpel,nama,tarif,daya,alamat,lembar,kolok,koked,rptag&report_id=eq.main$petugasFilter&order=idpel.asc")
            .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
            .addHeader("Authorization", "Bearer $accessToken")
            .addHeader("x-simontok-version", appVersionHeader)
            .addHeader("Accept", "application/json")
            .addHeader("Range-Unit", "items")
            .addHeader("Range", "0-999")
            .get()
            .build()

        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw IOException(appUpdateMessage(body, "Gagal mengecek update data tunggakan."))
            val array = JSONArray(body)
            return List(array.length()) { index -> array.getJSONObject(index).toCustomerDebt() }
        }
    }

    fun fetchReceiptMeter(accessToken: String, idpel: String): ReceiptMeter? {
        val request = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/rest/v1/monitoring_receipt_meters?select=idpel,stand_awal,stand_akhir&report_id=eq.main&idpel=eq.$idpel&limit=1")
            .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
            .addHeader("Authorization", "Bearer $accessToken")
            .addHeader("x-simontok-version", appVersionHeader)
            .addHeader("Accept", "application/json")
            .get()
            .build()

        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw IOException("Gagal mengambil stand meter.")
            val array = JSONArray(body)
            if (array.length() == 0) return null
            val item = array.getJSONObject(0)
            return ReceiptMeter(
                idpel = item.optString("idpel"),
                standAwal = item.optString("stand_awal"),
                standAkhir = item.optString("stand_akhir")
            )
        }
    }

    fun fetchReceiptMeters(accessToken: String, onPage: (Int) -> Unit = {}): Map<String, ReceiptMeter> {
        val meters = mutableMapOf<String, ReceiptMeter>()
        var offset = 0
        while (true) {
            val page = fetchReceiptMetersPage(accessToken, offset)
            page.forEach { meters[it.idpel] = it }
            onPage(meters.size)
            if (page.size < pageSize) break
            offset += pageSize
        }
        return meters
    }

    fun fetchRemainingCustomerByIdpel(accessToken: String, idpel: String): CustomerDebt? {
        val normalizedIdpel = normalizeIdpel(idpel)
        runCatching { fetchPrintCustomerByIdpel(accessToken, normalizedIdpel) }
            .getOrNull()
            ?.let { return it }

        val request = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/rest/v1/monitoring_remaining_customers?select=petugas,idpel,nama,tarif,daya,alamat,lembar,kolok,koked,rptag,uploaded_at&report_id=eq.main&idpel=eq.$normalizedIdpel&limit=1")
            .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
            .addHeader("Authorization", "Bearer $accessToken")
            .addHeader("x-simontok-version", appVersionHeader)
            .addHeader("Accept", "application/json")
            .get()
            .build()

        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw IOException("IDPEL tidak bisa dicari.")
            val array = JSONArray(body)
            if (array.length() == 0) return null
            return array.getJSONObject(0).toCustomerDebt()
        }
    }

    fun fetchPremiumStatus(accessToken: String, deviceId: String): PremiumStatus {
        val request = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/rest/v1/rpc/get_my_premium_access")
            .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
            .addHeader("Authorization", "Bearer $accessToken")
            .addHeader("x-simontok-version", appVersionHeader)
            .addHeader("Accept", "application/json")
            .post(JSONObject().put("p_device_id", deviceId).toString().toRequestBody(jsonMediaType))
            .build()

        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw IOException("Gagal memeriksa aktivasi premium. Pastikan migrasi aktivasi perangkat sudah diterapkan.")
            return JSONObject(body).toPremiumAccessStatus(deviceId)
        }
    }

    fun fetchPremiumStatus(accessToken: String, username: String, deviceId: String): PremiumStatus {
        if (isSuperUser(username)) return PremiumStatus(packageCode = "P3", activeUntil = "2099-12-31", deviceBound = true)
        return fetchPremiumStatus(accessToken, deviceId)
    }

    private fun currentUserIdFromToken(accessToken: String): String {
        val payload = accessToken.split(".").getOrNull(1) ?: throw IOException("Token tidak valid.")
        val json = String(android.util.Base64.decode(payload, android.util.Base64.URL_SAFE), Charsets.UTF_8)
        return JSONObject(json).optString("sub")
    }

    fun submitPremiumRequest(
        accessToken: String,
        username: String,
        packageCode: String,
        proofBytes: ByteArray,
        mimeType: String
    ) {
        val normalizedPackage = packageCode.uppercase(Locale.US)
        val safeUsername = username.lowercase(Locale.US).replace(Regex("[^a-z0-9._-]"), "_")
        val extension = if (mimeType.contains("png", ignoreCase = true)) "png" else "jpg"
        val proofPath = "$safeUsername/${System.currentTimeMillis()}-$normalizedPackage.$extension"
        val uploadRequest = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/storage/v1/object/premium-proofs/$proofPath")
            .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
            .addHeader("Authorization", "Bearer $accessToken")
            .addHeader("x-simontok-version", appVersionHeader)
            .addHeader("Content-Type", mimeType)
            .post(proofBytes.toRequestBody(mimeType.toMediaType()))
            .build()

        client.newCall(uploadRequest).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw IOException("Gagal upload bukti pembayaran: $body")
        }

        val payload = JSONObject()
            .put("username", username.uppercase(Locale.US))
            .put("package_code", normalizedPackage)
            .put("amount", premiumPackageAmount(normalizedPackage))
            .put("proof_path", proofPath)
            .toString()

        val insertRequest = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/rest/v1/monitoring_premium_requests")
            .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
            .addHeader("Authorization", "Bearer $accessToken")
            .addHeader("x-simontok-version", appVersionHeader)
            .addHeader("Content-Type", "application/json")
            .addHeader("Prefer", "return=minimal")
            .post(payload.toRequestBody(jsonMediaType))
            .build()

        client.newCall(insertRequest).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw IOException("Gagal mengirim pengajuan premium: $body")
        }
    }

    fun fetchPendingPremiumRequests(accessToken: String): List<PremiumAdminRequest> {
        val request = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/rest/v1/monitoring_premium_requests?select=id,user_id,username,package_code,amount,proof_path,created_at,request_type,requested_device_id,status&status=eq.pending&order=created_at.desc&limit=50")
            .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
            .addHeader("Authorization", "Bearer $accessToken")
            .addHeader("x-simontok-version", appVersionHeader)
            .get()
            .build()

        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw IOException("Gagal membaca pengajuan premium: $body")
            val rows = JSONArray(body)
            return List(rows.length()) { index ->
                val item = rows.getJSONObject(index)
                PremiumAdminRequest(
                    id = item.optString("id"),
                    userId = item.optString("user_id"),
                    username = item.optString("username"),
                    packageCode = item.optString("package_code"),
                    amount = item.optInt("amount"),
                    proofPath = item.optString("proof_path"),
                    createdAt = item.optString("created_at"),
                    requestType = item.optString("request_type", "premium"),
                    requestedDeviceId = item.optString("requested_device_id")
                )
            }
        }
    }

    fun createPremiumProofUrl(accessToken: String, proofPath: String): String {
        val safePath = proofPath.split('/').joinToString("/") { encodeQueryValue(it) }
        val payload = JSONObject().put("expiresIn", 600).toString()
        val request = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/storage/v1/object/sign/premium-proofs/$safePath")
            .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
            .addHeader("Authorization", "Bearer $accessToken")
            .addHeader("Content-Type", "application/json")
            .post(payload.toRequestBody(jsonMediaType))
            .build()
        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw IOException("Gagal membuka bukti pembayaran: $body")
            val signedPath = JSONObject(body).optString("signedURL")
            if (signedPath.isBlank()) throw IOException("URL bukti pembayaran tidak diterima.")
            return if (signedPath.startsWith("http")) signedPath else "${BuildConfig.SUPABASE_URL}/storage/v1$signedPath"
        }
    }

    fun approvePremiumRequest(accessToken: String, request: PremiumAdminRequest): String {
        if (request.userId.isBlank()) throw IOException("User ID pengajuan kosong.")
        return if (request.requestType == "device_reset") {
            approvePremiumDeviceRequest(accessToken, request)
            "Device Premium ${request.username} berhasil diverifikasi."
        } else {
            val activeUntil = java.time.LocalDate.now().plusDays(30).toString()
            patchJson(
                accessToken,
                "monitoring_profiles?user_id=eq.${encodeQueryValue(request.userId)}",
                JSONObject()
                    .put("premium_package", request.packageCode)
                    .put("premium_active_until", activeUntil)
                    .put("premium_device_id", JSONObject.NULL)
                    .put("premium_device_bound_at", JSONObject.NULL)
                    .put("premium_updated_at", java.time.Instant.now().toString())
            )
            markPremiumRequestReviewed(accessToken, request.id, "approved", "Aktif sampai $activeUntil")
            "Premium ${request.username} aktif sampai $activeUntil."
        }
    }

    fun rejectPremiumRequest(accessToken: String, request: PremiumAdminRequest) {
        markPremiumRequestReviewed(accessToken, request.id, "rejected", "Ditolak admin melalui APK")
    }

    private fun approvePremiumDeviceRequest(accessToken: String, request: PremiumAdminRequest) {
        if (request.requestedDeviceId.isBlank()) throw IOException("Device ID pengajuan kosong.")
        patchJson(
            accessToken,
            "monitoring_profiles?user_id=eq.${encodeQueryValue(request.userId)}",
            JSONObject()
                .put("premium_device_id", request.requestedDeviceId)
                .put("premium_device_bound_at", java.time.Instant.now().toString())
                .put("premium_updated_at", java.time.Instant.now().toString())
        )
        markPremiumRequestReviewed(accessToken, request.id, "approved", "Device premium diganti admin melalui APK")
    }

    private fun markPremiumRequestReviewed(accessToken: String, requestId: String, status: String, note: String) {
        patchJson(
            accessToken,
            "monitoring_premium_requests?id=eq.${encodeQueryValue(requestId)}",
            JSONObject()
                .put("status", status)
                .put("reviewed_at", java.time.Instant.now().toString())
                .put("reviewed_by", currentUserIdFromToken(accessToken))
                .put("reviewer_note", note)
        )
    }

    private fun patchJson(accessToken: String, pathAndQuery: String, payload: JSONObject) {
        val request = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/rest/v1/$pathAndQuery")
            .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
            .addHeader("Authorization", "Bearer $accessToken")
            .addHeader("x-simontok-version", appVersionHeader)
            .addHeader("Content-Type", "application/json")
            .addHeader("Prefer", "return=minimal")
            .patch(payload.toString().toRequestBody(jsonMediaType))
            .build()
        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw IOException("Gagal memperbarui Premium: $body")
        }
    }

    fun submitDeviceResetRequest(
        accessToken: String,
        username: String,
        packageCode: String,
        deviceId: String
    ) {
        val payload = JSONObject()
            .put("username", username.uppercase(Locale.US))
            .put("package_code", packageCode.uppercase(Locale.US).takeIf { it in listOf("P1", "P2", "P3") } ?: "P1")
            .put("amount", 0)
            .put("proof_path", "-")
            .put("request_type", "device_reset")
            .put("requested_device_id", deviceId)
            .toString()

        val request = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/rest/v1/monitoring_premium_requests")
            .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
            .addHeader("Authorization", "Bearer $accessToken")
            .addHeader("x-simontok-version", appVersionHeader)
            .addHeader("Content-Type", "application/json")
            .addHeader("Prefer", "return=minimal")
            .post(payload.toRequestBody(jsonMediaType))
            .build()

        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw IOException("Gagal mengirim permintaan verifikasi device: $body")
        }
    }

    private fun fetchPrintRemainingCustomers(accessToken: String, onPage: (Int) -> Unit): List<CustomerDebt> {
        val allRows = mutableListOf<CustomerDebt>()
        var offset = 0
        while (true) {
            val page = fetchPrintRemainingCustomersPage(accessToken, offset)
            allRows.addAll(page)
            onPage(allRows.size)
            if (page.size < pageSize) break
            offset += pageSize
        }
        return allRows
    }

    private fun fetchPrintRemainingCustomersPage(accessToken: String, offset: Int): List<CustomerDebt> {
        val end = offset + pageSize - 1
        val request = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/rest/v1/rpc/monitoring_print_remaining_customers")
            .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
            .addHeader("Authorization", "Bearer $accessToken")
            .addHeader("x-simontok-version", appVersionHeader)
            .addHeader("Content-Type", "application/json")
            .addHeader("Accept", "application/json")
            .addHeader("Range-Unit", "items")
            .addHeader("Range", "$offset-$end")
            .post("{}".toRequestBody(jsonMediaType))
            .build()

        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw IOException("Gagal mengambil data cetak semua petugas.")
            val array = JSONArray(body)
            return List(array.length()) { index -> array.getJSONObject(index).toCustomerDebt() }
        }
    }

    private fun fetchPrintCustomerByIdpel(accessToken: String, idpel: String): CustomerDebt? {
        val payload = JSONObject().put("p_idpel", idpel).toString()
        val request = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/rest/v1/rpc/monitoring_print_customer_by_idpel")
            .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
            .addHeader("Authorization", "Bearer $accessToken")
            .addHeader("x-simontok-version", appVersionHeader)
            .addHeader("Content-Type", "application/json")
            .addHeader("Accept", "application/json")
            .post(payload.toRequestBody(jsonMediaType))
            .build()

        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw IOException("Gagal mencari IDPEL untuk cetak.")
            val array = JSONArray(body)
            if (array.length() == 0) return null
            return array.getJSONObject(0).toCustomerDebt()
        }
    }

    private fun fetchRemainingCustomersPage(accessToken: String, offset: Int, petugas: String?): List<CustomerDebt> {
        val end = offset + pageSize - 1
        val petugasFilter = petugas?.let { "&petugas=eq.${encodeQueryValue(it)}" }.orEmpty()
        val request = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/rest/v1/monitoring_remaining_customers?select=petugas,idpel,nama,tarif,daya,alamat,lembar,kolok,koked,rptag,uploaded_at&report_id=eq.main$petugasFilter&order=kolok.asc,koked.asc")
            .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
            .addHeader("Authorization", "Bearer $accessToken")
            .addHeader("x-simontok-version", appVersionHeader)
            .addHeader("Accept", "application/json")
            .addHeader("Range-Unit", "items")
            .addHeader("Range", "$offset-$end")
            .get()
            .build()

        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw IOException(appUpdateMessage(body, "Gagal mengambil data tunggakan."))
            }

            val array = JSONArray(body)
            return List(array.length()) { index ->
                array.getJSONObject(index).toCustomerDebt()
            }
        }
    }

    private fun fetchLatestDebtUploadAtForPetugas(accessToken: String, petugas: String?): String? {
        val petugasFilter = petugas?.let { "&petugas=eq.${encodeQueryValue(it)}" }.orEmpty()
        val request = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/rest/v1/monitoring_remaining_customers?select=uploaded_at&report_id=eq.main$petugasFilter&order=uploaded_at.desc&limit=1")
            .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
            .addHeader("Authorization", "Bearer $accessToken")
            .addHeader("x-simontok-version", appVersionHeader)
            .addHeader("Accept", "application/json")
            .get()
            .build()

        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw IOException(appUpdateMessage(body, "Gagal mengecek update data tunggakan."))
            val array = JSONArray(body)
            if (array.length() == 0) return null
            return array.getJSONObject(0).optString("uploaded_at").ifBlank { null }
        }
    }

    private fun fetchDebtUpdateSignal(accessToken: String): String? {
        val request = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/rest/v1/monitoring_app_state?select=updated_at,payload&id=eq.debt-update-signal&limit=1")
            .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
            .addHeader("Authorization", "Bearer $accessToken")
            .addHeader("x-simontok-version", appVersionHeader)
            .addHeader("Accept", "application/json")
            .get()
            .build()

        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) return null
            val array = JSONArray(body)
            if (array.length() == 0) return null

            val item = array.getJSONObject(0)
            val payloadValue = item.opt("payload")
            val uploadedAt = when (payloadValue) {
                is JSONObject -> payloadValue.optString("uploadedAt")
                is String -> runCatching { JSONObject(payloadValue).optString("uploadedAt") }.getOrDefault("")
                else -> ""
            }
            return uploadedAt.ifBlank { item.optString("updated_at").ifBlank { null } }
        }
    }

    private fun fetchReceiptMetersPage(accessToken: String, offset: Int): List<ReceiptMeter> {
        val end = offset + pageSize - 1
        val request = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/rest/v1/monitoring_receipt_meters?select=idpel,stand_awal,stand_akhir&report_id=eq.main&order=idpel.asc")
            .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
            .addHeader("Authorization", "Bearer $accessToken")
            .addHeader("x-simontok-version", appVersionHeader)
            .addHeader("Accept", "application/json")
            .addHeader("Range-Unit", "items")
            .addHeader("Range", "$offset-$end")
            .get()
            .build()

        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw IOException(appUpdateMessage(body, "Gagal mengambil data stand meter."))
            val array = JSONArray(body)
            return List(array.length()) { index ->
                val item = array.getJSONObject(index)
                ReceiptMeter(
                    idpel = item.optString("idpel"),
                    standAwal = item.optString("stand_awal"),
                    standAkhir = item.optString("stand_akhir")
                )
            }
        }
    }

    private fun <T> post(callback: (Result<T>) -> Unit, result: Result<T>) {
        mainHandler.post { callback(result) }
    }
}

class RealtimeDebtSignalSubscription(
    private val client: OkHttpClient,
    private val accessToken: String,
    private val onUpdate: (String) -> Unit,
    private val onStatus: (String) -> Unit = {}
) {
    @Volatile
    private var active = false
    private var webSocket: WebSocket? = null
    private var ref = 1

    fun start() {
        if (active) return
        active = true
        connect()
    }

    fun stop() {
        active = false
        webSocket?.close(1000, "closed")
        webSocket = null
    }

    private fun connect() {
        if (!active) return
        val realtimeUrl = BuildConfig.SUPABASE_URL
            .replace("https://", "wss://")
            .replace("http://", "ws://")
            .trimEnd('/') + "/realtime/v1/websocket?apikey=${BuildConfig.SUPABASE_ANON_KEY}&vsn=1.0.0"
        val request = Request.Builder()
            .url(realtimeUrl)
            .addHeader("Authorization", "Bearer $accessToken")
            .build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                onStatus("Realtime aktif.")
                joinChannel(webSocket)
                startHeartbeat(webSocket)
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                handleRealtimeMessage(text)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                onStatus("Realtime terputus, mencoba sambung ulang.")
                reconnectLater()
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                if (active) reconnectLater()
            }
        })
    }

    private fun joinChannel(webSocket: WebSocket) {
        val payload = JSONObject()
            .put(
                "config",
                JSONObject()
                    .put("broadcast", JSONObject().put("self", false))
                    .put("presence", JSONObject())
                    .put("postgres_changes", JSONArray())
            )
            .put("access_token", accessToken)
        webSocket.send(
            JSONObject()
                .put("topic", "realtime:debt-update-signal")
                .put("event", "phx_join")
                .put("payload", payload)
                .put("ref", nextRef())
                .toString()
        )
    }

    private fun startHeartbeat(webSocket: WebSocket) {
        thread {
            while (active) {
                Thread.sleep(25_000)
                if (!active) break
                webSocket.send(
                    JSONObject()
                        .put("topic", "phoenix")
                        .put("event", "heartbeat")
                        .put("payload", JSONObject())
                        .put("ref", nextRef())
                        .toString()
                )
            }
        }
    }

    private fun reconnectLater() {
        if (!active) return
        webSocket = null
        thread {
            Thread.sleep(5_000)
            if (active) connect()
        }
    }

    private fun handleRealtimeMessage(text: String) {
        val json = runCatching { JSONObject(text) }.getOrNull() ?: return
        if (json.optString("event") != "broadcast") return
        val envelope = json.optJSONObject("payload") ?: return
        if (envelope.optString("event") != "debt-update") return
        val payload = envelope.optJSONObject("payload")
        val uploadedAt = payload?.optString("uploadedAt").orEmpty()
        onUpdate(uploadedAt)
    }

    @Synchronized
    private fun nextRef(): String {
        return (ref++).toString()
    }
}

data class AppRelease(
    val latestVersion: String = BuildConfig.VERSION_NAME,
    val minimumVersion: String = BuildConfig.VERSION_NAME,
    val downloadUrl: String = "",
    val message: String = "",
    val forceUpdate: Boolean = false
)

private fun appUpdateMessage(body: String, fallback: String): String {
    return if (body.contains("monitoring_app_version_ok", ignoreCase = true) ||
        body.contains("row-level security", ignoreCase = true) ||
        body.contains("permission denied", ignoreCase = true)
    ) {
        "Silakan update aplikasi ke versi terbaru."
    } else {
        fallback
    }
}

private fun usernameToPetugasCandidates(username: String): List<String> {
    val code = username.substringAfter('.', username).trim().uppercase(Locale.US)
    val primary = mapOf(
        "ADRI" to listOf("ADRI"),
        "ANANG" to listOf("ANANG RIDWAN"),
        "CECEP" to listOf("CECEP HIDAYAT"),
        "DEDI" to listOf("DEDI YANTO"),
        "ROBY" to listOf("M. ROBY MASHRUR"),
        "TOHIR" to listOf("MUHAMMAD TOHIR"),
        "SUWARDI" to listOf("SUWARDI"),
        "TRI" to listOf("TRI RIBOWO"),
        "AMRIZAL" to listOf("AMRIZAL"),
        "ARBAIN" to listOf("ARBAIN"),
        "BUN" to listOf("BUNJAMIN"),
        "DWI" to listOf("DWI WIBOWO", "DWI WIBBOWO", "DWI WIBWOWO"),
        "EKO" to listOf("EKO DARWANTO"),
        "HASIM" to listOf("HASIM"),
        "RAHUL" to listOf("RAHUL FARISTA R", "RAHUL FARISTA R.", "RAHUL FARISTA"),
        "NICO" to listOf("NICO DIAN HADINATA"),
        "ILVAN" to listOf("ILVAN HALMAHERA")
    )[code].orEmpty()

    return (primary + code).distinct()
}

fun isSuperUser(username: String): Boolean {
    return username.trim().equals("14390.NONET", ignoreCase = true)
}

private fun encodeQueryValue(value: String): String {
    return URLEncoder.encode(value, Charsets.UTF_8.name()).replace("+", "%20")
}

data class UserSession(
    val username: String,
    val accessToken: String,
    val refreshToken: String = ""
)

data class CustomerDebt(
    val petugas: String,
    val idpel: String,
    val nama: String,
    val tarif: String,
    val daya: String,
    val alamat: String,
    val lembar: Int,
    val kolok: String,
    val koked: String,
    val rptag: Double,
    val uploadedAt: String = ""
)

data class PremiumStatus(
    val packageCode: String = "FREE",
    val activeUntil: String? = null,
    val deviceBound: Boolean = false,
    val boundToOtherDevice: Boolean = false,
    val activeFrom: String? = null
) {
    fun hasActivePeriod(today: String = premiumTodayWib()): Boolean {
        val until = activeUntil ?: return false
        if (!isPremiumDate(until) || !isPremiumDate(today)) return false
        if (activeFrom != null && (!isPremiumDate(activeFrom) || activeFrom > today)) return false
        return packageCode in setOf("P1", "P2", "P3", "SIMONTOK_PREMIUM", "BILLMAN_PRO") && until >= today
    }
    fun isActive(today: String = premiumTodayWib()): Boolean = hasActivePeriod(today) && deviceBound && !boundToOtherDevice
}

data class PremiumAdminRequest(
    val id: String,
    val userId: String,
    val username: String,
    val packageCode: String,
    val amount: Int,
    val proofPath: String,
    val createdAt: String,
    val requestType: String,
    val requestedDeviceId: String
)

fun premiumPackageAmount(packageCode: String): Int {
    return when (packageCode.uppercase(Locale.US)) {
        "P1" -> 15000
        "P2" -> 25000
        "P3" -> 50000
        "SIMONTOK_PREMIUM", "BILLMAN_PRO" -> 50000
        else -> 0
    }
}

fun formatRupiah(value: Double): String {
    return NumberFormat.getCurrencyInstance(Locale("id", "ID")).format(value).replace(",00", "")
}

fun normalizeIdpel(value: String): String {
    return value.filter(Char::isDigit)
}
