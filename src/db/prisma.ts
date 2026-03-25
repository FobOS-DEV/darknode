import { PrismaClient } from "@prisma/client";
import path from "node:path";

function normalizeDatabaseUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) {
    return rawUrl;
  }

  if (!rawUrl.startsWith("file:")) {
    return rawUrl;
  }

  const filePath = rawUrl.slice(5);

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

export const prisma = new PrismaClient();
