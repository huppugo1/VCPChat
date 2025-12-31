use chrono::Local;
use percent_encoding::percent_decode_str;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::path::PathBuf;
use std::sync::Mutex;
use tokio::fs;
use tauri::Manager;
use tauri::Emitter;

use crate::agent::{Agent, Topic};
mod agent;
mod group;
mod user;
mod theme;
mod chat;
pub use agent::{get_agent_topics, get_agents, get_agent_config, create_agent, delete_agent, update_agent_config, save_agent_avatar};
pub use group::{create_group, delete_group, update_group_config, save_group_avatar, get_agent_groups, get_agent_group_config};
pub use user::{save_user_avatar, save_user_avatar_legacy, load_user_avatar, load_user_avatar_cmd};
pub use theme::{list_themes, delete_theme, save_theme, apply_theme, apply_theme_cmd, get_themes};

// AppData路径配置
const APP_DATA_DIR: &str = "AppData";

// 应用配置结构
#[derive(Serialize, Deserialize, Clone)]
struct AppConfig {
    username: String,
    vcp_server_url: String,
}

// 设置文件结构
#[allow(dead_code)]
#[derive(Serialize, Deserialize, Clone, Debug)]
struct Settings {
    #[serde(rename = "combinedItemOrder", skip_serializing_if = "Option::is_none")]
    combined_item_order: Option<Vec<CombinedItem>>,
    #[serde(flatten)]
    other: serde_json::Map<String, serde_json::Value>,
}

#[allow(dead_code)]
#[derive(Serialize, Deserialize, Clone, Debug)]
struct CombinedItem {
    #[serde(rename = "type")]
    item_type: String, // "agent" or "group"
    id: String,
}

// 聊天状态存储
#[derive(Clone)]
pub struct ChatStore {
    pub agents: HashMap<String, Agent>,
    pub chat_histories: HashMap<String, Vec<crate::agent::Message>>, // key: "agent_id:topic_id"
}

// Tauri状态管理
pub struct AppState(pub Mutex<ChatStore>);

/// 向用户打招呼的命令
/// 
/// # 参数
/// * `name` - 用户的名字
/// 
/// # 返回值
/// 返回包含用户名字的问候语字符串
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// 获取应用配置的命令
/// 
/// # 返回值
/// 返回包含用户名和VCP服务器URL的应用配置结构体
#[tauri::command]
fn get_app_config() -> AppConfig {
    AppConfig {
        username: "用户".to_string(),
        vcp_server_url: "http://localhost:6005".to_string(),
    }
}

/// 最小化窗口的命令
/// 
/// # 参数
/// * `window` - 要最小化的Tauri窗口对象
#[tauri::command]
fn minimize_window(window: tauri::Window) {
    let _ = window.minimize();
}

/// 最大化窗口的命令
/// 
/// # 参数
/// * `window` - 要最大化的Tauri窗口对象
#[tauri::command]
fn maximize_window(window: tauri::Window) {
    let _ = window.maximize();
}

/// 取消最大化窗口的命令
/// 
/// # 参数
/// * `window` - 要取消最大化的Tauri窗口对象
#[tauri::command]
fn unmaximize_window(window: tauri::Window) {
    let _ = window.unmaximize();
}

/// 关闭窗口的命令
/// 
/// # 参数
/// * `window` - 要关闭的Tauri窗口对象
#[tauri::command]
fn close_window(window: tauri::Window) {
    let _ = window.close();
}

/// 切换窗口最大化状态的命令
/// 
/// # 参数
/// * `window` - 要切换最大化状态的Tauri窗口对象
#[tauri::command]
fn toggle_maximize_window(window: tauri::Window) {
    // 手动切换最大化/还原，兼容当前 Tauri 版本
    match window.is_maximized() {
        Ok(true) => {
            let _ = window.unmaximize();
        }
        Ok(false) => {
            let _ = window.maximize();
        }
        Err(_) => {
            // 获取状态失败时，尽量执行最大化
            let _ = window.maximize();
        }
    }
}

// get_agent_topics is moved to agent.rs

/// 获取AppData路径
/// 
/// 该函数尝试在多个可能的位置查找AppData目录，优先考虑开发模式和生产模式的不同路径结构
/// 
/// # 返回值
/// 返回表示AppData目录路径的PathBuf对象
pub fn get_app_data_path() -> PathBuf {
    // 尝试多个可能的位置
    let exe_dir = env::current_exe()
        .and_then(|p| Ok(p.parent().unwrap().to_path_buf()))
        .unwrap_or_else(|_| PathBuf::from("."));

    // 开发模式：优先检查项目根目录
    // 路径结构: target/debug/exe -> target/debug -> target -> src-tauri -> project_root
    let mut current = exe_dir.clone();
    for _ in 0..3 {
        // 向上3级: debug -> target -> src-tauri
        if let Some(parent) = current.parent() {
            current = parent.to_path_buf();
        }
    }
    let project_root_app_data = current.join(APP_DATA_DIR);

    if project_root_app_data.exists() {
        return project_root_app_data;
    }

    // 生产模式：检查可执行文件目录下的 AppData
    let exe_app_data = exe_dir.join(APP_DATA_DIR);
    if exe_app_data.exists() {
        return exe_app_data;
    }

    // 默认返回项目根目录路径（开发模式优先）
    project_root_app_data
}

/// 获取 AppData 绝对路径（供前端使用 convertFileSrc）
#[tauri::command]
fn get_appdata_base_path() -> String {
    get_app_data_path().to_string_lossy().to_string()
}

/// 初始化应用状态
/// 
/// 创建并初始化应用的全局状态，包括默认的聊天存储和一个默认的助手
/// 
/// # 返回值
/// 返回包含初始聊天存储的AppState对象
fn init_app_state() -> AppState {
    let mut store = ChatStore {
        agents: HashMap::new(),
        chat_histories: HashMap::new(),
    };

    // 创建一个默认的agent用于演示
    let default_agent = Agent {
        id: "default_agent".to_string(),
        name: "默认助手".to_string(),
        avatar_url: None,
        avatar_calculated_color: None,
        topics: vec![Topic {
            id: "default_topic".to_string(),
            name: "默认话题".to_string(),
            created_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            locked: true,
            unread: false,
            creator_source: "system".to_string(),
        }],
        config: serde_json::Map::new(),
    };

    store
        .agents
        .insert("default_agent".to_string(), default_agent);

    AppState(Mutex::new(store))
}

