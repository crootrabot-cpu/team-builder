let deferredPrompt = null;
const installButton = document.getElementById('installAppButton');
const browserHint = document.getElementById('browserHint');

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function inHostileBrowser() {
  const ua = navigator.userAgent || '';
  return /Telegram|FBAN|FBAV|Instagram/i.test(ua);
}

function hintMessage() {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return 'For the cleanest install flow, open Team Builder in Safari and use Share → Add to Home Screen.';
  }
  if (/Android/i.test(ua)) {
    return 'For the cleanest install flow, open Team Builder in Chrome and use Install app.';
  }
  return 'Open Team Builder in your main browser for the cleanest install flow.';
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

window.addEventListener('load', () => {
  if (browserHint && inHostileBrowser() && !isStandalone()) {
    browserHint.hidden = false;
    browserHint.textContent = hintMessage();
  }
});

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  if (installButton) installButton.hidden = false;
});

if (installButton) {
  installButton.addEventListener('click', async () => {
    if (!deferredPrompt) {
      alert('Use your browser menu to add Team Builder to the home screen.');
      return;
    }
    deferredPrompt.prompt();
    deferredPrompt = null;
  });
}
