/* MUKMAP — Tests CARTES : métadonnées des fonds (fallback/fournisseur/licence)
 * et cœur du panneau « Statut des sources » (sources-cartographiques.js).
 * En Node, `document` est indéfini : les IIFE exposent leurs cores puis s'arrêtent.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// ── Chargement de basemap-selector.js (fallback + infos) ──
const srcBM = fs.readFileSync(
    path.join(__dirname, '..', '..', 'static', 'js', 'basemap-selector.js'), 'utf8');
assert.ok(srcBM.includes('fallbackDe'), 'basemap-selector.js expose fallbackDe');
eval(srcBM);
const B = globalThis.BasemapSelectorCore;
assert.ok(B, 'BasemapSelectorCore chargé');

// ── Chaînes de secours (acycliques, cibles valides, autres infrastructures) ──
const CHAINES = {
    osm: 'hot', hot: 'osm', rue: 'osm', voyager: 'osm', light: 'osm', dark: 'osm',
    admin: 'osm', natgeo: 'osm', minimal: 'osm',
    sat: 's2', sat_firefly: 's2', s2: 'osm', blue_marble: 'sat', sat_labels: 'sat',
    s2_2018: 's2', wayback: 'sat',
    topo: 'esri_topo', esri_topo: 'topo', relief: 'hillshade', hillshade: 'topo',
    terrain_eox: 'esri_topo', hypsometrie: 'esri_topo',
    couverture_sol: 'osm', eaux_surface: 'osm', ocean: 'osm', physique: 'osm',
    geo_unites: 'osm', mine_sites: 'osm', mine_cu_cobalt: 'osm'
};
Object.keys(CHAINES).forEach(k => {
    assert.strictEqual(B.fallbackDe(k), CHAINES[k], `fallback ${k} -> ${CHAINES[k]}`);
    const cible = B.fallbackDe(k);
    assert.ok(cible !== k, `fallback non circulaire : ${k}`);
    assert.ok(B.obtenir(cible), `cible de secours ${cible} existe dans le catalogue`);
});
assert.strictEqual(B.fallbackDe('inconnu'), 'osm', 'fallback par défaut → osm');
assert.strictEqual(B.fallbackDe('geo_failles'), 'osm', 'placeholder données requises → osm');

// ── Métadonnées professionnelles ──
const topo = B.infos('topo');
assert.strictEqual(topo.fournisseur, 'OpenTopoMap', 'fournisseur topo');
assert.strictEqual(topo.zoomMax, 17, 'zoom max topo');
assert.strictEqual(topo.fallback, 'esri_topo', 'fallback topo');
const sat = B.infos('sat');
assert.ok(sat.fournisseur.includes('Esri'), 'fournisseur satellite Esri');
assert.strictEqual(sat.zoomMax, 19, 'zoom max satellite');
const defaut = B.infos('ortho');
assert.strictEqual(defaut.fournisseur, '—', 'fournisseur par défaut pour non documenté');
assert.strictEqual(defaut.zoomMax, 19, 'zoom max par défaut');
assert.strictEqual(B.infos('inconnu'), null, 'infos d’un id inconnu → null');

// ── Chargement de sources-cartographiques.js (cœur pur) ──
const srcSC = fs.readFileSync(
    path.join(__dirname, '..', '..', 'static', 'js', 'sources-cartographiques.js'), 'utf8');
assert.ok(srcSC.includes('globalThis.SourcesCartoCore'), 'sources-cartographiques.js expose SourcesCartoCore');
eval(srcSC);
const S = globalThis.SourcesCartoCore;
assert.ok(S, 'SourcesCartoCore chargé');

// ── construireListe : normalisation + statut inconnu ──
const liste = S.construireListe([
    { id: 'osm', nom: 'OpenStreetMap', attribution: '© OSM', fournisseur: 'OpenStreetMap', licence: 'ODbL', zoomMax: 19, fallback: 'hot' },
    { id: 'incomplet' }
]);
assert.strictEqual(liste.length, 2);
assert.strictEqual(liste[0].statut, 'inconnu');
assert.strictEqual(liste[0].fallback, 'hot');
assert.strictEqual(liste[1].fournisseur, '—', 'fournisseur par défaut');
assert.strictEqual(liste[1].zoomMax, 19, 'zoom max par défaut');
assert.strictEqual(liste[1].licence, '—', 'licence par défaut');

// ── tuilePour : math slippy connue ──
assert.deepStrictEqual(S.tuilePour(0, 0, 0), { x: 0, y: 0, z: 0 });
assert.deepStrictEqual(S.tuilePour(0, 0, 1), { x: 1, y: 1, z: 1 });
const t9 = S.tuilePour(29.22, -1.67, 9);
assert.strictEqual(t9.x, 297, 'x tuile z9 (29.22°)');
assert.strictEqual(t9.y, 258, 'y tuile z9 (-1.67°)');

// ── urlTest : XYZ / WMTS / WMS ──
const u1 = S.urlTest('https://tile.openstreetmap.org/{z}/{x}/{y}.png', 29.22, -1.67, 9);
assert.ok(u1.includes('/9/297/258.png'), 'URL XYZ résolue');
assert.ok(u1.indexOf('{') === -1, 'aucun placeholder restant');
const u2 = S.urlTest('https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg', 29.22, -1.67, 9);
assert.ok(u2.includes('/9/258/297.jpg'), 'URL WMTS résolue');
const u3 = S.urlTest('https://mrdata.usgs.gov/services/mrds?SERVICE=WMS&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256', 29.22, -1.67, 9);
assert.ok(u3.indexOf('{bbox-epsg-3857}') === -1, 'BBOX EPSG:3857 résolu');
assert.ok(/BBOX=-?\d+\.\d+,-?\d+\.\d+,-?\d+\.\d+,-?\d+\.\d+/.test(u3), 'BBOX numérique');
assert.strictEqual(S.urlTest(null, 0, 0, 9), null, 'tuiles nulles → null');
assert.strictEqual(S.urlTest('https://x/{cle_api}/{z}/{x}/{y}.png', 0, 0, 2), null, 'placeholder inconnu → null');

// ── resoudre ──
assert.deepStrictEqual(S.resoudre(true, 'u'), { ok: true, statut: 'ok', url: 'u' });
assert.deepStrictEqual(S.resoudre(false, 'u'), { ok: false, statut: 'echec', url: 'u' });

console.log('OK — tests CARTES (fallback, métadonnées, statut des sources)');