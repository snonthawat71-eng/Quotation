import { fmtMoney, fmtDate, calcTotals, findBank } from './utils.js';

// ---------- โหลด pdfmake + ฟอนต์ (โหลดครั้งแรกที่กดสร้าง PDF, pin เวอร์ชันจาก CDN) ----------
// ไทย: Noto Sans Thai / อังกฤษ+ตัวเลข: Montserrat
const PDFMAKE_URL = 'https://cdn.jsdelivr.net/npm/pdfmake@0.2.20/build/pdfmake.min.js';
const FONT_URLS = {
  thaiReg: 'https://cdn.jsdelivr.net/npm/@expo-google-fonts/noto-sans-thai@0.4.2/400Regular/NotoSansThai_400Regular.ttf',
  thaiBold: 'https://cdn.jsdelivr.net/npm/@expo-google-fonts/noto-sans-thai@0.4.2/700Bold/NotoSansThai_700Bold.ttf',
  latinReg: 'https://cdn.jsdelivr.net/npm/@expo-google-fonts/montserrat@0.4.2/400Regular/Montserrat_400Regular.ttf',
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
    const [thaiReg, thaiBold, latinReg, latinBold] = await Promise.all([
      fontB64(FONT_URLS.thaiReg), fontB64(FONT_URLS.thaiBold),
      fontB64(FONT_URLS.latinReg), fontB64(FONT_URLS.latinBold),
    ]);
    pdfMake.vfs = {
      'NotoSansThai-Regular.ttf': thaiReg, 'NotoSansThai-Bold.ttf': thaiBold,
      'Montserrat-Regular.ttf': latinReg, 'Montserrat-Bold.ttf': latinBold,
    };
    pdfMake.fonts = {
      NotoSansThai: {
        normal: 'NotoSansThai-Regular.ttf', bold: 'NotoSansThai-Bold.ttf',
        italics: 'NotoSansThai-Regular.ttf', bolditalics: 'NotoSansThai-Bold.ttf',
      },
      Montserrat: {
        normal: 'Montserrat-Regular.ttf', bold: 'Montserrat-Bold.ttf',
        italics: 'Montserrat-Regular.ttf', bolditalics: 'Montserrat-Bold.ttf',
      },
    };
  })();
  return ready;
}

// แยกข้อความเป็นช่วงไทย/อังกฤษ: ช่วงตัวอักษร ASCII (อังกฤษ ตัวเลข เครื่องหมาย)
// ใช้ฟอนต์ Montserrat ส่วนที่เหลือ (ไทย) ใช้ Noto Sans Thai (ฟอนต์หลักของเอกสาร)
function mix(s) {
  s = String(s ?? '');
  const runs = [];
  const re = /[\x20-\x7E]+/g;
  let last = 0, m;
  while ((m = re.exec(s))) {
    if (m.index > last) runs.push({ text: s.slice(last, m.index) });
    runs.push({ text: m[0], font: 'Montserrat' });
    last = m.index + m[0].length;
  }
  if (last < s.length) runs.push({ text: s.slice(last) });
  if (!runs.length) return '';
  return (runs.length === 1 && !runs[0].font) ? s : runs;
}
const mixRuns = (s) => [].concat(mix(s) || '');

const COLORS = { QT: '#E8833A', INV: '#3050C8' };
const TITLES = { QT: 'ใบเสนอราคา', INV: 'ใบแจ้งหนี้' };
const INK = '#1A1A1A';      // ตัวหนังสือหลัก
const GRAY = '#555555';     // ข้อความรอง
const FAINT = '#8C8C8C';    // ป้าย/หมายเหตุ
const LINE = '#C9C9C9';     // เส้นแบ่ง

