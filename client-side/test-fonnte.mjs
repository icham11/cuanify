import fetch from "node-fetch";

const token = process.env.FONNTE_TOKEN;
const target = process.env.FONNTE_PRODUCTION_TARGET;

const payload = {
  target: target,
  message: "TEST GAMBAR DARI AUTOMASI FIX",
  delay: "2",
  url: "https://res.cloudinary.com/demo/image/upload/sample.jpg"
};

const formData = new URLSearchParams();
formData.set("target", payload.target);
formData.set("message", payload.message);
formData.set("delay", payload.delay);

if (payload.url) {
  formData.set("url", payload.url);
}

fetch("https://api.fonnte.com/send", {
  method: "POST",
  headers: {
    Authorization: token,
  },
  body: formData,
})
  .then(async (r) => {
    const text = await r.text();
    console.log("Status:", r.status);
    console.log("Response:", text);
  })
  .catch(console.error);
