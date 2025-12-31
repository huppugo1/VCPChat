// AgentGroup 和 Topic 结构体定义
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
pub struct AgentGroup {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    #[serde(
        skip_serializing_if = "Option::is_none",
        rename = "avatarCalculatedColor"
    )]
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

/// Moved implementation: get_agent_groups
/// 
/// 获取所有 Agent Groups 的具体实现
/// 
/// # 返回值
/// 成功时返回 AgentGroup 列表，目录创建失败或读取目录失败时返回错误信息
#[tauri::command]
pub async fn get_agent_groups() -> Result<Vec<AgentGroup>, String> {
    let app_data_path = crate::get_app_data_path();
    let groups_dir = app_data_path.join("AgentGroups");

    // Ensure directory exists
    if !groups_dir.exists() {
        tokio::fs::create_dir_all(&groups_dir)
            .await
            .map_err(|e| format!("创建AgentGroups目录失败: {}", e))?;
        return Ok(vec![]);
    }

    let mut groups = Vec::new();
    let mut entries = tokio::fs::read_dir(&groups_dir)
        .await
        .map_err(|e| format!("读取AgentGroups目录失败: {}", e))?;

    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|e| format!("遍历AgentGroups目录失败: {}", e))?
    {
        let path = entry.path();
        if path.is_dir() {
            let group_id = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
            if group_id.is_empty() {
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
                        name: "主要群聊".to_string(),
                        created_at: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs(),
                        locked: false,
                        unread: false,
                        creator_source: "system".to_string(),
                    }]
                };
                let name = config_json.get("name").and_then(|n| n.as_str()).unwrap_or(&group_id).to_string();
                let avatar_url = {
                    let avatar_path = path.join("avatar.png");
                    if avatar_path.exists() {
                        Some(format!("AppData/AgentGroups/{}/avatar.png", group_id))
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
                groups.push(AgentGroup {
                    id: group_id,
                    name,
                    avatar_url,
                    avatar_calculated_color,
                    topics,
                    config: other_config,
                });
            }
        }
    }
    Ok(groups)
}

