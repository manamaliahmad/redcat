// RedCat backend — Rust + Tauri v2.
// Safety rule, enforced here (never in the prompt): read-only commands run;
// write/delete/send commands only run after the frontend approval card; a
// blocklist refuses destructive patterns outright. Secrets live in the OS
// keychain; the frontend never sees them.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod mcp;
mod mcp_remote;

use rand::{distributions::Alphanumeric, Rng};
use sha2::{Digest, Sha256};
use std::io::Read;
use std::process::{Command as ProcCommand, Stdio};
use std::time::Duration;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::Manager;
use wait_timeout::ChildExt;

const SERVICE: &str = "redcat";

// ---------- small helpers: app-data JSON files ----------

fn data_file(app: &tauri::AppHandle, name: &str) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(name))
}

fn read_json_file(path: &std::path::Path) -> serde_json::Value {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(serde_json::Value::Null)
}

fn write_json_file(path: &std::path::Path, value: &serde_json::Value) -> Result<(), String> {
    std::fs::write(path, serde_json::to_string_pretty(value).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}

fn mcp_servers(app: &tauri::AppHandle) -> Result<Vec<mcp::McpServer>, String> {
    let path = data_file(app, "mcp_servers.json")?;
    let v = read_json_file(&path);
    let mut out = Vec::new();
    if let Some(arr) = v["servers"].as_array() {
        for s in arr {
            let env_map = s["env"].as_object().cloned().unwrap_or_default();
            out.push(mcp::McpServer {
                name: s["name"].as_str().unwrap_or("").to_string(),
                command: s["command"].as_str().unwrap_or("").to_string(),
                args: s["args"]
                    .as_array()
                    .map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())
                    .unwrap_or_default(),
                env: env_map
                    .iter()
                    .filter_map(|(k, v)| v.as_str().map(|x| (k.clone(), x.to_string())))
                    .collect(),
                kind: s["kind"].as_str().unwrap_or("stdio").to_string(),
                url: s["url"].as_str().unwrap_or("").to_string(),
            });
        }
    }
    Ok(out)
}

fn find_mcp_server(app: &tauri::AppHandle, name: &str) -> Result<mcp::McpServer, String> {
    mcp_servers(app)?
        .into_iter()
        .find(|s| s.name == name)
        .ok_or_else(|| format!("No MCP server named '{}'. Add it on the Connect tab first.", name))
}

// Commands that may run without an approval card (read-only by nature).
const READ_ONLY: &[&str] = &[
    "dir", "ls", "echo", "cat", "type", "pwd", "whoami", "git status", "git log", "ipconfig",
    "ping", "systeminfo", "tasklist", "ps", "df", "free", "node --version", "npm --version",
];

// Patterns that are refused outright, even with approval.
const BLOCKED: &[&str] = &[
    "rm -rf /", "rm -rf /*", "format", "mkfs", "del /s", "del /q", "rmdir /s", "shutdown",
    "dd if=", ":(){", "cipher /w", "> /dev/sda",
];

fn key_entry(name: &str) -> keyring::Entry {
    keyring::Entry::new(SERVICE, name).expect("keyring entry")
}

fn is_blocked(cmd: &str) -> bool {
    let c = cmd.to_lowercase();
    BLOCKED.iter().any(|p| c.contains(p))
}

fn is_read_only(cmd: &str) -> bool {
    let c = cmd.trim_start().to_lowercase();
    READ_ONLY
        .iter()
        .any(|p| c == *p || c.starts_with(&format!("{} ", p)))
}

