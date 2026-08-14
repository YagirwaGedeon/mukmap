/* MUKMAP — Tests du moteur pur « Fiche détaillée » (fiche-point.js).
 * Charge le fichier réel distribué (aucune dépendance DOM ni MapLibre).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'static', 'js', 'fiche-point.js'), 'utf8');

assert.ok(src.includes('global.MukmapFichePoint'), 'le fichier expose MukmapFichePoint');
eval(src);
const M = globalThis.MukmapFichePoint;
assert.ok(M && M.CORE, 'MukmapFichePoint chargé');
const C = M.CORE;

const t = (cle, defaut) => (defaut !== undefined ? defaut : cle);

// ── Point de test ──────────────────────────────────────────────────
const point = {
    id: 42, nom: 'Bogoro', description: 'Village central du projet.',
    latitude: 1.409772222, longitude: 30.280000, precision_gps_m: 3.5,
    categorie: 'village', statut: 'actif',
    province: 'Ituri', commune: 'Irumu', quartier: 'Bogoro',
    projet: 'Adduction Irumu', donnees: {'No': '1', 'Activite': 'Adduction', 'Observation': ''},
    source_fichier: 'sites.csv', source_format: 'CSV',
    medias: [
        {url: '/media/p1.jpg', type: 'photo'},
        {url: '/media/p2.jpg', type: 'photo'},
        {url: '/media/v1.mp4', type: 'video'},
        {url: '/media/d1.pdf', type: 'pdf'}
    ]
};

// ── trouverPoint ───────────────────────────────────────────────────
assert.strictEqual(C.trouverPoint([point], 42), point);
assert.strictEqual(C.trouverPoint([point], '42'), point, 'id numérique/chaîne');
assert.strictEqual(C.trouverPoint([point], 99), null);
assert.strictEqual(C.trouverPoint([], 42), null);
assert.strictEqual(C.trouverPoint(null, 42), null);

// ── sectionsPoint ──────────────────────────────────────────────────
const sp = C.sectionsPoint(point, t);
assert.strictEqual(sp.identification.length, 4, 'Type, Statut, Projet, Description');
assert.ok(sp.identification[0].val.includes('Village'), 'type : emoji + label');
assert.strictEqual(sp.identification[1].val, 'Actif', 'statut par défaut');
assert.strictEqual(sp.identification[2].val, 'Adduction Irumu');
assert.strictEqual(sp.position.length, 4, 'Lat, Lon, Précision, Localisation');
assert.strictEqual(sp.position[0].val, '1.409772222');
assert.strictEqual(sp.position[2].val, '3.5 m', 'précision GPS avec unité');
assert.strictEqual(sp.position[3].val, 'Ituri | Irumu | Bogoro', 'admin fusionnée');
assert.strictEqual(sp.technique.length, 2, 'colonnes importées non vides seulement');
assert.strictEqual(sp.technique[0].val, '1', 'No');
assert.strictEqual(sp.technique[1].val, 'Adduction', 'Activite');
assert.ok(sp.documentation.photos.length === 4, 'médias transmis');
assert.strictEqual(sp.documentation.fichier, 'sites.csv');
assert.strictEqual(sp.documentation.format, 'CSV');

// ── sectionsPoint : cas minimal ────────────────────────────────────
const pMini = {id: 1, nom: 'X', categorie: 'source', statut: 'moyen',
    latitude: -1.6, longitude: 29.2, donnees: null, medias: []};
const spMini = C.sectionsPoint(pMini, t);
assert.strictEqual(spMini.identification.length, 2, 'Type + Statut');
assert.strictEqual(spMini.identification[0].val, '💧 Source', 'emoji source');
assert.strictEqual(spMini.position.length, 2, 'sans précision ni admin');
assert.strictEqual(spMini.technique.length, 0, 'aucune colonne importée');
assert.strictEqual(spMini.documentation.fichier, '', 'pas de fichier');

// ── sectionsOuvrage : source complète ──────────────────────────────
const ouvrage = {
    id: 7, type: 'source', type_label: "Source d'eau", sous_type: 'naturelle',
    sous_type_label: 'Naturelle', representation: 'point', representation_label: 'Point',
    code: 'SRC-001', nom: 'Source Kawa', statut: 'actif', statut_label: 'En service',
    latitude: -1.6785, longitude: 29.233, altitude_m: 1462, precision_gps_m: 4,
    beneficiaires: 320, code_projet: 'IRU-01', territoire: 'Irumu',
    secteur_chefferie: 'Walendu Bindi', localite: 'Bogoro', village: 'Bogoro centre',
    provenance: 'Aménagée', organisation: 'UNICEF', agent_enqueteur: 'Jean',
    releve_par: 'admin', date_releve: '2026-07-15T08:00:00',
    description: 'Source aménagée avec captage béton.',
    caracteristiques: {details: 'Captage béton, chambre de collecte'},
    observations: 'Forte fréquentation matinale.',
    geometrie: [],
    releve_source: {
        debit_mesure: 0.8, debit_unite: 'l/s', methode_mesure: 'volumetrique',
        niveau_eau_m: 1.2, profondeur_m: null,
        debit_saison_seche: 0.4, debit_saison_pluies: 1.3,
        accessibilite: 'facile', etat_source: 'bon', permanence: 'permanente',
        protection: 'protegee', distance_village_m: 250, distance_consommation_m: 300,
        ph: 6.8, turbidite_ntu: 2.1, conductivite_us: 145, temperature_c: 22.5,
        chlore_residuel: null, resultats_microbiologiques: 'Absence de coliformes',
        observation_qualite: 'Eau claire et fraîche.',
        date_prelevement: '2026-07-10', code_echantillon: 'ECH-01'
    },
    releve_village: null, releve_consommation: null, releve_repere: null, releve_reservoir: null
};
const so = C.sectionsOuvrage(ouvrage, t);
const idenKeys = so.identification.map(l => l.cle);
assert.ok(idenKeys.includes('fiche_sous_type'), 'sous-type présent');
assert.ok(idenKeys.includes('fiche_representation'), 'représentation présente');
assert.ok(idenKeys.includes('code'), 'code présent');
assert.ok(idenKeys.includes('statut'));
assert.strictEqual(so.identification[0].val, '💧 Source', 'type avec emoji');
assert.strictEqual(so.identification[1].val, 'Naturelle');
assert.strictEqual(so.identification[3].val, 'SRC-001');
const statutRow = so.identification.find(l => l.cle === 'statut');
assert.strictEqual(statutRow.val, 'En service', 'statut_label de l\'API');
assert.ok(so.identification.find(l => l.cle === 'fiche_releve_par').val === 'admin');
assert.ok(so.identification.find(l => l.cle === 'fiche_date_releve').val === '2026-07-15', 'date tronquée');
assert.ok(so.position.find(l => l.cle === 'altitude').val === '1462 m', 'altitude');
assert.ok(so.position.find(l => l.cle === 'precision_gps').val === '4 m');
assert.ok(so.position.find(l => l.cle === 'beneficiaires').val === '320');

const tec = so.technique;
const dbt = tec.find(l => l.cle === 'water_debit_mesure');
assert.strictEqual(dbt.val, '0.8 l/s', 'débit + unité');
assert.ok(tec.find(l => l.cle === 'water_methode_mesure').val === 'Volumetrique', 'libChoix');
assert.ok(tec.find(l => l.cle === 'water_permanence').val === 'Permanente');
assert.ok(tec.find(l => l.cle === 'water_etat_source').val === 'Bon');
assert.ok(tec.find(l => l.cle === 'water_protection').val === 'Protegee');
assert.ok(tec.find(l => l.cle === 'water_petits').val === '6.8', 'pH');
assert.ok(tec.find(l => l.cle === 'water_microbio').val === 'Absence de coliformes');
assert.ok(tec.find(l => l.cle === 'water_date_prelevement').val === '2026-07-10');
assert.ok(tec.find(l => l.cle === 'fiche_caracteristiques').val === 'Captage béton, chambre de collecte');
assert.ok(!tec.some(l => l.cle === 'water_profondeur'), 'profondeur null → ignorée');
assert.ok(!tec.some(l => l.cle === 'water_chlore'), 'chlore null → ignoré');
assert.strictEqual(so.documentation.observations, 'Forte fréquentation matinale.');
assert.strictEqual(so.documentation.qualite, 'Eau claire et fraîche.');

// ── sectionsOuvrage : village / consommation / réservoir / repère ──
const ov = C.sectionsOuvrage({
    id: 8, type: 'village', type_label: 'Village desservi', nom: 'Bogoro', statut: 'actif',
    latitude: 1.4, longitude: 30.2, geometrie: [], releve_village: {
        population: 1200, menages: 210, population_cible: 900, beneficiaires_estimes: 850,
        ecoles: 2, centres_sante: 1, autres_institutions: 3,
        source_eau_actuelle: 'Rivière', distance_source_m: 1500, situation_acces: 'Piste'
    }, releve_source: null, releve_consommation: null, releve_repere: null, releve_reservoir: null
}, t);
assert.ok(ov.technique.find(l => l.cle === 'village_population').val === '1200');
assert.ok(ov.technique.find(l => l.cle === 'village_distance_source').val === '1500 m');
assert.strictEqual(ov.technique.length, 10, '10 lignes village');

const oc = C.sectionsOuvrage({
    id: 9, type: 'consommation', nom: 'BF-01', statut: 'actif',
    latitude: 1.4, longitude: 30.2, geometrie: [], releve_consommation: {
        population_desservie: 500, menages_desservis: 90, nombre_robinets: 6,
        etat: 'bon', existant_propose: 'existant', debit_estime: 0.3, besoin_estime: 0.5
    }, releve_source: null, releve_village: null, releve_repere: null, releve_reservoir: null
}, t);
assert.ok(oc.technique.find(l => l.cle === 'conso_robinets').val === '6');
assert.ok(oc.technique.find(l => l.cle === 'conso_existant_propose').val === 'Existant');

const ors = C.sectionsOuvrage({
    id: 10, type: 'reservoir', nom: 'RV-01', statut: 'actif',
    latitude: 1.4, longitude: 30.2, geometrie: [], releve_reservoir: {
        capacite_m3: 50, niveau_eau_m: 2.5, etat: 'bon', existant_propose: 'propose'
    }, releve_source: null, releve_village: null, releve_consommation: null, releve_repere: null
}, t);
assert.ok(ors.technique.find(l => l.cle === 'capacite_m3').val === '50');
assert.ok(ors.technique.find(l => l.cle === 'conso_existant_propose').val === 'Propose');

const orp = C.sectionsOuvrage({
    id: 11, type: 'repere', nom: 'R1', statut: 'actif',
    latitude: 1.4, longitude: 30.2, geometrie: [], releve_repere: {
        description: 'Carrefour principal', date_releve: '2026-07-01'
    }, releve_source: null, releve_village: null, releve_consommation: null, releve_reservoir: null
}, t);
assert.ok(orp.technique.find(l => l.cle === 'repere_description').val === 'Carrefour principal');

// ── Longueur de tracé / Zoom ───────────────────────────────────────
const trace = {id: 12, type: 'reseau', nom: 'T1', statut: 'actif', latitude: 1.4, longitude: 30.2,
    geometrie: [[30.2, 1.4], [30.2005, 1.401], [30.201, 1.402]], releve_source: null,
    releve_village: null, releve_consommation: null, releve_repere: null, releve_reservoir: null};
const stT = C.sectionsOuvrage(trace, t);
assert.ok(stT.position.find(l => l.cle === 'fiche_trace'), 'tracé signalé');
const L = C.longueurGeometrie(trace.geometrie);
assert.ok(L > 200 && L < 300, 'longueur tracé ~249 m (' + L + ')');
const zt = C.zoomCible(trace);
assert.strictEqual(zt.mode, 'bounds', 'tracé → bounds');
assert.strictEqual(zt.bounds[0][0], 30.2);
const zp = C.zoomCible(ouvrage);
assert.strictEqual(zp.mode, 'point', 'point → center');
assert.deepStrictEqual(zp.center, [29.233, -1.6785], 'centre [lng, lat]');

// ── geoJSON ────────────────────────────────────────────────────────
const fgP = C.geoJSON(point, false);
assert.strictEqual(fgP.type, 'Feature');
assert.strictEqual(fgP.geometry.type, 'Point');
assert.deepStrictEqual(fgP.geometry.coordinates, [30.280000, 1.409772222]);
assert.strictEqual(fgP.properties.type, 'village');
assert.strictEqual(fgP.properties.statut, 'actif');
const fgO = C.geoJSON(trace, true);
assert.strictEqual(fgO.geometry.type, 'LineString', 'tracé → LineString');
assert.strictEqual(fgO.geometry.coordinates.length, 3);
assert.deepStrictEqual(fgO.geometry.coordinates[0], [30.2, 1.4]);
const fgOsolo = C.geoJSON(ouvrage, true);
assert.strictEqual(fgOsolo.geometry.type, 'Point', 'ouvrage ponctuel → Point');

// ── auditLignes ────────────────────────────────────────────────────
const hist = C.auditLignes([
    {action: 'Modification', details: 'Point #42 - Bogoro : description modifiée', utilisateur: 'admin', date: '2026-08-01T10:00:00'},
    {action: 'Création', details: 'Média #7 du point #42 - photo ajoutée', utilisateur: 'jean', date: '2026-07-15T09:30:00'},
    {action: 'Création', details: 'Ouvrage #7 - SRC-001 créé', utilisateur: 'admin', date: '2026-07-01T08:00:00'}
]);
assert.strictEqual(hist.length, 3);
assert.strictEqual(hist[0].details, 'Bogoro : description modifiée', 'préfixe Point #42 retiré');
assert.strictEqual(hist[1].details, 'photo ajoutée', 'préfixe Média #7 du point #42 retiré');
assert.strictEqual(hist[2].details, 'SRC-001 créé', 'préfixe Ouvrage #7 retiré');
assert.strictEqual(hist[0].date, '2026-08-01 10:00:00', 'T → espace');
assert.strictEqual(C.auditLignes([]).length, 0);
assert.strictEqual(C.auditLignes(null).length, 0);

// ── comptes photos ─────────────────────────────────────────────────
assert.strictEqual(C.comptePhotos(point.medias), 2, '2 photos seulement');
assert.strictEqual(C.comptePhotos([]), 0);
const photosOuvrage = C.photosOuvrage({
    photo: '/media/principale.jpg',
    releve_consommation: {photos: ['/media/c1.jpg', {url: '/media/c2.jpg', type: 'photo'}]},
    releve_repere: {photo: '/media/r1.jpg'}
});
assert.strictEqual(photosOuvrage.length, 4, 'photo principale + 2 conso + 1 repère');
assert.strictEqual(photosOuvrage[0].url, '/media/principale.jpg');
assert.strictEqual(photosOuvrage[3].url, '/media/r1.jpg');

// ── libChoix / statutLabel ─────────────────────────────────────────
assert.strictEqual(C.libChoix('permanente', t), 'Permanente');
assert.strictEqual(C.libChoix('', t), '-');
assert.strictEqual(C.libChoix('inconnu', t), 'inconnu', 'valeur inconnue → brute');
assert.strictEqual(C.statutLabel('hors_service', t), 'Hors service');
assert.strictEqual(C.statutLabel(null, t), '-');
assert.strictEqual(C.statutLabel('xstat', t), 'xstat');

// ── ex : échappement ───────────────────────────────────────────────
assert.strictEqual(C.ex('<script>alert("x")</script>'),
    '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
assert.strictEqual(C.ex(null), '');
assert.strictEqual(C.ex(0), '0');

// ── API publique ───────────────────────────────────────────────────
assert.strictEqual(typeof M.demarrer, 'function');
assert.strictEqual(typeof M.ouvrirPoint, 'function');
assert.strictEqual(typeof M.ouvrirOuvrage, 'function');
assert.strictEqual(typeof M.fermer, 'function');

console.log('test_fiche : TOUT OK');
