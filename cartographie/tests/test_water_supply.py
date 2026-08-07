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


class TestAdductionConsommationRepere(BaseCartographieTest):
    """Types 7 et 8 : POINT DE CONSOMMATION et REPÈRES / POINTS
    INTERMÉDIAIRES — classifications, formulaires spécialisés et
    référentiels."""

    def creer_projet(self):
        r = self.client.post('/api/adduction/projets/',
                             data=json.dumps({'nom': 'Adduction Conso/Repères'}),
                             content_type='application/json')
        return r.json()['projet']['id']

    def test_referentiels_consommation_reperes(self):
        r = self.client.get('/api/adduction/referentiels/')
        self.assertEqual(r.status_code, 200)
        d = r.json()
        self.assertEqual(len(d['consommations']), 8)
        self.assertEqual(len(d['reperes']), 22)
        self.assertEqual(len(d['etats_point']), 4)
        self.assertEqual(len(d['existant_proposes']), 2)

    def test_consommation_complet(self):
        pid = self.creer_projet()
        r = self.client.post('/api/adduction/ouvrages/',
                             data=json.dumps({'projet_id': pid, 'type': 'consommation',
                                              'sous_type': 'borne_fontaine',
                                              'nom': 'BF Marché central', 'latitude': 1.4,
                                              'longitude': 30.3, 'altitude_m': 1200,
                                              'village': 'Bogoro I',
                                              'consommation': {'population_desservie': 850,
                                                               'menages_desservis': 140,
                                                               'nombre_robinets': 4,
                                                               'etat': 'bon',
                                                               'existant_propose': 'existant',
                                                               'debit_estime': 0.8,
                                                               'besoin_estime': 42.5,
                                                               'photos': ['data:image/jpeg;base64,AAAA']}}),
                             content_type='application/json')
        self.assertEqual(r.status_code, 201, r.content)
        o = r.json()['ouvrage']
        self.assertEqual(o['sous_type'], 'borne_fontaine')
        self.assertEqual(o['village'], 'Bogoro I')
        rc = o['releve_consommation']
        self.assertEqual(rc['population_desservie'], 850)
        self.assertEqual(rc['menages_desservis'], 140)
        self.assertEqual(rc['nombre_robinets'], 4)
        self.assertEqual(rc['etat'], 'bon')
        self.assertEqual(rc['existant_propose'], 'existant')
        self.assertEqual(rc['debit_estime'], 0.8)
        self.assertEqual(rc['besoin_estime'], 42.5)
        self.assertEqual(len(rc['photos']), 1)

        # sous-type invalide rejeté
        r = self.client.post('/api/adduction/ouvrages/',
                             data=json.dumps({'projet_id': pid, 'type': 'consommation',
                                              'sous_type': 'volcan', 'nom': 'X',
                                              'latitude': 1, 'longitude': 2}),
                             content_type='application/json')
        self.assertEqual(r.status_code, 400)

        # sous-type ignoré pour un non-consommation
        r = self.client.post('/api/adduction/ouvrages/',
                             data=json.dumps({'projet_id': pid, 'type': 'borne',
                                              'sous_type': 'borne_fontaine', 'nom': 'BF2',
                                              'latitude': 1, 'longitude': 2}),
                             content_type='application/json')
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()['ouvrage']['sous_type'], '')

    def test_consommation_mise_a_jour(self):
        pid = self.creer_projet()
        r = self.client.post('/api/adduction/ouvrages/',
                             data=json.dumps({'projet_id': pid, 'type': 'consommation',
                                              'sous_type': 'kiosque_eau', 'nom': 'Kiosque A',
                                              'latitude': 1.4, 'longitude': 30.3}),
                             content_type='application/json')
        oid = r.json()['ouvrage']['id']
        r = self.client.put(f'/api/adduction/ouvrages/{oid}/',
                            data=json.dumps({'type': 'consommation', 'sous_type': 'robinet_public',
                                             'nom': 'Kiosque A (robinet)', 'latitude': 1.4,
                                             'longitude': 30.3,
                                             'consommation': {'population_desservie': 500,
                                                              'etat': 'moyen',
                                                              'existant_propose': 'propose'}}),
                            content_type='application/json')
        self.assertEqual(r.status_code, 200)
        rc = r.json()['ouvrage']['releve_consommation']
        self.assertEqual(rc['population_desservie'], 500)
        self.assertEqual(rc['etat'], 'moyen')
        self.assertEqual(rc['existant_propose'], 'propose')
        self.assertEqual(r.json()['ouvrage']['sous_type'], 'robinet_public')

    def test_repere_complet(self):
        pid = self.creer_projet()
        r = self.client.post('/api/adduction/ouvrages/',
                             data=json.dumps({'projet_id': pid, 'type': 'repere',
                                              'sous_type': 'pont', 'nom': 'Pont Nzibira',
                                              'latitude': 1.38, 'longitude': 30.26,
                                              'altitude_m': 1150, 'agent_enqueteur': 'K. Uwimana',
                                              'description': 'Pont en bois sur la rivière',
                                              'repere': {'description': 'Pont en bois sur la rivière',
                                                         'photo': 'data:image/jpeg;base64,BBBB',
                                                         'date_releve': '2026-08-07'}}),
                             content_type='application/json')
        self.assertEqual(r.status_code, 201, r.content)
        o = r.json()['ouvrage']
        self.assertEqual(o['sous_type'], 'pont')
        self.assertEqual(o['agent_enqueteur'], 'K. Uwimana')
        self.assertEqual(o['description'], 'Pont en bois sur la rivière')
        rr = o['releve_repere']
        self.assertEqual(rr['description'], 'Pont en bois sur la rivière')
        self.assertEqual(rr['photo'], 'data:image/jpeg;base64,BBBB')
        self.assertEqual(rr['date_releve'], '2026-08-07')

        # sous-type invalide rejeté
        r = self.client.post('/api/adduction/ouvrages/',
                             data=json.dumps({'projet_id': pid, 'type': 'repere',
                                              'sous_type': 'vaisseau', 'nom': 'X',
                                              'latitude': 1, 'longitude': 2}),
                             content_type='application/json')
        self.assertEqual(r.status_code, 400)

    def test_repere_mise_a_jour(self):
        pid = self.creer_projet()
        r = self.client.post('/api/adduction/ouvrages/',
                             data=json.dumps({'projet_id': pid, 'type': 'repere',
                                              'sous_type': 'colline', 'nom': 'Colline Mavono',
                                              'latitude': 1.4, 'longitude': 30.3}),
                             content_type='application/json')
        oid = r.json()['ouvrage']['id']
        r = self.client.put(f'/api/adduction/ouvrages/{oid}/',
                            data=json.dumps({'type': 'repere', 'sous_type': 'sommet',
                                             'nom': 'Sommet Mavono', 'latitude': 1.4,
                                             'longitude': 30.3,
                                             'repere': {'description': 'Vue sur toute la vallée',
                                                        'date_releve': '2026-08-08'}}),
                            content_type='application/json')
        self.assertEqual(r.status_code, 200)
        o = r.json()['ouvrage']
        self.assertEqual(o['sous_type'], 'sommet')
        self.assertEqual(o['releve_repere']['description'], 'Vue sur toute la vallée')
        self.assertEqual(o['releve_repere']['date_releve'], '2026-08-08')


