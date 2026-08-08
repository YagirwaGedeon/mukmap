# -*- coding: utf-8 -*-
"""Tests du mode hors connexion : synchronisation bidirectionnelle."""
# -*- coding: utf-8 -*-

import io
import json
from datetime import timedelta
from unittest import mock

from django.contrib.auth.models import User
from django.core.files.uploadedfile import InMemoryUploadedFile
from django.utils import timezone

from cartographie.models import MediaPoint, PointGeographique, ProjetAdduction, TraceAdduction

from .base import BaseCartographieTest


def _fichier_png(nom='photo.png'):
    """Fausse image PNG (octets arbitraires ; aucun EXIF)."""
    return InMemoryUploadedFile(io.BytesIO(b'\x89PNG\r\n\x1a\n0123456789'),
                                'fichier', nom, 'image/png', 14, None)


class TestSync(BaseCartographieTest):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.agent = User.objects.create_user('agent1', 'agent@mukmap.local', 'pass')
        cls.p1 = PointGeographique.objects.create(
            nom='Bogoro', latitude=1.409772222, longitude=30.280000,
            categorie='village', statut='actif', province='Ituri',
            donnees={'Population': '2500'},
            projet=cls.projet, auteur=cls.admin, synchro_id='syn-bogoro',
        )
        cls.p2 = PointGeographique.objects.create(
            nom='Goma Centre', latitude=-1.6785, longitude=29.233,
            categorie='village', statut='actif', province='Nord Kivu',
            projet=cls.projet, auteur=cls.admin, synchro_id='syn-goma',
        )

    def _post(self, corps):
        return self.client.post('/api/offline/sync/',
                                data=json.dumps(corps),
                                content_type='application/json')

    def test_exige_connexion(self):
        self.client.logout()
        self.assertEqual(self._post({'operations': []}).status_code, 302)

    def test_operations_vides(self):
        r = self._post({'operations': []})
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data['ok'], [])
        self.assertEqual(data['conflits'], [])
        self.assertIn('horloge', data)

    def test_creation_simple(self):
        r = self._post({'operations': [{
            'type': 'cree',
            'point': {'nom': 'Nouveau', 'latitude': -1.6, 'longitude': 29.2,
                      'categorie': 'ecole', 'statut': 'actif',
                      'province': 'Nord Kivu', 'donnees': {'Pop': '5'},
                      'synchro_id': 'syn-nouveau'},
        }]})
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(len(data['ok']), 1)
        pid = data['ok'][0]['id']
        self.assertTrue(PointGeographique.objects.filter(pk=pid, nom='Nouveau',
                                                         auteur=self.admin).exists())
        # Idempotence : mÃªme synchro_id â†’ ne recrÃ©e pas
        r2 = self._post({'operations': [{
            'type': 'cree',
            'point': {'nom': 'Nouveau copie', 'latitude': -1.6, 'longitude': 29.2,
                      'categorie': 'ecole', 'statut': 'actif',
                      'synchro_id': 'syn-nouveau'},
        }]})
        self.assertEqual(r2.json()['ok'][0]['id'], pid)

    def test_creation_invalide(self):
        r = self._post({'operations': [{'type': 'cree', 'point': {'nom': ''}}]})
        data = r.json()
        self.assertEqual(data['en_erreur'][0]['raison'], 'nom, latitude et longitude requis')

    def test_modification_sans_conflit(self):
        r = self._post({'operations': [{
            'type': 'modifie', 'id': self.p1.pk,
            'base_updated': self.p1.updated_at.isoformat(),
            'point': {'nom': 'Bogoro Village', 'province': 'Ituri 2'},
        }]})
        self.assertEqual(r.status_code, 200)
        self.p1.refresh_from_db()
        self.assertEqual(self.p1.nom, 'Bogoro Village')
        self.assertEqual(self.p1.province, 'Ituri 2')

    def test_modification_conflit(self):
        self.p2.updated_at = timezone.now() + timedelta(hours=5)
        self.p2.save()
        base = self.p2.updated_at - timedelta(hours=2)
        r = self._post({'operations': [{
            'type': 'modifie', 'id': self.p2.pk,
            'base_updated': base.isoformat(),
            'point': {'nom': 'Goma ModifiÃ©e'},
        }]})
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data['ok'], [])
        self.assertEqual(len(data['conflits']), 1)
        conflit = data['conflits'][0]
        self.assertEqual(conflit['id'], self.p2.pk)
        self.assertEqual(conflit['raison'], 'conflit')
        # La modification n'est PAS appliquÃ©e
        self.p2.refresh_from_db()
        self.assertEqual(self.p2.nom, 'Goma Centre')

    def test_suppression_douce(self):
        r = self._post({'operations': [{
            'type': 'supprime', 'id': self.p1.pk,
            'base_updated': self.p1.updated_at.isoformat(),
        }]})
        self.assertEqual(r.status_code, 200)
        self.p1.refresh_from_db()
        self.assertTrue(self.p1.supprime)
        # La liste classique ne montre plus le point
        data = self.client.get('/api/table-points/').json()
        ids = [x['id'] for x in data['results']]
        self.assertNotIn(self.p1.pk, ids)

    def test_autorisation_autre_agent(self):
        # Un agent non superuser ne peut pas modifier le point d'un collÃ¨gue
        self.client.force_login(self.agent)
        r = self._post({'operations': [{
            'type': 'modifie', 'id': self.p1.pk,
            'base_updated': self.p1.updated_at.isoformat(),
            'point': {'nom': 'DÃ©tournÃ©'},
        }]})
        data = r.json()
        self.assertEqual(len(data['conflits']), 1)
        self.assertEqual(data['conflits'][0]['raison'], 'autorisation')
        self.p1.refresh_from_db()
        self.assertEqual(self.p1.nom, 'Bogoro')

    def test_pull_depuis_dernier_sync(self):
        # Liste les modifications survenues aprÃ¨s un instant donnÃ©
        dernier_sync = (timezone.now() - timedelta(days=1)).isoformat()
        r = self._post({'operations': [], 'dernier_sync': dernier_sync})
        data = r.json()
        self.assertEqual(len(data['pulls']), 2)  # p1 + p2 modifiÃ©s depuis hier

    def test_pull_rien_si_aucune_modification(self):
        r = self._post({'operations': [], 'dernier_sync': timezone.now().isoformat()})
        data = r.json()
        self.assertEqual(data['pulls'], [])

    def test_serie_updated_at_present(self):
        data = self.client.get('/api/table-points/', {'page_size': 1}).json()
        self.assertIn('updated_at', data['results'][0])
        self.assertIn('supprime', data['results'][0])
        self.assertNotIn('synchro_id', [''])  # champ prÃ©sent dans le sÃ©rialiseur

    def test_pull_inclut_suppressions(self):
        self.p2.supprime = True
        self.p2.save()
        dernier_sync = (timezone.now() - timedelta(days=1)).isoformat()
        r = self._post({'operations': [], 'dernier_sync': dernier_sync})
        data = r.json()
        pulls = {p['type'] for p in data['pulls']}
        self.assertIn('supprime', pulls)

    def test_point_introuvable(self):
        r = self._post({'operations': [{
            'type': 'modifie', 'id': 99999, 'point': {'nom': 'X'},
        }]})
        data = r.json()
        self.assertEqual(data['en_erreur'][0]['raison'], 'point introuvable')

