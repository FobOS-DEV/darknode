import { prisma } from "../db/prisma";
import { auditService } from "./auditService";
import { xrayGrpcService } from "./xrayGrpcService";
import { xraySyncService } from "./xraySyncService";

export type InboundStatus = "ACTIVE" | "STANDBY" | "DEPRECATED" | "DISABLED";

export const INBOUND_STATUSES: InboundStatus[] = ["ACTIVE", "STANDBY", "DEPRECATED", "DISABLED"];

export type InboundCreateInput = {
  label: string;
  inboundTag: string;
  host: string;
  port: number;
  sni: string;
  publicKey: string;
  shortId: string;
  flow: string;
  fingerprint?: string;
  network?: string;
  security?: string;
  xrayApiAddress?: string | null;
  priority?: number;
};

export const inboundAdminService = {
  async list() {
    return prisma.inbound.findMany({
      orderBy: [{ status: "asc" }, { priority: "asc" }, { id: "asc" }],
    });
  },

  async getById(id: number) {
    return prisma.inbound.findUnique({ where: { id } });
  },

  async create(actorUserId: number, input: InboundCreateInput) {
    const inbound = await prisma.inbound.create({
      data: {
        label: input.label,
        inboundTag: input.inboundTag,
        host: input.host,
        port: input.port,
        sni: input.sni,
        publicKey: input.publicKey,
        shortId: input.shortId,
        flow: input.flow,
        fingerprint: input.fingerprint ?? "chrome",
        network: input.network ?? "tcp",
        security: input.security ?? "reality",
        xrayApiAddress: input.xrayApiAddress ?? null,
        priority: input.priority ?? 0,
        status: "STANDBY",
      },
    });

    await auditService.log("admin.inbound_create", actorUserId, undefined, {
      inboundId: inbound.id,
      inboundTag: inbound.inboundTag,
      host: inbound.host,
      port: inbound.port,
      status: inbound.status,
    });

    return inbound;
  },

  async setStatus(actorUserId: number, id: number, status: InboundStatus) {
    const current = await prisma.inbound.findUnique({ where: { id } });

    if (!current) {
      return null;
    }

    const data: { status: InboundStatus; deprecatedAt?: Date | null } = { status };

    if (status === "DEPRECATED" && !current.deprecatedAt) {
      data.deprecatedAt = new Date();
    }

    if (status === "ACTIVE" || status === "STANDBY") {
      data.deprecatedAt = null;
    }

    const updated = await prisma.inbound.update({
      where: { id },
      data,
    });

    await auditService.log("admin.inbound_status", actorUserId, undefined, {
      inboundId: id,
      inboundTag: current.inboundTag,
      previousStatus: current.status,
      newStatus: status,
    });

    if (xrayGrpcService.isEnabled()) {
      if (status === "DISABLED" || status === "DEPRECATED") {
        try {
          const remoteUsers = await xrayGrpcService.listInboundUsers({
            inboundTag: current.inboundTag,
            xrayApiAddress: current.xrayApiAddress,
          });

          for (const remote of remoteUsers) {
            if (remote.email) {
              await xrayGrpcService.removeUser(
                { inboundTag: current.inboundTag, xrayApiAddress: current.xrayApiAddress },
                remote.email,
              );
            }
          }
        } catch {
          // gRPC errors on the leaving inbound are non-fatal — top-level sync
          // re-runs below and surfaces them in its own per-inbound report.
        }
      }
    }

    await xraySyncService.syncAuthorizedClients();

    return updated;
  },
};
