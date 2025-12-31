// vcpnewchat-tauri/src-tauri/src/chat.rs
// 聊天消息处理模块 - 支持 SSE 流式响应

use serde::{Deserialize, Serialize};
use std::fs;
use tokio::fs as async_fs;
use base64::{Engine as _, engine::general_purpose};
use rand::Rng;
use tauri::{AppHandle, Emitter};
use futures::StreamExt;

/// 文件 Base64 转换结果
#[derive(Debug, Serialize)]
pub struct FileBase64Result {
    pub success: bool,
    pub base64_frames: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Canvas 内容
#[derive(Debug, Serialize)]
pub struct CanvasContent {
    pub content: String,
    pub path: String,
    pub errors: String,
}

/// SSE 流式事件数据结构
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamEventPayload {
    #[serde(rename = "type")]
    pub event_type: String,  // "data", "end", "error"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chunk: Option<serde_json::Value>,
    pub message_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,  // 用于 end 事件，包含完整内容
}

/// 生成随机后缀的辅助函数
fn generate_random_suffix() -> String {
    const CHARSET: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let mut rng = rand::thread_rng();
    (0..7)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect()
}


/// 获取文件的 base64 编码
#[tauri::command]
pub async fn get_file_as_base64(path: String) -> Result<FileBase64Result, String> {
    println!("[Rust] get_file_as_base64 called with path: {}", path);
    
    let file_data = fs::read(&path)
        .map_err(|e| format!("Failed to read file {}: {}", path, e))?;
    
    println!("[Rust] File read successfully, size: {} bytes", file_data.len());
    
    let base64_data = general_purpose::STANDARD.encode(&file_data);
    
    println!("[Rust] Base64 encoding completed, length: {}", base64_data.len());
    
    Ok(FileBase64Result {
        success: true,
        base64_frames: vec![base64_data],
        error: None,
    })
}

/// 获取最新的 Canvas 内容
#[tauri::command]
pub async fn get_latest_canvas_content() -> Result<CanvasContent, String> {
    println!("[Rust] get_latest_canvas_content called");
    
    Ok(CanvasContent {
        content: String::from("Canvas content placeholder"),
        path: String::from("No file path"),
        errors: String::from("No errors"),
    })
}

/// 获取聊天历史的命令
#[tauri::command]
pub async fn get_chat_history(agent_id: String, topic_id: String) -> Result<Vec<serde_json::Value>, String> {
    println!("[Chat] get_chat_history called: agent_id={}, topic_id={}", agent_id, topic_id);
    
    let app_data_path = crate::get_app_data_path();
    let history_path = app_data_path
        .join("UserData")
        .join(&agent_id)
        .join("topics")
        .join(&topic_id)
        .join("history.json");

    println!("[Chat] History path: {:?}", history_path);

    if !history_path.exists() {
        println!("[Chat] History file does not exist, returning empty array");
        return Ok(vec![]);
    }

    let content = async_fs::read_to_string(&history_path)
        .await
        .map_err(|e| format!("读取历史文件失败: {}", e))?;
    let messages: Vec<serde_json::Value> =
        serde_json::from_str(&content).map_err(|e| format!("解析历史失败: {}", e))?;
    
    println!("[Chat] Loaded {} messages from history", messages.len());
    Ok(messages)
}

/// 保存聊天历史（覆盖）的命令
#[tauri::command]
pub async fn save_chat_history(agent_id: String, topic_id: String, messages: Vec<serde_json::Value>) -> Result<String, String> {
    println!("[Chat] save_chat_history called: agent_id={}, topic_id={}, messages_count={}", 
             agent_id, topic_id, messages.len());
    
    let app_data_path = crate::get_app_data_path();
    let topics_dir = app_data_path.join("UserData").join(&agent_id).join("topics").join(&topic_id);
    
    async_fs::create_dir_all(&topics_dir)
        .await
        .map_err(|e| format!("创建历史目录失败: {}", e))?;
    let history_path = topics_dir.join("history.json");
    let content = serde_json::to_string_pretty(&messages).map_err(|e| format!("序列化历史失败: {}", e))?;
    async_fs::write(&history_path, content)
        .await
        .map_err(|e| format!("写入历史失败: {}", e))?;
    
    println!("[Chat] History saved successfully to {:?}", history_path);
    Ok("ok".to_string())
}


/// 发送消息到 VCP 的命令 - 支持 SSE 流式响应
/// 
/// 当 model_config.stream = true 时，通过 Tauri 事件发送流式数据到前端
/// 事件名称: "vcp-stream-event"
#[tauri::command]
pub async fn send_message_to_vcp(
    app_handle: AppHandle,
    agent_id: String,
    topic_id: String,
    vcp_url: String,
    vcp_api_key: String,
    messages: Vec<serde_json::Value>,
    model_config: serde_json::Value,
    message_id: String,
    is_group_call: Option<bool>,
    context: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    println!("[Chat] send_message_to_vcp called");
    println!("[Chat] agent_id: {}", agent_id);
    println!("[Chat] topic_id: {}", topic_id);
    println!("[Chat] message_id: {}", message_id);
    println!("[Chat] is_group_call: {:?}", is_group_call);
    println!("[Chat] vcp_url: {}", vcp_url);
    println!("[Chat] messages length: {}", messages.len());
    
    let full_messages = messages;
    
    // 检查是否启用流式模式
    let use_streaming = model_config.get("stream")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    
    println!("[Chat] Streaming mode: {}", use_streaming);

    // 准备发送到VCP的请求数据
    let mut request_body = serde_json::json!({
        "messages": &full_messages,
        "model": model_config.get("model").unwrap_or(&serde_json::Value::String("default-model".to_string())),
        "temperature": model_config.get("temperature").unwrap_or(&serde_json::Value::Number(serde_json::Number::from_f64(0.7).unwrap_or_else(|| serde_json::Number::from(0)))),
        "stream": use_streaming,
        "requestId": message_id
    });

    // 添加额外的配置参数
    if let Some(max_tokens) = model_config.get("max_tokens") {
        request_body.as_object_mut().unwrap().insert("max_tokens".to_string(), max_tokens.clone());
    }
    if let Some(top_p) = model_config.get("top_p") {
        request_body.as_object_mut().unwrap().insert("top_p".to_string(), top_p.clone());
    }
    if let Some(top_k) = model_config.get("top_k") {
        request_body.as_object_mut().unwrap().insert("top_k".to_string(), top_k.clone());
    }

    println!("[Chat] Sending request to VCP server...");

    let client = reqwest::Client::new();
    let response = client
        .post(&vcp_url)
        .header("Authorization", format!("Bearer {}", vcp_api_key))
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("发送请求到VCP服务器失败: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("VCP服务器返回错误状态码: {} - {}", status, error_text));
    }

    if use_streaming {
        // 流式响应处理 - 在后台任务中处理，立即返回
        let app_handle_clone = app_handle.clone();
        let agent_id_clone = agent_id.clone();
        let topic_id_clone = topic_id.clone();
        let message_id_clone = message_id.clone();
        let context_clone = context.clone();
        let full_messages_clone = full_messages.clone();
        
        // 启动后台任务处理流式响应
        tokio::spawn(async move {
            if let Err(e) = handle_streaming_response(
                app_handle_clone,
                response,
                agent_id_clone,
                topic_id_clone,
                message_id_clone,
                is_group_call,
                context_clone,
                full_messages_clone,
            ).await {
                println!("[Chat] Streaming error: {}", e);
            }
        });
        
        // 立即返回，让前端知道流已开始
        Ok(serde_json::json!({ "streamingStarted": true }))
    } else {
        // 非流式响应处理
        handle_non_streaming_response(
            response,
            agent_id,
            topic_id,
            message_id,
            is_group_call,
            context,
            full_messages,
        ).await
    }
}

/// 处理流式响应
async fn handle_streaming_response(
    app_handle: AppHandle,
    response: reqwest::Response,
    _agent_id: String,
    _topic_id: String,
    message_id: String,
    _is_group_call: Option<bool>,
    context: Option<serde_json::Value>,
    _full_messages: Vec<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    println!("[Chat] Starting SSE stream processing...");
    
    let mut accumulated_content = String::new();
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    
    while let Some(chunk_result) = stream.next().await {
        match chunk_result {
            Ok(chunk) => {
                buffer.push_str(&String::from_utf8_lossy(&chunk));
                
                while let Some(newline_pos) = buffer.find('\n') {
                    let line = buffer[..newline_pos].trim().to_string();
                    buffer = buffer[newline_pos + 1..].to_string();
                    
                    if line.is_empty() { continue; }
                    
                    if line.starts_with("data: ") {
                        let json_data = line[6..].trim();
                        
                        if json_data == "[DONE]" {
                            println!("[Chat] Stream [DONE] received");
                            let end_payload = StreamEventPayload {
                                event_type: "end".to_string(),
                                chunk: None,
                                message_id: message_id.clone(),
                                context: context.clone(),
                                error: None,
                                content: Some(accumulated_content.clone()),
                            };
                            println!("[Chat] Emitting end event with content length: {}", accumulated_content.len());
                            match app_handle.emit("vcp-stream-event", &end_payload) {
                                Ok(_) => println!("[Chat] End event emitted successfully"),
                                Err(e) => println!("[Chat] Failed to emit end event: {}", e),
                            }
                            
                            // 注意：不在这里保存历史，让前端的 finalizeStreamedMessage 处理
                            // 前端会使用正确的 agent 名字和消息 ID
                            
                            return Ok(serde_json::json!({ "streamingStarted": true, "completed": true }));
                        }
                        
                        if json_data.is_empty() { continue; }
                        
                        match serde_json::from_str::<serde_json::Value>(json_data) {
                            Ok(parsed_chunk) => {
                                // 提取内容
                                let text = parsed_chunk.get("choices")
                                    .and_then(|c| c.get(0))
                                    .and_then(|c| c.get("delta"))
                                    .and_then(|d| d.get("content"))
                                    .and_then(|c| c.as_str())
                                    .or_else(|| parsed_chunk.get("delta").and_then(|d| d.get("content")).and_then(|c| c.as_str()))
                                    .or_else(|| parsed_chunk.get("content").and_then(|c| c.as_str()))
                                    .unwrap_or("");
                                
                                if !text.is_empty() {
                                    accumulated_content.push_str(text);
                                }
                                
                                let data_payload = StreamEventPayload {
                                    event_type: "data".to_string(),
                                    chunk: Some(parsed_chunk),
                                    message_id: message_id.clone(),
                                    context: context.clone(),
                                    error: None,
                                    content: None,
                                };
                                println!("[Chat] Emitting data event");
                                let _ = app_handle.emit("vcp-stream-event", &data_payload);
                            }
                            Err(e) => {
                                println!("[Chat] Failed to parse chunk: {} - data: {}", e, json_data);
                            }
                        }
                    }
                }
            }
            Err(e) => {
                let error_payload = StreamEventPayload {
                    event_type: "error".to_string(),
                    chunk: None,
                    message_id: message_id.clone(),
                    context: context.clone(),
                    error: Some(format!("流读取错误: {}", e)),
                    content: None,
                };
                let _ = app_handle.emit("vcp-stream-event", &error_payload);
                return Err(format!("流读取错误: {}", e));
            }
        }
    }
    
    // 流结束但没有收到 [DONE]
    println!("[Chat] Stream ended without [DONE]");
    let end_payload = StreamEventPayload {
        event_type: "end".to_string(),
        chunk: None,
        message_id: message_id.clone(),
        context: context.clone(),
        error: None,
        content: Some(accumulated_content.clone()),
    };
    let _ = app_handle.emit("vcp-stream-event", &end_payload);
    
    // 注意：不在这里保存历史，让前端的 finalizeStreamedMessage 处理
    // 前端会使用正确的 agent 名字和消息 ID
    
    Ok(serde_json::json!({ "streamingStarted": true, "completed": true }))
}

/// 处理非流式响应
async fn handle_non_streaming_response(
    response: reqwest::Response,
    agent_id: String,
    topic_id: String,
    _message_id: String,
    is_group_call: Option<bool>,
    context: Option<serde_json::Value>,
    full_messages: Vec<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let response_text = response.text().await.map_err(|e| format!("读取VCP服务器响应失败: {}", e))?;
    println!("[Chat] Received non-streaming response");

    let vcp_response: serde_json::Value = serde_json::from_str(&response_text)
        .map_err(|e| format!("解析VCP服务器响应失败: {}", e))?;

    // 提取助手回复内容
    let assistant_content = vcp_response.get("content")
        .or(vcp_response.get("message"))
        .or(vcp_response.get("response"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            vcp_response.get("choices")
                .and_then(|c| c.as_array())
                .and_then(|arr| arr.first())
                .and_then(|choice| choice.get("message"))
                .and_then(|msg| msg.get("content"))
                .and_then(|c| c.as_str())
                .map(|s| s.to_string())
        })
        .unwrap_or_else(|| "助手未返回有效内容".to_string());

    let timestamp = chrono::Utc::now().timestamp_millis();
    let assistant_msg = serde_json::json!({
        "role": "assistant",
        "name": "VCP Assistant",
        "content": assistant_content,
        "timestamp": timestamp,
        "id": format!("msg_{}_assistant_{}", timestamp, generate_random_suffix()),
        "attachments": [],
        "isThinking": false,
        "avatarUrl": "assets/default_avatar.png",
        "isGroupMessage": is_group_call.unwrap_or(false),
        "agentId": agent_id.clone(),
        "finishReason": "completed"
    });

    let mut updated_history = full_messages.clone();
    updated_history.push(assistant_msg.clone());
    let _ = save_chat_history(agent_id, topic_id, updated_history).await;

    Ok(serde_json::json!({
        "timestamp": timestamp,
        "content": assistant_content,
        "context": context
    }))
}
/// 保存群组聊天历史（覆盖）的命令
#[tauri::command]
pub async fn save_group_chat_history(group_id: String, topic_id: String, messages: Vec<serde_json::Value>) -> Result<serde_json::Value, String> {
    println!("[Chat] save_group_chat_history called: group_id={}, topic_id={}, messages_count={}", 
             group_id, topic_id, messages.len());
    
    let app_data_path = crate::get_app_data_path();
    let topics_dir = app_data_path.join("UserData").join(&group_id).join("topics").join(&topic_id);
    
    async_fs::create_dir_all(&topics_dir)
        .await
        .map_err(|e| format!("创建历史目录失败: {}", e))?;
    
    let history_file = topics_dir.join("history.json");
    let json_content = serde_json::to_string_pretty(&messages)
        .map_err(|e| format!("序列化消息失败: {}", e))?;
    
    async_fs::write(&history_file, json_content)
        .await
        .map_err(|e| format!("写入历史文件失败: {}", e))?;
    
    println!("[Chat] save_group_chat_history completed successfully");
    Ok(serde_json::json!({ "success": true }))
}

/// 获取群组聊天历史的命令
#[tauri::command]
pub async fn get_group_chat_history(group_id: String, topic_id: String) -> Result<Vec<serde_json::Value>, String> {
    println!("[Chat] get_group_chat_history called: group_id={}, topic_id={}", group_id, topic_id);
    
    let app_data_path = crate::get_app_data_path();
    let history_file = app_data_path.join("UserData").join(&group_id).join("topics").join(&topic_id).join("history.json");
    
    if !history_file.exists() {
        println!("[Chat] History file does not exist, returning empty array");
        return Ok(vec![]);
    }
    
    let content = async_fs::read_to_string(&history_file)
        .await
        .map_err(|e| format!("读取历史文件失败: {}", e))?;
    
    let messages: Vec<serde_json::Value> = serde_json::from_str(&content)
        .map_err(|e| format!("解析历史文件失败: {}", e))?;
    
    println!("[Chat] get_group_chat_history completed, returning {} messages", messages.len());
    Ok(messages)
}

/// 中止VCP请求的命令
#[tauri::command]
pub async fn interrupt_vcp_request(message_id: String) -> Result<serde_json::Value, String> {
    println!("[Chat] interrupt_vcp_request called for message_id: {}", message_id);
    
    // 读取设置获取 VCP URL
    let app_data_path = crate::get_app_data_path();
    let settings_file = app_data_path.join("settings.json");
    
    if !settings_file.exists() {
        return Err("设置文件不存在".to_string());
    }
    
    let settings_content = async_fs::read_to_string(&settings_file)
        .await
        .map_err(|e| format!("读取设置文件失败: {}", e))?;
    
    let settings: serde_json::Value = serde_json::from_str(&settings_content)
        .map_err(|e| format!("解析设置文件失败: {}", e))?;
    
    let vcp_url = settings.get("vcpServerUrl")
        .and_then(|v| v.as_str())
        .ok_or("VCP服务器URL未配置")?;
    
    let vcp_api_key = settings.get("vcpApiKey")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    
    // 构建中止请求URL - 确保包含端口号
    let url = reqwest::Url::parse(vcp_url)
        .map_err(|e| format!("解析VCP URL失败: {}", e))?;
    
    let interrupt_url = if let Some(port) = url.port() {
        format!("{}://{}:{}/v1/interrupt", url.scheme(), url.host_str().unwrap_or(""), port)
    } else {
        format!("{}://{}/v1/interrupt", url.scheme(), url.host_str().unwrap_or(""))
    };
    
    println!("[Chat] Sending interrupt request to: {}", interrupt_url);
    println!("[Chat] Request body: {{\"requestId\": \"{}\"}}", message_id);
    
    // 发送中止请求
    let client = reqwest::Client::new();
    let response = client
        .post(&interrupt_url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", vcp_api_key))
        .json(&serde_json::json!({
            "requestId": message_id
        }))
        .send()
        .await
        .map_err(|e| format!("发送中止请求失败: {}", e))?;
    
    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        println!("[Chat] Interrupt request failed - Status: {}, Error: {}", status, error_text);
        return Err(format!("中止请求失败，状态码: {} - {}", status, error_text));
    }
    
    let result: serde_json::Value = response.json()
        .await
        .map_err(|e| {
            println!("[Chat] Failed to parse interrupt response: {}", e);
            format!("解析中止响应失败: {}", e)
        })?;
    
    println!("[Chat] Interrupt request successful: {:?}", result);
    
    Ok(serde_json::json!({
        "success": true,
        "message": result.get("message").and_then(|v| v.as_str()).unwrap_or("请求已中止")
    }))
}

/// 中止群组聊天请求的命令
#[tauri::command]
pub async fn interrupt_group_request(message_id: String) -> Result<serde_json::Value, String> {
    println!("[Chat] interrupt_group_request called for message_id: {}", message_id);
    // 群组中止和普通中止使用相同的逻辑
    interrupt_vcp_request(message_id).await
}
