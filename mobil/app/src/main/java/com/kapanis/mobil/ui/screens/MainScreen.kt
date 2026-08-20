package com.kapanis.mobil.ui.screens

import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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
import androidx.compose.material.icons.rounded.Alarm
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.ContentPaste
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Devices
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.NotificationsActive
import androidx.compose.material.icons.rounded.PowerSettingsNew
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.RestartAlt
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Send
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material.icons.rounded.UploadFile
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
import androidx.compose.ui.text.font.FontFamily
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

    // Active Navigation Tab (Home, Notes, Transfer)
    var currentTab by remember { mutableStateOf(NavTab.HOME) }

    // Connection States
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

    // Live Clock & Timer State
    var nowMillis by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var activeTimer by remember { mutableStateOf<RemoteTimerState?>(null) }

    // Power Controls State
    var selectedMinutes by remember { mutableFloatStateOf(30f) }
    var isSendingPowerCmd by remember { mutableStateOf(false) }

    // Alarms State
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

    // Quick Command Bar
    var searchQuery by remember { mutableStateOf("") }

    // Media Pickers
    val photoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null) {
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
        if (uri != null) {
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

    // 1-second interval ticker
    LaunchedEffect(Unit) {
        while (isActive) {
            nowMillis = System.currentTimeMillis()
            delay(1000)
        }
    }

    // Periodic synchronization loop (2s)
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
            delay(2000)
        }
    }

    // Fast Optimistic UI Actions
    fun sendPower(action: String, durationSecs: Long) {
        if (isSendingPowerCmd) return
        isSendingPowerCmd = true

        if (action == "cancel") {
            activeTimer = null
            Toast.makeText(context, "Sayaç iptal edildi ✓", Toast.LENGTH_SHORT).show()
        } else {
            val targetAt = System.currentTimeMillis() + (durationSecs * 1000)
            activeTimer = RemoteTimerState(action = action, targetAt = targetAt, durationSeconds = durationSecs)
            val label = if (action == "shutdown") {
                if (durationSecs == 0L) "Kapatma başlatıldı" else "Kapatma planlandı (${durationSecs / 60} dk)"
            } else {
                "Yeniden başlatma planlandı (${durationSecs / 60} dk)"
            }
            Toast.makeText(context, "$label ✓", Toast.LENGTH_SHORT).show()
        }

        scope.launch {
            if (mode == ConnectionMode.LOCAL) {
                val res = apiClient.sendCommand(target.host, target.port, action, durationSecs)
                isSendingPowerCmd = false
                if (res.isSuccess) activeTimer = res.getOrNull()
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
            }
        }
    }

    fun syncClipboardToPc() {
        val clipText = clipboard.getText()?.text.orEmpty().trim()
        if (clipText.isEmpty()) {
            Toast.makeText(context, "Telefonda kopyalanmış metin yok", Toast.LENGTH_SHORT).show()
            return
        }
        Toast.makeText(context, "Pano PC'ye yapıştırılıyor (Ctrl+V) ✓", Toast.LENGTH_SHORT).show()
        scope.launch {
            val res = apiClient.sendClipboard(target.host, target.port, clipText)
            if (!res.isSuccess) {
                Toast.makeText(context, "Pano aktarılamadı", Toast.LENGTH_SHORT).show()
            }
        }
    }

    fun createLocalAlarm(mins: Int, note: String) {
        if (isCreatingAlarm) return
        isCreatingAlarm = true
        val targetTs = System.currentTimeMillis() + (mins * 60 * 1000L)
        val tempAlarm = AlarmItem(id = "temp-${System.currentTimeMillis()}", timestamp = targetTs, note = note.trim())
        alarmsList = listOf(tempAlarm) + alarmsList
        Toast.makeText(context, "PC Alarmı kuruldu ($mins dk) ✓", Toast.LENGTH_SHORT).show()
        alarmNoteInput = ""

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
                val updated = apiClient.fetchAlarms(target.host, target.port)
                if (updated.isSuccess) alarmsList = updated.getOrDefault(emptyList())
            }
        }
    }

    fun cancelLocalAlarm(id: String) {
        alarmsList = alarmsList.filter { it.id != id }
        Toast.makeText(context, "Alarm iptal edildi ✓", Toast.LENGTH_SHORT).show()
        scope.launch {
            apiClient.cancelAlarm(target.host, target.port, id)
        }
    }

    fun saveNoteToPc() {
        val text = noteInput.trim()
        if (text.isEmpty() || isSavingNote) return
        isSavingNote = true
        val tempNote = NoteItem(id = "temp-${System.currentTimeMillis()}", content = text)
        notesList = listOf(tempNote) + notesList
        noteInput = ""
        Toast.makeText(context, "Not PC Defterine kaydedildi ✓", Toast.LENGTH_SHORT).show()

        scope.launch {
            val res = apiClient.sendNote(target.host, target.port, text)
            isSavingNote = false
            if (res.isSuccess) {
                val note = res.getOrNull()
                if (note != null) notesList = listOf(note) + notesList.filter { it.id != tempNote.id && it.id != note.id }
            }
        }
    }

    fun sendInstantNotification() {
        val msg = notifMessage.trim()
        if (msg.isEmpty() || isSendingNotif) return
        isSendingNotif = true
        Toast.makeText(context, "Bildirim PC ekranında gösterildi ✓", Toast.LENGTH_SHORT).show()
        val titleToSend = notifTitle.trim().ifEmpty { "kapanış. Mobil Bildirim" }
        notifTitle = ""
        notifMessage = ""

        scope.launch {
            apiClient.sendNotification(
                host = target.host,
                port = target.port,
                title = titleToSend,
                message = msg,
                urgent = notifUrgent
            )
            isSendingNotif = false
        }
    }

    fun handleCommandInput(cmd: String) {
        val q = cmd.trim().lowercase()
        if (q.isEmpty()) return

        when {
            q.startsWith("kapat") || q.startsWith("/kapat") -> {
                val mins = q.filter { it.isDigit() }.toLongOrNull() ?: 30L
                sendPower("shutdown", mins * 60)
            }
            q.startsWith("yeniden") || q.startsWith("/yeniden") || q.startsWith("restart") -> {
                val mins = q.filter { it.isDigit() }.toLongOrNull() ?: 0L
                sendPower("restart", mins * 60)
            }
            q.startsWith("iptal") || q.startsWith("/iptal") || q.startsWith("dur") -> {
                sendPower("cancel", 0)
            }
            q.startsWith("alarm") || q.startsWith("/alarm") -> {
                val mins = q.filter { it.isDigit() }.toIntOrNull() ?: 15
                createLocalAlarm(mins, "Hızlı Komut Alarmı")
            }
            q.startsWith("pano") || q.startsWith("/pano") || q.startsWith("yapistir") -> {
                syncClipboardToPc()
            }
            q.startsWith("foto") || q.startsWith("/foto") -> {
                photoPickerLauncher.launch("image/*")
            }
            q.startsWith("dosya") || q.startsWith("/dosya") -> {
                filePickerLauncher.launch("*/*")
            }
            else -> {
                Toast.makeText(context, "Komut: '$cmd' işleniyor...", Toast.LENGTH_SHORT).show()
            }
        }
        searchQuery = ""
    }

    // Calculated Time Strings
    val currentDateStr = SimpleDateFormat("EEEE, d MMMM yyyy", Locale("tr")).format(Date(nowMillis))
    val currentClockStr = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date(nowMillis))

    val hasActiveTimer = activeTimer != null && (activeTimer!!.targetAt > nowMillis)
    val remainingSeconds = if (hasActiveTimer) ((activeTimer!!.targetAt - nowMillis) / 1000).coerceAtLeast(0) else 0L
    val hours = remainingSeconds / 3600
    val minutes = (remainingSeconds % 3600) / 60
    val seconds = remainingSeconds % 60
    val countdownFormatted = String.format(Locale.getDefault(), "%02d:%02d:%02d", hours, minutes, seconds)

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.paper)
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            // 1. Sleek Top Bar
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

            // 2. Tab Contents
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
            ) {
                when (currentTab) {
                    NavTab.HOME -> {
                        // TAB 1: ANASAYFA (Mini-OS Dashboard)
                        LazyColumn(
                            modifier = Modifier.fillMaxSize(),
                            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 100.dp),
                            verticalArrangement = Arrangement.spacedBy(14.dp)
                        ) {
                            // Hero Clock & Countdown
                            item {
                                GlassCard(
                                    modifier = Modifier.fillMaxWidth(),
                                    backgroundColor = if (hasActiveTimer) colors.surfaceRaised else colors.surfaceGlass
                                ) {
                                    Column(
                                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                                        horizontalAlignment = Alignment.CenterHorizontally
                                    ) {
                                        if (hasActiveTimer) {
                                            Surface(
                                                color = colors.danger.copy(alpha = 0.16f),
                                                shape = RoundedCornerShape(20.dp),
                                                border = BorderStroke(1.dp, colors.danger.copy(alpha = 0.35f))
                                            ) {
                                                Row(
                                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 5.dp),
                                                    verticalAlignment = Alignment.CenterVertically,
                                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                                ) {
                                                    Box(modifier = Modifier.size(8.dp).background(colors.danger, CircleShape))
                                                    Text(
                                                        text = if (activeTimer?.action == "restart") "PC Yeniden Başlatılacak" else "PC Otomatik Kapanacak",
                                                        fontSize = 12.sp,
                                                        fontWeight = FontWeight.Bold,
                                                        color = colors.danger
                                                    )
                                                }
                                            }

                                            Spacer(modifier = Modifier.height(10.dp))

                                            Text(
                                                text = countdownFormatted,
                                                fontSize = 48.sp,
                                                fontWeight = FontWeight.Black,
                                                color = colors.textPrimary,
                                                letterSpacing = 1.5.sp,
                                                fontFamily = FontFamily.SansSerif
                                            )

                                            val targetDate = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date(activeTimer!!.targetAt))
                                            Text(
                                                text = "Hedef Kapanış Saati: $targetDate",
                                                fontSize = 13.sp,
                                                fontWeight = FontWeight.Medium,
                                                color = colors.textMuted
                                            )

                                            Spacer(modifier = Modifier.height(14.dp))

                                            Button(
                                                onClick = { sendPower("cancel", 0) },
                                                enabled = !isSendingPowerCmd,
                                                colors = ButtonDefaults.buttonColors(
                                                    containerColor = colors.danger.copy(alpha = 0.2f),
                                                    contentColor = colors.danger
                                                ),
                                                border = BorderStroke(1.dp, colors.danger.copy(alpha = 0.35f)),
                                                shape = RoundedCornerShape(12.dp),
                                                modifier = Modifier.fillMaxWidth().height(44.dp)
                                            ) {
                                                Icon(imageVector = Icons.Rounded.Stop, contentDescription = null, modifier = Modifier.size(18.dp))
                                                Spacer(modifier = Modifier.width(6.dp))
                                                Text(text = "Sayacı İptal Et", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                            }
                                        } else {
                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Column {
                                                    Text(
                                                        text = currentDateStr.replaceFirstChar { it.uppercase() },
                                                        fontSize = 12.sp,
                                                        fontWeight = FontWeight.SemiBold,
                                                        color = colors.textMuted
                                                    )
                                                    Text(
                                                        text = currentClockStr,
                                                        fontSize = 32.sp,
                                                        fontWeight = FontWeight.Black,
                                                        color = colors.textPrimary,
                                                        letterSpacing = (-0.5).sp
                                                    )
                                                }

                                                Surface(
                                                    color = colors.accent.copy(alpha = 0.14f),
                                                    shape = RoundedCornerShape(12.dp),
                                                    border = BorderStroke(1.dp, colors.accent.copy(alpha = 0.3f))
                                                ) {
                                                    Row(
                                                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                                        verticalAlignment = Alignment.CenterVertically,
                                                        horizontalArrangement = Arrangement.spacedBy(5.dp)
                                                    ) {
                                                        Box(modifier = Modifier.size(7.dp).background(colors.success, CircleShape))
                                                        Text(
                                                            text = if (target.isConnected || isOnlineConnected) "Sistem Hazır" else "Bağlantı Bekliyor",
                                                            fontSize = 11.sp,
                                                            fontWeight = FontWeight.Bold,
                                                            color = colors.textPrimary
                                                        )
                                                    }
                                                }
                                            }

                                            Spacer(modifier = Modifier.height(14.dp))

                                            Surface(
                                                shape = RoundedCornerShape(12.dp),
                                                color = colors.surfaceRaised,
                                                border = BorderStroke(1.dp, colors.border),
                                                modifier = Modifier.fillMaxWidth()
                                            ) {
                                                Row(
                                                    modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 2.dp),
                                                    verticalAlignment = Alignment.CenterVertically
                                                ) {
                                                    Icon(imageVector = Icons.Rounded.Search, contentDescription = null, tint = colors.accent, modifier = Modifier.size(18.dp))
                                                    Spacer(modifier = Modifier.width(8.dp))
                                                    OutlinedTextField(
                                                        value = searchQuery,
                                                        onValueChange = { searchQuery = it },
                                                        placeholder = { Text("Hızlı Komut: 'kapat 30', 'alarm 15', 'pano'...", fontSize = 12.sp, color = colors.textFaint) },
                                                        singleLine = true,
                                                        colors = OutlinedTextFieldDefaults.colors(
                                                            focusedContainerColor = Color.Transparent,
                                                            unfocusedContainerColor = Color.Transparent,
                                                            focusedBorderColor = Color.Transparent,
                                                            unfocusedBorderColor = Color.Transparent,
                                                            focusedTextColor = colors.textPrimary,
                                                            unfocusedTextColor = colors.textPrimary
                                                        ),
                                                        modifier = Modifier.weight(1f)
                                                    )
                                                    if (searchQuery.isNotEmpty()) {
                                                        IconButton(
                                                            onClick = { handleCommandInput(searchQuery) },
                                                            modifier = Modifier.size(32.dp)
                                                        ) {
                                                            Icon(imageVector = Icons.Rounded.Check, contentDescription = "Uygula", tint = colors.accent)
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            // Güç & Kapanış Kartı
                            item {
                                GlassCard(modifier = Modifier.fillMaxWidth()) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Box(
                                                modifier = Modifier.size(34.dp).background(colors.accent.copy(alpha = 0.14f), CircleShape),
                                                contentAlignment = Alignment.Center
                                            ) {
                                                Icon(imageVector = Icons.Rounded.PowerSettingsNew, contentDescription = null, tint = colors.accent, modifier = Modifier.size(18.dp))
                                            }
                                            Spacer(modifier = Modifier.width(10.dp))
                                            Text(text = "Güç & Otomatik Kapanış", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = colors.textPrimary)
                                        }

                                        Surface(color = colors.accent.copy(alpha = 0.15f), shape = RoundedCornerShape(10.dp)) {
                                            Text(text = "${selectedMinutes.toInt()} Dakika", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = colors.accent, modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp))
                                        }
                                    }

                                    Spacer(modifier = Modifier.height(12.dp))

                                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                        listOf(15, 30, 45, 60, 120, 180).forEach { mins ->
                                            Button(
                                                onClick = {
                                                    selectedMinutes = mins.toFloat()
                                                    sendPower("shutdown", mins * 60L)
                                                },
                                                enabled = !isSendingPowerCmd,
                                                colors = ButtonDefaults.buttonColors(containerColor = colors.surfaceRaised, contentColor = colors.textPrimary),
                                                shape = RoundedCornerShape(10.dp),
                                                border = BorderStroke(1.dp, colors.border),
                                                modifier = Modifier.weight(1f),
                                                contentPadding = PaddingValues(horizontal = 2.dp, vertical = 8.dp)
                                            ) {
                                                Text(text = if (mins >= 60) "${mins / 60} sa" else "$mins dk", fontSize = 11.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
                                            }
                                        }
                                    }

                                    Spacer(modifier = Modifier.height(10.dp))

                                    Slider(
                                        value = selectedMinutes,
                                        onValueChange = { selectedMinutes = it },
                                        valueRange = 1f..360f,
                                        colors = SliderDefaults.colors(thumbColor = colors.accent, activeTrackColor = colors.accent, inactiveTrackColor = colors.surfaceRaised)
                                    )

                                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Button(
                                            onClick = { sendPower("shutdown", (selectedMinutes.toLong() * 60)) },
                                            enabled = !isSendingPowerCmd,
                                            modifier = Modifier.weight(1f).height(44.dp),
                                            colors = ButtonDefaults.buttonColors(containerColor = colors.accent, contentColor = colors.accentInk),
                                            shape = RoundedCornerShape(10.dp)
                                        ) {
                                            Icon(imageVector = Icons.Rounded.PowerSettingsNew, contentDescription = null, modifier = Modifier.size(16.dp))
                                            Spacer(modifier = Modifier.width(6.dp))
                                            Text(text = "Kapatmayı Başlat", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                        }

                                        Button(
                                            onClick = { sendPower("restart", (selectedMinutes.toLong() * 60)) },
                                            enabled = !isSendingPowerCmd,
                                            modifier = Modifier.weight(1f).height(44.dp),
                                            colors = ButtonDefaults.buttonColors(containerColor = colors.surfaceRaised, contentColor = colors.textPrimary),
                                            border = BorderStroke(1.dp, colors.border),
                                            shape = RoundedCornerShape(10.dp)
                                        ) {
                                            Icon(imageVector = Icons.Rounded.RestartAlt, contentDescription = null, modifier = Modifier.size(16.dp))
                                            Spacer(modifier = Modifier.width(6.dp))
                                            Text(text = "Yeniden Başlat", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                        }
                                    }
                                }
                            }

                            // PC Alarmları Kartı
                            item {
                                GlassCard(modifier = Modifier.fillMaxWidth()) {
                                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Box(modifier = Modifier.size(34.dp).background(colors.accent.copy(alpha = 0.14f), CircleShape), contentAlignment = Alignment.Center) {
                                                Icon(imageVector = Icons.Rounded.Alarm, contentDescription = null, tint = colors.accent, modifier = Modifier.size(18.dp))
                                            }
                                            Spacer(modifier = Modifier.width(10.dp))
                                            Text(text = "PC Alarmları", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = colors.textPrimary)
                                        }

                                        if (alarmsList.isNotEmpty()) {
                                            Surface(color = colors.accent.copy(alpha = 0.15f), shape = RoundedCornerShape(10.dp)) {
                                                Text(text = "${alarmsList.size} Aktif", color = colors.accent, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp))
                                            }
                                        }
                                    }

                                    Spacer(modifier = Modifier.height(12.dp))

                                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                        listOf(5, 10, 15, 30, 60).forEach { mins ->
                                            val isSelected = alarmPresetMins == mins
                                            Surface(
                                                modifier = Modifier.weight(1f).clickable {
                                                    alarmPresetMins = mins
                                                    createLocalAlarm(mins, "Hızlı Alarm ($mins dk)")
                                                },
                                                color = if (isSelected) colors.accent else colors.surfaceRaised,
                                                border = BorderStroke(1.dp, if (isSelected) colors.accent else colors.border),
                                                shape = RoundedCornerShape(10.dp)
                                            ) {
                                                Text(text = "$mins dk", color = if (isSelected) colors.accentInk else colors.textPrimary, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(vertical = 7.dp), textAlign = TextAlign.Center)
                                            }
                                        }
                                    }

                                    if (alarmsList.isNotEmpty()) {
                                        Spacer(modifier = Modifier.height(10.dp))
                                        alarmsList.take(3).forEach { alarm ->
                                            val timeStr = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(alarm.timestamp))
                                            val remMins = ((alarm.timestamp - nowMillis) / 60000).coerceAtLeast(0)

                                            Row(
                                                modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp).background(colors.surfaceRaised, RoundedCornerShape(8.dp)).padding(horizontal = 10.dp, vertical = 6.dp),
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.SpaceBetween
                                            ) {
                                                Row(verticalAlignment = Alignment.CenterVertically) {
                                                    Text(text = timeStr, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = colors.accent)
                                                    Spacer(modifier = Modifier.width(6.dp))
                                                    Text(text = "($remMins dk kaldı)", fontSize = 11.sp, color = colors.textMuted)
                                                }
                                                IconButton(onClick = { cancelLocalAlarm(alarm.id) }, modifier = Modifier.size(24.dp)) {
                                                    Icon(imageVector = Icons.Rounded.Delete, contentDescription = "Sil", tint = colors.danger, modifier = Modifier.size(14.dp))
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            // PC'ye Anlık Bildirim
                            item {
                                GlassCard(modifier = Modifier.fillMaxWidth()) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Box(modifier = Modifier.size(34.dp).background(colors.accent.copy(alpha = 0.14f), CircleShape), contentAlignment = Alignment.Center) {
                                            Icon(imageVector = Icons.Rounded.NotificationsActive, contentDescription = null, tint = colors.accent, modifier = Modifier.size(18.dp))
                                        }
                                        Spacer(modifier = Modifier.width(10.dp))
                                        Text(text = "PC'ye Anlık Bildirim Gönder", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = colors.textPrimary)
                                    }

                                    Spacer(modifier = Modifier.height(10.dp))

                                    OutlinedTextField(
                                        value = notifMessage,
                                        onValueChange = { notifMessage = it },
                                        modifier = Modifier.fillMaxWidth(),
                                        placeholder = { Text("PC ekranında açılacak bildirim...", color = colors.textFaint, fontSize = 12.sp) },
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

                                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                            Switch(checked = notifUrgent, onCheckedChange = { notifUrgent = it }, colors = SwitchDefaults.colors(checkedThumbColor = colors.accent, checkedTrackColor = colors.surfaceRaised))
                                            Text(text = "Acil Sesli Çal", fontSize = 11.sp, color = if (notifUrgent) colors.accent else colors.textMuted)
                                        }

                                        Button(
                                            onClick = { sendInstantNotification() },
                                            enabled = notifMessage.isNotBlank() && !isSendingNotif,
                                            colors = ButtonDefaults.buttonColors(containerColor = colors.accent, contentColor = colors.accentInk),
                                            shape = RoundedCornerShape(10.dp)
                                        ) {
                                            Icon(imageVector = Icons.Rounded.Send, contentDescription = null, modifier = Modifier.size(14.dp))
                                            Spacer(modifier = Modifier.width(4.dp))
                                            Text(text = "Gönder", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                        }
                                    }
                                }
                            }
                        }
                    }

                    NavTab.NOTES -> {
                        // TAB 2: NOTLAR (PC Defter Vault)
                        DefterScreen(
                            target = target,
                            apiClient = apiClient,
                            notes = notesList,
                            onNotesUpdated = { updated -> notesList = updated }
                        )
                    }

                    NavTab.TRANSFER -> {
                        // TAB 3: DOSYA AKTARMA (LocalSend & Pano)
                        TransferScreen(
                            target = target,
                            apiClient = apiClient,
                            transfers = transfers,
                            onTransfersUpdated = { updated -> transfers = updated }
                        )
                    }
                }
            }

            // 3. Floating Bottom Nav Bar (3 Tabs: Anasayfa, Notlar, Dosya Aktarma)
            BottomNavBar(
                selectedTab = currentTab,
                onTabSelected = { tab -> currentTab = tab }
            )
        }

        // Floating Action Button (Instant Shortcuts)
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
