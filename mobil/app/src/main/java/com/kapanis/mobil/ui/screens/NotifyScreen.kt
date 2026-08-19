package com.kapanis.mobil.ui.screens

import android.widget.Toast
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Alarm
import androidx.compose.material.icons.rounded.AlarmAdd
import androidx.compose.material.icons.rounded.ContentPaste
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.NotificationsActive
import androidx.compose.material.icons.rounded.VolumeUp
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kapanis.mobil.data.AlarmItem
import com.kapanis.mobil.data.ConnectionMode
import com.kapanis.mobil.data.ConnectionTarget
import com.kapanis.mobil.network.KapanisApiClient
import com.kapanis.mobil.ui.components.GlassCard
import com.kapanis.mobil.ui.theme.AccentBlue
import com.kapanis.mobil.ui.theme.AccentInk
import com.kapanis.mobil.ui.theme.DangerRed
import com.kapanis.mobil.ui.theme.DarkPaper
import com.kapanis.mobil.ui.theme.DarkSurface
import com.kapanis.mobil.ui.theme.DarkSurfaceRaised
import com.kapanis.mobil.ui.theme.InkPrimary
import com.kapanis.mobil.ui.theme.RuleColor
import com.kapanis.mobil.ui.theme.TextFaint
import com.kapanis.mobil.ui.theme.TextMuted
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun NotifyScreen(
    target: ConnectionTarget,
    apiClient: KapanisApiClient,
    mode: ConnectionMode = ConnectionMode.LOCAL
) {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val scope = rememberCoroutineScope()

    // Notification State
    var notifTitle by remember { mutableStateOf("") }
    var notifMessage by remember { mutableStateOf("") }
    var isUrgent by remember { mutableStateOf(false) }
    var isSendingNotif by remember { mutableStateOf(false) }
    var isSendingClip by remember { mutableStateOf(false) }

    // Alarm State
    var alarmMinutes by remember { mutableStateOf(10) }
    var alarmNote by remember { mutableStateOf("") }
    var alarmSound by remember { mutableStateOf("chime") }
    var isCreatingAlarm by remember { mutableStateOf(false) }
    var alarmsList by remember { mutableStateOf<List<AlarmItem>>(emptyList()) }
    var isLoadingAlarms by remember { mutableStateOf(false) }

    fun loadAlarms() {
        if (mode != ConnectionMode.LOCAL) return
        isLoadingAlarms = true
        scope.launch {
            val res = apiClient.fetchAlarms(target.host, target.port)
            isLoadingAlarms = false
            if (res.isSuccess) {
                alarmsList = res.getOrDefault(emptyList())
            }
        }
    }

    LaunchedEffect(target.host, target.port) {
        loadAlarms()
    }

    fun sendNotification() {
        val msg = notifMessage.trim()
        if (msg.isEmpty() || isSendingNotif) return

        isSendingNotif = true
        scope.launch {
            val result = apiClient.sendNotification(
                host = target.host,
                port = target.port,
                title = notifTitle.trim().ifEmpty { "kapanış. Mobil Bildirim" },
                message = msg,
                urgent = isUrgent
            )
            isSendingNotif = false
            if (result.isSuccess) {
                notifTitle = ""
                notifMessage = ""
                Toast.makeText(context, "Bildirim PC'de gösterildi ✓", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(context, "Bildirim iletilemedi", Toast.LENGTH_SHORT).show()
            }
        }
    }

    fun createAlarm() {
        if (isCreatingAlarm) return
        isCreatingAlarm = true
        val targetTimestamp = System.currentTimeMillis() + (alarmMinutes * 60 * 1000L)
        scope.launch {
            val res = apiClient.createAlarm(
                host = target.host,
                port = target.port,
                timestamp = targetTimestamp,
                note = alarmNote.trim(),
                soundEnabled = true,
                soundProfile = alarmSound
            )
            isCreatingAlarm = false
            if (res.isSuccess) {
                alarmNote = ""
                Toast.makeText(context, "PC Alarmı kuruldu ($alarmMinutes dk) ✓", Toast.LENGTH_SHORT).show()
                loadAlarms()
            } else {
                Toast.makeText(context, "Alarm kurulamadı", Toast.LENGTH_SHORT).show()
            }
        }
    }

    fun cancelAlarm(id: String) {
        scope.launch {
            val res = apiClient.cancelAlarm(target.host, target.port, id)
            if (res.isSuccess) {
                Toast.makeText(context, "Alarm iptal edildi ✓", Toast.LENGTH_SHORT).show()
                loadAlarms()
            }
        }
    }

    fun syncClipboard() {
        val clipText = clipboard.getText()?.text.orEmpty().trim()
        if (clipText.isEmpty()) {
            Toast.makeText(context, "Telefonda kopyalanmış metin bulunamadı", Toast.LENGTH_SHORT).show()
            return
        }

        if (isSendingClip) return
        isSendingClip = true
        scope.launch {
            val result = apiClient.sendClipboard(target.host, target.port, clipText)
            isSendingClip = false
            if (result.isSuccess) {
                Toast.makeText(context, "Pano PC'ye yapıştırıldı ✓", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(context, "Pano iletilemedi", Toast.LENGTH_SHORT).show()
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DarkPaper)
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .verticalScroll(rememberScrollState())
    ) {
        // PC Alarm Card
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
                        text = "PC Alarmı Kur",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = InkPrimary
                    )
                }
            }

            Text(
                text = "Bilgisayar ekranında tam zamanında sesli ve görsel alarm çalar.",
                fontSize = 12.sp,
                color = TextMuted,
                modifier = Modifier.padding(top = 4.dp, bottom = 12.dp)
            )

            // Preset minute buttons
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                listOf(5, 10, 15, 30, 60).forEach { mins ->
                    val isSelected = alarmMinutes == mins
                    Surface(
                        modifier = Modifier
                            .weight(1f)
                            .clickable { alarmMinutes = mins },
                        color = if (isSelected) AccentBlue else DarkSurfaceRaised,
                        shape = RoundedCornerShape(6.dp)
                    ) {
                        Text(
                            text = "$mins dk",
                            color = if (isSelected) AccentInk else InkPrimary,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(vertical = 8.dp),
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            OutlinedTextField(
                value = alarmNote,
                onValueChange = { alarmNote = it },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Alarm notu / hatırlatma...", color = TextFaint, fontSize = 12.sp) },
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

            Spacer(modifier = Modifier.height(10.dp))

            Button(
                onClick = { createAlarm() },
                enabled = !isCreatingAlarm,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(
                    containerColor = AccentBlue,
                    contentColor = AccentInk
                ),
                shape = RoundedCornerShape(8.dp)
            ) {
                if (isCreatingAlarm) {
                    CircularProgressIndicator(modifier = Modifier.size(16.dp), color = AccentInk, strokeWidth = 2.dp)
                } else {
                    Icon(imageVector = Icons.Rounded.AlarmAdd, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(text = "PC'de $alarmMinutes Dk Sonra Çalacak Alarm Kur", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }

            // Active Alarms List
            if (alarmsList.isNotEmpty()) {
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = "Bekleyen PC Alarmları (${alarmsList.size})",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = InkPrimary
                )

                alarmsList.forEach { alarm ->
                    val timeStr = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(alarm.timestamp))
                    val remainingMins = ((alarm.timestamp - System.currentTimeMillis()) / 60000).coerceAtLeast(0)

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp)
                            .background(DarkSurfaceRaised, RoundedCornerShape(6.dp))
                            .padding(horizontal = 10.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "$timeStr (${remainingMins} dk kaldı)",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = AccentBlue
                            )
                            if (alarm.note.isNotEmpty()) {
                                Text(text = alarm.note, fontSize = 11.sp, color = InkPrimary)
                            }
                        }

                        IconButton(
                            onClick = { cancelAlarm(alarm.id) },
                            modifier = Modifier.size(28.dp)
                        ) {
                            Icon(imageVector = Icons.Rounded.Delete, contentDescription = "İptal", tint = DangerRed, modifier = Modifier.size(14.dp))
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        // Direct PC Notification Card
        GlassCard(
            modifier = Modifier.fillMaxWidth(),
            backgroundColor = DarkSurface
        ) {
            Text(
                text = "PC'ye Anlık Bildirim Gönder",
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = InkPrimary
            )
            Text(
                text = "Windows bildirim baloncuğu ve zil sesi tetikler.",
                fontSize = 12.sp,
                color = TextMuted,
                modifier = Modifier.padding(top = 2.dp, bottom = 12.dp)
            )

            OutlinedTextField(
                value = notifTitle,
                onValueChange = { notifTitle = it },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Başlık (İsteğe bağlı)", color = TextFaint, fontSize = 13.sp) },
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

            Spacer(modifier = Modifier.height(8.dp))

            OutlinedTextField(
                value = notifMessage,
                onValueChange = { notifMessage = it },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Mesaj metni...", color = TextFaint, fontSize = 13.sp) },
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

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 10.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Switch(
                        checked = isUrgent,
                        onCheckedChange = { isUrgent = it },
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = AccentBlue,
                            checkedTrackColor = DarkSurfaceRaised
                        )
                    )
                    Text(
                        text = "Acil Sesli Çal",
                        fontSize = 12.sp,
                        color = if (isUrgent) AccentBlue else TextMuted
                    )
                }

                Button(
                    onClick = { sendNotification() },
                    enabled = notifMessage.isNotBlank() && !isSendingNotif,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = AccentBlue,
                        contentColor = AccentInk
                    ),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    if (isSendingNotif) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), color = AccentInk, strokeWidth = 2.dp)
                    } else {
                        Icon(imageVector = Icons.Rounded.NotificationsActive, contentDescription = null, modifier = Modifier.size(14.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(text = "Gönder", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        // Clipboard Sync Card
        GlassCard(
            modifier = Modifier.fillMaxWidth(),
            backgroundColor = DarkSurface
        ) {
            Text(
                text = "Hızlı Pano Aktarımı",
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = InkPrimary
            )
            Text(
                text = "Telefonda kopyaladığınız metni anında PC panosuna (Ctrl+V) yapıştırın.",
                fontSize = 12.sp,
                color = TextMuted,
                modifier = Modifier.padding(top = 2.dp, bottom = 12.dp)
            )

            Button(
                onClick = { syncClipboard() },
                enabled = !isSendingClip,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(
                    containerColor = DarkSurfaceRaised,
                    contentColor = InkPrimary
                ),
                shape = RoundedCornerShape(8.dp)
            ) {
                if (isSendingClip) {
                    CircularProgressIndicator(modifier = Modifier.size(16.dp), color = InkPrimary, strokeWidth = 2.dp)
                } else {
                    Icon(imageVector = Icons.Rounded.ContentPaste, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(text = "Telefonda Kopyalanan Metni PC'ye Gönder", fontSize = 13.sp, fontWeight = FontWeight.Medium)
                }
            }
        }

        Spacer(modifier = Modifier.height(24.dp))
    }
}
