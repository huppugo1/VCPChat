use crate::{get_app_data_path, get_project_root_internal};
use tokio::fs;
use std::collections::HashMap;
use regex::Regex;

/// 获取主题目录路径（统一使用 AppData/assets/styles/themes/）
fn get_themes_dir() -> std::path::PathBuf {
    get_app_data_path().join("assets").join("styles").join("themes")
}

/// 解析 CSS 文件中的变量
fn parse_css_variables(css_content: &str) -> (HashMap<String, String>, HashMap<String, String>) {
    let mut dark_vars: HashMap<String, String> = HashMap::new();
    let mut light_vars: HashMap<String, String> = HashMap::new();
    
    // 匹配 :root { ... } 块（深色主题）
    let root_regex = Regex::new(r":root\s*\{([^}]+)\}").unwrap();
    // 匹配 body.light-theme { ... } 块（浅色主题）
    let light_regex = Regex::new(r"body\.light-theme\s*\{([^}]+)\}").unwrap();
    // 匹配 CSS 变量定义
    let var_regex = Regex::new(r"--([\w-]+)\s*:\s*([^;]+);").unwrap();
    
    // 解析深色主题变量
    if let Some(caps) = root_regex.captures(css_content) {
        let root_block = caps.get(1).map_or("", |m| m.as_str());
        for var_caps in var_regex.captures_iter(root_block) {
            let name = format!("--{}", var_caps.get(1).map_or("", |m| m.as_str()));
            let value = var_caps.get(2).map_or("", |m| m.as_str()).trim().to_string();
            dark_vars.insert(name, value);
        }
    }
    
    // 解析浅色主题变量
    if let Some(caps) = light_regex.captures(css_content) {
        let light_block = caps.get(1).map_or("", |m| m.as_str());
        for var_caps in var_regex.captures_iter(light_block) {
            let name = format!("--{}", var_caps.get(1).map_or("", |m| m.as_str()));
            let value = var_caps.get(2).map_or("", |m| m.as_str()).trim().to_string();
            light_vars.insert(name, value);
        }
    }
    
    (dark_vars, light_vars)
}

/// 确保主题目录存在，如果不存在则从项目目录复制默认主题
async fn ensure_themes_dir() -> Result<std::path::PathBuf, String> {
    let themes_dir = get_themes_dir();
    
    // 如果目录不存在，创建并复制默认主题
    if !themes_dir.exists() {
        fs::create_dir_all(&themes_dir)
            .await
            .map_err(|e| format!("创建主题目录失败: {}", e))?;
        
        // 尝试从项目根目录复制默认主题
        let project_root = get_project_root_internal();
        let project_themes_dir = project_root.join("styles").join("themes");
        
        if project_themes_dir.exists() {
            let mut entries = fs::read_dir(&project_themes_dir)
                .await
                .map_err(|e| format!("读取项目主题目录失败: {}", e))?;
            
            while let Some(entry) = entries.next_entry().await.ok().flatten() {
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) == Some("css") {
                    if let Some(file_name) = path.file_name() {
                        let dest_path = themes_dir.join(file_name);
                        let _ = fs::copy(&path, &dest_path).await;
                    }
                }
            }
        }
    }
    
    Ok(themes_dir)
}

/// 获取主题列表（包含解析后的变量）- 供前端 themes.js 使用
#[tauri::command]
pub async fn get_themes() -> Result<Vec<serde_json::Value>, String> {
    let themes_dir = ensure_themes_dir().await?;
    read_themes_with_variables(&themes_dir, "AppData/assets/styles/themes/").await
}

/// 从指定目录读取主题文件并解析变量
async fn read_themes_with_variables(themes_dir: &std::path::Path, prefix: &str) -> Result<Vec<serde_json::Value>, String> {
    let mut themes = Vec::new();
    
    if !themes_dir.exists() {
        return Ok(themes);
    }
    
    let mut entries = fs::read_dir(themes_dir)
        .await
        .map_err(|e| format!("读取主题目录失败: {}", e))?;

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
                if ext == "css" {
                    let file_name = path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("")
                        .to_string();

                    // 从文件名提取主题名称
                    let theme_name = file_name
                        .strip_prefix("themes")
                        .and_then(|s| s.strip_suffix(".css"))
                        .unwrap_or(&file_name)
                        .to_string();

                    // 读取并解析 CSS 文件
                    let css_content = fs::read_to_string(&path)
                        .await
                        .unwrap_or_default();
                    
                    let (dark_vars, light_vars) = parse_css_variables(&css_content);
                    
                    // 转换为 JSON 对象
                    let dark_json: serde_json::Map<String, serde_json::Value> = dark_vars
                        .into_iter()
                        .map(|(k, v)| (k, serde_json::Value::String(v)))
                        .collect();
                    
                    let light_json: serde_json::Map<String, serde_json::Value> = light_vars
                        .into_iter()
                        .map(|(k, v)| (k, serde_json::Value::String(v)))
                        .collect();

                    themes.push(serde_json::json!({
                        "id": file_name.trim_end_matches(".css"),
                        "fileName": file_name,
                        "name": theme_name,
                        "file": format!("{}{}", prefix, file_name),
                        "variables": {
                            "dark": dark_json,
                            "light": light_json
                        }
                    }));
                }
            }
        }
    }
    
    // 按名称排序
    themes.sort_by(|a, b| {
        let name_a = a["name"].as_str().unwrap_or("");
        let name_b = b["name"].as_str().unwrap_or("");
        name_a.cmp(name_b)
    });
    
    Ok(themes)
}

