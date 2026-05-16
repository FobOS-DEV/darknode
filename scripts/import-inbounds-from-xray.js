/**
 * Import xray inbounds (other than the bootstrap-default) into the bot DB
 * as Inbound rows + InboundUser entries mapped by VpnClient.uuid.
 *
 * Usage on prod (inside /opt/darknode):
 *   node scripts/import-inbounds-from-xray.js [--dry-run]
 *
 * Reads XRAY_CONFIG_PATH (default /opt/xray-reality/config.json) and the bot DB.
 * Idempotent: skips inbounds already present (by inboundTag).
 */

require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");

const xrayConfigPath = process.env.XRAY_CONFIG_PATH || "/opt/xray-reality/config.json";
const bootstrapTag = process.env.XRAY_INBOUND_TAG || "vless-reality";
const defaultVpnHost = process.env.VPN_SERVER_HOST || "vpn.example.com";
const defaultFingerprint = process.env.VPN_FINGERPRINT || "chrome";
const dryRun = process.argv.includes("--dry-run");

function normalizeDatabaseUrl(rawUrl) {
  if (!rawUrl || !rawUrl.startsWith("file:")) {
    throw new Error("DATABASE_URL must use sqlite file:... format");
  }
  const filePath = rawUrl.slice(5);
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  const normalizedPath = absolutePath.replace(/\\/g, "/");
  return process.platform === "win32" ? `file:${normalizedPath}` : `file:/${normalizedPath}`;
}

if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = normalizeDatabaseUrl(process.env.DATABASE_URL);
}

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function extractServerName(realitySettings) {
  const names = realitySettings && realitySettings.serverNames;
  if (Array.isArray(names) && names.length > 0) return names[0];
  return null;
}

function extractDestHost(realitySettings) {
  const dest = realitySettings && realitySettings.dest;
  if (typeof dest === "string") {
    const [host] = dest.split(":");
    return host;
  }
  return null;
}

function extractShortId(realitySettings) {
  const ids = realitySettings && realitySettings.shortIds;
  if (Array.isArray(ids) && ids.length > 0) return ids[0];
  return null;
}

function buildLabelFromTag(tag) {
  const stripped = tag.replace(/^vless-reality-?/, "").replace(/-/g, " ").trim();
  if (!stripped) return tag;
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

async function main() {
  const raw = fs.readFileSync(xrayConfigPath, "utf8");
  const config = JSON.parse(raw);
  const inbounds = Array.isArray(config.inbounds) ? config.inbounds : [];

  let importedInbounds = 0;
  let skippedExisting = 0;
  let skippedBootstrap = 0;
  let importedUsers = 0;
  let orphanedClients = 0;

  for (const inbound of inbounds) {
    if (inbound.protocol !== "vless") continue;
    const tag = inbound.tag;
    if (!tag) continue;

    if (tag === bootstrapTag) {
      skippedBootstrap += 1;
      continue;
    }

    const existing = await prisma.inbound.findUnique({ where: { inboundTag: tag } });
    if (existing) {
      skippedExisting += 1;
      continue;
    }

    const reality = inbound.streamSettings && inbound.streamSettings.realitySettings;
    const sni = extractServerName(reality);
    const destHost = extractDestHost(reality);
    const shortId = extractShortId(reality);
    const publicKey = (reality && reality.publicKey) || process.env.VPN_PUBLIC_KEY || "change-me";

    const clients = (inbound.settings && Array.isArray(inbound.settings.clients))
      ? inbound.settings.clients
      : [];
    const flow = (clients[0] && clients[0].flow) || process.env.VPN_FLOW || "xtls-rprx-vision";

    const payload = {
      label: buildLabelFromTag(tag),
      inboundTag: tag,
      host: defaultVpnHost,
      port: typeof inbound.port === "number" ? inbound.port : 443,
      sni: sni || destHost || process.env.VPN_SNI || "example.com",
      publicKey,
      shortId: shortId || process.env.VPN_SHORT_ID || "change-me",
      flow,
      fingerprint: defaultFingerprint,
      network: (inbound.streamSettings && inbound.streamSettings.network) || "tcp",
      security: (inbound.streamSettings && inbound.streamSettings.security) || "reality",
      status: "STANDBY",
      priority: 100,
    };

    if (dryRun) {
      console.log("[dry-run] would create Inbound:", payload);
      console.log(`[dry-run]   ${clients.length} client(s) in this inbound`);
      continue;
    }

    const created = await prisma.inbound.create({ data: payload });
    importedInbounds += 1;

    for (const client of clients) {
      if (!client.id) continue;
      const vpnClient = await prisma.vpnClient.findUnique({ where: { uuid: client.id } });
      if (!vpnClient) {
        console.warn(`  orphan xray client uuid=${client.id} email=${client.email} (no matching VpnClient)`);
        orphanedClients += 1;
        continue;
      }

      await prisma.inboundUser.upsert({
        where: {
          inboundId_userId: {
            inboundId: created.id,
            userId: vpnClient.userId,
          },
        },
        create: {
          inboundId: created.id,
          userId: vpnClient.userId,
        },
        update: {},
      });
      importedUsers += 1;
    }

    console.log(`Imported inbound "${created.label}" (tag=${tag}, port=${created.port}) with ${clients.length} client(s)`);
  }

  console.log("\nSummary:");
  console.log(`  imported inbounds:   ${importedInbounds}`);
  console.log(`  skipped (existing):  ${skippedExisting}`);
  console.log(`  skipped (bootstrap): ${skippedBootstrap}`);
  console.log(`  imported users:      ${importedUsers}`);
  console.log(`  orphan clients:      ${orphanedClients}`);
  if (importedInbounds > 0 && !dryRun) {
    console.log(`\nAll imported inbounds are in STANDBY. Review with /inbounds and promote to ACTIVE when ready.`);
  }
}

main()
  .catch((error) => {
    console.error("import failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
