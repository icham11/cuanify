import { sendWhatsAppImage } from "../lib/whatsapp/sendWhatsApp";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from client-side directory
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function test() {
  console.log("Testing Fonnte WhatsApp Image Send...");
  console.log("FONNTE_TOKEN:", process.env.FONNTE_TOKEN ? "Exists" : "Missing");
  console.log("FONNTE_PRODUCTION_TARGET:", process.env.FONNTE_PRODUCTION_TARGET);

  const testImageUrl = "https://res.cloudinary.com/demo/image/upload/sample.jpg";
  const testCaption = "TEST AUTOMATION FIX - " + new Date().toLocaleString();
  
  try {
    await sendWhatsAppImage(testImageUrl, testCaption);
    console.log("Test success!");
  } catch (error) {
    console.error("Test failed:", error);
  }
}

test();
