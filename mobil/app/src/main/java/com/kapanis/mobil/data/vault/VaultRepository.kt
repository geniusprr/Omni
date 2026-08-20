package com.kapanis.mobil.data.vault

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.util.Locale

class VaultRepository(private val context: Context) {

    private val vaultDir: File by lazy {
        File(context.filesDir, "vault").apply {
            if (!exists()) {
                mkdirs()
                createStarterNotes(this)
            }
        }
    }

    private var cachedIndex: VaultIndex = VaultIndex()

    private fun createStarterNotes(root: File) {
        val welcomeFile = File(root, "Hoşgeldiniz.md")
        welcomeFile.writeText(
            """---
title: kapanış. Defter'e Hoş Geldiniz
tags: baslangic, rehber, mobil
created: 2026-08-20
---

# kapanış. Defter (Obsidian Notebook)

Bu defter, **Obsidian** mantığıyla çalışan, tamamen yerel dosya tabanlı bir kişisel bilgi ve not yönetim sistemidir.

## Öne Çıkan Özellikler

- **Çift Yönlü Bağlantılar**: [[Projeler]] ve [[Fikirler]] şeklinde notları birbirine bağlayın.
- **İnteraktif İlişki Grafiği**: Üst menüden **Grafik** sekmesine geçerek notlarınız arasındaki bağlantıları görselleştirin.
- **Geri Bağlantılar (Backlinks)**: Hangi notların bu nota referans verdiğini görün.
- **Canlı Önizleme & Okuma Modu**: Zengin Markdown ve interaktif görev kutuları.
- **PC Senkronizasyonu**: Bilgisayarınızla aynı Wi-Fi ağında olduğunuzda PC defterinizle anında eşitleyin.

### Görev Listesi
- [x] Mobil Defter'i keşfet
- [ ] İlk bağlantılı notunu oluştur (`[[Not Başlığı]]`)
- [ ] İlişki grafiğini aç ve keşfet

İyi çalışmalar!
""".trimIndent()
        )

        val projelerDir = File(root, "Projeler").apply { mkdirs() }
        val projeNote = File(projelerDir, "kapanış.md")
        projeNote.writeText(
            """---
title: kapanış. Projesi
tags: yazilim, kapanis, pc
---

# kapanış. Masaüstü & Mobil Ekosistemi

Sakin, hafif ve modern Windows kapatma, alarm ve defter yönetim uygulaması.

### Bağlantılı Notlar
- Ana rehber: [[Hoşgeldiniz]]
- Yeni fikirler: [[Fikirler]]

#proje #mobil #obsidian
""".trimIndent()
        )

        val fikirlerFile = File(root, "Fikirler.md")
        fikirlerFile.writeText(
            """---
title: Yaratıcı Düşünceler
tags: fikirler, inovasyon
---

# Gelecek Fikirleri ve İlhamlar

- [ ] [[kapanış]] için sesli komut sistemi ekle
- [ ] Markdown çizim (Mermaid) desteğini genişlet
- [ ] Offline yapay zeka özetleyicisi araştır

Bu not [[Hoşgeldiniz]] ve [[Projeler]] ile bağlantılıdır.
""".trimIndent()
        )
    }

    suspend fun loadVault(): VaultIndex = withContext(Dispatchers.IO) {
        val notes = mutableListOf<VaultNote>()
        collectNotesRecursive(vaultDir, vaultDir, notes)
        val index = MarkdownParser.buildVaultIndex(notes)
        cachedIndex = index
        index
    }

    fun getCachedIndex(): VaultIndex = cachedIndex

    private fun collectNotesRecursive(current: File, root: File, results: MutableList<VaultNote>) {
        val files = current.listFiles() ?: return
        for (f in files) {
            if (f.name.startsWith(".")) continue
            if (f.isDirectory) {
                collectNotesRecursive(f, root, results)
            } else if (f.isFile && f.name.lowercase(Locale.getDefault()).endsWith(".md")) {
                val relPath = f.relativeTo(root).path.replace('\\', '/')
                val content = try { f.readText() } catch (e: Exception) { "" }
                val note = MarkdownParser.parseMarkdownFile(
                    path = relPath,
                    content = content,
                    modifiedAt = f.lastModified(),
                    size = f.length()
                )
                results.add(note)
            }
        }
    }

    suspend fun readNote(relPath: String): VaultNote? = withContext(Dispatchers.IO) {
        val file = File(vaultDir, relPath)
        if (!file.exists() || !file.isFile) return@withContext null
        val content = file.readText()
        MarkdownParser.parseMarkdownFile(
            path = relPath.replace('\\', '/'),
            content = content,
            modifiedAt = file.lastModified(),
            size = file.length()
        )
    }

