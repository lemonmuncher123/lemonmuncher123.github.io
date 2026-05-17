// One-page counselor handout generator.
// Run with: node scripts/generate-pdfs.mjs
// Outputs: public/counselor-en.pdf and public/counselor-es.pdf

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync, createWriteStream } from 'node:fs';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PUBLIC_DIR = resolve(__dirname, '..', 'public');
mkdirSync(PUBLIC_DIR, { recursive: true });

const SITE_URL = 'https://lemonmuncher123.github.io';
const GOV_URL = 'https://trumpaccounts.gov';

const CONTENT = {
  en: {
    eyebrow: 'For families with kids born 2025-2028',
    title: 'Your child can get $1,000 - free.',
    subtitle: 'No income limit. No paperwork beyond opening the account.',
    bullets: [
      'The U.S. government will deposit $1,000 into a savings account for every U.S. citizen child born January 1, 2025 through December 31, 2028.',
      'There is no income limit. Families on SNAP, Medicaid, or no income at all still qualify.',
      'The money is invested in a low-cost U.S. stock index fund. At the S&P 500 historical average (~10% nominal, 1985-2026), $1,000 alone grows to about $5,500 by age 18.',
      'Families can add up to $5,000 per year. Even $5 a day ($1,825 a year) grows to roughly $89,000 by age 18 at the same average return.',
      'The child can use the money at age 18 for college, training, a first home, or a small business.',
    ],
    howTitle: 'How to open one',
    howSteps: [
      'Wait for July 4, 2026 - that\'s the official launch day.',
      'Go to trumpaccounts.gov.',
      'You will need: your child\'s name, date of birth, and Social Security number.',
      'The $1,000 will be deposited automatically - usually within a few weeks.',
    ],
    qrLabel: 'Scan to open the account',
    siteLabel: 'Help any family check eligibility in 30 seconds:',
    disclaimer:
      'Independent educational summary - not affiliated with any government agency or financial institution. Projected balances use the historical S&P 500 return and may be substantially higher or lower in any individual case. Not investment, tax, or legal advice.',
  },
  es: {
    eyebrow: 'Para familias con hijos nacidos en 2025-2028',
    title: 'Su hijo/a puede recibir $1,000 - gratis.',
    subtitle: 'Sin límite de ingresos. Sin trámites más allá de abrir la cuenta.',
    bullets: [
      'El gobierno de EE. UU. depositará $1,000 en una cuenta de ahorros para cada niño ciudadano nacido entre el 1 de enero de 2025 y el 31 de diciembre de 2028.',
      'No hay límite de ingresos. Las familias que reciben SNAP, Medicaid o sin ingresos también califican.',
      'El dinero se invierte en un fondo indexado de acciones de EE. UU. de bajo costo. Al promedio histórico del S&P 500 (~10% nominal, 1985-2026), los $1,000 solos crecen a unos $5,500 a los 18 años.',
      'Las familias pueden añadir hasta $5,000 al año. Incluso $5 al día ($1,825 al año) crecen a unos $89,000 a los 18 años al mismo rendimiento promedio.',
      'El joven puede usar el dinero a los 18 años para universidad, capacitación, una primera casa o un pequeño negocio.',
    ],
    howTitle: 'Cómo abrir una',
    howSteps: [
      'Espere al 4 de julio de 2026 - ese es el día oficial de apertura.',
      'Visite trumpaccounts.gov.',
      'Necesitará: el nombre, la fecha de nacimiento y el número de Seguro Social de su hijo/a.',
      'Los $1,000 se depositarán automáticamente, normalmente en unas semanas.',
    ],
    qrLabel: 'Escanee para abrir la cuenta',
    siteLabel: 'Ayude a cualquier familia a verificar elegibilidad en 30 segundos:',
    disclaimer:
      'Resumen educativo independiente - sin afiliación con ninguna agencia gubernamental o institución financiera. Los saldos proyectados usan el rendimiento histórico del S&P 500 y pueden ser significativamente mayores o menores en cualquier caso individual. No es asesoramiento de inversión, fiscal ni legal.',
  },
};

