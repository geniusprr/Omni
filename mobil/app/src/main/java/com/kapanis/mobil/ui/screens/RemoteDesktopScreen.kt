package com.kapanis.mobil.ui.screens

import android.content.Context
import android.view.MotionEvent
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Keyboard
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.input.pointer.pointerInteropFilter
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.zIndex
import com.kapanis.mobil.data.ConnectionMode
import com.kapanis.mobil.data.ConnectionTarget
import com.kapanis.mobil.data.PreferencesManager
import com.kapanis.mobil.data.RemoteCoordinateMapper
import com.kapanis.mobil.data.RemoteDesktopState
import com.kapanis.mobil.data.RemoteDisplayInfo
import com.kapanis.mobil.data.RemoteInput
import com.kapanis.mobil.data.RemoteZoomTransform
import com.kapanis.mobil.network.KapanisApiClient
import com.kapanis.mobil.network.RemoteDesktopClient
import com.kapanis.mobil.ui.theme.KapanisTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.webrtc.RendererCommon
import org.webrtc.SurfaceViewRenderer
import kotlin.math.abs
import kotlin.math.hypot

private enum class RemoteControlMode {
    TOUCH,
    CURSOR
}

@Composable
@OptIn(ExperimentalComposeUiApi::class)
fun RemoteDesktopScreen(
    target: ConnectionTarget,
    mode: ConnectionMode,
    prefs: PreferencesManager,
    apiClient: KapanisApiClient,
    onAuthExpired: () -> Unit,
    onExit: () -> Unit
) {
    val context = LocalContext.current
    val colors = KapanisTheme.colors
    val scope = rememberCoroutineScope()
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current
    val textFocusRequester = remember { FocusRequester() }
    val client = remember { RemoteDesktopClient(context, apiClient) }
    var uiState by remember { mutableStateOf(com.kapanis.mobil.data.RemoteDesktopUiState()) }
    var viewportSize by remember { mutableStateOf(IntSize.Zero) }
    var renderer by remember { mutableStateOf<SurfaceViewRenderer?>(null) }
    var controlMode by remember { mutableStateOf(RemoteControlMode.TOUCH) }
    var selectedButton by remember { mutableStateOf("left") }
    var cursorSpeed by remember { mutableFloatStateOf(1f) }
    var zoomTransform by remember { mutableStateOf(RemoteZoomTransform()) }
    var keyboardOpen by remember { mutableStateOf(false) }
    var moreOpen by remember { mutableStateOf(false) }
    var textValue by remember { mutableStateOf(TextFieldValue("")) }
    var heldModifiers by remember { mutableStateOf(setOf<String>()) }
    var showTakeoverDialog by remember { mutableStateOf(false) }

    val latestRenderer = rememberUpdatedState(renderer)

    DisposableEffect(client) {
        client.setStateListener { next ->
            scope.launch(Dispatchers.Main) { uiState = next }
        }
        client.setAuthExpiredListener {
            scope.launch(Dispatchers.Main) {
                prefs.removePairedDevice(prefs.activeDeviceId)
                onAuthExpired()
            }
        }
        onDispose {
            client.setStateListener(null)
            client.setAuthExpiredListener(null)
            client.attachRenderer(null)
            latestRenderer.value?.release()
            client.dispose()
        }
    }

    LaunchedEffect(mode, target.host, target.port, prefs.activeDeviceId) {
        if (mode != ConnectionMode.LOCAL) {
            client.close()
            return@LaunchedEffect
        }
        val token = prefs.getLocalAuthToken(prefs.activeDeviceId.ifEmpty { target.host })
        if (!target.isConnected || token.isBlank()) {
            uiState = com.kapanis.mobil.data.RemoteDesktopUiState(
                RemoteDesktopState.ERROR,
                "Önce Cihazlar bölümünden PC ile eşleşmelisiniz."
            )
            return@LaunchedEffect
        }
        client.connect(target.host, target.port, token, prefs.controllerId, prefs.controllerName)
    }

    LaunchedEffect(keyboardOpen) {
        if (keyboardOpen) {
            delay(120)
            textFocusRequester.requestFocus()
            keyboardController?.show()
        } else {
            focusManager.clearFocus(force = true)
            keyboardController?.hide()
        }
    }

    BackHandler {
        when {
            keyboardOpen -> keyboardOpen = false
            moreOpen -> moreOpen = false
            else -> {
                client.close()
                onExit()
            }
        }
    }

    fun sendKeyTap(code: String) {
        val modifiers = heldModifiers.toList()
        client.sendInput(RemoteInput.Key(code, true, modifiers))
        client.sendInput(RemoteInput.Key(code, false, modifiers))
    }

    fun updateText(next: TextFieldValue) {
        val previous = textValue.text
        val current = next.text
        if (current.startsWith(previous)) {
            val added = current.removePrefix(previous)
            if (added.isNotEmpty()) client.sendInput(RemoteInput.Text(added))
        } else if (previous.startsWith(current)) {
            repeat(previous.length - current.length) { sendKeyTap("BACKSPACE") }
        } else if (current.isNotEmpty()) {
            client.sendInput(RemoteInput.Text(current))
        }
        textValue = next.copy(selection = TextRange(next.text.length))
    }

    if (mode == ConnectionMode.ONLINE) {
        Surface(modifier = Modifier.fillMaxSize(), color = Color.Black) {
            Box(modifier = Modifier.fillMaxSize()) {
                Column(
                    modifier = Modifier.align(Alignment.Center).padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("PC Ekranı LAN özelliğidir", color = Color.White, fontSize = 18.sp)
                    Spacer(Modifier.height(8.dp))
                    Text("Telefon ve PC aynı Wi‑Fi ağına bağlanmalı.", color = Color.White.copy(alpha = .65f), fontSize = 13.sp)
                }
                RemoteToolbarChip(
                    label = "Çık",
                    selected = false,
                    modifier = Modifier.align(Alignment.BottomStart).padding(12.dp).navigationBarsPadding(),
                    colors = colors,
                    onClick = onExit
                )
            }
        }
        return
    }

    val display = uiState.display ?: RemoteDisplayInfo()
    val mapper = remember(display) { RemoteCoordinateMapper(display) }
    val gestureController = remember { RemoteGestureController() }
    gestureController.emitInput = { input -> client.sendInput(input) }
    gestureController.modeProvider = { controlMode }
    gestureController.buttonProvider = { selectedButton }
    gestureController.speedProvider = { cursorSpeed }
    gestureController.viewportProvider = { viewportSize }
    gestureController.transformProvider = { zoomTransform }
    gestureController.mapperProvider = { mapper }
    gestureController.onTransform = { zoomTransform = it }

    Surface(modifier = Modifier.fillMaxSize(), color = Color.Black) {
        Column(modifier = Modifier.fillMaxSize()) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .background(Color.Black)
                    .onSizeChanged { viewportSize = it }
            ) {
                val rect = mapper.imageRect(viewportSize.width.toFloat(), viewportSize.height.toFloat())
                AndroidView(
                    factory = {
                        RemoteVideoContainer(context).also { container ->
                            container.renderer.init(client.eglContext(), null)
                            container.renderer.setEnableHardwareScaler(true)
                            container.renderer.setMirror(false)
                            container.renderer.setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FIT)
                            renderer = container.renderer
                            client.attachRenderer(container.renderer)
                        }
                    },
                    update = { container ->
                        container.update(
                            rect = rect,
                            transform = zoomTransform
                        )
                    },
                    modifier = Modifier.fillMaxSize()
                )

                // SurfaceViewRenderer owns a separate video surface on some
                // Android builds. Keep a raw Compose interop layer above it so
                // touches always reach the remote gesture controller.
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .zIndex(1f)
                        .pointerInteropFilter { event ->
                            gestureController.onTouchEvent(event)
                            true
                        }
                )

                if (uiState.state != RemoteDesktopState.CONNECTED) {
                    Surface(
                        modifier = Modifier.align(Alignment.TopCenter).padding(top = 12.dp),
                        color = Color.Black.copy(alpha = .72f),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(7.dp)
                        ) {
                            Text(
                                uiState.message.ifBlank { "Ekran akışı bekleniyor…" },
                                color = Color.White.copy(alpha = .9f),
                                fontSize = 12.sp,
                                maxLines = 1
                            )
                            if (uiState.state == RemoteDesktopState.ERROR || uiState.state == RemoteDesktopState.LOCKED) {
                                IconButton(onClick = {
                                    val token = prefs.getLocalAuthToken(prefs.activeDeviceId.ifEmpty { target.host })
                                    scope.launch { client.connect(target.host, target.port, token, prefs.controllerId, prefs.controllerName) }
                                }, modifier = Modifier.size(28.dp)) {
                                    Icon(Icons.Rounded.Refresh, "Yeniden bağlan", tint = colors.accent)
                                }
                            }
                            if (uiState.conflictingSessionId != null) {
                                RemoteToolbarChip(
                                    label = "Devral",
                                    selected = true,
                                    modifier = Modifier,
                                    colors = colors,
                                    onClick = { showTakeoverDialog = true }
                                )
                            }
                        }
                    }
                } else {
                    Surface(
                        modifier = Modifier.align(Alignment.TopEnd).padding(12.dp),
                        color = Color.Black.copy(alpha = .5f),
                        shape = RoundedCornerShape(14.dp)
                    ) {
                        Text(
                            text = buildString {
                                append(target.deviceName.ifBlank { "PC" })
                                uiState.latencyMs?.let { append(" · ${it} ms") }
                            },
                            color = Color.White.copy(alpha = .82f),
                            fontSize = 10.sp,
                            modifier = Modifier.padding(horizontal = 9.dp, vertical = 6.dp)
                        )
                    }
                }
            }

            RemoteToolbar(
                modifier = Modifier.fillMaxWidth(),
                colors = colors,
                controlMode = controlMode,
                selectedButton = selectedButton,
                keyboardOpen = keyboardOpen,
                moreOpen = moreOpen,
                zoom = zoomTransform.scale,
                cursorSpeed = cursorSpeed,
                heldModifiers = heldModifiers,
                textValue = textValue,
                textFocusRequester = textFocusRequester,
                onModeChange = {
                    client.sendInput(RemoteInput.ReleaseAll)
                    controlMode = it
                },
                onButtonChange = { selectedButton = it },
                onKeyboardChange = { keyboardOpen = it },
                onMoreChange = { moreOpen = it },
                onSpeedChange = { cursorSpeed = it },
                onZoomReset = { zoomTransform = RemoteZoomTransform() },
                onKeyTap = ::sendKeyTap,
                onModifierToggle = { key ->
                    val isHeld = key in heldModifiers
                    client.sendInput(RemoteInput.Key(key, !isHeld, heldModifiers.toList()))
                    heldModifiers = if (isHeld) heldModifiers - key else heldModifiers + key
                },
                onScroll = { dx, dy -> client.sendInput(RemoteInput.Wheel(dx, dy)) },
                onTextChange = ::updateText,
                onExit = {
                    client.close()
                    onExit()
                },
                onReconnect = {
                    val token = prefs.getLocalAuthToken(prefs.activeDeviceId.ifEmpty { target.host })
                    scope.launch { client.connect(target.host, target.port, token, prefs.controllerId, prefs.controllerName) }
                }
            )
        }
    }

    if (showTakeoverDialog && uiState.conflictingSessionId != null) {
        AlertDialog(
            onDismissRequest = { showTakeoverDialog = false },
            title = { Text("PC Ekranı oturumunu devral?") },
            text = { Text("Başka bir mobil cihaz şu anda bu PC'yi kontrol ediyor. Devralırsanız mevcut bağlantı kapatılır.") },
            confirmButton = {
                TextButton(onClick = {
                    showTakeoverDialog = false
                    val token = prefs.getLocalAuthToken(prefs.activeDeviceId.ifEmpty { target.host })
                    val sessionId = uiState.conflictingSessionId
                    scope.launch {
                        if (!sessionId.isNullOrBlank()) {
                            client.connect(target.host, target.port, token, prefs.controllerId, prefs.controllerName, sessionId)
                        }
                    }
                }) { Text("Devral") }
            },
            dismissButton = { TextButton(onClick = { showTakeoverDialog = false }) { Text("Vazgeç") } }
        )
    }
}

