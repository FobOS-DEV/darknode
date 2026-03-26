const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createTestDatabase,
  loadProjectModules,
  disposeTestDatabase,
} = require("./helpers/testDb");

function buildVpnInput(overrides = {}) {
  return {
    telegramId: "2001",
    fullName: "Admin Target",
    displayName: "Admin Target",
    emailLabel: "admin@example.com",
    uuid: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    vlessUrl: "vless://cccccccc-cccc-4ccc-8ccc-cccccccccccc@test.local:443#Admin_Target",
    server: "test.local",
    port: 443,
    publicKey: "public-key",
    shortId: "cd34",
    sni: "test.local",
    flow: "xtls-rprx-vision",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    ...overrides,
  };
}

test("adminService disable/enable updates client status and writes audit logs", async () => {
  const db = createTestDatabase();
  const { prisma, adminService } = loadProjectModules(db.databaseUrl);

  try {
    const actor = await prisma.user.create({
      data: {
        telegramId: "9000",
        fullName: "Admin User",
        isAdmin: true,
      },
    });

    await adminService.addOrUpdateUser(actor.id, buildVpnInput());
    await adminService.setDisabled(actor.id, "2001", true);
    await adminService.setDisabled(actor.id, "2001", false);

    const user = await prisma.user.findUnique({
      where: { telegramId: "2001" },
      include: { vpnClient: true },
    });
    const logs = await prisma.auditLog.findMany({
      orderBy: { id: "asc" },
    });

    assert.equal(user.vpnClient.status, "ACTIVE");
    assert.deepEqual(
      logs.map((log) => log.action),
      ["admin.add_or_update_user", "admin.disable_user", "admin.enable_user"],
    );
  } finally {
    await disposeTestDatabase(prisma, db.tempDir);
  }
});

test("adminService setExpiry updates expiry and writes audit log", async () => {
  const db = createTestDatabase();
  const { prisma, adminService } = loadProjectModules(db.databaseUrl);

  try {
    const actor = await prisma.user.create({
      data: {
        telegramId: "9001",
        fullName: "Admin User",
        isAdmin: true,
      },
    });

    await adminService.addOrUpdateUser(actor.id, buildVpnInput({ telegramId: "2002", uuid: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }));

    const newExpiry = new Date("2026-12-31T00:00:00.000Z");
    const client = await adminService.setExpiry(actor.id, "2002", newExpiry);
    const lastLog = await prisma.auditLog.findFirst({
      where: { action: "admin.set_expiry" },
      orderBy: { id: "desc" },
    });

    assert.equal(client.expiresAt.toISOString(), newExpiry.toISOString());
    assert.match(lastLog.payloadJson, /2026-12-31T00:00:00.000Z/);
  } finally {
    await disposeTestDatabase(prisma, db.tempDir);
  }
});
