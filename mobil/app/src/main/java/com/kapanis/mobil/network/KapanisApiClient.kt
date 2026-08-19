package com.kapanis.mobil.network

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import com.kapanis.mobil.data.AlarmItem
import com.kapanis.mobil.data.LocalDeviceState
import com.kapanis.mobil.data.NoteItem
import com.kapanis.mobil.data.RemoteTimerState
import com.kapanis.mobil.data.ServerStatus
import com.kapanis.mobil.data.TransferItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okio.BufferedSink
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

class KapanisApiClient {

    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(4, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    suspend fun ping(host: String, port: Int): Result<ServerStatus> = withContext(Dispatchers.IO) {
        // 1. Try /api/status or /api/local/state
        try {
            val url = "http://$host:$port/api/status"
            val request = Request.Builder().url(url).get().build()
            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    val body = response.body?.string().orEmpty()
                    val json = JSONObject(body)
                    val timerJson = json.optJSONObject("timerState")
                    val timerState = if (timerJson != null) {
                        RemoteTimerState(
                            action = timerJson.optString("action", "shutdown"),
                            targetAt = timerJson.optLong("targetAt", 0L),
                            durationSeconds = timerJson.optLong("durationSeconds", 0L)
                        )
                    } else null

                    val alarmsArray = json.optJSONArray("alarms")
                    val alarmsList = parseAlarmsArray(alarmsArray)

                    val status = ServerStatus(
                        status = json.optString("status", "ok"),
                        deviceName = json.optString("deviceName", "Windows PC"),
                        version = json.optString("version", "2.0.0"),
                        port = json.optInt("port", port),
                        timerState = timerState,
                        alarms = alarmsList
                    )
                    return@withContext Result.success(status)
                }
            }
        } catch (e: Exception) {
            // fallback
        }

