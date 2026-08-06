/* MUKMAP — Tests du gestionnaire de fonds de carte (basemap-selector.js).
 * En Node, `document` est indéfini : le IIFE expose BasemapSelectorCore puis s'arrête.
 * Une fausse carte enregistre les appels MapLibre et les valide.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'static', 'js', 'basemap-selector.js'), 'utf8');

assert.ok(src.includes('globalThis.BasemapSelectorCore'), 'le fichier expose BasemapSelectorCore');
eval(src);
const C = globalThis.BasemapSelectorCore;
assert.ok(C, 'BasemapSelectorCore chargé');

// ── Catalogue ──
const ids = C.idsCatalogue();
assert.strictEqual(ids.length, 67, '67 fonds au catalogue (y compris placeholders données requises)');
['osm', 'hot', 'rue', 'voyager', 'light', 'dark', 'admin', 'natgeo', 'minimal',
 'sat', 'sat_firefly', 's2', 'blue_marble', 'sat_labels', 's2_2018', 'wayback', 'ortho', 'aerienne', 'ms_ndvi',
 'topo', 'esri_topo', 'relief', 'hillshade', 'terrain_eox', 'hypsometrie', 'courbes', 'dem',
 'couverture_sol', 'eaux_surface', 'occupation_sol', 'forets', 'zones_protegees', 'zones_humides', 'hydrographie', 'bassins_versants', 'cours_eau', 'lacs', 'zones_sensibles',
 'ocean', 'physique',
 'geo_unites', 'geo_formations', 'geo_lithologie', 'geo_failles', 'geo_fractures', 'geo_structures', 'geo_contacts', 'geo_pendage', 'geo_direction', 'geo_affleurements', 'geo_mineralisations', 'geo_gisements', 'geo_indices',
 'mine_permis', 'mine_sites', 'mine_indices', 'mine_gisements', 'mine_cu_cobalt', 'mine_substances', 'mine_exploration', 'mine_sondages', 'mine_puits', 'mine_galeries', 'mine_carrieres', 'mine_infrastructures', 'mine_routes', 'mine_exploitation'].forEach(k => {
    assert.ok(ids.includes(k), `fonds ${k} présent`);
});

const osm = C.obtenir('osm');
assert.strictEqual(osm.id, 'osm');
assert.ok(osm.tiles && osm.tiles.includes('{z}/{x}/{y}'), 'tuiles OSM');
assert.ok(osm.attribution.length > 0, 'attribution OSM');
assert.strictEqual(C.obtenir('geo_failles').tiles, null, 'géologie détaillée = tuiles nulles (données requises)');
assert.strictEqual(C.obtenir('inconnu'), null, 'id inconnu → null');
assert.strictEqual(C.categorieDe('sat'), 'imagerie');
assert.strictEqual(C.categorieDe('mine_permis'), 'mines');
assert.strictEqual(C.categorieDe('nimporte'), null);

const s2 = C.obtenir('s2');
assert.ok(s2.tiles.includes('{z}') && s2.tiles.includes('{x}'), 'tuiles Sentinel-2 (WMTS→XYZ)');
assert.ok(s2.attribution.includes('Sentinel-2'), 'attribution Sentinel-2');
assert.strictEqual(C.categorieDe('s2'), 'imagerie', 's2 en imagerie');
const bm = C.obtenir('blue_marble');
assert.ok(bm.tiles.includes('{z}') && bm.tiles.includes('{x}'), 'tuiles Blue Marble (WMTS→XYZ)');
assert.ok(bm.attribution.includes('NASA'), 'attribution NASA');
assert.strictEqual(C.categorieDe('blue_marble'), 'imagerie', 'blue_marble en imagerie');
const catImagerie = C.construireCatalogue().filter(c => c.id === 'imagerie')[0];
assert.strictEqual(catImagerie.basemaps.length, 10, 'imagerie : 10 entrées');

// ── Satellite + labels (hybride) ──
const sl = C.obtenir('sat_labels');
assert.ok(sl.tiles.includes('World_Imagery'), 'fond satellite Esri');
assert.ok(sl.labelsTiles && sl.labelsTiles.includes('Reference/World_Boundaries_and_Places'), 'couche labels Esri');
assert.strictEqual(sl.tiles, C.obtenir('sat').tiles, 'même raster que sat');

// ── Placeholders « données requises » (ortho, aérienne, multispectrale) ──
['ortho', 'aerienne', 'ms_ndvi'].forEach(k => {
    assert.strictEqual(C.obtenir(k).tiles, null, `${k} = tuiles nulles (données requises)`);
    assert.ok(C.obtenir(k).attribution.length > 0, `attribution informative ${k}`);
});

// ── Imagerie historique ──
const h2018 = C.obtenir('s2_2018');
assert.ok(h2018.tiles.includes('s2cloudless-2018'), 'historique Sentinel-2 2018');
const hWay = C.obtenir('wayback');
assert.ok(hWay.tiles.includes('wayback.maptiles.arcgis.com') && hWay.tiles.includes('{z}'), 'Wayback Esri (WMTS→XYZ)');
assert.ok(hWay.attribution.includes('2023'), 'attribution Wayback datée');

// ── Topographie : relief, hillshade, terrain, hypsométrie ──
assert.ok(C.obtenir('relief').tiles.includes('World_Shaded_Relief'), 'relief Esri');
const hs = C.obtenir('hillshade');
assert.ok(hs.tiles.includes('Elevation/World_Hillshade'), 'hillshade pur Esri');
assert.strictEqual(C.categorieDe('hillshade'), 'topographie', 'hillshade en topographie');
const te = C.obtenir('terrain_eox');
assert.ok(te.tiles.includes('terrain-light'), 'terrain EOX (terrain-light)');
const hy = C.obtenir('hypsometrie');
assert.ok(hy.tiles.includes('/terrain_3857/'), 'carte hypsométrique EOX (teintes)');
assert.ok(hy.tiles !== te.tiles, 'hypsométrie distincte du terrain clair');

// ── Courbes de niveau & DEM : placeholders documentés ──
['courbes', 'dem'].forEach(k => {
    assert.strictEqual(C.obtenir(k).tiles, null, `${k} = tuiles nulles (données requises)`);
    assert.ok(C.obtenir(k).attribution.length > 0, `attribution informative ${k}`);
});
const catTopo = C.construireCatalogue().filter(c => c.id === 'topographie')[0];
assert.strictEqual(catTopo.basemaps.length, 8, 'topographie : 8 entrées');

// ── Couches thématiques ──
assert.strictEqual(C.categorieDe('couverture_sol'), 'thematique', 'couverture du sol en thematique');
const wc = C.obtenir('couverture_sol');
assert.ok(wc.tiles.includes('WorldCover') && wc.tiles.includes('{z}') && wc.tiles.includes('{x}') && wc.tiles.includes('{y}'), 'WorldCover WMTS (KVP, placeholders)');
assert.ok(wc.attribution.includes('ESA'), 'attribution WorldCover');
const gsw = C.obtenir('eaux_surface');
assert.ok(gsw.tiles.includes('GSW1_3') && gsw.tiles.includes('{z}'), 'JRC GSW WMTS');
assert.ok(gsw.attribution.includes('JRC'), 'attribution GSW');
['occupation_sol', 'forets', 'zones_protegees', 'zones_humides', 'hydrographie', 'bassins_versants', 'cours_eau', 'lacs', 'zones_sensibles'].forEach(k => {
    assert.strictEqual(C.obtenir(k).tiles, null, `${k} = tuiles nulles (données requises)`);
    assert.ok(C.obtenir(k).attribution.length > 0, `attribution informative ${k}`);
});
const catThem = C.construireCatalogue().filter(c => c.id === 'thematique')[0];
assert.strictEqual(catThem.basemaps.length, 11, 'thematique : 11 entrées');
assert.ok(catThem.cle.startsWith('basemap_cat_'), 'clé i18n thematique');

const cats = C.construireCatalogue();
assert.strictEqual(cats.length, 7, '7 catégories');
const tousIds = cats.reduce((acc, c) => acc.concat(c.basemaps.map(b => b.id)), []);
assert.deepStrictEqual(tousIds.slice().sort(), ids.slice().sort(), 'catalogue = ensemble complet');
cats.forEach(c => {
    assert.ok(c.cle.startsWith('basemap_cat_'), `clé i18n catégorie ${c.id}`);
    c.basemaps.forEach(b => assert.ok(b.attribution.length > 0, `attribution ${b.id}`));
});
const catGeologie = cats.filter(c => c.id === 'geologie')[0];
assert.strictEqual(catGeologie.basemaps.length, 13, 'géologie : 13 entrées');

// ── Géologie : WMS réels (bbox 3857) + placeholders ──
['geo_unites', 'geo_structures', 'geo_gisements', 'geo_indices'].forEach(k => {
    const f = C.obtenir(k);
    assert.ok(f.tiles.includes('{bbox-epsg-3857}'), `${k} : WMS avec placeholder bbox`);
    assert.ok(f.tiles.includes('SRS=EPSG:3857') || f.tiles.includes('CRS=EPSG:3857'), `${k} : projection 3857`);
    assert.ok(f.tiles.includes('image/png'), `${k} : format PNG`);
    assert.ok(f.attribution.length > 0, `attribution informative ${k}`);
});
assert.ok(C.obtenir('geo_unites').tiles.includes('World_CGMW_50M_GeologicalUnitsOnshore'), 'unités géologiques CGMW');
assert.ok(C.obtenir('geo_structures').tiles.includes('World_CGMW_50M_Structural'), 'structures CGMW');
assert.ok(C.obtenir('geo_gisements').tiles.includes('mrdata.usgs.gov'), 'gisements USGS');
assert.ok(C.obtenir('geo_indices').tiles.includes('mrds-low'), 'indices miniers MRDS');
['geo_formations', 'geo_lithologie', 'geo_failles', 'geo_fractures', 'geo_contacts', 'geo_pendage', 'geo_direction', 'geo_affleurements', 'geo_mineralisations'].forEach(k => {
    assert.strictEqual(C.obtenir(k).tiles, null, `${k} = tuiles nulles (données requises)`);
    assert.ok(C.obtenir(k).attribution.length > 0, `attribution informative ${k}`);
});
assert.strictEqual(C.categorieDe('geo_unites'), 'geologie', 'géo en geologie');
assert.strictEqual(C.categorieDe('geo_indices'), 'geologie', 'indices en geologie');

// ── Mines : WMS réels (bbox 3857) + placeholders ──
['mine_sites', 'mine_indices', 'mine_gisements', 'mine_cu_cobalt'].forEach(k => {
    const f = C.obtenir(k);
    assert.ok(f.tiles.includes('{bbox-epsg-3857}'), `${k} : WMS avec placeholder bbox`);
    assert.ok(f.tiles.includes('SRS=EPSG:3857') || f.tiles.includes('CRS=EPSG:3857'), `${k} : projection 3857`);
    assert.ok(f.tiles.includes('image/png'), `${k} : format PNG`);
    assert.ok(f.attribution.length > 0, `attribution informative ${k}`);
});
assert.ok(C.obtenir('mine_sites').tiles.includes('minfac-low'), 'sites miniers (mineral operations USGS)');
assert.ok(C.obtenir('mine_cu_cobalt').tiles.includes('sedcu'), 'dépôts Cu-Co sédimentaires');
['mine_permis', 'mine_substances', 'mine_exploration', 'mine_sondages', 'mine_puits', 'mine_galeries', 'mine_carrieres', 'mine_infrastructures', 'mine_routes', 'mine_exploitation'].forEach(k => {
    assert.strictEqual(C.obtenir(k).tiles, null, `${k} = tuiles nulles (données requises)`);
    assert.ok(C.obtenir(k).attribution.length > 0, `attribution informative ${k}`);
});
const catMines = C.construireCatalogue().filter(c => c.id === 'mines')[0];
assert.strictEqual(catMines.basemaps.length, 14, 'mines : 14 entrées');

// ── Planification ──
let p = C.planifierChangement('inconnu', ['osm']);
assert.ok(p.erreur, 'cible inconnue → erreur');
p = C.planifierChangement('sat', ['osm', 'sat']);
assert.deepStrictEqual(p, { afficher: 'sat', masquer: ['osm'], creer: [] }, 'bascule entre fonds déjà chargés');
p = C.planifierChangement('topo', ['osm']);
assert.deepStrictEqual(p, { afficher: 'topo', masquer: ['osm'], creer: ['topo'] }, 'nouveau fond à créer');
p = C.planifierChangement('osm', []);
assert.deepStrictEqual(p, { afficher: 'osm', masquer: [], creer: ['osm'] }, 'premier fond');
p = C.planifierChangement(null, []);
assert.ok(p.erreur, 'sans cible → erreur');

// ── Fausse carte : enregistre chaque appel ──
const appels = [];
appels._sources = {};
appels._layers = {};
function fabriquerCarte() {
    return {
        getSource: (id) => appels._sources[id],
        addSource: (id, spec) => { appels.push(['addSource', id, spec.type, spec.tiles[0]]); appels._sources[id] = spec; },
        getLayer: (id) => appels._layers[id],
        addLayer: (spec, avant) => { appels.push(['addLayer', spec.id, avant]); appels._layers[spec.id] = spec; },
        setLayoutProperty: (id, prop, val) => appels.push(['setLayoutProperty', id, prop, val]),
    };
}

// ── Appliquer un nouveau fond ──
const map1 = fabriquerCarte();
const ok = C.appliquer(map1, 'sat');
assert.strictEqual(ok, true, 'appliquer(sat) → true');
assert.strictEqual(appels._sources['bm-sat'].type, 'raster', 'source raster ajoutée');
assert.strictEqual(appels._sources['bm-sat'].tiles[0], C.obtenir('sat').tiles, 'tuiles Esri imagerie');
assert.strictEqual(appels._sources['bm-sat'].attribution, C.obtenir('sat').attribution);
const addLayerSat = appels.filter(a => a[0] === 'addLayer' && a[1] === 'bm-sat')[0];
assert.ok(addLayerSat, 'couche bm-sat ajoutée');
assert.strictEqual(addLayerSat[2], 'clusters', 'insérée sous la première couche de données');
assert.strictEqual(appels._layers['bm-sat'].layout.visibility, 'none', 'visible après création');
assert.ok(appels.some(a => a[0] === 'setLayoutProperty' && a[1] === 'bm-sat' && a[3] === 'visible'), 'bm-sat affiché');

// ── Bascule vers un fond déjà chargé ──
appels.length = 0;
C.appliquer(map1, 'osm');
assert.ok(appels.some(a => a[0] === 'setLayoutProperty' && a[1] === 'bm-sat' && a[3] === 'none'), 'sat masqué');
assert.ok(appels.some(a => a[0] === 'setLayoutProperty' && a[1] === 'bm-osm' && a[3] === 'visible'), 'osm affiché');

// ── idempotence : pas de doublon source/couche ──
const nbAddSource = appels.filter(a => a[0] === 'addSource').length;
const nbAddLayer = appels.filter(a => a[0] === 'addLayer').length;
C.appliquer(map1, 'osm');
assert.strictEqual(appels.filter(a => a[0] === 'addSource').length, nbAddSource, 'source non re-ajoutée');
assert.strictEqual(appels.filter(a => a[0] === 'addLayer').length, nbAddLayer, 'couche non re-ajoutée');

// ── idsExistants ──
assert.deepStrictEqual(C.idsExistants(map1), ['osm', 'sat'], 'sources existantes détectées (ordre catalogue)');

// ── Fond hybride : satellite + labels (2 sources, 2 couches) ──
appels.length = 0;
const mapHyb = fabriquerCarte();
assert.strictEqual(C.appliquer(mapHyb, 'sat_labels'), true, 'appliquer(sat_labels) → true');
assert.ok(appels._sources['bm-sat_labels'], 'source raster satellite');
assert.ok(appels._sources['bm-sat_labels-labels'], 'source labels créée');
assert.strictEqual(appels._sources['bm-sat_labels-labels'].tiles[0], sl.labelsTiles, 'tuiles labels transmises');
const layerLabels = appels.filter(a => a[0] === 'addLayer' && a[1] === 'bm-sat_labels-labels')[0];
assert.ok(layerLabels, 'couche labels ajoutée');
assert.strictEqual(layerLabels[2], 'clusters', 'labels insérés sous les données');
assert.ok(appels.some(a => a[0] === 'setLayoutProperty' && a[1] === 'bm-sat_labels-labels' && a[3] === 'visible'), 'labels visibles avec le fond');
appels.length = 0;
C.appliquer(mapHyb, 'osm');
assert.ok(appels.some(a => a[0] === 'setLayoutProperty' && a[1] === 'bm-sat_labels' && a[3] === 'none'), 'satellite masqué');
assert.ok(appels.some(a => a[0] === 'setLayoutProperty' && a[1] === 'bm-sat_labels-labels' && a[3] === 'none'), 'labels masqués avec le fond');
assert.ok(appels.some(a => a[0] === 'setLayoutProperty' && a[1] === 'bm-osm' && a[3] === 'visible'), 'osm affiché');

// ── Fonds à tuiles nulles (géologie/mines) : rien à créer, pas d'erreur ──
appels.length = 0;
appels._sources = {};
appels._layers = {};
const map2 = fabriquerCarte();
assert.strictEqual(C.appliquer(map2, 'geo_failles'), true, 'appliquer(placeholder géo) → true');
assert.strictEqual(appels.filter(a => a[0] === 'addSource').length, 0, 'aucune source créée');
assert.strictEqual(C.appliquer(map2, 'inconnu'), false, 'appliquer(inconnu) → false');
assert.strictEqual(C.appliquer(null, 'osm'), false, 'appliquer sans carte → false');

// ── idsExistants ──
assert.deepStrictEqual(C.idsExistants(map2), [], 'aucune source sur carte neuve');

// ── Fond WMS géologique réel : source raster avec URL GetMap bbox ──
appels.length = 0;
appels._sources = {};
appels._layers = {};
const mapGeo = fabriquerCarte();
assert.strictEqual(C.appliquer(mapGeo, 'geo_unites'), true, 'appliquer(geo_unites) → true');
assert.strictEqual(appels._sources['bm-geo_unites'].type, 'raster', 'source raster géologie');
assert.strictEqual(appels._sources['bm-geo_unites'].tiles[0], C.obtenir('geo_unites').tiles, 'URL GetMap transmise avec {bbox-epsg-3857}');
const addGeo = appels.filter(a => a[0] === 'addLayer' && a[1] === 'bm-geo_unites')[0];
assert.strictEqual(addGeo[2], 'clusters', 'couche géologie sous les données');

// ── Fonds personnalisés (externes) ──
const fetchOriginal = global.fetch;
global.fetch = function (url, opts) {
    return Promise.resolve({
        ok: true,
        json: function () {
            return Promise.resolve({ fonds: [
                { id: 'ext-1', pk: 1, nom: 'Géologie Nord-Kivu', type: 'wms', url: 'https://geo.example/wms?service=WMS&layers=geol&bbox={bbox-epsg-3857}', attribution: 'Exemple', categorie: 'geologie', crs: 'EPSG:3857' },
                { id: 'ext-2', pk: 2, nom: 'Tuiles XYZ', type: 'xyz', url: 'https://tiles.example/{z}/{x}/{y}.png', attribution: '', categorie: 'mines', crs: 'EPSG:3857' },
                { id: 'ext-3', pk: 3, nom: 'WMTS', type: 'wmts', url: 'https://wmts.example/1.0.0/layer/default/WebMercatorQuad/{TileMatrix}/{TileCol}/{TileRow}.png', attribution: '', categorie: 'generale', crs: 'EPSG:3857' },
                { id: 'ext-4', pk: 4, nom: 'Hydro MVT', type: 'vector', url: 'https://vect.example/hydro/{z}/{x}/{y}.pbf', layers: 'hydrographie', attribution: '© Vecteur', categorie: 'topographie', crs: 'EPSG:3857' },
                { id: 'ext-5', pk: 5, nom: 'Ortho COG', type: 'geotiff', url: 'https://data.example/ortho2024.tif', attribution: '', categorie: 'imagerie', crs: 'EPSG:3857' },
                { id: 'ext-6', pk: 6, nom: 'Tuiles clé', type: 'xyz', url: 'https://keys.example/{z}/{x}/{y}.png?key={cle_api}', cle_api: 'ABC123', attribution: '', categorie: 'generale', crs: 'EPSG:3857' }
            ] });
        }
    });
};

(async function testExternes() {
    const fetchData = global.fetch;
    let fetchedUrl = null;
    global.fetch = function (url, opts) { fetchedUrl = url; return fetchData(url, opts); };
    const liste = await C.chargerExternes({});
    assert.strictEqual(liste.length, 6, '6 fonds personnalisés chargés');
    assert.strictEqual(fetchedUrl, '/api/fonds-personnalises/', 'appel sur l’API des fonds');

    const g = C.obtenir('ext-1');
    assert.ok(g, 'fond externe obtenu');
    assert.strictEqual(g.tiles.includes('{bbox-epsg-3857}'), true, 'WMS conserve le placeholder bbox');
    assert.strictEqual(g.perso, true, 'marqué personnalisé');

    const w = C.obtenir('ext-3');
    assert.strictEqual(w.tiles.includes('{z}'), true, 'WMTS → {TileMatrix} → {z}');
    assert.strictEqual(w.tiles.includes('{x}'), true, 'WMTS → {TileCol} → {x}');
    assert.strictEqual(w.tiles.includes('{y}'), true, 'WMTS → {TileRow} → {y}');
    assert.strictEqual(w.tiles.includes('{TileMatrix}'), false, 'placeholder WMTS remplacé');

    assert.ok(C.idsCatalogue().includes('ext-1'), 'externe dans idsCatalogue');
    const cats = C.construireCatalogue();
    const catGeol = cats.filter(c => c.id === 'geologie')[0];
    assert.ok(catGeol.basemaps.some(b => b.id === 'ext-1'), 'externe classé en géologie');
    assert.ok(catGeol.basemaps.some(b => b.id === 'geo_unites'), 'fond WMS géologie toujours présent');

    let p = C.planifierChangement('ext-1', []);
    assert.deepStrictEqual(p, { afficher: 'ext-1', masquer: [], creer: ['ext-1'] }, 'premier chargement externe');
    p = C.planifierChangement('ext-999', []);
    assert.ok(p.erreur, 'externe inconnu → erreur');

    appels.length = 0;
    appels._sources = {};
    appels._layers = {};
    const map3 = fabriquerCarte();
    assert.strictEqual(C.appliquer(map3, 'ext-1'), true, 'appliquer(externe) → true');
    assert.strictEqual(appels._sources['bm-ext-1'].type, 'raster', 'source externe créée');
    assert.strictEqual(appels._sources['bm-ext-1'].tiles[0], g.tiles, 'tuiles WMS transmises');
    const addExt = appels.filter(a => a[0] === 'addLayer' && a[1] === 'bm-ext-1')[0];
    assert.strictEqual(addExt[2], 'clusters', 'couche externe sous les données');

    appels.length = 0;
    C.appliquer(map3, 'osm');
    assert.ok(appels.some(a => a[0] === 'setLayoutProperty' && a[1] === 'bm-ext-1' && a[3] === 'none'), 'externe masqué au profit d’OSM');
    assert.ok(appels.some(a => a[0] === 'setLayoutProperty' && a[1] === 'bm-osm' && a[3] === 'visible'), 'OSM affiché');
    assert.strictEqual(C.appliquer(map3, 'ext-999'), false, 'appliquer(inconnu) → false');

    // ── Nouveaux types : MVT, GeoTIFF sans service, clé API injectée ──
    const v = C.obtenir('ext-4');
    assert.strictEqual(v.type, 'vector', 'type vector conservé');
    assert.strictEqual(v.layers, 'hydrographie', 'source-layer conservé');
    appels.length = 0;
    appels._sources = {};
    appels._layers = {};
    const map4 = fabriquerCarte();
    assert.strictEqual(C.appliquer(map4, 'ext-4'), true, 'appliquer(MVT) → true');
    assert.strictEqual(appels._sources['bm-ext-4'].type, 'vector', 'source vector créée');
    assert.strictEqual(appels._layers['bm-ext-4'].type, 'fill', 'couche fill pour le MVT');
    assert.strictEqual(appels._layers['bm-ext-4']['source-layer'], 'hydrographie', 'source-layer transmis');
    assert.strictEqual(appels._layers['bm-ext-4'].layout.visibility, 'none', 'invisible après création');

    const cog = C.obtenir('ext-5');
    assert.strictEqual(cog.tiles, null, 'GeoTIFF sans service de tuiles → non affichable');
    appels.length = 0;
    appels._sources = {};
    appels._layers = {};
    const map5 = fabriquerCarte();
    assert.strictEqual(C.appliquer(map5, 'ext-5'), true, 'appliquer(GeoTIFF) → true sans erreur');
    assert.strictEqual(appels.filter(a => a[0] === 'addSource').length, 0, 'aucune source créée');

    const cle = C.obtenir('ext-6');
    assert.strictEqual(cle.tiles.includes('key=ABC123'), true, 'clé API injectée dans l’URL');
    assert.strictEqual(cle.tiles.includes('{cle_api}'), false, 'placeholder {cle_api} remplacé');

    global.fetch = fetchOriginal;
    console.log('basemap-selector : OK');
})().catch(function (err) {
    console.error(err);
    process.exit(1);
});
