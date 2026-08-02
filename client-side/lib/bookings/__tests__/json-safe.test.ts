import { describe, expect, it } from "vitest";
import { hasLoneSurrogates, stripLoneSurrogates, toJsonb } from "../json-safe";

// 🌊 = U+1F30A = "🌊". Teks dari WhatsApp kadang terpotong di tengah
// pasangan ini dan menyisakan "\uD83C" sendirian.
const LONE_HIGH = "mas \uD83C";
const LONE_LOW = "\uDF0A ok";
const WHOLE_EMOJI = "mas \u{1F30A}";

describe("toJsonb", () => {
  it("membuang surrogate tinggi yang yatim", () => {
    expect(toJsonb({ n: LONE_HIGH })).toBe('{"n":"mas "}');
  });

  it("membuang surrogate rendah yang yatim", () => {
    expect(toJsonb(LONE_LOW)).toBe('" ok"');
  });

  it("menjangkau string bersarang di dalam array dan objek", () => {
    expect(toJsonb({ a: [{ b: "x\uDC00" }] })).toBe('{"a":[{"b":"x"}]}');
  });

  it("mempertahankan emoji yang pasangannya utuh", () => {
    expect(toJsonb({ n: WHOLE_EMOJI })).toBe(JSON.stringify({ n: WHOLE_EMOJI }));
  });

  it("mempertahankan emoji majemuk (ZWJ sequence)", () => {
    const family = "👨‍👩‍👧";
    expect(toJsonb({ n: family })).toBe(JSON.stringify({ n: family }));
  });

  it("tidak mengubah teks yang memang berisi literal \\ud83c", () => {
    const literal = { n: "mas \\ud83c" };
    expect(toJsonb(literal)).toBe(JSON.stringify(literal));
  });

  it("memetakan null dan undefined ke JSON null", () => {
    expect(toJsonb(null)).toBe("null");
    expect(toJsonb(undefined)).toBe("null");
  });

  it("selalu menghasilkan JSON yang bisa di-parse ulang", () => {
    const messy = { a: LONE_HIGH, b: [LONE_LOW], c: { d: WHOLE_EMOJI } };
    expect(() => JSON.parse(toJsonb(messy))).not.toThrow();
  });

  it("hasilnya bebas dari escape surrogate — inilah yang ditolak Postgres", () => {
    // Postgres membalas 22P02 "invalid input syntax for type json" bila menemui
    // escape \uD800–\uDFFF yang tidak berpasangan saat mem-parse jsonb.
    expect(toJsonb({ n: LONE_HIGH })).not.toMatch(/\\u[dD][89abcdefABCDEF]/);
  });
});

describe("stripLoneSurrogates", () => {
  it("mempertahankan tipe non-string apa adanya", () => {
    expect(stripLoneSurrogates({ a: 1, b: true, c: null })).toEqual({
      a: 1,
      b: true,
      c: null,
    });
  });

  it("tidak mengubah objek yang sudah bersih", () => {
    const input = { n: WHOLE_EMOJI, list: [1, "dua"] };
    expect(stripLoneSurrogates(input)).toEqual(input);
  });
});

describe("hasLoneSurrogates", () => {
  it("mendeteksi surrogate tinggi maupun rendah yang yatim", () => {
    expect(hasLoneSurrogates({ n: LONE_HIGH })).toBe(true);
    expect(hasLoneSurrogates(LONE_LOW)).toBe(true);
  });

  it("tidak menandai payload yang sehat", () => {
    expect(hasLoneSurrogates({ n: WHOLE_EMOJI })).toBe(false);
    expect(hasLoneSurrogates({ n: "mas \\ud83c" })).toBe(false);
    expect(hasLoneSurrogates(null)).toBe(false);
  });
});
