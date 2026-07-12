// Service worker: ทำให้เปิดแอปเร็วและใช้งานออฟไลน์ได้ (ยกเว้นการอ่าน/บันทึกข้อมูลซึ่งต้องต่อเน็ต)
const CACHE = 'quotation-v2';
const ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/pdf.js',
  'js/utils.js',
  'js/config.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];
// โดเมนภายนอกที่แคชได้ (ไลบรารี + ฟอนต์ pin เวอร์ชัน) — ข้อมูล Supabase ไม่แคช
const CACHEABLE_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  if (!sameOrigin && !CACHEABLE_HOSTS.includes(url.hostname)) return; // เช่น Supabase → ผ่านตรง

  // stale-while-revalidate: ตอบจากแคชทันที แล้วอัปเดตแคชเบื้องหลัง
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const fetched = fetch(req).then((resp) => {
        if (resp && resp.ok) cache.put(req, resp.clone());
        return resp;
      }).catch(() => null);
      if (cached) { fetched.catch(() => {}); return cached; }
      const resp = await fetched;
      if (resp) return resp;
      // ออฟไลน์และไม่มีแคช: ถ้าเป็นการเปิดหน้า ให้ตอบด้วยหน้าแอป
      if (req.mode === 'navigate') return cache.match('./index.html');
      return Response.error();
    })
  );
});
