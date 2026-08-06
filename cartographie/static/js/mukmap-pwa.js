/* MUKMAP — PWA : invite d'installation, mode standalone, hint iOS, bannière de mise à jour */
(function () {
  var donnees = null;
  try {
    var el = document.getElementById('mukmap-i18n-data');
    if (el) donnees = JSON.parse(el.textContent);
  } catch (e) { donnees = null; }
  var langue = (donnees && donnees.langue) || 'fr';
  function T(cle) {
    try {
      if (window.mukmapT) return window.mukmapT(cle);
      var d = (donnees && donnees.traductions) || {};
      var dico = d[langue] || d.fr || {};
      return dico[cle] !== undefined ? dico[cle] : (d.fr[cle] !== undefined ? d.fr[cle] : cle);
    } catch (e) { return cle; }
  }

  var STANDALONE = window.matchMedia('(display-mode: standalone)').matches ||
                   navigator.standalone === true;

  var racine = document.getElementById('mukmap-pwa-root');
  if (!racine) return;

  var tete = document.createElement('style');
  tete.textContent = [
    '.mukmap-pwa-badge{position:fixed;z-index:99999;left:12px;right:12px;bottom:12px;background:#fff;border:1px solid #e1e3f5;border-radius:14px;box-shadow:0 8px 30px rgba(31,36,60,.18);padding:14px 16px;display:flex;align-items:center;gap:12px;font-family:inherit;animation:mukmapUp .25s ease}.mukmap-pwa-badge .mukmap-pwa-logo{width:42px;height:42px;border-radius:10px;flex:0 0 auto}',
    '.mukmap-pwa-badge .mukmap-pwa-txt{flex:1;min-width:0}.mukmap-pwa-badge .mukmap-pwa-titre{font-weight:700;font-size:14px;color:#1f243c;margin:0 0 2px}.mukmap-pwa-badge .mukmap-pwa-desc{font-size:12px;color:#6b729c;margin:0;line-height:1.35}',
    '.mukmap-pwa-badge .mukmap-pwa-btn{border:0;border-radius:10px;padding:9px 14px;font-weight:700;font-size:13px;cursor:pointer;white-space:nowrap}.mukmap-pwa-badge .mukmap-pwa-btn-prim{background:#4f46e5;color:#fff}.mukmap-pwa-badge .mukmap-pwa-btn-sec{background:#eef0ff;color:#4f46e5}',
    '.mukmap-pwa-ios{position:fixed;z-index:99999;left:12px;right:12px;bottom:12px;background:#1f243c;color:#fff;border-radius:14px;padding:16px;font-size:13px;line-height:1.5;box-shadow:0 8px 30px rgba(0,0,0,.3);animation:mukmapUp .25s ease}.mukmap-pwa-ios .mukmap-pwa-x{position:absolute;top:8px;right:12px;background:none;border:0;color:#aab0cf;font-size:16px;cursor:pointer}',
    '@keyframes mukmapUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}',
    '@media(min-width:560px){.mukmap-pwa-badge{left:auto;right:20px;bottom:20px;max-width:380px}}'
  ].join('\n');
  document.head.appendChild(tete);

  function badge(html, boutons) {
    var b = document.createElement('div');
    b.className = 'mukmap-pwa-badge';
    b.innerHTML = html;
    racine.appendChild(b);
    (boutons || []).forEach(function (fn) { fn(b); });
    return b;
  }

  var cacheInstall = 'mukmap_pwa_install_v1';
  function dejaMasque() {
    try { return localStorage.getItem(cacheInstall) === '1'; } catch (e) { return true; }
  }
  function marquerMasque() {
    try { localStorage.setItem(cacheInstall, '1'); } catch (e) { /* ignore */ }
  }
  var iosMasque = 'mukmap_pwa_ios_v1';

  function lancerInstall(deferred) {
    if (!deferred) return;
    deferred.prompt();
    deferred.userChoice.then(function (choix) {
      if (choix.outcome === 'accepted') {
        marquerMasque();
        var b = document.querySelector('.mukmap-pwa-badge');
        if (b) b.remove();
      }
    });
  }

  var deferredInstall = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredInstall = e;
    if (dejaMasque() || STANDALONE) return;
    badge(
      '<img class="mukmap-pwa-logo" src="' + (window.mukmap_logo || '') + '" alt="MUKMAP">' +
      '<div class="mukmap-pwa-txt"><p class="mukmap-pwa-titre">' + T('pwa_install_titre') + '</p>' +
      '<p class="mukmap-pwa-desc">' + T('pwa_install_texte') + '</p></div>' +
      '<button class="mukmap-pwa-btn mukmap-pwa-btn-sec" data-plus="1">' + T('pwa_plus_tard') + '</button>' +
      '<button class="mukmap-pwa-btn mukmap-pwa-btn-prim" data-install="1">' + T('pwa_installer') + '</button>',
      [function (badgeEl) {
        badgeEl.querySelector('[data-install]').addEventListener('click', function () {
          lancerInstall(deferredInstall);
        });
        badgeEl.querySelector('[data-plus]').addEventListener('click', function () {
          marquerMasque();
          badgeEl.remove();
        });
      }]
    );
  });

  window.addEventListener('appinstalled', function () {
    marquerMasque();
    var b = document.querySelector('.mukmap-pwa-badge');
    if (b) b.remove();
  });

  if (!STANDALONE && /iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    var nb = Math.floor(Date.now() / 86400000);
    var dernier = parseInt(localStorage.getItem(iosMasque) || '0', 10) || 0;
    if (nb - dernier >= 2) {
      var ios = document.createElement('div');
      ios.className = 'mukmap-pwa-ios';
      ios.innerHTML = '<button class="mukmap-pwa-x" aria-label="' + T('pwa_plus_tard') + '">×</button>' + T('pwa_ios_hint');
      racine.appendChild(ios);
      ios.querySelector('.mukmap-pwa-x').addEventListener('click', function () {
        ios.remove();
        try { localStorage.setItem(iosMasque, String(nb)); } catch (e) { /* ignore */ }
      });
    }
  }
})();
