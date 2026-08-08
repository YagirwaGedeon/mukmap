# -*- coding: utf-8 -*-
"""Photographies géoréférencées : EXIF GPS/date, commentaire, utilisateur."""

import io
from datetime import datetime

from django.core.files.uploadedfile import InMemoryUploadedFile
from django.utils import timezone

from cartographie.models import MediaPoint, PointGeographique

from .base import BaseCartographieTest


def jpeg_exif(date='2026:03:12 14:30:00', lat=1.234567, lng=29.876543, nom='geo.jpg'):
    """Génère un petit JPEG avec DateTimeOriginal et GPSInfo EXIF."""
    from PIL import Image
    from PIL.ExifTags import IFD
    from PIL.TiffImagePlugin import IFDRational

    def degres(v):
        v = abs(float(v))
        d = int(v)
        m = int((v - d) * 60)
        s = int(round(((v - d) * 60 - m) * 60))
        return tuple(IFDRational(x) for x in (d, m, s))

    img = Image.new('RGB', (6, 6), (180, 60, 60))
    exif = Image.Exif()
    exif[0x0132] = date
    exif[0x9003] = date
    exif[IFD.GPSInfo] = {
        1: b'N', 2: degres(lat),
        3: b'E', 4: degres(lng),
    }
    buf = io.BytesIO()
    img.save(buf, 'JPEG', exif=exif)
    img.close()
    return InMemoryUploadedFile(
        io.BytesIO(buf.getvalue()), 'medias', nom, 'image/jpeg', buf.tell(), None)


def jpeg_brut(nom='brut.jpg'):
    """JPEG sans aucune donnée EXIF."""
    from PIL import Image
    buf = io.BytesIO()
    img = Image.new('RGB', (6, 6), (20, 90, 200))
    img.save(buf, 'JPEG')
    img.close()
    return InMemoryUploadedFile(
        io.BytesIO(buf.getvalue()), 'medias', nom, 'image/jpeg', buf.tell(), None)


class TestsMediasPoints(BaseCartographieTest):
    def test_creation_point_photos_georef(self):
        lat_exif = 1 + 14 / 60 + 4 / 3600      # 1°14'04"N
        lng_exif = 29 + 52 / 60 + 35 / 3600    # 29°52'35"E
        avant = MediaPoint.objects.count()
        r = self.client.post('/', {
            'nom': 'Source Goma', 'latitude': '-1.6785', 'longitude': '29.233',
            'commentaire_medias': 'Vue de la source',
            'medias': jpeg_exif(lat=lat_exif, lng=lng_exif),
        })
        self.assertEqual(r.status_code, 302)
        point = PointGeographique.objects.get(nom='Source Goma')
        m = MediaPoint.objects.get(point=point)
        self.assertEqual(MediaPoint.objects.count(), avant + 1)
        self.assertEqual(m.type, 'photo')
        self.assertAlmostEqual(m.latitude, lat_exif, places=5)
        self.assertAlmostEqual(m.longitude, lng_exif, places=5)
        from datetime import timezone as tz_utc
        self.assertEqual(m.date_prise, datetime(2026, 3, 12, 14, 30, 0, tzinfo=tz_utc.utc))
        self.assertEqual(m.utilisateur, self.admin)
        self.assertEqual(m.commentaire, 'Vue de la source')

    def test_photo_sans_exif_metadonnees_repli(self):
        r = self.client.post('/', {
            'nom': 'Point sans EXIF', 'latitude': '0.5', 'longitude': '28.5',
            'medias': jpeg_brut(),
        })
        self.assertEqual(r.status_code, 302)
        point = PointGeographique.objects.get(nom='Point sans EXIF')
        m = MediaPoint.objects.get(point=point)
        self.assertIsNone(m.latitude)
        self.assertIsNone(m.longitude)
        self.assertIsNotNone(m.date_prise)
        delta = abs((m.date_prise - timezone.now()).total_seconds())
        self.assertLess(delta, 60, 'date de repli = instant d\'enregistrement')

    def test_edit_point_ajoute_photo_avec_commentaire(self):
        point = PointGeographique.objects.create(
            nom='Point test', latitude=1.0, longitude=29.0,
            projet=self.projet, auteur=self.admin,
        )
        r = self.client.post('/point/%d/edit/' % point.pk, {
            'nom': point.nom, 'latitude': '1.0', 'longitude': '29.0',
            'commentaire_medias': 'Relevé du 12/03',
            'medias': jpeg_exif(),
        })
        self.assertEqual(r.status_code, 302)
        m = MediaPoint.objects.get(point=point)
        self.assertEqual(m.commentaire, 'Relevé du 12/03')
        self.assertEqual(m.utilisateur, self.admin)

    def test_formulaire_point_affiche_metadonnees(self):
        point = PointGeographique.objects.create(
            nom='Source-SRC-001', latitude=1.0, longitude=29.0,
            projet=self.projet, auteur=self.admin,
        )
        MediaPoint.objects.create(
            point=point, type='photo', fichier=jpeg_exif(),
            date_prise=datetime(2026, 3, 12, 14, 30, 0),
            latitude=1.234567, longitude=29.876543,
            utilisateur=self.admin, commentaire='Vue de la source',
        )
        contenu = self.client.get('/point/%d/edit/' % point.pk).content.decode('utf-8', errors='replace')
        self.assertIn('Galerie multimédia', contenu)
        self.assertIn('12/03/2026', contenu)
        self.assertIn('1,23457', contenu)
        self.assertIn('Vue de la source', contenu)

    def test_carte_expose_metadonnees_galerie(self):
        contenu = self.page_carte()
        for marqueur in ('metaPhotoHTML', 'compteurPhotos', 'date_prise', 'galerie_multimedia'):
            self.assertIn(marqueur, contenu, 'marqueur %s' % marqueur)
