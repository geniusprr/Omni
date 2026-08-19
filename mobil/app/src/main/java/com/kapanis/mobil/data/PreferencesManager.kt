package com.kapanis.mobil.data

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject
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
        get() = prefs.getInt("server_port", 53317)
        set(value) = prefs.edit().putInt("server_port", value).apply()

    var wifiSsid: String
        get() = prefs.getString("last_wifi_ssid", "") ?: ""
        set(value) = prefs.edit().putString("last_wifi_ssid", value).apply()

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

    // Paired Devices History
    fun getPairedDevices(): List<PairedDeviceItem> {
        val raw = prefs.getString("paired_devices_json", "[]") ?: "[]"
        val list = mutableListOf<PairedDeviceItem>()
        try {
            val array = JSONArray(raw)
            for (i in 0 until array.length()) {
                val obj = array.getJSONObject(i)
                val modeStr = obj.optString("mode", ConnectionMode.LOCAL.name)
                val mode = try { ConnectionMode.valueOf(modeStr) } catch (e: Exception) { ConnectionMode.LOCAL }
                list.add(
                    PairedDeviceItem(
                        id = obj.optString("id", UUID.randomUUID().toString()),
                        name = obj.optString("name", "Windows PC"),
                        host = obj.optString("host", "192.168.1.100"),
                        port = obj.optInt("port", 53317),
                        mode = mode,
                        wifiSsid = obj.optString("wifiSsid", ""),
                        pairingCode = obj.optString("pairingCode", ""),
                        lastConnectedAt = obj.optLong("lastConnectedAt", System.currentTimeMillis()),
                        isOnline = obj.optBoolean("isOnline", false),
                        osInfo = obj.optString("osInfo", "Windows 11")
                    )
                )
            }
        } catch (e: Exception) {
            // ignore
        }
        return list.sortedByDescending { it.lastConnectedAt }
    }

    fun savePairedDevice(device: PairedDeviceItem) {
        val current = getPairedDevices().toMutableList()
        val existingIndex = current.indexOfFirst {
            if (device.mode == ConnectionMode.LOCAL) it.host == device.host && it.port == device.port
            else it.pairingCode == device.pairingCode && it.pairingCode.isNotEmpty()
        }

        if (existingIndex != -1) {
            current[existingIndex] = device.copy(lastConnectedAt = System.currentTimeMillis())
        } else {
            current.add(0, device.copy(lastConnectedAt = System.currentTimeMillis()))
        }

        val array = JSONArray()
        for (item in current.take(20)) {
            val obj = JSONObject().apply {
                put("id", item.id.ifEmpty { UUID.randomUUID().toString() })
                put("name", item.name)
                put("host", item.host)
                put("port", item.port)
                put("mode", item.mode.name)
                put("wifiSsid", item.wifiSsid)
                put("pairingCode", item.pairingCode)
                put("lastConnectedAt", item.lastConnectedAt)
                put("isOnline", item.isOnline)
                put("osInfo", item.osInfo)
            }
            array.put(obj)
        }
        prefs.edit().putString("paired_devices_json", array.toString()).apply()
    }

    fun removePairedDevice(id: String) {
        val filtered = getPairedDevices().filter { it.id != id }
        val array = JSONArray()
        for (item in filtered) {
            val obj = JSONObject().apply {
                put("id", item.id)
                put("name", item.name)
                put("host", item.host)
                put("port", item.port)
                put("mode", item.mode.name)
                put("wifiSsid", item.wifiSsid)
                put("pairingCode", item.pairingCode)
                put("lastConnectedAt", item.lastConnectedAt)
                put("isOnline", item.isOnline)
                put("osInfo", item.osInfo)
            }
            array.put(obj)
        }
        prefs.edit().putString("paired_devices_json", array.toString()).apply()
    }
}
