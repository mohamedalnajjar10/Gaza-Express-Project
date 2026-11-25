import sharp from 'sharp';
import { ReceiptVerificationService } from './receipt-verification.service';

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makePngWithText(png: Buffer, keyword: string, value: string): Buffer {
  const payload = Buffer.concat([Buffer.from(keyword, 'latin1'), Buffer.from([0]), Buffer.from(value, 'latin1')]);
  const typeAndData = Buffer.concat([Buffer.from('tEXt', 'ascii'), payload]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(payload.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  const chunk = Buffer.concat([len, typeAndData, crc]);
  return Buffer.concat([png.subarray(0, png.length - 12), chunk, png.subarray(png.length - 12)]);
}

describe('ReceiptVerificationService', () => {
  const service = new ReceiptVerificationService();

  it('computes hashes and detects editing software metadata in PNG chunks', async () => {
    const clean = await sharp({
      create: { width: 400, height: 700, channels: 3, background: { r: 245, g: 245, b: 245 } },
    })
      .composite([{
        input: await sharp({ create: { width: 200, height: 100, channels: 3, background: { r: 15, g: 90, b: 60 } } }).png().toBuffer(),
        top: 60,
        left: 100,
      }])
      .png()
      .toBuffer();

    const cleanAnalyzed = await service.analyze(clean);
    expect(cleanAnalyzed.detectedSoftware).toEqual([]);
    expect(cleanAnalyzed.rawSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(cleanAnalyzed.perceptualHash).toMatch(/^[a-f0-9]{16}$/);

    const edited = makePngWithText(clean, 'Software', 'Adobe Photoshop 2025');
    const editedAnalyzed = await service.analyze(edited);
    expect(editedAnalyzed.detectedSoftware).toContain('Adobe Photoshop');

    const tx = {
      bankReceipt: {
        findMany: jest.fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ orderId: 12, perceptualHash: cleanAnalyzed.perceptualHash, decision: 'suspend' }])
          .mockResolvedValueOnce([]),
      },
      payment: {
        findMany: jest.fn().mockResolvedValueOnce([]),
      },
    } as any;

    const assessment = await service.assess(tx, 99, editedAnalyzed, { transferReference: 'BOP-123' });
    expect(assessment.verificationStatus).toBe('FLAGGED_SUSPICIOUS');
    expect(assessment.riskLevel).toBe('HIGH');
    expect(assessment.forensicReport.matchesConfirmedFraud).toBe(true);
    expect(assessment.forensicReport.duplicateOrderIds).toContain(12);
    expect(assessment.forensicReport.detectedSoftware).toContain('Adobe Photoshop');
  });
});
