/* Invoice W Bouquet — pembantu format & dua template invoice (Serif Elegan, Sans Modern).
   Setiap template menerima (invoice, pengaturan) dan mengembalikan HTML kertas A4 selebar 794 px. */
(function (global) {
  'use strict';

  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function lines(s) {
    return String(s == null ? '' : s).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map(esc).join('<br>');
  }
  function num(n) {
    const v = Math.round(Number(n) || 0);
    return String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  function rp(n) {
    const v = Math.round(Number(n) || 0);
    return (v < 0 ? '−' : '') + 'Rp' + num(v);
  }
  function parseDate(iso) {
    if (!iso || typeof iso !== 'string') return null;
    const p = iso.split('-').map(Number);
    if (!p[0] || !p[1] || !p[2]) return null;
    return new Date(p[0], p[1] - 1, p[2]);
  }
  function tgl(iso, short) {
    const d = parseDate(iso);
    if (!d) return '—';
    return d.getDate() + ' ' + (short ? BLN : BULAN)[d.getMonth()] + ' ' + d.getFullYear();
  }
  function toIso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function today() { return toIso(new Date()); }
  function addDays(iso, n) {
    const d = parseDate(iso) || new Date();
    d.setDate(d.getDate() + (Number(n) || 0));
    return toIso(d);
  }
  function daysBetween(a, b) {
    const x = parseDate(a), y = parseDate(b);
    if (!x || !y) return null;
    return Math.round((y - x) / 86400000);
  }

  const SATUAN = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
  function eja(x) {
    if (x < 12) return SATUAN[x];
    if (x < 20) return eja(x - 10) + ' belas';
    if (x < 100) return eja(Math.floor(x / 10)) + ' puluh' + (x % 10 ? ' ' + eja(x % 10) : '');
    if (x < 200) return 'seratus' + (x - 100 ? ' ' + eja(x - 100) : '');
    if (x < 1000) return eja(Math.floor(x / 100)) + ' ratus' + (x % 100 ? ' ' + eja(x % 100) : '');
    if (x < 2000) return 'seribu' + (x - 1000 ? ' ' + eja(x - 1000) : '');
    if (x < 1e6) return eja(Math.floor(x / 1000)) + ' ribu' + (x % 1000 ? ' ' + eja(x % 1000) : '');
    if (x < 1e9) return eja(Math.floor(x / 1e6)) + ' juta' + (x % 1e6 ? ' ' + eja(x % 1e6) : '');
    if (x < 1e12) return eja(Math.floor(x / 1e9)) + ' miliar' + (x % 1e9 ? ' ' + eja(x % 1e9) : '');
    return eja(Math.floor(x / 1e12)) + ' triliun' + (x % 1e12 ? ' ' + eja(x % 1e12) : '');
  }
  function terbilang(n) {
    const v = Math.floor(Math.abs(Number(n) || 0));
    const s = (v === 0 ? 'nol' : eja(v)) + ' rupiah';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function totals(inv) {
    const sub = (inv.items || []).reduce((t, it) => t + (Number(it.price) || 0) * (Number(it.qty) || 0), 0);
    const disc = Math.max(0, Number(inv.discount) || 0);
    const ship = Math.max(0, Number(inv.shipping) || 0);
    return { sub, disc, ship, total: Math.max(0, sub - disc + ship) };
  }

  /* Catatan bisa memakai {nomor}, {telepon}, {jatuh_tempo}. Baris yang token-nya kosong dibuang. */
  function notesText(inv, s) {
    const map = { nomor: inv.number || '', telepon: s.phone || '', jatuh_tempo: inv.dueDate ? tgl(inv.dueDate) : '' };
    return String(inv.notes || '').split(/\r?\n/).map((line) => {
      let empty = false;
      const out = line.replace(/\{(nomor|telepon|jatuh_tempo)\}/g, (m, k) => { if (!map[k]) empty = true; return map[k]; });
      return empty ? '' : out.trim();
    }).filter(Boolean);
  }

  function validItems(inv) {
    return (inv.items || []).filter((it) => String(it.name || '').trim() || Number(it.price));
  }
  function clientBlock(inv) {
    const c = inv.client || {};
    return [lines(c.address), esc(c.phone), esc(c.email)].filter(Boolean).join('<br>');
  }
  function hasBank(s) { return !!(s.bankName || s.bankAccount || s.bankHolder); }

  const ic = {
    clock: (col) => `<svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>`,
    check: (col) => `<svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>`,
    bank: (col) => `<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10l9-6 9 6"></path><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8"></path><path d="M3 20h18"></path></svg>`,
    pin: (col) => `<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-4.5-7-10a7 7 0 0 1 14 0c0 5.5-7 10-7 10z"></path><circle cx="12" cy="11" r="2.5"></circle></svg>`,
    chat: (col) => `<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1.4-4.2A8 8 0 1 1 8.6 19z"></path></svg>`
  };

  /* ---------------- Template 1: Serif Elegan ---------------- */
  function serif(inv, s) {
    const acc = s.accent || '#3A2348';
    const T = totals(inv);
    const items = validItems(inv);
    const paid = inv.status === 'paid';
    const term = daysBetween(inv.issueDate, inv.dueDate);
    const contact = [s.phone, s.email].filter(Boolean).map(esc).join(' · ');
    const baddr = [lines(s.address), contact].filter(Boolean).join('<br>');
    const notes = notesText(inv, s);
    const fullName = [s.businessName, s.location].filter(Boolean).join(' ');

    const rows = items.map((it, i) => `
      <tr>
        <td class="s-no">${String(i + 1).padStart(2, '0')}</td>
        <td><div class="it-name">${esc(it.name)}</div>${it.note ? `<div class="it-note">${esc(it.note)}</div>` : ''}</td>
        <td class="r">${rp(it.price)}</td>
        <td class="c">${num(it.qty)}</td>
        <td class="r" style="font-weight:700">${rp((Number(it.price) || 0) * (Number(it.qty) || 0))}</td>
      </tr>`).join('');

    const extra = [
      `<div class="s-srow"><span class="k">Subtotal</span><span class="v">${rp(T.sub)}</span></div>`,
      T.disc ? `<div class="s-srow"><span class="k">Diskon</span><span class="v">−${rp(T.disc)}</span></div>` : '',
      T.ship ? `<div class="s-srow"><span class="k">Ongkos kirim</span><span class="v">${rp(T.ship)}</span></div>` : ''
    ].join('');

    const pay = hasBank(s) ? `
      <div class="s-pay">
        <div class="s-lbl">${ic.bank(acc)}Instruksi pembayaran</div>
        <div class="s-pgrid">
          ${s.bankName ? `<span class="k">Bank</span><span class="v">${esc(s.bankName)}</span>` : ''}
          ${s.bankAccount ? `<span class="k">No. Rekening</span><span class="acct">${esc(s.bankAccount)}</span>` : ''}
          ${s.bankHolder ? `<span class="k">Atas Nama</span><span class="v">${esc(s.bankHolder)}</span>` : ''}
          <span class="k">Mata Uang</span><span class="v">${esc(s.currency || 'IDR (Rupiah)')}</span>
        </div>
      </div>` : '';

    const notesHtml = notes.length ? `<div><div class="s-lbl">Catatan</div><div class="s-notes">${notes.map(esc).join('<br>')}</div></div>` : '';

    const contacts = [
      s.social ? `<span>${ic.pin('#6B5F70')}${esc(s.social)}</span>` : '',
      s.phone ? `<span>${ic.chat('#6B5F70')}${esc(s.phone)}</span>` : ''
    ].join('');

    return `
<div class="inv inv-serif" style="--acc:${esc(acc)}">
  <div class="s-bar"></div>
  <header class="s-hd">
    <div class="s-brand">
      <img class="s-logo" src="${esc(s.logo || 'logo.png')}" alt="">
      <div>
        <div class="s-bname">${esc(s.businessName || 'Nama Usaha')}</div>
        ${s.location ? `<div class="s-bloc">${esc(s.location)}</div>` : ''}
        ${baddr ? `<div class="s-baddr">${baddr}</div>` : ''}
      </div>
    </div>
    <div class="s-ttl">
      <h1>INVOICE</h1>
      <div class="s-num">No. ${esc(inv.number || '—')}</div>
      ${paid
        ? `<div class="s-badge paid">${ic.check('#FFFFFF')}LUNAS</div>`
        : `<div class="s-badge">${ic.clock(acc)}BELUM LUNAS</div>`}
    </div>
  </header>

  <section class="s-sec s-bill">
    <div>
      <div class="s-lbl">Ditagih kepada</div>
      <div class="s-cname">${esc((inv.client && inv.client.name) || '—')}</div>
      ${clientBlock(inv) ? `<div class="s-caddr">${clientBlock(inv)}</div>` : ''}
    </div>
    <div class="s-meta">
      <div class="s-mrow"><span class="k">Tanggal Terbit</span><span class="v">${tgl(inv.issueDate)}</span></div>
      <div class="s-mrow"><span class="k">Jatuh Tempo</span><span class="v">${tgl(inv.dueDate)}</span></div>
      ${term > 0 ? `<div class="s-mrow"><span class="k">Termin</span><span class="v">${term} hari</span></div>` : ''}
      <div class="s-msep"></div>
      <div class="s-lbl">Jumlah tagihan</div>
      <div class="s-mtotal">${rp(T.total)}</div>
    </div>
  </section>

  <section class="s-sec">
    <table class="s-table">
      <thead><tr>
        <th style="width:44px">No</th><th>Deskripsi</th><th class="r" style="width:120px">Harga</th><th class="c" style="width:64px">Qty</th><th class="r" style="width:120px">Jumlah</th>
      </tr></thead>
      <tbody>${rows || '<tr><td></td><td style="color:#6B5F70">Belum ada barang</td><td></td><td></td><td></td></tr>'}</tbody>
    </table>
  </section>

  <section class="s-sec s-totals">
    <div class="s-words"><div class="s-lbl">Terbilang</div><div class="w">${terbilang(T.total)}</div></div>
    <div class="s-sum">
      ${extra}
      <div class="s-due"><span class="k">TOTAL TAGIHAN</span><span class="v">${rp(T.total)}</span></div>
    </div>
  </section>

  <section class="s-sec s-foot-grid">
    <div class="s-left">${pay}${notesHtml}</div>
    <div class="s-sign">
      <div class="t">${s.location ? esc(s.location) + ', ' : ''}${tgl(inv.issueDate)}</div>
      <div class="t">Hormat kami,</div>
      <div class="line"></div>
      <div class="nm">${esc(s.signer || ' ')}</div>
      <div class="bz">${esc(fullName)}</div>
    </div>
  </section>

  <footer class="s-ft">
    <div class="s-thanks">${esc(s.thanks || 'Terima kasih atas kepercayaan Anda.')}</div>
    <div class="s-contacts">${contacts}</div>
  </footer>
</div>`;
  }

  /* ---------------- Template 2: Sans Modern ---------------- */
  function sans(inv, s) {
    const acc = s.accent || '#3A2348';
    const side = s.sideColor || '#EFE6F2';
    const T = totals(inv);
    const items = validItems(inv);
    const paid = inv.status === 'paid';
    const notes = notesText(inv, s);
    const c = inv.client || {};
    const baddr = [lines(s.address), esc(s.phone), esc(s.email)].filter(Boolean).join('<br>');
    const fullName = [s.businessName, s.location].filter(Boolean).join(' ');

    const rows = items.map((it) => `
      <div class="m-irow">
        <div><div class="it-name">${esc(it.name)}</div>${it.note ? `<div class="it-note">${esc(it.note)}</div>` : ''}</div>
        <span class="r">${rp(it.price)}</span>
        <span class="c">${num(it.qty)}</span>
        <span class="r" style="font-weight:700">${rp((Number(it.price) || 0) * (Number(it.qty) || 0))}</span>
      </div>`).join('');

    const pay = hasBank(s) ? `
      <div class="m-lbl">Pembayaran</div>
      <div class="m-pay">
        ${s.bankName ? `<div><div class="k">Bank</div><div class="v">${esc(s.bankName)}</div></div>` : ''}
        ${s.bankAccount ? `<div><div class="k">No. Rekening</div><div class="acct">${esc(s.bankAccount)}</div></div>` : ''}
        ${s.bankHolder ? `<div><div class="k">Atas Nama</div><div class="v">${esc(s.bankHolder)}</div></div>` : ''}
        <div><div class="k">Mata Uang</div><div class="v">${esc(s.currency || 'IDR (Rupiah)')}</div></div>
      </div>` : '';
    const notesHtml = notes.length ? `<div class="m-gap"></div><div class="m-lbl">Catatan</div><div class="m-notes">${notes.map((n) => `<div>${esc(n)}</div>`).join('')}</div>` : '';

    const left = [lines(c.address)].filter(Boolean).join('');
    const right = [esc(c.phone), esc(c.email)].filter(Boolean).join('<br>');

    return `
<div class="inv inv-sans" style="--acc:${esc(acc)};--side:${esc(side)}">
  <aside class="m-side">
    <img class="m-logo" src="${esc(s.logo || 'logo.png')}" alt="">
    <div class="m-bname">${esc(s.businessName || 'Nama Usaha')}${s.location ? '<br>' + esc(s.location) : ''}</div>
    ${baddr ? `<div class="m-baddr">${baddr}</div>` : ''}
    <div class="m-div"></div>
    ${pay}
    ${notesHtml}
    <div class="m-bottom">
      <div class="m-thanks">${esc(s.thanks || 'Terima kasih atas kepercayaan Anda.')}</div>
      ${s.social ? `<div class="m-social">${esc(s.social)}</div>` : ''}
    </div>
  </aside>
  <div class="m-main">
    <div class="m-top">
      <h1>Invoice</h1>
      ${paid
        ? `<div class="m-badge paid">${ic.check('#1E5B34')}LUNAS</div>`
        : `<div class="m-badge">${ic.clock('#7A4A00')}BELUM LUNAS</div>`}
    </div>
    <div class="m-meta">
      <div><div class="k">No. Invoice</div><div class="v">${esc(inv.number || '—')}</div></div>
      <div><div class="k">Tanggal Terbit</div><div class="v">${tgl(inv.issueDate, true)}</div></div>
      <div><div class="k">Jatuh Tempo</div><div class="v">${tgl(inv.dueDate, true)}</div></div>
    </div>
    <div class="m-bill">
      <div class="m-lbl">Ditagih kepada</div>
      <div class="m-cname">${esc(c.name || '—')}</div>
      ${(left && right) ? `<div class="m-cgrid"><div>${left}</div><div>${right}</div></div>` : ((left || right) ? `<div class="m-cgrid" style="grid-template-columns:minmax(0,1fr)"><div>${left || right}</div></div>` : '')}
    </div>
    <div class="m-items">
      <div class="m-ihead"><span>DESKRIPSI</span><span class="r">HARGA</span><span class="c">QTY</span><span class="r">JUMLAH</span></div>
      ${rows || '<div class="m-irow"><div style="color:#6A6070">Belum ada barang</div><span></span><span></span><span></span></div>'}
    </div>
    <div class="m-sum">
      <div class="m-srow"><span class="k">Subtotal</span><span class="v">${rp(T.sub)}</span></div>
      ${T.disc ? `<div class="m-srow"><span class="k">Diskon</span><span class="v">−${rp(T.disc)}</span></div>` : ''}
      ${T.ship ? `<div class="m-srow"><span class="k">Ongkos kirim</span><span class="v">${rp(T.ship)}</span></div>` : ''}
    </div>
    <div class="m-due">
      <div>
        <div class="lbl2">TOTAL TAGIHAN</div>
        <div class="w">Terbilang: ${terbilang(T.total).toLowerCase()}</div>
      </div>
      <div class="amt">${rp(T.total)}</div>
    </div>
    <div class="m-sign">
      <div class="t">${s.location ? esc(s.location) + ', ' : ''}${tgl(inv.issueDate)}</div>
      <div class="t">Hormat kami,</div>
      <div class="line"></div>
      <div class="nm">${esc(s.signer || ' ')}</div>
      <div class="bz">${esc(fullName)}</div>
    </div>
  </div>
</div>`;
  }

  global.IV = { esc, lines, num, rp, tgl, today, addDays, daysBetween, parseDate, terbilang, totals, notesText, validItems };
  global.InvoiceTemplates = {
    serif: { name: 'Serif Elegan', render: serif },
    sans: { name: 'Sans Modern', render: sans }
  };
})(window);
