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

    def test_points_liste_compteur_photos(self):
        from cartographie.models import MediaPoint
        from cartographie.tests.test_medias_points import jpeg_brut
        fichier = jpeg_brut()
        MediaPoint.objects.create(point=self.p1, type='photo', fichier=fichier)
        MediaPoint.objects.create(point=self.p1, type='photo', fichier=jpeg_brut('b2.jpg'))
        contenu = self.client.get('/points/').content.decode('utf-8', errors='replace')
        self.assertIn('Photos', contenu, 'colonne Photos du tableau')
        self.assertIn('class="badge">📷 2</span>', contenu, 'compteur 2 photos')
        self.assertIn('Photos géoréférencées', contenu, 'détail de la ligne')

    def test_carte_contient_donnees_et_fonctions(self):
        contenu = self.page_carte()
        for marqueur in ('donneesPoints', 'extraireDonnees', 'htmlSectionsDonnees',
                         'htmlSectionsCompactes', 'function echapper', 'colonnesSupplementaires',
                         '/points/?point='):
            self.assertIn(marqueur, contenu, f'marqueur {marqueur}')

    def test_carte_export_modale(self):
        contenu = self.page_carte()
        for marqueur in ('btn-exporter-carte', 'modale-export', 'export-format', 'export-zone',
                         'export-orientation', 'export-format-page', 'export-dpi', 'export-marges',
                         'export-qualite', 'export-taille', 'export-el-legende', 'export-el-echelle',
                         'export-el-nord', 'export-champ-titre', 'export-champ-auteur',
                         'export-apercu', 'export-lancer', 'export-annuler', 'export-options-toggle',
                         'export-csrf', "js/export-carte.js", 'window.map = map;',
                         'window.CATS = CATS;'):
            self.assertIn(marqueur, contenu, f'marqueur export {marqueur}')

    def test_carte_systeme_pro_cartes(self):
        contenu = self.page_carte()
        for marqueur in ('btn-statut-sources', 'btn-ombrage', 'pro-barre-statut', 'chargement-tuiles',
                         'sources-cartographiques.js?v=1', 'basemap-selector.js?v=28',
                         'geometrie/geocoder/', 'appliquerOmbrageRelief', 'fallback_basemap',
                         'TYPE_GEO_EMOJI', 'versDMS', 'zoomPourTypeGeo', 'fondsPourStatut'):
            self.assertIn(marqueur, contenu, f'marqueur CARTES {marqueur}')
        self.assertNotIn('https://nominatim.openstreetmap.org/search', contenu,
                         'le géocodage passe par le proxy serveur')

    def test_carte_export_modale_cachee_invite(self):
        self.client.logout()
        r = self.client.get('/')
        contenu = r.content.decode('utf-8', errors='replace')
        self.assertEqual(r.status_code, 200)
        self.assertNotIn('id="btn-exporter-carte"', contenu, 'pas de bouton export pour l’invité')

    def test_export_carte_pdf_poste_image(self):
        import base64
        import io

        from PIL import Image as ImgPil

        buf = io.BytesIO()
        ImgPil.new('RGB', (100, 80), (200, 120, 30)).save(buf, 'PNG')
        b64 = 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()
        r = self.client.post('/export/carte-pdf/', data={
            'image': b64, 'format_page': 'A4', 'orientation': 'L', 'marge_mm': 12, 'projet': 'Test',
        }, content_type='application/json')
        self.assertEqual(r.status_code, 200)
        self.assertIn('application/pdf', r['Content-Type'])
        self.assertIn('attachment', r['Content-Disposition'])
        self.assertIn('carte_Test_', r['Content-Disposition'])
        self.assertTrue(r.content.startswith(b'%PDF'), 'le corps est bien un PDF')

    def test_export_carte_pdf_portrait_nom(self):
        import base64
        import io

        from PIL import Image as ImgPil

        buf = io.BytesIO()
        ImgPil.new('RGB', (80, 100), (10, 200, 90)).save(buf, 'PNG')
        b64 = 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()
        r = self.client.post('/export/carte-pdf/', data={
            'image': b64, 'format_page': 'A3', 'orientation': 'P', 'projet': 'Nord Kivu',
        }, content_type='application/json')
        self.assertEqual(r.status_code, 200)
        self.assertIn('carte_Nord_Kivu_', r['Content-Disposition'])
        self.assertIn('_portrait', r['Content-Disposition'])

    def test_export_carte_pdf_requetes_invalides(self):
        r = self.client.post('/export/carte-pdf/', data={}, content_type='application/json')
        self.assertEqual(r.status_code, 400)
        r = self.client.post('/export/carte-pdf/', data='pas du json', content_type='application/json')
        self.assertEqual(r.status_code, 400)
        r = self.client.post('/export/carte-pdf/', data={'image': 'data:image/png;base64,zzz'},
                             content_type='application/json')
        self.assertEqual(r.status_code, 400)
        r = self.client.get('/export/carte-pdf/')
        self.assertEqual(r.status_code, 302, 'GET redirige vers la carte')


    def test_carte_non_connecte_accessible(self):
        self.client.logout()
        r = self.client.get('/')
        self.assertEqual(r.status_code, 200)

    def test_import_wizard_page(self):
        r = self.client.get('/import/')
        self.assertEqual(r.status_code, 200)
        contenu = r.content.decode('utf-8', errors='replace')
        for marqueur in ('data-etape', 'zone-drop', 'btn-importer', 'liste-fichiers',
                         'panneau-points', 'panneau-sig', 'panneau-style-sig',
                         'panneau-style-points', 'style-cat-active', 'cat-champ',
                         'btn-regenerer', 'legende-preview', 'sig-nom-couche',
                         'URL_IMPORT_POINTS', 'URL_IMPORT_COUCHE',
                         "/import/excel-intelligent/'", "/geometrie/importer/'",
                         'EXT_POINTS', 'EXT_SIG', 'PRESETS'):
            self.assertIn(marqueur, contenu, f'marqueur wizard {marqueur}')

    def test_export_points_geojson(self):
        r = self.client.get('/export/geojson/')
        self.assertEqual(r.status_code, 200)
        contenu = r.content.decode('utf-8', errors='replace')
        self.assertIn('FeatureCollection', contenu)
        self.assertIn('Bogoro', contenu)
