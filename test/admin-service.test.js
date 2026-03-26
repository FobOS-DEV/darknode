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

test("adminService approves pending request and auto-generates vpn client", async () => {
  const db = createTestDatabase();
  const { prisma, adminService, requestService } = loadProjectModules(db.databaseUrl);

  try {
    const actor = await prisma.user.create({
      data: {
        telegramId: "9010",
        fullName: "Admin User",
        isAdmin: true,
      },
    });

    const submission = await requestService.submitAccessRequest({
      telegramId: "2010",
      username: "pending_user",
      fullName: "Pending User",
    });

    const client = await adminService.approveRequest(actor.id, submission.request.id);
    const approvedRequest = await prisma.accessRequest.findUnique({
      where: { id: submission.request.id },
    });
    const logs = await prisma.auditLog.findMany({
      orderBy: { id: "asc" },
    });

    assert.equal(client.user.telegramId, "2010");
    assert.equal(client.status, "ACTIVE");
    assert.match(client.vlessUrl, /^vless:\/\//);
    assert.equal(approvedRequest.status, "APPROVED");
    assert.ok(client.expiresAt instanceof Date);
    assert.deepEqual(
      logs.map((log) => log.action),
      ["admin.approve_request"],
    );
  } finally {
    await disposeTestDatabase(prisma, db.tempDir);
  }
});

test("adminService binds imported client to an existing telegram user", async () => {
  const db = createTestDatabase();
  const { prisma, adminService } = loadProjectModules(db.databaseUrl);

  try {
    const actor = await prisma.user.create({
      data: {
        telegramId: "9020",
        fullName: "Admin User",
        isAdmin: true,
      },
    });

    const importedUser = await prisma.user.create({
      data: {
        telegramId: "imported:nina@reality:2efbcff7",
        fullName: "Nina",
      },
    });

    await prisma.vpnClient.create({
      data: {
        userId: importedUser.id,
        displayName: "Nina",
        emailLabel: "nina@reality",
        uuid: "2efbcff7-26a5-4982-b9c0-4d8f41343d26",
        vlessUrl: "vless://2efbcff7-26a5-4982-b9c0-4d8f41343d26@test.local:443#Nina",
        server: "test.local",
        port: 443,
        publicKey: "public-key",
        shortId: "7c9435f33c10eccf",
        sni: "www.cloudflare.com",
        flow: "xtls-rprx-vision",
        status: "ACTIVE",
      },
    });

    await prisma.user.create({
      data: {
        telegramId: "500500500",
        username: "nina_real",
        fullName: "Nina Real",
      },
    });

    const result = await adminService.bindImportedClient(actor.id, "500500500", "nina@reality");
    const targetUser = await prisma.user.findUnique({
      where: { telegramId: "500500500" },
      include: { vpnClient: true },
    });
    const sourceUser = await prisma.user.findUnique({
      where: { id: importedUser.id },
      include: { vpnClient: true },
    });
    const log = await prisma.auditLog.findFirst({
      where: { action: "admin.bind_imported_client" },
    });

    assert.equal(result.ok, true);
    assert.equal(targetUser.vpnClient.emailLabel, "nina@reality");
    assert.equal(targetUser.vpnClient.uuid, "2efbcff7-26a5-4982-b9c0-4d8f41343d26");
    assert.equal(sourceUser.vpnClient, null);
    assert.match(log.payloadJson, /nina@reality/);
  } finally {
    await disposeTestDatabase(prisma, db.tempDir);
  }
});

test("adminService binds imported client directly from a pending request", async () => {
  const db = createTestDatabase();
  const { prisma, adminService, requestService } = loadProjectModules(db.databaseUrl);

  try {
    const actor = await prisma.user.create({
      data: {
        telegramId: "9030",
        fullName: "Admin User",
        isAdmin: true,
      },
    });

    const importedUser = await prisma.user.create({
      data: {
        telegramId: "imported:anna@reality:aa3784d4",
        fullName: "Anna",
      },
    });

    await prisma.vpnClient.create({
      data: {
        userId: importedUser.id,
        displayName: "Anna",
        emailLabel: "anna@reality",
        uuid: "aa3784d4-ec79-42ed-8041-5c5d952eb5c7",
        vlessUrl: "vless://aa3784d4-ec79-42ed-8041-5c5d952eb5c7@test.local:443#Anna",
        server: "test.local",
        port: 443,
        publicKey: "public-key",
        shortId: "7c9435f33c10eccf",
        sni: "www.cloudflare.com",
        flow: "xtls-rprx-vision",
        status: "ACTIVE",
      },
    });

    const submission = await requestService.submitAccessRequest({
      telegramId: "600600600",
      username: "anna_real",
      fullName: "Anna Real",
    });

    const result = await adminService.bindImportedClientToRequest(
      actor.id,
      submission.request.id,
      importedUser.id,
    );

    const targetUser = await prisma.user.findUnique({
      where: { telegramId: "600600600" },
      include: { vpnClient: true },
    });
    const updatedRequest = await prisma.accessRequest.findUnique({
      where: { id: submission.request.id },
    });

    assert.equal(result.ok, true);
    assert.equal(targetUser.vpnClient.emailLabel, "anna@reality");
    assert.equal(updatedRequest.status, "APPROVED");
  } finally {
    await disposeTestDatabase(prisma, db.tempDir);
  }
});
