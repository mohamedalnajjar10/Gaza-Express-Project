import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import sharp from 'sharp';

export type ForensicCheckStatus = 'pass' | 'warn' | 'fail';

export type ReceiptForensicCheck = {
  code: string;
  labelAr: string;
  status: ForensicCheckStatus;
  detailAr: string;
};

export type ReceiptForensicReport = {
  checkedAt: string;
  riskScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  verdict: 'LIKELY_AUTHENTIC' | 'NEEDS_ATTENTION' | 'SUSPICIOUS';
  summaryAr: string;
  duplicateOrderIds: number[];
  matchesConfirmedFraud: boolean;
  detectedSoftware: string[];
  checks: ReceiptForensicCheck[];
};

export type AnalyzedReceiptImage = {
  webpBuffer: Buffer;
  rawSha256: string;
  perceptualHash: string;
  width: number;
  height: number;
  originalFormat: string;
  detectedSoftware: string[];
  entropy: number;
  maxStdev: number;
};

const EDITING_SIGNATURES: Array<[string, string]> = [
  ['adobe photoshop', 'Adobe Photoshop'],
  ['photoshop', 'Adobe Photoshop'],
  ['photopea', 'Photopea'],
  ['canva', 'Canva'],
  ['gimp', 'GIMP'],
  ['picsart', 'PicsArt'],
  ['lightroom', 'Adobe Lightroom'],
  ['adobe illustrator', 'Adobe Illustrator'],
  ['illustrator', 'Adobe Illustrator'],
  ['figma', 'Figma'],
  ['affinity photo', 'Affinity Photo'],
  ['coreldraw', 'CorelDRAW'],
  ['pixelmator', 'Pixelmator'],
  ['paint.net', 'Paint.NET'],
  ['snapseed', 'Snapseed'],
  ['remini', 'Remini'],
  ['inkscape', 'Inkscape'],
  ['fotor', 'Fotor'],
  ['meitu', 'Meitu'],
  ['pixlr', 'Pixlr'],
];

@Injectable()
export class ReceiptVerificationService {
  async analyze(bytes: Buffer): Promise<AnalyzedReceiptImage> {
    try {
      const probe = sharp(bytes, { limitInputPixels: 16_000_000, failOn: 'error' });
      const meta = await probe.metadata();
      if (!meta.format || !['png', 'jpeg', 'webp'].includes(meta.format) || (meta.pages ?? 1) > 1) {
        throw new Error('Unsupported format');
      }
      const { data: decodedPixels, info } = await sharp(bytes, { limitInputPixels: 16_000_000, failOn: 'error' })
        .rotate()
        .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
        .raw()
        .toBuffer({ resolveWithObject: true });

      const rawSha256 = createHash('sha256').update(bytes).digest('hex');
      const [webpBuffer, perceptualHash, stats] = await Promise.all([
        sharp(decodedPixels, { raw: info }).webp({ quality: 92 }).toBuffer(),
        this.computeDHashFromRaw(decodedPixels, info),
        sharp(decodedPixels, { raw: info }).stats(),
      ]);

      const detectedSoftware = this.detectEditingSoftware(bytes, meta);
      const maxStdev = stats.channels.reduce((max, ch) => Math.max(max, ch.stdev), 0);
      return {
        webpBuffer,
        rawSha256,
        perceptualHash,
        width: meta.width ?? info.width,
        height: meta.height ?? info.height,
        originalFormat: meta.format,
        detectedSoftware,
        entropy: stats.entropy ?? 0,
        maxStdev,
      };
    } catch {
      throw new BadRequestException('ارفع صورة إيصال واضحة بصيغة PNG أو JPG أو WebP');
    }
  }

  async findSimilarReceipts(
    db: { bankReceipt: Pick<Prisma.TransactionClient['bankReceipt'], 'findMany'> },
    orderId: number,
    perceptualHash: string,
  ): Promise<Array<{ orderId: number; decision: string | null }>> {
    const recentHashes = await db.bankReceipt.findMany({
      where: { orderId: { not: orderId }, perceptualHash: { not: null } },
      select: { orderId: true, perceptualHash: true, decision: true },
      orderBy: { submittedAt: 'desc' },
      take: 2000,
    });
    return recentHashes
      .filter(row => row.perceptualHash && hammingDistanceHex(row.perceptualHash, perceptualHash) <= 4)
      .map(row => ({ orderId: row.orderId, decision: row.decision }));
  }

