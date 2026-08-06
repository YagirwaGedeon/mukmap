# -*- coding: utf-8 -*-
"""API des fonds de carte personnalisés (Mode Avancé) : création, liste, suppression."""

import json

from django.contrib.auth.models import User

from cartographie.models import FondCartePersonnalise

from .base import BaseCartographieTest


class TestsFondsCartesPersonnalises(BaseCartographieTest):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.agent = User.objects.create_user('agent1', 'agent1@mukmap.local', 'pass')
        cls.principal = User.objects.get(username='YAGIRWA')

    def _activer_avance(self):
        s = self.client.session
        s['mode_avance_autorise'] = True
        s.save()

    def _poster(self, data):
        return self.client.post('/api/fonds-personnalises/',
                                data=json.dumps(data), content_type='application/json')

    def test_creation_sans_acces_refusee(self):
        self.client.force_login(self.agent)
        r = self._poster({'nom': 'Geo', 'type': 'xyz', 'url': 'https://x/{z}/{x}/{y}.png'})
        self.assertEqual(r.status_code, 403)
        self.assertEqual(FondCartePersonnalise.objects.count(), 0)

    def test_creation_valide(self):
        self.client.force_login(self.agent)
        self._activer_avance()
        r = self._poster({'nom': 'Géologie Nord-Kivu', 'type': 'wms',
                          'url': 'https://geo.example/wms?layers=geol&bbox={bbox-epsg-3857}',
                          'attribution': 'Exemple', 'categorie': 'geologie'})
        self.assertEqual(r.status_code, 200)
        d = r.json()
        self.assertTrue(d['ok'])
        self.assertTrue(d['fond']['id'].startswith('ext-'))
        self.assertEqual(d['fond']['categorie'], 'geologie')
        obj = FondCartePersonnalise.objects.get(pk=d['fond']['pk'])
        self.assertEqual(obj.auteur, self.agent)
        self.assertEqual(obj.type_fond, 'wms')
        self.assertEqual(str(obj), 'Géologie Nord-Kivu (WMS)')

    def test_creation_validation_champs(self):
        self.client.force_login(self.agent)
        self._activer_avance()
        r = self._poster({'nom': 'Mauvais', 'type': 'xyz', 'url': 'ftp://x'})
        self.assertEqual(r.status_code, 400)
        r = self._poster({'nom': 'Mauvais', 'type': 'xyz', 'url': 'https://x.png'})
        self.assertEqual(r.status_code, 400)
        r = self._poster({'nom': '', 'type': 'xyz', 'url': 'https://x/{z}/{x}/{y}.png'})
        self.assertEqual(r.status_code, 400)
        r = self._poster({'nom': 'X', 'type': 'wms', 'url': 'https://x/{bbox-epsg-3857}'})
        self.assertEqual(r.status_code, 200)

    def test_liste_visible_avec_acces(self):
        self.client.force_login(self.agent)
        self._activer_avance()
        self._poster({'nom': 'FondA', 'type': 'xyz', 'url': 'https://a/{z}/{x}/{y}.png'})
        r = self.client.get('/api/fonds-personnalises/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.json()['fonds']), 1)

    def test_liste_restreinte_sans_acces(self):
        self.client.force_login(self.agent)
        f = FondCartePersonnalise.objects.create(nom='FondB', type_fond='xyz',
                                                 url='https://b/{z}/{x}/{y}.png', auteur=self.agent)
        FondCartePersonnalise.objects.create(nom='FondC', type_fond='xyz',
                                             url='https://c/{z}/{x}/{y}.png', auteur=self.principal)
        r = self.client.get('/api/fonds-personnalises/')
        self.assertEqual([f2['id'] for f2 in r.json()['fonds']], ['ext-%d' % f.pk])

    def test_suppression_proprietaire(self):
        self.client.force_login(self.agent)
        f = FondCartePersonnalise.objects.create(nom='FondD', type_fond='xyz',
                                                 url='https://d/{z}/{x}/{y}.png', auteur=self.agent)
        r = self.client.delete('/api/fonds-personnalises/%d/' % f.pk)
        self.assertEqual(r.status_code, 200)
        self.assertFalse(FondCartePersonnalise.objects.filter(pk=f.pk).exists())

    def test_suppression_refusee_non_proprietaire(self):
        self.client.force_login(self.agent)
        f = FondCartePersonnalise.objects.create(nom='FondE', type_fond='xyz',
                                                 url='https://e/{z}/{x}/{y}.png', auteur=self.principal)
        r = self.client.delete('/api/fonds-personnalises/%d/' % f.pk)
        self.assertEqual(r.status_code, 403)
        self.assertTrue(FondCartePersonnalise.objects.filter(pk=f.pk).exists())

    def test_suppression_admin_principal(self):
        self.client.force_login(self.principal)
        f = FondCartePersonnalise.objects.create(nom='FondF', type_fond='xyz',
                                                 url='https://f/{z}/{x}/{y}.png', auteur=self.agent)
        r = self.client.delete('/api/fonds-personnalises/%d/' % f.pk)
        self.assertEqual(r.status_code, 200)
        self.assertFalse(FondCartePersonnalise.objects.filter(pk=f.pk).exists())

    def test_creation_vector_mvt(self):
        self.client.force_login(self.agent)
        self._activer_avance()
        r = self._poster({'nom': 'Hydro MVT', 'type': 'vector',
                          'url': 'https://tiles.example/hydro/{z}/{x}/{y}.pbf',
                          'layers': 'hydrographie', 'crs': 'EPSG:3857'})
        self.assertEqual(r.status_code, 200)
        d = r.json()
        self.assertEqual(d['fond']['type'], 'vector')
        self.assertEqual(d['fond']['layers'], 'hydrographie')
        self.assertEqual(d['fond']['crs'], 'EPSG:3857')
        obj = FondCartePersonnalise.objects.get(pk=d['fond']['pk'])
        self.assertEqual(obj.layers, 'hydrographie')

    def test_creation_geotiff_sans_placeholder(self):
        self.client.force_login(self.agent)
        self._activer_avance()
        r = self._poster({'nom': 'Ortho COG', 'type': 'geotiff',
                          'url': 'https://data.example/ortho2024.tif'})
        self.assertEqual(r.status_code, 200, r.content)

    def test_creation_mbtiles_avec_placeholder_acceptee(self):
        self.client.force_login(self.agent)
        self._activer_avance()
        r = self._poster({'nom': 'Mbtiles servi', 'type': 'mbtiles',
                          'url': 'https://tiles.example/mbtiles/{z}/{x}/{y}.png'})
        self.assertEqual(r.status_code, 200, r.content)

    def test_cle_api_reservee_au_proprietaire(self):
        from cartographie.models import Projet
        self.client.force_login(self.agent)
        self._activer_avance()
        p = Projet.objects.create(nom='Projet Clé', cree_par=self.principal)
        r = self._poster({'nom': 'Clé', 'type': 'xyz',
                          'url': 'https://x/{z}/{x}/{y}.png?key={cle_api}',
                          'cle_api': 'TOPSECRET', 'projet': p.pk})
        pk = r.json()['fond']['pk']
        d = r.json()['fond']
        self.assertEqual(d['cle_api'], 'TOPSECRET', 'le propriétaire reçoit sa clé')
        autre = User.objects.create_user('agent2', 'agent2@mukmap.local', 'pass')
        self.client.force_login(autre)
        d2 = self.client.get('/api/fonds-personnalises/').json()
        fond = next((f for f in d2['fonds'] if f['pk'] == pk), None)
        self.assertIsNotNone(fond, 'fond du projet visible pour un autre agent')
        self.assertNotIn('cle_api', fond, 'la clé n’est jamais exposée aux autres agents')

    def test_portee_projet_partagee(self):
        from cartographie.models import Projet
        self.client.force_login(self.agent)
        self._activer_avance()
        p = Projet.objects.create(nom='Projet Test', cree_par=self.principal)
        r = self._poster({'nom': 'Fond Projet', 'type': 'xyz',
                          'url': 'https://p/{z}/{x}/{y}.png', 'projet': p.pk})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['fond']['portee'], 'projet')
        autre = User.objects.create_user('agent3', 'agent3@mukmap.local', 'pass')
        self.client.force_login(autre)
        d = self.client.get('/api/fonds-personnalises/').json()
        ids = [f['pk'] for f in d['fonds']]
        self.assertIn(r.json()['fond']['pk'], ids, 'fond du projet visible pour un agent')

    def test_portee_projet_ignore_si_inactif(self):
        from cartographie.models import Projet
        self.client.force_login(self.agent)
        self._activer_avance()
        p = Projet.objects.create(nom='Projet Archive', cree_par=self.principal, statut='archive')
        r = self._poster({'nom': 'Fond Arch', 'type': 'xyz',
                          'url': 'https://a/{z}/{x}/{y}.png', 'projet': p.pk})
        self.assertEqual(r.status_code, 200)
        self.assertIsNone(r.json()['fond']['projet'], 'projet archivé ignoré')

    def test_patch_modification(self):
        self.client.force_login(self.agent)
        self._activer_avance()
        r = self._poster({'nom': 'Avant', 'type': 'xyz', 'url': 'https://m/{z}/{x}/{y}.png'})
        pk = r.json()['fond']['pk']
        r = self.client.patch('/api/fonds-personnalises/%d/' % pk,
                              data=json.dumps({'nom': 'Après', 'attribution': '© Moi'}),
                              content_type='application/json')
        self.assertEqual(r.status_code, 200)
        d = r.json()['fond']
        self.assertEqual(d['nom'], 'Après')
        self.assertEqual(d['attribution'], '© Moi')
        obj = FondCartePersonnalise.objects.get(pk=pk)
        self.assertEqual(obj.nom, 'Après')
