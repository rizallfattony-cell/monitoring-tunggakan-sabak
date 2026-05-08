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
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.text.NumberFormat
import java.util.Locale
import kotlin.concurrent.thread

class SupabaseApi {
    private val client = OkHttpClient()
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()
    private val mainHandler = Handler(Looper.getMainLooper())

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
                if (accessToken.isBlank()) {
                    post(callback, Result.failure(Exception("Token login tidak diterima.")))
                    return
                }

                post(callback, Result.success(UserSession(username = username.uppercase(Locale.US), accessToken = accessToken)))
            }
        })
    }

    fun fetchRemainingCustomers(accessToken: String): List<CustomerDebt> {
        val request = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/rest/v1/monitoring_remaining_customers?select=idpel,nama,tarif,daya,alamat,lembar,kolok,koked,rptag&report_id=eq.main&order=kolok.asc,koked.asc")
            .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
            .addHeader("Authorization", "Bearer $accessToken")
            .addHeader("Accept", "application/json")
            .get()
            .build()

        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw IOException("Gagal mengambil data tunggakan.")
            }

            val array = JSONArray(body)
            return List(array.length()) { index ->
                val item = array.getJSONObject(index)
                CustomerDebt(
                    idpel = item.optString("idpel"),
                    nama = item.optString("nama"),
                    tarif = item.optString("tarif"),
                    daya = item.optString("daya"),
                    alamat = item.optString("alamat"),
                    lembar = item.optDouble("lembar", 0.0).toInt(),
                    kolok = item.optString("kolok"),
                    koked = item.optString("koked"),
                    rptag = item.optDouble("rptag", 0.0)
                )
            }
        }
    }

    private fun <T> post(callback: (Result<T>) -> Unit, result: Result<T>) {
        mainHandler.post { callback(result) }
    }
}

data class UserSession(
    val username: String,
    val accessToken: String
)

data class CustomerDebt(
    val idpel: String,
    val nama: String,
    val tarif: String,
    val daya: String,
    val alamat: String,
    val lembar: Int,
    val kolok: String,
    val koked: String,
    val rptag: Double
)

fun formatRupiah(value: Double): String {
    return NumberFormat.getCurrencyInstance(Locale("id", "ID")).format(value).replace(",00", "")
}
