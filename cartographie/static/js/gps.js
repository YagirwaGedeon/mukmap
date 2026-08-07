/* MUKMAP - GPS & Navigation
 * Moteur pur (mesures, cap, haversine, GPX) testable sous Node
 * + installeur DOM (suivi de position, navigation, traces).
 */
(function (global) {
    'use strict';

    // ---- MOTEUR PUR --------------------------------------------------
    var CORE = {
        RAYON_TERRE: 6371000,

        toRad: function (deg) { return deg * Math.PI / 180; },
        toDeg: function (rad) { return rad * 180 / Math.PI; },

        // Distance haversine (metres) entre deux points WGS84
        distance: function (lat1, lng1, lat2, lng2) {
            var a = CORE.toRad(lat1), b = CORE.toRad(lat2);
            var dPhi = CORE.toRad(lat2 - lat1);
            var dLambda = CORE.toRad(lng2 - lng1);
            var h = Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
                Math.cos(a) * Math.cos(b) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
            return 2 * CORE.RAYON_TERRE * Math.asin(Math.min(1, Math.sqrt(h)));
        },

        // Cap initial (degres 0-360) d'un point A vers un point B
        cap: function (lat1, lng1, lat2, lng2) {
            var a = CORE.toRad(lat1), b = CORE.toRad(lat2);
            var dL = CORE.toRad(lng2 - lng1);
            var y = Math.sin(dL) * Math.cos(b);
            var x = Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b) * Math.cos(dL);
            return (CORE.toDeg(Math.atan2(y, x)) + 360) % 360;
        },

        // Cardinalize
        directionNom: function (capDeg) {
            var noms = ['N', 'N-E', 'E', 'S-E', 'S', 'S-O', 'O', 'N-O'];
            return noms[Math.round(((capDeg % 360) + 360) % 360 / 45) % 8];
        },

        formatDistance: function (m) {
            if (m === null || m === undefined || isNaN(m)) return '—';
            if (m < 1000) return Math.round(m * 10) / 10 + ' m';
            return Math.round((m / 1000) * 100) / 100 + ' km';
        },

        // Format d'un cap pour affichage
        formatCap: function (capDeg) {
            var c = Math.round(((capDeg % 360) + 360) % 360);
            return c + '° ' + CORE.directionNom(c);
        },

        // Precision : seuil 12 m = "GPS", sinon "approximatif"
        qualitePrecision: function (m) {
            if (m === null || m === undefined || isNaN(m)) return 'inconnue';
            if (m <= 12) return 'bonne';
            if (m <= 40) return 'moyenne';
            return 'faible';
        },

        // Longueur totale (m) d'une trace [[lat,lng,alt?], ...]
        longueurTrace: function (points) {
            var total = 0;
            for (var i = 1; i < points.length; i++) {
                total += CORE.distance(points[i - 1][0], points[i - 1][1],
                                       points[i][0], points[i][1]);
            }
            return total;
        },

        xmlescape: function (s) {
            return String(s === null || s === undefined ? '' : s)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        },

        // Genere un GPX (Xml) depuis une trace [[lat,lng,alt?,tempsISO?], ...]
        toGPX: function (nom, points, extra) {
            extra = extra || {};
            var s = '<?xml version="1.0" encoding="UTF-8"?>\n' +
                '<gpx version="1.1" creator="MUKMAP" xmlns="http://www.topografix.com/GPX/1/1" ' +
                'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
                'xsi:schemaLocation="http://www.topografix.com/GPX/1/1 ' +
                'http://www.topografix.com/GPX/1/1/gpx.xsd">\n' +
                '  <metadata><name>' + CORE.xmlescape(nom || 'Trace MUKMAP') + '</name>' +
                (extra.temps ? '<time>' + CORE.xmlescape(extra.temps) + '</time>' : '') +
                '</metadata>\n  <trk>\n    <name>' + CORE.xmlescape(nom || 'Trace MUKMAP') +
                '</name>\n    <trkseg>\n';
            (points || []).forEach(function (pt) {
                s += '      <trkpt lat="' + pt[0] + '" lon="' + pt[1] + '">';
                if (pt[2] !== null && pt[2] !== undefined) s += '<ele>' + pt[2] + '</ele>';
                if (pt[3]) s += '<time>' + CORE.xmlescape(pt[3]) + '</time>';
                s += '</trkpt>\n';
            });
            s += '    </trkseg>\n  </trk>\n</gpx>\n';
            return s;
        },

        _parseRegex: function (xml) {
            var traces = [];
            var re = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/trkpt>/gi;
            var m;
            while ((m = re.exec(xml)) !== null) {
                var lat = parseFloat(m[1]), lon = parseFloat(m[2]);
                if (isNaN(lat) || isNaN(lon)) continue;
                var ele = null, temps = null;
                var be = /<ele[^>]*>([\s\S]*?)<\/ele>/i.exec(m[3]);
                if (be) { var e = parseFloat(be[1]); if (!isNaN(e)) ele = e; }
                var bt = /<time[^>]*>([\s\S]*?)<\/time>/i.exec(m[3]);
                if (bt) temps = bt[1];
                traces.push([lat, lon, ele, temps]);
            }
            return traces;
        },

        // Extrait une trace depuis une chaîne GPX : [[lat, lng, alt|null, time|null], ...]
        extraireGPX: function (xml) {
            if (typeof DOMParser !== 'undefined') {
                var doc = new DOMParser().parseFromString(String(xml), 'text/xml');
                var points = doc.getElementsByTagName('trkpt');
                var traces = [];
                for (var i = 0; i < points.length; i++) {
                    var lat = parseFloat(points[i].getAttribute('lat'));
                    var lon = parseFloat(points[i].getAttribute('lon'));
                    if (isNaN(lat) || isNaN(lon)) continue;
                    var ele = null, temps = null;
                    var enfants = points[i].childNodes;
                    for (var j = 0; j < enfants.length; j++) {
                        var n = enfants[j];
                        if (n.nodeName === 'ele') { var e = parseFloat(n.textContent || ''); if (!isNaN(e)) ele = e; }
                        if (n.nodeName === 'time') temps = n.textContent;
                    }
                    traces.push([lat, lon, ele, temps]);
                }
                return traces;
            }
            return CORE._parseRegex(String(xml));
        },

        // GeoJSON LineString depuis une trace
        traceVersGeoJSON: function (points) {
            return {
                type: 'Feature',
                properties: { type: 'trace', longueur_m: Math.round(CORE.longueurTrace(points)) },
                geometry: { type: 'LineString', coordinates: points.map(function (p) { return [p[1], p[0]]; }) }
            };
        }
    };

    // ---- INSTALLEUR DOM (panneau GPS & navigation) ----------------
    function demarrer(opts) {
        opts = opts || {};
        var carte = opts.carte || (typeof window !== 'undefined' ? window.map : null);
        if (!carte || typeof document === 'undefined') return null;

        var panneau = document.createElement('div');
        panneau.className = 'mukmap-gps';
        panneau.innerHTML =
            '<div class="mukmap-gps-tete">GPS & Navigation' +
            '<button type="button" class="mukmap-gps-fermer" title="Fermer">✕</button></div>' +
            '<div class="mukmap-gps-corps">' +
            '<div class="mukmap-gps-ligne"><span>Latitude</span><b id="gps-lat">—</b></div>' +
            '<div class="mukmap-gps-ligne"><span>Longitude</span><b id="gps-lng">—</b></div>' +
            '<div class="mukmap-gps-ligne"><span>Précision</span><b id="gps-acc">—</b></div>' +
            '<div class="mukmap-gps-ligne"><span>Altitude</span><b id="gps-alt">—</b></div>' +
            '<div class="mukmap-gps-ligne"><span>Direction</span><b id="gps-cap">—</b></div>' +
            '<div class="mukmap-gps-ligne"><span>Vitesse</span><b id="gps-vit">—</b></div>' +
            '</div>' +
            '<div class="mukmap-gps-boutons">' +
            '<button type="button" id="gps-btn-activer">Activer le suivi</button>' +
            '<button type="button" id="gps-btn-naviguer">Naviguer</button>' +
            '</div>' +
            '<div class="mukmap-gps-navi" hidden>' +
            '<div class="mukmap-gps-ligne"><span>Cible</span><b id="gps-cible">—</b></div>' +
            '<div class="mukmap-gps-ligne"><span>Distance</span><b id="gps-dist">—</b></div>' +
            '<div class="mukmap-gps-ligne"><span>Cap</span><b id="gps-brace">—</b></div>' +
            '</div>' +
            '<div class="mukmap-gps-trace">' +
            '<div class="mukmap-gps-ligne"><span>Trace</span><b id="gps-trace-nb">0 pts</b></div>' +
            '<div class="mukmap-gps-boutons">' +
            '<button type="button" id="gps-btn-trace">Enregistrer</button>' +
            '<button type="button" id="gps-btn-export">Export GPX</button>' +
            '<button type="button" id="gps-btn-import">Import GPX</button>' +
            '</div>' +
            '<input type="file" id="gps-fichier" accept=".gpx,.xml" hidden>' +
            '</div>' +
            '<div class="mukmap-gps-msg" id="gps-msg"></div>';

        document.body.appendChild(panneau);

        var style = document.createElement('style');
        style.textContent =
            '.mukmap-gps{position:fixed;bottom:20px;right:52px;z-index:1150;width:290px;border-radius:12px;' +
            'border:1px solid var(--border,#3d4060);background:color-mix(in srgb,var(--bg-1,#1a1b2e) 96%,transparent);' +
            'backdrop-filter:blur(10px);box-shadow:0 10px 30px rgba(0,0,0,.35);overflow:hidden;' +
            'display:flex;flex-direction:column;}' +
            '.mukmap-gps-tete{padding:10px 14px;font-weight:800;font-size:.85rem;display:flex;justify-content:space-between;' +
            'background:rgba(79,70,229,.12);border-bottom:1px solid var(--border,#3d4060);color:var(--accent,#60a5fa);}' +
            '.mukmap-gps-fermer{border:0;background:transparent;color:var(--text-2,#a0a3c2);cursor:pointer;font-size:.9rem;}' +
            '.mukmap-gps-corps,.mukmap-gps-navi,.mukmap-gps-trace{padding:8px 12px;display:flex;flex-direction:column;gap:5px;}' +
            '.mukmap-gps-ligne{display:flex;justify-content:space-between;gap:8px;font-size:.8rem;color:var(--text-2,#a0a3c2);}' +
            '.mukmap-gps-ligne b{color:var(--text,#e8e9f3);font-weight:700;text-align:right;}' +
            '.mukmap-gps-boutons{display:flex;gap:6px;flex-wrap:wrap;padding:2px 12px 8px;}' +
            '.mukmap-gps-boutons button,.mukmap-gps-trace button{flex:1;min-width:70px;padding:6px 8px;border-radius:8px;' +
            'border:1px solid var(--border,#3d4060);background:rgba(255,255,255,.05);color:var(--text,#e8e9f3);' +
            'font-size:.75rem;font-weight:700;cursor:pointer;}' +
            '.mukmap-gps-boutons button.actif{background:rgba(34,211,238,.18);border-color:#22d3ee;color:#22d3ee;}' +
            '.mukmap-gps-msg{padding:4px 12px 10px;font-size:.78rem;color:var(--text-2,#a0a3c2);min-height:16px;}';
        (document.head || document.documentElement).appendChild(style);

        function parId(id) { return panneau.querySelector('#' + id); }
        function message(t, type) {
            var el = parId('gps-msg');
            if (!el) return;
            el.textContent = t;
            el.className = 'mukmap-gps-msg ' + (type || 'info');
            clearTimeout(el._t);
            el._t = setTimeout(function () { el.textContent = ''; }, 6000);
        }

        var etat = {
            position: null, watchId: null, trace: [], traceEnCours: false,
            cible: null, marqueur: null
        };

        function afficher() {
            var p = etat.position;
            if (!p) return;
            parId('gps-lat').textContent = p.coords.latitude.toFixed(6);
            parId('gps-lng').textContent = p.coords.longitude.toFixed(6);
            parId('gps-acc').textContent = CORE.qualitePrecision(p.coords.accuracy) +
                ' · ' + Math.round(p.coords.accuracy) + ' m';
            parId('gps-alt').textContent = p.coords.altitude !== null && p.coords.altitude !== undefined
                ? Math.round(p.coords.altitude) + ' m' : '—';
            parId('gps-cap').textContent = p.coords.heading !== null && p.coords.heading !== undefined
                ? CORE.formatCap(p.coords.heading) : '—';
            parId('gps-vit').textContent = p.coords.speed !== null && p.coords.speed !== undefined
                ? Math.round(p.coords.speed * 3.6) + ' km/h' : '—';
            if (etat.cible) majNavigation(p);
        }

        function majNavigation(p) {
            var d = CORE.distance(p.coords.latitude, p.coords.longitude, etat.cible.lat, etat.cible.lng);
            var cp = CORE.cap(p.coords.latitude, p.coords.longitude, etat.cible.lat, etat.cible.lng);
            parId('gps-dist').textContent = CORE.formatDistance(d);
            parId('gps-brace').textContent = CORE.formatCap(cp);
        }

        function majTrace() {
            var pts = etat.trace.map(function (t) { return [t.lat, t.lng, t.alt]; });
            var el = parId('gps-trace-nb');
            if (el) el.textContent = pts.length + ' pts · ' + CORE.formatDistance(CORE.longueurTrace(pts));
            if (carte.getLayer('mukmap-gps-trace')) carte.removeLayer('mukmap-gps-trace');
            if (carte.getSource('mukmap-gps-trace')) carte.removeSource('mukmap-gps-trace');
            if (pts.length < 2) return;
            carte.addSource('mukmap-gps-trace', { type: 'geojson', data: CORE.traceVersGeoJSON(pts) });
            carte.addLayer({
                id: 'mukmap-gps-trace', type: 'line', source: 'mukmap-gps-trace',
                paint: { 'line-color': '#22d3ee', 'line-width': 3, 'line-opacity': 0.9 }
            });
        }

        var bActiver = parId('gps-btn-activer');
        bActiver.addEventListener('click', function () {
            if (etat.watchId) {
                navigator.geolocation.clearWatch(etat.watchId);
                etat.watchId = null;
                bActiver.classList.remove('actif');
                bActiver.textContent = 'Activer le suivi';
                return;
            }
            if (!navigator.geolocation) { message('Géolocalisation non supportée.', 'erreur'); return; }
            etat.watchId = navigator.geolocation.watchPosition(function (pos) {
                etat.position = pos;
                afficher();
                if (etat.traceEnCours) {
                    etat.trace.push({ lat: pos.coords.latitude, lng: pos.coords.longitude,
                                      alt: pos.coords.altitude, time: new Date().toISOString() });
                    majTrace();
                }
            }, function (err) {
                message('Erreur géolocalisation : ' + (err && err.message ? err.message : 'indisponible'), 'erreur');
            }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
            bActiver.classList.add('actif');
            bActiver.textContent = 'Arrêter';
        });

        parId('gps-btn-naviguer').addEventListener('click', function () {
            if (!etat.position) { message("Activez d'abord le suivi.", 'erreur'); return; }
            var c = carte.getCenter();
            etat.cible = { lat: c.lat, lng: c.lng };
            panneau.querySelector('.mukmap-gps-navi').hidden = false;
            parId('gps-cible').textContent = c.lat.toFixed(5) + ', ' + c.lng.toFixed(5);
            if (window.maplibregl) {
                if (etat.marqueur) etat.marqueur.remove();
                etat.marqueur = new window.maplibregl.Marker({ color: '#f59e0b' })
                    .setLngLat([c.lng, c.lat]).addTo(carte);
            }
            majNavigation(etat.position);
        });

        var bTrace = parId('gps-btn-trace');
        bTrace.addEventListener('click', function () {
            if (!etat.traceEnCours && !etat.position) { message("Activez d'abord le suivi.", 'erreur'); return; }
            etat.traceEnCours = !etat.traceEnCours;
            bTrace.classList.toggle('actif', etat.traceEnCours);
            bTrace.textContent = etat.traceEnCours ? 'Arrêter' : 'Enregistrer';
        });

        parId('gps-btn-export').addEventListener('click', function () {
            if (!etat.trace.length) { message('Aucune trace à exporter.', 'erreur'); return; }
            var gpx = CORE.toGPX('Trace MUKMAP', etat.trace.map(function (t) {
                return [t.lat, t.lng, t.alt !== undefined ? t.alt : null, t.time];
            }), { temps: new Date().toISOString() });
            var blob = new Blob([gpx], { type: 'application/gpx+xml' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'mukmap_trace_' + Date.now() + '.gpx';
            a.click();
            URL.revokeObjectURL(a.href);
            message('GPX exporté (' + etat.trace.length + ' points).', 'succes');
        });

        var fichier = parId('gps-fichier');
        parId('gps-btn-import').addEventListener('click', function () { fichier.click(); });
        fichier.addEventListener('change', function () {
            var f = fichier.files && fichier.files[0];
            if (!f) return;
            var lecteur = new FileReader();
            lecteur.onload = function () {
                var pts = CORE.extraireGPX(String(lecteur.result));
                etat.trace = pts.map(function (p) {
                    return { lat: p[0], lng: p[1], alt: p[2] !== null ? p[2] : undefined, time: p[3] };
                });
                majTrace();
                message('GPX importé : ' + pts.length + ' points.', 'succes');
            };
            lecteur.readAsText(f);
        });

        panneau.querySelector('.mukmap-gps-fermer').addEventListener('click', function () {
            panneau.style.display = 'none';
        });

        // Bouton d'ouverture circulaire
        var bouton = document.createElement('button');
        bouton.id = 'mukmap-gps-bouton';
        bouton.textContent = '📡';
        bouton.title = 'GPS & Navigation';
        bouton.style.cssText = 'position:fixed;bottom:20px;right:18px;z-index:1150;width:46px;height:46px;border-radius:50%;' +
            'border:1px solid rgba(79,70,229,.5);background:rgba(79,70,229,.15);color:#60a5fa;font-size:1.2rem;' +
            'cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;';
        document.body.appendChild(bouton);
        bouton.addEventListener('click', function () {
            panneau.style.display = panneau.style.display === 'none' ? 'flex' : 'none';
        });
        panneau.style.display = 'none';

        return panneau;
    }

    global.MukmapGps = { CORE: CORE, demarrer: demarrer };
})(typeof window !== 'undefined' ? window : globalThis);