    suspend fun saveNote(relPath: String, content: String): VaultNote = withContext(Dispatchers.IO) {
        val cleanPath = relPath.trim().replace('\\', '/')
        val file = File(vaultDir, cleanPath)
        file.parentFile?.mkdirs()
        file.writeText(content)

        val note = MarkdownParser.parseMarkdownFile(
            path = cleanPath,
            content = content,
            modifiedAt = file.lastModified(),
            size = file.length()
        )
        loadVault()
        note
    }

    suspend fun createNote(relPath: String, initialContent: String = ""): VaultNote = withContext(Dispatchers.IO) {
        var cleanPath = relPath.trim().replace('\\', '/')
        if (!cleanPath.lowercase(Locale.getDefault()).endsWith(".md")) {
            cleanPath += ".md"
        }
        val file = File(vaultDir, cleanPath)
        file.parentFile?.mkdirs()
        if (!file.exists()) {
            val defaultContent = initialContent.ifEmpty {
                val title = cleanPath.substringAfterLast('/').removeSuffix(".md")
                "# $title\n\n"
            }
            file.writeText(defaultContent)
        }
        val note = MarkdownParser.parseMarkdownFile(
            path = cleanPath,
            content = file.readText(),
            modifiedAt = file.lastModified(),
            size = file.length()
        )
        loadVault()
        note
    }

    suspend fun createFolder(relPath: String): Boolean = withContext(Dispatchers.IO) {
        val cleanPath = relPath.trim().replace('\\', '/')
        val dir = File(vaultDir, cleanPath)
        val created = dir.mkdirs()
        loadVault()
        created
    }

    suspend fun deleteNote(relPath: String): Boolean = withContext(Dispatchers.IO) {
        val file = File(vaultDir, relPath.replace('\\', '/'))
        val deleted = file.delete()
        loadVault()
        deleted
    }

    suspend fun renameNote(oldPath: String, newPath: String): Boolean = withContext(Dispatchers.IO) {
        val oldFile = File(vaultDir, oldPath.replace('\\', '/'))
        var cleanNew = newPath.trim().replace('\\', '/')
        if (!cleanNew.lowercase(Locale.getDefault()).endsWith(".md")) {
            cleanNew += ".md"
        }
        val newFile = File(vaultDir, cleanNew)
        newFile.parentFile?.mkdirs()
        val renamed = oldFile.renameTo(newFile)
        loadVault()
        renamed
    }

    suspend fun searchVault(query: String): List<NoteSearchResult> = withContext(Dispatchers.Default) {
        val trimmed = query.trim().lowercase(Locale.getDefault())
        if (trimmed.isEmpty()) return@withContext emptyList()

        val results = mutableListOf<NoteSearchResult>()
        for (note in cachedIndex.files.values) {
            val titleMatches = note.title.lowercase(Locale.getDefault()).contains(trimmed)
            val pathMatches = note.path.lowercase(Locale.getDefault()).contains(trimmed)
            val tagMatches = note.tags.any { it.contains(trimmed) }

            val lineMatches = mutableListOf<SearchMatch>()
            for ((idx, line) in note.content.lines().withIndex()) {
                val lowerLine = line.lowercase(Locale.getDefault())
                val matchIdx = lowerLine.indexOf(trimmed)
                if (matchIdx != -1) {
                    lineMatches.add(
                        SearchMatch(
                            line = idx + 1,
                            content = line.take(160),
                            startIndex = matchIdx,
                            endIndex = matchIdx + trimmed.length
                        )
                    )
                }
            }

            if (titleMatches || pathMatches || tagMatches || lineMatches.isNotEmpty()) {
                results.add(NoteSearchResult(note = note, matches = lineMatches))
            }
        }
        results.sortedByDescending { it.matches.size + (if (it.note.title.lowercase(Locale.getDefault()).startsWith(trimmed)) 5 else 0) }
    }

    suspend fun toggleTaskCheckbox(notePath: String, lineNumber: Int, check: Boolean): VaultNote? = withContext(Dispatchers.IO) {
        val file = File(vaultDir, notePath)
        if (!file.exists()) return@withContext null

        val lines = file.readLines().toMutableList()
        if (lineNumber - 1 in lines.indices) {
            val line = lines[lineNumber - 1]
            val updatedLine = if (check) {
                line.replaceFirst("- [ ]", "- [x]")
            } else {
                line.replaceFirst("- [x]", "- [ ]")
            }
            lines[lineNumber - 1] = updatedLine
            val newContent = lines.joinToString("\n")
            file.writeText(newContent)
            return@withContext saveNote(notePath, newContent)
        }
        null
    }
}
