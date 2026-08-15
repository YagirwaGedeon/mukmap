/* MukmapPanneaux — habilite les panneaux flottants et les dialogues :
 *   - bouton « réduire » (minimise le panneau à sa barre de titre)
 *   - bouton de fermeture (✕) quand le panneau n'en a pas déjà un
 * Ne touche pas aux boutons de fermeture existants des modules.
 */
(function (w) {
    'use strict';
    if (w.MukmapPanneaux) return;
    w.MukmapPanneaux = { habiller: habiller, habillerTous: habillerTous };

    var CSS_BOUTON = 'margin-left:4px;width:22px;height:22px;border:none;border-radius:6px;' +
        'background:rgba(127,127,127,.18);color:inherit;cursor:pointer;' +
        'font-size:.9rem;line-height:1;display:inline-flex;align-items:center;justify-content:center;' +
        'flex-shrink:0;padding:0;';

    function creerBouton(icone, titre, fn) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = icone;
        b.title = titre;
        b.setAttribute('aria-label', titre);
        b.style.cssText = CSS_BOUTON;
        b.addEventListener('click', function (ev) {
            ev.stopPropagation();
            fn();
        });
        return b;
    }

    /* Cherche si le header contient déjà un bouton de fermeture. */
    function aBoutonFermer(entete) {
        var boutons = entete.querySelectorAll('button');
        for (var i = 0; i < boutons.length; i++) {
            var b = boutons[i];
            if (b.getAttribute('data-mukmap-fermer')) return b;
            var cls = (b.className || '') + ' ' + (b.id || '');
            if (cls.match(/(?:fermer|ferme|close|annuler)/i)) return b;
            if (b.textContent === '✕' || b.textContent === '×' || b.textContent === 'X') return b;
        }
        return null;
    }

    function enfantsHorsEntete(panneau, entete) {
        return Array.prototype.filter.call(panneau.children, function (el) {
            return el !== entete && el.getAttribute('data-mukmap-garder') === null;
        });
    }

    /* Réduit ou agrandit le panneau (cache tout sauf le header). */
    function basculerReduction(panneau, entete, btn) {
        var reduit = panneau.getAttribute('data-mukmap-reduit') === '1';
        enfantsHorsEntete(panneau, entete).forEach(function (el) {
            el.style.display = reduit ? '' : 'none';
        });
        panneau.setAttribute('data-mukmap-reduit', reduit ? '0' : '1');
        btn.textContent = reduit ? '—' : '▢';
        btn.title = reduit ? 'Réduire' : 'Agrandir';
        w.dispatchEvent(new CustomEvent('mukmap:reduit', {
            detail: { panneau: panneau, reduit: !reduit }
        }));
    }

    /* Référence du header déjà habillé par panneau. */
    var habilles = new WeakMap();

    /* Habille un panneau : header + bouton réduire + (✕ si absent). */
    function habiller(panneau, tete, opts) {
        opts = opts || {};
        if (!panneau) return;
        var entete = (typeof tete === 'string') ? panneau.querySelector(tete) : tete;
        if (!entete) return;
        if (habilles.get(panneau) === entete) return;
        panneau.setAttribute('data-mukmap-habile', '1');

        var estOverlay = !opts.fixe && panneau.classList.contains('overlay');
        var conteneur = estOverlay ? panneau : panneau;

        if (!opts.pasReduire) {
            var btnMin = creerBouton('—', 'Réduire', function () {
                basculerReduction(conteneur, entete, btnMin);
            });
            btnMin.setAttribute('data-mukmap-reduire', '1');
            entete.appendChild(btnMin);
        }

        var fermeurExistant = aBoutonFermer(entete);
        if (!fermeurExistant && !opts.pasFermer) {
            var btnX = creerBouton('✕', 'Fermer', function () {
                var fn = opts.fermer || function () {
                    if (conteneur.style) conteneur.style.display = 'none';
                };
                fn();
                w.dispatchEvent(new CustomEvent('mukmap:fermer', { detail: { panneau: conteneur } }));
            });
            btnX.setAttribute('data-mukmap-fermer', '1');
            entete.appendChild(btnX);
        }
        habilles.set(panneau, entete);
        return panneau;
    }

    var CIBLES = [
        { sel: '.mukmap-water', tete: '.mw-tete' },
        { sel: '#panel-thema', tete: '.th-tete' },
        { sel: '.mukmap-analyse', tete: '.mukmap-analyse-tete' },
        { sel: '.mukmap-gps', tete: '.mukmap-gps-tete' },
        { sel: '.mukmap-meteo', tete: '.mukmap-meteo-tete',
          fermer: function () {
              var p = document.querySelector('.mukmap-meteo');
              if (p) p.classList.remove('ouvert');
              var b = document.querySelector('#mukmap-meteo-ancre');
              if (b) b.classList.remove('actif');
          } },
        { sel: '.mukmap-offline-panneau', tete: '.mukmap-offline-entete',
          fermer: function () {
              var badge = document.querySelector('#mukmap-offline-ancre .mukmap-offline-badge');
              if (badge) badge.click();
              else {
                  var p = document.querySelector('.mukmap-offline-panneau');
                  if (p) p.classList.remove('ouvert');
              }
          } },
        { sel: '#panneau-topo', tete: '.p-topo-tete' },
        { sel: '#identify-panel', tete: '.ip-head', pasReduire: false },
        { sel: '#rapport-modal', tete: '.modale-tete' },
        { sel: '#overlay-modale', tete: '.modale-tete' },
        { sel: '#overlay-fin-activite', tete: '.modale-tete' },
        { sel: '#overlay-apropos', tete: '.modale-tete' },
        { sel: '#modale-export', tete: '.modale-tete' },
        { sel: '#overlay-mode', tete: '.modale-tete' },
        { sel: '#overlay-code', tete: '.modale-tete' },
    ];

    function habillerTous() {
        var reste = false;
        CIBLES.forEach(function (c) {
            var el = document.querySelector(c.sel);
            if (!el) { reste = true; return; }
            habiller(el, c.tete, {
                pasReduire: !!c.pasReduire,
                fermer: c.fermer,
                fixe: !!c.fixe
            });
            var entete = el.querySelector ? el.querySelector(c.tete) : null;
            if (habilles.get(el) !== entete) reste = true;
        });
        return !reste;
    }

    /* Rattrapage : habille les panneaux dès qu'ils apparaissent et ré-habille
   ceux dont l'en-tête a été re-rendu (ex: panneau hors connexion). */
    var essaies = 0;
    function boucle() {
        if (!habillerTous()) {
            essaies++;
            setTimeout(boucle, essaies > 60 ? 2500 : 500);
        } else {
            essaies = 0;
            setTimeout(boucle, 2000);
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(boucle, 300); });
    } else {
        setTimeout(boucle, 300);
    }
    w.addEventListener('load', function () { setTimeout(boucle, 600); });
})(typeof window !== 'undefined' ? window : globalThis);