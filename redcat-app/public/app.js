// ==========================================================================
// REDCAT AI AGENT Workspace Interactive Logic
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  // VIDEO LOADING CARD (2026-11-05, v2.48; first-run rule 2026-11-05):
  // the app opens on a video card (redcat-code-loading.mp4, muted +
  // looping, standard centred installer-style card) with a REAL loading
  // bar. Progress advances ONLY when a real startup step finishes
  // (server connected, chats restored) — never on a timer — so if nothing
  // needs to load the card hides immediately and the home page appears.
  // FIRST LAUNCH + UPDATES ONLY: the card appears ONLY on the first
  // launch after a fresh download/install (while background tools /
  // first-run setup finish) and when an update is being applied. A
  // normal open (close + reopen) and any refresh / reload (Ctrl+R,
  // Ctrl+Shift+R, browser refresh) must NOT show it. A persistent
  // localStorage flag ('redcat-first-run-done') records that the app
  // has opened once; a sessionStorage flag covers a refresh during
  // the first launch; an update flag ('redcat-updating', or the
  // ?updating=1 URL param from the Electron main process) re-shows
  // the card while an update is applied.
  const codeLoadingOverlay = document.getElementById('codeLoadingOverlay');
  const codeLoadingVideo = document.getElementById('codeLoadingVideo');
  const codeLoadingPct = document.getElementById('codeLoadingPct');
  const codeLoadingFill = document.getElementById('codeLoadingFill');
  const codeLoadingStatus = document.getElementById('codeLoadingStatus');
  let codeLoadingDone = false;
  function setCodeLoadingProgress(pct, status) {
    if (codeLoadingDone) return;
    const p = Math.max(0, Math.min(100, Math.round(pct)));
    if (codeLoadingPct) codeLoadingPct.textContent = p + '%';
    if (codeLoadingFill) codeLoadingFill.style.width = p + '%';
    if (status && codeLoadingStatus) codeLoadingStatus.textContent = status;
  }
  function hideCodeLoading() {
    // The main app is ready: mark the first run done (and clear the
    // updating flag) so the NEXT normal open skips the card. This runs
    // even when the card was skipped (e.g. a refresh during the first
    // launch), so a first launch interrupted by a reload still counts
    // as done once the app becomes ready.
    try {
      if (window.localStorage) {
        window.localStorage.setItem('redcat-first-run-done', '1');
        window.localStorage.removeItem('redcat-updating');
      }
    } catch (e) {}
    if (codeLoadingDone) return;
    setCodeLoadingProgress(100, 'Ready');
    codeLoadingDone = true;
    if (codeLoadingOverlay) {
      codeLoadingOverlay.classList.add('fade-out');
      setTimeout(() => {
        codeLoadingOverlay.style.display = 'none';
        if (codeLoadingVideo) { try { codeLoadingVideo.pause(); } catch (e) {} }
      }, 400);
    }
  }
  function showCodeLoading() {
    if (!codeLoadingOverlay) return;
    // FIRST-RUN + UPDATE RULE (2026-11-05): the card shows ONLY on the
    // first launch after a fresh install and while an update is being
    // applied. It never shows on a normal open or a refresh/reload.
    // (1) Same-session refresh: sessionStorage survives a reload in
    // the same tab/window, so if the card already showed once in this
    // session, this load is a refresh — skip the card entirely.
    try {
      if (window.sessionStorage && window.sessionStorage.getItem('redcat-splash-shown') === '1') {
        codeLoadingDone = true;
        return;
      }
    } catch (e) { /* sessionStorage unavailable — fall through */ }
    // (2) Update launch: the Electron main process passes ?updating=1
    // in the URL (and/or sets localStorage 'redcat-updating') when an
    // update is being applied. An update re-shows the card even though
    // the first run is already done.
    let isUpdate = false;
    try {
      if (window.localStorage && window.localStorage.getItem('redcat-updating') === '1') isUpdate = true;
    } catch (e) {}
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('updating') === '1') isUpdate = true;
    } catch (e) {}
    // (3) Normal open: the persistent first-run flag is set, and this
    // is not an update — skip the card and go straight to the home
    // page. localStorage persists across close + reopen, so a normal
    // reopen never shows the card again.
    try {
      if (!isUpdate && window.localStorage && window.localStorage.getItem('redcat-first-run-done') === '1') {
        codeLoadingDone = true;
        return;
      }
    } catch (e) { /* localStorage unavailable — show the card once */ }
    // (4) First launch or update launch: show the card. Mark it shown
    // in this session so a refresh during loading also skips it.
    try {
      if (window.sessionStorage) window.sessionStorage.setItem('redcat-splash-shown', '1');
    } catch (e) {}
    codeLoadingOverlay.style.display = 'flex';
    codeLoadingOverlay.classList.remove('fade-out');
    if (codeLoadingVideo) {
      codeLoadingVideo.muted = true;
      codeLoadingVideo.loop = true;
      codeLoadingVideo.play().catch(() => {});
    }
    setCodeLoadingProgress(8, isUpdate ? 'Updating RedCat' : 'Starting RedCat');
  }
  showCodeLoading();

  // --- DOM Elements ---
  const appContainer = document.getElementById('appContainer');
  
  const chatForm = document.getElementById('chatForm');
  const btnSend = document.getElementById('btnSend');
  const btnStopResponse = document.getElementById('btnStopResponse');
  const chatInput = document.getElementById('chatInput');
  const chatStream = document.getElementById('chatStream');
  const chatScroll = document.getElementById('chatScroll');
  
  
  const rightPanel = document.getElementById('rightPanel');
  const btnCloseRightPanel = document.getElementById('btnCloseRightPanel');
  const topAgentTrigger = document.getElementById('topAgentTrigger');
  const btnOpenRightPanel = document.getElementById('btnOpenRightPanel');
  const mainChatArea = document.querySelector('.main-chat-area');
  const segButtons = document.querySelectorAll('.seg-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  
  const navChatItems = document.querySelectorAll('.nav-chat-item');
  const chatSearchInput = document.getElementById('chatSearchInput');
  const sideChatsContainer = document.getElementById('sideChatsContainer');
  const btnNewSideChat = document.getElementById('btnNewSideChat');
  
  const btnEditProfile = document.getElementById('btnEditProfile');
  const agentNameDisplay = document.getElementById('agentNameDisplay');

  // --- Left Rail Bottom: direct Settings button (no dropdown menu) ---
  const btnNavSettings = document.getElementById('btnNavSettings');

  const settingsModal = document.getElementById('settingsModal');
  const btnCloseSettingsModal = document.getElementById('btnCloseSettingsModal');
  const btnSaveSettings = document.getElementById('btnSaveSettings');

  const reportModal = document.getElementById('reportModal');
  const btnCloseReportModal = document.getElementById('btnCloseReportModal');
  const btnCancelReport = document.getElementById('btnCancelReport');
  const btnSubmitReport = document.getElementById('btnSubmitReport');

  const downloadModal = document.getElementById('downloadModal');
  const btnCloseDownloadModal = document.getElementById('btnCloseDownloadModal');


  // Settings (direct from rail icon)
  if (btnNavSettings) {
    btnNavSettings.addEventListener('click', () => {
      settingsModal.classList.add('active');
    });
  }
  if (btnCloseSettingsModal) btnCloseSettingsModal.addEventListener('click', () => settingsModal.classList.remove('active'));
  if (btnSaveSettings) btnSaveSettings.addEventListener('click', () => settingsModal.classList.remove('active'));

  // Settings Tabs Switching Logic
  const settingsNavItems = document.querySelectorAll('.settings-nav-item[data-tab]');
  const settingsPaneTitle = document.getElementById('settingsPaneTitle');
  const settingsTabPanels = document.querySelectorAll('.settings-tab-panel');

  function getApprovalPolicy() {
    try { const v = localStorage.getItem('redcat_approval_policy'); return v === 'never' ? 'never' : 'ask'; } catch (e) { return 'ask'; }
  }
  const approvalPolicySelect = document.getElementById('approvalPolicySelect');
  if (approvalPolicySelect) {
    try { approvalPolicySelect.value = getApprovalPolicy(); } catch (e) {}
    approvalPolicySelect.addEventListener('change', () => {
      try { localStorage.setItem('redcat_approval_policy', approvalPolicySelect.value === 'never' ? 'never' : 'ask'); } catch (e) {}
    });
  }

  const tabTitleMap = {
    'ai-models': 'AI Models',
    'personality': 'Personality',
    'updates': 'Updates',
  };

  const tabPanelMap = {
    'ai-models': 'tabPanelAiModels',
    'personality': 'tabPanelPersonality',
    'updates': 'tabPanelUpdates',
  };

  settingsNavItems.forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.getAttribute('data-tab');
      if (!tab) return;

      settingsNavItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      if (settingsPaneTitle && tabTitleMap[tab]) {
        settingsPaneTitle.textContent = tabTitleMap[tab];
      }

      settingsTabPanels.forEach(panel => {
        panel.classList.remove('active');
      });

      const targetId = tabPanelMap[tab];
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) {
        targetPanel.classList.add('active');
      }
    });
  });

  // Personality (your style) — view/edit/reset/toggle/scope/forget-one-trait.
  // No explanation/onboarding here by design (ali explains it via video).
  const personalityText = document.getElementById('personalityText');
  const personalityEnabledEl = document.getElementById('personalityEnabled');
  const personalityScopeEl = document.getElementById('personalityScope');
  const personalityStatus = document.getElementById('personalityStatus');
  async function loadPersonality() {
    try {
      const r = await fetch('/api/personality');
      const j = await r.json();
      if (j && j.ok) {
        if (personalityText) personalityText.value = j.personality || '';
        if (personalityEnabledEl) personalityEnabledEl.checked = !!(j.settings && j.settings.enabled !== false);
        if (personalityScopeEl) personalityScopeEl.value = (j.settings && j.settings.scope) || 'both';
      }
    } catch (e) {}
  }
  async function savePersonalitySettings() {
    try {
      await fetch('/api/personality/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: personalityEnabledEl ? personalityEnabledEl.checked : true, scope: personalityScopeEl ? personalityScopeEl.value : 'both' }) });
    } catch (e) {}
  }
  const btnSavePersonality = document.getElementById('btnSavePersonality');
  if (btnSavePersonality) btnSavePersonality.addEventListener('click', async () => {
    try {
      const r = await fetch('/api/personality', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: personalityText ? personalityText.value : '' }) });
      const j = await r.json();
      if (personalityStatus) personalityStatus.textContent = (j && j.ok) ? 'Saved.' : ('Could not save: ' + ((j && j.error) || 'unknown error'));
    } catch (e) { if (personalityStatus) personalityStatus.textContent = 'Could not save.'; }
  });
  if (personalityEnabledEl) personalityEnabledEl.addEventListener('change', savePersonalitySettings);
  if (personalityScopeEl) personalityScopeEl.addEventListener('change', savePersonalitySettings);
  const btnResetPersonality = document.getElementById('btnResetPersonality');
  if (btnResetPersonality) btnResetPersonality.addEventListener('click', async () => {
    try {
      const r = await fetch('/api/personality/reset', { method: 'POST' });
      const j = await r.json();
      if (j && j.ok) { await loadPersonality(); if (personalityStatus) personalityStatus.textContent = 'Reset to the default style profile.'; }
      else if (personalityStatus) personalityStatus.textContent = 'Could not reset.';
    } catch (e) { if (personalityStatus) personalityStatus.textContent = 'Could not reset.'; }
  });
  const btnForgetPersonalityTrait = document.getElementById('btnForgetPersonalityTrait');
  if (btnForgetPersonalityTrait) btnForgetPersonalityTrait.addEventListener('click', async () => {
    const inp = document.getElementById('personalityForgetInput');
    const trait = inp ? inp.value.trim() : '';
    if (!trait) { if (personalityStatus) personalityStatus.textContent = 'Enter a trait to forget.'; return; }
    try {
      const r = await fetch('/api/personality/forget', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trait }) });
      const j = await r.json();
      if (j && j.ok) { await loadPersonality(); if (inp) inp.value = ''; if (personalityStatus) personalityStatus.textContent = 'Trait removed.'; }
      else if (personalityStatus) personalityStatus.textContent = 'Trait not found.';
    } catch (e) { if (personalityStatus) personalityStatus.textContent = 'Could not forget that trait.'; }
  });
  // Load the profile when the Personality tab is opened, and when Settings opens.
  settingsNavItems.forEach(item => {
    item.addEventListener('click', () => { if (item.getAttribute('data-tab') === 'personality') loadPersonality(); });
  });
  if (btnNavSettings) btnNavSettings.addEventListener('click', () => loadPersonality());
  // Updates (silent auto-update, v1.0.5) - manual "Check for Updates"
  // button + current status. The app already checks silently in the
  // background (15s after startup, then every 4 hours) and installs on
  // quit; this button just runs the same check on demand and shows the
  // result. All strings are English (app UI is always English).
  const updatesVersionText = document.getElementById('updatesVersionText');
  const updatesStatus = document.getElementById('updatesStatus');
  const btnCheckUpdates = document.getElementById('btnCheckUpdates');
  async function loadUpdateStatus() {
    try {
      const r = await fetch('/api/updates/status');
      const j = await r.json();
      if (j && j.ok) {
        if (updatesVersionText && j.currentVersion) updatesVersionText.textContent = 'v' + j.currentVersion;
        const st = j.status || {};
        if (updatesStatus) {
          if (st.error) updatesStatus.textContent = 'Last check failed: ' + st.error;
          else if (st.downloaded) updatesStatus.textContent = 'Update v' + (st.version || '') + ' downloaded - it will install when you quit the app.';
          else if (st.downloading) updatesStatus.textContent = 'Downloading update v' + (st.version || '') + ' in the background...';
          else if (st.updateAvailable) updatesStatus.textContent = 'Update v' + (st.version || '') + ' available - downloading in the background.';
          else updatesStatus.textContent = st.lastCheck ? 'Last checked: ' + new Date(st.lastCheck).toLocaleString() + '. You are up to date.' : 'Automatic updates are on. No check has run yet.';
        }
      }
    } catch (e) {}
  }
  if (btnCheckUpdates) btnCheckUpdates.addEventListener('click', async () => {
    if (updatesStatus) updatesStatus.textContent = 'Checking for updates...';
    btnCheckUpdates.disabled = true;
    try {
      const r = await fetch('/api/updates/check');
      const j = await r.json();
      if (j && j.ok) {
        if (updatesVersionText && j.currentVersion) updatesVersionText.textContent = 'v' + j.currentVersion;
        if (updatesStatus) updatesStatus.textContent = j.message || (j.updateAvailable ? 'Update available - downloading in the background.' : "You're up to date.");
      } else if (updatesStatus) {
        updatesStatus.textContent = 'Could not check: ' + ((j && (j.error || j.message)) || 'unknown error');
      }
    } catch (e) {
      if (updatesStatus) updatesStatus.textContent = 'Could not check for updates.';
    }
    btnCheckUpdates.disabled = false;
    loadUpdateStatus();
  });
  // Load the update status when the Updates tab is opened, and when Settings opens.
  settingsNavItems.forEach(item => {
    item.addEventListener('click', () => { if (item.getAttribute('data-tab') === 'updates') loadUpdateStatus(); });
  });
  if (btnNavSettings) btnNavSettings.addEventListener('click', () => loadUpdateStatus());
  // FLOATING TOP BAR (v1.0.6): Settings toggle - show the quick bar when
  // the app is minimized. Default ON. All strings are English.
  const floatingBarEnabledEl = document.getElementById('floatingBarEnabled');
  const floatingBarStatus = document.getElementById('floatingBarStatus');
  async function loadFloatingBarSetting() {
    try {
      const r = await fetch('/api/floating-bar/settings');
      const j = await r.json();
      if (j && j.ok && floatingBarEnabledEl) floatingBarEnabledEl.checked = j.enabled !== false;
    } catch (e) {}
  }
  if (floatingBarEnabledEl) floatingBarEnabledEl.addEventListener('change', async () => {
    const enabled = !!floatingBarEnabledEl.checked;
    if (floatingBarStatus) floatingBarStatus.textContent = 'Saving...';
    try {
      const r = await fetch('/api/floating-bar/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: enabled })
      });
      const j = await r.json();
      if (floatingBarStatus) floatingBarStatus.textContent = (j && j.ok) ? 'Saved.' : 'Could not save. Try again.';
    } catch (e) {
      if (floatingBarStatus) floatingBarStatus.textContent = 'Could not save. Try again.';
    }
  });
  // Load the floating-bar setting when the Updates tab is opened, and when Settings opens.
  settingsNavItems.forEach(item => {
    item.addEventListener('click', () => { if (item.getAttribute('data-tab') === 'updates') loadFloatingBarSetting(); });
  });
  if (btnNavSettings) btnNavSettings.addEventListener('click', () => loadFloatingBarSetting());


  // Settings Theme Pill Selector
  document.querySelectorAll('.theme-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.theme-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
    });
  });

  // ==========================================================================
  // AI Models Settings Section (Provider Switching & Local Storage Persistence)
  // ==========================================================================
  const AI_STORAGE_KEY = 'ai_models_providers_data';
  const defaultProvidersList = [
    {
      id: 'gemini',
      name: 'Gemini',
      keyUrl: 'https://aistudio.google.com/app/apikey',
      keyUrlLabel: 'Google AI Studio',
      needsKey: true,
      models: ['gemini-3.8-flash', 'Custom (type manually)']
    },
    {
      id: 'openai',
      name: 'ChatGPT (OpenAI)',
      keyUrl: 'https://platform.openai.com/api-keys',
      keyUrlLabel: 'platform.openai.com',
      needsKey: true,
      models: ['gpt-5', 'gpt-5-mini', 'gpt-4o-mini', 'Custom (type manually)']
    },
    {
      id: 'claude',
      name: 'Claude',
      keyUrl: 'https://console.anthropic.com/settings/keys',
      keyUrlLabel: 'console.anthropic.com',
      needsKey: true,
      models: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-sonnet-4-5', 'Custom (type manually)']
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      keyUrl: 'https://platform.deepseek.com/api_keys',
      keyUrlLabel: 'platform.deepseek.com',
      needsKey: true,
      models: ['deepseek-chat', 'deepseek-reasoner', 'Custom (type manually)']
    },
    {
      id: 'qwen',
      name: 'Qwen',
      keyUrl: 'https://dashscope.console.aliyun.com/',
      keyUrlLabel: 'Alibaba DashScope',
      needsKey: true,
      models: ['qwen3-coder', 'qwen-max', 'Custom (type manually)'],
      modelNotes: { 'qwen3-coder': 'Text-only — no vision' }
    },
    {
      id: 'kimi',
      name: 'Kimi',
      keyUrl: 'https://platform.moonshot.cn/console/api-keys',
      keyUrlLabel: 'Moonshot platform',
      needsKey: true,
      models: ['kimi-k3', 'kimi-k2', 'Custom (type manually)']
    },
    {
      id: 'groq',
      name: 'Groq',
      keyUrl: 'https://console.groq.com/keys',
      keyUrlLabel: 'console.groq.com',
      needsKey: true,
      models: ['llama-3.3-70b-versatile', 'qwq-32b', 'Custom (type manually)']
    },
    {
      id: 'openrouter',
      name: 'OpenRouter',
      keyUrl: 'https://openrouter.ai/keys',
      keyUrlLabel: 'openrouter.ai',
      needsKey: true,
      isOpenRouter: true,
      examples: ['deepseek-v4.1-flash', 'qwen3-coder'],
      models: ['deepseek-v4.1-flash', 'qwen3-coder', 'Custom (type manually)']
    },
    {
      id: 'ollama',
      name: 'Ollama (local)',
      keyUrl: '',
      keyUrlLabel: '',
      needsKey: false,
      isOllama: true,
      examples: ['qwen3', 'llama3.2', 'gemma3'],
      models: ['qwen3', 'llama3.2', 'gemma3', 'Custom (type manually)']
    }
  ];

  const aiProviders = (typeof window !== 'undefined' && window.AI_PROVIDERS) || defaultProvidersList;

  let currentProviderId = 'gemini';
  try {
    const savedChatProvider = localStorage.getItem('redcat_chat_provider');
    if (savedChatProvider && aiProviders.some(p => p.id === savedChatProvider)) currentProviderId = savedChatProvider;
  } catch (e) { /* keep default provider */ }
  let isKeyVisible = false;

  function loadAiStore() {
    try {
      const data = localStorage.getItem(AI_STORAGE_KEY);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

  function saveAiStore(store) {
    try {
      localStorage.setItem(AI_STORAGE_KEY, JSON.stringify(store));
    } catch {
      // storage error handled
    }
  }

  function getProviderRecord(id) {
    const store = loadAiStore();
    const provider = aiProviders.find(p => p.id === id) || aiProviders[0];
    const initialModel = (provider.examples && provider.examples[0]) || (provider.models && provider.models[0]) || '';
    return store[id] || {
      key: '',
      chatModel: initialModel,
      customChatModel: '',
      codingModel: initialModel,
      customCodingModel: '',
      isCodingCustomized: false,
      saved: false
    };
  }

  function updateProviderRecord(id, fields) {
    const store = loadAiStore();
    const current = getProviderRecord(id);
    store[id] = { ...current, ...fields };
    saveAiStore(store);
    return store[id];
  }

  const AI_MODELS_CACHE_KEY = 'redcat_provider_models_v1';
  function loadProviderModelsCache() {
    try {
      const d = localStorage.getItem(AI_MODELS_CACHE_KEY);
      return d ? JSON.parse(d) : {};
    } catch {
      return {};
    }
  }
  function getCachedProviderModels(id) {
    const c = loadProviderModelsCache();
    return (c[id] && Array.isArray(c[id].models)) ? c[id].models : null;
  }
  function setCachedProviderModels(id, models) {
    try {
      const c = loadProviderModelsCache();
      c[id] = { models: models, fetchedAt: Date.now() };
      localStorage.setItem(AI_MODELS_CACHE_KEY, JSON.stringify(c));
    } catch {}
  }

  const aiPillsBar = document.getElementById('aiProvidersPillsBar');
  const aiCardTitle = document.getElementById('aiCardTitle');
  const aiCardLogo = document.getElementById('aiCardLogo');
  const aiCardSubtitle = document.getElementById('aiCardSubtitle');
  const aiStatusBadge = document.getElementById('aiStatusBadge');
  const aiStatusText = document.getElementById('aiStatusText');
  const aiKeyGroup = document.getElementById('aiKeyGroup');
  const aiGetKeyLink = document.getElementById('aiGetKeyLink');
  const aiKeyInput = document.getElementById('aiKeyInput');
  const btnToggleShowKey = document.getElementById('btnToggleShowKey');
  const btnPasteKey = document.getElementById('btnPasteKey');
  const btnClearKey = document.getElementById('btnClearKey');
  const aiOllamaBanner = document.getElementById('aiOllamaBanner');

  const aiChatModelSelect = document.getElementById('aiChatModelSelect');
  const aiChatModelInput = document.getElementById('aiChatModelInput');
  const chatModelDatalist = document.getElementById('chatModelDatalist');
  const aiCustomChatWrap = document.getElementById('aiCustomChatWrap');
  const aiCustomChatInput = document.getElementById('aiCustomChatInput');
  const aiChatQwenNote = document.getElementById('aiChatQwenNote');

  const aiCodingModelSelect = document.getElementById('aiCodingModelSelect');
  const aiCodingModelInput = document.getElementById('aiCodingModelInput');
  const codingModelDatalist = document.getElementById('codingModelDatalist');
  const aiCustomCodingWrap = document.getElementById('aiCustomCodingWrap');
  const aiCustomCodingInput = document.getElementById('aiCustomCodingInput');
  const aiCodingQwenNote = document.getElementById('aiCodingQwenNote');

  const aiErrorMessage = document.getElementById('aiErrorMessage');
  const btnSaveAiModel = document.getElementById('btnSaveAiModel');

  function renderAiProviderPills() {
    if (!aiPillsBar) return;
    const store = loadAiStore();

    aiPillsBar.innerHTML = aiProviders.map(p => {
      const isSaved = store[p.id] && store[p.id].saved;
      const isActive = p.id === currentProviderId;
      return `
        <button type="button" class="ai-provider-pill ${isActive ? 'active' : ''}" data-provider-id="${p.id}">
          <span class="pill-status-dot ${isSaved ? 'connected' : ''}"></span>
          <img class="ai-provider-logo" src="assets/models/${p.id}.svg" alt="" onerror="this.style.display='none'">
          <span>${p.name}</span>
        </button>
      `;
    }).join('');

    aiPillsBar.querySelectorAll('.ai-provider-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        currentProviderId = btn.getAttribute('data-provider-id');
        try { localStorage.setItem('redcat_chat_provider', currentProviderId); } catch (e) { /* ignore */ }
        isKeyVisible = false;
        renderAiProviderPills();
        renderActiveAiProvider();
      });
    });
  }

  function renderActiveAiProvider() {
    const provider = aiProviders.find(p => p.id === currentProviderId) || aiProviders[0];
    const rec = getProviderRecord(currentProviderId);

    // Title & Subtitle
    if (aiCardTitle) aiCardTitle.textContent = provider.name;
    if (aiCardLogo) {
      aiCardLogo.style.display = '';
      aiCardLogo.src = 'assets/models/' + provider.id + '.svg';
    }
    if (aiCardSubtitle) aiCardSubtitle.textContent = `Configure API key & model selections for ${provider.name}`;

    // Status Badge
    if (aiStatusBadge && aiStatusText) {
      if (rec.saved) {
        aiStatusBadge.className = 'ai-status-badge saved';
        aiStatusText.textContent = 'Saved — Ready to chat';
      } else {
        aiStatusBadge.className = 'ai-status-badge not-connected';
        aiStatusText.textContent = 'Not connected';
      }
    }

    // Key Section
    if (provider.needsKey) {
      if (aiKeyGroup) aiKeyGroup.style.display = 'block';
      if (aiOllamaBanner) aiOllamaBanner.style.display = 'none';
      if (aiGetKeyLink) {
        aiGetKeyLink.href = provider.keyUrl;
        aiGetKeyLink.textContent = `Get key (${provider.keyUrlLabel}) ↗`;
      }
      if (aiKeyInput) {
        aiKeyInput.value = rec.key || '';
        aiKeyInput.type = isKeyVisible ? 'text' : 'password';
      }
      if (btnToggleShowKey) {
        btnToggleShowKey.textContent = isKeyVisible ? 'Hide' : 'Show';
      }
    } else {
      if (aiKeyGroup) aiKeyGroup.style.display = 'none';
      if (aiOllamaBanner) aiOllamaBanner.style.display = 'flex';
    }

    // Model Selectors
    const liveModels = getCachedProviderModels(provider.id);
    const fullList = liveModels ? [...liveModels, 'Custom (type manually)'] : null;
    const isFreeText = !liveModels && (provider.isOpenRouter || provider.isOllama);

    if (isFreeText) {
      if (aiChatModelSelect) aiChatModelSelect.style.display = 'none';
      if (aiChatModelInput) {
        aiChatModelInput.style.display = 'block';
        aiChatModelInput.value = rec.chatModel || '';
      }
      if (chatModelDatalist) {
        chatModelDatalist.innerHTML = (provider.examples || []).map(ex => `<option value="${ex}">`).join('') +
          '<option value="Custom (type manually)">';
      }

      if (aiCodingModelSelect) aiCodingModelSelect.style.display = 'none';
      if (aiCodingModelInput) {
        aiCodingModelInput.style.display = 'block';
        aiCodingModelInput.value = rec.codingModel || rec.chatModel || '';
      }
      if (codingModelDatalist) {
        codingModelDatalist.innerHTML = (provider.examples || []).map(ex => `<option value="${ex}">`).join('') +
          '<option value="Custom (type manually)">';
      }
    } else {
      if (aiChatModelInput) aiChatModelInput.style.display = 'none';
      if (aiChatModelSelect) {
        aiChatModelSelect.style.display = 'block';
        const chatOptions = fullList || provider.models || [];
        aiChatModelSelect.innerHTML = chatOptions.map(m => `
          <option value="${m}" ${m === rec.chatModel ? 'selected' : ''}>${m}</option>
        `).join('');
      }

      if (aiCodingModelInput) aiCodingModelInput.style.display = 'none';
      if (aiCodingModelSelect) {
        aiCodingModelSelect.style.display = 'block';
        const codingVal = rec.codingModel || rec.chatModel || (fullList || provider.models || [])[0];
        aiCodingModelSelect.innerHTML = (fullList || provider.models || []).map(m => `
          <option value="${m}" ${m === codingVal ? 'selected' : ''}>${m}</option>
        `).join('');
      }
    }

    if (aiModelsLoadStatus && liveModels) {
      aiModelsLoadStatus.textContent = liveModels.length + ' models (saved) — press the button to reload.';
    }

    // Custom Inputs
    const isCustomChat = rec.chatModel === 'Custom (type manually)';
    if (aiCustomChatWrap) aiCustomChatWrap.style.display = isCustomChat ? 'block' : 'none';
    if (aiCustomChatInput) aiCustomChatInput.value = rec.customChatModel || '';

    const isCustomCoding = rec.codingModel === 'Custom (type manually)';
    if (aiCustomCodingWrap) aiCustomCodingWrap.style.display = isCustomCoding ? 'block' : 'none';
    if (aiCustomCodingInput) aiCustomCodingInput.value = rec.customCodingModel || '';

    // Qwen Notes
    const isQwenChat = provider.id === 'qwen' && rec.chatModel === 'qwen3-coder';
    const isQwenCoding = provider.id === 'qwen' && rec.codingModel === 'qwen3-coder';
    if (aiChatQwenNote) aiChatQwenNote.style.display = isQwenChat ? 'block' : 'none';
    if (aiCodingQwenNote) aiCodingQwenNote.style.display = isQwenCoding ? 'block' : 'none';

    // Error message clear
    if (aiErrorMessage) aiErrorMessage.style.display = 'none';
  }

  // Model selection listeners
  if (aiChatModelSelect) {
    aiChatModelSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      const rec = getProviderRecord(currentProviderId);
      const updates = { chatModel: val };
      if (!rec.isCodingCustomized) {
        updates.codingModel = val;
      }
      updateProviderRecord(currentProviderId, updates);
      renderActiveAiProvider();
    });
  }

  if (aiChatModelInput) {
    aiChatModelInput.addEventListener('input', (e) => {
      const val = e.target.value;
      const rec = getProviderRecord(currentProviderId);
      const updates = { chatModel: val };
      if (!rec.isCodingCustomized) {
        updates.codingModel = val;
      }
      updateProviderRecord(currentProviderId, updates);
      if (aiCustomChatWrap) {
        aiCustomChatWrap.style.display = val === 'Custom (type manually)' ? 'block' : 'none';
      }
    });
  }

  if (aiCodingModelSelect) {
    aiCodingModelSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      updateProviderRecord(currentProviderId, { codingModel: val, isCodingCustomized: true });
      renderActiveAiProvider();
    });
  }

  if (aiCodingModelInput) {
    aiCodingModelInput.addEventListener('input', (e) => {
      const val = e.target.value;
      updateProviderRecord(currentProviderId, { codingModel: val, isCodingCustomized: true });
      if (aiCustomCodingWrap) {
        aiCustomCodingWrap.style.display = val === 'Custom (type manually)' ? 'block' : 'none';
      }
    });
  }

  if (aiCustomChatInput) {
    aiCustomChatInput.addEventListener('input', (e) => {
      updateProviderRecord(currentProviderId, { customChatModel: e.target.value });
    });
  }

  if (aiCustomCodingInput) {
    aiCustomCodingInput.addEventListener('input', (e) => {
      updateProviderRecord(currentProviderId, { customCodingModel: e.target.value });
    });
  }

  const btnLoadAllModels = document.getElementById('btnLoadAllModels');
  const aiModelsLoadStatus = document.getElementById('aiModelsLoadStatus');
  if (btnLoadAllModels) {
    btnLoadAllModels.addEventListener('click', async () => {
      const provider = aiProviders.find(p => p.id === currentProviderId) || aiProviders[0];
      const rec = getProviderRecord(currentProviderId);
      if (provider.needsKey && (!rec.key || !rec.key.trim()) && provider.id !== 'openrouter') {
        if (aiModelsLoadStatus) aiModelsLoadStatus.textContent = 'Add your key first, then load models.';
        return;
      }
      if (aiModelsLoadStatus) aiModelsLoadStatus.textContent = 'Loading models...';
      btnLoadAllModels.disabled = true;
      try {
        const r = await fetch('/api/models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: currentProviderId, key: rec.key || '' }) });
        const j = await r.json();
        if (!j.ok || !Array.isArray(j.models) || !j.models.length) throw new Error((j && j.error) || 'No models found.');
        setCachedProviderModels(currentProviderId, j.models);
        if (aiModelsLoadStatus) aiModelsLoadStatus.textContent = j.models.length + ' models loaded — they are in the select below.';
        renderActiveAiProvider();
      } catch (e) {
        if (aiModelsLoadStatus) aiModelsLoadStatus.textContent = 'Could not load: ' + (e.message || 'error') + ' — keeping the previous list.';
      } finally {
        btnLoadAllModels.disabled = false;
      }
    });
  }

  // Key field listeners
  if (btnToggleShowKey) {
    btnToggleShowKey.addEventListener('click', () => {
      isKeyVisible = !isKeyVisible;
      if (aiKeyInput) aiKeyInput.type = isKeyVisible ? 'text' : 'password';
      btnToggleShowKey.textContent = isKeyVisible ? 'Hide' : 'Show';
    });
  }

  if (btnPasteKey) {
    btnPasteKey.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text && aiKeyInput) {
          aiKeyInput.value = text.trim();
          updateProviderRecord(currentProviderId, { key: text.trim(), saved: false });
          if (aiErrorMessage) aiErrorMessage.style.display = 'none';
        }
      } catch {
        // clipboard access unavailable
      }
    });
  }

  if (btnClearKey) {
    btnClearKey.addEventListener('click', () => {
      if (aiKeyInput) aiKeyInput.value = '';
      updateProviderRecord(currentProviderId, { key: '', saved: false });
      if (aiStatusBadge && aiStatusText) {
        aiStatusBadge.className = 'ai-status-badge not-connected';
        aiStatusText.textContent = 'Not connected';
      }
      renderAiProviderPills();
    });
  }

  if (aiKeyInput) {
    aiKeyInput.addEventListener('input', (e) => {
      updateProviderRecord(currentProviderId, { key: e.target.value, saved: false });
      if (aiErrorMessage) aiErrorMessage.style.display = 'none';
    });
  }

  // Save button action
  if (btnSaveAiModel) {
    btnSaveAiModel.addEventListener('click', () => {
      const provider = aiProviders.find(p => p.id === currentProviderId) || aiProviders[0];
      let rec = getProviderRecord(currentProviderId);
      // Save stores what the selects actually display: after live models load,
      // the select can display a model the record never stored (no change event
      // fired), so reconcile display into the record before validating.
      if (aiChatModelSelect && aiChatModelSelect.style.display !== 'none' && aiChatModelSelect.value) {
        updateProviderRecord(currentProviderId, { chatModel: aiChatModelSelect.value });
        rec = getProviderRecord(currentProviderId);
      }
      if (aiCodingModelSelect && aiCodingModelSelect.style.display !== 'none' && aiCodingModelSelect.value) {
        updateProviderRecord(currentProviderId, { codingModel: aiCodingModelSelect.value });
        rec = getProviderRecord(currentProviderId);
      }

      // Key validation
      if (provider.needsKey && (!rec.key || !rec.key.trim())) {
        if (aiErrorMessage) {
          aiErrorMessage.textContent = 'Please enter or paste an API key before saving.';
          aiErrorMessage.style.display = 'block';
        }
        return;
      }

      // Custom chat model validation
      if (rec.chatModel === 'Custom (type manually)' && (!rec.customChatModel || !rec.customChatModel.trim())) {
        if (aiErrorMessage) {
          aiErrorMessage.textContent = 'Please specify your custom chat model name.';
          aiErrorMessage.style.display = 'block';
        }
        return;
      }

      // Custom coding model validation
      if (rec.codingModel === 'Custom (type manually)' && (!rec.customCodingModel || !rec.customCodingModel.trim())) {
        if (aiErrorMessage) {
          aiErrorMessage.textContent = 'Please specify your custom coding model name.';
          aiErrorMessage.style.display = 'block';
        }
        return;
      }

      if (aiErrorMessage) aiErrorMessage.style.display = 'none';
      updateProviderRecord(currentProviderId, { saved: true });

      if (aiStatusBadge && aiStatusText) {
        aiStatusBadge.className = 'ai-status-badge saved';
        aiStatusText.textContent = 'Saved — Ready to chat';
      }

      renderAiProviderPills();
    });
  }

  // Initialize AI Models section
  renderAiProviderPills();
  renderActiveAiProvider();


  if (btnCloseReportModal) btnCloseReportModal.addEventListener('click', () => reportModal.classList.remove('active'));
  if (btnCancelReport) btnCancelReport.addEventListener('click', () => reportModal.classList.remove('active'));
  if (btnSubmitReport) {
    btnSubmitReport.addEventListener('click', () => {
      alert('Thank you! Your report has been submitted to the REDCAT team.');
      reportModal.classList.remove('active');
    });
  }

  if (btnCloseDownloadModal) btnCloseDownloadModal.addEventListener('click', () => downloadModal.classList.remove('active'));

  window.addEventListener('click', (e) => {
    if (e.target === settingsModal) settingsModal.classList.remove('active');
    if (e.target === reportModal) reportModal.classList.remove('active');
    if (e.target === downloadModal) downloadModal.classList.remove('active');
  });


  // --- Right Panel Segmented Tabs ---
  segButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      segButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      const tabId = btn.getAttribute('data-tab');
      const targetContent = document.getElementById(`tabContent${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
      if (targetContent) targetContent.classList.add('active');
    });
  });

  // --- Right Panel: Live Browser + Commands ---
  let browserLiveTimer = null;
  let browserViewBusy = false;
  async function loadBrowserView() {
    const urlEl = document.getElementById('browserUrlInput');
    const statusEl = document.getElementById('browserViewStatus');
    const imgEl = document.getElementById('browserViewImg');
    const frameEl = document.getElementById('browserFrame');
    const phEl = document.getElementById('browserViewPlaceholder');
    const titleEl = document.getElementById('browserViewTitle');
    const textEl = document.getElementById('browserViewText');
    if (!urlEl || browserViewBusy) return;
    browserViewBusy = true;
    if (statusEl) statusEl.textContent = 'Loading...';
    try {
      let rawUrl = urlEl.value.trim();
      let url = rawUrl;
      if (!/^https?:\/\//i.test(url)) {
        if (/^[^\s]+\.[^\s]+$/.test(url)) url = 'https://' + url;
        else if (url) url = 'https://lite.duckduckgo.com/lite/?q=' + encodeURIComponent(url);
      }
      const r = await fetch('/api/browser/view', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      const j = await r.json();
      if (j && j.ok) {
        if (imgEl) { imgEl.src = j.screenshot; imgEl.style.display = 'block'; }
        if (frameEl) frameEl.style.display = 'block';
        if (phEl) phEl.style.display = 'none';
        if (titleEl) titleEl.textContent = j.title || '';
        if (textEl) textEl.textContent = j.text || '';
        if (statusEl) statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString();
        saveBrowserStateForActive(url, j);
      } else {
        if (statusEl) statusEl.textContent = (j && j.error) || 'Browser view failed.';
      }
    } catch (e) { if (statusEl) statusEl.textContent = 'Server not found.'; }
    browserViewBusy = false;
  }
  const browserGoBtn = document.getElementById('browserGoBtn');
  if (browserGoBtn) browserGoBtn.addEventListener('click', loadBrowserView);
  const browserUrlInput = document.getElementById('browserUrlInput');
  if (browserUrlInput) browserUrlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); loadBrowserView(); } });
  const browserLiveToggle = document.getElementById('browserLiveToggle');
  if (browserLiveToggle) browserLiveToggle.addEventListener('change', () => {
    if (browserLiveToggle.checked) { loadBrowserView(); browserLiveTimer = setInterval(loadBrowserView, 5000); }
    else if (browserLiveTimer) { clearInterval(browserLiveTimer); browserLiveTimer = null; }
  });
  // (Commands tab removed 2026-11-05 — ali: the 5 slash buttons were extra.)

  // Close / Open Right Panel Toggle
  function closeRightPanel() {
    rightPanel.classList.add('collapsed');
    mainChatArea.classList.add('panel-collapsed');
    if (topAgentTrigger) topAgentTrigger.style.display = 'flex';
  }

  function openRightPanel() {
    rightPanel.classList.remove('collapsed');
    mainChatArea.classList.remove('panel-collapsed');
    if (topAgentTrigger) topAgentTrigger.style.display = 'none';
  }

  if (btnCloseRightPanel) btnCloseRightPanel.addEventListener('click', closeRightPanel);
  if (btnOpenRightPanel) btnOpenRightPanel.addEventListener('click', openRightPanel);

  // Edit Profile Name (if present)
  if (btnEditProfile) {
    btnEditProfile.addEventListener('click', () => {
      const newName = prompt('Enter agent display name:', agentNameDisplay.textContent);
      if (newName && newName.trim()) {
        agentNameDisplay.textContent = newName.trim().toUpperCase();
      }
    });
  }

  // --- Sidebar Chat Selection ---
  navChatItems.forEach(item => {
    item.addEventListener('click', (e) => {
      const chatId = item.getAttribute('data-chat-id');
      document.querySelectorAll('.nav-chat-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      showChats();
      switchChat(chatId);
    });
  });

  // Search filter in sidebar
  chatSearchInput.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase();
    document.querySelectorAll('#sideChatsContainer .nav-chat-item, #userAgentList .nav-chat-item').forEach(item => {
      const txt = item.textContent.toLowerCase();
      item.style.display = txt.includes(val) ? 'flex' : 'none';
    });
  });

  // Side chats: unified list (Main first, then sides in creation order),
  // instant new chat + hover 3-dots menu + delete + localStorage persistence.
  const chatMenu = document.createElement('div');
  chatMenu.className = 'chat-menu';
  chatMenu.innerHTML = '<button type="button" class="chat-menu-delete">Delete chat</button>';
  document.body.appendChild(chatMenu);

  function closeChatMenu() {
    chatMenu.classList.remove('open');
    const am = document.getElementById('agentMenu');
    if (am) am.classList.remove('open');
  }
  document.addEventListener('click', closeChatMenu);

  function enhanceSideChatItem(btn) {
    if (btn.querySelector('.chat-dots')) return;
    btn.classList.add('has-dots');
    const dots = document.createElement('span');
    dots.className = 'chat-dots';
    dots.textContent = '···';
    dots.title = 'Options';
    dots.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = chatMenu.classList.contains('open');
      closeChatMenu();
      if (!wasOpen) {
        const r = dots.getBoundingClientRect();
        chatMenu.style.left = Math.max(8, Math.min(r.right - 150, window.innerWidth - 160)) + 'px';
        chatMenu.style.top = (r.bottom + 4) + 'px';
        chatMenu.dataset.targetId = btn.getAttribute('data-chat-id') || '';
        chatMenu.classList.add('open');
      }
    });
    btn.appendChild(dots);
  }

  // --- Chat timestamps (2026-11-05, v2.45): real times only, never invented.
  // A message shows a small time only if it has a real stored timestamp
  // (m.ts, epoch ms, set when the message was created) — old messages
  // without one show no time at all. Sidebar rows show the chat file's
  // last-update time (updatedAt, set by the server on every save). Local PC
  // time is correct and expected.
  function formatChatTime(ts) {
    let ms = 0;
    if (typeof ts === 'number' && isFinite(ts) && ts > 0) ms = ts;
    else if (typeof ts === 'string' && ts.trim()) {
      const n = Number(ts);
      if (isFinite(n) && n > 0) ms = n;
      else { const d = new Date(ts); if (!isNaN(d.getTime())) ms = d.getTime(); }
    }
    if (!ms) return '';
    if (ms < 100000000000) ms = ms * 1000; // seconds -> ms (we only store ms)
    const d = new Date(ms);
    if (isNaN(d.getTime())) return '';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return hh + ':' + mm;
  }
  function msgTimeHtml(ts) {
    const t = formatChatTime(ts);
    return t ? '<span class="msg-time">' + t + '</span>' : '';
  }
  function msgTimeSpan(ts) {
    const t = formatChatTime(ts);
    if (!t) return null;
    const s = document.createElement('span');
    s.className = 'msg-time';
    s.textContent = t;
    return s;
  }
  // Last-update time per chat (from the server's updatedAt). Sidebar rows
  // show it as a small time at the right of the row, like real chat apps.
  const chatUpdatedAt = {};
  function setSidebarChatTime(chatId, ts) {
    const t = formatChatTime(ts);
    if (!t) return;
    if (typeof ts === 'number' && ts > 0) chatUpdatedAt[chatId] = ts;
    let row = null;
    if (chatId === 'main') row = document.querySelector('[data-chat-id="main"]');
    else {
      row = sideChatsContainer ? sideChatsContainer.querySelector('[data-chat-id="' + chatId + '"]') : null;
      if (!row && discordChatsList) row = discordChatsList.querySelector('[data-chat-id="' + chatId + '"]');
    }
    if (!row) return;
    let timeEl = row.querySelector('.chat-item-time');
    if (!timeEl) {
      timeEl = document.createElement('span');
      timeEl.className = 'chat-item-time';
      row.appendChild(timeEl);
    }
    timeEl.textContent = t;
  }
  function createSidebarItem(chatId, title, updatedAt) {
    const btn = document.createElement('button');
    btn.className = 'nav-chat-item';
    btn.setAttribute('data-chat-id', chatId);
    const label = document.createElement('span');
    label.className = 'chat-item-text';
    label.textContent = title;
    btn.appendChild(label);
    if (updatedAt) {
      const timeEl = document.createElement('span');
      timeEl.className = 'chat-item-time';
      timeEl.textContent = formatChatTime(updatedAt);
      if (timeEl.textContent) btn.appendChild(timeEl);
      if (typeof updatedAt === 'number' && updatedAt > 0) chatUpdatedAt[chatId] = updatedAt;
    }
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-chat-item').forEach(i => i.classList.remove('active'));
      btn.classList.add('active');
      showChats();
      switchChat(chatId);
    });
    sideChatsContainer.appendChild(btn);
    enhanceSideChatItem(btn);
    return btn;
  }

  // --- Discord section (2026-11-05): dedicated sidebar section + centre
  // view for mirrored Discord DM conversations. The PC poller mirrors each
  // Discord DM into a desktop chat (id "discord-<userId>") stored on the PC
  // (chats/discord-<id>.json) and served by GET /api/chats — the app renders
  // the section from that server data, so it is the same conversation the
  // user sees in Discord, shown on their own PC. No fake data: only real
  // mirrored Discord chats are ever rendered here.
  const discordSection = document.getElementById('discordSection');
  const discordChatsList = document.getElementById('discordChatsList');
  const discordChatsEmpty = document.getElementById('discordChatsEmpty');
  const discordConnectBtn = document.getElementById('discordConnectBtn');
  const discordChatHeader = document.getElementById('discordChatHeader');
  const discordChatHeaderName = document.getElementById('discordChatHeaderName');
  const discordChatTitles = {};
  // DISCORD DISCONNECT (2026-11-05): the × on a Discord profile row hides
  // the app-side mirror only — it never deletes the server chat file and
  // never removes the bot from the user's Discord server (that is done in
  // Discord: Server Settings -> Integrations). The disconnect state is kept
  // in localStorage so a refresh does not reconnect it. A new DM for that
  // chat (its history grows or its last message changes) reconnects it
  // automatically — that is the real behaviour, not a fake state.
  const DISCORD_DISCONNECTED_KEY = 'redcat-discord-disconnected-v1';
  const DISCORD_SEEN_KEYS_KEY = 'redcat-discord-seen-keys-v1';
  const discordDisconnectedIds = new Set();
  const discordSeenKeys = {};
  try {
    const savedDisc = JSON.parse(localStorage.getItem(DISCORD_DISCONNECTED_KEY) || '[]');
    if (Array.isArray(savedDisc)) savedDisc.forEach(id => { if (typeof id === 'string') discordDisconnectedIds.add(id); });
  } catch (err) {}
  try {
    const savedKeys = JSON.parse(localStorage.getItem(DISCORD_SEEN_KEYS_KEY) || '{}');
    if (savedKeys && typeof savedKeys === 'object') Object.keys(savedKeys).forEach(id => { if (typeof savedKeys[id] === 'string') discordSeenKeys[id] = savedKeys[id]; });
  } catch (err) {}
  function saveDiscordDisconnectState() {
    try { localStorage.setItem(DISCORD_DISCONNECTED_KEY, JSON.stringify(Array.from(discordDisconnectedIds))); } catch (err) {}
    try { localStorage.setItem(DISCORD_SEEN_KEYS_KEY, JSON.stringify(discordSeenKeys)); } catch (err) {}
  }
  function isDiscordChatId(id) { return typeof id === 'string' && id.indexOf('discord-') === 0; }
  // The mirror title is "Discord — <username>"; the profile row shows just
  // the username (e.g. "manamaliahmad").
  function discordUsernameFromTitle(title) {
    const t = String(title || 'Discord chat');
    const m = t.match(/^Discord\s*[—\-]\s*(.+)$/);
    return m ? m[1].trim() : t;
  }
  // A fingerprint of a Discord chat's history (length + last message). Used
  // to notice a new DM after a disconnect, even if the history is capped.
  function discordHistoryKey(history) {
    if (!Array.isArray(history) || !history.length) return '0|';
    const last = history[history.length - 1] || {};
    const text = String(last.content || last.text || '').slice(-120);
    return history.length + '|' + (last.role || '') + '|' + text;
  }
  function getDiscordEntries() {
    return Object.keys(chatStore).filter(id => isDiscordChatId(id)).map(id => ({ id: id, title: discordChatTitles[id] || 'Discord chat', history: chatHistories[id] || [] }));
  }
  // Disconnects one Discord mirror in the app only: hides its profile row
  // and brings back the + connect state. The server chat file stays intact
  // (no delete is sent), and removing the bot from Discord itself must be
  // done in Discord (Server Settings -> Integrations).
  function disconnectDiscordChat(id) {
    if (!isDiscordChatId(id)) return;
    discordDisconnectedIds.add(id);
    discordSeenKeys[id] = discordHistoryKey(chatHistories[id] || []);
    saveDiscordDisconnectState();
    if (currentChatId === id) {
      document.querySelectorAll('.nav-chat-item').forEach(i => i.classList.remove('active'));
      showChats();
      switchChat('main');
    }
    renderDiscordSection(getDiscordEntries());
    updateDiscordChatHeader();
  }
  // DISCONNECT CONFIRM (2026-11-05, v2.45): the × never disconnects at once.
  // It opens a centred confirm popup: "Are you sure you want to disconnect
  // Discord from RedCat?" — Yes disconnects (the app-side disconnect above),
  // Cancel closes the popup and stays connected (no state change).
  let pendingDiscordDisconnectId = null;
  function openDiscordDisconnectConfirm(id) {
    if (!isDiscordChatId(id)) return;
    pendingDiscordDisconnectId = id;
    const modal = document.getElementById('discordDisconnectModal');
    if (modal) modal.style.display = '';
  }
  function closeDiscordDisconnectConfirm() {
    pendingDiscordDisconnectId = null;
    const modal = document.getElementById('discordDisconnectModal');
    if (modal) modal.style.display = 'none';
  }
  function renderDiscordSection(entries) {
    if (!discordChatsList || !Array.isArray(entries)) return;
    // Only a valid snapshot re-renders the section. An empty or failed load
    // must never wipe it (same rule as the v2.40 persistence fix).
    const rawEntries = entries.filter(e => e && e.id && isDiscordChatId(e.id));
    let seenChanged = false;
    rawEntries.forEach(entry => {
      const key = discordHistoryKey(entry.history);
      const seenKey = discordSeenKeys[entry.id] || '';
      // A new DM after a disconnect changes the history fingerprint — the
      // mirror (and the profile row) comes back on its own. Real behaviour.
      if (discordDisconnectedIds.has(entry.id) && key !== '' && key !== seenKey) {
        discordDisconnectedIds.delete(entry.id);
        seenChanged = true;
      }
      if (key !== seenKey) { discordSeenKeys[entry.id] = key; seenChanged = true; }
    });
    if (seenChanged) saveDiscordDisconnectState();
    const discordEntries = rawEntries.filter(e => !isChatDeleted(e.id) && !discordDisconnectedIds.has(e.id));
    discordChatsList.innerHTML = '';
    discordEntries.forEach(entry => {
      try {
        const title = entry.title || 'Discord chat';
        discordChatTitles[entry.id] = title;
        // Profile row: Discord icon + username, with a × to disconnect the
        // app-side mirror. The × stops the row click (it must not open the chat).
        const row = document.createElement('div');
        row.className = 'discord-chat-row';
        const btn = document.createElement('button');
        btn.className = 'nav-chat-item discord-chat-item';
        btn.setAttribute('data-chat-id', entry.id);
        const icon = document.createElement('img');
        icon.className = 'discord-chat-row-icon';
        icon.src = '/assets/mcp-logos/discord.svg';
        icon.alt = 'Discord';
        const label = document.createElement('span');
        label.className = 'chat-item-text';
        label.textContent = discordUsernameFromTitle(title);
        btn.appendChild(icon);
        btn.appendChild(label);
        // TIMESTAMPS (2026-11-05, v2.45): small last-activity time on the
        // profile row, from the chat file's real updatedAt (never invented).
        if (typeof entry.updatedAt === 'number' && entry.updatedAt > 0) chatUpdatedAt[entry.id] = entry.updatedAt;
        const rowTime = formatChatTime(entry.updatedAt || chatUpdatedAt[entry.id]);
        if (rowTime) {
          const timeEl = document.createElement('span');
          timeEl.className = 'chat-item-time';
          timeEl.textContent = rowTime;
          btn.appendChild(timeEl);
        }
        btn.addEventListener('click', () => {
          document.querySelectorAll('.nav-chat-item').forEach(i => i.classList.remove('active'));
          btn.classList.add('active');
          showChats();
          switchChat(entry.id);
        });
        const cross = document.createElement('button');
        cross.type = 'button';
        cross.className = 'discord-disconnect-btn';
        cross.title = 'Disconnect Discord (hides this mirror in the app only)';
        cross.textContent = '×';
        cross.addEventListener('click', (e) => {
          e.stopPropagation();
          // DISCONNECT CONFIRM (2026-11-05, v2.45): the × never disconnects
          // at once — it opens a centred confirm popup first.
          openDiscordDisconnectConfirm(entry.id);
        });
        row.appendChild(btn);
        row.appendChild(cross);
        discordChatsList.appendChild(row);
      } catch (err) {}
    });
    // The + connect icon shows only when no Discord mirror is connected
    // (first time, or after disconnecting). Clicking it opens the shared-bot
    // authorize page so the user connects from here.
    if (discordConnectBtn) discordConnectBtn.style.display = discordEntries.length ? 'none' : '';
    if (discordChatsEmpty) discordChatsEmpty.style.display = discordEntries.length ? 'none' : '';
    if (discordSection) discordSection.style.display = '';
  }
  // The + connect icon opens the shared RedCat bot authorize page in a new
  // tab (same link as the Connectors card). Bound once here, not per render.
  if (discordConnectBtn) {
    discordConnectBtn.addEventListener('click', () => {
      openDiscordConnect();
    });
  }
  // Disconnect confirm popup buttons (bound once here, not per render).
  // Yes disconnects; Cancel (or clicking outside, or Escape) closes the
  // popup and stays connected — no state change at all.
  const discordDisconnectYes = document.getElementById('discordDisconnectYes');
  if (discordDisconnectYes) {
    discordDisconnectYes.addEventListener('click', () => {
      const id = pendingDiscordDisconnectId;
      closeDiscordDisconnectConfirm();
      if (id) disconnectDiscordChat(id);
    });
  }
  const discordDisconnectCancel = document.getElementById('discordDisconnectCancel');
  if (discordDisconnectCancel) {
    discordDisconnectCancel.addEventListener('click', () => { closeDiscordDisconnectConfirm(); });
  }
  const discordDisconnectModal = document.getElementById('discordDisconnectModal');
  if (discordDisconnectModal) {
    discordDisconnectModal.addEventListener('click', (e) => {
      if (e.target === discordDisconnectModal) closeDiscordDisconnectConfirm();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pendingDiscordDisconnectId) closeDiscordDisconnectConfirm();
  });
  // Shows the Discord + RedCat header in the centre and the Discord-purple
  // bubbles whenever a Discord chat is open; hides them for every other chat.
  function updateDiscordChatHeader() {
    const isDiscord = isDiscordChatId(currentChatId);
    if (discordChatHeader) {
      discordChatHeader.style.display = isDiscord ? '' : 'none';
      if (isDiscord && discordChatHeaderName) {
        discordChatHeaderName.textContent = discordChatTitles[currentChatId] || 'Discord chat';
      }
    }
    if (mainChatArea) mainChatArea.classList.toggle('discord-chat-open', isDiscord);
  }
  // EMPTY-STATE HINT (2026-11-05, v2.45): when the open chat genuinely has
  // no messages (Main chat starts empty), show an honest hint instead of a
  // blank centre. It lives outside the message stream, so it is never saved
  // as chat content and never invents history.
  function updateEmptyChatHint() {
    const hint = document.getElementById('emptyChatHint');
    if (!hint) return;
    const history = chatHistories[currentChatId] || [];
    const hasMessages = Array.isArray(history) && history.length > 0;
    hint.style.display = hasMessages ? 'none' : '';
  }

  chatMenu.querySelector('.chat-menu-delete').addEventListener('click', (e) => {
    e.stopPropagation();
    const id = chatMenu.dataset.targetId;
    closeChatMenu();
    if (!id || id === 'main') return;
    const item = sideChatsContainer.querySelector('[data-chat-id="' + id + '"]');
    const p = chatPipelines[id];
    if (p) {
      p.stopped = true;
      try { if (p.abort) p.abort.abort(); } catch (err) {}
      if (p.finishTimer) clearTimeout(p.finishTimer);
      if (p.triggerTimer) clearTimeout(p.triggerTimer);
      if (p.stream && p.stream.timer) clearInterval(p.stream.timer);
      delete chatPipelines[id];
    }
    delete chatStore[id];
    delete chatHistories[id];
    delete chatThinking[id];
    if (item) {
      const wasActive = item.classList.contains('active');
      item.remove();
      if (wasActive) {
        const mainBtn = document.querySelector('.nav-chat-item[data-chat-id="main"]');
        if (mainBtn) mainBtn.classList.add('active');
        showChats();
        switchChat('main');
      }
    }
    deletedChatIds.add(id);
    serverDeletedChatIds.add(id);
    saveDeletedTombstone();
    persistChats();
  });

  document.querySelectorAll('#sideChatsContainer .nav-chat-item').forEach(enhanceSideChatItem);

  let sideChatCounter = 0;
  btnNewSideChat.addEventListener('click', () => {
    sideChatCounter++;
    const chatId = 'side-new-' + Date.now();
    const title = sideChatCounter === 1 ? 'New chat' : 'New chat ' + sideChatCounter;
    const btn = createSidebarItem(chatId, title);
    document.querySelectorAll('.nav-chat-item').forEach(i => i.classList.remove('active'));
    btn.classList.add('active');
    showChats();
    switchChat(chatId);
    persistChats();
  });

  // --- User agents: persistent agent chats created by the user ---
  // A user agent is a full chat (own history, own browser view, own model).
  // Keys stay in Settings per provider; the agent only picks provider + model.
  // Approval-first still applies: agent runs use the same approval cards.
  const userAgentList = document.getElementById('userAgentList');
  const btnCreateUserAgent = document.getElementById('btnCreateUserAgent');
  const userAgents = {};
  let agentCounter = 0;
  let mainBrowserState = null;

  function getUserAgentMeta(chatId) { return userAgents[chatId] || null; }

  function loadAgentCat(el, colorIndex) {
    if (!el) return;
    try {
      const color = getTaskAgentColor(Math.max(1, colorIndex || 1));
      el.style.filter = color.filter;
      if (window.lottie) {
        if (window._redCatAnimData) window.lottie.loadAnimation({ container: el, animationData: window._redCatAnimData, renderer: 'svg', loop: true, autoplay: true });
        else window.lottie.loadAnimation({ container: el, path: '/lottie-animations/red-cat.json', renderer: 'svg', loop: true, autoplay: true });
      }
    } catch (e) {}
  }

  function createUserAgentRow(meta) {
    if (!userAgentList) return null;
    const existing = userAgentList.querySelector('[data-chat-id="' + meta.id + '"]');
    if (existing) return existing;
    const btn = document.createElement('button');
    btn.className = 'nav-chat-item user-agent-item has-dots';
    btn.setAttribute('data-chat-id', meta.id);
    const cat = document.createElement('span');
    cat.className = 'user-agent-cat';
    const label = document.createElement('span');
    label.className = 'chat-item-text';
    label.textContent = meta.name || 'user agent';
    const dots = document.createElement('span');
    dots.className = 'chat-dots';
    dots.textContent = '···';
    dots.title = 'Options';
    dots.addEventListener('click', (e) => {
      e.stopPropagation();
      openAgentMenu(btn, meta, dots);
    });
    btn.appendChild(cat);
    btn.appendChild(label);
    btn.appendChild(dots);
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-chat-item').forEach(i => i.classList.remove('active'));
      btn.classList.add('active');
      showChats();
      switchChat(meta.id);
    });
    btn.addEventListener('dblclick', () => { startAgentRowRename(btn, meta); });
    userAgentList.appendChild(btn);
    if (chatStore[meta.id] === undefined) chatStore[meta.id] = '';
    if (!chatHistories[meta.id]) chatHistories[meta.id] = [];
    loadAgentCat(cat, meta.colorIndex);
    return btn;
  }

  function closeAgentMenu() {
    const am = document.getElementById('agentMenu');
    if (am) am.classList.remove('open');
  }
  function openAgentMenu(btn, meta, dots) {
    let menu = document.getElementById('agentMenu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'agentMenu';
      menu.className = 'chat-menu';
      menu.innerHTML = '<button type="button" class="chat-menu-rename">Rename</button><button type="button" class="chat-menu-delete">Delete agent</button>';
      document.body.appendChild(menu);
      menu.querySelector('.chat-menu-rename').addEventListener('click', (e) => {
        e.stopPropagation();
        const id = menu.dataset.targetId || '';
        closeAgentMenu();
        const m = userAgents[id];
        const row = userAgentList ? userAgentList.querySelector('[data-chat-id="' + id + '"]') : null;
        if (m && row) startAgentRowRename(row, m);
      });
      menu.querySelector('.chat-menu-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        const id = menu.dataset.targetId || '';
        closeAgentMenu();
        if (id) deleteUserAgent(id);
      });
    }
    const wasOpen = menu.classList.contains('open');
    closeChatMenu();
    closeAgentMenu();
    if (wasOpen && menu.dataset.targetId === meta.id) return;
    const r = dots.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(r.right - 150, window.innerWidth - 160)) + 'px';
    menu.style.top = (r.bottom + 4) + 'px';
    menu.dataset.targetId = meta.id;
    menu.classList.add('open');
  }
  function startAgentRowRename(btn, meta) {
    const label = btn.querySelector('.chat-item-text');
    if (!label || btn.querySelector('.user-agent-rename-input')) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'user-agent-rename-input';
    input.value = meta.name || 'user agent';
    input.maxLength = 40;
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      const v = input.value.trim();
      if (save && v) {
        meta.name = v;
        const nameInput = document.getElementById('agentNameInput');
        if (currentChatId === meta.id && nameInput) nameInput.value = v;
        persistChats();
      }
      const nl = document.createElement('span');
      nl.className = 'chat-item-text';
      nl.textContent = meta.name || 'user agent';
      input.replaceWith(nl);
    };
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('mousedown', (e) => e.stopPropagation());
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { finish(false); }
    });
    label.replaceWith(input);
    input.focus();
    input.select();
  }
  function deleteUserAgent(id) {
    const row = userAgentList ? userAgentList.querySelector('[data-chat-id="' + id + '"]') : null;
    const p = chatPipelines[id];
    if (p) {
      p.stopped = true;
      try { if (p.abort) p.abort.abort(); } catch (e) {}
      if (p.finishTimer) clearTimeout(p.finishTimer);
      if (p.triggerTimer) clearTimeout(p.triggerTimer);
      if (p.stream && p.stream.timer) clearInterval(p.stream.timer);
      delete chatPipelines[id];
    }
    delete userAgents[id];
    delete chatStore[id];
    delete chatHistories[id];
    delete chatThinking[id];
    const wasActive = row ? row.classList.contains('active') : (currentChatId === id);
    if (row) row.remove();
    deletedChatIds.add(id);
    serverDeletedChatIds.add(id);
    saveDeletedTombstone();
    if (wasActive) {
      const mainBtn = document.querySelector('.nav-chat-item[data-chat-id="main"]');
      document.querySelectorAll('.nav-chat-item').forEach(i => i.classList.remove('active'));
      if (mainBtn) mainBtn.classList.add('active');
      showChats();
      switchChat('main');
      delete chatStore[id];
      delete chatHistories[id];
      delete chatThinking[id];
    }
    persistChats();
  }

  function nextUserAgentName() {
    let n = 0;
    Object.values(userAgents).forEach(m => { if (/^user agent( \d+)?$/.test((m.name || '').trim())) n++; });
    return n === 0 ? 'user agent' : 'user agent ' + (n + 1);
  }

  function createUserAgent() {
    agentCounter++;
    const id = 'agent-' + Date.now();
    const meta = { id: id, name: nextUserAgentName(), colorIndex: agentCounter, providerId: '', chatModel: '', customChatModel: '', browser: null };
    userAgents[id] = meta;
    const btn = createUserAgentRow(meta);
    document.querySelectorAll('.nav-chat-item').forEach(i => i.classList.remove('active'));
    if (btn) btn.classList.add('active');
    showChats();
    switchChat(id);
    persistChats();
  }

  if (btnCreateUserAgent) btnCreateUserAgent.addEventListener('click', createUserAgent);

  let agentProfileAnim = null;
  function agentModelLabel(meta) {
    if (!meta) return '';
    if (meta.providerId) {
      const p = aiProviders.find(x => x.id === meta.providerId);
      const m = (meta.chatModel && meta.chatModel !== 'Custom (type manually)') ? meta.chatModel : (meta.customChatModel || '');
      return 'Model: ' + (p ? p.name : meta.providerId) + (m ? ' / ' + m : '');
    }
    return 'Model: Settings default';
  }

  function renderAgentProfile() {
    const mainBlock = document.getElementById('agentProfileMain');
    const agentBlock = document.getElementById('agentProfileAgent');
    const meta = getUserAgentMeta(currentChatId);
    if (mainBlock) mainBlock.style.display = meta ? 'none' : '';
    if (agentBlock) agentBlock.style.display = meta ? '' : 'none';
    if (!meta) return;
    const cat = document.getElementById('agentProfileCat');
    if (cat) {
      try { if (agentProfileAnim) agentProfileAnim.destroy(); } catch (e) {}
      agentProfileAnim = null;
      const color = getTaskAgentColor(Math.max(1, meta.colorIndex || 1));
      cat.style.filter = color.filter;
      try {
        if (window.lottie) {
          if (window._redCatAnimData) agentProfileAnim = window.lottie.loadAnimation({ container: cat, animationData: window._redCatAnimData, renderer: 'svg', loop: true, autoplay: true });
          else agentProfileAnim = window.lottie.loadAnimation({ container: cat, path: '/lottie-animations/red-cat.json', renderer: 'svg', loop: true, autoplay: true });
        }
      } catch (e) {}
    }
    const nameInput = document.getElementById('agentNameInput');
    if (nameInput && document.activeElement !== nameInput) nameInput.value = meta.name || 'user agent';
    const line = document.getElementById('agentModelLine');
    if (line) line.textContent = agentModelLabel(meta);
  }

  function saveAgentName() {
    const meta = getUserAgentMeta(currentChatId);
    const nameInput = document.getElementById('agentNameInput');
    if (!meta || !nameInput) return;
    const v = nameInput.value.trim();
    meta.name = v || 'user agent';
    nameInput.value = meta.name;
    const row = userAgentList ? userAgentList.querySelector('[data-chat-id="' + meta.id + '"] .chat-item-text') : null;
    if (row) row.textContent = meta.name;
    persistChats();
  }

  const agentNameInput = document.getElementById('agentNameInput');
  if (agentNameInput) {
    agentNameInput.addEventListener('change', saveAgentName);
    agentNameInput.addEventListener('blur', saveAgentName);
    agentNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); agentNameInput.blur(); } });
  }

  function agentModelOptions(provider) {
    const list = (provider.models || []).filter(m => m && m !== 'Custom (type manually)');
    if (!list.length && provider.examples) provider.examples.forEach(m => { if (m && !list.includes(m)) list.push(m); });
    return list;
  }
  function fillAgentModelSelect() {
    const provSel = document.getElementById('agentProviderSelect');
    const modSel = document.getElementById('agentModelSelect');
    const customInput = document.getElementById('agentCustomModelInput');
    if (!provSel || !modSel) return;
    const provider = aiProviders.find(p => p.id === provSel.value) || aiProviders[0];
    const opts = agentModelOptions(provider);
    const prev = modSel.value;
    modSel.innerHTML = opts.map(m => '<option value="' + escapeHtml(m) + '">' + escapeHtml(m) + '</option>').join('') + '<option value="Custom (type manually)">Custom (type manually)</option>';
    const meta = getUserAgentMeta(currentChatId);
    let want = prev;
    if (!opts.includes(want) && want !== 'Custom (type manually)') {
      want = (meta && meta.chatModel && (opts.includes(meta.chatModel) || meta.chatModel === 'Custom (type manually)')) ? meta.chatModel : (opts[0] || 'Custom (type manually)');
    }
    modSel.value = want;
    if (customInput) {
      const showCustom = modSel.value === 'Custom (type manually)';
      customInput.style.display = showCustom ? '' : 'none';
      if (showCustom) customInput.value = (meta && meta.customChatModel) || '';
    }
  }
  function openAgentModelPopover() {
    const pop = document.getElementById('agentModelPopover');
    const provSel = document.getElementById('agentProviderSelect');
    if (!pop || !provSel) return;
    provSel.innerHTML = aiProviders.map(p => '<option value="' + p.id + '">' + escapeHtml(p.name) + '</option>').join('');
    const meta = getUserAgentMeta(currentChatId);
    provSel.value = (meta && meta.providerId) ? meta.providerId : currentProviderId;
    fillAgentModelSelect();
    pop.style.display = '';
  }
  const btnAgentSettings = document.getElementById('btnAgentSettings');
  if (btnAgentSettings) btnAgentSettings.addEventListener('click', openAgentModelPopover);
  const agentProviderSelect = document.getElementById('agentProviderSelect');
  if (agentProviderSelect) agentProviderSelect.addEventListener('change', fillAgentModelSelect);
  const agentModelSelect = document.getElementById('agentModelSelect');
  if (agentModelSelect) agentModelSelect.addEventListener('change', fillAgentModelSelect);
  const btnAgentModelSave = document.getElementById('btnAgentModelSave');
  if (btnAgentModelSave) btnAgentModelSave.addEventListener('click', () => {
    const meta = getUserAgentMeta(currentChatId);
    const provSel = document.getElementById('agentProviderSelect');
    const modSel = document.getElementById('agentModelSelect');
    const customInput = document.getElementById('agentCustomModelInput');
    if (!meta || !provSel || !modSel) return;
    meta.providerId = provSel.value;
    meta.chatModel = modSel.value;
    meta.customChatModel = (modSel.value === 'Custom (type manually)' && customInput) ? customInput.value.trim() : '';
    const line = document.getElementById('agentModelLine');
    if (line) line.textContent = agentModelLabel(meta);
    const pop = document.getElementById('agentModelPopover');
    if (pop) pop.style.display = 'none';
    persistChats();
  });
  const btnAgentModelClose = document.getElementById('btnAgentModelClose');
  if (btnAgentModelClose) btnAgentModelClose.addEventListener('click', () => {
    const pop = document.getElementById('agentModelPopover');
    if (pop) pop.style.display = 'none';
  });

  function getBrowserState(chatId) {
    const meta = getUserAgentMeta(chatId);
    if (meta) return meta.browser || null;
    if (chatId === 'main') return mainBrowserState;
    return null;
  }
  function setBrowserState(chatId, state) {
    const meta = getUserAgentMeta(chatId);
    if (meta) { meta.browser = state; persistChats(); }
    else if (chatId === 'main') { mainBrowserState = state; }
  }
  function saveBrowserStateForActive(url, j) {
    if (!j || !j.ok) return;
    const shot = (j.screenshot && j.screenshot.length < 200000) ? j.screenshot : '';
    setBrowserState(currentChatId, { url: url, title: j.title || '', text: j.text || '', shot: shot });
  }
  function renderBrowserState(chatId) {
    const urlEl = document.getElementById('browserUrlInput');
    const statusEl = document.getElementById('browserViewStatus');
    const imgEl = document.getElementById('browserViewImg');
    const frameEl = document.getElementById('browserFrame');
    const phEl = document.getElementById('browserViewPlaceholder');
    const titleEl = document.getElementById('browserViewTitle');
    const textEl = document.getElementById('browserViewText');
    const state = getBrowserState(chatId);
    if (!state) {
      if (urlEl) urlEl.value = '';
      if (imgEl) { imgEl.style.display = 'none'; imgEl.removeAttribute('src'); }
      if (frameEl) frameEl.style.display = 'none';
      if (phEl) phEl.style.display = '';
      if (titleEl) titleEl.textContent = '';
      if (textEl) textEl.textContent = '';
      if (statusEl) statusEl.textContent = '';
      return;
    }
    if (urlEl) urlEl.value = state.url || '';
    if (titleEl) titleEl.textContent = state.title || '';
    if (textEl) textEl.textContent = state.text || '';
    if (state.shot && imgEl) { imgEl.src = state.shot; imgEl.style.display = 'block'; if (frameEl) frameEl.style.display = 'block'; if (phEl) phEl.style.display = 'none'; }
    else { if (imgEl) imgEl.style.display = 'none'; if (frameEl) frameEl.style.display = 'none'; if (phEl) phEl.style.display = 'none'; }
    if (statusEl) statusEl.textContent = state.shot ? 'Saved view' : 'Saved view — press Go to reload screenshot';
  }
  function refreshRightPanelForChat() {
    renderAgentProfile();
    const pop = document.getElementById('agentModelPopover');
    if (pop) pop.style.display = 'none';
    const isAgent = !!getUserAgentMeta(currentChatId);
    // (Commands tab removed 2026-11-05 — no cmdBtn/cmdContent anymore.)
    if (isAgent) {
      const browserBtn = document.querySelector('.seg-btn[data-tab="browser"]');
      const browserContent = document.getElementById('tabContentBrowser');
      if (browserBtn) browserBtn.classList.add('active');
      if (browserContent) browserContent.classList.add('active');
    }
    const liveToggle = document.getElementById('browserLiveToggle');
    if (liveToggle && liveToggle.checked) {
      liveToggle.checked = false;
      try { if (browserLiveTimer) clearInterval(browserLiveTimer); } catch (e) {}
      browserLiveTimer = null;
    }
    renderBrowserState(currentChatId);
  }

  function resolveChatModel(chatId) {
    const meta = getUserAgentMeta(chatId);
    if (meta && meta.providerId) {
      const provider = aiProviders.find(p => p.id === meta.providerId) || aiProviders[0];
      const rec = getProviderRecord(provider.id);
      let model = '';
      if (meta.chatModel && meta.chatModel !== 'Custom (type manually)') model = meta.chatModel;
      else if (meta.customChatModel && meta.customChatModel.trim()) model = meta.customChatModel.trim();
      else model = (provider.models || []).find(m => m !== 'Custom (type manually)') || '';
      return { provider: provider, key: (rec.key || '').trim(), model: model };
    }
    const provider = aiProviders.find(p => p.id === currentProviderId) || aiProviders[0];
    const rec = getProviderRecord(provider.id);
    let model = '';
    if (rec.chatModel && rec.chatModel !== 'Custom (type manually)') model = rec.chatModel;
    else if (rec.customChatModel && rec.customChatModel.trim()) model = rec.customChatModel.trim();
    else model = (provider.models || []).find(m => m !== 'Custom (type manually)') || '';
    return { provider: provider, key: (rec.key || '').trim(), model: model };
  }

  // --- Chat persistence (localStorage): chats survive refresh until the user deletes them.
  // Main chat is NEVER deletable; a deleted side chat is gone from storage for good.
  const CHAT_STORAGE_KEY = 'redcat_chats_v1';
  const deletedChatIds = new Set();
  // TOMBSTONE (2026-11-05): deleted chat IDs are recorded on the server
  // (chats/__meta__.json) and mirrored here. A tombstoned chat is NEVER
  // re-synced to the server, NEVER rendered, and is purged from localStorage
  // on load — so a deleted chat can never come back after a reload. The
  // server tombstone is the source of truth; this local copy only covers the
  // case where the server is unreachable on a later load.
  const DELETED_CHATS_KEY = 'redcat_deleted_chats_v1';
  const serverDeletedChatIds = new Set();
  function isChatDeleted(id) { return !!id && (deletedChatIds.has(id) || serverDeletedChatIds.has(id)); }
  function loadDeletedTombstone() {
    try {
      const v = JSON.parse(localStorage.getItem(DELETED_CHATS_KEY) || '[]');
      if (Array.isArray(v)) v.forEach(id => { if (typeof id === 'string' && id) serverDeletedChatIds.add(id); });
    } catch (e) {}
  }
  function saveDeletedTombstone() {
    try { localStorage.setItem(DELETED_CHATS_KEY, JSON.stringify(Array.from(serverDeletedChatIds).slice(0, 500))); } catch (e) {}
  }
  function purgeDeletedFromLocalStorage() {
    try {
      const stored = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || 'null');
      if (!stored || !Array.isArray(stored.chats)) return;
      const before = stored.chats.length;
      stored.chats = stored.chats.filter(e => e && e.id && !isChatDeleted(e.id));
      if (stored.chats.length !== before) localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(stored));
    } catch (e) {}
  }
  loadDeletedTombstone();
  function cleanChatHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html || '';
    tmp.querySelectorAll('.stream-cursor, .chat-notice-card').forEach(el => el.remove());
    tmp.querySelectorAll('#leadsDocCard').forEach(el => el.remove());
    tmp.querySelectorAll('article').forEach(el => { if (el.textContent.includes('Ye rahi poori list')) el.remove(); });
    return tmp.innerHTML;
  }
  function persistChats() {
    try {
      const chats = [];
      const mainHtml = (currentChatId === 'main') ? cleanChatHtml(chatStream.innerHTML) : cleanChatHtml(chatStore['main'] || '');
      chats.push({ id: 'main', title: 'Main chat', html: mainHtml, history: chatHistories['main'] || [] });
      sideChatsContainer.querySelectorAll('.nav-chat-item').forEach(btn => {
        const id = btn.getAttribute('data-chat-id');
        if (!id) return;
        const label = btn.querySelector('.chat-item-text');
        const html = (id === currentChatId) ? cleanChatHtml(chatStream.innerHTML) : cleanChatHtml(chatStore[id] || '');
        chats.push({ id: id, title: label ? label.textContent : 'New chat', html: html, history: chatHistories[id] || [] });
      });
      // DISCORD SECTION (2026-11-05): keep Discord mirror chats in the
      // localStorage snapshot too, so they survive as a fallback when the
      // server is unreachable on load (the server stays the source of truth).
      document.querySelectorAll('#discordChatsList .discord-chat-item').forEach(btn => {
        const id = btn.getAttribute('data-chat-id');
        if (!id) return;
        const label = btn.querySelector('.chat-item-text');
        const html = (id === currentChatId) ? cleanChatHtml(chatStream.innerHTML) : cleanChatHtml(chatStore[id] || '');
        chats.push({ id: id, title: label ? label.textContent : 'New chat', html: html, history: chatHistories[id] || [] });
      });
      document.querySelectorAll('#userAgentList .nav-chat-item').forEach(btn => {
        const id = btn.getAttribute('data-chat-id');
        if (!id) return;
        const meta = userAgents[id] || {};
        const label = btn.querySelector('.chat-item-text');
        const html = (id === currentChatId) ? cleanChatHtml(chatStream.innerHTML) : cleanChatHtml(chatStore[id] || '');
        chats.push({ id: id, title: label ? label.textContent : (meta.name || 'user agent'), html: html, history: chatHistories[id] || [], kind: 'agent', colorIndex: meta.colorIndex || 0, providerId: meta.providerId || '', chatModel: meta.chatModel || '', customChatModel: meta.customChatModel || '', browser: meta.browser || null });
      });
      // Safety: never let an empty or stale snapshot destroy saved chats.
      // A tab that loaded before the latest chats (or failed to restore)
      // must not overwrite good stored data with a blank snapshot, and
      // chats saved from another tab must survive this tab's save, except
      // chats explicitly deleted in this tab.
      let stored = null;
      try { stored = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || 'null'); } catch (err) { stored = null; }
      const known = new Set(chats.map(c => c.id));
      if (stored && Array.isArray(stored.chats)) {
        stored.chats.forEach(entry => {
          if (!entry || !entry.id || known.has(entry.id) || isChatDeleted(entry.id)) return;
          if (!entry.html) return;
          const merged = { id: entry.id, title: entry.title || 'New chat', html: entry.html, history: Array.isArray(entry.history) ? entry.history : [] };
          if (entry.kind === 'agent') { merged.kind = 'agent'; merged.colorIndex = entry.colorIndex || 0; merged.providerId = entry.providerId || ''; merged.chatModel = entry.chatModel || ''; merged.customChatModel = entry.customChatModel || ''; merged.browser = entry.browser || null; }
          chats.push(merged);
        });
        const storedMain = stored.chats.find(e => e && e.id === 'main');
        const mainEntry = chats.find(c => c.id === 'main');
        if (storedMain && storedMain.html && mainEntry && !mainEntry.html) {
          mainEntry.html = storedMain.html;
          if ((!mainEntry.history || !mainEntry.history.length) && storedMain.history) mainEntry.history = storedMain.history;
        }
      }
      // TOMBSTONE (2026-11-05): never persist or re-sync a deleted chat.
      for (let i = chats.length - 1; i >= 0; i--) { if (!chats[i] || !chats[i].id || isChatDeleted(chats[i].id)) chats.splice(i, 1); }
      const hasContent = chats.some(c => c.html);
      if (!hasContent && stored && Array.isArray(stored.chats) && stored.chats.some(c => c.html)) return;
      let counter = sideChatCounter;
      if (stored && typeof stored.counter === 'number' && stored.counter > counter) counter = stored.counter;
      let aCounter = agentCounter;
      if (stored && typeof stored.agentCounter === 'number' && stored.agentCounter > aCounter) aCounter = stored.agentCounter;
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify({ version: 1, counter: counter, agentCounter: aCounter, chats: chats }));
      try { queueServerChatSync(chats, counter, aCounter); } catch (err2) {}
    } catch (err) {}
  }
  function rebindThinkingToggles() {
    if (!chatStream) return;
    chatStream.querySelectorAll('.thinking-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const block = btn.closest('.thinking-block');
        const detail = block ? block.querySelector('.thinking-detail') : null;
        if (detail) detail.classList.toggle('is-hidden');
      });
    });
    chatStream.querySelectorAll('.thinking-steps-toggle').forEach(btn => {
      bindThinkingStepsToggle(btn.closest('.thinking-block'));
    });
  }
  function restoreChats(savedOverride) {
    let saved = savedOverride || null;
    if (!saved) { try { saved = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || 'null'); } catch (err) { saved = null; } }
    if (!saved || !Array.isArray(saved.chats)) return;
    // PERSISTENCE (2026-11-05): an empty snapshot must never clear the sidebar.
    // An empty list means "no data loaded", not "the user has no chats".
    if (!saved.chats.length) return;
    if (typeof saved.counter === 'number' && saved.counter >= 0) sideChatCounter = saved.counter;
    if (typeof saved.agentCounter === 'number' && saved.agentCounter >= 0) agentCounter = saved.agentCounter;
    sideChatsContainer.innerHTML = '';
    let mainEntry = null;
    saved.chats.forEach(entry => {
      try {
        if (!entry || !entry.id || isChatDeleted(entry.id)) return;
        if (entry.id === 'main') { mainEntry = entry; return; }
        if (entry.kind === 'agent') {
          userAgents[entry.id] = { id: entry.id, name: entry.title || 'user agent', colorIndex: entry.colorIndex || 0, providerId: entry.providerId || '', chatModel: entry.chatModel || '', customChatModel: entry.customChatModel || '', browser: entry.browser || null };
          if (typeof entry.colorIndex === 'number' && entry.colorIndex > agentCounter) agentCounter = entry.colorIndex;
          createUserAgentRow(userAgents[entry.id]);
          chatStore[entry.id] = cleanChatHtml(entry.html || '');
          chatHistories[entry.id] = Array.isArray(entry.history) ? entry.history : [];
          return;
        }
        // DISCORD SECTION (2026-11-05): Discord mirror chats live in the
        // Discord section, not the general list — skip them here (their
        // store/history are still saved below so they open in the centre).
        // TIMESTAMPS (2026-11-05, v2.45): sidebar rows show the chat file's
        // real last-update time (updatedAt), never an invented time.
        if (!isDiscordChatId(entry.id)) createSidebarItem(entry.id, entry.title || 'New chat', entry.updatedAt);
        chatStore[entry.id] = cleanChatHtml(entry.html || '');
        chatHistories[entry.id] = Array.isArray(entry.history) ? entry.history : [];
      } catch (err) {}
    });
    if (mainEntry) {
      chatStore['main'] = cleanChatHtml(mainEntry.html || '');
      chatHistories['main'] = Array.isArray(mainEntry.history) ? mainEntry.history : [];
      if (chatStream) chatStream.innerHTML = chatStore['main'];
      demoteDeadLocalLinks(chatStream);
      migrateRawMarkdownCards(chatStream);
      rebindThinkingToggles();
      // MAIN CHAT PERSISTENCE (2026-11-05, v2.45): Main chat uses the same
      // hardening as Discord — it is restored from the server snapshot
      // (never cleared on an empty snapshot, retried on failure, localStorage
      // fallback). Its sidebar time comes from the real stored updatedAt.
      // If Main chat is genuinely empty, the empty-state hint shows it
      // honestly — its history is never invented and it is never hidden.
      if (typeof mainEntry.updatedAt === 'number' && mainEntry.updatedAt > 0) chatUpdatedAt['main'] = mainEntry.updatedAt;
      setSidebarChatTime('main', mainEntry.updatedAt);
      updateEmptyChatHint();
    }
    // DISCORD SECTION (2026-11-05): render the Discord section from the same
    // restored snapshot (server or localStorage fallback). Only a valid
    // snapshot re-renders it, so an empty/failed load never wipes it.
    renderDiscordSection(saved.chats);
    updateEmptyChatHint();
  }
  // --- Server-side chat store (CHATSTORE): PC files are the source of truth.
  // localStorage stays as fallback when the server is unreachable. First load
  // migrates localStorage chats to the server. Main chat is never deleted.
  let serverChatTimer = null;
  let serverChatLastSnapshot = null;
  const serverChatLastSent = {};
  const serverChatDeletedSent = new Set();
  function serverChatFetch(path, options, timeoutMs) {
    const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, timeoutMs || 5000) : null;
    const opts = Object.assign({}, options || {});
    if (ctrl) opts.signal = ctrl.signal;
    return fetch(path, opts).finally(() => { if (timer) clearTimeout(timer); });
  }
  function serverChatSyncNow() {
    const snap = serverChatLastSnapshot;
    if (!snap || !Array.isArray(snap.chats)) return;
    snap.chats.forEach(entry => {
      try {
        if (!entry || !entry.id || isChatDeleted(entry.id)) return;
        const body = JSON.stringify({ id: entry.id, title: entry.title || 'New chat', html: entry.html || '', history: Array.isArray(entry.history) ? entry.history : [], kind: entry.kind, colorIndex: entry.colorIndex, providerId: entry.providerId, chatModel: entry.chatModel, customChatModel: entry.customChatModel, browser: entry.browser, counter: snap.counter, agentCounter: snap.agentCounter });
        if (serverChatLastSent[entry.id] === body) return;
        serverChatLastSent[entry.id] = body;
        fetch('/api/chats/' + encodeURIComponent(entry.id), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(() => {});
      } catch (e) {}
    });
    deletedChatIds.forEach(id => {
      if (serverChatDeletedSent.has(id)) return;
      serverChatDeletedSent.add(id);
      fetch('/api/chats/' + encodeURIComponent(id), { method: 'DELETE', keepalive: true }).catch(() => {
        fetch('/api/chats/' + encodeURIComponent(id) + '/delete', { method: 'POST', keepalive: true }).catch(() => {});
      });
    });
  }
  function queueServerChatSync(chats, counter, agentCounter) {
    serverChatLastSnapshot = { chats: chats, counter: counter, agentCounter: agentCounter };
    if (serverChatTimer) clearTimeout(serverChatTimer);
    serverChatTimer = setTimeout(() => { serverChatTimer = null; serverChatSyncNow(); }, 800);
  }
  function flushServerChatSync() {
    if (serverChatTimer) { clearTimeout(serverChatTimer); serverChatTimer = null; }
    try { serverChatSyncNow(); } catch (e) {}
  }
  // PERSISTENCE (2026-11-05): load chat bodies in parallel with a longer
  // timeout, so one slow chat on a busy PC cannot starve the whole list.
  async function fetchServerChats() {
    const listRes = await serverChatFetch('/api/chats', {}, 8000);
    if (!listRes.ok) return null;
    const list = await listRes.json();
    // TOMBSTONE (2026-11-05): the server returns its deleted-chat list; keep
    // it (and persist it) so a deleted chat is never re-synced or rendered.
    if (list && Array.isArray(list.deleted)) {
      list.deleted.forEach(id => { if (typeof id === 'string' && id) serverDeletedChatIds.add(id); });
      saveDeletedTombstone();
    }
    if (!list || !list.ok || !Array.isArray(list.chats) || !list.chats.length) return null;
    const bodies = await Promise.allSettled(list.chats.map(item => (async () => {
      const r = await serverChatFetch('/api/chats/' + encodeURIComponent(item.id), {}, 8000);
      if (!r.ok) return null;
      const d = await r.json();
      return (d && d.ok && d.chat) ? d.chat : null;
    })()));
    const entries = bodies.map(b => (b.status === 'fulfilled' ? b.value : null)).filter(Boolean);
    if (!entries.length) return null;
    return { version: 1, counter: (typeof list.counter === 'number' ? list.counter : 0), agentCounter: (typeof list.agentCounter === 'number' ? list.agentCounter : 0), chats: entries };
  }
  // PERSISTENCE (2026-11-05): retry a failed server load once before falling
  // back to localStorage, and merge any local-only chats into the server
  // result so a server list never drops them. An empty server list falls
  // through to the localStorage fallback below, which re-syncs local chats
  // back to the server — an empty server response never deletes local chats.
  async function restoreChatsFromServer() {
    let serverSaved = null;
    try { serverSaved = await fetchServerChats(); } catch (e) { serverSaved = null; }
    if (!serverSaved) {
      try { await new Promise(r => setTimeout(r, 1500)); serverSaved = await fetchServerChats(); } catch (e) { serverSaved = null; }
    }
    if (serverSaved) {
      try {
        const local = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || 'null');
        if (local && Array.isArray(local.chats) && local.chats.length) {
          const have = new Set(serverSaved.chats.map(c => c.id));
          const missing = local.chats.filter(e => e && e.id && !have.has(e.id) && !isChatDeleted(e.id));
          if (missing.length) {
            serverSaved.chats = serverSaved.chats.concat(missing);
            try { queueServerChatSync(serverSaved.chats, serverSaved.counter, serverSaved.agentCounter); } catch (e2) {}
          }
        }
      } catch (e) {}
      // TOMBSTONE (2026-11-05): drop any deleted chat from the snapshot and
      // purge it from localStorage, so it can never come back on reload.
      serverSaved.chats = serverSaved.chats.filter(e => e && e.id && !isChatDeleted(e.id));
      purgeDeletedFromLocalStorage();
      restoreChats(serverSaved);
      return;
    }
    purgeDeletedFromLocalStorage();
    restoreChats();
    try { persistChats(); } catch (e) {}
  }
  // LIVE SIDEBAR (2026-11-05): poll the server for new chats (for example a
  // Discord mirror chat created by the PC poller) and add them to the sidebar
  // the moment they appear — no reload needed. A failed or empty poll changes
  // nothing (same rule as the v2.40 persistence fix). The open chat's visible
  // stream is only replaced when the server has strictly newer messages and
  // no agent run is in progress for that chat; the message input is a
  // separate element and is never touched, and scroll position is preserved.
  let livePollRunning = false;
  let livePollTimer = null;
  function liveHistoryIsPrefix(shorter, longer) {
    if (!Array.isArray(shorter) || !Array.isArray(longer) || shorter.length > longer.length) return false;
    for (let i = 0; i < shorter.length; i++) {
      const a = shorter[i] || {}, b = longer[i] || {};
      if ((a.role || '') !== (b.role || '') || String(a.content || '') !== String(b.content || '')) return false;
    }
    return true;
  }
  async function pollServerChatsLive() {
    if (livePollRunning) return;
    if (document.hidden) return;
    livePollRunning = true;
    try {
      const snapshot = await fetchServerChats();
      if (!snapshot || !Array.isArray(snapshot.chats) || !snapshot.chats.length) return;
      if (typeof snapshot.counter === 'number' && snapshot.counter > sideChatCounter) sideChatCounter = snapshot.counter;
      if (typeof snapshot.agentCounter === 'number' && snapshot.agentCounter > agentCounter) agentCounter = snapshot.agentCounter;
      snapshot.chats.forEach(entry => {
        try {
          if (!entry || !entry.id || entry.id === 'main') return;
          if (isChatDeleted(entry.id)) return;
          const serverHtml = cleanChatHtml(entry.html || '');
          const serverHistory = Array.isArray(entry.history) ? entry.history : [];
          if (entry.kind === 'agent') {
            if (!userAgents[entry.id]) {
              userAgents[entry.id] = { id: entry.id, name: entry.title || 'user agent', colorIndex: entry.colorIndex || 0, providerId: entry.providerId || '', chatModel: entry.chatModel || '', customChatModel: entry.customChatModel || '', browser: entry.browser || null };
              if (typeof entry.colorIndex === 'number' && entry.colorIndex > agentCounter) agentCounter = entry.colorIndex;
            }
            createUserAgentRow(userAgents[entry.id]);
            chatStore[entry.id] = serverHtml;
            chatHistories[entry.id] = serverHistory;
            return;
          }
          // DISCORD SECTION (2026-11-05): Discord chats render in the
          // Discord section below; the general list skips them.
          if (!isDiscordChatId(entry.id)) {
            const existing = sideChatsContainer.querySelector('[data-chat-id="' + entry.id + '"]');
            if (!existing) {
              createSidebarItem(entry.id, entry.title || 'New chat', entry.updatedAt);
            } else {
              const label = existing.querySelector('.chat-item-text');
              if (label && entry.title && label.textContent !== entry.title) label.textContent = entry.title;
              // TIMESTAMPS (2026-11-05, v2.45): keep the row time fresh.
              setSidebarChatTime(entry.id, entry.updatedAt);
            }
          }
          // TIMESTAMPS (2026-11-05, v2.45): keep every chat's last-update
          // time fresh (the Discord section reads it from this map).
          if (typeof entry.updatedAt === 'number' && entry.updatedAt > 0) chatUpdatedAt[entry.id] = entry.updatedAt;
          // Keep the stored copy fresh so a later click opens the latest
          // messages. Only re-render the open chat's visible stream when the
          // server is strictly ahead (local history is a prefix of it) and
          // nothing is streaming in that chat right now.
          const localHistory = chatHistories[entry.id] || [];
          const serverAhead = serverHistory.length > localHistory.length && liveHistoryIsPrefix(localHistory, serverHistory);
          chatStore[entry.id] = serverHtml;
          chatHistories[entry.id] = serverHistory;
          if (entry.id === currentChatId && serverAhead && chatStream && !isPipelineRunning(entry.id) && !thinkingBlock) {
            const atBottom = chatScroll ? (chatScroll.scrollHeight - chatScroll.scrollTop - chatScroll.clientHeight) < 80 : true;
            const prevTop = chatScroll ? chatScroll.scrollTop : 0;
            chatStream.innerHTML = serverHtml;
            demoteDeadLocalLinks(chatStream);
            migrateRawMarkdownCards(chatStream);
            rebindThinkingToggles();
            if (chatScroll) chatScroll.scrollTop = atBottom ? chatScroll.scrollHeight : prevTop;
          }
        } catch (err) {}
      });
      // DISCORD SECTION (2026-11-05): refresh the Discord section + header
      // from this poll so a new Discord message shows up live, no reload.
      renderDiscordSection(snapshot.chats);
      updateDiscordChatHeader();
    } catch (e) {
      // A failed poll changes nothing; the next poll retries.
    } finally {
      livePollRunning = false;
    }
  }
  function startLiveChatPolling() {
    if (livePollTimer) return;
    livePollTimer = setInterval(() => { try { pollServerChatsLive(); } catch (e) {} }, 5000);
    pollServerChatsLive();
  }
  // FLOATING TOP BAR (v1.0.6): quick prompts sent from the bar window.
  // This poll runs even when the window is minimized (document.hidden),
  // unlike pollServerChatsLive - the bar is only useful while minimized.
  // A prompt taken here runs through the normal agent loop via
  // sendChatMessage (same provider/model/key/memory as the main app),
  // then the outcome is reported to /api/quick-prompt/done so the bar
  // shows the REAL state and main.js shows a Notification. Approvals
  // are NOT bypassed: if the run needs approval, the approval card
  // appears in the main app and the bar reports "Needs your input".
  let quickPromptPollTimer = null;
  let quickPromptPollRunning = false;
  let quickPromptActive = null; // id of the quick prompt being run, or null
  async function pollQuickPrompt() {
    if (quickPromptPollRunning || quickPromptActive) return;
    quickPromptPollRunning = true;
    try {
      const r = await fetch('/api/quick-prompt/next');
      const j = await r.json();
      if (j && j.ok && j.prompt && j.prompt.text) {
        quickPromptActive = j.prompt.id;
        handleQuickPrompt(j.prompt.id, j.prompt.text);
      }
    } catch (e) {}
    quickPromptPollRunning = false;
  }
  function startQuickPromptPolling() {
    if (quickPromptPollTimer) return;
    quickPromptPollTimer = setInterval(() => { try { pollQuickPrompt(); } catch (e) {} }, 2000);
    pollQuickPrompt();
  }
  async function handleQuickPrompt(qid, text) {
    const runChatId = currentChatId;
    try {
      await sendChatMessage(text);
    } catch (e) {}
    // Determine the outcome from the run state. sendChatMessage resolves
    // at a terminal state: done, waiting (approval/plan card shown), or
    // an error reply. A run that produced no assistant reply (e.g. no
    // API key yet) is an error - the user opens the app to see it.
    let status = 'done', preview = '';
    try {
      const pipe = chatPipelines[runChatId];
      if (pipe && pipe.stage === 'waiting') {
        status = 'waiting';
      } else {
        const hist = chatHistories[runChatId] || [];
        let lastAsst = null;
        for (let i = hist.length - 1; i >= 0; i--) {
          if (hist[i] && hist[i].role === 'assistant') { lastAsst = hist[i].content || ''; break; }
        }
        if (lastAsst) {
          if (/^Model error:/.test(String(lastAsst))) status = 'error';
          else { status = 'done'; preview = String(lastAsst).replace(/\s+/g, ' ').trim().slice(0, 120); }
        } else {
          status = 'error';
        }
      }
    } catch (e) { status = 'done'; }
    try {
      await fetch('/api/quick-prompt/done', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: qid, status: status, text: preview })
      });
    } catch (e) {}
    if (quickPromptActive === qid) quickPromptActive = null;
  }
  window.addEventListener('beforeunload', () => { persistChats(); flushServerChatSync(); });
  window.addEventListener('pagehide', () => { persistChats(); flushServerChatSync(); });
  function makeChatTitle(msg) {
    const one = (msg || '').replace(/\s+/g, ' ').trim();
    if (one.length <= 34) return one;
    let cut = one.slice(0, 34);
    const sp = cut.lastIndexOf(' ');
    if (sp > 12) cut = cut.slice(0, sp);
    return cut + '…';
  }
  function autoTitleCurrentChat(msg) {
    if (!msg || currentChatId === 'main') return;
    const btn = sideChatsContainer.querySelector('[data-chat-id="' + currentChatId + '"]');
    const label = btn ? btn.querySelector('.chat-item-text') : null;
    if (!label) return;
    if (/^New chat( \d+)?$/.test(label.textContent.trim())) {
      label.textContent = makeChatTitle(msg);
      persistChats();
    }
  }

  // --- Avatar Video State Machine (taskActive: true / false) ---
  const idleVideo = document.getElementById('avatarVideoIdle');
  const workVideo = document.getElementById('avatarVideoWorking');
  const topMiniVideo = document.getElementById('topMiniAvatarVideo');
  const statusLabel = document.querySelector('.status-label');
  const statusDot = document.querySelector('.status-green-dot');

  let taskActive = false;

  function setTaskActive(active, statusType) {
    taskActive = active;

    // Trigger Lottie Mascot Trio multi-state lifecycle
    if (window.set3DCatsThinkingState) {
      window.set3DCatsThinkingState(active, statusType);
    }

    if (active) {
      if (idleVideo) {
        idleVideo.pause();
        idleVideo.classList.add('is-hidden');
      }
      if (workVideo) {
        workVideo.classList.remove('is-hidden');
        workVideo.currentTime = 0;
        workVideo.play().catch(() => {});
      }

      if (topMiniVideo) {
        topMiniVideo.src = '/avatars/redcat-avatar-working.mp4';
        topMiniVideo.currentTime = 0;
        topMiniVideo.play().catch(() => {});
      }

      if (statusLabel) statusLabel.textContent = 'Working...';
      if (statusDot) statusDot.style.backgroundColor = '#eab308';
    } else {
      if (workVideo) {
        workVideo.pause();
        workVideo.classList.add('is-hidden');
      }
      if (idleVideo) {
        idleVideo.classList.remove('is-hidden');
        idleVideo.currentTime = 0;
        idleVideo.play().catch(() => {});
      }

      if (topMiniVideo) {
        topMiniVideo.src = '/avatars/redcat-avatar-idle.mp4';
        topMiniVideo.currentTime = 0;
        topMiniVideo.play().catch(() => {});
      }

      if (statusLabel) statusLabel.textContent = 'Connected';
      if (statusDot) statusDot.style.backgroundColor = 'var(--green-connected)';
    }
  }

  // Ensure idle video starts looping on page load and disable Picture-in-Picture
  [idleVideo, workVideo, topMiniVideo].forEach(v => {
    if (v) {
      v.disablePictureInPicture = true;
      v.addEventListener('contextmenu', e => e.preventDefault());
    }
  });

  if (idleVideo) {
    idleVideo.play().catch(() => {});
  }

  // --- Per-chat message store (new chats open blank) ---
  const chatStore = {};
  const chatHistories = {};
  const chatPipelines = {};
  let currentChatId = 'main';
  if (chatStream) chatStore['main'] = chatStream.innerHTML;
  // VIDEO LOADING CARD (v2.48): real progress — the fetch below is the
  // actual startup load (server chats). When it resolves the home page is
  // ready, so the card hides. No timer, no fake delay.
  setCodeLoadingProgress(25, 'Connecting to server');
  restoreChatsFromServer().then(() => { try { loadInterruptedRuns(); } catch (e) {} try { startLiveChatPolling(); } catch (e) {} try { startQuickPromptPolling(); } catch (e) {} hideCodeLoading(); }).catch(() => { hideCodeLoading(); });

  function switchChat(chatId) {
    if (!chatStream || !chatId || chatId === currentChatId) return;
    chatStore[currentChatId] = cleanChatHtml(chatStream.innerHTML);
    if (thinkingBlock) {
      thinkingTimers.forEach(clearTimeout);
      thinkingTimers = [];
      thinkingBlock = null;
    }
    currentChatId = chatId;
    updateDiscordChatHeader();
    chatStream.innerHTML = chatStore[chatId] || '';
    demoteDeadLocalLinks(chatStream);
    migrateRawMarkdownCards(chatStream);
    const st = chatThinking[chatId];
    const activeBlock = chatStream.querySelector('.thinking-block:not(.thinking-done)');
    if (activeBlock && st) {
      thinkingBlock = activeBlock;
      thinkingStart = st.start;
      thinkingChatId = chatId;
      thinkingTimers = [];
      const linesEl = activeBlock.querySelector('.thinking-lines');
      const remaining = (st.lines || []).slice(st.revealed || 0);
      remaining.forEach((line, i) => {
        thinkingTimers.push(setTimeout(() => {
          if (!thinkingBlock) return;
          const p = document.createElement('p');
          p.className = 'thinking-line';
          p.textContent = line;
          if (linesEl) linesEl.appendChild(p);
          const s2 = chatThinking[chatId];
          if (s2) s2.revealed++;
          scrollToBottom();
        }, 900 * (i + 1)));
      });
      const w = activeBlock.querySelector('.thinking-cat-working');
      if (w) w.play().catch(() => {});
      initThinkingLottie(activeBlock);
    }
    rebindThinkingToggles();
    wireChatConnectButtons(chatStream);
    mcpWireButtons();
    refreshChatConnectStates();
    scrollToBottom();
    updateStopButton();
    refreshRightPanelForChat();
    updateEmptyChatHint();
    persistChats();
    try { checkDueSchedules(chatId); } catch (e) {}
  }

  // --- Chat Messaging Engine ---
  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = chatInput.value.trim();
    const hasAtt = pendingAttachments.length > 0;
    if (!msg && !hasAtt) return;
    const curPipe = chatPipelines[currentChatId];
    if (curPipe && isPipelineRunning(currentChatId) && !curPipe.isTaskAgent) return;
    autoTitleCurrentChat(msg || 'Attachments');
    const isSlashMsg = msg.startsWith('/');
    if (!isSlashMsg && hasAtt) {
      // Attachments fully upload FIRST, then the message is sent.
      setAttachUploading(true);
      const uploaded = await uploadPendingAttachments();
      setAttachUploading(false);
      if (!uploaded) { attachNote('Upload failed — files are still attached, try sending again.'); return; }
      appendUserMessage(msg, uploaded);
      chatInput.value = '';
      clearPendingAttachments();
      sendChatMessage(msg, uploaded);
    } else {
      appendUserMessage(msg);
      chatInput.value = '';
      sendChatMessage(msg);
    }
  });

  // --- Scheduled tasks pickup (DSH-style delivery, client side) ---
  // The server owns the schedule record; this client picks due items up and
  // runs them through the normal agent path. Old servers 404 here - silent.
  const scheduleSeenIds = new Set();
  async function checkDueSchedules(chatId) {
    if (!chatId || isPipelineRunning(chatId)) return;
    let data = null;
    try {
      const res = await fetch('/api/schedules/due?chatId=' + encodeURIComponent(chatId));
      if (!res.ok) return;
      data = await res.json();
    } catch (e) { return; }
    const due = (data && Array.isArray(data.due)) ? data.due : [];
    if (!due.length) return;
    const item = due[0];
    if (chatId !== currentChatId) return;
    if (isPipelineRunning(chatId)) return;
    if (scheduleSeenIds.has(item.id)) return;
    scheduleSeenIds.add(item.id);
    const bubble = document.createElement('div');
    bubble.className = 'user-message-card scheduled-user-message';
    const tag = document.createElement('span');
    tag.className = 'scheduled-tag';
    tag.textContent = 'Scheduled: ' + item.title;
    bubble.appendChild(tag);
    const txt = document.createElement('span');
    txt.textContent = item.prompt;
    bubble.appendChild(txt);
    chatStream.appendChild(bubble);
    scrollToBottom();
    sendChatMessage(item.prompt);
    try { await fetch('/api/schedules/ack', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id }) }); } catch (e) {}
  }
  setInterval(() => { try { checkDueSchedules(currentChatId); } catch (e) {} }, 30000);
  setTimeout(() => { try { checkDueSchedules(currentChatId); } catch (e) {} }, 2000);

  function appendUserMessage(text, uploaded) {
    const userBubble = document.createElement('div');
    userBubble.className = 'user-message-card';
    if (text) { const t = document.createElement('div'); t.textContent = text; userBubble.appendChild(t); }
    if (uploaded && uploaded.length) { const wrap = document.createElement('div'); wrap.className = 'user-attach-wrap'; wrap.innerHTML = renderSentAttachCards(uploaded); userBubble.appendChild(wrap); }
    // TIMESTAMPS (2026-11-05, v2.45): small real time on the message (local
    // PC time, when it was sent). Old messages without a stored time show none.
    const timeEl = msgTimeSpan(Date.now());
    if (timeEl) userBubble.appendChild(timeEl);
    chatStream.appendChild(userBubble);
    scrollToBottom();
    setSidebarChatTime(currentChatId, Date.now());
    updateEmptyChatHint();
  }

  function escapeHtml(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function linkifyHtml(html) {
    return (html || '').replace(/https?:\/\/[^\s<"']+/g, (m) => {
      let url = m;
      let tail = '';
      while (url.length && '.,;:!?)]}'.indexOf(url[url.length - 1]) !== -1) { tail = url[url.length - 1] + tail; url = url.slice(0, -1); }
      if (!url) return m;
      return '<a href="' + url + '" target="_blank" rel="noopener">' + url + '</a>' + tail;
    });
  }
  // Markdown -> HTML for real agent replies. This was the missing piece:
  // the decided response style's CSS already styles h1-h6, strong, em,
  // code, pre, tables, blockquotes and lists, but no code ever converted
  // model markdown into those elements — real replies showed raw ###, **
  // and ` marks. The demo answer looked right only because its HTML was
  // hand-written. Safe by construction: the whole text is HTML-escaped
  // FIRST, then only this function's own tags are added. Code spans and
  // fenced blocks are stashed as placeholders before any other rule runs,
  // so markdown inside code is never converted and URLs inside code are
  // never linkified. An unclosed marker stays literal (this is what makes
  // mid-stream rendering safe: the text converts the moment its closing
  // marker arrives).
  function renderMarkdown(src) {
    const tokens = [];
    const stash = (html) => {
      tokens.push(html);
      return '\u0000' + (tokens.length - 1) + '\u0000';
    };
    let text = escapeHtml(src || '');
    text = text.replace(/```[a-zA-Z0-9_-]*\n?([\s\S]*?)```/g, (m, code) => {
      return stash('<pre><code>' + code.replace(/\n$/, '') + '</code></pre>');
    });
    text = text.replace(/`([^`\n]+)`/g, (m, code) => stash('<code>' + code + '</code>'));
    text = text.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, label, url) => {
      const inner = label
        .replace(/(^|[\s(])\*\*([^*]+)\*\*(?=[\s).,;:!?]|$)/g, '$1<strong>$2</strong>')
        .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
      return stash('<a href="' + url + '">' + inner + '</a>');
    });
    text = linkifyHtml(text);
    text = text.replace(/(^|[\s(])\*\*([^*]+)\*\*(?=[\s).,;:!?]|$)/g, '$1<strong>$2</strong>');
    text = text.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
    text = text.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
    const lines = text.split('\n');
    const out = [];
    const preToken = (line) => {
      const m = line.match(/^\u0000(\d+)\u0000$/);
      return m && tokens[+m[1]] && tokens[+m[1]].indexOf('<pre>') === 0;
    };
    const isTableSep = (line) => {
      const cells = line.split('|').map(c => c.trim()).filter(c => c !== '');
      return cells.length > 0 && cells.every(c => /^:?-{3,}:?$/.test(c));
    };
    const splitRow = (line) => {
      let cells = line.split('|').map(c => c.trim());
      if (cells.length && cells[0] === '') cells = cells.slice(1);
      if (cells.length && cells[cells.length - 1] === '') cells = cells.slice(0, -1);
      return cells;
    };
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed === '') { i++; continue; }
      if (preToken(trimmed)) { out.push(trimmed); i++; continue; }
      const h = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (h) { out.push('<h' + h[1].length + '>' + h[2] + '</h' + h[1].length + '>'); i++; continue; }
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) { out.push('<hr>'); i++; continue; }
      if (trimmed.indexOf('&gt;') === 0) {
        const quotes = [];
        while (i < lines.length && lines[i].trim().indexOf('&gt;') === 0) {
          quotes.push(lines[i].trim().replace(/^&gt;\s?/, ''));
          i++;
        }
        out.push('<blockquote><p>' + quotes.join('<br>') + '</p></blockquote>');
        continue;
      }
      if (trimmed.indexOf('|') !== -1 && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        const head = splitRow(trimmed);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].indexOf('|') !== -1 && lines[i].trim() !== '') {
          rows.push(splitRow(lines[i].trim()));
          i++;
        }
        let tbl = '<table><thead><tr>' + head.map(c => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>';
        rows.forEach((r) => {
          tbl += '<tr>' + head.map((_, k) => '<td>' + (r[k] || '') + '</td>').join('') + '</tr>';
        });
        tbl += '</tbody></table>';
        out.push(tbl);
        continue;
      }
      const ul = trimmed.match(/^[-*+]\s+(.*)$/);
      const ol = trimmed.match(/^\d+[.)]\s+(.*)$/);
      if (ul || ol) {
        const tag = ul ? 'ul' : 'ol';
        const items = [];
        while (i < lines.length) {
          const t = lines[i].trim();
          const m = ul ? t.match(/^[-*+]\s+(.*)$/) : t.match(/^\d+[.)]\s+(.*)$/);
          if (!m) break;
          items.push(m[1]);
          i++;
        }
        out.push('<' + tag + '>' + items.map(it => '<li>' + it + '</li>').join('') + '</' + tag + '>');
        continue;
      }
      const para = [];
      while (i < lines.length) {
        const t = lines[i];
        const tr = t.trim();
        if (tr === '' || preToken(tr) || /^(#{1,6})\s+/.test(tr) || /^(-{3,}|\*{3,}|_{3,})$/.test(tr) || tr.indexOf('&gt;') === 0) break;
        if (tr.indexOf('|') !== -1 && i + 1 < lines.length && isTableSep(lines[i + 1])) break;
        if (/^[-*+]\s+/.test(tr) || /^\d+[.)]\s+/.test(tr)) break;
        para.push(t);
        i++;
      }
      out.push('<p>' + para.join('<br>') + '</p>');
    }
    return out.join('').replace(/\u0000(\d+)\u0000/g, (m, n) => tokens[+n] || '');
  }
  // One-time repair for messages saved before the markdown renderer
  // existed: a plain card whose content is only escaped text + <br> +
  // plain links (no real HTML elements) is re-rendered from its original
  // text, so old messages also display correctly after refresh. Cards
  // that already contain real HTML (tables, code, headings, chips) are
  // left untouched, and link chips are rebuilt from their hrefs, so no
  // link is lost. Runs on restore and on every chat switch; the repaired
  // HTML persists on the next save.
  function migrateRawMarkdownCards(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('.agent-message-card').forEach((card) => {
      if (!isPlainAssistantCard(card)) return;
      const content = card.querySelector('.message-text-content');
      if (!content) return;
      if (content.querySelector('.stream-cursor')) return;
      if (content.querySelector('table, pre, h1, h2, h3, h4, h5, h6, ul, ol, strong, em, code, blockquote')) return;
      const clone = content.cloneNode(true);
      clone.querySelectorAll('a[href]').forEach((a) => {
        const href = a.getAttribute('href') || '';
        let md = href;
        if (a.classList.contains('rc-link-chip')) {
          const nameEl = a.querySelector('.rc-link-name');
          const name = (nameEl ? nameEl.textContent : a.textContent || '').trim().replace(/\u2197$/, '').trim();
          md = (name && name !== href) ? '[' + name + '](' + href + ')' : href;
        } else {
          const t = (a.textContent || '').trim();
          md = (t && t !== href) ? '[' + t + '](' + href + ')' : href;
        }
        a.replaceWith(document.createTextNode(md));
      });
      clone.querySelectorAll('br').forEach((br) => br.replaceWith(document.createTextNode('\n')));
      const raw = clone.textContent || '';
      const hasMd = /(^|\n)\s*#{1,6}\s/.test(raw) || /\*\*[^*]+\*\*/.test(raw) || /`[^`\n]+`/.test(raw)
        || /(^|\n)\s*[-*+]\s/.test(raw) || /(^|\n)\s*\d+[.)]\s/.test(raw)
        || /\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)/.test(raw) || /(^|\n)\s*>\s/.test(raw);
      if (!hasMd) return;
      content.innerHTML = renderMarkdown(raw);
      decorateLinks(card);
    });
  }
  // Linkify dead-link guard: a link to a locally built output (/sites/ or
  // /videos/) is only real if the server actually has that file. After an
  // agent message renders, each same-origin link (except /api/) is
  // HEAD-checked; a link that 404s (or fails to load) is demoted to its
  // plain text — the text is never deleted. Every other link (external
  // http/https, other local paths) is left exactly as-is, with no request.
  function demoteDeadLocalLinks(root) {
    if (!root || !root.querySelectorAll) return;
    const links = root.querySelectorAll('a[href]');
    links.forEach((a) => {
      let u = null;
      try { u = new URL(a.getAttribute('href'), window.location.href); } catch (e) { return; }
      if (u.origin !== window.location.origin) return;
      if (u.pathname.startsWith('/api/')) return;
      fetch(u.href, { method: 'HEAD' }).then((res) => {
        if (!res.ok && a.isConnected) {
          a.replaceWith(document.createTextNode(a.textContent));
        }
      }).catch(() => {
        if (a.isConnected) {
          a.replaceWith(document.createTextNode(a.textContent));
        }
      });
    });
  }
  function buildStreamCardHtml(words, withCursor, cardId, ts) {
    const body = renderMarkdown(words.join(' '));
    const finalBody = body;
    // TIMESTAMPS (2026-11-05, v2.45): the small real time is added only when
    // the stream finishes (withCursor false), never while it is still
    // streaming. Old cards without a stored time show no time at all.
    return '<article class="agent-message-card" id="' + cardId + '"><div class="message-text-content">' + finalBody + (withCursor ? '<span class="stream-cursor">▍</span>' : '') + '</div>' + (withCursor ? '' : msgTimeHtml(ts)) + '</article>';
  }
  // --- In-chat Connect buttons (Addition 9) ---
  // The model emits [CONNECT:<kind>:<id>] marker lines (see inventory.js);
  // this renderer turns each into a real button running the SAME flow as the
  // Connectors page. Markers are stripped from displayed text and from the
  // stored history. Unknown ids render nothing; tier-2 MCP ids render a
  // Setup note, never a fake Connect button. Connector/social buttons open
  // the same authorize dialogs as the Connectors page (token paste there).
  const CHAT_CONNECT_RE = /\[CONNECT:(mcp|connector|social):([a-z0-9-]+)\]/g;
  function stripConnectMarkers(t) {
    return String(t || '').replace(CHAT_CONNECT_RE, '').replace(/\n{3,}/g, '\n\n').trim();
  }
  function parseConnectActions(t) {
    const out = [];
    const seen = new Set();
    let m;
    CHAT_CONNECT_RE.lastIndex = 0;
    while ((m = CHAT_CONNECT_RE.exec(String(t || ''))) !== null) {
      const k = m[1] + ':' + m[2];
      if (!seen.has(k)) { seen.add(k); out.push({ kind: m[1], id: m[2] }); }
    }
    return out;
  }
  function chatEsc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function chatConnectRowHtml(a, servers) {
    if (a.kind === 'mcp') {
      const s = (servers || []).find(function (x) { return x.id === a.id; });
      if (!s) return '';
      if (s.connected) {
        return '<div class="chat-connect-row" data-chat-mcp="' + chatEsc(s.id) + '"><span class="chat-connect-name">' + chatEsc(s.name) + '</span><button type="button" class="connector-action-btn connect-deep-red" data-mcp-disconnect="' + chatEsc(s.id) + '">Disconnect</button><span class="chat-connect-done">Connected ✓</span></div>';
      }
      if (s.tier !== 1) {
        return '<div class="chat-connect-row" data-chat-mcp="' + chatEsc(s.id) + '"><span class="chat-connect-name">' + chatEsc(s.name) + '</span><span class="chat-connect-note">Setup required — open its section on the Connectors page and follow the Setup steps.</span></div>';
      }
      return '<div class="chat-connect-row" data-chat-mcp="' + chatEsc(s.id) + '"><span class="chat-connect-name">' + chatEsc(s.name) + '</span><button type="button" class="connector-action-btn connect-deep-red" data-mcp-connect="' + chatEsc(s.id) + '">Connect</button></div>';
    }
    if (a.kind === 'connector') {
      const item = availableList.concat(connectedList).find(function (x) { return x.id === a.id; });
      if (!item) return '';
      if (loadConnectorTokens()[a.id]) {
        return '<div class="chat-connect-row" data-chat-connector="' + chatEsc(a.id) + '"><span class="chat-connect-name">' + chatEsc(item.name) + '</span><span class="chat-connect-done">Connected ✓</span></div>';
      }
      return '<div class="chat-connect-row" data-chat-connector="' + chatEsc(a.id) + '"><span class="chat-connect-name">' + chatEsc(item.name) + '</span><button type="button" class="connector-action-btn connect-deep-red" data-chat-connect="connector:' + chatEsc(a.id) + '">Connect</button></div>';
    }
    if (a.kind === 'social') {
      const item = socialList.find(function (x) { return x.id === a.id; });
      if (!item) return '';
      const srv = serverSocialStatus[a.id] || {};
      if (loadSocialTokens()[a.id] || srv.connected) {
        return '<div class="chat-connect-row" data-chat-social="' + chatEsc(a.id) + '"><span class="chat-connect-name">' + chatEsc(item.name) + '</span><span class="chat-connect-done">Connected ✓</span></div>';
      }
      return '<div class="chat-connect-row" data-chat-social="' + chatEsc(a.id) + '"><span class="chat-connect-name">' + chatEsc(item.name) + '</span><button type="button" class="connector-action-btn connect-deep-red" data-chat-connect="social:' + chatEsc(a.id) + '">Connect</button></div>';
    }
    return '';
  }
  function chatConnectWrapHtml(actions, servers) {
    const rows = actions.map(function (a) { return chatConnectRowHtml(a, servers); }).filter(Boolean).join('');
    if (!rows) return '';
    return '<div class="chat-connect-wrap">' + rows + '</div>';
  }
  async function fetchMcpCatalogServers() {
    try {
      const r = await fetch('/api/mcp/catalog');
      const d = await r.json();
      return (d && d.servers) || [];
    } catch (e) { return window.__mcpServers || []; }
  }
  async function renderChatConnectActions(cardEl, actions) {
    if (!actions.length || !cardEl) return;
    const servers = await fetchMcpCatalogServers();
    const html = chatConnectWrapHtml(actions, servers);
    if (!html) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const wrap = tmp.firstElementChild;
    if (wrap) {
      if (cardEl.after) cardEl.after(wrap);
      else if (cardEl.parentNode) cardEl.parentNode.appendChild(wrap);
      wireChatConnectButtons(wrap);
      mcpWireButtons();
    }
  }
  async function renderChatConnectActionsToStore(targetId, actions) {
    if (!actions.length) return;
    const servers = await fetchMcpCatalogServers();
    const html = chatConnectWrapHtml(actions, servers);
    if (!html) return;
    chatStore[targetId] = (chatStore[targetId] || '') + html;
    if (targetId === currentChatId && chatStream) {
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      const wrap = tmp.firstElementChild;
      if (wrap) { chatStream.appendChild(wrap); wireChatConnectButtons(wrap); mcpWireButtons(); }
    }
    persistChats();
  }
  const chatWiredBtns = new WeakSet();
  function wireChatConnectButtons(root) {
    if (!root) return;
    root.querySelectorAll('[data-chat-connect]').forEach(function (btn) {
      if (chatWiredBtns.has(btn)) return;
      chatWiredBtns.add(btn);
      btn.addEventListener('click', function () {
        const v = btn.getAttribute('data-chat-connect') || '';
        const parts = v.split(':');
        if (parts[0] === 'connector') {
          const item = availableList.concat(connectedList).find(function (x) { return x.id === parts[1]; });
          if (item) openConnectorAuthModal(item);
        } else if (parts[0] === 'social') {
          const item = socialList.find(function (x) { return x.id === parts[1]; });
          if (item) openSocialAuthModal(item);
        }
      });
    });
  }
  function syncChatConnectButtons(id, connected) {
    document.querySelectorAll('.chat-connect-row[data-chat-mcp="' + id + '"]').forEach(function (row) {
      const oldBtn = row.querySelector('[data-mcp-connect="' + id + '"], [data-mcp-disconnect="' + id + '"]');
      if (connected) {
        if (oldBtn) {
          const nb = document.createElement('button');
          nb.type = 'button'; nb.className = 'connector-action-btn connect-deep-red';
          nb.setAttribute('data-mcp-disconnect', id); nb.textContent = 'Disconnect';
          oldBtn.replaceWith(nb);
        }
        if (!row.querySelector('.chat-connect-done')) {
          const s = document.createElement('span'); s.className = 'chat-connect-done'; s.textContent = 'Connected ✓';
          row.appendChild(s);
        }
      } else {
        if (oldBtn) {
          const nb = document.createElement('button');
          nb.type = 'button'; nb.className = 'connector-action-btn connect-deep-red';
          nb.setAttribute('data-mcp-connect', id); nb.textContent = 'Connect';
          oldBtn.replaceWith(nb);
        }
        const done = row.querySelector('.chat-connect-done');
        if (done) done.remove();
      }
      mcpWireButtons();
    });
  }
  function refreshChatTokenRow(row, isConnected, kind, id) {
    const btn = row.querySelector('[data-chat-connect]');
    if (isConnected && btn) {
      const s = document.createElement('span'); s.className = 'chat-connect-done'; s.textContent = 'Connected ✓';
      btn.replaceWith(s);
    } else if (!isConnected && !btn && !row.querySelector('.chat-connect-note')) {
      const done = row.querySelector('.chat-connect-done');
      if (done) done.remove();
      const nb = document.createElement('button');
      nb.type = 'button'; nb.className = 'connector-action-btn connect-deep-red';
      nb.setAttribute('data-chat-connect', kind + ':' + id); nb.textContent = 'Connect';
      row.appendChild(nb);
      wireChatConnectButtons(row);
    }
  }
  async function refreshChatConnectStates() {
    try {
      const r = await fetch('/api/mcp/status');
      const d = await r.json();
      if (d && d.servers) {
        Object.keys(d.servers).forEach(function (id) {
          if (document.querySelector('.chat-connect-row[data-chat-mcp="' + id + '"]')) {
            syncChatConnectButtons(id, !!d.servers[id].connected);
          }
        });
      }
    } catch (e) {}
    try {
      const ct = loadConnectorTokens();
      const st = loadSocialTokens();
      document.querySelectorAll('.chat-connect-row[data-chat-connector]').forEach(function (row) {
        const id = row.getAttribute('data-chat-connector');
        refreshChatTokenRow(row, !!ct[id], 'connector', id);
      });
      document.querySelectorAll('.chat-connect-row[data-chat-social]').forEach(function (row) {
        const id = row.getAttribute('data-chat-social');
        const srv = serverSocialStatus[id] || {};
        refreshChatTokenRow(row, !!(st[id] || srv.connected), 'social', id);
      });
    } catch (e) {}
  }

  function appendAgentMessage(text, targetId, pipeline) {
    markActivity(targetId, 'Done');
    targetId = targetId || currentChatId;
    const chatActions = parseConnectActions(text);
    text = stripConnectMarkers(text);
    const words = (text || '').split(' ');
    const cardId = 'stream-card-' + String(targetId).replace(/[^a-zA-Z0-9_-]/g, '') + '-' + Date.now();
    const state = {
      targetId: targetId,
      words: words,
      wi: 0,
      cardId: cardId,
      done: false,
      timer: null,
      // TIMESTAMPS (2026-11-05, v2.45): real time this reply started arriving
      // (local PC time). Shown on the finished card, never invented.
      ts: Date.now(),
      base: (targetId === currentChatId) ? chatStream.innerHTML : (chatStore[targetId] || '')
    };
    if (pipeline) { pipeline.stream = state; pipeline.stage = 'streaming'; updateStopButton(); }
    if (targetId === currentChatId) {
      const card = document.createElement('article');
      card.className = 'agent-message-card';
      card.id = cardId;
      const content = document.createElement('div');
      content.className = 'message-text-content';
      card.appendChild(content);
      chatStream.appendChild(card);
    }
    const stepMs = Math.max(12, Math.min(32, Math.round(1800 / Math.max(1, words.length))));
    const timer = setInterval(() => {
      if (state.done) { clearInterval(timer); return; }
      if (pipeline && pipeline.stopped) { clearInterval(timer); return; }
      if (state.wi >= words.length) {
        clearInterval(timer);
        state.done = true;
        if (targetId === currentChatId) {
          const liveCard = document.getElementById(cardId);
          if (liveCard) {
            const cont = liveCard.querySelector('.message-text-content');
            if (cont) cont.innerHTML = renderMarkdown(words.join(' '));
            demoteDeadLocalLinks(cont);
            if (liveCard) decorateLinks(liveCard);
            // TIMESTAMPS (2026-11-05, v2.45): small real time on the finished reply.
            const timeEl = msgTimeSpan(state.ts);
            if (timeEl) liveCard.appendChild(timeEl);
          }
          scrollToBottom();
        } else {
          chatStore[targetId] = state.base + buildStreamCardHtml(words, false, cardId, state.ts);
        }
        if (chatActions.length) {
          if (targetId === currentChatId) {
            const liveCard2 = document.getElementById(cardId);
            if (liveCard2) renderChatConnectActions(liveCard2, chatActions);
          } else {
            renderChatConnectActionsToStore(targetId, chatActions);
          }
        }
        if (pipeline) { pipeline.stream = null; pipeline.stage = 'done'; }
        if (!anyPipelineRunning(targetId)) setTaskActive(false, 'happy');
        updateStopButton();
        // TIMESTAMPS (2026-11-05, v2.45): the reply just finished — the
        // chat's last-activity time is now.
        setSidebarChatTime(targetId, Date.now());
        persistChats();
        return;
      }
      const shown = words.slice(0, state.wi + 1);
      if (targetId === currentChatId) {
        let liveCard = document.getElementById(cardId);
        if (!liveCard) {
          liveCard = document.createElement('article');
          liveCard.className = 'agent-message-card';
          liveCard.id = cardId;
          const content = document.createElement('div');
          content.className = 'message-text-content';
          liveCard.appendChild(content);
          chatStream.appendChild(liveCard);
        }
        const cont = liveCard.querySelector('.message-text-content');
        if (cont) cont.innerHTML = renderMarkdown(shown.join(' ')) + '<span class="stream-cursor">▍</span>';
        scrollToBottom();
      } else {
        chatStore[targetId] = state.base + buildStreamCardHtml(shown, true, cardId);
      }
      state.wi++;
    }, stepMs);
    state.timer = timer;
  }

  function scrollToBottom() {
    chatScroll.scrollTop = chatScroll.scrollHeight;
  }

  // --- Thinking display (Claude-style DEMO: dummy reasoning lines,
  // real elapsed time; demo holds min ~4s so the state is visible) ---
  let thinkingBlock = null;
  let thinkingStart = 0;
  let thinkingTimers = [];
  let thinkingChatId = null;
  const chatThinking = {};
  // Live elapsed counter: while a run thinks, the header ticks real seconds
  // (Date.now() minus the real thinking start), so the display never shows a
  // stale or fixed number. Collapsed headers already use the same real elapsed.
  setInterval(() => {
    if (!thinkingBlock) return;
    const el = thinkingBlock.querySelector('.thinking-elapsed');
    if (!el) return;
    el.textContent = Math.max(0, Math.round((Date.now() - thinkingStart) / 1000)) + 's';
  }, 1000);

  // Language detection (mirrors RedCat backend detect_lang: Arabic script ->
  // urdu, Roman Urdu wordlist -> roman_urdu, else en). Default = English.
  // Thinking is ALWAYS English; replies follow the detected language.
  // DEMO note: thinking steps are rule-based until a real model is wired (key).
  function detectLang(message) {
    const msg = (message || '');
    if (/[\u0600-\u06FF]/.test(msg)) return 'urdu';
    const lower = msg.toLowerCase();
    const clean = lower.replace(/[^a-z\s]/g, ' ');
    const padded = ' ' + clean + ' ';
    const romanWords = ['salam', 'assalam', 'walaikum', 'banao', 'banado', 'banake', 'banane', 'karke', 'mujhe', 'chahiye', 'batao', 'karo', 'karna', 'kar', 'kaisa', 'kaisi', 'kab', 'kahan', 'kyun', 'kaun', 'kitna', 'kitni', 'mera', 'tumhara', 'aapka', 'iska', 'uska', 'hamara', 'tum', 'aap', 'kya', 'kaise', 'hai', 'hain', 'tha', 'thi', 'hoga', 'ye', 'wo', 'yeh', 'woh', 'ab', 'bhi', 'nahi', 'dekho', 'bhejo', 'ke', 'ki', 'ka', 'ko', 'se', 'mein', 'par', 'phir', 'acha', 'theek', 'zaroor', 'bas', 'sirf', 'liye', 'wala', 'wali', 'bahut', 'bohot', 'aaj', 'kal', 'abhi', 'raha', 'rahi', 'rahe', 'hua', 'hui'];
    const distinctive = romanWords;
    let hits = 0;
    let hasDistinctive = false;
    romanWords.forEach(w => {
      if (padded.includes(' ' + w + ' ')) {
        hits++;
        if (distinctive.includes(w)) hasDistinctive = true;
      }
    });
    if (hasDistinctive || hits >= 2) return 'roman_urdu';
    return 'en';
  }

  function buildThinkingLines(message) {
    const msg = (message || '').trim();
    const short = msg.length > 60 ? msg.slice(0, 60) + '…' : msg;
    return [`"${short}" — read your request, now working on it…`];
  }

  function showThinking(message) {
    if (!chatStream) return;
    if (thinkingBlock) collapseThinking();
    const thinkingLang = detectLang(message);
    const thinkingLangLabel = thinkingLang === 'roman_urdu' ? 'Roman Urdu' : thinkingLang === 'urdu' ? 'Urdu' : 'English';
    thinkingStart = Date.now();
    thinkingChatId = currentChatId;
    const showId = currentChatId;
    thinkingBlock = document.createElement('div');
    thinkingBlock.className = 'thinking-block';
    thinkingBlock.innerHTML = `
      <div class="thinking-cat"><div class="thinking-cat-lottie"></div></div>
      <div class="thinking-main"><div class="thinking-header"><span class="thinking-label">Thinking</span><span class="thinking-dots"><span>.</span><span>.</span><span>.</span></span><span class="thinking-elapsed" style="opacity:.7;margin-left:6px">0s</span><span class="thinking-lang">Detected: ${thinkingLangLabel}</span><button class="thinking-steps-toggle" type="button" title="Show live steps" aria-expanded="false">▾</button></div>
      <div class="thinking-lines"></div>
      <div class="thinking-steps is-hidden"><div class="live-step live-step-empty">No live steps yet.</div></div>
      <div class="thinking-detail is-hidden"></div></div>`;
    chatStream.appendChild(thinkingBlock);
    bindThinkingStepsToggle(thinkingBlock);
    initThinkingLottie(thinkingBlock);
    scrollToBottom();
    const lines = buildThinkingLines(message);
    chatThinking[showId] = { start: thinkingStart, lines: lines, revealed: 0 };
    const linesEl = thinkingBlock.querySelector('.thinking-lines');
    lines.forEach((line, i) => {
      thinkingTimers.push(setTimeout(() => {
        if (!thinkingBlock) return;
        const p = document.createElement('p');
        p.className = 'thinking-line';
        p.textContent = line;
        linesEl.appendChild(p);
        const s = chatThinking[showId];
        if (s) s.revealed++;
        scrollToBottom();
      }, 900 * (i + 1)));
    });
  }

  // --- Live steps mini-terminal inside the thinking block ---
  // Fed by the SAME real progress stream as the activity rows (no fake steps):
  // each progress event is one tool call from the running agent loop.
  function liveStepText(evt) {
    const label = String((evt && evt.label) || (evt && evt.tool) || 'Step');
    const detail = String((evt && evt.detail) || '');
    const text = detail ? label + ' ' + detail : label;
    return text.slice(0, 160);
  }

  function liveStepRowHtml(text, state) {
    const icon = state === 'running' ? '●' : state === 'failed' ? '✗' : state === 'stopped' ? '■' : '✅';
    return '<div class="live-step"><span class="live-step-icon live-step-' + state + '">' + icon + '</span><span class="live-step-text">' + escapeHtml(text) + '</span></div>';
  }

  function bindThinkingStepsToggle(block) {
    if (!block) return;
    const btn = block.querySelector('.thinking-steps-toggle');
    const steps = block.querySelector('.thinking-steps');
    if (!btn || !steps || btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      const hidden = steps.classList.toggle('is-hidden');
      btn.textContent = hidden ? '▾' : '▴';
      btn.setAttribute('aria-expanded', String(!hidden));
    });
  }

  // Thinking avatar: small plain red-cat lottie (laptop-working mascot), NOT the
  // old circular videos. Plays only while thinking; stops when the run finishes.
  function initThinkingLottie(block) {
    if (!block || block._thinkingLottie) return;
    const el = block.querySelector('.thinking-cat-lottie');
    if (!el || !window.lottie) return;
    el.innerHTML = '';
    try {
      const anim = window._redCatAnimData
        ? window.lottie.loadAnimation({ container: el, animationData: window._redCatAnimData, renderer: 'svg', loop: true, autoplay: true })
        : window.lottie.loadAnimation({ container: el, path: '/lottie-animations/red-cat.json', renderer: 'svg', loop: true, autoplay: true });
      block._thinkingLottie = anim;
    } catch (e) {}
  }

  function stopThinkingLottie(block) {
    const anim = block ? block._thinkingLottie : null;
    if (anim) {
      try { anim.stop(); } catch (e) {}
    }
  }

  function applyLiveStepToBlock(block, evt) {
    const stepsEl = block ? block.querySelector('.thinking-steps') : null;
    if (!stepsEl) return false;
    const empty = stepsEl.querySelector('.live-step-empty');
    if (empty) empty.remove();
    const linesEl = block.querySelector('.thinking-lines');
    if (linesEl && !block.dataset.liveStepsStarted) {
      linesEl.innerHTML = '';
      block.dataset.liveStepsStarted = '1';
      if (block === thinkingBlock) {
        thinkingTimers.forEach(clearTimeout);
        thinkingTimers = [];
      }
    }
    const prev = stepsEl.querySelector('.live-step-icon.live-step-running');
    if (prev) {
      prev.classList.remove('live-step-running');
      prev.classList.add('live-step-done');
      prev.textContent = '✅';
    }
    const oldThought = stepsEl.querySelector('.live-step-thought');
    if (oldThought) oldThought.remove();
    stepsEl.insertAdjacentHTML('beforeend', liveStepRowHtml(liveStepText(evt), 'running'));
    const thought = evt && evt.thought ? String(evt.thought).trim().slice(0, 200) : '';
    if (thought) {
      const d = document.createElement('div');
      d.className = 'live-step-thought';
      d.textContent = thought;
      stepsEl.appendChild(d);
    }
    if (!stepsEl.classList.contains('is-hidden')) stepsEl.scrollTop = stepsEl.scrollHeight;
    return true;
  }

  function appendLiveStep(chatId, evt) {
    if (!evt || (evt.type && evt.type !== 'progress')) return;
    if (chatId === currentChatId && thinkingBlock && thinkingChatId === chatId) {
      if (applyLiveStepToBlock(thinkingBlock, evt)) scrollToBottom();
      return;
    }
    const snap = chatStore[chatId];
    if (snap) {
      const tmp = document.createElement('div');
      tmp.innerHTML = snap;
      const block = tmp.querySelector('.thinking-block:not(.thinking-done)');
      if (block) {
        let stepsEl = block.querySelector('.thinking-steps');
        if (!stepsEl) {
          stepsEl = document.createElement('div');
          stepsEl.className = 'thinking-steps is-hidden';
          const linesEl = block.querySelector('.thinking-lines');
          if (linesEl && linesEl.parentNode) linesEl.parentNode.insertBefore(stepsEl, linesEl.nextSibling);
          else block.appendChild(stepsEl);
        }
        applyLiveStepToBlock(block, evt);
        chatStore[chatId] = tmp.innerHTML;
      }
    }
  }

  function finalizeLiveSteps(chatId, state) {
    const flip = (root) => {
      const icons = root.querySelectorAll('.live-step-icon.live-step-running');
      icons.forEach((icon, i) => {
        const last = i === icons.length - 1;
        icon.classList.remove('live-step-running');
        if (state === 'failed' && last) {
          icon.classList.add('live-step-failed');
          icon.textContent = '✗';
        } else if (state === 'stopped' && last) {
          icon.classList.add('live-step-stopped');
          icon.textContent = '■';
        } else {
          icon.classList.add('live-step-done');
          icon.textContent = '✅';
        }
      });
    };
    if (chatId === currentChatId && thinkingBlock && thinkingChatId === chatId) {
      flip(thinkingBlock);
      return;
    }
    const snap = chatStore[chatId];
    if (snap) {
      const tmp = document.createElement('div');
      tmp.innerHTML = snap;
      const block = tmp.querySelector('.thinking-block:not(.thinking-done)');
      if (block) {
        flip(block);
        chatStore[chatId] = tmp.innerHTML;
      }
    }
  }

  function collapseThinkingEl(block, secs) {
    const header = block.querySelector('.thinking-header');
    const detail = block.querySelector('.thinking-detail');
    const linesEl = block.querySelector('.thinking-lines');
    if (!header || !detail || !linesEl) return false;
    const stepsEl = block.querySelector('.thinking-steps');
    let stepsHtml = '';
    if (stepsEl) {
      stepsEl.classList.remove('is-hidden');
      stepsHtml = stepsEl.outerHTML;
      stepsEl.remove();
    }
    detail.innerHTML = stepsHtml + linesEl.innerHTML;
    linesEl.remove();
    header.innerHTML = `<button class="thinking-toggle" type="button">Thought for ${secs} second${secs === 1 ? '' : 's'} \u25B8</button>`;
    const toggleBtn = header.querySelector('.thinking-toggle');
    toggleBtn.textContent = `Thought for ${secs} second${secs === 1 ? '' : 's'} ▾`;
    toggleBtn.addEventListener('click', () => {
      const hidden = detail.classList.toggle('is-hidden');
      toggleBtn.textContent = `Thought for ${secs} second${secs === 1 ? '' : 's'} ${hidden ? '▾' : '▴'}`;
    });
    block.classList.add('thinking-done');
    const catWorkingEl = block.querySelector('.thinking-cat-working');
    const catIdleEl = block.querySelector('.thinking-cat-idle');
    if (catWorkingEl && catIdleEl) {
      catWorkingEl.pause();
      catWorkingEl.classList.add('is-hidden');
      catIdleEl.classList.remove('is-hidden');
      catIdleEl.play().catch(() => {});
    }
    stopThinkingLottie(block);
    return true;
  }

  function collapseThinking() {
    if (!thinkingBlock) return;
    thinkingTimers.forEach(clearTimeout);
    thinkingTimers = [];
    const secs = Math.max(1, Math.round((Date.now() - thinkingStart) / 1000));
    const doneId = thinkingChatId;
    collapseThinkingEl(thinkingBlock, secs);
    thinkingBlock = null;
    if (doneId) delete chatThinking[doneId];
    scrollToBottom();
  }

  function thinkingLineHtml(thought) {
    const p = document.createElement('p');
    p.className = 'thinking-line';
    p.textContent = thought;
    return p.outerHTML;
  }

  function setThinkingThought(chatId, thought) {
    if (!thought) return;
    const lineHtml = thinkingLineHtml(thought);
    if (chatId === currentChatId && thinkingBlock && thinkingChatId === chatId) {
      thinkingTimers.forEach(clearTimeout);
      thinkingTimers = [];
      const linesEl = thinkingBlock.querySelector('.thinking-lines');
      if (linesEl) linesEl.innerHTML = lineHtml;
      chatThinking[chatId] = { start: thinkingStart, lines: [thought], revealed: 1 };
    } else {
      const snap = chatStore[chatId];
      if (snap) {
        const tmp = document.createElement('div');
        tmp.innerHTML = snap;
        const block = tmp.querySelector('.thinking-block:not(.thinking-done)');
        if (block) {
          const linesEl = block.querySelector('.thinking-lines');
          if (linesEl) linesEl.innerHTML = lineHtml;
          chatStore[chatId] = tmp.innerHTML;
        }
        const s = chatThinking[chatId];
        if (s) { s.lines = [thought]; s.revealed = 1; }
      }
    }
  }

  function finishWithReply(replyText, sendChatId, pipeline, minMs, realThought) {
    const waitMs = (typeof minMs === 'number') ? minMs : 4000;
    const st0 = chatThinking[sendChatId];
    const startFor = (st0 && st0.start) || thinkingStart;
    const elapsed = Date.now() - startFor;
    const wait = Math.max(0, waitMs - elapsed);
    const timer = setTimeout(() => {
      if (pipeline && pipeline.stopped) return;
      finalizeLiveSteps(sendChatId, 'done');
      finalizeBuildingCard(sendChatId, 'done');
      setThinkingThought(sendChatId, realThought || '');
      if (sendChatId === currentChatId) {
        if (thinkingBlock && thinkingChatId === sendChatId) collapseThinking();
      } else {
        const snap = chatStore[sendChatId];
        if (snap) {
          const tmp = document.createElement('div');
          tmp.innerHTML = snap;
          const block = tmp.querySelector('.thinking-block:not(.thinking-done)');
          if (block) {
            const s2 = chatThinking[sendChatId];
            const secs = Math.max(1, Math.round((Date.now() - ((s2 && s2.start) || thinkingStart)) / 1000));
            if (collapseThinkingEl(block, secs)) {
              chatStore[sendChatId] = tmp.innerHTML;
              if (s2) delete chatThinking[sendChatId];
            }
          }
        }
      }
      triggerAgentReply(replyText, sendChatId, pipeline);
    }, wait);
    if (pipeline) pipeline.finishTimer = timer;
  }

  function triggerAgentReply(text, targetId, pipeline) {
    const timer = setTimeout(() => {
      if (pipeline && pipeline.stopped) return;
      appendAgentMessage(text, targetId, pipeline);
    }, 450);
    if (pipeline) pipeline.triggerTimer = timer;
  }

  // --- Per-chat pipelines + stop button (Round 11) ---
  function isPipelineRunning(chatId) {
    const p = chatPipelines[chatId];
    return !!(p && (p.stage === 'thinking' || p.stage === 'streaming' || p.stage === 'waiting'));
  }
  function anyPipelineRunning(exceptId) {
    return Object.keys(chatPipelines).some(id => id !== exceptId && isPipelineRunning(id));
  }
  function updateStopButton() {
    const curPipe = chatPipelines[currentChatId];
    if (curPipe && curPipe.isTaskAgent) {
      if (btnSend) btnSend.style.display = '';
      if (btnStopResponse) btnStopResponse.style.display = 'none';
      return;
    }
    const running = isPipelineRunning(currentChatId);
    if (btnSend) btnSend.style.display = running ? 'none' : '';
    if (btnStopResponse) btnStopResponse.style.display = running ? 'flex' : 'none';
  }
  function stopCurrentResponse() {
    const id = currentChatId;
    const p = chatPipelines[id];
    if (!p || !isPipelineRunning(id)) return;
    p.stopped = true;
    try { if (p.abort) p.abort.abort(); } catch (e) {}
    if (p.finishTimer) { clearTimeout(p.finishTimer); p.finishTimer = null; }
    if (p.triggerTimer) { clearTimeout(p.triggerTimer); p.triggerTimer = null; }
    if (p.stream && p.stream.timer) {
      clearInterval(p.stream.timer);
      const st = p.stream;
      const partial = st.words.slice(0, st.wi).join(' ');
      const liveCard = document.getElementById(st.cardId);
      if (liveCard) {
        const cont = liveCard.querySelector('.message-text-content');
        if (cont) cont.innerHTML = st.words.slice(0, st.wi).map(w => w.split('\n').map(escapeHtml).join('<br>')).join(' ');
      }
      const h = chatHistories[id];
      if (h && h.length && h[h.length - 1].role === 'assistant') {
        if (partial.trim()) h[h.length - 1].content = partial;
        else h.pop();
      }
      p.stream = null;
    }
    if (thinkingBlock && thinkingChatId === id) collapseThinking();
    p.stage = 'stopped';
    if (!anyPipelineRunning(id)) setTaskActive(false);
    updateStopButton();
    chatStream.querySelectorAll('.agent-approval-card, .agent-plan-card').forEach(c => c.remove());
    if (p.agentRunId) {
      const runIdToCancel = p.agentRunId;
      p.agentRunId = null;
      fetch('/api/agent-cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId: runIdToCancel }) }).catch(() => {});
    }
    const note = document.createElement('div');
    note.className = 'chat-stop-note';
    note.textContent = 'You stopped this response.';
    chatStream.appendChild(note);
    scrollToBottom();
    persistChats();
  }
  if (btnStopResponse) btnStopResponse.addEventListener('click', stopCurrentResponse);

  function buildAgentApprovalCard(runId, approval) {
    const card = document.createElement('article');
    card.className = 'agent-message-card agent-approval-card';
    card.setAttribute('data-agent-run', runId);
    const content = document.createElement('div');
    content.className = 'message-text-content';
    const title = document.createElement('p');
    // SMART-MODEL (2026-11-05): a model switch asks to change the model for this task only.
    title.textContent = approval.tool === 'model_switch' ? 'Switch model for this task?' : 'Permission needed - run this terminal command?';
    const cmd = document.createElement('pre');
    cmd.className = 'agent-approval-cmd';
    cmd.textContent = approval.command || '';
    content.appendChild(title);
    content.appendChild(cmd);
    if (approval.cwd) {
      const cwdEl = document.createElement('p');
      cwdEl.className = 'agent-approval-cwd';
      cwdEl.textContent = 'Folder: ' + approval.cwd;
      content.appendChild(cwdEl);
    }
    const reasonInput = document.createElement('input');
    reasonInput.type = 'text';
    reasonInput.className = 'agent-deny-reason';
    reasonInput.placeholder = 'Reason for denying (optional)';
    content.appendChild(reasonInput);
    const row = document.createElement('div');
    row.className = 'agent-approval-row';
    const yes = document.createElement('button');
    yes.type = 'button';
    yes.className = 'agent-approve-btn';
    yes.setAttribute('data-agent-approve', runId);
    if (approval.tool === 'model_switch' && approval.provider && approval.model) {
      yes.setAttribute('data-model-switch-provider', approval.provider);
      yes.setAttribute('data-model-switch-model', approval.model);
    }
    yes.textContent = 'Approve';
    const no = document.createElement('button');
    no.type = 'button';
    no.className = 'agent-deny-btn';
    no.setAttribute('data-agent-deny', runId);
    no.textContent = 'Deny';
    row.appendChild(yes);
    row.appendChild(no);
    content.appendChild(row);
    card.appendChild(content);
    return card;
  }

  function renderAgentApproval(runId, approval) {
    markActivity(currentChatId, 'Paused \u2014 waiting for approval');
    chatStream.appendChild(buildAgentApprovalCard(runId, approval));
    scrollToBottom();
  }

  function buildAgentPlanCard(runId, plan) {
    const card = document.createElement('article');
    card.className = 'agent-message-card agent-plan-card';
    card.setAttribute('data-agent-run', runId);
    const content = document.createElement('div');
    content.className = 'message-text-content';
    const title = document.createElement('p');
    title.textContent = 'Plan' + (plan.goal ? ' - ' + plan.goal : '') + ' - start it?';
    const list = document.createElement('ol');
    list.className = 'agent-plan-steps';
    (plan.steps || []).forEach(s => {
      const li = document.createElement('li');
      li.textContent = s;
      list.appendChild(li);
    });
    content.appendChild(title);
    content.appendChild(list);
    if (plan.facts_needed && plan.facts_needed.length) {
      const facts = document.createElement('p');
      facts.className = 'agent-approval-cwd';
      facts.textContent = 'Facts to verify first: ' + plan.facts_needed.join('; ');
      content.appendChild(facts);
    }
    const row = document.createElement('div');
    row.className = 'agent-approval-row';
    const yes = document.createElement('button');
    yes.type = 'button';
    yes.className = 'agent-approve-btn';
    yes.setAttribute('data-agent-plan-start', runId);
    yes.textContent = 'Start';
    const no = document.createElement('button');
    no.type = 'button';
    no.className = 'agent-deny-btn';
    no.setAttribute('data-agent-plan-deny', runId);
    no.textContent = 'Cancel';
    row.appendChild(yes);
    row.appendChild(no);
    content.appendChild(row);
    card.appendChild(content);
    return card;
  }

  function renderAgentPlanCard(runId, plan) {
    markActivity(currentChatId, 'Paused \u2014 waiting for plan');
    chatStream.appendChild(buildAgentPlanCard(runId, plan));
    scrollToBottom();
  }

  function currentChatCredentials() {
    const r = resolveChatModel(currentChatId);
    return { provider: r.provider.id, model: r.model, key: r.key, policy: getApprovalPolicy() };
  }

  function buildAgentResumeCard(r) {
    const card = document.createElement('article');
    card.className = 'agent-message-card agent-resume-card';
    card.setAttribute('data-agent-run', r.id);
    const content = document.createElement('div');
    content.className = 'message-text-content';
    const title = document.createElement('p');
    title.textContent = 'Unfinished work — resume from here?';
    const task = document.createElement('p');
    task.className = 'agent-resume-task';
    task.textContent = (r.task || 'previous work') + ' (Step ' + (r.step || 0) + ')';
    content.appendChild(title);
    content.appendChild(task);
    const row = document.createElement('div');
    row.className = 'agent-approval-row';
    const yes = document.createElement('button');
    yes.type = 'button';
    yes.className = 'agent-approve-btn';
    yes.setAttribute('data-agent-resume', r.id);
    yes.setAttribute('data-run-provider', r.provider || '');
    yes.setAttribute('data-run-model', r.model || '');
    yes.textContent = 'Resume';
    const no = document.createElement('button');
    no.type = 'button';
    no.className = 'agent-deny-btn';
    no.setAttribute('data-agent-resume-dismiss', r.id);
    no.textContent = 'Dismiss';
    row.appendChild(yes);
    row.appendChild(no);
    content.appendChild(row);
    card.appendChild(content);
    return card;
  }

  function renderAgentResumeCard(r) {
    chatStream.appendChild(buildAgentResumeCard(r));
    scrollToBottom();
  }

  async function loadInterruptedRuns() {
    try {
      const res = await fetch('/api/agent-runs');
      const data = await res.json();
      if (!data || !data.ok || !Array.isArray(data.runs)) return;
      data.runs.filter(r => r.status === 'interrupted').forEach(r => {
        if (!r.id) return;
        if (document.querySelector('[data-agent-resume="' + r.id + '"]')) return;
        if (r.chatId === currentChatId) {
          renderAgentResumeCard(r);
        } else if (r.chatId && chatStore[r.chatId] !== undefined) {
          if (chatStore[r.chatId].indexOf('data-agent-resume="' + r.id + '"') !== -1) return;
          const wrap = document.createElement('div');
          wrap.appendChild(buildAgentResumeCard(r));
          chatStore[r.chatId] += wrap.innerHTML;
          persistChats();
        }
      });
    } catch (e) {}
  }

  document.addEventListener('click', async (e) => {
    if (!e.target.closest) return;
    const resumeBtn = e.target.closest('[data-agent-resume]');
    const resumeDismissBtn = !resumeBtn ? e.target.closest('[data-agent-resume-dismiss]') : null;
    if (resumeBtn || resumeDismissBtn) {
      const btn = resumeBtn || resumeDismissBtn;
      const runId = btn.getAttribute('data-agent-resume') || btn.getAttribute('data-agent-resume-dismiss') || '';
      const card = document.querySelector('[data-agent-run="' + runId + '"]');
      if (card) card.remove();
      if (resumeDismissBtn) {
        fetch('/api/agent-cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId: runId }) }).catch(() => {});
        return;
      }
      const runProvider = btn.getAttribute('data-run-provider') || '';
      const runModel = btn.getAttribute('data-run-model') || '';
      const provider = aiProviders.find(p => p.id === runProvider) || aiProviders[0];
      const rec = getProviderRecord(provider.id);
      const key = (rec.key || '').trim();
      let model = runModel || '';
      if (!model) {
        if (rec.chatModel && rec.chatModel !== 'Custom (type manually)') model = rec.chatModel;
        else if (rec.customChatModel && rec.customChatModel.trim()) model = rec.customChatModel.trim();
        else model = (provider.models || []).find(m => m !== 'Custom (type manually)') || '';
      }
      const p = { stage: 'thinking', abort: new AbortController(), stream: null, finishTimer: null, triggerTimer: null, stopped: false, agentRunId: runId };
      chatPipelines[currentChatId] = p;
      showThinking('Resuming previous work…');
      updateStopButton();
      if (provider.needsKey !== false && !key) {
        collapseThinking();
        setTaskActive(false);
        p.stage = 'stopped';
        updateStopButton();
        finishWithReply('Add your ' + provider.name + ' API key in Settings → AI Models first, then press Resume again.', currentChatId, p);
        return;
      }
      startActivity(currentChatId);
      try {
        const res = await fetch('/api/agent-resume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: p.abort.signal,
          body: JSON.stringify({ runId: runId, provider: provider.id, model: model, key: key })
        });
        const data = await readAgentStream(res, evt => { appendActivityRow(currentChatId, evt); appendLiveStep(currentChatId, evt); handleBuildingProgress(currentChatId, evt); });
        if (p.stopped) { markActivity(currentChatId, 'Stopped'); finalizeLiveSteps(currentChatId, 'stopped'); finalizeBuildingCard(currentChatId, 'stopped'); return; }
        if (!data) {
          finishWithReply('The server needs a restart to continue this agent run: press Ctrl+C in the server window, then run node server.js, and try again.', currentChatId, p);
          return;
        }
        if (data.ok && data.status === 'done' && data.text) {
          if (!chatHistories[currentChatId]) chatHistories[currentChatId] = [];
          chatHistories[currentChatId].push({ role: 'assistant', content: data.text, ts: Date.now() });
          finishWithReply(data.text, currentChatId, p, undefined, data.thought || '');
        } else if (data.ok && data.status === 'need_approval' && data.runId && data.approval) {
          p.agentRunId = data.runId; p.stage = 'waiting';
          updateStopButton();
          setThinkingThought(currentChatId, data.thought || '');
          renderAgentApproval(data.runId, data.approval);
        } else if (data.ok && data.status === 'plan' && data.runId && data.plan) {
          p.agentRunId = data.runId; p.stage = 'waiting';
          updateStopButton();
          setThinkingThought(currentChatId, data.thought || '');
          renderAgentPlanCard(data.runId, data.plan);
        } else {
          finishWithReply('Model error: ' + (data.error || 'Model call failed.'), currentChatId, p);
        }
      } catch (err) {
        if (p.stopped) { markActivity(currentChatId, 'Stopped'); finalizeLiveSteps(currentChatId, 'stopped'); finalizeBuildingCard(currentChatId, 'stopped'); return; }
        finishWithReply('The RedCat server is not responding. Start it with node server.js in the project folder, then try again.', currentChatId, p);
      }
      return;
    }
    const planStartBtn = e.target.closest('[data-agent-plan-start]');
    const planDenyBtn = !planStartBtn ? e.target.closest('[data-agent-plan-deny]') : null;
    if (planStartBtn || planDenyBtn) {
      const btn = planStartBtn || planDenyBtn;
      const runId = btn.getAttribute('data-agent-plan-start') || btn.getAttribute('data-agent-plan-deny') || '';
      const approved = !!planStartBtn;
      const card = document.querySelector('[data-agent-run="' + runId + '"]');
      if (card) card.remove();
      const p = chatPipelines[currentChatId];
      if (p) p.agentRunId = null;
      if (!chatHistories[currentChatId]) chatHistories[currentChatId] = [];
      startActivity(currentChatId);
      try {
        const res = await fetch('/api/agent-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.assign({ runId: runId, approved: approved }, currentChatCredentials()))
        });
        const data = await readAgentStream(res, evt => { appendActivityRow(currentChatId, evt); appendLiveStep(currentChatId, evt); handleBuildingProgress(currentChatId, evt); });
        if (!data) {
          finishWithReply('The server needs a restart to continue this agent run: press Ctrl+C in the server window, then run node server.js, and try again.', currentChatId, p);
          return;
        }
        if (data.ok && data.status === 'done' && data.text) {
          chatHistories[currentChatId].push({ role: 'assistant', content: data.text, ts: Date.now() });
          finishWithReply(data.text, currentChatId, p, undefined, data.thought || '');
        } else if (data.ok && data.status === 'need_approval' && data.runId && data.approval) {
          if (p) { p.agentRunId = data.runId; p.stage = 'waiting'; }
          updateStopButton();
          setThinkingThought(currentChatId, data.thought || '');
          renderAgentApproval(data.runId, data.approval);
        } else if (data.ok && data.status === 'plan' && data.runId && data.plan) {
          if (p) { p.agentRunId = data.runId; p.stage = 'waiting'; }
          updateStopButton();
          setThinkingThought(currentChatId, data.thought || '');
          renderAgentPlanCard(data.runId, data.plan);
        } else {
          finishWithReply('Model error: ' + (data.error || 'Model call failed.'), currentChatId, p);
        }
      } catch (err) {
        finishWithReply('The RedCat server is not responding. Start it with node server.js in the project folder, then try again.', currentChatId, p);
      }
      return;
    }
    const approveBtn = e.target.closest('[data-agent-approve]');
    const denyBtn = !approveBtn ? e.target.closest('[data-agent-deny]') : null;
    if (!approveBtn && !denyBtn) return;
    const btn = approveBtn || denyBtn;
    const runId = btn.getAttribute('data-agent-approve') || btn.getAttribute('data-agent-deny') || '';
    let approved = !!approveBtn;
    const card = document.querySelector('[data-agent-run="' + runId + '"]');
    const denyReasonEl = card ? card.querySelector('.agent-deny-reason') : null;
    let denyReason = denyReasonEl ? denyReasonEl.value.trim().slice(0, 300) : '';
    // SMART-MODEL (2026-11-05): approving a model switch sends the TARGET credentials in the
    // decide body (the server applies them to this run only — Settings are not changed).
    // If the target key is missing, fall back to a denial so the run continues on the
    // current model instead of stalling.
    let decideCredentials = currentChatCredentials();
    if (approved && approveBtn && approveBtn.getAttribute('data-model-switch-provider')) {
      const targetProvider = approveBtn.getAttribute('data-model-switch-provider') || '';
      const targetModel = approveBtn.getAttribute('data-model-switch-model') || '';
      const targetRec = getProviderRecord(targetProvider);
      const targetKey = (targetRec.key || '').trim();
      const targetProviderDef = aiProviders.find(pp => pp.id === targetProvider);
      if (targetProviderDef && targetProviderDef.needsKey && !targetKey) {
        approved = false;
        denyReason = 'No saved key for ' + (targetProviderDef.name || targetProvider) + ' — add it in Settings first.';
      } else {
        decideCredentials = { provider: targetProvider, model: targetModel, key: targetKey, policy: getApprovalPolicy() };
      }
    }
    if (card) card.remove();
    const p = chatPipelines[currentChatId];
    if (p) p.agentRunId = null;
    if (!chatHistories[currentChatId]) chatHistories[currentChatId] = [];
    startActivity(currentChatId);
    try {
      const res = await fetch('/api/agent-decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ runId: runId, approved: approved, reason: denyReason }, decideCredentials))
      });
      const data = await readAgentStream(res, evt => { appendActivityRow(currentChatId, evt); appendLiveStep(currentChatId, evt); handleBuildingProgress(currentChatId, evt); });
      if (!data) {
        finishWithReply('The server needs a restart to continue this agent run: press Ctrl+C in the server window, then run node server.js, and try again.', currentChatId, p);
        return;
      }
      if (data.ok && data.status === 'done' && data.text) {
        chatHistories[currentChatId].push({ role: 'assistant', content: data.text, ts: Date.now() });
        finishWithReply(data.text, currentChatId, p, undefined, data.thought || '');
      } else if (data.ok && data.status === 'need_approval' && data.runId && data.approval) {
        if (p) { p.agentRunId = data.runId; p.stage = 'waiting'; }
        updateStopButton();
        setThinkingThought(currentChatId, data.thought || '');
        renderAgentApproval(data.runId, data.approval);
      } else if (data.ok && data.status === 'plan' && data.runId && data.plan) {
        if (p) { p.agentRunId = data.runId; p.stage = 'waiting'; }
        updateStopButton();
        setThinkingThought(currentChatId, data.thought || '');
        renderAgentPlanCard(data.runId, data.plan);
      } else {
        finishWithReply('Model error: ' + (data.error || 'Model call failed.'), currentChatId, p);
      }
    } catch (err) {
      finishWithReply('The RedCat server is not responding. Start it with node server.js in the project folder, then try again.', currentChatId, p);
    }
  });

  function normalizeSmallTalk(s) {
    return (s || '').toLowerCase().replace(/[.,!؟?;:()"'\u201c\u201d\u2018\u2019\-_]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const SMALL_TALK = {
    greet: ['hi', 'hello', 'hey', 'salam', 'assalam o alaikum', 'assalamu alaikum', 'assalamualaikum', 'salam alaikum', 'aoa', 'good morning', 'good evening', 'good afternoon', 'سلام'],
    haal: ['kya haal hai', 'kya haal', 'kaise ho', 'kaisa hai', 'kaisa ho', 'how are you', 'how r you', 'kya haal chaal hai', 'کیا حال ہے'],
    thanks: ['shukriya', 'thanks', 'thank you', 'bohot shukriya', 'bahut shukriya', 'شکریہ'],
    bye: ['bye', 'allah hafiz', 'khuda hafiz', 'goodbye', 'phir milte hain', 'اللہ حافظ'],
    ok: ['ok', 'okay', 'theek hai', 'theek', 'acha', 'acha theek hai', 'ٹھیک ہے']
  };
  const SMALL_TALK_REPLIES = {
    greet: { en: 'Hey! How can I help you today?', roman_urdu: 'Salam! Main aapki kya madad kar sakta hoon?', urdu: 'سلام! میں آپ کی کیا مدد کر سکتا ہوں؟' },
    haal: { en: "I'm doing great, thanks! What can I do for you?", roman_urdu: 'Main theek hoon, shukriya! Aap batao, kya kaam hai?', urdu: 'میں ٹھیک ہوں، شکریہ! آپ بتائیں، کیا کام ہے؟' },
    thanks: { en: "You're welcome! Anything else you need?", roman_urdu: 'Koi baat nahi! Aur kuch chahiye to batao.', urdu: 'کوئی بات نہیں! اور کچھ چاہیے تو بتائیں۔' },
    bye: { en: 'Bye! Come back anytime.', roman_urdu: 'Allah Hafiz! Phir milte hain.', urdu: 'اللہ حافظ! پھر ملتے ہیں۔' },
    ok: { en: 'Got it!', roman_urdu: 'Theek hai!', urdu: 'ٹھیک ہے!' }
  };
  function getFastReply(message, lang) {
    const norm = normalizeSmallTalk(message);
    if (!norm) return null;
    for (const key of Object.keys(SMALL_TALK)) {
      if (SMALL_TALK[key].indexOf(norm) !== -1) {
        const r = SMALL_TALK_REPLIES[key];
        return r[lang] || r.en;
      }
    }
    return null;
  }

  // --- Live activity panel (Round 21): Claude-style trace of what the agent is doing ---
  // Rows arrive from the server's NDJSON progress stream while the run is in flight.
  // They live in the chat stream, so the existing snapshot save keeps them on chat switches.
  function activityHeaderHtml(stateText) {
    return '<div class="agent-activity-header"><span class="agent-activity-dot"></span><span class="agent-activity-state">' + escapeHtml(stateText) + '</span><span class="agent-activity-title">Live steps</span></div>';
  }
  function startActivity(chatId) {
    if (chatId === currentChatId) {
      let panel = chatStream.querySelector('.agent-activity');
      if (!panel) {
        panel = document.createElement('div');
        panel.className = 'agent-activity';
        panel.innerHTML = activityHeaderHtml('Working') + '<div class="agent-activity-rows"></div>';
        chatStream.appendChild(panel);
      } else {
        const st = panel.querySelector('.agent-activity-state');
        if (st) st.textContent = 'Working';
        panel.classList.remove('agent-activity-done');
      }
      scrollToBottom();
    } else if (chatStore[chatId] !== undefined) {
      chatStore[chatId] += activityHeaderHtml('Working');
    }
  }
  function stepRowHtml(text, active) {
    return '<div class="agent-activity-row"><span class="agent-activity-icon' + (active ? ' agent-activity-active' : '') + '">' + (active ? '\u25cf' : '✅') + '</span><span class="agent-activity-text">' + escapeHtml(text) + '</span></div>';
  }
  function flipLastActiveRowHtml(html) {
    const marker = 'agent-activity-icon agent-activity-active">\u25cf';
    const i = html.lastIndexOf(marker);
    if (i === -1) return html;
    return html.slice(0, i) + 'agent-activity-icon">✅' + html.slice(i + marker.length);
  }
  function appendActivityRow(chatId, evt) {
    const raw = (evt.thought && String(evt.thought).trim()) ? String(evt.thought).trim() : (evt.label || evt.tool || 'Step');
    const row = stepRowHtml(raw.slice(0, 280), true);
    const flipLive = (root) => {
      const prev = root.querySelector('.agent-activity-active');
      if (prev) { prev.classList.remove('agent-activity-active'); prev.textContent = '✅'; }
    };
    if (chatId === currentChatId) {
      const panel = chatStream.querySelector('.agent-activity');
      if (panel) {
        const rows = panel.querySelector('.agent-activity-rows');
        if (rows) { flipLive(rows); rows.insertAdjacentHTML('beforeend', row); scrollToBottom(); return; }
      }
      flipLive(chatStream);
      chatStream.insertAdjacentHTML('beforeend', row);
      scrollToBottom();
    } else if (chatStore[chatId] !== undefined) {
      chatStore[chatId] = flipLastActiveRowHtml(chatStore[chatId]) + row;
    }
  }
  function markActivity(chatId, stateText) {
    const finishing = (stateText === 'Done' || stateText === 'Stopped');
    if (chatId !== currentChatId) {
      if (finishing && chatStore[chatId] !== undefined) chatStore[chatId] = flipLastActiveRowHtml(chatStore[chatId]);
      return;
    }
    const panel = chatStream.querySelector('.agent-activity');
    if (!panel) return;
    if (finishing) {
      const prev = panel.querySelector('.agent-activity-active');
      if (prev) { prev.classList.remove('agent-activity-active'); prev.textContent = '✅'; }
    }
    const st = panel.querySelector('.agent-activity-state');
    if (st) st.textContent = stateText;
    if (stateText === 'Done') panel.classList.add('agent-activity-done');
  }
  // Reads an agent response: NDJSON progress lines from the new server, or one plain
  // JSON object from the old server. Progress lines go to onProgress; the final object
  // (ok/status/error) is returned. Network/abort errors propagate to the caller's catch.
  async function readAgentStream(res, onProgress) {
    if (!res.body || typeof res.body.getReader !== 'function') {
      const raw = await res.text();
      try { return JSON.parse(raw); } catch (e) { return null; }
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let final = null;
    const handleLine = (line) => {
      const t = line.trim();
      if (!t) return;
      let obj = null;
      try { obj = JSON.parse(t); } catch (e) { return; }
      if (obj && obj.type === 'progress') { try { onProgress(obj); } catch (e) {} }
      else if (obj && (obj.ok !== undefined || obj.status || obj.error)) final = obj;
    };
    for (;;) {
      const step = await reader.read();
      if (step.value) buf += decoder.decode(step.value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n')) !== -1) {
        handleLine(buf.slice(0, idx));
        buf = buf.slice(idx + 1);
      }
      if (step.done) break;
    }
    handleLine(buf);
    if (final) return final;
    try { const whole = JSON.parse(buf); if (whole && typeof whole === 'object') return whole; } catch (e) {}
    return null;
  }

  // --- Multi-Agent Pool: task agents in new colors, one main chat ---
  // Colors are new (not the Red/Yellow/Blue trio): Brown, Black, Silver, Golden, then cycle. Max 8, matching the agent subagent cap.
  // 50 agent colors: first 4 are the hand-made Brown/Black/Silver/Golden, then 46 hue-spread colors.
  // Color is chosen by GLOBAL creation order (agent id), not by how many are active:
  // agent 1 = color 1, agent 50 = color 50, agent 51 = color 1 again, and so on.
  const TASK_AGENT_BASE_COLORS = [
    { name: 'Brown', color: '#8B5A2B', filter: 'sepia(0.9) hue-rotate(-10deg) saturate(0.8) brightness(0.9)' },
    { name: 'Black', color: '#111827', filter: 'grayscale(1) brightness(0.35)' },
    { name: 'Silver', color: '#9CA3AF', filter: 'grayscale(1) brightness(1.4) contrast(0.7)' },
    { name: 'Golden', color: '#D4A017', filter: 'sepia(1) hue-rotate(25deg) saturate(2.5) brightness(1.1)' }
  ];
  function getTaskAgentColor(agentId) {
    const idx = (agentId - 1) % 50;
    if (idx < TASK_AGENT_BASE_COLORS.length) return TASK_AGENT_BASE_COLORS[idx];
    // Golden-angle hues: successive colors stay visually distinct instead of sliding through neighbours.
    const hue = Math.round(((idx - 4) * 137.5) % 360);
    return { name: 'Color ' + (idx + 1), color: 'hsl(' + hue + ', 70%, 45%)', filter: 'hue-rotate(' + hue + 'deg) saturate(1.5)' };
  }
  let taskAgentSeq = 0;
  const activeTaskAgents = [];
  function spawnTaskAgent(pipeline, command, arg) {
    const list = document.getElementById('leftAgentList');
    if (!list) return null;
    const agentId = ++taskAgentSeq;
    const color = getTaskAgentColor(agentId);
    const agent = { id: agentId, color: color, command: command, arg: arg, el: null };
    const item = document.createElement('div');
    item.className = 'left-agent-item';
    const row = document.createElement('div');
    row.className = 'left-agent-row';
    row.title = '/' + command + (arg ? ' ' + arg : '');
    const lottieEl = document.createElement('div');
    lottieEl.className = 'left-agent-lottie';
    lottieEl.style.filter = color.filter;
    const stopBtn = document.createElement('button');
    stopBtn.type = 'button';
    stopBtn.className = 'left-agent-stop';
    stopBtn.title = 'Stop this agent';
    stopBtn.textContent = '⏹';
    stopBtn.addEventListener('click', () => {
      if (!pipeline) return;
      pipeline.agentStopped = true;
      pipeline.stopped = true;
      stopBtn.disabled = true;
      try { pipeline.abort.abort(); } catch (e) {}
      setTaskActive(false, 'idle');
      updateStopButton();
    });
    row.appendChild(lottieEl);
    row.appendChild(stopBtn);
    const thinkingEl = document.createElement('div');
    thinkingEl.className = 'left-agent-thinking';
    thinkingEl.textContent = 'Thinking 0s';
    item.appendChild(row);
    item.appendChild(thinkingEl);
    list.appendChild(item);
    agent.el = item;
    let thinkSecs = 0;
    agent.thinkingTimer = setInterval(() => { thinkSecs += 1; thinkingEl.textContent = 'Thinking ' + thinkSecs + 's'; }, 1000);
    try {
      if (window.lottie) {
        if (window._redCatAnimData) window.lottie.loadAnimation({ container: lottieEl, animationData: window._redCatAnimData, renderer: 'svg', loop: true, autoplay: true });
        else window.lottie.loadAnimation({ container: lottieEl, path: '/lottie-animations/red-cat.json', renderer: 'svg', loop: true, autoplay: true });
      }
    } catch (e) {}
    activeTaskAgents.push(agent);
    if (pipeline) pipeline.taskAgent = agent;
    return agent;
  }
  function completeTaskAgent(pipeline, summary) {
    const agent = pipeline ? pipeline.taskAgent : null;
    if (!agent) return null;
    if (pipeline) pipeline.taskAgent = null;
    if (agent.thinkingTimer) { clearInterval(agent.thinkingTimer); agent.thinkingTimer = null; }
    const idx = activeTaskAgents.indexOf(agent);
    if (idx >= 0) activeTaskAgents.splice(idx, 1);
    if (agent.el && agent.el.parentNode) agent.el.parentNode.removeChild(agent.el);
    if (pipeline && pipeline.agentStopped && chatStream) {
      pipeline.agentStopped = false;
      const note = document.createElement('article');
      note.className = 'agent-message-card agent-done-popup';
      note.style.borderLeftColor = '#6b7280';
      const ncontent = document.createElement('div');
      ncontent.className = 'message-text-content';
      ncontent.innerHTML = '<b style="color:#6b7280;">' + escapeHtml(agent.color.name) + ' agent stopped</b> — /' + escapeHtml(agent.command) + (agent.arg ? ' ' + escapeHtml(agent.arg.slice(0, 80)) : '');
      note.appendChild(ncontent);
      chatStream.appendChild(note);
      scrollToBottom();
    }
    if (summary && chatStream) {
      const popup = document.createElement('article');
      popup.className = 'agent-message-card agent-done-popup';
      popup.style.borderLeftColor = agent.color.color;
      const content = document.createElement('div');
      content.className = 'message-text-content';
      content.innerHTML = '<b style="color:' + agent.color.color + ';">' + escapeHtml(agent.color.name) + ' agent finished</b> — /' + escapeHtml(agent.command) + (agent.arg ? ' ' + escapeHtml(agent.arg.slice(0, 80)) : '');
      popup.appendChild(content);
      chatStream.appendChild(popup);
      scrollToBottom();
    }
    return agent;
  }

  // Slash commands v1: deterministic, no model key. Image attach + /qr /resize
  // /rembg /scrape /research are intercepted before the key/agent path.
  let pendingSlashImage = null;
  const slashFileInput = document.createElement('input');
  slashFileInput.type = 'file';
  slashFileInput.accept = 'image/*';
  slashFileInput.style.display = 'none';
  document.body.appendChild(slashFileInput);
  slashFileInput.addEventListener('change', () => {
    const f = slashFileInput.files && slashFileInput.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      pendingSlashImage = { name: f.name, dataUrl: rd.result };
      if (chatInput) chatInput.placeholder = 'Image attached: ' + f.name + ' — type /rembg or /resize and send';
    };
    rd.readAsDataURL(f);
    slashFileInput.value = '';
  });
  const btnAttachEl = document.getElementById('btnAttach');
  // ---- Composer attachments: + menu, tray, paste, upload-then-send ----
  // Max 10 attachments per message (a folder counts as one). The old + flow
  // (slash image picker) is superseded: pick an image here, then send
  // /rembg or /resize and the tray image is used (see runSlashCommand).
  const MAX_ATTACHMENTS = 10;
  const MAX_ATTACH_FILE = 2 * 1024 * 1024 * 1024;
  const MAX_ATTACH_TOTAL = 2 * 1024 * 1024 * 1024;
  const MAX_FOLDER_FILES = 100;
  let pendingAttachments = [];
  let attachSeq = 0;
  const ATT_FOLDER_SVG = '<svg width="36" height="36" viewBox="0 0 24 24" fill="#fbbf24" stroke="#d97706" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
  function fmtAttachSize(n) { n = Number(n || 0); if (n >= 1073741824) return (n / 1073741824).toFixed(1) + ' GB'; if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB'; if (n >= 1024) return (n / 1024).toFixed(1) + ' KB'; return n + ' B'; }
  function attachExtOf(name) { const m = /\.([A-Za-z0-9]{1,5})$/.exec(String(name || '')); return m ? m[1].toUpperCase() : 'FILE'; }
  function attachExtColor(ext) {
    const map = { PDF: '#dc2626', DOC: '#2563eb', DOCX: '#2563eb', XLS: '#16a34a', XLSX: '#16a34a', PPT: '#ea580c', PPTX: '#ea580c', ZIP: '#7c3aed', RAR: '#7c3aed', MP3: '#059669', WAV: '#059669', MP4: '#0f766e', MOV: '#0f766e', TXT: '#64748b', MD: '#64748b', JSON: '#334155', JS: '#334155', HTML: '#334155', CSS: '#334155', PNG: '#db2777', JPG: '#db2777', JPEG: '#db2777', GIF: '#db2777', WEBP: '#db2777' };
    return map[ext] || '#64748b';
  }
  function readFileAsDataURL(file) { return new Promise((resolve, reject) => { const rd = new FileReader(); rd.onload = () => resolve(rd.result); rd.onerror = () => reject(new Error('read failed')); rd.readAsDataURL(file); }); }
  const attachTrayEl = document.createElement('div');
  attachTrayEl.id = 'attachTray';
  attachTrayEl.className = 'attach-tray';
  attachTrayEl.style.display = 'none';
  attachTrayEl.innerHTML = '<div class="attach-cards" id="attachCards"></div><div class="attach-footer"><span class="attach-count" id="attachCount"></span><span class="attach-status" id="attachStatus"></span></div><div class="attach-note" id="attachNote" style="display:none"></div>';
  if (chatForm && chatForm.parentElement) chatForm.parentElement.insertBefore(attachTrayEl, chatForm);
  const attachMenuEl = document.createElement('div');
  attachMenuEl.id = 'attachMenu';
  attachMenuEl.className = 'attach-menu';
  attachMenuEl.style.display = 'none';
  attachMenuEl.innerHTML = '<button type="button" class="attach-menu-item" data-attach-menu="files"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg><span>Photos &amp; files</span></button><button type="button" class="attach-menu-item" data-attach-menu="folder"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg><span>Folder</span></button>';
  if (chatForm && chatForm.parentElement) chatForm.parentElement.appendChild(attachMenuEl);
  function hideAttachNote() {
    const note = document.getElementById('attachNote');
    if (note) note.style.display = 'none';
  }
  // Warnings stay visible until the user dismisses them (click) or a fresh
  // successful attach/send clears them. The old 4-second auto-hide made
  // skip reasons (e.g. a file over 50 MB) vanish before they were read.
  function attachNote(text) {
    const note = document.getElementById('attachNote');
    if (!note) return;
    note.textContent = text;
    note.style.display = 'block';
    if (!note._dismissWired) {
      note._dismissWired = true;
      note.addEventListener('click', () => { note.style.display = 'none'; });
      note.style.cursor = 'pointer';
      note.title = 'Click to dismiss';
    }
  }
  function renderAttachTray() {
    const cardsEl = document.getElementById('attachCards');
    if (!pendingAttachments.length) { attachTrayEl.style.display = 'none'; return; }
    attachTrayEl.style.display = '';
    const cards = pendingAttachments.map(a => {
      if (a.kind === 'image') return '<div class="att-card" data-att-id="' + a.id + '"><img class="att-thumb" src="' + escapeHtml(a.previewUrl) + '" alt=""><div class="att-meta"><span class="att-name">' + escapeHtml(a.name) + '</span><span class="att-size">' + fmtAttachSize(a.size) + '</span></div><button type="button" class="att-remove" data-att-remove="' + a.id + '" title="Remove">×</button></div>';
      if (a.kind === 'folder') return '<div class="att-card att-folder" data-att-id="' + a.id + '"><span class="att-folder-icon">' + ATT_FOLDER_SVG + '</span><div class="att-meta"><span class="att-name">' + escapeHtml(a.name) + '</span><span class="att-size">' + a.files.length + ' files • ' + fmtAttachSize(a.size) + '</span></div><button type="button" class="att-remove" data-att-remove="' + a.id + '" title="Remove">×</button><div class="att-folder-files" style="display:none">' + a.files.slice(0, 20).map(f => '<span class="att-folder-file">' + escapeHtml(f.webkitRelativePath || f.name) + '</span>').join('') + (a.files.length > 20 ? '<span class="att-folder-file">+' + (a.files.length - 20) + ' more…</span>' : '') + '</div></div>';
      const ext = attachExtOf(a.name);
      return '<div class="att-card" data-att-id="' + a.id + '"><span class="att-ext" style="background:' + attachExtColor(ext) + '">' + escapeHtml(ext) + '</span><div class="att-meta"><span class="att-name">' + escapeHtml(a.name) + '</span><span class="att-size">' + fmtAttachSize(a.size) + '</span></div><button type="button" class="att-remove" data-att-remove="' + a.id + '" title="Remove">×</button></div>';
    }).join('');
    if (cardsEl) cardsEl.innerHTML = cards;
    const countEl = document.getElementById('attachCount');
    if (countEl) countEl.textContent = pendingAttachments.length + ' / ' + MAX_ATTACHMENTS;
  }
  function removePendingAttachment(id) {
    const i = pendingAttachments.findIndex(a => a.id === id);
    if (i === -1) return;
    const a = pendingAttachments[i];
    if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    pendingAttachments.splice(i, 1);
    renderAttachTray();
  }
  function clearPendingAttachments() { for (const a of pendingAttachments) if (a.previewUrl) URL.revokeObjectURL(a.previewUrl); pendingAttachments = []; hideAttachNote(); renderAttachTray(); }
  function attachSlotsLeft() { return MAX_ATTACHMENTS - pendingAttachments.length; }
  function attachTotalSize() { return pendingAttachments.reduce((sum, a) => sum + a.size, 0); }
  function addAttachFiles(fileList) {
    hideAttachNote();
    const files = Array.from(fileList || []);
    let added = 0, skippedSize = 0, skippedCap = 0;
    for (const f of files) {
      if (attachSlotsLeft() <= 0) { skippedCap++; continue; }
      if (f.size > MAX_ATTACH_FILE) { skippedSize++; continue; }
      if (attachTotalSize() + f.size > MAX_ATTACH_TOTAL) { skippedCap++; continue; }
      const kind = (f.type || '').startsWith('image/') ? 'image' : 'file';
      pendingAttachments.push({ id: 'att' + (++attachSeq), kind: kind, name: f.name, size: f.size, files: [f], previewUrl: kind === 'image' ? URL.createObjectURL(f) : null });
      added++;
    }
    if (skippedSize) attachNote(skippedSize + ' file(s) skipped — larger than 2 GB.');
    if (skippedCap) attachNote('Maximum ' + MAX_ATTACHMENTS + ' attachments per message — extra files skipped.');
    if (added) renderAttachTray();
  }
  function addAttachFolder(fileList) {
    hideAttachNote();
    const files = Array.from(fileList || []);
    const groups = {};
    const order = [];
    for (const f of files) {
      const rel = f.webkitRelativePath || '';
      const top = rel ? rel.split('/')[0] : 'Folder';
      if (!groups[top]) { groups[top] = []; order.push(top); }
      groups[top].push(f);
    }
    let added = 0, skippedCap = 0;
    for (const top of order) {
      if (attachSlotsLeft() <= 0) { skippedCap++; continue; }
      let g = groups[top];
      if (g.length > MAX_FOLDER_FILES) { attachNote('Folder "' + top + '": only the first ' + MAX_FOLDER_FILES + ' files were kept.'); g = g.slice(0, MAX_FOLDER_FILES); }
      const size = g.reduce((sum, f) => sum + f.size, 0);
      if (attachTotalSize() + size > MAX_ATTACH_TOTAL) { attachNote('Folder "' + top + '" skipped — total would pass 2 GB.'); continue; }
      pendingAttachments.push({ id: 'att' + (++attachSeq), kind: 'folder', name: top, size: size, files: g, previewUrl: null });
      added++;
    }
    if (skippedCap) attachNote('Maximum ' + MAX_ATTACHMENTS + ' attachments per message — extra folders skipped.');
    if (added) renderAttachTray();
  }
  function setAttachUploading(b) {
    if (btnSend) btnSend.disabled = b;
    if (btnAttachEl) btnAttachEl.disabled = b;
    const st = document.getElementById('attachStatus');
    if (st) st.textContent = b ? 'Uploading…' : '';
  }
  async function uploadPendingAttachments() {
    const results = [];
    for (let i = 0; i < pendingAttachments.length; i++) {
      const item = pendingAttachments[i];
      const st = document.getElementById('attachStatus');
      if (st) st.textContent = 'Uploading ' + (i + 1) + '/' + pendingAttachments.length + '…';
      const fd = new FormData();
      if (item.kind === 'folder') {
        for (const f of item.files) fd.append('files', f, (f.webkitRelativePath || item.name + '/' + f.name));
      } else {
        fd.append('files', item.files[0]);
      }
      let res, data;
      try { res = await fetch('/api/upload', { method: 'POST', body: fd }); data = await res.json(); }
      catch (e) { attachNote('Upload failed for "' + item.name + '". Files are still attached.'); return null; }
      if (!res.ok || !data || !data.ok) { attachNote('Upload failed for "' + item.name + '"' + (data && data.error ? ': ' + data.error : '.') + ' Files are still attached.'); return null; }
      results.push({ kind: item.kind, name: item.name, size: item.size, files: (data.files || []).map(f => ({ name: f.name, relPath: f.relPath, size: f.size, type: f.type, url: f.url, path: f.path })) });
    }
    const st = document.getElementById('attachStatus');
    if (st) st.textContent = '';
    return results;
  }
  function renderSentAttachCards(uploaded) {
    return uploaded.map(a => {
      if (a.kind === 'folder') {
        const fileLinks = a.files.slice(0, 20).map(f => '<a class="att-sent-file" href="' + escapeHtml(f.url) + '" target="_blank" rel="noopener">' + escapeHtml(f.relPath) + '</a>').join('');
        return '<div class="att-sent att-sent-folder"><span class="att-folder-icon">' + ATT_FOLDER_SVG + '</span><span class="att-sent-meta"><span class="att-sent-name">' + escapeHtml(a.name) + '</span><span class="att-sent-size">' + a.files.length + ' files • ' + fmtAttachSize(a.size) + '</span></span><div class="att-sent-files">' + fileLinks + (a.files.length > 20 ? '<span class="att-sent-file">+' + (a.files.length - 20) + ' more…</span>' : '') + '</div></div>';
      }
      const f = a.files[0];
      if (!f) return '';
      if (a.kind === 'image') return '<a class="att-sent att-sent-image" href="' + escapeHtml(f.url) + '" target="_blank" rel="noopener"><img src="' + escapeHtml(f.url) + '" alt=""><span class="att-sent-meta"><span class="att-sent-name">' + escapeHtml(a.name) + '</span><span class="att-sent-size">' + fmtAttachSize(a.size) + '</span></span></a>';
      const ext = attachExtOf(a.name);
      return '<a class="att-sent" href="' + escapeHtml(f.url) + '" target="_blank" rel="noopener"><span class="att-ext" style="background:' + attachExtColor(ext) + '">' + escapeHtml(ext) + '</span><span class="att-sent-meta"><span class="att-sent-name">' + escapeHtml(a.name) + '</span><span class="att-sent-size">' + fmtAttachSize(a.size) + '</span></span></a>';
    }).join('');
  }
  const attachFileInput = document.createElement('input');
  attachFileInput.type = 'file'; attachFileInput.multiple = true; attachFileInput.style.display = 'none';
  document.body.appendChild(attachFileInput);
  attachFileInput.addEventListener('change', () => { if (attachFileInput.files && attachFileInput.files.length) addAttachFiles(attachFileInput.files); attachFileInput.value = ''; });
  const attachFolderInput = document.createElement('input');
  attachFolderInput.type = 'file'; attachFolderInput.multiple = true; attachFolderInput.setAttribute('webkitdirectory', ''); attachFolderInput.style.display = 'none';
  document.body.appendChild(attachFolderInput);
  attachFolderInput.addEventListener('change', () => { if (attachFolderInput.files && attachFolderInput.files.length) addAttachFolder(attachFolderInput.files); attachFolderInput.value = ''; });
  function openAttachMenu() {
    if (!btnAttachEl) return;
    const r = btnAttachEl.getBoundingClientRect();
    attachMenuEl.style.left = Math.max(8, r.left) + 'px';
    attachMenuEl.style.bottom = (window.innerHeight - r.top + 8) + 'px';
    attachMenuEl.style.display = '';
  }
  function closeAttachMenu() { attachMenuEl.style.display = 'none'; }
  if (btnAttachEl) btnAttachEl.addEventListener('click', (e) => { e.stopPropagation(); if (attachMenuEl.style.display === 'none') openAttachMenu(); else closeAttachMenu(); });
  attachMenuEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-attach-menu]');
    if (!btn) return;
    closeAttachMenu();
    if (btn.getAttribute('data-attach-menu') === 'folder') attachFolderInput.click();
    else attachFileInput.click();
  });
  document.addEventListener('click', (e) => { if (attachMenuEl.style.display !== 'none' && !attachMenuEl.contains(e.target) && e.target !== btnAttachEl) closeAttachMenu(); });
  attachTrayEl.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-att-remove]');
    if (rm) { removePendingAttachment(rm.getAttribute('data-att-remove')); return; }
    const card = e.target.closest('.att-folder');
    if (card) { const list = card.querySelector('.att-folder-files'); if (list) list.style.display = list.style.display === 'none' ? '' : 'none'; }
  });
  if (chatInput) chatInput.addEventListener('paste', (e) => {
    const dt = e.clipboardData; if (!dt) return;
    const seen = new Set(); const files = [];
    if (dt.files) for (const f of dt.files) { files.push(f); seen.add(f.name + '|' + f.size + '|' + f.lastModified); }
    if (dt.items) for (const it of dt.items) { if (it.kind === 'file') { const f = it.getAsFile(); if (f && !seen.has(f.name + '|' + f.size + '|' + f.lastModified)) files.push(f); } }
    if (files.length) addAttachFiles(files);
  });
  // Drag & drop files anywhere onto the app (any file type, same caps as
  // the + menu). Without this, dropping a PDF did nothing in the chat and
  // dropping it outside the input opened the PDF in the tab instead of
  // attaching it — the browser's default drop action.
  const dropZone = (chatForm && chatForm.parentElement) ? chatForm.parentElement : document.body;
  const dropHasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  ['dragenter', 'dragover'].forEach(t => dropZone.addEventListener(t, (e) => {
    if (!dropHasFiles(e)) return;
    e.preventDefault();
    dropZone.style.outline = '2px dashed #8b0a1a';
    dropZone.style.outlineOffset = '2px';
  }));
  dropZone.addEventListener('dragleave', (e) => {
    if (e.relatedTarget && dropZone.contains(e.relatedTarget)) return;
    dropZone.style.outline = '';
    dropZone.style.outlineOffset = '';
  });
  window.addEventListener('dragover', (e) => { if (dropHasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', (e) => {
    dropZone.style.outline = '';
    dropZone.style.outlineOffset = '';
    if (!dropHasFiles(e)) return;
    e.preventDefault();
    const files = Array.from((e.dataTransfer.files || []));
    if (files.length) addAttachFiles(files);
  });
  function slashFinishCard(sendChatId, pipeline, innerHtml, summary) {
    if (sendChatId === currentChatId && pipeline && pipeline.taskAgent) {
      const agentForPopup = pipeline.taskAgent;
      const popup = document.createElement('article');
      popup.className = 'agent-message-card agent-done-popup';
      popup.style.borderLeftColor = agentForPopup.color.color;
      const pcontent = document.createElement('div');
      pcontent.className = 'message-text-content';
      pcontent.innerHTML = '<b style="color:' + agentForPopup.color.color + ';">' + escapeHtml(agentForPopup.color.name) + ' agent finished</b> — /' + escapeHtml(agentForPopup.command) + (agentForPopup.arg ? ' ' + escapeHtml(agentForPopup.arg.slice(0, 80)) : '');
      popup.appendChild(pcontent);
      chatStream.appendChild(popup);
      scrollToBottom();
      completeTaskAgent(pipeline, null);
    }
    if (sendChatId === currentChatId) {
      if ((!pipeline || !pipeline.isTaskAgent) && thinkingBlock && thinkingChatId === sendChatId) collapseThinking();
      const card = document.createElement('article');
      card.className = 'agent-message-card';
      const content = document.createElement('div');
      content.className = 'message-text-content';
      content.innerHTML = innerHtml;
      card.appendChild(content);
      chatStream.appendChild(card);
      scrollToBottom();
    } else {
      if (!chatStore[sendChatId]) chatStore[sendChatId] = '';
      chatStore[sendChatId] += '<article class="agent-message-card"><div class="message-text-content">' + innerHtml + '</div>' + msgTimeHtml(Date.now()) + '</article>';
    }
    if (!chatHistories[sendChatId]) chatHistories[sendChatId] = [];
    chatHistories[sendChatId].push({ role: 'assistant', content: summary || '', ts: Date.now() });
    if (pipeline) pipeline.stage = 'done';
    if (!chatPipelines[sendChatId] || chatPipelines[sendChatId] === pipeline) setTaskActive(false, 'happy');
    updateStopButton();
    persistChats();
  }
  function slashTextCard(text) {
    return linkifyHtml(text.split('\n').map(l => escapeHtml(l)).join('<br>'));
  }
  function showSlashHelp(sendChatId, pipeline, unknown) {
    const lines = [];
    if (unknown) lines.push('Unknown command: ' + unknown);
    lines.push('Slash commands (no API key needed):');
    lines.push('/qr <text or link> — make a QR code image');
    lines.push('/resize <800 or 800x600> — resize an attached image');
    lines.push('/rembg — remove the background of an attached image');
    lines.push('/scrape <url> — read a page: title, headings, text');
    lines.push('/research <topic> — web search results, facts only');
    lines.push('For /rembg and /resize, attach an image first with the + button.');
    slashFinishCard(sendChatId, pipeline, slashTextCard(lines.join('\n')), lines.join('\n'));
  }
  async function runSlashCommand(message, sendChatId, pipeline) {
    const m = /^\/([a-z]+)(?:\s+([\s\S]*))?$/.exec(message.trim());
    const command = m ? m[1] : '';
    const arg = m && m[2] ? m[2].trim() : '';
    spawnTaskAgent(pipeline, command, arg);
    let attached = pendingSlashImage;
    pendingSlashImage = null;
    if (!attached && (command === 'rembg' || command === 'resize')) {
      const imgItem = pendingAttachments.find(a => a.kind === 'image');
      if (imgItem) {
        try {
          const dataUrl = await readFileAsDataURL(imgItem.files[0]);
          attached = { name: imgItem.name, dataUrl: dataUrl };
          if (imgItem.previewUrl) URL.revokeObjectURL(imgItem.previewUrl);
          pendingAttachments = pendingAttachments.filter(a => a !== imgItem);
          renderAttachTray();
        } catch (e) { /* keep attached null; the no-image message below handles it */ }
      }
    }
    if (chatInput) chatInput.placeholder = 'Message';
    if ((command === 'rembg' || command === 'resize') && !attached) {
      slashFinishCard(sendChatId, pipeline, slashTextCard('Attach an image first with the + button, then send /' + command + '.'), 'Attach an image first with the + button, then send /' + command + '.');
      return;
    }
    try {
      const res = await fetch('/api/slash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: pipeline.abort.signal,
        body: JSON.stringify({ command: command, arg: arg, imageDataUrl: attached ? attached.dataUrl : null })
      });
      const data = await res.json();
      if (pipeline.stopped) { completeTaskAgent(pipeline, null); return; }
      if (!data || !data.ok) {
        const err = (data && data.error) ? data.error : 'Slash command failed.';
        slashFinishCard(sendChatId, pipeline, slashTextCard('Slash error: ' + err), 'Slash error: ' + err);
        return;
      }
      if (data.kind === 'image' && data.imageUrl) {
        const url = escapeHtml(data.imageUrl);
        const title = escapeHtml(data.title || 'Image');
        const html = '<p>' + title + '</p><img src="' + url + '" alt="' + title + '" style="max-width:100%;height:auto;display:block;margin:8px 0;"><p><a href="' + url + '" download>Download</a></p><p>' + escapeHtml(data.text || '') + '</p>';
        slashFinishCard(sendChatId, pipeline, html, (data.title || 'Image') + ': ' + (data.text || '') + ' ' + data.imageUrl);
        return;
      }
      const text = data.text || '';
      slashFinishCard(sendChatId, pipeline, slashTextCard(text), text);
    } catch (err) {
      if (pipeline.stopped) { completeTaskAgent(pipeline, null); return; }
      const msg = 'Slash command failed: ' + (err && err.message ? err.message : 'server did not respond.');
      slashFinishCard(sendChatId, pipeline, slashTextCard(msg), msg);
    }
  }

  // TEMPORARY UI TEST ONLY (2026-10-31): scripted live-steps playback so ali can
  // see the thinking mini-terminal without an API key. NOT a real agent run.
  // The final reply says DEMO. REMOVE after ali has seen it — never ship.
  // --- Agent-building card (shared by the /demo-agent preview and the REAL
  // subagent_spawn flow): "Building agent…" + transferring-files lottie +
  // task rows that arrive one by one. The lottie starts ONLY after it has
  // fully loaded (DOMLoaded) and loops until the agent is really ready.
  function playAgentLottie(container, onFail) {
    if (!container || !window.lottie) { if (onFail) onFail(); return null; }
    container.innerHTML = '';
    let anim = null;
    try {
      anim = window.lottie.loadAnimation({ container: container, path: '/lottie-animations/redcattransferringfiles.json', renderer: 'svg', loop: true, autoplay: false });
      anim.addEventListener('DOMLoaded', () => { try { anim.play(); } catch (e) {} try { const svg = container.querySelector('svg'); if (svg) { svg.style.width = '100%'; svg.style.height = '100%'; svg.style.display = 'block'; } } catch (e) {} });
      anim.addEventListener('data_failed', () => { if (onFail) onFail(); });
    } catch (e) { if (onFail) onFail(); return null; }
    return anim;
  }

  function createBuildAgentCard(withBadge) {
    const card = document.createElement('div');
    card.className = 'build-agent-card';
    const head = document.createElement('div');
    head.className = 'build-agent-head';
    const titleEl = document.createElement('span');
    titleEl.className = 'build-agent-title';
    titleEl.textContent = 'Building agent…';
    head.appendChild(titleEl);
    if (withBadge) {
      const badge = document.createElement('span');
      badge.className = 'build-agent-badge';
      badge.textContent = 'DEMO';
      head.appendChild(badge);
    }
    const lottieEl = document.createElement('div');
    lottieEl.className = 'build-agent-lottie';
    // Inline sizing too (not only the stylesheet): the card must show the
    // full 16/9 frame — both cats — even if a stale cached style.css is
    // still loaded in the browser (2026-10-31 yellow-cat report).
    lottieEl.style.width = '100%';
    lottieEl.style.maxWidth = '320px';
    lottieEl.style.aspectRatio = '16 / 9';
    lottieEl.style.margin = '10px auto 4px auto';
    const listEl = document.createElement('div');
    listEl.className = 'build-agent-tasks';
    card.appendChild(head);
    card.appendChild(lottieEl);
    card.appendChild(listEl);
    const failNote = () => {
      if (!lottieEl.querySelector('.build-agent-noload')) {
        const note = document.createElement('div');
        note.className = 'build-agent-noload';
        note.textContent = 'Animation failed to load.';
        lottieEl.appendChild(note);
      }
    };
    const anim = playAgentLottie(lottieEl, failNote);
    return { card: card, titleEl: titleEl, listEl: listEl, anim: anim };
  }

  function buildAgentRowText(evt) {
    if (evt.tool === 'subagent_spawn') return 'Building agent' + (evt.detail ? ': ' + evt.detail : '');
    return liveStepText(evt);
  }

  // REAL building card, fed by the live agent stream. Opens on the first
  // subagent_spawn event of the run; every later step appends as a task row
  // (previous row flips to done, same pattern as live steps); the lottie
  // loops until the run itself finishes, only then the card says ready.
  let buildAgentCard = null;

  function handleBuildingProgress(chatId, evt) {
    if (!evt || chatId !== currentChatId || !chatStream) return;
    if (!buildAgentCard || !chatStream.contains(buildAgentCard.card)) {
      if (evt.tool !== 'subagent_spawn') return;
      buildAgentCard = createBuildAgentCard(false);
      chatStream.appendChild(buildAgentCard.card);
      scrollToBottom();
    }
    const st = buildAgentCard;
    const prev = st.listEl.querySelector('.build-agent-icon.build-agent-running');
    if (prev) {
      prev.classList.remove('build-agent-running');
      prev.classList.add('build-agent-done');
      prev.textContent = '✅';
    }
    const row = document.createElement('div');
    row.className = 'build-agent-task';
    const icon = document.createElement('span');
    icon.className = 'build-agent-icon build-agent-running';
    icon.textContent = '●';
    const text = document.createElement('span');
    text.textContent = buildAgentRowText(evt);
    row.appendChild(icon);
    row.appendChild(text);
    st.listEl.appendChild(row);
    scrollToBottom();
  }

  function finalizeBuildingCard(chatId, state) {
    const st = buildAgentCard;
    if (!st) return;
    if (chatId !== currentChatId || !chatStream || !chatStream.contains(st.card)) { buildAgentCard = null; return; }
    const icons = st.listEl.querySelectorAll('.build-agent-icon.build-agent-running');
    icons.forEach((icon, i) => {
      const last = i === icons.length - 1;
      icon.classList.remove('build-agent-running');
      if (state === 'failed' && last) {
        icon.classList.add('build-agent-failed');
        icon.textContent = '✗';
      } else if (state === 'stopped' && last) {
        icon.classList.add('build-agent-stopped');
        icon.textContent = '■';
      } else {
        icon.classList.add('build-agent-done');
        icon.textContent = '✅';
      }
    });
    if (state === 'done') st.titleEl.textContent = 'Agent ready ✅';
    else st.titleEl.textContent = 'Building stopped';
    if (st.anim) { try { st.anim.stop(); } catch (e) {} }
    buildAgentCard = null;
  }

  function runDemoSteps(chatId, pipeline) {
    const steps = [
      { tool: 'skill_read', label: 'Reading skill: motion-video', detail: '', thought: 'Demo: starting a sample video task.' },
      { tool: 'todo_write', label: 'todo_write', detail: '', thought: '' },
      { tool: 'deep_read', label: 'Reading website deeply', detail: 'https://www.pinterest.com/', thought: 'Demo: reading the site before building.' },
      { tool: 'browser_read', label: 'Reading page', detail: 'https://www.pinterest.com/', thought: '' },
      { tool: 'terminal_exec', label: 'Running command', detail: 'python -m pip install -U crawl4ai', thought: '' },
      { tool: 'terminal_exec', label: 'Rendering video', detail: 'ffmpeg -y -i frames/frame%03d.png videos/demo.mp4', thought: '' },
    ];
    const flipStopped = () => {
      if (!chatStream) return;
      chatStream.querySelectorAll('.live-step-icon.live-step-running').forEach((icon) => {
        icon.classList.remove('live-step-running');
        icon.classList.add('live-step-stopped');
        icon.textContent = '■';
      });
    };
    steps.forEach((s, i) => {
      setTimeout(() => {
        if (pipeline.stopped) { flipStopped(); return; }
        const evt = { type: 'progress', step: i + 1, tool: s.tool, label: s.label, detail: s.detail, thought: s.thought };
        appendLiveStep(chatId, evt);
        appendActivityRow(chatId, evt);
      }, 900 * (i + 1));
    });
    setTimeout(() => {
      if (pipeline.stopped) { flipStopped(); return; }
      finalizeLiveSteps(chatId, 'done');
      finishWithReply('DEMO reply — this is only a UI test. No real agent run happened and no video was made. Once your API key is added, a real message will show real live steps here.', chatId, pipeline, 800);
    }, 900 * (steps.length + 1));
  }

  // TEMPORARY DEMO ONLY (2026-10-31): preview of the agent-building display
  // with ali's new transferring-files lottie. NOT a real agent build. The
  // final reply says DEMO. REMOVE after ali has seen it — the lottie file
  // itself stays, and the REAL flow uses the same shared card.
  function runDemoAgent(chatId, pipeline) {
    if (!chatStream) return;
    const st = createBuildAgentCard(true);
    chatStream.appendChild(st.card);
    scrollToBottom();
    const tasks = [
      'Understanding your task',
      'Choosing tools for the agent',
      'Loading skills',
      'Warming up memory',
      'Agent ready',
    ];
    const rows = [];
    const addRow = (text) => {
      const row = document.createElement('div');
      row.className = 'build-agent-task';
      const icon = document.createElement('span');
      icon.className = 'build-agent-icon build-agent-running';
      icon.textContent = '●';
      const span = document.createElement('span');
      span.textContent = text;
      row.appendChild(icon);
      row.appendChild(span);
      st.listEl.appendChild(row);
      const entry = { icon: icon };
      rows.push(entry);
      return entry;
    };
    const flipDone = (entry) => {
      entry.icon.classList.remove('build-agent-running');
      entry.icon.classList.add('build-agent-done');
      entry.icon.textContent = '✅';
    };
    const flipStopped = () => {
      rows.forEach((entry) => {
        if (entry.icon.classList.contains('build-agent-running')) {
          entry.icon.classList.remove('build-agent-running');
          entry.icon.classList.add('build-agent-stopped');
          entry.icon.textContent = '■';
        }
      });
      if (st.anim) { try { st.anim.stop(); } catch (e) {} }
    };
    tasks.forEach((t, i) => {
      setTimeout(() => {
        if (pipeline.stopped) { flipStopped(); return; }
        const prev = rows[rows.length - 1];
        if (prev) flipDone(prev);
        addRow(t);
        scrollToBottom();
      }, 1000 * (i + 1));
    });
    setTimeout(() => {
      if (pipeline.stopped) { flipStopped(); return; }
      const last = rows[rows.length - 1];
      if (last) flipDone(last);
      st.titleEl.textContent = 'Agent ready ✅';
      if (st.anim) { try { st.anim.stop(); } catch (e) {} }
      finishWithReply('DEMO — no real agent was built. This is only a preview of how agent-building will look with your new transferring-files animation.', chatId, pipeline, 800);
    }, 1000 * (tasks.length + 1));
  }

  // TEMPORARY DEMO ONLY (2026-10-31): scripted Split + Teacher-teaches-
  // Learner preview, so ali can see the multi-agent + skill-transfer UI
  // without an API key. NO real agent is spawned and NO skill is saved —
  // every card carries the DEMO badge and the final reply says DEMO.
  // REMOVE after ali has seen it — never ship.
  function runDemoTeach(chatId, pipeline) {
    if (!chatStream) return;
    const decision = document.createElement('article');
    decision.className = 'agent-message-card';
    const dcontent = document.createElement('div');
    dcontent.className = 'message-text-content';
    dcontent.innerHTML = '<strong>Split: 2 agents</strong> — Teacher + Learner<br>Task: build a bakery website, then teach the procedure so a second site builds the same way.';
    decision.appendChild(dcontent);
    chatStream.appendChild(decision);
    scrollToBottom();
    const cards = [];
    const mkCard = (title) => {
      const st = createBuildAgentCard(true);
      st.titleEl.textContent = title;
      chatStream.appendChild(st.card);
      scrollToBottom();
      const rows = [];
      const api = {
        st: st,
        addRow: (text) => {
          const row = document.createElement('div');
          row.className = 'build-agent-task';
          const icon = document.createElement('span');
          icon.className = 'build-agent-icon build-agent-running';
          icon.textContent = '●';
          const span = document.createElement('span');
          span.textContent = text;
          row.appendChild(icon);
          row.appendChild(span);
          st.listEl.appendChild(row);
          rows.push(icon);
          scrollToBottom();
        },
        flipPrev: () => {
          const prev = rows[rows.length - 1];
          if (prev && prev.classList.contains('build-agent-running')) {
            prev.classList.remove('build-agent-running');
            prev.classList.add('build-agent-done');
            prev.textContent = '✅';
          }
        },
        flipAllStopped: () => {
          rows.forEach((icon) => {
            if (icon.classList.contains('build-agent-running')) {
              icon.classList.remove('build-agent-running');
              icon.classList.add('build-agent-stopped');
              icon.textContent = '■';
            }
          });
          if (st.anim) { try { st.anim.stop(); } catch (e) {} }
        },
        finish: (title) => {
          api.flipPrev();
          st.titleEl.textContent = title;
          if (st.anim) { try { st.anim.stop(); } catch (e) {} }
        },
      };
      cards.push(api);
      return api;
    };
    let stopped = false;
    const abort = () => {
      if (!pipeline.stopped) return false;
      if (!stopped) { stopped = true; cards.forEach((c) => c.flipAllStopped()); }
      return true;
    };
    const teacherTasks = [
      'Understanding the bakery website task',
      'Extracting the reusable procedure',
      'Skill draft ready (DEMO — not saved)',
    ];
    const learnerTasks = [
      'Reading Teacher\'s skill',
      'Applying the procedure',
      'Second website built (DEMO)',
    ];
    let teacher = null;
    let learner = null;
    setTimeout(() => { if (abort()) return; teacher = mkCard('Teacher agent…'); }, 800);
    teacherTasks.forEach((t, i) => {
      setTimeout(() => {
        if (abort() || !teacher) return;
        teacher.flipPrev();
        teacher.addRow(t);
      }, 1800 + 1000 * i);
    });
    setTimeout(() => { if (abort() || !teacher) return; teacher.finish('Teacher ready ✅'); }, 1800 + 1000 * teacherTasks.length);
    setTimeout(() => { if (abort()) return; learner = mkCard('Learner agent…'); }, 1800 + 1000 * teacherTasks.length + 800);
    learnerTasks.forEach((t, i) => {
      setTimeout(() => {
        if (abort() || !learner) return;
        learner.flipPrev();
        learner.addRow(t);
      }, 1800 + 1000 * teacherTasks.length + 1800 + 1000 * i);
    });
    const endAt = 1800 + 1000 * teacherTasks.length + 1800 + 1000 * learnerTasks.length + 800;
    setTimeout(() => {
      if (abort() || !learner) return;
      learner.finish('Learner ready ✅');
      finishWithReply('DEMO — no real agents were built and no skill was actually saved. This is only a preview of the real flow: the model decides Split, the Teacher\'s procedure becomes a skill (with your approval), the Learner reads it and builds, all under the transferring-files animation.', chatId, pipeline, 800);
    }, endAt);
  }

  // TEMPORARY DEMO ONLY (2026-10-31): a canned deep answer in the new article
  // style, so ali can judge the typography on a real long answer. NOT a real
  // agent run. REMOVE after ali has seen/decided it — the style itself stays.
  function runDemoAnswer(chatId, pipeline) {
    if (!chatStream) return;
    const card = document.createElement('article');
    card.className = 'agent-message-card';
    const content = document.createElement('div');
    content.className = 'message-text-content';
    content.innerHTML = `<p><strong>DEMO</strong> — this is a sample answer only, to judge the new response style. No real agent run happened.</p><hr><h2>What is an AI agent, and how does it work?</h2><p><strong>Short answer:</strong> an AI agent is a program that takes a goal from you, plans the steps itself, uses tools to do them, and shows you the result. A chatbot only answers; an agent also <em>acts</em>.</p><p>That difference is the whole point. When you say "book a table" or "make a page", a chatbot explains how. An agent tries to do it, checks what happened, and fixes its own mistakes along the way.</p><h2>The four parts of an agent</h2><ul><li><strong>Model:</strong> the brain that reads your goal and decides the next step.</li><li><strong>Tools:</strong> the hands — web search, files, browser, code execution, and messages.</li><li><strong>Memory:</strong> notes about what you said before, so it does not start from zero every time.</li><li><strong>Safety:</strong> the brake — it asks you before writing, sending, or deleting anything important.</li></ul><h2>How one task flows</h2><ol><li>Understand the goal and restate it in one line.</li><li>Split it into steps, in order.</li><li>Run each step with the right tool and read the result.</li><li>Verify the result before claiming the task is done.</li></ol><h2>A step, as data</h2><pre><code>{ "thought": "Search first, then build.", "tool": "web_search", "args": { "query": "solar panel prices" } }</code></pre><h2>Agent vs chatbot</h2><table><tr><th></th><th>Chatbot</th><th>Agent</th></tr><tr><td>Answers</td><td>Yes</td><td>Yes</td></tr><tr><td>Takes actions</td><td>No</td><td>Yes</td></tr><tr><td>Checks its work</td><td>No</td><td>Yes</td></tr></table><p>Read more: <a href="https://en.wikipedia.org/wiki/Software_agent">Software agent</a></p><p>The test is simple: if it only talks, it is a chatbot. If it does the work and shows you <em>proof</em>, it is an agent.</p>`;
    card.appendChild(content);
    chatStream.appendChild(card);
    scrollToBottom();
  }

  // Assistant copy buttons (plain replies only — approval/plan/resume/popups excluded).
  function copyMessageText(card, btn) {
    const content = card.querySelector('.message-text-content');
    const text = content ? content.innerText : card.innerText;
    const done = () => {
      const old = btn.innerHTML;
      btn.innerHTML = 'Copied';
      btn.classList.add('copied');
      clearTimeout(btn._copyT);
      btn._copyT = setTimeout(() => { btn.innerHTML = old; btn.classList.remove('copied'); }, 2000);
    };
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      done();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else { fallback(); }
  }
  // Link chips + table value colors (plain replies only). Plain <a> links become
  // small deep-red rounded chips: favicon (or globe fallback) + name + diagonal arrow,
  // opening in a new tab. Yes/No table cells get green/grey colors.
  function decorateLinks(card) {
    const content = card ? card.querySelector('.message-text-content') : null;
    if (!content) return;
    content.querySelectorAll('a[href]').forEach((link) => {
      if (link.classList.contains('rc-link-chip')) return;
      if (link.closest('pre, code')) return;
      const href = link.getAttribute('href') || '';
      if (!/^https?:\/\//i.test(href)) return;
      let host = '';
      try { host = new URL(href).hostname; } catch (e) { return; }
      if (!host) return;
      const rawText = (link.textContent || '').trim();
      const looksLikeUrl = !rawText || /^https?:\/\//i.test(rawText) || (/^[^\s]+\.[^\s]+$/.test(rawText));
      const name = looksLikeUrl ? host.replace(/^www\./i, '') : rawText;
      const chip = document.createElement('a');
      chip.className = 'rc-link-chip';
      chip.href = href;
      chip.target = '_blank';
      chip.rel = 'noopener noreferrer';
      chip.title = href;
      const img = document.createElement('img');
      img.className = 'rc-link-favicon';
      img.alt = '';
      img.src = 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(host) + '&sz=32';
      img.onerror = () => {
        const g = document.createElement('span');
        g.className = 'rc-link-globe';
        g.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>';
        img.replaceWith(g);
      };
      chip.appendChild(img);
      const nameEl = document.createElement('span');
      nameEl.className = 'rc-link-name';
      nameEl.textContent = name;
      chip.appendChild(nameEl);
      const arrow = document.createElement('span');
      arrow.className = 'rc-link-arrow';
      arrow.textContent = '\u2197';
      chip.appendChild(arrow);
      link.replaceWith(chip);
    });
    content.querySelectorAll('td').forEach((td) => {
      const t = (td.textContent || '').trim().toLowerCase();
      if (t === 'yes') td.classList.add('val-yes');
      else if (t === 'no') td.classList.add('val-no');
    });
  }
  function attachCopyButtons(card) {
    if (!card) return;
    const oldHead = card.querySelector('.msg-copy-head');
    if (oldHead) oldHead.remove();
    if (card.dataset.copyWired) return;
    if (card.querySelector('.msg-copy-foot')) { card.dataset.copyWired = '1'; return; }
    card.dataset.copyWired = '1';
    const mkBtn = () => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'msg-copy-btn';
      b.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
      b.title = 'Copy message';
      b.addEventListener('click', () => copyMessageText(card, b));
      return b;
    };
    const foot = document.createElement('div');
    foot.className = 'msg-copy-foot';
    foot.appendChild(mkBtn());
    card.appendChild(foot);
  }
  function isPlainAssistantCard(el) {
    return el && el.classList && el.classList.contains('agent-message-card')
      && !el.classList.contains('agent-approval-card')
      && !el.classList.contains('agent-plan-card')
      && !el.classList.contains('agent-resume-card')
      && !el.classList.contains('agent-done-popup');
  }
  function decorateAssistantCopyButtons(root) {
    (root || document).querySelectorAll('.agent-message-card').forEach((card) => {
      if (isPlainAssistantCard(card)) { attachCopyButtons(card); decorateLinks(card); }
    });
  }
  if (typeof MutationObserver !== 'undefined' && chatStream) {
    const copyObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (isPlainAssistantCard(node)) { attachCopyButtons(node); decorateLinks(node); }
          else if (node.querySelectorAll) node.querySelectorAll('.agent-message-card').forEach((card) => {
            if (isPlainAssistantCard(card)) { attachCopyButtons(card); decorateLinks(card); }
          });
        }
      }
    });
    copyObserver.observe(chatStream, { childList: true, subtree: true });
  }
  decorateAssistantCopyButtons(document);

  async function sendChatMessage(message, attachMeta) {
    setTaskActive(true);
    const earlySlash = /^\/(qr|resize|rembg|scrape|research)\b/.test(message.trim()) || message.trim() === '/help' || message.trim() === '/slash';
    if (!earlySlash) showThinking(message);
    const msgLang = detectLang(message);
    const sendChatId = currentChatId;
    const pipeline = { stage: 'thinking', abort: new AbortController(), stream: null, finishTimer: null, triggerTimer: null, stopped: false, agentRunId: null, isTaskAgent: earlySlash };
    chatPipelines[sendChatId] = pipeline;
    updateStopButton();
    if (!chatHistories[sendChatId]) chatHistories[sendChatId] = [];
    chatHistories[sendChatId].push({ role: 'user', content: message, ts: Date.now() });
    const slashTrim = message.trim();
    if (slashTrim === '/help' || slashTrim === '/slash') { showSlashHelp(sendChatId, pipeline); return; }
    if (/^\/(qr|resize|rembg|scrape|research)\b/.test(slashTrim)) { runSlashCommand(slashTrim, sendChatId, pipeline); return; }
    if (slashTrim === '/demo-steps') { runDemoSteps(sendChatId, pipeline); return; }
    if (slashTrim === '/demo-agent') { runDemoAgent(sendChatId, pipeline); return; }
    if (slashTrim === '/demo-teach') { runDemoTeach(sendChatId, pipeline); return; }
    if (slashTrim === '/demo-answer') { runDemoAnswer(sendChatId, pipeline); return; }
    if (slashTrim.startsWith('/')) { showSlashHelp(sendChatId, pipeline, slashTrim.split(/\s+/)[0]); return; }
    const fastReply = getFastReply(message, msgLang);
    if (fastReply) {
      chatHistories[sendChatId].push({ role: 'assistant', content: fastReply, ts: Date.now() });
      finishWithReply(fastReply, sendChatId, pipeline, 800);
      return;
    }
    const resolved = resolveChatModel(sendChatId);
    const provider = resolved.provider;
    const key = resolved.key;
    let model = resolved.model;
    const restartText = msgLang === 'roman_urdu'
      ? 'Real AI chat needs a server restart: press Ctrl+C in the server window, then run node server.js, and try again.'
      : msgLang === 'urdu'
      ? 'اصل AI چیٹ کے لیے سرور ری اسٹارٹ ضروری ہے: سرور ونڈو میں Ctrl+C دباؤ، پھر node server.js چلاؤ، اور دوبارہ کوشش کرو۔'
      : 'The server needs a restart to enable real AI chat: press Ctrl+C in the server window, then run node server.js, and try again.';
    const serverDownText = msgLang === 'roman_urdu'
      ? 'RedCat server is not responding. Run node server.js in the project folder and try again.'
      : msgLang === 'urdu'
      ? 'RedCat سرور جواب نہیں دے رہا۔ Project folder میں node server.js چلا کر دوبارہ کوشش کرو۔'
      : 'The RedCat server is not responding. Start it with node server.js in the project folder, then try again.';
    if (provider.needsKey !== false && !key) {
      chatHistories[sendChatId].pop();
      collapseThinking();
      setTaskActive(false, 'apiKeyMissing'); // Trigger angry specifically when API key is missing!
      pipeline.stage = 'stopped';
      updateStopButton();
      const noticeText = msgLang === 'roman_urdu'
        ? 'To chat with the real model, add the API key for ' + provider.name + ' in Settings → AI Models.'
        : msgLang === 'urdu'
        ? 'اصل ماڈل سے چیٹ کے لیے Settings → AI Models میں ' + provider.name + ' کی API key ڈالو۔'
        : 'Add your ' + provider.name + ' API key in Settings → AI Models to chat with a real model.';
      const notice = document.createElement('article');
      notice.className = 'agent-message-card chat-notice-card';
      const noticeContent = document.createElement('div');
      noticeContent.className = 'message-text-content';
      const noticeP = document.createElement('p');
      noticeP.textContent = noticeText;
      noticeContent.appendChild(noticeP);
      const noticeBtn = document.createElement('button');
      noticeBtn.type = 'button';
      noticeBtn.className = 'ai-action-btn';
      noticeBtn.textContent = 'Open Settings';
      noticeBtn.addEventListener('click', () => {
        if (settingsModal) settingsModal.classList.add('active');
        const tab = document.querySelector('.settings-nav-item[data-tab="ai-models"]');
        if (tab) tab.click();
      });
      noticeContent.appendChild(noticeBtn);
      notice.appendChild(noticeContent);
      chatStream.appendChild(notice);
      scrollToBottom();
      return;
    }
    const rawHistory = chatHistories[sendChatId].slice(-20);
    while (rawHistory.length && rawHistory[0].role !== 'user') rawHistory.shift();
    const history = [];
    rawHistory.forEach(m => {
      const last = history[history.length - 1];
      if (last && last.role === m.role) last.content += '\n\n' + m.content;
      else history.push({ role: m.role, content: m.content });
    });
    try {
      startActivity(sendChatId);
      const res = await fetch('/api/agent-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: pipeline.abort.signal,
        body: JSON.stringify({ provider: provider.id, model: model, key: key, messages: history, lang: msgLang, chatId: sendChatId, policy: getApprovalPolicy(), attachments: attachMeta || null, connectorStates: { connectors: Object.keys(loadConnectorTokens()), social: Object.keys(loadSocialTokens()) }, providerStates: loadProviderStates() })
      });
      const data = await readAgentStream(res, evt => { appendActivityRow(sendChatId, evt); appendLiveStep(sendChatId, evt); handleBuildingProgress(sendChatId, evt); });
      if (pipeline.stopped) { finalizeLiveSteps(sendChatId, 'stopped'); finalizeBuildingCard(sendChatId, 'stopped'); return; }
      if (data && data.ok && data.status === 'done' && data.text) {
        finalizeLiveSteps(sendChatId, 'done');
        finalizeBuildingCard(sendChatId, 'done');
        chatHistories[sendChatId].push({ role: 'assistant', content: stripConnectMarkers(data.text), ts: Date.now() });
        finishWithReply(data.text, sendChatId, pipeline, undefined, data.thought || '');
      } else if (data && data.ok && data.status === 'need_approval' && data.runId && data.approval) {
        pipeline.agentRunId = data.runId;
        pipeline.stage = 'waiting';
        updateStopButton();
        setThinkingThought(sendChatId, data.thought || '');
        if (sendChatId === currentChatId) {
          renderAgentApproval(data.runId, data.approval);
        } else if (chatStore[sendChatId] !== undefined) {
          const wrap = document.createElement('div');
          wrap.appendChild(buildAgentApprovalCard(data.runId, data.approval));
          chatStore[sendChatId] += wrap.innerHTML;
        }
      } else if (data && data.ok && data.status === 'plan' && data.runId && data.plan) {
        pipeline.agentRunId = data.runId;
        pipeline.stage = 'waiting';
        updateStopButton();
        setThinkingThought(sendChatId, data.thought || '');
        if (sendChatId === currentChatId) {
          renderAgentPlanCard(data.runId, data.plan);
        } else if (chatStore[sendChatId] !== undefined) {
          const wrap = document.createElement('div');
          wrap.appendChild(buildAgentPlanCard(data.runId, data.plan));
          chatStore[sendChatId] += wrap.innerHTML;
        }
      } else if (!data) {
        finishWithReply(restartText, sendChatId, pipeline);
      } else {
        finalizeLiveSteps(sendChatId, 'failed');
        finalizeBuildingCard(sendChatId, 'failed');
        const errMsg = data.error || 'Model call failed.';
        const isKeyErr = errMsg.toLowerCase().includes('key') || errMsg.includes('401') || errMsg.includes('403');
        setTaskActive(false, isKeyErr ? 'apiKeyMissing' : 'done');
        const prefix = msgLang === 'urdu' ? 'ماڈل خرابی: ' : 'Model error: ';
        finishWithReply(prefix + errMsg, sendChatId, pipeline);
      }
    } catch (err) {
      setTaskActive(false, 'done');
      if (pipeline.stopped) { markActivity(sendChatId, 'Stopped'); finalizeLiveSteps(sendChatId, 'stopped'); finalizeBuildingCard(sendChatId, 'stopped'); return; }
      finalizeLiveSteps(sendChatId, 'failed');
      finalizeBuildingCard(sendChatId, 'failed');
      finishWithReply(serverDownText, sendChatId, pipeline);
    }
  }

  // ==========================================================================
  // Connectors Panel State & Navigation
  // ==========================================================================
  const btnNavChat = document.getElementById('btnNavChat');
  const btnNavConnectors = document.getElementById('btnNavConnectors');
  const btnNavBrowser = document.getElementById('btnNavBrowser');
  const btnConnectorsBack = document.getElementById('btnConnectorsBack');
  const btnNavSearch = document.getElementById('btnNavSearch');
  const btnNavNotes = document.getElementById('btnNavNotes');
  const btnNavTasks = document.getElementById('btnNavTasks');
  const btnSearchBack = document.getElementById('btnSearchBack');
  const btnNotesBack = document.getElementById('btnNotesBack');
  const btnTasksBack = document.getElementById('btnTasksBack');
  const sidebarSearch = document.getElementById('sidebarSearch');
  const sidebarNotes = document.getElementById('sidebarNotes');
  const docsMainArea = document.getElementById('docsMainArea');
  const mcpMainArea = document.getElementById('mcpMainArea');
  const browserMainArea = document.getElementById('browserMainArea');
  const sidebarTasks = document.getElementById('sidebarTasks');
  const dummySidebars = [sidebarSearch, sidebarNotes, sidebarTasks];
  const dummyNavBtns = [btnNavSearch, btnNavNotes, btnNavTasks];
  const sidebarChats = document.getElementById('sidebarChats');
  const sidebarConnectors = document.getElementById('sidebarConnectors');
  const connectedContainer = document.getElementById('connectedContainer');
  const availableContainer = document.getElementById('availableContainer');
  const socialContainer = document.getElementById('socialContainer');

  // Letter icons for connectors without a brand SVG (same card UI, no fake logos)
  const letterIcon = (letter, color) => `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="${color}"/><text x="12" y="17" text-anchor="middle" fill="#fff" font-size="12" font-weight="700" font-family="sans-serif">${letter}</text></svg>`;

  // SVG Icons library for connectors matching the screenshot
  const connectorIcons = {
    browser: `<svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
    canva: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="url(#canvaGrad)"/><defs><linearGradient id="canvaGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#00c4cc"/><stop offset="100%" stop-color="#7d2ae8"/></linearGradient></defs><text x="7" y="16" fill="#fff" font-size="12" font-family="cursive" font-weight="bold">c</text></svg>`,
    github: `<svg viewBox="0 0 24 24" fill="#181717"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>`,
    instagram: `<svg viewBox="0 0 24 24"><defs><radialGradient id="igGrad" cx="30%" cy="107%" r="150%"><stop offset="0%" stop-color="#fdf497"/><stop offset="5%" stop-color="#fdf497"/><stop offset="45%" stop-color="#fd5949"/><stop offset="60%" stop-color="#d6249f"/><stop offset="90%" stop-color="#285AEB"/></radialGradient></defs><rect width="20" height="20" x="2" y="2" rx="5" fill="url(#igGrad)"/><circle cx="12" cy="12" r="4.2" stroke="#fff" stroke-width="1.8" fill="none"/><circle cx="17.2" cy="6.8" r="1.1" fill="#fff"/></svg>`,
    'instagram-msg': `<svg viewBox="0 0 24 24"><defs><radialGradient id="igMsgGrad" cx="30%" cy="107%" r="150%"><stop offset="0%" stop-color="#fdf497"/><stop offset="45%" stop-color="#fd5949"/><stop offset="60%" stop-color="#d6249f"/><stop offset="90%" stop-color="#285AEB"/></radialGradient></defs><rect width="20" height="20" x="2" y="2" rx="5" fill="url(#igMsgGrad)"/><path d="M12 6.5C8.96 6.5 6.5 8.74 6.5 11.5c0 1.63.87 3.08 2.23 4.02l-.56 2.08 2.28-.96c.5.11 1.02.16 1.55.16 3.04 0 5.5-2.24 5.5-5s-2.46-5-5.5-5z" fill="#fff"/></svg>`,
    spotify: `<svg viewBox="0 0 24 24" fill="#1DB954"><circle cx="12" cy="12" r="10"/><path d="M17.5 14.8c-.2.3-.5.4-.8.2-2.3-1.4-5.2-1.7-8.6-.9-.3.1-.7-.1-.8-.4-.1-.3.1-.7.4-.8 3.7-.8 7-.5 9.6 1.1.3.2.4.5.2.8zm1.2-2.6c-.2.4-.7.5-1.1.2-2.6-1.6-6.6-2.1-9.7-1.1-.4.1-.9-.1-1-.5-.1-.4.1-.9.5-1 3.5-1.1 7.9-.5 10.9 1.3.4.2.5.7.4 1.1zm.1-2.8C15.7 7.5 10.5 7.3 7.5 8.2c-.5.2-1-.1-1.2-.6-.2-.5.1-1 .6-1.2 3.5-1.1 9.3-.9 12.9 1.2.5.3.6.9.3 1.4-.2.4-.8.6-1.3.4z" fill="#fff"/></svg>`,
    asana: `<svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="4.2" fill="#F06A6A"/><circle cx="6.5" cy="16.5" r="4.2" fill="#F06A6A"/><circle cx="17.5" cy="16.5" r="4.2" fill="#F06A6A"/></svg>`,
    box: `<svg viewBox="0 0 24 24" fill="#0061D5"><rect x="3" y="6" width="18" height="12" rx="3"/><text x="6" y="15" fill="#fff" font-size="9" font-weight="900" font-family="sans-serif">box</text></svg>`,
    calendly: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#006BFF"/><path d="M15.5 8.5h-7a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1zm-.5 6.5H9v-5h6v5z" fill="#fff"/></svg>`,
    dropbox: `<svg viewBox="0 0 24 24" fill="#0061FF"><path d="M6 3l6 4-6 4-6-4 6-4zm12 0l6 4-6 4-6-4 6-4zM0 11l6 4 6-4-6-4-6 4zm24 0l-6 4-6-4 6-4 6 4zM6 16.5l6 4 6-4-6-4-6 4z"/></svg>`,
    evernote: `<svg viewBox="0 0 24 24" fill="#00A82D"><path d="M19.5 4c-.8-1.2-2.3-1.8-3.9-1.8H6.5C4 2.2 2 4.2 2 6.7v10.6c0 2.5 2 4.5 4.5 4.5h5.8l-1.5-2.8H6.5c-1 0-1.8-.8-1.8-1.8V6.7c0-1 .8-1.8 1.8-1.8h9.1c.9 0 1.8.4 2.3 1.1l1.6 2.3V4z"/><circle cx="14.5" cy="10" r="1.5" fill="#00A82D"/></svg>`,
    facebook: `<svg viewBox="0 0 24 24" fill="#1877F2"><circle cx="12" cy="12" r="10"/><path d="M13.5 12.5h2l.3-2.5h-2.3v-1.6c0-.7.2-1.2 1.2-1.2h1.3V5a17 17 0 0 0-1.9-.1c-1.9 0-3.2 1.1-3.2 3.3v1.8H9v2.5h1.9V19h2.6v-6.5z" fill="#fff"/></svg>`,
    gdrive: `<svg viewBox="0 0 24 24"><polygon points="8.5 3 15.5 3 22 14 15 14" fill="#FFC107"/><polygon points="2 14 8.5 3 15 14 8.5 21" fill="#4CAF50"/><polygon points="15 14 22 14 15.5 21 8.5 21" fill="#2196F3"/></svg>`,
    slack: `<svg viewBox="0 0 24 24"><path d="M6 15a2 2 0 1 1-2-2h2v2zm1 0a2 2 0 1 1 2 2v-2H7zm2-6a2 2 0 1 1-2-2v2h2zm0 1a2 2 0 1 1 2 2v-2H9z" fill="#E01E5A"/><path d="M15 18a2 2 0 1 1-2 2v-2h2zm0-1a2 2 0 1 1 2-2h-2v2zm-6-2a2 2 0 1 1 2-2v2H9zm1 0a2 2 0 1 1 2 2h-2v-2z" fill="#2EB67D"/><path d="M18 9a2 2 0 1 1 2 2h-2V9zm-1 0a2 2 0 1 1-2-2v2h2zm-2 6a2 2 0 1 1 2 2v-2h-2zm0-1a2 2 0 1 1-2-2v2h2z" fill="#ECB22E"/><path d="M9 6a2 2 0 1 1 2-2v2H9zm0 1a2 2 0 1 1-2 2h2V7zm6 2a2 2 0 1 1-2 2v-2h2zm-1 0a2 2 0 1 1-2-2h2v2z" fill="#36C5F0"/></svg>`,
    notion: `<svg viewBox="0 0 24 24" fill="#000"><path d="M4.5 3.5l11.7-.8c.7 0 1.2.3 1.5.8l3.6 5.3c.3.5.4 1 .4 1.5v9.2c0 1.2-.9 2-2 2.1l-14.2.9c-1.1 0-2-.9-2-2V5.5c0-1.1.9-2 2-2zm4.3 4.2H6.9v10.1h2V9.6l5.7 8.2h2V7.7h-2v8.1L8.8 7.7z"/></svg>`,
    trello: `<svg viewBox="0 0 24 24" fill="#0052CC"><rect x="3" y="3" width="18" height="18" rx="3"/><rect x="6" y="6" width="4.5" height="10" rx="1" fill="#fff"/><rect x="13.5" y="6" width="4.5" height="6.5" rx="1" fill="#fff"/></svg>`,
    gmail: '<img src="/assets/connectors/gmail.svg" class="connector-brand-img" alt="">',
    claude: '<img src="/assets/connectors/claude.svg" class="connector-brand-img" alt="">',
    zapier: '<img src="/assets/connectors/zapier.svg" class="connector-brand-img" alt="">',
    gitlab: '<img src="/assets/connectors/gitlab.svg" class="connector-brand-img" alt="">',
    cloudflare: '<img src="/assets/connectors/cloudflare.svg" class="connector-brand-img" alt="">',
    vercel: '<img src="/assets/connectors/vercel.svg" class="connector-brand-img" alt="">',
    netlify: '<img src="/assets/connectors/netlify.svg" class="connector-brand-img" alt="">',
    railway: '<img src="/assets/connectors/railway.svg" class="connector-brand-img" alt="">',
    render: '<img src="/assets/connectors/render.svg" class="connector-brand-img" alt="">',
    flyio: '<img src="/assets/connectors/flydotio.svg" class="connector-brand-img" alt="">',
    digitalocean: '<img src="/assets/connectors/digitalocean.svg" class="connector-brand-img" alt="">',
    supabase: '<img src="/assets/mcp-logos/supabase.svg" class="connector-brand-img" alt="">',
    neon: '<img src="/assets/connectors/neon.svg" class="connector-brand-img" alt="">',
    turso: '<img src="/assets/connectors/turso.svg" class="connector-brand-img" alt="">',
    planetscale: '<img src="/assets/connectors/planetscale.svg" class="connector-brand-img" alt="">',
    mongodb: '<img src="/assets/connectors/mongodb.svg" class="connector-brand-img" alt="">',
    firebase: '<img src="/assets/connectors/firebase.svg" class="connector-brand-img" alt="">',
    upstash: '<img src="/assets/connectors/upstash.svg" class="connector-brand-img" alt="">',
    aws: '<img src="/assets/connectors/aws.svg" class="connector-brand-img" alt="">',
    resend: '<img src="/assets/connectors/resend.svg" class="connector-brand-img" alt="">',
    sendgrid: letterIcon('S', '#1A7F37'),
    twilio: '<img src="/assets/connectors/twilio.svg" class="connector-brand-img" alt="">',
    discord: '<img src="/assets/connectors/discord.svg" class="connector-brand-img" alt="">',
    telegram: '<img src="/assets/connectors/telegram.svg" class="connector-brand-img" alt="">',
    github: '<img src="/assets/mcp-logos/github.svg" class="connector-brand-img" alt="">',
    notion: '<img src="/assets/mcp-logos/notion.svg" class="connector-brand-img" alt="">',
    huggingface: '<img src="/assets/connectors/huggingface.svg" class="connector-brand-img" alt="">',
    replicate: '<img src="/assets/connectors/replicate.svg" class="connector-brand-img" alt="">',
    sentry: '<img src="/assets/mcp-logos/sentry.svg" class="connector-brand-img" alt="">',
    linear: '<img src="/assets/mcp-logos/linear.svg" class="connector-brand-img" alt="">',
    npm: '<img src="/assets/connectors/npm.svg" class="connector-brand-img" alt="">',
    pypi: '<img src="/assets/connectors/pypi.svg" class="connector-brand-img" alt="">',
    browser: '<img src="/assets/mcp-logos/oldpc.svg" class="connector-brand-img" alt="">',
  };

  // Browser is built-in and can never be disconnected, so it has no
  // cross button. GitHub / Gmail / Notion moved to Social (real
  // authorize cards). Claude left via its API key in Settings > AI
  // Models, not a connector row. Zapier removed entirely.
  let connectedList = [
    { id: 'browser', name: 'Browser', icon: 'browser' }
  ];

  let availableList = [
    { id: 'gitlab', name: 'GitLab', icon: 'gitlab' },
    { id: 'cloudflare', name: 'Cloudflare', icon: 'cloudflare' },
    { id: 'vercel', name: 'Vercel', icon: 'vercel' },
    { id: 'netlify', name: 'Netlify', icon: 'netlify' },
    { id: 'railway', name: 'Railway', icon: 'railway' },
    { id: 'render', name: 'Render', icon: 'render' },
    { id: 'flyio', name: 'Fly.io', icon: 'flyio' },
    { id: 'digitalocean', name: 'DigitalOcean', icon: 'digitalocean' },
    { id: 'supabase', name: 'Supabase', icon: 'supabase' },
    { id: 'neon', name: 'Neon', icon: 'neon' },
    { id: 'turso', name: 'Turso', icon: 'turso' },
    { id: 'planetscale', name: 'PlanetScale', icon: 'planetscale' },
    { id: 'mongodb', name: 'MongoDB Atlas', icon: 'mongodb' },
    { id: 'firebase', name: 'Firebase', icon: 'firebase' },
    { id: 'upstash', name: 'Upstash', icon: 'upstash' },
    { id: 'aws', name: 'AWS', icon: 'aws' },
    { id: 'resend', name: 'Resend', icon: 'resend' },
    { id: 'sendgrid', name: 'SendGrid', icon: 'sendgrid' },
    { id: 'twilio', name: 'Twilio', icon: 'twilio' },
    { id: 'huggingface', name: 'Hugging Face', icon: 'huggingface' },
    { id: 'replicate', name: 'Replicate', icon: 'replicate' },
    { id: 'sentry', name: 'Sentry', icon: 'sentry' },
    { id: 'linear', name: 'Linear', icon: 'linear' },
    { id: 'npm', name: 'npm', icon: 'npm' },
    { id: 'pypi', name: 'PyPI', icon: 'pypi' }
  ];

  // Connector authorize cards (same shape as Social): logo left, RedCat
  // logo right, Authorize button, official-page link, key input.
  // Direct-token platforms are verified by /api/connector/test and only
  // then move to Connected. The rest show an honest "not available yet"
  // card and NEVER move to Connected on a click alone.
  const connectorAuth = {
    gitlab: { steps: 'In GitLab, create a Personal Access Token with read_api scope, then paste it here.', openUrl: 'https://gitlab.com/-/user_settings/personal_access_tokens' },
    cloudflare: { steps: 'In Cloudflare, create an API Token with read access, then paste it here.', openUrl: 'https://dash.cloudflare.com/profile/api-tokens' },
    vercel: { steps: 'In Vercel, create a Token, then paste it here.', openUrl: 'https://vercel.com/account/tokens' },
    netlify: { steps: 'In Netlify, create a Personal Access Token, then paste it here.', openUrl: 'https://app.netlify.com/user/applications' },
    railway: { steps: 'In Railway, create a Token, then paste it here.', openUrl: 'https://railway.com/account/tokens' },
    render: { steps: 'In Render, create an API Key, then paste it here.', openUrl: 'https://dashboard.render.com/account/api-keys' },
    flyio: { steps: 'In Fly.io, create a Personal Access Token, then paste it here.', openUrl: 'https://fly.io/user/personal_access_tokens' },
    digitalocean: { steps: 'In DigitalOcean, create a Personal Access Token with read scope, then paste it here.', openUrl: 'https://cloud.digitalocean.com/account/api/tokens' },
    supabase: { steps: 'In Supabase, create an Access Token (not a project key), then paste it here.', openUrl: 'https://supabase.com/dashboard/account/tokens' },
    neon: { steps: 'In Neon, create an API Key, then paste it here.', openUrl: 'https://console.neon.tech/app/settings/api-keys' },
    turso: { steps: 'In Turso, create an API Token, then paste it here.', openUrl: 'https://platform.turso.tech/' },
    planetscale: { steps: 'In PlanetScale, create a Service Token with read access, then paste it here.', openUrl: 'https://app.planetscale.com/' },
    mongodb: { notYet: true, reason: 'MongoDB Atlas needs a public key and private key with Digest auth, not a single token.', openUrl: 'https://cloud.mongodb.com/' },
    firebase: { notYet: true, reason: 'Firebase needs a service-account file, not a single token.', openUrl: 'https://console.firebase.google.com/' },
    upstash: { notYet: true, reason: 'Upstash keys are per-database (a URL plus a token), not one account key.', openUrl: 'https://console.upstash.com/' },
    aws: { notYet: true, reason: 'AWS needs signed requests (SigV4) with an access key and secret, not a single token.', openUrl: 'https://console.aws.amazon.com/iam/' },
    resend: { steps: 'In Resend, create an API Key, then paste it here.', openUrl: 'https://resend.com/api-keys' },
    sendgrid: { steps: 'In SendGrid, create an API Key with read access, then paste it here.', openUrl: 'https://app.sendgrid.com/settings/api_keys' },
    twilio: { steps: 'In Twilio Console, copy your Account SID and Auth Token, then paste both here.', openUrl: 'https://console.twilio.com/', fields: [{ key: 'sid', placeholder: 'Account SID (starts with AC)', type: 'text' }, { key: 'token', placeholder: 'Auth Token', type: 'password' }] },
    huggingface: { steps: 'In Hugging Face, create a Token with read access, then paste it here.', openUrl: 'https://huggingface.co/settings/tokens' },
    replicate: { steps: 'In Replicate, create an API Token, then paste it here.', openUrl: 'https://replicate.com/account/api-tokens' },
    sentry: { steps: 'In Sentry, create an Auth Token with read access, then paste it here.', openUrl: 'https://sentry.io/settings/account/api/auth-tokens/' },
    linear: { steps: 'In Linear, create a Personal API Key, then paste it here.', openUrl: 'https://linear.app/settings/api' },
    npm: { steps: 'On npm, create an Access Token with read-only scope, then paste it here.', openUrl: 'https://www.npmjs.com/settings/~/tokens' },
    pypi: { notYet: true, reason: 'PyPI tokens can only be verified by an upload attempt, so RedCat cannot safely verify one here.', openUrl: 'https://pypi.org/manage/account/token/' },
  };
  function loadConnectorTokens() {
    try { return JSON.parse(localStorage.getItem('redcat_connector_tokens_v1') || '{}'); } catch (e) { return {}; }
  }
  // SMART-MODEL (2026-11-05): saved providers for the agent's model picker — names + models
  // only, NEVER keys. The server uses this list to decide which model fits a task.
  function loadProviderStates() {
    const list = [];
    aiProviders.forEach(p => {
      const rec = getProviderRecord(p.id);
      const hasKey = !p.needsKey || !!(rec.key && rec.key.trim());
      if (!hasKey) return;
      let model = '';
      if (rec.chatModel && rec.chatModel !== 'Custom (type manually)') model = rec.chatModel;
      else if (rec.customChatModel && rec.customChatModel.trim()) model = rec.customChatModel.trim();
      else model = (p.models || []).find(m => m !== 'Custom (type manually)') || '';
      list.push({ id: p.id, name: p.name, model: model, hasKey: true });
    });
    return { providers: list };
  }
  function saveConnectorTokens(tokens) {
    try { localStorage.setItem('redcat_connector_tokens_v1', JSON.stringify(tokens)); } catch (e) {}
  }
  function restoreConnectorTokens() {
    const saved = loadConnectorTokens();
    Object.keys(saved).forEach(id => {
      const idx = availableList.findIndex(x => x.id === id);
      if (idx > -1) connectedList.push(availableList.splice(idx, 1)[0]);
    });
  }
  function openConnectorAuthModal(item) {
    const cfg = connectorAuth[item.id] || {};
    const icon = connectorIcons[item.icon] || '';
    let m = document.getElementById('connector-auth-modal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'connector-auth-modal';
      m.className = 'modal-backdrop';
      document.body.appendChild(m);
    }
    let body = '<div class="modal-dialog small-dialog">'
      + '<div class="modal-header"><div class="modal-title-group"><h3>Connect to ' + item.name + '</h3></div><button class="modal-close-btn" id="connector-auth-close">\u2715</button></div>'
      + '<div class="modal-body" style="text-align:center;">'
      + '<div style="display:flex;align-items:center;justify-content:center;gap:24px;margin:12px 0 16px;">'
      + '<div style="width:56px;height:56px;display:flex;align-items:center;justify-content:center;">' + icon + '</div>'
      + '<div style="font-size:22px;opacity:.6;">\u2194</div>'
      + '<div style="width:56px;height:56px;display:flex;align-items:center;justify-content:center;"><img src="/assets/redcatlogo.png" alt="RedCat" style="width:56px;height:56px;object-fit:contain;" /></div></div>'
      + '<div style="font-size:13px;color:#4b5563;margin-bottom:12px;">Authorize RedCat to connect to ' + item.name + '.<br/>RedCat stores the key only in this browser, and asks approval before any write or send.</div>';
    if (cfg.notYet) {
      body += '<div style="font-size:13px;color:#991b1b;margin-bottom:12px;">Direct authorize is not available yet for ' + item.name + '.<br/>' + cfg.reason + '<br/>It stays in Available until a real authorize flow exists.</div>';
      if (cfg.openUrl) body += '<div style="margin-bottom:10px;"><a href="' + cfg.openUrl + '" target="_blank" rel="noopener" style="color:#e11d48;font-weight:700;">Open ' + item.name + ' official page \u2197</a></div>';
      body += '</div></div>';
    } else {
      if (cfg.steps) body += '<div style="font-size:13px;color:#374151;margin-bottom:12px;">' + cfg.steps + '</div>';
      if (cfg.openUrl) body += '<div style="margin-bottom:10px;"><a href="' + cfg.openUrl + '" target="_blank" rel="noopener" style="color:#e11d48;font-weight:700;">Open ' + item.name + ' official page \u2197</a></div>';
      const fields = cfg.fields || [{ key: 'token', placeholder: 'Paste token here', type: 'password' }];
      fields.forEach(f => { body += '<input type="' + f.type + '" id="connector-auth-' + f.key + '" placeholder="' + f.placeholder + '" style="width:100%;padding:8px;margin-bottom:10px;" />'; });
      body += '<div><button class="connector-action-btn connect-deep-red" id="connector-auth-btn" style="padding:8px 20px;">Authorize</button></div>'
        + '<div id="connector-auth-msg" style="font-size:13px;margin-top:10px;"></div></div></div>';
    }
    m.innerHTML = body;
    m.classList.add('active');
    document.getElementById('connector-auth-close').addEventListener('click', () => m.classList.remove('active'));
    m.addEventListener('click', (e) => { if (e.target === m) m.classList.remove('active'); });
    const authBtn = document.getElementById('connector-auth-btn');
    if (!authBtn) return;
    authBtn.addEventListener('click', async () => {
      const msg = document.getElementById('connector-auth-msg');
      const fields = cfg.fields || [{ key: 'token' }];
      const values = {};
      let missing = false;
      fields.forEach(f => {
        const el = document.getElementById('connector-auth-' + f.key);
        values[f.key] = el ? el.value.trim() : '';
        if (!values[f.key]) missing = true;
      });
      if (missing) { if (msg) msg.textContent = 'Paste a key.'; return; }
      if (msg) msg.textContent = 'Authorizing...';
      try {
        const r = await fetch('/api/connector/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, token: values.token || '', sid: values.sid || '' }) });
        const j = await r.json();
        if (j && j.ok) {
          const toks = loadConnectorTokens();
          toks[item.id] = { token: values.token || '', sid: values.sid || '', label: j.label || item.id };
          saveConnectorTokens(toks);
          const idx = availableList.findIndex(x => x.id === item.id);
          if (idx > -1) connectedList.push(availableList.splice(idx, 1)[0]);
          m.classList.remove('active');
          renderConnectors();
          refreshChatConnectStates();
        } else { if (msg) msg.textContent = (j && j.error) || 'Token test failed. Check the key and try again.'; }
      } catch (err) { if (msg) msg.textContent = 'Server not found.'; }
    });
  }

  function renderConnectors() {
    if (!connectedContainer || !availableContainer) return;

    // Render Connected
    connectedContainer.innerHTML = connectedList.map(item => `
      <div class="connector-item connected-item" data-id="${item.id}">
        <div class="connector-left">
          <div class="connector-icon-wrap">${connectorIcons[item.icon] || ''}</div>
          <span class="connector-name">${item.name}</span>
        </div>
        ${item.id === 'browser' ? '' : `<button class="connector-disconnect-btn" data-id="${item.id}" title="Disconnect">✕</button>`}
      </div>
    `).join('');

    // Render Available
    availableContainer.innerHTML = availableList.map(item => `
      <div class="connector-item available-item" data-id="${item.id}">
        <div class="connector-left">
          <div class="connector-icon-wrap">${connectorIcons[item.icon] || ''}</div>
          <span class="connector-name">${item.name}</span>
        </div>
        <button class="connector-action-btn connect-deep-red" data-id="${item.id}">Connect</button>
      </div>
    `).join('');

    // Attach Connect Click Handlers: open the authorize card. Nothing
    // moves to Connected until the provider itself verifies the key.
    document.querySelectorAll('.connector-action-btn.connect-deep-red').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const item = availableList.find(x => x.id === id);
        if (item) openConnectorAuthModal(item);
      });
    });

    // Attach Disconnect Click Handlers
    document.querySelectorAll('.connector-disconnect-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const toks = loadConnectorTokens();
        if (toks[id]) { delete toks[id]; saveConnectorTokens(toks); }
        const itemIdx = connectedList.findIndex(x => x.id === id);
        if (itemIdx > -1) {
          const item = connectedList.splice(itemIdx, 1)[0];
          availableList.unshift(item);
          renderConnectors();
        }
      });
    });
  }

  // MCP Servers (generic cards, data-driven from /api/mcp/catalog).
  function mcpEsc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function mcpInitials(name) {
    var words = String(name || '?').replace(/[^A-Za-z0-9 ]/g, ' ').split(' ').filter(function (w) { return !!w; });
    var init = words.length >= 2 ? (words[0].charAt(0) + words[1].charAt(0)) : String(name || '?').slice(0, 2);
    return init.toUpperCase();
  }
  function mcpIconHtml(server, cls) {
    if (server.logo) return '<img src="/assets/mcp-logos/' + mcpEsc(server.logo) + '" alt="" class="' + (cls || 'mcp-logo-img') + '">';
    return '<span class="' + (cls || 'mcp-initials') + '">' + mcpEsc(mcpInitials(server.name)) + '</span>';
  }
  // Screenshot row: [vendor logo or neutral initials] - [centre] - [RedCat].
  // Centre is the STATE icon: cable SVG while not connected, ali's
  // connected.svg once connected. Vendor + RedCat sides never change.
  // Never a drawn or third-party-glyph logo: without a real vendor file the
  // vendor side is a neutral initials placeholder.
  function mcpLogoRowHtml(server, size) {
    var centre = (server && server.connected)
      ? '<img src="/assets/mcp-logos/connected.svg" alt="" class="mcp-row-cable">'
      : '<img src="/assets/connector-icon.svg" alt="" class="mcp-row-cable">';
    return '<div class="mcp-logo-row mcp-logo-row-' + size + '">'
      + mcpIconHtml(server, 'mcp-ph')
      + centre
      + '<img src="/assets/redcatlogo.png" alt="RedCat" class="mcp-row-redcat"></div>';
  }
  function mcpLabelLine(server) {
    var parts = [];
    if (server.category) parts.push(server.category);
    if (server.kind === 'connector') parts.push('Connector');
    else if (server.official === 'official') parts.push('Official');
    else if (server.official === 'reference') parts.push('Reference');
    else if (server.official === 'community') parts.push('Community');
    else if (server.official === 'unconfirmed') parts.push('Details unconfirmed');
    return parts.join(' \u00b7 ');
  }
  var MCP_CATEGORY_ORDER = ['Files, search & browser', 'Code & developer tools', 'Databases & data', 'Communication', 'Productivity & knowledge', 'Design & media', 'Payments, business & analytics', 'Automation', 'Maps, data & research', 'DevOps, cloud & observability', 'Connectors'];
  function mcpFieldValues(server, prefix) {
    var out = {};
    (server.fields || []).forEach(function (f) {
      var el = document.getElementById((prefix || 'mcp-field-') + server.id + '-' + f.key);
      if (el) out[f.key] = el.value;
    });
    return out;
  }
  function mcpFieldsHtml(server, prefix) {
    var html = '';
    (server.fields || []).forEach(function (f) {
      html += '<label class="mcp-field-label">' + mcpEsc(f.label)
        + '<input class="mcp-field-input" id="' + mcpEsc(prefix) + mcpEsc(server.id) + '-' + mcpEsc(f.key)
        + '" type="' + (f.secret ? 'password' : 'text') + '" autocomplete="off" placeholder="' + mcpEsc(f.placeholder || '') + '"></label>';
    });
    return html;
  }
  function mcpCardHtml(server) {
    var statusText = server.connected ? 'Connected' : (server.hasToken ? 'Saved sign-in' : 'Not connected');
    var statusCls = server.connected ? 'mcp-pill-connected' : (server.hasToken ? 'mcp-pill-saved' : 'mcp-pill-off');
    var actionBtn = '';
    if (server.tier === 2 && server.oauthKind === 'pre-registered' && server.manualConnect && server.connected) {
      actionBtn = '<button class="connector-disconnect-btn" data-mcp-disconnect="' + mcpEsc(server.id) + '">Disconnect</button>';
    } else if (server.tier === 2 && server.oauthKind === 'pre-registered' && server.manualConnect) {
      actionBtn = '<button class="connector-action-btn mcp-setup-btn" data-mcp-setup="' + mcpEsc(server.id) + '">Setup steps</button>'
        + '<button class="connector-action-btn connect-deep-red" data-mcp-connect="' + mcpEsc(server.id) + '">Connect</button>';
    } else if (server.tier === 2) {
      actionBtn = '<button class="connector-action-btn mcp-setup-btn" data-mcp-setup="' + mcpEsc(server.id) + '">Setup required</button>';
    } else if (server.connected) {
      actionBtn = '<button class="connector-disconnect-btn" data-mcp-disconnect="' + mcpEsc(server.id) + '">Disconnect</button>';
    } else if (server.hasToken) {
      actionBtn = '<button class="connector-action-btn connect-deep-red" data-mcp-connect="' + mcpEsc(server.id) + '">Connect</button>';
    } else {
      actionBtn = '<button class="connector-action-btn connect-deep-red" data-mcp-connect="' + mcpEsc(server.id) + '">Connect</button>';
    }
    var fieldsHtml = mcpFieldsHtml(server, 'mcp-field-');
    var toolsBtn = server.connected && server.toolCount > 0
      ? '<button class="mcp-tools-btn" data-mcp-tools="' + mcpEsc(server.id) + '">Tools (' + server.toolCount + ')</button>' : '';
    var dashLink = server.id === 'discord'
      ? mcpDiscordChatLink()
      : (server.dashboardUrl
        ? '<a class="mcp-dash-link" href="' + mcpEsc(server.dashboardUrl) + '" target="_blank" rel="noopener">Vendor site</a>' : '');
    var warnHtml = server.spending
      ? '<div class="mcp-warn">Usage is billed to your own vendor account. Generations always need your approval in chat.</div>' : '';
    var noteHtml = server.note ? '<div class="mcp-note-line">' + mcpEsc(server.note) + '</div>' : '';
    var communityHtml = server.community ? '<div class="mcp-note-line">Community server, not an official vendor product.</div>' : '';
    var unverifiedHtml = server.unverified ? '<div class="mcp-note-line">Details unconfirmed in research: endpoint or auth was not verified. Check the vendor docs first.</div>' : '';
    var labelHtml = '<div class="mcp-cat-label">' + mcpEsc(mcpLabelLine(server)) + '</div>';
    var stepsHtml = '';
    if (server.tier === 2 && server.setupSteps) {
      stepsHtml = '<div class="mcp-steps" id="mcp-steps-' + mcpEsc(server.id) + '" style="display:none;"><ol>'
        + server.setupSteps.map(function (s) { return '<li>' + mcpEsc(s) + '</li>'; }).join('') + '</ol></div>';
    }
    return '<div class="connector-item mcp-card" id="mcp-card-' + mcpEsc(server.id) + '">'
      + mcpLogoRowHtml(server, 'manual')
      + '<div><div class="connector-name">' + mcpEsc(server.name) + '</div>'
      + labelHtml
      + '<div class="mcp-desc">' + mcpEsc(server.desc || '') + '</div></div>'
      + '<div class="mcp-row"><span class="mcp-pill ' + statusCls + '">' + statusText + '</span>' + actionBtn + '</div>'
      + fieldsHtml + warnHtml + noteHtml + communityHtml + unverifiedHtml
      + '<div class="mcp-row">' + toolsBtn + dashLink + '</div>'
      + stepsHtml
      + '<div class="mcp-tools-list" id="mcp-tools-' + mcpEsc(server.id) + '" style="display:none;"></div>'
      + '<div class="mcp-error" id="mcp-error-' + mcpEsc(server.id) + '" style="display:none;"></div>'
      + '</div>';
  }
  // MCP grid redesign: only directly sign-in-able servers in the grid; the
  // rest live under "Manual setup". Custom servers added via Add MCP join
  // the grid. Grid cards show the cable icon, the name above Connect, and
  // no description (description lives in the detail view).
  // Grid = every directly connectable server (tier 1) + user-added custom
  // servers. Everything else lives in Manual setup with full steps.
  var mcpSelectMode = false;
  var mcpSelectedIds = {};
  var mcpDetailId = '';
  function mcpIsGridServer(s) {
    return !!s && (s.custom === true || s.tier === 1);
  }
  // Discord uses the shared RedCat bot: one Connect link that opens the
  // bot authorize page (no Client ID / Client Secret fields, no own-app
  // OAuth form). The app cannot verify the bot-add, so it never shows a
  // Connected state for Discord.
  // POST-AUTH REDIRECT (2026-11-05, v2.45): after Discord authorizes the bot
  // it redirects to /discord-connected (served by this app), which shows an
  // "Open RedCat app" button back to the main page. The redirect URI must
  // ALSO be added in the Discord Developer Portal (OAuth2 -> Redirects),
  // or Discord rejects the authorize. The true desktop deep link
  // (redcat://) needs the packaged app / exe work, which is out of scope —
  // for now "Open RedCat app" opens the app in the browser (localhost:3000).
  var DISCORD_BOT_AUTH_URL = 'https://discord.com/oauth2/authorize?client_id=1567612015000686744&scope=bot&permissions=117760&redirect_uri=http%3A%2F%2F127.0.0.1%3A3000%2Fdiscord-connected';
  var DISCORD_BOT_PROFILE_URL = 'https://discord.com/users/1567612015000686744';
  // DISCORD CONNECT v2 (2026-11-06): the Connect button fetches the
  // authorize URL from the server (/api/discord/connect-url), which
  // returns the shared-bot authorize URL with redirect to the public
  // relay (https://discord-relay.arexora.com/discord/callback) and
  // state = this install's device token. The relay binds the user's
  // Discord ID to the device token so DMs are routed to this PC.
  // Falls back to the old bot-invite URL if the endpoint is unavailable.
  function openDiscordConnect() {
    fetch('/api/discord/connect-url').then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.ok && j.url) { window.open(j.url, '_blank', 'noopener'); }
      else { window.open(DISCORD_BOT_AUTH_URL, '_blank', 'noopener'); }
    }).catch(function () { window.open(DISCORD_BOT_AUTH_URL, '_blank', 'noopener'); });
  }
  function mcpDiscordConnectLink(btnCls) {
    return '<a class="' + btnCls + '" href="' + DISCORD_BOT_AUTH_URL + '" target="_blank" rel="noopener" onclick="openDiscordConnect(); return false;">Connect</a>';
  }
  function mcpDiscordChatLink() {
    return '<a class="mcp-dash-link" href="' + DISCORD_BOT_PROFILE_URL + '" target="_blank" rel="noopener">Chat on Discord</a>';
  }
  function mcpDiscordHintHtml() {
    return '<div class="mcp-note-line">After authorizing, RedCat joins your server. Open a DM with RedCat from its profile to start chatting.</div>';
  }
  function mcpGridActionBtn(server) {
    if (server.connected) return '<button class="connector-disconnect-btn mcp-grid-btn" data-mcp-disconnect="' + mcpEsc(server.id) + '">Disconnect</button>';
    if (server.hasToken) return '<button class="connector-action-btn connect-deep-red mcp-grid-btn" data-mcp-connect="' + mcpEsc(server.id) + '">Connect</button>';
    return '<button class="connector-action-btn connect-deep-red mcp-grid-btn" data-mcp-connect="' + mcpEsc(server.id) + '">Connect</button>';
  }
  function mcpGridCardHtml(server) {
    var checkHtml = mcpSelectMode
      ? '<input type="checkbox" class="mcp-grid-check" data-mcp-check="' + mcpEsc(server.id) + '"' + (mcpSelectedIds[server.id] ? ' checked' : '') + '>'
      : '';
    var customHtml = server.custom ? '<div class="mcp-grid-custom">Custom · Unverified</div>' : '';
    return '<div class="mcp-grid-card' + (mcpSelectedIds[server.id] ? ' mcp-selected' : '') + '" data-mcp-grid-card="' + mcpEsc(server.id) + '">'
      + checkHtml
      + mcpLogoRowHtml(server, 'grid')
      + '<div class="mcp-grid-name">' + mcpEsc(server.name) + '</div>'
      + '<div class="mcp-cat-label">' + mcpEsc(mcpLabelLine(server)) + '</div>'
      + customHtml
      + (server.id === 'discord'
          ? '<div class="mcp-grid-actions">' + mcpDiscordConnectLink('connector-action-btn connect-deep-red mcp-grid-btn') + '</div>'
            + mcpDiscordHintHtml()
            + '<div class="mcp-row">' + mcpDiscordChatLink() + '</div>'
          : (mcpFieldsHtml(server, 'mcp-field-') + '<div class="mcp-grid-actions">' + mcpGridActionBtn(server) + '</div>'))
      + '<div class="mcp-error" id="mcp-error-' + mcpEsc(server.id) + '" style="display:none;"></div>'
      + '</div>';
  }
  function mcpDetailHtml(server) {
    var actionBtn = '';
    if (server.id === 'discord') actionBtn = mcpDiscordConnectLink('connector-action-btn connect-deep-red');
    else if (server.tier === 2) actionBtn = '<button class="connector-action-btn mcp-setup-btn" data-mcp-detail-setup="' + mcpEsc(server.id) + '">Setup required</button>';
    else if (server.connected) actionBtn = '<button class="connector-disconnect-btn" data-mcp-detail-disconnect="' + mcpEsc(server.id) + '">Disconnect</button>';
    else if (server.hasToken) actionBtn = '<button class="connector-action-btn connect-deep-red" data-mcp-detail-connect="' + mcpEsc(server.id) + '">Connect</button>';
    else actionBtn = '<button class="connector-action-btn connect-deep-red" data-mcp-detail-connect="' + mcpEsc(server.id) + '">Connect</button>';
    var detailNoteHtml = (server.id === 'discord' ? mcpDiscordHintHtml() : (server.note ? '<div class="mcp-note-line">' + mcpEsc(server.note) + '</div>' : ''))
      + (server.community ? '<div class="mcp-note-line">Community server, not an official vendor product.</div>' : '')
      + (server.unverified ? '<div class="mcp-note-line">Details unconfirmed in research: endpoint or auth was not verified. Check the vendor docs first.</div>' : '');
    var detailStepsHtml = (server.tier === 2 && server.setupSteps)
      ? '<div class="mcp-steps" id="mcp-detail-steps-' + mcpEsc(server.id) + '" style="display:none;"><ol>'
        + server.setupSteps.map(function (s) { return '<li>' + mcpEsc(s) + '</li>'; }).join('') + '</ol></div>' : '';
    var toolsBtn = server.connected && server.toolCount > 0
      ? '<button class="mcp-tools-btn" data-mcp-detail-tools="' + mcpEsc(server.id) + '">Tools (' + server.toolCount + ')</button>' : '';
    var dashLink = server.id === 'discord'
      ? mcpDiscordChatLink()
      : (server.dashboardUrl
        ? '<a class="mcp-dash-link" href="' + mcpEsc(server.dashboardUrl) + '" target="_blank" rel="noopener">Vendor site</a>' : '');
    var customHtml = server.custom ? '<div class="mcp-grid-custom">Custom · Unverified</div>' : '';
    return '<div class="mcp-detail">'
      + '<button class="mcp-detail-back" id="mcpDetailBack">← Back</button>'
      + mcpLogoRowHtml(server, 'detail')
      + '<div class="mcp-detail-name">' + mcpEsc(server.name) + '</div>'
      + '<div class="mcp-cat-label">' + mcpEsc(mcpLabelLine(server)) + '</div>'
      + customHtml
      + '<div class="mcp-detail-desc">' + mcpEsc(server.id === 'discord' ? 'Add the shared RedCat bot to your server, then chat with it in a DM.' : (server.desc || '')) + '</div>'
      + detailNoteHtml
      + (server.id === 'discord' ? '' : mcpFieldsHtml(server, 'mcp-detail-field-'))
      + '<div class="mcp-row">' + actionBtn + '</div>'
      + detailStepsHtml
      + '<div class="mcp-row">' + toolsBtn + dashLink + '</div>'
      + '<div class="mcp-error" id="mcp-detail-error-' + mcpEsc(server.id) + '" style="display:none;"></div>'
      + '<div class="mcp-tools-list" id="mcp-detail-tools-' + mcpEsc(server.id) + '" style="display:none;"></div>'
      + '</div>';
  }
  function mcpDetailShowError(id, msg) {
    var el = document.getElementById('mcp-detail-error-' + id);
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
  }
  function mcpOpenDetail(id) {
    var server = (window.__mcpServers || []).find(function (s) { return s.id === id; });
    if (!server) return;
    mcpDetailId = id;
    var panel = document.getElementById('mcpDetailPanel');
    var gridWrap = document.getElementById('mcpGridWrap');
    var manualWrap = document.getElementById('mcpManualWrap');
    if (!panel) return;
    panel.innerHTML = mcpDetailHtml(server);
    panel.style.display = 'block';
    if (gridWrap) gridWrap.style.display = 'none';
    if (manualWrap) manualWrap.style.display = 'none';
    var back = document.getElementById('mcpDetailBack');
    if (back) back.addEventListener('click', function () { mcpCloseDetail(); });
    var cbtn = panel.querySelector('[data-mcp-detail-connect]');
    if (cbtn) cbtn.addEventListener('click', function () { mcpDetailConnect(id, cbtn); });
    var dbtn = panel.querySelector('[data-mcp-detail-disconnect]');
    if (dbtn) dbtn.addEventListener('click', function () {
      fetch('/api/mcp/disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id }) })
        .then(function () { renderMcpServers(); syncChatConnectButtons(id, false); }).catch(function () { renderMcpServers(); syncChatConnectButtons(id, false); });
    });
    var sbtn = panel.querySelector('[data-mcp-detail-setup]');
    if (sbtn) sbtn.addEventListener('click', function () {
      var el = document.getElementById('mcp-detail-steps-' + id);
      if (el) el.style.display = (el.style.display === 'none' ? 'block' : 'none');
    });
    var tbtn = panel.querySelector('[data-mcp-detail-tools]');
    if (tbtn) tbtn.addEventListener('click', function () {
      var el = document.getElementById('mcp-detail-tools-' + id);
      if (!el) return;
      if (el.style.display !== 'none') { el.style.display = 'none'; return; }
      fetch('/api/mcp/tools?id=' + encodeURIComponent(id)).then(function (r) { return r.json(); }).then(function (d) {
        var tools = (d && d.tools) || [];
        el.innerHTML = tools.length
          ? tools.map(function (t) { return '<div class="mcp-tool-line"><b>' + mcpEsc(t.name) + '</b>' + (t.description ? ' — ' + mcpEsc(t.description) : '') + '</div>'; }).join('')
          : '<div class="mcp-tool-line">No tools reported.</div>';
        el.style.display = 'block';
      }).catch(function () { el.textContent = 'Could not load tools.'; el.style.display = 'block'; });
    });
  }
  function mcpCloseDetail() {
    mcpDetailId = '';
    var panel = document.getElementById('mcpDetailPanel');
    var gridWrap = document.getElementById('mcpGridWrap');
    var manualWrap = document.getElementById('mcpManualWrap');
    if (panel) { panel.innerHTML = ''; panel.style.display = 'none'; }
    if (gridWrap) gridWrap.style.display = '';
    if (manualWrap) manualWrap.style.display = '';
  }
  function mcpDetailConnect(id, btn) {
    var server = (window.__mcpServers || []).find(function (s) { return s.id === id; });
    if (!server) return;
    var fields = mcpFieldValues(server, 'mcp-detail-field-');
    var missing = (server.fields || []).filter(function (f) { return f.required && !(fields[f.key] || '').trim() && !(f.secret && server.hasToken); });
    if (missing.length) { mcpDetailShowError(id, 'Please fill in: ' + missing.map(function (f) { return f.label; }).join(', ')); return; }
    var origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Connecting…';
    fetch('/api/mcp/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id, fields: fields }) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.needsBrowser && d.authUrl) {
          window.open(d.authUrl, '_blank', 'noopener');
          mcpPollStatus(id, 60);
          btn.disabled = false;
          btn.textContent = origText;
          return;
        }
        if (d && d.ok) { renderMcpServers(); syncChatConnectButtons(id, true); return; }
        mcpDetailShowError(id, (d && (d.detail || d.error)) || 'Connection failed.');
        btn.disabled = false;
        btn.textContent = origText;
      })
      .catch(function (e) {
        mcpDetailShowError(id, 'Connection failed: ' + e.message);
        btn.disabled = false;
        btn.textContent = origText;
      });
  }
  function mcpShowError(id, msg) {
    var el = document.getElementById('mcp-error-' + id);
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
  }
  function mcpClearError(id) {
    var el = document.getElementById('mcp-error-' + id);
    if (el) { el.textContent = ''; el.style.display = 'none'; }
  }
  function mcpPollStatus(id, triesLeft) {
    if (triesLeft <= 0) { mcpShowError(id, 'Sign-in window still open? If you finished signing in, press Connect again to refresh.'); return; }
    fetch('/api/mcp/status').then(function (r) { return r.json(); }).then(function (d) {
      var s = d && d.servers && d.servers[id];
      if (s && s.connected) { renderMcpServers(); syncChatConnectButtons(id, true); return; }
      setTimeout(function () { mcpPollStatus(id, triesLeft - 1); }, 2000);
    }).catch(function () { setTimeout(function () { mcpPollStatus(id, triesLeft - 1); }, 2000); });
  }
  const mcpWiredBtns = new WeakSet();
  function mcpWireButtons() {
    document.querySelectorAll('[data-mcp-connect]').forEach(function (btn) {
      if (mcpWiredBtns.has(btn)) return; mcpWiredBtns.add(btn);
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-mcp-connect');
        var server = (window.__mcpServers || []).find(function (s) { return s.id === id; });
        if (!server) return;
        mcpClearError(id);
        // DISCORD (2026-11-05): the shared RedCat bot is added by authorizing
        // it — no Client ID / Secret. Open the authorize page directly.
        if (id === 'discord') { openDiscordConnect(); return; }
        var fields = mcpFieldValues(server);
        var missing = (server.fields || []).filter(function (f) { return f.required && !(fields[f.key] || '').trim() && !(f.secret && server.hasToken); });
        if (missing.length) { mcpShowError(id, 'Please fill in: ' + missing.map(function (f) { return f.label; }).join(', ')); return; }
        btn.disabled = true;
        btn.textContent = 'Connecting…';
        fetch('/api/mcp/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id, fields: fields }) })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            if (d && d.needsBrowser && d.authUrl) {
              window.open(d.authUrl, '_blank', 'noopener');
              mcpPollStatus(id, 60);
              btn.disabled = false;
              btn.textContent = 'Connect';
              return;
            }
            if (d && d.ok) { renderMcpServers(); syncChatConnectButtons(id, true); return; }
            mcpShowError(id, (d && (d.detail || d.error)) || 'Connection failed.');
            btn.disabled = false;
            btn.textContent = 'Connect';
          })
          .catch(function (e) {
            mcpShowError(id, 'Connection failed: ' + e.message);
            btn.disabled = false;
            btn.textContent = 'Connect';
          });
      });
    });
    document.querySelectorAll('[data-mcp-disconnect]').forEach(function (btn) {
      if (mcpWiredBtns.has(btn)) return; mcpWiredBtns.add(btn);
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-mcp-disconnect');
        fetch('/api/mcp/disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id }) })
          .then(function () { renderMcpServers(); syncChatConnectButtons(id, false); })
          .catch(function () { renderMcpServers(); syncChatConnectButtons(id, false); });
      });
    });
    document.querySelectorAll('[data-mcp-setup]').forEach(function (btn) {
      if (mcpWiredBtns.has(btn)) return; mcpWiredBtns.add(btn);
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-mcp-setup');
        var el = document.getElementById('mcp-steps-' + id);
        if (el) el.style.display = (el.style.display === 'none' ? 'block' : 'none');
      });
    });
    document.querySelectorAll('[data-mcp-tools]').forEach(function (btn) {
      if (mcpWiredBtns.has(btn)) return; mcpWiredBtns.add(btn);
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-mcp-tools');
        var el = document.getElementById('mcp-tools-' + id);
        if (!el) return;
        if (el.style.display !== 'none') { el.style.display = 'none'; return; }
        fetch('/api/mcp/tools?id=' + encodeURIComponent(id)).then(function (r) { return r.json(); }).then(function (d) {
          var tools = (d && d.tools) || [];
          el.innerHTML = tools.length
            ? tools.map(function (t) { return '<div class="mcp-tool-line"><b>' + mcpEsc(t.name) + '</b>' + (t.description ? ' — ' + mcpEsc(t.description) : '') + '</div>'; }).join('')
            : '<div class="mcp-tool-line">No tools reported.</div>';
          el.style.display = 'block';
        }).catch(function () { el.textContent = 'Could not load tools.'; el.style.display = 'block'; });
      });
    });
  }
  function renderMcpServers() {
    var grid = document.getElementById('mcpGridContainer');
    var manual = document.getElementById('mcpManualContainer');
    if (!grid || !manual) return;
    fetch('/api/mcp/catalog').then(function (r) { return r.json(); }).then(function (d) {
      var servers = (d && d.servers) || [];
      window.__mcpServers = servers;
      var gridServers = servers.filter(mcpIsGridServer);
      var filter = document.getElementById('mcpFilterSelect');
      var f = filter ? filter.value : 'all';
      var searchEl = document.getElementById('mcpSearchInput');
      var q = searchEl ? (searchEl.value || '').trim().toLowerCase() : '';
      var catEl = document.getElementById('mcpCategorySelect');
      var cat = catEl ? catEl.value : 'all';
      var mcpMatches = function (s) {
        if (cat !== 'all' && s.category !== cat) return false;
        if (q && ((s.name || '') + ' ' + (s.desc || '')).toLowerCase().indexOf(q) === -1) return false;
        return true;
      };
      gridServers = gridServers.filter(mcpMatches);
      if (f === 'connected') gridServers = gridServers.filter(function (s) { return s.connected; });
      if (f === 'not-connected') gridServers = gridServers.filter(function (s) { return !s.connected; });
      grid.innerHTML = gridServers.map(mcpGridCardHtml).join('') || '<div class="mcp-grid-empty">No servers match this filter.</div>';
      var manualServers = servers.filter(function (s) { return !mcpIsGridServer(s); }).filter(mcpMatches);
      var manualHtml = '';
      MCP_CATEGORY_ORDER.forEach(function (c) {
        var list = manualServers.filter(function (s) { return s.category === c; });
        if (!list.length) return;
        manualHtml += '<div class="mcp-manual-group-title">' + mcpEsc(c) + ' (' + list.length + ')</div>' + list.map(mcpCardHtml).join('');
      });
      var rest = manualServers.filter(function (s) { return MCP_CATEGORY_ORDER.indexOf(s.category) === -1; });
      if (rest.length) manualHtml += '<div class="mcp-manual-group-title">Other (' + rest.length + ')</div>' + rest.map(mcpCardHtml).join('');
      manual.innerHTML = manualHtml || '<div class="mcp-desc">No manual-setup servers listed.</div>';
      mcpWireButtons();
      mcpWireGridCards();
      mcpRefreshSelectUi();
      if (mcpDetailId) mcpOpenDetail(mcpDetailId);
    }).catch(function (e) {
      grid.innerHTML = '<div class="mcp-error" style="display:block;">Could not load MCP servers: ' + mcpEsc(e.message) + '</div>';
    });
  }
  function mcpWireGridCards() {
    document.querySelectorAll('[data-mcp-grid-card]').forEach(function (card) {
      card.addEventListener('click', function (ev) {
        var t = ev.target;
        if (t.closest && t.closest('button, input, a, label')) return;
        var id = card.getAttribute('data-mcp-grid-card');
        if (mcpSelectMode) { mcpToggleSelect(id); return; }
        mcpOpenDetail(id);
      });
    });
    document.querySelectorAll('[data-mcp-check]').forEach(function (box) {
      box.addEventListener('click', function (ev) {
        ev.stopPropagation();
        mcpToggleSelect(box.getAttribute('data-mcp-check'));
      });
    });
  }
  function mcpToggleSelect(id) {
    if (mcpSelectedIds[id]) delete mcpSelectedIds[id];
    else mcpSelectedIds[id] = true;
    mcpRefreshSelectUi();
  }
  function mcpRefreshSelectUi() {
    var selBtn = document.getElementById('mcpSelectBtn');
    if (selBtn) selBtn.textContent = mcpSelectMode ? 'Done' : 'Select';
    var count = Object.keys(mcpSelectedIds).length;
    var bulk = document.getElementById('mcpBulkDisconnectBtn');
    if (bulk) {
      bulk.style.display = (mcpSelectMode && count > 0) ? '' : 'none';
      bulk.textContent = 'Disconnect selected (' + count + ')';
    }
    document.querySelectorAll('[data-mcp-grid-card]').forEach(function (card) {
      var id = card.getAttribute('data-mcp-grid-card');
      if (mcpSelectedIds[id]) card.classList.add('mcp-selected');
      else card.classList.remove('mcp-selected');
      var box = card.querySelector('[data-mcp-check]');
      if (box) box.checked = !!mcpSelectedIds[id];
    });
  }
  function mcpWireHeader() {
    var selBtn = document.getElementById('mcpSelectBtn');
    if (selBtn) selBtn.addEventListener('click', function () {
      mcpSelectMode = !mcpSelectMode;
      if (!mcpSelectMode) mcpSelectedIds = {};
      renderMcpServers();
    });
    var filter = document.getElementById('mcpFilterSelect');
    if (filter) filter.addEventListener('change', function () { renderMcpServers(); });
    var searchInput = document.getElementById('mcpSearchInput');
    if (searchInput) searchInput.addEventListener('input', function () { renderMcpServers(); });
    var catSel = document.getElementById('mcpCategorySelect');
    if (catSel) catSel.addEventListener('change', function () { renderMcpServers(); });
    var bulk = document.getElementById('mcpBulkDisconnectBtn');
    if (bulk) bulk.addEventListener('click', function () {
      var ids = Object.keys(mcpSelectedIds);
      if (!ids.length) return;
      bulk.disabled = true;
      var next = function (i) {
        if (i >= ids.length) { mcpSelectedIds = {}; mcpSelectMode = false; bulk.disabled = false; renderMcpServers(); return; }
        fetch('/api/mcp/disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: ids[i] }) })
          .then(function () { next(i + 1); }).catch(function () { next(i + 1); });
      };
      next(0);
    });
    var addBtn = document.getElementById('mcpAddBtn');
    if (addBtn) addBtn.addEventListener('click', function () { mcpOpenAddDialog(); });
    var closeBtn = document.getElementById('mcpAddClose');
    if (closeBtn) closeBtn.addEventListener('click', function () { mcpCloseAddDialog(); });
    var dialog = document.getElementById('mcpAddDialog');
    if (dialog) dialog.addEventListener('click', function (e) { if (e.target === dialog) mcpCloseAddDialog(); });
    var transport = document.getElementById('mcpAddTransport');
    if (transport) transport.addEventListener('change', function () {
      var remote = document.getElementById('mcpAddRemoteRow');
      var local = document.getElementById('mcpAddLocalRow');
      if (remote) remote.style.display = transport.value === 'remote' ? '' : 'none';
      if (local) local.style.display = transport.value === 'local' ? '' : 'none';
    });
    var submit = document.getElementById('mcpAddSubmit');
    if (submit) submit.addEventListener('click', function () { mcpSubmitAddDialog(submit); });
  }
  function mcpOpenAddDialog() {
    var dialog = document.getElementById('mcpAddDialog');
    if (!dialog) return;
    var err = document.getElementById('mcpAddError');
    if (err) { err.textContent = ''; err.style.display = 'none'; }
    dialog.classList.add('active');
  }
  function mcpCloseAddDialog() {
    var dialog = document.getElementById('mcpAddDialog');
    if (dialog) dialog.classList.remove('active');
  }
  function mcpSubmitAddDialog(btn) {
    var name = (document.getElementById('mcpAddName').value || '').trim();
    var transport = document.getElementById('mcpAddTransport').value;
    var url = (document.getElementById('mcpAddUrl').value || '').trim();
    var command = (document.getElementById('mcpAddCommand').value || '').trim();
    var args = (document.getElementById('mcpAddArgs').value || '').trim();
    var err = document.getElementById('mcpAddError');
    var showErr = function (m) { if (err) { err.textContent = m; err.style.display = 'block'; } };
    if (!name) { showErr('Enter a name.'); return; }
    if (transport === 'remote' && !url) { showErr('Enter the server URL.'); return; }
    if (transport === 'local' && !command) { showErr('Enter the command.'); return; }
    if (err) { err.style.display = 'none'; }
    btn.disabled = true;
    btn.textContent = 'Adding…';
    fetch('/api/mcp/custom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name, transport: transport, url: url, command: command, args: args }) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        btn.disabled = false;
        btn.textContent = 'Add server';
        if (d && d.ok) { mcpCloseAddDialog(); renderMcpServers(); return; }
        showErr((d && d.error) || 'Could not add server.');
      })
      .catch(function (e) {
        btn.disabled = false;
        btn.textContent = 'Add server';
        showErr('Could not add server: ' + e.message);
      });
  }

  // Social connections (real token test, NOT the fake Available move).
  // Discord / Slack / Telegram live here only. Token stays in this
  // browser's localStorage like provider keys, is sent only for the
  // test call, and is never shown in chat or logs. A passing test
  // proves bot identity only — prompt-receive needs the gateway
  // slice (polling + allowlist + approval), which is NOT built yet.
  const socialList = [
    { id: 'telegram', name: 'Telegram', icon: 'telegram', steps: 'Open @BotFather in Telegram, run /newbot, and paste the token you get here.', openUrl: 'https://t.me/BotFather', openLabel: 'BotFather kholo' },
    { id: 'discord', name: 'Discord', icon: 'discord', steps: 'In the Discord Developer Portal, create a New Application, then copy the token from the Bot tab. Keep MESSAGE CONTENT INTENT on.', openUrl: 'https://discord.com/developers/applications', openLabel: 'Discord Developer Portal kholo' },
    { id: 'slack', name: 'Slack', icon: 'slack', steps: 'Create an app in the Slack API, copy the Bot Token (xoxb-...) via OAuth, and install it in your workspace.', openUrl: 'https://api.slack.com/apps', openLabel: 'Slack API kholo' },
    { id: 'github', name: 'GitHub', icon: 'github', steps: 'In GitHub, create a Personal Access Token (classic) with read:user scope, then paste it here.', openUrl: 'https://github.com/settings/tokens', openLabel: 'GitHub tokens kholo' },
    { id: 'gmail', name: 'Gmail', icon: 'gmail', oauthPending: true, steps: 'Gmail needs Google sign-in (OAuth), not a pasted token. Create a Google OAuth app first, then Authorize with Google will work here.', openUrl: 'https://console.cloud.google.com/apis/credentials', openLabel: 'Google Cloud Console kholo' },
    { id: 'notion', name: 'Notion', icon: 'notion', steps: 'In Notion, create an Internal Integration, copy its token, then paste it here. Share the pages you want RedCat to read with that integration.', openUrl: 'https://www.notion.so/my-integrations', openLabel: 'Notion integrations kholo' }
  ];
  function loadSocialTokens() {
    try { return JSON.parse(localStorage.getItem('redcat_social_tokens_v1') || '{}'); } catch (e) { return {}; }
  }
  function saveSocialTokens(tokens) {
    try { localStorage.setItem('redcat_social_tokens_v1', JSON.stringify(tokens)); } catch (e) {}
  }
  let serverSocialStatus = {};
  async function refreshSocialStatus() {
    try { const r = await fetch('/api/social/status'); const j = await r.json(); if (j && j.status) serverSocialStatus = j.status; } catch (e) {}
    renderSocial();
  }
  function openSocialAuthModal(item) {
    let m = document.getElementById('social-auth-modal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'social-auth-modal';
      m.className = 'modal-backdrop';
      document.body.appendChild(m);
    }
    const icon = connectorIcons[item.icon] || '';
    if (item.oauthPending) {
      m.innerHTML = '<div class="modal-dialog small-dialog">'
        + '<div class="modal-header"><div class="modal-title-group"><h3>Connect to ' + item.name + '</h3></div><button class="modal-close-btn" id="social-auth-close">\u2715</button></div>'
        + '<div class="modal-body" style="text-align:center;">'
        + '<div style="display:flex;align-items:center;justify-content:center;gap:24px;margin:12px 0 16px;">'
        + '<div style="width:56px;height:56px;display:flex;align-items:center;justify-content:center;">' + icon + '</div>'
        + '<div style="font-size:22px;opacity:.6;">\u2194</div>'
        + '<div style="width:56px;height:56px;display:flex;align-items:center;justify-content:center;"><img src="/assets/redcatlogo.png" alt="RedCat" style="width:56px;height:56px;object-fit:contain;" /></div></div>'
        + '<div style="font-size:13px;color:#4b5563;margin-bottom:12px;">Authorize RedCat to connect to ' + item.name + '.<br/>RedCat only talks to the owner, and asks approval before sending.</div>'
        + '<div style="font-size:13px;color:#991b1b;margin-bottom:12px;">Google sign-in (OAuth) is not set up yet.<br/>' + (item.steps || '') + '</div>'
        + '<div style="margin-bottom:10px;"><a href="' + item.openUrl + '" target="_blank" rel="noopener" style="color:#e11d48;font-weight:700;">Open ' + item.name + ' official page \u2197</a></div>'
        + '<div style="font-size:13px;color:#6b7280;">It stays unconnected until the Google OAuth app is set up. No fake Connected state.</div></div></div>';
      m.classList.add('active');
      document.getElementById('social-auth-close').addEventListener('click', () => m.classList.remove('active'));
      m.addEventListener('click', (e) => { if (e.target === m) m.classList.remove('active'); });
      return;
    }
    m.innerHTML = '<div class="modal-dialog small-dialog">'
      + '<div class="modal-header"><div class="modal-title-group"><h3>Connect to ' + item.name + '</h3></div><button class="modal-close-btn" id="social-auth-close">\u2715</button></div>'
      + '<div class="modal-body" style="text-align:center;">'
      + '<div style="display:flex;align-items:center;justify-content:center;gap:24px;margin:12px 0 16px;">'
      + '<div style="width:56px;height:56px;display:flex;align-items:center;justify-content:center;">' + icon + '</div>'
      + '<div style="font-size:22px;opacity:.6;">\u2194</div>'
      + '<div style="width:56px;height:56px;display:flex;align-items:center;justify-content:center;"><img src="/assets/redcatlogo.png" alt="RedCat" style="width:56px;height:56px;object-fit:contain;" /></div></div>'
      + '<div style="font-size:13px;color:#4b5563;margin-bottom:12px;">Authorize RedCat to connect to ' + item.name + '.<br/>RedCat only talks to the owner, and asks approval before sending.</div>'
      + '<div style="margin-bottom:10px;"><a href="' + item.openUrl + '" target="_blank" rel="noopener" style="color:#e11d48;font-weight:700;">Open ' + item.name + ' official page \u2197</a></div>'
      + '<input type="password" id="social-auth-token" placeholder="Paste token here" style="width:100%;padding:8px;margin-bottom:10px;" />'
      + '<div><button class="connector-action-btn connect-deep-red" id="social-auth-btn" style="padding:8px 20px;">Authorize</button></div>'
      + '<div id="social-auth-msg" style="font-size:13px;margin-top:10px;"></div></div></div>';
    m.classList.add('active');
    document.getElementById('social-auth-close').addEventListener('click', () => m.classList.remove('active'));
    m.addEventListener('click', (e) => { if (e.target === m) m.classList.remove('active'); });
    document.getElementById('social-auth-btn').addEventListener('click', async () => {
      const input = document.getElementById('social-auth-token');
      const msg = document.getElementById('social-auth-msg');
      const token = input ? input.value.trim() : '';
      if (!token) { if (msg) msg.textContent = 'Paste a token.'; return; }
      if (msg) msg.textContent = 'Authorizing...';
      try {
        const r = await fetch('/api/social/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform: item.id, token }) });
        const j = await r.json();
        if (j && j.ok) { const tokens2 = loadSocialTokens(); tokens2[item.id] = { token, label: j.label || item.id }; saveSocialTokens(tokens2); m.classList.remove('active'); renderSocial(); refreshChatConnectStates(); }
        else { if (msg) msg.textContent = (j && j.error) || 'Authorization failed.'; }
      } catch (err) { if (msg) msg.textContent = 'Server not found.'; }
    });
  }
  function renderSocial() {
    if (!socialContainer) return;
    const tokens = loadSocialTokens();
    socialContainer.innerHTML = socialList.map(item => {
      const saved = tokens[item.id];
      const srv = serverSocialStatus[item.id] || {};
      const connected = !!(srv.connected || saved);
      const right = connected
        ? '<span style="font-size:13px;font-weight:700;color:#16a34a;">Connected</span>'
        : '<button class="connector-action-btn connect-deep-red" data-social-connect="' + item.id + '">Connect</button>';
      return '<div class="connector-item" data-social="' + item.id + '">'
        + '<div class="connector-left"><div class="connector-icon-wrap">' + (connectorIcons[item.icon] || '') + '</div>'
        + '<span class="connector-name">' + item.name + '</span></div>'
        + '<div>' + right + '</div></div>';
    }).join('');
    socialContainer.querySelectorAll('[data-social-connect]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-social-connect');
        const item = socialList.find(s => s.id === id);
        if (item) openSocialAuthModal(item);
      });
    });
  }
  restoreConnectorTokens();
  renderConnectors();
  mcpWireHeader();
  renderMcpServers();
  refreshSocialStatus();

  // Navigation switching
  function showConnectors() {
    if (mainChatArea) mainChatArea.style.display = 'none';
    if (rightPanel) rightPanel.style.display = 'none';
    if (docsMainArea) docsMainArea.style.display = 'none';
    if (mcpMainArea) mcpMainArea.style.display = 'flex';
    if (browserMainArea) browserMainArea.style.display = 'none';
    document.body.classList.add('mcp-page-open');
    sidebarChats.style.display = 'none';
    sidebarConnectors.style.display = 'none';
    renderMcpServers();
    dummySidebars.forEach(s => { if (s) s.style.display = 'none'; });
    btnNavConnectors.classList.add('active');
    btnNavChat.classList.remove('active');
    if (btnNavBrowser) btnNavBrowser.classList.remove('active');
    dummyNavBtns.forEach(b => { if (b) b.classList.remove('active'); });
  }

  // BROWSER-START (2026-11-05): in-app browser page.
  function showBrowser() {
    if (mainChatArea) mainChatArea.style.display = 'none';
    if (rightPanel) rightPanel.style.display = 'none';
    if (docsMainArea) docsMainArea.style.display = 'none';
    if (mcpMainArea) mcpMainArea.style.display = 'none';
    document.body.classList.remove('mcp-page-open');
    sidebarChats.style.display = 'none';
    sidebarConnectors.style.display = 'none';
    dummySidebars.forEach(s => { if (s) s.style.display = 'none'; });
    if (browserMainArea) browserMainArea.style.display = 'flex';
    btnNavChat.classList.remove('active');
    btnNavConnectors.classList.remove('active');
    dummyNavBtns.forEach(b => { if (b) b.classList.remove('active'); });
    if (btnNavBrowser) btnNavBrowser.classList.add('active');
    browserRefresh().then(function () { browserSendViewport(); });
  }
  // BROWSER-END

  // Dummy pages (Search / Notes / Tasks): same left-sidebar switch as
  // Connectors. Content is placeholder only; UI will be redesigned later.
  function showDummyPage(sidebar, btn) {
    if (mainChatArea) mainChatArea.style.display = 'flex';
    if (rightPanel) rightPanel.style.display = '';
    if (docsMainArea) docsMainArea.style.display = 'none';
    if (mcpMainArea) mcpMainArea.style.display = 'none';
    if (browserMainArea) browserMainArea.style.display = 'none';
    document.body.classList.remove('mcp-page-open');
    sidebarChats.style.display = 'none';
    sidebarConnectors.style.display = 'none';
    dummySidebars.forEach(s => { if (s) s.style.display = 'none'; });
    if (sidebar) sidebar.style.display = 'flex';
    btnNavChat.classList.remove('active');
    btnNavConnectors.classList.remove('active');
    if (btnNavBrowser) btnNavBrowser.classList.remove('active');
    dummyNavBtns.forEach(b => { if (b) b.classList.remove('active'); });
    if (btn) btn.classList.add('active');
  }

  function showChats() {
    if (mainChatArea) mainChatArea.style.display = 'flex';
    if (rightPanel) rightPanel.style.display = '';
    if (docsMainArea) docsMainArea.style.display = 'none';
    if (mcpMainArea) mcpMainArea.style.display = 'none';
    document.body.classList.remove('mcp-page-open');
    sidebarConnectors.style.display = 'none';
    dummySidebars.forEach(s => { if (s) s.style.display = 'none'; });
    if (browserMainArea) browserMainArea.style.display = 'none';
    sidebarChats.style.display = 'flex';
    btnNavChat.classList.add('active');
    btnNavConnectors.classList.remove('active');
    if (btnNavBrowser) btnNavBrowser.classList.remove('active');
    dummyNavBtns.forEach(b => { if (b) b.classList.remove('active'); });

  }

  if (btnNavConnectors) btnNavConnectors.addEventListener('click', showConnectors);
  if (btnNavBrowser) btnNavBrowser.addEventListener('click', showBrowser);
  // BROWSER-UI-START (2026-11-05 v3): embedded panel browser logic. English UI only.
  // v3: custom cursor overlay + coordinate-mapped input forwarding (move, click,
  // double-click, wheel, keyboard incl. Ctrl/Shift combos) using the
  // server-confirmed viewport and the displayed shot's content rect (no
  // stretch distortion: object-fit contain); right-side scrollbar driven by
  // scrollinfo/scrollto (wheel, thumb drag, track click); in-panel tabs
  // (bar on top, + opens a blank tab, X closes, click switches, closing the
  // last tab leaves a blank state without killing the session, Stop stops
  // the whole browser). Graceful on the old engine (engineApi < 2): single
  // legacy tab, no +/X, no move/double-click/scrollbar, but the mapping fix,
  // cursor overlay, click-to-focus typing and wheel scrolling still work.
  const browserStartBtn = document.getElementById('browserStartBtn');
  const browserTakeControlBtn = document.getElementById('browserTakeControlBtn');
  const browserDoneBtn = document.getElementById('browserDoneBtn');
  const browserStopBtn = document.getElementById('browserStopBtn');
  const rcbUrlInput = document.getElementById('rcbUrlInput');
  const rcbGoBtn = document.getElementById('rcbGoBtn');
  const browserShotImg = document.getElementById('browserShotImg');
  const browserShotEmpty = document.getElementById('browserShotEmpty');
  const browserApprovals = document.getElementById('browserApprovals');
  const browserError = document.getElementById('browserError');
  const browserViewEl = document.getElementById('browserView');
  const browserTabBarEl = document.getElementById('browserTabBar');
  const browserTabsEl = document.getElementById('browserTabs');
  const browserTabNewBtn = document.getElementById('browserTabNewBtn');
  const browserCursorEl = document.getElementById('browserCursor');
  const browserScrollbarEl = document.getElementById('browserScrollbar');
  const browserScrollbarThumbEl = document.getElementById('browserScrollbarThumb');
  const browserToolbarEl = document.getElementById('browserToolbar');
  let browserLocalError = '';
  let browserViewport = { width: 1280, height: 800 };
  let browserShotViewport = { width: 1280, height: 800 };
  let browserEngineApi = 0;
  let browserRunning = false;
  let browserTabs = [];
  let browserActiveTabId = null;
  let browserTabsSig = '';
  let browserFreshNext = false;
  let browserScroll = null;
  let browserMoveTimer = null;
  let browserMoveQueued = null;
  let browserClickTimer = null;
  let browserClickPending = null;
  let browserRefreshTimer = null;
  let browserScrollDrag = null;
  async function browserApi(path, body) {
    try {
      const r = await fetch(path, {
        method: body ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });
      return await r.json();
    } catch (e) { return { ok: false, error: 'NETWORK_ERROR' }; }
  }
  function browserEscape(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function browserViewSize() {
    if (!browserViewEl) return null;
    const w = Math.max(320, Math.min(1920, Math.floor(browserViewEl.clientWidth)));
    const h = Math.max(240, Math.min(1200, Math.floor(browserViewEl.clientHeight)));
    if (!w || !h) return null;
    return { width: w, height: h };
  }
  async function browserSendViewport() {
    if (!browserRunning) return;
    const v = browserViewSize();
    if (!v) return;
    const st = await browserApi('/api/browser/viewport', v);
    if (st && st.ok && st.viewport) browserViewport = st.viewport;
    browserRefresh();
  }
  function browserGoTarget(raw) {
    const q = (raw || '').trim();
    if (!q) return null;
    if (/^https?:\/\//i.test(q)) return q;
    if (/^[^\s]+\.[^\s]{2,}$/.test(q)) return 'https://' + q;
    return 'https://lite.duckduckgo.com/lite/?q=' + encodeURIComponent(q);
  }
  function browserShowCursor(clientX, clientY) {
    if (!browserCursorEl || !browserViewEl) return;
    const vr = browserViewEl.getBoundingClientRect();
    browserCursorEl.style.display = '';
    browserCursorEl.style.transform = 'translate(' + Math.round(clientX - vr.left) + 'px,' + Math.round(clientY - vr.top) + 'px)';
  }
  function browserHideCursor() {
    if (browserCursorEl) browserCursorEl.style.display = 'none';
  }
  function browserSetCursorShape(editable) {
    if (!browserCursorEl) return;
    browserCursorEl.classList.toggle('browser-cursor-ibeam', !!editable);
  }
  function browserPulseCursor() {
    if (!browserCursorEl) return;
    browserCursorEl.classList.remove('browser-cursor-click');
    void browserCursorEl.offsetWidth;
    browserCursorEl.classList.add('browser-cursor-click');
  }
  function browserContentRect() {
    if (!browserShotImg || !browserViewEl) return null;
    const r = browserShotImg.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const natW = browserShotImg.naturalWidth || browserViewport.width;
    const natH = browserShotImg.naturalHeight || browserViewport.height;
    if (!natW || !natH) return null;
    const scale = Math.min(r.width / natW, r.height / natH);
    const w = natW * scale;
    const h = natH * scale;
    return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, width: w, height: h };
  }
  function browserPageFromClient(clientX, clientY) {
    const c = browserContentRect();
    const vp = browserShotViewport;
    if (!c || !vp.width || !vp.height) return null;
    const x = Math.round(((clientX - c.left) / c.width) * vp.width);
    const y = Math.round(((clientY - c.top) / c.height) * vp.height);
    return { x: Math.max(0, Math.min(vp.width - 1, x)), y: Math.max(0, Math.min(vp.height - 1, y)) };
  }
  function browserRenderScrollbar() {
    if (!browserScrollbarEl || !browserScrollbarThumbEl) return;
    const live = browserRunning && browserTabs.length > 0;
    if (!live || !browserScroll || !browserScroll.scrollHeight || browserScroll.scrollHeight <= 0) {
      browserScrollbarEl.style.display = 'none';
      return;
    }
    const content = browserContentRect();
    if (!content) { browserScrollbarEl.style.display = 'none'; return; }
    const viewRect = browserViewEl.getBoundingClientRect();
    const trackTop = content.top - viewRect.top;
    const trackHeight = content.height;
    const trackLeft = content.left - viewRect.left + content.width - 14;
    browserScrollbarEl.style.display = '';
    browserScrollbarEl.style.top = trackTop + 'px';
    browserScrollbarEl.style.height = trackHeight + 'px';
    browserScrollbarEl.style.left = trackLeft + 'px';
    const maxScroll = Math.max(0, browserScroll.scrollHeight - browserScroll.innerHeight);
    const thumbH = maxScroll > 0 ? Math.max(24, Math.floor(trackHeight * browserScroll.innerHeight / browserScroll.scrollHeight)) : trackHeight;
    const thumbTop = maxScroll > 0 ? Math.floor((browserScroll.scrollY / maxScroll) * (trackHeight - thumbH)) : 0;
    browserScrollbarThumbEl.style.height = thumbH + 'px';
    browserScrollbarThumbEl.style.top = thumbTop + 'px';
  }
  function browserScheduleRefresh(ms) {
    clearTimeout(browserRefreshTimer);
    browserRefreshTimer = setTimeout(function () { browserRefresh(); }, ms || 120);
  }
  function browserRenderTabs() {
    if (!browserTabsEl) return;
    const sig = JSON.stringify(browserTabs) + '|' + (browserActiveTabId || '') + '|' + (browserEngineApi >= 2 ? 'new' : 'legacy');
    if (sig === browserTabsSig) return;
    browserTabsSig = sig;
    if (browserTabBarEl) browserTabBarEl.classList.toggle('browser-legacy', browserEngineApi < 2);
    browserTabsEl.innerHTML = browserTabs.map(function (t) {
      const title = (t.title && t.title.trim()) ? t.title : ((t.url && t.url !== 'about:blank') ? t.url : 'New Tab');
      const active = t.id === browserActiveTabId ? ' browser-tab-active' : '';
      return '<button type="button" class="browser-tab' + active + '" data-browser-tab="' + browserEscape(t.id) + '" title="' + browserEscape(t.url || '') + '">'
        + '<span class="browser-tab-title">' + browserEscape(title) + '</span>'
        + '<span class="browser-tab-close" data-browser-tab-close="' + browserEscape(t.id) + '" title="Close tab">\u00d7</span></button>';
    }).join('');
    browserTabsEl.querySelectorAll('[data-browser-tab]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        if (e.target && e.target.closest && e.target.closest('[data-browser-tab-close]')) return;
        const id = b.getAttribute('data-browser-tab');
        if (id === browserActiveTabId || id === 'legacy') return;
        browserSwitchTab(id);
      });
    });
    browserTabsEl.querySelectorAll('[data-browser-tab-close]').forEach(function (x) {
      x.addEventListener('click', function (e) {
        e.stopPropagation();
        const id = x.getAttribute('data-browser-tab-close');
        if (id === 'legacy') return;
        browserCloseTab(id);
      });
    });
  }
  async function browserNewTab() {
    if (browserEngineApi >= 2 && browserRunning) {
      browserFreshNext = true;
      const st = await browserApi('/api/browser/tab/new', {});
      if (!st.ok) { browserLocalError = st.error || 'TAB_FAILED'; browserRefresh(); return; }
      browserSetBanner(st);
      if (rcbUrlInput) { rcbUrlInput.value = ''; rcbUrlInput.focus(); rcbUrlInput.select(); }
      browserRefresh();
      return;
    }
    if (!browserRunning) {
      if (browserStartBtn) browserStartBtn.click();
      return;
    }
  }
  async function browserSwitchTab(id) {
    browserFreshNext = true;
    browserScroll = null;
    const st = await browserApi('/api/browser/tab/switch', { id: id });
    if (!st.ok) browserLocalError = st.error || 'TAB_FAILED';
    else browserSetBanner(st);
    browserRefresh();
    if (browserViewEl) browserViewEl.focus({ preventScroll: true });
  }
  async function browserCloseTab(id) {
    browserFreshNext = true;
    const st = await browserApi('/api/browser/tab/close', { id: id });
    if (!st.ok) browserLocalError = st.error || 'TAB_FAILED';
    else browserSetBanner(st);
    browserRefresh();
  }
  function browserSetBanner(st) {
    if (!st) {
      if (browserError) {
        if (browserLocalError) { browserError.textContent = 'Error: ' + browserLocalError; browserError.style.display = ''; }
        else { browserError.style.display = 'none'; }
      }
      return;
    }
    if (st.viewport) browserViewport = st.viewport;
    if (typeof st.engineApi === 'number') browserEngineApi = st.engineApi;
    if (typeof st.running === 'boolean') browserRunning = st.running;
    if (Array.isArray(st.tabs)) {
      browserTabs = st.tabs;
      browserActiveTabId = st.activeTabId || null;
    } else if (st.viewport) {
      if (st.running) {
        browserTabs = [{ id: 'legacy', url: st.url || '', title: st.title || '' }];
        browserActiveTabId = 'legacy';
      } else {
        browserTabs = [];
        browserActiveTabId = null;
      }
    }
    const running = browserRunning;
    const hasTabs = browserTabs.length > 0;
    if (browserStartBtn) browserStartBtn.style.display = running ? 'none' : '';
    if (browserStopBtn) browserStopBtn.style.display = running ? '' : 'none';
    if (browserTakeControlBtn) browserTakeControlBtn.style.display = st.state === 'working' ? '' : 'none';
    if (browserDoneBtn) browserDoneBtn.style.display = st.state === 'user-control' ? '' : 'none';
    if (browserShotImg) browserShotImg.style.display = (running && hasTabs) ? '' : 'none';
    if (browserShotEmpty) {
      browserShotEmpty.style.display = (running && hasTabs) ? 'none' : '';
      browserShotEmpty.textContent = running ? 'No tabs open. Click + to open a new tab.' : 'Start the browser to see it here.';
    }
    if (running && hasTabs && browserShotImg) {
      browserShotImg.src = '/api/browser/screenshot' + (browserFreshNext ? '?fresh=1&t=' : '?t=') + Date.now();
      browserFreshNext = false;
    }
    if (browserViewEl) browserViewEl.classList.toggle('browser-live', !!(running && hasTabs));
    if (!running || !hasTabs) browserHideCursor();
    const active = browserTabs.find(function (t) { return t.id === browserActiveTabId; });
    if (running && active && rcbUrlInput && document.activeElement !== rcbUrlInput) {
      rcbUrlInput.value = (active.url && active.url !== 'about:blank') ? active.url : '';
    }
    if (browserError) {
      if (browserLocalError) { browserError.textContent = 'Error: ' + browserLocalError; browserError.style.display = ''; }
      else { browserError.style.display = 'none'; }
    }
    browserRenderTabs();
    browserRenderScrollbar();
  }
  function browserRenderApprovals(st) {
    if (!browserApprovals) return;
    const list = (st && st.pending) || [];
    if (!list.length) { browserApprovals.style.display = 'none'; browserApprovals.innerHTML = ''; return; }
    browserApprovals.style.display = '';
    browserApprovals.innerHTML = list.map(function (p) {
      return '<div class="browser-approval-row"><span>#' + p.id + ' ' + browserEscape(p.kind) + ' — ' + browserEscape(p.detail || '') + (p.selector ? ' (' + browserEscape(p.selector) + ')' : '') + '</span>'
        + '<button type="button" class="browser-btn" data-browser-approve="' + p.id + '">Approve</button>'
        + '<button type="button" class="browser-btn" data-browser-reject="' + p.id + '">Reject</button></div>';
    }).join('');
    browserApprovals.querySelectorAll('[data-browser-approve]').forEach(function (b) {
      b.addEventListener('click', async function () { await browserApi('/api/browser/approve', { id: Number(b.getAttribute('data-browser-approve')), decision: 'approve' }); browserRefresh(); });
    });
    browserApprovals.querySelectorAll('[data-browser-reject]').forEach(function (b) {
      b.addEventListener('click', async function () { await browserApi('/api/browser/approve', { id: Number(b.getAttribute('data-browser-reject')), decision: 'reject' }); browserRefresh(); });
    });
  }
  async function browserRefresh() {
    const st = await browserApi('/api/browser/status');
    if (!st || !st.ok) { browserLocalError = (st && st.error) || 'STATUS_ERROR'; }
    else { browserLocalError = ''; }
    browserSetBanner(st && st.ok ? st : null);
    browserRenderApprovals(st && st.ok ? st : null);
    if (st && st.ok && st.running && browserEngineApi >= 2 && browserTabs.length) {
      const si = await browserApi('/api/browser/scrollinfo');
      if (si && si.ok) { browserScroll = si; browserRenderScrollbar(); }
      else { browserScroll = null; browserRenderScrollbar(); }
    } else {
      browserScroll = null;
      browserRenderScrollbar();
    }
  }
  let browserPollTimer = null;
  function browserStartPoll() {
    if (browserPollTimer) return;
    browserPollTimer = setInterval(function () {
      if (browserMainArea && browserMainArea.style.display !== 'none') browserRefresh();
    }, 1000);
  }
  browserStartPoll();
  // PANEL AUTO-OPEN (2026-11-05, v2.46): when the agent starts the browser
  // (browser_panel tool) while the user is on the chat page, open the
  // Browser panel once so the user sees the live research and the moving
  // cursor. Only on the idle -> running transition, and only while the chat
  // page is visible — never yanks the user off Connectors, Docs, or the
  // Browser page itself, and never re-opens after the user switches away.
  // The initial state is read once at startup so a browser left running
  // from an earlier session does not yank the user on load.
  let browserAgentWatchTimer = null;
  let browserWasRunning = false;
  browserApi('/api/browser/status').then(function (st) { browserWasRunning = !!(st && st.ok && st.running); }).catch(function () {});
  function browserAgentWatch() {
    if (browserAgentWatchTimer) return;
    browserAgentWatchTimer = setInterval(async function () {
      if (document.hidden) return;
      let st = null;
      try { st = await browserApi('/api/browser/status'); } catch (e) { st = null; }
      const running = !!(st && st.ok && st.running);
      if (running && !browserWasRunning) {
        if (mainChatArea && mainChatArea.style.display !== 'none' && browserMainArea && browserMainArea.style.display === 'none') {
          showBrowser();
        }
      }
      browserWasRunning = running;
    }, 3000);
  }
  browserAgentWatch();
  async function browserGoFromBar() {
    if (!browserRunning) {
      if (browserStartBtn) browserStartBtn.click();
      return;
    }
    const target = browserGoTarget(rcbUrlInput ? rcbUrlInput.value : '');
    if (!target) return;
    browserFreshNext = true;
    const st = await browserApi('/api/browser/go', { url: target });
    if (!st.ok) browserLocalError = st.error || 'NAVIGATE_FAILED';
    else if (browserViewEl) browserViewEl.focus({ preventScroll: true });
    browserRefresh();
  }
  if (browserStartBtn) browserStartBtn.addEventListener('click', async function () {
    browserStartBtn.blur();
    const v = browserViewSize();
    if (v) browserViewport = v;
    const body = { headless: true };
    if (v) { body.width = v.width; body.height = v.height; }
    const typed = browserGoTarget(rcbUrlInput ? rcbUrlInput.value : '');
    if (typed) body.url = typed;
    const st = await browserApi('/api/browser/start', body);
    if (!st.ok) browserLocalError = st.error || 'START_FAILED';
    else {
      if (st.viewport) browserViewport = st.viewport;
      if (browserViewEl) browserViewEl.focus({ preventScroll: true });
    }
    browserFreshNext = true;
    browserRefresh();
  });
  if (rcbGoBtn) rcbGoBtn.addEventListener('click', function () { rcbGoBtn.blur(); browserGoFromBar(); });
  if (rcbUrlInput) rcbUrlInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); browserGoFromBar(); }
  });
  if (browserTakeControlBtn) browserTakeControlBtn.addEventListener('click', function () {
    browserTakeControlBtn.blur();
    browserSetBanner({ state: 'user-control', running: true, url: rcbUrlInput ? rcbUrlInput.value : '', title: '', pending: [] });
    browserApi('/api/browser/take-control', {}).then(function () { browserRefresh(); });
  });
  if (browserDoneBtn) browserDoneBtn.addEventListener('click', async function () {
    browserDoneBtn.blur();
    await browserApi('/api/browser/done', {});
    browserRefresh();
  });
  if (browserStopBtn) browserStopBtn.addEventListener('click', async function () {
    browserStopBtn.blur();
    await browserApi('/api/browser/stop', {});
    browserRefresh();
  });
  if (browserToolbarEl) {
    browserToolbarEl.addEventListener('click', function (e) {
      const b = e.target && e.target.closest ? e.target.closest('.browser-btn') : null;
      if (b) b.blur();
    });
  }
  if (browserTabNewBtn) browserTabNewBtn.addEventListener('click', function () {
    browserTabNewBtn.blur();
    browserNewTab();
  });
  if (browserShotImg) {
    browserShotImg.addEventListener('load', function () {
      if (browserShotImg.naturalWidth > 0 && browserShotImg.naturalHeight > 0) {
        browserShotViewport = { width: browserShotImg.naturalWidth, height: browserShotImg.naturalHeight };
      }
      browserRenderScrollbar();
    });
    browserShotImg.addEventListener('click', async function (e) {
      const pt = browserPageFromClient(e.clientX, e.clientY);
      if (!pt) return;
      browserShowCursor(e.clientX, e.clientY);
      browserPulseCursor();
      if (browserViewEl) browserViewEl.focus({ preventScroll: true });
      if (browserEngineApi >= 2) {
        if (browserClickTimer) {
          clearTimeout(browserClickTimer);
          browserClickTimer = null;
          browserFreshNext = true;
          const st = await browserApi('/api/browser/pointer', { x: pt.x, y: pt.y, dblclick: true });
          if (st && st.focused) browserSetCursorShape(st.focused.editable);
          browserRefresh();
        } else {
          browserClickPending = pt;
          browserClickTimer = setTimeout(async function () {
            browserClickTimer = null;
            const send = browserClickPending;
            browserClickPending = null;
            if (!send) return;
            browserFreshNext = true;
            const st = await browserApi('/api/browser/pointer', { x: send.x, y: send.y });
            if (st && st.focused) browserSetCursorShape(st.focused.editable);
            browserRefresh();
          }, 220);
        }
      } else {
        browserFreshNext = true;
        await browserApi('/api/browser/pointer', { x: pt.x, y: pt.y });
        browserRefresh();
      }
    });
  }
  if (browserViewEl) {
    browserViewEl.addEventListener('wheel', function (e) {
      if (!browserRunning || !browserTabs.length) return;
      e.preventDefault();
      browserApi('/api/browser/wheel', { deltaY: Math.round(e.deltaY) });
      browserFreshNext = true;
      browserScheduleRefresh(120);
    }, { passive: false });
    browserViewEl.addEventListener('mousemove', function (e) {
      if (!browserRunning || !browserTabs.length) { browserHideCursor(); return; }
      browserShowCursor(e.clientX, e.clientY);
      if (browserEngineApi >= 2) {
        const pt = browserPageFromClient(e.clientX, e.clientY);
        if (pt) {
          browserMoveQueued = pt;
          if (!browserMoveTimer) {
            browserMoveTimer = setTimeout(function () {
              browserMoveTimer = null;
              if (browserMoveQueued) { browserApi('/api/browser/move', browserMoveQueued); browserMoveQueued = null; }
            }, 40);
          }
        }
      }
    });
    browserViewEl.addEventListener('mouseleave', function () { browserHideCursor(); });
    browserViewEl.addEventListener('pointerdown', function () {
      if (browserViewEl) browserViewEl.focus({ preventScroll: true });
    });
  }
  function browserScrollDragMove(e) {
    if (!browserScrollDrag) return;
    const d = browserScrollDrag;
    const avail = Math.max(1, d.trackHeight - d.thumbH);
    let ratio = (e.clientY - d.trackTop - d.offsetY) / avail;
    ratio = Math.max(0, Math.min(1, ratio));
    if (browserScrollbarThumbEl) browserScrollbarThumbEl.style.top = Math.floor(ratio * avail) + 'px';
    const y = Math.round(ratio * d.maxScroll);
    browserApi('/api/browser/scrollto', { x: 0, y: y });
    browserFreshNext = true;
    browserScheduleRefresh(120);
  }
  function browserScrollDragEnd() {
    browserScrollDrag = null;
    window.removeEventListener('pointermove', browserScrollDragMove);
    window.removeEventListener('pointerup', browserScrollDragEnd);
    window.removeEventListener('pointercancel', browserScrollDragEnd);
  }
  if (browserScrollbarThumbEl) {
    browserScrollbarThumbEl.addEventListener('pointerdown', function (e) {
      if (!browserScroll) return;
      e.preventDefault();
      const track = browserScrollbarEl.getBoundingClientRect();
      const thumb = browserScrollbarThumbEl.getBoundingClientRect();
      const maxScroll = Math.max(0, browserScroll.scrollHeight - browserScroll.innerHeight);
      browserScrollDrag = { offsetY: e.clientY - thumb.top, trackTop: track.top, trackHeight: track.height, thumbH: thumb.height, maxScroll: maxScroll };
      try { browserScrollbarThumbEl.setPointerCapture(e.pointerId); } catch (err) {}
      window.addEventListener('pointermove', browserScrollDragMove);
      window.addEventListener('pointerup', browserScrollDragEnd);
      window.addEventListener('pointercancel', browserScrollDragEnd);
    });
  }
  if (browserScrollbarEl) {
    browserScrollbarEl.addEventListener('pointerdown', function (e) {
      if (e.target !== browserScrollbarEl) return;
      if (!browserScroll) return;
      const track = browserScrollbarEl.getBoundingClientRect();
      const thumb = browserScrollbarThumbEl.getBoundingClientRect();
      const maxScroll = Math.max(0, browserScroll.scrollHeight - browserScroll.innerHeight);
      const page = browserScroll.innerHeight || 0;
      let y;
      if (e.clientY < thumb.top) y = Math.max(0, browserScroll.scrollY - page);
      else if (e.clientY > thumb.bottom) y = Math.min(maxScroll, browserScroll.scrollY + page);
      else return;
      browserApi('/api/browser/scrollto', { x: 0, y: y });
      browserFreshNext = true;
      browserScheduleRefresh(120);
    });
  }
  document.addEventListener('keydown', function (e) {
    if (!browserMainArea || browserMainArea.style.display === 'none') return;
    if (!browserRunning || !browserTabs.length) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (t && t.tagName === 'BUTTON') t.blur();
    if (e.metaKey || e.altKey) return;
    const SIMPLE_ALLOW = ['Enter', 'Backspace', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Delete', 'Escape', 'Home', 'End', 'PageUp', 'PageDown'];
    const COMBO_ALLOW = ['Control+A', 'Control+C', 'Control+V', 'Control+X', 'Control+Backspace', 'Control+Delete', 'Control+ArrowLeft', 'Control+ArrowRight', 'Control+ArrowUp', 'Control+ArrowDown', 'Shift+ArrowLeft', 'Shift+ArrowRight', 'Shift+ArrowUp', 'Shift+ArrowDown', 'Shift+Home', 'Shift+End'];
    if (e.ctrlKey) {
      const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      const key = 'Control+' + k;
      if (browserEngineApi >= 2 && COMBO_ALLOW.indexOf(key) !== -1) {
        e.preventDefault();
        browserApi('/api/browser/keyboard', { key: key });
        browserFreshNext = true;
        browserScheduleRefresh(100);
      }
      return;
    }
    if (e.shiftKey && SIMPLE_ALLOW.indexOf(e.key) !== -1) {
      if (browserEngineApi >= 2 && COMBO_ALLOW.indexOf('Shift+' + e.key) !== -1) {
        e.preventDefault();
        browserApi('/api/browser/keyboard', { key: 'Shift+' + e.key });
        browserFreshNext = true;
        browserScheduleRefresh(100);
      }
      return;
    }
    if (e.key.length === 1) {
      e.preventDefault();
      browserApi('/api/browser/keyboard', { text: e.key });
      browserFreshNext = true;
      browserScheduleRefresh(100);
    } else if (SIMPLE_ALLOW.indexOf(e.key) !== -1) {
      e.preventDefault();
      browserApi('/api/browser/keyboard', { key: e.key });
      browserFreshNext = true;
      browserScheduleRefresh(100);
    }
  });
  let browserResizeTimer = null;
  window.addEventListener('resize', function () {
    if (!browserMainArea || browserMainArea.style.display === 'none') return;
    clearTimeout(browserResizeTimer);
    browserResizeTimer = setTimeout(function () { browserSendViewport(); }, 300);
  });
  // BROWSER-UI-END
  if (btnNavChat) btnNavChat.addEventListener('click', showChats);
  if (btnConnectorsBack) btnConnectorsBack.addEventListener('click', showChats);
  if (btnNavSearch) btnNavSearch.addEventListener('click', () => showDummyPage(sidebarSearch, btnNavSearch));
  if (btnNavNotes) btnNavNotes.addEventListener('click', () => showDocs('artefacts'));
  if (btnNavTasks) btnNavTasks.addEventListener('click', () => showDummyPage(sidebarTasks, btnNavTasks));
  if (btnSearchBack) btnSearchBack.addEventListener('click', showChats);
  if (btnNotesBack) btnNotesBack.addEventListener('click', showChats);
  if (btnTasksBack) btnTasksBack.addEventListener('click', showChats);
  // DOCS-START (2026-11-03): Documents & Notes pages (Artefacts / Skills / Files).
  // Real data only, from GET /api/library. Artefacts delete wired (2026-11-04):
  // Select -> Delete calls POST /api/library/delete; skills/files stay read-only.
  const docsTitle = document.getElementById('docsTitle');
  const docsGrid = document.getElementById('docsGrid');
  const docsDetail = document.getElementById('docsDetail');
  const docsNotice = document.getElementById('docsNotice');
  const docsRecentTitle = document.getElementById('docsRecentTitle');
  const docsSearchInput = document.getElementById('docsSearchInput');
  const docsSelectBtn = document.getElementById('docsSelectBtn');
  const docsDeleteBtn = document.getElementById('docsDeleteBtn');
  const docsFilterBtn = document.getElementById('docsFilterBtn');
  const docsSortMenu = document.getElementById('docsSortMenu');
  const docsCreateBtn = document.getElementById('docsCreateBtn');
  let docsData = null;
  let docsPage = 'artefacts';
  let docsQuery = '';
  let docsSort = 'newest';
  let docsSelecting = false;
  const docsSelected = new Set();
  const DOCS_TITLES = { artefacts: 'All artefacts', skills: 'Skills', files: 'Files' };
  function docsRel(iso) {
    if (!iso) return '';
    const t = new Date(iso).getTime();
    if (!t) return '';
    const diff = Date.now() - t;
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return min + 'm ago';
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr + 'h ago';
    const day = Math.floor(hr / 24);
    if (day < 7) {
      const d = new Date(iso);
      return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
    }
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function docsFmtSize(n) {
    if (n == null) return '';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }
  function docsEsc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function docsSortItems(items) {
    const arr = items.slice();
    if (docsSort === 'name') arr.sort((a, b) => (a.sortName < b.sortName ? -1 : 1));
    else if (docsSort === 'oldest') arr.sort((a, b) => (a.mtime || '') < (b.mtime || '') ? -1 : 1);
    else arr.sort((a, b) => (a.mtime || '') > (b.mtime || '') ? -1 : 1);
    return arr;
  }
  function docsMatch(name) {
    if (!docsQuery) return true;
    return String(name).toLowerCase().indexOf(docsQuery) !== -1;
  }
  function docsShowNotice(msg) {
    docsNotice.textContent = msg;
    docsNotice.style.display = 'block';
  }
  function docsRender() {
    if (!docsData) { docsGrid.innerHTML = '<p class="docs-empty">Loading…</p>'; return; }
    docsNotice.style.display = 'none';
    docsDetail.style.display = 'none';
    docsGrid.style.display = '';
    if (docsRecentTitle) docsRecentTitle.style.display = '';
    docsTitle.textContent = DOCS_TITLES[docsPage] || 'All artefacts';
    if (docsPage === 'artefacts') {
      docsCreateBtn.textContent = '+ Create an artefact';
      docsCreateBtn.className = 'docs-create-btn blue';
    } else {
      docsCreateBtn.textContent = 'Add Skills';
      docsCreateBtn.className = 'docs-create-btn red';
    }
    document.querySelectorAll('.docs-nav-item').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-docs-page') === docsPage);
    });
    docsSelectBtn.textContent = docsSelected.size ? docsSelected.size + ' selected' : 'Select';
    docsSelectBtn.classList.toggle('active', docsSelecting);
    if (docsDeleteBtn) {
      const showDelete = docsPage === 'artefacts' && docsSelected.size > 0;
      docsDeleteBtn.style.display = showDelete ? '' : 'none';
      docsDeleteBtn.textContent = 'Delete (' + docsSelected.size + ')';
    }
    if (docsPage === 'artefacts') {
      const items = docsSortItems(docsData.sites.filter(s => docsMatch(s.title) || docsMatch(s.name)).map(s => ({
        sortName: (s.title || s.name).toLowerCase(), mtime: s.mtime, key: 'site:' + s.name, name: s.title || s.name, sub: 'Artefact · ' + docsRel(s.mtime), url: s.url, preview: s.preview
      })));
      if (!items.length) { docsGrid.innerHTML = '<p class="docs-empty">No artefacts yet. Built websites will appear here.</p>'; return; }
      docsGrid.className = 'docs-cards-grid' + (docsSelecting ? ' docs-selecting' : '');
      docsGrid.innerHTML = items.map(it => {
        const checked = docsSelected.has(it.key) ? 'checked' : '';
        const prev = it.preview ? '<img src="' + docsEsc(it.preview) + '" alt="">' : '<span class="docs-card-preview-empty">No preview</span>';
        return '<article class="docs-card" data-docs-key="' + docsEsc(it.key) + '" data-docs-url="' + docsEsc(it.url) + '">'
          + '<input type="checkbox" class="docs-card-check" ' + checked + ' data-docs-check="' + docsEsc(it.key) + '">'
          + '<div class="docs-card-preview">' + prev + '</div>'
          + '<div class="docs-card-body"><h3 class="docs-card-title">' + docsEsc(it.name) + '</h3>'
          + '<p class="docs-card-sub">' + docsEsc(it.sub) + '</p></div></article>';
      }).join('');
      docsGrid.querySelectorAll('.docs-card').forEach(card => {
        card.addEventListener('click', () => {
          const key = card.getAttribute('data-docs-key');
          if (docsSelecting) {
            if (docsSelected.has(key)) docsSelected.delete(key); else docsSelected.add(key);
            docsRender();
            return;
          }
          window.open(card.getAttribute('data-docs-url'), '_blank', 'noopener');
        });
      });
      return;
    }
    if (docsPage === 'skills') {
      const items = docsSortItems(docsData.skills.filter(s => docsMatch(s.name)).map(s => ({
        sortName: s.name.toLowerCase(), mtime: s.mtime, key: 'skill:' + s.name, name: s.name
      })));
      docsRenderFolders(items);
      return;
    }
    const folders = [];
    docsData.sites.forEach(s => { folders.push({ sortName: s.name.toLowerCase(), mtime: s.mtime, key: 'site:' + s.name, name: s.name }); });
    docsData.skills.forEach(s => { folders.push({ sortName: s.name.toLowerCase(), mtime: s.mtime, key: 'skill:' + s.name, name: s.name }); });
    if (docsData.outputs.length) folders.push({ sortName: 'slash-outputs', mtime: docsData.outputs[0].mtime, key: 'outputs:', name: 'slash-outputs' });
    docsRenderFolders(docsSortItems(folders.filter(f => docsMatch(f.name))));
  }
  function docsRenderFolders(items) {
    if (!items.length) { docsGrid.innerHTML = '<p class="docs-empty">Nothing here yet.</p>'; return; }
    docsGrid.className = 'docs-folders-grid' + (docsSelecting ? ' docs-selecting' : '');
    docsGrid.innerHTML = items.map(it => {
      const checked = docsSelected.has(it.key) ? 'checked' : '';
      return '<button type="button" class="docs-folder" data-docs-key="' + docsEsc(it.key) + '">'
        + '<input type="checkbox" class="docs-folder-check" ' + checked + ' data-docs-check="' + docsEsc(it.key) + '">'
        + '<img src="assets/folder-icon.svg" alt="">'
        + '<div class="docs-folder-name">' + docsEsc(it.name) + '</div></button>';
    }).join('');
    docsGrid.querySelectorAll('.docs-folder').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-docs-key');
        if (docsSelecting) {
          if (docsSelected.has(key)) docsSelected.delete(key); else docsSelected.add(key);
          docsRender();
          return;
        }
        docsOpenFolder(key);
      });
    });
  }
  function docsOpenFolder(key) {
    const idx = key.indexOf(':');
    const kind = key.slice(0, idx);
    const name = key.slice(idx + 1);
    let files = [];
    let title = name;
    let sub = '';
    if (kind === 'skill') {
      const s = (docsData.skills || []).find(x => x.name === name);
      if (!s) return;
      files = s.files || [];
      sub = (s.description ? s.description : 'Skill') + ' · ' + files.length + ' files';
    } else if (kind === 'site') {
      const s = (docsData.sites || []).find(x => x.name === name);
      if (!s) return;
      files = s.files || [];
      title = s.title || s.name;
      sub = 'Website · ' + files.length + ' files';
    } else {
      files = (docsData.outputs || []).map(o => ({ path: o.name, size: o.size, mtime: o.mtime, url: o.url }));
      title = 'slash-outputs';
      sub = files.length + ' files';
    }
    docsGrid.style.display = 'none';
    if (docsRecentTitle) docsRecentTitle.style.display = 'none';
    docsDetail.style.display = '';
    const TEXT_EXT = ['.md', '.txt', '.json', '.html', '.js', '.css'];
    const rows = files.map(f => {
      const dot = f.path.lastIndexOf('.');
      const ext = dot >= 0 ? f.path.slice(dot).toLowerCase() : '';
      let open = '';
      if (kind === 'site' && f.path === 'index.html') open = '<a class="docs-file-open" href="/sites/' + encodeURIComponent(name) + '/" target="_blank" rel="noopener">Open</a>';
      else if (kind === 'skill' && TEXT_EXT.indexOf(ext) !== -1) open = '<a class="docs-file-open" href="/api/workspace/file?path=' + encodeURIComponent('skills/' + name + '/' + f.path) + '" target="_blank" rel="noopener">Open</a>';
      else if (kind === 'outputs') open = '<a class="docs-file-open" href="' + docsEsc(f.url) + '" target="_blank" rel="noopener">Open</a>';
      return '<div class="docs-file-row"><span class="docs-file-name">' + docsEsc(f.path) + '</span>'
        + '<span class="docs-file-meta">' + docsEsc(docsFmtSize(f.size)) + ' · ' + docsEsc(docsRel(f.mtime)) + '</span>' + open + '</div>';
    }).join('') || '<p class="docs-empty">This folder is empty.</p>';
    docsDetail.innerHTML = '<button type="button" class="docs-back-btn" id="docsBackBtn">← Back</button>'
      + '<h2 class="docs-detail-title">' + docsEsc(title) + '</h2>'
      + '<p class="docs-detail-sub">' + docsEsc(sub) + '</p>' + rows;
    document.getElementById('docsBackBtn').addEventListener('click', () => { docsRender(); });
  }
  async function docsLoad() {
    try {
      const r = await fetch('/api/library');
      const j = await r.json();
      if (j && j.ok) { docsData = j; docsRender(); return; }
      docsGrid.innerHTML = '<p class="docs-empty">Could not load library data.</p>';
    } catch (e) {
      docsGrid.innerHTML = '<p class="docs-empty">Could not load library data.</p>';
    }
  }
  function showDocs(page) {
    docsPage = page || 'artefacts';
    if (mainChatArea) mainChatArea.style.display = 'none';
    if (rightPanel) rightPanel.style.display = 'none';
    sidebarChats.style.display = 'none';
    sidebarConnectors.style.display = 'none';
    dummySidebars.forEach(s => { if (s) s.style.display = 'none'; });
    if (browserMainArea) browserMainArea.style.display = 'none';
    if (sidebarNotes) sidebarNotes.style.display = 'flex';
    if (docsMainArea) docsMainArea.style.display = 'flex';
    if (mcpMainArea) mcpMainArea.style.display = 'none';
    document.body.classList.remove('mcp-page-open');
    btnNavChat.classList.remove('active');
    btnNavConnectors.classList.remove('active');
    dummyNavBtns.forEach(b => { if (b) b.classList.remove('active'); });
    if (btnNavNotes) btnNavNotes.classList.add('active');
    if (btnNavBrowser) btnNavBrowser.classList.remove('active');
    if (!docsData) docsLoad(); else docsRender();
    if (location.hash !== '#docs-' + docsPage) history.replaceState(null, '', '#docs-' + docsPage);
  }
  document.querySelectorAll('.docs-nav-item').forEach(b => {
    b.addEventListener('click', () => { docsSelected.clear(); showDocs(b.getAttribute('data-docs-page')); });
  });
  if (docsSearchInput) docsSearchInput.addEventListener('input', () => { docsQuery = docsSearchInput.value.trim().toLowerCase(); docsRender(); });
  if (docsSelectBtn) docsSelectBtn.addEventListener('click', () => {
    docsSelecting = !docsSelecting;
    if (!docsSelecting) docsSelected.clear();
    docsRender();
  });
  if (docsDeleteBtn) docsDeleteBtn.addEventListener('click', async () => {
    if (docsPage !== 'artefacts' || !docsSelected.size) return;
    const names = Array.from(docsSelected).map(k => k.replace(/^site:/, ''));
    if (!confirm('Delete ' + names.length + ' artefact(s)?\n' + names.join(', ') + '\nThis removes the built site folders and cannot be undone.')) return;
    try {
      const r = await fetch('/api/library/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ names: names }) });
      const j = await r.json();
      if (j && j.ok) {
        docsSelected.clear();
        docsSelecting = false;
        await docsLoad();
        docsShowNotice('Deleted ' + (j.deleted ? j.deleted.length : 0) + ' artefact(s).');
        return;
      }
      docsShowNotice('Delete failed — please try again.');
    } catch (e) {
      docsShowNotice('Delete failed — please try again.');
    }
  });
  if (docsFilterBtn) docsFilterBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    docsSortMenu.style.display = docsSortMenu.style.display === 'none' ? 'flex' : 'none';
  });
  document.querySelectorAll('#docsSortMenu button').forEach(b => {
    b.addEventListener('click', () => { docsSort = b.getAttribute('data-sort'); docsSortMenu.style.display = 'none'; docsRender(); });
  });
  document.addEventListener('click', (e) => {
    if (docsSortMenu && docsSortMenu.style.display !== 'none' && !docsSortMenu.contains(e.target) && e.target !== docsFilterBtn) docsSortMenu.style.display = 'none';
  });
  if (docsCreateBtn) docsCreateBtn.addEventListener('click', () => {
    if (docsPage === 'artefacts') {
      showChats();
      if (chatInput) {
        chatInput.value = 'create artifact ';
        chatInput.dispatchEvent(new Event('input', { bubbles: true }));
        chatInput.focus();
      }
      return;
    }
    docsShowNotice('Add Skills (GitHub link, pasted skill text, scan gate, install) arrives in the next slice — this button is intentionally not wired yet.');
  });
  if (window.location.hash.indexOf('#docs-') === 0) {
    const p = window.location.hash.replace('#docs-', '');
    if (p === 'artefacts' || p === 'skills' || p === 'files') showDocs(p);
  }
  window.addEventListener('hashchange', () => {
    if (window.location.hash.indexOf('#docs-') === 0) {
      const p = window.location.hash.replace('#docs-', '');
      if (p === 'artefacts' || p === 'skills' || p === 'files') showDocs(p);
    }
  });
  // DOCS-END


  // --- Right Panel Lottie Mascot Trio (Red, Yellow, Blue Cats) ---
  // 6 Built-in Multi-State 60-frame Animation Segments (512x512 @ 60 FPS):
  // - idle:    Frames [0, 59]   (Floating, blinking with 3D furry eyelids)
  // - working: Frames [60, 119] (3D mini laptop + Red/Yellow/Blue bouncing dots thought cloud)
  // - coffee:  Frames [120, 179] (Color-matched steaming 3D coffee mug sipping)
  // - angry:   Frames [180, 239] (Furrowed eyebrows, anger symbol 💢, fiery head shake)
  // - happy:   Frames [240, 299] (Joyful bouncy jump, pink blush, floating 3D heart & sparkles)
  // - hat:     Frames [300, 359] (Cute 3D cap/beanie with fluffy pom-pom spring bounce)
  const LOTTIE_STATE_FRAMES = {
    idle: [0, 59],
    working: [60, 119],
    coffee: [120, 179],
    angry: [180, 239],
    happy: [240, 299],
    hat: [300, 359],
  };

  let currentLottieState = 'idle';
  let lottieIdleTimer = null;
  let lottieTempTimer = null;

  function initRightPanelLottieCats() {
    const yellowEl = document.getElementById('lottieCatYellow');
    const redEl = document.getElementById('lottieCatRed');
    const blueEl = document.getElementById('lottieCatBlue');
    const trioWrap = document.getElementById('avatarLottieTrio');

    if (!window.lottie || !yellowEl || !redEl || !blueEl) return;

    let yellowAnim = null;
    let redAnim = null;
    let blueAnim = null;

    function applySegments(stateName) {
      currentLottieState = stateName;
      const seg = LOTTIE_STATE_FRAMES[stateName] || LOTTIE_STATE_FRAMES.idle;
      if (yellowAnim) yellowAnim.playSegments(seg, true);
      if (redAnim) redAnim.playSegments(seg, true);
      if (blueAnim) blueAnim.playSegments(seg, true);
    }

    try {
      yellowAnim = window.lottie.loadAnimation({
        container: yellowEl,
        renderer: 'svg',
        loop: true,
        autoplay: false,
        path: '/lottie-animations/yellow-cat.json',
      });
      yellowAnim.addEventListener('DOMLoaded', () => {
        const seg = LOTTIE_STATE_FRAMES[currentLottieState] || LOTTIE_STATE_FRAMES.idle;
        yellowAnim.playSegments(seg, true);
      });
    } catch (e) {
      console.warn('Failed to load yellow cat lottie:', e);
    }

    try {
      redAnim = window.lottie.loadAnimation({
        container: redEl,
        renderer: 'svg',
        loop: true,
        autoplay: false,
        path: '/lottie-animations/red-cat.json',
      });
      redAnim.addEventListener('DOMLoaded', () => {
        try { window._redCatAnimData = redAnim.animationData; } catch (e) {}
        const seg = LOTTIE_STATE_FRAMES[currentLottieState] || LOTTIE_STATE_FRAMES.idle;
        redAnim.playSegments(seg, true);
      });
    } catch (e) {
      console.warn('Failed to load red cat lottie:', e);
    }

    try {
      blueAnim = window.lottie.loadAnimation({
        container: blueEl,
        renderer: 'svg',
        loop: true,
        autoplay: false,
        path: '/lottie-animations/blue-cat.json',
      });
      blueAnim.addEventListener('DOMLoaded', () => {
        const seg = LOTTIE_STATE_FRAMES[currentLottieState] || LOTTIE_STATE_FRAMES.idle;
        blueAnim.playSegments(seg, true);
      });
    } catch (e) {
      console.warn('Failed to load blue cat lottie:', e);
    }

    // 15-second idle timer -> automatically switch to 'coffee'
    function startIdleTimer() {
      if (lottieIdleTimer) clearTimeout(lottieIdleTimer);
      lottieIdleTimer = setTimeout(() => {
        if (currentLottieState === 'idle') {
          applySegments('coffee');
        }
      }, 15000);
    }

    function setState(newState, durationMs) {
      if (lottieTempTimer) {
        clearTimeout(lottieTempTimer);
        lottieTempTimer = null;
      }
      if (lottieIdleTimer) {
        clearTimeout(lottieIdleTimer);
        lottieIdleTimer = null;
      }

      applySegments(newState);

      if (durationMs) {
        lottieTempTimer = setTimeout(() => {
          applySegments('idle');
          startIdleTimer();
        }, durationMs);
      } else if (newState === 'idle') {
        startIdleTimer();
      }
    }

    window.setLottieAgentState = setState;

    // Start initial 15-second timer
    startIdleTimer();

    // Click/Tap on Avatar Trio toggles 'hat'
    if (trioWrap) {
      trioWrap.addEventListener('click', () => {
        if (currentLottieState === 'hat') {
          setState('idle');
        } else {
          setState('hat');
        }
      });
    }

    // Hover acceleration
    const cats = [
      { el: yellowEl, getAnim: () => yellowAnim },
      { el: redEl, getAnim: () => redAnim },
      { el: blueEl, getAnim: () => blueAnim },
    ];

    cats.forEach(({ el, getAnim }) => {
      if (!el) return;
      el.addEventListener('mouseenter', () => {
        const a = getAnim();
        if (a) a.setSpeed(1.45);
      });
      el.addEventListener('mouseleave', () => {
        const a = getAnim();
        if (a) a.setSpeed(1.0);
      });
    });

    // Lifecycle state connector
    window.set3DCatsThinkingState = function (thinking, statusType) {
      if (thinking) {
        // AI is thinking, searching, calling tools, or streaming -> 'working' (shows laptop + cloud)
        setState('working');
      } else {
        if (statusType === 'error') {
          // API error / network timeout / invalid input -> 'angry' for 3s
          setState('angry', 3000);
        } else if (statusType === 'happy' || statusType === 'done') {
          // Task complete / response finished -> 'happy' for 3s before idle
          setState('happy', 3000);
        } else {
          setState('idle');
        }
      }
    };

    // Chat input typing detection: if waiting with coffee, user typing wakes up cat to idle
    if (chatInput) {
      chatInput.addEventListener('input', () => {
        if (chatInput.value.trim().length > 0) {
          if (currentLottieState === 'coffee') {
            setState('idle');
          }
        }
      });
    }
  }

  // Initialize Right Panel Lottie Cats
  initRightPanelLottieCats();

});