async function generate(locale, outputPath) {
  const c = CONTENT[locale];

  // Generate QR code as data URL.
  const qrDataUrl = await QRCode.toDataURL(GOV_URL, { width: 180, margin: 1 });
  const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

  const siteQrDataUrl = await QRCode.toDataURL(SITE_URL, { width: 140, margin: 1 });
  const siteQrBuffer = Buffer.from(siteQrDataUrl.split(',')[1], 'base64');

  const doc = new PDFDocument({
    size: 'LETTER',
    // Bottom margin = 0 so pdfkit's auto-page-break never fires for our
    // absolutely-positioned bottom-strip content. Top/left/right still
    // matter for any flowed text we use.
    margins: { top: 40, bottom: 0, left: 40, right: 40 },
    autoFirstPage: true,
    info: {
      Title: `Trump Account Handout (${locale.toUpperCase()})`,
      Author: 'Trump Account Guide',
      Subject: 'One-page summary of the federal Trump Account program',
    },
  });

  // Disable automatic page breaks — we intend everything to fit on one page,
  // and a stray overflow before our fixed-position QR block was rendering a
  // mostly-empty second page.
  doc.on('pageAdded', () => {
    // Should never fire; if it does, the layout has overflowed and needs
    // tightening.
    console.warn(`⚠ Unexpected second page in ${locale.toUpperCase()} handout`);
  });

  const stream = createWriteStream(outputPath);
  doc.pipe(stream);

  // ── Header band ───────────────────────────────────────────────
  const HEADER_H = 78;
  doc.rect(0, 0, doc.page.width, HEADER_H).fill('#15803d');
  doc.fillColor('white').font('Helvetica').fontSize(10).text(c.eyebrow, 40, 22);
  doc.font('Helvetica-Bold').fontSize(22).text(c.title, 40, 38);

  // ── Subtitle ──────────────────────────────────────────────────
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(12).text(c.subtitle, 40, HEADER_H + 14, { width: 520 });

  // ── Bullets (10pt, tight spacing) ─────────────────────────────
  let y = HEADER_H + 44;
  doc.font('Helvetica').fontSize(10).fillColor('#0f172a');
  for (const bullet of c.bullets) {
    doc.circle(48, y + 5, 2.5).fill('#16a34a');
    doc.fillColor('#0f172a').text(bullet, 60, y, { width: 510, lineGap: 1 });
    y = doc.y + 4;
  }

  // ── How to open ───────────────────────────────────────────────
  y += 4;
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#15803d').text(c.howTitle, 40, y);
  y = doc.y + 4;
  doc.font('Helvetica').fontSize(10).fillColor('#0f172a');
  c.howSteps.forEach((step, i) => {
    doc.font('Helvetica-Bold').text(`${i + 1}. `, 40, y, { continued: true });
    doc.font('Helvetica').text(step, { width: 510, lineGap: 1 });
    y = doc.y + 2;
  });

  // ── QR code block (bottom-right) ──────────────────────────────
  // Page height 792; reserve ~30 for the bottom disclaimer.
  // QR block: image 110 + label below ≈ 130 total. Anchor it ~155 from bottom.
  const QR_BLOCK_H = 130;
  const qrY = doc.page.height - 40 - QR_BLOCK_H;
  doc.image(qrBuffer, doc.page.width - 150, qrY, { width: 110 });
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#15803d')
    .text(c.qrLabel, doc.page.width - 165, qrY + 113, { width: 140, align: 'center' });

  // ── Site QR (bottom-left) ─────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a')
    .text(c.siteLabel, 40, qrY, { width: 200 });
  doc.image(siteQrBuffer, 40, qrY + 24, { width: 90 });
  doc.font('Helvetica').fontSize(9).fillColor('#15803d').text(SITE_URL.replace('https://', ''), 40, qrY + 118);

  // ── Disclaimer footer ─────────────────────────────────────────
  doc.font('Helvetica').fontSize(6.5).fillColor('#64748b')
    .text(c.disclaimer, 40, doc.page.height - 28, { width: doc.page.width - 80, align: 'center' });

  doc.end();
  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
  console.log(`✓ Wrote ${outputPath}`);
}

await generate('en', resolve(PUBLIC_DIR, 'counselor-en.pdf'));
await generate('es', resolve(PUBLIC_DIR, 'counselor-es.pdf'));
