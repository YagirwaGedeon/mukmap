# -*- coding: utf-8 -*-
"""API Imagerie aérienne : upload (EXIF GPS / WorldFile / bbox), liste, visibilité, suppression."""

import io
import json

from django.contrib.auth.models import User
from django.core.files.uploadedfile import InMemoryUploadedFile

from cartographie.models import ImageAerienne

from .base import BaseCartographieTest


def _image(extension='PNG', largeur=100, hauteur=50, exif_gps=None):
    from fractions import Fraction
    from PIL import Image as PILImage
    img = PILImage.new('RGB', (largeur, hauteur), 'red')
    buf = io.BytesIO()
    if extension == 'PNG':
        img.save(buf, 'PNG')
    else:
        if exif_gps:
            def _frac(v):
                return Fraction(v[0], v[1]) if isinstance(v, tuple) and len(v) == 2 else Fraction(v)
            exif = img.getexif()
            gps = {}
            for cle, valeur in exif_gps.items():
                gps[cle] = tuple(_frac(v) for v in valeur) if isinstance(valeur, tuple) else valeur
            exif[34853] = gps
            img.save(buf, 'JPEG', exif=exif)
        else:
            img.save(buf, 'JPEG')
    buf.seek(0)
    return InMemoryUploadedFile(buf, 'fichier', 'vol.' + extension.lower(), 'image/' + extension.lower(), buf.getbuffer().nbytes, None)


def _fichier_texte(contenu, nom='vol.pgw'):
    data = ('\n'.join(contenu) + '\n').encode('utf-8')
    return InMemoryUploadedFile(io.BytesIO(data), 'worldfile', nom, 'text/plain', len(data), None)


class TestsImagerie(BaseCartographieTest):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.agent = User.objects.create_user('agent1', 'agent1@mukmap.local', 'pass')
        cls.principal = User.objects.get(username='YAGIRWA')

    def _activer_avance(self):
        s = self.client.session
        s['mode_avance_autorise'] = True
        s.save()

    def _uploader(self, fichier, **extra):
        data = {'nom': 'Vol test', 'fichier': fichier}
        data.update(extra)
        return self.client.post('/api/imagerie/', data)

    def test_upload_sans_acces_refusee(self):
        self.client.force_login(self.agent)
        r = self._uploader(_image())
        self.assertEqual(r.status_code, 403)
        self.assertEqual(ImageAerienne.objects.count(), 0)

    def test_upload_bbox_manuelle(self):
        self.client.force_login(self.agent)
        self._activer_avance()
        r = self._uploader(_image(), min_lon='29.0', min_lat='-1.7', max_lon='29.5', max_lat='-1.2')
        self.assertEqual(r.status_code, 200)
        d = r.json()['image']
        self.assertEqual(d['mode_geo'], 'bbox')
        self.assertEqual(d['coords'], None)
        self.assertEqual((d['min_lon'], d['min_lat'], d['max_lon'], d['max_lat']), (29.0, -1.7, 29.5, -1.2))
        obj = ImageAerienne.objects.get(pk=d['id'])
        self.assertEqual(obj.auteur, self.agent)
        self.assertTrue(obj.fichier.name.startswith('imagerie/'))

    def test_upload_exif_gps(self):
        self.client.force_login(self.agent)
        self._activer_avance()
        gps = {1: 'S', 2: ((1, 1), (40, 1), (0, 1)), 3: 'E', 4: ((29, 1), (14, 1), (0, 1))}
        r = self._uploader(_image(extension='JPG', exif_gps=gps))
        self.assertEqual(r.status_code, 200)
        d = r.json()['image']
        self.assertEqual(d['mode_geo'], 'exif')
        self.assertAlmostEqual(d['min_lon'], 29.2333 - 0.0015, places=3)
        self.assertAlmostEqual(d['max_lat'], -1.6667 + 0.0015, places=3)

    def test_upload_worldfile(self):
        self.client.force_login(self.agent)
        self._activer_avance()
        wf = _fichier_texte(['0.01', '0', '0', '-0.01', '29.0', '-1.0'])
        r = self._uploader(_image(), worldfile=wf)
        self.assertEqual(r.status_code, 200)
        d = r.json()['image']
        self.assertEqual(d['mode_geo'], 'worldfile')
        self.assertEqual(d['coords'], [[29.0, -1.0], [30.0, -1.0], [30.0, -1.5], [29.0, -1.5]])
        self.assertEqual((d['min_lon'], d['min_lat'], d['max_lon'], d['max_lat']), (29.0, -1.5, 30.0, -1.0))

    def test_upload_worldfile_illisible(self):
        self.client.force_login(self.agent)
        self._activer_avance()
        wf = _fichier_texte(['a', 'b', 'c'])
        r = self._uploader(_image(), worldfile=wf)
        self.assertEqual(r.status_code, 400)

    def test_upload_sans_coordonnees_refuse(self):
        self.client.force_login(self.agent)
        self._activer_avance()
        r = self._uploader(_image(extension='PNG'))
        self.assertEqual(r.status_code, 400)
        self.assertEqual(ImageAerienne.objects.count(), 0)

    def test_liste(self):
        self.client.force_login(self.agent)
        self._activer_avance()
        self._uploader(_image(), min_lon='29', min_lat='-1', max_lon='30', max_lat='0')
        r = self.client.get('/api/imagerie/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.json()['images']), 1)

    def test_visibilite(self):
        self.client.force_login(self.agent)
        self._activer_avance()
        d = self._uploader(_image(), min_lon='29', min_lat='-1', max_lon='30', max_lat='0').json()['image']
        r = self.client.post('/api/imagerie/%d/visibilite/' % d['id'],
                             data=json.dumps({'visible': False}), content_type='application/json')
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.json()['visible'])
        self.assertFalse(ImageAerienne.objects.get(pk=d['id']).visibilite)

    def test_suppression_proprietaire(self):
        self.client.force_login(self.agent)
        self._activer_avance()
        d = self._uploader(_image(), min_lon='29', min_lat='-1', max_lon='30', max_lat='0').json()['image']
        r = self.client.delete('/api/imagerie/%d/' % d['id'])
        self.assertEqual(r.status_code, 200)
        self.assertFalse(ImageAerienne.objects.filter(pk=d['id']).exists())

    def test_suppression_refusee_non_proprietaire(self):
        self.client.force_login(self.agent)
        obj = ImageAerienne.objects.create(nom='Vol admin', type_imagerie='drone', mode_geo='bbox',
                                           min_lon=29, min_lat=-1, max_lon=30, max_lat=0, auteur=self.principal)
        r = self.client.delete('/api/imagerie/%d/' % obj.pk)
        self.assertEqual(r.status_code, 403)
        self.assertTrue(ImageAerienne.objects.filter(pk=obj.pk).exists())
