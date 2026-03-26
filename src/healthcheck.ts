import { prisma } from "./db/prisma";

async function main() {
  try {
    const tables = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name IN ('User', 'VpnClient', 'AuditLog')
    `;

    if (tables.length !== 3) {
      throw new Error("Database schema is incomplete");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Healthcheck failed:", error);
  process.exitCode = 1;
});