@Composable
private fun RemoteToolbar(
    modifier: Modifier,
    colors: com.kapanis.mobil.ui.theme.AppColors,
    controlMode: RemoteControlMode,
    selectedButton: String,
    keyboardOpen: Boolean,
    moreOpen: Boolean,
    zoom: Float,
    cursorSpeed: Float,
    heldModifiers: Set<String>,
    textValue: TextFieldValue,
    textFocusRequester: FocusRequester,
    onModeChange: (RemoteControlMode) -> Unit,
    onButtonChange: (String) -> Unit,
    onKeyboardChange: (Boolean) -> Unit,
    onMoreChange: (Boolean) -> Unit,
    onSpeedChange: (Float) -> Unit,
    onZoomReset: () -> Unit,
    onKeyTap: (String) -> Unit,
    onModifierToggle: (String) -> Unit,
    onScroll: (Float, Float) -> Unit,
    onTextChange: (TextFieldValue) -> Unit,
    onExit: () -> Unit,
    onReconnect: () -> Unit
) {
    val keyboardController = LocalSoftwareKeyboardController.current
    val focusManager = LocalFocusManager.current

    Surface(
        modifier = modifier
            .fillMaxWidth()
            .imePadding()
            .navigationBarsPadding(),
        color = colors.surfaceGlass,
        shape = RoundedCornerShape(topStart = 18.dp, topEnd = 18.dp),
        tonalElevation = 4.dp
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 7.dp)) {
            if (moreOpen) {
                RemoteMorePanel(
                    colors = colors,
                    cursorSpeed = cursorSpeed,
                    heldModifiers = heldModifiers,
                    zoom = zoom,
                    onSpeedChange = onSpeedChange,
                    onZoomReset = onZoomReset,
                    onKeyTap = onKeyTap,
                    onModifierToggle = onModifierToggle,
                    onScroll = onScroll,
                    onReconnect = onReconnect
                )
                Spacer(Modifier.height(6.dp))
            }

            if (keyboardOpen) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(bottom = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    BasicTextField(
                        value = textValue,
                        onValueChange = onTextChange,
                        modifier = Modifier
                            .weight(1f)
                            .focusRequester(textFocusRequester)
                            .background(colors.surfaceRaised, RoundedCornerShape(10.dp))
                            .padding(horizontal = 11.dp, vertical = 9.dp),
                        singleLine = true,
                        textStyle = TextStyle(color = colors.textPrimary, fontSize = 13.sp),
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                        keyboardActions = KeyboardActions(onDone = { onKeyTap("ENTER") }),
                        decorationBox = { innerTextField ->
                            Box {
                                if (textValue.text.isEmpty()) Text("PC'ye yaz…", color = colors.textMuted, fontSize = 12.sp)
                                innerTextField()
                            }
                        }
                    )
                    RemoteToolbarChip("Enter", false, Modifier, colors) { onKeyTap("ENTER") }
                    RemoteToolbarChip("Tab", false, Modifier, colors) { onKeyTap("TAB") }
                    RemoteToolbarChip("Esc", false, Modifier, colors) { onKeyTap("ESCAPE") }
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(5.dp)
            ) {
                RemoteToolbarChip(
                    label = if (controlMode == RemoteControlMode.TOUCH) "Dokun" else "İmleç",
                    selected = true,
                    modifier = Modifier.width(62.dp),
                    colors = colors,
                    onClick = {
                        onModeChange(if (controlMode == RemoteControlMode.TOUCH) RemoteControlMode.CURSOR else RemoteControlMode.TOUCH)
                    }
                )
                listOf("left" to "L", "right" to "R", "middle" to "M").forEach { (button, label) ->
                    RemoteToolbarChip(
                        label = label,
                        selected = selectedButton == button,
                        modifier = Modifier.size(38.dp),
                        colors = colors,
                        onClick = { onButtonChange(button) }
                    )
                }
                IconButton(onClick = {
                    val next = !keyboardOpen
                    onKeyboardChange(next)
                    if (!next) {
                        focusManager.clearFocus(force = true)
                        keyboardController?.hide()
                    }
                }, modifier = Modifier.size(40.dp)) {
                    Icon(Icons.Rounded.Keyboard, "Klavye", tint = if (keyboardOpen) colors.accent else colors.textPrimary)
                }
                RemoteToolbarChip(
                    label = if (moreOpen) "−" else "⋯",
                    selected = moreOpen,
                    modifier = Modifier.size(38.dp),
                    colors = colors,
                    onClick = { onMoreChange(!moreOpen) }
                )
                IconButton(onClick = onExit, modifier = Modifier.size(40.dp)) {
                    Icon(Icons.Rounded.ArrowBack, "PC ekranından çık", tint = colors.textMuted)
                }
            }
        }
    }
}

