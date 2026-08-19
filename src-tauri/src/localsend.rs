use crate::{AppState, CreateAlarmInput, SoundProfile, TimerState, Alarm};
use serde::{Deserialize, Serialize};
use socket2::{Domain, Protocol, Socket, Type};
use std::{
    collections::HashMap,
    fs::{self, File},
    io::{Read, Write},
    net::{Ipv4Addr, SocketAddr, SocketAddrV4, UdpSocket},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_notification::NotificationExt;
use tiny_http::{Header, Response, Server, StatusCode};
use uuid::Uuid;

pub const LOCALSEND_MULTICAST_IP: &str = "224.0.0.167";
pub const LOCALSEND_DEFAULT_PORT: u16 = 53317;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalSendDevice {
    pub ip: String,
    pub port: u16,
    pub alias: String,
    #[serde(default = "default_version")]
    pub version: String,
    #[serde(default)]
    pub device_model: Option<String>,
    #[serde(default = "default_device_type")]
    pub device_type: String,
    pub fingerprint: String,
    #[serde(default = "default_protocol")]
    pub protocol: String,
    #[serde(default)]
    pub download: bool,
    #[serde(default)]
    pub announce: Option<bool>,
    #[serde(default)]
    pub last_seen: i64,
}

fn default_version() -> String {
    "2.0".to_string()
}
fn default_device_type() -> String {
    "desktop".to_string()
}
fn default_protocol() -> String {
    "http".to_string()
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDto {
    pub id: String,
    pub file_name: String,
    pub size: u64,
    #[serde(default)]
    pub file_type: Option<String>,
    #[serde(default)]
    pub sha256: Option<String>,
    #[serde(default)]
    pub preview: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareUploadRequest {
    pub info: LocalSendDevice,
    pub files: HashMap<String, FileDto>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareUploadResponse {
    pub session_id: String,
    pub files: HashMap<String, String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceivedFileRecord {
    pub id: String,
    pub file_name: String,
    pub size: u64,
    pub sender_alias: String,
    pub sender_ip: String,
    pub local_path: String,
    pub is_text: bool,
    pub text_preview: Option<String>,
    pub received_at: i64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalSendStatus {
    pub is_running: bool,
    pub local_ip: String,
    pub all_ips: Vec<String>,
    pub port: u16,
    pub alias: String,
    pub fingerprint: String,
    pub auto_accept: bool,
    pub download_dir: String,
    pub discovered_count: usize,
}

struct TransferSession {
    sender: LocalSendDevice,
    files: HashMap<String, FileDto>,
    tokens: HashMap<String, String>,
    #[allow(dead_code)]
    created_at: i64,
}

pub struct LocalSendState {
    pub alias: Mutex<String>,
    pub fingerprint: String,
    pub port: u16,
    pub auto_accept: AtomicBool,
    pub download_dir: PathBuf,
    pub devices: Mutex<HashMap<String, LocalSendDevice>>,
    pub received_files: Mutex<Vec<ReceivedFileRecord>>,
    sessions: Mutex<HashMap<String, TransferSession>>,
    app_handle: Mutex<Option<AppHandle>>,
}

/// Discovers valid local IPv4 LAN addresses (filters out loopback and 169.254.* link-local)
pub fn get_valid_local_ips() -> Vec<Ipv4Addr> {
    let mut ips = Vec::new();
    if let Ok(interfaces) = local_ip_address::list_afinet_netifas() {
        for (_name, ip) in interfaces {
            if let std::net::IpAddr::V4(ipv4) = ip {
                if !ipv4.is_loopback() && !ipv4.is_link_local() && !ipv4.is_unspecified() {
                    let octets = ipv4.octets();
                    // Exclude 169.254.X.X (APIPA)
                    if octets[0] == 169 && octets[1] == 254 {
                        continue;
                    }
                    if !ips.contains(&ipv4) {
                        ips.push(ipv4);
                    }
                }
            }
        }
    }
    if ips.is_empty() {
        if let Ok(std::net::IpAddr::V4(ipv4)) = local_ip_address::local_ip() {
            if !ipv4.is_loopback() && !ipv4.is_link_local() {
                ips.push(ipv4);
            }
        }
    }
    if ips.is_empty() {
        ips.push(Ipv4Addr::new(127, 0, 0, 1));
    }
    ips
}

pub fn get_primary_local_ip() -> String {
    let ips = get_valid_local_ips();
    ips.first()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|| "127.0.0.1".to_string())
}

impl LocalSendState {
    pub fn new(data_dir: &Path) -> Self {
        let hostname = std::env::var("COMPUTERNAME")
            .or_else(|_| std::env::var("HOSTNAME"))
            .unwrap_or_else(|_| "kapanış. PC".to_string());

        let fingerprint = Uuid::new_v4().to_string();
        let download_dir = get_download_dir();
        let _ = fs::create_dir_all(&download_dir);

        let files_history_path = data_dir.join("received-files.json");
        let received_files = fs::read_to_string(&files_history_path)
            .ok()
            .and_then(|c| serde_json::from_str::<Vec<ReceivedFileRecord>>(&c).ok())
            .unwrap_or_default();

        Self {
            alias: Mutex::new(hostname),
            fingerprint,
            port: LOCALSEND_DEFAULT_PORT,
            auto_accept: AtomicBool::new(true),
            download_dir,
            devices: Mutex::new(HashMap::new()),
            received_files: Mutex::new(received_files),
            sessions: Mutex::new(HashMap::new()),
            app_handle: Mutex::new(None),
        }
    }

    pub fn set_app_handle(&self, handle: AppHandle) {
        *self.app_handle.lock().unwrap() = Some(handle);
    }

    fn persist_received_files(&self, data_dir: &Path) {
        if let Ok(files) = self.received_files.lock() {
            let path = data_dir.join("received-files.json");
            let _ = fs::write(path, serde_json::to_string_pretty(&*files).unwrap_or_default());
        }
    }

    pub fn get_device_info(&self) -> LocalSendDevice {
        let alias = self.alias.lock().unwrap().clone();
        let ip = get_primary_local_ip();
        LocalSendDevice {
            ip,
            port: self.port,
            alias,
            version: "2.0".to_string(),
            device_model: Some("Windows".to_string()),
            device_type: "desktop".to_string(),
            fingerprint: self.fingerprint.clone(),
            protocol: "http".to_string(),
            download: false,
            announce: Some(true),
            last_seen: now_millis(),
        }
    }

    pub fn register_device(&self, mut dev: LocalSendDevice, sender_ip: &str) {
        if dev.fingerprint == self.fingerprint {
            return;
        }
        if dev.ip.is_empty() || dev.ip == "127.0.0.1" || dev.ip == "0.0.0.0" {
            dev.ip = sender_ip.to_string();
        }
        if dev.port == 0 {
            dev.port = LOCALSEND_DEFAULT_PORT;
        }
        if dev.alias.trim().is_empty() {
            dev.alias = if dev.device_type == "mobile" { "Android Telefon".to_string() } else { "Yerel Cihaz".to_string() };
        }
        dev.last_seen = now_millis();

        let key = format!("{}:{}", dev.ip, dev.port);
        let mut devices = self.devices.lock().unwrap();
        devices.insert(key, dev.clone());

        if let Some(app) = self.app_handle.lock().unwrap().as_ref() {
            let _ = app.emit("localsend:device-discovered", &dev);
        }
    }

    pub fn register_or_touch_sender(&self, sender_ip: &str, alias_hint: Option<&str>, model_hint: Option<&str>) {
        if sender_ip.is_empty() || sender_ip == "127.0.0.1" || sender_ip == "0.0.0.0" {
            return;
        }
        let key = format!("{}:{}", sender_ip, LOCALSEND_DEFAULT_PORT);
        let mut devices = self.devices.lock().unwrap();
        if let Some(dev) = devices.get_mut(&key) {
            dev.last_seen = now_millis();
            if let Some(alias) = alias_hint {
                if !alias.trim().is_empty() {
                    dev.alias = alias.to_string();
                }
            }
            if let Some(model) = model_hint {
                dev.device_model = Some(model.to_string());
            }
        } else {
            let dev = LocalSendDevice {
                ip: sender_ip.to_string(),
                port: LOCALSEND_DEFAULT_PORT,
                alias: alias_hint.unwrap_or("Android Telefon").to_string(),
                version: "2.0".to_string(),
                device_model: model_hint.map(|s| s.to_string()).or_else(|| Some("Android".to_string())),
                device_type: "mobile".to_string(),
                fingerprint: format!("mobile-{}", sender_ip.replace('.', "-")),
                protocol: "http".to_string(),
                download: false,
                announce: Some(false),
                last_seen: now_millis(),
            };
            devices.insert(key, dev.clone());
            if let Some(app) = self.app_handle.lock().unwrap().as_ref() {
                let _ = app.emit("localsend:device-discovered", &dev);
            }
        }
    }
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn get_download_dir() -> PathBuf {
    let base = std::env::var_os("USERPROFILE")
        .map(PathBuf::from)
        .map(|p| p.join("Downloads"))
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("kapanis_received")
}

fn sanitize_filename(name: &str) -> String {
    let clean = name.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
    if clean.trim().is_empty() {
        "received_file".to_string()
    } else {
        clean.trim().to_string()
    }
}

fn percent_decode_filename(input: &str) -> String {
    let mut result = Vec::new();
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(val) = u8::from_str_radix(std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or(""), 16) {
                result.push(val);
                i += 3;
                continue;
            }
        }
        result.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(result).unwrap_or_else(|_| input.to_string())
}

/// Sends UDP announcement to Multicast (224.0.0.167) AND Broadcast (255.255.255.255 & subnet.255)
pub fn broadcast_announcement(state: &LocalSendState) {
    let my_info = state.get_device_info();
    let json = match serde_json::to_string(&my_info) {
        Ok(j) => j,
        Err(_) => return,
    };
    let bytes = json.as_bytes();

    let multicast_target: SocketAddr =
        format!("{}:{}", LOCALSEND_MULTICAST_IP, LOCALSEND_DEFAULT_PORT)
            .parse()
            .unwrap();
    let broadcast_target: SocketAddr =
        format!("255.255.255.255:{}", LOCALSEND_DEFAULT_PORT)
            .parse()
            .unwrap();

    let valid_ips = get_valid_local_ips();
    for ip in &valid_ips {
        if let Ok(socket) = UdpSocket::bind(SocketAddrV4::new(*ip, 0)) {
            let _ = socket.set_broadcast(true);
            let _ = socket.set_multicast_loop_v4(true);
            let _ = socket.set_multicast_ttl_v4(2);

            let _ = socket.send_to(bytes, multicast_target);
            let _ = socket.send_to(bytes, broadcast_target);

            let octets = ip.octets();
            if let Ok(subnet_bcast) = format!("{}.{}.{}.255:{}", octets[0], octets[1], octets[2], LOCALSEND_DEFAULT_PORT).parse::<SocketAddr>() {
                let _ = socket.send_to(bytes, subnet_bcast);
            }
        }
    }

    // Also fallback broadcast from 0.0.0.0:0
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        let _ = socket.set_broadcast(true);
        let _ = socket.set_multicast_loop_v4(true);
        let _ = socket.send_to(bytes, multicast_target);
        let _ = socket.send_to(bytes, broadcast_target);
    }
}

/// Create ureq HTTP/HTTPS agent that accepts local self-signed TLS certificates (standard in LocalSend)
pub fn create_http_agent() -> ureq::Agent {
    let tls = native_tls::TlsConnector::builder()
        .danger_accept_invalid_certs(true)
        .danger_accept_invalid_hostnames(true)
        .build()
        .map(Arc::new);

    let mut builder = ureq::builder().timeout(Duration::from_secs(5));
    if let Ok(connector) = tls {
        builder = builder.tls_connector(connector);
    }
    builder.build()
}

/// Send direct HTTP/HTTPS register request to a target device so both sides know each other
pub fn send_http_register(target_ip: &str, target_port: u16, protocol_hint: Option<&str>, state: &LocalSendState) {
    let my_info = state.get_device_info();
    let json_body = match serde_json::to_string(&my_info) {
        Ok(j) => j,
        Err(_) => return,
    };

    let agent = create_http_agent();
    let protocols: &[&str] = match protocol_hint {
        Some("https") => &["https", "http"],
        Some("http") => &["http", "https"],
        _ => &["https", "http"],
    };

    for proto in protocols {
        let url = format!("{proto}://{target_ip}:{target_port}/api/localsend/v2/register");
        if let Ok(resp) = agent
            .post(&url)
            .timeout(Duration::from_millis(1500))
            .set("Content-Type", "application/json")
            .send_string(&json_body)
        {
            if resp.status() == 200 {
                if let Ok(mut dev) = serde_json::from_reader::<_, LocalSendDevice>(resp.into_reader()) {
                    dev.ip = target_ip.to_string();
                    dev.port = target_port;
                    dev.protocol = (*proto).to_string();
                    state.register_device(dev, target_ip);
                }
                break;
            }
        }
    }
}

/// Concurrently scans all IPs in the local subnet (e.g. 192.168.1.1 .. 254) on port 53317
pub fn scan_local_subnet(state: Arc<LocalSendState>) {
    let local_ips = get_valid_local_ips();

    for local_ip in local_ips {
        let octets = local_ip.octets();
        let prefix = format!("{}.{}.{}", octets[0], octets[1], octets[2]);

        let state_ref = state.clone();
        thread::spawn(move || {
            let chunk_size = 16;
            let mut handles = Vec::new();

            for chunk_start in (1..=254).step_by(chunk_size) {
                let prefix_clone = prefix.clone();
                let state_inner = state_ref.clone();
                let chunk_end = (chunk_start + chunk_size).min(255);

                let handle = thread::spawn(move || {
                    let agent = create_http_agent();
                    let my_info = state_inner.get_device_info();
                    let reg_body = serde_json::to_string(&my_info).unwrap_or_default();

                    for host in chunk_start..chunk_end {
                        let target_ip = format!("{prefix_clone}.{host}");

                        // 1. Try HTTPS POST register (default for modern LocalSend on mobile)
                        let https_url = format!("https://{target_ip}:{}/api/localsend/v2/register", state_inner.port);
                        if let Ok(resp) = agent
                            .post(&https_url)
                            .timeout(Duration::from_millis(450))
                            .set("Content-Type", "application/json")
                            .send_string(&reg_body)
                        {
                            if resp.status() == 200 {
                                if let Ok(mut dev) = serde_json::from_reader::<_, LocalSendDevice>(resp.into_reader()) {
                                    dev.ip = target_ip.clone();
                                    dev.port = state_inner.port;
                                    dev.protocol = "https".to_string();
                                    state_inner.register_device(dev, &target_ip);
                                    continue;
                                }
                            }
                        }

                        // 2. Try HTTP POST register
                        let http_url = format!("http://{target_ip}:{}/api/localsend/v2/register", state_inner.port);
                        if let Ok(resp) = agent
                            .post(&http_url)
                            .timeout(Duration::from_millis(450))
                            .set("Content-Type", "application/json")
                            .send_string(&reg_body)
                        {
                            if resp.status() == 200 {
                                if let Ok(mut dev) = serde_json::from_reader::<_, LocalSendDevice>(resp.into_reader()) {
                                    dev.ip = target_ip.clone();
                                    dev.port = state_inner.port;
                                    dev.protocol = "http".to_string();
                                    state_inner.register_device(dev, &target_ip);
                                }
                            }
                        }
                    }
                });
                handles.push(handle);
            }

            for h in handles {
                let _ = h.join();
            }
        });
    }
}

/// Start UDP Multicast listener & periodic broadcaster
pub fn start_udp_discovery(state: Arc<LocalSendState>) {
    thread::spawn(move || {
        let multicast_addr: Ipv4Addr = LOCALSEND_MULTICAST_IP.parse().unwrap();
        let bind_addr = SocketAddrV4::new(Ipv4Addr::UNSPECIFIED, LOCALSEND_DEFAULT_PORT);

        // Configure socket with SO_REUSEADDR
        let socket = match Socket::new(Domain::IPV4, Type::DGRAM, Some(Protocol::UDP)) {
            Ok(s) => {
                let _ = s.set_reuse_address(true);
                #[cfg(not(windows))]
                let _ = s.set_reuse_port(true);
                let _ = s.set_broadcast(true);
                let _ = s.set_multicast_loop_v4(true);
                if s.bind(&bind_addr.into()).is_ok() {
                    if let Ok(udp) = UdpSocket::from(s).try_clone() {
                        let _ = udp.join_multicast_v4(&multicast_addr, &Ipv4Addr::UNSPECIFIED);
                        for ip in get_valid_local_ips() {
                            let _ = udp.join_multicast_v4(&multicast_addr, &ip);
                        }
                        udp
                    } else {
                        return;
                    }
                } else {
                    return;
                }
            }
            Err(_) => return,
        };

        let read_socket = socket.try_clone().unwrap();
        let state_clone = state.clone();

        // Background loop: broadcast announcement every 8 seconds
        thread::spawn(move || {
            loop {
                broadcast_announcement(&state_clone);
                thread::sleep(Duration::from_secs(8));
            }
        });

        // Background initial subnet scan on startup
        let state_initial_scan = state.clone();
        thread::spawn(move || {
            thread::sleep(Duration::from_millis(1500));
            scan_local_subnet(state_initial_scan);
        });

        // UDP Listen Loop
        let mut buf = [0u8; 65535];
        loop {
            match read_socket.recv_from(&mut buf) {
                Ok((len, src)) => {
                    let sender_ip = src.ip().to_string();
                    if let Ok(text) = std::str::from_utf8(&buf[..len]) {
                        if let Ok(dev) = serde_json::from_str::<LocalSendDevice>(text) {
                            let should_reply = dev.announce.unwrap_or(true);
                            let target_port = if dev.port == 0 { LOCALSEND_DEFAULT_PORT } else { dev.port };
                            let proto = dev.protocol.clone();
                            state.register_device(dev, &sender_ip);

                            if should_reply {
                                // 1. Send UDP unicast reply back to sender
                                let mut reply_info = state.get_device_info();
                                reply_info.announce = Some(false);
                                if let Ok(reply_json) = serde_json::to_string(&reply_info) {
                                    let _ = read_socket.send_to(reply_json.as_bytes(), src);
                                }

                                // 2. Send HTTP/HTTPS register back
                                let state_reply = state.clone();
                                let ip_reply = sender_ip.clone();
                                thread::spawn(move || {
                                    send_http_register(&ip_reply, target_port, Some(&proto), &state_reply);
                                });
                            }
                        }
                    }
                }
                Err(_) => {
                    thread::sleep(Duration::from_millis(300));
                }
            }
        }
    });
}

/// Start HTTP REST API server on 53317 (tiny_http)
pub fn start_http_server(state: Arc<LocalSendState>, app_state: AppState, data_dir: PathBuf) {
    thread::spawn(move || {
        let addr = format!("0.0.0.0:{}", state.port);
        let server = match Server::http(&addr) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("LocalSend HTTP sunucusu başlatılamadı ({addr}): {e}");
                return;
            }
        };

        for mut request in server.incoming_requests() {
            let url = request.url().to_string();
            let method = request.method().to_string();
            let sender_ip = request
                .remote_addr()
                .map(|a| a.ip().to_string())
                .unwrap_or_else(|| "127.0.0.1".to_string());

            let cors_header = Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap();
            let json_header = Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap();

            // GET /api/status or /api/local/state (Mobile App Ping & Live State)
            if method == "GET" && (url.starts_with("/api/status") || url.starts_with("/api/local/state")) {
                state.register_or_touch_sender(&sender_ip, None, None);
                let hostname = state.alias.lock().unwrap().clone();
                let timer_state = app_state.get_timer_status().ok().flatten();
                let alarms = app_state.list_alarms().unwrap_or_default();

                #[derive(Serialize)]
                #[serde(rename_all = "camelCase")]
                struct StatusResp {
                    status: &'static str,
                    device_name: String,
                    version: &'static str,
                    port: u16,
                    timer_state: Option<TimerState>,
                    alarms: Vec<Alarm>,
                }

                let resp = StatusResp {
                    status: "ok",
                    device_name: hostname,
                    version: "2.0.0",
                    port: state.port,
                    timer_state,
                    alarms,
                };

                let json = serde_json::to_string(&resp).unwrap_or_default();
                let mut response = Response::from_string(json);
                response.add_header(cors_header);
                response.add_header(json_header);
                let _ = request.respond(response);
                continue;
            }

            // POST /api/register or /api/localsend/v2/register
            if method == "POST" && (url.starts_with("/api/register") || url.starts_with("/api/localsend/v2/register") || url.starts_with("/api/localsend/v1/register")) {
                let mut body = String::new();
                let _ = request.as_reader().read_to_string(&mut body);
                if let Ok(dev) = serde_json::from_str::<LocalSendDevice>(&body) {
                    state.register_device(dev, &sender_ip);
                } else {
                    state.register_or_touch_sender(&sender_ip, None, None);
                }

                let hostname = state.alias.lock().unwrap().clone();
                let timer_state = app_state.get_timer_status().ok().flatten();
                let alarms = app_state.list_alarms().unwrap_or_default();

                #[derive(Serialize)]
                #[serde(rename_all = "camelCase")]
                struct RegisterResp {
                    status: &'static str,
                    device_name: String,
                    version: &'static str,
                    port: u16,
                    timer_state: Option<TimerState>,
                    alarms: Vec<Alarm>,
                    device: LocalSendDevice,
                }

                let resp = RegisterResp {
                    status: "ok",
                    device_name: hostname,
                    version: "2.0.0",
                    port: state.port,
                    timer_state,
                    alarms,
                    device: state.get_device_info(),
                };

                let json = serde_json::to_string(&resp).unwrap_or_default();
                let mut response = Response::from_string(json);
                response.add_header(cors_header);
                response.add_header(json_header);
                let _ = request.respond(response);
                continue;
            }

            // POST /api/command (Power Commands: shutdown, restart, cancel)
            if method == "POST" && url.starts_with("/api/command") {
                state.register_or_touch_sender(&sender_ip, None, None);
                let mut body = String::new();
                let _ = request.as_reader().read_to_string(&mut body);

                #[derive(Deserialize)]
                struct CmdReq { command: String, delay_seconds: Option<u64> }

                let mut ok = false;
                if let Ok(cmd) = serde_json::from_str::<CmdReq>(&body) {
                    let delay = cmd.delay_seconds.unwrap_or(0);
                    if cmd.command == "cancel" {
                        let _ = app_state.cancel_shutdown();
                        if let Some(app) = state.app_handle.lock().unwrap().as_ref() {
                            let _ = app.emit("remote:command", serde_json::json!({ "command": "cancel", "delaySeconds": 0 }));
                        }
                        ok = true;
                    } else if cmd.command == "shutdown" || cmd.command == "restart" {
                        let _ = app_state.schedule_shutdown(&cmd.command, delay.max(1));
                        if let Some(app) = state.app_handle.lock().unwrap().as_ref() {
                            let _ = app.emit("remote:command", serde_json::json!({ "command": cmd.command, "delaySeconds": delay }));
                        }
                        ok = true;
                    }
                }

                let timer_state = app_state.get_timer_status().ok().flatten();
                #[derive(Serialize)]
                #[serde(rename_all = "camelCase")]
                struct CmdResp {
                    success: bool,
                    timer_state: Option<TimerState>,
                }
                let resp_json = serde_json::to_string(&CmdResp { success: ok, timer_state }).unwrap_or_default();
                let mut response = Response::from_string(resp_json);
                response.add_header(cors_header);
                response.add_header(json_header);
                let _ = request.respond(response);
                continue;
            }

            // POST /api/alarms/create or /api/alarm (Create Alarm on PC)
            if method == "POST" && (url.starts_with("/api/alarms/create") || url.starts_with("/api/alarm")) {
                state.register_or_touch_sender(&sender_ip, None, None);
                let mut body = String::new();
                let _ = request.as_reader().read_to_string(&mut body);

                #[derive(Deserialize)]
                #[serde(rename_all = "camelCase")]
                struct AlarmReq {
                    timestamp: i64,
                    note: Option<String>,
                    interval_seconds: Option<u64>,
                    occurrence_count: Option<u32>,
                    sound_enabled: Option<bool>,
                    sound_profile: Option<String>,
                }

                let mut created_alarm: Option<Alarm> = None;
                if let Ok(req) = serde_json::from_str::<AlarmReq>(&body) {
                    let profile = match req.sound_profile.as_deref() {
                        Some("gentle") => SoundProfile::Gentle,
                        Some("urgent") => SoundProfile::Urgent,
                        _ => SoundProfile::Chime,
                    };
                    let input = CreateAlarmInput {
                        timestamp: req.timestamp,
                        note: req.note.unwrap_or_default(),
                        interval_seconds: req.interval_seconds,
                        occurrence_count: req.occurrence_count,
                        sound_enabled: req.sound_enabled.unwrap_or(true),
                        sound_profile: profile,
                    };

                    if let Some(app) = state.app_handle.lock().unwrap().as_ref() {
                        if let Ok(alarm) = app_state.create_alarm(app.clone(), input) {
                            let _ = app.emit("alarm:created", &alarm);
                            created_alarm = Some(alarm);
                        }
                    }
                }

                #[derive(Serialize)]
                #[serde(rename_all = "camelCase")]
                struct AlarmResp {
                    success: bool,
                    alarm: Option<Alarm>,
                }
                let resp_json = serde_json::to_string(&AlarmResp {
                    success: created_alarm.is_some(),
                    alarm: created_alarm,
                }).unwrap_or_default();

                let mut response = Response::from_string(resp_json);
                response.add_header(cors_header);
                response.add_header(json_header);
                let _ = request.respond(response);
                continue;
            }

            // POST /api/alarms/cancel (Cancel Alarm on PC)
            if method == "POST" && url.starts_with("/api/alarms/cancel") {
                state.register_or_touch_sender(&sender_ip, None, None);
                let mut body = String::new();
                let _ = request.as_reader().read_to_string(&mut body);

                #[derive(Deserialize)]
                struct CancelReq { id: String }

                let mut ok = false;
                if let Ok(req) = serde_json::from_str::<CancelReq>(&body) {
                    if let Ok(removed) = app_state.cancel_alarm(&req.id) {
                        ok = removed;
                        if removed {
                            if let Some(app) = state.app_handle.lock().unwrap().as_ref() {
                                let _ = app.emit("alarm:cancelled", &req.id);
                            }
                        }
                    }
                }

                let mut response = Response::from_string(format!(r#"{{"success":{ok}}}"#));
                response.add_header(cors_header);
                response.add_header(json_header);
                let _ = request.respond(response);
                continue;
            }

            // GET /api/alarms (List Alarms on PC)
            if method == "GET" && url.starts_with("/api/alarms") {
                state.register_or_touch_sender(&sender_ip, None, None);
                let alarms = app_state.list_alarms().unwrap_or_default();
                let json = serde_json::to_string(&alarms).unwrap_or_else(|_| "[]".to_string());
                let mut response = Response::from_string(json);
                response.add_header(cors_header);
                response.add_header(json_header);
                let _ = request.respond(response);
                continue;
            }

            // POST /api/notify (Mobile Notification)
            if method == "POST" && url.starts_with("/api/notify") {
                state.register_or_touch_sender(&sender_ip, None, None);
                let mut body = String::new();
                let _ = request.as_reader().read_to_string(&mut body);

                #[derive(Deserialize)]
                #[allow(dead_code)]
                struct NotifyReq {
                    title: Option<String>,
                    message: String,
                    urgent: Option<bool>,
                }

                if let Ok(req) = serde_json::from_str::<NotifyReq>(&body) {
                    if let Some(app) = state.app_handle.lock().unwrap().as_ref() {
                        let title = req.title.as_deref().unwrap_or("kapanış. Mobil Bildirim");
                        let _ = app.notification().builder().title(title).body(&req.message).show();
                        let _ = app.emit("remote:notify", &body);
                    }
                }

                let mut response = Response::from_string(r#"{"success":true}"#);
                response.add_header(cors_header);
                response.add_header(json_header);
                let _ = request.respond(response);
                continue;
            }

            // POST /api/clipboard (Mobile Clipboard Sync)
            if method == "POST" && url.starts_with("/api/clipboard") {
                state.register_or_touch_sender(&sender_ip, None, None);
                let mut body = String::new();
                let _ = request.as_reader().read_to_string(&mut body);
                #[derive(Deserialize)]
                struct ClipReq { text: String }
                if let Ok(c) = serde_json::from_str::<ClipReq>(&body) {
                    let record = ReceivedFileRecord {
                        id: Uuid::new_v4().to_string(),
                        file_name: "pano.txt".to_string(),
                        size: c.text.len() as u64,
                        sender_alias: "Mobil Pano".to_string(),
                        sender_ip: sender_ip.clone(),
                        local_path: String::new(),
                        is_text: true,
                        text_preview: Some(c.text.clone()),
                        received_at: now_millis(),
                    };
                    {
                        let mut files = state.received_files.lock().unwrap();
                        files.insert(0, record.clone());
                    }
                    state.persist_received_files(&data_dir);
                    if let Some(app) = state.app_handle.lock().unwrap().as_ref() {
                        let _ = app.emit("localsend:file-received", &record);
                    }
                }
                let mut response = Response::from_string(r#"{"success":true}"#);
                response.add_header(cors_header);
                response.add_header(json_header);
                let _ = request.respond(response);
                continue;
            }

            // POST /api/upload (Mobile File Upload)
            if method == "POST" && url.starts_with("/api/upload") {
                state.register_or_touch_sender(&sender_ip, None, None);
                let raw_filename = request.headers().iter()
                    .find(|h| h.field.equiv("x-filename"))
                    .map(|h| h.value.as_str().to_string())
                    .unwrap_or_default();

                let filename = if !raw_filename.is_empty() {
                    percent_decode_filename(&raw_filename)
                } else {
                    format!("dosya_{}.dat", now_millis())
                };

                let safe_name = sanitize_filename(&filename);
                let dest_path = state.download_dir.join(&safe_name);

                let mut file_data = Vec::new();
                let _ = request.as_reader().read_to_end(&mut file_data);

                if let Ok(mut f) = File::create(&dest_path) {
                    let _ = f.write_all(&file_data);
                }

                let record = ReceivedFileRecord {
                    id: Uuid::new_v4().to_string(),
                    file_name: safe_name.clone(),
                    size: file_data.len() as u64,
                    sender_alias: "Mobil Transfer".to_string(),
                    sender_ip: sender_ip.clone(),
                    local_path: dest_path.to_string_lossy().to_string(),
                    is_text: false,
                    text_preview: None,
                    received_at: now_millis(),
                };

                {
                    let mut files = state.received_files.lock().unwrap();
                    files.insert(0, record.clone());
                }
                state.persist_received_files(&data_dir);

                if let Some(app) = state.app_handle.lock().unwrap().as_ref() {
                    let _ = app.emit("localsend:file-received", &record);
                }

                let resp_json = format!(r#"{{"id":"{}","filename":"{}","path":"{}","size":{}}}"#, record.id, record.file_name, record.local_path, record.size);
                let mut response = Response::from_string(resp_json);
                response.add_header(cors_header);
                response.add_header(json_header);
                let _ = request.respond(response);
                continue;
            }

            // GET /api/localsend/v2/info or /api/localsend/v1/info
            if method == "GET" && (url.starts_with("/api/localsend/v2/info") || url.starts_with("/api/localsend/v1/info")) {
                let info = state.get_device_info();
                let json = serde_json::to_string(&info).unwrap_or_default();
                let mut response = Response::from_string(json);
                response.add_header(cors_header);
                response.add_header(json_header);
                let _ = request.respond(response);
                continue;
            }

            // POST /api/localsend/v2/register or /api/localsend/v1/register
            if method == "POST" && (url.starts_with("/api/localsend/v2/register") || url.starts_with("/api/localsend/v1/register")) {
                let mut body = String::new();
                let _ = request.as_reader().read_to_string(&mut body);
                if let Ok(dev) = serde_json::from_str::<LocalSendDevice>(&body) {
                    state.register_device(dev, &sender_ip);
                }
                // Respond with our own device info so the sender adds us to its device list!
                let info = state.get_device_info();
                let json = serde_json::to_string(&info).unwrap_or_default();
                let mut response = Response::from_string(json);
                response.add_header(cors_header);
                response.add_header(json_header);
                let _ = request.respond(response);
                continue;
            }

            // POST /api/localsend/v2/prepare-upload
            if method == "POST" && url.starts_with("/api/localsend/v2/prepare-upload") {
                let mut body = String::new();
                let _ = request.as_reader().read_to_string(&mut body);
                if let Ok(prep) = serde_json::from_str::<PrepareUploadRequest>(&body) {
                    state.register_device(prep.info.clone(), &sender_ip);

                    let session_id = Uuid::new_v4().to_string();
                    let mut tokens = HashMap::new();
                    for (file_id, _) in &prep.files {
                        tokens.insert(file_id.clone(), Uuid::new_v4().to_string());
                    }

                    let resp_body = PrepareUploadResponse {
                        session_id: session_id.clone(),
                        files: tokens.clone(),
                    };

                    {
                        let mut sessions = state.sessions.lock().unwrap();
                        sessions.insert(
                            session_id,
                            TransferSession {
                                sender: prep.info,
                                files: prep.files,
                                tokens,
                                created_at: now_millis(),
                            },
                        );
                    }

                    let json = serde_json::to_string(&resp_body).unwrap_or_default();
                    let mut response = Response::from_string(json);
                    response.add_header(cors_header);
                    response.add_header(json_header);
                    let _ = request.respond(response);
                    continue;
                } else {
                    let mut response = Response::from_string(r#"{"error":"GeÃ§ersiz veri"}"#)
                        .with_status_code(StatusCode(400));
                    response.add_header(cors_header);
                    let _ = request.respond(response);
                    continue;
                }
            }

            // POST /api/localsend/v2/upload?sessionId=...&fileId=...&token=...
            if method == "POST" && url.starts_with("/api/localsend/v2/upload") {
                let params = parse_query_params(&url);
                let session_id = params.get("sessionId").cloned().unwrap_or_default();
                let file_id = params.get("fileId").cloned().unwrap_or_default();
                let token = params.get("token").cloned().unwrap_or_default();

                let session_info = {
                    let sessions = state.sessions.lock().unwrap();
                    sessions.get(&session_id).and_then(|s| {
                        if s.tokens.get(&file_id) == Some(&token) {
                            s.files.get(&file_id).map(|f| (s.sender.clone(), f.clone()))
                        } else {
                            None
                        }
                    })
                };

                if let Some((sender, file_dto)) = session_info {
                    let safe_name = sanitize_filename(&file_dto.file_name);
                    let mut dest_path = state.download_dir.join(&safe_name);

                    // If file exists, add a suffix
                    if dest_path.exists() {
                        let stem = dest_path
                            .file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or("file");
                        let ext = dest_path
                            .extension()
                            .and_then(|e| e.to_str())
                            .map(|e| format!(".{e}"))
                            .unwrap_or_default();
                        dest_path = state
                            .download_dir
                            .join(format!("{}_{}{}", stem, now_millis() % 10000, ext));
                    }

                    let mut file_data = Vec::new();
                    let _ = request.as_reader().read_to_end(&mut file_data);

                    if let Ok(mut f) = File::create(&dest_path) {
                        let _ = f.write_all(&file_data);
                    }

                    let is_text = file_dto.file_type.as_deref() == Some("text/plain")
                        || file_dto.file_name.ends_with(".txt")
                        || file_dto.preview.is_some();

                    let text_preview = if is_text && file_data.len() < 4096 {
                        String::from_utf8(file_data.clone()).ok()
                    } else {
                        file_dto.preview
                    };

                    let record = ReceivedFileRecord {
                        id: Uuid::new_v4().to_string(),
                        file_name: safe_name,
                        size: file_data.len() as u64,
                        sender_alias: sender.alias,
                        sender_ip,
                        local_path: dest_path.to_string_lossy().to_string(),
                        is_text,
                        text_preview,
                        received_at: now_millis(),
                    };

                    {
                        let mut files = state.received_files.lock().unwrap();
                        files.insert(0, record.clone());
                    }
                    state.persist_received_files(&data_dir);

                    if let Some(app) = state.app_handle.lock().unwrap().as_ref() {
                        let _ = app.emit("localsend:file-received", &record);
                    }

                    let mut response = Response::from_string("{}");
                    response.add_header(cors_header);
                    response.add_header(json_header);
                    let _ = request.respond(response);
                    continue;
                } else {
                    let mut response = Response::from_string(r#"{"error":"Oturum veya token geÃ§ersiz"}"#)
                        .with_status_code(StatusCode(403));
                    response.add_header(cors_header);
                    let _ = request.respond(response);
                    continue;
                }
            }

            // POST /api/localsend/v2/cancel
            if method == "POST" && url.starts_with("/api/localsend/v2/cancel") {
                let mut response = Response::from_string("{}");
                response.add_header(cors_header);
                response.add_header(json_header);
                let _ = request.respond(response);
                continue;
            }

            // Fallback for options (CORS)
            if method == "OPTIONS" {
                let mut response = Response::from_string("");
                response.add_header(cors_header);
                response.add_header(Header::from_bytes(&b"Access-Control-Allow-Methods"[..], &b"GET, POST, OPTIONS"[..]).unwrap());
                response.add_header(Header::from_bytes(&b"Access-Control-Allow-Headers"[..], &b"Content-Type"[..]).unwrap());
                let _ = request.respond(response);
                continue;
            }

            let mut response = Response::from_string(r#"{"error":"BulunamadÄ±"}"#).with_status_code(StatusCode(404));
            response.add_header(cors_header);
            let _ = request.respond(response);
        }
    });
}

fn parse_query_params(url: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    if let Some(query) = url.split('?').nth(1) {
        for pair in query.split('&') {
            let mut parts = pair.split('=');
            if let (Some(k), Some(v)) = (parts.next(), parts.next()) {
                map.insert(k.to_string(), v.to_string());
            }
        }
    }
    map
}

// ----------------------------------------------------------------------------
// Tauri Commands
// ----------------------------------------------------------------------------

#[tauri::command]
pub fn localsend_get_status(state: State<'_, Arc<LocalSendState>>) -> Result<LocalSendStatus, String> {
    let alias = state.alias.lock().unwrap().clone();
    let local_ip = get_primary_local_ip();
    let all_ips = get_valid_local_ips().into_iter().map(|i| i.to_string()).collect();
    let discovered_count = state.devices.lock().unwrap().len();

    Ok(LocalSendStatus {
        is_running: true,
        local_ip,
        all_ips,
        port: state.port,
        alias,
        fingerprint: state.fingerprint.clone(),
        auto_accept: state.auto_accept.load(Ordering::SeqCst),
        download_dir: state.download_dir.to_string_lossy().to_string(),
        discovered_count,
    })
}

#[tauri::command]
pub fn localsend_get_devices(state: State<'_, Arc<LocalSendState>>) -> Result<Vec<LocalSendDevice>, String> {
    let devices = state.devices.lock().unwrap();
    let now = now_millis();
    // Filter out devices not seen in the last 5 minutes (300 seconds)
    let mut list: Vec<LocalSendDevice> = devices
        .values()
        .filter(|d| now - d.last_seen < 300_000)
        .cloned()
        .collect();
    list.sort_by(|a, b| b.last_seen.cmp(&a.last_seen));
    Ok(list)
}

#[tauri::command]
pub fn localsend_scan_network(state: State<'_, Arc<LocalSendState>>) -> Result<(), String> {
    // 1. Send UDP broadcast and multicast announcements
    broadcast_announcement(&state);

    // 2. Perform concurrent HTTP subnet scan
    scan_local_subnet(state.inner().clone());

    Ok(())
}

#[tauri::command]
pub fn localsend_add_manual_device(
    target_ip: String,
    target_port: Option<u16>,
    state: State<'_, Arc<LocalSendState>>,
) -> Result<LocalSendDevice, String> {
    let raw = target_ip.trim()
        .trim_start_matches("http://")
        .trim_start_matches("https://")
        .trim();
    let (clean_ip, parsed_port) = if let Some((ip, p_str)) = raw.split_once(':') {
        (ip.trim().to_string(), p_str.trim().parse::<u16>().ok())
    } else {
        (raw.to_string(), None)
    };
    let port = target_port.or(parsed_port).unwrap_or(LOCALSEND_DEFAULT_PORT);

    let agent = create_http_agent();
    let my_info = state.get_device_info();
    let reg_body = serde_json::to_string(&my_info).unwrap_or_default();

    // 1. Try HTTPS POST register
    let https_url = format!("https://{clean_ip}:{port}/api/localsend/v2/register");
    if let Ok(resp) = agent
        .post(&https_url)
        .timeout(Duration::from_secs(3))
        .set("Content-Type", "application/json")
        .send_string(&reg_body)
    {
        if resp.status() == 200 {
            if let Ok(mut dev) = serde_json::from_reader::<_, LocalSendDevice>(resp.into_reader()) {
                dev.ip = clean_ip.clone();
                dev.port = port;
                dev.protocol = "https".to_string();
                state.register_device(dev.clone(), &clean_ip);
                return Ok(dev);
            }
        }
    }

    // 2. Try HTTP POST register
    let http_url = format!("http://{clean_ip}:{port}/api/localsend/v2/register");
    if let Ok(resp) = agent
        .post(&http_url)
        .timeout(Duration::from_secs(3))
        .set("Content-Type", "application/json")
        .send_string(&reg_body)
    {
        if resp.status() == 200 {
            if let Ok(mut dev) = serde_json::from_reader::<_, LocalSendDevice>(resp.into_reader()) {
                dev.ip = clean_ip.clone();
                dev.port = port;
                dev.protocol = "http".to_string();
                state.register_device(dev.clone(), &clean_ip);
                return Ok(dev);
            }
        }
    }

    // 3. Try GET info fallback
    for proto in &["https", "http"] {
        let info_url = format!("{proto}://{clean_ip}:{port}/api/localsend/v2/info");
        if let Ok(resp) = agent.get(&info_url).timeout(Duration::from_secs(2)).call() {
            if resp.status() == 200 {
                if let Ok(mut dev) = serde_json::from_reader::<_, LocalSendDevice>(resp.into_reader()) {
                    dev.ip = clean_ip.clone();
                    dev.port = port;
                    dev.protocol = (*proto).to_string();
                    state.register_device(dev.clone(), &clean_ip);
                    send_http_register(&clean_ip, port, Some(proto), &state);
                    return Ok(dev);
                }
            }
        }
    }

    Err(format!("Cihaza ulaşılamadı ({clean_ip}:{port}). Telefonunuzda uygulamanın açık olduğundan ve aynı Wi-Fi ağına bağlı olduğunuzdan emin olun."))
}

#[tauri::command]
pub fn localsend_get_received_files(state: State<'_, Arc<LocalSendState>>) -> Result<Vec<ReceivedFileRecord>, String> {
    let files = state.received_files.lock().unwrap();
    Ok(files.clone())
}

#[tauri::command]
pub fn localsend_open_download_folder(state: State<'_, Arc<LocalSendState>>) -> Result<(), String> {
    let path = state.download_dir.to_string_lossy().to_string();
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("explorer.exe")
            .arg(&path)
            .spawn();
    }
    Ok(())
}

#[tauri::command]
pub fn localsend_set_auto_accept(enabled: bool, state: State<'_, Arc<LocalSendState>>) -> Result<bool, String> {
    state.auto_accept.store(enabled, Ordering::SeqCst);
    Ok(enabled)
}

#[tauri::command]
pub fn localsend_send_text(
    target_ip: String,
    target_port: u16,
    text: String,
    state: State<'_, Arc<LocalSendState>>,
) -> Result<String, String> {
    if text.trim().is_empty() {
        return Err("Gönderilecek metin boş olamaz.".to_string());
    }

    let file_id = Uuid::new_v4().to_string();
    let file_bytes = text.into_bytes();
    let preview_text = if file_bytes.len() < 100 {
        String::from_utf8(file_bytes.clone()).ok()
    } else {
        None
    };

    let mut files = HashMap::new();
    files.insert(
        file_id.clone(),
        FileDto {
            id: file_id.clone(),
            file_name: "message.txt".to_string(),
            size: file_bytes.len() as u64,
            file_type: Some("text/plain".to_string()),
            sha256: None,
            preview: preview_text,
        },
    );

    let prep_req = PrepareUploadRequest {
        info: state.get_device_info(),
        files,
    };

    let proto = {
        let devices = state.devices.lock().unwrap();
        let key = format!("{target_ip}:{target_port}");
        devices.get(&key).map(|d| d.protocol.clone()).unwrap_or_else(|| "https".to_string())
    };

    let agent = create_http_agent();
    let prep_json = serde_json::to_string(&prep_req).map_err(|e| e.to_string())?;

    // Try target's protocol first, then alternative
    let protocols: &[&str] = if proto == "http" {
        &["http", "https"]
    } else {
        &["https", "http"]
    };

    let mut prep_resp: Option<(PrepareUploadResponse, String)> = None;
    for &p in protocols {
        let prep_url = format!("{p}://{target_ip}:{target_port}/api/localsend/v2/prepare-upload");
        if let Ok(resp) = agent
            .post(&prep_url)
            .set("Content-Type", "application/json")
            .timeout(Duration::from_secs(10))
            .send_string(&prep_json)
        {
            if let Ok(r) = serde_json::from_reader::<_, PrepareUploadResponse>(resp.into_reader()) {
                prep_resp = Some((r, p.to_string()));
                break;
            }
        }
    }

    let (prep_resp, active_proto) = prep_resp
        .ok_or_else(|| "Hedef cihaz isteği reddetti veya cihaza ulaşılamadı.".to_string())?;

    let token = prep_resp
        .files
        .get(&file_id)
        .ok_or_else(|| "Dosya oturumu doğrulanamadı.".to_string())?;

    let upload_url = format!(
        "{active_proto}://{target_ip}:{target_port}/api/localsend/v2/upload?sessionId={}&fileId={}&token={}",
        prep_resp.session_id, file_id, token
    );

    agent
        .post(&upload_url)
        .timeout(Duration::from_secs(30))
        .send_bytes(&file_bytes)
        .map_err(|e| format!("Metin gönderilemedi: {e}"))?;

    Ok("Metin başarıyla gönderildi!".to_string())
}

#[tauri::command]
pub fn localsend_send_file(
    target_ip: String,
    target_port: u16,
    file_path: String,
    state: State<'_, Arc<LocalSendState>>,
) -> Result<String, String> {
    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err("Dosya bulunamadı.".to_string());
    }

    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("dosya")
        .to_string();

    let mut file = File::open(&path).map_err(|e| format!("Dosya okunamadı: {e}"))?;
    let mut file_bytes = Vec::new();
    file.read_to_end(&mut file_bytes)
        .map_err(|e| format!("Dosya verisi okunamadı: {e}"))?;

    let file_id = Uuid::new_v4().to_string();
    let mut files = HashMap::new();
    files.insert(
        file_id.clone(),
        FileDto {
            id: file_id.clone(),
            file_name: file_name.clone(),
            size: file_bytes.len() as u64,
            file_type: None,
            sha256: None,
            preview: None,
        },
    );

    let prep_req = PrepareUploadRequest {
        info: state.get_device_info(),
        files,
    };

    let proto = {
        let devices = state.devices.lock().unwrap();
        let key = format!("{target_ip}:{target_port}");
        devices.get(&key).map(|d| d.protocol.clone()).unwrap_or_else(|| "https".to_string())
    };

    let agent = create_http_agent();
    let prep_json = serde_json::to_string(&prep_req).map_err(|e| e.to_string())?;

    let protocols: &[&str] = if proto == "http" {
        &["http", "https"]
    } else {
        &["https", "http"]
    };

    let mut prep_resp: Option<(PrepareUploadResponse, String)> = None;
    for &p in protocols {
        let prep_url = format!("{p}://{target_ip}:{target_port}/api/localsend/v2/prepare-upload");
        if let Ok(resp) = agent
            .post(&prep_url)
            .set("Content-Type", "application/json")
            .timeout(Duration::from_secs(15))
            .send_string(&prep_json)
        {
            if let Ok(r) = serde_json::from_reader::<_, PrepareUploadResponse>(resp.into_reader()) {
                prep_resp = Some((r, p.to_string()));
                break;
            }
        }
    }

    let (prep_resp, active_proto) = prep_resp
        .ok_or_else(|| "Hedef cihaz isteği kabul etmedi veya ulaşılamadı.".to_string())?;

    let token = prep_resp
        .files
        .get(&file_id)
        .ok_or_else(|| "Dosya aktarım izni alınamadı.".to_string())?;

    let upload_url = format!(
        "{active_proto}://{target_ip}:{target_port}/api/localsend/v2/upload?sessionId={}&fileId={}&token={}",
        prep_resp.session_id, file_id, token
    );

    agent
        .post(&upload_url)
        .timeout(Duration::from_secs(120))
        .send_bytes(&file_bytes)
        .map_err(|e| format!("Dosya gönderilemedi: {e}"))?;

    Ok(format!("'{file_name}' başarıyla gönderildi!"))
}
