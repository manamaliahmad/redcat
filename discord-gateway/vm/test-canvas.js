// Smoke test for the welcome card rendering (not part of the gateway).
// Tests: @napi-rs/canvas creation, text with the DejaVu font, avatar fetch
// from the Discord CDN + circular clip, PNG encode. Run on the VM only.
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const fs = require('fs');

async function main() {
  const W = 1200, H = 400;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#15151a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#e5484d';
  ctx.fillRect(0, 0, W, 10);
  ctx.fillRect(0, H - 10, W, 10);
  const ax = 140, ay = H / 2, ar = 95;
  // Try a real avatar image from the Discord CDN (default avatar 0).
  let avatar = null;
  try {
    const r = await fetch('https://cdn.discordapp.com/embed/avatars/0.png');
    if (!r.ok) throw new Error('cdn status ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    avatar = await loadImage(buf);
    console.log('avatar-ok bytes=' + buf.length);
  } catch (e) {
    console.log('avatar-fail ' + e.message + ' (using solid circle instead)');
  }
  ctx.save();
  ctx.beginPath(); ctx.arc(ax, ay, ar, 0, Math.PI * 2); ctx.clip();
  if (avatar) ctx.drawImage(avatar, ax - ar, ay - ar, ar * 2, ar * 2);
  else { ctx.fillStyle = '#e5484d'; ctx.fillRect(ax - ar, ay - ar, ar * 2, ar * 2); }
  ctx.restore();
  ctx.strokeStyle = '#e5484d'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(ax, ay, ar + 4, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 64px "DejaVu Sans", sans-serif';
  ctx.fillText('Welcome to RedCat', 280, 150);
  ctx.fillStyle = '#e5484d';
  ctx.font = 'bold 56px "DejaVu Sans", sans-serif';
  ctx.fillText('Test User', 280, 230);
  ctx.fillStyle = '#b0b0b8';
  ctx.font = '36px "DejaVu Sans", sans-serif';
  ctx.fillText('You are member #42', 280, 300);
  const buf = await canvas.encode('png');
  fs.writeFileSync('/home/ubuntu/redcat-gateway/test-card.png', buf);
  console.log('card-ok bytes=' + buf.length + ' size=' + W + 'x' + H);
}
main().catch((e) => { console.log('card-fail ' + e.message); process.exit(1); });
