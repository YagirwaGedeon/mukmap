/* MUKMAP — Mode 3D natif MapLibre GL JS (sans Cesium, sans overlay).
 * Core exposé sous globalThis.Mode3D : testable en Node (document indéfini).
 * En navigateur, ajoute le bouton « Vue 3D » (tous les utilisateurs) à droite
 * de la carte. La vue 3D = la carte elle-même inclinée (pitch) avec un relief
 * DEM (tuiles terrarium publiques, sans clé API) :
 *  - affiche EXACTEMENT l'image de la carte 2D : fond actif + couches WMS +
 *    orthophotos + données (même style, mêmes sources) ;
 *  - terrain + exagération verticale réglable (1× à 10×) ;
 *  - vues Aérienne (pitch 60°) et Horizontale (pitch 85°) ;
 *  - rotation, inclinaison, zoom et déplacement natifs MapLibre.
 * Aucun conteneur superposé : plus de problème d'empilement ni d'imagerie.
 */
(function () {
    'use strict';

    var PITCH_AERIENNE = 60;
    var PITCH_HORIZONTALE = 85;
    var PITCH_MAX = 85;
    var EXAGERATION_MIN = 1;
    var EXAGERATION_MAX = 10;
    var ID_SOURCE_DEM = 'mukmap-dem';
    var DEM_MAXZOOM = 15;
    var SOURCES_DEM = [
        'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
        'https://elevation-tiles-prod.maptilescdn.com/terrarium/{z}/{x}/{y}.png'
    ];

    var actif = false;
    var ExagerationValeur = 1.5;
    var mapActuelle = null;
    var indexDEM = 0;
    var basculeDEMArmee = false;
    var EnTransition = false;

    function trad(cle, defaut) {
        if (typeof window !== 'undefined' && window.mukmapT) {
            var v = window.mukmapT(cle);
            if (v) return v;
        }
        return defaut;
    }

    /* ── Cœur testable (sans DOM ni carte) ── */

    function urlDEMCourante() {
        return SOURCES_DEM[Math.max(0, Math.min(indexDEM, SOURCES_DEM.length - 1))];
    }

    function pitchEnLimite(pitch) {
        var n = Number(pitch);
        if (!isFinite(n)) return 0;
        return Math.max(0, Math.min(PITCH_MAX, n));
    }

    function reglerExageration(valeur) {
        var n = Math.round(Number(valeur));
        if (!isFinite(n)) n = EXAGERATION_MIN;
        ExagerationValeur = Math.max(EXAGERATION_MIN, Math.min(EXAGERATION_MAX, n));
        return ExagerationValeur;
    }

    function exagerationCourante() {
        return ExagerationValeur;
    }

    globalThis.Mode3D = {
        estActif: function () { return actif; },
        reglerExageration: reglerExageration,
        exagerationCourante: exagerationCourante,
        urlDEMCourante: urlDEMCourante,
        pitchEnLimite: pitchEnLimite,
        PITCH_AERIENNE: PITCH_AERIENNE,
        PITCH_HORIZONTALE: PITCH_HORIZONTALE,
        PITCH_MAX: PITCH_MAX,
        EXAGERATION_MIN: EXAGERATION_MIN,
        EXAGERATION_MAX: EXAGERATION_MAX,
        ID_SOURCE_DEM: ID_SOURCE_DEM,
        DEM_MAXZOOM: DEM_MAXZOOM,
        SOURCES_DEM: SOURCES_DEM
    };

    if (typeof document === 'undefined') return;

    /* ── Interface navigateur (carte MapLibre inclinée + relief) ── */

    function injecterCSS() {
        if (document.getElementById('mode3d-css')) return;
        var st = document.createElement('style');
        st.id = 'mode3d-css';
        st.textContent =
            '#btn-vue-3d { display: inline-flex; align-items: center; gap: 6px; padding: 9px 13px; font-size: .78rem; font-weight: 800; border-radius: 10px; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff; border: none; cursor: pointer; box-shadow: 0 4px 16px rgba(99,102,241,.45); transition: all .15s; white-space: nowrap; }' +
            '#btn-vue-3d:hover { filter: brightness(1.12); transform: translateY(-1px); }' +
            '#btn-vue-3d.active { background: linear-gradient(135deg, #f43f5e, #fb7185); box-shadow: 0 4px 16px rgba(244,63,94,.4); }' +
            '#btn-vue-3d [data-lucide] { width: 15px; height: 15px; }' +
            '#btn-vue-3d-cadre.maplibregl-ctrl { background: transparent; padding: 0; }' +
            'body.mukmap-3d #panneau-3d-cadre { position: fixed; top: 158px; right: 14px; z-index: 1300; }' +
            'body.mukmap-3d #panneau-3d-cadre .maplibregl-ctrl { background: transparent; }' +
            'body.mukmap-3d #btn-vue-3d-cadre { position: relative; z-index: 1400; }' +
            'body.mukmap-3d #mesure-barre, body.mukmap-3d #coords-barre, body.mukmap-3d #minimap { display: none !important; }';
        document.head.appendChild(st);
    }

    function appliquerTerrain(map) {
        if (!map || typeof map.setTerrain !== 'function') return;
        try {
            map.setTerrain({ source: ID_SOURCE_DEM, exaggeration: ExagerationValeur });
        } catch (e) {}
    }

    function assurerTerrain(map) {
        if (!map || typeof map.addSource !== 'function') return;
        try {
            if (!map.getSource(ID_SOURCE_DEM)) {
                map.addSource(ID_SOURCE_DEM, {
                    type: 'raster-dem',
                    url: urlDEMCourante(),
                    tileSize: 256,
                    maxzoom: DEM_MAXZOOM,
                    encoding: 'terrarium',
                    attribution: '© AWS Terrain Tiles / GMTED2010'
                });
            }
            appliquerTerrain(map);
        } catch (e) {}
    }

    function essayerDEMSuivante() {
        if (!mapActuelle || !actif) return;
        indexDEM += 1;
        if (indexDEM >= SOURCES_DEM.length) return;
        try {
            mapActuelle.setTerrain(null);
            mapActuelle.removeSource(ID_SOURCE_DEM);
        } catch (e) {}
        assurerTerrain(mapActuelle);
    }

    function activer(map) {
        if (actif || EnTransition || !map) return;
        if (window.OutilsTopo && typeof window.OutilsTopo.modeActif === 'function' &&
            window.OutilsTopo.modeActif() && typeof window.OutilsTopo.fermer === 'function') {
            window.OutilsTopo.fermer();
        }
        mapActuelle = map;
        indexDEM = 0;
        basculeDEMArmee = false;
        actif = true;
        EnTransition = true;
        majUI();
        assurerTerrain(map);
        try { map.stop(); } catch (e) {}
        try {
            map.easeTo({ pitch: PITCH_AERIENNE, bearing: -20, duration: 1000, easing: function (t) { return t; } });
        } catch (e) {}
        setTimeout(function () { EnTransition = false; }, 1200);
    }

    function desactiver() {
        var m = mapActuelle;
        mapActuelle = null;
        if (!actif && !EnTransition) {
            majUI();
            return;
        }
        actif = false;
        EnTransition = true;
        majUI();
        if (m) {
            try { m.stop(); } catch (e) {}
            try {
                m.easeTo({ pitch: 0, bearing: 0, duration: 500, easing: function (t) { return t; } });
            } catch (e) {}
            try { m.setTerrain(null); } catch (e) {}
            try { m.removeSource(ID_SOURCE_DEM); } catch (e) {}
            setTimeout(function () {
                EnTransition = false;
                try {
                    if (typeof m.getPitch === 'function' && Math.abs(m.getPitch()) > 1) m.jumpTo({ pitch: 0 });
                    if (typeof m.getBearing === 'function' && Math.abs(m.getBearing()) > 1) m.jumpTo({ bearing: 0 });
                } catch (e) {}
            }, 800);
        } else {
            setTimeout(function () { EnTransition = false; }, 500);
        }
    }

    function basculer(map) {
        if (actif || EnTransition) { desactiver(); } else { activer(map || mapActuelle); }
        return actif;
    }

    function vueAerienne() {
        if (!mapActuelle || !actif) return;
        try {
            mapActuelle.easeTo({ pitch: PITCH_AERIENNE, duration: 1000 });
        } catch (e) {}
    }

    function vueHorizontale() {
        if (!mapActuelle || !actif) return;
        try {
            mapActuelle.easeTo({ pitch: PITCH_HORIZONTALE, duration: 1200 });
        } catch (e) {}
    }

    function majUI() {
        document.body.classList.toggle('mukmap-3d', actif);
        var btn = document.getElementById('btn-vue-3d');
        if (btn) {
            btn.classList.toggle('active', actif);
            btn.title = trad(actif ? 'vue3d_retour' : 'vue3d_bouton', actif ? 'Quitter la vue 3D' : 'Vue 3D');
        }
        var lbl = document.getElementById('btn-vue-3d-label');
        if (lbl) lbl.textContent = trad(actif ? 'vue3d_retour' : 'vue3d_bouton', actif ? 'Quitter la vue 3D' : 'Vue 3D');
        var panneau = document.getElementById('panneau-3d');
        if (panneau) panneau.style.display = actif ? 'block' : 'none';
    }

    var ControleVue3D = {
        _installe: false,
        onAdd: function (map) {
            this._map = map;
            var btn = document.createElement('button');
            btn.id = 'btn-vue-3d';
            btn.type = 'button';
            btn.innerHTML = '<span data-lucide="box"></span><span id="btn-vue-3d-label">' + trad('vue3d_bouton', 'Vue 3D') + '</span>';
            this._btn = btn;
            var ctr = document.createElement('div');
            ctr.id = 'btn-vue-3d-cadre';
            ctr.className = 'maplibregl-ctrl';
            ctr.appendChild(btn);
            return ctr;
        },
        onRemove: function () {
            if (this._btn && this._btn.parentNode) this._btn.parentNode.removeChild(this._btn);
        }
    };

    function creerPanneau(map) {
        var p = document.createElement('div');
        p.id = 'panneau-3d';
        p.className = 'panneau-3d';
        p.style.display = 'none';

        var titre = document.createElement('div');
        titre.className = 'p3d-titre';
        titre.innerHTML = '<span data-lucide="mountain-snow"></span>';
        titre.appendChild(document.createTextNode(trad('vue3d_exageration', 'Exagération verticale')));

        var slider = document.createElement('input');
        slider.type = 'range';
        slider.min = String(EXAGERATION_MIN);
        slider.max = String(EXAGERATION_MAX);
        slider.step = '1';
        slider.value = String(exagerationCourante());
        slider.className = 'p3d-slider';
        slider.addEventListener('input', function () {
            Mode3D.reglerExageration(slider.value);
            appliquerTerrain(mapActuelle);
            majPresets(slider);
        });

        var ligneValeur = document.createElement('div');
        ligneValeur.className = 'p3d-valeur';
        var val = document.createElement('span');
        val.id = 'p3d-valeur-texte';
        val.textContent = exagerationCourante() + '×';
        slider.addEventListener('input', function () { val.textContent = exagerationCourante() + '×'; });

        var presets = document.createElement('div');
        presets.className = 'p3d-presets';
        var boutons = [1, 2, 5, 10].map(function (v) {
            var b = document.createElement('button');
            b.type = 'button';
            b.textContent = v + '×';
            b.dataset.v = String(v);
            b.addEventListener('click', function () {
                Mode3D.reglerExageration(v);
                appliquerTerrain(mapActuelle);
                majPresets(slider);
            });
            presets.appendChild(b);
            return b;
        });
        slider._presets = boutons;

        var vues = document.createElement('div');
        vues.className = 'p3d-vues';
        var bAer = document.createElement('button');
        bAer.type = 'button';
        bAer.className = 'p3d-vue';
        bAer.innerHTML = '<span data-lucide="plane"></span> ' + trad('vue3d_aerienne', 'Aérienne');
        bAer.addEventListener('click', vueAerienne);
        var bHor = document.createElement('button');
        bHor.type = 'button';
        bHor.className = 'p3d-vue';
        bHor.innerHTML = '<span data-lucide="remove-horizontal"></span> ' + trad('vue3d_horizontale', 'Horizontale');
        bHor.addEventListener('click', vueHorizontale);
        vues.appendChild(bAer);
        vues.appendChild(bHor);

        ligneValeur.appendChild(val);
        p.appendChild(titre);
        p.appendChild(slider);
        p.appendChild(ligneValeur);
        p.appendChild(presets);
        p.appendChild(vues);

        var ctr = document.createElement('div');
        ctr.id = 'panneau-3d-cadre';
        ctr.className = 'maplibregl-ctrl';
        ctr.appendChild(p);
        return ctr;
    }

    function majPresets(slider) {
        var actuelle = exagerationCourante();
        slider.value = String(actuelle);
        (slider._presets || []).forEach(function (b) {
            b.classList.toggle('actif', String(b.dataset.v) === String(actuelle));
        });
    }

    function installer({ map }) {
        if (ControleVue3D._installe || !map) return;
        ControleVue3D._installe = true;
        injecterCSS();
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && (actif || EnTransition)) desactiver();
        });
        /* Clic délégué au document (phase capture) : fonctionne même si
         * l'écouteur du bouton est perdu (remplacement DOM, icônes lucide). */
        document.addEventListener('click', function (e) {
            var t = e.target;
            if (!t || !t.closest) return;
            if (!t.closest('#btn-vue-3d')) return;
            var m = mapActuelle || (typeof window !== 'undefined' && window.map) || ControleVue3D._map;
            basculer(m);
        }, true);
        var poser = function () {
            try {
                if (!map || !map.loaded()) return;
                if (!document.getElementById('btn-vue-3d')) map.addControl(ControleVue3D, 'top-right');
                if (!document.getElementById('panneau-3d-cadre') && map.getContainer()) map.getContainer().appendChild(creerPanneau(map));
                map.on('error', function (e) {
                    if (!e || e.sourceId !== ID_SOURCE_DEM || basculeDEMArmee) return;
                    basculeDEMArmee = true;
                    essayerDEMSuivante();
                });
                if (window.lucide) window.lucide.createIcons();
            } catch (e) {
                if (window.console && console.error) console.error('[mode-3d] pose des contrôles impossible:', e);
            }
        };
        if (map.loaded()) {
            poser();
        } else {
            map.on('load', poser);
            map.once('idle', poser);
        }
        var essais = 0;
        var relance = setInterval(function () {
            essais += 1;
            if (essais > 20 || (document.getElementById('btn-vue-3d') && document.getElementById('panneau-3d-cadre'))) {
                clearInterval(relance);
                return;
            }
            if (map && typeof map.loaded === 'function' && map.loaded()) poser();
        }, 700);
    }

    function init() {
        if (typeof window === 'undefined' || !window.map) return;
        installer({ map: window.map });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    Mode3D.installer = installer;
    Mode3D.activer = activer;
    Mode3D.desactiver = desactiver;
    Mode3D.basculer = basculer;
    Mode3D.vueAerienne = vueAerienne;
    Mode3D.vueHorizontale = vueHorizontale;
})();
