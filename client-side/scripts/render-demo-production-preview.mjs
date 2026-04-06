#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const cwd = process.cwd();
const sourcePath = path.resolve(cwd, "lib/whatsapp/generateOrderImage.ts");
const runtimeDir = path.resolve(cwd, "tmp/wa-preview/runtime");
const runtimeModulePath = path.join(runtimeDir, "generateOrderImage.cjs");
const outputDir = path.resolve(cwd, "tmp/wa-preview");
const outputPath = path.join(outputDir, "cookies-gosend-demo-exact-preview.png");
const actualImagePaths = [
  path.resolve(cwd, "gmbr/WhatsApp Image 2026-04-02 at 18.23.29.jpeg"),
  path.resolve(cwd, "gmbr/WhatsApp Image 2026-04-02 at 18.23.30 (1).jpeg"),
  path.resolve(cwd, "gmbr/WhatsApp Image 2026-04-02 at 18.23.30.jpeg"),
];

await fs.promises.mkdir(runtimeDir, { recursive: true });
await fs.promises.mkdir(outputDir, { recursive: true });

const source = await fs.promises.readFile(sourcePath, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
  },
  fileName: sourcePath,
}).outputText;

await fs.promises.writeFile(runtimeModulePath, transpiled, "utf8");

const require = createRequire(import.meta.url);
const { generateOrderImage } = require(runtimeModulePath);

async function fileToDataUrl(filePath) {
  const fileBytes = await fs.promises.readFile(filePath);
  const extension = path.extname(filePath).toLowerCase();
  const mimeType =
    extension === ".png"
      ? "image/png"
      : extension === ".webp"
        ? "image/webp"
        : "image/jpeg";

  return `data:${mimeType};base64,${fileBytes.toString("base64")}`;
}

const actualReferenceImages = await Promise.all(
  actualImagePaths.map(async (imagePath, index) => ({
    url: await fileToDataUrl(imagePath),
    orderIndex: index,
  })),
);

const payload = {
  customerName: "Gara BFM",
  recipientName: "Gara BFM",
  phone: "082381297556",
  recipientPhone: "082381297556",
  deliveryDate: "2026-04-08",
  deliveryTime: "10:00",
  shippingMethod: "GoSend",
  item: "20pcs indv cookies",
  address:
    "AGRO PLAZA - Jl. H. R. Rasuna Said X-2 No. 1 Kec. Setiabudi - Jakarta Selatan DKI Jakarta",
  bookingCode: "GA-56",
  orderType: "cookies",
  notes: "Metode Pengiriman: GoSend",
  referenceImages: actualReferenceImages,
};

const buffer = await generateOrderImage(payload);
await fs.promises.writeFile(outputPath, buffer);

console.log(outputPath);
