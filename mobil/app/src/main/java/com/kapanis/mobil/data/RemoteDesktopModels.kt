package com.kapanis.mobil.data

data class RemoteDisplayInfo(
    val width: Int = 1,
    val height: Int = 1,
    val scaleFactor: Float = 1f
)

data class RemoteSessionInfo(
    val sessionId: String,
    val sessionToken: String,
    val wsPath: String,
    val display: RemoteDisplayInfo,
    val expiresAt: Long
)

class RemoteSessionConflict(
    val sessionId: String,
    message: String
) : Exception(message)

class RemoteAuthRequired(message: String) : Exception(message)

enum class RemoteDesktopState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    ERROR,
    LOCKED
}

data class RemoteDesktopUiState(
    val state: RemoteDesktopState = RemoteDesktopState.DISCONNECTED,
    val message: String = "",
    val display: RemoteDisplayInfo? = null,
    val conflictingSessionId: String? = null,
    val latencyMs: Long? = null
)

sealed class RemoteInput {
    data class Move(val x: Float, val y: Float) : RemoteInput()
    data class MoveRelative(val dx: Float, val dy: Float) : RemoteInput()
    data class Button(val button: String, val pressed: Boolean) : RemoteInput()
    data class Wheel(val deltaX: Float, val deltaY: Float) : RemoteInput()
    data class Key(val code: String, val pressed: Boolean, val modifiers: List<String> = emptyList()) : RemoteInput()
    data class Text(val value: String) : RemoteInput()
    data object ReleaseAll : RemoteInput()
}

data class RemoteImageRect(
    val left: Float,
    val top: Float,
    val width: Float,
    val height: Float
)

data class RemoteZoomTransform(
    val scale: Float = 1f,
    val offsetX: Float = 0f,
    val offsetY: Float = 0f
)

class RemoteCoordinateMapper(
    private val display: RemoteDisplayInfo
) {
    fun imageRect(containerWidth: Float, containerHeight: Float): RemoteImageRect {
        if (containerWidth <= 0f || containerHeight <= 0f) return RemoteImageRect(0f, 0f, 0f, 0f)
        val displayRatio = display.width.toFloat() / display.height.coerceAtLeast(1)
        val containerRatio = containerWidth / containerHeight
        return if (containerRatio > displayRatio) {
            val height = containerHeight
            val width = height * displayRatio
            RemoteImageRect((containerWidth - width) / 2f, 0f, width, height)
        } else {
            val width = containerWidth
            val height = width / displayRatio
            RemoteImageRect(0f, 0f, width, height)
        }
    }

    fun normalize(x: Float, y: Float, containerWidth: Float, containerHeight: Float): Pair<Float, Float>? {
        return normalize(x, y, containerWidth, containerHeight, RemoteZoomTransform())
    }

    fun normalize(
        x: Float,
        y: Float,
        containerWidth: Float,
        containerHeight: Float,
        transform: RemoteZoomTransform
    ): Pair<Float, Float>? {
        val rect = imageRect(containerWidth, containerHeight)
        if (rect.width <= 0f || rect.height <= 0f) return null
        val scale = transform.scale.coerceAtLeast(1f)
        val localX = rect.width / 2f + (x - rect.left - rect.width / 2f - transform.offsetX) / scale
        val localY = rect.height / 2f + (y - rect.top - rect.height / 2f - transform.offsetY) / scale
        if (localX < 0f || localY < 0f || localX > rect.width || localY > rect.height) return null
        return (localX / rect.width).coerceIn(0f, 1f) to (localY / rect.height).coerceIn(0f, 1f)
    }

    fun zoomAround(
        transform: RemoteZoomTransform,
        factor: Float,
        focalX: Float,
        focalY: Float,
        containerWidth: Float,
        containerHeight: Float
    ): RemoteZoomTransform {
        val rect = imageRect(containerWidth, containerHeight)
        if (rect.width <= 0f || rect.height <= 0f) return transform
        val oldScale = transform.scale.coerceIn(1f, MAX_ZOOM)
        val newScale = (oldScale * factor).coerceIn(1f, MAX_ZOOM)
        val centerX = rect.width / 2f
        val centerY = rect.height / 2f
        val localX = centerX + (focalX - rect.left - centerX - transform.offsetX) / oldScale
        val localY = centerY + (focalY - rect.top - centerY - transform.offsetY) / oldScale
        return clampTransform(
            RemoteZoomTransform(
                scale = newScale,
                offsetX = focalX - rect.left - centerX - (localX - centerX) * newScale,
                offsetY = focalY - rect.top - centerY - (localY - centerY) * newScale
            ),
            containerWidth,
            containerHeight
        )
    }

    fun panBy(
        transform: RemoteZoomTransform,
        dx: Float,
        dy: Float,
        containerWidth: Float,
        containerHeight: Float
    ): RemoteZoomTransform = clampTransform(
        transform.copy(offsetX = transform.offsetX + dx, offsetY = transform.offsetY + dy),
        containerWidth,
        containerHeight
    )

    fun clampTransform(
        transform: RemoteZoomTransform,
        containerWidth: Float,
        containerHeight: Float
    ): RemoteZoomTransform {
        val rect = imageRect(containerWidth, containerHeight)
        if (rect.width <= 0f || rect.height <= 0f) return RemoteZoomTransform()
        val scale = transform.scale.coerceIn(1f, MAX_ZOOM)
        val centerX = rect.width / 2f
        val centerY = rect.height / 2f

        fun clampAxis(baseStart: Float, baseSize: Float, viewportSize: Float, center: Float, offset: Float): Float {
            val transformedStart = baseStart + center * (1f - scale)
            val transformedSize = baseSize * scale
            // Portrait fit-to-width leaves intentional black space below the
            // desktop. Keep the pinch focal point in that case instead of
            // forcing the scaled image to cover the entire viewport.
            if (baseSize < viewportSize) return offset.coerceIn(-viewportSize, viewportSize)
            if (transformedSize <= viewportSize) return 0f
            return offset.coerceIn(viewportSize - transformedStart - transformedSize, -transformedStart)
        }

        return RemoteZoomTransform(
            scale = scale,
            offsetX = clampAxis(rect.left, rect.width, containerWidth, centerX, transform.offsetX),
            offsetY = clampAxis(rect.top, rect.height, containerHeight, centerY, transform.offsetY)
        )
    }

    companion object {
        const val MAX_ZOOM = 3f
    }
}
