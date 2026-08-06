/* MUKMAP — Tests du module Imagerie aérienne (imagerie.js).
 * En Node, `document` est indéfini : le IIFE expose ImagerieCore puis s'arrête.
 * Une fausse carte enregistre les appels MapLibre et les valide.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'static', 'js', 'imagerie.js'), 'utf8');

assert.ok(src.includes('globalThis.ImagerieCore'), 'le fichier expose ImagerieCore');
eval(src);
const C = globalThis.ImagerieCore;
assert.ok(C, 'ImagerieCore chargé');

// ── Coordonnées ──
const img = { id: 1, url: '/media/imagerie/a.jpg', min_lon: 29.0, min_lat: -1.7, max_lon: 29.5, max_lat: -1.2 };
assert.deepStrictEqual(C.coordonnees(img), [[29, -1.7], [29.5, -1.7], [29.5, -1.2], [29, -1.2]], 'coords dérivés de la bbox');

const imgCoords = { id: 2, url: '/media/imagerie/b.jpg', min_lon: 0, min_lat: 0, max_lon: 1, max_lat: 1,
    coords: [[28.9, -1.6], [29.6, -1.65], [29.7, -1.1], [29.0, -1.05]] };
assert.deepStrictEqual(C.coordonnees(imgCoords), imgCoords.coords, 'coords exacts (WorldFile) prioritaires');

assert.strictEqual(C.coordonnees({ id: 3, url: '/x.jpg' }), null, 'sans géo → null');

// ── Fausse carte ──
const appels = [];
appels._sources = {};
appels._layers = {};
const map = {
    getSource: (id) => appels._sources[id],
    addSource: (id, spec) => { appels.push(['addSource', id]); appels._sources[id] = spec; },
    getLayer: (id) => appels._layers[id],
    addLayer: (spec, avant) => { appels.push(['addLayer', spec.id, avant]); appels._layers[spec.id] = spec; },
    setLayoutProperty: (id, p, v) => appels.push(['setLayoutProperty', id, p, v]),
    removeLayer: (id) => { appels.push(['removeLayer', id]); delete appels._layers[id]; },
    removeSource: (id) => { appels.push(['removeSource', id]); delete appels._sources[id]; },
};

// ── Ajout d'une couche image ──
assert.strictEqual(C.ajouterCouche(map, img), true, 'ajouterCouche → true');
assert.strictEqual(appels._sources['img-1'].type, 'image', 'source type image');
assert.strictEqual(appels._sources['img-1'].url, img.url);
assert.deepStrictEqual(appels._sources['img-1'].coordinates, [[29, -1.7], [29.5, -1.7], [29.5, -1.2], [29, -1.2]]);
const addLayer = appels.filter(a => a[0] === 'addLayer' && a[1] === 'img-1-c')[0];
assert.ok(addLayer, 'couche raster ajoutée');
assert.strictEqual(addLayer[2], 'clusters', 'insérée sous les données');
assert.strictEqual(appels._layers['img-1-c'].layout.visibility, 'visible');

// Image invisible → couche masquée
const imgCachee = { id: 7, url: '/media/imagerie/c.jpg', visible: false, min_lon: 1, min_lat: 1, max_lon: 2, max_lat: 2 };
assert.strictEqual(C.ajouterCouche(map, imgCachee), true);
assert.strictEqual(appels._layers['img-7-c'].layout.visibility, 'none', 'invisible à la création');

// Sans géo → refus
assert.strictEqual(C.ajouterCouche(map, { id: 9, url: '/x.jpg' }), false, 'sans coordonnées → false');

// ── Idempotence ──
const nbAddSource = appels.filter(a => a[0] === 'addSource').length;
const nbAddLayer = appels.filter(a => a[0] === 'addLayer').length;
C.ajouterCouche(map, img);
assert.strictEqual(appels.filter(a => a[0] === 'addSource').length, nbAddSource, 'source non re-ajoutée');
assert.strictEqual(appels.filter(a => a[0] === 'addLayer').length, nbAddLayer, 'couche non re-ajoutée');

// ── Basculer visibilité ──
appels.length = 0;
assert.strictEqual(C.basculer(map, 1, false), true, 'basculer → true');
assert.ok(appels.some(a => a[0] === 'setLayoutProperty' && a[1] === 'img-1-c' && a[3] === 'none'), 'masquée');
assert.strictEqual(C.basculer(map, 999, true), false, 'couche inconnue → false');

// ── Retirer ──
appels.length = 0;
C.retirerCouche(map, 1);
assert.ok(appels.some(a => a[0] === 'removeLayer' && a[1] === 'img-1-c'), 'couche retirée');
assert.ok(appels.some(a => a[0] === 'removeSource' && a[1] === 'img-1'), 'source retirée');
assert.strictEqual(appels._sources['img-1'], undefined);

// ── Chargement via l'API ──
const fetchOriginal = global.fetch;
global.fetch = function (url, opts) {
    return Promise.resolve({
        ok: true,
        json: function () {
            return Promise.resolve({ images: [
                { id: 1, nom: 'Vol A', url: '/media/imagerie/a.jpg', visible: true, min_lon: 29, min_lat: -1.7, max_lon: 29.5, max_lat: -1.2 },
                { id: 2, nom: 'Vol B (masqué)', url: '/media/imagerie/b.jpg', visible: false, min_lon: 29.1, min_lat: -1.6, max_lon: 29.4, max_lat: -1.3 }
            ] });
        }
    });
};
C.charger({ map: map }).then(function (liste) {
    assert.strictEqual(liste.length, 2, '2 images chargées');
    assert.ok(appels._sources['img-1'], 'image visible ajoutée à la carte');
    assert.strictEqual(appels._sources['img-2'], undefined, 'image masquée non ajoutée');
    global.fetch = fetchOriginal;
    console.log('imagerie : OK');
}).catch(function (err) {
    console.error(err);
    process.exit(1);
});
