# -*- coding: utf-8 -*-
"""Cahier des charges n°25 : détection automatique des coordonnées, choix interactif,
formats GeoJSON/KML/GPX, règle « jamais 0 point silencieux ».
Partie 2 : import AJAX avec options de style (couleur, symbole, taille, étiquettes, catégorisation)."""

import io
import json

from django.core.files.uploadedfile import InMemoryUploadedFile

from cartographie.models import CoucheGeometrie, Geometrie

from .base import BaseCartographieTest


class TestsCoordonnees(BaseCartographieTest):
    """Détection des colonnes de coordonnées et formats d'import."""

    def test_csv_standard_3d_toutes_colonnes(self):
        csv = b'ID,Nom,Province,Longitude,Latitude,Altitude,Activite\n' \
              b'001,Site A,Tshopo,24.456,-0.123,420,Agriculture\n' \
              b'002,Site B,Tshopo,24.512,-0.145,510,Peche\n'
        st, ids = self.importer_geometrie('CSV Standard', 'activites.csv', csv)
        self.assertEqual(st.status_code, 302)
        self.assertEqual(len(ids), 1)
        c, gs = CoucheGeometrie.objects.get(pk=list(ids)[0]), list(CoucheGeometrie.objects.get(pk=list(ids)[0]).geometries.all())
        self.assertEqual(len(gs), 2, '2 points créés')
        self.assertTrue(all(len(g.coordonnees) == 3 for g in gs), 'coordonnées 3D (altitude)')
        self.assertTrue(all(g.proprietes.get('ID') and g.proprietes.get('Province') == 'Tshopo' for g in gs),
                        'toutes les colonnes conservées')
        self.assertEqual(gs[0].proprietes.get('Activite'), 'Agriculture', 'attributs par ligne exacts')
        r = self.rapport_rendu(list(ids)[0])
        self.assertIn('"points_crees": 2', r)
        self.assertIn('"dimension": "3D"', r)
        self.assertEqual(c.srid, 4326)

    def test_csv_aliases_et_xyz(self):
        csv = b'ID,Coord_X,Y_COORD,Elev,Nom\n1,29.32145,-1.23456,1542,Pic A\n2,29.40120,-1.30000,1600,Pic B\n'
        _, ids = self.importer_geometrie('CSV Alias', 'alias.csv', csv)
        c = CoucheGeometrie.objects.get(pk=list(ids)[0])
        gs = list(c.geometries.all())
        self.assertEqual(len(gs), 2)
        self.assertEqual(gs[0].coordonnees, [29.32145, -1.23456, 1542], 'X→Lon, Y→Lat, Elev→Alt')
        csv = b'ID,X,Y,Z,Nom\n1,29.32145,-1.23456,1542,Pic A\n2,29.40120,-1.30000,1600,Pic B\n'
        _, ids = self.importer_geometrie('CSV XYZ', 'xyz.csv', csv)
        gs = list(CoucheGeometrie.objects.get(pk=list(ids)[0]).geometries.all())
        self.assertEqual(gs[0].coordonnees, [29.32145, -1.23456, 1542], 'X→Lon, Y→Lat, Z→Alt (détection par valeurs)')

    def test_csv_dms_et_dms_separe(self):
        csv = 'ID,Nom,Latitude,Longitude,Altitude\n1,Sud,1°14\'04"S,29°07\'24"E,850\n2,Nord,1°15\'00"N,29°10\'00"E,900\n'.encode('utf-8')
        _, ids = self.importer_geometrie('CSV DMS', 'dms.csv', csv)
        gs = list(CoucheGeometrie.objects.get(pk=list(ids)[0]).geometries.all())
        self.assertEqual(len(gs), 2)
        att = 1 + 14 / 60 + 4 / 3600
        self.assertAlmostEqual(gs[0].coordonnees[1], -att, places=6, msg='DMS Sud → négatif')
        self.assertAlmostEqual(gs[0].coordonnees[0], 29 + 7 / 60 + 24 / 3600, places=6)
        csv = b'ID,Lat_Deg,Lat_Min,Lat_Sec,Lon_Deg,Lon_Min,Lon_Sec\n1,1,14,4,29,7,24\n2,2,0,0,30,0,0\n'
        _, ids = self.importer_geometrie('CSV DMS Sep', 'dms_sep.csv', csv)
        gs = list(CoucheGeometrie.objects.get(pk=list(ids)[0]).geometries.all())
        self.assertAlmostEqual(gs[0].coordonnees[1], att, places=6)
        self.assertAlmostEqual(gs[0].coordonnees[0], 29.123333, places=6)

    def test_coordonnees_manquantes_et_invalides(self):
        csv = b'ID,Nom,Longitude,Latitude\n1,OK,24.456,-0.123\n2,SANS,24.456,\n'
        _, ids = self.importer_geometrie('CSV Manquant', 'manquant.csv', csv)
        gs = list(CoucheGeometrie.objects.get(pk=list(ids)[0]).geometries.all())
        self.assertEqual(len(gs), 1, 'aucun point incomplet')
        self.assertIn('"sans_coordonnees": 1', self.rapport_rendu())
        csv = b'ID,Nom,Longitude,Latitude\n1,OK,28.45,-1.20\n2,INVALIDE,28.45,245.32\n3,HORS-LON,500.00,-1.20\n'
        _, ids = self.importer_geometrie('CSV Invalide', 'invalide.csv', csv)
        gs = list(CoucheGeometrie.objects.get(pk=list(ids)[0]).geometries.all())
        self.assertEqual(len(gs), 1)
        self.assertIn('"invalides": 2', self.rapport_rendu())

    def test_doublons_position_conserves(self):
        csv = b'ID,Nom,Longitude,Latitude,Activite\n1,Agriculture,24.456,-0.123,A\n2,Elevage,24.456,-0.123,E\n3,Commerce,24.456,-0.123,C\n'
        _, ids = self.importer_geometrie('CSV Doublons', 'doublons.csv', csv)
        gs = list(CoucheGeometrie.objects.get(pk=list(ids)[0]).geometries.all())
        self.assertEqual(len(gs), 3, '3 éléments à la même position conservés')
        self.assertNotEqual(gs[0].proprietes.get('Activite'), gs[2].proprietes.get('Activite'))
        self.assertIn('"doublons_position": 2', self.rapport_rendu())

    def test_geojson_2d_3d(self):
        gj = b'''{"type":"FeatureCollection","features":[
 {"type":"Feature","id":"P1","properties":{"Nom":"2D"},"geometry":{"type":"Point","coordinates":[24.456,-0.123]}},
 {"type":"Feature","id":"P2","properties":{"Nom":"3D"},"geometry":{"type":"Point","coordinates":[24.512,-0.145,420]}}
]}'''
        _, ids = self.importer_geometrie('GeoJSON 3D', 'pts.geojson', gj)
        gs = list(CoucheGeometrie.objects.get(pk=list(ids)[0]).geometries.all())
        self.assertEqual(len(gs), 2)
        self.assertEqual(gs[0].coordonnees, [24.456, -0.123])
        self.assertEqual(gs[1].coordonnees, [24.512, -0.145, 420])
        self.assertIn('"dimension": "3D"', self.rapport_rendu())

    def test_gpx_waypoints(self):
        gpx = b'''<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="-0.123" lon="24.456"><name>Camp 1</name><desc>Base</desc><ele>450</ele><sym>Flag</sym><type>camp</type><time>2026-07-20T08:00:00Z</time></wpt>
  <wpt lat="-0.145" lon="24.512"><name>Camp 2</name><ele>510</ele></wpt>
</gpx>'''
        _, ids = self.importer_geometrie('GPX Points', 'camps.gpx', gpx)
        gs = list(CoucheGeometrie.objects.get(pk=list(ids)[0]).geometries.all())
        self.assertEqual(len(gs), 2)
        self.assertEqual(gs[0].coordonnees, [24.456, -0.123, 450.0])
        self.assertEqual(gs[0].proprietes.get('nom'), 'Camp 1')
        self.assertEqual(gs[0].proprietes.get('sym'), 'Flag')
        self.assertEqual(gs[0].proprietes.get('time'), '2026-07-20T08:00:00Z')

    def test_kml_extendeddata_et_multigeometrie(self):
        kml = b'''<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document><name>Test</name>
    <Placemark id="pm1"><name>Village A</name>
      <ExtendedData>
        <Data name="Population"><value>15200</value></Data>
        <SchemaData schemaUrl="#schema1"><SimpleData name="Province">Tshopo</SimpleData></SchemaData>
      </ExtendedData>
      <Point><coordinates>24.456,-0.123,450</coordinates></Point>
    </Placemark>
    <Placemark><name>Route A</name>
      <MultiGeometry><LineString><coordinates>24.4,-0.1 24.5,-0.15 24.6,-0.2</coordinates></LineString></MultiGeometry>
    </Placemark>
  </Document>
</kml>'''
        _, ids = self.importer_geometrie('Zones KML', 'zones.kml', kml)
        gs = list(CoucheGeometrie.objects.get(pk=list(ids)[0]).geometries.all())
        self.assertEqual(len(gs), 2)
        self.assertEqual(gs[0].coordonnees, [24.456, -0.123, 450.0])
        self.assertEqual(gs[0].proprietes.get('Population'), '15200')
        self.assertEqual(gs[0].proprietes.get('Province'), 'Tshopo')
        self.assertEqual(gs[1].type, 'LineString', 'MultiGeometry → LineString')

    def test_geojson_rich_proprietes(self):
        geojson = json.dumps({
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature", "id": "ACT-001",
                "properties": {"Province": "Tshopo", "Population": 12450, "Note": {"a": 1}, "SiteWeb": "https://exemple.org"},
                "geometry": {"type": "Point", "coordinates": [24.456, -0.123]},
            }],
        }, ensure_ascii=False).encode('utf-8')
        _, ids = self.importer_geometrie('Activites', 'a.geojson', geojson)
        gs = list(CoucheGeometrie.objects.get(pk=list(ids)[0]).geometries.all())
        self.assertEqual(gs[0].proprietes.get('Population'), 12450)
        self.assertEqual(gs[0].proprietes.get('SiteWeb'), 'https://exemple.org')

    def test_api_geometrie_donnees(self):
        csv = b'ID,Nom,Latitude,Longitude\n1,A,-0.123,24.456\n'
        _, ids = self.importer_geometrie('API Test', 'api.csv', csv)
        data = self.client.get('/geometrie/donnees/').json()
        couches = [c for c in data if c['id'] in ids]
        self.assertEqual(len(couches), 1)
        feats = couches[0]['geojson']['features']
        self.assertEqual(len(feats), 1)
        self.assertEqual(feats[0]['geometry']['type'], 'Point')


