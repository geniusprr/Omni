use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_notification::NotificationExt;
use uuid::Uuid;

mod browser;
mod localsend;
mod notes;

pub const MAX_TIMER_SECONDS: u64 = 315_360_000;
pub const MAX_INTERVAL_SECONDS: u64 = 31_536_000;
pub const MAX_ALARMS: usize = 64;
pub const ALARM_SLEEP_CHUNK_MS: i64 = 60_000;
const YOUTUBE_MUSIC_WEBVIEW_LABEL: &str = "youtube-music";

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TimerAction {
    Shutdown,
    Restart,
}

impl TimerAction {
    pub fn from_input(value: &str) -> Result<Self, String> {
        match value {
            "shutdown" => Ok(Self::Shutdown),
            "restart" => Ok(Self::Restart),
            _ => Err("Geçersiz Windows işlemi seçildi.".to_string()),
        }
    }

    pub fn command_flag(&self) -> &'static str {
        match self {
            Self::Shutdown => "/s",
            Self::Restart => "/r",
        }
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerState {
    pub action: TimerAction,
    pub target_at: i64,
    pub duration_seconds: u64,
}

#[derive(Clone, Copy, Default, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SoundProfile {
    Gentle,
    #[default]
    Chime,
    Urgent,
}

pub fn default_sound_enabled() -> bool {
    true
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Alarm {
    pub id: String,
    pub timestamp: i64,
    pub note: String,
    pub created_at: i64,
    #[serde(default)]
    pub interval_seconds: Option<u64>,
    #[serde(default)]
    pub remaining_occurrences: Option<u32>,
    #[serde(default = "default_sound_enabled")]
    pub sound_enabled: bool,
    #[serde(default)]
    pub sound_profile: SoundProfile,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAlarmInput {
    pub timestamp: i64,
    pub note: String,
    pub interval_seconds: Option<u64>,
    pub occurrence_count: Option<u32>,
    pub sound_enabled: bool,
    pub sound_profile: SoundProfile,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub hostname: String,
    pub os: String,
    pub platform: String,
}

#[derive(Clone)]
pub struct AppState {
    pub inner: Arc<AppStateInner>,
}

pub struct AppStateInner {
    pub data_dir: PathBuf,
    pub timer: Mutex<Option<TimerState>>,
    pub alarms: Mutex<Vec<Alarm>>,
    pub active_alarm: Mutex<Option<Alarm>>,
    pub sound_generation: AtomicU64,
}

impl AppState {
    pub fn load() -> Self {
        let data_dir = data_dir();
        let _ = fs::create_dir_all(&data_dir);
        let now = now_millis();

        let timer_path = data_dir.join("timer-state.json");
        let timer = read_json::<TimerState>(&timer_path).filter(|item| item.target_at > now);
        if timer.is_none() {
            let _ = fs::remove_file(&timer_path);
        }

        let alarm_path = data_dir.join("alarms.json");
        let mut alarms = read_json::<Vec<Alarm>>(&alarm_path)
            .unwrap_or_default()
            .into_iter()
            .filter_map(|alarm| normalize_alarm(alarm, now))
            .collect::<Vec<_>>();
        alarms.sort_by_key(|item| item.timestamp);
        let _ = write_json(&alarm_path, &alarms);
        let active_alarm = read_json::<Alarm>(&data_dir.join("active-alarm.json"));

        Self {
            inner: Arc::new(AppStateInner {
                data_dir,
                timer: Mutex::new(timer),
                alarms: Mutex::new(alarms),
                active_alarm: Mutex::new(active_alarm),
                sound_generation: AtomicU64::new(0),
            }),
        }
    }

    pub fn persist_timer(&self) -> Result<(), String> {
        let timer = self
            .inner
            .timer
            .lock()
            .map_err(|_| "Zamanlayıcı durumu kilitlenemedi.".to_string())?
            .clone();
        let path = self.inner.data_dir.join("timer-state.json");
        match timer {
            Some(value) => write_json(&path, &value),
            None => match fs::remove_file(path) {
                Ok(()) => Ok(()),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
                Err(error) => Err(format!("Zamanlayıcı dosyası temizlenemedi: {error}")),
            },
        }
    }

    pub fn persist_alarms(&self) -> Result<(), String> {
        let alarms = self
            .inner
            .alarms
            .lock()
            .map_err(|_| "Alarm listesi kilitlenemedi.".to_string())?
            .clone();
        write_json(&self.inner.data_dir.join("alarms.json"), &alarms)
    }

    pub fn timer_snapshot(&self) -> Option<TimerState> {
        self.inner.timer.lock().ok().and_then(|timer| timer.clone())
    }

    pub fn alarms_snapshot(&self) -> Vec<Alarm> {
        self.inner
            .alarms
            .lock()
            .map(|alarms| alarms.clone())
            .unwrap_or_default()
    }

    pub fn schedule_shutdown(&self, action: &str, seconds: u64) -> Result<TimerState, String> {
        if !(1..=MAX_TIMER_SECONDS).contains(&seconds) {
            return Err("Zamanlayıcı 1 saniye ile 10 yıl arasında olmalı.".to_string());
        }

        let action = TimerAction::from_input(action)?;
        if self.timer_snapshot().is_some() {
            let _ = run_windows_command(&["/a".to_string()]);
        }
        run_windows_command(&[
            action.command_flag().to_string(),
            "/t".to_string(),
            seconds.to_string(),
        ])?;

        let timer = TimerState {
            action,
            target_at: now_millis() + (seconds as i64 * 1_000),
            duration_seconds: seconds,
        };
        *self
            .inner
            .timer
            .lock()
            .map_err(|_| "Zamanlayıcı durumu kilitlenemedi.".to_string())? = Some(timer.clone());
        self.persist_timer()?;
        Ok(timer)
    }

    pub fn cancel_shutdown(&self) -> Result<(), String> {
        let had_timer = self.timer_snapshot().is_some();
        let command_result = run_windows_command(&["/a".to_string()]);
        *self
            .inner
            .timer
            .lock()
            .map_err(|_| "Zamanlayıcı durumu kilitlenemedi.".to_string())? = None;
        self.persist_timer()?;
        if had_timer {
            command_result
        } else {
            Ok(())
        }
    }

    pub fn get_timer_status(&self) -> Result<Option<TimerState>, String> {
        let mut timer = self
            .inner
            .timer
            .lock()
            .map_err(|_| "Zamanlayıcı durumu kilitlenemedi.".to_string())?;

        if timer
            .as_ref()
            .is_some_and(|item| item.target_at <= now_millis())
        {
            *timer = None;
            drop(timer);
            self.persist_timer()?;
            return Ok(None);
        }

        Ok(timer.clone())
    }

    pub fn list_alarms(&self) -> Result<Vec<Alarm>, String> {
        let mut alarms = self
            .inner
            .alarms
            .lock()
            .map_err(|_| "Alarm listesi kilitlenemedi.".to_string())?;
        alarms.sort_by_key(|item| item.timestamp);
        Ok(alarms.clone())
    }

    pub fn create_alarm(&self, app: AppHandle, input: CreateAlarmInput) -> Result<Alarm, String> {
        if input.timestamp <= now_millis() {
            return Err("Alarm zamanı geçmişte olamaz.".to_string());
        }

        if let Some(interval) = input.interval_seconds {
            if !(60..=MAX_INTERVAL_SECONDS).contains(&interval) {
                return Err("Alarm aralığı 1 dakika ile 1 yıl arasında olmalı.".to_string());
            }
            if input
                .occurrence_count
                .is_some_and(|count| !(2..=999).contains(&count))
            {
                return Err("Tekrarlama sayısı 2 ile 999 arasında olmalı.".to_string());
            }
        }

        let alarm = Alarm {
            id: Uuid::new_v4().to_string(),
            timestamp: input.timestamp,
            note: input.note.trim().chars().take(160).collect(),
            created_at: now_millis(),
            interval_seconds: input.interval_seconds,
            remaining_occurrences: if input.interval_seconds.is_some() {
                input.occurrence_count
            } else {
                Some(1)
            },
            sound_enabled: input.sound_enabled,
            sound_profile: input.sound_profile,
        };

        {
            let mut alarms = self
                .inner
                .alarms
                .lock()
                .map_err(|_| "Alarm listesi kilitlenemedi.".to_string())?;
            if alarms.len() >= MAX_ALARMS {
                return Err("En fazla 64 bekleyen alarm kurulabilir.".to_string());
            }
            alarms.push(alarm.clone());
            alarms.sort_by_key(|item| item.timestamp);
        }
        self.persist_alarms()?;
        schedule_alarm(app, self.inner.clone(), alarm.clone());
        Ok(alarm)
    }

    pub fn cancel_alarm(&self, id: &str) -> Result<bool, String> {
        let removed = {
            let mut alarms = self
                .inner
                .alarms
                .lock()
                .map_err(|_| "Alarm listesi kilitlenemedi.".to_string())?;
            alarms
                .iter()
                .position(|item| item.id == id)
                .map(|index| alarms.remove(index))
                .is_some()
        };
        if removed {
            self.persist_alarms()?;
        }
        Ok(removed)
    }
}

pub fn data_dir() -> PathBuf {
    std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
        .join("kapanis")
}

pub fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn normalize_alarm(mut alarm: Alarm, now: i64) -> Option<Alarm> {
    if alarm.timestamp > now {
        return Some(alarm);
    }

    let interval_ms = alarm.interval_seconds?.checked_mul(1_000)? as i64;
    if interval_ms <= 0 {
        return None;
    }
    let missed = ((now - alarm.timestamp) / interval_ms + 1) as u64;

    if let Some(remaining) = alarm.remaining_occurrences {
        if missed >= remaining as u64 {
            return None;
        }
        alarm.remaining_occurrences = Some(remaining - missed as u32);
    }

    alarm.timestamp = alarm
        .timestamp
        .checked_add(interval_ms.checked_mul(missed as i64)?)?;
    Some(alarm)
}

fn read_json<T: DeserializeOwned>(path: &Path) -> Option<T> {
    fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str::<T>(&content).ok())
}

fn write_json<T: Serialize + ?Sized>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Veri klasörü oluşturulamadı: {error}"))?;
    }
    let content = serde_json::to_string_pretty(value)
        .map_err(|error| format!("Veri hazırlanamadı: {error}"))?;
    fs::write(path, content).map_err(|error| format!("Veri kaydedilemedi: {error}"))
}

