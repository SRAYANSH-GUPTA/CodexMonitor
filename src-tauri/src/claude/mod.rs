use std::collections::HashMap;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::backend::events::{AppServerEvent, EventSink};
use crate::types::LocalAgentProvider;

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[derive(Clone)]
struct ClaudeThread {
    thread_id: String,
    session_id: Option<String>,
    created_at: i64,
}

pub(crate) struct ClaudeState {
    /// workspace_id -> (thread_id -> ClaudeThread)
    threads: Mutex<HashMap<String, HashMap<String, ClaudeThread>>>,
}

impl ClaudeState {
    pub(crate) fn new() -> Arc<Self> {
        Arc::new(Self {
            threads: Mutex::new(HashMap::new()),
        })
    }

    pub(crate) async fn new_thread(&self, workspace_id: &str) -> String {
        let thread_id = Uuid::new_v4().to_string();
        let thread = ClaudeThread {
            thread_id: thread_id.clone(),
            session_id: None,
            created_at: now_ms(),
        };
        self.threads
            .lock()
            .await
            .entry(workspace_id.to_string())
            .or_default()
            .insert(thread_id.clone(), thread);
        thread_id
    }

    pub(crate) async fn get_session_id(&self, workspace_id: &str, thread_id: &str) -> Option<String> {
        self.threads
            .lock()
            .await
            .get(workspace_id)?
            .get(thread_id)?
            .session_id
            .clone()
    }

    pub(crate) async fn set_session_id(&self, workspace_id: &str, thread_id: &str, session_id: String) {
        let mut threads = self.threads.lock().await;
        if let Some(workspace_threads) = threads.get_mut(workspace_id) {
            if let Some(thread) = workspace_threads.get_mut(thread_id) {
                thread.session_id = Some(session_id);
            }
        }
    }

    pub(crate) async fn list_threads(&self, workspace_id: &str) -> Vec<ClaudeThread> {
        self.threads
            .lock()
            .await
            .get(workspace_id)
            .map(|map| map.values().cloned().collect())
            .unwrap_or_default()
    }

    pub(crate) async fn get_thread(&self, workspace_id: &str, thread_id: &str) -> Option<ClaudeThread> {
        self.threads
            .lock()
            .await
            .get(workspace_id)?
            .get(thread_id)
            .cloned()
    }

    pub(crate) async fn ensure_thread(&self, workspace_id: &str, thread_id: &str) {
        let mut threads = self.threads.lock().await;
        threads
            .entry(workspace_id.to_string())
            .or_default()
            .entry(thread_id.to_string())
            .or_insert_with(|| ClaudeThread {
                thread_id: thread_id.to_string(),
                session_id: None,
                created_at: now_ms(),
            });
    }
}

pub(crate) async fn is_claude_mode(app_settings: &Mutex<crate::types::AppSettings>) -> bool {
    matches!(app_settings.lock().await.local_provider, LocalAgentProvider::Claude)
}

pub(crate) fn connect_workspace_claude<E: EventSink>(workspace_id: &str, event_sink: E) {
    event_sink.emit_app_server_event(AppServerEvent {
        workspace_id: workspace_id.to_string(),
        message: json!({
            "method": "codex/connected",
            "params": { "workspaceId": workspace_id }
        }),
    });
}

pub(crate) async fn start_thread_claude<E: EventSink>(
    claude_state: &Arc<ClaudeState>,
    workspace_id: &str,
    event_sink: E,
) -> Result<Value, String> {
    let thread_id = claude_state.new_thread(workspace_id).await;
    let created_at = now_ms();

    event_sink.emit_app_server_event(AppServerEvent {
        workspace_id: workspace_id.to_string(),
        message: json!({
            "method": "thread/started",
            "params": {
                "thread": {
                    "id": thread_id,
                    "status": { "type": "idle" },
                    "createdAt": created_at,
                    "preview": null,
                }
            }
        }),
    });

    Ok(json!({
        "thread": {
            "id": thread_id,
            "status": { "type": "idle" },
            "createdAt": created_at,
        }
    }))
}

pub(crate) async fn list_threads_claude(
    claude_state: &Arc<ClaudeState>,
    workspace_id: &str,
) -> Result<Value, String> {
    let threads = claude_state.list_threads(workspace_id).await;
    let mut items: Vec<Value> = threads
        .iter()
        .map(|t| {
            json!({
                "id": t.thread_id,
                "status": { "type": "idle" },
                "createdAt": t.created_at,
                "preview": null,
            })
        })
        .collect();
    // Most recent first
    items.sort_by(|a, b| {
        let ts_a = a.get("createdAt").and_then(|v| v.as_i64()).unwrap_or(0);
        let ts_b = b.get("createdAt").and_then(|v| v.as_i64()).unwrap_or(0);
        ts_b.cmp(&ts_a)
    });

    Ok(json!({
        "result": {
            "data": items,
            "nextCursor": null,
        }
    }))
}

