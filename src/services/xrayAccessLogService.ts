import { readFileSync } from "node:fs";

import { env } from "../config/env";
import { logger } from "../config/logger";

const { Client } = require("ssh2") as {
  Client: new () => {
    on(event: string, listener: (...args: any[]) => void): any;
    connect(config: Record<string, unknown>): void;
    exec(
      command: string,
      callback: (error: Error | undefined, stream: any) => void,
    ): void;
    end(): void;
  };
};

export type EmailIpStats = {
  email: string;
  uniqueSubnets: number;
  uniqueIps: number;
  totalConnections: number;
  firstSeen: Date;
  lastSeen: Date;
  sampleIps: string[];
};

export type SharingDetectionMap = Map<string, EmailIpStats>;

const ACCESS_LOG_LINE = /^(\d{4}\/\d{2}\/\d{2}\s\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+(?:from\s+)?(\S+?)\s+accepted\s+.*?email:\s*(.+?)\s*$/;

let cache: { stats: SharingDetectionMap; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

function isSshConfigured(): boolean {
  return Boolean(env.sshHost && env.sshUser && (env.sshPassword || env.sshKeyPath));
}

function buildConnectConfig(): Record<string, unknown> {
  if (!env.sshHost || !env.sshUser) {
    throw new Error("SSH_HOST and SSH_USER are required for Xray access log");
  }

  if (!env.sshPassword && !env.sshKeyPath) {
    throw new Error("Either SSH_PASSWORD or SSH_KEY_PATH is required for Xray access log");
  }

  return {
    host: env.sshHost,
    port: env.sshPort,
    username: env.sshUser,
    password: env.sshPassword ?? undefined,
    privateKey: env.sshKeyPath ? readFileSync(env.sshKeyPath, "utf8") : undefined,
  };
}

function runSshCommand(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client: any = new Client();

    client
      .on("ready", () => {
        client.exec(command, (error: Error | undefined, stream: any) => {
          if (error) {
            client.end();
            reject(error);
            return;
          }

          let stdout = "";
          let stderr = "";

          stream
            .on("close", (code: number | null) => {
              client.end();

              if (code !== 0) {
                reject(new Error(stderr || `SSH command exited with code ${code}`));
                return;
              }

              resolve(stdout);
            })
            .on("data", (chunk: Buffer | string) => {
              stdout += chunk.toString();
            });

          stream.stderr.on("data", (chunk: Buffer | string) => {
            stderr += chunk.toString();
          });
        });
      })
      .on("error", reject)
      .connect(buildConnectConfig());
  });
}

export function parseAccessLogLine(
  line: string,
): { timestamp: Date; ip: string; email: string } | null {
  const match = line.match(ACCESS_LOG_LINE);

  if (!match) {
    return null;
  }

  const [, rawTimestamp, rawIp, rawEmail] = match;
  const ip = stripPort(rawIp);

  if (!ip) {
    return null;
  }

  const timestamp = parseXrayTimestamp(rawTimestamp);

  if (!timestamp) {
    return null;
  }

  return { timestamp, ip, email: rawEmail.trim() };
}

function parseXrayTimestamp(value: string): Date | null {
  const isoLike = value.replace(
    /^(\d{4})\/(\d{2})\/(\d{2})\s(\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/,
    "$1-$2-$3T$4Z",
  );
  const ts = new Date(isoLike);
  return Number.isNaN(ts.getTime()) ? null : ts;
}

function stripPort(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("[")) {
    const closing = trimmed.indexOf("]");

    if (closing === -1) {
      return null;
    }

    return trimmed.slice(1, closing);
  }

  const lastColon = trimmed.lastIndexOf(":");
  return lastColon === -1 ? trimmed : trimmed.slice(0, lastColon);
}

export function ipToSubnet(ip: string): string {
  if (ip.includes(":")) {
    return ip.split(":").slice(0, 4).join(":") + "::/64";
  }

  const parts = ip.split(".");

  if (parts.length !== 4) {
    return ip;
  }

  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
}

export function aggregateAccessLog(
  lines: string[],
  since: Date,
): SharingDetectionMap {
  const byEmail = new Map<
    string,
    {
      ips: Set<string>;
      subnets: Set<string>;
      total: number;
      firstSeen: Date;
      lastSeen: Date;
    }
  >();

  for (const rawLine of lines) {
    const parsed = parseAccessLogLine(rawLine);

    if (!parsed) {
      continue;
    }

    if (parsed.timestamp.getTime() < since.getTime()) {
      continue;
    }

    let bucket = byEmail.get(parsed.email);

    if (!bucket) {
      bucket = {
        ips: new Set(),
        subnets: new Set(),
        total: 0,
        firstSeen: parsed.timestamp,
        lastSeen: parsed.timestamp,
      };
      byEmail.set(parsed.email, bucket);
    }

    bucket.ips.add(parsed.ip);
    bucket.subnets.add(ipToSubnet(parsed.ip));
    bucket.total += 1;

    if (parsed.timestamp.getTime() < bucket.firstSeen.getTime()) {
      bucket.firstSeen = parsed.timestamp;
    }

    if (parsed.timestamp.getTime() > bucket.lastSeen.getTime()) {
      bucket.lastSeen = parsed.timestamp;
    }
  }

  const result: SharingDetectionMap = new Map();

  for (const [email, bucket] of byEmail) {
    result.set(email, {
      email,
      uniqueIps: bucket.ips.size,
      uniqueSubnets: bucket.subnets.size,
      totalConnections: bucket.total,
      firstSeen: bucket.firstSeen,
      lastSeen: bucket.lastSeen,
      sampleIps: Array.from(bucket.ips).slice(0, 5),
    });
  }

  return result;
}

async function fetchAccessLog(): Promise<string> {
  const command = `docker exec ${JSON.stringify(env.xrayContainerName)} sh -c ${JSON.stringify(`tail -n 100000 ${env.xrayAccessLogPath} 2>/dev/null || true`)}`;
  return runSshCommand(command);
}

export const xrayAccessLogService = {
  isEnabled(): boolean {
    return isSshConfigured();
  },

  invalidateCache(): void {
    cache = null;
  },

  async getSharingStats(now = new Date()): Promise<SharingDetectionMap> {
    if (!isSshConfigured()) {
      return new Map();
    }

    if (cache && cache.expiresAt > now.getTime()) {
      return cache.stats;
    }

    try {
      const stdout = await fetchAccessLog();
      const lines = stdout.split(/\r?\n/);
      const since = new Date(
        now.getTime() - env.sharingDetectorWindowHours * 60 * 60 * 1000,
      );
      const stats = aggregateAccessLog(lines, since);

      cache = {
        stats,
        expiresAt: now.getTime() + CACHE_TTL_MS,
      };

      return stats;
    } catch (error) {
      logger.warn({ error }, "Failed to read Xray access log");
      return new Map();
    }
  },

  async getStatsForEmail(email: string, now = new Date()): Promise<EmailIpStats | null> {
    const all = await this.getSharingStats(now);
    return all.get(email) ?? null;
  },
};
