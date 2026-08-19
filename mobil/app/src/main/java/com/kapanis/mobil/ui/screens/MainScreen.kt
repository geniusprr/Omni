package com.kapanis.mobil.ui.screens

import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Alarm
import androidx.compose.material.icons.rounded.AlarmAdd
import androidx.compose.material.icons.rounded.Cloud
import androidx.compose.material.icons.rounded.CloudDone
import androidx.compose.material.icons.rounded.CloudOff
import androidx.compose.material.icons.rounded.ContentPaste
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Devices
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.NotificationsActive
import androidx.compose.material.icons.rounded.Pin
import androidx.compose.material.icons.rounded.PowerSettingsNew
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.RestartAlt
import androidx.compose.material.icons.rounded.Send
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material.icons.rounded.SwapHoriz
import androidx.compose.material.icons.rounded.Timer
import androidx.compose.material.icons.rounded.UploadFile
import androidx.compose.material.icons.rounded.Wifi
import androidx.compose.material.icons.rounded.WifiOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
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
import com.kapanis.mobil.ui.components.GlassCard
import com.kapanis.mobil.ui.components.QuickActionFab
import com.kapanis.mobil.ui.theme.AccentBlue
import com.kapanis.mobil.ui.theme.AccentInk
import com.kapanis.mobil.ui.theme.DangerRed
import com.kapanis.mobil.ui.theme.DarkPaper
import com.kapanis.mobil.ui.theme.DarkSurface
import com.kapanis.mobil.ui.theme.DarkSurfaceRaised
import com.kapanis.mobil.ui.theme.InkPrimary
import com.kapanis.mobil.ui.theme.RuleColor
import com.kapanis.mobil.ui.theme.SuccessGreen
import com.kapanis.mobil.ui.theme.TextFaint
import com.kapanis.mobil.ui.theme.TextMuted
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
    initialTarget: ConnectionTarget? = null
) {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val scope = rememberCoroutineScope()

    // Mode & Target State
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

    // Power Slider Duration (Minutes)
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

    // Media & File Launchers
    val photoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null && target.isConnected) {
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
        if (uri != null && target.isConnected) {
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

    // 1-second interval for live countdown
    LaunchedEffect(Unit) {
        while (isActive) {
            nowMillis = System.currentTimeMillis()
            delay(1000)
        }
    }

    // Periodic synchronization loop (2.5s) for Live Timer & Alarms
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
                        "shutdown" -> "Kapatma başlatıldı (${durationSecs / 60} dk)"
                        "restart" -> "Yeniden başlatma planlandı (${durationSecs / 60} dk)"
                        else -> "Zamanlayıcı iptal edildi"
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
                        "shutdown" -> "Bulut kapatma komutu gönderildi (${durationSecs / 60} dk)"
                        "restart" -> "Bulut yeniden başlatma komutu gönderildi"
                        else -> "Bulut komutu: Sayaç iptal edildi"
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
                Toast.makeText(context, "Not PC'ye kaydedildi ✓", Toast.LENGTH_SHORT).show()
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
            .background(DarkPaper)
            .statusBarsPadding()
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // 1. TOP HEADER & CONNECTION BAR
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "kapanış.",
                            fontSize = 22.sp,
                            fontWeight = FontWeight.Black,
                            color = InkPrimary,
                            letterSpacing = (-0.5).sp
                        )
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.clickable { showPairingModal = true }
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(8.dp)
                                    .background(
                                        color = if (mode == ConnectionMode.LOCAL && target.isConnected) SuccessGreen
                                                else if (mode == ConnectionMode.ONLINE && isOnlineConnected) SuccessGreen
                                                else DangerRed,
                                        shape = CircleShape
                                    )
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = if (mode == ConnectionMode.LOCAL) {
                                    if (target.isConnected) "Yerel Wi-Fi · ${target.deviceName}"
                                    else "Yerel Wi-Fi · Bağlantı Bekleniyor"
                                } else {
                                    if (isOnlineConnected) "Bulut · ${prefs.deviceName}"
                                    else "Bulut · Çevrimdışı"
                                },
                                fontSize = 12.sp,
                                color = TextMuted,
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }

                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Mode Switcher Pill
                        Surface(
                            color = DarkSurfaceRaised,
                            shape = RoundedCornerShape(20.dp),
                            modifier = Modifier.clickable {
                                val next = if (mode == ConnectionMode.LOCAL) ConnectionMode.ONLINE else ConnectionMode.LOCAL
                                mode = next
                                prefs.mode = next
                            }
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    imageVector = if (mode == ConnectionMode.LOCAL) Icons.Rounded.Wifi else Icons.Rounded.Cloud,
                                    contentDescription = null,
                                    tint = if (mode == ConnectionMode.LOCAL) AccentBlue else Color(0xFF10B981),
                                    modifier = Modifier.size(14.dp)
                                )
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(
                                    text = if (mode == ConnectionMode.LOCAL) "Yerel" else "Bulut",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = InkPrimary
                                )
                                Spacer(modifier = Modifier.width(2.dp))
                                Icon(imageVector = Icons.Rounded.SwapHoriz, contentDescription = null, tint = TextFaint, modifier = Modifier.size(12.dp))
                            }
                        }

                        // Devices & Wi-Fi Details Button
                        IconButton(
                            onClick = { showPairingModal = true },
                            modifier = Modifier
                                .size(36.dp)
                                .background(DarkSurfaceRaised, CircleShape)
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Devices,
                                contentDescription = "Eşleşme & Cihazlar",
                                tint = AccentBlue,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                }
            }

            // 2. HERO STATUS / LIVE COUNTDOWN CONTAINER
            item {
                val hasActiveTimer = activeTimer != null && (activeTimer!!.targetAt > nowMillis)
                val remainingSeconds = if (hasActiveTimer) ((activeTimer!!.targetAt - nowMillis) / 1000).coerceAtLeast(0) else 0L

                val hours = remainingSeconds / 3600
                val minutes = (remainingSeconds % 3600) / 60
                val seconds = remainingSeconds % 60
                val timeFormatted = String.format(Locale.getDefault(), "%02d:%02d:%02d", hours, minutes, seconds)

                GlassCard(
                    modifier = Modifier.fillMaxWidth(),
                    backgroundColor = if (hasActiveTimer) DarkSurfaceRaised else DarkSurface
                ) {
                    if (hasActiveTimer) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 6.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Surface(
                                color = AccentBlue.copy(alpha = 0.15f),
                                shape = RoundedCornerShape(12.dp)
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(6.dp)
                                            .background(AccentBlue, CircleShape)
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = if (activeTimer?.action == "restart") "Yeniden Başlatılacak" else "Bilgisayar Kapanacak",
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = AccentBlue
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(10.dp))

                            Text(
                                text = timeFormatted,
                                fontSize = 44.sp,
                                fontWeight = FontWeight.Black,
                                color = InkPrimary,
                                letterSpacing = 1.sp
                            )

                            val targetDate = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date(activeTimer!!.targetAt))
                            Text(
                                text = "Hedef Saat: $targetDate",
                                fontSize = 12.sp,
                                color = TextMuted
                            )

                            Spacer(modifier = Modifier.height(14.dp))

                            Button(
                                onClick = { sendPower("cancel", 0) },
                                enabled = !isSendingPowerCmd,
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = DangerRed.copy(alpha = 0.2f),
                                    contentColor = DangerRed
                                ),
                                shape = RoundedCornerShape(8.dp),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(42.dp)
                            ) {
                                Icon(imageVector = Icons.Rounded.Stop, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(text = "Sayacı İptal Et", fontSize = 13.sp, fontWeight = FontWeight.Bold)
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
                                            .size(36.dp)
                                            .background(AccentBlue.copy(alpha = 0.15f), CircleShape),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Icon(imageVector = Icons.Rounded.Timer, contentDescription = null, tint = AccentBlue, modifier = Modifier.size(20.dp))
                                    }
                                    Spacer(modifier = Modifier.width(10.dp))
                                    Column {
                                        Text(
                                            text = "Hızlı Zamanlayıcı",
                                            fontSize = 14.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = InkPrimary
                                        )
                                        Text(
                                            text = "Tek tıkla kapatma sayacı kurun",
                                            fontSize = 11.sp,
                                            color = TextMuted
                                        )
                                    }
                                }

                                Surface(
                                    color = DarkSurfaceRaised,
                                    shape = RoundedCornerShape(6.dp)
                                ) {
                                    Text(
                                        text = "Hazır",
                                        color = SuccessGreen,
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(14.dp))

                            // One-tap quick presets
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                listOf(15, 30, 45, 60, 120).forEach { mins ->
                                    Button(
                                        onClick = { sendPower("shutdown", mins * 60L) },
                                        enabled = !isSendingPowerCmd,
                                        colors = ButtonDefaults.buttonColors(
                                            containerColor = DarkSurfaceRaised,
                                            contentColor = InkPrimary
                                        ),
                                        shape = RoundedCornerShape(8.dp),
                                        modifier = Modifier.weight(1f),
                                        contentPadding = PaddingValues(horizontal = 2.dp, vertical = 8.dp)
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

            // 3. GÜÇ YÖNETİMİ (POWER MANAGEMENT CONTAINER)
            item {
                GlassCard(
                    modifier = Modifier.fillMaxWidth(),
                    backgroundColor = DarkSurface
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(32.dp)
                                    .background(AccentBlue.copy(alpha = 0.15f), CircleShape),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(imageVector = Icons.Rounded.PowerSettingsNew, contentDescription = null, tint = AccentBlue, modifier = Modifier.size(18.dp))
                            }
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "Özel Güç Yönetimi",
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                color = InkPrimary
                            )
                        }

                        Text(
                            text = "${selectedMinutes.toInt()} Dakika",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            color = AccentBlue
                        )
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    Slider(
                        value = selectedMinutes,
                        onValueChange = { selectedMinutes = it },
                        valueRange = 1f..360f,
                        colors = SliderDefaults.colors(
                            thumbColor = AccentBlue,
                            activeTrackColor = AccentBlue,
                            inactiveTrackColor = DarkSurfaceRaised
                        )
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(text = "1 dk", fontSize = 10.sp, color = TextFaint)
                        Text(text = "1 saat", fontSize = 10.sp, color = TextFaint)
                        Text(text = "3 saat", fontSize = 10.sp, color = TextFaint)
                        Text(text = "6 saat", fontSize = 10.sp, color = TextFaint)
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Button(
                            onClick = { sendPower("shutdown", (selectedMinutes.toLong() * 60)) },
                            enabled = !isSendingPowerCmd,
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = AccentBlue,
                                contentColor = AccentInk
                            ),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Icon(imageVector = Icons.Rounded.PowerSettingsNew, contentDescription = null, modifier = Modifier.size(14.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(text = "Kapatmayı Başlat", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }

                        Button(
                            onClick = { sendPower("restart", (selectedMinutes.toLong() * 60)) },
                            enabled = !isSendingPowerCmd,
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = DarkSurfaceRaised,
                                contentColor = InkPrimary
                            ),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Icon(imageVector = Icons.Rounded.RestartAlt, contentDescription = null, modifier = Modifier.size(14.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(text = "Yeniden Başlat", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            // 4. PC ALARMLARI (PC ALARMS CONTAINER)
            item {
                GlassCard(
                    modifier = Modifier.fillMaxWidth(),
                    backgroundColor = DarkSurface
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(32.dp)
                                    .background(AccentBlue.copy(alpha = 0.15f), CircleShape),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(imageVector = Icons.Rounded.Alarm, contentDescription = null, tint = AccentBlue, modifier = Modifier.size(18.dp))
                            }
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "PC Alarmları",
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                color = InkPrimary
                            )
                        }

                        if (alarmsList.isNotEmpty()) {
                            Surface(
                                color = DarkSurfaceRaised,
                                shape = RoundedCornerShape(6.dp)
                            ) {
                                Text(
                                    text = "${alarmsList.size} Aktif",
                                    color = AccentBlue,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }
                        }
                    }

                    Text(
                        text = "Bilgisayar ekranında tam zamanında sesli alarm çalar.",
                        fontSize = 11.sp,
                        color = TextMuted,
                        modifier = Modifier.padding(top = 2.dp, bottom = 10.dp)
                    )

                    // Alarm preset buttons
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        listOf(5, 10, 15, 30, 60).forEach { mins ->
                            val isSelected = alarmPresetMins == mins
                            Surface(
                                modifier = Modifier
                                    .weight(1f)
                                    .clickable { alarmPresetMins = mins },
                                color = if (isSelected) AccentBlue else DarkSurfaceRaised,
                                shape = RoundedCornerShape(6.dp)
                            ) {
                                Text(
                                    text = "$mins dk",
                                    color = if (isSelected) AccentInk else InkPrimary,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(vertical = 6.dp),
                                    textAlign = TextAlign.Center
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        OutlinedTextField(
                            value = alarmNoteInput,
                            onValueChange = { alarmNoteInput = it },
                            modifier = Modifier.weight(1f),
                            placeholder = { Text("Alarm notu (İsteğe bağlı)", color = TextFaint, fontSize = 12.sp) },
                            singleLine = true,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedContainerColor = DarkSurfaceRaised,
                                unfocusedContainerColor = DarkSurfaceRaised,
                                focusedBorderColor = AccentBlue,
                                unfocusedBorderColor = RuleColor,
                                focusedTextColor = InkPrimary,
                                unfocusedTextColor = InkPrimary
                            ),
                            shape = RoundedCornerShape(8.dp)
                        )

                        Button(
                            onClick = { createLocalAlarm(alarmPresetMins, alarmNoteInput) },
                            enabled = !isCreatingAlarm,
                            colors = ButtonDefaults.buttonColors(
                                containerColor = AccentBlue,
                                contentColor = AccentInk
                            ),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.height(48.dp)
                        ) {
                            if (isCreatingAlarm) {
                                CircularProgressIndicator(modifier = Modifier.size(16.dp), color = AccentInk, strokeWidth = 2.dp)
                            } else {
                                Icon(imageVector = Icons.Rounded.AlarmAdd, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("Kur", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }

                    // Active Alarms List
                    if (alarmsList.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(10.dp))
                        alarmsList.forEach { alarm ->
                            val timeStr = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(alarm.timestamp))
                            val remMins = ((alarm.timestamp - nowMillis) / 60000).coerceAtLeast(0)

                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 3.dp)
                                    .background(DarkSurfaceRaised, RoundedCornerShape(6.dp))
                                    .padding(horizontal = 10.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = "$timeStr (${remMins} dk kaldı)",
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = AccentBlue
                                    )
                                    if (alarm.note.isNotEmpty()) {
                                        Text(text = alarm.note, fontSize = 11.sp, color = InkPrimary)
                                    }
                                }

                                IconButton(
                                    onClick = { cancelLocalAlarm(alarm.id) },
                                    modifier = Modifier.size(28.dp)
                                ) {
                                    Icon(imageVector = Icons.Rounded.Delete, contentDescription = "İptal", tint = DangerRed, modifier = Modifier.size(14.dp))
                                }
                            }
                        }
                    }
                }
            }

            // 5. DOSYA & FOTOĞRAF TRANSFERİ (LOCALSEND CONTAINER)
            item {
                GlassCard(
                    modifier = Modifier.fillMaxWidth(),
                    backgroundColor = DarkSurface
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(32.dp)
                                    .background(AccentBlue.copy(alpha = 0.15f), CircleShape),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(imageVector = Icons.Rounded.UploadFile, contentDescription = null, tint = AccentBlue, modifier = Modifier.size(18.dp))
                            }
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "Dosya & Fotoğraf Transferi",
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                color = InkPrimary
                            )
                        }
                    }

                    Text(
                        text = "Telefonunuzdaki fotoğraf ve dosyaları kablosuz PC'ye gönderin.",
                        fontSize = 11.sp,
                        color = TextMuted,
                        modifier = Modifier.padding(top = 2.dp, bottom = 10.dp)
                    )

                    if (isUploading) {
                        Column(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                            LinearProgressIndicator(
                                progress = { uploadProgress },
                                modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)),
                                color = AccentBlue,
                                trackColor = DarkSurfaceRaised
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(text = "Aktarılıyor... %${(uploadProgress * 100).toInt()}", fontSize = 10.sp, color = AccentBlue)
                        }
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Button(
                            onClick = { photoPickerLauncher.launch("image/*") },
                            enabled = !isUploading,
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = DarkSurfaceRaised,
                                contentColor = InkPrimary
                            ),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Icon(imageVector = Icons.Rounded.Image, contentDescription = null, modifier = Modifier.size(14.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(text = "Fotoğraf Gönder", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }

                        Button(
                            onClick = { filePickerLauncher.launch("*/*") },
                            enabled = !isUploading,
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = DarkSurfaceRaised,
                                contentColor = InkPrimary
                            ),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Icon(imageVector = Icons.Rounded.FolderOpen, contentDescription = null, modifier = Modifier.size(14.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(text = "Dosya Gönder", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    Button(
                        onClick = { syncClipboardToPc() },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = DarkSurfaceRaised,
                            contentColor = InkPrimary
                        ),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Icon(imageVector = Icons.Rounded.ContentPaste, contentDescription = null, modifier = Modifier.size(14.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(text = "Telefonda Kopyalanan Panoyu PC'ye Aktar", fontSize = 11.sp, fontWeight = FontWeight.Medium)
                    }

                    if (transfers.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(10.dp))
                        transfers.take(3).forEach { tr ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 2.dp)
                                    .background(DarkSurfaceRaised, RoundedCornerShape(6.dp))
                                    .padding(horizontal = 8.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    imageVector = if (tr.isImage) Icons.Rounded.Image else Icons.Rounded.Description,
                                    contentDescription = null,
                                    tint = AccentBlue,
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = tr.filename,
                                    fontSize = 11.sp,
                                    color = InkPrimary,
                                    maxLines = 1,
                                    modifier = Modifier.weight(1f)
                                )
                                Text(
                                    text = "${tr.size / 1024} KB",
                                    fontSize = 10.sp,
                                    color = TextMuted
                                )
                            }
                        }
                    }
                }
            }

            // 6. DEFTER & NOTLAR CONTAINER
            item {
                GlassCard(
                    modifier = Modifier.fillMaxWidth(),
                    backgroundColor = DarkSurface
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(32.dp)
                                    .background(AccentBlue.copy(alpha = 0.15f), CircleShape),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(imageVector = Icons.Rounded.Description, contentDescription = null, tint = AccentBlue, modifier = Modifier.size(18.dp))
                            }
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "Defter & PC Notları",
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                color = InkPrimary
                            )
                        }

                        if (notesList.isNotEmpty()) {
                            Text(
                                text = "${notesList.size} Not",
                                fontSize = 11.sp,
                                color = TextMuted
                            )
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
                            onValueChange = { noteInput = it },
                            modifier = Modifier.weight(1f),
                            placeholder = { Text("PC'ye hızlı not kaydet...", color = TextFaint, fontSize = 12.sp) },
                            singleLine = true,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedContainerColor = DarkSurfaceRaised,
                                unfocusedContainerColor = DarkSurfaceRaised,
                                focusedBorderColor = AccentBlue,
                                unfocusedBorderColor = RuleColor,
                                focusedTextColor = InkPrimary,
                                unfocusedTextColor = InkPrimary
                            ),
                            shape = RoundedCornerShape(8.dp)
                        )

                        Button(
                            onClick = { saveNoteToPc() },
                            enabled = noteInput.isNotBlank() && !isSavingNote,
                            colors = ButtonDefaults.buttonColors(
                                containerColor = AccentBlue,
                                contentColor = AccentInk
                            ),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.height(48.dp)
                        ) {
                            if (isSavingNote) {
                                CircularProgressIndicator(modifier = Modifier.size(16.dp), color = AccentInk, strokeWidth = 2.dp)
                            } else {
                                Icon(imageVector = Icons.Rounded.Send, contentDescription = null, modifier = Modifier.size(14.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("Kaydet", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }

                    if (notesList.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(10.dp))
                        notesList.take(3).forEach { note ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 2.dp)
                                    .background(DarkSurfaceRaised, RoundedCornerShape(6.dp))
                                    .padding(horizontal = 10.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                if (note.pinned) {
                                    Icon(imageVector = Icons.Rounded.Pin, contentDescription = null, tint = AccentBlue, modifier = Modifier.size(12.dp))
                                    Spacer(modifier = Modifier.width(4.dp))
                                }
                                Text(
                                    text = note.content,
                                    fontSize = 11.sp,
                                    color = InkPrimary,
                                    maxLines = 2,
                                    modifier = Modifier.weight(1f)
                                )
                            }
                        }
                    }
                }
            }

            // 7. PC'YE ANLIK BİLDİRİM GÖNDER CONTAINER
            item {
                GlassCard(
                    modifier = Modifier.fillMaxWidth(),
                    backgroundColor = DarkSurface
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(32.dp)
                                    .background(AccentBlue.copy(alpha = 0.15f), CircleShape),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(imageVector = Icons.Rounded.NotificationsActive, contentDescription = null, tint = AccentBlue, modifier = Modifier.size(18.dp))
                            }
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "PC'ye Anlık Bildirim Gönder",
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                color = InkPrimary
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    OutlinedTextField(
                        value = notifTitle,
                        onValueChange = { notifTitle = it },
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = { Text("Başlık (İsteğe bağlı)", color = TextFaint, fontSize = 12.sp) },
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = DarkSurfaceRaised,
                            unfocusedContainerColor = DarkSurfaceRaised,
                            focusedBorderColor = AccentBlue,
                            unfocusedBorderColor = RuleColor,
                            focusedTextColor = InkPrimary,
                            unfocusedTextColor = InkPrimary
                        ),
                        shape = RoundedCornerShape(8.dp)
                    )

                    Spacer(modifier = Modifier.height(6.dp))

                    OutlinedTextField(
                        value = notifMessage,
                        onValueChange = { notifMessage = it },
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = { Text("Bildirim mesajı...", color = TextFaint, fontSize = 12.sp) },
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = DarkSurfaceRaised,
                            unfocusedContainerColor = DarkSurfaceRaised,
                            focusedBorderColor = AccentBlue,
                            unfocusedBorderColor = RuleColor,
                            focusedTextColor = InkPrimary,
                            unfocusedTextColor = InkPrimary
                        ),
                        shape = RoundedCornerShape(8.dp),
                        maxLines = 3
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Switch(
                                checked = notifUrgent,
                                onCheckedChange = { notifUrgent = it },
                                colors = SwitchDefaults.colors(
                                    checkedThumbColor = AccentBlue,
                                    checkedTrackColor = DarkSurfaceRaised
                                )
                            )
                            Text(
                                text = "Acil Sesli Çal",
                                fontSize = 11.sp,
                                color = if (notifUrgent) AccentBlue else TextMuted
                            )
                        }

                        Button(
                            onClick = { sendInstantNotification() },
                            enabled = notifMessage.isNotBlank() && !isSendingNotif,
                            colors = ButtonDefaults.buttonColors(
                                containerColor = AccentBlue,
                                contentColor = AccentInk
                            ),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            if (isSendingNotif) {
                                CircularProgressIndicator(modifier = Modifier.size(14.dp), color = AccentInk, strokeWidth = 2.dp)
                            } else {
                                Icon(imageVector = Icons.Rounded.NotificationsActive, contentDescription = null, modifier = Modifier.size(14.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(text = "Gönder", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }

            // Bottom space for FAB clearance
            item {
                Spacer(modifier = Modifier.height(72.dp))
            }
        }

        // Floating Action Button (FAB)
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

        // Pairing Details Modal
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
