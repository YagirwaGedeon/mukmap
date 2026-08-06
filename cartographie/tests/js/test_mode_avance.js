/* MUKMAP — Tests du cœur Mode Avancé (fichier réel chargé, comme distribué).
 * En Node, `document` est indéfini : le IIFE expose ModeAvanceCore puis s'arrête.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'static', 'js', 'mode-avance.js'), 'utf8');

assert.ok(src.includes('globalThis.ModeAvanceCore'), 'le fichier expose ModeAvanceCore');
eval(src);
const C = globalThis.ModeAvanceCore;
assert.ok(C, 'ModeAvanceCore chargé');

// ── trad : défaut lorsque mukmapT est absent ──
assert.strictEqual(C.trad('cle_inconnue', 'Défaut'), 'Défaut', 'retourne le défaut');

// ── lireEtat : valeurs par défaut sans ETAT_MODE ──
let etat = C.lireEtat();
assert.strictEqual(etat.mode, 'classique');
assert.strictEqual(etat.acces_avance, false);
assert.strictEqual(etat.est_admin_principal, false);

// ── lireEtat : Mode Pro actif ──
globalThis.ETAT_MODE = { mode: 'avance', acces_avance: true, est_admin_principal: false };
etat = C.lireEtat();
assert.strictEqual(etat.mode, 'avance');
assert.strictEqual(etat.acces_avance, true);

// ── lireEtat : mode inconnu → classique ──
globalThis.ETAT_MODE = { mode: 'bizarre', acces_avance: true };
etat = C.lireEtat();
assert.strictEqual(etat.mode, 'classique', 'mode non reconnu → classique');

// ── surChangementMode ──
let recu = null;
C.surChangementMode((e) => { recu = e; });
assert.strictEqual(recu, null, 'aucune notification avant changement');

delete globalThis.ETAT_MODE;
console.log('mode-avance : OK');