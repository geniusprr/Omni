package com.kapanis.mobil.ui.screens

import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
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
import com.kapanis.mobil.ui.theme.AccentBlue
import com.kapanis.mobil.ui.theme.AccentInk
import com.kapanis.mobil.ui.theme.DangerRed
import com.kapanis.mobil.ui.theme.DarkPaper
import com.kapanis.mobil.ui.theme.DarkSurface
import com.kapanis.mobil.ui.theme.DarkSurfaceRaised
import com.kapanis.mobil.ui.theme.InkPrimary
import com.kapanis.mobil.ui.theme.RuleColor
import com.kapanis.mobil.ui.theme.RuleStrong
import com.kapanis.mobil.ui.theme.SuccessGreen
import com.kapanis.mobil.ui.theme.TextFaint
import com.kapanis.mobil.ui.theme.TextMuted
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.max

@Composable
fun OnlinePowerScreen(
    prefs: PreferencesManager,
    supabaseClient: SupabaseRemoteClient,
    onNavigateToConnect: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var deviceState by remember { mutableStateOf<OnlineDeviceState?>(null) }
    var isRefreshing by remember { mutableStateOf(false) }
    var isSendingCmd by remember { mutableStateOf(false) }
    var selectedMinutes by remember { mutableIntStateOf(30) }
    var actionType by remember { mutableStateOf("shutdown") } // shutdown or restart
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

    // Auto-refresh poll every 5 seconds
    LaunchedEffect(prefs.pairedDeviceId, prefs.supabaseUrl) {
        refreshState()
        while (true) {
            delay(5000)
            now = System.currentTimeMillis()
            if (prefs.pairedDeviceId.isNotEmpty() && prefs.supabaseUrl.isNotEmpty()) {
                val res = supabaseClient.fetchDeviceState(
                    url = prefs.supabaseUrl,
                    anonKey = prefs.supabaseAnonKey,
                    deviceId = prefs.pairedDeviceId
                )
                if (res.isSuccess) {
                    deviceState = res.getOrNull()
                }
            }
        }
    }

    // Countdown tick
    LaunchedEffect(Unit) {
        while (true) {
            delay(1000)
            now = System.currentTimeMillis()
        }
    }

    fun sendCommand(command: String, delaySec: Long) {
        if (prefs.supabaseUrl.isEmpty() || prefs.pairedDeviceId.isEmpty() || isSendingCmd) return
        isSendingCmd = true
        scope.launch {
            val result = supabaseClient.sendRemoteCommand(
                url = prefs.supabaseUrl,
                anonKey = prefs.supabaseAnonKey,
                deviceId = prefs.pairedDeviceId,
                controllerId = prefs.controllerId,
                command = command,
                delaySeconds = delaySec
            )
            isSendingCmd = false
            if (result.isSuccess) {
                val label = if (command == "cancel") "Plan iptal edildi" else "Komut PC'ye gönderildi"
                Toast.makeText(context, "$label ✓", Toast.LENGTH_SHORT).show()
                refreshState()
            } else {
                Toast.makeText(
                    context,
                    result.exceptionOrNull()?.message ?: "Komut iletilemedi",
                    Toast.LENGTH_SHORT
                ).show()
            }
        }
    }

    // Not paired state
    if (prefs.pairedDeviceId.isEmpty() || prefs.supabaseUrl.isEmpty()) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(DarkPaper)
                .padding(24.dp),
            contentAlignment = Alignment.Center
        ) {
            GlassCard(
                modifier = Modifier.fillMaxWidth(),
                backgroundColor = DarkSurface
            ) {
                Icon(
                    imageVector = Icons.Rounded.CloudOff,
                    contentDescription = null,
                    tint = TextFaint,
                    modifier = Modifier
                        .size(36.dp)
                        .align(Alignment.CenterHorizontally)
                )
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = "Çevrim İçi Cihaz Eşleştirilmedi",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = InkPrimary,
                    modifier = Modifier.align(Alignment.CenterHorizontally)
                )
                Text(
                    text = "PC'nizi dünyanın her yerinden uzaktan kapatmak için bilgisayardaki 6 haneli kodu girerek eşleştirin.",
                    fontSize = 13.sp,
                    color = TextMuted,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    modifier = Modifier.padding(top = 6.dp, bottom = 16.dp)
                )
                Button(
                    onClick = onNavigateToConnect,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = AccentBlue,
                        contentColor = AccentInk
                    ),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(text = "Eşleştirme Kodunu Gir", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
        return
    }

    val activeTimer = deviceState?.timerState
    val remainingMs = if (activeTimer != null && activeTimer.targetAt > now) {
        activeTimer.targetAt - now
    } else 0L

    val isTimerActive = remainingMs > 0

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DarkPaper)
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .verticalScroll(rememberScrollState())
    ) {
        // Device Live Status Card
        GlassCard(
            modifier = Modifier.fillMaxWidth(),
            backgroundColor = DarkSurface
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .clip(CircleShape)
                            .background(if (deviceState?.isOnline == true) SuccessGreen else DangerRed)
                    )
                    Column {
                        Text(
                            text = deviceState?.name ?: prefs.deviceName,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = InkPrimary
                        )
                        Text(
                            text = if (deviceState?.isOnline == true) "● Çevrim İçi (Bulut)" else "○ Çevrim Dışı",
                            fontSize = 11.sp,
                            color = if (deviceState?.isOnline == true) SuccessGreen else TextFaint,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = prefs.pairingCode,
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace,
                        color = AccentBlue,
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(DarkSurfaceRaised)
                            .padding(horizontal = 6.dp, vertical = 3.dp)
                    )
                    IconButton(
                        onClick = { refreshState() },
                        modifier = Modifier.size(32.dp)
                    ) {
                        if (isRefreshing) {
                            CircularProgressIndicator(modifier = Modifier.size(14.dp), color = AccentBlue, strokeWidth = 2.dp)
                        } else {
                            Icon(imageVector = Icons.Rounded.Refresh, contentDescription = "Yenile", tint = TextMuted, modifier = Modifier.size(16.dp))
                        }
                    }
                }
            }

            // Active Countdown Banner if active
            AnimatedVisibility(visible = isTimerActive) {
                val totalSeconds = (remainingMs / 1000).toInt()
                val hours = totalSeconds / 3600
                val mins = (totalSeconds % 3600) / 60
                val secs = totalSeconds % 60
                val countdownFormatted = String.format("%02d:%02d:%02d", hours, mins, secs)

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 14.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(AccentBlue.copy(alpha = 0.1f))
                        .padding(12.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = if (activeTimer?.action == "restart") "Yeniden Başlatmaya Kalan:" else "Kapanışa Kalan:",
                        fontSize = 12.sp,
                        color = AccentBlue,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        text = countdownFormatted,
                        fontSize = 32.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace,
                        color = InkPrimary,
                        letterSpacing = (-1).sp,
                        modifier = Modifier.padding(vertical = 4.dp)
                    )

                    Button(
                        onClick = { sendCommand("cancel", 0) },
                        enabled = !isSendingCmd,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = DangerRed.copy(alpha = 0.2f),
                            contentColor = DangerRed
                        ),
                        shape = RoundedCornerShape(6.dp)
                    ) {
                        Icon(imageVector = Icons.Rounded.Stop, contentDescription = null, modifier = Modifier.size(14.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(text = "Planı İptal Et", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        // Remote Power Scheduler Card
        GlassCard(
            modifier = Modifier.fillMaxWidth(),
            backgroundColor = DarkSurface
        ) {
            Text(
                text = "Uzaktan Kapatma Planla",
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = InkPrimary
            )
            Text(
                text = "Seçilen süreden sonra PC otomatik olarak kapanır veya yeniden başlar.",
                fontSize = 12.sp,
                color = TextMuted,
                modifier = Modifier.padding(top = 2.dp, bottom = 12.dp)
            )

            // Action Toggle: Kapat vs Yeniden Başlat
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(DarkSurfaceRaised)
                    .padding(2.dp)
            ) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(6.dp))
                        .background(if (actionType == "shutdown") AccentBlue else DarkSurfaceRaised)
                        .clickable { actionType = "shutdown" }
                        .padding(vertical = 8.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.PowerSettingsNew,
                            contentDescription = null,
                            tint = if (actionType == "shutdown") AccentInk else TextMuted,
                            modifier = Modifier.size(14.dp)
                        )
                        Text(
                            text = "Kapat",
                            color = if (actionType == "shutdown") AccentInk else TextMuted,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(6.dp))
                        .background(if (actionType == "restart") AccentBlue else DarkSurfaceRaised)
                        .clickable { actionType = "restart" }
                        .padding(vertical = 8.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.RestartAlt,
                            contentDescription = null,
                            tint = if (actionType == "restart") AccentInk else TextMuted,
                            modifier = Modifier.size(14.dp)
                        )
                        Text(
                            text = "Yeniden Başlat",
                            color = if (actionType == "restart") AccentInk else TextMuted,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Presets
            val presets = listOf(15, 30, 45, 60, 90, 120)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                presets.take(3).forEach { mins ->
                    val isSel = selectedMinutes == mins
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(6.dp))
                            .background(if (isSel) AccentBlue.copy(alpha = 0.2f) else DarkSurfaceRaised)
                            .clickable { selectedMinutes = mins }
                            .padding(vertical = 8.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "$mins dk",
                            color = if (isSel) AccentBlue else InkPrimary,
                            fontSize = 12.sp,
                            fontWeight = if (isSel) FontWeight.Bold else FontWeight.Medium
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(6.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                presets.drop(3).forEach { mins ->
                    val isSel = selectedMinutes == mins
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(6.dp))
                            .background(if (isSel) AccentBlue.copy(alpha = 0.2f) else DarkSurfaceRaised)
                            .clickable { selectedMinutes = mins }
                            .padding(vertical = 8.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "$mins dk",
                            color = if (isSel) AccentBlue else InkPrimary,
                            fontSize = 12.sp,
                            fontWeight = if (isSel) FontWeight.Bold else FontWeight.Medium
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Slider
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(text = "Süre Seçimi", fontSize = 12.sp, color = TextMuted)
                Text(
                    text = "$selectedMinutes dakika (${selectedMinutes / 60} sa ${selectedMinutes % 60} dk)",
                    fontSize = 12.sp,
                    color = AccentBlue,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold
                )
            }

            Slider(
                value = selectedMinutes.toFloat(),
                onValueChange = { selectedMinutes = it.toInt() },
                valueRange = 5f..240f,
                steps = 46,
                colors = SliderDefaults.colors(
                    thumbColor = AccentBlue,
                    activeTrackColor = AccentBlue,
                    inactiveTrackColor = DarkSurfaceRaised
                )
            )

            Spacer(modifier = Modifier.height(10.dp))

            // Schedule Button
            Button(
                onClick = {
                    val delaySec = selectedMinutes * 60L
                    sendCommand(actionType, delaySec)
                },
                enabled = !isSendingCmd,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(
                    containerColor = AccentBlue,
                    contentColor = AccentInk
                ),
                shape = RoundedCornerShape(8.dp)
            ) {
                if (isSendingCmd) {
                    CircularProgressIndicator(modifier = Modifier.size(16.dp), color = AccentInk, strokeWidth = 2.dp)
                } else {
                    Icon(imageVector = Icons.Rounded.Timer, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = if (actionType == "shutdown") "$selectedMinutes Dakika Sonra Kapat" else "$selectedMinutes Dakika Sonra Yeniden Başlat",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        // Direct Quick Actions Card
        GlassCard(
            modifier = Modifier.fillMaxWidth(),
            backgroundColor = DarkSurface
        ) {
            Text(
                text = "Anında Güç İşlemleri",
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = InkPrimary
            )
            Text(
                text = "Gecikme olmadan doğrudan bilgisayara iletilir.",
                fontSize = 12.sp,
                color = TextMuted,
                modifier = Modifier.padding(top = 2.dp, bottom = 12.dp)
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    onClick = { sendCommand("shutdown", 0) },
                    enabled = !isSendingCmd,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = DangerRed.copy(alpha = 0.2f),
                        contentColor = DangerRed
                    ),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(text = "Şimdi Kapat", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }

                Button(
                    onClick = { sendCommand("restart", 0) },
                    enabled = !isSendingCmd,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = DarkSurfaceRaised,
                        contentColor = InkPrimary
                    ),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(text = "Yeniden Başlat", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))
    }
}
