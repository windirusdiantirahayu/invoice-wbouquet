# Invoice W Bouquet

Aplikasi web (PWA) untuk membuat, menyimpan, dan mengirim invoice W Bouquet Sangkulirang langsung dari HP. Bisa dipasang di layar utama Android dan tetap jalan tanpa internet.

## Fitur

- Buat invoice dengan pratinjau langsung. Total, terbilang, dan nomor invoice terisi otomatis.
- Dua desain: **Serif Elegan** dan **Sans Modern**.
- Unduh PDF A4, atau bagikan langsung ke WhatsApp.
- Riwayat invoice dengan pencarian, status lunas/belum lunas, dan tanda lewat jatuh tempo.
- Data usaha W Bouquet sudah terisi bawaan, dan tetap bisa diubah di menu **Pengaturan**.
- Cadangan dan pemulihan data lewat file `.json`.

## Memasang di GitHub Pages (unggah manual)

1. Buka repository di GitHub, lalu pilih **Add file → Upload files**.
2. Ekstrak file zip di komputer. Seret **semua isi folder** (bukan foldernya) ke halaman unggah: `index.html`, `app.js`, `sw.js`, folder `fonts`, `icons`, `vendor`, dan seterusnya.
3. Klik **Commit changes**.
4. Buka **Settings → Pages**. Di bagian *Build and deployment*, pilih **Source: Deploy from a branch**, branch **main**, folder **/ (root)**, lalu **Save**.
5. Tunggu 1–2 menit. Alamat situs muncul di halaman yang sama, misalnya `https://windirusdiantirahayu.github.io/invoice-wbouquet/`.

> GitHub Pages gratis hanya untuk repository **publik**. Untuk repository privat dibutuhkan paket berbayar, dan situsnya tetap bisa dibuka siapa pun yang tahu alamatnya.

## Memasang di HP klien

1. Buka alamat situs di **Chrome Android**.
2. Ketuk tombol **Pasang aplikasi** di aplikasi, atau menu ⋮ → **Tambahkan ke layar utama / Instal aplikasi**.
3. Ikon W Bouquet muncul di layar utama. Setelah dibuka sekali dengan internet, aplikasi bisa dipakai offline.

## Di mana data tersimpan

| Data | Tempat |
|---|---|
| Kode aplikasi | GitHub Pages, ditambah salinan otomatis di HP |
| Invoice & pengaturan | Penyimpanan browser (IndexedDB) di HP klien, tidak dikirim ke server mana pun |
| File PDF | Folder **Download** di HP, atau langsung dibagikan ke WhatsApp |
| File cadangan | Folder **Download**, nama `cadangan-invoice-YYYY-MM-DD.json` |

Data invoice hanya ada di satu HP. Menghapus data Chrome, uninstall, atau ganti HP akan menghapusnya, jadi **simpan cadangan secara berkala** (Pengaturan → Simpan cadangan), lalu kirim filenya ke Google Drive atau WhatsApp. Untuk memindahkan ke HP lain, pakai **Pulihkan dari file**.

## Mengubah aplikasi

- **Data usaha bawaan** (nama, alamat, rekening, catatan): ubah objek `DEFAULTS` di bagian atas `app.js`. Perubahan ini hanya berlaku untuk HP yang belum pernah membuka aplikasi, atau setelah klien menekan **Kembalikan data usaha bawaan**. Klien juga bisa mengubah semuanya sendiri di menu Pengaturan.
- **Desain invoice**: fungsi `serif()` dan `sans()` di `templates.js`, gayanya di bagian bawah `styles.css` (kelas `.inv-serif` dan `.inv-sans`).
- **Setiap kali mengubah file**, naikkan `VERSION` di `sw.js` (misal `wb-invoice-v1` → `wb-invoice-v2`), lalu unggah ulang. Aplikasi di HP akan menampilkan pesan **Versi baru tersedia → Muat ulang**. Data klien tidak hilang.

## Isi folder

```
index.html             halaman aplikasi
app.js                 logika aplikasi + data usaha bawaan
templates.js           dua template invoice, format rupiah, tanggal, terbilang
styles.css             tampilan aplikasi dan invoice
sw.js                  mode offline
manifest.webmanifest   nama & ikon saat dipasang di HP
logo.png, icons/       logo dan ikon aplikasi
fonts/                 huruf Cormorant Garamond, Manrope, Plus Jakarta Sans (lisensi SIL OFL)
vendor/                jsPDF dan html2canvas (lisensi MIT) untuk membuat PDF
```
