const fs = require("node:fs");
const path = require("node:path");
const { config: loadEnv } = require("dotenv");

loadEnv();

function normalizeDatabaseUrl(rawUrl) {
  if (!rawUrl || !rawUrl.startsWith("file:")) {
    return rawUrl;
  }

  const filePath = rawUrl.slice(5);
  if (!filePath) {
    return rawUrl;
  }

  if (path.isAbsolute(filePath)) {
    const normalizedPath = filePath.replace(/\\/g, "/");
    return process.platform === "win32"
      ? `file:${normalizedPath}`
      : `file:${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`;
  }

  const absolutePath = path.resolve(process.cwd(), filePath).replace(/\\/g, "/");
  return process.platform === "win32"
    ? `file:${absolutePath}`
    : `file:/${absolutePath}`;
}

process.env.DATABASE_URL = normalizeDatabaseUrl(process.env.DATABASE_URL);

const { PrismaClient } = require("@prisma/client");

function resolveDatabasePath(databaseUrl) {
  if (!databaseUrl || !databaseUrl.startsWith("file:")) {
    throw new Error("DATABASE_URL must point to a SQLite file");
  }

  const rawPath = databaseUrl.slice(5);
  if (!rawPath) {
    throw new Error("DATABASE_URL is missing SQLite file path");
  }

  return path.isAbsolute(rawPath)
    ? rawPath
    : path.resolve(process.cwd(), rawPath);
}

function resolveBackupDir() {
  const rawDir = process.env.BACKUP_DIR ?? "./backups";
  return path.isAbsolute(rawDir) ? rawDir : path.resolve(process.cwd(), rawDir);
}

function buildBackupPath(databasePath, backupDir) {
  const fileBase = path.basename(databasePath, path.extname(databasePath));
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(backupDir, `${fileBase}-${timestamp}.db`);
}

async function main() {
  const databasePath = resolveDatabasePath(process.env.DATABASE_URL);
  const backupDir = resolveBackupDir();

  if (!fs.existsSync(databasePath)) {
    throw new Error(`SQLite database not found: ${databasePath}`);
  }

  fs.mkdirSync(backupDir, { recursive: true });

  const backupPath = buildBackupPath(databasePath, backupDir);
  const escapedBackupPath = backupPath.replace(/\\/g, "/").replace(/'/g, "''");

  const prisma = new PrismaClient();

  try {
    await prisma.$executeRawUnsafe(`VACUUM INTO '${escapedBackupPath}'`);
  } finally {
    await prisma.$disconnect();
  }

  console.log(`SQLite backup created: ${backupPath}`);
}

main().catch((error) => {
  console.error("SQLite backup failed:", error);
  process.exitCode = 1;
});
