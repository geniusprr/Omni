package com.kapanis.mobil.ui.screens

import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.FilePresent
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.UploadFile
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.kapanis.mobil.data.ConnectionTarget
import com.kapanis.mobil.data.PreferencesManager
import com.kapanis.mobil.data.TransferItem
import com.kapanis.mobil.network.KapanisApiClient
import com.kapanis.mobil.ui.components.GlassCard
import com.kapanis.mobil.ui.theme.KapanisTheme
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun TransferScreen(
    target: ConnectionTarget,
    prefs: PreferencesManager,
    apiClient: KapanisApiClient,
    transfers: List<TransferItem>,
    onTransfersUpdated: (List<TransferItem>) -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val colors = KapanisTheme.colors

    var isUploading by remember { mutableStateOf(false) }
    var uploadProgress by remember { mutableFloatStateOf(0f) }

    fun uploadUri(uri: Uri) {
        if (isUploading) return
        isUploading = true
        uploadProgress = 0f

        scope.launch {
            val savedDevices = prefs.getPairedDevices()
            val pairedDevice = savedDevices.firstOrNull { it.id == prefs.pairedDeviceId }
                ?: savedDevices.firstOrNull { it.id == prefs.activeDeviceId }
            val pairedHost = pairedDevice?.host?.takeIf {
                it.isNotBlank() && it != "192.168.1.100" && it != "127.0.0.1" && it != "localhost"
            }
            val targetHost = target.host.takeIf {
                it.isNotBlank() && it != "192.168.1.100" && it != "127.0.0.1" && it != "localhost"
            }
            val host = pairedHost ?: targetHost ?: prefs.host
            val resolvedDevice = pairedDevice ?: savedDevices.firstOrNull {
                it.host == host || it.localIps.contains(host)
            }
            val port = when {
                pairedHost != null && pairedDevice.port > 0 -> pairedDevice.port
                target.port > 0 -> target.port
                else -> prefs.port
            }

            suspend fun authenticateForTransfer(): Result<String> {
                val pairingCredential = listOf(
                    resolvedDevice?.pairingCode.orEmpty(),
                    resolvedDevice?.pairingSecret.orEmpty(),
                    prefs.pairingCode
                ).firstOrNull { it.isNotBlank() }.orEmpty()
                if (pairingCredential.isBlank()) {
                    return Result.failure(Exception("Dosya aktarımı için PC eşleştirme kodu gerekli."))
                }

                val authResult = apiClient.authenticatePairingPin(host, port, pairingCredential, prefs.controllerId, prefs.controllerName)
                if (authResult.isFailure) return authResult

                val token = authResult.getOrDefault("")
                val state = apiClient.ping(host, port, token).getOrNull()
                val deviceId = state?.deviceId.orEmpty().ifEmpty { resolvedDevice?.id.orEmpty() }
                if (deviceId.isNotBlank()) {
                    prefs.activeDeviceId = deviceId
                    prefs.saveLocalAuthToken(deviceId, token)
                }
                prefs.saveLocalAuthToken(host, token)
                return Result.success(token)
            }

            var token = prefs.getLocalAuthToken(prefs.activeDeviceId.ifEmpty { host })
            if (token.isBlank()) {
                val authResult = authenticateForTransfer()
                if (authResult.isSuccess) {
                    token = authResult.getOrDefault("")
                } else {
                    isUploading = false
                    Toast.makeText(
                        context,
                        authResult.exceptionOrNull()?.message ?: "PC eşleştirmesi doğrulanamadı",
                        Toast.LENGTH_SHORT
                    ).show()
                    return@launch
                }
            }

            var result = apiClient.uploadFile(
                context = context,
                host = host,
                port = port,
                uri = uri,
                token = token,
                onProgress = { progress -> uploadProgress = progress }
            )

            // A PC may have been reinstalled or had its local token revoked.
            // Refresh once and retry so a connected cloud controller can still
            // use the local Wi-Fi transfer channel without manual re-pairing.
            if (result.isFailure && result.exceptionOrNull()?.message?.contains("401") == true) {
                val authResult = authenticateForTransfer()
                if (authResult.isSuccess) {
                    token = authResult.getOrDefault("")
                    result = apiClient.uploadFile(
                        context = context,
                        host = host,
                        port = port,
                        uri = uri,
                        token = token,
                        onProgress = { progress -> uploadProgress = progress }
                    )
                }
            }

            isUploading = false
            if (result.isSuccess) {
                val item = result.getOrNull()
                if (item != null) {
                    onTransfersUpdated(listOf(item) + transfers.filter { it.id != item.id })
                }
                Toast.makeText(context, "Dosya PC'ye aktarıldı ✓", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(
                    context,
                    result.exceptionOrNull()?.message ?: "Aktarım başarısız",
                    Toast.LENGTH_SHORT
                ).show()
            }
        }
    }

    val photoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia()
    ) { uri ->
        if (uri != null) {
            uploadUri(uri)
        }
    }

    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null) {
            uploadUri(uri)
        }
    }

    fun formatBytes(bytes: Long): String {
        if (bytes < 1024) return "$bytes B"
        if (bytes < 1024 * 1024) return String.format(Locale.US, "%.1f KB", bytes / 1024f)
        return String.format(Locale.US, "%.1f MB", bytes / (1024f * 1024f))
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.paper)
            .padding(horizontal = 16.dp, vertical = 8.dp)
    ) {
        // Transfer Action Buttons
        GlassCard(modifier = Modifier.fillMaxWidth()) {
            Text(
                text = "PC'ye Dosya / Fotoğraf Aktar",
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                color = colors.textPrimary
            )
            Text(
                text = "Seçilen fotoğraflar ve belgeler doğrudan PC'ye aktarılır.",
                fontSize = 12.sp,
                color = colors.textMuted,
                modifier = Modifier.padding(top = 2.dp, bottom = 12.dp)
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Button(
                    onClick = {
                        photoPickerLauncher.launch(
                            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo)
                        )
                    },
                    enabled = !isUploading,
                    modifier = Modifier.weight(1f).height(46.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = colors.accent,
                        contentColor = colors.accentInk
                    ),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Image,
                        contentDescription = "Fotoğraf",
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "Fotoğraf",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                Button(
                    onClick = {
                        filePickerLauncher.launch("*/*")
                    },
                    enabled = !isUploading,
                    modifier = Modifier.weight(1f).height(46.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = colors.surfaceRaised,
                        contentColor = colors.textPrimary
                    ),
                    border = BorderStroke(1.dp, colors.border),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Icon(
                        imageVector = Icons.Rounded.UploadFile,
                        contentDescription = "Dosya",
                        modifier = Modifier.size(16.dp),
                        tint = colors.accent
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "Belge / Dosya",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            // Upload Progress Bar
            if (isUploading) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 14.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = "PC'ye aktarılıyor...",
                            fontSize = 12.sp,
                            color = colors.accent
                        )
                        Text(
                            text = "${(uploadProgress * 100).toInt()}%",
                            fontSize = 12.sp,
                            color = colors.textPrimary,
                            fontFamily = FontFamily.Monospace
                        )
                    }
                    Spacer(modifier = Modifier.height(6.dp))
                    LinearProgressIndicator(
                        progress = { uploadProgress },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(6.dp)
                            .clip(RoundedCornerShape(3.dp)),
                        color = colors.accent,
                        trackColor = colors.surfaceRaised
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        // Recent Transfers List
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 90.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(transfers, key = { it.id }) { item ->
                val dateStr = SimpleDateFormat("dd MMM, HH:mm", Locale.getDefault()).format(Date(item.createdAt))

                GlassCard(
                    modifier = Modifier.fillMaxWidth(),
                    backgroundColor = colors.surfaceRaised
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .size(44.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .background(colors.accent.copy(alpha = 0.15f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = if (item.isImage) Icons.Rounded.Image else Icons.Rounded.FilePresent,
                                contentDescription = null,
                                tint = colors.accent,
                                modifier = Modifier.size(20.dp)
                            )
                        }

                        Spacer(modifier = Modifier.width(12.dp))

                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = item.filename,
                                color = colors.textPrimary,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                                maxLines = 1
                            )
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = "${formatBytes(item.size)} · $dateStr",
                                color = colors.textFaint,
                                fontSize = 11.sp
                            )
                        }
                    }
                }
            }
        }
    }
}
