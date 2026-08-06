/* MUKMAP — Imagerie aérienne : orthophotos / images drone géoréférencées (Mode Avancé).
 * Core exposé sous globalThis.ImagerieCore : testable en Node.
 * Chaque image devient une source MapLibre "image" (4 coins) superposée aux données.
 * Géoréférencement géré côté serveur (WorldFile / EXIF GPS / emprise manuelle).
 */
(function () {
    'use strict';

    function csrfToken() {
        try {
            var m = document.cookie.match(/csrftoken=([^;]+)/);
            if (m) return m[1];
        } catch (e) {}
        return '';
    }

    /* Charge la liste depuis l'API et ajoute les couches visibles sur la carte. */
    function charger(opts) {
        var map = opts && opts.map ? opts.map : null;
        return fetch('/api/imagerie/', {
            credentials: 'same-origin',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function (data) {
            var images = (data && data.images) || [];
            if (map) {
                images.forEach(function (img) {
                    if (img.visible) ajouterCouche(map, img);
                });
            }
            return images;
        });
    }

    /* 4 coins [SW, SE, NE, NW] — coords exacts (WorldFile) ou dérivés de la bbox. */
    function coordonnees(img) {
        if (img && img.coords && img.coords.length === 4) return img.coords;
        if (img && img.min_lon != null && img.min_lat != null &&
            img.max_lon != null && img.max_lat != null) {
            return [
                [img.min_lon, img.min_lat],
                [img.max_lon, img.min_lat],
                [img.max_lon, img.max_lat],
                [img.min_lon, img.max_lat]
            ];
        }
        return null;
    }

    /* Ajoute (si absente) la couche raster d'une image, sous les données ("clusters"). */
    function ajouterCouche(map, img) {
        if (!map || !img || !img.url) return false;
        var coords = coordonnees(img);
        if (!coords) return false;
        var sourceId = 'img-' + img.id;
        try {
            if (!map.getSource(sourceId)) {
                map.addSource(sourceId, { type: 'image', url: img.url, coordinates: coords });
            }
            var layerId = sourceId + '-c';
            if (map.getLayer && !map.getLayer(layerId)) {
                var spec = { id: layerId, type: 'raster', source: sourceId, layout: { visibility: img.visible === false ? 'none' : 'visible' } };
                try {
                    map.addLayer(spec, 'clusters');
                } catch (e) {
                    map.addLayer(spec);
                }
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    function retirerCouche(map, imgId) {
        if (!map) return;
        var sourceId = 'img-' + imgId;
        var layerId = sourceId + '-c';
        try {
            if (map.getLayer && map.getLayer(layerId)) map.removeLayer(layerId);
            if (map.getSource(sourceId)) map.removeSource(sourceId);
        } catch (e) {}
    }

    function basculer(map, imgId, visible) {
        if (!map) return false;
        var layerId = 'img-' + imgId + '-c';
        try {
            if (map.getLayer && !map.getLayer(layerId)) return false;
            map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
            return true;
        } catch (e) {
            return false;
        }
    }

    globalThis.ImagerieCore = {
        charger: charger,
        coordonnees: coordonnees,
        ajouterCouche: ajouterCouche,
        retirerCouche: retirerCouche,
        basculer: basculer,
        csrfToken: csrfToken
    };

    if (typeof document === 'undefined') return;

    // ── UI : section Imagerie (sidebar) + modal d'ajout ──
    var mapRef = null;
    var images = [];
    var listeEl = null;
    var panelEl = null;
    var titreEl = null;
    var modale = null;

    function trad(cle, defaut) {
        if (typeof window !== 'undefined' && window.mukmapT) {
            var v = window.mukmapT(cle);
            if (v) return v;
        }
        return defaut;
    }

    function installer(opts) {
        if (opts && opts.map) mapRef = opts.map;
        listeEl = document.getElementById('liste-imagerie');
        panelEl = document.getElementById('panel-imagerie');
        titreEl = document.getElementById('titre-imagerie');
        var etat = window.ETAT_MODE || {};
        var pro = etat.mode === 'avance' && etat.acces_avance;
        if (panelEl) panelEl.style.display = pro ? '' : 'none';
        if (titreEl) titreEl.style.display = pro ? '' : 'none';
        var btn = document.getElementById('btn-imagerie-ajouter');
        if (btn && !btn.dataset.wired) {
            btn.dataset.wired = '1';
            btn.addEventListener('click', ouvrirFormulaire);
        }
        if (pro) {
            charger({ map: mapRef }).then(function (liste) {
                images = liste;
                rendreListe();
            }).catch(function () {
                images = [];
                rendreListe();
            });
        }
    }

    function rendreListe() {
        if (!listeEl) return;
        listeEl.innerHTML = '';
        if (!images.length) {
            var vide = document.createElement('div');
            vide.className = 'hint';
            vide.style.fontSize = '.72rem';
            vide.textContent = trad('imagerie_aucune', 'Aucune image. Ajoutez une orthophoto (drone, EXIF GPS ou WorldFile).');
            listeEl.appendChild(vide);
            return;
        }
        images.forEach(function (img) {
            var div = document.createElement('div');
            div.className = 'img-item';
            div.title = img.nom + ' — ' + (img.date_prise || '');
            var oeil = document.createElement('button');
            oeil.type = 'button';
            oeil.className = 'img-oeil';
            oeil.innerHTML = img.visible ? '<span data-lucide="eye"></span>' : '<span data-lucide="eye-off"></span>';
            oeil.title = trad(img.visible ? 'imagerie_masquer' : 'imagerie_afficher', img.visible ? 'Masquer' : 'Afficher');
            oeil.addEventListener('click', function () {
                var v = !img.visible;
                fetch('/api/imagerie/' + img.id + '/visibilite/', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken(), 'X-Requested-With': 'XMLHttpRequest' },
                    body: JSON.stringify({ visible: v })
                }).then(function (r) { return r.json(); }).then(function (d) {
                    if (d.ok) {
                        img.visible = v;
                        basculer(mapRef, img.id, v);
                        rendreListe();
                    }
                }).catch(function () {});
            });
            var suppr = document.createElement('button');
            suppr.type = 'button';
            suppr.className = 'img-suppr';
            suppr.innerHTML = '<span data-lucide="trash-2"></span>';
            suppr.title = trad('imagerie_supprimer', 'Supprimer');
            suppr.addEventListener('click', function () {
                if (!window.confirm(trad('imagerie_confirmer_suppr', 'Supprimer cette image ?'))) return;
                fetch('/api/imagerie/' + img.id + '/', {
                    method: 'DELETE',
                    credentials: 'same-origin',
                    headers: { 'X-CSRFToken': csrfToken(), 'X-Requested-With': 'XMLHttpRequest' }
                }).then(function (r) {
                    if (r.ok) {
                        retirerCouche(mapRef, img.id);
                        images = images.filter(function (i) { return i.id !== img.id; });
                        rendreListe();
                    }
                }).catch(function () {});
            });
            var nom = document.createElement('span');
            nom.className = 'img-nom';
            nom.textContent = img.nom;
            div.appendChild(nom);
            div.appendChild(oeil);
            div.appendChild(suppr);
            listeEl.appendChild(div);
        });
        if (window.lucide) window.lucide.createIcons();
    }

    function baserStyle() {
        var base = document.createElement('style');
        base.textContent =
            '#modal-imagerie { position: fixed; inset: 0; z-index: 1400; display: none; align-items: center; justify-content: center; background: rgba(8,10,24,.68); backdrop-filter: blur(6px); }' +
            '#modal-imagerie.ouvert { display: flex; }' +
            '#modal-imagerie .img-boite { width: min(560px, 94vw); max-height: 88vh; overflow-y: auto; background: var(--bg-2); border: 1px solid var(--border); border-radius: 16px; box-shadow: var(--shadow); }' +
            '#modal-imagerie .img-tete { display: flex; align-items: center; justify-content: space-between; padding: 15px 18px; border-bottom: 1px solid var(--border); }' +
            '#modal-imagerie .img-titre { display: flex; align-items: center; gap: 9px; font-weight: 800; font-size: .98rem; }' +
            '#modal-imagerie .img-titre [data-lucide] { width: 19px; height: 19px; color: var(--accent); }' +
            '#modal-imagerie .img-corps { padding: 14px 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }' +
            '#modal-imagerie .img-corps label { display: flex; flex-direction: column; gap: 4px; font-size: .7rem; font-weight: 700; color: var(--text-2); }' +
            '#modal-imagerie .img-corps .pleine { grid-column: 1 / -1; }' +
            '#modal-imagerie .img-corps input, #modal-imagerie .img-corps select, #modal-imagerie .img-corps textarea { background: var(--bg-3); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; font-size: .74rem; width: 100%; box-sizing: border-box; }' +
            '#modal-imagerie .img-corps .hint { font-size: .66rem; font-weight: 400; color: var(--text-3); line-height: 1.4; }' +
            '#modal-imagerie .img-actions { grid-column: 1 / -1; display: flex; gap: 8px; justify-content: flex-end; padding-bottom: 14px; padding-right: 18px; }' +
            '#modal-imagerie .img-erreur { grid-column: 1 / -1; color: var(--red); font-size: .72rem; }' +
            '#modal-imagerie .img-bbox { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }';
        document.head.appendChild(base);
    }

    function construireModale() {
        if (modale) return modale;
        baserStyle();
        var ov = document.createElement('div');
        ov.id = 'modal-imagerie';
        ov.innerHTML =
            '<div class="img-boite">' +
            '<div class="img-tete">' +
            '<div class="img-titre"><span data-lucide="satellite"></span><span>' + trad('imagerie_ajouter', 'Ajouter une image aérienne') + '</span></div>' +
            '<button type="button" class="btn btn-icon btn-sm" id="img-fermer">✕</button>' +
            '</div>' +
            '<form class="img-corps" id="img-form">' +
            '<label class="pleine"><span>' + trad('imagerie_nom', 'Nom') + '</span><input id="img-nom" required></label>' +
            '<label><span>' + trad('imagerie_type', 'Type') + '</span><select id="img-type">' +
            '<option value="ortho">' + trad('imagerie_type_ortho', 'Orthophoto') + '</option>' +
            '<option value="drone">' + trad('imagerie_type_drone', 'Image drone') + '</option>' +
            '<option value="satellite">' + trad('imagerie_type_sat', 'Satellite') + '</option>' +
            '<option value="photo">' + trad('imagerie_type_photo', 'Photo géolocalisée') + '</option>' +
            '</select></label>' +
            '<label><span>' + trad('imagerie_date', 'Date de prise de vue') + '</span><input type="date" id="img-date"></label>' +
            '<label class="pleine"><span>' + trad('imagerie_fichier', 'Image (JPG/PNG/TIF)') + '</span><input type="file" id="img-fichier" accept="image/*" required>' +
            '<span class="hint">' + trad('imagerie_geo_hint', 'Coordonnées auto : métadonnées EXIF GPS de la photo, WorldFile (.pgw/.jgw/.tfw/.wld) ci-dessous, ou emprise manuelle.') + '</span></label>' +
            '<label class="pleine"><span>' + trad('imagerie_worldfile', 'WorldFile (optionnel)') + '</span><input type="file" id="img-worldfile" accept=".pgw,.jgw,.tfw,.wld,.wld2,.j2w,.grd,.bpw" class="hint"></label>' +
            '<div class="pleine bbox-titre" style="font-size:.7rem;font-weight:700;color:var(--text-2);">' + trad('imagerie_bbox', 'Emprise manuelle (optionnelle)') + '</div>' +
            '<div class="pleine img-bbox">' +
            '<label><span>Longitude min (Ouest)</span><input type="number" step="any" id="img-min-lon"></label>' +
            '<label><span>Latitude min (Sud)</span><input type="number" step="any" id="img-min-lat"></label>' +
            '<label><span>Longitude max (Est)</span><input type="number" step="any" id="img-max-lon"></label>' +
            '<label><span>Latitude max (Nord)</span><input type="number" step="any" id="img-max-lat"></label>' +
            '</div>' +
            '<label><span>' + trad('imagerie_altitude', 'Altitude de vol (m)') + '</span><input type="number" step="any" id="img-altitude"></label>' +
            '<label class="pleine"><span>' + trad('imagerie_description', 'Description') + '</span><textarea id="img-description" rows="2"></textarea></label>' +
            '<div class="img-erreur" id="img-erreur"></div>' +
            '<div class="img-actions">' +
            '<button type="button" class="btn" id="img-annuler">' + trad('imagerie_annuler', 'Annuler') + '</button>' +
            '<button type="submit" class="btn btn-primary">' + trad('imagerie_enregistrer', 'Ajouter') + '</button>' +
            '</div>' +
            '</form>' +
            '</div>';
        ov.addEventListener('click', function (e) { if (e.target === e.currentTarget) fermerFormulaire(); });
        ov.querySelector('#img-fermer').addEventListener('click', fermerFormulaire);
        ov.querySelector('#img-annuler').addEventListener('click', fermerFormulaire);
        ov.querySelector('#img-form').addEventListener('submit', function (ev) {
            ev.preventDefault();
            enregistrer();
        });
        document.body.appendChild(ov);
        modale = ov;
        return modale;
    }

    function ouvrirFormulaire() {
        var ov = construireModale();
        ov.classList.add('ouvert');
        var erreur = ov.querySelector('#img-erreur');
        if (erreur) erreur.textContent = '';
    }

    function fermerFormulaire() {
        if (modale) modale.classList.remove('ouvert');
    }

    function enregistrer() {
        if (!modale) return;
        var erreur = modale.querySelector('#img-erreur');
        var fd = new FormData();
        var nom = modale.querySelector('#img-nom').value.trim();
        var fichier = modale.querySelector('#img-fichier').files[0];
        if (!nom || !fichier) {
            if (erreur) erreur.textContent = trad('imagerie_champs_requis', 'Nom et image requis.');
            return;
        }
        fd.append('nom', nom);
        fd.append('type', modale.querySelector('#img-type').value);
        fd.append('fichier', fichier);
        fd.append('date_prise', modale.querySelector('#img-date').value || '');
        fd.append('altitude', modale.querySelector('#img-altitude').value || '');
        fd.append('description', modale.querySelector('#img-description').value || '');
        fd.append('min_lon', modale.querySelector('#img-min-lon').value || '');
        fd.append('min_lat', modale.querySelector('#img-min-lat').value || '');
        fd.append('max_lon', modale.querySelector('#img-max-lon').value || '');
        fd.append('max_lat', modale.querySelector('#img-max-lat').value || '');
        var wf = modale.querySelector('#img-worldfile').files[0];
        if (wf) fd.append('worldfile', wf);
        fetch('/api/imagerie/', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'X-CSRFToken': csrfToken(), 'X-Requested-With': 'XMLHttpRequest' },
            body: fd
        }).then(function (r) {
            return r.json().then(function (d) { return { ok: r.ok, d: d }; });
        }).then(function (res) {
            if (!res.ok) {
                if (erreur) erreur.textContent = res.d.erreur || trad('imagerie_erreur', 'Erreur lors de l’ajout.');
                return;
            }
            var img = res.d.image;
            if (img.visible) ajouterCouche(mapRef, img);
            images.unshift(img);
            rendreListe();
            fermerFormulaire();
        }).catch(function () {
            if (erreur) erreur.textContent = trad('imagerie_erreur', 'Erreur lors de l’ajout.');
        });
    }

    globalThis.Imagerie = {
        installer: installer,
        charger: charger,
        rendreListe: rendreListe,
        ouvrirFormulaire: ouvrirFormulaire
    };
})();
