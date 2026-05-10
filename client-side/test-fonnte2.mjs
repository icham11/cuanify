import fetch from "node-fetch";
import FormData from "form-data";

const token = process.env.FONNTE_TOKEN;
const target = process.env.FONNTE_PRODUCTION_TARGET;

const formData = new FormData();
formData.append("target", target);
formData.append("message", "TEST DENGAN FORMDATA BUKAN URLSEARCHPARAMS");
// Using url field
formData.append("url", "https://res.cloudinary.com/demo/image/upload/sample.jpg");
formData.append("delay", "2");

fetch("https://api.fonnte.com/send", {
  method: "POST",
  headers: {
    Authorization: token,
    ...formData.getHeaders()
  },
  body: formData,
})
  .then(async (r) => {
    const text = await r.text();
    console.log("Status URL:", r.status);
    console.log("Response URL:", text);
  })
  .catch(console.error);

setTimeout(() => {
  const formData2 = new FormData();
  formData2.append("target", target);
  formData2.append("message", "TEST DENGAN FORMDATA (FIELD FILE)");
  // Using file field
  formData2.append("file", "https://res.cloudinary.com/demo/image/upload/sample.jpg");
  formData2.append("delay", "2");

  fetch("https://api.fonnte.com/send", {
    method: "POST",
    headers: {
      Authorization: token,
      ...formData2.getHeaders()
    },
    body: formData2,
  })
    .then(async (r) => {
      const text = await r.text();
      console.log("Status FILE:", r.status);
      console.log("Response FILE:", text);
    })
    .catch(console.error);
}, 3000);