/// Tauri应用程序入口点
/// 
/// 配置并启动Tauri应用程序，注册所有的命令处理器和插件
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .manage(init_app_state())
        .setup(|app| {
            #[cfg(desktop)]
            let _ = app.handle().plugin(tauri_plugin_cli::init());
            
            // 向前端广播 AppData 路径信息
            let app_data_path = get_app_data_path();
            let payload = serde_json::json!({ 
                "appDataPath": app_data_path.to_string_lossy().to_string()
            });
            let _ = app.handle().emit("app-data-path-ready", payload);

            // 从配置中读取devtools设置并自动打开（如果启用）
            if let Some(main_window) = app.get_webview_window("main") {
                let devtools_enabled = app.config().app.windows.iter()
                    .find(|w| w.label == "main")
                    .map(|w| w.devtools.unwrap_or(false))
                    .unwrap_or(false);
                
                if devtools_enabled {
                    main_window.open_devtools();
                }
            }
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            get_app_config,
            get_appdata_base_path,
            minimize_window,
            maximize_window,
            unmaximize_window,
            close_window,
            toggle_maximize_window,
            // agent commands (forwarded in agent module) - expose original names for compatibility
            agent::get_agents,
            agent::get_agent_config,
            agent::get_agent_topics,
            agent::create_agent,
            agent::delete_agent,
            agent::update_agent_config,
            agent::save_agent_avatar,
            // group commands (expose names expected by frontend)
            group::create_group_cmd,
            group::create_group,
            group::delete_group_cmd,
            group::delete_group,
            group::update_group_config_cmd,
            group::update_group_config,
            group::save_group_avatar_cmd,
            group::save_group_avatar,
            group::get_agent_groups,
            group::get_agent_group_config,
            group::create_group_topic,
            group::delete_group_topic,
            group::toggle_group_topic_lock,
            group::set_group_topic_unread,
            group::rename_group_topic,
            user::save_user_avatar_cmd,
            user::load_user_avatar_cmd,
            user::save_user_avatar,
            user::save_user_avatar_legacy,
            user::load_user_avatar,
            get_settings,
            save_settings,
            get_global_warehouse,
            save_global_warehouse,
            load_preset_prompts,
            read_file,
            read_avatar_file,
            theme::list_themes_cmd,
            theme::delete_theme_cmd,
            theme::save_theme_cmd,
            theme::apply_theme_cmd,
            theme::get_themes,
            // also expose original theme function names for compatibility
            theme::list_themes,
            theme::delete_theme,
            theme::save_theme,
            theme::apply_theme,
            // unread counts
            get_unread_topic_counts,
            // topic management (compatibility)
            create_new_topic,
            delete_topic,
            toggle_topic_lock,
            set_topic_unread,
            rename_topic,
            export_topic_as_markdown,
            // chat history and messaging (from chat module)
            chat::get_chat_history,
            chat::save_chat_history,
            chat::get_group_chat_history,
            chat::save_group_chat_history,
            chat::send_message_to_vcp,
            chat::get_file_as_base64,
            chat::get_latest_canvas_content,
            chat::interrupt_vcp_request,
            chat::interrupt_group_request,
            save_wallpaper,
            write_log_message,
            // 新添加的命令
            get_wallpaper_thumbnail,
            get_project_root,
            get_comfyui_workflows,
            load_comfyui_config,
            save_comfyui_config,
            // 开发者工具控制命令
            toggle_dev_tools,
            open_dev_tools,
            close_dev_tools,
            open_image_viewer,
            open_forum_window,
            open_text_in_new_window,
            get_original_message_content
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// 获取全局设置的命令
/// 
/// 从settings.json文件中读取全局设置，如果文件不存在则返回空的JSON对象
/// 同时检查用户头像文件是否存在，如果存在则在设置中添加userAvatarUrl字段
/// 
/// # 返回值
/// 返回包含全局设置的JSON值，如果读取或解析失败则返回错误信息
#[tauri::command]
async fn get_settings() -> Result<serde_json::Value, String> {
    let app_data_path = get_app_data_path();
    let settings_path = app_data_path.join("settings.json");

    let mut settings: serde_json::Value = if settings_path.exists() {
        let content = fs::read_to_string(&settings_path)
            .await
            .map_err(|e| format!("读取设置失败: {}", e))?;
        serde_json::from_str(&content).map_err(|e| format!("解析设置失败: {}", e))?
    } else {
        serde_json::json!({})
    };

    // 检查用户头像文件是否存在，如果存在则设置 userAvatarUrl
    let user_data_dir = app_data_path.join("UserData");
    let avatar_extensions = ["png", "jpg", "jpeg", "gif", "webp"];
    let mut user_avatar_url: Option<String> = None;

    // 检查 UserData 目录是否存在
    if user_data_dir.exists() {
        for ext in &avatar_extensions {
            let avatar_path = user_data_dir.join(format!("user_avatar.{}", ext));
            if avatar_path.exists() {
                // 使用当前时间作为缓存破坏参数，确保每次请求都唯一
                let current_timestamp = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map_err(|e| format!("获取时间戳失败: {}", e))?
                    .as_secs();
                // 构建相对路径：AppData/UserData/user_avatar.{ext}?t=timestamp
                user_avatar_url = Some(format!("AppData/UserData/user_avatar.{}?t={}", ext, current_timestamp));
                break;
            }
        }
    }
    
    // 兼容旧路径：如果新路径不存在，检查旧路径
    if user_avatar_url.is_none() {
        let user_dir = app_data_path.join("User");
        if user_dir.exists() {
            for ext in &avatar_extensions {
                let avatar_path = user_dir.join(format!("avatar.{}", ext));
                if avatar_path.exists() {
                    // 使用当前时间作为缓存破坏参数，确保每次请求都唯一
                    let current_timestamp = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map_err(|e| format!("获取时间戳失败: {}", e))?
                        .as_secs();
                    // 构建相对路径：AppData/User/avatar.{ext}?t=timestamp (兼容旧路径)
                    user_avatar_url = Some(format!("AppData/User/avatar.{}?t={}", ext, current_timestamp));
                    break;
                }
            }
        }
    }

    // 如果找到头像，更新设置中的 userAvatarUrl
    if let Some(url) = user_avatar_url {
        if let Some(obj) = settings.as_object_mut() {
            obj.insert(
                "userAvatarUrl".to_string(),
                serde_json::Value::String(url.clone()),
            );
        }
    }

    Ok(settings)
}

/// 保存全局设置的命令
/// 
/// 将提供的设置数据序列化并保存到settings.json文件中
/// 
/// # 参数
/// * `settings` - 要保存的设置数据
/// 
/// # 返回值
/// 成功时返回确认消息，失败时返回错误信息
#[tauri::command]
async fn save_settings(settings: serde_json::Value) -> Result<String, String> {
    let app_data_path = get_app_data_path();
    let settings_path = app_data_path.join("settings.json");

    let content =
        serde_json::to_string_pretty(&settings).map_err(|e| format!("序列化设置失败: {}", e))?;

    fs::write(&settings_path, content)
        .await
        .map_err(|e| format!("保存设置失败: {}", e))?;

    Ok("设置已保存".to_string())
}

/// 获取全局仓库的命令
/// 
/// 从global_prompt_warehouse.json文件中读取全局仓库数据
/// 
/// # 返回值
/// 返回包含全局仓库数据的JSON值向量，如果文件不存在则返回空向量，读取或解析失败则返回错误信息
#[tauri::command]
async fn get_global_warehouse() -> Result<Vec<serde_json::Value>, String> {
    let app_data_path = get_app_data_path();
    let warehouse_path = app_data_path.join("global_prompt_warehouse.json");

    if !warehouse_path.exists() {
        return Ok(vec![]);
    }

    let content = fs::read_to_string(&warehouse_path)
        .await
        .map_err(|e| format!("读取全局仓库失败: {}", e))?;

    let warehouse: Vec<serde_json::Value> =
        serde_json::from_str(&content).map_err(|e| format!("解析全局仓库失败: {}", e))?;

    Ok(warehouse)
}

/// 保存全局仓库的命令
/// 
/// 将提供的数据序列化并保存到global_prompt_warehouse.json文件中
/// 
/// # 参数
/// * `data` - 要保存的仓库数据
/// 
/// # 返回值
/// 成功时返回确认消息，失败时返回错误信息
#[tauri::command]
async fn save_global_warehouse(data: Vec<serde_json::Value>) -> Result<String, String> {
    let app_data_path = get_app_data_path();
    let warehouse_path = app_data_path.join("global_prompt_warehouse.json");

    let content =
        serde_json::to_string_pretty(&data).map_err(|e| format!("序列化全局仓库失败: {}", e))?;

    fs::write(&warehouse_path, content)
        .await
        .map_err(|e| format!("保存全局仓库失败: {}", e))?;

    Ok("全局仓库已保存".to_string())
}

/// 加载预设提示词列表的命令
/// 
/// 根据提供的路径加载预设提示词列表，支持相对路径和绝对路径
/// 
/// # 参数
/// * `preset_path` - 预设提示词文件的路径
/// 
/// # 返回值
/// 返回包含预设提示词信息的JSON值向量，读取失败则返回错误信息
#[tauri::command]
async fn load_preset_prompts(preset_path: String) -> Result<Vec<serde_json::Value>, String> {
    let app_data_path = get_app_data_path();
    let presets_dir = if preset_path.starts_with("./") || preset_path.starts_with("../") {
        // 相对路径，相对于 AppData
        app_data_path.join(preset_path.trim_start_matches("./"))
    } else if preset_path.contains("systemPromptPresets") {
        // 包含 systemPromptPresets 的路径
        app_data_path.join("systemPromptPresets")
    } else {
        // 绝对路径或相对于 AppData 的路径
        app_data_path.join(preset_path)
    };

    if !presets_dir.exists() {
        return Ok(vec![]);
    }

    let mut presets = Vec::new();
    let mut entries = fs::read_dir(&presets_dir)
        .await
        .map_err(|e| format!("读取预设目录失败: {}", e))?;

    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|e| format!("读取目录条目失败: {}", e))?
    {
        let path = entry.path();
        let metadata = fs::metadata(&path)
            .await
            .map_err(|e| format!("获取文件元数据失败: {}", e))?;

        if metadata.is_file() {
            if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                if ext == "md" {
                    let file_name = path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("")
                        .to_string();

                    presets.push(serde_json::json!({
                        "name": file_name.trim_end_matches(".md"),
                        "path": path.to_string_lossy().to_string()
                    }));
                }
            }
        }
    }

    Ok(presets)
}

