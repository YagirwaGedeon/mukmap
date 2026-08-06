/* MUKMAP — Enregistrement du Service Worker + mise à jour automatique silencieuse.
 * Une nouvelle version du SW est appliquée immédiatement (skipWaiting) puis la
 * page se recharge une seule fois par session : plus de bannière « Actualiser ».
 */
(function () {
  if (!('serviceWorker' in navigator)) return;

  var avaitControleur = !!navigator.serviceWorker.controller;
  var refreshFait = false;
  try { refreshFait = sessionStorage.getItem('mukmap_sw_refresh') === '1'; } catch (e) { /* ignore */ }

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(function (reg) {
        reg.addEventListener('updatefound', function () {
          var nouveau = reg.installing;
          if (!nouveau) return;
          nouveau.addEventListener('statechange', function () {
            if (nouveau.state === 'installed' && navigator.serviceWorker.controller) {
              if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      })
      .catch(function () { /* SW indisponible : silencieux */ });

    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!avaitControleur || refreshFait) return;
      try { sessionStorage.setItem('mukmap_sw_refresh', '1'); } catch (e) { /* ignore */ }
      window.location.reload();
    });
  });

  window.mukmapPWA = {
    actualiser: function () {
      navigator.serviceWorker.getRegistration('/sw.js')
        .then(function (reg) { if (reg && reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' }); })
        .then(function () { window.location.reload(); });
    },
    enAttente: function () { /* mise à jour automatique : aucune bannière */ }
  };
})();
