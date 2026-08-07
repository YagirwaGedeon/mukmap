/* MUKMAP — Tests du moteur pur « Water Supply Survey ».
 * Charge le fichier réel distribué (aucune dépendance au DOM).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'static', 'js', 'water-supply.js'), 'utf8');

assert.ok(src.includes('global.MukmapWaterSupply'), 'le fichier expose MukmapWaterSupply');
eval(src);
const C = globalThis.MukmapWaterSupply.CORE;
assert.ok(C, 'MukmapWaterSupply.CORE chargé');

// ── Types ────────────────────────────────────────────────────────
assert.ok(C.TYPES.source, 'type source présent');
assert.ok(C.TYPES.borne, 'type borne présent');
assert.ok(C.TYPES.village, 'type village présent');

// ── Classification SOURCE D'EAU ──────────────────────────────────
const srcListe = C.sourcesListe();
assert.strictEqual(srcListe.length, 11, '11 sous-types de source (' + srcListe.length + ')');
const idsSources = srcListe.map((s) => s.id);
for (const attendu of ['naturelle', 'amenagee', 'forage', 'puits', 'riviere', 'lac', 'etang',
                       'captage_source', 'gravitaire', 'resurgence', 'autre']) {
    assert.ok(idsSources.includes(attendu), 'sous-type présent : ' + attendu);
}
assert.strictEqual(C.SOURCES.forage.debit, true, 'forage : débit applicable');
assert.strictEqual(C.SOURCES.forage.profondeur, true, 'forage : profondeur applicable');
assert.strictEqual(C.SOURCES.lac.debit, false, 'lac : pas de débit mesuré');
assert.ok(C.sourceLabel('naturelle').startsWith('src_'), 'labelKey pour i18n');
assert.strictEqual(C.sourceLabel('inconnu'), 'inconnu', 'label inconnu → id');

// ── Classification POINT DE CONSOMMATION (G) ─────────────────────
const consoListe = C.consommationsListe();
assert.strictEqual(consoListe.length, 8, '8 types de point de consommation (' + consoListe.length + ')');
const idsConso = consoListe.map((s) => s.id);
for (const attendu of ['borne_fontaine', 'robinet_public', 'kiosque_eau', 'point_communautaire',
                       'ecole_conso', 'centre_sante_conso', 'institution', 'autre_desservi']) {
    assert.ok(idsConso.includes(attendu), 'type de consommation présent : ' + attendu);
}
assert.ok(C.consommationLabel('borne_fontaine').startsWith('conso_'), 'labelKey conso pour i18n');
assert.strictEqual(C.consommationLabel('inconnu'), 'inconnu', 'label conso inconnu → id');

// ── Classification REPÈRES / POINTS INTERMÉDIAIRES (H) ───────────
const reperesListe = C.reperesListe();
assert.strictEqual(reperesListe.length, 22, '22 types de repères (' + reperesListe.length + ')');
const idsReperes = reperesListe.map((s) => s.id);
for (const attendu of ['carrefour', 'route', 'pont', 'riviere_repere', 'ravin', 'colline', 'sommet',
                       'vallee', 'ecole_repere', 'maison', 'marche', 'eglise', 'centre_sante_repere',
                       'passage_difficile', 'zone_rocheuse', 'zone_marecageuse', 'traversee_riviere',
                       'point_haut', 'point_bas', 'reservoir_potentiel', 'chambre_vanne_potentielle',
                       'autre_repere']) {
    assert.ok(idsReperes.includes(attendu), 'type de repère présent : ' + attendu);
}
assert.ok(C.repereLabel('pont').startsWith('repere_'), 'labelKey repère pour i18n');
assert.strictEqual(C.repereLabel('inconnu'), 'inconnu', 'label repère inconnu → id');

// ── Réservoirs ──
const reservoirsListe = C.reservoirsListe();
assert.strictEqual(reservoirsListe.length, 2, '2 types de réservoir (' + reservoirsListe.length + ')');
const idsReservoirs = reservoirsListe.map((s) => s.id);
for (const attendu of ['reservoir', 'chateau_eau']) {
    assert.ok(idsReservoirs.includes(attendu), 'type de réservoir présent : ' + attendu);
}
assert.ok(C.reservoirLabel('chateau_eau').startsWith('reservoir_'), 'labelKey réservoir pour i18n');

// ── Ouvrages du réseau ──
const reseauxListe = C.reseauxListe();
assert.strictEqual(reseauxListe.length, 7, '7 types d\'ouvrages du réseau (' + reseauxListe.length + ')');
const idsReseaux = reseauxListe.map((s) => s.id);
for (const attendu of ['station_pompage', 'chambre_vanne', 'vanne', 'ventouse', 'vidange',
                       'traversee_riviere', 'autre_reseau']) {
    assert.ok(idsReseaux.includes(attendu), 'ouvrage du réseau présent : ' + attendu);
}
assert.ok(C.reseauLabel('station_pompage').startsWith('reseau_'), 'labelKey réseau pour i18n');
assert.strictEqual(C.reseauLabel('inconnu'), 'inconnu', 'label réseau inconnu → id');

// émojis par sous-type (carte)
assert.strictEqual(C.emojiOuvrage('reseau', 'vanne'), '🔧', 'émoji sous-type réseau');
assert.strictEqual(C.emojiOuvrage('reservoir', 'chateau_eau'), '🗼', 'émoji château d\'eau');
assert.strictEqual(C.emojiOuvrage('borne', null), '🚰', 'émoji par défaut du type');

// ── constructeur de réseau : accrochage des ouvrages ───────────────
const accroches = [
    {id: 61, type: 'source', nom: 'S', latitude: 0, longitude: 0, altitude_m: 1000},
    {id: 62, type: 'captage', nom: 'C', latitude: 0.001, longitude: 0, altitude_m: 990},
    {id: 63, type: 'borne', nom: 'BF', latitude: 2, longitude: 2, altitude_m: 900}
];
const acc = C.ouvragePlusProche(accroches, 0, 0.001, 60);
assert.strictEqual(acc.id, 62, 'captage le plus proche du point (111 m)');
assert.strictEqual(C.ouvragePlusProche(accroches, 2, 2.01, 60), null, 'hors rayon → null');
assert.strictEqual(C.ouvragePlusProche([], 0, 0, 60), null, 'liste vide → null');
const acc2 = C.ouvragePlusProche(accroches, 0, 0.0002, 60);
assert.strictEqual(acc2.id, 61, 'source seule dans le rayon (22 m), captage hors rayon (89 m)');


// ── Polygon (village : polygone / zone) ──────────────────────────
const poly = C.polygoneGeoJSON([[0, 0], [0.001, 0], [0.001, 0.001]], {nom: 'V1'});
assert.strictEqual(poly.geometry.type, 'Polygon');
assert.strictEqual(poly.geometry.coordinates.length, 1);
assert.strictEqual(poly.geometry.coordinates[0].length, 4, 'anneau fermé (3 points + fermeture)');
const polyFerme = C.polygoneGeoJSON([[0, 0], [0.001, 0], [0.001, 0.001], [0, 0]], {});
assert.strictEqual(polyFerme.geometry.coordinates[0].length, 4, 'anneau déjà fermé conservé');
assert.strictEqual(C.polygoneGeoJSON([], {}).geometry.coordinates[0].length, 0, 'vide → anneau vide');

// ── distance haversine ───────────────────────────────────────────
assert.ok(Math.abs(C.distance(0, 0, 0, 0)) < 1e-9, 'même point → 0');
const dLat = C.distance(0, 0, 1, 0);
assert.ok(dLat > 110000 && dLat < 113000, '1° de latitude ≈ 111 km (' + dLat + ')');

// ── longueurTrace / distanceCoord ────────────────────────────────
const traj = [[30.30, 1.40, 1250], [30.31, 1.41, 1230], [30.32, 1.42, 1200]];
assert.ok(Math.abs(C.distanceCoord([0, 0, null], [0, 1, null]) - C.distance(0, 0, 0, 1)) < 1e-6,
          'distanceCoord = distance haversine');
assert.ok(C.longueurTrace(traj) > 3000 && C.longueurTrace(traj) < 4000, 'tracé de 3 points ~3,5 km');
assert.strictEqual(C.longueurTrace([]), 0);
assert.strictEqual(C.longueurTrace([[1, 2]]), 0);

// ── dénivelés ────────────────────────────────────────────────────
const penteP = [[0, 0, 100], [0.001, 0, 150], [0.002, 0, 120]];
assert.strictEqual(C.denivelePositif(penteP), 50, 'montée 100→150 = +50 m');
assert.strictEqual(C.deniveleNet(penteP), 20, '120 - 100 = +20 m nets');
assert.strictEqual(C.deniveleNet([[0, 0, 100], [0.001, 0]]), null, 'altitude manquante → null');
assert.strictEqual(C.denivelePositif([[0, 0, null], [0.001, 0, 200]]), 0, 'sans alt de départ');

// ── pente moyenne ────────────────────────────────────────────────
const pentePlat = C.penteMoyenne([[0, 0, 100], [0.001, 0, 105]]);
assert.ok(pentePlat > 4 && pentePlat < 5, 'pente ≈ 4,5 % (' + pentePlat + ')');

// ── Mode « ENREGISTRER LE TRACÉ » (reconnaissance GPS) ───────────
const rec = [
    [30.30, 1.40, 100, '2026-08-07T08:00:00Z'],
    [30.30, 1.4009, 105, '2026-08-07T08:00:30Z'],
    [30.30, 1.4018, 102, '2026-08-07T08:01:00Z'],
    [30.30, 1.4027, 104, '2026-08-07T08:02:00Z']
];
const distSeg = C.distance(1.40, 30.30, 1.4009, 30.30);
assert.ok(distSeg > 99 && distSeg < 102, 'segment ≈ 100 m (' + distSeg + ')');
assert.ok(C.longueurTotale3d(rec) > C.longueurTrace(rec),
          'longueur 3D > distance horizontale');
assert.ok(Math.abs(C.longueurTotale3d(rec) - C.longueurTrace(rec)) < 1,
          'montées/descentes courtes → 3D ≈ 2D');
assert.ok(C.longueurTotale3d([[0, 0, 0], [0, 0.001, 111.19]]) > C.longueurTrace([[0, 0, 0], [0, 0.001, 111.19]]),
          'dénivelé égal à la distance → 3D > 2D');
assert.strictEqual(C.denivelePositif(rec), 7, '+5 +2 = +7 m');
assert.strictEqual(C.deniveleNegatif(rec), 3, 'descente de 3 m');
assert.deepStrictEqual(C.altitudesMinMax(rec), {min: 100, max: 105});
assert.strictEqual(C.dureeTrace(rec), 120, '08:00:00 → 08:02:00 = 120 s');
assert.strictEqual(C.dureeTrace([[30.30, 1.40]]), null, 'sans timestamps → null');
assert.ok(C.penteMaximale(rec) > 4 && C.penteMaximale(rec) < 5,
          'pente max ≈ 4,5 % (' + C.penteMaximale(rec) + ')');
const synth = C.analyseTraceGps(rec);
assert.strictEqual(synth.nb_points, 4);
assert.strictEqual(synth.duree_s, 120);
assert.strictEqual(synth.altitude_min, 100);
assert.strictEqual(synth.altitude_max, 105);
assert.strictEqual(synth.denivele_positif, 7);
assert.strictEqual(synth.denivele_negatif, 3);
assert.ok(synth.longueur_totale > synth.distance_horizontale, '3D > 2D dans la synthèse');
assert.strictEqual(C.analyseTraceGps([]).nb_points, 0);
assert.strictEqual(C.analyseTraceGps([]).longueur_totale, 0);

// ── charges / pressions / débits ─────────────────────────────────
assert.strictEqual(C.chargeDisponible(1200, 1150, 10), 40, 'charge = 1200-1150-10 = 40 m');
assert.ok(C.pressionBar(50) > 4.8 && C.pressionBar(50) < 5.0, '50 m ≈ 4,9 bar');
assert.ok(C.debitMesure(100, 60) > 0.0016 && C.debitMesure(100, 60) < 0.0017, '100 L / 60 s ≈ 1,67 L/s');
assert.strictEqual(C.debitMesure(10, 0), 0);

// débit par fontaine : 1000 pers × 20 L/j sur 10 bornes
const dbp = C.debitParFontaine(1000, 10, 20);
assert.ok(dbp > 0.023 && dbp < 0.024, '≈ 0,0231 L/s par borne (' + dbp + ')');

// ── longueur conduite estimée ────────────────────────────────────
const dist = C.distance(0, 0, 0, 0.1);
const conduite = C.longueurConduite({latitude: 0, longitude: 0}, {latitude: 0, longitude: 0.1}, 1);
assert.ok(Math.abs(conduite - dist) < 1, 'sinuosite 1 → distance directe');
const conduite2 = C.longueurConduite({latitude: 0, longitude: 0}, {latitude: 0, longitude: 0.1}, 1.4);
assert.ok(Math.abs(conduite2 - dist * 1.4) < 1, 'sinuosite 1,4 → +40 %');

// ── profil / relief ──────────────────────────────────────────────
const prof = C.profilRelief([[0.30, 1.20, 200], [0.31, 1.20, 210], [0.32, 1.20, 205]]);
assert.strictEqual(prof.length, 3);
assert.strictEqual(prof[0].dist, 0);
assert.ok(prof[2].dist > prof[1].dist, 'distances cumulées croissantes');

const rel = C.reliefTracing(penteP);
assert.strictEqual(rel.denivele.positif, 50);
assert.strictEqual(rel.denivele.net, 20);
assert.ok(rel.longueur > 0);

// ── profil en long (détaillé) ──────────────────────────────────────
// Trace : montée +12 m, descente −8 m (contre-pente), remontée +3 m.
const traceP = [[0, 0, 100], [0.001, 0, 112], [0.002, 0, 104], [0.003, 0, 107]];
const pd = C.profilDetaille(traceP);
assert.strictEqual(pd.length, 4);
assert.strictEqual(pd[0].dist, 0);
assert.strictEqual(pd[0].alt, 100);
assert.ok(pd[0].pente > 10.6 && pd[0].pente < 10.9, 'pente 100→112 ≈ +10,8 % (' + pd[0].pente + ')');
assert.ok(pd[1].pente < -7.1 && pd[1].pente > -7.3, 'pente 112→104 ≈ -7,2 % (' + pd[1].pente + ')');
assert.ok(pd[3].dist > 330 && pd[3].dist < 340, 'cumulée ≈ 334 m (' + pd[3].dist + ')');
assert.ok(pd[3].pente > 2.6 && pd[3].pente < 2.8, 'dernier point : pente du segment précédent ≈ +2,7 %');
const exP = C.extremaProfil(pd);
assert.strictEqual(exP.length, 2);
assert.strictEqual(exP[0].type, 'haut');
assert.strictEqual(exP[0].alt, 112);
assert.strictEqual(exP[1].type, 'bas');
assert.strictEqual(exP[1].alt, 104);
assert.strictEqual(C.extremaProfil(pd.slice(0, 2)).length, 0, 'moins de 3 points → aucun extremum');

const zfP = C.zonesFortesPentes(pd, 10);
assert.strictEqual(zfP.length, 1, '1 zone de forte pente');
assert.ok(zfP[0].pente_max > 10.6 && zfP[0].pente_max < 10.9, 'pente_max ≈ 10,8 %');
assert.strictEqual(zfP[0].debut_i, 0);
assert.strictEqual(zfP[0].fin_i, 1);

const cpP = C.contrepentes(pd, 1);
assert.strictEqual(cpP.length, 1, '1 contre-pente (net > 0)');
assert.strictEqual(cpP[0].debut_i, 1);
assert.strictEqual(cpP[0].fin_i, 2);
assert.ok(cpP[0].pente_min < -7.1, 'pente_min de la contre-pente');
assert.strictEqual(C.contrepentes([{alt: 100, pente: 5}, {alt: 105, pente: null}]).length, 0, 'sans altitude → pas de contre-pente');

const resP = C.reservoirPotentiel(pd);
assert.strictEqual(resP.alt, 112);
assert.ok(resP.dist > 100 && resP.dist < 125, 'réservoir ≈ point 2 (' + resP.dist + ')');
assert.strictEqual(C.reservoirPotentiel([{alt: null}, {alt: null}]), null, 'aucune altitude → null');

const zaP = C.zonesAttention(pd, 10, 1);
assert.strictEqual(zaP.length, 2, 'forte pente + contre-pente');
assert.strictEqual(zaP[0].raison, 'forte_pente');
assert.strictEqual(zaP[1].raison, 'contre_pente');

const repProche = {id: 51, type: 'repere', nom: 'R51', latitude: 0, longitude: 0.001, altitude_m: null};
const repLoin = {id: 52, type: 'repere', nom: 'R52', latitude: 2, longitude: 2, altitude_m: null};
const repTest = C.reperesSurTrace(traceP, [repProche, repLoin, {id: 53, type: 'source', nom: 'S53', latitude: 0.001, longitude: 0, altitude_m: null}], 100);
assert.strictEqual(repTest.length, 1, 'seul le repère proche est retenu');
assert.strictEqual(repTest[0].ouvrage.nom, 'R51');
assert.strictEqual(repTest[0].dist_m, 0);
assert.ok(repTest[0].dist_cumulee_m > 100 && repTest[0].dist_cumulee_m < 125, 'cumulée du repère ≈ 111 m');

// ── analyse système source → village ───────────────────────────────
const srcS = {id: 1, type: 'source', nom: 'Source', latitude: 0, longitude: 0, altitude_m: 1000};
const vlgS = {id: 2, type: 'village', nom: 'Village', latitude: 0.01, longitude: 0, altitude_m: 1050};
const sys = C.analyserSysteme(srcS, vlgS, [
    {id: 3, type: 'borne', nom: 'BF1', latitude: 0.003, longitude: 0, altitude_m: 1020},
    {id: 4, type: 'borne', nom: 'BF2', latitude: 0.007, longitude: 0, altitude_m: 1040}
], null);
assert.strictEqual(sys.distance_m, 1112, 'distance source→village ≈ 1112 m (' + sys.distance_m + ')');
assert.strictEqual(sys.denivele_net_m, 50, 'dénivelé net +50 m');
assert.strictEqual(sys.denivele_total_m, 50, 'dénivelé total 50 m');
assert.strictEqual(sys.altitude_source_m, 1000, 'altitude source');
assert.strictEqual(sys.altitude_village_m, 1050, 'altitude village');
assert.strictEqual(sys.bornes.count, 2, '2 bornes');
assert.strictEqual(sys.bornes.min, 1020, 'borne la plus basse');
assert.strictEqual(sys.bornes.max, 1040, 'borne la plus haute');
assert.strictEqual(sys.bornes.moy, 1030, 'altitude moyenne des bornes');
assert.strictEqual(sys.longueur_m, sys.distance_m, 'sans trace : longueur = distance directe');
assert.ok(sys.pente_moyenne_pct > 4.4 && sys.pente_moyenne_pct < 4.6, 'pente moyenne ≈ 4,5 % (' + sys.pente_moyenne_pct + ')');
assert.strictEqual(sys.point_haut_m, 1050, 'point le plus haut = village');
assert.strictEqual(sys.point_bas_m, 1000, 'point le plus bas = source');

// avec un tracé (sinueux) fourni
const sys2 = C.analyserSysteme(srcS, vlgS, [],
    {coordonnees: [[0, 0, 1000], [0.005, 0.002, 1100], [0.01, 0, 1050]]});
assert.ok(sys2.longueur_m > 1112, 'trace sinueuse plus longue (' + sys2.longueur_m + ')');
assert.ok(sys2.pente_moyenne_pct > 4 && sys2.pente_moyenne_pct < 4.5, 'pente moyenne sur trace');
assert.strictEqual(sys2.point_haut_m, 1100, 'point haut sur la trace');
assert.strictEqual(sys2.bornes.count, 0, 'aucune borne');

// altitudes manquantes / source absente
const sys3 = C.analyserSysteme({id: 5, type: 'source', nom: 'S', latitude: 0, longitude: 0, altitude_m: null},
    {id: 6, type: 'village', nom: 'V', latitude: 0.01, longitude: 0, altitude_m: null}, [], null);
assert.strictEqual(sys3.denivele_net_m, null, 'dénivelé indisponible');
assert.strictEqual(sys3.pente_moyenne_pct, null, 'pente indisponible');
assert.strictEqual(sys3.point_haut_m, null, 'aucun point haut');
assert.strictEqual(C.analyserSysteme(null, vlgS, [], null), null, 'source manquante → null');

// ── altitudes / analyse ──────────────────────────────────────────
const ouvrages = [
    {id: 1, type: 'source', nom: 'S1', latitude: 0, longitude: 0, altitude_m: 1250, beneficiaires: 120},
    {id: 2, type: 'borne', nom: 'B1', latitude: 0, longitude: 0.1, altitude_m: 1180, beneficiaires: 300},
    {id: 3, type: 'village', nom: 'V1', latitude: 0.05, longitude: 0.05, altitude_m: 1210, beneficiaires: 500},
    {id: 4, type: 'repere', nom: 'R1', latitude: 0.03, longitude: 0.03, altitude_m: null},
];
const pl = C.plageAltitudes(ouvrages);
assert.deepStrictEqual(pl, {min: 1180, max: 1250});
assert.strictEqual(C.differenceAltitude(ouvrages[0], ouvrages[1]), 70, '1250-1180 = 70 m');
assert.strictEqual(C.differenceAltitude(ouvrages[0], ouvrages[3]), null, 'altitude manquante');
assert.ok(C.distanceMax(ouvrages) > 11000 && C.distanceMax(ouvrages) < 11200, 'enveloppe ≈ 11,1 km');

// ── GeoJSON ──────────────────────────────────────────────────────
const fc = C.ouvragesGeoJSON(ouvrages);
assert.strictEqual(fc.type, 'FeatureCollection');
assert.strictEqual(fc.features.length, 4);
assert.deepStrictEqual(fc.features[0].geometry.coordinates, [0, 0]);
assert.strictEqual(fc.features[0].properties.emoji, '💧');

const ligne = C.traceGeoJSON([[0, 0], [1, 1]], {nom: 'T'});
assert.strictEqual(ligne.geometry.type, 'LineString');
assert.deepStrictEqual(ligne.geometry.coordinates, [[0, 0], [1, 1]]);

// ── CSV ──────────────────────────────────────────────────────────
const csv = C.ouvragesCSV(ouvrages);
assert.ok(csv.includes('id;type;nom;latitude'), 'en-tête CSV');
assert.ok(csv.includes('"S1"'), 'nom entre guillemets');
assert.ok(csv.split('\n').length === 5, '1 en-tête + 4 lignes');

// ── Rapport ──────────────────────────────────────────────────────
const ra = C.rapportTerrain(
    {nom: 'Adduction Bogoro', commanditaire: 'UNICEF', zone_nom: 'Irumu', statut: 'terrain', statut_label: 'Collecte terrain', observations: ''},
    ouvrages, []
);
assert.ok(ra.includes('RAPPORT DE TERRAIN'));
assert.ok(ra.includes('Adduction Bogoro'));
assert.ok(ra.includes('UNICEF'));
assert.ok(ra.includes('OUVRAGES RELEVÉS (4)'));
assert.ok(ra.includes('SOURCE D\'EAU'));

const raSymboles = C.rapportTerrain(
    {nom: 'P', commanditaire: '', zone_nom: '', statut: 'planifie', statut_label: 'Préparation', observations: 'o'},
    [{id: 5, type: 'borne', nom: 'BF1', latitude: 1, longitude: 2, altitude_m: 100, beneficiaires: 10, observations: 'obsx'}],
    [{id: 7, nom: 'T1', longueur_m: 500, denivelee_m: 20}]
);
assert.ok(raSymboles.includes('BORNE-FONTAINE'));
assert.ok(raSymboles.includes('obsx'));
assert.ok(raSymboles.includes('500'));

console.log('test_water_supply : TOUT OK');