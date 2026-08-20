/* MUKMAP — Statut des sources cartographiques (cahier des charges CARTES).
 * Panneau professionnel : liste les fonds de carte avec fournisseur, licence,
 * zoom max, statut de disponibilité, dernière vérification, boutons Tester et
 * Alternative (bascule sur le fond de secours configuré).
 * Core pur exposé sous globalThis.SourcesCartoCore : testable en Node.
 */
(function () {
    'use strict';

    var CORE = {
        /* Normalise la liste des fonds pour le panneau. */
        construireListe: function (fonds) {
            return (fonds || []).map(function (f) {
                return {
                    id: f.id,
                    nom: f.nom || f.id,
                    fournisseur: f.fournisseur || '—',
                    licence: f.licence || f.attribution || '—',
                    zoomMax: f.zoomMax || 19,
                    fallback: f.fallback || 'osm',
                    statut: 'inconnu',
                    derniereVerification: null
                };
            });
        },

        /* Coordonnées tuile slippy (z/x/y) pour un point et un zoom. */
        tuilePour: function (lon, lat, z) {
            var n = Math.pow(2, z);
            var x = Math.floor((lon + 180) / 360 * n);
            var latRad = lat * Math.PI / 180;
            var y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
            return { x: x, y: y, z: z };
        },

        /* Construit l'URL de test à partir du motif du fond (XYZ/WMTS/WMS). */
        urlTest: function (tiles, lon, lat, z) {
            if (!tiles) return null;
            var t = CORE.tuilePour(lon, lat, z);
            var n = Math.pow(2, t.z);
            var lon0 = (t.x / n) * 360 - 180;
            var latRad0 = Math.atan(Math.sinh(Math.PI * (1 - 2 * t.y / n)));
            var lon1 = ((t.x + 1) / n) * 360 - 180;
            var latRad1 = Math.atan(Math.sinh(Math.PI * (1 - 2 * (t.y + 1) / n)));
            var bbox = lon0 + ',' + (latRad0 * 180 / Math.PI) + ',' + lon1 + ',' + (latRad1 * 180 / Math.PI);
            var url = tiles
                .replace(/\{a-c\}/g, 'a')
                .replace(/\{s\}/g, 'a')
                .replace(/\{z\}/g, String(t.z))
                .replace(/\{x\}/g, String(t.x))
                .replace(/\{y\}/g, String(t.y))
                .replace(/\{r\}/g, '')
                .replace(/\{TileMatrix\}/g, String(t.z))
                .replace(/\{TileCol\}/g, String(t.x))
                .replace(/\{TileRow\}/g, String(t.y))
                .replace(/\{bbox-epsg-3857\}/g, bbox);
            if (url.indexOf('{') !== -1) return null;
            return url;
        },

        /* Résultat d'un test réseau : {ok, statut, url}. */
        resoudre: function (ok, url) {
            return { ok: !!ok, statut: ok ? 'ok' : 'echec', url: url || '' };
        }
    };

    globalThis.SourcesCartoCore = CORE;

    if (typeof document === 'undefined') return;

    // ── UI : panneau modal « Statut des sources » ──
    var modale = null;
    var mapRef = null;
    var fondsRef = [];
    var appliquerRef = null;
    var actifRef = 'osm';
    var ligneParId = {};

    function trad(cle, defaut) {
        if (typeof window !== 'undefined' && window.mukmapT) {
            var v = window.mukmapT(cle);
            if (v) return v;
        }
        return defaut;
    }

    function baserStyle() {
        if (document.getElementById('sources-carto-css')) return;
        var s = document.createElement('style');
        s.id = 'sources-carto-css';
        s.textContent =
            '#modal-sources { position: fixed; inset: 0; z-index: 1400; display: none; align-items: center; justify-content: center; background: rgba(8,10,24,.68); backdrop-filter: blur(6px); }' +
            '#modal-sources.ouvert { display: flex; }' +
            '#modal-sources .sc-boite { width: min(820px, 95vw); max-height: 86vh; overflow: hidden; background: var(--bg-2); border: 1px solid var(--border); border-radius: 16px; box-shadow: var(--shadow); display: flex; flex-direction: column; }' +
            '#modal-sources .sc-tete { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--border); }' +
            '#modal-sources .sc-titre { display: flex; align-items: center; gap: 9px; font-weight: 800; font-size: .98rem; }' +
            '#modal-sources .sc-titre [data-lucide] { width: 19px; height: 19px; color: var(--accent); }' +
            '#modal-sources .sc-corps { padding: 12px 18px; overflow-y: auto; display: grid; gap: 8px; }' +
            '#modal-sources .sc-actions { display: flex; gap: 8px; justify-content: flex-end; padding: 10px 18px; border-top: 1px solid var(--border); }' +
            '#modal-sources .sc-ligne { display: grid; grid-template-columns: 14px minmax(130px, 1.4fr) minmax(120px, 1fr) minmax(140px, 1.2fr) 52px 128px 90px; gap: 8px; align-items: center; background: var(--bg-3); border: 1px solid var(--border); border-radius: 10px; padding: 8px 10px; font-size: .7rem; }' +
            '#modal-sources .sc-ligne.actif { border-color: var(--accent); }' +
            '#modal-sources .sc-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--text-3); }' +
            '#modal-sources .sc-dot.ok { background: var(--green, #22c55e); }' +
            '#modal-sources .sc-dot.echec { background: var(--red, #ef4444); }' +
            '#modal-sources .sc-nom { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }' +
            '#modal-sources .sc-nom small { display: block; font-weight: 500; color: var(--text-3); font-size: .62rem; }' +
            '#modal-sources .sc-licence { color: var(--text-3); font-size: .64rem; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }' +
            '#modal-sources .sc-zm { text-align: center; color: var(--text-2); font-weight: 600; }' +
            '#modal-sources .sc-horodatage { color: var(--text-3); font-size: .62rem; text-align: right; }' +
            '#modal-sources .sc-btn { border: 1px solid var(--border); background: var(--bg-2); color: var(--text-2); border-radius: 8px; padding: 5px 8px; font-size: .66rem; font-weight: 700; cursor: pointer; }' +
            '#modal-sources .sc-btn:hover { border-color: var(--accent); color: var(--accent); }' +
            '#modal-sources .sc-btn:disabled { opacity: .45; cursor: wait; }' +
            '#modal-sources .sc-btn-alt { color: var(--accent); }' +
            '#modal-sources .sc-pied { font-size: .66rem; color: var(--text-3); padding: 0 18px 12px; line-height: 1.5; }';
        document.head.appendChild(s);
    }

    function construireModale() {
        if (modale) return modale;
        baserStyle();
        var ov = document.createElement('div');
        ov.id = 'modal-sources';
        ov.innerHTML =
            '<div class="sc-boite">' +
            '<div class="sc-tete">' +
            '<div class="sc-titre"><span data-lucide="activity"></span><span>' + trad('statut_sources', 'Statut des sources') + '</span></div>' +
            '<button type="button" class="btn btn-icon btn-sm" id="sc-fermer">✕</button>' +
            '</div>' +
            '<div class="sc-corps" id="sc-corps"></div>' +
            '<div class="sc-actions">' +
            '<button type="button" class="btn btn-sm btn-primary" id="sc-tester-tous">⚡ ' + trad('statut_tester', 'Tester') + ' tout</button>' +
            '</div>' +
            '<div class="sc-pied">' + trad('statut_fournisseur', 'Fournisseur') + ' · ' + trad('statut_licence', 'Licence') + ' · ' + trad('statut_zoom_max', 'Zoom max') + '</div>' +
            '</div>';
        ov.querySelector('#sc-fermer').addEventListener('click', function () { ov.classList.remove('ouvert'); });
        ov.addEventListener('click', function (e) { if (e.target === ov) ov.classList.remove('ouvert'); });
        ov.querySelector('#sc-tester-tous').addEventListener('click', testerTous);
        document.body.appendChild(ov);
        modale = ov;
        return ov;
    }

    function rendreListe() {
        var corps = document.getElementById('sc-corps');
        if (!corps) return;
        corps.innerHTML = '';
        ligneParId = {};
        fondsRef.forEach(function (f) {
            var div = document.createElement('div');
            div.className = 'sc-ligne' + (f.id === actifRef ? ' actif' : '');
            var dot = document.createElement('span');
            dot.className = 'sc-dot ' + f.statut;
            dot.title = f.statut;
            var nom = document.createElement('div');
            nom.className = 'sc-nom';
            nom.textContent = f.nom;
            var four = document.createElement('small');
            four.textContent = f.fournisseur;
            nom.appendChild(four);
            var lic = document.createElement('div');
            lic.className = 'sc-licence';
            lic.textContent = f.licence;
            lic.title = f.licence;
            var zm = document.createElement('div');
            zm.className = 'sc-zm';
            zm.textContent = 'z' + f.zoomMax;
            var horo = document.createElement('div');
            horo.className = 'sc-horodatage';
            horo.textContent = f.derniereVerification ? (f.derniereVerification + 'h') : '—';
            var btnTest = document.createElement('button');
            btnTest.type = 'button';
            btnTest.className = 'sc-btn';
            btnTest.textContent = trad('statut_tester', 'Tester');
            btnTest.addEventListener('click', function () { testerFond(f, btnTest); });
            var btnAlt = document.createElement('button');
            btnAlt.type = 'button';
            btnAlt.className = 'sc-btn sc-btn-alt';
            btnAlt.textContent = trad('statut_alternative', 'Alternative');
            btnAlt.title = f.fallback;
            btnAlt.addEventListener('click', function () {
                if (appliquerRef) appliquerRef(f.fallback);
                fermer();
            });
            [dot, nom, lic, zm, horo, btnTest, btnAlt].forEach(function (el) { div.appendChild(el); });
            ligneParId[f.id] = { dot: dot, horo: horo, btn: btnTest };
            corps.appendChild(div);
        });
    }

    function testerFond(f, btn) {
        if (!mapRef) return Promise.resolve();
        var centre = mapRef.getCenter ? mapRef.getCenter() : { lng: 29.22, lat: -1.67 };
        var z = Math.min(f.zoomMax || 10, mapRef.getZoom ? Math.round(mapRef.getZoom()) : 9);
        var fond = window.BasemapSelectorCore && window.BasemapSelectorCore.obtenir ? window.BasemapSelectorCore.obtenir(f.id) : null;
        var tiles = (fond && fond.tiles) || null;
        var url = CORE.urlTest(tiles, centre.lng, centre.lat, z);
        if (btn) { btn.disabled = true; }
        if (!url) {
            f.statut = 'inconnu';
            f.derniereVerification = null;
            majLigne(f);
            if (btn) btn.disabled = false;
            return Promise.resolve();
        }
        var ctrl = new AbortController();
        var timer = setTimeout(function () { ctrl.abort(); }, 9000);
        return fetch(url, { mode: 'cors', signal: ctrl.signal, headers: { 'Accept': 'image/*,*/*' } })
            .then(function (r) {
                f.statut = (r && r.ok) ? 'ok' : 'echec';
                f.derniereVerification = new Date().toISOString().slice(11, 16);
                majLigne(f);
                return CORE.resoudre(f.statut === 'ok', url);
            })
            .catch(function () {
                f.statut = 'echec';
                f.derniereVerification = new Date().toISOString().slice(11, 16);
                majLigne(f);
                return CORE.resoudre(false, url);
            })
            .finally(function () {
                clearTimeout(timer);
                if (btn) btn.disabled = false;
            });
    }

    function majLigne(f) {
        var l = ligneParId[f.id];
        if (!l) return;
        l.dot.className = 'sc-dot ' + f.statut;
        l.horo.textContent = f.derniereVerification ? (f.derniereVerification + 'h') : '—';
    }

    function testerTous() {
        var chaine = Promise.resolve();
        fondsRef.forEach(function (f) {
            chaine = chaine.then(function () { return testerFond(f, null); });
        });
    }

    function demarrer(opts) {
        if (opts && opts.map) mapRef = opts.map;
        if (opts && opts.fonds) fondsRef = CORE.construireListe(opts.fonds);
        if (opts && opts.appliquerBasemap) appliquerRef = opts.appliquerBasemap;
        if (opts && opts.actifId) actifRef = opts.actifId;
        construireModale();
    }

    function ouvrir() {
        var m = construireModale();
        rendreListe();
        m.classList.add('ouvert');
    }

    function fermer() {
        if (modale) modale.classList.remove('ouvert');
    }

    globalThis.SourcesCartographiques = {
        demarrer: demarrer,
        ouvrir: ouvrir,
        fermer: fermer,
        testerFond: testerFond,
        testerTous: testerTous,
        rendreListe: rendreListe,
        Core: CORE
    };
})();