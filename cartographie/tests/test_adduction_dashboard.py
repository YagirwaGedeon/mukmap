# -*- coding: utf-8 -*-
"""Tests du tableau de bord du projet d'adduction d'eau."""

import json

from cartographie.models import (
    ProjetAdduction, OuvrageHydraulique, TraceAdduction, ReleveSource,
    ReleveConsommation,
)

from .base import BaseCartographieTest


class DashboardAdduction(BaseCartographieTest):
    """Indicateurs clés et graphiques de la page /adduction/dashboard/."""

    def setUp(self):
        super().setUp()
        self.projet = ProjetAdduction.objects.create(nom='Adduction Bogoro', zone_nom='Irumu')

    def ouvrage(self, type_='source', **kw):
        data = dict(type=type_, nom='Ouvrage', latitude=1.4, longitude=30.2,
                    altitude_m=800, village='Bogoro')
        data.update(kw)
        return OuvrageHydraulique.objects.create(projet=self.projet, **data)

    def get(self, **params):
        return self.client.get('/adduction/dashboard/' + ((('?' + '&'.join(
            f'{k}={v}' for k, v in params.items())) if params else '')), follow=True)

    def test_page_rendue_et_selecteur(self):
        r = self.get()
        self.assertEqual(r.status_code, 200)
        contenu = r.content.decode()
        self.assertIn('Adduction Bogoro', contenu)
        self.assertIn('chart-types', contenu)

    def test_page_sans_aucun_projet(self):
        self.projet.delete()
        r = self.get()
        self.assertEqual(r.status_code, 200)
        self.assertIn('admission_aucun_projet', r.content.decode())

    def test_comptages_types(self):
        self.ouvrage(type='source', nom='SRC')
        self.ouvrage(type='source', nom='SRC2')
        self.ouvrage(type='village', nom='Vill A', village='')
        self.ouvrage(type='borne', nom='BF-1', village='Bogoro')
        self.ouvrage(type='reservoir', nom='RES-1')
        TraceAdduction.objects.create(projet=self.projet, nom='Conduite 1',
                                      coordonnees=[[30.2, 1.4], [30.3, 1.41]],
                                      longueur_m=1200)
        r = self.get(projet=self.projet.pk)
        k = r.context['kpis']
        self.assertEqual(k['sources'], 2)
        self.assertEqual(k['villages'], 1)
        self.assertEqual(k['bornes'], 1)
        self.assertEqual(k['reservoirs'], 1)
        self.assertEqual(k['conduites'], 1)
        self.assertEqual(k['longueur'], 1.2)
        self.assertEqual(k['points'], 5)

    def test_beneficiaires(self):
        self.ouvrage(type='village', nom='Village A', beneficiaires=500, village='')
        self.ouvrage(type='borne', nom='BF', beneficiaires=120, village='Bogoro')
        r = self.get()
        self.assertEqual(r.context['kpis']['beneficiaires'], 620)
        self.assertEqual(r.context['kpis']['villages'], 1)

    def test_distance_moyenne_source_village(self):
        self.ouvrage(type='source', nom='SRC', latitude=1.4, longitude=30.2)
        self.ouvrage(type='village', nom='VIL', latitude=1.41, longitude=30.2, village='')
        r = self.get()
        d = r.context['kpis']['distance_moyenne']
        self.assertIsNotNone(d)
        self.assertGreater(d, 900)
        self.assertLess(d, 1300)

    def test_distance_utilise_mesure_relevee(self):
        s = self.ouvrage(type='source', nom='SRC', latitude=1.4, longitude=30.2)
        self.ouvrage(type='village', nom='VIL', latitude=1.41, longitude=30.21, village='')
        ReleveSource.objects.create(ouvrage=s, debit_mesure=3.5, distance_village_m=1400)
        r = self.get()
        self.assertEqual(r.context['kpis']['distance_moyenne'], 1400)

    def test_photos_comptees(self):
        c = self.ouvrage(type='consommation', nom='BAR', village='Bogoro')
        ReleveConsommation.objects.create(ouvrage=c, photos=['a.jpg', 'b.jpg'])
        self.ouvrage(type='village', nom='VIL', village='')
        r = self.get()
        self.assertEqual(r.context['kpis']['photos'], 2)

    def test_points_a_verifier_qualite(self):
        self.ouvrage(type='source', nom='SRC sans village', village='')
        r = self.get()
        self.assertGreater(r.context['kpis']['verifier'], 0)

    def test_graphiques_json(self):
        self.ouvrage(type='source', nom='SRC')
        r = self.get()
        types = json.loads(r.context['types_chart_json'])
        self.assertEqual(types[0]['nom'], "Source d'eau")
        self.assertEqual(types[0]['valeur'], 1)
        qualite = json.loads(r.context['qualite_chart_json'])
        self.assertEqual(len(qualite), 3)

    def test_parametre_projet(self):
        p2 = ProjetAdduction.objects.create(nom='Second projet')
        r = self.get(projet=p2.pk)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.context['projet'].pk, p2.pk)
        self.assertIn('Second projet', r.content.decode())