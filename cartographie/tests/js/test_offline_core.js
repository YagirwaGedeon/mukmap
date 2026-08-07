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

console.log('test_offline_core : ' + (process.env.RUN_ONE ? 'OK' : 'TOUT OK'));