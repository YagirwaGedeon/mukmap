/* MUKMAP — Mode hors connexion
 * Moteur pur (testable sous Node) + installeur DOM (IndexedDB, badge de
 * statut, téléchargement de zone, collecte hors ligne, synchronisation
 * bidirectionnelle et résolution de conflits).
 */
(function (global) {
    'use strict';

    // ─── MOTEUR PUR ────────────────────────────────────────────────
    var CORE = {
        // Identifiant client unique (uuid v4 sans dépendance)
        uuid: function () {
            if (global.crypto && global.crypto.getRandomValues) {
                var b = global.crypto.getRandomValues(new Uint8Array(16));
                b[6] = (b[6] & 0x0f) | 0x40;
                b[8] = (b[8] & 0x3f) | 0x80;
                var h = '';
                for (var i = 0; i < 16; i++) {
                    h += (i === 4 || i === 6 || i === 8 || i === 10 ? '-' : '') +
                        ('0' + b[i].toString(16)).slice(-2);
                }
                return h;
            }
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                var r = Math.random() * 16 | 0;
                var v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        },

        // Construit une opération locale {uuid, type, id|null, synchro_id,
        // base_updated, point} — `uuid` est la clé du store IndexedDB.
        fabriquerOp: function (type, point, baseUpdated) {
            point = point || {};
            return {
                uuid: CORE.uuid(),
                type: type,
                id: point.id !== undefined ? point.id : null,
                synchro_id: point.synchro_id || CORE.uuid(),
                base_updated: baseUpdated || null,
                point: point
            };
        },

        // Sérialise une opération locale pour l'API (champ « point » nettoyé)
        envoyer: function (op) {
            return {
                type: op.type,
                id: op.id !== undefined ? op.id : null,
                base_updated: op.base_updated || null,
                point: CORE.pointPourEnvoi(op.point || {})
            };
        },

        // État d'affichage du badge : {libelle, classe, priorite}
        statut: function (estEnLigne, nbPendants, nbConflits, derniereErreur) {
            if (derniereErreur) {
                return {libelle: 'Erreur de synchronisation', classe: 'erreur', priorite: 4};
            }
            if (!estEnLigne) {
                return {libelle: 'Hors ligne' + (nbPendants ? ' · ' + nbPendants + ' en attente' : ''),
                        classe: 'horsligne', priorite: 3};
            }
            if (nbConflits > 0) {
                return {libelle: nbConflits + ' conflit(s) à résoudre', classe: 'conflit', priorite: 2};
            }
            if (nbPendants > 0) {
                return {libelle: nbPendants + ' en attente de synchronisation', classe: 'attente', priorite: 1};
            }
            return {libelle: 'Synchronisé', classe: 'sync', priorite: 0};
        },

        // Applique les pulls serveur à la liste locale (par id).
        // Les pulls « supprime » retirent le point.
        fusionnerPulls: function (locaux, pulls) {
            var parId = {};
            locaux.forEach(function (p) { parId[p.id] = p; });
            (pulls || []).forEach(function (pull) {
                var p = pull.point;
                if (!p || p.id === undefined) return;
                if (pull.type === 'supprime') {
                    delete parId[p.id];
                    return;
                }
                parId[p.id] = p;
            });
            return Object.keys(parId).map(function (k) { return parId[k]; });
        },

        // Résout un conflit : retourne la nouvelle opération à envoyer,
        // ou null pour abandonner (garder la version serveur).
        //   conflit = {id, type, version_serveur: {...}}
        //   choix = 'local' | 'serveur'
        //   pointLocal = la version locale du point (si connue)
        resoudreConflit: function (conflit, choix, pointLocal) {
            if (choix !== 'local') return null; // garder la version serveur : rien à envoyer
            var id = conflit.id;
            if (conflit.type === 'supprime' || conflit.type === 'modifie' && !pointLocal) {
                // L'utilisateur veut supprimer localement / garder sa suppression
                return {
                    uuid: CORE.uuid(), type: 'supprime', id: id, synchro_id: '',
                    base_updated: conflit.version_serveur && conflit.version_serveur.updated_at,
                    point: {}
                };
            }
            // Forcer l'écriture locale : base_updated = version serveur → pas de nouveau conflit
            return CORE.fabriquerOp('modifie', pointLocal || {},
                                    conflit.version_serveur && conflit.version_serveur.updated_at);
        },

        // Normalise une bbox [ouest, sud, est, nord] (bornée et cohérente)
        normaliserBbox: function (bbox) {
            if (!Array.isArray(bbox) || bbox.length < 4) return null;
            var w = parseFloat(bbox[0]), s = parseFloat(bbox[1]);
            var e = parseFloat(bbox[2]), n = parseFloat(bbox[3]);
            if ([w, s, e, n].some(function (x) { return isNaN(x); })) return null;
            return [
                Math.max(-180, Math.min(180, w)),
                Math.max(-85, Math.min(85, s)),
                Math.max(-180, Math.min(180, e)),
                Math.max(-85, Math.min(85, n))
            ];
        },

        // Pages nécessaires pour télécharger une zone (page_size fixe)
        pagesPourZone: function (count, pageSize) {
            return count ? Math.max(1, Math.ceil(count / pageSize)) : 1;
        },

        // Sérialise un point pour l'envoi (champs utiles, sans bruit serveur)
        pointPourEnvoi: function (p) {
            var envoyable = {};
            ['nom', 'description', 'latitude', 'longitude', 'categorie', 'statut',
             'province', 'commune', 'quartier', 'donnees', 'source_fichier', 'source_format']
                .forEach(function (cle) {
                    if (p[cle] !== undefined && p[cle] !== null) envoyable[cle] = p[cle];
                });
            if (p.synchro_id) envoyable.synchro_id = p.synchro_id;
            return envoyable;
        },

        // Détermine si une modification locale est en conflit avec un pull serveur
        enConflit: function (op, pullServeur) {
            if (!op || !pullServeur || !pullServeur.point) return false;
            if (pullServeur.type === 'supprime') return op.type !== 'supprime';
            var base = op.base_updated;
            var serveur = pullServeur.point.updated_at;
            if (!base || !serveur) return false;
            return String(serveur) > String(base);
        }
    };

    // ─── INSTALLEUR DOM ─────────────────────────────────────────────
    function demarrer(opts) {
        opts = opts || {};
        var URL_SYNC = opts.urlSync || '/api/offline/sync/';
        var URL_API = opts.urlApi || '/api/table-points/';
        var CSRF = opts.csrf || '';
        var PAGE_SIZE = opts.pageSize || 200;
        var carte = opts.carte || null;
        var ancre = typeof opts.ancre === 'string' ? document.querySelector(opts.ancre) : opts.ancre;
        if (!ancre && typeof document !== 'undefined' && opts.creerAncre) {
            // Ancre auto : bouton flottant bas-droite (au-dessus du GPS)
            ancre = document.createElement('div');
            ancre.id = 'mukmap-offline-ancre';
            ancre.style.cssText = 'position:fixed;bottom:20px;right:76px;z-index:1150;';
            document.body.appendChild(ancre);
        }
        if (!ancre) return null;

        var db = null;
        var etat = {
            enLigne: typeof navigator !== 'undefined' ? navigator.onLine : true,
            pendants: [], conflits: [], derniereErreur: null,
            derniereSync: null, enCours: false
        };
        var elements = {};
        var listeZones = [];
        var compteurIdTemp = 0;

        // ── IndexedDB ──────────────────────────────────────────────
        function ouvrirBase() {
            return new Promise(function (resoudre, rejeter) {
                if (db) return resoudre(db);
                if (typeof indexedDB === 'undefined') return rejeter(new Error('IndexedDB indisponible'));
                var req = indexedDB.open('mukmap_offline', 1);
                req.onupgradeneeded = function (ev) {
                    var bd = ev.target.result;
                    if (!bd.objectStoreNames.contains('points')) {
                        bd.createObjectStore('points', {keyPath: 'id'});
                    }
                    if (!bd.objectStoreNames.contains('operations')) {
                        bd.createObjectStore('operations', {keyPath: 'uuid'});
                    }
                    if (!bd.objectStoreNames.contains('meta')) {
                        bd.createObjectStore('meta', {keyPath: 'cle'});
                    }
                };
                req.onsuccess = function (ev) {
                    db = ev.target.result;
                    resoudre(db);
                };
                req.onerror = function () { rejeter(req.error); };
            });
        }

        function tx(store, mode, corps) {
            return ouvrirBase().then(function (bd) {
                return new Promise(function (resoudre, rejeter) {
                    var t = bd.transaction(store, mode);
                    var magasin = t.objectStore(store);
                    var resultat = corps(magasin);
                    t.oncomplete = function () { resoudre(resultat); };
                    t.onerror = function () { rejeter(t.error); };
                });
            });
        }

        function lireTout(store) {
            return tx(store, 'readonly', function (m) { return m.getAll(); });
        }

        function lireMeta(cle, defaut) {
            return tx('meta', 'readonly', function (m) {
                return new Promise(function (resoudre) {
                    var r = m.get(cle);
                    r.onsuccess = function () { resoudre(r.result ? r.result.valeur : defaut); };
                });
            });
        }

        function ecrireMeta(cle, valeur) {
            return tx('meta', 'readwrite', function (m) { m.put({cle: cle, valeur: valeur}); });
        }

        function toutEffacer(store) {
            return tx(store, 'readwrite', function (m) { m.clear(); });
        }

        // ── Rendu du badge de statut ───────────────────────────────
        function construireBadge() {
            var div = document.createElement('div');
            div.className = 'mukmap-offline';
            div.innerHTML = '<button class="mukmap-offline-badge" title="Mode hors connexion">' +
                '<span class="mukmap-offline-point"></span>' +
                '<span class="mukmap-offline-libelle">…</span></button>' +
                '<div class="mukmap-offline-panneau"></div>';
            ancre.appendChild(div);
            elements.badge = div.querySelector('.mukmap-offline-badge');
            elements.libelle = div.querySelector('.mukmap-offline-libelle');
            elements.panneau = div.querySelector('.mukmap-offline-panneau');
            elements.badge.addEventListener('click', basculerPanneau);
            majBadge();
        }

        function majBadge() {
            if (!elements.libelle) return;
            var s = CORE.statut(etat.enLigne, etat.pendants.length, etat.conflits.length, etat.derniereErreur);
            elements.badge.classList.toggle('horsligne', s.classe === 'horsligne');
            elements.badge.classList.toggle('attente', s.classe === 'attente');
            elements.badge.classList.toggle('conflit', s.classe === 'conflit');
            elements.badge.classList.toggle('erreur', s.classe === 'erreur');
            elements.badge.classList.toggle('sync', s.classe === 'sync');
            elements.libelle.textContent = s.libelle;
            elements.badge.title = s.libelle;
        }

        function basculerPanneau() {
            if (!elements.panneau) return;
            var ouvert = elements.panneau.classList.contains('ouvert');
            elements.panneau.classList.toggle('ouvert', !ouvert);
            if (!ouvert) rendrePanneau();
        }

        // ── Panneau ────────────────────────────────────────────────
        function rendrePanneau() {
            var p = elements.panneau;
            p.innerHTML = '<div class="mukmap-offline-entete">Mode hors connexion</div>' +
                '<div class="mukmap-offline-actions">' +
                '<button data-act="telecharger">⬇ Télécharger la zone visible</button>' +
                '<button data-act="synchroniser">⟳ Synchroniser maintenant</button>' +
                '<button data-act="vider">🗑 Effacer les données locales</button></div>' +
                '<div class="mukmap-offline-infos">' +
                '<div>Points locaux : <b id="off-nb-points">0</b></div>' +
                '<div>En attente : <b id="off-nb-pendants">0</b></div>' +
                '<div>Conflits : <b id="off-nb-conflits">0</b></div>' +
                '<div>Dernière sync : <b id="off-dernier-sync">jamais</b></div></div>' +
                '<div class="mukmap-offline-conflits"></div>' +
                '<div class="mukmap-offline-message"></div>';
            p.querySelector('[data-act="telecharger"]').addEventListener('click', telechargerZoneVisible);
            p.querySelector('[data-act="synchroniser"]').addEventListener('click', synchroniser);
            p.querySelector('[data-act="vider"]').addEventListener('click', viderLocal);
            rafraichirPanneau();
        }

        function rafraichirPanneau() {
            lireTout('points').then(function (points) {
                var nb = elements.panneau.querySelector('#off-nb-points');
                if (nb) nb.textContent = points.length;
            }).catch(function () { /* */ });
            lireMeta('derniere_sync', null).then(function (v) {
                var el = elements.panneau.querySelector('#off-dernier-sync');
                if (el) el.textContent = v ? v.slice(0, 19).replace('T', ' ') : 'jamais';
            });
            var pend = elements.panneau.querySelector('#off-nb-pendants');
            if (pend) pend.textContent = etat.pendants.length;
            var conf = elements.panneau.querySelector('#off-nb-conflits');
            if (conf) conf.textContent = etat.conflits.length;
            rendreConflits();
        }

        function rendreConflits() {
            var zone = elements.panneau.querySelector('.mukmap-offline-conflits');
            if (!zone) return;
            if (!etat.conflits.length) {
                zone.innerHTML = '';
                return;
            }
            zone.innerHTML = '<div class="mukmap-offline-titre">Conflits à résoudre</div>';
            etat.conflits.forEach(function (c, i) {
                var s = c.version_serveur || {};
                var div = document.createElement('div');
                div.className = 'mukmap-offline-conflit';
                div.innerHTML = '<div class="mukmap-offline-conflit-nom">« ' + echapper(s.nom || ('#' + c.id)) + ' »</div>' +
                    '<div class="mukmap-offline-conflit-actions">' +
                    '<button data-choix="local">Garder ma version</button>' +
                    '<button data-choix="serveur">Garder la version serveur</button></div>';
                div.querySelector('[data-choix="local"]').addEventListener('click', function () {
                    resoudreConflit(c, 'local');
                });
                div.querySelector('[data-choix="serveur"]').addEventListener('click', function () {
                    resoudreConflit(c, 'serveur');
                });
                zone.appendChild(div);
            });
        }

        function message(texte, type) {
            var el = elements.panneau.querySelector('.mukmap-offline-message');
            if (!el) return;
            el.textContent = texte;
            el.className = 'mukmap-offline-message ' + (type || 'info');
            clearTimeout(el._t);
            el._t = setTimeout(function () { el.textContent = ''; }, 6000);
        }

        // ── Téléchargement de zone ─────────────────────────────────
        function telechargerZoneVisible() {
            if (!carte || etat.enCours) return;
            var b = carte.getBounds();
            var bbox = CORE.normaliserBbox([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
            if (!bbox) { message('Impossible de déterminer la zone.', 'erreur'); return; }
            etat.enCours = true;
            message('Téléchargement de la zone en cours…', 'info');
            var qs = new URLSearchParams({bbox: bbox.join(','), page_size: String(PAGE_SIZE), page: '1'});
            fetch(URL_API + '?' + qs.toString(), {headers: {'X-Requested-With': 'XMLHttpRequest'}})
                .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
                .then(function (premier) {
                    var pages = CORE.pagesPourZone(premier.count, PAGE_SIZE);
                    var requetes = [Promise.resolve(premier)];
                    for (var p = 2; p <= pages; p++) {
                        var q2 = new URLSearchParams({bbox: bbox.join(','), page_size: String(PAGE_SIZE), page: String(p)});
                        requetes.push(fetch(URL_API + '?' + q2.toString(), {headers: {'X-Requested-With': 'XMLHttpRequest'}})
                            .then(function (r) { return r.json(); }));
                    }
                    return Promise.all(requetes);
                })
                .then(function (reponses) {
                    var points = [];
                    reponses.forEach(function (r) { points = points.concat(r.results || []); });
                    return lireTout('points').then(function (existants) {
                        var parId = {};
                        existants.forEach(function (x) { parId[x.id] = x; });
                        points.forEach(function (x) { parId[x.id] = x; });
                        var fusion = Object.keys(parId).map(function (k) { return parId[k]; });
                        return tx('points', 'readwrite', function (m) {
                            fusion.forEach(function (pt) { m.put(pt); });
                        }).then(function () { return fusion; });
                    });
                })
                .then(function () {
                    return ecrireMeta('derniere_zone', {
                        bbox: bbox, date: new Date().toISOString(), count: null
                    });
                })
                .then(function () {
                    etat.enCours = false;
                    message('Zone téléchargée : ' + bbox.join(', '), 'succes');
                    rafraichirPanneau();
                    majBadge();
                    surlignerZone(bbox);
                })
                .catch(function (err) {
                    etat.enCours = false;
                    console.error(err);
                    message('Échec du téléchargement : ' + err.message, 'erreur');
                });
        }

        function surlignerZone(bbox) {
            if (!carte) return;
            if (carte.getSource('mukmap-zone')) {
                carte.removeLayer('mukmap-zone-couche');
                carte.removeSource('mukmap-zone');
            }
            carte.addSource('mukmap-zone', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: [{type: 'Feature', properties: {}, geometry: {
                        type: 'Polygon',
                        coordinates: [[
                            [bbox[0], bbox[1]], [bbox[2], bbox[1]],
                            [bbox[2], bbox[3]], [bbox[0], bbox[3]], [bbox[0], bbox[1]]
                        ]]
                    }}]
                }
            });
            carte.addLayer({
                id: 'mukmap-zone-couche', type: 'line', source: 'mukmap-zone',
                layout: {'line-cap': 'round'},
                paint: {'line-color': '#22c55e', 'line-width': 2.5, 'line-dasharray': [3, 2], 'line-opacity': 0.9}
            });
        }

        // ── Collecte hors connexion ────────────────────────────────
        // Ajoute (ou met à jour) un point localement ; s'il est en ligne
        // et sans conflit, synchronisation immédiate.
        function enregistrerLocalement(point, baseUpdated, type) {
            var estCreation = point.id === undefined || point.id === null;
            // Nouveau point : identifiant local temporaire négatif (remappé
            // par le serveur à la première synchronisation).
            var pointLocal = JSON.parse(JSON.stringify(point));
            if (estCreation) {
                pointLocal.id = --compteurIdTemp;
                pointLocal.synchro_id = pointLocal.synchro_id || CORE.uuid();
                pointLocal.temporaire = true;
            } else {
                type = 'modifie';
            }
            var op = CORE.fabriquerOp(estCreation ? 'cree' : type,
                                      CORE.pointPourEnvoi(pointLocal), baseUpdated);
            if (estCreation) op.synchro_id = pointLocal.synchro_id;
            return lireTout('points').then(function (points) {
                var parId = {};
                points.forEach(function (x) { parId[x.id] = x; });
                parId[pointLocal.id] = pointLocal;
                var fusion = Object.keys(parId).map(function (k) { return parId[k]; });
                return tx('points', 'readwrite', function (m) {
                    fusion.forEach(function (x) { m.put(x); });
                }).then(function () {
                    return tx('operations', 'readwrite', function (m) { m.put(op); });
                }).then(function () {
                    etat.pendants.push(op);
                    rafraichirPanneau();
                    majBadge();
                    if (etat.enLigne) return synchroniser();
                });
            });
        }

        // Réattribue un identifiant serveur aux points locaux temporaires
        // après une création réussie.
        function remapperIdsLocaux(mapping) {
            if (!mapping || !Object.keys(mapping).length) return Promise.resolve();
            return lireTout('points').then(function (points) {
                // Les points temporaires confirmés sont retirés : la version
                // serveur (avec son vrai identifiant) arrive par le pull.
                var restants = points.filter(function (x) {
                    return !(x.temporaire && mapping[x.synchro_id]);
                });
                return tx('points', 'readwrite', function (m) {
                    points.forEach(function (x) {
                        if (x.temporaire && mapping[x.synchro_id]) m.delete(x.id);
                    });
                    restants.forEach(function (x) { m.put(x); });
                });
            });
        }

        // ── Synchronisation ────────────────────────────────────────
        function synchroniser() {
            if (etat.enCours) return Promise.resolve();
            if (!etat.enLigne) {
                message('Hors ligne : synchronisation impossible.', 'erreur');
                return Promise.resolve();
            }
            etat.enCours = true;
            etat.derniereErreur = null;
            return lireTout('operations').then(function (ops) {
                var corps = {operations: ops.map(function (o) { return CORE.envoyer(o); })};
                return lireMeta('derniere_sync', null).then(function (v) {
                    corps.dernier_sync = v;
                    return fetch(URL_SYNC, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json', 'X-CSRFToken': CSRF},
                        body: JSON.stringify(corps)
                    });
                });
            }).then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            }).then(function (data) {
                // Applique les résultats
                var okIds = {};
                (data.ok || []).forEach(function (res) {
                    if (res.type === 'cree' && res.synchro_id) okIds[res.synchro_id] = res.id;
                });
                return lireTout('operations').then(function (ops) {
                    var reste = ops.filter(function (o) {
                        if (o.type === 'cree' && okIds[o.synchro_id]) return false;
                        return !(data.ok || []).some(function (res) {
                            return res.type === o.type && res.id === o.id;
                        });
                    });
                    return tx('operations', 'readwrite', function (m) {
                        ops.forEach(function (o) { m.delete(o.uuid); });
                        reste.forEach(function (o) { m.put(o); });
                    }).then(function () { return reste; });
                }).then(function (reste) {
                    // Remplace les points temporaires par leur version serveur
                    return remapperIdsLocaux(okIds).then(function () { return reste; });
                }).then(function (reste) {
                    etat.pendants = reste;
                    // Conflits
                    etat.conflits = (data.conflits || []).map(function (c) {
                        return {id: c.id, type: c.type, raison: c.raison, version_serveur: c.version_serveur || {}};
                    });
                    if (data.conflits && data.conflits.length) etat.derniereErreur = null;
                    // Pull
                    if (data.pulls && data.pulls.length) {
                        return lireTout('points').then(function (locaux) {
                            return tx('points', 'readwrite', function (m) {
                                CORE.fusionnerPulls(locaux, data.pulls).forEach(function (p) { m.put(p); });
                            });
                        });
                    }
                }).then(function () {
                    return ecrireMeta('derniere_sync', data.horloge || new Date().toISOString());
                }).then(function () {
                    etat.enCours = false;
                    rafraichirPanneau();
                    majBadge();
                    if (etat.conflits.length) {
                        message(etat.conflits.length + ' conflit(s) détecté(s) : résolvez-les ci-dessous.', 'conflit');
                    } else {
                        message('Synchronisation réussie.', 'succes');
                    }
                });
            }).catch(function (err) {
                etat.enCours = false;
                etat.derniereErreur = err.message;
                console.error('Sync :', err);
                majBadge();
                rafraichirPanneau();
                message('Échec de la synchronisation : ' + err.message, 'erreur');
            });
        }

        // Résout un conflit puis réessaie la synchro
        function resoudreConflit(conflit, choix) {
            var local = null;
            lireTout('points').then(function (points) {
                local = points.find(function (p) { return p.id === conflit.id; }) || null;
                var nouvelleOp = CORE.resoudreConflit(conflit, choix, local);
                etat.conflits = etat.conflits.filter(function (c) { return c.id !== conflit.id; });
                if (nouvelleOp === null) {
                    // Garder la version serveur : retirer les opérations locales concernées
                    return lireTout('operations').then(function (ops) {
                        var reste = ops.filter(function (o) {
                            return !(o.id === conflit.id && o.type === conflit.type);
                        });
                        return tx('operations', 'readwrite', function (m) {
                            reste.forEach(function (o) { m.put(o); });
                        }).then(function () {
                            etat.pendants = reste;
                            // Met à jour la copie locale avec la version serveur
                            return lireTout('points').then(function (pts) {
                                var parId = {};
                                pts.forEach(function (x) { parId[x.id] = x; });
                                var s = conflit.version_serveur || {};
                                parId[conflit.id] = s;
                                var fusion = Object.keys(parId).map(function (k) { return parId[k]; });
                                return tx('points', 'readwrite', function (m) {
                                    fusion.forEach(function (x) { m.put(x); });
                                });
                            });
                        });
                    });
                }
                // Garder la version locale : envoyer la nouvelle opération
                return tx('operations', 'readwrite', function (m) {
                    m.put(nouvelleOp);
                }).then(function () {
                    etat.pendants.push(nouvelleOp);
                });
            }).then(function () {
                rafraichirPanneau();
                majBadge();
                return synchroniser();
            }).catch(function (err) {
                console.error(err);
                message(err.message, 'erreur');
            });
        }

        // ── Nettoyage ──────────────────────────────────────────────
        function viderLocal() {
            Promise.all([toutEffacer('points'), toutEffacer('operations')])
                .then(function () {
                    etat.pendants = [];
                    etat.conflits = [];
                    etat.derniereSync = null;
                    rafraichirPanneau();
                    majBadge();
                    effacerCouche();
                    message('Données locales effacées.', 'succes');
                });
        }

        function effacerCouche() {
            if (carte && carte.getSource('mukmap-zone')) {
                carte.removeLayer('mukmap-zone-couche');
                carte.removeSource('mukmap-zone');
            }
            if (carte && carte.getSource('mukmap-local')) {
                carte.removeLayer('mukmap-local-couche');
                carte.removeSource('mukmap-local');
            }
        }

        // ── Divers ─────────────────────────────────────────────────
        function echapper(s) {
            return String(s === null || s === undefined ? '' : s)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        // ── Liaisons globales ──────────────────────────────────────
        function lier() {
            window.addEventListener('online', function () {
                etat.enLigne = true;
                majBadge();
                synchroniser();
            });
            window.addEventListener('offline', function () {
                etat.enLigne = false;
                majBadge();
            });
        }

        // ── Lancement ──────────────────────────────────────────────
        function init() {
            construireBadge();
            lier();
            ouvrirBase()
                .then(function () {
                    return Promise.all([
                        lireTout('operations'),
                        lireMeta('derniere_sync', null)
                    ]);
                })
                .then(function (results) {
                    etat.pendants = results[0];
                    etat.derniereSync = results[1];
                    majBadge();
                })
                .catch(function (err) {
                    console.error('Mode hors connexion :', err);
                    etat.derniereErreur = err.message;
                    majBadge();
                });
        }

        var css = 'mukmap-offline';
        if (!document.getElementById('mukmap-offline-style')) {
            var style = document.createElement('style');
            style.id = 'mukmap-offline-style';
            style.textContent = [
                '.' + css + ' { position: relative; }',
                '.' + css + '-badge { display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 12px; border-radius: 10px; font-size: .7rem; font-weight: 700; background: var(--bg-2, #171a2e); border: 1px solid var(--border, #2a2f52); color: var(--text-2, #a3a9d0); cursor: pointer; white-space: nowrap; }',
                '.' + css + '-badge:hover { border-color: var(--accent, #6d5df6); color: var(--text, #eef0ff); }',
                '.' + css + '-point { width: 8px; height: 8px; border-radius: 50%; background: var(--text-3, #6b729c); }',
                '.' + css + '-badge.sync .mukmap-offline-point { background: #22c55e; box-shadow: 0 0 6px #22c55e; }',
                '.' + css + '-badge.attente .mukmap-offline-point { background: #f59e0b; box-shadow: 0 0 6px #f59e0b; }',
                '.' + css + '-badge.conflit .mukmap-offline-point { background: #ef4444; box-shadow: 0 0 6px #ef4444; }',
                '.' + css + '-badge.erreur .mukmap-offline-point { background: #ef4444; }',
                '.' + css + '-badge.horsligne .mukmap-offline-point { background: #6b7280; }',
                '.' + css + '-panneau { position: absolute; top: calc(100% + 8px); right: 0; width: 330px; background: var(--bg-2, #171a2e); border: 1px solid var(--border-2, #343a63); border-radius: 14px; box-shadow: 0 10px 40px rgba(0,0,0,.45); padding: 14px; display: none; z-index: 1200; max-height: 70vh; overflow: auto; color: var(--text, #eef0ff); font-size: .78rem; }',
                '.' + css + '-panneau.ouvert { display: block; }',
                '.' + css + '-entete { font-weight: 800; font-size: .85rem; margin-bottom: 10px; }',
                '.' + css + '-actions { display: grid; gap: 6px; margin-bottom: 10px; }',
                '.' + css + '-actions button { padding: 8px 12px; border-radius: 9px; background: var(--bg-3, #1f2340); color: var(--text, #eef0ff); border: 1px solid var(--border, #2a2f52); font-size: .75rem; font-weight: 600; cursor: pointer; }',
                '.' + css + '-actions button:hover { border-color: var(--accent, #6d5df6); }',
                '.' + css + '-infos { display: grid; gap: 4px; background: var(--bg-3, #1f2340); border: 1px solid var(--border, #2a2f52); border-radius: 10px; padding: 10px; margin-bottom: 10px; }',
                '.' + css + '-titre { font-weight: 700; margin: 8px 0 6px; color: var(--text-2, #a3a9d0); }',
                '.' + css + '-conflit { background: rgba(239,68,68,.08); border: 1px solid rgba(239,68,68,.35); border-radius: 10px; padding: 8px 10px; margin-bottom: 6px; }',
                '.' + css + '-conflit-nom { font-weight: 700; margin-bottom: 6px; }',
                '.' + css + '-conflit-actions { display: flex; gap: 6px; }',
                '.' + css + '-conflit-actions button { flex: 1; padding: 6px 8px; border-radius: 8px; background: var(--bg-3, #1f2340); border: 1px solid var(--border, #2a2f52); color: var(--text, #eef0ff); font-size: .7rem; cursor: pointer; }',
                '.' + css + '-message { min-height: 18px; font-size: .72rem; color: var(--text-2, #a3a9d0); margin-top: 8px; }',
                '.' + css + '-message.succes { color: #22c55e; }',
                '.' + css + '-message.erreur { color: #ef4444; }',
                '.' + css + '-message.conflit { color: #f59e0b; }'
            ].join('\n');
            document.head.appendChild(style);
        }

        init();
        return {
            api: CORE,
            etat: etat,
            telechargerZoneVisible: telechargerZoneVisible,
            synchroniser: synchroniser,
            enregistrerLocalement: enregistrerLocalement,
            detruire: function () {
                if (elements.panneau) elements.panneau.remove();
                effacerCouche();
            }
        };
    }

    global.MukmapOffline = {CORE: CORE, demarrer: demarrer};
})(typeof window !== 'undefined' ? window : globalThis);