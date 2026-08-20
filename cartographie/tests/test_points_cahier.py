# -*- coding: utf-8 -*-
"""Cahier des charges POINTS : modèles, CRUD, statuts configurables,
statistiques, visites, historique, permissions, exports enrichis."""

import io
import json

from django.contrib.auth.models import User
from django.core.files.uploadedfile import InMemoryUploadedFile
from django.utils import timezone

from cartographie.models import (HistoriquePoint, PointGeographique,
                                 StatutPoint, Visite)

from .base import BaseCartographieTest


class TestsModelesPoints(BaseCartographieTest):
    def test_code_auto_premiere_sauvegarde(self):
        point = PointGeographique.objects.create(nom='École Sake', latitude=1.0, longitude=29.0)
        self.assertEqual(point.code, 'P-%04d' % point.pk)
        self.assertEqual(point.identifiant, point.code)

    def test_code_auto_avec_prefixe_projet(self):
        self.projet.code = 'SAKE'
        self.projet.save()
        point = PointGeographique.objects.create(nom='Marché Sake', latitude=1.0, longitude=29.0,
                                                 projet=self.projet)
        self.assertEqual(point.code, 'SAKE-%04d' % point.pk)

    def test_code_fourni_conserve(self):
        point = PointGeographique.objects.create(nom='Puits 7', latitude=1.0, longitude=29.0,
                                                 code='EAU-0007', identifiant='EAU-0007')
        self.assertEqual(point.code, 'EAU-0007')

    def test_archive_pas_visible_par_defaut(self):
        PointGeographique.objects.create(nom='Visible', latitude=1.0, longitude=29.0, archive=False)
        PointGeographique.objects.create(nom='Point caché du filtre', latitude=2.0, longitude=29.0, archive=True)
        page = self.client.get('/points/').content.decode('utf-8', errors='replace')
        self.assertIn('Visible', page)
        self.assertNotIn('Point caché du filtre', page)

    def test_archives_visibles_avec_filtre(self):
        PointGeographique.objects.create(nom='Point caché du filtre', latitude=2.0, longitude=29.0, archive=True)
        page = self.client.get('/points/?archives=1').content.decode('utf-8', errors='replace')
        self.assertIn('Point caché du filtre', page)

    def test_historique_cree_a_la_creation(self):
        point = PointGeographique.objects.create(nom='Hôpital Goma', latitude=-1.67, longitude=29.22,
                                                 auteur=self.admin)
        self.assertTrue(point.historique.filter(type='creation').exists() is False)
        HistoriquePoint.objects.create(point=point, type='creation',
                                       action=f"Point créé : {point.code}", utilisateur=self.admin)
        self.assertTrue(point.historique.filter(type='creation').exists())


