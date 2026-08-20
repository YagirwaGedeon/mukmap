# -*- coding: utf-8 -*-
"""Cahier des charges FORMAT AUDIT : GeoPackage (.gpkg), DXF, JSON générique,
exports GeoJSON/JSON/KML/KMZ/GPX/GPKG/DXF/SHP — import, sélection, reprojection,
round-trips et vues HTTP."""

import io
import json
import math
import sqlite3
import struct
import tempfile
import zipfile

from django.core.files.uploadedfile import InMemoryUploadedFile
from django.test import override_settings

from cartographie.models import CoucheGeometrie
from cartographie import geo_formats

from .base import BaseCartographieTest
from .test_shapefile_cahier import _utm_forward


def _fichier(contenu, nom):
    return InMemoryUploadedFile(io.BytesIO(contenu), 'fichier_geom', nom,
                                'application/octet-stream', len(contenu), None)


def _wkb(gtype, coords):
    """WKB little-endian sans SRID (non normalisé), bit Z si altitude présente."""
    out = bytearray()
    if gtype == 'Point':
        zbit = 0x80000000 if len(coords) > 2 else 0
        out += b'\x01' + struct.pack('<I', 1 | zbit)
        for v in coords[:3]:
            out += struct.pack('<d', float(v))
    elif gtype == 'MultiPoint':
        out += b'\x01' + struct.pack('<I', 4) + struct.pack('<I', len(coords))
        for p in coords:
            zbit = 0x80000000 if len(p) > 2 else 0
            out += b'\x01' + struct.pack('<I', 1 | zbit)
            for v in p[:3]:
                out += struct.pack('<d', float(v))
    elif gtype == 'LineString':
        out += b'\x01' + struct.pack('<I', 2) + struct.pack('<I', len(coords))
        for p in coords:
            for v in p[:3]:
                out += struct.pack('<d', float(v))
    return bytes(out)


def _gpkg(couches_defs):
    """Construit un GeoPackage en mémoire.

    couches_defs : [{'nom', 'type', 'srid', 'geometries': [(gtype, coords, props)]}]
    """
    conn = sqlite3.connect(':memory:')
    cur = conn.cursor()
    cur.execute("CREATE TABLE gpkg_spatial_ref_sys (srs_name TEXT NOT NULL, srs_id INTEGER NOT NULL "
                "PRIMARY KEY, organization TEXT NOT NULL, organization_coordsys_id INTEGER NOT NULL, "
                "definition TEXT NOT NULL, description TEXT)")
    cur.execute("INSERT INTO gpkg_spatial_ref_sys VALUES ('WGS 84',4326,'EPSG',4326,'GEOGCS[\"WGS 84\"]','')")
    cur.execute("INSERT INTO gpkg_spatial_ref_sys VALUES ('WGS 84 / UTM zone 35S',32735,'EPSG',32735,"
                "'PROJCS[\"WGS 84 / UTM zone 35S\"]','')")
    cur.execute("CREATE TABLE gpkg_contents (table_name TEXT NOT NULL PRIMARY KEY, data_type TEXT NOT NULL, "
                "identifier TEXT UNIQUE, description TEXT DEFAULT '', last_change DATETIME NOT NULL DEFAULT "
                "'2026-01-01T00:00:00Z', min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE, srs_id INTEGER)")
    cur.execute("CREATE TABLE gpkg_geometry_columns (table_name TEXT NOT NULL, column_name TEXT NOT NULL, "
                "geometry_type_name TEXT NOT NULL, srs_id INTEGER NOT NULL, z TINYINT NOT NULL, m TINYINT NOT "
                "NULL, PRIMARY KEY (table_name, column_name))")
    for defn in couches_defs:
        table = defn['nom']
        colonnes_props = []
        for _gt, _co, props in defn['geometries']:
            for k in props:
                if k not in colonnes_props:
                    colonnes_props.append(k)
        extra = ', '.join(f'"{c}" TEXT' for c in colonnes_props)
        cur.execute(f'CREATE TABLE "{table}" (fid INTEGER PRIMARY KEY AUTOINCREMENT, geom BLOB NOT NULL'
                    + (', ' + extra if extra else '') + ')')
        cur.execute("INSERT INTO gpkg_contents (table_name, data_type, identifier, srs_id) "
                    "VALUES (?, 'features', ?, ?)", (table, table, defn['srid']))
        cur.execute("INSERT INTO gpkg_geometry_columns VALUES (?, 'geom', ?, ?, 0, 0)",
                    (table, defn['type'], defn['srid']))
        for gtype, coords, props in defn['geometries']:
            blob = b'GP' + bytes([0, 0]) + struct.pack('<I', defn['srid']) + _wkb(gtype, coords)
            colonnes = list(props.keys())
            if colonnes:
                cur.execute(f'INSERT INTO "{table}" (geom, {", ".join(f'"{c}"' for c in colonnes)}) '
                            f'VALUES (?, {", ".join("?" for _ in colonnes)})',
                            [blob] + [props[c] for c in colonnes])
            else:
                cur.execute(f'INSERT INTO "{table}" (geom) VALUES (?)', [blob])
    conn.commit()
    donnees = conn.serialize()
    conn.close()
    return donnees