class TestsChoixColonnes(BaseCartographieTest):
    """Choix automatique/interactif des colonnes de coordonnées."""

    def test_plusieurs_candidats_paire_la_plus_explicite(self):
        csv = b'ID,LAT,LATITUDE,LAT_SITE,LONG,LONGITUDE,LONG_SITE,Nom\n' \
              b'1,-1.234,-1.234,-1.234,29.321,29.321,29.321,A\n' \
              b'2,-1.300,-1.300,-1.300,29.401,29.401,29.401,B\n'
        _, ids = self.importer_geometrie('Multi Candidats', 'multi.csv', csv)
        gs = list(CoucheGeometrie.objects.get(pk=list(ids)[0]).geometries.all())
        self.assertEqual(len(gs), 2)
        self.assertEqual([g.coordonnees[:2] for g in gs], [[29.321, -1.234], [29.401, -1.3]])
        r = self.rapport_rendu(list(ids)[0])
        self.assertIn('"latitude": "LATITUDE"', r)
        self.assertIn('"longitude": "LONGITUDE"', r)

    def test_x_y_vs_lat_long_les_noms_priment(self):
        csv = b'ID,X,Y,LAT,LONG,Nom\n1,29.321,-1.234,-1.234,29.321,A\n2,29.401,-1.300,-1.300,29.401,B\n'
        _, ids = self.importer_geometrie('XY vs LatLong', 'xy.csv', csv)
        gs = list(CoucheGeometrie.objects.get(pk=list(ids)[0]).geometries.all())
        self.assertEqual(len(gs), 2)
        r = self.rapport_rendu(list(ids)[0])
        self.assertIn('"latitude": "LAT"', r)
        self.assertIn('"longitude": "LONG"', r)

    def test_ambiguite_choix_interactif(self):
        csv = b'ID,lat_a,lat_b,lon_a,lon_b,Nom\n1,-1.234,-1.234,29.321,29.321,A\n2,-1.300,-1.300,29.401,29.401,B\n'
        avant = set(CoucheGeometrie.objects.values_list('pk', flat=True))
        fich = __import__('io').BytesIO(csv)
        from django.core.files.uploadedfile import InMemoryUploadedFile
        f = InMemoryUploadedFile(fich, 'fichier_geom', 'ambig.csv', 'application/octet-stream', len(csv), None)
        resp = self.client.post('/geometrie/importer/', {'nom_couche': 'Ambig', 'fichier_geom': f})
        self.assertEqual(resp.status_code, 302)
        self.assertEqual(resp.url, '/import/choix-colonnes/', 'redirection vers le choix interactif')
        page = self.client.get('/import/choix-colonnes/').content.decode('utf-8', errors='replace')
        for col in ('lat_a', 'lat_b', 'lon_a', 'lon_b'):
            self.assertIn(col, page, f'radio candidat {col}')
        resp = self.client.post('/import/choix-colonnes/', {'col_lon': 'lon_b', 'col_lat': 'lat_a', 'col_alt': ''})
        nouvelles = set(CoucheGeometrie.objects.values_list('pk', flat=True)) - avant
        self.assertEqual(resp.status_code, 302)
        self.assertEqual(len(nouvelles), 1, 'import forcé avec les colonnes choisies')
        gs = list(CoucheGeometrie.objects.get(pk=list(nouvelles)[0]).geometries.all())
        self.assertEqual([g.coordonnees[:2] for g in gs], [[29.321, -1.234], [29.401, -1.3]])
        r = self.rapport_rendu(list(nouvelles)[0])
        self.assertIn('"latitude": "lat_a"', r)
        self.assertIn('"longitude": "lon_b"', r)

    def test_points_detectes_dans_rapport(self):
        csv = b'ID,Nom,Latitude,Longitude\n1,A,-1.234,29.321\n2,B,,\n'
        _, ids = self.importer_geometrie('Detectes', 'det.csv', csv)
        gs = list(CoucheGeometrie.objects.get(pk=list(ids)[0]).geometries.all())
        self.assertEqual(len(gs), 1)
        r = self.rapport_rendu(list(ids)[0])
        self.assertIn('"points_detectes": 1', r)
        self.assertIn('"sans_coordonnees": 1', r)

    def test_aucune_paire_message_explicatif(self):
        csv = b'Nom,Province,Activite\nA,Tshopo,Agri\nB,Tshopo,Elevage\n'
        from django.core.files.uploadedfile import InMemoryUploadedFile
        f = InMemoryUploadedFile(__import__('io').BytesIO(csv), 'fichier_geom', 'nom.csv', 'application/octet-stream', len(csv), None)
        resp = self.client.post('/geometrie/importer/', {'nom_couche': 'Sans Coord', 'fichier_geom': f})
        self.assertEqual(resp.status_code, 302)
        page = self.client.get(resp.url).content.decode('utf-8', errors='replace')
        self.assertIn('Aucune paire de coordonnées Latitude / Longitude', page)

    def test_doublons_province_chaque_ligne_cree_son_point(self):
        csv = b'Nom,Province,Latitude,Longitude\nA,Tshopo,-1.234,29.321\nB,Tshopo,-1.245,29.355\nC,Tshopo,-1.260,29.380\n'
        _, ids = self.importer_geometrie('Doublons Province', 'prov.csv', csv)
        gs = list(CoucheGeometrie.objects.get(pk=list(ids)[0]).geometries.all())
        self.assertEqual(len(gs), 3)
        self.assertEqual(len(set(tuple(g.coordonnees[:2]) for g in gs)), 3)


