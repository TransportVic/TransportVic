const version = "0.0.2";
const cacheName = `transportvic-${version}`;

function cacheFiles(files) {
    return caches.open(cacheName).then(cache => {
        return cache.addAll(files).then(() => self.skipWaiting())
            .catch(e => {
                console.error(e);
                return '';
            });
    });
}

self.addEventListener('install', e => {
    const timeStamp = Date.now();

    caches.keys().then(function (cachesNames) {
        return Promise.all(cachesNames.map((storedCacheName) => {
            if (storedCacheName === cacheName || !storedCacheName.startsWith('transportvic')) return Promise.resolve();
            return caches.delete(storedCacheName).then(() => {
                console.log("Old cache " + storedCacheName + " deleted");
            });
        }))
    });

    e.waitUntil(
        cacheFiles([
            '/static/css/bus/operator-colours.css',
            '/static/css/bus/timings.css',

            '/static/css/metro/line-colours.css',
            '/static/css/metro/timings.css',

            '/static/css/tram/service-colours.css',
            '/static/css/tram/timings.css',

            '/static/css/about.css',
            '/static/css/error.css',
            '/static/css/index.css',
            '/static/css/loading.css',
            '/static/css/pt-stops-nearby.css',
            '/static/css/runs.css',
            '/static/css/search.css',
            '/static/css/search-info.css',
            '/static/css/style.css',

            '/static/scripts/bus/timings.js',

            '/static/scripts/bookmark-helper.js',
            '/static/scripts/bookmark-toggle.js',
            '/static/scripts/bookmarks.js',
            '/static/scripts/helper.js',
            '/static/scripts/metro-timings.js',
            '/static/scripts/pt-stops-nearby.js',
            '/static/scripts/run.js',
            '/static/scripts/search.js',
            '/static/scripts/sw-load.js',

            '/static/images/bookmark/empty.svg',
            '/static/images/bookmark/filled.svg',

            '/static/images/home/about.svg',
            '/static/images/home/button.svg',
            '/static/images/home/nearby.svg',
            '/static/images/home/search.svg',
            '/static/images/home/smartbus.svg',

            '/static/images/bus-icon.svg',
            '/static/images/bus-stop.svg',
            '/static/images/magnifying-glass.svg',
            '/static/images/metro-icon.svg',
            '/static/images/tram-icon.svg',

            '/static/images/favicon/favicon192.png',
            '/static/images/favicon/favicon512.png',

            '/static/fonts/bree-serif.otf',

            '/',
            '/bookmarks',
            '/nearby',
            '/search'
        ])
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
    if (event.request.method != 'GET') return;

    event.respondWith(
        caches.open(cacheName)
        .then(cache => cache.match(event.request, {ignoreSearch: true}))
        .then(response => {
            return response || fetch(event.request);
        })
    );
});
