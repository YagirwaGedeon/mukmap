/* Gestionnaire des couches et des sources — logique pure (testable Node).
 * Hiérarchie : Projet → Sources → Fichiers → Couches → Catégories → entités.
 * Le filtrage ne supprime jamais de données : il produit des expressions de
 * visibilité / filtres MapLibre appliqués sur les données déjà chargées. */
(function (global) {
    'use strict';

    var GS = {};

    /* ── Construction de l'arbre ─────────────────────────────────── */

    GS.construireArbre = function (couches) {
        var sources = new Map();
        var sansSource = [];
        (couches || []).forEach(function (c) {
            var src = c.source_obj || null;
            var fichier = c.fichier || c.nom_original || c.fichier_source || '(inconnu)';
            var coucheNode = {
                id: c.id,
                nom: c.nom || ('Couche ' + c.id),
                type: c.type || 'point',
                couleur: c.couleur || '#3388ff',
                nb: c.nb_geometries || c.nb_entites || 0,
                categories: (c.categories || []).map(function (x) { return { nom: x.nom, nb: x.nb, couleur: x.couleur }; })
            };
            if (!src) {
                var grp = null;
                for (var i = 0; i < sansSource.length; i++) {
                    if (sansSource[i].fichier === fichier) { grp = sansSource[i]; break; }
                }
                if (!grp) { grp = { fichier: fichier, couches: [] }; sansSource.push(grp); }
                grp.couches.push(coucheNode);
                return;
            }
            var sn = sources.get(src.id);
            if (!sn) {
                sn = {
                    id: src.id, identifiant: src.identifiant || ('Source ' + src.id),
                    nom: src.nom || ('Source ' + src.id), couleur: src.couleur || '#3388ff',
                    symbole: src.symbole || '', fichiers: new Map()
                };
                sources.set(src.id, sn);
            }
            var fn = sn.fichiers.get(fichier);
            if (!fn) { fn = { nom: fichier, couches: [] }; sn.fichiers.set(fichier, fn); }
            fn.couches.push(coucheNode);
        });
        var liste = [];
        sources.forEach(function (s) {
            liste.push({ id: s.id, identifiant: s.identifiant, nom: s.nom, couleur: s.couleur, symbole: s.symbole,
                fichiers: Array.from(s.fichiers.values()) });
        });
        return { sources: liste, sansSource: sansSource };
    };

    /* ── Compteurs ───────────────────────────────────────────────── */

    GS.compter = function (arbre) {
        var tot = { sources: 0, fichiers: 0, couches: 0, categories: 0, entites: 0 };
        (arbre.sources || []).forEach(function (s) {
            tot.sources += 1;
            (s.fichiers || []).forEach(function (f) {
                tot.fichiers += 1;
                (f.couches || []).forEach(function (c) {
                    tot.couches += 1;
                    tot.entites += c.nb || 0;
                    tot.categories += (c.categories || []).length;
                });
            });
        });
        (arbre.sansSource || []).forEach(function (g) {
            tot.fichiers += 1;
            (g.couches || []).forEach(function (c) {
                tot.couches += 1;
                tot.entites += c.nb || 0;
                tot.categories += (c.categories || []).length;
            });
        });
        return tot;
    };

    /* ── Visibilité combinée ─────────────────────────────────────── */

    /* État :
     *   { couches: Map<id, bool>, sources: Map<id, bool>,
     *     fichiers: Map<nom, bool>, categories: Map<cle, bool> }
     * Une valeur absente = visible (défaut). false = masqué. */

    GS.cleCategorie = function (coucheId, nomCategorie) {
        return coucheId + '\u0000' + nomCategorie;
    };

    GS.sourceVisible = function (couche, etat) {
        if (!couche.source_obj) return true;
        return etat.sources.get(couche.source_obj.id) !== false;
    };

    GS.fichierVisible = function (couche, etat) {
        var nom = couche.fichier || couche.nom_original || couche.fichier_source || '(inconnu)';
        return etat.fichiers.get(nom) !== false;
    };

    GS.categoriesAutorisees = function (couche, etat) {
        var cats = couche.categories || [];
        if (!cats.length) return null;
        var autorisees = cats.filter(function (c) { return etat.categories.get(GS.cleCategorie(couche.id, c.nom)) !== false; });
        return autorisees;
    };

    /* Retourne { visible, filtreCats } :
     *   visible    : la couche doit-elle être affichée (layoutProperty) ?
     *   filtreCats : null ou expression MapLibre ['in', ['get','categorie'], [...]]
     *   raison     : chaîne descriptive pour les tests. */
    GS.filtrePourCouche = function (couche, etat) {
        if (!etat) etat = {};
        var visible = true;
        var raison = 'visible';
        if (etat.couches.get(couche.id) === false) { visible = false; raison = 'couche'; }
        else if (!GS.sourceVisible(couche, etat)) { visible = false; raison = 'source'; }
        else if (!GS.fichierVisible(couche, etat)) { visible = false; raison = 'fichier'; }
        var autorisees = GS.categoriesAutorisees(couche, etat);
        var filtreCats = null;
        if (visible && autorisees !== null) {
            if (!autorisees.length) { visible = false; raison = 'categories'; }
            else if (autorisees.length < (couche.categories || []).length) {
                filtreCats = ['in', ['get', 'categorie'], autorisees.map(function (c) { return c.nom; })];
                raison = 'categories-partiel';
            }
        }
        return { visible: visible, filtreCats: filtreCats, raison: raison };
    };

    /* ── Recherche dans l'arbre ──────────────────────────────────── */

    GS.filtrerRecherche = function (arbre, terme) {
        var t = (terme || '').trim().toLowerCase();
        if (!t) return arbre;
        function matchCouche(c) {
            return (c.nom || '').toLowerCase().indexOf(t) >= 0 ||
                (c.categories || []).some(function (x) { return (x.nom || '').toLowerCase().indexOf(t) >= 0; });
        }
        function matchFichier(f) {
            var couches = (f.couches || []).filter(matchCouche);
            return (f.nom || '').toLowerCase().indexOf(t) >= 0 || couches.length;
        }
        var sources = (arbre.sources || []).map(function (s) {
            var fichiers = (s.fichiers || []).map(function (f) {
                return { nom: f.nom, couches: (f.couches || []).filter(matchCouche) };
            }).filter(function (f) { return (f.nom || '').toLowerCase().indexOf(t) >= 0 || f.couches.length; });
            var nomOk = (s.nom || '').toLowerCase().indexOf(t) >= 0 || (s.identifiant || '').toLowerCase().indexOf(t) >= 0;
            return nomOk ? { id: s.id, identifiant: s.identifiant, nom: s.nom, couleur: s.couleur, symbole: s.symbole, fichiers: (s.fichiers || []).map(function (f) { return { nom: f.nom, couches: f.couches }; }) } : { id: s.id, identifiant: s.identifiant, nom: s.nom, couleur: s.couleur, symbole: s.symbole, fichiers: fichiers };
        });
        var sansSource = (arbre.sansSource || []).map(function (g) {
            return { fichier: g.fichier, couches: (g.couches || []).filter(matchCouche) };
        }).filter(function (g) { return (g.fichier || '').toLowerCase().indexOf(t) >= 0 || g.couches.length; });
        return { sources: sources.filter(function (s) { return s.fichiers.length; }), sansSource: sansSource };
    };

    global.GS = GS;
})(typeof window !== 'undefined' ? window : globalThis);