class TestsCRUDPoints(BaseCartographieTest):
    def test_page_creation_accessible(self):
        r = self.client.get('/point/ajouter/')
        self.assertEqual(r.status_code, 200)
        contenu = r.content.decode('utf-8', errors='replace')
        for fragment in ('Cliquez sur la carte', 'position GPS', 'etat_avancement', 'date_visite'):
            self.assertIn(fragment, contenu)

    def test_creation_point_complet(self):
        r = self.client.post('/point/ajouter/', {
            'nom': 'Point Pro complet', 'latitude': '-1.678', 'longitude': '29.233',
            'altitude': '1500', 'adresse': 'Av. du lac', 'territoire': 'Nyiragongo',
            'secteur': 'Buvira', 'village': 'Buhimba', 'observations': 'Bonne source',
            'statut': 'visite', 'etat_avancement': '80%', 'agent': str(self.admin.pk),
            'date_visite': '2026-08-10T09:00:00Z', 'retour_detail': '1',
        })
        self.assertEqual(r.status_code, 302)
        point = PointGeographique.objects.get(nom='Point Pro complet')
        self.assertEqual(point.territoire, 'Nyiragongo')
        self.assertEqual(point.secteur, 'Buvira')
        self.assertEqual(point.village, 'Buhimba')
        self.assertEqual(point.observations, 'Bonne source')
        self.assertEqual(point.altitude, 1500)
        self.assertEqual(point.statut, 'visite')
        self.assertIsNotNone(point.date_visite)
        self.assertTrue(point.code.startswith('P-'))

    def test_creation_requiert_nom(self):
        r = self.client.post('/point/ajouter/', {'latitude': '1.0', 'longitude': '29.0'})
        self.assertEqual(r.status_code, 302)
        self.assertEqual(PointGeographique.objects.count(), 0)

    def test_creation_coordonnees_invalides(self):
        r = self.client.post('/point/ajouter/', {'nom': 'X', 'latitude': '200', 'longitude': '400'})
        self.assertEqual(r.status_code, 302)
        self.assertEqual(PointGeographique.objects.count(), 0)

    def test_detail_affiche_onglets(self):
        point = PointGeographique.objects.create(nom='Détail test', latitude=1.0, longitude=29.0,
                                                 auteur=self.admin)
        r = self.client.get('/point/%d/' % point.pk)
        self.assertEqual(r.status_code, 200)
        contenu = r.content.decode('utf-8', errors='replace')
        for onglet in ('Informations', 'Localisation', 'Données', 'Visites', 'Historique'):
            self.assertIn(onglet, contenu)
        self.assertIn('Détail test', contenu)

    def test_archivage_puis_restauration(self):
        point = PointGeographique.objects.create(nom='À archiver', latitude=1.0, longitude=29.0,
                                                 auteur=self.admin)
        r = self.client.post('/point/%d/archiver/' % point.pk)
        self.assertEqual(r.status_code, 302)
        point.refresh_from_db()
        self.assertTrue(point.archive)
        self.assertTrue(point.historique.filter(type='archive').exists())
        r = self.client.post('/point/%d/restaurer/' % point.pk)
        self.assertEqual(r.status_code, 302)
        point.refresh_from_db()
        self.assertFalse(point.archive)
        self.assertTrue(point.historique.filter(type='restauration').exists())

    def test_non_auteur_ne_peut_pas_archiver(self):
        autre = User.objects.create_user('autre', password='x')
        point = PointGeographique.objects.create(nom='Point autre', latitude=1.0, longitude=29.0,
                                                 auteur=autre)
        self.client.force_login(self.admin)
        r = self.client.post('/point/%d/archiver/' % point.pk)
        point.refresh_from_db()
        self.assertTrue(point.archive)  # admin : autorisé
        autre_point = PointGeographique.objects.create(nom='Point autre2', latitude=2.0, longitude=29.0,
                                                       auteur=autre)
        self.client.force_login(autre)
        r = self.client.post('/point/%d/archiver/' % autre_point.pk)
        autre_point.refresh_from_db()
        self.assertTrue(autre_point.archive)  # auteur : autorisé


class TestsVisitesPoints(BaseCartographieTest):
    def test_ajout_visite_met_a_jour_point(self):
        point = PointGeographique.objects.create(nom='Source B', latitude=1.0, longitude=29.0)
        r = self.client.post('/point/%d/visite/ajouter/' % point.pk, {
            'date_visite': '2026-08-15T10:00:00Z',
            'notes': 'Débit correct', 'statut': 'effectuee',
        })
        self.assertEqual(r.status_code, 302)
        visite = Visite.objects.get(point=point)
        self.assertEqual(visite.notes, 'Débit correct')
        point.refresh_from_db()
        self.assertIsNotNone(point.date_visite)
        self.assertTrue(point.historique.filter(type='visite').exists())


class TestsStatistiquesPoints(BaseCartographieTest):
    def test_api_stats_total_et_repartition(self):
        PointGeographique.objects.create(nom='A1', latitude=1.0, longitude=29.0, statut='actif')
        PointGeographique.objects.create(nom='A2', latitude=1.1, longitude=29.1, statut='actif')
        PointGeographique.objects.create(nom='B1', latitude=1.2, longitude=29.2, statut='termine')
        r = self.client.get('/api/points/stats/?projet=tous')
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.content)
        self.assertTrue(data['ok'])
        self.assertEqual(data['total'], 3)
        par_statut = {s['statut']: s['nb'] for s in data['par_statut']}
        self.assertEqual(par_statut['actif'], 2)
        self.assertEqual(par_statut['termine'], 1)

    def test_api_stats_filtre_projet(self):
        p1 = PointGeographique.objects.create(nom='P1', latitude=1.0, longitude=29.0, projet=self.projet)
        autre = PointGeographique.objects.create(nom='P2', latitude=2.0, longitude=29.0)
        r = self.client.get('/api/points/stats/?projet=%d' % self.projet.pk)
        data = json.loads(r.content)
        self.assertEqual(data['total'], 1)


