package com.kapanis.mobil.ui.components

import androidx.compose.animation.Crossfade
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.AccountTree
import androidx.compose.material.icons.rounded.Cloud
import androidx.compose.material.icons.rounded.CloudSync
import androidx.compose.material.icons.rounded.DarkMode
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Devices
import androidx.compose.material.icons.rounded.EditNote
import androidx.compose.material.icons.rounded.LightMode
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Wifi
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kapanis.mobil.data.ConnectionMode
import com.kapanis.mobil.data.ConnectionTarget
import com.kapanis.mobil.data.vault.VaultNote
import com.kapanis.mobil.ui.theme.KapanisTheme

@Composable
fun TopBar(
    currentTab: NavTab,
    mode: ConnectionMode,
    target: ConnectionTarget,
    onlineDeviceName: String,
    isOnlineConnected: Boolean,
    currentTheme: String,
    onToggleTheme: () -> Unit,
    onToggleMode: (ConnectionMode) -> Unit,
    onOpenPairingModal: () -> Unit,
    // Notes tab props
    notesCount: Int = 0,
    activeEditingNote: VaultNote? = null,
    isSyncingNotes: Boolean = false,
    onBackFromNote: () -> Unit = {},
    onSearchNotes: () -> Unit = {},
    onSyncNotes: () -> Unit = {},
    onShowBacklinks: () -> Unit = {},
    onDeleteCurrentNote: () -> Unit = {}
) {
    val colors = KapanisTheme.colors
    val isConnected = if (mode == ConnectionMode.LOCAL) target.isConnected else isOnlineConnected
    val activeDeviceName = if (mode == ConnectionMode.LOCAL) {
        if (target.deviceName.isNotEmpty()) target.deviceName else "Yerel PC"
    } else {
        if (onlineDeviceName.isNotEmpty()) onlineDeviceName else "Bulut PC"
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.paper)
            .statusBarsPadding()
            .padding(horizontal = 14.dp, vertical = 6.dp)
    ) {
        // STATE 1: ACTIVE NOTE EDITING (Clean, unified editor header)
        if (activeEditingNote != null) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Left: Back button & Note Title + Save indicator
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.weight(1f)
                ) {
                    IconButton(
                        onClick = onBackFromNote,
                        modifier = Modifier.size(36.dp)
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                            contentDescription = "Geri",
                            tint = colors.textPrimary,
                            modifier = Modifier.size(20.dp)
                        )
                    }

                    Spacer(modifier = Modifier.width(6.dp))

                    Column {
                        Text(
                            text = activeEditingNote.title,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = colors.textPrimary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(5.dp)
                                    .background(colors.success, CircleShape)
                            )
                            Text(
                                text = "Otomatik Kaydedildi",
                                fontSize = 10.sp,
                                color = colors.textMuted
                            )
                        }
                    }
                }

                // Right: Backlinks & Delete Actions
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    if (activeEditingNote.backlinks.isNotEmpty()) {
                        IconButton(
                            onClick = onShowBacklinks,
                            modifier = Modifier.size(34.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.AccountTree,
                                contentDescription = "Geri Bağlantılar",
                                tint = colors.accent,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }

                    IconButton(
                        onClick = onDeleteCurrentNote,
                        modifier = Modifier.size(34.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Delete,
                            contentDescription = "Notu Sil",
                            tint = colors.danger.copy(alpha = 0.8f),
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
            }
            return@Box
        }

        // STATE 2: NOTES TAB HOME (Unified Defter Header)
        if (currentTab == NavTab.NOTES) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Left: Defter Title + Note count
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .background(colors.accent.copy(alpha = 0.14f), RoundedCornerShape(9.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.EditNote,
                            contentDescription = null,
                            tint = colors.accent,
                            modifier = Modifier.size(19.dp)
                        )
                    }

                    Column {
                        Text(
                            text = "Defter",
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = colors.textPrimary
                        )
                        Text(
                            text = "$notesCount not kayıtlı",
                            fontSize = 10.sp,
                            color = colors.textMuted
                        )
                    }
                }

                // Right: Search, PC Sync, Theme & Pairing buttons
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    IconButton(
                        onClick = onSearchNotes,
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Search,
                            contentDescription = "Not Ara",
                            tint = colors.accent,
                            modifier = Modifier.size(18.dp)
                        )
                    }

                    IconButton(
                        onClick = onSyncNotes,
                        enabled = !isSyncingNotes,
                        modifier = Modifier.size(32.dp)
                    ) {
                        if (isSyncingNotes) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(15.dp),
                                color = colors.accent,
                                strokeWidth = 2.dp
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Rounded.CloudSync,
                                contentDescription = "PC ile Eşitle",
                                tint = if (isConnected) colors.accent else colors.textMuted,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }

                    // Theme Toggle
                    Box(
                        modifier = Modifier
                            .size(28.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(colors.surfaceRaised)
                            .clickable(onClick = onToggleTheme),
                        contentAlignment = Alignment.Center
                    ) {
                        Crossfade(targetState = currentTheme == "dark", label = "ThemeCrossfade") { isDark ->
                            Icon(
                                imageVector = if (isDark) Icons.Rounded.LightMode else Icons.Rounded.DarkMode,
                                contentDescription = "Tema",
                                tint = if (isDark) colors.warning else colors.accent,
                                modifier = Modifier.size(14.dp)
                            )
                        }
                    }

                    // Devices button
                    Box(
                        modifier = Modifier
                            .size(28.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(colors.surfaceRaised)
                            .clickable(onClick = onOpenPairingModal),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Devices,
                            contentDescription = "Cihazlar",
                            tint = colors.textPrimary,
                            modifier = Modifier.size(14.dp)
                        )
                    }
                }
            }
            return@Box
        }

        // STATE 3: DEFAULT TOPBAR (Home & Transfer Tabs)
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Left: Device Connection Status
            Surface(
                shape = RoundedCornerShape(16.dp),
                color = colors.surfaceGlass,
                border = BorderStroke(1.dp, if (isConnected) colors.success.copy(alpha = 0.35f) else colors.border),
                modifier = Modifier
                    .clip(RoundedCornerShape(16.dp))
                    .clickable(onClick = onOpenPairingModal)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(7.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(7.dp)
                            .background(
                                color = if (isConnected) colors.success else colors.danger,
                                shape = CircleShape
                            )
                    )
                    Text(
                        text = if (isConnected) activeDeviceName else "Bağlantı Bekliyor",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = colors.textPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Surface(
                        shape = RoundedCornerShape(6.dp),
                        color = colors.surfaceRaised
                    ) {
                        Text(
                            text = if (mode == ConnectionMode.LOCAL) "Wi-Fi" else "Bulut",
                            fontSize = 9.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = colors.textMuted,
                            modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp)
                        )
                    }
                }
            }

            // Right: Actions Capsule (Mode Toggle, Theme Toggle, Devices Modal)
            Surface(
                shape = RoundedCornerShape(16.dp),
                color = colors.surfaceGlass,
                border = BorderStroke(1.dp, colors.border),
                shadowElevation = if (colors.isDark) 2.dp else 4.dp
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 4.dp, vertical = 3.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    // Mode Toggle Pill
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(11.dp))
                            .background(colors.surfaceRaised)
                            .clickable {
                                val next = if (mode == ConnectionMode.LOCAL) ConnectionMode.ONLINE else ConnectionMode.LOCAL
                                onToggleMode(next)
                            }
                            .padding(horizontal = 8.dp, vertical = 5.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Icon(
                                imageVector = if (mode == ConnectionMode.LOCAL) Icons.Rounded.Wifi else Icons.Rounded.Cloud,
                                contentDescription = null,
                                tint = colors.accent,
                                modifier = Modifier.size(13.dp)
                            )
                            Text(
                                text = if (mode == ConnectionMode.LOCAL) "Yerel" else "Bulut",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = colors.textPrimary
                            )
                        }
                    }

                    // Theme Toggle
                    Box(
                        modifier = Modifier
                            .size(30.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(colors.surfaceRaised)
                            .clickable(onClick = onToggleTheme),
                        contentAlignment = Alignment.Center
                    ) {
                        Crossfade(targetState = currentTheme == "dark", label = "ThemeCrossfade") { isDark ->
                            Icon(
                                imageVector = if (isDark) Icons.Rounded.LightMode else Icons.Rounded.DarkMode,
                                contentDescription = "Tema",
                                tint = if (isDark) colors.warning else colors.accent,
                                modifier = Modifier.size(15.dp)
                            )
                        }
                    }

                    // Devices / Pairing Button
                    Box(
                        modifier = Modifier
                            .size(30.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(colors.surfaceRaised)
                            .clickable(onClick = onOpenPairingModal),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Devices,
                            contentDescription = "Cihazlar",
                            tint = colors.textPrimary,
                            modifier = Modifier.size(15.dp)
                        )
                    }
                }
            }
        }
    }
}
