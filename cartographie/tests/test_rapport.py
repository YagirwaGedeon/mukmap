# -*- coding: utf-8 -*-
"""Tests du module de rapport professionnel (assistant 6 étapes, filtres, téléchargements)."""

from datetime import timedelta

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone

from cartographie.models import (
    Activite, Itineraire, PointGeographique, Projet, SessionTravail, ZoneSecurite,
)


class RapportTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_superuser('adminrapp', 'admin@mukmap.local', 'mdp123')
        cls.agent = User.objects.create_user('agentrapp', 'agent@mukmap.local', 'mdp123')
        cls.projet = Projet.objects.create(nom='Projet A')
        cls.projet2 = Projet.objects.create(nom='Projet B')

    def setUp(self):
        self.client.force_login(self.admin)
        s = self.client.session
        s['projet_actif_id'] = self.projet.pk
        s.save()

    def _activite(self, projet, agent=None, jours=0):
        a = Activite.objects.create(
            projet=projet, agent=agent, nom_activite='Activité X',
            rapport='Rapport de l\'activité', observations='Obs A', objectif='Objectif A',
            resultats='Résultats A', difficultes='Difficultés A', recommandations='Recommandations A',
            nombre_beneficiaires=50, hommes=20, femmes=20, enfants=10, menages=15,
            latitude=-1.68, longitude=29.23)
        if jours:
            Activite.objects.filter(pk=a.pk).update(date_creation=timezone.now() - timedelta(days=jours))
        return a

    def test_page_rapport_par_defaut(self):
        r = self.client.get('/rapport/')
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, 'data-i18n="assistant_rapport"')

    def test_filtre_projet_et_periode(self):
        a1 = self._activite(self.projet, self.agent, jours=2)
        self._activite(self.projet2, self.agent, jours=2)
        r = self.client.get('/rapport/', {'projet': self.projet.pk})
        self.assertEqual(r.context['total'], 1)
        self.assertEqual(r.context['activites'][0].pk, a1.pk)

    def test_filtre_activites_selectionnees(self):
        a1 = self._activite(self.projet, self.agent, jours=1)
        a2 = self._activite(self.projet, self.agent, jours=1)
        r = self.client.get('/rapport/', {'activites': [a1.pk, a2.pk]})
        self.assertEqual(r.context['total'], 2)
        r = self.client.get('/rapport/', {'activites': [a1.pk]})
        self.assertEqual(r.context['total'], 1)

    def test_filtre_agent_admin(self):
        self._activite(self.projet, self.agent, jours=1)
        self._activite(self.projet, self.admin, jours=1)
        r = self.client.get('/rapport/', {'agent': self.agent.pk})
        self.assertEqual(r.context['total'], 1)

    def test_agent_non_admin_limite_a_ses_activites(self):
        self.client.logout()
        self.client.force_login(self.agent)
        self._activite(self.projet, self.agent, jours=1)
        self._activite(self.projet, self.admin, jours=1)
        r = self.client.get('/rapport/')
        self.assertEqual(r.context['total'], 1)
        self.assertEqual(r.context['projets'].count(), 1)

    def test_filtre_zone(self):
        a1 = self._activite(self.projet, self.agent, jours=1)
        a1.zone_visitee = 'Sake'
        a1.save()
        self._activite(self.projet, self.agent, jours=1)
        r = self.client.get('/rapport/', {'zone': 'Sake'})
        self.assertEqual(r.context['total'], 1)

    def test_periode_personnalisee(self):
        self._activite(self.projet, self.agent, jours=100)
        debut = (timezone.localdate() - timedelta(days=10)).isoformat()
        fin = timezone.localdate().isoformat()
        r = self.client.get('/rapport/', {'type': 'personnalise', 'date_debut': debut, 'date_fin': fin})
        self.assertEqual(r.context['total'], 0)
        r = self.client.get('/rapport/', {'type': 'personnalise', 'date_debut': '2020-01-01', 'date_fin': fin})
        self.assertEqual(r.context['total'], 1)

    def test_sections_personnalisees(self):
        self._activite(self.projet, self.agent, jours=1)
        r = self.client.get('/rapport/', {'sections': ['stats', 'activites']})
        self.assertEqual(set(r.context['sections']), {'stats', 'activites'})

    def test_kpis_agregations(self):
        self._activite(self.projet, self.agent, jours=1)
        self._activite(self.projet2, self.agent, jours=1)
        r = self.client.get('/rapport/')
        self.assertEqual(r.context['bene_total'], 100)
        self.assertEqual(r.context['tot_h'], 40)
        self.assertEqual(r.context['tot_f'], 40)
        self.assertEqual(r.context['tot_e'], 20)
        self.assertEqual(r.context['tot_m'], 30)
        self.assertEqual(len(r.context['par_projet']), 2)

    def test_points_itineraire_zones_sessions_collectes(self):
        a = self._activite(self.projet, self.agent, jours=1)
        PointGeographique.objects.create(nom='Point 1', latitude=-1.68, longitude=29.23,
                                         projet=self.projet, activite=a, auteur=self.agent)
        Itineraire.objects.create(nom='Itinéraire 1', coordonnees=[[-1.68, 29.23], [-1.69, 29.24]],
                                  projet=self.projet, utilisateur=self.agent)
        ZoneSecurite.objects.create(nom='Zone Rouge', statut='dangereuse', coordonnees={},
                                    projet=self.projet, auteur=self.agent)
        SessionTravail.objects.create(utilisateur=self.agent, projet=self.projet,
                                      activite_nom='Activité X', debut=timezone.now())
        r = self.client.get('/rapport/')
        self.assertEqual(r.context['total_points'], 1)
        self.assertEqual(r.context['total_itineraires'], 1)
        self.assertEqual(r.context['zones_dangereuses'], 1)
        self.assertEqual(r.context['total_sessions'], 1)

    def test_mode_global_admin(self):
        self._activite(self.projet, self.agent, jours=1)
        r = self.client.get('/rapport/', {'global': '1'})
        self.assertTrue(r.context['mode_global'])
        self.assertContains(r, 'data-i18n="rapport_global"')

    def test_telechargement_pdf(self):
        self._activite(self.projet, self.agent, jours=1)
        r = self.client.get('/rapport/telecharger/pdf/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r['Content-Type'], 'application/pdf')
        self.assertTrue(r.content.startswith(b'%PDF'))

    def test_telechargement_docx(self):
        self._activite(self.projet, self.agent, jours=1)
        r = self.client.get('/rapport/telecharger/docx/')
        self.assertEqual(r.status_code, 200)
        self.assertIn('wordprocessingml', r['Content-Type'])

    def test_telechargement_xlsx(self):
        self._activite(self.projet, self.agent, jours=1)
        r = self.client.get('/rapport/telecharger/xlsx/')
        self.assertEqual(r.status_code, 200)
        self.assertIn('spreadsheetml', r['Content-Type'])

    def test_telechargement_format_inconnu(self):
        r = self.client.get('/rapport/telecharger/csv/')
        self.assertEqual(r.status_code, 302)

    def test_agent_restreint_telechargement(self):
        self.client.logout()
        self.client.force_login(self.agent)
        self._activite(self.projet, self.agent, jours=1)
        r = self.client.get('/rapport/telecharger/pdf/')
        self.assertEqual(r.status_code, 200)

    def test_creation_activite_champs_etendus(self):
        r = self.client.post('/activite/ajouter/', {
            'projet': self.projet.pk, 'agent': self.agent.pk, 'rapport': 'Rapport test',
            'objectif': 'Objectif test', 'resultats': 'Résultats test',
            'difficultes': 'Difficultés test', 'recommandations': 'Recommandations test',
            'observations': 'Obs test', 'nombre_beneficiaires': '40',
            'hommes': '10', 'femmes': '20', 'enfants': '5', 'menages': '8',
            'latitude': '-1.68', 'longitude': '29.23'})
        self.assertEqual(r.status_code, 302)
        a = Activite.objects.get(rapport='Rapport test')
        self.assertEqual(a.objectif, 'Objectif test')
        self.assertEqual(a.hommes, 10)
        self.assertEqual(a.femmes, 20)
        self.assertEqual(a.enfants, 5)
        self.assertEqual(a.menages, 8)

    def test_projet_code_auto(self):
        self.assertEqual(self.projet.code, f'P-{self.projet.pk:04d}')
        p = Projet.objects.create(nom='Projet C', code='SIG-07')
        self.assertEqual(p.code, 'SIG-07')
