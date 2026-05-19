const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createTestDatabase,
  loadProjectModules,
  disposeTestDatabase,
} = require("./helpers/testDb");

async function loadInboundAdminService() {
  return require("../dist/services/inboundAdminService.js").inboundAdminService;
}

async function createAdminUser(prisma) {
  return prisma.user.create({
    data: {
      telegramId: "9000",
      fullName: "Admin",
      isAdmin: true,
    },
  });
}

function buildInboundInput(overrides = {}) {
  return {
    label: "Primary",
    inboundTag: "vless-reality",
    host: "vpn.example.com",
    port: 443,
    sni: "example.com",
    publicKey: "pub-key",
    shortId: "ab12",
    flow: "xtls-rprx-vision",
    ...overrides,
  };
}

test("inboundAdminService.create stores new inbound in STANDBY and logs audit entry", async () => {
  const db = createTestDatabase();
  const { prisma } = loadProjectModules(db.databaseUrl);
  const inboundAdminService = await loadInboundAdminService();

  try {
    const admin = await createAdminUser(prisma);

    const inbound = await inboundAdminService.create(admin.id, buildInboundInput());

    assert.equal(inbound.status, "STANDBY");
    assert.equal(inbound.inboundTag, "vless-reality");
    assert.equal(inbound.fingerprint, "chrome");
    assert.equal(inbound.network, "tcp");
    assert.equal(inbound.security, "reality");

    const log = await prisma.auditLog.findFirst({
      where: { action: "admin.inbound_create" },
    });
    assert.ok(log, "audit log should be written");
    assert.equal(log.actorUserId, admin.id);
  } finally {
    await disposeTestDatabase(prisma, db.tempDir);
  }
});

test("inboundAdminService.setStatus to DEPRECATED stamps deprecatedAt and logs", async () => {
  const db = createTestDatabase();
  const { prisma } = loadProjectModules(db.databaseUrl);
  const inboundAdminService = await loadInboundAdminService();

  try {
    const admin = await createAdminUser(prisma);
    const inbound = await inboundAdminService.create(admin.id, buildInboundInput());

    await inboundAdminService.setStatus(admin.id, inbound.id, "ACTIVE");
    const updated = await inboundAdminService.setStatus(admin.id, inbound.id, "DEPRECATED");

    assert.equal(updated.status, "DEPRECATED");
    assert.ok(updated.deprecatedAt, "deprecatedAt should be set");

    const restored = await inboundAdminService.setStatus(admin.id, inbound.id, "ACTIVE");
    assert.equal(restored.status, "ACTIVE");
    assert.equal(restored.deprecatedAt, null);

    const logs = await prisma.auditLog.findMany({
      where: { action: "admin.inbound_status" },
      orderBy: { id: "asc" },
    });
    assert.equal(logs.length, 3);
    const lastPayload = JSON.parse(logs[2].payloadJson);
    assert.equal(lastPayload.previousStatus, "DEPRECATED");
    assert.equal(lastPayload.newStatus, "ACTIVE");
  } finally {
    await disposeTestDatabase(prisma, db.tempDir);
  }
});

test("inboundAdminService.setStatus returns null for unknown inbound", async () => {
  const db = createTestDatabase();
  const { prisma } = loadProjectModules(db.databaseUrl);
  const inboundAdminService = await loadInboundAdminService();

  try {
    const admin = await createAdminUser(prisma);
    const result = await inboundAdminService.setStatus(admin.id, 9999, "ACTIVE");
    assert.equal(result, null);
  } finally {
    await disposeTestDatabase(prisma, db.tempDir);
  }
});

test("inboundAdminService.list returns inbounds in status order", async () => {
  const db = createTestDatabase();
  const { prisma } = loadProjectModules(db.databaseUrl);
  const inboundAdminService = await loadInboundAdminService();

  try {
    const admin = await createAdminUser(prisma);

    const standby = await inboundAdminService.create(
      admin.id,
      buildInboundInput({ inboundTag: "standby-tag", label: "Standby" }),
    );
    const active = await inboundAdminService.create(
      admin.id,
      buildInboundInput({ inboundTag: "active-tag", label: "Active" }),
    );
    await inboundAdminService.setStatus(admin.id, active.id, "ACTIVE");

    const list = await inboundAdminService.list();

    assert.equal(list.length, 2);
    assert.equal(list[0].status, "ACTIVE");
    assert.equal(list[1].status, "STANDBY");
    assert.equal(list[1].id, standby.id);
  } finally {
    await disposeTestDatabase(prisma, db.tempDir);
  }
});
