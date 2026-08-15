/* MUKMAP — Outils Topographiques.
 * Core exposé sous globalThis.OutilsTopo : testable en Node (document indéfini).
 * En navigateur, ajoute le groupe « Outils Topographiques » (tous les utilisateurs) :
 *  - mesure de distance : horizontale, 3D (relief), cumulée par segment ;
 *  - mesure de surface : planimétrique 2D, projetée (EPSG:3857), sur terrain (triangulation) ;
 *  - altitude au clic : latitude, longitude, altitude (Open-Meteo), EPSG:3857, UTM ;
 *  - profil altimétrique A→B : échantillonnage SRTM (OpenTopoData), courbe, stats
 *    (distance, alt min/max, dénivelé, pente moyenne) et export PNG/CSV.
 * Altitudes : services publics gratuits sans clé (SRTM 90 m).
 */
(function () {
    'use strict';

    var R_TERRE = 6371008.8;
    var URL_ELEVATION_POINT = 'https://api.open-meteo.com/v1/elevation?latitude={lat}&longitude={lng}';
    var URL_ELEVATION_PROFIL = 'https://api.opentopodata.org/v1/srtm90m?locations={locations}';
    var MAX_ECHANTILLONS = 100;

    var ModeActif = null;
    var PointsCourants = [];

    function trad(cle, defaut) {
        if (typeof window !== 'undefined' && window.mukmapT) {
            var v = window.mukmapT(cle);
            if (v) return v;
        }
        return defaut;
    }

    /* ── Cœur testable ── */

    function haversine(a, b) {
        var f1 = Number(a.lat) * Math.PI / 180;
        var f2 = Number(b.lat) * Math.PI / 180;
        var df = (Number(b.lat) - Number(a.lat)) * Math.PI / 180;
        var dl = (Number(b.lng) - Number(a.lng)) * Math.PI / 180;
        var s = Math.sin(df / 2) * Math.sin(df / 2) +
            Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) * Math.sin(dl / 2);
        return 2 * R_TERRE * Math.asin(Math.sqrt(s));
    }

    function distance2D(points) {
        var t = 0;
        for (var i = 1; i < points.length; i++) t += haversine(points[i - 1], points[i]);
        return t;
    }

    function distance3D(points) {
        var t = 0;
        for (var i = 1; i < points.length; i++) {
            var dH = haversine(points[i - 1], points[i]);
            var a0 = Number(points[i - 1].alt) || 0;
            var a1 = Number(points[i].alt) || 0;
            t += Math.sqrt(dH * dH + (a1 - a0) * (a1 - a0));
        }
        return t;
    }

    function cumulerDistances(points) {
        var out = [];
        var h = 0, d = 0;
        for (var i = 0; i < points.length; i++) {
            if (i > 0) {
                var dH = haversine(points[i - 1], points[i]);
                var a0 = Number(points[i - 1].alt) || 0;
                var a1 = Number(points[i].alt) || 0;
                h += dH;
                d += Math.sqrt(dH * dH + (a1 - a0) * (a1 - a0));
            }
            out.push({ d2d: h, d3d: d });
        }
        return out;
    }

    function penteSegment(points, i) {
        if (i <= 0 || i >= points.length) return 0;
        var dH = haversine(points[i - 1], points[i]);
        if (dH <= 0) return 0;
        return ((Number(points[i].alt) || 0) - (Number(points[i - 1].alt) || 0)) / dH * 100;
    }

    function projeter3857(lat, lng) {
        var R = 6378137;
        return {
            x: R * Number(lng) * Math.PI / 180,
            y: R * Math.log(Math.tan(Math.PI / 4 + Number(lat) * Math.PI / 360))
        };
    }

    function shoelace(xy) {
        var a = 0;
        for (var i = 0; i < xy.length; i++) {
            var j = (i + 1) % xy.length;
            a += xy[i].x * xy[j].y - xy[j].x * xy[i].y;
        }
        return Math.abs(a) / 2;
    }

    function surfacePlanimetrique(coords) {
        var latM = 0;
        for (var i = 0; i < coords.length; i++) latM += Number(coords[i][1]);
        latM /= coords.length;
        var c = Math.cos(latM * Math.PI / 180);
        var xy = coords.map(function (p) {
            return { x: Number(p[0]) * 111320 * c, y: Number(p[1]) * 111320 };
        });
        return shoelace(xy);
    }

    function surfaceProjetee(coords) {
        var xy = coords.map(function (p) { return projeter3857(p[1], p[0]); });
        return shoelace(xy);
    }

    function aireTriangle3D(a, b, c) {
        function cote(p, q) {
            var h = haversine(p, q);
            var dz = (Number(p.alt) || 0) - (Number(q.alt) || 0);
            return Math.sqrt(h * h + dz * dz);
        }
        var ab = cote(a, b), bc = cote(b, c), ca = cote(c, a);
        var s = (ab + bc + ca) / 2;
        return Math.sqrt(Math.max(0, s * (s - ab) * (s - bc) * (s - ca)));
    }

    function surfaceTerrain(coords, alts) {
        var n = coords.length;
        if (n < 3) return 0;
        var latC = 0, lngC = 0;
        for (var i = 0; i < n; i++) { latC += Number(coords[i][1]); lngC += Number(coords[i][0]); }
        latC /= n; lngC /= n;
        var centre = { lat: latC, lng: lngC, alt: Number(alts.centre) || 0 };
        var total = 0;
        for (var k = 0; k < n; k++) {
            var j = (k + 1) % n;
            total += aireTriangle3D(
                centre,
                { lat: Number(coords[k][1]), lng: Number(coords[k][0]), alt: Number(alts.sommets[k]) || 0 },
                { lat: Number(coords[j][1]), lng: Number(coords[j][0]), alt: Number(alts.sommets[j]) || 0 }
            );
        }
        return total;
    }

    function echantillonner(points, nb) {
        if (points.length < 2) return points.slice();
        var cumul = [0];
        for (var i = 1; i < points.length; i++) cumul.push(cumul[i - 1] + haversine(points[i - 1], points[i]));
        var total = cumul[cumul.length - 1];
        if (total <= 0) return points.slice();
        var pas = total / (nb - 1);
        var out = [];
        var idx = 0;
        for (var k = 0; k < nb; k++) {
            var cible = k * pas;
            while (idx < cumul.length - 2 && cumul[idx + 1] < cible) idx++;
            var dSeg = cumul[idx + 1] - cumul[idx];
            var t = dSeg > 0 ? (cible - cumul[idx]) / dSeg : 0;
            out.push({
                lat: Number(points[idx].lat) + (Number(points[idx + 1].lat) - Number(points[idx].lat)) * t,
                lng: Number(points[idx].lng) + (Number(points[idx + 1].lng) - Number(points[idx].lng)) * t
            });
        }
        out[out.length - 1] = { lat: Number(points[points.length - 1].lat), lng: Number(points[points.length - 1].lng) };
        return out;
    }

    function construireLocations(points) {
        return points.map(function (p) {
            return Number(p.lat).toFixed(5) + ',' + Number(p.lng).toFixed(5);
        }).join('|');
    }

    function lireElevationOpenMeteo(data) {
        var v = data && data.elevation;
        if (Array.isArray(v) && v.length) return Number(v[0]);
        return typeof v === 'number' ? v : null;
    }

    function lireElevationsOpenTopoData(data) {
        var out = [];
        (data && data.results || []).forEach(function (r) {
            out.push(typeof r.elevation === 'number' ? r.elevation : null);
        });
        return out;
    }

    function statsProfil(pts) {
        var distance = distance2D(pts);
        var min = Infinity, max = -Infinity;
        for (var i = 0; i < pts.length; i++) {
            var a = (pts[i].alt === null || pts[i].alt === undefined) ? NaN : Number(pts[i].alt);
            if (!isFinite(a)) continue;
            if (a < min) min = a;
            if (a > max) max = a;
        }
        if (!isFinite(min)) return { distance: distance, altMin: null, altMax: null, denivele: null, penteMoyenne: null };
        var a0 = Number(pts[0].alt);
        var aN = Number(pts[pts.length - 1].alt);
        var denivele = (isFinite(a0) && isFinite(aN)) ? aN - a0 : null;
        var penteMoyenne = distance > 0 && denivele !== null ? denivele / distance * 100 : null;
        return { distance: distance, altMin: min, altMax: max, denivele: denivele, penteMoyenne: penteMoyenne };
    }

    function utmZone(lng) {
        return Math.floor((Number(lng) + 180) / 6) + 1;
    }

    function utmCoordonnees(lat, lng) {
        var a = 6378137, f = 1 / 298.257223563;
        var e2 = f * (2 - f);
        var k0 = 0.9996;
        var zone = utmZone(lng);
        var lng0 = (zone * 6 - 183) * Math.PI / 180;
        var phi = Number(lat) * Math.PI / 180;
        var l = Number(lng) * Math.PI / 180 - lng0;
        var ep2 = e2 / (1 - e2);
        var N = a / Math.sqrt(1 - e2 * Math.sin(phi) * Math.sin(phi));
        var T = Math.tan(phi) * Math.tan(phi);
        var C = ep2 * Math.cos(phi) * Math.cos(phi);
        var A = Math.cos(phi) * l;
        var M = a * ((1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256) * phi
            - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 * e2 * e2 / 1024) * Math.sin(2 * phi)
            + (15 * e2 * e2 / 256 + 45 * e2 * e2 * e2 / 1024) * Math.sin(4 * phi)
            - (35 * e2 * e2 * e2 / 3072) * Math.sin(6 * phi));
        var est = k0 * N * (A + (1 - T + C) * A * A * A / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A * A * A * A * A / 120) + 500000;
        var nord = k0 * (M + N * Math.tan(phi) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A * A * A * A / 24
            + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A * A * A * A * A * A / 720));
        if (Number(lat) < 0) nord += 10000000;
        return { zone: zone, est: est, nord: nord, hemisphere: Number(lat) < 0 ? 'S' : 'N' };
    }

    globalThis.OutilsTopo = {
        modeActif: function () { return ModeActif; },
        fermer: fermer,
        pointsCourants: function () { return PointsCourants; },
        haversine: haversine,
        distance2D: distance2D,
        distance3D: distance3D,
        cumulerDistances: cumulerDistances,
        penteSegment: penteSegment,
        projeter3857: projeter3857,
        surfacePlanimetrique: surfacePlanimetrique,
        surfaceProjetee: surfaceProjetee,
        surfaceTerrain: surfaceTerrain,
        echantillonner: echantillonner,
        construireLocations: construireLocations,
        lireElevationOpenMeteo: lireElevationOpenMeteo,
        lireElevationsOpenTopoData: lireElevationsOpenTopoData,
        statsProfil: statsProfil,
        utmZone: utmZone,
        utmCoordonnees: utmCoordonnees,
        R_TERRE: R_TERRE,
        URL_ELEVATION_POINT: URL_ELEVATION_POINT,
        URL_ELEVATION_PROFIL: URL_ELEVATION_PROFIL,
        MAX_ECHANTILLONS: MAX_ECHANTILLONS
    };

    if (typeof document === 'undefined') return;

    /* ── Interface navigateur ── */

    var Carte = null;
    var Panneau = null;
    var SourceDessin = null;
    var EnRequete = false;

    function injecterCSS() {
        if (document.getElementById('topo-css')) return;
        var st = document.createElement('style');
        st.id = 'topo-css';
        st.textContent =
            '#btn-topo.maplibregl-ctrl { background: transparent; padding: 0; }' +
            'body.mukmap-3d #btn-topo { position: fixed; top: 114px; right: 14px; z-index: 1300; }' +
            '#btn-topo button { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-2); color: var(--text-2); cursor: pointer; box-shadow: var(--shadow); }' +
            '#btn-topo button:hover { color: var(--accent); border-color: var(--accent); }' +
            '#btn-topo button.active { background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: #fff; border-color: transparent; }' +
            '#panneau-topo { position: fixed; right: 14px; top: 74px; z-index: 1007; width: 300px; max-height: calc(100vh - 160px); overflow-y: auto; background: var(--bg-2); border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--shadow); font-size: .76rem; color: var(--text-2); display: none; }' +
            '#panneau-topo.ouvert { display: block; }' +
            '.p-topo-tete { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid var(--border); }' +
            '.p-topo-titre { display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: .84rem; color: var(--text); }' +
            '.p-topo-titre [data-lucide] { width: 15px; height: 15px; color: var(--accent); }' +
            '.p-topo-boutons { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 12px 14px; }' +
            '.p-topo-bouton { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 4px; border-radius: 9px; border: 1px solid var(--border); background: var(--bg-3); color: var(--text-2); font-size: .7rem; font-weight: 700; cursor: pointer; transition: all .15s; }' +
            '.p-topo-bouton:hover { border-color: var(--accent); color: var(--accent); }' +
            '.p-topo-bouton.actif { background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: #fff; border-color: transparent; }' +
            '.p-topo-bouton [data-lucide] { width: 13px; height: 13px; }' +
            '.p-topo-hint { padding: 0 14px 10px; font-size: .7rem; color: var(--text-3); line-height: 1.5; }' +
            '.p-topo-resultats { padding: 0 14px 12px; }' +
            '.p-topo-stat { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; padding: 6px 9px; border-radius: 8px; background: var(--bg-3); margin-bottom: 5px; font-size: .74rem; }' +
            '.p-topo-stat b { color: var(--text); font-weight: 800; }' +
            '.p-topo-seg { font-size: .68rem; color: var(--text-3); padding: 3px 9px; display: flex; justify-content: space-between; gap: 8px; border-bottom: 1px dashed var(--border); }' +
            '.p-topo-actions { display: flex; gap: 6px; padding: 0 14px 12px; }' +
            '.p-topo-actions .btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 5px; padding: 7px 8px; font-size: .7rem; font-weight: 700; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-3); color: var(--text-2); cursor: pointer; }' +
            '.p-topo-actions .btn:hover { border-color: var(--accent); color: var(--accent); }' +
            '.p-topo-canvas { width: 100%; height: 150px; border-radius: 9px; border: 1px solid var(--border); background: var(--bg-3); margin-bottom: 8px; display: block; }' +
            '.p-topo-msg { padding: 14px; text-align: center; color: var(--text-3); font-size: .72rem; }' +
            '.p-topo-chargement { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; color: var(--text-3); font-size: .7rem; }' +
            '.p-topo-chargement .spin { width: 15px; height: 15px; border-radius: 50%; border: 2px solid rgba(255,255,255,.2); border-top-color: var(--accent); animation: mukmapSpin .8s linear infinite; }';
        document.head.appendChild(st);
    }

    function creerPanneau() {
        var p = document.createElement('div');
        p.id = 'panneau-topo';

        var tete = document.createElement('div');
        tete.className = 'p-topo-tete';
        tete.innerHTML = '<div class="p-topo-titre"><span data-lucide="ruler"></span><span>' + trad('topo_titre', 'Outils Topographiques') + '</span></div>' +
            '<button type="button" class="btn btn-icon btn-sm" id="btn-topo-fermer" title="' + trad('fermer', 'Fermer') + '">✕</button>';

        var boutons = document.createElement('div');
        boutons.className = 'p-topo-boutons';
        boutons.innerHTML =
            '<button type="button" class="p-topo-bouton" data-mesure="distance"><span data-lucide="ruler"></span>' + trad('topo_distance', 'Distance') + '</button>' +
            '<button type="button" class="p-topo-bouton" data-mesure="surface"><span data-lucide="square"></span>' + trad('topo_surface', 'Surface') + '</button>' +
            '<button type="button" class="p-topo-bouton" data-mesure="altitude"><span data-lucide="crosshair"></span>' + trad('topo_altitude', 'Altitude') + '</button>' +
            '<button type="button" class="p-topo-bouton" data-mesure="profil"><span data-lucide="chart-line"></span>' + trad('topo_profil', 'Profil A→B') + '</button>';

        var hint = document.createElement('div');
        hint.className = 'p-topo-hint';
        hint.id = 'topo-hint';

        var resultats = document.createElement('div');
        resultats.className = 'p-topo-resultats';
        resultats.id = 'topo-resultats';

        var actions = document.createElement('div');
        actions.className = 'p-topo-actions';
        actions.innerHTML =
            '<button type="button" class="btn" id="btn-topo-terminer">' + trad('topo_terminer', 'Terminer') + '</button>' +
            '<button type="button" class="btn" id="btn-topo-effacer">' + trad('topo_effacer', 'Effacer') + '</button>';

        p.appendChild(tete);
        p.appendChild(boutons);
        p.appendChild(hint);
        p.appendChild(resultats);
        p.appendChild(actions);

        p.querySelectorAll('[data-mesure]').forEach(function (b) {
            b.addEventListener('click', function () { activerMode(b.getAttribute('data-mesure')); });
        });
        p.querySelector('#btn-topo-fermer').addEventListener('click', function () {
            p.classList.remove('ouvert');
            activerMode(null);
            if (window.lucide) window.lucide.createIcons();
        });
        p.querySelector('#btn-topo-terminer').addEventListener('click', terminerMesure);
        p.querySelector('#btn-topo-effacer').addEventListener('click', effacerMesure);
        return p;
    }

    var ControleTopo = {
        _installe: false,
        onAdd: function (map) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.id = 'btn-topo-ouvrir';
            btn.innerHTML = '<span data-lucide="ruler"></span>';
            btn.title = trad('topo_titre', 'Outils Topographiques');
            btn.addEventListener('click', function () {
                var p = document.getElementById('panneau-topo');
                if (p) {
                    p.classList.toggle('ouvert');
                    if (!p.classList.contains('ouvert')) activerMode(null);
                }
                if (window.lucide) window.lucide.createIcons();
            });
            this._btn = btn;
            var ctr = document.createElement('div');
            ctr.id = 'btn-topo';
            ctr.className = 'maplibregl-ctrl';
            ctr.appendChild(btn);
            return ctr;
        },
        onRemove: function () {
            if (this._btn && this._btn.parentNode) this._btn.parentNode.removeChild(this._btn);
        }
    };

    function activerMode(mode) {
        if (mode && window.Mode3D && typeof window.Mode3D.estActif === 'function' &&
            window.Mode3D.estActif() && typeof window.Mode3D.desactiver === 'function') {
            window.Mode3D.desactiver();
        }
        ModeActif = mode === ModeActif ? null : mode;
        effacerPoints(true);
        majBoutons();
        majHint();
        var p = document.getElementById('panneau-topo');
        if (p && mode) p.classList.add('ouvert');
        if (window.lucide) window.lucide.createIcons();
    }

    function fermer() {
        activerMode(null);
        var p = document.getElementById('panneau-topo');
        if (p) p.classList.remove('ouvert');
    }

    function gererMode3D() {
        if (typeof document === 'undefined') return;
        var en3d = document.body.classList.contains('mukmap-3d');
        var btn = document.getElementById('btn-topo');
        if (!btn) return;
        if (en3d && btn.parentNode !== document.body) {
            document.body.appendChild(btn);
        } else if (!en3d && btn.parentNode === document.body) {
            var c = document.querySelector('.maplibregl-ctrl-top-right');
            if (c) c.appendChild(btn);
        }
    }

    function majBoutons() {
        document.querySelectorAll('.p-topo-bouton').forEach(function (b) {
            b.classList.toggle('actif', b.getAttribute('data-mesure') === ModeActif);
        });
    }

    function majHint() {
        var el = document.getElementById('topo-hint');
        if (!el) return;
        var texte = '';
        if (ModeActif === 'distance') texte = trad('topo_hint_distance', 'Cliquez sur la carte pour ajouter des points. Le bouton « Terminer » clôt la mesure.');
        else if (ModeActif === 'surface') texte = trad('topo_hint_surface', 'Cliquez pour tracer le contour (au moins 3 points), puis « Terminer ».');
        else if (ModeActif === 'altitude') texte = trad('topo_hint_altitude', 'Cliquez n’importe où sur la carte : latitude, longitude, altitude et coordonnées projetées s’affichent.');
        else if (ModeActif === 'profil') texte = trad('topo_hint_profil', 'Cliquez sur le point A puis le point B : le profil altimétrique est tracé automatiquement.');
        el.textContent = texte;
    }

    function effacerPoints(avecMode) {
        PointsCourants = [];
        var r = document.getElementById('topo-resultats');
        if (r) r.innerHTML = '';
        if (avecMode && SourceDessin) SourceDessin.setData({ type: 'FeatureCollection', features: [] });
    }

    function effacerMesure() {
        effacerPoints(true);
    }

    function terminerMesure() {
        if (ModeActif === 'distance' && PointsCourants.length >= 2) terminerDistance();
        else if (ModeActif === 'surface' && PointsCourants.length >= 3) terminerSurface();
    }

    function majDessin() {
        if (!SourceDessin) return;
        var features = [];
        if (PointsCourants.length > 1) {
            if (ModeActif === 'surface') {
                features.push({ type: 'Feature', properties: { type: 'polygone' }, geometry: { type: 'Polygon', coordinates: [PointsCourants.map(function (p) { return [p.lng, p.lat]; })] } });
            } else if (ModeActif === 'distance' || ModeActif === 'profil') {
                features.push({ type: 'Feature', properties: { type: 'ligne' }, geometry: { type: 'LineString', coordinates: PointsCourants.map(function (p) { return [p.lng, p.lat]; }) } });
            }
        }
        if (PointsCourants.length > 0) {
            features.push({ type: 'Feature', properties: { type: 'points' }, geometry: { type: 'MultiPoint', coordinates: PointsCourants.map(function (p) { return [p.lng, p.lat]; }) } });
        }
        SourceDessin.setData({ type: 'FeatureCollection', features: features });
    }

    function ajouterPoint(e) {
        PointsCourants.push({ lat: e.lngLat.lat, lng: e.lngLat.lng });
        majDessin();
        if (ModeActif === 'distance') majDistanceEnCours();
        else if (ModeActif === 'surface') majSurfaceEnCours();
        else if (ModeActif === 'profil' && PointsCourants.length >= 2) terminerProfil();
    }

    function majResultats(html) {
        var r = document.getElementById('topo-resultats');
        if (r) r.innerHTML = html || '';
    }

    function formatM(m) {
        if (!isFinite(m)) return '—';
        return m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m';
    }

    function formatHa(v) {
        return v === null || v === undefined || !isFinite(v) ? '—' : Math.round(v) + ' m';
    }

    /* ── Distance ── */

    function majDistanceEnCours() {
        if (PointsCourants.length < 2) { majResultats(''); return; }
        majResultats('<div class="p-topo-chargement"><div class="spin"></div>' + trad('topo_chargement', 'Lecture des altitudes…') + '</div>');
        lireAltitudes(PointsCourants, function (pts) {
            var cum = cumulerDistances(pts);
            var total = cum[cum.length - 1];
            var html = '<div class="p-topo-stat"><span>' + trad('topo_horizontale', 'Distance horizontale') + '</span><b>' + formatM(total.d2d) + '</b></div>' +
                '<div class="p-topo-stat"><span>' + trad('topo_3d', 'Distance 3D') + '</span><b>' + formatM(total.d3d) + '</b></div>' +
                '<div class="p-topo-stat"><span>' + trad('topo_cumulee', 'Distance cumulée') + '</span><b>' + formatM(total.d3d) + '</b></div>';
            for (var i = 1; i < pts.length; i++) {
                html += '<div class="p-topo-seg"><span>' + trad('topo_segment', 'Segment') + ' ' + i + ' — ' + trad('topo_pente', 'pente') + ' ' + penteSegment(pts, i).toFixed(1) + '%</span><span>' + formatM(cum[i].d3d - cum[i - 1].d3d) + '</span></div>';
            }
            majResultats(html);
        });
    }

    function terminerDistance() {
        majDistanceEnCours();
        activerMode(null);
    }

    /* ── Surface ── */

    function majSurfaceEnCours() {
        if (PointsCourants.length < 3) { majResultats(''); return; }
        majResultats('<div class="p-topo-chargement"><div class="spin"></div>' + trad('topo_chargement', 'Lecture des altitudes…') + '</div>');
        var coords = PointsCourants.map(function (p) { return [p.lng, p.lat]; });
        var centre = {
            lat: PointsCourants.reduce(function (s, p) { return s + p.lat; }, 0) / PointsCourants.length,
            lng: PointsCourants.reduce(function (s, p) { return s + p.lng; }, 0) / PointsCourants.length
        };
        lireAltitudes(PointsCourants.concat([centre]), function (pts) {
            var alts = { sommets: pts.slice(0, PointsCourants.length).map(function (p) { return p.alt; }), centre: pts[pts.length - 1].alt };
            var s2d = surfacePlanimetrique(coords);
            var sproj = surfaceProjetee(coords);
            var sterrain = surfaceTerrain(coords, alts);
            majResultats(
                '<div class="p-topo-stat"><span>' + trad('topo_surface_2d', 'Surface 2D') + '</span><b>' + formatM(s2d) + '²</b></div>' +
                '<div class="p-topo-stat"><span>' + trad('topo_surface_projetee', 'Surface projetée') + '</span><b>' + formatM(sproj) + '²</b></div>' +
                '<div class="p-topo-stat"><span>' + trad('topo_surface_terrain', 'Surface sur terrain') + '</span><b>' + formatM(sterrain) + '²</b></div>'
            );
        });
    }

    function terminerSurface() {
        majSurfaceEnCours();
        activerMode(null);
    }

    /* ── Altitudes partagées ── */

    function lireAltitudes(points, cb) {
        EnRequete = true;
        fetch(URL_ELEVATION_PROFIL.replace('{locations}', construireLocations(points)))
            .then(function (r) { return r.json(); })
            .then(function (data) {
                EnRequete = false;
                var alts = lireElevationsOpenTopoData(data);
                var pts = points.map(function (p, i) { return { lat: p.lat, lng: p.lng, alt: alts[i] !== undefined ? alts[i] : null }; });
                cb(pts);
            })
            .catch(function () {
                EnRequete = false;
                majResultats('<div class="p-topo-msg">' + trad('topo_erreur_reseau', 'Altitude indisponible (connexion requise).') + '</div>');
            });
    }

    /* ── Altitude au clic ── */

    function lireAltitudeClic(e) {
        var pop = new maplibregl.Popup({ offset: [0, -14] })
            .setLngLat(e.lngLat)
            .setHTML('<div class="p-topo-msg" style="padding:8px">' + trad('topo_chargement', 'Lecture des altitudes…') + '</div>')
            .addTo(Carte);
        fetch(URL_ELEVATION_POINT.replace('{lat}', e.lngLat.lat).replace('{lng}', e.lngLat.lng))
            .then(function (r) { return r.json(); })
            .then(function (data) {
                var alt = lireElevationOpenMeteo(data);
                var u = utmCoordonnees(e.lngLat.lat, e.lngLat.lng);
                var m = projeter3857(e.lngLat.lat, e.lngLat.lng);
                var html = '<div style="font-size:.74rem;line-height:1.7;min-width:190px">' +
                    '<div><b>' + trad('topo_latitude', 'Latitude') + ' :</b> ' + e.lngLat.lat.toFixed(5) + '°</div>' +
                    '<div><b>' + trad('topo_longitude', 'Longitude') + ' :</b> ' + e.lngLat.lng.toFixed(5) + '°</div>' +
                    '<div><b>' + trad('topo_altitude_m', 'Altitude') + ' :</b> ' + formatHa(alt) + '</div>' +
                    '<div><b>EPSG:3857 :</b> ' + Math.round(m.x) + ', ' + Math.round(m.y) + '</div>' +
                    '<div><b>UTM :</b> ' + u.zone + ' ' + u.hemisphere + ' — ' + Math.round(u.est) + ', ' + Math.round(u.nord) + '</div>' +
                    '</div>';
                pop.setHTML(html);
            })
            .catch(function () {
                pop.setHTML('<div class="p-topo-msg" style="padding:8px">' + trad('topo_erreur_reseau', 'Altitude indisponible (connexion requise).') + '</div>');
            });
    }

    /* ── Profil altimétrique ── */

    function terminerProfil() {
        var ptsA = PointsCourants;
        PointsCourants = [];
        majDessin();
        var nb = Math.max(2, Math.min(MAX_ECHANTILLONS, Math.round(distance2D(ptsA) / 100)));
        var echant = echantillonner(ptsA, nb);
        majResultats('<div class="p-topo-chargement"><div class="spin"></div>' + trad('topo_chargement', 'Lecture des altitudes…') + '</div>');
        lireAltitudes(echant, function (pts) {
            var stats = statsProfil(pts);
            if (stats.altMin === null) {
                majResultats('<div class="p-topo-msg">' + trad('topo_erreur_reseau', 'Altitude indisponible (connexion requise).') + '</div>');
                return;
            }
            var canvas = document.createElement('canvas');
            canvas.className = 'p-topo-canvas';
            canvas.width = 300;
            canvas.height = 150;
            dessinerProfil(canvas, pts, stats);
            majResultats(
                canvas.outerHTML +
                '<div class="p-topo-stat"><span>' + trad('topo_distance_totale', 'Distance') + '</span><b>' + formatM(stats.distance) + '</b></div>' +
                '<div class="p-topo-stat"><span>' + trad('topo_alt_min', 'Altitude minimale') + '</span><b>' + formatHa(stats.altMin) + '</b></div>' +
                '<div class="p-topo-stat"><span>' + trad('topo_alt_max', 'Altitude maximale') + '</span><b>' + formatHa(stats.altMax) + '</b></div>' +
                '<div class="p-topo-stat"><span>' + trad('topo_denivele', 'Dénivelé total') + '</span><b>' + (stats.denivele === null ? '—' : (stats.denivele >= 0 ? '+' : '') + Math.round(stats.denivele) + ' m') + '</b></div>' +
                '<div class="p-topo-stat"><span>' + trad('topo_pente_moyenne', 'Pente moyenne') + '</span><b>' + (stats.penteMoyenne === null ? '—' : stats.penteMoyenne.toFixed(1) + ' %') + '</b></div>' +
                '<div class="p-topo-actions">' +
                '<button type="button" class="btn" id="btn-topo-export-png">' + trad('topo_exporter_png', 'Exporter PNG') + '</button>' +
                '<button type="button" class="btn" id="btn-topo-export-csv">' + trad('topo_exporter_csv', 'Exporter CSV') + '</button>' +
                '</div>'
            );
            var bP = document.getElementById('btn-topo-export-png');
            if (bP) bP.addEventListener('click', function () {
                try {
                    var a = document.createElement('a');
                    a.download = 'profil-altimetrique.png';
                    a.href = canvas.toDataURL('image/png');
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                } catch (e) {}
            });
            var bC = document.getElementById('btn-topo-export-csv');
            if (bC) bC.addEventListener('click', function () {
                var lignes = ['segment,distance_cumulee_m,altitude_m,pente_pct'];
                var cum = 0;
                for (var i = 0; i < pts.length; i++) {
                    if (i > 0) cum += haversine(pts[i - 1], pts[i]);
                    lignes.push([i + 1, cum.toFixed(1), pts[i].alt, (i > 0 ? penteSegment(pts, i) : 0).toFixed(2)].join(','));
                }
                var blob = new Blob([lignes.join('\n')], { type: 'text/csv;charset=utf-8' });
                var a = document.createElement('a');
                a.download = 'profil-altimetrique.csv';
                a.href = URL.createObjectURL(blob);
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            });
        });
        activerMode(null);
    }

    function dessinerProfil(canvas, pts, stats) {
        var ctx = canvas.getContext('2d');
        var W = canvas.width, H = canvas.height;
        var marge = 22;
        ctx.clearRect(0, 0, W, H);
        var mini = Math.floor(stats.altMin - 10);
        var maxi = Math.ceil(stats.altMax + 10);
        var plage = Math.max(1, maxi - mini);
        function x(i) { return marge + (W - marge * 2) * (stats.distance > 0 ? i / (pts.length - 1) : 0); }
        function y(a) { return H - marge - (H - marge * 2) * ((a - mini) / plage); }
        ctx.strokeStyle = 'rgba(160,163,194,.35)';
        ctx.fillStyle = 'rgba(160,163,194,.55)';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(formatHa(stats.altMax), 2, y(stats.altMax) + 3);
        ctx.fillText(formatHa(stats.altMin), 2, y(stats.altMin) + 3);
        ctx.beginPath();
        ctx.moveTo(x(0), y(Number(pts[0].alt) || mini));
        ctx.lineTo(x(pts.length - 1), y(Number(pts[pts.length - 1].alt) || mini));
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x(0), y(Number(pts[0].alt) || mini));
        for (var i = 1; i < pts.length; i++) ctx.lineTo(x(i), y(Number(pts[i].alt) || mini));
        ctx.stroke();
        var grad = ctx.createLinearGradient(0, marge, 0, H - marge);
        grad.addColorStop(0, 'rgba(99,102,241,.5)');
        grad.addColorStop(1, 'rgba(99,102,241,.02)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(x(0), y(Number(pts[0].alt) || mini));
        for (var j = 1; j < pts.length; j++) ctx.lineTo(x(j), y(Number(pts[j].alt) || mini));
        ctx.lineTo(x(pts.length - 1), H - marge);
        ctx.lineTo(x(0), H - marge);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x(0), y(Number(pts[0].alt) || mini));
        for (var k = 1; k < pts.length; k++) ctx.lineTo(x(k), y(Number(pts[k].alt) || mini));
        ctx.stroke();
        ctx.fillStyle = '#a0a3c2';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(formatM(stats.distance), W / 2, H - 6);
    }

    function installer({ map }) {
        if (ControleTopo._installe || !map) return;
        ControleTopo._installe = true;
        Carte = map;
        injecterCSS();
        if (typeof window !== 'undefined' && window.MutationObserver) {
            var observateur = new MutationObserver(gererMode3D);
            observateur.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        }
        var poser = function () {
            try {
                map.addControl(ControleTopo, 'top-right');
                var p = creerPanneau();
                document.body.appendChild(p);
                Panneau = p;
                map.addSource('topo-draw', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
                SourceDessin = map.getSource('topo-draw');
                map.addLayer({ id: 'topo-poly', type: 'fill', source: 'topo-draw', filter: ['==', ['get', 'type'], 'polygone'], paint: { 'fill-color': '#8b5cf6', 'fill-opacity': .18 } });
                map.addLayer({ id: 'topo-ligne', type: 'line', source: 'topo-draw', filter: ['==', ['get', 'type'], 'ligne'], paint: { 'line-color': '#8b5cf6', 'line-width': 3, 'line-dasharray': [4, 3] } });
                map.addLayer({ id: 'topo-pts', type: 'circle', source: 'topo-draw', filter: ['==', ['get', 'type'], 'points'], paint: { 'circle-color': '#ffffff', 'circle-radius': 5, 'circle-stroke-color': '#8b5cf6', 'circle-stroke-width': 2 } });
                map.on('click', function (e) {
                    if (ModeActif) ajouterPoint(e);
                });
                document.addEventListener('keydown', function (ev) {
                    if (ev.key === 'Escape' && ModeActif) activerMode(null);
                });
                if (window.lucide) window.lucide.createIcons();
            } catch (e) { console.error('[topographie] erreur installation:', e); }
        };
        if (map.loaded()) { poser(); } else { map.on('load', poser); }
    }

    function init() {
        if (typeof window === 'undefined' || !window.map) return;
        installer({ map: window.map });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