class TestAdductionReseau(BaseCartographieTest):
    """Objets du réseau d'adduction : réservoirs, château d'eau,
    stations de pompage, vannes, ventouses, vidanges, traversées…"""

    def creer_ouvrage(self, type_ouvrage, sous_type):
        pid = self.client.post('/api/adduction/projets/',
                               data=json.dumps({'nom': 'Réseau', 'bbox': [30.2, 1.3, 30.4, 1.5]}),
                               content_type='application/json').json()['projet']['id']
        return self.client.post('/api/adduction/ouvrages/',
                                data=json.dumps({'projet_id': pid, 'type': type_ouvrage,
                                                 'sous_type': sous_type, 'nom': 'Obj',
                                                 'latitude': 1.4, 'longitude': 30.3}),
                                content_type='application/json')

    def test_reseau_station_pompage(self):
        r = self.creer_ouvrage('reseau', 'station_pompage')
        self.assertEqual(r.status_code, 201, r.content)
        o = r.json()['ouvrage']
        self.assertEqual(o['type'], 'reseau')
        self.assertEqual(o['sous_type'], 'station_pompage')
        self.assertEqual(o['sous_type_label'], 'Station de pompage')
        self.assertIn(o['id'], [x.id for x in OuvrageHydraulique.objects.filter(type='reseau')])

    def test_reseau_tous_sous_types(self):
        for ss, label in [('chambre_vanne', 'Chambre de vanne'), ('vanne', 'Vanne'),
                          ('ventouse', 'Ventouse'), ('vidange', 'Vidange'),
                          ('traversee_riviere', 'Traversée de rivière'),
                          ('autre_reseau', 'Autre ouvrage du réseau')]:
            r = self.creer_ouvrage('reseau', ss)
            self.assertEqual(r.status_code, 201, r.content)
            self.assertEqual(r.json()['ouvrage']['sous_type_label'], label)

    def test_reseau_sous_type_invalide(self):
        r = self.creer_ouvrage('reseau', 'vaisseau')
        self.assertEqual(r.status_code, 400)

    def test_reservoir_chateau_eau(self):
        r = self.creer_ouvrage('reservoir', 'chateau_eau')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()['ouvrage']['sous_type_label'], "Château d'eau")
        r2 = self.creer_ouvrage('reservoir', 'reservoir')
        self.assertEqual(r2.status_code, 201)
        self.assertEqual(r2.json()['ouvrage']['sous_type_label'], 'Réservoir')
        r3 = self.creer_ouvrage('reservoir', 'tour_eiffel')
        self.assertEqual(r3.status_code, 400)

    def test_referentiels_reseau(self):
        r = self.client.get('/api/adduction/referentiels/')
        self.assertEqual(r.status_code, 200)
        d = r.json()
        ids_reseaux = [x['id'] for x in d['reseaux']]
        for attendu in ['station_pompage', 'chambre_vanne', 'vanne', 'ventouse',
                        'vidange', 'traversee_riviere', 'autre_reseau']:
            self.assertIn(attendu, ids_reseaux)
        ids_reservoirs = [x['id'] for x in d['reservoirs']]
        for attendu in ['reservoir', 'chateau_eau']:
            self.assertIn(attendu, ids_reservoirs)


