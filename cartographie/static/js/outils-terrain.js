/* MUKMAP — Outils de terrain.
 * Groupes d'outils en dropdowns dans la barre latérale :
 *  - Dessin & Mesures (extension du mode de dessin existant : polyligne, rayon,
 *    angle, azimut, périmètre) ;
 *  - pose de points thématiques (Topographie, Infrastructures, Réseau eau) via
 *    l'API de création de points (aucun rechargement de page) ;
 *  - exports (GeoJSON, KML, KMZ, Shapefile, GPX, DXF, PNG, PDF).
 * Le cœur de calcul (angle, azimut) est exposé sous globalThis.OutilsTerrain.
 */
(function () {
    'use strict';

    /* ── Cœur testable ── */

    function deg2rad(d) { return d * Math.PI / 180; }

    function calculerAzimut(a, b) {
        var dLng = deg2rad(Number(b[0]) - Number(a[0]));
        var lat1 = deg2rad(Number(a[1]));
        var lat2 = deg2rad(Number(b[1]));
        var y = Math.sin(dLng) * Math.cos(lat2);
        var x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
        var az = Math.atan2(y, x) * 180 / Math.PI;
        return (az + 360) % 360;
    }

    function calculerAngle(a, b, c) {
        var ba = [Number(a[0]) - Number(b[0]), Number(a[1]) - Number(b[1])];
        var bc = [Number(c[0]) - Number(b[0]), Number(c[1]) - Number(b[1])];
        var n1 = Math.hypot(ba[0], ba[1]);
        var n2 = Math.hypot(bc[0], bc[1]);
        if (!n1 || !n2) return 0;
        var cos = (ba[0] * bc[0] + ba[1] * bc[1]) / (n1 * n2);
        return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
    }

    function fmtMesure(m) {
        if (!isFinite(m)) return '—';
        return m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m';
    }

    /* ── ZIP minimal (stockage, UTF-8) ── */

    var CRC_TABLE = (function () {
        var t = [];
        for (var n = 0; n < 256; n++) {
            var c = n;
            for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            t[n] = c >>> 0;
        }
        return t;
    })();

    function crc32(buf) {
        var c = 0xFFFFFFFF;
        for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
        return (c ^ 0xFFFFFFFF) >>> 0;
    }

    function encTexte(str) {
        if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
        var out = [];
        for (var i = 0; i < str.length; i++) out.push(str.charCodeAt(i) & 0xFF);
        return new Uint8Array(out);
    }

    function creerZip(entrees) {
        var parties = [], central = [];
        var offset = 0;
        entrees.forEach(function (e) {
            var data = e.data;
            var crc = crc32(data);
            var nomBuf = encTexte(e.nom);
            var local = new Uint8Array(30 + nomBuf.length);
            var dv = new DataView(local.buffer);
            dv.setUint32(0, 0x04034b50, true);
            dv.setUint16(4, 20, true);
            dv.setUint16(6, 0x0800, true);
            dv.setUint16(8, 0, true);
            dv.setUint32(14, crc, true);
            dv.setUint32(18, data.length, true);
            dv.setUint32(22, data.length, true);
            dv.setUint16(26, nomBuf.length, true);
            dv.setUint16(28, 0, true);
            local.set(nomBuf, 30);

            var cHead = new Uint8Array(46 + nomBuf.length);
            var cdv = new DataView(cHead.buffer);
            cdv.setUint32(0, 0x02014b50, true);
            cdv.setUint16(4, 20, true); cdv.setUint16(6, 20, true);
            cdv.setUint16(8, 0x0800, true);
            cdv.setUint16(10, 0, true);
            cdv.setUint32(16, crc, true);
            cdv.setUint32(20, data.length, true);
            cdv.setUint32(24, data.length, true);
            cdv.setUint16(28, nomBuf.length, true);
            cdv.setUint32(42, offset, true);
            cHead.set(nomBuf, 46);

            parties.push(local, data);
            central.push(cHead);
            offset += local.length + data.length;
        });
        var totalCentral = central.reduce(function (s, h) { return s + h.length; }, 0);
        var fin = new Uint8Array(22);
        var fdv = new DataView(fin.buffer);
        fdv.setUint32(0, 0x06054b50, true);
        fdv.setUint16(8, entrees.length, true);
        fdv.setUint16(10, entrees.length, true);
        fdv.setUint32(12, totalCentral, true);
        fdv.setUint32(16, offset, true);

        var tout = [];
        parties.forEach(function (h) { tout.push(h); });
        central.forEach(function (h) { tout.push(h); });
        tout.push(fin);
        var len = tout.reduce(function (s, h) { return s + h.length; }, 0);
        var out = new Uint8Array(len);
        var pos = 0;
        tout.forEach(function (h) { out.set(h, pos); pos += h.length; });
        return out;
    }

    /* ── Shapefile POINT ── */

    function creerShapefile(points) {
        var n = points.length;
        var xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
        points.forEach(function (p) {
            xmin = Math.min(xmin, p.x); ymin = Math.min(ymin, p.y);
            xmax = Math.max(xmax, p.x); ymax = Math.max(ymax, p.y);
        });
        if (n === 0) { xmin = ymin = xmax = ymax = 0; }
        var tailleShp = 100 + n * 28;
        var tailleShx = 100 + n * 8;
        var shp = new Uint8Array(tailleShp);
        var shx = new Uint8Array(tailleShx);
        function u32(a, o, v) { new DataView(a.buffer).setUint32(o, v, true); }
        function f64(a, o, v) { new DataView(a.buffer).setFloat64(o, v, true); }
        u32(shp, 0, 9994); u32(shp, 24, tailleShp / 2); u32(shp, 28, 1000); u32(shp, 32, 1);
        f64(shp, 36, xmin); f64(shp, 44, ymin); f64(shp, 52, xmax); f64(shp, 60, ymax);
        u32(shx, 0, 9994); u32(shx, 24, tailleShx / 2); u32(shx, 28, 1000); u32(shx, 32, 1);
        f64(shx, 36, xmin); f64(shx, 44, ymin); f64(shx, 52, xmax); f64(shx, 60, ymax);
        var off = 100;
        for (var i = 0; i < n; i++) {
            u32(shp, off, i + 1);
            u32(shp, off + 4, 10);
            u32(shp, off + 8, 1);
            f64(shp, off + 12, points[i].x);
            f64(shp, off + 20, points[i].y);
            u32(shx, 100 + i * 8, off);
            u32(shx, 100 + i * 8 + 4, 10);
            off += 28;
        }
        var champs = [
            { nom: 'NOM', type: 'C', len: 80, dec: 0 },
            { nom: 'CATEGORIE', type: 'C', len: 30, dec: 0 },
            { nom: 'LAT', type: 'N', len: 20, dec: 8 },
            { nom: 'LON', type: 'N', len: 20, dec: 8 }
        ];
        var tete = 32 + champs.length * 32 + 1;
        var ligneLen = 1 + champs.reduce(function (s, c) { return s + c.len; }, 0);
        var dbf = new Uint8Array(tete + n * ligneLen + 1);
        dbf[0] = 3;
        u32(dbf, 4, n);
        new DataView(dbf.buffer).setUint16(8, tete, true);
        new DataView(dbf.buffer).setUint16(10, ligneLen, true);
        var pp = 32;
        champs.forEach(function (c) {
            var nb = encTexte(c.nom);
            dbf.set(nb.subarray(0, 11), pp); pp += 11;
            dbf[pp] = c.type.charCodeAt(0); pp++;
            pp += 4;
            dbf[pp] = c.len; pp++;
            dbf[pp] = c.dec; pp++;
            pp += 14;
        });
        dbf[tete - 1] = 0x0D;
        function padDroite(s, len) {
            s = String(s);
            if (s.length > len) s = s.slice(0, len);
            while (s.length < len) s += ' ';
            return s;
        }
        for (var j = 0; j < n; j++) {
            var base = tete + j * ligneLen;
            dbf[base] = 0x20;
            var q = 1;
            var nbN = encTexte(padDroite(points[j].nom || '', 80));
            dbf.set(nbN, base + q); q += 80;
            var nbC = encTexte(padDroite(points[j].categorie || '', 30));
            dbf.set(nbC, base + q); q += 30;
            var nbLa = encTexte(padDroite(points[j].lat !== undefined ? Number(points[j].lat).toFixed(8) : '', 20));
            dbf.set(nbLa, base + q); q += 20;
            var nbLo = encTexte(padDroite(points[j].lng !== undefined ? Number(points[j].lng).toFixed(8) : '', 20));
            dbf.set(nbLo, base + q); q += 20;
        }
        dbf[dbf.length - 1] = 0x1A;
        return { shp: shp, shx: shx, dbf: dbf };
    }

    /* ── DXF minimal ── */

    function creerDXF(points) {
        var l = [];
        l.push('0', 'SECTION', '2', 'ENTITIES');
        points.forEach(function (p) {
            l.push('0', 'POINT', '8', 'MUKMAP-POINTS', '10', String(Number(p.lng).toFixed(7)), '20', String(Number(p.lat).toFixed(7)), '30', '0', '1001', 'MUKMAP', '1000', 'NOM', '1000', (p.nom || '').slice(0, 60));
        });
        l.push('0', 'ENDSEC', '0', 'EOF');
        return l.join('\r\n');
    }

    /* ── Exposé global ── */

    globalThis.OutilsTerrain = {
        calculerAzimut: calculerAzimut,
        calculerAngle: calculerAngle,
        fmtMesure: fmtMesure,
        creerZip: creerZip,
        creerShapefile: creerShapefile,
        creerDXF: creerDXF
    };

    if (typeof document === 'undefined') return;

    /* ── Interface navigateur ── */

    var map = null;
    var ModePose = null;
    var MenuPose = null;
    var DernierLngLat = null;

    var LIB_POSE = {
        point_topo: 'Point topographique', repere_geodesique: 'Repère géodésique',
        point_altitude: "Point d'altitude", courbe_niveau: 'Courbe de niveau',
        profil: 'Profil en long / travers', zone_leve: 'Zone de levé',
        station: 'Station topographique', point_gps: 'Point GPS/GNSS',
        route: 'Route', pont: 'Pont', batiment: 'Bâtiment', ecole: 'École',
        centre_sante: 'Centre de santé', poteau: 'Poteau', arbre: 'Arbre',
        parcelle: 'Parcelle', captage_eau: 'Captage / source',
        borne_fontaine: 'Borne-fontaine', reservoir_eau: 'Réservoir / château',
        reseau_eau: 'Ouvrage réseau', village: 'Village desservi'
    };

    var URLS = {
        geojson: '/export/geojson/', kml: '/export/kml/', gpx: '/export/gpx/',
        pdf: '/export/carte-pdf/'
    };

    function trad(cle, def) {
        if (typeof window !== 'undefined' && window.mukmapT) {
            var v = window.mukmapT(cle);
            if (v) return v;
        }
        return def;
    }

    function csrf() {
        var m = document.cookie.match(/csrftoken=([^;]+)/);
        return m ? m[1] : '';
    }

    function toast(msg, type) {
        if (typeof window.toast === 'function') window.toast(msg, type);
    }

    /* ── Téléchargement ── */

    function telechargerUint8(nom, data, mime) {
        var blob = new Blob([data], { type: mime || 'application/octet-stream' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = nom;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 800);
    }

    function telechargerTexte(nom, txt, mime) {
        telechargerUint8(nom, encTexte(txt), mime);
    }

    /* ── Pose de points thématiques ── */

    function desactiverModeDessin() {
        if (typeof desactiverMode === 'function') {
            try { desactiverMode(); } catch (e) { /* ignore */ }
        }
    }

    function activerPose(categorie, btn) {
        if (ModePose === categorie) {
            ModePose = null;
            fermerMenuPose();
        } else {
            ModePose = categorie;
            desactiverModeDessin();
            document.querySelectorAll('.btn-poser.actif').forEach(function (b) { b.classList.remove('actif'); });
            if (btn) btn.classList.add('actif');
            if (map) map.getCanvas().style.cursor = 'crosshair';
            toast((trad('pose_actif', 'Pose active') + ' : ' + (LIB_POSE[categorie] || categorie)), 'succes');
        }
    }

    function creerMenuPose() {
        var m = document.createElement('div');
        m.id = 'menu-pose';
        m.className = 'card';
        m.style.position = 'absolute';
        m.innerHTML =
            '<div style="display:flex;align-items:center;gap:8px;font-weight:800;font-size:.82rem;margin-bottom:8px;"><span id="mp-icone">📍</span><span id="mp-lib"></span></div>' +
            '<input type="text" id="mp-nom" placeholder="' + trad('nom_point', 'Nom du point') + '" style="width:100%;margin-bottom:6px;">' +
            '<textarea id="mp-desc" rows="2" placeholder="' + trad('description', 'Description...') + '" style="width:100%;margin-bottom:6px;"></textarea>' +
            '<div class="mp-actions" style="display:flex;gap:6px;">' +
            '<button type="button" class="btn btn-primary btn-sm" id="mp-ok" style="flex:1;justify-content:center;">' + trad('enregistrer', 'Enregistrer') + '</button>' +
            '<button type="button" class="btn btn-sm" id="mp-ann" style="flex:1;justify-content:center;">' + trad('annuler', 'Annuler') + '</button></div>';
        m.querySelector('#mp-ok').addEventListener('click', confirmerPose);
        m.querySelector('#mp-ann').addEventListener('click', fermerMenuPose);
        document.body.appendChild(m);
        return m;
    }

    function ouvrirMenuPose(e, categorie) {
        if (!MenuPose) MenuPose = creerMenuPose();
        DernierLngLat = e.lngLat;
        var lib = LIB_POSE[categorie] || categorie;
        MenuPose.querySelector('#mp-lib').textContent = lib;
        MenuPose.querySelector('#mp-icone').textContent = boutonIcône(categorie);
        var nom = MenuPose.querySelector('#mp-nom');
        var desc = MenuPose.querySelector('#mp-desc');
        nom.value = '';
        desc.value = '';
        nom.placeholder = lib;
        nom.focus();
        MenuPose.classList.add('ouvert');
        var m = document.getElementById('map');
        if (m) {
            var rect = m.getBoundingClientRect();
            var x = e.point.x + 14;
            var y = e.point.y + 14;
            if (x + 250 > rect.width) x = e.point.x - 264;
            if (y + 160 > rect.height) y = e.point.y - 174;
            MenuPose.style.left = x + 'px';
            MenuPose.style.top = y + 'px';
        }
        setTimeout(function () { nom.focus(); }, 30);
    }

    function fermerMenuPose() {
        if (MenuPose) MenuPose.classList.remove('ouvert');
    }

    function boutonIcône(categorie) {
        var b = document.querySelector('.btn-poser[data-poser="' + categorie + '"] .p-icone');
        return b ? b.textContent : '📍';
    }

    function confirmerPose() {
        if (!MenuPose || !DernierLngLat || !ModePose) return;
        var nom = MenuPose.querySelector('#mp-nom').value.trim();
        var desc = MenuPose.querySelector('#mp-desc').value.trim();
        if (!nom) nom = LIB_POSE[ModePose] || ModePose;
        var corps = {
            nom: nom,
            description: desc,
            latitude: DernierLngLat.lat,
            longitude: DernierLngLat.lng,
            categorie: ModePose,
            statut: 'actif',
            donnees: { outil: ModePose, source: 'terrain' }
        };
        fermerMenuPose();
        if (ModePose === 'point_altitude') {
            fetch('https://api.open-meteo.com/v1/elevation?latitude=' + DernierLngLat.lat + '&longitude=' + DernierLngLat.lng)
                .then(function (r) { return r.json(); })
                .then(function (d) {
                    var alt = d && d.elevation;
                    if (typeof alt === 'number') corps.donnees.altitude = Math.round(alt);
                    envoyerPose(corps);
                })
                .catch(function () { envoyerPose(corps); });
        } else {
            envoyerPose(corps);
        }
    }

    function envoyerPose(corps) {
        fetch('/api/table-points/creer/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf() },
            body: JSON.stringify(corps)
        }).then(function (r) { return r.json(); }).then(function (d) {
            if (d && d.ok) {
                toast((trad('point_pose', 'Point « {n} » posé sur la carte.')).replace('{n}', corps.nom), 'succes');
                if (typeof rechargerPoints === 'function') rechargerPoints({});
            } else {
                toast((d && d.erreur) || (trad('erreur_sauvegarde', 'Erreur lors de la sauvegarde.')), 'error');
            }
        }).catch(function () {
            toast(trad('erreur_reseau', 'Erreur réseau.'), 'error');
        });
    }

    /* ── Exports ── */

    function telechargerDepuisURL(url) {
        var a = document.createElement('a');
        a.href = url;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { document.body.removeChild(a); }, 500);
    }

    function exporter(fmt) {
        if (fmt === 'geojson' || fmt === 'kml' || fmt === 'gpx') {
            telechargerDepuisURL(URLS[fmt]);
            return;
        }
        if (fmt === 'pdf') {
            var btn = document.getElementById('btn-exporter-carte');
            if (btn) {
                btn.click();
                setTimeout(function () {
                    var sel = document.getElementById('export-format');
                    if (sel) sel.value = 'pdf';
                }, 60);
            }
            return;
        }
        var pts = (typeof donneesPoints !== 'undefined') ? (donneesPoints || []) : [];
        if (fmt === 'png') {
            try {
                telechargerUint8('mukmap-capture.png', map.getCanvas().toDataURL('image/png').replace(/^data:image\/png;base64,/, ''), 'application/octet-stream');
            } catch (e) { toast(trad('erreur_export', 'Erreur d\'export.'), 'error'); }
            return;
        }
        if (fmt === 'dxf') {
            telechargerTexte('mukmap-points.dxf', creerDXF(pts), 'application/dxf');
            return;
        }
        if (fmt === 'kmz') {
            fetch(URLS.kml).then(function (r) { return r.text(); }).then(function (kml) {
                var zip = creerZip([{ nom: 'doc.kml', data: encTexte(kml) }]);
                telechargerUint8('mukmap-points.kmz', zip, 'application/vnd.google-earth.kmz');
            }).catch(function () { toast(trad('erreur_export', 'Erreur d\'export.'), 'error'); });
            return;
        }
        if (fmt === 'shapefile') {
            var shpPts = pts.map(function (p) {
                return { x: Number(p.longitude), y: Number(p.latitude), lat: p.latitude, lng: p.longitude, nom: p.nom, categorie: p.categorie };
            });
            var sf = creerShapefile(shpPts);
            var zip = creerZip([
                { nom: 'mukmap-points.shp', data: sf.shp },
                { nom: 'mukmap-points.shx', data: sf.shx },
                { nom: 'mukmap-points.dbf', data: sf.dbf }
            ]);
            telechargerUint8('mukmap-points-shp.zip', zip, 'application/zip');
            return;
        }
    }

    /* ── Mesures supplémentaires ── */

    var NOUVELLES_MESURES = ['polyline', 'rayon', 'angle', 'azimut', 'perimetre'];

    function msgMesure(mode) {
        var msgs = {
            polyline: trad('dessin_msg_polyligne', 'Cliquez pour tracer la polyligne. Double-clic pour terminer.'),
            rayon: trad('mesure_msg_rayon', 'Cliquez le centre puis un 2ᵉ point pour le rayon. Double-clic pour terminer.'),
            angle: trad('mesure_msg_angle', 'Cliquez 3 points (sommet au 2ᵉ). Double-clic pour terminer.'),
            azimut: trad('mesure_msg_azimut', 'Cliquez le départ puis la direction. Double-clic pour terminer.'),
            perimetre: trad('mesure_msg_perimetre', 'Cliquez pour mesurer le périmètre. Double-clic pour terminer.')
        };
        return msgs[mode] || '';
    }

    function majMesureEnCours() {
        if (typeof vertices === 'undefined' || typeof mesureValeur === 'undefined') return;
        var v = vertices || [];
        if (!mode) return;
        if (mode === 'rayon' && v.length === 2) {
            mesureValeur.textContent = 'Rayon : ' + fmtMesure(turf.distance(turf.point(v[0]), turf.point(v[1]), { units: 'meters' }));
        } else if (mode === 'angle' && v.length >= 3) {
            mesureValeur.textContent = 'Angle : ' + calculerAngle(v[v.length - 3], v[v.length - 2], v[v.length - 1]).toFixed(1) + '°';
        } else if (mode === 'azimut' && v.length >= 2) {
            mesureValeur.textContent = 'Azimut : ' + calculerAzimut(v[v.length - 2], v[v.length - 1]).toFixed(1) + '°';
        } else if (mode === 'perimetre' && v.length > 1) {
            mesureValeur.textContent = 'Périmètre : ' + fmtMesure(turf.length(turf.lineString(v), { units: 'meters' }));
        }
    }

    function terminerNouvelleMesure() {
        if (typeof vertices === 'undefined' || typeof mode === 'undefined') return;
        var v = vertices || [];
        var m = mode;
        if (m === 'polyline' && v.length > 1) {
            finaliserDessin('LineString', v.slice());
        } else if (m === 'rayon' && v.length === 2) {
            var r = turf.distance(turf.point(v[0]), turf.point(v[1]), { units: 'meters' });
            toast('Rayon : ' + fmtMesure(r), 'succes');
            desactiverMode();
        } else if (m === 'angle' && v.length >= 3) {
            toast('Angle : ' + calculerAngle(v[v.length - 3], v[v.length - 2], v[v.length - 1]).toFixed(1) + '°', 'succes');
            desactiverMode();
        } else if (m === 'azimut' && v.length >= 2) {
            toast('Azimut : ' + calculerAzimut(v[v.length - 2], v[v.length - 1]).toFixed(1) + '°', 'succes');
            desactiverMode();
        } else if (m === 'perimetre' && v.length > 1) {
            toast('Périmètre : ' + fmtMesure(turf.length(turf.lineString(v), { units: 'meters' })), 'succes');
            desactiverMode();
        }
    }

    /* ── Installation ── */

    function installer() {
        var conteneur = document.getElementById('outils-dessin');
        if (conteneur) {
            conteneur.addEventListener('click', function (ev) {
                var btnP = ev.target.closest('.btn-poser');
                if (btnP) {
                    activerPose(btnP.getAttribute('data-poser'), btnP);
                    return;
                }
                var btnT = ev.target.closest('.btn-tool');
                if (btnT) {
                    if (ModePose) {
                        ModePose = null;
                        fermerMenuPose();
                        document.querySelectorAll('.btn-poser.actif').forEach(function (b) { b.classList.remove('actif'); });
                    }
                    var m = btnT.getAttribute('data-mode');
                    if (NOUVELLES_MESURES.indexOf(m) !== -1) {
                        setTimeout(function () {
                            if (typeof mesureBarre !== 'undefined') mesureBarre.style.display = 'flex';
                            if (typeof hintDessin !== 'undefined' && mode) hintDessin.textContent = msgMesure(mode);
                            majMesureEnCours();
                        }, 0);
                    }
                }
            });
        }
        var contExports = document.getElementById('exports-outils');
        if (contExports) {
            contExports.addEventListener('click', function (ev) {
                var btnE = ev.target.closest('.btn-export');
                if (btnE) exporter(btnE.getAttribute('data-export'));
            });
        }
        var eMap = document.getElementById('map');
        if (eMap) eMap.style.position = 'relative';

        map.on('click', function (e) {
            if (ModePose) {
                ouvrirMenuPose(e, ModePose);
                return;
            }
            majMesureEnCours();
        });
        map.on('dblclick', terminerNouvelleMesure);

        var btnFinir = document.getElementById('btn-finir-mesure');
        if (btnFinir) btnFinir.addEventListener('click', function () {
            if (typeof mode !== 'undefined' && NOUVELLES_MESURES.indexOf(mode) !== -1) terminerNouvelleMesure();
        });

        document.addEventListener('keydown', function (ev) {
            if (ev.key === 'Escape' && ModePose) {
                ModePose = null;
                fermerMenuPose();
                document.querySelectorAll('.btn-poser.actif').forEach(function (b) { b.classList.remove('actif'); });
                if (map) map.getCanvas().style.cursor = '';
            }
        });
    }

    function init() {
        try {
            if (typeof window.map === 'undefined' || !window.map) return false;
            if (typeof mesureBarre === 'undefined') return false;
            if (typeof vertices === 'undefined') return false;
            map = window.map;
            installer();
            return true;
        } catch (e) {
            return false;
        }
    }

    var essais = 0;
    var timer = setInterval(function () {
        essais++;
        if (init() || essais > 200) clearInterval(timer);
    }, 100);
})();