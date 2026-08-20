package com.kapanis.mobil.ui.screens

import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.Crossfade
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Alarm
import androidx.compose.material.icons.rounded.AlarmAdd
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Cloud
import androidx.compose.material.icons.rounded.CloudDone
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.ContentPaste
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Devices
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.NotificationsActive
import androidx.compose.material.icons.rounded.Pin
import androidx.compose.material.icons.rounded.PowerSettingsNew
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.RestartAlt
import androidx.compose.material.icons.rounded.Send
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material.icons.rounded.Timer
import androidx.compose.material.icons.rounded.UploadFile
import androidx.compose.material.icons.rounded.Wifi
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kapanis.mobil.data.AlarmItem
import com.kapanis.mobil.data.ConnectionMode
import com.kapanis.mobil.data.ConnectionTarget
import com.kapanis.mobil.data.NoteItem
import com.kapanis.mobil.data.PreferencesManager
import com.kapanis.mobil.data.RemoteTimerState
import com.kapanis.mobil.data.TransferItem
import com.kapanis.mobil.network.KapanisApiClient
import com.kapanis.mobil.network.NetworkUtils
import com.kapanis.mobil.network.SupabaseRemoteClient
import com.kapanis.mobil.ui.components.BottomNavBar
import com.kapanis.mobil.ui.components.GlassCard
import com.kapanis.mobil.ui.components.NavTab
import com.kapanis.mobil.ui.components.QuickActionFab
import com.kapanis.mobil.ui.components.TopBar
import com.kapanis.mobil.ui.theme.KapanisTheme
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun MainScreen(
    prefs: PreferencesManager,
    apiClient: KapanisApiClient,
    supabaseClient: SupabaseRemoteClient,
    initialTarget: ConnectionTarget? = null,
    currentTheme: String = "dark",
    onToggleTheme: () -> Unit = {}
) {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val scope = rememberCoroutineScope()
    val colors = KapanisTheme.colors

    // Navigation & Connection State
    var currentTab by remember { mutableStateOf(NavTab.POWER) }
    var mode by remember { mutableStateOf(prefs.mode) }
    var target by remember {
        mutableStateOf(
            initialTarget ?: ConnectionTarget(
                host = prefs.host,
                port = prefs.port,
                deviceName = prefs.deviceName,
                isConnected = false,
                wifiSsid = prefs.wifiSsid
            )
        )
    }

    var isOnlineConnected by remember { mutableStateOf(prefs.pairedDeviceId.isNotEmpty()) }
    var showPairingModal by remember { mutableStateOf(false) }

    // Live Timer State
    var activeTimer by remember { mutableStateOf<RemoteTimerState?>(null) }
    var nowMillis by remember { mutableLongStateOf(System.currentTimeMillis()) }

    // Power Custom Slider Duration (Minutes)
    var selectedMinutes by remember { mutableFloatStateOf(30f) }
    var isSendingPowerCmd by remember { mutableStateOf(false) }

    // PC Alarms State
    var alarmsList by remember { mutableStateOf<List<AlarmItem>>(emptyList()) }
    var alarmPresetMins by remember { mutableIntStateOf(15) }
    var alarmNoteInput by remember { mutableStateOf("") }
    var isCreatingAlarm by remember { mutableStateOf(false) }

    // Transfers State
    var transfers by remember { mutableStateOf<List<TransferItem>>(emptyList()) }
    var isUploading by remember { mutableStateOf(false) }
    var uploadProgress by remember { mutableFloatStateOf(0f) }

    // Notes State
    var notesList by remember { mutableStateOf<List<NoteItem>>(emptyList()) }
    var noteInput by remember { mutableStateOf("") }
    var isSavingNote by remember { mutableStateOf(false) }

    // Notification State
    var notifTitle by remember { mutableStateOf("") }
    var notifMessage by remember { mutableStateOf("") }
    var notifUrgent by remember { mutableStateOf(false) }
    var isSendingNotif by remember { mutableStateOf(false) }

    // File Pickers
    val photoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null && (mode == ConnectionMode.LOCAL && target.isConnected)) {
            isUploading = true
            uploadProgress = 0f
            scope.launch {
                val res = apiClient.uploadFile(context, target.host, target.port, uri) { prog ->
                    uploadProgress = prog
                }
                isUploading = false
                if (res.isSuccess) {
                    val item = res.getOrNull()
                    if (item != null) transfers = listOf(item) + transfers
                    Toast.makeText(context, "Fotoğraf PC'ye aktarıldı ✓", Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(context, "Aktarım başarısız", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null && (mode == ConnectionMode.LOCAL && target.isConnected)) {
            isUploading = true
            uploadProgress = 0f
            scope.launch {
                val res = apiClient.uploadFile(context, target.host, target.port, uri) { prog ->
                    uploadProgress = prog
                }
                isUploading = false
                if (res.isSuccess) {
                    val item = res.getOrNull()
                    if (item != null) transfers = listOf(item) + transfers
                    Toast.makeText(context, "Dosya PC'ye aktarıldı ✓", Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(context, "Aktarım başarısız", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    // Live clock ticker
    LaunchedEffect(Unit) {
        while (isActive) {
            nowMillis = System.currentTimeMillis()
            delay(1000)
        }
    }

    // Periodic synchronization loop (2.5s)
    LaunchedEffect(mode, target.host, target.port, prefs.pairedDeviceId) {
        while (isActive) {
            if (mode == ConnectionMode.LOCAL) {
                val res = apiClient.fetchLocalState(target.host, target.port)
                if (res.isSuccess) {
                    val state = res.getOrNull()
                    target = target.copy(
                        deviceName = state?.deviceName ?: target.deviceName,
                        isConnected = true,
                        wifiSsid = NetworkUtils.getCurrentWifiName(context)
                    )
                    activeTimer = state?.timerState
                    alarmsList = state?.alarms ?: emptyList()
                } else {
                    target = target.copy(isConnected = false)
                }

                val notesRes = apiClient.fetchNotes(target.host, target.port)
                if (notesRes.isSuccess) {
                    notesList = notesRes.getOrDefault(emptyList())
                }
            } else {
                if (prefs.supabaseUrl.isNotEmpty() && prefs.pairedDeviceId.isNotEmpty()) {
                    val res = supabaseClient.fetchDeviceState(
                        prefs.supabaseUrl,
                        prefs.supabaseAnonKey,
                        prefs.pairedDeviceId
                    )
                    if (res.isSuccess) {
                        val devState = res.getOrNull()
                        isOnlineConnected = devState?.isOnline == true
                        activeTimer = devState?.timerState
                    } else {
                        isOnlineConnected = false
                    }
                }
            }
            delay(2500)
        }
    }

    fun sendPower(action: String, durationSecs: Long) {
        if (isSendingPowerCmd) return
        isSendingPowerCmd = true
        scope.launch {
            if (mode == ConnectionMode.LOCAL) {
                val res = apiClient.sendCommand(target.host, target.port, action, durationSecs)
                isSendingPowerCmd = false
                if (res.isSuccess) {
                    activeTimer = res.getOrNull()
                    val label = when (action) {
                        "shutdown" -> if (durationSecs == 0L) "Kapatma başlatıldı" else "Kapatma planlandı (${durationSecs / 60} dk)"
                        "restart" -> "Yeniden başlatma planlandı (${durationSecs / 60} dk)"
                        else -> "Sayaç iptal edildi"
                    }
                    Toast.makeText(context, "$label ✓", Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(context, "Komut iletilemedi", Toast.LENGTH_SHORT).show()
                }
            } else {
                val res = supabaseClient.sendRemoteCommand(
                    url = prefs.supabaseUrl,
                    anonKey = prefs.supabaseAnonKey,
                    deviceId = prefs.pairedDeviceId,
                    controllerId = prefs.controllerId,
                    command = action,
                    delaySeconds = durationSecs
                )
                isSendingPowerCmd = false
                if (res.isSuccess) {
                    val label = when (action) {
                        "shutdown" -> "Bulut kapatma komutu iletildi (${durationSecs / 60} dk)"
                        "restart" -> "Bulut yeniden başlatma komutu iletildi"
                        else -> "Bulut sayacı iptal edildi"
                    }
                    Toast.makeText(context, "$label ✓", Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(context, "Bulut komutu başarısız", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    fun createLocalAlarm(mins: Int, note: String) {
        if (isCreatingAlarm) return
        isCreatingAlarm = true
        val targetTs = System.currentTimeMillis() + (mins * 60 * 1000L)
        scope.launch {
            val res = apiClient.createAlarm(
                host = target.host,
                port = target.port,
                timestamp = targetTs,
                note = note.trim(),
                soundEnabled = true,
                soundProfile = "chime"
            )
            isCreatingAlarm = false
            if (res.isSuccess) {
                alarmNoteInput = ""
                Toast.makeText(context, "PC Alarmı kuruldu ($mins dk) ✓", Toast.LENGTH_SHORT).show()
                val updatedAlarms = apiClient.fetchAlarms(target.host, target.port)
                if (updatedAlarms.isSuccess) alarmsList = updatedAlarms.getOrDefault(emptyList())
            } else {
                Toast.makeText(context, "Alarm oluşturulamadı", Toast.LENGTH_SHORT).show()
            }
        }
    }

    fun cancelLocalAlarm(id: String) {
        scope.launch {
            val res = apiClient.cancelAlarm(target.host, target.port, id)
            if (res.isSuccess) {
                alarmsList = alarmsList.filter { it.id != id }
                Toast.makeText(context, "Alarm iptal edildi ✓", Toast.LENGTH_SHORT).show()
            }
        }
    }

    fun syncClipboardToPc() {
        val clipText = clipboard.getText()?.text.orEmpty().trim()
        if (clipText.isEmpty()) {
            Toast.makeText(context, "Telefonda kopyalanmış metin bulunamadı", Toast.LENGTH_SHORT).show()
            return
        }
        scope.launch {
            val res = apiClient.sendClipboard(target.host, target.port, clipText)
            if (res.isSuccess) {
                Toast.makeText(context, "Pano PC'ye yapıştırıldı (Ctrl+V) ✓", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(context, "Pano aktarılamadı", Toast.LENGTH_SHORT).show()
            }
        }
    }

    fun saveNoteToPc() {
        val text = noteInput.trim()
        if (text.isEmpty() || isSavingNote) return
        isSavingNote = true
        scope.launch {
            val res = apiClient.sendNote(target.host, target.port, text)
            isSavingNote = false
            if (res.isSuccess) {
                val note = res.getOrNull()
                if (note != null) notesList = listOf(note) + notesList
                noteInput = ""
                Toast.makeText(context, "Not PC Defterine kaydedildi ✓", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(context, "Not kaydedilemedi", Toast.LENGTH_SHORT).show()
            }
        }
    }

    fun sendInstantNotification() {
        val msg = notifMessage.trim()
        if (msg.isEmpty() || isSendingNotif) return
        isSendingNotif = true
        scope.launch {
            val res = apiClient.sendNotification(
                host = target.host,
                port = target.port,
                title = notifTitle.trim().ifEmpty { "kapanış. Mobil Bildirim" },
                message = msg,
                urgent = notifUrgent
            )
            isSendingNotif = false
            if (res.isSuccess) {
                notifTitle = ""
                notifMessage = ""
                Toast.makeText(context, "Bildirim PC ekranında gösterildi ✓", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(context, "Bildirim gönderilemedi", Toast.LENGTH_SHORT).show()
            }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.paper)
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            // 1. Top Bar with Brand, PC status beacon, Theme Toggle & Mode Switcher
            TopBar(
                mode = mode,
                target = target,
                onlineDeviceName = prefs.deviceName,
                isOnlineConnected = isOnlineConnected,
                currentTheme = currentTheme,
                onToggleTheme = onToggleTheme,
                onToggleMode = { nextMode ->
                    mode = nextMode
                    prefs.mode = nextMode
                },
                onOpenPairingModal = { showPairingModal = true }
            )

            // 2. Active Tab Content
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
            ) {
                Crossfade(targetState = currentTab, label = "TabCrossfade") { tab ->
                    when (tab) {
                        NavTab.POWER -> {
                            PowerTabView(
                                activeTimer = activeTimer,
                                nowMillis = nowMillis,
                                selectedMinutes = selectedMinutes,
                                onMinutesChange = { selectedMinutes = it },
                                isSendingPowerCmd = isSendingPowerCmd,
                                onSendPower = ::sendPower,
                                target = target,
                                mode = mode,
                                isOnlineConnected = isOnlineConnected,
                                onOpenPairing = { showPairingModal = true }
                            )
                        }

                        NavTab.ALARMS -> {
                            AlarmsTabView(
                                alarmsList = alarmsList,
                                nowMillis = nowMillis,
                                presetMins = alarmPresetMins,
                                onPresetSelect = { alarmPresetMins = it },
                                noteInput = alarmNoteInput,
                                onNoteInputChange = { alarmNoteInput = it },
                                isCreatingAlarm = isCreatingAlarm,
                                onCreateAlarm = ::createLocalAlarm,
                                onCancelAlarm = ::cancelLocalAlarm
                            )
                        }

                        NavTab.DEFTER -> {
                            DefterTabView(
                                notesList = notesList,
                                noteInput = noteInput,
                                onNoteInputChange = { noteInput = it },
                                isSavingNote = isSavingNote,
                                onSaveNote = ::saveNoteToPc,
                                onCopyToPhone = { content ->
                                    clipboard.setText(AnnotatedString(content))
                                    Toast.makeText(context, "Telefona kopyalandı ✓", Toast.LENGTH_SHORT).show()
                                }
                            )
                        }

                        NavTab.TRANSFER -> {
                            TransferTabView(
                                transfers = transfers,
                                isUploading = isUploading,
                                uploadProgress = uploadProgress,
                                onPickPhoto = { photoPickerLauncher.launch("image/*") },
                                onPickFile = { filePickerLauncher.launch("*/*") },
                                onSyncClipboard = ::syncClipboardToPc
                            )
                        }

                        NavTab.NOTIFY -> {
                            NotifyTabView(
                                notifTitle = notifTitle,
                                onTitleChange = { notifTitle = it },
                                notifMessage = notifMessage,
                                onMessageChange = { notifMessage = it },
                                notifUrgent = notifUrgent,
                                onUrgentChange = { notifUrgent = it },
                                isSendingNotif = isSendingNotif,
                                onSendNotification = ::sendInstantNotification,
                                onQuickAction = { action ->
                                    when (action) {
                                        "lock" -> sendPower("shutdown", 0) // or lock if supported
                                        "sync_clip" -> syncClipboardToPc()
                                    }
                                }
                            )
                        }

                        NavTab.CONNECT -> {
                            ConnectTabView(
                                target = target,
                                prefs = prefs,
                                apiClient = apiClient,
                                supabaseClient = supabaseClient,
                                onTargetUpdated = { target = it },
                                onModeUpdated = { mode = it }
                            )
                        }
                    }
                }
            }
        }

        // Floating Action Button
        QuickActionFab(
            onShutdown30m = { sendPower("shutdown", 1800) },
            onShutdown60m = { sendPower("shutdown", 3600) },
            onCancelTimer = { sendPower("cancel", 0) },
            onQuickAlarm = { createLocalAlarm(15, "Hızlı Alarm") },
            onSendClipboard = { syncClipboardToPc() },
            onSendPhoto = { photoPickerLauncher.launch("image/*") },
            onSendNotification = {
                notifTitle = "Hızlı Bildirim"
                notifMessage = "Telefondan anlık uyarı!"
                sendInstantNotification()
            },
            modifier = Modifier.fillMaxSize()
        )

        // Floating Bottom Navigation Bar
        BottomNavBar(
            selectedTab = currentTab,
            alarmsCount = alarmsList.size,
            onTabSelected = { currentTab = it },
            modifier = Modifier.align(Alignment.BottomCenter)
        )

        // Pairing & Devices Modal
        if (showPairingModal) {
            PairingDetailsModal(
                prefs = prefs,
                apiClient = apiClient,
                supabaseClient = supabaseClient,
                currentTarget = target,
                currentMode = mode,
                onSelectDevice = { dev ->
                    if (dev.mode == ConnectionMode.LOCAL) {
                        target = target.copy(
                            host = dev.host,
                            port = dev.port,
                            deviceName = dev.name,
                            wifiSsid = dev.wifiSsid
                        )
                        mode = ConnectionMode.LOCAL
                        prefs.mode = ConnectionMode.LOCAL
                    } else {
                        mode = ConnectionMode.ONLINE
                        prefs.mode = ConnectionMode.ONLINE
                    }
                },
                onManualConnect = { host, port, m ->
                    target = target.copy(host = host, port = port)
                    mode = m
                    prefs.mode = m
                },
                onDismiss = { showPairingModal = false }
            )
        }
    }
}

// ==========================================
// 1. POWER TAB VIEW (Desktop Matching Hero Clock & Presets)
// ==========================================
@Composable
private fun PowerTabView(
    activeTimer: RemoteTimerState?,
    nowMillis: Long,
    selectedMinutes: Float,
    onMinutesChange: (Float) -> Unit,
    isSendingPowerCmd: Boolean,
    onSendPower: (String, Long) -> Unit,
    target: ConnectionTarget,
    mode: ConnectionMode,
    isOnlineConnected: Boolean,
    onOpenPairing: () -> Unit
) {
    val colors = KapanisTheme.colors
    val hasActiveTimer = activeTimer != null && (activeTimer.targetAt > nowMillis)
    val remainingSeconds = if (hasActiveTimer) ((activeTimer.targetAt - nowMillis) / 1000).coerceAtLeast(0) else 0L

    val hours = remainingSeconds / 3600
    val minutes = (remainingSeconds % 3600) / 60
    val seconds = remainingSeconds % 60
    val timeFormatted = String.format(Locale.getDefault(), "%02d:%02d:%02d", hours, minutes, seconds)

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 120.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // Hero Status & Countdown Display
        item {
            GlassCard(
                modifier = Modifier.fillMaxWidth(),
                backgroundColor = if (hasActiveTimer) colors.surfaceRaised else colors.surfaceGlass
            ) {
                if (hasActiveTimer) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 8.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Surface(
                            color = colors.accent.copy(alpha = 0.16f),
                            shape = RoundedCornerShape(20.dp),
                            border = BorderStroke(1.dp, colors.accent.copy(alpha = 0.3f))
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(7.dp)
                                        .background(colors.accent, CircleShape)
                                )
                                Text(
                                    text = if (activeTimer.action == "restart") "PC Yeniden Başlatılacak" else "PC Otomatik Kapanacak",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = colors.accent
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(14.dp))

                        // Large Digital Clock Typography
                        Text(
                            text = timeFormatted,
                            fontSize = 48.sp,
                            fontWeight = FontWeight.Black,
                            color = colors.textPrimary,
                            letterSpacing = 1.sp
                        )

                        val targetDate = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date(activeTimer.targetAt))
                        Text(
                            text = "Kapanış Hedef Saati: $targetDate",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium,
                            color = colors.textMuted
                        )

                        Spacer(modifier = Modifier.height(18.dp))

                        Button(
                            onClick = { onSendPower("cancel", 0) },
                            enabled = !isSendingPowerCmd,
                            colors = ButtonDefaults.buttonColors(
                                containerColor = colors.danger.copy(alpha = 0.18f),
                                contentColor = colors.danger
                            ),
                            shape = RoundedCornerShape(12.dp),
                            border = BorderStroke(1.dp, colors.danger.copy(alpha = 0.3f)),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(46.dp)
                        ) {
                            Icon(imageVector = Icons.Rounded.Stop, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(text = "Sayacı İptal Et", fontSize = 14.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                } else {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(
                                    modifier = Modifier
                                        .size(38.dp)
                                        .background(colors.accent.copy(alpha = 0.14f), CircleShape),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(imageVector = Icons.Rounded.Timer, contentDescription = null, tint = colors.accent, modifier = Modifier.size(20.dp))
                                }
                                Spacer(modifier = Modifier.width(10.dp))
                                Column {
                                    Text(
                                        text = "Hızlı Zamanlayıcı",
                                        fontSize = 15.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = colors.textPrimary
                                    )
                                    Text(
                                        text = "Tek tıkla otomatik kapanış planlayın",
                                        fontSize = 12.sp,
                                        color = colors.textMuted
                                    )
                                }
                            }

                            Surface(
                                color = colors.surfaceRaised,
                                shape = RoundedCornerShape(10.dp),
                                border = BorderStroke(1.dp, colors.border)
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Box(modifier = Modifier.size(6.dp).background(colors.success, CircleShape))
                                    Text(
                                        text = "Hazır",
                                        color = colors.success,
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(16.dp))

                        // One-tap quick presets (15m, 30m, 45m, 1h, 2h, 3h)
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            listOf(15, 30, 45, 60, 120, 180).forEach { mins ->
                                Button(
                                    onClick = { onSendPower("shutdown", mins * 60L) },
                                    enabled = !isSendingPowerCmd,
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = colors.surfaceRaised,
                                        contentColor = colors.textPrimary
                                    ),
                                    shape = RoundedCornerShape(10.dp),
                                    border = BorderStroke(1.dp, colors.border),
                                    modifier = Modifier.weight(1f),
                                    contentPadding = PaddingValues(horizontal = 2.dp, vertical = 10.dp)
                                ) {
                                    Text(
                                        text = if (mins >= 60) "${mins / 60} sa" else "$mins dk",
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold,
                                        textAlign = TextAlign.Center
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        // Custom Duration Slider & Power Actions
        item {
            GlassCard(
                modifier = Modifier.fillMaxWidth(),
                backgroundColor = colors.surfaceGlass
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(34.dp)
                                .background(colors.accent.copy(alpha = 0.14f), CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(imageVector = Icons.Rounded.PowerSettingsNew, contentDescription = null, tint = colors.accent, modifier = Modifier.size(18.dp))
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Text(
                            text = "Özel Güç Süresi",
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = colors.textPrimary
                        )
                    }

                    Surface(
                        color = colors.accent.copy(alpha = 0.15f),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Text(
                            text = "${selectedMinutes.toInt()} Dakika",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            color = colors.accent,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                Slider(
                    value = selectedMinutes,
                    onValueChange = onMinutesChange,
                    valueRange = 1f..360f,
                    colors = SliderDefaults.colors(
                        thumbColor = colors.accent,
                        activeTrackColor = colors.accent,
                        inactiveTrackColor = colors.surfaceRaised
                    )
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(text = "1 dk", fontSize = 11.sp, color = colors.textFaint)
                    Text(text = "1 saat", fontSize = 11.sp, color = colors.textFaint)
                    Text(text = "3 saat", fontSize = 11.sp, color = colors.textFaint)
                    Text(text = "6 saat", fontSize = 11.sp, color = colors.textFaint)
                }

                Spacer(modifier = Modifier.height(16.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Button(
                        onClick = { onSendPower("shutdown", (selectedMinutes.toLong() * 60)) },
                        enabled = !isSendingPowerCmd,
                        modifier = Modifier.weight(1f).height(46.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = colors.accent,
                            contentColor = colors.accentInk
                        ),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Icon(imageVector = Icons.Rounded.PowerSettingsNew, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(text = "Kapatmayı Başlat", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    }

                    Button(
                        onClick = { onSendPower("restart", (selectedMinutes.toLong() * 60)) },
                        enabled = !isSendingPowerCmd,
                        modifier = Modifier.weight(1f).height(46.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = colors.surfaceRaised,
                            contentColor = colors.textPrimary
                        ),
                        border = BorderStroke(1.dp, colors.border),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Icon(imageVector = Icons.Rounded.RestartAlt, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(text = "Yeniden Başlat", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        // Quick Instant Remote Control Buttons
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // Immediate Shutdown (0m)
                GlassCard(
                    modifier = Modifier.weight(1f),
                    onClick = { onSendPower("shutdown", 0) }
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(32.dp)
                                .background(colors.danger.copy(alpha = 0.16f), CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(imageVector = Icons.Rounded.PowerSettingsNew, contentDescription = null, tint = colors.danger, modifier = Modifier.size(16.dp))
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        Column {
                            Text(text = "Hemen Kapat", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = colors.textPrimary)
                            Text(text = "0 saniye gecikme", fontSize = 10.sp, color = colors.textMuted)
                        }
                    }
                }

                // Immediate Restart (0m)
                GlassCard(
                    modifier = Modifier.weight(1f),
                    onClick = { onSendPower("restart", 0) }
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(32.dp)
                                .background(colors.accent.copy(alpha = 0.16f), CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(imageVector = Icons.Rounded.RestartAlt, contentDescription = null, tint = colors.accent, modifier = Modifier.size(16.dp))
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        Column {
                            Text(text = "Hemen Yeniden Başlat", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = colors.textPrimary)
                            Text(text = "Anında yeniden aç", fontSize = 10.sp, color = colors.textMuted)
                        }
                    }
                }
            }
        }
    }
}

// ==========================================
// 2. ALARMS TAB VIEW (PC Alarms Management)
// ==========================================
@Composable
private fun AlarmsTabView(
    alarmsList: List<AlarmItem>,
    nowMillis: Long,
    presetMins: Int,
    onPresetSelect: (Int) -> Unit,
    noteInput: String,
    onNoteInputChange: (String) -> Unit,
    isCreatingAlarm: Boolean,
    onCreateAlarm: (Int, String) -> Unit,
    onCancelAlarm: (String) -> Unit
) {
    val colors = KapanisTheme.colors

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 120.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            GlassCard(modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(34.dp)
                                .background(colors.accent.copy(alpha = 0.14f), CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(imageVector = Icons.Rounded.Alarm, contentDescription = null, tint = colors.accent, modifier = Modifier.size(18.dp))
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Text(
                            text = "PC Alarmı Oluştur",
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = colors.textPrimary
                        )
                    }

                    if (alarmsList.isNotEmpty()) {
                        Surface(
                            color = colors.accent.copy(alpha = 0.15f),
                            shape = RoundedCornerShape(10.dp)
                        ) {
                            Text(
                                text = "${alarmsList.size} Aktif",
                                color = colors.accent,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                            )
                        }
                    }
                }

                Text(
                    text = "Bilgisayar ekranında tam zamanında sesli ve görsel alarm çalar.",
                    fontSize = 12.sp,
                    color = colors.textMuted,
                    modifier = Modifier.padding(top = 4.dp, bottom = 12.dp)
                )

                // Quick preset duration chips
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    listOf(5, 10, 15, 30, 60).forEach { mins ->
                        val isSelected = presetMins == mins
                        Surface(
                            modifier = Modifier
                                .weight(1f)
                                .clickable { onPresetSelect(mins) },
                            color = if (isSelected) colors.accent else colors.surfaceRaised,
                            border = BorderStroke(1.dp, if (isSelected) colors.accent else colors.border),
                            shape = RoundedCornerShape(10.dp)
                        ) {
                            Text(
                                text = "$mins dk",
                                color = if (isSelected) colors.accentInk else colors.textPrimary,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(vertical = 8.dp),
                                textAlign = TextAlign.Center
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedTextField(
                        value = noteInput,
                        onValueChange = onNoteInputChange,
                        modifier = Modifier.weight(1f),
                        placeholder = { Text("Alarm hatırlatma notu...", color = colors.textFaint, fontSize = 12.sp) },
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

                    Button(
                        onClick = { onCreateAlarm(presetMins, noteInput) },
                        enabled = !isCreatingAlarm,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = colors.accent,
                            contentColor = colors.accentInk
                        ),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.height(52.dp)
                    ) {
                        if (isCreatingAlarm) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp), color = colors.accentInk, strokeWidth = 2.dp)
                        } else {
                            Icon(imageVector = Icons.Rounded.AlarmAdd, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Kur", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }

        // Active Alarms List
        if (alarmsList.isEmpty()) {
            item {
                GlassCard(
                    modifier = Modifier.fillMaxWidth(),
                    backgroundColor = colors.surfaceGlass
                ) {
                    Column(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 20.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(imageVector = Icons.Rounded.Alarm, contentDescription = null, tint = colors.textFaint, modifier = Modifier.size(32.dp))
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(text = "Aktif PC Alarmı Yok", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = colors.textPrimary)
                        Text(text = "Yukarıdaki panelden hızlıca alarm kurabilirsiniz.", fontSize = 12.sp, color = colors.textMuted)
                    }
                }
            }
        } else {
            items(alarmsList, key = { it.id }) { alarm ->
                val timeStr = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(alarm.timestamp))
                val remMins = ((alarm.timestamp - nowMillis) / 60000).coerceAtLeast(0)

                GlassCard(
                    modifier = Modifier.fillMaxWidth(),
                    backgroundColor = colors.surfaceRaised
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                            Box(
                                modifier = Modifier
                                    .size(36.dp)
                                    .background(colors.accent.copy(alpha = 0.15f), CircleShape),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(imageVector = Icons.Rounded.Alarm, contentDescription = null, tint = colors.accent, modifier = Modifier.size(18.dp))
                            }
                            Spacer(modifier = Modifier.width(10.dp))
                            Column {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Text(
                                        text = timeStr,
                                        fontSize = 16.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = colors.textPrimary
                                    )
                                    Surface(
                                        color = colors.accent.copy(alpha = 0.15f),
                                        shape = RoundedCornerShape(6.dp)
                                    ) {
                                        Text(
                                            text = "$remMins dk kaldı",
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = colors.accent,
                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                        )
                                    }
                                }

                                if (alarm.note.isNotEmpty()) {
                                    Text(text = alarm.note, fontSize = 12.sp, color = colors.textMuted)
                                }
                            }
                        }

                        IconButton(
                            onClick = { onCancelAlarm(alarm.id) },
                            modifier = Modifier
                                .size(34.dp)
                                .background(colors.danger.copy(alpha = 0.14f), CircleShape)
                        ) {
                            Icon(imageVector = Icons.Rounded.Delete, contentDescription = "Sil", tint = colors.danger, modifier = Modifier.size(16.dp))
                        }
                    }
                }
            }
        }
    }
}

// ==========================================
// 3. DEFTER TAB VIEW (PC Notes & Vault)
// ==========================================
@Composable
private fun DefterTabView(
    notesList: List<NoteItem>,
    noteInput: String,
    onNoteInputChange: (String) -> Unit,
    isSavingNote: Boolean,
    onSaveNote: () -> Unit,
    onCopyToPhone: (String) -> Unit
) {
    val colors = KapanisTheme.colors

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 120.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            GlassCard(modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(34.dp)
                                .background(colors.accent.copy(alpha = 0.14f), CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(imageVector = Icons.Rounded.Description, contentDescription = null, tint = colors.accent, modifier = Modifier.size(18.dp))
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Text(
                            text = "PC Defterine Not Kaydet",
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = colors.textPrimary
                        )
                    }

                    if (notesList.isNotEmpty()) {
                        Text(
                            text = "${notesList.size} Not",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = colors.textMuted
                        )
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                OutlinedTextField(
                    value = noteInput,
                    onValueChange = onNoteInputChange,
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("Düşüncelerinizi, linkleri veya notları yazın...", color = colors.textFaint, fontSize = 13.sp) },
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = colors.surfaceRaised,
                        unfocusedContainerColor = colors.surfaceRaised,
                        focusedBorderColor = colors.accent,
                        unfocusedBorderColor = colors.border,
                        focusedTextColor = colors.textPrimary,
                        unfocusedTextColor = colors.textPrimary
                    ),
                    shape = RoundedCornerShape(10.dp),
                    minLines = 2,
                    maxLines = 4
                )

                Spacer(modifier = Modifier.height(10.dp))

                Button(
                    onClick = onSaveNote,
                    enabled = noteInput.isNotBlank() && !isSavingNote,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = colors.accent,
                        contentColor = colors.accentInk
                    ),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.fillMaxWidth().height(44.dp)
                ) {
                    if (isSavingNote) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), color = colors.accentInk, strokeWidth = 2.dp)
                    } else {
                        Icon(imageVector = Icons.Rounded.Send, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("PC Defterine Gönder", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        // Synced Notes List
        if (notesList.isEmpty()) {
            item {
                GlassCard(
                    modifier = Modifier.fillMaxWidth(),
                    backgroundColor = colors.surfaceGlass
                ) {
                    Column(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 20.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(imageVector = Icons.Rounded.Description, contentDescription = null, tint = colors.textFaint, modifier = Modifier.size(32.dp))
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(text = "Henüz Senkronize Not Yok", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = colors.textPrimary)
                        Text(text = "Yazdığınız notlar doğrudan masaüstü uygulamasının defterine eklenir.", fontSize = 12.sp, color = colors.textMuted, textAlign = TextAlign.Center)
                    }
                }
            }
        } else {
            items(notesList, key = { it.id }) { note ->
                GlassCard(
                    modifier = Modifier.fillMaxWidth(),
                    backgroundColor = colors.surfaceRaised
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.Top,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            if (note.pinned) {
                                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 4.dp)) {
                                    Icon(imageVector = Icons.Rounded.Pin, contentDescription = null, tint = colors.accent, modifier = Modifier.size(12.dp))
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text(text = "Sabitlendi", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = colors.accent)
                                }
                            }

                            Text(
                                text = note.content,
                                fontSize = 13.sp,
                                color = colors.textPrimary,
                                lineHeight = 18.sp
                            )
                        }

                        IconButton(
                            onClick = { onCopyToPhone(note.content) },
                            modifier = Modifier.size(32.dp)
                        ) {
                            Icon(imageVector = Icons.Rounded.ContentCopy, contentDescription = "Kopyala", tint = colors.textFaint, modifier = Modifier.size(16.dp))
                        }
                    }
                }
            }
        }
    }
}

// ==========================================
// 4. TRANSFER TAB VIEW (Photos, Files & Clipboard)
// ==========================================
@Composable
private fun TransferTabView(
    transfers: List<TransferItem>,
    isUploading: Boolean,
    uploadProgress: Float,
    onPickPhoto: () -> Unit,
    onPickFile: () -> Unit,
    onSyncClipboard: () -> Unit
) {
    val colors = KapanisTheme.colors

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 120.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            GlassCard(modifier = Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(34.dp)
                            .background(colors.accent.copy(alpha = 0.14f), CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(imageVector = Icons.Rounded.UploadFile, contentDescription = null, tint = colors.accent, modifier = Modifier.size(18.dp))
                    }
                    Spacer(modifier = Modifier.width(10.dp))
                    Column {
                        Text(
                            text = "Kablosuz PC Aktarımı",
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = colors.textPrimary
                        )
                        Text(
                            text = "Fotoğraf, dosya ve panonuzu PC'ye anında gönderin.",
                            fontSize = 12.sp,
                            color = colors.textMuted
                        )
                    }
                }

                if (isUploading) {
                    Spacer(modifier = Modifier.height(14.dp))
                    Column(modifier = Modifier.fillMaxWidth()) {
                        LinearProgressIndicator(
                            progress = { uploadProgress },
                            modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)),
                            color = colors.accent,
                            trackColor = colors.surfaceRaised
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(text = "Aktarılıyor... %${(uploadProgress * 100).toInt()}", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = colors.accent)
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Button(
                        onClick = onPickPhoto,
                        enabled = !isUploading,
                        modifier = Modifier.weight(1f).height(46.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = colors.surfaceRaised,
                            contentColor = colors.textPrimary
                        ),
                        border = BorderStroke(1.dp, colors.border),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Icon(imageVector = Icons.Rounded.Image, contentDescription = null, modifier = Modifier.size(16.dp), tint = colors.accent)
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(text = "Fotoğraf", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }

                    Button(
                        onClick = onPickFile,
                        enabled = !isUploading,
                        modifier = Modifier.weight(1f).height(46.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = colors.surfaceRaised,
                            contentColor = colors.textPrimary
                        ),
                        border = BorderStroke(1.dp, colors.border),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Icon(imageVector = Icons.Rounded.FolderOpen, contentDescription = null, modifier = Modifier.size(16.dp), tint = colors.accent)
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(text = "Dosya", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                Button(
                    onClick = onSyncClipboard,
                    modifier = Modifier.fillMaxWidth().height(46.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = colors.accent.copy(alpha = 0.15f),
                        contentColor = colors.accent
                    ),
                    border = BorderStroke(1.dp, colors.accent.copy(alpha = 0.3f)),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Icon(imageVector = Icons.Rounded.ContentPaste, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(text = "Telefondaki Panoyu PC'ye Yapıştır (Ctrl+V)", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }

        // Recent Transfers History
        if (transfers.isNotEmpty()) {
            item {
                Text(text = "Son Aktarılanlar", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = colors.textMuted, modifier = Modifier.padding(start = 4.dp))
            }

            items(transfers) { tr ->
                GlassCard(
                    modifier = Modifier.fillMaxWidth(),
                    backgroundColor = colors.surfaceRaised
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                            Icon(
                                imageVector = if (tr.isImage) Icons.Rounded.Image else Icons.Rounded.Description,
                                contentDescription = null,
                                tint = colors.accent,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.width(10.dp))
                            Column {
                                Text(
                                    text = tr.filename,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = colors.textPrimary,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Text(text = "${tr.size / 1024} KB", fontSize = 11.sp, color = colors.textFaint)
                            }
                        }

                        Icon(imageVector = Icons.Rounded.CheckCircle, contentDescription = null, tint = colors.success, modifier = Modifier.size(16.dp))
                    }
                }
            }
        }
    }
}

// ==========================================
// 5. NOTIFY TAB VIEW (Instant Banner & Sounds)
// ==========================================
@Composable
private fun NotifyTabView(
    notifTitle: String,
    onTitleChange: (String) -> Unit,
    notifMessage: String,
    onMessageChange: (String) -> Unit,
    notifUrgent: Boolean,
    onUrgentChange: (Boolean) -> Unit,
    isSendingNotif: Boolean,
    onSendNotification: () -> Unit,
    onQuickAction: (String) -> Unit
) {
    val colors = KapanisTheme.colors

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 120.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            GlassCard(modifier = Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(34.dp)
                            .background(colors.accent.copy(alpha = 0.14f), CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(imageVector = Icons.Rounded.NotificationsActive, contentDescription = null, tint = colors.accent, modifier = Modifier.size(18.dp))
                    }
                    Spacer(modifier = Modifier.width(10.dp))
                    Column {
                        Text(
                            text = "PC'ye Anlık Bildirim",
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = colors.textPrimary
                        )
                        Text(
                            text = "Bilgisayar ekranına hemen açılır bildirim yollar.",
                            fontSize = 12.sp,
                            color = colors.textMuted
                        )
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                OutlinedTextField(
                    value = notifTitle,
                    onValueChange = onTitleChange,
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("Başlık (İsteğe bağlı)", color = colors.textFaint, fontSize = 12.sp) },
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

                Spacer(modifier = Modifier.height(8.dp))

                OutlinedTextField(
                    value = notifMessage,
                    onValueChange = onMessageChange,
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("Bildirim mesajı...", color = colors.textFaint, fontSize = 12.sp) },
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = colors.surfaceRaised,
                        unfocusedContainerColor = colors.surfaceRaised,
                        focusedBorderColor = colors.accent,
                        unfocusedBorderColor = colors.border,
                        focusedTextColor = colors.textPrimary,
                        unfocusedTextColor = colors.textPrimary
                    ),
                    shape = RoundedCornerShape(10.dp),
                    minLines = 2,
                    maxLines = 3
                )

                Spacer(modifier = Modifier.height(12.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Switch(
                            checked = notifUrgent,
                            onCheckedChange = onUrgentChange,
                            colors = SwitchDefaults.colors(
                                checkedThumbColor = colors.accent,
                                checkedTrackColor = colors.surfaceRaised
                            )
                        )
                        Text(
                            text = "Acil Sesli Çal",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = if (notifUrgent) colors.accent else colors.textMuted
                        )
                    }

                    Button(
                        onClick = onSendNotification,
                        enabled = notifMessage.isNotBlank() && !isSendingNotif,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = colors.accent,
                            contentColor = colors.accentInk
                        ),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        if (isSendingNotif) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp), color = colors.accentInk, strokeWidth = 2.dp)
                        } else {
                            Icon(imageVector = Icons.Rounded.Send, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(text = "Gönder", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }
}

// ==========================================
// 6. CONNECT TAB VIEW (LAN & Supabase Pairing)
// ==========================================
@Composable
private fun ConnectTabView(
    target: ConnectionTarget,
    prefs: PreferencesManager,
    apiClient: KapanisApiClient,
    supabaseClient: SupabaseRemoteClient,
    onTargetUpdated: (ConnectionTarget) -> Unit,
    onModeUpdated: (ConnectionMode) -> Unit
) {
    ConnectScreen(
        target = target,
        prefs = prefs,
        apiClient = apiClient,
        supabaseClient = supabaseClient,
        onTargetChanged = onTargetUpdated,
        onModeChanged = onModeUpdated
    )
}
