(function () {
    'use strict';

    function trad(cle, defaut) {
        if (typeof window !== 'undefined' && window.mukmapT) {
            var v = window.mukmapT(cle);
            if (v) return v;
        }
        return defaut;
    }

    function lireEtat() {
        var racine = typeof window !== 'undefined' ? window : globalThis;
        var e = racine.ETAT_MODE || {};
        return {
            mode: e.mode === 'avance' ? 'avance' : 'classique',
            acces_avance: !!e.acces_avance,
            est_admin_principal: !!e.est_admin_principal
        };
    }

    function afficherBouton(etat) {
        var btn = document.getElementById('btn-mode');
        if (!btn) return;
        btn.classList.toggle('pro', etat.mode === 'avance');
        var lbl = document.getElementById('mode-label');
        if (lbl) {
            lbl.textContent = etat.mode === 'avance'
                ? trad('mode_avance', 'Pro')
                : trad('mode_classique', 'Classique');
        }
    }

    function ouvrir(id) {
        var el = document.getElementById(id);
        if (el) el.style.display = 'flex';
    }

    function fermer(id) {
        var el = document.getElementById(id);
        if (el) el.style.display = 'none';
    }

    function poster(donnees, cb) {
        var csrf = (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || '';
        fetch('/api/mode/changer/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
            body: JSON.stringify(donnees)
        }).then(function (r) {
            return r.json().catch(function () { return {}; });
        }).then(cb).catch(function () {
            cb({ erreur: trad('mode_erreur_reseau', 'Erreur réseau.') });
        });
    }

    function init() {
        var etat = lireEtat();
        afficherBouton(etat);

        var btn = document.getElementById('btn-mode');
        if (btn) {
            btn.addEventListener('click', function () {
                var lien = document.getElementById('mode-admin-lien');
                if (lien) lien.style.display = etat.est_admin_principal ? 'block' : 'none';
                ouvrir('overlay-mode');
            });
        }

        document.querySelectorAll('.mode-carte').forEach(function (carte) {
            carte.addEventListener('click', function () {
                var cible = carte.getAttribute('data-mode');
                var e2 = lireEtat();
                if (cible === e2.mode) { fermer('overlay-mode'); return; }
                if (cible === 'avance' && !e2.acces_avance && !e2.est_admin_principal) {
                    fermer('overlay-mode');
                    ouvrir('overlay-code');
                    return;
                }
                poster({ mode: cible }, function (res) {
                    if (res.ok) { location.reload(); return; }
                    fermer('overlay-mode');
                    ouvrir('overlay-code');
                });
            });
        });

        var valider = document.getElementById('btn-valider-code');
        if (valider) {
            function validerCode() {
                var inp = document.getElementById('input-code-mode');
                var code = inp ? inp.value.trim() : '';
                var err = document.getElementById('erreur-code');
                if (!code) {
                    if (err) {
                        err.textContent = trad('mode_code_requis', "Un code d'accès est requis.");
                        err.className = 'erreur-code visible';
                    }
                    return;
                }
                poster({ mode: 'avance', code: code }, function (res) {
                    if (res.ok) { location.reload(); return; }
                    if (err) {
                        err.textContent = res.erreur || trad('mode_code_invalide', 'Code invalide ou expiré.');
                        err.className = 'erreur-code visible';
                    }
                });
            }
            valider.addEventListener('click', validerCode);
            var champ = document.getElementById('input-code-mode');
            if (champ) champ.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') validerCode();
            });
        }

        ['overlay-mode', 'overlay-code'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.addEventListener('click', function (e) {
                if (e.target === e.currentTarget) fermer(id);
            });
        });
    }

    var ecouteursChangement = [];
    function surChangementMode(cb) { ecouteursChangement.push(cb); }
    function notifierChangement(etat) {
        ecouteursChangement.forEach(function (cb) {
            try { cb(etat); } catch (e) {}
        });
    }

    globalThis.ModeAvanceCore = {
        init: init,
        lireEtat: lireEtat,
        afficherBouton: afficherBouton,
        trad: trad,
        surChangementMode: surChangementMode
    };

    if (typeof document === 'undefined') return;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();