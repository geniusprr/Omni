package com.kapanis.mobil.network

import com.kapanis.mobil.data.ConnectionMode
import com.kapanis.mobil.data.MirroredNotification
import com.kapanis.mobil.data.OnlineDeviceState
import com.kapanis.mobil.data.PairedDeviceItem
import com.kapanis.mobil.data.PairingPayload
import com.kapanis.mobil.data.RemoteTimerState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class SupabaseRemoteClient {

    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .build()

    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    suspend fun pairDeviceByCode(
        url: String,
        anonKey: String,
        pairingCode: String,
        controllerId: String,
        controllerName: String = "Android Telefon"
    ): Result<OnlineDeviceState> = withContext(Dispatchers.IO) {
        try {
            val cleanUrl = url.trim().removeSuffix("/")
            val cleanCode = pairingCode.trim().uppercase()
            val codeWithPrefix = if (cleanCode.startsWith("KAP-")) cleanCode else "KAP-$cleanCode"
            val codeWithoutPrefix = cleanCode.removePrefix("KAP-")

            val endpoint = "$cleanUrl/rest/v1/devices?or=(pairing_code.eq.$codeWithPrefix,pairing_code.eq.$codeWithoutPrefix,pairing_code.eq.$cleanCode)&select=*"
            val request = Request.Builder()
                .url(endpoint)
                .addHeader("apikey", anonKey)
                .addHeader("Authorization", "Bearer $anonKey")
                .get()
                .build()

            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    return@withContext Result.failure(Exception("Supabase hatası: HTTP ${response.code}"))
                }
                val body = response.body?.string().orEmpty()
                val array = JSONArray(body)
                if (array.length() == 0) {
                    return@withContext Result.failure(Exception("Eşleştirme koduna ait bilgisayar bulunamadı ($cleanCode). Bilgisayarda kapanış uygulamasının açık ve Ayarlar sekmesinde Supabase'in bağlı olduğundan emin olun."))
                }

                val devObj = array.getJSONObject(0)
                val deviceId = devObj.getString("id")

                // Register paired controller
                val registerEndpoint = "$cleanUrl/rest/v1/paired_controllers"
                val regJson = JSONObject().apply {
                    put("device_id", deviceId)
                    put("controller_id", controllerId)
                    put("controller_name", controllerName)
                    put("controller_type", "mobile")
                }
                val regReq = Request.Builder()
                    .url(registerEndpoint)
                    .addHeader("apikey", anonKey)
                    .addHeader("Authorization", "Bearer $anonKey")
                    .addHeader("Prefer", "resolution=merge-duplicates")
                    .post(regJson.toString().toRequestBody(jsonMediaType))
                    .build()

                client.newCall(regReq).execute().close()

                val state = parseDeviceObject(devObj)
                Result.success(state)
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun fetchDeviceState(
        url: String,
        anonKey: String,
        deviceId: String
    ): Result<OnlineDeviceState> = withContext(Dispatchers.IO) {
        try {
            val cleanUrl = url.trim().removeSuffix("/")
            val endpoint = "$cleanUrl/rest/v1/devices?id=eq.$deviceId&select=*"
            val request = Request.Builder()
                .url(endpoint)
                .addHeader("apikey", anonKey)
                .addHeader("Authorization", "Bearer $anonKey")
                .get()
                .build()

            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    return@withContext Result.failure(Exception("Cihaz durumu okunamadı (${response.code})"))
                }
                val body = response.body?.string().orEmpty()
                val array = JSONArray(body)
                if (array.length() == 0) {
                    return@withContext Result.failure(Exception("Cihaz bulunamadı"))
                }
                val state = parseDeviceObject(array.getJSONObject(0))
                Result.success(state)
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun sendRemoteCommand(
        url: String,
        anonKey: String,
        deviceId: String,
        controllerId: String,
        command: String,
        delaySeconds: Long = 0L
    ): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            val cleanUrl = url.trim().removeSuffix("/")
            val endpoint = "$cleanUrl/rest/v1/device_commands"

            val json = JSONObject().apply {
                put("device_id", deviceId)
                put("controller_id", controllerId)
                put("command", command)
                put("delay_seconds", delaySeconds)
                put("status", "pending")
            }

            val request = Request.Builder()
                .url(endpoint)
                .addHeader("apikey", anonKey)
                .addHeader("Authorization", "Bearer $anonKey")
                .addHeader("Prefer", "return=minimal")
                .post(json.toString().toRequestBody(jsonMediaType))
                .build()

            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    Result.success(true)
                } else {
                    Result.failure(Exception("Komut iletilemedi (${response.code})"))
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun fetchNotifications(
        url: String,
        anonKey: String,
        deviceId: String
    ): Result<List<MirroredNotification>> = withContext(Dispatchers.IO) {
        try {
            val cleanUrl = url.trim().removeSuffix("/")
            val endpoint = "$cleanUrl/rest/v1/device_notifications?device_id=eq.$deviceId&order=timestamp.desc&limit=100"
            val request = Request.Builder()
                .url(endpoint)
                .addHeader("apikey", anonKey)
                .addHeader("Authorization", "Bearer $anonKey")
                .get()
                .build()

            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    return@withContext Result.failure(Exception("Bildirimler okunamadı (${response.code})"))
                }
                val body = response.body?.string().orEmpty()
                val array = JSONArray(body)
                val list = mutableListOf<MirroredNotification>()
                for (i in 0 until array.length()) {
                    val obj = array.optJSONObject(i) ?: continue
                    val tsStr = obj.optString("timestamp", "")
                    val ts = try {
                        val sdf = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.US)
                        sdf.timeZone = java.util.TimeZone.getTimeZone("UTC")
                        sdf.parse(tsStr.take(19))?.time ?: System.currentTimeMillis()
                    } catch (e: Exception) {
                        System.currentTimeMillis()
                    }

                    list.add(
                        MirroredNotification(
                            id = obj.optString("id", ""),
                            notificationId = obj.optString("notification_id", ""),
                            appName = obj.optString("app_name", "Sistem"),
                            title = obj.optString("title", ""),
                            body = obj.optString("body", ""),
                            timestamp = ts,
                            source = "windows"
                        )
                    )
                }
                Result.success(list)
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun pairWithPayload(
        payload: PairingPayload,
        controllerId: String,
        controllerName: String = "Android Telefon"
    ): Result<PairedDeviceItem> = withContext(Dispatchers.IO) {
        if (payload.url.isNotEmpty() && payload.key.isNotEmpty()) {
            val codeToUse = payload.code.ifEmpty { payload.secret }
            val pairRes = pairDeviceByCode(payload.url, payload.key, codeToUse, controllerId, controllerName)
            if (pairRes.isSuccess) {
                val dev = pairRes.getOrThrow()
                val item = PairedDeviceItem(
                    id = dev.id,
                    name = dev.name.ifEmpty { payload.name },
                    host = payload.ips.firstOrNull() ?: "192.168.1.100",
                    port = payload.port,
                    mode = ConnectionMode.ONLINE,
                    pairingCode = dev.pairingCode.ifEmpty { payload.code },
                    pairingSecret = payload.secret,
                    supabaseUrl = payload.url,
                    supabaseAnonKey = payload.key,
                    localIps = payload.ips,
                    ntfyTopic = payload.ntfy.ifEmpty { "kapanis_${dev.id.take(8)}" },
                    isOnline = dev.isOnline
                )
                return@withContext Result.success(item)
            }
        }

        // Fallback: Local or offline saved device
        val item = PairedDeviceItem(
            id = payload.id.ifEmpty { java.util.UUID.randomUUID().toString() },
            name = payload.name,
            host = payload.ips.firstOrNull() ?: "192.168.1.100",
            port = payload.port,
            mode = if (payload.url.isNotEmpty()) ConnectionMode.ONLINE else ConnectionMode.LOCAL,
            pairingCode = payload.code,
            pairingSecret = payload.secret,
            supabaseUrl = payload.url,
            supabaseAnonKey = payload.key,
            localIps = payload.ips,
            ntfyTopic = payload.ntfy,
            isOnline = false
        )
        Result.success(item)
    }

    private fun parseDeviceObject(obj: JSONObject): OnlineDeviceState {
        val timerJson = obj.optJSONObject("timer_state")
        val timerState = if (timerJson != null) {
            RemoteTimerState(
                action = timerJson.optString("action", "shutdown"),
                targetAt = timerJson.optLong("targetAt", 0L),
                durationSeconds = timerJson.optLong("durationSeconds", 0L)
            )
        } else null

        return OnlineDeviceState(
            id = obj.optString("id", ""),
            name = obj.optString("name", "Windows PC"),
            pairingCode = obj.optString("pairing_code", ""),
            isOnline = obj.optBoolean("is_online", false),
            lastSeenAt = obj.optString("last_seen_at", ""),
            timerState = timerState
        )
    }
}

