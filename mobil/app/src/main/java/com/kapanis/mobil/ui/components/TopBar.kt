package com.kapanis.mobil.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Cloud
import androidx.compose.material.icons.rounded.Wifi
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kapanis.mobil.data.ConnectionMode
import com.kapanis.mobil.data.ConnectionTarget
import com.kapanis.mobil.ui.theme.AccentBlue
import com.kapanis.mobil.ui.theme.AccentInk
import com.kapanis.mobil.ui.theme.DarkPaper
import com.kapanis.mobil.ui.theme.DarkSurface
import com.kapanis.mobil.ui.theme.DarkSurfaceRaised
import com.kapanis.mobil.ui.theme.InkPrimary
import com.kapanis.mobil.ui.theme.SuccessGreen
import com.kapanis.mobil.ui.theme.TextFaint
import com.kapanis.mobil.ui.theme.TextMuted

@Composable
fun TopBar(
    mode: ConnectionMode,
    target: ConnectionTarget,
    onlineDeviceName: String,
    pairingCode: String,
    isOnlineConnected: Boolean,
    onToggleMode: (ConnectionMode) -> Unit,
    onStatusClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(DarkPaper)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Brand Title & Mode Selector
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(AccentBlue)
            )
            Text(
                text = "kapanış.",
                color = InkPrimary,
                fontWeight = FontWeight.Bold,
                fontSize = 18.sp,
                letterSpacing = (-0.5).sp
            )

            // Mode Pill
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .background(DarkSurfaceRaised)
                    .padding(2.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(if (mode == ConnectionMode.ONLINE) AccentBlue else DarkSurfaceRaised)
                        .clickable { onToggleMode(ConnectionMode.ONLINE) }
                        .padding(horizontal = 6.dp, vertical = 3.dp)
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Cloud,
                        contentDescription = "Bulut",
                        tint = if (mode == ConnectionMode.ONLINE) AccentInk else TextFaint,
                        modifier = Modifier.size(12.dp)
                    )
                }

                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(if (mode == ConnectionMode.LOCAL) AccentBlue else DarkSurfaceRaised)
                        .clickable { onToggleMode(ConnectionMode.LOCAL) }
                        .padding(horizontal = 6.dp, vertical = 3.dp)
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Wifi,
                        contentDescription = "Yerel",
                        tint = if (mode == ConnectionMode.LOCAL) AccentInk else TextFaint,
                        modifier = Modifier.size(12.dp)
                    )
                }
            }
        }

        // Connection Status Pill
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(20.dp))
                .background(DarkSurface)
                .clickable(onClick = onStatusClick)
                .padding(horizontal = 10.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            val connected = if (mode == ConnectionMode.ONLINE) isOnlineConnected else target.isConnected
            val label = if (mode == ConnectionMode.ONLINE) {
                if (isOnlineConnected) (onlineDeviceName.ifEmpty { "Bulut PC" } + if (pairingCode.isNotEmpty()) " ($pairingCode)" else "") else "Bulut Bekleniyor"
            } else {
                if (target.isConnected) target.deviceName else "Wi-Fi Bağlı Değil"
            }

            Box(
                modifier = Modifier
                    .size(6.dp)
                    .clip(CircleShape)
                    .background(if (connected) SuccessGreen else TextFaint)
            )
            Text(
                text = label,
                color = if (connected) InkPrimary else TextMuted,
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
                fontFamily = FontFamily.Monospace,
                maxLines = 1
            )
        }
    }
}
