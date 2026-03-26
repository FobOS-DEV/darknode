import { prisma } from "./db/prisma";
import { logger } from "./config/logger";
import { trafficSnapshotService } from "./services/trafficSnapshotService";

async function main() {
  const result = await trafficSnapshotService.collectSnapshots();
  logger.info(result, "Traffic snapshot run completed");
}

main()
  .catch(async (error) => {
    logger.error({ error }, "Traffic snapshot run failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
