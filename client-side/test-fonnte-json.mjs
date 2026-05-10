import fetch from "node-fetch";

const token = process.env.FONNTE_TOKEN;
const target = process.env.FONNTE_PRODUCTION_TARGET;

const payload = {
  target: target,
  message: "TEST GAMBAR DARI AUTOMASI FIX (JSON PAYLOAD)",
  delay: "2",
  url: "https://res.cloudinary.com/demo/image/upload/sample.jpg"
};

fetch("https://api.fonnte.com/send", {
  method: "POST",
  headers: {
    Authorization: token,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
})
  .then(async (r) => {
    const text = await r.text();
    console.log("Status:", r.status);
    console.log("Response:", text);
  })
  .catch(console.error);
