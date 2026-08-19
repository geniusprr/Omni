package com.kapanis.mobil.ui.screens

import android.widget.Toast
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Cloud
import androidx.compose.material.icons.rounded.Computer
import androidx.compose.material.icons.rounded.QrCodeScanner
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Wifi
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kapanis.mobil.data.ConnectionMode
import com.kapanis.mobil.data.ConnectionTarget
import com.kapanis.mobil.data.PreferencesManager
import com.kapanis.mobil.data.ServerStatus
import com.kapanis.mobil.network.KapanisApiClient
import com.kapanis.mobil.network.LanScanner
import com.kapanis.mobil.network.SupabaseRemoteClient
import com.kapanis.mobil.ui.components.GlassCard
import com.kapanis.mobil.ui.theme.AccentBlue
import com.kapanis.mobil.ui.theme.AccentInk
import com.kapanis.mobil.ui.theme.DarkPaper
import com.kapanis.mobil.ui.theme.DarkSurface
import com.kapanis.mobil.ui.theme.DarkSurfaceRaised
import com.kapanis.mobil.ui.theme.InkPrimary
import com.kapanis.mobil.ui.theme.RuleColor
import com.kapanis.mobil.ui.theme.SuccessGreen
import com.kapanis.mobil.ui.theme.TextFaint
import com.kapanis.mobil.ui.theme.TextMuted
import kotlinx.coroutines.launch

