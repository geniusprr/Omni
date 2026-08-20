package com.kapanis.mobil.ui.notes

import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.FormatListBulleted
import androidx.compose.material.icons.automirrored.rounded.KeyboardTab
import androidx.compose.material.icons.rounded.CheckBox
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material.icons.rounded.FormatBold
import androidx.compose.material.icons.rounded.FormatItalic
import androidx.compose.material.icons.rounded.FormatListNumbered
import androidx.compose.material.icons.rounded.FormatQuote
import androidx.compose.material.icons.rounded.FormatStrikethrough
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.Tag
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kapanis.mobil.data.vault.VaultNote
import com.kapanis.mobil.data.vault.VaultRepository
import com.kapanis.mobil.ui.theme.KapanisTheme
import kotlinx.coroutines.launch

@Composable
fun NoteEditorScreen(
    note: VaultNote,
    repository: VaultRepository,
    onBack: () -> Unit,
    onOpenWikilink: (String) -> Unit,
    onTagClick: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = KapanisTheme.colors
    val scope = rememberCoroutineScope()
    val focusRequester = remember { FocusRequester() }

    var currentNote by remember(note.path) { mutableStateOf(note) }
    var textFieldValue by remember(note.path) {
        mutableStateOf(TextFieldValue(text = note.content, selection = TextRange(note.content.length)))
    }

    BackHandler {
        onBack()
    }

    fun onTextEdited(newText: String) {
        scope.launch {
            val updated = repository.saveNote(currentNote.path, newText)
            currentNote = updated
        }
    }

    fun applyTransformation(transform: (TextFieldValue) -> TextFieldValue) {
        val next = transform(textFieldValue)
        textFieldValue = next
        onTextEdited(next.text)
        focusRequester.requestFocus()
    }

    val visualTransformation = remember(colors) {
        MarkdownVisualTransformation(colors)
    }

    // Active block detection
    val isH1 = MarkdownToolbarEngine.isLineActive(textFieldValue, "# ")
    val isH2 = MarkdownToolbarEngine.isLineActive(textFieldValue, "## ")
    val isH3 = MarkdownToolbarEngine.isLineActive(textFieldValue, "### ")
    val isTask = MarkdownToolbarEngine.isLineActive(textFieldValue, "- [ ] ") || MarkdownToolbarEngine.isLineActive(textFieldValue, "- [x] ")
    val isBullet = MarkdownToolbarEngine.isLineActive(textFieldValue, "- ")
    val isNumbered = MarkdownToolbarEngine.isLineActive(textFieldValue, "1. ")
    val isQuote = MarkdownToolbarEngine.isLineActive(textFieldValue, "> ")

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(colors.paper)
            .imePadding()
    ) {
        // Quick Reference Jump Bar for Wikilinks and Tags
        if (currentNote.outgoingLinks.isNotEmpty() || currentNote.tags.isNotEmpty()) {
            Surface(
                color = colors.surfaceRaised.copy(alpha = 0.6f),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = 14.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    currentNote.outgoingLinks.forEach { link ->
                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = colors.accent.copy(alpha = 0.12f),
                            modifier = Modifier.clickable { onOpenWikilink(link.targetTitle) }
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Icon(Icons.Rounded.Link, contentDescription = null, tint = colors.accent, modifier = Modifier.size(12.dp))
                                Text(link.alias ?: link.targetTitle, fontSize = 11.sp, color = colors.accent, fontWeight = FontWeight.Bold)
                            }
                        }
                    }

                    currentNote.tags.forEach { tag ->
                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = colors.surfaceRaised,
                            modifier = Modifier.clickable { onTagClick(tag) }
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Icon(Icons.Rounded.Tag, contentDescription = null, tint = colors.accent, modifier = Modifier.size(12.dp))
                                Text(tag, fontSize = 11.sp, color = colors.textPrimary, fontWeight = FontWeight.Medium)
                            }
                        }
                    }
                }
            }
        }

        // 1. True In-Place WYSIWYG Editor Canvas
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .padding(horizontal = 16.dp, vertical = 6.dp)
        ) {
            OutlinedTextField(
                value = textFieldValue,
                onValueChange = {
                    textFieldValue = it
                    onTextEdited(it.text)
                },
                modifier = Modifier
                    .fillMaxSize()
                    .focusRequester(focusRequester),
                visualTransformation = visualTransformation,
                placeholder = {
                    Text(
                        "Notunuzu buraya yazın...\n\n# Başlık\n- [ ] Görev kutusu\n[[Bağlantılı Not]]\n#etiket",
                        color = colors.textFaint,
                        fontSize = 15.sp
                    )
                },
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = Color.Transparent,
                    unfocusedContainerColor = Color.Transparent,
                    focusedBorderColor = Color.Transparent,
                    unfocusedBorderColor = Color.Transparent,
                    focusedTextColor = colors.textPrimary,
                    unfocusedTextColor = colors.textPrimary
                ),
                textStyle = androidx.compose.ui.text.TextStyle(
                    fontFamily = FontFamily.Default,
                    fontSize = 15.sp,
                    lineHeight = 23.sp
                )
            )
        }

        // 2. Obsidian / Notion Style Keyboard Toolbar
        Surface(
            color = colors.surfaceRaised,
            shape = RoundedCornerShape(topStart = 14.dp, topEnd = 14.dp),
            border = androidx.compose.foundation.BorderStroke(1.dp, colors.border),
            shadowElevation = 4.dp,
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 10.dp, vertical = 7.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Section 1: Headings (H1, H2, H3)
                ToolbarButton(label = "H1", isActive = isH1) {
                    applyTransformation { MarkdownToolbarEngine.toggleLinePrefix(it, "# ") }
                }
                ToolbarButton(label = "H2", isActive = isH2) {
                    applyTransformation { MarkdownToolbarEngine.toggleLinePrefix(it, "## ") }
                }
                ToolbarButton(label = "H3", isActive = isH3) {
                    applyTransformation { MarkdownToolbarEngine.toggleLinePrefix(it, "### ") }
                }

                ToolbarDivider()

                // Section 2: Inline Styles (Bold, Italic, Strikethrough, Code)
                ToolbarIconButton(icon = Icons.Rounded.FormatBold, desc = "Kalın") {
                    applyTransformation { MarkdownToolbarEngine.toggleInlineWrap(it, "**") }
                }
                ToolbarIconButton(icon = Icons.Rounded.FormatItalic, desc = "İtalik") {
                    applyTransformation { MarkdownToolbarEngine.toggleInlineWrap(it, "*") }
                }
                ToolbarIconButton(icon = Icons.Rounded.FormatStrikethrough, desc = "Üstü Çizili") {
                    applyTransformation { MarkdownToolbarEngine.toggleInlineWrap(it, "~~") }
                }
                ToolbarIconButton(icon = Icons.Rounded.Code, desc = "Satır İçi Kod") {
                    applyTransformation { MarkdownToolbarEngine.toggleInlineWrap(it, "`") }
                }

                ToolbarDivider()

                // Section 3: Lists (Checklist, Bullet, Numbered)
                ToolbarIconButton(icon = Icons.Rounded.CheckBox, desc = "Görev Kutusu", isActive = isTask) {
                    applyTransformation { MarkdownToolbarEngine.cycleChecklist(it) }
                }
                ToolbarIconButton(icon = Icons.AutoMirrored.Rounded.FormatListBulleted, desc = "Liste", isActive = isBullet) {
                    applyTransformation { MarkdownToolbarEngine.toggleLinePrefix(it, "- ") }
                }
                ToolbarIconButton(icon = Icons.Rounded.FormatListNumbered, desc = "Numaralı Liste", isActive = isNumbered) {
                    applyTransformation { MarkdownToolbarEngine.toggleLinePrefix(it, "1. ") }
                }

                ToolbarDivider()

                // Section 4: Obsidian Links & Tags
                ToolbarButton(label = "[[ ]]", desc = "Wikilink") {
                    applyTransformation { MarkdownToolbarEngine.toggleInlineWrap(it, "[[", "]]") }
                }
                ToolbarIconButton(icon = Icons.Rounded.Tag, desc = "Etiket") {
                    applyTransformation { MarkdownToolbarEngine.toggleInlineWrap(it, "#", "") }
                }
                ToolbarIconButton(icon = Icons.Rounded.FormatQuote, desc = "Alıntı", isActive = isQuote) {
                    applyTransformation { MarkdownToolbarEngine.toggleLinePrefix(it, "> ") }
                }

                ToolbarDivider()

                // Section 5: Blocks & Indent
                ToolbarButton(label = "```", desc = "Kod Bloğu") {
                    applyTransformation { MarkdownToolbarEngine.insertBlock(it, "```\n\n```") }
                }
                ToolbarButton(label = "---", desc = "Çizgi") {
                    applyTransformation { MarkdownToolbarEngine.insertBlock(it, "---") }
                }
                ToolbarIconButton(icon = Icons.AutoMirrored.Rounded.KeyboardTab, desc = "Girinti Ekle") {
                    applyTransformation { MarkdownToolbarEngine.indentLine(it) }
                }
            }
        }
    }
}

