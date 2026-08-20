package com.kapanis.mobil.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color

// ==========================================
// DARK THEME PALETTE (studied-DNA Dark Glass)
// ==========================================
val DarkPaper = Color(0xFF0A0E16)
val DarkPaperDeep = Color(0xFF06090F)
val DarkSurface = Color(0xFF121824)
val DarkSurfaceRaised = Color(0xFF182030)
val DarkSurfaceHover = Color(0xFF1E283C)
val DarkSurfaceGlass = Color(0xDC121824)

val DarkBorder = Color(0x1FFFFFFF)
val DarkBorderStrong = Color(0x33FFFFFF)

val DarkInkPrimary = Color(0xFFF8FAFC)
val DarkInkSecondary = Color(0xFFE2E8F0)
val DarkTextMuted = Color(0xFF94A3B8)
val DarkTextFaint = Color(0xFF64748B)

val DarkAccent = Color(0xFF38BDF8)
val DarkAccentVariant = Color(0xFF60A5FA)
val DarkAccentInk = Color(0xFF081028)

val DarkSuccess = Color(0xFF34D399)
val DarkDanger = Color(0xFFF87171)
val DarkWarning = Color(0xFFFBBF24)

// ==========================================
// LIGHT THEME PALETTE (studied-DNA Light Glass)
// ==========================================
val LightPaper = Color(0xFFF1F5F9)
val LightPaperDeep = Color(0xFFE2E8F0)
val LightSurface = Color(0xFFFFFFFF)
val LightSurfaceRaised = Color(0xFFF8FAFC)
val LightSurfaceHover = Color(0xFFEDF2F7)
val LightSurfaceGlass = Color(0xEEFFFFFF)

val LightBorder = Color(0x140F172A)
val LightBorderStrong = Color(0x290F172A)

val LightInkPrimary = Color(0xFF0F172A)
val LightInkSecondary = Color(0xFF334155)
val LightTextMuted = Color(0xFF64748B)
val LightTextFaint = Color(0xFF94A3B8)

val LightAccent = Color(0xFF2563EB)
val LightAccentVariant = Color(0xFF3B82F6)
val LightAccentInk = Color(0xFFFFFFFF)

val LightSuccess = Color(0xFF10B981)
val LightDanger = Color(0xFFEF4444)
val LightWarning = Color(0xFFF59E0B)

// Backward compatibility aliases
val AccentBlue = DarkAccentVariant
val AccentCyan = DarkAccent
val AccentInk = DarkAccentInk
val InkPrimary = DarkInkPrimary
val InkSecondary = DarkInkSecondary
val TextMuted = DarkTextMuted
val TextFaint = DarkTextFaint
val RuleColor = DarkBorder
val RuleStrong = DarkBorderStrong
val SuccessGreen = DarkSuccess
val DangerRed = DarkDanger
val WarningAmber = DarkWarning

@Immutable
data class AppColors(
    val paper: Color,
    val paperDeep: Color,
    val surface: Color,
    val surfaceRaised: Color,
    val surfaceHover: Color,
    val surfaceGlass: Color,
    val border: Color,
    val borderStrong: Color,
    val textPrimary: Color,
    val textSecondary: Color,
    val textMuted: Color,
    val textFaint: Color,
    val accent: Color,
    val accentVariant: Color,
    val accentInk: Color,
    val success: Color,
    val danger: Color,
    val warning: Color,
    val isDark: Boolean
)

val DarkAppColors = AppColors(
    paper = DarkPaper,
    paperDeep = DarkPaperDeep,
    surface = DarkSurface,
    surfaceRaised = DarkSurfaceRaised,
    surfaceHover = DarkSurfaceHover,
    surfaceGlass = DarkSurfaceGlass,
    border = DarkBorder,
    borderStrong = DarkBorderStrong,
    textPrimary = DarkInkPrimary,
    textSecondary = DarkInkSecondary,
    textMuted = DarkTextMuted,
    textFaint = DarkTextFaint,
    accent = DarkAccent,
    accentVariant = DarkAccentVariant,
    accentInk = DarkAccentInk,
    success = DarkSuccess,
    danger = DarkDanger,
    warning = DarkWarning,
    isDark = true
)

val LightAppColors = AppColors(
    paper = LightPaper,
    paperDeep = LightPaperDeep,
    surface = LightSurface,
    surfaceRaised = LightSurfaceRaised,
    surfaceHover = LightSurfaceHover,
    surfaceGlass = LightSurfaceGlass,
    border = LightBorder,
    borderStrong = LightBorderStrong,
    textPrimary = LightInkPrimary,
    textSecondary = LightInkSecondary,
    textMuted = LightTextMuted,
    textFaint = LightTextFaint,
    accent = LightAccent,
    accentVariant = LightAccentVariant,
    accentInk = LightAccentInk,
    success = LightSuccess,
    danger = LightDanger,
    warning = LightWarning,
    isDark = false
)
