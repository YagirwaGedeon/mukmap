# -*- coding: utf-8 -*-
"""Tests de l'API JSON de la table attributaire professionnelle."""

import json

from django.contrib.auth.models import User

from cartographie.api_points import _evaluer_filtre
from cartographie.models import Activite, PointGeographique

from .base import BaseCartographieTest


class TestTableAttributaireAPI(BaseCartographieTest):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.agent = User.objects.create_user('agent1', 'agent@mukmap.local', 'pass')
        cls.p1 = PointGeographique.objects.create(
            nom='Bogoro', latitude=1.409772222, longitude=30.280000,
            categorie='village', statut='actif', province='Ituri',
            commune='Irumu', quartier='Centre', description='Village d\'eau',
            donnees={'No': '1', 'Province': 'Ituri', 'Territoire': 'Irumu',
                     'Activite': 'Adduction', 'Lat': '1.409772222', 'Long': '30.280000',
                     'Population': '2500', 'Statut des etudes': 'Terminees'},
            source_fichier='sites.csv', source_format='CSV',
            projet=cls.projet, auteur=cls.admin,
        )
        cls.p2 = PointGeographique.objects.create(
            nom='Goma Centre', latitude=-1.6785, longitude=29.233,
            categorie='village', statut='actif', province='Nord Kivu',
            donnees={'Population': '1200'},
            projet=cls.projet, auteur=cls.agent,
        )
        cls.p3 = PointGeographique.objects.create(
            nom='Hopital Bethesda', latitude=-1.6920, longitude=29.2360,
            categorie='hopital', statut='en_cours', province='Nord Kivu',
            donnees={'Population': '0'},
            projet=cls.projet, auteur=cls.admin,
        )

    def _get(self, params=None, chemin='/api/table-points/'):
        return self.client.get(chemin, params or {})

    def test_liste_base(self):
        r = self._get({'page_size': 10})
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data['count'], 3)
        ids = [x['id'] for x in data['results']]
        self.assertEqual(set(ids), {self.p1.pk, self.p2.pk, self.p3.pk})

    def test_tri_date_defaut_desc(self):
        data = self._get().json()
        dates = [x['date_creation'] for x in data['results']]
        self.assertEqual(dates, sorted(dates, reverse=True))

    def test_tri_nom_asc(self):
        data = self._get({'tri': 'nom', 'direction': 'asc'}).json()
        noms = [x['nom'] for x in data['results']]
        self.assertEqual(noms, sorted(noms, key=str.lower))

    def test_pagination(self):
        data = self._get({'page': 1, 'page_size': 2}).json()
        self.assertEqual(data['count'], 3)
        self.assertEqual(data['pages'], 2)
        self.assertEqual(len(data['results']), 2)
        data2 = self._get({'page': 2, 'page_size': 2}).json()
        self.assertEqual(len(data2['results']), 1)

    def test_recherche_texte(self):
        data = self._get({'q': 'Bethesda'}).json()
        self.assertEqual(data['count'], 1)
        self.assertEqual(data['results'][0]['nom'], 'Hopital Bethesda')

    def test_filtre_eq_categorie(self):
        f = json.dumps({'logique': 'et', 'filtres': [{'champ': 'categorie', 'op': 'eq', 'valeur': 'village'}]})
        data = self._get({'filtres': f}).json()
        self.assertEqual(data['count'], 2)

    def test_filtre_dans_statut(self):
        f = json.dumps({'logique': 'et', 'filtres': [{'champ': 'statut', 'op': 'dans', 'valeur': ['actif', 'en_cours']}]})
        data = self._get({'filtres': f}).json()
        self.assertEqual(data['count'], 3)

    def test_filtre_and_multiple(self):
        f = json.dumps({'logique': 'et', 'filtres': [
            {'champ': 'categorie', 'op': 'eq', 'valeur': 'village'},
            {'champ': 'province', 'op': 'contient', 'valeur': 'Kivu'},
        ]})
        data = self._get({'filtres': f}).json()
        ids = [x['id'] for x in data['results']]
        self.assertEqual(ids, [self.p2.pk])

    def test_filtre_ou(self):
        f = json.dumps({'logique': 'ou', 'filtres': [
            {'champ': 'categorie', 'op': 'eq', 'valeur': 'hopital'},
            {'champ': 'province', 'op': 'eq', 'valeur': 'Ituri'},
        ]})
        data = self._get({'filtres': f}).json()
        ids = {x['id'] for x in data['results']}
        self.assertEqual(ids, {self.p1.pk, self.p3.pk})

    def test_filtre_date_plage(self):
        # tous créés aujourd'hui → une plage englobante valide 2 points via strcmp
        f = json.dumps({'logique': 'et', 'filtres': [{'champ': 'date_creation', 'op': 'entre', 'valeur': ['2000-01-01', '2100-01-01']}]})
        self.assertEqual(self._get({'filtres': f}).json()['count'], 3)
        f_vide = json.dumps({'logique': 'et', 'filtres': [{'champ': 'date_creation', 'op': 'entre', 'valeur': ['1990-01-01', '1995-01-01']}]})
        self.assertEqual(self._get({'filtres': f_vide}).json()['count'], 0)

    def test_filtre_numerique_modele(self):
        f = json.dumps({'logique': 'et', 'filtres': [{'champ': 'latitude', 'op': 'sup', 'valeur': 0}]})
        data = self._get({'filtres': f}).json()
        self.assertEqual([x['id'] for x in data['results']], [self.p1.pk])

    def test_filtre_json_cle(self):
        f = json.dumps({'logique': 'et', 'filtres': [{'champ': 'd:Population', 'op': 'sup', 'valeur': 1000}]})
        data = self._get({'filtres': f}).json()
        self.assertEqual({x['id'] for x in data['results']}, {self.p1.pk, self.p2.pk})

    def test_filtre_ou_mixte_json_modele(self):
        f = json.dumps({'logique': 'ou', 'filtres': [
            {'champ': 'd:Population', 'op': 'sup', 'valeur': 1000},
            {'champ': 'categorie', 'op': 'eq', 'valeur': 'hopital'},
        ]})
        data = self._get({'filtres': f}).json()
        ids = {x['id'] for x in data['results']}
        self.assertEqual(ids, {self.p1.pk, self.p2.pk, self.p3.pk})

    def test_bbox(self):
        data = self._get({'bbox': '29,-2,29.5,0'}).json()  # autour de Goma (2 points sud)
        self.assertEqual(data['count'], 2)

    def test_facettes_et_stats(self):
        data = self._get({'apercu': '1'}).json()
        self.assertIn('colonnes', data)
        self.assertIn('facettes', data)
        self.assertIn('stats', data)
        prov = {x['valeur']: x['total'] for x in data['facettes']['province']}
        self.assertEqual(prov.get('Nord Kivu'), 2)
        self.assertEqual(data['stats']['total'], 3)
        self.assertEqual(data['stats']['par_categorie'].get('Hôpital'), 1)

    def test_colonnes_json_detectees(self):
        data = self._get({'apercu': '1'}).json()
        champs = [c['champ'] for c in data['colonnes']]
        self.assertIn('d:Population', champs)
        self.assertIn('nom', champs)

    def test_ajout(self):
        body = {'nom': 'Nouveau', 'latitude': 1.5, 'longitude': 30.5,
                'categorie': 'ecole', 'donnees': {'Classe': '6e'}}
        r = self.client.post('/api/table-points/creer/',
                             data=json.dumps(body), content_type='application/json')
        self.assertEqual(r.status_code, 201)
        self.assertEqual(PointGeographique.objects.filter(nom='Nouveau').count(), 1)

    def test_creation_manque_nom(self):
        r = self.client.post('/api/table-points/creer/',
                             data=json.dumps({'latitude': 1}), content_type='application/json')
        self.assertEqual(r.status_code, 400)

    def test_modification_superuser(self):
        # un superadmin peut modifier le point d'un agent (contrôle existant de point_edit)
        body = {'nom': 'Goma par admin'}
        r = self.client.post(f'/api/table-points/{self.p2.pk}/modifier/',
                             data=json.dumps(body), content_type='application/json')
        self.assertEqual(r.status_code, 200)

    def test_modification_autre_agent_refusee(self):
        autre = User.objects.create_user('agent2', 'a2@mukmap.local', 'pass')
        self.client.logout()
        self.client.force_login(autre)
        r = self.client.post(f'/api/table-points/{self.p2.pk}/modifier/',
                             data=json.dumps({'nom': 'forbidden'}), content_type='application/json')
        self.assertEqual(r.status_code, 403)

    def test_modification_proprietaire(self):
        self.client.logout()
        self.client.force_login(self.agent)
        r = self.client.post(f'/api/table-points/{self.p2.pk}/modifier/',
                             data=json.dumps({'nom': 'Goma par son agent'}),
                             content_type='application/json')
        self.assertEqual(r.status_code, 200)
        self.p2.refresh_from_db()
        self.assertEqual(self.p2.nom, 'Goma par son agent')

    def test_suppression(self):
        avant = self.p1.pk
        r = self.client.post('/api/table-points/supprimer/',
                             data=json.dumps({'ids': [avant]}), content_type='application/json')
        self.assertEqual(r.status_code, 200)
        self.assertFalse(PointGeographique.objects.filter(pk=avant).exists())

    def test_export_csv(self):
        r = self._get(chemin='/api/table-points/export/csv/')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.content.startswith(b'\xef\xbb\xbf'))
        self.assertIn('Bethesda'.encode('utf-8'), r.content)

    def test_export_geojson(self):
        r = self._get(chemin='/api/table-points/export/geojson/')
        data = r.json()
        self.assertEqual(data['type'], 'FeatureCollection')
        self.assertEqual(len(data['features']), 3)

    def test_acces_non_connecte(self):
        self.client.logout()
        self.assertEqual(self._get().status_code, 302)
        self.assertEqual(self.client.post('/api/table-points/creer/', data=json.dumps({}), content_type='application/json').status_code, 302)


class TestTableAttributairePage(BaseCartographieTest):
    def test_page_charge(self):
        r = self.client.get('/table-attributaire/')
        self.assertEqual(r.status_code, 200)
        contenu = r.content.decode('utf-8')
        self.assertIn('ta-carte', contenu)
        self.assertIn('TableAttributaire.demarrer', contenu)

    def test_page_non_connecte_redirige(self):
        self.client.logout()
        r = self.client.get('/table-attributaire/')
        self.assertEqual(r.status_code, 302)
