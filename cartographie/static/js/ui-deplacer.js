/* Déplacement à la souris / au doigt des boutons et panneaux flottants.
 * Usage : MukmapDeplacer.deplacer(element[, poignee])
 *   - element : l'élément à déplacer (position:fixed ou absolute).
 *   - poignee : la zone de prise (défaut : l'élément lui-même).
 * La poignée ignore les clics sur les boutons internes (fermeture, onglets…).
 * Après un vrai glissement (> 5 px), le clic qui suit est neutralisé pour ne
 * pas déclencher le bouton (ouverture/fermeture du panneau).
 * L'élément reste toujours entièrement visible dans la fenêtre. */
(function (global) {
    'use strict';

    var SEUIL = 5;

    function deplacer(el, poignee) {
        if (!el || typeof document === 'undefined' ||
            typeof PointerEvent === 'undefined' || !window.addEventListener) return;
        var main = poignee || el;
        var x0 = 0, y0 = 0, gauche0 = 0, haut0 = 0;
        var deplace = false, actif = false;

        main.style.touchAction = 'none';
        main.style.cursor = 'move';
        if (!/d[ée]placer/i.test(main.title || '')) {
            main.title = (main.title ? main.title + ' — ' : '') + 'Déplacer';
        }

        main.addEventListener('pointerdown', function (ev) {
            if (ev.button !== 0) return;
            // Ignore les boutons INTERNES (fermeture, onglets…) mais pas la
            // poignée elle-même quand c'est un bouton flottant.
            if (ev.target !== main && ev.target && ev.target.closest && ev.target.closest('button')) return;
            var r = el.getBoundingClientRect();
            x0 = ev.clientX; y0 = ev.clientY;
            gauche0 = r.left; haut0 = r.top;
            deplace = false; actif = true;
            ev.preventDefault();
            try { main.setPointerCapture(ev.pointerId); } catch (e) { /* */ }
        });

        main.addEventListener('pointermove', function (ev) {
            if (!actif) return;
            var dx = ev.clientX - x0, dy = ev.clientY - y0;
            if (Math.abs(dx) + Math.abs(dy) > SEUIL) deplace = true;
            if (!deplace) return;
            var l = gauche0 + dx;
            var t = haut0 + dy;
            l = Math.min(Math.max(l, 0), (window.innerWidth || 0) - el.offsetWidth);
            t = Math.min(Math.max(t, 0), (window.innerHeight || 0) - el.offsetHeight);
            el.style.left = Math.max(l, 0) + 'px';
            el.style.top = Math.max(t, 0) + 'px';
            el.style.right = 'auto';
            el.style.bottom = 'auto';
        });

        function finir(ev) {
            if (!actif) return;
            actif = false;
            if (deplace) {
                el._glisse = true;
                setTimeout(function () { el._glisse = false; }, 350);
            }
            try { main.releasePointerCapture(ev.pointerId); } catch (e) { /* */ }
        }
        main.addEventListener('pointerup', finir);
        main.addEventListener('pointercancel', finir);

        // Neutralise le clic consécutif à un glissement (capture : passe avant
        // le gestionnaire de clic du module, stopImmediatePropagation l'arrête).
        el.addEventListener('click', function (ev) {
            if (el._glisse) {
                ev.preventDefault();
                ev.stopImmediatePropagation();
            }
        }, true);
    }

    global.MukmapDeplacer = { deplacer: deplacer };
})(typeof window !== 'undefined' ? window : globalThis);
