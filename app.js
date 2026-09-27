// PixelBatch – batch image converter (runs fully in the browser, offline)
const $ = (id) => document.getElementById(id);
const items = []; // { id, file, url, out: Blob|null, outName, error }
let nextId = 1;

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

function settings() {
  return {
    type: $('format').value,
    quality: Number($('quality').value) / 100,
    mode: $('resizeMode').value,
    value: Math.max(1, Number($('resizeValue').value) || 1),
    bg: $('bg').value,
    suffix: $('suffix').value.trim(),
  };
}

function outName(file, s) {
  const base = file.name.replace(/\.[^.]+$/, '') || 'image';
  return `${base}${s.suffix}.${EXT[s.type]}`;
}

function targetSize(w, h, s) {
  let scale = 1;
  if (s.mode === 'width' && w > s.value) scale = s.value / w;
  if (s.mode === 'height' && h > s.value) scale = s.value / h;
  if (s.mode === 'percent') scale = s.value / 100;
  return [Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale))];
}

async function loadBitmap(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file); } catch (_) { /* fall back */ }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unsupported or broken image'));
    img.src = URL.createObjectURL(file);
  });
}

async function convertOne(item, s) {
  const bmp = await loadBitmap(item.file);
  const [w, h] = targetSize(bmp.width, bmp.height, s);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (s.type === 'image/jpeg') { ctx.fillStyle = s.bg; ctx.fillRect(0, 0, w, h); }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();
  const blob = await new Promise((res) => canvas.toBlob(res, s.type, s.quality));
  if (!blob) throw new Error('This format is not supported by your system');
  item.out = blob; item.outName = outName(item.file, s); item.dims = `${w}×${h}`; item.error = null;
}

function addFiles(fileList) {
  for (const file of fileList) {
    if (!file.type.startsWith('image/')) continue;
    items.push({ id: nextId++, file, url: URL.createObjectURL(file), out: null, outName: '', error: null });
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
      URL.revokeObjectURL(it.url);
      items.splice(items.indexOf(it), 1); render();
    };
    const dl = li.querySelector('[data-act="dl"]');
    if (dl) dl.onclick = () => download(it.out, it.outName);
    list.appendChild(li);
  }
  $('count').textContent = items.length ? `${items.length} image${items.length > 1 ? 's' : ''}` : 'No images yet';
  $('clear').disabled = !items.length;
  $('convert').disabled = !items.length;
  $('zip').disabled = !items.some((i) => i.out);
}

async function convertAll() {
  const s = settings();
  const btn = $('convert');
  btn.disabled = true;
  let done = 0, before = 0, after = 0;
  for (const it of items) {
    btn.textContent = `Converting ${++done}/${items.length}…`;
    try { await convertOne(it, s); before += it.file.size; after += it.out.size; }
    catch (e) { it.error = e.message || 'Failed'; it.out = null; }
  }
  btn.textContent = 'Convert all';
  render();
  const ok = items.filter((i) => i.out).length;
  const sum = $('summary');
  sum.hidden = false;
  sum.innerHTML = `<strong>${ok}/${items.length}</strong> converted · ${fmtBytes(before)} → ${fmtBytes(after)}` +
    (before ? ` (<strong>${Math.round((1 - after / before) * 100)}%</strong> smaller)` : '');
}

async function downloadZip() {
  const zip = new JSZip();
  const used = new Set();
  for (const it of items) {
    if (!it.out) continue;
    let name = it.outName, n = 1;
    while (used.has(name)) name = it.outName.replace(/(\.\w+)$/, `-${n++}$1`);
    used.add(name);
    zip.file(name, it.out);
  }
  $('zip').textContent = 'Zipping…';
  const blob = await zip.generateAsync({ type: 'blob' });
  $('zip').textContent = 'Download all (.zip)';
  download(blob, 'pixelbatch-images.zip');
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
function syncFields() {
  const t = $('format').value;
  $('qualityField').hidden = t === 'image/png';
  $('bgField').hidden = t !== 'image/jpeg';
  const m = $('resizeMode').value;
  $('resizeValueField').hidden = m === 'none';
  if (m === 'percent' && Number($('resizeValue').value) > 400) $('resizeValue').value = 50;
  if (m !== 'percent' && Number($('resizeValue').value) < 50) $('resizeValue').value = 1920;
}
$('format').addEventListener('change', syncFields);
$('resizeMode').addEventListener('change', syncFields);
syncFields();

$('convert').addEventListener('click', convertAll);
$('zip').addEventListener('click', downloadZip);
$('clear').addEventListener('click', () => {
  items.forEach((i) => URL.revokeObjectURL(i.url));
  items.length = 0; $('summary').hidden = true; render();
});

// Remember settings between sessions
const KEYS = ['format', 'quality', 'resizeMode', 'resizeValue', 'bg', 'suffix'];
try {
  const saved = JSON.parse(localStorage.getItem('pixelbatch-settings') || '{}');
  KEYS.forEach((k) => { if (saved[k] != null) $(k).value = saved[k]; });
  $('qualityOut').textContent = $('quality').value; syncFields();
} catch (_) {}
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
