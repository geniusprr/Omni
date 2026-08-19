package com.kapanis.mobil.ui.screens

import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
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
import com.kapanis.mobil.data.TransferItem
import com.kapanis.mobil.network.KapanisApiClient
import com.kapanis.mobil.ui.components.GlassCard
import com.kapanis.mobil.ui.theme.AccentBlue
import com.kapanis.mobil.ui.theme.AccentCyan
import com.kapanis.mobil.ui.theme.AccentInk
import com.kapanis.mobil.ui.theme.DarkPaper
import com.kapanis.mobil.ui.theme.DarkSurface
import com.kapanis.mobil.ui.theme.DarkSurfaceRaised
import com.kapanis.mobil.ui.theme.InkPrimary
import com.kapanis.mobil.ui.theme.RuleColor
import com.kapanis.mobil.ui.theme.TextFaint
import com.kapanis.mobil.ui.theme.TextMuted
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun TransferScreen(
    target: ConnectionTarget,
    apiClient: KapanisApiClient,
    transfers: List<TransferItem>,
    onTransfersUpdated: (List<TransferItem>) -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var isUploading by remember { mutableStateOf(false) }
    var uploadProgress by remember { mutableFloatStateOf(0f) }
    var currentUploadingFile by remember { mutableStateOf("") }

    fun uploadUri(uri: Uri) {
        if (isUploading) return
        isUploading = true
        uploadProgress = 0f
        currentUploadingFile = "Dosya hazırlanıyor..."

        scope.launch {
            val result = apiClient.uploadFile(
                context = context,
                host = target.host,
                port = target.port,
                uri = uri,
                onProgress = { progress ->
                    uploadProgress = progress
                }
            )
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

    // Photo Picker
    val photoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia()
    ) { uri ->
        if (uri != null) {
            uploadUri(uri)
        }
    }

    // Generic File Picker
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
            .background(DarkPaper)
            .padding(horizontal = 16.dp, vertical = 8.dp)
    ) {
        // Transfer Action Buttons
        GlassCard(
            modifier = Modifier.fillMaxWidth(),
            backgroundColor = DarkSurface
        ) {
            Text(
                text = "PC'ye Dosya / Fotoğraf Aktar",
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = InkPrimary
            )
            Text(
                text = "Seçilen fotoğraflar ve belgeler doğrudan PC'ye akıtılır.",
                fontSize = 12.sp,
                color = TextMuted,
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
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = AccentBlue,
                        contentColor = AccentInk
                    ),
                    shape = RoundedCornerShape(8.dp)
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
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = DarkSurfaceRaised,
                        contentColor = InkPrimary
                    ),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Icon(
                        imageVector = Icons.Rounded.UploadFile,
                        contentDescription = "Dosya",
                        modifier = Modifier.size(16.dp)
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
                            text = "PC'ye gönderiliyor...",
                            fontSize = 12.sp,
                            color = AccentCyan
                        )
                        Text(
                            text = "${(uploadProgress * 100).toInt()}%",
                            fontSize = 12.sp,
                            color = InkPrimary,
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
                        color = AccentBlue,
                        trackColor = DarkSurfaceRaised
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // History Header
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "Son Aktarılanlar (${transfers.size})",
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = TextMuted
            )
            if (transfers.isNotEmpty()) {
                Text(
                    text = "PC: %APPDATA%/kapanis/transfers",
                    fontSize = 10.sp,
                    color = TextFaint,
                    fontFamily = FontFamily.Monospace
                )
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        // Transfers List
        if (transfers.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "Henüz aktarılan dosya yok.\nYukarıdaki butonlarla telefonunuzdan fotoğraf veya belge seçin.",
                    color = TextFaint,
                    fontSize = 13.sp,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    lineHeight = 18.sp
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(transfers, key = { it.id }) { item ->
                    GlassCard(
                        modifier = Modifier.fillMaxWidth(),
                        backgroundColor = DarkSurfaceRaised,
                        borderColor = RuleColor,
                        contentPadding = 10.dp
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            // Icon or Image
                            if (item.isImage) {
                                Box(
                                    modifier = Modifier
                                        .size(42.dp)
                                        .clip(RoundedCornerShape(6.dp))
                                        .background(DarkPaper)
                                ) {
                                    val imageUrl = "http://${target.host}:${target.port}/api/media/${item.filename}"
                                    AsyncImage(
                                        model = imageUrl,
                                        contentDescription = item.filename,
                                        modifier = Modifier.fillMaxSize(),
                                        contentScale = ContentScale.Crop
                                    )
                                }
                            } else {
                                Box(
                                    modifier = Modifier
                                        .size(42.dp)
                                        .clip(RoundedCornerShape(6.dp))
                                        .background(DarkSurface),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(
                                        imageVector = Icons.Rounded.Description,
                                        contentDescription = "Dosya",
                                        tint = TextMuted,
                                        modifier = Modifier.size(22.dp)
                                    )
                                }
                            }

                            // Details
                            Column(
                                modifier = Modifier.weight(1f)
                            ) {
                                Text(
                                    text = item.filename,
                                    color = InkPrimary,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Medium,
                                    maxLines = 1
                                )
                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.padding(top = 2.dp)
                                ) {
                                    Text(
                                        text = formatBytes(item.size),
                                        color = TextFaint,
                                        fontSize = 11.sp,
                                        fontFamily = FontFamily.Monospace
                                    )
                                    Text(text = "•", color = TextFaint, fontSize = 10.sp)
                                    val timeStr = remember(item.createdAt) {
                                        val sdf = SimpleDateFormat("HH:mm", Locale("tr"))
                                        sdf.format(Date(item.createdAt))
                                    }
                                    Text(
                                        text = timeStr,
                                        color = TextFaint,
                                        fontSize = 11.sp,
                                        fontFamily = FontFamily.Monospace
                                    )
                                }
                            }

                            // Delete Action
                            IconButton(
                                onClick = {
                                    onTransfersUpdated(transfers.filter { it.id != item.id })
                                },
                                modifier = Modifier.size(28.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.Delete,
                                    contentDescription = "Sil",
                                    tint = TextFaint,
                                    modifier = Modifier.size(14.dp)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
