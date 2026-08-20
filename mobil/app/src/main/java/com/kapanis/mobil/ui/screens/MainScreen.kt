package com.kapanis.mobil.ui.screens

import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
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
import androidx.compose.material.icons.rounded.AccessTime
import androidx.compose.material.icons.rounded.Alarm
import androidx.compose.material.icons.rounded.AlarmAdd
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ContentPaste
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.Laptop
import androidx.compose.material.icons.rounded.MoreTime
import androidx.compose.material.icons.rounded.NotificationsActive
import androidx.compose.material.icons.rounded.PowerSettingsNew
import androidx.compose.material.icons.rounded.RestartAlt
import androidx.compose.material.icons.rounded.Send
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material.icons.rounded.Timer
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
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

    // Active Navigation Tab
    var currentTab by remember { mutableStateOf(NavTab.HOME) }
    var activeEditingVaultNote by remember { mutableStateOf<com.kapanis.mobil.data.vault.VaultNote?>(null) }
    var vaultNotesCount by remember { mutableIntStateOf(0) }
    var isSyncingVaultNotes by remember { mutableStateOf(false) }
    var showDefterQuickSwitcher by remember { mutableStateOf(false) }
    var showDefterBacklinksModal by remember { mutableStateOf(false) }
    var deleteRequestedNotePath by remember { mutableStateOf<String?>(null) }

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

    // Remote Timer State
    var nowMillis by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var activeTimer by remember { mutableStateOf<RemoteTimerState?>(null) }
    var isSendingPowerCmd by remember { mutableStateOf(false) }

    // Custom Timer Dialog
    var showCustomTimerDialog by remember { mutableStateOf(false) }
    var customTimerMins by remember { mutableFloatStateOf(45f) }

    // Alarms State
    var alarmsList by remember { mutableStateOf<List<AlarmItem>>(emptyList()) }
    var isCreatingAlarm by remember { mutableStateOf(false) }
    var showAlarmDialog by remember { mutableStateOf(false) }
    var dialogAlarmMins by remember { mutableIntStateOf(15) }
    var dialogAlarmNote by remember { mutableStateOf("") }

    // Transfers State
    var transfers by remember { mutableStateOf<List<TransferItem>>(emptyList()) }
    var isUploading by remember { mutableStateOf(false) }
    var uploadProgress by remember { mutableFloatStateOf(0f) }

    // Notes State
    var notesList by remember { mutableStateOf<List<NoteItem>>(emptyList()) }

    // Quick Notification Dialog State
    var showNotifDialog by remember { mutableStateOf(false) }
    var notifTitle by remember { mutableStateOf("") }
    var notifMessage by remember { mutableStateOf("") }
    var notifUrgent by remember { mutableStateOf(false) }
    var isSendingNotif by remember { mutableStateOf(false) }

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

    // 1-second interval ticker for active countdown
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

    // Fast Power Command Execution
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
                if (durationSecs == 0L) "Yeniden başlatma başlatıldı" else "Yeniden başlatma planlandı (${durationSecs / 60} dk)"
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

    fun sendInstantNotification() {
        val msg = notifMessage.trim()
        if (msg.isEmpty() || isSendingNotif) return
        isSendingNotif = true
        Toast.makeText(context, "Bildirim PC ekranında gösterildi ✓", Toast.LENGTH_SHORT).show()
        val titleToSend = notifTitle.trim().ifEmpty { "kapanış. Mobil Bildirim" }
        notifTitle = ""
        notifMessage = ""
        showNotifDialog = false

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

    val isConnected = if (mode == ConnectionMode.LOCAL) target.isConnected else isOnlineConnected
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
            // 1. Sleek Minimal Unified TopBar
            TopBar(
                currentTab = currentTab,
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
                onOpenPairingModal = { showPairingModal = true },
                notesCount = vaultNotesCount,
                activeEditingNote = activeEditingVaultNote,
                isSyncingNotes = isSyncingVaultNotes,
                onBackFromNote = { activeEditingVaultNote = null },
                onSearchNotes = { showDefterQuickSwitcher = true },
                onSyncNotes = {
                    if (!isSyncingVaultNotes) {
                        isSyncingVaultNotes = true
                        scope.launch {
                            try {
                                val pcListRes = apiClient.fetchVaultList(target.host, target.port)
                                if (pcListRes.isSuccess) {
                                    val pcNotes = pcListRes.getOrDefault(emptyList())
                                    val repo = com.kapanis.mobil.data.vault.VaultRepository(context)
                                    for (pcNote in pcNotes) {
                                        val readRes = apiClient.readVaultNote(target.host, target.port, pcNote.path)
                                        if (readRes.isSuccess) {
                                            repo.saveNote(pcNote.path, readRes.getOrDefault(""))
                                        }
                                    }
                                    val updated = repo.loadVault()
                                    vaultNotesCount = updated.files.size
                                    Toast.makeText(context, "PC Vault senkronize edildi ✓ (${pcNotes.size} Not)", Toast.LENGTH_SHORT).show()
                                } else {
                                    Toast.makeText(context, "PC'ye bağlanılamadı", Toast.LENGTH_SHORT).show()
                                }
                            } catch (e: Exception) {
                                Toast.makeText(context, "Eşitleme hatası: ${e.message}", Toast.LENGTH_SHORT).show()
                            } finally {
                                isSyncingVaultNotes = false
                            }
                        }
                    }
                },
                onShowBacklinks = { showDefterBacklinksModal = true },
                onDeleteCurrentNote = {
                    if (activeEditingVaultNote != null) {
                        deleteRequestedNotePath = activeEditingVaultNote!!.path
                    }
                }
            )

            // 2. High-speed Animated Tab Contents (50ms instant transition)
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
            ) {
                AnimatedContent(
                    targetState = currentTab,
                    transitionSpec = {
                        (fadeIn(animationSpec = tween(50))).togetherWith(
                            fadeOut(animationSpec = tween(40))
                        )
                    },
                    label = "FastTabTransition"
                ) { tab ->
                    when (tab) {
                        NavTab.HOME -> {
                            // TAB 1: MODERN, SADE & ŞIK ANASAYFA
                            LazyColumn(
                                modifier = Modifier.fillMaxSize(),
                                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 90.dp),
                                verticalArrangement = Arrangement.spacedBy(14.dp)
                            ) {
                                // 1. HERO DURUM & GERİ SAYIM KARTI
                                item {
                                    GlassCard(
                                        modifier = Modifier.fillMaxWidth(),
                                        backgroundColor = if (hasActiveTimer) colors.danger.copy(alpha = if (colors.isDark) 0.12f else 0.08f) else colors.surfaceGlass,
                                        borderColor = if (hasActiveTimer) colors.danger.copy(alpha = 0.35f) else colors.border,
                                        contentPadding = 16.dp
                                    ) {
                                        if (hasActiveTimer) {
                                            // Aktif Geri Sayım Görünümü
                                            Column(
                                                modifier = Modifier.fillMaxWidth(),
                                                horizontalAlignment = Alignment.CenterHorizontally
                                            ) {
                                                Surface(
                                                    color = colors.danger.copy(alpha = 0.16f),
                                                    shape = RoundedCornerShape(20.dp),
                                                    border = BorderStroke(1.dp, colors.danger.copy(alpha = 0.3f))
                                                ) {
                                                    Row(
                                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                                                        verticalAlignment = Alignment.CenterVertically,
                                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                                    ) {
                                                        Box(modifier = Modifier.size(6.dp).background(colors.danger, CircleShape))
                                                        Text(
                                                            text = if (activeTimer?.action == "restart") "PC Yeniden Başlatılacak" else "PC Otomatik Kapanacak",
                                                            fontSize = 11.sp,
                                                            fontWeight = FontWeight.Bold,
                                                            color = colors.danger
                                                        )
                                                    }
                                                }

                                                Spacer(modifier = Modifier.height(10.dp))

                                                Text(
                                                    text = countdownFormatted,
                                                    fontSize = 42.sp,
                                                    fontWeight = FontWeight.Black,
                                                    color = colors.textPrimary,
                                                    letterSpacing = 1.2.sp,
                                                    fontFamily = FontFamily.Monospace
                                                )

                                                val targetDate = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date(activeTimer!!.targetAt))
                                                Text(
                                                    text = "Hedef Kapanış Saati: $targetDate",
                                                    fontSize = 12.sp,
                                                    color = colors.textMuted
                                                )

                                                Spacer(modifier = Modifier.height(12.dp))

                                                Button(
                                                    onClick = { sendPower("cancel", 0) },
                                                    enabled = !isSendingPowerCmd,
                                                    colors = ButtonDefaults.buttonColors(
                                                        containerColor = colors.danger.copy(alpha = 0.18f),
                                                        contentColor = colors.danger
                                                    ),
                                                    border = BorderStroke(1.dp, colors.danger.copy(alpha = 0.35f)),
                                                    shape = RoundedCornerShape(12.dp),
                                                    modifier = Modifier.fillMaxWidth().height(40.dp)
                                                ) {
                                                    Icon(imageVector = Icons.Rounded.Stop, contentDescription = null, modifier = Modifier.size(16.dp))
                                                    Spacer(modifier = Modifier.width(6.dp))
                                                    Text(text = "Sayacı İptal Et", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                                }
                                            }
                                        } else {
                                            // Cihaz Bilgi Kartı
                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Row(
                                                    verticalAlignment = Alignment.CenterVertically,
                                                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                                                ) {
                                                    Box(
                                                        modifier = Modifier
                                                            .size(44.dp)
                                                            .background(colors.accent.copy(alpha = if (colors.isDark) 0.14f else 0.10f), CircleShape),
                                                        contentAlignment = Alignment.Center
                                                    ) {
                                                        Icon(
                                                            imageVector = Icons.Rounded.Laptop,
                                                            contentDescription = null,
                                                            tint = colors.accent,
                                                            modifier = Modifier.size(22.dp)
                                                        )
                                                    }

                                                    Column {
                                                        Text(
                                                            text = if (target.deviceName.isNotEmpty()) target.deviceName else "Masaüstü PC",
                                                            fontSize = 16.sp,
                                                            fontWeight = FontWeight.Bold,
                                                            color = colors.textPrimary
                                                        )
                                                        Text(
                                                            text = if (mode == ConnectionMode.LOCAL) {
                                                                if (isConnected) "Wi-Fi: ${target.host}" else "Yerel ağ aranıyor"
                                                            } else {
                                                                if (isConnected) "Bulut Senkronu Aktif" else "Bulut Bekleniyor"
                                                            },
                                                            fontSize = 11.sp,
                                                            color = colors.textMuted
                                                        )
                                                    }
                                                }

                                                Surface(
                                                    color = if (isConnected) colors.success.copy(alpha = 0.12f) else colors.surfaceRaised,
                                                    shape = RoundedCornerShape(20.dp),
                                                    border = BorderStroke(1.dp, if (isConnected) colors.success.copy(alpha = 0.3f) else colors.border)
                                                ) {
                                                    Row(
                                                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                                                        verticalAlignment = Alignment.CenterVertically,
                                                        horizontalArrangement = Arrangement.spacedBy(5.dp)
                                                    ) {
                                                        Box(
                                                            modifier = Modifier
                                                                .size(6.dp)
                                                                .background(if (isConnected) colors.success else colors.textFaint, CircleShape)
                                                        )
                                                        Text(
                                                            text = if (isConnected) "Bağlı" else "Hazır Değil",
                                                            fontSize = 11.sp,
                                                            fontWeight = FontWeight.SemiBold,
                                                            color = if (isConnected) colors.success else colors.textMuted
                                                        )
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }

                                // 2. HIZLI GÜÇ DÜĞMELERİ (Minimal & Şık Kapatma Barı)
                                item {
                                    Text(
                                        text = "Güç Kontrolleri",
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = colors.textMuted,
                                        modifier = Modifier.padding(start = 4.dp, bottom = 2.dp)
                                    )

                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        // 30 dk Kapat
                                        PowerActionTile(
                                            modifier = Modifier.weight(1f),
                                            icon = Icons.Rounded.Timer,
                                            label = "30 dk",
                                            sublabel = "Kapat",
                                            highlight = true,
                                            onClick = { sendPower("shutdown", 1800) }
                                        )

                                        // 60 dk Kapat
                                        PowerActionTile(
                                            modifier = Modifier.weight(1f),
                                            icon = Icons.Rounded.AccessTime,
                                            label = "60 dk",
                                            sublabel = "Kapat",
                                            onClick = { sendPower("shutdown", 3600) }
                                        )

                                        // Hemen Kapat
                                        PowerActionTile(
                                            modifier = Modifier.weight(1f),
                                            icon = Icons.Rounded.PowerSettingsNew,
                                            label = "Hemen",
                                            sublabel = "Kapat",
                                            onClick = { sendPower("shutdown", 0) }
                                        )

                                        // Yeniden Başlat
                                        PowerActionTile(
                                            modifier = Modifier.weight(1f),
                                            icon = Icons.Rounded.RestartAlt,
                                            label = "Yeniden",
                                            sublabel = "Başlat",
                                            onClick = { sendPower("restart", 0) }
                                        )

                                        // Özel Süre
                                        PowerActionTile(
                                            modifier = Modifier.weight(1f),
                                            icon = Icons.Rounded.MoreTime,
                                            label = "Özel",
                                            sublabel = "Süre",
                                            onClick = { showCustomTimerDialog = true }
                                        )
                                    }
                                }

                                // 3. HIZLI ARAÇLAR (2x2 Zarif Grid)
                                item {
                                    Text(
                                        text = "Hızlı İşlemler",
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = colors.textMuted,
                                        modifier = Modifier.padding(start = 4.dp, top = 4.dp, bottom = 2.dp)
                                    )

                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                                    ) {
                                        // Pano Senkronu
                                        QuickActionTile(
                                            modifier = Modifier.weight(1f),
                                            icon = Icons.Rounded.ContentPaste,
                                            title = "Pano Aktar",
                                            subtitle = "Telefondan PC'ye (Ctrl+V)",
                                            onClick = { syncClipboardToPc() }
                                        )

                                        // Fotoğraf Gönder
                                        QuickActionTile(
                                            modifier = Modifier.weight(1f),
                                            icon = Icons.Rounded.Image,
                                            title = "Fotoğraf Gönder",
                                            subtitle = "PC'ye doğrudan aktar",
                                            onClick = { photoPickerLauncher.launch("image/*") }
                                        )
                                    }

                                    Spacer(modifier = Modifier.height(10.dp))

                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                                    ) {
                                        // Hızlı Alarm
                                        QuickActionTile(
                                            modifier = Modifier.weight(1f),
                                            icon = Icons.Rounded.Alarm,
                                            title = "PC Alarmı",
                                            subtitle = "Sesli hatırlatıcı kur",
                                            onClick = { showAlarmDialog = true }
                                        )

                                        // Anlık Bildirim
                                        QuickActionTile(
                                            modifier = Modifier.weight(1f),
                                            icon = Icons.Rounded.NotificationsActive,
                                            title = "Bildirim Gönder",
                                            subtitle = "PC monitöründe mesaj aç",
                                            onClick = { showNotifDialog = true }
                                        )
                                    }
                                }

                                // 4. AKTİF ALARMLAR WİDGET (Varsa Göster)
                                if (alarmsList.isNotEmpty()) {
                                    item {
                                        GlassCard(
                                            modifier = Modifier.fillMaxWidth(),
                                            contentPadding = 14.dp
                                        ) {
                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Row(verticalAlignment = Alignment.CenterVertically) {
                                                    Icon(
                                                        imageVector = Icons.Rounded.Alarm,
                                                        contentDescription = null,
                                                        tint = colors.accent,
                                                        modifier = Modifier.size(16.dp)
                                                    )
                                                    Spacer(modifier = Modifier.width(8.dp))
                                                    Text(
                                                        text = "Aktif PC Alarmları",
                                                        fontSize = 13.sp,
                                                        fontWeight = FontWeight.Bold,
                                                        color = colors.textPrimary
                                                    )
                                                }

                                                Surface(
                                                    color = colors.accent.copy(alpha = 0.14f),
                                                    shape = RoundedCornerShape(8.dp)
                                                ) {
                                                    Text(
                                                        text = "${alarmsList.size} Aktif",
                                                        color = colors.accent,
                                                        fontSize = 10.sp,
                                                        fontWeight = FontWeight.Bold,
                                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                                    )
                                                }
                                            }

                                            Spacer(modifier = Modifier.height(8.dp))

                                            alarmsList.take(3).forEach { alarm ->
                                                val timeStr = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(alarm.timestamp))
                                                val remMins = ((alarm.timestamp - nowMillis) / 60000).coerceAtLeast(0)

                                                Row(
                                                    modifier = Modifier
                                                        .fillMaxWidth()
                                                        .padding(vertical = 3.dp)
                                                        .background(colors.surfaceRaised, RoundedCornerShape(10.dp))
                                                        .padding(horizontal = 10.dp, vertical = 7.dp),
                                                    verticalAlignment = Alignment.CenterVertically,
                                                    horizontalArrangement = Arrangement.SpaceBetween
                                                ) {
                                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                                        Text(
                                                            text = timeStr,
                                                            fontSize = 13.sp,
                                                            fontWeight = FontWeight.Bold,
                                                            color = colors.accent
                                                        )
                                                        Spacer(modifier = Modifier.width(8.dp))
                                                        Text(
                                                            text = if (alarm.note.isNotEmpty()) alarm.note else "($remMins dk kaldı)",
                                                            fontSize = 11.sp,
                                                            color = colors.textMuted,
                                                            maxLines = 1,
                                                            overflow = TextOverflow.Ellipsis
                                                        )
                                                    }

                                                    IconButton(
                                                        onClick = { cancelLocalAlarm(alarm.id) },
                                                        modifier = Modifier.size(24.dp)
                                                    ) {
                                                        Icon(
                                                            imageVector = Icons.Rounded.Delete,
                                                            contentDescription = "Sil",
                                                            tint = colors.danger,
                                                            modifier = Modifier.size(14.dp)
                                                        )
                                                    }
                                                }
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
                                activeEditingNote = activeEditingVaultNote,
                                onEditingNoteChanged = { note -> activeEditingVaultNote = note },
                                showQuickSwitcher = showDefterQuickSwitcher,
                                onCloseQuickSwitcher = { showDefterQuickSwitcher = false },
                                showBacklinksModal = showDefterBacklinksModal,
                                onCloseBacklinksModal = { showDefterBacklinksModal = false },
                                deleteRequestedPath = deleteRequestedNotePath,
                                onClearDeleteRequest = { deleteRequestedNotePath = null },
                                onNotesCountChanged = { count -> vaultNotesCount = count }
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
            }

            // 3. Floating Bottom Nav Bar (Hidden when editing a note)
            if (activeEditingVaultNote == null) {
                BottomNavBar(
                    selectedTab = currentTab,
                    onTabSelected = { tab -> currentTab = tab }
                )
            }
        }

        // Custom Timer Dialog
        if (showCustomTimerDialog) {
            Dialog(onDismissRequest = { showCustomTimerDialog = false }) {
                Surface(
                    shape = RoundedCornerShape(18.dp),
                    color = colors.paper,
                    border = BorderStroke(1.dp, colors.border),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(18.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Özel Kapanış Süresi",
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold,
                                color = colors.textPrimary
                            )
                            IconButton(
                                onClick = { showCustomTimerDialog = false },
                                modifier = Modifier.size(28.dp)
                            ) {
                                Icon(imageVector = Icons.Rounded.Close, contentDescription = "Kapat", tint = colors.textMuted)
                            }
                        }

                        Spacer(modifier = Modifier.height(14.dp))

                        Text(
                            text = "${customTimerMins.toInt()} Dakika",
                            fontSize = 28.sp,
                            fontWeight = FontWeight.Black,
                            color = colors.accent,
                            modifier = Modifier.align(Alignment.CenterHorizontally)
                        )

                        Slider(
                            value = customTimerMins,
                            onValueChange = { customTimerMins = it },
                            valueRange = 1f..360f,
                            colors = SliderDefaults.colors(
                                thumbColor = colors.accent,
                                activeTrackColor = colors.accent,
                                inactiveTrackColor = colors.surfaceRaised
                            )
                        )

                        Spacer(modifier = Modifier.height(14.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Button(
                                onClick = {
                                    sendPower("shutdown", (customTimerMins.toLong() * 60))
                                    showCustomTimerDialog = false
                                },
                                modifier = Modifier.weight(1f).height(42.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = colors.accent,
                                    contentColor = colors.accentInk
                                ),
                                shape = RoundedCornerShape(10.dp)
                            ) {
                                Text(text = "Kapat", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }

                            Button(
                                onClick = {
                                    sendPower("restart", (customTimerMins.toLong() * 60))
                                    showCustomTimerDialog = false
                                },
                                modifier = Modifier.weight(1f).height(42.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = colors.surfaceRaised,
                                    contentColor = colors.textPrimary
                                ),
                                border = BorderStroke(1.dp, colors.border),
                                shape = RoundedCornerShape(10.dp)
                            ) {
                                Text(text = "Yeniden Başlat", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
        }

        // Quick Notification Dialog
        if (showNotifDialog) {
            Dialog(onDismissRequest = { showNotifDialog = false }) {
                Surface(
                    shape = RoundedCornerShape(18.dp),
                    color = colors.paper,
                    border = BorderStroke(1.dp, colors.border),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(18.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "PC'ye Bildirim Gönder",
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold,
                                color = colors.textPrimary
                            )
                            IconButton(
                                onClick = { showNotifDialog = false },
                                modifier = Modifier.size(28.dp)
                            ) {
                                Icon(imageVector = Icons.Rounded.Close, contentDescription = "Kapat", tint = colors.textMuted)
                            }
                        }

                        Spacer(modifier = Modifier.height(12.dp))

                        OutlinedTextField(
                            value = notifMessage,
                            onValueChange = { notifMessage = it },
                            modifier = Modifier.fillMaxWidth(),
                            placeholder = { Text("PC ekranında belirecek mesaj...", color = colors.textFaint, fontSize = 12.sp) },
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

                        Spacer(modifier = Modifier.height(10.dp))

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
                                        checkedThumbColor = colors.accent,
                                        checkedTrackColor = colors.surfaceRaised
                                    )
                                )
                                Text(
                                    text = "Acil Sesli Çal",
                                    fontSize = 11.sp,
                                    color = if (notifUrgent) colors.accent else colors.textMuted
                                )
                            }

                            Button(
                                onClick = { sendInstantNotification() },
                                enabled = notifMessage.isNotBlank() && !isSendingNotif,
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = colors.accent,
                                    contentColor = colors.accentInk
                                ),
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier.height(38.dp)
                            ) {
                                Icon(imageVector = Icons.Rounded.Send, contentDescription = null, modifier = Modifier.size(13.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(text = "Gönder", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
        }

        // Quick Alarm Dialog
        if (showAlarmDialog) {
            Dialog(onDismissRequest = { showAlarmDialog = false }) {
                Surface(
                    shape = RoundedCornerShape(18.dp),
                    color = colors.paper,
                    border = BorderStroke(1.dp, colors.border),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(18.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Hızlı PC Alarmı Kur",
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold,
                                color = colors.textPrimary
                            )
                            IconButton(
                                onClick = { showAlarmDialog = false },
                                modifier = Modifier.size(28.dp)
                            ) {
                                Icon(imageVector = Icons.Rounded.Close, contentDescription = "Kapat", tint = colors.textMuted)
                            }
                        }

                        Spacer(modifier = Modifier.height(12.dp))

                        // Preset chips
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            listOf(5, 10, 15, 30, 45, 60).forEach { mins ->
                                val isSel = dialogAlarmMins == mins
                                Surface(
                                    modifier = Modifier
                                        .weight(1f)
                                        .clip(RoundedCornerShape(8.dp))
                                        .clickable { dialogAlarmMins = mins },
                                    color = if (isSel) colors.accent else colors.surfaceRaised,
                                    border = BorderStroke(1.dp, if (isSel) colors.accent else colors.border),
                                    shape = RoundedCornerShape(8.dp)
                                ) {
                                    Text(
                                        text = "$mins dk",
                                        color = if (isSel) colors.accentInk else colors.textPrimary,
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.padding(vertical = 6.dp),
                                        textAlign = TextAlign.Center
                                    )
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(10.dp))

                        OutlinedTextField(
                            value = dialogAlarmNote,
                            onValueChange = { dialogAlarmNote = it },
                            modifier = Modifier.fillMaxWidth(),
                            placeholder = { Text("Alarm notu (isteğe bağlı)...", color = colors.textFaint, fontSize = 12.sp) },
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

                        Spacer(modifier = Modifier.height(14.dp))

                        Button(
                            onClick = {
                                createLocalAlarm(dialogAlarmMins, dialogAlarmNote)
                                showAlarmDialog = false
                                dialogAlarmNote = ""
                            },
                            modifier = Modifier.fillMaxWidth().height(42.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = colors.accent,
                                contentColor = colors.accentInk
                            ),
                            shape = RoundedCornerShape(10.dp)
                        ) {
                            Icon(imageVector = Icons.Rounded.AlarmAdd, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(text = "$dialogAlarmMins Dk Sonra Çal", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }

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

@Composable
private fun PowerActionTile(
    modifier: Modifier = Modifier,
    icon: ImageVector,
    label: String,
    sublabel: String,
    highlight: Boolean = false,
    onClick: () -> Unit
) {
    val colors = KapanisTheme.colors

    Surface(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .clickable(onClick = onClick),
        color = if (highlight) colors.accent.copy(alpha = if (colors.isDark) 0.16f else 0.12f) else colors.surfaceGlass,
        border = BorderStroke(1.dp, if (highlight) colors.accent.copy(alpha = 0.4f) else colors.border),
        shape = RoundedCornerShape(14.dp)
    ) {
        Column(
            modifier = Modifier.padding(vertical = 10.dp, horizontal = 4.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = icon,
                contentDescription = label,
                tint = if (highlight) colors.accent else colors.textPrimary,
                modifier = Modifier.size(18.dp)
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = label,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = if (highlight) colors.accent else colors.textPrimary,
                textAlign = TextAlign.Center
            )
            Text(
                text = sublabel,
                fontSize = 9.sp,
                color = colors.textMuted,
                textAlign = TextAlign.Center
            )
        }
    }
}

@Composable
private fun QuickActionTile(
    modifier: Modifier = Modifier,
    icon: ImageVector,
    title: String,
    subtitle: String,
    onClick: () -> Unit
) {
    val colors = KapanisTheme.colors

    Surface(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .clickable(onClick = onClick),
        color = colors.surfaceGlass,
        border = BorderStroke(1.dp, colors.border),
        shape = RoundedCornerShape(16.dp)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .background(colors.accent.copy(alpha = if (colors.isDark) 0.14f else 0.10f), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = title,
                    tint = colors.accent,
                    modifier = Modifier.size(18.dp)
                )
            }

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = colors.textPrimary,
                    maxLines = 1
                )
                Text(
                    text = subtitle,
                    fontSize = 10.sp,
                    color = colors.textMuted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}
