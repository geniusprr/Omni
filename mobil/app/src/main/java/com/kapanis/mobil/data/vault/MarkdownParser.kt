package com.kapanis.mobil.data.vault

import java.util.Locale

object MarkdownParser {

    private val wikilinkRegex = Regex("""\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]""")
    private val tagRegex = Regex("""(?:^|\s)(#[a-zA-Z0-9_\u00C0-\u017F\u0180-\u024F\u0400-\u04FF-]+)""")
    private val headingRegex = Regex("""^(#{1,6})\s+(.+)$""")

    fun normalizeTitle(title: String): String {
        return title.trim()
            .lowercase(Locale.getDefault())
            .removeSuffix(".md")
    }

    fun parseMarkdownFile(
        path: String,
        content: String,
        modifiedAt: Long = System.currentTimeMillis(),
        size: Long = content.length.toLong(),
        isPinned: Boolean = false
    ): VaultNote {
        val lines = content.lines()
        val frontmatter = mutableMapOf<String, Any>()
        var bodyLines = lines
        var bodyLineOffset = 0

        // 1. Extract YAML frontmatter if present
        if (lines.isNotEmpty() && lines[0].trim() == "---") {
            val endIdx = lines.drop(1).indexOfFirst { it.trim() == "---" }
            if (endIdx != -1) {
                val yamlLines = lines.subList(1, endIdx + 1)
                for (yLine in yamlLines) {
                    val colonIdx = yLine.indexOf(':')
                    if (colonIdx != -1) {
                        val key = yLine.substring(0, colonIdx).trim()
                        val value = yLine.substring(colonIdx + 1).trim().removeSurrounding("\"").removeSurrounding("'")
                        frontmatter[key] = value
                    }
                }
                bodyLineOffset = endIdx + 2
                bodyLines = if (bodyLineOffset < lines.size) lines.subList(bodyLineOffset, lines.size) else emptyList()
            }
        }

        // Determine filename & default title
        val fileName = path.substringAfterLast('/').removeSuffix(".md").ifEmpty { "Not" }
        var title = (frontmatter["title"] as? String)?.takeIf { it.isNotBlank() } ?: fileName

        val headings = mutableListOf<HeadingItem>()
        val outgoingLinks = mutableListOf<WikilinkItem>()
        val tagsSet = mutableSetOf<String>()

        // Check frontmatter tags
        val fmTags = frontmatter["tags"]
        if (fmTags is String) {
            fmTags.split(',', ';', ' ').forEach { t ->
                val clean = t.trim().removePrefix("#").lowercase(Locale.getDefault())
                if (clean.isNotEmpty()) tagsSet.add(clean)
            }
        }

        var inCodeBlock = false

        for ((i, line) in bodyLines.withIndex()) {
            val actualLineNumber = bodyLineOffset + i + 1
            val trimmed = line.trim()

            if (trimmed.startsWith("```")) {
                inCodeBlock = !inCodeBlock
                continue
            }

            if (inCodeBlock) continue

            // 1. Headings (# H1 ... ###### H6)
            val headingMatch = headingRegex.find(line)
            if (headingMatch != null) {
                val level = headingMatch.groupValues[1].length
                val text = headingMatch.groupValues[2].trim()
                headings.add(
                    HeadingItem(
                        level = level,
                        text = text,
                        line = actualLineNumber
                    )
                )
                if (level == 1 && frontmatter["title"] == null && title == fileName) {
                    title = text
                }
            }

            // 2. Wikilinks [[Target]]
            wikilinkRegex.findAll(line).forEach { match ->
                val raw = match.value
                val targetTitle = match.groupValues[1].trim()
                val targetAnchor = match.groupValues.getOrNull(2)?.trim()?.ifEmpty { null }
                val alias = match.groupValues.getOrNull(3)?.trim()?.ifEmpty { null }

                if (targetTitle.isNotEmpty()) {
                    val snippet = if (line.length > 150) line.take(150) + "..." else line
                    outgoingLinks.add(
                        WikilinkItem(
                            raw = raw,
                            targetTitle = targetTitle,
                            targetAnchor = targetAnchor,
                            alias = alias,
                            line = actualLineNumber,
                            contextSnippet = snippet.trim()
                        )
                    )
                }
            }

            // 3. Inline Tags #tag
            tagRegex.findAll(line).forEach { match ->
                val rawTag = match.groupValues[1]
                val cleanTag = rawTag.removePrefix("#").trim().lowercase(Locale.getDefault())
                if (cleanTag.isNotEmpty() && !cleanTag.all { it.isDigit() }) {
                    tagsSet.add(cleanTag)
                }
            }
        }

        return VaultNote(
            path = path,
            name = path.substringAfterLast('/'),
            title = title,
            content = content,
            frontmatter = frontmatter,
            headings = headings,
            tags = tagsSet.toList().sorted(),
            outgoingLinks = outgoingLinks,
            backlinks = emptyList(),
            modifiedAt = modifiedAt,
            size = size,
            isPinned = isPinned
        )
    }

    fun buildVaultIndex(notes: List<VaultNote>): VaultIndex {
        val filesMap = notes.associateBy { it.path }
        val titleToPathMap = mutableMapOf<String, String>()
        val outgoingLinksMap = mutableMapOf<String, List<WikilinkItem>>()
        val backlinksMap = mutableMapOf<String, MutableList<BacklinkItem>>()
        val tagsMap = mutableMapOf<String, MutableSet<String>>()

        for (note in notes) {
            val normTitle = normalizeTitle(note.title)
            val normFileName = normalizeTitle(note.name)
            titleToPathMap[normTitle] = note.path
            titleToPathMap[normFileName] = note.path

            outgoingLinksMap[note.path] = note.outgoingLinks

            for (tag in note.tags) {
                tagsMap.getOrPut(tag) { mutableSetOf() }.add(note.path)
            }
        }

        // Build backlinks
        for (note in notes) {
            for (link in note.outgoingLinks) {
                val targetNorm = normalizeTitle(link.targetTitle)
                val targetPath = titleToPathMap[targetNorm]
                if (targetPath != null && targetPath != note.path) {
                    val backlink = BacklinkItem(
                        sourcePath = note.path,
                        sourceTitle = note.title,
                        line = link.line,
                        contextSnippet = link.contextSnippet,
                        alias = link.alias
                    )
                    backlinksMap.getOrPut(targetPath) { mutableListOf() }.add(backlink)
                }
            }
        }

        // Attach backlinks to notes
        val enrichedFiles = filesMap.mapValues { (path, note) ->
            note.copy(backlinks = backlinksMap[path] ?: emptyList())
        }

        return VaultIndex(
            files = enrichedFiles,
            titleToPath = titleToPathMap,
            outgoingLinks = outgoingLinksMap,
            backlinks = backlinksMap,
            tags = tagsMap
        )
    }
}