/// 列出主题文件的命令（兼容旧接口）
#[tauri::command]
pub async fn list_themes_cmd() -> Result<Vec<serde_json::Value>, String> {
    list_themes().await
}

/// 列出主题文件（兼容旧接口）
#[tauri::command]
pub async fn list_themes() -> Result<Vec<serde_json::Value>, String> {
    let themes_dir = ensure_themes_dir().await?;
    read_themes_from_dir(&themes_dir, "AppData/assets/styles/themes/").await
}

/// 从指定目录读取主题文件的辅助函数（简化版，不解析变量）
async fn read_themes_from_dir(themes_dir: &std::path::Path, prefix: &str) -> Result<Vec<serde_json::Value>, String> {
    let mut themes = Vec::new();
    
    if !themes_dir.exists() {
        return Ok(themes);
    }
    
    let mut entries = fs::read_dir(themes_dir)
        .await
        .map_err(|e| format!("读取主题目录失败: {}", e))?;

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
                if ext == "css" {
                    let file_name = path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("")
                        .to_string();

                    let theme_name = file_name
                        .strip_prefix("themes")
                        .and_then(|s| s.strip_suffix(".css"))
                        .unwrap_or(&file_name)
                        .to_string();

                    themes.push(serde_json::json!({
                        "id": file_name.trim_end_matches(".css"),
                        "name": theme_name,
                        "file": format!("{}{}", prefix, file_name)
                    }));
                }
            }
        }
    }
    
    // 按名称排序
    themes.sort_by(|a, b| {
        let name_a = a["name"].as_str().unwrap_or("");
        let name_b = b["name"].as_str().unwrap_or("");
        name_a.cmp(name_b)
    });
    
    Ok(themes)
}

/// 删除主题文件的命令
#[tauri::command]
pub async fn delete_theme_cmd(theme_file: String) -> Result<(), String> {
    delete_theme(theme_file).await
}

/// 删除主题文件
#[tauri::command]
pub async fn delete_theme(theme_file: String) -> Result<(), String> {
    use percent_encoding::percent_decode_str;
    
    // 解码可能包含 URL 编码的文件名
    let decoded_theme_file = percent_decode_str(&theme_file)
        .decode_utf8_lossy()
        .to_string();
    
    // 提取纯文件名（去掉所有路径前缀）
    let pure_file_name = decoded_theme_file
        .replace('\\', "/")
        .split('/')
        .last()
        .unwrap_or(&decoded_theme_file)
        .to_string();
    
    // 统一从 AppData/assets/styles/themes/ 删除
    let themes_dir = get_themes_dir();
    let theme_path = themes_dir.join(&pure_file_name);
    
    if theme_path.exists() {
        fs::remove_file(&theme_path)
            .await
            .map_err(|e| format!("删除主题文件失败: {}", e))?;
        Ok(())
    } else {
        Err(format!("主题文件不存在: {}", theme_file))
    }
}

/// 保存主题文件的命令
#[tauri::command]
pub async fn save_theme_cmd(theme_file: String, content: String) -> Result<(), String> {
    save_theme(theme_file, content).await
}

/// 保存主题文件
#[tauri::command]
pub async fn save_theme(theme_file: String, content: String) -> Result<(), String> {
    use percent_encoding::percent_decode_str;
    
    // 解码可能包含 URL 编码的文件名
    let decoded_theme_file = percent_decode_str(&theme_file)
        .decode_utf8_lossy()
        .to_string();
    
    // 提取纯文件名
    let pure_file_name = decoded_theme_file
        .replace('\\', "/")
        .split('/')
        .last()
        .unwrap_or(&decoded_theme_file)
        .to_string();
    
    // 统一保存到 AppData/assets/styles/themes/
    let themes_dir = ensure_themes_dir().await?;
    let theme_path = themes_dir.join(&pure_file_name);

    fs::write(&theme_path, content)
        .await
        .map_err(|e| format!("保存主题文件失败: {}", e))?;

    Ok(())
}

/// 应用主题的命令
#[tauri::command]
pub async fn apply_theme_cmd(theme_file: String) -> Result<String, String> {
    apply_theme(theme_file).await
}

/// 应用主题
#[tauri::command]
pub async fn apply_theme(theme_file: String) -> Result<String, String> {
    use percent_encoding::percent_decode_str;
    
    // 解码可能包含 URL 编码的文件名
    let decoded_theme_file = percent_decode_str(&theme_file)
        .decode_utf8_lossy()
        .to_string();
    
    // 提取纯文件名
    let pure_file_name = decoded_theme_file
        .replace('\\', "/")
        .replace("styles/themes/", "")
        .replace("assets/styles/themes/", "")
        .replace("AppData/assets/styles/themes/", "")
        .split('/')
        .last()
        .unwrap_or(&decoded_theme_file)
        .to_string();
    
    // 统一从 AppData/assets/styles/themes/ 读取
    let themes_dir = ensure_themes_dir().await?;
    let theme_path = themes_dir.join(&pure_file_name);
    
    if theme_path.exists() {
        let content = fs::read_to_string(&theme_path)
            .await
            .map_err(|e| format!("读取主题文件失败: {}", e))?;
        Ok(content)
    } else {
        Err(format!("主题文件不存在: {}", theme_file))
    }
}
