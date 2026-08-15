/* ══════════════════════════════════════════════════════════════════
   MUKMAP · device-adapt.js · v1
   Détection d'appareil + adaptations DOM :
   - classes dv-* sur <html> (phone / tablette / laptop / desktop, touch, orientation)
   - tiroir sidebar plein écran (page carte) + arrière-plan cliquable
   - menu hamburger pour les topbars avec <nav> (dashboard, rapport, ...)
   - recherche mobile (page carte)
   - bouton d'action rapide « collecte » (mobile)
   Chargé dans _pwa_body.html. Résilient : chaque module est isolé.
   ══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    function poserClasses() {
        var d = document.documentElement;
        d.classList.remove('dv-phone', 'dv-tablet', 'dv-laptop', 'dv-desktop',
            'dv-touch', 'dv-mouse', 'dv-portrait', 'dv-landscape');
        var w = window.innerWidth;
        var h = window.innerHeight;
        var tactile = window.matchMedia &&
            window.matchMedia('(hover: none) and (pointer: coarse)').matches;
        var type = 'dv-desktop';
        if (w < 768) { type = 'dv-phone'; }
        else if (w < 1025) { type = 'dv-tablet'; }
        else if (w < 1440) { type = 'dv-laptop'; }
        d.classList.add(type, tactile ? 'dv-touch' : 'dv-mouse',
            h > w ? 'dv-portrait' : 'dv-landscape');
    }

    function iconeLucide() {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            try { window.lucide.createIcons(); } catch (e) {}
        }
    }

    function majTiroir(sidebar, btn, fond) {
        if (!fond) return;
        var ouverte = !sidebar.classList.contains('fermee');
        fond.classList.toggle('visible', ouverte);
    }

    function initTiroir() {
        var sidebar = document.getElementById('sidebar');
        var btn = document.getElementById('btn-sidebar');
        if (!sidebar || !btn) return;
        var fond = document.createElement('div');
        fond.id = 'muk-sidebar-backdrop';
        document.body.appendChild(fond);
        btn.addEventListener('click', function () {
            setTimeout(function () { majTiroir(sidebar, btn, fond); }, 40);
        });
        fond.addEventListener('click', function () {
            sidebar.classList.add('fermee');
            btn.classList.remove('actif');
            majTiroir(sidebar, btn, fond);
        });
        sidebar.addEventListener('click', function (ev) {
            var cible = ev.target;
            var a = cible.closest ? cible.closest('a[href]') : null;
            if (a) {
                sidebar.classList.add('fermee');
                btn.classList.remove('actif');
                majTiroir(sidebar, btn, fond);
            }
        });
    }

    function initHamburger() {
        var topbars = document.querySelectorAll('#topbar, .topbar, header');
        topbars.forEach(function (topbar) {
            var nav = topbar.querySelector('nav');
            if (!nav || nav.getAttribute('data-muk-nav')) return;
            nav.setAttribute('data-muk-nav', '1');
            var btn = document.createElement('button');
            btn.id = 'muk-hamburger';
            btn.type = 'button';
            btn.setAttribute('aria-label', 'Menu');
            btn.innerHTML = '<span data-lucide="menu"></span>';
            btn.addEventListener('click', function () {
                topbar.classList.toggle('muk-nav-ouverte');
            });
            topbar.insertBefore(btn, topbar.firstChild);
            nav.addEventListener('click', function (ev) {
                var cible = ev.target;
                if (cible.closest && cible.closest('a')) {
                    topbar.classList.remove('muk-nav-ouverte');
                }
            });
        });
        iconeLucide();
    }

    function initRecherche() {
        var wrap = document.getElementById('recherche-wrap');
        var topbar = document.getElementById('topbar');
        if (!wrap || !topbar) return;
        var droite = topbar.querySelector('.droite');
        if (!droite) return;
        var btn = document.createElement('button');
        btn.id = 'btn-recherche-mobile';
        btn.type = 'button';
        btn.className = 'btn btn-icon';
        btn.title = 'Recherche';
        btn.innerHTML = '<span data-lucide="search"></span>';
        droite.insertBefore(btn, droite.firstChild);
        var barre = document.createElement('div');
        barre.id = 'muk-recherche-barre';
        document.body.appendChild(barre);
        barre.appendChild(wrap);
        btn.addEventListener('click', function () {
            var visible = barre.classList.toggle('visible');
            if (visible) {
                var inp = barre.querySelector('#recherche');
                if (inp) { inp.focus(); }
            }
        });
        function maj() {
            var mobile = window.innerWidth <= 768;
            btn.style.display = mobile ? 'flex' : 'none';
            if (!mobile) { barre.classList.remove('visible'); }
        }
        maj();
        window.addEventListener('resize', maj);
        iconeLucide();
    }

    /* Sélecteur de langue : déplacé dans la sidebar (mobile) pour ne
       pas perdre la fonctionnalité quand il est masqué dans la topbar */
    function initSelecteurLangue() {
        var sel = document.querySelector('.selecteur-langue');
        var sidebar = document.getElementById('sidebar');
        if (!sel || !sidebar || sel.getAttribute('data-muk-deplace')) return;
        sel.setAttribute('data-muk-deplace', '1');
        sidebar.insertBefore(sel, sidebar.firstChild);
        iconeLucide();
    }

    function initFabCollecte() {
        var sidebar = document.getElementById('sidebar');
        var form = document.getElementById('form-point-rapide');
        if (!sidebar || !form) return;
        var fab = document.createElement('button');
        fab.id = 'muk-fab-collecte';
        fab.type = 'button';
        fab.title = 'Collecter un point';
        fab.innerHTML = '<span data-lucide="plus"></span>';
        fab.addEventListener('click', function () {
            sidebar.classList.remove('fermee');
            var btn = document.getElementById('btn-sidebar');
            if (btn) { btn.classList.add('actif'); }
            var fond = document.getElementById('muk-sidebar-backdrop');
            if (fond) { fond.classList.add('visible'); }
            setTimeout(function () {
                form.scrollIntoView({ behavior: 'smooth', block: 'start' });
                var inp = form.querySelector('input[name="nom"]');
                if (inp) { inp.focus(); }
            }, 350);
        });
        document.body.appendChild(fab);
        iconeLucide();
    }

    function init() {
        try { poserClasses(); } catch (e) {}
        /* Sidebar fermée par défaut sur mobile (sinon elle couvre l'écran) */
        try {
            var sb = document.getElementById('sidebar');
            var sbBtn = document.getElementById('btn-sidebar');
            if (sb && sbBtn && window.innerWidth <= 768 && !sb.classList.contains('fermee')) {
                sb.classList.add('fermee');
                sbBtn.classList.remove('actif');
            }
        } catch (e) {}
        try { initTiroir(); } catch (e) {}
        try { initHamburger(); } catch (e) {}
        try { initRecherche(); } catch (e) {}
        try { initSelecteurLangue(); } catch (e) {}
        try { initFabCollecte(); } catch (e) {}
        window.mukAdaptPret = true;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    var majResize = function () {
        try { poserClasses(); } catch (e) {}
    };
    window.addEventListener('resize', majResize);
    window.addEventListener('orientationchange', function () {
        setTimeout(majResize, 250);
    });
})();