/// Moved implementation: get_agent_group_config
/// 
/// 获取指定 Agent Group 配置的具体实现
/// 
/// # 参数
/// * `group_id` - Agent Group 的唯一标识符
/// 
/// # 返回值
/// 成功时返回 Agent Group 的配置信息，配置文件不存在、读取配置失败或解析配置失败时返回错误信息
#[tauri::command]
pub async fn get_agent_group_config(group_id: String) -> Result<serde_json::Value, String> {
    let app_data_path = crate::get_app_data_path();
    let group_dir = app_data_path.join("AgentGroups").join(&group_id);
    let config_path = group_dir.join("config.json");
    if !config_path.exists() {
        return Err(format!("Group {} 配置文件不存在", group_id));
    }
    let config_content = tokio::fs::read_to_string(&config_path).await.map_err(|e| format!("读取Group配置失败: {}", e))?;
    let mut config_json: serde_json::Value = serde_json::from_str(&config_content).map_err(|e| format!("解析Group配置失败: {}", e))?;
    let avatar_url = {
        let avatar_path = group_dir.join("avatar.png");
        if avatar_path.exists() {
            Some(format!("AppData/AgentGroups/{}/avatar.png", group_id))
        } else {
            let extensions = ["jpg", "jpeg", "gif"];
            let mut found = None;
            for ext in &extensions {
                let path = group_dir.join(format!("avatar.{}", ext));
                if path.exists() {
                    found = Some(format!("AppData/AgentGroups/{}/avatar.{}", group_id, ext));
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

/// 创建新群聊的命令
/// 
/// 根据提供的群聊名称和初始配置创建一个新的群聊
/// 
/// # 参数
/// * `group_name` - 群聊的名称
/// * `initial_config` - 群聊的初始配置（可选）
/// 
/// # 返回值
/// 成功时返回新创建的 AgentGroup 对象，创建目录失败或写入配置失败时返回错误信息
#[tauri::command]
pub async fn create_group_cmd(
    group_name: String,
    initial_config: Option<serde_json::Value>,
) -> Result<AgentGroup, String> {
    create_group(group_name, initial_config).await
}

/// (removed redundant wrapper - implementation below is exposed as command)

/// 删除群聊的命令
/// 
/// 根据提供的群聊 ID 删除对应的群聊及其相关数据
/// 
/// # 参数
/// * `group_id` - 要删除的群聊的唯一标识符
/// 
/// # 返回值
/// 成功时返回确认消息，删除目录失败时返回错误信息
#[tauri::command]
pub async fn delete_group_cmd(group_id: String) -> Result<String, String> {
    delete_group(group_id).await
}

/// 更新群聊配置的命令
/// 
/// 根据提供的群聊 ID 和配置更新内容来更新群聊的配置
/// 
/// # 参数
/// * `group_id` - 群聊的唯一标识符
/// * `config_updates` - 包含更新内容的 JSON 值
/// 
/// # 返回值
/// 成功时返回更新后的 AgentGroup 对象，群聊不存在、读取配置失败、解析配置失败或写入配置失败时返回错误信息
#[tauri::command]
pub async fn update_group_config_cmd(
    group_id: String,
    config_updates: serde_json::Value,
) -> Result<AgentGroup, String> {
    update_group_config(group_id, config_updates).await
}

/// 保存群组头像的命令
/// 
/// 为指定的群聊保存头像文件
/// 
/// # 参数
/// * `group_id` - 群聊的唯一标识符
/// * `avatar_data` - 头像文件的二进制数据
/// * `file_name` - 头像文件名
/// 
/// # 返回值
/// 成功时返回确认消息，群聊不存在、不支持的文件格式或保存头像文件失败时返回错误信息
#[tauri::command]
pub async fn save_group_avatar_cmd(
    group_id: String,
    avatar_data: Vec<u8>,
    file_name: String,
) -> Result<String, String> {
    save_group_avatar(group_id, avatar_data, file_name).await
}

/// Moved implementation: create_group
/// 
/// 创建新群聊的具体实现
/// 
/// # 参数
/// * `group_name` - 群聊的名称
/// * `initial_config` - 群聊的初始配置（可选）
/// 
/// # 返回值
/// 成功时返回新创建的 AgentGroup 对象，创建目录失败或写入配置失败时返回错误信息
#[tauri::command]
pub async fn create_group(
    group_name: String,
    initial_config: Option<serde_json::Value>,
) -> Result<AgentGroup, String> {
    let app_data_path = get_app_data_path();
    let groups_dir = app_data_path.join("AgentGroups");

    // 确保目录存在
    if !groups_dir.exists() {
        fs::create_dir_all(&groups_dir)
            .await
            .map_err(|e| format!("创建AgentGroups目录失败: {}", e))?;
    }

    // 生成唯一的 Group ID（基于时间戳和随机数）
    let group_id = format!(
        "group_{}_{}",
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

    let group_dir = groups_dir.join(&group_id);
    fs::create_dir_all(&group_dir)
        .await
        .map_err(|e| format!("创建Group目录失败: {}", e))?;

    // 创建默认话题
    let default_topic = Topic {
        id: format!(
            "group_topic_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis()
        ),
        name: "主要群聊".to_string(),
        created_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs(),
        locked: false,
        unread: false,
        creator_source: "system".to_string(),
    };

    // 构建配置对象（使用 IndexMap 保持顺序）
    let mut config = IndexMap::new();
    config.insert(
        "name".to_string(),
        serde_json::Value::String(group_name.clone()),
    );
    config.insert(
        "avatar".to_string(),
        serde_json::Value::String("".to_string()),
    );
    config.insert(
        "avatarCalculatedColor".to_string(),
        serde_json::Value::String("".to_string()),
    );
    config.insert(
        "members".to_string(),
        serde_json::Value::Array(vec![]),
    );
    config.insert(
        "mode".to_string(),
        serde_json::Value::String("normal".to_string()),
    );
    config.insert(
        "memberTags".to_string(),
        serde_json::Value::Object(serde_json::Map::new()),
    );
    config.insert(
        "groupPrompt".to_string(),
        serde_json::Value::String("".to_string()),
    );
    config.insert(
        "invitePrompt".to_string(),
        serde_json::Value::String("".to_string()),
    );
    config.insert(
        "useUnifiedModel".to_string(),
        serde_json::Value::Bool(false),
    );
    config.insert(
        "unifiedModel".to_string(),
        serde_json::Value::String("".to_string()),
    );
    config.insert(
        "createdAt".to_string(),
        serde_json::Value::Number(
            serde_json::Number::from(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs()
            )
        ),
    );
    config.insert(
        "topics".to_string(),
        serde_json::to_value(vec![&default_topic]).map_err(|e| format!("序列化话题失败: {}", e))?,
    );

    // 合并初始配置（如果提供）
    if let Some(init_config) = initial_config {
        if let Some(obj) = init_config.as_object() {
            for (k, v) in obj {
                if k != "name" && k != "topics" {
                    config.insert(k.clone(), v.clone());
                }
            }
        }
    }

    // 写入配置文件（保持 IndexMap 顺序）
    let config_path = group_dir.join("config.json");
    let config_json =
        serialize_group_config_with_order(&config).map_err(|e| format!("序列化配置失败: {}", e))?;
    fs::write(&config_path, config_json)
        .await
        .map_err(|e| format!("写入配置文件失败: {}", e))?;

    // 创建 UserData 目录结构
    let user_data_group_dir = app_data_path.join("UserData").join(&group_id);
    let topics_dir = user_data_group_dir.join("topics").join("default");
    fs::create_dir_all(&topics_dir)
        .await
        .map_err(|e| format!("创建UserData目录失败: {}", e))?;

    // 创建空的聊天历史文件
    let history_path = topics_dir.join("history.json");
    fs::write(&history_path, "[]")
        .await
        .map_err(|e| format!("创建历史文件失败: {}", e))?;

    // 返回创建的 Group（转换为 serde_json::Map 以匹配 AgentGroup 结构）
    let config_map: serde_json::Map<String, serde_json::Value> = config.into_iter().collect();
    Ok(AgentGroup {
        id: group_id,
        name: group_name,
        avatar_url: None,
        avatar_calculated_color: None,
        topics: vec![default_topic],
        config: config_map,
    })
}

/// Moved implementation: delete_group
/// 
/// 删除群聊的具体实现
/// 
/// # 参数
/// * `group_id` - 要删除的群聊的唯一标识符
/// 
/// # 返回值
/// 成功时返回确认消息，删除目录失败时返回错误信息
#[tauri::command]
pub async fn delete_group(group_id: String) -> Result<String, String> {
    let app_data_path = get_app_data_path();
    let group_dir = app_data_path.join("AgentGroups").join(&group_id);
    let user_data_group_dir = app_data_path.join("UserData").join(&group_id);

    // 删除 Group 目录
    if group_dir.exists() {
        fs::remove_dir_all(&group_dir)
            .await
            .map_err(|e| format!("删除Group目录失败: {}", e))?;
    }

    // 删除 UserData 目录
    if user_data_group_dir.exists() {
        fs::remove_dir_all(&user_data_group_dir)
            .await
            .map_err(|e| format!("删除UserData目录失败: {}", e))?;
    }

    Ok(format!("Group {} 已删除", group_id))
}

/// Moved implementation: update_group_config
/// 
/// 更新群聊配置的具体实现
/// 
/// # 参数
/// * `group_id` - 群聊的唯一标识符
/// * `config_updates` - 包含更新内容的 JSON 值
/// 
/// # 返回值
/// 成功时返回更新后的 AgentGroup 对象，群聊不存在、读取配置失败、解析配置失败或写入配置失败时返回错误信息
#[tauri::command]
pub async fn update_group_config(
    group_id: String,
    config_updates: serde_json::Value,
) -> Result<AgentGroup, String> {
    let app_data_path = get_app_data_path();
    let config_path = app_data_path
        .join("AgentGroups")
        .join(&group_id)
        .join("config.json");

    if !config_path.exists() {
        return Err(format!("Group {} 不存在", group_id));
    }

    // 读取现有配置
    let config_content = match fs::read_to_string(&config_path).await {
        Ok(content) => content,
        Err(e) => {
            return Err(format!("读取配置失败: {}", e));
        }
    };

    // 读取配置并解析
    let config_value: serde_json::Value = match serde_json::from_str(&config_content) {
        Ok(json) => json,
        Err(e) => {
            return Err(format!("解析配置失败: {}", e));
        }
    };

    // 提取 Object 部分
    let config: serde_json::Map<String, serde_json::Value> = match config_value {
        serde_json::Value::Object(map) => map,
        _ => {
            return Err("配置格式错误：不是有效的 JSON 对象".to_string());
        }
    };

    // 转换为 IndexMap 以便后续操作
    let mut config: IndexMap<String, serde_json::Value> = config.into_iter().collect();

    // 创建备份文件（在写入新配置之前）
    let backup_path = config_path
        .parent()
        .ok_or("无法获取配置文件目录")?
        .join("config.json.backup");

    // 复制当前配置文件到备份（如果备份文件已存在会被覆盖）
    let _ = fs::copy(&config_path, &backup_path).await;

    // 合并更新
    if let Some(updates_obj) = config_updates.as_object() {
        for (k, v) in updates_obj {
            // 保留 topics 字段不变
            if k != "topics" {
                // 如果字段已存在，先移除再插入，以保持更新后的顺序
                // 使用 shift_remove 保持顺序（移除后其他元素向前移动）
                config.shift_remove(k);
                config.insert(k.clone(), v.clone());
            }
        }
    }

    // 写回配置文件（保持字段顺序）
    let config_json = serialize_group_config_with_order(&config)?;
    fs::write(&config_path, config_json)
        .await
        .map_err(|e| format!("写入配置失败: {}", e))?;

    // 构建并返回更新后的 Group 信息
    let topics = if let Some(arr) = config.get("topics").and_then(|t| t.as_array()) {
        arr.iter()
            .filter_map(|t| serde_json::from_value::<Topic>(t.clone()).ok())
            .collect()
    } else {
        vec![Topic {
            id: "default".to_string(),
            name: "主要群聊".to_string(),
            created_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            locked: false,
            unread: false,
            creator_source: "system".to_string(),
        }]
    };

    let name = config.get("name").and_then(|n| n.as_str()).unwrap_or(&group_id).to_string();
    let avatar_url = if let Some(obj) = config.get("avatar").and_then(|v| v.as_str()) {
        Some(format!("AppData/AgentGroups/{}/{}", group_id, obj))
    } else {
        let avatar_path = app_data_path.join("AgentGroups").join(&group_id).join("avatar.png");
        if avatar_path.exists() {
            Some(format!("AppData/AgentGroups/{}/avatar.png", group_id))
        } else {
            None
        }
    };

    let avatar_calculated_color = config
        .get("avatarCalculatedColor")
        .and_then(|c| c.as_str())
        .map(|s| s.to_string());

    let mut other_config = serde_json::Map::new();
    for (k, v) in &config {
        if k != "topics" && k != "name" && k != "avatar" && k != "avatarCalculatedColor" {
            other_config.insert(k.clone(), v.clone());
        }
    }

    Ok(AgentGroup {
        id: group_id,
        name,
        avatar_url,
        avatar_calculated_color,
        topics,
        config: other_config,
    })
}

/// Moved implementation: save_group_avatar
/// 
/// 保存群聊头像的具体实现
/// 
/// # 参数
/// * `group_id` - 群聊的唯一标识符
/// * `avatar_data` - 头像文件的二进制数据
/// * `file_name` - 头像文件名
/// 
/// # 返回值
/// 成功时返回确认消息，群聊不存在、不支持的文件格式、保存头像文件失败或写入配置失败时返回错误信息
#[tauri::command]
pub async fn save_group_avatar(
    group_id: String,
    avatar_data: Vec<u8>,
    file_name: String,
) -> Result<String, String> {
    let app_data_path = get_app_data_path();
    let group_dir = app_data_path.join("AgentGroups").join(&group_id);

    if !group_dir.exists() {
        return Err(format!("Group {} 不存在", group_id));
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
        let old_avatar_path = group_dir.join(format!("avatar.{}", old_ext));
        if old_avatar_path.exists() {
            let _ = fs::remove_file(&old_avatar_path).await;
        }
    }

    // 保存新头像文件（统一使用 avatar.png）
    let avatar_path = group_dir.join("avatar.png");
    fs::write(&avatar_path, avatar_data)
        .await
        .map_err(|e| format!("保存头像文件失败: {}", e))?;

    // 更新配置文件中的 avatar 字段
    let config_path = group_dir.join("config.json");
    if config_path.exists() {
        let config_content = fs::read_to_string(&config_path)
            .await
            .map_err(|e| format!("读取配置失败: {}", e))?;

        let mut config: serde_json::Value =
            serde_json::from_str(&config_content).map_err(|e| format!("解析配置失败: {}", e))?;

        if let Some(config_obj) = config.as_object_mut() {
            config_obj.insert(
                "avatar".to_string(),
                serde_json::Value::String("avatar.png".to_string()),
            );
        }

        let updated_config = serde_json::to_string_pretty(&config)
            .map_err(|e| format!("序列化更新后的配置失败: {}", e))?;
        fs::write(&config_path, updated_config)
            .await
            .map_err(|e| format!("写入更新后的配置失败: {}", e))?;
    }

    Ok("头像保存成功".to_string())
}

/// 辅助函数：保持字段顺序的 JSON 序列化（用于群组）
/// 
/// 将 IndexMap 中的群组配置数据序列化为 JSON 字符串，保持特定字段顺序
/// 
/// # 参数
/// * `config` - 包含群组配置数据的 IndexMap
/// 
/// # 返回值
/// 成功时返回格式化的 JSON 字符串，转换或序列化失败时返回错误信息
pub(crate) fn serialize_group_config_with_order(
    config: &IndexMap<String, serde_json::Value>,
) -> Result<String, String> {
    // 定义字段顺序（按照用户提供的示例顺序）
    let field_order = vec![
        "name",
        "avatar",
        "avatarCalculatedColor",
        "members",
        "mode",
        "memberTags",
        "groupPrompt",
        "invitePrompt",
        "useUnifiedModel",
        "unifiedModel",
        "createdAt",
        "topics",
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


/// 删除群组话题的命令
/// 
/// 从指定群组中删除一个话题
/// 
/// # 参数
/// * `group_id` - 群组的唯一标识符
/// * `topic_id` - 话题的唯一标识符
/// 
/// # 返回值
/// 成功时返回 { success: true }，失败时返回 { success: false, error: "..." }
#[tauri::command]
pub async fn delete_group_topic(group_id: String, topic_id: String) -> Result<serde_json::Value, String> {
    let app_data_path = get_app_data_path();
    let config_path = app_data_path.join("AgentGroups").join(&group_id).join("config.json");
    
    if !config_path.exists() {
        return Ok(serde_json::json!({ "success": false, "error": format!("Group {} 配置文件不存在", group_id) }));
    }
    
    let content = tokio::fs::read_to_string(&config_path)
        .await
        .map_err(|e| format!("读取Group配置失败: {}", e))?;
    
    let mut json: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("解析Group配置失败: {}", e))?;
    
    let mut topics = json.get_mut("topics")
        .and_then(|t| t.as_array_mut())
        .cloned()
        .unwrap_or_else(Vec::new);
    
    let original_len = topics.len();
    topics.retain(|t| t.get("id").and_then(|v| v.as_str()) != Some(&topic_id));
    
    if topics.len() == original_len {
        return Ok(serde_json::json!({ "success": false, "error": "Topic 未找到" }));
    }
    
    json.as_object_mut()
        .unwrap()
        .insert("topics".to_string(), serde_json::Value::Array(topics.clone()));
    
    let new_content = serde_json::to_string_pretty(&json)
        .map_err(|e| format!("序列化失败: {}", e))?;
    
    tokio::fs::write(&config_path, new_content)
        .await
        .map_err(|e| format!("写入Group配置失败: {}", e))?;
    
    Ok(serde_json::json!({ "success": true }))
}


/// 切换群组话题锁定状态的命令
/// 
/// # 参数
/// * `group_id` - 群组的唯一标识符
/// * `topic_id` - 话题的唯一标识符
/// 
/// # 返回值
/// 成功时返回 { success: true, locked: bool, message: "..." }，失败时返回 { success: false, error: "..." }
#[tauri::command]
pub async fn toggle_group_topic_lock(group_id: String, topic_id: String) -> Result<serde_json::Value, String> {
    let app_data_path = get_app_data_path();
    let config_path = app_data_path.join("AgentGroups").join(&group_id).join("config.json");
    
    if !config_path.exists() {
        return Ok(serde_json::json!({ "success": false, "error": format!("Group {} 配置文件不存在", group_id) }));
    }
    
    let content = tokio::fs::read_to_string(&config_path)
        .await
        .map_err(|e| format!("读取Group配置失败: {}", e))?;
    
    let mut json: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("解析Group配置失败: {}", e))?;
    
    if let Some(arr) = json.get_mut("topics").and_then(|t| t.as_array_mut()) {
        for t in arr.iter_mut() {
            if t.get("id").and_then(|v| v.as_str()) == Some(&topic_id) {
                let new_locked = !t.get("locked").and_then(|b| b.as_bool()).unwrap_or(true);
                t.as_object_mut()
                    .unwrap()
                    .insert("locked".to_string(), serde_json::Value::Bool(new_locked));
                
                let new_content = serde_json::to_string_pretty(&json)
                    .map_err(|e| format!("序列化失败: {}", e))?;
                
                tokio::fs::write(&config_path, new_content)
                    .await
                    .map_err(|e| format!("写入Group配置失败: {}", e))?;
                
                let message = if new_locked { "话题已锁定" } else { "话题已解锁" };
                return Ok(serde_json::json!({ "success": true, "locked": new_locked, "message": message }));
            }
        }
    }
    
    Ok(serde_json::json!({ "success": false, "error": "Topic 未找到" }))
}

/// 设置群组话题未读状态的命令
/// 
/// # 参数
/// * `group_id` - 群组的唯一标识符
/// * `topic_id` - 话题的唯一标识符
/// * `unread` - 新的未读状态
/// 
/// # 返回值
/// 成功时返回 { success: true, unread: bool }，失败时返回 { success: false, error: "..." }
#[tauri::command]
pub async fn set_group_topic_unread(group_id: String, topic_id: String, unread: bool) -> Result<serde_json::Value, String> {
    let app_data_path = get_app_data_path();
    let config_path = app_data_path.join("AgentGroups").join(&group_id).join("config.json");
    
    if !config_path.exists() {
        return Ok(serde_json::json!({ "success": false, "error": format!("Group {} 配置文件不存在", group_id) }));
    }
    
    let content = tokio::fs::read_to_string(&config_path)
        .await
        .map_err(|e| format!("读取Group配置失败: {}", e))?;
    
    let mut json: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("解析Group配置失败: {}", e))?;
    
    if let Some(arr) = json.get_mut("topics").and_then(|t| t.as_array_mut()) {
        for t in arr.iter_mut() {
            if t.get("id").and_then(|v| v.as_str()) == Some(&topic_id) {
                t.as_object_mut()
                    .unwrap()
                    .insert("unread".to_string(), serde_json::Value::Bool(unread));
                
                let new_content = serde_json::to_string_pretty(&json)
                    .map_err(|e| format!("序列化失败: {}", e))?;
                
                tokio::fs::write(&config_path, new_content)
                    .await
                    .map_err(|e| format!("写入Group配置失败: {}", e))?;
                
                return Ok(serde_json::json!({ "success": true, "unread": unread }));
            }
        }
    }
    
    Ok(serde_json::json!({ "success": false, "error": "Topic 未找到" }))
}

/// 重命名群组话题的命令
/// 
/// # 参数
/// * `group_id` - 群组的唯一标识符
/// * `topic_id` - 话题的唯一标识符
/// * `new_name` - 新的话题名称
/// 
/// # 返回值
/// 成功时返回 { success: true }，失败时返回 { success: false, error: "..." }
#[tauri::command]
pub async fn rename_group_topic(group_id: String, topic_id: String, new_name: String) -> Result<serde_json::Value, String> {
    let app_data_path = get_app_data_path();
    let config_path = app_data_path.join("AgentGroups").join(&group_id).join("config.json");
    
    if !config_path.exists() {
        return Ok(serde_json::json!({ "success": false, "error": format!("Group {} 配置文件不存在", group_id) }));
    }
    
    let content = tokio::fs::read_to_string(&config_path)
        .await
        .map_err(|e| format!("读取Group配置失败: {}", e))?;
    
    let mut json: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("解析Group配置失败: {}", e))?;
    
    if let Some(arr) = json.get_mut("topics").and_then(|t| t.as_array_mut()) {
        for t in arr.iter_mut() {
            if t.get("id").and_then(|v| v.as_str()) == Some(&topic_id) {
                t.as_object_mut()
                    .unwrap()
                    .insert("name".to_string(), serde_json::Value::String(new_name));
                
                let new_content = serde_json::to_string_pretty(&json)
                    .map_err(|e| format!("序列化失败: {}", e))?;
                
                tokio::fs::write(&config_path, new_content)
                    .await
                    .map_err(|e| format!("写入Group配置失败: {}", e))?;
                
                return Ok(serde_json::json!({ "success": true }));
            }
        }
    }
    
    Ok(serde_json::json!({ "success": false, "error": "Topic 未找到" }))
}

/// 为群组创建新话题
/// 
/// # 参数
/// * `group_id` - 群组ID
/// * `topic_name` - 话题名称
/// * `is_branch` - 是否为分支话题（可选）
/// * `locked` - 是否锁定（可选，默认false）
/// 
/// # 返回值
/// 成功时返回 { success: true, topicId: "..." }，失败时返回 { success: false, error: "..." }
#[tauri::command]
pub async fn create_group_topic(
    group_id: String, 
    topic_name: String, 
    is_branch: Option<bool>, 
    locked: Option<bool>
) -> Result<serde_json::Value, String> {
    let app_data_path = get_app_data_path();
    let config_path = app_data_path.join("AgentGroups").join(&group_id).join("config.json");
    
    if !config_path.exists() {
        return Ok(serde_json::json!({ 
            "success": false, 
            "error": format!("Group {} 配置文件不存在", group_id) 
        }));
    }
    
    let content = tokio::fs::read_to_string(&config_path)
        .await
        .map_err(|e| format!("读取Group配置失败: {}", e))?;
    
    let mut json: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("解析Group配置失败: {}", e))?;
    
    // 生成新的话题ID
    let topic_id = if is_branch.unwrap_or(false) {
        format!("branch_topic_{}", chrono::Utc::now().timestamp_millis())
    } else {
        format!("group_topic_{}", chrono::Utc::now().timestamp_millis())
    };
    
    // 创建新话题对象
    let new_topic = serde_json::json!({
        "id": topic_id,
        "name": topic_name,
        "createdAt": chrono::Utc::now().timestamp_millis(),
        "locked": locked.unwrap_or(false),
        "unread": false,
        "creatorSource": if is_branch.unwrap_or(false) { "branch" } else { "user" }
    });
    
    // 添加到topics数组
    if let Some(topics_array) = json.get_mut("topics").and_then(|t| t.as_array_mut()) {
        topics_array.push(new_topic);
    } else {
        // 如果topics数组不存在，创建一个
        json.as_object_mut()
            .unwrap()
            .insert("topics".to_string(), serde_json::json!([new_topic]));
    }
    
    // 保存配置文件
    let new_content = serde_json::to_string_pretty(&json)
        .map_err(|e| format!("序列化失败: {}", e))?;
    
    tokio::fs::write(&config_path, new_content)
        .await
        .map_err(|e| format!("写入Group配置失败: {}", e))?;
    
    // 创建话题目录
    let topic_dir = app_data_path.join("UserData").join(&group_id).join("topics").join(&topic_id);
    tokio::fs::create_dir_all(&topic_dir)
        .await
        .map_err(|e| format!("创建话题目录失败: {}", e))?;
    
    // 创建空的历史文件
    let history_file = topic_dir.join("history.json");
    tokio::fs::write(&history_file, "[]")
        .await
        .map_err(|e| format!("创建历史文件失败: {}", e))?;
    
    Ok(serde_json::json!({ 
        "success": true, 
        "topicId": topic_id 
    }))
}