/// 读取文件内容的命令
/// 
/// 读取指定路径文件的内容并返回字符串
/// 
/// # 参数
/// * `file_path` - 要读取的文件路径
/// 
/// # 返回值
/// 成功时返回文件内容字符串，文件不存在或读取失败时返回错误信息
#[tauri::command]
async fn read_file(file_path: String) -> Result<String, String> {
    let path = PathBuf::from(&file_path);

    if !path.exists() {
        return Err(format!("文件不存在: {}", file_path));
    }

    let content = fs::read_to_string(&path)
        .await
        .map_err(|e| format!("读取文件失败: {}", e))?;

    Ok(content)
}

/// 读取头像文件内容并返回base64编码的数据URL的命令
/// 
/// 读取头像文件并返回可通过HTTP访问的URL
/// 
/// # 参数
/// * `file_path` - 头像文件路径（必须在AppData或assets目录下）
/// 
/// # 返回值
/// 成功时返回文件的HTTP URL，路径不允许或文件不存在时返回错误信息
#[tauri::command]
async fn read_avatar_file(file_path: String) -> Result<String, String> {
    // 确保路径是允许的（在AppData或assets目录下）
    if !file_path.starts_with("AppData/") && !file_path.starts_with("assets/") {
        return Err("不允许访问此路径".to_string());
    }

    // 获取项目根目录并构造完整路径
    let project_root = get_project_root_internal();
    let full_path = if file_path.starts_with("AppData/") {
        // AppData路径相对于应用程序数据目录
        let app_data_path = get_app_data_path();
        app_data_path.join(file_path.strip_prefix("AppData/").unwrap_or(&file_path))
    } else {
        // assets路径相对于项目根目录
        project_root.join(&file_path)
    };

    // 检查文件是否存在
    if !full_path.exists() {
        return Err(format!("文件不存在: {}", file_path));
    }

    // 返回通过本地静态服务器访问的 HTTP URL（http://localhost:1421/AppData/...）
    let full_str = full_path.to_string_lossy().replace("\\", "/").to_string();
    if let Some(idx) = full_str.find("AppData/") {
        let relative = &full_str[idx..];
        Ok(format!("http://localhost:1421/{}", relative))
    } else if let Some(idx) = full_str.find("assets/") {
        let relative = &full_str[idx..];
        Ok(format!("http://localhost:1421/{}", relative))
    } else {
        // 回退为绝对路径的 HTTP 风格 URL（不推荐）
        Ok(format!("http://localhost:1421/{}", full_str))
    }
}

