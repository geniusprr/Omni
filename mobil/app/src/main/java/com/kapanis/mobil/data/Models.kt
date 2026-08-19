package com.kapanis.mobil.data

enum class ConnectionMode {
    LOCAL,   // Yerel Ağ (Wi-Fi) - Güç Yönetimi, Alarmlar, Dosya/Fotoğraf, Defter, Anlık Bildirim
    ONLINE   // Çevrim İçi (Bulut / Supabase) - Dünyanın her yerinden uzaktan PC kontrolü
}

data class ServerStatus(
    val status: String = "",
    val deviceName: String = "",
    val version: String = "",
    val port: Int = 53317,
    val timerState: RemoteTimerState? = null,
    val alarms: List<AlarmItem> = emptyList()
)

data class LocalDeviceState(
    val status: String = "ok",
    val deviceName: String = "Windows PC",
    val version: String = "2.0",
    val port: Int = 53317,
    val timerState: RemoteTimerState? = null,
    val alarms: List<AlarmItem> = emptyList()
)

data class AlarmItem(
    val id: String = "",
    val timestamp: Long = 0L,
    val note: String = "",
    val soundEnabled: Boolean = true,
    val soundProfile: String = "chime",
    val intervalSeconds: Long? = null,
    val remainingOccurrences: Int? = null
)

data class NoteItem(
    val id: String = "",
    val content: String = "",
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis(),
    val pinned: Boolean = false
)

data class TransferItem(
    val id: String = "",
    val filename: String = "",
    val path: String = "",
    val size: Long = 0L,
    val mimeType: String = "",
    val createdAt: Long = System.currentTimeMillis(),
    val isImage: Boolean = false
)

data class ConnectionTarget(
    val host: String = "192.168.1.100",
    val port: Int = 53317,
    val deviceName: String = "Windows PC",
    val isConnected: Boolean = false,
    val wifiSsid: String = ""
)

data class PairedDeviceItem(
    val id: String = "",
    val name: String = "Windows PC",
    val host: String = "192.168.1.100",
    val port: Int = 53317,
    val mode: ConnectionMode = ConnectionMode.LOCAL,
    val wifiSsid: String = "",
    val pairingCode: String = "",
    val lastConnectedAt: Long = System.currentTimeMillis(),
    val isOnline: Boolean = false,
    val osInfo: String = "Windows 11"
)

data class OnlineDeviceState(
    val id: String = "",
    val name: String = "Masaüstü PC",
    val pairingCode: String = "",
    val isOnline: Boolean = false,
    val lastSeenAt: String = "",
    val timerState: RemoteTimerState? = null,
    val systemInfo: Map<String, Any>? = null
)

data class RemoteTimerState(
    val action: String = "shutdown",
    val targetAt: Long = 0L,
    val durationSeconds: Long = 0L
)
