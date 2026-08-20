/* MUKMAP — Tests du module pur « Gestionnaire des couches et des sources »
 * (cartographie/static/js/gestionnaire-sources.js).
 * Vérifie l'arbre Sources → Fichiers → Couches → Catégories, le filtrage
 * combiné (jamais destructif) et la recherche.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'static', 'js', 'gestionnaire-sources.js'), 'utf8');
assert.ok(src.includes('global.GS'), 'le fichier expose GS');
eval(src);
const GS = globalThis.GS;
assert.ok(GS, 'GS chargé');

// ── Fixture : deux sources, deux fichiers, catégories ─────────
const couches = [
    {
        id: 1, nom: 'Puits', type: 'point', couleur: '#3388ff', nb_geometries: 5,
        fichier: 'puits.geojson',
        source_obj: {id: 11, identifiant: 'Source 001', nom: "Points d'eau", couleur: '#3388ff', symbole: ''},
        categories: [{nom: 'fonctionnel', nb: 3}, {nom: 'panne', nb: 2}]
    },
    {
        id: 2, nom: 'Forages', type: 'point', couleur: '#22c55e', nb_geometries: 3,
        fichier: 'puits.geojson',
        source_obj: {id: 11, identifiant: 'Source 001', nom: "Points d'eau", couleur: '#3388ff', symbole: ''},
        categories: [{nom: 'fonctionnel', nb: 3}]
    },
    {
        id: 3, nom: 'Routes', type: 'ligne', couleur: '#f59e0b', nb_geometries: 7,
        fichier: 'routes.geojson',
        source_obj: {id: 12, identifiant: 'Source 002', nom: 'Voirie', couleur: '#22c55e', symbole: ''},
        categories: []
    },
    {
        id: 4, nom: 'Vieux plans', type: 'polygone', couleur: '#888', nb_geometries: 2,
        fichier: 'legacy.geojson', source_obj: null, categories: []
    }
];

// ── construireArbre ───────────────────────────────────────────
const arbre = GS.construireArbre(couches);
assert.strictEqual(arbre.sources.length, 2, '2 sources');
assert.strictEqual(arbre.sansSource.length, 1, '1 groupe sans source');
assert.strictEqual(arbre.sources[0].identifiant, 'Source 001');
assert.strictEqual(arbre.sources[0].fichiers.length, 1, 'puits.geojson regroupe 2 couches');
assert.strictEqual(arbre.sources[0].fichiers[0].couches.length, 2, 'fichier regroupe les couches');
assert.strictEqual(arbre.sources[1].fichiers[0].couches[0].nom, 'Routes');
assert.strictEqual(arbre.sansSource[0].fichier, 'legacy.geojson');
assert.strictEqual(arbre.sansSource[0].couches[0].nb, 2, 'nb = nb_geometries');

// ── compter ───────────────────────────────────────────────────
const tot = GS.compter(arbre);
assert.deepStrictEqual(tot, {sources: 2, fichiers: 3, couches: 4, categories: 3, entites: 17});

// ── filtrage combiné, jamais destructif ───────────────────────
const etat = {couches: new Map(), sources: new Map(), fichiers: new Map(), categories: new Map()};
assert.deepStrictEqual(GS.filtrePourCouche(couches[0], etat),
                       {visible: true, filtreCats: null, raison: 'visible'});

etat.couches.set(3, false);
assert.strictEqual(GS.filtrePourCouche(couches[2], etat).visible, false, 'couche masquée');

etat.sources.set(11, false);
assert.strictEqual(GS.filtrePourCouche(couches[0], etat).visible, false, 'source masquée');
assert.strictEqual(GS.filtrePourCouche(couches[0], etat).raison, 'source');
etat.sources.delete(11);

etat.fichiers.set('puits.geojson', false);
assert.strictEqual(GS.filtrePourCouche(couches[0], etat).visible, false, 'fichier masqué');
assert.strictEqual(GS.filtrePourCouche(couches[3], etat).visible, true, 'autre fichier intact');
etat.fichiers.delete('puits.geojson');

// Catégories : partiel → setFilter ; toutes masquées → couche masquée
etat.categories.set(GS.cleCategorie(1, 'panne'), false);
const partiel = GS.filtrePourCouche(couches[0], etat);
assert.strictEqual(partiel.visible, true);
assert.deepStrictEqual(partiel.filtreCats, ['in', ['get', 'categorie'], ['fonctionnel']]);
assert.strictEqual(partiel.raison, 'categories-partiel');

etat.categories.set(GS.cleCategorie(1, 'fonctionnel'), false);
const vide = GS.filtrePourCouche(couches[0], etat);
assert.strictEqual(vide.visible, false);
assert.strictEqual(vide.raison, 'categories');

// Couche sans catégories : jamais filtrée par catégorie
assert.deepStrictEqual(GS.filtrePourCouche(couches[2], etat).filtreCats, null);

// ── cleCategorie unique par (couche, catégorie) ───────────────
assert.notStrictEqual(GS.cleCategorie(1, 'a'), GS.cleCategorie(2, 'a'));
assert.strictEqual(GS.cleCategorie(1, 'a'), GS.cleCategorie(1, 'a'));

// ── recherche ─────────────────────────────────────────────────
let trouv = GS.filtrerRecherche(arbre, 'route');
assert.strictEqual(trouv.sources.length, 1, 'recherche couche');
assert.strictEqual(trouv.sources[0].identifiant, 'Source 002');

trouv = GS.filtrerRecherche(arbre, 'panne');
assert.strictEqual(trouv.sources.length, 1, 'recherche catégorie');
assert.strictEqual(trouv.sources[0].fichiers[0].couches.length, 1);
assert.strictEqual(trouv.sources[0].fichiers[0].couches[0].nom, 'Puits');

trouv = GS.filtrerRecherche(arbre, 'source 001');
assert.strictEqual(trouv.sources.length, 1, 'recherche identifiant');
assert.strictEqual(trouv.sources[0].fichiers[0].couches.length, 2, 'source garde ses fichiers');

trouv = GS.filtrerRecherche(arbre, 'legacy');
assert.strictEqual(trouv.sources.length, 0);
assert.strictEqual(trouv.sansSource.length, 1, 'recherche groupe sans source');

trouv = GS.filtrerRecherche(arbre, '');
assert.strictEqual(trouv.sources.length, 2, 'terme vide → arbre entier');

// ── sans source : sourceVisible vrai par défaut ───────────────
assert.strictEqual(GS.sourceVisible(couches[3], etat), true);
assert.strictEqual(GS.fichierVisible(couches[3], etat), true);

console.log('test_gestionnaire_sources.js : OK (' + couches.length + ' couches, filtrage combiné, recherche)');