@Composable
private fun RemoteMorePanel(
    colors: com.kapanis.mobil.ui.theme.AppColors,
    cursorSpeed: Float,
    heldModifiers: Set<String>,
    zoom: Float,
    onSpeedChange: (Float) -> Unit,
    onZoomReset: () -> Unit,
    onKeyTap: (String) -> Unit,
    onModifierToggle: (String) -> Unit,
    onScroll: (Float, Float) -> Unit,
    onReconnect: () -> Unit
) {
    val scrollState = rememberScrollState()
    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(scrollState),
            horizontalArrangement = Arrangement.spacedBy(5.dp)
        ) {
            RemoteToolbarChip("↑", false, Modifier, colors) { onScroll(0f, 3f) }
            RemoteToolbarChip("↓", false, Modifier, colors) { onScroll(0f, -3f) }
            listOf("BACKSPACE" to "⌫", "ENTER" to "Enter", "TAB" to "Tab", "ESCAPE" to "Esc").forEach { (key, label) ->
                RemoteToolbarChip(label, false, Modifier, colors) { onKeyTap(key) }
            }
            listOf("ARROWLEFT" to "←", "ARROWUP" to "↑", "ARROWDOWN" to "↓", "ARROWRIGHT" to "→").forEach { (key, label) ->
                RemoteToolbarChip(label, false, Modifier, colors) { onKeyTap(key) }
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp)
        ) {
            Text("Hız", color = colors.textMuted, fontSize = 10.sp)
            Slider(
                value = cursorSpeed,
                onValueChange = onSpeedChange,
                valueRange = .5f..2f,
                modifier = Modifier.weight(1f)
            )
            Text("${String.format("%.1f", cursorSpeed)}×", color = colors.textMuted, fontSize = 10.sp)
            listOf("CTRL", "ALT", "SHIFT").forEach { key ->
                RemoteToolbarChip(key.take(1), key in heldModifiers, Modifier.size(32.dp), colors) { onModifierToggle(key) }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(5.dp), verticalAlignment = Alignment.CenterVertically) {
            if (zoom > 1.01f) {
                RemoteToolbarChip("${String.format("%.1f", zoom)}×", true, Modifier, colors, onClick = onZoomReset)
            }
            RemoteToolbarChip("Yenile", false, Modifier, colors, onClick = onReconnect)
        }
    }
}

