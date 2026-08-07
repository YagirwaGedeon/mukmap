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

    var CORE = {
        TYPES: TYPES,
        STATUTS: STATUTS,
        SOURCES: SOURCES,
        CONSOMMATIONS: CONSOMMATIONS,
        REPERES: REPERES,

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
                    var t = TYPES[o.type] || {};
                    return {
                        type: 'Feature',
                        properties: {
                            id: o.id, type: o.type, nom: o.nom, statut: o.statut,
                            altitude_m: o.altitude_m, beneficiaires: o.beneficiaires,
                            emoji: t.emoji || '📍'
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
            '<button type="button" data-tab="analyse">Analyse</button>' +
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
            '<div class="mw-ligne"><span>Nom</span><input type="text" id="mw-nom-trace" placeholder="Ex : conduite principale"></div>' +
            '<div class="mw-liste" id="mw-liste-traces"></div>' +
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
        // repere → REPÈRES / POINTS INTERMÉDIAIRES (H) ; sinon vide.
        function remplirSousTypes() {
            var ss = parId('mw-sous-type');
            var t = parId('mw-type').value;
            var liste = [];
            if (t === 'source') liste = CORE.sourcesListe();
            else if (t === 'consommation') liste = CORE.consommationsListe();
            else if (t === 'repere') liste = CORE.reperesListe();
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
            return obj;
        }
        function viderFormulaire() {
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
            parId('mw-c-photos').value = '';
            photosConsommation = [];
            photoRepere = '';
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
                div.innerHTML = '<span>' + t.emoji + ' ' + ex(o.nom || '—') +
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
            var rr = o.releve_repere || {};
            parId('mw-r-description').value = (rr.description || o.description || '');
            parId('mw-r-date').value = rr.date_releve || '';
            photoRepere = rr.photo || '';
            majApercuPhotos();
            parId('mw-maj-ouvrage').hidden = false;
            parId('mw-supp-ouvrage').hidden = false;
            parId('mw-maj-ouvrage').dataset.id = String(o.id);
            message('Ouvrage sélectionné : ' + (o.nom || '#' + o.id), 'info');
        }

        // ── Classification / représentation ──
        var geometrieCourante = [];
        var enDessinGeom = false;
        var photosConsommation = [];
        var photoRepere = '';

        // Aperçu des photos du point de consommation / repère.
        function majApercuPhotos() {
            parId('mw-c-photos-apercu').hidden = !photosConsommation.length;
            parId('mw-c-photos-nb').textContent = photosConsommation.length + ' photo' +
                (photosConsommation.length > 1 ? 's' : '');
            parId('mw-r-photo-apercu').hidden = !photoRepere;
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
            parId('mw-sous-type').hidden = !['source', 'consommation', 'repere'].includes(t);
            parId('mw-repr').hidden = t !== 'village';
            parId('mw-poly-actions').hidden = t !== 'village';
            parId('mw-poly-info').hidden = t !== 'village';
            parId('mw-form-village').hidden = t !== 'village';
            parId('mw-form-source').hidden = t !== 'source';
            parId('mw-s-avertissement').hidden = t !== 'source';
            parId('mw-form-consommation').hidden = t !== 'consommation';
            parId('mw-form-repere').hidden = t !== 'repere';
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
            post(apiTraces, {
                projet_id: projetActif.id,
                nom: parId('mw-nom-trace').value.trim(),
                coordonnees: traceCourant,
                observations: ''
            }).then(function (d) {
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
                var t = TYPES[o.type] || {};
                feats.push({
                    type: 'Feature',
                    properties: { id: o.id, nom: o.nom, type: o.type, statut: o.statut, emoji: t.emoji || '📍' },
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
            majAnalyse();
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
        }
        panneau.querySelectorAll('.mw-onglets button').forEach(function (b) {
            b.addEventListener('click', function () { choisirOnglet(b.getAttribute('data-tab')); });
        });

        // ── Bouton d'ouverture ──
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