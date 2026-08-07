/* MUKMAP — Tests du moteur pur GPS & navigation.
 * Charge le fichier réel distribué (aucune dépendance au DOM).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'static', 'js', 'gps.js'), 'utf8');

assert.ok(src.includes('global.MukmapGps'), 'le fichier expose MukmapGps');
eval(src);
const C = globalThis.MukmapGps.CORE;
assert.ok(C, 'MukmapGps.CORE chargé');

// ── distance haversine ────────────────────────────────────────
// Goma ↔ Kigali : ≈ 100 km
const d = C.distance(-1.6785, 29.233, -1.9706, 30.1044);
assert.ok(d > 90000 && d < 110000, 'Goma↔Kigali ≈ ' + d + ' m');

assert.strictEqual(C.distance(0, 0, 0, 0), 0, 'même point → 0');
assert.ok(Math.abs(C.distance(48.8566, 2.3522, 48.8566, 2.3522)) < 1e-6, 'Paris→Paris');

// 1° de latitude ≈ 111 195 m
const dLat = C.distance(0, 0, 1, 0);
assert.ok(dLat > 110000 && dLat < 113000, '1° de latitude ≈ 111 km (' + dLat + ')');

// ── cap ───────────────────────────────────────────────────────
assert.strictEqual(C.cap(0, 0, 1, 0), 0, 'nord → 0°');
assert.strictEqual(C.cap(0, 0, 0, 1), 90, 'est → 90°');
assert.strictEqual(C.cap(0, 0, -1, 0), 180, 'sud → 180°');
assert.strictEqual(C.cap(0, 0, 0, -1), 270, 'ouest → 270°');
assert.ok(Math.abs(C.cap(0, 0, 1, 1) - 45) < 0.01, 'approximativement nord-est → 45°');

// ── directionNom ──────────────────────────────────────────────
assert.strictEqual(C.directionNom(0), 'N');
assert.strictEqual(C.directionNom(90), 'E');
assert.strictEqual(C.directionNom(45), 'N-E');
assert.strictEqual(C.directionNom(359), 'N', '360° = nord');
assert.strictEqual(C.directionNom(720), 'N', 'cap > 360 normalisé');

// ── formatDistance ────────────────────────────────────────────
assert.strictEqual(C.formatDistance(0), '0 m');
assert.strictEqual(C.formatDistance(500), '500 m');
assert.strictEqual(C.formatDistance(999.99), '1000 m');
assert.strictEqual(C.formatDistance(1500), '1.5 km');
assert.strictEqual(C.formatDistance(12345), '12.35 km');
assert.strictEqual(C.formatDistance(null), '—');

// ── formatCap / qualitePrecision ──────────────────────────────
assert.ok(C.formatCap(45).includes('45° N-E'));
assert.strictEqual(C.qualitePrecision(5), 'bonne');
assert.strictEqual(C.qualitePrecision(12), 'bonne');
assert.strictEqual(C.qualitePrecision(25), 'moyenne');
assert.strictEqual(C.qualitePrecision(150), 'faible');
assert.strictEqual(C.qualitePrecision(null), 'inconnue');

// ── longueurTrace ─────────────────────────────────────────────
const trace = [[0, 0, 100], [0, 1, 110], [1, 1, 120]];
const longueur = C.longueurTrace(trace);
assert.ok(longueur > 220000 && longueur < 225000,
          'trace 2 segments ≈ 222 km (' + longueur + ' m)');

// ── toGPX / extraireGPX (aller-retour) ────────────────────────
const pts = [[-1.6785, 29.233, 1455, '2025-01-01T08:00:00Z'],
             [-1.7, 29.25, null, '2025-01-01T08:05:00Z']];
const gpx = C.toGPX('Traversée Bogoro', pts);
assert.ok(gpx.startsWith('<?xml'), 'en-tête XML');
assert.ok(gpx.includes('<trkpt lat="-1.6785" lon="29.233">'), 'point complet');
assert.ok(gpx.includes('<ele>1455</ele>'), 'altitude écrite');
assert.ok(gpx.includes('<name>Traversée Bogoro</name>'), 'nom de trace');
assert.ok(!gpx.includes('&amp;amp;'), 'pas de double échappement');
const gpxEchap = C.toGPX('A & B < C > D "E"', []);
assert.ok(gpxEchap.includes('A &amp; B &lt; C &gt; D &quot;E&quot;'), 'échappement XML');

const extrait = C.extraireGPX(gpx);
assert.strictEqual(extrait.length, 2, '2 points extraits');
assert.deepStrictEqual(extrait[0][0], -1.6785, 'latitude');
assert.deepStrictEqual(extrait[0][1], 29.233, 'longitude');
assert.deepStrictEqual(extrait[0][2], 1455, 'élévation');
assert.deepStrictEqual(extrait[0][3], '2025-01-01T08:00:00Z', 'temps');
assert.strictEqual(extrait[1][2], null, 'altitude absente → null');

// GPX avec plusieurs trkseg / trk
const multi = '<?xml version="1.0"?><gpx><trk><trkseg>' +
    '<trkpt lat="1" lon="2"><ele>3</ele><time>t1</time></trkpt>' +
    '</trkseg><trkseg><trkpt lat="4" lon="5"></trkpt></trkseg></trk></gpx>';
const extrait2 = C.extraireGPX(multi);
assert.strictEqual(extrait2.length, 2, 'segments concaténés');

// ── traceVersGeoJSON ──────────────────────────────────────────
const gj = C.traceVersGeoJSON(trace);
assert.strictEqual(gj.geometry.type, 'LineString');
assert.deepStrictEqual(gj.geometry.coordinates[0], [0, 0], 'lon/lat');
assert.ok(gj.properties.longueur_m > 220000, 'longueur pré-calculée');

console.log('test_gps : TOUT OK');