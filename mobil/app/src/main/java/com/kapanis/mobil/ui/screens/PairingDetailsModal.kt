package com.kapanis.mobil.ui.screens

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Cloud
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Devices
import androidx.compose.material.icons.rounded.Laptop
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Wifi
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kapanis.mobil.data.ConnectionMode
import com.kapanis.mobil.data.ConnectionTarget
import com.kapanis.mobil.data.PairedDeviceItem
import com.kapanis.mobil.data.PreferencesManager
import com.kapanis.mobil.data.ServerStatus
import com.kapanis.mobil.network.KapanisApiClient
import com.kapanis.mobil.network.LanScanner
import com.kapanis.mobil.network.NetworkUtils
import com.kapanis.mobil.network.SupabaseRemoteClient
import com.kapanis.mobil.ui.components.GlassCard
import com.kapanis.mobil.ui.theme.KapanisTheme
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PairingDetailsModal(
    prefs: PreferencesManager,
    apiClient: KapanisApiClient,
    supabaseClient: SupabaseRemoteClient,
    currentTarget: ConnectionTarget,
    currentMode: ConnectionMode,
    onSelectDevice: (PairedDeviceItem) -> Unit,
    onManualConnect: (host: String, port: Int, mode: ConnectionMode) -> Unit,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val colors = KapanisTheme.colors

    var pairedList by remember { mutableStateOf(prefs.getPairedDevices()) }
    var currentWifiName by remember { mutableStateOf(NetworkUtils.getCurrentWifiName(context)) }
    var localIp by remember { mutableStateOf(NetworkUtils.getLocalIpAddress()) }

    var manualHost by remember { mutableStateOf(prefs.host) }
    var manualPort by remember { mutableStateOf(prefs.port.toString()) }
    var cloudPairingCode by remember { mutableStateOf(prefs.pairingCode) }

    var isScanning by remember { mutableStateOf(false) }
    var scannedDevices by remember { mutableStateOf<List<Pair<String, ServerStatus>>>(emptyList()) }
    var isConnecting by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        currentWifiName = NetworkUtils.getCurrentWifiName(context)
        localIp = NetworkUtils.getLocalIpAddress()
        pairedList = prefs.getPairedDevices()
    }

    fun scanLan() {
        if (isScanning) return
        isScanning = true
        scannedDevices = emptyList()
        scope.launch {
            val scanner = LanScanner(apiClient)
            val results = scanner.scanSubnet(context, port = prefs.port)
            scannedDevices = results
            isScanning = false
            if (results.isEmpty()) {
                Toast.makeText(context, "Ağda PC bulunamadı. IP adresini elle girin.", Toast.LENGTH_SHORT).show()
            }
        }
    }

    fun connectLocal(host: String, port: Int) {
        if (isConnecting) return
        isConnecting = true
        scope.launch {
            val res = apiClient.ping(host, port)
            isConnecting = false
            if (res.isSuccess) {
                val status = res.getOrNull()
                val devName = status?.deviceName ?: "Windows PC"
                val wifi = NetworkUtils.getCurrentWifiName(context)
                val item = PairedDeviceItem(
                    id = "$host:$port",
                    name = devName,
                    host = host,
                    port = port,
                    mode = ConnectionMode.LOCAL,
                    wifiSsid = wifi,
                    lastConnectedAt = System.currentTimeMillis(),
                    isOnline = true
                )
                prefs.savePairedDevice(item)
                prefs.host = host
                prefs.port = port
                prefs.deviceName = devName
                prefs.wifiSsid = wifi
                prefs.mode = ConnectionMode.LOCAL

                apiClient.registerDevice(
                    host = host,
                    port = port,
                    alias = prefs.controllerName,
                    model = "Android (${android.os.Build.MODEL})",
                    wifiName = wifi
                )

                pairedList = prefs.getPairedDevices()
                Toast.makeText(context, "$devName ile eşleşti ✓", Toast.LENGTH_SHORT).show()
                onSelectDevice(item)
                onDismiss()
            } else {
                Toast.makeText(context, "Bağlantı kurulamadı: $host:$port", Toast.LENGTH_SHORT).show()
            }
        }
    }

    fun connectCloud(code: String) {
        val clean = code.trim().uppercase()
        if (clean.length < 4) {
            Toast.makeText(context, "Lütfen geçerli bir eşleştirme kodu girin", Toast.LENGTH_SHORT).show()
            return
        }
        if (prefs.supabaseUrl.isBlank() || prefs.supabaseAnonKey.isBlank()) {
            Toast.makeText(context, "Önce Supabase URL ve Key ayarlarını girin", Toast.LENGTH_SHORT).show()
            return
        }
        isConnecting = true
        scope.launch {
            val res = supabaseClient.pairDeviceByCode(
                url = prefs.supabaseUrl,
                anonKey = prefs.supabaseAnonKey,
                pairingCode = clean,
                controllerId = prefs.controllerId,
                controllerName = prefs.controllerName
            )
            isConnecting = false
            if (res.isSuccess) {
                val dev = res.getOrNull()
                if (dev != null) {
                    val item = PairedDeviceItem(
                        id = dev.id,
                        name = dev.name,
                        host = "",
                        port = 0,
                        mode = ConnectionMode.ONLINE,
                        wifiSsid = "Bulut (Supabase)",
                        pairingCode = clean,
                        lastConnectedAt = System.currentTimeMillis(),
                        isOnline = dev.isOnline
                    )
                    prefs.savePairedDevice(item)
                    prefs.pairingCode = clean
                    prefs.pairedDeviceId = dev.id
                    prefs.deviceName = dev.name
                    prefs.mode = ConnectionMode.ONLINE

                    pairedList = prefs.getPairedDevices()
                    Toast.makeText(context, "${dev.name} (Bulut) ile eşleşti ✓", Toast.LENGTH_SHORT).show()
                    onSelectDevice(item)
                    onDismiss()
                }
            } else {
                Toast.makeText(context, "Eşleştirme kodu bulunamadı veya PC çevrimdışı", Toast.LENGTH_SHORT).show()
            }
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = colors.paper,
        dragHandle = null
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(0.92f)
                .padding(horizontal = 20.dp, vertical = 16.dp)
                .verticalScroll(rememberScrollState())
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "Eşleşme & Cihaz Yönetimi",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = colors.textPrimary
                    )
                    Text(
                        text = "Bağlı cihazlar ve Wi-Fi detayları",
                        fontSize = 12.sp,
                        color = colors.textMuted
                    )
                }

                IconButton(
                    onClick = onDismiss,
                    modifier = Modifier.size(36.dp)
                ) {
                    Icon(imageVector = Icons.Rounded.Close, contentDescription = "Kapat", tint = colors.textMuted)
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Current Wi-Fi Network Info Card
            GlassCard(modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(38.dp)
                            .background(colors.accent.copy(alpha = 0.15f), CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(imageVector = Icons.Rounded.Wifi, contentDescription = null, tint = colors.accent, modifier = Modifier.size(20.dp))
                    }

                    Spacer(modifier = Modifier.width(12.dp))

                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Mevcut Wi-Fi Ağı",
                            fontSize = 11.sp,
                            color = colors.textMuted,
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            text = currentWifiName,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = colors.textPrimary
                        )
                        if (localIp.isNotEmpty()) {
                            Text(
                                text = "Telefon IP: $localIp",
                                fontSize = 11.sp,
                                color = colors.textFaint
                            )
                        }
                    }

                    Button(
                        onClick = { scanLan() },
                        enabled = !isScanning,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = colors.surfaceRaised,
                            contentColor = colors.accent
                        ),
                        border = BorderStroke(1.dp, colors.border),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.height(36.dp)
                    ) {
                        if (isScanning) {
                            CircularProgressIndicator(modifier = Modifier.size(14.dp), color = colors.accent, strokeWidth = 2.dp)
                        } else {
                            Icon(imageVector = Icons.Rounded.Search, contentDescription = null, modifier = Modifier.size(14.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(text = "Tara", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            // Scanned Discovered Devices
            if (scannedDevices.isNotEmpty()) {
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = "Ağda Bulunan Bilgisayarlar (${scannedDevices.size})",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = colors.accent,
                    modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp)
                )

                scannedDevices.forEach { (ip, status) ->
                    GlassCard(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp),
                        backgroundColor = colors.surfaceRaised,
                        onClick = { connectLocal(ip, status.port) }
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column {
                                Text(text = status.deviceName, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = colors.textPrimary)
                                Text(text = "$ip:${status.port}", fontSize = 11.sp, color = colors.textMuted)
                            }
                            Button(
                                onClick = { connectLocal(ip, status.port) },
                                colors = ButtonDefaults.buttonColors(containerColor = colors.accent, contentColor = colors.accentInk),
                                shape = RoundedCornerShape(8.dp),
                                modifier = Modifier.height(30.dp)
                            ) {
                                Text("Bağlan", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Paired Devices History Section
            Text(
                text = "Eşleşilen Cihazlar Geçmişi (${pairedList.size})",
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                color = colors.textPrimary,
                modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp)
            )

            if (pairedList.isEmpty()) {
                GlassCard(modifier = Modifier.fillMaxWidth()) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(imageVector = Icons.Rounded.Devices, contentDescription = null, tint = colors.textFaint, modifier = Modifier.size(32.dp))
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "Henüz eşleşmiş bir cihaz kaydı yok.",
                            fontSize = 12.sp,
                            color = colors.textMuted
                        )
                    }
                }
            } else {
                pairedList.forEach { dev ->
                    val isCurrent = if (currentMode == ConnectionMode.LOCAL) {
                        dev.mode == ConnectionMode.LOCAL && dev.host == currentTarget.host && dev.port == currentTarget.port
                    } else {
                        dev.mode == ConnectionMode.ONLINE && dev.pairingCode == prefs.pairingCode
                    }

                    val dateStr = SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.getDefault()).format(Date(dev.lastConnectedAt))

                    GlassCard(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp),
                        borderColor = if (isCurrent) colors.accent else colors.border,
                        backgroundColor = if (isCurrent) colors.surfaceRaised else colors.surfaceGlass
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(36.dp)
                                    .background(
                                        if (dev.mode == ConnectionMode.LOCAL) colors.accent.copy(alpha = 0.15f)
                                        else colors.success.copy(alpha = 0.15f),
                                        CircleShape
                                    ),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = if (dev.mode == ConnectionMode.LOCAL) Icons.Rounded.Laptop else Icons.Rounded.Cloud,
                                    contentDescription = null,
                                    tint = if (dev.mode == ConnectionMode.LOCAL) colors.accent else colors.success,
                                    modifier = Modifier.size(18.dp)
                                )
                            }

                            Spacer(modifier = Modifier.width(10.dp))

                            Column(modifier = Modifier.weight(1f)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        text = dev.name,
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = colors.textPrimary
                                    )
                                    if (isCurrent) {
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Surface(
                                            color = colors.accent.copy(alpha = 0.2f),
                                            shape = RoundedCornerShape(4.dp)
                                        ) {
                                            Text(
                                                text = "Aktif",
                                                color = colors.accent,
                                                fontSize = 9.sp,
                                                fontWeight = FontWeight.Bold,
                                                modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp)
                                            )
                                        }
                                    }
                                }

                                Text(
                                    text = if (dev.mode == ConnectionMode.LOCAL) "Wi-Fi · ${dev.host}:${dev.port}"
                                    else "Bulut (Supabase) · Kod: ${dev.pairingCode}",
                                    fontSize = 11.sp,
                                    color = colors.textMuted
                                )

                                Text(
                                    text = "Son bağlantı: $dateStr",
                                    fontSize = 10.sp,
                                    color = colors.textFaint
                                )
                            }

                            Row(verticalAlignment = Alignment.CenterVertically) {
                                if (!isCurrent) {
                                    Button(
                                        onClick = {
                                            if (dev.mode == ConnectionMode.LOCAL) connectLocal(dev.host, dev.port)
                                            else connectCloud(dev.pairingCode)
                                        },
                                        colors = ButtonDefaults.buttonColors(
                                            containerColor = colors.surfaceRaised,
                                            contentColor = colors.textPrimary
                                        ),
                                        border = BorderStroke(1.dp, colors.border),
                                        shape = RoundedCornerShape(8.dp),
                                        modifier = Modifier.height(30.dp)
                                    ) {
                                        Text("Bağlan", fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                    }
                                }

                                IconButton(
                                    onClick = {
                                        prefs.removePairedDevice(dev.id)
                                        pairedList = prefs.getPairedDevices()
                                    },
                                    modifier = Modifier.size(32.dp)
                                ) {
                                    Icon(imageVector = Icons.Rounded.Delete, contentDescription = "Sil", tint = colors.textFaint, modifier = Modifier.size(16.dp))
                                }
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(18.dp))

            // Connect New PC Section (Forms)
            Text(
                text = "Yeni Cihaz Bağla",
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                color = colors.textPrimary,
                modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp)
            )

            // Local Wi-Fi Form
            GlassCard(modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = "Yerel Ağ (Wi-Fi) ile Bağlan",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = colors.accent
                )
                Text(
                    text = "Bilgisayarınızdaki kapanış. programındaki IP adresini girin.",
                    fontSize = 11.sp,
                    color = colors.textMuted,
                    modifier = Modifier.padding(top = 2.dp, bottom = 10.dp)
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedTextField(
                        value = manualHost,
                        onValueChange = { manualHost = it },
                        modifier = Modifier.weight(2.5f),
                        placeholder = { Text("192.168.1.xxx", color = colors.textFaint, fontSize = 12.sp) },
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = colors.surfaceRaised,
                            unfocusedContainerColor = colors.surfaceRaised,
                            focusedBorderColor = colors.accent,
                            unfocusedBorderColor = colors.border,
                            focusedTextColor = colors.textPrimary,
                            unfocusedTextColor = colors.textPrimary
                        ),
                        shape = RoundedCornerShape(10.dp)
                    )

                    OutlinedTextField(
                        value = manualPort,
                        onValueChange = { manualPort = it },
                        modifier = Modifier.weight(1.2f),
                        placeholder = { Text("53317", color = colors.textFaint, fontSize = 12.sp) },
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = colors.surfaceRaised,
                            unfocusedContainerColor = colors.surfaceRaised,
                            focusedBorderColor = colors.accent,
                            unfocusedBorderColor = colors.border,
                            focusedTextColor = colors.textPrimary,
                            unfocusedTextColor = colors.textPrimary
                        ),
                        shape = RoundedCornerShape(10.dp)
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))

                Button(
                    onClick = {
                        val port = manualPort.toIntOrNull() ?: 53317
                        connectLocal(manualHost.trim(), port)
                    },
                    enabled = manualHost.isNotBlank() && !isConnecting,
                    modifier = Modifier.fillMaxWidth().height(44.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = colors.accent,
                        contentColor = colors.accentInk
                    ),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    if (isConnecting) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), color = colors.accentInk, strokeWidth = 2.dp)
                    } else {
                        Text("Yerel Cihaza Bağlan", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Cloud Supabase Pairing Code Form
            GlassCard(modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = "Çevrim İçi (Bulut / Supabase) ile Bağlan",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = colors.success
                )
                Text(
                    text = "PC Ayarlar sayfasındaki 6 haneli eşleştirme kodunu girin.",
                    fontSize = 11.sp,
                    color = colors.textMuted,
                    modifier = Modifier.padding(top = 2.dp, bottom = 10.dp)
                )

                OutlinedTextField(
                    value = cloudPairingCode,
                    onValueChange = { cloudPairingCode = it.uppercase() },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("Örn: KAP-782", color = colors.textFaint, fontSize = 13.sp) },
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = colors.surfaceRaised,
                        unfocusedContainerColor = colors.surfaceRaised,
                        focusedBorderColor = colors.success,
                        unfocusedBorderColor = colors.border,
                        focusedTextColor = colors.textPrimary,
                        unfocusedTextColor = colors.textPrimary
                    ),
                    shape = RoundedCornerShape(10.dp)
                )

                Spacer(modifier = Modifier.height(10.dp))

                Button(
                    onClick = { connectCloud(cloudPairingCode) },
                    enabled = cloudPairingCode.isNotBlank() && !isConnecting,
                    modifier = Modifier.fillMaxWidth().height(44.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = colors.success,
                        contentColor = colors.accentInk
                    ),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    if (isConnecting) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), color = colors.accentInk, strokeWidth = 2.dp)
                    } else {
                        Text("Bulut Cihazı ile Eşleştir", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}
