package com.kapanis.mobil.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kapanis.mobil.ui.theme.KapanisTheme

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
    val colors = KapanisTheme.colors

    Box(modifier = modifier) {
        if (expanded) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.5f))
                    .clickable { expanded = false }
            )
        }

        Column(
            horizontalAlignment = Alignment.End,
            verticalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(bottom = 84.dp, end = 16.dp)
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
                        containerColor = colors.surfaceRaised,
                        contentColor = colors.accent,
                        onClick = {
                            expanded = false
                            onShutdown30m()
                        }
                    )

                    FabActionItem(
                        icon = Icons.Rounded.PowerSettingsNew,
                        label = "60 Dk Sonra Kapat",
                        containerColor = colors.surfaceRaised,
                        contentColor = colors.accent,
                        onClick = {
                            expanded = false
                            onShutdown60m()
                        }
                    )

                    FabActionItem(
                        icon = Icons.Rounded.Stop,
                        label = "Sayacı İptal Et",
                        containerColor = colors.danger.copy(alpha = 0.2f),
                        contentColor = colors.danger,
                        onClick = {
                            expanded = false
                            onCancelTimer()
                        }
                    )

                    FabActionItem(
                        icon = Icons.Rounded.Alarm,
                        label = "Hızlı Alarm Kur",
                        containerColor = colors.surfaceRaised,
                        contentColor = colors.textPrimary,
                        onClick = {
                            expanded = false
                            onQuickAlarm()
                        }
                    )

                    FabActionItem(
                        icon = Icons.Rounded.ContentPaste,
                        label = "Panoyu PC'ye Aktar",
                        containerColor = colors.surfaceRaised,
                        contentColor = colors.textPrimary,
                        onClick = {
                            expanded = false
                            onSendClipboard()
                        }
                    )

                    FabActionItem(
                        icon = Icons.Rounded.Image,
                        label = "Fotoğraf Gönder",
                        containerColor = colors.surfaceRaised,
                        contentColor = colors.textPrimary,
                        onClick = {
                            expanded = false
                            onSendPhoto()
                        }
                    )

                    FabActionItem(
                        icon = Icons.Rounded.NotificationsActive,
                        label = "PC'ye Bildirim Gönder",
                        containerColor = colors.surfaceRaised,
                        contentColor = colors.textPrimary,
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
                containerColor = if (expanded) colors.surfaceRaised else colors.accent,
                contentColor = if (expanded) colors.textPrimary else colors.accentInk,
                shape = CircleShape,
                modifier = Modifier.size(52.dp)
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
    val colors = KapanisTheme.colors

    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.End,
        modifier = Modifier
            .clickable { onClick() }
            .padding(vertical = 2.dp)
    ) {
        Surface(
            color = colors.surfaceGlass,
            shape = RoundedCornerShape(10.dp),
            border = BorderStroke(1.dp, colors.border),
            modifier = Modifier.padding(end = 8.dp)
        ) {
            Text(
                text = label,
                color = colors.textPrimary,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
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
