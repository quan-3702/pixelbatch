// PixelBatch – batch image converter (runs fully in the browser, offline)
const $ = (id) => document.getElementById(id);
const items = []; // { id, file, url, src (decoded Blob), out, outName, dims, error, warn }
let nextId = 1;

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const HEIC_LIB = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
const PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52"><rect width="52" height="52" fill="#8884"/><text x="26" y="30" font-size="10" text-anchor="middle" fill="#888" font-family="sans-serif">HEIC</text></svg>');

function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

const isHeic = (f) => /\.(heic|heif)$/i.test(f.name) || /image\/hei[cf]/i.test(f.type);
const isImage = (f) => f && (f.type.startsWith('image/') || isHeic(f));

function settings() {
  const [rw, rh] = $('ratio').value.split(':').map(Number);
  return {
    type: $('format').value,
    quality: Number($('quality').value) / 100,
    target: $('compressMode').value === 'target' ? Math.max(5, Number($('targetKB').value) || 200) * 1024 : 0,
    mode: $('resizeMode').value,
    value: Math.max(1, Number($('resizeValue').value) || 1),
    ratio: rw / rh,
    exactW: Math.max(1, Number($('exactW').value) || 1),
    exactH: Math.max(1, Number($('exactH').value) || 1),
    anchor: $('anchor').value,
    bg: $('bg').value,
    pattern: $('pattern').value.trim() || '{name}',
    wm: {
      text: $('wmText').value.trim(),
      pos: $('wmPos').value,
      color: $('wmColor').value,
      size: Number($('wmSize').value) / 100,
      opacity: Number($('wmOpacity').value) / 100,
    },
  };
}

// ---------- Pro (Microsoft Store add-on via Digital Goods API) ----------
const FREE_LIMIT = 20;
const STORE_BILLING = 'https://store.microsoft.com/billing';
const PRO_SKU = 'pixelbatch_pro';
const PRO_IDS = [PRO_SKU, '9NJLTV15RX14']; // product ID or Store ID, whichever the Store reports
let proAvailable = false;
let proSku = PRO_SKU; // Pro limits apply only when the Store actually sells the add-on
const unlocked = () => isPro || !proAvailable;
const STORE_URL = 'https://apps.microsoft.com/detail/9P25KDSFDB0N';
let isPro = false;
try { isPro = localStorage.getItem('pixelbatch-pro') === '1'; } catch (_) {}

async function billing() {
  if (!('getDigitalGoodsService' in window)) return null;
  try { return await window.getDigitalGoodsService(STORE_BILLING); } catch (_) { return null; }
}

function setPro(v) {
  isPro = v;
  try { localStorage.setItem('pixelbatch-pro', v ? '1' : '0'); } catch (_) {}
  document.body.classList.toggle('is-pro', v);
  const b = $('proBtn');
  b.textContent = v ? '★ Pro' : '★ Get Pro';
  b.classList.toggle('is-pro', v);
  b.hidden = !proAvailable && !v;
  document.body.classList.toggle('pro-off', !proAvailable && !v);
}

async function checkPro() {
  const svc = await billing();
  if (!svc) return false;
  try {
    const details = await svc.getDetails(PRO_IDS).catch(() => []);
    proAvailable = details.length > 0;
    if (details[0]) proSku = details[0].itemId;
    const list = await svc.listPurchases();
    const owned = list.some((p) => PRO_IDS.includes(p.itemId));
    setPro(owned);
    return owned;
  } catch (_) { return isPro; }
}

function proMessage(text) {
  const m = $('proMsg');
  m.hidden = !text; m.textContent = text || '';
}

async function openPro(reason) {
  proMessage(reason || '');
  const svc = await billing();
  if (!svc) {
    $('buyBtn').textContent = 'Get PixelBatch on Microsoft Store';
    $('restoreBtn').hidden = true;
    if (!reason) proMessage('Pro is unlocked inside the PixelBatch app installed from Microsoft Store.');
  } else {
    $('restoreBtn').hidden = false;
    try {
      const [d] = await svc.getDetails([proSku]);
      const price = d && d.price ? new Intl.NumberFormat(undefined, { style: 'currency', currency: d.price.currency }).format(Number(d.price.value)) : '';
      $('buyBtn').textContent = price ? `Unlock Pro – ${price}` : 'Unlock Pro';
    } catch (_) { $('buyBtn').textContent = 'Unlock Pro'; }
  }
  if (!$('proDialog').open) $('proDialog').showModal();
}

