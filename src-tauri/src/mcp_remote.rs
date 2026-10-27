// Remote MCP client (Streamable HTTP transport, MCP 2025-03-26).
//
// This is what unlocks Zapier MCP and other hosted servers: the server does
// NOT run on the user's PC, it lives at a URL. RedCat POSTs JSON-RPC to it
// and keeps one session id per server (its own session, like stdio).
//
// Supported: Streamable HTTP endpoints (e.g. Zapier's connect URL,
// https://mcp.zapier.com/api/v1/connect). Legacy SSE-only endpoints
// (.../sse) are NOT supported — the error message says so plainly, and the
// fix is to use the server's newer Streamable HTTP URL.

use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

fn session_ids() -> &'static Mutex<HashMap<String, String>> {
    static MAP: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    MAP.get_or_init(|| Mutex::new(HashMap::new()))
}

fn get_session(name: &str) -> Option<String> {
    session_ids().lock().ok()?.get(name).cloned()
}

fn set_session(name: &str, id: &str) {
    if let Ok(mut m) = session_ids().lock() {
        m.insert(name.to_string(), id.to_string());
    }
}

fn clear_session(name: &str) {
    if let Ok(mut m) = session_ids().lock() {
        m.remove(name);
    }
}

async fn post_rpc(
    url: &str,
    body: &Value,
    session_id: Option<&str>,
) -> Result<(Option<String>, Value), String> {
    let client = reqwest::Client::new();
    let mut req = client
        .post(url)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json, text/event-stream")
        .json(body);
    if let Some(sid) = session_id {
        if !sid.is_empty() {
            req = req.header("Mcp-Session-Id", sid);
        }
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let new_session = resp
        .headers()
        .get("mcp-session-id")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        if content_type.contains("text/event-stream") {
            return Err(format!("Remote MCP server answered {} (SSE-only endpoint? Use its Streamable HTTP URL).", status));
        }
        return Err(format!("Remote MCP server answered {}: {}", status, text));
    }
    if text.trim().is_empty() {
        return Ok((new_session, Value::Null));
    }
    if content_type.contains("text/event-stream") {
        // SSE: one or more `data: {...}` lines; take the last JSON-RPC message.
        let mut last = Value::Null;
        for line in text.lines() {
            if let Some(data) = line.strip_prefix("data:") {
                if let Ok(v) = serde_json::from_str::<Value>(data.trim()) {
                    last = v;
                }
            }
        }
        if last.is_null() {
            return Err("Remote MCP server sent an empty event stream.".to_string());
        }
        return Ok((new_session, last));
    }
    let v: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    Ok((new_session, v))
}

fn check_error(v: &Value) -> Result<Value, String> {
    if let Some(err) = v.get("error") {
        return Err(format!("Remote MCP error: {}", err));
    }
    v.get("result")
        .cloned()
        .ok_or_else(|| "Remote MCP response had no result.".to_string())
}

async fn ensure_session(url: &str, name: &str) -> Result<String, String> {
    if let Some(sid) = get_session(name) {
        return Ok(sid);
    }
    let init = json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{
        "protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"RedCat","version":"0.3.0"}}});
    let (new_session, v) = post_rpc(url, &init, None).await?;
    check_error(&v)?;
    let sid = new_session.unwrap_or_default();
    set_session(name, &sid);
    // Fire-and-forget initialized notification (a 202 with no body is fine).
    let notif = json!({"jsonrpc":"2.0","method":"notifications/initialized"});
    let _ = post_rpc(url, &notif, Some(&sid)).await;
    Ok(sid)
}

async fn call(url: &str, name: &str, method: &str, params: Value) -> Result<Value, String> {
    let sid = ensure_session(url, name).await?;
    let req = json!({"jsonrpc":"2.0","id":2,"method":method,"params":params});
    match post_rpc(url, &req, Some(&sid)).await {
        Ok((_, v)) => check_error(&v),
        Err(e) => {
            // A dead session id comes back as 404 — retry once with a fresh one.
            if e.contains("404") {
                clear_session(name);
                let sid2 = ensure_session(url, name).await?;
                let (_, v) = post_rpc(url, &req, Some(&sid2)).await?;
                return check_error(&v);
            }
            Err(e)
        }
    }
}

pub async fn list_tools(url: &str, name: &str) -> Result<Vec<Value>, String> {
    let res = call(url, name, "tools/list", json!({})).await?;
    Ok(res["tools"].as_array().cloned().unwrap_or_default())
}

pub async fn call_tool(url: &str, name: &str, tool: &str, args: Value) -> Result<Value, String> {
    call(url, name, "tools/call", json!({"name": tool, "arguments": args})).await
}
