/* MUKMAP — Adduction d'eau / Water Supply Survey
 * Module professionnel : préparation, collecte GPS terrain, relevés
 * d'ouvrages hydrauliques (sources, bornes-fontaines, villages desservis,
 * ouvrages, repères, points intermédiaires), altitudes, distances,
 * tracés de conduites potentielles, analyse de dénivelé/charge,
 * rapport de terrain et exports (GeoJSON / CSV / GPX).
 *
 * CORE : moteur pur testable sous Node (aucune dépendance DOM/Turf).
 * INSTALLEUR : panneau flottant + interaction MapLibre.
 */
(function (global) {
    'use strict';

    // ── Types d'ouvrages relevés ────────────────────────────────
    var TYPES = {
        source: { label: "Source d'eau", emoji: '💧', couleur: '#06b6d4' },
        captage: { label: 'Captage', emoji: '🚰', couleur: '#0ea5e9' },
        borne: { label: 'Borne-fontaine', emoji: '🚰', couleur: '#22c55e' },
        consommation: { label: 'Point de consommation', emoji: '🧴', couleur: '#84cc16' },
        reservoir: { label: 'Réservoir', emoji: '🛢️', couleur: '#6366f1' },
        reseau: { label: 'Ouvrage du réseau', emoji: '🔧', couleur: '#8b5cf6' },
        ouvrage: { label: 'Ouvrage existant', emoji: '🏗️', couleur: '#a16207' },
        repere: { label: 'Point de repère', emoji: '🧭', couleur: '#64748b' },
        intermediaire: { label: 'Point intermédiaire', emoji: '➿', couleur: '#94a3b8' },
        village: { label: 'Village desservi', emoji: '🏘️', couleur: '#f59e0b' }
    };
    var STATUTS = {
        actif: { label: 'En service', couleur: '#22c55e' },
        moyen: { label: 'État moyen', couleur: '#eab308' },
        defectueux: { label: 'Défectueux', couleur: '#f97316' },
        hors_service: { label: 'Hors service', couleur: '#ef4444' },
        projet: { label: 'À construire', couleur: '#6366f1' }
    };
    // Classification SOURCE D'EAU (A) — sous-types + champs techniques
    // applicables selon le type choisi.
    var SOURCES = {
        naturelle: { labelKey: 'src_naturelle', debit: true, niveau: true, profondeur: false, permanence: true, protection: true },
        amenagee: { labelKey: 'src_amenagee', debit: true, niveau: true, profondeur: false, permanence: true, protection: true },
        forage: { labelKey: 'src_forage', debit: true, niveau: true, profondeur: true, permanence: false, protection: false },
        puits: { labelKey: 'src_puits', debit: true, niveau: true, profondeur: true, permanence: true, protection: true },
        riviere: { labelKey: 'src_riviere', debit: true, niveau: true, profondeur: false, permanence: true, protection: false },
        lac: { labelKey: 'src_lac', debit: false, niveau: true, profondeur: true, permanence: true, protection: false },
        etang: { labelKey: 'src_etang', debit: false, niveau: true, profondeur: true, permanence: true, protection: false },
        captage_source: { labelKey: 'src_captage', debit: true, niveau: true, profondeur: false, permanence: true, protection: true },
        gravitaire: { labelKey: 'src_gravitaire', debit: true, niveau: true, profondeur: false, permanence: true, protection: true },
        resurgence: { labelKey: 'src_resurgence', debit: true, niveau: true, profondeur: false, permanence: true, protection: true },
        autre: { labelKey: 'src_autre', debit: true, niveau: true, profondeur: false, permanence: true, protection: false }
    };
    // Classification POINT DE CONSOMMATION (G) — sous-types du type
    // « consommation ».
    var CONSOMMATIONS = {
        borne_fontaine: { labelKey: 'conso_borne_fontaine' },
        robinet_public: { labelKey: 'conso_robinet_public' },
        kiosque_eau: { labelKey: 'conso_kiosque_eau' },
        point_communautaire: { labelKey: 'conso_point_communautaire' },
        ecole_conso: { labelKey: 'conso_ecole' },
        centre_sante_conso: { labelKey: 'conso_centre_sante' },
        institution: { labelKey: 'conso_institution' },
        autre_desservi: { labelKey: 'conso_autre_desservi' }
    };
    // Classification REPÈRES / POINTS INTERMÉDIAIRES (H) — sous-types
    // du type « repere ».
    var REPERES = {
        carrefour: { labelKey: 'repere_carrefour' },
        route: { labelKey: 'repere_route' },
        pont: { labelKey: 'repere_pont' },
        riviere_repere: { labelKey: 'repere_riviere' },
        ravin: { labelKey: 'repere_ravin' },
        colline: { labelKey: 'repere_colline' },
        sommet: { labelKey: 'repere_sommet' },
        vallee: { labelKey: 'repere_vallee' },
        ecole_repere: { labelKey: 'repere_ecole' },
        maison: { labelKey: 'repere_maison' },
        marche: { labelKey: 'repere_marche' },
        eglise: { labelKey: 'repere_eglise' },
        centre_sante_repere: { labelKey: 'repere_centre_sante' },
        passage_difficile: { labelKey: 'repere_passage_difficile' },
        zone_rocheuse: { labelKey: 'repere_zone_rocheuse' },
        zone_marecageuse: { labelKey: 'repere_zone_marecageuse' },
        traversee_riviere: { labelKey: 'repere_traversee_riviere' },
        point_haut: { labelKey: 'repere_point_haut' },
        point_bas: { labelKey: 'repere_point_bas' },
        reservoir_potentiel: { labelKey: 'repere_reservoir_potentiel' },
        chambre_vanne_potentielle: { labelKey: 'repere_chambre_vanne' },
        autre_repere: { labelKey: 'repere_autre' }
    };
    // Classification RÉSERVOIRS — sous-types du type 'reservoir'.
    var RESERVOIRS = {
        reservoir: { labelKey: 'reservoir_reservoir', emoji: '🛢️' },
        chateau_eau: { labelKey: 'reservoir_chateau_eau', emoji: '🗼' }
    };
    // Classification OUVRAGES DU RÉSEAU — sous-types du type 'reseau'
    // (équipements et accessoires de la conduite).
    var RESEAUX = {
        station_pompage: { labelKey: 'reseau_station_pompage', emoji: '⚙️' },
        chambre_vanne: { labelKey: 'reseau_chambre_vanne', emoji: '🚪' },
        vanne: { labelKey: 'reseau_vanne', emoji: '🔧' },
        ventouse: { labelKey: 'reseau_ventouse', emoji: '💨' },
        vidange: { labelKey: 'reseau_vidange', emoji: '🕳️' },
        traversee_riviere: { labelKey: 'reseau_traversee_riviere', emoji: '🌉' },
        autre_reseau: { labelKey: 'reseau_autre', emoji: '➕' }
    };

    var CORE = {
        TYPES: TYPES,
        STATUTS: STATUTS,
        SOURCES: SOURCES,
        CONSOMMATIONS: CONSOMMATIONS,
        REPERES: REPERES,
        RESERVOIRS: RESERVOIRS,
        RESEAUX: RESEAUX,

        // Sous-types (classification) du type « source » → liste [{id, labelKey}].
        sourcesListe: function () {
            return Object.keys(SOURCES).map(function (k) {
                return { id: k, labelKey: SOURCES[k].labelKey };
            });
        },

        // Libellé d'un sous-type source (par défaut l'id).
        sourceLabel: function (id) {
            var s = SOURCES[id];
            return s ? (s.labelKey || id) : id;
        },

        // Classification du type « consommation » → liste [{id, labelKey}].
        consommationsListe: function () {
            return Object.keys(CONSOMMATIONS).map(function (k) {
                return { id: k, labelKey: CONSOMMATIONS[k].labelKey };
            });
        },

        // Libellé d'un sous-type consommation.
        consommationLabel: function (id) {
            var s = CONSOMMATIONS[id];
            return s ? (s.labelKey || id) : id;
        },

        // Classification du type « repere » → liste [{id, labelKey}].
        reperesListe: function () {
            return Object.keys(REPERES).map(function (k) {
                return { id: k, labelKey: REPERES[k].labelKey };
            });
        },

        // Libellé d'un sous-type repère.
        repereLabel: function (id) {
            var s = REPERES[id];
            return s ? (s.labelKey || id) : id;
        },

        // Classification du type « reservoir » → liste [{id, labelKey}].
        reservoirsListe: function () {
            return Object.keys(RESERVOIRS).map(function (k) {
                return { id: k, labelKey: RESERVOIRS[k].labelKey };
            });
        },

        // Libellé d'un sous-type réservoir.
        reservoirLabel: function (id) {
            var s = RESERVOIRS[id];
            return s ? (s.labelKey || id) : id;
        },

        // Classification du type « reseau » → liste [{id, labelKey}].
        reseauxListe: function () {
            return Object.keys(RESEAUX).map(function (k) {
                return { id: k, labelKey: RESEAUX[k].labelKey };
            });
        },

        // Libellé d'un sous-type ouvrage du réseau.
        reseauLabel: function (id) {
            var s = RESEAUX[id];
            return s ? (s.labelKey || id) : id;
        },

        // Émoji d'un ouvrage : celui du sous-type (réservoir / réseau)
        // s'il existe, sinon celui du type.
        emojiOuvrage: function (type, sousType) {
            if (type === 'reservoir' && RESERVOIRS[sousType]) return RESERVOIRS[sousType].emoji;
            if (type === 'reseau' && RESEAUX[sousType]) return RESEAUX[sousType].emoji;
            return (TYPES[type] || {}).emoji || '📍';
        },

        // Ouvrage situé à moins de `rayonM` mètres du point [lng, lat]
        // (accrochage du constructeur de réseau) ; null sinon.
        ouvragePlusProche: function (ouvrages, lng, lat, rayonM) {
            var meilleur = null;
            (ouvrages || []).forEach(function (o) {
                var d = CORE.distance(lat, lng, o.latitude, o.longitude);
                if (d <= (rayonM || 60) && (!meilleur || d < meilleur.d)) {
                    meilleur = { o: o, d: d };
                }
            });
            return meilleur ? meilleur.o : null;
        },

        _rad: function (d) { return d * Math.PI / 180; },

        // Distance haversine (m) entre [lat1, lon1] et [lat2, lon2].
        distance: function (lat1, lon1, lat2, lon2) {
            var R = 6371000;
            var a = Math.sin(CORE._rad(lat2 - lat1) / 2) * Math.sin(CORE._rad(lat2 - lat1) / 2) +
                Math.cos(CORE._rad(lat1)) * Math.cos(CORE._rad(lat2)) *
                Math.sin(CORE._rad(lon2 - lon1) / 2) * Math.sin(CORE._rad(lon2 - lon1) / 2);
            return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
        },

        // a, b = [lon, lat, alt?]
        distanceCoord: function (a, b) {
            return CORE.distance(a[1], a[0], b[1], b[0]);
        },

        // Longueur (m) d'une polyligne [[lon, lat, alt?], ...].
        longueurTrace: function (coords) {
            if (!coords || coords.length < 2) return 0;
            var t = 0;
            for (var i = 1; i < coords.length; i++) {
                t += CORE.distanceCoord(coords[i - 1], coords[i]);
            }
            return t;
        },

        // Dénivelé cumulé positif le long du tracé (m).
        denivelePositif: function (coords) {
            var s = 0;
            for (var i = 1; i < (coords || []).length; i++) {
                var a = coords[i - 1][2], b = coords[i][2];
                if (a != null && b != null && b > a) s += (b - a);
            }
            return s;
        },

        // Dénivelé cumulé négatif le long du tracé (m).
        deniveleNegatif: function (coords) {
            var s = 0;
            for (var i = 1; i < (coords || []).length; i++) {
                var a = coords[i - 1][2], b = coords[i][2];
                if (a != null && b != null && b < a) s += (a - b);
            }
            return s;
        },

        // Distance horizontale (m) = somme des distances planaires (2D).
        distanceHorizontale: function (coords) {
            return CORE.longueurTrace(coords);
        },

        // Longueur totale (m) le long du terrain : segments 3D lorsque
        // l'altitude est connue (√(d2D² + dh²)), sinon distance planaire.
        longueurTotale3d: function (coords) {
            if (!coords || coords.length < 2) return 0;
            var t = 0;
            for (var i = 1; i < coords.length; i++) {
                var a = coords[i - 1], b = coords[i];
                var d2 = CORE.distanceCoord(a, b);
                if (a[2] != null && b[2] != null) {
                    var dh = b[2] - a[2];
                    t += Math.sqrt(d2 * d2 + dh * dh);
                } else {
                    t += d2;
                }
            }
            return t;
        },

        // Pente maximale (%) : segment le plus raide en valeur absolue.
        penteMaximale: function (coords) {
            var max = 0;
            for (var i = 1; i < (coords || []).length; i++) {
                var a = coords[i - 1], b = coords[i];
                if (a[2] == null || b[2] == null) continue;
                var d2 = CORE.distanceCoord(a, b);
                if (d2 <= 0) continue;
                var p = Math.abs((b[2] - a[2]) / d2) * 100;
                if (p > max) max = p;
            }
            return max;
        },

        // Altitudes min/max d'une trace → {min, max} (null si inconnues).
        altitudesMinMax: function (coords) {
            var alts = [];
            (coords || []).forEach(function (c) {
                if (c[2] != null) alts.push(Number(c[2]));
            });
            if (!alts.length) return { min: null, max: null };
            return { min: Math.min.apply(null, alts), max: Math.max.apply(null, alts) };
        },

        // Durée (s) d'une reconnaissance : timestamps ISO en 4e élément
        // de chaque point [lon, lat, alt?, ts?]. Null si absent.
        dureeTrace: function (points) {
            var deb = null, fin = null;
            (points || []).forEach(function (p) {
                if (!p[3]) return;
                var t = Date.parse(p[3]);
                if (isNaN(t)) return;
                if (deb === null || t < deb) deb = t;
                if (fin === null || t > fin) fin = t;
            });
            if (deb === null || fin === null) return null;
            return Math.round((fin - deb) / 1000);
        },

        // Synthèse complète d'une reconnaissance GPS (mode
        // « ENREGISTRER LE TRACÉ ») : [lon, lat, alt?, tsISO?]…
        analyseTraceGps: function (points) {
            var longueur3d = CORE.longueurTotale3d(points);
            return {
                longueur_totale: longueur3d,
                distance_horizontale: CORE.distanceHorizontale(points),
                altitude_min: CORE.altitudesMinMax(points).min,
                altitude_max: CORE.altitudesMinMax(points).max,
                denivele_positif: CORE.denivelePositif(points),
                denivele_negatif: CORE.deniveleNegatif(points),
                pente_moyenne: CORE.penteMoyenne(points),
                pente_maximale: CORE.penteMaximale(points),
                nb_points: (points || []).length,
                duree_s: CORE.dureeTrace(points)
            };
        },

        // Dénivelé net (altitude fin - altitude début).
        deniveleNet: function (coords) {
            if (!coords || !coords.length) return null;
            var d = coords[coords.length - 1][2] != null ? coords[coords.length - 1][2] : null;
            var f = coords[0][2] != null ? coords[0][2] : null;
            if (f == null || d == null) return null;
            return d - f;
        },

        // Pente moyenne (%) sur la distance cumulée.
        penteMoyenne: function (coords) {
            if (!coords || coords.length < 2) return 0;
            var d = CORE.longueurTrace(coords);
            if (d <= 0) return 0;
            var net = CORE.deniveleNet(coords);
            if (net == null) return 0;
            return (net / d) * 100;
        },

        // Charge statique disponible (m) = alt_source - alt_borne - pertes.
        chargeDisponible: function (altSource, altBorne, pertesM) {
            return (altSource - altBorne) - (pertesM || 0);
        },

        // Pression (bar) engendrée par une colonne d'eau de H m.
        pressionBar: function (hauteurM) {
            return hauteurM * 0.0980665;
        },

        // Débit mesuré : volumeL rempli en tempsS (m³/s).
        debitMesure: function (volumeL, tempsS) {
            if (!(tempsS > 0)) return 0;
            return (volumeL / 1000) / tempsS;
        },

        // Débit moyen par borne (L/s) pour une population
        // (conso quotidienne en L/pers/jour répartie sur les bornes).
        debitParFontaine: function (population, bornes, lParPersJour) {
            if (!(bornes > 0) || !(population > 0)) return 0;
            return (population * (lParPersJour || 20)) / (bornes * 86400);
        },

        // Longueur de conduite estimée (source→borne) × sinuosité.
        longueurConduite: function (source, borne, sinuosite) {
            return CORE.distanceCoord(
                [source.longitude, source.latitude],
                [borne.longitude, borne.latitude]
            ) * (sinuosite || 1.15);
        },

        // Profil [[dist cumulée, alt], ...] d'un tracé.
        profilRelief: function (coords) {
            var out = [], cum = 0;
            for (var i = 0; i < (coords || []).length; i++) {
                var alt = coords[i][2] != null ? coords[i][2] : null;
                if (i > 0) cum += CORE.distanceCoord(coords[i - 1], coords[i]);
                out.push({ dist: cum, alt: alt });
            }
            return out;
        },

        // Synthèse relief d'un tracé.
        reliefTracing: function (coords) {
            return {
                profil: CORE.profilRelief(coords),
                longueur: CORE.longueurTrace(coords),
                denivele: {
                    positif: CORE.denivelePositif(coords),
                    net: CORE.deniveleNet(coords)
                },
                pente: CORE.penteMoyenne(coords)
            };
        },

        // ── PROFIL EN LONG ─────────────────────────────────────────
        // Profil détaillé d'une trace : pour chaque point → distance
        // cumulée (m), altitude (m), pente du segment suivant (%), et
        // coordonnées [lon, lat].
        profilDetaille: function (coords) {
            var out = [], cum = 0;
            var n = (coords || []).length;
            for (var i = 0; i < n; i++) {
                var alt = coords[i][2] != null ? coords[i][2] : null;
                if (i > 0) cum += CORE.distanceCoord(coords[i - 1], coords[i]);
                var pente = null;
                if (i < n - 1) {
                    var a = coords[i], b = coords[i + 1];
                    if (a[2] != null && b[2] != null) {
                        var d2 = CORE.distanceCoord(a, b);
                        if (d2 > 0) pente = ((b[2] - a[2]) / d2) * 100;
                    }
                } else if (n >= 2) {
                    var ap = coords[n - 2], bp = coords[n - 1];
                    if (ap[2] != null && bp[2] != null) {
                        var dp = CORE.distanceCoord(ap, bp);
                        if (dp > 0) pente = ((bp[2] - ap[2]) / dp) * 100;
                    }
                }
                out.push({ dist: Math.round(cum * 10) / 10, alt: alt, pente: pente,
                           lon: coords[i][0], lat: coords[i][1] });
            }
            return out;
        },

        // Points hauts (max locaux) et bas (min locaux) d'un profil
        // (profil = [{dist, alt, pente, lon, lat}]).
        extremaProfil: function (profil) {
            var out = [];
            var n = (profil || []).length;
            if (n < 3) return out;
            for (var i = 1; i < n - 1; i++) {
                var a = profil[i - 1].alt, b = profil[i].alt, c = profil[i + 1].alt;
                if (a == null || b == null || c == null) continue;
                if (b > a && b > c) out.push({ i: i, dist: profil[i].dist, alt: b, type: 'haut' });
                else if (b < a && b < c) out.push({ i: i, dist: profil[i].dist, alt: b, type: 'bas' });
            }
            return out;
        },

        // Tronçons consécutifs dont la pente (absolue) dépasse le seuil
        // (%). → [{debut_i, fin_i, debut_dist, fin_dist, longueur_m, pente_max}].
        zonesFortesPentes: function (profil, seuil) {
            var out = [], courant = null;
            seuil = seuil || 10;
            for (var i = 0; i < (profil || []).length - 1; i++) {
                var p = profil[i].pente;
                var fort = p != null && Math.abs(p) >= seuil;
                if (fort) {
                    if (!courant) courant = { debut_i: i, debut_dist: profil[i].dist, pente_max: 0 };
                    if (Math.abs(p) > courant.pente_max) courant.pente_max = Math.abs(p);
                    courant.fin_i = i + 1;
                    courant.fin_dist = profil[i + 1].dist;
                } else if (courant) {
                    out.push(courant);
                    courant = null;
                }
            }
            if (courant) out.push(courant);
            out.forEach(function (z) {
                z.longueur_m = Math.round((z.fin_dist - z.debut_dist) * 10) / 10;
                z.pente_max = Math.round(z.pente_max * 10) / 10;
            });
            return out;
        },

        // Zones de contre-pente : tronçons dont la pente est de signe
        // opposé au dénivelé net du tracé (remontée si le réseau descend).
        contrepentes: function (profil, seuil) {
            var net = 0;
            var n = (profil || []).length;
            if (n >= 2 && profil[0].alt != null && profil[n - 1].alt != null) {
                net = profil[n - 1].alt - profil[0].alt;
            }
            if (net === 0) return [];
            var out = [], courant = null;
            seuil = seuil || 1;
            for (var i = 0; i < n - 1; i++) {
                var p = profil[i].pente;
                var contre = p != null && ((net > 0 && p < -seuil) || (net < 0 && p > seuil));
                if (contre) {
                    if (!courant) courant = { debut_i: i, debut_dist: profil[i].dist, pente_min: p };
                    if (p < courant.pente_min) courant.pente_min = p;
                    courant.fin_i = i + 1;
                    courant.fin_dist = profil[i + 1].dist;
                } else if (courant) {
                    out.push(courant);
                    courant = null;
                }
            }
            if (courant) out.push(courant);
            out.forEach(function (z) {
                z.longueur_m = Math.round((z.fin_dist - z.debut_dist) * 10) / 10;
                z.pente_min = Math.round(z.pente_min * 10) / 10;
            });
            return out;
        },

        // Emplacement potentiel d'un réservoir : point culminant du
        // profil (altitude maximale) → {dist, alt, lon, lat} | null.
        reservoirPotentiel: function (profil) {
            var meilleur = null;
            (profil || []).forEach(function (p) {
                if (p.alt == null) return;
                if (!meilleur || p.alt > meilleur.alt) {
                    meilleur = { dist: p.dist, alt: p.alt, lon: p.lon, lat: p.lat };
                }
            });
            return meilleur;
        },

        // Sites potentiels à étudier pour l'implantation d'un réservoir :
        // repères de terrain signalés comme point haut / sommet / colline
        // (avec altitude) + point culminant de chaque trace de projet.
        // Résultats INDICATIFS : ne constituent pas une validation
        // hydraulique — une étude de terrain (nivellement, étude de sol,
        // hydraulique) est requise avant toute décision.
        sitesPotentielsReservoir: function (ouvrages, traces, options) {
            var opts = options || {};
            var max = opts.max == null ? 8 : opts.max;
            var candidats = [];
            (ouvrages || []).forEach(function (o) {
                if (o.type !== 'repere') return;
                var st = String(o.sous_type || '');
                if (['point_haut', 'sommet', 'colline'].indexOf(st) === -1) return;
                if (o.altitude_m == null) return;
                candidats.push({
                    source: 'repere', id: o.id, nom: (o.code ? o.code + ' · ' : '') + (o.nom || 'Repère #' + o.id),
                    altitude_m: o.altitude_m, latitude: o.latitude, longitude: o.longitude,
                    sous_type: st
                });
            });
            (traces || []).forEach(function (tr) {
                var rp = CORE.reservoirPotentiel(CORE.profilDetaille(tr.coordonnees || []));
                if (!rp) return;
                candidats.push({
                    source: 'trace', id: tr.id, nom: tr.nom || 'Trace #' + tr.id,
                    altitude_m: rp.alt, latitude: rp.lat, longitude: rp.lon,
                    sous_type: 'point_culminant'
                });
            });
            candidats.sort(function (a, b) { return b.altitude_m - a.altitude_m; });
            return candidats.slice(0, max);
        },

        // ── Mesures terrain ──────────────────────────────────────────
        // Distance (m) entre deux ouvrages {latitude, longitude}.
        distanceOuvrages: function (a, b) {
            if (!a || !b || a.latitude == null || a.longitude == null ||
                b.latitude == null || b.longitude == null) return null;
            return CORE.distanceCoord([a.longitude, a.latitude], [b.longitude, b.latitude]);
        },

        // Dénivelé entre deux points : {altA, altB, difference} (null si
        // une altitude manque). différence = altB − altA.
        deniveleEntre: function (a, b) {
            if (!a || !b || a.altitude_m == null || b.altitude_m == null) return null;
            return { altA: a.altitude_m, altB: b.altitude_m, difference: b.altitude_m - a.altitude_m };
        },

        // Pente (%) entre deux points : (Δalt / distance) × 100.
        penteEntre: function (a, b) {
            var d = CORE.distanceOuvrages(a, b);
            var dn = CORE.deniveleEntre(a, b);
            if (d == null || d <= 0 || !dn) return null;
            return { distance_m: d, denivele_m: dn.difference,
                     pente_pct: Math.round((dn.difference / d) * 10000) / 100 };
        },

        // Aire (m²) d'un polygone [[lng, lat], ...] par projection
        // équirectangulaire locale (formule de l'aire / Shoelace).
        airePolygoneGeo: function (coords) {
            var pts = (coords || []).filter(function (p) { return p && p.length >= 2; });
            if (pts.length < 3) return null;
            var lat0 = 0, lng0 = 0;
            pts.forEach(function (p) { lat0 += p[1]; lng0 += p[0]; });
            lat0 /= pts.length; lng0 /= pts.length;
            var deg = Math.PI / 180;
            var c = Math.cos(lat0 * deg);
            var x = pts.map(function (p) { return (p[0] - lng0) * 111320 * c; });
            var y = pts.map(function (p) { return (p[1] - lat0) * 110540; });
            var s = 0;
            for (var i = 0; i < pts.length; i++) {
                var j = (i + 1) % pts.length;
                s += (x[i] * y[j]) - (x[j] * y[i]);
            }
            return Math.abs(s) / 2;
        },

        // Enveloppe convexe (Andrew) de [[lng, lat], ...] → sommets.
        convexHull: function (pts) {
            var list = (pts || []).filter(function (p) { return p && p.length >= 2; })
                .map(function (p) { return [p[0], p[1]]; });
            if (list.length < 3) return list.slice();
            list.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
            function croix(o, a, b) {
                return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
            }
            var bas = [], haut = [], i;
            for (i = 0; i < list.length; i++) {
                while (bas.length >= 2 && croix(bas[bas.length - 2], bas[bas.length - 1], list[i]) <= 0) bas.pop();
                bas.push(list[i]);
            }
            for (i = list.length - 1; i >= 0; i--) {
                while (haut.length >= 2 && croix(haut[haut.length - 2], haut[haut.length - 1], list[i]) <= 0) haut.pop();
                haut.push(list[i]);
            }
            bas.pop(); haut.pop();
            return bas.concat(haut);
        },

        // Emprise du projet : bbox des ouvrages → {polygone, aire_m2}.
        bboxOuvrages: function (ouvrages) {
            var pts = (ouvrages || []).filter(function (o) {
                return o.longitude != null && o.latitude != null;
            });
            if (!pts.length) return null;
            var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            pts.forEach(function (p) {
                if (p.longitude < minX) minX = p.longitude;
                if (p.longitude > maxX) maxX = p.longitude;
                if (p.latitude < minY) minY = p.latitude;
                if (p.latitude > maxY) maxY = p.latitude;
            });
            var poly = [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]];
            return { bbox: [minX, minY, maxX, maxY], polygone: poly,
                     aire_m2: CORE.airePolygoneGeo(poly) };
        },

        // Zone d'intervention : enveloppe convexe des ouvrages clés
        // (source, réservoir, consommation, borne, réseau) ; repli sur
        // tous les ouvrages si moins de 3 clés. → {polygone, aire_m2}.
        zoneIntervention: function (ouvrages) {
            var cles = (ouvrages || []).filter(function (o) {
                return ['source', 'reservoir', 'consommation', 'borne', 'reseau'].indexOf(o.type) !== -1 &&
                    o.longitude != null && o.latitude != null;
            });
            if (cles.length < 3) {
                cles = (ouvrages || []).filter(function (o) {
                    return o.longitude != null && o.latitude != null;
                });
            }
            if (cles.length < 3) return null;
            var hull = CORE.convexHull(cles.map(function (o) { return [o.longitude, o.latitude]; }));
            return { polygone: hull, aire_m2: CORE.airePolygoneGeo(hull), nb_ouvrages: cles.length };
        },

        // Bassin versant APPROXIMATIF : enveloppe convexe des points de
        // terrain relevés (ouvrages avec altitude + points des tracés)
        // situés à moins de `rayonKm` du point d'intérêt et à une
        // altitude ≥ à la sienne. Résultat INDICATIF : une délimitation
        // précise exige un modèle numérique de terrain (MNT).
        bassinVersantApprox: function (centre, ouvrages, traces, rayonKm) {
            if (!centre || centre.latitude == null || centre.longitude == null) return null;
            rayonKm = rayonKm == null ? 2 : rayonKm;
            var pts = [];
            (ouvrages || []).forEach(function (o) {
                if (o.longitude == null || o.latitude == null || o.altitude_m == null) return;
                pts.push([o.longitude, o.latitude, o.altitude_m]);
            });
            (traces || []).forEach(function (tr) {
                (tr.coordonnees || []).forEach(function (c) {
                    if (c.length >= 3 && c[0] != null && c[1] != null && c[2] != null) {
                        pts.push([c[0], c[1], c[2]]);
                    }
                });
            });
            var cAlt = centre.altitude_m;
            var up = [];
            pts.forEach(function (p) {
                var d = CORE.distance(centre.latitude, centre.longitude, p[1], p[0]);
                if (d > rayonKm * 1000) return;
                if (cAlt != null && p[2] <= cAlt) return;
                up.push([p[0], p[1]]);
            });
            if (up.length < 3) return null;
            var hull = CORE.convexHull(up);
            return { polygone: hull, aire_m2: CORE.airePolygoneGeo(hull),
                     nb_points: up.length, rayon_km: rayonKm };
        },

        // Pente le long d'une trace/conduite : {longueur_m, denivele_m,
        // pente_pct (moyenne), pente_max_pct} — null si données absentes.
        penteTrace: function (tr) {
            var coords = (tr && tr.coordonnees) || [];
            if (coords.length < 2) return null;
            var longueur = 0, altMin = null, altMax = null, penteMax = 0, avecAlt = 0;
            for (var i = 0; i < coords.length; i++) {
                if (i > 0) longueur += CORE.distanceCoord(coords[i - 1], coords[i]);
                var alt = coords[i][2];
                if (alt != null) {
                    avecAlt++;
                    if (altMin == null || alt < altMin) altMin = alt;
                    if (altMax == null || alt > altMax) altMax = alt;
                }
                if (i > 0) {
                    var a = coords[i - 1][2], b = coords[i][2];
                    if (a != null && b != null) {
                        var d2 = CORE.distanceCoord(coords[i - 1], coords[i]);
                        if (d2 > 0) {
                            var p = Math.abs(((b - a) / d2) * 100);
                            if (p > penteMax) penteMax = p;
                        }
                    }
                }
            }
            if (!avecAlt || altMin == null) return null;
            return { longueur_m: longueur, denivele_m: altMax - altMin,
                     pente_pct: longueur > 0 ? Math.round((((altMax - altMin) / longueur) * 100) * 100) / 100 : 0,
                     pente_max_pct: Math.round(penteMax * 100) / 100 };
        },

        // Zones nécessitant une attention technique : union des zones de
        // forte pente (seuilFort) et des contre-pentes → liste de segments.
        zonesAttention: function (profil, seuilFort, seuilContre) {
            var zones = CORE.zonesFortesPentes(profil, seuilFort).map(function (z) {
                return { debut_i: z.debut_i, fin_i: z.fin_i, debut_dist: z.debut_dist,
                         fin_dist: z.fin_dist, longueur_m: z.longueur_m, raison: 'forte_pente' };
            });
            CORE.contrepentes(profil, seuilContre).forEach(function (z) {
                var debut = Math.max(z.debut_i, 0), fin = Math.min(z.fin_i, (profil || []).length - 1);
                var existe = zones.some(function (x) {
                    return x.debut_i === debut && x.fin_i === fin;
                });
                if (!existe) {
                    zones.push({ debut_i: z.debut_i, fin_i: z.fin_i, debut_dist: z.debut_dist,
                                 fin_dist: z.fin_dist, longueur_m: z.longueur_m, raison: 'contre_pente' });
                }
            });
            zones.sort(function (a, b) { return a.debut_i - b.debut_i; });
            return zones;
        },

        // Repères du projet situés à moins de `seuilM` mètres du tracé :
        // → [{ouvrage, dist_m, dist_cumulee_m, index_point}].
        reperesSurTrace: function (coords, ouvrages, seuilM) {
            var out = [];
            seuilM = seuilM || 100;
            (ouvrages || []).forEach(function (o) {
                if (o.type !== 'repere') return;
                var meilleur = null;
                for (var i = 0; i < (coords || []).length; i++) {
                    var c = coords[i];
                    var d = CORE.distance(o.latitude, o.longitude, c[1], c[0]);
                    if (!meilleur || d < meilleur.dist) {
                        meilleur = { dist: d, index: i };
                    }
                }
                if (meilleur && meilleur.dist <= seuilM) {
                    var cum = 0;
                    for (var i = 1; i <= meilleur.index; i++) {
                        cum += CORE.distanceCoord(coords[i - 1], coords[i]);
                    }
                    out.push({
                        ouvrage: o,
                        dist_m: Math.round(meilleur.dist),
                        dist_cumulee_m: Math.round(cum),
                        index_point: meilleur.index
                    });
                }
            });
            out.sort(function (a, b) { return a.dist_cumulee_m - b.dist_cumulee_m; });
            return out;
        },

        // ── ANALYSE SYSTÈME SOURCE → VILLAGE ────────────────────────
        // Synthèse hydraulique d'un système source/village/points de
        // consommation : distance, dénivelé, altitudes, longueur du
        // tracé (trace optionnelle), pente moyenne, point haut/bas.
        analyserSysteme: function (source, village, conso, trace) {
            if (!source || !village) return null;
            var res = {
                valide: true,
                distance_m: 0,
                denivele_net_m: null,
                denivele_total_m: null,
                altitude_source_m: null,
                altitude_village_m: null,
                bornes: { count: 0, min: null, max: null, moy: null },
                longueur_m: 0,
                pente_moyenne_pct: null,
                point_haut_m: null,
                point_bas_m: null
            };
            res.distance_m = CORE.distance(source.latitude, source.longitude,
                                           village.latitude, village.longitude);
            if (source.altitude_m != null) res.altitude_source_m = Number(source.altitude_m);
            if (village.altitude_m != null) res.altitude_village_m = Number(village.altitude_m);
            if (res.altitude_source_m != null && res.altitude_village_m != null) {
                res.denivele_net_m = Math.round((res.altitude_village_m - res.altitude_source_m) * 10) / 10;
                res.denivele_total_m = Math.abs(res.denivele_net_m);
            }
            var alts = [];
            if (res.altitude_source_m != null) alts.push(res.altitude_source_m);
            if (res.altitude_village_m != null) alts.push(res.altitude_village_m);
            (conso || []).forEach(function (o) {
                if (o.altitude_m == null) return;
                var a = Number(o.altitude_m);
                res.bornes.count += 1;
                if (res.bornes.min == null || a < res.bornes.min) res.bornes.min = a;
                if (res.bornes.max == null || a > res.bornes.max) res.bornes.max = a;
                res.bornes.moy = (res.bornes.moy || 0) + a;
                alts.push(a);
            });
            if (res.bornes.count) res.bornes.moy = Math.round(res.bornes.moy / res.bornes.count);
            var coords = trace && trace.coordonnees && trace.coordonnees.length > 1
                ? trace.coordonnees : null;
            var longueurTrace = coords ? CORE.longueurTrace(coords) : 0;
            res.longueur_m = longueurTrace > 0 ? longueurTrace : res.distance_m;
            (coords || []).forEach(function (c) {
                if (c[2] == null) return;
                alts.push(Number(c[2]));
            });
            if (res.denivele_net_m != null && res.longueur_m > 0) {
                res.pente_moyenne_pct = Math.round((res.denivele_net_m / res.longueur_m) * 1000) / 10;
            }
            if (alts.length) {
                res.point_haut_m = Math.round(Math.max.apply(null, alts));
                res.point_bas_m = Math.round(Math.min.apply(null, alts));
            }
            res.distance_m = Math.round(res.distance_m);
            res.longueur_m = Math.round(res.longueur_m);
            return res;
        },

        // Altitudes min/max d'une liste d'ouvrages.
        plageAltitudes: function (ouvrages) {
            var alts = [];
            (ouvrages || []).forEach(function (o) {
                if (o.altitude_m != null) alts.push(Number(o.altitude_m));
            });
            if (!alts.length) return null;
            return { min: Math.min.apply(null, alts), max: Math.max.apply(null, alts) };
        },

        // Écart d'altitude absolu entre deux ouvrages (m).
        differenceAltitude: function (a, b) {
            if (a.altitude_m == null || b.altitude_m == null) return null;
            return Math.abs(Number(a.altitude_m) - Number(b.altitude_m));
        },

        // Distance max entre toute paire d'ouvrages (m).
        distanceMax: function (ouvrages) {
            var dmax = 0;
            for (var i = 0; i < ouvrages.length; i++) {
                for (var j = i + 1; j < ouvrages.length; j++) {
                    var d = CORE.distance(ouvrages[i].latitude, ouvrages[i].longitude,
                        ouvrages[j].latitude, ouvrages[j].longitude);
                    if (d > dmax) dmax = d;
                }
            }
            return dmax;
        },

        // Ouvrages → GeoJSON FeatureCollection.
        ouvragesGeoJSON: function (ouvrages) {
            return {
                type: 'FeatureCollection',
                features: (ouvrages || []).map(function (o) {
                    return {
                        type: 'Feature',
                        properties: {
                            id: o.id, type: o.type, nom: o.nom, statut: o.statut,
                            altitude_m: o.altitude_m, beneficiaires: o.beneficiaires,
                            emoji: CORE.emojiOuvrage(o.type, o.sous_type)
                        },
                        geometry: { type: 'Point', coordinates: [o.longitude, o.latitude] }
                    };
                })
            };
        },

        // Trace → Feature LineString.
        traceGeoJSON: function (coords, props) {
            return {
                type: 'Feature', properties: props || {},
                geometry: { type: 'LineString', coordinates: (coords || []).map(function (c) { return [c[0], c[1]]; }) }
            };
        },

        // Contour fermé → Feature Polygon (ajoute la fermeture si absente).
        polygoneGeoJSON: function (contour, props) {
            var anneau = (contour || []).map(function (c) { return [c[0], c[1]]; });
            if (anneau.length >= 3) {
                var premier = anneau[0];
                var dernier = anneau[anneau.length - 1];
                if (premier[0] !== dernier[0] || premier[1] !== dernier[1]) anneau.push(premier);
            }
            return {
                type: 'Feature', properties: props || {},
                geometry: { type: 'Polygon', coordinates: [anneau] }
            };
        },

        // Ouvrages → CSV (séparateur ;).
        ouvragesCSV: function (ouvrages) {
            var lignes = ['id;type;nom;latitude;longitude;altitude_m;beneficiaires;statut;description'];
            (ouvrages || []).forEach(function (o) {
                lignes.push([
                    o.id, o.type,
                    '"' + String(o.nom || '').replace(/"/g, '""') + '"',
                    o.latitude, o.longitude,
                    o.altitude_m != null ? o.altitude_m : '',
                    o.beneficiaires || 0, o.statut || '',
                    '"' + String(o.description || '').replace(/"/g, '""') + '"'
                ].join(';'));
            });
            return lignes.join('\n');
        },

        // Rapport de terrain synthétique (lignes de texte).
        rapportTerrain: function (projet, ouvrages, traces) {
            var L = [];
            L.push('RAPPORT DE TERRAIN — ADDUCTION D\'EAU');
            L.push('═'.repeat(48));
            L.push('Projet : ' + (projet.nom || '—'));
            if (projet.commanditaire) L.push('Commanditaire : ' + projet.commanditaire);
            if (projet.zone_nom) L.push('Zone : ' + projet.zone_nom);
            L.push('Statut : ' + (projet.statut_label || projet.statut || '—'));
            if (projet.observations) L.push('Observations : ' + projet.observations);
            L.push('');
            L.push('OUVRAGES RELEVÉS (' + (ouvrages || []).length + ')');
            L.push('─'.repeat(48));
            (ouvrages || []).forEach(function (o) {
                var t = TYPES[o.type] || {};
                L.push('• ' + (t.label || o.type).toUpperCase() + ' : ' + (o.nom || '—'));
                L.push('    ' + String(o.latitude).slice(0, 10) + ', ' + String(o.longitude).slice(0, 10) +
                    (o.altitude_m != null ? ' — alt ' + Math.round(o.altitude_m) + ' m' : '') +
                    (o.beneficiaires ? ' — bénéf. ' + o.beneficiaires : ''));
                if (o.observations) L.push('    Obs : ' + o.observations);
            });
            L.push('');
            L.push('TRACÉS DE CONDUITES (' + (traces || []).length + ')');
            L.push('─'.repeat(48));
            (traces || []).forEach(function (t) {
                L.push('• ' + (t.nom || 'Tracé #' + t.id) + ' — ' + Math.round(t.longueur_m || 0) +
                    ' m, déniv. +' + Math.round(t.denivelee_m || 0) + ' m');
            });
            L.push('');
            L.push('GÉNÉRÉ PAR MUKMAP · WATER SUPPLY SURVEY');
            return L.join('\n');
        }
    };

    // =============================================================
    // INSTALLEUR DOM (panneau flottant)
    // =============================================================
    function demarrer(opts) {
        opts = opts || {};
        var carte = opts.carte || (typeof window !== 'undefined' ? window.map : null);
        if (!carte || typeof document === 'undefined') return null;

        var apiProjets = opts.urlProjets || '/api/adduction/projets/';
        var apiOuvrages = opts.urlOuvrages || '/api/adduction/ouvrages/';
        var apiTraces = opts.urlTraces || '/api/adduction/traces/';
        var apiReferentiels = opts.urlReferentiels || '/api/adduction/referentiels/';
        var csrf = opts.csrf || (function () {
            try { var m = document.cookie.match(/csrftoken=([^;]+)/); return m ? m[1] : ''; } catch (e) { return ''; }
        })();

        function trad(cle, defaut) {
            return (window && window.mukmapT && window.mukmapT(cle)) || defaut || cle;
        }
        function formatDist(m) {
            if (m == null || isNaN(m)) return '—';
            return m >= 1000 ? (Math.round(m / 100) / 10) + ' km' : Math.round(m) + ' m';
        }
        function toF(v) {
            var n = parseFloat(v);
            return isNaN(n) ? null : n;
        }
        function ex(s) { // échappement XML/HTML minimal
            return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }
        function remplirSelect(sel, liste) { // liste : [{id, label}, …]
            if (!sel) return;
            sel.innerHTML = '<option value="">…</option>';
            (liste || []).forEach(function (it) {
                var o = document.createElement('option');
                o.value = it.id;
                o.textContent = trad(it.label, it.label);
                sel.appendChild(o);
            });
        }

        var projetActif = null;
        var ouvrages = [];
        var traces = [];

        // ── DOM ──
        var panneau = document.createElement('div');
        panneau.className = 'mukmap-water';
        panneau.innerHTML =
            '<div class="mw-tete">' + trad('water_titre', 'Adduction d\'eau · Water Supply') +
            '<button type="button" class="mw-fermer" title="Fermer">✕</button></div>' +
            '<div class="mw-onglets">' +
            '<button type="button" data-tab="projet" class="actif">Projet</button>' +
            '<button type="button" data-tab="collecte">Collecte</button>' +
        '<button type="button" data-tab="trace">Conduites</button>' +
        '<button type="button" data-tab="reseau">Réseau</button>' +
        '<button type="button" data-tab="analyse">Analyse</button>' +
        '<button type="button" data-tab="mesures">Mesures</button>' +
            '<button type="button" data-tab="rapport">Rapport</button>' +
            '</div>' +
            '<div class="mw-contenu">' +
            '<div data-panel="projet">' +
            '<div class="mw-ligne"><select id="mw-projets"></select></div>' +
            '<div class="mw-boutons"><button type="button" id="mw-nv-projet">＋ Nouveau projet</button>' +
            '<button type="button" id="mw-recharge">⟳ Recharger</button></div>' +
            '<div class="mw-champs" id="mw-champs-projet" hidden>' +
            '<input type="text" id="mw-p-nom" placeholder="Nom du projet">' +
            '<input type="text" id="mw-p-zone" placeholder="Zone d\'intervention (ex : Irumu)">' +
            '<input type="text" id="mw-p-com" placeholder="Commanditaire">' +
            '<textarea id="mw-p-desc" rows="2" placeholder="Description / observations"></textarea>' +
            '<div class="mw-boutons"><button type="button" id="mw-enreg-projet">💾 Enregistrer</button>' +
            '<button type="button" id="mw-suppr-projet">🗑 Supprimer</button></div></div>' +
            '<div class="mw-liste" id="mw-stat-projet"></div>' +
            '</div>' +
            '<div data-panel="collecte" hidden>' +
            '<p class="mw-indice">Type + clique sur la carte (ou 📡 GPS), puis Ajouter.</p>' +
            '<div class="mw-champs">' +
            '<select id="mw-type"></select>' +
            '<select id="mw-sous-type" hidden></select>' +
            '<div class="mw-deux"><input type="text" id="mw-province" placeholder="Province">' +
            '<input type="text" id="mw-territoire" placeholder="Territoire"></div>' +
            '<div class="mw-deux"><input type="text" id="mw-secteur" placeholder="Secteur / Chefferie">' +
            '<input type="text" id="mw-localite" placeholder="Localité"></div>' +
            '<div class="mw-deux"><input type="text" id="mw-village" placeholder="Village">' +
            '<input type="text" id="mw-agent" placeholder="Agent enquêteur"></div>' +
            '<div class="mw-deux"><input type="text" id="mw-organisation" placeholder="Organisation">' +
            '<input type="text" id="mw-code-projet" placeholder="Code du projet"></div>' +
            '<select id="mw-repr" hidden>' +
            '<option value="point">📍 Point</option>' +
            '<option value="polygone">🔷 Polygone</option>' +
            '<option value="zone">🌐 Zone d\'intervention</option></select>' +
            '<div class="mw-boutons" id="mw-poly-actions" hidden>' +
            '<button type="button" id="mw-tracer-poly">✏️ Tracer le contour</button>' +
            '<button type="button" id="mw-fin-poly" hidden>✅ Terminer</button>' +
            '<button type="button" id="mw-ann-poly" hidden>🗑 Annuler</button></div>' +
            '<div class="mw-ligne" id="mw-poly-info" hidden><span>Contour</span><b id="mw-poly-nb">—</b></div>' +
            '<div class="mw-ligne" id="mw-ligne-id"><span>ID</span><b id="mw-id">—</b></div>' +
            '<input type="text" id="mw-nom" placeholder="Nom / localisation">' +
            '<div class="mw-deux"><input type="number" id="mw-alt" step="0.1" placeholder="Altitude (m)">' +
            '<input type="number" id="mw-benef" min="0" placeholder="Bénéficiaires"></div>' +
            '<div class="mw-deux"><input type="number" id="mw-lat" step="any" placeholder="Latitude">' +
            '<input type="number" id="mw-lon" step="any" placeholder="Longitude"></div>' +
            '<div id="mw-form-village" hidden>' +
            '<div class="mw-deux"><input type="number" id="mw-v-pop" min="0" placeholder="Population">' +
            '<input type="number" id="mw-v-menages" min="0" placeholder="Ménages"></div>' +
            '<div class="mw-deux"><input type="number" id="mw-v-cible" min="0" placeholder="Population cible">' +
            '<input type="number" id="mw-v-benef" min="0" placeholder="Bénéficiaires estimés"></div>' +
            '<div class="mw-deux"><input type="number" id="mw-v-ecoles" min="0" placeholder="Écoles">' +
            '<input type="number" id="mw-v-sante" min="0" placeholder="Centres de santé"></div>' +
            '<input type="text" id="mw-v-autres" placeholder="Autres institutions">' +
            '<div class="mw-deux"><select id="mw-v-source"><option value="">Source d\'eau actuelle…</option></select>' +
            '<input type="number" id="mw-v-dist" min="0" placeholder="Dist. source (m)"></div>' +
            '<select id="mw-v-situation"><option value="">Situation accès à l\'eau…</option></select>' +
            '</div>' +
            '<div id="mw-form-source" hidden>' +
            '<div class="mw-deux"><input type="number" id="mw-s-debit" min="0" step="0.01" placeholder="Débit mesuré">' +
            '<select id="mw-s-debit-unite"><option value="">Unité…</option><option value="l_s">l/s</option><option value="m3_h">m³/h</option></select></div>' +
            '<div class="mw-deux"><input type="number" id="mw-s-methode" step="0.01" min="0" placeholder="Niveau d\'eau (m)">' +
            '<input type="number" id="mw-s-profond" step="0.01" min="0" placeholder="Profondeur (m)"></div>' +
            '<div class="mw-deux"><input type="number" id="mw-s-saison-seche" step="0.01" min="0" placeholder="Débit saison sèche (l/s)">' +
            '<input type="number" id="mw-s-saison-pluies" step="0.01" min="0" placeholder="Débit saison pluies (l/s)"></div>' +
            '<div class="mw-deux"><select id="mw-s-access"><option value="">Accessibilité…</option>' +
            '<option value="facile">Facile</option><option value="difficile">Difficile</option><option value="tres_difficile">Très difficile</option></select>' +
            '<select id="mw-s-etat"><option value="">État…</option><option value="bon">Bon</option><option value="moyen">Moyen</option><option value="degrade">Dégradé</option></select></div>' +
            '<div class="mw-deux"><select id="mw-s-permanence"><option value="">Permanence…</option>' +
            '<option value="permanente">Permanente</option><option value="saisonniere">Saisonnière</option><option value="intermittente">Intermittente</option></select>' +
            '<select id="mw-s-protection"><option value="">Protection…</option><option value="protegee">Protégée</option><option value="non_protegee">Non protégée</option></select></div>' +
            '<div class="mw-deux"><input type="number" id="mw-s-dist-village" min="0" placeholder="Dist. village (m)">' +
            '<input type="number" id="mw-s-dist-conso" min="0" placeholder="Dist. consommation (m)"></div>' +
            '<div class="mw-ligne" id="mw-s-qualite-titre"><span>Qualité de l\'eau (indicative)</span></div>' +
            '<div class="mw-deux"><input type="number" id="mw-s-ph" step="0.1" placeholder="pH">' +
            '<input type="number" id="mw-s-turb" step="0.1" min="0" placeholder="Turbidité (NTU)"></div>' +
            '<div class="mw-deux"><input type="number" id="mw-s-cond" step="0.1" min="0" placeholder="Conductivité (µS/cm)">' +
            '<input type="number" id="mw-s-temp" step="0.1" placeholder="Température (°C)"></div>' +
            '<div class="mw-deux"><input type="number" id="mw-s-chlore" step="0.01" min="0" placeholder="Chlore résiduel (mg/l)">' +
            '<input type="text" id="mw-s-code-ech" placeholder="Code échantillon"></div>' +
            '<input type="text" id="mw-s-microbio" placeholder="Résultats microbiologiques">' +
            '<input type="text" id="mw-s-obs-qualite" placeholder="Observations qualité">' +
            '<p class="mw-avertissement" id="mw-s-avertissement" hidden>⚠️ Mesures indicatives — analyse de laboratoire nécessaire pour certifier la potabilité.</p>' +
            '</div>' +
            '<div id="mw-form-consommation" hidden>' +
            '<div class="mw-deux"><input type="number" id="mw-c-pop" min="0" placeholder="Population desservie">' +
            '<input type="number" id="mw-c-menages" min="0" placeholder="Ménages desservis"></div>' +
            '<div class="mw-deux"><input type="number" id="mw-c-robinets" min="0" placeholder="Nombre de robinets">' +
            '<select id="mw-c-etat"><option value="">État…</option><option value="bon">Bon</option><option value="moyen">Moyen</option><option value="mauvais">Mauvais</option><option value="hors_service">Hors service</option></select></div>' +
            '<div class="mw-deux"><select id="mw-c-existant"><option value="">Existant / proposé…</option>' +
            '<option value="existant">Existant</option><option value="propose">Proposé</option></select>' +
            '<input type="number" id="mw-c-debit" step="0.01" min="0" placeholder="Débit estimé (l/s)"></div>' +
            '<input type="number" id="mw-c-besoin" step="0.1" min="0" placeholder="Besoin estimé (m³/j)">' +
            '<input type="file" id="mw-c-photos" accept="image/*" multiple>' +
            '<div class="mw-ligne" id="mw-c-photos-apercu" hidden><b id="mw-c-photos-nb">0 photo</b></div>' +
            '</div>' +
            '<div id="mw-form-repere" hidden>' +
            '<input type="text" id="mw-r-description" placeholder="Description du repère">' +
            '<div class="mw-deux"><input type="date" id="mw-r-date">' +
            '<input type="file" id="mw-r-photo" accept="image/*"></div>' +
            '<div class="mw-ligne" id="mw-r-photo-apercu" hidden><b id="mw-r-photo-nb">Photo prise</b></div>' +
            '</div>' +
            '<div id="mw-form-reservoir" hidden>' +
            '<div class="mw-deux"><input type="number" id="mw-rv-capacite" step="1" min="0" placeholder="Capacité (m³)">' +
            '<input type="number" id="mw-rv-niveau" step="0.01" min="0" placeholder="Niveau d\'eau (m)"></div>' +
            '<div class="mw-deux"><select id="mw-rv-etat"><option value="">État…</option><option value="bon">Bon</option>' +
            '<option value="moyen">Moyen</option><option value="mauvais">Mauvais</option><option value="hors_service">Hors service</option></select>' +
            '<select id="mw-rv-existant"><option value="">Existant / proposé…</option><option value="existant">Existant</option>' +
            '<option value="propose">Proposé</option></select></div>' +
            '<input type="file" id="mw-rv-photos" accept="image/*" multiple>' +
            '<div class="mw-ligne" id="mw-rv-photos-apercu" hidden><b id="mw-rv-photos-nb">0 photo</b></div>' +
            '</div>' +
            '<input type="text" id="mw-carac" placeholder="Caract. tech. (ex : débit 1,2 l/s)">' +
            '<textarea id="mw-obs" rows="2" placeholder="Observations de terrain"></textarea>' +
            '<div class="mw-boutons"><button type="button" id="mw-pick-gps">📡 GPS</button>' +
            '<button type="button" id="mw-ajouter">➕ Ajouter</button>' +
            '<button type="button" id="mw-maj-ouvrage" hidden>💾 Modifier</button>' +
            '<button type="button" id="mw-supp-ouvrage" hidden>🗑️ Supprimer</button></div></div>' +
            '<div class="mw-liste" id="mw-liste-ouvrages"></div>' +
            '</div>' +
            '<div data-panel="trace" hidden>' +
            '<p class="mw-indice">Cliquez la carte pour poser les points source → borne.</p>' +
            '<div class="mw-boutons">' +
            '<button type="button" id="mw-nv-trace">✏️ Commencer un tracé</button>' +
            '<button type="button" id="mw-fin-trace" hidden>✅ Terminer</button>' +
            '<button type="button" id="mw-ann-trace" hidden>🗑 Annuler</button></div>' +
            '<div class="mw-ligne"><span>Longueur</span><b id="mw-len">—</b></div>' +
            '<div class="mw-ligne"><span>Dénivelé cumulé +</span><b id="mw-den">—</b></div>' +
            '<div class="mw-ligne"><span>Pente moyenne</span><b id="mw-pente">—</b></div>' +
            '<div class="mw-gps-blok">' +
            '<div class="mw-boutons">' +
            '<button type="button" id="mw-gps-trace">🎥 Enregistrer le tracé (GPS)</button></div>' +
            '<div class="mw-gps-actions" id="mw-gps-actions" hidden>' +
            '<button type="button" id="mw-pause-trace">⏸ Pause</button>' +
            '<button type="button" id="mw-rep-trace" hidden>▶️ Reprendre</button>' +
            '<button type="button" id="mw-fin-gps">✅ Terminer</button>' +
            '<button type="button" id="mw-ann-gps">🗑 Annuler</button></div>' +
            '<div class="mw-gps-etat" id="mw-gps-etat" hidden><b id="mw-gps-etat-txt">● Enregistrement…</b></div>' +
            '<div id="mw-gps-stats" hidden>' +
            '<div class="mw-ligne"><span>Points GPS</span><b id="mw-gs-points">0</b></div>' +
            '<div class="mw-ligne"><span>Durée</span><b id="mw-gs-duree">—</b></div>' +
            '<div class="mw-ligne"><span>Longueur totale</span><b id="mw-gs-long">—</b></div>' +
            '<div class="mw-ligne"><span>Distance horizontale</span><b id="mw-gs-horiz">—</b></div>' +
            '<div class="mw-ligne"><span>Altitude min / max</span><b id="mw-gs-alt">—</b></div>' +
            '<div class="mw-ligne"><span>Dénivelé + / −</span><b id="mw-gs-den">—</b></div>' +
            '<div class="mw-ligne"><span>Pente moy. / max.</span><b id="mw-gs-pente">—</b></div>' +
            '</div></div>' +
            '<div class="mw-ligne"><span>Nom</span><input type="text" id="mw-nom-trace" placeholder="Ex : conduite principale"></div>' +
            '<div class="mw-liste" id="mw-liste-traces"></div>' +
            '</div>' +
            '<div data-panel="reseau" hidden>' +
            '<p class="mw-indice">Construisez le réseau : SOURCE → CAPTAGE → CONDUITE → RÉSERVOIR → CONDUITE → BORNE-FONTAINE.</p>' +
            '<div class="mw-liste" id="mw-reseau-chaine"></div>' +
            '<div class="mw-gps-blok">' +
            '<div class="mw-ligne"><span>🔗 CONSTRUIRE UNE CONDUITE</span></div>' +
            '<p class="mw-indice">Cliquez sur les ouvrages (ou la carte) dans l\'ordre : les points sont reliés automatiquement.</p>' +
            '<div class="mw-boutons">' +
            '<button type="button" id="mw-rs-relier">🔗 Relier les ouvrages</button>' +
            '<button type="button" id="mw-rs-fin" hidden>✅ Enregistrer la conduite</button>' +
            '<button type="button" id="mw-rs-ann" hidden>🗑 Annuler</button></div>' +
            '<div class="mw-ligne"><span>Longueur</span><b id="mw-rs-len">—</b></div>' +
            '<div class="mw-ligne"><span>Ouvrages reliés</span><b id="mw-rs-nb">0</b></div>' +
            '<div class="mw-liste" id="mw-rs-liste"></div>' +
            '<div class="mw-ligne"><span>Nom</span><input type="text" id="mw-rs-nom" placeholder="Conduite du réseau"></div>' +
            '</div>' +
            '<div class="mw-gps-blok">' +
            '<div class="mw-ligne"><span>🏗 OUVRAGES DU RÉSEAU</span></div>' +
            '<div class="mw-ligne"><span>Filtre</span><select id="mw-rs-filtre"></select></div>' +
            '<div class="mw-liste" id="mw-rs-ouvrages"></div>' +
            '</div>' +
            '<div class="mw-gps-blok">' +
            '<div class="mw-ligne"><span>🔺 SITES POTENTIELS DE RÉSERVOIR</span></div>' +
            '<p class="mw-indice">Points hauts repérés (repères point haut / sommet / colline) et points culminants des tracés, classés par altitude.</p>' +
            '<p class="mw-avertissement">⚠️ Sites potentiels à étudier : cette liste ne constitue pas une validation hydraulique définitive. Une étude de terrain (nivellement, étude de sol, hydraulique) est requise avant toute implantation.</p>' +
            '<div class="mw-liste" id="mw-sites-reservoir"></div>' +
            '</div>' +
            '<div class="mw-gps-blok">' +
            '<div class="mw-ligne"><span>🚰 RÉSEAU D\'ADDUCTION</span></div>' +
            '<div class="mw-liste" id="mw-reseau-equipements"></div>' +
            '</div>' +
            '</div>' +
            '<div data-panel="analyse" hidden>' +
            '<div class="mw-ligne"><span>Altitude min</span><b id="mw-alt-min">—</b></div>' +
            '<div class="mw-ligne"><span>Altitude max</span><b id="mw-alt-max">—</b></div>' +
            '<div class="mw-ligne"><span>Différence d\'altitude</span><b id="mw-alt-diff">—</b></div>' +
            '<div class="mw-ligne"><span>Distance max (enveloppe)</span><b id="mw-dist-max">—</b></div>' +
            '<div class="mw-ligne"><span>Longueur conduites</span><b id="mw-long-gp">—</b></div>' +
            '<div class="mw-ligne"><span>Bénéficiaires totaux</span><b id="mw-benef-gp">—</b></div>' +
            '<div class="mw-ligne"><span>Ouvrages</span><b id="mw-nb-ouv">—</b></div>' +
            '<canvas id="mw-chart" width="280" height="90"></canvas>' +
            '<div class="mw-gps-blok">' +
            '<div class="mw-ligne"><span>📈 PROFIL EN LONG</span><select id="mw-profil-trace">' +
            '<option value="">— Choisir une trace —</option></select></div>' +
            '<canvas id="mw-profil-canvas" width="560" height="240"></canvas>' +
            '<div class="mw-ligne" id="mw-profil-info"><span>Survolez le profil</span><b>—</b></div>' +
            '<div class="mw-liste" id="mw-profil-analyse"></div>' +
            '<div class="mw-boutons">' +
            '<button type="button" id="mw-export-png">🖼 Export image (PNG)</button>' +
            '<button type="button" id="mw-export-pdf">📄 Export PDF</button></div>' +
            '</div>' +
            '<div class="mw-gps-blok">' +
            '<div class="mw-ligne"><span>🔍 ANALYSER LE SYSTÈME</span></div>' +
            '<div class="mw-ligne"><span>Source</span><select id="mw-sys-source">' +
            '<option value="">— Choisir une source —</option></select></div>' +
            '<div class="mw-ligne"><span>Village</span><select id="mw-sys-village">' +
            '<option value="">— Choisir un village —</option></select></div>' +
            '<div class="mw-ligne"><span>Points de consommation</span>' +
            '<select id="mw-sys-conso" multiple size="3">' +
            '<option value="">— Aucun —</option></select></div>' +
            '<div class="mw-ligne"><span>Tracé (optionnel)</span><select id="mw-sys-trace">' +
            '<option value="">— Distance directe —</option></select></div>' +
            '<div class="mw-boutons">' +
            '<button type="button" id="mw-sys-analyser">🔍 Analyser</button></div>' +
            '<div class="mw-liste" id="mw-sys-resultat"></div>' +
            '</div>' +
            '</div>' +
            '<div data-panel="mesures" hidden>' +
            '<p class="mw-indice">Boîte à outils de mesures terrain : distances, surfaces, dénivelés et pentes.</p>' +
            '<div class="mw-gps-blok">' +
            '<div class="mw-ligne"><span>📏 DISTANCE</span></div>' +
            '<div class="mw-deux"><select id="mw-ms-a"></select><select id="mw-ms-b"></select></div>' +
            '<div class="mw-boutons">' +
            '<button type="button" data-preset="source_village">Source → village</button>' +
            '<button type="button" data-preset="source_reservoir">Source → réservoir</button>' +
            '<button type="button" data-preset="reservoir_borne">Réservoir → borne</button></div>' +
            '<div class="mw-boutons">' +
            '<button type="button" id="mw-ms-clic">📌 Mesurer sur la carte</button></div>' +
            '<div class="mw-ligne"><span>Distance A → B</span><b id="mw-ms-dist">—</b></div>' +
            '</div>' +
            '<div class="mw-gps-blok">' +
            '<div class="mw-ligne"><span>🔺 SURFACE</span></div>' +
            '<div class="mw-deux"><select id="mw-ms-type">' +
            '<option value="village">Zone du village</option>' +
            '<option value="emprise">Emprise du projet</option>' +
            '<option value="intervention">Zone d\'intervention</option>' +
            '<option value="bassin">Bassin versant approximatif</option></select>' +
            '<select id="mw-ms-obj"></select></div>' +
            '<div class="mw-ligne" id="mw-ms-rayon-ligne"><span>Rayon (km)</span>' +
            '<input type="number" id="mw-ms-rayon" min="0.1" step="0.1" value="2"></div>' +
            '<div class="mw-boutons"><button type="button" id="mw-ms-calculer">🧮 Calculer</button></div>' +
            '<div class="mw-ligne"><span>Surface</span><b id="mw-ms-aire">—</b></div>' +
            '<p class="mw-indice" id="mw-ms-surf-info"></p>' +
            '<p class="mw-avertissement" id="mw-ms-bassin-avert" hidden>⚠️ Bassin versant APPROXIMATIF : enveloppe convexe des points de terrain relevés (plus élevés, à moins de R km). Une délimitation précise exige un modèle numérique de terrain (MNT).</p>' +
            '</div>' +
            '<div class="mw-gps-blok">' +
            '<div class="mw-ligne"><span>⛰ DÉNIVELÉ (A → B)</span></div>' +
            '<div class="mw-ligne"><span>Altitude A</span><b id="mw-ms-alt-a">—</b></div>' +
            '<div class="mw-ligne"><span>Altitude B</span><b id="mw-ms-alt-b">—</b></div>' +
            '<div class="mw-ligne"><span>Différence</span><b id="mw-ms-alt-d">—</b></div>' +
            '</div>' +
            '<div class="mw-gps-blok">' +
            '<div class="mw-ligne"><span>📈 PENTE</span></div>' +
            '<div class="mw-ligne"><span>Pente A → B</span><b id="mw-ms-pente">—</b></div>' +
            '<div class="mw-ligne"><span>Le long d\'une conduite</span><select id="mw-ms-trace"></select></div>' +
            '<div class="mw-liste" id="mw-ms-pente-trace"></div>' +
            '</div>' +
            '</div>' +
            '<div data-panel="rapport" hidden>' +
            '<div class="mw-boutons"><button type="button" id="mw-gen-rapport">📄 Générer le rapport</button></div>' +
            '<textarea id="mw-rapport" rows="8" readonly placeholder="Rapport de terrain…"></textarea>' +
            '<div class="mw-boutons"><button type="button" id="mw-exp-json">GeoJSON</button>' +
            '<button type="button" id="mw-exp-csv">CSV</button>' +
            '<button type="button" id="mw-exp-gpx">GPX</button></div>' +
            '</div>' +
            '</div>' +
            '<div class="mw-msg"></div>';

        document.body.appendChild(panneau);

        var style = document.createElement('style');
        style.textContent =
            '.mukmap-water{position:fixed;right:20px;top:70px;z-index:1150;width:342px;border-radius:12px;' +
            'border:1px solid var(--border,#3d4060);background:color-mix(in srgb,var(--bg-1,#1a1b2e) 96%,transparent);' +
            'backdrop-filter:blur(10px);box-shadow:0 10px 30px rgba(0,0,0,.35);overflow:hidden;' +
            'display:flex;flex-direction:column;max-height:82vh;}' +
            '.mw-tete{padding:10px 14px;font-weight:800;font-size:.85rem;display:flex;justify-content:space-between;' +
            'background:rgba(6,182,212,.12);border-bottom:1px solid var(--border,#3d4060);color:#22d3ee;}' +
            '.mw-fermer{border:0;background:transparent;color:var(--text-2,#a0a3c2);cursor:pointer;font-size:.9rem;}' +
            '.mw-onglets{display:flex;gap:4px;padding:8px 10px 0;flex-wrap:wrap;}' +
            '.mw-onglets button{border:1px solid var(--border,#3d4060);background:rgba(255,255,255,.04);' +
            'color:var(--text-2,#a0a3c2);border-radius:20px;padding:4px 10px;font-size:.72rem;font-weight:700;cursor:pointer;}' +
            '.mw-onglets button.actif{background:rgba(6,182,212,.16);border-color:#22d3ee;color:#22d3ee;}' +
            '.mw-contenu{padding:8px 12px 4px;overflow:auto;flex:1;}' +
            '.mw-indice{font-size:.72rem;color:var(--text-2,#a0a3c2);margin:0 0 6px;}' +
            '.mw-ligne{display:flex;justify-content:space-between;gap:8px;font-size:.8rem;' +
            'color:var(--text-2,#a0a3c2);align-items:center;padding:2px 0;}' +
            '.mw-ligne b,.mw-ligne input,.mw-ligne select{color:var(--text,#e8e9f3);font-weight:700;text-align:right;}' +
            '.mw-ligne input{width:130px;text-align:left;}' +
            '.mw-champs{display:flex;flex-direction:column;gap:6px;padding:6px 0;}' +
            '.mw-champs input,.mw-champs select,.mw-champs textarea{width:100%;box-sizing:border-box;' +
            'background:rgba(255,255,255,.05);border:1px solid var(--border,#3d4060);border-radius:6px;' +
            'padding:5px 8px;color:var(--text,#e8e9f3);font-size:.8rem;}' +
            '.mw-deux{display:flex;gap:6px;}.mw-deux input{flex:1;}' +
            '.mw-boutons{display:flex;gap:6px;flex-wrap:wrap;padding:6px 0;}' +
            '.mw-boutons button{flex:1;min-width:70px;padding:6px 8px;border-radius:8px;' +
            'border:1px solid var(--border,#3d4060);background:rgba(255,255,255,.05);color:var(--text,#e8e9f3);' +
            'font-size:.73rem;font-weight:700;cursor:pointer;}' +
            '.mw-liste{margin-top:6px;max-height:160px;overflow:auto;font-size:.72rem;color:var(--text-2,#a0a3c2);}' +
            '.mw-liste .i{display:flex;justify-content:space-between;gap:6px;padding:3px 4px;border-radius:6px;cursor:pointer;}' +
            '.mw-liste .i:hover{background:rgba(6,182,212,.1);}' +
            '.mw-gps-blok{border-top:1px dashed var(--border,#3d4060);margin-top:6px;padding-top:4px;}' +
            '.mw-avertissement{font-size:.7rem;color:#fbbf24;background:rgba(251,191,36,.08);' +
            'border:1px dashed rgba(251,191,36,.4);border-radius:6px;padding:4px 6px;margin:4px 0;}' +
            '.mw-sys-table{width:100%;border-collapse:collapse;font-size:.74rem;margin-top:4px;}' +
            '.mw-sys-table th,.mw-sys-table td{border-bottom:1px solid var(--border,#3d4060);padding:3px 4px;text-align:left;}' +
            '.mw-sys-table th{color:#22d3ee;font-size:.7rem;font-weight:800;}' +
            '.mw-sys-table td:last-child{text-align:right;color:var(--text,#e8e9f3);font-weight:700;}' +
            '.mw-gps-etat{font-size:.74rem;font-weight:800;padding:3px 0;}' +
            '.mw-gps-actions button{background:rgba(34,197,94,.1);border-color:#22c55e;color:#4ade80;}' +
            '.mw-gps-actions #mw-fin-gps{background:rgba(6,182,212,.16);border-color:#22d3ee;color:#22d3ee;}' +
            '.mw-msg{padding:4px 12px 10px;font-size:.78rem;color:var(--text-2,#a0a3c2);min-height:16px;}';
        (document.head || document.documentElement).appendChild(style);

        function parId(id) { return panneau.querySelector('#' + id); }
        function message(t, type) {
            var el = panneau.querySelector('.mw-msg');
            if (!el) return;
            el.textContent = t;
            el.className = 'mw-msg ' + (type || 'info');
            clearTimeout(el._t);
            el._t = setTimeout(function () { el.textContent = ''; }, 5000);
        }

        // Types dans le select.
        (function initTypes() {
            var sel = parId('mw-type');
            Object.keys(TYPES).forEach(function (k) {
                var o = document.createElement('option');
                o.value = k; o.textContent = TYPES[k].emoji + ' ' + TYPES[k].label;
                sel.appendChild(o);
            });
            // Classification des points (sous-types selon le type choisi)
            remplirSousTypes();
            // Référentiels village (source actuelle / situation)
            getJ(apiReferentiels).then(function (r) {
                remplirSelect(parId('mw-v-source'), r.sources_eau_actuelles || []);
                remplirSelect(parId('mw-v-situation'), r.situations_acces || []);
            }).catch(function () { /* listes vides acceptables */ });
            actualiserChampsSource();
        })();

        // Classification des sous-types selon le type de point choisi :
        // source → SOURCE D'EAU (A) ; consommation → POINT DE CONSOMMATION (G) ;
        // repere → REPÈRES / POINTS INTERMÉDIAIRES (H) ; reservoir → RÉSERVOIRS ;
        // reseau → OUVRAGES DU RÉSEAU ; sinon vide.
        function remplirSousTypes() {
            var ss = parId('mw-sous-type');
            var t = parId('mw-type').value;
            var liste = [];
            if (t === 'source') liste = CORE.sourcesListe();
            else if (t === 'consommation') liste = CORE.consommationsListe();
            else if (t === 'repere') liste = CORE.reperesListe();
            else if (t === 'reservoir') liste = CORE.reservoirsListe();
            else if (t === 'reseau') liste = CORE.reseauxListe();
            ss.innerHTML = '';
            if (!liste.length) {
                ss.hidden = true;
                return;
            }
            liste.forEach(function (s) {
                var o = document.createElement('option');
                o.value = s.id;
                o.textContent = trad(s.labelKey, s.id);
                ss.appendChild(o);
            });
            ss.hidden = false;
        }

        // ── Requêtes ──
        function getJ(url) {
            return fetch(url, { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
                .then(function (r) { return r.json(); });
        }
        function post(url, body) {
            return fetch(url, {
                method: 'POST', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf, 'X-Requested-With': 'XMLHttpRequest' },
                body: JSON.stringify(body || {})
            }).then(function (r) { return r.json(); });
        }
        function del(url) {
            return fetch(url, {
                method: 'DELETE', credentials: 'same-origin',
                headers: { 'X-CSRFToken': csrf, 'X-Requested-With': 'XMLHttpRequest' }
            }).then(function (r) { return r.json(); });
        }

        // ── Mode hors connexion (tracés) ──
        function horsLigne() {
            return window.MukmapOffline && window.MukmapOffline.instance &&
                window.MukmapOffline.instance.estHorsLigne();
        }
        function traceHorsLigne(trace) {
            var inst = window.MukmapOffline && window.MukmapOffline.instance;
            if (!inst) return;
            var t = {
                id: trace.id,
                nom: trace.nom || '',
                description: trace.description || '',
                coordonnees: trace.coordonnees,
                observations: trace.observations || '',
                projet_id: trace.projet_id,
                synchro_id: trace.synchro_id
            };
            var prom = trace.id !== undefined && trace.id !== null
                ? inst.enregistrerTraceLocalement(t, null, 'modifie')
                : inst.enregistrerTraceLocalement(t);
            if (prom && prom.then) prom.then(function () {
                message('Tracé enregistré hors ligne — synchronisation à la reconnexion.', 'succes');
            });
        }

        // ── Projets ──
        function chargerProjets() {
            return getJ(apiProjets).then(function (d) {
                var sel = parId('mw-projets');
                var courant = projetActif ? projetActif.id : null;
                sel.innerHTML = '<option value="">— Projet courant —</option>';
                (d.projets || []).forEach(function (p) {
                    var o = document.createElement('option');
                    o.value = p.id; o.textContent = p.nom + ' (' + p.statut_label + ')';
                    if (courant === p.id) o.selected = true;
                    sel.appendChild(o);
                });
            }).catch(function () { message('Projets indisponibles.', 'erreur'); });
        }

        function chargerProjetComplet(id) {
            getJ(apiProjets + id + '/').then(function (d) {
                projetActif = d.projet; ouvrages = []; traces = [];
                return Promise.all([
                    getJ(apiOuvrages + '?projet=' + id),
                    getJ(apiTraces + '?projet=' + id)
                ]);
            }).then(function (res) {
                ouvrages = (res[0] && res[0].ouvrages) || [];
                traces = (res[1] && res[1].traces) || [];
                afficherStatutProjet();
                majTout();
                message(ouvrages.length + ' ouvrages chargés.', 'succes');
            }).catch(function () { message('Échec du chargement.', 'erreur'); });
        }

        function afficherStatutProjet() {
            var el = parId('mw-stat-projet');
            if (!projetActif) { el.textContent = 'Sélectionnez ou créez un projet.'; return; }
            var p = projetActif;
            el.innerHTML = '<b>' + ex(p.nom) + '</b>' +
                (p.zone_nom ? '<br>Zone : ' + ex(p.zone_nom) : '') +
                (p.commanditaire ? '<br>Commanditaire : ' + ex(p.commanditaire) : '') +
                '<br>' + ouvrages.length + ' ouvrages · ' + traces.length + ' tracés';
            parId('mw-champs-projet').hidden = true;
        }

        parId('mw-projets').addEventListener('change', function () {
            var id = this.value;
            if (!id) {
                projetActif = null; ouvrages = []; traces = [];
                majTout(); afficherStatutProjet(); message('Projet en pause.', 'info');
                return;
            }
            chargerProjetComplet(id);
        });
        parId('mw-nv-projet').addEventListener('click', function () {
            parId('mw-champs-projet').hidden = false;
            parId('mw-p-nom').focus();
        });
        parId('mw-enreg-projet').addEventListener('click', function () {
            var nom = parId('mw-p-nom').value.trim();
            if (!nom) { message('Nom du projet obligatoire.', 'erreur'); return; }
            post(apiProjets, {
                nom: nom,
                zone_nom: parId('mw-p-zone').value.trim(),
                commanditaire: parId('mw-p-com').value.trim(),
                description: parId('mw-p-desc').value,
                observations: parId('mw-p-desc').value
            }).then(function (d) {
                if (!d.ok) { message(d.erreur || 'Erreur.', 'erreur'); return; }
                parId('mw-p-nom').value = '';
                parId('mw-p-zone').value = '';
                parId('mw-p-com').value = '';
                parId('mw-p-desc').value = '';
                parId('mw-champs-projet').hidden = true;
                chargerProjets();
                chargerProjetComplet(d.projet.id);
                message('Projet créé.', 'succes');
            });
        });
        parId('mw-recharge').addEventListener('click', function () {
            if (projetActif) chargerProjetComplet(projetActif.id);
            chargerProjets();
        });
        parId('mw-suppr-projet').addEventListener('click', function () {
            if (!projetActif) return;
            if (!confirm('Supprimer le projet et toutes ses données ?')) return;
            del(apiProjets + projetActif.id + '/').then(function () {
                projetActif = null; ouvrages = []; traces = [];
                chargerProjets(); majTout();
                message('Projet supprimé.', 'succes');
            });
        });

        // ── Collecte ──
        function releverFormulaire() {
            var obj = {
                type: parId('mw-type').value,
                sous_type: parId('mw-sous-type').value || '',
                representation: parId('mw-repr').value || 'point',
                nom: parId('mw-nom').value.trim(),
                altitude_m: toF(parId('mw-alt').value),
                beneficiaires: parseInt(parId('mw-benef').value || 0, 10) || 0,
                latitude: toF(parId('mw-lat').value),
                longitude: toF(parId('mw-lon').value),
                caracteristiques: { details: parId('mw-carac').value.trim() },
                observations: parId('mw-obs').value.trim()
            };
            ['provenance', 'territoire', 'secteur_chefferie', 'localite', 'village',
                'agent_enqueteur', 'organisation', 'code_projet'].forEach(function (k) {
                obj[k] = parId('mw-' + k).value.trim();
            });
            if (obj.type === 'source') {
                obj.sous_type = parId('mw-sous-type').value;
                obj.source = {
                    debit_mesure: toF(parId('mw-s-debit').value),
                    debit_unite: parId('mw-s-debit-unite').value,
                    niveau_eau_m: toF(parId('mw-s-methode').value),
                    profondeur_m: toF(parId('mw-s-profond').value),
                    debit_saison_seche: toF(parId('mw-s-saison-seche').value),
                    debit_saison_pluies: toF(parId('mw-s-saison-pluies').value),
                    accessibilite: parId('mw-s-access').value,
                    etat_source: parId('mw-s-etat').value,
                    permanence: parId('mw-s-permanence').value,
                    protection: parId('mw-s-protection').value,
                    distance_village_m: toF(parId('mw-s-dist-village').value),
                    distance_consommation_m: toF(parId('mw-s-dist-conso').value),
                    ph: toF(parId('mw-s-ph').value),
                    turbidite_ntu: toF(parId('mw-s-turb').value),
                    conductivite_us: toF(parId('mw-s-cond').value),
                    temperature_c: toF(parId('mw-s-temp').value),
                    chlore_residuel: toF(parId('mw-s-chlore').value),
                    code_echantillon: parId('mw-s-code-ech').value.trim(),
                    resultats_microbiologiques: parId('mw-s-microbio').value.trim(),
                    observation_qualite: parId('mw-s-obs-qualite').value.trim()
                };
            }
            if (obj.type === 'village') {
                obj.geometrie = geometrieCourante.slice();
                obj.village = {
                    population: parseInt(parId('mw-v-pop').value || 0, 10) || 0,
                    menages: parseInt(parId('mw-v-menages').value || 0, 10) || 0,
                    population_cible: parseInt(parId('mw-v-cible').value || 0, 10) || 0,
                    beneficiaires_estimes: parseInt(parId('mw-v-benef').value || 0, 10) || 0,
                    ecoles: parseInt(parId('mw-v-ecoles').value || 0, 10) || 0,
                    centres_sante: parseInt(parId('mw-v-sante').value || 0, 10) || 0,
                    autres_institutions: parId('mw-v-autres').value.trim(),
                    source_eau_actuelle: parId('mw-v-source').value,
                    distance_source_m: toF(parId('mw-v-dist').value),
                    situation_acces: parId('mw-v-situation').value
                };
            }
            if (obj.type === 'consommation') {
                obj.sous_type = parId('mw-sous-type').value;
                obj.consommation = {
                    population_desservie: parseInt(parId('mw-c-pop').value || 0, 10) || 0,
                    menages_desservis: parseInt(parId('mw-c-menages').value || 0, 10) || 0,
                    nombre_robinets: parseInt(parId('mw-c-robinets').value || 0, 10) || 0,
                    etat: parId('mw-c-etat').value,
                    existant_propose: parId('mw-c-existant').value,
                    debit_estime: toF(parId('mw-c-debit').value),
                    besoin_estime: toF(parId('mw-c-besoin').value),
                    photos: photosConsommation.slice()
                };
            }
            if (obj.type === 'repere') {
                obj.sous_type = parId('mw-sous-type').value;
                obj.description = parId('mw-r-description').value.trim();
                obj.repere = {
                    description: parId('mw-r-description').value.trim(),
                    photo: photoRepere,
                    date_releve: parId('mw-r-date').value
                };
            }
            if (obj.type === 'reservoir') {
                obj.sous_type = parId('mw-sous-type').value;
                obj.reservoir = {
                    capacite_m3: toF(parId('mw-rv-capacite').value),
                    niveau_eau_m: toF(parId('mw-rv-niveau').value),
                    etat: parId('mw-rv-etat').value,
                    existant_propose: parId('mw-rv-existant').value,
                    photos: photosReservoir.slice()
                };
            }
            return obj;
        }
        function viderFormulaire() {
            if (parId('mw-id')) parId('mw-id').textContent = '— (auto)';
            parId('mw-nom').value = '';
            parId('mw-alt').value = '';
            parId('mw-benef').value = '';
            parId('mw-lat').value = '';
            parId('mw-lon').value = '';
            parId('mw-carac').value = '';
            parId('mw-obs').value = '';
            ['province', 'territoire', 'secteur_chefferie', 'localite', 'village',
                'agent_enqueteur', 'organisation', 'code_projet'].forEach(function (k) {
                parId('mw-' + k).value = '';
            });
            parId('mw-sous-type').value = '';
            actualiserChampsSource();
            ['v-pop', 'v-menages', 'v-cible', 'v-benef', 'v-ecoles', 'v-sante', 'v-dist'].forEach(function (k) {
                parId('mw-' + k).value = '';
            });
            parId('mw-v-autres').value = '';
            parId('mw-v-source').value = '';
            parId('mw-v-situation').value = '';
            ['s-debit', 's-debit-unite', 's-methode', 's-profond', 's-saison-seche', 's-saison-pluies',
                's-access', 's-etat', 's-permanence', 's-protection', 's-dist-village', 's-dist-conso',
                's-ph', 's-turb', 's-cond', 's-temp', 's-chlore', 's-code-ech'].forEach(function (k) {
                parId('mw-' + k).value = '';
            });
            parId('mw-s-microbio').value = '';
            parId('mw-s-obs-qualite').value = '';
            ['c-pop', 'c-menages', 'c-robinets', 'c-besoin', 'c-debit'].forEach(function (k) {
                parId('mw-' + k).value = '';
            });
            parId('mw-c-etat').value = '';
            parId('mw-c-existant').value = '';
            parId('mw-r-description').value = '';
            parId('mw-r-date').value = '';
            parId('mw-r-photo').value = '';
            parId('mw-rv-capacite').value = '';
            parId('mw-rv-niveau').value = '';
            parId('mw-rv-etat').value = '';
            parId('mw-rv-existant').value = '';
            parId('mw-rv-photos').value = '';
            parId('mw-c-photos').value = '';
            photosConsommation = [];
            photoRepere = '';
            photosReservoir = [];
            majApercuPhotos();
            geometrieCourante = [];
            majPolyInfo();
            dessinerGeometrieTmp();
            parId('mw-maj-ouvrage').hidden = true;
            parId('mw-supp-ouvrage').hidden = true;
            delete parId('mw-maj-ouvrage').dataset.id;
        }
        function listeOuvrages() {
            var el = parId('mw-liste-ouvrages');
            if (!el) return;
            el.innerHTML = '';
            if (!ouvrages.length) { el.textContent = 'Aucun ouvrage relevé.'; return; }
            ouvrages.forEach(function (o) {
                var t = TYPES[o.type] || {};
                var div = document.createElement('div');
                div.className = 'i';
                div.innerHTML = '<span>' + t.emoji + ' ' +
                    (o.code ? '<b class="mw-code">' + ex(o.code) + '</b> ' : '') + ex(o.nom || '—') +
                    (o.altitude_m != null ? ' · ' + Math.round(o.altitude_m) + ' m' : '') + '</span>' +
                    '<span>' + ex((STATUTS[o.statut] || {}).label || o.statut) + '</span>';
                div.addEventListener('click', function () { editerOuvrage(o); });
                el.appendChild(div);
            });
        }
        function editerOuvrage(o) {
            parId('mw-type').value = o.type;
            actualiserFormParType();
            parId('mw-sous-type').value = o.sous_type || '';
            actualiserChampsSource();
            parId('mw-repr').value = o.representation || 'point';
            actualiserReprVillage();
            geometrieCourante = (o.geometrie || []).slice();
            majPolyInfo();
            dessinerGeometrieTmp();
            parId('mw-id').textContent = o.code || '—';
            parId('mw-nom').value = o.nom || '';
            parId('mw-alt').value = o.altitude_m != null ? o.altitude_m : '';
            parId('mw-benef').value = o.beneficiaires || '';
            parId('mw-lat').value = o.latitude;
            parId('mw-lon').value = o.longitude;
            parId('mw-carac').value = (o.caracteristiques && o.caracteristiques.details) || '';
            parId('mw-obs').value = o.observations || '';
            ['provenance', 'territoire', 'secteur_chefferie', 'localite', 'village',
                'agent_enqueteur', 'organisation', 'code_projet'].forEach(function (k) {
                parId('mw-' + k).value = o[k] || '';
            });
            var rv = o.releve_village || {};
            parId('mw-v-pop').value = rv.population || '';
            parId('mw-v-menages').value = rv.menages || '';
            parId('mw-v-cible').value = rv.population_cible || '';
            parId('mw-v-benef').value = rv.beneficiaires_estimes || '';
            parId('mw-v-ecoles').value = rv.ecoles || '';
            parId('mw-v-sante').value = rv.centres_sante || '';
            parId('mw-v-autres').value = rv.autres_institutions || '';
            parId('mw-v-source').value = rv.source_eau_actuelle || '';
            parId('mw-v-dist').value = rv.distance_source_m || '';
            parId('mw-v-situation').value = rv.situation_acces || '';
            var rs = o.releve_source || {};
            parId('mw-s-debit').value = rs.debit_mesure || '';
            parId('mw-s-debit-unite').value = rs.debit_unite || '';
            parId('mw-s-methode').value = rs.niveau_eau_m || '';
            parId('mw-s-profond').value = rs.profondeur_m || '';
            parId('mw-s-saison-seche').value = rs.debit_saison_seche || '';
            parId('mw-s-saison-pluies').value = rs.debit_saison_pluies || '';
            parId('mw-s-access').value = rs.accessibilite || '';
            parId('mw-s-etat').value = rs.etat_source || '';
            parId('mw-s-permanence').value = rs.permanence || '';
            parId('mw-s-protection').value = rs.protection || '';
            parId('mw-s-dist-village').value = rs.distance_village_m || '';
            parId('mw-s-dist-conso').value = rs.distance_consommation_m || '';
            parId('mw-s-ph').value = rs.ph || '';
            parId('mw-s-turb').value = rs.turbidite_ntu || '';
            parId('mw-s-cond').value = rs.conductivite_us || '';
            parId('mw-s-temp').value = rs.temperature_c || '';
            parId('mw-s-chlore').value = rs.chlore_residuel || '';
            parId('mw-s-code-ech').value = rs.code_echantillon || '';
            parId('mw-s-microbio').value = rs.resultats_microbiologiques || '';
            parId('mw-s-obs-qualite').value = rs.observation_qualite || '';
            var rc = o.releve_consommation || {};
            parId('mw-c-pop').value = rc.population_desservie || '';
            parId('mw-c-menages').value = rc.menages_desservis || '';
            parId('mw-c-robinets').value = rc.nombre_robinets || '';
            parId('mw-c-etat').value = rc.etat || '';
            parId('mw-c-existant').value = rc.existant_propose || '';
            parId('mw-c-debit').value = rc.debit_estime || '';
            parId('mw-c-besoin').value = rc.besoin_estime || '';
            photosConsommation = (rc.photos || []).slice();
            var rv = o.releve_reservoir || {};
            parId('mw-rv-capacite').value = rv.capacite_m3 != null ? rv.capacite_m3 : '';
            parId('mw-rv-niveau').value = rv.niveau_eau_m != null ? rv.niveau_eau_m : '';
            parId('mw-rv-etat').value = rv.etat || '';
            parId('mw-rv-existant').value = rv.existant_propose || '';
            photosReservoir = (rv.photos || []).slice();
            var rr = o.releve_repere || {};
            parId('mw-r-description').value = (rr.description || o.description || '');
            parId('mw-r-date').value = rr.date_releve || '';
            photoRepere = rr.photo || '';
            majApercuPhotos();
            parId('mw-maj-ouvrage').hidden = false;
            parId('mw-supp-ouvrage').hidden = false;
            parId('mw-maj-ouvrage').dataset.id = String(o.id);
            message('Ouvrage sélectionné : ' + (o.code ? o.code + ' · ' : '') + (o.nom || '#' + o.id), 'info');
        }

        // ── Classification / représentation ──
        var geometrieCourante = [];
        var enDessinGeom = false;
        var photosConsommation = [];
        var photoRepere = '';
        var photosReservoir = [];

        // Aperçu des photos du point de consommation / repère / réservoir.
        function majApercuPhotos() {
            parId('mw-c-photos-apercu').hidden = !photosConsommation.length;
            parId('mw-c-photos-nb').textContent = photosConsommation.length + ' photo' +
                (photosConsommation.length > 1 ? 's' : '');
            parId('mw-r-photo-apercu').hidden = !photoRepere;
            parId('mw-rv-photos-apercu').hidden = !photosReservoir.length;
            parId('mw-rv-photos-nb').textContent = photosReservoir.length + ' photo' +
                (photosReservoir.length > 1 ? 's' : '');
        }

        // Lit les fichiers images et les compresse en data URL (max 900 px, JPEG).
        function fichiersEnDataUrls(files, cb) {
            var resultats = [];
            var restants = files.length;
            if (!restants) { cb(resultats); return; }
            Array.prototype.forEach.call(files, function (file) {
                if (!/^image\//.test(file.type)) { restants--; if (!restants) cb(resultats); return; }
                var lecteur = new FileReader();
                lecteur.onload = function () {
                    var img = new Image();
                    img.onload = function () {
                        var max = 900;
                        var ratio = Math.min(1, max / Math.max(img.width, img.height));
                        var canvas = document.createElement('canvas');
                        canvas.width = Math.max(1, Math.round(img.width * ratio));
                        canvas.height = Math.max(1, Math.round(img.height * ratio));
                        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                        resultats.push(canvas.toDataURL('image/jpeg', 0.72));
                        restants--;
                        if (!restants) cb(resultats);
                    };
                    img.onerror = function () { restants--; if (!restants) cb(resultats); };
                    img.src = lecteur.result;
                };
                lecteur.onerror = function () { restants--; if (!restants) cb(resultats); };
                lecteur.readAsDataURL(file);
            });
        }
        parId('mw-c-photos').addEventListener('change', function () {
            fichiersEnDataUrls(this.files, function (urls) {
                photosConsommation = photosConsommation.concat(urls).slice(0, 20);
                majApercuPhotos();
            });
        });
        parId('mw-r-photo').addEventListener('change', function () {
            fichiersEnDataUrls(this.files, function (urls) {
                if (urls.length) photoRepere = urls[0];
                majApercuPhotos();
            });
        });
        parId('mw-rv-photos').addEventListener('change', function () {
            fichiersEnDataUrls(this.files, function (urls) {
                photosReservoir = photosReservoir.concat(urls).slice(0, 20);
                majApercuPhotos();
            });
        });
        function majPolyInfo() {
            var el = parId('mw-poly-info');
            if (!el) return;
            el.hidden = !(parId('mw-repr').value !== 'point');
            parId('mw-poly-nb').textContent = geometrieCourante.length + ' points';
        }
        function dessinerGeometrieTmp() {
            removeCouche('mw-geom-tmp');
            if (geometrieCourante.length >= 3) {
                ajouterGeoJSON('mw-geom-tmp', [CORE.polygoneGeoJSON(geometrieCourante, {})], 'polygone', '#f59e0b');
            }
        }
        function actualiserFormParType() {
            var t = parId('mw-type').value;
            remplirSousTypes();
            parId('mw-sous-type').hidden = !['source', 'consommation', 'repere', 'reservoir', 'reseau'].includes(t);
            parId('mw-repr').hidden = t !== 'village';
            parId('mw-poly-actions').hidden = t !== 'village';
            parId('mw-poly-info').hidden = t !== 'village';
            parId('mw-form-village').hidden = t !== 'village';
            parId('mw-form-source').hidden = t !== 'source';
            parId('mw-s-avertissement').hidden = t !== 'source';
            parId('mw-form-consommation').hidden = t !== 'consommation';
            parId('mw-form-repere').hidden = t !== 'repere';
            parId('mw-form-reservoir').hidden = t !== 'reservoir';
            if (t !== 'village') { enDessinGeom = false; actualiserBoutonsGeom(); }
        }
        function actualiserReprVillage() {
            var repr = parId('mw-repr').value;
            parId('mw-poly-actions').hidden = repr === 'point';
            majPolyInfo();
        }
        function actualiserChampsSource() {
            var f = CORE.SOURCES[parId('mw-sous-type').value] || {};
            [
                ['mw-s-debit', f.debit], ['mw-s-debit-unite', f.debit],
                ['mw-s-saison-seche', f.debit], ['mw-s-saison-pluies', f.debit],
                ['mw-s-methode', f.niveau], ['mw-s-profond', f.profondeur],
                ['mw-s-permanence', f.permanence], ['mw-s-protection', f.protection]
            ].forEach(function (p) {
                parId(p[0]).hidden = !p[1];
            });
        }
        function actualiserBoutonsGeom() {
            parId('mw-tracer-poly').hidden = enDessinGeom;
            parId('mw-fin-poly').hidden = !enDessinGeom;
            parId('mw-ann-poly').hidden = !enDessinGeom;
        }
        parId('mw-type').addEventListener('change', function () {
            actualiserFormParType();
            actualiserReprVillage();
        });
        parId('mw-sous-type').addEventListener('change', actualiserChampsSource);
        parId('mw-repr').addEventListener('change', actualiserReprVillage);
        parId('mw-tracer-poly').addEventListener('click', function () {
            geometrieCourante = [];
            enDessinGeom = true;
            actualiserBoutonsGeom();
            majPolyInfo();
            message('Cliquez la carte pour poser les sommets du contour.', 'info');
        });
        parId('mw-fin-poly').addEventListener('click', function () {
            if (geometrieCourante.length < 3) { message('Au moins 3 points requis.', 'erreur'); return; }
            enDessinGeom = false;
            actualiserBoutonsGeom();
            message('Contour prêt (' + geometrieCourante.length + ' points).', 'succes');
        });
        parId('mw-ann-poly').addEventListener('click', function () {
            geometrieCourante = [];
            enDessinGeom = false;
            actualiserBoutonsGeom();
            majPolyInfo();
            removeCouche('mw-geom-tmp');
        });

        parId('mw-ajouter').addEventListener('click', function () {
            if (!projetActif) { message('Sélectionnez d\'abord un projet.', 'erreur'); return; }
            var obj = releverFormulaire();
            if (!obj.nom) { message('Le nom est obligatoire.', 'erreur'); return; }
            if (obj.latitude == null || obj.longitude == null) { message('Positionnez le point (clic carte ou GPS).', 'erreur'); return; }
            post(apiOuvrages, Object.assign({ projet_id: projetActif.id }, obj)).then(function (d) {
                if (!d.ok) { message(d.erreur || 'Erreur.', 'erreur'); return; }
                ouvrages.push(d.ouvrage);
                viderFormulaire();
                majTout();
                listeOuvrages();
                message('Ouvrage enregistré.', 'succes');
            });
        });
        parId('mw-maj-ouvrage').addEventListener('click', function () {
            var id = parId('mw-maj-ouvrage').dataset.id;
            if (!id) return;
            var obj = releverFormulaire();
            if (!obj.nom) { message('Le nom est obligatoire.', 'erreur'); return; }
            post(apiOuvrages + id + '/', obj).then(function (d) {
                if (!d.ok) { message(d.erreur || 'Erreur.', 'erreur'); return; }
                viderFormulaire();
                chargerProjetComplet(projetActif.id);
                message('Ouvrage modifié.', 'succes');
            });
        });
        parId('mw-supp-ouvrage').addEventListener('click', function () {
            var id = parId('mw-supp-ouvrage').dataset.id;
            if (!id) return;
            if (!confirm('Supprimer cet ouvrage ?')) return;
            del(apiOuvrages + id + '/').then(function () {
                viderFormulaire();
                chargerProjetComplet(projetActif.id);
                message('Ouvrage supprimé.', 'succes');
            });
        });
        parId('mw-pick-gps').addEventListener('click', function () {
            if (!navigator.geolocation) { message('GPS indisponible.', 'erreur'); return; }
            navigator.geolocation.getCurrentPosition(function (pos) {
                parId('mw-lat').value = pos.coords.latitude.toFixed(6);
                parId('mw-lon').value = pos.coords.longitude.toFixed(6);
                if (parId('mw-alt').value === '') {
                    parId('mw-alt').value = (pos.coords.altitude != null ? pos.coords.altitude : 0).toFixed(1);
                }
                message('Position GPS acquise.', 'succes');
            }, function () { message('GPS refusé.', 'erreur'); }, { enableHighAccuracy: true });
        });

        // ── Tracés ──
        var traceCourant = [];
        var enTrace = false;
        function demarrerTrace() {
            if (!projetActif) { message('Sélectionnez d\'abord un projet.', 'erreur'); return; }
            traceCourant = [];
            enTrace = true;
            parId('mw-nv-trace').hidden = true;
            parId('mw-fin-trace').hidden = false;
            parId('mw-ann-trace').hidden = false;
            message('Cliquez la carte pour poser les sommets (source → borne).', 'info');
        }
        function annulerTrace() {
            traceCourant = [];
            enTrace = false;
            rectraceActions();
            afficherMesures();
            removeCouche('mw-trace-tmp');
        }
        function terminerTrace() {
            if (traceCourant.length < 2) { message('Au moins 2 points requis.', 'erreur'); return; }
            if (!projetActif) return;
            var nouvelleTrace = {
                projet_id: projetActif.id,
                nom: parId('mw-nom-trace').value.trim(),
                coordonnees: traceCourant,
                observations: ''
            };
            if (horsLigne()) {
                traceHorsLigne(nouvelleTrace);
                traceCourant = [];
                enTrace = false;
                rectraceActions();
                majTout();
                return;
            }
            post(apiTraces, nouvelleTrace).then(function (d) {
                if (!d.ok) { message(d.erreur || 'Erreur.', 'erreur'); return; }
                traces.push(d.trace);
                traceCourant = [];
                enTrace = false;
                rectraceActions();
                majTout();
                message('Tracé enregistré (' + Math.round(d.trace.longueur_m) + ' m).', 'succes');
            });
        }
        function rectraceActions() {
            parId('mw-nv-trace').hidden = false;
            parId('mw-fin-trace').hidden = true;
            parId('mw-ann-trace').hidden = true;
        }
        parJouet(parId('mw-nv-trace'), 'click', demarrerTrace);
        parJouet(parId('mw-fin-trace'), 'click', terminerTrace);
        parJouet(parId('mw-ann-trace'), 'click', annulerTrace);

        function afficherMesures() {
            parId('mw-len').textContent = formatDist(CORE.longueurTrace(traceCourant));
            parId('mw-den').textContent = Math.round(CORE.denivelePositif(traceCourant)) + ' m';
            parId('mw-pente').textContent = CORE.penteMoyenne(traceCourant).toFixed(1) + ' %';
            dessinerProfil(CORE.profilRelief(traceCourant));
        }
        function parJouet(el, ev, fn) { if (el) el.addEventListener(ev, fn); }

        function listeTraces() {
            var el = parId('mw-liste-traces');
            if (!el) return;
            el.innerHTML = '';
            if (!traces.length) { el.textContent = 'Aucun tracé.'; return; }
            traces.forEach(function (t) {
                var div = document.createElement('div');
                div.className = 'i';
                div.textContent = '📏 ' + (t.nom || 'Tracé #' + t.id) + ' — ' +
                    Math.round(t.longueur_m || 0) + ' m, +' + Math.round(t.denivelee_m || 0) + ' m';
                div.addEventListener('click', function () { zoomSurTrace(t); });
                el.appendChild(div);
            });
        }
        function zoomSurTrace(t) {
            if (!carte || !t.coordonnees || !t.coordonnees.length) return;
            var bounds = t.coordonnees.map(function (c) { return [c[0], c[1]]; });
            var k = 'mw-zoom-' + t.id;
            ajouterGeoJSON(k, [CORE.traceGeoJSON(t.coordonnees, { nom: t.nom })], 'line', '#22d3ee');
            try { carte.fitBounds(bounds, { padding: 60, maxZoom: 15 }); } catch (e) { /* ignore */ }
        }

        // ── Mode « ENREGISTRER LE TRACÉ » (GPS automatique) ────────
        var gpsTracePoints = [];
        var gpsWatchId = null;
        var gpsEnCours = false;
        var gpsEnPause = false;
        var gpsTimer = null;

        function formaterDuree(s) {
            if (s == null) return '—';
            var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
            if (h > 0) return h + 'h ' + m + 'min';
            if (m > 0) return m + 'min ' + sec + 's';
            return sec + ' s';
        }

        function demarrerGpsTrace() {
            if (!projetActif) { message('Sélectionnez d\'abord un projet.', 'erreur'); return; }
            if (!navigator.geolocation) { message('Géolocalisation non supportée.', 'erreur'); return; }
            if (enTrace) { annulerTrace(); }
            gpsTracePoints = [];
            gpsEnCours = true;
            gpsEnPause = false;
            parId('mw-gps-trace').hidden = true;
            parId('mw-gps-actions').hidden = false;
            parId('mw-gps-etat').hidden = false;
            parId('mw-gps-stats').hidden = false;
            majEtatGps('● Enregistrement…', '#22c55e');
            parId('mw-pause-trace').hidden = false;
            parId('mw-rep-trace').hidden = true;
            parId('mw-gps-trace').textContent = '🎥 Enregistrer le tracé (GPS)';
            message('Marchez le long du futur tracé — les points GPS sont enregistrés.', 'info');
            gpsWatchId = navigator.geolocation.watchPosition(function (pos) {
                var lon = pos.coords.longitude, lat = pos.coords.latitude;
                var alt = (pos.coords.altitude !== null && pos.coords.altitude !== undefined)
                    ? pos.coords.altitude : null;
                var dernier = gpsTracePoints[gpsTracePoints.length - 1];
                var dMin = 3, tMax = 5;
                if (dernier) {
                    var dist = CORE.distanceCoord([dernier[0], dernier[1]], [lon, lat]);
                    var ecart = (Date.now() - Date.parse(dernier[3])) / 1000;
                    if (dist < dMin && ecart < tMax) return;
                }
                gpsTracePoints.push([lon, lat, alt, new Date().toISOString()]);
                afficherGpsStats();
            }, function (err) {
                message('Erreur GPS : ' + (err && err.message ? err.message : 'indisponible'), 'erreur');
            }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 });
            if (gpsTimer) clearInterval(gpsTimer);
            gpsTimer = setInterval(afficherGpsStats, 1000);
        }

        function arreterWatchGps() {
            if (gpsWatchId !== null) { navigator.geolocation.clearWatch(gpsWatchId); gpsWatchId = null; }
            if (gpsTimer) { clearInterval(gpsTimer); gpsTimer = null; }
        }

        function majEtatGps(texte, couleur) {
            parId('mw-gps-etat').hidden = false;
            parId('mw-gps-etat-txt').textContent = texte;
            parId('mw-gps-etat-txt').style.color = couleur || '#f59e0b';
        }

        function afficherGpsStats() {
            var a = CORE.analyseTraceGps(gpsTracePoints);
            parId('mw-gs-points').textContent = a.nb_points;
            var duree = gpsEnCours ? CORE.dureeTrace(gpsTracePoints) : a.duree_s;
            parId('mw-gs-duree').textContent = formaterDuree(duree);
            parId('mw-gs-long').textContent = formatDist(a.longueur_totale);
            parId('mw-gs-horiz').textContent = formatDist(a.distance_horizontale);
            parId('mw-gs-alt').textContent = (a.altitude_min != null && a.altitude_max != null)
                ? Math.round(a.altitude_min) + ' / ' + Math.round(a.altitude_max) + ' m' : '—';
            parId('mw-gs-den').textContent = '+' + Math.round(a.denivele_positif) + ' / −' +
                Math.round(a.denivele_negatif) + ' m';
            parId('mw-gs-pente').textContent = a.pente_moyenne.toFixed(1) + ' / ' +
                a.pente_maximale.toFixed(1) + ' %';
            removeCouche('mw-gps-trace-tmp');
            if (gpsTracePoints.length >= 2) {
                ajouterGeoJSON('mw-gps-trace-tmp',
                    [CORE.traceGeoJSON(gpsTracePoints.map(function (p) { return [p[0], p[1], p[2]]; }), {})],
                    'line', '#22c55e');
            }
        }

        function pauseGpsTrace() {
            if (!gpsEnCours || gpsEnPause) return;
            gpsEnPause = true;
            arreterWatchGps();
            majEtatGps('⏸ En pause — reprenez pour continuer.', '#eab308');
            parId('mw-pause-trace').hidden = true;
            parId('mw-rep-trace').hidden = false;
        }

        function reprendreGpsTrace() {
            if (!gpsEnCours || !gpsEnPause) return;
            gpsEnPause = false;
            majEtatGps('● Enregistrement…', '#22c55e');
            parId('mw-pause-trace').hidden = false;
            parId('mw-rep-trace').hidden = true;
            gpsWatchId = navigator.geolocation.watchPosition(function (pos) {
                var lon = pos.coords.longitude, lat = pos.coords.latitude;
                var alt = (pos.coords.altitude !== null && pos.coords.altitude !== undefined)
                    ? pos.coords.altitude : null;
                var dernier = gpsTracePoints[gpsTracePoints.length - 1];
                if (dernier) {
                    var dist = CORE.distanceCoord([dernier[0], dernier[1]], [lon, lat]);
                    if (dist < 3) return;
                }
                gpsTracePoints.push([lon, lat, alt, new Date().toISOString()]);
                afficherGpsStats();
            }, function (err) {
                message('Erreur GPS : ' + (err && err.message ? err.message : 'indisponible'), 'erreur');
            }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 });
            if (gpsTimer) clearInterval(gpsTimer);
            gpsTimer = setInterval(afficherGpsStats, 1000);
        }

        function annulerGpsTrace() {
            gpsEnCours = false;
            gpsEnPause = false;
            arreterWatchGps();
            gpsTracePoints = [];
            parId('mw-gps-trace').hidden = false;
            parId('mw-gps-actions').hidden = true;
            parId('mw-gps-etat').hidden = true;
            parId('mw-gps-stats').hidden = true;
            removeCouche('mw-gps-trace-tmp');
            majEtatGps('', '#f59e0b');
        }

        function terminerGpsTrace() {
            if (!gpsEnCours) return;
            if (gpsTracePoints.length < 2) { message('Au moins 2 points GPS requis.', 'erreur'); return; }
            var a = CORE.analyseTraceGps(gpsTracePoints);
            var nom = parId('mw-nom-trace').value.trim() || ('Reconnaissance ' + new Date().toLocaleDateString());
            var coordonnees = gpsTracePoints.map(function (p) { return [p[0], p[1], p[2]]; });
            var duree = a.duree_s;
            var traceGps = {
                projet_id: projetActif.id,
                nom: nom,
                coordonnees: coordonnees,
                observations: 'Durée de reconnaissance : ' + formaterDuree(duree) +
                    ' ; points : ' + a.nb_points + ' ; dénivelé +' + Math.round(a.denivele_positif) +
                    '/−' + Math.round(a.denivele_negatif) + ' m ; pente moy. ' +
                    a.pente_moyenne.toFixed(1) + ' %.'
            };
            if (horsLigne()) {
                gpsEnCours = false;
                gpsEnPause = false;
                arreterWatchGps();
                parId('mw-gps-trace').hidden = false;
                parId('mw-gps-actions').hidden = true;
                parId('mw-gps-etat').hidden = true;
                removeCouche('mw-gps-trace-tmp');
                traceHorsLigne(traceGps);
                gpsTracePoints = [];
                majTout();
                return;
            }
            post(apiTraces, traceGps).then(function (d) {
                gpsEnCours = false;
                gpsEnPause = false;
                arreterWatchGps();
                parId('mw-gps-trace').hidden = false;
                parId('mw-gps-actions').hidden = true;
                parId('mw-gps-etat').hidden = true;
                removeCouche('mw-gps-trace-tmp');
                if (!d.ok) { message(d.erreur || 'Erreur.', 'erreur'); return; }
                traces.push(d.trace);
                gpsTracePoints = [];
                majTout();
                message('Tracé GPS enregistré : ' + formatDist(a.longueur_totale) +
                    ' en ' + formaterDuree(duree) + ' (dénivelé +' +
                    Math.round(a.denivele_positif) + ' m).', 'succes');
            });
        }

        parJouet(parId('mw-gps-trace'), 'click', demarrerGpsTrace);
        parJouet(parId('mw-pause-trace'), 'click', pauseGpsTrace);
        parJouet(parId('mw-rep-trace'), 'click', reprendreGpsTrace);
        parJouet(parId('mw-fin-gps'), 'click', terminerGpsTrace);
        parJouet(parId('mw-ann-gps'), 'click', annulerGpsTrace);

        // ── Couches temporaires ──
        var registre = [];
        function removeCouche(id) {
            if (carte.getLayer(id)) carte.removeLayer(id);
            if (carte.getSource(id)) carte.removeSource(id);
        }
        function desenregistrer(id) {
            var i = registre.indexOf(id);
            if (i !== -1) registre.splice(i, 1);
        }
        function ajouterGeoJSON(id, features, type, couleur) {
            removeCouche(id);
            desenregistrer(id);
            if (!features || !features.length) return;
            carte.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: features } });
            if (type === 'polygone') {
                carte.addLayer({ id: id + '-fill', type: 'fill', source: id,
                    paint: { 'fill-color': couleur || '#f59e0b', 'fill-opacity': 0.25 } });
                carte.addLayer({ id: id, type: 'line', source: id,
                    paint: { 'line-color': couleur || '#f59e0b', 'line-width': 2 } });
                registre.push(id + '-fill');
                registre.push(id);
                return;
            }
            if (type === 'line') {
                carte.addLayer({ id: id, type: 'line', source: id,
                    paint: { 'line-color': couleur || '#22d3ee', 'line-width': 3 } });
            } else {
                carte.addLayer({ id: id, type: 'circle', source: id,
                    paint: { 'circle-color': couleur || '#22d3ee', 'circle-radius': 6,
                        'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } });
            }
            registre.push(id);
        }
        function nettoyerCouchesToutes() {
            registre.slice().forEach(function (id) { removeCouche(id); });
            registre.length = 0;
        }
        function dessinerTempTrace() {
            removeCouche('mw-trace-tmp');
            if (traceCourant.length >= 2) {
                ajouterGeoJSON('mw-trace-tmp', [CORE.traceGeoJSON(traceCourant, {})], 'line', '#22d3ee');
            }
        }

        // ── Carte : clics ──
        carte.on('click', function (e) {
            var lng = e.lngLat.lng, lat = e.lngLat.lat;
            if (enDessinGeom) {
                if (!geometrieCourante.length) {
                    parId('mw-lat').value = lat.toFixed(6);
                    parId('mw-lon').value = lng.toFixed(6);
                }
                geometrieCourante.push([lng, lat]);
                majPolyInfo();
                dessinerGeometrieTmp();
                return;
            }
            if (enTrace) {
                var a = toF(parId('mw-alt').value);
                traceCourant.push([lng, lat, a]);
                afficherMesures();
                dessinerTempTrace();
                return;
            }
            if (mesureClicActif) {
                ajouterClicMesure(lng, lat);
                return;
            }
            if (reseauRelierActif) {
                ajouterPointReseau(lng, lat, toF(parId('mw-alt').value));
                return;
            }
            if (ongletCourant === 'collecte') {
                parId('mw-lat').value = lat.toFixed(6);
                parId('mw-lon').value = lng.toFixed(6);
                message('Position posée (' + lat.toFixed(5) + ', ' + lng.toFixed(5) + ').', 'info');
            }
        });

        // ── Carte : ouvrages + traces persistés ──
        function majOuvragesCarte() {
            removeCouche('mw-ouv-p');
            desenregistrer('mw-ouv-p');
            if (!ouvrages.length) return;
            var feats = [];
            ouvrages.forEach(function (o) {
                feats.push({
                    type: 'Feature',
                    properties: { id: o.id, nom: (o.code ? o.code + ' · ' : '') + o.nom, code: o.code || '', type: o.type, statut: o.statut, emoji: CORE.emojiOuvrage(o.type, o.sous_type) },
                    geometry: { type: 'Point', coordinates: [o.longitude, o.latitude] }
                });
            });
            carte.addSource('mw-ouv-p', { type: 'geojson', data: { type: 'FeatureCollection', features: feats } });
            carte.addLayer({
                id: 'mw-ouv-p', type: 'circle', source: 'mw-ouv-p',
                paint: {
                    'circle-color': ['match', ['get', 'statut'],
                        'actif', '#22c55e', 'moyen', '#eab308', 'defectueux', '#f97316',
                        'hors_service', '#ef4444', 'projet', '#6366f1', '#94a3b8'],
                    'circle-radius': 7, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1
                }
            });
            registre.push('mw-ouv-p');
        }
        function majTracesCarte() {
            traces.forEach(function (t) {
                var k = 'mw-tr-' + t.id;
                removeCouche(k); desenregistrer(k);
                if (t.coordonnees && t.coordonnees.length >= 2) {
                    ajouterGeoJSON(k, [CORE.traceGeoJSON(t.coordonnees, {})], 'line', '#0ea5e9');
                }
            });
        }
function majVillagesCarte() {
            var poly = ouvrages.filter(function (o) {
                return o.type === 'village' && o.geometrie && o.geometrie.length >= 3;
            });
            poly.forEach(function (o) {
                var k = 'mw-vg-' + o.id;
                removeCouche(k); desenregistrer(k);
                ajouterGeoJSON(k, [CORE.polygoneGeoJSON(o.geometrie, { nom: o.nom })], 'polygone', '#f59e0b');
            });
        }
        function majTout() {
            nettoyerCouchesToutes();
            majOuvragesCarte();
            majVillagesCarte();
            majTracesCarte();
            listeOuvrages();
            listeTraces();
            majProfilTraces();
            majAnalyse();
            majReseau();
        }

        // ── Analyse ──
        function majAnalyse() {
            var pl = CORE.plageAltitudes(ouvrages);
            parId('mw-alt-min').textContent = pl ? Math.round(pl.min) + ' m' : '—';
            parId('mw-alt-max').textContent = pl ? Math.round(pl.max) + ' m' : '—';
            parId('mw-alt-diff').textContent = pl ? Math.round(pl.max - pl.min) + ' m' : '—';
            parId('mw-dist-max').textContent = formatDist(CORE.distanceMax(ouvrages));
            var lenC = 0, benef = 0;
            (ouvrages || []).forEach(function (o) { benef += o.beneficiaires || 0; });
            (traces || []).forEach(function (t) { lenC += t.longueur_m || 0; });
            parId('mw-long-gp').textContent = formatDist(lenC);
            parId('mw-benef-gp').textContent = benef;
            parId('mw-nb-ouv').textContent = (ouvrages || []).length;
            majSysSysteme();
            majReseauUI();
        }

        // ── ANALYSE SYSTÈME SOURCE → VILLAGE ──
        function remplirSelectSys(sel, liste, typeEmoji) {
            if (!sel) return;
            var courant = parseInt(sel.value, 10) || 0;
            sel.innerHTML = '';
            if (!typeEmoji) {
                var o0 = document.createElement('option');
                o0.value = '';
                o0.textContent = sel.id === 'mw-sys-conso' ? '— Aucun —' : '— Choisir —';
                sel.appendChild(o0);
            }
            liste.forEach(function (o) {
                var op = document.createElement('option');
                op.value = o.id;
                op.textContent = (typeEmoji ? typeEmoji + ' ' : '') + (o.code ? o.code + ' · ' : '') + (o.nom || '#' + o.id) +
                    (o.altitude_m != null ? ' (' + Math.round(o.altitude_m) + ' m)' : '');
                if (o.id === courant) op.selected = true;
                sel.appendChild(op);
            });
        }

        function majSysSysteme() {
            remplirSelectSys(parId('mw-sys-source'),
                ouvrages.filter(function (o) { return o.type === 'source'; }), '💧');
            remplirSelectSys(parId('mw-sys-village'),
                ouvrages.filter(function (o) { return o.type === 'village'; }), '🏘️');
            remplirSelectSys(parId('mw-sys-conso'),
                ouvrages.filter(function (o) { return o.type === 'borne' || o.type === 'consommation'; }), '🚰');
            var selT = parId('mw-sys-trace');
            if (selT) {
                var cur = parseInt(selT.value, 10) || 0;
                selT.innerHTML = '<option value="">— Distance directe —</option>';
                traces.forEach(function (t) {
                    var op = document.createElement('option');
                    op.value = t.id;
                    op.textContent = '📏 ' + (t.nom || 'Tracé #' + t.id) + ' — ' +
                        Math.round(t.longueur_m || 0) + ' m';
                    if (t.id === cur) op.selected = true;
                    selT.appendChild(op);
                });
            }
            analyserSystemeUI();
        }

        function analyserSystemeUI() {
            var src = ouvrageParId(parseInt(parId('mw-sys-source').value, 10));
            var vlg = ouvrageParId(parseInt(parId('mw-sys-village').value, 10));
            var consoSel = parId('mw-sys-conso');
            var conso = [];
            Array.prototype.forEach.call(consoSel.options, function (op) {
                if (op.selected && op.value) conso.push(ouvrageParId(parseInt(op.value, 10)));
            });
            var trace = null;
            var tid = parseInt(parId('mw-sys-trace').value, 10);
            if (tid) traces.forEach(function (t) { if (t.id === tid) trace = t; });
            var r = CORE.analyserSysteme(src, vlg, conso, trace);
            var el = parId('mw-sys-resultat');
            if (!r) {
                el.innerHTML = '<p class="mw-indice">Choisissez une source et un village pour ' +
                    'analyser le système.</p>';
                return;
            }
            var lignes = [
                ['Distance source → village', formatDist(r.distance_m)],
                ['Dénivelé total', r.denivele_total_m != null ? Math.abs(r.denivele_total_m) + ' m' : '—'],
                ['Altitude source', r.altitude_source_m != null ? Math.round(r.altitude_source_m) + ' m' : '—'],
                ['Altitude village', r.altitude_village_m != null ? Math.round(r.altitude_village_m) + ' m' : '—'],
                ['Altitude bornes-fontaines',
                    r.bornes.count ? (r.bornes.min + '–' + r.bornes.max + ' m (moy ' + r.bornes.moy + ' m)') : '—'],
                ['Longueur du tracé', formatDist(r.longueur_m)],
                ['Pente moyenne', r.pente_moyenne_pct != null ? r.pente_moyenne_pct + ' %' : '—'],
                ['Point le plus haut', r.point_haut_m != null ? r.point_haut_m + ' m' : '—'],
                ['Point le plus bas', r.point_bas_m != null ? r.point_bas_m + ' m' : '—']
            ];
            var html = '<table class="mw-sys-table">' +
                '<tr><th colspan="2">SYNTHÈSE ' + (src.nom || 'Source').toUpperCase() + ' → ' +
                (vlg.nom || 'Village').toUpperCase() + '</th></tr>';
            lignes.forEach(function (l) {
                html += '<tr><td>' + l[0] + '</td><td>' + l[1] + '</td></tr>';
            });
            if (r.denivele_net_m != null && r.denivele_net_m < 0) {
                html += '<tr><td colspan="2" class="mw-indice">💚 Village plus bas que la source : ' +
                    'écoulement gravitaire possible.</td></tr>';
            } else if (r.denivele_net_m === 0) {
                html += '<tr><td colspan="2" class="mw-indice">⚠ Altitudes identiques : vérifier la pente de pose.</td></tr>';
            } else if (r.denivele_net_m != null && r.denivele_net_m > 0) {
                html += '<tr><td colspan="2" class="mw-indice">⚠ Village plus haut que la source : ' +
                    'pompage ou recherche d\'une source plus élevée requis.</td></tr>';
            }
            html += '</table>';
            el.innerHTML = html;
        }

        function ouvrageParId(id) {
            for (var i = 0; i < ouvrages.length; i++) {
                if (ouvrages[i].id === id) return ouvrages[i];
            }
            return null;
        }

        // ── RÉSEAU D'ADDUCTION : chaîne SOURCE → CAPTAGE → CONDUITE → RÉSERVOIR → BORNE-FONTAINE ──
        function majReseauUI() {
            var chaine = [
                { cle: 'source', label: 'Source', emoji: '💧', ok: 0, total: 1 },
                { cle: 'captage', label: 'Captage', emoji: '🚰', ok: 0, total: 1 },
                { cle: 'conduite', label: 'Conduite', emoji: '📏', ok: 0, total: 1 },
                { cle: 'reservoir', label: 'Réservoir', emoji: '🛢️', ok: 0, total: 1 },
                { cle: 'borne', label: 'Borne-fontaine', emoji: '🚰', ok: 0, total: 1 }
            ];
            (ouvrages || []).forEach(function (o) {
                chaine.forEach(function (c) {
                    if (o.type === c.cle && c.cle !== 'borne') c.ok += 1;
                    else if (c.cle === 'borne' && (o.type === 'borne' || o.type === 'consommation')) c.ok += 1;
                });
            });
            (traces || []).forEach(function () { chaine[2].ok += 1; });
            var html = '';
            chaine.forEach(function (c, i) {
                var present = c.ok > 0;
                html += '<div class="mw-ligne"><span>' + (i ? '→ ' : '') + c.emoji + ' ' + c.label +
                    (c.ok ? ' <b class="mw-nb">×' + c.ok + '</b>' : '') +
                    '</span><b style="color:' + (present ? '#4ade80' : '#f87171') + '">' +
                    (present ? '✓' : '✗') + '</b></div>';
            });
            parId('mw-reseau-chaine').innerHTML = html;
            var eq = ouvrages.filter(function (o) { return o.type === 'reseau'; });
            var eqHtml = eq.length
                ? eq.map(function (o) {
                    var st = CORE.reseauLabel(o.sous_type);
                    return '<div class="i"><span>' + CORE.emojiOuvrage('reseau', o.sous_type) + ' ' +
                        trad(st, o.sous_type) + ' — ' + (o.nom || '#' + o.id) + '</span>' +
                        '<b>' + (o.altitude_m != null ? Math.round(o.altitude_m) + ' m' : '') + '</b></div>';
                }).join('')
                : '<p class="mw-indice">Aucun équipement de réseau (vanne, ventouse, pompage…).</p>';
            parId('mw-reseau-equipements').innerHTML =
                (eq.length ? '<p class="mw-indice">Équipements du réseau (' + eq.length + ') :</p>' : '') + eqHtml;
        }

        // ── CONSTRUCTEUR VISUEL DE RÉSEAU ──
        var reseauRelierActif = false;
        var reseauPoints = [];
        var reseauRelies = [];

        function demarrerRelier() {
            if (!projetActif) { message('Sélectionnez d\'abord un projet.', 'erreur'); return; }
            reseauPoints = [];
            reseauRelies = [];
            reseauRelierActif = true;
            parId('mw-rs-relier').hidden = true;
            parId('mw-rs-fin').hidden = false;
            parId('mw-rs-ann').hidden = false;
            majReseauRelie();
            removeCouche('mw-rs-tmp');
            message('Cliquez les ouvrages du réseau dans l\'ordre (source → captage → réservoir → borne).', 'info');
        }

        function annulerRelier() {
            reseauPoints = [];
            reseauRelies = [];
            reseauRelierActif = false;
            parId('mw-rs-relier').hidden = false;
            parId('mw-rs-fin').hidden = true;
            parId('mw-rs-ann').hidden = true;
            majReseauRelie();
            removeCouche('mw-rs-tmp');
        }

        function terminerRelier() {
            if (reseauPoints.length < 2) { message('Au moins 2 points requis.', 'erreur'); return; }
            if (!projetActif) return;
            var nom = parId('mw-rs-nom').value.trim() || 'Conduite du réseau';
            post(apiTraces, {
                projet_id: projetActif.id,
                nom: nom,
                coordonnees: reseauPoints,
                observations: 'Conduite du réseau : ' + reseauRelies.map(function (r) {
                    return r.ouvrage.type + '#' + r.ouvrage.id;
                }).join(' → ')
            }).then(function (d) {
                if (!d.ok) { message(d.erreur || 'Erreur.', 'erreur'); return; }
                traces.push(d.trace);
                annulerRelier();
                majTout();
                message('Conduite du réseau enregistrée (' + Math.round(d.trace.longueur_m) + ' m, ' +
                    reseauRelies.length + ' ouvrage(s) relié(s)).', 'succes');
            });
        }

        function majReseauRelie() {
            parId('mw-rs-len').textContent = formatDist(CORE.longueurTrace(reseauPoints));
            parId('mw-rs-nb').textContent = reseauRelies.length;
            var el = parId('mw-rs-liste');
            el.innerHTML = reseauRelies.length
                ? reseauRelies.map(function (r) {
                    return '<div class="i"><span>' + CORE.emojiOuvrage(r.ouvrage.type, r.ouvrage.sous_type) +
                        ' ' + ex(r.ouvrage.nom || r.ouvrage.type + ' #' + r.ouvrage.id) + '</span></div>';
                }).join('')
                : '<p class="mw-indice">Aucun ouvrage relié pour l\'instant.</p>';
        }

        function ajouterPointReseau(lng, lat, alt) {
            if (!reseauRelierActif) return;
            var o = CORE.ouvragePlusProche(ouvrages, lng, lat, 60);
            if (o) {
                if (reseauRelies.some(function (r) { return r.ouvrage.id === o.id; })) {
                    message('Cet ouvrage est déjà relié.', 'erreur');
                    return;
                }
                reseauPoints.push([lng, lat, o.altitude_m != null ? o.altitude_m : null]);
                reseauRelies.push({ ouvrage: o });
            } else {
                reseauPoints.push([lng, lat, alt]);
            }
            majReseauRelie();
            removeCouche('mw-rs-tmp');
            if (reseauPoints.length >= 2) {
                ajouterGeoJSON('mw-rs-tmp', [CORE.traceGeoJSON(reseauPoints, {})], 'line', '#8b5cf6');
            }
        }

        function majReseau() {
            var sel = parId('mw-rs-filtre');
            if (!sel) return;
            var courant = sel.value || '';
            var types = [];
            ouvrages.forEach(function (o) {
                if (types.indexOf(o.type) === -1) types.push(o.type);
            });
            sel.innerHTML = '<option value="">Tous les ouvrages</option>';
            types.sort().forEach(function (t) {
                var op = document.createElement('option');
                op.value = t;
                op.textContent = (TYPES[t] || {}).emoji + ' ' + (TYPES[t] || {}).label || t;
                sel.appendChild(op);
            });
            if (types.indexOf(courant) !== -1) sel.value = courant;
            var el = parId('mw-rs-ouvrages');
            var liste = courant ? ouvrages.filter(function (o) { return o.type === courant; }) : ouvrages;
            if (!liste.length) { el.textContent = 'Aucun ouvrage.'; return; }
            el.innerHTML = '';
            liste.forEach(function (o) {
                var div = document.createElement('div');
                div.className = 'i';
                var st = o.sous_type ? CORE.emojiOuvrage(o.type, o.sous_type) : (TYPES[o.type] || {}).emoji;
                div.innerHTML = '<span>' + st + ' ' + ex(o.nom || o.type + ' #' + o.id) + '</span>' +
                    '<b>' + (o.altitude_m != null ? Math.round(o.altitude_m) + ' m' : '') + '</b>';
                div.addEventListener('click', function () {
                    carte.flyTo({ center: [o.longitude, o.latitude], zoom: Math.max(carte.getZoom(), 15) });
                });
                el.appendChild(div);
            });
            majSitesReservoir();
        }

        function majSitesReservoir() {
            var el = parId('mw-sites-reservoir');
            if (!el) return;
            var sites = CORE.sitesPotentielsReservoir(ouvrages, traces);
            if (!sites.length) {
                el.textContent = 'Aucun point haut repéré. Ajoutez des repères point haut / sommet / colline (avec altitude) ou dessinez des tracés.';
                return;
            }
            el.innerHTML = '';
            sites.forEach(function (s) {
                var div = document.createElement('div');
                div.className = 'i';
                var ic = s.source === 'repere' ? '📍' : '📐';
                var origine = s.source === 'repere' ? 'Repère' : 'Point culminant du tracé';
                div.innerHTML = '<span>' + ic + ' ' + ex(s.nom) + ' · ' + origine + '</span>' +
                    '<b>' + Math.round(s.altitude_m) + ' m</b>';
                div.addEventListener('click', function () {
                    carte.flyTo({ center: [s.longitude, s.latitude], zoom: Math.max(carte.getZoom(), 15) });
                });
                el.appendChild(div);
            });
        }

        // ── Profil canvas ──
        function dessinerProfil(profil) {
            var cv = parId('mw-chart');
            if (!cv || !cv.getContext) return;
            var ctx = cv.getContext('2d');
            ctx.clearRect(0, 0, cv.width, cv.height);
            if (!profil || profil.length < 2) {
                ctx.fillStyle = '#a0a3c2'; ctx.font = '10px sans-serif';
                ctx.fillText('Aucun profil altimétrique', 8, 45);
                return;
            }
            var w = cv.width, h = cv.height, pad = 8;
            var altMin = Infinity, altMax = -Infinity, distMax = 0;
            var pts = profil.filter(function (p) { return p.alt != null; });
            if (!pts.length) return;
            profil.forEach(function (p) {
                if (p.alt != null) { if (p.alt < altMin) altMin = p.alt; if (p.alt > altMax) altMax = p.alt; }
                if (p.dist > distMax) distMax = p.dist;
            });
            if (altMin === altMax) { altMin -= 1; altMax += 1; }
            var X = function (d) { return pad + (d / (distMax || 1)) * (w - 2 * pad); };
            var Y = function (a) { return h - pad - ((a - altMin) / (altMax - altMin)) * (h - 2 * pad); };
            ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2; ctx.beginPath();
            var deb = false;
            pts.forEach(function (p) {
                var x = X(p.dist), y = Y(p.alt);
                if (!deb) { ctx.moveTo(x, y); deb = true; } else { ctx.lineTo(x, y); }
            });
            ctx.stroke();
            ctx.fillStyle = '#a0a3c2'; ctx.font = '9px sans-serif';
            ctx.fillText(Math.round(altMin) + ' m', 2, h - 2);
            ctx.fillText(Math.round(altMax) + ' m', 2, 12);
        }

        // ── PROFIL EN LONG ──
        var profilCourant = [];
        var traceProfilCourante = null;

        function majProfilTraces() {
            var sel = parId('mw-profil-trace');
            if (!sel) return;
            var courant = parseInt(sel.value, 10) || (traceProfilCourante ? traceProfilCourante.id : null);
            var existe = false;
            sel.innerHTML = '<option value="">— Choisir une trace —</option>';
            traces.forEach(function (t) {
                var o = document.createElement('option');
                o.value = t.id;
                o.textContent = '📏 ' + (t.nom || 'Tracé #' + t.id) + ' — ' +
                    Math.round(t.longueur_m || 0) + ' m';
                if (courant === t.id) { o.selected = true; existe = true; }
                sel.appendChild(o);
            });
            if (!existe && courant) { traceProfilCourante = null; profilCourant = []; }
        }

        function traceProfilSelectionnee() {
            var id = parseInt(parId('mw-profil-trace').value, 10);
            if (!id) return null;
            for (var i = 0; i < traces.length; i++) {
                if (traces[i].id === id) return traces[i];
            }
            return null;
        }

        function dessinerProfilLong() {
            var cv = parId('mw-profil-canvas');
            if (!cv || !cv.getContext) return;
            var ctx = cv.getContext('2d');
            ctx.clearRect(0, 0, cv.width, cv.height);
            var t = traceProfilSelectionnee();
            var info = parId('mw-profil-info');
            if (!t || !t.coordonnees || t.coordonnees.length < 2) {
                ctx.fillStyle = '#a0a3c2'; ctx.font = '12px sans-serif';
                ctx.fillText('Choisissez une trace pour afficher le profil en long.', 20, 120);
                if (info) { info.querySelector('span').textContent = 'Survolez le profil'; info.querySelector('b').textContent = '—'; }
                parId('mw-profil-analyse').innerHTML = '';
                return;
            }
            profilCourant = CORE.profilDetaille(t.coordonnees);
            traceProfilCourante = t;
            var w = cv.width, h = cv.height, padL = 46, padR = 12, padT = 14, padB = 22;
            var alts = profilCourant.filter(function (p) { return p.alt != null; });
            var altMin = Infinity, altMax = -Infinity, distMax = 0;
            profilCourant.forEach(function (p) {
                if (p.alt != null) { if (p.alt < altMin) altMin = p.alt; if (p.alt > altMax) altMax = p.alt; }
                if (p.dist > distMax) distMax = p.dist;
            });
            if (alts.length < 2) {
                ctx.fillStyle = '#a0a3c2'; ctx.font = '12px sans-serif';
                ctx.fillText('Altitude indisponible pour cette trace.', 20, 120);
                return;
            }
            if (altMin === altMax) { altMin -= 2; altMax += 2; }
            var X = function (d) { return padL + (d / (distMax || 1)) * (w - padL - padR); };
            var Y = function (a) { return h - padB - ((a - altMin) / (altMax - altMin)) * (h - padT - padB); };
            // Grille + axes
            ctx.strokeStyle = 'rgba(100,110,150,.25)'; ctx.lineWidth = 1;
            for (var g = 0; g <= 4; g++) {
                var gx = padL + (g / 4) * (w - padL - padR);
                ctx.beginPath(); ctx.moveTo(gx, padT); ctx.lineTo(gx, h - padB); ctx.stroke();
                ctx.fillStyle = '#a0a3c2'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
                ctx.fillText(Math.round(distMax * g / 4 / 10) / 100 + ' km', gx, h - 8);
            }
            for (var ga = 0; ga <= 4; ga++) {
                var ay = Y(altMin + ((altMax - altMin) * ga / 4));
                ctx.beginPath(); ctx.moveTo(padL, ay); ctx.lineTo(w - padR, ay); ctx.stroke();
                ctx.fillStyle = '#a0a3c2'; ctx.font = '9px sans-serif'; ctx.textAlign = 'right';
                ctx.fillText(Math.round(altMin + ((altMax - altMin) * ga / 4)) + ' m', padL - 5, ay + 3);
            }
            ctx.textAlign = 'left';
            // Zones d'attention (fond)
            CORE.zonesAttention(profilCourant, 10, 1).forEach(function (z) {
                var x1 = X(z.debut_dist), x2 = X(z.fin_dist);
                ctx.fillStyle = z.raison === 'contre_pente' ? 'rgba(245,158,11,.22)' : 'rgba(239,68,68,.20)';
                ctx.fillRect(x1, padT, Math.max(1, x2 - x1), h - padT - padB);
            });
            // Ligne du profil
            ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2; ctx.beginPath();
            var deb = false;
            profilCourant.forEach(function (p) {
                if (p.alt == null) return;
                var x = X(p.dist), y = Y(p.alt);
                if (!deb) { ctx.moveTo(x, y); deb = true; } else { ctx.lineTo(x, y); }
            });
            ctx.stroke();
            // Points hauts / bas
            CORE.extremaProfil(profilCourant).forEach(function (e) {
                var x = X(e.dist), y = Y(e.alt);
                ctx.fillStyle = e.type === 'haut' ? '#22c55e' : '#ef4444';
                ctx.beginPath();
                if (e.type === 'haut') {
                    ctx.moveTo(x, y - 6); ctx.lineTo(x + 6, y + 4); ctx.lineTo(x - 6, y + 4);
                } else {
                    ctx.moveTo(x - 6, y - 4); ctx.lineTo(x + 6, y - 4); ctx.lineTo(x, y + 6);
                }
                ctx.closePath(); ctx.fill();
            });
            // Réservoir potentiel
            var res = CORE.reservoirPotentiel(profilCourant);
            if (res && res.alt != null) {
                var xr = X(res.dist), yr = Y(res.alt);
                ctx.fillStyle = '#a855f7';
                ctx.beginPath(); ctx.arc(xr, yr - 8, 5, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
                ctx.fillText('R', xr, yr - 5);
                ctx.textAlign = 'left';
            }
            // Repères proches
            CORE.reperesSurTrace(t.coordonnees, ouvrages, 100).forEach(function (r) {
                var x = X(r.dist_cumulee_m), y = Y(r.ouvrage.altitude_m != null ? r.ouvrage.altitude_m : altMin);
                ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x - 5, y); ctx.lineTo(x, y - 5); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 5);
                ctx.closePath(); ctx.stroke();
                ctx.fillStyle = '#f59e0b'; ctx.font = '8px sans-serif';
                ctx.fillText(r.ouvrage.sous_type_label || r.ouvrage.sous_type || 'repère', x + 7, y - 4);
            });
            ctx.fillStyle = '#22d3ee'; ctx.font = 'bold 10px sans-serif';
            ctx.fillText('Profil en long — ' + (t.nom || 'Tracé #' + t.id), padL, 12);
            majProfilAnalyse(t);
        }

        function majProfilAnalyse(t) {
            var el = parId('mw-profil-analyse');
            if (!el) return;
            var lignes = [];
            var a = CORE.analyseTraceGps(t.coordonnees);
            lignes.push('<div class="mw-ligne"><span>Longueur / horizontale</span><b>' +
                formatDist(a.longueur_totale) + ' / ' + formatDist(a.distance_horizontale) + '</b></div>');
            lignes.push('<div class="mw-ligne"><span>Dénivelé + / − / net</span><b>+' +
                Math.round(a.denivele_positif) + ' / −' + Math.round(a.denivele_negatif) + ' / ' +
                (CORE.deniveleNet(t.coordonnees) != null ? Math.round(CORE.deniveleNet(t.coordonnees)) : '—') +
                ' m</b></div>');
            var ex = CORE.extremaProfil(profilCourant);
            if (ex.length) {
                lignes.push('<div class="mw-ligne"><span>Points hauts / bas</span><b>' +
                    ex.filter(function (e) { return e.type === 'haut'; }).length + ' / ' +
                    ex.filter(function (e) { return e.type === 'bas'; }).length + '</b></div>');
                ex.forEach(function (e) {
                    lignes.push('<div class="mw-ligne" style="font-size:.68rem"><span>' +
                        (e.type === 'haut' ? '▲' : '▼') + ' ' +
                        (e.type === 'haut' ? 'Haut' : 'Bas') + ' @ ' + Math.round(e.dist) + ' m</span><b>' +
                        Math.round(e.alt) + ' m</b></div>');
                });
            }
            var res = CORE.reservoirPotentiel(profilCourant);
            if (res) {
                lignes.push('<div class="mw-ligne" style="color:#a855f7"><span>🛢 Réservoir potentiel</span><b>' +
                    Math.round(res.dist) + ' m · ' + Math.round(res.alt) + ' m</b></div>');
            }
            var za = CORE.zonesAttention(profilCourant, 10, 1);
            if (za.length) {
                lignes.push('<div class="mw-ligne"><span>Zones à attention technique</span><b>' +
                    za.length + '</b></div>');
                za.forEach(function (z) {
                    lignes.push('<div class="mw-ligne" style="font-size:.68rem"><span>' +
                        (z.raison === 'contre_pente' ? '↗ Contre-pente' : '⚠ Forte pente') +
                        ' @ ' + Math.round(z.debut_dist) + '–' + Math.round(z.fin_dist) + ' m</span><b>' +
                        z.longueur_m + ' m</b></div>');
                });
            }
            var reps = CORE.reperesSurTrace(t.coordonnees, ouvrages, 100);
            if (reps.length) {
                lignes.push('<div class="mw-ligne"><span>Repères sur le tracé</span><b>' +
                    reps.length + '</b></div>');
                reps.forEach(function (r) {
                    lignes.push('<div class="mw-ligne" style="font-size:.68rem"><span>🧭 ' +
                        ex(r.ouvrage.nom || 'repère') + '</span><b>' + Math.round(r.dist_cumulee_m) +
                        ' m · ' + r.dist_m + ' m</b></div>');
                });
            }
            if (!lignes.length) lignes.push('<div class="mw-ligne"><span>Aucune donnée</span><b>—</b></div>');
            el.innerHTML = lignes.join('');
        }

        parJouet(parId('mw-profil-trace'), 'change', dessinerProfilLong);

        parId('mw-profil-canvas').addEventListener('mousemove', function (e) {
            var cv = parId('mw-profil-canvas');
            var info = parId('mw-profil-info');
            if (!profilCourant.length || profilCourant.length < 2 || !info) return;
            var rect = cv.getBoundingClientRect();
            var relX = (e.clientX - rect.left) * (cv.width / rect.width);
            var padL = 46, w = cv.width, padR = 12;
            var distMax = profilCourant[profilCourant.length - 1].dist || 1;
            var dist = ((relX - padL) / (w - padL - padR)) * distMax;
            var meilleur = null;
            for (var i = 0; i < profilCourant.length; i++) {
                var p = profilCourant[i];
                if (!meilleur || Math.abs(p.dist - dist) < Math.abs(meilleur.p.dist - dist)) {
                    meilleur = { p: p, i: i };
                }
            }
            var m = meilleur;
            var rep = CORE.reperesSurTrace(traceProfilCourante ? traceProfilCourante.coordonnees : [], ouvrages, 100);
            var repPoint = null;
            rep.forEach(function (r) {
                if (r.index_point === m.i) repPoint = r.ouvrage;
            });
            var txt = 'D ' + Math.round(m.p.dist) + ' m · Alt ' + (m.p.alt != null ? Math.round(m.p.alt) + ' m' : '—') +
                ' · Pente ' + (m.p.pente != null ? m.p.pente.toFixed(1) + ' %' : '—') +
                ' · ' + m.p.lat.toFixed(5) + ', ' + m.p.lon.toFixed(5);
            if (repPoint) {
                txt += ' · 🧭 ' + (repPoint.sous_type_label || repPoint.sous_type || 'repère');
            }
            info.querySelector('span').textContent = txt;
            info.querySelector('b').textContent = m.p.dist.toFixed(0) + ' m';
        });
        parId('mw-profil-canvas').addEventListener('mouseleave', function () {
            var info = parId('mw-profil-info');
            if (info) {
                info.querySelector('span').textContent = 'Survolez le profil';
                info.querySelector('b').textContent = '—';
            }
        });

        parJouet(parId('mw-export-png'), 'click', function () {
            var cv = parId('mw-profil-canvas');
            if (!cv) return;
            var nom = (traceProfilCourante && traceProfilCourante.nom || 'profil').toLowerCase().replace(/\s+/g, '_');
            var a = document.createElement('a');
            a.href = cv.toDataURL('image/png');
            a.download = 'profil_en_long_' + nom + '.png';
            document.body.appendChild(a);
            a.click();
            setTimeout(function () { a.remove(); }, 1500);
            message('Profil exporté en image (PNG).', 'succes');
        });

        parJouet(parId('mw-export-pdf'), 'click', function () {
            var t = traceProfilSelectionnee();
            if (!t) { message('Choisissez d\'abord une trace.', 'erreur'); return; }
            fetch(apiTraces + t.id + '/profil.pdf', { credentials: 'same-origin',
                headers: { 'X-Requested-With': 'XMLHttpRequest' } })
                .then(function (r) {
                    if (!r.ok) { message('Export PDF indisponible.', 'erreur'); return null; }
                    return r.blob();
                })
                .then(function (blob) {
                    if (!blob) return;
                    var nom = (t.nom || 'trace_' + t.id).toLowerCase().replace(/\s+/g, '_');
                    var a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = 'profil_en_long_' + nom + '.pdf';
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
                    message('Profil exporté en PDF.', 'succes');
                });
        });

        // ── ANALYSE SYSTÈME SOURCE → VILLAGE ──
        parJouet(parId('mw-sys-analyser'), 'click', function () {
            if (!parId('mw-sys-source').value || !parId('mw-sys-village').value) {
                message('Choisissez une source et un village.', 'erreur');
            }
            analyserSystemeUI();
        });
        ['mw-sys-source', 'mw-sys-village', 'mw-sys-conso', 'mw-sys-trace'].forEach(function (id) {
            var sel = parId(id);
            if (!sel) return;
            sel.addEventListener('change', analyserSystemeUI);
        });

        // ── Rapport ──
        parId('mw-gen-rapport').addEventListener('click', function () {
            if (!projetActif) { message('Sélectionnez d\'abord un projet.', 'erreur'); return; }
            parId('mw-rapport').value = CORE.rapportTerrain(projetActif, ouvrages, traces);
            message('Rapport généré.', 'succes');
        });

        function telecharger(nom, contenu, mime) {
            var blob = new Blob([contenu], { type: mime });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = nom;
            document.body.appendChild(a);
            a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
        }
        function nomFichier() {
            var base = (projetActif && projetActif.nom || 'adduction').toLowerCase().replace(/\s+/g, '_');
            return 'adduction_' + base;
        }
        function assemblerGeoJSON() {
            var feats = [];
            if (projetActif && projetActif.bbox && projetActif.bbox.length === 4) {
                var b = projetActif.bbox;
                feats.push({
                    type: 'Feature', properties: { nom: 'Zone d\'intervention' },
                    geometry: { type: 'Polygon', coordinates: [[
                        [b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]
                    ]] }
                });
            }
            feats = feats.concat(CORE.ouvragesGeoJSON(ouvrages).features);
            traces.forEach(function (t) {
                feats.push(CORE.traceGeoJSON(t.coordonnees, { nom: t.nom, id: t.id }));
            });
            return feats;
        }
        function assemblerGPX() {
            var L = [];
            L.push('<?xml version="1.0" encoding="UTF-8"?>');
            L.push('<gpx version="1.1" creator="MUKMAP - Water Supply Survey" xmlns="http://www.topografix.com/GPX/1/1">');
            L.push('  <metadata><name>' + ex((projetActif && projetActif.nom) || '') + '</name></metadata>');
            ouvrages.forEach(function (o) {
                L.push('  <wpt lat="' + o.latitude + '" lon="' + o.longitude + '">');
                L.push('    <name>' + ex(o.nom || '') + '</name>');
                if (o.altitude_m != null) L.push('    <ele>' + o.altitude_m + '</ele>');
                L.push('  </wpt>');
            });
            traces.forEach(function (t) {
                if (!t.coordonnees || !t.coordonnees.length) return;
                L.push('  <trk><name>' + ex(t.nom || '') + '</name><trkseg>');
                t.coordonnees.forEach(function (c) {
                    var extra = c[2] != null ? ' ele="' + c[2] + '"' : '';
                    L.push('    <trkpt lat="' + c[1] + '" lon="' + c[0] + '"' + extra + '/>');
                });
                L.push('  </trkseg></trk>');
            });
            L.push('</gpx>');
            return L.join('\n');
        }

        parJouet(parId('mw-exp-json'), 'click', function () {
            if (!projetActif) return;
            telecharger(nomFichier() + '.geojson',
                JSON.stringify({ type: 'FeatureCollection', features: assemblerGeoJSON() }, null, 2),
                'application/geo+json');
        });
        parJouet(parId('mw-exp-csv'), 'click', function () {
            if (!projetActif) return;
            telecharger(nomFichier() + '.csv', CORE.ouvragesCSV(ouvrages), 'text/csv');
        });
        parJouet(parId('mw-exp-gpx'), 'click', function () {
            if (!projetActif) return;
            telecharger(nomFichier() + '.gpx', assemblerGPX(), 'application/gpx+xml');
        });

        // ── Onglets ──
        var ongletCourant = 'projet';
        function choisirOnglet(tab) {
            ongletCourant = tab;
            panneau.querySelectorAll('[data-panel]').forEach(function (el) {
                el.hidden = el.getAttribute('data-panel') !== tab;
            });
            panneau.querySelectorAll('.mw-onglets button').forEach(function (b) {
                b.classList.toggle('actif', b.getAttribute('data-tab') === tab);
            });
            if (tab === 'analyse') majAnalyse();
            if (tab === 'collecte') listeOuvrages();
            if (tab === 'trace') { afficherMesures(); listeTraces(); }
            if (tab === 'reseau') { majReseauUI(); majReseau(); }
            if (tab === 'mesures') majMesures();
        }
        panneau.querySelectorAll('.mw-onglets button').forEach(function (b) {
            b.addEventListener('click', function () { choisirOnglet(b.getAttribute('data-tab')); });
        });

        // ── Constructeur de réseau ──
        parJouet(parId('mw-rs-relier'), 'click', demarrerRelier);
        parJouet(parId('mw-rs-fin'), 'click', terminerRelier);
        parJouet(parId('mw-rs-ann'), 'click', annulerRelier);
        parJouet(parId('mw-rs-filtre'), 'change', majReseau);

        // ── Boîte à outils : mesures terrain ──
        var mesureClicActif = false;
        var mesureClics = [];

        function formaterDistance(m) {
            if (m == null) return '—';
            if (m >= 1000) return Math.round(m) + ' m (' + (m / 1000).toFixed(2) + ' km)';
            return Math.round(m) + ' m';
        }
        function formaterAire(m2) {
            if (m2 == null) return '—';
            if (m2 >= 1000000) return Math.round(m2 / 1000000) + ' km²';
            if (m2 >= 20000) return Math.round(m2 / 10000) + ' ha (' + Math.round(m2) + ' m²)';
            return Math.round(m2) + ' m²';
        }
        function remplirSelectOuvrages(sel) {
            var options = '<option value="">— Choisir —</option>';
            ['source', 'reservoir', 'consommation', 'borne', 'village', 'repere', 'reseau'].forEach(function (t) {
                var liste = ouvrages.filter(function (o) { return o.type === t; });
                if (!liste.length) return;
                var emoji = (TYPES[t] || {}).emoji || '📍';
                options += '<optgroup label="' + emoji + ' ' + ((TYPES[t] || {}).label || t) + '">';
                liste.forEach(function (o) {
                    var alt = o.altitude_m != null ? ' · ' + Math.round(o.altitude_m) + ' m' : '';
                    options += '<option value="' + o.id + '">' + ex(o.nom || t + ' #' + o.id) + alt + '</option>';
                });
                options += '</optgroup>';
            });
            sel.innerHTML = options;
        }
        function remplirObjSurface() {
            var sel = parId('mw-ms-obj');
            var type = parId('mw-ms-type').value;
            if (type === 'village') {
                var villages = ouvrages.filter(function (o) { return o.type === 'village'; });
                sel.innerHTML = '<option value="">— Village (polygone requis) —</option>';
                villages.forEach(function (o) {
                    sel.innerHTML += '<option value="' + o.id + '">' + ex(o.nom) +
                        (o.geometrie && o.geometrie.length >= 3 ? ' · polygone ✓' : ' · point') + '</option>';
                });
            } else if (type === 'bassin') {
                sel.innerHTML = '<option value="">— Point d\'intérêt (source…) —</option>';
                ouvrages.forEach(function (o) {
                    if (o.longitude == null) return;
                    sel.innerHTML += '<option value="' + o.id + '">' + ex(o.nom || o.type + ' #' + o.id) +
                        (o.altitude_m != null ? ' · ' + Math.round(o.altitude_m) + ' m' : '') + '</option>';
                });
            } else {
                sel.innerHTML = '<option value="auto">Calcul automatique</option>';
            }
        }
        function majMesures() {
            remplirSelectOuvrages(parId('mw-ms-a'));
            remplirSelectOuvrages(parId('mw-ms-b'));
            remplirObjSurface();
            var selT = parId('mw-ms-trace');
            selT.innerHTML = '<option value="">— Aucune conduite —</option>';
            traces.forEach(function (tr) {
                selT.innerHTML += '<option value="' + tr.id + '">' + ex(tr.nom || 'Trace #' + tr.id) + '</option>';
            });
            dessinerSurfaceSelonType();
            recalculerMesures();
            majPenteTrace();
        }
        function recalculerMesures() {
            var a = ouvrageParId(parId('mw-ms-a').value);
            var b = ouvrageParId(parId('mw-ms-b').value);
            var d = a && b ? CORE.distanceOuvrages(a, b) : null;
            parId('mw-ms-dist').textContent = formaterDistance(d);
            var dn = a && b ? CORE.deniveleEntre(a, b) : null;
            parId('mw-ms-alt-a').textContent = dn ? Math.round(dn.altA) + ' m' : '—';
            parId('mw-ms-alt-b').textContent = dn ? Math.round(dn.altB) + ' m' : '—';
            parId('mw-ms-alt-d').textContent = dn ? Math.round(Math.abs(dn.difference) * 10) / 10 + ' m' : '—';
            var p = a && b ? CORE.penteEntre(a, b) : null;
            parId('mw-ms-pente').textContent = p ? p.pente_pct + ' %' : '—';
            dessinerLigneMesure(a, b);
        }
        function majPenteTrace() {
            var sel = parId('mw-ms-trace');
            var el = parId('mw-ms-pente-trace');
            var tr = null;
            traces.forEach(function (t) { if (String(t.id) === sel.value) tr = t; });
            if (!tr) { el.textContent = ''; return; }
            var res = CORE.penteTrace(tr);
            if (!res) { el.textContent = 'Altitude manquante sur la conduite : pente impossible.'; return; }
            el.innerHTML = '';
            [['Longueur', formaterDistance(res.longueur_m)],
             ['Dénivelé total', Math.round(res.denivele_m) + ' m'],
             ['Pente moyenne', res.pente_pct + ' %'],
             ['Pente max', res.pente_max_pct + ' %']].forEach(function (ligne) {
                var di = document.createElement('div');
                di.className = 'mw-ligne';
                di.innerHTML = '<span>' + ligne[0] + '</span><b>' + ligne[1] + '</b>';
                el.appendChild(di);
            });
        }
        function dessinerLigneMesure(a, b) {
            removeCouche('mw-ms-ligne');
            if (a && b && a.longitude != null && b.longitude != null) {
                ajouterGeoJSON('mw-ms-ligne', [CORE.traceGeoJSON([[a.longitude, a.latitude], [b.longitude, b.latitude]], { nom: 'Mesure' })], 'line', '#22d3ee');
            }
        }
        function dessinerSurface(poly, nom) {
            removeCouche('mw-ms-surf');
            if (!poly || !poly.length) return;
            ajouterGeoJSON('mw-ms-surf', [CORE.polygoneGeoJSON(poly.concat([poly[0]]), { nom: nom || 'Surface' })], 'polygone', '#f59e0b');
        }
        function dessinerSurfaceSelonType() {
            var type = parId('mw-ms-type').value;
            parId('mw-ms-rayon-ligne').hidden = type !== 'bassin';
            parId('mw-ms-bassin-avert').hidden = type !== 'bassin';
        }
        function calculerSurface() {
            var type = parId('mw-ms-type').value;
            var res = null, nom = '';
            if (type === 'village') {
                var o = ouvrageParId(parId('mw-ms-obj').value);
                if (!o) { message('Sélectionnez un village (polygone requis).', 'erreur'); return; }
                if (!o.geometrie || o.geometrie.length < 3) { message('Ce village n\'a pas de polygone.', 'erreur'); return; }
                res = { polygone: o.geometrie, aire_m2: CORE.airePolygoneGeo(o.geometrie), nb_points: o.geometrie.length };
                nom = 'Zone du village : ' + (o.nom || '');
            } else if (type === 'emprise') {
                res = CORE.bboxOuvrages(ouvrages);
                if (!res) { message('Aucun ouvrage pour calculer l\'emprise.', 'erreur'); return; }
                nom = 'Emprise du projet (rectangle englobant des ouvrages)';
            } else if (type === 'intervention') {
                res = CORE.zoneIntervention(ouvrages);
                if (!res) { message('Moins de 3 ouvrages pour délimiter la zone d\'intervention.', 'erreur'); return; }
                nom = 'Zone d\'intervention (enveloppe des ouvrages clés)';
            } else if (type === 'bassin') {
                var c = ouvrageParId(parId('mw-ms-obj').value);
                if (!c) { message('Sélectionnez un point d\'intérêt (source, repère…).', 'erreur'); return; }
                var rayon = toF(parId('mw-ms-rayon').value) || 2;
                res = CORE.bassinVersantApprox(c, ouvrages, traces, rayon);
                if (!res) {
                    message('Données insuffisantes : il faut ≥ 3 points de terrain plus élevés que le point, à moins de ' + rayon + ' km.', 'erreur');
                    return;
                }
                nom = 'Bassin versant approximatif (' + res.nb_points + ' points de terrain)';
            }
            parId('mw-ms-aire').textContent = formaterAire(res.aire_m2);
            parId('mw-ms-surf-info').textContent = nom;
            dessinerSurface(res.polygone, nom);
            message('Surface : ' + formaterAire(res.aire_m2), 'succes');
        }
        function appliquerPreset(preset) {
            function premier(type, sousType) {
                for (var i = 0; i < ouvrages.length; i++) {
                    var o = ouvrages[i];
                    if (o.type === type && (!sousType || o.sous_type === sousType)) return o;
                }
                if (sousType) return premier(type);
                return null;
            }
            var a = null, b = null;
            if (preset === 'source_village') { a = premier('source'); b = premier('village') || premier('consommation'); }
            else if (preset === 'source_reservoir') { a = premier('source'); b = premier('reservoir'); }
            else if (preset === 'reservoir_borne') { a = premier('reservoir'); b = premier('consommation', 'borne_fontaine') || premier('consommation'); }
            if (!a || !b) { message('Ouvrages manquants pour ce préréglage (source, village, réservoir ou borne).', 'erreur'); return; }
            parId('mw-ms-a').value = String(a.id);
            parId('mw-ms-b').value = String(b.id);
            recalculerMesures();
            message('Préréglage appliqué : ' + ex(a.nom) + ' → ' + ex(b.nom) + '.', 'succes');
        }
        function basculerMesureClic() {
            mesureClicActif = !mesureClicActif;
            mesureClics = [];
            removeCouche('mw-ms-clic-p');
            removeCouche('mw-ms-clic-l');
            var bt = parId('mw-ms-clic');
            bt.textContent = mesureClicActif ? '🛑 Arrêter la mesure' : '📌 Mesurer sur la carte';
            message(mesureClicActif ? 'Cliquez la carte : point A…' : 'Mesure sur la carte désactivée.', 'info');
        }
        function ajouterClicMesure(lng, lat) {
            if (!mesureClicActif || mesureClics.length >= 2) return;
            var o = CORE.ouvragePlusProche(ouvrages, lng, lat, 60);
            var point = { latitude: lat, longitude: lng, altitude_m: o ? o.altitude_m : (toF(parId('mw-alt').value) || null) };
            if (o) point.nom = o.nom;
            mesureClics.push(point);
            if (mesureClics.length === 1) {
                ajouterGeoJSON('mw-ms-clic-p', [CORE.pointGeoJSON ? CORE.pointGeoJSON([lng, lat], { nom: 'A' }) : {
                    type: 'Feature', properties: { nom: 'A' },
                    geometry: { type: 'Point', coordinates: [lng, lat] }
                }], 'point', '#22d3ee');
                message('Point A (' + lat.toFixed(5) + ', ' + lng.toFixed(5) + ') — cliquez le point B.', 'info');
                return;
            }
            var a = mesureClics[0], b = mesureClics[1];
            removeCouche('mw-ms-clic-p');
            ajouterGeoJSON('mw-ms-clic-l', [CORE.traceGeoJSON([[a.longitude, a.latitude], [b.longitude, b.latitude]], { nom: 'Mesure carte' })], 'line', '#22d3ee');
            var d = CORE.distanceOuvrages(a, b);
            var dn = CORE.deniveleEntre(a, b);
            var p = CORE.penteEntre(a, b);
            parId('mw-ms-a').value = '';
            parId('mw-ms-b').value = '';
            parId('mw-ms-dist').textContent = formaterDistance(d);
            parId('mw-ms-alt-a').textContent = dn ? Math.round(dn.altA) + ' m' : (a.altitude_m != null ? Math.round(a.altitude_m) + ' m' : '—');
            parId('mw-ms-alt-b').textContent = dn ? Math.round(dn.altB) + ' m' : (b.altitude_m != null ? Math.round(b.altitude_m) + ' m' : '—');
            parId('mw-ms-alt-d').textContent = dn ? Math.round(Math.abs(dn.difference) * 10) / 10 + ' m' : '—';
            parId('mw-ms-pente').textContent = p ? p.pente_pct + ' %' : '—';
            var msg = 'Distance : ' + formaterDistance(d);
            if (p) msg += ' · Pente : ' + p.pente_pct + ' %';
            message(msg, 'succes');
        }
        parJouet(parId('mw-ms-a'), 'change', recalculerMesures);
        parJouet(parId('mw-ms-b'), 'change', recalculerMesures);
        parJouet(parId('mw-ms-trace'), 'change', majPenteTrace);
        parJouet(parId('mw-ms-type'), 'change', function () { remplirObjSurface(); dessinerSurfaceSelonType(); });
        parJouet(parId('mw-ms-calculer'), 'click', calculerSurface);
        parJouet(parId('mw-ms-clic'), 'click', basculerMesureClic);
        panneau.querySelectorAll('[data-preset]').forEach(function (bt) {
            bt.addEventListener('click', function () { appliquerPreset(bt.getAttribute('data-preset')); });
        });
        parJouet(parId('mw-ms-rayon'), 'change', function () { if (parId('mw-ms-type').value === 'bassin') calculerSurface(); });

        var bouton = document.createElement('button');
        bouton.id = 'mukmap-water-bouton';
        bouton.textContent = '💧';
        bouton.title = trad('water_titre', 'Adduction d\'eau · Water Supply');
        bouton.style.cssText = 'position:fixed;left:18px;top:70px;z-index:1150;width:46px;height:46px;' +
            'border-radius:50%;border:1px solid rgba(34,211,238,.5);background:rgba(34,211,238,.15);' +
            'color:#22d3ee;font-size:1.2rem;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.3);' +
            'display:flex;align-items:center;justify-content:center;';
        document.body.appendChild(bouton);
        bouton.addEventListener('click', function () {
            var visible = panneau.style.display === 'none';
            panneau.style.display = visible ? 'flex' : 'none';
            if (visible) choisirOnglet(ongletCourant);
        });
        panneau.querySelector('.mw-fermer').addEventListener('click', function () {
            panneau.style.display = 'none';
        });
        panneau.style.display = 'none';

        chargerProjets();
        return panneau;
    }

    global.MukmapWaterSupply = { CORE: CORE, demarrer: demarrer, TYPES: TYPES, STATUTS: STATUTS };
})(typeof window !== 'undefined' ? window : globalThis);