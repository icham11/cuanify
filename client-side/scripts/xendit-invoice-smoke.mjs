const baseUrl =
  process.env.SMOKE_BASE_URL || "https://crumbella-demo.vercel.app";

async function run() {
  const response = await fetch(`${baseUrl}/api/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{ productId: 1, quantity: 1 }],
      paymentMethod: "Cash",
      paymentStatus: "Paid",
      customerName: "Test Customer",
      customerEmail: "test@example.com",
      customerPhone: "08123456789",
    }),
  });

  const data = await response.json();
  console.log("Smoke result:", data);
}

run().catch((error) => {
  console.error("Smoke test failed:", error);
  process.exit(1);
});
