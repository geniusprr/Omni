package com.kapanis.mobil.ui.notes

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.RadioButtonUnchecked
import androidx.compose.material.icons.rounded.Tag
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kapanis.mobil.data.vault.VaultNote
import com.kapanis.mobil.ui.theme.KapanisTheme

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun MarkdownRenderer(
    note: VaultNote,
    onOpenWikilink: (String) -> Unit = {},
    onTagClick: (String) -> Unit = {},
    onToggleTask: (lineNumber: Int, isChecked: Boolean) -> Unit = { _, _ -> },
    modifier: Modifier = Modifier
) {
    val colors = KapanisTheme.colors
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 4.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        // 1. Frontmatter Card (if present)
        if (note.frontmatter.isNotEmpty() || note.tags.isNotEmpty()) {
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = colors.surfaceRaised,
                border = androidx.compose.foundation.BorderStroke(1.dp, colors.border),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(6.dp)
                                .background(colors.accent, CircleShape)
                        )
                        Text(
                            text = "Metadata & Frontmatter",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = colors.textMuted
                        )
                    }

                    if (note.tags.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(8.dp))
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            note.tags.forEach { tag ->
                                Surface(
                                    shape = RoundedCornerShape(8.dp),
                                    color = colors.accent.copy(alpha = 0.12f),
                                    border = androidx.compose.foundation.BorderStroke(1.dp, colors.accent.copy(alpha = 0.3f)),
                                    modifier = Modifier.clickable { onTagClick(tag) }
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Icon(
                                            imageVector = Icons.Rounded.Tag,
                                            contentDescription = null,
                                            tint = colors.accent,
                                            modifier = Modifier.size(12.dp)
                                        )
                                        Spacer(modifier = Modifier.width(3.dp))
                                        Text(
                                            text = tag,
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            color = colors.accent
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Spacer(modifier = Modifier.height(4.dp))
        }

        // 2. Parse & Render Lines
        val lines = note.content.lines()
        var inCodeBlock = false
        val codeBlockBuffer = mutableListOf<String>()

        lines.forEachIndexed { index, line ->
            val lineNumber = index + 1
            val trimmed = line.trim()

            // Code block handling
            if (trimmed.startsWith("```")) {
                if (inCodeBlock) {
                    val codeContent = codeBlockBuffer.joinToString("\n")
                    codeBlockBuffer.clear()
                    inCodeBlock = false

                    // Render Code Block Card
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = colors.paper.copy(alpha = 0.9f),
                        border = androidx.compose.foundation.BorderStroke(1.dp, colors.border),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(10.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "KOD BLOĞU",
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = colors.textFaint,
                                    fontFamily = FontFamily.Monospace
                                )
                                IconButton(
                                    onClick = {
                                        clipboard.setText(AnnotatedString(codeContent))
                                        Toast.makeText(context, "Kod kopyalandı ✓", Toast.LENGTH_SHORT).show()
                                    },
                                    modifier = Modifier.size(24.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.Rounded.ContentCopy,
                                        contentDescription = "Kopyala",
                                        tint = colors.textMuted,
                                        modifier = Modifier.size(14.dp)
                                    )
                                }
                            }
                            Text(
                                text = codeContent,
                                fontFamily = FontFamily.Monospace,
                                fontSize = 12.sp,
                                color = colors.textPrimary,
                                lineHeight = 16.sp
                            )
                        }
                    }
                } else {
                    inCodeBlock = true
                    codeBlockBuffer.clear()
                }
                return@forEachIndexed
            }

            if (inCodeBlock) {
                codeBlockBuffer.add(line)
                return@forEachIndexed
            }

            // Skip YAML frontmatter lines in body view
            if (trimmed == "---") {
                HorizontalDivider(color = colors.border, thickness = 1.dp, modifier = Modifier.padding(vertical = 4.dp))
                return@forEachIndexed
            }

            // Headings
            when {
                line.startsWith("# ") -> {
                    Text(
                        text = line.removePrefix("# ").trim(),
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Black,
                        color = colors.textPrimary,
                        modifier = Modifier.padding(top = 8.dp, bottom = 2.dp)
                    )
                }
                line.startsWith("## ") -> {
                    Text(
                        text = line.removePrefix("## ").trim(),
                        fontSize = 19.sp,
                        fontWeight = FontWeight.Bold,
                        color = colors.accent,
                        modifier = Modifier.padding(top = 6.dp, bottom = 2.dp)
                    )
                }
                line.startsWith("### ") -> {
                    Text(
                        text = line.removePrefix("### ").trim(),
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = colors.textPrimary,
                        modifier = Modifier.padding(top = 4.dp, bottom = 1.dp)
                    )
                }
                line.startsWith("#### ") -> {
                    Text(
                        text = line.removePrefix("#### ").trim(),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = colors.textMuted
                    )
                }
                // Interactive Task Checkbox: - [ ] or - [x]
                trimmed.startsWith("- [ ]") || trimmed.startsWith("- [x]") || trimmed.startsWith("- [X]") -> {
                    val isChecked = trimmed.startsWith("- [x]") || trimmed.startsWith("- [X]")
                    val taskText = trimmed.substring(5).trim()

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .clickable { onToggleTask(lineNumber, !isChecked) }
                            .padding(vertical = 4.dp, horizontal = 4.dp)
                    ) {
                        Icon(
                            imageVector = if (isChecked) Icons.Rounded.CheckCircle else Icons.Rounded.RadioButtonUnchecked,
                            contentDescription = if (isChecked) "Tamamlandı" else "Yapılacak",
                            tint = if (isChecked) colors.accent else colors.textMuted,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = buildRichText(taskText, colors.accent, colors.textPrimary, colors.textMuted, onOpenWikilink, onTagClick),
                            fontSize = 13.sp,
                            color = if (isChecked) colors.textMuted else colors.textPrimary,
                            textDecoration = if (isChecked) TextDecoration.LineThrough else TextDecoration.None
                        )
                    }
                }
                // Blockquote: >
                trimmed.startsWith(">") -> {
                    val quoteText = trimmed.removePrefix(">").trim()
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(colors.surfaceRaised, RoundedCornerShape(8.dp))
                            .padding(horizontal = 10.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .width(3.dp)
                                .height(20.dp)
                                .background(colors.accent, RoundedCornerShape(2.dp))
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = quoteText,
                            fontSize = 13.sp,
                            fontStyle = FontStyle.Italic,
                            color = colors.textMuted
                        )
                    }
                }
                // Bullet List: - or *
                trimmed.startsWith("- ") || trimmed.startsWith("* ") -> {
                    val itemText = trimmed.substring(2).trim()
                    Row(
                        verticalAlignment = Alignment.Top,
                        modifier = Modifier.padding(start = 6.dp, top = 2.dp, bottom = 2.dp)
                    ) {
                        Text(
                            text = "•",
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            color = colors.accent,
                            modifier = Modifier.padding(end = 8.dp)
                        )
                        Text(
                            text = buildRichText(itemText, colors.accent, colors.textPrimary, colors.textMuted, onOpenWikilink, onTagClick),
                            fontSize = 13.sp,
                            color = colors.textPrimary,
                            lineHeight = 18.sp
                        )
                    }
                }
                // Blank Line
                trimmed.isEmpty() -> {
                    Spacer(modifier = Modifier.height(4.dp))
                }
                // Regular Paragraph
                else -> {
                    Text(
                        text = buildRichText(line, colors.accent, colors.textPrimary, colors.textMuted, onOpenWikilink, onTagClick),
                        fontSize = 13.sp,
                        color = colors.textPrimary,
                        lineHeight = 19.sp,
                        modifier = Modifier.padding(vertical = 1.dp)
                    )
                }
            }
        }
    }
}

