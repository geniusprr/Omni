use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Emitter};

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FsChangeEvent {
    pub kind: String,
    pub path: String,
}

pub struct VaultWatcher {
    watcher: Arc<Mutex<Option<RecommendedWatcher>>>,
    active_path: Arc<Mutex<Option<PathBuf>>>,
}

impl VaultWatcher {
    pub fn new() -> Self {
        Self {
            watcher: Arc::new(Mutex::new(None)),
            active_path: Arc::new(Mutex::new(None)),
        }
    }

    pub fn start_watching(&self, app: AppHandle, vault_path: &Path) -> Result<(), String> {
        let mut watcher_lock = self
            .watcher
            .lock()
            .map_err(|e| format!("Watcher kilitlenemedi: {e}"))?;
        let mut path_lock = self
            .active_path
            .lock()
            .map_err(|e| format!("Aktif yol kilitlenemedi: {e}"))?;

        *watcher_lock = None;
        *path_lock = None;

        if !vault_path.exists() {
            return Err("İzlenecek klasör mevcut değil.".to_string());
        }

        let vault_root = vault_path.to_path_buf();
        let vault_root_clone = vault_root.clone();
        let app_handle = app.clone();

        let mut watcher = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                if let Ok(event) = res {
                    let kind_str = match event.kind {
                        EventKind::Create(_) => "create",
                        EventKind::Modify(_) => "modify",
                        EventKind::Remove(_) => "remove",
                        _ => return,
                    };

                    for path in event.paths {
                        if path
                            .components()
                            .any(|c| c.as_os_str().to_string_lossy().starts_with('.'))
                        {
                            continue;
                        }

                        let rel_path = path
                            .strip_prefix(&vault_root_clone)
                            .unwrap_or(&path)
                            .to_string_lossy()
                            .replace('\\', "/");

                        let _ = app_handle.emit(
                            "vault:fs-change",
                            FsChangeEvent {
                                kind: kind_str.to_string(),
                                path: rel_path,
                            },
                        );
                    }
                }
            },
            Config::default(),
        )
        .map_err(|e| format!("Dosya izleyici oluşturulamadı: {e}"))?;

        watcher
            .watch(vault_path, RecursiveMode::Recursive)
            .map_err(|e| format!("Klasör izleme başlatılamadı: {e}"))?;

        *watcher_lock = Some(watcher);
        *path_lock = Some(vault_root);

        Ok(())
    }

    pub fn stop_watching(&self) -> Result<(), String> {
        let mut watcher_lock = self
            .watcher
            .lock()
            .map_err(|e| format!("Watcher kilitlenemedi: {e}"))?;
        let mut path_lock = self
            .active_path
            .lock()
            .map_err(|e| format!("Aktif yol kilitlenemedi: {e}"))?;

        *watcher_lock = None;
        *path_lock = None;
        Ok(())
    }
}