@Composable
fun ConnectScreen(
    target: ConnectionTarget,
    prefs: PreferencesManager,
    apiClient: KapanisApiClient,
    supabaseClient: SupabaseRemoteClient,
    onTargetChanged: (ConnectionTarget) -> Unit,
    onModeChanged: (ConnectionMode) -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val scanner = remember { LanScanner(apiClient) }

    var connectSubTab by remember { mutableIntStateOf(if (prefs.mode == ConnectionMode.ONLINE) 0 else 1) }

    // Online Tab States
    var inputPairingCode by remember { mutableStateOf(prefs.pairingCode) }
    var inputSupabaseUrl by remember { mutableStateOf(prefs.supabaseUrl) }
    var inputSupabaseKey by remember { mutableStateOf(prefs.supabaseAnonKey) }
    var isPairingOnline by remember { mutableStateOf(false) }
    var showAdvancedSupabase by remember { mutableStateOf(prefs.supabaseUrl.isEmpty()) }

    // Local Tab States
    var inputHost by remember { mutableStateOf(target.host) }
    var inputPort by remember { mutableStateOf(target.port.toString()) }
    var isTestingLocal by remember { mutableStateOf(false) }
    var isScanningLocal by remember { mutableStateOf(false) }
    var foundServers by remember { mutableStateOf<List<Pair<String, ServerStatus>>>(emptyList()) }

    fun pairOnline() {
        val code = inputPairingCode.trim().uppercase()
        val url = inputSupabaseUrl.trim()
        val key = inputSupabaseKey.trim()

        if (code.isEmpty()) {
            Toast.makeText(context, "Eşleştirme kodunu girin (Örn: KAP-7X9B)", Toast.LENGTH_SHORT).show()
            return
        }
        if (url.isEmpty() || key.isEmpty()) {
            Toast.makeText(context, "Supabase URL ve Anon Key girilmelidir", Toast.LENGTH_SHORT).show()
            showAdvancedSupabase = true
            return
        }

        isPairingOnline = true
        scope.launch {
            val result = supabaseClient.pairDeviceByCode(
                url = url,
                anonKey = key,
                pairingCode = code,
                controllerId = prefs.controllerId,
                controllerName = prefs.controllerName
            )
            isPairingOnline = false
            if (result.isSuccess) {
                val dev = result.getOrNull()
                prefs.supabaseUrl = url
                prefs.supabaseAnonKey = key
                prefs.pairingCode = code
                prefs.pairedDeviceId = dev?.id.orEmpty()
                prefs.deviceName = dev?.name ?: "Masaüstü PC"
                prefs.mode = ConnectionMode.ONLINE
                onModeChanged(ConnectionMode.ONLINE)

                Toast.makeText(context, "Eşleşti: ${dev?.name} (Bulut) ✓", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(
                    context,
                    result.exceptionOrNull()?.message ?: "Eşleştirme başarısız",
                    Toast.LENGTH_LONG
                ).show()
            }
        }
    }

    fun testLocal(hostToTest: String = inputHost, portToTest: Int = inputPort.toIntOrNull() ?: 53317) {
        val h = hostToTest.trim()
        if (h.isEmpty() || isTestingLocal) return

        isTestingLocal = true
        scope.launch {
            val result = apiClient.ping(h, portToTest)
            isTestingLocal = false
            if (result.isSuccess) {
                val status = result.getOrNull()
                val devName = status?.deviceName ?: "Windows PC"
                prefs.host = h
                prefs.port = portToTest
                prefs.deviceName = devName
                prefs.lastConnectedAt = System.currentTimeMillis()
                prefs.mode = ConnectionMode.LOCAL
                onModeChanged(ConnectionMode.LOCAL)

                onTargetChanged(
                    ConnectionTarget(
                        host = h,
                        port = portToTest,
                        deviceName = devName,
                        isConnected = true
                    )
                )
                Toast.makeText(context, "Bağlandı: $devName (Yerel Wi-Fi) ✓", Toast.LENGTH_SHORT).show()
            } else {
                onTargetChanged(target.copy(isConnected = false))
                Toast.makeText(context, "Yerel sunucuya ulaşılamadı (${result.exceptionOrNull()?.message})", Toast.LENGTH_SHORT).show()
            }
        }
    }

    fun startLanScan() {
        if (isScanningLocal) return
        isScanningLocal = true
        foundServers = emptyList()
        scope.launch {
            val found = scanner.scanSubnet(context, inputPort.toIntOrNull() ?: 53317)
            isScanningLocal = false
            foundServers = found
            if (found.isEmpty()) {
                Toast.makeText(context, "Ağda Kapanış çalıştıran PC bulunamadı. IP'yi manuel girin.", Toast.LENGTH_LONG).show()
            } else {
                Toast.makeText(context, "${found.size} cihaz bulundu!", Toast.LENGTH_SHORT).show()
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DarkPaper)
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .verticalScroll(rememberScrollState())
    ) {
        // Dual Mode Switcher
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(10.dp))
                .background(DarkSurface)
                .padding(3.dp)
        ) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (connectSubTab == 0) AccentBlue else DarkSurface)
                    .clickable { connectSubTab = 0 }
                    .padding(vertical = 10.dp),
                contentAlignment = Alignment.Center
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Cloud,
                        contentDescription = null,
                        tint = if (connectSubTab == 0) AccentInk else TextMuted,
                        modifier = Modifier.size(16.dp)
                    )
                    Text(
                        text = "Çevrim İçi (Bulut)",
                        color = if (connectSubTab == 0) AccentInk else TextMuted,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (connectSubTab == 1) AccentBlue else DarkSurface)
                    .clickable { connectSubTab = 1 }
                    .padding(vertical = 10.dp),
                contentAlignment = Alignment.Center
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Wifi,
                        contentDescription = null,
                        tint = if (connectSubTab == 1) AccentInk else TextMuted,
                        modifier = Modifier.size(16.dp)
                    )
                    Text(
                        text = "Yerel Ağ (Wi-Fi)",
                        color = if (connectSubTab == 1) AccentInk else TextMuted,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        if (connectSubTab == 0) {
            // ONLINE (SUPABASE) TAB
            GlassCard(
                modifier = Modifier.fillMaxWidth(),
                backgroundColor = DarkSurface
            ) {
                Text(
                    text = "Supabase ile Uzaktan Eşleşme",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = InkPrimary
                )
                Text(
                    text = "PC'nizin Ayarlar veya Defter sekmesinde görünen 6 haneli kodu girin.",
                    fontSize = 12.sp,
                    color = TextMuted,
                    modifier = Modifier.padding(top = 2.dp, bottom = 12.dp)
                )

                Text(
                    text = "EŞLEŞTİRME KODU",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = TextFaint,
                    fontFamily = FontFamily.Monospace,
                    modifier = Modifier.padding(bottom = 4.dp)
                )

                OutlinedTextField(
                    value = inputPairingCode,
                    onValueChange = { inputPairingCode = it.uppercase() },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("KAP-XXXX", color = TextFaint, fontSize = 16.sp, fontFamily = FontFamily.Monospace) },
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = DarkSurfaceRaised,
                        unfocusedContainerColor = DarkSurfaceRaised,
                        focusedBorderColor = AccentBlue,
                        unfocusedBorderColor = RuleColor,
                        focusedTextColor = InkPrimary,
                        unfocusedTextColor = InkPrimary
                    ),
                    shape = RoundedCornerShape(8.dp)
                )

                Spacer(modifier = Modifier.height(10.dp))

                // Advanced Accordion for Supabase Project config
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { showAdvancedSupabase = !showAdvancedSupabase }
                        .padding(vertical = 4.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = if (showAdvancedSupabase) "▲ Supabase Proje Bilgilerini Gizle" else "▼ Supabase Proje URL & Key Ayarla",
                        fontSize = 11.sp,
                        color = AccentBlue
                    )
                }

                if (showAdvancedSupabase) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 6.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedTextField(
                            value = inputSupabaseUrl,
                            onValueChange = { inputSupabaseUrl = it },
                            modifier = Modifier.fillMaxWidth(),
                            placeholder = { Text("https://xxx.supabase.co", color = TextFaint, fontSize = 12.sp) },
                            singleLine = true,
                            label = { Text("Supabase URL", fontSize = 10.sp, color = TextMuted) },
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedContainerColor = DarkSurfaceRaised,
                                unfocusedContainerColor = DarkSurfaceRaised,
                                focusedBorderColor = AccentBlue,
                                unfocusedBorderColor = RuleColor,
                                focusedTextColor = InkPrimary,
                                unfocusedTextColor = InkPrimary
                            ),
                            shape = RoundedCornerShape(8.dp)
                        )

                        OutlinedTextField(
                            value = inputSupabaseKey,
                            onValueChange = { inputSupabaseKey = it },
                            modifier = Modifier.fillMaxWidth(),
                            placeholder = { Text("eyJh...", color = TextFaint, fontSize = 12.sp) },
                            singleLine = true,
                            label = { Text("Supabase Anon Key", fontSize = 10.sp, color = TextMuted) },
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedContainerColor = DarkSurfaceRaised,
                                unfocusedContainerColor = DarkSurfaceRaised,
                                focusedBorderColor = AccentBlue,
                                unfocusedBorderColor = RuleColor,
                                focusedTextColor = InkPrimary,
                                unfocusedTextColor = InkPrimary
                            ),
                            shape = RoundedCornerShape(8.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                Button(
                    onClick = { pairOnline() },
                    enabled = !isPairingOnline && inputPairingCode.isNotBlank(),
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = AccentBlue,
                        contentColor = AccentInk
                    ),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    if (isPairingOnline) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), color = AccentInk, strokeWidth = 2.dp)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(text = "Eşleştiriliyor...", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    } else {
                        Text(text = "Eşleştir & Bulut Moduna Geç", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }

            if (prefs.pairedDeviceId.isNotEmpty()) {
                Spacer(modifier = Modifier.height(12.dp))
                GlassCard(
                    modifier = Modifier.fillMaxWidth(),
                    backgroundColor = DarkSurfaceRaised,
                    borderColor = SuccessGreen.copy(alpha = 0.3f)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(SuccessGreen)
                        )
                        Column {
                            Text(
                                text = "Kayıtlı Cihaz: ${prefs.deviceName}",
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                                color = InkPrimary
                            )
                            Text(
                                text = "Kod: ${prefs.pairingCode}",
                                fontSize = 11.sp,
                                color = TextMuted,
                                fontFamily = FontFamily.Monospace
                            )
                        }
                    }
                }
            }
        } else {
            // LOCAL (WI-FI) TAB
            GlassCard(
                modifier = Modifier.fillMaxWidth(),
                backgroundColor = DarkSurface
            ) {
                Text(
                    text = "Yerel Ağ (Wi-Fi) Bağlantısı",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = InkPrimary
                )
                Text(
                    text = "Aynı Wi-Fi ağında yüksek hızlı dosya, fotoğraf ve defter aktarımı.",
                    fontSize = 12.sp,
                    color = TextMuted,
                    modifier = Modifier.padding(top = 2.dp, bottom = 12.dp)
                )

                Button(
                    onClick = { startLanScan() },
                    enabled = !isScanningLocal,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = AccentBlue,
                        contentColor = AccentInk
                    ),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    if (isScanningLocal) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), color = AccentInk, strokeWidth = 2.dp)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(text = "Yerel Ağ Taranıyor...", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    } else {
                        Icon(imageVector = Icons.Rounded.Search, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(text = "Yerel Ağda PC Ara", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    }
                }

                if (foundServers.isNotEmpty()) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 10.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        foundServers.forEach { (host, status) ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(DarkSurfaceRaised)
                                    .clickable {
                                        inputHost = host
                                        inputPort = status.port.toString()
                                        testLocal(host, status.port)
                                    }
                                    .padding(10.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Icon(imageVector = Icons.Rounded.Computer, contentDescription = null, tint = AccentBlue, modifier = Modifier.size(18.dp))
                                    Column {
                                        Text(text = status.deviceName, color = InkPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                        Text(text = "$host:${status.port}", color = TextFaint, fontSize = 11.sp, fontFamily = FontFamily.Monospace)
                                    }
                                }

                                Text(text = "Bağlan →", color = AccentBlue, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                Text(
                    text = "MANUEL IP VE PORT",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = TextFaint,
                    fontFamily = FontFamily.Monospace,
                    modifier = Modifier.padding(bottom = 4.dp)
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedTextField(
                        value = inputHost,
                        onValueChange = { inputHost = it },
                        modifier = Modifier.weight(1.8f),
                        placeholder = { Text("192.168.1.xxx", color = TextFaint, fontSize = 13.sp) },
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = DarkSurfaceRaised,
                            unfocusedContainerColor = DarkSurfaceRaised,
                            focusedBorderColor = AccentBlue,
                            unfocusedBorderColor = RuleColor,
                            focusedTextColor = InkPrimary,
                            unfocusedTextColor = InkPrimary
                        ),
                        shape = RoundedCornerShape(8.dp)
                    )

                    OutlinedTextField(
                        value = inputPort,
                        onValueChange = { inputPort = it },
                        modifier = Modifier.weight(0.9f),
                        placeholder = { Text("53317", color = TextFaint, fontSize = 13.sp) },
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = DarkSurfaceRaised,
                            unfocusedContainerColor = DarkSurfaceRaised,
                            focusedBorderColor = AccentBlue,
                            unfocusedBorderColor = RuleColor,
                            focusedTextColor = InkPrimary,
                            unfocusedTextColor = InkPrimary
                        ),
                        shape = RoundedCornerShape(8.dp)
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))

                Button(
                    onClick = { testLocal() },
                    enabled = !isTestingLocal && inputHost.isNotBlank(),
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = DarkSurfaceRaised,
                        contentColor = InkPrimary
                    ),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(text = "Test Et & Yerel Moduna Geç", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))
    }
}
