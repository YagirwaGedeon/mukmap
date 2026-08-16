# -*- coding: utf-8 -*-
"""Tests de sécurité : durcissement connexion, XSS JSON, WGS84, corbeille,
déconnexion POST, médias invalides, mots de passe des agents."""

import io

from django.core.files.uploadedfile import InMemoryUploadedFile
from django.test import TestCase, override_settings

from cartographie.models import MediaPoint, PointGeographique

from .base import BaseCartographieTest


class TestConnexionDurcie(TestCase):
    def setUp(self):
        self.admin = __import__('django.contrib.auth.models', fromlist=['User']).User.objects.create_superuser(
            'patron', 'patron@mukmap.local', 'motdepassefort123')

    def test_mot_de_passe_par_defaut_refuse(self):
        """Un compte encore sur mot de passe par défaut ne peut pas se connecter."""
        r = self.client.post('/connexion/', {
            'username': 'patron', 'password': 'motdepassefort123',
            'type': 'admin',
        })
        self.assertEqual(r.status_code, 302)
        # On passe le compte sur un mot de passe par défaut
        self.admin.set_password('YENE2026')
        self.admin.save()
        r = self.client.post('/connexion/', {
            'username': 'patron', 'password': 'YENE2026',
            'type': 'admin',
        })
        self.assertEqual(r.status_code, 200)
        page = r.content.decode('utf-8', errors='replace')
        self.assertIn('mot de passe est encore celui par défaut', page)
        s = self.client.session
        self.assertNotIn('_auth_user_id', s)

    def test_rate_limit_connexion(self):
        """5 échecs consécutifs bloquent la connexion pendant 15 minutes."""
        for i in range(5):
            r = self.client.post('/connexion/', {
                'username': 'patron', 'password': 'mauvais',
                'type': 'admin',
            })
            self.assertEqual(r.status_code, 200)
        r = self.client.post('/connexion/', {
            'username': 'patron', 'password': 'motdepassefort123',
            'type': 'admin',
        })
        self.assertEqual(r.status_code, 200)
        self.assertIn('Trop de tentatives', r.content.decode('utf-8', errors='replace'))
        from django.core.cache import cache
        cache.clear()

    def test_deconnexion_en_get_redirige_sans_fermer_session(self):
        self.client.force_login(self.admin)
        r = self.client.get('/deconnexion/')
        self.assertIn(r.status_code, (301, 302, 405))
        r2 = self.client.get('/')
        self.assertEqual(r2.status_code, 200)

    def test_deconnexion_post_ferme_session(self):
        self.client.force_login(self.admin)
        r = self.client.post('/deconnexion/')
        self.assertEqual(r.status_code, 302)
        s = self.client.session
        self.assertNotIn('_auth_user_id', s)


class TestXssJson(BaseCartographieTest):
    def test_nom_point_avec_script_echappe_dans_la_page(self):
        PointGeographique.objects.create(
            nom='</script><script>alert(1)</script>',
            description='<b>desc</b> & "guillemets"',
            latitude=1.0, longitude=29.0, projet=self.projet, auteur=self.admin)
        page = self.page_carte()
        self.assertNotIn('</script><script>alert(1)</script>', page)
        self.assertIn('\\u003c/script\\u003e\\u003cscript\\u003e', page)
        self.assertNotIn('"description": "<b>desc</b>', page)

    def test_zone_dangereuse_nom_echappe(self):
        from cartographie.models import ZoneSecurite
        ZoneSecurite.objects.create(
            nom='Zone <img src=x onerror=alert(1)>', statut='dangereuse',
            type_geometrie='Point', coordonnees=[29.0, 1.0], rayon=200,
            auteur=self.admin)
        page = self.page_carte()
        self.assertNotIn('<img src=x onerror=alert(1)>', page)


