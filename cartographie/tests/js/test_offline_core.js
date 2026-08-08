/* MUKMAP — Tests du moteur pur du mode hors connexion.
 * Charge le fichier réel distribué ; `demarrer` (DOM) n'est pas exécuté.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'static', 'js', 'offline.js'), 'utf8');

assert.ok(src.includes('global.MukmapOffline'), 'le fichier expose MukmapOffline');
eval(src);
const C = globalThis.MukmapOffline.CORE;
assert.ok(C, 'MukmapOffline.CORE chargé');

// ── uuid ─────────────────────────────────────────────────────
assert.match(C.uuid(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
             'uuid v4');
assert.notStrictEqual(C.uuid(), C.uuid(), 'uuid différentes');

// ── fabriquerOp ───────────────────────────────────────────────
const op = C.fabriquerOp('modifie', {id: 3, nom: 'Bogoro'}, '2025-01-01T00:00:00Z');
assert.strictEqual(op.type, 'modifie');
assert.strictEqual(op.id, 3);
assert.strictEqual(op.base_updated, '2025-01-01T00:00:00Z');
assert.match(op.uuid, /^[0-9a-f]{8}-/, 'op.uuid = clé du store');
assert.match(op.synchro_id, /^[0-9a-f]{8}-/, 'synchro_id généré si absent');

const opCree = C.fabriquerOp('cree', {nom: 'Nouveau'});
assert.strictEqual(opCree.id, null, 'création sans id serveur');
assert.match(opCree.synchro_id, /^[0-9a-f]{8}-/, 'synchro_id généré si absent');

const opRepris = C.fabriquerOp('cree', {synchro_id: 'abc-123'});
assert.strictEqual(opRepris.synchro_id, 'abc-123', 'synchro_id préservé');

// ── envoyer ───────────────────────────────────────────────────
const brut = C.fabriquerOp('modifie', {id: 1, nom: 'X', donnees: {a: 1}, latitude: '1.4'},
                           null);
const apay = C.envoyer(brut);
assert.deepStrictEqual(Object.keys(apay).sort(), ['base_updated', 'id', 'point', 'type']);
assert.deepStrictEqual(apay.point, {nom: 'X', latitude: '1.4', donnees: {a: 1}},
                       'pointPourEnvoi ne garde que les champs utiles');
assert.strictEqual(apay.base_updated, null);

// ── statut ────────────────────────────────────────────────────
let s = C.statut(true, 0, 0, null);
assert.strictEqual(s.libelle, 'Synchronisé');
assert.strictEqual(s.classe, 'sync');

s = C.statut(false, 2, 0, null);
assert.strictEqual(s.classe, 'horsligne');
assert.ok(s.libelle.includes('2 en attente'));

s = C.statut(true, 3, 1, null);
assert.strictEqual(s.classe, 'conflit');

s = C.statut(true, 5, 0, null);
assert.strictEqual(s.classe, 'attente');
assert.ok(s.libelle.includes('5 en attente'));

s = C.statut(false, 0, 0, 'HTTP 500');
assert.strictEqual(s.classe, 'erreur', 'erreur prioritaire même hors ligne');

// ── fusionnerPulls ────────────────────────────────────────────
const locaux = [
    {id: 1, nom: 'A', updated_at: '2025-01-01T00:00:00Z'},
    {id: 2, nom: 'B', updated_at: '2025-01-02T00:00:00Z'},
    {id: 3, nom: 'C', updated_at: '2025-01-03T00:00:00Z'},
];
const pulls = [
    {type: 'modifie', point: {id: 1, nom: 'A-mod', updated_at: '2025-02-01T00:00:00Z'}},
    {type: 'supprime', point: {id: 2}},
    {type: 'cree', point: {id: 9, nom: 'Nouveau', updated_at: '2025-02-02T00:00:00Z'}},
];
const fusion = C.fusionnerPulls(locaux, pulls);
assert.strictEqual(fusion.length, 3, '2 suppressions + 1 ajout');
assert.strictEqual(fusion.find(p => p.id === 1).nom, 'A-mod', 'modifié remplacé');
assert.strictEqual(fusion.find(p => p.id === 2), undefined, 'point supprimé enlevé');
assert.strictEqual(fusion.find(p => p.id === 9).nom, 'Nouveau', 'créé ajouté');

// ── normaliserBbox ────────────────────────────────────────────
assert.deepStrictEqual(C.normaliserBbox([30, -2, 31, -1]), [30, -2, 31, -1]);
assert.deepStrictEqual(C.normaliserBbox([-200, -95, 200, 95]), [-180, -85, 180, 85], 'bornée');
assert.strictEqual(C.normaliserBbox([30, -2, 'x', -1]), null, 'NaN → null');
assert.strictEqual(C.normaliserBbox([3, 4]), null, 'trop court → null');
assert.strictEqual(C.normaliserBbox(null), null);

// ── pagesPourZone ─────────────────────────────────────────────
assert.strictEqual(C.pagesPourZone(0, 200), 1);
assert.strictEqual(C.pagesPourZone(1, 200), 1);
assert.strictEqual(C.pagesPourZone(200, 200), 1);
assert.strictEqual(C.pagesPourZone(201, 200), 2);
assert.strictEqual(C.pagesPourZone(999, 200), 5);

// ── pointPourEnvoi ────────────────────────────────────────────
const env = C.pointPourEnvoi({
    id: 5, nom: 'Goma', latitude: '-1.6', longitude: '29.2', categorie: 'village',
    statut: 'actif', province: 'Nord Kivu', donnees: {Categorie: 'CS'},
    source_fichier: 'x.csv', source_format: 'CSV', updated_at: '...', synchro_id: 'sid-1',
});
assert.deepStrictEqual(Object.keys(env).sort(),
    ['categorie', 'donnees', 'latitude', 'longitude', 'nom', 'province',
     'source_fichier', 'source_format', 'statut', 'synchro_id'].sort(),
    'champs retenus');
assert.strictEqual(env.id, undefined, 'id jamais envoyé');

// ── enConflit ─────────────────────────────────────────────────
const base = '2025-01-01T00:00:00Z';
assert.strictEqual(C.enConflit({type: 'modifie', base_updated: base},
                               {point: {updated_at: '2025-02-01T00:00:00Z'}}), true);
assert.strictEqual(C.enConflit({type: 'modifie', base_updated: base},
                               {point: {updated_at: '2025-01-01T00:00:00Z'}}), false,
                   'non modifié → pas de conflit');
assert.strictEqual(C.enConflit({type: 'modifie', base_updated: base},
                               {type: 'supprime', point: {id: 3}}), true, 'pul supprime fait conflit');
assert.strictEqual(C.enConflit({type: 'supprime'},
                               {type: 'supprime', point: {}}), false, 'suppression identique ok');
assert.strictEqual(C.enConflit(null, {type: 'supprime'}), false);

// ── resoudreConflit ───────────────────────────────────────────
const conflit = {id: 7, type: 'modifie', version_serveur: {nom: 'S', updated_at: '2025-03-01T00:00:00Z'}};

// Choix serveur → aucune nouvelle opération
assert.strictEqual(C.resoudreConflit(conflit, 'serveur', {nom: 'L'}), null);

// Choix local → opération `modifie` avec base_updated = version serveur
const choixLocal = C.resoudreConflit(conflit, 'local', {id: 7, nom: 'L'});
assert.strictEqual(choixLocal.type, 'modifie');
assert.strictEqual(choixLocal.id, 7);
assert.strictEqual(choixLocal.base_updated, '2025-03-01T00:00:00Z', 'base_updated = version serveur');

// Conflit suppression : version locale inconnue → garde la suppression
const confSup = C.resoudreConflit({id: 3, type: 'supprime', version_serveur: {updated_at: '2025-04-01T00:00:00Z'}}, 'local');
assert.strictEqual(confSup.type, 'supprime');
assert.strictEqual(confSup.base_updated, '2025-04-01T00:00:00Z');

// ── tuilesPourBbox ─────────────────────────────────────────
// z0 : le monde entier tient en une tuile
assert.deepStrictEqual(C.tuilesPourBbox([-180, -85, 180, 85], 0, 0),
    [{z: 0, x: 0, y: 0}], 'monde → 1 tuile à z0');

// bbox Bogoro [30, 1.4, 31, 1.5] à z1 : hémisphère est/nord ?
// lon 30-31 → x = floor((30+180)/360*2)=1 ; lat 1.4-1.5 → y=0
assert.deepStrictEqual(C.tuilesPourBbox([30, 1.4, 31, 1.5], 1, 1),
    [{z: 1, x: 1, y: 0}], 'Bogoro → tuile (z1,x1,y0)');

// z2 : x = floor(210/360*4)=2 ; lat 1.4°N → ligne y=1 (0°–40,98°N)
assert.deepStrictEqual(C.tuilesPourBbox([30, 1.4, 31, 1.5], 2, 2),
    [{z: 2, x: 2, y: 1}], 'Bogoro → tuile (z2,x2,y1)');

// bbox traversant le méridien -180/180 → bornée par normaliserBbox
const monde = C.normaliserBbox([-200, -95, 200, 95]);
assert.strictEqual(C.tuilesPourBbox(monde, 1, 1).length, 4, 'monde z1 → 4 tuiles');

// bbox invalide → []
assert.deepStrictEqual(C.tuilesPourBbox(null, 0, 2), [], 'bbox null → []');
assert.deepStrictEqual(C.tuilesPourBbox([1, 2], 0, 2), [], 'bbox trop courte → []');

// zMin > zMax → zooms bornés (zMax est resserré sur zMin, jamais vide)
const zinv = C.tuilesPourBbox([30, 1.4, 31, 1.5], 5, 2);
assert.strictEqual(zinv.length, 1, 'zMin > zMax → zoom ramené à zMin');
assert.strictEqual(zinv[0].z, 5, 'zoom ramené à zMin');

// maxTuiles : le volume de z10 est élagué (une bbox mondiale)
const zMaxCap = C.tuilesPourBbox(monde, 0, 10, 64);
assert.ok(zMaxCap.length <= 64, 'maxTuiles respecté');
assert.deepStrictEqual(C.tuilesPourBbox(monde, 0, 0, 10), [{z: 0, x: 0, y: 0}],
                       'une seule tuile sous le plafond');

// ── urlTuile ────────────────────────────────────────────────
assert.strictEqual(C.urlTuile('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {z: 5, x: 2, y: 3}),
    'https://tile.openstreetmap.org/5/2/3.png', 'template XYZ');
assert.strictEqual(C.urlTuile('https://server.arcgisonline.com/ArcGIS/rest/services/S/MapServer/tile/{z}/{y}/{x}', {z: 5, x: 2, y: 3}),
    'https://server.arcgisonline.com/ArcGIS/rest/services/S/MapServer/tile/5/3/2', 'template ArcGIS {y}/{x}');
assert.strictEqual(C.urlTuile('https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {z: 2, x: 1, y: 0}),
    'https://basemaps.cartocdn.com/dark_all/2/1/0.png', '{r} supprimé');
assert.strictEqual(C.urlTuile('https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png', {z: 3, x: 1, y: 1}),
    'https://a.tile.opentopomap.org/3/1/1.png', '{a-c} → a');

// ── fabriquerOpTrace / envoyerTrace ─────────────────────────
const opT = C.fabriquerOpTrace('cree', {nom: 'Conduite', coordonnees: [[30, 1], [30.1, 1.1]], projet_id: 4}, null);
assert.strictEqual(opT.type, 'cree');
assert.match(opT.uuid, /^[0-9a-f]{8}-/, 'uuid tracé');
assert.match(opT.synchro_id, /^[0-9a-f]{8}-/, 'synchro_id tracé généré');
const opTEnv = C.envoyerTrace(opT);
assert.deepStrictEqual(Object.keys(opTEnv).sort(), ['base_updated', 'id', 'trace', 'type']);
assert.deepStrictEqual(opTEnv.trace, {
    nom: 'Conduite', coordonnees: [[30, 1], [30.1, 1.1]], projet_id: 4, synchro_id: opT.synchro_id
}, 'tracePourEnvoi garde les champs utiles + synchro_id');

const opTMod = C.fabriquerOpTrace('modifie', {id: 9, nom: 'R', coordonnees: [[1, 1], [2, 2]]}, '2025-05-01T00:00:00Z');
assert.strictEqual(opTMod.id, 9);
assert.strictEqual(opTMod.base_updated, '2025-05-01T00:00:00Z');
const envMod = C.envoyerTrace(opTMod);
assert.strictEqual(envMod.id, 9, 'id transporté au niveau de l\'opération');
assert.deepStrictEqual(envMod.trace, {nom: 'R', coordonnees: [[1, 1], [2, 2]], synchro_id: opTMod.synchro_id},
                       'le tracé lui-même n\'inclut pas l\'id (comme les points)');

console.log('test_offline_core : ' + (process.env.RUN_ONE ? 'OK' : 'TOUT OK'));