package com.kapanis.mobil.data

import android.content.Context
import android.content.SharedPreferences
import java.util.UUID

class PreferencesManager(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("kapanis_mobile_prefs", Context.MODE_PRIVATE)

    var mode: ConnectionMode
        get() {
            val raw = prefs.getString("connection_mode", ConnectionMode.LOCAL.name) ?: ConnectionMode.LOCAL.name
            return try {
                ConnectionMode.valueOf(raw)
            } catch (e: Exception) {
                ConnectionMode.LOCAL
            }
        }
        set(value) = prefs.edit().putString("connection_mode", value.name).apply()

    // Local LAN Settings
    var host: String
        get() = prefs.getString("server_host", "192.168.1.100") ?: "192.168.1.100"
        set(value) = prefs.edit().putString("server_host", value.trim()).apply()

    var port: Int
        get() = prefs.getInt("server_port", 54321)
        set(value) = prefs.edit().putInt("server_port", value).apply()

    // Supabase Online Settings
    var supabaseUrl: String
        get() = prefs.getString("supabase_url", "") ?: ""
        set(value) = prefs.edit().putString("supabase_url", value.trim()).apply()

    var supabaseAnonKey: String
        get() = prefs.getString("supabase_anon_key", "") ?: ""
        set(value) = prefs.edit().putString("supabase_anon_key", value.trim()).apply()

    var pairingCode: String
        get() = prefs.getString("pairing_code", "") ?: ""
        set(value) = prefs.edit().putString("pairing_code", value.trim().uppercase()).apply()

    var pairedDeviceId: String
        get() = prefs.getString("paired_device_id", "") ?: ""
        set(value) = prefs.edit().putString("paired_device_id", value).apply()

    var controllerId: String
        get() {
            var id = prefs.getString("controller_id", "") ?: ""
            if (id.isEmpty()) {
                id = "ctrl-" + UUID.randomUUID().toString().substring(0, 8)
                prefs.edit().putString("controller_id", id).apply()
            }
            return id
        }
        set(value) = prefs.edit().putString("controller_id", value).apply()

    var controllerName: String
        get() = prefs.getString("controller_name", "Android Telefon") ?: "Android Telefon"
        set(value) = prefs.edit().putString("controller_name", value).apply()

    var deviceName: String
        get() = prefs.getString("device_name", "Windows PC") ?: "Windows PC"
        set(value) = prefs.edit().putString("device_name", value).apply()

    var lastConnectedAt: Long
        get() = prefs.getLong("last_connected_at", 0L)
        set(value) = prefs.edit().putLong("last_connected_at", value).apply()
}
