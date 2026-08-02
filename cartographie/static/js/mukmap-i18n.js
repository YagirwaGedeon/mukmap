/* MUKMAP — i18n global : applique la langue choisie sur toutes les pages. */
(function () {
    'use strict';

    function lireDonnees() {
        try {
            var el = document.getElementById('mukmap-i18n-data');
            if (!el) return { langue: 'fr', dico: {} };
            var data = JSON.parse(el.textContent);
            var d = data.traductions[data.langue] || data.traductions.fr || {};
            return { langue: data.langue || 'fr', dico: d };
        } catch (e) {
            return { langue: 'fr', dico: {} };
        }
    }

    function t(cle, defaut) {
        var x = lireDonnees();
        var v = x.dico[cle];
        if (v === undefined) v = defaut !== undefined ? defaut : cle;
        return v;
    }
    window.mukmapT = t;

    function appliquer() {
        var x = lireDonnees();
        document.documentElement.lang = x.langue;
        document.querySelectorAll('[data-i18n]').forEach(function (el) {
            var v = x.dico[el.getAttribute('data-i18n')];
            if (v !== undefined) el.textContent = v;
        });
        document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
            var v = x.dico[el.getAttribute('data-i18n-ph')];
            if (v !== undefined) el.placeholder = v;
        });
        document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
            var v = x.dico[el.getAttribute('data-i18n-title')];
            if (v !== undefined) el.title = v;
        });
        if (window.lucide) {
            try { lucide.createIcons(); } catch (e) { /* ignorer */ }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', appliquer);
    } else {
        appliquer();
    }
    window.mukmapAppliquerLangue = appliquer;
})();
