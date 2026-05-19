const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

function toPrismaFileUrl(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  return process.platform === "win32" ? `file:${normalized}` : `file:/${normalized}`;
}

function createTestDatabase() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vpn-bot-test-"));
  const dbPath = path.join(tempDir, "test.db");
  const migrationsDir = path.resolve(__dirname, "../../prisma/migrations");
  const migrationSql = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => fs.readFileSync(path.join(migrationsDir, entry.name, "migration.sql"), "utf8"))
    .join("\n");

  const db = new DatabaseSync(dbPath);
  db.exec(migrationSql);
  db.close();

  return {
    tempDir,
    dbPath,
    databaseUrl: toPrismaFileUrl(dbPath),
  };
}

function clearProjectModules() {
  for (const key of Object.keys(require.cache)) {
    if (key.includes(`${path.sep}dist${path.sep}`)) {
      delete require.cache[key];
    }
  }
}

function loadProjectModules(databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
  process.env.XRAY_SYNC_ENABLED = "false";
  process.env.BOT_TOKEN = process.env.BOT_TOKEN ?? "test-token";
  process.env.ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID ?? "1";
  process.env.ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "test_admin";
  process.env.SUPPORT_LINK = process.env.SUPPORT_LINK ?? "https://t.me/test";
  process.env.SUB_BASE_URL = process.env.SUB_BASE_URL ?? "https://sub.test.local";
  clearProjectModules();

  const { prisma } = require("../../dist/db/prisma.js");
  const { vpnService } = require("../../dist/services/vpnService.js");
  const { adminService } = require("../../dist/services/adminService.js");
  const { requestService } = require("../../dist/services/requestService.js");
  const { vpnGeneratorService } = require("../../dist/services/vpnGeneratorService.js");

  return { prisma, vpnService, adminService, requestService, vpnGeneratorService };
}

async function disposeTestDatabase(prisma, tempDir) {
  await prisma.$disconnect();
  fs.rmSync(tempDir, { recursive: true, force: true });
}

module.exports = {
  createTestDatabase,
  loadProjectModules,
  disposeTestDatabase,
};
