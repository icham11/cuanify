/**
 * Test script untuk panduan manual Auto-Cleanup feature.
 */

const appUrl = process.env.NEXTAUTH_URL || "https://crumbella-demo.vercel.app";
const cronSecret = process.env.CRON_SECRET || "your-secure-random-secret-here";

console.log(`
AUTO-CLEANUP TEST INSTRUCTIONS

Setup:
- Expiry Time: 1 menit
- Cleanup Interval: 1 menit
- Auto-start: ${process.env.ENABLE_AUTO_CLEANUP === "true" ? "ENABLED" : "DISABLED"}

Cara test:
1. Start dev server
   npm run dev

2. Upload gambar via API
   curl -X POST ${appUrl}/api/analyze-image \\
     -F "file=@test-image.jpg" \\
     -F "analysisType=test"

3. Tunggu 1 menit lalu cek hasil
   - file harus terhapus dari ImageKit
   - cek log cleanup di server

4. Trigger cleanup manual
   curl -X POST ${appUrl}/api/cleanup-images \\
     -H "Authorization: Bearer ${cronSecret}"

Monitoring:
- ImageKit dashboard: https://imagekit.io/dashboard
- Server logs dan response API cleanup
`);

export {};
