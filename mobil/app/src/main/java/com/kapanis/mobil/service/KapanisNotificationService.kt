package com.kapanis.mobil.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.kapanis.mobil.MainActivity
import com.kapanis.mobil.data.ConnectionMode
import com.kapanis.mobil.data.MirroredNotification
import com.kapanis.mobil.data.PreferencesManager
import com.kapanis.mobil.network.KapanisApiClient
import com.kapanis.mobil.network.SupabaseRemoteClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.LinkedHashSet

class KapanisNotificationService : Service() {

    private val serviceScope = CoroutineScope(Dispatchers.IO + Job())
    private lateinit var prefs: PreferencesManager
    private val apiClient = KapanisApiClient()
    private val supabaseClient = SupabaseRemoteClient()

    private val seenNotificationIds = LinkedHashSet<String>()
    private var activeSourceKey = ""
    private var isFirstSync = true

    companion object {
        const val CHANNEL_SERVICE_ID = "kapanis_service_channel"
        const val CHANNEL_MIRRORED_ID = "kapanis_pc_mirrored_channel"
        const val FOREGROUND_NOTIFICATION_ID = 9911
        private const val SYNC_INTERVAL_MS = 2500L

        fun start(context: Context) {
            try {
                val intent = Intent(context, KapanisNotificationService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            } catch (e: Throwable) {
                // Ignore ForegroundServiceStartNotAllowedException on background startup
            }
        }

        fun stop(context: Context) {
            try {
                val intent = Intent(context, KapanisNotificationService::class.java)
                context.stopService(intent)
            } catch (e: Throwable) {
                // ignore
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        try {
            prefs = PreferencesManager(this)
        } catch (e: Throwable) {
            stopSelf()
            return
        }

        // Keep these operations independent. A notification-channel or
        // foreground-start failure must not prevent the polling loop from being
        // created when the OS allows the service to continue.
        runCatching { createNotificationChannels() }
        runCatching { startForegroundServiceNotification() }
        startNotificationListenerLoop()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        serviceScope.cancel()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return

                // 1. Silent Service Channel
                val serviceChannel = NotificationChannel(
                    CHANNEL_SERVICE_ID,
                    "kapanış. Arka Plan Servisi",
                    NotificationManager.IMPORTANCE_LOW
                ).apply {
                    description = "PC bildirim aynalama ve arka plan bağlantı servisi"
                    setShowBadge(false)
                }
                manager.createNotificationChannel(serviceChannel)

                // 2. High-Priority Mirrored Notifications Channel
                val mirroredChannel = NotificationChannel(
                    CHANNEL_MIRRORED_ID,
                    "PC Windows Bildirimleri",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "Bilgisayarınızdan gelen WhatsApp, Discord, vb. Windows bildirimleri"
                    enableVibration(true)
                    setShowBadge(true)
                }
                manager.createNotificationChannel(mirroredChannel)
            } catch (e: Throwable) {
                // ignore
            }
        }
    }

    private fun startForegroundServiceNotification() {
        try {
            val launchIntent = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val pendingIntent = PendingIntent.getActivity(
                this,
                0,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
            )

            val notification = NotificationCompat.Builder(this, CHANNEL_SERVICE_ID)
                .setContentTitle("kapanış. Bildirim Aynalama")
                .setContentText("Windows bildirimleri arka planda dinleniyor")
                .setSmallIcon(android.R.drawable.ic_popup_sync)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .build()

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                try {
                    startForeground(
                        FOREGROUND_NOTIFICATION_ID,
                        notification,
                        android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                    )
                } catch (e: Throwable) {
                    startForeground(FOREGROUND_NOTIFICATION_ID, notification)
                }
            } else {
                startForeground(FOREGROUND_NOTIFICATION_ID, notification)
            }
        } catch (e: Throwable) {
            // Prevent foreground notification crash
        }
    }

