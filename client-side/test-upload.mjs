import cloudinary from "cloudinary";
import fetch from "node-fetch";

cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function run() {
  console.log("Uploading dummy image...");
  const buffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
  
  const uploadResult = await new Promise((resolve, reject) => {
    const stream = cloudinary.v2.uploader.upload_stream(
      { folder: "orders/test", format: "jpg" },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    stream.end(buffer);
  });
  
  const imageUrl = uploadResult.secure_url;
  console.log("Uploaded to:", imageUrl);
  
  console.log("Sending to Fonnte...");
  const payload = {
    target: process.env.FONNTE_PRODUCTION_TARGET,
    message: "TEST GAMBAR CLOUDINARY REAL (JSON)",
    delay: "2",
    url: imageUrl
  };

  const response = await fetch("https://api.fonnte.com/send", {
    method: "POST",
    headers: {
      Authorization: process.env.FONNTE_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  
  const text = await response.text();
  console.log("Fonnte Response JSON:", text);
}

run().catch(console.error);