class TestValidationWgs84(BaseCartographieTest):
    def test_api_creer_refuse_latitude_hors_plage(self):
        r = self.client.post('/api/table-points/creer/',
                             {'nom': 'X', 'latitude': '95', 'longitude': '29'},
                             content_type='application/json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('WGS84', r.json()['erreur'])
        self.assertEqual(PointGeographique.objects.count(), 0)

    def test_api_creer_refuse_longitude_hors_plage(self):
        r = self.client.post('/api/table-points/creer/',
                             {'nom': 'X', 'latitude': '1', 'longitude': '-181'},
                             content_type='application/json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(PointGeographique.objects.count(), 0)

    def test_api_modifier_refuse_latitude_hors_plage(self):
        p = PointGeographique.objects.create(
            nom='P', latitude=1.0, longitude=29.0, projet=self.projet, auteur=self.admin)
        r = self.client.post(f'/api/table-points/{p.pk}/modifier/',
                             {'latitude': '120'},
                             content_type='application/json')
        self.assertEqual(r.status_code, 400)
        p.refresh_from_db()
        self.assertEqual(p.latitude, 1.0)

    def test_creation_formulaire_refuse_coordonnees_invalides(self):
        r = self.client.post('/', {
            'nom': 'X', 'latitude': 'abc', 'longitude': '29',
        })
        self.assertEqual(r.status_code, 302)
        self.assertEqual(PointGeographique.objects.count(), 0)

    def test_edit_point_refuse_latitude_hors_plage(self):
        p = PointGeographique.objects.create(
            nom='P', latitude=1.0, longitude=29.0, projet=self.projet, auteur=self.admin)
        r = self.client.post(f'/point/{p.pk}/edit/', {
            'nom': 'P', 'latitude': '91', 'longitude': '29',
            'categorie': 'autre', 'statut': 'actif',
        })
        self.assertEqual(r.status_code, 302)
        p.refresh_from_db()
        self.assertEqual(p.latitude, 1.0)

    def test_import_geojson_ignore_coordonnees_hors_plage(self):
        contenu = b'{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[29.0,95.0]},"properties":{"nom":"Hors plage"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[29.1,1.1]},"properties":{"nom":"Valide"}}]}'
        fich = InMemoryUploadedFile(
            io.BytesIO(contenu), 'fichier_import', 'points.geojson',
            'application/geo+json', len(contenu), None)
        r = self.client.post('/importer/', {'fichier_import': fich})
        self.assertEqual(r.status_code, 302)
        self.assertEqual(PointGeographique.objects.count(), 1)
        self.assertEqual(PointGeographique.objects.first().nom, 'Valide')

    def test_offline_sync_refuse_coordonnees_hors_plage(self):
        r = self.client.post('/api/offline/sync/', {
            'operations': [{'type': 'cree', 'id': None,
                            'point': {'nom': 'X', 'latitude': 95, 'longitude': 29,
                                      'synchro_id': 's1'}}],
        }, content_type='application/json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.json()['en_erreur']), 1)
        self.assertIn('WGS84', r.json()['en_erreur'][0]['raison'])
        self.assertEqual(PointGeographique.objects.count(), 0)


class TestCorbeille(BaseCartographieTest):
    def test_points_supprimes_invisibles_sur_carte_et_exports(self):
        p = PointGeographique.objects.create(
            nom='Poubelle', latitude=1.0, longitude=29.0,
            projet=self.projet, auteur=self.admin, supprime=True)
        page = self.page_carte()
        self.assertNotIn('Poubelle', page)
        r = self.client.get('/points/donnees/')
        self.assertNotIn('Poubelle', r.content.decode('utf-8'))
        r = self.client.get('/export/geojson/')
        self.assertNotIn('Poubelle', r.content.decode('utf-8'))

    def test_offline_supprime_visible_avec_parametre_supprimes(self):
        p = PointGeographique.objects.create(
            nom='Suppr sync', latitude=1.0, longitude=29.0,
            projet=self.projet, auteur=self.admin, supprime=True)
        r = self.client.get('/api/table-points/', {'supprimes': '1'})
        self.assertIn('Suppr sync', r.content.decode('utf-8'))


class TestMediasInvalides(BaseCartographieTest):
    def test_fichier_non_image_refuse(self):
        faux = InMemoryUploadedFile(
            io.BytesIO(b'pas une image du tout 12345'), 'medias',
            'photo.jpg', 'image/jpeg', 26, None)
        r = self.client.post('/', {
            'nom': 'Point', 'latitude': '1', 'longitude': '29',
            'medias': faux,
        })
        self.assertEqual(r.status_code, 302)
        self.assertEqual(MediaPoint.objects.count(), 0)
        self.assertEqual(PointGeographique.objects.count(), 1)

    @override_settings(MEDIA_TAILLE_MAX_OCTETS=100)
    def test_taille_media_trop_grande_refusee(self):
        from PIL import Image
        buf = io.BytesIO()
        img = Image.new('RGB', (8, 8), (10, 20, 30))
        img.save(buf, 'JPEG')
        img.close()
        gros = InMemoryUploadedFile(
            io.BytesIO(buf.getvalue()), 'medias', 'gros.jpg', 'image/jpeg',
            buf.tell(), None)
        r = self.client.post('/', {
            'nom': 'Point', 'latitude': '1', 'longitude': '29',
            'medias': gros,
        })
        self.assertEqual(r.status_code, 302)
        self.assertEqual(MediaPoint.objects.count(), 0)


class TestAgentCreate(TestCase):
    def test_mot_de_passe_agent_trop_faible_refuse(self):
        from django.contrib.auth.models import User
        admin = User.objects.create_superuser('adminx', 'a@b.c', 'motdepassefort123')
        self.client.force_login(admin)
        r = self.client.post('/agent/creer/', {
            'nom_complet': 'Jean Agent', 'telephone': '0999999999',
            'titre': 'Agent terrain', 'email': 'jean@mukmap.local',
            'username': 'jean', 'password': 'a',
        })
        self.assertNotEqual(r.status_code, 302)
        self.assertFalse(User.objects.filter(username='jean').exists())