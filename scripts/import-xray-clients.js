require("dotenv").config();

const { readFileSync } = require("node:fs");
const { PrismaClient } = require("@prisma/client");
const { Client } = require("ssh2");

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getOptionalNumberEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer`);
  }

  return parsed;
}

function normalizeDatabaseUrl(rawUrl) {
  if (!rawUrl || !rawUrl.startsWith("file:")) {
    return rawUrl;
  }

  const path = require("node:path");
  const filePath = rawUrl.slice(5);

  if (path.isAbsolute(filePath)) {
    const normalizedPath = filePath.replace(/\\/g, "/");
    return process.platform === "win32" ? `file:${normalizedPath}` : `file:${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`;
  }

  const absolutePath = path.resolve(process.cwd(), filePath).replace(/\\/g, "/");
  return process.platform === "win32" ? `file:${absolutePath}` : `file:/${absolutePath}`;
}

process.env.DATABASE_URL = normalizeDatabaseUrl(process.env.DATABASE_URL);

function buildConnectConfig() {
  const keyPath = process.env.SSH_KEY_PATH;

  return {
    host: getRequiredEnv("SSH_HOST"),
    port: getOptionalNumberEnv("SSH_PORT", 22),
    username: getRequiredEnv("SSH_USER"),
    password: process.env.SSH_PASSWORD || undefined,
    privateKey: keyPath ? readFileSync(keyPath, "utf8") : undefined,
  };
}

function runSshCommand(command) {
  return new Promise((resolve, reject) => {
    const client = new Client();

    client
      .on("ready", () => {
        client.exec(command, (error, stream) => {
          if (error) {
            client.end();
            reject(error);
            return;
          }

          let stdout = "";
          let stderr = "";

          stream
            .on("close", (code) => {
              client.end();

              if (code !== 0) {
                reject(new Error(stderr || `SSH command failed with code ${code}`));
                return;
              }

              resolve(stdout);
            })
            .on("data", (chunk) => {
              stdout += chunk.toString();
            });

          stream.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
          });
        });
      })
      .on("error", reject)
      .connect(buildConnectConfig());
  });
}

function prettifyName(emailLabel) {
  const base = emailLabel.replace(/@.*$/, "");

  if (base.startsWith("tg-")) {
    return `Imported ${base}`;
  }

  return base
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function makeImportedTelegramId(emailLabel, uuid) {
  const normalized = emailLabel.toLowerCase().replace(/[^a-z0-9._-]/g, "_");
  return `imported:${normalized}:${uuid.slice(0, 8)}`;
}

function makeVlessUrl({ uuid, host, port, publicKey, fingerprint, sni, shortId, flow, label }) {
  const query = new URLSearchParams({
    security: "reality",
    pbk: publicKey,
    fp: fingerprint,
    sni,
    sid: shortId,
    type: "tcp",
    flow,
    encryption: "none",
  });

  return `vless://${uuid}@${host}:${port}?${query.toString()}#${encodeURIComponent(label)}`;
}

async function fetchServerClients() {
  const configPath = process.env.XRAY_CONFIG_PATH || "/opt/xray-reality/config.json";
  const remoteScript = [
    "python3 - <<'PY'",
    "import json",
    "from pathlib import Path",
    `config_path = Path(${JSON.stringify(configPath)})`,
    "data = json.loads(config_path.read_text())",
    "inbound = next((x for x in data.get('inbounds', []) if x.get('protocol') == 'vless' and x.get('streamSettings', {}).get('security') == 'reality'), None)",
    "if inbound is None:",
    "    raise SystemExit('No VLESS reality inbound found')",
    "payload = {",
    "  'port': inbound.get('port'),",
    "  'clients': inbound.get('settings', {}).get('clients', []),",
    "  'serverNames': inbound.get('streamSettings', {}).get('realitySettings', {}).get('serverNames', []),",
    "  'shortIds': inbound.get('streamSettings', {}).get('realitySettings', {}).get('shortIds', []),",
    "}",
    "print(json.dumps(payload, ensure_ascii=False))",
    "PY",
  ].join("\n");

  const stdout = await runSshCommand(remoteScript);
  return JSON.parse(stdout.trim());
}

async function main() {
  const prisma = new PrismaClient();

  try {
    const vpnHost = process.env.VPN_SERVER_HOST || process.env.SSH_HOST;
    const vpnPort = getOptionalNumberEnv("VPN_SERVER_PORT", 443);
    const publicKey = getRequiredEnv("VPN_PUBLIC_KEY");
    const fingerprint = process.env.VPN_FINGERPRINT || "chrome";
    const fallbackSni = process.env.VPN_SNI || "www.cloudflare.com";
    const fallbackFlow = process.env.VPN_FLOW || "xtls-rprx-vision";
    const fallbackShortId = process.env.VPN_SHORT_ID || null;
    const snapshot = await fetchServerClients();
    const shortId = snapshot.shortIds?.[0] || fallbackShortId;
    const sni = snapshot.serverNames?.[0] || fallbackSni;

    if (!vpnHost) {
      throw new Error("VPN_SERVER_HOST or SSH_HOST must be configured");
    }

    if (!shortId) {
      throw new Error("No shortIds found in remote Xray config");
    }

    let createdUsers = 0;
    let upsertedClients = 0;

    for (const remoteClient of snapshot.clients) {
      const emailLabel = remoteClient.email || `imported-${remoteClient.id}`;
      const displayName = prettifyName(emailLabel);
      const telegramId = makeImportedTelegramId(emailLabel, remoteClient.id);
      const existingClient = await prisma.vpnClient.findUnique({
        where: { uuid: remoteClient.id },
        include: { user: true },
      });

      let userId;

      if (existingClient) {
        userId = existingClient.userId;
      } else {
        const user = await prisma.user.upsert({
          where: { telegramId },
          update: {
            fullName: displayName,
          },
          create: {
            telegramId,
            fullName: displayName,
          },
        });
        userId = user.id;
        if (!existingClient) {
          createdUsers += 1;
        }
      }

      const vlessUrl = makeVlessUrl({
        uuid: remoteClient.id,
        host: vpnHost,
        port: snapshot.port || vpnPort,
        publicKey,
        fingerprint,
        sni,
        shortId,
        flow: remoteClient.flow || fallbackFlow,
        label: displayName,
      });

      await prisma.vpnClient.upsert({
        where: { userId },
        update: {
          displayName,
          emailLabel,
          uuid: remoteClient.id,
          vlessUrl,
          server: vpnHost,
          port: snapshot.port || vpnPort,
          publicKey,
          shortId,
          sni,
          flow: remoteClient.flow || fallbackFlow,
          status: "ACTIVE",
          expiresAt: null,
        },
        create: {
          userId,
          displayName,
          emailLabel,
          uuid: remoteClient.id,
          vlessUrl,
          server: vpnHost,
          port: snapshot.port || vpnPort,
          publicKey,
          shortId,
          sni,
          flow: remoteClient.flow || fallbackFlow,
          status: "ACTIVE",
          expiresAt: null,
        },
      });

      upsertedClients += 1;
    }

    console.log(
      JSON.stringify(
        {
          importedClients: upsertedClients,
          createdUsers,
          shortId,
          sni,
          port: snapshot.port || vpnPort,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
