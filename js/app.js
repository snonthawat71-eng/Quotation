import { fmtMoney, fmtDate, todayISO, esc, calcTotals, resizeImage } from './utils.js';
import { downloadPdf, sharePdf } from './pdf.js';

const cfg = window.APP_CONFIG || {};
const hasCfg = /^https:\/\//.test(cfg.SUPABASE_URL || '') && (cfg.SUPABASE_ANON_KEY || '').length > 20;
const sb = hasCfg ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

// ลงทะเบียนฟอนต์ Sarabun สำหรับหน้าเว็บ จากข้อมูลที่ฝังใน js/fonts-data.js
if (window.SARABUN_FONTS && window.FontFace) {
  const b64buf = (b64) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0)).buffer;
  for (const [weight, b64] of [['400', SARABUN_FONTS.regular], ['700', SARABUN_FONTS.bold]]) {
    new FontFace('Sarabun', b64buf(b64), { weight }).load()
      .then((f) => document.fonts.add(f)).catch(() => {});
  }
}

const $app = document.getElementById('app');
let session = null;
let cache = { companies: null, customers: null, products: null };
let activeTab = 'QT';
let searchText = '';

const STATUS = {
  QT: { draft: 'ร่าง', sent: 'ส่งแล้ว', accepted: 'อนุมัติแล้ว', void: 'ยกเลิก' },
  INV: { draft: 'ร่าง', sent: 'ส่งแล้ว', paid: 'ชำระแล้ว', void: 'ยกเลิก' },
};
const TYPE_NAME = { QT: 'ใบเสนอราคา', INV: 'ใบแจ้งหนี้' };

// ---------- helpers ----------
function toast(text, isErr = false) {
  document.querySelector('.toast')?.remove();
  const d = document.createElement('div');
  d.className = 'toast' + (isErr ? ' err' : '');
  d.textContent = text;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), isErr ? 4200 : 2200);
}
const errMsg = (e) => (e && (e.message || e.error_description)) || String(e);

async function loadMasters(force = false) {
  if (cache.companies && !force) return;
  const [co, cu, pr] = await Promise.all([
    sb.from('companies').select('*').order('created_at'),
    sb.from('customers').select('*').order('name'),
    sb.from('products').select('*').order('name'),
  ]);
  for (const r of [co, cu, pr]) if (r.error) throw r.error;
  cache = { companies: co.data, customers: cu.data, products: pr.data };
}

async function nextNumber(type, dateISO) {
  const prefix = type + (dateISO || todayISO()).replaceAll('-', '');
  const { data, error } = await sb.from('documents')
    .select('doc_number').like('doc_number', prefix + '%')
    .order('doc_number', { ascending: false }).limit(1);
  if (error) throw error;
  const last = data && data[0] && data[0].doc_number;
  const n = last ? (parseInt(last.slice(prefix.length), 10) || 0) + 1 : 1;
  return prefix + String(n).padStart(4, '0');
}

// บริษัทสำหรับใช้ทำ PDF: ใช้ข้อมูลล่าสุดจากสมุดบริษัท (มีรูป) ถ้าไม่เจอใช้สำเนาในเอกสาร
function companyForPdf(doc) {
  return (cache.companies || []).find((c) => c.id === doc.company_id) || doc.company || {};
}