fn set_active_alarm(state: &AppStateInner, alarm: Option<Alarm>) -> Result<(), String> {
    *state
        .active_alarm
        .lock()
        .map_err(|_| "Etkin alarm durumu kilitlenemedi.".to_string())? = alarm.clone();

    let path = state.data_dir.join("active-alarm.json");
    match alarm {
        Some(value) => write_json(&path, &value),
        None => match fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(format!("Etkin alarm dosyası temizlenemedi: {error}")),
        },
    }
}

fn run_windows_command(args: &[String]) -> Result<(), String> {
    #[cfg(not(windows))]
    {
        let _ = args;
        Err("Windows sistem komutu yalnızca Windows üzerinde kullanılabilir.".to_string())
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;

        let output = Command::new("shutdown.exe")
            .args(args)
            .creation_flags(0x0800_0000)
            .output()
            .map_err(|error| format!("Windows kapatma aracı başlatılamadı: {error}"))?;

        if output.status.success() {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            Err(if !stderr.is_empty() {
                stderr
            } else if !stdout.is_empty() {
                stdout
            } else {
                "Windows komutu başarısız oldu.".to_string()
            })
        }
    }
}

fn restore_windows_timer(timer: &TimerState) {
    let remaining = ((timer.target_at - now_millis()).max(1) as u64).div_ceil(1_000);
    let _ = run_windows_command(&["/a".to_string()]);
    let _ = run_windows_command(&[
        timer.action.command_flag().to_string(),
        "/t".to_string(),
        remaining.to_string(),
    ]);
}

