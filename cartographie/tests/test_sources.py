# -*- coding: utf-8 -*-
"""Cahier des charges SOUCHE — gestionnaire des couches et des sources :
hiérarchie Projet → Sources → Fichiers → Couches → Catégories → entités.
Attribution automatique d'identifiants uniques (Source 001, Source 002…),
catégories détectées à l'import, payload geometrie_donnees, détachement sans
perte de données, renommage / couleur, protection entre projets."""

import io
import json

from django.core.files.uploadedfile import InMemoryUploadedFile

from cartographie.models import CoucheGeometrie, Geometrie, SourceGeometrie

from .base import BaseCartographieTest


def _geojson(features):
    return json.dumps({"type": "FeatureCollection", "features": features}).encode("utf-8")


def _pt(nom, lon=29.5, lat=-2.4, **extra):
    f = {"type": "Feature",
         "geometry": {"type": "Point", "coordinates": [lon, lat]},
         "properties": {"nom": nom, **extra}}
    return f


def _fichier(contenu, nom):
    return InMemoryUploadedFile(io.BytesIO(contenu), "fichier_geom", nom,
                                "application/octet-stream", len(contenu), None)


class SourceAttributionTests(BaseCartographieTest):
    def test_import_geo_json_cree_source_001(self):
        """Un import sans champ « source » crée une source nommée d'après le
        fichier, identifiant unique Source 001."""
        r, ids = self.importer_geometrie(
            "Points d'eau", "puits.geojson",
            _geojson([_pt("A"), _pt("B")]))
        self.assertEqual(r.status_code, 302)
        couche = CoucheGeometrie.objects.get(pk=list(ids)[0])
        source = couche.source_liee
        self.assertIsNotNone(source)
        self.assertEqual(source.identifiant, "Source 001")
        self.assertEqual(source.nom, "puits")
        self.assertEqual(source.projet, self.projet)

    def test_meme_fichier_reutilise_meme_source(self):
        """Deux imports du même fichier réutilisent la même source (par nom)."""
        _, ids1 = self.importer_geometrie(
            "A", "points.geojson", _geojson([_pt("A1")]))
        _, ids2 = self.importer_geometrie(
            "B", "points.geojson", _geojson([_pt("B1")]))
        s1 = CoucheGeometrie.objects.get(pk=list(ids1)[0]).source_liee
        s2 = CoucheGeometrie.objects.get(pk=list(ids2)[0]).source_liee
        self.assertEqual(s1, s2)
        self.assertEqual(s1.identifiant, "Source 001")
        self.assertEqual(SourceGeometrie.objects.filter(projet=self.projet).count(), 1)

    def test_fichiers_differents_creent_sources_distinctes(self):
        """Deux fichiers différents produisent Source 001 puis Source 002."""
        _, ids1 = self.importer_geometrie(
            "A", "puits.geojson", _geojson([_pt("A1")]))
        _, ids2 = self.importer_geometrie(
            "B", "routes.geojson", _geojson([_pt("B1")]))
        s1 = CoucheGeometrie.objects.get(pk=list(ids1)[0]).source_liee
        s2 = CoucheGeometrie.objects.get(pk=list(ids2)[0]).source_liee
        self.assertEqual({s1.identifiant, s2.identifiant}, {"Source 001", "Source 002"})

    def test_champ_source_prioritaire(self):
        """Le champ du formulaire d'import prime sur le nom du fichier."""
        fich = _fichier(_geojson([_pt("X")]), "routes.geojson")
        r = self.client.post("/geometrie/importer/", {
            "nom_couche": "R", "fichier_geom": fich,
            "source": "Enquête terrain 2026"})
        self.assertEqual(r.status_code, 302)
        source = SourceGeometrie.objects.get(projet=self.projet)
        self.assertEqual(source.nom, "Enquête terrain 2026")
        self.assertEqual(source.identifiant, "Source 001")
        couche = CoucheGeometrie.objects.get(nom="R")
        self.assertEqual(couche.source_liee, source)

    def test_couche_sans_projet_actif_na_pas_de_source(self):
        """Sans projet actif, aucune source n'est créée (rien n'est rattaché)."""
        s = self.client.session
        del s["projet_actif_id"]
        s.save()
        _, ids = self.importer_geometrie(
            "Solo", "solo.geojson", _geojson([_pt("S")]))
        couche = CoucheGeometrie.objects.get(pk=list(ids)[0])
        self.assertIsNone(couche.source_liee)
        self.assertEqual(SourceGeometrie.objects.count(), 0)


