package com.kapanis.mobil.ui.screens

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.kapanis.mobil.data.ConnectionMode
import com.kapanis.mobil.data.ConnectionTarget
import com.kapanis.mobil.data.NoteItem
import com.kapanis.mobil.data.PreferencesManager
import com.kapanis.mobil.data.TransferItem
import com.kapanis.mobil.network.KapanisApiClient
import com.kapanis.mobil.network.SupabaseRemoteClient
import com.kapanis.mobil.ui.components.BottomNavBar
import com.kapanis.mobil.ui.components.NavTab
import com.kapanis.mobil.ui.components.TopBar
import com.kapanis.mobil.ui.theme.DarkPaper

@Composable
fun MainScreen(
    prefs: PreferencesManager,
    apiClient: KapanisApiClient,
    supabaseClient: SupabaseRemoteClient,
    initialTarget: ConnectionTarget? = null
) {
    var mode by remember { mutableStateOf(prefs.mode) }

    var selectedTab by remember {
        mutableStateOf(if (mode == ConnectionMode.ONLINE) NavTab.ONLINE_POWER else NavTab.DEFTER)
    }

    var target by remember {
        mutableStateOf(
            initialTarget ?: ConnectionTarget(
                host = prefs.host,
                port = prefs.port,
                deviceName = prefs.deviceName,
                isConnected = false
            )
        )
    }

    var isOnlineConnected by remember { mutableStateOf(prefs.pairedDeviceId.isNotEmpty()) }
    var notes by remember { mutableStateOf<List<NoteItem>>(emptyList()) }
    var transfers by remember { mutableStateOf<List<TransferItem>>(emptyList()) }

    // Auto check connections on launch
    LaunchedEffect(mode, target.host, target.port, prefs.pairedDeviceId) {
        if (mode == ConnectionMode.LOCAL) {
            val result = apiClient.ping(target.host, target.port)
            if (result.isSuccess) {
                val status = result.getOrNull()
                target = target.copy(
                    deviceName = status?.deviceName ?: target.deviceName,
                    isConnected = true
                )
                val notesResult = apiClient.fetchNotes(target.host, target.port)
                if (notesResult.isSuccess) {
                    notes = notesResult.getOrNull() ?: emptyList()
                }
            } else {
                target = target.copy(isConnected = false)
            }
        } else {
            if (prefs.supabaseUrl.isNotEmpty() && prefs.pairedDeviceId.isNotEmpty()) {
                val res = supabaseClient.fetchDeviceState(
                    prefs.supabaseUrl,
                    prefs.supabaseAnonKey,
                    prefs.pairedDeviceId
                )
                isOnlineConnected = res.isSuccess
            }
        }
    }

    fun handleModeToggle(newMode: ConnectionMode) {
        mode = newMode
        prefs.mode = newMode
        selectedTab = if (newMode == ConnectionMode.ONLINE) NavTab.ONLINE_POWER else NavTab.DEFTER
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DarkPaper)
            .statusBarsPadding()
    ) {
        TopBar(
            mode = mode,
            target = target,
            onlineDeviceName = prefs.deviceName,
            pairingCode = prefs.pairingCode,
            isOnlineConnected = isOnlineConnected,
            onToggleMode = { handleModeToggle(it) },
            onStatusClick = { selectedTab = NavTab.CONNECT }
        )

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
        ) {
            AnimatedContent(
                targetState = selectedTab,
                transitionSpec = { fadeIn() togetherWith fadeOut() },
                label = "TabTransition"
            ) { tab ->
                when (tab) {
                    NavTab.ONLINE_POWER -> OnlinePowerScreen(
                        prefs = prefs,
                        supabaseClient = supabaseClient,
                        onNavigateToConnect = { selectedTab = NavTab.CONNECT }
                    )
                    NavTab.DEFTER -> DefterScreen(
                        target = target,
                        apiClient = apiClient,
                        notes = notes,
                        onNotesUpdated = { notes = it }
                    )
                    NavTab.TRANSFER -> TransferScreen(
                        target = target,
                        apiClient = apiClient,
                        transfers = transfers,
                        onTransfersUpdated = { transfers = it }
                    )
                    NavTab.NOTIFY -> NotifyScreen(
                        target = target,
                        apiClient = apiClient
                    )
                    NavTab.CONNECT -> ConnectScreen(
                        target = target,
                        prefs = prefs,
                        apiClient = apiClient,
                        supabaseClient = supabaseClient,
                        onTargetChanged = { target = it },
                        onModeChanged = { newMode ->
                            handleModeToggle(newMode)
                        }
                    )
                }
            }
        }

        BottomNavBar(
            mode = mode,
            selectedTab = selectedTab,
            onTabSelected = { selectedTab = it }
        )
    }
}
