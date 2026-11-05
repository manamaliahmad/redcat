/**
 * AI Providers & Models Registry
 * Adding a provider later means editing one array entry only.
 * Each provider entry has: id, name, keyUrl, needsKey (true/false), models[].
 */

const providers = [
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
    modelNotes: {
      'qwen3-coder': 'Text-only — no vision'
    }
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

if (typeof window !== 'undefined') {
  window.AI_PROVIDERS = providers;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { providers };
}

