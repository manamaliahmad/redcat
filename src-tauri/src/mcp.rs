// MCP (Model Context Protocol) stdio client for RedCat, with sessions.
//
// Two modes:
// 1. One-shot (v0.2 behaviour): spawn the server, initialize, one request,
//    kill it. Works for every stateless server.
// 2. Session (v0.3): one server = one long-lived process. start_session()
//    spawns it once and keeps it running; every later call reuses that
//    process. Each server has its OWN session — state never leaks between
//    servers, and a crash in one server touches nothing else.
//
// Protocol: JSON-RPC 2.0 over stdin/stdout:
// initialize -> notifications/initialized -> tools/list | tools/call.

use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command as ProcCommand, Stdio};
use std::sync::mpsc;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

#[derive(Clone)]
pub struct McpServer {
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
    pub kind: String, // "stdio" (default) or "remote"
    pub url: String,  // remote MCP endpoint (Streamable HTTP)
}

struct Session {
    write_tx: mpsc::Sender<String>,
    read_rx: Mutex<mpsc::Receiver<String>>,
    next_id: Mutex<u64>,
    child: Mutex<Child>,
}

fn sessions_map() -> &'static Mutex<HashMap<String, Arc<Session>>> {
    static MAP: OnceLock<Mutex<HashMap<String, Arc<Session>>>> = OnceLock::new();
    MAP.get_or_init(|| Mutex::new(HashMap::new()))
}

fn spawn_process(server: &McpServer) -> Result<Child, String> {
    let mut cmd = ProcCommand::new(&server.command);
    cmd.args(&server.args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    for (k, v) in &server.env {
        cmd.env(k, v);
    }
    cmd.spawn()
        .map_err(|e| format!("Could not start MCP server '{}': {}", server.name, e))
}

fn send_line(tx: &mpsc::Sender<String>, value: &Value) -> Result<(), String> {
    tx.send(value.to_string()).map_err(|e| e.to_string())
}

fn wait_for_id(
    rx: &mpsc::Receiver<String>,
    want: u64,
    timeout: Duration,
) -> Result<Value, String> {
    let start = std::time::Instant::now();
    loop {
        let left = timeout.saturating_sub(start.elapsed());
        if left.is_zero() {
            return Err("MCP server did not answer in time.".to_string());
        }
        match rx.recv_timeout(left) {
            Ok(line) => {
                if let Ok(v) = serde_json::from_str::<Value>(&line) {
                    if v["id"] == want {
                        if let Some(err) = v.get("error") {
                            return Err(format!("MCP error: {}", err));
                        }
                        return v
                            .get("result")
                            .cloned()
                            .ok_or_else(|| "MCP response had no result.".to_string());
                    }
                    // Anything else (notifications, other ids) is skipped.
                }
            }
            Err(_) => return Err("MCP server stopped answering.".to_string()),
        }
    }
}

pub fn start_session(server: &McpServer) -> Result<(), String> {
    if sessions_map().lock().map_err(|e| e.to_string())?.contains_key(&server.name) {
        return Ok(()); // already running — a session is never started twice
    }
    let mut child = spawn_process(server)?;
    let mut stdin = child.stdin.take().ok_or("MCP server has no stdin")?;
    let stdout = child.stdout.take().ok_or("MCP server has no stdout")?;
    let (write_tx, write_rx) = mpsc::channel::<String>();
    let (read_tx, read_rx) = mpsc::channel::<String>();
    std::thread::spawn(move || {
        while let Ok(line) = write_rx.recv() {
            if writeln!(stdin, "{}", line).is_err() || stdin.flush().is_err() {
                break;
            }
        }
    });
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(l) => {
                    if read_tx.send(l).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });
    let session = Arc::new(Session {
        write_tx,
        read_rx: Mutex::new(read_rx),
        next_id: Mutex::new(2),
        child: Mutex::new(child),
    });
    // Handshake on the fresh session.
    let init = json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{
        "protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"RedCat","version":"0.3.1"}}});
    let notif = json!({"jsonrpc":"2.0","method":"notifications/initialized"});
    send_line(&session.write_tx, &init)?;
    send_line(&session.write_tx, &notif)?;
    let rx = session.read_rx.lock().map_err(|e| e.to_string())?;
    let res = wait_for_id(&rx, 1, Duration::from_secs(20));
    drop(rx);
    if let Err(e) = res {
        if let Ok(mut c) = session.child.lock() {
            let _ = c.kill();
        }
        return Err(e);
    }
    sessions_map()
        .lock()
        .map_err(|e| e.to_string())?
        .insert(server.name.clone(), session);
    Ok(())
}

pub fn stop_session(name: &str) -> bool {
    let removed = sessions_map()
        .lock()
        .ok()
        .and_then(|mut m| m.remove(name));
    if let Some(session) = removed {
        if let Ok(mut c) = session.child.lock() {
            let _ = c.kill();
            let _ = c.wait();
        }
        return true;
    }
    false
}

pub fn list_sessions() -> Vec<String> {
    sessions_map()
        .lock()
        .map(|m| m.keys().cloned().collect())
        .unwrap_or_default()
}

fn session_call(server: &McpServer, method: &str, params: Value) -> Option<Result<Value, String>> {
    let session = sessions_map()
        .lock()
        .ok()?
        .get(&server.name)
        .cloned()?;
    let id = {
        let mut n = session.next_id.lock().ok()?;
        let id = *n;
        *n += 1;
        id
    };
    let req = json!({"jsonrpc":"2.0","id":id,"method":method,"params":params});
    if send_line(&session.write_tx, &req).is_err() {
        return Some(Err("MCP session is closed.".to_string()));
    }
    let rx = session.read_rx.lock().ok()?;
    let res = wait_for_id(&rx, id, Duration::from_secs(30));
    drop(rx);
    Some(res)
}

fn rpc_once(server: &McpServer, method: &str, params: Value) -> Result<Value, String> {
    let mut child = spawn_process(server)?;
    let mut stdin = child.stdin.take().ok_or("MCP server has no stdin")?;
    let stdout = child.stdout.take().ok_or("MCP server has no stdout")?;
    let (tx, rx) = mpsc::channel::<String>();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(l) => {
                    if tx.send(l).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });
    let init = json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{
        "protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"RedCat","version":"0.3.1"}}});
    let notif = json!({"jsonrpc":"2.0","method":"notifications/initialized"});
    let req = json!({"jsonrpc":"2.0","id":2,"method":method,"params":params});
    for msg in [init, notif, req] {
        writeln!(stdin, "{}", msg).map_err(|e| e.to_string())?;
    }
    stdin.flush().map_err(|e| e.to_string())?;
    let res = wait_for_id(&rx, 2, Duration::from_secs(20));
    drop(stdin);
    let _ = child.kill();
    res
}

fn call(server: &McpServer, method: &str, params: Value) -> Result<Value, String> {
    if let Some(res) = session_call(server, method, params) {
        return res;
    }
    rpc_once(server, method, params)
}

pub fn list_tools(server: &McpServer) -> Result<Vec<Value>, String> {
    let res = call(server, "tools/list", json!({}))?;
    Ok(res["tools"].as_array().cloned().unwrap_or_default())
}

pub fn call_tool(server: &McpServer, tool: &str, args: Value) -> Result<Value, String> {
    call(server, "tools/call", json!({"name": tool, "arguments": args}))
}
