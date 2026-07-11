// ---------- format ----------
export const fmtMoney = (n) =>
  (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

export const todayISO = () => new Date().toLocaleDateString('sv-SE');

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// pdfmake ตัดบรรทัดข้อความไทยยาวๆ ได้ในตัว — ห้ามแทรก zero-width space
// เพราะฟอนต์ Sarabun ไม่มี glyph ตัวนั้น จะแสดงเป็นกล่องสี่เหลี่ยมใน PDF
export function thaiWrap(s) {
  return String(s ?? '');
}

// ---------- คำนวณยอด ----------
export function calcTotals(doc) {
  const items = doc.items || [];
  const subtotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
  const disc = Number(doc.discount) || 0;
  const discountAmt = doc.discount_type === 'percent' ? subtotal * disc / 100 : disc;
  const afterDisc = subtotal - discountAmt;
  const vatAmt = afterDisc * (Number(doc.vat_percent) || 0) / 100;
  const whtAmt = afterDisc * (Number(doc.wht_percent) || 0) / 100;
  const grand = afterDisc + vatAmt;
  const payable = grand - whtAmt;
  const r = (x) => Math.round(x * 100) / 100;
  return {
    subtotal: r(subtotal), discountAmt: r(discountAmt), afterDisc: r(afterDisc),
    vatAmt: r(vatAmt), whtAmt: r(whtAmt), grand: r(grand), payable: r(payable),
  };
}

// ---------- รูปภาพ: ย่อขนาดแล้วคืนค่าเป็น data URL ----------
export function resizeImage(file, maxDim = 600) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      // PNG เก็บความโปร่งใส (เหมาะกับลายเซ็น/ตราประทับ)
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('อ่านไฟล์รูปไม่ได้')); };
    img.src = url;
  });
}