def test_type_inconnu(self):
        r = self._post({'operations': [{
            'type': 'bizarre', 'id': self.p1.pk, 'point': {},
        }]})
        data = r.json()
        self.assertEqual(data['ok'], [])
        self.assertIn('raison', data['en_erreur'][0])


class TestTracesSync(BaseCartographieTest):
    """Synchronisation hors connexion des tracés de conduites (Adduction)."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.agent = User.objects.create_user('agent2', 'agent2@mukmap.local', 'pass')
        cls.projet_adduction = ProjetAdduction.objects.create(nom='Adduction Bogoro', cree_par=cls.admin)
        cls.t1 = TraceAdduction.objects.create(
            projet=cls.projet_adduction, nom='Trace 1',
            coordonnees=[[30.1, 1.4, 1500], [30.2, 1.5, 1600]], synchro_id='syn-t1',
            auteur=cls.admin,
        )

    def _post(self, corps, url='/api/offline/traces/'):
        return self.client.post(url, data=json.dumps(corps),
                                content_type='application/json')

    def test_exige_connexion(self):
        self.client.logout()
        self.assertEqual(self._post({'operations': []}).status_code, 302)

    def test_creation_simple(self):
        r = self._post({'operations': [{
            'type': 'cree',
            'trace': {'nom': 'Trace X', 'coordonnees': [[29.0, -1.0, 800], [29.1, -1.1, 900]],
                      'projet_id': self.projet_adduction.pk, 'synchro_id': 'syn-x'},
        }]})
        data = r.json()
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(data['ok']), 1)
        tid = data['ok'][0]['id']
        t = TraceAdduction.objects.get(pk=tid)
        self.assertEqual(t.nom, 'Trace X')
        self.assertGreater(t.longueur_m, 0, 'longueur calculée')

    def test_creation_sans_projet_prend_premier(self):
        r = self._post({'operations': [{
            'type': 'cree',
            'trace': {'nom': 'Auto', 'coordonnees': [[30.0, 1.0, 1000], [30.1, 1.1, 1000]],
                      'synchro_id': 'syn-auto'},
        }]})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.json()['ok']), 1)

    def test_creation_invalide(self):
        r = self._post({'operations': [{'type': 'cree', 'trace': {'nom': 'Seul'}}]})
        data = r.json()
        self.assertEqual(data['en_erreur'][0]['raison'],
                         'coordonnees : au moins 2 points requis')

    def test_modification_sans_conflit(self):
        r = self._post({'operations': [{
            'type': 'modifie', 'id': self.t1.pk,
            'base_updated': self.t1.updated_at.isoformat(),
            'trace': {'nom': 'Trace 1 modifiée'},
        }]})
        self.assertEqual(r.status_code, 200)
        self.t1.refresh_from_db()
        self.assertEqual(self.t1.nom, 'Trace 1 modifiée')

    def test_modification_conflit(self):
        self.t1.updated_at = timezone.now() + timedelta(hours=4)
        self.t1.save()
        base = self.t1.updated_at - timedelta(hours=1)
        r = self._post({'operations': [{
            'type': 'modifie', 'id': self.t1.pk,
            'base_updated': base.isoformat(),
            'trace': {'nom': 'Détourné'},
        }]})
        data = r.json()
        self.assertEqual(len(data['conflits']), 1)
        self.assertEqual(data['conflits'][0]['raison'], 'conflit')
        self.t1.refresh_from_db()
        self.assertEqual(self.t1.nom, 'Trace 1')

    def test_suppression(self):
        t2 = TraceAdduction.objects.create(
            projet=self.projet_adduction, nom='Sup',
            coordonnees=[[30.0, 1.0, 1200], [30.2, 1.2, 1300]], synchro_id='syn-sup',
            auteur=self.admin)
        r = self._post({'operations': [{
            'type': 'supprime', 'id': t2.pk,
            'base_updated': t2.updated_at.isoformat(),
        }]})
        data = r.json()
        self.assertEqual(len(data['ok']), 1)
        self.assertFalse(TraceAdduction.objects.filter(pk=t2.pk).exists())

    def test_autorisation_autre_agent(self):
        self.client.force_login(self.agent)
        r = self._post({'operations': [{
            'type': 'modifie', 'id': self.t1.pk,
            'base_updated': self.t1.updated_at.isoformat(),
            'trace': {'nom': 'Vol'},
        }]})
        data = r.json()
        self.assertEqual(len(data['conflits']), 1)
        self.assertEqual(data['conflits'][0]['raison'], 'autorisation')

    def test_pull_depuis_dernier_sync(self):
        avant = (timezone.now() - timedelta(days=1)).isoformat()
        r = self._post({'operations': [], 'dernier_sync': avant})
        data = r.json()
        self.assertEqual(len(data['pulls']), 1)
        self.assertEqual(data['pulls'][0]['trace']['id'], self.t1.pk)

    def test_trace_introuvable(self):
        r = self._post({'operations': [{'type': 'modifie', 'id': 99999,
                                        'trace': {'nom': 'X'}}]})
        self.assertEqual(r.json()['en_erreur'][0]['raison'], 'tracé introuvable')


class TestPhotosOffline(BaseCartographieTest):
    """Upload multipart des photos capturées hors connexion."""

    def test_upload_photo(self):
        self.point = PointGeographique.objects.create(
            nom='Source', latitude=1.4, longitude=30.2, categorie='village',
            statut='actif', projet=self.projet, auteur=self.admin)
        r = self.client.post('/api/offline/photos/', {
            'point_id': str(self.point.pk),
            'fichier': _fichier_png(),
            'commentaire': 'Prise hors ligne',
        })
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()['ok'])
        media = MediaPoint.objects.get(point=self.point)
        self.assertEqual(media.commentaire, 'Prise hors ligne')
        self.assertEqual(media.utilisateur, self.admin)

    def test_upload_point_inexistant(self):
        r = self.client.post('/api/offline/photos/', {
            'point_id': '99999',
            'fichier': _fichier_png(),
        })
        self.assertEqual(r.status_code, 404)

    def test_upload_sans_fichier(self):
        point = PointGeographique.objects.create(
            nom='Photo manquante', latitude=1.0, longitude=29.0, categorie='autre',
            statut='actif', projet=self.projet, auteur=self.admin)
        r = self.client.post('/api/offline/photos/', {'point_id': str(point.pk)})
        self.assertEqual(r.status_code, 400)

    def test_upload_autorisation(self):
        agent = User.objects.create_user('agent3', 'agent3@mukmap.local', 'pass')
        self.client.force_login(agent)
        point = PointGeographique.objects.create(
            nom='Quelquun', latitude=0.0, longitude=0.0, categorie='autre',
            statut='actif', projet=self.projet, auteur=self.admin)
        r = self.client.post('/api/offline/photos/', {
            'point_id': str(point.pk),
            'fichier': _fichier_png(),
        })
        self.assertEqual(r.status_code, 403)
        self.assertEqual(MediaPoint.objects.count(), 0)
