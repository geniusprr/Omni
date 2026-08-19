package com.kapanis.mobil.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import java.net.Inet4Address
import java.net.NetworkInterface

object NetworkUtils {

    fun getCurrentWifiName(context: Context): String {
        try {
            val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            if (wifiManager != null && wifiManager.isWifiEnabled) {
                val wifiInfo: WifiInfo? = wifiManager.connectionInfo
                val ssid = wifiInfo?.ssid?.trim('"', ' ')
                if (!ssid.isNullOrEmpty() && ssid != "<unknown ssid>" && ssid != "0x") {
                    return ssid
                }
            }
        } catch (e: Exception) {
            // ignore
        }

        // Fallback: Check ConnectivityManager
        try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            val network = cm?.activeNetwork
            val capabilities = cm?.getNetworkCapabilities(network)
            if (capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true) {
                val ip = getLocalIpAddress()
                if (ip.isNotEmpty()) {
                    val parts = ip.split(".")
                    if (parts.size == 4) {
                        return "Wi-Fi (${parts[0]}.${parts[1]}.${parts[2]}.x)"
                    }
                }
                return "Yerel Wi-Fi Ağı"
            }
        } catch (e: Exception) {
            // ignore
        }

        return "Wi-Fi (Bilinmiyor)"
    }

    fun getLocalIpAddress(): String {
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
                        if (!hostAddr.startsWith("127.") && !hostAddr.startsWith("169.")) {
                            return hostAddr
                        }
                    }
                }
            }
        } catch (e: Exception) {
            // ignore
        }
        return ""
    }
}
