package com.kapanis.mobil.ui.screens

import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
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
import androidx.compose.material.icons.rounded.CloudDone
import androidx.compose.material.icons.rounded.CloudOff
import androidx.compose.material.icons.rounded.PowerSettingsNew
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.RestartAlt
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material.icons.rounded.Timer
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
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
import com.kapanis.mobil.data.OnlineDeviceState
import com.kapanis.mobil.data.PreferencesManager
import com.kapanis.mobil.network.SupabaseRemoteClient
import com.kapanis.mobil.ui.components.GlassCard
import com.kapanis.mobil.ui.theme.KapanisTheme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.Locale
import kotlin.math.max

@Composable
fun OnlinePowerScreen(
    prefs: PreferencesManager,
    supabaseClient: SupabaseRemoteClient,
    onNavigateToConnect: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val colors = KapanisTheme.colors

    var deviceState by remember { mutableStateOf<OnlineDeviceState?>(null) }
    var isRefreshing by remember { mutableStateOf(false) }
    var isSendingCmd by remember { mutableStateOf(false) }
    var selectedMinutes by remember { mutableIntStateOf(30) }
    var actionType by remember { mutableStateOf("shutdown") }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }

    fun refreshState() {
        if (prefs.supabaseUrl.isEmpty() || prefs.pairedDeviceId.isEmpty() || isRefreshing) return
        isRefreshing = true
        scope.launch {
            val result = supabaseClient.fetchDeviceState(
                url = prefs.supabaseUrl,
                anonKey = prefs.supabaseAnonKey,
                deviceId = prefs.pairedDeviceId
            )
            isRefreshing = false
            if (result.isSuccess) {
                deviceState = result.getOrNull()
            }
        }
    }

    LaunchedEffect(Unit) {
        refreshState()
        while (true) {
            now = System.currentTimeMillis()
            delay(1000)
        }
    }

    fun sendCommand(cmd: String, delaySeconds: Long) {
        if (isSendingCmd) return
        isSendingCmd = true

        scope.launch {
            val result = supabaseClient.sendRemoteCommand(
                url = prefs.supabaseUrl,
                anonKey = prefs.supabaseAnonKey,
                deviceId = prefs.pairedDeviceId,
                controllerId = prefs.controllerId,
                command = cmd,
                delaySeconds = delaySeconds
            )
            isSendingCmd = false
            if (result.isSuccess) {
                val label = when (cmd) {
                    "cancel" -> "Kapatma planı iptal edildi"
                    "shutdown" -> if (delaySeconds == 0L) "Bilgisayar kapatılıyor" else "${delaySeconds / 60} dakika sonra kapatılacak"
                    "restart" -> "Yeniden başlatma komutu iletildi"
                    else -> "Komut iletildi"
                }
                Toast.makeText(context, "$label ✓", Toast.LENGTH_SHORT).show()
                refreshState()
            } else {
                Toast.makeText(
                    context,
                    result.exceptionOrNull()?.message ?: "Komut gönderilemedi",
                    Toast.LENGTH_SHORT
                ).show()
            }
        }
    }

    val activeTimer = deviceState?.timerState
    val hasActiveTimer = activeTimer != null && activeTimer.targetAt > now
    val remainingSeconds = if (hasActiveTimer) max(0L, (activeTimer!!.targetAt - now) / 1000) else 0L

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.paper)
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .verticalScroll(rememberScrollState())
    ) {
        // Device Status Header Card
        GlassCard(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .clip(CircleShape)
                            .background(if (deviceState?.isOnline == true) colors.success else colors.danger)
                    )
                    Column {
                        Text(
                            text = prefs.deviceName.ifEmpty { "Eşleşmiş PC" },
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = colors.textPrimary
                        )
                        Text(
                            text = if (deviceState?.isOnline == true) "Çevrim İçi" else "Çevrim Dışı",
                            fontSize = 11.sp,
                            color = if (deviceState?.isOnline == true) colors.success else colors.danger
                        )
                    }
                }

                IconButton(
                    onClick = { refreshState() },
                    modifier = Modifier.size(32.dp)
                ) {
                    if (isRefreshing) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            color = colors.accent,
                            strokeWidth = 2.dp
                        )
                    } else {
                        Icon(
                            imageVector = Icons.Rounded.Refresh,
                            contentDescription = "Yenile",
                            tint = colors.textMuted,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        // Active Countdown Card
        if (hasActiveTimer) {
            val hours = remainingSeconds / 3600
            val minutes = (remainingSeconds % 3600) / 60
            val seconds = remainingSeconds % 60
            val formatted = String.format(Locale.US, "%02d:%02d:%02d", hours, minutes, seconds)

            GlassCard(
                modifier = Modifier.fillMaxWidth(),
                backgroundColor = colors.surfaceRaised,
                borderColor = colors.accent
            ) {
                Text(
                    text = if (activeTimer?.action == "restart") "Yeniden Başlatmaya Kalan Süre" else "Kapanmaya Kalan Süre",
                    fontSize = 12.sp,
                    color = colors.textMuted,
                    fontWeight = FontWeight.SemiBold
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = formatted,
                    fontSize = 42.sp,
                    fontWeight = FontWeight.Black,
                    color = colors.accent,
                    fontFamily = FontFamily.Monospace,
                    letterSpacing = 2.sp
                )
                Spacer(modifier = Modifier.height(12.dp))
                Button(
                    onClick = { sendCommand("cancel", 0) },
                    enabled = !isSendingCmd,
                    modifier = Modifier.fillMaxWidth().height(42.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = colors.danger.copy(alpha = 0.2f),
                        contentColor = colors.danger
                    ),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Icon(imageVector = Icons.Rounded.Stop, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(text = "Sayacı İptal Et", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
            }

            Spacer(modifier = Modifier.height(14.dp))
        }

        // Power Planning Card
        GlassCard(modifier = Modifier.fillMaxWidth()) {
            Text(
                text = "Omni veya Yeniden Başlatma Planla",
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = colors.textPrimary
            )
            Spacer(modifier = Modifier.height(12.dp))

            // Action Selection Tabs
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(colors.surfaceRaised)
                    .padding(2.dp)
            ) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(6.dp))
                        .background(if (actionType == "shutdown") colors.accent else colors.surfaceRaised)
                        .clickable { actionType = "shutdown" }
                        .padding(vertical = 8.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "Bilgisayarı Kapat",
                        color = if (actionType == "shutdown") colors.accentInk else colors.textMuted,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(6.dp))
                        .background(if (actionType == "restart") colors.accent else colors.surfaceRaised)
                        .clickable { actionType = "restart" }
                        .padding(vertical = 8.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "Yeniden Başlat",
                        color = if (actionType == "restart") colors.accentInk else colors.textMuted,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Slider & Text
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(text = "Gecikme Süresi", fontSize = 12.sp, color = colors.textMuted)
                Text(
                    text = "$selectedMinutes Dakika",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = colors.accent
                )
            }

            Slider(
                value = selectedMinutes.toFloat(),
                onValueChange = { selectedMinutes = it.toInt() },
                valueRange = 0f..180f,
                steps = 35,
                colors = SliderDefaults.colors(
                    thumbColor = colors.accent,
                    activeTrackColor = colors.accent,
                    inactiveTrackColor = colors.surfaceRaised
                )
            )

            Spacer(modifier = Modifier.height(12.dp))

            Button(
                onClick = { sendCommand(actionType, selectedMinutes * 60L) },
                enabled = !isSendingCmd,
                modifier = Modifier.fillMaxWidth().height(46.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = colors.accent,
                    contentColor = colors.accentInk
                ),
                shape = RoundedCornerShape(10.dp)
            ) {
                if (isSendingCmd) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        color = colors.accentInk,
                        strokeWidth = 2.dp
                    )
                } else {
                    Icon(
                        imageVector = if (actionType == "shutdown") Icons.Rounded.PowerSettingsNew else Icons.Rounded.RestartAlt,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = if (selectedMinutes == 0) "Hemen ${if (actionType == "shutdown") "Kapat" else "Yeniden Başlat"}"
                        else "$selectedMinutes Dk Sonra ${if (actionType == "shutdown") "Kapat" else "Yeniden Başlat"}",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }
}
