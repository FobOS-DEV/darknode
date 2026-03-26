import path from "node:path";
import os from "node:os";

import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as protobuf from "protobufjs";

import { env } from "../config/env";
import { logger } from "../config/logger";

type RemoteUser = {
  email: string;
  account?: {
    type?: string;
    value?: Uint8Array;
    id?: string;
    flow?: string;
  };
};

type AuthorizedClient = {
  uuid: string;
  emailLabel: string;
  flow: string;
};

type HandlerServiceClient = grpc.Client & {
  AlterInbound(
    request: Record<string, unknown>,
    callback: (error: grpc.ServiceError | null, response: unknown) => void,
  ): void;
  GetInboundUsers(
    request: Record<string, unknown>,
    callback: (error: grpc.ServiceError | null, response: { users?: RemoteUser[] }) => void,
  ): void;
  GetInboundUsersCount(
    request: Record<string, unknown>,
    callback: (error: grpc.ServiceError | null, response: { count?: number }) => void,
  ): void;
};

const protoPath = path.resolve(process.cwd(), "proto/xray-handler.proto");

const packageDefinition = protoLoader.loadSync(protoPath, {
  keepCase: false,
  longs: Number,
  enums: String,
  defaults: true,
  oneofs: true,
});

const grpcPackage = grpc.loadPackageDefinition(packageDefinition) as unknown as {
  xray: {
    app: {
      proxyman: {
        command: {
          HandlerService: new (
            address: string,
            credentials: grpc.ChannelCredentials,
          ) => HandlerServiceClient;
        };
      };
    };
  };
};

const root = protobuf.loadSync(protoPath);
const accountType = root.lookupType("xray.app.proxyman.command.Account");
const addUserOperationType = root.lookupType("xray.app.proxyman.command.AddUserOperation");
const removeUserOperationType = root.lookupType("xray.app.proxyman.command.RemoveUserOperation");

function unaryCall<T>(invoke: (callback: (error: grpc.ServiceError | null, response: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    invoke((error, response) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(response);
    });
  });
}

function createClient() {
  const resolvedAddress = resolveXrayApiAddress();

  return new grpcPackage.xray.app.proxyman.command.HandlerService(
    resolvedAddress,
    grpc.credentials.createInsecure(),
  );
}

function resolveXrayApiAddress() {
  if (env.xrayApiAddress) {
    return env.xrayApiAddress;
  }

  const interfaces = os.networkInterfaces();

  for (const networkInterface of Object.values(interfaces)) {
    for (const address of networkInterface ?? []) {
      if (address.family !== "IPv4" || address.internal) {
        continue;
      }

      const match = address.address.match(/^172\.(\d+)\.\d+\.\d+$/);

      if (!match) {
        continue;
      }

      return `172.${match[1]}.0.1:10085`;
    }
  }

  return "host.docker.internal:10085";
}

function encodeAccount(client: AuthorizedClient) {
  return accountType.encode({
    id: client.uuid,
    flow: client.flow,
    encryption: "none",
  }).finish();
}

function encodeAddUserOperation(client: AuthorizedClient) {
  return addUserOperationType
    .encode({
      user: {
        email: client.emailLabel,
        account: {
          type: "xray.proxy.vless.Account",
          value: encodeAccount(client),
        },
      },
    })
    .finish();
}

function encodeRemoveUserOperation(email: string) {
  return removeUserOperationType.encode({ email }).finish();
}

function normalizeRemoteUsers(users: RemoteUser[] | undefined): RemoteUser[] {
  return (users ?? [])
    .filter((user) => user.email)
    .map((user) => {
      const encodedAccount = user.account?.value;

      if (!encodedAccount) {
        return user;
      }

      const decodedAccount = accountType.decode(encodedAccount) as unknown as {
        id?: string;
        flow?: string;
      };

      return {
        ...user,
        account: {
          ...user.account,
          id: decodedAccount.id,
          flow: decodedAccount.flow,
        },
      };
    });
}

export const xrayGrpcService = {
  isEnabled() {
    return env.xrayHotSyncEnabled;
  },

  async listInboundUsers() {
    const client = createClient();

    try {
      const response = await unaryCall<{ users?: RemoteUser[] }>((callback) =>
        client.GetInboundUsers(
          {
            tag: env.xrayInboundTag,
            email: "",
          },
          callback,
        ),
      );

      return normalizeRemoteUsers(response.users);
    } finally {
      client.close();
    }
  },

  async getInboundUserCount() {
    const client = createClient();

    try {
      const response = await unaryCall<{ count?: number }>((callback) =>
        client.GetInboundUsersCount(
          {
            tag: env.xrayInboundTag,
            email: "",
          },
          callback,
        ),
      );

      return response.count ?? 0;
    } finally {
      client.close();
    }
  },

  async addUser(clientInput: AuthorizedClient) {
    const client = createClient();

    try {
      await unaryCall((callback) =>
        client.AlterInbound(
          {
            tag: env.xrayInboundTag,
            operation: {
              type: "xray.app.proxyman.command.AddUserOperation",
              value: encodeAddUserOperation(clientInput),
            },
          },
          callback,
        ),
      );
    } finally {
      client.close();
    }
  },

  async removeUser(email: string) {
    const client = createClient();

    try {
      await unaryCall((callback) =>
        client.AlterInbound(
          {
            tag: env.xrayInboundTag,
            operation: {
              type: "xray.app.proxyman.command.RemoveUserOperation",
              value: encodeRemoveUserOperation(email),
            },
          },
          callback,
        ),
      );
    } finally {
      client.close();
    }
  },

  async syncAuthorizedClients(clients: AuthorizedClient[]) {
    const remoteUsers = await this.listInboundUsers();
    const remoteByEmail = new Map(remoteUsers.map((user) => [user.email, user]));
    const desiredByEmail = new Map(clients.map((client) => [client.emailLabel, client]));
    const removals = new Set<string>();
    const additions: AuthorizedClient[] = [];

    for (const remoteUser of remoteUsers) {
      if (!desiredByEmail.has(remoteUser.email)) {
        removals.add(remoteUser.email);
      }
    }

    for (const client of clients) {
      const remoteUser = remoteByEmail.get(client.emailLabel);

      if (!remoteUser?.account?.id) {
        additions.push(client);
        continue;
      }

      if (remoteUser.account.id !== client.uuid || (remoteUser.account.flow ?? "") !== client.flow) {
        removals.add(client.emailLabel);
        additions.push(client);
      }
    }

    for (const email of removals) {
      await this.removeUser(email);
    }

    for (const client of additions) {
      await this.addUser(client);
    }

    logger.info(
      {
        remoteCount: remoteUsers.length,
        desiredCount: clients.length,
        removed: removals.size,
        added: additions.length,
      },
      "Hot-synchronized Xray clients over gRPC",
    );

    return {
      remoteCount: remoteUsers.length,
      desiredCount: clients.length,
      removed: removals.size,
      added: additions.length,
    };
  },
};
