import { fmtMoney, fmtDate, calcTotals } from './utils.js';

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

const COLORS = { QT: '#E8833A', INV: '#3050C8' };
const TITLES = { QT: 'ใบเสนอราคา', INV: 'ใบแจ้งหนี้' };

const line = (t, opt = {}) => ({ text: mix(t), ...opt });

// ---------- นิยามเอกสาร PDF (เลย์เอาต์ตามเอกสารตัวอย่าง) ----------
export function buildDocDef(doc, company) {
  const c = company || {};
  const accent = COLORS[doc.doc_type] || COLORS.QT;
  const t = calcTotals(doc);
  const cust = doc.customer || {};

  // --- บล็อกผู้ขาย (ซ้ายบน) ---
  const seller = [];
  if (c.logo) seller.push({ image: c.logo, fit: [90, 42], margin: [0, 0, 0, 6] });
  seller.push(line(c.name || '', { bold: true, fontSize: 11 }));
  (c.address || '').split('\n').forEach((a) => a.trim() && seller.push(line(a, { fontSize: 9.5, color: '#333333' })));
  if (c.tax_id) seller.push(line('เลขประจำตัวผู้เสียภาษี ' + c.tax_id, { fontSize: 9.5, color: '#333333' }));
  if (c.phone) seller.push(line('เบอร์โทรศัพท์ ' + c.phone, { fontSize: 9.5, color: '#333333' }));
  if (c.email) seller.push(line('อีเมล์ ' + c.email, { fontSize: 9.5, color: '#333333' }));

  // --- หัวเอกสาร (ขวาบน): ชื่อเอกสาร + เลขที่/วันที่/ผู้ขาย ---
  const metaRows = [
    ['เลขที่', doc.doc_number || ''],
    ['วันที่', fmtDate(doc.issue_date)],
  ];
  if (c.seller_name) metaRows.push(['ผู้ขาย', c.seller_name]);
  if (doc.doc_type === 'INV' && doc.due_date) metaRows.push(['ครบกำหนด', fmtDate(doc.due_date)]);

  const headRight = {
    width: 230,
    stack: [
      { text: TITLES[doc.doc_type], fontSize: 24, bold: true, color: accent, alignment: 'right', margin: [0, 0, 0, 6] },
      {
        table: {
          widths: [70, '*'],
          body: metaRows.map(([k, v]) => [
            { text: k, color: accent, fontSize: 9.5, border: [false, false, false, false], margin: [0, 2, 0, 2] },
            { text: mix(v), bold: true, fontSize: 10, border: [false, false, false, false], margin: [0, 2, 0, 2] },
          ]),
        },
        layout: {
          hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0.8 : 0),
          vLineWidth: () => 0,
          hLineColor: () => '#bbbbbb',
        },
      },
    ],
  };

  // --- บล็อกลูกค้า ---
  const custBlock = [
    { text: 'ลูกค้า', color: accent, fontSize: 10, bold: true, margin: [0, 13, 0, 3] },
    line(cust.name || '', { bold: true, fontSize: 10.5 }),
  ];
  (cust.address || '').split('\n').forEach((a) => a.trim() && custBlock.push(line(a, { fontSize: 9.5, color: '#333333' })));
  if (cust.tax_id) custBlock.push(line('เลขประจำตัวผู้เสียภาษี ' + cust.tax_id, { fontSize: 9.5, color: '#333333', margin: [0, 4, 0, 0] }));
  if (cust.phone) custBlock.push(line('เบอร์โทรศัพท์ ' + cust.phone, { fontSize: 9.5, color: '#333333' }));
  if (cust.email) custBlock.push(line('อีเมล์ ' + cust.email, { fontSize: 9.5, color: '#333333' }));

  // --- ตารางรายการ ---
  const th = (txt, align) => ({ text: txt, color: '#ffffff', fillColor: accent, bold: true, fontSize: 9.5, alignment: align || 'left', margin: [0, 3, 0, 3] });
  const itemRows = (doc.items || []).map((it, i) => [
    { text: String(i + 1), font: 'Montserrat', alignment: 'center', fontSize: 10, margin: [0, 3, 0, 3] },
    { text: mix(it.desc || ''), bold: true, fontSize: 10, margin: [0, 3, 0, 3] },
    { text: mix(`${Number(it.qty) || 0} ${it.unit || ''}`.trim()), alignment: 'center', fontSize: 10, margin: [0, 3, 0, 3] },
    { text: fmtMoney(it.price), font: 'Montserrat', alignment: 'right', fontSize: 10, margin: [0, 3, 0, 3] },
    { text: fmtMoney((Number(it.qty) || 0) * (Number(it.price) || 0)), font: 'Montserrat', alignment: 'right', fontSize: 10, margin: [0, 3, 0, 3] },
  ]);
  const itemsTable = {
    margin: [0, 12, 0, 0],
    table: {
      headerRows: 1,
      widths: [22, '*', 62, 78, 78],
      body: [
        [th('#', 'center'), th('รายละเอียด'), th('จำนวน', 'center'), th('ราคาต่อหน่วย', 'right'), th('ยอดรวม', 'right')],
        ...itemRows,
      ],
    },
    layout: {
      hLineWidth: (i, node) => (i === node.table.body.length ? 0.8 : 0),
      vLineWidth: () => 0,
      hLineColor: () => '#bbbbbb',
      paddingLeft: () => 6, paddingRight: () => 6,
    },
  };

  // --- สรุปยอด ---
  const totalRows = [['รวมเป็นเงิน', t.subtotal]];
  if (t.discountAmt > 0) {
    const dLabel = doc.discount_type === 'percent' ? `ส่วนลด ${Number(doc.discount)}%` : 'ส่วนลด';
    totalRows.push([dLabel, t.discountAmt]);
    totalRows.push(['ยอดหลังหักส่วนลด', t.afterDisc]);
  }
  if (Number(doc.vat_percent) > 0) totalRows.push([`ภาษีมูลค่าเพิ่ม ${Number(doc.vat_percent)}%`, t.vatAmt]);
  if (Number(doc.wht_percent) > 0) totalRows.push([`หัก ณ ที่จ่าย ${Number(doc.wht_percent)}%`, t.whtAmt]);
  totalRows.push(['ยอดชำระ', t.payable]);

  const totalsBlock = {
    margin: [0, 8, 0, 0],
    columns: [
      { width: '*', text: '' },
      {
        width: 280,
        table: {
          widths: ['*', 110],
          body: totalRows.map(([k, v], i) => {
            const last = i === totalRows.length - 1;
            return [
              { text: mix(k), color: accent, fontSize: last ? 10.5 : 10, bold: last, alignment: 'right', margin: [0, 2.5, 0, 2.5] },
              { text: mix(fmtMoney(v) + ' บาท'), bold: true, fontSize: last ? 10.5 : 10, alignment: 'right', margin: [0, 2.5, 0, 2.5] },
            ];
          }),
        },
        layout: {
          hLineWidth: (i, node) => (i === node.table.body.length ? 0.8 : 0),
          vLineWidth: () => 0,
          hLineColor: () => '#bbbbbb',
        },
      },
    ],
  };

  const content = [
    { columns: [{ width: '*', stack: seller }, headRight], columnGap: 20 },
    ...custBlock,
    itemsTable,
    totalsBlock,
  ];

  // --- ช่องทางการชำระเงิน (ใบแจ้งหนี้) ---
  if (doc.doc_type === 'INV' && (c.bank_account_no || c.bank_name || c.bank_account_name)) {
    content.push({ text: 'ช่องทางการชำระเงิน', color: accent, bold: true, fontSize: 10.5, decoration: 'underline', margin: [0, 14, 0, 5] });
    const bankRow = (k, v) => v && content.push({
      columns: [
        { width: 62, text: k, color: accent, fontSize: 10, bold: true },
        { width: 8, text: ':', fontSize: 10 },
        { width: '*', text: mix(v), fontSize: 10, bold: true },
      ],
      margin: [0, 1, 0, 1],
    });
    bankRow('ชื่อบัญชี', c.bank_account_name);
    bankRow('เลขที่บัญชี', c.bank_account_no);
    bankRow('ธนาคาร', c.bank_name);
  }

  // --- หมายเหตุ ---
  if (doc.notes) {
    content.push({ text: '*หมายเหตุ', color: accent, bold: true, fontSize: 9.5, margin: [0, 12, 0, 4] });
    doc.notes.split('\n').forEach((n) => {
      if (!n.trim()) return;
      const hasBullet = /^\s*[•*-]/.test(n);
      content.push(line((hasBullet ? '' : '• ') + n.trim(), { fontSize: 8.5, color: '#444444', margin: [2, 0.5, 0, 0.5] }));
    });
  }
  if (doc.payment_terms) {
    content.push(line('• ' + doc.payment_terms, { color: accent, bold: true, fontSize: 9, margin: [2, 8, 0, 0] }));
  }
  if (doc.ref_note) {
    content.push(line('*Note: ' + doc.ref_note, { color: '#C00000', bold: true, fontSize: 8, margin: [0, 10, 0, 0] }));
  }

  // --- ช่องลายเซ็น (ท้ายหน้าสุดท้าย) ---
  const sigTopStack = [];
  const imgs = [];
  if (c.signature) imgs.push({ image: c.signature, fit: [90, 34] });
  if (c.stamp) imgs.push({ image: c.stamp, fit: [42, 34] });
  if (imgs.length) sigTopStack.push({ columns: imgs, columnGap: 4, alignment: 'center', width: 'auto' });

  const slot = (label, above) => ({
    width: '*',
    stack: [
      { stack: above && above.length ? above : [{ text: ' ', fontSize: 26 }], alignment: 'center', margin: [0, 0, 0, 2] },
      {
        table: { widths: ['*'], body: [[{ text: mix(label), alignment: 'center', fontSize: 9.5, border: [false, true, false, false], margin: [0, 4, 0, 0] }]] },
        layout: { hLineWidth: () => 0.8, hLineColor: () => '#999999' },
      },
    ],
  });

  const signerL = c.signer_left || 'Customer';
  const signerR = c.signer_right || 'Designer';
  const footer = (cur, total) => cur !== total ? null : ({
    margin: [40, 14, 40, 0],
    columns: [
      slot(signerL, null),
      slot('วันที่', null),
      { width: 40, text: '' },
      slot(signerR, sigTopStack),
      slot('วันที่', [{ text: fmtDate(doc.issue_date), font: 'Montserrat', fontSize: 10, bold: true, margin: [0, 16, 0, 0] }]),
    ],
    columnGap: 14,
  });

  return {
    pageSize: 'A4',
    pageMargins: [40, 34, 40, 100],
    defaultStyle: { font: 'NotoSansThai', fontSize: 10, lineHeight: 1.02 },
    info: { title: doc.doc_number || TITLES[doc.doc_type] },
    footer,
    content,
  };
}

export async function createPdf(doc, company) {
  await ensurePdf();
  return pdfMake.createPdf(buildDocDef(doc, company));
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