// ---------- นิยามเอกสาร PDF ----------
// k = สเกลย่อ (1 = ปกติ) ใช้บีบเนื้อหาให้จบใน A4 หน้าเดียว
export function buildDocDef(doc, company, k = 1) {
  const F = (n) => Math.round(n * k * 100) / 100;
  const c = company || {};
  const accent = COLORS[doc.doc_type] || COLORS.QT;
  const t = calcTotals(doc);
  const cust = doc.customer || {};

  const line = (txt, opt = {}) => ({ text: mix(txt), ...opt });
  const body = { fontSize: F(9), color: GRAY, lineHeight: 1.3 };

  // --- บล็อกผู้ขาย (ซ้ายบน) ---
  const seller = [];
  if (c.logo) seller.push({ image: c.logo, fit: [F(92), F(40)], margin: [0, 0, 0, F(8)] });
  seller.push(line(c.name || '', { bold: true, fontSize: F(11.5), color: INK, margin: [0, 0, 0, F(3)] }));
  (c.address || '').split('\n').forEach((a) => a.trim() && seller.push(line(a, body)));
  if (c.tax_id) seller.push(line('เลขประจำตัวผู้เสียภาษี ' + c.tax_id, body));
  if (c.phone) seller.push(line('โทร ' + c.phone, body));
  if (c.email) seller.push(line('อีเมล ' + c.email, body));

  // --- หัวเอกสาร (ขวาบน): ชื่อเอกสาร + ตารางเลขที่/วันที่ ---
  const metaRows = [
    ['เลขที่', doc.doc_number || ''],
    ['วันที่', fmtDate(doc.issue_date)],
  ];
  if (c.seller_name) metaRows.push(['ผู้ขาย', c.seller_name]);
  if (doc.doc_type === 'INV' && doc.due_date) metaRows.push(['ครบกำหนดชำระ', fmtDate(doc.due_date)]);

  const headRight = {
    width: F(225),
    stack: [
      { text: TITLES[doc.doc_type], fontSize: F(21), bold: true, color: accent, alignment: 'right', margin: [0, 0, 0, F(10)] },
      {
        table: {
          widths: [F(78), '*'],
          body: metaRows.map(([kk, v]) => [
            { text: kk, color: accent, fontSize: F(8.5), lineHeight: 1.2, border: [false, false, false, false], margin: [0, F(2.5), 0, F(2.5)] },
            { text: mix(v), bold: true, color: INK, fontSize: F(9.5), lineHeight: 1.2, border: [false, false, false, false], margin: [0, F(2.5), 0, F(2.5)] },
          ]),
        },
        layout: {
          hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0.7 : 0),
          vLineWidth: () => 0,
          hLineColor: () => LINE,
        },
      },
    ],
  };

  // --- บล็อกลูกค้า ---
  const custBlock = [
    { text: 'ลูกค้า', color: accent, fontSize: F(9), bold: true, margin: [0, F(20), 0, F(4)] },
    line(cust.name || '', { bold: true, fontSize: F(10.5), color: INK, margin: [0, 0, 0, F(2)] }),
  ];
  (cust.address || '').split('\n').forEach((a) => a.trim() && custBlock.push(line(a, body)));
  const custExtra = [];
  if (cust.tax_id) custExtra.push(line('เลขประจำตัวผู้เสียภาษี ' + cust.tax_id, body));
  if (cust.phone) custExtra.push(line('โทร ' + cust.phone, body));
  if (cust.email) custExtra.push(line('อีเมล ' + cust.email, body));
  if (custExtra.length) { custExtra[0].margin = [0, F(4), 0, 0]; custBlock.push(...custExtra); }

  // --- ตารางรายการ ---
  const th = (txt, align) => ({
    text: txt, color: '#FFFFFF', fillColor: accent, bold: true, fontSize: F(9),
    alignment: align || 'left', margin: [0, F(4.5), 0, F(4.5)],
  });
  const cell = (v, opt = {}) => ({ fontSize: F(9.5), color: INK, lineHeight: 1.2, margin: [0, F(4), 0, F(4)], ...opt });
  const itemRows = (doc.items || []).map((it, i) => [
    cell(String(i + 1), { text: String(i + 1), font: 'Montserrat', alignment: 'center', color: GRAY }),
    cell(0, { text: mix(it.desc || ''), bold: true }),
    cell(0, { text: mix(`${Number(it.qty) || 0} ${it.unit || ''}`.trim()), alignment: 'center' }),
    cell(0, { text: fmtMoney(it.price), font: 'Montserrat', alignment: 'right' }),
    cell(0, { text: fmtMoney((Number(it.qty) || 0) * (Number(it.price) || 0)), font: 'Montserrat', alignment: 'right' }),
  ]);
  const itemsTable = {
    margin: [0, F(16), 0, 0],
    table: {
      headerRows: 1,
      widths: [F(24), '*', F(64), F(80), F(80)],
      body: [
        [th('#', 'center'), th('รายละเอียด'), th('จำนวน', 'center'), th('ราคาต่อหน่วย', 'right'), th('ยอดรวม', 'right')],
        ...itemRows,
      ],
    },
    layout: {
      hLineWidth: (i, node) => (i <= 1 ? 0 : i === node.table.body.length ? 0.7 : 0.4),
      hLineColor: (i, node) => (i === node.table.body.length ? '#9E9E9E' : '#E8E8E8'),
      vLineWidth: () => 0,
      paddingLeft: () => F(7), paddingRight: () => F(7),
    },
  };

  // --- สรุปยอด ---
  const totalRows = [['รวมเป็นเงิน', t.subtotal]];
  if (t.discountAmt > 0) {
    totalRows.push([doc.discount_type === 'percent' ? `ส่วนลด ${Number(doc.discount)}%` : 'ส่วนลด', t.discountAmt]);
    totalRows.push(['ยอดหลังหักส่วนลด', t.afterDisc]);
  }
  if (Number(doc.vat_percent) > 0) totalRows.push([`ภาษีมูลค่าเพิ่ม ${Number(doc.vat_percent)}%`, t.vatAmt]);
  if (Number(doc.wht_percent) > 0) totalRows.push([`หัก ณ ที่จ่าย ${Number(doc.wht_percent)}%`, t.whtAmt]);
  totalRows.push(['ยอดชำระ', t.payable]);

  const totalsBlock = {
    margin: [0, F(10), 0, 0],
    columns: [
      { width: '*', text: '' },
      {
        width: F(272),
        table: {
          widths: ['*', F(112)],
          body: totalRows.map(([kk, v], i) => {
            const last = i === totalRows.length - 1;
            return [
              {
                text: mix(kk), color: last ? accent : GRAY, fontSize: last ? F(10) : F(9),
                bold: last, alignment: 'right', lineHeight: 1.2, margin: [0, F(3), 0, F(3)],
              },
              {
                text: mix(fmtMoney(v) + ' บาท'), bold: true, color: INK, fontSize: last ? F(10) : F(9.5),
                alignment: 'right', lineHeight: 1.2, margin: [0, F(3), 0, F(3)],
              },
            ];
          }),
        },
        layout: {
          hLineWidth: (i, node) => (i === node.table.body.length - 1 ? 0.7 : i === node.table.body.length ? 0.7 : 0),
          vLineWidth: () => 0,
          hLineColor: () => LINE,
        },
      },
    ],
  };

  const content = [
    { columns: [{ width: '*', stack: seller }, headRight], columnGap: F(24) },
    ...custBlock,
    itemsTable,
    totalsBlock,
  ];

  // --- ช่องทางการชำระเงิน (ใบแจ้งหนี้) ---
  if (doc.doc_type === 'INV' && (c.bank_account_no || c.bank_name || c.bank_account_name)) {
    content.push({ text: 'ช่องทางการชำระเงิน', color: accent, bold: true, fontSize: F(9.5), margin: [0, F(20), 0, F(6)] });
    const payRow = (label, value, badge) => {
      if (!value && !badge) return;
      const cols = [
        { width: F(70), text: label, color: GRAY, fontSize: F(9), lineHeight: 1.25 },
        { width: F(10), text: ':', color: GRAY, fontSize: F(9), lineHeight: 1.25 },
      ];
      if (badge) cols.push({
        width: 'auto',
        table: { body: [[{ text: badge.abbr, color: '#FFFFFF', fillColor: badge.color, bold: true, font: 'Montserrat', fontSize: F(6.6), margin: [F(4), F(1.6), F(4), F(1.6)] }]] },
        layout: 'noBorders',
        margin: [0, F(0.5), F(5), 0],
      });
      cols.push({ width: '*', text: mix(value), bold: true, color: INK, fontSize: F(9), lineHeight: 1.25 });
      content.push({ columns: cols, columnGap: F(4), margin: [0, F(1.8), 0, F(1.8)] });
    };
    payRow('ชื่อบัญชี', c.bank_account_name);
    payRow('เลขที่บัญชี', c.bank_account_no);
    payRow('ธนาคาร', c.bank_name, findBank(c.bank_name));
  }

  // --- หมายเหตุ (โทนอ่อน ไม่เด่นแข่งเนื้อหาหลัก) ---
  if (doc.notes) {
    const noteLines = doc.notes.split('\n').map((n) => n.replace(/^\s*[•·*-]\s*/, '').trim()).filter(Boolean);
    if (noteLines.length) {
      content.push({ text: 'หมายเหตุ', color: FAINT, bold: true, fontSize: F(8), margin: [0, F(20), 0, F(4)] });
      content.push({
        ul: noteLines.map((n) => ({ text: mix(n), margin: [0, 0, 0, F(1.5)] })),
        fontSize: F(7.8), color: '#787878', lineHeight: 1.3, markerColor: '#B9B9B9',
        margin: [F(2), 0, 0, 0],
      });
    }
  }
  if (doc.payment_terms) {
    content.push({
      text: [{ text: 'เงื่อนไขการชำระเงิน: ', bold: true }, ...mixRuns(doc.payment_terms)],
      color: accent, fontSize: F(8.3), lineHeight: 1.3, margin: [0, F(9), 0, 0],
    });
  }
  if (doc.ref_note) {
    content.push(line('*Note: ' + doc.ref_note, { color: '#C00000', fontSize: F(7.5), lineHeight: 1.3, margin: [0, F(9), 0, 0] }));
  }

  // --- ช่องลายเซ็น (ท้ายหน้า) ---
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
        table: { widths: ['*'], body: [[{ text: mix(label), alignment: 'center', color: GRAY, fontSize: 9, border: [false, true, false, false], margin: [0, 5, 0, 0] }]] },
        layout: { hLineWidth: () => 0.7, hLineColor: () => '#9E9E9E' },
      },
    ],
  });

  const footer = (cur, total) => cur !== total ? null : ({
    margin: [46, 12, 46, 0],
    columns: [
      slot(c.signer_left || 'Customer', null),
      slot('วันที่', null),
      { width: 40, text: '' },
      slot(c.signer_right || 'Designer', sigTopStack),
      slot('วันที่', [{ text: fmtDate(doc.issue_date), font: 'Montserrat', fontSize: 9.5, bold: true, color: INK, margin: [0, 16, 0, 0] }]),
    ],
    columnGap: 14,
  });

  return {
    pageSize: 'A4',
    pageMargins: [46, 42, 46, 106],
    defaultStyle: { font: 'NotoSansThai', fontSize: F(9.5), lineHeight: 1.2, color: INK },
    info: { title: doc.doc_number || TITLES[doc.doc_type] },
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

// บังคับให้จบใน A4 หน้าเดียว: ถ้าล้น ค่อยๆ ย่อสเกลลงจนพอดี
async function singlePageDD(doc, company) {
  for (const k of [1, 0.94, 0.88, 0.82, 0.76, 0.7]) {
    const dd = buildDocDef(doc, company, k);
    if (await countPages(dd) <= 1) return dd;
  }
  return buildDocDef(doc, company, 0.65);
}

export async function createPdf(doc, company) {
  await ensurePdf();
  return pdfMake.createPdf(await singlePageDD(doc, company));
}

export async function downloadPdf(doc, company) {
  (await createPdf(doc, company)).download((doc.doc_number || 'document') + '.pdf');
}

export async function pdfBlob(doc, company) {
  const pdf = await createPdf(doc, company);
  return new Promise((res) => pdf.getBlob(res));
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
