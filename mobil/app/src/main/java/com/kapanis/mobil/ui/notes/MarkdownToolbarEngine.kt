package com.kapanis.mobil.ui.notes

import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue

object MarkdownToolbarEngine {

    /**
     * Line-level prefix toggler (H1, H2, H3, Bullet, Number, Quote)
     */
    fun toggleLinePrefix(value: TextFieldValue, prefix: String): TextFieldValue {
        val text = value.text
        val selection = value.selection
        val cursor = selection.start.coerceIn(0, text.length)

        // Find current line bounds
        val lineStart = if (cursor == 0) 0 else {
            val lastNl = text.lastIndexOf('\n', cursor - 1)
            if (lastNl == -1) 0 else lastNl + 1
        }
        val lineEnd = text.indexOf('\n', cursor).let { if (it == -1) text.length else it }
        val line = text.substring(lineStart, lineEnd)

        val knownPrefixes = listOf(
            "### ", "## ", "# ",
            "- [ ] ", "- [x] ", "- [X] ",
            "- ", "* ", "> ", "1. "
        )

        val currentPrefix = knownPrefixes.find { line.startsWith(it) }

        val (newLine, diff) = if (currentPrefix == prefix) {
            // Toggle off
            val stripped = line.substring(prefix.length)
            Pair(stripped, -prefix.length)
        } else if (currentPrefix != null) {
            // Replace prefix (e.g. H1 -> H2, or list -> quote)
            val replaced = prefix + line.substring(currentPrefix.length)
            Pair(replaced, prefix.length - currentPrefix.length)
        } else {
            // Prepend prefix
            val prepended = prefix + line
            Pair(prepended, prefix.length)
        }

        val newText = text.substring(0, lineStart) + newLine + text.substring(lineEnd)
        val newCursor = (cursor + diff).coerceIn(0, newText.length)

        return TextFieldValue(
            text = newText,
            selection = TextRange(newCursor)
        )
    }

    /**
     * Toggles checklist item: normal -> - [ ] -> - [x] -> normal
     */
    fun cycleChecklist(value: TextFieldValue): TextFieldValue {
        val text = value.text
        val selection = value.selection
        val cursor = selection.start.coerceIn(0, text.length)

        val lineStart = if (cursor == 0) 0 else {
            val lastNl = text.lastIndexOf('\n', cursor - 1)
            if (lastNl == -1) 0 else lastNl + 1
        }
        val lineEnd = text.indexOf('\n', cursor).let { if (it == -1) text.length else it }
        val line = text.substring(lineStart, lineEnd)

        val (newLine, diff) = when {
            line.startsWith("- [ ] ") -> {
                val replaced = "- [x] " + line.substring(6)
                Pair(replaced, 0)
            }
            line.startsWith("- [x] ") || line.startsWith("- [X] ") -> {
                val replaced = line.substring(6)
                Pair(replaced, -6)
            }
            line.startsWith("- ") -> {
                val replaced = "- [ ] " + line.substring(2)
                Pair(replaced, 4)
            }
            else -> {
                val replaced = "- [ ] $line"
                Pair(replaced, 6)
            }
        }

        val newText = text.substring(0, lineStart) + newLine + text.substring(lineEnd)
        val newCursor = (cursor + diff).coerceIn(0, newText.length)

        return TextFieldValue(
            text = newText,
            selection = TextRange(newCursor)
        )
    }

    /**
     * Inline formatting wrapper (Bold, Italic, Strikethrough, Wikilink, Code, Tag)
     */
    fun toggleInlineWrap(value: TextFieldValue, prefix: String, suffix: String = prefix): TextFieldValue {
        val text = value.text
        val sel = value.selection
        val start = minOf(sel.start, sel.end).coerceIn(0, text.length)
        val end = maxOf(sel.start, sel.end).coerceIn(0, text.length)

        if (start != end) {
            // Text is selected
            val selected = text.substring(start, end)
            val isWrapped = selected.startsWith(prefix) && selected.endsWith(suffix) && selected.length >= prefix.length + suffix.length

            if (isWrapped) {
                // Unwrap
                val unwrapped = selected.substring(prefix.length, selected.length - suffix.length)
                val newText = text.substring(0, start) + unwrapped + text.substring(end)
                return TextFieldValue(newText, TextRange(start, start + unwrapped.length))
            } else {
                // Wrap
                val wrapped = prefix + selected + suffix
                val newText = text.substring(0, start) + wrapped + text.substring(end)
                return TextFieldValue(newText, TextRange(start, start + wrapped.length))
            }
        } else {
            // No selection: check surrounding
            val hasSurrounding = (start >= prefix.length && start + suffix.length <= text.length) &&
                    text.substring(start - prefix.length, start) == prefix &&
                    text.substring(start, start + suffix.length) == suffix

            if (hasSurrounding) {
                // Remove surrounding symbols
                val newText = text.substring(0, start - prefix.length) + text.substring(start + suffix.length)
                return TextFieldValue(newText, TextRange(start - prefix.length))
            } else {
                // Insert prefix and suffix, place cursor between
                val newText = text.substring(0, start) + prefix + suffix + text.substring(start)
                return TextFieldValue(newText, TextRange(start + prefix.length))
            }
        }
    }

    /**
     * Insert code block or horizontal rule
     */
    fun insertBlock(value: TextFieldValue, block: String): TextFieldValue {
        val text = value.text
        val cursor = value.selection.start.coerceIn(0, text.length)

        val prefixNewline = if (cursor > 0 && text[cursor - 1] != '\n') "\n" else ""
        val suffixNewline = if (cursor < text.length && text[cursor] != '\n') "\n" else ""

        val insert = "$prefixNewline$block$suffixNewline"
        val newText = text.substring(0, cursor) + insert + text.substring(cursor)
        val newCursor = cursor + insert.length

        return TextFieldValue(newText, TextRange(newCursor))
    }

    /**
     * Indent current line (adds 2 spaces)
     */
    fun indentLine(value: TextFieldValue): TextFieldValue {
        val text = value.text
        val cursor = value.selection.start.coerceIn(0, text.length)

        val lineStart = if (cursor == 0) 0 else {
            val lastNl = text.lastIndexOf('\n', cursor - 1)
            if (lastNl == -1) 0 else lastNl + 1
        }

        val newText = text.substring(0, lineStart) + "  " + text.substring(lineStart)
        return TextFieldValue(newText, TextRange(cursor + 2))
    }

    /**
     * Checks if current line starts with given prefix
     */
    fun isLineActive(value: TextFieldValue, prefix: String): Boolean {
        val text = value.text
        val cursor = value.selection.start.coerceIn(0, text.length)
        val lineStart = if (cursor == 0) 0 else {
            val lastNl = text.lastIndexOf('\n', cursor - 1)
            if (lastNl == -1) 0 else lastNl + 1
        }
        val lineEnd = text.indexOf('\n', cursor).let { if (it == -1) text.length else it }
        val line = text.substring(lineStart, lineEnd)
        return line.startsWith(prefix)
    }
}