// ---------- router ----------
async function render() {
  try {
    if (!hasCfg) return viewSetup();
    if (session === null) {
      const { data } = await sb.auth.getSession();
      session = data.session || false;
    }
    if (!session) return viewLogin();
    await loadMasters();

    const h = location.hash.replace(/^#\/?/, '');
    const [p1, p2] = h.split('/');
    if (p1 === 'new' && (p2 === 'QT' || p2 === 'INV')) return viewEdit(null, p2);
    if (p1 === 'edit' && p2) return viewEdit(p2);
    if (p1 === 'settings') return viewSettings();
    if (p1 === 'company') return viewCompany(p2);
    if (p1 === 'customer') return viewCustomer(p2);
    if (p1 === 'product') return viewProduct(p2);
    return viewList();
  } catch (e) {
    console.error(e);
    $app.innerHTML = `<div class="empty">เกิดข้อผิดพลาด: ${esc(errMsg(e))}<br><br><a class="btn" href="#/" onclick="location.reload()">โหลดใหม่</a></div>`;
  }
}
window.addEventListener('hashchange', render);

// ---------- setup screen (ยังไม่ได้ตั้งค่า Supabase) ----------
function viewSetup() {
  $app.innerHTML = `
  <div class="setup">
    <h1>⚙️ ยังไม่ได้ตั้งค่าระบบหลังบ้าน</h1>
    <p style="margin-bottom:14px">แอปนี้ใช้ Supabase (ฟรี) เก็บข้อมูลและระบบล็อกอิน ตั้งค่าครั้งเดียวตามนี้:</p>
    <ol>
      <li>สมัคร/ล็อกอินที่ <code>supabase.com</code> แล้วสร้างโปรเจกต์ใหม่ (Free)</li>
      <li>เข้าเมนู <b>SQL Editor</b> วางโค้ดจากไฟล์ <code>supabase/schema.sql</code> แล้วกด Run</li>
      <li>เมนู <b>Authentication → Sign In / Providers → Email</b> ปิด "Confirm email" (แนะนำ เพื่อให้สมัครแล้วใช้ได้ทันที)</li>
      <li>เมนู <b>Settings → API</b> คัดลอก Project URL และ anon public key</li>
      <li>นำ 2 ค่านั้นไปใส่ในไฟล์ <code>js/config.js</code> แล้วเปิดเว็บใหม่</li>
    </ol>
    <p style="margin-top:14px;color:#71717a">ดูคู่มือละเอียดพร้อมภาพรวมการติดตั้งได้ในไฟล์ SETUP.md</p>
  </div>`;
}

// ---------- login ----------
function viewLogin() {
  $app.innerHTML = `
  <div class="auth">
    <h1>📄 ใบเสนอราคา / ใบแจ้งหนี้</h1>
    <p>เข้าสู่ระบบเพื่อจัดการเอกสารของคุณ</p>
    <label class="f"><span>อีเมล</span><input id="email" type="email" autocomplete="email" inputmode="email"></label>
    <label class="f"><span>รหัสผ่าน</span><input id="pass" type="password" autocomplete="current-password"></label>
    <div class="msg" id="authmsg"></div>
    <button class="btn primary" id="signin">เข้าสู่ระบบ</button>
    <button class="btn" id="signup">สมัครสมาชิกใหม่</button>
  </div>`;
  const email = () => document.getElementById('email').value.trim();
  const pass = () => document.getElementById('pass').value;
  const msg = (t, ok) => {
    const m = document.getElementById('authmsg');
    m.textContent = t; m.className = 'msg show ' + (ok ? 'ok' : 'err');
  };
  document.getElementById('signin').onclick = async () => {
    if (!email() || !pass()) return msg('กรอกอีเมลและรหัสผ่านก่อน');
    const { error } = await sb.auth.signInWithPassword({ email: email(), password: pass() });
    if (error) return msg('เข้าสู่ระบบไม่สำเร็จ: ' + errMsg(error));
    session = null; location.hash = '#/'; render();
  };
  document.getElementById('signup').onclick = async () => {
    if (!email() || pass().length < 6) return msg('กรอกอีเมล และรหัสผ่านอย่างน้อย 6 ตัวอักษร');
    const { data, error } = await sb.auth.signUp({ email: email(), password: pass() });
    if (error) return msg('สมัครไม่สำเร็จ: ' + errMsg(error));
    if (data.session) { session = null; render(); }
    else msg('สมัครแล้ว! ตรวจอีเมลเพื่อกดยืนยัน แล้วกลับมาเข้าสู่ระบบ', true);
  };
}

// ---------- รายการเอกสาร ----------
async function viewList() {
  const { data: docs, error } = await sb.from('documents')
    .select('*').eq('doc_type', activeTab).order('created_at', { ascending: false });
  if (error) throw error;

  const q = searchText.trim().toLowerCase();
  const filtered = q
    ? docs.filter((d) => (d.doc_number || '').toLowerCase().includes(q) || ((d.customer || {}).name || '').toLowerCase().includes(q))
    : docs;

  $app.innerHTML = `
  <div class="topbar">
    <h1>เอกสาร</h1>
    <a class="iconbtn" href="#/settings" title="ตั้งค่า">⚙️</a>
  </div>
  <div class="tabs">
    <button data-t="QT" class="${activeTab === 'QT' ? 'active' : ''}">ใบเสนอราคา</button>
    <button data-t="INV" class="${activeTab === 'INV' ? 'active' : ''}">ใบแจ้งหนี้</button>
  </div>
  <div class="searchbox"><input id="search" type="search" placeholder="ค้นหาเลขที่ / ชื่อลูกค้า" value="${esc(searchText)}"></div>
  <div class="list">
    ${filtered.length ? filtered.map((d) => {
      const t = calcTotals(d);
      const st = (STATUS[d.doc_type] || {})[d.status] || d.status;
      const stCls = d.status === 'void' ? 'void' : (d.status === 'paid' || d.status === 'accepted') ? 'ok' : '';
      return `<a class="doc-card" href="#/edit/${d.id}">
        <div class="row1"><span class="num">${esc(d.doc_number)}</span><span class="total">${fmtMoney(t.payable)} ฿</span></div>
        <div class="row2"><span>${esc((d.customer || {}).name || '-')}</span><span>${fmtDate(d.issue_date)}</span></div>
        <div style="margin-top:6px"><span class="chip ${stCls}">${esc(st)}</span></div>
      </a>`;
    }).join('') : `<div class="empty">ยังไม่มี${TYPE_NAME[activeTab]}<br>กดปุ่ม "+ สร้าง" เพื่อเริ่มต้น</div>`}
  </div>
  <a class="fab" href="#/new/${activeTab}">+ สร้าง${TYPE_NAME[activeTab]}</a>`;

  $app.querySelectorAll('.tabs button').forEach((b) => b.onclick = () => { activeTab = b.dataset.t; render(); });
  const s = document.getElementById('search');
  s.oninput = () => { searchText = s.value; clearTimeout(s._t); s._t = setTimeout(render, 250); };
}

// ---------- สร้าง/แก้ไขเอกสาร ----------
async function viewEdit(id, newType) {
  let draft;
  if (id) {
    const { data, error } = await sb.from('documents').select('*').eq('id', id).single();
    if (error) throw error;
    draft = data;
  } else {
    const co = (cache.companies || [])[0] || {};
    draft = {
      doc_type: newType,
      doc_number: await nextNumber(newType, todayISO()),
      issue_date: todayISO(),
      due_date: null,
      company_id: co.id || null,
      customer_id: null,
      customer: { name: '', address: '', tax_id: '', phone: '', email: '' },
      items: [{ desc: '', qty: 1, unit: 'ชิ้น', price: 0 }],
      discount: 0, discount_type: 'amount',
      vat_percent: 0, wht_percent: 0,
      notes: co.default_notes || '', payment_terms: co.payment_terms || '', ref_note: '',
      status: 'draft', ref_doc_id: null,
    };
  }
  draft.customer = draft.customer || {};
  draft.items = Array.isArray(draft.items) && draft.items.length ? draft.items : [{ desc: '', qty: 1, unit: 'ชิ้น', price: 0 }];
  let saveToBook = !draft.customer_id;

  const statusOpts = STATUS[draft.doc_type];
  $app.innerHTML = `
  <div class="topbar">
    <a class="back" href="#/">‹ กลับ</a>
    <h1>${TYPE_NAME[draft.doc_type]}</h1>
  </div>

  <div class="card">
    <h2>ข้อมูลเอกสาร</h2>
    <div class="grid2">
      <label class="f"><span>เลขที่เอกสาร</span><input data-k="doc_number" value="${esc(draft.doc_number)}"></label>
      <label class="f"><span>สถานะ</span><select data-k="status">
        ${Object.entries(statusOpts).map(([k, v]) => `<option value="${k}" ${draft.status === k ? 'selected' : ''}>${v}</option>`).join('')}
      </select></label>
      <label class="f"><span>วันที่</span><input type="date" data-k="issue_date" value="${esc(draft.issue_date || '')}"></label>
      ${draft.doc_type === 'INV'
        ? `<label class="f"><span>ครบกำหนดชำระ</span><input type="date" data-k="due_date" value="${esc(draft.due_date || '')}"></label>`
        : '<div></div>'}
    </div>
    <label class="f"><span>ออกในนาม (บริษัท/ผู้ขาย)</span>
      <select id="companySel">
        ${(cache.companies || []).map((c) => `<option value="${c.id}" ${draft.company_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        ${(cache.companies || []).length ? '' : '<option value="">— ยังไม่มีข้อมูลบริษัท —</option>'}
      </select>
    </label>
    ${(cache.companies || []).length ? '' : '<div class="note">⚠️ ไปที่ ตั้งค่า › เพิ่มบริษัท ก่อน เพื่อให้หัวเอกสาร PDF สมบูรณ์</div>'}
  </div>

  <div class="card">
    <h2>ลูกค้า</h2>
    <label class="f"><span>เลือกจากสมุดลูกค้า</span>
      <select id="custSel">
        <option value="">— ลูกค้าใหม่ / พิมพ์เอง —</option>
        ${(cache.customers || []).map((c) => `<option value="${c.id}" ${draft.customer_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select>
    </label>
    <label class="f"><span>ชื่อลูกค้า</span><input data-c="name" value="${esc(draft.customer.name || '')}"></label>
    <label class="f"><span>ที่อยู่</span><textarea data-c="address">${esc(draft.customer.address || '')}</textarea></label>
    <div class="grid2">
      <label class="f"><span>เลขผู้เสียภาษี</span><input data-c="tax_id" inputmode="numeric" value="${esc(draft.customer.tax_id || '')}"></label>
      <label class="f"><span>เบอร์โทร</span><input data-c="phone" inputmode="tel" value="${esc(draft.customer.phone || '')}"></label>
    </div>
    <label class="f"><span>อีเมล</span><input data-c="email" inputmode="email" value="${esc(draft.customer.email || '')}"></label>
    <label class="checkline"><input type="checkbox" id="saveBook" ${saveToBook ? 'checked' : ''}> บันทึก/อัปเดตลงสมุดลูกค้า</label>
  </div>

  <div class="card">
    <h2>รายการ</h2>
    <div id="items"></div>
    <button class="btn" id="addItem">+ เพิ่มรายการ</button>
    <datalist id="prodList">
      ${(cache.products || []).map((p) => `<option value="${esc(p.name)}"></option>`).join('')}
    </datalist>
  </div>

  <div class="card">
    <h2>ส่วนลด / ภาษี</h2>
    <div class="grid2">
      <label class="f"><span>ส่วนลด</span><input type="number" inputmode="decimal" min="0" data-k="discount" value="${draft.discount || 0}"></label>
      <label class="f"><span>หน่วยส่วนลด</span><select data-k="discount_type">
        <option value="amount" ${draft.discount_type !== 'percent' ? 'selected' : ''}>บาท</option>
        <option value="percent" ${draft.discount_type === 'percent' ? 'selected' : ''}>%</option>
      </select></label>
      <label class="f"><span>ภาษีมูลค่าเพิ่ม (VAT)</span><select data-k="vat_percent">
        <option value="0" ${!Number(draft.vat_percent) ? 'selected' : ''}>ไม่คิด VAT</option>
        <option value="7" ${Number(draft.vat_percent) === 7 ? 'selected' : ''}>7%</option>
      </select></label>
      <label class="f"><span>หัก ณ ที่จ่าย</span><select data-k="wht_percent">
        ${[0, 1, 2, 3, 5].map((p) => `<option value="${p}" ${Number(draft.wht_percent) === p ? 'selected' : ''}>${p ? p + '%' : 'ไม่หัก'}</option>`).join('')}
      </select></label>
    </div>
    <div class="totals" id="totals"></div>
  </div>

  <div class="card">
    <h2>หมายเหตุ / เงื่อนไข</h2>
    <label class="f"><span>หมายเหตุ (ขึ้นบรรทัดใหม่ = 1 ข้อ)</span><textarea data-k="notes" style="min-height:110px">${esc(draft.notes || '')}</textarea></label>
    <label class="f"><span>เงื่อนไขชำระเงิน (แสดงเด่นท้ายเอกสาร)</span><input data-k="payment_terms" value="${esc(draft.payment_terms || '')}"></label>
    <label class="f"><span>โน้ตอ้างอิง (ตัวแดงเล็ก เช่น เลขที่เอกสารที่เกี่ยวข้อง)</span><input data-k="ref_note" value="${esc(draft.ref_note || '')}"></label>
  </div>

  <div class="btnbar">
    <button class="btn primary" id="save">💾 บันทึก</button>
    <button class="btn" id="pdf">⬇️ ดาวน์โหลด PDF</button>
    <button class="btn" id="share" hidden>📤 แชร์ PDF (LINE / อีเมล)</button>
    ${draft.doc_type === 'QT' ? '<button class="btn" id="toInv">🧾 แปลงเป็นใบแจ้งหนี้</button>' : ''}
    ${draft.ref_doc_id ? `<a class="btn" href="#/edit/${draft.ref_doc_id}">📎 เปิดใบเสนอราคาต้นทาง</a>` : ''}
    ${id ? '<button class="btn danger" id="del">ลบเอกสาร</button>' : ''}
  </div>`;

  if (navigator.canShare) document.getElementById('share').hidden = false;

  // ---- bindings ----
  $app.querySelectorAll('[data-k]').forEach((el) => {
    el.addEventListener('input', () => {
      let v = el.value;
      if (el.dataset.k === 'discount' || el.dataset.k === 'vat_percent' || el.dataset.k === 'wht_percent') v = Number(v) || 0;
      if ((el.dataset.k === 'due_date' || el.dataset.k === 'issue_date') && !v) v = null;
      draft[el.dataset.k] = v;
      updateTotals();
    });
  });
  $app.querySelectorAll('[data-c]').forEach((el) => {
    el.addEventListener('input', () => { draft.customer[el.dataset.c] = el.value; });
  });
  document.getElementById('companySel').onchange = (e) => { draft.company_id = e.target.value || null; };
  document.getElementById('custSel').onchange = (e) => {
    const c = (cache.customers || []).find((x) => x.id === e.target.value);
    draft.customer_id = c ? c.id : null;
    if (c) {
      draft.customer = { name: c.name || '', address: c.address || '', tax_id: c.tax_id || '', phone: c.phone || '', email: c.email || '' };
      $app.querySelectorAll('[data-c]').forEach((el) => { el.value = draft.customer[el.dataset.c] || ''; });
    }
  };
  document.getElementById('saveBook').onchange = (e) => { saveToBook = e.target.checked; };

  // ---- items ----
  const $items = document.getElementById('items');
  function renderItems() {
    $items.innerHTML = draft.items.map((it, i) => `
      <div class="item-row">
        <div class="top">
          <input placeholder="รายละเอียดสินค้า/บริการ" list="prodList" data-i="${i}" data-f="desc" value="${esc(it.desc)}">
          <button class="del" data-del="${i}" title="ลบรายการ">✕</button>
        </div>
        <div class="nums">
          <label class="f"><span>จำนวน</span><input type="number" inputmode="decimal" min="0" data-i="${i}" data-f="qty" value="${it.qty}"></label>
          <label class="f"><span>หน่วย</span><input data-i="${i}" data-f="unit" value="${esc(it.unit || '')}"></label>
          <label class="f"><span>ราคา/หน่วย</span><input type="number" inputmode="decimal" min="0" step="0.01" data-i="${i}" data-f="price" value="${it.price}"></label>
          <div class="lt">รวม ${fmtMoney((Number(it.qty) || 0) * (Number(it.price) || 0))} ฿</div>
        </div>
      </div>`).join('');
    $items.querySelectorAll('input').forEach((el) => {
      el.addEventListener('input', () => {
        const it = draft.items[Number(el.dataset.i)];
        it[el.dataset.f] = (el.dataset.f === 'qty' || el.dataset.f === 'price') ? (Number(el.value) || 0) : el.value;
        if (el.dataset.f === 'desc') {
          const p = (cache.products || []).find((x) => x.name === el.value);
          if (p) {
            it.unit = p.unit || it.unit; it.price = Number(p.price) || 0;
            renderItems();
          }
        }
        el.closest('.item-row').querySelector('.lt').textContent = `รวม ${fmtMoney((Number(it.qty) || 0) * (Number(it.price) || 0))} ฿`;
        updateTotals();
      });
    });
    $items.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = () => { draft.items.splice(Number(b.dataset.del), 1); if (!draft.items.length) draft.items.push({ desc: '', qty: 1, unit: 'ชิ้น', price: 0 }); renderItems(); updateTotals(); };
    });
  }
  document.getElementById('addItem').onclick = () => {
    const lastUnit = draft.items[draft.items.length - 1]?.unit || 'ชิ้น';
    draft.items.push({ desc: '', qty: 1, unit: lastUnit, price: 0 });
    renderItems();
    $items.querySelector(`[data-i="${draft.items.length - 1}"][data-f="desc"]`)?.focus();
  };
  renderItems();

  function updateTotals() {
    const t = calcTotals(draft);
    const row = (k, v, cls = '') => `<div class="trow ${cls}"><span>${k}</span><span>${fmtMoney(v)} ฿</span></div>`;
    let html = row('รวมเป็นเงิน', t.subtotal);
    if (t.discountAmt > 0) html += row('ส่วนลด', -t.discountAmt) + row('ยอดหลังหักส่วนลด', t.afterDisc);
    if (Number(draft.vat_percent) > 0) html += row(`VAT ${draft.vat_percent}%`, t.vatAmt);
    if (Number(draft.wht_percent) > 0) html += row(`หัก ณ ที่จ่าย ${draft.wht_percent}%`, -t.whtAmt);
    html += row('ยอดชำระ', t.payable, 'grand');
    document.getElementById('totals').innerHTML = html;
  }
  updateTotals();

  // ---- actions ----
  async function doSave(silent = false) {
    if (!draft.doc_number.trim()) { toast('กรอกเลขที่เอกสารก่อน', true); return null; }
    draft.items = draft.items.filter((it) => (it.desc || '').trim() || Number(it.price));
    if (!draft.items.length) draft.items.push({ desc: '', qty: 1, unit: 'ชิ้น', price: 0 });

    if (saveToBook && (draft.customer.name || '').trim()) {
      const payload = { ...draft.customer };
      if (draft.customer_id) {
        const { error } = await sb.from('customers').update(payload).eq('id', draft.customer_id);
        if (error) { toast(errMsg(error), true); return null; }
      } else {
        const { data, error } = await sb.from('customers').insert(payload).select().single();
        if (error) { toast(errMsg(error), true); return null; }
        draft.customer_id = data.id;
      }
      await loadMasters(true);
    }

    const co = (cache.companies || []).find((c) => c.id === draft.company_id);
    const row = {
      doc_type: draft.doc_type, doc_number: draft.doc_number.trim(),
      issue_date: draft.issue_date || todayISO(), due_date: draft.due_date || null,
      company_id: draft.company_id, customer_id: draft.customer_id,
      customer: draft.customer,
      company: co ? { name: co.name, address: co.address, tax_id: co.tax_id, phone: co.phone, email: co.email, seller_name: co.seller_name } : (draft.company || null),
      items: draft.items, discount: Number(draft.discount) || 0, discount_type: draft.discount_type,
      vat_percent: Number(draft.vat_percent) || 0, wht_percent: Number(draft.wht_percent) || 0,
      notes: draft.notes || '', payment_terms: draft.payment_terms || '', ref_note: draft.ref_note || '',
      status: draft.status, ref_doc_id: draft.ref_doc_id || null,
      updated_at: new Date().toISOString(),
    };
    if (id) {
      const { error } = await sb.from('documents').update(row).eq('id', id);
      if (error) { toast(errMsg(error), true); return null; }
    } else {
      const { data, error } = await sb.from('documents').insert(row).select().single();
      if (error) { toast(errMsg(error), true); return null; }
      id = data.id;
      history.replaceState(null, '', '#/edit/' + id);
    }
    if (!silent) toast('บันทึกแล้ว ✓');
    return id;
  }

  document.getElementById('save').onclick = () => doSave();
  document.getElementById('pdf').onclick = async (e) => {
    e.target.disabled = true;
    try {
      if (await doSave(true)) {
        await downloadPdf(draft, companyForPdf(draft));
        toast('สร้าง PDF แล้ว ✓');
      }
    } catch (err) { toast('สร้าง PDF ไม่สำเร็จ: ' + errMsg(err), true); }
    e.target.disabled = false;
  };
  document.getElementById('share').onclick = async (e) => {
    e.target.disabled = true;
    try {
      if (await doSave(true)) {
        const ok = await sharePdf(draft, companyForPdf(draft));
        if (!ok) { await downloadPdf(draft, companyForPdf(draft)); toast('เครื่องนี้แชร์ไฟล์ไม่ได้ ดาวน์โหลดแทนแล้ว'); }
      }
    } catch (err) { if (err.name !== 'AbortError') toast('แชร์ไม่สำเร็จ: ' + errMsg(err), true); }
    e.target.disabled = false;
  };
  const toInvBtn = document.getElementById('toInv');
  if (toInvBtn) toInvBtn.onclick = async () => {
    if (!(await doSave(true))) return;
    toInvBtn.disabled = true;
    try {
      const number = await nextNumber('INV', todayISO());
      const co = (cache.companies || []).find((c) => c.id === draft.company_id);
      const { data, error } = await sb.from('documents').insert({
        doc_type: 'INV', doc_number: number, issue_date: todayISO(), due_date: null,
        company_id: draft.company_id, customer_id: draft.customer_id,
        customer: draft.customer,
        company: co ? { name: co.name, address: co.address, tax_id: co.tax_id, phone: co.phone, email: co.email, seller_name: co.seller_name } : null,
        items: draft.items, discount: draft.discount, discount_type: draft.discount_type,
        vat_percent: draft.vat_percent, wht_percent: draft.wht_percent,
        notes: draft.notes, payment_terms: draft.payment_terms,
        ref_note: `${draft.doc_number} (${fmtDate(draft.issue_date)})`,
        status: 'draft', ref_doc_id: id,
      }).select().single();
      if (error) throw error;
      toast('สร้างใบแจ้งหนี้แล้ว ✓');
      location.hash = '#/edit/' + data.id;
    } catch (err) { toast(errMsg(err), true); toInvBtn.disabled = false; }
  };
  const delBtn = document.getElementById('del');
  if (delBtn) delBtn.onclick = async () => {
    if (!confirm(`ลบ ${draft.doc_number} ?`)) return;
    const { error } = await sb.from('documents').delete().eq('id', id);
    if (error) return toast(errMsg(error), true);
    activeTab = draft.doc_type;
    location.hash = '#/';
  };
}

// ---------- ตั้งค่า ----------
function viewSettings() {
  const rows = (arr, route, sub) => arr.length
    ? arr.map((x) => `<a class="srow" href="#/${route}/${x.id}"><span>${esc(x.name)}${sub ? `<div class="sub">${esc(sub(x))}</div>` : ''}</span><span class="arr">›</span></a>`).join('')
    : '<div class="note">ยังไม่มีข้อมูล</div>';
  $app.innerHTML = `
  <div class="topbar"><a class="back" href="#/">‹ กลับ</a><h1>ตั้งค่า</h1></div>
  <div class="card"><h2>บริษัท / ผู้ออกเอกสาร</h2>
    ${rows(cache.companies || [], 'company')}
    <a class="addlink" href="#/company/new">+ เพิ่มบริษัท</a>
  </div>
  <div class="card"><h2>สมุดลูกค้า</h2>
    ${rows(cache.customers || [], 'customer')}
    <a class="addlink" href="#/customer/new">+ เพิ่มลูกค้า</a>
  </div>
  <div class="card"><h2>สมุดสินค้า / บริการ</h2>
    ${rows(cache.products || [], 'product', (p) => `${fmtMoney(p.price)} ฿ / ${p.unit || '-'}`)}
    <a class="addlink" href="#/product/new">+ เพิ่มสินค้า</a>
  </div>
  <div class="card">
    <div class="note" style="margin-bottom:10px">เข้าสู่ระบบด้วย: ${esc(session.user?.email || '')}</div>
    <button class="btn danger" id="logout">ออกจากระบบ</button>
  </div>`;
  document.getElementById('logout').onclick = async () => {
    await sb.auth.signOut();
    session = false; cache = { companies: null, customers: null, products: null };
    location.hash = '#/'; render();
  };
}

// ---------- ฟอร์มบริษัท ----------
async function viewCompany(idOrNew) {
  const isNew = idOrNew === 'new';
  const c = isNew ? {} : (cache.companies || []).find((x) => x.id === idOrNew) || {};
  const draft = { ...c };

  const imgSlot = (key, label) => `
    <div class="imgslot">
      <div class="box" id="box_${key}">
        ${draft[key] ? `<img src="${draft[key]}"><button class="rm" data-rm="${key}">✕</button>` : `<span style="color:#a1a1aa;font-size:13px">แตะเพื่อเลือก</span>`}
      </div>
      <div class="cap">${label}</div>
      <input type="file" accept="image/*" id="file_${key}" hidden>
    </div>`;

  $app.innerHTML = `
  <div class="topbar"><a class="back" href="#/settings">‹ กลับ</a><h1>${isNew ? 'เพิ่มบริษัท' : 'แก้ไขบริษัท'}</h1></div>
  <div class="card">
    <label class="f"><span>ชื่อบริษัท / ชื่อผู้ขาย *</span><input data-k="name" value="${esc(draft.name || '')}"></label>
    <label class="f"><span>ที่อยู่ (ขึ้นบรรทัดใหม่ได้)</span><textarea data-k="address">${esc(draft.address || '')}</textarea></label>
    <div class="grid2">
      <label class="f"><span>เลขผู้เสียภาษี</span><input data-k="tax_id" value="${esc(draft.tax_id || '')}"></label>
      <label class="f"><span>เบอร์โทร</span><input data-k="phone" inputmode="tel" value="${esc(draft.phone || '')}"></label>
    </div>
    <div class="grid2">
      <label class="f"><span>อีเมล</span><input data-k="email" inputmode="email" value="${esc(draft.email || '')}"></label>
      <label class="f"><span>ชื่อผู้ขาย/พนักงานขาย (โชว์หัวเอกสาร)</span><input data-k="seller_name" value="${esc(draft.seller_name || '')}"></label>
    </div>
  </div>
  <div class="card"><h2>บัญชีรับเงิน (โชว์ในใบแจ้งหนี้)</h2>
    <label class="f"><span>ธนาคาร</span><input data-k="bank_name" placeholder="เช่น ไทยพาณิชย์ (SCB)" value="${esc(draft.bank_name || '')}"></label>
    <div class="grid2">
      <label class="f"><span>ชื่อบัญชี</span><input data-k="bank_account_name" value="${esc(draft.bank_account_name || '')}"></label>
      <label class="f"><span>เลขที่บัญชี</span><input data-k="bank_account_no" value="${esc(draft.bank_account_no || '')}"></label>
    </div>
  </div>
  <div class="card"><h2>รูปภาพบนเอกสาร</h2>
    <div class="imgset">
      ${imgSlot('logo', 'โลโก้')}
      ${imgSlot('signature', 'ลายเซ็น')}
      ${imgSlot('stamp', 'ตราประทับ')}
    </div>
    <div class="note">แนะนำ: ลายเซ็น/ตราประทับเป็นรูปพื้นหลังโปร่งใส (PNG) จะสวยที่สุด</div>
  </div>
  <div class="card"><h2>ค่าเริ่มต้นเอกสารใหม่</h2>
    <label class="f"><span>หมายเหตุมาตรฐาน (เติมให้อัตโนมัติ)</span><textarea data-k="default_notes" style="min-height:110px">${esc(draft.default_notes || '')}</textarea></label>
    <label class="f"><span>เงื่อนไขชำระเงินมาตรฐาน</span><input data-k="payment_terms" placeholder="เช่น ระยะเวลาชำระเงิน(วางบิล) 7-15 วัน นับตั้งแต่ออกใบเสนอราคา" value="${esc(draft.payment_terms || '')}"></label>
    <div class="grid2">
      <label class="f"><span>ป้ายช่องเซ็นซ้าย</span><input data-k="signer_left" placeholder="Customer" value="${esc(draft.signer_left || '')}"></label>
      <label class="f"><span>ป้ายช่องเซ็นขวา (ฝั่งเรา)</span><input data-k="signer_right" placeholder="Designer" value="${esc(draft.signer_right || '')}"></label>
    </div>
  </div>
  <div class="btnbar">
    <button class="btn primary" id="save">💾 บันทึก</button>
    ${isNew ? '' : '<button class="btn danger" id="del">ลบบริษัทนี้</button>'}
  </div>`;

  $app.querySelectorAll('[data-k]').forEach((el) => el.addEventListener('input', () => { draft[el.dataset.k] = el.value; }));

  ['logo', 'signature', 'stamp'].forEach((key) => {
    const box = document.getElementById('box_' + key);
    const file = document.getElementById('file_' + key);
    box.onclick = (e) => { if (!e.target.dataset.rm) file.click(); };
    file.onchange = async () => {
      if (!file.files[0]) return;
      try {
        draft[key] = await resizeImage(file.files[0], key === 'logo' ? 500 : 600);
        box.innerHTML = `<img src="${draft[key]}"><button class="rm" data-rm="${key}">✕</button>`;
        bindRm();
      } catch (err) { toast(errMsg(err), true); }
    };
  });
  function bindRm() {
    $app.querySelectorAll('[data-rm]').forEach((b) => b.onclick = (e) => {
      e.stopPropagation();
      const key = b.dataset.rm;
      draft[key] = null;
      document.getElementById('box_' + key).innerHTML = '<span style="color:#a1a1aa;font-size:13px">แตะเพื่อเลือก</span>';
    });
  }
  bindRm();

  document.getElementById('save').onclick = async () => {
    if (!(draft.name || '').trim()) return toast('กรอกชื่อบริษัทก่อน', true);
    const { id, user_id, created_at, ...payload } = draft;
    const q = isNew ? sb.from('companies').insert(payload) : sb.from('companies').update(payload).eq('id', c.id);
    const { error } = await q;
    if (error) return toast(errMsg(error), true);
    await loadMasters(true);
    toast('บันทึกแล้ว ✓');
    location.hash = '#/settings';
  };
  const del = document.getElementById('del');
  if (del) del.onclick = async () => {
    if (!confirm(`ลบ "${c.name}" ? เอกสารเดิมจะยังอยู่ แต่จะไม่มีโลโก้/ลายเซ็นให้ใช้ตอนออก PDF ซ้ำ`)) return;
    const { error } = await sb.from('companies').delete().eq('id', c.id);
    if (error) return toast(errMsg(error), true);
    await loadMasters(true);
    location.hash = '#/settings';
  };
}

// ---------- ฟอร์มลูกค้า / สินค้า ----------
async function viewCustomer(idOrNew) {
  simpleForm({
    idOrNew, table: 'customers', backTo: '#/settings', title: 'ลูกค้า',
    list: cache.customers,
    fields: [
      ['name', 'ชื่อลูกค้า *', 'input'],
      ['address', 'ที่อยู่', 'textarea'],
      ['tax_id', 'เลขผู้เสียภาษี', 'input'],
      ['phone', 'เบอร์โทร', 'input'],
      ['email', 'อีเมล', 'input'],
    ],
  });
}
async function viewProduct(idOrNew) {
  simpleForm({
    idOrNew, table: 'products', backTo: '#/settings', title: 'สินค้า/บริการ',
    list: cache.products,
    fields: [
      ['name', 'ชื่อสินค้า/บริการ *', 'input'],
      ['unit', 'หน่วย (เช่น ชิ้น, งาน, ชม.)', 'input'],
      ['price', 'ราคาต่อหน่วย (บาท)', 'number'],
    ],
  });
}
function simpleForm({ idOrNew, table, backTo, title, list, fields }) {
  const isNew = idOrNew === 'new';
  const rec = isNew ? {} : (list || []).find((x) => x.id === idOrNew) || {};
  const draft = { ...rec };
  $app.innerHTML = `
  <div class="topbar"><a class="back" href="${backTo}">‹ กลับ</a><h1>${isNew ? 'เพิ่ม' : 'แก้ไข'}${title}</h1></div>
  <div class="card">
    ${fields.map(([k, label, kind]) => kind === 'textarea'
      ? `<label class="f"><span>${label}</span><textarea data-k="${k}">${esc(draft[k] || '')}</textarea></label>`
      : `<label class="f"><span>${label}</span><input ${kind === 'number' ? 'type="number" inputmode="decimal" step="0.01"' : ''} data-k="${k}" value="${esc(draft[k] ?? '')}"></label>`
    ).join('')}
  </div>
  <div class="btnbar">
    <button class="btn primary" id="save">💾 บันทึก</button>
    ${isNew ? '' : '<button class="btn danger" id="del">ลบ</button>'}
  </div>`;
  $app.querySelectorAll('[data-k]').forEach((el) => el.addEventListener('input', () => {
    draft[el.dataset.k] = el.type === 'number' ? (Number(el.value) || 0) : el.value;
  }));
  document.getElementById('save').onclick = async () => {
    if (!(draft.name || '').trim()) return toast('กรอกชื่อก่อน', true);
    const { id, user_id, created_at, ...payload } = draft;
    const q = isNew ? sb.from(table).insert(payload) : sb.from(table).update(payload).eq('id', rec.id);
    const { error } = await q;
    if (error) return toast(errMsg(error), true);
    await loadMasters(true);
    toast('บันทึกแล้ว ✓');
    location.hash = backTo;
  };
  const del = document.getElementById('del');
  if (del) del.onclick = async () => {
    if (!confirm(`ลบ "${rec.name}" ?`)) return;
    const { error } = await sb.from(table).delete().eq('id', rec.id);
    if (error) return toast(errMsg(error), true);
    await loadMasters(true);
    location.hash = backTo;
  };
}

// ---------- start ----------
if (sb) {
  sb.auth.onAuthStateChange((_event, s) => {
    const was = !!(session && session.user);
    const now = !!(s && s.user);
    if (was !== now) { session = s || false; render(); }
    else if (s) session = s;
  });
}
render();
