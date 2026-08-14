# -*- coding: utf-8 -*-
"""Tests de l'API d'audit (historique d'un point / ouvrage)."""

from cartographie.models import JournalAudit

from .base import BaseCartographieTest


class TestHistoriqueObjet(BaseCartographieTest):
    def setUp(self):
        super().setUp()
        JournalAudit.objects.create(
            utilisateur=self.admin, action='Création de point',
            details='Point #12 - Kalima (Projet Test)')
        JournalAudit.objects.create(
            utilisateur=self.admin, action='Modification de point',
            details='Point #12 - Kalima')
        JournalAudit.objects.create(
            utilisateur=self.admin, action='Suppression de média',
            details='Média #7 du point #12')
        JournalAudit.objects.create(
            utilisateur=self.admin, action='Création de point',
            details='Point #99 - Autre')
        JournalAudit.objects.create(
            utilisateur=self.admin, action='Création de point',
            details='Point #120 - Attention au préfixe')

    def test_historique_point(self):
        r = self.client.get('/api/audit/objet/', {'type': 'point', 'pk': 12})
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(len(data['historique']), 3)
        actions = {e['action'] for e in data['historique']}
        self.assertEqual(actions, {'Création de point', 'Modification de point',
                                   'Suppression de média'})

    def test_historique_point_hors_convention(self):
        r = self.client.get('/api/audit/objet/', {'type': 'point', 'pk': 99})
        self.assertEqual(len(r.json()['historique']), 1)
        r = self.client.get('/api/audit/objet/', {'type': 'point', 'pk': 120})
        self.assertEqual(len(r.json()['historique']), 1)
        self.assertEqual(r.json()['historique'][0]['details'], 'Point #120 - Attention au préfixe')

    def test_historique_ouvrage(self):
        JournalAudit.objects.create(
            utilisateur=self.admin, action="Relevé d'ouvrage hydraulique",
            details='Ouvrage #5 - Source Kalima (source)')
        JournalAudit.objects.create(
            utilisateur=self.admin, action='Modification d\'ouvrage hydraulique',
            details='Ouvrage #5 - Source Kalima')
        r = self.client.get('/api/audit/objet/', {'type': 'ouvrage', 'pk': 5})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.json()['historique']), 2)
        r = self.client.get('/api/audit/objet/', {'type': 'point', 'pk': 5})
        self.assertEqual(len(r.json()['historique']), 0)

    def test_validation(self):
        self.assertEqual(self.client.get('/api/audit/objet/', {'pk': 'abc'}).status_code, 400)
        self.assertEqual(self.client.get('/api/audit/objet/').status_code, 400)
        self.assertEqual(self.client.get('/api/audit/objet/', {'type': 'zone', 'pk': '1'}).status_code, 400)

    def test_authentification_requise(self):
        self.client.logout()
        self.assertEqual(self.client.get('/api/audit/objet/', {'type': 'point', 'pk': 12}).status_code, 302)
