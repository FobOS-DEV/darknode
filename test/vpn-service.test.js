const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createTestDatabase,
  loadProjectModules,
  disposeTestDatabase,
} = require("./helpers/testDb");

function buildVpnInput(overrides = {}) {
  return {
    telegramId: "1001",
    fullName: "Test User",
    displayName: "Test User",
    emailLabel: "test@example.com",
    uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    vlessUrl: "vless://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa@test.local:443#Test_User",
    server: "test.local",
    port: 443,
    publicKey: "public-key",
    shortId: "ab12",
    sni: "test.local",
    flow: "xtls-rprx-vision",
    ...overrides,
  };
}

test("vpnService returns active for active user", async () => {
  const db = createTestDatabase();
  const { prisma, vpnService } = loadProjectModules(db.databaseUrl);

  try {
    await vpnService.upsertVpnClient(
      buildVpnInput({
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }),
    );

    const access = await vpnService.getUserAccessState("1001");

    assert.equal(access.kind, "active");
    assert.equal(access.client.status, "ACTIVE");
    assert.equal(access.client.displayName, "Test User");
  } finally {
    await disposeTestDatabase(prisma, db.tempDir);
  }
});

test("vpnService returns inactive and marks expired users as EXPIRED", async () => {
  const db = createTestDatabase();
  const { prisma, vpnService } = loadProjectModules(db.databaseUrl);

  try {
    await vpnService.upsertVpnClient(
      buildVpnInput({
        telegramId: "1002",
        uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      }),
    );

    const access = await vpnService.getUserAccessState("1002");
    const user = await prisma.user.findUnique({
      where: { telegramId: "1002" },
      include: { vpnClient: true },
    });

    assert.equal(access.kind, "inactive");
    assert.equal(access.client.status, "EXPIRED");
    assert.equal(user.vpnClient.status, "EXPIRED");
  } finally {
    await disposeTestDatabase(prisma, db.tempDir);
  }
});

test("vpnService returns not_found for unknown telegram id", async () => {
  const db = createTestDatabase();
  const { prisma, vpnService } = loadProjectModules(db.databaseUrl);

  try {
    const access = await vpnService.getUserAccessState("404");
    assert.deepEqual(access, { kind: "not_found" });
  } finally {
    await disposeTestDatabase(prisma, db.tempDir);
  }
});
