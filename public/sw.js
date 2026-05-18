self.addEventListener('install', e => e.waitUntil(
  caches.open('lonekollen-v2').then(c => c.addAll(['/','index.html']))
));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(
    keys.filter(k => k !== 'lonekollen-v2').map(k => caches.delete(k))
  ))
));
self.addEventListener('fetch', e => e.respondWith(
  caches.match(e.request).then(r => r || fetch(e.request))
));