  async assess(
    tx: Prisma.TransactionClient,
    orderId: number,
    analyzed: AnalyzedReceiptImage,
    claim?: { transferReference?: string; similarMatches?: Array<{ orderId: number; decision: string | null }> },
  ): Promise<{
    verificationStatus: 'AUTO_CHECKED' | 'FLAGGED_SUSPICIOUS';
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    riskScore: number;
    forensicReport: ReceiptForensicReport;
  }> {
    const [exactMatches, similarMatches, refMatches, paymentRefMatches] = await Promise.all([
      tx.bankReceipt.findMany({
        where: { rawSha256: analyzed.rawSha256, orderId: { not: orderId } },
        select: { orderId: true, decision: true },
        take: 20,
      }),
      claim?.similarMatches !== undefined
        ? Promise.resolve(claim.similarMatches)
        : this.findSimilarReceipts(tx, orderId, analyzed.perceptualHash),
      claim?.transferReference
        ? tx.bankReceipt.findMany({
            where: { transferReference: claim.transferReference, orderId: { not: orderId } },
            select: { orderId: true, decision: true },
            take: 10,
          })
        : Promise.resolve([] as Array<{ orderId: number; decision: string | null }>),
      claim?.transferReference
        ? tx.payment.findMany({
            where: { bankReference: `BANK_TRANSFER:${claim.transferReference}`, orderId: { not: orderId } },
            select: { orderId: true },
            take: 10,
          })
        : Promise.resolve([] as Array<{ orderId: number }>),
    ]);
    const duplicateIds = Array.from(
      new Set([...exactMatches.map(m => m.orderId), ...similarMatches.map(m => m.orderId)]),
    );
    const refDuplicateIds = Array.from(
      new Set([...refMatches.map(m => m.orderId), ...paymentRefMatches.map(m => m.orderId)]),
    );
    const matchesConfirmedFraud =
      exactMatches.some(m => m.decision === 'suspend') ||
      similarMatches.some(m => m.decision === 'suspend') ||
      refMatches.some(m => m.decision === 'suspend');

    const checks: ReceiptForensicCheck[] = [];
    let score = 0;

    checks.push({
      code: 'IMAGE_FORMAT',
      labelAr: 'سلامة بنية الصورة',
      status: 'pass',
      detailAr: `صورة ${analyzed.originalFormat.toUpperCase()} سليمة (${analyzed.width}×${analyzed.height} بكسل).`,
    });

    if (duplicateIds.length > 0) {
      score += 65;
      checks.push({
        code: 'DUPLICATE_IMAGE',
        labelAr: 'فحص تكرار صورة الإيصال',
        status: 'fail',
        detailAr: `تحذير: هذه الصورة مطابقة أو مشابهة جداً لإيصال مُرسل في طلب آخر (#${duplicateIds.slice(0, 3).join('، #')}).`,
      });
    } else {
      checks.push({
        code: 'DUPLICATE_IMAGE',
        labelAr: 'فحص تكرار صورة الإيصال',
        status: 'pass',
        detailAr: 'لم يُستخدم هذا الإيصال في أي طلب سابق على المنصة.',
      });
    }

    if (matchesConfirmedFraud) {
      score += 35;
      checks.push({
        code: 'FRAUD_HISTORY_MATCH',
        labelAr: 'المطابقة مع سجل الاحتيال',
        status: 'fail',
        detailAr: 'خطر مرتفع: الصورة أو المرجع مرتبط ببلاغ احتيال مؤكد وتم تعطيل صاحبه سابقاً.',
      });
    }

    if (analyzed.detectedSoftware.length > 0) {
      score += 55;
      checks.push({
        code: 'METADATA_TAMPER',
        labelAr: 'فحص آثار برامج التعديل',
        status: 'fail',
        detailAr: `تم رصد توقيع برنامج تعديل صور داخل بيانات الملف (${analyzed.detectedSoftware.join('، ')}).`,
      });
    } else {
      checks.push({
        code: 'METADATA_TAMPER',
        labelAr: 'فحص آثار برامج التعديل',
        status: 'pass',
        detailAr: 'لا توجد بصمات لبرامج تعديل الصور (Photoshop / Canva / GIMP) في بيانات الملف.',
      });
    }

    if (claim?.transferReference) {
      if (refDuplicateIds.length > 0) {
        score += 60;
        checks.push({
          code: 'DUPLICATE_REFERENCE',
          labelAr: 'فحص رقم مرجع التحويل',
          status: 'fail',
          detailAr: `رقم المرجع (${claim.transferReference}) مسجّل مسبقاً في طلب آخر (#${refDuplicateIds.slice(0, 3).join('، #')}).`,
        });
      } else {
        checks.push({
          code: 'DUPLICATE_REFERENCE',
          labelAr: 'فحص رقم مرجع التحويل',
          status: 'pass',
          detailAr: `رقم المرجع (${claim.transferReference}) فريد ولم يُستخدم في طلبات أخرى.`,
        });
      }
    }

    if (analyzed.width < 240 || analyzed.height < 240) {
      score += 20;
      checks.push({
        code: 'RESOLUTION',
        labelAr: 'وضوح ودقة الإيصال',
        status: 'warn',
        detailAr: 'دقة الصورة منخفضة جداً أو مقصوصة؛ يُنصح بالتدقيق اليدوي في بيانات التحويل.',
      });
    }

    if (analyzed.entropy < 1.5 || analyzed.maxStdev < 8) {
      score += 25;
      checks.push({
        code: 'VISUAL_ENTROPY',
        labelAr: 'تحليل التباين والمحتوى البصري',
        status: 'warn',
        detailAr: 'الصورة ذات تباين منخفض جداً ولا تحتوي على تفاصيل نصية واضحة كافية.',
      });
    } else {
      checks.push({
        code: 'VISUAL_ENTROPY',
        labelAr: 'تحليل التباين والمحتوى البصري',
        status: 'pass',
        detailAr: 'توزيع التفاصيل والتباين طبيعي للقطة شاشة أو صورة إيصال.',
      });
    }

    const riskScore = Math.min(100, score);
    const riskLevel = riskScore >= 50 ? 'HIGH' : riskScore >= 20 ? 'MEDIUM' : 'LOW';
    const verdict = riskLevel === 'HIGH' ? 'SUSPICIOUS' : riskLevel === 'MEDIUM' ? 'NEEDS_ATTENTION' : 'LIKELY_AUTHENTIC';
    const verificationStatus = riskLevel === 'HIGH' ? 'FLAGGED_SUSPICIOUS' : 'AUTO_CHECKED';
    const summaryAr =
      riskLevel === 'HIGH'
        ? 'رصد الفحص التلقائي مؤشرات اشتباه أو تزوير مرتفعة! تأكد من كشف حساب بنك فلسطين وأبلغ الأدمن إذا لم يصل التحويل.'
        : riskLevel === 'MEDIUM'
          ? 'توجد ملاحظات شكلية على جودة الإيصال. طابق المبلغ والمرجع مع كشف حساب بنك فلسطين قبل التأكيد.'
          : 'اجتاز الإيصال الفحص التقني المبدئي بنجاح. يلزم مطابقة كشف حساب بنك فلسطين لإتمام الدفع 100%.';

    return {
      verificationStatus,
      riskLevel,
      riskScore,
      forensicReport: {
        checkedAt: new Date().toISOString(),
        riskScore,
        riskLevel,
        verdict,
        summaryAr,
        duplicateOrderIds: Array.from(new Set([...duplicateIds, ...refDuplicateIds])),
        matchesConfirmedFraud,
        detectedSoftware: analyzed.detectedSoftware,
        checks,
      },
    };
  }