def _dxf(entites):
    """DXF ASCII R12 : entites = [(type, [(code, valeur), ...])]."""
    lignes = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '0', 'ENDSEC',
              '0', 'SECTION', '2', 'ENTITIES']
    for type_ent, paires in entites:
        lignes.append('0')
        lignes.append(type_ent)
        for c, v in paires:
            lignes.append(str(c))
            lignes.append(str(v))
    lignes += ['0', 'ENDSEC', '0', 'EOF']
    return ('\r\n'.join(lignes) + '\r\n').encode('utf-8')


@override_settings(MEDIA_ROOT=tempfile.mkdtemp(prefix='muk_media_fmt_'))
class TestsFormatsGeo(BaseCartographieTest):
    """GeoPackage : import, sélection, reprojection, exports."""

    def test_gpkg_import_2_couches(self):
        gpkg = _gpkg([
            {'nom': 'sites', 'type': 'POINT', 'srid': 4326,
             'geometries': [('Point', [24.456, -0.123], {'nom': 'S1'}),
                            ('Point', [24.512, -0.145, 850.0], {'nom': 'S2'})]},
            {'nom': 'routes', 'type': 'LINESTRING', 'srid': 4326,
             'geometries': [('LineString', [[24.45, -0.12], [24.5, -0.14]], {'nom': 'R1'})]},
        ])
        r, ids = self.importer_geometrie('GPKG', 'donnees.gpkg', gpkg)
        self.assertEqual(r.status_code, 302)
        self.assertEqual(len(ids), 2, 'deux couches créées depuis le GeoPackage')
        c_sites = CoucheGeometrie.objects.get(nom='GPKG - Sites')
        self.assertEqual(c_sites.type_geometrie, 'point')
        self.assertEqual(c_sites.srid, 4326)
        self.assertEqual(c_sites.nb_entites, 2)
        g = c_sites.geometries.get(proprietes__nom='S2')
        self.assertEqual(g.coordonnees, [24.512, -0.145, 850.0], 'altitude Z conservée')
        c_routes = CoucheGeometrie.objects.get(nom='GPKG - Routes')
        self.assertEqual(c_routes.type_geometrie, 'ligne')

    def test_gpkg_selection_couches(self):
        gpkg = _gpkg([
            {'nom': 'a', 'type': 'POINT', 'srid': 4326, 'geometries': [('Point', [24.4, -0.1], {})]},
            {'nom': 'b', 'type': 'POINT', 'srid': 4326, 'geometries': [('Point', [24.5, -0.2], {})]},
        ])
        avant = set(CoucheGeometrie.objects.values_list('pk', flat=True))
        fich = _fichier(gpkg, 'sel.gpkg')
        r = self.client.post('/geometrie/importer/', {
            'nom_couche': 'Sel', 'fichier_geom': fich, 'ajax': '1',
            'couches_gpkg': json.dumps(['a']),
        })
        ids = set(CoucheGeometrie.objects.values_list('pk', flat=True)) - avant
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()['ok'])
        self.assertEqual(len(ids), 1, 'seule la couche cochée est importée')

    def test_gpkg_multipoint_explose(self):
        gpkg = _gpkg([
            {'nom': 'multi', 'type': 'MULTIPOINT', 'srid': 4326,
             'geometries': [('MultiPoint', [[24.45, -0.12], [24.46, -0.13]], {'nom': 'M'})]},
        ])
        _, ids = self.importer_geometrie('Multi', 'multi.gpkg', gpkg)
        c = CoucheGeometrie.objects.get(pk=list(ids)[0])
        self.assertEqual(c.nb_entites, 2, 'MultiPoint éclaté en points simples')
        self.assertEqual(c.type_geometrie, 'point')

    def test_gpkg_utm_35s_reprojection(self):
        lon, lat = 28.5, -2.0
        x, y = _utm_forward(lon, lat, 35, nord=False)
        gpkg = _gpkg([
            {'nom': 'utm', 'type': 'POINT', 'srid': 32735,
             'geometries': [('Point', [x, y], {'nom': 'U'})]},
        ])
        _, ids = self.importer_geometrie('UTM', 'utm.gpkg', gpkg)
        c = CoucheGeometrie.objects.get(pk=list(ids)[0])
        self.assertEqual(c.srid, 4326, 'stockage WGS84 après reprojection')
        g = c.geometries.get()
        self.assertAlmostEqual(g.coordonnees[1], lat, places=5, msg='latitude reprojetée')
        self.assertAlmostEqual(g.coordonnees[0], lon, places=5, msg='longitude reprojetée')

    def test_gpkg_corrompu_erreur(self):
        avant = CoucheGeometrie.objects.count()
        r, ids = self.importer_geometrie('Bof', 'bof.gpkg', b'pas un sqlite')
        self.assertEqual(r.status_code, 302)
        self.assertEqual(CoucheGeometrie.objects.count(), avant, 'aucune couche créée')
        self.assertEqual(len(ids), 0)

    def test_gpkg_infos_vue(self):
        gpkg = _gpkg([
            {'nom': 'sites', 'type': 'POINT', 'srid': 4326,
             'geometries': [('Point', [24.45, -0.12], {'nom': 'S'})]},
            {'nom': 'routes', 'type': 'LINESTRING', 'srid': 4326,
             'geometries': [('LineString', [[24.45, -0.12], [24.5, -0.14]], {})]},
        ])
        r = self.client.post('/geometrie/gpkg/infos/', {'fichier_geom': _fichier(gpkg, 'i.gpkg')})
        self.assertEqual(r.status_code, 200)
        j = r.json()
        self.assertTrue(j['ok'])
        noms = {(c['nom'], c['type']) for c in j['couches']}
        self.assertEqual(noms, {('sites', 'POINT'), ('routes', 'LINESTRING')})
        self.assertEqual(j['couches'][0]['srid'], 4326)
        self.assertEqual(j['couches'][0]['nb'], 1)

    def test_export_gpkg_roundtrip(self):
        gpkg = _gpkg([
            {'nom': 'sites', 'type': 'POINT', 'srid': 4326,
             'geometries': [('Point', [24.456, -0.123], {'nom': 'S1'})]},
        ])
        _, ids = self.importer_geometrie('RT', 'rt.gpkg', gpkg)
        couche = CoucheGeometrie.objects.get(pk=list(ids)[0])
        donnees = geo_formats.exporter_gpkg([couche])
        self.assertTrue(donnees.startswith(b'SQLite format 3'), 'GPKG exporté = base SQLite')
        couches2 = geo_formats.importer_gpkg(donnees, 'RT2', 'rt2.gpkg')
        self.assertEqual(len(couches2), 1)
        g2 = couches2[0].geometries.get()
        self.assertAlmostEqual(g2.coordonnees[0], 24.456, places=6, msg='round-trip GPKG')
        self.assertAlmostEqual(g2.coordonnees[1], -0.123, places=6)
        self.assertEqual(g2.proprietes.get('nom'), 'S1', 'attributs exportés')

    def test_export_formats_http(self):
        gpkg = _gpkg([
            {'nom': 'sites', 'type': 'POINT', 'srid': 4326,
             'geometries': [('Point', [24.456, -0.123], {'nom': 'S1'})]},
        ])
        _, ids = self.importer_geometrie('Exp', 'exp.gpkg', gpkg)
        pk = list(ids)[0]
        for fmt, ext in [('geojson', '.geojson'), ('json', '.json'), ('kml', '.kml'),
                         ('kmz', '.kmz'), ('gpx', '.gpx'), ('gpkg', '.gpkg'),
                         ('dxf', '.dxf'), ('shapefile', '.shp.zip')]:
            r = self.client.get(f'/geometrie/couche/{pk}/export/{fmt}/')
            self.assertEqual(r.status_code, 200, f'export {fmt}')
            contenu = b''.join(r.streaming_content) if getattr(r, 'streaming_content', None) else r.content
            self.assertIn(ext, r['Content-Disposition'], f'nom de fichier {fmt}')
            self.assertTrue(contenu, f'contenu non vide {fmt}')
        r = self.client.get('/export/toutes/geojson/')
        self.assertEqual(r.status_code, 200)
        j = r.json()
        self.assertEqual(j['type'], 'FeatureCollection')
        self.assertEqual(len(j['features']), 1)
        r = self.client.get('/export/toutes/gpkg/')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.content.startswith(b'SQLite format 3'))

    def test_export_kml_kmz_gpx_contenu(self):
        gpkg = _gpkg([
            {'nom': 'sites', 'type': 'POINT', 'srid': 4326,
             'geometries': [('Point', [24.456, -0.123, 900.0], {'nom': 'S1', 'type': 'puits'})]},
        ])
        _, ids = self.importer_geometrie('Km', 'km.gpkg', gpkg)
        couche = CoucheGeometrie.objects.get(pk=list(ids)[0])
        kml = geo_formats.exporter_kml(couche)
        self.assertIn('<kml', kml)
        self.assertIn('<Placemark>', kml)
        self.assertIn('24.456', kml)
        self.assertIn('S1', kml)
        self.assertIn('puits', kml, 'attributs en ExtendedData')
        kmz = geo_formats.exporter_kmz(couche)
        with zipfile.ZipFile(io.BytesIO(kmz)) as z:
            self.assertIn('doc.kml', z.namelist())
        gpx = geo_formats.exporter_gpx(couche)
        self.assertIn('<wpt lat="', gpx)
        self.assertIn('<ele>900.0</ele>', gpx, 'altitude dans le GPX')


