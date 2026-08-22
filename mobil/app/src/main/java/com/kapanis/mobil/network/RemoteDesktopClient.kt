package com.kapanis.mobil.network

import android.content.Context
import com.kapanis.mobil.data.RemoteDesktopState
import com.kapanis.mobil.data.RemoteDesktopUiState
import com.kapanis.mobil.data.RemoteInput
import com.kapanis.mobil.data.RemoteAuthRequired
import com.kapanis.mobil.data.RemoteSessionConflict
import com.kapanis.mobil.data.RemoteSessionInfo
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import org.webrtc.DataChannel
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.MediaStreamTrack
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpReceiver
import org.webrtc.RtpTransceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.SurfaceViewRenderer
import org.webrtc.VideoTrack
import java.nio.ByteBuffer
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class RemoteDesktopClient(
    context: Context,
    private val apiClient: KapanisApiClient
) {
    private val appContext = context.applicationContext
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val eglBase = EglBase.create()
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .writeTimeout(5, TimeUnit.SECONDS)
        .pingInterval(10, TimeUnit.SECONDS)
        .build()
    private val factory: PeerConnectionFactory
    private var peerConnection: PeerConnection? = null
    private var socket: WebSocket? = null
    private var dataChannel: DataChannel? = null
    private var videoTrack: VideoTrack? = null
    private var renderer: SurfaceViewRenderer? = null
    private var session: RemoteSessionInfo? = null
    private var heartbeatJob: Job? = null
    private var lastHeartbeatSentAt = 0L
    private var latencyMs: Long? = null
    private var sequence = 0
    private var socketOpen = AtomicBoolean(false)
    private var stateListener: ((RemoteDesktopUiState) -> Unit)? = null
    private var authExpiredListener: (() -> Unit)? = null

    init {
        initializeWebRtc(appContext)
        factory = PeerConnectionFactory.builder()
            .setVideoDecoderFactory(DefaultVideoDecoderFactory(eglBase.eglBaseContext))
            .setVideoEncoderFactory(DefaultVideoEncoderFactory(eglBase.eglBaseContext, true, true))
            .createPeerConnectionFactory()
    }

    fun setStateListener(listener: ((RemoteDesktopUiState) -> Unit)?) {
        stateListener = listener
    }

    fun setAuthExpiredListener(listener: (() -> Unit)?) {
        authExpiredListener = listener
    }

    fun eglContext() = eglBase.eglBaseContext

    fun attachRenderer(target: SurfaceViewRenderer?) {
        videoTrack?.removeSink(renderer)
        renderer = target
        if (target != null) videoTrack?.addSink(target)
    }

    suspend fun connect(
        host: String,
        port: Int,
        token: String,
        controllerId: String,
        controllerName: String,
        takeoverSessionId: String? = null
    ) {
        close()
        emit(RemoteDesktopState.CONNECTING, "PC Ekranı hazırlanıyor…")
        val result = if (takeoverSessionId.isNullOrBlank()) {
            apiClient.createRemoteSession(host, port, token, controllerId, controllerName)
        } else {
            apiClient.takeoverRemoteSession(host, port, token, controllerId, controllerName, takeoverSessionId)
        }
        val info = result.getOrElse {
            val conflict = it as? RemoteSessionConflict
            if (it is RemoteAuthRequired) authExpiredListener?.invoke()
            emit(RemoteDesktopState.ERROR, it.message ?: "PC Ekranı oturumu başlatılamadı.", conflict?.sessionId?.ifBlank { null })
            return
        }
        session = info
        sequence = 0
        latencyMs = null
        val configuration = PeerConnection.RTCConfiguration(emptyList())
        configuration.sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
        val observer = createPeerObserver()
        peerConnection = factory.createPeerConnection(configuration, observer)
        if (peerConnection == null) {
            releaseResources()
            emit(RemoteDesktopState.ERROR, "WebRTC bağlantısı oluşturulamadı.")
            return
        }
        try {
            peerConnection?.addTransceiver(
                MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO,
                RtpTransceiver.RtpTransceiverInit(RtpTransceiver.RtpTransceiverDirection.RECV_ONLY)
            )
            val inputChannel = peerConnection?.createDataChannel("kapanis-input", DataChannel.Init())
            if (inputChannel == null) {
                releaseResources()
                emit(RemoteDesktopState.ERROR, "Input kanalı hazırlanamadı.")
                return
            }
            registerDataChannel(inputChannel)
        } catch (_: Exception) {
            releaseResources()
            emit(RemoteDesktopState.ERROR, "PC kontrol kanalı hazırlanamadı.")
            return
        }
        openSocket(host, port, token, info)
    }

    fun sendInput(input: RemoteInput) {
        val message = JSONObject().apply {
            put("version", 1)
            put("sequence", sequence++)
            when (input) {
                is RemoteInput.Move -> {
                    put("type", "move")
                    put("x", input.x.coerceIn(0f, 1f))
                    put("y", input.y.coerceIn(0f, 1f))
                }
                is RemoteInput.MoveRelative -> {
                    put("type", "moveRelative")
                    put("dx", input.dx.coerceIn(-128f, 128f))
                    put("dy", input.dy.coerceIn(-128f, 128f))
                }
                is RemoteInput.Button -> {
                    put("type", "button")
                    put("button", input.button)
                    put("pressed", input.pressed)
                }
                is RemoteInput.Wheel -> {
                    put("type", "wheel")
                    put("deltaX", input.deltaX.coerceIn(-20f, 20f))
                    put("deltaY", input.deltaY.coerceIn(-20f, 20f))
                }
                is RemoteInput.Key -> {
                    put("type", "key")
                    put("code", input.code.take(32))
                    put("pressed", input.pressed)
                    put("modifiers", input.modifiers)
                }
                is RemoteInput.Text -> {
                    put("type", "text")
                    put("value", input.value.take(4_096))
                }
                RemoteInput.ReleaseAll -> put("type", "releaseAll")
            }
        }
        val channel = dataChannel
        if (channel?.state() == DataChannel.State.OPEN) {
            channel.send(DataChannel.Buffer(ByteBuffer.wrap(message.toString().toByteArray(Charsets.UTF_8)), false))
        }
    }

    fun close() {
        releaseResources()
        emit(RemoteDesktopState.DISCONNECTED, "")
    }

    private fun releaseResources() {
        heartbeatJob?.cancel()
        heartbeatJob = null
        if (dataChannel?.state() == DataChannel.State.OPEN) {
            try { sendInput(RemoteInput.ReleaseAll) } catch (_: Exception) {}
        }
        dataChannel?.dispose()
        dataChannel = null
        videoTrack?.removeSink(renderer)
        videoTrack = null
        peerConnection?.close()
        peerConnection?.dispose()
        peerConnection = null
        val oldSocket = socket
        socket = null
        socketOpen.set(false)
        oldSocket?.close(1000, "client-close")
        session = null
        lastHeartbeatSentAt = 0L
        latencyMs = null
    }

    fun dispose() {
        close()
        scope.cancel()
        factory.dispose()
        eglBase.release()
    }

    private fun openSocket(host: String, port: Int, token: String, info: RemoteSessionInfo) {
        val request = Request.Builder()
            .url("ws://$host:$port${info.wsPath}")
            .addHeader("Authorization", "Bearer $token")
            .addHeader("X-Kapanis-Session", info.sessionToken)
            .build()
        socket = httpClient.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                if (socket !== webSocket) return
                socketOpen.set(true)
                emit(RemoteDesktopState.CONNECTING, "Ekran akışı bağlanıyor…")
                createOffer()
                    heartbeatJob?.cancel()
                    heartbeatJob = scope.launch {
                        while (isActive) {
                            delay(5_000)
                            lastHeartbeatSentAt = System.currentTimeMillis()
                            sendSignal(JSONObject().apply { put("version", 1); put("type", "heartbeat") })
                        }
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                if (socket !== webSocket) return
                handleSignal(text)
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                if (socket !== webSocket) return
                socketOpen.set(false)
                releaseResources()
                emit(RemoteDesktopState.DISCONNECTED, reason)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                if (socket !== webSocket) return
                socketOpen.set(false)
                releaseResources()
                emit(RemoteDesktopState.ERROR, t.message ?: "PC Ekranı bağlantısı koptu.")
            }
        })
    }

    private fun createOffer() {
        peerConnection?.createOffer(object : SdpObserver {
            override fun onCreateSuccess(description: SessionDescription?) {
                if (description == null) return
                peerConnection?.setLocalDescription(noopSdpObserver(), description)
                sendSignal(JSONObject().apply {
                    put("version", 1)
                    put("type", "offer")
                    put("sdp", description.description)
                })
            }
            override fun onSetSuccess() = Unit
            override fun onCreateFailure(error: String?) { fail(error ?: "WebRTC offer üretilemedi.") }
            override fun onSetFailure(error: String?) = Unit
        }, MediaConstraints())
    }

    private fun handleSignal(raw: String) {
        val json = try { JSONObject(raw) } catch (_: Exception) { return }
        when (json.optString("type")) {
            "answer" -> {
                val description = json.optString("sdp")
                if (description.isNotBlank()) peerConnection?.setRemoteDescription(noopSdpObserver(), SessionDescription(SessionDescription.Type.ANSWER, description))
            }
            "ice" -> {
                val candidate = json.optJSONObject("candidate") ?: return
                peerConnection?.addIceCandidate(
                    IceCandidate(
                        candidate.optString("sdpMid", "0"),
                        candidate.optInt("sdpMLineIndex", 0),
                        candidate.optString("candidate")
                    )
                )
            }
            "state" -> {
                val state = json.optString("state")
                if (state == "connected") {
                    if (lastHeartbeatSentAt > 0L) latencyMs = (System.currentTimeMillis() - lastHeartbeatSentAt).coerceAtLeast(0L)
                    emit(
                        if (videoTrack == null) RemoteDesktopState.CONNECTING else RemoteDesktopState.CONNECTED,
                        if (videoTrack == null) "Video akışı bekleniyor…" else "Bağlı"
                    )
                }
                if (state == "failed" || state == "error" || state == "closed") {
                    val reason = json.optString("reason", "Oturum sonlandırıldı.")
                    val nextState = if (reason.contains("secure", true) || reason.contains("lock", true)) RemoteDesktopState.LOCKED else RemoteDesktopState.ERROR
                    releaseResources()
                    emit(nextState, reason)
                }
            }
            "close" -> {
                val reason = json.optString("reason", "Oturum kapatıldı.")
                val secureDesktop = reason.contains("secure", true) || reason.contains("lock", true) || reason.contains("UAC", true)
                releaseResources()
                emit(if (secureDesktop) RemoteDesktopState.LOCKED else RemoteDesktopState.DISCONNECTED, reason)
            }
        }
    }

    private fun sendSignal(json: JSONObject) {
        if (socketOpen.get()) socket?.send(json.toString())
    }

    private fun fail(message: String) {
        releaseResources()
        emit(RemoteDesktopState.ERROR, message)
    }

    private fun createPeerObserver() = object : PeerConnection.Observer {
        override fun onSignalingChange(newState: PeerConnection.SignalingState?) = Unit
        override fun onIceConnectionChange(newState: PeerConnection.IceConnectionState?) {
            if (newState == PeerConnection.IceConnectionState.CONNECTED || newState == PeerConnection.IceConnectionState.COMPLETED) {
                emit(
                    if (videoTrack == null) RemoteDesktopState.CONNECTING else RemoteDesktopState.CONNECTED,
                    if (videoTrack == null) "Video akışı bekleniyor…" else "Bağlı"
                )
            }
            if (newState == PeerConnection.IceConnectionState.FAILED || newState == PeerConnection.IceConnectionState.DISCONNECTED) emit(RemoteDesktopState.ERROR, "Video bağlantısı koptu.")
        }
        override fun onIceConnectionReceivingChange(receiving: Boolean) = Unit
        override fun onIceGatheringChange(newState: PeerConnection.IceGatheringState?) = Unit
        override fun onIceCandidate(candidate: IceCandidate?) {
            if (candidate == null) return
            sendSignal(JSONObject().apply {
                put("version", 1)
                put("type", "ice")
                put("candidate", JSONObject().apply {
                    put("sdpMid", candidate.sdpMid)
                    put("sdpMLineIndex", candidate.sdpMLineIndex)
                    put("candidate", candidate.sdp)
                })
            })
        }
        override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) = Unit
        override fun onAddStream(stream: MediaStream?) {
            attachVideoTrack(stream?.videoTracks?.firstOrNull())
        }
        override fun onRemoveStream(stream: MediaStream?) = Unit
        override fun onDataChannel(channel: DataChannel?) {
            if (channel != null && dataChannel == null) registerDataChannel(channel)
        }
        override fun onRenegotiationNeeded() = Unit
        override fun onAddTrack(receiver: RtpReceiver?, mediaStreams: Array<out MediaStream>?) {
            attachVideoTrack(receiver?.track())
        }
        override fun onTrack(transceiver: RtpTransceiver?) {
            attachVideoTrack(transceiver?.receiver?.track())
        }
    }

    private fun attachVideoTrack(track: MediaStreamTrack?) {
        if (track !is VideoTrack || track == videoTrack) return
        videoTrack?.removeSink(renderer)
        videoTrack = track
        track.setEnabled(true)
        renderer?.let { track.addSink(it) }
        emit(RemoteDesktopState.CONNECTED, "Bağlı")
    }

    private fun registerDataChannel(channel: DataChannel) {
        if (dataChannel === channel) return
        dataChannel?.dispose()
        dataChannel = channel
        channel.registerObserver(object : DataChannel.Observer {
            override fun onBufferedAmountChange(previousAmount: Long) = Unit
            override fun onStateChange() = Unit
            override fun onMessage(buffer: DataChannel.Buffer?) = Unit
        })
    }

    private fun noopSdpObserver() = object : SdpObserver {
        override fun onCreateSuccess(description: SessionDescription?) = Unit
        override fun onSetSuccess() = Unit
        override fun onCreateFailure(error: String?) = Unit
        override fun onSetFailure(error: String?) = Unit
    }

    private fun emit(state: RemoteDesktopState, message: String, conflictingSessionId: String? = null) {
        stateListener?.invoke(RemoteDesktopUiState(state, message, session?.display, conflictingSessionId, latencyMs))
    }

    companion object {
        @Volatile private var initialized = false

        private fun initializeWebRtc(context: Context) {
            if (initialized) return
            synchronized(this) {
                if (!initialized) {
                    PeerConnectionFactory.initialize(
                        PeerConnectionFactory.InitializationOptions.builder(context).createInitializationOptions()
                    )
                    initialized = true
                }
            }
        }
    }
}
