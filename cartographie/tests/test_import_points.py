# -*- coding: utf-8 -*-
"""Import des points géographiques : /importer/ (GeoJSON/KML) et /import/excel-intelligent/
(stockage des colonnes, source du fichier, mise à jour des doublons)."""

import csv
import io
import json
import re

from django.core.files.uploadedfile import SimpleUploadedFile

from cartographie.models import PointGeographique

from .base import BaseCartographieTest

ENTETES = ['No', 'Province', 'Territoire', 'Activite', 'Type', 'Village/Site',
           'Lat', 'Long', 'Altitude', 'Statut des etudes', 'Cycle', 'Observation',
           "Priorite d'execution", 'Niveau de securite', 'Infrastructure',
           "Zone choisit dans l'atelier de selection"]

LIGNE_1 = ['1', 'Ituri', 'Irumu', 'Adduction Eau Potable Bogoro_Kasenyi', 'Adduction',
           'Bogoro', '1.409772222', '30.2800833', '1586', 'Etude Faite', 'Primaire',
           'RAS', 'Priorite 1', 'Moyen', 'Chateau', 'Sud']
LIGNE_2 = ['2', 'Ituri', 'Irumu', 'Adduction Eau Potable Cihanda', 'Adduction',
           'Cihanda', '1.234567', '28.8683278', '1520', 'Etude Faite', 'Primaire',
           '', 'Priorite 2', 'Faible', 'Puits', 'Nord']


class TestsImportPoints(BaseCartographieTest):
    """Stockage des colonnes et de la source lors des imports de points."""

    def test_import_excel_intelligent_stocke_colonnes_et_source(self):
        entetes, lignes = ENTETES, [list(LIGNE_1), list(LIGNE_2)]
        mapping = {'latitude': entetes.index('Lat'), 'longitude': entetes.index('Long'),
                   'nom': entetes.index('Village/Site')}
        rep = self.client.post('/import/excel-intelligent/', data=json.dumps({
            'mapping': mapping, 'lignes': lignes, 'entetes': entetes,
            'nom_fichier': 'sites_test.csv', 'format': 'CSV',
        }), content_type='application/json')
        data = rep.json()
        self.assertTrue(data['ok'])
        self.assertEqual(data['importes'], 2)
        p = PointGeographique.objects.get(nom='Bogoro')
        self.assertEqual(len(p.donnees), 16, '16 colonnes stockées')
        self.assertEqual(p.donnees['Lat'], '1.409772222')
        self.assertEqual(p.donnees['Long'], '30.2800833')
        self.assertEqual(p.source_fichier, 'sites_test.csv')
        self.assertEqual(p.source_format, 'CSV')

    def test_valeur_vide_conservee(self):
        entetes, lignes = ENTETES, [list(LIGNE_1), list(LIGNE_2)]
        mapping = {'latitude': entetes.index('Lat'), 'longitude': entetes.index('Long'),
                   'nom': entetes.index('Village/Site')}
        self.client.post('/import/excel-intelligent/', data=json.dumps({
            'mapping': mapping, 'lignes': lignes, 'entetes': entetes,
        }), content_type='application/json')
        p = PointGeographique.objects.get(nom='Cihanda')
        self.assertIn('Observation', p.donnees)
        self.assertEqual(p.donnees['Observation'], '', 'colonne vide conservée')

    def test_doublons_actualises(self):
        entetes, lignes = ENTETES, [list(LIGNE_1), list(LIGNE_2)]
        mapping = {'latitude': entetes.index('Lat'), 'longitude': entetes.index('Long'),
                   'nom': entetes.index('Village/Site')}
        self.client.post('/import/excel-intelligent/', data=json.dumps({
            'mapping': mapping, 'lignes': lignes, 'entetes': entetes,
            'nom_fichier': 'v1.csv', 'format': 'CSV',
        }), content_type='application/json')
        PointGeographique.objects.update(donnees={}, source_fichier='')
        rep = self.client.post('/import/excel-intelligent/', data=json.dumps({
            'mapping': mapping, 'lignes': lignes, 'entetes': entetes,
            'nom_fichier': 'v2.csv', 'format': 'CSV',
        }), content_type='application/json')
        data = rep.json()
        self.assertEqual(data['importes'], 0)
        self.assertEqual(data['doublons'], 2)
        self.assertEqual(data['doublons_maj'], 2, 'les doublons sont réactualisés avec les colonnes')
        p = PointGeographique.objects.get(nom='Bogoro')
        self.assertEqual(p.source_fichier, 'v2.csv')
        self.assertEqual(len(p.donnees), 16)

    def test_geojson_via_importer(self):
        geojson = {'type': 'FeatureCollection', 'features': [{
            'type': 'Feature',
            'geometry': {'type': 'Point', 'coordinates': [27.5, -2.5]},
            'properties': {'ID': 'X99', 'NomProjet': 'Alpha', 'Bailleur': 'UNOPS', 'Budget': 15000, 'Empty': ''},
        }]}
        f = SimpleUploadedFile('test_geojson.geojson', json.dumps(geojson).encode(), content_type='application/geo+json')
        r = self.client.post('/importer/', data={'fichier_import': f})
        p = PointGeographique.objects.filter(longitude=27.5).first()
        self.assertIsNotNone(p, 'point GeoJSON créé')
        self.assertEqual(p.donnees.get('ID'), 'X99')
        self.assertEqual(p.source_fichier, 'test_geojson.geojson')
        self.assertEqual(p.source_format, 'GEOJSON')
        self.assertEqual(p.donnees.get('Empty'), '', 'colonne vide conservée')


class TestsJsonCarte(BaseCartographieTest):
    """points_json servi à la carte contient donnees + source."""

    def test_points_json_complet(self):
        p = PointGeographique.objects.create(
            nom='Point Test', latitude=-1.5, longitude=29.2,
            donnees={'Province': 'Nord Kivu', 'Altitude': '1500'},
            source_fichier='source.csv', source_format='CSV',
            projet=self.projet, auteur=self.admin,
        )
        page = self.page_carte()
        m = re.search(r'donneesPoints\s*=\s*(\[.*?\]);', page, re.S)
        self.assertIsNotNone(m, 'donneesPoints présent dans la page')
        pts = json.loads(m.group(1))
        cible = next(x for x in pts if x['id'] == p.pk)
        self.assertEqual(cible['donnees']['Province'], 'Nord Kivu')
        self.assertEqual(cible['source_fichier'], 'source.csv')
        self.assertEqual(cible['source_format'], 'CSV')
        self.assertEqual(cible['projet_id'], self.projet.pk)
        for marqueur in ('function extraireDonnees', 'htmlSectionsDonnees', 'function echapper',
                         "'donnees', 'medias', 'photo'", 'candidats.sort'):
            self.assertIn(marqueur, page, f'marqueur {marqueur} dans la carte')
