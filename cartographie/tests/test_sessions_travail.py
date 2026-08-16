# -*- coding: utf-8 -*-
"""Tests du suivi des sessions de travail (debut = connexion, fin = deconnexion)."""

from datetime import timedelta

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone

from cartographie.models import Projet, SessionTravail


class SessionsTravailTest(TestCase):
    def test_connexion_cree_session_ouverte(self):
        User.objects.create_user('agent1', 'agent1@mukmap.local', 'mdp123')
        r = self.client.post('/connexion/', {
            'username': 'agent1', 'password': 'mdp123', 'remember': 'on'})
        self.assertEqual(r.status_code, 302)
        session = SessionTravail.objects.filter(utilisateur__username='agent1').first()
        self.assertIsNotNone(session)
        self.assertIsNotNone(session.debut)
        self.assertIsNone(session.fin)

    def test_deconnexion_ferme_session_sans_observations(self):
        user = User.objects.create_user('agent2', 'agent2@mukmap.local', 'mdp123')
        self.client.login(username='agent2', password='mdp123')
        self.client.post('/connexion/', {
            'username': 'agent2', 'password': 'mdp123', 'remember': ''})
        session = SessionTravail.objects.get(utilisateur=user)
        r = self.client.post('/deconnexion/', {'observations': ''})
        self.assertEqual(r.status_code, 302)
        session.refresh_from_db()
        self.assertIsNotNone(session.fin)
        self.assertEqual(session.observations, '')

    def test_deconnexion_post_avec_observations(self):
        user = User.objects.create_user('agent3', 'agent3@mukmap.local', 'mdp123')
        self.client.post('/connexion/', {
            'username': 'agent3', 'password': 'mdp123', 'remember': ''})
        session = SessionTravail.objects.get(utilisateur=user)
        r = self.client.post('/deconnexion/', {
            'observations': 'Mission terminée avec succès'})
        self.assertEqual(r.status_code, 302)
        session.refresh_from_db()
        self.assertIsNotNone(session.fin)
        self.assertEqual(session.observations, 'Mission terminée avec succès')

    def test_deconnexion_post_observations_vides_reste_vide(self):
        user = User.objects.create_user('agent4', 'agent4@mukmap.local', 'mdp123')
        self.client.post('/connexion/', {
            'username': 'agent4', 'password': 'mdp123', 'remember': ''})
        session = SessionTravail.objects.get(utilisateur=user)
        self.client.post('/deconnexion/', {'observations': '   '})
        session.refresh_from_db()
        self.assertIsNotNone(session.fin)
        self.assertEqual(session.observations, '')

    def test_selection_projet_attache_projet_et_activite(self):
        user = User.objects.create_user('agent5', 'agent5@mukmap.local', 'mdp123')
        self.client.post('/connexion/', {
            'username': 'agent5', 'password': 'mdp123', 'remember': ''})
        projet = Projet.objects.create(nom='Projet Session')
        session = SessionTravail.objects.get(utilisateur=user)
        self.client.post('/selection/projet/', {
            'projet_id': projet.pk, 'nom_activite': 'Recensement des bornes'})
        session.refresh_from_db()
        self.assertEqual(session.projet, projet)
        self.assertEqual(session.activite_nom, 'Recensement des bornes')

    def test_duree_calculee(self):
        user = User.objects.create_user('agent6', 'agent6@mukmap.local', 'mdp123')
        session = SessionTravail.objects.create(
            utilisateur=user, debut=timezone.now() - timedelta(minutes=90))
        self.assertIsNone(session.duree())
        session.fin = timezone.now()
        session.save()
        session.refresh_from_db()
        self.assertAlmostEqual(session.duree(), 90, delta=5)
