package com.kapanis.mobil.network

import android.content.Context
import android.net.wifi.WifiManager
import com.kapanis.mobil.data.ServerStatus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.withContext
import java.net.Inet4Address
import java.net.NetworkInterface

class LanScanner(private val apiClient: KapanisApiClient) {

    suspend fun scanSubnet(
        context: Context,
        port: Int = 53317,
        onProgress: (current: Int, total: Int) -> Unit = { _, _ -> }
    ): List<Pair<String, ServerStatus>> = withContext(Dispatchers.IO) {
        val subnet = getSubnet(context) ?: return@withContext emptyList()
        val ports = if (port == 53317) listOf(53317, 54321) else listOf(port, 53317, 54321).distinct()

        val jobs = (1..254).map { i ->
            val host = "$subnet.$i"
            async {
                for (p in ports) {
                    val pingResult = apiClient.ping(host, p)
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

