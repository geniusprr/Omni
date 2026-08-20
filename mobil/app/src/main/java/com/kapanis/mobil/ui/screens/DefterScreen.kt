package com.kapanis.mobil.ui.screens

import android.widget.Toast
import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Send
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kapanis.mobil.data.ConnectionTarget
import com.kapanis.mobil.data.NoteItem
import com.kapanis.mobil.network.KapanisApiClient
import com.kapanis.mobil.ui.components.GlassCard
import com.kapanis.mobil.ui.theme.KapanisTheme
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun DefterScreen(
    target: ConnectionTarget,
    apiClient: KapanisApiClient,
    notes: List<NoteItem>,
    onNotesUpdated: (List<NoteItem>) -> Unit
) {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val scope = rememberCoroutineScope()
    val colors = KapanisTheme.colors

    var noteText by remember { mutableStateOf("") }
    var isSending by remember { mutableStateOf(false) }
    var isRefreshing by remember { mutableStateOf(false) }

    fun sendNoteToPc() {
        val trimmed = noteText.trim()
        if (trimmed.isEmpty() || isSending) return

        isSending = true
        scope.launch {
            val result = apiClient.sendNote(target.host, target.port, trimmed)
            isSending = false
            if (result.isSuccess) {
                val created = result.getOrNull()
                if (created != null) {
                    onNotesUpdated(listOf(created) + notes.filter { it.id != created.id })
                }
                noteText = ""
                Toast.makeText(context, "Not PC'ye aktarıldı ✓", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(
                    context,
                    result.exceptionOrNull()?.message ?: "Bağlantı hatası",
                    Toast.LENGTH_SHORT
                ).show()
            }
        }
    }

    fun refreshNotes() {
        if (isRefreshing) return
        isRefreshing = true
        scope.launch {
            val result = apiClient.fetchNotes(target.host, target.port)
            isRefreshing = false
            if (result.isSuccess) {
                val list = result.getOrDefault(emptyList())
                onNotesUpdated(list)
                Toast.makeText(context, "Defter senkronize edildi ✓", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(context, "Notlar alınamadı", Toast.LENGTH_SHORT).show()
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.paper)
            .padding(horizontal = 16.dp, vertical = 8.dp)
    ) {
        // Send Note Input Card
        GlassCard(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Rounded.Description,
                        contentDescription = null,
                        tint = colors.accent,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "PC Defterine Hızlı Not",
                        color = colors.textPrimary,
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp
                    )
                }

                IconButton(
                    onClick = { refreshNotes() },
                    modifier = Modifier.size(32.dp)
                ) {
                    if (isRefreshing) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            color = colors.accent,
                            strokeWidth = 2.dp
                        )
                    } else {
                        Icon(
                            imageVector = Icons.Rounded.Refresh,
                            contentDescription = "Yenile",
                            tint = colors.textMuted,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            OutlinedTextField(
                value = noteText,
                onValueChange = { noteText = it },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("PC'ye aktarmak istediğiniz notu yazın...", color = colors.textFaint, fontSize = 13.sp) },
                minLines = 3,
                maxLines = 6,
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

            Spacer(modifier = Modifier.height(10.dp))

            Button(
                onClick = { sendNoteToPc() },
                enabled = !isSending && noteText.isNotBlank(),
                modifier = Modifier.fillMaxWidth().height(44.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = colors.accent,
                    contentColor = colors.accentInk
                ),
                shape = RoundedCornerShape(10.dp)
            ) {
                if (isSending) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        color = colors.accentInk,
                        strokeWidth = 2.dp
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(text = "Gönderiliyor...", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                } else {
                    Icon(imageVector = Icons.Rounded.Send, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(text = "PC Defterine Kaydet", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        // Synced Notes List
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(notes, key = { it.id }) { note ->
                val dateStr = SimpleDateFormat("dd MMM, HH:mm", Locale.getDefault()).format(Date(note.updatedAt))

                GlassCard(
                    modifier = Modifier.fillMaxWidth(),
                    backgroundColor = colors.surfaceRaised
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.Top
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = note.content,
                                color = colors.textPrimary,
                                fontSize = 13.sp,
                                lineHeight = 18.sp
                            )
                            Spacer(modifier = Modifier.height(6.dp))
                            Text(
                                text = dateStr,
                                color = colors.textFaint,
                                fontSize = 11.sp
                            )
                        }

                        Row(verticalAlignment = Alignment.CenterVertically) {
                            IconButton(
                                onClick = {
                                    clipboard.setText(AnnotatedString(note.content))
                                    Toast.makeText(context, "Not kopyalandı ✓", Toast.LENGTH_SHORT).show()
                                },
                                modifier = Modifier.size(32.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.ContentCopy,
                                    contentDescription = "Kopyala",
                                    tint = colors.textMuted,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
