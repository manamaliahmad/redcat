// RedCat frontend — plain JS, no build step. All secrets stay in the Rust
// backend (OS keychain); this file only ever sends commands and messages.
(function () {
  'use strict';

  const hasTauri = !!(window.__TAURI__ && window.__TAURI__.core);
  const invoke = hasTauri
    ? (cmd, args) => window.__TAURI__.core.invoke(cmd, args)
    : () => Promise.reject(new Error('Desktop backend not running. Open RedCat from the installed app, not this file in a browser.'));

  const $ = (id) => document.getElementById(id);
  const messagesEl = $('messages');

  function addMsg(text, who, save) {
    const div = document.createElement('div');
    div.className = 'msg ' + (who || 'cat');
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    if (save !== false && typeof currentChat !== 'undefined' && currentChat) {
      currentChat.messages.push({ text, who: who || 'cat' });
      saveChats();
    }
    return div;
  }

  function setPetState(state) {
    try {
      window.__TAURI__.event.emit('redcat-pet-state', state);
    } catch (err) { /* demo mode */ }
    $('status').textContent = state === 'thinking' ? 'RedCat is thinking…'
      : state === 'working' ? 'RedCat is working…'
      : 'Your desktop cat that actually works.';
  }

  // ---- tabs ----
  document.querySelectorAll('.tabbtn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tabbtn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
      btn.classList.add('active');
      $('view-' + btn.getAttribute('data-tab')).classList.add('active');
    });
  });

  // ---- chat + tool routing ----
  let pendingCmd = null;

  $('chatForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = $('chatInput').value.trim();
    if (!text) return;
    $('chatInput').value = '';
    addMsg(text, 'user');

    if (agentMode) {
      setPetState('thinking');
      try {
        const res = await invoke('agent_run', Object.assign({ task: text }, aiArgs()));
        (res.thinking || []).forEach((t) => addMsg('💭 ' + t, 'sys'));
        (res.steps || []).forEach((s) => addMsg('Step [' + s.tool + ']: ' + (s.observation || ''), 'sys'));
        addMsg(res.final || '(no answer)', 'cat');
        const proposal = res.proposal;
        if (proposal && proposal.kind === 'command') {
          pendingCmd = proposal.command;
          $('approvalCmd').textContent = proposal.command;
          $('approval').classList.remove('hidden');
          addMsg('The agent proposes this command. Approve it below, or deny it.', 'sys');
        } else if (proposal && proposal.kind === 'mcp') {
          const card = document.createElement('div');
          card.className = 'msg sys';
          card.textContent = 'The agent proposes: ' + proposal.server + '.' + proposal.tool + ' ' + JSON.stringify(proposal.args || {});
          const ok = document.createElement('button');
          ok.textContent = 'Approve';
          ok.className = 'primary';
          ok.style.marginLeft = '10px';
          ok.addEventListener('click', async () => {
            try {
              const out = await invoke('mcp_call_tool', { server: proposal.server, tool: proposal.tool, argsJson: JSON.stringify(proposal.args || {}) });
              addMsg(out, 'sys');
            } catch (err) { addMsg('Call failed: ' + err, 'sys'); }
          });
          card.appendChild(ok);
          messagesEl.appendChild(card);
        }
      } catch (err) {
        addMsg('Agent run failed: ' + err, 'sys');
      }
      setPetState('idle');
      return;
    }

    // Simple local router: explicit action phrases become tool proposals.
    const m = text.match(/^(run|execute)\s+(.+)$/i)
      || text.match(/^(list|show)\s+files(\s+in\s+(.+))?$/i)
      || text.match(/^open\s+(.+)$/i);
    if (m && (m[1].toLowerCase() === 'open')) {
      const app = m[2].trim();
      setPetState('working');
      try {
        const out = await invoke('open_app', { name: app });
        addMsg(out, 'sys');
      } catch (err) { addMsg('Could not open that: ' + err, 'sys'); }
      setPetState('idle');
      return;
    }
    if (m && (m[1].toLowerCase() === 'list' || m[1].toLowerCase() === 'show')) {
      // Read-only: runs instantly, no approval card (the backend enforces this).
      const cmd = 'dir' + (m[3] ? ' "' + m[3].trim() + '"' : '');
      setPetState('working');
      try {
        const out = await invoke('run_command', { cmd });
        addMsg(out || '(no output)', 'sys');
      } catch (err) { addMsg('Could not run that: ' + err, 'sys'); }
      setPetState('idle');
      return;
    }
    if (m) {
      // State-changing: approval card first, nothing runs until you say yes.
      pendingCmd = m[2];
      $('approvalCmd').textContent = m[2];
      $('approval').classList.remove('hidden');
      addMsg('RedCat wants to run this command. Approve it below, or deny it.', 'sys');
      return;
    }

    setPetState('thinking');
    try {
      const reply = await invoke('chat_complete', Object.assign({ message: text }, aiArgs()));
      addMsg(reply, 'cat');
    } catch (err) {
      addMsg('Chat needs an API key: open Settings, save your key, then try again. (' + err + ')', 'sys');
    }
    setPetState('idle');
  });

  $('approveBtn').addEventListener('click', async () => {
    if (!pendingCmd) return;
    const cmd = pendingCmd;
    pendingCmd = null;
    $('approval').classList.add('hidden');
    setPetState('working');
    try {
      const out = await invoke('run_command_approved', { cmd });
      addMsg(out || '(no output)', 'sys');
    } catch (err) { addMsg('Blocked or failed: ' + err, 'sys'); }
    setPetState('idle');
  });

  $('denyBtn').addEventListener('click', () => {
    pendingCmd = null;
    $('approval').classList.add('hidden');
    addMsg('Denied. Nothing ran.', 'sys');
  });

  // ---- settings ----
  const saved = JSON.parse(localStorage.getItem('redcat-settings') || '{}');
  if (saved.endpoint) $('endpoint').value = saved.endpoint;
  if (saved.model) $('model').value = saved.model;
  if (saved.provider) $('provider').value = saved.provider;

  function aiArgs() {
    return {
      endpoint: $('endpoint').value.trim(),
      model: $('model').value.trim(),
      provider: $('provider').value
    };
  }

  $('saveKeyBtn').addEventListener('click', async () => {
    const endpoint = $('endpoint').value.trim();
    const model = $('model').value.trim();
    const provider = $('provider').value;
    const key = $('apiKey').value.trim();
    localStorage.setItem('redcat-settings', JSON.stringify({ endpoint, model, provider }));
    try {
      if (key) await invoke('save_api_key', { key });
      $('settingsStatus').textContent = 'Saved. Your key lives in the OS keychain, not in this app.';
      $('apiKey').value = '';
    } catch (err) { $('settingsStatus').textContent = 'Save failed: ' + err; }
  });

  $('saveClaudeKeyBtn').addEventListener('click', async () => {
    const key = $('claudeKey').value.trim();
    if (!key) return;
    try {
      await invoke('save_api_key', { key, name: 'anthropic_api_key' });
      $('settingsStatus').textContent = 'Claude key saved in the OS keychain.';
      $('claudeKey').value = '';
    } catch (err) { $('settingsStatus').textContent = 'Save failed: ' + err; }
  });

  $('testChatBtn').addEventListener('click', async () => {
    try {
      const reply = await invoke('chat_complete', Object.assign({ message: 'Say hello in one short sentence.' }, aiArgs()));
      $('settingsStatus').textContent = 'Test reply: ' + reply;
    } catch (err) { $('settingsStatus').textContent = 'Test failed: ' + err; }
  });

  // ---- Gmail connector ----
  $('gmailAuthBtn').addEventListener('click', async () => {
    const clientId = $('gmailClientId').value.trim();
    if (!clientId) { $('gmailStatus').textContent = 'Paste your Google OAuth client ID first (Google Cloud Console → Desktop app).'; return; }
    try {
      const url = await invoke('gmail_auth_url', { clientId });
      $('gmailAuthLink').href = url;
      $('gmailAuthBox').classList.remove('hidden');
      $('gmailStatus').textContent = 'Sign in with Google, then paste the code below.';
    } catch (err) { $('gmailStatus').textContent = 'Failed: ' + err; }
  });

  $('gmailCodeBtn').addEventListener('click', async () => {
    const clientId = $('gmailClientId').value.trim();
    const code = $('gmailCode').value.trim();
    if (!code) return;
    try {
      await invoke('gmail_exchange', { code, clientId });
      $('gmailStatus').textContent = 'Gmail connected. Tokens are in your OS keychain.';
      $('gmailAuthBox').classList.add('hidden');
    } catch (err) { $('gmailStatus').textContent = 'Exchange failed: ' + err; }
  });

  $('gmailInboxBtn').addEventListener('click', async () => {
    try {
      const items = await invoke('gmail_list', {});
      const box = $('gmailInbox');
      box.innerHTML = '';
      if (!items || !items.length) { box.textContent = 'Inbox is empty or not connected yet.'; return; }
      items.forEach((it) => {
        const div = document.createElement('div');
        div.className = 'msg sys';
        div.textContent = it;
        box.appendChild(div);
      });
    } catch (err) { $('gmailStatus').textContent = 'Inbox failed: ' + err; }
  });

  // ---- pipelines ----
  async function renderPipelines() {
    const list = $('pipelineList');
    list.innerHTML = '';
    try {
      const pipes = await invoke('list_pipelines', {});
      pipes.forEach((p) => {
        const card = document.createElement('div');
        card.className = 'card';
        const title = document.createElement('h3');
        title.textContent = p.name + (p.builtin ? ' (built-in)' : '');
        card.appendChild(title);
        const steps = document.createElement('p');
        steps.className = 'muted';
        steps.textContent = (p.steps || []).map((s) => s.tool).join(' → ');
        card.appendChild(steps);
        const row = document.createElement('div');
        row.className = 'row';
        const run = document.createElement('button');
        run.className = 'primary';
        run.textContent = 'Run';
        run.addEventListener('click', async () => {
          $('pipeResult').textContent = 'Running ' + p.name + '…';
          try {
            const out = await invoke('run_pipeline', Object.assign({ name: p.name }, aiArgs()));
            $('pipeResult').innerHTML = '';
            const pre = document.createElement('div');
            pre.className = 'msg sys';
            pre.textContent = out;
            $('pipeResult').appendChild(pre);
          } catch (err) { $('pipeResult').textContent = 'Pipeline failed: ' + err; }
        });
        row.appendChild(run);
        if (!p.builtin) {
          const del = document.createElement('button');
          del.textContent = 'Delete';
          del.addEventListener('click', async () => {
            await invoke('delete_pipeline', { name: p.name });
            renderPipelines();
          });
          row.appendChild(del);
        }
        card.appendChild(row);
        list.appendChild(card);
      });
    } catch (err) { list.textContent = 'Pipelines unavailable: ' + err; }
  }

  $('pipeSaveBtn').addEventListener('click', async () => {
    const name = $('pipeName').value.trim();
    const steps = $('pipeSteps').value.trim();
    if (!name || !steps) return;
    try {
      await invoke('save_pipeline', { name, stepsJson: steps });
      $('pipeStatus').textContent = 'Saved.';
      renderPipelines();
    } catch (err) { $('pipeStatus').textContent = 'Save failed: ' + err; }
  });

  // ---- MCP servers ----
  async function mcpRefresh() {
    try {
      const servers = await invoke('mcp_list_servers', {});
      const list = $('mcpList');
      list.innerHTML = '';
      const sel = $('mcpServerSelect');
      sel.innerHTML = '';
      servers.forEach((s) => {
        const div = document.createElement('div');
        div.className = 'msg sys';
        div.textContent = s.name + ' — ' + s.command + ' ' + (s.args || []).join(' ');
        const del = document.createElement('button');
        del.textContent = 'Remove';
        del.style.marginLeft = '10px';
        del.addEventListener('click', async () => {
          await invoke('mcp_remove_server', { name: s.name });
          mcpRefresh();
        });
        div.appendChild(del);
        list.appendChild(div);
        const opt = document.createElement('option');
        opt.value = s.name; opt.textContent = s.name;
        sel.appendChild(opt);
      });
      $('mcpStatus').textContent = servers.length ? servers.length + ' server(s).' : 'No MCP servers yet.';
    } catch (err) { $('mcpStatus').textContent = 'MCP unavailable: ' + err; }
  }

  $('mcpAddBtn').addEventListener('click', async () => {
    try {
      await invoke('mcp_add_server', { name: $('mcpName').value.trim(), command: $('mcpCommand').value.trim(), argsText: $('mcpArgs').value, envText: $('mcpEnv').value });
      $('mcpStatus').textContent = 'Server added.';
      mcpRefresh();
    } catch (err) { $('mcpStatus').textContent = 'Add failed: ' + err; }
  });
  $('mcpRefreshBtn').addEventListener('click', mcpRefresh);
  $('mcpToolsBtn').addEventListener('click', async () => {
    const server = $('mcpServerSelect').value;
    if (!server) return;
    try {
      const tools = await invoke('mcp_list_tools', { server });
      const box = $('mcpTools');
      box.innerHTML = '';
      const sel = $('mcpToolSelect');
      sel.innerHTML = '';
      tools.forEach((t) => {
        const div = document.createElement('div');
        div.className = 'msg sys';
        div.textContent = t.name + (t.description ? ' — ' + t.description : '');
        box.appendChild(div);
        const opt = document.createElement('option');
        opt.value = t.name; opt.textContent = t.name;
        sel.appendChild(opt);
      });
      $('mcpStatus').textContent = tools.length + ' tool(s) on ' + server + '.';
    } catch (err) { $('mcpStatus').textContent = 'List tools failed: ' + err; }
  });
  $('mcpCallBtn').addEventListener('click', async () => {
    try {
      const out = await invoke('mcp_call_tool', { server: $('mcpServerSelect').value, tool: $('mcpToolSelect').value, argsJson: $('mcpToolArgs').value || '{}' });
      $('mcpResult').textContent = out;
    } catch (err) { $('mcpStatus').textContent = 'Call failed: ' + err; }
  });

  // ---- Zapier ----
  const zapUrl = localStorage.getItem('redcat-zapier-webhook') || '';
  if (zapUrl) $('zapierUrl').value = zapUrl;
  $('zapierTestBtn').addEventListener('click', async () => {
    const url = $('zapierUrl').value.trim();
    if (!url) return;
    localStorage.setItem('redcat-zapier-webhook', url);
    try {
      const out = await invoke('zapier_trigger', { url, payloadJson: '{"from":"RedCat test"}' });
      $('zapierStatus').textContent = out;
    } catch (err) { $('zapierStatus').textContent = 'Trigger failed: ' + err; }
  });

  // ---- chat sessions: every conversation keeps its own session ----
  let chats = [];
  try { chats = JSON.parse(localStorage.getItem('redcat-chats') || '[]'); } catch (err) { chats = []; }
  if (!chats.length) chats = [{ id: 'c1', name: 'Chat 1', messages: [] }];
  let currentChat = chats[0];
  function saveChats() { localStorage.setItem('redcat-chats', JSON.stringify(chats)); }
  function renderChatSelect() {
    const sel = $('chatSession');
    sel.innerHTML = '';
    chats.forEach((c) => {
      const o = document.createElement('option');
      o.value = c.id; o.textContent = c.name;
      sel.appendChild(o);
    });
    sel.value = currentChat.id;
  }
  function renderMessages() {
    $('messages').innerHTML = '';
    if (!currentChat.messages.length) {
      addMsg("Hi, I'm RedCat. I live on your desktop and I can actually do things — try “list files”, “open notepad”, or just chat with me. My interface is English by default; talk to me in any language and I'll answer in it.", 'cat', false);
      return;
    }
    currentChat.messages.forEach((m) => addMsg(m.text, m.who, false));
  }
  $('chatSession').addEventListener('change', () => {
    currentChat = chats.find((c) => c.id === $('chatSession').value) || chats[0];
    renderMessages();
  });
  $('newChatBtn').addEventListener('click', () => {
    const chat = { id: 'c' + Date.now(), name: 'Chat ' + (chats.length + 1), messages: [] };
    chats.push(chat);
    currentChat = chat;
    saveChats();
    renderChatSelect();
    renderMessages();
  });
  renderChatSelect();

  let agentMode = false;
  $('agentModeBtn').addEventListener('click', () => {
    agentMode = !agentMode;
    $('agentModeBtn').textContent = agentMode ? 'Agent mode: ON' : 'Agent mode';
    $('agentModeBtn').classList.toggle('primary', agentMode);
  });

  // ---- tool catalog: verified servers, one click ----
  async function renderCatalog() {
    const box = $('catalogList');
    let catalog = [];
    try {
      const resp = await fetch('catalog.json');
      catalog = await resp.json();
    } catch (err) {
      box.textContent = 'Catalog loads inside the app.';
      return;
    }
    let enabled = [];
    let running = [];
    try { enabled = await invoke('mcp_list_servers', {}); } catch (err) {}
    try { running = await invoke('mcp_sessions', {}); } catch (err) {}
    box.innerHTML = '';
    catalog.forEach((entry) => {
      const isOn = enabled.some((s) => s.name === entry.name);
      const isRunning = running.includes(entry.name);
      const card = document.createElement('div');
      card.className = 'card';
      const title = document.createElement('h3');
      title.textContent = entry.name + (isOn ? ' ✓ enabled' : '');
      card.appendChild(title);
      const what = document.createElement('p');
      what.className = 'muted';
      what.textContent = entry.what;
      card.appendChild(what);
      if (entry.note) {
        const note = document.createElement('p');
        note.className = 'muted';
        note.textContent = entry.note;
        card.appendChild(note);
      }
      const row = document.createElement('div');
      row.className = 'row';
      let input = null;
      if (!isOn && entry.needs === 'key') {
        input = document.createElement('input');
        input.type = 'password';
        input.placeholder = entry.env_name;
        row.appendChild(input);
      } else if (!isOn && entry.needs === 'folder') {
        input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Folder path, e.g. C:\\Users\\you\\Documents';
        row.appendChild(input);
      } else if (!isOn && entry.needs === 'url') {
        input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'https://mcp.zapier.com/api/v1/connect…';
        row.appendChild(input);
      }
      if (!isOn) {
        const btn = document.createElement('button');
        btn.className = 'primary';
        btn.textContent = 'Enable';
        btn.addEventListener('click', async () => {
          const val = input ? input.value.trim() : '';
          if (entry.needs !== 'none' && !val) return;
          const args = (entry.args || []).slice();
          if (entry.needs === 'folder') args.push(val);
          try {
            await invoke('mcp_add_server', {
              name: entry.name,
              command: entry.command || '',
              argsText: args.join(' '),
              envText: entry.needs === 'key' ? entry.env_name + '=' + val : '',
              kind: entry.kind,
              url: entry.needs === 'url' ? val : ''
            });
            if (entry.kind === 'stdio') {
              try { await invoke('mcp_start_session', { server: entry.name }); } catch (err) {}
            }
            renderCatalog();
            mcpRefresh();
          } catch (err) {
            addMsg('Could not enable ' + entry.name + ': ' + err, 'sys');
          }
        });
        row.appendChild(btn);
      } else {
        const state = document.createElement('span');
        state.className = 'muted';
        state.textContent = entry.kind === 'remote' ? 'Remote — session starts on first use.' : (isRunning ? 'Session running.' : 'Session stopped.');
        row.appendChild(state);
        if (entry.kind === 'stdio') {
          const btn = document.createElement('button');
          btn.textContent = isRunning ? 'Stop session' : 'Start session';
          btn.addEventListener('click', async () => {
            try {
              if (isRunning) await invoke('mcp_stop_session', { server: entry.name });
              else await invoke('mcp_start_session', { server: entry.name });
              renderCatalog();
            } catch (err) { addMsg('Session change failed: ' + err, 'sys'); }
          });
          row.appendChild(btn);
        }
        const del = document.createElement('button');
        del.textContent = 'Remove';
        del.addEventListener('click', async () => {
          try { await invoke('mcp_stop_session', { server: entry.name }); } catch (err) {}
          await invoke('mcp_remove_server', { name: entry.name });
          renderCatalog();
          mcpRefresh();
        });
        row.appendChild(del);
      }
      card.appendChild(row);
      box.appendChild(card);
    });
  }

  // ---- boot ----
  addMsg('Hi, I\'m RedCat. 🐱 I live on your desktop and I can actually do things — try "list files", "open notepad", or just chat with me. My interface is English by default; talk to me in any language and I\'ll answer in it.', 'cat');
  if (!hasTauri) {
    $('backendNote').textContent = 'Demo mode: you opened this page in a browser. Install and run the desktop app for live chat, commands, and Gmail.';
  } else {
    invoke('get_system_info', {}).then((info) => { $('sysInfo').textContent = info; }).catch(() => {});
    invoke('get_api_key_status', {}).then((has) => {
      if (!has) $('settingsStatus').textContent = 'No API key saved yet — add one in Settings to enable chat.';
    }).catch(() => {});
    renderPipelines();
    mcpRefresh();
    renderCatalog();
  }
})();