@Composable
private fun ToolbarButton(
    label: String,
    desc: String? = null,
    isActive: Boolean = false,
    onClick: () -> Unit
) {
    val colors = KapanisTheme.colors
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = if (isActive) colors.accent else colors.paper,
        border = androidx.compose.foundation.BorderStroke(
            1.dp,
            if (isActive) colors.accent else colors.border
        ),
        modifier = Modifier.clickable { onClick() }
    ) {
        Text(
            text = label,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            color = if (isActive) colors.accentInk else colors.textPrimary,
            fontFamily = FontFamily.Monospace,
            modifier = Modifier.padding(horizontal = 9.dp, vertical = 6.dp)
        )
    }
}

@Composable
private fun ToolbarIconButton(
    icon: ImageVector,
    desc: String,
    isActive: Boolean = false,
    onClick: () -> Unit
) {
    val colors = KapanisTheme.colors
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = if (isActive) colors.accent else colors.paper,
        border = androidx.compose.foundation.BorderStroke(
            1.dp,
            if (isActive) colors.accent else colors.border
        ),
        modifier = Modifier.clickable { onClick() }
    ) {
        Box(modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp)) {
            Icon(
                imageVector = icon,
                contentDescription = desc,
                tint = if (isActive) colors.accentInk else colors.textPrimary,
                modifier = Modifier.size(16.dp)
            )
        }
    }
}

@Composable
private fun ToolbarDivider() {
    val colors = KapanisTheme.colors
    Box(
        modifier = Modifier
            .width(1.dp)
            .height(20.dp)
            .background(colors.border)
    )
}