/// 保存壁纸图片的命令
/// 
/// 将提供的壁纸数据保存到指定目录，并返回可通过HTTP访问的URL
/// 
/// # 参数
/// * `file_name` - 壁纸文件名
/// * `file_data` - 壁纸文件的二进制数据
/// 
/// # 返回值
/// 成功时返回壁纸文件的HTTP URL，保存失败时返回错误信息
#[tauri::command]
async fn save_wallpaper(file_name: String, file_data: Vec<u8>) -> Result<String, String> {
    let project_root = get_project_root_internal();
    // 保存到项目内的 AppData 目录下的 assets/wallpaper，以便与运行时的 AppData 保持一致
    let wallpaper_dir = project_root.join("AppData").join("assets").join("wallpaper");

    // 确保目录存在
    fs::create_dir_all(&wallpaper_dir)
        .await
        .map_err(|e| format!("创建壁纸目录失败: {}", e))?;

    let wallpaper_path = wallpaper_dir.join(&file_name);

    fs::write(&wallpaper_path, file_data)
        .await
        .map_err(|e| format!("保存壁纸失败: {}", e))?;

    // 返回通过本地静态服务器访问的 HTTP URL（http://localhost:1421/AppData/...）
    let wallpaper_path_str = wallpaper_path.to_string_lossy().replace("\\", "/");
    if let Some(idx) = wallpaper_path_str.find("AppData/") {
        let relative = &wallpaper_path_str[idx..];
        Ok(format!("http://localhost:1421/{}", relative))
    } else {
        // 回退：返回绝对文件路径的 HTTP 风格 URL
        Ok(format!("http://localhost:1421/AppData/assets/wallpaper/{}", file_name))
    }
}

/// 写入日志到文件的命令
/// 
/// 将提供的消息写入到日志文件中，包含时间戳
/// 
/// # 参数
/// * `message` - 要写入的日志消息
/// 
/// # 返回值
/// 成功时返回Ok(())，失败时返回错误信息
#[tauri::command]
async fn write_log_message(message: &str) -> Result<(), String> {
    use std::io::Write;

    // 获取 AppData 路径
    let app_data_dir = std::env::current_dir()
        .map_err(|e| format!("无法获取当前目录: {}", e))?
        .join("AppData");

    // 创建 logs 目录
    let logs_dir = app_data_dir.join("logs");
    std::fs::create_dir_all(&logs_dir).map_err(|e| format!("创建日志目录失败: {}", e))?;

    // 日志文件路径
    let log_file_path = logs_dir.join("debug.log");

    // 格式化日志消息
    let timestamp = Local::now().format("[%Y-%m-%d %H:%M:%S]");
    let log_entry = format!(
        "{} {}
",
        timestamp, message
    );

    // 追加写入日志
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file_path)
        .map_err(|e| format!("打开日志文件失败: {}", e))?;

    file.write_all(log_entry.as_bytes())
        .map_err(|e| format!("写入日志文件失败: {}", e))?;

    Ok(())
}

/// 获取项目根目录（内部 helper）
/// 
/// 获取当前项目的根目录路径，用于定位项目资源
/// 在生产模式下，如果可执行文件在项目根目录，则直接返回当前目录
/// 
/// # 返回值
/// 返回表示项目根目录路径的PathBuf对象
fn get_project_root_internal() -> PathBuf {
    // 获取当前可执行文件的路径
    let exe_path = std::env::current_exe()
        .expect("无法获取可执行文件路径")
        .canonicalize()
        .expect("无法规范化路径");
    
    // 检查当前目录是否存在 styles 目录，如果存在则认为当前目录就是项目根目录（生产模式）
    let current_dir = exe_path.parent().unwrap_or(&exe_path).to_path_buf();
    if current_dir.join("styles").exists() {
        return current_dir;
    }
    
    // 获取项目根目录（假设可执行文件在 src-tauri/target/release 或 src-tauri/target/debug 中）
    let project_root = exe_path
        .parent()          // target/release or target/debug
        .and_then(|p| p.parent())  // target
        .and_then(|p| p.parent())  // src-tauri
        .and_then(|p| p.parent());  // project root
    
    project_root.map(|p| p.to_path_buf()).unwrap_or_else(|| PathBuf::from("."))
}

/// 获取项目根目录的命令
/// 
/// 供前端调用获取项目根目录路径的字符串表示
/// 
/// # 返回值
/// 返回项目根目录路径的字符串表示
#[tauri::command]
fn get_project_root() -> String {
    get_project_root_internal().to_string_lossy().to_string()
}

/// 获取壁纸缩略图的命令
/// 
/// 根据提供的壁纸路径生成并返回壁纸缩略图
/// 注意：目前实现只是简单地返回原路径
/// 
/// # 参数
/// * `wallpaper_path` - 壁纸文件路径
/// 
/// # 返回值
/// 成功时返回壁纸缩略图的路径，失败时返回错误信息


