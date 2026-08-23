package com.kapanis.mobil.ui.screens

import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.CameraAlt
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Cloud
import androidx.compose.material.icons.rounded.Computer
import androidx.compose.material.icons.rounded.ContentPaste
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Devices
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.QrCode
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Wifi
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import com.kapanis.mobil.data.ConnectionMode
import com.kapanis.mobil.data.ConnectionTarget
import com.kapanis.mobil.data.PairedDeviceItem
import com.kapanis.mobil.data.PreferencesManager
import com.kapanis.mobil.data.ServerStatus
import com.kapanis.mobil.network.KapanisApiClient
import com.kapanis.mobil.network.LanScanner
import com.kapanis.mobil.network.SupabaseRemoteClient
import com.kapanis.mobil.ui.components.GlassCard
import com.kapanis.mobil.ui.components.QrScannerModal
import com.kapanis.mobil.ui.theme.KapanisTheme
import kotlinx.coroutines.launch

@Composable
fun ConnectScreen(
    target: ConnectionTarget,
    prefs: PreferencesManager,
    apiClient: KapanisApiClient,
    supabaseClient: SupabaseRemoteClient,
    onTargetChanged: (ConnectionTarget) -> Unit,
    onModeChanged: (ConnectionMode) -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val scanner = remember { LanScanner(apiClient) }
    val colors = KapanisTheme.colors

    var connectSubTab by remember { mutableIntStateOf(0) } // 0: Kayıtlı PC'ler, 1: Yeni PC Ekle (QR / Link / PIN)

    // Saved PCs
    var pairedDevices by remember { mutableStateOf(prefs.getPairedDevices()) }

    // Modern QR Scanner Modal State
    var showQrScannerModal by remember { mutableStateOf(false) }

    // Quick QR / Link input
    var inputPayloadOrLink by remember { mutableStateOf("") }
    var isPairingPayload by remember { mutableStateOf(false) }

    // Local Wi-Fi scan state
    var isScanningLocal by remember { mutableStateOf(false) }
    var foundServers by remember { mutableStateOf<List<Pair<String, ServerStatus>>>(emptyList()) }

    // Local PIN Challenge Dialog
    var showPinDialog by remember { mutableStateOf(false) }
    var pendingPinHost by remember { mutableStateOf("") }
    var pendingPinPort by remember { mutableIntStateOf(53317) }
    var pendingPinName by remember { mutableStateOf("Windows PC") }
    var inputPinCode by remember { mutableStateOf("") }
    var isAuthenticatingPin by remember { mutableStateOf(false) }
    var pinError by remember { mutableStateOf<String?>(null) }

    fun refreshDevicesList() {
        pairedDevices = prefs.getPairedDevices()
    }

    fun selectDevice(device: PairedDeviceItem) {
        if (device.mode == ConnectionMode.ONLINE) {
            prefs.mode = ConnectionMode.ONLINE
            prefs.supabaseUrl = device.supabaseUrl
            prefs.supabaseAnonKey = device.supabaseAnonKey
            prefs.pairedDeviceId = device.id
            prefs.pairingCode = device.pairingCode
            prefs.deviceName = device.name
            val localHost = device.host.takeIf { it.isNotBlank() && it != "192.168.1.100" }
            if (localHost != null) {
                prefs.host = localHost
                prefs.port = device.port
            }
            onModeChanged(ConnectionMode.ONLINE)
            onTargetChanged(
                target.copy(
                    host = localHost ?: target.host,
                    port = if (localHost != null) device.port else target.port,
                    deviceName = device.name,
                    isConnected = true
                )
            )
        } else {
            prefs.mode = ConnectionMode.LOCAL
            prefs.host = device.host
            prefs.port = device.port
            prefs.deviceName = device.name
            onModeChanged(ConnectionMode.LOCAL)
            onTargetChanged(target.copy(host = device.host, port = device.port, deviceName = device.name, isConnected = true))
        }
        prefs.savePairedDevice(device)
        refreshDevicesList()
        Toast.makeText(context, "${device.name} seçildi ✓", Toast.LENGTH_SHORT).show()
    }

    fun handlePairPayloadSubmit(overrideRaw: String? = null) {
        val raw = (overrideRaw ?: inputPayloadOrLink).trim()
        if (raw.isEmpty()) return

        isPairingPayload = true
        scope.launch {
            val payload = PreferencesManager.parsePairingPayload(raw)
            if (payload != null) {
                // If payload has Cloud info (url & key)
                if (payload.url.isNotEmpty() && payload.key.isNotEmpty()) {
                    val pairRes = supabaseClient.pairWithPayload(payload, prefs.controllerId, prefs.controllerName)
                    if (pairRes.isSuccess) {
                        val pairedItem = pairRes.getOrThrow()
                        prefs.savePairedDevice(pairedItem)
                        selectDevice(pairedItem)
                        inputPayloadOrLink = ""
                        connectSubTab = 0
                        isPairingPayload = false
                        Toast.makeText(context, "Eşleştirme Başarılı: ${pairedItem.name} ✓", Toast.LENGTH_LONG).show()
                        return@launch
                    }
                }

                // If payload has local IPs or secret/code
                val candidateHost = payload.ips.firstOrNull { it.isNotBlank() && it != "127.0.0.1" && it != "localhost" }
                if (!candidateHost.isNullOrEmpty()) {
                    // Try to authenticate or connect locally
                    val codeToUse = payload.code.ifEmpty { payload.secret }
                    var token = ""
                    if (codeToUse.isNotEmpty()) {
                        val authRes = apiClient.authenticatePairingPin(candidateHost, payload.port, codeToUse, prefs.controllerId, prefs.controllerName)
                        if (authRes.isSuccess) {
                            token = authRes.getOrDefault("")
                        }
                    }

                    val pingRes = apiClient.ping(candidateHost, payload.port, token)
                    val devName = if (pingRes.isSuccess) pingRes.getOrNull()?.deviceName ?: payload.name else payload.name
                    val devId = if (payload.id.isNotEmpty()) payload.id else pingRes.getOrNull()?.deviceId.orEmpty().ifEmpty { "local-$candidateHost" }

                    val item = PairedDeviceItem(
                        id = devId,
                        name = devName,
                        host = candidateHost,
                        port = payload.port,
                        mode = ConnectionMode.LOCAL,
                        pairingCode = payload.code,
                        pairingSecret = payload.secret,
                        localIps = payload.ips,
                        localAuthToken = token,
                        isOnline = pingRes.isSuccess
                    )
                    if (token.isNotEmpty()) {
                        prefs.saveLocalAuthToken(devId, token)
                        prefs.saveLocalAuthToken(candidateHost, token)
                    }
                    prefs.savePairedDevice(item)
                    selectDevice(item)
                    inputPayloadOrLink = ""
                    connectSubTab = 0
                    isPairingPayload = false
                    Toast.makeText(context, "Yerel Eşleştirme Başarılı: $devName ✓", Toast.LENGTH_LONG).show()
                    return@launch
                }
            }

            // Fallback: Check if it's a simple pairing code for Supabase
            val cleanCode = raw.uppercase()
            val url = prefs.supabaseUrl
            val key = prefs.supabaseAnonKey
            if (url.isNotEmpty() && key.isNotEmpty()) {
                val res = supabaseClient.pairDeviceByCode(url, key, cleanCode, prefs.controllerId, prefs.controllerName)
                if (res.isSuccess) {
                    val dev = res.getOrThrow()
                    val pairedItem = PairedDeviceItem(
                        id = dev.id,
                        name = dev.name,
                        host = target.host,
                        port = target.port,
                        mode = ConnectionMode.ONLINE,
                        pairingCode = dev.pairingCode,
                        supabaseUrl = url,
                        supabaseAnonKey = key,
                        isOnline = dev.isOnline
                    )
                    prefs.savePairedDevice(pairedItem)
                    selectDevice(pairedItem)
                    inputPayloadOrLink = ""
                    connectSubTab = 0
                    isPairingPayload = false
                    Toast.makeText(context, "Eşleştirme Başarılı: ${dev.name} ✓", Toast.LENGTH_LONG).show()
                    return@launch
                }
            }

            isPairingPayload = false
            Toast.makeText(context, "Geçersiz eşleştirme linki veya QR verisi", Toast.LENGTH_LONG).show()
        }
    }

    // Modern ZXing Activity Scanner Launcher
    val barcodeLauncher = rememberLauncherForActivityResult(ScanContract()) { result ->
        val contents = result.contents?.trim()
        if (!contents.isNullOrEmpty()) {
            inputPayloadOrLink = contents
            handlePairPayloadSubmit(contents)
        }
    }

    fun launchQrScanner() {
        try {
            val options = ScanOptions().apply {
                setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                setPrompt("Omni Eşleştirme QR Kodunu Hizalayın")
                setCameraId(0)
                setBeepEnabled(true)
                setBarcodeImageEnabled(false)
                setOrientationLocked(false)
            }
            barcodeLauncher.launch(options)
        } catch (e: Throwable) {
            showQrScannerModal = true
        }
    }

    fun pasteFromClipboard() {
        try {
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
            val clip = clipboard?.primaryClip?.getItemAt(0)?.text?.toString()?.trim()
            if (!clip.isNullOrEmpty()) {
                inputPayloadOrLink = clip
                handlePairPayloadSubmit(clip)
            } else {
                Toast.makeText(context, "Panoda kopyalanmış veri bulunamadı", Toast.LENGTH_SHORT).show()
            }
        } catch (e: Throwable) {
            Toast.makeText(context, "Pano okunamadı", Toast.LENGTH_SHORT).show()
        }
    }

    fun startLocalScan() {
        if (isScanningLocal) return
        isScanningLocal = true
        foundServers = emptyList()
        scope.launch {
            val list = scanner.scanSubnet(context)
            foundServers = list
            isScanningLocal = false
        }
    }

    fun connectLocalPc(host: String, port: Int, name: String) {
        val token = prefs.getLocalAuthToken(host)
        if (token.isNotEmpty()) {
            // Already authenticated, connect directly
            val item = PairedDeviceItem(
                id = "local-$host",
                name = name,
                host = host,
                port = port,
                mode = ConnectionMode.LOCAL,
                localIps = listOf(host),
                localAuthToken = token
            )
            prefs.savePairedDevice(item)
            selectDevice(item)
        } else {
            // Needs PIN authentication
            pendingPinHost = host
            pendingPinPort = port
            pendingPinName = name
            inputPinCode = ""
            pinError = null
            showPinDialog = true
        }
    }

    fun handlePinAuthenticate() {
        if (inputPinCode.isBlank()) return
        isAuthenticatingPin = true
        pinError = null
        scope.launch {
            val res = apiClient.authenticatePairingPin(pendingPinHost, pendingPinPort, inputPinCode, prefs.controllerId, prefs.controllerName)
            isAuthenticatingPin = false
            if (res.isSuccess) {
                val token = res.getOrThrow()
                val pingRes = apiClient.ping(pendingPinHost, pendingPinPort, token)
                val devId = pingRes.getOrNull()?.deviceId.orEmpty().ifEmpty { "local-$pendingPinHost" }
                val devName = pingRes.getOrNull()?.deviceName.orEmpty().ifEmpty { pendingPinName }

                prefs.saveLocalAuthToken(devId, token)
                prefs.saveLocalAuthToken(pendingPinHost, token)

                val item = PairedDeviceItem(
                    id = devId,
                    name = devName,
                    host = pendingPinHost,
                    port = pendingPinPort,
                    mode = ConnectionMode.LOCAL,
                    pairingCode = inputPinCode.uppercase(),
                    localIps = listOf(pendingPinHost),
                    localAuthToken = token
                )
                prefs.savePairedDevice(item)
                selectDevice(item)
                showPinDialog = false
                connectSubTab = 0
            } else {
                pinError = res.exceptionOrNull()?.message ?: "Şifre / PIN hatalı"
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 12.dp)
    ) {
        // Top Navigation Tabs
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(colors.surfaceRaised)
                .padding(4.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            val tabs = listOf("Kayıtlı PC'lerim (${pairedDevices.size})", "+ Yeni PC Ekle")
            tabs.forEachIndexed { index, title ->
                val isSelected = connectSubTab == index
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(8.dp))
                        .background(if (isSelected) colors.accent.copy(alpha = 0.22f) else colors.surface.copy(alpha = 0.5f))
                        .clickable { connectSubTab = index }
                        .padding(vertical = 10.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = title,
                        color = if (isSelected) colors.accent else colors.textMuted,
                        fontSize = 12.sp,
                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        // TAB 0: SAVED PCS (MULTI-PC SWITCHER)
        if (connectSubTab == 0) {
            if (pairedDevices.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(24.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            Icons.Rounded.Devices,
                            contentDescription = null,
                            tint = colors.textMuted.copy(alpha = 0.4f),
                            modifier = Modifier.size(56.dp)
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            text = "Henüz kayıtlı bir bilgisayar yok.",
                            color = colors.textPrimary,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "Yeni PC Ekle sekmesinden QR kod veya link ile hemen bilgisayarınızı ekleyin.",
                            color = colors.textMuted,
                            fontSize = 12.sp,
                            lineHeight = 16.sp,
                            modifier = Modifier.padding(horizontal = 16.dp)
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(
                            onClick = { connectSubTab = 1 },
                            colors = ButtonDefaults.buttonColors(containerColor = colors.accent),
                            shape = RoundedCornerShape(10.dp)
                        ) {
                            Icon(Icons.Rounded.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Yeni Bilgisayar Ekle", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            } else {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(pairedDevices.size, key = { index -> val item = pairedDevices[index]; if (item.id.isNotEmpty()) "${item.id}_$index" else "$index" }) { index ->
                        val pc = pairedDevices[index]
                        val isActive = if (pc.mode == ConnectionMode.ONLINE) {
                            prefs.mode == ConnectionMode.ONLINE && prefs.pairedDeviceId == pc.id
                        } else {
                            prefs.mode == ConnectionMode.LOCAL && prefs.host == pc.host
                        }

                        GlassCard(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { selectDevice(pc) },
                            backgroundColor = if (isActive) colors.accent.copy(alpha = 0.12f) else colors.surfaceRaised,
                            borderColor = if (isActive) colors.accent else colors.border
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(14.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(42.dp)
                                            .clip(CircleShape)
                                            .background(if (isActive) colors.accent.copy(alpha = 0.2f) else colors.surface),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Icon(
                                            imageVector = if (pc.mode == ConnectionMode.ONLINE) Icons.Rounded.Cloud else Icons.Rounded.Wifi,
                                            contentDescription = null,
                                            tint = if (isActive) colors.accent else colors.textMuted,
                                            modifier = Modifier.size(20.dp)
                                        )
                                    }

                                    Spacer(modifier = Modifier.width(12.dp))

                                    Column {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Text(
                                                text = pc.name,
                                                color = colors.textPrimary,
                                                fontSize = 14.sp,
                                                fontWeight = FontWeight.Bold
                                            )
                                            if (isActive) {
                                                Spacer(modifier = Modifier.width(6.dp))
                                                Surface(
                                                    shape = CircleShape,
                                                    color = colors.accent.copy(alpha = 0.2f)
                                                ) {
                                                    Text(
                                                        text = "Aktif",
                                                        color = colors.accent,
                                                        fontSize = 10.sp,
                                                        fontWeight = FontWeight.Bold,
                                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                                    )
                                                }
                                            }
                                        }

                                        Spacer(modifier = Modifier.height(2.dp))

                                        Text(
                                            text = if (pc.mode == ConnectionMode.ONLINE) "Bulut Kumanda · ${pc.pairingCode.ifEmpty { "Eşleşmiş" }}" else "Yerel Ağ (Wi-Fi) · ${pc.host}",
                                            color = colors.textMuted,
                                            fontSize = 11.sp
                                        )
                                    }
                                }

                                if (pc.mode == ConnectionMode.LOCAL) {
                                    IconButton(
                                        onClick = {
                                            val token = prefs.getLocalAuthToken(pc.id.ifEmpty { pc.host })
                                            scope.launch {
                                                val revoked = apiClient.revokeRemoteTrust(pc.host, pc.port, token)
                                                if (revoked.getOrNull() == true) {
                                                    prefs.removePairedDevice(pc.id)
                                                    refreshDevicesList()
                                                    Toast.makeText(context, "${pc.name} güveni kaldırıldı", Toast.LENGTH_SHORT).show()
                                                } else {
                                                    Toast.makeText(context, "PC'ye ulaşılamadı; güven iptali yapılmadı", Toast.LENGTH_SHORT).show()
                                                }
                                            }
                                        },
                                        modifier = Modifier.size(36.dp)
                                    ) {
                                        Icon(Icons.Rounded.Lock, contentDescription = "PC güvenini kaldır", tint = colors.warning, modifier = Modifier.size(16.dp))
                                    }
                                }

                                IconButton(
                                    onClick = {
                                        prefs.removePairedDevice(pc.id)
                                        refreshDevicesList()
                                        Toast.makeText(context, "${pc.name} kaldırıldı", Toast.LENGTH_SHORT).show()
                                    },
                                    modifier = Modifier.size(36.dp)
                                ) {
                                    Icon(Icons.Rounded.Delete, contentDescription = "Kaldır", tint = colors.danger, modifier = Modifier.size(16.dp))
                                }
                            }
                        }
                    }
                }
            }
        }

        // TAB 1: ADD NEW PC (ZERO-CONFIG QR / LINK / PIN)
        if (connectSubTab == 1) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                // Section 1: Zero-Config QR / Link Pair
                GlassCard(
                    modifier = Modifier.fillMaxWidth(),
                    backgroundColor = colors.surfaceRaised
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Rounded.QrCode, contentDescription = null, tint = colors.accent, modifier = Modifier.size(20.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("QR Kod veya Eşleştirme Linki", color = colors.textPrimary, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                        }

                        Spacer(modifier = Modifier.height(8.dp))

                        Text(
                            text = "Bilgisayar ekranındaki QR kodu kamerayla tarayın veya kopyalanan linki yapıştırın. Supabase anahtarları ve bağlantı ayarları otomatik yüklenir.",
                            color = colors.textMuted,
                            fontSize = 11.sp,
                            lineHeight = 15.sp
                        )

                        Spacer(modifier = Modifier.height(14.dp))

                        // Fast Action Buttons: Camera QR Scan & Clipboard Paste
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Button(
                                onClick = { launchQrScanner() },
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(10.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = colors.accent)
                            ) {
                                Icon(Icons.Rounded.CameraAlt, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("QR Tara", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                            }

                            Button(
                                onClick = { pasteFromClipboard() },
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(10.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = colors.surface)
                            ) {
                                Icon(Icons.Rounded.ContentPaste, contentDescription = null, tint = colors.textPrimary, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Panodan Yapıştır", color = colors.textPrimary, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                            }
                        }

                        Spacer(modifier = Modifier.height(12.dp))

                        OutlinedTextField(
                            value = inputPayloadOrLink,
                            onValueChange = { inputPayloadOrLink = it },
                            placeholder = { Text("Eşleştirme linki, QR verisi veya KAP-XXXX...", color = colors.textMuted, fontSize = 11.sp) },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp),
                            minLines = 2,
                            maxLines = 4
                        )

                        Spacer(modifier = Modifier.height(10.dp))

                        Button(
                            onClick = { handlePairPayloadSubmit() },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = colors.accent.copy(alpha = 0.2f)),
                            enabled = !isPairingPayload && inputPayloadOrLink.isNotBlank()
                        ) {
                            if (isPairingPayload) {
                                CircularProgressIndicator(modifier = Modifier.size(16.dp), color = colors.accent)
                            } else {
                                Icon(Icons.Rounded.Check, contentDescription = null, tint = colors.accent, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Manuel Eşleştir & Kaydet", color = colors.accent, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                            }
                        }
                    }
                }

                // Section 2: Local Wi-Fi Network Discovery
                GlassCard(
                    modifier = Modifier.fillMaxWidth(),
                    backgroundColor = colors.surfaceRaised
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Rounded.Wifi, contentDescription = null, tint = colors.accent, modifier = Modifier.size(20.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Yerel Wi-Fi Ağındaki PC'ler", color = colors.textPrimary, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                            }

                            Button(
                                onClick = { startLocalScan() },
                                colors = ButtonDefaults.buttonColors(containerColor = colors.accent.copy(alpha = 0.2f)),
                                shape = RoundedCornerShape(8.dp),
                                enabled = !isScanningLocal
                            ) {
                                if (isScanningLocal) {
                                    CircularProgressIndicator(modifier = Modifier.size(14.dp), color = colors.accent)
                                } else {
                                    Icon(Icons.Rounded.Search, contentDescription = null, tint = colors.accent, modifier = Modifier.size(14.dp))
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("Ağı Tara", color = colors.accent, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }

                        if (foundServers.isNotEmpty()) {
                            Spacer(modifier = Modifier.height(12.dp))
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                foundServers.forEach { (host, srv) ->
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clip(RoundedCornerShape(8.dp))
                                            .background(colors.surface)
                                            .clickable { connectLocalPc(host, srv.port, srv.deviceName) }
                                            .padding(10.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Column {
                                            Text(srv.deviceName, color = colors.textPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                            Text("$host:${srv.port}", color = colors.textMuted, fontSize = 11.sp)
                                        }

                                        Button(
                                            onClick = { connectLocalPc(host, srv.port, srv.deviceName) },
                                            colors = ButtonDefaults.buttonColors(containerColor = colors.accent),
                                            shape = RoundedCornerShape(6.dp)
                                        ) {
                                            Text("Bağlan", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Local PIN Gate Dialog
    if (showPinDialog) {
        AlertDialog(
            onDismissRequest = { showPinDialog = false },
            title = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Rounded.Lock, contentDescription = null, tint = colors.accent)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("PIN / Şifre Doğrulama", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                }
            },
            text = {
                Column {
                    Text(
                        text = "Bilgisayarınızdaki ($pendingPinName) 4 haneli eşleştirme kodunu girin (Örn: KAP-9821):",
                        fontSize = 12.sp,
                        color = colors.textMuted
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = inputPinCode,
                        onValueChange = { inputPinCode = it.uppercase() },
                        placeholder = { Text("KAP-XXXX") },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(8.dp),
                        singleLine = true
                    )
                    if (pinError != null) {
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(text = pinError!!, color = colors.danger, fontSize = 11.sp)
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = { handlePinAuthenticate() },
                    colors = ButtonDefaults.buttonColors(containerColor = colors.accent),
                    enabled = !isAuthenticatingPin && inputPinCode.isNotBlank()
                ) {
                    if (isAuthenticatingPin) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), color = colors.surface)
                    } else {
                        Text("Onayla & Bağlan")
                    }
                }
            },
            dismissButton = {
                TextButton(onClick = { showPinDialog = false }) {
                    Text("İptal", color = colors.textMuted)
                }
            },
            containerColor = colors.surfaceRaised
        )
    }

    // Fullscreen Portrait QR Scanner Modal with Custom Viewfinder & Laser Scanline
    if (showQrScannerModal) {
        QrScannerModal(
            isOpen = showQrScannerModal,
            onDismiss = { showQrScannerModal = false },
            onQrScanned = { scannedCode ->
                showQrScannerModal = false
                inputPayloadOrLink = scannedCode
                handlePairPayloadSubmit(scannedCode)
            }
        )
    }
}