async function buyPro() {
  const svc = await billing();
  if (!svc) { window.open(STORE_URL, '_blank'); return; }
  const methods = [{ supportedMethods: STORE_BILLING, data: { sku: proSku } }];
  try {
    let req;
    try { req = new PaymentRequest(methods); }
    catch (_) { req = new PaymentRequest(methods, { total: { label: 'Total', amount: { currency: 'USD', value: '0' } } }); }
    const res = await req.show();
    await res.complete('success');
  } catch (e) {
    if (e && e.name === 'AbortError') return; // user closed the purchase window
    proMessage('Purchase could not be completed: ' + (e.message || e));
    return;
  }
  if (await checkPro()) {
    proMessage('Thank you! Pro is unlocked. ★');
    setTimeout(() => $('proDialog').close(), 1500);
  }
}

// Returns true if the user may continue; otherwise opens the Pro dialog
function needsPro(s) {
  if (unlocked()) return false;
  const used = [];
  if (s.wm.text) used.push('watermark');
  if (s.pattern !== '{name}') used.push('batch rename');
  if (!used.length) return false;
  openPro(`${used.join(' and ')} ${used.length > 1 ? 'are' : 'is a'} Pro feature${used.length > 1 ? 's' : ''}. Unlock Pro, or clear ${used.length > 1 ? 'them' : 'it'} to continue for free.`);
  return true;
}

