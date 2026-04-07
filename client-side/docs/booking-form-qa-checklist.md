# Checklist QA Manual - Booking Form (Category to Add-ons)

Tujuan: validasi cepat alur dari pemilihan kategori sampai total biaya, token, dan submit notes.

## A. Persiapan

- [ ] Buka form booking baru.
- [ ] Pastikan tidak ada error validasi global.
- [ ] Pastikan dapat tambah lebih dari 1 item order.

## B. Validasi Dasar Katalog

- [ ] Ganti `Category` -> `Subcategory` dan `Product` ikut menyesuaikan.
- [ ] Ganti `Product` -> `Varian / Size` ikut menyesuaikan.
- [ ] Saat category berubah, add-ons item direset.
- [ ] Item baru punya default sesuai category awal.

## C. Buket - Field Khusus

- [ ] Muncul field `Harga Cookie / pcs`.
- [ ] Default `Harga Cookie / pcs` = Rp 17.000 jika tidak diisi.
- [ ] Bisa input custom harga cookie (contoh 20.000).
- [ ] Muncul field `Kartu Ucapan` di atas `Customer Notes`.
- [ ] Di bawah `Customer Notes` muncul field:
  - `Warna kertas bouquet`
  - `Ribbon`
  - `Jumlah Bunga`
  - `Warna Bunga`
  - `Warna Pita`
- [ ] Subtotal buket mengikuti formula: `(harga cookie x qty) + base bouquet`.

## D. Buket - Add-ons Bunga

- [ ] Add-on `Additional 3 Bunga` dan `Additional 6 Bunga` muncul.
- [ ] Harga add-on bunga mengikuti tipe bouquet (Hand vs Standing).
- [ ] Add-on bunga tidak bisa edit quantity.
- [ ] Add-on bunga tidak bisa override price manual.
- [ ] Add-on bunga tidak ikut multiplier quantity bouquet (fixed per item).

## E. Cupcakes - Token Rule

- [ ] `Dozen Cupcake` dihitung 2 token per pcs.
- [ ] `Individual Cupcake` dihitung 5 token per pcs.
- [ ] Add-on cookie pada cupcake menambah token sesuai mapping add-on.

## F. Cookies - Difficulty

- [ ] Difficulty token hanya muncul untuk category `Cookies`.
- [ ] Ubah difficulty mengubah estimasi token item.
- [ ] Custom cookies dengan breakdown tetap tersimpan di notes submit.

## G. Cake & Cookies Tower

- [ ] Cake one-tier dihitung 100 token per qty.
- [ ] Cake two-tier dihitung 200 token per qty.
- [ ] Cookies Tower dihitung 100 token per qty.

## H. Submit & Notes

- [ ] Submit berhasil untuk order campuran (>=2 item beda category).
- [ ] Notes item Buket menyertakan:
  - `Warna kertas bouquet`
  - `Ribbon`
  - `Jumlah Bunga`
  - `Warna Bunga`
  - `Warna Pita`
  - `Kartu ucapan`
- [ ] Tidak ada duplikasi baris terstruktur Buket di notes.
- [ ] Total item = subtotal produk + total add-ons + add-on custom.

## I. Regression Quick Check

- [ ] Parse WA `hbq isi 10` tidak memaksa field `Jumlah Cookies` / `Warna Bunga` sebagai wajib parser.
- [ ] Parser masih bisa map `hbq`/`sbq` ke produk buket yang benar.
- [ ] Parser multiple item (Item 1, Item 2, Item 3) tetap terbaca.

## Status QA

- Tanggal test: ****\_\_****
- Tester: ****\_\_****
- Branch/commit: ****\_\_****
- Hasil: PASS / FAIL
- Catatan bug: ********************\_\_********************
