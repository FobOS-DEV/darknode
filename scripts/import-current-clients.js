require('dotenv').config({ path: '/opt/darknode/.env' });
const path = require('node:path');
const fs = require('node:fs');

function normalizeDatabaseUrl(rawUrl) {
  if (!rawUrl || !rawUrl.startsWith('file:')) throw new Error('DATABASE_URL must use sqlite file:... format');
  const filePath = rawUrl.slice(5);
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve('/opt/darknode', filePath);
  const normalizedPath = absolutePath.replace(/\\/g, '/');
  return process.platform === 'win32' ? `file:${normalizedPath}` : `file:/${normalizedPath}`;
}
process.env.DATABASE_URL = normalizeDatabaseUrl(process.env.DATABASE_URL);

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const XRAY_CFG = '/opt/xray-reality/config.json';
const server = '89.22.225.190';
const port = 443;
const publicKey = '1-3dvfcxYoGAJsR8VZ84nInzC1Pk_25HYrGx00jckFU';
const shortId = '7c9435f33c10eccf';
const sni = 'www.cloudflare.com';
const flow = 'xtls-rprx-vision';

const nameMap = {
  'roma@reality': 'Роман Нещадин',
  'nina@reality': 'Нина Зайцева',
  'anna@reality': 'Анна Шкинева',
  'ruslan@reality': 'Руслан Шкинёв',
  'natalya@reality': 'Наталья Пархоменко',
  'vladislav@reality': 'Владислав Михайленко',
  'yana@reality': 'Яна Климова',
  'elizaveta@reality': 'Елизавета Бородулина',
  'anna.ivakhnenko@reality': 'Анна Ивахненко',
  'anna.samodurova@reality': 'Анна Самодурова',
  'stepan@reality': 'Степан Павлюченко',
  'yana.zlobina@reality': 'Яна Злобина',
  'lyudmila.zlobina@reality': 'Людмила Злобина',
};

function vlessUrl(uuid, displayName) {
  return `vless://${uuid}@${server}:${port}?type=tcp&security=reality&pbk=${publicKey}&fp=chrome&sni=${sni}&sid=${shortId}&flow=${flow}#${encodeURIComponent(displayName)}`;
}

async function main() {
  const adminTelegramId = String(process.env.ADMIN_TELEGRAM_ID || '211268074');
  const adminUsername = process.env.ADMIN_USERNAME || 'neshchadin';
  await prisma.user.upsert({
    where: { telegramId: adminTelegramId },
    update: { username: adminUsername, fullName: 'Роман Нещадин', isAdmin: true },
    create: {
      telegramId: adminTelegramId,
      username: adminUsername,
      firstName: 'Роман',
      lastName: 'Нещадин',
      fullName: 'Роман Нещадин',
      isAdmin: true,
    },
  });

  const cfg = JSON.parse(fs.readFileSync(XRAY_CFG, 'utf8'));
  const clients = cfg.inbounds[0].settings.clients;
  const expiresAt = new Date('2026-04-25T05:26:00Z');
  let imported = 0;

  for (const client of clients) {
    const email = client.email || `client-${client.id}@reality`;
    if (email === 'roma@reality') continue; // Рома уже отдельно как админ
    const displayName = nameMap[email] || email.replace('@reality', '');
    const fakeTelegramId = `imported:${email}`;

    await prisma.user.upsert({
      where: { telegramId: fakeTelegramId },
      update: {
        username: null,
        firstName: null,
        lastName: null,
        fullName: displayName,
        isAdmin: false,
        vpnClient: {
          upsert: {
            update: {
              displayName,
              emailLabel: email,
              uuid: client.id,
              vlessUrl: vlessUrl(client.id, displayName),
              server,
              port,
              publicKey,
              shortId,
              sni,
              flow,
              status: 'ACTIVE',
              expiresAt,
            },
            create: {
              displayName,
              emailLabel: email,
              uuid: client.id,
              vlessUrl: vlessUrl(client.id, displayName),
              server,
              port,
              publicKey,
              shortId,
              sni,
              flow,
              status: 'ACTIVE',
              expiresAt,
            },
          },
        },
      },
      create: {
        telegramId: fakeTelegramId,
        fullName: displayName,
        isAdmin: false,
        vpnClient: {
          create: {
            displayName,
            emailLabel: email,
            uuid: client.id,
            vlessUrl: vlessUrl(client.id, displayName),
            server,
            port,
            publicKey,
            shortId,
            sni,
            flow,
            status: 'ACTIVE',
            expiresAt,
          },
        },
      },
    });
    imported++;
  }

  const users = await prisma.user.findMany({ include: { vpnClient: true }, orderBy: { id: 'asc' } });
  console.log(JSON.stringify({ ok: true, imported, totalUsers: users.length, users: users.map(u => ({ telegramId: u.telegramId, fullName: u.fullName, isAdmin: u.isAdmin, client: u.vpnClient?.emailLabel || null })) }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => prisma.$disconnect());
