/* MUKMAP — Widget météo automatique.
 * Modes :
 *  - « bloc » : conteneur #widget-meteo (dashboard, formulaire d'activité).
 *  - « panneau » : carte (présence de #map sans #widget-meteo) → bouton rond
 *    #mukmap-meteo-ancre + panneau .mukmap-meteo.
 *
 * Fiabilité :
 *  - Position : dernier fix GPS récent (window.__gpsDernierFix) sinon geolocation ;
 *    refus d'autorisation / erreur → message clair + bouton réessayer.
 *  - Données : GET /api/meteo/ (proxy serveur Open-Meteo, cache 10 min côté serveur).
 *  - Hors connexion ou erreur : dernier relevé local (IndexedDB) affiché avec un
 *    badge explicite « cache / hors ligne » — jamais présenté comme temps réel.
 *  - Formulaire d'activité : snapshot envoyé au submit (champs cachés meteo_*) ;
 *    si rien n'est disponible, la vue serveur tente un relevé automatique.
 */
(function (w) {
    'use strict';
    if (w.MukmapMeteo) return;

    var DB_NOM = 'mukmap_meteo';
    var DB_VERSION = 1;
    var URL_API = '/api/meteo/';
    var FRAIS_MAX = 10 * 60 * 1000; // un fix GPS reste utilisable 10 min

    var ICONES = { 0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️', 45: '🌫️', 48: '🌫️',
        51: '🌦️', 53: '🌦️', 55: '🌧️', 56: '🌧️', 57: '🌧️',
        61: '🌧️', 63: '🌧️', 65: '🌧️', 66: '🌧️', 67: '🌧️',
        71: '🌨️', 73: '🌨️', 75: '❄️', 77: '🌨️',
        80: '🌦️', 81: '🌧️', 82: '⛈️', 85: '🌨️', 86: '🌨️',
        95: '⛈️', 96: '⛈️', 99: '⛈️' };

    function langue() {
        try {
            var el = document.getElementById('mukmap-i18n-data');
            if (el) return (JSON.parse(el.textContent).langue || 'fr').slice(0, 2);
        } catch (e) { /* ignorer */ }
        return 'fr';
    }

    function t(cle, defaut) {
        if (w.mukmapT) {
            var v = w.mukmapT(cle);
            if (v !== undefined && v !== cle) return v;
        }
        return defaut !== undefined ? defaut : cle;
    }

    function heureLocale(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        var p = function (x) { return String(x).padStart(2, '0'); };
        return p(d.getHours()) + ':' + p(d.getMinutes());
    }

    /* ── Cache IndexedDB (dernier relevé) ─────────────────────── */
    function ouvrirDb() {
        return new Promise(function (resolve, reject) {
            if (!w.indexedDB) return reject(new Error('no idb'));
            var req = w.indexedDB.open(DB_NOM, DB_VERSION);
            req.onupgradeneeded = function () {
                var db = req.result;
                if (!db.objectStoreNames.contains('dernier')) {
                    db.createObjectStore('dernier', { keyPath: 'cle' });
                }
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error); };
        });
    }

    function lireCache() {
        return ouvrirDb().then(function (db) {
            return new Promise(function (resolve) {
                var tx = db.transaction('dernier', 'readonly');
                var r = tx.objectStore('dernier').get('meteo');
                r.onsuccess = function () { resolve(r.result || null); };
                r.onerror = function () { resolve(null); };
            });
        }).catch(function () { return null; });
    }

    function ecrireCache(donnees) {
        return ouvrirDb().then(function (db) {
            return new Promise(function (resolve) {
                var tx = db.transaction('dernier', 'readwrite');
                tx.objectStore('dernier').put({ cle: 'meteo', donnees: donnees, enregistre: Date.now() });
                tx.oncomplete = resolve;
                tx.onerror = resolve;
            });
        }).catch(function () { /* silencieux */ });
    }

    /* ── Position ─────────────────────────────────────────────── */
    function fixRecent() {
        var f = w.__gpsDernierFix;
        if (f && typeof f.lat === 'number' && typeof f.lon === 'number' &&
            Date.now() - (f.d || 0) < FRAIS_MAX) {
            return { lat: f.lat, lon: f.lon };
        }
        return null;
    }

    function positionGps() {
        return new Promise(function (resolve, reject) {
            if (!navigator.geolocation) return reject({ code: 'indisponible' });
            navigator.geolocation.getCurrentPosition(function (pos) {
                resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude });
            }, function (err) {
                reject({ code: err && err.code === 1 ? 'deniee' : 'erreur' });
            }, { enableHighAccuracy: true, maximumAge: 5 * 60 * 1000, timeout: 15000 });
        });
    }

    function obtenirPosition() {
        var f = fixRecent();
        if (f) return Promise.resolve(f);
        return positionGps().catch(function (e) {
            return { erreur: e.code };
        });
    }

    /* ── Données ──────────────────────────────────────────────── */
    function chargerMeteo(lat, lon) {
        var url = URL_API + '?lat=' + encodeURIComponent(lat) + '&lon=' +
            encodeURIComponent(lon) + '&lang=' + encodeURIComponent(langue());
        return fetch(url, { headers: { 'Accept': 'application/json' } })
            .then(function (r) { return r.json(); });
    }

    /* ── Rendu ────────────────────────────────────────────────── */
    function construireHtml(donnees, mode) {
        var D = donnees || {};
        var sections = [];
        var badge = '';
        var dot = '';
        if (mode === 'temps_reel') {
            dot = '<span class="wm-dot temps-reel"></span>';
            badge = '<span style="font-weight:700;color:var(--green,#4ade80);">' +
                t('source_temps_reel', 'Temps réel') + '</span>';
        } else if (mode === 'hors_ligne') {
            dot = '<span class="wm-dot hors-ligne"></span>';
            badge = '<span style="font-weight:700;color:var(--red,#f87171);">' +
                t('meteo_hors_ligne', 'Hors ligne') + '</span>';
        } else {
            dot = '<span class="wm-dot cache"></span>';
            badge = '<span style="font-weight:700;color:var(--orange,#f59e0b);">' +
                t('meteo_donnees_cachees', 'Cache local') + '</span>';
        }
        var note = '<div class="wm-note">' + dot + badge +
            ' &nbsp;·&nbsp; ' + t('meteo_a_jour_le', 'Mis à jour le') + ' ' +
            (heureLocale(D.horodatage) || '—') + '</div>';

        if (D.temperature !== undefined && D.temperature !== null) {
            var temp = '<div class="wm-tete"><div style="display:flex;align-items:center;gap:10px;">' +
                '<span class="wm-icone">' + (D.icone || '🌡️') + '</span>' +
                '<div><div class="wm-temp">' + Number(D.temperature).toFixed(1) +
                '<small> °C</small></div>' +
                (D.conditions ? '<div class="wm-cond">' + D.conditions + '</div>' : '') +
                (D.localisation ? '<div class="wm-lieu">📍 ' + D.localisation + '</div>' : '') +
                '</div></div>' +
                '<button type="button" class="wm-rafraichir" data-wm-rafraichir title="' +
                t('meteo_rafraichir', 'Actualiser') + '">↻</button></div>';

            var cases = [];
            if (D.humidite !== undefined && D.humidite !== null) {
                cases.push('<div class="wm-case"><b>' + t('humidite', 'Humidité') + '</b><span>💧 ' + D.humidite + ' %</span></div>');
            }
            if (D.vent_kmh !== undefined && D.vent_kmh !== null) {
                cases.push('<div class="wm-case"><b>' + t('vent', 'Vent') + '</b><span>🌬️ ' +
                    Number(D.vent_kmh).toFixed(0) + ' km/h' +
                    (D.vent_direction ? ' ' + D.vent_direction : '') + '</span></div>');
            }
            if (D.proba_pluie !== undefined && D.proba_pluie !== null) {
                cases.push('<div class="wm-case"><b>' + t('proba_pluie', 'Pluie') + '</b><span>🌧️ ' + D.proba_pluie + ' %</span></div>');
            }
            var soleil = '';
            if (D.lever_soleil || D.coucher_soleil) {
                soleil = '<div class="wm-case"><b>' + t('soleil', 'Soleil') + '</b><span>🌅 ' +
                    heureLocale(D.lever_soleil) + ' — 🌇 ' + heureLocale(D.coucher_soleil) + '</span></div>';
                cases.push(soleil);
            }
            if (cases.length) {
                sections.push('<div class="wm-grille">' + cases.join('') + '</div>');
            }

            if (D.previsions && D.previsions.length) {
                var prev = D.previsions.map(function (p) {
                    var ic = ICONES[p.code] || '🌡️';
                    var pluie = (p.proba_pluie !== undefined && p.proba_pluie !== null) ?
                        '<div style="font-size:.58rem;color:var(--text-3,#6b6e8a);">🌧 ' + p.proba_pluie + '%</div>' : '';
                    return '<div class="wm-prev"><div class="wp-h">' + (p.heure || '') + '</div>' +
                        '<div class="wp-i">' + ic + '</div><div class="wp-t">' +
                        (p.temperature !== undefined && p.temperature !== null ? Number(p.temperature).toFixed(0) + '°' : '—') +
                        '</div>' + pluie + '</div>';
                }).join('');
                sections.push('<div class="wm-previsions">' + prev + '</div>');
            }
            return temp + sections.join('') + note;
        }

        /* Données indisponibles */
        var msgs = {
            'deniee': t('meteo_geoloc_deniee', 'Autorisation de géolocalisation refusée.'),
            'erreur': t('meteo_geoloc_erreur', 'Impossible de détecter la position.'),
            'indisponible': t('meteo_geoloc_erreur', 'Impossible de détecter la position.'),
            'api': t('meteo_indisponible', 'Données météo indisponibles pour le moment.')
        };
        var msg = msgs[D.motif] || t('meteo_indisponible', 'Données météo indisponibles pour le moment.');
        var boutons = '<div class="wm-actions">' +
            '<button type="button" class="wm-secondaire" data-wm-reessayer>' +
            t('meteo_utiliser_position', 'Utiliser ma position') + '</button>' +
            '<button type="button" class="wm-secondaire" data-wm-rafraichir>↻ ' +
            t('meteo_reessayer', 'Réessayer') + '</button></div>';
        return '<div class="wm-tete"><div style="display:flex;align-items:center;gap:10px;">' +
            '<span class="wm-icone">🌡️</span>' +
            '<div><div class="wm-temp" style="font-size:1rem;font-weight:600;">' +
            t('meteo_indisponible', 'Données météo indisponibles') + '</div></div></div></div>' +
            '<div class="wm-erreur">' + msg + boutons + '</div>' + note;
    }

    /* ── Logique commune ──────────────────────────────────────── */
    var etat = { position: null, dernier: null, mode: 'bloc', panneau: null, ancre: null, tourne: false };

    function majMeteo(forcePosition) {
        if (etat.tourne) return;
        etat.tourne = true;
        tourner(true);
        var conteneur = document.getElementById('widget-meteo');
        if (conteneur) conteneur.innerHTML = '<div style="padding:6px 0;font-size:.75rem;color:var(--text-3,#6b6e8a);">' +
            t('meteo_chargement', 'Récupération des données…') + '</div>';

        var p = forcePosition ? Promise.resolve(forcePosition) : obtenirPosition();
        p.then(function (pos) {
            if (pos.erreur) { afficherErreur(pos.erreur); return; }
            etat.position = { lat: pos.lat, lon: pos.lon };
            return chargerMeteo(pos.lat, pos.lon).then(function (data) {
                if (!data || data.ok !== true) {
                    return lireCache().then(function (cache) {
                        if (cache && cache.donnees) {
                            etat.dernier = cache.donnees;
                            etat.dernier.motif = 'cache';
                            if (navigator.onLine === false) etat.dernier.motif = 'hors_ligne';
                            afficher(etat.dernier, etat.dernier.motif === 'hors_ligne' ? 'hors_ligne' : 'cache');
                        } else {
                            afficherErreur('api');
                        }
                    });
                }
                etat.dernier = data;
                ecrireCache(data);
                afficher(data, 'temps_reel');
            });
        }).catch(function () {
            return lireCache().then(function (cache) {
                if (cache && cache.donnees) {
                    etat.dernier = cache.donnees;
                    etat.dernier.motif = navigator.onLine === false ? 'hors_ligne' : 'cache';
                    afficher(etat.dernier, etat.dernier.motif);
                } else {
                    afficherErreur('api');
                }
            });
        }).then(function () {
            etat.tourne = false;
            tourner(false);
        });
    }

    function afficher(donnees, mode) {
        var conteneur = document.getElementById('widget-meteo');
        if (conteneur) conteneur.innerHTML = construireHtml(donnees, mode);
        if (etat.panneau && !conteneur) {
            var contenu = etat.panneau.querySelector('.widget-meteo');
            if (contenu) contenu.innerHTML = construireHtml(donnees, mode);
        }
        lierBoutons();
        if (etat.mode === 'formulaire') remplirChampsCaches(donnees, mode);
    }

    function afficherErreur(motif) {
        afficher({ motif: motif }, 'cache');
    }

    function lierBoutons() {
        var conteneur = document.getElementById('widget-meteo') ||
            (etat.panneau ? etat.panneau.querySelector('.widget-meteo') : null);
        if (!conteneur) return;
        var btn = conteneur.querySelector('[data-wm-rafraichir]');
        if (btn && !btn.dataset.wmLie) {
            btn.dataset.wmLie = '1';
            btn.addEventListener('click', function () { majMeteo(); });
        }
        var rep = conteneur.querySelector('[data-wm-reessayer]');
        if (rep && !rep.dataset.wmLie) {
            rep.dataset.wmLie = '1';
            rep.addEventListener('click', function () { majMeteo(); });
        }
    }

    function tourner(oui) {
        var conteneur = document.getElementById('widget-meteo') ||
            (etat.panneau ? etat.panneau.querySelector('.widget-meteo') : null);
        if (!conteneur) return;
        var btn = conteneur.querySelector('[data-wm-rafraichir]');
        if (btn) btn.classList.toggle('tourne', oui);
    }

    /* ── Mode panneau carte ───────────────────────────────────── */
    var CLE_POSITION = 'mukmap_meteo_ancre_pos';
    var glisse = false;

    function positionSauvegardee() {
        try {
            var v = JSON.parse(w.localStorage.getItem(CLE_POSITION) || 'null');
            if (v && typeof v.x === 'number' && typeof v.y === 'number') return v;
        } catch (e) { /* ignorer */ }
        return null;
    }

    function bornesAncre() {
        var marge = 8;
        var maxX = w.innerWidth - etat.ancre.offsetWidth - marge;
        var maxY = w.innerHeight - etat.ancre.offsetHeight - marge;
        /* quand le bouton d'action rapide (collecte) est affiché, on évite
           la rangée de contrôles du bas : FAB, GPS, hors-ligne, analyse */
        var fab = document.getElementById('muk-fab-collecte');
        if (fab && w.getComputedStyle(fab).display !== 'none') {
            maxY = Math.min(maxY, w.innerHeight - 150);
        }
        return { marge: marge, maxX: maxX, maxY: maxY };
    }

    function appliquerPositionAncre() {
        var p = positionSauvegardee();
        if (!p || !etat.ancre) return;
        var b = bornesAncre();
        if (p.x < b.marge || p.y < b.marge || p.x > b.maxX || p.y > b.maxY) {
            p.x = Math.max(b.marge, Math.min(p.x, b.maxX));
            p.y = Math.max(b.marge, Math.min(p.y, b.maxY));
            try { w.localStorage.setItem(CLE_POSITION, JSON.stringify(p)); } catch (e) { /* ignorer */ }
        }
        etat.ancre.style.setProperty('left', p.x + 'px', 'important');
        etat.ancre.style.setProperty('top', p.y + 'px', 'important');
    }

    function rendreAncreDeplacable() {
        var ancre = etat.ancre;
        if (!ancre) return;
        var x0 = 0, y0 = 0, l0 = 0, t0 = 0;
        ancre.addEventListener('pointerdown', function (ev) {
            if (ev.button !== undefined && ev.button !== 0) return;
            glisse = false;
            x0 = ev.clientX; y0 = ev.clientY;
            var cs = w.getComputedStyle(ancre);
            l0 = parseFloat(cs.left) || 0; t0 = parseFloat(cs.top) || 0;
            try { ancre.setPointerCapture(ev.pointerId); } catch (e) { /* ignorer */ }
        });
        ancre.addEventListener('pointermove', function (ev) {
            if (!ancre.hasPointerCapture || !ancre.hasPointerCapture(ev.pointerId)) return;
            var dx = ev.clientX - x0, dy = ev.clientY - y0;
            if (!glisse && Math.abs(dx) + Math.abs(dy) > 6) glisse = true;
            if (!glisse) return;
            var b = bornesAncre();
            var l = Math.max(b.marge, Math.min(l0 + dx, b.maxX));
            var t = Math.max(b.marge, Math.min(t0 + dy, b.maxY));
            ancre.style.setProperty('left', l + 'px', 'important');
            ancre.style.setProperty('top', t + 'px', 'important');
        });
        ancre.addEventListener('pointerup', function () {
            if (!glisse) return;
            try {
                w.localStorage.setItem(CLE_POSITION, JSON.stringify({
                    x: parseFloat(ancre.style.left), y: parseFloat(ancre.style.top)
                }));
            } catch (e) { /* ignorer */ }
        });
    }

    function positionnerPanneau() {
        var panneau = etat.panneau, ancre = etat.ancre;
        if (!panneau || !ancre) return;
        if (w.innerWidth <= 768) return; /* mobile/tablette : feuille en bas d'écran */
        var r = ancre.getBoundingClientRect();
        var pw = panneau.offsetWidth || 320;
        var ph = panneau.offsetHeight || 320;
        var l = r.right + 12;
        var t = Math.max(8, r.top - 10);
        if (l + pw > w.innerWidth - 8) l = Math.max(8, r.left - pw - 12);
        t = Math.min(t, w.innerHeight - ph - 8);
        panneau.style.left = l + 'px';
        panneau.style.top = t + 'px';
    }

    function creerPanneauCarte() {
        if (document.getElementById('mukmap-meteo-ancre') || !document.getElementById('map')) return;
        var ancre = document.createElement('button');
        ancre.type = 'button';
        ancre.id = 'mukmap-meteo-ancre';
        ancre.innerHTML = '⛅';
        ancre.title = t('meteo_widget', 'Météo');
        ancre.setAttribute('aria-label', t('meteo_widget', 'Météo'));
        document.body.appendChild(ancre);

        var panneau = document.createElement('div');
        panneau.className = 'mukmap-meteo';
        panneau.innerHTML = '<div class="mukmap-meteo-tete"><span class="wm-titre">⛅ ' +
            t('meteo_widget', 'Météo') + '</span></div>' +
            '<div class="widget-meteo" id="widget-meteo-carte"></div>';
        document.body.appendChild(panneau);

        ancre.addEventListener('click', function () {
            if (glisse) { glisse = false; return; }
            positionnerPanneau();
            var ouvert = panneau.classList.toggle('ouvert');
            ancre.classList.toggle('actif', ouvert);
            if (ouvert && !etat.dernier) majMeteo();
            if (ouvert && etat.dernier) afficher(etat.dernier, etat.dernier.motif || 'temps_reel');
        });
        etat.panneau = panneau;
        etat.ancre = ancre;
        appliquerPositionAncre();
        rendreAncreDeplacable();
        var conteneur = document.getElementById('widget-meteo');
        if (!conteneur) {
            /* la logique d'affichage utilise #widget-meteo ; en mode carte,
               on délègue vers le conteneur du panneau */
            var faux = panneau.querySelector('#widget-meteo-carte');
            faux.id = 'widget-meteo';
        }
    }

    /* ── Mode formulaire d'activité ───────────────────────────── */
    function demarrerFormulaire() {
        etat.mode = 'formulaire';
        var form = document.querySelector('form[method="POST"]');
        if (!form) return;
        var lat = document.getElementById('latitude');
        var lon = document.getElementById('longitude');
        var derniereVue = { lat: '', lon: '' };
        var enCours = false;

        function positionFormulaire() {
            if (lat && lon && lat.value && lon.value) {
                var a = String(lat.value).trim(), b = String(lon.value).trim();
                if (a !== derniereVue.lat || b !== derniereVue.lon) {
                    derniereVue = { lat: a, lon: b };
                    enCours = true;
                    majMeteo({ lat: parseFloat(a), lon: parseFloat(b) }).then(function () {
                        enCours = false;
                    }).catch(function () { enCours = false; });
                }
            }
        }
        positionFormulaire();
        setInterval(positionFormulaire, 1000);

        form.addEventListener('submit', function () {
            if (etat.dernier && (etat.dernier.motif === 'temps_reel' || etat.dernier.motif === 'cache' || etat.dernier.motif === 'hors_ligne' || etat.dernier.source === 'temps_reel')) {
                remplirChampsCaches(etat.dernier, etat.dernier.motif || 'temps_reel');
            }
        });
    }

    function remplirChampsCaches(donnees, mode) {
        var form = document.querySelector('form[method="POST"]');
        if (!form) return;
        var vals = {
            meteo_latitude: donnees.lat !== undefined ? donnees.lat : '',
            meteo_longitude: donnees.lon !== undefined ? donnees.lon : '',
            meteo_temperature: donnees.temperature !== undefined && donnees.temperature !== null ? donnees.temperature : '',
            meteo_conditions: donnees.conditions || '',
            meteo_code: donnees.code !== undefined && donnees.code !== null ? donnees.code : '',
            meteo_humidite: donnees.humidite !== undefined && donnees.humidite !== null ? donnees.humidite : '',
            meteo_vent_kmh: donnees.vent_kmh !== undefined && donnees.vent_kmh !== null ? donnees.vent_kmh : '',
            meteo_vent_direction: donnees.vent_direction || '',
            meteo_vent_direction_deg: donnees.vent_direction_deg !== undefined && donnees.vent_direction_deg !== null ? donnees.vent_direction_deg : '',
            meteo_proba_pluie: donnees.proba_pluie !== undefined && donnees.proba_pluie !== null ? donnees.proba_pluie : '',
            meteo_lever: donnees.lever_soleil || '',
            meteo_coucher: donnees.coucher_soleil || '',
            meteo_localisation: donnees.localisation || '',
            meteo_source: mode === 'temps_reel' ? 'temps_reel' : 'cache',
            meteo_horodatage: donnees.horodatage || ''
        };
        Object.keys(vals).forEach(function (nom) {
            var champ = form.querySelector('input[name="' + nom + '"]');
            if (!champ) {
                champ = document.createElement('input');
                champ.type = 'hidden';
                champ.name = nom;
                form.appendChild(champ);
            }
            champ.value = vals[nom];
        });
    }

    /* ── Init ─────────────────────────────────────────────────── */
    function init() {
        var conteneur = document.getElementById('widget-meteo');
        var surCarte = !conteneur && !!document.getElementById('map');
        if (conteneur) {
            if (document.getElementById('latitude') && document.getElementById('longitude')) {
                etat.mode = 'formulaire';
                demarrerFormulaire();
                if (etat.dernier) afficher(etat.dernier, etat.dernier.motif || 'temps_reel');
                return;
            }
            etat.mode = 'bloc';
            majMeteo();
            return;
        }
        if (surCarte) {
            creerPanneauCarte();
            if (etat.panneau && !document.getElementById('widget-meteo')) {
                var contenu = etat.panneau.querySelector('.widget-meteo');
                if (contenu) contenu.innerHTML = '<div style="padding:6px 0;font-size:.75rem;color:var(--text-3,#6b6e8a);">' +
                    t('meteo_widget', 'Météo') + '</div>';
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { try { init(); } catch (e) { /* ne jamais casser la page */ } });
    } else {
        try { init(); } catch (e) { /* ne jamais casser la page */ }
    }

    w.MukmapMeteo = {
        maj: majMeteo,
        obtenirPosition: obtenirPosition,
        debug: function () {
            var a = etat.ancre;
            return {
                glisse: glisse,
                position: a ? { left: a.style.left, top: a.style.top } : null,
                panneauOuvert: etat.panneau ? etat.panneau.classList.contains('ouvert') : false
            };
        }
    };
})(window);