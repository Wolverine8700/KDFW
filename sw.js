// કોમલ ડેરી ફાર્મ - service worker (v2): ઍપ ઑફલાઇન પણ ખુલે
const CACHE = 'komal-v2';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'icon-512.png'];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    // Google Sheet (ક્લાઉડ ડેટા) ક્યારેય cache નહીં
    if (url.hostname.endsWith('script.google.com') || url.hostname.endsWith('googleusercontent.com')) return;

    // પેજ: પહેલા નેટથી (નવું વર્ઝન), ઑફલાઇન હોય તો cache માંથી
    if (req.mode === 'navigate') {
        e.respondWith(
            fetch(req).then(res => {
                const copy = res.clone();
                caches.open(CACHE).then(c => c.put('index.html', copy));
                return res;
            }).catch(() => caches.match('index.html').then(r => r || caches.match('./')))
        );
        return;
    }

    // બાકી (ફોન્ટ, Tailwind, આઇકન, html2canvas): cache પહેલા, સાથે અપડેટ
    e.respondWith(
        caches.match(req).then(hit => {
            const net = fetch(req).then(res => {
                if (res && (res.ok || res.type === 'opaque')) {
                    const copy = res.clone();
                    caches.open(CACHE).then(c => c.put(req, copy));
                }
                return res;
            }).catch(() => hit);
            return hit || net;
        })
    );
});
