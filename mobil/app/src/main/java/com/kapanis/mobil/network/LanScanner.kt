package com.kapanis.mobil.network

import android.content.Context
import android.net.wifi.WifiManager
import com.kapanis.mobil.data.ServerStatus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.Inet4Address
import java.net.InetAddress
import java.net.NetworkInterface
import java.net.SocketTimeoutException
import java.nio.charset.StandardCharsets

class LanScanner(private val apiClient: KapanisApiClient) {

    suspend fun scanSubnet(
        context: Context,
        port: Int = 53317,
        onProgress: (current: Int, total: Int) -> Unit = { _, _ -> }
    ): List<Pair<String, ServerStatus>> = withContext(Dispatchers.IO) {
        val subnet = getSubnet(context) ?: return@withContext emptyList()
        val discoveredByBroadcast = discoverViaUdp(subnet, port)
        if (discoveredByBroadcast.isNotEmpty()) {
            return@withContext discoveredByBroadcast
        }
        val ports = if (port == 53317) listOf(53317, 54321) else listOf(port, 53317, 54321).distinct()

        val jobs = (1..254).map { i ->
            val host = "$subnet.$i"
            async {
                for (p in ports) {
                    val pingResult = apiClient.ping(host, p, useFastTimeout = true)
                    if (pingResult.isSuccess) {
                        val status = pingResult.getOrNull()
                        if (status != null) {
                            return@async Pair(host, status)
                        }
                    }
                }
                null
            }
        }

        jobs.awaitAll().filterNotNull()
    }

    /**
     * Broadcast discovery is both faster and more reliable than opening
     * hundreds of TCP probes on recent Android versions. The TCP sweep below
     * remains as a fallback for routers that block UDP broadcasts.
     */
    private fun discoverViaUdp(subnet: String, port: Int): List<Pair<String, ServerStatus>> {
        val socket = try {
            DatagramSocket().apply {
                broadcast = true
                soTimeout = 160
            }
        } catch (_: Exception) {
            return emptyList()
        }

        socket.use {
            val payload = JSONObject()
                .put("type", "kapanis-discovery-probe")
                .put("version", "2.0.0")
                .toString()
                .toByteArray(StandardCharsets.UTF_8)
            val destinations = listOf("255.255.255.255", "$subnet.255").distinct()
            destinations.forEach { address ->
                try {
                    socket.send(DatagramPacket(payload, payload.size, InetAddress.getByName(address), port))
                } catch (_: Exception) {
                    // Try the remaining broadcast address.
                }
            }

            val found = linkedMapOf<String, ServerStatus>()
            val deadline = System.currentTimeMillis() + 1_000L
            val buffer = ByteArray(4 * 1024)
            while (System.currentTimeMillis() < deadline) {
                try {
                    val packet = DatagramPacket(buffer, buffer.size)
                    socket.receive(packet)
                    val response = JSONObject(String(packet.data, packet.offset, packet.length, StandardCharsets.UTF_8))
                    val responseType = response.optString("type")
                    if (responseType != "kapanis-discovery-response" && responseType != "kapanis-localsend-discovery-response") continue

                    val device = response.optJSONObject("device") ?: response
                    if (device.optString("deviceType").equals("mobile", ignoreCase = true)) continue
                    val host = packet.address.hostAddress ?: continue
                    val deviceName = response.optString("deviceName")
                        .ifBlank { device.optString("alias", "Windows PC") }
                    val deviceId = response.optString("deviceId")
                        .ifBlank { device.optString("fingerprint", "") }
                    val responsePort = device.optInt("port", response.optInt("port", port))
                    found[host] = ServerStatus(
                        status = "ok",
                        deviceName = deviceName,
                        deviceId = deviceId,
                        pairingCode = response.optString("pairingCode", ""),
                        version = response.optString("version", device.optString("version", "2.0.0")),
                        port = responsePort
                    )
                } catch (_: SocketTimeoutException) {
                    // Keep listening until the discovery window closes.
                } catch (_: Exception) {
                    // Ignore malformed or unrelated UDP packets.
                }
            }
            return found.map { Pair(it.key, it.value) }
        }
    }

    suspend fun findDeviceInSubnet(
        context: Context,
        targetDeviceId: String = "",
        pairingCode: String = "",
        preferredIps: List<String> = emptyList(),
        port: Int = 53317,
        token: String? = null
    ): Pair<String, ServerStatus>? = withContext(Dispatchers.IO) {
        // Step 1: Probe preferred candidate IPs first (instant check < 600ms)
        for (candidate in preferredIps.filter { it.isNotBlank() && it != "127.0.0.1" && it != "localhost" }) {
            val res = apiClient.ping(candidate, port, token, useFastTimeout = true)
            if (res.isSuccess) {
                val status = res.getOrNull()
                if (status != null) {
                    if (targetDeviceId.isEmpty() || status.deviceId == targetDeviceId || status.deviceId.isEmpty()) {
                        return@withContext Pair(candidate, status)
                    }
                }
            }
        }

        // Step 2: Fast Parallel scan on the current subnet
        val discovered = scanSubnet(context, port)
        if (discovered.isEmpty()) return@withContext null

        // Match by device ID
        if (targetDeviceId.isNotEmpty()) {
            val byId = discovered.firstOrNull { it.second.deviceId == targetDeviceId }
            if (byId != null) return@withContext byId
        }

        // Match by pairing code
        if (pairingCode.isNotEmpty()) {
            val cleanCode = pairingCode.uppercase().removePrefix("KAP-")
            val byCode = discovered.firstOrNull {
                it.second.pairingCode.uppercase().removePrefix("KAP-") == cleanCode
            }
            if (byCode != null) return@withContext byCode
        }

        // If only 1 PC found on the subnet, return it
        if (discovered.size == 1) {
            return@withContext discovered.first()
        }

        return@withContext discovered.firstOrNull()
    }

    private fun getSubnet(context: Context): String? {
        // 1. Try modern NetworkInterface scan (works reliably on Android 10, 11, 12, 13, 14, 15 without Location permission)
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val iface = interfaces.nextElement()
                if (iface.isLoopback || !iface.isUp) continue
                val addresses = iface.inetAddresses
                while (addresses.hasMoreElements()) {
                    val addr = addresses.nextElement()
                    if (addr is Inet4Address && !addr.isLoopbackAddress && !addr.isLinkLocalAddress) {
                        val hostAddr = addr.hostAddress ?: continue
                        val parts = hostAddr.split(".")
                        if (parts.size == 4 && parts[0] != "127" && parts[0] != "169") {
                            return "${parts[0]}.${parts[1]}.${parts[2]}"
                        }
                    }
                }
            }
        } catch (e: Exception) {
            // fallback to WifiManager
        }

        // 2. Fallback to WifiManager
        try {
            val wifiManager =
                context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
                    ?: return null
            val ip = wifiManager.connectionInfo.ipAddress
            if (ip == 0) return null
            return String.format(
                "%d.%d.%d",
                ip and 0xff,
                ip shr 8 and 0xff,
                ip shr 16 and 0xff
            )
        } catch (e: Exception) {
            return null
        }
    }
}