class TestsFormatsDxf(BaseCartographieTest):
    """DXF : import des entités, reprojection EPSG, export round-trip."""

    def test_dxf_import_entites(self):
        dxf = _dxf([
            ('POINT', [(8, 'balises'), (10, 24.456), (20, -0.123), (1, 'P1')]),
            ('LINE', [(8, 'balises'), (10, 24.45), (20, -0.12), (11, 24.5), (21, -0.14)]),
            ('LWPOLYLINE', [(8, 'parcelles'), (90, 4), (70, 1),
                            (10, 24.4), (20, -0.1), (10, 24.5), (20, -0.1),
                            (10, 24.5), (20, -0.2), (10, 24.4), (20, -0.2)]),
            ('CIRCLE', [(8, 'balises'), (10, 24.456), (20, -0.123), (40, 100.0)]),
            ('ARC', [(8, 'balises'), (10, 24.456), (20, -0.123), (40, 100.0), (50, 0.0), (51, 90.0)]),
            ('TEXT', [(8, 'balises'), (10, 24.457), (20, -0.124), (1, 'Libellé')]),
            ('INSERT', [(8, 'blocs')]),
        ])
        r, ids = self.importer_geometrie('Dessin', 'plan.dxf', dxf)
        self.assertEqual(r.status_code, 302)
        c = CoucheGeometrie.objects.get(pk=list(ids)[0])
        self.assertEqual(c.nb_entites, 6, 'point + ligne + polygone + cercle + arc + texte')
        types = set(c.geometries.values_list('type', flat=True))
        self.assertEqual(types, {'Point', 'LineString', 'Polygon'})
        cercle = c.geometries.get(proprietes__calque='balises', type='Polygon')
        self.assertEqual(len(cercle.coordonnees[0]), 49, 'cercle discrétisé en 48 segments fermés')
        g_texte = c.geometries.get(proprietes__texte='Libellé')
        self.assertIsNotNone(g_texte)
        self.assertEqual(g_texte.proprietes.get('calque'), 'balises')

    def test_dxf_sans_epsg_avertissement(self):
        dxf = _dxf([('POINT', [(10, 24.456), (20, -0.123)])])
        fich = _fichier(dxf, 'brut.dxf')
        r = self.client.post('/geometrie/importer/', {
            'nom_couche': 'Brut', 'fichier_geom': fich, 'ajax': '1',
        })
        self.assertEqual(r.status_code, 200)
        j = r.json()
        self.assertTrue(j['ok'])
        self.assertEqual(j['couches'][0]['nom'], 'Brut')
        self.assertTrue(j['couches'][0]['avertissement'],
                        'avertissement « non géoréférencé » dans la réponse AJAX')
        c = CoucheGeometrie.objects.get(pk=j['couche_id'])
        g = c.geometries.get()
        self.assertEqual(g.coordonnees[:2], [24.456, -0.123], 'coordonnées conservées telles quelles')

    def test_dxf_epsg_reprojection(self):
        R = 6378137.0
        x = 24.456 * math.radians(1) * R
        y = R * math.log(math.tan(math.radians(45 + -0.123 / 2)))
        dxf = _dxf([('POINT', [(10, x), (20, y)])])
        fich = _fichier(dxf, 'merc.dxf')
        avant = set(CoucheGeometrie.objects.values_list('pk', flat=True))
        r = self.client.post('/geometrie/importer/', {
            'nom_couche': 'Merc', 'fichier_geom': fich, 'ajax': '1', 'crs_dxf': '3857',
        })
        ids = set(CoucheGeometrie.objects.values_list('pk', flat=True)) - avant
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()['ok'])
        c = CoucheGeometrie.objects.get(pk=list(ids)[0])
        g = c.geometries.get()
        self.assertAlmostEqual(g.coordonnees[0], 24.456, places=4, msg='Web Mercator → WGS84')
        self.assertAlmostEqual(g.coordonnees[1], -0.123, places=4)

    def test_dxf_vide_erreur(self):
        dxf = _dxf([('INSERT', [(8, 'bloc')])])
        avant = CoucheGeometrie.objects.count()
        r, ids = self.importer_geometrie('Vide', 'vide.dxf', dxf)
        self.assertEqual(r.status_code, 302)
        self.assertEqual(CoucheGeometrie.objects.count(), avant)
        self.assertEqual(len(ids), 0)

    def test_dxf_export_roundtrip(self):
        gpkg = _gpkg([
            {'nom': 'sites', 'type': 'POINT', 'srid': 4326,
             'geometries': [('Point', [24.456, -0.123], {'nom': 'S1'})]},
        ])
        _, ids = self.importer_geometrie('RT', 'rt.gpkg', gpkg)
        couche = CoucheGeometrie.objects.get(pk=list(ids)[0])
        dxf = geo_formats.exporter_dxf(couche)
        self.assertIn('AC1009', dxf, 'DXF R12')
        self.assertIn('POINT', dxf)
        c2 = geo_formats.importer_dxf(dxf.encode('utf-8'), 'RT2', 'rt2.dxf')
        self.assertEqual(c2.nb_entites, 1)
        g2 = c2.geometries.get()
        self.assertAlmostEqual(g2.coordonnees[0], 24.456, places=6, msg='round-trip DXF')
        self.assertAlmostEqual(g2.coordonnees[1], -0.123, places=6)


