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
  const migrationPath = path.resolve(__dirname, "../../prisma/migrations/20260325195000_init/migration.sql");
  const migrationSql = fs.readFileSync(migrationPath, "utf8");

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
  clearProjectModules();

  const { prisma } = require("../../dist/db/prisma.js");
  const { vpnService } = require("../../dist/services/vpnService.js");
  const { adminService } = require("../../dist/services/adminService.js");

  return { prisma, vpnService, adminService };
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
