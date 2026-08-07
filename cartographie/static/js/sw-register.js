/* MUKMAP — Enregistrement du Service Worker + mise à jour automatique silencieuse.
 * Une nouvelle version du SW est appliquée immédiatement (skipWaiting) puis la
 * page se recharge une seule fois par session : plus de bannière « Actualiser ».
 */
(function () {
  if (!('serviceWorker' in navigator)) return;

  // ─── INTERRUPTEUR (désactivé pour les tests de dev) ─────────────
  // true  : le SW n'est pas enregistré et l'ancien enregistrement est
  //         retiré (aucune mise en cache, jamais d'erreur obsolète).
  // false : comportement PWA normal (enregistrement + mise à jour auto).
  var SW_DESACTIVE = true;

  // Retire définitivement un éventuel service worker déjà enregistré et
  // purge les caches du navigateur (aucune page d'erreur périmée ne
  // pourra resservir).
  function desactiverSW() {
    navigator.serviceWorker.getRegistrations().then(function (regs) {
      var aRetire = regs.length > 0;
      regs.forEach(function (r) { r.unregister().then(function (ok) {
        if (ok) console.info('MUKMAP PWA : service worker désactivé.');
      }); });
      if (caches && caches.keys) {
        caches.keys().then(function (cles) {
          return Promise.all(cles.map(function (c) { return caches.delete(c); }));
        }).catch(function () { /* silencieux */ });
      }
      if (aRetire) window.location.reload();
    }).catch(function () { /* silencieux */ });
  }

  if (SW_DESACTIVE) {
    window.mukmapPWA = {
      actualiser: function () {},
      enAttente: function () {}
    };
    window.addEventListener('load', function () {
      setTimeout(desactiverSW, 600);
    });
    return;
  }

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
