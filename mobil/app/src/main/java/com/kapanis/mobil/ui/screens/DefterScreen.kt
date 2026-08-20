package com.kapanis.mobil.ui.screens

import android.widget.Toast
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Hub
import androidx.compose.material.icons.rounded.Tag
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kapanis.mobil.data.ConnectionTarget
import com.kapanis.mobil.data.vault.MarkdownParser
import com.kapanis.mobil.data.vault.VaultIndex
import com.kapanis.mobil.data.vault.VaultMainTab
import com.kapanis.mobil.data.vault.VaultNote
import com.kapanis.mobil.data.vault.VaultRepository
import com.kapanis.mobil.network.KapanisApiClient
import com.kapanis.mobil.ui.notes.BacklinksPanel
import com.kapanis.mobil.ui.notes.NoteEditorScreen
import com.kapanis.mobil.ui.notes.ObsidianGraphView
import com.kapanis.mobil.ui.notes.QuickSwitcherModal
import com.kapanis.mobil.ui.notes.TagsPanel
import com.kapanis.mobil.ui.theme.KapanisTheme
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun DefterScreen(
    target: ConnectionTarget,
    apiClient: KapanisApiClient,
    activeEditingNote: VaultNote?,
    onEditingNoteChanged: (VaultNote?) -> Unit,
    showQuickSwitcher: Boolean,
    onCloseQuickSwitcher: () -> Unit,
    showBacklinksModal: Boolean,
    onCloseBacklinksModal: () -> Unit,
    deleteRequestedPath: String?,
    onClearDeleteRequest: () -> Unit,
    onNotesCountChanged: (Int) -> Unit = {}
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val colors = KapanisTheme.colors

    val repository = remember { VaultRepository(context) }
    var vaultIndex by remember { mutableStateOf(VaultIndex()) }
    var currentViewTab by remember { mutableStateOf(VaultMainTab.NOTES) }

    var showNewNoteDialog by remember { mutableStateOf(false) }
    var newNoteTitle by remember { mutableStateOf("") }

    fun refreshVault() {
        scope.launch {
            val idx = repository.loadVault()
            vaultIndex = idx
            onNotesCountChanged(idx.files.size)
            if (activeEditingNote != null) {
                onEditingNoteChanged(idx.files[activeEditingNote.path])
            }
        }
    }

    LaunchedEffect(Unit) {
        refreshVault()
    }

    fun openNote(path: String) {
        scope.launch {
            val note = repository.readNote(path)
            if (note != null) {
                onEditingNoteChanged(note)
            }
        }
    }

    fun handleWikilink(targetTitle: String) {
        scope.launch {
            val normTarget = MarkdownParser.normalizeTitle(targetTitle)
            val resolvedPath = vaultIndex.titleToPath[normTarget]

            if (resolvedPath != null) {
                openNote(resolvedPath)
            } else {
                val newNote = repository.createNote("$targetTitle.md", "# $targetTitle\n\n")
                vaultIndex = repository.loadVault()
                onNotesCountChanged(vaultIndex.files.size)
                openNote(newNote.path)
            }
        }
    }

    // CASE 1: FULL-SCREEN TRUE WYSIWYG NOTE EDITOR
    if (activeEditingNote != null) {
        NoteEditorScreen(
            note = activeEditingNote,
            repository = repository,
            onBack = {
                onEditingNoteChanged(null)
                refreshVault()
            },
            onOpenWikilink = { wikilink -> handleWikilink(wikilink) },
            onTagClick = {
                onEditingNoteChanged(null)
                currentViewTab = VaultMainTab.TAGS
            }
        )

        // Backlinks Sheet
        if (showBacklinksModal) {
            androidx.compose.ui.window.Dialog(onDismissRequest = onCloseBacklinksModal) {
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = colors.paper,
                    border = androidx.compose.foundation.BorderStroke(1.dp, colors.border),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(380.dp)
                ) {
                    BacklinksPanel(
                        note = activeEditingNote,
                        onNavigateToSource = { path ->
                            onCloseBacklinksModal()
                            openNote(path)
                        }
                    )
                }
            }
        }
        return
    }

    // CASE 2: CLEAN VAULT HOME (Notes / Graph / Tags)
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.paper)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = 80.dp)
        ) {
            // Segmented Switcher Pills (Notlar / Grafik / Etiketler) - Seamless under TopBar
            Surface(
                color = colors.paper,
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    SegmentPill(
                        icon = Icons.Rounded.Description,
                        label = "Notlar",
                        badge = "${vaultIndex.files.size}",
                        isSelected = currentViewTab == VaultMainTab.NOTES,
                        onClick = { currentViewTab = VaultMainTab.NOTES }
                    )
                    SegmentPill(
                        icon = Icons.Rounded.Hub,
                        label = "Grafik",
                        isSelected = currentViewTab == VaultMainTab.GRAPH,
                        onClick = { currentViewTab = VaultMainTab.GRAPH }
                    )
                    SegmentPill(
                        icon = Icons.Rounded.Tag,
                        label = "Etiketler",
                        badge = if (vaultIndex.tags.isNotEmpty()) "${vaultIndex.tags.size}" else null,
                        isSelected = currentViewTab == VaultMainTab.TAGS,
                        onClick = { currentViewTab = VaultMainTab.TAGS }
                    )
                }
            }

            // Tab View Body
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
            ) {
                AnimatedContent(
                    targetState = currentViewTab,
                    transitionSpec = {
                        (fadeIn(animationSpec = tween(50))).togetherWith(
                            fadeOut(animationSpec = tween(40))
                        )
                    },
                    label = "VaultViewTransition"
                ) { tab ->
                    when (tab) {
                        VaultMainTab.NOTES -> {
                            val notesList = vaultIndex.files.values.toList()

                            if (notesList.isEmpty()) {
                                Box(
                                    modifier = Modifier.fillMaxSize(),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = "Henüz not yok. Sağ alttaki + butonuyla yeni not oluşturun.",
                                        fontSize = 13.sp,
                                        color = colors.textMuted
                                    )
                                }
                            } else {
                                LazyColumn(
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .padding(horizontal = 14.dp, vertical = 4.dp),
                                    verticalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    items(notesList, key = { it.path }) { note ->
                                        val dateStr = SimpleDateFormat("dd MMM, HH:mm", Locale.getDefault()).format(Date(note.modifiedAt))
                                        val snippet = note.content.lines()
                                            .filter { !it.trim().startsWith("#") && !it.trim().startsWith("---") && it.isNotBlank() }
                                            .take(2)
                                            .joinToString(" ")
                                            .take(110)

                                        Surface(
                                            shape = RoundedCornerShape(12.dp),
                                            color = colors.surfaceRaised,
                                            border = androidx.compose.foundation.BorderStroke(1.dp, colors.border),
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .clip(RoundedCornerShape(12.dp))
                                                .clickable { openNote(note.path) }
                                        ) {
                                            Row(
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .padding(14.dp),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.Top
                                            ) {
                                                Column(modifier = Modifier.weight(1f)) {
                                                    Text(
                                                        text = note.title,
                                                        fontSize = 14.sp,
                                                        fontWeight = FontWeight.Bold,
                                                        color = colors.textPrimary,
                                                        maxLines = 1,
                                                        overflow = TextOverflow.Ellipsis
                                                    )

                                                    if (snippet.isNotBlank()) {
                                                        Spacer(modifier = Modifier.height(4.dp))
                                                        Text(
                                                            text = snippet,
                                                            fontSize = 12.sp,
                                                            color = colors.textMuted,
                                                            maxLines = 2,
                                                            overflow = TextOverflow.Ellipsis,
                                                            lineHeight = 16.sp
                                                        )
                                                    }

                                                    Spacer(modifier = Modifier.height(6.dp))

                                                    Row(
                                                        verticalAlignment = Alignment.CenterVertically,
                                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                                    ) {
                                                        Text(
                                                            text = dateStr,
                                                            fontSize = 10.sp,
                                                            color = colors.textFaint
                                                        )

                                                        if (note.tags.isNotEmpty()) {
                                                            note.tags.take(2).forEach { tag ->
                                                                Text(
                                                                    text = "#$tag",
                                                                    fontSize = 10.sp,
                                                                    color = colors.accent,
                                                                    fontWeight = FontWeight.SemiBold
                                                                )
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        VaultMainTab.GRAPH -> {
                            ObsidianGraphView(
                                index = vaultIndex,
                                activeNotePath = null,
                                onNodeClick = { path -> openNote(path) }
                            )
                        }

                        VaultMainTab.TAGS -> {
                            TagsPanel(
                                index = vaultIndex,
                                onSelectNote = { path -> openNote(path) }
                            )
                        }
                    }
                }
            }
        }

        // Floating Action Button (+ Yeni Not)
        FloatingActionButton(
            onClick = { showNewNoteDialog = true },
            containerColor = colors.accent,
            contentColor = colors.accentInk,
            shape = CircleShape,
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = 20.dp, bottom = 90.dp)
                .size(52.dp)
        ) {
            Icon(
                imageVector = Icons.Rounded.Add,
                contentDescription = "Yeni Not",
                modifier = Modifier.size(24.dp)
            )
        }

        // Quick Switcher Modal
        if (showQuickSwitcher) {
            QuickSwitcherModal(
                repository = repository,
                index = vaultIndex,
                onSelectNote = { path ->
                    onCloseQuickSwitcher()
                    openNote(path)
                },
                onCreateNewNote = { title ->
                    scope.launch {
                        val newNote = repository.createNote("$title.md", "# $title\n\n")
                        vaultIndex = repository.loadVault()
                        onNotesCountChanged(vaultIndex.files.size)
                        onCloseQuickSwitcher()
                        openNote(newNote.path)
                    }
                },
                onDismiss = onCloseQuickSwitcher
            )
        }

        // New Note Dialog
        if (showNewNoteDialog) {
            AlertDialog(
                onDismissRequest = { showNewNoteDialog = false },
                title = { Text("Yeni Not Oluştur", color = colors.textPrimary, fontWeight = FontWeight.Bold, fontSize = 16.sp) },
                text = {
                    Column {
                        OutlinedTextField(
                            value = newNoteTitle,
                            onValueChange = { newNoteTitle = it },
                            placeholder = { Text("Not Başlığı (örn: Fikirler, Toplantı)", color = colors.textFaint) },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedContainerColor = colors.surfaceRaised,
                                unfocusedContainerColor = colors.surfaceRaised,
                                focusedBorderColor = colors.accent,
                                unfocusedBorderColor = colors.border,
                                focusedTextColor = colors.textPrimary,
                                unfocusedTextColor = colors.textPrimary
                            ),
                            shape = RoundedCornerShape(10.dp)
                        )
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            val trimmed = newNoteTitle.trim()
                            if (trimmed.isNotEmpty()) {
                                scope.launch {
                                    val newNote = repository.createNote("$trimmed.md", "# $trimmed\n\n")
                                    vaultIndex = repository.loadVault()
                                    onNotesCountChanged(vaultIndex.files.size)
                                    showNewNoteDialog = false
                                    newNoteTitle = ""
                                    openNote(newNote.path)
                                }
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = colors.accent, contentColor = colors.accentInk),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text("Oluştur", fontWeight = FontWeight.Bold)
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showNewNoteDialog = false }) {
                        Text("İptal", color = colors.textMuted)
                    }
                },
                containerColor = colors.paper
            )
        }

        // Delete Confirm Dialog
        if (deleteRequestedPath != null) {
            val pathToDelete = deleteRequestedPath
            AlertDialog(
                onDismissRequest = onClearDeleteRequest,
                title = { Text("Notu Sil", color = colors.danger, fontWeight = FontWeight.Bold) },
                text = { Text("\"$pathToDelete\" notu silinsin mi?", color = colors.textPrimary) },
                confirmButton = {
                    Button(
                        onClick = {
                            scope.launch {
                                repository.deleteNote(pathToDelete)
                                onClearDeleteRequest()
                                refreshVault()
                                Toast.makeText(context, "Not silindi ✓", Toast.LENGTH_SHORT).show()
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = colors.danger, contentColor = Color.White),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text("Sil")
                    }
                },
                dismissButton = {
                    TextButton(onClick = onClearDeleteRequest) {
                        Text("İptal", color = colors.textMuted)
                    }
                },
                containerColor = colors.paper
            )
        }
    }
}

@Composable
private fun SegmentPill(
    icon: ImageVector,
    label: String,
    badge: String? = null,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    val colors = KapanisTheme.colors
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = if (isSelected) colors.accent.copy(alpha = 0.16f) else colors.surfaceRaised,
        border = if (isSelected) androidx.compose.foundation.BorderStroke(1.dp, colors.accent.copy(alpha = 0.4f)) else androidx.compose.foundation.BorderStroke(1.dp, colors.border),
        modifier = Modifier.clickable { onClick() }
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = label,
                tint = if (isSelected) colors.accent else colors.textMuted,
                modifier = Modifier.size(15.dp)
            )
            Text(
                text = label,
                fontSize = 12.sp,
                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                color = if (isSelected) colors.accent else colors.textPrimary
            )
            if (badge != null) {
                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = if (isSelected) colors.accent else colors.accent.copy(alpha = 0.14f)
                ) {
                    Text(
                        text = badge,
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (isSelected) colors.accentInk else colors.accent,
                        modifier = Modifier.padding(horizontal = 5.dp, vertical = 1.dp)
                    )
                }
            }
        }
    }
}
