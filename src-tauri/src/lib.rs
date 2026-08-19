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

const MAX_TIMER_SECONDS: u64 = 315_360_000;
const MAX_INTERVAL_SECONDS: u64 = 31_536_000;
const MAX_ALARMS: usize = 64;
const ALARM_SLEEP_CHUNK_MS: i64 = 60_000;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum TimerAction {
    Shutdown,
    Restart,
}

impl TimerAction {
    fn from_input(value: &str) -> Result<Self, String> {
        match value {
            "shutdown" => Ok(Self::Shutdown),
            "restart" => Ok(Self::Restart),
            _ => Err("Geçersiz Windows işlemi seçildi.".to_string()),
        }
    }

    fn command_flag(&self) -> &'static str {
        match self {
            Self::Shutdown => "/s",
            Self::Restart => "/r",
        }
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct TimerState {
    action: TimerAction,
    target_at: i64,
    duration_seconds: u64,
}

#[derive(Clone, Copy, Default, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum SoundProfile {
    Gentle,
    #[default]
    Chime,
    Urgent,
}

fn default_sound_enabled() -> bool {
    true
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Alarm {
    id: String,
    timestamp: i64,
    note: String,
    created_at: i64,
    #[serde(default)]
    interval_seconds: Option<u64>,
    #[serde(default)]
    remaining_occurrences: Option<u32>,
    #[serde(default = "default_sound_enabled")]
    sound_enabled: bool,
    #[serde(default)]
    sound_profile: SoundProfile,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateAlarmInput {
    timestamp: i64,
    note: String,
    interval_seconds: Option<u64>,
    occurrence_count: Option<u32>,
    sound_enabled: bool,
    sound_profile: SoundProfile,
}

#[derive(Clone)]
struct AppState {
    inner: Arc<AppStateInner>,
}

struct AppStateInner {
    data_dir: PathBuf,
    timer: Mutex<Option<TimerState>>,
    alarms: Mutex<Vec<Alarm>>,
    active_alarm: Mutex<Option<Alarm>>,
    sound_generation: AtomicU64,
}

impl AppState {
    fn load() -> Self {
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

    fn persist_timer(&self) -> Result<(), String> {
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

    fn persist_alarms(&self) -> Result<(), String> {
        let alarms = self
            .inner
            .alarms
            .lock()
            .map_err(|_| "Alarm listesi kilitlenemedi.".to_string())?
            .clone();
        write_json(&self.inner.data_dir.join("alarms.json"), &alarms)
    }

    fn timer_snapshot(&self) -> Option<TimerState> {
        self.inner.timer.lock().ok().and_then(|timer| timer.clone())
    }

    fn alarms_snapshot(&self) -> Vec<Alarm> {
        self.inner
            .alarms
            .lock()
            .map(|alarms| alarms.clone())
            .unwrap_or_default()
    }
}

fn data_dir() -> PathBuf {
    std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
        .join("kapanis")
}

fn now_millis() -> i64 {
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

#[tauri::command]
fn get_timer_status(state: State<'_, AppState>) -> Result<Option<TimerState>, String> {
    let mut timer = state
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
        state.persist_timer()?;
        return Ok(None);
    }

    Ok(timer.clone())
}

#[tauri::command]
fn schedule_shutdown(
    action: String,
    seconds: u64,
    state: State<'_, AppState>,
) -> Result<TimerState, String> {
    if !(1..=MAX_TIMER_SECONDS).contains(&seconds) {
        return Err("Zamanlayıcı 1 saniye ile 10 yıl arasında olmalı.".to_string());
    }

    let action = TimerAction::from_input(&action)?;
    if state.timer_snapshot().is_some() {
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
    *state
        .inner
        .timer
        .lock()
        .map_err(|_| "Zamanlayıcı durumu kilitlenemedi.".to_string())? = Some(timer.clone());
    state.persist_timer()?;
    Ok(timer)
}

#[tauri::command]
fn cancel_shutdown(state: State<'_, AppState>) -> Result<(), String> {
    let had_timer = state.timer_snapshot().is_some();
    let command_result = run_windows_command(&["/a".to_string()]);
    *state
        .inner
        .timer
        .lock()
        .map_err(|_| "Zamanlayıcı durumu kilitlenemedi.".to_string())? = None;
    state.persist_timer()?;
    if had_timer {
        command_result
    } else {
        Ok(())
    }
}

#[tauri::command]
fn list_alarms(state: State<'_, AppState>) -> Result<Vec<Alarm>, String> {
    let mut alarms = state
        .inner
        .alarms
        .lock()
        .map_err(|_| "Alarm listesi kilitlenemedi.".to_string())?;
    alarms.sort_by_key(|item| item.timestamp);
    Ok(alarms.clone())
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
        let mut alarms = state
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
    state.persist_alarms()?;
    schedule_alarm(app, state.inner.clone(), alarm.clone());
    Ok(alarm)
}

#[tauri::command]
fn cancel_alarm(id: String, state: State<'_, AppState>) -> Result<bool, String> {
    let removed = {
        let mut alarms = state
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
        state.persist_alarms()?;
    }
    Ok(removed)
}

#[tauri::command]
fn stop_alarm_sound(state: State<'_, AppState>) -> Result<(), String> {
    state.inner.sound_generation.fetch_add(1, Ordering::SeqCst);
    set_active_alarm(&state.inner, None)
}

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
            show_main_window(&app);
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

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
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
            "open" => show_main_window(app),
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
                show_main_window(tray.app_handle());
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
        window.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
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

    thread::spawn(move || {
        thread::sleep(Duration::from_millis(900));
        if let Some(splash) = handle.get_webview_window("splash") {
            let _ = splash.close();
        }
        show_main_window(&handle);
    });
}

fn configure_window_effects(app: &mut tauri::App) {
    #[cfg(windows)]
    for label in ["main", "splash"] {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window_vibrancy::apply_acrylic(&window, Some((1, 11, 19, 158)));
        }
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if !args.iter().any(|argument| argument == "--background") {
                show_main_window(app);
            }
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--background"]),
        ))
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let autolaunch = app.autolaunch();
            // Refresh the executable path after switching build profiles or installing an update.
            let _ = autolaunch.disable();
            if let Err(error) = autolaunch.enable() {
                eprintln!("Windows otomatik başlatma etkinleştirilemedi: {error}");
            }

            let state = AppState::load();
            if let Some(timer) = state.timer_snapshot() {
                restore_windows_timer(&timer);
            }
            let alarms = state.alarms_snapshot();
            app.manage(state.clone());
            for alarm in alarms {
                schedule_alarm(app.handle().clone(), state.inner.clone(), alarm);
            }

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
            stop_alarm_sound
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
