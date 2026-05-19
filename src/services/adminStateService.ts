import { prisma } from "../db/prisma";
import { logger } from "../config/logger";

type SerializableDate = string;

type SerializableAddUserDraft = {
  telegramId?: string;
  fullName?: string;
  displayName?: string;
  emailLabel?: string;
  uuid?: string;
  vlessUrl?: string;
  server?: string;
  port?: number;
  publicKey?: string;
  shortId?: string;
  sni?: string;
  flow?: string;
  expiresAt?: SerializableDate | null;
};

export type AddUserStep =
  | "telegramId"
  | "fullName"
  | "displayName"
  | "emailLabel"
  | "uuid"
  | "vlessUrl"
  | "server"
  | "port"
  | "publicKey"
  | "shortId"
  | "sni"
  | "flow"
  | "expiresAt";

export type GenerateUserStep = "fullName" | "telegramId" | "expiresAt";

type SerializableGenerateUserDraft = {
  fullName?: string;
  telegramId?: string;
  expiresAt?: SerializableDate | null;
};

type Persisted =
  | { kind: "adduser"; step: AddUserStep; draft: SerializableAddUserDraft }
  | { kind: "setexpiry"; step: "telegramId" | "expiresAt"; draft: { telegramId?: string } }
  | { kind: "disable" | "enable" }
  | { kind: "userinfo" }
  | {
      kind: "bindclient";
      step: "telegramId" | "lookup";
      draft: { telegramId?: string };
    }
  | {
      kind: "generateuser";
      step: GenerateUserStep;
      draft: SerializableGenerateUserDraft;
    };

function reviveDraft<T extends { expiresAt?: SerializableDate | null }>(
  draft: T,
): Omit<T, "expiresAt"> & { expiresAt?: Date | null } {
  if (draft.expiresAt === undefined) {
    return draft as Omit<T, "expiresAt"> & { expiresAt?: Date | null };
  }

  const { expiresAt, ...rest } = draft;
  return {
    ...(rest as Omit<T, "expiresAt">),
    expiresAt: expiresAt === null ? null : new Date(expiresAt),
  };
}

function serializeDraft<T extends { expiresAt?: Date | null }>(
  draft: T,
): Omit<T, "expiresAt"> & { expiresAt?: SerializableDate | null } {
  if (draft.expiresAt === undefined) {
    return draft as Omit<T, "expiresAt"> & { expiresAt?: SerializableDate | null };
  }

  const { expiresAt, ...rest } = draft;
  return {
    ...(rest as Omit<T, "expiresAt">),
    expiresAt: expiresAt === null ? null : expiresAt.toISOString(),
  };
}

export type LiveAdminState =
  | {
      kind: "adduser";
      step: AddUserStep;
      draft: {
        telegramId?: string;
        fullName?: string;
        displayName?: string;
        emailLabel?: string;
        uuid?: string;
        vlessUrl?: string;
        server?: string;
        port?: number;
        publicKey?: string;
        shortId?: string;
        sni?: string;
        flow?: string;
        expiresAt?: Date | null;
      };
    }
  | { kind: "setexpiry"; step: "telegramId" | "expiresAt"; draft: { telegramId?: string } }
  | { kind: "disable" | "enable" }
  | { kind: "userinfo" }
  | {
      kind: "bindclient";
      step: "telegramId" | "lookup";
      draft: { telegramId?: string };
    }
  | {
      kind: "generateuser";
      step: GenerateUserStep;
      draft: {
        fullName?: string;
        telegramId?: string;
        expiresAt?: Date | null;
      };
    };

function persistedToLive(persisted: Persisted): LiveAdminState {
  if (persisted.kind === "adduser") {
    return { ...persisted, draft: reviveDraft(persisted.draft) };
  }

  if (persisted.kind === "generateuser") {
    return { ...persisted, draft: reviveDraft(persisted.draft) };
  }

  return persisted;
}

function liveToPersisted(state: LiveAdminState): Persisted {
  if (state.kind === "adduser") {
    return { ...state, draft: serializeDraft(state.draft) };
  }

  if (state.kind === "generateuser") {
    return { ...state, draft: serializeDraft(state.draft) };
  }

  return state;
}

export const adminStateService = {
  async get(telegramId: string): Promise<LiveAdminState | null> {
    const row = await prisma.adminState.findUnique({ where: { telegramId } });

    if (!row) {
      return null;
    }

    try {
      const parsed = JSON.parse(row.payload) as Persisted;
      return persistedToLive(parsed);
    } catch (error) {
      logger.warn(
        { error, telegramId },
        "Discarding corrupted admin state payload",
      );
      await prisma.adminState.delete({ where: { telegramId } }).catch(() => undefined);
      return null;
    }
  },

  async set(telegramId: string, state: LiveAdminState): Promise<void> {
    const payload = JSON.stringify(liveToPersisted(state));

    await prisma.adminState.upsert({
      where: { telegramId },
      update: { payload },
      create: { telegramId, payload },
    });
  },

  async delete(telegramId: string): Promise<void> {
    await prisma.adminState
      .delete({ where: { telegramId } })
      .catch(() => undefined);
  },

  async has(telegramId: string): Promise<boolean> {
    const row = await prisma.adminState.findUnique({
      where: { telegramId },
      select: { id: true },
    });
    return Boolean(row);
  },
};
