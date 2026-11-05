'use strict';
// vision.js — RedCat VISION slice (ADDITIVE module, VISION-tagged).
// Pure helpers, requireable in tests: no server, no disk, no logging.
// Images are validated here, attached to the outbound model request only,
// and NEVER persisted to run files or logs (the run keeps them in server
// memory only, for the lifetime of the run).
//
// Model capability table (provider docs):
//  - deepseek + flash model (DeepSeek V4.1 Flash, the vision-capable flash
//    line) — OpenAI-style image_url parts. DeepSeek V4 Pro and the old
//    deepseek-chat line have NO vision: they get text only.
//  - kimi + kimi-k3 model — OpenAI-style image_url parts.
//  - ollama + llava / moondream / *vision* model names — native images array.
//  - Everything else — text only (filenames/paths note, pixels not seen).

const MAX_IMAGES = 4;
const MAX_B64_CHARS = 1500000;

function isVisionModel(provider, model) {
  const p = String(provider || '').toLowerCase();
  const m = String(model || '').toLowerCase();
  if (p === 'deepseek') return /flash/.test(m);
  if (p === 'kimi') return /^kimi-k3/.test(m);
  if (p === 'ollama') return /llava|moondream|vision/.test(m);
  return false;
}

// Validate [{name, dataUrl}] -> {ok, images} or {ok:false, error, name}.
// Rejects: non-array, >4 images, non-image MIME, non-base64 payload,
// oversize payload. Fail closed: any bad image rejects the whole batch.
function validateImages(images) {
  if (!Array.isArray(images)) return { ok: false, error: 'IMAGES_NOT_ARRAY' };
  if (images.length === 0) return { ok: true, images: [] };
  if (images.length > MAX_IMAGES) return { ok: false, error: 'TOO_MANY_IMAGES' };
  const out = [];
  for (const im of images) {
    const name = String((im && im.name) || 'image').slice(0, 200);
    const dataUrl = String((im && im.dataUrl) || '');
    const mm = /^data:(image\/(png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!mm) return { ok: false, error: 'BAD_IMAGE_DATA', name: name };
    if (mm[3].length > MAX_B64_CHARS) return { ok: false, error: 'IMAGE_TOO_LARGE', name: name };
    out.push({ name: name, mime: mm[1].toLowerCase(), base64: mm[3], dataUrl: dataUrl });
  }
  return { ok: true, images: out };
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter(function (p) { return p && p.type === 'text'; }).map(function (p) { return p.text; }).join('\n');
  return '';
}

// Attach validated images to the LAST user message as OpenAI-style parts.
// Non-vision providers and empty image lists return messages unchanged
// (same array reference is fine: callers treat the result as read-only).
function applyToMessages(messages, provider, model, images) {
  if (!isVisionModel(provider, model) || !images || !images.length) return messages;
  const list = Array.isArray(messages) ? messages.slice() : [];
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i] && list[i].role === 'user') {
      const parts = [{ type: 'text', text: textOf(list[i].content) }];
      for (const im of images) parts.push({ type: 'image_url', image_url: { url: im.dataUrl } });
      list[i] = { role: 'user', content: parts };
      break;
    }
  }
  return list;
}

// Ollama native form: a parts message -> {role, content: text, images: [b64]}.
// String messages pass through untouched.
function toOllamaMessage(m) {
  if (!m || !Array.isArray(m.content)) return m;
  const images = [];
  const texts = [];
  for (const p of m.content) {
    if (p && p.type === 'image_url' && p.image_url && typeof p.image_url.url === 'string') {
      const mm = /^data:image\/[a-z]+;base64,(.+)$/.exec(p.image_url.url);
      if (mm) images.push(mm[1]);
    } else if (p && p.type === 'text') {
      texts.push(p.text);
    }
  }
  if (!images.length) return { role: m.role, content: texts.join('\n') };
  return { role: m.role, content: texts.join('\n'), images: images };
}

function toOllamaMessages(messages) {
  return (Array.isArray(messages) ? messages : []).map(toOllamaMessage);
}

module.exports = { MAX_IMAGES: MAX_IMAGES, MAX_B64_CHARS: MAX_B64_CHARS, isVisionModel: isVisionModel, validateImages: validateImages, applyToMessages: applyToMessages, toOllamaMessages: toOllamaMessages, textOf: textOf };
