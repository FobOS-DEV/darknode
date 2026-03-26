import { prisma } from "../db/prisma";
import type { TelegramIdentity } from "./userService";
import { userService } from "./userService";

const REQUEST_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;

export const requestService = {
  async submitAccessRequest(identity: TelegramIdentity) {
    const user = await userService.upsertUser(identity);

    const existingPending = await prisma.accessRequest.findFirst({
      where: {
        userId: user.id,
        status: REQUEST_STATUS.PENDING,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (existingPending) {
      return { request: existingPending, created: false as const, user };
    }

    const request = await prisma.accessRequest.create({
      data: {
        userId: user.id,
      },
    });

    return { request, created: true as const, user };
  },

  async listPendingRequests() {
    return prisma.accessRequest.findMany({
      where: {
        status: REQUEST_STATUS.PENDING,
      },
      include: {
        user: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });
  },

  async getRequestById(requestId: number) {
    return prisma.accessRequest.findUnique({
      where: { id: requestId },
      include: {
        user: {
          include: {
            vpnClient: true,
          },
        },
      },
    });
  },

  async approveRequest(requestId: number) {
    return prisma.accessRequest.update({
      where: { id: requestId },
      data: {
        status: REQUEST_STATUS.APPROVED,
        resolvedAt: new Date(),
      },
      include: {
        user: true,
      },
    });
  },

  async rejectRequest(requestId: number) {
    return prisma.accessRequest.update({
      where: { id: requestId },
      data: {
        status: REQUEST_STATUS.REJECTED,
        resolvedAt: new Date(),
      },
      include: {
        user: true,
      },
    });
  },
};
