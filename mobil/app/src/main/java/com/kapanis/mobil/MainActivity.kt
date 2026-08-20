package com.kapanis.mobil

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.kapanis.mobil.data.ConnectionMode
import com.kapanis.mobil.data.ConnectionTarget
import com.kapanis.mobil.data.PreferencesManager
import com.kapanis.mobil.network.KapanisApiClient
import com.kapanis.mobil.network.SupabaseRemoteClient
import com.kapanis.mobil.ui.screens.MainScreen
import com.kapanis.mobil.ui.theme.KapanisTheme

class MainActivity : ComponentActivity() {

    private lateinit var prefs: PreferencesManager
    private val apiClient = KapanisApiClient()
    private val supabaseClient = SupabaseRemoteClient()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        prefs = PreferencesManager(this)
        val initialTarget = parseIntentUri(intent?.data)

        setContent {
            var currentTheme by remember { mutableStateOf(prefs.themeMode) }

            KapanisTheme(darkTheme = currentTheme == "dark") {
                MainScreen(
                    prefs = prefs,
                    apiClient = apiClient,
                    supabaseClient = supabaseClient,
                    initialTarget = initialTarget,
                    currentTheme = currentTheme,
                    onToggleTheme = {
                        val next = if (currentTheme == "dark") "light" else "dark"
                        prefs.themeMode = next
                        currentTheme = next
                    }
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val target = parseIntentUri(intent.data)
        if (target != null) {
            prefs.host = target.host
            prefs.port = target.port
            prefs.deviceName = target.deviceName
            setContent {
                var currentTheme by remember { mutableStateOf(prefs.themeMode) }

                KapanisTheme(darkTheme = currentTheme == "dark") {
                    MainScreen(
                        prefs = prefs,
                        apiClient = apiClient,
                        supabaseClient = supabaseClient,
                        initialTarget = target,
                        currentTheme = currentTheme,
                        onToggleTheme = {
                            val next = if (currentTheme == "dark") "light" else "dark"
                            prefs.themeMode = next
                            currentTheme = next
                        }
                    )
                }
            }
        }
    }

    private fun parseIntentUri(data: Uri?): ConnectionTarget? {
        if (data == null || data.scheme != "kapanis") return null

        // Parse Online parameters
        val code = data.getQueryParameter("code")
        val supabaseUrl = data.getQueryParameter("supabaseUrl")
        val supabaseKey = data.getQueryParameter("supabaseKey")
        val name = data.getQueryParameter("name") ?: "Windows PC"

        if (!code.isNullOrEmpty()) {
            prefs.pairingCode = code
            if (!supabaseUrl.isNullOrEmpty()) prefs.supabaseUrl = supabaseUrl
            if (!supabaseKey.isNullOrEmpty()) prefs.supabaseAnonKey = supabaseKey
            prefs.deviceName = name
            prefs.mode = ConnectionMode.ONLINE
        }

        // Parse Local parameters
        val host = data.getQueryParameter("host") ?: return null
        val port = data.getQueryParameter("port")?.toIntOrNull() ?: 53317
        prefs.host = host
        prefs.port = port
        prefs.deviceName = name

        return ConnectionTarget(
            host = host,
            port = port,
            deviceName = name,
            isConnected = false
        )
    }
}
