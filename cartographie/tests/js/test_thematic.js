/* MUKMAP — Tests du moteur pur « Cartographie thématique ».
 * Charge le fichier réel distribué (aucune dépendance au DOM).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'static', 'js', 'thematic.js'), 'utf8');

assert.ok(src.includes('global.ThematicCore'), 'le fichier expose ThematicCore');
eval(src);
const C = globalThis.ThematicCore;
assert.ok(C, 'ThematicCore chargé');

// ── Constantes ────────────────────────────────────────────────────
assert.deepStrictEqual(C.TYPES_POINTS, ['source', 'village', 'borne', 'reservoir', 'repere']);
assert.deepStrictEqual(C.GROUPES_TYPES.source, ['source', 'captage']);
assert.deepStrictEqual(C.GROUPES_TYPES.borne, ['borne', 'consommation']);
assert.deepStrictEqual(C.STATUTS_EXISTANTS, ['actif', 'moyen', 'defectueux', 'hors_service']);
assert.strictEqual(C.STATUT_PROJET, 'projet');
assert.ok(C.CLES_FILTRES.includes('conduite') && C.CLES_FILTRES.includes('pente'));

// ── etatInitial / ouvrageActif ────────────────────────────────────
const ini = C.etatInitial();
assert.strictEqual(ini.filtres.source, false);
assert.strictEqual(ini.styles.source.couleur, '#22d3ee');
assert.strictEqual(ini.styles.conduite.taille, 3);
assert.strictEqual(C.ouvrageActif(ini.filtres), false);
assert.strictEqual(C.ouvrageActif({...ini.filtres, source: true}), true);
assert.strictEqual(C.ouvrageActif({...ini.filtres, relief: true}), false, 'relief seul ≠ ouvrages');
assert.strictEqual(C.ouvrageActif({...ini.filtres, pente: true}), false, 'pente seule ≠ ouvrages');

// ── construireFiltreOuvrages ──────────────────────────────────────
const f = (filtres) => C.construireFiltreOuvrages(filtres);
assert.strictEqual(f(ini.filtres), null, 'aucun filtre → null');
const fSrc = f({...ini.filtres, source: true});
assert.strictEqual(fSrc[0], 'all');
assert.deepStrictEqual(fSrc[1][2][1], ['source', 'captage'], 'source → source+captage');
const fExistant = f({...ini.filtres, existant: true});
assert.strictEqual(fExistant[1][0], 'in');
assert.deepStrictEqual(fExistant[1][2][1], C.STATUTS_EXISTANTS, 'existant → statuts existants');
const fPropose = f({...ini.filtres, propose: true});
assert.strictEqual(fPropose[1][0], '==');
assert.strictEqual(fPropose[1][2], 'projet');
const fTous = f({source: true, village: true, borne: true, reservoir: true, repere: true,
                 existant: false, propose: true});
assert.ok(!fTous.some((p) => Array.isArray(p) && p[0] === 'in' && p[1][1] === 'type'),
    'tous les groupes cochés → aucun filtre de type');
assert.strictEqual(fTous[1][2], 'projet', 'statut proposé conservé');
const fMixte = f({...ini.filtres, borne: true, existant: true});
assert.strictEqual(fMixte[1][0], 'in', 'type combiné');
assert.strictEqual(fMixte[2][0], 'in', 'statut combiné');

// ── Expressions de style ──────────────────────────────────────────
const st = C.etatInitial().styles;
assert.strictEqual(C.expressionCouleur(st)[0], 'match', 'couleur par type par défaut');
const stMod = JSON.parse(JSON.stringify(st));
stMod.source.couleur = '#ff0000';
stMod.source.symbole = 'etoile';
stMod.existant.couleur = '#00ff00';
stMod.existant.taille = 12;
const exprC = C.expressionCouleur(stMod);
assert.strictEqual(exprC[0], 'case', 'branche existant ajoutée');
assert.deepStrictEqual(exprC[1], ['in', ['get', 'statut'], ['literal', C.STATUTS_EXISTANTS]]);
assert.strictEqual(exprC[2], '#00ff00');
const exprT = C.expressionTaille(stMod);
assert.strictEqual(exprT[0], 'case');
assert.strictEqual(exprT[1][0], 'in');
assert.strictEqual(exprT[2], 12, 'taille des existants');
assert.strictEqual(exprT[3][0], 'match', 'repli par type');
assert.strictEqual(exprT[3][3], 9, 'taille par défaut source conservée');
const exprI = C.expressionIcone(stMod);
assert.strictEqual(exprI[3], 'th-source-etoile-ff0000', 'icône étoile → id d\'image');
assert.strictEqual(C.expressionIcone(st)[3], '', 'symbole rond → pas d\'icône');
const exprOp = C.expressionOpacite(st);
assert.strictEqual(exprOp[0], 'match', 'opacité par type par défaut');
const exprTi = C.expressionTailleIcone(st);
assert.strictEqual(exprTi[0], 'match');
assert.ok(exprTi.some((v) => typeof v === 'number' && v > 0), 'tailles d\'icônes numériques');

// ── compter ───────────────────────────────────────────────────────
const ouvrages = [
    {id: 1, type: 'source', statut: 'actif'},
    {id: 2, type: 'captage', statut: 'moyen'},
    {id: 3, type: 'village', statut: 'actif'},
    {id: 4, type: 'borne', statut: 'actif'},
    {id: 5, type: 'consommation', statut: 'projet'},
    {id: 6, type: 'reservoir', statut: 'hors_service'},
    {id: 7, type: 'repere', statut: 'actif'},
    {id: 8, type: 'reseau', statut: 'actif'}
];
const filtresTous = {source: true, village: true, borne: true, reservoir: true, repere: true,
                     existant: true, propose: true};
const cpt = C.compter(ouvrages, filtresTous);
assert.strictEqual(cpt.source, 2, 'source + captage');
assert.strictEqual(cpt.village, 1);
assert.strictEqual(cpt.borne, 2, 'borne + consommation');
assert.strictEqual(cpt.reservoir, 1);
assert.strictEqual(cpt.repere, 1);
assert.strictEqual(cpt.existant, 7, 'actifs×5 + moyen + hors_service = 7');
assert.strictEqual(cpt.propose, 1);
const cptVide = C.compter([], filtresTous);
assert.deepStrictEqual(cptVide, {source: 0, village: 0, borne: 0, reservoir: 0, repere: 0, existant: 0, propose: 0});

// ── haversine / longueurTrace ─────────────────────────────────────
assert.ok(Math.abs(C.haversine({lat: 0, lng: 0}, {lat: 0, lng: 0})) < 1e-9, 'même point → 0');
const dLat = C.haversine({lat: 0, lng: 0}, {lat: 1, lng: 0});
assert.ok(dLat > 110000 && dLat < 113000, '1° de latitude ≈ 111 km (' + dLat + ')');
const traj = [[30.30, 1.40], [30.31, 1.41], [30.32, 1.42]];
assert.ok(C.longueurTrace(traj) > 3000 && C.longueurTrace(traj) < 4000, 'tracé ~3,5 km');
assert.strictEqual(C.longueurTrace([]), 0);
assert.strictEqual(C.longueurTrace([[1, 2]]), 0);
assert.strictEqual(C.longueurTrace({longueur_m: 1200}), 1200, 'longueur_m fournie');
assert.strictEqual(C.longueurTrace({longueur_m: 'abc'}), 0, 'longueur_m invalide → 0');

// ── segmenterPentes ───────────────────────────────────────────────
const pts = [
    {lat: 0, lng: 0}, {lat: 0.001, lng: 0}, {lat: 0.002, lng: 0}, {lat: 0.003, lng: 0}
];
const segs = C.segmenterPentes(pts, [100, 106, 98, 104]);
assert.strictEqual(segs.length, 3, '3 segments');
assert.strictEqual(segs[0].pente, 5.4, 'montée 6 m / 111 m ≈ 5,4 %');
assert.strictEqual(segs[1].pente, -7.2, 'descente 8 m ≈ -7,2 %');
assert.deepStrictEqual(segs[0].coordinates[0], [0, 0]);
assert.deepStrictEqual(segs[0].coordinates[1], [0, 0.001]);
const segsNull = C.segmenterPentes(pts, [100, null, 98, 104]);
assert.strictEqual(segsNull.length, 1, 'segment avec altitude nulle ignoré');
const segsPlat = C.segmenterPentes(pts, [100, 100, 100, 100]);
assert.strictEqual(segsPlat[0].pente, 0, 'plat → 0 %');
assert.strictEqual(C.segmenterPentes([{lat: 0, lng: 0}], [100]).length, 0, '1 point → aucun segment');

// ── construireLegende ─────────────────────────────────────────────
const TRAD_FR = {
    thema_sources: 'Sources', thema_villages: 'Villages', thema_bornes: 'Bornes',
    thema_reservoirs: 'Réservoirs', thema_reperes: 'Repères', thema_conduites: 'Conduites',
    thema_points_gps: 'Points GPS', thema_existants: 'Existants', thema_proposes: 'Proposés',
    thema_aucun: 'Aucun thème actif', thema_chargement_pente: 'Calcul des pentes…',
    thema_pente_erreur: 'Pentes indisponibles', thema_leg_faible: 'Douce', thema_leg_moyenne: 'Moyenne',
    thema_leg_forte: 'Forte'
};
const t = (cle, defaut) => TRAD_FR[cle] || (defaut !== undefined ? defaut : cle);
const etatL = C.etatInitial();
etatL.filtres.conduite = true;
etatL.filtres.source = true;
let leg = C.construireLegende(etatL, {ouvrages, traces: [{id: 1, coordonnees: traj}], nbPoints: 5, longueurConduites: 3500}, {trad: t});
assert.ok(leg.includes('Conduites'), 'légende conduites');
assert.ok(leg.includes('3.5') && leg.includes('km'), 'longueur en km (3,5 km)');
assert.ok(leg.includes('Sources'), 'légende sources');
assert.ok(leg.includes('2'), 'compte des sources');
const legVide = C.construireLegende(C.etatInitial(), {ouvrages: [], traces: [], nbPoints: 0, longueurConduites: 0}, {trad: t});
assert.ok(legVide.includes('Aucun thème actif'), 'aucun thème actif');
const etatPente = C.etatInitial();
etatPente.filtres.pente = true;
const legChargement = C.construireLegende(etatPente, {ouvrages: [], traces: [], nbPoints: 0, longueurConduites: 0},
    {trad: t, penteEtat: {statut: 'chargement'}});
assert.ok(legChargement.includes('Calcul des pentes'), 'chargement pente');
const legErreur = C.construireLegende(etatPente, {ouvrages: [], traces: [], nbPoints: 0, longueurConduites: 0},
    {trad: t, penteEtat: {statut: 'erreur'}});
assert.ok(legErreur.includes('indisponibles'), 'erreur pente');
const legPente = C.construireLegende(etatPente, {ouvrages: [], traces: [], nbPoints: 0, longueurConduites: 0},
    {trad: t, penteEtat: {statut: 'ok'}});
assert.ok(legPente.includes('0 %') && legPente.includes('8 %'), 'gradient 0–8 %');
const legPoints = C.construireLegende(
    {filtres: {...C.etatInitial().filtres, point_gps: true}, styles: C.etatInitial().styles},
    {ouvrages: [], traces: [], nbPoints: 12, longueurConduites: 0}, {trad: t});
assert.ok(legPoints.includes('12'), 'compte points GPS');
const legRelief = C.construireLegende(
    {filtres: {...C.etatInitial().filtres, relief: true}, styles: C.etatInitial().styles},
    {ouvrages: [], traces: [], nbPoints: 0, longueurConduites: 0}, {trad: t});
assert.ok(legRelief.includes('hillshade'), 'légende relief');

console.log('test_thematic : TOUT OK');
