/* MUKMAP - Analyse spatiale (mode avancé)
 * Moteur pur (mesures, buffer, proximité, sélection spatiale,
 * contenance, agrégation) testable sous Node. Sans dépendance à
 * Turf ni au DOM : tout est implémenté en coordonnées WGS84.
 */
(function (global) {
    'use strict';

    var CORE = {
        toRad: function (d) { return d * Math.PI / 180; },
        toDeg: function (r) { return r * 180 / Math.PI; },

        // Distance haversine (mètres) entre deux points [lat, lng]
        distance: function (lat1, lng1, lat2, lng2) {
            var R = 6371000;
            var a = CORE.toRad(lat1), b = CORE.toRad(lat2);
            var dp = CORE.toRad(lat2 - lat1), dl = CORE.toRad(lng2 - lng1);
            var h = Math.sin(dp / 2) * Math.sin(dp / 2) +
                Math.cos(a) * Math.cos(b) * Math.sin(dl / 2) * Math.sin(dl / 2);
            return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
        },

        distanceCoordonnees: function (a, b) {
            return CORE.distance(a[0], a[1], b[0], b[1]);
        },

        // Longueur (m) d'une polyligne [[lat, lng], ...]
        longueur: function (pts) {
            var total = 0;
            for (var i = 1; i < pts.length; i++) {
                total += CORE.distanceCoordonnees(pts[i - 1], pts[i]);
            }
            return total;
        },

        // Périmètre (m) d'un polygone fermé [[lat, lng], ...]
        perimetre: function (pts) {
            if (!pts || pts.length < 3) return 0;
            var ferme = pts;
            if (pts[0][0] !== pts[pts.length - 1][0] || pts[0][1] !== pts[pts.length - 1][1]) {
                ferme = pts.concat([pts[0]]);
            }
            return CORE.longueur(ferme);
        },

        // Aire (m²) d'un polygone [[lat, lng], ...] - formule de l'arc
        // (shoelace sphérique), correcte pour des polygones locaux.
        aire: function (pts) {
            if (!pts || pts.length < 4) return 0;
            var R = 6371000;
            var ferme = pts;
            if (pts[0][0] !== pts[pts.length - 1][0] || pts[0][1] !== pts[pts.length - 1][1]) {
                ferme = pts.concat([pts[0]]);
            }
            var total = 0;
            for (var i = 0; i < ferme.length - 1; i++) {
                var p1 = ferme[i], p2 = ferme[i + 1];
                total += CORE.toRad(p2[1] - p1[1]) *
                    (2 + Math.sin(CORE.toRad(p1[0])) + Math.sin(CORE.toRad(p2[0])));
            }
            return Math.abs(total * R * R / 2);
        },

        // Tampon : [lat, lng] + rayon (m) -> cercle approximé en polygone
        // fermé (36 sommets), coordonnées WGS84.
        buffer: function (lat, lng, rayonM) {
            var n = 36;
            var points = [];
            var cosLat = Math.cos(CORE.toRad(lat));
            var dLat = rayonM / 111320;
            var dLng = rayonM / (111320 * (cosLat || 0.0001));
            for (var i = 0; i < n; i++) {
                var theta = 2 * Math.PI * i / n;
                points.push([lat + dLat * Math.sin(theta), lng + dLng * Math.cos(theta)]);
            }
            points.push(points[0]);
            return points;
        },

        // Vrai si la distance entre a et b <= rayon (mètres)
        dansRayon: function (a, b, rayonM) {
            return CORE.distanceCoordonnees(a, b) <= rayonM;
        },

        // Sélection par distance : points dans un rayon du centre
        proches: function (points, centre, rayonM) {
            return points.filter(function (p) {
                return CORE.dansRayon([Number(p.latitude), Number(p.longitude)], centre, rayonM);
            });
        },

        // Point dans le polygone (algorithme du demi-plan)
        dansPolygone: function (lat, lng, poly) {
            var dans = false;
            for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                var xi = poly[i][0], yi = poly[i][1];
                var xj = poly[j][0], yj = poly[j][1];
                var intersecte = ((yi > lng) !== (yj > lng)) &&
                    (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
                if (intersecte) dans = !dans;
            }
            return dans;
        },

        // Filtre une liste de points qui sont DANS un polygone
        pointsDansPolygone: function (points, poly) {
            return points.filter(function (p) {
                return CORE.dansPolygone(Number(p.latitude), Number(p.longitude), poly);
            });
        },

        // bbox [minLat, minLng, maxLat, maxLng] d'un polygone
        bbox: function (pts) {
            var minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
            pts.forEach(function (p) {
                if (p[0] < minLat) minLat = p[0];
                if (p[0] > maxLat) maxLat = p[0];
                if (p[1] < minLng) minLng = p[1];
                if (p[1] > maxLng) maxLng = p[1];
            });
            return [minLat, minLng, maxLat, maxLng];
        },

        // bbox englobante d'une liste de points (latitude/longitude)
        bboxPoints: function (points) {
            var minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
            points.forEach(function (p) {
                var la = Number(p.latitude), lo = Number(p.longitude);
                if (!isNaN(la) && !isNaN(lo)) {
                    if (la < minLat) minLat = la;
                    if (la > maxLat) maxLat = la;
                    if (lo < minLng) minLng = lo;
                    if (lo > maxLng) maxLng = lo;
                }
            });
            return minLat === Infinity ? null : [minLat, minLng, maxLat, maxLng];
        },

        // Deux boîtes englobantes [minLat, minLng, maxLat, maxLng]
        // se chevauchent-elles ?
        bboxSeChevauchent: function (a, b) {
            if (a[2] < b[0] || b[2] < a[0]) return false;
            if (a[3] < b[1] || b[3] < a[1]) return false;
            return true;
        },

        // Intersection de deux polygones par échantillonnage des sommets
        // + bbox : approximation conservative.
        polygonesSeChevauchent: function (a, b) {
            if (!CORE.bboxSeChevauchent(CORE.bbox(a), CORE.bbox(b))) return false;
            for (var i = 0; i < a.length; i++) {
                if (CORE.dansPolygone(a[i][0], a[i][1], b)) return true;
            }
            for (var j = 0; j < b.length; j++) {
                if (CORE.dansPolygone(b[j][0], b[j][1], a)) return true;
            }
            return false;
        },

        // Sélection spatiale générique.
        //   mode : 'rayon' (centre+rayon), 'polygone', 'zone' (bbox)
        //   geometrie : {lat, lng, rayon_m} | {polygone: [[lat,lng]...]}
        //               | {bbox: [minLat, minLng, maxLat, maxLng]}
        selectionSpatiale: function (points, mode, geometrie) {
            var centre = null, rayon = null, poly = null, bbox = null;
            if (mode === 'rayon' && geometrie) {
                centre = [geometrie.lat, geometrie.lng];
                rayon = geometrie.rayon_m;
            } else if (mode === 'polygone' && geometrie && geometrie.polygone) {
                poly = geometrie.polygone;
            } else if (mode === 'zone' && geometrie && geometrie.bbox) {
                bbox = geometrie.bbox;
            }
            return points.filter(function (p) {
                var la = Number(p.latitude), lo = Number(p.longitude);
                if (!isFinite(la) || !isFinite(lo)) return false;
                if (centre && rayon !== null) return CORE.distanceCoordonnees([la, lo], centre) <= rayon;
                if (poly) return CORE.dansPolygone(la, lo, poly);
                if (bbox) return la >= bbox[0] && la <= bbox[2] && lo >= bbox[1] && lo <= bbox[3];
                return true;
            });
        },

        // Agrégation d'une liste de points par champ :
        //   {cles: [...], total, valeurs: {v: count}}
        agreger: function (points, champ) {
            var valeurs = {};
            points.forEach(function (p) {
                var v = String(p[champ] === null || p[champ] === undefined ? 'Non renseigné' : p[champ]);
                valeurs[v] = (valeurs[v] || 0) + 1;
            });
            var cles = Object.keys(valeurs).sort();
            return { cles: cles, total: points.length, valeurs: valeurs };
        }
    };

    // ---- INSTALLEUR DOM (outils d'analyse spatiale) --------------
    function demarrer(opts) {
        opts = opts || {};
        var carte = opts.carte || (typeof window !== 'undefined' ? window.map : null);
        if (!carte || typeof document === 'undefined') return null;
        var donnees = opts.donnees || (typeof window !== 'undefined' ? window.donneesPoints : null) || [];

        var panneau = document.createElement('div');
        panneau.className = 'mukmap-analyse';
        panneau.innerHTML =
            '<div class="mukmap-analyse-tete">Analyse spatiale' +
            '<button type="button" class="mukmap-analyse-fermer" title="Fermer">✕</button></div>' +
            '<div class="mukmap-analyse-onglets">' +
            '<button type="button" data-tab="mesure" class="actif">Mesures</button>' +
            '<button type="button" data-tab="buffer">Zones</button>' +
            '<button type="button" data-tab="proximite">Proximité</button>' +
            '<button type="button" data-tab="selection">Sélection</button>' +
            '</div>' +
            '<div class="mukmap-analyse-contenu">' +
            '<div data-panel="mesure">' +
            '<p class="mukmap-analyse-indice">Cliquez sur la carte pour placer les points.</p>' +
            '<div class="mukmap-analyse-ligne"><span>Distance</span><b id="ana-dist">—</b></div>' +
            '<div class="mukmap-analyse-ligne"><span>Superficie</span><b id="ana-surf">—</b></div>' +
            '<div class="mukmap-analyse-ligne"><span>Périmètre</span><b id="ana-peri">—</b></div>' +
            '<div class="mukmap-analyse-boutons"><button type="button" id="ana-effacer">Effacer</button></div>' +
            '</div>' +
            '<div data-panel="buffer" hidden>' +
            '<p class="mukmap-analyse-indice">Cliquez sur la carte pour choisir le centre.</p>' +
            '<div class="mukmap-analyse-ligne"><span>Rayon (km)</span><input type="number" id="ana-rayon" value="5" min="0.1" step="0.1"></div>' +
            '<div class="mukmap-analyse-boutons"><button type="button" id="ana-tracer-buffer">Tracer le buffer</button></div>' +
            '<div class="mukmap-analyse-ligne"><span>Points inclus</span><b id="ana-buffer-nb">—</b></div>' +
            '</div>' +
            '<div data-panel="proximite" hidden>' +
            '<p class="mukmap-analyse-indice">Cliquez sur la carte pour le point de référence.</p>' +
            '<div class="mukmap-analyse-ligne"><span>Rayon (km)</span><input type="number" id="ana-prox-rayon" value="10" min="0.1" step="0.1"></div>' +
            '<div class="mukmap-analyse-boutons"><button type="button" id="ana-calculer-proximite">Calculer</button></div>' +
            '<div class="mukmap-analyse-ligne"><span>Sites à proximité</span><b id="ana-prox-nb">—</b></div>' +
            '</div>' +
            '<div data-panel="selection" hidden>' +
            '<p class="mukmap-analyse-indice">Cliquez sur la carte pour tracer le polygone (fermez sur le premier point).</p>' +
            '<div class="mukmap-analyse-boutons">' +
            '<button type="button" id="ana-terminer-poly">Terminer</button>' +
            '<button type="button" id="ana-effacer-poly">Effacer</button></div>' +
            '<div class="mukmap-analyse-ligne"><span>Sélection</span><b id="ana-sel-nb">—</b>' +
            '<button type="button" id="ana-agreger">Agréger</button></div>' +
            '<div id="ana-sel-liste" class="mukmap-analyse-liste"></div>' +
            '</div>' +
            '</div>' +
            '<div class="mukmap-analyse-msg"></div>';

        document.body.appendChild(panneau);

        var style = document.createElement('style');
        style.textContent =
            '.mukmap-analyse{position:fixed;left:20px;bottom:20px;z-index:1150;width:320px;border-radius:12px;' +
            'border:1px solid var(--border,#3d4060);background:color-mix(in srgb,var(--bg-1,#1a1b2e) 96%,transparent);' +
            'backdrop-filter:blur(10px);box-shadow:0 10px 30px rgba(0,0,0,.35);overflow:hidden;' +
            'display:flex;flex-direction:column;max-height:80vh;}' +
            '.mukmap-analyse-tete{padding:10px 14px;font-weight:800;font-size:.85rem;display:flex;justify-content:space-between;' +
            'background:rgba(16,185,129,.12);border-bottom:1px solid var(--border,#3d4060);color:#34d399;}' +
            '.mukmap-analyse-fermer{border:0;background:transparent;color:var(--text-2,#a0a3c2);cursor:pointer;font-size:.9rem;}' +
            '.mukmap-analyse-onglets{display:flex;gap:4px;padding:8px 10px 0;flex-wrap:wrap;}' +
            '.mukmap-analyse-onglets button{border:1px solid var(--border,#3d4060);background:rgba(255,255,255,.04);' +
            'color:var(--text-2,#a0a3c2);border-radius:20px;padding:4px 10px;font-size:.72rem;font-weight:700;cursor:pointer;}' +
            '.mukmap-analyse-onglets button.actif{background:rgba(16,185,129,.16);border-color:#34d399;color:#34d399;}' +
            '.mukmap-analyse-contenu{padding:8px 12px 4px;}' +
            '.mukmap-analyse-indice{font-size:.72rem;color:var(--text-2,#a0a3c2);margin:0 0 6px;}' +
            '.mukmap-analyse-ligne{display:flex;justify-content:space-between;gap:8px;font-size:.8rem;' +
            'color:var(--text-2,#a0a3c2);align-items:center;padding:2px 0;}' +
            '.mukmap-analyse-ligne b, .mukmap-analyse-ligne input{color:var(--text,#e8e9f3);font-weight:700;text-align:right;}' +
            '.mukmap-analyse-ligne input{width:70px;background:rgba(255,255,255,.05);border:1px solid var(--border,#3d4060);' +
            'border-radius:6px;padding:3px 6px;font-size:.8rem;}' +
            '.mukmap-analyse-boutons{display:flex;gap:6px;flex-wrap:wrap;padding:6px 0;}' +
            '.mukmap-analyse-boutons button{flex:1;min-width:80px;padding:6px 8px;border-radius:8px;' +
            'border:1px solid var(--border,#3d4060);background:rgba(255,255,255,.05);color:var(--text,#e8e9f3);' +
            'font-size:.75rem;font-weight:700;cursor:pointer;}' +
            '.mukmap-analyse-liste{margin-top:6px;max-height:150px;overflow:auto;font-size:.72rem;color:var(--text-2,#a0a3c2);}' +
            '.mukmap-analyse-msg{padding:4px 12px 10px;font-size:.78rem;color:var(--text-2,#a0a3c2);min-height:16px;}';
        (document.head || document.documentElement).appendChild(style);

        function parId(id) { return panneau.querySelector('#' + id); }

        function message(t, type) {
            var el = panneau.querySelector('.mukmap-analyse-msg');
            if (!el) return;
            el.textContent = t;
            el.className = 'mukmap-analyse-msg ' + (type || 'info');
            clearTimeout(el._t);
            el._t = setTimeout(function () { el.textContent = ''; }, 5000);
        }

        function formatMetres(m) {
            if (m === null || m === undefined || isNaN(m)) return '—';
            return m >= 1000 ? (Math.round(m / 100) / 10) + ' km' : Math.round(m) + ' m';
        }

        function formatAire(a) {
            if (a === null || a === undefined || isNaN(a)) return '—';
            return a >= 1000000 ? (Math.round(a / 100000) / 10) + ' km²' : Math.round(a) + ' m²';
        }

        // ---- État ----
        var mode = 'mesure';
        var pointsMesure = [];
        var centreBuffer = null;
        var pointProximite = null;
        var polygone = [];
        var coucheTempo = [];
        var abonnement = null;

        // ---- Couches temporaires ----
        function nettoyerCouches() {
            coucheTempo.forEach(function (id) {
                if (carte.getLayer(id)) carte.removeLayer(id);
                if (carte.getSource(id)) carte.removeSource(id);
            });
            coucheTempo = [];
        }

        function ajouterCouche(id, features, type) {
            if (carte.getLayer(id)) carte.removeLayer(id);
            if (carte.getSource(id)) carte.removeSource(id);
            if (!features.length) return;
            carte.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: features } });
            carte.addLayer({
                id: id, type: type, source: id,
                paint: type === 'fill'
                    ? { 'fill-color': 'rgba(16,185,129,.15)', 'fill-outline-color': '#34d399' }
                    : { 'line-color': '#34d399', 'line-width': 2 },
                layout: type === 'fill' ? {} : { 'line-join': 'round' }
            });
            coucheTempo.push(id);
        }

        function enLigne(pts) {
            return {
                type: 'Feature', properties: {},
                geometry: { type: 'LineString', coordinates: pts.map(function (p) { return [p.lng, p.lat]; }) }
            };
        }

        function enPolygone(ring) {
            return {
                type: 'Feature', properties: {},
                geometry: { type: 'Polygon', coordinates: [ring.map(function (p) { return [p.lng, p.lat]; })] }
            };
        }

        function ptsLatLng(liste) {
            return liste.map(function (p) { return [p.lat, p.lng]; });
        }

        // ---- Onglet Mesure ----
        function majMesure() {
            if (pointsMesure.length < 2) {
                parId('ana-dist').textContent = '—';
                parId('ana-surf').textContent = '—';
                parId('ana-peri').textContent = '—';
                return;
            }
            var cnts = ptsLatLng(pointsMesure);
            parId('ana-dist').textContent = formatMetres(CORE.longueur(cnts));
            if (pointsMesure.length >= 3) {
                var ferme = cnts.concat([cnts[0]]);
                parId('ana-surf').textContent = formatAire(CORE.aire(ferme));
                parId('ana-peri').textContent = formatMetres(CORE.perimetre(cnts));
            }
            ajouterCouche('ana-mesure-c', [enLigne(pointsMesure)], 'line');
        }

        // ---- Gestion du clic carte selon l'onglet ----
        function activerClic(fn) {
            if (abonnement) carte.off('click', abonnement);
            abonnement = fn;
            if (fn) carte.on('click', fn);
        }

        function panneauOuvert() { return panneau.style.display !== 'none'; }

        function clicMesure(e) {
            if (!panneauOuvert()) return;
            pointsMesure.push({ lat: e.lngLat.lat, lng: e.lngLat.lng });
            majMesure();
        }

        function clicBuffer(e) {
            if (!panneauOuvert()) return;
            centreBuffer = { lat: e.lngLat.lat, lng: e.lngLat.lng };
            message('Centre posé (' + e.lngLat.lat.toFixed(5) + ', ' + e.lngLat.lng.toFixed(5) + '). Définissez le rayon puis tracez.', 'info');
        }

        function clicProximite(e) {
            if (!panneauOuvert()) return;
            pointProximite = { lat: e.lngLat.lat, lng: e.lngLat.lng };
            message('Point de référence posé (' + e.lngLat.lat.toFixed(5) + ', ' + e.lngLat.lng.toFixed(5) + ').', 'info');
        }

        function clicPolygone(e) {
            if (!panneauOuvert()) return;
            polygone.push({ lat: e.lngLat.lat, lng: e.lngLat.lng });
            ajouterCouche('ana-poly-c', [enLigne(polygone)], 'line');
            majSelection();
        }

        function activerClicSelonMode() {
            if (mode === 'mesure') activerClic(clicMesure);
            else if (mode === 'buffer') activerClic(clicBuffer);
            else if (mode === 'proximite') activerClic(clicProximite);
            else if (mode === 'selection') activerClic(clicPolygone);
            else activerClic(null);
        }

        // ---- Sélection par polygone ----
        function majSelection() {
            if (polygone.length < 3) {
                parId('ana-sel-nb').textContent = '—';
                return;
            }
            var ferme = ptsLatLng(polygone).concat([ptsLatLng(polygone)[0]]);
            var selection = CORE.pointsDansPolygone(donnees, ferme);
            parId('ana-sel-nb').textContent = selection.length;
            var liste = panneau.querySelector('#ana-sel-liste');
            liste.textContent = selection.map(function (p) {
                return p.nom || ('#' + p.id);
            }).join(' · ');
        }

        function terminerPolygone() {
            if (polygone.length < 3) { message('Il faut au moins 3 points.', 'erreur'); return; }
            var ferme = ptsLatLng(polygone).concat([ptsLatLng(polygone)[0]]);
            var poly = polygone.concat([polygone[0]]);
            ajouterCouche('ana-poly-c', [enPolygone(poly)], 'fill');
            var selection = CORE.pointsDansPolygone(donnees, ferme);
            parId('ana-sel-nb').textContent = selection.length;
            message('Polygone tracé : ' + selection.length + ' points sélectionnés.', 'succes');
        }

        // ---- Onglets ----
        function choisirOnglet(tab) {
            mode = tab;
            panneau.querySelectorAll('[data-panel]').forEach(function (el) {
                el.hidden = el.getAttribute('data-panel') !== tab;
            });
            panneau.querySelectorAll('.mukmap-analyse-onglets button').forEach(function (b) {
                b.classList.toggle('actif', b.getAttribute('data-tab') === tab);
            });
            activerClicSelonMode();
        }

        panneau.querySelectorAll('.mukmap-analyse-onglets button').forEach(function (b) {
            b.addEventListener('click', function () { choisirOnglet(b.getAttribute('data-tab')); });
        });

        panneau.querySelector('#ana-effacer').addEventListener('click', function () {
            pointsMesure = [];
            nettoyerCouches();
            majMesure();
        });

        // ---- Buffer ----
        panneau.querySelector('#ana-tracer-buffer').addEventListener('click', function () {
            if (!centreBuffer) { message('Cliquez d\'abord sur la carte pour le centre.', 'erreur'); return; }
            var rayon = parseFloat(parId('ana-rayon').value);
            if (!(rayon > 0)) { message('Rayon invalide.', 'erreur'); return; }
            var poly = CORE.buffer(centreBuffer.lat, centreBuffer.lng, rayon * 1000);
            var nb = CORE.pointsDansPolygone(donnees, poly);
            parId('ana-buffer-nb').textContent = nb.length;
            ajouterCouche('ana-buffer-c', [enPolygone(poly.map(function (p) {
                return { lat: p[0], lng: p[1] };
            }))], 'fill');
            message('Buffer de ' + rayon + ' km : ' + nb.length + ' points inclus.', 'succes');
        });

        // ---- Proximité ----
        panneau.querySelector('#ana-calculer-proximite').addEventListener('click', function () {
            if (!pointProximite) { message('Cliquez d\'abord sur la carte pour le point de référence.', 'erreur'); return; }
            var rayon = parseFloat(parId('ana-prox-rayon').value);
            if (!(rayon > 0)) { message('Rayon invalide.', 'erreur'); return; }
            var nb = CORE.proches(donnees, [pointProximite.lat, pointProximite.lng], rayon * 1000);
            parId('ana-prox-nb').textContent = nb.length;
            var poly = CORE.buffer(pointProximite.lat, pointProximite.lng, rayon * 1000);
            ajouterCouche('ana-prox-c', [enPolygone(poly.map(function (p) {
                return { lat: p[0], lng: p[1] };
            }))], 'fill');
            message('Rayon de ' + rayon + ' km : ' + nb.length + ' sites à proximité.', 'succes');
        });

        // ---- Sélection ----
        panneau.querySelector('#ana-terminer-poly').addEventListener('click', terminerPolygone);
        panneau.querySelector('#ana-effacer-poly').addEventListener('click', function () {
            polygone = [];
            nettoyerCouches();
            majSelection();
        });
        panneau.querySelector('#ana-agreger').addEventListener('click', function () {
            if (polygone.length < 3) { message('Tracer d\'abord un polygone.', 'erreur'); return; }
            var ferme = ptsLatLng(polygone).concat([ptsLatLng(polygone)[0]]);
            var selection = CORE.pointsDansPolygone(donnees, ferme);
            var agg = CORE.agreger(selection, 'categorie');
            var liste = panneau.querySelector('#ana-sel-liste');
            liste.innerHTML = '';
            agg.cles.forEach(function (cle) {
                var div = document.createElement('div');
                div.textContent = cle + ' : ' + agg.valeurs[cle];
                liste.appendChild(div);
            });
            message('Agrégation par catégorie : ' + agg.total + ' points.', 'succes');
        });

        panneau.querySelector('.mukmap-analyse-fermer').addEventListener('click', function () {
            panneau.style.display = 'none';
            activerClic(null);
        });

        // ---- Bouton d'ouverture ----
        var bouton = document.createElement('button');
        bouton.id = 'mukmap-analyse-bouton';
        bouton.textContent = '✦';
        bouton.title = 'Analyse spatiale';
        bouton.style.cssText = 'position:fixed;left:18px;bottom:20px;z-index:1150;width:46px;height:46px;border-radius:50%;' +
            'border:1px solid rgba(16,185,129,.5);background:rgba(16,185,129,.15);color:#34d399;font-size:1.2rem;' +
            'cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;';
        document.body.appendChild(bouton);
        bouton.addEventListener('click', function () {
            panneau.style.display = panneau.style.display === 'none' ? 'flex' : 'none';
            if (panneau.style.display === 'flex') choisirOnglet(mode);
            else activerClic(null);
        });
        panneau.style.display = 'none';

        if (window.MukmapDeplacer && window.MukmapDeplacer.deplacer) {
            window.MukmapDeplacer.deplacer(bouton);
            window.MukmapDeplacer.deplacer(panneau, panneau.querySelector('.mukmap-analyse-tete'));
        }

        mode = 'mesure';
        activerClic(null);
        return panneau;
    }

    global.MukmapAnalyse = { CORE: CORE, demarrer: demarrer };
})(typeof window !== 'undefined' ? window : globalThis);
