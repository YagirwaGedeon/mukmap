/* MUKMAP — Enregistrement du Service Worker + détection de mise à jour */
(function () {
  if (!('serviceWorker' in navigator)) return;
  var waitQueue = [];

  function notifyWaiting() {
    while (waitQueue.length) (waitQueue.shift())();
  }

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(function (reg) {
        if (reg.waiting) notifyWaiting();
        reg.addEventListener('updatefound', function () {
          var nouveau = reg.installing;
          if (!nouveau) return;
          nouveau.addEventListener('statechange', function () {
            if (nouveau.state === 'installed' && navigator.serviceWorker.controller) {
              notifyWaiting();
            }
          });
        });
      })
      .catch(function () { /* SW indisponible : silencieux */ });

    navigator.serviceWorker.addEventListener('controllerchange', function () {
      notifyWaiting();
    });
  });

  window.mukmapPWA = {
    actualiser: function () {
      navigator.serviceWorker.getRegistration('/sw.js')
        .then(function (reg) { if (reg && reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' }); })
        .then(function () { window.location.reload(); });
    },
    enAttente: function (cb) {
      if (typeof cb === 'function') waitQueue.push(cb);
    }
  };
})();
