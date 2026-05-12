#!/usr/bin/env node

import dotenv from "dotenv";

dotenv.config();

const TOKEN = process.env.FONNTE_TOKEN?.trim();
const TARGET = process.env.FONNTE_PRODUCTION_TARGET?.trim();

if (!TOKEN || !TARGET) {
  console.error("❌ Missing env vars");
  process.exit(1);
}

console.log("📋 Testing Fonnte Image Send - Binary vs URL approach\n");

const testImageUrl = "https://res.cloudinary.com/dhyw39rny/image/upload/v1778390654/orders/generated/liydcui7agcaal2ztzzo.jpg";
const testCaption = `[BINARY TEST] ${new Date().toLocaleString()}`;

async function test1_ImageUrlWithMessage() {
  console.log("\n🧪 Test 1: URL parameter + message");
  console.log("─".repeat(60));

  const formData = new FormData();
  formData.set("target", TARGET);
  formData.set("message", testCaption);
  formData.set("url", testImageUrl);
  formData.set("filename", "test.jpg");
  formData.set("delay", "2");

  try {
    const response = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { Authorization: TOKEN },
      body: formData,
    });
    const json = await response.json();
    console.log("Result:", json.status === true ? "✅ SENT" : "❌ FAILED");
    console.log("Detail:", json.detail);
    console.log("Full:", JSON.stringify(json, null, 2));
  } catch (error) {
    console.error("Error:", error.message);
  }

  await new Promise((r) => setTimeout(r, 2000));
}

async function test2_ImageUrlNoMessage() {
  console.log("\n🧪 Test 2: URL parameter WITHOUT message");
  console.log("─".repeat(60));

  const formData = new FormData();
  formData.set("target", TARGET);
  formData.set("url", testImageUrl);
  formData.set("filename", "test.jpg");
  formData.set("delay", "2");

  try {
    const response = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { Authorization: TOKEN },
      body: formData,
    });
    const json = await response.json();
    console.log("Result:", json.status === true ? "✅ SENT" : "❌ FAILED");
    console.log("Detail:", json.detail);
  } catch (error) {
    console.error("Error:", error.message);
  }

  await new Promise((r) => setTimeout(r, 2000));
}

async function test3_DownloadAndSendBinary() {
  console.log("\n🧪 Test 3: Download image and send as binary");
  console.log("─".repeat(60));

  try {
    // Download image from Cloudinary
    const imgResponse = await fetch(testImageUrl);
    if (!imgResponse.ok) {
      console.error("❌ Failed to download image:", imgResponse.status);
      return;
    }

    const imageBlob = await imgResponse.blob();
    console.log(`Downloaded: ${imageBlob.size} bytes`);

    // Send with binary image data
    const formData = new FormData();
    formData.set("target", TARGET);
    formData.set("message", testCaption);
    formData.set("file", imageBlob, "generated-order.jpg"); // Send as file upload
    formData.set("delay", "2");

    const response = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { Authorization: TOKEN },
      body: formData,
    });
    const json = await response.json();
    console.log("Result:", json.status === true ? "✅ SENT" : "❌ FAILED");
    console.log("Detail:", json.detail);
    console.log("Full:", JSON.stringify(json, null, 2));
  } catch (error) {
    console.error("Error:", error.message);
  }

  await new Promise((r) => setTimeout(r, 2000));
}

async function test4_OnlyImageNoCaption() {
  console.log("\n🧪 Test 4: Only image URL, empty message");
  console.log("─".repeat(60));

  const formData = new FormData();
  formData.set("target", TARGET);
  formData.set("message", "");
  formData.set("url", testImageUrl);
  formData.set("filename", "test.jpg");
  formData.set("delay", "2");

  try {
    const response = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { Authorization: TOKEN },
      body: formData,
    });
    const json = await response.json();
    console.log("Result:", json.status === true ? "✅ SENT" : "❌ FAILED");
    console.log("Detail:", json.detail);
  } catch (error) {
    console.error("Error:", error.message);
  }
}

async function main() {
  console.log(`Target: ${TARGET}`);
  console.log(`Token: ${TOKEN.substring(0, 20)}...`);
  console.log(`Image: ${testImageUrl}`);

  await test1_ImageUrlWithMessage();
  await test2_ImageUrlNoMessage();
  await test3_DownloadAndSendBinary();
  await test4_OnlyImageNoCaption();

  console.log("\n" + "=".repeat(60));
  console.log("✅ All tests sent to WhatsApp group.");
  console.log("Check the group to see which format actually delivers images!");
}

main().catch(console.error);
