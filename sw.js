"use strict";

var SW_VER = 'SW0021';

self.oninstall = event => {
	console.log(SW_VER + ': oninstall');
	event.waitUntil(caches.open(SW_VER)
		.then(cache => {
				return cache.addAll([
					'index.html',
					'index.js',
					'sw.js',
				]);
		})
	);
}

self.onactivate = event => {
	console.log(SW_VER + ': onactivate');
	event.waitUntil(caches.keys()
		.then(keys => {
			return Promise.all(keys.map(key => {
				if (key != SW_VER) return caches.delete(key);
			}));
		})
		.then(() => {
			return self.clients.claim();
		})
	);
}

self.onfetch = event => {
	console.log(SW_VER + ': onfetch = ' + event.request.url);
	event.respondWith(caches.match(event.request)
		.then(cached => cached || fetch(event.request))
	);
}

self.onmessage = event => {
	console.log(SW_VER + ': onmessage = ' + event.data);
	if (event.data === 'skip-waiting') return skipWaiting();
}