class TestAdductionReservoir(BaseCartographieTest):
    """Type RÉSERVOIR / CHÂTEAU D'EAU : formulaire spécialisé
    (capacité, niveau d'eau, état, existant / proposé, photos)."""

    def test_reservoir_complet(self):
        pid = self.client.post('/api/adduction/projets/',
                               data=json.dumps({'nom': 'Réservoirs'}),
                               content_type='application/json').json()['projet']['id']
        r = self.client.post('/api/adduction/ouvrages/',
                             data=json.dumps({'projet_id': pid, 'type': 'reservoir',
                                              'sous_type': 'chateau_eau',
                                              'nom': 'Château d\'eau de Bogoro',
                                              'latitude': 1.42, 'longitude': 30.32,
                                              'altitude_m': 1285, 'village': 'Bogoro I',
                                              'reservoir': {'capacite_m3': 120,
                                                            'niveau_eau_m': 3.5,
                                                            'etat': 'bon',
                                                            'existant_propose': 'existant',
                                                            'photos': ['data:image/jpeg;base64,CCCC']}}),
                             content_type='application/json')
        self.assertEqual(r.status_code, 201, r.content)
        o = r.json()['ouvrage']
        self.assertEqual(o['sous_type'], 'chateau_eau')
        self.assertEqual(o['altitude_m'], 1285)
        rv = o['releve_reservoir']
        self.assertEqual(rv['capacite_m3'], 120)
        self.assertEqual(rv['niveau_eau_m'], 3.5)
        self.assertEqual(rv['etat'], 'bon')
        self.assertEqual(rv['existant_propose'], 'existant')
        self.assertEqual(len(rv['photos']), 1)
        # le formulaire spécialisé n'existe pas pour un autre type
        self.assertIsNone(o['releve_consommation'])
        self.assertIsNone(o['releve_repere'])

    def test_reservoir_sous_type_invalide(self):
        pid = self.client.post('/api/adduction/projets/',
                               data=json.dumps({'nom': 'Réservoirs 2'}),
                               content_type='application/json').json()['projet']['id']
        r = self.client.post('/api/adduction/ouvrages/',
                             data=json.dumps({'projet_id': pid, 'type': 'reservoir',
                                              'sous_type': 'piscine', 'nom': 'X',
                                              'latitude': 1, 'longitude': 2}),
                             content_type='application/json')
        self.assertEqual(r.status_code, 400)

    def test_reservoir_valeurs_invalides_ignorees(self):
        pid = self.client.post('/api/adduction/projets/',
                               data=json.dumps({'nom': 'Réservoirs 3'}),
                               content_type='application/json').json()['projet']['id']
        r = self.client.post('/api/adduction/ouvrages/',
                             data=json.dumps({'projet_id': pid, 'type': 'reservoir',
                                              'sous_type': 'reservoir', 'nom': 'Rés. 1',
                                              'latitude': 1, 'longitude': 2,
                                              'reservoir': {'capacite_m3': 'abc',
                                                            'etat': 'volcan',
                                                            'existant_propose': 'peut-etre',
                                                            'photos': ['bonne',
                                                                       'https://exemple.fr/a.jpg',
                                                                       123]}}),
                             content_type='application/json')
        self.assertEqual(r.status_code, 201, r.content)
        rv = r.json()['ouvrage']['releve_reservoir']
        self.assertIsNone(rv['capacite_m3'])
        self.assertEqual(rv['etat'], '')
        self.assertEqual(rv['existant_propose'], '')
        self.assertEqual(len(rv['photos']), 2)

    def test_reservoir_mise_a_jour(self):
        pid = self.client.post('/api/adduction/projets/',
                               data=json.dumps({'nom': 'Réservoirs 4'}),
                               content_type='application/json').json()['projet']['id']
        r = self.client.post('/api/adduction/ouvrages/',
                             data=json.dumps({'projet_id': pid, 'type': 'reservoir',
                                              'sous_type': 'reservoir', 'nom': 'Rés. A',
                                              'latitude': 1.4, 'longitude': 30.3,
                                              'reservoir': {'capacite_m3': 60,
                                                            'etat': 'moyen'}}),
                             content_type='application/json')
        oid = r.json()['ouvrage']['id']
        r = self.client.put(f'/api/adduction/ouvrages/{oid}/',
                            data=json.dumps({'type': 'reservoir', 'sous_type': 'chateau_eau',
                                             'nom': 'Château A', 'latitude': 1.4,
                                             'longitude': 30.3,
                                             'reservoir': {'capacite_m3': 200,
                                                           'niveau_eau_m': 4.0,
                                                           'etat': 'hors_service',
                                                           'existant_propose': 'propose'}}),
                            content_type='application/json')
        self.assertEqual(r.status_code, 200)
        o = r.json()['ouvrage']
        self.assertEqual(o['sous_type'], 'chateau_eau')
        rv = o['releve_reservoir']
        self.assertEqual(rv['capacite_m3'], 200)
        self.assertEqual(rv['niveau_eau_m'], 4.0)
        self.assertEqual(rv['etat'], 'hors_service')
        self.assertEqual(rv['existant_propose'], 'propose')


