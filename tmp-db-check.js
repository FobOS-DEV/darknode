const { prisma } = require('./dist/db/prisma.js');

prisma.user.findMany({ include: { vpnClient: true } })
  .then(async (rows) => {
    console.log(JSON.stringify(rows, null, 2));
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
