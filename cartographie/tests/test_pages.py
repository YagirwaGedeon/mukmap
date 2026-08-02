# -*- coding: utf-8 -*-
"""Pages de l'application : liste des points, carte, recherche, filtres."""

from cartographie.models import PointGeographique

from .base import BaseCartographieTest


class TestsPages(BaseCartographieTest):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.p1 = PointGeographique.objects.create(
            nom='Goma Centre', latitude=-1.6785, longitude=29.233,
            categorie='village', statut='actif', province='Nord Kivu',
            projet=cls.projet, auteur=cls.admin,
        )
        cls.p2 = PointGeographique.objects.create(
            nom='Bogoro', latitude=1.4097, longitude=30.2800,
            categorie='village', statut='actif', province='Ituri',
            donnees={'No': '1', 'Province': 'Ituri', 'Activite': 'Adduction', 'Lat': '1.409772222'},
            source_fichier='sites.csv', source_format='CSV',
            projet=cls.projet, auteur=cls.admin,
        )

    def test_points_liste(self):
        r = self.client.get('/points/')
        self.assertEqual(r.status_code, 200)
        contenu = r.content.decode('utf-8', errors='replace')
        self.assertIn('Tous les points', contenu)
        self.assertEqual(contenu.count('class="chevron"'), 2, '2 lignes avec chevron')
        self.assertIn('sites.csv', contenu, 'source du fichier visible')

    def test_points_liste_recherche(self):
        r = self.client.get('/points/?q=GOMA')
        contenu = r.content.decode('utf-8', errors='replace')
        self.assertEqual(r.status_code, 200)
        self.assertIn('Goma Centre', contenu)
        self.assertNotIn('>Bogoro<', contenu)

    def test_points_liste_filtre_projet(self):
        r = self.client.get('/points/?projet=' + str(self.projet.pk))
        contenu = r.content.decode('utf-8', errors='replace')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(contenu.count('class="chevron"'), 2)

    def test_carte_contient_donnees_et_fonctions(self):
        contenu = self.page_carte()
        for marqueur in ('donneesPoints', 'extraireDonnees', 'htmlSectionsDonnees',
                         'htmlSectionsCompactes', 'function echapper', 'colonnesSupplementaires',
                         '/points/?point='):
            self.assertIn(marqueur, contenu, f'marqueur {marqueur}')

    def test_carte_non_connecte_accessible(self):
        self.client.logout()
        r = self.client.get('/')
        self.assertEqual(r.status_code, 200)

    def test_export_points_geojson(self):
        r = self.client.get('/export/geojson/')
        self.assertEqual(r.status_code, 200)
        contenu = r.content.decode('utf-8', errors='replace')
        self.assertIn('FeatureCollection', contenu)
        self.assertIn('Bogoro', contenu)
