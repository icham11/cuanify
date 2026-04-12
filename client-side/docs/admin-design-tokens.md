# Admin Design Tokens (Crumbella)

Tanggal update: 2026-04-12
Tujuan: memastikan semua halaman baru memakai token warna yang sama, bukan hardcoded warna baru.

## 1) Core Palette

- Primary: `--crumbella-primary` = `#173a7a`
- Primary Soft: `--crumbella-primary-soft` = `#2a4d91`
- Accent: `--crumbella-accent` = `#f26a21`
- Accent Hover: `--crumbella-accent-hover` = `#d85f1c`
- Sun Highlight: `--crumbella-sun` = `#f9bd1f`
- Teal Highlight: `--crumbella-teal` = `#25b4c8`
- Surface: `--crumbella-surface` = `#ffffff`
- Border: `--crumbella-border` = `#ffd8b7`
- Muted Text: `--crumbella-muted` = `#9ca3af`

## 2) Semantic Palette

- Success: `--crumbella-success` = `#0f8f68`
- Warning: `--crumbella-warning` = `#9a5a00`
- Danger: `--crumbella-danger` = `#b42318`
- Info: `--crumbella-info` = `#0f6f7d`
- Focus Ring: `--crumbella-focus` = `#173a7a`

## 3) Usage Rules

- Pakai token di [app/globals.css](app/globals.css) sebagai sumber tunggal warna.
- Kalau butuh warna baru, update token dulu, jangan langsung hardcode di komponen.
- Hindari tone ungu lama untuk komponen baru.
- Untuk state interaktif:
  - default: primary atau accent
  - hover: accent-hover atau tint surface
  - focus-visible: focus token
- Untuk status:
  - success/info/warning/danger wajib pakai semantic token.

## 4) QA Token

- Cek minimal 1 page per domain (dashboard, bakery, auth) agar tidak muncul palette liar.
- Jika ditemukan hardcoded warna baru, pindahkan ke token lalu pakai token tersebut.
