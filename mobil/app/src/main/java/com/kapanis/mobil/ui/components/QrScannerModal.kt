package com.kapanis.mobil.ui.components

import android.Manifest
import android.content.pm.PackageManager
import android.view.View
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CameraAlt
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.FlashOff
import androidx.compose.material.icons.rounded.FlashOn
import androidx.compose.material.icons.rounded.QrCodeScanner
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import com.google.zxing.BarcodeFormat
import com.google.zxing.ResultPoint
import com.journeyapps.barcodescanner.BarcodeCallback
import com.journeyapps.barcodescanner.BarcodeResult
import com.journeyapps.barcodescanner.CompoundBarcodeView
import com.journeyapps.barcodescanner.DefaultDecoderFactory
import com.kapanis.mobil.ui.theme.KapanisTheme

@Composable
fun QrScannerModal(
    isOpen: Boolean,
    onDismiss: () -> Unit,
    onQrScanned: (String) -> Unit
) {
    if (!isOpen) return

    val context = LocalContext.current
    val colors = KapanisTheme.colors

    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        )
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasCameraPermission = granted
    }

    LaunchedEffect(Unit) {
        if (!hasCameraPermission) {
            permissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            dismissOnBackPress = true,
            dismissOnClickOutside = false
        )
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black)
        ) {
            if (!hasCameraPermission) {
                // Permission Card
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(32.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Box(
                        modifier = Modifier
                            .size(72.dp)
                            .background(colors.accent.copy(alpha = 0.15f), CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            Icons.Rounded.CameraAlt,
                            contentDescription = null,
                            tint = colors.accent,
                            modifier = Modifier.size(36.dp)
                        )
                    }

                    Spacer(modifier = Modifier.height(20.dp))

                    Text(
                        text = "Kamera İzni Gerekli",
                        color = Color.White,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    Text(
                        text = "Bilgisayarınızdaki eşleştirme QR kodunu okutabilmek için kamera erişimine izin vermeniz gerekmektedir.",
                        color = Color(0xFF94A3B8),
                        fontSize = 13.sp,
                        textAlign = TextAlign.Center,
                        lineHeight = 18.sp
                    )

                    Spacer(modifier = Modifier.height(24.dp))

                    Button(
                        onClick = { permissionLauncher.launch(Manifest.permission.CAMERA) },
                        colors = ButtonDefaults.buttonColors(containerColor = colors.accent),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth(0.8f)
                    ) {
                        Text("Kamera İznini Ver", fontWeight = FontWeight.Bold)
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    Button(
                        onClick = onDismiss,
                        colors = ButtonDefaults.buttonColors(containerColor = Color.White.copy(alpha = 0.1f)),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth(0.8f)
                    ) {
                        Text("Vazgeç", color = Color.White)
                    }
                }
            } else {
                var isTorchOn by remember { mutableStateOf(false) }
                var barcodeViewRef by remember { mutableStateOf<CompoundBarcodeView?>(null) }
                var hasScanned by remember { mutableStateOf(false) }

                DisposableEffect(Unit) {
                    onDispose {
                        barcodeViewRef?.pause()
                    }
                }

                // 1. FULLSCREEN LIVE CAMERA PREVIEW (Direct, no intermediate clear blend modes)
                AndroidView(
                    factory = { ctx ->
                        CompoundBarcodeView(ctx).apply {
                            val formats = listOf(BarcodeFormat.QR_CODE)
                            decoderFactory = DefaultDecoderFactory(formats)
                            viewFinder.visibility = View.GONE
                            statusView.visibility = View.GONE
                            cameraSettings.isContinuousFocusEnabled = true
                            cameraSettings.isAutoTorchEnabled = false

                            decodeContinuous(object : BarcodeCallback {
                                override fun barcodeResult(result: BarcodeResult?) {
                                    if (hasScanned) return
                                    val text = result?.text?.trim()
                                    if (!text.isNullOrEmpty()) {
                                        hasScanned = true
                                        pause()
                                        onQrScanned(text)
                                    }
                                }

                                override fun possibleResultPoints(resultPoints: MutableList<ResultPoint>?) {}
                            })

                            resume()
                            barcodeViewRef = this
                        }
                    },
                    modifier = Modifier.fillMaxSize()
                )

                // 2. CLEAN HIGH-CONTRAST CUTOUT OVERLAY (Letterboxing method prevents canvas transparency bug)
                val cutoutSize = 250.dp
                val overlayColor = Color.Black.copy(alpha = 0.65f)

                Column(modifier = Modifier.fillMaxSize()) {
                    // Top letterbox
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f)
                            .background(overlayColor)
                    )

                    // Center row with cutout window
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(cutoutSize)
                    ) {
                        // Left letterbox
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxHeight()
                                .background(overlayColor)
                        )

                        // Center Viewfinder Window (Clean transparent square with sharp corner borders)
                        Box(
                            modifier = Modifier
                                .size(cutoutSize)
                                .clip(RoundedCornerShape(16.dp))
                                .border(2.dp, Color.White.copy(alpha = 0.85f), RoundedCornerShape(16.dp))
                        ) {
                            // Corner Accents
                            val cornerSize = 24.dp
                            val cornerThickness = 4.dp
                            val cornerColor = colors.accent

                            // Top-Left Corner
                            Box(
                                modifier = Modifier
                                    .align(Alignment.TopStart)
                                    .size(cornerSize, cornerThickness)
                                    .background(cornerColor)
                            )
                            Box(
                                modifier = Modifier
                                    .align(Alignment.TopStart)
                                    .size(cornerThickness, cornerSize)
                                    .background(cornerColor)
                            )

                            // Top-Right Corner
                            Box(
                                modifier = Modifier
                                    .align(Alignment.TopEnd)
                                    .size(cornerSize, cornerThickness)
                                    .background(cornerColor)
                            )
                            Box(
                                modifier = Modifier
                                    .align(Alignment.TopEnd)
                                    .size(cornerThickness, cornerSize)
                                    .background(cornerColor)
                            )

                            // Bottom-Left Corner
                            Box(
                                modifier = Modifier
                                    .align(Alignment.BottomStart)
                                    .size(cornerSize, cornerThickness)
                                    .background(cornerColor)
                            )
                            Box(
                                modifier = Modifier
                                    .align(Alignment.BottomStart)
                                    .size(cornerThickness, cornerSize)
                                    .background(cornerColor)
                            )

                            // Bottom-Right Corner
                            Box(
                                modifier = Modifier
                                    .align(Alignment.BottomEnd)
                                    .size(cornerSize, cornerThickness)
                                    .background(cornerColor)
                            )
                            Box(
                                modifier = Modifier
                                    .align(Alignment.BottomEnd)
                                    .size(cornerThickness, cornerSize)
                                    .background(cornerColor)
                            )
                        }

                        // Right letterbox
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxHeight()
                                .background(overlayColor)
                        )
                    }

                    // Bottom letterbox
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1.3f)
                            .background(overlayColor),
                        contentAlignment = Alignment.TopCenter
                    ) {
                        Text(
                            text = "Bilgisayardaki QR kodu karenin içine hizalayın",
                            color = Color.White,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(top = 24.dp, start = 24.dp, end = 24.dp)
                        )
                    }
                }

                // 3. TOP ACTION BAR
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 44.dp, start = 20.dp, end = 20.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(
                        onClick = onDismiss,
                        modifier = Modifier
                            .size(42.dp)
                            .background(Color.Black.copy(alpha = 0.6f), CircleShape)
                    ) {
                        Icon(Icons.Rounded.Close, contentDescription = "Kapat", tint = Color.White)
                    }

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .background(Color.Black.copy(alpha = 0.6f), RoundedCornerShape(20.dp))
                            .padding(horizontal = 14.dp, vertical = 6.dp)
                    ) {
                        Icon(
                            Icons.Rounded.QrCodeScanner,
                            contentDescription = null,
                            tint = colors.accent,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "QR Kod Hizala",
                            color = Color.White,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    IconButton(
                        onClick = {
                            isTorchOn = !isTorchOn
                            if (isTorchOn) {
                                barcodeViewRef?.setTorchOn()
                            } else {
                                barcodeViewRef?.setTorchOff()
                            }
                        },
                        modifier = Modifier
                            .size(42.dp)
                            .background(
                                if (isTorchOn) Color(0xFFF59E0B).copy(alpha = 0.35f) else Color.Black.copy(alpha = 0.6f),
                                CircleShape
                            )
                    ) {
                        Icon(
                            if (isTorchOn) Icons.Rounded.FlashOn else Icons.Rounded.FlashOff,
                            contentDescription = "Flaş",
                            tint = if (isTorchOn) Color(0xFFF59E0B) else Color.White
                        )
                    }
                }
            }
        }
    }
}
