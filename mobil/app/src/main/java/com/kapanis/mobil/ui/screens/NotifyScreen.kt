package com.kapanis.mobil.ui.screens

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.material.icons.rounded.Alarm
import androidx.compose.material.icons.rounded.AlarmAdd
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.NotificationsActive
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Send
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
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kapanis.mobil.data.AlarmItem
import com.kapanis.mobil.data.ConnectionMode
import com.kapanis.mobil.data.ConnectionTarget
import com.kapanis.mobil.data.MirroredNotification
import com.kapanis.mobil.data.PreferencesManager
import com.kapanis.mobil.network.KapanisApiClient
import com.kapanis.mobil.network.SupabaseRemoteClient
import com.kapanis.mobil.ui.components.GlassCard
import com.kapanis.mobil.ui.theme.KapanisTheme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun NotifyScreen(
    target: ConnectionTarget,
    prefs: PreferencesManager,
    apiClient: KapanisApiClient,
    supabaseClient: SupabaseRemoteClient,
    mode: ConnectionMode = ConnectionMode.LOCAL
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val colors = KapanisTheme.colors

    var activeSubTab by remember { mutableIntStateOf(0) } // 0: PC Bildirimleri (Aynalama), 1: PC'ye Gönder / Alarmlar

    // Mirrored Notifications State
    var notifications by remember { mutableStateOf<List<MirroredNotification>>(emptyList()) }
    var isLoadingNotifications by remember { mutableStateOf(false) }
    var selectedCategory by remember { mutableStateOf("Tümü") }
    var searchQuery by remember { mutableStateOf("") }

    // Outbound Notification State
    var notifTitle by remember { mutableStateOf("") }
    var notifMessage by remember { mutableStateOf("") }
    var isUrgent by remember { mutableStateOf(false) }
    var isSendingNotif by remember { mutableStateOf(false) }

    // Alarm State
    var alarmMinutes by remember { mutableIntStateOf(10) }
    var alarmNote by remember { mutableStateOf("") }
    var isCreatingAlarm by remember { mutableStateOf(false) }
    var alarmsList by remember { mutableStateOf<List<AlarmItem>>(emptyList()) }

    fun loadMirroredNotifications() {
        scope.launch {
            if (mode == ConnectionMode.LOCAL) {
                val token = prefs.getLocalAuthToken(target.host)
                val res = apiClient.fetchNotifications(target.host, target.port, token)
                if (res.isSuccess) {
                    notifications = res.getOrDefault(emptyList())
                }
            } else {
                val url = prefs.supabaseUrl
                val key = prefs.supabaseAnonKey
                val devId = prefs.pairedDeviceId
                if (url.isNotEmpty() && key.isNotEmpty() && devId.isNotEmpty()) {
                    val res = supabaseClient.fetchNotifications(url, key, devId)
                    if (res.isSuccess) {
                        notifications = res.getOrDefault(emptyList())
                    }
                }
            }
        }
    }

    fun loadAlarms() {
        if (mode != ConnectionMode.LOCAL) return
        scope.launch {
            val res = apiClient.fetchAlarms(target.host, target.port)
            if (res.isSuccess) {
                alarmsList = res.getOrDefault(emptyList())
            }
        }
    }

    // Auto-polling for real-time notifications
    LaunchedEffect(target.host, target.port, mode, prefs.pairedDeviceId) {
        loadMirroredNotifications()
        loadAlarms()
        while (true) {
            delay(2500)
            loadMirroredNotifications()
        }
    }

    fun clearAllNotifications() {
        scope.launch {
            if (mode == ConnectionMode.LOCAL) {
                val token = prefs.getLocalAuthToken(target.host)
                apiClient.clearNotifications(target.host, target.port, token)
            }
            notifications = emptyList()
            Toast.makeText(context, "Bildirim geçmişi temizlendi", Toast.LENGTH_SHORT).show()
        }
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

    // Filtered Notifications
    val filteredList = notifications.filter { notif ->
        val matchesCategory = if (selectedCategory == "Tümü") true else notif.appName.contains(selectedCategory, ignoreCase = true)
        val q = searchQuery.trim().lowercase()
        val matchesQuery = if (q.isEmpty()) true else {
            notif.appName.lowercase().contains(q) ||
            notif.title.lowercase().contains(q) ||
            notif.body.lowercase().contains(q)
        }
        matchesCategory && matchesQuery
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 12.dp)
    ) {
        // Tab Selector (PC Bildirimleri vs PC'ye Bildirim Gönder)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(colors.surfaceRaised)
                .padding(4.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            val subTabs = listOf("PC Bildirimleri (${notifications.size})", "PC'ye Gönder / Alarm")
            subTabs.forEachIndexed { index, title ->
                val isSelected = activeSubTab == index
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(8.dp))
                        .background(if (isSelected) colors.accent.copy(alpha = 0.2f) else colors.surface.copy(alpha = 0.5f))
                        .clickable { activeSubTab = index }
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

        Spacer(modifier = Modifier.height(12.dp))

        // TAB 1: MIRRORED NOTIFICATIONS
        if (activeSubTab == 0) {
            // Category Filter Pills
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                val categories = listOf("Tümü", "WhatsApp", "Discord", "Chrome", "Outlook", "Telegram", "Sistem")
                categories.forEach { cat ->
                    val isSelected = selectedCategory == cat
                    Surface(
                        shape = CircleShape,
                        color = if (isSelected) colors.accent.copy(alpha = 0.22f) else colors.surfaceRaised,
                        border = BorderStroke(1.dp, if (isSelected) colors.accent.copy(alpha = 0.5f) else colors.border),
                        modifier = Modifier.clickable { selectedCategory = cat }
                    ) {
                        Text(
                            text = cat,
                            color = if (isSelected) colors.accent else colors.textMuted,
                            fontSize = 11.sp,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Search Bar & Actions
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    placeholder = { Text("Bildirimlerde ara...", color = colors.textMuted, fontSize = 12.sp) },
                    leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null, tint = colors.textMuted, modifier = Modifier.size(18.dp)) },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(10.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = colors.accent,
                        unfocusedBorderColor = colors.border,
                        focusedContainerColor = colors.surfaceRaised,
                        unfocusedContainerColor = colors.surfaceRaised,
                        focusedTextColor = colors.textPrimary,
                        unfocusedTextColor = colors.textPrimary
                    ),
                    singleLine = true
                )

                IconButton(
                    onClick = { loadMirroredNotifications() },
                    modifier = Modifier
                        .size(44.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(colors.surfaceRaised)
                ) {
                    Icon(Icons.Rounded.Refresh, contentDescription = "Yenile", tint = colors.textPrimary, modifier = Modifier.size(18.dp))
                }

                if (notifications.isNotEmpty()) {
                    IconButton(
                        onClick = { clearAllNotifications() },
                        modifier = Modifier
                            .size(44.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(colors.surfaceRaised)
                    ) {
                        Icon(Icons.Rounded.Delete, contentDescription = "Temizle", tint = colors.danger, modifier = Modifier.size(18.dp))
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Notifications Feed
            if (filteredList.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(24.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            Icons.Rounded.Notifications,
                            contentDescription = null,
                            tint = colors.textMuted.copy(alpha = 0.4f),
                            modifier = Modifier.size(54.dp)
                        )
                        Spacer(modifier = Modifier.height(10.dp))
                        Text(
                            text = if (searchQuery.isNotEmpty() || selectedCategory != "Tümü") "Aramaya uygun bildirim bulunamadı." else "Henüz bilgisayardan yeni bir bildirim gelmedi.",
                            color = colors.textMuted,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
            } else {
                val timeFormat = remember { SimpleDateFormat("HH:mm", Locale.getDefault()) }
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(filteredList.size, key = { index -> val item = filteredList[index]; if (item.id.isNotEmpty()) "${item.id}_$index" else "$index" }) { index ->
                        val notif = filteredList[index]
                        GlassCard(
                            modifier = Modifier.fillMaxWidth(),
                            backgroundColor = colors.surfaceRaised
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Surface(
                                        shape = RoundedCornerShape(4.dp),
                                        color = colors.accent.copy(alpha = 0.15f)
                                    ) {
                                        Text(
                                            text = notif.appName,
                                            color = colors.accent,
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Bold,
                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                        )
                                    }

                                    Text(
                                        text = timeFormat.format(Date(notif.timestamp)),
                                        color = colors.textMuted,
                                        fontSize = 11.sp
                                    )
                                }

                                if (notif.title.isNotBlank()) {
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Text(
                                        text = notif.title,
                                        color = colors.textPrimary,
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }

                                if (notif.body.isNotBlank()) {
                                    Spacer(modifier = Modifier.height(2.dp))
                                    Text(
                                        text = notif.body,
                                        color = colors.textMuted,
                                        fontSize = 12.sp,
                                        lineHeight = 16.sp
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        // TAB 2: OUTBOUND NOTIFICATIONS & PC ALARMS
        if (activeSubTab == 1) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
            ) {
                // Outbound PC Notification Card
                GlassCard(
                    modifier = Modifier.fillMaxWidth(),
                    backgroundColor = colors.surfaceRaised
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Rounded.NotificationsActive, contentDescription = null, tint = colors.accent, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("PC Ekranına Bildirim Gönder", color = colors.textPrimary, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                        }

                        Spacer(modifier = Modifier.height(12.dp))

                        OutlinedTextField(
                            value = notifTitle,
                            onValueChange = { notifTitle = it },
                            label = { Text("Başlık (İsteğe bağlı)", fontSize = 12.sp) },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp),
                            singleLine = true
                        )

                        Spacer(modifier = Modifier.height(8.dp))

                        OutlinedTextField(
                            value = notifMessage,
                            onValueChange = { notifMessage = it },
                            label = { Text("Bildirim Mesajı", fontSize = 12.sp) },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp),
                            minLines = 2,
                            maxLines = 4
                        )

                        Spacer(modifier = Modifier.height(10.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("Acil Bildirim (Sesli & Öne Çıkan)", color = colors.textMuted, fontSize = 12.sp)
                            Switch(
                                checked = isUrgent,
                                onCheckedChange = { isUrgent = it },
                                colors = SwitchDefaults.colors(
                                    checkedThumbColor = colors.accent,
                                    checkedTrackColor = colors.accent.copy(alpha = 0.3f)
                                )
                            )
                        }

                        Spacer(modifier = Modifier.height(12.dp))

                        Button(
                            onClick = { sendNotification() },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = colors.accent),
                            enabled = !isSendingNotif && notifMessage.isNotBlank()
                        ) {
                            if (isSendingNotif) {
                                CircularProgressIndicator(modifier = Modifier.size(16.dp), color = colors.surface)
                            } else {
                                Icon(Icons.Rounded.Send, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("PC'ye Gönder", fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // PC Alarm Section
                if (mode == ConnectionMode.LOCAL) {
                    GlassCard(
                        modifier = Modifier.fillMaxWidth(),
                        backgroundColor = colors.surfaceRaised
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Rounded.Alarm, contentDescription = null, tint = colors.accent, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("PC Alarmı Kur", color = colors.textPrimary, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                            }

                            Spacer(modifier = Modifier.height(12.dp))

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                val minutesList = listOf(5, 10, 15, 30, 60)
                                minutesList.forEach { mins ->
                                    val isSelected = alarmMinutes == mins
                                    Box(
                                        modifier = Modifier
                                            .weight(1f)
                                            .clip(RoundedCornerShape(8.dp))
                                            .background(if (isSelected) colors.accent.copy(alpha = 0.22f) else colors.surface)
                                            .clickable { alarmMinutes = mins }
                                            .padding(vertical = 8.dp),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text(
                                            text = "${mins}dk",
                                            color = if (isSelected) colors.accent else colors.textMuted,
                                            fontSize = 12.sp,
                                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                                        )
                                    }
                                }
                            }

                            Spacer(modifier = Modifier.height(10.dp))

                            OutlinedTextField(
                                value = alarmNote,
                                onValueChange = { alarmNote = it },
                                label = { Text("Alarm Notu (İsteğe bağlı)", fontSize = 12.sp) },
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(10.dp),
                                singleLine = true
                            )

                            Spacer(modifier = Modifier.height(12.dp))

                            Button(
                                onClick = { createAlarm() },
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(10.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = colors.accent.copy(alpha = 0.85f)),
                                enabled = !isCreatingAlarm
                            ) {
                                Icon(Icons.Rounded.AlarmAdd, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Alarmı Başlat", fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
        }
    }
}
