use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};
use tauri::{AppHandle, Manager, State};

use super::watcher::VaultWatcher;

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VaultFileEntry {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub modified_at: u64,
    pub size: u64,
}

fn resolve_safe_path(vault_root: &Path, rel_path: &str) -> Result<PathBuf, String> {
    let clean_rel = rel_path.trim_start_matches(['/', '\\']);
    let candidate = vault_root.join(clean_rel);

    // Normalize paths and ensure candidate starts with vault_root
    // We handle newly created non-existing targets by checking parent
    let normalized_root = vault_root
        .canonicalize()
        .map_err(|e| format!("Vault dizini geçersiz: {e}"))?;

    let check_path = if candidate.exists() {
        candidate.canonicalize()
    } else if let Some(parent) = candidate.parent() {
        if parent.exists() {
            parent
                .canonicalize()
                .map(|p| p.join(candidate.file_name().unwrap_or_default()))
        } else {
            Ok(candidate.clone())
        }
    } else {
        Ok(candidate.clone())
    };

    match check_path {
        Ok(resolved) => {
            if resolved.starts_with(&normalized_root) || candidate.starts_with(vault_root) {
                Ok(candidate)
            } else {
                Err("Güvenlik hatası: Vault dışındaki dosyalara erişilemez.".to_string())
            }
        }
        Err(_) => Ok(candidate),
    }
}

#[tauri::command]
pub fn vault_select_folder() -> Result<Option<String>, String> {
    let folder = rfd::FileDialog::new()
        .set_title("Vault Klasörü Seç")
        .pick_folder();

    Ok(folder.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn vault_get_default_path(app: AppHandle) -> Result<String, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("App data dizini alınamadı: {e}"))?;

    let default_vault = app_data.join("vault");

    if !default_vault.exists() {
        let _ = fs::create_dir_all(&default_vault);

        // Create initial sample notes and folders
        let welcome_path = default_vault.join("Hoşgeldiniz.md");
        let initial_content = r#"---
tags:
  - baslangic
  - rehber
created: 2026-08-19
status: active
---

# kapanış. Defter'e Hoş Geldiniz

Bu defter, **Obsidian** ve **Geode** mantığıyla çalışan, tamamen yerel dosya tabanlı bir kişisel bilgi ve not yönetim sistemidir.

## Özellikler

- **Markdown & Canlı Önizleme**: Zengin formatlar, tablolar, kod blokları ve görev listeleri.
- **Çift Yönlü Bağlantılar (Wikilinks)**: [[Projeler]] veya [[Fikirler|Yaratıcı Düşünceler]] şeklinde notları birbirine bağlayın.
- **İlişki Grafiği (Graph View)**: Notlarınız arasındaki bağlantıları görsel olarak keşfedin.
- **Geri Bağlantılar (Backlinks)**: Sağ panelden bu nota referans veren tüm diğer notları görün.
- **Hızlı Değiştirici**: `Ctrl + O` ile notlar arasında saniyeler içinde geçiş yapın.
- **Komut Paleti**: `Ctrl + P` ile tüm komutlara klavyeden erişin.
- **Günlük Notlar**: `Ctrl + D` ile bugünün notunu anında açın.

### Görev Listesi
- [x] Defter modülünü keşfet
- [ ] İlk notumu oluştur
- [ ] Bir [[wikilink]] ekle

Keyifli çalışmalar!
"#;
        let _ = fs::write(welcome_path, initial_content);

        let projects_dir = default_vault.join("Projeler");
        let _ = fs::create_dir_all(&projects_dir);
        let project_note = projects_dir.join("kapanış.md");
        let _ = fs::write(
            project_note,
            "# kapanış. Projesi\n\nSakin ve düşük kaynak tüketimli Windows kapatma, alarm ve defter uygulaması.\n\nİlgili not: [[Hoşgeldiniz]]",
        );
    }

    Ok(default_vault.to_string_lossy().to_string())
}

#[tauri::command]
pub fn vault_list_entries(vault_path: String) -> Result<Vec<VaultFileEntry>, String> {
    let root = Path::new(&vault_path);
    if !root.exists() {
        return Err("Vault dizini mevcut değil.".to_string());
    }

    let mut entries = Vec::new();
    collect_entries_recursive(root, root, &mut entries)?;
    Ok(entries)
}

