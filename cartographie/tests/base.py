# -*- coding: utf-8 -*-
"""Classe de base et helpers communs aux tests."""

import io
import re

from django.contrib.auth.models import User
from django.core.files.uploadedfile import InMemoryUploadedFile
from django.test import TestCase

from cartographie.models import CoucheGeometrie, Projet


class BaseCartographieTest(TestCase):
    """TestCase connecté en admin avec un projet actif, comme en usage réel."""

    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_superuser('testadmin', 'test@mukmap.local', 'testpass')
        cls.projet = Projet.objects.create(nom='Projet Test')

    def setUp(self):
        self.client.force_login(self.admin)
        s = self.client.session
        s['projet_actif_id'] = self.projet.pk
        s.save()

    def importer_geometrie(self, nom_couche, nom_fichier, contenu, auxiliaires=None):
        """POST un fichier sur /geometrie/importer/ et renvoie (réponse, pks des couches créées).
        `auxiliaires` : liste de (nom, contenu) envoyée comme fichiers fichier_aux (composants Shapefile)."""
        avant = set(CoucheGeometrie.objects.values_list('pk', flat=True))
        fich = InMemoryUploadedFile(
            io.BytesIO(contenu), 'fichier_geom', nom_fichier,
            'application/octet-stream', len(contenu), None)
        donnees = {'nom_couche': nom_couche, 'fichier_geom': fich}
        aux = []
        for nom_aux, contenu_aux in (auxiliaires or []):
            aux.append(InMemoryUploadedFile(
                io.BytesIO(contenu_aux), 'fichier_aux', nom_aux,
                'application/octet-stream', len(contenu_aux), None))
        if aux:
            donnees['fichier_aux'] = aux
        r = self.client.post('/geometrie/importer/', donnees)
        nouvelles = set(CoucheGeometrie.objects.values_list('pk', flat=True)) - avant
        return r, nouvelles

    def rapport_rendu(self, cible=None):
        """Rapport d'import injecté dans la page carte (après redirection ?importe=)."""
        url = '/' + ('?importe=' + str(cible) if cible else '')
        page = self.client.get(url).content.decode('utf-8', errors='replace')
        m = re.search(r'rapportImport\s*=\s*(\{.*?\});', page, re.S)
        return m.group(1) if m else None

    def page_carte(self):
        return self.client.get('/').content.decode('utf-8', errors='replace')
