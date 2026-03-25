import { prisma } from "../db/prisma";

export type TelegramIdentity = {
  telegramId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  fullName: string;
};

export const userService = {
  async findByTelegramId(telegramId: string) {
    return prisma.user.findUnique({
      where: { telegramId },
    });
  },

  async upsertUser(identity: TelegramIdentity, isAdmin = false) {
    return prisma.user.upsert({
      where: { telegramId: identity.telegramId },
      update: {
        username: identity.username,
        firstName: identity.firstName,
        lastName: identity.lastName,
        fullName: identity.fullName,
        isAdmin,
      },
      create: {
        telegramId: identity.telegramId,
        username: identity.username,
        firstName: identity.firstName,
        lastName: identity.lastName,
        fullName: identity.fullName,
        isAdmin,
      },
    });
  },

  async listUsers() {
    return prisma.user.findMany({
      orderBy: { createdAt: "desc" },
    });
  },
};

