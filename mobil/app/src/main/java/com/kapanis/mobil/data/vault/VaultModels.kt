package com.kapanis.mobil.data.vault

data class HeadingItem(
    val level: Int, // 1 to 6
    val text: String,
    val line: Int
)

data class WikilinkItem(
    val raw: String,
    val targetTitle: String,
    val targetAnchor: String? = null,
    val alias: String? = null,
    val line: Int,
    val contextSnippet: String
)

data class BacklinkItem(
    val sourcePath: String,
    val sourceTitle: String,
    val line: Int,
    val contextSnippet: String,
    val alias: String? = null
)

data class VaultNote(
    val path: String, // e.g. "Projeler/kapanis.md" or "Hoşgeldiniz.md"
    val name: String, // e.g. "kapanis.md"
    val title: String,
    val content: String,
    val frontmatter: Map<String, Any> = emptyMap(),
    val headings: List<HeadingItem> = emptyList(),
    val tags: List<String> = emptyList(),
    val outgoingLinks: List<WikilinkItem> = emptyList(),
    val backlinks: List<BacklinkItem> = emptyList(),
    val modifiedAt: Long = System.currentTimeMillis(),
    val size: Long = 0L,
    val isPinned: Boolean = false
)

data class VaultFolder(
    val path: String, // e.g. "Projeler"
    val name: String, // e.g. "Projeler"
    val subfolders: List<VaultFolder> = emptyList(),
    val notes: List<VaultNote> = emptyList()
)

data class VaultIndex(
    val files: Map<String, VaultNote> = emptyMap(), // path -> note
    val titleToPath: Map<String, String> = emptyMap(), // normalized title -> path
    val outgoingLinks: Map<String, List<WikilinkItem>> = emptyMap(), // sourcePath -> links
    val backlinks: Map<String, List<BacklinkItem>> = emptyMap(), // targetPath -> backlinks
    val tags: Map<String, Set<String>> = emptyMap() // tag -> set of note paths
)

data class GraphNode(
    val id: String, // path
    val title: String,
    val degree: Int = 0,
    var x: Float = 0f,
    var y: Float = 0f,
    var vx: Float = 0f,
    var vy: Float = 0f
)

data class GraphEdge(
    val source: String, // path
    val target: String  // path
)

enum class ObsidianEditorMode {
    LIVE_PREVIEW, // Markdown with rendered elements & live interactive items
    READING,      // Formatted reading view
    SOURCE        // Pure raw Markdown text edit
}

enum class VaultMainTab {
    NOTES,
    GRAPH,
    TAGS
}

enum class DefterViewTab {
    EXPLORER,   // File tree & folders
    EDITOR,     // Note Editor & Preview
    GRAPH,      // Interactive Obsidian Force Graph
    TAGS,       // Tags Explorer
    BACKLINKS,  // Backlinks for active note
    OUTLINE     // Table of contents / headings
}

data class SearchMatch(
    val line: Int,
    val content: String,
    val startIndex: Int,
    val endIndex: Int
)

data class NoteSearchResult(
    val note: VaultNote,
    val matches: List<SearchMatch>
)
