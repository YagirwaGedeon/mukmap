// Tests Node du panneau Identifier : classification des colonnes en sections.
// Le code JS est extrait du template réel (carte.html) : ces tests valident la logique servie.
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

const debut = code.indexOf('const CLES_INTERNES');
const fin = code.indexOf('function basculerDetailsIdentifiant');
if (debut < 0 || fin < 0) {
  console.error('MARQUEURS INTROUVABLES dans carte.html :', debut, fin);
  process.exit(1);
}
const bloc = code.slice(debut, fin);

global.tIdent = (k, d) => d;
global.mukmapT = () => undefined;
global.echapper = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
eval(bloc + '\n; globalThis.sectionDonnee=sectionDonnee; globalThis.sectionsDonnees=sectionsDonnees;' +
     '\n; globalThis.formaterValeurBrut=formaterValeurBrut; globalThis.extraireDonnees=extraireDonnees;' +
     '\n; globalThis.htmlSectionsDonnees=htmlSectionsDonnees; globalThis.htmlSectionsCompactes=htmlSectionsCompactes;' +
     '\n; globalThis.CLES_INTERNES=CLES_INTERNES;');

let echecs = 0;
const ok = (cond, nom) => { console.log((cond ? '  OK ' : '  ECHEC ') + nom); if (!cond) echecs++; };

// 1) Classification : chaque colonne du fichier FCPCIII tombe dans la bonne section
const colonnes = ['No','Province','Territoire','Activite','Type','Village/Site','Lat','Long','Altitude',
  'Statut des etudes','Cycle','Observation',"Priorite d'execution",'Niveau de securite','Infrastructure',
  "Zone choisit dans l'atelier de selection"];
const attendues = {
  section_identification: ['No'],
  section_localisation: ['Province', 'Territoire', 'Village/Site', "Zone choisit dans l'atelier de selection"],
  section_coordonnees: ['Lat', 'Long', 'Altitude'],
  section_activite: ['Activite', 'Type', 'Cycle', 'Infrastructure'],
  section_statut: ['Statut des etudes', "Priorite d'execution", 'Niveau de securite'],
  section_observations: ['Observation'],
};
for (const [sec, liste] of Object.entries(attendues)) {
  const obtenues = colonnes.filter(c => sectionDonnee(c) === sec);
  ok(liste.every(c => obtenues.includes(c)) && obtenues.length === liste.length,
    'section ' + sec + ' -> ' + liste.join(', '));
}

// 2) Aucune colonne perdue, clés exactes conservées (comparaison triée : l'ordre suit les sections)
const d = {};
for (const c of colonnes) d[c] = '';
const plat = Object.values(sectionsDonnees(d)).flat();
ok(plat.length === colonnes.length, 'toutes les colonnes couvertes (' + plat.length + ')');
ok([...plat.map(x => x[0])].sort().join('|') === [...colonnes].sort().join('|'), 'aucune clé perdue ou renommée');

// 3) Valeurs vides et mise en forme
ok(formaterValeurBrut('') === '<span class="iv-vide">—</span>', 'vide -> tiret');
ok(formaterValeurBrut(null) === '<span class="iv-vide">—</span>', 'null -> tiret');
ok(formaterValeurBrut('-0.123456') === '-0.123456', 'nombre conserve');
ok(formaterValeurBrut('<script>alert(1)</script>') !== '<script>alert(1)</script>', 'valeur échappée (XSS)');

// 4) Rendus
const donnees = { 'No': '1', 'Province': 'Ituri', 'Village/Site': 'Bogoro', 'Lat': '1.409772222', 'Observation': '' };
const html = htmlSectionsDonnees(donnees);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
ok(['No','Province','Village/Site','Lat'].every(c => html.includes(esc(c))), 'clés rendues dans le panneau');
ok(html.includes(esc('1.409772222')) && html.includes('iv-vide'), 'valeurs et vide rendus');
ok(['Identification','Localisation','Coordonnées','Observations'].every(s => html.includes('>' + s + '<')),
  'sections rendues');
const pop = htmlSectionsCompactes(donnees);
ok(pop.includes('Bogoro'), 'popup compact contient la valeur');

// 5) extraireDonnees (défensif)
ok(JSON.stringify(extraireDonnees({ donnees: donnees })) === JSON.stringify(donnees), 'objet reconnu');
ok(extraireDonnees({ donnees: JSON.stringify(donnees) }) !== null, 'JSON en chaîne parsé');
ok(extraireDonnees({ donnees: {} }) === null, 'objet vide -> null');
ok(extraireDonnees({}) === null, 'absent -> null');

// 6) Fallback : jamais de ligne "donnees" ni [object Object]
const pip = { id: 1, nom: 'Goma Centre', province: 'Nord Kivu', donnees: {}, medias: [], photo: '' };
const entrees = Object.entries(pip).filter(([k]) => !CLES_INTERNES.has(k) && !k.startsWith('_'));
ok(!entrees.some(([k]) => k === 'donnees'), 'pas de ligne "donnees" dans le repli');
ok(!entrees.some(([, v]) => String(v).includes('[object Object]')), 'pas de [object Object]');

console.log(echecs === 0 ? 'JS OK' : echecs + ' ECHEC(S)');
process.exit(echecs === 0 ? 0 : 1);
