/* MUKMAP — Gestionnaire de fonds de carte professionnel (Mode Avancé).
 * Core exposé sous globalThis.BasemapSelectorCore : testable en Node.
 * Catalogue par catégories (Cartographie générale, Imagerie, Topographie,
 * Environnement, Géologie, Mines). Les fonds intégrés restent compatibles
 * avec le mécanisme historique (sources "bm-<id>", boutons .bm-btn) :
 * les nouveaux fonds créent leurs sources à la demande, sans toucher aux
 * couches de données (insérés sous la première couche de données "clusters").
 * Attribution systématique (licences des fournisseurs respectées).
 */
(function () {
    'use strict';

    var CATEGORIES = [
        { id: 'generale', cle: 'basemap_cat_generale', icone: 'map' },
        { id: 'imagerie', cle: 'basemap_cat_imagerie', icone: 'satellite' },
        { id: 'topographie', cle: 'basemap_cat_topographie', icone: 'mountain' },
        { id: 'thematique', cle: 'basemap_cat_thematique', icone: 'layers' },
        { id: 'environnement', cle: 'basemap_cat_environnement', icone: 'leaf' },
        { id: 'geologie', cle: 'basemap_cat_geologie', icone: 'layers' },
        { id: 'mines', cle: 'basemap_cat_mines', icone: 'pickaxe' }
    ];

    var FONDS = {
        // ── Cartographie générale ──
        osm: { cat: 'generale', nom: 'OpenStreetMap', sw: 'linear-gradient(135deg,#7dd3fc,#2563eb)', tiles: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap' },
        hot: { cat: 'generale', nom: 'OSM Humanitaire', sw: 'linear-gradient(135deg,#fbbf24,#d97706)', tiles: 'https://tile-{s}.openstreetmap.fr/hot/{z}/{x}/{y}.png', attribution: '© OSM HOT' },
        rue: { cat: 'generale', nom: 'Carte routière (Esri)', sw: 'linear-gradient(135deg,#bfdbfe,#60a5fa)', tiles: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', attribution: '© Esri — World Street Map' },
        voyager: { cat: 'generale', nom: 'Urbaine (Carto Voyager)', sw: 'linear-gradient(135deg,#fed7aa,#f97316)', tiles: 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', attribution: '© CARTO © OpenStreetMap' },
        light: { cat: 'generale', nom: 'Claire (Positron)', sw: 'linear-gradient(135deg,#f8fafc,#e2e8f0)', tiles: 'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', attribution: '© CARTO © OpenStreetMap' },
        dark: { cat: 'generale', nom: 'Sombre (Dark Matter)', sw: 'linear-gradient(135deg,#1e293b,#0f172a)', tiles: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attribution: '© CARTO © OpenStreetMap' },
        admin: { cat: 'generale', nom: 'Administrative (limites & toponymes)', sw: 'linear-gradient(135deg,#f1f5f9,#cbd5e1)', tiles: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', attribution: '© Esri — World Boundaries and Places' },
        natgeo: { cat: 'generale', nom: 'Internationale (NatGeo)', sw: 'linear-gradient(135deg,#fef3c7,#f59e0b)', tiles: 'https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}', attribution: '© Esri, National Geographic' },
        minimal: { cat: 'generale', nom: 'Minimaliste (Esri Canvas)', sw: 'linear-gradient(135deg,#f8fafc,#cbd5e1)', tiles: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', attribution: '© Esri — Light Gray Canvas' },
        // ── Imagerie ──
        sat: { cat: 'imagerie', nom: 'Satellite (Esri)', sw: 'linear-gradient(135deg,#334155,#0f172a)', tiles: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: '© Esri, Maxar, Earthstar Geographics' },
        sat_firefly: { cat: 'imagerie', nom: 'Satellite HD (Esri Firefly)', sw: 'linear-gradient(135deg,#1e3a8a,#0c4a6e)', tiles: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery_Firefly/MapServer/tile/{z}/{y}/{x}', attribution: '© Esri, Maxar, Earthstar Geographics' },
        s2: { cat: 'imagerie', nom: 'Sentinel-2 sans nuages (EOX)', sw: 'linear-gradient(135deg,#14532d,#16a34a)', tiles: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg', attribution: '© EOX — Sentinel-2 cloudless (CC-BY)' },
        blue_marble: { cat: 'imagerie', nom: 'Blue Marble (NASA)', sw: 'linear-gradient(135deg,#0c4a6e,#38bdf8)', tiles: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg', attribution: '© NASA GIBS — Blue Marble' },
        sat_labels: { cat: 'imagerie', nom: 'Satellite + labels (Esri)', sw: 'linear-gradient(135deg,#312e81,#6366f1)', tiles: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', labelsTiles: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', attribution: '© Esri, Maxar — avec limites & toponymes' },
        s2_2018: { cat: 'imagerie', nom: 'Historique Sentinel-2 2018 (EOX)', sw: 'linear-gradient(135deg,#3f6212,#84cc16)', tiles: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2018_3857/default/g/{z}/{y}/{x}.jpg', attribution: '© EOX — Sentinel-2 cloudless 2018 (CC-BY)' },
        wayback: { cat: 'imagerie', nom: 'Historique Esri Wayback 2023', sw: 'linear-gradient(135deg,#57534e,#a8a29e)', tiles: 'https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/56102/{z}/{y}/{x}', attribution: '© Esri — Wayback World Imagery (2023-12-07)' },
        ortho: { cat: 'imagerie', nom: 'Orthophoto (vos données)', sw: 'linear-gradient(135deg,#166534,#4ade80)', tiles: null, attribution: 'Orthophotos haute résolution — importer vos données via le module Imagerie aérienne' },
        aerienne: { cat: 'imagerie', nom: 'Imagerie aérienne (vos données)', sw: 'linear-gradient(135deg,#78350f,#f59e0b)', tiles: null, attribution: 'Prises de vues aériennes géoréférencées — panneau Imagerie aérienne' },
        ms_ndvi: { cat: 'imagerie', nom: 'Multispectrale / NDVI', sw: 'linear-gradient(135deg,#831843,#f472b6)', tiles: null, attribution: 'Indices multispectraux (NDVI, compositions) — importer un raster ou connecter un WMS' },
        // ── Topographie ──
        topo: { cat: 'topographie', nom: 'Topographique (OpenTopoMap)', sw: 'linear-gradient(135deg,#d6f5d6,#a7d8a7)', tiles: 'https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png', attribution: '© OpenTopoMap (CC-BY-SA)' },
        esri_topo: { cat: 'topographie', nom: 'Topographique (Esri)', sw: 'linear-gradient(135deg,#c8e6c9,#81c784)', tiles: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', attribution: '© Esri — World Topo Map' },
        relief: { cat: 'topographie', nom: 'Relief (hillshade Esri)', sw: 'linear-gradient(135deg,#cbd5e1,#94a3b8)', tiles: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}', attribution: '© Esri — Shaded Relief' },
        hillshade: { cat: 'topographie', nom: 'Hillshade pur (Esri)', sw: 'linear-gradient(135deg,#e2e8f0,#64748b)', tiles: 'https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}', attribution: '© Esri — World Hillshade (DEM)' },
        terrain_eox: { cat: 'topographie', nom: 'Terrain (EOX)', sw: 'linear-gradient(135deg,#d6d3d1,#78716c)', tiles: 'https://tiles.maps.eox.at/wmts/1.0.0/terrain-light_3857/default/g/{z}/{y}/{x}.jpg', attribution: '© EOX — Terrain Light (SRTM, EUDEM)' },
        hypsometrie: { cat: 'topographie', nom: 'Carte hypsométrique (EOX)', sw: 'linear-gradient(135deg,#86efac,#b45309)', tiles: 'https://tiles.maps.eox.at/wmts/1.0.0/terrain_3857/default/g/{z}/{y}/{x}.jpg', attribution: '© EOX — Terrain (teintes hypsométriques)' },
        courbes: { cat: 'topographie', nom: 'Courbes de niveau (données requises)', sw: 'linear-gradient(135deg,#f5f5f4,#a8a29e)', tiles: null, attribution: 'Vecteurs d’isohypses (Copernicus DEM) — OpenTopoMap en affiche ; connecter un WMS ou un service MVT' },
        dem: { cat: 'topographie', nom: 'Modèle numérique d’élévation', sw: 'linear-gradient(135deg,#475569,#0f172a)', tiles: null, attribution: 'DEM Mapzen Terrarium (SRTM) — déjà actif dans la vue 3D du terrain (panneau Terrain 3D)' },
        // ── Couches thématiques (superposables en tant que fond) ──
        couverture_sol: { cat: 'thematique', nom: 'Couverture du sol (ESA WorldCover 10 m)', sw: 'linear-gradient(135deg,#065f46,#6ee7b7)', tiles: 'https://data.apps.fao.org/map/wmts/wmts?service=WMTS&request=GetTile&version=1.0.0&layer=ESA/WorldCover/v100&tilematrixset=EPSG:900913&TileMatrix={z}&TileCol={x}&TileRow={y}&Format=image/png&style=default', attribution: '© ESA WorldCover 2021 (Sentinel-1/2), 11 classes (CC-BY 4.0) — FAO' },
        eaux_surface: { cat: 'thematique', nom: 'Eaux de surface (JRC GSW)', sw: 'linear-gradient(135deg,#1e3a8a,#60a5fa)', tiles: 'https://data.apps.fao.org/map/wmts/wmts?service=WMTS&request=GetTile&version=1.0.0&layer=JRC/GSW1_3/GlobalSurfaceWater&tilematrixset=EPSG:900913&TileMatrix={z}&TileCol={x}&TileRow={y}&Format=image/png&style=default', attribution: '© JRC Global Surface Water 1984-2021 (30 m) — lacs, fleuves, zones inondées — FAO' },
        occupation_sol: { cat: 'thematique', nom: 'Occupation du sol (données requises)', sw: 'linear-gradient(135deg,#92400e,#fbbf24)', tiles: null, attribution: 'Usages (agriculture, urbain, mines) — données locales via WMS ou import' },
        forets: { cat: 'thematique', nom: 'Forêts (données requises)', sw: 'linear-gradient(135deg,#14532d,#22c55e)', tiles: null, attribution: 'Classe « arbres » du WorldCover (vert foncé) ; Hansen/GFW ou données locales via WMS' },
        zones_protegees: { cat: 'thematique', nom: 'Zones protégées (données requises)', sw: 'linear-gradient(135deg,#1e40af,#3b82f6)', tiles: null, attribution: 'WDPA (Protected Planet) — via WMS ou import' },
        zones_humides: { cat: 'thematique', nom: 'Zones humides (données requises)', sw: 'linear-gradient(135deg,#0e7490,#22d3ee)', tiles: null, attribution: 'Classes « zones humides herbacées »/« mangroves » du WorldCover ; Ramsar via WMS/import' },
        hydrographie: { cat: 'thematique', nom: 'Hydrographie détaillée (données requises)', sw: 'linear-gradient(135deg,#0c4a6e,#38bdf8)', tiles: null, attribution: 'Réseau vectoriel (HydroRIVERS, OSM waterway) via WMS/import' },
        bassins_versants: { cat: 'thematique', nom: 'Bassins versants (données requises)', sw: 'linear-gradient(135deg,#4338ca,#818cf8)', tiles: null, attribution: 'HydroBASINS (HydroSHEDS) ou AQUASTAT via WMS/import' },
        cours_eau: { cat: 'thematique', nom: 'Cours d’eau (données requises)', sw: 'linear-gradient(135deg,#075985,#0ea5e9)', tiles: null, attribution: 'HydroRIVERS ou OSM waterway via WMS/import ; GSW couvre les lits larges' },
        lacs: { cat: 'thematique', nom: 'Lacs (données requises)', sw: 'linear-gradient(135deg,#0f766e,#2dd4bf)', tiles: null, attribution: 'GLWD ou données locales via WMS/import ; GSW couvre les plans d’eau permanents' },
        zones_sensibles: { cat: 'thematique', nom: 'Zones environnementales sensibles', sw: 'linear-gradient(135deg,#7f1d1d,#f87171)', tiles: null, attribution: 'Habitats critiques, aires sensibles — données locales via WMS ou import' },
        // ── Environnement ──
        ocean: { cat: 'environnement', nom: 'Hydrographie (Esri Océan)', sw: 'linear-gradient(135deg,#bae6fd,#0284c7)', tiles: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}', attribution: '© Esri — Ocean Basemap' },
        physique: { cat: 'environnement', nom: 'Physique (Esri)', sw: 'linear-gradient(135deg,#a5b4fc,#6d28d9)', tiles: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}', attribution: '© Esri — World Physical Map' },
        // ── Géologie (WMS mondiaux + détails via données locales) ──
        geo_unites: { cat: 'geologie', nom: 'Unités géologiques (CGMW 1:50M)', sw: 'linear-gradient(135deg,#e9d5ff,#9333ea)', tiles: 'http://mapsref.brgm.fr/wxs/1GG/CGMW_Bedrock_and_Structural_Geology?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=World_CGMW_50M_GeologicalUnitsOnshore&STYLES=&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=TRUE', attribution: '© CGMW/BRGM — Unités géologiques du monde (1:50M)' },
        geo_formations: { cat: 'geologie', nom: 'Formations géologiques (données requises)', sw: 'linear-gradient(135deg,#ddd6fe,#8b5cf6)', tiles: null, attribution: 'Détail des formations (étage, système, groupe) — cartes nationales via WMS ou import' },
        geo_lithologie: { cat: 'geologie', nom: 'Lithologie (données requises)', sw: 'linear-gradient(135deg,#c084fc,#6d28d9)', tiles: null, attribution: 'Nature des roches (granite, basalte, grès…) — via WMS ou import' },
        geo_failles: { cat: 'geologie', nom: 'Failles détaillées (données requises)', sw: 'linear-gradient(135deg,#a78bfa,#5b21b6)', tiles: null, attribution: 'Failles régionales vectorielles — via WMS ou import ; CGMW 1:50M ne montre que les grands accidents' },
        geo_fractures: { cat: 'geologie', nom: 'Fractures (données requises)', sw: 'linear-gradient(135deg,#8b5cf6,#4c1d95)', tiles: null, attribution: 'Réseau de fractures et diaclases — cartographie détaillée via WMS ou import' },
        geo_structures: { cat: 'geologie', nom: 'Failles & structures majeures (CGMW 1:50M)', sw: 'linear-gradient(135deg,#c4b5fd,#7c3aed)', tiles: 'http://mapsref.brgm.fr/wxs/1GG/CGMW_Bedrock_and_Structural_Geology?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=World_CGMW_50M_Structural&STYLES=&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=TRUE', attribution: '© CGMW/BRGM — Failles et structures majeures du monde (1:50M)' },
        geo_contacts: { cat: 'geologie', nom: 'Contacts géologiques (données requises)', sw: 'linear-gradient(135deg,#b794f6,#6b21a8)', tiles: null, attribution: 'Limites entre unités (contacts conformes, faillés, intrusifs) — via WMS ou import' },
        geo_pendage: { cat: 'geologie', nom: 'Pendage (données requises)', sw: 'linear-gradient(135deg,#c4b5fd,#7e22ce)', tiles: null, attribution: 'Mesures de pendage (inclinaison des couches) — relevés de terrain via import' },
        geo_direction: { cat: 'geologie', nom: 'Direction des couches (données requises)', sw: 'linear-gradient(135deg,#a78bfa,#6d28d9)', tiles: null, attribution: 'Orientations des couches (azimuths) — relevés de terrain via import' },
        geo_affleurements: { cat: 'geologie', nom: 'Affleurements (données requises)', sw: 'linear-gradient(135deg,#e9d5ff,#a21caf)', tiles: null, attribution: 'Surfaces rocheuses visibles — relevés de terrain ou photo-interprétation via import' },
        geo_mineralisations: { cat: 'geologie', nom: 'Minéralisations (données requises)', sw: 'linear-gradient(135deg,#fcd34d,#b45309)', tiles: null, attribution: 'Zones minéralisées (Cu, Co, Sn, Ta, Au…) — données provinciales via WMS ou import' },
        geo_gisements: { cat: 'geologie', nom: 'Gisements miniers majeurs (USGS)', sw: 'linear-gradient(135deg,#fde68a,#d97706)', tiles: 'https://mrdata.usgs.gov/services/ofr20051294?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=commodity&STYLES=&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=TRUE', attribution: '© USGS — Major mineral deposits of the world' },
        geo_indices: { cat: 'geologie', nom: 'Indices miniers MRDS (USGS)', sw: 'linear-gradient(135deg,#fbbf24,#92400e)', tiles: 'https://mrdata.usgs.gov/services/mrds?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=mrds-low&STYLES=&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=TRUE', attribution: '© USGS — Mineral Resources Data System (occurrences mondiales)' },
        // ── Mines (WMS USGS + données cadastrales locales) ──
        mine_permis: { cat: 'mines', nom: 'Permis & concessions (données requises)', sw: 'linear-gradient(135deg,#fde68a,#a16207)', tiles: null, attribution: 'Titres miniers (CAMI, cadastres provinciaux) — via WMS ou import' },
        mine_sites: { cat: 'mines', nom: 'Sites miniers (USGS)', sw: 'linear-gradient(135deg,#fcd34d,#ca8a04)', tiles: 'https://mrdata.usgs.gov/services/minfac?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=minfac-low&STYLES=&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=TRUE', attribution: '© USGS — Mineral operations outside the United States' },
        mine_indices: { cat: 'mines', nom: 'Indices miniers MRDS (USGS)', sw: 'linear-gradient(135deg,#fbbf24,#92400e)', tiles: 'https://mrdata.usgs.gov/services/mrds?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=mrds-low&STYLES=&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=TRUE', attribution: '© USGS — Mineral Resources Data System (occurrences mondiales)' },
        mine_gisements: { cat: 'mines', nom: 'Gisements miniers majeurs (USGS)', sw: 'linear-gradient(135deg,#fde68a,#d97706)', tiles: 'https://mrdata.usgs.gov/services/ofr20051294?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=commodity&STYLES=&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=TRUE', attribution: '© USGS — Major mineral deposits of the world' },
        mine_cu_cobalt: { cat: 'mines', nom: 'Cuivre-Cobalt (USGS, Copperbelt)', sw: 'linear-gradient(135deg,#fdba74,#ea580c)', tiles: 'https://mrdata.usgs.gov/services/sedcu?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=sedcu&STYLES=&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=TRUE', attribution: '© USGS — Dépôts de cuivre sédimentaires (Katanga, Copperbelt)' },
        mine_substances: { cat: 'mines', nom: 'Substances & minerais (données requises)', sw: 'linear-gradient(135deg,#fcd34d,#b45309)', tiles: null, attribution: 'Au, Sn, Ta, Nb, W, coltan… par gisement — données locales via WMS ou import' },
        mine_exploration: { cat: 'mines', nom: 'Zones d’exploration (données requises)', sw: 'linear-gradient(135deg,#fde68a,#ca8a04)', tiles: null, attribution: 'Permis de recherche et blocs d’exploration — cadastre minier via WMS ou import' },
        mine_sondages: { cat: 'mines', nom: 'Sondages (données requises)', sw: 'linear-gradient(135deg,#fef3c7,#d97706)', tiles: null, attribution: 'Forages carottés, analyses et logs — base de sondages via import' },
        mine_puits: { cat: 'mines', nom: 'Puits (données requises)', sw: 'linear-gradient(135deg,#fde68a,#b45309)', tiles: null, attribution: 'Puits de mine et descenderies — relevés via WMS ou import' },
        mine_galeries: { cat: 'mines', nom: 'Galeries (données requises)', sw: 'linear-gradient(135deg,#fbbf24,#92400e)', tiles: null, attribution: 'Galeries et travers-bancs souterrains — plans miniers via import' },
        mine_carrieres: { cat: 'mines', nom: 'Carrières (données requises)', sw: 'linear-gradient(135deg,#f59e0b,#78350f)', tiles: null, attribution: 'Carrières de granulats, pierre, argile — via WMS ou import' },
        mine_infrastructures: { cat: 'mines', nom: 'Infrastructures minières (données requises)', sw: 'linear-gradient(135deg,#d97706,#92400e)', tiles: null, attribution: 'Usines de traitement, bassins, dépôts, cités — via WMS ou import' },
        mine_routes: { cat: 'mines', nom: 'Routes d’accès (données requises)', sw: 'linear-gradient(135deg,#fbbf24,#78350f)', tiles: null, attribution: 'Pistes et routes de desserte des sites — OSM ou relevés via import' },
        mine_exploitation: { cat: 'mines', nom: 'Zones d’exploitation (données requises)', sw: 'linear-gradient(135deg,#fcd34d,#b45309)', tiles: null, attribution: 'Emprises d’extraction actives — concessions et sites via WMS ou import' }
    };

    /* Fonds personnalisés chargés depuis l'API (/api/fonds-personnalises/).
     * Chaque entrée reçoit un id "ext-<pk>". */
    var EXTERNES = {};

    function formaterURLWMTS(url) {
        try {
            if (url.indexOf('{TileMatrix}') === -1 && url.indexOf('{TileCol}') === -1) return url;
            return url
                .replace(/\{TileMatrix\}/g, '{z}')
                .replace(/\{TileCol\}/g, '{x}')
                .replace(/\{TileRow\}/g, '{y}');
        } catch (e) {
            return url;
        }
    }

    /* Opérations de lecture : ports vers l'API. */
    function chargerExternes(opts) {
        var map = opts && opts.map ? opts.map : mapRef;
        if (map) mapRef = map;
        if (opts && opts.appliquerExterne) appliquerExterne = opts.appliquerExterne;
        return fetch('/api/fonds-personnalises/', {
            credentials: 'same-origin',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function (data) {
            EXTERNES = {};
            var liste = (data && data.fonds) || [];
            liste.forEach(function (f) {
                var url = f.type === 'wmts' ? formaterURLWMTS(f.url) : f.url;
                if (f.cle_api && url.indexOf('{cle_api}') !== -1) {
                    url = url.replace(/\{cle_api\}/g, f.cle_api);
                }
                var tiles = url;
                if ((f.type === 'geotiff' || f.type === 'mbtiles') &&
                    url.indexOf('{z}') === -1 && url.indexOf('{TileMatrix}') === -1) {
                    tiles = null; /* fichier seul : enregistré, non affichable sans service de tuiles */
                }
                EXTERNES[f.id] = {
                    cat: f.categorie || 'generale',
                    nom: f.nom || f.id,
                    sw: 'linear-gradient(135deg,#d8b4fe,#7c3aed)',
                    tiles: tiles,
                    attribution: f.attribution || '',
                    type: f.type || 'xyz',
                    crs: f.crs || 'EPSG:3857',
                    layers: f.layers || '',
                    pk: f.pk,
                    perso: true
                };
            });
            return liste;
        });
    }

    function tousIds() {
        return Object.keys(FONDS).concat(Object.keys(EXTERNES));
    }

    function trouver(id) {
        if (!id) return null;
        if (FONDS[id]) return Object.assign({ id: id }, FONDS[id]);
        if (EXTERNES[id]) return Object.assign({ id: id }, EXTERNES[id]);
        return null;
    }

    function construireCatalogue() {
        var categories = CATEGORIES.map(function (c) {
            var fonds = [];
            Object.keys(FONDS).forEach(function (k) {
                if (FONDS[k].cat === c.id) fonds.push(Object.assign({ id: k }, FONDS[k]));
            });
            Object.keys(EXTERNES).forEach(function (k) {
                if (EXTERNES[k].cat === c.id) fonds.push(Object.assign({ id: k }, EXTERNES[k]));
            });
            return { id: c.id, cle: c.cle, icone: c.icone, basemaps: fonds };
        });
        return categories;
    }

    function catalogue() {
        return construireCatalogue();
    }

    function obtenir(id) {
        return trouver(id);
    }

    function idsCatalogue() {
        return tousIds();
    }

    function attributionDe(id) {
        var f = trouver(id);
        return f ? (f.attribution || '') : '';
    }

    function peutAfficher(id) {
        var f = trouver(id);
        return !!(f && f.tiles != null);
    }

    function categorieDe(id) {
        var f = trouver(id);
        return f ? f.cat : null;
    }

    function disposition(id) {
        var f = trouver(id);
        return id ? (f && f.disposition) || 'bas' : 'bas';
    }

    /* Planifie le changement de fond sans toucher au DOM :
     *  - cible inconnue → {erreur}
     *  - sources déjà créées sur la carte (idsExistants) → bascule visibilité
     *  - fonds jamais chargés → à créer (creer), puis afficher
     */
    function planifierChangement(idCible, idsExistants) {
        if (!idCible || !trouver(idCible)) return { erreur: 'fonds inconnu' };
        var existants = Array.isArray(idsExistants) ? idsExistants : [];
        var masquer = idsCatalogue().filter(function (k) {
            return k !== idCible && existants.indexOf(k) !== -1;
        });
        var creer = [];
        if (existants.indexOf(idCible) === -1) creer.push(idCible);
        return { afficher: idCible, masquer: masquer, creer: creer };
    }

    /* Point d'insertion des fonds : sous "clusters" (données), mais aussi
     * sous la première couche WMS présente — les couches WMS restent
     * toujours superposées au fond de carte. */
    function idInsertionBas(map) {
        try {
            var layers = map.getStyle().layers || [];
            for (var i = 0; i < layers.length; i++) {
                var id = layers[i].id;
                if (id === 'clusters') return 'clusters';
                if (id.indexOf('wms-') === 0) return id;
            }
        } catch (e) {}
        return 'clusters';
    }

    /* Applique le changement sur la carte (adapter MapLibre).
     * Les nouveaux fonds sont insérés sous "clusters" pour ne jamais
     * recouvrir les couches de données. Les fonds hybrides (labelsTiles)
     * ajoutent une couche d'étiquettes au-dessus du raster, toujours sous
     * les données, et masquée/affichée avec le fond.
     */
    function appliquer(map, idCible) {
        if (!map || !idCible || !trouver(idCible)) return false;
        if (typeof map.loaded === 'function' && !map.loaded()) return false;
        var plan = planifierChangement(idCible, idsExistants(map));
        if (plan.erreur) return false;
        var avant = idInsertionBas(map);
        plan.creer.forEach(function (id) {
            var f = trouver(id);
            if (f.tiles == null) return;
            try {
                var vecteur = f.type === 'vector' && f.layers;
                if (!map.getSource('bm-' + id)) {
                    map.addSource('bm-' + id, vecteur
                        ? { type: 'vector', tiles: [f.tiles], attribution: f.attribution }
                        : { type: 'raster', tiles: [f.tiles], tileSize: 256, attribution: f.attribution });
                }
                if (map.getLayer && !map.getLayer('bm-' + id)) {
                    var spec = vecteur
                        ? { id: 'bm-' + id, type: 'fill', source: 'bm-' + id, 'source-layer': f.layers, layout: { visibility: 'none' }, paint: { 'fill-color': '#7c3aed', 'fill-opacity': 0.35 } }
                        : { id: 'bm-' + id, type: 'raster', source: 'bm-' + id, layout: { visibility: 'none' } };
                    try {
                        map.addLayer(spec, avant);
                    } catch (e) {
                        map.addLayer(spec);
                    }
                }
                if (f.labelsTiles) {
                    if (!map.getSource('bm-' + id + '-labels')) {
                        map.addSource('bm-' + id + '-labels', { type: 'raster', tiles: [f.labelsTiles], tileSize: 256, attribution: f.attribution });
                    }
                    if (map.getLayer && !map.getLayer('bm-' + id + '-labels')) {
                        try {
                            map.addLayer({ id: 'bm-' + id + '-labels', type: 'raster', source: 'bm-' + id + '-labels', layout: { visibility: 'none' } }, avant);
                        } catch (e) {
                            map.addLayer({ id: 'bm-' + id + '-labels', type: 'raster', source: 'bm-' + id + '-labels', layout: { visibility: 'none' } });
                        }
                    }
                }
            } catch (e) {}
        });
        idsExistants(map).forEach(function (id) {
            try {
                map.setLayoutProperty('bm-' + id, 'visibility', id === idCible ? 'visible' : 'none');
            } catch (e) {}
            try {
                map.setLayoutProperty('bm-' + id + '-labels', 'visibility', id === idCible ? 'visible' : 'none');
            } catch (e) {}
        });
        return true;
    }

    function idsExistants(map) {
        var out = [];
        try {
            idsCatalogue().forEach(function (k) {
                if (map.getSource('bm-' + k)) out.push(k);
            });
        } catch (e) {}
        return out;
    }

    function attributions(id) {
        var f = trouver(id);
        return f ? (f.attribution || '') : '';
    }

    globalThis.BasemapSelectorCore = {
        construireCatalogue: construireCatalogue,
        catalogue: catalogue,
        obtenir: obtenir,
        idsCatalogue: idsCatalogue,
        categorieDe: categorieDe,
        peutAfficher: peutAfficher,
        planifierChangement: planifierChangement,
        appliquer: appliquer,
        attributions: attributions,
        idsExistants: idsExistants,
        chargerExternes: chargerExternes,
        tousIds: tousIds,
        trouver: trouver
    };

    if (typeof document === 'undefined') return;

    // ── UI : modal « Fonds de carte » (Mode Pro) ──
    var modale = null;
    var mapRef = null;
    var actifId = 'osm';
    var appliquerExterne = null;

    function trad(cle, defaut) {
        if (typeof window !== 'undefined' && window.mukmapT) {
            var v = window.mukmapT(cle);
            if (v) return v;
        }
        return defaut;
    }

    function baserStyle() {
        var base = document.createElement('style');
        base.textContent =
            '#modal-fonds { position: fixed; inset: 0; z-index: 1400; display: none; align-items: center; justify-content: center; background: rgba(8,10,24,.68); backdrop-filter: blur(6px); }' +
            '#modal-fonds.ouvert { display: flex; }' +
            '#modal-fonds .fonds-boite { width: min(780px, 94vw); max-height: 86vh; overflow: hidden; background: var(--bg-2); border: 1px solid var(--border); border-radius: 16px; box-shadow: var(--shadow); display: flex; flex-direction: column; }' +
            '#modal-fonds .fonds-tete { display: flex; align-items: center; justify-content: space-between; padding: 15px 18px; border-bottom: 1px solid var(--border); }' +
            '#modal-fonds .fonds-titre { display: flex; align-items: center; gap: 9px; font-weight: 800; font-size: .98rem; }' +
            '#modal-fonds .fonds-titre [data-lucide] { width: 19px; height: 19px; color: var(--accent); }' +
            '#modal-fonds .fonds-onglets { display: flex; gap: 6px; padding: 12px 18px 0; overflow-x: auto; flex-wrap: wrap; }' +
            '#modal-fonds .fonds-onglet { display: inline-flex; align-items: center; gap: 6px; padding: 7px 13px; border-radius: 999px; font-size: .72rem; font-weight: 700; background: var(--bg-3); color: var(--text-2); border: 1px solid var(--border); cursor: pointer; transition: all .15s; white-space: nowrap; }' +
            '#modal-fonds .fonds-onglet:hover { border-color: var(--accent); color: var(--accent); }' +
            '#modal-fonds .fonds-onglet.actif { background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: #fff; border-color: transparent; }' +
            '#modal-fonds .fonds-onglet [data-lucide] { width: 13px; height: 13px; }' +
            '#modal-fonds .fonds-corps { padding: 14px 18px 8px; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }' +
            '#modal-fonds .fonds-carte { border: 1px solid var(--border); border-radius: 12px; padding: 10px; background: var(--bg-3); cursor: pointer; transition: all .15s; display: flex; flex-direction: column; gap: 7px; }' +
            '#modal-fonds .fonds-carte.passif { opacity: .62; cursor: help; border-style: dashed; }' +
            '#modal-fonds .fonds-carte.passif:hover { border-color: var(--text-3); transform: none; }' +
            '#modal-fonds .fonds-carte:hover { border-color: var(--accent); transform: translateY(-1px); }' +
            '#modal-fonds .fonds-carte.actif { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(109,93,246,.28); }' +
            '#modal-fonds .fonds-vignette { height: 74px; border-radius: 9px; background-size: cover; background-position: center; display: flex; align-items: flex-end; justify-content: flex-end; padding: 4px; }' +
            '#modal-fonds .fonds-vignette .vf-pastille { width: 16px; height: 16px; border-radius: 50%; background: var(--green); border: 2px solid #fff; display: none; }' +
            '#modal-fonds .fonds-carte.actif .fonds-vignette .vf-pastille { display: block; }' +
            '#modal-fonds .fonds-nom { font-size: .76rem; font-weight: 700; }' +
            '#modal-fonds .fonds-attr { font-size: .62rem; color: var(--text-3); line-height: 1.35; }' +
            '#modal-fonds .fonds-vide { grid-column: 1 / -1; text-align: center; color: var(--text-3); font-size: .8rem; padding: 26px 0; }' +
            '#modal-fonds .fonds-pied { padding: 12px 18px; border-top: 1px solid var(--border); font-size: .68rem; color: var(--text-3); display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }' +
            '#modal-fonds .fonds-pied .fp-note { line-height: 1.5; max-width: 460px; }' +
            '#modal-fonds .fonds-pied .fonds-ajouter { display: inline-flex; align-items: center; gap: 5px; }' +
            '#modal-fonds .fonds-carte { position: relative; }' +
            '#modal-fonds .fonds-badge { position: absolute; left: 6px; bottom: 6px; font-size: .56rem; font-weight: 800; letter-spacing: .4px; background: rgba(0,0,0,.5); color: #fff; padding: 2px 5px; border-radius: 5px; }' +
            '#modal-fonds .fonds-suppr { position: absolute; top: 6px; right: 6px; width: 22px; height: 22px; border-radius: 50%; border: 1px solid var(--border); background: var(--bg-2); color: var(--text-2); font-size: .68rem; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: .92; }' +
            '#modal-fonds .fonds-suppr:hover { color: var(--red); border-color: var(--red); }' +
            '#modal-fonds .fonds-form { padding: 12px 18px; border-top: 1px solid var(--border); display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }' +
            '#modal-fonds .fonds-form input, #modal-fonds .fonds-form select { background: var(--bg-3); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; font-size: .74rem; width: 100%; box-sizing: border-box; }' +
            '#modal-fonds .fonds-form .ff-lbl { grid-column: 1 / -1; font-size: .64rem; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; color: var(--text-3); margin-top: 3px; }' +
            '#modal-fonds .fonds-form #ff-url, #modal-fonds .fonds-form #ff-mvt { grid-column: 1 / -1; }' +
            '#modal-fonds .fonds-form .ff-hint { grid-column: 1 / -1; font-size: .66rem; color: var(--text-3); }' +
            '#modal-fonds .fonds-form-actions { grid-column: 1 / -1; display: flex; gap: 8px; justify-content: flex-end; }' +
            '#modal-fonds .ff-erreur { grid-column: 1 / -1; color: var(--red); font-size: .7rem; }';
        document.head.appendChild(base);
    }

    function construireModale() {
        if (modale) return modale;
        baserStyle();
        var ov = document.createElement('div');
        ov.id = 'modal-fonds';
        ov.innerHTML =
            '<div class="fonds-boite">' +
            '<div class="fonds-tete">' +
            '<div class="fonds-titre"><span data-lucide="layers"></span><span>' + trad('basemap_titre', 'Fonds de carte') + '</span></div>' +
            '<button type="button" class="btn btn-icon btn-sm" id="fonds-fermer">✕</button>' +
            '</div>' +
            '<div class="fonds-onglets" id="fonds-onglets"></div>' +
            '<div class="fonds-corps" id="fonds-corps"></div>' +
            '<div class="fonds-form" id="fonds-form" style="display:none">' +
            '<input id="ff-nom" placeholder="' + trad('basemap_nom', 'Nom du fond') + '">' +
            '<label class="ff-lbl">' + trad('basemap_type', 'Type de service') + '</label>' +
            '<select id="ff-type">' +
            '<option value="xyz">' + trad('basemap_type_xyz', 'XYZ / tuiles raster') + '</option>' +
            '<option value="wms">' + trad('basemap_type_wms', 'WMS') + '</option>' +
            '<option value="wmts">' + trad('basemap_type_wmts', 'WMTS') + '</option>' +
            '<option value="vector">' + trad('basemap_type_vector', 'Vectoriel (MVT)') + '</option>' +
            '<option value="geotiff">' + trad('basemap_type_geotiff', 'GeoTIFF (COG)') + '</option>' +
            '<option value="mbtiles">' + trad('basemap_type_mbtiles', 'MBTiles') + '</option>' +
            '<option value="arcgis">' + trad('basemap_type_arcgis', 'ArcGIS REST (tuiles)') + '</option>' +
            '</select>' +
            '<select id="ff-cat"></select>' +
            '<label class="ff-lbl">' + trad('basemap_portee', 'Enregistrer dans') + '</label>' +
            '<select id="ff-portee">' +
            '<option value="personnel">' + trad('basemap_portee_personnel', 'Mes préférences (personnel)') + '</option>' +
            (window.SESSION_PROJET_ID ? '<option value="projet">' + trad('basemap_portee_projet', 'Projet actif') + '</option>' : '') +
            '</select>' +
            '<input id="ff-url" type="text" placeholder="https://…/{z}/{x}/{y}.png">' +
            '<div class="ff-hint">' + trad('basemap_exemple_url', 'Ex. XYZ : https://serveur/tiles/{z}/{x}/{y}.png — WMS : https://serveur/wms?service=WMS&layers=nom&…&bbox={bbox-epsg-3857}') + '</div>' +
            '<input id="ff-attrib" placeholder="' + trad('basemap_attribution_champ', 'Attribution (licence)') + '">' +
            '<input id="ff-cleapi" placeholder="' + trad('basemap_cle_api', 'Clé API (optionnelle)') + '">' +
            '<div class="ff-hint">' + trad('basemap_cle_api_hint', 'Placez {cle_api} dans l’URL : la clé est injectée à l’affichage.') + '</div>' +
            '<input id="ff-crs" type="text" value="EPSG:3857" list="ff-crs-list" placeholder="' + trad('basemap_crs', 'Projection / CRS') + '">' +
            '<datalist id="ff-crs-list"><option value="EPSG:3857"><option value="EPSG:4326"><option value="EPSG:900913"></datalist>' +
            '<div class="ff-hint">' + trad('basemap_crs_hint', 'MapLibre n’affiche que EPSG:3857 (Web Mercator).') + '</div>' +
            '<input id="ff-mvt" type="text" placeholder="' + trad('basemap_source_layer', 'Source-layer (MVT)') + '" style="display:none">' +
            '<div class="ff-hint" id="ff-mvt-hint" style="display:none">' + trad('basemap_source_layer_hint', 'Nom de la couche du tuilage vectoriel — requis pour afficher un service MVT.') + '</div>' +
            '<div class="ff-hint">' + trad('basemap_licences', 'Respectez les licences des fournisseurs : attribution obligatoire, usage autorisé.') + '</div>' +
            '<div class="ff-erreur" id="ff-erreur"></div>' +
            '<div class="fonds-form-actions">' +
            '<button type="button" class="btn btn-sm" id="ff-annuler">' + trad('basemap_annuler', 'Annuler') + '</button>' +
            '<button type="button" class="btn btn-sm btn-primary" id="ff-enregistrer">' + trad('basemap_enregistrer', 'Enregistrer') + '</button>' +
            '</div>' +
            '</div>' +
            '<div class="fonds-pied">' +
            '<span class="fp-note" id="fonds-attribution"></span>' +
            '<button type="button" class="btn btn-sm fonds-ajouter" id="fonds-ajouter"><span data-lucide="plus"></span>' + trad('basemap_ajouter', 'Nouveau fond') + '</button>' +
            '<span id="fonds-actuel"></span>' +
            '</div>' +
            '</div>';
        ov.addEventListener('click', function (e) { if (e.target === e.currentTarget) fermer(); });
        ov.querySelector('#fonds-fermer').addEventListener('click', fermer);
        majCategorieForm();
        ov.querySelector('#fonds-ajouter').addEventListener('click', function () { afficherFormulaire(); });
        ov.querySelector('#ff-annuler').addEventListener('click', masquerFormulaire);
        ov.querySelector('#ff-enregistrer').addEventListener('click', enregistrerExterne);
        ov.querySelector('#ff-type').addEventListener('change', function () { majChampMVT(); });
        document.body.appendChild(ov);
        modale = ov;
        return modale;
    }

    function majCategorieForm() {
        var sel = document.getElementById('ff-cat');
        if (!sel) return;
        sel.innerHTML = '';
        construireCatalogue().forEach(function (c) {
            var o = document.createElement('option');
            o.value = c.id;
            o.textContent = trad(c.cle, c.id);
            sel.appendChild(o);
        });
    }

    function afficherFormulaire() {
        if (!modale) return;
        modale.querySelector('#fonds-form').style.display = 'grid';
        var ongletActif = modale.querySelector('.fonds-onglet.actif');
        var catId = ongletActif ? ongletActif.dataset.cat : 'geologie';
        var sel = modale.querySelector('#ff-cat');
        if (sel) sel.value = catId;
        var erreur = modale.querySelector('#ff-erreur');
        if (erreur) erreur.textContent = '';
        majChampMVT();
    }

    function majChampMVT() {
        if (!modale) return;
        var type = modale.querySelector('#ff-type').value;
        var estVector = type === 'vector';
        var mvt = modale.querySelector('#ff-mvt');
        var hint = modale.querySelector('#ff-mvt-hint');
        if (mvt) mvt.style.display = estVector ? 'block' : 'none';
        if (hint) hint.style.display = estVector ? 'block' : 'none';
    }

    function masquerFormulaire() {
        if (modale) modale.querySelector('#fonds-form').style.display = 'none';
    }

    function csrfToken() {
        try {
            var m = document.cookie.match(/csrftoken=([^;]+)/);
            if (m) return m[1];
        } catch (e) {}
        return '';
    }

    function enregistrerExterne() {
        if (!modale) return;
        var err = modale.querySelector('#ff-erreur');
        var nom = modale.querySelector('#ff-nom').value.trim();
        var url = modale.querySelector('#ff-url').value.trim();
        var type = modale.querySelector('#ff-type').value;
        var att = modale.querySelector('#ff-attrib').value.trim();
        var cat = modale.querySelector('#ff-cat').value;
        var cleApi = modale.querySelector('#ff-cleapi').value.trim();
        var crs = (modale.querySelector('#ff-crs').value || 'EPSG:3857').trim();
        var mvt = modale.querySelector('#ff-mvt').value.trim();
        var porteeSel = modale.querySelector('#ff-portee');
        var portee = porteeSel ? porteeSel.value : 'personnel';
        if (!nom || !url) {
            if (err) err.textContent = trad('basemap_champs_requis', 'Nom et URL requis.');
            return;
        }
        if (type === 'vector' && !mvt) {
            if (err) err.textContent = trad('basemap_service_vecteur', 'Service vectoriel — source-layer requis');
            return;
        }
        var body = { nom: nom, type: type, url: url, attribution: att, categorie: cat, cle_api: cleApi, crs: crs, layers: mvt, portee: portee };
        if (portee === 'projet' && window.SESSION_PROJET_ID) body.projet = window.SESSION_PROJET_ID;
        fetch('/api/fonds-personnalises/', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken(), 'X-Requested-With': 'XMLHttpRequest' },
            body: JSON.stringify(body)
        }).then(function (r) {
            return r.json().then(function (d) { return { ok: r.ok, d: d }; });
        }).then(function (res) {
            if (!res.ok) {
                if (err) err.textContent = res.d.erreur || trad('basemap_erreur', 'Erreur lors de l’enregistrement.');
                return;
            }
            modale.querySelector('#ff-nom').value = '';
            modale.querySelector('#ff-url').value = '';
            modale.querySelector('#ff-attrib').value = '';
            modale.querySelector('#ff-cleapi').value = '';
            modale.querySelector('#ff-mvt').value = '';
            masquerFormulaire();
            return chargerExternes({ map: mapRef }).then(function () {
                var id = res.d.fond && res.d.fond.id;
                if (id) choisir(id);
                else rafraichirContenu();
            });
        }).catch(function () {
            if (err) err.textContent = trad('basemap_erreur', 'Erreur lors de l’enregistrement.');
        });
    }

    function supprimerExterne(id) {
        var f = obtenir(id);
        if (!f || !f.pk) return;
        if (!window.confirm(trad('basemap_confirmer_suppr', 'Supprimer ce fond de carte ?'))) return;
        fetch('/api/fonds-personnalises/' + f.pk + '/', {
            method: 'DELETE',
            credentials: 'same-origin',
            headers: { 'X-CSRFToken': csrfToken(), 'X-Requested-With': 'XMLHttpRequest' }
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            if (actifId === id) actifId = 'osm';
            return chargerExternes({ map: mapRef });
        }).then(function () {
            rafraichirContenu();
        }).catch(function () {
            if (modale) {
                var err = modale.querySelector('#ff-erreur');
                if (err) err.textContent = trad('basemap_erreur', 'Erreur lors de l’enregistrement.');
            }
        });
    }

    function ouvrir(map, actifIdCourant, externes) {
        mapRef = map || mapRef;
        if (actifIdCourant) actifId = actifIdCourant;
        if (externes && typeof externes === 'function') appliquerExterne = externes;
        var ov = construireModale();
        majOnglets();
        ov.classList.add('ouvert');
        rafraichirContenu();
        if (window.lucide) window.lucide.createIcons();
    }

    function fermer() {
        if (modale) modale.classList.remove('ouvert');
    }

    function majOnglets() {
        var cont = modale.querySelector('#fonds-onglets');
        cont.innerHTML = '';
        construireCatalogue().forEach(function (cat, i) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'fonds-onglet' + (i === 0 ? ' actif' : '');
            b.dataset.cat = cat.id;
            b.innerHTML = '<span data-lucide="' + cat.icone + '"></span>' + trad(cat.cle, cat.id);
            b.addEventListener('click', function () {
                cont.querySelectorAll('.fonds-onglet').forEach(function (x) { x.classList.toggle('actif', x === b); });
                rafraichirContenu();
            });
            cont.appendChild(b);
        });
    }

    function rafraichirContenu() {
        if (!modale) return;
        var ongletActif = modale.querySelector('.fonds-onglet.actif');
        var catId = ongletActif ? ongletActif.dataset.cat : (construireCatalogue()[0] || {}).id;
        var cat = construireCatalogue().filter(function (c) { return c.id === catId; })[0];
        var corps = modale.querySelector('#fonds-corps');
        corps.innerHTML = '';
        if (!cat || !cat.basemaps.length) {
            corps.innerHTML = '<div class="fonds-vide">' + trad('basemap_aucun', 'Aucun fond dans cette catégorie.') + '</div>';
        }
        cat.basemaps.forEach(function (f) {
            var carte = document.createElement('div');
            var passif = f.tiles == null;
            carte.className = 'fonds-carte' + (f.id === actifId ? ' actif' : '') + (passif ? ' passif' : '');
            carte.dataset.id = f.id;
            var vignette = f.tiles
                ? '<div class="fonds-vignette" style="background:' + f.sw + '"><span class="vf-pastille"></span></div>'
                : '<div class="fonds-vignette" style="background:repeating-linear-gradient(45deg,' + f.sw + ',' + f.sw + ' 10px,#ffffff22 10px,#ffffff22 20px)"><span class="vf-pastille"></span></div>';
            var badge = f.perso ? '<span class="fonds-badge">' + (f.type || '').toUpperCase() + '</span>' : '';
            var suppr = f.perso ? '<button type="button" class="fonds-suppr" data-id="' + f.id + '" title="' + trad('basemap_supprimer', 'Supprimer') + '">✕</button>' : '';
            carte.innerHTML = suppr + vignette + badge +
                '<div class="fonds-nom">' + f.nom + '</div>' +
                '<div class="fonds-attr">' + f.attribution + '</div>';
            carte.addEventListener('click', function () {
                if (passif) {
                    var note = document.getElementById('fonds-actuel');
                    if (note) note.textContent = trad('basemap_donnees_requises', 'Fond nécessitant des données locales — ajoutez une couche WMS ou importez des données.');
                    return;
                }
                choisir(f.id);
            });
            var btnSuppr = carte.querySelector('.fonds-suppr');
            if (btnSuppr) {
                btnSuppr.addEventListener('click', function (ev) {
                    ev.stopPropagation();
                    supprimerExterne(f.id);
                });
            }
            corps.appendChild(carte);
        });
        majPied();
        if (window.lucide) window.lucide.createIcons();
    }

    function choisir(id) {
        if (!mapRef) return;
        if (!peutAfficher(id)) {
            var f = obtenir(id);
            var note = document.getElementById('fonds-actuel');
            if (note) note.textContent = trad('basemap_donnees_requises', 'Fond nécessitant des données locales — ajoutez une couche WMS ou importez des données.');
            return;
        }
        if (!mapRef.loaded()) {
            var noteCh = document.getElementById('fonds-actuel');
            if (noteCh) noteCh.textContent = trad('basemap_chargement', 'Carte en cours de chargement… nouvelle tentative automatique.');
            mapRef.once('idle', function () {
                if (mapRef.loaded()) appliquer(mapRef, id);
            });
            return;
        }
        actifId = id;
        var ok = appliquer(mapRef, id);
        if (!ok) return;
        if (appliquerExterne) {
            try { appliquerExterne(id); } catch (e) {}
        }
        try { localStorage.setItem('mukmap_basemap', id); } catch (e) {}
        rafraichirContenu();
    }

    function majPied() {
        if (!modale) return;
        var f = obtenir(actifId);
        var attr = document.getElementById('fonds-attribution');
        var act = document.getElementById('fonds-actuel');
        if (attr) attr.textContent = trad('basemap_attribution', 'Attribution du fond actif :') + ' ' + (f ? f.attribution : '');
        if (act) act.textContent = trad('basemap_actuel', 'Fond actuel :') + ' ' + (f ? f.nom : '');
    }

    function relirePreference() {
        try {
            var v = localStorage.getItem('mukmap_basemap');
            if (v && trouver(v)) actifId = v;
        } catch (e) {}
        return actifId;
    }

    globalThis.BasemapSelector = {
        ouvrir: ouvrir,
        fermer: fermer,
        choisir: choisir,
        actifId: function () { return actifId; },
        relirePreference: relirePreference,
        chargerExternes: chargerExternes,
        supprimerExterne: supprimerExterne,
        installer: function (opts) {
            mapRef = opts && opts.map ? opts.map : mapRef;
            if (opts && opts.appliquerExterne) appliquerExterne = opts.appliquerExterne;
            if (opts && opts.actif) actifId = opts.actif;
        }
    };
})();