package com.kapanis.mobil.data

enum class ConnectionMode {
    LOCAL,   // Yerel Ağ (Wi-Fi) - Dosya, Fotoğraf, Defter, Anlık Bildirim
    ONLINE   // Çevrim İçi (Bulut / Supabase) - Dünyanın her yerinden uzaktan PC kontrolü
}

data class ServerStatus(
    val status: String = "",
    val deviceName: String = "",
    val version: String = "",
    val port: Int = 54321
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
    val port: Int = 54321,
    val deviceName: String = "Windows PC",
    val isConnected: Boolean = false
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
