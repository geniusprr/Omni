package com.kapanis.mobil.ui.screens

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Security
import androidx.compose.material.icons.rounded.Terminal
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kapanis.mobil.data.ConnectionMode
import com.kapanis.mobil.data.ConnectionTarget
import com.kapanis.mobil.data.PreferencesManager
import com.kapanis.mobil.data.RemoteTerminalStatus
import com.kapanis.mobil.data.TerminalCommandResult
import com.kapanis.mobil.network.KapanisApiClient
import com.kapanis.mobil.ui.components.GlassCard
import com.kapanis.mobil.ui.theme.KapanisTheme
import kotlinx.coroutines.launch

/**
 * A deliberately local-only console. The desktop process must already be
 * elevated; the mobile app never attempts to trigger or bypass a UAC prompt.
 */
@Composable
fun TerminalScreen(
    target: ConnectionTarget,
    mode: ConnectionMode,
    prefs: PreferencesManager,
    apiClient: KapanisApiClient
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val colors = KapanisTheme.colors
    val authToken = prefs.getLocalAuthToken(prefs.activeDeviceId.ifEmpty { target.host })

    var terminalStatus by remember { mutableStateOf<RemoteTerminalStatus?>(null) }
    var statusError by remember { mutableStateOf<String?>(null) }
    var isCheckingStatus by remember { mutableStateOf(false) }
    var command by remember { mutableStateOf("") }
    var showConfirmation by remember { mutableStateOf(false) }
    var isExecuting by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<TerminalCommandResult?>(null) }
    var recentCommands by remember { mutableStateOf<List<String>>(emptyList()) }

    fun refreshStatus() {
        if (mode != ConnectionMode.LOCAL) {
            terminalStatus = null
            statusError = "Yönetici CMD yalnızca Yerel Ağ modunda kullanılabilir."
            return
        }
        if (authToken.isBlank()) {
            terminalStatus = null
            statusError = "Önce Cihazlar ekranından PC'yi eşleştirin."
            return
        }

        isCheckingStatus = true
        statusError = null
        scope.launch {
            val response = apiClient.fetchTerminalStatus(target.host, target.port, authToken)
            isCheckingStatus = false
            if (response.isSuccess) {
                terminalStatus = response.getOrNull()
            } else {
                terminalStatus = null
                statusError = response.exceptionOrNull()?.message ?: "CMD durumu alınamadı."
            }
        }
    }

    fun runCommand() {
        val nextCommand = command.trim()
        if (nextCommand.isEmpty() || isExecuting) return
        showConfirmation = false
        isExecuting = true
        result = null

        scope.launch {
            val response = apiClient.executeTerminalCommand(target.host, target.port, nextCommand, authToken)
            isExecuting = false
            if (response.isSuccess) {
                val nextResult = response.getOrNull()
                result = nextResult
                recentCommands = (listOf(nextCommand) + recentCommands.filterNot { it == nextCommand }).take(8)
                if (nextResult?.exitCode == 0) {
                    Toast.makeText(context, "Komut tamamlandı ✓", Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(context, "Komut çıktı üretti; sonucu kontrol edin.", Toast.LENGTH_SHORT).show()
                }
            } else {
                val message = response.exceptionOrNull()?.message ?: "CMD komutu çalıştırılamadı."
                result = TerminalCommandResult(success = false, error = message)
                if (message.contains("Yönetici", ignoreCase = true)) refreshStatus()
            }
        }
    }

    LaunchedEffect(mode, target.host, target.port, authToken) {
        refreshStatus()
    }

    val canExecute = mode == ConnectionMode.LOCAL && authToken.isNotBlank() && terminalStatus?.available == true && terminalStatus?.isElevated == true
    val output = result?.let { terminalOutput(it) }.orEmpty()
    val hasResultError = result?.let { !it.success || it.timedOut || (it.exitCode != null && it.exitCode != 0) } == true

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            GlassCard(
                modifier = Modifier.fillMaxWidth(),
                backgroundColor = if (canExecute) colors.success.copy(alpha = if (colors.isDark) 0.12f else 0.08f) else colors.surfaceRaised,
                borderColor = if (canExecute) colors.success.copy(alpha = 0.42f) else colors.border
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(42.dp)
                            .background(if (canExecute) colors.success.copy(alpha = 0.16f) else colors.surface, RoundedCornerShape(12.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = if (canExecute) Icons.Rounded.Security else Icons.Rounded.Terminal,
                            contentDescription = null,
                            tint = if (canExecute) colors.success else colors.textMuted,
                            modifier = Modifier.size(22.dp)
                        )
                    }

                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Yönetici CMD · Yerel Ağ",
                            color = colors.textPrimary,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(3.dp))
                        Text(
                            text = when {
                                mode != ConnectionMode.LOCAL -> "Bulut modunda kapalı"
                                authToken.isBlank() -> "Eşleştirme gerekli"
                                isCheckingStatus -> "PC izinleri denetleniyor…"
                                terminalStatus?.isElevated == true -> "${target.deviceName.ifBlank { "Windows PC" }} yönetici modunda hazır"
                                terminalStatus?.available == true -> "PC uygulamasını Yönetici olarak yeniden başlatın"
                                else -> statusError ?: "CMD özelliği denetleniyor"
                            },
                            color = if (canExecute) colors.success else colors.textMuted,
                            fontSize = 11.sp,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis
                        )
                    }

                    IconButton(onClick = { refreshStatus() }, enabled = !isCheckingStatus) {
                        if (isCheckingStatus) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp), color = colors.accent, strokeWidth = 2.dp)
                        } else {
                            Icon(Icons.Rounded.Refresh, contentDescription = "Durumu yenile", tint = colors.accent, modifier = Modifier.size(20.dp))
                        }
                    }
                }
            }
        }

        if (!canExecute) {
            item {
                GlassCard(
                    modifier = Modifier.fillMaxWidth(),
                    backgroundColor = colors.warning.copy(alpha = if (colors.isDark) 0.10f else 0.07f),
                    borderColor = colors.warning.copy(alpha = 0.35f)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Nasıl açılır?", color = colors.textPrimary, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = when {
                                mode != ConnectionMode.LOCAL -> "Üst çubuktan Yerel moda geçin ve aynı Wi-Fi ağındaki PC'yi seçin."
                                authToken.isBlank() -> "Cihazlar ekranında PC'nin PIN koduyla eşleştirmeyi tamamlayın."
                                terminalStatus?.available == true -> "Bilgisayarda kapanış. uygulamasını kapatıp “Yönetici olarak çalıştır” ile yeniden açın, sonra buradan yenileyin."
                                else -> "Masaüstü uygulamasını bu güncelleme ile açın ve telefonun PC ile aynı Wi-Fi ağında olduğundan emin olun."
                            },
                            color = colors.textMuted,
                            fontSize = 12.sp,
                            lineHeight = 17.sp
                        )
                    }
                }
            }
        } else {
            item {
                GlassCard(
                    modifier = Modifier.fillMaxWidth(),
                    backgroundColor = colors.surfaceRaised,
                    borderColor = colors.border
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Komut", color = colors.textPrimary, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "CMD sözdizimi kullanın. Komutlar 30 saniye sonra durdurulur ve her çalıştırma için onay istenir.",
                            color = colors.textMuted,
                            fontSize = 11.sp,
                            lineHeight = 15.sp
                        )
                        Spacer(modifier = Modifier.height(10.dp))
                        OutlinedTextField(
                            value = command,
                            onValueChange = { if (it.length <= (terminalStatus?.maxCommandLength ?: 4096)) command = it },
                            modifier = Modifier.fillMaxWidth(),
                            placeholder = { Text("ör. whoami /all", fontFamily = FontFamily.Monospace) },
                            minLines = 3,
                            maxLines = 7,
                            textStyle = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 13.sp, color = colors.textPrimary),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = colors.accent,
                                unfocusedBorderColor = colors.border,
                                focusedContainerColor = colors.paper,
                                unfocusedContainerColor = colors.paper,
                                cursorColor = colors.accent
                            ),
                            shape = RoundedCornerShape(12.dp)
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.fillMaxWidth()) {
                            listOf("whoami", "ipconfig", "tasklist", "systeminfo").forEach { sample ->
                                TextButton(onClick = { command = sample }, modifier = Modifier.weight(1f)) {
                                    Text(sample, color = colors.accent, fontSize = 10.sp, maxLines = 1)
                                }
                            }
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        Button(
                            onClick = { showConfirmation = true },
                            enabled = command.isNotBlank() && !isExecuting,
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.buttonColors(containerColor = colors.accent),
                            shape = RoundedCornerShape(10.dp)
                        ) {
                            if (isExecuting) {
                                CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Color.White, strokeWidth = 2.dp)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Çalıştırılıyor…", fontWeight = FontWeight.Bold)
                            } else {
                                Icon(Icons.Rounded.Terminal, contentDescription = null, modifier = Modifier.size(17.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Yönetici olarak çalıştır", fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
        }

        if (result != null) {
            item {
                GlassCard(
                    modifier = Modifier.fillMaxWidth(),
                    backgroundColor = if (hasResultError) colors.danger.copy(alpha = if (colors.isDark) 0.10f else 0.06f) else colors.success.copy(alpha = if (colors.isDark) 0.09f else 0.05f),
                    borderColor = if (hasResultError) colors.danger.copy(alpha = 0.36f) else colors.success.copy(alpha = 0.36f)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = if (hasResultError) "Komut sonucu" else "Komut tamamlandı",
                            color = if (hasResultError) colors.danger else colors.success,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Surface(shape = RoundedCornerShape(10.dp), color = colors.paper, border = BorderStroke(1.dp, colors.border)) {
                            SelectionContainer {
                                Text(
                                    text = output.ifBlank { "Çıktı üretilmedi." },
                                    modifier = Modifier.padding(12.dp),
                                    color = colors.textPrimary,
                                    fontSize = 12.sp,
                                    lineHeight = 16.sp,
                                    fontFamily = FontFamily.Monospace
                                )
                            }
                        }
                    }
                }
            }
        }

        if (recentCommands.isNotEmpty()) {
            item {
                GlassCard(modifier = Modifier.fillMaxWidth(), backgroundColor = colors.surfaceRaised, borderColor = colors.border) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Bu oturumdaki komutlar", color = colors.textPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        recentCommands.forEach { previous ->
                            TextButton(onClick = { command = previous }, modifier = Modifier.fillMaxWidth()) {
                                Text(previous, color = colors.accent, fontFamily = FontFamily.Monospace, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        }
                    }
                }
            }
        }
    }

    if (showConfirmation) {
        AlertDialog(
            onDismissRequest = { showConfirmation = false },
            title = { Text("Yönetici komutu çalıştırılsın mı?") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Bu işlem PC'de yönetici izinleriyle yürütülecek. Komutu ve etkisini kontrol edin.")
                    Surface(shape = RoundedCornerShape(8.dp), color = colors.paper, border = BorderStroke(1.dp, colors.border)) {
                        SelectionContainer {
                            Text(command.trim(), modifier = Modifier.padding(10.dp), fontFamily = FontFamily.Monospace, fontSize = 12.sp, color = colors.textPrimary)
                        }
                    }
                }
            },
            confirmButton = {
                Button(onClick = { runCommand() }, colors = ButtonDefaults.buttonColors(containerColor = colors.danger)) {
                    Text("Çalıştır")
                }
            },
            dismissButton = { TextButton(onClick = { showConfirmation = false }) { Text("Vazgeç") } },
            containerColor = colors.surfaceRaised
        )
    }
}

private fun terminalOutput(result: TerminalCommandResult): String = buildString {
    if (result.exitCode != null) append("Çıkış kodu: ${result.exitCode}\n")
    if (result.timedOut) append("Zaman aşımı: Komut 30 saniye sonra durduruldu.\n")
    if (result.truncated) append("Not: Çıktı güvenli sınırda kısaltıldı.\n")
    if (result.error.isNotBlank()) append("Hata: ${result.error}\n")
    if (result.stdout.isNotBlank()) {
        if (isNotEmpty()) append("\n")
        append(result.stdout.trimEnd())
    }
    if (result.stderr.isNotBlank()) {
        if (isNotEmpty()) append("\n\n")
        append(result.stderr.trimEnd())
    }
}
