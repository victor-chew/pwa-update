# PWA Update Demo

This is a simple demo to illustrate the concept of a PWA (Progressive Web App) and explore how to update the PWA when a new version becomes available. There are far more complex tutorials that I had to plough through before I developed a better understanding of what's going on, so I will try to make this as brief and simple as possible.

## How to run
Copy the 3 files (`index.html`, `index.js` and `sw.js`) into the root of a local web server and browse to http://localhsot/index.html.

All 3 files have a version number that should be updated together. The HTML and JS versions are visually displayed on the web page itself. The service worker version can be viewed in the console log.

# Expected output

When you first load the PWA, you will see the HTML and JS version displayed on the page. If you look into the console log, you will also see the version number of the service worker as it outputs console messages.

When you update the version number (eg. from `0001` to `0002`) and click *Refresh*, you get a confirmation prompt telling you a new version is available and whether you would like to update. If you click *OK*, the page will reload and you will see the new version numbers. If you click *Cancel*, you will continue to run the old version of the app (i.e. no change to the version numbers displayed).

## First things first: PWA is not a website!

It is far less accurate to think of PWA as a website than to think of it as an EXE (on Windows) or APK (on Android). It is a snapshot of the HTML, JS, CSS and other files that make up a version of the PWA. It is akin to linking OBJ files together to form the final EXE.

At the heart of a PWA is the [Service Worker](https://developers.google.com/web/fundamentals/primers/service-workers/). During the "install" event, the service worker caches all the required files into a private cache, and that becomes a snapshot of the PWA that is run in the browser.

```javascript
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
```
In the general case, when the browser requests for these files, they should be returned from the cache instead of from the network. This is because there are interdependencies between these files, and we do not want to be running a newer version of `index.html` with an older version of `index.js`, which might break the app.

## Obstacles in updating the PWA

Unlike a normal website, clicking on the browser *Refresh* button does not automatically load the latest and greatest version of your PWA from the server. This conundrum is widely documented [here](https://redfin.engineering/service-workers-break-the-browsers-refresh-button-by-default-here-s-why-56f9417694) and elsewhere.

When the *Refresh* button is clicked, the browser does check for a new version of `sw.js`. If one is found, it is downloaded and installed, but because the older version of `sw.js` is still running, it goes into the *waiting* state and does not take over until the old version stops running. This will only happen when the user shuts down all instances of your PWA, which is inconvenient and cumbersome.

# One approach to solving the problem

Since the browser does not currently take care of this issue for us automatically, we have to code our way out. 

The current approach adopted by many is this:

- When a new service worker is installed, display a prompt to the user. The prompt basically says that a new version of the PWA is available, and to click on a button to update.

- Once we have the consent of the user, we send a private message to the service worker, which use the `skipWaiting()` call to force the browser to stop the old service worker and activate the new one.

- When we detect that the new service worker is activated, we reload the page to run the new version of the PWA (from files in the new cache). 

# Step-by-step breakdown

`index.html` is loaded. `index.js` is loaded. `window.onload()` is called.
 
`navigator.serviceWorker.register()` is called to register the service worker. New `sw.js` is loaded by the browser and installed.

If an existing service worker is not present i.e this is the first time user is running our PWA, we don't have to do anything.

```javascript
if (navigator.serviceWorker.controller === null) return;
```

Otherwise, we use the `updatefound` event to detect the presence of a new service worker. This will not be fired if there is no change to `sw.js` (so user will not be prompted to updated every time page is reloaded if `sw.js` did not change).

```javascript
reg.onupdatefound = () => {
  if (reg.installing) {
    reg.installing.onstatechange = event => {
	  switch(event.target.state) {
	    case 'installed': confirmUpdate(reg); break;
		case 'activated':	window.location.reload(); break;
	  }
    }
  }
}
```

In the `updatefound` event handler, we check wait for the new service worker to be installed via `reg.installing`. Once `reg.installing` becomes available, we listen for its `statechange` event. We are only interested in the `installed` and `activated` states.

When `installed` state is detected (new service worker has been successfully installed, all new files cached, now in *waiting* state), we fire up a prompt that tells the user a new version if available and asks for permission to update.

```javascript
	if (confirm('New version available. Update?')) {
		reg.waiting.postMessage('skip-waiting')
	}
```

After we get confirmation, we post a message to `reg.waiting`

```javascript
self.onmessage = event => {
	if (event.data === 'skip-waiting') return skipWaiting();
}
```
The new service worker receives the `skip-waiting` message and calls `skipWaiting()` on itself, which prompts the browser to kill the old service worker and activate this one.

Once the new service worker is activated, the browser sends an event to `reg.installing.onstatechange` with the `activated` state. It is at this point that we call `window.location.reload()` to reload the page. This will cause the browser to get new cached files from the new service worker, which loads the new version of our PWA.

There is an extra line that has not been accounted for, which is:

```javascript
if (reg.waiting) confirmUpdate(reg);
```

This comes in handy after the `installed` state is first received in `reg.installing.onstatechange` , and he confirmation prompt is  displayed to the user. If the user cancels the prompt and subsequently reloads the page, the `installed` message is never sent again (because the new service worker has already been installed, and there is no change to `sw.js`). If we do not check at this point for a service worker waiting to be activated, the user will not get another chance to update the PWA!

# Displaying version information in upgrade message

The message that we show in ```confirmUpdate()``` is a generic one. I thought it would be a nice touch to let the user know in the message what is the new version he would be upgrading to eg. *"V1.10 is  available. Update?"*

We cannot simply rely on changing the version number in ```confirmUpdate()```, since the event is actually sent to the *previous* version of ```index.js```! Hence we need to ask the new service worker for its version number by posting a message:

```javascript
function getWorkerVersion(worker) {
	return new Promise((resolve, reject) => {
		var channel = new MessageChannel();
		channel.port1.onmessage = event => {
			if (!event.data.error) resolve(event.data); else reject(event.data.error);
		};
		worker.postMessage('get-version', [ channel.port2 ]);
	});
}
```

and letting the service worker return that info over a [MessageChannel](https://developer.mozilla.org/en-US/docs/Web/API/MessageChannel).
 
 ```javascript
    if (event.data === 'get-version') return event.ports[0].postMessage(SW_VER);
```

Our enhanced ```confirmUpdate()``` now looks like this:

```javascript
function confirmUpdate(reg) {
	getWorkerVersion(reg.waiting).then(newVer => {
		if (confirm('New version ' + newVer + ' available. Update?')) {
			reg.waiting.postMessage('skip-waiting')
		}
	});
}
```