pub(crate) async fn read_thread_claude(
    claude_state: &Arc<ClaudeState>,
    workspace_id: &str,
    thread_id: &str,
) -> Result<Value, String> {
    let thread = claude_state.get_thread(workspace_id, thread_id).await;
    let (created_at, session_id) = thread
        .map(|t| (t.created_at, t.session_id))
        .unwrap_or_else(|| (now_ms(), None));

    Ok(json!({
        "result": {
            "thread": {
                "id": thread_id,
                "status": { "type": "idle" },
                "createdAt": created_at,
                "preview": null,
                "sessionId": session_id,
            },
            "items": []
        }
    }))
}

pub(crate) async fn send_message_claude<E: EventSink + 'static>(
    claude_state: Arc<ClaudeState>,
    workspace_id: String,
    workspace_cwd: String,
    thread_id: String,
    text: String,
    event_sink: E,
) -> Result<Value, String> {
    // Ensure thread exists in state
    claude_state.ensure_thread(&workspace_id, &thread_id).await;

    let session_id = claude_state.get_session_id(&workspace_id, &thread_id).await;
    let turn_id = Uuid::new_v4().to_string();

    // Emit thread/status/changed to running
    event_sink.emit_app_server_event(AppServerEvent {
        workspace_id: workspace_id.clone(),
        message: json!({
            "method": "thread/status/changed",
            "params": {
                "threadId": thread_id,
                "status": { "type": "running" }
            }
        }),
    });

    // Emit turn/started
    event_sink.emit_app_server_event(AppServerEvent {
        workspace_id: workspace_id.clone(),
        message: json!({
            "method": "turn/started",
            "params": {
                "threadId": thread_id,
                "turn": { "id": turn_id, "threadId": thread_id }
            }
        }),
    });

    // Emit user message item
    let user_item_id = Uuid::new_v4().to_string();
    let user_item = json!({
        "type": "userMessage",
        "id": user_item_id,
        "turnId": turn_id,
        "content": [{ "type": "text", "text": text }]
    });
    event_sink.emit_app_server_event(AppServerEvent {
        workspace_id: workspace_id.clone(),
        message: json!({
            "method": "item/started",
            "params": { "threadId": thread_id, "item": user_item.clone() }
        }),
    });
    event_sink.emit_app_server_event(AppServerEvent {
        workspace_id: workspace_id.clone(),
        message: json!({
            "method": "item/completed",
            "params": { "threadId": thread_id, "item": user_item }
        }),
    });

    // Build claude command
    let mut cmd = Command::new("claude");
    cmd.arg("--output-format").arg("stream-json");
    cmd.arg("--verbose");
    if let Some(ref sid) = session_id {
        cmd.arg("--resume").arg(sid);
    }
    cmd.arg("-p").arg(&text);
    if !workspace_cwd.is_empty() {
        cmd.current_dir(&workspace_cwd);
    }
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn claude: {e}"))?;
    let stdout = child.stdout.take().ok_or("missing stdout")?;

    tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        let mut new_session_id: Option<String> = None;
        // tool_use_id -> item_id
        let mut tool_item_ids: HashMap<String, String> = HashMap::new();

        while let Ok(Some(line)) = lines.next_line().await {
            let line = line.trim().to_string();
            if line.is_empty() {
                continue;
            }

            let event: Value = match serde_json::from_str(&line) {
                Ok(v) => v,
                Err(_) => continue,
            };

            let event_type = event.get("type").and_then(|t| t.as_str()).unwrap_or("");

            match event_type {
                "system" => {
                    if let Some(sid) = event.get("session_id").and_then(|s| s.as_str()) {
                        new_session_id = Some(sid.to_string());
                    }
                }
                "assistant" => {
                    let item_id = Uuid::new_v4().to_string();

                    event_sink.emit_app_server_event(AppServerEvent {
                        workspace_id: workspace_id.clone(),
                        message: json!({
                            "method": "item/started",
                            "params": {
                                "threadId": thread_id,
                                "item": {
                                    "type": "agentMessage",
                                    "id": item_id,
                                    "turnId": turn_id,
                                    "text": ""
                                }
                            }
                        }),
                    });

                    let mut full_text = String::new();
                    if let Some(content_arr) = event
                        .get("message")
                        .and_then(|m| m.get("content"))
                        .and_then(|c| c.as_array())
                    {
                        for block in content_arr {
                            if block.get("type").and_then(|t| t.as_str()) == Some("text") {
                                if let Some(chunk) = block.get("text").and_then(|t| t.as_str()) {
                                    full_text.push_str(chunk);
                                    event_sink.emit_app_server_event(AppServerEvent {
                                        workspace_id: workspace_id.clone(),
                                        message: json!({
                                            "method": "item/agentMessage/delta",
                                            "params": {
                                                "threadId": thread_id,
                                                "itemId": item_id,
                                                "delta": chunk
                                            }
                                        }),
                                    });
                                }
                            }
                        }
                    }

                    event_sink.emit_app_server_event(AppServerEvent {
                        workspace_id: workspace_id.clone(),
                        message: json!({
                            "method": "item/completed",
                            "params": {
                                "threadId": thread_id,
                                "item": {
                                    "type": "agentMessage",
                                    "id": item_id,
                                    "turnId": turn_id,
                                    "text": full_text
                                }
                            }
                        }),
                    });
                }
                "tool_use" => {
                    let tool_use_id = event
                        .get("id")
                        .and_then(|id| id.as_str())
                        .unwrap_or("")
                        .to_string();
                    let tool_name = event
                        .get("name")
                        .and_then(|n| n.as_str())
                        .unwrap_or("unknown")
                        .to_string();
                    let tool_input = event.get("input").cloned().unwrap_or(json!({}));
                    let item_id = format!("tool-{}", tool_use_id);
                    tool_item_ids.insert(tool_use_id.clone(), item_id.clone());

                    let command_str = serde_json::to_string(&tool_input).unwrap_or_default();
                    event_sink.emit_app_server_event(AppServerEvent {
                        workspace_id: workspace_id.clone(),
                        message: json!({
                            "method": "item/started",
                            "params": {
                                "threadId": thread_id,
                                "item": {
                                    "type": "commandExecution",
                                    "id": item_id,
                                    "turnId": turn_id,
                                    "toolUseId": tool_use_id,
                                    "name": tool_name,
                                    "command": command_str,
                                    "status": "running"
                                }
                            }
                        }),
                    });
                }
                "tool_result" => {
                    let tool_use_id = event
                        .get("tool_use_id")
                        .and_then(|id| id.as_str())
                        .unwrap_or("")
                        .to_string();
                    let item_id = tool_item_ids
                        .get(&tool_use_id)
                        .cloned()
                        .unwrap_or_else(|| format!("tool-{}", tool_use_id));

                    let output = match event.get("content") {
                        Some(Value::String(s)) => s.clone(),
                        Some(v) => serde_json::to_string(v).unwrap_or_default(),
                        None => String::new(),
                    };

                    event_sink.emit_app_server_event(AppServerEvent {
                        workspace_id: workspace_id.clone(),
                        message: json!({
                            "method": "item/completed",
                            "params": {
                                "threadId": thread_id,
                                "item": {
                                    "type": "commandExecution",
                                    "id": item_id,
                                    "turnId": turn_id,
                                    "toolUseId": tool_use_id,
                                    "status": "completed",
                                    "output": output
                                }
                            }
                        }),
                    });
                }
                "result" => {
                    if let Some(sid) = event.get("session_id").and_then(|s| s.as_str()) {
                        new_session_id = Some(sid.to_string());
                    }

                    event_sink.emit_app_server_event(AppServerEvent {
                        workspace_id: workspace_id.clone(),
                        message: json!({
                            "method": "thread/status/changed",
                            "params": {
                                "threadId": thread_id,
                                "status": { "type": "idle" }
                            }
                        }),
                    });

                    event_sink.emit_app_server_event(AppServerEvent {
                        workspace_id: workspace_id.clone(),
                        message: json!({
                            "method": "turn/completed",
                            "params": {
                                "threadId": thread_id,
                                "turnId": turn_id,
                                "turn": { "id": turn_id, "threadId": thread_id }
                            }
                        }),
                    });
                }
                "error" => {
                    let msg = event
                        .get("error")
                        .and_then(|e| e.as_str())
                        .or_else(|| event.get("message").and_then(|m| m.as_str()))
                        .unwrap_or("Unknown Claude error");

                    event_sink.emit_app_server_event(AppServerEvent {
                        workspace_id: workspace_id.clone(),
                        message: json!({
                            "method": "error",
                            "params": {
                                "threadId": thread_id,
                                "message": msg
                            }
                        }),
                    });

                    event_sink.emit_app_server_event(AppServerEvent {
                        workspace_id: workspace_id.clone(),
                        message: json!({
                            "method": "thread/status/changed",
                            "params": {
                                "threadId": thread_id,
                                "status": { "type": "idle" }
                            }
                        }),
                    });

                    event_sink.emit_app_server_event(AppServerEvent {
                        workspace_id: workspace_id.clone(),
                        message: json!({
                            "method": "turn/completed",
                            "params": {
                                "threadId": thread_id,
                                "turnId": turn_id,
                                "turn": { "id": turn_id, "threadId": thread_id }
                            }
                        }),
                    });
                }
                _ => {}
            }
        }

        if let Some(sid) = new_session_id {
            claude_state.set_session_id(&workspace_id, &thread_id, sid).await;
        }

        let _ = child.wait().await;
    });

    Ok(json!({ "ok": true }))
}