fn exec_shell(cmd: &str) -> Result<String, String> {
    let mut child = if cfg!(target_os = "windows") {
        ProcCommand::new("cmd")
            .args(["/C", cmd])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
    } else {
        ProcCommand::new("sh")
            .args(["-c", cmd])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
    }
    .map_err(|e| e.to_string())?;

    let status = child
        .wait_timeout(Duration::from_secs(30))
        .map_err(|e| e.to_string())?;
    let status = match status {
        Some(s) => s,
        None => {
            let _ = child.kill();
            return Err("Command timed out after 30 seconds.".to_string());
        }
    };

    let mut out = String::new();
    if let Some(mut stdout) = child.stdout.take() {
        let _ = stdout.read_to_string(&mut out);
    }
    let mut err = String::new();
    if let Some(mut stderr) = child.stderr.take() {
        let _ = stderr.read_to_string(&mut err);
    }
    let mut combined = out;
    if !err.is_empty() {
        combined.push_str(&err);
    }
    if combined.len() > 4000 {
        combined.truncate(4000);
        combined.push_str("\n…(output truncated)");
    }
    if status.success() {
        Ok(combined)
    } else {
        Err(format!("Exit {}: {}", status, combined))
    }
}

#[tauri::command]
fn run_command(cmd: String) -> Result<String, String> {
    if is_blocked(&cmd) {
        return Err("Blocked: this command pattern is never allowed.".to_string());
    }
    if !is_read_only(&cmd) {
        return Err("This command changes state, so it needs your approval first.".to_string());
    }
    exec_shell(&cmd)
}

#[tauri::command]
fn run_command_approved(cmd: String) -> Result<String, String> {
    if is_blocked(&cmd) {
        return Err("Blocked: this command pattern is never allowed.".to_string());
    }
    exec_shell(&cmd)
}

