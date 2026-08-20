use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{
    webview::{NewWindowResponse, PageLoadEvent, WebviewBuilder},
    AppHandle, Emitter, Manager, Url, WebviewUrl,
};

pub const EVENT_TAB_CREATED: &str = "browser:tab-created";
pub const EVENT_TAB_UPDATED: &str = "browser:tab-updated";
pub const EVENT_TAB_DESTROYED: &str = "browser:tab-destroyed";
pub const EVENT_MEDIA_UPDATED: &str = "browser:media-updated";
pub const EVENT_OPEN_REQUEST: &str = "browser:open-request";

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}
impl Bounds {
    fn validate(&self) -> Result<(), String> {
        if [self.x, self.y, self.width, self.height]
            .iter()
            .any(|n| !n.is_finite())
            || self.x < 0.
            || self.y < 0.
            || !(1. ..=20_000.).contains(&self.width)
            || !(1. ..=20_000.).contains(&self.height)
        {
            Err("Geçersiz tarayıcı alanı.".into())
        } else {
            Ok(())
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TabProjection {
    pub id: String,
    pub url: String,
    pub title: String,
    pub favicon: Option<String>,
    pub loading: bool,
    pub can_go_back: bool,
    pub can_go_forward: bool,
    pub error: Option<String>,
    pub label: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserMediaProjection {
    pub tab_id: String,
    pub playing: bool,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub artwork: Option<String>,
    pub source: String,
    pub favicon: Option<String>,
    pub last_playing_at: u64,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugSnapshot {
    pub open_tab_ids: Vec<String>,
    pub webview_labels: Vec<String>,
    pub active_id: Option<String>,
    pub media_ids: Vec<String>,
    pub closing_ids: Vec<String>,
    pub listener_count: usize,
}
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct Probe {
    title: Option<String>,
    favicon: Option<String>,
    playing: Option<bool>,
    media_title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    artwork: Option<String>,
    source: Option<String>,
}
struct BrowserTab {
    webview: tauri::Webview,
    projection: TabProjection,
    history: Vec<String>,
    history_index: usize,
    eval_failures: u8,
}
#[derive(Default)]
struct Registry {
    tabs: HashMap<String, BrowserTab>,
    active: Option<String>,
    media: HashMap<String, BrowserMediaProjection>,
    closing: HashSet<String>,
}
#[derive(Clone)]
pub struct BrowserManager {
    inner: Arc<Mutex<Registry>>,
    profile_dir: PathBuf,
}

impl BrowserManager {
    pub fn new(profile_dir: PathBuf) -> Self {
        let _ = std::fs::create_dir_all(&profile_dir);
        Self {
            inner: Arc::new(Mutex::new(Registry::default())),
            profile_dir,
        }
    }
    pub fn validate_id(id: &str) -> Result<(), String> {
        if id.is_empty()
            || id.len() > 64
            || !id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        {
            Err("Geçersiz sekme kimliği.".into())
        } else {
            Ok(())
        }
    }
    pub fn parse_url(value: &str) -> Result<Url, String> {
        let url =
            Url::parse(value.trim()).map_err(|_| "Geçerli bir web adresi girin.".to_string())?;
        if matches!(url.scheme(), "http" | "https") {
            Ok(url)
        } else {
            Err("Tarayıcı yalnızca http ve https adreslerini açabilir.".into())
        }
    }
    fn label(id: &str) -> String {
        format!("browser-{id}")
    }
    fn emit<T: Serialize>(app: &AppHandle, event: &str, value: &T) {
        let _ = app.emit(event, value);
    }
    fn projection(&self, app: &AppHandle, id: &str) {
        if let Some(p) = self
            .inner
            .lock()
            .ok()
            .and_then(|r| r.tabs.get(id).map(|t| t.projection.clone()))
        {
            Self::emit(app, EVENT_TAB_UPDATED, &p);
        }
    }
    fn record_load(&self, app: &AppHandle, id: &str, url: String, loading: bool) {
        if let Ok(mut r) = self.inner.lock() {
            if let Some(t) = r.tabs.get_mut(id) {
                t.projection.loading = loading;
                t.projection.url = url.clone();
                t.projection.error = None;
                if !loading {
                    if t.history.get(t.history_index) != Some(&url) {
                        t.history.truncate(t.history_index.saturating_add(1));
                        t.history.push(url);
                        t.history_index = t.history.len() - 1;
                    }
                    t.projection.can_go_back = t.history_index > 0;
                    t.projection.can_go_forward = t.history_index + 1 < t.history.len();
                }
            }
        }
        self.projection(app, id);
    }
    pub fn create(
        &self,
        app: AppHandle,
        id: String,
        url: String,
        bounds: Bounds,
    ) -> Result<TabProjection, String> {
        Self::validate_id(&id)?;
        bounds.validate()?;
        let url = Self::parse_url(&url)?;
        if let Some(p) = self
            .inner
            .lock()
            .map_err(|_| "Tarayıcı kaydı kilitlenemedi.")?
            .tabs
            .get(&id)
            .map(|t| t.projection.clone())
        {
            return Ok(p);
        }
        let label = Self::label(&id);
        let title_id = id.clone();
        let load_id = id.clone();
        let title_app = app.clone();
        let load_app = app.clone();
        let popup_app = app.clone();
        let manager = self.clone();
        let load_manager = self.clone();
        let builder = WebviewBuilder::new(&label, WebviewUrl::External(url.clone()))
            .data_directory(self.profile_dir.clone())
            .initialization_script("document.documentElement.style.colorScheme='light dark';")
            .on_navigation(|next| matches!(next.scheme(), "http" | "https"))
            .on_document_title_changed(move |_, title| {
                if let Ok(mut r) = manager.inner.lock() {
                    if let Some(t) = r.tabs.get_mut(&title_id) {
                        t.projection.title = title;
                    }
                }
                manager.projection(&title_app, &title_id);
            })
            .on_page_load(move |_, payload| {
                load_manager.record_load(
                    &load_app,
                    &load_id,
                    payload.url().to_string(),
                    matches!(payload.event(), PageLoadEvent::Started),
                )
            })
            .on_new_window(move |popup, _| {
                if Self::parse_url(popup.as_str()).is_ok() {
                    let _ = popup_app.emit(EVENT_OPEN_REQUEST, popup.to_string());
                }
                NewWindowResponse::Deny
            });
        let window = app
            .get_webview_window("main")
            .ok_or_else(|| "Ana pencere bulunamadı.".to_string())?
            .as_ref()
            .window();
        let webview = window
            .add_child(
                builder,
                tauri::LogicalPosition::new(bounds.x, bounds.y),
                tauri::LogicalSize::new(bounds.width, bounds.height),
            )
            .map_err(|e| format!("Tarayıcı sekmesi oluşturulamadı: {e}"))?;
        // `add_child` can synchronously create the WebView2 controller.  Do not hide it
        // here: on Windows an immediate controller visibility transition can block before
        // this command returns, leaving a real child with no registry/projection.  Creation
        // is immediately followed by the explicit `activate` command from the renderer;
        // that command owns visibility for this and every other live child.
        let p = TabProjection {
            id: id.clone(),
            url: url.to_string(),
            title: url.host_str().unwrap_or("Yeni sekme").to_string(),
            favicon: domain_favicon(&url),
            loading: true,
            can_go_back: false,
            can_go_forward: false,
            error: None,
            label,
        };
        let tab = BrowserTab {
            webview: webview.clone(),
            projection: p.clone(),
            history: vec![url.to_string()],
            history_index: 0,
            eval_failures: 0,
        };
        if let Ok(mut registry) = self.inner.lock() {
            registry.tabs.insert(id, tab);
        } else {
            // The child exists after add_child, so compensate before reporting a failed
            // transaction.  A poisoned registry must never strand an unmanaged WebView.
            let _ = webview.close();
            return Err("Tarayıcı kaydı kilitlenemedi.".into());
        }
        Self::emit(&app, EVENT_TAB_CREATED, &p);
        Ok(p)
    }
    fn tab(&self, id: &str) -> Result<tauri::Webview, String> {
        Self::validate_id(id)?;
        self.inner
            .lock()
            .map_err(|_| "Tarayıcı kaydı kilitlenemedi.".to_string())?
            .tabs
            .get(id)
            .map(|t| t.webview.clone())
            .ok_or_else(|| "Tarayıcı sekmesi bulunamadı.".into())
    }
    pub fn activate(&self, id: &str, visible: bool) -> Result<(), String> {
        let view = self.tab(id)?;
        let others = self
            .inner
            .lock()
            .map_err(|_| "Tarayıcı kaydı kilitlenemedi.")?
            .tabs
            .iter()
            .filter(|(k, _)| k.as_str() != id)
            .map(|(_, t)| t.webview.clone())
            .collect::<Vec<_>>();
        for v in others {
            let _ = v.hide();
        }
        if visible {
            view.show().map_err(|e| e.to_string())?
        } else {
            view.hide().map_err(|e| e.to_string())?
        }
        self.inner
            .lock()
            .map_err(|_| "Tarayıcı kaydı kilitlenemedi.")?
            .active = Some(id.into());
        Ok(())
    }
    pub fn set_visible(&self, visible: bool) {
        if let Ok(r) = self.inner.lock() {
            for t in r.tabs.values() {
                let _ = if visible && r.active.as_deref() == Some(&t.projection.id) {
                    t.webview.show()
                } else {
                    t.webview.hide()
                };
            }
        }
    }
    /// Removes the native active view while retaining every tab in the registry.
    /// This is distinct from hiding the whole browser route: a renderer-only new tab
    /// must not become visible again when the route later returns to the foreground.
    pub fn deactivate(&self) -> Result<(), String> {
        let views = {
            let mut registry = self
                .inner
                .lock()
                .map_err(|_| "Tarayıcı kaydı kilitlenemedi.")?;
            registry.active = None;
            registry
                .tabs
                .values()
                .map(|tab| tab.webview.clone())
                .collect::<Vec<_>>()
        };
        for view in views {
            view.hide().map_err(|error| error.to_string())?;
        }
        Ok(())
    }
    pub fn navigate(&self, app: &AppHandle, id: &str, url: String) -> Result<(), String> {
        let url = Self::parse_url(&url)?;
        self.tab(id)?
            .navigate(url.clone())
            .map_err(|e| e.to_string())?;
        if let Ok(mut r) = self.inner.lock() {
            if let Some(t) = r.tabs.get_mut(id) {
                t.projection.url = url.to_string();
                t.projection.loading = true;
                t.projection.error = None;
                t.projection.favicon = domain_favicon(&url);
                t.history.truncate(t.history_index + 1);
                if t.history.last() != Some(&url.to_string()) {
                    t.history.push(url.to_string());
                }
                t.history_index = t.history.len() - 1;
                t.projection.can_go_back = t.history_index > 0;
                t.projection.can_go_forward = false;
            }
        }
        self.projection(app, id);
        Ok(())
    }
    pub fn reload(&self, id: &str) -> Result<(), String> {
        self.tab(id)?.reload().map_err(|e| e.to_string())
    }
    pub fn history(&self, app: &AppHandle, id: &str, forward: bool) -> Result<(), String> {
        let target = {
            let mut r = self
                .inner
                .lock()
                .map_err(|_| "Tarayıcı kaydı kilitlenemedi.")?;
            let t = r
                .tabs
                .get_mut(id)
                .ok_or_else(|| "Tarayıcı sekmesi bulunamadı.".to_string())?;
            if forward {
                if t.history_index + 1 >= t.history.len() {
                    return Ok(());
                }
                t.history_index += 1
            } else {
                if t.history_index == 0 {
                    return Ok(());
                }
                t.history_index -= 1
            }
            t.projection.url = t.history[t.history_index].clone();
            t.projection.can_go_back = t.history_index > 0;
            t.projection.can_go_forward = t.history_index + 1 < t.history.len();
            t.projection.url.clone()
        };
        self.tab(id)?
            .navigate(Self::parse_url(&target)?)
            .map_err(|e| e.to_string())?;
        self.projection(app, id);
        Ok(())
    }
    pub fn set_bounds(&self, id: &str, b: Bounds) -> Result<(), String> {
        b.validate()?;
        let v = self.tab(id)?;
        v.set_position(tauri::LogicalPosition::new(b.x, b.y))
            .map_err(|e| e.to_string())?;
        v.set_size(tauri::LogicalSize::new(b.width, b.height))
            .map_err(|e| e.to_string())
    }
    pub fn set_theme(&self, theme: &str) -> Result<(), String> {
        if !matches!(theme, "light" | "dark") {
            return Err("Geçersiz tema.".into());
        }
        let script = format!(
            "document.documentElement.style.colorScheme={};",
            serde_json::to_string(theme).unwrap_or_default()
        );
        if let Ok(r) = self.inner.lock() {
            for t in r.tabs.values() {
                let _ = t.webview.eval(script.clone());
            }
        }
        Ok(())
    }
    pub fn toggle_media(&self, id: &str) -> Result<(), String> {
        self.tab(id)?.eval("(()=>{const e=[...document.querySelectorAll('video,audio')].find(x=>!x.paused)||document.querySelector('video,audio');if(e){e.paused?e.play():e.pause()}})()") .map_err(|e|e.to_string())
    }
    pub fn sync_metadata(&self, app: &AppHandle) -> Result<(), String> {
        let tabs = self
            .inner
            .lock()
            .map_err(|_| "Tarayıcı kaydı kilitlenemedi.")?
            .tabs
            .iter()
            .map(|(id, t)| (id.clone(), t.webview.clone()))
            .collect::<Vec<_>>();
        for (id, view) in tabs {
            let manager = self.clone();
            let callback_app = app.clone();
            let key = id.clone();
            let result = view.eval_with_callback(PROBE_SCRIPT, move |raw| {
                manager.apply_probe(&callback_app, &key, &raw)
            });
            if result.is_err() {
                self.mark_probe_failure(app, &id);
            }
        }
        Ok(())
    }
    fn apply_probe(&self, app: &AppHandle, id: &str, raw: &str) {
        let Ok(p) = serde_json::from_str::<Probe>(raw) else {
            self.mark_probe_failure(app, id);
            return;
        };
        let media = if let Ok(mut r) = self.inner.lock() {
            let prior = r.media.get(id).cloned();
            let Some(t) = r.tabs.get_mut(id) else { return };
            t.eval_failures = 0;
            if let Some(title) = p.title.filter(|s| !s.trim().is_empty()) {
                t.projection.title = title
            }
            if let Some(icon) = p
                .favicon
                .filter(|s| s.starts_with("http://") || s.starts_with("https://"))
            {
                t.projection.favicon = Some(icon)
            }
            let playing = p.playing.unwrap_or(false);
            let m = BrowserMediaProjection {
                tab_id: id.into(),
                playing,
                title: p.media_title.unwrap_or_else(|| t.projection.title.clone()),
                artist: p.artist.unwrap_or_default(),
                album: p.album.unwrap_or_default(),
                artwork: p.artwork.filter(|s| s.starts_with("http")),
                source: p.source.unwrap_or_else(|| hostname(&t.projection.url)),
                favicon: t.projection.favicon.clone(),
                last_playing_at: next_last_playing_at(prior.as_ref(), playing, now()),
            };
            r.media.insert(id.into(), m.clone());
            Some(m)
        } else {
            None
        };
        self.projection(app, id);
        if let Some(m) = media {
            Self::emit(app, EVENT_MEDIA_UPDATED, &m)
        }
    }
    fn mark_probe_failure(&self, app: &AppHandle, id: &str) {
        if let Ok(mut r) = self.inner.lock() {
            if let Some(t) = r.tabs.get_mut(id) {
                t.eval_failures = t.eval_failures.saturating_add(1);
                if t.eval_failures >= 3 {
                    t.projection.error =
                        Some("Sekme yanıt vermiyor. Yeniden yükleyin veya kapatın.".into());
                }
            }
        }
        self.projection(app, id)
    }
    pub fn close(&self, app: &AppHandle, id: &str) -> Result<bool, String> {
        Self::validate_id(id)?;
        let view = {
            let mut r = self
                .inner
                .lock()
                .map_err(|_| "Tarayıcı kaydı kilitlenemedi.")?;
            if r.closing.contains(id) {
                return Ok(true);
            }
            let Some(view) = r.tabs.get(id).map(|t| t.webview.clone()) else {
                return Ok(true);
            };
            r.closing.insert(id.into());
            view
        };
        let _ = view.hide();
        if let Err(e) = view.close() {
            if let Ok(mut r) = self.inner.lock() {
                r.closing.remove(id);
                if let Some(t) = r.tabs.get_mut(id) {
                    t.projection.error = Some(format!("Sekme kapatılamadı: {e}"));
                }
            }
            self.projection(app, id);
            return Err(format!("Tarayıcı sekmesi kapatılamadı: {e}"));
        }
        let removed = if let Ok(mut r) = self.inner.lock() {
            r.closing.remove(id);
            r.media.remove(id);
            if r.active.as_deref() == Some(id) {
                r.active = None
            }
            r.tabs.remove(id).map(|t| t.projection)
        } else {
            None
        };
        if let Some(p) = removed {
            Self::emit(app, EVENT_TAB_DESTROYED, &p)
        }
        Ok(true)
    }
    pub fn snapshot(&self) -> DebugSnapshot {
        let Ok(r) = self.inner.lock() else {
            return DebugSnapshot {
                open_tab_ids: vec![],
                webview_labels: vec![],
                active_id: None,
                media_ids: vec![],
                closing_ids: vec![],
                listener_count: 0,
            };
        };
        let mut ids = r.tabs.keys().cloned().collect::<Vec<_>>();
        ids.sort();
        DebugSnapshot {
            webview_labels: ids
                .iter()
                .filter_map(|id| r.tabs.get(id).map(|t| t.projection.label.clone()))
                .collect(),
            open_tab_ids: ids,
            active_id: r.active.clone(),
            media_ids: r.media.keys().cloned().collect(),
            closing_ids: r.closing.iter().cloned().collect(),
            listener_count: r.tabs.len() * 3,
        }
    }
}
const PROBE_SCRIPT: &str = r#"(()=>{try{const links=[...document.querySelectorAll('link[rel~="icon"],link[rel~="shortcut"][rel~="icon"]')];const abs=v=>{try{return new URL(v,location.href).href}catch{return null}};const icon=links.map(x=>abs(x.href)).find(Boolean);const ms=navigator.mediaSession&&navigator.mediaSession.metadata;const el=[...document.querySelectorAll('video,audio')].find(x=>!x.paused&&!x.ended)||document.querySelector('video,audio');const og=n=>document.querySelector(`meta[property="og:${n}"],meta[name="${n}"]`)?.content||null;return {title:document.title,favicon:icon,playing:!!(el&&!el.paused&&!el.ended),mediaTitle:ms?.title||og('title')||el?.getAttribute('title')||document.title,artist:ms?.artist||og('site_name')||'',album:ms?.album||'',artwork:abs(ms?.artwork?.[0]?.src||og('image')||''),source:location.hostname}}catch(e){return {title:document.title||'',playing:false,source:location.hostname||''}}})()"#;
fn domain_favicon(url: &Url) -> Option<String> {
    url.host_str().map(|h| format!("https://{h}/favicon.ico"))
}
fn next_last_playing_at(
    previous: Option<&BrowserMediaProjection>,
    playing: bool,
    observed_at: u64,
) -> u64 {
    match previous {
        Some(media) if media.playing => media.last_playing_at,
        Some(media) if !playing => media.last_playing_at,
        _ if playing => observed_at,
        _ => 0,
    }
}
fn hostname(url: &str) -> String {
    Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(str::to_string))
        .unwrap_or_default()
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;
    #[derive(Default)]
    struct Model {
        tabs: HashSet<String>,
        media: HashSet<String>,
        active: Option<String>,
        closing: HashSet<String>,
    }
    impl Model {
        fn close(&mut self, id: &str, ok: bool) {
            if !self.tabs.contains(id) {
                return;
            }
            self.closing.insert(id.into());
            if ok {
                self.tabs.remove(id);
                self.media.remove(id);
                if self.active.as_deref() == Some(id) {
                    self.active = None;
                }
                self.closing.remove(id);
            } else {
                self.closing.remove(id);
            }
        }
    }
    #[test]
    fn lifecycle_model_is_idempotent() {
        let mut m = Model::default();
        for i in 0..30 {
            let id = format!("t{i}");
            m.tabs.insert(id.clone());
            m.media.insert(id.clone());
            m.active = Some(id.clone());
            m.close(&id, true);
            m.close(&id, true)
        }
        assert!(
            m.tabs.is_empty() && m.media.is_empty() && m.closing.is_empty() && m.active.is_none()
        );
        m.tabs.insert("x".into());
        m.media.insert("x".into());
        m.active = Some("x".into());
        m.close("x", false);
        assert!(m.tabs.contains("x") && m.media.contains("x") && m.closing.is_empty());
    }
    #[test]
    fn validation_rejects_unsafe_values() {
        assert!(BrowserManager::validate_id("tab_1").is_ok());
        assert!(BrowserManager::validate_id("bad/id").is_err());
        assert!(BrowserManager::parse_url("file:///x").is_err());
    }
    #[test]
    fn media_timestamp_tracks_start_not_poll_cadence() {
        let first = BrowserMediaProjection {
            tab_id: "a".into(),
            playing: true,
            title: String::new(),
            artist: String::new(),
            album: String::new(),
            artwork: None,
            source: String::new(),
            favicon: None,
            last_playing_at: 10,
        };
        assert_eq!(next_last_playing_at(Some(&first), true, 99), 10);
        assert_eq!(next_last_playing_at(Some(&first), false, 100), 10);
        let paused = BrowserMediaProjection {
            playing: false,
            ..first
        };
        assert_eq!(next_last_playing_at(Some(&paused), true, 101), 101);
    }
    #[test]
    fn repeated_urls_append_and_back_forward_keep_their_slot() {
        let mut history = vec!["A".to_string()];
        let mut index = 0usize;
        for url in ["B", "A"] {
            history.truncate(index + 1);
            history.push(url.into());
            index = history.len() - 1;
        }
        assert_eq!(history, ["A", "B", "A"]);
        index -= 1;
        assert_eq!(history[index], "B");
        index += 1;
        assert_eq!(history[index], "A");
    }
}
