package com.kapanis.mobil.ui.screens

import android.widget.Toast
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
import com.kapanis.mobil.ui.theme.KapanisTheme
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
    val colors = KapanisTheme.colors

    // Notification State
    var notifTitle by remember { mutableStateOf("") }
    var notifMessage by remember { mutableStateOf("") }
    var isUrgent by remember { mutableStateOf(false) }
    var isSendingNotif by remember { mutableStateOf(false) }
    var isSendingClip by remember { mutableStateOf(false) }

    // Alarm State
    var alarmMinutes by remember { mutableStateOf(10) }
    var alarmNote by remember { mutableStateOf("") }
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
                soundProfile = "chime"
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
            .background(colors.paper)
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .verticalScroll(rememberScrollState())
    ) {
        // Instant Notification Card
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
                        text = "PC'ye Anlık Bildirim Gönder",
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
                onValueChange = { notifTitle = it },
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
                onValueChange = { notifMessage = it },
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
                        checked = isUrgent,
                        onCheckedChange = { isUrgent = it },
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = colors.accent,
                            checkedTrackColor = colors.surfaceRaised
                        )
                    )
                    Text(
                        text = "Acil Sesli Çal",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = if (isUrgent) colors.accent else colors.textMuted
                    )
                }

                Button(
                    onClick = { sendNotification() },
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
                        Text(text = "Gönder", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        // Clipboard Sync Card
        GlassCard(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .background(colors.accent.copy(alpha = 0.15f), CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(imageVector = Icons.Rounded.ContentPaste, contentDescription = null, tint = colors.accent, modifier = Modifier.size(16.dp))
                    }
                    Spacer(modifier = Modifier.width(10.dp))
                    Column {
                        Text(
                            text = "Hızlı Pano Senkronizasyonu",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = colors.textPrimary
                        )
                        Text(
                            text = "Telefonda kopyalanan metni PC panosuna yazar.",
                            fontSize = 11.sp,
                            color = colors.textMuted
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            Button(
                onClick = { syncClipboard() },
                enabled = !isSendingClip,
                modifier = Modifier.fillMaxWidth().height(44.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = colors.surfaceRaised,
                    contentColor = colors.textPrimary
                ),
                border = BorderStroke(1.dp, colors.border),
                shape = RoundedCornerShape(10.dp)
            ) {
                if (isSendingClip) {
                    CircularProgressIndicator(modifier = Modifier.size(14.dp), color = colors.textPrimary, strokeWidth = 2.dp)
                } else {
                    Text("Telefondaki Panoyu PC'ye Aktar", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }

        Spacer(modifier = Modifier.height(20.dp))
    }
}
