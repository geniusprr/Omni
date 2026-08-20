package com.kapanis.mobil.ui.notes

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.FormatBold
import androidx.compose.material.icons.rounded.FormatItalic
import androidx.compose.material.icons.rounded.FormatListBulleted
import androidx.compose.material.icons.rounded.FormatQuote
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.Preview
import androidx.compose.material.icons.rounded.Tag
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kapanis.mobil.data.vault.ObsidianEditorMode
import com.kapanis.mobil.data.vault.VaultNote
import com.kapanis.mobil.ui.theme.KapanisTheme

@Composable
fun ObsidianEditor(
    note: VaultNote,
    onContentChanged: (String) -> Unit,
    onOpenWikilink: (String) -> Unit,
    onTagClick: (String) -> Unit,
    onToggleTask: (lineNumber: Int, isChecked: Boolean) -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = KapanisTheme.colors
    var mode by remember { mutableStateOf(ObsidianEditorMode.LIVE_PREVIEW) }
    var textFieldValue by remember(note.path) {
        mutableStateOf(TextFieldValue(text = note.content, selection = TextRange(note.content.length)))
    }

    // Insert formatting snippet helper
    fun insertFormatting(prefix: String, suffix: String = "") {
        val sel = textFieldValue.selection
        val text = textFieldValue.text
        val selectedText = if (sel.start != sel.end) text.substring(sel.start, sel.end) else ""
        val newText = text.substring(0, sel.start) + prefix + selectedText + suffix + text.substring(sel.end)
        val newCursor = sel.start + prefix.length + selectedText.length

        textFieldValue = TextFieldValue(
            text = newText,
            selection = TextRange(newCursor)
        )
        onContentChanged(newText)
    }

    val wordCount = note.content.split(Regex("""\s+""")).filter { it.isNotBlank() }.size
    val charCount = note.content.length

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(colors.paper)
    ) {
        // 1. Editor Header Toolbar (Mode Switcher & Stats)
        Surface(
            color = colors.surfaceRaised,
            shape = RoundedCornerShape(12.dp),
            border = androidx.compose.foundation.BorderStroke(1.dp, colors.border),
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 6.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Mode selector tabs
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    ModeButton(
                        icon = Icons.Rounded.Preview,
                        label = "Önizleme",
                        isSelected = mode == ObsidianEditorMode.LIVE_PREVIEW,
                        onClick = { mode = ObsidianEditorMode.LIVE_PREVIEW }
                    )
                    ModeButton(
                        icon = Icons.Rounded.Edit,
                        label = "Kaynak",
                        isSelected = mode == ObsidianEditorMode.SOURCE,
                        onClick = { mode = ObsidianEditorMode.SOURCE }
                    )
                    ModeButton(
                        icon = Icons.Rounded.Visibility,
                        label = "Okuma",
                        isSelected = mode == ObsidianEditorMode.READING,
                        onClick = { mode = ObsidianEditorMode.READING }
                    )
                }

                // Stats badge
                Text(
                    text = "$wordCount kelime • $charCount kr",
                    fontSize = 11.sp,
                    color = colors.textFaint,
                    fontWeight = FontWeight.Medium
                )
            }
        }

        // 2. Obsidian Keyboard Accessory Formatting Bar (Visible in SOURCE or LIVE edit)
        if (mode != ObsidianEditorMode.READING) {
            Surface(
                color = colors.surfaceRaised.copy(alpha = 0.7f),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 2.dp),
                shape = RoundedCornerShape(8.dp)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = 6.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    FormatChip("H1") { insertFormatting("# ") }
                    FormatChip("H2") { insertFormatting("## ") }
                    FormatChip("H3") { insertFormatting("### ") }
                    FormatIconChip(Icons.Rounded.FormatBold, "Kalın") { insertFormatting("**", "**") }
                    FormatIconChip(Icons.Rounded.FormatItalic, "İtalik") { insertFormatting("*", "*") }
                    FormatChip("[[ ]]") { insertFormatting("[[", "]]") }
                    FormatIconChip(Icons.Rounded.Tag, "Etiket") { insertFormatting("#") }
                    FormatChip("[ ]") { insertFormatting("- [ ] ") }
                    FormatIconChip(Icons.Rounded.FormatQuote, "Alıntı") { insertFormatting("> ") }
                    FormatIconChip(Icons.Rounded.Code, "Kod") { insertFormatting("```\n", "\n```") }
                    FormatIconChip(Icons.Rounded.FormatListBulleted, "Liste") { insertFormatting("- ") }
                    FormatChip("---") { insertFormatting("\n---\n") }
                }
            }
        }

        Spacer(modifier = Modifier.height(4.dp))

        // 3. Content Area based on selected Mode
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .padding(horizontal = 8.dp)
        ) {
            when (mode) {
                ObsidianEditorMode.READING, ObsidianEditorMode.LIVE_PREVIEW -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .verticalScroll(rememberScrollState())
                    ) {
                        MarkdownRenderer(
                            note = note,
                            onOpenWikilink = onOpenWikilink,
                            onTagClick = onTagClick,
                            onToggleTask = onToggleTask
                        )
                        Spacer(modifier = Modifier.height(60.dp))
                    }
                }

                ObsidianEditorMode.SOURCE -> {
                    OutlinedTextField(
                        value = textFieldValue,
                        onValueChange = {
                            textFieldValue = it
                            onContentChanged(it.text)
                        },
                        modifier = Modifier.fillMaxSize(),
                        placeholder = {
                            Text(
                                "Markdown notunuzu yazmaya başlayın...\n\n[[Not Adı]] ile bağlantı kurabilirsiniz.",
                                color = colors.textFaint,
                                fontSize = 13.sp
                            )
                        },
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = colors.surfaceRaised,
                            unfocusedContainerColor = colors.surfaceRaised,
                            focusedBorderColor = colors.accent,
                            unfocusedBorderColor = colors.border,
                            focusedTextColor = colors.textPrimary,
                            unfocusedTextColor = colors.textPrimary
                        ),
                        textStyle = androidx.compose.ui.text.TextStyle(
                            fontFamily = FontFamily.Monospace,
                            fontSize = 13.sp,
                            lineHeight = 19.sp
                        ),
                        shape = RoundedCornerShape(12.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun ModeButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    val colors = KapanisTheme.colors
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = if (isSelected) colors.accent.copy(alpha = 0.16f) else androidx.compose.ui.graphics.Color.Transparent,
        border = if (isSelected) androidx.compose.foundation.BorderStroke(1.dp, colors.accent.copy(alpha = 0.35f)) else null,
        modifier = androidx.compose.ui.Modifier.clickable { onClick() }
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = label,
                tint = if (isSelected) colors.accent else colors.textMuted,
                modifier = Modifier.size(14.dp)
            )
            Text(
                text = label,
                fontSize = 11.sp,
                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                color = if (isSelected) colors.accent else colors.textMuted
            )
        }
    }
}

@Composable
private fun FormatChip(label: String, onClick: () -> Unit) {
    val colors = KapanisTheme.colors
    Surface(
        shape = RoundedCornerShape(6.dp),
        color = colors.paper,
        border = androidx.compose.foundation.BorderStroke(1.dp, colors.border),
        modifier = Modifier.clickable { onClick() }
    ) {
        Text(
            text = label,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace,
            color = colors.accent,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
        )
    }
}

@Composable
private fun FormatIconChip(icon: androidx.compose.ui.graphics.vector.ImageVector, desc: String, onClick: () -> Unit) {
    val colors = KapanisTheme.colors
    Surface(
        shape = RoundedCornerShape(6.dp),
        color = colors.paper,
        border = androidx.compose.foundation.BorderStroke(1.dp, colors.border),
        modifier = Modifier.clickable { onClick() }
    ) {
        Box(modifier = Modifier.padding(horizontal = 6.dp, vertical = 4.dp)) {
            Icon(
                imageVector = icon,
                contentDescription = desc,
                tint = colors.textPrimary,
                modifier = Modifier.size(15.dp)
            )
        }
    }
}
