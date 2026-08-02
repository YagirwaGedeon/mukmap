// Tests Node du panneau Identifier : ouvrirIdentifiant avec les données servies.
// Reproduit le flux navigateur : extrait le JS de carte.html, reçoit donneesPoints
// réels (JSON de la page rendue par Django, passé en argument), stub le DOM et
// exécute ouvrirIdentifiant.
const fs = require('fs');
const path = require('path');

const TEMPLATE = path.join(__dirname, '..', '..', 'templates', 'cartographie', 'carte.html');
const src = fs.readFileSync(TEMPLATE, 'utf-8');
const scripts = [...src.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const js = scripts.reduce((a, b) => (b.length > a.length ? b : a));
const code = js
  .replace(/\{%[\s\S]*?%\}/g, '')
  .replace(/\{\{[\s\S]*?\}\}/g, '0')
  .replace(/0null/g, 'null');

const fichierDonnees = process.argv[2];
let donneesPoints;
if (fichierDonnees && fs.existsSync(fichierDonnees)) {
  donneesPoints = JSON.parse(fs.readFileSync(fichierDonnees, 'utf-8'));
} else {
  console.error('donneesPoints manquant : passer le JSON rendu en argument');
  process.exit(1);
}

const debut = code.indexOf('const CLES_INTERNES');
const fin = code.indexOf('function basculerDetailsIdentifiant');
const bloc = code.slice(debut, fin)
  .replace('const donneesPoints = 0;', 'const donneesPoints = ' + JSON.stringify(donneesPoints) + ';');

let echecs = 0;
const ok = (cond, nom) => { console.log((cond ? '  OK ' : '  ECHEC ') + nom); if (!cond) echecs++; };

const stubs = `
var couchesDonnees = [];
var CATS = {};
global.mukmapT = () => undefined;
function elementStub() {
  return { innerHTML: '', style: {}, classList: { add(){}, remove(){}, toggle(){} },
           addEventListener(){}, getBoundingClientRect: () => ({width: 0}) };
}
var identifyCorps = elementStub();
var identifyActions = elementStub();
var identifyPanel = elementStub();
var identifyListe = elementStub();
var identifiantActif = false;
var mode = null;
function surbrillanceIdentifiant() {}
function nomCoucheCarte() { return 'Points'; }
var window = { lucide: null };
var document = { getElementById: () => elementStub() };
`;

eval(stubs + bloc + '\n; globalThis.ouvrirIdentifiant = ouvrirIdentifiant;');

// 1) Point du fichier avec données
const bogoro = donneesPoints.find(p => p.nom === 'Bogoro') || donneesPoints.find(p => p.donnees && Object.keys(p.donnees).length);
if (!bogoro) { console.error('AUCUN point avec donnees dans la page servie'); process.exit(1); }
ok(!!bogoro, 'point avec données présent dans donneesPoints (' + Object.keys(bogoro.donnees).length + ' colonnes)');
ouvrirIdentifiant({
  id: bogoro.id, type: 'Feature', properties: bogoro,
  geometry: { type: 'Point', coordinates: [bogoro.longitude, bogoro.latitude] },
  layer: { id: 'points' },
});
const html = identifyCorps.innerHTML;
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let manquantes = [];
for (const [k, v] of Object.entries(bogoro.donnees)) {
  if (!html.includes(esc(k)) || !html.includes(esc(v))) manquantes.push(k + '=' + v);
}
ok(manquantes.length === 0, 'toutes les colonnes + valeurs exactes rendues par ouvrirIdentifiant' +
  (manquantes.length ? ' (manquent: ' + manquantes.join(', ') + ')' : ''));
ok(html.includes('ip-section'), 'sections présentes dans le panneau');
ok(html.includes('Fichier source') || html.includes('Source'), 'section Source présente');

// 2) Point SANS données (ancien point PIP) : repli propre, sans ligne "donnees"
const pip = { id: 1, nom: 'Goma Centre', categorie: 'village', statut: 'actif', projet: 'PIP',
  province: 'Nord Kivu', latitude: -1.6785, longitude: 29.233, donnees: {}, medias: [], photo: '' };
ouvrirIdentifiant({
  id: pip.id, type: 'Feature', properties: pip,
  geometry: { type: 'Point', coordinates: [29.233, -1.6785] },
  layer: { id: 'points' },
});
const htmlPip = identifyCorps.innerHTML;
ok(!htmlPip.includes('>donnees<'), 'aucune ligne "donnees" pour un point sans fichier');
ok(!htmlPip.includes('[object Object]'), 'aucun [object Object]');
ok(htmlPip.includes('Goma Centre'), 'nom du point affiché en repli');

// 3) Point avec donnees JSON en chaîne (défensif)
const jsonStr = { ...bogoro, donnees: JSON.stringify(bogoro.donnees) };
ouvrirIdentifiant({
  id: bogoro.id, type: 'Feature', properties: jsonStr,
  geometry: { type: 'Point', coordinates: [bogoro.longitude, bogoro.latitude] },
  layer: { id: 'points' },
});
ok(identifyCorps.innerHTML.includes('ip-section'), 'donnees en chaîne JSON parsées (sections affichées)');

console.log(echecs === 0 ? 'JS OK' : echecs + ' ECHEC(S)');
process.exit(echecs === 0 ? 0 : 1);
