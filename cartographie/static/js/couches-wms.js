/* MUKMAP — Couches WMS superposables au fond de carte (Mode Avancé).
 * Core exposé sous globalThis.CouchesWMSCore : testable en Node.
 * Chaque couche devient une source raster MapLibre (URL GetMap avec
 * {bbox-epsg-3857}) insérée SOUS les données ("clusters") et AU-DESSUS
 * des fonds de carte, avec opacité réglable par couche.
 */
(function () {
    'use strict';

    function csrfToken() {
        try {
            var m = document.cookie.match(/csrftoken=([^;]+)/);
            if (m) return m[1];
        } catch (e) {}
        return '';
    }

    function idSource(id) { return 'wms-' + id; }
    function idCouche(id) { return 'wms-' + id + '-c'; }

    /* Ajoute (si absente) la source raster + la couche, sous "clusters".
     * L'ordre d'insertion détermine l'empilement : chaque couche ajoutée
     * ensuite passe au-dessus des précédentes (toutes sous les données). */
    function ajouter(map, couche) {
        if (!map || !couche || !couche.url) return false;
        var sourceId = idSource(couche.id);
        var layerId = idCouche(couche.id);
        try {
            if (!map.getSource(sourceId)) {
                map.addSource(sourceId, {
                    type: 'raster',
                    tiles: [couche.url],
                    tileSize: 256,
                    attribution: couche.attribution || ''
                });
            }
            if (map.getLayer && !map.getLayer(layerId)) {
                var spec = {
                    id: layerId,
                    type: 'raster',
                    source: sourceId,
                    layout: { visibility: couche.visible === false ? 'none' : 'visible' },
                    paint: { 'raster-opacity': couche.opacite != null ? couche.opacite : 0.7 }
                };
                try {
                    map.addLayer(spec, 'clusters');
                } catch (e) {
                    map.addLayer(spec);
                }
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    function retirer(map, id) {
        if (!map) return;
        var sourceId = idSource(id);
        var layerId = idCouche(id);
        try {
            if (map.getLayer && map.getLayer(layerId)) map.removeLayer(layerId);
            if (map.getSource(sourceId)) map.removeSource(sourceId);
        } catch (e) {}
    }

    function basculer(map, id, visible) {
        if (!map) return false;
        var layerId = idCouche(id);
        try {
            if (map.getLayer && !map.getLayer(layerId)) return false;
            map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
            return true;
        } catch (e) {
            return false;
        }
    }

    function opacite(map, id, valeur) {
        if (!map) return false;
        var layerId = idCouche(id);
        try {
            if (map.getLayer && !map.getLayer(layerId)) return false;
            map.setPaintProperty(layerId, 'raster-opacity', Math.max(0, Math.min(1, valeur)));
            return true;
        } catch (e) {
            return false;
        }
    }

    /* Charge la liste depuis l'API et ajoute les couches visibles. */
    function charger(opts) {
        var map = opts && opts.map ? opts.map : null;
        return fetch('/api/couches-wms/', {
            credentials: 'same-origin',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function (data) {
            var couches = (data && data.couches) || [];
            if (map) {
                couches.forEach(function (c) {
                    if (c.visible) ajouter(map, c);
                });
            }
            return couches;
        });
    }

    /* Première couche WMS dans la pile MapLibre (la plus basse) — sert de
     * point d'insertion pour que les fonds de carte passent SOUS les WMS. */
    function premiereCouche(map) {
        if (!map || !map.getStyle) return null;
        try {
            var layers = map.getStyle().layers || [];
            for (var i = 0; i < layers.length; i++) {
                if (layers[i].id.indexOf('wms-') === 0) return layers[i].id;
            }
        } catch (e) {}
        return null;
    }

    function ids(map) {
        var out = [];
        if (!map || !map.getStyle) return out;
        try {
            var layers = map.getStyle().layers || [];
            for (var i = 0; i < layers.length; i++) {
                var id = layers[i].id;
                if (id.indexOf('wms-') === 0 && id.slice(-2) === '-c') {
                    out.push(Number(id.slice(4, -2)));
                }
            }
        } catch (e) {}
        return out;
    }

    globalThis.CouchesWMSCore = {
        ajouter: ajouter,
        retirer: retirer,
        basculer: basculer,
        opacite: opacite,
        charger: charger,
        premiereCouche: premiereCouche,
        ids: ids,
        csrfToken: csrfToken
    };

    if (typeof document === 'undefined') return;

    // ── UI : section Couches WMS (sidebar) + modal d'ajout ──
    var mapRef = null;
    var couches = [];
    var listeEl = null;
    var panelEl = null;
    var titreEl = null;
    var modale = null;

    function trad(cle, defaut) {
        if (typeof window !== 'undefined' && window.mukmapT) {
            var v = window.mukmapT(cle);
            if (v) return v;
        }
        return defaut;
    }

    function installer(opts) {
        if (opts && opts.map) mapRef = opts.map;
        listeEl = document.getElementById('liste-couches');
        panelEl = document.getElementById('panel-couches');
        titreEl = document.getElementById('titre-couches');
        var etat = window.ETAT_MODE || {};
        var pro = etat.mode === 'avance' && etat.acces_avance;
        if (panelEl) panelEl.style.display = pro ? '' : 'none';
        if (titreEl) titreEl.style.display = pro ? '' : 'none';
        var btn = document.getElementById('btn-couches-ajouter');
        if (btn && !btn.dataset.wired) {
            btn.dataset.wired = '1';
            btn.addEventListener('click', ouvrirFormulaire);
        }
        if (pro) {
            charger({ map: mapRef }).then(function (liste) {
                couches = liste;
                rendreListe();
            }).catch(function () {
                couches = [];
                rendreListe();
            });
        }
    }

    function rendreListe() {
        if (!listeEl) return;
        listeEl.innerHTML = '';
        if (!couches.length) {
            var vide = document.createElement('div');
            vide.className = 'hint';
            vide.style.fontSize = '.72rem';
            vide.textContent = trad('couches_aucune', 'Aucune couche. Connectez un service WMS pour superposer des données.');
            listeEl.appendChild(vide);
            return;
        }
        couches.forEach(function (c) {
            var div = document.createElement('div');
            div.className = 'wms-item';
            div.title = c.nom + (c.layers ? ' — ' + c.layers : '');
            var oeil = document.createElement('button');
            oeil.type = 'button';
            oeil.className = 'wms-oeil';
            oeil.innerHTML = c.visible ? '<span data-lucide="eye"></span>' : '<span data-lucide="eye-off"></span>';
            oeil.title = trad(c.visible ? 'couches_masquer' : 'couches_afficher', c.visible ? 'Masquer' : 'Afficher');
            oeil.addEventListener('click', function () {
                var v = !c.visible;
                fetch('/api/couches-wms/' + c.id + '/', {
                    method: 'PATCH',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken(), 'X-Requested-With': 'XMLHttpRequest' },
                    body: JSON.stringify({ visible: v })
                }).then(function (r) { return r.json(); }).then(function (d) {
                    if (d.ok) {
                        c.visible = v;
                        basculer(mapRef, c.id, v);
                        rendreListe();
                    }
                }).catch(function () {});
            });
            var suppr = document.createElement('button');
            suppr.type = 'button';
            suppr.className = 'wms-suppr';
            suppr.innerHTML = '<span data-lucide="trash-2"></span>';
            suppr.title = trad('couches_supprimer', 'Supprimer');
            suppr.addEventListener('click', function () {
                if (!window.confirm(trad('couches_confirmer_suppr', 'Supprimer cette couche ?'))) return;
                fetch('/api/couches-wms/' + c.id + '/', {
                    method: 'DELETE',
                    credentials: 'same-origin',
                    headers: { 'X-CSRFToken': csrfToken(), 'X-Requested-With': 'XMLHttpRequest' }
                }).then(function (r) {
                    if (r.ok) {
                        retirer(mapRef, c.id);
                        couches = couches.filter(function (x) { return x.id !== c.id; });
                        rendreListe();
                    }
                }).catch(function () {});
            });
            var nom = document.createElement('span');
            nom.className = 'wms-nom';
            nom.textContent = c.nom;
            var opac = document.createElement('div');
            opac.className = 'wms-opacite';
            opac.innerHTML =
                '<label class="wms-opacite-lbl" title="' + trad('couches_opacite', 'Opacité') + '">' +
                '<span data-lucide="droplets"></span>' +
                '<input type="range" min="0" max="1" step="0.05" value="' + c.opacite + '">' +
                '<em>' + Math.round((c.opacite != null ? c.opacite : 0.7) * 100) + '%</em>' +
                '</label>';
            var curseur = opac.querySelector('input');
            var labelPct = opac.querySelector('em');
            var timer = null;
            curseur.addEventListener('input', function () {
                var v = parseFloat(curseur.value);
                opacite(mapRef, c.id, v);
                if (labelPct) labelPct.textContent = Math.round(v * 100) + '%';
                if (timer) clearTimeout(timer);
                timer = setTimeout(function () {
                    fetch('/api/couches-wms/' + c.id + '/', {
                        method: 'PATCH',
                        credentials: 'same-origin',
                        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken(), 'X-Requested-With': 'XMLHttpRequest' },
                        body: JSON.stringify({ opacite: v })
                    }).catch(function () {});
                }, 350);
            });
            div.appendChild(nom);
            div.appendChild(oeil);
            div.appendChild(suppr);
            div.appendChild(opac);
            listeEl.appendChild(div);
        });
        if (window.lucide) window.lucide.createIcons();
    }

    function baserStyle() {
        var base = document.createElement('style');
        base.textContent =
            '#modal-couches { position: fixed; inset: 0; z-index: 1400; display: none; align-items: center; justify-content: center; background: rgba(8,10,24,.68); backdrop-filter: blur(6px); }' +
            '#modal-couches.ouvert { display: flex; }' +
            '#modal-couches .wms-boite { width: min(600px, 94vw); max-height: 88vh; overflow-y: auto; background: var(--bg-2); border: 1px solid var(--border); border-radius: 16px; box-shadow: var(--shadow); }' +
            '#modal-couches .wms-tete { display: flex; align-items: center; justify-content: space-between; padding: 15px 18px; border-bottom: 1px solid var(--border); }' +
            '#modal-couches .wms-titre { display: flex; align-items: center; gap: 9px; font-weight: 800; font-size: .98rem; }' +
            '#modal-couches .wms-titre [data-lucide] { width: 19px; height: 19px; color: var(--accent); }' +
            '#modal-couches .wms-corps { padding: 14px 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }' +
            '#modal-couches .wms-corps label { display: flex; flex-direction: column; gap: 4px; font-size: .7rem; font-weight: 700; color: var(--text-2); }' +
            '#modal-couches .wms-corps .pleine { grid-column: 1 / -1; }' +
            '#modal-couches .wms-corps input, #modal-couches .wms-corps select, #modal-couches .wms-corps textarea { background: var(--bg-3); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; font-size: .74rem; width: 100%; box-sizing: border-box; }' +
            '#modal-couches .wms-corps .hint { font-size: .66rem; font-weight: 400; color: var(--text-3); line-height: 1.4; }' +
            '#modal-couches .wms-actions { grid-column: 1 / -1; display: flex; gap: 8px; justify-content: flex-end; padding-bottom: 14px; padding-right: 18px; }' +
            '#modal-couches .wms-erreur { grid-column: 1 / -1; color: var(--red); font-size: .72rem; }';
        document.head.appendChild(base);
    }

    function construireModale() {
        if (modale) return modale;
        baserStyle();
        var ov = document.createElement('div');
        ov.id = 'modal-couches';
        ov.innerHTML =
            '<div class="wms-boite">' +
            '<div class="wms-tete">' +
            '<div class="wms-titre"><span data-lucide="layers"></span><span>' + trad('couches_ajouter', 'Ajouter une couche WMS') + '</span></div>' +
            '<button type="button" class="btn btn-icon btn-sm" id="wms-fermer">✕</button>' +
            '</div>' +
            '<form class="wms-corps" id="wms-form">' +
            '<label class="pleine"><span>' + trad('couches_nom', 'Nom de la couche') + '</span><input id="wms-nom" required placeholder="Bassins versants — HydroBASINS"></label>' +
            '<label class="pleine"><span>' + trad('couches_url', 'URL WMS (GetMap)') + '</span><textarea id="wms-url" rows="3" required placeholder="https://serveur/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=nom&STYLES=&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=TRUE"></textarea>' +
            '<span class="hint">' + trad('couches_url_hint', 'Collez l’URL GetMap de votre serveur : service, request, layers, SRS=EPSG:3857 et BBOX={bbox-epsg-3857} sont requis.') + '</span></label>' +
            '<label class="pleine"><span>' + trad('couches_attribution', 'Attribution (licence)') + '</span><input id="wms-attrib" placeholder="© Fournisseur du service"></label>' +
            '<label><span>' + trad('couches_version', 'Version WMS') + '</span><select id="wms-version">' +
            '<option value="1.1.1" selected>1.1.1</option>' +
            '<option value="1.3.0">1.3.0</option>' +
            '</select></label>' +
            '<label><span>' + trad('couches_opacite', 'Opacité') + '</span><input type="number" id="wms-opacite" min="0" max="1" step="0.05" value="0.7"></label>' +
            '<div class="wms-erreur" id="wms-erreur"></div>' +
            '<div class="wms-actions">' +
            '<button type="button" class="btn" id="wms-annuler">' + trad('couches_annuler', 'Annuler') + '</button>' +
            '<button type="submit" class="btn btn-primary">' + trad('couches_enregistrer', 'Ajouter la couche') + '</button>' +
            '</div>' +
            '</form>' +
            '</div>';
        ov.addEventListener('click', function (e) { if (e.target === e.currentTarget) fermerFormulaire(); });
        ov.querySelector('#wms-fermer').addEventListener('click', fermerFormulaire);
        ov.querySelector('#wms-annuler').addEventListener('click', fermerFormulaire);
        ov.querySelector('#wms-form').addEventListener('submit', function (ev) {
            ev.preventDefault();
            enregistrer();
        });
        document.body.appendChild(ov);
        modale = ov;
        return modale;
    }

    function ouvrirFormulaire() {
        var ov = construireModale();
        ov.classList.add('ouvert');
        var erreur = ov.querySelector('#wms-erreur');
        if (erreur) erreur.textContent = '';
    }

    function fermerFormulaire() {
        if (modale) modale.classList.remove('ouvert');
    }

    function enregistrer() {
        if (!modale) return;
        var erreur = modale.querySelector('#wms-erreur');
        var nom = modale.querySelector('#wms-nom').value.trim();
        var url = modale.querySelector('#wms-url').value.trim();
        if (!nom || !url) {
            if (erreur) erreur.textContent = trad('couches_champs_requis', 'Nom et URL requis.');
            return;
        }
        fetch('/api/couches-wms/', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken(), 'X-Requested-With': 'XMLHttpRequest' },
            body: JSON.stringify({
                nom: nom,
                url: url,
                version: modale.querySelector('#wms-version').value,
                attribution: modale.querySelector('#wms-attrib').value.trim(),
                opacite: parseFloat(modale.querySelector('#wms-opacite').value) || 0.7
            })
        }).then(function (r) {
            return r.json().then(function (d) { return { ok: r.ok, d: d }; });
        }).then(function (res) {
            if (!res.ok) {
                if (erreur) erreur.textContent = res.d.erreur || trad('couches_erreur', 'Erreur lors de l’enregistrement.');
                return;
            }
            var c = res.d.couche;
            if (c.visible) ajouter(mapRef, c);
            couches.push(c);
            rendreListe();
            fermerFormulaire();
        }).catch(function () {
            if (erreur) erreur.textContent = trad('couches_erreur', 'Erreur lors de l’enregistrement.');
        });
    }

    globalThis.CouchesWMS = {
        installer: installer,
        charger: charger,
        rendreListe: rendreListe,
        ouvrirFormulaire: ouvrirFormulaire
    };
})();
