/**
 * Pengaman penulisan ke kolom `jsonb`.
 *
 * Teks dari WhatsApp/paste sering terpotong di tengah emoji, menyisakan setengah
 * surrogate pair (mis. `\uD83C` tanpa `\uDF0A` dari 🌊). Karakter itu tidak bisa
 * diwakili dalam UTF-8 yang sah, dan `JSON.stringify` (perilaku well-formed sejak
 * ES2019) meng-escape-nya jadi teks `\ud83c`. Postgres menolak escape tersebut saat
 * mem-parse jsonb: `22P02 invalid input syntax for type json`.
 *
 * Karena penulisan booking berjalan dalam satu transaksi, satu item bermasalah
 * menggagalkan seluruh order dan mendorongnya ke jalur snapshot-fallback (HTTP 503) —
 * order tampil di daftar Bookings tapi tidak pernah punya baris di `bakery_orders`.
 *
 * Catatan: kolom `text` tidak ikut gagal. Driver diam-diam mengganti surrogate yatim
 * dengan U+FFFD (`�`), jadi kerusakannya tidak terlihat sampai menyentuh jsonb.
 */

// Surrogate tinggi tanpa pasangan rendah, atau surrogate rendah tanpa pasangan tinggi.
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/**
 * Petunjuk cepat bahwa hasil stringify memuat surrogate yatim. `JSON.stringify`
 * hanya meng-escape surrogate yang tidak berpasangan — pasangan yang sah ditulis
 * sebagai karakter aslinya. Jadi escape `\uD800`–`\uDFFF` pada output praktis selalu
 * menandakan surrogate yatim. Ini sekadar penapis agar deep-walk tidak dijalankan
 * untuk mayoritas payload yang bersih; positif palsu (teks yang memang berisi
 * literal "\ud83c") hanya memicu satu walk tambahan yang tidak mengubah apa pun.
 */
// Rentang surrogate adalah U+D800–U+DFFF, jadi nibble kedua selalu 8–F.
// Menyempitkannya (mis. hanya 8–B) akan melewatkan surrogate rendah yatim.
const ESCAPED_SURROGATE_HINT = /\\u[dD][89abcdefABCDEF][0-9a-fA-F]{2}/;

/** Buang surrogate yatim dari seluruh string di dalam struktur, rekursif. */
export function stripLoneSurrogates<T>(value: T): T {
  if (typeof value === "string") {
    return value.replace(LONE_SURROGATE, "") as unknown as T;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => stripLoneSurrogates(entry)) as unknown as T;
  }

  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source)) {
      result[key] = stripLoneSurrogates(source[key]);
    }
    return result as unknown as T;
  }

  return value;
}

/** True bila ada string di dalam struktur yang memuat surrogate yatim. */
export function hasLoneSurrogates(value: unknown): boolean {
  const json = JSON.stringify(value ?? null);
  if (json === undefined) return false;
  if (!ESCAPED_SURROGATE_HINT.test(json)) return false;
  return json !== JSON.stringify(stripLoneSurrogates(value ?? null));
}

/**
 * Serialisasi nilai untuk parameter `::jsonb`. Pakai ini menggantikan
 * `JSON.stringify(...)` di setiap penulisan jsonb.
 */
export function toJsonb(value: unknown): string {
  const json = JSON.stringify(value ?? null);
  if (json === undefined) return "null";
  if (!ESCAPED_SURROGATE_HINT.test(json)) return json;

  const cleaned = JSON.stringify(stripLoneSurrogates(value ?? null));
  return cleaned === undefined ? "null" : cleaned;
}