private fun buildRichText(
    text: String,
    accentColor: Color,
    textColor: Color,
    mutedColor: Color,
    onOpenWikilink: (String) -> Unit,
    onTagClick: (String) -> Unit
): AnnotatedString {
    return buildAnnotatedString {
        var cursor = 0
        val wikilinkRegex = Regex("""\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]""")
        val boldRegex = Regex("""\*\*([^*]+)\*\*""")
        val codeRegex = Regex("""`([^`]+)`""")
        val tagRegex = Regex("""(?:^|\s)(#[a-zA-Z0-9_\u00C0-\u017F\u0180-\u024F\u0400-\u04FF-]+)""")

        // Simple annotated parser combining wikilinks, bold, code, tags
        var remaining = text
        var matchFound = true

        while (remaining.isNotEmpty() && matchFound) {
            val wikiMatch = wikilinkRegex.find(remaining)
            val boldMatch = boldRegex.find(remaining)
            val codeMatch = codeRegex.find(remaining)
            val tagMatch = tagRegex.find(remaining)

            val nextMatch = listOfNotNull(wikiMatch, boldMatch, codeMatch, tagMatch)
                .minByOrNull { it.range.first }

            if (nextMatch == null) {
                append(remaining)
                break
            }

            val matchStart = nextMatch.range.first
            if (matchStart > 0) {
                append(remaining.substring(0, matchStart))
            }

            when (nextMatch) {
                wikiMatch -> {
                    val targetTitle = wikiMatch.groupValues[1].trim()
                    val alias = wikiMatch.groupValues.getOrNull(3)?.trim()?.ifEmpty { null }
                    val display = alias ?: targetTitle

                    pushStyle(SpanStyle(color = accentColor, fontWeight = FontWeight.Bold, textDecoration = TextDecoration.Underline))
                    append(display)
                    pop()
                }
                boldMatch -> {
                    val boldText = boldMatch.groupValues[1]
                    pushStyle(SpanStyle(fontWeight = FontWeight.Bold, color = textColor))
                    append(boldText)
                    pop()
                }
                codeMatch -> {
                    val inlineCode = codeMatch.groupValues[1]
                    pushStyle(SpanStyle(fontFamily = FontFamily.Monospace, background = mutedColor.copy(alpha = 0.15f), color = accentColor))
                    append(" $inlineCode ")
                    pop()
                }
                tagMatch -> {
                    val tag = tagMatch.groupValues[1].trim()
                    pushStyle(SpanStyle(color = accentColor, fontWeight = FontWeight.SemiBold))
                    append(tag)
                    pop()
                }
            }

            val matchEnd = nextMatch.range.last + 1
            remaining = if (matchEnd < remaining.length) remaining.substring(matchEnd) else ""
        }
    }
}
