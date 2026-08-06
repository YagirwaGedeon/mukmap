/* MUKMAP — Tests du cœur Mode 3D (fichier réel chargé, comme distribué).
 * En Node, `document` est indéfini : le IIFE expose Mode3D puis s'arrête
 * (pas d'interface navigateur : installer n'est pas défini).
 * Le mode 3D est natif MapLibre (même carte inclinée + relief DEM) :
 * pas de Cesium, pas d'overlay, pas de plafond de caméra.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'static', 'js', 'mode-3d.js'), 'utf8');

assert.ok(src.includes('globalThis.Mode3D'), 'le fichier expose Mode3D');
eval(src);
const M = globalThis.Mode3D;
assert.ok(M, 'Mode3D chargé');

// ── Aucune référence Cesium ──
assert.ok(!src.includes('unpkg.com/cesium'), 'pas de CDN Cesium');
assert.ok(!src.includes('Cesium.Viewer') && !src.includes('Cesium.') && !src.includes('window.Cesium'),
    'aucun usage de l’API Cesium');

// ── Constantes et sources DEM ──
assert.ok(Array.isArray(M.SOURCES_DEM) && M.SOURCES_DEM.length > 0, 'au moins une source DEM');
assert.ok(M.SOURCES_DEM[0].includes('terrarium') && M.SOURCES_DEM[0].includes('{z}/{x}/{y}'),
    'tuiles terrarium {z}/{x}/{y}');
assert.strictEqual(M.urlDEMCourante(), M.SOURCES_DEM[0], 'URL DEM courante = première source');
assert.strictEqual(M.DEM_MAXZOOM, 15, 'zoom max DEM 15');
assert.strictEqual(M.ID_SOURCE_DEM, 'mukmap-dem', 'id source DEM');

// ── Pitch des vues ──
assert.strictEqual(M.PITCH_AERIENNE, 60, 'vue aérienne : pitch 60°');
assert.strictEqual(M.PITCH_HORIZONTALE, 85, 'vue horizontale : pitch 85°');
assert.strictEqual(M.PITCH_MAX, 85, 'pitch max MapLibre 85°');
assert.strictEqual(M.pitchEnLimite(45), 45, 'pitch gardé');
assert.strictEqual(M.pitchEnLimite(89), 85, 'pitch plafonné à 85°');
assert.strictEqual(M.pitchEnLimite(-10), 0, 'pitch plancher 0°');
assert.strictEqual(M.pitchEnLimite('abc'), 0, 'pitch invalide → 0°');

// ── Exagération verticale ──
assert.strictEqual(M.EXAGERATION_MIN, 1, 'exagération min 1×');
assert.strictEqual(M.EXAGERATION_MAX, 10, 'exagération max 10×');
assert.strictEqual(M.reglerExageration(3), 3, 'réglée à 3');
assert.strictEqual(M.exagerationCourante(), 3);
assert.strictEqual(M.reglerExageration(0), M.EXAGERATION_MIN, 'bornée à 1×');
assert.strictEqual(M.reglerExageration(99), M.EXAGERATION_MAX, 'bornée à 10×');
assert.strictEqual(M.reglerExageration(7.4), 7, 'arrondie à l’entier');
assert.strictEqual(M.reglerExageration('abc'), M.EXAGERATION_MIN, 'invalide → 1×');

// ── Pas d'interface navigateur en Node ──
assert.strictEqual(M.installer, undefined, 'installer absent hors navigateur');
assert.strictEqual(M.estActif(), false, '3D désactivé au départ');

console.log('mode-3d : OK');
