import { fmtMoney, fmtDate, calcTotals, findBank } from './utils.js';

// ---------- โหลด pdfmake + ฟอนต์ (โหลดครั้งแรกที่กดสร้าง PDF, pin เวอร์ชันจาก CDN) ----------
// ไทย: Noto Sans Thai / อังกฤษ+ตัวเลข: Montserrat — น้ำหนัก Regular 400 / SemiBold 600 / Bold 700
const PDFMAKE_URL = 'https://cdn.jsdelivr.net/npm/pdfmake@0.2.20/build/pdfmake.min.js';
const FONT_URLS = {
  thaiReg: 'https://cdn.jsdelivr.net/npm/@expo-google-fonts/noto-sans-thai@0.4.2/400Regular/NotoSansThai_400Regular.ttf',
  thaiSB: 'https://cdn.jsdelivr.net/npm/@expo-google-fonts/noto-sans-thai@0.4.2/600SemiBold/NotoSansThai_600SemiBold.ttf',
  thaiBold: 'https://cdn.jsdelivr.net/npm/@expo-google-fonts/noto-sans-thai@0.4.2/700Bold/NotoSansThai_700Bold.ttf',
  latinReg: 'https://cdn.jsdelivr.net/npm/@expo-google-fonts/montserrat@0.4.2/400Regular/Montserrat_400Regular.ttf',
  latinSB: 'https://cdn.jsdelivr.net/npm/@expo-google-fonts/montserrat@0.4.2/600SemiBold/Montserrat_600SemiBold.ttf',
  latinBold: 'https://cdn.jsdelivr.net/npm/@expo-google-fonts/montserrat@0.4.2/700Bold/Montserrat_700Bold.ttf',
};
let ready = null;
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('โหลด ' + src + ' ไม่สำเร็จ'));
    document.head.appendChild(s);
  });
}
async function fontB64(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('ดาวน์โหลดฟอนต์ไม่สำเร็จ');
  const bytes = new Uint8Array(await resp.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function ensurePdf() {
  if (!ready) ready = (async () => {
    if (!window.pdfMake) await loadScript(PDFMAKE_URL);
    const [thaiReg, thaiSB, thaiBold, latinReg, latinSB, latinBold] = await Promise.all(
      [FONT_URLS.thaiReg, FONT_URLS.thaiSB, FONT_URLS.thaiBold, FONT_URLS.latinReg, FONT_URLS.latinSB, FONT_URLS.latinBold].map(fontB64)
    );
    pdfMake.vfs = {
      'NotoSansThai-Regular.ttf': thaiReg, 'NotoSansThai-SemiBold.ttf': thaiSB, 'NotoSansThai-Bold.ttf': thaiBold,
      'Montserrat-Regular.ttf': latinReg, 'Montserrat-SemiBold.ttf': latinSB, 'Montserrat-Bold.ttf': latinBold,
    };
    // ครอบครัวฟอนต์: ปกติ (normal=400, bold=700) และ SB (normal=600 สำหรับข้อความ Semibold)
    pdfMake.fonts = {
      NotoSansThai: {
        normal: 'NotoSansThai-Regular.ttf', bold: 'NotoSansThai-Bold.ttf',
        italics: 'NotoSansThai-Regular.ttf', bolditalics: 'NotoSansThai-Bold.ttf',
      },
      NotoSansThaiSB: {
        normal: 'NotoSansThai-SemiBold.ttf', bold: 'NotoSansThai-Bold.ttf',
        italics: 'NotoSansThai-SemiBold.ttf', bolditalics: 'NotoSansThai-Bold.ttf',
      },
      Montserrat: {
        normal: 'Montserrat-Regular.ttf', bold: 'Montserrat-Bold.ttf',
        italics: 'Montserrat-Regular.ttf', bolditalics: 'Montserrat-Bold.ttf',
      },
      MontserratSB: {
        normal: 'Montserrat-SemiBold.ttf', bold: 'Montserrat-Bold.ttf',
        italics: 'Montserrat-SemiBold.ttf', bolditalics: 'Montserrat-Bold.ttf',
      },
    };
  })();
  return ready;
}

// แยกข้อความเป็นช่วงไทย/อังกฤษ: ช่วง ASCII (อังกฤษ ตัวเลข เครื่องหมาย) ใช้ Montserrat
// ที่เหลือ (ไทย) ใช้ฟอนต์ของ node นั้น — latinFont เลือกน้ำหนักอังกฤษให้เข้าคู่กัน
function mix(s, latinFont = 'Montserrat') {
  s = String(s ?? '');
  const runs = [];
  const re = /[\x20-\x7E]+/g;
  let last = 0, m;
  while ((m = re.exec(s))) {
    if (m.index > last) runs.push({ text: s.slice(last, m.index) });
    runs.push({ text: m[0], font: latinFont });
    last = m.index + m[0].length;
  }
  if (last < s.length) runs.push({ text: s.slice(last) });
  if (!runs.length) return '';
  return (runs.length === 1 && !runs[0].font) ? s : runs;
}
const mixRuns = (s, latinFont) => [].concat(mix(s, latinFont) || '');

// ---------- โทนสีตามดีไซน์ต้นแบบ ----------
const COLORS = { QT: '#F49739', INV: '#3050C8' };
const TITLES = { QT: 'ใบเสนอราคา', INV: 'ใบแจ้งหนี้' };
const INK = '#202020';        // ตัวอักษรหลัก
const SECONDARY = '#A7A7A7';  // ข้อความรอง (หมายเหตุ)
const LINE = '#D7D7D7';       // เส้นแบ่ง

// ---------- นิยามเอกสาร PDF ----------
// k = สเกลย่อ (1 = ปกติ, ต่ำสุด 0.8 เพื่อไม่ให้ตัวหนังสือเล็กจนอ่านยาก)
export function buildDocDef(doc, company, k = 1) {
  const F = (n) => Math.round(n * k * 100) / 100;
  const c = company || {};
  const accent = COLORS[doc.doc_type] || COLORS.QT;
  const t = calcTotals(doc);
  const cust = doc.customer || {};

  // ข้อความปกติ / กึ่งหนา (แยกช่วงไทย-อังกฤษให้อัตโนมัติ)
  const reg = (txt, opt = {}) => ({ text: mix(txt), ...opt });
  const sb = (txt, opt = {}) => ({ text: mix(txt, 'MontserratSB'), font: 'NotoSansThaiSB', ...opt });
  const body = { fontSize: F(9), color: INK, lineHeight: 1.15 };

  // --- ส่วนหัวซ้าย: ผู้ขาย (ไม่มีหัวข้อกำกับ) ---
  const seller = [];
  if (c.logo) seller.push({ image: c.logo, fit: [F(92), F(40)], margin: [0, 0, 0, F(8)] });
  seller.push(sb(c.name || '', { fontSize: F(10), color: INK, lineHeight: 1.2, margin: [0, 0, 0, F(1)] }));
  (c.address || '').split('\n').forEach((a) => a.trim() && seller.push(reg(a, body)));
  if (c.tax_id) seller.push(reg('เลขประจำตัวผู้เสียภาษี ' + c.tax_id, body));
  if (c.phone) seller.push(reg('เบอร์โทรศัพท์ ' + c.phone, body));
  if (c.email) seller.push(reg('อีเมล ' + c.email, body));

  // --- ส่วนหัวขวา: ชื่อเอกสารกึ่งกลางคอลัมน์ + ตารางเลขที่/วันที่/ผู้ขาย ---
  const metaRows = [
    ['เลขที่', doc.doc_number || ''],
    ['วันที่', fmtDate(doc.issue_date)],
  ];
  if (c.seller_name) metaRows.push(['ผู้ขาย', c.seller_name]);
  if (doc.doc_type === 'INV' && doc.due_date) metaRows.push(['ครบกำหนดชำระ', fmtDate(doc.due_date)]);

  const headRight = {
    width: F(230),
    stack: [
      { text: TITLES[doc.doc_type], fontSize: F(25), bold: true, color: accent, alignment: 'center', margin: [0, 0, 0, F(6)] },
      {
        table: {
          widths: [F(80), '*'],
          body: metaRows.map(([kk, v]) => [
            { text: kk, color: accent, fontSize: F(9), lineHeight: 1.1, border: [false, false, false, false], margin: [0, F(1.8), 0, F(1.8)] },
            { ...sb(v, { fontSize: F(9.5), color: INK, lineHeight: 1.1 }), border: [false, false, false, false], margin: [0, F(1.8), 0, F(1.8)] },
          ]),
        },
        layout: {
          hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0.6 : 0),
          vLineWidth: () => 0,
          hLineColor: () => LINE,
        },
      },
    ],
  };

  // --- ลูกค้า (ใต้ผู้ขาย ฝั่งซ้าย) ---
  const custBlock = [
    sb('ลูกค้า', { color: accent, fontSize: F(9.5), margin: [0, F(14), 0, F(6)] }),
    sb(cust.name || '', { fontSize: F(10), color: INK, lineHeight: 1.2, margin: [0, 0, 0, F(1)] }),
  ];
  (cust.address || '').split('\n').forEach((a) => a.trim() && custBlock.push(reg(a, body)));
  const custExtra = [];
  if (cust.tax_id) custExtra.push(reg('เลขประจำตัวผู้เสียภาษี ' + cust.tax_id, body));
  if (cust.phone) custExtra.push(reg('เบอร์โทรศัพท์ ' + cust.phone, body));
  if (cust.email) custExtra.push(reg('อีเมล ' + cust.email, body));
  if (custExtra.length) { custExtra[0].margin = [0, F(3), 0, 0]; custBlock.push(...custExtra); }

  // --- ตารางรายการ (สัดส่วนคอลัมน์ ~7/47/14/17/15%) ---
  const th = (txt, align) => ({
    ...sb(txt), color: '#FFFFFF', fillColor: accent, fontSize: F(9),
    alignment: align || 'left', margin: [0, F(4), 0, F(4)],
  });
  const cellPad = { lineHeight: 1.25, margin: [0, F(2.8), 0, F(2.8)] };
  const itemRows = (doc.items || []).map((it, i) => [
    { text: String(i + 1), font: 'MontserratSB', color: INK, fontSize: F(9.5), alignment: 'center', ...cellPad },
    sb(it.desc || '', { fontSize: F(9.5), color: INK, ...cellPad }),
    sb(`${Number(it.qty) || 0} ${it.unit || ''}`.trim(), { fontSize: F(9.5), color: INK, alignment: 'center', ...cellPad }),
    { text: fmtMoney(it.price), font: 'MontserratSB', color: INK, fontSize: F(9.5), alignment: 'right', ...cellPad },
    { text: fmtMoney((Number(it.qty) || 0) * (Number(it.price) || 0)), font: 'MontserratSB', color: INK, fontSize: F(9.5), alignment: 'right', ...cellPad },
  ]);
  const itemsTable = {
    margin: [0, F(24), 0, 0],
    table: {
      headerRows: 1,
      widths: [F(34), '*', F(70), F(86), F(78)],
      body: [
        [th('#', 'center'), th('รายละเอียด'), th('จำนวน', 'center'), th('ราคาต่อหน่วย', 'right'), th('ยอดรวม', 'right')],
        ...itemRows,
      ],
    },
    // ไม่มีเส้นระหว่างรายการ — มีเส้นสีเทาอ่อนปิดท้ายตารางเส้นเดียว
    layout: {
      hLineWidth: (i, node) => (i === node.table.body.length ? 0.6 : 0),
      hLineColor: () => LINE,
      vLineWidth: () => 0,
      paddingLeft: () => F(7), paddingRight: () => F(7),
    },
  };

  // --- สรุปยอด (ชิดขวา ไม่มีกรอบ) ---
  const totalRows = [['รวมเป็นเงิน', t.subtotal, false]];
  if (t.discountAmt > 0) {
    totalRows.push([doc.discount_type === 'percent' ? `ส่วนลด ${Number(doc.discount)}%` : 'ส่วนลด', t.discountAmt, false]);
    totalRows.push(['ยอดหลังหักส่วนลด', t.afterDisc, false]);
  }
  if (Number(doc.vat_percent) > 0) totalRows.push([`ภาษีมูลค่าเพิ่ม ${Number(doc.vat_percent)}%`, t.vatAmt, false]);
  if (Number(doc.wht_percent) > 0) totalRows.push([`หัก ณ ที่จ่าย ${Number(doc.wht_percent)}%`, t.whtAmt, false]);
  totalRows.push(['ยอดชำระ', t.payable, true]);

  // ช่องทางการชำระเงิน (ใบแจ้งหนี้) — วางฝั่งซ้ายระดับเดียวกับสรุปยอด ประหยัดพื้นที่แนวตั้ง
  const payStack = [];
  if (doc.doc_type === 'INV' && (c.bank_account_no || c.bank_name || c.bank_account_name)) {
    payStack.push(sb('ช่องทางการชำระเงิน', { color: accent, fontSize: F(9.5), margin: [0, F(2), 0, F(4)] }));
    const payRow = (label, value, badge) => {
      if (!value && !badge) return;
      const cols = [
        { text: label, color: INK, fontSize: F(9), lineHeight: 1.15, width: F(70) },
        { text: ':', color: INK, fontSize: F(9), lineHeight: 1.15, width: F(10) },
      ];
      if (badge) cols.push({
        width: 'auto',
        table: { body: [[{ text: badge.abbr, color: '#FFFFFF', fillColor: badge.color, font: 'MontserratSB', fontSize: F(6.6), margin: [F(4), F(1.6), F(4), F(1.6)] }]] },
        layout: 'noBorders',
        margin: [0, F(0.5), F(5), 0],
      });
      cols.push({ ...sb(value, { fontSize: F(9), color: INK, lineHeight: 1.15 }), width: '*' });
      payStack.push({ columns: cols, columnGap: F(4), margin: [0, F(1.2), 0, F(1.2)] });
    };
    payRow('ชื่อบัญชี', c.bank_account_name);
    payRow('เลขที่บัญชี', c.bank_account_no);
    payRow('ธนาคาร', c.bank_name, findBank(c.bank_name));
  }

  const totalsBlock = {
    margin: [0, F(10), 0, 0],
    columnGap: F(20),
    columns: [
      payStack.length ? { width: '*', stack: payStack } : { width: '*', text: '' },
      {
        width: F(280),
        table: {
          widths: ['*', F(118)],
          body: totalRows.map(([kk, v, last]) => [
            { text: mix(kk), color: accent, fontSize: F(9.5), lineHeight: 1.1, alignment: 'right', margin: [0, F(2), 0, F(2)] },
            {
              text: mix(fmtMoney(v) + ' บาท', last ? 'Montserrat' : 'MontserratSB'),
              font: 'NotoSansThaiSB', bold: !!last, color: INK,
              fontSize: last ? F(10) : F(9.5), lineHeight: 1.1, alignment: 'right', margin: [0, F(2), 0, F(2)],
            },
          ]),
        },
        layout: {
          hLineWidth: (i, node) => (i === node.table.body.length ? 0.6 : 0),
          vLineWidth: () => 0,
          hLineColor: () => LINE,
        },
      },
    ],
  };

  const content = [
    // ชื่อผู้ขายเริ่มต่ำกว่าหัวเรื่อง ~ระดับเส้นบนของตารางเลขที่ (ตามเอกสารต้นแบบ)
    { columns: [{ width: '*', stack: seller, margin: [0, F(33), 0, 0] }, headRight], columnGap: F(24) },
    ...custBlock,
    itemsTable,
    totalsBlock,
  ];

  // --- หมายเหตุ: สีเทาอ่อน ชิดซ้าย กว้าง ~62% ของหน้า เว้นด้านบนมากตามต้นแบบ ---
  const CONTENT_W = 509;               // A4 กว้าง 595 - ขอบ 43+43
  const NOTE_RIGHT = CONTENT_W - 365;  // กว้าง 365pt (~62% ของหน้า) เท่าระยะตัดคำเอกสารต้นแบบ
  if (doc.notes) {
    const noteLines = doc.notes.split('\n').map((n) => n.replace(/^\s*[•·*-]\s*/, '').trim()).filter(Boolean);
    if (noteLines.length) {
      content.push(sb('*หมายเหตุ', { color: accent, fontSize: F(9), margin: [0, F(22), 0, F(4)] }));
      content.push({
        ul: noteLines.map((n) => ({ text: mix(n), margin: [0, 0, 0, F(0.5)] })),
        fontSize: F(8), color: SECONDARY, lineHeight: 1.12, markerColor: SECONDARY,
        margin: [F(2), 0, NOTE_RIGHT, 0],
      });
    }
  }
  if (doc.payment_terms) {
    content.push({
      text: [{ text: '• ' }, ...mixRuns(doc.payment_terms, 'MontserratSB')],
      font: 'NotoSansThaiSB', color: accent, fontSize: F(8.2), lineHeight: 1.12,
      margin: [F(2), F(4), NOTE_RIGHT, 0],
    });
  }
  if (doc.ref_note) {
    content.push(reg('*Note: ' + doc.ref_note, { color: '#C00000', fontSize: F(7.5), lineHeight: 1.12, margin: [0, F(5), 0, 0] }));
  }

  // --- ช่องลายเซ็นท้ายหน้าสุดท้าย: ซ้าย Customer/วันที่ ขวา Designer/วันที่ ---
  const sigTopStack = [];
  const imgs = [];
  if (c.signature) imgs.push({ image: c.signature, fit: [88, 32] });
  if (c.stamp) imgs.push({ image: c.stamp, fit: [40, 32] });
  if (imgs.length) sigTopStack.push({ columns: imgs, columnGap: 4, alignment: 'center', width: 'auto' });

  const slot = (label, above) => ({
    width: '*',
    stack: [
      { stack: above && above.length ? above : [{ text: ' ', fontSize: 26 }], alignment: 'center', margin: [0, 0, 0, 2] },
      {
        table: { widths: ['*'], body: [[{ text: mix(label), alignment: 'center', color: INK, fontSize: 9, border: [false, true, false, false], margin: [0, 5, 0, 0] }]] },
        layout: { hLineWidth: () => 0.6, hLineColor: () => LINE },
      },
    ],
  });

  const footer = (cur, total) => cur !== total ? null : ({
    margin: [43, 12, 43, 0],
    columns: [
      slot(c.signer_left || 'Customer', null),
      slot('วันที่', null),
      { width: 40, text: '' },
      slot(c.signer_right || 'Designer', sigTopStack),
      slot('วันที่', [{ text: fmtDate(doc.issue_date), font: 'MontserratSB', fontSize: 9.5, color: INK, margin: [0, 16, 0, 0] }]),
    ],
    columnGap: 14,
  });

  // หน้า 2 เป็นต้นไป (กรณีเอกสารยาวมาก): โชว์เลขที่เอกสารมุมบนขวา
  const header = (cur) => cur === 1 ? null : ({
    text: mix(doc.doc_number || ''), font: 'Montserrat',
    alignment: 'right', fontSize: 8.5, color: SECONDARY, margin: [43, 18, 43, 0],
  });

  return {
    pageSize: 'A4',
    pageMargins: [43, 42, 43, 92],
    defaultStyle: { font: 'NotoSansThai', fontSize: F(9.5), lineHeight: 1.15, color: INK },
    info: { title: doc.doc_number || TITLES[doc.doc_type] },
    header,
    footer,
    content,
  };
}

// นับจำนวนหน้าของเอกสารที่สร้างแล้ว
function countPages(dd) {
  return new Promise((res) => {
    pdfMake.createPdf(dd).getBuffer((buf) => {
      const s = new TextDecoder('latin1').decode(buf);
      res((s.match(/\/Type \/Page[^s]/g) || []).length);
    });
  });
}

// พยายามให้จบ A4 หน้าเดียว: ถ้าล้น ค่อยๆ ย่อสเกลลงถึง 0.7 (ต่ำกว่านี้ตัวหนังสือเล็กเกินอ่าน)
// ถ้ายังยาวเกินอีก ยอมขึ้นหน้าใหม่ที่สเกลอ่านง่าย — หัวตารางทำซ้ำอัตโนมัติ
// สรุปยอด/หมายเหตุ/ลายเซ็นอยู่หน้าสุดท้าย และหน้า 2+ มีเลขที่เอกสารมุมบน
async function fitDD(doc, company) {
  for (const k of [1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7]) {
    const dd = buildDocDef(doc, company, k);
    if (await countPages(dd) <= 1) return dd;
  }
  return buildDocDef(doc, company, 0.85);
}

export async function createPdf(doc, company) {
  await ensurePdf();
  return pdfMake.createPdf(await fitDD(doc, company));
}

export async function downloadPdf(doc, company) {
  (await createPdf(doc, company)).download((doc.doc_number || 'document') + '.pdf');
}

export async function pdfBlob(doc, company) {
  const pdf = await createPdf(doc, company);
  return new Promise((res) => pdf.getBlob(res));
}

// ---------- แสดงตัวอย่าง PDF ด้วย PDF.js (เรนเดอร์ลง canvas เห็นได้ทุกเครื่อง ไม่ต้องดาวน์โหลด) ----------
const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
let pdfjsReady = null;
function ensurePdfjs() {
  if (!pdfjsReady) pdfjsReady = loadScript(PDFJS_URL).then(() => {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  });
  return pdfjsReady;
}

// เรนเดอร์ทุกหน้าของ PDF (ปกติ 1 หน้า) เป็น canvas ลงใน container
export async function renderPdfPreview(blob, container, maxWidth) {
  await ensurePdfjs();
  const pdf = await pdfjsLib.getDocument({ data: await blob.arrayBuffer() }).promise;
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const vp1 = page.getViewport({ scale: 1 });
    const ratio = Math.min(3, (window.devicePixelRatio || 1) * 2); // เรนเดอร์คมชัดบนจอ retina
    const vp = page.getViewport({ scale: (maxWidth / vp1.width) * ratio });
    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-page';
    canvas.width = vp.width;
    canvas.height = vp.height;
    canvas.style.width = Math.floor(vp.width / ratio) + 'px';
    container.appendChild(canvas);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  }
}

export async function sharePdf(doc, company) {
  const blob = await pdfBlob(doc, company);
  const file = new File([blob], (doc.doc_number || 'document') + '.pdf', { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: doc.doc_number || '' });
    return true;
  }
  return false;
}
