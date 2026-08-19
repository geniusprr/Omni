package com.kapanis.mobil.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Alarm
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ContentPaste
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.NotificationsActive
import androidx.compose.material.icons.rounded.PowerSettingsNew
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material.icons.rounded.Timer
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.SmallFloatingActionButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kapanis.mobil.ui.theme.AccentBlue
import com.kapanis.mobil.ui.theme.AccentInk
import com.kapanis.mobil.ui.theme.DangerRed
import com.kapanis.mobil.ui.theme.DarkPaper
import com.kapanis.mobil.ui.theme.DarkSurface
import com.kapanis.mobil.ui.theme.DarkSurfaceRaised
import com.kapanis.mobil.ui.theme.InkPrimary
import com.kapanis.mobil.ui.theme.TextMuted

@Composable
fun QuickActionFab(
    onShutdown30m: () -> Unit,
    onShutdown60m: () -> Unit,
    onCancelTimer: () -> Unit,
    onQuickAlarm: () -> Unit,
    onSendClipboard: () -> Unit,
    onSendPhoto: () -> Unit,
    onSendNotification: () -> Unit,
    modifier: Modifier = Modifier
) {
    var expanded by remember { mutableStateOf(false) }

    Box(modifier = modifier) {
        if (expanded) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.6f))
                    .clickable { expanded = false }
            )
        }

        Column(
            horizontalAlignment = Alignment.End,
            verticalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(bottom = 16.dp, end = 16.dp)
        ) {
            AnimatedVisibility(
                visible = expanded,
                enter = fadeIn() + slideInVertically(initialOffsetY = { it / 2 }),
                exit = fadeOut() + slideOutVertically(targetOffsetY = { it / 2 })
            ) {
                Column(
                    horizontalAlignment = Alignment.End,
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    FabActionItem(
                        icon = Icons.Rounded.Timer,
                        label = "30 Dk Sonra Kapat",
                        containerColor = DarkSurfaceRaised,
                        contentColor = AccentBlue,
                        onClick = {
                            expanded = false
                            onShutdown30m()
                        }
                    )

                    FabActionItem(
                        icon = Icons.Rounded.PowerSettingsNew,
                        label = "60 Dk Sonra Kapat",
                        containerColor = DarkSurfaceRaised,
                        contentColor = AccentBlue,
                        onClick = {
                            expanded = false
                            onShutdown60m()
                        }
                    )

                    FabActionItem(
                        icon = Icons.Rounded.Stop,
                        label = "Sayacı İptal Et",
                        containerColor = DangerRed.copy(alpha = 0.2f),
                        contentColor = DangerRed,
                        onClick = {
                            expanded = false
                            onCancelTimer()
                        }
                    )

                    FabActionItem(
                        icon = Icons.Rounded.Alarm,
                        label = "Hızlı Alarm Kur",
                        containerColor = DarkSurfaceRaised,
                        contentColor = InkPrimary,
                        onClick = {
                            expanded = false
                            onQuickAlarm()
                        }
                    )

                    FabActionItem(
                        icon = Icons.Rounded.ContentPaste,
                        label = "Panoyu PC'ye Aktar",
                        containerColor = DarkSurfaceRaised,
                        contentColor = InkPrimary,
                        onClick = {
                            expanded = false
                            onSendClipboard()
                        }
                    )

                    FabActionItem(
                        icon = Icons.Rounded.Image,
                        label = "Fotoğraf Gönder",
                        containerColor = DarkSurfaceRaised,
                        contentColor = InkPrimary,
                        onClick = {
                            expanded = false
                            onSendPhoto()
                        }
                    )

                    FabActionItem(
                        icon = Icons.Rounded.NotificationsActive,
                        label = "PC'ye Bildirim Gönder",
                        containerColor = DarkSurfaceRaised,
                        contentColor = InkPrimary,
                        onClick = {
                            expanded = false
                            onSendNotification()
                        }
                    )

                    Spacer(modifier = Modifier.height(4.dp))
                }
            }

            FloatingActionButton(
                onClick = { expanded = !expanded },
                containerColor = if (expanded) DarkSurfaceRaised else AccentBlue,
                contentColor = if (expanded) InkPrimary else AccentInk,
                shape = CircleShape,
                modifier = Modifier.size(56.dp)
            ) {
                Icon(
                    imageVector = if (expanded) Icons.Rounded.Close else Icons.Rounded.Add,
                    contentDescription = if (expanded) "Kapat" else "Hızlı İşlemler",
                    modifier = Modifier.size(24.dp)
                )
            }
        }
    }
}

@Composable
private fun FabActionItem(
    icon: ImageVector,
    label: String,
    containerColor: Color,
    contentColor: Color,
    onClick: () -> Unit
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.End,
        modifier = Modifier
            .clickable { onClick() }
            .padding(vertical = 2.dp)
    ) {
        Surface(
            color = DarkSurface,
            shape = RoundedCornerShape(8.dp),
            modifier = Modifier.padding(end = 8.dp)
        ) {
            Text(
                text = label,
                color = InkPrimary,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
            )
        }

        SmallFloatingActionButton(
            onClick = onClick,
            containerColor = containerColor,
            contentColor = contentColor,
            shape = CircleShape,
            modifier = Modifier.size(40.dp)
        ) {
            Icon(imageVector = icon, contentDescription = label, modifier = Modifier.size(18.dp))
        }
    }
}
