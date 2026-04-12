# Admin UI Style Guide (Mini)

Tanggal update: 2026-04-12
Scope: dashboard admin Crumbella (desktop + mobile).

## 1) Layout

- Dashboard shell: dua area scroll independen (sidebar + main).
- Sidebar: panel premium dengan border lembut, gradient warm-cool, dan separator tipis.
- Main content: wrapper card besar dengan glow halus, bukan flat box.

## 2) Radius

- Button/filter chip: `rounded-xl` atau `rounded-2xl`
- Card utama: `rounded-3xl`
- Modal utama: `rounded-3xl`
- Hindari `rounded-md` pada surface utama agar tidak terlihat boxy.

## 3) Border & Ring

- Border utama: pakai tone token border (`#ffd8b7`)
- Ring halus diprioritaskan daripada border tebal.
- Separator antar panel gunakan gradient line tipis, bukan garis keras gelap.

## 4) Shadow

- Gunakan shadow lembut dengan blur besar dan opacity rendah.
- Hindari shadow kecil yang keras (`shadow-sm`) untuk card utama.
- Modal boleh memakai shadow lebih dalam, tetap warm-neutral.

## 5) Typography

- Heading section: tegas dengan warna primary.
- Supporting text: gunakan muted.
- Label status gunakan semantic color (success/warning/danger/info).

## 6) Interaction

- Hover: subtle lift/tint, jangan loncat terlalu besar.
- Focus-visible: outline 2px dari token focus.
- Active nav: kombinasi border + gradient background (bukan warna solid gelap saja).

## 7) Mobile Behavior

- Bottom nav tetap simple dengan active state jelas.
- Drawer mobile konsisten radius, border, dan highlight dengan desktop sidebar.
- Jarak sentuh minimal 44px untuk item interaktif utama.

## 8) Done Criteria

Sebuah halaman dianggap sesuai style guide jika:

- Hierarki visual jelas dalam 3 detik pertama.
- Tidak ada komponen yang terlihat dari tema lama (indigo/purple default).
- State hover/focus/active konsisten.
- Tampilan mobile tetap terbaca tanpa kompresi berlebihan.
