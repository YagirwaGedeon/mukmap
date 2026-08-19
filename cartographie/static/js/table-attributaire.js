/* Table attributaire professionnelle — MUKMAP
 * Moteur pur (testable sous Node) + installeur DOM (MapLibre synchronisé).
 */
(function (global) {
    'use strict';

    // ─── MOTEUR PUR ────────────────────────────────────────────────
    var CORE = {
        TYPE_CHAMPS: {
            nom: 'text', description: 'text', latitude: 'nb', longitude: 'nb',
            categorie: 'choix', statut: 'choix', province: 'text', commune: 'text',
            quartier: 'text', date_creation: 'date', source_fichier: 'text',
            source_format: 'text', projet: 'text', activite: 'text', auteur: 'text'
        },

        // Récupère la valeur d'une ligne pour un champ ('d:cle' = JSON donnees)
        extraireValeur: function (ligne, champ) {
            if (champ && champ.indexOf('d:') === 0) {
                var donnees = ligne.donnees || {};
                var v = donnees[champ.slice(2)];
                return (v === null || v === undefined) ? '' : String(v);
            }
            if (champ === 'date_creation') return String(ligne.date_creation || '');
            var v = ligne[champ];
            return (v === null || v === undefined) ? '' : String(v);
        },

        // Détermine le type d'une valeur (nb/date/text)
        typeValeur: function (v) {
            var s = String(v === null || v === undefined ? '' : v).trim();
            if (s === '') return 'text';
            if (/^\d{4}-\d{2}-\d{2}/.test(s)) return 'date';
            if (s !== '' && !isNaN(Number(s))) return 'nb';
            return 'text';
        },

        // Applique un filtre {champ, op, valeur} sur une ligne
        appliquerFiltre: function (ligne, f) {
            if (!f || !f.champ) return true;
            var champ = f.champ;
            var op = f.op || 'eq';
            var attendu = f.valeur;
            var valeur = CORE.extraireValeur(ligne, champ);
            var t = CORE.typeValeur(valeur);
            if (op === 'vide') return valeur === '';
            if (op === 'non_vide') return valeur !== '';
            if (op === 'eq') {
                if (t === 'nb') return Number(valeur) === Number(attendu);
                return valeur.toLowerCase() === String(attendu).toLowerCase();
            }
            if (op === 'ne') return !CORE.appliquerFiltre(ligne, {champ: champ, op: 'eq', valeur: attendu});
            if (op === 'contient') return valeur.toLowerCase().indexOf(String(attendu).toLowerCase()) !== -1;
            if (op === 'commence') return valeur.toLowerCase().indexOf(String(attendu).toLowerCase()) === 0;
            if (op === 'finit') return valeur.toLowerCase().lastIndexOf(String(attendu).toLowerCase()) === valeur.length - String(attendu).length;
            if (op === 'dans') {
                var liste = Array.isArray(attendu) ? attendu : [attendu];
                return liste.some(function (x) { return String(x) === valeur; });
            }
            if (op === 'entre' || op === 'sup' || op === 'inf') {
                var nb = Number(valeur);
                var numerique = valeur !== '' && !isNaN(nb);
                if (t === 'date') {
                    var j = valeur.slice(0, 10);
                    if (op === 'entre' && Array.isArray(attendu)) {
                        return j >= String(attendu[0]).slice(0, 10) && j <= String(attendu[1]).slice(0, 10);
                    }
                    if (op === 'sup') return j >= String(attendu).slice(0, 10);
                    if (op === 'inf') return j <= String(attendu).slice(0, 10);
                    return false;
                }
                if (!numerique) return false;
                if (op === 'entre' && Array.isArray(attendu)) return nb >= Number(attendu[0]) && nb <= Number(attendu[1]);
                if (op === 'sup') return nb >= Number(attendu);
                if (op === 'inf') return nb <= Number(attendu);
            }
            return false;
        },

        // Applique une liste de filtres (logique 'et' ou 'ou')
        filtrer: function (lignes, filtres, logique) {
            if (!filtres || !filtres.length) return lignes.slice();
            var et = logique !== 'ou';
            return lignes.filter(function (l) {
                var ok = filtres.map(function (f) { return CORE.appliquerFiltre(l, f); });
                return et ? ok.every(Boolean) : ok.some(Boolean);
            });
        },

        // Tri stable par champ (nb/date/text), direction asc|desc
        trier: function (lignes, champ, direction) {
            var d = direction === 'desc' ? -1 : 1;
            var cles = [];
            lignes.forEach(function (l, i) {
                var v = CORE.extraireValeur(l, champ);
                var t = CORE.typeValeur(v);
                var num = (t === 'nb') ? Number(v) : NaN;
                var dat = (t === 'date') ? v.slice(0, 10) : null;
                cles.push({i: i, t: t, num: num, dat: dat, txt: v.toLowerCase()});
            });
            var ordre = cles.slice().sort(function (a, b) {
                var r;
                if (a.t === 'nb' && b.t === 'nb') r = a.num - b.num;
                else if (a.dat && b.dat) r = a.dat < b.dat ? -1 : (a.dat > b.dat ? 1 : 0);
                else r = a.txt < b.txt ? -1 : (a.txt > b.txt ? 1 : 0);
                if (r === 0) r = a.i - b.i;
                return r * d;
            });
            return ordre.map(function (c) { return lignes[c.i]; });
        },

        // Pagination : {lignes, page, pages, total}
        paginer: function (lignes, page, pageSize) {
            var total = lignes.length;
            var pages = total ? Math.max(1, Math.ceil(total / pageSize)) : 1;
            var p = Math.min(Math.max(1, page || 1), pages);
            return {
                lignes: lignes.slice((p - 1) * pageSize, p * pageSize),
                page: p, pages: pages, total: total
            };
        },

        // Statistiques d'un jeu de lignes (types numériques du modèle + clés JSON)
        stats: function (lignes, colonnes) {
            var st = {
                total: lignes.length,
                parCategorie: {}, parStatut: {}, parProvince: {},
                numeriques: {}, dateMin: null, dateMax: null
            };
            var numeriques = [];
            (colonnes || []).forEach(function (c) {
                if (c.type === 'nb' || c.type === 'json') numeriques.push(c.champ);
            });
            var collecte = {};
            numeriques.forEach(function (c) { collecte[c] = []; });
            lignes.forEach(function (l) {
                var cat = l.categorie_label || l.categorie || '—';
                st.parCategorie[cat] = (st.parCategorie[cat] || 0) + 1;
                var stt = l.statut_label || l.statut || '—';
                st.parStatut[stt] = (st.parStatut[stt] || 0) + 1;
                var prov = l.province || 'Non renseignée';
                st.parProvince[prov] = (st.parProvince[prov] || 0) + 1;
                var d = String(l.date_creation || '').slice(0, 10);
                if (d && (!st.dateMin || d < st.dateMin)) st.dateMin = d;
                if (d && (!st.dateMax || d > st.dateMax)) st.dateMax = d;
                numeriques.forEach(function (c) {
                    var v = Number(CORE.extraireValeur(l, c));
                    if (!isNaN(v)) collecte[c].push(v);
                });
            });
            Object.keys(collecte).forEach(function (c) {
                var vals = collecte[c];
                if (!vals.length) return;
                var somme = vals.reduce(function (a, b) { return a + b; }, 0);
                st.numeriques[c] = {
                    min: Math.min.apply(null, vals),
                    max: Math.max.apply(null, vals),
                    moyenne: Math.round((somme / vals.length) * 10000) / 10000,
                    somme: Math.round(somme * 10000) / 10000,
                    count: vals.length
                };
            });
            return st;
        },

        // CSV (chaîne) depuis lignes et colonnes [{champ, libelle}]
        versCSV: function (lignes, colonnes) {
            function cellule(v) {
                var s = String(v === null || v === undefined ? '' : v);
                if (/[";\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
                return s;
            }
            var tete = colonnes.map(function (c) { return cellule(c.libelle || c.champ); });
            var lignesCSV = [tete.join(';')];
            lignes.forEach(function (l) {
                lignesCSV.push(colonnes.map(function (c) {
                    return cellule(CORE.extraireValeur(l, c.champ));
                }).join(';'));
            });
            return lignesCSV.join('\r\n');
        },

        // Construit les paramètres d'URL pour l'API depuis l'état
        assemblerParams: function (etat, extra) {
            var params = {
                q: etat.q || '', page: etat.page || 1, page_size: etat.pageSize || 50,
                tri: (etat.tri && etat.tri.champ) || 'date_creation',
                direction: (etat.tri && etat.tri.direction) || 'desc'
            };
            if (etat.filtres && etat.filtres.length) {
                params.filtres = JSON.stringify({logique: etat.logique || 'et', filtres: etat.filtres});
            }
            if (etat.bbox) params.bbox = etat.bbox.join(',');
            if (etat.ids && etat.ids.length) params.ids = etat.ids.join(',');
            if (extra) Object.assign(params, extra);
            return params;
        }
    };

    // ─── CONFIG / LIBELLÉS ────────────────────────────────────────
    var OPS = [
        {v: 'eq', l: 'est égal à'}, {v: 'ne', l: 'est différent de'},
        {v: 'contient', l: 'contient'}, {v: 'commence', l: 'commence par'},
        {v: 'finit', l: 'se termine par'}, {v: 'dans', l: 'dans la liste'},
        {v: 'vide', l: 'est vide'}, {v: 'non_vide', l: 'est renseigné'},
        {v: 'entre', l: 'entre'}, {v: 'sup', l: '≥'}, {v: 'inf', l: '≤'}
    ];

    var LIBELLES_CHAMPS = {
        nom: 'Nom', description: 'Description', latitude: 'Latitude', longitude: 'Longitude',
        categorie: 'Type', statut: 'Statut', province: 'Province', commune: 'Commune',
        quartier: 'Quartier', date_creation: 'Date', projet: 'Projet', activite: 'Activité',
        auteur: 'Agent', source_fichier: 'Fichier source', source_format: 'Format'
    };

    var CATS = {
        hopital: ['🏥', '#ef4444'], ecole: ['🏫', '#3b82f6'], eglise: ['⛪', '#8b5cf6'],
        police: ['👮', '#2563eb'], marche: ['🛒', '#f59e0b'], projet: ['📦', '#06b6d4'],
        incident: ['⚠️', '#ef4444'], village: ['🏘️', '#22c55e'], ville: ['🏙️', '#0ea5e9'],
        pont: ['🌉', '#64748b'], route: ['🛣️', '#a16207'], entreprise: ['🏢', '#0d9488'],
        zone_rouge: ['🔴', '#ef4444'], zone_verte: ['🟢', '#22c55e'], zone_orange: ['🟠', '#f97316'],
        autre: ['📍', '#6b729c']
    };

    // ─── INSTALLEUR DOM ───────────────────────────────────────────
    function demarrer(opts) {
        opts = opts || {};
        var racine = typeof opts.racine === 'string' ? document.querySelector(opts.racine) : opts.racine;
        if (!racine) return null;
        var URL_API = opts.urlApi || '/api/table-points/';
        var CSRF = opts.csrf || '';
        var U = {
            etat: {
                q: '', page: 1, pageSize: opts.pageSize || 50,
                tri: {champ: 'date_creation', direction: 'desc'},
                filtres: [], logique: 'et', bbox: null,
                ids: null, selection: [], toutFiltre: false, carteSelection: false
            },
            donnees: {colonnes: [], facettes: {}, stats: null, results: [], count: 0, pages: 1},
            colonnesVisibles: null,
            carte: null, cartePrete: false,
            apercuCharges: false
        };
        var root = racine;
        var elements = {};
        var requeteSeq = 0;
        var majSeq = 0;
        var chargement = false;
        var blocScroll = false;

        function echo(html) { return html; }

        function t(cle, defaut) {
            return defaut;
        }

        function chercher(sel) { return root.querySelector(sel); }

        // ── API ────────────────────────────────────────────────
        function charger() {
            var seq = ++requeteSeq;
            var params = CORE.assemblerParams(U.etat, {apercu: '1'});
            var qs = new URLSearchParams();
            Object.keys(params).forEach(function (k) {
                if (params[k] !== undefined && params[k] !== null && params[k] !== '') qs.set(k, params[k]);
            });
            var url = URL_API + '?' + qs.toString();
            setChargement(true);
            fetch(url, {headers: {'X-Requested-With': 'XMLHttpRequest'}})
                .then(function (r) {
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    return r.json();
                })
                .then(function (data) {
                    if (seq !== requeteSeq) return;
                    U.donnees = data;
                    if (data.stats) {
                        var s = data.stats;
                        U.donnees.stats = {
                            total: s.total,
                            parCategorie: s.par_categorie || {},
                            parStatut: s.par_statut || {},
                            parProvince: s.par_province || {},
                            numeriques: s.numeriques || {},
                            dateMin: s.date_min,
                            dateMax: s.date_max
                        };
                    }
                    U.apercuCharges = true;
                    if (!U.colonnesVisibles) initialiserColonnes();
                    rendre();
                    majCarte();
                })
                .catch(function (err) {
                    if (seq !== requeteSeq) return;
                    console.error('Table attributaire :', err);
                    toast('Erreur de chargement des données.', 'erreur');
                })
                .finally(function () {
                    if (seq === requeteSeq) setChargement(false);
                });
        }

        function poster(url, corps, methode) {
            return fetch(url, {
                method: methode || 'POST',
                headers: {'Content-Type': 'application/json', 'X-CSRFToken': CSRF},
                body: JSON.stringify(corps)
            }).then(function (r) {
                return r.json().catch(function () { return {}; }).then(function (d) {
                    if (!r.ok) throw new Error(d.erreur || ('HTTP ' + r.status));
                    return d;
                });
            });
        }

        function setChargement(actif) {
            chargement = actif;
            var el = elements.chrg;
            if (el) el.style.display = actif ? 'flex' : 'none';
        }

        // ── Colonnes ───────────────────────────────────────────
        function initialiserColonnes() {
            var visibles = U.donnees.colonnes.map(function (c) { return c.champ; });
            var stock = null;
            try { stock = JSON.parse(localStorage.getItem('mukmap_ta_colonnes') || 'null'); } catch (e) { stock = null; }
            if (stock && Array.isArray(stock) && stock.length) {
                visibles = stock.filter(function (s) {
                    return U.donnees.colonnes.some(function (c) { return c.champ === s; });
                });
            }
            U.colonnesVisibles = visibles;
        }

        function colonnesActives() {
            var champOK = {};
            U.colonnesVisibles.forEach(function (c) { champOK[c] = true; });
            return U.donnees.colonnes.filter(function (c) { return champOK[c.champ]; });
        }

        function libelleChamp(champ) {
            if (champ.indexOf('d:') === 0) return champ.slice(2);
            return LIBELLES_CHAMPS[champ] || champ;
        }

        // ── Rendu ──────────────────────────────────────────────
        function rendre() {
            rendreEntetes();
            rendreCorps();
            rendrePagination();
            rendreBarre();
            rendreStatsBadge();
            rendreFiltresPanneau();
            rendreColonnesPanneau();
        }

        function rendreEntetes() {
            var tete = elements.tete;
            if (!tete) return;
            var html = '<th class="ta-col-check"><input type="checkbox" id="ta-check-tout" ' +
                (selectionPageComplete() ? 'checked' : '') + '></th>';
            colonnesActives().forEach(function (c) {
                var tri = U.etat.tri.champ === c.champ;
                var fleche = tri ? (U.etat.tri.direction === 'asc' ? ' ↑' : ' ↓') : '';
                html += '<th data-champ="' + c.champ + '" class="ta-col"><span class="ta-th-texte">' +
                    echapper(libelleChamp(c.champ)) + fleche + '</span><span class="ta-col-resize" title="Redimensionner"></span></th>';
            });
            html += '<th class="ta-col-actions">Actions</th>';
            tete.innerHTML = html;

            tete.querySelectorAll('th.ta-col').forEach(function (th) {
                th.addEventListener('click', function (ev) {
                    if (ev.target.classList.contains('ta-col-resize')) return;
                    var champ = th.getAttribute('data-champ');
                    if (U.etat.tri.champ === champ) {
                        U.etat.tri.direction = U.etat.tri.direction === 'asc' ? 'desc' : 'asc';
                    } else {
                        U.etat.tri = {champ: champ, direction: 'asc'};
                    }
                    U.etat.page = 1;
                    charger();
                });
            });
            installerResize();
        }

        function rendreCorps() {
            var corps = elements.corps;
            if (!corps) return;
            if (!U.donnees.results.length) {
                corps.innerHTML = '<tr><td colspan="20"><div class="ta-vide">' +
                    '<div class="ta-vide-icone">🗂️</div><div>Aucun point ne correspond aux critères.</div></div></td></tr>';
                return;
            }
            var html = '';
            U.donnees.results.forEach(function (p) {
                var sel = U.etat.selection.indexOf(p.id) !== -1;
                var cat = CATS[p.categorie] || CATS.autre;
                html += '<tr data-id="' + p.id + '" class="ta-ligne' + (sel ? ' sel' : '') + '">' +
                    '<td class="ta-col-check"><input type="checkbox" class="ta-check-ligne" data-id="' + p.id + '" ' + (sel ? 'checked' : '') + '></td>';
                colonnesActives().forEach(function (c) {
                    html += '<td>' + cellule(c.champ, p) + '</td>';
                });
                html += '<td class="ta-actions">' +
                    '<button class="ta-bouton ta-bouton-icon" data-act="zoom" data-id="' + p.id + '" title="Zoom vers l\'objet">⤢</button>' +
                    '<button class="ta-bouton ta-bouton-icon" data-act="edit" data-id="' + p.id + '" title="Modifier">✏️</button>' +
                    '<button class="ta-bouton ta-bouton-icon danger" data-act="del" data-id="' + p.id + '" title="Supprimer">🗑️</button></td></tr>';
            });
            corps.innerHTML = html;

            corps.querySelectorAll('.ta-check-ligne').forEach(function (cb) {
                cb.addEventListener('change', function () {
                    basculerSelection(Number(cb.getAttribute('data-id')), cb.checked);
                });
            });
            corps.querySelectorAll('[data-act="zoom"]').forEach(function (b) {
                b.addEventListener('click', function () { zoomerVers(Number(b.getAttribute('data-id'))); });
            });
            corps.querySelectorAll('[data-act="edit"]').forEach(function (b) {
                b.addEventListener('click', function () { ouvrirEdition(Number(b.getAttribute('data-id'))); });
            });
            corps.querySelectorAll('[data-act="del"]').forEach(function (b) {
                b.addEventListener('click', function () { confirmerSuppression([Number(b.getAttribute('data-id'))]); });
            });
            corps.addEventListener('click', function (ev) {
                var tr = ev.target.closest('tr.ta-ligne');
                if (!tr) return;
                if (ev.target.closest('button') || ev.target.closest('input')) return;
                selectionnerLigne(tr, ev);
            });
            corps.addEventListener('dblclick', function (ev) {
                var tr = ev.target.closest('tr.ta-ligne');
                if (!tr) return;
                zoomerVers(Number(tr.getAttribute('data-id')));
            });
        }

        function cellule(champ, p) {
            var valeur = CORE.extraireValeur(p, champ);
            if (champ === 'categorie') {
                var cat = CATS[p.categorie] || CATS.autre;
                return '<span class="ta-badge" style="background:' + cat[1] + '22;color:' + cat[1] + ';border-color:' + cat[1] + '55">' +
                    cat[0] + ' ' + echapper(p.categorie_label || valeur) + '</span>';
            }
            if (champ === 'statut') {
                var couleurs = {actif: '#22c55e', inactif: '#6b7280', en_cours: '#f59e0b', termine: '#3b82f6'};
                var coul = couleurs[p.statut] || '#8b5cf6';
                return '<span class="ta-badge" style="background:' + coul + '22;color:' + coul + ';border-color:' + coul + '55">' + echapper(p.statut_label || valeur) + '</span>';
            }
            if (champ === 'latitude' || champ === 'longitude') {
                return '<span class="ta-mono">' + echapper(valeur) + '</span>';
            }
            if (champ === 'nom') {
                return '<span class="ta-nom">' + echapper(valeur) + '</span>';
            }
            if (champ === 'projet') {
                return valeur ? '<span class="ta-badge ta-badge-projet">' + echapper(valeur) + '</span>' : '<span class="ta-mute">—</span>';
            }
            if (valeur === '') return '<span class="ta-mute">—</span>';
            return echapper(valeur);
        }

        function rendrePagination() {
            var zone = elements.pagination;
            if (!zone) return;
            var d = U.donnees;
            var html = '<span class="ta-pg-info">' + d.count + ' point(s) — page ' + d.page + '/' + d.pages + '</span>';
            html += '<div class="ta-pg-boutons">' +
                boutonPage('«', d.page - 1, d.page > 1) +
                boutonPage('‹', Math.max(1, d.page - 1), d.page > 1) +
                '<span class="ta-pg-courante">' + d.page + '</span>' +
                boutonPage('›', Math.min(d.pages, d.page + 1), d.page < d.pages) +
                boutonPage('»', d.pages, d.page < d.pages) + '</div>';
            html += '<select class="ta-pg-taille" title="Lignes par page">';
            [25, 50, 100, 200].forEach(function (n) {
                html += '<option value="' + n + '"' + (U.etat.pageSize === n ? ' selected' : '') + '>' + n + ' / page</option>';
            });
            html += '</select>';
            zone.innerHTML = html;
            zone.querySelectorAll('[data-page]').forEach(function (b) {
                b.addEventListener('click', function () {
                    if (b.disabled) return;
                    U.etat.page = Number(b.getAttribute('data-page'));
                    charger();
                });
            });
            zone.querySelector('.ta-pg-taille').addEventListener('change', function (ev) {
                U.etat.pageSize = Number(ev.target.value);
                U.etat.page = 1;
                charger();
            });
        }

        function boutonPage(lib, page, actif) {
            return '<button class="ta-pg-bouton' + (actif ? '' : ' disabled') + '" data-page="' + page + '"' +
                (actif ? '' : ' disabled') + '>' + lib + '</button>';
        }

        function rendreBarre() {
            var barre = elements.barre;
            if (!barre) return;
            var nbSel = U.etat.toutFiltre ? U.donnees.count : U.etat.selection.length;
            var html = '';
            if (nbSel > 0) {
                html += '<span class="ta-sel-pill">' + nbSel + ' sélectionné(s)' +
                    (U.etat.toutFiltre ? ' (tous les résultats)' : '') + ' — ' +
                    '<button class="ta-lien" data-act="zoom-sel">Zoom</button> · ' +
                    '<button class="ta-lien" data-act="del-sel">Supprimer</button> · ' +
                    '<button class="ta-lien" data-act="tout-desel">Désélectionner</button></span>';
            }
            barre.innerHTML = html;
            majBoutonCarteSelection();
            if (nbSel === 0) return;
            barre.querySelector('[data-act="zoom-sel"]').addEventListener('click', zoomerSelection);
            barre.querySelector('[data-act="del-sel"]').addEventListener('click', function () {
                confirmerSuppression(selectionIds());
            });
            barre.querySelector('[data-act="tout-desel"]').addEventListener('click', desactiverTout);
        }

        function majBoutonCarteSelection() {
            var b = elements.btnCarteSelection;
            if (!b) return;
            b.classList.toggle('actif', U.etat.carteSelection);
            if (U.etat.carteSelection) {
                var n = U.etat.toutFiltre ? (U.donnees.count || 0) : U.etat.selection.length;
                b.innerHTML = '✅ Points sélectionnés (' + n + ')';
                b.title = 'Afficher tous les points sur la carte (cliquez pour revenir à tous les points)';
            } else {
                b.innerHTML = '📍 Tous les points';
                b.title = 'Afficher sur la carte uniquement les points sélectionnés (cliquez sur les cases à cocher pour choisir)';
            }
        }

        function rendreStatsBadge() {
            var badge = elements.statsBadge;
            if (!badge || !U.donnees.stats) return;
            badge.innerHTML = '<span class="ta-stat-pill">📊 ' + U.donnees.stats.total + ' — ' +
                Object.keys(U.donnees.stats.parCategorie).length + ' types · ' +
                Object.keys(U.donnees.stats.parProvince).length + ' provinces</span>';
            rendreStatsCorps();
        }

        function rendreStatsCorps() {
            var corps = elements.statsCorps;
            if (!corps || !U.donnees.stats) return;
            var s = U.donnees.stats;
            var html = '';
            html += blocStats('Catégories', s.parCategorie);
            html += blocStats('Statuts', s.parStatut);
            html += blocStats('Provinces', s.parProvince);
            if (s.dateMin || s.dateMax) {
                html += '<div class="ta-stats-bloc"><div class="ta-stats-titre">📅 Période</div>' +
                    '<div class="ta-stats-ligne">Du <b>' + echapper(s.dateMin) + '</b> au <b>' + echapper(s.dateMax) + '</b></div></div>';
            }
            Object.keys(s.numeriques || {}).forEach(function (c) {
                var n = s.numeriques[c];
                html += '<div class="ta-stats-bloc"><div class="ta-stats-titre">🔢 ' + echapper(libelleChamp(c)) + '</div>' +
                    '<div class="ta-stats-ligne">min <b>' + n.min + '</b> · max <b>' + n.max + '</b></div>' +
                    '<div class="ta-stats-ligne">moyenne <b>' + n.moyenne + '</b> · somme <b>' + n.somme + '</b></div>' +
                    '<div class="ta-stats-ligne">' + n.count + ' valeur(s) renseignée(s)</div></div>';
            });
            corps.innerHTML = html || '<div class="ta-filtre-vide">Aucune statistique disponible.</div>';
        }

        function blocStats(titre, obj) {
            var paires = Object.keys(obj || {}).map(function (k) {
                return {k: k, n: obj[k]};
            }).sort(function (a, b) { return b.n - a.n; });
            if (!paires.length) return '';
            var total = paires.reduce(function (a, p) { return a + p.n; }, 0);
            var max = paires[0].n || 1;
            var lignes = paires.map(function (p) {
                var pct = Math.round((p.n / total) * 100);
                return '<div class="ta-stats-ligne ta-stats-barre"><span class="ta-stats-nom">' + echapper(p.k) + '</span>' +
                    '<span class="ta-stats-piste"><span class="ta-stats-rempli" style="width:' + Math.round((p.n / max) * 100) + '%"></span></span>' +
                    '<span class="ta-stats-n">' + p.n + ' (' + pct + '%)</span></div>';
            }).join('');
            return '<div class="ta-stats-bloc"><div class="ta-stats-titre">' + echapper(titre) + '</div>' + lignes + '</div>';
        }

        function rendreFiltresPanneau() {
            var zone = elements.filtresListe;
            if (!zone) return;
            if (!U.etat.filtres.length) {
                zone.innerHTML = '<div class="ta-filtre-vide">Aucun filtre appliqué. Ajoutez-en un ci-dessous.</div>';
                return;
            }
            zone.innerHTML = U.etat.filtres.map(function (f, i) {
                var op = OPS.find(function (o) { return o.v === f.op; }) || OPS[0];
                var val = Array.isArray(f.valeur) ? f.valeur.join(' — ') : String(f.valeur || '');
                return '<div class="ta-filtre-ligne" data-i="' + i + '">' +
                    '<span class="ta-filtre-champ">' + echapper(libelleChamp(f.champ)) + '</span>' +
                    '<span class="ta-filtre-op">' + op.l + '</span>' +
                    '<span class="ta-filtre-val">' + echapper(val) + '</span>' +
                    '<button class="ta-bouton ta-bouton-icon danger" data-act="f-del" data-i="' + i + '" title="Retirer">✕</button></div>';
            }).join('');
            zone.querySelectorAll('[data-act="f-del"]').forEach(function (b) {
                b.addEventListener('click', function () {
                    U.etat.filtres.splice(Number(b.getAttribute('data-i')), 1);
                    U.etat.page = 1;
                    charger();
                });
            });
        }

        function rendreColonnesPanneau() {
            var zone = elements.colonnesListe;
            if (!zone) return;
            zone.innerHTML = U.donnees.colonnes.map(function (c) {
                var visible = U.colonnesVisibles.indexOf(c.champ) !== -1;
                return '<label class="ta-col-ligne"><input type="checkbox" data-champ="' + c.champ + '"' +
                    (visible ? ' checked' : '') + '> ' + echapper(libelleChamp(c.champ)) + '</label>';
            }).join('');
            zone.querySelectorAll('input[data-champ]').forEach(function (cb) {
                cb.addEventListener('change', function () {
                    var champ = cb.getAttribute('data-champ');
                    var idx = U.colonnesVisibles.indexOf(champ);
                    if (cb.checked && idx === -1) U.colonnesVisibles.push(champ);
                    if (!cb.checked && idx !== -1) U.colonnesVisibles.splice(idx, 1);
                    try {
                        localStorage.setItem('mukmap_ta_colonnes', JSON.stringify(U.colonnesVisibles));
                    } catch (e) { /* stockage indisponible */ }
                    rendreEntetes();
                    rendreCorps();
                });
            });
        }

        // ── Sélection ──────────────────────────────────────────
        function selectionPageComplete() {
            var idsPage = U.donnees.results.map(function (p) { return p.id; });
            return idsPage.length > 0 && idsPage.every(function (id) { return U.etat.selection.indexOf(id) !== -1; });
        }

        function basculerSelection(id, actif) {
            var idx = U.etat.selection.indexOf(id);
            if (actif && idx === -1) U.etat.selection.push(id);
            if (!actif && idx !== -1) U.etat.selection.splice(idx, 1);
            U.etat.toutFiltre = false;
            rendreBarre();
            rendreEntetes();
            U.donnees.results.forEach(function (p) {
                var tr = chercher('tr[data-id="' + p.id + '"]');
                if (tr) tr.classList.toggle('sel', U.etat.selection.indexOf(p.id) !== -1);
            });
            majSourceCarteFiltree();
        }

        var derniereLigneId = null;
        function selectionnerLigne(tr, ev) {
            var id = Number(tr.getAttribute('data-id'));
            var modif = ev.ctrlKey || ev.metaKey;
            var plage = ev.shiftKey && derniereLigneId !== null;
            if (plage) {
                var ids = U.donnees.results.map(function (p) { return p.id; });
                var a = ids.indexOf(derniereLigneId);
                var b = ids.indexOf(id);
                if (a !== -1 && b !== -1) {
                    var min = Math.min(a, b), max = Math.max(a, b);
                    ids.slice(min, max + 1).forEach(function (i) {
                        if (U.etat.selection.indexOf(i) === -1) U.etat.selection.push(i);
                    });
                }
            } else if (modif) {
                basculerSelection(id, U.etat.selection.indexOf(id) === -1);
            } else {
                U.etat.selection = [id];
                U.etat.toutFiltre = false;
                rendreBarre();
                rendreEntetes();
                U.donnees.results.forEach(function (p) {
                    var l = chercher('tr[data-id="' + p.id + '"]');
                    if (l) l.classList.toggle('sel', U.etat.selection.indexOf(p.id) !== -1);
                });
            }
            derniereLigneId = id;
            surlignerCarte(id);
        }

        function selectionIds() {
            if (U.etat.toutFiltre) return null; // null = tous les résultats filtrés
            return U.etat.selection.slice();
        }

        function desactiverTout() {
            U.etat.selection = [];
            U.etat.toutFiltre = false;
            rendreBarre();
            rendreEntetes();
            rendreCorps();
            effacerSurlignageCarte();
            majSourceCarteFiltree();
        }

        function majCheckTout() {
            var cb = elements.checkTout;
            if (!cb) return;
            cb.checked = selectionPageComplete();
        }

        // ── Carte ──────────────────────────────────────────────
        function initCarte() {
            var conteneur = opts.conteneurCarte;
            if (!conteneur || typeof maplibregl === 'undefined') return;
            var el = typeof conteneur === 'string' ? document.querySelector(conteneur) : conteneur;
            if (!el) return;
            U.carte = new maplibregl.Map({
                container: el,
                style: {version: 8, sources: {}, layers: []},
                center: [29.22, -1.67], zoom: 7
            });
            U.carte.addControl(new maplibregl.NavigationControl({visualizePitch: true}), 'top-right');
            U.carte.on('load', function () {
                U.cartePrete = true;
                U.carte.addSource('fond', {
                    type: 'raster',
                    tiles: ['https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
                            'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png'],
                    tileSize: 256, attribution: '© OpenStreetMap © CARTO'
                });
                U.carte.addLayer({id: 'fond', type: 'raster', source: 'fond'});
                U.carte.addSource('table-points', {type: 'geojson', data: {type: 'FeatureCollection', features: []}});
                U.carte.addLayer({
                    id: 'table-points-cercle', type: 'circle', source: 'table-points',
                    paint: {
                        'circle-color': '#6d5df6', 'circle-radius': 7,
                        'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5
                    }
                });
                U.carte.addLayer({
                    id: 'table-points-halo', type: 'circle', source: 'table-points',
                    filter: ['==', ['get', 'ta_sel'], true],
                    paint: {'circle-color': '#f59e0b', 'circle-radius': 12, 'circle-opacity': 0.35}
                });
                U.carte.on('click', 'table-points-cercle', function (e) {
                    if (e.features && e.features.length) {
                        selectionDepuisCarte(e.features[0].properties.ta_id);
                    }
                });
                U.carte.on('mousemove', 'table-points-cercle', function () {
                    U.carte.getCanvas().style.cursor = 'pointer';
                });
                U.carte.on('mouseleave', 'table-points-cercle', function () {
                    U.carte.getCanvas().style.cursor = '';
                });
                majCarte();
            });
        }

        function majCarte() {
            if (!U.carte || !U.cartePrete) return;
            var seq = ++majSeq;
            var params = CORE.assemblerParams(U.etat, {});
            params.page_size = 1000;
            delete params.page;
            delete params.apercu;
            var qs = new URLSearchParams();
            Object.keys(params).forEach(function (k) {
                if (params[k] !== undefined && params[k] !== null && params[k] !== '') qs.set(k, params[k]);
            });
            fetch(URL_API + '?' + qs.toString(), {headers: {'X-Requested-With': 'XMLHttpRequest'}})
                .then(function (r) { return r.ok ? r.json() : null; })
                .then(function (data) {
                    if (seq !== majSeq || !data) return;
                    var src = U.carte.getSource('table-points');
                    if (!src) return;
                    var features = (data.results || []).map(function (p) {
                        return {
                            type: 'Feature', id: p.id,
                            properties: {
                                ta_id: p.id,
                                ta_sel: U.etat.toutFiltre ? true : (U.etat.selection.indexOf(p.id) !== -1)
                            },
                            geometry: {type: 'Point', coordinates: [p.longitude, p.latitude]}
                        };
                    });
                    src._complet = features;
                    src.setData({type: 'FeatureCollection', features: filtrerCarteSelection(features)});
                })
                .catch(function () { /* silencieux */ });
        }

        function filtrerCarteSelection(features) {
            if (!U.etat.carteSelection) return features;
            if (U.etat.toutFiltre) return features;
            return (features || []).filter(function (f) {
                return f.properties && f.properties.ta_sel;
            });
        }

        function majSourceCarteFiltree() {
            if (!U.carte || !U.cartePrete) return;
            var src = U.carte.getSource('table-points');
            if (!src || !src._complet) return;
            src._complet.forEach(function (f) {
                if (f.properties) f.properties.ta_sel = U.etat.toutFiltre ? true : (U.etat.selection.indexOf(f.id) !== -1);
            });
            src.setData({type: 'FeatureCollection', features: filtrerCarteSelection(src._complet)});
        }

        function zoomerVers(id) {
            if (!U.carte) return;
            var p = (U.donnees.results || []).find(function (x) { return x.id === id; });
            if (!p) return;
            U.carte.flyTo({center: [p.longitude, p.latitude], zoom: Math.max(U.carte.getZoom(), 13)});
            surlignerCarte(id);
            var tr = chercher('tr[data-id="' + id + '"]');
            if (tr && !blocScroll) {
                blocScroll = true;
                tr.scrollIntoView({behavior: 'smooth', block: 'center'});
                setTimeout(function () { blocScroll = false; }, 600);
            }
        }

        function surlignerCarte(id) {
            if (!U.carte || !U.cartePrete) return;
            var src = U.carte.getSource('table-points');
            if (!src) return;
            src.setFeatureState ? null : null;
            var data = src._data || null;
            if (data && data.features) {
                data.features.forEach(function (f) {
                    if (f.properties) f.properties.ta_sel = f.id === id;
                });
                src.setData(data);
            }
        }

        function effacerSurlignageCarte() {
            if (!U.carte || !U.cartePrete) return;
            var src = U.carte.getSource('table-points');
            if (!src || !src._data || !src._data.features) return;
            src._data.features.forEach(function (f) {
                if (f.properties) f.properties.ta_sel = false;
            });
            src.setData(src._data);
        }

        function selectionDepuisCarte(id) {
            U.etat.selection = [id];
            U.etat.toutFiltre = false;
            rendreBarre();
            rendreEntetes();
            rendreCorps();
            majSourceCarteFiltree();
            var tr = chercher('tr[data-id="' + id + '"]');
            if (tr && !blocScroll) {
                blocScroll = true;
                tr.scrollIntoView({behavior: 'smooth', block: 'center'});
                setTimeout(function () { blocScroll = false; }, 600);
            }
            toast('Point sélectionné sur la carte.', 'info');
        }

        function zoomerSelection() {
            if (!U.carte) return;
            var ids = selectionIds();
            var source = U.carte.getSource('table-points');
            if (!source || !source._data || !source._data.features) return;
            var features = source._data.features.filter(function (f) {
                if (ids === null) return true;
                return ids.indexOf(f.id) !== -1;
            });
            if (!features.length) return;
            var coords = features.map(function (f) { return f.geometry.coordinates; });
            if (coords.length === 1) {
                U.carte.flyTo({center: coords[0], zoom: 14});
            } else {
                U.carte.fitBounds(coords.reduce(function (acc, c) {
                    acc.extend(c);
                    return acc;
                }, new maplibregl.LngLatBounds(coords[0], coords[0])), {padding: 50});
            }
        }

        // ── Filtre spatial ─────────────────────────────────────
        function activerFiltreSpatial(actif) {
            if (!U.carte || !U.cartePrete) return;
            U.etat.bbox = actif ? empriseActuelle() : null;
            U.etat.page = 1;
            var btn = elements.filtreSpatial;
            if (btn) btn.classList.toggle('actif', actif);
            charger();
            if (actif) {
                U.carte.on('moveend', onDeplacementCarte);
            } else {
                U.carte.off('moveend', onDeplacementCarte);
            }
            rendreFiltresPanneau();
            rendreStatsBadge();
        }

        function onDeplacementCarte() {
            U.etat.bbox = empriseActuelle();
            U.etat.page = 1;
            charger();
        }

        function empriseActuelle() {
            var b = U.carte.getBounds();
            return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
        }

        // ── Édition / Ajout ────────────────────────────────────
        function ouvrirEdition(id) {
            var p = (U.donnees.results || []).find(function (x) { return x.id === id; });
            if (!p) return;
            ouvrirFormulaire(p);
        }

        function ouvrirAjout() {
            var init = {};
            if (U.carte && U.cartePrete) {
                var c = U.carte.getCenter();
                init.latitude = Math.round(c.lat * 1000000) / 1000000;
                init.longitude = Math.round(c.lng * 1000000) / 1000000;
            }
            ouvrirFormulaire({id: null, nom: '', description: '', categorie: 'autre', statut: 'actif',
                              province: '', commune: '', quartier: '', latitude: '', longitude: '',
                              donnees: {}, _init: init});
        }

        function ouvrirFormulaire(point) {
            var modale = elements.modale;
            if (!modale) return;
            var colonnesJSON = (U.donnees.colonnes || []).filter(function (c) { return c.type === 'json'; });
            var html = '<div class="ta-modale-titre">' + (point.id ? 'Modifier le point' : 'Nouveau point') + '</div>' +
                '<div class="ta-form">' +
                '<label class="ta-champ"><span>Nom *</span><input name="nom" value="' + echapper(point.nom) + '" required></label>' +
                '<div class="ta-form-2col">' +
                '<label class="ta-champ"><span>Latitude *</span><input name="latitude" type="number" step="any" value="' + echapper(point.latitude === null || point.latitude === undefined ? point._init.latitude || '' : point.latitude) + '" required></label>' +
                '<label class="ta-champ"><span>Longitude *</span><input name="longitude" type="number" step="any" value="' + echapper(point.longitude === null || point.longitude === undefined ? point._init.longitude || '' : point.longitude) + '" required></label></div>' +
                '<div class="ta-form-2col">' +
                '<label class="ta-champ"><span>Type</span><select name="categorie">' + optionsCategorie(point.categorie) + '</select></label>' +
                '<label class="ta-champ"><span>Statut</span><select name="statut">' + optionsStatut(point.statut) + '</select></label></div>' +
                '<div class="ta-form-2col">' +
                '<label class="ta-champ"><span>Province</span><input name="province" value="' + echapper(point.province || '') + '"></label>' +
                '<label class="ta-champ"><span>Commune</span><input name="commune" value="' + echapper(point.commune || '') + '"></label></div>' +
                '<label class="ta-champ"><span>Quartier</span><input name="quartier" value="' + echapper(point.quartier || '') + '"></label>' +
                '<label class="ta-champ"><span>Description</span><textarea name="description" rows="2">' + echapper(point.description || '') + '</textarea></label>';
            colonnesJSON.forEach(function (c) {
                var cle = c.champ.slice(2);
                var v = point.donnees ? point.donnees[cle] : '';
                html += '<label class="ta-champ ta-champ-json"><span>' + echapper(cle) + '</span>' +
                    '<input name="json:' + cle + '" value="' + echapper(v === null || v === undefined ? '' : v) + '"></label>';
            });
            if (!colonnesJSON.length) {
                html += '<div class="ta-form-json-vide">Les colonnes du fichier importé apparaîtront ici après l\'enregistrement.</div>';
            }
            html += '</div>' +
                '<div class="ta-modale-actions">' +
                '<button class="ta-bouton" data-act="form-annuler">Annuler</button>' +
                '<button class="ta-bouton ta-bouton-primaire" data-act="form-valider">' + (point.id ? 'Enregistrer' : 'Ajouter') + '</button></div>';
            modale.innerHTML = html;
            modale.classList.add('ouvert');

            modale.querySelector('[data-act="form-annuler"]').addEventListener('click', fermerModale);
            modale.querySelector('[data-act="form-valider"]').addEventListener('click', function () {
                validerFormulaire(point.id);
            });
            modale.addEventListener('click', function (ev) {
                if (ev.target === modale) fermerModale();
            });
        }

        function optionsCategorie(sel) {
            var html = '';
            Object.keys(CATS).forEach(function (k) {
                var label = (CATS[k][0]) + ' ' + (labelCat(k));
                html += '<option value="' + k + '"' + (sel === k ? ' selected' : '') + '>' + label + '</option>';
            });
            return html;
        }

        function labelCat(k) {
            var m = {hopital: 'Hôpital', ecole: 'École', eglise: 'Église', police: 'Police',
                     marche: 'Marché', projet: 'Projet', incident: 'Incident', village: 'Village',
                     ville: 'Ville', pont: 'Pont', route: 'Route', entreprise: 'Entreprise',
                     zone_rouge: 'Zone rouge', zone_verte: 'Zone verte', zone_orange: 'Zone orange',
                     autre: 'Autre'};
            return m[k] || k;
        }

        function optionsStatut(sel) {
            var m = {actif: 'Actif', inactif: 'Inactif', en_cours: 'En cours', termine: 'Terminé'};
            var html = '';
            Object.keys(m).forEach(function (k) {
                html += '<option value="' + k + '"' + (sel === k ? ' selected' : '') + '>' + m[k] + '</option>';
            });
            return html;
        }

        function validerFormulaire(id) {
            var modale = elements.modale;
            var donnees = {};
            var erreur = false;
            modale.querySelectorAll('input[name],textarea[name],select[name]').forEach(function (champ) {
                var nom = champ.getAttribute('name');
                var valeur = champ.value.trim();
                if (nom.indexOf('json:') === 0) {
                    donnees[nom.slice(5)] = valeur;
                    return;
                }
                if (nom === 'latitude' || nom === 'longitude') {
                    if (valeur === '' || isNaN(Number(valeur))) {
                        erreur = true;
                        champ.classList.add('invalide');
                    }
                    return;
                }
                donnees[nom] = valeur;
            });
            if (erreur) {
                toast('Coordonnées numériques requises.', 'erreur');
                return;
            }
            var url = id ? (URL_API + id + '/modifier/') : (URL_API + 'creer/');
            poster(url, donnees)
                .then(function () {
                    toast(id ? 'Point modifié.' : 'Point ajouté.', 'succes');
                    fermerModale();
                    U.etat.page = 1;
                    charger();
                })
                .catch(function (err) {
                    toast(err.message || 'Erreur lors de l\'enregistrement.', 'erreur');
                });
        }

        function confirmerSuppression(ids) {
            var liste = ids || selectionIds();
            if (!liste || !liste.length) {
                toast('Aucun point sélectionné.', 'info');
                return;
            }
            var n = liste === null ? U.donnees.count : liste.length;
            if (!window.confirm('Supprimer ' + n + ' point(s) ? Cette action est irréversible.')) return;
            poster(URL_API + 'supprimer/', {ids: liste === null ? (U.donnees.results || []).map(function (p) { return p.id; }) : liste})
                .then(function () {
                    toast(n + ' point(s) supprimé(s).', 'succes');
                    U.etat.selection = [];
                    U.etat.toutFiltre = false;
                    U.etat.page = 1;
                    charger();
                })
                .catch(function (err) { toast(err.message || 'Erreur de suppression.', 'erreur'); });
        }

        function fermerModale() {
            var modale = elements.modale;
            if (modale) modale.classList.remove('ouvert');
        }

        // ── Export ─────────────────────────────────────────────
        function exporter(format) {
            var ids = selectionIds();
            var params = CORE.assemblerParams(U.etat, {});
            if (ids) params.ids = ids.join(',');
            var qs = new URLSearchParams();
            Object.keys(params).forEach(function (k) {
                if (params[k] !== undefined && params[k] !== null && params[k] !== '') qs.set(k, params[k]);
            });
            var url = URL_API + 'export/' + format + '/?' + qs.toString();
            var a = document.createElement('a');
            a.href = url;
            a.download = '';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }

        // ── Divers ─────────────────────────────────────────────
        function echapper(s) {
            return String(s === null || s === undefined ? '' : s)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        function toast(msg, type) {
            var zone = elements.toasts;
            if (!zone) return;
            var el = document.createElement('div');
            el.className = 'ta-toast ' + (type || 'info');
            el.textContent = msg;
            zone.appendChild(el);
            setTimeout(function () { el.classList.add('sortie'); }, 2600);
            setTimeout(function () { el.remove(); }, 3000);
        }

        function installerResize() {
            var tete = elements.tete;
            if (!tete) return;
            tete.querySelectorAll('.ta-col-resize').forEach(function (poignee) {
                poignee.addEventListener('mousedown', function (ev) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    var th = poignee.closest('th');
                    var debutX = ev.clientX;
                    var largeurInit = th.offsetWidth;
                    function bouger(e) {
                        var largeur = Math.max(48, largeurInit + (e.clientX - debutX));
                        th.style.width = largeur + 'px';
                        th.style.minWidth = largeur + 'px';
                    }
                    function lacher() {
                        document.removeEventListener('mousemove', bouger);
                        document.removeEventListener('mouseup', lacher);
                        document.body.style.cursor = '';
                        document.body.style.userSelect = '';
                    }
                    document.addEventListener('mousemove', bouger);
                    document.addEventListener('mouseup', lacher);
                    document.body.style.cursor = 'col-resize';
                    document.body.style.userSelect = 'none';
                });
            });
        }

        // ── Liaisons ───────────────────────────────────────────
        function lier() {
            elements.recherche.addEventListener('input', debounce(function () {
                U.etat.q = elements.recherche.value.trim();
                U.etat.page = 1;
                charger();
            }, 350));
            elements.recherche.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter') ev.preventDefault();
            });
            elements.tete.addEventListener('change', function (ev) {
                if (ev.target && ev.target.id === 'ta-check-tout') {
                    var coche = ev.target.checked;
                    if (coche) {
                        U.donnees.results.forEach(function (p) {
                            if (U.etat.selection.indexOf(p.id) === -1) U.etat.selection.push(p.id);
                        });
                    } else {
                        U.donnees.results.forEach(function (p) {
                            var idx = U.etat.selection.indexOf(p.id);
                            if (idx !== -1) U.etat.selection.splice(idx, 1);
                        });
                    }
                    U.etat.toutFiltre = false;
                    rendreBarre();
                    rendreEntetes();
                    rendreCorps();
                    majSourceCarteFiltree();
                }
            });
            elements.btnAjout.addEventListener('click', ouvrirAjout);
            elements.btnExportCsv.addEventListener('click', function () { exporter('csv'); });
            elements.btnExportGeo.addEventListener('click', function () { exporter('geojson'); });
            elements.btnExportJson.addEventListener('click', function () { exporter('json'); });
            elements.btnFiltres.addEventListener('click', function () { basculerPanneau(elements.panneauFiltres); });
            elements.btnColonnes.addEventListener('click', function () { basculerPanneau(elements.panneauColonnes); });
            elements.btnStats.addEventListener('click', function () { basculerPanneau(elements.panneauStats); });
            if (elements.filtreSpatial) {
                elements.filtreSpatial.addEventListener('click', function () {
                    activerFiltreSpatial(!U.etat.bbox);
                });
            }
            elements.btnToutSelectionner.addEventListener('click', function () {
                U.etat.toutFiltre = true;
                U.etat.selection = [];
                rendreBarre();
                rendreEntetes();
                majCarte();
            });
            if (elements.btnCarteSelection) {
                elements.btnCarteSelection.addEventListener('click', function () {
                    U.etat.carteSelection = !U.etat.carteSelection;
                    majBoutonCarteSelection();
                    majSourceCarteFiltree();
                });
            }
            elements.btnSelectionFiltre.addEventListener('click', function () {
                var f = JSON.parse(localStorage.getItem('mukmap_ta_filtres') || 'null') || [];
                U.etat.filtres = f;
                U.etat.logique = 'et';
                U.etat.page = 1;
                charger();
            });
            lierPanneauFiltres();
            elements.btnReinit.addEventListener('click', function () {
                U.etat = Object.assign(U.etat, {
                    q: '', page: 1, filtres: [], logique: 'et', bbox: null,
ids: null, selection: [], toutFiltre: false, carteSelection: false,
                    tri: {champ: 'date_creation', direction: 'desc'}
                });
                elements.recherche.value = '';
                if (elements.filtreSpatial) elements.filtreSpatial.classList.remove('actif');
                majBoutonCarteSelection();
                majSourceCarteFiltree();
                if (U.carte && U.cartePrete) U.carte.off('moveend', onDeplacementCarte);
                localStorage.removeItem('mukmap_ta_filtres');
                charger();
            });
            if (elements.btnCSVComplet) elements.btnCSVComplet.addEventListener('click', function () { exporter('csv'); });
        }

        function debounce(fn, delai) {
            var timer = null;
            return function () {
                clearTimeout(timer);
                timer = setTimeout(fn, delai);
            };
        }

        function lierPanneauFiltres() {
            var champ = elements.filtreChamp;
            var op = elements.filtreOp;
            var logique = elements.filtreLogique;
            var ajouter = elements.filtreAjouter;
            var conteneur = elements.filtreValeursZone;
            if (!champ || !ajouter || !conteneur) return;

            function mettreAJourUI() {
                var c = champ.value;
                var t = CORE.TYPE_CHAMPS[c] || 'text';
                if (c.indexOf('d:') === 0) t = 'json';
                op.innerHTML = '';
                OPS.forEach(function (o) {
                    if (o.v === 'entre' && t === 'json') return;
                    op.appendChild(new Option(o.l, o.v));
                });
                var fac = (U.donnees.facettes || {})[c];
                var bloc = '<input id="ta-f-valeur" class="ta-in" placeholder="valeur" ' +
                    (t === 'nb' ? 'type="number" step="any"' : t === 'date' ? 'type="date"' : '') + '>';
                if (fac && fac.length && t !== 'json') {
                    var opts = '<option value="">… choisir une valeur …</option>';
                    fac.forEach(function (f) {
                        opts += '<option value="' + echapper(f.valeur) + '">' + echapper(f.valeur) + ' (' + f.total + ')</option>';
                    });
                    bloc = '<select id="ta-f-valeur" class="ta-in">' + opts + '</select>';
                }
                var div = conteneur.querySelector('.ta-f-valeurs');
                if (!div) {
                    div = document.createElement('div');
                    div.className = 'ta-f-valeurs';
                    conteneur.appendChild(div);
                }
                div.innerHTML = bloc + '<input id="ta-f-valeur2" class="ta-in" placeholder="valeur max" ' +
                    (t === 'nb' ? 'type="number" step="any"' : t === 'date' ? 'type="date"' : '') + ' style="display:none">';
                elements.filtreValeur = div.querySelector('#ta-f-valeur');
                elements.filtreValeur2 = div.querySelector('#ta-f-valeur2');
                majVisibilite();
            }

            function majVisibilite() {
                var o = op.value;
                if (elements.filtreValeur) elements.filtreValeur.style.display = (o === 'vide' || o === 'non_vide') ? 'none' : '';
                if (elements.filtreValeur2) elements.filtreValeur2.style.display = o === 'entre' ? '' : 'none';
            }

            champ.addEventListener('change', mettreAJourUI);
            op.addEventListener('change', majVisibilite);
            ajouter.addEventListener('click', function () {
                var c = champ.value;
                if (!c) { toast('Choisissez un champ.', 'info'); return; }
                var o = op.value;
                var v = (elements.filtreValeur ? elements.filtreValeur.value : '') || '';
                var v2 = elements.filtreValeur2 ? elements.filtreValeur2.value : '';
                var f;
                if (o === 'entre') f = {champ: c, op: o, valeur: [v, v2]};
                else if (o === 'vide' || o === 'non_vide') f = {champ: c, op: o, valeur: ''};
                else f = {champ: c, op: o, valeur: v};
                U.etat.filtres.push(f);
                U.etat.logique = logique.value || 'et';
                try { localStorage.setItem('mukmap_ta_filtres', JSON.stringify(U.etat.filtres)); } catch (e) { /* */ }
                U.etat.page = 1;
                charger();
            });
            mettreAJourUI();
        }

        function basculerPanneau(panneau) {
            if (!panneau) return;
            var ouvert = panneau.classList.contains('ouvert');
            [elements.panneauFiltres, elements.panneauColonnes, elements.panneauStats].forEach(function (p) {
                if (p && p !== panneau) p.classList.remove('ouvert');
            });
            panneau.classList.toggle('ouvert', !ouvert);
        }

        // ── Références DOM ─────────────────────────────────────
        function collecter() {
            return {
                tete: chercher('.ta-tete'),
                corps: chercher('.ta-corps'),
                pagination: chercher('.ta-pagination'),
                barre: chercher('.ta-barre'),
                statsBadge: chercher('.ta-stats-badge'),
                recherche: chercher('.ta-recherche'),
                chrg: chercher('.ta-chargement'),
                checkTout: chercher('#ta-check-tout'),
                btnAjout: chercher('[data-outil="ajout"]'),
                btnExportCsv: chercher('[data-outil="export-csv"]'),
                btnExportGeo: chercher('[data-outil="export-geojson"]'),
                btnExportJson: chercher('[data-outil="export-json"]'),
                btnFiltres: chercher('[data-outil="filtres"]'),
                btnColonnes: chercher('[data-outil="colonnes"]'),
                btnStats: chercher('[data-outil="stats"]'),
                btnToutSelectionner: chercher('[data-outil="tout-selectionner"]'),
                btnCarteSelection: chercher('[data-outil="carte-selection"]'),
                btnSelectionFiltre: chercher('[data-outil="selection-filtre"]'),
                btnReinit: chercher('[data-outil="reinitialiser"]'),
                btnCSVComplet: chercher('[data-outil="export-csv-complet"]'),
                filtreSpatial: chercher('[data-outil="filtre-spatial"]'),
                panneauFiltres: chercher('.ta-panneau-filtres'),
                panneauColonnes: chercher('.ta-panneau-colonnes'),
                panneauStats: chercher('.ta-panneau-stats'),
                filtresListe: chercher('.ta-filtres-liste'),
                colonnesListe: chercher('.ta-colonnes-liste'),
                statsCorps: chercher('.ta-stats-corps'),
                filtreChamp: chercher('.ta-f-champ'),
                filtreOp: chercher('.ta-f-op'),
                filtreValeur: chercher('.ta-f-valeur'),
                filtreValeur2: chercher('.ta-f-valeur2'),
                filtreValeursZone: chercher('.ta-f-valeurs-zone'),
                filtreLogique: chercher('.ta-f-logique'),
                filtreAjouter: chercher('.ta-f-ajouter'),
                modale: chercher('.ta-modale'),
                toasts: chercher('.ta-toasts')
            };
        }

        elements = collecter();
        initCarte();
        lier();
        charger();
        return {
            api: CORE,
            etat: U,
            detruire: function () {
                if (U.carte) U.carte.remove();
                root.innerHTML = '';
            },
            rafraichir: charger
        };
    }

    global.TableAttributaire = {CORE: CORE, demarrer: demarrer};
})(typeof window !== 'undefined' ? window : globalThis);
