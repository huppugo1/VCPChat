use crate::get_app_data_path;
use serde::Serialize;
use std::path::Path;
use tokio::fs;

/// 用户头像保存结果
#[derive(Serialize)]
pub struct AvatarSaveResult {
    pub success: bool,
    #[serde(rename = "avatarUrl")]
    pub avatar_url: Option<String>,
    #[serde(rename = "needsColorExtraction")]
    pub needs_color_extraction: bool,
    pub error: Option<String>,
}

/// 保存用户头像的命令
/// 
/// 保存用户头像文件并更新相关配置
/// 
/// # 参数
/// * `avatar_data` - 头像文件的二进制数据
/// * `file_name` - 头像文件名
/// 
/// # 返回值
/// 成功时返回头像文件的相对路径，创建目录失败、不支持的文件格式或保存头像文件失败时返回错误信息
#[tauri::command]
pub async fn save_user_avatar_cmd(avatar_data: Vec<u8>, file_name: String) -> Result<AvatarSaveResult, String> {
    save_user_avatar_impl(avatar_data, file_name).await
}

/// 前端调用的保存用户头像命令 - 格式1: {name, type, buffer} (来自 global-settings-manager.js)
#[tauri::command]
pub async fn save_user_avatar(name: String, r#type: String, buffer: Vec<u8>) -> Result<AvatarSaveResult, String> {
    // 验证文件类型是否支持
    let allowed_types = vec!["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];
    if !allowed_types.contains(&r#type.as_str()) {
        return Ok(AvatarSaveResult {
            success: false,
            avatar_url: None,
            needs_color_extraction: false,
            error: Some(format!("不支持的文件类型: {}", r#type)),
        });
    }
    save_user_avatar_impl(buffer, name).await
}

/// 前端调用的保存用户头像命令 - 格式2: {avatarData, fileName} (来自 renderer.js)
#[tauri::command]
#[allow(dead_code)] // 在 renderer.js 中通过 invoke('save_user_avatar_legacy') 调用
pub async fn save_user_avatar_legacy(avatar_data: Vec<u8>, file_name: String) -> Result<AvatarSaveResult, String> {
    save_user_avatar_impl(avatar_data, file_name).await
}

/// 保存用户头像的具体实现
/// 
/// # 参数
/// * `avatar_data` - 头像文件的二进制数据
/// * `file_name` - 头像文件名
/// 
/// # 返回值
/// 成功时返回 AvatarSaveResult，失败时返回错误信息
pub async fn save_user_avatar_impl(avatar_data: Vec<u8>, file_name: String) -> Result<AvatarSaveResult, String> {
    let app_data_path = get_app_data_path();
    let user_data_dir = app_data_path.join("UserData");

    // 确保目录存在
    if !user_data_dir.exists() {
        fs::create_dir_all(&user_data_dir)
            .await
            .map_err(|e| format!("创建UserData目录失败: {}", e))?;
    }

    // 确定文件扩展名
    let ext = Path::new(&file_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png");

    // 允许的扩展名
    let allowed_extensions = vec!["png", "jpg", "jpeg", "gif", "webp"];
    let ext_lower = ext.to_lowercase();

    if !allowed_extensions.contains(&ext_lower.as_str()) {
        return Err(format!("不支持的文件格式: {}", ext));
    }

    // 删除旧的头像文件
    for old_ext in &allowed_extensions {
        let old_avatar_path = user_data_dir.join(format!("user_avatar.{}", old_ext));
        if old_avatar_path.exists() {
            let _ = fs::remove_file(&old_avatar_path).await;
        }
    }

    // 保存新头像文件（统一使用 user_avatar.png）
    let avatar_path = user_data_dir.join("user_avatar.png");
    fs::write(&avatar_path, avatar_data)
        .await
        .map_err(|e| format!("保存头像文件失败: {}", e))?;

    // 返回头像的相对路径，供前端使用
    let avatar_url = format!("AppData/UserData/user_avatar.png");

    // 更新 settings.json 中的 userAvatarUrl
    let settings_path = app_data_path.join("settings.json");
    if settings_path.exists() {
        if let Ok(content) = fs::read_to_string(&settings_path).await {
            if let Ok(mut settings) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(obj) = settings.as_object_mut() {
                    obj.insert(
                        "userAvatarUrl".to_string(),
                        serde_json::Value::String(avatar_url.clone()),
                    );
                    if let Ok(updated_content) = serde_json::to_string_pretty(&settings) {
                        let _ = fs::write(&settings_path, updated_content).await;
                    }
                }
            }
        }
    }

    Ok(AvatarSaveResult {
        success: true,
        avatar_url: Some(avatar_url),
        needs_color_extraction: true,
        error: None,
    })
}

/// 加载用户头像的命令
/// 
/// 读取已保存的用户头像文件
/// 
/// # 返回值
/// 成功时返回头像文件的URL，文件不存在时返回默认头像路径
#[tauri::command]
pub async fn load_user_avatar_cmd() -> Result<String, String> {
    load_user_avatar().await
}

/// Moved implementation: load_user_avatar
/// 
/// 加载用户头像的具体实现
/// 
/// # 返回值
/// 成功时返回头像文件的URL，文件不存在时返回默认头像路径
#[tauri::command]
pub async fn load_user_avatar() -> Result<String, String> {
    let app_data_path = get_app_data_path();
    let avatar_path = app_data_path.join("UserData").join("user_avatar.png");
    
    // 检查用户头像是否存在
    if avatar_path.exists() {
        // 返回头像的URL路径
        Ok("AppData/UserData/user_avatar.png".to_string())
    } else {
        // 如果用户头像不存在，返回默认头像路径
        Ok("assets/default_user_avatar.png".to_string())
    }
}