@Composable
private fun RemoteToolbarChip(
    label: String,
    selected: Boolean,
    modifier: Modifier,
    colors: com.kapanis.mobil.ui.theme.AppColors,
    onClick: () -> Unit
) {
    Surface(
        modifier = modifier.height(36.dp).clickable(onClick = onClick),
        color = if (selected) colors.accent else colors.surfaceRaised,
        contentColor = if (selected) colors.accentInk else colors.textPrimary,
        shape = RoundedCornerShape(9.dp)
    ) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.padding(horizontal = 9.dp)) {
            Text(label, fontSize = 10.sp, maxLines = 1)
        }
    }
}

private class RemoteVideoContainer(context: Context) : FrameLayout(context) {
    val renderer = SurfaceViewRenderer(context)
    private val rendererHolder = FrameLayout(context)
    private var lastRect: com.kapanis.mobil.data.RemoteImageRect? = null
    private var lastTransform: RemoteZoomTransform? = null

    init {
        clipChildren = true
        rendererHolder.clipChildren = true
        rendererHolder.addView(
            renderer,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )
        addView(rendererHolder)
    }

    fun update(
        rect: com.kapanis.mobil.data.RemoteImageRect,
        transform: RemoteZoomTransform
    ) {
        if (lastRect != rect) {
            rendererHolder.layoutParams = LayoutParams(rect.width.toInt(), rect.height.toInt()).apply {
                leftMargin = rect.left.toInt()
                topMargin = rect.top.toInt()
            }
            lastRect = rect
            requestLayout()
        }
        if (lastTransform != transform) {
            rendererHolder.pivotX = rect.width / 2f
            rendererHolder.pivotY = rect.height / 2f
            rendererHolder.scaleX = transform.scale
            rendererHolder.scaleY = transform.scale
            rendererHolder.translationX = transform.offsetX
            rendererHolder.translationY = transform.offsetY
            lastTransform = transform
        }
    }
}