class TestAdductionProfilPdf(BaseCartographieTest):
    """Export du PROFIL EN LONG d'une trace au format PDF."""

    def creer_trace(self, coordonnees):
        pid = self.client.post('/api/adduction/projets/',
                               data=json.dumps({'nom': 'Profil PDF', 'zone_nom': 'Irumu',
                                                'bbox': [30.2, 1.3, 30.5, 1.5]}),
                               content_type='application/json').json()['projet']['id']
        r = self.client.post('/api/adduction/traces/',
                             data=json.dumps({'projet_id': pid, 'nom': 'Trace profil',
                                              'coordonnees': coordonnees}),
                             content_type='application/json')
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()['trace']['id']

    def test_profil_pdf_genere(self):
        tid = self.creer_trace([[30.30, 1.40, 1250], [30.31, 1.41, 1230],
                                [30.32, 1.42, 1200], [30.33, 1.43, 1260]])
        r = self.client.get(f'/api/adduction/traces/{tid}/profil.pdf')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r['Content-Type'], 'application/pdf')
        self.assertIn('attachment;', r['Content-Disposition'])
        self.assertTrue(r.content.startswith(b'%PDF'), 'en-tête PDF')
        self.assertGreater(len(r.content), 1000, 'PDF non vide')

    def test_profil_pdf_sans_altitude(self):
        tid = self.creer_trace([[30.30, 1.40], [30.31, 1.41], [30.32, 1.42]])
        r = self.client.get(f'/api/adduction/traces/{tid}/profil.pdf')
        self.assertEqual(r.status_code, 400)

    def test_profil_pdf_trace_absente(self):
        r = self.client.get('/api/adduction/traces/99999/profil.pdf')
        self.assertEqual(r.status_code, 404)
