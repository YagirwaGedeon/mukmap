# -*- coding: utf-8 -*-
"""Cahier des charges Shapefile : multi-couches ZIP, projection (.prj), encodage (.cpg),
style (.qmd), sécurité ZIP, export Shapefile, métadonnées (§5, 10, 12, 15, 21)."""

import io
import math
import os
import tempfile
import time
import zipfile

import shapefile
from django.test import override_settings

from cartographie.models import CoucheGeometrie
from django.contrib.auth.models import User

from .base import BaseCartographieTest


class _RetryTmp(tempfile.TemporaryDirectory):
    """Windows : l'indexeur/antivirus peut verrouiller brièvement les .shp écrits ;
    les erreurs de nettoyage sont non fatales (répertoires restants nettoyés par l'OS)."""

    def cleanup(self):
        for _ in range(8):
            try:
                return super().cleanup()
            except PermissionError:
                time.sleep(0.5)
        self._ignore_cleanup_errors = True
        try:
            super().cleanup()
        except Exception:
            pass


def _prj_utm(zone, nord=True):
    lat0 = 0 if nord else 10000000
    return ('PROJCS["WGS 84 / UTM zone %d%s",GEOGCS["WGS 84",DATUM["WGS_1984",'
            'SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],'
            'UNIT["degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],'
            'PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",%d],'
            'PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],'
            'PARAMETER["false_northing",%d],UNIT["metre",1]]'
            % (zone, 'S' if not nord else 'N', zone * 6 - 183, lat0)).encode('ascii')


