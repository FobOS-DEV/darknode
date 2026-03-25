require("dotenv").config();

const path = require("node:path");

function normalizeDatabaseUrl(rawUrl) {
  if (!rawUrl || !rawUrl.startsWith("file:")) {
    throw new Error("DATABASE_URL must use sqlite file:... format");
  }

  const filePath = rawUrl.slice(5);
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);

  const normalizedPath = absolutePath.replace(/\\/g, "/");
  return process.platform === "win32"
    ? `file:${normalizedPath}`
    : `file:/${normalizedPath}`;
}

process.env.DATABASE_URL = normalizeDatabaseUrl(
  process.env.DATABASE_URL || "file:./prisma/dev.db",
);

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function upsertUserWithClient(input) {
  return prisma.user.upsert({
    where: { telegramId: input.telegramId },
    update: {
      username: input.username,
      firstName: input.firstName,
      lastName: input.lastName,
      fullName: input.fullName,
      isAdmin: input.isAdmin,
      vpnClient: {
        upsert: {
          update: input.client,
          create: input.client,
        },
      },
    },
    create: {
      telegramId: input.telegramId,
      username: input.username,
      firstName: input.firstName,
      lastName: input.lastName,
      fullName: input.fullName,
      isAdmin: input.isAdmin,
      vpnClient: {
        create: input.client,
      },
    },
    include: {
      vpnClient: true,
    },
  });
}

async function main() {
  const now = new Date();
  const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const past = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

  const adminTelegramId = process.env.ADMIN_TELEGRAM_ID || "211268074";
  const adminUsername = process.env.ADMIN_USERNAME || "admin";

  await upsertUserWithClient({
    telegramId: adminTelegramId,
    username: adminUsername,
    firstName: "Roman",
    lastName: "Test",
    fullName: "Roman Test",
    isAdmin: true,
    client: {
      displayName: "Roman Test",
      emailLabel: "roman@test.local",
      uuid: "11111111-1111-4111-8111-111111111111",
      vlessUrl:
        "vless://11111111-1111-4111-8111-111111111111@vpn.test.local:443?type=tcp&security=reality&pbk=test-public-key&sid=ab12&sni=vpn.test.local&flow=xtls-rprx-vision#Roman_Test",
      server: "vpn.test.local",
      port: 443,
      publicKey: "test-public-key",
      shortId: "ab12",
      sni: "vpn.test.local",
      flow: "xtls-rprx-vision",
      status: "ACTIVE",
      expiresAt: future,
    },
  });

  await upsertUserWithClient({
    telegramId: "999000111",
    username: "expired_demo",
    firstName: "Expired",
    lastName: "Demo",
    fullName: "Expired Demo",
    isAdmin: false,
    client: {
      displayName: "Expired Demo",
      emailLabel: "expired@test.local",
      uuid: "22222222-2222-4222-8222-222222222222",
      vlessUrl:
        "vless://22222222-2222-4222-8222-222222222222@vpn.test.local:443?type=tcp&security=reality&pbk=test-public-key&sid=cd34&sni=vpn.test.local&flow=xtls-rprx-vision#Expired_Demo",
      server: "vpn.test.local",
      port: 443,
      publicKey: "test-public-key",
      shortId: "cd34",
      sni: "vpn.test.local",
      flow: "xtls-rprx-vision",
      status: "EXPIRED",
      expiresAt: past,
    },
  });

  console.log(`Seeded test users into ${process.env.DATABASE_URL}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
