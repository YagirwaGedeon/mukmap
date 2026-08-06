# -*- coding: utf-8 -*-
"""Lance les tests JavaScript du panneau Identifier (Node requis).

La page est rendue par Django (données réelles) puis les tests Node reçoivent
le JSON extrait de la page servie : ils valident le code tel que distribué.
"""

import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

from cartographie.models import PointGeographique

from .base import BaseCartographieTest

NODE = shutil.which('node')
DOSSIER_JS = Path(__file__).parent / 'js'


@unittest.skipIf(NODE is None, 'Node.js non installé — tests JS ignorés')
class TestsJSPanneauIdentifier(BaseCartographieTest):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.point = PointGeographique.objects.create(
            nom='Bogoro', latitude=1.409772222, longitude=30.280000,
            categorie='village', statut='actif', province='Ituri',
            donnees={'No': '1', 'Province': 'Ituri', 'Territoire': 'Irumu',
                     'Activite': 'Adduction', 'Lat': '1.409772222', 'Long': '30.280000',
                     'Statut des etudes': 'Terminees', 'Observation': ''},
            source_fichier='sites.csv', source_format='CSV',
            projet=cls.projet, auteur=cls.admin,
        )
        cls.pip = PointGeographique.objects.create(
            nom='Goma Centre', latitude=-1.6785, longitude=29.233,
            categorie='village', statut='actif', province='Nord Kivu',
            projet=cls.projet, auteur=cls.admin,
        )

    def _donnees_points(self):
        """DonneesPoints JSON servies dans la page carte rendue."""
        page = self.client.get('/').content.decode('utf-8', errors='replace')
        m = re.search(r'donneesPoints\s*=\s*(\[.*?\]);', page, re.S)
        self.assertIsNotNone(m, 'donneesPoints présent dans la page rendue')
        return json.loads(m.group(1))

    def _lancer(self, script, *args):
        r = subprocess.run([NODE, str(script), *args], capture_output=True, text=True, cwd=str(DOSSIER_JS))
        self.assertEqual(r.returncode, 0, 'Sortie :\n' + r.stdout + r.stderr)
        return r.stdout

    def test_sections_donnees(self):
        self._lancer(DOSSIER_JS / 'test_sections.js')

    def test_export_carte_core(self):
        self._lancer(DOSSIER_JS / 'test_export_carte.js')

    def test_mode_avance_core(self):
        self._lancer(DOSSIER_JS / 'test_mode_avance.js')

    def test_mode_3d_core(self):
        self._lancer(DOSSIER_JS / 'test_mode_3d.js')

    def test_topographie_core(self):
        self._lancer(DOSSIER_JS / 'test_topographie.js')

    def test_basemap_selector_core(self):
        self._lancer(DOSSIER_JS / 'test_basemap_selector.js')

    def test_imagerie_core(self):
        self._lancer(DOSSIER_JS / 'test_imagerie.js')

    def test_couches_wms_core(self):
        self._lancer(DOSSIER_JS / 'test_couches_wms.js')

    def test_panneau_identifier(self):
        fichier = DOSSIER_JS / '_donnees_points_rendues.json'
        fichier.write_text(json.dumps(self._donnees_points(), ensure_ascii=False), encoding='utf-8')
        try:
            self._lancer(DOSSIER_JS / 'test_panneau.js', str(fichier))
        finally:
            fichier.unlink(missing_ok=True)
