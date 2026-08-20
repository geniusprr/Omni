package com.kapanis.mobil.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.kapanis.mobil.ui.theme.KapanisTheme

@Composable
fun GlassCard(
    modifier: Modifier = Modifier,
    backgroundColor: Color = KapanisTheme.colors.surfaceGlass,
    borderColor: Color = KapanisTheme.colors.border,
    shape: Shape = RoundedCornerShape(16.dp),
    contentPadding: Dp = 16.dp,
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit
) {
    val clickableModifier = if (onClick != null) {
        Modifier
            .clip(shape)
            .clickable(onClick = onClick)
    } else {
        Modifier
    }

    Surface(
        modifier = modifier.then(clickableModifier),
        shape = shape,
        color = backgroundColor,
        border = BorderStroke(1.dp, borderColor),
        tonalElevation = if (KapanisTheme.colors.isDark) 0.dp else 1.dp,
        shadowElevation = if (KapanisTheme.colors.isDark) 0.dp else 2.dp
    ) {
        Column(
            modifier = Modifier.padding(contentPadding),
            content = content
        )
    }
}
