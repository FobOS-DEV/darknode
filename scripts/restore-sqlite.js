const fs = require("node:fs");
const path = require("node:path");
const { config: loadEnv } = require("dotenv");

loadEnv();

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

function resolveInputPath(inputPath) {
  return path.isAbsolute(inputPath)
    ? inputPath
    : path.resolve(process.cwd(), inputPath);
}

function createSafetyBackup(targetPath) {
  const backupDir = path.resolve(process.cwd(), process.env.BACKUP_DIR ?? "./backups");
  fs.mkdirSync(backupDir, { recursive: true });

  if (!fs.existsSync(targetPath)) {
    return null;
  }

  const fileBase = path.basename(targetPath, path.extname(targetPath));
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safetyBackupPath = path.join(backupDir, `${fileBase}-pre-restore-${timestamp}.db`);

  fs.copyFileSync(targetPath, safetyBackupPath);
  return safetyBackupPath;
}

function main() {
  const sourceArg = process.argv[2];

  if (!sourceArg) {
    throw new Error("Usage: npm run restore:sqlite -- <path-to-backup.db>");
  }

  const sourcePath = resolveInputPath(sourceArg);
  const targetPath = resolveDatabasePath(process.env.DATABASE_URL);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Backup file not found: ${sourcePath}`);
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const safetyBackupPath = createSafetyBackup(targetPath);

  fs.copyFileSync(sourcePath, targetPath);

  if (safetyBackupPath) {
    console.log(`Current database saved before restore: ${safetyBackupPath}`);
  }

  console.log(`SQLite database restored from: ${sourcePath}`);
}

try {
  main();
} catch (error) {
  console.error("SQLite restore failed:", error);
  process.exitCode = 1;
}
