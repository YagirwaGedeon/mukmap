# -*- coding: utf-8 -*-
"""Section « Guide d'utilisation » de l'espace Super Admin (MUKESHABA)."""

from django.contrib.auth.models import User

from .base import BaseCartographieTest


class TestsGuideUtilisation(BaseCartographieTest):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.principal = User.objects.get(username='YAGIRWA')
        cls.agent = User.objects.create_user('agent1', 'agent1@mukmap.local', 'testpass')

    def test_page_guide_accessible_admin(self):
        r = self.client.get('/guide-utilisation/')
        self.assertEqual(r.status_code, 200)
        contenu = r.content.decode('utf-8', errors='replace')
        self.assertIn("Guide d'utilisation", contenu)
        self.assertIn('MUKESHABA', contenu)
        self.assertIn('Chapitres & annexes', contenu)
        self.assertIn("Réservé à l'administrateur principal", contenu,
                      "le bouton régénérer n'est pas montré à un admin non principal")

    def test_page_guide_redirige_anonyme(self):
        self.client.logout()
        r = self.client.get('/guide-utilisation/')
        self.assertIn(r.status_code, (301, 302))

    def test_page_guide_redirige_agent(self):
        self.client.force_login(self.agent)
        r = self.client.get('/guide-utilisation/')
        self.assertIn(r.status_code, (301, 302))

    def test_page_guide_bouton_regenerer_principal(self):
        self.client.force_login(self.principal)
        contenu = self.client.get('/guide-utilisation/').content.decode(
            'utf-8', errors='replace')
        self.assertIn('Régénérer le guide', contenu,
                      "l'administrateur principal voit le bouton de régénération")

    def test_page_guide_liste_chapitres(self):
        contenu = self.client.get('/guide-utilisation/').content.decode(
            'utf-8', errors='replace')
        for extrait in ('Introduction à MUKMAP', 'Topographie et SIG avancé',
                        '9. Infrastructures', 'Mode hors ligne', 'Glossaire'):
            self.assertIn(extrait, contenu)

    def test_regeneration_refusee_non_principal(self):
        r = self.client.post('/guide-utilisation/', {})
        self.assertIn(r.status_code, (301, 302))
        self.assertIn("administrateur principal peut régénérer", self.client.get(
            '/guide-utilisation/', follow=True).content.decode('utf-8', errors='replace'))

    def test_regeneration_principale(self):
        from unittest import mock
        self.client.force_login(self.principal)
        with mock.patch('django.core.management.call_command') as cmd:
            r = self.client.post('/guide-utilisation/', {}, follow=True)
        self.assertEqual(r.status_code, 200)
        cmd.assert_called_once_with('generer_guide')
        self.assertIn('régénéré avec succès', r.content.decode('utf-8', errors='replace'))