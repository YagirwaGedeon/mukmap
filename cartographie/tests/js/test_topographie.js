/* MUKMAP — Tests du cœur Outils Topographiques (fichier réel chargé, comme distribué).
 * En Node, `document` est indéfini : le IIFE expose OutilsTopo puis s'arrête.
 * Vérifie les calculs géodésiques : distances, surfaces, échantillonnage,
 * parsers d'altitudes, stats de profil et coordonnées projetées.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'static', 'js', 'topographie.js'), 'utf8');

assert.ok(src.includes('globalThis.OutilsTopo'), 'le fichier expose OutilsTopo');
eval(src);
const T = globalThis.OutilsTopo;
assert.ok(T, 'OutilsTopo chargé');

// ── URLs et constantes ──
assert.ok(T.URL_ELEVATION_POINT.includes('api.open-meteo.com'), 'point : Open-Meteo');
assert.ok(T.URL_ELEVATION_PROFIL.includes('api.opentopodata.org'), 'profil : OpenTopoData');
assert.ok(T.MAX_ECHANTILLONS === 100, '100 échantillons max');

// ── Distance (Goma → Bukavu, ~100 km) ──
const goma = { lat: -1.67, lng: 29.23, alt: 1524 };
const bukavu = { lat: -2.49, lng: 28.86, alt: 1461 };
const d2 = T.distance2D([goma, bukavu]);
assert.ok(d2 > 95000 && d2 < 105000, 'Goma→Bukavu ≈ 100 km (' + Math.round(d2) + ' m)');
const d3 = T.distance3D([goma, bukavu]);
assert.ok(d3 > d2, '3D ≥ 2D');

// ── Distance cumulée ──
const cum = T.cumulerDistances([goma, { lat: -2.0, lng: 29.0, alt: 1600 }, bukavu]);
assert.strictEqual(cum.length, 3, 'une ligne par point');
assert.ok(cum[2].d2d > cum[1].d2d && cum[1].d2d > cum[0].d2d, 'cumulés croissants');
assert.ok(Math.abs(cum[2].d3d - T.distance3D([goma, { lat: -2.0, lng: 29.0, alt: 1600 }, bukavu])) < 1e-6, 'dernier = total');

// ── Pente ──
const monte = [{ lat: 0, lng: 0, alt: 100 }, { lat: 0, lng: 0.001, alt: 200 }];
const p = T.penteSegment(monte, 1);
assert.ok(p > 85 && p < 95, '100 m / 111 m ≈ 90 % (' + p.toFixed(1) + ' %)');
assert.strictEqual(T.penteSegment(monte, 0), 0, 'pente hors bornes → 0');

// ── Surfaces : carré 0,01° × 0,01° (~1,24 km²) ──
const carre = [[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01]];
const s2d = T.surfacePlanimetrique(carre);
assert.ok(s2d > 1.2e6 && s2d < 1.28e6, 'surface 2D ≈ 1,24 km² (' + Math.round(s2d) + ' m²)');
const sproj = T.surfaceProjetee(carre);
assert.ok(sproj > 1.2e6 && sproj < 1.28e6, 'surface projetée ≈ 1,24 km² (' + Math.round(sproj) + ' m²)');
const sterrain = T.surfaceTerrain(carre, { sommets: [0, 0, 0, 0], centre: 0 });
assert.ok(sterrain > 1.2e6 && sterrain < 1.3e6, 'surface terrain à plat ≈ 2D');
const sterrainRelief = T.surfaceTerrain(carre, { sommets: [0, 100, 0, 100], centre: 50 });
assert.ok(sterrainRelief > sterrain, 'le relief augmente la surface');
assert.strictEqual(T.surfaceTerrain([[0, 0], [0, 0]], { sommets: [0, 0], centre: 0 }), 0, '< 3 points → 0');

// ── Échantillonnage ──
const ech = T.echantillonner([{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }], 11);
assert.strictEqual(ech.length, 11, '11 échantillons');
assert.strictEqual(ech[10].lng, 1, 'dernier = point B');
const dSeg = T.haversine(ech[0], ech[1]);
const dTot = T.haversine({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
assert.ok(Math.abs(dSeg - dTot / 10) < 1, 'segments équidistants');
assert.strictEqual(T.echantillonner([{ lat: 0, lng: 0 }], 5).length, 1, '1 point → inchangé');

// ── Parsers d'altitude ──
assert.strictEqual(T.lireElevationOpenMeteo({ elevation: [1524.0] }), 1524, 'Open-Meteo tableau');
assert.strictEqual(T.lireElevationOpenMeteo({ elevation: 1524 }), 1524, 'Open-Meteo nombre');
assert.strictEqual(T.lireElevationOpenMeteo({}), null, 'Open-Meteo vide → null');
assert.deepStrictEqual(
    T.lireElevationsOpenTopoData({ results: [{ elevation: 1525 }, { elevation: null }] }),
    [1525, null], 'OpenTopoData multi-points');
assert.deepStrictEqual(T.lireElevationsOpenTopoData({}), [], 'OpenTopoData vide');

// ── construireLocations ──
assert.strictEqual(
    T.construireLocations([{ lat: -1.67, lng: 29.23 }, { lat: -2.49, lng: 28.86 }]),
    '-1.67000,29.23000|-2.49000,28.86000', 'locations concaténées');

// ── Stats du profil ──
const profil = [
    { lat: 0, lng: 0, alt: 100 },
    { lat: 0, lng: 0.01, alt: 150 },
    { lat: 0, lng: 0.02, alt: 120 }
];
const st = T.statsProfil(profil);
assert.ok(Math.abs(st.distance - 2 * T.haversine(profil[0], profil[1])) < 1e-6, 'distance totale');
assert.strictEqual(st.altMin, 100, 'altitude minimale');
assert.strictEqual(st.altMax, 150, 'altitude maximale');
assert.strictEqual(st.denivele, 20, 'dénivelé total (120 − 100)');
assert.ok(st.penteMoyenne > 0.8 && st.penteMoyenne < 1.0, 'pente moyenne ≈ 0,9 %');
const stVide = T.statsProfil([{ lat: 0, lng: 0, alt: null }]);
assert.strictEqual(stVide.altMin, null, 'profil sans altitude → null');

// ── Projection EPSG:3857 ──
const m0 = T.projeter3857(0, 0);
assert.strictEqual(m0.x, 0, '3857 origine');
const m10 = T.projeter3857(0, 10);
assert.ok(Math.abs(m10.x - 1113194.9) < 1000, '10° → ≈ 1 113 195 m (' + Math.round(m10.x) + ')');

// ── UTM (Goma : zone 35 S) ──
assert.strictEqual(T.utmZone(29.23), 35, 'zone UTM 35');
const u = T.utmCoordonnees(-1.67, 29.23);
assert.strictEqual(u.zone, 35, 'zone Goma');
assert.strictEqual(u.hemisphere, 'S', 'hémisphère sud');
assert.ok(u.est > 700000 && u.est < 780000, 'est ≈ 748 000 m (' + Math.round(u.est) + ')');
assert.ok(u.nord > 9.78e6 && u.nord < 9.84e6, 'nord ≈ 9 815 000 m (' + Math.round(u.nord) + ')');

// ── État ──
assert.strictEqual(T.modeActif(), null, 'aucun mode actif au départ');
assert.deepStrictEqual(T.pointsCourants(), [], 'aucun point au départ');

console.log('topographie : OK');