class TestsStatutsConfigurables(BaseCartographieTest):
    def test_statuts_par_defaut_presents(self):
        r = self.client.get('/api/points/statuts/')
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.content)
        self.assertTrue(data['ok'])
        self.assertTrue(len(data['statuts']) >= 11)
        codes = {s['code'] for s in data['statuts']}
        self.assertIn('actif', codes)
        self.assertIn('nouveau', codes)

    def test_creation_modification_suppression_statut(self):
        r = self.client.post('/api/points/statuts/creer/',
                             json.dumps({'code': 'test_statut', 'nom': 'Test Statut',
                                         'couleur': '#123456', 'ordre': 99}),
                             content_type='application/json')
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.content)
        self.assertTrue(data['ok'])
        sid = data['id']
        statut = StatutPoint.objects.get(pk=sid)
        self.assertEqual(statut.nom, 'Test Statut')
        r = self.client.post('/api/points/statuts/%d/modifier/' % sid,
                             json.dumps({'code': 'test_statut', 'nom': 'Renommé',
                                         'couleur': '#654321', 'ordre': 99}),
                             content_type='application/json')
        self.assertEqual(r.status_code, 200)
        statut.refresh_from_db()
        self.assertEqual(statut.nom, 'Renommé')
        r = self.client.delete('/api/points/statuts/%d/supprimer/' % sid)
        self.assertEqual(r.status_code, 200)
        self.assertFalse(StatutPoint.objects.filter(pk=sid).exists())

    def test_non_admin_ne_peut_pas_configurer(self):
        user = User.objects.create_user('agent', password='x')
        self.client.force_login(user)
        r = self.client.post('/api/points/statuts/creer/',
                             json.dumps({'code': 'x', 'nom': 'X'}), content_type='application/json')
        self.assertEqual(r.status_code, 403)


class TestsStatutMasse(BaseCartographieTest):
    def test_changement_statut_en_masse(self):
        p1 = PointGeographique.objects.create(nom='M1', latitude=1.0, longitude=29.0, statut='nouveau')
        p2 = PointGeographique.objects.create(nom='M2', latitude=1.1, longitude=29.1, statut='nouveau')
        r = self.client.post('/api/points/statut-masse/',
                             json.dumps({'ids': [p1.pk, p2.pk], 'statut': 'verifie'}),
                             content_type='application/json')
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.content)
        self.assertEqual(data['nb'], 2)
        self.assertEqual(PointGeographique.objects.get(pk=p1.pk).statut, 'verifie')
        self.assertEqual(PointGeographique.objects.get(pk=p2.pk).statut, 'verifie')
        self.assertTrue(HistoriquePoint.objects.filter(point=p1, type='statut').exists())

    def test_statut_invalide_refuse(self):
        p1 = PointGeographique.objects.create(nom='M3', latitude=1.0, longitude=29.0)
        r = self.client.post('/api/points/statut-masse/',
                             json.dumps({'ids': [p1.pk], 'statut': 'inexistant'}),
                             content_type='application/json')
        self.assertEqual(r.status_code, 400)


class TestsListePoints(BaseCartographieTest):
    def test_pagination_50_par_page(self):
        for i in range(55):
            PointGeographique.objects.create(nom='Point %02d' % i, latitude=1.0, longitude=29.0)
        r = self.client.get('/points/')
        self.assertEqual(r.status_code, 200)
        contenu = r.content.decode('utf-8', errors='replace')
        self.assertIn('Suivante', contenu)
        self.assertIn('Point 54', contenu)
        page2 = self.client.get('/points/?page=2').content.decode('utf-8', errors='replace')
        self.assertIn('Point 00', page2)

    def test_tri_et_filtre_agent(self):
        a = User.objects.create_user('resp', password='x')
        PointGeographique.objects.create(nom='Du resp', latitude=1.0, longitude=29.0, agent=a)
        PointGeographique.objects.create(nom='Sans resp', latitude=2.0, longitude=29.0)
        r = self.client.get('/points/?agent=%d' % a.pk)
        contenu = r.content.decode('utf-8', errors='replace')
        self.assertIn('Du resp', contenu)
        self.assertNotIn('Sans resp', contenu)

    def test_export_csv_enrichi(self):
        PointGeographique.objects.create(nom='Export CSV', latitude=1.0, longitude=29.0,
                                         territoire='Rutshuru', secteur='Kanyabayonga',
                                         village='Kanyabayonga', adresse='Centre ville',
                                         etat_avancement='50%', code='EXP-0001')
        r = self.client.get('/api/table-points/export/csv/')
        self.assertEqual(r.status_code, 200)
        contenu = r.content.decode('utf-8', errors='replace')
        for champ in ('code', 'identifiant', 'altitude', 'adresse', 'territoire',
                      'secteur', 'village', 'etat_avancement', 'date_visite', 'observations'):
            self.assertIn(champ, contenu.lower())
        self.assertIn('Export CSV', contenu)