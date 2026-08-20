package com.kapanis.mobil.ui.notes

import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.sp
import com.kapanis.mobil.ui.theme.AppColors

class MarkdownVisualTransformation(
    private val colors: AppColors
) : VisualTransformation {

    override fun filter(text: AnnotatedString): TransformedText {
        val raw = text.text
        val annotated = buildAnnotatedString {
            append(raw)

            var lineStart = 0
            val lines = raw.split('\n')

            for (line in lines) {
                val lineEnd = lineStart + line.length
                val trimmed = line.trim()

                // 1. Line-level Block Formats
                when {
                    trimmed.startsWith("# ") -> {
                        addStyle(
                            SpanStyle(
                                fontSize = 23.sp,
                                fontWeight = FontWeight.Black,
                                color = colors.textPrimary
                            ),
                            lineStart,
                            lineEnd
                        )
                    }
                    trimmed.startsWith("## ") -> {
                        addStyle(
                            SpanStyle(
                                fontSize = 19.sp,
                                fontWeight = FontWeight.Bold,
                                color = colors.accent
                            ),
                            lineStart,
                            lineEnd
                        )
                    }
                    trimmed.startsWith("### ") -> {
                        addStyle(
                            SpanStyle(
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold,
                                color = colors.textPrimary
                            ),
                            lineStart,
                            lineEnd
                        )
                    }
                    trimmed.startsWith("#### ") -> {
                        addStyle(
                            SpanStyle(
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = colors.textMuted
                            ),
                            lineStart,
                            lineEnd
                        )
                    }
                    trimmed.startsWith(">") -> {
                        addStyle(
                            SpanStyle(
                                fontStyle = FontStyle.Italic,
                                color = colors.textMuted
                            ),
                            lineStart,
                            lineEnd
                        )
                    }
                    trimmed.startsWith("- [x]") || trimmed.startsWith("- [X]") -> {
                        addStyle(
                            SpanStyle(
                                color = colors.textMuted,
                                textDecoration = TextDecoration.LineThrough
                            ),
                            lineStart,
                            lineEnd
                        )
                    }
                    trimmed.startsWith("- [ ]") -> {
                        addStyle(
                            SpanStyle(
                                color = colors.accent,
                                fontWeight = FontWeight.Bold
                            ),
                            lineStart,
                            (lineStart + line.indexOf("- [ ]") + 5).coerceAtMost(lineEnd)
                        )
                    }
                    trimmed.startsWith("- ") || trimmed.startsWith("* ") -> {
                        addStyle(
                            SpanStyle(
                                color = colors.accent,
                                fontWeight = FontWeight.Bold
                            ),
                            lineStart,
                            (lineStart + 2).coerceAtMost(lineEnd)
                        )
                    }
                }

                lineStart = lineEnd + 1 // +1 for the newline char
            }

            // 2. Bold **text**
            val boldRegex = Regex("""\*\*([^*]+)\*\*""")
            for (match in boldRegex.findAll(raw)) {
                addStyle(
                    SpanStyle(fontWeight = FontWeight.Bold, color = colors.textPrimary),
                    match.range.first,
                    match.range.last + 1
                )
            }

            // 3. Italic *text*
            val italicRegex = Regex("""(?<!\*)\*([^*]+)\*(?!\*)""")
            for (match in italicRegex.findAll(raw)) {
                addStyle(
                    SpanStyle(fontStyle = FontStyle.Italic),
                    match.range.first,
                    match.range.last + 1
                )
            }

            // 4. Strikethrough ~~text~~
            val strikeRegex = Regex("""~~([^~]+)~~""")
            for (match in strikeRegex.findAll(raw)) {
                addStyle(
                    SpanStyle(textDecoration = TextDecoration.LineThrough, color = colors.textMuted),
                    match.range.first,
                    match.range.last + 1
                )
            }

            // 5. Wikilinks [[Target]] or [[Target|Alias]]
            val wikiRegex = Regex("""\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]""")
            for (match in wikiRegex.findAll(raw)) {
                addStyle(
                    SpanStyle(
                        color = colors.accent,
                        fontWeight = FontWeight.Bold,
                        textDecoration = TextDecoration.Underline
                    ),
                    match.range.first,
                    match.range.last + 1
                )
            }

            // 6. Tags #tag
            val tagRegex = Regex("""(?:^|\s)(#[a-zA-Z0-9_\u00C0-\u017F\u0180-\u024F\u0400-\u04FF-]+)""")
            for (match in tagRegex.findAll(raw)) {
                val tagRange = match.groups[1]?.range
                if (tagRange != null) {
                    addStyle(
                        SpanStyle(
                            color = colors.accent,
                            fontWeight = FontWeight.Bold
                        ),
                        tagRange.first,
                        tagRange.last + 1
                    )
                }
            }

            // 7. Inline code `code`
            val codeRegex = Regex("""`([^`]+)`""")
            for (match in codeRegex.findAll(raw)) {
                addStyle(
                    SpanStyle(
                        fontFamily = FontFamily.Monospace,
                        background = colors.surfaceRaised,
                        color = colors.accent
                    ),
                    match.range.first,
                    match.range.last + 1
                )
            }
        }

        return TransformedText(annotated, OffsetMapping.Identity)
    }
}