#[tauri::command]
fn open_app(name: String) -> Result<String, String> {
    if cfg!(target_os = "windows") {
        ProcCommand::new("cmd")
            .args(["/C", "start", "", &name])
            .spawn()
            .map_err(|e| e.to_string())?;
    } else if cfg!(target_os = "macos") {
        ProcCommand::new("open")
            .args(["-a", &name])
            .spawn()
            .map_err(|e| e.to_string())?;
    } else {
        ProcCommand::new("xdg-open")
            .arg(&name)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(format!("Opened {}.", name))
}

#[tauri::command]
fn save_api_key(key: String, name: Option<String>) -> Result<(), String> {
    let entry = name.unwrap_or_else(|| "api_key".to_string());
    key_entry(&entry)
        .set_password(&key)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_api_key_status(name: Option<String>) -> bool {
    let entry = name.unwrap_or_else(|| "api_key".to_string());
    key_entry(&entry).get_password().is_ok()
}

const CHAT_SYSTEM: &str = "You are RedCat, a friendly desktop cat assistant. Default language: English. Always reply in the same language the user writes in. Keep answers short and useful. You can run PC commands only when the user approves them through the app; never claim you ran something you did not.";

// Shared model call used by plain chat and by the agent loop.
async fn call_model(
    message: String,
    system: &str,
    endpoint: &str,
    model: &str,
    provider: &str,
) -> Result<String, String> {
    if provider == "anthropic" {
        // Claude via Anthropic's Messages API. "Login with Claude" in RedCat
        // means: your own Anthropic API key (console.anthropic.com). There is
        // no consumer OAuth login that substitutes for an API key, so RedCat
        // does not pretend otherwise.
        let key = key_entry("anthropic_api_key").get_password().map_err(|_| {
            "No Claude API key saved yet. Open Settings, pick Claude, and save your key first."
                .to_string()
        })?;
        let client = reqwest::Client::new();
        let resp = client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", key)
            .header("anthropic-version", "2023-06-01")
            .json(&serde_json::json!({
                "model": model,
                "max_tokens": 1024,
                "system": system,
                "messages": [{ "role": "user", "content": message }]
            }))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
        return body["content"][0]["text"]
            .as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| format!("Unexpected Claude response: {}", body));
    }
    let key = key_entry("api_key")
        .get_password()
        .map_err(|_| "No API key saved yet. Open Settings and save your key first.".to_string())?;
    let url = format!("{}/chat/completions", endpoint.trim_end_matches('/'));
    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .bearer_auth(key)
        .json(&serde_json::json!({
            "model": model,
            "messages": [
                { "role": "system", "content": system },
                { "role": "user", "content": message }
            ],
            "temperature": 0.7
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    body["choices"][0]["message"]["content"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| format!("Unexpected AI response: {}", body))
}

#[tauri::command]
async fn chat_complete(
    message: String,
    endpoint: String,
    model: String,
    provider: Option<String>,
) -> Result<String, String> {
    let provider = provider.unwrap_or_else(|| "openai".to_string());
    call_model(message, CHAT_SYSTEM, &endpoint, &model, &provider).await
}

#[tauri::command]
fn get_system_info() -> String {
    format!(
        "RedCat v0.3.1 · {} / {}",
        std::env::consts::OS,
        std::env::consts::ARCH
    )
}

// ---------- MCP servers (the universal connector) ----------
// One MCP integration opens 100+ tools: Zapier MCP, Notion, GitHub, Slack,
// and every other MCP server — no per-service code needed in RedCat.

#[tauri::command]
fn mcp_list_servers(app: tauri::AppHandle) -> Result<Vec<serde_json::Value>, String> {
    Ok(mcp_servers(&app)?
        .iter()
        .map(|s| {
            serde_json::json!({"name": s.name, "command": s.command, "args": s.args})
        })
        .collect())
}

#[tauri::command]
fn mcp_add_server(
    app: tauri::AppHandle,
    name: String,
    command: String,
    args_text: String,
    env_text: String,
    kind: Option<String>,
    url: Option<String>,
) -> Result<(), String> {
    let path = data_file(&app, "mcp_servers.json")?;
    let mut v = read_json_file(&path);
    if v.is_null() {
        v = serde_json::json!({"servers": []});
    }
    let args: Vec<String> = args_text.split_whitespace().map(|s| s.to_string()).collect();
    let mut env = serde_json::Map::new();
    for line in env_text.lines() {
        if let Some((k, val)) = line.split_once('=') {
            env.insert(k.trim().to_string(), serde_json::Value::String(val.trim().to_string()));
        }
    }
    let arr = v["servers"].as_array_mut().ok_or("Bad mcp_servers.json")?;
    arr.retain(|s| s["name"] != name);
    arr.push(serde_json::json!({
        "name": name,
        "command": command,
        "args": args,
        "env": env,
        "kind": kind.unwrap_or_else(|| "stdio".to_string()),
        "url": url.unwrap_or_default()
    }));
    write_json_file(&path, &v)
}

#[tauri::command]
fn mcp_remove_server(app: tauri::AppHandle, name: String) -> Result<(), String> {
    let path = data_file(&app, "mcp_servers.json")?;
    let mut v = read_json_file(&path);
    if let Some(arr) = v["servers"].as_array_mut() {
        arr.retain(|s| s["name"] != name);
    }
    write_json_file(&path, &v)
}

#[tauri::command]
async fn mcp_list_tools(app: tauri::AppHandle, server: String) -> Result<Vec<serde_json::Value>, String> {
    let srv = find_mcp_server(&app, &server)?;
    if srv.kind == "remote" {
        let tools = mcp_remote::list_tools(&srv.url, &srv.name).await?;
        return Ok(tools
            .iter()
            .map(|t| {
                serde_json::json!({"name": t["name"], "description": t["description"]})
            })
            .collect());
    }
    let tools = tokio::task::spawn_blocking(move || mcp::list_tools(&srv))
        .await
        .map_err(|e| e.to_string())??;
    Ok(tools
        .iter()
        .map(|t| {
            serde_json::json!({"name": t["name"], "description": t["description"]})
        })
        .collect())
}

#[tauri::command]
async fn mcp_call_tool(
    app: tauri::AppHandle,
    server: String,
    tool: String,
    args_json: String,
) -> Result<String, String> {
    let srv = find_mcp_server(&app, &server)?;
    let args: serde_json::Value =
        serde_json::from_str(&args_json).unwrap_or(serde_json::json!({}));
    if srv.kind == "remote" {
        let res = mcp_remote::call_tool(&srv.url, &srv.name, &tool, args).await?;
        return Ok(res.to_string());
    }
    let res = tokio::task::spawn_blocking(move || mcp::call_tool(&srv, &tool, args))
        .await
        .map_err(|e| e.to_string())??;
    Ok(res.to_string())
}

// ---------- MCP sessions: one server = one session ----------

#[tauri::command]
fn mcp_start_session(app: tauri::AppHandle, server: String) -> Result<(), String> {
    let srv = find_mcp_server(&app, &server)?;
    if srv.kind == "remote" {
        return Err("Remote servers start their session on first use — no start step needed.".to_string());
    }
    mcp::start_session(&srv)
}

#[tauri::command]
fn mcp_stop_session(server: String) -> bool {
    mcp::stop_session(&server)
}

#[tauri::command]
fn mcp_sessions() -> Vec<String> {
    mcp::list_sessions()
}

// ---------- Zapier webhook trigger ----------

#[tauri::command]
async fn zapier_trigger(url: String, payload_json: String) -> Result<String, String> {
    let payload: serde_json::Value =
        serde_json::from_str(&payload_json).unwrap_or(serde_json::json!({"from": "RedCat"}));
    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    Ok(format!("Zapier answered {}: {}", status, text))
}

// ---------- Connector catalog ----------

#[tauri::command]
fn list_connectors(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let gmail = key_entry("gmail_access").get_password().is_ok();
    let mcp_count = mcp_servers(&app).map(|v| v.len()).unwrap_or(0);
    Ok(serde_json::json!({
        "gmail": { "connected": gmail, "method": "Google OAuth (your own client ID)", "what": "Read inbox, search mail" },
        "zapier": { "connected": false, "method": "Webhook URL or Zapier MCP server", "what": "Trigger any Zap from chat or a pipeline" },
        "mcp": { "servers": mcp_count, "method": "Any MCP server (stdio)", "what": "Zapier, Notion, GitHub, Slack and 100+ tools via MCP" },
        "calendar": { "connected": false, "method": "Google OAuth (v0.3)", "what": "Read events, create events behind approval" },
        "drive": { "connected": false, "method": "Google OAuth (v0.3)", "what": "Browse and fetch files" },
        "github": { "connected": false, "method": "MCP server or token (v0.3)", "what": "List repos, read issues" },
        "slack": { "connected": false, "method": "MCP server (v0.3)", "what": "Read and post messages behind approval" },
        "notion": { "connected": false, "method": "MCP server (v0.3)", "what": "Read and search pages" }
    }))
}

// ---------- Agent loop: reasoning + tool use, approval-gated writes ----------
// The model thinks in JSON actions. Read-only tools run on their own
// (inbox, read-only shell, read-like MCP tools, browser reads). Anything
// that WRITES — a shell command that is not read-only, an MCP tool whose
// name smells like a write (send/create/post/click/type/fill/...) — stops
// the loop and comes back as a proposal for the user's approval card.
// The agent never executes a write on its own. That is the whole safety
// model, and it is also what makes the reasoning trustworthy: every step's
// observation is real output, never a claim.

fn parse_agent_json(reply: &str) -> serde_json::Value {
    let mut text = reply.trim();
    if let Some(stripped) = text.strip_prefix("```json") {
        text = stripped;
    } else if let Some(stripped) = text.strip_prefix("```") {
        text = stripped;
    }
    if let Some(stripped) = text.strip_suffix("```") {
        text = stripped;
    }
    let text = text.trim();
    if let (Some(start), Some(end)) = (text.find('{'), text.rfind('}')) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text[start..=end]) {
            return v;
        }
    }
    serde_json::json!({"think": "", "tool": "none", "final": reply})
}

fn mcp_tool_is_write(tool_name: &str) -> bool {
    let t = tool_name.to_lowercase();
    [
        "send", "create", "post", "update", "delete", "remove", "publish", "trigger",
        "insert", "write", "upload", "run", "execute", "click", "type", "fill", "press",
        "select", "submit", "set_",
    ]
    .iter()
    .any(|p| t.contains(p))
}

#[tauri::command]
async fn agent_run(
    app: tauri::AppHandle,
    task: String,
    endpoint: String,
    model: String,
    provider: Option<String>,
) -> Result<serde_json::Value, String> {
    let provider = provider.unwrap_or_else(|| "openai".to_string());
    // Tool inventory from the user's own enabled servers.
    let mut inventory = String::from(
        "gmail_list — read the 10 latest inbox messages.\nrun_command — read-only shell commands only (anything else becomes a proposal).\n",
    );
    if let Ok(list) = mcp_servers(&app) {
        for srv in list {
            let tools = if srv.kind == "remote" {
                mcp_remote::list_tools(&srv.url, &srv.name)
                    .await
                    .unwrap_or_default()
            } else {
                let s2 = srv.clone();
                tokio::task::spawn_blocking(move || mcp::list_tools(&s2))
                    .await
                    .ok()
                    .and_then(|r| r.ok())
                    .unwrap_or_default()
            };
            let names: Vec<String> = tools
                .iter()
                .filter_map(|t| t["name"].as_str().map(|s| s.to_string()))
                .take(40)
                .collect();
            if names.is_empty() {
                inventory.push_str(&format!("mcp server '{}': (tools could not be listed)\n", srv.name));
            } else {
                inventory.push_str(&format!("mcp server '{}': {}\n", srv.name, names.join(", ")));
            }
        }
    }
    let system = format!(
        "You are RedCat's agent brain. Think step by step, then act with tools, one action at a time. Default language: English; answer in the user's language. Reply ONLY with one JSON object: {{\"think\": \"your reasoning for this step\", \"tool\": \"none|gmail_list|run_command|mcp\", \"server\": \"mcp server name (for mcp)\", \"tool_name\": \"tool to call (for mcp)\", \"args\": {{\"command\": \"...\"}} for run_command or the tool's arguments for mcp, \"final\": \"final answer or proposal\"}}. Rules: read-only tools run freely. If the task needs a WRITE action, set tool to \"none\" and put the exact proposed action in final starting with \"PROPOSED:\". Never claim you did something you did not. If the task is done, set tool to \"none\" and put the answer in final.\n\nTOOLS AVAILABLE:\n{}",
        inventory
    );
    let mut history = format!("TASK: {}\n", task);
    let mut thoughts: Vec<String> = Vec::new();
    let mut steps: Vec<serde_json::Value> = Vec::new();
    for _ in 0..6 {
        let reply = call_model(history.clone(), &system, &endpoint, &model, &provider).await?;
        let parsed = parse_agent_json(&reply);
        let think = parsed["think"].as_str().unwrap_or("").to_string();
        if !think.is_empty() {
            thoughts.push(think.clone());
        }
        let tool = parsed["tool"].as_str().unwrap_or("none");
        if tool == "none" {
            let final_text = parsed["final"].as_str().unwrap_or("").to_string();
            return Ok(serde_json::json!({"thinking": thoughts, "steps": steps, "final": final_text, "proposal": serde_json::Value::Null}));
        }
        let observation = match tool {
            "gmail_list" => gmail_list()
                .await
                .map(|v| v.join("\n"))
                .unwrap_or_else(|e| format!("error: {}", e)),
            "run_command" => {
                let cmd = parsed["args"]["command"].as_str().unwrap_or("");
                if is_blocked(cmd) {
                    "refused: blocked pattern, will not run.".to_string()
                } else if is_read_only(cmd) {
                    exec_shell(cmd).unwrap_or_else(|e| format!("error: {}", e))
                } else {
                    return Ok(serde_json::json!({
                        "thinking": thoughts, "steps": steps,
                        "final": format!("PROPOSED: run this command (needs your approval): {}", cmd),
                        "proposal": {"kind": "command", "command": cmd}
                    }));
                }
            }
            "mcp" => {
                let server = parsed["server"].as_str().unwrap_or("");
                let tool_name = parsed["tool_name"].as_str().unwrap_or("");
                let args = parsed["args"].clone();
                if mcp_tool_is_write(tool_name) {
                    return Ok(serde_json::json!({
                        "thinking": thoughts, "steps": steps,
                        "final": format!("PROPOSED: call {}.{} (needs your approval)", server, tool_name),
                        "proposal": {"kind": "mcp", "server": server, "tool": tool_name, "args": args}
                    }));
                }
                match find_mcp_server(&app, server) {
                    Ok(srv) => {
                        if srv.kind == "remote" {
                            mcp_remote::call_tool(&srv.url, &srv.name, tool_name, args)
                                .await
                                .map(|v| v.to_string())
                                .unwrap_or_else(|e| format!("error: {}", e))
                        } else {
                            let s2 = srv.clone();
                            tokio::task::spawn_blocking(move || {
                                mcp::call_tool(&s2, tool_name, args)
                            })
                            .await
                            .ok()
                            .and_then(|r| r.ok())
                            .map(|v| v.to_string())
                            .unwrap_or_else(|| "error: MCP call failed".to_string())
                        }
                    }
                    Err(e) => format!("error: {}", e),
                }
            }
            other => format!("unknown tool: {}", other),
        };
        let obs_short: String = observation.chars().take(2000).collect();
        steps.push(serde_json::json!({"think": think, "tool": tool, "observation": obs_short}));
        history.push_str(&format!("\nTHINK: {}\nTOOL: {} -> OBSERVATION: {}\n", think, tool, obs_short));
    }
    Ok(serde_json::json!({
        "thinking": thoughts, "steps": steps,
        "final": "I ran 6 steps without a final answer. Tell me how to continue, or approve the last proposal.",
        "proposal": serde_json::Value::Null
    }))
}

// ---------- Pipelines: multi-step agent workflows ----------
// A pipeline is an ordered list of steps. {{prev}} in a step's input is
// replaced with the previous step's output, so steps chain: list inbox ->
// summarize -> send. Running a pipeline counts as the user's approval for
// its steps; the blocklist still refuses destructive commands outright.

fn builtin_pipelines() -> serde_json::Value {
    serde_json::json!([
        { "name": "Morning briefing", "builtin": true, "steps": [
            { "tool": "gmail_list", "input": "" },
            { "tool": "chat", "input": "Summarize these emails in 5 short bullets, most important first:\n{{prev}}" }
        ]},
        { "name": "Inbox zero digest", "builtin": true, "steps": [
            { "tool": "gmail_list", "input": "" },
            { "tool": "chat", "input": "From these emails, list only the ones that need a reply, with a one-line suggested reply each:\n{{prev}}" }
        ]}
    ])
}

#[tauri::command]
fn list_pipelines(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let path = data_file(&app, "pipelines.json")?;
    let custom = read_json_file(&path);
    let mut out = builtin_pipelines().as_array().cloned().unwrap_or_default();
    if let Some(arr) = custom.as_array() {
        out.extend(arr.iter().cloned());
    }
    Ok(serde_json::Value::Array(out))
}

#[tauri::command]
fn save_pipeline(app: tauri::AppHandle, name: String, steps_json: String) -> Result<(), String> {
    let steps: serde_json::Value = serde_json::from_str(&steps_json)
        .map_err(|e| format!("Steps must be valid JSON: {}", e))?;
    let path = data_file(&app, "pipelines.json")?;
    let mut custom = read_json_file(&path);
    if !custom.is_array() {
        custom = serde_json::Value::Array(vec![]);
    }
    let arr = custom.as_array_mut().unwrap();
    arr.retain(|p| p["name"] != name);
    arr.push(serde_json::json!({"name": name, "builtin": false, "steps": steps}));
    write_json_file(&path, &custom)
}

#[tauri::command]
fn delete_pipeline(app: tauri::AppHandle, name: String) -> Result<(), String> {
    let path = data_file(&app, "pipelines.json")?;
    let mut custom = read_json_file(&path);
    if let Some(arr) = custom.as_array_mut() {
        arr.retain(|p| p["name"] != name);
    }
    write_json_file(&path, &custom)
}

#[tauri::command]
async fn run_pipeline(
    app: tauri::AppHandle,
    name: String,
    endpoint: String,
    model: String,
    provider: Option<String>,
) -> Result<String, String> {
    let all = list_pipelines(app.clone())?;
    let pipe = all
        .as_array()
        .and_then(|arr| arr.iter().find(|p| p["name"] == name))
        .ok_or_else(|| format!("No pipeline named '{}'.", name))?
        .clone();
    let steps = pipe["steps"].as_array().cloned().unwrap_or_default();
    let mut prev = String::new();
    let mut transcript = String::new();
    for (i, step) in steps.iter().enumerate() {
        let tool = step["tool"].as_str().unwrap_or("");
        let raw_input = step["input"].as_str().unwrap_or("");
        let input = raw_input.replace("{{prev}}", &prev);
        let out = match tool {
            "gmail_list" => {
                let items = gmail_list().await?;
                items.join("\n")
            }
            "chat" => {
                chat_complete(input, endpoint.clone(), model.clone(), provider.clone()).await?
            }
            "run_command" => {
                if is_blocked(&input) {
                    return Err(format!("Step {} blocked: destructive pattern refused.", i + 1));
                }
                exec_shell(&input)?
            }
            "mcp_call" => {
                let server = step["server"].as_str().unwrap_or("");
                let tool_name = step["tool_name"].as_str().unwrap_or("");
                let args: serde_json::Value =
                    serde_json::from_str(&input).unwrap_or(serde_json::json!({}));
                let srv = find_mcp_server(&app, server)?;
                if srv.kind == "remote" {
                    mcp_remote::call_tool(&srv.url, &srv.name, tool_name, args).await?.to_string()
                } else {
                    let s2 = srv.clone();
                    tokio::task::spawn_blocking(move || mcp::call_tool(&s2, tool_name, args))
                        .await
                        .map_err(|e| e.to_string())??
                        .to_string()
                }
            }
            "zapier" => {
                zapier_trigger(input, "{\"from\": \"RedCat pipeline\"}".to_string()).await?
            }
            other => return Err(format!("Step {}: unknown tool '{}'.", i + 1, other)),
        };
        transcript.push_str(&format!("--- Step {} ({}) ---\n{}\n", i + 1, tool, out));
        prev = out;
    }
    Ok(transcript)
}

#[tauri::command]
fn show_main(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

// ---------- Gmail (BYO Google OAuth, desktop/PKCE flow) ----------

fn pct(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

#[tauri::command]
fn gmail_auth_url(client_id: String) -> Result<String, String> {
    let verifier: String = rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(64)
        .map(char::from)
        .collect();
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let challenge = base64::Engine::encode(
        &base64::engine::general_purpose::URL_SAFE_NO_PAD,
        hasher.finalize(),
    );
    key_entry("gmail_verifier")
        .set_password(&verifier)
        .map_err(|e| e.to_string())?;
    Ok(format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri=http://localhost&response_type=code&scope={}&access_type=offline&prompt=consent&code_challenge={}&code_challenge_method=S256",
        pct(&client_id),
        pct("https://www.googleapis.com/auth/gmail.readonly"),
        challenge
    ))
}

#[tauri::command]
async fn gmail_exchange(code: String, client_id: String) -> Result<(), String> {
    let verifier = key_entry("gmail_verifier")
        .get_password()
        .map_err(|_| "No pending Gmail auth. Click Connect Gmail first.".to_string())?;
    let client = reqwest::Client::new();
    let resp = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", code.as_str()),
            ("client_id", client_id.as_str()),
            ("redirect_uri", "http://localhost"),
            ("grant_type", "authorization_code"),
            ("code_verifier", verifier.as_str()),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let access = body["access_token"]
        .as_str()
        .ok_or_else(|| format!("Token exchange failed: {}", body))?;
    key_entry("gmail_access")
        .set_password(access)
        .map_err(|e| e.to_string())?;
    if let Some(refresh) = body["refresh_token"].as_str() {
        let _ = key_entry("gmail_refresh").set_password(refresh);
    }
    let _ = key_entry("gmail_verifier").delete_credential();
    Ok(())
}

async fn gmail_get(client: &reqwest::Client, url: &str, token: &str) -> Result<serde_json::Value, String> {
    let resp = client
        .get(url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    if status.is_success() {
        Ok(body)
    } else {
        Err(format!("Gmail API {}: {}", status, body))
    }
}

#[tauri::command]
async fn gmail_list() -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let mut token = key_entry("gmail_access")
        .get_password()
        .map_err(|_| "Gmail is not connected yet. Connect it on the Connect tab.".to_string())?;

    let mut list = gmail_get(
        &client,
        "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10",
        &token,
    )
    .await;
    if list.is_err() {
        // Try one token refresh, then retry once.
        if let Ok(refresh) = key_entry("gmail_refresh").get_password() {
            let resp = client
                .post("https://oauth2.googleapis.com/token")
                .form(&[
                    ("grant_type", "refresh_token"),
                    ("refresh_token", refresh.as_str()),
                ])
                .send()
                .await
                .map_err(|e| e.to_string())?;
            let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
            if let Some(new_access) = body["access_token"].as_str() {
                let _ = key_entry("gmail_access").set_password(new_access);
                token = new_access.to_string();
                list = gmail_get(
                    &client,
                    "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10",
                    &token,
                )
                .await;
            }
        }
    }
    let list = list?;
    let mut out = Vec::new();
    if let Some(msgs) = list["messages"].as_array() {
        for m in msgs.iter().take(10) {
            let id = m["id"].as_str().unwrap_or("");
            let detail = gmail_get(
                &client,
                &format!(
                    "https://gmail.googleapis.com/gmail/v1/users/me/messages/{}?format=metadata&metadataHeaders=Subject&metadataHeaders=From",
                    id
                ),
                &token,
            )
            .await
            .unwrap_or(serde_json::json!({}));
            let mut from = "";
            let mut subject = "";
            if let Some(headers) = detail["payload"]["headers"].as_array() {
                for h in headers {
                    match h["name"].as_str() {
                        Some("From") => from = h["value"].as_str().unwrap_or(""),
                        Some("Subject") => subject = h["value"].as_str().unwrap_or(""),
                        _ => {}
                    }
                }
            }
            out.push(format!("{} — {}", from, subject));
        }
    }
    Ok(out)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            run_command,
            run_command_approved,
            open_app,
            save_api_key,
            get_api_key_status,
            chat_complete,
            agent_run,
            get_system_info,
            show_main,
            gmail_auth_url,
            gmail_exchange,
            gmail_list,
            mcp_list_servers,
            mcp_add_server,
            mcp_remove_server,
            mcp_list_tools,
            mcp_call_tool,
            mcp_start_session,
            mcp_stop_session,
            mcp_sessions,
            zapier_trigger,
            list_connectors,
            list_pipelines,
            save_pipeline,
            delete_pipeline,
            run_pipeline
        ])
        .setup(|app| {
            // System tray: the taskbar presence. Windows has no live taskbar
            // widgets, so the tray icon + floating pet are the real pattern.
            let show = MenuItemBuilder::new("Show RedCat").id("show").build(app)?;
            let quit = MenuItemBuilder::new("Quit").id("quit").build(app)?;
            let menu = MenuBuilder::new(app).items(&[&show, &quit]).build()?;
            let mut tray = TrayIconBuilder::new().menu(&menu).on_menu_event(|app, event| {
                match event.id().as_ref() {
                    "quit" => app.exit(0),
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    _ => {}
                }
            });
            if let Some(icon) = app.default_window_icon().cloned() {
                tray = tray.icon(icon);
            }
            tray.build(app)?;

            // Park the pet at the bottom-right of the primary monitor.
            if let Some(pet) = app.get_webview_window("pet") {
                if let Ok(Some(monitor)) = pet.primary_monitor() {
                    let size = monitor.size();
                    let scale = monitor.scale_factor();
                    let x = (size.width as f64 / scale) - 150.0 - 24.0;
                    let y = (size.height as f64 / scale) - 150.0 - 24.0;
                    let _ = pet.set_position(tauri::Position::Logical(tauri::LogicalPosition {
                        x,
                        y,
                    }));
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running RedCat");
}
