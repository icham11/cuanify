import fetch from "node-fetch";

const payload = {
  target: process.env.FONNTE_PRODUCTION_TARGET,
  message: "TEST GAMBAR DARI WIKIPEDIA",
  delay: "2",
  url: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Image_created_with_a_mobile_phone.png/1200px-Image_created_with_a_mobile_phone.png"
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
console.log("Response:", text);
