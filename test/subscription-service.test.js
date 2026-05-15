const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createTestDatabase,
  loadProjectModules,
  disposeTestDatabase,
} = require("./helpers/testDb");

function decodeContent(content) {
  return Buffer.from(content, "base64").toString("utf8");
}

async function seedInbound(prisma, overrides = {}) {
  return prisma.inbound.create({
    data: {
      label: "Primary",
      inboundTag: "vless-reality",
      host: "vpn.example.com",
      port: 443,
      sni: "example.com",
      publicKey: "pub-key",
      shortId: "ab12",
      flow: "xtls-rprx-vision",
      fingerprint: "chrome",
      network: "tcp",
      security: "reality",
      status: "ACTIVE",
      priority: 0,
      ...overrides,
    },
  });
}

function buildVpnInput(overrides = {}) {
  return {
    telegramId: "7001",
    fullName: "Sub User",
    displayName: "Sub User",
    emailLabel: "sub@example.com",
    uuid: "11111111-1111-4111-8111-111111111111",
    vlessUrl: "vless://placeholder",
    server: "vpn.example.com",
    port: 443,
    publicKey: "pub-key",
    shortId: "ab12",
    sni: "example.com",
    flow: "xtls-rprx-vision",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    ...overrides,
  };
}

async function loadSubscriptionModule() {
  return require("../dist/services/subscriptionService.js").subscriptionService;
}

test("subscriptionService returns base64 vless lines for active client and ACTIVE inbounds", async () => {
  const db = createTestDatabase();
  const { prisma, vpnService } = loadProjectModules(db.databaseUrl);
  const subscriptionService = await loadSubscriptionModule();

  try {
    await seedInbound(prisma);
    await seedInbound(prisma, {
      label: "Backup",
      inboundTag: "vless-reality-backup",
      port: 8443,
      shortId: "cd34",
    });

    await vpnService.upsertVpnClient(buildVpnInput());

    const user = await prisma.user.findUnique({ where: { telegramId: "7001" } });
    const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
    assert.ok(sub, "subscription should be auto-created");

    const result = await subscriptionService.resolveByToken(sub.token);

    assert.equal(result.kind, "ok");
    assert.equal(result.inboundCount, 2);

    const decoded = decodeContent(result.content);
    const lines = decoded.split("\n");
    assert.equal(lines.length, 2);
    assert.match(lines[0], /^vless:\/\/11111111-1111-4111-8111-111111111111@vpn\.example\.com:443\?/);
    assert.match(lines[1], /^vless:\/\/11111111-1111-4111-8111-111111111111@vpn\.example\.com:8443\?/);
    assert.match(lines[0], /security=reality/);
    assert.match(lines[0], /sni=example\.com/);
    assert.match(lines[0], /flow=xtls-rprx-vision/);
  } finally {
    await disposeTestDatabase(prisma, db.tempDir);
  }
});

test("subscriptionService returns empty content when client is disabled", async () => {
  const db = createTestDatabase();
  const { prisma, vpnService } = loadProjectModules(db.databaseUrl);
  const subscriptionService = await loadSubscriptionModule();

  try {
    await seedInbound(prisma);
    await vpnService.upsertVpnClient(
      buildVpnInput({
        telegramId: "7002",
        uuid: "22222222-2222-4222-8222-222222222222",
      }),
    );
    await vpnService.setStatus("7002", "DISABLED");

    const user = await prisma.user.findUnique({ where: { telegramId: "7002" } });
    const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });

    const result = await subscriptionService.resolveByToken(sub.token);
    assert.equal(result.kind, "ok");
    assert.equal(result.content, "");
    assert.equal(result.inboundCount, 0);
  } finally {
    await disposeTestDatabase(prisma, db.tempDir);
  }
});

test("subscriptionService returns revoked for revoked tokens", async () => {
  const db = createTestDatabase();
  const { prisma, vpnService } = loadProjectModules(db.databaseUrl);
  const subscriptionService = await loadSubscriptionModule();

  try {
    await seedInbound(prisma);
    await vpnService.upsertVpnClient(
      buildVpnInput({
        telegramId: "7003",
        uuid: "33333333-3333-4333-8333-333333333333",
      }),
    );

    const user = await prisma.user.findUnique({ where: { telegramId: "7003" } });
    const sub = await prisma.subscription.update({
      where: { userId: user.id },
      data: { revokedAt: new Date() },
    });

    const result = await subscriptionService.resolveByToken(sub.token);
    assert.equal(result.kind, "revoked");
  } finally {
    await disposeTestDatabase(prisma, db.tempDir);
  }
});

test("subscriptionService returns not_found for unknown token", async () => {
  const db = createTestDatabase();
  const { prisma } = loadProjectModules(db.databaseUrl);
  const subscriptionService = await loadSubscriptionModule();

  try {
    const result = await subscriptionService.resolveByToken("definitely-not-a-token");
    assert.equal(result.kind, "not_found");
  } finally {
    await disposeTestDatabase(prisma, db.tempDir);
  }
});

test("subscriptionService skips STANDBY inbounds", async () => {
  const db = createTestDatabase();
  const { prisma, vpnService } = loadProjectModules(db.databaseUrl);
  const subscriptionService = await loadSubscriptionModule();

  try {
    await seedInbound(prisma);
    await seedInbound(prisma, {
      label: "Reserve",
      inboundTag: "vless-reality-reserve",
      port: 8443,
      shortId: "ef56",
      status: "STANDBY",
    });

    await vpnService.upsertVpnClient(
      buildVpnInput({
        telegramId: "7004",
        uuid: "44444444-4444-4444-8444-444444444444",
      }),
    );

    const user = await prisma.user.findUnique({ where: { telegramId: "7004" } });
    const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });

    const result = await subscriptionService.resolveByToken(sub.token);
    assert.equal(result.kind, "ok");
    assert.equal(result.inboundCount, 1);
    const decoded = decodeContent(result.content);
    assert.equal(decoded.split("\n").length, 1);
    assert.match(decoded, /:443\?/);
  } finally {
    await disposeTestDatabase(prisma, db.tempDir);
  }
});

test("subscriptionService rotates tokens on demand", async () => {
  const db = createTestDatabase();
  const { prisma, vpnService } = loadProjectModules(db.databaseUrl);
  const subscriptionService = await loadSubscriptionModule();

  try {
    await seedInbound(prisma);
    await vpnService.upsertVpnClient(
      buildVpnInput({
        telegramId: "7005",
        uuid: "55555555-5555-4555-8555-555555555555",
      }),
    );

    const user = await prisma.user.findUnique({ where: { telegramId: "7005" } });
    const original = await prisma.subscription.findUnique({ where: { userId: user.id } });

    const rotated = await subscriptionService.rotateForUser(user.id);

    assert.notEqual(original.token, rotated.token);
    assert.equal(rotated.revokedAt, null);

    const previous = await subscriptionService.resolveByToken(original.token);
    assert.equal(previous.kind, "not_found");

    const next = await subscriptionService.resolveByToken(rotated.token);
    assert.equal(next.kind, "ok");
  } finally {
    await disposeTestDatabase(prisma, db.tempDir);
  }
});