        // 2. Try /api/localsend/v2/info
        try {
            val url = "http://$host:$port/api/localsend/v2/info"
            val request = Request.Builder().url(url).get().build()
            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    val body = response.body?.string().orEmpty()
                    val json = JSONObject(body)
                    val status = ServerStatus(
                        status = "ok",
                        deviceName = json.optString("alias", "kapanış. PC"),
                        version = json.optString("version", "2.0"),
                        port = json.optInt("port", port)
                    )
                    return@withContext Result.success(status)
                }
            }
        } catch (e: Exception) {
            // fallback
        }

        Result.failure(Exception("Sunucuya ulaşılamadı ($host:$port)"))
    }

    suspend fun registerDevice(
        host: String,
        port: Int,
        alias: String,
        model: String,
        wifiName: String = ""
    ): Result<LocalDeviceState> = withContext(Dispatchers.IO) {
        try {
            val url = "http://$host:$port/api/register"
            val json = JSONObject().apply {
                put("alias", alias)
                put("deviceModel", model)
                put("deviceType", "mobile")
                put("port", 53317)
                put("wifiName", wifiName)
                put("fingerprint", "android-${System.currentTimeMillis() % 100000}")
                put("protocol", "http")
            }
            val body = json.toString().toRequestBody(jsonMediaType)
            val request = Request.Builder().url(url).post(body).build()
            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    val respBody = response.body?.string().orEmpty()
                    val respJson = JSONObject(respBody)
                    val timerJson = respJson.optJSONObject("timerState")
                    val timerState = if (timerJson != null) {
                        RemoteTimerState(
                            action = timerJson.optString("action", "shutdown"),
                            targetAt = timerJson.optLong("targetAt", 0L),
                            durationSeconds = timerJson.optLong("durationSeconds", 0L)
                        )
                    } else null
                    val alarms = parseAlarmsArray(respJson.optJSONArray("alarms"))
                    val state = LocalDeviceState(
                        status = "ok",
                        deviceName = respJson.optString("deviceName", "Windows PC"),
                        version = respJson.optString("version", "2.0.0"),
                        port = respJson.optInt("port", port),
                        timerState = timerState,
                        alarms = alarms
                    )
                    Result.success(state)
                } else {
                    Result.failure(Exception("Kayıt başarısız (${response.code})"))
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun fetchLocalState(host: String, port: Int): Result<LocalDeviceState> = withContext(Dispatchers.IO) {
        try {
            val url = "http://$host:$port/api/status"
            val request = Request.Builder().url(url).get().build()
            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    val body = response.body?.string().orEmpty()
                    val json = JSONObject(body)
                    val timerJson = json.optJSONObject("timerState")
                    val timerState = if (timerJson != null) {
                        RemoteTimerState(
                            action = timerJson.optString("action", "shutdown"),
                            targetAt = timerJson.optLong("targetAt", 0L),
                            durationSeconds = timerJson.optLong("durationSeconds", 0L)
                        )
                    } else null

                    val alarms = parseAlarmsArray(json.optJSONArray("alarms"))

                    val state = LocalDeviceState(
                        status = "ok",
                        deviceName = json.optString("deviceName", "Windows PC"),
                        version = json.optString("version", "2.0.0"),
                        port = json.optInt("port", port),
                        timerState = timerState,
                        alarms = alarms
                    )
                    Result.success(state)
                } else {
                    Result.failure(Exception("Durum alınamadı (${response.code})"))
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun sendCommand(
        host: String,
        port: Int,
        command: String,
        delaySeconds: Long
    ): Result<RemoteTimerState?> = withContext(Dispatchers.IO) {
        try {
            val url = "http://$host:$port/api/command"
            val json = JSONObject().apply {
                put("command", command)
                put("delay_seconds", delaySeconds)
            }
            val body = json.toString().toRequestBody(jsonMediaType)
            val request = Request.Builder().url(url).post(body).build()
            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    val respBody = response.body?.string().orEmpty()
                    val respJson = JSONObject(respBody)
                    val timerJson = respJson.optJSONObject("timerState")
                    val timerState = if (timerJson != null) {
                        RemoteTimerState(
                            action = timerJson.optString("action", "shutdown"),
                            targetAt = timerJson.optLong("targetAt", 0L),
                            durationSeconds = timerJson.optLong("durationSeconds", 0L)
                        )
                    } else null
                    Result.success(timerState)
                } else {
                    Result.failure(Exception("Komut gönderilemedi (${response.code})"))
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun createAlarm(
        host: String,
        port: Int,
        timestamp: Long,
        note: String,
        soundEnabled: Boolean = true,
        soundProfile: String = "chime"
    ): Result<AlarmItem> = withContext(Dispatchers.IO) {
        try {
            val url = "http://$host:$port/api/alarms/create"
            val json = JSONObject().apply {
                put("timestamp", timestamp)
                put("note", note)
                put("soundEnabled", soundEnabled)
                put("soundProfile", soundProfile)
            }
            val body = json.toString().toRequestBody(jsonMediaType)
            val request = Request.Builder().url(url).post(body).build()
            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    val respBody = response.body?.string().orEmpty()
                    val respJson = JSONObject(respBody)
                    val alarmJson = respJson.optJSONObject("alarm")
                    val alarm = if (alarmJson != null) {
                        parseAlarmObject(alarmJson)
                    } else {
                        AlarmItem(
                            id = System.currentTimeMillis().toString(),
                            timestamp = timestamp,
                            note = note,
                            soundEnabled = soundEnabled,
                            soundProfile = soundProfile
                        )
                    }
                    Result.success(alarm)
                } else {
                    Result.failure(Exception("Alarm oluşturulamadı (${response.code})"))
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun cancelAlarm(
        host: String,
        port: Int,
        id: String
    ): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            val url = "http://$host:$port/api/alarms/cancel"
            val json = JSONObject().apply {
                put("id", id)
            }
            val body = json.toString().toRequestBody(jsonMediaType)
            val request = Request.Builder().url(url).post(body).build()
            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) Result.success(true)
                else Result.failure(Exception("Alarm iptal edilemedi (${response.code})"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun fetchAlarms(
        host: String,
        port: Int
    ): Result<List<AlarmItem>> = withContext(Dispatchers.IO) {
        try {
            val url = "http://$host:$port/api/alarms"
            val request = Request.Builder().url(url).get().build()
            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    val respBody = response.body?.string().orEmpty()
                    val array = JSONArray(respBody)
                    Result.success(parseAlarmsArray(array))
                } else {
                    Result.failure(Exception("Alarmlar alınamadı (${response.code})"))
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun sendNotification(
        host: String,
        port: Int,
        title: String,
        message: String,
        urgent: Boolean = false
    ): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            val url = "http://$host:$port/api/notify"
            val json = JSONObject().apply {
                put("title", title)
                put("message", message)
                put("urgent", urgent)
            }
            val body = json.toString().toRequestBody(jsonMediaType)
            val request = Request.Builder().url(url).post(body).build()
            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) Result.success(true)
                else Result.failure(Exception("Bildirim gönderilemedi (${response.code})"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun sendNote(
        host: String,
        port: Int,
        content: String
    ): Result<NoteItem> = withContext(Dispatchers.IO) {
        try {
            val url = "http://$host:$port/api/note"
            val json = JSONObject().apply {
                put("content", content)
            }
            val body = json.toString().toRequestBody(jsonMediaType)
            val request = Request.Builder().url(url).post(body).build()
            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    val respBody = response.body?.string().orEmpty()
                    val obj = JSONObject(respBody)
                    val note = NoteItem(
                        id = obj.optString("id", ""),
                        content = obj.optString("content", content),
                        createdAt = obj.optLong("createdAt", System.currentTimeMillis()),
                        updatedAt = obj.optLong("updatedAt", System.currentTimeMillis()),
                        pinned = obj.optBoolean("pinned", false)
                    )
                    Result.success(note)
                } else {
                    Result.failure(Exception("Not gönderilemedi (${response.code})"))
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun fetchNotes(
        host: String,
        port: Int
    ): Result<List<NoteItem>> = withContext(Dispatchers.IO) {
        try {
            val url = "http://$host:$port/api/notes"
            val request = Request.Builder().url(url).get().build()
            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    val respBody = response.body?.string().orEmpty()
                    val array = JSONArray(respBody)
                    val list = mutableListOf<NoteItem>()
                    for (i in 0 until array.length()) {
                        val obj = array.getJSONObject(i)
                        list.add(
                            NoteItem(
                                id = obj.optString("id", ""),
                                content = obj.optString("content", ""),
                                createdAt = obj.optLong("createdAt", 0L),
                                updatedAt = obj.optLong("updatedAt", 0L),
                                pinned = obj.optBoolean("pinned", false)
                            )
                        )
                    }
                    Result.success(list)
                } else {
                    Result.failure(Exception("Notlar alınamadı (${response.code})"))
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun sendClipboard(
        host: String,
        port: Int,
        text: String
    ): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            val url = "http://$host:$port/api/clipboard"
            val json = JSONObject().apply {
                put("text", text)
            }
            val body = json.toString().toRequestBody(jsonMediaType)
            val request = Request.Builder().url(url).post(body).build()
            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) Result.success(true)
                else Result.failure(Exception("Pano aktarılamadı (${response.code})"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun uploadFile(
        context: Context,
        host: String,
        port: Int,
        uri: Uri,
        onProgress: (Float) -> Unit = {}
    ): Result<TransferItem> = withContext(Dispatchers.IO) {
        try {
            val contentResolver = context.contentResolver
            val (filename, size) = getFileMetadata(context, uri)
            val mimeType = contentResolver.getType(uri) ?: "application/octet-stream"

            val inputStream = contentResolver.openInputStream(uri)
                ?: return@withContext Result.failure(Exception("Dosya açılamadı"))

            val requestBody = object : RequestBody() {
                override fun contentType() = mimeType.toMediaType()
                override fun contentLength() = size

                override fun writeTo(sink: BufferedSink) {
                    val buffer = ByteArray(32768)
                    var uploaded = 0L
                    inputStream.use { input ->
                        var read: Int
                        while (input.read(buffer).also { read = it } != -1) {
                            sink.write(buffer, 0, read)
                            uploaded += read
                            if (size > 0) {
                                onProgress(uploaded.toFloat() / size.toFloat())
                            }
                        }
                    }
                }
            }

            val encodedFilename = URLEncoder.encode(filename, "UTF-8")
            val url = "http://$host:$port/api/upload"
            val request = Request.Builder()
                .url(url)
                .addHeader("x-filename", encodedFilename)
                .addHeader("Content-Type", mimeType)
                .post(requestBody)
                .build()

            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    val respBody = response.body?.string().orEmpty()
                    val obj = JSONObject(respBody)
                    val transfer = TransferItem(
                        id = obj.optString("id", ""),
                        filename = obj.optString("filename", filename),
                        path = obj.optString("path", ""),
                        size = obj.optLong("size", size),
                        mimeType = obj.optString("mimeType", mimeType),
                        createdAt = obj.optLong("createdAt", System.currentTimeMillis()),
                        isImage = obj.optBoolean("isImage", mimeType.startsWith("image/"))
                    )
                    Result.success(transfer)
                } else {
                    Result.failure(Exception("Aktarım başarısız (${response.code})"))
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun parseAlarmsArray(array: JSONArray?): List<AlarmItem> {
        if (array == null) return emptyList()
        val list = mutableListOf<AlarmItem>()
        for (i in 0 until array.length()) {
            val obj = array.optJSONObject(i) ?: continue
            list.add(parseAlarmObject(obj))
        }
        return list.sortedBy { it.timestamp }
    }

    private fun parseAlarmObject(obj: JSONObject): AlarmItem {
        return AlarmItem(
            id = obj.optString("id", ""),
            timestamp = obj.optLong("timestamp", 0L),
            note = obj.optString("note", ""),
            soundEnabled = obj.optBoolean("soundEnabled", true),
            soundProfile = obj.optString("soundProfile", "chime"),
            intervalSeconds = if (obj.has("intervalSeconds") && !obj.isNull("intervalSeconds")) obj.optLong("intervalSeconds") else null,
            remainingOccurrences = if (obj.has("remainingOccurrences") && !obj.isNull("remainingOccurrences")) obj.optInt("remainingOccurrences") else null
        )
    }

    private fun getFileMetadata(context: Context, uri: Uri): Pair<String, Long> {
        var name = "dosya_${System.currentTimeMillis()}.dat"
        var size = -1L
        try {
            context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                if (cursor.moveToFirst()) {
                    if (nameIndex != -1) name = cursor.getString(nameIndex)
                    if (sizeIndex != -1) size = cursor.getLong(sizeIndex)
                }
            }
        } catch (e: Exception) {
            // ignore
        }
        return Pair(name, size)
    }
}