def _utm_forward(lon, lat, zone, nord=True):
    """Transverse Mercator direct (Snyder) : WGS84 -> UTM. Sert à générer des .shp en UTM."""
    a = 6378137.0
    f = 1.0 / 298.257223563
    e2 = 2 * f - f * f
    ep2 = e2 / (1 - e2)
    k0 = 0.9996
    phi = math.radians(lat)
    lam = math.radians(lon - (zone * 6 - 183))
    N = a / math.sqrt(1 - e2 * math.sin(phi) ** 2)
    T = math.tan(phi) ** 2
    C = ep2 * math.cos(phi) ** 2
    A = math.cos(phi) * lam
    M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi
             - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * math.sin(2 * phi)
             + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * math.sin(4 * phi)
             - (35 * e2 ** 3 / 3072) * math.sin(6 * phi))
    x = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000.0
    y = k0 * (M + N * math.tan(phi) * (A ** 2 / 2 + (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24
                                       + (61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6 / 720))
    if not nord:
        y += 10000000.0
    return (x, y)


def _writer_points(tmp, base, points, encodage='utf-8'):
    w = shapefile.Writer(os.path.join(tmp, base), encoding=encodage)
    w.field('nom', 'C', 30)
    w.field('type', 'C', 30)
    for x, y, nom, typ in points:
        w.point(x, y)
        w.record(nom, typ)
    w.close()
    return base


def _zip_depuis(tmp, bases, noms_zip=None, prj=None, cpg=None, qmd=None):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
        for base in bases:
            for ext in ('shp', 'shx', 'dbf'):
                z.write(os.path.join(tmp, base + '.' + ext), (noms_zip or {}).get(base, base) + '.' + ext)
            if prj is not None:
                z.writestr(base + '.prj', prj)
            if cpg is not None:
                z.writestr(base + '.cpg', cpg)
            if qmd is not None:
                z.writestr(base + '.qmd', qmd)
    return buf.getvalue()


@override_settings(MEDIA_ROOT=tempfile.mkdtemp(prefix='muk_media_'))
class TestsShapefileCahier(BaseCartographieTest):
    """Fonctionnalités du cahier des charges Shapefile."""

    def test_zip_multi_couches_2_couches(self):
        with _RetryTmp() as tmp:
            _writer_points(tmp, 'pts', [(24.456, -0.123, 'S1', 'marche'), (24.512, -0.145, 'S2', 'puits')])
            _writer_points(tmp, 'lignes', [(24.456, -0.123, 'L1', 'route'), (24.512, -0.145, 'L2', 'piste')])
            buf = _zip_depuis(tmp, ['pts', 'lignes'], prj=_prj_utm(35, nord=False))
            r, ids = self.importer_geometrie('Multi', 'multi.zip', buf)
        self.assertEqual(r.status_code, 302)
        self.assertEqual(len(ids), 2, 'deux couches créées depuis un ZIP multi-Shapefile')
        noms = set(CoucheGeometrie.objects.filter(pk__in=ids).values_list('nom', flat=True))
        self.assertEqual(noms, {'Multi - Pts', 'Multi - Lignes'})
        for c in CoucheGeometrie.objects.filter(pk__in=ids):
            self.assertEqual(c.nb_entites, 2)
            self.assertEqual(c.nom_original, os.path.basename(c.fichier_source))
            self.assertTrue(c.nom_original.endswith('.shp'))
            self.assertEqual(c.srid, 4326, 'reprojection appliquée pour chaque couche du ZIP')

    def test_prj_utm_35s_reprojection(self):
        lon, lat = 28.5, -2.0
        x, y = _utm_forward(lon, lat, 35, nord=False)
        with _RetryTmp() as tmp:
            _writer_points(tmp, 'utm', [(x, y, 'A', 'puits')])
            buf = _zip_depuis(tmp, ['utm'], prj=_prj_utm(35, nord=False))
            _, ids = self.importer_geometrie('UTM35S', 'utm.zip', buf)
        c = CoucheGeometrie.objects.get(pk=list(ids)[0])
        self.assertEqual(c.epsg, 32735)
        self.assertEqual(c.srid, 4326, 'stockage en WGS84 après reprojection')
        g = c.geometries.get()
        self.assertAlmostEqual(g.coordonnees[0], lon, places=5, msg='longitude reprojetée')
        self.assertAlmostEqual(g.coordonnees[1], lat, places=5, msg='latitude reprojetée')

    def test_prj_web_mercator_reprojection(self):
        R = 6378137.0
        x = 24.456 * math.radians(1) * R
        y = R * math.log(math.tan(math.radians(45 + -0.123 / 2)))
        with _RetryTmp() as tmp:
            _writer_points(tmp, 'merc', [(x, y, 'M', 'site')])
            buf = _zip_depuis(tmp, ['merc'], prj=b'WEB MERCATOR WGS84')
            _, ids = self.importer_geometrie('Mercator', 'merc.zip', buf)
        c = CoucheGeometrie.objects.get(pk=list(ids)[0])
        self.assertEqual(c.epsg, 3857)
        self.assertEqual(c.srid, 4326)
        g = c.geometries.get()
        self.assertAlmostEqual(g.coordonnees[0], 24.456, places=4)
        self.assertAlmostEqual(g.coordonnees[1], -0.123, places=4)

    def test_prj_geogcs_wgs84_sans_authority(self):
        prj = b'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]'
        with _RetryTmp() as tmp:
            _writer_points(tmp, 'geo', [(24.456, -0.123, 'A', 'puits')])
            buf = _zip_depuis(tmp, ['geo'], prj=prj)
            _, ids = self.importer_geometrie('Geo84', 'geo.zip', buf)
        c = CoucheGeometrie.objects.get(pk=list(ids)[0])
        self.assertEqual(c.epsg, 4326, 'GEOGCS WGS84 sans AUTHORITY → EPSG:4326')

    def test_cpg_encodage_latin1_accents(self):
        with _RetryTmp() as tmp:
            w = shapefile.Writer(os.path.join(tmp, 'acc'), encoding='latin-1')
            w.field('nom', 'C', 30)
            w.point(24.456, -0.123)
            w.record('Forêt école')
            w.close()
            buf = _zip_depuis(tmp, ['acc'], cpg=b'ISO-8859-1')
            _, ids = self.importer_geometrie('Accents', 'acc.zip', buf)
        c = CoucheGeometrie.objects.get(pk=list(ids)[0])
        self.assertEqual(c.encodage, 'latin-1')
        g = c.geometries.get()
        self.assertEqual(g.proprietes.get('nom'), 'Forêt école', 'accents lus via .cpg')

    def test_qmd_style_couleur(self):
        qmd = ('<?xml version="1.0" encoding="UTF-8"?><qgis version="3.28">'
               '<renderer-v2 type="singleSymbol"><symbols><symbol type="marker" name="0">'
               '<layer class="SimpleMarker" enabled="1"><prop k="color" v="223,32,32,255"/>'
               '<prop k="size" v="4"/></layer></symbol></symbols></renderer-v2></qgis>')
        with _RetryTmp() as tmp:
            _writer_points(tmp, 'sty', [(24.456, -0.123, 'A', 'puits')])
            buf = _zip_depuis(tmp, ['sty'], qmd=qmd.encode('utf-8'))
            _, ids = self.importer_geometrie('Stylee', 'sty.zip', buf)
        c = CoucheGeometrie.objects.get(pk=list(ids)[0])
        self.assertEqual(c.style_couleur, '#df2020', 'couleur extraite du .qmd (format prop QGIS)')
        self.assertEqual(c.style_options.get('couleur'), '#df2020')

    def test_zip_slip_rejete(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w') as z:
            z.writestr('../evil.shp', b'x')
        avant = CoucheGeometrie.objects.count()
        r, ids = self.importer_geometrie('Slip', 'slip.zip', buf.getvalue())
        self.assertEqual(r.status_code, 302)
        self.assertEqual(CoucheGeometrie.objects.count(), avant, 'aucune couche créée')
        self.assertEqual(len(ids), 0)

    def test_zip_manquant_shx_dbf_erreur(self):
        with _RetryTmp() as tmp:
            _writer_points(tmp, 'inc', [(24.456, -0.123, 'A', 'puits')])
            buf = io.BytesIO()
            with zipfile.ZipFile(buf, 'w') as z:
                z.write(os.path.join(tmp, 'inc.shp'), 'inc.shp')
            avant = CoucheGeometrie.objects.count()
            r, ids = self.importer_geometrie('Incomplet', 'inc.zip', buf.getvalue())
        self.assertEqual(r.status_code, 302)
        self.assertEqual(CoucheGeometrie.objects.count(), avant)
        self.assertEqual(len(ids), 0)

    def test_fichiers_sources_stockes_media(self):
        with _RetryTmp() as tmp:
            _writer_points(tmp, 'src', [(24.456, -0.123, 'A', 'puits')])
            buf = _zip_depuis(tmp, ['src'], prj=_prj_utm(35, nord=False), cpg=b'UTF-8')
            _, ids = self.importer_geometrie('Sources', 'src.zip', buf)
        c = CoucheGeometrie.objects.get(pk=list(ids)[0])
        self.assertEqual(c.fichier_shp.name, f'layers/couche_{c.pk}/src.shp')
        for f in (c.fichier_shp, c.fichier_shx, c.fichier_dbf, c.fichier_prj, c.fichier_cpg):
            self.assertTrue(os.path.exists(os.path.join(settings.MEDIA_ROOT, f.name)),
                            f'fichier {f.name} présent sur disque')
        self.assertFalse(c.fichier_qmd)

    def test_export_shp_zip_complet(self):
        with _RetryTmp() as tmp:
            _writer_points(tmp, 'exp', [(24.456, -0.123, 'A', 'puits'), (24.512, -0.145, 'B', 'marche')])
            buf = _zip_depuis(tmp, ['exp'])
            _, ids = self.importer_geometrie('Export', 'exp.zip', buf)
        c = CoucheGeometrie.objects.get(pk=list(ids)[0])
        r = self.client.get(f'/geometrie/couche/{c.pk}/export-shp/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r['Content-Type'], 'application/zip')
        contenu = b''.join(r.streaming_content) if getattr(r, 'streaming_content', None) else r.content
        with zipfile.ZipFile(io.BytesIO(contenu)) as z:
            noms = set(z.namelist())
        base_zip = c.nom.replace(' ', '_')
        self.assertTrue({base_zip + '.shp', base_zip + '.shx',
                         base_zip + '.dbf', base_zip + '.prj'} <= noms,
                        'ZIP d\'export complet (shp+shx+dbf+prj)')
        with zipfile.ZipFile(io.BytesIO(contenu)) as z:
            prj = z.read(base_zip + '.prj').decode('utf-8', errors='replace')
        self.assertIn('WGS_1984', prj)
        self.assertIn('EPSG","4326"', prj)

    def test_metadonnees_lecture_et_mise_a_jour(self):
        with _RetryTmp() as tmp:
            _writer_points(tmp, 'meta', [(24.456, -0.123, 'A', 'puits')])
            buf = _zip_depuis(tmp, ['meta'], prj=_prj_utm(35, nord=False), cpg=b'UTF-8')
            _, ids = self.importer_geometrie('Meta', 'meta.zip', buf)
        c = CoucheGeometrie.objects.get(pk=list(ids)[0])
        r = self.client.get(f'/geometrie/couche/{c.pk}/metadonnees/?ajax=1')
        self.assertEqual(r.status_code, 200)
        j = r.json()
        self.assertEqual(j['nom'], 'Meta')
        self.assertEqual(j['nom_original'], 'meta.shp')
        self.assertEqual(j['epsg'], 32735)
        self.assertEqual(j['encodage'], 'utf-8')
        self.assertEqual(j['nb_entites'], 1)
        self.assertIn('layers/couche_%d/meta.shp' % c.pk, j['fichiers_sources'])
        r = self.client.post(f'/geometrie/couche/{c.pk}/metadonnees/?ajax=1',
                             {'nom': 'Meta 2', 'source': 'Enquête terrain',
                              'description': 'Points levés au GPS', 'statut': 'archivee'})
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()['ok'])
        c.refresh_from_db()
        self.assertEqual(c.nom, 'Meta 2')
        self.assertEqual(c.source, 'Enquête terrain')
        self.assertEqual(c.description, 'Points levés au GPS')
        self.assertEqual(c.statut, 'archivee')

    def test_admin_couches_page(self):
        """§20 : la page admin liste les couches et n'est accessible qu'aux superusers."""
        with _RetryTmp() as tmp:
            _writer_points(tmp, 'adm', [(24.456, -0.123, 'A', 'puits')])
            buf = _zip_depuis(tmp, ['adm'])
            _, ids = self.importer_geometrie('Admin Couche', 'adm.zip', buf)
        pk = list(ids)[0]
        r = self.client.get('/administration/couches/')
        self.assertEqual(r.status_code, 200)
        contenu = r.content.decode('utf-8', errors='replace')
        self.assertIn('Admin Couche', contenu)
        self.assertIn(f'/geometrie/couche/{pk}/export-shp/', contenu)
        self.assertIn('basculerEdition', contenu)
        simple = User.objects.create_user('simple', 's@m.t', 'p')
        self.client.force_login(simple)
        r = self.client.get('/administration/couches/')
        self.assertEqual(r.status_code, 302, 'page réservée aux administrateurs')
        self.client.force_login(self.admin)

    def test_utilisateur_source_description_enregistres(self):
        with _RetryTmp() as tmp:
            _writer_points(tmp, 'usr', [(24.456, -0.123, 'A', 'puits')])
            buf = _zip_depuis(tmp, ['usr'])
            avant = set(CoucheGeometrie.objects.values_list('pk', flat=True))
            fich = InMemoryUploadedFile(
                io.BytesIO(buf), 'fichier_geom', 'usr.zip',
                'application/octet-stream', len(buf), None)
            r = self.client.post('/geometrie/importer/', {
                'nom_couche': 'Utilisateur', 'fichier_geom': fich,
                'source': 'Rapport 2026', 'description': 'Sites enquêtés',
            })
            ids = set(CoucheGeometrie.objects.values_list('pk', flat=True)) - avant
        self.assertEqual(r.status_code, 302)
        c = CoucheGeometrie.objects.get(pk=list(ids)[0])
        self.assertEqual(c.utilisateur, self.admin)
        self.assertEqual(c.source, 'Rapport 2026')
        self.assertEqual(c.description, 'Sites enquêtés')
        self.assertEqual(c.nom_original, 'usr.shp')
        self.assertEqual(c.fichier_source, 'usr.shp')


from django.conf import settings  # noqa: E402
from django.core.files.uploadedfile import InMemoryUploadedFile  # noqa: E402