// ----------------- COMMANDS -----------------

#[tauri::command]
fn get_timer_status(state: State<'_, AppState>) -> Result<Option<TimerState>, String> {
    state.get_timer_status()
}

#[tauri::command]
fn schedule_shutdown(
    action: String,
    seconds: u64,
    state: State<'_, AppState>,
) -> Result<TimerState, String> {
    state.schedule_shutdown(&action, seconds)
}

#[tauri::command]
fn cancel_shutdown(state: State<'_, AppState>) -> Result<(), String> {
    state.cancel_shutdown()
}

#[tauri::command]
fn list_alarms(state: State<'_, AppState>) -> Result<Vec<Alarm>, String> {
    state.list_alarms()
}

#[tauri::command]
fn get_active_alarm(state: State<'_, AppState>) -> Result<Option<Alarm>, String> {
    state
        .inner
        .active_alarm
        .lock()
        .map(|alarm| alarm.clone())
        .map_err(|_| "Etkin alarm durumu kilitlenemedi.".to_string())
}

#[tauri::command]
fn create_alarm(
    input: CreateAlarmInput,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Alarm, String> {
    state.create_alarm(app, input)
}

#[tauri::command]
fn cancel_alarm(id: String, state: State<'_, AppState>) -> Result<bool, String> {
    state.cancel_alarm(&id)
}

#[tauri::command]
fn stop_alarm_sound(state: State<'_, AppState>) -> Result<(), String> {
    state.inner.sound_generation.fetch_add(1, Ordering::SeqCst);
    set_active_alarm(&state.inner, None)
}

#[tauri::command]
fn is_autostart_enabled(app: AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_autostart_enabled(app: AppHandle, enabled: bool) -> Result<bool, String> {
    let autolaunch = app.autolaunch();
    if enabled {
        autolaunch.enable().map_err(|e| e.to_string())?;
    } else {
        autolaunch.disable().map_err(|e| e.to_string())?;
    }
    autolaunch.is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_app_settings(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let path = state.inner.data_dir.join("settings.json");
    if path.exists() {
        fs::read_to_string(&path)
            .map(Some)
            .map_err(|e| e.to_string())
    } else {
        Ok(None)
    }
}

#[tauri::command]
fn save_app_settings(settings_json: String, state: State<'_, AppState>) -> Result<(), String> {
    let path = state.inner.data_dir.join("settings.json");
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(&path, settings_json).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_system_info() -> Result<SystemInfo, String> {
    let hostname = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "Windows PC".to_string());
    Ok(SystemInfo {
        hostname,
        os: "Windows".to_string(),
        platform: "win32".to_string(),
    })
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let url = url.trim();
    let is_http_url = url
        .get(..7)
        .is_some_and(|scheme| scheme.eq_ignore_ascii_case("http://"))
        || url
            .get(..8)
            .is_some_and(|scheme| scheme.eq_ignore_ascii_case("https://"));
    if !is_http_url
        || url
            .chars()
            .any(|character| character.is_whitespace() || character.is_control())
    {
        return Err("Yalnızca geçerli bir http veya https bağlantısı açılabilir.".to_string());
    }

    #[cfg(target_os = "windows")]
    let launcher = "explorer.exe";
    #[cfg(target_os = "macos")]
    let launcher = "open";
    #[cfg(all(unix, not(target_os = "macos")))]
    let launcher = "xdg-open";

    Command::new(launcher)
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Varsayılan tarayıcı açılamadı: {error}"))
}

#[tauri::command]
async fn browser_create_tab(
    app: AppHandle,
    manager: State<'_, browser::BrowserManager>,
    id: String,
    url: String,
    bounds: browser::Bounds,
) -> Result<browser::TabProjection, String> {
    // `add_child` creates a WebView2 controller.  Running that work in the synchronous
    // command handler can starve the UI message loop which WebView2 needs to complete
    // controller creation.  The Tauri handles are cloneable runtime dispatchers, so keep
    // this command asynchronous and run the blocking manager transaction off that loop.
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || manager.create(app, id, url, bounds))
        .await
        .map_err(|error| format!("Tarayıcı sekmesi görevi tamamlanamadı: {error}"))?
}

#[tauri::command]
fn browser_activate_tab(
    manager: State<'_, browser::BrowserManager>,
    id: String,
    visible: bool,
) -> Result<(), String> {
    manager.activate(&id, visible)
}

#[tauri::command]
fn browser_close_tab(
    app: AppHandle,
    manager: State<'_, browser::BrowserManager>,
    id: String,
) -> Result<bool, String> {
    manager.close(&app, &id)
}

#[tauri::command]
fn browser_navigate(
    app: AppHandle,
    manager: State<'_, browser::BrowserManager>,
    id: String,
    url: String,
) -> Result<(), String> {
    manager.navigate(&app, &id, url)
}

#[tauri::command]
fn browser_reload(manager: State<'_, browser::BrowserManager>, id: String) -> Result<(), String> {
    manager.reload(&id)
}

#[tauri::command]
fn browser_back(
    app: AppHandle,
    manager: State<'_, browser::BrowserManager>,
    id: String,
) -> Result<(), String> {
    manager.history(&app, &id, false)
}

#[tauri::command]
fn browser_forward(
    app: AppHandle,
    manager: State<'_, browser::BrowserManager>,
    id: String,
) -> Result<(), String> {
    manager.history(&app, &id, true)
}

#[tauri::command]
fn browser_set_visible(manager: State<'_, browser::BrowserManager>, visible: bool) {
    manager.set_visible(visible)
}

#[tauri::command]
fn browser_deactivate_tab(manager: State<'_, browser::BrowserManager>) -> Result<(), String> {
    manager.deactivate()
}

#[tauri::command]
fn browser_set_bounds(
    manager: State<'_, browser::BrowserManager>,
    id: String,
    bounds: browser::Bounds,
) -> Result<(), String> {
    manager.set_bounds(&id, bounds)
}

#[tauri::command]
fn browser_sync_metadata(
    app: AppHandle,
    manager: State<'_, browser::BrowserManager>,
) -> Result<(), String> {
    manager.sync_metadata(&app)
}

#[tauri::command]
fn browser_toggle_media(
    manager: State<'_, browser::BrowserManager>,
    id: String,
) -> Result<(), String> {
    manager.toggle_media(&id)
}

#[tauri::command]
fn browser_set_theme(
    manager: State<'_, browser::BrowserManager>,
    theme: String,
) -> Result<(), String> {
    manager.set_theme(&theme)
}

#[tauri::command]
fn browser_debug_snapshot(manager: State<'_, browser::BrowserManager>) -> browser::DebugSnapshot {
    manager.snapshot()
}

#[tauri::command]
fn launch_program(path: String) -> Result<(), String> {
    let input = PathBuf::from(path.trim());
    if !input.is_absolute() {
        return Err("Program yolu tam dosya yolu olmalı.".to_string());
    }
    let executable = input
        .canonicalize()
        .map_err(|_| "Program dosyası bulunamadı.".to_string())?;
    if !executable.is_file() {
        return Err("Seçilen yol bir program dosyası değil.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let extension = executable
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        if !matches!(extension.as_str(), "exe" | "com" | "lnk") {
            return Err(
                "Windows hızlı erişimi .exe, .com veya .lnk dosyalarını destekler.".to_string(),
            );
        }
        if extension == "lnk" {
            return Command::new("explorer.exe")
                .arg(&executable)
                .spawn()
                .map(|_| ())
                .map_err(|error| format!("Program kısayolu açılamadı: {error}"));
        }
    }

    #[cfg(target_os = "macos")]
    return Command::new("open")
        .arg(&executable)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Program açılamadı: {error}"));

    #[cfg(not(target_os = "macos"))]
    Command::new(&executable)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Program açılamadı: {error}"))
}

#[tauri::command]
fn youtube_music_control(app: AppHandle, action: String) -> Result<(), String> {
    let script = match action.as_str() {
        "toggle-play" => {
            r#"
          (() => {
            const player = document.querySelector('ytmusic-player-bar') || document;
            const button = player.querySelector('#play-pause-button')
              || player.querySelector('.play-pause-button')
              || player.querySelector('button[aria-label*="Oynat"]')
              || player.querySelector('button[aria-label*="Duraklat"]')
              || player.querySelector('button[aria-label*="Play"]')
              || player.querySelector('button[aria-label*="Pause"]');
            if (button && !button.disabled) button.click();
          })();
        "#
        }
        "next" => {
            r#"
          (() => {
            const player = document.querySelector('ytmusic-player-bar') || document;
            const button = player.querySelector('.next-button')
              || player.querySelector('button[aria-label*="Sonraki"]')
              || player.querySelector('button[aria-label*="Next"]');
            if (button && !button.disabled) button.click();
          })();
        "#
        }
        "previous" => {
            r#"
          (() => {
            const player = document.querySelector('ytmusic-player-bar') || document;
            const button = player.querySelector('.previous-button')
              || player.querySelector('button[aria-label*="Önceki"]')
              || player.querySelector('button[aria-label*="Previous"]');
            if (button && !button.disabled) button.click();
          })();
        "#
        }
        "toggle-mute" => {
            r#"
          (() => {
            const player = document.querySelector('ytmusic-player-bar') || document;
            const button = player.querySelector('.mute-button')
              || player.querySelector('#volume-button')
              || Array.from(player.querySelectorAll('button, tp-yt-paper-icon-button')).find((candidate) => {
                const label = candidate.getAttribute('aria-label')?.toLowerCase() || '';
                return label.includes('mute') || label.includes('unmute') || label.includes('ses');
              });
            if (button && !button.disabled) button.click();
          })();
        "#
        }
        _ => return Err("Geçersiz YouTube Music komutu.".to_string()),
    };

    let webview = app
        .get_webview(YOUTUBE_MUSIC_WEBVIEW_LABEL)
        .ok_or_else(|| "YouTube Music webview henüz hazır değil.".to_string())?;
    webview
        .eval(script)
        .map_err(|error| format!("YouTube Music komutu gönderilemedi: {error}"))
}

#[tauri::command]
fn youtube_music_sync_state(app: AppHandle) -> Result<(), String> {
    let webview = app
        .get_webview(YOUTUBE_MUSIC_WEBVIEW_LABEL)
        .ok_or_else(|| "YouTube Music webview henüz hazır değil.".to_string())?;
    let app_handle = app.clone();
    let script = r#"
      (() => {
        const surfaceStyleId = 'kapanis-youtube-music-surface-style';
        const surfaceCss = `
          html {
            background: transparent !important;
          }
          body {
            border-radius: 16px !important;
            overflow: hidden !important;
          }
          ::-webkit-scrollbar {
            width: 6px !important;
            height: 6px !important;
          }
          ::-webkit-scrollbar-track {
            background: transparent !important;
          }
          ::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.2) !important;
            border-radius: 9999px !important;
          }
          ::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.4) !important;
          }
        `;
        let surfaceStyle = document.getElementById(surfaceStyleId);
        if (!surfaceStyle) {
          surfaceStyle = document.createElement('style');
          surfaceStyle.id = surfaceStyleId;
          (document.head || document.documentElement).appendChild(surfaceStyle);
        }
        if (surfaceStyle.textContent !== surfaceCss) surfaceStyle.textContent = surfaceCss;

        const player = document.querySelector('ytmusic-player-bar');
        const media = player?.querySelector('audio, video') || document.querySelector('audio, video');
        const title = player?.querySelector('.title')?.textContent?.trim() || '';
        const artist = player?.querySelector('.byline')?.textContent?.trim() || '';
        const button = player?.querySelector('#play-pause-button') || player?.querySelector('.play-pause-button');
        const ariaLabel = button?.getAttribute('aria-label')?.toLowerCase() || '';
        const timeText = player?.querySelector('.time-info')?.textContent?.trim()
          || player?.querySelector('.time-info')?.getAttribute('aria-label')
          || '';
        const timeMatches = timeText.match(/\d+(?::\d{2}){1,2}/g) || [];
        const parseTime = (value) => {
          const parts = value.split(':').map(Number);
          return parts.reduce((total, part) => (total * 60) + part, 0);
        };
        const parsedCurrentTime = timeMatches[0] ? parseTime(timeMatches[0]) : null;
        const parsedDuration = timeMatches[1] ? parseTime(timeMatches[1]) : null;
        const mediaCurrentTime = Number(media?.currentTime);
        const mediaDuration = Number(media?.duration);
        const currentTime = Number.isFinite(mediaCurrentTime) ? mediaCurrentTime : parsedCurrentTime;
        const duration = Number.isFinite(mediaDuration) && mediaDuration > 0 ? mediaDuration : parsedDuration;
        const volumeControl = player?.querySelector('#volume-slider')
          || player?.querySelector('.volume-slider')
          || player?.querySelector('input[type="range"][aria-label*="Volume"]')
          || player?.querySelector('input[type="range"][aria-label*="Ses"]');
        let volume = Number(volumeControl?.value);
        if (!Number.isFinite(volume) && media) volume = Number(media.volume) * 100;
        if (Number.isFinite(volume) && volume >= 0 && volume <= 1) volume *= 100;
        const artworkSource = player?.querySelector('#song-image img, .image img, img')?.currentSrc
          || player?.querySelector('#song-image img, .image img, img')?.src
          || '';
        const artworkUrl = artworkSource.replace(/=w\d+-h\d+.*$/, '=w800-h800-l90-rj');
        const volumeButton = player?.querySelector('.mute-button')
          || player?.querySelector('#volume-button');
        const volumeLabel = volumeButton?.getAttribute('aria-label')?.toLowerCase() || '';
        let muted = media?.muted === true;
        if (volumeLabel.includes('unmute') || volumeLabel.includes('sesi aç')) muted = true;
        else if (volumeLabel.includes('mute') || volumeLabel.includes('sesi kapat')) muted = false;
        const labelSaysPlaying = ariaLabel.includes('duraklat') || ariaLabel.includes('pause');
        const labelSaysPaused = ariaLabel.includes('oynat') || ariaLabel.includes('play');
        const isPlaying = labelSaysPlaying
          ? true
          : labelSaysPaused
            ? false
            : media ? !media.paused && !media.ended : false;
        return JSON.stringify({
          title,
          artist,
          isPlaying,
          currentTime: Number.isFinite(currentTime) ? Math.max(0, currentTime) : 0,
          duration: Number.isFinite(duration) ? Math.max(0, duration) : 0,
          volume: Number.isFinite(volume) ? Math.min(100, Math.max(0, volume)) : null,
          muted,
          artworkUrl,
        });
      })();
    "#;
    webview
        .eval_with_callback(script, move |payload| {
            let _ = app_handle.emit("youtube-music-state", payload);
        })
        .map_err(|error| format!("YouTube Music durumu okunamadı: {error}"))
}

#[tauri::command]
fn youtube_music_set_volume(app: AppHandle, volume: f64) -> Result<(), String> {
    let normalized_volume = if volume.is_finite() {
        volume.clamp(0.0, 100.0)
    } else {
        0.0
    };
    let script = format!(
        r#"
          (() => {{
            const player = document.querySelector('ytmusic-player-bar') || document;
            const value = {:.2};
            const slider = player.querySelector('#volume-slider')
              || player.querySelector('.volume-slider')
              || player.querySelector('input[type="range"][aria-label*="Volume"]')
              || player.querySelector('input[type="range"][aria-label*="Ses"]');
            const media = player.querySelector('audio, video') || document.querySelector('audio, video');
            if (slider) {{
              slider.value = value;
              slider.dispatchEvent(new Event('input', {{ bubbles: true }}));
              slider.dispatchEvent(new Event('change', {{ bubbles: true }}));
            }}
            if (media) {{
              media.volume = value / 100;
              media.muted = value <= 0;
            }}
          }})();
        "#,
        normalized_volume
    );
    let webview = app
        .get_webview(YOUTUBE_MUSIC_WEBVIEW_LABEL)
        .ok_or_else(|| "YouTube Music webview henüz hazır değil.".to_string())?;
    webview
        .eval(&script)
        .map_err(|error| format!("YouTube Music ses seviyesi ayarlanamadı: {error}"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemMediaSession {
    source_app_id: String,
    title: String,
    artist: String,
    album_title: String,
    playback_status: String,
    position_seconds: f64,
    duration_seconds: f64,
    can_play: bool,
    can_pause: bool,
    can_skip_next: bool,
    can_skip_previous: bool,
}

#[cfg(target_os = "windows")]
fn current_windows_media_session(
) -> Result<Option<windows::Media::Control::GlobalSystemMediaTransportControlsSession>, String> {
    use std::sync::OnceLock;
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;

    static MANAGER: OnceLock<GlobalSystemMediaTransportControlsSessionManager> = OnceLock::new();
    if MANAGER.get().is_none() {
        let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
            .map_err(|error| format!("Windows medya yöneticisi başlatılamadı: {error}"))?
            .get()
            .map_err(|error| format!("Windows medya yöneticisine erişilemedi: {error}"))?;
        let _ = MANAGER.set(manager);
    }
    let manager = MANAGER
        .get()
        .ok_or_else(|| "Windows medya yöneticisi hazırlanamadı.".to_string())?;
    Ok(manager.GetCurrentSession().ok())
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn get_system_media_session() -> Result<Option<SystemMediaSession>, String> {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus;

    let Some(session) = current_windows_media_session()? else {
        return Ok(None);
    };
    let properties = session
        .TryGetMediaPropertiesAsync()
        .map_err(|error| format!("Medya bilgileri istenemedi: {error}"))?
        .get()
        .map_err(|error| format!("Medya bilgileri okunamadı: {error}"))?;
    let playback = session
        .GetPlaybackInfo()
        .map_err(|error| format!("Oynatma durumu okunamadı: {error}"))?;
    let timeline = session.GetTimelineProperties().ok();
    let controls = playback.Controls().ok();
    let status = playback.PlaybackStatus().ok();

    let playback_status = match status {
        Some(value)
            if value == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing =>
        {
            "playing"
        }
        Some(value) if value == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Paused => {
            "paused"
        }
        Some(value)
            if value == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Stopped =>
        {
            "stopped"
        }
        _ => "unknown",
    };
    let ticks_to_seconds = |ticks: i64| (ticks.max(0) as f64) / 10_000_000.0;

    Ok(Some(SystemMediaSession {
        source_app_id: session
            .SourceAppUserModelId()
            .map(|value| value.to_string())
            .unwrap_or_default(),
        title: properties
            .Title()
            .map(|value| value.to_string())
            .unwrap_or_default(),
        artist: properties
            .Artist()
            .map(|value| value.to_string())
            .unwrap_or_default(),
        album_title: properties
            .AlbumTitle()
            .map(|value| value.to_string())
            .unwrap_or_default(),
        playback_status: playback_status.to_string(),
        position_seconds: timeline
            .as_ref()
            .and_then(|value| value.Position().ok())
            .map(|value| ticks_to_seconds(value.Duration))
            .unwrap_or(0.0),
        duration_seconds: timeline
            .as_ref()
            .and_then(|value| value.EndTime().ok())
            .map(|value| ticks_to_seconds(value.Duration))
            .unwrap_or(0.0),
        can_play: controls
            .as_ref()
            .and_then(|value| value.IsPlayEnabled().ok())
            .unwrap_or(false),
        can_pause: controls
            .as_ref()
            .and_then(|value| value.IsPauseEnabled().ok())
            .unwrap_or(false),
        can_skip_next: controls
            .as_ref()
            .and_then(|value| value.IsNextEnabled().ok())
            .unwrap_or(false),
        can_skip_previous: controls
            .as_ref()
            .and_then(|value| value.IsPreviousEnabled().ok())
            .unwrap_or(false),
    }))
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn get_system_media_session() -> Result<Option<SystemMediaSession>, String> {
    Ok(None)
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn control_system_media(action: String) -> Result<bool, String> {
    let Some(session) = current_windows_media_session()? else {
        return Ok(false);
    };
    let operation = match action.as_str() {
        "toggle-play-pause" => session.TryTogglePlayPauseAsync(),
        "next" => session.TrySkipNextAsync(),
        "previous" => session.TrySkipPreviousAsync(),
        _ => return Err("Geçersiz sistem medya komutu.".to_string()),
    }
    .map_err(|error| format!("Medya komutu gönderilemedi: {error}"))?;
    operation
        .get()
        .map_err(|error| format!("Medya komutu tamamlanamadı: {error}"))
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn control_system_media(_action: String) -> Result<bool, String> {
    Ok(false)
}

// ----------------- SCHEDULER & RUN -----------------

fn schedule_alarm(app: AppHandle, state: Arc<AppStateInner>, initial_alarm: Alarm) {
    thread::spawn(move || {
        let mut scheduled = initial_alarm;

        loop {
            loop {
                let pending_timestamp = state.alarms.lock().ok().and_then(|alarms| {
                    alarms
                        .iter()
                        .find(|item| {
                            item.id == scheduled.id && item.timestamp == scheduled.timestamp
                        })
                        .map(|item| item.timestamp)
                });
                let Some(timestamp) = pending_timestamp else {
                    return;
                };
                let remaining = timestamp - now_millis();
                if remaining <= 0 {
                    break;
                }
                thread::sleep(Duration::from_millis(
                    remaining.min(ALARM_SLEEP_CHUNK_MS) as u64
                ));
            }

            let (triggered, next_alarm, persisted) = {
                let mut alarms = match state.alarms.lock() {
                    Ok(alarms) => alarms,
                    Err(_) => return,
                };
                let Some(index) = alarms.iter().position(|item| {
                    item.id == scheduled.id
                        && item.timestamp == scheduled.timestamp
                        && item.timestamp <= now_millis()
                }) else {
                    return;
                };

                let triggered = alarms[index].clone();
                let next_alarm = match (triggered.interval_seconds, triggered.remaining_occurrences)
                {
                    (Some(interval), Some(remaining)) if remaining > 1 => {
                        let mut next = triggered.clone();
                        next.timestamp = now_millis() + interval as i64 * 1_000;
                        next.remaining_occurrences = Some(remaining - 1);
                        alarms[index] = next.clone();
                        Some(next)
                    }
                    (Some(interval), None) => {
                        let mut next = triggered.clone();
                        next.timestamp = now_millis() + interval as i64 * 1_000;
                        alarms[index] = next.clone();
                        Some(next)
                    }
                    _ => {
                        alarms.remove(index);
                        None
                    }
                };
                alarms.sort_by_key(|item| item.timestamp);
                (triggered, next_alarm, alarms.clone())
            };

            let _ = write_json(&state.data_dir.join("alarms.json"), &persisted);
            let _ = set_active_alarm(&state, Some(triggered.clone()));
            let body = if triggered.note.is_empty() {
                "Alarm zamanı geldi."
            } else {
                &triggered.note
            };
            let _ = app
                .notification()
                .builder()
                .title("kapanış. alarmı")
                .body(body)
                .show();

            if triggered.sound_enabled {
                play_alarm_sound(state.clone(), triggered.sound_profile);
            }
            let _ = show_main_window(&app);
            let _ = app.emit("alarm:triggered", &triggered);

            let Some(next) = next_alarm else {
                return;
            };
            scheduled = next;
        }
    });
}

fn play_alarm_sound(state: Arc<AppStateInner>, profile: SoundProfile) {
    let generation = state.sound_generation.fetch_add(1, Ordering::SeqCst) + 1;
    let (count, cadence_ms) = match profile {
        SoundProfile::Gentle => (3, 900),
        SoundProfile::Chime => (6, 650),
        SoundProfile::Urgent => (10, 420),
    };

    thread::spawn(move || {
        for index in 0..count {
            if state.sound_generation.load(Ordering::SeqCst) != generation {
                return;
            }
            system_beep(profile);
            if index + 1 < count {
                thread::sleep(Duration::from_millis(cadence_ms));
            }
        }
    });
}

#[cfg(windows)]
#[link(name = "user32")]
extern "system" {
    fn MessageBeep(message_type: u32) -> i32;
}

fn system_beep(profile: SoundProfile) {
    #[cfg(windows)]
    unsafe {
        let message_type = match profile {
            SoundProfile::Gentle => 0x0000_0040,
            SoundProfile::Chime => 0x0000_0030,
            SoundProfile::Urgent => 0x0000_0010,
        };
        let _ = MessageBeep(message_type);
    }
}

fn show_main_window(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Ana pencere henüz oluşturulmadı.".to_string())?;
    window
        .unminimize()
        .map_err(|error| format!("Ana pencere küçültülmüş durumdan çıkarılamadı: {error}"))?;
    window
        .show()
        .map_err(|error| format!("Ana pencere gösterilemedi: {error}"))?;
    window
        .set_focus()
        .map_err(|error| format!("Ana pencereye odaklanılamadı: {error}"))?;
    Ok(())
}

fn configure_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Aç", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Çık", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &separator, &quit])?;

    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("kapanış.")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => {
                let _ = show_main_window(app);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

fn configure_close_to_tray(app: &mut tauri::App) {
    if let Some(window) = app.get_webview_window("main") {
        let window_to_hide = window.clone();
        let app_handle = app.handle().clone();
        window.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                if let Some(manager) = app_handle.try_state::<browser::BrowserManager>() {
                    manager.set_visible(false);
                }
                let _ = window_to_hide.hide();
            }
        });
    }
}

fn configure_splash(app: &mut tauri::App, start_hidden: bool) {
    let handle = app.handle().clone();
    if start_hidden {
        if let Some(splash) = handle.get_webview_window("splash") {
            let _ = splash.close();
        }
        return;
    }

    // The main window is configured hidden so background autostart does not flash it.
    // For a normal launch, show it immediately; the splash only covers the first
    // moment while the frontend finishes loading.
    if let Err(error) = show_main_window(&handle) {
        eprintln!("[startup] Ana pencere hemen gösterilemedi: {error}");
    }

    thread::spawn(move || {
        thread::sleep(Duration::from_millis(900));
        if let Some(splash) = handle.get_webview_window("splash") {
            let _ = splash.close();
        }
        for _ in 0..12 {
            match show_main_window(&handle) {
                Ok(()) => break,
                Err(error) => {
                    eprintln!("[startup] Ana pencere bekleniyor: {error}");
                    thread::sleep(Duration::from_millis(150));
                }
            }
        }
    });
}

fn configure_window_effects(app: &mut tauri::App) {
    #[cfg(windows)]
    for label in ["main", "splash"] {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window_vibrancy::apply_acrylic(&window, Some((16, 20, 28, 125)));
        }
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if !args.iter().any(|argument| argument == "--background") {
                let _ = show_main_window(app);
            }
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--background"]),
        ))
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let state = AppState::load();
            app.manage(browser::BrowserManager::new(
                state.inner.data_dir.join("browser-profile"),
            ));
            let settings_path = state.inner.data_dir.join("settings.json");
            let autostart_enabled = if settings_path.exists() {
                fs::read_to_string(&settings_path)
                    .ok()
                    .and_then(|content| serde_json::from_str::<serde_json::Value>(&content).ok())
                    .and_then(|json| json.get("autostart").and_then(|v| v.as_bool()))
                    .unwrap_or(true)
            } else {
                true
            };

            let autolaunch = app.autolaunch();
            let _ = autolaunch.disable();
            if autostart_enabled {
                if let Err(error) = autolaunch.enable() {
                    eprintln!("Windows otomatik başlatma etkinleştirilemedi: {error}");
                }
            }

            if let Some(timer) = state.timer_snapshot() {
                restore_windows_timer(&timer);
            }
            let alarms = state.alarms_snapshot();
            app.manage(state.clone());
            for alarm in alarms {
                schedule_alarm(app.handle().clone(), state.inner.clone(), alarm);
            }

            let localsend_state = Arc::new(localsend::LocalSendState::new(&state.inner.data_dir));
            localsend_state.set_app_handle(app.handle().clone());
            localsend::start_udp_discovery(localsend_state.clone());
            localsend::start_http_server(
                localsend_state.clone(),
                state.clone(),
                state.inner.data_dir.clone(),
            );
            app.manage(localsend_state);
            app.manage(notes::VaultWatcher::new());

            configure_window_effects(app);
            configure_tray(app)?;
            configure_close_to_tray(app);
            let start_hidden = std::env::args().any(|argument| argument == "--background");
            configure_splash(app, start_hidden);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_timer_status,
            schedule_shutdown,
            cancel_shutdown,
            list_alarms,
            get_active_alarm,
            create_alarm,
            cancel_alarm,
            stop_alarm_sound,
            is_autostart_enabled,
            set_autostart_enabled,
            get_app_settings,
            save_app_settings,
            get_system_info,
            open_external_url,
            browser_navigate,
            browser_reload,
            browser_create_tab,
            browser_activate_tab,
            browser_close_tab,
            browser_back,
            browser_forward,
            browser_set_visible,
            browser_deactivate_tab,
            browser_set_bounds,
            browser_sync_metadata,
            browser_toggle_media,
            browser_set_theme,
            browser_debug_snapshot,
            launch_program,
            get_system_media_session,
            control_system_media,
            youtube_music_control,
            youtube_music_set_volume,
            youtube_music_sync_state,
            localsend::localsend_get_status,
            localsend::localsend_get_devices,
            localsend::localsend_scan_network,
            localsend::localsend_send_file,
            localsend::localsend_send_text,
            localsend::localsend_get_received_files,
            localsend::localsend_open_download_folder,
            localsend::localsend_set_auto_accept,
            localsend::localsend_add_manual_device,
            notes::vault_select_folder,
            notes::vault_get_default_path,
            notes::vault_list_entries,
            notes::vault_read_file,
            notes::vault_write_file,
            notes::vault_create_file,
            notes::vault_create_folder,
            notes::vault_rename_entry,
            notes::vault_delete_entry,
            notes::vault_reveal_in_explorer,
            notes::vault_start_watcher,
            notes::vault_stop_watcher,
            notes::vault_set_window_mode
        ])
        .run(tauri::generate_context!())
        .expect("kapanış. başlatılamadı");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn alarm(timestamp: i64, interval_seconds: Option<u64>, remaining: Option<u32>) -> Alarm {
        Alarm {
            id: "test-alarm".to_string(),
            timestamp,
            note: String::new(),
            created_at: 1,
            interval_seconds,
            remaining_occurrences: remaining,
            sound_enabled: true,
            sound_profile: SoundProfile::Chime,
        }
    }

    #[test]
    fn future_alarm_is_preserved() {
        let normalized = normalize_alarm(alarm(200_000, None, Some(1)), 100_000)
            .expect("future alarm should remain");
        assert_eq!(normalized.timestamp, 200_000);
        assert_eq!(normalized.remaining_occurrences, Some(1));
    }

    #[test]
    fn expired_one_time_alarm_is_removed() {
        assert!(normalize_alarm(alarm(100_000, None, Some(1)), 100_001).is_none());
    }

    #[test]
    fn recurring_alarm_skips_missed_occurrences() {
        let normalized = normalize_alarm(alarm(100_000, Some(60), Some(5)), 190_000)
            .expect("recurring alarm should advance");
        assert_eq!(normalized.timestamp, 220_000);
        assert_eq!(normalized.remaining_occurrences, Some(3));
    }

    #[test]
    fn exhausted_recurring_alarm_is_removed() {
        assert!(normalize_alarm(alarm(100_000, Some(60), Some(2)), 190_000).is_none());
    }

    #[test]
    fn infinite_alarm_always_advances_to_the_future() {
        let normalized = normalize_alarm(alarm(100_000, Some(60), None), 160_000)
            .expect("infinite alarm should remain");
        assert_eq!(normalized.timestamp, 220_000);
        assert_eq!(normalized.remaining_occurrences, None);
    }
}
