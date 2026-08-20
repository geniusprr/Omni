package com.kapanis.mobil.ui.notes

import android.graphics.Paint
import android.graphics.Typeface
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CenterFocusStrong
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.ZoomIn
import androidx.compose.material.icons.rounded.ZoomOut
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kapanis.mobil.data.vault.GraphEdge
import com.kapanis.mobil.data.vault.GraphNode
import com.kapanis.mobil.data.vault.MarkdownParser
import com.kapanis.mobil.data.vault.VaultIndex
import com.kapanis.mobil.ui.theme.KapanisTheme
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import java.util.Locale
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.random.Random

@Composable
fun ObsidianGraphView(
    index: VaultIndex,
    activeNotePath: String? = null,
    onNodeClick: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = KapanisTheme.colors

    var searchQuery by remember { mutableStateOf("") }
    var zoomScale by remember { mutableFloatStateOf(1.0f) }
    var panOffset by remember { mutableStateOf(Offset.Zero) }

    // Graph data
    val nodes = remember(index) {
        val degreeMap = mutableMapOf<String, Int>()
        for ((src, links) in index.outgoingLinks) {
            for (link in links) {
                val targetPath = index.titleToPath[MarkdownParser.normalizeTitle(link.targetTitle)]
                if (targetPath != null && targetPath != src) {
                    degreeMap[src] = (degreeMap[src] ?: 0) + 1
                    degreeMap[targetPath] = (degreeMap[targetPath] ?: 0) + 1
                }
            }
        }

        val totalNotes = index.files.values.toList()
        totalNotes.mapIndexed { idx, note ->
            val angle = (2 * Math.PI * idx / max(1, totalNotes.size)).toFloat()
            val radius = 150f + Random.nextFloat() * 120f
            GraphNode(
                id = note.path,
                title = note.title,
                degree = degreeMap[note.path] ?: 0,
                x = cos(angle) * radius,
                y = sin(angle) * radius
            )
        }.toMutableList()
    }

    val edges = remember(index) {
        val edgeList = mutableListOf<GraphEdge>()
        for ((src, links) in index.outgoingLinks) {
            for (link in links) {
                val targetPath = index.titleToPath[MarkdownParser.normalizeTitle(link.targetTitle)]
                if (targetPath != null && targetPath != src) {
                    edgeList.add(GraphEdge(source = src, target = targetPath))
                }
            }
        }
        edgeList
    }

    var draggedNodeId by remember { mutableStateOf<String?>(null) }
    var simTick by remember { mutableFloatStateOf(0f) }

    // Physics Simulation Loop (Coulomb Repulsion + Hooke Spring + Center Gravity)
    LaunchedEffect(nodes, edges) {
        while (isActive) {
            val repulsionStrength = 1200f
            val springLength = 110f
            val springStrength = 0.04f
            val centerGravity = 0.015f
            val damping = 0.86f

            // 1. Repulsion between all node pairs
            for (i in nodes.indices) {
                val n1 = nodes[i]
                for (j in i + 1 until nodes.size) {
                    val n2 = nodes[j]
                    val dx = n2.x - n1.x
                    val dy = n2.y - n1.y
                    val dist = max(15f, sqrt(dx * dx + dy * dy))
                    val force = repulsionStrength / (dist * dist)
                    val fx = (dx / dist) * force
                    val fy = (dy / dist) * force

                    if (n1.id != draggedNodeId) {
                        n1.vx -= fx
                        n1.vy -= fy
                    }
                    if (n2.id != draggedNodeId) {
                        n2.vx += fx
                        n2.vy += fy
                    }
                }
            }

            // 2. Spring forces along edges
            val nodeMap = nodes.associateBy { it.id }
            for (edge in edges) {
                val n1 = nodeMap[edge.source]
                val n2 = nodeMap[edge.target]
                if (n1 != null && n2 != null) {
                    val dx = n2.x - n1.x
                    val dy = n2.y - n1.y
                    val dist = max(1f, sqrt(dx * dx + dy * dy))
                    val displacement = dist - springLength
                    val force = displacement * springStrength
                    val fx = (dx / dist) * force
                    val fy = (dy / dist) * force

                    if (n1.id != draggedNodeId) {
                        n1.vx += fx
                        n1.vy += fy
                    }
                    if (n2.id != draggedNodeId) {
                        n2.vx -= fx
                        n2.vy -= fy
                    }
                }
            }

            // 3. Center gravity & velocity damping
            for (node in nodes) {
                if (node.id != draggedNodeId) {
                    node.vx -= node.x * centerGravity
                    node.vy -= node.y * centerGravity

                    node.vx *= damping
                    node.vy *= damping

                    node.x += node.vx
                    node.y += node.vy
                }
            }

            simTick = (simTick + 1f) % 1000f
            delay(16) // ~60fps simulation
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(colors.paper)
    ) {
        // Interactive Canvas for Graph
        Canvas(
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(Unit) {
                    detectTransformGestures { _, pan, zoom, _ ->
                        zoomScale = (zoomScale * zoom).coerceIn(0.3f, 3.5f)
                        panOffset += pan
                    }
                }
                .pointerInput(nodes) {
                    detectTapGestures { tapOffset ->
                        val centerX = size.width / 2f + panOffset.x
                        val centerY = size.height / 2f + panOffset.y

                        // Find clicked node
                        val clicked = nodes.find { node ->
                            val screenX = centerX + node.x * zoomScale
                            val screenY = centerY + node.y * zoomScale
                            val hitRadius = (16f + node.degree * 3f) * zoomScale + 20f
                            val dx = tapOffset.x - screenX
                            val dy = tapOffset.y - screenY
                            sqrt(dx * dx + dy * dy) <= hitRadius
                        }

                        if (clicked != null) {
                            onNodeClick(clicked.id)
                        }
                    }
                }
                .pointerInput(nodes) {
                    detectDragGestures(
                        onDragStart = { startPos ->
                            val centerX = size.width / 2f + panOffset.x
                            val centerY = size.height / 2f + panOffset.y

                            val hit = nodes.find { node ->
                                val screenX = centerX + node.x * zoomScale
                                val screenY = centerY + node.y * zoomScale
                                val hitRadius = (18f + node.degree * 4f) * zoomScale + 15f
                                val dx = startPos.x - screenX
                                val dy = startPos.y - screenY
                                sqrt(dx * dx + dy * dy) <= hitRadius
                            }
                            draggedNodeId = hit?.id
                        },
                        onDrag = { change, dragAmount ->
                            change.consume()
                            val hitId = draggedNodeId
                            if (hitId != null) {
                                val node = nodes.find { it.id == hitId }
                                if (node != null) {
                                    node.x += dragAmount.x / zoomScale
                                    node.y += dragAmount.y / zoomScale
                                    node.vx = 0f
                                    node.vy = 0f
                                }
                            } else {
                                panOffset += dragAmount
                            }
                        },
                        onDragEnd = {
                            draggedNodeId = null
                        },
                        onDragCancel = {
                            draggedNodeId = null
                        }
                    )
                }
        ) {
            // Read simTick to trigger recomposition
            val _tick = simTick
            val centerX = size.width / 2f + panOffset.x
            val centerY = size.height / 2f + panOffset.y

            val nodeMap = nodes.associateBy { it.id }

            // 1. Draw Edges
            val edgeColor = colors.accent.copy(alpha = 0.35f)
            for (edge in edges) {
                val n1 = nodeMap[edge.source]
                val n2 = nodeMap[edge.target]
                if (n1 != null && n2 != null) {
                    val p1 = Offset(centerX + n1.x * zoomScale, centerY + n1.y * zoomScale)
                    val p2 = Offset(centerX + n2.x * zoomScale, centerY + n2.y * zoomScale)

                    val isHighlighted = (activeNotePath != null && (n1.id == activeNotePath || n2.id == activeNotePath))
                    drawLine(
                        color = if (isHighlighted) colors.accent else edgeColor,
                        start = p1,
                        end = p2,
                        strokeWidth = if (isHighlighted) 2.5f * zoomScale else 1.2f * zoomScale
                    )
                }
            }

            // 2. Draw Nodes & Labels
            val textPaint = Paint().apply {
                color = colors.textPrimary.toArgb()
                textSize = (11f * zoomScale).coerceIn(9f, 18f) * density
                isAntiAlias = true
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                textAlign = Paint.Align.CENTER
            }

            for (node in nodes) {
                val pos = Offset(centerX + node.x * zoomScale, centerY + node.y * zoomScale)
                val baseRadius = (7f + min(12f, node.degree * 2.5f)) * zoomScale
                val isActive = node.id == activeNotePath
                val isSearchMatch = searchQuery.isNotBlank() && node.title.lowercase(Locale.getDefault()).contains(searchQuery.lowercase(Locale.getDefault()))

                // Outer halo for active note or search match
                if (isActive || isSearchMatch) {
                    drawCircle(
                        color = colors.accent.copy(alpha = 0.25f),
                        radius = baseRadius + 7f * zoomScale,
                        center = pos
                    )
                }

                // Node Circle
                drawCircle(
                    color = if (isActive || isSearchMatch) colors.accent else colors.surfaceRaised,
                    radius = baseRadius,
                    center = pos
                )
                drawCircle(
                    color = if (isActive || isSearchMatch) colors.accentInk else colors.accent,
                    radius = baseRadius,
                    center = pos,
                    style = androidx.compose.ui.graphics.drawscope.Stroke(width = 1.5f * zoomScale)
                )

                // Label Text
                drawContext.canvas.nativeCanvas.drawText(
                    node.title,
                    pos.x,
                    pos.y + baseRadius + 14f * zoomScale,
                    textPaint
                )
            }
        }

        // Top Toolbar Overlay (Search & Stats & Reset)
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp)
        ) {
            Surface(
                shape = RoundedCornerShape(14.dp),
                color = colors.surfaceRaised.copy(alpha = 0.92f),
                border = androidx.compose.foundation.BorderStroke(1.dp, colors.border),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .background(colors.accent, CircleShape)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "İlişki Grafiği (${nodes.size} Not, ${edges.size} Bağlantı)",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = colors.textPrimary
                        )
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        IconButton(
                            onClick = { zoomScale = (zoomScale * 1.25f).coerceAtMost(3.5f) },
                            modifier = Modifier.size(32.dp)
                        ) {
                            Icon(Icons.Rounded.ZoomIn, contentDescription = "Yakınlaş", tint = colors.textPrimary, modifier = Modifier.size(18.dp))
                        }
                        IconButton(
                            onClick = { zoomScale = (zoomScale / 1.25f).coerceAtLeast(0.3f) },
                            modifier = Modifier.size(32.dp)
                        ) {
                            Icon(Icons.Rounded.ZoomOut, contentDescription = "Uzaklaş", tint = colors.textPrimary, modifier = Modifier.size(18.dp))
                        }
                        IconButton(
                            onClick = {
                                zoomScale = 1.0f
                                panOffset = Offset.Zero
                            },
                            modifier = Modifier.size(32.dp)
                        ) {
                            Icon(Icons.Rounded.CenterFocusStrong, contentDescription = "Ortala", tint = colors.accent, modifier = Modifier.size(18.dp))
                        }
                    }
                }
            }
        }
    }
}
