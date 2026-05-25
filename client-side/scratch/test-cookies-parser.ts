import { parseWhatsAppOrderText } from "../lib/bookings/whatsapp-parser";
import { buildOrderDeliveryDetailsWhatsAppText } from "../lib/bookings/whatsapp-message-template";

// Contoh chat bertipe cookies yang dikirim oleh customer
const sampleChatText = `
Data Cookies
Tanggal Pengiriman (/Maret/26): 2026-06-01
KODE BOOKING: COOKIE-TEST-99
Order: Custom Cookies
Jumlah Cookies: 35
To From Notes: To: Deni, From: Rani
Jam Pengiriman: 14:00
Metode Pengiriman: gojek
Nama penerima: Deni
No. telp penerima: 085776999088
Alamat lengkap: Jl. Pademangan Raya No. 45
`.trim();

async function runTest() {
  console.log("=== MEMULAI TEST PARSING CHAT COOKIES ===\n");

  try {
    // Jalankan parser WhatsApp pada contoh teks chat
    const parsed = parseWhatsAppOrderText(sampleChatText);
    
    console.log("1. Hasil Parsing Detail:");
    console.log(`   - Order Type: ${parsed.orderType}`);
    console.log(`   - Jumlah Cookies (cookieCount): ${parsed.details.cookieCount}`);
    console.log(`   - Design Cookies: ${parsed.details.cookieDesign || "-"}`);
    console.log(`   - To From Notes: ${parsed.details.toFromNotes}`);
    console.log(`   - Kuantitas yang Dipilih (chooseQuantity): ${parsed.common.order ? parsed.common.order : "N/A"}`);
    
    // Verifikasi bahwa data di-parse dengan benar
    if (parsed.details.cookieCount === "35") {
      console.log("   ✓ SUKSES: Jumlah Cookies berhasil di-parse sebagai '35'!");
    } else {
      console.error("   ✗ GAGAL: Jumlah Cookies tidak sesuai!");
    }

    console.log("\n2. Hasil Pembuatan Template WhatsApp Produksi:");
    
    // Bentuk data untuk dimasukkan ke builder template pesan
    const mockRecapInput = {
      items: [
        {
          productName: "Custom Cookies",
          orderLabel: "Custom Cookies",
          quantity: Number(parsed.details.cookieCount || 1),
          detailLines: [
            { label: "To From Notes", value: parsed.details.toFromNotes || "" }
          ]
        }
      ],
      deliveryDate: parsed.common.deliveryDate,
      bookingCode: parsed.common.bookingCode,
      deliveryTime: parsed.common.deliveryTime,
      shippingMethod: parsed.common.deliveryMethod,
      recipientName: parsed.common.recipientName,
      recipientPhone: parsed.common.recipientPhone,
      fullAddress: parsed.common.fullAddress,
    };

    // Jalankan builder template WA
    const waText = buildOrderDeliveryDetailsWhatsAppText(mockRecapInput);
    console.log("------------------------------------------");
    console.log(waText);
    console.log("------------------------------------------");

    // Verifikasi apakah output menyertakan quantity dengan format X×
    if (waText.includes("35× Custom Cookies")) {
      console.log("   ✓ SUKSES: Template pesan mencantumkan kuantitas '35× Custom Cookies'!");
    } else {
      console.error("   ✗ GAGAL: Kuantitas tidak tercantum dalam template pesan!");
    }

  } catch (error) {
    console.error("Terjadi error saat menjalankan test:", error);
  }
}

runTest();
