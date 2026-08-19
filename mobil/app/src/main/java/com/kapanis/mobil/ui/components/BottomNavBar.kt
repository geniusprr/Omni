package com.kapanis.mobil.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.FolderShared
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.PowerSettingsNew
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Wifi
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kapanis.mobil.data.ConnectionMode
import com.kapanis.mobil.ui.theme.AccentBlue
import com.kapanis.mobil.ui.theme.DarkPaper
import com.kapanis.mobil.ui.theme.DarkSurface
import com.kapanis.mobil.ui.theme.TextFaint
import com.kapanis.mobil.ui.theme.TextMuted

enum class NavTab(val title: String, val icon: ImageVector) {
    ONLINE_POWER("Güç Planla", Icons.Rounded.PowerSettingsNew),
    DEFTER("Defter", Icons.Rounded.Description),
    TRANSFER("Aktarım", Icons.Rounded.FolderShared),
    NOTIFY("Bildirim", Icons.Rounded.Notifications),
    CONNECT("Eşleşme", Icons.Rounded.Settings)
}

@Composable
fun BottomNavBar(
    mode: ConnectionMode,
    selectedTab: NavTab,
    onTabSelected: (NavTab) -> Unit
) {
    val visibleTabs = if (mode == ConnectionMode.ONLINE) {
        listOf(NavTab.ONLINE_POWER, NavTab.DEFTER, NavTab.CONNECT)
    } else {
        listOf(NavTab.DEFTER, NavTab.TRANSFER, NavTab.NOTIFY, NavTab.CONNECT)
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(DarkPaper)
            .navigationBarsPadding()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(60.dp)
                .background(DarkSurface)
                .padding(horizontal = 8.dp),
            horizontalArrangement = Arrangement.SpaceAround,
            verticalAlignment = Alignment.CenterVertically
        ) {
            visibleTabs.forEach { tab ->
                val isSelected = tab == selectedTab
                Column(
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .clickable { onTabSelected(tab) }
                        .padding(horizontal = 14.dp, vertical = 6.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Icon(
                        imageVector = tab.icon,
                        contentDescription = tab.title,
                        modifier = Modifier.size(20.dp),
                        tint = if (isSelected) AccentBlue else TextFaint
                    )
                    Text(
                        text = tab.title,
                        fontSize = 11.sp,
                        fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                        color = if (isSelected) AccentBlue else TextMuted
                    )
                }
            }
        }
    }
}