class TestsFormatsJson(BaseCartographieTest):
    """JSON générique (colonnes lat/lng) : import direct et repli dans la vue."""

    def test_json_liste_objets_lat_lng(self):
        donnees = [
            {'nom': 'S1', 'latitude': -0.123, 'longitude': 24.456, 'type': 'puits'},
            {'nom': 'S2', 'lat': -0.145, 'lng': 24.512},
        ]
        r, ids = self.importer_geometrie('Json', 'donnees.json', json.dumps(donnees).encode('utf-8'))
        self.assertEqual(r.status_code, 302)
        c = CoucheGeometrie.objects.get(pk=list(ids)[0])
        self.assertEqual(c.nb_entites, 2)
        self.assertEqual(c.type_geometrie, 'point')
        g = c.geometries.get(proprietes__nom='S1')
        self.assertEqual(g.coordonnees, [24.456, -0.123])

    def test_json_cle_donnees_et_coordonnees(self):
        donnees = {'donnees': [{'coordonnees': [24.456, -0.123], 'nom': 'X'}]}
        _, ids = self.importer_geometrie('Cle', 'cle.json', json.dumps(donnees).encode('utf-8'))
        c = CoucheGeometrie.objects.get(pk=list(ids)[0])
        g = c.geometries.get()
        self.assertEqual(g.coordonnees, [24.456, -0.123], '[lng, lat] via clé coordonnees')

    def test_json_paires_lat_lng(self):
        donnees = [[-0.123, 24.456, 850], [-0.145, 24.512]]
        _, ids = self.importer_geometrie('Paires', 'paires.json', json.dumps(donnees).encode('utf-8'))
        c = CoucheGeometrie.objects.get(pk=list(ids)[0])
        self.assertEqual(c.nb_entites, 2)
        premier = c.geometries.first()
        self.assertEqual(premier.coordonnees, [24.456, -0.123])

    def test_json_sans_geo_erreur(self):
        avant = CoucheGeometrie.objects.count()
        r, ids = self.importer_geometrie('Nope', 'nope.json', json.dumps({'a': 1, 'b': 2}).encode('utf-8'))
        self.assertEqual(r.status_code, 302)
        self.assertEqual(CoucheGeometrie.objects.count(), avant)
        self.assertEqual(len(ids), 0)

    def test_geojson_normal_toujours_importe(self):
        geojson = {
            'type': 'FeatureCollection',
            'features': [{'type': 'Feature', 'properties': {'nom': 'G'},
                          'geometry': {'type': 'Point', 'coordinates': [24.456, -0.123]}}],
        }
        r, ids = self.importer_geometrie('Geo', 'geo.geojson', json.dumps(geojson).encode('utf-8'))
        self.assertEqual(r.status_code, 302)
        c = CoucheGeometrie.objects.get(pk=list(ids)[0])
        self.assertEqual(c.nb_entites, 1)
        self.assertEqual(c.geometries.get().coordonnees, [24.456, -0.123])

    def test_json_fallback_vue_ajax(self):
        fich = _fichier(json.dumps([{'nom': 'A', 'latitude': -0.1, 'longitude': 24.4}]).encode('utf-8'),
                        'liste.json')
        r = self.client.post('/geometrie/importer/', {
            'nom_couche': 'Ajax', 'fichier_geom': fich, 'ajax': '1',
        })
        self.assertEqual(r.status_code, 200)
        j = r.json()
        self.assertTrue(j['ok'])
        self.assertEqual(j['couches'][0]['nom'], 'Ajax')