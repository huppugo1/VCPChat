// Agent 和 Topic 结构体定义
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct Attachment {
    pub id: String,
    pub file_name: String,
    pub file_path: String,
    pub file_type: String, // "image", "audio", "video", "document"
    pub size: u64,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct Message {
    pub id: String,
    pub role: String, // "user", "assistant", "system"
    pub content: String,
    pub timestamp: u64,
    #[serde(default)]
    pub attachments: Option<Vec<Attachment>>,
    // 可选字段
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub is_thinking: Option<bool>,
    #[serde(rename = "avatarUrl", default)]
    pub avatar_url: Option<String>,
    #[serde(rename = "isGroupMessage", default)]
    pub is_group_message: Option<bool>,
    #[serde(rename = "agentId", default)]
    pub agent_id: Option<String>,
    #[serde(rename = "finishReason", default)]
    pub finish_reason: Option<String>,
}
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct Topic {
    pub id: String,
    pub name: String,
    #[serde(rename = "createdAt")]
    pub created_at: u64,
    #[serde(default)]
    pub locked: bool, // 是否锁定
    #[serde(default)]
    pub unread: bool, // 是否有未读消息
    #[serde(rename = "creatorSource", default)]
    pub creator_source: String, // 创建来源
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct Agent {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_calculated_color: Option<String>,
    pub topics: Vec<Topic>,
    #[serde(flatten)]
    pub config: serde_json::Map<String, serde_json::Value>,
}

use crate::get_app_data_path;
use indexmap::IndexMap;
use serde_json;
use std::path::Path;
use tokio::fs;
use uuid::Uuid;

/// Tauri 命令实现

/// 获取所有 Agents 的命令
/// 
/// 获取系统中所有 Agent 的列表
/// 
/// # 返回值
/// 成功时返回 Agent 列表，失败时返回错误信息
#[tauri::command]
pub async fn get_agents() -> Result<Vec<Agent>, String> {
    get_agents_impl().await
}

/// 获取 Agent 配置的命令
/// 
/// 根据提供的 Agent ID 获取其配置信息
/// 
/// # 参数
/// * `agent_id` - Agent 的唯一标识符
/// 
/// # 返回值
/// 成功时返回 Agent 的配置信息，失败时返回错误信息
#[tauri::command]
pub async fn get_agent_config(agent_id: String) -> Result<serde_json::Value, String> {
    get_agent_config_impl(agent_id).await
}

/// 获取 Agent 话题的命令
/// 
/// 根据提供的 Agent ID 获取其所有话题列表
/// 
/// # 参数
/// * `agent_id` - Agent 的唯一标识符
/// 
/// # 返回值
/// 成功时返回 Agent 的话题列表，失败时返回错误信息
#[tauri::command]
pub async fn get_agent_topics(agent_id: String) -> Result<Vec<Topic>, String> {
    get_agent_topics_impl(agent_id).await
}

/// 辅助函数：保持字段顺序的 JSON 序列化（用于 Agent）
/// 
/// 将 IndexMap 中的配置数据序列化为 JSON 字符串，保持特定字段顺序
/// 
/// # 参数
/// * `config` - 包含配置数据的 IndexMap
/// 
/// # 返回值
/// 成功时返回格式化的 JSON 字符串，转换或序列化失败时返回错误信息
fn serialize_with_order(config: &IndexMap<String, serde_json::Value>) -> Result<String, String> {
    // 定义字段顺序（按照用户提供的示例顺序）
    let field_order = vec![
        "name",
        "systemPrompt",
        "model",
        "temperature",
        "contextTokenLimit",
        "maxOutputTokens",
        "topics",
        "disableCustomColors",
        "useThemeColorsInChat",
        "originalSystemPrompt",
        "streamOutput",
        "ttsVoicePrimary",
        "ttsRegexPrimary",
        "ttsVoiceSecondary",
        "ttsRegexSecondary",
        "ttsSpeed",
        "avatarBorderColor",
        "nameTextColor",
        "customCss",
        "cardCss",
        "chatCss",
        "uiCollapseStates",
        "promptMode",
        "advancedSystemPrompt",
        "presetSystemPrompt",
        "selectedPreset",
    ];

    // 使用 IndexMap 保持顺序
    let mut ordered_config: IndexMap<String, serde_json::Value> = IndexMap::new();

    // 先按定义的顺序添加字段
    for field in &field_order {
        if let Some(value) = config.get(*field) {
            ordered_config.insert(field.to_string(), value.clone());
        }
    }

    // 添加其他未在顺序列表中的字段（保持原有顺序）
    for (k, v) in config {
        if !field_order.contains(&k.as_str()) {
            ordered_config.insert(k.clone(), v.clone());
        }
    }

    // 将 IndexMap 转换为 serde_json::Value 以便序列化
    let value: serde_json::Value =
        serde_json::to_value(&ordered_config).map_err(|e| format!("转换配置失败: {}", e))?;

    // 序列化为 JSON（使用自定义格式化）
    serde_json::to_string_pretty(&value).map_err(|e| format!("序列化配置失败: {}", e))
}

/// Moved implementation: get_agent_topics
/// 
/// 获取指定 Agent 的话题列表的具体实现
/// 
/// # 参数
/// * `agent_id` - Agent 的唯一标识符
/// 
/// # 返回值
/// 成功时返回 Agent 的话题列表，参数为空、配置文件不存在、读取失败或解析失败时返回错误信息
pub async fn get_agent_topics_impl(agent_id: String) -> Result<Vec<Topic>, String> {
    if agent_id.is_empty() {
        return Err("agentId 不能为空".to_string());
    }

    let app_data_path = crate::get_app_data_path();
    let config_path = app_data_path
        .join("Agents")
        .join(&agent_id)
        .join("config.json");

    if !config_path.exists() {
        return Err("Agent配置文件不存在".to_string());
    }

    // 读取配置文件（处理 UTF-8 错误）
    let config_content = match tokio::fs::read_to_string(&config_path).await {
        Ok(content) => content,
        Err(e) => {
            return Err(format!("读取Agent配置失败 (UTF-8错误): {}", e));
        }
    };

    // 解析配置
    let config_json: serde_json::Value = match serde_json::from_str(&config_content) {
        Ok(json) => json,
        Err(e) => {
            return Err(format!("解析Agent配置失败: {}", e));
        }
    };

    // 提取topics
    let topics = if let Some(topics_array) = config_json.get("topics").and_then(|t| t.as_array()) {
        topics_array
            .iter()
            .filter_map(|t| serde_json::from_value::<Topic>(t.clone()).ok())
            .collect()
    } else {
        // 如果没有topics，创建一个默认topic
        vec![Topic {
            id: "default".to_string(),
            name: "主要对话".to_string(),
            created_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            locked: true,
            unread: false,
            creator_source: "system".to_string(),
        }]
    };

    Ok(topics)
}

/// 创建新 Agent 的命令
/// 
/// 根据提供的名称和初始配置创建一个新的 Agent
/// 
/// # 参数
/// * `agent_name` - Agent 的名称
/// * `initial_config` - Agent 的初始配置（可选）
/// 
/// # 返回值
/// 成功时返回新创建的 Agent 对象，目录创建失败或写入配置失败时返回错误信息
#[tauri::command]
pub async fn create_agent(agent_name: String, initial_config: Option<serde_json::Value>) -> Result<Agent, String> {
    create_agent_impl(agent_name, initial_config).await
}

/// Moved implementation: create_agent
/// 
/// 创建新 Agent 的具体实现
/// 
/// # 参数
/// * `agent_name` - Agent 的名称
/// * `initial_config` - Agent 的初始配置（可选）
/// 
/// # 返回值
/// 成功时返回新创建的 Agent 对象，目录创建失败或写入配置失败时返回错误信息
pub async fn create_agent_impl(
    agent_name: String,
    initial_config: Option<serde_json::Value>,
) -> Result<Agent, String> {
    let app_data_path = get_app_data_path();
    let agents_dir = app_data_path.join("Agents");

    // 确保目录存在
    if !agents_dir.exists() {
        fs::create_dir_all(&agents_dir)
            .await
            .map_err(|e| format!("创建Agents目录失败: {}", e))?;
    }

    // 生成唯一的 Agent ID（基于时间戳和随机数）
    let agent_id = format!(
        "agent_{}_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis(),
        Uuid::new_v4()
            .to_string()
            .chars()
            .take(8)
            .collect::<String>()
    );

    let agent_dir = agents_dir.join(&agent_id);
    fs::create_dir_all(&agent_dir)
        .await
        .map_err(|e| format!("创建Agent目录失败: {}", e))?;

    // 创建默认话题
    let default_topic = Topic {
        id: "default".to_string(),
        name: "主要对话".to_string(),
        created_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs(),
        locked: true,
        unread: false,
        creator_source: "system".to_string(),
    };

    // 构建配置对象（使用 IndexMap 保持顺序）
    let mut config = IndexMap::new();
    config.insert(
        "name".to_string(),
        serde_json::Value::String(agent_name.clone()),
    );
    config.insert(
        "systemPrompt".to_string(),
        serde_json::Value::String("".to_string()),
    );
    config.insert(
        "model".to_string(),
        serde_json::Value::String("qwen3-max-preview".to_string()),
    );
    config.insert(
        "temperature".to_string(),
        serde_json::Value::Number(serde_json::Number::from_f64(0.7).expect("无效的温度值")),
    );
    config.insert(
        "contextTokenLimit".to_string(),
        serde_json::Value::Number(1000000.into()),
    );
    config.insert(
        "maxOutputTokens".to_string(),
        serde_json::Value::Number(60000.into()),
    );
    config.insert(
        "topics".to_string(),
        serde_json::to_value(vec![&default_topic]).map_err(|e| format!("序列化话题失败: {}", e))?,
    );
    config.insert(
        "disableCustomColors".to_string(),
        serde_json::Value::Bool(true),
    );
    config.insert(
        "useThemeColorsInChat".to_string(),
        serde_json::Value::Bool(true),
    );
    config.insert(
        "originalSystemPrompt".to_string(),
        serde_json::Value::String("".to_string()),
    );
    config.insert("streamOutput".to_string(), serde_json::Value::Bool(true));
    config.insert(
        "ttsVoicePrimary".to_string(),
        serde_json::Value::String("".to_string()),
    );
    config.insert(
        "ttsRegexPrimary".to_string(),
        serde_json::Value::String("".to_string()),
    );
    config.insert(
        "ttsVoiceSecondary".to_string(),
        serde_json::Value::String("".to_string()),
    );

    // 应用初始配置（如果有）
    if let Some(initial) = initial_config {
        if let Some(initial_obj) = initial.as_object() {
            for (key, value) in initial_obj {
                config.insert(key.clone(), value.clone());
            }
        }
    }

    // 写入配置文件
    let config_json = serialize_with_order(&config)?;
    let config_path = agent_dir.join("config.json");
    fs::write(&config_path, config_json)
        .await
        .map_err(|e| format!("写入配置失败: {}", e))?;

    // 构造返回的 Agent 对象
    let agent = Agent {
        id: agent_id.clone(),
        name: agent_name,
        avatar_url: None,
        avatar_calculated_color: None,
        topics: vec![default_topic],
        config: config.into_iter().collect(),
    };

    Ok(agent)
}

/// 删除 Agent 的命令
/// 
/// 根据提供的 Agent ID 删除对应的 Agent 及其相关数据
/// 
/// # 参数
/// * `agent_id` - 要删除的 Agent 的唯一标识符
/// 
/// # 返回值
/// 成功时返回确认消息，目录删除失败时返回错误信息
#[tauri::command]
pub async fn delete_agent(agent_id: String) -> Result<String, String> {
    delete_agent_impl(agent_id).await
}

/// Moved implementation: delete_agent
/// 
/// 删除 Agent 的具体实现
/// 
/// # 参数
/// * `agent_id` - 要删除的 Agent 的唯一标识符
/// 
/// # 返回值
/// 成功时返回确认消息，目录删除失败时返回错误信息
pub async fn delete_agent_impl(agent_id: String) -> Result<String, String> {
    let app_data_path = get_app_data_path();
    let agent_dir = app_data_path.join("Agents").join(&agent_id);
    let user_data_agent_dir = app_data_path.join("UserData").join(&agent_id);

    // 删除 Agent 目录
    if agent_dir.exists() {
        fs::remove_dir_all(&agent_dir)
            .await
            .map_err(|e| format!("删除Agent目录失败: {}", e))?;
    }

    // 删除 UserData 目录
    if user_data_agent_dir.exists() {
        fs::remove_dir_all(&user_data_agent_dir)
            .await
            .map_err(|e| format!("删除UserData目录失败: {}", e))?;
    }

    Ok(format!("Agent {} 已删除", agent_id))
}

/// 更新 Agent 配置的命令
/// 
/// 根据提供的 Agent ID 和配置更新内容来更新 Agent 的配置
/// 
/// # 参数
/// * `agent_id` - Agent 的唯一标识符
/// * `config_updates` - 包含更新内容的 JSON 值
/// 
/// # 返回值
/// 成功时返回更新后的 Agent 对象，Agent 不存在、读取配置失败、解析配置失败或写入配置失败时返回错误信息
#[tauri::command]
pub async fn update_agent_config(agent_id: String, config_updates: serde_json::Value) -> Result<Agent, String> {
    update_agent_config_impl(agent_id, config_updates).await
}

/// Moved implementation: update_agent_config
/// 
/// 更新 Agent 配置的具体实现
/// 
/// # 参数
/// * `agent_id` - Agent 的唯一标识符
/// * `config_updates` - 包含更新内容的 JSON 值
/// 
/// # 返回值
/// 成功时返回更新后的 Agent 对象，Agent 不存在、读取配置失败、解析配置失败或写入配置失败时返回错误信息
pub async fn update_agent_config_impl(
    agent_id: String,
    config_updates: serde_json::Value,
) -> Result<Agent, String> {
    let app_data_path = get_app_data_path();
    let config_path = app_data_path
        .join("Agents")
        .join(&agent_id)
        .join("config.json");

    if !config_path.exists() {
        return Err(format!("Agent {} 不存在", agent_id));
    }

    // 读取现有配置（处理 UTF-8 错误）
    let config_content = match fs::read_to_string(&config_path).await {
        Ok(content) => content,
        Err(e) => {
            return Err(format!("读取配置失败 (UTF-8错误): {}", e));
        }
    };

    // 读取配置并解析（启用 preserve_order 后，serde_json::Map 内部使用 IndexMap 保持顺序）
    let config_value: serde_json::Value = match serde_json::from_str(&config_content) {
        Ok(json) => json,
        Err(e) => {
            return Err(format!("解析配置失败: {}", e));
        }
    };

    // 提取 Object 部分（启用 preserve_order 后，内部已经是 IndexMap）
    let config: serde_json::Map<String, serde_json::Value> = match config_value {
        serde_json::Value::Object(map) => map,
        _ => {
            return Err("配置格式错误：不是有效的 JSON 对象".to_string());
        }
    };

    // 转换为 IndexMap 以便后续操作（启用 preserve_order 后，config 内部已经是 IndexMap）
    // 但为了类型安全，我们需要显式转换
    let mut config: IndexMap<String, serde_json::Value> = config.into_iter().collect();

    // 处理 stripRegexes（单独保存到 regex_rules.json）
    let regex_path = app_data_path
        .join("Agents")
        .join(&agent_id)
        .join("regex_rules.json");
    if let Some(updates_obj) = config_updates.as_object() {
        if let Some(strip_regexes) = updates_obj.get("stripRegexes") {
            // 保存到 regex_rules.json
            if let Some(regex_array) = strip_regexes.as_array() {
                if !regex_array.is_empty() {
                    let regex_json = serde_json::to_string_pretty(strip_regexes)
                        .map_err(|e| format!("序列化正则规则失败: {}", e))?;
                    fs::write(&regex_path, regex_json)
                        .await
                        .map_err(|e| format!("写入正则规则文件失败: {}", e))?;
                } else {
                    // 如果数组为空，删除文件
                    if regex_path.exists() {
                        fs::remove_file(&regex_path)
                            .await
                            .map_err(|e| format!("删除正则规则文件失败: {}", e))?;
                    }
                }
            }
        }
    }

    // 合并更新（排除 stripRegexes，因为它已经单独保存了）
    // 使用 IndexMap 的 insert 方法，它会保持插入顺序
    if let Some(updates_obj) = config_updates.as_object() {
        for (k, v) in updates_obj {
            // 保留 topics 字段不变，stripRegexes 单独处理
            if k != "topics" && k != "stripRegexes" {
                // 如果字段已存在，先移除再插入，以保持更新后的顺序
                // 使用 shift_remove 保持顺序（移除后其他元素向前移动）
                config.shift_remove(k);
                config.insert(k.clone(), v.clone());
            }
        }
    }

    // 创建备份文件（在写入新配置之前）
    // 使用固定文件名 config.json.backup，如果存在就覆盖
    let backup_path = config_path
        .parent()
        .ok_or("无法获取配置文件目录")?
        .join("config.json.backup");

    // 复制当前配置文件到备份（如果备份文件已存在会被覆盖）
    let _ = fs::copy(&config_path, &backup_path).await;

    // 写回配置文件（保持字段顺序）
    let config_json = serialize_with_order(&config)?;
    fs::write(&config_path, config_json)
        .await
        .map_err(|e| format!("写入配置失败: {}", e))?;

    // 重新读取 Agent（包含 topics）
    let agents = get_agents().await?;
    let agent = agents
        .into_iter()
        .find(|a| a.id == agent_id)
        .ok_or_else(|| format!("找不到更新后的 Agent: {}", agent_id))?;

    Ok(agent)
}

/// 保存 Agent 头像的命令
/// 
/// 为指定的 Agent 保存头像文件
/// 
/// # 参数
/// * `agent_id` - Agent 的唯一标识符
/// * `avatar_data` - 头像文件的二进制数据
/// * `file_name` - 头像文件名
/// 
/// # 返回值
/// 成功时返回确认消息，Agent 不存在、不支持的文件格式或保存头像文件失败时返回错误信息
#[tauri::command]
pub async fn save_agent_avatar(agent_id: String, avatar_data: Vec<u8>, file_name: String) -> Result<String, String> {
    save_agent_avatar_impl(agent_id, avatar_data, file_name).await
}

/// Moved implementation: save_agent_avatar
/// 
/// 保存 Agent 头像的具体实现
/// 
/// # 参数
/// * `agent_id` - Agent 的唯一标识符
/// * `avatar_data` - 头像文件的二进制数据
/// * `file_name` - 头像文件名
/// 
/// # 返回值
/// 成功时返回确认消息，Agent 不存在、不支持的文件格式或保存头像文件失败时返回错误信息
pub async fn save_agent_avatar_impl(
    agent_id: String,
    avatar_data: Vec<u8>,
    file_name: String,
) -> Result<String, String> {
    let app_data_path = get_app_data_path();
    let agent_dir = app_data_path.join("Agents").join(&agent_id);

    if !agent_dir.exists() {
        return Err(format!("Agent {} 不存在", agent_id));
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
        let old_avatar_path = agent_dir.join(format!("avatar.{}", old_ext));
        if old_avatar_path.exists() {
            let _ = fs::remove_file(&old_avatar_path).await;
        }
    }

    // 保存新头像文件（统一使用 avatar.png）
    let avatar_path = agent_dir.join("avatar.png");
    fs::write(&avatar_path, avatar_data)
        .await
        .map_err(|e| format!("保存头像文件失败: {}", e))?;

    Ok("头像保存成功".to_string())
}

/// Moved implementation: get_agents
/// 
/// 获取所有 Agents 的具体实现
/// 
/// # 返回值
/// 成功时返回 Agent 列表，目录创建失败或读取目录失败时返回错误信息
pub async fn get_agents_impl() -> Result<Vec<Agent>, String> {
    let app_data_path = crate::get_app_data_path();
    let agents_dir = app_data_path.join("Agents");

    // Ensure directory exists
    if !agents_dir.exists() {
        tokio::fs::create_dir_all(&agents_dir)
            .await
            .map_err(|e| format!("创建Agents目录失败: {}", e))?;
        return Ok(vec![]);
    }

    let mut agents = Vec::new();
    let mut entries = tokio::fs::read_dir(&agents_dir)
        .await
        .map_err(|e| format!("读取Agents目录失败: {}", e))?;

    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|e| format!("遍历Agents目录失败: {}", e))?
    {
        let path = entry.path();
        if path.is_dir() {
            let agent_id = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
            if agent_id.is_empty() {
                continue;
            }
            let config_path = path.join("config.json");
            if config_path.exists() {
                let config_content = match tokio::fs::read_to_string(&config_path).await {
                    Ok(c) => c,
                    Err(_) => continue,
                };
                let config_json: serde_json::Value = match serde_json::from_str(&config_content) {
                    Ok(j) => j,
                    Err(_) => continue,
                };
                let topics = if let Some(arr) = config_json.get("topics").and_then(|t| t.as_array()) {
                    arr.iter().filter_map(|t| serde_json::from_value::<Topic>(t.clone()).ok()).collect()
                } else {
                    vec![Topic {
                        id: "default".to_string(),
                        name: "主要对话".to_string(),
                        created_at: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs(),
                        locked: true,
                        unread: false,
                        creator_source: "system".to_string(),
                    }]
                };
                let name = config_json.get("name").and_then(|n| n.as_str()).unwrap_or(&agent_id).to_string();
                let avatar_url = {
                    let avatar_path = path.join("avatar.png");
                    if avatar_path.exists() {
                        Some(format!("AppData/Agents/{}/avatar.png", agent_id))
                    } else {
                        None
                    }
                };
                let avatar_calculated_color = config_json.get("avatarCalculatedColor").and_then(|c| c.as_str()).map(|s| s.to_string());
                let mut other_config = serde_json::Map::new();
                if let Some(obj) = config_json.as_object() {
                    for (k, v) in obj {
                        if k != "topics" && k != "name" && k != "avatarUrl" && k != "avatarCalculatedColor" {
                            other_config.insert(k.clone(), v.clone());
                        }
                    }
                }
                agents.push(Agent {
                    id: agent_id,
                    name,
                    avatar_url,
                    avatar_calculated_color,
                    topics,
                    config: other_config,
                });
            }
        }
    }
    Ok(agents)
}

/// Moved implementation: get_agent_config
/// 
/// 获取指定 Agent 配置的具体实现
/// 
/// # 参数
/// * `agent_id` - Agent 的唯一标识符
/// 
/// # 返回值
/// 成功时返回 Agent 的配置信息，配置文件不存在、读取配置失败或解析配置失败时返回错误信息
pub async fn get_agent_config_impl(agent_id: String) -> Result<serde_json::Value, String> {
    let app_data_path = crate::get_app_data_path();
    let agent_dir = app_data_path.join("Agents").join(&agent_id);
    let config_path = agent_dir.join("config.json");
    if !config_path.exists() {
        return Err(format!("Agent {} 配置文件不存在", agent_id));
    }
    let config_content = tokio::fs::read_to_string(&config_path).await.map_err(|e| format!("读取Agent配置失败: {}", e))?;
    let mut config_json: serde_json::Value = serde_json::from_str(&config_content).map_err(|e| format!("解析Agent配置失败: {}", e))?;
    let avatar_url = {
        let avatar_path = agent_dir.join("avatar.png");
        if avatar_path.exists() {
            Some(format!("AppData/Agents/{}/avatar.png", agent_id))
        } else {
            let extensions = ["jpg", "jpeg", "gif"];
            let mut found = None;
            for ext in &extensions {
                let path = agent_dir.join(format!("avatar.{}", ext));
                if path.exists() {
                    found = Some(format!("AppData/Agents/{}/avatar.{}", agent_id, ext));
                    break;
                }
            }
            found
        }
    };
    if let Some(url) = avatar_url {
        if let Some(obj) = config_json.as_object_mut() {
            obj.insert("avatarUrl".to_string(), serde_json::Value::String(url));
        }
    }
    Ok(config_json)
}

