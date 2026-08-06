/* MUKMAP — Tests du cœur d'export carte (fichier réel chargé, comme distribué).
 * En Node, `document` est indéfini : le IIFE expose ExportCarteCore puis s'arrête.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'static', 'js', 'export-carte.js'), 'utf8');

assert.ok(src.includes('globalThis.ExportCarteCore'), 'le fichier expose ExportCarteCore');

// En Node, `document` n'existe pas : le code navigateur ne s'exécute pas.
eval(src);
const C = globalThis.ExportCarteCore;
assert.ok(C, 'ExportCarteCore chargé');

// ── formatPixels : A4 paysage 300 DPI ──
let px = C.formatPixels('A4', 'L', 300);
assert.strictEqual(px.largeur, 3508, 'A4 L 300dpi largeur = 3508');
assert.strictEqual(px.hauteur, 2480, 'A4 L 300dpi hauteur = 2480');
assert.strictEqual(px.facteur, 1, 'pas de réduction sous 12000 px');

// Portrait : dimensions inversées
px = C.formatPixels('A4', 'P', 300);
assert.strictEqual(px.largeur, 2480);
assert.strictEqual(px.hauteur, 3508);

// A0 portrait 600 dpi : côté le plus long plafonné à 12000 px
px = C.formatPixels('A0', 'P', 600);
assert.strictEqual(px.hauteur, 12000, 'plafond MAX_COTE_CAPTURE = 12000');
assert.ok(px.facteur < 1, 'facteur de réduction appliqué');
assert.ok(Math.abs(px.largeur / px.hauteur - 841 / 1189) < 0.002, 'proportions conservées (arrondi px)');

// Format inconnu → A4 par défaut
px = C.formatPixels('A5', 'L', 150);
assert.strictEqual(px.largeur, Math.round((297 / 25.4) * 150));

// ── calculerEchelleBarre : valeurs rondes 1/2/5 × 10^n ──
let b = C.calculerEchelleBarre(10, 200); // 10 m/px
assert.strictEqual(b.valeur, 1000);
assert.strictEqual(b.texte, '1 km');
assert.ok(b.px <= 200 && b.px > 0, 'barre dans la limite');

b = C.calculerEchelleBarre(0.3, 200); // 0.3 m/px
assert.strictEqual(b.valeur, 20);
assert.strictEqual(b.texte, '20 m');

b = C.calculerEchelleBarre(50, 200);
assert.ok([5000, 10000].includes(b.valeur), '50 m/px → 5 ou 10 km');

// ── distanceLongitude : ~111 km par degré à l'équateur ──
const d = C.distanceLongitude(29, 30, 0);
assert.ok(d > 111000 && d < 111320, '1° à l\'équateur ≈ 111,32 km, reçu ' + d);
const dLat = C.distanceLongitude(29, 30, 60); // à 60° → moitié
assert.ok(dLat < d * 0.55, 'distance réduite avec la latitude');

// ── construireLegende : structure par groupes ──
const leg = C.construireLegende({
    categories: [
        { nom: 'Hôpital', couleur: '#ef4444', emoji: '', compte: 3 },
        { nom: 'École', couleur: '#3b82f6', emoji: '🏫', compte: 0 },
    ],
    couches: [{ nom: 'Routes', couleur: '#3388ff', type: 'ligne' },
              { nom: 'Parcelles', couleur: '#22c55e', type: 'polygone' }],
    zones: [{ nom: 'Zone rouge', couleur: '#ef4444' }],
    libCategorie: 'Catégories', libCouches: 'Couches', libZones: 'Zones',
});
assert.strictEqual(leg.length, 3, '3 groupes : catégories, couches, zones');
assert.strictEqual(leg[0].items.length, 2);
assert.strictEqual(leg[0].items[0].type, 'point');
assert.strictEqual(leg[0].items[0].texte, 'Hôpital (3)', 'compte affiché');
assert.ok(leg[0].items[1].texte.startsWith('🏫'), 'emoji conservé');
assert.strictEqual(leg[1].items[0].type, 'ligne');
assert.strictEqual(leg[1].items[1].type, 'polygone');
assert.strictEqual(leg[2].items[0].type, 'zone');

// Aucune donnée → aucune entrée
const vide = C.construireLegende({ categories: [], couches: [], zones: [],
    libCategorie: 'C', libCouches: 'C', libZones: 'Z' });
assert.strictEqual(vide.length, 0);

console.log('export-carte.js : cœur OK');