class CategorieTests(BaseCartographieTest):
    def test_categories_detectees_et_comptees(self):
        """La propriété « categorie » de chaque entité est stockée et comptée."""
        _, ids = self.importer_geometrie(
            "Villages", "villages.geojson",
            _geojson([_pt("V1", categorie="village"),
                      _pt("V2", categorie="village"),
                      _pt("C1", categorie="capitale")]))
        couche = CoucheGeometrie.objects.get(pk=list(ids)[0])
        valeurs = set(Geometrie.objects.filter(couche=couche)
                      .values_list("categorie", flat=True))
        self.assertEqual(valeurs, {"village", "capitale"})
        self.assertEqual(couche.geometries.filter(categorie="village").count(), 2)
        self.assertEqual(couche.geometries.filter(categorie="capitale").count(), 1)

    def test_geometrie_donnees_expose_categories(self):
        """Le payload de la carte contient categories + properties.categorie."""
        _, ids = self.importer_geometrie(
            "Zones", "zones.geojson",
            _geojson([_pt("Z1", categorie="zone"),
                      _pt("Z2", categorie="autre")]))
        couche_id = list(ids)[0]
        data = self.client.get("/geometrie/donnees/").json()
        couche = next(c for c in data if c["id"] == couche_id)
        noms = [c["nom"] for c in couche["categories"]]
        self.assertEqual(sorted(noms), ["autre", "zone"])
        cats = {f["properties"]["categorie"]
                for f in couche["geojson"]["features"]}
        self.assertEqual(cats, {"zone", "autre"})
        self.assertEqual(couche["fichier"], "zones.geojson")

    def test_sans_propriete_categorie_pas_d_erreur(self):
        """Aucune propriété catégorisante → catégories vides, import OK."""
        _, ids = self.importer_geometrie(
            "Simple", "simple.geojson",
            _geojson([_pt("P1", note="rien")]))
        couche = CoucheGeometrie.objects.get(pk=list(ids)[0])
        self.assertEqual(couche.geometries.count(), 1)
        self.assertEqual(couche.geometries.first().categorie, "")
        data = self.client.get("/geometrie/donnees/").json()
        c = next(c for c in data if c["id"] == couche.pk)
        self.assertEqual(c["categories"], [])


class GroupeFichiersTests(BaseCartographieTest):
    def test_fichier_regroupe_dans_payload(self):
        """La clé « fichier » = nom_original pour le regroupement virtuel."""
        _, ids = self.importer_geometrie(
            "M1", "multi.geojson", _geojson([_pt("A")]))
        _, ids2 = self.importer_geometrie(
            "M2", "multi.geojson", _geojson([_pt("B")]))
        ids = list(ids) + list(ids2)
        data = self.client.get("/geometrie/donnees/").json()
        couches = [c for c in data if c["id"] in ids]
        self.assertEqual({c["fichier"] for c in couches}, {"multi.geojson"})
        self.assertEqual(len({c["source_obj"]["identifiant"] for c in couches}), 1)


class EndpointSourceTests(BaseCartographieTest):
    def test_creation_via_api(self):
        r = self.client.post("/geometrie/sources/", {"nom": "Points d'eau"})
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertTrue(body["ok"])
        self.assertEqual(body["source"]["identifiant"], "Source 001")
        self.assertEqual(body["source"]["nom"], "Points d'eau")

    def test_creation_nom_duplique_reutilise(self):
        self.client.post("/geometrie/sources/", {"nom": "Soleil"})
        r = self.client.post("/geometrie/sources/", {"nom": "soleil"})
        body = r.json()
        self.assertTrue(body["ok"])
        self.assertEqual(body["source"]["identifiant"], "Source 001")
        self.assertEqual(SourceGeometrie.objects.count(), 1)

    def test_identifiants_toujours_uniques_apres_suppression(self):
        """Après suppression, l'identifiant suivant ne recrée pas de collision."""
        r1 = self.client.post("/geometrie/sources/", {"nom": "A"}).json()
        r2 = self.client.post("/geometrie/sources/", {"nom": "B"}).json()
        pk1 = r1["source"]["id"]
        self.client.post(f"/geometrie/source/{pk1}/supprimer/")
        r3 = self.client.post("/geometrie/sources/", {"nom": "C"}).json()
        self.assertEqual(r3["source"]["identifiant"], "Source 003")

    def test_renommage_et_couleur(self):
        r1 = self.client.post("/geometrie/sources/", {"nom": "A"}).json()
        pk = r1["source"]["id"]
        r = self.client.post(f"/geometrie/source/{pk}/modifier/",
                             {"nom": "A renommée", "couleur": "#22c55e"})
        self.assertEqual(r.status_code, 200)
        src = SourceGeometrie.objects.get(pk=pk)
        self.assertEqual(src.nom, "A renommée")
        self.assertEqual(src.couleur, "#22c55e")
        self.assertEqual(src.identifiant, "Source 001")

    def test_detachement_sans_perte_de_donnees(self):
        """Supprimer une source détache les couches mais ne supprime rien."""
        _, ids = self.importer_geometrie(
            "CoucheA", "data.geojson", _geojson([_pt("A")]))
        couche = CoucheGeometrie.objects.get(pk=list(ids)[0])
        source = couche.source_liee
        nb_geoms = Geometrie.objects.filter(couche=couche).count()
        r = self.client.post(f"/geometrie/source/{source.pk}/supprimer/")
        self.assertEqual(r.status_code, 200)
        self.assertFalse(SourceGeometrie.objects.filter(pk=source.pk).exists())
        couche.refresh_from_db()
        self.assertIsNone(couche.source_liee)
        self.assertEqual(couche.geometries.count(), nb_geoms)

    def test_source_d_un_autre_projet_est_protegee(self):
        autre = type(self.projet).objects.create(nom="Autre projet")
        source = SourceGeometrie.objects.create(
            projet=autre, identifiant="Source 001", nom="Secrète")
        r = self.client.post(f"/geometrie/source/{source.pk}/modifier/",
                             {"nom": "Hacké"})
        self.assertEqual(r.status_code, 404)
        r = self.client.post(f"/geometrie/source/{source.pk}/supprimer/")
        self.assertEqual(r.status_code, 404)
        self.assertTrue(SourceGeometrie.objects.filter(pk=source.pk).exists())

    def test_liste_sources_triees(self):
        self.client.post("/geometrie/sources/", {"nom": "Zulu"})
        self.client.post("/geometrie/sources/", {"nom": "Alpha"})
        data = self.client.get("/geometrie/sources/").json()
        self.assertEqual([s["identifiant"] for s in data], ["Source 001", "Source 002"])