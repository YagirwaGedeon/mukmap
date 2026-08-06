/* MUKMAP — Export de la carte en PDF / JPEG.
 * Capture le canvas MapLibre à haute résolution, compose une mise en page
 * cartographique professionnelle (titre, légende, échelle, flèche nord,
 * pied de page) et télécharge en JPEG ou via le serveur en PDF.
 */
(function () {
    'use strict';

    var MM_POUCE = 25.4;
    var FORMATS_PAPIER = {
        A4: [210, 297], A3: [297, 420], A2: [420, 594],
        A1: [594, 841], A0: [841, 1189],
    };
    var MAX_COTE_CAPTURE = 12000; // px physiques max pour le canvas WebGL

    // ── Cœur pur (testable en Node) ────────────────────────────
    var Core = {
        formatPixels: function (format, orientation, dpi) {
            var mm = FORMATS_PAPIER[format] || FORMATS_PAPIER.A4;
            var w = (mm[0] / MM_POUCE) * dpi;
            var h = (mm[1] / MM_POUCE) * dpi;
            if (orientation === 'L') { var t = w; w = h; h = t; }
            var facteur = 1;
            if (Math.max(w, h) > MAX_COTE_CAPTURE) facteur = MAX_COTE_CAPTURE / Math.max(w, h);
            return { largeur: Math.round(w * facteur), hauteur: Math.round(h * facteur), facteur: facteur };
        },

        // Distance en mètres entre deux longitudes à une latitude donnée.
        distanceLongitude: function (lon1, lon2, lat) {
            var R = 6378137;
            var dLon = (lon2 - lon1) * Math.PI / 180;
            var latR = lat * Math.PI / 180;
            return Math.cos(latR) * R * dLon;
        },

        // Barre d'échelle : choisit une valeur ronde (1/2/5 × 10^n) dans la limite maxPx.
        calculerEchelleBarre: function (mParPx, maxPx) {
            var valeur = mParPx * (maxPx || 200);
            var exposant = Math.floor(Math.log10(valeur));
            var base = Math.pow(10, exposant);
            var candidats = [1, 2, 5, 10].map(function (k) { return k * base; });
            var choix = candidats[0];
            for (var i = 0; i < candidats.length; i++) {
                choix = candidats[i];
                if (candidats[i] * mParPx * -1 < 0) { /* noop */ }
                if (choix >= mParPx * 40) break;
            }
            var px = choix / mParPx;
            if (px > maxPx) { choix = choix / 2; px = choix / mParPx; }
            var texte = choix >= 1000 ? (choix / 1000) + ' km' : choix + ' m';
            if (choix >= 1000 && choix % 1000 === 0) texte = (choix / 1000) + ' km';
            return { px: Math.round(px), valeur: choix, texte: texte };
        },

        // Légende structurée depuis les données réellement visibles.
        construireLegende: function (data) {
            var items = [];
            var cats = data.categories || [];   // [{nom, couleur, emoji, compte}]
            var couches = data.couches || [];   // [{nom, couleur, type}]
            var zones = data.zones || [];       // [{nom, couleur, statut}]
            if (cats.length) {
                items.push({ groupe: data.libCategorie, items: cats.map(function (c) {
                    return { type: 'point', couleur: c.couleur, texte: (c.emoji ? c.emoji + ' ' : '') + c.nom + (c.compte > 0 ? ' (' + c.compte + ')' : '') };
                }) });
            }
            if (couches.length) {
                items.push({ groupe: data.libCouches, items: couches.map(function (c) {
                    return { type: c.type === 'ligne' ? 'ligne' : c.type === 'polygone' ? 'polygone' : 'point', couleur: c.couleur, texte: c.nom };
                }) });
            }
            if (zones.length) {
                items.push({ groupe: data.libZones, items: zones.map(function (z) {
                    return { type: 'zone', couleur: z.couleur, texte: z.nom };
                }) });
            }
            return items;
        },
    };
    globalThis.ExportCarteCore = Core;

    // ── Navigateur uniquement ──────────────────────────────────
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    var map = null, t = function (cle, defaut) { return (window.mukmapT ? window.mukmapT(cle, defaut) : defaut); };

    function init() {
        map = window.map;
        var btn = document.getElementById('btn-exporter-carte');
        if (!map || !btn) return;
        btn.addEventListener('click', ouvrirModale);
        var modale = document.getElementById('modale-export');
        if (modale) {
            modale.addEventListener('click', function (e) { if (e.target === modale) fermerModale(); });
            document.getElementById('export-annuler').addEventListener('click', fermerModale);
            document.getElementById('export-apercu').addEventListener('click', function () { genererApercu(); });
            document.getElementById('export-lancer').addEventListener('click', function () { lancerExport(); });
            document.getElementById('export-options-toggle').addEventListener('click', function () {
                var zone = document.getElementById('export-options');
                zone.style.display = zone.style.display === 'none' ? 'block' : 'none';
            });
            ['export-format', 'export-zone', 'export-orientation', 'export-format-page', 'export-dpi',
             'export-marges', 'export-qualite', 'export-taille'].forEach(function (id) {
                var el = document.getElementById(id);
                if (el) el.addEventListener('change', function () { actualiserApercuAuto(); });
            });
        }
    }

    function lireConf() {
        var format = (document.getElementById('export-format').value || 'pdf').toLowerCase();
        var zone = (document.getElementById('export-zone').value || 'vue').toLowerCase();
        var orientation = (document.getElementById('export-orientation').value || 'L').toUpperCase();
        var formatPage = (document.getElementById('export-format-page').value || 'A4').toUpperCase();
        var dpi = parseInt(document.getElementById('export-dpi').value || '150', 10);
        var marges = (document.getElementById('export-marges').value || 'normales');
        var qualite = document.getElementById('export-qualite').value || 'haute';
        var taille = document.getElementById('export-taille').value || '1920x1080';
        var elements = {};
        ['titre', 'sous_titre', 'legende', 'echelle', 'nord', 'coordonnees', 'source', 'date', 'projection', 'projet', 'logo']
            .forEach(function (k) { elements[k] = document.getElementById('export-el-' + k).checked; });
        var titre = document.getElementById('export-champ-titre').value.trim();
        var sousTitre = document.getElementById('export-champ-sous-titre').value.trim();
        var auteur = document.getElementById('export-champ-auteur').value.trim();
        var source = document.getElementById('export-champ-source').value.trim();
        var notes = document.getElementById('export-champ-notes').value.trim();
        var dateAuto = document.getElementById('export-date-auto').checked;
        return {
            format: format, zone: zone, orientation: orientation, format_page: formatPage,
            dpi: dpi, marges: marges, qualite: qualite, taille: taille, elements: elements,
            titre: titre, sous_titre: sousTitre, auteur: auteur, source: source, notes: notes, date_auto: dateAuto,
        };
    }

    function margeMm(conf) {
        if (conf.marges === 'reduites') return 8;
        if (conf.marges === 'personnalisees') {
            var v = parseFloat(document.getElementById('export-marge-custom').value || '12');
            return isFinite(v) ? Math.min(Math.max(v, 4), 40) : 12;
        }
        return 12;
    }

    // ── Capture du canvas MapLibre ─────────────────────────────
    function attendreRendu(dureeMax) {
        return new Promise(function (resolve) {
            var fini = false;
            var fin = function () { if (!fini) { fini = true; clearTimeout(timer); setTimeout(resolve, 350); } };
            var timer = setTimeout(fin, dureeMax || 6000);
            try { map.once('idle', fin); } catch (e) { fin(); }
        });
    }

    // Capture fiable du canvas WebGL : MapLibre crée son contexte avec
    // preserveDrawingBuffer=false, donc le buffer est vidé dès que la frame est
    // compositée à l'écran. toDataURL() doit être appelé dans le même tick que le
    // rendu (événement 'render' déclenché par triggerRepaint), sinon on obtient un
    // PNG transparent (carte blanche à l'assemblage).
    function capturerUneFrame() {
        return new Promise(function (resolve) {
            var fait = false;
            var terminer = function () {
                if (fait) return;
                fait = true;
                try { map.off('render', terminer); } catch (e) { /* ignorer */ }
                resolve(map.getCanvas().toDataURL('image/png'));
            };
            try { map.on('render', terminer); } catch (e) { /* ignorer */ }
            try { map.triggerRepaint(); } catch (e) { /* ignorer */ }
            setTimeout(terminer, 2500); // filet de sécurité si aucun render ne se produit
        });
    }

    function imageNonVide(url) {
        return new Promise(function (resolve) {
            var img = new Image();
            img.onload = function () {
                try {
                    var cv = document.createElement('canvas');
                    cv.width = Math.min(img.naturalWidth, 512);
                    cv.height = Math.min(img.naturalHeight, 512);
                    var ctx = cv.getContext('2d');
                    ctx.drawImage(img, 0, 0, cv.width, cv.height);
                    var d = ctx.getImageData(0, 0, cv.width, cv.height).data;
                    var nb = 0;
                    for (var i = 3; i < d.length; i += 4) { if (d[i] > 0) nb++; }
                    resolve(nb > 16);
                } catch (e) { resolve(true); }
            };
            img.onerror = function () { resolve(false); };
            img.src = url;
        });
    }

    async function capturerCanvas() {
        var url = await capturerUneFrame();
        for (var essai = 0; essai < 3 && !(await imageNonVide(url)); essai++) {
            await new Promise(function (res) { setTimeout(res, 250); });
            url = await capturerUneFrame();
        }
        return url;
    }

    // Bbox de toutes les données sélectionnées (pour « toutes les données »).
    function bboxToutesDonnees() {
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        var etendre = function (x, y) {
            if (!isFinite(x) || !isFinite(y)) return;
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
        };
        var points = (window.pointsFiltres ? window.pointsFiltres() : []) || [];
        points.forEach(function (p) { etendre(p.longitude, p.latitude); });
        (window.couchesDonnees || []).forEach(function (c) {
            try {
                var b = window.turf && window.turf.bbox ? window.turf.bbox(c.geojson) : null;
                if (b) { etendre(b[0], b[1]); etendre(b[2], b[3]); }
            } catch (e) { /* ignorer */ }
        });
        (window.zones || []).forEach(function (z) {
            var c = z.coordonnees;
            if (!c) return;
            if (z.type === 'Point') etendre(c[0], c[1]);
            else if (Array.isArray(c) && c[0] && Array.isArray(c[0])) c.forEach(function (pt) { etendre(pt[0], pt[1]); });
        });
        (window.activites || []).forEach(function (a) { etendre(a.longitude, a.latitude); });
        (window.agents || []).forEach(function (a) { etendre(a.longitude, a.latitude); });
        if (!isFinite(minX)) return null;
        return [[minX, minY], [maxX, maxY]];
    }

    // Capture la carte à la taille cible (px physiques), vue actuelle ou toutes données.
    // Le cap est fait au nord (bearing 0, pitch 0) : la barre d'échelle est alors exacte,
    // l'orientation réelle est conservée pour la flèche nord de la mise en page.
    async function capturerCarte(largeur, hauteur, toutesDonnees) {
        var conteneur = map.getContainer();
        var ancienW = conteneur.style.width, ancienH = conteneur.style.height;
        var etatVue = { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
        var dpr = window.devicePixelRatio || 1;
        var cssW = largeur / dpr, cssH = hauteur / dpr;
        var bbox = null;
        if (toutesDonnees) bbox = bboxToutesDonnees();

        try {
            conteneur.style.width = cssW + 'px';
            conteneur.style.height = cssH + 'px';
            if (bbox) map.fitBounds(bbox, { padding: 24, maxZoom: 16, duration: 0 });
            map.setBearing(0);
            map.setPitch(0);
            map.resize();
            await attendreRendu();
            var url = await capturerCanvas();
            var b = map.getBounds();
            var metres = b ? Core.distanceLongitude(b.getWest(), b.getEast(), map.getCenter().lat) : 0;
            return { url: url, metres: metres };
        } finally {
            conteneur.style.width = ancienW;
            conteneur.style.height = ancienH;
            map.resize();
            try { map.jumpTo({ center: etatVue.center, zoom: etatVue.zoom, bearing: etatVue.bearing, pitch: etatVue.pitch }); } catch (e) { /* ignorer */ }
        }
    }

    function chargerImage(src) {
        return new Promise(function (resolve) {
            var img = new Image();
            img.onload = function () { resolve(img); };
            img.onerror = function () { resolve(null); };
            img.src = src;
        });
    }

    // ── Composition de la page ─────────────────────────────────
    async function composerPage(conf, largeur, hauteur, imageCarte) {
        var cv = document.createElement('canvas');
        cv.width = largeur; cv.height = hauteur;
        var ctx = cv.getContext('2d');
        var mm = largeur / (conf.mmLarg || 297);
        var echelle = conf.echellePx || 96; // px par mm approximatif (dpi/25.4)
        var marge = margeMm(conf) * mm;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, largeur, hauteur);
        ctx.fillStyle = '#f5f6fa';
        ctx.fillRect(0, 0, largeur, Math.round(20 * mm));

        var y = 0;
        var logoOk = false;
        if (conf.elements.logo) {
            var logo = await chargerImage(window.mukmap_logo || '');
            if (logo && logo.width) {
                var lh = 13 * mm, lw = lh * (logo.width / logo.height);
                try { ctx.drawImage(logo, marge, 3.5 * mm, lw, lh); logoOk = true; } catch (e) { logoOk = false; }
            }
        }
        var xTitre = logoOk ? marge + 17 * mm : marge;
        ctx.textBaseline = 'middle';
        if (conf.elements.titre && conf.titre) {
            ctx.fillStyle = '#1a1f36';
            ctx.font = '800 ' + Math.round(7 * mm) + 'px Inter, Arial, sans-serif';
            ctx.fillText(conf.titre, xTitre, 8 * mm, largeur - xTitre - marge - 6 * mm);
        }
        if (conf.elements.sous_titre && conf.sous_titre) {
            ctx.fillStyle = '#4b5278';
            ctx.font = '600 ' + Math.round(3.6 * mm) + 'px Inter, Arial, sans-serif';
            ctx.fillText(conf.sous_titre, xTitre, 14.5 * mm, largeur - xTitre - marge - 6 * mm);
        }
        if (conf.elements.projet && conf.projet) {
            ctx.fillStyle = '#6d5df6';
            ctx.font = '700 ' + Math.round(3.6 * mm) + 'px Inter, Arial, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(conf.projet, largeur - marge, 8 * mm);
            ctx.textAlign = 'left';
        }

        var bandeHaut = Math.round(22 * mm);
        var piedH = Math.round(15 * mm);
        var legW = conf.elements.legende && conf.legendeItems ? Math.round(Math.min(60 * mm, largeur * 0.32)) : 0;
        var carteX = marge, carteY = bandeHaut + 2 * mm;
        var carteW = largeur - 2 * marge - legW - (legW ? 6 * mm : 0);
        var carteH = hauteur - carteY - piedH - marge;

        // Fond carte
        ctx.fillStyle = '#eef0f7';
        ctx.fillRect(carteX, carteY, carteW, carteH);
        if (imageCarte) {
            var img = new Image();
            img.src = imageCarte;
            await new Promise(function (res) {
                if (img.complete && img.naturalWidth) return res();
                img.onload = res; img.onerror = res;
            });
            if (img.naturalWidth) {
                var ratio = img.naturalWidth / img.naturalHeight;
                var cw = carteW, ch = cw / ratio;
                if (ch > carteH) { ch = carteH; cw = ch * ratio; }
                ctx.drawImage(img, carteX + (carteW - cw) / 2, carteY + (carteH - ch) / 2, cw, ch);
            }
        }
        // Cadre
        ctx.strokeStyle = '#d8dbe9'; ctx.lineWidth = 1;
        ctx.strokeRect(carteX, carteY, carteW, carteH);

        // Échelle
        if (conf.elements.echelle && conf.barre) {
            var bx = carteX + 10 * mm, by = carteY + carteH - 8 * mm;
            var pxEchelle = conf.barre.px;
            if (conf.imageScale && conf.imageScale !== 1) pxEchelle = conf.barre.px / conf.imageScale;
            var maxEchelle = carteW - 22 * mm;
            var echellePx = Math.min(pxEchelle, maxEchelle);
            ctx.fillStyle = '#1a1f36';
            ctx.font = '600 ' + Math.round(3.2 * mm) + 'px Inter, Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(conf.barre.texte, bx + echellePx / 2, by - 3.2 * mm);
            ctx.textAlign = 'left';
            ctx.strokeStyle = '#1a1f36'; ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(bx, by); ctx.lineTo(bx + echellePx, by); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(bx, by - 2.2 * mm); ctx.lineTo(bx, by + 2.2 * mm); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(bx + echellePx, by - 2.2 * mm); ctx.lineTo(bx + echellePx, by + 2.2 * mm); ctx.stroke();
        }

        // Flèche nord
        if (conf.elements.nord) {
            var nx = carteX + carteW - 14 * mm, ny = carteY + 14 * mm;
            var bearing = (conf.bearing || 0) * Math.PI / 180;
            ctx.save();
            ctx.translate(nx, ny);
            ctx.rotate(-bearing);
            ctx.fillStyle = '#1a1f36';
            ctx.font = '800 ' + Math.round(4 * mm) + 'px Arial, sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('N', 0, -8.5 * mm);
            ctx.beginPath();
            ctx.moveTo(0, -6 * mm); ctx.lineTo(3.4 * mm, 3 * mm); ctx.lineTo(-3.4 * mm, 3 * mm);
            ctx.closePath(); ctx.fill();
            ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
            ctx.restore();
        }

        // Légende
        if (legW && conf.legendeItems && conf.legendeItems.length) {
            var lx = carteX + carteW + 6 * mm;
            var ly = carteY + 2 * mm;
            ctx.fillStyle = '#ffffff';
            var titreLeg = t('legende', 'Légende');
            ctx.fillStyle = '#1a1f36';
            ctx.font = '800 ' + Math.round(4.2 * mm) + 'px Inter, Arial, sans-serif';
            ctx.fillText(titreLeg, lx, ly);
            var lyy = ly + 7 * mm;
            conf.legendeItems.forEach(function (grp) {
                if (lyy > carteY + carteH - 10 * mm) return;
                ctx.fillStyle = '#6b729c';
                ctx.font = '700 ' + Math.round(3 * mm) + 'px Inter, Arial, sans-serif';
                ctx.fillText(grp.groupe, lx, lyy); lyy += 4.6 * mm;
                grp.items.forEach(function (it) {
                    if (lyy > carteY + carteH - 4 * mm) return;
                    if (it.type === 'ligne' || it.type === 'zone') {
                        ctx.strokeStyle = it.couleur; ctx.lineWidth = 2.6;
                        ctx.beginPath(); ctx.moveTo(lx, lyy - 0.5 * mm); ctx.lineTo(lx + 6 * mm, lyy - 0.5 * mm); ctx.stroke();
                    } else {
                        ctx.fillStyle = it.couleur;
                        ctx.beginPath(); ctx.arc(lx + 3 * mm, lyy - 0.5 * mm, 2 * mm, 0, Math.PI * 2); ctx.fill();
                        if (it.type === 'polygone') { ctx.strokeStyle = '#1a1f36'; ctx.lineWidth = 0.8; ctx.stroke(); }
                    }
                    ctx.fillStyle = '#1a1f36';
                    ctx.font = '500 ' + Math.round(3.1 * mm) + 'px Inter, Arial, sans-serif';
                    ctx.fillText(it.texte, lx + 8 * mm, lyy - 0.5 * mm, legW - 9 * mm);
                    lyy += 4.4 * mm;
                });
                lyy += 2 * mm;
            });
        }

        // Pied de page
        var py = hauteur - piedH + 3 * mm;
        ctx.fillStyle = '#f5f6fa';
        ctx.fillRect(0, hauteur - piedH, largeur, piedH);
        ctx.strokeStyle = '#e3e5f2'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, hauteur - piedH); ctx.lineTo(largeur, hauteur - piedH); ctx.stroke();
        ctx.fillStyle = '#4b5278';
        ctx.font = '500 ' + Math.round(3 * mm) + 'px Inter, Arial, sans-serif';
        var ligneBas = [];
        if (conf.elements.echelle && conf.echelleTexte) ligneBas.push(t('echelle', 'Échelle') + ' : ' + conf.echelleTexte);
        if (conf.elements.source && conf.source) ligneBas.push(t('source', 'Source') + ' : ' + conf.source);
        if (conf.elements.projection) ligneBas.push(t('projection', 'Projection') + ' : EPSG:4326 (WGS84)');
        if (conf.elements.coordonnees && conf.coordonnees) ligneBas.push(t('coordonnees', 'Coordonnées') + ' : ' + conf.coordonnees);
        if (conf.elements.date && conf.date) ligneBas.push(t('date', 'Date') + ' : ' + conf.date);
        ctx.fillText(ligneBas.join('   ·   ').slice(0, 180), marge, py, largeur - 2 * marge - 50 * mm);
        if (conf.elements.auteur && conf.auteur) {
            ctx.textAlign = 'right';
            ctx.fillText(conf.auteur, largeur - marge, py);
            ctx.textAlign = 'left';
        }
        if (conf.notes) {
            ctx.fillStyle = '#6b729c';
            ctx.fillText(t('notes', 'Notes') + ' : ' + conf.notes, marge, py + 5 * mm, largeur - 2 * marge);
        }
        return cv;
    }

    // ── Données pour la légende ────────────────────────────────
    function donneesLegende() {
        var points = (window.pointsFiltres ? window.pointsFiltres() : []) || [];
        var comptes = {};
        points.forEach(function (p) { comptes[p.categorie] = (comptes[p.categorie] || 0) + 1; });
        var toutes = Object.keys(window.CATS || {});
        var actives = toutes.filter(function (c) { return comptes[c] > 0; });
        // Légende de la carte : toutes les catégories affichées (avec leurs comptes).
        // À l'export, on ne montre que les catégories présentes ; s'il n'y en a aucune,
        // on affiche quand même toutes celles de la carte pour la compréhension.
        var visees = actives.length ? actives : toutes;
        var cats = visees.map(function (c) {
            return { nom: (window.mukmapT && window.mukmapT('cat_' + c)) || c,
                     couleur: window.CATS[c].couleur, emoji: window.CATS[c].emoji, compte: comptes[c] || 0 };
        });
        var couches = (window.couchesDonnees || []).map(function (c) {
            return { nom: c.nom, couleur: c.couleur || '#3388ff', type: c.type };
        });
        var zones = (window.zones || []).map(function (z) {
            var st = (window.ZONE_STATUTS && window.ZONE_STATUTS[z.statut]) || {};
            return { nom: z.nom, couleur: st.couleur || '#888888', statut: z.statut };
        });
        var libCategorie = t('legende_categories', 'Catégories');
        var libCouches = t('couches_chargees', 'Couches');
        var libZones = t('zones_securite', 'Zones de sécurité');
        return Core.construireLegende({ categories: cats, couches: couches, zones: zones,
            libCategorie: libCategorie, libCouches: libCouches, libZones: libZones });
    }

    // Échelle réelle : 1:N au format d'impression (px document par mètre).
    function echelleTexte(metresParPxDoc, mmPx) {
        if (!metresParPxDoc || metresParPxDoc <= 0) return '1:1';
        var N = Math.max(1, Math.round(metresParPxDoc * mmPx));
        return '1:' + N.toLocaleString('fr-FR').replace(/\s/g, '\u202F');
    }

    // ── Préparation de la configuration finale ─────────────────
    async function preparer(conf) {
        var maintenant = new Date();
        var dateTexte = conf.date_auto ? maintenant.toLocaleDateString('fr-FR') : conf.dateTexte || '';
        var source = conf.source || (window.BASEMAPS && window.BASEMAPS[window.basemapActif || 'osm']
            ? window.BASEMAPS[window.basemapActif].attribution : '');
        var projet = conf.projet || '';
        var centre = map.getCenter();
        var coordTexte = centre ? centre.lat.toFixed(4) + ', ' + centre.lng.toFixed(4) : '';
        return {
            conf: conf,
            titre: conf.titre || (projet ? projet + ' — Carte' : t('carte_mukmap', 'Carte MUKMAP')),
            sous_titre: conf.sous_titre || (window.activite_actuelle_nom || ''),
            projet: projet,
            date: dateTexte,
            source: source,
            coordonnees: coordTexte,
            auteur: conf.auteur,
            notes: conf.notes,
        };
    }

    // ── Flux principal ─────────────────────────────────────────
    function lancerExport() {
        var conf = lireConf();
        var apercu = document.getElementById('export-apercu-zone');
        if (apercu) { apercu.style.display = 'block'; apercu.innerHTML = '<div class="spin"></div><div>Rendu en cours…</div>'; }
        preparer(conf).then(function (meta) {
            var confFinale = Object.assign({}, conf, meta);
            var largeur, hauteur, mmLarg;
            if (confFinale.format === 'pdf') {
                var px = Core.formatPixels(confFinale.format_page, confFinale.orientation, confFinale.dpi);
                largeur = px.largeur; hauteur = px.hauteur;
                mmLarg = (FORMATS_PAPIER[confFinale.format_page] || FORMATS_PAPIER.A4)[0];
                if (confFinale.orientation === 'L') mmLarg = (FORMATS_PAPIER[confFinale.format_page] || FORMATS_PAPIER.A4)[1];
            } else {
                var parts = (confFinale.taille || '1920x1080').split('x');
                largeur = parseInt(parts[0], 10) || 1920; hauteur = parseInt(parts[1], 10) || 1080;
                mmLarg = largeur * MM_POUCE / (confFinale.dpi || 150);
            }
            confFinale.mmLarg = mmLarg;

            var toutesDonnees = confFinale.zone === 'toutes';
            var bearing = map.getBearing() || 0;
            confFinale.bearing = bearing;
            confFinale.legendeItems = donneesLegende();

            // Mise en page identique à composerPage() : dimensions du cadre de la carte.
            var mmPx = largeur / Math.max(confFinale.mmLarg, 1);
            var margePx = margeMm(confFinale) * mmPx;
            var legWpx = (confFinale.elements.legende && confFinale.legendeItems && confFinale.legendeItems.length)
                ? Math.min(60 * mmPx, largeur * 0.32) : 0;
            var carteY = Math.round(22 * mmPx) + 2 * mmPx;
            var carteW = largeur - 2 * margePx - legWpx - (legWpx ? 6 * mmPx : 0);
            var carteH = hauteur - carteY - Math.round(15 * mmPx) - margePx;
            var capW = Math.min(carteW, MAX_COTE_CAPTURE);
            var capH = capW * (carteH / Math.max(carteW, 1));
            if (capH > MAX_COTE_CAPTURE) { capH = MAX_COTE_CAPTURE; capW = capH * (carteW / Math.max(carteH, 1)); }
            capturerCarte(Math.round(capW), Math.round(capH), toutesDonnees).then(function (res) {
                var mParDoc = res.metres > 0 ? carteW / res.metres : 0;
                confFinale.barre = Core.calculerEchelleBarre(mParDoc, 200);
                confFinale.echelleTexte = echelleTexte(mParDoc, mmPx);
                composerPage(confFinale, largeur, hauteur, res.url).then(function (cv) {
                    afficherResultat(confFinale, cv);
                });
            });
        });
    }

    function afficherResultat(conf, cv) {
        var apercu = document.getElementById('export-apercu-zone');
        if (conf.format === 'jpeg') {
            var qualiteMap = { standard: 0.78, haute: 0.88, 'tres-haute': 0.95 };
            var q = qualiteMap[conf.qualite] || 0.88;
            var url = cv.toDataURL('image/jpeg', q);
            if (apercu) { apercu.innerHTML = ''; var img = document.createElement('img'); img.src = url; img.style.maxWidth = '100%'; apercu.appendChild(img); }
            telecharger(url, 'carte_' + (conf.projet ? conf.projet.replace(/\s+/g, '_').slice(0, 40) : 'mukmap') + '_' + new Date().toISOString().slice(0, 10) + '.jpg');
            toast(t('export_reussi', 'Export réussi'));
        } else {
            var urlPng = cv.toDataURL('image/png');
            if (apercu) { apercu.innerHTML = ''; var img2 = document.createElement('img'); img2.src = urlPng; img2.style.maxWidth = '100%'; apercu.appendChild(img2); }
            var confEnvoi = {
                image: urlPng, format_page: conf.format_page, orientation: conf.orientation,
                marge_mm: margeMm(conf), projet: conf.projet,
            };
            fetch('/export/carte-pdf/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': document.getElementById('export-csrf') ? document.getElementById('export-csrf').value : (window.CSRF || '') },
                body: JSON.stringify(confEnvoi),
            }).then(function (r) {
                if (!r.ok) return r.json().then(function (d) { throw new Error(d.erreur || 'Erreur PDF'); });
                return r.blob();
            }).then(function (blob) {
                var url = URL.createObjectURL(blob);
                telechargerUrl(url, (blob.name || 'carte.pdf'));
                setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
                toast(t('export_reussi', 'Export réussi'));
            }).catch(function (err) {
                toast('❌ ' + err.message, 'warning');
            });
        }
    }

    function telecharger(url, nom) {
        var a = document.createElement('a');
        a.href = url; a.download = nom;
        document.body.appendChild(a); a.click();
        setTimeout(function () { a.remove(); }, 300);
    }
    function telechargerUrl(url, nom) {
        var a = document.createElement('a');
        a.href = url; a.download = nom;
        document.body.appendChild(a); a.click();
        setTimeout(function () { a.remove(); }, 300);
    }

    function ouvrirModale() {
        var modale = document.getElementById('modale-export');
        if (!modale) return;
        var titre = document.getElementById('export-champ-titre');
        if (titre && !titre.value) {
            var projetEl = document.querySelector('.pa-nom');
            titre.value = (projetEl ? projetEl.textContent.trim() : '') || t('carte_mukmap', 'Carte MUKMAP');
        }
        var sous = document.getElementById('export-champ-sous-titre');
        if (sous && !sous.value) {
            var actEl = document.querySelector('.pa-act');
            sous.value = actEl ? actEl.textContent.trim() : '';
        }
        var auteur = document.getElementById('export-champ-auteur');
        if (auteur && !auteur.value && window.userNom) auteur.value = window.userNom;
        modale.style.display = 'flex';
    }

    function fermerModale() {
        var modale = document.getElementById('modale-export');
        if (modale) modale.style.display = 'none';
    }

    function genererApercu() {
        var conf = lireConf();
        preparer(conf).then(function (meta) {
            var confF = Object.assign({}, conf, meta);
            var largeur, hauteur;
            if (confF.format === 'pdf') {
                var px = Core.formatPixels(confF.format_page, confF.orientation, Math.min(confF.dpi, 150));
                largeur = Math.min(px.largeur, 1200); hauteur = Math.round(largeur * (px.hauteur / px.largeur));
            } else {
                largeur = 960; hauteur = 540;
            }
            confF.mmLarg = confF.format === 'pdf' ? largeur * MM_POUCE / Math.min(confF.dpi, 150) : largeur * MM_POUCE / 150;
            confF.bearing = map.getBearing() || 0;
            confF.legendeItems = donneesLegende();
            var mmPx = largeur / Math.max(confF.mmLarg, 1);
            var margePx = margeMm(confF) * mmPx;
            var legWpx = (confF.elements.legende && confF.legendeItems && confF.legendeItems.length)
                ? Math.min(60 * mmPx, largeur * 0.32) : 0;
            var carteY = Math.round(22 * mmPx) + 2 * mmPx;
            var carteW = largeur - 2 * margePx - legWpx - (legWpx ? 6 * mmPx : 0);
            var carteH = hauteur - carteY - Math.round(15 * mmPx) - margePx;
            var capW = Math.min(carteW, 1600), capH = Math.min(carteH, 1200);
            capturerCarte(Math.round(capW), Math.round(capH), confF.zone === 'toutes')
                .then(function (res) {
                    var mParDoc = res.metres > 0 ? carteW / res.metres : 0;
                    confF.barre = Core.calculerEchelleBarre(mParDoc, 160);
                    confF.echelleTexte = echelleTexte(mParDoc, mmPx);
                    return composerPage(confF, largeur, hauteur, res.url);
                })
                .then(function (cv) {
                    var apercu = document.getElementById('export-apercu-zone');
                    apercu.style.display = 'block';
                    apercu.innerHTML = '';
                    var img = document.createElement('img');
                    img.src = cv.toDataURL('image/jpeg', 0.8);
                    img.style.maxWidth = '100%';
                    apercu.appendChild(img);
                });
        });
    }

    function actualiserApercuAuto() {
        var apercu = document.getElementById('export-apercu-zone');
        if (apercu && apercu.style.display === 'block' && apercu.querySelector('img')) genererApercu();
    }

    function toast(msg, type) {
        if (window.toast) { window.toast(msg, type); return; }
        console.log(msg);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
