use tauri::Manager;

#[derive(serde::Serialize)]
struct LocalUploadFile {
    path: String,
    name: String,
    data: Vec<u8>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let desktop_token = persistent_desktop_token();
    std::env::set_var("AI_SSH_DESKTOP_TOKEN", &desktop_token);
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            desktop_login_token,
            read_local_upload_files
        ])
        .setup(|app| {
            if let Err(error) = start_core_server(app.handle()) {
                eprintln!("failed to start AI SSH core: {error}");
            }
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn desktop_login_token() -> String {
    std::env::var("AI_SSH_DESKTOP_TOKEN").unwrap_or_default()
}

#[tauri::command]
fn read_local_upload_files(paths: Vec<String>) -> Result<Vec<LocalUploadFile>, String> {
    paths
        .into_iter()
        .map(|path| {
            let file_path = std::path::PathBuf::from(&path);
            if !file_path.is_file() {
                return Err(format!("{path} 不是可上传的文件"));
            }
            let name = file_path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("upload-file")
                .to_string();
            let data = std::fs::read(&file_path).map_err(|error| format!("{path}: {error}"))?;
            Ok(LocalUploadFile { path, name, data })
        })
        .collect()
}

fn start_core_server(app: &tauri::AppHandle) -> Result<(), String> {
    if std::env::var("AI_SSH_DESKTOP_NO_CORE").is_ok() {
        return Ok(());
    }
    if core_health_ok() {
        return Ok(());
    }
    let core_path = resolve_core_path(app)?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&app_data_dir).map_err(|error| error.to_string())?;

    let mut command = std::process::Command::new(core_path);
    command
        .env("AI_SSH_HOME", app_data_dir)
        .env("AI_SSH_BIND_HOST", "127.0.0.1")
        .env(
            "AI_SSH_DESKTOP_TOKEN",
            std::env::var("AI_SSH_DESKTOP_TOKEN").unwrap_or_default(),
        );
    if let Some(web_root) = resolve_web_root(app) {
        command.env("AI_SSH_WEB_ROOT", web_root);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command.spawn().map_err(|error| error.to_string())?;
    Ok(())
}

fn persistent_desktop_token() -> String {
    if let Some(token) = read_persistent_desktop_token() {
        return token;
    }
    let token = desktop_token();
    let _ = write_persistent_desktop_token(&token);
    token
}

fn read_persistent_desktop_token() -> Option<String> {
    let path = desktop_token_path()?;
    let token = std::fs::read_to_string(path).ok()?.trim().to_string();
    if token.is_empty() {
        return None;
    }
    Some(token)
}

fn write_persistent_desktop_token(token: &str) -> Result<(), String> {
    let path = desktop_token_path().ok_or_else(|| "无法解析桌面 token 存储路径".to_string())?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    std::fs::write(path, token).map_err(|error| error.to_string())
}

fn desktop_token_path() -> Option<std::path::PathBuf> {
    let base = std::env::var_os("APPDATA")
        .map(std::path::PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(std::path::PathBuf::from))?;
    Some(base.join("ai-ssh").join("desktop-token"))
}

fn desktop_token() -> String {
    let mut buffer = [0u8; 32];
    if fill_random(&mut buffer).is_ok() {
        return hex_encode(&buffer);
    }
    let fallback = format!(
        "{:?}-{:?}",
        std::time::SystemTime::now(),
        std::process::id()
    );
    hex_encode(fallback.as_bytes())
}

#[cfg(windows)]
fn fill_random(buffer: &mut [u8]) -> Result<(), String> {
    use std::io::Read;
    let mut file = std::fs::File::open("C:\\Windows\\System32\\drivers\\etc\\hosts")
        .map_err(|error| error.to_string())?;
    let mut seed = Vec::new();
    file.read_to_end(&mut seed).map_err(|error| error.to_string())?;
    let now = format!("{:?}{:?}", std::time::SystemTime::now(), std::process::id());
    let bytes = now.as_bytes();
    for (index, slot) in buffer.iter_mut().enumerate() {
        let source = seed.get(index % seed.len()).copied().unwrap_or(0);
        let extra = bytes.get(index % bytes.len()).copied().unwrap_or(0);
        *slot = source ^ extra ^ (index as u8).wrapping_mul(31);
    }
    Ok(())
}

#[cfg(not(windows))]
fn fill_random(buffer: &mut [u8]) -> Result<(), String> {
    use std::io::Read;
    std::fs::File::open("/dev/urandom")
        .map_err(|error| error.to_string())?
        .read_exact(buffer)
        .map_err(|error| error.to_string())
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut result = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        result.push(HEX[(byte >> 4) as usize] as char);
        result.push(HEX[(byte & 0x0f) as usize] as char);
    }
    result
}

fn resolve_core_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    if let Ok(path) = std::env::var("AI_SSH_CORE_PATH") {
        let path = std::path::PathBuf::from(path);
        if path.exists() {
            return Ok(path);
        }
    }

    let exe_name = if cfg!(windows) {
        "ai-ssh-core.exe"
    } else {
        "ai-ssh-core"
    };
    let mut candidates = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join(exe_name));
        candidates.push(resource_dir.join("bin").join(exe_name));
    }
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            candidates.push(exe_dir.join(exe_name));
            candidates.push(exe_dir.join("resources").join(exe_name));
        }
    }
    if cfg!(debug_assertions) {
        candidates.push(std::path::PathBuf::from("../../core-go/bin").join(exe_name));
        candidates.push(std::path::PathBuf::from("../core-go/bin").join(exe_name));
    }
    for candidate in candidates {
        if candidate.exists() {
            return Ok(candidate);
        }
    }
    Err(format!("找不到 {exe_name}，可通过 AI_SSH_CORE_PATH 指定"))
}

fn resolve_web_root(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("resources").join("web"));
        candidates.push(resource_dir.join("web"));
    }
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            candidates.push(exe_dir.join("resources").join("web"));
            candidates.push(exe_dir.join("web"));
        }
    }
    candidates.into_iter().find(|candidate| candidate.is_dir())
}

fn core_health_ok() -> bool {
    match std::net::TcpStream::connect_timeout(
        &std::net::SocketAddr::from(([127, 0, 0, 1], 18555)),
        std::time::Duration::from_millis(200),
    ) {
        Ok(_) => true,
        Err(_) => false,
    }
}