fn collect_entries_recursive(
    current: &Path,
    root: &Path,
    results: &mut Vec<VaultFileEntry>,
) -> Result<(), String> {
    let read_dir = fs::read_dir(current)
        .map_err(|e| format!("Klasör okunamadı {}: {e}", current.display()))?;

    for entry in read_dir.flatten() {
        let path = entry.path();
        let file_name = path
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();

        // Skip hidden files/folders (starting with .)
        if file_name.starts_with('.') {
            continue;
        }

        let is_dir = path.is_dir();

        // Only include directories and .md or text files
        if !is_dir && !file_name.to_lowercase().ends_with(".md") {
            continue;
        }

        let rel_path = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");

        let metadata = entry.metadata().ok();
        let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
        let modified_at = metadata
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        results.push(VaultFileEntry {
            path: rel_path,
            name: file_name,
            is_dir,
            modified_at,
            size,
        });

        if is_dir {
            collect_entries_recursive(&path, root, results)?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn vault_read_file(vault_path: String, rel_path: String) -> Result<String, String> {
    let root = Path::new(&vault_path);
    let target = resolve_safe_path(root, &rel_path)?;

    if !target.exists() {
        return Err("Dosya bulunamadı.".to_string());
    }

    fs::read_to_string(&target).map_err(|e| format!("Dosya okunamadı: {e}"))
}

#[tauri::command]
pub fn vault_write_file(
    vault_path: String,
    rel_path: String,
    content: String,
) -> Result<(), String> {
    let root = Path::new(&vault_path);
    let target = resolve_safe_path(root, &rel_path)?;

    if let Some(parent) = target.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("Üst klasör oluşturulamadı: {e}"))?;
        }
    }

    fs::write(&target, content).map_err(|e| format!("Dosya yazılamadı: {e}"))
}

#[tauri::command]
pub fn vault_create_file(
    vault_path: String,
    rel_path: String,
    initial_content: Option<String>,
) -> Result<(), String> {
    let root = Path::new(&vault_path);
    let mut clean_rel = rel_path;
    if !clean_rel.to_lowercase().ends_with(".md") {
        clean_rel.push_str(".md");
    }

    let target = resolve_safe_path(root, &clean_rel)?;

    if target.exists() {
        return Err("Bu isimde bir dosya zaten var.".to_string());
    }

    if let Some(parent) = target.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("Klasör oluşturulamadı: {e}"))?;
        }
    }

    let content = initial_content.unwrap_or_default();
    fs::write(&target, content).map_err(|e| format!("Dosya oluşturulamadı: {e}"))
}

#[tauri::command]
pub fn vault_create_folder(vault_path: String, rel_path: String) -> Result<(), String> {
    let root = Path::new(&vault_path);
    let target = resolve_safe_path(root, &rel_path)?;

    if target.exists() {
        return Err("Bu isimde bir klasör zaten var.".to_string());
    }

    fs::create_dir_all(&target).map_err(|e| format!("Klasör oluşturulamadı: {e}"))
}

#[tauri::command]
pub fn vault_rename_entry(
    vault_path: String,
    old_rel_path: String,
    new_rel_path: String,
) -> Result<(), String> {
    let root = Path::new(&vault_path);
    let old_target = resolve_safe_path(root, &old_rel_path)?;
    let new_target = resolve_safe_path(root, &new_rel_path)?;

    if !old_target.exists() {
        return Err("Taşınacak/adlandırılacak dosya bulunamadı.".to_string());
    }

    if new_target.exists() {
        return Err("Hedef isimde bir dosya veya klasör zaten var.".to_string());
    }

    if let Some(parent) = new_target.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("Hedef klasör oluşturulamadı: {e}"))?;
        }
    }

    fs::rename(&old_target, &new_target).map_err(|e| format!("Yeniden adlandırma başarısız: {e}"))
}

#[tauri::command]
pub fn vault_delete_entry(vault_path: String, rel_path: String) -> Result<(), String> {
    let root = Path::new(&vault_path);
    let target = resolve_safe_path(root, &rel_path)?;

    if !target.exists() {
        return Ok(());
    }

    if target.is_dir() {
        fs::remove_dir_all(&target).map_err(|e| format!("Klasör silinemedi: {e}"))
    } else {
        fs::remove_file(&target).map_err(|e| format!("Dosya silinemedi: {e}"))
    }
}

#[tauri::command]
pub fn vault_reveal_in_explorer(
    vault_path: String,
    rel_path: Option<String>,
) -> Result<(), String> {
    let root = Path::new(&vault_path);
    let target = if let Some(rel) = rel_path {
        resolve_safe_path(root, &rel)?
    } else {
        root.to_path_buf()
    };

    #[cfg(windows)]
    {
        use std::process::Command;
        if target.is_file() {
            let _ = Command::new("explorer.exe")
                .arg(format!("/select,{}", target.to_string_lossy()))
                .spawn();
        } else {
            let _ = Command::new("explorer.exe")
                .arg(target.to_string_lossy().to_string())
                .spawn();
        }
    }

    Ok(())
}

#[tauri::command]
pub fn vault_start_watcher(
    app: AppHandle,
    vault_path: String,
    watcher_state: State<'_, VaultWatcher>,
) -> Result<(), String> {
    let root = Path::new(&vault_path);
    watcher_state.start_watching(app, root)
}

#[tauri::command]
pub fn vault_stop_watcher(watcher_state: State<'_, VaultWatcher>) -> Result<(), String> {
    watcher_state.stop_watching()
}

#[tauri::command]
pub fn vault_set_window_mode(app: AppHandle, mode: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_resizable(true);
        let _ = window.set_maximizable(true);
        let _ = window.set_min_size(Some(tauri::Size::Logical(tauri::LogicalSize {
            width: 780.0,
            height: 560.0,
        })));
        if mode == "notes" {
            let size = window.inner_size().unwrap_or_default();
            if size.width < 1100 || size.height < 700 {
                let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
                    width: 1200.0,
                    height: 760.0,
                }));
            }
        }
    }
    Ok(())
}
