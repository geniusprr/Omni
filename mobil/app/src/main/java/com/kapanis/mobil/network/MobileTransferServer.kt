package com.kapanis.mobil.network

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.app.NotificationCompat
import com.kapanis.mobil.MainActivity
import com.kapanis.mobil.data.PreferencesManager
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketException
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import kotlin.math.min

/**
 * Minimal LocalSend v2 receiver for the mobile companion.
 *
 * The desktop app already speaks this protocol. Keeping the mobile listener in
 * the foreground companion service makes the phone a real transfer target,
 * rather than a stale entry that the desktop cannot reach.
 */
class MobileTransferServer(
    private val context: Context,
    private val prefs: PreferencesManager
) {
    companion object {
        const val PORT = 53317
        private const val MAX_UPLOAD_BYTES = 512L * 1024L * 1024L
        private const val MAX_METADATA_BYTES = 512L * 1024L
        private const val SESSION_LIFETIME_MS = 2L * 60L * 1000L
        private const val TRANSFER_CHANNEL_ID = "kapanis_transfer_channel"
    }

    private data class IncomingFile(
        val id: String,
        val filename: String,
        val size: Long,
        val mimeType: String
    )

    private data class UploadSession(
        val files: Map<String, IncomingFile>,
        val tokens: Map<String, String>,
        val expiresAt: Long
    )

    private data class ParsedRequest(
        val method: String,
        val target: String,
        val headers: Map<String, String>,
        val contentLength: Long?
    )

    private val sessions = ConcurrentHashMap<String, UploadSession>()

    @Volatile
    private var running = false

    @Volatile
    private var httpServer: ServerSocket? = null

    @Volatile
    private var udpSocket: DatagramSocket? = null

    @Volatile
    private var executor: ExecutorService? = null

    private var multicastLock: WifiManager.MulticastLock? = null

    @Synchronized
    fun start(): Boolean {
        if (running) return true

        val server = try {
            ServerSocket().apply {
                reuseAddress = true
                bind(InetSocketAddress("0.0.0.0", PORT))
            }
        } catch (_: IOException) {
            return false
        }

        running = true
        httpServer = server
        acquireMulticastLock()
        val workerPool = Executors.newCachedThreadPool()
        executor = workerPool
        workerPool.execute { acceptConnections(server) }
        startDiscoveryResponder(workerPool)
        return true
    }

    @Synchronized
    fun stop() {
        running = false
        sessions.clear()
        runCatching { httpServer?.close() }
        runCatching { udpSocket?.close() }
        runCatching {
            if (multicastLock?.isHeld == true) multicastLock?.release()
        }
        httpServer = null
        udpSocket = null
        multicastLock = null
        executor?.shutdownNow()
        executor = null
    }

    fun isRunning(): Boolean = running

    /**
     * Saves a file downloaded by the cloud worker into the same Downloads/kapanis
     * location used by the local LocalSend receiver. The foreground service uses
     * this entry point while the Compose UI is not running.
     */
    fun saveDownloadedFile(source: File, filename: String, mimeType: String): Uri {
        val safeName = sanitizeFilename(filename)
        val size = source.length()
        if (size > MAX_UPLOAD_BYTES) throw IOException("Dosya boyutu desteklenmiyor.")
        val incoming = IncomingFile(
            id = UUID.randomUUID().toString(),
            filename = safeName,
            size = size,
            mimeType = mimeType.ifBlank { "application/octet-stream" }
        )
        source.inputStream().buffered().use { input ->
            val destination = saveIncomingFile(input, size, incoming)
            showReceivedFileNotification(incoming.filename, destination, incoming.mimeType)
            return destination
        }
    }

    private fun acceptConnections(server: ServerSocket) {
        while (running) {
            try {
                val socket = server.accept()
                socket.soTimeout = 30_000
                executor?.execute {
                    socket.use { handleConnection(it) }
                } ?: socket.close()
            } catch (_: SocketException) {
                if (!running) return
            } catch (_: IOException) {
                if (!running) return
            }
        }
    }

    private fun handleConnection(socket: Socket) {
        val input = BufferedInputStream(socket.getInputStream())
        val output = BufferedOutputStream(socket.getOutputStream())
        try {
            val request = readRequest(input) ?: return
            val path = request.target.substringBefore('?')

            when {
                request.method == "OPTIONS" -> writeResponse(output, 204, "No Content")
                request.method == "GET" && path == "/api/localsend/v2/info" ->
                    writeJson(output, 200, deviceInfo())
                request.method == "GET" && path == "/api/status" ->
                    writeJson(
                        output,
                        200,
                        JSONObject()
                            .put("status", "ok")
                            .put("authenticated", true)
                            .put("deviceName", prefs.controllerName)
                            .put("deviceId", prefs.controllerId)
                            .put("port", PORT)
                            .put("version", "2.0.0")
                    )
                request.method == "POST" && path == "/api/localsend/v2/register" -> {
                    consumeSmallBody(input, request.contentLength)
                    writeJson(output, 200, deviceInfo())
                }
                request.method == "POST" && path == "/api/localsend/v2/prepare-upload" ->
                    prepareUpload(input, output, request.contentLength)
                request.method == "POST" && path == "/api/localsend/v2/upload" ->
                    receiveUpload(input, output, request)
                else -> writeJson(output, 404, JSONObject().put("error", "Endpoint bulunamadı."))
            }
        } catch (error: Throwable) {
            runCatching {
                writeJson(
                    output,
                    500,
                    JSONObject().put("error", error.message ?: "Aktarım işlenemedi.")
                )
            }
        } finally {
            runCatching { output.flush() }
        }
    }

    private fun prepareUpload(input: InputStream, output: OutputStream, contentLength: Long?) {
        val payload = readJsonBody(input, contentLength)
            ?: return writeJson(output, 400, JSONObject().put("error", "Geçersiz aktarım bilgisi."))
        val filesJson = payload.optJSONObject("files")
            ?: return writeJson(output, 400, JSONObject().put("error", "Dosya bilgisi bulunamadı."))

        pruneExpiredSessions()
        if (filesJson.length() == 0 || filesJson.length() > 20) {
            return writeJson(output, 400, JSONObject().put("error", "Geçersiz dosya sayısı."))
        }

        val files = linkedMapOf<String, IncomingFile>()
        val tokens = linkedMapOf<String, String>()
        val keys = filesJson.keys()
        while (keys.hasNext()) {
            val fileId = keys.next().trim()
            val value = filesJson.optJSONObject(fileId)
                ?: return writeJson(output, 400, JSONObject().put("error", "Geçersiz dosya kaydı."))
            val size = value.optLong("size", -1L)
            if (fileId.isBlank() || size < 0L || size > MAX_UPLOAD_BYTES) {
                return writeJson(output, 400, JSONObject().put("error", "Dosya boyutu desteklenmiyor."))
            }

            val filename = sanitizeFilename(value.optString("fileName", "dosya"))
            val mimeType = value.optString("fileType", "application/octet-stream")
                .ifBlank { "application/octet-stream" }
            files[fileId] = IncomingFile(fileId, filename, size, mimeType)
            tokens[fileId] = UUID.randomUUID().toString()
        }

        val sessionId = UUID.randomUUID().toString()
        sessions[sessionId] = UploadSession(
            files = files,
            tokens = tokens,
            expiresAt = System.currentTimeMillis() + SESSION_LIFETIME_MS
        )
        val responseTokens = JSONObject()
        tokens.forEach { (id, token) -> responseTokens.put(id, token) }
        writeJson(
            output,
            200,
            JSONObject()
                .put("sessionId", sessionId)
                .put("files", responseTokens)
        )
    }

    private fun receiveUpload(input: InputStream, output: OutputStream, request: ParsedRequest) {
        val sessionId = queryValue(request.target, "sessionId")
        val fileId = queryValue(request.target, "fileId")
        val token = queryValue(request.target, "token")
        val session = sessions[sessionId]
        val file = session?.files?.get(fileId)
        val expectedToken = session?.tokens?.get(fileId)

        if (session == null || file == null || token != expectedToken || session.expiresAt < System.currentTimeMillis()) {
            sessions.remove(sessionId)
            return writeJson(output, 403, JSONObject().put("error", "Aktarım oturumu geçersiz."))
        }

        val contentLength = request.contentLength
        if (contentLength == null) {
            return writeJson(output, 411, JSONObject().put("error", "Dosya boyutu belirtilmedi."))
        }
        if (contentLength != file.size || contentLength > MAX_UPLOAD_BYTES) {
            return writeJson(output, 400, JSONObject().put("error", "Dosya boyutu doğrulanamadı."))
        }

        try {
            val destination = saveIncomingFile(input, contentLength, file)
            sessions.remove(sessionId)
            showReceivedFileNotification(file.filename, destination, file.mimeType)
            writeJson(
                output,
                200,
                JSONObject()
                    .put("status", "ok")
                    .put("filename", file.filename)
                    .put("size", contentLength)
                    .put("uri", destination.toString())
            )
        } catch (error: Throwable) {
            sessions.remove(sessionId)
            writeJson(output, 500, JSONObject().put("error", error.message ?: "Dosya kaydedilemedi."))
        }
    }

    private fun saveIncomingFile(input: InputStream, contentLength: Long, file: IncomingFile): Uri {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, file.filename)
                put(MediaStore.Downloads.MIME_TYPE, file.mimeType)
                put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + File.separator + "kapanis")
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val resolver = context.contentResolver
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: throw IOException("İndirilenler klasörü açılamadı.")
            try {
                resolver.openOutputStream(uri)?.use { output ->
                    copyExactly(input, output, contentLength)
                } ?: throw IOException("Dosya yazılamadı.")
                values.clear()
                values.put(MediaStore.Downloads.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
                return uri
            } catch (error: Throwable) {
                resolver.delete(uri, null, null)
                throw error
            }
        }

        val directory = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
            ?: context.filesDir
        if (!directory.exists() && !directory.mkdirs()) {
            throw IOException("İndirilenler klasörü oluşturulamadı.")
        }
        val target = nextAvailableFile(directory, file.filename)
        FileOutputStream(target).use { output ->
            copyExactly(input, output, contentLength)
        }
        return Uri.fromFile(target)
    }

    private fun copyExactly(input: InputStream, output: OutputStream, contentLength: Long) {
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        var remaining = contentLength
        while (remaining > 0L) {
            val count = input.read(buffer, 0, min(buffer.size.toLong(), remaining).toInt())
            if (count < 0) throw IOException("Dosya aktarımı yarıda kesildi.")
            output.write(buffer, 0, count)
            remaining -= count.toLong()
        }
        output.flush()
    }

    private fun startDiscoveryResponder(workerPool: ExecutorService) {
        val socket = try {
            DatagramSocket(null).apply {
                reuseAddress = true
                broadcast = true
                bind(InetSocketAddress("0.0.0.0", PORT))
            }
        } catch (_: IOException) {
            return
        }
        udpSocket = socket
        workerPool.execute {
            val buffer = ByteArray(4 * 1024)
            while (running) {
                try {
                    val packet = DatagramPacket(buffer, buffer.size)
                    socket.receive(packet)
                    val payload = JSONObject(String(packet.data, packet.offset, packet.length, StandardCharsets.UTF_8))
                    val type = payload.optString("type")
                    if (type != "kapanis-localsend-discovery" && type != "kapanis-discovery-probe") continue

                    val response = JSONObject()
                        .put("type", "kapanis-localsend-discovery-response")
                        .put("device", deviceInfo())
                        .put("port", PORT)
                    val bytes = response.toString().toByteArray(StandardCharsets.UTF_8)
                    socket.send(DatagramPacket(bytes, bytes.size, packet.address, packet.port))
                } catch (_: SocketException) {
                    if (!running) return@execute
                } catch (_: Throwable) {
                    if (!running) return@execute
                }
            }
        }
    }

    private fun acquireMulticastLock() {
        runCatching {
            val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            multicastLock = wifiManager
                ?.createMulticastLock("kapanis-transfer-discovery")
                ?.apply {
                    setReferenceCounted(false)
                    acquire()
                }
        }
    }

    private fun deviceInfo(): JSONObject {
        val model = listOf(Build.MANUFACTURER, Build.MODEL)
            .filter { it.isNotBlank() }
            .joinToString(" ")
            .ifBlank { "Android" }
        return JSONObject()
            .put("alias", prefs.controllerName)
            .put("version", "2.0.0")
            .put("deviceModel", model)
            .put("deviceType", "mobile")
            .put("fingerprint", prefs.controllerId)
            .put("protocol", "http")
            .put("download", true)
            .put("port", PORT)
    }

    private fun showReceivedFileNotification(filename: String, uri: Uri, mimeType: String) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(
                    TRANSFER_CHANNEL_ID,
                    "kapanış. Dosya Aktarımları",
                    NotificationManager.IMPORTANCE_DEFAULT
                )
            )
        }

        val openIntent = if (uri.scheme == "content") {
            Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, mimeType)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        } else {
            Intent(context, MainActivity::class.java)
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            (System.currentTimeMillis() % Int.MAX_VALUE).toInt(),
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(context, TRANSFER_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle("Dosya alındı")
            .setContentText(filename)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()
        manager.notify((System.currentTimeMillis() % Int.MAX_VALUE).toInt(), notification)
    }

    private fun readRequest(input: BufferedInputStream): ParsedRequest? {
        val requestLine = readLine(input) ?: return null
        val parts = requestLine.trim().split(Regex("\\s+"), limit = 3)
        if (parts.size < 2) return null
        val headers = linkedMapOf<String, String>()
        while (true) {
            val line = readLine(input) ?: return null
            if (line.isEmpty()) break
            val colon = line.indexOf(':')
            if (colon > 0) {
                headers[line.substring(0, colon).trim().lowercase()] = line.substring(colon + 1).trim()
            }
        }
        val contentLength = headers["content-length"]?.toLongOrNull()
        return ParsedRequest(parts[0].uppercase(), parts[1], headers, contentLength)
    }

    private fun readLine(input: InputStream): String? {
        val bytes = ArrayList<Byte>(128)
        while (bytes.size <= 16 * 1024) {
            val value = input.read()
            if (value < 0) return if (bytes.isEmpty()) null else String(bytes.toByteArray(), StandardCharsets.UTF_8)
            if (value == '\n'.code) {
                if (bytes.lastOrNull() == '\r'.code.toByte()) bytes.removeAt(bytes.lastIndex)
                return String(bytes.toByteArray(), StandardCharsets.UTF_8)
            }
            bytes.add(value.toByte())
        }
        throw IOException("HTTP başlığı çok büyük.")
    }

    private fun readJsonBody(input: InputStream, contentLength: Long?): JSONObject? {
        if (contentLength == null || contentLength < 0L || contentLength > MAX_METADATA_BYTES) return null
        val body = ByteArray(contentLength.toInt())
        readFully(input, body)
        return try {
            JSONObject(String(body, StandardCharsets.UTF_8))
        } catch (_: Throwable) {
            null
        }
    }

    private fun consumeSmallBody(input: InputStream, contentLength: Long?) {
        if (contentLength == null || contentLength <= 0L || contentLength > MAX_METADATA_BYTES) return
        val body = ByteArray(contentLength.toInt())
        readFully(input, body)
    }

    private fun readFully(input: InputStream, destination: ByteArray) {
        var offset = 0
        while (offset < destination.size) {
            val count = input.read(destination, offset, destination.size - offset)
            if (count < 0) throw IOException("İstek yarıda kesildi.")
            offset += count
        }
    }

    private fun queryValue(target: String, key: String): String {
        val query = target.substringAfter('?', "")
        if (query.isEmpty()) return ""
        return query.split('&')
            .firstOrNull { it.substringBefore('=') == key }
            ?.substringAfter('=', "")
            ?.let { URLDecoder.decode(it, StandardCharsets.UTF_8.name()) }
            .orEmpty()
    }

    private fun writeJson(output: OutputStream, status: Int, payload: JSONObject) {
        writeResponse(output, status, statusMessage(status), "application/json; charset=utf-8", payload.toString().toByteArray(StandardCharsets.UTF_8))
    }

    private fun writeResponse(
        output: OutputStream,
        status: Int,
        message: String,
        contentType: String = "text/plain; charset=utf-8",
        body: ByteArray = ByteArray(0)
    ) {
        val headers = buildString {
            append("HTTP/1.1 ").append(status).append(' ').append(message).append("\r\n")
            append("Content-Type: ").append(contentType).append("\r\n")
            append("Content-Length: ").append(body.size).append("\r\n")
            append("Connection: close\r\n")
            append("Access-Control-Allow-Origin: *\r\n")
            append("Access-Control-Allow-Headers: Content-Type\r\n")
            append("\r\n")
        }
        output.write(headers.toByteArray(StandardCharsets.UTF_8))
        if (body.isNotEmpty()) output.write(body)
        output.flush()
    }

    private fun statusMessage(status: Int): String = when (status) {
        200 -> "OK"
        204 -> "No Content"
        400 -> "Bad Request"
        403 -> "Forbidden"
        404 -> "Not Found"
        411 -> "Length Required"
        else -> "Internal Server Error"
    }

    private fun pruneExpiredSessions() {
        val now = System.currentTimeMillis()
        sessions.entries.removeIf { it.value.expiresAt < now }
    }

    private fun sanitizeFilename(value: String): String {
        val blocked = setOf('<', '>', ':', '"', '/', '\\', '|', '?', '*')
        val sanitized = value.map { character ->
            if (character.code < 32 || blocked.contains(character)) '_' else character
        }.joinToString("")
            .trim()
            .trim('.', ' ')
            .take(180)
        return sanitized.ifBlank { "dosya-" + System.currentTimeMillis() }
    }

    private fun nextAvailableFile(directory: File, filename: String): File {
        val extensionIndex = filename.lastIndexOf('.')
        val stem = if (extensionIndex > 0) filename.substring(0, extensionIndex) else filename
        val extension = if (extensionIndex > 0) filename.substring(extensionIndex) else ""
        var candidate = File(directory, filename)
        var counter = 1
        while (candidate.exists()) {
            candidate = File(directory, stem + "_" + counter + extension)
            counter += 1
        }
        return candidate
    }
}
