import QRCode from "qrcode";

export const qrCodeService = {
  async generateConfigPng(value: string): Promise<Buffer> {
    return QRCode.toBuffer(value, {
      type: "png",
      errorCorrectionLevel: "M",
      margin: 2,
      width: 520,
    });
  },
};
