#!/usr/bin/env node

import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const TOKEN = process.env.FONNTE_TOKEN?.trim();
const TARGET = process.env.FONNTE_PRODUCTION_TARGET?.trim();

if (!TOKEN || !TARGET) {
  console.error("❌ Missing env vars: FONNTE_TOKEN or FONNTE_PRODUCTION_TARGET");
  process.exit(1);
}

console.log("📋 Fonnte API Image Parameter Test");
console.log("==================================\n");

const testImageUrl = "https://res.cloudinary.com/dhyw39rny/image/upload/v1778390654/orders/generated/liydcui7agcaal2ztzzo.jpg";
const testCaption = `[TEST] Image delivery test - ${new Date().toLocaleString()}`;

async function testWithParam(paramName, paramValue) {
  console.log(`\n🧪 Test ${paramName}="${paramValue.substring(0, 50)}..."`);
  console.log("─".repeat(60));

  const formData = new FormData();
  formData.set("target", TARGET);
  formData.set("message", testCaption);
  formData.set("delay", "2");
  formData.set(paramName, paramValue);
  formData.set("filename", "test.jpg");

  try {
    const response = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: {
        Authorization: TOKEN,
      },
      body: formData,
    });

    const text = await response.text();
    const json = (() => {
      try {
        return JSON.parse(text);
      } catch {
        return { raw: text };
      }
    })();

    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`Response:`, JSON.stringify(json, null, 2));

    if (json.status === true || json.status === "true") {
      console.log("✅ SUCCESS!");
      return true;
    } else if (json.status === false) {
      console.log(`❌ FAILED: ${json.reason || "Unknown reason"}`);
    }
  } catch (error) {
    console.error(`❌ ERROR:`, error.message);
  }

  return false;
}

async function main() {
  console.log(`Target: ${TARGET}`);
  console.log(`Token: ${TOKEN.substring(0, 20)}...`);
  console.log(`Image URL: ${testImageUrl}`);
  console.log(`Caption: ${testCaption}\n`);

  // Test different parameter names for image
  const tests = [
    ["url", testImageUrl, "Current implementation"],
    ["image", testImageUrl, "Alternative 1"],
    ["file", testImageUrl, "Alternative 2"],
    ["image_url", testImageUrl, "Alternative 3"],
    ["attachment", testImageUrl, "Alternative 4"],
  ];

  let successCount = 0;
  for (const [param, value, desc] of tests) {
    console.log(`\n[${desc}]`);
    const result = await testWithParam(param, value);
    if (result) successCount++;
    await new Promise((r) => setTimeout(r, 2000)); // Rate limit
  }

  console.log("\n" + "=".repeat(60));
  console.log(`📊 Results: ${successCount}/${tests.length} tests passed`);

  if (successCount === 0) {
    console.log(
      "\n⚠️  None of the parameter names worked."
    );
    console.log("Testing without image parameters (text-only baseline)...\n");

    const formData = new FormData();
    formData.set("target", TARGET);
    formData.set("message", `[BASELINE] Text-only test - ${new Date().toLocaleString()}`);
    formData.set("delay", "2");

    try {
      const response = await fetch("https://api.fonnte.com/send", {
        method: "POST",
        headers: { Authorization: TOKEN },
        body: formData,
      });
      const json = await response.json();
      console.log("Text-only response:", JSON.stringify(json, null, 2));
      if (json.status === true) {
        console.log("✅ Text works! Problem is with image parameters.");
      }
    } catch (error) {
      console.error("Baseline test error:", error.message);
    }
  }
}

main().catch(console.error);
