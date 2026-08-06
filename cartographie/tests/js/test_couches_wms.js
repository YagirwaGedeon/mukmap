/* MUKMAP — Tests des couches WMS superposables (couches-wms.js).
 * En Node, `document` est indéfini : le IIFE expose CouchesWMSCore puis s'arrête.
 * Intégration avec basemap-selector.js : les fonds passent SOUS les couches WMS.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function lire(nom) {
    return fs.readFileSync(path.join(__dirname, '..', '..', 'static', 'js', nom), 'utf8');
}

const src = lire('couches-wms.js');
assert.ok(src.includes('globalThis.CouchesWMSCore'), 'le fichier expose CouchesWMSCore');
eval(src);
const C = globalThis.CouchesWMSCore;
assert.ok(C, 'CouchesWMSCore chargé');

// ── Fausse carte : pile d'enregistrement ──
const appels = [];
appels._sources = {};
appels._layers = {};
function fabriquerCarte(pile) {
    return {
        getSource: (id) => appels._sources[id],
        addSource: (id, spec) => { appels.push(['addSource', id, spec.type, spec.tiles[0]]); appels._sources[id] = spec; },
        removeSource: (id) => { appels.push(['removeSource', id]); delete appels._sources[id]; },
        getLayer: (id) => appels._layers[id],
        addLayer: (spec, avant) => { appels.push(['addLayer', spec.id, avant]); appels._layers[spec.id] = spec; },
        removeLayer: (id) => { appels.push(['removeLayer', id]); delete appels._layers[id]; },
        setLayoutProperty: (id, prop, val) => appels.push(['setLayoutProperty', id, prop, val]),
        setPaintProperty: (id, prop, val) => appels.push(['setPaintProperty', id, prop, val]),
        getStyle: () => ({ layers: (pile || []).map(function (id) { return { id: id }; }) })
    };
}

const URL = 'https://geo.example/wms?SERVICE=WMS&REQUEST=GetMap&LAYERS=basins&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256';
const couche = { id: 1, nom: 'Bassins', url: URL, attribution: '© HydroSHEDS', opacite: 0.55, visible: true };

// ── Ajout : source raster + couche sous clusters, opacité appliquée ──
let map = fabriquerCarte(['bm-osm', 'clusters']);
assert.strictEqual(C.ajouter(map, couche), true, 'ajouter → true');
assert.ok(appels._sources['wms-1'], 'source wms-1 créée');
assert.strictEqual(appels._sources['wms-1'].type, 'raster', 'type raster');
assert.strictEqual(appels._sources['wms-1'].tiles[0], URL, 'URL GetMap transmise');
const addLayer = appels.filter(a => a[0] === 'addLayer' && a[1] === 'wms-1-c')[0];
assert.ok(addLayer, 'couche wms-1-c ajoutée');
assert.strictEqual(addLayer[2], 'clusters', 'insérée sous les données');
assert.strictEqual(appels._layers['wms-1-c'].paint['raster-opacity'], 0.55, 'opacité 0.55 appliquée');
assert.strictEqual(appels._layers['wms-1-c'].layout.visibility, 'visible', 'visible par défaut');

// ── Idempotence ──
const nbAdd = appels.filter(a => a[0] === 'addLayer').length;
C.ajouter(map, couche);
assert.strictEqual(appels.filter(a => a[0] === 'addLayer').length, nbAdd, 'couche non re-ajoutée');

// ── Couche invisible ──
appels.length = 0;
const cInvisible = Object.assign({}, couche, { id: 2, visible: false });
assert.strictEqual(C.ajouter(map, cInvisible), true);
assert.strictEqual(appels._layers['wms-2-c'].layout.visibility, 'none', 'invisible → none');

// ── Bascule visibilité ──
appels.length = 0;
assert.strictEqual(C.basculer(map, 1, false), true, 'basculer → true');
assert.ok(appels.some(a => a[0] === 'setLayoutProperty' && a[1] === 'wms-1-c' && a[3] === 'none'), 'masquée');
assert.strictEqual(C.basculer(map, 999, true), false, 'couche inconnue → false');

// ── Opacité ──
appels.length = 0;
assert.strictEqual(C.opacite(map, 1, 0.3), true);
assert.ok(appels.some(a => a[0] === 'setPaintProperty' && a[1] === 'wms-1-c' && a[3] === 0.3), 'opacité 0.3');
assert.strictEqual(C.opacite(map, 1, 5), true, 'borne haute acceptée');
assert.ok(appels.some(a => a[0] === 'setPaintProperty' && a[3] === 1), 'opacité bornée à 1');

// ── Retrait ──
appels.length = 0;
C.retirer(map, 1);
assert.ok(appels.some(a => a[0] === 'removeLayer' && a[1] === 'wms-1-c'), 'couche retirée');
assert.ok(appels.some(a => a[0] === 'removeSource' && a[1] === 'wms-1'), 'source retirée');

// ── premiereCouche / ids ──
const mapPile = fabriquerCarte(['bm-osm', 'wms-3-c', 'wms-7-c', 'clusters']);
assert.strictEqual(C.premiereCouche(mapPile), 'wms-3-c', 'couche wms la plus basse');
assert.deepStrictEqual(C.ids(mapPile), [3, 7], 'ids numériques');
assert.strictEqual(C.premiereCouche(fabriquerCarte(['bm-osm', 'clusters'])), null, 'aucune wms → null');

// ── Intégration basemap-selector : fond inséré SOUS les WMS ──
const srcBm = lire('basemap-selector.js');
eval(srcBm);
const B = globalThis.BasemapSelectorCore;
assert.ok(B, 'BasemapSelectorCore chargé');
appels.length = 0;
appels._sources = {};
appels._layers = {};
const mapHyb = fabriquerCarte(['wms-3-c', 'clusters']);
assert.strictEqual(B.appliquer(mapHyb, 'osm'), true, 'appliquer(osm) avec wms présente');
const addFond = appels.filter(a => a[0] === 'addLayer' && a[1] === 'bm-osm')[0];
assert.ok(addFond, 'fond ajouté');
assert.strictEqual(addFond[2], 'wms-3-c', 'fond inséré AVANT la couche WMS (dessous)');

console.log('couches-wms : OK');
