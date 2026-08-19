package com.kapanis.mobil.ui.screens

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ContentPaste
import androidx.compose.material.icons.rounded.NotificationsActive
import androidx.compose.material.icons.rounded.PowerSettingsNew
import androidx.compose.material.icons.rounded.RestartAlt
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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

@Composable
fun NotifyScreen(
    target: ConnectionTarget,
    apiClient: KapanisApiClient
) {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val scope = rememberCoroutineScope()

    var notifTitle by remember { mutableStateOf("") }
    var notifMessage by remember { mutableStateOf("") }
    var isUrgent by remember { mutableStateOf(false) }
    var isSendingNotif by remember { mutableStateOf(false) }
    var isSendingClip by remember { mutableStateOf(false) }
    var isSendingCmd by remember { mutableStateOf(false) }

    fun sendNotification() {
        val msg = notifMessage.trim()
        if (msg.isEmpty() || isSendingNotif) return

        isSendingNotif = true
        scope.launch {
            val result = apiClient.sendNotification(
                host = target.host,
                port = target.port,
                title = notifTitle.trim().ifEmpty { "Mobil Bildirim" },
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

    fun sendPowerCmd(command: String, delaySeconds: Long) {
        if (isSendingCmd) return
        isSendingCmd = true
        scope.launch {
            val result = apiClient.sendCommand(target.host, target.port, command, delaySeconds)
            isSendingCmd = false
            if (result.isSuccess) {
                val label = if (command == "cancel") "Plan iptal edildi" else "Komut gönderildi ($command)"
                Toast.makeText(context, "$label ✓", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(context, "Komut gönderilemedi", Toast.LENGTH_SHORT).show()
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
        // Direct Notification Card
        GlassCard(
            modifier = Modifier.fillMaxWidth(),
            backgroundColor = DarkSurface
        ) {
            Text(
                text = "PC'ye Bildirim Gönder",
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

        Spacer(modifier = Modifier.height(14.dp))

        // Power Commands Card
        GlassCard(
            modifier = Modifier.fillMaxWidth(),
            backgroundColor = DarkSurface
        ) {
            Text(
                text = "Kapanış Hızlı Güç Komutları",
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = InkPrimary
            )
            Text(
                text = "PC'ye tek tıkla kapatma sayacı kurun veya iptal edin.",
                fontSize = 12.sp,
                color = TextMuted,
                modifier = Modifier.padding(top = 2.dp, bottom = 12.dp)
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    onClick = { sendPowerCmd("shutdown", 1800) },
                    enabled = !isSendingCmd,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = DarkSurfaceRaised,
                        contentColor = InkPrimary
                    ),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(text = "30 dk", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }

                Button(
                    onClick = { sendPowerCmd("shutdown", 3600) },
                    enabled = !isSendingCmd,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = DarkSurfaceRaised,
                        contentColor = InkPrimary
                    ),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(text = "60 dk", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }

                Button(
                    onClick = { sendPowerCmd("cancel", 0) },
                    enabled = !isSendingCmd,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = DangerRed.copy(alpha = 0.2f),
                        contentColor = DangerRed
                    ),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Icon(imageVector = Icons.Rounded.Stop, contentDescription = null, modifier = Modifier.size(14.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(text = "İptal", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))
    }
}
