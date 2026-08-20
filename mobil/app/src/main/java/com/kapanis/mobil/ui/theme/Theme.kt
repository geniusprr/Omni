package com.kapanis.mobil.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

val LocalAppColors = staticCompositionLocalOf { DarkAppColors }

private val DarkColorScheme = darkColorScheme(
    primary = DarkAccent,
    onPrimary = DarkAccentInk,
    primaryContainer = DarkSurfaceRaised,
    onPrimaryContainer = DarkInkPrimary,
    secondary = DarkAccentVariant,
    onSecondary = DarkAccentInk,
    background = DarkPaper,
    onBackground = DarkInkPrimary,
    surface = DarkSurface,
    onSurface = DarkInkPrimary,
    surfaceVariant = DarkSurfaceRaised,
    onSurfaceVariant = DarkTextMuted,
    outline = DarkBorder,
    outlineVariant = DarkBorderStrong
)

private val LightColorScheme = lightColorScheme(
    primary = LightAccent,
    onPrimary = LightAccentInk,
    primaryContainer = LightSurfaceRaised,
    onPrimaryContainer = LightInkPrimary,
    secondary = LightAccentVariant,
    onSecondary = LightAccentInk,
    background = LightPaper,
    onBackground = LightInkPrimary,
    surface = LightSurface,
    onSurface = LightInkPrimary,
    surfaceVariant = LightSurfaceRaised,
    onSurfaceVariant = LightTextMuted,
    outline = LightBorder,
    outlineVariant = LightBorderStrong
)

object KapanisTheme {
    val colors: AppColors
        @Composable
        @ReadOnlyComposable
        get() = LocalAppColors.current
}

@Composable
fun KapanisTheme(
    darkTheme: Boolean = true,
    content: @Composable () -> Unit
) {
    val appColors = if (darkTheme) DarkAppColors else LightAppColors
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
    val view = LocalView.current

    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as? Activity)?.window ?: return@SideEffect
            window.statusBarColor = appColors.paper.toArgb()
            window.navigationBarColor = appColors.paper.toArgb()
            val controller = WindowCompat.getInsetsController(window, view)
            controller.isAppearanceLightStatusBars = !darkTheme
            controller.isAppearanceLightNavigationBars = !darkTheme
        }
    }

    CompositionLocalProvider(LocalAppColors provides appColors) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = Typography,
            content = content
        )
    }
}