    private fun startNotificationListenerLoop() {
        serviceScope.launch {
            while (isActive) {
                try {
                    syncNotificationSources()
                } catch (e: Exception) {
                    // ignore network blips
                }
                delay(SYNC_INTERVAL_MS)
            }
        }
    }

    private suspend fun syncNotificationSources() {
        val allNotifications = mutableListOf<MirroredNotification>()

        // Prefer the cloud stream whenever the paired device has Supabase
        // credentials. A stale LOCAL selection must not block this request
        // behind a LAN timeout. LAN remains the fallback for local-only pairs.
        val hasCloudPairing = prefs.supabaseUrl.isNotBlank() &&
            prefs.supabaseAnonKey.isNotBlank() &&
            prefs.pairedDeviceId.isNotBlank()
        if (hasCloudPairing) {
            allNotifications += fetchCloudNotifications()
        } else if (prefs.mode == ConnectionMode.LOCAL) {
            allNotifications += fetchLocalNotifications()
        }

        switchSourceIfNeeded("notifications:${prefs.pairedDeviceId}:${prefs.host}:${prefs.port}")

        val unique = linkedMapOf<String, MirroredNotification>()
        allNotifications
            .sortedByDescending { it.timestamp }
            .forEach { notification ->
                unique.putIfAbsent(notificationKey(notification), notification)
            }
        processNewNotifications(unique.values.toList())
    }

    private suspend fun fetchLocalNotifications(): List<MirroredNotification> {
        val host = prefs.host
        val port = prefs.port
        if (host.isBlank()) return emptyList()

        val token = prefs.getLocalAuthToken(host)
        val res = apiClient.fetchNotifications(host, port, token)
        return res.getOrDefault(emptyList())
    }

    private suspend fun fetchCloudNotifications(): List<MirroredNotification> {
        val url = prefs.supabaseUrl
        val key = prefs.supabaseAnonKey
        val deviceId = prefs.pairedDeviceId
        if (url.isBlank() || key.isBlank() || deviceId.isBlank()) return emptyList()

        val res = supabaseClient.fetchNotifications(url, key, deviceId)
        return res.getOrDefault(emptyList())
    }

    private fun processNewNotifications(notifications: List<MirroredNotification>) {
        if (isFirstSync) {
            // Populate seen IDs on initial load so we don't spam old history
            notifications.forEach { notif ->
                seenNotificationIds.add(notificationKey(notif))
            }
            isFirstSync = false
            return
        }

        for (notif in notifications) {
            val key = notificationKey(notif)
            if (key.isNotEmpty() && !seenNotificationIds.contains(key)) {
                seenNotificationIds.add(key)
                trimSeenNotificationIds()
                showSystemNotification(notif)
            }
        }
    }

    private fun notificationKey(notif: MirroredNotification): String {
        if (notif.notificationId.isNotBlank()) return "${notif.appName}::${notif.notificationId}"
        if (notif.id.isNotBlank()) return notif.id
        return "${notif.appName}::${notif.title}::${notif.body}::${notif.timestamp}"
    }

    private fun switchSourceIfNeeded(sourceKey: String) {
        if (activeSourceKey == sourceKey) return
        activeSourceKey = sourceKey
        seenNotificationIds.clear()
        isFirstSync = true
    }

    private fun trimSeenNotificationIds() {
        while (seenNotificationIds.size > 500) {
            val oldest = seenNotificationIds.iterator()
            if (!oldest.hasNext()) return
            oldest.next()
            oldest.remove()
        }
    }

    private fun showSystemNotification(notif: MirroredNotification) {
        val launchIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            notif.id.hashCode(),
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
        )

        val title = if (notif.title.isNotBlank()) "${notif.appName}: ${notif.title}" else notif.appName
        val message = notif.body.ifBlank { "Yeni PC bildirimi" }

        val notification = NotificationCompat.Builder(this, CHANNEL_MIRRORED_ID)
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val notifId = (System.currentTimeMillis() % 100000).toInt()
        manager.notify(notifId, notification)
    }
}
