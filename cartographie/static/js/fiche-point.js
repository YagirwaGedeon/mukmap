/* MUKMAP — Fiche detaillee d'un element de la carte (point / ouvrage hydraulique)
 *
 * Au clic sur un point ou un ouvrage, un panneau professionnel affiche
 * toutes les informations exactes de l'element, en 4 sections :
 *   Identification / Position / Technique / Documentation
 * avec les boutons : Modifier | Photos | Historique | Zoomer | Exporter.
 *
 * - Points   : donnees completes injectees dans `donneesPoints` (layer 'points').
 * - Ouvrages : GET  /api/adduction/ouvrages/<pk>/  (detail complet).
 * - Historique : GET /api/audit/objet/?type=point|ouvrage&pk=<id>.
 *
 * CORE : moteur pur testable sous Node (aucune dependance DOM, aucune
 *        dependance MapLibre ; la traduction est injectee via `t(cle, defaut)`).
 * INSTALLEUR : panneau flottant + clics MapLibre + exports.
 */
(function (global) {
    'use strict';

    /* ─────────────────────────── CORE ─────────────────────────── */

    var CATS = {
        source: ['💧', 'Source'], borne: ['🚰', 'Borne-fontaine'], reservoir: ['🛢️', 'Reservoir'],
        repere: ['🧭', 'Repere'], conduite: ['⚙️', 'Conduite'], village: ['🏘️', 'Village'],
        ecole: ['🏫', 'Ecole'], eglise: ['⛪', 'Eglise'], marche: ['🏪', 'Marche'],
        hopital: ['🏥', 'Hopital'], police: ['👮', 'Police'], route: ['🛣️', 'Route'],
        pont: ['🌉', 'Pont'], projet: ['🏗️', 'Projet'], entreprise: ['🏭', 'Entreprise'],
        incident: ['⚠️', 'Incident'], ville: ['🏙️', 'Ville'], autre: ['📍', 'Autre']
    };
    var TYPES = {
        source: ['💧', 'Source'], captage: ['🚰', 'Captage'], borne: ['🚰', 'Borne-fontaine'],
        consommation: ['🧴', 'Point de consommation'], reservoir: ['🛢️', 'Reservoir'],
        reseau: ['🔧', 'Ouvrage du reseau'], ouvrage: ['🏗️', 'Ouvrage existant'],
        repere: ['🧭', 'Point de repere'], intermediaire: ['➿', 'Point intermediaire'],
        village: ['🏘️', 'Village desservi']
    };
    /* Valeurs de choix (sources / consommations / reservoirs) → libellés. */
    var VALEURS = {
        permanente: 'Permanente', saisonniere: 'Saisonniere',
        bon: 'Bon', moyen: 'Moyen', mauvais: 'Mauvais', hors: 'Hors service',
        facile: 'Facile', difficile: 'Difficile', tre_difficile: 'Tres difficile', impossible: 'Inaccessible',
        protegee: 'Protegee', non_protegee: 'Non protegee',
        volumetrique: 'Volumetrique', deversoir: 'Deversoir / bac', estime: 'Estimation',
        pompe_jauge: 'Jaugeage de pompe', autre_methode: 'Autre',
        existant: 'Existant', propose: 'Propose',
        actif: 'Actif', defectueux: 'Defectueux', hors_service: 'Hors service', projet: 'Projet',
        en_cours: 'En cours', termine: 'Termine', inactif: 'Inactif',
        dangereuse: 'Dangereuse', securisee: 'Securisee', sans_info: 'Sans information', indisponible: 'Indisponible'
    };
    var STATUTS = {
        actif: '#22c55e', moyen: '#eab308', defectueux: '#f97316', hors_service: '#ef4444',
        projet: '#6366f1', en_cours: '#3b82f6', termine: '#22c55e', inactif: '#94a3b8',
        dangereuse: '#ef4444', securisee: '#22c55e', sans_info: '#94a3b8', indisponible: '#eab308',
        bon: '#22c55e', mauvais: '#f97316', hors: '#ef4444'
    };

    function vide(v) { return v === null || v === undefined || v === ''; }

    function fmt(v, suffixe) {
        if (vide(v)) return '-';
        var n = Number(v);
        if (!isNaN(n)) return (Math.round(n * 100) / 100) + (suffixe || '');
        return String(v) + (suffixe || '');
    }

    function libChoix(v, t) {
        if (vide(v)) return '-';
        return t('valeur_' + v, VALEURS[v] || String(v));
    }

    function statutLabel(s, t) {
        if (vide(s)) return '-';
        return t('statut_' + s, VALEURS[s] || String(s));
    }

    function catLabel(c, t) {
        var d = CATS[c];
        return (d ? d[1] : c);
    }

    function ex(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /* Lignes « Clé / Valeur » pour une section. cle = cle i18n ('' = brut). */
    function ligne(cle, defaut, val) {
        return { cle: cle || '', defaut: defaut || '', val: val === null || val === undefined ? '-' : String(val) };
    }

    function comptePhotos(medias) {
        return (medias || []).filter(function (m) { return m && m.type === 'photo'; }).length;
    }

    function trouverPoint(donnees, id) {
        for (var i = 0; i < (donnees || []).length; i++) {
            if (Number(donnees[i].id) === Number(id)) return donnees[i];
        }
        return null;
    }

    /* ── Points ── */
    function sectionsPoint(p, t) {
        var iden = [];
        iden.push(ligne('type', 'Type', CATS[p.categorie] ? CATS[p.categorie][0] + ' ' + catLabel(p.categorie, t) : p.categorie));
        iden.push(ligne('statut', 'Statut', statutLabel(p.statut, t)));
        if (p.projet) iden.push(ligne('projet', 'Projet', p.projet));
        if (p.description) iden.push(ligne('description', 'Description', p.description));

        var pos = [];
        pos.push(ligne('latitude', 'Latitude', p.latitude));
        pos.push(ligne('longitude', 'Longitude', p.longitude));
        if (!vide(p.precision_gps_m)) pos.push(ligne('precision_gps', 'Precision GPS', fmt(p.precision_gps_m, ' m')));
        var admin = [p.province, p.commune, p.quartier].filter(function (v) { return !vide(v); }).join(' | ');
        if (admin) pos.push(ligne('localisation', 'Localisation', admin));

        var tec = [];
        var extras = (p.donnees && typeof p.donnees === 'object') ? p.donnees : {};
        Object.keys(extras).forEach(function (k) {
            if (vide(extras[k])) return;
            tec.push(ligne('', k, extras[k]));
        });

        var doc = {
            description: p.description || '',
            fichier: p.source_fichier || '',
            format: p.source_format || '',
            photos: p.medias || []
        };
        return {
            identification: iden, position: pos, technique: tec, documentation: doc
        };
    }

    /* ── Ouvrages hydrauliques ── */
    function releveLignes(o, t) {
        var lignes = [];
        var rs = o.releve_source || null;
        if (o.type === 'source' && rs) {
            lignes.push(ligne('water_debit_mesure', 'Debit mesure', fmt(rs.debit_mesure, ' ' + (rs.debit_unite || 'l/s'))));
            lignes.push(ligne('water_methode_mesure', 'Methode de mesure', libChoix(rs.methode_mesure, t)));
            lignes.push(ligne('water_niveau_eau', "Niveau d'eau", fmt(rs.niveau_eau_m, ' m')));
            lignes.push(ligne('water_profondeur', 'Profondeur', fmt(rs.profondeur_m, ' m')));
            lignes.push(ligne('water_debit_se', 'Debit saison seche', fmt(rs.debit_saison_seche, ' ' + (rs.debit_unite || 'l/s'))));
            lignes.push(ligne('water_debit_pluie', 'Debit saison pluies', fmt(rs.debit_saison_pluies, ' ' + (rs.debit_unite || 'l/s'))));
            lignes.push(ligne('water_accessibilite', 'Accessibilite', libChoix(rs.accessibilite, t)));
            lignes.push(ligne('water_etat_source', 'Etat de la source', libChoix(rs.etat_source, t)));
            lignes.push(ligne('water_permanence', 'Permanence', libChoix(rs.permanence, t)));
            lignes.push(ligne('water_protection', 'Protection', libChoix(rs.protection, t)));
            lignes.push(ligne('water_distance_village', 'Distance village', fmt(rs.distance_village_m, ' m')));
            lignes.push(ligne('water_distance_consommation', 'Distance consommation', fmt(rs.distance_consommation_m, ' m')));
            var qualite = [
                ligne('water_petits', 'pH', fmt(rs.ph)),
                ligne('water_turbidite', 'Turbidite (NTU)', fmt(rs.turbidite_ntu)),
                ligne('water_conductivite', 'Conductivite (uS)', fmt(rs.conductivite_us)),
                ligne('water_temperature', 'Temperature', fmt(rs.temperature_c, ' °C')),
                ligne('water_chlore', 'Chlore residuel (mg/L)', fmt(rs.chlore_residuel)),
                ligne('water_microbio', 'Resultats microbiologiques', vide(rs.resultats_microbiologiques) ? '-' : rs.resultats_microbiologiques),
                ligne('water_date_prelevement', 'Date de prelevement', vide(rs.date_prelevement) ? '-' : String(rs.date_prelevement).slice(0, 10)),
                ligne('water_code_echantillon', "Code d'echantillon", rs.code_echantillon || '-'),
                ligne('water_observation_qualite', "Observation qualite", vide(rs.observation_qualite) ? '-' : rs.observation_qualite)
            ].filter(function (l) { return l.val !== '-'; });
            if (qualite.length) {
                lignes = lignes.concat(qualite);
            }
        }
        var rv = o.releve_village || null;
        if (o.type === 'village' && rv) {
            lignes.push(ligne('village_population', 'Population', fmt(rv.population)));
            lignes.push(ligne('village_menages', 'Menages', fmt(rv.menages)));
            lignes.push(ligne('village_pop_cible', 'Population cible', fmt(rv.population_cible)));
            lignes.push(ligne('village_beneficiaires', 'Beneficiaires estimes', fmt(rv.beneficiaires_estimes)));
            lignes.push(ligne('village_ecoles', 'Ecoles', fmt(rv.ecoles)));
            lignes.push(ligne('village_centres_sante', 'Centres de sante', fmt(rv.centres_sante)));
            lignes.push(ligne('village_autres_inst', 'Autres institutions', fmt(rv.autres_institutions)));
            lignes.push(ligne('village_source_actuelle', "Source d'eau actuelle", rv.source_eau_actuelle || '-'));
            lignes.push(ligne('village_distance_source', 'Distance source', fmt(rv.distance_source_m, ' m')));
            lignes.push(ligne('village_situation_acces', "Situation d'acces", rv.situation_acces || '-'));
        }
        var rc = o.releve_consommation || null;
        if (o.type === 'consommation' && rc) {
            lignes.push(ligne('conso_population_desservie', 'Population desservie', fmt(rc.population_desservie)));
            lignes.push(ligne('conso_menages_desservis', 'Menages desservis', fmt(rc.menages_desservis)));
            lignes.push(ligne('conso_robinets', 'Robinets', fmt(rc.nombre_robinets)));
            lignes.push(ligne('conso_etat', 'Etat', libChoix(rc.etat, t)));
            lignes.push(ligne('conso_existant_propose', 'Existant / propose', libChoix(rc.existant_propose, t)));
            lignes.push(ligne('conso_debit_estime', 'Debit estime', fmt(rc.debit_estime)));
            lignes.push(ligne('conso_besoin_estime', 'Besoin estime', fmt(rc.besoin_estime)));
        }
        var rrv = o.releve_reservoir || null;
        if (o.type === 'reservoir' && rrv) {
            lignes.push(ligne('capacite_m3', 'Capacite (m3)', fmt(rrv.capacite_m3)));
            lignes.push(ligne('niveau_eau', "Niveau d'eau", fmt(rrv.niveau_eau_m, ' m')));
            lignes.push(ligne('conso_etat', 'Etat', libChoix(rrv.etat, t)));
            lignes.push(ligne('conso_existant_propose', 'Existant / propose', libChoix(rrv.existant_propose, t)));
        }
        var rr = o.releve_repere || null;
        if (o.type === 'repere' && rr) {
            if (rr.description) lignes.push(ligne('repere_description', 'Description', rr.description));
            if (rr.date_releve) lignes.push(ligne('repere_date', 'Date du releve', String(rr.date_releve).slice(0, 10)));
        }
        if (o.caracteristiques && o.caracteristiques.details) {
            lignes.push(ligne('fiche_caracteristiques', 'Caracteristiques techniques', o.caracteristiques.details));
        }
        return lignes.filter(function (l) { return l.val !== '-'; });
    }

    function photosOuvrage(o) {
        var out = [];
        if (o.photo) out.push({ url: o.photo, type: 'photo' });
        [o.releve_source, o.releve_village, o.releve_consommation, o.releve_reservoir, o.releve_repere]
            .forEach(function (r) {
                if (!r) return;
                if (r.photo) out.push(typeof r.photo === 'string' ? { url: r.photo, type: 'photo' } : r.photo);
                (r.photos || []).forEach(function (ph) {
                    if (typeof ph === 'string') out.push({ url: ph, type: 'photo' });
                    else if (ph && ph.url) out.push(ph);
                });
            });
        return out;
    }

    function sectionsOuvrage(o, t) {
        var iden = [];
        var typ = TYPES[o.type];
        iden.push(ligne('type', 'Type', (typ ? typ[0] + ' ' + typ[1] : o.type_label || o.type)));
        if (o.sous_type_label) iden.push(ligne('fiche_sous_type', 'Sous-type', o.sous_type_label));
        if (o.representation_label) iden.push(ligne('fiche_representation', 'Representation', o.representation_label));
        if (o.code) iden.push(ligne('code', 'Code', o.code));
        iden.push(ligne('statut', 'Statut', o.statut_label || statutLabel(o.statut, t)));
        if (o.code_projet) iden.push(ligne('water_code_projet', 'Code projet', o.code_projet));
        if (o.territoire) iden.push(ligne('water_territoire', 'Territoire', o.territoire));
        if (o.secteur_chefferie) iden.push(ligne('secteur_chefferie', 'Secteur / chefferie', o.secteur_chefferie));
        if (o.localite) iden.push(ligne('water_localite', 'Localite', o.localite));
        if (o.village) iden.push(ligne('water_village', 'Village', o.village));
        if (o.provenance) iden.push(ligne('provenance', 'Provenance', o.provenance));
        if (o.organisation) iden.push(ligne('water_organisation', 'Organisation', o.organisation));
        if (o.agent_enqueteur) iden.push(ligne('water_agent', "Agent d'enquete", o.agent_enqueteur));
        if (o.releve_par) iden.push(ligne('fiche_releve_par', 'Releve par', o.releve_par));
        if (o.date_releve) iden.push(ligne('fiche_date_releve', 'Date du releve', String(o.date_releve).slice(0, 10)));
        if (o.description) iden.push(ligne('description', 'Description', o.description));

        var pos = [];
        pos.push(ligne('latitude', 'Latitude', o.latitude));
        pos.push(ligne('longitude', 'Longitude', o.longitude));
        if (!vide(o.altitude_m)) pos.push(ligne('altitude', 'Altitude', fmt(o.altitude_m, ' m')));
        if (!vide(o.precision_gps_m)) pos.push(ligne('precision_gps', 'Precision GPS', fmt(o.precision_gps_m, ' m')));
        if (o.beneficiaires) pos.push(ligne('beneficiaires', 'Beneficiaires', fmt(o.beneficiaires)));
        if (Array.isArray(o.geometrie) && o.geometrie.length >= 2) {
            pos.push(ligne('fiche_trace', 'Conduite / trace', fmt(o.geometrie.length, ' points')));
            pos.push(ligne('fiche_longueur', 'Longueur', fmt(longueurGeometrie(o.geometrie), ' m')));
        }

        var tec = releveLignes(o, t);

        var doc = {
            description: o.description || '',
            fichier: '',
            format: '',
            observations: o.observations || '',
            qualite: (o.releve_source && o.releve_source.observation_qualite) || '',
            photos: photosOuvrage(o)
        };
        return {
            identification: iden, position: pos, technique: tec, documentation: doc
        };
    }

    function longueurGeometrie(geo) {
        var tot = 0;
        for (var i = 1; i < geo.length; i++) {
            var a = geo[i - 1], b = geo[i];
            var dlat = (b[1] - a[1]) * 111320;
            var dlng = (b[0] - a[0]) * 111320 * Math.cos((a[1] || 0) * Math.PI / 180);
            tot += Math.sqrt(dlat * dlat + dlng * dlng);
        }
        return tot;
    }

    /* Centre ou étendue pour « Zoomer ». */
    function zoomCible(o) {
        if (Array.isArray(o.geometrie) && o.geometrie.length >= 2) {
            var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            o.geometrie.forEach(function (g) {
                if (g[0] < minX) minX = g[0];
                if (g[0] > maxX) maxX = g[0];
                if (g[1] < minY) minY = g[1];
                if (g[1] > maxY) maxY = g[1];
            });
            if (isFinite(minX)) return { mode: 'bounds', bounds: [[minX, minY], [maxX, maxY]] };
        }
        return { mode: 'point', center: [Number(o.longitude), Number(o.latitude)] };
    }

    function geoJSON(objet, estOuvrage) {
        var props = {
            nom: objet.nom || '', statut: objet.statut || '',
            description: objet.description || '', latitude: objet.latitude, longitude: objet.longitude
        };
        var geometry;
        if (estOuvrage && Array.isArray(objet.geometrie) && objet.geometrie.length >= 2) {
            props.type = objet.type_label || objet.type;
            props.code = objet.code || '';
            geometry = { type: 'LineString', coordinates: objet.geometrie.map(function (g) { return [g[0], g[1]]; }) };
        } else {
            props.type = estOuvrage ? (objet.type_label || objet.type) : objet.categorie;
            geometry = { type: 'Point', coordinates: [Number(objet.longitude), Number(objet.latitude)] };
        }
        return { type: 'Feature', properties: props, geometry: geometry };
    }

    function auditLignes(entre) {
        return (entre || []).map(function (e) {
            var d = e.details || '';
            d = d.replace(/^(?:Point|Ouvrage|M[ée]dia) #[0-9]+(?: du point #[0-9]+)?\s*-\s*/i, '');
            return {
                action: e.action || '',
                details: d,
                utilisateur: e.utilisateur || '',
                date: String(e.date || '').replace('T', ' ')
            };
        });
    }

    var CORE = {
        sectionsPoint: sectionsPoint,
        sectionsOuvrage: sectionsOuvrage,
        auditLignes: auditLignes,
        geoJSON: geoJSON,
        zoomCible: zoomCible,
        trouverPoint: trouverPoint,
        comptePhotos: comptePhotos,
        photosOuvrage: photosOuvrage,
        longueurGeometrie: longueurGeometrie,
        libChoix: libChoix,
        statutLabel: statutLabel,
        ex: ex
    };

    /* ─────────────────────── INSTALLEUR ───────────────────────── */

    var etat = {
        carte: null, donnees: [], panneau: null,
        urlOuvrage: '/api/adduction/ouvrages/',
        urlAudit: '/api/audit/',
        actuel: null, hist: { cle: '', charge: false }
    };

    function parId(id) { return document.getElementById(id); }

    function injecterStyles() {
        if (parId('fp-styles')) return;
        var st = document.createElement('style');
        st.id = 'fp-styles';
        st.textContent =
            '#fiche-panel{position:fixed;right:20px;top:70px;width:400px;max-width:94vw;z-index:1160;' +
            'display:none;flex-direction:column;background:var(--bg-2);border:1px solid var(--border);' +
            'border-radius:14px;box-shadow:var(--shadow);overflow:hidden;font-family:"Inter",sans-serif;}' +
            '#fiche-panel .fp-head{display:flex;align-items:center;gap:8px;padding:12px 14px;cursor:pointer;user-select:none;' +
            'background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 20%,var(--bg-2)),var(--bg-2));' +
            'border-bottom:1px solid var(--border);}' +
            '#fiche-panel .fp-titre{font-weight:800;font-size:.85rem;flex:1;display:flex;align-items:center;gap:8px;min-width:0;}' +
            '#fiche-panel .fp-nom{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
            '#fiche-panel .fp-code{font-size:.66rem;font-weight:600;color:var(--text-2);background:var(--bg-3);' +
            'padding:2px 7px;border-radius:20px;letter-spacing:.5px;}' +
            '#fiche-panel .fp-corps{overflow-y:auto;padding:12px 14px;max-height:calc(100vh - 300px);min-height:140px;}' +
            '#fiche-panel .fp-section{font-size:.64rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;' +
            'color:var(--text-3);margin:14px 0 6px;display:flex;align-items:center;gap:8px;}' +
            '#fiche-panel .fp-section::after{content:"";flex:1;height:1px;background:var(--border);}' +
            '#fiche-panel .fp-tab{width:100%;border-collapse:collapse;font-size:.78rem;}' +
            '#fiche-panel .fp-tab td{padding:5px 4px;border-bottom:1px dashed var(--border);vertical-align:top;word-break:break-word;}' +
            '#fiche-panel .fp-tab tr:last-child td{border-bottom:none;}' +
            '#fiche-panel .fp-cle{color:var(--text-2);font-weight:600;width:44%;}' +
            '#fiche-panel .fp-badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:.66rem;' +
            'font-weight:700;color:#fff;border:none;}' +
            '#fiche-panel .fp-photos{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:8px;}' +
            '#fiche-panel .fp-photos img{width:100%;height:100%;object-fit:cover;border-radius:8px;cursor:pointer;}' +
            '#fiche-panel .fp-photos .fp-ph{aspect-ratio:1;border-radius:8px;overflow:hidden;cursor:pointer;' +
            'display:flex;align-items:center;justify-content:center;font-size:1rem;}' +
            '#fiche-panel .fp-actions{display:flex;gap:6px;flex-wrap:wrap;border-top:1px solid var(--border);padding:10px 14px;}' +
            '#fiche-panel .fp-actions .btn{flex:1;min-width:80px;}' +
            '#fiche-panel .fp-hist{margin-top:10px;border-top:1px dashed var(--border);padding-top:8px;display:none;' +
            'font-size:.76rem;max-height:220px;overflow-y:auto;}' +
            '#fiche-panel .fp-hist-it{padding:6px 2px;border-bottom:1px dashed var(--border);}' +
            '#fiche-panel .fp-hist-it:last-child{border-bottom:none;}' +
            '#fiche-panel .fp-hist-a{font-weight:700;color:var(--accent);}' +
            '#fiche-panel .fp-hist-m{font-size:.66rem;color:var(--text-3);}' +
            '#fiche-panel .fp-msg{font-size:.8rem;color:var(--text-2);text-align:center;padding:18px 10px;}';
        document.head.appendChild(st);
    }

    function trad(cle, defaut) {
        var v = null;
        try { if (global.mukmapT && typeof global.mukmapT === 'function') v = global.mukmapT(cle); } catch (e) { /* ignore */ }
        if (v) return v;
        return defaut || cle;
    }

    function identifyOuvert() {
        var p = parId('identify-panel');
        return p && p.style && p.style.display !== 'none';
    }

    function htmlSections(sections) {
        var ordre = ['identification', 'position', 'technique'];
        var clesTitre = {
            identification: { cle: 'fiche_identification', defaut: 'Identification' },
            position: { cle: 'fiche_position', defaut: 'Position' },
            technique: { cle: 'fiche_technique', defaut: 'Technique' }
        };
        var out = '';
        ordre.forEach(function (nom) {
            var lignes = (sections[nom] || []) || [];
            if (!lignes.length) return;
            var titre = clesTitre[nom];
            out += '<div class="fp-section">' + ex(trad(titre.cle, titre.defaut)) + '</div>' +
                '<table class="fp-tab">' + lignes.map(function (l) {
                    return '<tr><td class="fp-cle">' + ex(trad(l.cle, l.defaut)) + '</td><td>' + ex(l.val) + '</td></tr>';
                }).join('') + '</table>';
        });
        return out;
    }

    function htmlGalerie(photos) {
        if (!photos || !photos.length) return '';
        var visible = photos.slice(0, 9);
        var html = '<div class="fp-section">' + ex(trad('fiche_galerie_titre', 'Galerie photos')) + ' (' + photos.length + ')</div>' +
            '<div class="fp-photos">' + visible.map(function (m, i) {
                var url = m.url || m.fichier || '';
                var type = m.type || 'photo';
                var style = type === 'photo'
                    ? 'background:#000;'
                    : 'background:color-mix(in srgb,var(--accent) 25%,var(--bg-3));';
                var contenu = type === 'photo'
                    ? '<img src="' + ex(url) + '" loading="lazy" alt="">'
                    : (type === 'video' ? '🎬' : (type === 'pdf' ? '<span style="font-size:.6rem;font-weight:700;color:#fff;">PDF</span>' : '🎵'));
                return '<div class="fp-ph" style="' + style + '" data-i="' + i + '" title="' + ex(m.commentaire || '') + '">' + contenu + '</div>';
            }).join('') + '</div>';
        if (photos.length > 9) html += '<div style="font-size:.68rem;color:var(--text-3);margin-top:4px;">+' + (photos.length - 9) + ' ' + ex(trad('photos', 'photos')) + '</div>';
        return html;
    }

    function htmlDoc(sections) {
        var d = sections.documentation || {};
        var out = '<div class="fp-section">' + ex(trad('fiche_documentation', 'Documentation')) + '</div>';
        var nb = (d.photos || []).length;
        if (nb) {
            out += '<div style="font-size:.72rem;color:var(--text-2);margin-bottom:2px;">📷 ' + nb + ' ' +
                ex(trad('photos', 'photos')) + '</div>';
        } else {
            out += '<div style="font-size:.72rem;color:var(--text-3);margin-bottom:2px;">' +
                ex(trad('fiche_aucune_photo', 'Aucune photo')) + '</div>';
        }
        if (d.fichier) {
            out += '<table class="fp-tab"><tr><td class="fp-cle">' + ex(trad('fichier_source', 'Fichier source')) + '</td><td>' + ex(d.fichier) + '</td></tr>' +
                (d.format ? '<tr><td class="fp-cle">' + ex(trad('format_import', 'Format')) + '</td><td>' + ex(d.format) + '</td></tr>' : '') +
                '</table>';
        }
        if (d.observations) {
            out += '<div style="font-size:.76rem;color:var(--text-2);margin-top:8px;"><b>' + ex(trad('fiche_observations_terrain', 'Observations de terrain')) + '</b><br>' + ex(d.observations) + '</div>';
        }
        if (d.qualite && d.qualite !== d.observations) {
            out += '<div style="font-size:.76rem;color:var(--text-2);margin-top:8px;"><b>' + ex(trad('water_observation_qualite', 'Observation qualite')) + '</b><br>' + ex(d.qualite) + '</div>';
        }
        out += htmlGalerie(d.photos);
        return out;
    }

    function corpsFiche(sections) {
        return htmlSections(sections) + htmlDoc(sections);
    }

    function ouvrir(sections, meta) {
        var panneau = etat.panneau;
        if (!panneau) return;
        etat.actuel = meta;
        etat.hist = { cle: '', charge: false };
        var badge = meta.statut
            ? '<span class="fp-badge" style="background:' + (CORE_STATUTS[meta.statut] || '#888') + '">' + ex(CORE.statutLabel(meta.statut, trad)) + '</span>'
            : '';
        panneau.querySelector('.fp-titre').innerHTML =
            '<span>' + ex(meta.emoji || '📍') + '</span><span class="fp-nom">' + ex(meta.nom) + '</span>' +
            (meta.code ? '<span class="fp-code">' + ex(meta.code) + '</span>' : '') + badge;
        var corps = parId('fp-corps');
        corps.innerHTML = corpsFiche(sections);
        corps.scrollTop = 0;
        parId('fp-hist').style.display = 'none';
        panneau.style.display = 'flex';
    }

    function fermer() {
        if (etat.panneau) etat.panneau.style.display = 'none';
        etat.actuel = null;
    }

    function ouvrirPoint(id) {
        var p = CORE.trouverPoint(etat.donnees, id);
        if (!p) return false;
        ouvrir(CORE.sectionsPoint(p, trad), {
            nom: p.nom, code: '', emoji: (CATS[p.categorie] || CATS.autre)[0],
            statut: p.statut, typeObjet: 'point', id: Number(p.id), donnees: p,
            centre: [Number(p.longitude), Number(p.latitude)]
        });
        return true;
    }

    function ouvrirOuvrage(id) {
        var panneau = etat.panneau;
        if (!panneau) return;
        var corps = parId('fp-corps');
        corps.innerHTML = '<div class="fp-msg">' + ex(trad('fiche_chargement', 'Chargement...')) + '</div>';
        parId('fp-hist').style.display = 'none';
        panneau.style.display = 'flex';
        var depuis = etat.actuel && etat.actuel.typeObjet === 'ouvrage' && etat.actuel.id === Number(id) ? etat.actuel : null;
        if (depuis) { ouvrir(CORE.sectionsOuvrage(depuis.donnees, trad), depuis); return; }
        fetch(etat.urlOuvrage + id + '/')
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(function (o) {
                var typ = TYPES[o.type] || TYPES.ouvrage;
                ouvrir(CORE.sectionsOuvrage(o, trad), {
                    nom: o.nom || '', code: o.code || '', emoji: typ[0],
                    statut: o.statut, typeObjet: 'ouvrage', id: Number(o.id), donnees: o
                });
            })
            .catch(function () {
                corps.innerHTML = '<div class="fp-msg">' + ex(trad('fiche_erreur', 'Impossible de charger la fiche.')) + '</div>';
            });
    }

    function basculerHistorique() {
        var bloc = parId('fp-hist');
        if (!bloc || !etat.actuel) return;
        var cle = etat.actuel.typeObjet + ':' + etat.actuel.id;
        if (etat.hist.cle !== cle || !etat.hist.charge) {
            chargerHistorique(cle);
            return;
        }
        bloc.style.display = bloc.style.display === 'none' ? 'block' : 'none';
    }

    function chargerHistorique(cle) {
        var bloc = parId('fp-hist');
        if (!bloc || !etat.actuel) return;
        etat.hist = { cle: cle, charge: false };
        bloc.style.display = 'block';
        bloc.innerHTML = '<div class="fp-msg">' + ex(trad('fiche_chargement', 'Chargement...')) + '</div>';
        fetch(etat.urlAudit + 'objet/?type=' + etat.actuel.typeObjet + '&pk=' + etat.actuel.id)
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(function (d) {
                var entre = CORE.auditLignes(d.historique || []);
                etat.hist.charge = true;
                if (!entre.length) {
                    bloc.innerHTML = '<div class="fp-msg">' + ex(trad('fiche_historique_vide', 'Aucune trace pour cet element.')) + '</div>';
                    return;
                }
                bloc.innerHTML = entre.map(function (h) {
                    return '<div class="fp-hist-it"><div class="fp-hist-a">' + ex(h.action) + '</div>' +
                        '<div>' + ex(h.details) + '</div>' +
                        '<div class="fp-hist-m">👤 ' + ex(h.utilisateur || '—') + ' · ' + ex(h.date) + '</div></div>';
                }).join('');
            })
            .catch(function () {
                bloc.innerHTML = '<div class="fp-msg">' + ex(trad('fiche_erreur', 'Impossible de charger la fiche.')) + '</div>';
            });
    }

    function zoomer() {
        var m = etat.actuel;
        if (!m || !etat.carte) return;
        var cible = CORE.zoomCible(m.donnees || {});
        if (cible.mode === 'bounds') {
            etat.carte.fitBounds(cible.bounds, { padding: 60, duration: 800 });
        } else {
            etat.carte.flyTo({ center: cible.center, zoom: 15, duration: 800 });
        }
    }

    function exporter() {
        var m = etat.actuel;
        if (!m) return;
        var feat = CORE.geoJSON(m.donnees || {}, m.typeObjet === 'ouvrage');
        var blob = new Blob([JSON.stringify(feat, null, 2)], { type: 'application/geo+json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'fiche-' + m.typeObjet + '-' + m.id + '.geojson';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    }

    function modifier() {
        var m = etat.actuel;
        if (!m) return;
        if (m.typeObjet === 'point') {
            window.location.href = '/point/' + m.id + '/edit/';
            return;
        }
        var ws = global.MukmapWaterSupply;
        if (ws && ws.ouvrirEdition) {
            fermer();
            ws.ouvrirEdition(m.id);
        } else {
            console.warn('Fiche : aucune edition disponible pour les ouvrages.');
        }
    }

    function photos() {
        var panneau = etat.panneau;
        if (!panneau) return;
        var gal = panneau.querySelector('.fp-photos');
        if (gal) gal.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        else if (etat.actuel && (etat.actuel.donnees.medias || []).length) {
            /* bouton Photos sur un point : re-ouvre la fiche (galerie toujours rendue) */
            ouvrirPoint(etat.actuel.id);
        }
    }

    function creerPanneau() {
        var panneau = document.createElement('div');
        panneau.id = 'fiche-panel';
        panneau.innerHTML =
            '<div class="fp-head"><div class="fp-titre"></div>' +
            '<button type="button" class="btn btn-icon btn-sm" data-fp="fermer" title="' + ex(trad('fermer', 'Fermer')) + '">✕</button></div>' +
            '<div class="fp-corps" id="fp-corps"><div class="fp-msg">' + ex(trad('fiche_aucun_element', 'Cliquez sur un element de la carte pour afficher sa fiche detaillee.')) + '</div></div>' +
            '<div class="fp-actions">' +
            '<button type="button" class="btn btn-primary btn-sm" data-fp="modifier">' + ex(trad('modifier', 'Modifier')) + '</button>' +
            '<button type="button" class="btn btn-sm" data-fp="photos">' + ex(trad('photos', 'Photos')) + '</button>' +
            '<button type="button" class="btn btn-sm" data-fp="historique">' + ex(trad('historique', 'Historique')) + '</button>' +
            '<button type="button" class="btn btn-sm" data-fp="zoomer">' + ex(trad('fiche_zoomer', 'Zoomer')) + '</button>' +
            '<button type="button" class="btn btn-sm" data-fp="exporter">' + ex(trad('exporter', 'Exporter')) + '</button>' +
            '</div>' +
            '<div class="fp-hist" id="fp-hist"></div>';
        document.body.appendChild(panneau);
        panneau.addEventListener('click', function (ev) {
            var bt = ev.target.closest ? ev.target.closest('[data-fp]') : null;
            if (!bt) {
                var ph = ev.target.closest ? ev.target.closest('.fp-ph') : null;
                if (ph && etat.actuel) {
                    var m = (CORE.photosOuvrage(etat.actuel.donnees) || [])[Number(ph.getAttribute('data-i'))];
                    if (m) {
                        var url = m.url || m.fichier;
                        if (url) {
                            if (m.type === 'photo' && global.ouvrirMedia) { global.ouvrirMedia(url, 'photo'); return; }
                            window.open(url, '_blank');
                        }
                    }
                }
                return;
            }
            var action = bt.getAttribute('data-fp');
            if (action === 'fermer') fermer();
            else if (action === 'modifier') modifier();
            else if (action === 'photos') photos();
            else if (action === 'historique') basculerHistorique();
            else if (action === 'zoomer') zoomer();
            else if (action === 'exporter') exporter();
        });
        etat.panneau = panneau;
    }

    function demarrer(opts) {
        opts = opts || {};
        var carte = opts.carte || (typeof window !== 'undefined' ? window.map : null);
        if (!carte || typeof document === 'undefined') return null;
        etat.carte = carte;
        if (opts.donnees) etat.donnees = opts.donnees;
        if (opts.urlOuvrage) etat.urlOuvrage = opts.urlOuvrage;
        if (opts.urlAudit) etat.urlAudit = opts.urlAudit;
        injecterStyles();
        creerPanneau();
        /* Ouvrages : clic sur le layer mw-ouv-p (water-supply). */
        carte.on('click', function (e) {
            var ws = global.MukmapWaterSupply;
            if (ws && ws.enInteraction && ws.enInteraction()) return;
            if (identifyOuvert()) return;
            try {
                var f = carte.queryRenderedFeatures(e.point, { layers: ['mw-ouv-p'] });
                if (f.length && f[0].properties && f[0].properties.id) ouvrirOuvrage(f[0].properties.id);
            } catch (err) { /* couche pas encore presente : ignorer */ }
        });
        return etat.panneau;
    }

    var CORE_STATUTS = STATUTS;
    global.MukmapFichePoint = {
        CORE: CORE,
        demarrer: demarrer,
        ouvrirPoint: ouvrirPoint,
        ouvrirOuvrage: ouvrirOuvrage,
        fermer: fermer
    };
})(typeof window !== 'undefined' ? window : globalThis);
