package com.kapanis.mobil.data

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.nio.ByteBuffer
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.spec.GCMParameterSpec
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
    fun getLocalAuthToken(key: String): String {
        if (key.isBlank()) return readSecureToken("last_active_local_auth_token")
        val direct = readSecureToken("local_auth_token_$key")
        if (direct.isNotEmpty()) return direct

        // Search in paired devices by ID or host
        val devices = getPairedDevices()
        val match = devices.firstOrNull { it.id == key || it.host == key || it.localIps.contains(key) }
        if (match != null && match.localAuthToken.isNotEmpty()) {
            return match.localAuthToken
        }

        // Active device fallback
        val activeId = activeDeviceId
        if (activeId.isNotEmpty() && activeId != key) {
            val activeToken = readSecureToken("local_auth_token_$activeId")
            if (activeToken.isNotEmpty()) return activeToken
        }

        return readSecureToken("last_active_local_auth_token")
    }

    fun saveLocalAuthToken(key: String, token: String) {
        if (token.isBlank()) return
        writeSecureToken("local_auth_token_$key", token)
        writeSecureToken("last_active_local_auth_token", token)

        // Also persist in paired devices record
        val devices = getPairedDevices().toMutableList()
        val index = devices.indexOfFirst { it.id == key || it.host == key || it.localIps.contains(key) }
        if (index != -1) {
            devices[index] = devices[index].copy(localAuthToken = token)
            savePairedDevice(devices[index])
        }
    }

    // Active Device ID
    var activeDeviceId: String
        get() = prefs.getString("active_device_id", "") ?: ""
        set(value) = prefs.edit().putString("active_device_id", value).apply()

    // Paired Devices History
    fun getPairedDevices(): List<PairedDeviceItem> {
        val raw = prefs.getString("paired_devices_json", "[]") ?: "[]"
        val list = mutableListOf<PairedDeviceItem>()
        var migratedLegacyToken = false
        try {
            val array = JSONArray(raw)
            for (i in 0 until array.length()) {
                val obj = array.getJSONObject(i)
                val itemId = obj.optString("id", "").ifBlank { UUID.randomUUID().toString() }
                val legacyToken = obj.optString("localAuthToken", "")
                if (legacyToken.isNotBlank()) migratedLegacyToken = true
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
                        id = itemId,
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
                        localAuthToken = readDeviceToken(itemId, legacyToken),
                        lastConnectedAt = obj.optLong("lastConnectedAt", System.currentTimeMillis()),
                        isOnline = obj.optBoolean("isOnline", false),
                        osInfo = obj.optString("osInfo", "Windows 11")
                    )
                )
            }
        } catch (e: Exception) {
            // ignore
        }
        if (migratedLegacyToken) persistPairedDevices(list)
        return list.sortedByDescending { it.lastConnectedAt }
    }

    fun savePairedDevice(device: PairedDeviceItem) {
        val current = getPairedDevices().toMutableList()
        val existingIndex = current.indexOfFirst {
            if (device.id.isNotEmpty() && it.id == device.id) true
            else if (device.mode == ConnectionMode.LOCAL) (it.host == device.host && it.port == device.port) || (device.localIps.isNotEmpty() && it.localIps.any { ip -> device.localIps.contains(ip) })
            else it.pairingCode == device.pairingCode && it.pairingCode.isNotEmpty()
        }

        // Merge localIps
        val combinedIps = (device.localIps + (if (existingIndex != -1) current[existingIndex].localIps else emptyList()) + listOf(device.host)).filter { it.isNotBlank() && it != "localhost" && it != "127.0.0.1" }.distinct()
        val tokenToKeep = if (device.localAuthToken.isNotEmpty()) device.localAuthToken else if (existingIndex != -1) current[existingIndex].localAuthToken else getLocalAuthToken(device.id)

        val updated = device.copy(
            localIps = combinedIps,
            localAuthToken = tokenToKeep,
            lastConnectedAt = System.currentTimeMillis()
        )

        if (existingIndex != -1) {
            current[existingIndex] = updated
        } else {
            current.add(0, updated)
        }
        activeDeviceId = updated.id
        if (tokenToKeep.isNotEmpty()) {
            writeSecureToken("local_auth_token_${updated.id}", tokenToKeep)
            writeSecureToken("local_auth_token_${updated.host}", tokenToKeep)
        }

        persistPairedDevices(current.take(30))
    }

    fun removePairedDevice(id: String) {
        val existing = getPairedDevices()
        val removedDevice = existing.firstOrNull { it.id == id }
        val filtered = existing.filter { it.id != id }
        persistPairedDevices(filtered)
        if (activeDeviceId == id) {
            val next = filtered.firstOrNull()
            activeDeviceId = next?.id ?: ""
            prefs.edit().remove("last_active_local_auth_token").apply()
            if (next != null) {
                val nextToken = readSecureToken("local_auth_token_${next.id}")
                if (nextToken.isNotBlank()) writeSecureToken("last_active_local_auth_token", nextToken)
            }
        }
        val tokenEditor = prefs.edit().remove("local_auth_token_$id")
        removedDevice?.let { device ->
            tokenEditor.remove("local_auth_token_${device.host}")
            device.localIps.forEach { ip -> tokenEditor.remove("local_auth_token_$ip") }
        }
        tokenEditor.apply()
    }

    private fun persistPairedDevices(items: List<PairedDeviceItem>) {
        val array = JSONArray()
        for (item in items) {
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
                // Auth tokens live in the Android Keystore-backed store, never in this JSON blob.
                put("localAuthToken", "")
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

    private fun readDeviceToken(id: String, legacyToken: String): String {
        val secure = readSecureToken("local_auth_token_$id")
        if (secure.isNotEmpty()) return secure
        if (legacyToken.isNotBlank()) {
            writeSecureToken("local_auth_token_$id", legacyToken)
            return legacyToken
        }
        return ""
    }

    private fun readSecureToken(key: String): String {
        val raw = prefs.getString(key, "") ?: ""
        if (raw.isBlank()) return ""
        return if (raw.startsWith("enc:")) decrypt(raw.removePrefix("enc:")) else raw
    }

    private fun writeSecureToken(key: String, value: String) {
        if (value.isBlank()) return
        val encrypted = encrypt(value)
        if (encrypted == null) {
            // Never fall back to plaintext token persistence. The user can pair again
            // on devices where Android Keystore is unavailable.
            prefs.edit().remove(key).apply()
            return
        }
        prefs.edit().putString(key, "enc:$encrypted").apply()
    }

    private fun encryptionKey(): javax.crypto.SecretKey? {
        return try {
            val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            val alias = "kapanis.local.auth"
            if (!store.containsAlias(alias)) {
                val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
                generator.init(
                    KeyGenParameterSpec.Builder(
                        alias,
                        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
                    ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                        .build()
                )
                generator.generateKey()
            }
            (store.getEntry(alias, null) as? KeyStore.SecretKeyEntry)?.secretKey
        } catch (_: Exception) {
            null
        }
    }

    private fun encrypt(value: String): String? {
        return try {
            val key = encryptionKey() ?: return null
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, key)
            val iv = cipher.iv
            val encrypted = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
            Base64.encodeToString(ByteBuffer.allocate(4 + iv.size + encrypted.size).putInt(iv.size).put(iv).put(encrypted).array(), Base64.NO_WRAP)
        } catch (_: Exception) {
            null
        }
    }

    private fun decrypt(value: String): String {
        return try {
            val bytes = Base64.decode(value, Base64.NO_WRAP)
            val buffer = ByteBuffer.wrap(bytes)
            val ivLength = buffer.int
            val iv = ByteArray(ivLength).also { buffer.get(it) }
            val encrypted = ByteArray(buffer.remaining()).also { buffer.get(it) }
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, encryptionKey(), GCMParameterSpec(128, iv))
            String(cipher.doFinal(encrypted), Charsets.UTF_8)
        } catch (_: Exception) {
            ""
        }
    }

    companion object {
        fun parsePairingPayload(input: String?): PairingPayload? {
            if (input.isNullOrBlank()) return null
            var raw = input.trim()

            // Handle query parameter pair_data
            if (raw.contains("pair_data=")) {
                val match = Regex("pair_data=([^&]+)").find(raw)
                if (match != null) {
                    try {
                        raw = java.net.URLDecoder.decode(match.groupValues[1], "UTF-8")
                    } catch (e: Exception) {
                        raw = match.groupValues[1]
                    }
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
                if (obj.has("id") || obj.has("code") || obj.has("url") || obj.has("secret") || obj.has("ips")) {
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
                if (obj.has("id") || obj.has("code") || obj.has("url") || obj.has("secret") || obj.has("ips")) {
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

            // 3. Handle kapanis:// deep links or HTTP URL (e.g. http://192.168.1.50:53317)
            try {
                val uri = android.net.Uri.parse(raw)
                val scheme = uri.scheme?.lowercase()
                if (scheme == "kapanis" || scheme == "http" || scheme == "https") {
                    val host = uri.host ?: ""
                    val port = if (uri.port != -1) uri.port else 53317
                    val code = uri.getQueryParameter("code") ?: uri.getQueryParameter("pin") ?: ""
                    val name = uri.getQueryParameter("name") ?: uri.getQueryParameter("alias") ?: "Windows PC"
                    val secret = uri.getQueryParameter("secret") ?: ""
                    val supabaseUrl = uri.getQueryParameter("supabaseUrl") ?: uri.getQueryParameter("url") ?: ""
                    val supabaseKey = uri.getQueryParameter("supabaseKey") ?: uri.getQueryParameter("key") ?: ""
                    val id = uri.getQueryParameter("id") ?: uri.getQueryParameter("deviceId") ?: ""

                    if (host.isNotEmpty() || code.isNotEmpty() || supabaseUrl.isNotEmpty()) {
                        return PairingPayload(
                            v = 2,
                            id = id,
                            name = name,
                            code = code,
                            secret = secret,
                            url = supabaseUrl,
                            key = supabaseKey,
                            ips = if (host.isNotEmpty()) listOf(host) else emptyList(),
                            port = port
                        )
                    }
                }
            } catch (e: Exception) {
                // ignore
            }

            // 4. Handle raw IP:Port string (e.g. "192.168.1.50:53317" or "192.168.1.50")
            val ipMatch = Regex("""^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::(\d+))?$""").find(raw)
            if (ipMatch != null) {
                val host = ipMatch.groupValues[1]
                val port = ipMatch.groupValues[2].toIntOrNull() ?: 53317
                return PairingPayload(
                    v = 2,
                    id = "",
                    name = "Windows PC",
                    code = "",
                    secret = "",
                    url = "",
                    key = "",
                    ips = listOf(host),
                    port = port
                )
            }

            // 5. Handle simple pairing code (e.g. "KAP-ABCD" or "ABCD")
            val codeMatch = Regex("""^(?:KAP-)?[A-Za-z0-9]{4,12}$""").find(raw)
            if (codeMatch != null) {
                val cleanCode = raw.uppercase().let { if (it.startsWith("KAP-")) it else "KAP-$it" }
                return PairingPayload(
                    v = 2,
                    id = "",
                    name = "Windows PC",
                    code = cleanCode,
                    secret = "",
                    url = "",
                    key = "",
                    ips = emptyList(),
                    port = 53317
                )
            }
            return null
        }
    }
}
