use tauri::Manager;

struct CoreProcess(std::sync::Mutex<Option<std::process::Child>>);

#[derive(serde::Serialize)]
struct LocalUploadFile {
    path: String,
    name: String,
    data: Vec<u8>,
}

#[derive(serde::Deserialize)]
struct LocalDownloadFile {
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
            read_local_upload_files,
            write_local_download_files,
            active_explorer_directory
        ])
        .setup(|app| {
            let child = match start_core_server(app.handle()) {
                Ok(child) => child,
                Err(error) => {
                    eprintln!("failed to start AI SSH core: {error}");
                    None
                }
            };
            app.manage(CoreProcess(std::sync::Mutex::new(child)));
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                let state = app_handle.state::<CoreProcess>();
                let mut guard = state.0.lock().unwrap();
                if let Some(mut child) = guard.take() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        });
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

#[tauri::command]
fn write_local_download_files(
    directory: String,
    files: Vec<LocalDownloadFile>,
) -> Result<(), String> {
    let target_dir = std::path::PathBuf::from(&directory);
    if !target_dir.is_dir() {
        return Err(format!("{directory} 不是可写入的文件夹"));
    }

    for file in files {
        let name = safe_download_file_name(&file.name);
        let target = target_dir.join(name);
        std::fs::write(&target, file.data)
            .map_err(|error| format!("{}: {error}", target.display()))?;
    }
    Ok(())
}

fn safe_download_file_name(name: &str) -> String {
    std::path::Path::new(name)
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty() && *value != "." && *value != "..")
        .unwrap_or("download-file")
        .to_string()
}

#[tauri::command]
fn active_explorer_directory() -> Result<Option<String>, String> {
    platform_active_explorer_directory()
}

#[cfg(windows)]
fn platform_active_explorer_directory() -> Result<Option<String>, String> {
    let script = r#"
$shell = New-Object -ComObject Shell.Application
Add-Type -AssemblyName System.Windows.Forms | Out-Null
$point = [System.Windows.Forms.Cursor]::Position
foreach ($window in $shell.Windows()) {
  try {
    $name = [System.IO.Path]::GetFileName($window.FullName)
    if ($name -ne 'explorer.exe') { continue }
    $left = [int]$window.Left
    $top = [int]$window.Top
    $right = $left + [int]$window.Width
    $bottom = $top + [int]$window.Height
    $path = $window.Document.Folder.Self.Path
    if (-not $path) { continue }
    if ($point.X -ge $left -and $point.X -le $right -and $point.Y -ge $top -and $point.Y -le $bottom) {
      $path
      break
    }
  } catch {}
}
"#;

    let output = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        return Ok(None);
    }
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        Ok(None)
    } else {
        Ok(Some(path))
    }
}

#[cfg(not(windows))]
fn platform_active_explorer_directory() -> Result<Option<String>, String> {
    Ok(None)
}

fn start_core_server(app: &tauri::AppHandle) -> Result<Option<std::process::Child>, String> {
    if std::env::var("AI_SSH_DESKTOP_NO_CORE").is_ok() {
        return Ok(None);
    }
    if core_accepts_desktop_token(&std::env::var("AI_SSH_DESKTOP_TOKEN").unwrap_or_default())
        && core_has_required_capabilities()
    {
        return Ok(None);
    }
    let core_path = resolve_core_path(app)?;
    let core_dir = core_path
        .parent()
        .ok_or_else(|| "无法解析 Go core 所在目录".to_string())?
        .to_path_buf();
    std::fs::create_dir_all(core_dir.join("data")).map_err(|error| error.to_string())?;

    let mut command = std::process::Command::new(&core_path);
    let bind_host = std::env::var("AI_SSH_BIND_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    command
        .current_dir(&core_dir)
        .env("AI_SSH_BIND_HOST", &bind_host)
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
    let child = command.spawn().map_err(|error| error.to_string())?;
    wait_core_listen(bind_host)?;
    Ok(Some(child))
}

fn find_debug_repo_root() -> Option<std::path::PathBuf> {
    let mut current = std::env::current_dir().ok()?;
    loop {
        if current.join("package.json").is_file()
            && current.join("apps").join("core-go").is_dir()
            && current.join("apps").join("desktop").is_dir()
        {
            return Some(current);
        }
        if !current.pop() {
            return None;
        }
    }
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
    file.read_to_end(&mut seed)
        .map_err(|error| error.to_string())?;
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
    if cfg!(debug_assertions) {
        if let Some(repo_root) = find_debug_repo_root() {
            candidates.push(
                repo_root
                    .join("apps")
                    .join("core-go")
                    .join("bin")
                    .join(exe_name),
            );
        }
    }
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

fn core_accepts_desktop_token(token: &str) -> bool {
    if token.is_empty() {
        return false;
    }
    let Ok(mut stream) = std::net::TcpStream::connect_timeout(
        &std::net::SocketAddr::from(([127, 0, 0, 1], 18555)),
        std::time::Duration::from_millis(200),
    ) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(std::time::Duration::from_millis(500)));
    let _ = stream.set_write_timeout(Some(std::time::Duration::from_millis(500)));
    let request = format!(
        "POST /api/auth/desktop-token HTTP/1.1\r\nHost: 127.0.0.1:18555\r\nX-AI-SSH-Desktop-Token: {token}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
    );
    if std::io::Write::write_all(&mut stream, request.as_bytes()).is_err() {
        return false;
    }
    let mut response = String::new();
    if std::io::Read::read_to_string(&mut stream, &mut response).is_err() {
        return false;
    }
    response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200")
}

fn core_has_required_capabilities() -> bool {
    let Some(response) = local_core_http(
        "GET /api/health HTTP/1.1\r\nHost: 127.0.0.1:18555\r\nConnection: close\r\n\r\n",
    ) else {
        return false;
    };
    response.starts_with("HTTP/1.1 200")
        && response.contains("\"ai-assist\"")
        && response.contains("\"ai-agent\"")
        && response.contains("\"ai-stream\"")
        && response.contains("\"ai-unified\"")
}

fn local_core_http(request: &str) -> Option<String> {
    let mut stream = std::net::TcpStream::connect_timeout(
        &std::net::SocketAddr::from(([127, 0, 0, 1], 18555)),
        std::time::Duration::from_millis(200),
    )
    .ok()?;
    let _ = stream.set_read_timeout(Some(std::time::Duration::from_millis(500)));
    let _ = stream.set_write_timeout(Some(std::time::Duration::from_millis(500)));
    std::io::Write::write_all(&mut stream, request.as_bytes()).ok()?;
    let mut response = String::new();
    std::io::Read::read_to_string(&mut stream, &mut response).ok()?;
    Some(response)
}

fn wait_core_listen(bind_host: String) -> Result<(), String> {
    let core_port: u16 = std::env::var("AI_SSH_CORE_PORT")
        .unwrap_or_else(|_| "18555".to_string())
        .parse()
        .unwrap_or(18555);
    let addr = if bind_host == "0.0.0.0" || bind_host.is_empty() {
        "127.0.0.1".to_string()
    } else {
        bind_host
    };
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(15);
    loop {
        if std::time::Instant::now() > deadline {
            return Err(format!(
                "core 启动超时（15 秒），{addr}:{core_port} 无响应"
            ));
        }
        if std::net::TcpStream::connect_timeout(
            &std::net::SocketAddr::from(([127, 0, 0, 1], core_port)),
            std::time::Duration::from_millis(500),
        )
        .is_ok()
        {
            return Ok(());
        }
        std::thread::sleep(std::time::Duration::from_millis(400));
    }
}
