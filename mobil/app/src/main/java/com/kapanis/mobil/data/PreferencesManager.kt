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

    var themeMode: String
        get() = prefs.getString("theme_mode", "dark") ?: "dark"
        set(value) = prefs.edit().putString("theme_mode", value).apply()

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

    // Local Auth Token (PIN gate token loc_...)
    fun getLocalAuthToken(host: String): String {
        return prefs.getString("local_auth_token_$host", "") ?: ""
    }

    fun saveLocalAuthToken(host: String, token: String) {
        prefs.edit().putString("local_auth_token_$host", token).apply()
    }

    // Active Device ID
    var activeDeviceId: String
        get() = prefs.getString("active_device_id", "") ?: ""
        set(value) = prefs.edit().putString("active_device_id", value).apply()

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
                
                val ipsArray = obj.optJSONArray("localIps")
                val ipsList = mutableListOf<String>()
                if (ipsArray != null) {
                    for (j in 0 until ipsArray.length()) {
                        ipsList.add(ipsArray.getString(j))
                    }
                }

                list.add(
                    PairedDeviceItem(
                        id = obj.optString("id", UUID.randomUUID().toString()),
                        name = obj.optString("name", "Windows PC"),
                        host = obj.optString("host", "192.168.1.100"),
                        port = obj.optInt("port", 53317),
                        mode = mode,
                        wifiSsid = obj.optString("wifiSsid", ""),
                        pairingCode = obj.optString("pairingCode", ""),
                        pairingSecret = obj.optString("pairingSecret", ""),
                        supabaseUrl = obj.optString("supabaseUrl", ""),
                        supabaseAnonKey = obj.optString("supabaseAnonKey", ""),
                        localIps = ipsList,
                        ntfyTopic = obj.optString("ntfyTopic", ""),
                        localAuthToken = obj.optString("localAuthToken", ""),
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
            if (device.id.isNotEmpty() && it.id == device.id) true
            else if (device.mode == ConnectionMode.LOCAL) it.host == device.host && it.port == device.port
            else it.pairingCode == device.pairingCode && it.pairingCode.isNotEmpty()
        }

        val updated = device.copy(lastConnectedAt = System.currentTimeMillis())
        if (existingIndex != -1) {
            current[existingIndex] = updated
        } else {
            current.add(0, updated)
        }
        activeDeviceId = updated.id

        val array = JSONArray()
        for (item in current.take(30)) {
            val obj = JSONObject().apply {
                put("id", item.id.ifEmpty { UUID.randomUUID().toString() })
                put("name", item.name)
                put("host", item.host)
                put("port", item.port)
                put("mode", item.mode.name)
                put("wifiSsid", item.wifiSsid)
                put("pairingCode", item.pairingCode)
                put("pairingSecret", item.pairingSecret)
                put("supabaseUrl", item.supabaseUrl)
                put("supabaseAnonKey", item.supabaseAnonKey)
                put("ntfyTopic", item.ntfyTopic)
                put("localAuthToken", item.localAuthToken)
                put("lastConnectedAt", item.lastConnectedAt)
                put("isOnline", item.isOnline)
                put("osInfo", item.osInfo)
                val ipsArr = JSONArray()
                item.localIps.forEach { ipsArr.put(it) }
                put("localIps", ipsArr)
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
                put("pairingSecret", item.pairingSecret)
                put("supabaseUrl", item.supabaseUrl)
                put("supabaseAnonKey", item.supabaseAnonKey)
                put("ntfyTopic", item.ntfyTopic)
                put("localAuthToken", item.localAuthToken)
                put("lastConnectedAt", item.lastConnectedAt)
                put("isOnline", item.isOnline)
                put("osInfo", item.osInfo)
                val ipsArr = JSONArray()
                item.localIps.forEach { ipsArr.put(it) }
                put("localIps", ipsArr)
            }
            array.put(obj)
        }
        prefs.edit().putString("paired_devices_json", array.toString()).apply()
        if (activeDeviceId == id) {
            activeDeviceId = filtered.firstOrNull()?.id ?: ""
        }
    }

    companion object {
        fun parsePairingPayload(input: String?): PairingPayload? {
            if (input.isNullOrBlank()) return null
            var raw = input.trim()

            if (raw.contains("pair_data=")) {
                val match = Regex("pair_data=([^&]+)").find(raw)
                if (match != null) {
                    raw = java.net.URLDecoder.decode(match.groupValues[1], "UTF-8")
                }
            }

            // 1. Try Base64 decode
            try {
                var base64 = raw.replace('-', '+').replace('_', '/')
                while (base64.length % 4 != 0) {
                    base64 += "="
                }
                val decodedBytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT)
                val decodedStr = String(decodedBytes, Charsets.UTF_8)
                val obj = JSONObject(decodedStr)
                if (obj.has("id") || obj.has("code") || obj.has("url")) {
                    val ipsList = mutableListOf<String>()
                    val ipsArr = obj.optJSONArray("ips")
                    if (ipsArr != null) {
                        for (i in 0 until ipsArr.length()) {
                            ipsList.add(ipsArr.getString(i))
                        }
                    }
                    return PairingPayload(
                        v = obj.optInt("v", 2),
                        id = obj.optString("id", ""),
                        name = obj.optString("name", "Windows PC"),
                        code = obj.optString("code", ""),
                        secret = obj.optString("secret", ""),
                        url = obj.optString("url", ""),
                        key = obj.optString("key", ""),
                        ips = ipsList,
                        port = obj.optInt("port", 53317),
                        ntfy = obj.optString("ntfy", "")
                    )
                }
            } catch (e: Exception) {
                // ignore
            }

            // 2. Try raw JSON decode
            try {
                val obj = JSONObject(raw)
                if (obj.has("id") || obj.has("code") || obj.has("url")) {
                    val ipsList = mutableListOf<String>()
                    val ipsArr = obj.optJSONArray("ips")
                    if (ipsArr != null) {
                        for (i in 0 until ipsArr.length()) {
                            ipsList.add(ipsArr.getString(i))
                        }
                    }
                    return PairingPayload(
                        v = obj.optInt("v", 2),
                        id = obj.optString("id", ""),
                        name = obj.optString("name", "Windows PC"),
                        code = obj.optString("code", ""),
                        secret = obj.optString("secret", ""),
                        url = obj.optString("url", ""),
                        key = obj.optString("key", ""),
                        ips = ipsList,
                        port = obj.optInt("port", 53317),
                        ntfy = obj.optString("ntfy", "")
                    )
                }
            } catch (e: Exception) {
                // ignore
            }

            return null
        }
    }
}
