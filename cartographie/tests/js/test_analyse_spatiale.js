/* MUKMAP — Tests du moteur pur d'analyse spatiale.
 * Charge le fichier réel distribué (aucune dépendance au DOM).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'static', 'js', 'analyse-spatiale.js'), 'utf8');

assert.ok(src.includes('global.MukmapAnalyse'), 'le fichier expose MukmapAnalyse');
eval(src);
const C = globalThis.MukmapAnalyse.CORE;
assert.ok(C, 'MukmapAnalyse.CORE chargé');

// ── distance / longueur ────────────────────────────────────────
assert.ok(Math.abs(C.distance(0, 0, 0, 0)) < 1e-9, 'même point → 0');
const dLat = C.distance(0, 0, 1, 0);
assert.ok(dLat > 110000 && dLat < 113000, '1° de latitude ≈ 111 km (' + dLat + ')');

// Longueur d'une polyligne de deux segments
const longueur = C.longueur([[0, 0], [0, 1], [1, 1]]);
assert.ok(longueur > 220000 && longueur < 225000, '2 segments ≈ 222 km (' + longueur + ')');

// ── périmètre / aire ───────────────────────────────────────────
const carre = [[0, 0], [0, 0.01], [0.01, 0.01], [0.01, 0]];
const perim = C.perimetre(carre);
assert.ok(perim > 4400 && perim < 4460, 'carré ≈ 4,4 km de périmètre (' + perim + ')');

const aire = C.aire(carre);
// 1° de latitude ≈ 111 km ; le carré fait ~1,11 km × 1,11 km ≈ 1,23 km²
assert.ok(aire > 1200000 && aire < 1300000, 'aire ≈ 1,23 km² (' + aire + ')');

assert.strictEqual(C.aire([[0, 0], [0, 0]]), 0, 'polygone dégénéré → 0');

// ── buffer ─────────────────────────────────────────────────────
const cercle = C.buffer(0, 0, 1000);
assert.ok(cercle.length === 37, '36 sommets + fermeture');
// Chaque sommet doit être à ~1 km du centre
cercle.forEach(pt => {
    const d = C.distance(0, 0, pt[0], pt[1]);
    assert.ok(d > 990 && d < 1010, 'sommet à ~1 km (' + d + ')');
});
// Le buffer est bien fermé
assert.strictEqual(cercle[0][0], cercle[cercle.length - 1][0]);
assert.strictEqual(cercle[0][1], cercle[cercle.length - 1][1]);

// ── dansRayon / proches ────────────────────────────────────────
assert.strictEqual(C.dansRayon([0, 0], [0, 0], 100), true);
assert.strictEqual(C.dansRayon([0, 0], [0, 0.001], 200), true, '~111 m < 200 m');
assert.strictEqual(C.dansRayon([0, 0], [0, 0.001], 100), false, '~111 m > 100 m');
assert.strictEqual(C.dansRayon([0, 0], [0, 0.01], 100), false, '~1,1 km > 100 m');

const points = [
    {id: 1, latitude: '0', longitude: '0'},
    {id: 2, latitude: '0', longitude: '0.005'},
    {id: 3, latitude: '1', longitude: '1'},
];
const proches = C.proches(points, [0, 0], 1000);
assert.strictEqual(proches.length, 2, 'points à 0 m et ~555 m sont proches');

// ── dansPolygone / pointsDansPolygone ──────────────────────────
const poly = [[0, 0], [0, 10], [10, 10], [10, 0]]; // carré 10°×10°
assert.strictEqual(C.dansPolygone(5, 5, poly), true, 'centre → dedans');
assert.strictEqual(C.dansPolygone(5, 15, poly), false, 'au nord → dehors');
assert.strictEqual(C.dansPolygone(5, -5, poly), false, 'au sud → dehors');
assert.strictEqual(C.dansPolygone(-5, 5, poly), false, 'à l’ouest → dehors');
assert.strictEqual(C.dansPolygone(15, 5, poly), false, 'à l’est → dehors');

const dedans = C.pointsDansPolygone(points, poly);
assert.strictEqual(dedans.length, 3, 'les 3 points sont dans le polygone');

// un point manifestement hors du polygone
assert.strictEqual(C.pointsDansPolygone([{id: 9, latitude: '20', longitude: '20'}], poly).length, 0,
                   'point extérieur exclu');

// ── bbox / bboxPoints / bboxSeChevauchent ──────────────────────
assert.deepStrictEqual(C.bbox([[5, 5], [1, 3], [3, 7]]), [1, 3, 5, 7]);
assert.deepStrictEqual(C.bboxPoints(points), [0, 0, 1, 1]);
assert.strictEqual(C.bboxPoints([]), null);
assert.strictEqual(C.bboxPoints([{latitude: 'x', longitude: 'y'}]), null, 'points invalides → null');

assert.strictEqual(C.bboxSeChevauchent([0, 0, 5, 5], [4, 4, 9, 9]), true);
assert.strictEqual(C.bboxSeChevauchent([0, 0, 5, 5], [6, 6, 9, 9]), false);

// ── polygonesSeChevauchent ─────────────────────────────────────
const polyA = [[0, 0], [0, 5], [5, 5], [5, 0]];
const polyB = [[4, 4], [4, 9], [9, 9], [9, 4]];
const polyC = [[10, 10], [10, 12], [12, 12], [12, 10]];
assert.strictEqual(C.polygonesSeChevauchent(polyA, polyB), true, 'chevauchement partiel');
assert.strictEqual(C.polygonesSeChevauchent(polyA, polyC), false, 'disjoints');

// ── selectionSpatiale ──────────────────────────────────────────
const selRayon = C.selectionSpatiale(points, 'rayon', {lat: 0, lng: 0, rayon_m: 1000});
assert.strictEqual(selRayon.length, 2, 'rayon 1 km (0 m et ~555 m)');

// rayon plus court : seul le point central
const selRayonProche = C.selectionSpatiale(points, 'rayon', {lat: 0, lng: 0, rayon_m: 10});
assert.strictEqual(selRayonProche.length, 1, 'rayon 10 m → seul le centre');

const selPoly = C.selectionSpatiale(points, 'polygone', {polygone: poly});
assert.strictEqual(selPoly.length, 3, 'polygone');

const selBbox = C.selectionSpatiale(points, 'zone', {bbox: [0, 0, 0.5, 0.5]});
assert.strictEqual(selBbox.length, 2, 'bbox restreinte');

const selTout = C.selectionSpatiale(points, null, null);
assert.strictEqual(selTout.length, 3, 'sans critère → tout');

// ── agreger ────────────────────────────────────────────────────
const avecCat = [
    {id: 1, categorie: 'hopital'},
    {id: 2, categorie: 'ecole'},
    {id: 3, categorie: 'hopital'},
    {id: 4},
];
const agg = C.agreger(avecCat, 'categorie');
assert.strictEqual(agg.total, 4);
assert.deepStrictEqual(agg.cles, ['Non renseigné', 'ecole', 'hopital']);
assert.strictEqual(agg.valeurs['hopital'], 2);
assert.strictEqual(agg.valeurs['ecole'], 1);
assert.strictEqual(agg.valeurs['Non renseigné'], 1);

console.log('test_analyse_spatiale : TOUT OK');