function drawWatermark(ctx, w, h, wm) {
  const fs = Math.max(10, Math.round(w * wm.size));
  ctx.save();
  ctx.globalAlpha = wm.opacity;
  ctx.font = `600 ${fs}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = wm.color;
  ctx.shadowColor = wm.color === '#ffffff' ? 'rgba(0,0,0,.45)' : 'rgba(255,255,255,.45)';
  ctx.shadowBlur = Math.max(2, fs / 8);
  const tw = ctx.measureText(wm.text).width, m = Math.round(w * 0.025);
  ctx.textBaseline = 'middle';
  if (wm.pos === 'tile') {
    ctx.translate(w / 2, h / 2); ctx.rotate(-Math.PI / 6);
    const stepX = tw + fs * 3, stepY = fs * 4, R = Math.hypot(w, h);
    for (let y = -R; y < R; y += stepY) for (let x = -R; x < R; x += stepX) ctx.fillText(wm.text, x + ((y / stepY) % 2 ? stepX / 2 : 0), y);
  } else {
    const x = { tl: m, bl: m, tr: w - tw - m, br: w - tw - m, c: (w - tw) / 2 }[wm.pos];
    const y = { tl: m + fs / 2, tr: m + fs / 2, bl: h - m - fs / 2, br: h - m - fs / 2, c: h / 2 }[wm.pos];
    ctx.fillText(wm.text, x, y);
  }
  ctx.restore();
}

// ---------- HEIC support (decoder is loaded only when needed, then cached for offline use) ----------
let heicLoading = null;
function loadHeicLib() {
  if (window.heic2any) return Promise.resolve();
  if (!heicLoading) {
    heicLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = HEIC_LIB;
      s.onload = () => resolve();
      s.onerror = () => { heicLoading = null; reject(new Error('HEIC support needs internet the first time')); };
      document.head.appendChild(s);
    });
  }
  return heicLoading;
}

async function sourceOf(item) {
  if (item.src) return item.src;
  if (!isHeic(item.file)) return (item.src = item.file);
  await loadHeicLib();
  const out = await window.heic2any({ blob: item.file, toType: 'image/png' });
  item.src = Array.isArray(out) ? out[0] : out;
  URL.revokeObjectURL(item.url);
  item.url = URL.createObjectURL(item.src);
  return item.src;
}

async function loadBitmap(blob) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(blob); } catch (_) { /* fall back */ }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unsupported or broken image'));
    img.src = URL.createObjectURL(blob);
  });
}

// ---------- Geometry: which part of the source to take, and how big the output is ----------
function cropBox(w, h, r, anchor) {
  let sw = w, sh = h;
  if (w / h > r) sw = h * r; else sh = w / r;
  let sx = (w - sw) / 2, sy = (h - sh) / 2;
  if (anchor === 'top') sy = 0;
  if (anchor === 'bottom') sy = h - sh;
  if (anchor === 'left') sx = 0;
  if (anchor === 'right') sx = w - sw;
  return { sx, sy, sw, sh };
}

function geometry(w, h, s) {
  if (s.mode === 'ratio') {
    const c = cropBox(w, h, s.ratio, s.anchor);
    return { ...c, dw: Math.round(c.sw), dh: Math.round(c.sh) };
  }
  if (s.mode === 'exact') {
    const c = cropBox(w, h, s.exactW / s.exactH, s.anchor);
    return { ...c, dw: s.exactW, dh: s.exactH };
  }
  let k = 1;
  if (s.mode === 'width' && w > s.value) k = s.value / w;
  if (s.mode === 'height' && h > s.value) k = s.value / h;
  if (s.mode === 'percent') k = s.value / 100;
  return { sx: 0, sy: 0, sw: w, sh: h, dw: Math.max(1, Math.round(w * k)), dh: Math.max(1, Math.round(h * k)) };
}

function draw(bmp, g, s, scale = 1) {
  const w = Math.max(1, Math.round(g.dw * scale)), h = Math.max(1, Math.round(g.dh * scale));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  if (s.type === 'image/jpeg') { ctx.fillStyle = s.bg; ctx.fillRect(0, 0, w, h); }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, g.sx, g.sy, g.sw, g.sh, 0, 0, w, h);
  if (s.wm.text && unlocked()) drawWatermark(ctx, w, h, s.wm);
  return c;
}

const encode = (c, type, q) => new Promise((res, rej) =>
  c.toBlob((b) => (b ? res(b) : rej(new Error('This format is not supported by your system'))), type, q));

// Find the best quality (and if needed, a smaller size) that fits under the target
async function encodeToTarget(bmp, g, s) {
  const lossy = s.type !== 'image/png';
  let scale = 1, best = null, c = null;
  for (let step = 0; step < 10; step++) {
    c = draw(bmp, g, s, scale);
    if (lossy) {
      let lo = 0.3, hi = 0.95;
      const top = await encode(c, s.type, hi);
      if (top.size <= s.target) return { blob: top, w: c.width, h: c.height, ok: true };
      for (let i = 0; i < 7; i++) {
        const mid = (lo + hi) / 2;
        const b = await encode(c, s.type, mid);
        if (b.size <= s.target) { best = { blob: b, w: c.width, h: c.height, ok: true }; lo = mid; } else hi = mid;
      }
      if (best) return best;
      const low = await encode(c, s.type, 0.3);
      if (low.size <= s.target) return { blob: low, w: c.width, h: c.height, ok: true };
      scale *= Math.max(0.5, Math.min(0.9, Math.sqrt(s.target / low.size)));
    } else {
      const b = await encode(c, s.type);
      if (b.size <= s.target) return { blob: b, w: c.width, h: c.height, ok: true };
      scale *= Math.max(0.5, Math.min(0.9, Math.sqrt(s.target / b.size)));
    }
  }
  const b = await encode(c, s.type, lossy ? 0.3 : undefined);
  return { blob: b, w: c.width, h: c.height, ok: b.size <= s.target };
}

function outName(item, index, total, s) {
  const base = item.file.name.replace(/\.[^.]+$/, '') || 'image';
  const pad = Math.max(3, String(total).length);
  let name = s.pattern.replace(/\{name\}/gi, base).replace(/\{n\}/gi, String(index + 1).padStart(pad, '0'));
  name = name.replace(/[\\/:*?"<>|]+/g, '_').trim() || base;
  return `${name}.${EXT[s.type]}`;
}

async function convertOne(item, index, s) {
  const bmp = await loadBitmap(await sourceOf(item));
  const g = geometry(bmp.width, bmp.height, s);
  let r;
  if (s.target) r = await encodeToTarget(bmp, g, s);
  else { const c = draw(bmp, g, s); r = { blob: await encode(c, s.type, s.quality), w: c.width, h: c.height, ok: true }; }
  if (bmp.close) bmp.close();
  item.out = r.blob; item.dims = `${r.w}×${r.h}`; item.error = null;
  item.warn = r.ok ? null : 'could not reach target size';
  item.outName = outName(item, index, items.length, s);
}

function uniqueNames() {
  const used = new Set();
  return items.filter((i) => i.out).map((i) => {
    let name = i.outName, n = 1;
    while (used.has(name.toLowerCase())) name = i.outName.replace(/(\.\w+)$/, `-${n++}$1`);
    used.add(name.toLowerCase());
    return { item: i, name };
  });
}

// ---------- UI ----------
function addFiles(fileList) {
  for (const file of fileList) {
    if (!isImage(file)) continue;
    const item = { id: nextId++, file, url: isHeic(file) ? PLACEHOLDER : URL.createObjectURL(file), out: null, outName: '', error: null };
    items.push(item);
    if (isHeic(file)) sourceOf(item).then(render).catch((e) => { item.error = e.message; render(); });
  }
  render();
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function render() {
  const list = $('list');
  list.innerHTML = '';
  for (const it of items) {
    const li = document.createElement('li');
    li.className = 'item';
    let meta = fmtBytes(it.file.size);
    if (it.error) meta += ` · <span class="err">${it.error}</span>`;
    else if (it.out) {
      const pct = Math.round((1 - it.out.size / it.file.size) * 100);
      meta += ` → ${fmtBytes(it.out.size)} · ${it.dims} ` +
        (pct > 0 ? `<span class="save">−${pct}%</span>` : `<span>+${-pct}%</span>`);
      if (it.warn) meta += ` · <span class="warn">${it.warn}</span>`;
    }
    li.innerHTML = `
      <img src="${it.url}" alt="">
      <div style="min-width:0"><div class="name"></div><div class="meta">${meta}</div></div>
      <div class="actions">
        ${it.out ? '<button class="icon" data-act="dl">Save</button>' : ''}
        <button class="icon" data-act="rm" title="Remove">✕</button>
      </div>`;
    li.querySelector('.name').textContent = it.out ? it.outName : it.file.name;
    li.querySelector('[data-act="rm"]').onclick = () => {
      if (it.url.startsWith('blob:')) URL.revokeObjectURL(it.url);
      items.splice(items.indexOf(it), 1); render();
    };
    const dl = li.querySelector('[data-act="dl"]');
    if (dl) dl.onclick = () => download(it.out, it.outName);
    list.appendChild(li);
  }
  const done = items.some((i) => i.out);
  $('count').textContent = items.length ? `${items.length} image${items.length > 1 ? 's' : ''}` : 'No images yet';
  $('clear').disabled = !items.length;
  $('convert').disabled = !items.length;
  $('zip').disabled = !done;
  $('saveFolder').disabled = !done;
}

async function convertAll() {
  const s = settings();
  if (needsPro(s)) return;
  const btn = $('convert');
  btn.disabled = true;
  let before = 0, after = 0, i = 0;
  const limit = unlocked() ? items.length : Math.min(items.length, FREE_LIMIT);
  for (const it of items) {
    if (i >= limit) { it.out = null; it.error = `Free version converts ${FREE_LIMIT} images at a time – get Pro for unlimited`; i++; continue; }
    btn.textContent = `Converting ${i + 1}/${limit}…`;
    try { await convertOne(it, i, s); before += it.file.size; after += it.out.size; }
    catch (e) { it.error = e.message || 'Failed'; it.out = null; }
    i++;
  }
  if (items.length > limit) setTimeout(() => openPro(`You added ${items.length} images. The free version converts ${FREE_LIMIT} at a time.`), 300);
  btn.textContent = 'Convert all';
  render();
  const ok = items.filter((x) => x.out).length;
  const warn = items.filter((x) => x.warn).length;
  const sum = $('summary');
  sum.hidden = false;
  sum.innerHTML = `<strong>${ok}/${items.length}</strong> converted · ${fmtBytes(before)} → ${fmtBytes(after)}` +
    (before ? ` (<strong>${Math.round((1 - after / before) * 100)}%</strong> smaller)` : '') +
    (warn ? `<br>${warn} file(s) could not reach the target size.` : '');
}

async function downloadZip() {
  const zip = new JSZip();
  uniqueNames().forEach(({ item, name }) => zip.file(name, item.out));
  $('zip').textContent = 'Zipping…';
  const blob = await zip.generateAsync({ type: 'blob' });
  $('zip').textContent = 'Download all (.zip)';
  download(blob, 'pixelbatch-images.zip');
}

async function saveToFolder() {
  if (!unlocked()) { openPro('Saving straight to a folder is a Pro feature. The free version can download a ZIP.'); return; }
  let dir;
  try { dir = await window.showDirectoryPicker({ mode: 'readwrite', id: 'pixelbatch-out' }); }
  catch (_) { return; } // user cancelled
  const btn = $('saveFolder');
  btn.disabled = true;
  let saved = 0;
  for (const { item, name } of uniqueNames()) {
    let finalName = name, n = 1;
    // never overwrite existing files in the folder
    while (true) {
      try { await dir.getFileHandle(finalName); finalName = name.replace(/(\.\w+)$/, ` (${n++})$1`); }
      catch (_) { break; }
    }
    btn.textContent = `Saving ${saved + 1}…`;
    const fh = await dir.getFileHandle(finalName, { create: true });
    const w = await fh.createWritable();
    await w.write(item.out); await w.close();
    saved++;
  }
  btn.textContent = 'Save to folder…';
  btn.disabled = false;
  const sum = $('summary');
  sum.hidden = false;
  sum.innerHTML = `Saved <strong>${saved}</strong> file(s) to folder “${dir.name}”.`;
}

// --- Wire up UI ---
const drop = $('drop');
['dragenter', 'dragover'].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (ev) => addFiles(ev.dataTransfer.files));
drop.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') $('picker').click(); });
$('picker').addEventListener('change', (ev) => { addFiles(ev.target.files); ev.target.value = ''; });
document.addEventListener('paste', (ev) => {
  const files = [...ev.clipboardData.items].filter((i) => i.kind === 'file').map((i) => {
    const f = i.getAsFile();
    return new File([f], `pasted-${Date.now()}.${(f.type.split('/')[1] || 'png')}`, { type: f.type });
  });
  addFiles(files);
});

$('quality').addEventListener('input', () => { $('qualityOut').textContent = $('quality').value; });
$('preset').addEventListener('change', () => {
  const v = $('preset').value;
  if (v) { const [w, h] = v.split('x'); $('exactW').value = w; $('exactH').value = h; }
});
['exactW', 'exactH'].forEach((k) => $(k).addEventListener('input', () => { $('preset').value = ''; }));

function syncFields() {
  const t = $('format').value;
  const target = $('compressMode').value === 'target';
  $('qualityField').hidden = t === 'image/png' || target;
  $('targetField').hidden = !target;
  $('bgField').hidden = t !== 'image/jpeg';
  const m = $('resizeMode').value;
  $('resizeValueField').hidden = !['width', 'height', 'percent'].includes(m);
  $('ratioField').hidden = m !== 'ratio';
  $('exactField').hidden = m !== 'exact';
  $('anchorField').hidden = m !== 'ratio' && m !== 'exact';
  if (m === 'percent' && Number($('resizeValue').value) > 400) $('resizeValue').value = 50;
  if ((m === 'width' || m === 'height') && Number($('resizeValue').value) < 50) $('resizeValue').value = 1920;
}
['format', 'compressMode', 'resizeMode'].forEach((k) => $(k).addEventListener('change', syncFields));
syncFields();
if (!('showDirectoryPicker' in window)) $('saveFolder').hidden = true;

$('convert').addEventListener('click', convertAll);
$('zip').addEventListener('click', downloadZip);
$('saveFolder').addEventListener('click', saveToFolder);
$('clear').addEventListener('click', () => {
  items.forEach((i) => { if (i.url.startsWith('blob:')) URL.revokeObjectURL(i.url); });
  items.length = 0; $('summary').hidden = true; render();
});

// Pro UI
$('proBtn').addEventListener('click', () => { if (!isPro) openPro(); });
$('buyBtn').addEventListener('click', buyPro);
$('restoreBtn').addEventListener('click', async () => {
  proMessage('Checking your purchases…');
  proMessage((await checkPro()) ? 'Pro restored. ★' : 'No Pro purchase found on this Microsoft account.');
});
$('closePro').addEventListener('click', () => $('proDialog').close());
const syncWm = () => { $('wmOptions').hidden = !$('wmText').value.trim(); };
$('wmText').addEventListener('input', syncWm);
[['wmSize', 'wmSizeOut'], ['wmOpacity', 'wmOpacityOut']].forEach(([i, o]) =>
  $(i).addEventListener('input', () => { $(o).textContent = $(i).value; }));
setPro(isPro);
checkPro();

// Remember settings between sessions
const KEYS = ['format', 'compressMode', 'quality', 'targetKB', 'resizeMode', 'resizeValue', 'ratio',
  'preset', 'exactW', 'exactH', 'anchor', 'bg', 'pattern', 'wmText', 'wmPos', 'wmColor', 'wmSize', 'wmOpacity'];
try {
  const saved = JSON.parse(localStorage.getItem('pixelbatch-settings') || '{}');
  KEYS.forEach((k) => { if (saved[k] != null) $(k).value = saved[k]; });
  $('qualityOut').textContent = $('quality').value; syncFields();
} catch (_) {}
$('wmSizeOut').textContent = $('wmSize').value; $('wmOpacityOut').textContent = $('wmOpacity').value; syncWm();
KEYS.forEach((k) => $(k).addEventListener('change', () => {
  try { localStorage.setItem('pixelbatch-settings', JSON.stringify(Object.fromEntries(KEYS.map((x) => [x, $(x).value])))); } catch (_) {}
}));

// "Open with PixelBatch" from File Explorer (installed app)
if ('launchQueue' in window) {
  window.launchQueue.setConsumer(async (params) => {
    if (!params.files || !params.files.length) return;
    addFiles(await Promise.all(params.files.map((h) => h.getFile())));
  });
}

// Offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