/// 生成壁纸缩略图的命令
/// 
/// 从原始壁纸图像生成小尺寸缩略图以加快加载速度
/// 
/// # 参数
/// * `wallpaper_path` - 原始壁纸文件的路径
/// 
/// # 返回值
/// 成功时返回缩略图文件路径，失败时返回错误信息
#[tauri::command]
async fn get_wallpaper_thumbnail(wallpaper_path: String) -> Result<String, String> {
    use image::io::Reader as ImageReader;
    use image::GenericImageView;
    
    // 获取项目根目录和AppData路径
    let app_data_path = get_app_data_path();
    let project_root = get_project_root_internal();
    
    // 解码壁纸路径
    let wallpaper_path_decoded = percent_decode_str(&wallpaper_path).decode_utf8_lossy().to_string();
    
    // 解析壁纸完整路径
    let wallpaper_full_path = if wallpaper_path_decoded.starts_with("AppData/") {
        // AppData 目录下的文件
        app_data_path.join(wallpaper_path_decoded.strip_prefix("AppData/").unwrap())
    } else if wallpaper_path_decoded.starts_with("assets/") {
        // 项目根目录下的 assets 文件
        project_root.join(&wallpaper_path_decoded)
    } else if wallpaper_path_decoded.starts_with("styles/") {
        // 项目根目录下的 styles 文件
        project_root.join(&wallpaper_path_decoded)
    } else {
        // 其他路径，尝试多个位置
        let path = PathBuf::from(&wallpaper_path_decoded);
        if path.exists() {
            path
        } else {
            // 尝试在项目根目录下查找
            let project_path = project_root.join(&wallpaper_path_decoded);
            if project_path.exists() {
                project_path
            } else {
                // 尝试在 AppData 下查找
                app_data_path.join(&wallpaper_path_decoded)
            }
        }
    };
    
    
    // 检查原图是否存在
    if !wallpaper_full_path.exists() {
        return Err(format!("原壁纸文件不存在: {}", wallpaper_full_path.display()));
    }
    
    // 生成缩略图缓存路径
    let thumbnail_dir = app_data_path.join("wallpaper_cache");
    tokio::fs::create_dir_all(&thumbnail_dir)
        .await
        .map_err(|e| format!("创建缩略图缓存目录失败: {}", e))?;
    
    // 生成缩略图文件名（使用原文件名 + _thumb）
    let original_file_stem = wallpaper_full_path
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "无法获取原文件名".to_string())?;
    let original_extension = wallpaper_full_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("jpg");
    
    let thumbnail_filename = format!("{}_thumb.{}", original_file_stem, original_extension);
    let thumbnail_path = thumbnail_dir.join(&thumbnail_filename);
    
    // 检查是否已有缓存的缩略图
    if thumbnail_path.exists() {
        return Ok(format!("AppData/wallpaper_cache/{}", thumbnail_filename));
    }
    
    // 读取原图
    let img = ImageReader::open(&wallpaper_full_path)
        .map_err(|e| format!("打开原图失败: {}", e))?
        .decode()
        .map_err(|e| format!("解码原图失败: {}", e))?;
    
    // 计算缩略图尺寸（保持宽高比，最大尺寸300px）
    let (width, height) = img.dimensions();
    let (new_width, new_height) = if width > height {
        if width > 300 {
            let scale = 300.0 / width as f32;
            ((width as f32 * scale) as u32, (height as f32 * scale) as u32)
        } else {
            (width, height)
        }
    } else {
        if height > 300 {
            let scale = 300.0 / height as f32;
            ((width as f32 * scale) as u32, (height as f32 * scale) as u32)
        } else {
            (width, height)
        }
    };
    
    // 调整图像尺寸
    let thumbnail = img.thumbnail(new_width, new_height);
    
    // 保存缩略图
    thumbnail
        .save_with_format(&thumbnail_path, image::ImageFormat::Jpeg.into())
        .map_err(|e| format!("保存缩略图失败: {}", e))?;
    
    Ok(format!("AppData/wallpaper_cache/{}", thumbnail_filename))
}

/// 获取 ComfyUI 工作流列表的命令
/// 
/// 获取并返回可用的 ComfyUI 工作流列表
/// 注意：目前实现返回一个空列表
/// 
/// # 返回值
/// 成功时返回ComfyUI工作流名称的字符串向量，失败时返回错误信息
#[tauri::command]
async fn get_comfyui_workflows() -> Result<Vec<String>, String> {
    // 这里应该实现获取 ComfyUI 工作流列表的逻辑
    // 目前我们返回一个空列表
    Ok(vec![])
}

/// 加载 ComfyUI 配置的命令
/// 
/// 加载并返回 ComfyUI 的配置信息
/// 注意：目前实现返回一个空对象
/// 
/// # 返回值
/// 成功时返回包含ComfyUI配置的JSON值，失败时返回错误信息
#[tauri::command]
async fn load_comfyui_config() -> Result<serde_json::Value, String> {
    // 这里应该实现加载 ComfyUI 配置的逻辑
    // 目前我们返回一个空对象
    Ok(serde_json::Value::Object(serde_json::Map::new()))
}

/// 保存 ComfyUI 配置的命令
/// 
/// 保存提供的 ComfyUI 配置信息
/// 注意：目前实现什么都不做
/// 
/// # 参数
/// * `_config` - 要保存的ComfyUI配置
/// 
/// # 返回值
/// 成功时返回Ok(())，失败时返回错误信息
#[tauri::command]
async fn save_comfyui_config(_config: serde_json::Value) -> Result<(), String> {
    // 这里应该实现保存 ComfyUI 配置的逻辑
    // 目前我们什么都不做
    Ok(())
}

