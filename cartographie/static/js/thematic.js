/* MUKMAP — Cartographie thématique.
 * Filtres par thème (sources, villages, bornes-fontaines, réservoirs,
 * conduites, points GPS, repères, relief, pente des conduites,
 * ouvrages existants / proposés), personnalisation des styles
 * (symbole, taille, couleur, étiquette, transparence) et légende
 * automatique.
 *
 * S'appuie sur :
 *  - le module Adduction : couche 'mw-ouv-p' (ouvrages), couches
 *    'mw-tr-<id>' (conduites) et 'mw-vg-<id>' (polygones de villages) ;
 *  - les couches Points de la carte : 'points' / 'points-icones' ;
 *  - le sélecteur de fonds (BasemapSelectorCore.appliquer) pour le relief ;
 *  - OutilsTopo (SRTM OpenTopoData) pour la pente des conduites.
 *
 * Core exposé sous globalThis.ThematicCore : testable en Node.
 */
(function (global) {
    'use strict';

    // ── Constantes partagées ────────────────────────────────────
    var TYPES_POINTS = ['source', 'village', 'borne', 'reservoir', 'repere'];
    var GROUPES_TYPES = {
        source: ['source', 'captage'],
        village: ['village'],
        borne: ['borne', 'consommation'],
        reservoir: ['reservoir'],
        repere: ['repere']
    };
    var STATUTS_EXISTANTS = ['actif', 'moyen', 'defectueux', 'hors_service'];
    var STATUT_PROJET = 'projet';
    var CLES_FILTRES = ['source', 'village', 'borne', 'reservoir', 'repere', 'conduite', 'point_gps', 'relief', 'pente', 'existant', 'propose'];
    var CLES_OUVRAGES = ['source', 'village', 'borne', 'reservoir', 'repere', 'existant', 'propose'];

    var DEFAUTS_STYLE = {
        source:    { couleur: '#22d3ee', taille: 9,  opacite: 100, symbole: 'rond', etiquette: false },
        village:   { couleur: '#f59e0b', taille: 8,  opacite: 100, symbole: 'rond', etiquette: false },
        borne:     { couleur: '#22c55e', taille: 7,  opacite: 100, symbole: 'rond', etiquette: false },
        reservoir: { couleur: '#3b82f6', taille: 9,  opacite: 100, symbole: 'rond', etiquette: false },
        repere:    { couleur: '#a855f7', taille: 7,  opacite: 100, symbole: 'rond', etiquette: false },
        conduite:  { couleur: '#0ea5e9', taille: 3,  opacite: 100, symbole: 'rond', etiquette: false },
        point_gps: { couleur: '',        taille: 7,  opacite: 90,  symbole: 'rond', etiquette: false },
        existant:  { couleur: '',        taille: 0,  opacite: 100, symbole: 'rond', etiquette: false },
        propose:   { couleur: '',        taille: 0,  opacite: 100, symbole: 'rond', etiquette: false }
    };

    var EMOJI_THEMES = { source: '💧', village: '🏘️', borne: '🚰', reservoir: '🛢️', repere: '🧭' };
    var EMOJIS = { eau: '💧', tuyau: '🚰', reservoir: '🛢️', pin: '📍', village: '🏘️' };

    function etatInitial() {
        return {
            filtres: { source: false, village: false, borne: false, reservoir: false, repere: false, conduite: false, point_gps: false, relief: false, pente: false, existant: false, propose: false },
            styles: JSON.parse(JSON.stringify(DEFAUTS_STYLE))
        };
    }

    // Vrai dès qu'au moins un filtre d'ouvrage (type ou état) est actif.
    function ouvrageActif(filtres) {
        return CLES_OUVRAGES.some(function (k) { return !!filtres[k]; });
    }

    // Expression de filtre MapLibre pour la couche 'mw-ouv-p'.
    function construireFiltreOuvrages(filtres) {
        var typesActifs = [];
        CLES_OUVRAGES.forEach(function (k) {
            if (filtres[k] && GROUPES_TYPES[k]) typesActifs = typesActifs.concat(GROUPES_TYPES[k]);
        });
        // Tous les groupes de types cochés → aucun filtre de type
        // (les autres types : reseau, ouvrage, intermediaire…).
        var tousGroupes = TYPES_POINTS.every(function (t) { return filtres[t]; });
        var types = (!tousGroupes && typesActifs.length) ? ['in', ['get', 'type'], ['literal', typesActifs]] : null;
        var statuts = null;
        if (filtres.existant && !filtres.propose) statuts = ['in', ['get', 'statut'], ['literal', STATUTS_EXISTANTS]];
        else if (filtres.propose && !filtres.existant) statuts = ['==', ['get', 'statut'], STATUT_PROJET];
        var parties = [];
        if (types) parties.push(types);
        if (statuts) parties.push(statuts);
        return parties.length ? ['all'].concat(parties) : null;
    }

    function branchesStatut(styles) {
        var branches = [];
        ['existant', 'propose'].forEach(function (k) {
            var s = styles[k];
            if (s.couleur || s.taille || s.opacite) {
                branches.push({
                    cond: k === 'propose'
                        ? ['==', ['get', 'statut'], STATUT_PROJET]
                        : ['in', ['get', 'statut'], ['literal', STATUTS_EXISTANTS]],
                    key: k
                });
            }
        });
        return branches;
    }

    // Couleur des ouvrages : styles « existant / proposé » prioritaires,
    // sinon couleur par type (avec défauts).
    function expressionCouleur(styles) {
        var branche = [];
        branchesStatut(styles).forEach(function (b) {
            if (styles[b.key].couleur) branche.push(b.cond, styles[b.key].couleur);
        });
        var parType = ['match', ['get', 'type']];
        TYPES_POINTS.forEach(function (t) { parType.push(t, styles[t].couleur || DEFAUTS_STYLE[t].couleur); });
        parType.push('#94a3b8');
        return branche.length ? ['case'].concat(branche, [parType]) : parType;
    }

    function expressionTaille(styles) {
        var branche = [];
        branchesStatut(styles).forEach(function (b) {
            if (styles[b.key].taille) branche.push(b.cond, styles[b.key].taille);
        });
        var parType = ['match', ['get', 'type']];
        TYPES_POINTS.forEach(function (t) { parType.push(t, styles[t].taille || DEFAUTS_STYLE[t].taille); });
        parType.push(6);
        return branche.length ? ['case'].concat(branche, [parType]) : parType;
    }

    function expressionOpacite(styles) {
        var branche = [];
        branchesStatut(styles).forEach(function (b) {
            var v = styles[b.key].opacite;
            if (v && v !== 100) branche.push(b.cond, v / 100);
        });
        var parType = ['match', ['get', 'type']];
        TYPES_POINTS.forEach(function (t) { parType.push(t, (styles[t].opacite || 100) / 100); });
        parType.push(1);
        return branche.length ? ['case'].concat(branche, [parType]) : parType;
    }

    // Id d'image de symbole générée (voir garantirImage côté navigateur).
    function imageId(cle, symbole, couleur) {
        return 'th-' + cle + '-' + symbole + '-' + (couleur || 'none').replace('#', '');
    }

    // icon-image par type : '' = pas d'icône (cercle), sinon id d'image.
    function expressionIcone(styles) {
        var parType = ['match', ['get', 'type']];
        TYPES_POINTS.forEach(function (t) {
            var s = styles[t].symbole;
            parType.push(t, (s && s !== 'rond') ? imageId(t, s, styles[t].couleur || DEFAUTS_STYLE[t].couleur) : '');
        });
        parType.push('');
        return parType;
    }

    function expressionTailleIcone(styles) {
        var parType = ['match', ['get', 'type']];
        TYPES_POINTS.forEach(function (t) {
            parType.push(t, (styles[t].taille || DEFAUTS_STYLE[t].taille) / 22);
        });
        parType.push(7 / 22);
        return parType;
    }

    // Comptes par thème (légende).
    function compter(ouvrages, filtres) {
        var comptes = { source: 0, village: 0, borne: 0, reservoir: 0, repere: 0, existant: 0, propose: 0 };
        (ouvrages || []).forEach(function (o) {
            TYPES_POINTS.forEach(function (t) {
                if (filtres[t] && GROUPES_TYPES[t].indexOf(o.type) !== -1) comptes[t]++;
            });
            if (filtres.existant && STATUTS_EXISTANTS.indexOf(o.statut) !== -1) comptes.existant++;
            if (filtres.propose && o.statut === STATUT_PROJET) comptes.propose++;
        });
        return comptes;
    }

    // Distance haversine (mètres), identique à OutilsTopo.
    function haversine(a, b) {
        var f1 = Number(a.lat) * Math.PI / 180;
        var f2 = Number(b.lat) * Math.PI / 180;
        var df = (Number(b.lat) - Number(a.lat)) * Math.PI / 180;
        var dl = (Number(b.lng) - Number(a.lng)) * Math.PI / 180;
        var s = Math.sin(df / 2) * Math.sin(df / 2) +
            Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) * Math.sin(dl / 2);
        return 2 * 6371008.8 * Math.asin(Math.sqrt(s));
    }

    function longueurTrace(trace) {
        if (trace && trace.longueur_m) return Number(trace.longueur_m) || 0;
        var c = Array.isArray(trace) ? trace : ((trace && trace.coordonnees) || []);
        var tot = 0;
        for (var i = 1; i < c.length; i++) {
            tot += haversine({ lat: Number(c[i - 1][1]), lng: Number(c[i - 1][0]) }, { lat: Number(c[i][1]), lng: Number(c[i][0]) });
        }
        return Math.round(tot);
    }

    // Découpe un tracé échantillonné en segments avec pente (%) par segment.
    function segmenterPentes(pts, alts) {
        var segs = [];
        for (var i = 0; i + 1 < pts.length; i++) {
            var a = alts[i], b = alts[i + 1];
            if (a === null || a === undefined || b === null || b === undefined) continue;
            var d = haversine(pts[i], pts[i + 1]);
            if (d <= 0) continue;
            segs.push({
                coordinates: [[pts[i].lng, pts[i].lat], [pts[i + 1].lng, pts[i + 1].lat]],
                pente: Math.round(((b - a) / d) * 1000) / 10
            });
        }
        return segs;
    }

    // Légende automatique (HTML). donnees = {ouvrages, traces, nbPoints, longueurConduites}.
    function construireLegende(etat, donnees, opts) {
        var t = opts.trad || function (cle, defaut) { return defaut !== undefined ? defaut : cle; };
        var f = etat.filtres, st = etat.styles;
        var comptes = compter(donnees.ouvrages || [], f);
        var html = [];
        var aucun = true;
        var cleLabel = { source: 'thema_sources', village: 'thema_villages', borne: 'thema_bornes', reservoir: 'thema_reservoirs', repere: 'thema_reperes' };
        var leg = function (swatch, lib, compte) {
            aucun = false;
            html.push('<div class="th-leg-item">' + swatch + '<span class="th-leg-lib">' + lib + '</span>' +
                (compte !== '' && compte !== null && compte !== undefined ? '<span class="th-leg-n">' + compte + '</span>' : '') +
                '</div>');
        };
        TYPES_POINTS.forEach(function (k) {
            if (!f[k]) return;
            var couleur = st[k].couleur || DEFAUTS_STYLE[k].couleur;
            var emoji = (st[k].symbole && EMOJIS[st[k].symbole]) || EMOJI_THEMES[k] || '';
            leg('<span class="th-leg-symb" style="background:' + couleur + '">' + emoji + '</span>',
                t(cleLabel[k], k), comptes[k]);
        });
        if (f.existant) {
            leg('<span class="th-leg-symb" style="background:' + (st.existant.couleur || '#16a34a') + '"></span>',
                t('thema_existants', 'Ouvrages existants'), comptes.existant);
        }
        if (f.propose) {
            leg('<span class="th-leg-symb" style="background:' + (st.propose.couleur || '#6366f1') + '"></span>',
                t('thema_proposes', 'Ouvrages proposés'), comptes.propose);
        }
        if (f.conduite || f.pente) {
            var n = (donnees.traces || []).length;
            var km = ((donnees.longueurConduites || 0) / 1000).toFixed(1);
            leg('<span class="th-leg-line" style="background:' + (st.conduite.couleur || DEFAUTS_STYLE.conduite.couleur) + '"></span>',
                t('thema_conduites', 'Conduites') + ' · ' + km + ' km', n);
        }
        if (f.point_gps) {
            leg('<span class="th-leg-symb" style="background:' + (st.point_gps.couleur || '#ef4444') + '"></span>',
                t('thema_points_gps', 'Points GPS'), donnees.nbPoints || 0);
        }
        if (f.relief) {
            leg('<span class="th-leg-relief"></span>', t('thema_relief_leg', 'Relief (hillshade)'), '');
        }
        if (f.pente) {
            var stPente = (opts && opts.penteEtat) || { statut: 'vide' };
            if (stPente.statut === 'chargement') {
                html.push('<div class="th-leg-pente"><span class="th-leg-msg">' + t('thema_chargement_pente', 'Calcul des pentes…') + '</span></div>');
            } else if (stPente.statut === 'erreur') {
                html.push('<div class="th-leg-pente"><span class="th-leg-msg">' + t('thema_pente_erreur', 'Pentes indisponibles (connexion requise).') + '</span></div>');
            } else {
                aucun = false;
                html.push('<div class="th-leg-pente"><div class="th-leg-grad"></div>' +
                    '<div class="th-leg-grad-lib"><span>0 %</span><span>' + t('thema_leg_moyenne', 'Pente moyenne') + '</span><span>8 %</span></div>' +
                    '<div class="th-leg-grad-note">' + t('thema_leg_faible', 'Pente douce') + ' · ' + t('thema_leg_moyenne', 'Moyenne') + ' · ' + t('thema_leg_forte', 'Forte') + '</div></div>');
            }
        }
        if (aucun) html.push('<div class="th-leg-vide">' + t('thema_aucun', 'Aucun thème actif') + '</div>');
        return html.join('');
    }

    // ── Cœur testable ───────────────────────────────────────────
    global.ThematicCore = {
        TYPES_POINTS: TYPES_POINTS,
        GROUPES_TYPES: GROUPES_TYPES,
        STATUTS_EXISTANTS: STATUTS_EXISTANTS.slice(),
        STATUT_PROJET: STATUT_PROJET,
        CLES_FILTRES: CLES_FILTRES.slice(),
        DEFAUTS_STYLE: DEFAUTS_STYLE,
        EMOJI_THEMES: EMOJI_THEMES,
        EMOJIS: EMOJIS,
        etatInitial: etatInitial,
        ouvrageActif: ouvrageActif,
        construireFiltreOuvrages: construireFiltreOuvrages,
        expressionCouleur: expressionCouleur,
        expressionTaille: expressionTaille,
        expressionOpacite: expressionOpacite,
        expressionIcone: expressionIcone,
        expressionTailleIcone: expressionTailleIcone,
        compter: compter,
        haversine: haversine,
        longueurTrace: longueurTrace,
        segmenterPentes: segmenterPentes,
        construireLegende: construireLegende
    };

    if (typeof document === 'undefined') return;

    // ── Interface navigateur ────────────────────────────────────
    var carte = null;
    var etat = etatInitial();
    var donnees = { ouvrages: [], traces: [], longueurConduites: 0 };
    var sauveOuvrages = null;
    var sauvePoints = null;
    var penteEtat = { statut: 'vide' };
    var cachePentes = {};
    var fondSauve = null;
    var ELEMENTS_STYLE = [
        { id: 'source', emoji: '💧', cle: 'thema_sources' },
        { id: 'village', emoji: '🏘️', cle: 'thema_villages' },
        { id: 'borne', emoji: '🚰', cle: 'thema_bornes' },
        { id: 'reservoir', emoji: '🛢️', cle: 'thema_reservoirs' },
        { id: 'repere', emoji: '🧭', cle: 'thema_reperes' },
        { id: 'conduite', emoji: '〰️', cle: 'thema_conduites' },
        { id: 'point_gps', emoji: '📍', cle: 'thema_points_gps' },
        { id: 'existant', emoji: '✅', cle: 'thema_existants' },
        { id: 'propose', emoji: '🟣', cle: 'thema_proposes' }
    ];
    var SYMBOLES = [
        { id: 'rond', emoji: '' },
        { id: 'carre', emoji: '' },
        { id: 'losange', emoji: '' },
        { id: 'triangle', emoji: '' },
        { id: 'etoile', emoji: '' },
        { id: 'eau', emoji: '💧' },
        { id: 'tuyau', emoji: '🚰' },
        { id: 'reservoir', emoji: '🛢️' },
        { id: 'pin', emoji: '📍' },
        { id: 'village', emoji: '🏘️' }
    ];
    var TEXTE_ETIQUETTE = ['case',
        ['all', ['has', 'code'], ['!=', ['get', 'code'], '']],
        ['concat', ['get', 'code'], ' · ', ['get', 'nom']],
        ['get', 'nom']
    ];

    function trad(cle, defaut) {
        if (global.mukmapT) {
            var v = global.mukmapT(cle);
            if (v) return v;
        }
        return defaut !== undefined ? defaut : cle;
    }

    function carteGlobale() {
        // Attention : le <div id="map"> expose `map` comme variable globale (acces
        // nomme) avant que la carte MapLibre soit creee. On n'accepte qu'un objet
        // ayant une methode `loaded`.
        var candidats = [];
        try { candidats.push(global.map); } catch (e) {}
        try { if (typeof map !== 'undefined') candidats.push(map); } catch (e) {}
        for (var i = 0; i < candidats.length; i++) {
            var c = candidats[i];
            if (c && typeof c.loaded === 'function') return c;
        }
        return null;
    }

    function injecterCSS() {
        if (document.getElementById('thema-css')) return;
        var st = document.createElement('style');
        st.id = 'thema-css';
        st.textContent =
            '#panel-thema { display: grid; gap: 7px; }' +
            '#panel-thema .thema-group { font-size: .7rem; font-weight: 800; text-transform: uppercase; letter-spacing: .6px; color: var(--text-3); margin-top: 6px; }' +
            '#panel-thema select, #panel-thema input[type="color"], #panel-thema input[type="range"] { width: 100%; }' +
            '#panel-thema input[type="color"] { height: 30px; padding: 2px; cursor: pointer; }' +
            '#panel-thema .thema-f { display: flex; align-items: center; gap: 8px; font-size: .78rem; padding: 3px 0; cursor: pointer; }' +
            '#panel-thema .thema-f input { width: 15px; height: 15px; accent-color: var(--accent); flex: none; cursor: pointer; }' +
            '#panel-thema .thema-grid { display: grid; grid-template-columns: 92px 1fr; align-items: center; gap: 6px; }' +
            '#panel-thema .thema-lbl { font-size: .7rem; color: var(--text-2); font-weight: 600; }' +
            '#panel-thema input[type="range"] { accent-color: var(--accent); }' +
            '.mukmap-thema { position: fixed; left: 20px; top: 164px; z-index: 1150; width: 300px; max-height: 80vh; border-radius: 12px; ' +
            'border: 1px solid var(--border, #3d4060); background: color-mix(in srgb, var(--bg-1, #1a1b2e) 96%, transparent); ' +
            'backdrop-filter: blur(10px); box-shadow: 0 10px 30px rgba(0,0,0,.35); overflow: hidden; display: flex; flex-direction: column; }' +
            '.mukmap-thema .th-tete { padding: 10px 14px; font-weight: 800; font-size: .85rem; display: flex; justify-content: space-between; ' +
            'align-items: center; background: rgba(124,58,237,.14); border-bottom: 1px solid var(--border, #3d4060); color: #a78bfa; }' +
            '.mukmap-thema .th-fermer { border: 0; background: transparent; color: var(--text-2, #a0a3c2); cursor: pointer; font-size: .9rem; }' +
            '.mukmap-thema .th-corps { padding: 8px 12px 12px; overflow: auto; }' +
            '.mukmap-thema .th-bouton { width: 100%; padding: 7px; border-radius: 8px; margin-top: 8px; border: 1px solid var(--border, #3d4060); ' +
            'background: rgba(255,255,255,.05); color: var(--text-2, #a0a3c2); font-size: .73rem; font-weight: 700; cursor: pointer; }' +
            '.mukmap-thema .th-bouton:hover { border-color: #a78bfa; color: #a78bfa; }' +
            '.th-leg-item { display: flex; align-items: center; gap: 8px; font-size: .75rem; padding: 3px 0; }' +
            '.th-leg-symb { width: 12px; height: 12px; border-radius: 50%; flex: none; display: flex; align-items: center; justify-content: center; font-size: 9px; line-height: 1; box-shadow: inset 0 0 0 1px rgba(0,0,0,.15); }' +
            '.th-leg-line { width: 22px; height: 3px; border-radius: 2px; flex: none; }' +
            '.th-leg-relief { width: 22px; height: 12px; border-radius: 3px; flex: none; background: linear-gradient(135deg, #e2e8f0, #64748b); box-shadow: inset 0 0 0 1px rgba(0,0,0,.12); }' +
            '.th-leg-lib { flex: 1; color: var(--text-2); }' +
            '.th-leg-n { font-weight: 700; color: var(--text); font-size: .72rem; }' +
            '.th-leg-vide { font-size: .72rem; color: var(--text-3); font-style: italic; padding: 4px 0; }' +
            '.th-leg-pente { padding: 4px 0 2px; }' +
            '.th-leg-grad { height: 10px; border-radius: 5px; background: linear-gradient(90deg, #22c55e, #eab308 50%, #ef4444); box-shadow: inset 0 0 0 1px rgba(0,0,0,.15); }' +
            '.th-leg-grad-lib { display: flex; justify-content: space-between; font-size: .62rem; color: var(--text-3); margin-top: 2px; }' +
            '.th-leg-grad-note { font-size: .66rem; color: var(--text-3); margin-top: 2px; }' +
            '.th-leg-msg { font-size: .7rem; color: var(--text-3); font-style: italic; }';
        document.head.appendChild(st);
    }

    function layerAssure(id, spec) {
        if (carte.getLayer(id)) return;
        carte.addLayer(spec);
    }

    function retirerCouche(id) {
        if (carte.getLayer(id)) carte.removeLayer(id);
    }

    function dessinerSymbole(canvas, symbole, couleur) {
        var ctx = canvas.getContext('2d');
        var t = canvas.width, m = t / 2, r = t * 0.42;
        ctx.clearRect(0, 0, t, t);
        if (EMOJIS[symbole]) {
            ctx.font = (t * 0.66) + 'px "Segoe UI Emoji","Noto Color Emoji","Apple Color Emoji",serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(EMOJIS[symbole], m, m + t * 0.03);
            return;
        }
        ctx.beginPath();
        if (symbole === 'carre') {
            ctx.rect(m - r, m - r, r * 2, r * 2);
        } else if (symbole === 'losange') {
            ctx.moveTo(m, m - r); ctx.lineTo(m + r, m); ctx.lineTo(m, m + r); ctx.lineTo(m - r, m); ctx.closePath();
        } else if (symbole === 'triangle') {
            ctx.moveTo(m, m - r); ctx.lineTo(m + r * 0.9, m + r * 0.75); ctx.lineTo(m - r * 0.9, m + r * 0.75); ctx.closePath();
        } else if (symbole === 'etoile') {
            var n = 5, a0 = -Math.PI / 2;
            ctx.moveTo(m + r * Math.cos(a0), m + r * Math.sin(a0));
            for (var i = 1; i < n * 2; i++) {
                var ang = a0 + i * Math.PI / n;
                var ray = (i % 2 === 0) ? r : r * 0.45;
                ctx.lineTo(m + ray * Math.cos(ang), m + ray * Math.sin(ang));
            }
            ctx.closePath();
        } else {
            ctx.arc(m, m, r, 0, Math.PI * 2);
        }
        ctx.fillStyle = couleur || '#6d5df6';
        ctx.fill();
        ctx.lineWidth = Math.max(2, t * 0.09);
        ctx.strokeStyle = 'rgba(255,255,255,.95)';
        ctx.stroke();
    }

    function garantirImage(cle, symbole, couleur) {
        var id = imageId(cle, symbole, couleur);
        if (carte.hasImage(id)) return id;
        var cv = document.createElement('canvas');
        cv.width = cv.height = 22;
        dessinerSymbole(cv, symbole, couleur);
        carte.addImage(id, cv.getContext('2d').getImageData(0, 0, 22, 22));
        return id;
    }

    function construireIcones(styles) {
        var n = 0;
        TYPES_POINTS.forEach(function (t) {
            var s = styles[t].symbole;
            if (!s || s === 'rond') return;
            garantirImage(t, s, styles[t].couleur || DEFAUTS_STYLE[t].couleur);
            n++;
        });
        return n > 0;
    }

    function signatureTrace(tr) {
        var c = (tr && tr.coordonnees) || [];
        if (!c.length) return '';
        return c.length + ':' + c[0].join(',') + ':' + c[c.length - 1].join(',');
    }

    // ── Lecture des données (si l'événement initial a été manqué) ──
    function lireDonnees() {
        var ouv = [], tra = [];
        try {
            if (carte.getSource && carte.getSource('mw-ouv-p')) {
                carte.querySourceFeatures('mw-ouv-p').forEach(function (f) {
                    if (f.properties) ouv.push(f.properties);
                });
            }
        } catch (e) {}
        try {
            (carte.getStyle().layers || []).forEach(function (l) {
                if (l.id.indexOf('mw-tr-') !== 0) return;
                carte.querySourceFeatures(l.source).forEach(function (f) {
                    var g = f.geometry;
                    var props = f.properties || {};
                    tra.push({
                        id: l.id.replace('mw-tr-', ''),
                        nom: props.nom || '',
                        coordonnees: g && g.type === 'LineString' ? g.coordinates : []
                    });
                });
            });
        } catch (e) {}
        if (ouv.length) donnees.ouvrages = ouv;
        if (tra.length) donnees.traces = tra;
        donnees.longueurConduites = (donnees.traces || []).reduce(function (s, t) { return s + longueurTrace(t); }, 0);
    }

    function majDonnees(detail) {
        if (detail && Array.isArray(detail.ouvrages)) donnees.ouvrages = detail.ouvrages;
        if (detail && Array.isArray(detail.traces)) donnees.traces = detail.traces;
        donnees.longueurConduites = (donnees.traces || []).reduce(function (s, t) { return s + longueurTrace(t); }, 0);
        // invalidation du cache pente si un tracé a changé
        var sigs = {};
        (donnees.traces || []).forEach(function (tr) { sigs[tr.id] = signatureTrace(tr); });
        Object.keys(cachePentes).forEach(function (id) {
            if (sigs[id] !== undefined && cachePentes[id].sig !== sigs[id]) delete cachePentes[id];
        });
    }

    // ── Ouvrages (couche 'mw-ouv-p') ────────────────────────────
    // Caractéristiques complètes reçues via l'événement 'mukmap:eau-maj' :
    // source la plus fiable pour la source miroir (aucune limite de viewport).
    function featuresOuvrages() {
        var ouv = donnees.ouvrages || [];
        if (ouv.length) {
            var feats = [];
            ouv.forEach(function (o) {
                if (!o || o.longitude === undefined || o.latitude === undefined) return;
                feats.push({
                    type: 'Feature',
                    properties: { id: o.id, nom: o.nom || '', code: o.code || '', type: o.type || '', statut: o.statut || '' },
                    geometry: { type: 'Point', coordinates: [Number(o.longitude), Number(o.latitude)] }
                });
            });
            return feats;
        }
        try {
            return carte.querySourceFeatures('mw-ouv-p');
        } catch (e) {
            return [];
        }
    }

    function rafraichirMiroir() {
        if (!carte || !carte.getSource('th-ouv')) return;
        if (donnees.ouvrages && donnees.ouvrages.length) return; // mode événement : rien à rafraîchir
        try {
            carte.getSource('th-ouv').setData({ type: 'FeatureCollection', features: carte.querySourceFeatures('mw-ouv-p') });
        } catch (e) {}
    }

    function majOuvrages() {
        if (!carte.getLayer('mw-ouv-p')) return;
        var actif = ouvrageActif(etat.filtres);
        if (!actif) {
            if (sauveOuvrages) {
                carte.setPaintProperty('mw-ouv-p', 'circle-color', sauveOuvrages.couleur);
                carte.setPaintProperty('mw-ouv-p', 'circle-radius', sauveOuvrages.rayon);
                carte.setPaintProperty('mw-ouv-p', 'circle-opacity', sauveOuvrages.opacite);
            }
            carte.setFilter('mw-ouv-p', null);
            retirerCouche('th-ouv-icones');
            retirerCouche('th-ouv-labels');
            restaurerPolygones();
            return;
        }
        if (!sauveOuvrages) {
            sauveOuvrages = {
                couleur: carte.getPaintProperty('mw-ouv-p', 'circle-color'),
                rayon: carte.getPaintProperty('mw-ouv-p', 'circle-radius'),
                opacite: carte.getPaintProperty('mw-ouv-p', 'circle-opacity')
            };
        }
        var filtre = construireFiltreOuvrages(etat.filtres);
        carte.setFilter('mw-ouv-p', filtre);
        carte.setPaintProperty('mw-ouv-p', 'circle-color', expressionCouleur(etat.styles));
        carte.setPaintProperty('mw-ouv-p', 'circle-radius', expressionTaille(etat.styles));
        carte.setPaintProperty('mw-ouv-p', 'circle-opacity', expressionOpacite(etat.styles));

        // Icônes de symbole (source miroir : jamais de dépendance sur 'mw-ouv-p',
        // le module Adduction recrée cette source à chaque mise à jour).
        if (!carte.getSource('th-ouv')) {
            carte.addSource('th-ouv', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        }
        try {
            carte.getSource('th-ouv').setData({ type: 'FeatureCollection', features: featuresOuvrages() });
        } catch (e) {}
        var avecIcones = construireIcones(etat.styles);
        if (avecIcones) {
            layerAssure('th-ouv-icones', {
                id: 'th-ouv-icones', type: 'symbol', source: 'th-ouv',
                filter: filtre || ['!=', ['get', 'type'], ''],
                layout: { 'icon-image': expressionIcone(etat.styles), 'icon-size': expressionTailleIcone(etat.styles), 'icon-allow-overlap': true }
            });
            carte.setLayoutProperty('th-ouv-icones', 'visibility', 'visible');
        } else {
            retirerCouche('th-ouv-icones');
        }

        var etiquette = CLES_OUVRAGES.some(function (k) { return etat.styles[k].etiquette; });
        if (etiquette) {
            layerAssure('th-ouv-labels', {
                id: 'th-ouv-labels', type: 'symbol', source: 'th-ouv',
                filter: filtre || ['!=', ['get', 'type'], ''],
                layout: { 'text-field': TEXTE_ETIQUETTE, 'text-size': 10, 'text-offset': [0, -1.4], 'text-anchor': 'bottom' },
                paint: { 'text-color': expressionCouleur(etat.styles), 'text-halo-color': '#ffffff', 'text-halo-width': 1.2 }
            });
            carte.setLayoutProperty('th-ouv-labels', 'visibility', 'visible');
        } else {
            retirerCouche('th-ouv-labels');
        }
        majPolygones();
    }

    // ── Polygones de villages (couches 'mw-vg-<id>') ────────────
    function couchesVillages() {
        return (carte.getStyle().layers || []).filter(function (l) { return l.id.indexOf('mw-vg-') === 0; });
    }

    function majPolygones() {
        var visibles = etat.filtres.village || etat.filtres.existant || etat.filtres.propose;
        var couleur = etat.styles.village.couleur || DEFAUTS_STYLE.village.couleur;
        couchesVillages().forEach(function (l) {
            carte.setLayoutProperty(l.id, 'visibility', visibles ? 'visible' : 'none');
            if (!visibles) return;
            carte.setPaintProperty(l.id, 'line-color', couleur);
            carte.setPaintProperty(l.id, 'line-width', 2);
            var fill = l.id + '-fill';
            if (carte.getLayer(fill)) {
                carte.setLayoutProperty(fill, 'visibility', 'visible');
                carte.setPaintProperty(fill, 'fill-color', couleur);
                carte.setPaintProperty(fill, 'fill-opacity', 0.3);
            }
        });
    }

    function restaurerPolygones() {
        couchesVillages().forEach(function (l) {
            carte.setLayoutProperty(l.id, 'visibility', 'visible');
            carte.setPaintProperty(l.id, 'line-color', '#f59e0b');
            carte.setPaintProperty(l.id, 'line-width', 2);
            var fill = l.id + '-fill';
            if (carte.getLayer(fill)) {
                carte.setLayoutProperty(fill, 'visibility', 'visible');
                carte.setPaintProperty(fill, 'fill-color', '#f59e0b');
                carte.setPaintProperty(fill, 'fill-opacity', 0.25);
            }
        });
    }

    // ── Conduites (couches 'mw-tr-<id>' → couche unifiée) ───────
    function majTraces() {
        var actif = etat.filtres.conduite || etat.filtres.pente;
        if (!actif) {
            restaurerTraces();
            return;
        }
        (carte.getStyle().layers || []).forEach(function (l) {
            if (l.id.indexOf('mw-tr-') === 0) carte.setLayoutProperty(l.id, 'visibility', 'none');
        });
        if (!carte.getSource('th-traces')) {
            carte.addSource('th-traces', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        }
        var feats = [];
        (donnees.traces || []).forEach(function (tr) {
            var c = (tr && tr.coordonnees) || [];
            if (c.length < 2) return;
            feats.push({
                type: 'Feature',
                properties: { id: tr.id, nom: tr.nom || (tr.id != null ? 'Tracé #' + tr.id : ''), longueur_m: longueurTrace(tr) },
                geometry: { type: 'LineString', coordinates: c.map(function (p) { return [p[0], p[1]]; }) }
            });
        });
        carte.getSource('th-traces').setData({ type: 'FeatureCollection', features: feats });

        var st = etat.styles.conduite;
        var couleur = st.couleur || DEFAUTS_STYLE.conduite.couleur;
        var largeur = Math.max(1.5, st.taille || 3);
        var opacite = (st.opacite || 100) / 100;

        if (etat.filtres.pente) {
            retirerCouche('th-conduites');
        } else {
            layerAssure('th-conduites', {
                id: 'th-conduites', type: 'line', source: 'th-traces',
                layout: { 'line-cap': 'round', 'line-join': 'round' },
                paint: { 'line-color': couleur, 'line-width': largeur, 'line-opacity': opacite }
            });
            carte.setLayoutProperty('th-conduites', 'visibility', 'visible');
        }
        majPentes();

        if (st.etiquette) {
            layerAssure('th-conduites-labels', {
                id: 'th-conduites-labels', type: 'symbol', source: 'th-traces',
                layout: { 'text-field': ['get', 'nom'], 'text-size': 10, 'text-offset': [0, -0.8] },
                paint: { 'text-color': couleur, 'text-halo-color': '#ffffff', 'text-halo-width': 1.2 }
            });
            carte.setLayoutProperty('th-conduites-labels', 'visibility', 'visible');
        } else {
            retirerCouche('th-conduites-labels');
        }
    }

    function restaurerTraces() {
        (carte.getStyle().layers || []).forEach(function (l) {
            if (l.id.indexOf('mw-tr-') === 0) carte.setLayoutProperty(l.id, 'visibility', 'visible');
        });
        retirerCouche('th-conduites');
        retirerCouche('th-conduites-labels');
        retirerCouche('th-pentes');
        if (carte.getSource('th-pentes')) carte.getSource('th-pentes').setData({ type: 'FeatureCollection', features: [] });
    }

    // ── Pente des conduites (SRTM) ──────────────────────────────
    function majPentes() {
        var actif = etat.filtres.pente;
        if (!carte.getSource('th-pentes')) {
            if (!actif) return;
            carte.addSource('th-pentes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            layerAssure('th-pentes', {
                id: 'th-pentes', type: 'line', source: 'th-pentes',
                layout: { 'line-cap': 'round', 'line-join': 'round' },
                paint: {
                    'line-color': ['interpolate', ['linear'], ['get', 'pente'],
                        0, '#22c55e', 4, '#eab308', 8, '#ef4444'],
                    'line-width': Math.max(2.5, (etat.styles.conduite.taille || 3) + 1),
                    'line-opacity': 0.95
                }
            });
        }
        if (!actif) {
            carte.setLayoutProperty('th-pentes', 'visibility', 'none');
            return;
        }
        carte.setLayoutProperty('th-pentes', 'visibility', 'visible');
        carte.setPaintProperty('th-pentes', 'line-width', Math.max(2.5, (etat.styles.conduite.taille || 3) + 1));
        chargerPentes();
    }

    function calculerPenteTrace(tr) {
        if (!global.OutilsTopo) return Promise.resolve(null);
        var c = (tr && tr.coordonnees) || [];
        if (c.length < 2) return Promise.resolve(null);
        var pts = c.map(function (p) { return { lat: Number(p[1]), lng: Number(p[0]) }; });
        var nb = Math.max(2, Math.min(global.OutilsTopo.MAX_ECHANTILLONS || 100, Math.round(longueurTrace(tr) / 100)));
        var echant = global.OutilsTopo.echantillonner(pts, nb);
        return fetch(global.OutilsTopo.URL_ELEVATION_PROFIL.replace('{locations}', global.OutilsTopo.construireLocations(echant)))
            .then(function (r) { return r.json(); })
            .then(function (data) {
                var alts = global.OutilsTopo.lireElevationsOpenTopoData(data);
                return segmenterPentes(echant, alts).map(function (s) {
                    return {
                        type: 'Feature',
                        properties: { pente: s.pente, trace: tr.id, trace_nom: tr.nom || '' },
                        geometry: { type: 'LineString', coordinates: s.coordinates }
                    };
                });
            })
            .catch(function () { return null; });
    }

    function chargerPentes() {
        var traces = (donnees.traces || []).filter(function (tr) {
            return tr && tr.coordonnees && tr.coordonnees.length >= 2;
        });
        if (!traces.length) {
            penteEtat = { statut: 'vide' };
            if (carte.getSource('th-pentes')) carte.getSource('th-pentes').setData({ type: 'FeatureCollection', features: [] });
            majLegende();
            return;
        }
        penteEtat = { statut: 'chargement' };
        majLegende();
        var feats = [];
        var i = 0;
        var enErreur = false;
        function prochaine() {
            if (i >= traces.length) {
                if (carte.getSource('th-pentes')) {
                    carte.getSource('th-pentes').setData({ type: 'FeatureCollection', features: feats });
                }
                penteEtat = { statut: enErreur ? 'erreur' : 'ok' };
                majLegende();
                return;
            }
            var tr = traces[i++];
            var cache = cachePentes[tr.id];
            if (cache && cache.sig === signatureTrace(tr)) {
                feats = feats.concat(cache.segs);
                prochaine();
                return;
            }
            calculerPenteTrace(tr).then(function (segs) {
                if (segs) {
                    cachePentes[tr.id] = { sig: signatureTrace(tr), segs: segs };
                    feats = feats.concat(segs);
                } else {
                    enErreur = true;
                }
                prochaine();
            });
        }
        prochaine();
    }

    // ── Points GPS (couches 'points' / 'points-icones') ─────────
    function majPointsGps() {
        if (!carte.getLayer('points')) return;
        var actif = etat.filtres.point_gps;
        if (!actif) {
            restaurerPoints();
            return;
        }
        if (!sauvePoints) {
            sauvePoints = {
                couleur: carte.getPaintProperty('points', 'circle-color'),
                rayon: carte.getPaintProperty('points', 'circle-radius'),
                opacite: carte.getPaintProperty('points', 'circle-opacity'),
                icone: carte.getLayer('points-icones') ? carte.getLayoutProperty('points-icones', 'icon-image') : null,
                tailleIcone: carte.getLayer('points-icones') ? carte.getLayoutProperty('points-icones', 'icon-size') : null
            };
        }
        var st = etat.styles.point_gps;
        if (st.couleur) carte.setPaintProperty('points', 'circle-color', st.couleur);
        carte.setPaintProperty('points', 'circle-radius', st.taille || 7);
        carte.setPaintProperty('points', 'circle-opacity', (st.opacite || 90) / 100);
        if (carte.getLayer('points-icones')) {
            var tailleIc = (st.taille || 7) / 22;
            if (st.symbole && st.symbole !== 'rond') {
                var idImg = garantirImage('gps', st.symbole, st.couleur || '#ef4444');
                carte.setLayoutProperty('points-icones', 'icon-image', idImg);
            } else if (sauvePoints && sauvePoints.icone !== null) {
                carte.setLayoutProperty('points-icones', 'icon-image', sauvePoints.icone);
            }
            carte.setLayoutProperty('points-icones', 'icon-size', tailleIc);
        }
        if (st.etiquette) {
            layerAssure('th-gps-labels', {
                id: 'th-gps-labels', type: 'symbol', source: 'points',
                filter: ['!', ['has', 'point_count']],
                layout: { 'text-field': ['get', 'nom'], 'text-size': 10, 'text-offset': [0, -1.4], 'text-anchor': 'bottom' },
                paint: { 'text-color': st.couleur || '#334155', 'text-halo-color': '#ffffff', 'text-halo-width': 1.2 }
            });
            carte.setLayoutProperty('th-gps-labels', 'visibility', 'visible');
        } else {
            retirerCouche('th-gps-labels');
        }
    }

    function restaurerPoints() {
        if (!carte.getLayer('points')) return;
        if (sauvePoints) {
            carte.setPaintProperty('points', 'circle-color', sauvePoints.couleur);
            carte.setPaintProperty('points', 'circle-radius', sauvePoints.rayon);
            carte.setPaintProperty('points', 'circle-opacity', sauvePoints.opacite);
            if (carte.getLayer('points-icones') && sauvePoints.icone !== null) {
                carte.setLayoutProperty('points-icones', 'icon-image', sauvePoints.icone);
                carte.setLayoutProperty('points-icones', 'icon-size', sauvePoints.tailleIcone);
            }
        }
        retirerCouche('th-gps-labels');
    }

    // ── Relief (bascule du fond de carte) ───────────────────────
    function appliquerFond(id) {
        var C = global.BasemapSelectorCore;
        if (!C || !carte) return;
        try {
            if (carte.loaded()) C.appliquer(carte, id);
            else carte.once('idle', function () { try { C.appliquer(carte, id); } catch (e) {} });
        } catch (e) {}
    }

    function majRelief() {
        var B = global.BasemapSelector;
        if (!B || !global.BasemapSelectorCore) return;
        if (etat.filtres.relief) {
            if (fondSauve === null) {
                var courant = null;
                try { if (typeof basemapActif !== 'undefined') courant = basemapActif; } catch (e) {}
                if (!courant && typeof B.actifId === 'function') courant = B.actifId();
                fondSauve = courant || 'osm';
            }
            appliquerFond('hillshade');
        } else if (fondSauve !== null) {
            appliquerFond(fondSauve);
            fondSauve = null;
        }
    }

    // ── Légende ─────────────────────────────────────────────────
    function majLegende() {
        var el = document.getElementById('thema-legende');
        if (!el) return;
        var nbPoints = 0;
        try { if (typeof donneesPoints !== 'undefined') nbPoints = (donneesPoints || []).length; } catch (e) {}
        el.innerHTML = construireLegende(etat, {
            ouvrages: donnees.ouvrages || [],
            traces: donnees.traces || [],
            nbPoints: nbPoints,
            longueurConduites: donnees.longueurConduites
        }, { trad: trad, penteEtat: penteEtat });
    }

    // ── Application globale ──────────────────────────────────────
    function appliquer() {
        if (!carte) return;
        majOuvrages();
        majTraces();
        majPointsGps();
        majRelief();
        majLegende();
    }

    // ── Persistance ─────────────────────────────────────────────
    function lireEtat() {
        try {
            var v = JSON.parse(localStorage.getItem('mukmap_thematique') || 'null');
            if (!v || !v.filtres || !v.styles) return;
            CLES_FILTRES.forEach(function (k) { etat.filtres[k] = !!v.filtres[k]; });
            Object.keys(etat.styles).forEach(function (k) {
                var s = v.styles[k];
                if (!s) return;
                Object.keys(etat.styles[k]).forEach(function (p) {
                    if (p in s) etat.styles[k][p] = s[p];
                });
            });
        } catch (e) {}
    }

    function sauvegarder() {
        try { localStorage.setItem('mukmap_thematique', JSON.stringify(etat)); } catch (e) {}
    }

    // ── Interface ───────────────────────────────────────────────
    function creerInterface() {
        if (document.getElementById('mukmap-thema-bouton')) return null;
        var panneau = document.createElement('div');
        panneau.id = 'panel-thema';
        panneau.className = 'mukmap-thema';
        panneau.innerHTML =
            '<div class="th-tete"><span>🎨 ' + trad('thema_titre', 'Cartographie thématique') + '</span>' +
            '<button type="button" class="th-fermer" title="' + trad('fermer', 'Fermer') + '">✕</button></div>' +
            '<div class="th-corps">' +
            '<div class="thema-group">' + trad('thema_filtres', 'Thèmes (filtres)') + '</div>' +
            '<div id="thema-filtres">' +
            '<label class="thema-f"><input type="checkbox" data-theme="source"> 💧 <span data-i18n="thema_sources">' + trad('thema_sources', 'Sources') + '</span></label>' +
            '<label class="thema-f"><input type="checkbox" data-theme="village"> 🏘️ <span data-i18n="thema_villages">' + trad('thema_villages', 'Villages') + '</span></label>' +
            '<label class="thema-f"><input type="checkbox" data-theme="borne"> 🚰 <span data-i18n="thema_bornes">' + trad('thema_bornes', 'Bornes') + '</span></label>' +
            '<label class="thema-f"><input type="checkbox" data-theme="reservoir"> 🛢️ <span data-i18n="thema_reservoirs">' + trad('thema_reservoirs', 'Réservoirs') + '</span></label>' +
            '<label class="thema-f"><input type="checkbox" data-theme="repere"> 🧭 <span data-i18n="thema_reperes">' + trad('thema_reperes', 'Repères') + '</span></label>' +
            '<label class="thema-f"><input type="checkbox" data-theme="conduite"> 〰️ <span data-i18n="thema_conduites">' + trad('thema_conduites', 'Conduites') + '</span></label>' +
            '<label class="thema-f"><input type="checkbox" data-theme="point_gps"> 📍 <span data-i18n="thema_points_gps">' + trad('thema_points_gps', 'Points GPS') + '</span></label>' +
            '<label class="thema-f"><input type="checkbox" data-theme="relief"> ⛰️ <span data-i18n="thema_relief_leg">' + trad('thema_relief_leg', 'Relief (hillshade)') + '</span></label>' +
            '<label class="thema-f"><input type="checkbox" data-theme="pente"> 📈 <span data-i18n="thema_pente">' + trad('thema_pente', 'Pente des conduites') + '</span></label>' +
            '<label class="thema-f"><input type="checkbox" data-theme="existant"> ✅ <span data-i18n="thema_existants">' + trad('thema_existants', 'Ouvrages existants') + '</span></label>' +
            '<label class="thema-f"><input type="checkbox" data-theme="propose"> 🟣 <span data-i18n="thema_proposes">' + trad('thema_proposes', 'Ouvrages proposés') + '</span></label>' +
            '</div>' +
            '<div class="thema-group">' + trad('thema_styles', 'Style des éléments') + '</div>' +
            '<div class="thema-grid">' +
            '<label class="thema-lbl" for="thema-element">' + trad('thema_element', 'Élément') + '</label><select id="thema-element"></select>' +
            '<label class="thema-lbl" for="thema-symbole">' + trad('thema_symbole', 'Symbole') + '</label><select id="thema-symbole"></select>' +
            '<label class="thema-lbl" for="thema-couleur">' + trad('thema_couleur', 'Couleur') + '</label><input type="color" id="thema-couleur">' +
            '<label class="thema-lbl" for="thema-taille">' + trad('thema_taille', 'Taille') + '</label><input type="range" id="thema-taille" min="1" max="18" step="1">' +
            '<label class="thema-lbl" for="thema-opacite">' + trad('thema_opacite', 'Opacité') + '</label><input type="range" id="thema-opacite" min="10" max="100" step="5">' +
            '<label class="thema-lbl" for="thema-etiquette">' + trad('thema_etiquette', 'Étiquettes') + '</label><input type="checkbox" id="thema-etiquette">' +
            '</div>' +
            '<button type="button" id="btn-thema-reinit" class="th-bouton">' + trad('thema_reinit', 'Réinitialiser') + '</button>' +
            '<div class="thema-group">' + trad('thema_legende', 'Légende') + '</div>' +
            '<div id="thema-legende"></div>' +
            '</div>';
        document.body.appendChild(panneau);

        var bouton = document.createElement('button');
        bouton.id = 'mukmap-thema-bouton';
        bouton.textContent = '🎨';
        bouton.title = trad('thema_titre', 'Cartographie thématique');
        bouton.style.cssText = 'position:fixed;left:18px;top:120px;z-index:1150;width:46px;height:46px;' +
            'border-radius:50%;border:1px solid rgba(124,58,237,.5);background:rgba(124,58,237,.15);' +
            'color:#a78bfa;font-size:1.15rem;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.3);' +
            'display:flex;align-items:center;justify-content:center;';
        document.body.appendChild(bouton);
        bouton.addEventListener('click', function () {
            var visible = panneau.style.display === 'none';
            panneau.style.display = visible ? 'flex' : 'none';
            if (visible) majLegende();
        });
        panneau.querySelector('.th-fermer').addEventListener('click', function () {
            panneau.style.display = 'none';
        });
        panneau.style.display = 'none';
        return panneau;
    }

    function rafraichirControles() {
        var elElement = document.getElementById('thema-element');
        if (!elElement) return;
        var k = elElement.value;
        var st = etat.styles[k];
        var d = DEFAUTS_STYLE[k] || {};
        var el;
        (el = document.getElementById('thema-couleur')).value = st.couleur || d.couleur || '#6d5df6';
        (el = document.getElementById('thema-taille')).value = String(st.taille || d.taille || 7);
        (el = document.getElementById('thema-opacite')).value = String(st.opacite || d.opacite || 100);
        (el = document.getElementById('thema-symbole')).value = st.symbole || 'rond';
        (el = document.getElementById('thema-etiquette')).checked = !!st.etiquette;
        var sansSymbole = ['conduite', 'existant', 'propose'].indexOf(k) !== -1;
        document.getElementById('thema-symbole').disabled = sansSymbole;
        document.getElementById('thema-etiquette').disabled = ['existant', 'propose'].indexOf(k) !== -1;
    }

    function rafraichirUI() {
        document.querySelectorAll('#thema-filtres input[data-theme]').forEach(function (cb) {
            cb.checked = !!etat.filtres[cb.getAttribute('data-theme')];
        });
        rafraichirControles();
    }

    function elementCourant() {
        var el = document.getElementById('thema-element');
        return el ? el.value : 'source';
    }

    function appliquerStyle() {
        var k = elementCourant();
        var st = etat.styles[k];
        st.couleur = document.getElementById('thema-couleur').value;
        st.taille = parseInt(document.getElementById('thema-taille').value, 10) || 0;
        st.opacite = parseInt(document.getElementById('thema-opacite').value, 10) || 100;
        st.symbole = document.getElementById('thema-symbole').value;
        st.etiquette = document.getElementById('thema-etiquette').checked;
        etat.filtres[k] = true; // personnaliser un style active le thème correspondant
        var cb = document.querySelector('#thema-filtres input[data-theme="' + k + '"]');
        if (cb) cb.checked = true;
        sauvegarder();
        appliquer();
    }

    function reinitialiser() {
        if (!confirm(trad('thema_reinit_confirm', 'Réinitialiser tous les filtres et styles thématiques ?'))) return;
        etat = etatInitial();
        sauvegarder();
        rafraichirUI();
        appliquer();
    }

    function initialiserUI() {
        var elFiltres = document.getElementById('thema-filtres');
        var selElement = document.getElementById('thema-element');
        var selSymbole = document.getElementById('thema-symbole');
        var inputCouleur = document.getElementById('thema-couleur');
        var inputTaille = document.getElementById('thema-taille');
        var inputOpacite = document.getElementById('thema-opacite');
        var chkEtiquette = document.getElementById('thema-etiquette');
        var btnReinit = document.getElementById('btn-thema-reinit');
        if (!elFiltres || !selElement) return;

        ELEMENTS_STYLE.forEach(function (e) {
            var op = document.createElement('option');
            op.value = e.id;
            op.textContent = e.emoji + ' ' + trad(e.cle, e.id);
            selElement.appendChild(op);
        });
        SYMBOLES.forEach(function (s) {
            var op = document.createElement('option');
            op.value = s.id;
            op.textContent = s.emoji || trad('thema_symb_' + s.id, s.id);
            selSymbole.appendChild(op);
        });

        rafraichirUI();

        elFiltres.querySelectorAll('input[data-theme]').forEach(function (cb) {
            cb.addEventListener('change', function () {
                etat.filtres[cb.getAttribute('data-theme')] = cb.checked;
                sauvegarder();
                appliquer();
            });
        });
        selElement.addEventListener('change', rafraichirControles);
        [inputCouleur, inputTaille, inputOpacite].forEach(function (inp) {
            inp.addEventListener('input', appliquerStyle);
        });
        selSymbole.addEventListener('change', appliquerStyle);
        chkEtiquette.addEventListener('change', appliquerStyle);
        if (btnReinit) btnReinit.addEventListener('click', reinitialiser);
    }

    function demarrer(opts) {
        var c = opts.carte || carteGlobale();
        if (!c || typeof c.loaded !== 'function') return;
        carte = c;
        injecterCSS();
        creerInterface();
        initialiserUI();
        var lance = false;
        function lancer() {
            if (lance) return;
            lance = true;
            lireDonnees();
            appliquer();
        }
        if (carte.loaded()) lancer();
        else carte.once('load', lancer);
        // Repli si le module Adduction n'émet pas d'événement : la source miroir
        // est ré-alimentée depuis la couche visible (viewport limité).
        carte.on('moveend', rafraichirMiroir);
        carte.on('sourcedata', function (e) {
            if (e && e.sourceId === 'mw-ouv-p' && e.isSourceLoaded) rafraichirMiroir();
        });
    }

    // L'événement est émis par le module Adduction après chaque majTout().
    global.addEventListener('mukmap:eau-maj', function (e) {
        majDonnees(e && e.detail);
        if (carte) appliquer();
    });

    function attendreCarte(tentatives) {
        if (carte && typeof carte.loaded === 'function') return;
        if (tentatives <= 0) return;
        setTimeout(function () { demarrer({}); attendreCarte(tentatives - 1); }, 250);
    }
    global.MukmapThematic = { demarrer: demarrer, CORE: ThematicCore, appliquer: appliquer };
    demarrer({});
    attendreCarte(120);
})(typeof window !== 'undefined' ? window : globalThis);
