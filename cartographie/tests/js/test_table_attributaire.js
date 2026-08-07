/* MUKMAP — Tests du moteur pur de la table attributaire.
 * Charge le fichier réel comme distribué ; en Node, `window` est absent,
 * le IIFE expose TableAttributaire.CORE (aucune dépendance au DOM).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'static', 'js', 'table-attributaire.js'), 'utf8');

assert.ok(src.includes('global.TableAttributaire'), 'le fichier expose TableAttributaire');
eval(src);
const C = globalThis.TableAttributaire.CORE;
assert.ok(C, 'TableAttributaire.CORE chargé');

// ── Données de test ────────────────────────────────────────────
const LIGNES = [
    { id: 1, nom: 'Bogoro', categorie: 'village', statut: 'actif', province: 'Ituri',
      date_creation: '2025-03-10T08:00:00Z', latitude: '1.4097', longitude: '30.28',
      donnees: { Population: '2500', Ecole: 'Oui' } },
    { id: 2, nom: 'Goma Centre', categorie: 'village', statut: 'actif', province: 'Nord Kivu',
      date_creation: '2025-05-01T08:00:00Z', latitude: '-1.6785', longitude: '29.233',
      donnees: { Population: '1200', Ecole: 'Non' } },
    { id: 3, nom: 'Hopital Bethesda', categorie: 'hopital', statut: 'en_cours', province: 'Nord Kivu',
      date_creation: '2025-01-22T08:00:00Z', latitude: '-1.62', longitude: '29.19',
      donnees: { Population: '0', Ecole: 'Oui' } },
];

// ── extraireValeur ─────────────────────────────────────────────
assert.strictEqual(C.extraireValeur(LIGNES[0], 'nom'), 'Bogoro');
assert.strictEqual(C.extraireValeur(LIGNES[0], 'd:Population'), '2500', 'clé JSON accessible');
assert.strictEqual(C.extraireValeur(LIGNES[0], 'd:absente'), '', 'clé JSON absente → vide');
assert.strictEqual(C.extraireValeur(LIGNES[2], 'd:Population'), '0', 'zéro conservé');

// ── typeValeur ─────────────────────────────────────────────────
assert.strictEqual(C.typeValeur(''), 'text');
assert.strictEqual(C.typeValeur('2500'), 'nb');
assert.strictEqual(C.typeValeur('2025-03-10T08:00:00Z'), 'date');
assert.strictEqual(C.typeValeur('Bogoro'), 'text');

// ── appliquerFiltre ────────────────────────────────────────────
assert.strictEqual(C.appliquerFiltre(LIGNES[0], { champ: 'nom', op: 'eq', valeur: 'Bogoro' }), true);
assert.strictEqual(C.appliquerFiltre(LIGNES[0], { champ: 'nom', op: 'eq', valeur: 'bogoro' }), true, 'eq insensible à la casse');
assert.strictEqual(C.appliquerFiltre(LIGNES[0], { champ: 'nom', op: 'ne', valeur: 'Bogoro' }), false);
assert.strictEqual(C.appliquerFiltre(LIGNES[0], { champ: 'nom', op: 'contient', valeur: 'gor' }), true);
assert.strictEqual(C.appliquerFiltre(LIGNES[0], { champ: 'nom', op: 'commence', valeur: 'Bo' }), true);
assert.strictEqual(C.appliquerFiltre(LIGNES[0], { champ: 'nom', op: 'finit', valeur: 'oro' }), true);
assert.strictEqual(C.appliquerFiltre(LIGNES[0], { champ: 'categorie', op: 'dans', valeur: ['hopital', 'village'] }), true);
assert.strictEqual(C.appliquerFiltre(LIGNES[0], { champ: 'categorie', op: 'vide', valeur: '' }), false);
assert.strictEqual(C.appliquerFiltre(LIGNES[0], { champ: 'categorie', op: 'non_vide', valeur: '' }), true);
assert.strictEqual(C.appliquerFiltre(LIGNES[0], { champ: 'd:Population', op: 'sup', valeur: '1000' }), true);
assert.strictEqual(C.appliquerFiltre(LIGNES[0], { champ: 'd:Population', op: 'entre', valeur: ['1000', '3000'] }), true);
assert.strictEqual(C.appliquerFiltre(LIGNES[0], { champ: 'd:Population', op: 'inf', valeur: '1000' }), false);
assert.strictEqual(C.appliquerFiltre(LIGNES[0], { champ: 'date_creation', op: 'sup', valeur: '2025-01-01' }), true);
assert.strictEqual(C.appliquerFiltre(LIGNES[2], { champ: 'date_creation', op: 'inf', valeur: '2025-02-01' }), true);

// ── filtrer : logique ET / OU ──────────────────────────────────
const et = C.filtrer(LIGNES, [
    { champ: 'province', op: 'eq', valeur: 'Nord Kivu' },
    { champ: 'statut', op: 'eq', valeur: 'actif' },
], 'et');
assert.deepStrictEqual(et.map(l => l.id), [2], 'ET : Nord Kivu + actif → Goma Centre seul');

const ou = C.filtrer(LIGNES, [
    { champ: 'province', op: 'eq', valeur: 'Ituri' },
    { champ: 'categorie', op: 'eq', valeur: 'hopital' },
], 'ou');
assert.deepStrictEqual(ou.map(l => l.id).sort((a, b) => a - b), [1, 3], 'OU : Ituri ou hôpital → Bogoro + Bethesda');

// ── trier ──────────────────────────────────────────────────────
assert.deepStrictEqual(C.trier(LIGNES, 'nom', 'asc').map(l => l.nom),
    ['Bogoro', 'Goma Centre', 'Hopital Bethesda']);
assert.deepStrictEqual(C.trier(LIGNES, 'date_creation', 'desc').map(l => l.id),
    [2, 1, 3], 'tri date descendant');
assert.deepStrictEqual(C.trier(LIGNES, 'd:Population', 'desc').map(l => l.id),
    [1, 2, 3], 'tri numérique JSON');
assert.deepStrictEqual(C.trier(LIGNES, 'nom', 'asc').map(l => l.id),
    [1, 2, 3], 'tri stable');

// ── paginer ────────────────────────────────────────────────────
const p1 = C.paginer(LIGNES, 1, 2);
assert.strictEqual(p1.total, 3);
assert.strictEqual(p1.pages, 2);
assert.deepStrictEqual(p1.lignes.map(l => l.id), [1, 2]);
const p2 = C.paginer(LIGNES, 2, 2);
assert.deepStrictEqual(p2.lignes.map(l => l.id), [3]);
assert.strictEqual(p2.page, 2);
assert.strictEqual(C.paginer(LIGNES, 99, 2).page, 2, 'page hors bornes ramenée à la dernière');

// ── stats ──────────────────────────────────────────────────────
const st = C.stats(LIGNES, [{ champ: 'd:Population', type: 'json' }]);
assert.strictEqual(st.total, 3);
assert.deepStrictEqual(st.parCategorie, { village: 2, hopital: 1 });
assert.deepStrictEqual(st.parStatut, { actif: 2, 'en_cours': 1 });
assert.strictEqual(st.parProvince['Nord Kivu'], 2);
assert.strictEqual(st.numeriques['d:Population'].min, 0);
assert.strictEqual(st.numeriques['d:Population'].max, 2500);
assert.strictEqual(st.numeriques['d:Population'].somme, 3700);
assert.strictEqual(st.numeriques['d:Population'].count, 3);
assert.strictEqual(st.dateMin, '2025-01-22');
assert.strictEqual(st.dateMax, '2025-05-01');

// ── versCSV ────────────────────────────────────────────────────
const csv = C.versCSV(LIGNES, [{ champ: 'nom', libelle: 'Nom' }, { champ: 'd:Population', libelle: 'Population' }]);
const lignes = csv.split('\r\n');
assert.strictEqual(lignes[0], 'Nom;Population');
assert.strictEqual(lignes[1], 'Bogoro;2500');
assert.strictEqual(lignes.length, 4);

// ── assemblerParams ────────────────────────────────────────────
const params = C.assemblerParams({
    q: 'Goma', page: 2, pageSize: 100,
    tri: { champ: 'nom', direction: 'asc' },
    filtres: [{ champ: 'province', op: 'eq', valeur: 'Ituri' }],
    logique: 'ou'
}, { apercu: '1' });
assert.strictEqual(params.q, 'Goma');
assert.strictEqual(params.page, 2);
assert.strictEqual(params.page_size, 100);
assert.strictEqual(params.tri, 'nom');
assert.strictEqual(params.direction, 'asc');
assert.strictEqual(params.apercu, '1');
const f = JSON.parse(params.filtres);
assert.strictEqual(f.logique, 'ou');
assert.strictEqual(f.filtres[0].champ, 'province');

console.log('table-attributaire : OK');