class TestsGPXTerrain(BaseCartographieTest):
    def test_gpx_track_route_waypoints(self):
        gpx = b'''<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="MUKMAP" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="-0.123" lon="24.456"><name>Camp 1</name><ele>450</ele></wpt>
  <trk><name>Patrouille 1</name>
    <trkseg>
      <trkpt lat="-0.123" lon="24.456"><ele>450</ele></trkpt>
      <trkpt lat="-0.140" lon="24.480"><ele>460</ele></trkpt>
    </trkseg>
  </trk>
  <rte><name>Route secours</name>
    <rtept lat="-0.123" lon="24.456"/><rtept lat="-0.150" lon="24.500"/>
  </rte>
</gpx>'''
        _, ids = self.importer_geometrie('GPX Terrain', 'terrain.gpx', gpx)
        gs = list(CoucheGeometrie.objects.get(pk=list(ids)[0]).geometries.all())
        self.assertGreaterEqual(len(gs), 3, 'waypoints + track + route importés')
        self.assertGreaterEqual(sum(1 for g in gs if g.type == 'LineString'), 2, 'track et route → lignes')
        self.assertGreaterEqual(sum(1 for g in gs if g.type == 'Point'), 1, 'waypoint → point')


class TestsStyleImport(BaseCartographieTest):
    """Partie 2 : import AJAX avec options de style (wizard 4 étapes)."""

    GEOJSON = b'''{"type":"FeatureCollection","features":[
 {"type":"Feature","properties":{"Nom":"A","Type":"Agri"},"geometry":{"type":"Point","coordinates":[24.456,-0.123]}},
 {"type":"Feature","properties":{"Nom":"B","Type":"Peche"},"geometry":{"type":"Point","coordinates":[24.512,-0.145]}}
]}'''

    def post_ajax(self, nom_couche, nom_fichier, contenu, style=None):
        """POST AJAX (multipart, ajax=1) sur /geometrie/importer/."""
        fich = InMemoryUploadedFile(
            io.BytesIO(contenu), 'fichier_geom', nom_fichier,
            'application/octet-stream', len(contenu), None)
        donnees = {'nom_couche': nom_couche, 'fichier_geom': fich, 'ajax': '1'}
        if style is not None:
            donnees['style_options'] = json.dumps(style)
        return self.client.post('/geometrie/importer/', donnees)

    def test_import_ajax_avec_style_complet(self):
        style = {
            'couleur': '#22c55e', 'symbole': 'losange', 'taille': 9, 'opacite': 0.8,
            'etiquette': 'Nom',
            'categories': {'champ': 'Type', 'classes': [
                {'valeur': 'Agri', 'couleur': '#ef4444', 'label': 'Agriculture'},
                {'valeur': 'Peche', 'couleur': '#3b82f6', 'label': 'Pêche'},
            ]},
        }
        resp = self.post_ajax('Style Complet', 'style.geojson', self.GEOJSON, style)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data['ok'])
        self.assertEqual(data['importes'], 2)
        self.assertEqual(data['type'], 'point')
        couche = CoucheGeometrie.objects.get(pk=data['couche_id'])
        self.assertEqual(couche.style_couleur, '#22c55e')
        so = couche.style_options
        self.assertEqual(so['symbole'], 'losange')
        self.assertEqual(so['taille'], 9)
        self.assertEqual(so['opacite'], 0.8)
        self.assertEqual(so['etiquette'], 'Nom')
        self.assertEqual(so['categories']['champ'], 'Type')
        self.assertEqual(len(so['categories']['classes']), 2)
        self.assertEqual(so['categories']['classes'][0]['couleur'], '#ef4444')
        self.assertEqual(data['style']['couleur'], '#22c55e', 'style renvoyé dans la réponse')

    def test_style_invalide_nettoye(self):
        style = {
            'couleur': 'rouge', 'symbole': 'cercleXX', 'taille': 99, 'opacite': -2,
            'etiquette': 'x' * 300,
            'categories': {'champ': 'Type', 'classes': [
                {'valeur': '', 'couleur': '#ef4444'}, {'valeur': 'Agri', 'couleur': 'pas-hex'},
                'poubelle',
            ]},
        }
        resp = self.post_ajax('Style Nettoye', 'net.geojson', self.GEOJSON, style)
        self.assertEqual(resp.status_code, 200)
        couche = CoucheGeometrie.objects.get(pk=resp.json()['couche_id'])
        so = couche.style_options
        self.assertEqual(so['couleur'], '#3388ff', 'couleur invalide → défaut')
        self.assertEqual(so['symbole'], 'cercle', 'symbole inconnu → cercle')
        self.assertEqual(so['taille'], 20, 'taille plafonnée à 20')
        self.assertEqual(so['opacite'], 0, 'opacité bornée à 0')
        self.assertEqual(len(so['etiquette']), 100, 'étiquette tronquée à 100')
        classes = so['categories']['classes']
        self.assertEqual(len(classes), 1, 'classe sans valeur et entrée non-dict ignorées')
        self.assertEqual(classes[0]['couleur'], '#3388ff', 'couleur de classe invalide → couleur couche')

    def test_import_ajax_erreurs(self):
        r = self.post_ajax('', 'vide.geojson', self.GEOJSON)
        self.assertEqual(r.status_code, 400)
        r = self.post_ajax('Sans Fichier', 'x.txt', b'plop')
        self.assertEqual(r.status_code, 400)
        self.assertIn('Format non supporté', r.json()['erreur'])
        csv = b'ID,lat_a,lat_b,lon_a,lon_b,Nom\n1,-1.234,-1.234,29.321,29.321,A\n'
        r = self.post_ajax('Ambig AJAX', 'ambig.csv', csv)
        self.assertEqual(r.status_code, 400, 'ambiguïté en AJAX → 400 explicite')
        self.assertIn('choisir les colonnes', r.json()['erreur'])

    def test_geometrie_donnees_retourne_style(self):
        style = {'couleur': '#d946ef', 'symbole': 'etoile', 'taille': 12}
        resp = self.post_ajax('Style API', 'api2.geojson', self.GEOJSON, style)
        couche_id = resp.json()['couche_id']
        data = self.client.get('/geometrie/donnees/').json()
        couche = [c for c in data if c['id'] == couche_id][0]
        self.assertEqual(couche['style_options']['couleur'], '#d946ef')
        self.assertEqual(couche['style_options']['symbole'], 'etoile')
        self.assertEqual(len(couche['geojson']['features']), 2)

    def test_style_conserve_via_choix_colonnes(self):
        csv = b'ID,lat_a,lat_b,lon_a,lon_b,Nom\n1,-1.234,-1.234,29.321,29.321,A\n'
        style = {'couleur': '#f59e0b', 'symbole': 'carre', 'taille': 5}
        fich = InMemoryUploadedFile(
            io.BytesIO(csv), 'fichier_geom', 'ambig2.csv',
            'application/octet-stream', len(csv), None)
        r = self.client.post('/geometrie/importer/', {
            'nom_couche': 'Ambig Style', 'fichier_geom': fich,
            'style_options': json.dumps(style)})
        self.assertEqual(r.status_code, 302)
        self.assertEqual(r.url, '/import/choix-colonnes/')
        r = self.client.post('/import/choix-colonnes/', {'col_lon': 'lon_b', 'col_lat': 'lat_a', 'col_alt': ''})
        self.assertEqual(r.status_code, 302)
        couche = CoucheGeometrie.objects.get(nom='Ambig Style')
        self.assertEqual(couche.style_couleur, '#f59e0b', 'style conservé à travers le choix interactif')
        self.assertEqual(couche.style_options['symbole'], 'carre')
