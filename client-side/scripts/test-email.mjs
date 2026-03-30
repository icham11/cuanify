#!/usr/bin/env node
/**
 * Test script for nodemailer email functionality
 *
 * Usage:
 *   node scripts/test-email.mjs recipient@example.com
 *
 * Make sure to configure EMAIL_* variables in .env.local first!
 */

import "dotenv/config";
import nodemailer from "nodemailer";

const recipientEmail = process.argv[2] || "test@example.com";
const appUrl =
  process.env.NEXTAUTH_URL ||
  process.env.SMOKE_BASE_URL ||
  "https://crumbella-demo.vercel.app";

console.log("📧 Testing Nodemailer Configuration...\n");

// Check if email is configured
if (
  !process.env.EMAIL_HOST ||
  !process.env.EMAIL_PORT ||
  !process.env.EMAIL_USER ||
  !process.env.EMAIL_PASSWORD ||
  !process.env.EMAIL_FROM
) {
  console.error("❌ Email not configured!");
  console.log("\nTo enable email, add these to .env.local:");
  console.log(`
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=UMKM Helper <noreply@umkmhelper.com>
  `);
  process.exit(1);
}

console.log("✅ Email configuration found:");
console.log(`   Host: ${process.env.EMAIL_HOST}`);
console.log(`   Port: ${process.env.EMAIL_PORT}`);
console.log(`   User: ${process.env.EMAIL_USER}`);
console.log(`   From: ${process.env.EMAIL_FROM}`);
console.log(`   To: ${recipientEmail}\n`);

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT),
  secure: process.env.EMAIL_SECURE === "true",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Test HTML content
const testHTML = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #f5f5f5; padding: 20px; border-radius: 8px; }
    h1 { color: #2563eb; }
    .button { background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>✅ Test Email - UMKM Helper</h1>
    <p>Halo!</p>
    <p>Ini adalah test email dari aplikasi UMKM Helper. Jika Anda menerima email ini, berarti konfigurasi nodemailer sudah bekerja dengan baik!</p>
    <a href="${appUrl}" class="button">Buka UMKM Helper</a>
    <hr>
    <p style="color: #666; font-size: 12px;">
      Email ini dikirim dari script test-email.mjs<br>
      Timestamp: ${new Date().toLocaleString("id-ID")}
    </p>
  </div>
</body>
</html>
`;

// Send test email
console.log("📤 Sending test email...\n");

try {
  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: recipientEmail,
    subject: "Test Email - UMKM Helper Nodemailer",
    html: testHTML,
  });

  console.log("✅ Email sent successfully!");
  console.log(`   Message ID: ${info.messageId}`);
  console.log(`   Response: ${info.response}\n`);

  console.log("🎉 Nodemailer is working correctly!");
  console.log(`Check inbox of ${recipientEmail} for the test email.\n`);
} catch (error) {
  console.error("❌ Failed to send email:");
  console.error(error.message);
  console.log("\nTroubleshooting:");
  console.log("1. Check SMTP credentials in .env.local");
  console.log("2. For Gmail, use App Password (not regular password)");
  console.log("3. Check firewall/network settings");
  console.log("4. Try using Mailtrap for testing (https://mailtrap.io/)\n");
  process.exit(1);
}
