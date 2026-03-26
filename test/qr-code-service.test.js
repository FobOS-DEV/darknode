const test = require("node:test");
const assert = require("node:assert/strict");

test("qrCodeService generates PNG buffer for config", async () => {
  const { qrCodeService } = require("../dist/services/qrCodeService.js");

  const png = await qrCodeService.generateConfigPng(
    "vless://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa@test.local:443#Test_User",
  );

  assert.ok(Buffer.isBuffer(png));
  assert.ok(png.length > 100);
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
});
