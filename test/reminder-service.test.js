const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createTestDatabase,
  loadProjectModules,
  disposeTestDatabase,
} = require("./helpers/testDb");

function buildVpnInput(overrides = {}) {
  return {
    telegramId: "3001",
    fullName: "Reminder User",
    displayName: "Reminder User",
    emailLabel: "reminder@example.com",
    uuid: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    vlessUrl: "vless://eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee@test.local:443#Reminder_User",
    server: "test.local",
    port: 443,
    publicKey: "public-key",
    shortId: "ef56",
    sni: "test.local",
    flow: "xtls-rprx-vision",
    ...overrides,
  };
}

test("reminderService selects active users matching reminder days", async () => {
  const db = createTestDatabase();
  const { prisma, vpnService } = loadProjectModules(db.databaseUrl);
  const { reminderService } = require("../dist/services/reminderService.js");

  try {
    const now = new Date("2026-03-26T00:00:00.000Z");

    await vpnService.upsertVpnClient(
      buildVpnInput({
        telegramId: "3001",
        expiresAt: new Date("2026-04-02T00:00:00.000Z"),
      }),
    );

    await vpnService.upsertVpnClient(
      buildVpnInput({
        telegramId: "3002",
        uuid: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        expiresAt: new Date("2026-03-29T00:00:00.000Z"),
      }),
    );

    await vpnService.upsertVpnClient(
      buildVpnInput({
        telegramId: "3003",
        uuid: "11111111-1111-4111-8111-111111111111",
        expiresAt: new Date("2026-03-28T00:00:00.000Z"),
      }),
    );

    const reminders = await reminderService.listPendingExpiryReminders([7, 3, 1], now);

    assert.deepEqual(
      reminders.map((item) => [item.telegramId, item.daysLeft]),
      [
        ["3002", 3],
        ["3001", 7],
      ],
    );
  } finally {
    await disposeTestDatabase(prisma, db.tempDir);
  }
});

test("reminderService skips already logged reminders for the same expiry window", async () => {
  const db = createTestDatabase();
  const { prisma, vpnService } = loadProjectModules(db.databaseUrl);
  const { reminderService } = require("../dist/services/reminderService.js");

  try {
    const now = new Date("2026-03-26T00:00:00.000Z");
    const admin = await prisma.user.create({
      data: {
        telegramId: "9002",
        fullName: "Admin User",
        isAdmin: true,
      },
    });

    await vpnService.upsertVpnClient(
      buildVpnInput({
        telegramId: "3010",
        uuid: "22222222-2222-4222-8222-222222222222",
        expiresAt: new Date("2026-04-02T00:00:00.000Z"),
      }),
    );

    const target = await prisma.user.findUnique({
      where: { telegramId: "3010" },
    });

    await prisma.auditLog.create({
      data: {
        action: "system.expiry_reminder",
        actorUserId: admin.id,
        targetUserId: target.id,
        payloadJson: JSON.stringify({
          daysBefore: 7,
          expiresAt: "2026-04-02T00:00:00.000Z",
        }),
      },
    });

    const reminders = await reminderService.listPendingExpiryReminders([7], now);
    assert.equal(reminders.length, 0);
  } finally {
    await disposeTestDatabase(prisma, db.tempDir);
  }
});
