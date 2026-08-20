package com.kapanis.mobil.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color

// ==========================================
// DARK THEME PALETTE (Elegant Midnight Titanium & Indigo)
// ==========================================
val DarkPaper = Color(0xFF0B0D14)
val DarkPaperDeep = Color(0xFF07080D)
val DarkSurface = Color(0xFF121622)
val DarkSurfaceRaised = Color(0xFF181F2E)
val DarkSurfaceHover = Color(0xFF20293D)
val DarkSurfaceGlass = Color(0xEA121622)

val DarkBorder = Color(0x14FFFFFF)
val DarkBorderStrong = Color(0x26FFFFFF)

val DarkInkPrimary = Color(0xFFF8FAFC)
val DarkInkSecondary = Color(0xFFCBD5E1)
val DarkTextMuted = Color(0xFF94A3B8)
val DarkTextFaint = Color(0xFF64748B)

val DarkAccent = Color(0xFF6366F1)
val DarkAccentVariant = Color(0xFF818CF8)
val DarkAccentInk = Color(0xFFFFFFFF)

val DarkSuccess = Color(0xFF10B981)
val DarkDanger = Color(0xFFF43F5E)
val DarkWarning = Color(0xFFF59E0B)

// ==========================================
// LIGHT THEME PALETTE (Elegant Porcelain & Sapphire)
// ==========================================
val LightPaper = Color(0xFFF8FAFC)
val LightPaperDeep = Color(0xFFF1F5F9)
val LightSurface = Color(0xFFFFFFFF)
val LightSurfaceRaised = Color(0xFFF1F5F9)
val LightSurfaceHover = Color(0xFFE2E8F0)
val LightSurfaceGlass = Color(0xF4FFFFFF)

val LightBorder = Color(0x0F0F172A)
val LightBorderStrong = Color(0x1F0F172A)

val LightInkPrimary = Color(0xFF0F172A)
val LightInkSecondary = Color(0xFF334155)
val LightTextMuted = Color(0xFF64748B)
val LightTextFaint = Color(0xFF94A3B8)

val LightAccent = Color(0xFF4F46E5)
val LightAccentVariant = Color(0xFF6366F1)
val LightAccentInk = Color(0xFFFFFFFF)

val LightSuccess = Color(0xFF059669)
val LightDanger = Color(0xFFE11D48)
val LightWarning = Color(0xFFD97706)

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
