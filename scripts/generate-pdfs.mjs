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

const SITE_URL = 'https://trumpaccount.guide';
const GOV_URL = 'https://trumpaccounts.gov';

const CONTENT = {
  en: {
    eyebrow: 'For families with kids born 2025–2028',
    title: 'Your child can get $1,000 — free.',
    subtitle: 'No income limit. No paperwork beyond opening the account.',
    bullets: [
      'The U.S. government will deposit $1,000 into a savings account for every U.S. citizen child born January 1, 2025 through December 31, 2028.',
      'There is no income limit. Families on SNAP, Medicaid, or no income at all still qualify.',
      'The money is invested in a low-cost U.S. stock index fund. With a typical 7% annual return, $1,000 alone grows to about $3,400 by age 18.',
      'Families can add up to $5,000 per year. Even $5 a day ($1,825 a year) becomes about $66,000 by age 18.',
      'The child can use the money at age 18 for college, training, a first home, or a small business.',
    ],
    howTitle: 'How to open one',
    howSteps: [
      'Wait for July 4, 2026 — that\'s the official launch day.',
      'Go to trumpaccounts.gov.',
      'You will need: your child\'s name, date of birth, and Social Security number.',
      'The $1,000 will be deposited automatically — usually within a few weeks.',
    ],
    qrLabel: 'Scan to open the account →',
    siteLabel: 'Help any family check eligibility in 30 seconds:',
    disclaimer: 'This handout is an independent educational summary. Not affiliated with any government agency or financial institution. Not investment advice.',
  },
  es: {
    eyebrow: 'Para familias con hijos nacidos en 2025–2028',
    title: 'Su hijo/a puede recibir $1,000 — gratis.',
    subtitle: 'Sin límite de ingresos. Sin trámites más allá de abrir la cuenta.',
    bullets: [
      'El gobierno de EE. UU. depositará $1,000 en una cuenta de ahorros para cada niño ciudadano nacido entre el 1 de enero de 2025 y el 31 de diciembre de 2028.',
      'No hay límite de ingresos. Las familias que reciben SNAP, Medicaid o sin ingresos también califican.',
      'El dinero se invierte en un fondo indexado de acciones de EE. UU. de bajo costo. Con un retorno típico del 7% anual, los $1,000 solos crecen a unos $3,400 a los 18 años.',
      'Las familias pueden añadir hasta $5,000 al año. Incluso $5 al día ($1,825 al año) se convierten en unos $66,000 a los 18 años.',
      'El joven puede usar el dinero a los 18 años para universidad, capacitación, una primera casa o un pequeño negocio.',
    ],
    howTitle: 'Cómo abrir una',
    howSteps: [
      'Espere al 4 de julio de 2026 — ese es el día oficial de apertura.',
      'Visite trumpaccounts.gov.',
      'Necesitará: el nombre, la fecha de nacimiento y el número de Seguro Social de su hijo/a.',
      'Los $1,000 se depositarán automáticamente, normalmente en unas semanas.',
    ],
    qrLabel: 'Escanee para abrir la cuenta →',
    siteLabel: 'Ayude a cualquier familia a verificar elegibilidad en 30 segundos:',
    disclaimer: 'Este folleto es un resumen educativo independiente. Sin afiliación con ninguna agencia gubernamental o institución financiera. No es asesoramiento de inversión.',
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
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
    info: {
      Title: `Trump Account Handout (${locale.toUpperCase()})`,
      Author: 'Trump Account Guide',
      Subject: 'One-page summary of the federal Trump Account program',
    },
  });

  const stream = createWriteStream(outputPath);
  doc.pipe(stream);

  // ── Header band ───────────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 90).fill('#15803d');
  doc.fillColor('white').font('Helvetica').fontSize(11).text(c.eyebrow, 50, 30);
  doc.font('Helvetica-Bold').fontSize(24).text(c.title, 50, 47);

  // ── Subtitle ──────────────────────────────────────────────────
  doc.moveDown(0.5);
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(14).text(c.subtitle, 50, 110, { width: 500 });

  // ── Bullets ──────────────────────────────────────────────────
  let y = 160;
  doc.font('Helvetica').fontSize(11).fillColor('#0f172a');
  for (const bullet of c.bullets) {
    doc.circle(58, y + 6, 3).fill('#16a34a');
    doc.fillColor('#0f172a').text(bullet, 70, y, { width: 500 });
    y = doc.y + 8;
  }

  // ── How to open ───────────────────────────────────────────────
  y += 8;
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#15803d').text(c.howTitle, 50, y);
  y = doc.y + 6;
  doc.font('Helvetica').fontSize(11).fillColor('#0f172a');
  c.howSteps.forEach((step, i) => {
    doc.font('Helvetica-Bold').text(`${i + 1}. `, 50, y, { continued: true });
    doc.font('Helvetica').text(step, { width: 500 });
    y = doc.y + 4;
  });

  // ── QR code block (bottom-right) ──────────────────────────────
  const qrY = doc.page.height - 200;
  doc.image(qrBuffer, doc.page.width - 200, qrY, { width: 140 });
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#15803d')
    .text(c.qrLabel, doc.page.width - 200, qrY + 145, { width: 140, align: 'center' });

  // ── Site QR (bottom-left) ─────────────────────────────────────
  doc.image(siteQrBuffer, 50, qrY + 30, { width: 110 });
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a')
    .text(c.siteLabel, 50, qrY - 10, { width: 250 });
  doc.font('Helvetica').fontSize(9).fillColor('#15803d').text(SITE_URL.replace('https://', ''), 50, qrY + 145);

  // ── Disclaimer footer ─────────────────────────────────────────
  doc.font('Helvetica').fontSize(7).fillColor('#64748b')
    .text(c.disclaimer, 50, doc.page.height - 40, { width: doc.page.width - 100, align: 'center' });

  doc.end();
  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
  console.log(`✓ Wrote ${outputPath}`);
}

await generate('en', resolve(PUBLIC_DIR, 'counselor-en.pdf'));
await generate('es', resolve(PUBLIC_DIR, 'counselor-es.pdf'));
