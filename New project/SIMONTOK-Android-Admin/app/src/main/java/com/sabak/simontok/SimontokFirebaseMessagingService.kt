package com.sabak.simontok

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlin.concurrent.thread

const val DEBT_NOTIFICATION_CHANNEL_ID = "debt_updates"

data class DebtPushMessage(
    val title: String,
    val body: String,
    val uploadedAt: String
)

object DebtPushMessageBus {
    @Volatile
    var listener: ((DebtPushMessage) -> Unit)? = null

    fun deliver(message: DebtPushMessage): Boolean {
        val activeListener = listener ?: return false
        activeListener(message)
        return true
    }
}

class SimontokFirebaseMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        val sessionStore = SessionStore(this)
        val current = sessionStore.read() ?: return
        thread {
            runCatching {
                val api = SupabaseApi()
                val refreshed = api.refreshSession(current)
                sessionStore.save(refreshed)
                api.registerPushToken(
                    accessToken = refreshed.accessToken,
                    username = refreshed.username,
                    token = token,
                    deviceId = DeviceStore(this).deviceId()
                )
                api.reportMonitoringDevice(
                    accessToken = refreshed.accessToken,
                    username = refreshed.username,
                    deviceId = DeviceStore(this).deviceId()
                )
            }
        }
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        val message = DebtPushMessage(
            title = remoteMessage.notification?.title
                ?: remoteMessage.data["title"]
                ?: "Data Tunggakan Terbaru",
            body = remoteMessage.notification?.body
                ?: remoteMessage.data["body"]
                ?: "Admin telah memperbarui data tunggakan.",
            uploadedAt = remoteMessage.data["uploadedAt"].orEmpty()
        )
        if (!DebtPushMessageBus.deliver(message)) {
            showSystemNotification(message)
        }
    }

    private fun showSystemNotification(message: DebtPushMessage) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return

        val openApp = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("debt_update_uploaded_at", message.uploadedAt)
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            message.uploadedAt.hashCode(),
            openApp,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(this, DEBT_NOTIFICATION_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle(message.title)
            .setContentText(message.body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message.body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()
        NotificationManagerCompat.from(this).notify(message.uploadedAt.hashCode(), notification)
    }
}