/// 获取未读话题计数的命令（返回 { agents: {id: count}, groups: {id: count} }）
/// 
/// 遍历所有Agent和Group，统计每个实体中未读话题的数量
/// 
/// # 返回值
/// 成功时返回包含Agents和Groups未读计数的JSON对象，失败时返回错误信息
#[tauri::command]
async fn get_unread_topic_counts() -> Result<serde_json::Value, String> {
    let app_data_path = get_app_data_path();
    let mut agents_map = serde_json::Map::new();
    let mut groups_map = serde_json::Map::new();

    // Agents
    let agents_dir = app_data_path.join("Agents");
    if agents_dir.exists() {
        if let Ok(mut entries) = tokio::fs::read_dir(&agents_dir).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let path = entry.path();
                if path.is_dir() {
                    if let Some(agent_id) = path.file_name().and_then(|n| n.to_str()) {
                        let config_path = path.join("config.json");
                        let mut count = 0u64;
                        if config_path.exists() {
                            if let Ok(content) = tokio::fs::read_to_string(&config_path).await {
                                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                                    if let Some(arr) = json.get("topics").and_then(|t| t.as_array()) {
                                        for t in arr {
                                            if t.get("unread").and_then(|b| b.as_bool()) == Some(true) {
                                                count += 1;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        agents_map.insert(agent_id.to_string(), serde_json::Value::Number(count.into()));
                    }
                }
            }
        }
    }

    // Groups
    let groups_dir = app_data_path.join("AgentGroups");
    if groups_dir.exists() {
        if let Ok(mut entries) = tokio::fs::read_dir(&groups_dir).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let path = entry.path();
                if path.is_dir() {
                    if let Some(group_id) = path.file_name().and_then(|n| n.to_str()) {
                        let config_path = path.join("config.json");
                        let mut count = 0u64;
                        if config_path.exists() {
                            if let Ok(content) = tokio::fs::read_to_string(&config_path).await {
                                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                                    if let Some(arr) = json.get("topics").and_then(|t| t.as_array()) {
                                        for t in arr {
                                            if t.get("unread").and_then(|b| b.as_bool()) == Some(true) {
                                                count += 1;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        groups_map.insert(group_id.to_string(), serde_json::Value::Number(count.into()));
                    }
                }
            }
        }
    }

    let mut result = serde_json::Map::new();
    result.insert("agents".to_string(), serde_json::Value::Object(agents_map));
    result.insert("groups".to_string(), serde_json::Value::Object(groups_map));

    Ok(serde_json::Value::Object(result))
}

/// 创建新话题的命令
/// 
/// 为指定的Agent创建一个新的话题
/// 
/// # 参数
/// * `agent_id` - Agent的唯一标识符
/// * `topic_name` - 新话题的名称
/// * `_is_branch` - 是否为分支话题（未使用）
/// * `locked` - 话题是否锁定
/// 
/// # 返回值
/// 成功时返回新创建话题的信息，配置文件不存在、读取失败或写入失败时返回错误信息
#[tauri::command]
async fn create_new_topic(agent_id: String, topic_name: String, _is_branch: Option<bool>, locked: Option<bool>) -> Result<serde_json::Value, String> {
    let app_data_path = get_app_data_path();
    let config_path = app_data_path.join("Agents").join(&agent_id).join("config.json");
    if !config_path.exists() {
        return Err(format!("Agent {} 配置文件不存在", agent_id));
    }
    let content = tokio::fs::read_to_string(&config_path).await.map_err(|e| format!("读取Agent配置失败: {}", e))?;
    let mut json: serde_json::Value = serde_json::from_str(&content).map_err(|e| format!("解析Agent配置失败: {}", e))?;
    let mut topics = json.get_mut("topics").and_then(|t| t.as_array_mut()).cloned().unwrap_or_else(Vec::new);
    let id = format!("topic_{}", chrono::Utc::now().timestamp_millis());
    let topic_obj = serde_json::json!({
        "id": id,
        "name": topic_name,
        "createdAt": chrono::Utc::now().timestamp_millis(), // 使用毫秒级时间戳保持一致性
        "locked": locked.unwrap_or(true),
        "unread": false,
        "creatorSource": "user"
    });
    topics.push(topic_obj.clone());
    json.as_object_mut().unwrap().insert("topics".to_string(), serde_json::Value::Array(topics));
    let new_content = serde_json::to_string_pretty(&json).map_err(|e| format!("序列化失败: {}", e))?;
    tokio::fs::write(&config_path, new_content).await.map_err(|e| format!("写入Agent配置失败: {}", e))?;
    
    // 返回统一格式，与 create_group_topic 保持一致
    Ok(serde_json::json!({
        "success": true,
        "topicId": id
    }))
}

/// 删除话题的命令
/// 
/// 删除指定Agent的特定话题
/// 
/// # 参数
/// * `agent_id` - Agent的唯一标识符
/// * `topic_id` - 要删除话题的唯一标识符
/// 
/// # 返回值
/// 成功时返回 { success: true }，失败时返回 { success: false, error: "..." }
#[tauri::command]
async fn delete_topic(agent_id: String, topic_id: String) -> Result<serde_json::Value, String> {
    let app_data_path = get_app_data_path();
    let config_path = app_data_path.join("Agents").join(&agent_id).join("config.json");
    if !config_path.exists() {
        return Ok(serde_json::json!({ "success": false, "error": format!("Agent {} 配置文件不存在", agent_id) }));
    }
    let content = tokio::fs::read_to_string(&config_path).await.map_err(|e| format!("读取Agent配置失败: {}", e))?;
    let mut json: serde_json::Value = serde_json::from_str(&content).map_err(|e| format!("解析Agent配置失败: {}", e))?;
    let mut topics = json.get_mut("topics").and_then(|t| t.as_array_mut()).cloned().unwrap_or_else(Vec::new);
    let original_len = topics.len();
    topics.retain(|t| t.get("id").and_then(|v| v.as_str()) != Some(&topic_id));
    
    if topics.len() == original_len {
        return Ok(serde_json::json!({ "success": false, "error": "Topic 未找到" }));
    }
    
    json.as_object_mut().unwrap().insert("topics".to_string(), serde_json::Value::Array(topics.clone()));
    let new_content = serde_json::to_string_pretty(&json).map_err(|e| format!("序列化失败: {}", e))?;
    tokio::fs::write(&config_path, new_content).await.map_err(|e| format!("写入Agent配置失败: {}", e))?;
    Ok(serde_json::json!({ "success": true }))
}

/// 切换话题锁定状态的命令，返回新的状态
/// 
/// 切换指定Agent和话题的锁定状态
/// 
/// # 参数
/// * `agent_id` - Agent的唯一标识符
/// * `topic_id` - 话题的唯一标识符
/// 
/// # 返回值
/// 成功时返回 { success: true, locked: bool, message: "..." }，失败时返回 { success: false, error: "..." }
#[tauri::command]
async fn toggle_topic_lock(agent_id: String, topic_id: String) -> Result<serde_json::Value, String> {
    let app_data_path = get_app_data_path();
    let config_path = app_data_path.join("Agents").join(&agent_id).join("config.json");
    if !config_path.exists() {
        return Ok(serde_json::json!({ "success": false, "error": format!("Agent {} 配置文件不存在", agent_id) }));
    }
    let content = tokio::fs::read_to_string(&config_path).await.map_err(|e| format!("读取Agent配置失败: {}", e))?;
    let mut json: serde_json::Value = serde_json::from_str(&content).map_err(|e| format!("解析Agent配置失败: {}", e))?;
    if let Some(arr) = json.get_mut("topics").and_then(|t| t.as_array_mut()) {
        for t in arr.iter_mut() {
            if t.get("id").and_then(|v| v.as_str()) == Some(&topic_id) {
                let new_locked = !t.get("locked").and_then(|b| b.as_bool()).unwrap_or(true);
                t.as_object_mut().unwrap().insert("locked".to_string(), serde_json::Value::Bool(new_locked));
                let new_content = serde_json::to_string_pretty(&json).map_err(|e| format!("序列化失败: {}", e))?;
                tokio::fs::write(&config_path, new_content).await.map_err(|e| format!("写入Agent配置失败: {}", e))?;
                let message = if new_locked { "话题已锁定" } else { "话题已解锁" };
                return Ok(serde_json::json!({ "success": true, "locked": new_locked, "message": message }));
            }
        }
    }
    Ok(serde_json::json!({ "success": false, "error": "Topic 未找到" }))
}

/// 设置话题未读状态的命令，返回新的状态
/// 
/// 设置指定Agent和话题的未读状态
/// 
/// # 参数
/// * `agent_id` - Agent的唯一标识符
/// * `topic_id` - 话题的唯一标识符
/// * `unread` - 新的未读状态
/// 
/// # 返回值
/// 成功时返回 { success: true, unread: bool }，失败时返回 { success: false, error: "..." }
#[tauri::command]
async fn set_topic_unread(agent_id: String, topic_id: String, unread: bool) -> Result<serde_json::Value, String> {
    let app_data_path = get_app_data_path();
    let config_path = app_data_path.join("Agents").join(&agent_id).join("config.json");
    if !config_path.exists() {
        return Ok(serde_json::json!({ "success": false, "error": format!("Agent {} 配置文件不存在", agent_id) }));
    }
    let content = tokio::fs::read_to_string(&config_path).await.map_err(|e| format!("读取Agent配置失败: {}", e))?;
    let mut json: serde_json::Value = serde_json::from_str(&content).map_err(|e| format!("解析Agent配置失败: {}", e))?;
    if let Some(arr) = json.get_mut("topics").and_then(|t| t.as_array_mut()) {
        for t in arr.iter_mut() {
            if t.get("id").and_then(|v| v.as_str()) == Some(&topic_id) {
                t.as_object_mut().unwrap().insert("unread".to_string(), serde_json::Value::Bool(unread));
                let new_content = serde_json::to_string_pretty(&json).map_err(|e| format!("序列化失败: {}", e))?;
                tokio::fs::write(&config_path, new_content).await.map_err(|e| format!("写入Agent配置失败: {}", e))?;
                return Ok(serde_json::json!({ "success": true, "unread": unread }));
            }
        }
    }
    Ok(serde_json::json!({ "success": false, "error": "Topic 未找到" }))
}

/// 重命名话题的命令
/// 
/// 修改指定Agent和话题的名称
/// 
/// # 参数
/// * `agent_id` - Agent的唯一标识符
/// * `topic_id` - 话题的唯一标识符
/// * `new_name` - 新的话题名称
/// 
/// # 返回值
/// 成功时返回 { success: true }，配置文件不存在、读取失败、写入失败或话题未找到时返回 { success: false, error: "..." }
#[tauri::command]
async fn rename_topic(agent_id: String, topic_id: String, new_name: String) -> Result<serde_json::Value, String> {
    let app_data_path = get_app_data_path();
    let config_path = app_data_path.join("Agents").join(&agent_id).join("config.json");
    if !config_path.exists() {
        return Ok(serde_json::json!({ "success": false, "error": format!("Agent {} 配置文件不存在", agent_id) }));
    }
    let content = tokio::fs::read_to_string(&config_path).await.map_err(|e| format!("读取Agent配置失败: {}", e))?;
    let mut json: serde_json::Value = serde_json::from_str(&content).map_err(|e| format!("解析Agent配置失败: {}", e))?;
    if let Some(arr) = json.get_mut("topics").and_then(|t| t.as_array_mut()) {
        for t in arr.iter_mut() {
            if t.get("id").and_then(|v| v.as_str()) == Some(&topic_id) {
                t.as_object_mut().unwrap().insert("name".to_string(), serde_json::Value::String(new_name.clone()));
                let new_content = serde_json::to_string_pretty(&json).map_err(|e| format!("序列化失败: {}", e))?;
                tokio::fs::write(&config_path, new_content).await.map_err(|e| format!("写入Agent配置失败: {}", e))?;
                return Ok(serde_json::json!({ "success": true }));
            }
        }
    }
    Ok(serde_json::json!({ "success": false, "error": "Topic 未找到" }))
}

/// 导出话题为 Markdown 文件的命令
/// 
/// 将话题内容导出为 Markdown 文件，并显示保存对话框
/// 
/// # 参数
/// * `topic_name` - 话题名称
/// * `markdown_content` - 要导出的 Markdown 内容
/// 
/// # 返回值
/// 成功时返回 { success: true, path: "..." }，失败时返回 { success: false, error: "..." }
#[tauri::command]
async fn export_topic_as_markdown(topic_name: String, markdown_content: String) -> Result<serde_json::Value, String> {
    if topic_name.is_empty() || markdown_content.is_empty() {
        return Ok(serde_json::json!({ 
            "success": false, 
            "error": "缺少导出所需的必要信息（话题名称或内容）" 
        }));
    }
    
    // 清理文件名中的非法字符
    let safe_topic_name = topic_name.replace(['/', '\\', '?', '%', '*', ':', '|', '"', '<', '>'], "-");
    
    // 生成默认文件名（带时间戳）
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let default_filename = format!("{}-{}.md", safe_topic_name, timestamp);
    
    // 返回文件名和内容，让前端处理保存
    Ok(serde_json::json!({ 
        "success": true, 
        "filename": default_filename,
        "content": markdown_content
    }))
}

/// 切换开发者工具的命令
/// 
/// # 参数
/// * `window` - 要切换开发者工具的Tauri窗口对象
#[tauri::command]
fn toggle_dev_tools(window: tauri::WebviewWindow) {
    if window.is_devtools_open() {
        window.close_devtools();
    } else {
        window.open_devtools();
    }
}

/// 打开开发者工具的命令
/// 
/// # 参数
/// * `window` - 要打开开发者工具的Tauri窗口对象
#[tauri::command]
fn open_dev_tools(window: tauri::WebviewWindow) {
    window.open_devtools();
}

/// 关闭开发者工具的命令
/// 
/// # 参数
/// * `window` - 要关闭开发者工具的Tauri窗口对象
#[tauri::command]
fn close_dev_tools(window: tauri::WebviewWindow) {
    window.close_devtools();
}

/// 在应用中打开图片查看器窗口
#[tauri::command]
fn open_image_viewer(app: tauri::AppHandle, src: String, title: Option<String>, theme: Option<String>) -> Result<(), String> {
    // 生成唯一窗口标签
    let label = format!("image_viewer_{}", chrono::Local::now().timestamp());

    // 构造本地文件 URL 指向项目目录下的 modules/image-viewer.html
    let project_root = get_project_root_internal();
    let file_path = project_root.join("modules").join("image-viewer.html");
    let mut url = format!("file://{}", file_path.to_string_lossy());
    // 简单处理参数（只替换空格）
    let src_enc = src.replace(" ", "%20");
    let title_enc = title.clone().unwrap_or_default().replace(" ", "%20");
    let theme_enc = theme.unwrap_or_default().replace(" ", "%20");
    url = format!("{}?src={}&title={}&theme={}", url, src_enc, title_enc, theme_enc);

    let window = tauri::WebviewWindowBuilder::new(&app, label.clone(), tauri::WebviewUrl::External(url.parse().map_err(|e| format!("url parse error: {}", e))?))
        .title(title.unwrap_or_else(|| "图片预览".to_string()))
        .inner_size(1000.0, 800.0)
        .min_inner_size(600.0, 500.0)
        .decorations(false)
        .visible(false)
        .build()
        .map_err(|e| format!("创建图片查看窗口失败: {}", e))?;

    let _ = window.show();
    Ok(())
}

/// 在应用中打开论坛窗口（复用单例）
#[tauri::command]
fn open_forum_window(app: tauri::AppHandle) -> Result<(), String> {
    // 如果已有窗口则显示并聚焦
    if let Some(existing) = app.get_webview_window("forum") {
        if !existing.is_visible().unwrap_or(true) {
            let _ = existing.show();
        }
        let _ = existing.set_focus();
        return Ok(());
    }

    // 否则创建新窗口，加载 modules/Forummodules/forum.html
    let project_root = get_project_root_internal();
    let file_path = project_root.join("modules").join("Forummodules").join("forum.html");
    let url = format!("file://{}", file_path.to_string_lossy());

    let window = tauri::WebviewWindowBuilder::new(&app, "forum".to_string(), tauri::WebviewUrl::External(url.parse().map_err(|e| format!("url parse error: {}", e))?))
        .title("VCP 论坛")
        .inner_size(1200.0, 800.0)
        .min_inner_size(800.0, 600.0)
        .decorations(false)
        .visible(false)
        .build()
        .map_err(|e| format!("创建论坛窗口失败: {}", e))?;

    let _ = window.show();
    Ok(())
}

/// 在新窗口中打开文本阅读模式
#[tauri::command]
fn open_text_in_new_window(
    app: tauri::AppHandle,
    content: String,
    title: Option<String>,
    theme: Option<String>,
) -> Result<(), String> {
    use base64::{Engine as _, engine::general_purpose};
    
    // 生成唯一的窗口标签
    let window_label = format!("text-viewer-{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis());
    
    // Base64编码内容
    let base64_text = general_purpose::STANDARD.encode(content.as_bytes());
    
    // 构建URL
    let project_root = get_project_root_internal();
    let file_path = project_root.join("modules").join("text-viewer.html");
    let window_title = title.unwrap_or_else(|| "阅读模式".to_string());
    let theme_param = theme.unwrap_or_else(|| "dark".to_string());
    
    let url = format!(
        "file://{}?text={}&title={}&encoding=base64&theme={}",
        file_path.to_string_lossy(),
        urlencoding::encode(&base64_text),
        urlencoding::encode(&window_title),
        urlencoding::encode(&theme_param)
    );

    let window = tauri::WebviewWindowBuilder::new(
        &app,
        window_label,
        tauri::WebviewUrl::External(url.parse().map_err(|e| format!("url parse error: {}", e))?)
    )
        .title(&window_title)
        .inner_size(800.0, 700.0)
        .min_inner_size(500.0, 400.0)
        .decorations(false)
        .visible(false)
        .build()
        .map_err(|e| format!("创建阅读窗口失败: {}", e))?;

    let _ = window.show();
    Ok(())
}

/// 获取原始消息内容（用于阅读模式）
#[tauri::command]
async fn get_original_message_content(
    id: String,
    r#type: String,
    topic_id: String,
    message_id: String,
) -> Result<serde_json::Value, String> {
    if id.is_empty() || r#type.is_empty() || topic_id.is_empty() || message_id.is_empty() {
        return Ok(serde_json::json!({
            "success": false,
            "error": "无效的参数"
        }));
    }

    let project_root = get_project_root_internal();
    let history_file = if r#type == "agent" {
        project_root
            .join(APP_DATA_DIR)
            .join(&id)
            .join("topics")
            .join(&topic_id)
            .join("history.json")
    } else if r#type == "group" {
        project_root
            .join(APP_DATA_DIR)
            .join(&id)
            .join("topics")
            .join(&topic_id)
            .join("history.json")
    } else {
        return Ok(serde_json::json!({
            "success": false,
            "error": "不支持的项目类型"
        }));
    };

    if !history_file.exists() {
        return Ok(serde_json::json!({
            "success": false,
            "error": "聊天历史文件不存在"
        }));
    }

    match fs::read_to_string(&history_file).await {
        Ok(content) => {
            match serde_json::from_str::<Vec<serde_json::Value>>(&content) {
                Ok(history) => {
                    // 查找指定的消息
                    for message in history {
                        if let Some(msg_id) = message.get("id").and_then(|v| v.as_str()) {
                            if msg_id == message_id {
                                if let Some(msg_content) = message.get("content") {
                                    return Ok(serde_json::json!({
                                        "success": true,
                                        "content": msg_content
                                    }));
                                }
                            }
                        }
                    }
                    Ok(serde_json::json!({
                        "success": false,
                        "error": "在历史记录中未找到该消息"
                    }))
                }
                Err(e) => Ok(serde_json::json!({
                    "success": false,
                    "error": format!("解析历史记录失败: {}", e)
                }))
            }
        }
        Err(e) => Ok(serde_json::json!({
            "success": false,
            "error": format!("读取历史文件失败: {}", e)
        }))
    }
}

