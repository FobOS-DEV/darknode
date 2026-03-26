import { readFileSync } from "node:fs";

import { env } from "../config/env";
import { logger } from "../config/logger";

const { Client } = require("ssh2") as {
  Client: new () => {
    on(event: string, listener: (...args: any[]) => void): any;
    connect(config: Record<string, unknown>): void;
    exec(
      command: string,
      callback: (
        error: Error | undefined,
        stream: any,
      ) => void,
    ): void;
    end(): void;
  };
};

type XrayStatItem = {
  name?: string;
  value?: number;
};

export type UserTrafficStats = {
  uplinkBytes: number;
  downlinkBytes: number;
  totalBytes: number;
};

export type UserTrafficStatsMap = Record<string, UserTrafficStats>;

function isSshConfigured(): boolean {
  return Boolean(env.sshHost && env.sshUser && (env.sshPassword || env.sshKeyPath));
}

function buildConnectConfig(): Record<string, unknown> {
  if (!env.sshHost || !env.sshUser) {
    throw new Error("SSH_HOST and SSH_USER are required for Xray stats");
  }

  if (!env.sshPassword && !env.sshKeyPath) {
    throw new Error("Either SSH_PASSWORD or SSH_KEY_PATH is required for Xray stats");
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
                reject(new Error(stderr || `SSH command failed with exit code ${code}`));
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

function extractTrafficStats(items: XrayStatItem[], emailLabel: string): UserTrafficStats {
  const uplinkName = `user>>>${emailLabel}>>>traffic>>>uplink`;
  const downlinkName = `user>>>${emailLabel}>>>traffic>>>downlink`;

  const uplinkBytes = items.find((item) => item.name === uplinkName)?.value ?? 0;
  const downlinkBytes = items.find((item) => item.name === downlinkName)?.value ?? 0;

  return {
    uplinkBytes,
    downlinkBytes,
    totalBytes: uplinkBytes + downlinkBytes,
  };
}

function extractAllTrafficStats(items: XrayStatItem[]): UserTrafficStatsMap {
  const statsByUser: UserTrafficStatsMap = {};

  for (const item of items) {
    if (!item.name || typeof item.value !== "number") {
      continue;
    }

    const match = item.name.match(/^user>>>(.+)>>>traffic>>>(uplink|downlink)$/);

    if (!match) {
      continue;
    }

    const [, emailLabel, direction] = match;
    const current = statsByUser[emailLabel] ?? {
      uplinkBytes: 0,
      downlinkBytes: 0,
      totalBytes: 0,
    };

    if (direction === "uplink") {
      current.uplinkBytes = item.value;
    } else {
      current.downlinkBytes = item.value;
    }

    current.totalBytes = current.uplinkBytes + current.downlinkBytes;
    statsByUser[emailLabel] = current;
  }

  return statsByUser;
}

function getStatsApiAddress(): string {
  return env.xrayApiAddress ?? "127.0.0.1:10085";
}

export const xrayStatsService = {
  isEnabled() {
    return isSshConfigured();
  },

  async getUserTraffic(emailLabel: string): Promise<UserTrafficStats | null> {
    if (!isSshConfigured()) {
      return null;
    }

    try {
      const allStats = await this.getAllUserTraffic();
      return allStats[emailLabel] ?? {
        uplinkBytes: 0,
        downlinkBytes: 0,
        totalBytes: 0,
      };
    } catch (error) {
      logger.warn(
        { error, emailLabel },
        "Failed to read Xray traffic stats",
      );
      return null;
    }
  },

  async getAllUserTraffic(): Promise<UserTrafficStatsMap> {
    if (!isSshConfigured()) {
      return {};
    }

    try {
      const stdout = await runSshCommand(
        `docker exec ${JSON.stringify(env.xrayContainerName)} xray api statsquery --server=${JSON.stringify(getStatsApiAddress())}`,
      );
      const parsed = JSON.parse(stdout) as { stat?: XrayStatItem[] };

      return extractAllTrafficStats(parsed.stat ?? []);
    } catch (error) {
      logger.warn(
        { error },
        "Failed to read Xray traffic stats map",
      );
      return {};
    }
  },
};
