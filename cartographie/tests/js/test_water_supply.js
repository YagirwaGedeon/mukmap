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