package com.sabak.simontok

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import kotlin.concurrent.thread

internal class ReceiptHistoryApi {
    private val client = OkHttpClient()
    fun rpc(token: String, name: String, payload: JSONObject): String {
        val request = Request.Builder().url("${BuildConfig.SUPABASE_URL}/rest/v1/rpc/$name")
            .header("apikey",BuildConfig.SUPABASE_ANON_KEY).header("Authorization","Bearer $token")
            .header("x-simontok-version",BuildConfig.VERSION_NAME)
            .post(payload.toString().toRequestBody("application/json; charset=utf-8".toMediaType())).build()
        return client.newCall(request).execute().use {
            val body=it.body?.string().orEmpty()
            if(it.code==401) throw BillingSessionExpired()
            if(!it.isSuccessful) throw IOException("Riwayat belum tersinkron (HTTP ${it.code}).")
            body
        }
    }
}

internal object ReceiptHistorySync {
    private val syncLock = Any()
    fun schedule(context: Context) {
        val scheduler=context.getSystemService(JobScheduler::class.java)
        scheduler.schedule(JobInfo.Builder(17401,ComponentName(context,ReceiptHistorySyncService::class.java))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPersisted(true)
            .setBackoffCriteria(30_000,JobInfo.BACKOFF_POLICY_EXPONENTIAL).build())
    }

    fun <T> authenticated(context: Context, expectedUsername: String, block: (UserSession) -> T): T {
        val sessions=SessionStore(context)
        val current=sessions.read() ?: throw IOException("Silakan login ulang untuk sinkronisasi.")
        check(current.username.equals(expectedUsername,true)) { "Akun sudah berubah." }
        try { return block(current) } catch(expired: BillingSessionExpired) {
            val fresh=SupabaseApi().refreshSession(current)
            synchronized(this) {
                val active=sessions.read()
                check(active?.username.equals(expectedUsername,true)) { "Akun sudah berubah." }
                if(active?.refreshToken==current.refreshToken) sessions.save(fresh)
            }
            return block(fresh)
        }
    }

    fun sync(context: Context, username: String, upload: ((String, JSONObject) -> Unit)? = null) = synchronized(syncLock) {
            ReceiptHistoryStore(context).use { store ->
                val api=ReceiptHistoryApi()
                val send=upload ?: { name: String, payload: JSONObject ->
                    authenticated(context,username) { api.rpc(it.accessToken,name,payload) }
                    Unit
                }
                for(snapshot in store.pending(username)) {
                    send("save_receipt_history",JSONObject().put("p_snapshot",snapshot.json))
                    store.markSynced(username,snapshot.id)
                }
                for(event in store.pendingReprints(username)) {
                    send("record_receipt_reprint",event)
                    store.markSynced(username,event.getString("p_event_id"),true)
                }
            }
    }

    fun loadPage(context: Context, username: String, month: String, query: String, offset: Int): Int = synchronized(syncLock) {
        sync(context,username)
        val result=authenticated(context,username) { session ->
            // Native history stays scoped to the signed-in account, including admin accounts.
            val claims=JSONObject(String(android.util.Base64.decode(session.accessToken.split('.')[1],android.util.Base64.URL_SAFE)))
            JSONObject(ReceiptHistoryApi().rpc(session.accessToken,"list_receipt_history",JSONObject()
                .put("p_month","$month-01").put("p_query",query).put("p_offset",offset).put("p_limit",50)
                .put("p_user_id",claims.getString("sub"))))
        }
        ReceiptHistoryStore(context).use { store ->
            val rows=result.getJSONArray("rows")
            for(i in 0 until rows.length()) store.cacheRemote(username,rows.getJSONObject(i))
        }
        result.getInt("total")
    }

    fun snapshot(context: Context, username: String, entry: ReceiptHistoryEntry): ReceiptSnapshot {
        entry.snapshot?.let { return it }
        val json=authenticated(context,username) { JSONObject(ReceiptHistoryApi().rpc(it.accessToken,"get_receipt_snapshot",JSONObject().put("p_id",entry.id))) }
        ReceiptHistoryStore(context).use { it.cacheRemote(username,entry.metadata,json) }
        return ReceiptSnapshot(json)
    }
}

class ReceiptHistorySyncService : JobService() {
    override fun onStartJob(params: JobParameters): Boolean {
        thread(name="receipt-history-sync") {
            val retry=runCatching {
                val session=SessionStore(this).read() ?: return@runCatching false
                ReceiptHistorySync.sync(this,session.username)
                ReceiptHistoryStore(this).use { it.hasPending(session.username) }
            }.getOrDefault(true)
            jobFinished(params,retry)
        }
        return true
    }
    override fun onStopJob(params: JobParameters): Boolean = true
}