private class RemoteGestureController {
    var emitInput: (RemoteInput) -> Unit = {}
    var modeProvider: () -> RemoteControlMode = { RemoteControlMode.TOUCH }
    var buttonProvider: () -> String = { "left" }
    var speedProvider: () -> Float = { 1f }
    var viewportProvider: () -> IntSize = { IntSize.Zero }
    var transformProvider: () -> RemoteZoomTransform = { RemoteZoomTransform() }
    var mapperProvider: () -> RemoteCoordinateMapper = { RemoteCoordinateMapper(RemoteDisplayInfo()) }
    var onTransform: (RemoteZoomTransform) -> Unit = {}

    private var multiFinger = false
    private var multiMoved = false
    private var singleMoved = false
    private var touchPressed = false
    private var cursorPressed = false
    private var firstDownTime = 0L
    private var lastX = 0f
    private var lastY = 0f
    private var lastCentroidX = 0f
    private var lastCentroidY = 0f
    private var lastDistance = 0f
    private var gestureTransform = RemoteZoomTransform()

    fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> beginSingle(event)
            MotionEvent.ACTION_POINTER_DOWN -> {
                if (event.pointerCount >= 2) beginMulti(event)
            }
            MotionEvent.ACTION_MOVE -> move(event)
            MotionEvent.ACTION_POINTER_UP -> Unit
            MotionEvent.ACTION_UP -> finish(event)
            MotionEvent.ACTION_CANCEL -> cancel()
        }
        return true
    }

    private fun beginSingle(event: MotionEvent) {
        releaseHeldButtons()
        multiFinger = false
        multiMoved = false
        singleMoved = false
        firstDownTime = event.eventTime
        lastX = event.getX(0)
        lastY = event.getY(0)
        gestureTransform = transformProvider()

        if (modeProvider() == RemoteControlMode.TOUCH) {
            touchPressed = sendAbsolute(lastX, lastY, gestureTransform)
            if (touchPressed) emitInput(RemoteInput.Button(buttonProvider(), true))
        }
    }

    private fun beginMulti(event: MotionEvent) {
        if (multiFinger) return
        multiFinger = true
        releaseHeldButtons()
        val centroid = centroid(event)
        lastCentroidX = centroid.first
        lastCentroidY = centroid.second
        lastDistance = distance(event)
    }

    private fun move(event: MotionEvent) {
        if (multiFinger && event.pointerCount >= 2) {
            moveMulti(event)
            return
        }
        if (multiFinger || event.pointerCount == 0) return

        val x = event.getX(0)
        val y = event.getY(0)
        val dx = x - lastX
        val dy = y - lastY
        val moved = hypot(dx.toDouble(), dy.toDouble()) > 1.2
        if (moved) singleMoved = true

        if (modeProvider() == RemoteControlMode.TOUCH) {
            if (moved) {
                val valid = sendAbsolute(x, y, gestureTransform)
                if (!touchPressed && valid) {
                    emitInput(RemoteInput.Button(buttonProvider(), true))
                    touchPressed = true
                }
            }
        } else {
            if (moved) emitInput(RemoteInput.MoveRelative(dx * speedProvider(), dy * speedProvider()))
            if (!cursorPressed && event.eventTime - firstDownTime >= 180L) {
                emitInput(RemoteInput.Button(buttonProvider(), true))
                cursorPressed = true
            }
        }
        lastX = x
        lastY = y
    }

    private fun moveMulti(event: MotionEvent) {
        val centroid = centroid(event)
        val currentDistance = distance(event)
        val scaleFactor = if (lastDistance > 0f) currentDistance / lastDistance else 1f
        if (abs(scaleFactor - 1f) > 0.005f) {
            val size = viewportProvider()
            gestureTransform = mapperProvider().zoomAround(
                gestureTransform,
                scaleFactor,
                centroid.first,
                centroid.second,
                size.width.toFloat(),
                size.height.toFloat()
            )
            onTransform(gestureTransform)
            multiMoved = true
        }

        val panX = centroid.first - lastCentroidX
        val panY = centroid.second - lastCentroidY
        if (hypot(panX.toDouble(), panY.toDouble()) > 1.5) {
            val size = viewportProvider()
            if (gestureTransform.scale > 1.01f) {
                gestureTransform = mapperProvider().panBy(
                    gestureTransform,
                    panX,
                    panY,
                    size.width.toFloat(),
                    size.height.toFloat()
                )
                onTransform(gestureTransform)
            } else {
                emitInput(RemoteInput.Wheel(-panX / 12f, -panY / 12f))
            }
            multiMoved = true
        }
        lastCentroidX = centroid.first
        lastCentroidY = centroid.second
        lastDistance = currentDistance
    }

    private fun finish(event: MotionEvent) {
        if (multiFinger) {
            if (!multiMoved) {
                emitInput(RemoteInput.Button("right", true))
                emitInput(RemoteInput.Button("right", false))
            }
        } else if (touchPressed) {
            emitInput(RemoteInput.Button(buttonProvider(), false))
        } else if (cursorPressed) {
            emitInput(RemoteInput.Button(buttonProvider(), false))
        } else if (!singleMoved) {
            emitInput(RemoteInput.Button(buttonProvider(), true))
            emitInput(RemoteInput.Button(buttonProvider(), false))
        }
        reset()
    }

    private fun cancel() {
        emitInput(RemoteInput.ReleaseAll)
        reset()
    }

    private fun releaseHeldButtons() {
        if (touchPressed || cursorPressed) emitInput(RemoteInput.Button(buttonProvider(), false))
        touchPressed = false
        cursorPressed = false
    }

    private fun reset() {
        multiFinger = false
        multiMoved = false
        singleMoved = false
        touchPressed = false
        cursorPressed = false
        lastDistance = 0f
    }

    private fun sendAbsolute(x: Float, y: Float, transform: RemoteZoomTransform): Boolean {
        val size = viewportProvider()
        val normalized = mapperProvider().normalize(
            x,
            y,
            size.width.toFloat(),
            size.height.toFloat(),
            transform
        ) ?: return false
        emitInput(RemoteInput.Move(normalized.first, normalized.second))
        return true
    }

    private fun centroid(event: MotionEvent): Pair<Float, Float> {
        var totalX = 0f
        var totalY = 0f
        for (index in 0 until event.pointerCount) {
            totalX += event.getX(index)
            totalY += event.getY(index)
        }
        return (totalX / event.pointerCount) to (totalY / event.pointerCount)
    }

    private fun distance(event: MotionEvent): Float {
        if (event.pointerCount < 2) return 0f
        return hypot(
            (event.getX(0) - event.getX(1)).toDouble(),
            (event.getY(0) - event.getY(1)).toDouble()
        ).toFloat()
    }
}
