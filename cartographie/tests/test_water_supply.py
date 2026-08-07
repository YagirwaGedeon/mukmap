# -*- coding: utf-8 -*-
"""Tests du module « Adduction d'eau — Water Supply Survey » (API)."""

import json

from cartographie.models import ProjetAdduction, OuvrageHydraulique, TraceAdduction

from .base import BaseCartographieTest


class TestAdductionAPI(BaseCartographieTest):
    """CRUD projets / ouvrages / tracés + stats, rapport et exports."""

    def creer_projet(self, nom='Adduction Bogoro'):
        r = self.client.post('/api/adduction/projets/',
                             data=json.dumps({'nom': nom, 'zone_nom': 'Irumu',
                                              'commanditaire': 'UNICEF',
                                              'bbox': [30.2, 1.3, 30.4, 1.5]}),
                             content_type='application/json')
        return r

    def test_projet_creation_et_liste(self):
        r = self.creer_projet()
        self.assertEqual(r.status_code, 201)
        pid = r.json()['projet']['id']
        r2 = self.client.get('/api/adduction/projets/')
        self.assertEqual(r2.status_code, 200)
        ids = [p['id'] for p in r2.json()['projets']]
        self.assertIn(pid, ids)
        self.assertEqual(ProjetAdduction.objects.count(), 1)

    def test_projet_nom_obligatoire(self):
        r = self.client.post('/api/adduction/projets/',
                             data=json.dumps({'nom': '  '}), content_type='application/json')
        self.assertEqual(r.status_code, 400)

    def test_projet_maj_et_suppression(self):
        r = self.creer_projet()
        pid = r.json()['projet']['id']
        r = self.client.put(f'/api/adduction/projets/{pid}/',
                            data=json.dumps({'nom': 'Adduction Bogoro II', 'zone_nom': 'Irumu',
                                             'commanditaire': 'UNICEF'}), content_type='application/json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['projet']['nom'], 'Adduction Bogoro II')
        r = self.client.delete(f'/api/adduction/projets/{pid}/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(ProjetAdduction.objects.count(), 0)

    def test_ouvrage_crud(self):
        pid = self.creer_projet().json()['projet']['id']
        r = self.client.post('/api/adduction/ouvrages/',
                             data=json.dumps({'projet_id': pid, 'type': 'source',
                                              'nom': 'Source Kabale', 'latitude': 1.4,
                                              'longitude': 30.3, 'altitude_m': 1250,
                                              'beneficiaires': 120,
                                              'caracteristiques': {'debit_l_s': 0.5},
                                              'observations': 'Captage bien protégé'}),
                             content_type='application/json')
        self.assertEqual(r.status_code, 201, r.content)
        oid = r.json()['ouvrage']['id']
        self.assertEqual(OuvrageHydraulique.objects.count(), 1)

        # GET par projet
        r = self.client.get(f'/api/adduction/ouvrages/?projet={pid}')
        self.assertEqual(len(r.json()['ouvrages']), 1)
        self.assertEqual(r.json()['ouvrages'][0]['type_label'], "Source d'eau")

        # PUT
        r = self.client.put(f'/api/adduction/ouvrages/{oid}/',
                            data=json.dumps({'type': 'borne', 'nom': 'BF 1',
                                             'latitude': 1.41, 'longitude': 30.31,
                                             'altitude_m': 1180}),
                            content_type='application/json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['ouvrage']['type'], 'borne')

        # DELETE
        r = self.client.delete(f'/api/adduction/ouvrages/{oid}/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(OuvrageHydraulique.objects.count(), 0)

    def test_ouvrage_sans_nom_rejete(self):
        pid = self.creer_projet().json()['projet']['id']
        r = self.client.post('/api/adduction/ouvrages/',
                             data=json.dumps({'projet_id': pid, 'type': 'source',
                                              'nom': '', 'latitude': 1, 'longitude': 2}),
                             content_type='application/json')
        self.assertEqual(r.status_code, 400)

    def test_trace_calcul_longueur_denivele(self):
        pid = self.creer_projet().json()['projet']['id']
        r = self.client.post('/api/adduction/traces/',
                             data=json.dumps({'projet_id': pid, 'nom': 'Conduite principale',
                                              'coordonnees': [[30.30, 1.40, 1250],
                                                              [30.31, 1.41, 1230],
                                                              [30.32, 1.42, 1200]]}),
                             content_type='application/json')
        self.assertEqual(r.status_code, 201, r.content)
        t = r.json()['trace']
        # ~3,5 km entre les 3 points (3 segments d'~1,1 km)
        self.assertGreater(t['longueur_m'], 3000)
        self.assertLess(t['longueur_m'], 4000)
        # montées : 1250→1230 (0) puis 1230→1200 (0) : dénivelé positif 0
        self.assertEqual(t['denivelee_m'], 0)

        # avec une montée :
        r2 = self.client.post('/api/adduction/traces/',
                              data=json.dumps({'projet_id': pid, 'nom': 'Montée',
                                               'coordonnees': [[30.30, 1.40, 1000],
                                                               [30.31, 1.41, 1100]]}),
                              content_type='application/json')
        self.assertEqual(r2.status_code, 201)
        self.assertEqual(r2.json()['trace']['denivelee_m'], 100)

    def test_trace_points_insuffisants(self):
        pid = self.creer_projet().json()['projet']['id']
        r = self.client.post('/api/adduction/traces/',
                             data=json.dumps({'projet_id': pid, 'nom': 'X',
                                              'coordonnees': [[30.3, 1.4, 1000]]}),
                             content_type='application/json')
        self.assertEqual(r.status_code, 400)

    def test_stats_projet(self):
        pid = self.creer_projet().json()['projet']['id']
        for d in [
            {'type': 'source', 'nom': 'S1', 'latitude': 1.4, 'longitude': 30.3,
             'altitude_m': 1250, 'beneficiaires': 100},
            {'type': 'borne', 'nom': 'B1', 'latitude': 1.41, 'longitude': 30.31,
             'altitude_m': 1180, 'beneficiaires': 250},
            {'type': 'borne', 'nom': 'B2', 'latitude': 1.42, 'longitude': 30.32,
             'altitude_m': 1200, 'beneficiaires': 150},
        ]:
            d['projet_id'] = pid
            self.client.post('/api/adduction/ouvrages/', data=json.dumps(d),
                             content_type='application/json')
        self.client.post('/api/adduction/traces/',
                         data=json.dumps({'projet_id': pid, 'nom': 'T',
                                          'coordonnees': [[30.3, 1.4, 1250], [30.31, 1.41, 1180]]}),
                         content_type='application/json')
        r = self.client.get(f'/api/adduction/projets/{pid}/stats/')
        self.assertEqual(r.status_code, 200)
        s = r.json()['stats']
        self.assertEqual(s['nb_ouvrages'], 3)
        self.assertEqual(s['beneficiaires_total'], 500)
        self.assertEqual(s['par_type']['source'], 1)
        self.assertEqual(s['par_type']['borne'], 2)
        self.assertEqual(s['altitude_min'], 1180)
        self.assertEqual(s['altitude_max'], 1250)
        self.assertGreater(s['distance_max_km'], 0)
        self.assertGreater(s['longueur_conduites_m'], 1000)

    def test_rapport_projet(self):
        pid = self.creer_projet().json()['projet']['id']
        self.client.post('/api/adduction/ouvrages/',
                         data=json.dumps({'projet_id': pid, 'type': 'source',
                                          'nom': 'Source A', 'latitude': 1.4,
                                          'longitude': 30.3, 'altitude_m': 1200}),
                         content_type='application/json')
        r = self.client.get(f'/api/adduction/projets/{pid}/rapport/')
        self.assertEqual(r.status_code, 200)
        txt = r.json()['rapport']
        self.assertIn('RAPPORT DE TERRAIN', txt)
        self.assertIn('Adduction Bogoro', txt)
        self.assertIn('Source A', txt)

    def test_exports(self):
        pid = self.creer_projet().json()['projet']['id']
        self.client.post('/api/adduction/ouvrages/',
                         data=json.dumps({'projet_id': pid, 'type': 'borne',
                                          'nom': 'BF A', 'latitude': 1.4,
                                          'longitude': 30.3, 'altitude_m': 1100}),
                         content_type='application/json')
        self.client.post('/api/adduction/traces/',
                         data=json.dumps({'projet_id': pid, 'nom': 'T1',
                                          'coordonnees': [[30.3, 1.4, 1100], [30.31, 1.41, 1080]]}),
                         content_type='application/json')
        # GeoJSON
        r = self.client.get(f'/api/adduction/projets/{pid}/export/geojson/')
        self.assertEqual(r.status_code, 200)
        data = json.loads(r.content)
        self.assertEqual(data['type'], 'FeatureCollection')
        self.assertEqual(len(data['features']), 2)
        # CSV
        r = self.client.get(f'/api/adduction/projets/{pid}/export/csv/')
        self.assertEqual(r.status_code, 200)
        self.assertIn('BF A', r.content.decode('utf-8'))
        # GPX
        r = self.client.get(f'/api/adduction/projets/{pid}/export/gpx/')
        self.assertEqual(r.status_code, 200)
        self.assertIn(b'<wpt', r.content)
        self.assertIn(b'<trk', r.content)

    def test_acces_anonyme_refuse(self):
        self.client.logout()
        r = self.client.get('/api/adduction/projets/')
        self.assertEqual(r.status_code, 302)


class TestAdductionClassification(BaseCartographieTest):
    """Classification des points : sous-types source, formulaire source,
    village (représentation point / polygone / zone) et référentiels."""

    def creer_projet(self):
        r = self.client.post('/api/adduction/projets/',
                             data=json.dumps({'nom': 'Adduction Classification'}),
                             content_type='application/json')
        return r.json()['projet']['id']

    def test_referentiels_retourne_classification(self):
        r = self.client.get('/api/adduction/referentiels/')
        self.assertEqual(r.status_code, 200)
        d = r.json()
        self.assertEqual(len(d['sources']), 11)
        ids = [s['id'] for s in d['sources']]
        for attendu in ('naturelle', 'amenagee', 'forage', 'puits', 'riviere',
                        'lac', 'etang', 'captage_source', 'gravitaire', 'resurgence', 'autre'):
            self.assertIn(attendu, ids)
        self.assertEqual(len(d['representations']), 3)
        self.assertTrue(d['potabilite_avertissement'])

    def test_source_sous_type_et_formulaire(self):
        pid = self.creer_projet()
        r = self.client.post('/api/adduction/ouvrages/',
                             data=json.dumps({'projet_id': pid, 'type': 'source',
                                              'sous_type': 'forage', 'nom': 'Forage K4',
                                              'latitude': 1.4, 'longitude': 30.3,
                                              'provenance': 'Ituri', 'territoire': 'Irumu',
                                              'secteur_chefferie': 'Bahema', 'localite': 'Bogoro',
                                              'village': 'Bogoro I', 'agent_enqueteur': 'J. Maka',
                                              'organisation': 'UNICEF', 'code_projet': 'FID-01',
                                              'source': {'debit_mesure': 1.5, 'debit_unite': 'l_s',
                                                         'profondeur_m': 18, 'ph': 6.8,
                                                         'code_echantillon': 'ECH-001'}}),
                             content_type='application/json')
        self.assertEqual(r.status_code, 201, r.content)
        o = r.json()['ouvrage']
        self.assertEqual(o['sous_type'], 'forage')
        self.assertEqual(o['provenance'], 'Ituri')
        self.assertEqual(o['village'], 'Bogoro I')
        self.assertEqual(o['releve_source']['debit_mesure'], 1.5)
        self.assertEqual(o['releve_source']['profondeur_m'], 18.0)
        self.assertEqual(o['releve_source']['ph'], 6.8)

        # sous-type invalide rejeté
        r = self.client.post('/api/adduction/ouvrages/',
                             data=json.dumps({'projet_id': pid, 'type': 'source',
                                              'sous_type': 'volcan', 'nom': 'X',
                                              'latitude': 1, 'longitude': 2}),
                             content_type='application/json')
        self.assertEqual(r.status_code, 400)

        # sous-type ignoré pour un non-source
        r = self.client.post('/api/adduction/ouvrages/',
                             data=json.dumps({'projet_id': pid, 'type': 'borne',
                                              'sous_type': 'forage', 'nom': 'BF1',
                                              'latitude': 1, 'longitude': 2}),
                             content_type='application/json')
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()['ouvrage']['sous_type'], '')

    def test_village_polygone_et_formulaire(self):
        pid = self.creer_projet()
        r = self.client.post('/api/adduction/ouvrages/',
                             data=json.dumps({'projet_id': pid, 'type': 'village',
                                              'nom': 'Bogoro Centre', 'latitude': 1.41,
                                              'longitude': 30.30, 'altitude_m': 1190,
                                              'representation': 'polygone',
                                              'geometrie': [[30.30, 1.41], [30.31, 1.41],
                                                            [30.31, 1.42], [30.30, 1.42]],
                                              'village': {'population': 4500, 'menages': 800,
                                                          'population_cible': 3500,
                                                          'beneficiaires_estimes': 3100,
                                                          'ecoles': 3, 'centres_sante': 2,
                                                          'autres_institutions': 'Marché, église',
                                                          'source_eau_actuelle': 'puits',
                                                          'distance_source_m': 1200,
                                                          'situation_acces': 'partielle'}}),
                             content_type='application/json')
        self.assertEqual(r.status_code, 201, r.content)
        o = r.json()['ouvrage']
        self.assertEqual(o['representation'], 'polygone')
        self.assertEqual(len(o['geometrie']), 4)
        self.assertEqual(o['releve_village']['population'], 4500)
        self.assertEqual(o['releve_village']['menages'], 800)
        self.assertEqual(o['releve_village']['distance_source_m'], 1200.0)
        self.assertEqual(o['releve_village']['source_eau_actuelle'], 'puits')
        self.assertEqual(o['releve_village']['situation_acces'], 'partielle')
        self.assertEqual(o['releve_village']['ecoles'], 3)

        # mise à jour : géométrie + démographie
        oid = o['id']
        r = self.client.put(f'/api/adduction/ouvrages/{oid}/',
                            data=json.dumps({'type': 'village', 'nom': 'Bogoro Centre II',
                                             'latitude': 1.41, 'longitude': 30.30,
                                             'representation': 'point',
                                             'village': {'population': 4800, 'situation_acces': 'adequate'}}),
                            content_type='application/json')
        self.assertEqual(r.status_code, 200)
        o2 = r.json()['ouvrage']
        self.assertEqual(o2['representation'], 'point')
        self.assertEqual(o2['releve_village']['population'], 4800)
        self.assertEqual(o2['releve_village']['situation_acces'], 'adequate')

        # geometrie rejetée si non-liste de listes
        r = self.client.put(f'/api/adduction/ouvrages/{oid}/',
                            data=json.dumps({'type': 'village', 'nom': 'V3',
                                             'latitude': 1.41, 'longitude': 30.30,
                                             'geometrie': 'abc'}),
                            content_type='application/json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['ouvrage']['geometrie'], [])

    def test_village_zone_sans_village_payload(self):
        pid = self.creer_projet()
        r = self.client.post('/api/adduction/ouvrages/',
                             data=json.dumps({'projet_id': pid, 'type': 'village',
                                              'nom': 'Zone Kpandroma', 'latitude': 1.4,
                                              'longitude': 30.3, 'representation': 'zone'}),
                             content_type='application/json')
        self.assertEqual(r.status_code, 201)
        o = r.json()['ouvrage']
        self.assertEqual(o['representation'], 'zone')
        self.assertEqual(o['releve_village']['population'], 0)