  private async computeDHashFromRaw(rawPixels: Buffer, info: sharp.OutputInfo): Promise<string> {
    const tiny = await sharp(rawPixels, { raw: info })
      .grayscale()
      .resize(9, 8, { fit: 'fill' })
      .raw()
      .toBuffer();
    let bits = 0n;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const idx = row * 9 + col;
        bits = (bits << 1n) | (tiny[idx] > tiny[idx + 1] ? 1n : 0n);
      }
    }
    return bits.toString(16).padStart(16, '0');
  }

  private detectEditingSoftware(bytes: Buffer, meta: sharp.Metadata): string[] {
    const chunks: string[] = [];
    if (meta.exif) chunks.push(meta.exif.subarray(0, 65536).toString('latin1'));
    if (meta.xmp) chunks.push(meta.xmp.subarray(0, 65536).toString('utf8'));
    if (meta.iptc) chunks.push(meta.iptc.subarray(0, 65536).toString('latin1'));
    if (meta.comments?.length) {
      for (const c of meta.comments) chunks.push(c.text ?? '');
    }
    if (meta.format === 'png') {
      chunks.push(...extractPngTextChunks(bytes));
    } else {
      chunks.push(bytes.subarray(0, 65536).toString('latin1'));
    }
    const haystack = chunks.join(' ').toLowerCase();
    const detected = new Set<string>();
    for (const [needle, label] of EDITING_SIGNATURES) {
      if (haystack.includes(needle)) detected.add(label);
    }
    return Array.from(detected);
  }
}

function extractPngTextChunks(bytes: Buffer): string[] {
  const results: string[] = [];
  if (bytes.length < 16) return results;
  let offset = 8;
  while (offset + 8 <= bytes.length && results.length < 32) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    const dataStart = offset + 8;
    const next = dataStart + length + 4;
    if (next > bytes.length) break;
    if (type === 'tEXt' || type === 'iTXt') {
      results.push(bytes.subarray(dataStart, Math.min(dataStart + length, dataStart + 4096)).toString('utf8'));
    }
    if (type === 'IEND') break;
    offset = next;
  }
  return results;
}

function hammingDistanceHex(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let xor = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  while (xor > 0n) {
    count += Number(xor & 1n);
    xor >>= 1n;
  }
  return count;
}
