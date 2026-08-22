package com.kapanis.mobil.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Restores the background local/cloud receiver after a device reboot. */
class KapanisBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action == Intent.ACTION_BOOT_COMPLETED ||
            intent?.action == Intent.ACTION_LOCKED_BOOT_COMPLETED ||
            intent?.action == "android.net.conn.CONNECTIVITY_CHANGE"
        ) {
            KapanisNotificationService.start(context)
        }
    }
}
