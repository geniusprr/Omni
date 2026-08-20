package com.kapanis.mobil.ui.components

import androidx.compose.animation.Crossfade
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Cloud
import androidx.compose.material.icons.rounded.DarkMode
import androidx.compose.material.icons.rounded.Devices
import androidx.compose.material.icons.rounded.LightMode
import androidx.compose.material.icons.rounded.Wifi
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kapanis.mobil.data.ConnectionMode
import com.kapanis.mobil.data.ConnectionTarget
import com.kapanis.mobil.ui.theme.KapanisTheme

@Composable
fun TopBar(
    mode: ConnectionMode,
    target: ConnectionTarget,
    onlineDeviceName: String,
    isOnlineConnected: Boolean,
    currentTheme: String,
    onToggleTheme: () -> Unit,
    onToggleMode: (ConnectionMode) -> Unit,
    onOpenPairingModal: () -> Unit
) {
    val colors = KapanisTheme.colors
    val isConnected = if (mode == ConnectionMode.LOCAL) target.isConnected else isOnlineConnected
    val activeDeviceName = if (mode == ConnectionMode.LOCAL) {
        if (target.deviceName.isNotEmpty()) target.deviceName else "Yerel PC"
    } else {
        if (onlineDeviceName.isNotEmpty()) onlineDeviceName else "Bulut PC"
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.paper)
            .statusBarsPadding()
            .padding(horizontal = 16.dp, vertical = 8.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Left: Logo & Connected PC Greeting Pill
            Column(
                modifier = Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .clickable(onClick = onOpenPairingModal)
                    .padding(vertical = 4.dp, horizontal = 2.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text(
                        text = "kapanış.",
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Black,
                        color = colors.textPrimary,
                        letterSpacing = (-0.7).sp
                    )
                    
                    // Connected Status Pill
                    Surface(
                        shape = RoundedCornerShape(20.dp),
                        color = colors.surfaceRaised,
                        border = BorderStroke(1.dp, colors.border)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(5.dp)
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
                                text = if (isConnected) activeDeviceName else "Bağlantı Yok",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = if (isConnected) colors.textPrimary else colors.textMuted
                            )
                        }
                    }
                }

                Text(
                    text = if (mode == ConnectionMode.LOCAL) {
                        if (isConnected) "Wi-Fi: ${target.host}:${target.port}" else "Yerel ağ aranıyor..."
                    } else {
                        if (isConnected) "Bulut senkronizasyonu aktif" else "Bulut eşleştirmesi bekliyor"
                    },
                    fontSize = 11.sp,
                    color = colors.textMuted,
                    modifier = Modifier.padding(start = 2.dp, top = 2.dp)
                )
            }

            // Right: Action Capsule (Mode Switcher, Theme Switcher, Devices Modal)
            Surface(
                shape = RoundedCornerShape(14.dp),
                color = colors.surfaceGlass,
                border = BorderStroke(1.dp, colors.border)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 4.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    // Mode Switcher (Yerel / Bulut)
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = colors.surfaceRaised,
                        modifier = Modifier.clickable {
                            val next = if (mode == ConnectionMode.LOCAL) ConnectionMode.ONLINE else ConnectionMode.LOCAL
                            onToggleMode(next)
                        }
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp),
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

                    // Theme Toggle Button (Sun / Moon)
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(colors.surfaceRaised)
                            .clickable(onClick = onToggleTheme),
                        contentAlignment = Alignment.Center
                    ) {
                        Crossfade(targetState = currentTheme == "dark", label = "ThemeCrossfade") { isDark ->
                            Icon(
                                imageVector = if (isDark) Icons.Rounded.LightMode else Icons.Rounded.DarkMode,
                                contentDescription = "Tema Değiştir",
                                tint = if (isDark) Color(0xFFFBBF24) else Color(0xFF6366F1),
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    }

                    // Devices / Pairing Button
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(colors.surfaceRaised)
                            .clickable(onClick = onOpenPairingModal),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Devices,
                            contentDescription = "Cihazlar & Eşleşme",
                            tint = colors.textPrimary,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }
            }
        }
    }
}
