package com.kapanis.mobil.network

import com.kapanis.mobil.data.ConnectionMode
import com.kapanis.mobil.data.CloudTransfer
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
import android.content.Context
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

class SupabaseRemoteClient {

    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .build()

    private val downloadClient: OkHttpClient = client.newBuilder()
        .readTimeout(5, TimeUnit.MINUTES)
        .writeTimeout(30, TimeUnit.SECONDS)
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

    /** Keep the phone visible as an active cloud controller while the UI is closed. */
    suspend fun heartbeatController(
        url: String,
        anonKey: String,
        deviceId: String,
        controllerId: String,
        controllerName: String
    ): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            val cleanUrl = url.trim().removeSuffix("/")
            val endpoint = "$cleanUrl/rest/v1/paired_controllers?on_conflict=device_id,controller_id"
            val payload = JSONObject()
                .put("device_id", deviceId)
                .put("controller_id", controllerId)
                .put("controller_name", controllerName)
                .put("controller_type", "mobile")
                .put("last_active_at", java.time.Instant.now().toString())
            val request = Request.Builder()
                .url(endpoint)
                .addHeader("apikey", anonKey)
                .addHeader("Authorization", "Bearer $anonKey")
                .addHeader("Prefer", "resolution=merge-duplicates,return=minimal")
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build()

            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) Result.success(true)
                else Result.failure(Exception("Bulut cihaz kalp atışı başarısız (${response.code})"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun fetchPendingTransfers(
        url: String,
        anonKey: String,
        deviceId: String,
        controllerId: String
    ): Result<List<CloudTransfer>> = withContext(Dispatchers.IO) {
        try {
            val cleanUrl = url.trim().removeSuffix("/")
            val endpoint = "$cleanUrl/rest/v1/device_transfers" +
                "?device_id=eq.${encodeQuery(deviceId)}" +
                "&controller_id=eq.${encodeQuery(controllerId)}" +
                "&status=eq.pending&order=created_at.asc&limit=5"
            val request = Request.Builder()
                .url(endpoint)
                .addHeader("apikey", anonKey)
                .addHeader("Authorization", "Bearer $anonKey")
                .get()
                .build()

            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    return@withContext Result.failure(Exception("Bulut dosya kuyruğu okunamadı (${response.code})"))
                }
                val array = JSONArray(response.body?.string().orEmpty())
                val transfers = buildList {
                    for (i in 0 until array.length()) {
                        val obj = array.optJSONObject(i) ?: continue
                        add(
                            CloudTransfer(
                                id = obj.optString("id", ""),
                                deviceId = obj.optString("device_id", ""),
                                controllerId = obj.optString("controller_id", ""),
                                filename = obj.optString("file_name", "dosya"),
                                mimeType = obj.optString("mime_type", "application/octet-stream"),
                                size = obj.optLong("size", 0L),
                                storagePath = obj.optString("storage_path", ""),
                                status = obj.optString("status", "pending"),
                                createdAt = parseIsoTimestamp(obj.optString("created_at", ""))
                            )
                        )
                    }
                }
                Result.success(transfers)
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /** Atomically claims a pending row so a restarted service does not download it twice. */
    suspend fun claimTransfer(
        url: String,
        anonKey: String,
        transfer: CloudTransfer,
        controllerId: String
    ): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            val cleanUrl = url.trim().removeSuffix("/")
            val endpoint = "$cleanUrl/rest/v1/device_transfers" +
                "?id=eq.${encodeQuery(transfer.id)}" +
                "&device_id=eq.${encodeQuery(transfer.deviceId)}" +
                "&controller_id=eq.${encodeQuery(controllerId)}&status=eq.pending"
            val payload = JSONObject()
                .put("status", "processing")
                .put("updated_at", java.time.Instant.now().toString())
            val request = Request.Builder()
                .url(endpoint)
                .addHeader("apikey", anonKey)
                .addHeader("Authorization", "Bearer $anonKey")
                .addHeader("Prefer", "return=representation")
                .patch(payload.toString().toRequestBody(jsonMediaType))
                .build()

            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@withContext Result.failure(Exception("Bulut dosya kilitlenemedi (${response.code})"))
                val body = response.body?.string().orEmpty()
                Result.success(body.trim().startsWith("[") && body.trim() != "[]")
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun downloadTransferToFile(
        context: Context,
        url: String,
        anonKey: String,
        storagePath: String,
        expectedSize: Long,
        onProgress: (Float) -> Unit = {}
    ): Result<File> = withContext(Dispatchers.IO) {
        val tempFile = runCatching { File.createTempFile("kapanis-transfer-", ".part", context.cacheDir) }.getOrNull()
            ?: return@withContext Result.failure(Exception("Geçici dosya oluşturulamadı."))
        try {
            val cleanUrl = url.trim().removeSuffix("/")
            val encodedPath = storagePath.split('/').joinToString("/") { encodeQuery(it) }
            val endpoint = "$cleanUrl/storage/v1/object/kapanis-transfers/$encodedPath"
            val request = Request.Builder()
                .url(endpoint)
                .addHeader("apikey", anonKey)
                .addHeader("Authorization", "Bearer $anonKey")
                .get()
                .build()

            downloadClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) throw IOException("Bulut dosya indirilemedi (${response.code})")
                val body = response.body ?: throw IOException("Bulut dosya gövdesi boş.")
                val total = if (expectedSize > 0L) expectedSize else body.contentLength()
                var copied = 0L
                body.byteStream().use { input ->
                    FileOutputStream(tempFile).use { output ->
                        val buffer = ByteArray(64 * 1024)
                        while (true) {
                            val count = input.read(buffer)
                            if (count < 0) break
                            output.write(buffer, 0, count)
                            copied += count.toLong()
                            if (total > 0L) onProgress((copied.toFloat() / total.toFloat()).coerceIn(0f, 1f))
                        }
                    }
                }
                if (expectedSize >= 0L && copied != expectedSize) {
                    throw IOException("Bulut dosya boyutu doğrulanamadı.")
                }
            }
            Result.success(tempFile)
        } catch (e: Exception) {
            tempFile.delete()
            Result.failure(e)
        }
    }

    suspend fun finishTransfer(
        url: String,
        anonKey: String,
        transfer: CloudTransfer,
        controllerId: String,
        success: Boolean,
        localUri: String = "",
        errorMessage: String = ""
    ): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            val cleanUrl = url.trim().removeSuffix("/")
            val endpoint = "$cleanUrl/rest/v1/device_transfers" +
                "?id=eq.${encodeQuery(transfer.id)}" +
                "&device_id=eq.${encodeQuery(transfer.deviceId)}" +
                "&controller_id=eq.${encodeQuery(controllerId)}"
            val payload = JSONObject()
                .put("status", if (success) "completed" else "failed")
                .put("completed_at", if (success) java.time.Instant.now().toString() else JSONObject.NULL)
                .put("local_uri", localUri)
                .put("error_message", errorMessage.take(500).ifBlank { JSONObject.NULL })
            val request = Request.Builder()
                .url(endpoint)
                .addHeader("apikey", anonKey)
                .addHeader("Authorization", "Bearer $anonKey")
                .addHeader("Prefer", "return=minimal")
                .patch(payload.toString().toRequestBody(jsonMediaType))
                .build()
            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) Result.success(true)
                else Result.failure(Exception("Bulut aktarım durumu güncellenemedi (${response.code})"))
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

    private fun encodeQuery(value: String): String = URLEncoder.encode(value, "UTF-8").replace("+", "%20")

    private fun parseIsoTimestamp(value: String): Long {
        if (value.isBlank()) return System.currentTimeMillis()
        return runCatching { java.time.Instant.parse(value).toEpochMilli() }
            .getOrDefault(System.currentTimeMillis())
    }
}
