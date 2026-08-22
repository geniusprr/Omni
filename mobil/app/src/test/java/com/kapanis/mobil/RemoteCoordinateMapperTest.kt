package com.kapanis.mobil

import com.kapanis.mobil.data.RemoteCoordinateMapper
import com.kapanis.mobil.data.RemoteDisplayInfo
import com.kapanis.mobil.data.RemoteZoomTransform
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RemoteCoordinateMapperTest {
    private val mapper = RemoteCoordinateMapper(RemoteDisplayInfo(1920, 1080, 1f))

    @Test
    fun mapsTopAlignedLetterboxedPointToCenter() {
        val point = mapper.normalize(500f, 281.25f, 1000f, 1000f)
        assertNotNull(point)
        assertEquals(0.5f, point!!.first, 0.01f)
        assertEquals(0.5f, point.second, 0.01f)
    }

    @Test
    fun rejectsBlackBarsOutsideImage() {
        assertNull(mapper.normalize(500f, 700f, 1000f, 1000f))
    }

    @Test
    fun preservesPinchFocalPointWhenZooming() {
        val transform = mapper.zoomAround(
            RemoteZoomTransform(),
            factor = 2f,
            focalX = 500f,
            focalY = 281.25f,
            containerWidth = 1000f,
            containerHeight = 1000f
        )
        val point = mapper.normalize(500f, 281.25f, 1000f, 1000f, transform)
        assertNotNull(point)
        assertEquals(0.5f, point!!.first, 0.01f)
        assertEquals(0.5f, point.second, 0.01f)
        assertEquals(2f, transform.scale, 0.01f)
    }

    @Test
    fun clampsZoomAndPanToViewport() {
        val transform = mapper.clampTransform(
            RemoteZoomTransform(scale = 9f, offsetX = 10_000f, offsetY = -10_000f),
            1000f,
            1000f
        )
        assertEquals(RemoteCoordinateMapper.MAX_ZOOM, transform.scale, 0.01f)
        assertTrue(transform.offsetX < 10_000f)
        assertTrue(transform.offsetY > -10_000f)
    }
}
