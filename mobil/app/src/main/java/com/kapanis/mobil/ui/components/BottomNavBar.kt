package com.kapanis.mobil.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Alarm
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Devices
import androidx.compose.material.icons.rounded.FolderShared
import androidx.compose.material.icons.rounded.NotificationsActive
import androidx.compose.material.icons.rounded.PowerSettingsNew
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kapanis.mobil.ui.theme.KapanisTheme

enum class NavTab(val title: String, val icon: ImageVector) {
    POWER("Güç", Icons.Rounded.PowerSettingsNew),
    ALARMS("Alarmlar", Icons.Rounded.Alarm),
    DEFTER("Defter", Icons.Rounded.Description),
    TRANSFER("Aktarım", Icons.Rounded.FolderShared),
    NOTIFY("Bildirim", Icons.Rounded.NotificationsActive),
    CONNECT("Cihazlar", Icons.Rounded.Devices)
}

@Composable
fun BottomNavBar(
    selectedTab: NavTab,
    alarmsCount: Int = 0,
    onTabSelected: (NavTab) -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = KapanisTheme.colors

    Box(
        modifier = modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .padding(horizontal = 14.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center
    ) {
        Surface(
            shape = RoundedCornerShape(22.dp),
            color = colors.surfaceGlass,
            border = BorderStroke(1.dp, colors.borderStrong),
            shadowElevation = if (colors.isDark) 8.dp else 12.dp,
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(64.dp)
                    .padding(horizontal = 6.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                NavTab.entries.forEach { tab ->
                    val isSelected = tab == selectedTab
                    val iconColor by animateColorAsState(
                        targetValue = if (isSelected) colors.accent else colors.textFaint,
                        label = "iconColor"
                    )
                    val bgColor by animateColorAsState(
                        targetValue = if (isSelected) colors.accent.copy(alpha = if (colors.isDark) 0.16f else 0.12f) else colors.surfaceGlass.copy(alpha = 0f),
                        label = "bgColor"
                    )

                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(14.dp))
                            .background(bgColor)
                            .clickable { onTabSelected(tab) }
                            .padding(vertical = 4.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center
                        ) {
                            Box(contentAlignment = Alignment.TopEnd) {
                                Icon(
                                    imageVector = tab.icon,
                                    contentDescription = tab.title,
                                    modifier = Modifier.size(20.dp),
                                    tint = iconColor
                                )

                                if (tab == NavTab.ALARMS && alarmsCount > 0) {
                                    Box(
                                        modifier = Modifier
                                            .padding(start = 12.dp, bottom = 8.dp)
                                            .size(8.dp)
                                            .background(colors.accent, CircleShape)
                                    )
                                }
                            }

                            Text(
                                text = tab.title,
                                fontSize = 10.sp,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                color = if (isSelected) colors.textPrimary else colors.textMuted,
                                maxLines = 1
                            )
                        }
                    }
                }
            }
        }
    }
}
