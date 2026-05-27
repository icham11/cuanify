import fs from "fs";
import path from "path";

if (!process.env.DATABASE_URL) {
  try {
    const envFile = fs.readFileSync(path.join(process.cwd(), ".env"), "utf8");
    const match = envFile.match(/^DATABASE_URL=(.*)$/m);
    if (match) process.env.DATABASE_URL = match[1].trim();
  } catch (e) {}
}

async function main() {
  const { prisma } = await import("../lib/prisma");
  console.log("Melanjutkan migrasi minimal order...");

  // 2. Update Cupcakes (individual) -> 10 pcs
  const cupcakeProducts = await prisma.product.findMany({
    where: {
      name: {
        contains: "Cupcake",
        mode: "insensitive",
      },
    },
  });

  let cupcakeCount = 0;
  const updatePromises = [];
  
  for (const product of cupcakeProducts) {
    const nameLower = product.name.toLowerCase();
    // Abaikan varian lusinan
    if (
      nameLower.includes("lusin") ||
      nameLower.includes("dozen") ||
      nameLower.includes("12 pcs") ||
      nameLower.includes("12pcs")
    ) {
      continue;
    }

    updatePromises.push(
      prisma.product.update({
        where: { id: product.id },
        data: { minimumOrder: 10 },
      })
    );
    cupcakeCount++;
  }
  
  // Eksekusi semua query secara paralel agar jauh lebih cepat
  await Promise.all(updatePromises);
  console.log(`Berhasil mengupdate ${cupcakeCount} produk Cupcakes Individual menjadi minimal order 10 pcs.`);

  console.log("Migrasi Cupcakes selesai!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    console.log("Proses selesai, akan exit otomatis.");
    process.exit(0);
  });
