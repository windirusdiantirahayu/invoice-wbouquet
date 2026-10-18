/* Invoice W Bouquet — logika aplikasi (riwayat, formulir, pratinjau, PDF, pengaturan, cadangan).
   Data tersimpan di IndexedDB perangkat. Tidak ada server. */
(function () {
  'use strict';

  const APP_VERSION = '1.0.0';

  /* Data usaha bawaan. Bisa diubah di menu Pengaturan; tombol "Kembalikan data bawaan" memakai nilai ini. */
  const DEFAULTS = Object.freeze({
    businessName: 'W Bouquet',
    location: 'Sangkulirang',
    signer: 'Windy Rusdianti Rahayu',
    address: 'Jln. Bengkirai No. 47, Sangkulirang\nKalimantan Timur 75686',
    phone: '0821-5866-0684',
    email: 'windyrr99@icloud.com',
    social: 'FB & IG: W Bouquet Sangkulirang',
    logo: null,
    bankName: 'BRI',
    bankAccount: '4509-01-026231-53-2',
    bankHolder: 'Windi Rusdianti Rahayu',
    currency: 'IDR (Rupiah)',
    prefix: 'INV-',
    nextNumber: 2,
    padding: 3,
    termDays: 14,
    template: 'serif',
    accent: '#3A2348',
    sideColor: '#EFE6F2',
    notes: 'Mohon cantumkan nomor invoice ({nomor}) pada berita transfer.\nKirim bukti transfer via WhatsApp ke {telepon}.',
    thanks: 'Terima kasih atas kepercayaan Anda.',
    lastBackup: null
  });
  const BUSINESS_KEYS = ['businessName', 'location', 'signer', 'address', 'phone', 'email', 'social', 'logo', 'bankName', 'bankAccount', 'bankHolder', 'currency', 'notes', 'thanks'];
  const ACCENTS = [['#3A2348', 'Ungu plum'], ['#5B3A6E', 'Ungu lavender'], ['#6B2F4A', 'Merah anggur'], ['#2F3B4A', 'Biru arang']];
  const SIDES = [['#EFE6F2', 'Lilac'], ['#F3EEE9', 'Krem'], ['#E9EEF2', 'Abu kebiruan'], ['#F4F2F5', 'Abu muda']];

  /* ---------------- Penyimpanan ---------------- */
  const Store = (() => {
    let dbp = null;
    let ok = true;
    const mem = { invoices: new Map(), kv: new Map() };
    function open() {
      if (dbp) return dbp;
      dbp = new Promise((resolve, reject) => {
        try {
          const req = indexedDB.open('wbouquet-invoice', 1);
          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('invoices')) db.createObjectStore('invoices', { keyPath: 'id' });
            if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
          req.onblocked = () => reject(new Error('blocked'));
        } catch (e) { reject(e); }
      });
      return dbp;
    }
    function run(store, mode, fn) {
      return open().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction(store, mode);
        let result;
        const r = fn(tx.objectStore(store));
        if (r) r.onsuccess = () => { result = r.result; };
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }));
    }
    return {
      async init() { try { await open(); } catch (e) { ok = false; } return ok; },
      get ok() { return ok; },
      allInvoices() { return ok ? run('invoices', 'readonly', (os) => os.getAll()) : Promise.resolve([...mem.invoices.values()]); },
      putInvoice(inv) { if (!ok) { mem.invoices.set(inv.id, inv); return Promise.resolve(); } return run('invoices', 'readwrite', (os) => os.put(inv)); },
      delInvoice(id) { if (!ok) { mem.invoices.delete(id); return Promise.resolve(); } return run('invoices', 'readwrite', (os) => os.delete(id)); },
      get(k) { return ok ? run('kv', 'readonly', (os) => os.get(k)) : Promise.resolve(mem.kv.get(k)); },
      set(k, v) { if (!ok) { mem.kv.set(k, v); return Promise.resolve(); } return run('kv', 'readwrite', (os) => os.put(v, k)); },
      del(k) { if (!ok) { mem.kv.delete(k); return Promise.resolve(); } return run('kv', 'readwrite', (os) => os.delete(k)); },
      clearAll() {
        if (!ok) { mem.invoices.clear(); mem.kv.clear(); return Promise.resolve(); }
        return Promise.all([run('invoices', 'readwrite', (os) => os.clear()), run('kv', 'readwrite', (os) => os.clear())]);
      }
    };
  })();

  /* ---------------- Status aplikasi ---------------- */
  const S = {
    settings: null,
    settingsRev: 0,
    invoices: [],
    route: { name: 'list' },
    list: { q: '', f: 'all' },
    ed: null,
    draftNew: null,
    installEvt: null,
    swWaiting: null,
    updateRequested: false
  };

  /* ---------------- Pembantu ---------------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = IV.esc;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  function debounce(fn, ms) { let t; return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(null, a), ms); }; }
  function byId(id) { return S.invoices.find((i) => i.id === id); }
  function invTotal(inv) { return IV.totals(inv).total; }
  function isOverdue(inv) { return inv.status !== 'paid' && inv.dueDate && inv.dueDate < IV.today(); }
  function sortInvoices() {
    S.invoices.sort((a, b) => String(b.createdAt || b.issueDate || '').localeCompare(String(a.createdAt || a.issueDate || '')));
  }
  function nextNumberStr() {
    const s = S.settings;
    return (s.prefix || '') + String(Math.max(1, Number(s.nextNumber) || 1)).padStart(Number(s.padding) || 3, '0');
  }
  function numberValue(str) {
    const p = S.settings.prefix || '';
    const v = String(str || '').trim();
    if (p && !v.startsWith(p)) return null;
    const rest = v.slice(p.length);
    return /^\d+$/.test(rest) ? Number(rest) : null;
  }
  function logoSrc() { return S.settings.logo || 'logo.png'; }
  function renderSettings() { return Object.assign({}, S.settings, { logo: logoSrc() }); }
  function setPath(obj, path, val) {
    const parts = path.split('.');
    let o = obj;
    for (let i = 0; i < parts.length - 1; i++) { o[parts[i]] = o[parts[i]] || {}; o = o[parts[i]]; }
    o[parts[parts.length - 1]] = val;
  }
  function getPath(obj, path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj); }
  function moneyInput(el) {
    const digits = el.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 13);
    el.value = digits ? IV.num(Number(digits)) : '';
    return digits ? Number(digits) : 0;
  }
  function waNumber(phone) {
    let d = String(phone || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('0')) d = '62' + d.slice(1);
    else if (d.startsWith('8')) d = '62' + d;
    return d.length >= 10 ? d : '';
  }
  function pdfName(inv) {
    return ('Invoice ' + (inv.number || '') + ' - ' + ((inv.client && inv.client.name) || 'pelanggan')).replace(/[\\/:*?"<>|]+/g, '-').trim() + '.pdf';
  }
  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }
  const canShareFiles = (() => {
    try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] })); }
    catch (e) { return false; }
  })();

  /* ---------------- Ikon (garis) ---------------- */
  const ICONS = {
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" stroke-width="3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    share: '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/>',
    download: '<path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/><path d="M7 11l5 5 5-5"/><path d="M12 4v12"/>',
    upload: '<path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/><path d="M7 9l5-5 5 5"/><path d="M12 4v12"/>',
    chat: '<path d="M4 20l1.4-4.2A8 8 0 1 1 8.6 19z"/>',
    edit: '<path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4h6v3"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    undo: '<path d="M9 14l-4-4 4-4"/><path d="M5 10h9a5 5 0 0 1 0 10h-2"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    back: '<path d="M15 6l-6 6 6 6"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    form: '<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><path d="M9 13h6M9 17h6"/>',
    install: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M12 7v7M9 11l3 3 3-3"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>'
  };
  function icon(n, size) {
    const z = size || 20;
    return `<svg aria-hidden="true" width="${z}" height="${z}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg>`;
  }

  /* ---------------- Toast & dialog ---------------- */
  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3400);
  }
  function modal(opts) {
    return new Promise((resolve) => {
      const root = $('#modal-root');
      root.innerHTML = `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-title">
        <h2 id="m-title">${esc(opts.title)}</h2><p>${esc(opts.body)}</p>
        <div class="m-actions">${opts.actions.map((a, i) => `<button type="button" class="btn ${a.kind || ''}" data-mi="${i}">${esc(a.label)}</button>`).join('')}</div>
      </div></div>`;
      const back = root.firstElementChild;
      const prev = document.activeElement;
      function close(v) {
        root.innerHTML = '';
        document.removeEventListener('keydown', onKey, true);
        if (prev && prev.focus) { try { prev.focus(); } catch (e) { /* abaikan */ } }
        resolve(v);
      }
      function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(undefined); } }
      back.addEventListener('click', (e) => {
        const b = e.target.closest('[data-mi]');
        if (b) close(opts.actions[Number(b.dataset.mi)].value);
        else if (e.target === back) close(undefined);
      });
      document.addEventListener('keydown', onKey, true);
      const btns = root.querySelectorAll('button');
      btns[btns.length - 1].focus();
    });
  }
  function setBusy(btn, busy, label) {
    if (!btn) return;
    if (busy) { btn.dataset.html = btn.innerHTML; btn.disabled = true; btn.textContent = label || 'Memproses…'; }
    else if (btn.dataset.html) { btn.innerHTML = btn.dataset.html; btn.disabled = false; delete btn.dataset.html; }
  }

  /* ---------------- Kolom formulir ---------------- */
  function field(o) {
    const attrs = o.attrs || '';
    const input = o.textarea
      ? `<textarea class="textarea" id="${o.id}" ${attrs}>${esc(o.value)}</textarea>`
      : `<input class="input" id="${o.id}" type="${o.type || 'text'}" value="${esc(o.value)}" ${attrs}>`;
    return `<div class="field">
      <label for="${o.id}">${esc(o.label)}${o.opt ? ' <span class="opt">(opsional)</span>' : ''}</label>
      ${o.money ? `<div class="money">${input}</div>` : input}
      ${o.hint ? `<small>${o.hint}</small>` : ''}
      <div class="err" aria-live="polite"></div>
    </div>`;
  }
  function markInvalid(el, msg) {
    if (!el) return;
    el.classList.add('invalid');
    el.setAttribute('aria-invalid', 'true');
    const err = el.closest('.field') && el.closest('.field').querySelector('.err');
    if (err) err.textContent = msg;
  }
  function clearInvalid(el) {
    if (!el || !el.classList.contains('invalid')) return;
    el.classList.remove('invalid');
    el.removeAttribute('aria-invalid');
    const err = el.closest('.field') && el.closest('.field').querySelector('.err');
    if (err) err.textContent = '';
  }

  /* ---------------- Kerangka ---------------- */
  const NAV = [['list', '#/', 'Riwayat', 'list'], ['new', '#/baru', 'Buat', 'plus'], ['settings', '#/pengaturan', 'Pengaturan', 'settings']];
  function shell(content, active) {
    const s = S.settings;
    return `
<header class="app-header"><div class="inner">
  <a class="brand" href="#/" aria-label="Riwayat invoice">
    <img src="${esc(logoSrc())}" alt="" id="brand-logo">
    <span style="min-width:0;display:flex;flex-direction:column;gap:2px">
      <span class="bn" id="brand-name">${esc(s.businessName || 'Invoice')}</span>
      <span class="bs">Invoice</span>
    </span>
  </a>
  <nav class="top-nav" aria-label="Menu utama">
    ${NAV.map(([k, h, l, ic]) => `<a href="${h}" class="${k === 'new' ? 'cta' : ''}" ${active === k ? 'aria-current="page"' : ''}>${icon(ic, 18)}${k === 'new' ? 'Buat invoice' : l}</a>`).join('')}
  </nav>
</div></header>
<main id="main">${content}</main>
<nav class="bottom-nav" aria-label="Menu utama">
  ${NAV.map(([k, h, l, ic]) => `<a href="${h}" class="${k === 'new' ? 'cta' : ''}" ${active === k ? 'aria-current="page"' : ''}><span class="ic-wrap">${icon(ic, 22)}</span>${l}</a>`).join('')}
</nav>`;
  }

  function statusPill(inv) {
    if (inv.status === 'paid') return `<span class="pill ok">${icon('check', 13)}Lunas</span>`;
    if (isOverdue(inv)) return `<span class="pill bad">Lewat jatuh tempo</span>`;
    return `<span class="pill warn">Belum lunas</span>`;
  }

  function installCard(where) {
    if (isStandalone()) return '';
    if (S.installEvt) {
      return `<div class="banner"><div class="b-text"><strong>Pasang di layar utama</strong><p>Buka invoice langsung dari ikon W Bouquet, tetap bisa dipakai tanpa internet.</p></div>
        <div class="b-actions"><button class="btn primary small" data-act="install">${icon('install', 18)}Pasang aplikasi</button></div></div>`;
    }
    if (where === 'settings') {
      return `<div class="banner"><div class="b-text"><strong>Pasang di layar utama</strong><p>Di Chrome Android, ketuk menu ⋮ lalu pilih <b>Tambahkan ke layar utama</b> atau <b>Instal aplikasi</b>.</p></div></div>`;
    }
    return '';
  }

  /* ---------------- Layar: Riwayat ---------------- */
  function viewList() {
    const all = S.invoices;
    const unpaid = all.filter((i) => i.status !== 'paid');
    const overdue = unpaid.filter(isOverdue);
    const ym = IV.today().slice(0, 7);
    const paidMonth = all.filter((i) => i.status === 'paid' && String(i.paidAt || i.issueDate || '').slice(0, 7) === ym);
    const sumU = unpaid.reduce((t, i) => t + invTotal(i), 0);
    const sumP = paidMonth.reduce((t, i) => t + invTotal(i), 0);

    const storageWarn = Store.ok ? '' : `<div class="banner" style="background:var(--bad-bg)"><div class="b-text"><strong>Penyimpanan tidak tersedia</strong><p>Browser ini tidak mengizinkan aplikasi menyimpan data (mungkin mode penyamaran). Invoice akan hilang saat aplikasi ditutup.</p></div></div>`;

    if (!all.length) {
      return `${storageWarn}<div id="install-slot">${installCard('list')}</div>
      <div class="page-head"><h1 class="page-title">Riwayat invoice</h1></div>
      <div class="empty">
        <h2>Belum ada invoice</h2>
        <p>Data usaha ${esc(S.settings.businessName || '')} sudah terisi. Anda bisa langsung membuat invoice, atau memeriksa datanya dulu di Pengaturan.</p>
        <div class="row" style="justify-content:center;max-width:420px;margin:0 auto">
          <a class="btn primary" href="#/baru">${icon('plus')}Buat invoice pertama</a>
          <a class="btn" href="#/pengaturan">${icon('settings')}Periksa data usaha</a>
        </div>
      </div>`;
    }

    return `${storageWarn}<div id="install-slot">${installCard('list')}</div>
    <div class="page-head"><h1 class="page-title">Riwayat invoice</h1><span class="spacer"></span>
      <a class="btn primary small" href="#/baru">${icon('plus', 18)}Buat invoice</a></div>
    <div class="summary">
      <div class="sum-card ${unpaid.length ? 'attn' : ''}"><div class="k">Belum dibayar</div><div class="v">${IV.rp(sumU)}</div>
        <div class="s">${unpaid.length} invoice${overdue.length ? ` · ${overdue.length} lewat jatuh tempo` : ''}</div></div>
      <div class="sum-card"><div class="k">Lunas bulan ini</div><div class="v">${IV.rp(sumP)}</div><div class="s">${paidMonth.length} invoice</div></div>
    </div>
    <div class="filters">
      <div class="search">${icon('search', 18)}<label for="q" class="sr-only">Cari invoice</label>
        <input class="input" id="q" type="search" placeholder="Cari nama pelanggan atau nomor" value="${esc(S.list.q)}" autocomplete="off"></div>
      <div class="seg" role="group" aria-label="Saring status">
        ${[['all', 'Semua'], ['unpaid', 'Belum lunas'], ['paid', 'Lunas']].map(([v, l]) => `<button type="button" data-act="filter" data-v="${v}" aria-pressed="${S.list.f === v}">${l}</button>`).join('')}
      </div>
    </div>
    <div id="list-body">${listBody()}</div>`;
  }
  function listBody() {
    const q = S.list.q.trim().toLowerCase();
    const rows = S.invoices.filter((i) => {
      if (S.list.f === 'paid' && i.status !== 'paid') return false;
      if (S.list.f === 'unpaid' && i.status === 'paid') return false;
      if (!q) return true;
      return String((i.client && i.client.name) || '').toLowerCase().includes(q) || String(i.number || '').toLowerCase().includes(q);
    });
    if (!rows.length) return `<div class="empty"><h2>Tidak ada yang cocok</h2><p>Coba kata kunci lain atau ubah saringan status.</p></div>`;
    return `<div class="inv-list">${rows.map((i) => `
      <a class="inv-row" href="#/invoice/${esc(i.id)}">
        <div class="ir-main"><div class="ir-name">${esc((i.client && i.client.name) || 'Tanpa nama')}</div>
          <div class="ir-sub">${esc(i.number)} · ${IV.tgl(i.issueDate, true)}</div></div>
        <div class="ir-end"><div class="ir-total">${IV.rp(invTotal(i))}</div>${statusPill(i)}</div>
      </a>`).join('')}</div>`;
  }

  /* ---------------- Layar: Formulir invoice ---------------- */
  function newItem() { return { id: uid(), name: '', note: '', price: 0, qty: 1 }; }
  function newDraft() {
    const t = IV.today();
    return {
      id: uid(), number: nextNumberStr(), issueDate: t, dueDate: IV.addDays(t, S.settings.termDays),
      status: 'unpaid', paidAt: null, template: S.settings.template || 'serif',
      client: { name: '', phone: '', email: '', address: '' },
      items: [newItem()], discount: 0, shipping: 0, notes: S.settings.notes || '',
      createdAt: null, updatedAt: null
    };
  }
  function draftHasContent(d) {
    return !!(d && ((d.client && (d.client.name || d.client.phone || d.client.address)) || (d.items || []).some((it) => it.name || Number(it.price))));
  }
  function prepareNew(fromDraft) {
    if (fromDraft) { S.ed = { draft: fromDraft, isNew: true, dirty: true, pane: 'form', dueTouched: false, restored: false }; return; }
    if (draftHasContent(S.draftNew)) {
      const d = S.draftNew;
      if (S.invoices.some((i) => i.number === d.number)) d.number = nextNumberStr();
      S.ed = { draft: d, isNew: true, dirty: true, pane: 'form', dueTouched: true, restored: true };
    } else {
      S.ed = { draft: newDraft(), isNew: true, dirty: false, pane: 'form', dueTouched: false, restored: false };
    }
  }

  function itemHtml(it, i) {
    return `<div class="item" data-item="${esc(it.id)}">
      <div class="item-head"><span class="n">BARANG ${i + 1}</span>
        <button type="button" class="icon-btn" data-act="del-item" data-id="${esc(it.id)}" aria-label="Hapus barang ${i + 1}">${icon('trash', 18)}</button></div>
      ${field({ id: 'it-name-' + it.id, label: 'Nama barang', value: it.name, attrs: 'data-if="name" placeholder="Contoh: Karangan bunga papan"' })}
      ${field({ id: 'it-note-' + it.id, label: 'Keterangan', opt: true, value: it.note, attrs: 'data-if="note" placeholder="Contoh: Ukuran 180 × 150 cm"' })}
      <div class="item-grid">
        ${field({ id: 'it-price-' + it.id, label: 'Harga satuan', money: true, value: it.price ? IV.num(it.price) : '', attrs: 'data-if="price" inputmode="numeric" placeholder="0"' })}
        ${field({ id: 'it-qty-' + it.id, label: 'Qty', value: String(it.qty == null ? '' : it.qty), attrs: 'data-if="qty" inputmode="numeric" style="text-align:center"' })}
      </div>
      <div class="item-sub">Jumlah <b data-sub>${IV.rp((Number(it.price) || 0) * (Number(it.qty) || 0))}</b></div>
    </div>`;
  }

  function viewEditor() {
    const e = S.ed;
    const d = e.draft;
    const names = [...new Set(S.invoices.map((i) => (i.client && i.client.name) || '').filter(Boolean))];
    const tpl = (name, val, key, label, sub) => `<label class="${key}"><input type="radio" name="${name}" value="${key}" ${val === key ? 'checked' : ''}><b>${label}</b><span>${sub}</span></label>`;
    return `<div class="editor ${e.pane === 'preview' ? 'pane-preview' : ''}" id="editor">
  <div class="ed-head">
    <a class="icon-btn" href="${e.isNew ? '#/' : '#/invoice/' + esc(d.id)}" aria-label="Kembali">${icon('back')}</a>
    <h1 class="page-title">${e.isNew ? 'Invoice baru' : 'Edit ' + esc(d.number)}</h1>
    <div class="seg" role="group" aria-label="Tampilan">
      <button type="button" data-act="pane" data-v="form" aria-pressed="${e.pane !== 'preview'}">${icon('form', 18)}Isi data</button>
      <button type="button" data-act="pane" data-v="preview" aria-pressed="${e.pane === 'preview'}">${icon('eye', 18)}Pratinjau</button>
    </div>
  </div>
  ${e.restored ? `<div class="banner" id="restored-banner"><div class="b-text"><strong>Melanjutkan draf terakhir</strong><p>Isian yang belum disimpan dikembalikan.</p></div>
    <div class="b-actions"><button type="button" class="btn small" data-act="new-fresh">Mulai dari kosong</button></div></div>` : ''}
  <div class="ed-grid">
    <form class="ed-form" id="ed-form" novalidate autocomplete="off">
      <section class="card"><h2>Pelanggan</h2><p class="hint">Ketik nama pelanggan lama untuk mengisi kontaknya otomatis.</p>
        <div class="stack">
          ${field({ id: 'f-cname', label: 'Nama pelanggan', value: d.client.name, attrs: 'data-f="client.name" list="clients" autocapitalize="words"' })}
          <div class="row">
            ${field({ id: 'f-cphone', label: 'Telepon / WhatsApp', opt: true, type: 'tel', value: d.client.phone, attrs: 'data-f="client.phone" inputmode="tel"' })}
            ${field({ id: 'f-cemail', label: 'Email', opt: true, type: 'email', value: d.client.email, attrs: 'data-f="client.email"' })}
          </div>
          ${field({ id: 'f-caddr', label: 'Alamat', opt: true, textarea: true, value: d.client.address, attrs: 'data-f="client.address" rows="2"' })}
        </div>
      </section>
      <section class="card"><h2>Detail invoice</h2>
        <div class="stack">
          <div class="row">
            ${field({ id: 'f-number', label: 'Nomor invoice', value: d.number, attrs: 'data-f="number"' })}
            <div class="field"><span class="lbl" id="lbl-status">Status</span>
              <div class="seg" role="radiogroup" aria-labelledby="lbl-status">
                <label><input type="radio" name="status" value="unpaid" ${d.status !== 'paid' ? 'checked' : ''}>Belum lunas</label>
                <label><input type="radio" name="status" value="paid" ${d.status === 'paid' ? 'checked' : ''}>Lunas</label>
              </div></div>
          </div>
          <div class="row">
            ${field({ id: 'f-issue', label: 'Tanggal terbit', type: 'date', value: d.issueDate, attrs: 'data-f="issueDate"' })}
            ${field({ id: 'f-due', label: 'Jatuh tempo', type: 'date', value: d.dueDate, attrs: 'data-f="dueDate"' })}
          </div>
          <div class="field"><span class="lbl" id="lbl-tpl">Desain invoice</span>
            <div class="tpl-pick" role="radiogroup" aria-labelledby="lbl-tpl">
              ${tpl('template', d.template, 'serif', 'Serif Elegan', 'Klasik, huruf berkait')}
              ${tpl('template', d.template, 'sans', 'Sans Modern', 'Bersih, kolom samping')}
            </div></div>
        </div>
      </section>
      <section class="card"><h2>Barang</h2>
        <div class="stack" id="items">${d.items.map(itemHtml).join('')}</div>
        <button type="button" class="btn soft" data-act="add-item" style="margin-top:12px;width:100%">${icon('plus')}Tambah barang</button>
        <div class="err" id="err-items" aria-live="polite"></div>
      </section>
      <section class="card"><h2>Biaya lain</h2><p class="hint">Kosongkan jika tidak ada.</p>
        <div class="row">
          ${field({ id: 'f-disc', label: 'Diskon', money: true, value: d.discount ? IV.num(d.discount) : '', attrs: 'data-f="discount" data-money inputmode="numeric" placeholder="0"' })}
          ${field({ id: 'f-ship', label: 'Ongkos kirim', money: true, value: d.shipping ? IV.num(d.shipping) : '', attrs: 'data-f="shipping" data-money inputmode="numeric" placeholder="0"' })}
        </div>
      </section>
      <section class="card"><h2>Catatan</h2><p class="hint">Tulis {nomor} untuk nomor invoice dan {telepon} untuk nomor WhatsApp usaha.</p>
        ${field({ id: 'f-notes', label: 'Catatan di invoice', opt: true, textarea: true, value: d.notes, attrs: 'data-f="notes" rows="3"' })}
      </section>
    </form>
    <aside class="ed-preview" aria-label="Pratinjau invoice"><div class="pv-frame" id="pv"></div></aside>
  </div>
  <datalist id="clients">${names.map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>
  <div class="ed-bar"><div class="inner">
    <div class="tot"><div class="k">Total tagihan</div><div class="v" id="ed-total">${IV.rp(invTotal(d))}</div></div>
    <button type="button" class="btn primary" data-act="save">${icon('check')}Simpan</button>
  </div></div>
</div>`;
  }

  const saveDraftSoon = debounce(() => {
    if (S.ed && S.ed.isNew) Store.set('draftNew', clone(S.ed.draft)).catch(() => {});
  }, 500);
  const previewSoon = debounce(() => { if (S.ed) mountPreview($('#pv'), S.ed.draft); }, 160);

  function afterEdit() {
    const tot = $('#ed-total');
    if (tot) tot.textContent = IV.rp(invTotal(S.ed.draft));
    previewSoon();
    if (S.ed.isNew) { S.draftNew = S.ed.draft; saveDraftSoon(); }
  }

  function editorInput(el) {
    const e = S.ed;
    if (!e) return;
    const d = e.draft;
    const row = el.closest('[data-item]');
    if (row && el.dataset.if) {
      const it = d.items.find((x) => x.id === row.dataset.item);
      if (!it) return;
      const k = el.dataset.if;
      if (k === 'price') it.price = moneyInput(el);
      else if (k === 'qty') { const digits = el.value.replace(/\D/g, '').slice(0, 5); el.value = digits; it.qty = Number(digits) || 0; }
      else it[k] = el.value;
      const sub = row.querySelector('[data-sub]');
      if (sub) sub.textContent = IV.rp((Number(it.price) || 0) * (Number(it.qty) || 0));
      clearInvalid(el);
      if (k === 'name' || k === 'price') { const ei = $('#err-items'); if (ei) ei.textContent = ''; }
    } else if (el.dataset.f) {
      const k = el.dataset.f;
      if (el.hasAttribute('data-money')) setPath(d, k, moneyInput(el));
      else setPath(d, k, el.value);
      if (k === 'issueDate' && !e.dueTouched && d.issueDate) {
        d.dueDate = IV.addDays(d.issueDate, S.settings.termDays);
        const due = $('#f-due');
        if (due) due.value = d.dueDate;
      }
      if (k === 'dueDate') e.dueTouched = true;
      clearInvalid(el);
    } else if (el.name === 'status' || el.name === 'template') {
      d[el.name] = el.value;
    } else return;
    e.dirty = true;
    afterEdit();
  }

  function autofillClient() {
    const d = S.ed && S.ed.draft;
    if (!d) return;
    const name = String(d.client.name || '').trim().toLowerCase();
    if (!name) return;
    const prev = S.invoices.find((i) => i.id !== d.id && String((i.client && i.client.name) || '').trim().toLowerCase() === name);
    if (!prev) return;
    let changed = false;
    ['phone', 'email', 'address'].forEach((k) => {
      if (!d.client[k] && prev.client[k]) {
        d.client[k] = prev.client[k];
        const el = document.querySelector(`[data-f="client.${k}"]`);
        if (el) el.value = prev.client[k];
        changed = true;
      }
    });
    if (changed) { toast('Kontak pelanggan diisi dari invoice sebelumnya'); S.ed.dirty = true; afterEdit(); }
  }

  function renderItems(focusId) {
    const box = $('#items');
    if (!box) return;
    box.innerHTML = S.ed.draft.items.map(itemHtml).join('');
    if (focusId) { const f = $('#it-name-' + focusId); if (f) f.focus(); }
  }

  function setPane(v) {
    if (!S.ed) return;
    S.ed.pane = v;
    const ed = $('#editor');
    if (ed) ed.classList.toggle('pane-preview', v === 'preview');
    document.querySelectorAll('[data-act="pane"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
    if (v === 'preview') mountPreview($('#pv'), S.ed.draft);
    window.scrollTo(0, 0);
  }

  async function saveInvoice() {
    const e = S.ed;
    if (!e) return;
    const d = e.draft;
    const bad = [];
    const nonEmpty = (it) => String(it.name || '').trim() || Number(it.price) || String(it.note || '').trim();

    if (!String(d.client.name || '').trim()) bad.push(['#f-cname', 'Isi nama pelanggan.']);
    const num = String(d.number || '').trim();
    if (!num) bad.push(['#f-number', 'Isi nomor invoice.']);
    else if (S.invoices.some((i) => i.id !== d.id && String(i.number || '').trim().toLowerCase() === num.toLowerCase())) bad.push(['#f-number', 'Nomor ini sudah dipakai invoice lain.']);
    if (!d.issueDate) bad.push(['#f-issue', 'Pilih tanggal terbit.']);
    if (d.issueDate && d.dueDate && d.dueDate < d.issueDate) bad.push(['#f-due', 'Jatuh tempo tidak boleh sebelum tanggal terbit.']);

    const filled = d.items.filter(nonEmpty);
    let itemsMsg = '';
    if (!filled.length) itemsMsg = 'Tambahkan minimal satu barang beserta harganya.';
    filled.forEach((it) => {
      if (!String(it.name || '').trim()) bad.push(['#it-name-' + it.id, 'Isi nama barang.']);
      if (!(Number(it.price) > 0)) bad.push(['#it-price-' + it.id, 'Isi harga barang.']);
      if (!(Number(it.qty) > 0)) bad.push(['#it-qty-' + it.id, 'Qty minimal 1.']);
    });

    if (bad.length || itemsMsg) {
      if (e.pane === 'preview') setPane('form');
      bad.forEach(([sel, msg]) => markInvalid($(sel), msg));
      const ei = $('#err-items');
      if (ei) ei.textContent = itemsMsg;
      const first = bad.length ? $(bad[0][0]) : $('#items');
      if (first) { first.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (first.focus) setTimeout(() => first.focus({ preventScroll: true }), 300); }
      toast('Lengkapi isian yang ditandai merah.');
      return;
    }

    const now = new Date().toISOString();
    d.number = num;
    d.items = filled.map((it) => Object.assign({}, it, { name: String(it.name).trim(), note: String(it.note || '').trim(), price: Number(it.price) || 0, qty: Number(it.qty) || 0 }));
    d.client.name = String(d.client.name).trim();
    d.updatedAt = now;
    if (d.status === 'paid') d.paidAt = d.paidAt || IV.today(); else d.paidAt = null;
    if (e.isNew) {
      d.createdAt = now;
      const n = numberValue(d.number);
      if (n != null && n >= (Number(S.settings.nextNumber) || 1)) { S.settings.nextNumber = n + 1; await Store.set('settings', S.settings).catch(() => {}); }
    }
    try { await Store.putInvoice(clone(d)); }
    catch (err) { toast('Invoice gagal disimpan. Coba lagi.'); return; }
    const idx = S.invoices.findIndex((i) => i.id === d.id);
    if (idx >= 0) S.invoices[idx] = clone(d); else S.invoices.push(clone(d));
    sortInvoices();
    if (e.isNew) {
      S.draftNew = null;
      Store.del('draftNew').catch(() => {});
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (x) { /* abaikan */ }
    }
    e.dirty = false;
    S.ed = null;
    location.hash = '#/invoice/' + d.id;
    toast('Invoice disimpan');
  }

  /* ---------------- Layar: Detail ---------------- */
  function viewDetail(inv) {
    const wa = waNumber(inv.client && inv.client.phone);
    const s = S.settings;
    const msg = [
      `Halo Kak ${(inv.client && inv.client.name) || ''}, terima kasih sudah memesan di ${[s.businessName, s.location].filter(Boolean).join(' ')}.`,
      `Berikut tagihan ${inv.number} sebesar ${IV.rp(invTotal(inv))}, jatuh tempo ${IV.tgl(inv.dueDate)}.`,
      (s.bankName || s.bankAccount) ? `Pembayaran dapat ditransfer ke ${[s.bankName, s.bankAccount].filter(Boolean).join(' ')}${s.bankHolder ? ' a.n. ' + s.bankHolder : ''}.` : '',
      'File invoice PDF kami kirimkan bersama pesan ini.'
    ].filter(Boolean).join('\n');
    const waLink = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(msg)}` : '';
    return `<div class="dt-wrap">
  <div class="page-head">
    <a class="icon-btn" href="#/" aria-label="Kembali ke riwayat">${icon('back')}</a>
    <h1 class="page-title">${esc(inv.number)}</h1>${statusPill(inv)}
  </div>
  <div class="dt-meta"><span>${esc((inv.client && inv.client.name) || '')}</span><span aria-hidden="true">·</span>
    <span class="tnum">${IV.rp(invTotal(inv))}</span><span aria-hidden="true">·</span><span>Jatuh tempo ${IV.tgl(inv.dueDate)}</span></div>
  <div class="dt-actions">
    ${canShareFiles ? `<button type="button" class="btn primary" data-act="share-pdf">${icon('share')}Bagikan PDF</button>` : ''}
    <button type="button" class="btn ${canShareFiles ? '' : 'primary'}" data-act="download-pdf">${icon('download')}Unduh PDF</button>
    ${waLink ? `<a class="btn soft" href="${esc(waLink)}" target="_blank" rel="noopener">${icon('chat')}Kirim pesan WA</a>` : ''}
  </div>
  <div class="dt-more">
    <a class="btn small ghost" href="#/edit/${esc(inv.id)}">${icon('edit', 18)}Edit</a>
    <button type="button" class="btn small ghost" data-act="toggle-paid">${inv.status === 'paid' ? icon('undo', 18) + 'Tandai belum lunas' : icon('check', 18) + 'Tandai lunas'}</button>
    <button type="button" class="btn small ghost" data-act="duplicate">${icon('copy', 18)}Duplikat</button>
    <button type="button" class="btn small ghost" data-act="delete" style="color:var(--bad-fg)">${icon('trash', 18)}Hapus</button>
  </div>
  <div class="pv-frame" id="pv" role="img" aria-label="Pratinjau invoice ${esc(inv.number)}"></div>
</div>`;
  }

  /* ---------------- Pratinjau ---------------- */
  const ro = ('ResizeObserver' in window) ? new ResizeObserver((entries) => {
    entries.forEach((en) => { const fr = en.target.classList.contains('pv-frame') ? en.target : en.target.closest('.pv-frame'); if (fr) fitPreview(fr); });
  }) : null;
  function fitPreview(el) {
    const paper = el && el.firstElementChild;
    if (!paper) return;
    const w = el.clientWidth;
    if (!w) return;
    const sc = w / 794;
    paper.style.transform = `scale(${sc})`;
    const h = Math.ceil(paper.offsetHeight * sc);
    if (el.style.height !== h + 'px') el.style.height = h + 'px';
  }
  function mountPreview(el, inv) {
    if (!el || !inv) return;
    const tpl = InvoiceTemplates[inv.template] || InvoiceTemplates.serif;
    el.innerHTML = `<div class="pv-paper">${tpl.render(inv, renderSettings())}</div>`;
    const paper = el.firstElementChild;
    fitPreview(el);
    if (ro) { ro.observe(el); ro.observe(paper); }
    paper.querySelectorAll('img').forEach((img) => { if (!img.complete) img.addEventListener('load', () => fitPreview(el), { once: true }); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitPreview(el));
  }

  /* ---------------- PDF ---------------- */
  const scripts = {};
  function loadScript(src) {
    if (!scripts[src]) {
      scripts[src] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = () => { delete scripts[src]; reject(new Error('Gagal memuat ' + src)); };
        document.head.appendChild(s);
      });
    }
    return scripts[src];
  }
  const FONT_FACES = ['700 36px "Cormorant Garamond"', '600 20px "Cormorant Garamond"', 'italic 600 19px "Cormorant Garamond"',
    '400 13px "Manrope"', '600 13px "Manrope"', '700 13px "Manrope"', '800 28px "Manrope"',
    '400 13px "Plus Jakarta Sans"', '500 13px "Plus Jakarta Sans"', 'italic 500 12px "Plus Jakarta Sans"', '700 13px "Plus Jakarta Sans"', '800 40px "Plus Jakarta Sans"'];
  const pdfCache = new Map();
  let pdfQueue = Promise.resolve();

  function getPdf(inv) {
    const key = inv.id + '|' + (inv.updatedAt || '') + '|' + S.settingsRev;
    if (pdfCache.has(key)) return pdfCache.get(key);
    const job = pdfQueue.then(() => buildPdf(inv));
    pdfQueue = job.catch(() => {});
    pdfCache.set(key, job);
    job.catch(() => pdfCache.delete(key));
    return job;
  }
  async function buildPdf(inv) {
    await Promise.all([loadScript('vendor/html2canvas.min.js'), loadScript('vendor/jspdf.umd.min.js')]);
    if (document.fonts) await Promise.all(FONT_FACES.map((f) => document.fonts.load(f).catch(() => null)));
    const stage = $('#pdf-stage');
    const tpl = InvoiceTemplates[inv.template] || InvoiceTemplates.serif;
    stage.innerHTML = tpl.render(inv, renderSettings());
    const node = stage.firstElementChild;
    await Promise.all([...node.querySelectorAll('img')].map((img) => (img.complete && img.naturalWidth) ? null : new Promise((r) => { img.onload = r; img.onerror = r; })));
    let canvas;
    try {
      canvas = await window.html2canvas(node, { scale: 2, backgroundColor: '#FFFFFF', useCORS: true, logging: false });
    } finally {
      stage.innerHTML = '';
    }
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    const pageW = 210, pageH = 297;
    const perPage = Math.floor(canvas.width * pageH / pageW);
    if (canvas.height <= perPage + 4) {
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageW, canvas.height * pageW / canvas.width);
    } else {
      for (let y = 0, p = 0; y < canvas.height; y += perPage, p++) {
        const h = Math.min(perPage, canvas.height - y);
        const c = document.createElement('canvas');
        c.width = canvas.width; c.height = h;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, c.width, h);
        ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
        if (p > 0) pdf.addPage();
        pdf.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageW, h * pageW / canvas.width);
      }
    }
    pdf.setProperties({ title: 'Invoice ' + inv.number, author: S.settings.businessName || '', creator: 'Invoice W Bouquet' });
    return pdf.output('blob');
  }
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  async function onDownloadPdf(btn) {
    const inv = byId(S.route.id);
    if (!inv) return;
    setBusy(btn, true, 'Membuat PDF…');
    try { downloadBlob(await getPdf(inv), pdfName(inv)); toast('PDF tersimpan di folder Download'); }
    catch (err) { console.error(err); toast('PDF gagal dibuat. Coba lagi.'); }
    finally { setBusy(btn, false); }
  }
  async function onSharePdf(btn) {
    const inv = byId(S.route.id);
    if (!inv) return;
    setBusy(btn, true, 'Menyiapkan PDF…');
    let blob;
    try { blob = await getPdf(inv); }
    catch (err) { console.error(err); setBusy(btn, false); toast('PDF gagal dibuat. Coba lagi.'); return; }
    setBusy(btn, false);
    const file = new File([blob], pdfName(inv), { type: 'application/pdf' });
    const share = () => navigator.share({ files: [file], title: 'Invoice ' + inv.number });
    try { await share(); }
    catch (err) {
      if (err && err.name === 'AbortError') return;
      if (err && err.name === 'NotAllowedError') {
        const go = await modal({ title: 'PDF siap dibagikan', body: 'Ketuk Bagikan, lalu pilih WhatsApp atau aplikasi lain.', actions: [{ label: 'Batal', value: false }, { label: 'Bagikan', value: true, kind: 'primary' }] });
        if (!go) return;
        try { await share(); return; } catch (e2) { if (e2 && e2.name === 'AbortError') return; }
      }
      downloadBlob(blob, file.name);
      toast('Tidak bisa membagikan. PDF diunduh ke folder Download.');
    }
  }

  /* ---------------- Layar: Pengaturan ---------------- */
  function viewSettings() {
    const s = S.settings;
    const sf = (key, label, extra) => field(Object.assign({ id: 's-' + key, label, value: s[key] == null ? '' : s[key], attrs: `data-s="${key}"` }, extra || {}));
    const radioTpl = (key, label, sub) => `<label class="${key}"><input type="radio" name="s-template" data-s="template" value="${key}" ${s.template === key ? 'checked' : ''}><b>${label}</b><span>${sub}</span></label>`;
    const sw = (name, key, list) => list.map(([c, l]) => `<label style="background:${c}" title="${l}"><input type="radio" name="${name}" data-s="${key}" value="${c}" ${String(s[key]).toLowerCase() === c.toLowerCase() ? 'checked' : ''}><span class="sr-only">${l}</span></label>`).join('');
    const last = s.lastBackup ? 'Cadangan terakhir: ' + IV.tgl(s.lastBackup.slice(0, 10)) : 'Belum pernah membuat cadangan.';
    return `<div class="page-head"><h1 class="page-title">Pengaturan</h1><span class="spacer"></span><span class="saved-note" id="saved-note" aria-live="polite"></span></div>
<div id="install-slot">${installCard('settings')}</div>
<div class="set-grid">
  <section class="card"><h2>Profil usaha</h2><p class="hint">Tampil di setiap invoice. Perubahan tersimpan otomatis.</p>
    <div class="stack">
      <div class="logo-edit"><img id="logo-prev" src="${esc(logoSrc())}" alt="Logo usaha">
        <div class="row" style="flex:1 1 220px">
          <label class="btn soft small file-btn">${icon('image', 18)}Ganti logo<input type="file" accept="image/*" id="logo-file"></label>
          ${s.logo ? `<button type="button" class="btn ghost small" data-act="logo-reset">Pakai logo bawaan</button>` : ''}
        </div></div>
      <div class="row">${sf('businessName', 'Nama usaha')}${sf('location', 'Kota / keterangan', { opt: true })}</div>
      ${sf('signer', 'Nama penanda tangan')}
      ${sf('address', 'Alamat usaha', { textarea: true, attrs: 'data-s="address" rows="2"' })}
      <div class="row">${sf('phone', 'Telepon / WhatsApp', { type: 'tel', attrs: 'data-s="phone" inputmode="tel"' })}${sf('email', 'Email', { type: 'email', opt: true })}</div>
      ${sf('social', 'Media sosial', { opt: true, hint: 'Contoh: FB &amp; IG: W Bouquet Sangkulirang' })}
    </div></section>

  <section class="card"><h2>Rekening pembayaran</h2><p class="hint">Pastikan nama pemilik sama persis dengan buku tabungan.</p>
    <div class="stack">
      <div class="row">${sf('bankName', 'Bank')}${sf('bankAccount', 'Nomor rekening', { attrs: 'data-s="bankAccount" inputmode="numeric"' })}</div>
      ${sf('bankHolder', 'Atas nama')}
      ${sf('currency', 'Mata uang')}
    </div></section>

  <section class="card"><h2>Nomor &amp; isi invoice</h2>
    <div class="stack">
      <div class="row">${sf('prefix', 'Awalan nomor', { opt: true })}${sf('nextNumber', 'Nomor berikutnya', { attrs: 'data-s="nextNumber" inputmode="numeric"' })}</div>
      <small id="next-hint">Invoice berikutnya: <b>${esc(nextNumberStr())}</b></small>
      ${sf('termDays', 'Termin pembayaran (hari)', { attrs: 'data-s="termDays" inputmode="numeric"', hint: 'Jatuh tempo diisi otomatis sekian hari setelah tanggal terbit.' })}
      <div class="field"><span class="lbl" id="lbl-stpl">Desain bawaan</span>
        <div class="tpl-pick" role="radiogroup" aria-labelledby="lbl-stpl">${radioTpl('serif', 'Serif Elegan', 'Klasik, huruf berkait')}${radioTpl('sans', 'Sans Modern', 'Bersih, kolom samping')}</div></div>
      <div class="field"><span class="lbl" id="lbl-acc">Warna utama</span><div class="swatches" role="radiogroup" aria-labelledby="lbl-acc">${sw('s-accent', 'accent', ACCENTS)}</div></div>
      <div class="field"><span class="lbl" id="lbl-side">Warna kolom samping <span class="opt">(desain Sans Modern)</span></span><div class="swatches" role="radiogroup" aria-labelledby="lbl-side">${sw('s-side', 'sideColor', SIDES)}</div></div>
      ${sf('notes', 'Catatan bawaan', { textarea: true, attrs: 'data-s="notes" rows="3"', hint: 'Dipakai untuk invoice baru. {nomor} = nomor invoice, {telepon} = nomor WhatsApp usaha.' })}
      ${sf('thanks', 'Ucapan penutup')}
    </div></section>

  <section class="card"><h2>Data &amp; cadangan</h2><p class="hint">Semua invoice tersimpan di perangkat ini saja. Simpan cadangan secara berkala, lalu kirim filenya ke Google Drive atau WhatsApp agar aman.</p>
    <div class="stack">
      <div class="row">
        <button type="button" class="btn soft" data-act="backup">${icon('download')}Simpan cadangan</button>
        <label class="btn file-btn">${icon('upload')}Pulihkan dari file<input type="file" accept="application/json,.json" id="restore-file"></label>
      </div>
      <small>${esc(last)}</small>
      <div class="row">
        <button type="button" class="btn ghost" data-act="reset-defaults">${icon('refresh')}Kembalikan data usaha bawaan</button>
        <button type="button" class="btn danger" data-act="wipe">${icon('trash')}Hapus semua data</button>
      </div>
    </div></section>
  <p style="text-align:center;color:var(--muted);font-size:12.5px;margin:4px 0 0">Invoice W Bouquet · versi ${APP_VERSION}</p>
</div>`;
  }

  const saveSettingsSoon = debounce(async () => {
    try {
      await Store.set('settings', S.settings);
      S.settingsRev++;
      const n = $('#saved-note');
      if (n) { n.textContent = 'Tersimpan'; setTimeout(() => { if (n.isConnected) n.textContent = ''; }, 1800); }
    } catch (e) { toast('Pengaturan gagal disimpan.'); }
  }, 350);

  function updateBrand() {
    const n = $('#brand-name'); if (n) n.textContent = S.settings.businessName || 'Invoice';
    const l = $('#brand-logo'); if (l) l.src = logoSrc();
    const p = $('#logo-prev'); if (p) p.src = logoSrc();
  }
  function settingsInput(el) {
    const k = el.dataset.s;
    let v = el.value;
    if (k === 'nextNumber' || k === 'termDays') {
      const digits = v.replace(/\D/g, '').slice(0, 6);
      el.value = digits;
      v = k === 'nextNumber' ? Math.max(1, Number(digits) || 1) : (Number(digits) || 0);
    }
    S.settings[k] = v;
    if (k === 'prefix' || k === 'nextNumber') { const h = $('#next-hint'); if (h) h.innerHTML = `Invoice berikutnya: <b>${esc(nextNumberStr())}</b>`; }
    if (k === 'businessName') updateBrand();
    saveSettingsSoon();
  }
  function processLogo(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const size = 400;
        const c = document.createElement('canvas');
        c.width = size; c.height = size;
        const sc = Math.min(size / img.naturalWidth, size / img.naturalHeight);
        const w = img.naturalWidth * sc, h = img.naturalHeight * sc;
        c.getContext('2d').drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Gambar tidak bisa dibaca')); };
      img.src = url;
    });
  }

  async function doBackup() {
    const data = { app: 'invoice-wbouquet', format: 1, exportedAt: new Date().toISOString(), settings: S.settings, invoices: S.invoices };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `cadangan-invoice-${IV.today()}.json`);
    S.settings.lastBackup = new Date().toISOString();
    await Store.set('settings', S.settings).catch(() => {});
    toast('File cadangan tersimpan di folder Download');
    if (S.route.name === 'settings') render();
  }
  async function doRestore(file) {
    let data;
    try { data = JSON.parse(await file.text()); }
    catch (e) { toast('File tidak bisa dibaca. Pilih file cadangan .json dari aplikasi ini.'); return; }
    if (!data || data.app !== 'invoice-wbouquet' || !Array.isArray(data.invoices)) { toast('Ini bukan file cadangan Invoice W Bouquet.'); return; }
    const ok = await modal({
      title: 'Pulihkan dari cadangan?',
      body: `Data usaha akan diganti dengan isi file, dan ${data.invoices.length} invoice dari file digabung dengan invoice di perangkat ini.`,
      actions: [{ label: 'Batal', value: false }, { label: 'Pulihkan', value: true, kind: 'primary' }]
    });
    if (!ok) return;
    S.settings = Object.assign(clone(DEFAULTS), data.settings || {});
    let count = 0;
    for (const inv of data.invoices) { if (inv && inv.id) { await Store.putInvoice(inv); count++; } }
    S.invoices = (await Store.allInvoices()) || [];
    sortInvoices();
    const maxN = S.invoices.reduce((m, i) => { const n = numberValue(i.number); return n != null && n > m ? n : m; }, 0);
    if (maxN >= S.settings.nextNumber) S.settings.nextNumber = maxN + 1;
    await Store.set('settings', S.settings);
    S.settingsRev++;
    toast(`${count} invoice dipulihkan`);
    render();
  }

  /* ---------------- Navigasi ---------------- */
  function parseRoute(h) {
    const p = String(h || '').replace(/^#\/?/, '').split('/').filter(Boolean);
    if (!p.length) return { name: 'list' };
    if (p[0] === 'baru') return { name: 'new' };
    if (p[0] === 'edit' && p[1]) return { name: 'edit', id: decodeURIComponent(p[1]) };
    if (p[0] === 'invoice' && p[1]) return { name: 'detail', id: decodeURIComponent(p[1]) };
    if (p[0] === 'pengaturan') return { name: 'settings' };
    return { name: 'list' };
  }
  function routeTo() {
    const r = parseRoute(location.hash);
    if (r.name === 'new') {
      if (!S.ed || !S.ed.isNew) prepareNew();
    } else if (r.name === 'edit') {
      const inv = byId(r.id);
      if (!inv) { location.replace('#/'); return; }
      if (!S.ed || S.ed.isNew || S.ed.draft.id !== r.id) S.ed = { draft: clone(inv), isNew: false, dirty: false, pane: 'form', dueTouched: true, restored: false };
    } else {
      S.ed = null;
    }
    if (r.name === 'detail' && !byId(r.id)) { location.replace('#/'); return; }
    S.route = r;
    render();
  }
  function render() {
    const r = S.route;
    const isEd = r.name === 'new' || r.name === 'edit';
    document.body.classList.toggle('mode-editor', isEd);
    let content = '', active = 'list';
    if (r.name === 'list') content = viewList();
    else if (isEd) { content = viewEditor(); active = r.name === 'new' ? 'new' : ''; }
    else if (r.name === 'detail') content = viewDetail(byId(r.id));
    else if (r.name === 'settings') { content = viewSettings(); active = 'settings'; }
    $('#app').innerHTML = shell(content, active);
    window.scrollTo(0, 0);
    if (r.name === 'detail') {
      const inv = byId(r.id);
      mountPreview($('#pv'), inv);
      setTimeout(() => { if (S.route.name === 'detail' && S.route.id === inv.id) getPdf(inv).catch(() => {}); }, 700);
    } else if (isEd) {
      mountPreview($('#pv'), S.ed.draft);
    }
  }

  let curHash = location.hash || '#/';
  let ignoreHash = false;
  window.addEventListener('hashchange', async () => {
    if (ignoreHash) { ignoreHash = false; curHash = location.hash || '#/'; return; }
    const target = location.hash || '#/';
    if (S.ed && !S.ed.isNew && S.ed.dirty) {
      ignoreHash = true;
      location.hash = curHash;
      const v = await modal({
        title: 'Perubahan belum disimpan',
        body: 'Simpan perubahan pada invoice ini sebelum keluar?',
        actions: [{ label: 'Tetap di sini', value: 'stay' }, { label: 'Buang', value: 'discard', kind: 'danger' }, { label: 'Simpan', value: 'save', kind: 'primary' }]
      });
      if (v === 'discard') { S.ed.dirty = false; location.hash = target; }
      else if (v === 'save') await saveInvoice();
      return;
    }
    curHash = target;
    routeTo();
  });
  window.addEventListener('beforeunload', (e) => {
    if (S.ed && !S.ed.isNew && S.ed.dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ---------------- Aksi ---------------- */
  document.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const act = a.dataset.act;
    const r = S.route;
    switch (act) {
      case 'filter':
        S.list.f = a.dataset.v;
        document.querySelectorAll('[data-act="filter"]').forEach((b) => b.setAttribute('aria-pressed', String(b === a)));
        $('#list-body').innerHTML = listBody();
        break;
      case 'pane': setPane(a.dataset.v); break;
      case 'add-item': {
        const it = newItem();
        S.ed.draft.items.push(it);
        renderItems(it.id);
        S.ed.dirty = true; afterEdit();
        break;
      }
      case 'del-item': {
        const d = S.ed.draft;
        if (d.items.length <= 1) d.items = [newItem()];
        else d.items = d.items.filter((x) => x.id !== a.dataset.id);
        renderItems();
        S.ed.dirty = true; afterEdit();
        break;
      }
      case 'new-fresh':
        S.draftNew = null;
        Store.del('draftNew').catch(() => {});
        S.ed = { draft: newDraft(), isNew: true, dirty: false, pane: 'form', dueTouched: false, restored: false };
        render();
        break;
      case 'save': await saveInvoice(); break;
      case 'share-pdf': await onSharePdf(a); break;
      case 'download-pdf': await onDownloadPdf(a); break;
      case 'toggle-paid': {
        const inv = byId(r.id);
        if (!inv) break;
        inv.status = inv.status === 'paid' ? 'unpaid' : 'paid';
        inv.paidAt = inv.status === 'paid' ? IV.today() : null;
        inv.updatedAt = new Date().toISOString();
        await Store.putInvoice(clone(inv)).catch(() => toast('Gagal menyimpan status.'));
        toast(inv.status === 'paid' ? 'Ditandai lunas' : 'Ditandai belum lunas');
        render();
        break;
      }
      case 'duplicate': {
        const inv = byId(r.id);
        if (!inv) break;
        const d = newDraft();
        Object.assign(d, {
          template: inv.template, client: clone(inv.client),
          items: inv.items.map((it) => Object.assign(clone(it), { id: uid() })),
          discount: inv.discount || 0, shipping: inv.shipping || 0, notes: inv.notes || ''
        });
        S.draftNew = d;
        Store.set('draftNew', clone(d)).catch(() => {});
        prepareNew(d);
        location.hash = '#/baru';
        toast('Salinan dibuat. Periksa lalu simpan.');
        break;
      }
      case 'delete': {
        const inv = byId(r.id);
        if (!inv) break;
        const ok = await modal({ title: `Hapus ${inv.number}?`, body: 'Invoice ini akan dihapus dari perangkat dan tidak bisa dikembalikan, kecuali dari file cadangan.', actions: [{ label: 'Batal', value: false }, { label: 'Hapus', value: true, kind: 'danger' }] });
        if (!ok) break;
        await Store.delInvoice(inv.id).catch(() => {});
        S.invoices = S.invoices.filter((i) => i.id !== inv.id);
        location.hash = '#/';
        toast('Invoice dihapus');
        break;
      }
      case 'logo-reset':
        S.settings.logo = null;
        saveSettingsSoon();
        render();
        break;
      case 'backup': await doBackup(); break;
      case 'reset-defaults': {
        const ok = await modal({ title: 'Kembalikan data usaha bawaan?', body: 'Nama usaha, alamat, kontak, rekening, logo, catatan, dan ucapan kembali ke data bawaan W Bouquet. Nomor invoice dan riwayat tidak berubah.', actions: [{ label: 'Batal', value: false }, { label: 'Kembalikan', value: true, kind: 'primary' }] });
        if (!ok) break;
        BUSINESS_KEYS.forEach((k) => { S.settings[k] = DEFAULTS[k]; });
        await Store.set('settings', S.settings).catch(() => {});
        S.settingsRev++;
        toast('Data usaha bawaan dikembalikan');
        render();
        break;
      }
      case 'wipe': {
        const ok = await modal({ title: 'Hapus semua data?', body: 'Semua invoice dan pengaturan di perangkat ini akan dihapus. Simpan cadangan dulu jika masih dibutuhkan.', actions: [{ label: 'Batal', value: false }, { label: 'Hapus semua', value: true, kind: 'danger' }] });
        if (!ok) break;
        await Store.clearAll().catch(() => {});
        S.settings = clone(DEFAULTS);
        S.invoices = [];
        S.draftNew = null;
        S.settingsRev++;
        await Store.set('settings', S.settings).catch(() => {});
        toast('Semua data dihapus');
        location.hash = '#/';
        if (S.route.name === 'list') render();
        break;
      }
      case 'install':
        if (!S.installEvt) break;
        S.installEvt.prompt();
        try { const c = await S.installEvt.userChoice; if (c && c.outcome === 'accepted') toast('Aplikasi dipasang di layar utama'); } catch (x) { /* abaikan */ }
        S.installEvt = null;
        refreshInstallSlot();
        break;
      case 'update-reload':
        if (S.ed && S.ed.dirty && !S.ed.isNew) { toast('Simpan invoice yang sedang diedit dulu.'); break; }
        S.updateRequested = true;
        if (S.swWaiting) S.swWaiting.postMessage('skipWaiting'); else location.reload();
        break;
    }
  });

  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.id === 'q') { S.list.q = el.value; const b = $('#list-body'); if (b) b.innerHTML = listBody(); return; }
    if (el.dataset && el.dataset.s) { settingsInput(el); return; }
    if (el.closest && el.closest('#ed-form')) editorInput(el);
  });

  document.addEventListener('change', async (e) => {
    const el = e.target;
    if (el.id === 'f-cname') { autofillClient(); return; }
    if (el.id === 'logo-file' && el.files && el.files[0]) {
      try { S.settings.logo = await processLogo(el.files[0]); saveSettingsSoon(); render(); toast('Logo diganti'); }
      catch (err) { toast('Gambar tidak bisa dipakai. Coba file PNG atau JPG.'); }
      return;
    }
    if (el.id === 'restore-file' && el.files && el.files[0]) { await doRestore(el.files[0]); el.value = ''; }
  });

  /* ---------------- Pemasangan & pembaruan ---------------- */
  function refreshInstallSlot() {
    const slot = $('#install-slot');
    if (slot) slot.innerHTML = installCard(S.route.name === 'settings' ? 'settings' : 'list');
  }
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.installEvt = e; refreshInstallSlot(); });
  window.addEventListener('appinstalled', () => { S.installEvt = null; refreshInstallSlot(); });

  function showUpdate(worker) {
    S.swWaiting = worker;
    $('#update-root').innerHTML = `<div class="update-bar" role="status"><span>Versi baru aplikasi tersedia.</span><button type="button" class="btn small" data-act="update-reload">Muat ulang</button></div>`;
  }
  function registerSW() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    navigator.serviceWorker.register('sw.js').then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate(w); });
      });
    }).catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (S.updateRequested) location.reload(); });
  }

  /* ---------------- Mulai ---------------- */
  async function boot() {
    await Store.init();
    let saved = null;
    try { saved = await Store.get('settings'); } catch (e) { saved = null; }
    S.settings = Object.assign(clone(DEFAULTS), saved || {});
    if (!saved) Store.set('settings', S.settings).catch(() => {});
    try { S.invoices = (await Store.allInvoices()) || []; } catch (e) { S.invoices = []; }
    sortInvoices();
    try { S.draftNew = (await Store.get('draftNew')) || null; } catch (e) { S.draftNew = null; }
    routeTo();
    registerSW();
  }
  boot();
})();
