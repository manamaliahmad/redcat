// depth-portrait-scroll template — main.js
// The agent edits src/config.json ONLY. This file is fixed and tested.
// Modes: depth (photo + depth map shader) -> flat-tilt (photo only) ->
// fallback (plain image + CSS parallax when WebGL is unavailable).
import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import config from './config.json';

gsap.registerPlugin(ScrollTrigger);

const root = document.documentElement;
const palette = config.palette || {};
for (const [key, value] of Object.entries(palette)) {
  root.style.setProperty('--' + key, value);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el && value) el.textContent = value;
}
setText('nav-name', config.name);
setText('hero-name', config.name);
setText('hero-tagline', config.tagline);
setText('about-text', config.about);
setText('foot-name', config.name);
const list = document.getElementById('project-list');
if (list && Array.isArray(config.projects)) {
  for (const p of config.projects) {
    const div = document.createElement('div');
    div.className = 'project';
    const h3 = document.createElement('h3');
    h3.textContent = p.title || '';
    const text = document.createElement('p');
    text.textContent = p.text || '';
    div.appendChild(h3);
    div.appendChild(text);
    list.appendChild(div);
  }
}

const wrap = document.getElementById('portrait-wrap');
const canvas = document.getElementById('portrait-canvas');
const fallbackImg = document.getElementById('portrait-fallback');
if (fallbackImg && config.photo) fallbackImg.src = config.photo;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const liteMode = window.innerWidth < 700;
const intensity = (config.scroll && typeof config.scroll.intensity === 'number')
  ? config.scroll.intensity : 0.6;
const cameraPath = (config.scroll && config.scroll.cameraPath) || 'orbit-slow';

function enableFallback(reason) {
  console.warn('[depth-portrait] fallback mode: ' + reason);
  document.body.classList.add('no-webgl');
  // CSS parallax on the fallback image (mouse only, desktop only).
  if (!reducedMotion && !liteMode) {
    window.addEventListener('mousemove', (e) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 16;
      const y = (e.clientY / window.innerHeight - 0.5) * 16;
      fallbackImg.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(1.05)';
    });
  }
}

async function start() {
  let renderer = null;
  // Three logs 'Error creating WebGL context' to console.error when
  // WebGL is unavailable. That error is EXPECTED here (it is the reason
  // we fall back), so swallow exactly that message during construction
  // and restore console.error immediately after. Any other error still
  // surfaces, and the fallback branch is still proven by check.js.
  const origConsoleError = console.error;
  console.error = function () {
    const text = Array.prototype.map.call(arguments, String).join(' ');
    if (text.indexOf('Error creating WebGL context') !== -1) return;
    origConsoleError.apply(console, arguments);
  };
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (e) {
    console.error = origConsoleError;
    enableFallback('WebGL unavailable: ' + (e && e.message ? e.message : e));
    return;
  }
  console.error = origConsoleError;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, liteMode ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const loader = new THREE.TextureLoader();
  let photoTex = null;
  try {
    photoTex = await loader.loadAsync(config.photo);
  } catch (e) {
    console.error('[depth-portrait] photo failed to load: ' + config.photo);
    enableFallback('photo failed to load');
    return;
  }
  photoTex.colorSpace = THREE.SRGBColorSpace;

  // Depth texture is optional: missing depth -> flat-tilt mode.
  let depthTex = null;
  if (config.depth) {
    try {
      depthTex = await loader.loadAsync(config.depth);
    } catch (e) {
      console.warn('[depth-portrait] depth map missing, using flat-tilt mode');
      depthTex = null;
    }
  }

  const imgW = photoTex.image ? photoTex.image.width : 1;
  const imgH = photoTex.image ? photoTex.image.height : 1;
  const aspect = imgW / Math.max(imgH, 1);
  if (wrap) wrap.style.aspectRatio = aspect.toFixed(3);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
  camera.position.z = 3.2;

  const segments = liteMode ? 48 : 128;
  const geometry = new THREE.PlaneGeometry(2 * aspect, 2, segments, segments);
  let material = null;
  let depthMode = false;
  if (depthTex) {
    depthMode = true;
    material = new THREE.ShaderMaterial({
      uniforms: {
        uPhoto: { value: photoTex },
        uDepth: { value: depthTex },
        uMouse: { value: new THREE.Vector2(0, 0) },
        uScroll: { value: 0 },
        uIntensity: { value: intensity },
      },
      vertexShader: [
        'varying vec2 vUv;',
        'uniform sampler2D uDepth;',
        'uniform vec2 uMouse;',
        'uniform float uScroll;',
        'uniform float uIntensity;',
        'void main() {',
        '  vUv = uv;',
        '  float d = texture2D(uDepth, uv).r;',
        '  vec3 p = position;',
        '  p.z += d * uIntensity;',
        '  p.xy += (uMouse * 0.08) * d;',
        '  p.y += uScroll * 0.1 * d;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);',
        '}',
      ].join('\n'),
      fragmentShader: [
        'varying vec2 vUv;',
        'uniform sampler2D uPhoto;',
        'void main() { gl_FragColor = texture2D(uPhoto, vUv); }',
      ].join('\n'),
    });
  } else {
    material = new THREE.MeshBasicMaterial({ map: photoTex });
  }
  const plane = new THREE.Mesh(geometry, material);
  scene.add(plane);

  function resize() {
    const w = wrap ? wrap.clientWidth : window.innerWidth;
    const h = wrap ? wrap.clientHeight : window.innerHeight;
    if (w > 0 && h > 0) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }
  resize();
  window.addEventListener('resize', resize);

  const state = { scroll: 0, mouseX: 0, mouseY: 0, tx: 0, ty: 0 };
  if (!reducedMotion && !liteMode) {
    window.addEventListener('mousemove', (e) => {
      state.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      state.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    });
  }
  if (!reducedMotion && cameraPath !== 'none') {
    ScrollTrigger.create({
      trigger: document.body,
      start: 'top top',
      end: 'bottom bottom',
      scrub: true,
      onUpdate: (self) => { state.scroll = self.progress; },
    });
  }

  function frame() {
    state.mouseX += (state.tx - state.mouseX) * 0.05;
    state.mouseY += (state.ty - state.mouseY) * 0.05;
    if (depthMode) {
      material.uniforms.uMouse.value.set(state.mouseX, -state.mouseY);
      material.uniforms.uScroll.value = state.scroll;
    } else {
      plane.rotation.y = state.mouseX * 0.08 + state.scroll * 0.2;
      plane.rotation.x = -state.mouseY * 0.05;
    }
    if (cameraPath === 'push-in') {
      camera.position.z = 3.2 - state.scroll * 0.7;
    } else if (cameraPath === 'orbit-slow') {
      camera.position.x = Math.sin(state.scroll * 1.2) * 0.25;
      camera.lookAt(0, 0, 0);
    }
    renderer.render(scene, camera);
  }
  if (reducedMotion) {
    frame();
  } else {
    renderer.setAnimationLoop(frame);
  }
  console.log('[depth-portrait] started mode=' + (depthMode ? 'depth' : 'flat-tilt') + ' lite=' + liteMode);
}

start();
