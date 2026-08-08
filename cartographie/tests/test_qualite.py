# -*- coding: utf-8 -*-
"""Tests du contrôle de qualité des données (règles + vue du tableau)."""

from cartographie.models import (
    ProjetAdduction, OuvrageHydraulique, TraceAdduction, PointGeographique,
    ReleveSource,
)
from cartographie import qualite

from .base import BaseCartographieTest


class TestReglesPoints(BaseCartographieTest):
    """Règles appliquées aux points du module générique."""

    def point(self, **kw):
        data = dict(nom='Point X', latitude=1.6785, longitude=29.233)
        data.update(kw)
        return PointGeographique.objects.create(
            projet=self.projet, auteur=self.admin, **data)

    def test_coordonnees_manquantes_00(self):
        p = self.point(latitude=0, longitude=0)
        self.assertIn(qualite.REGLE_COORDONNEES, qualite.analyser_point(p))

    def test_coordonnees_hors_domaine(self):
        p = self.point(latitude=91, longitude=29.233)
        self.assertIn(qualite.REGLE_COORDONNEES, qualite.analyser_point(p))

    def test_point_conforme(self):
        p = self.point()
        self.assertEqual(qualite.analyser_point(p), set())

    def test_precision_gps_insuffisante(self):
        p = self.point(precision_gps_m=250)
        codes = qualite.analyser_point(p)
        self.assertIn(qualite.REGLE_GPS, codes)
        self.assertEqual(qualite.gravite_statut(codes), qualite.GRAVITE_A_VERIFIER)

    def test_precision_gps_bonne(self):
        p = self.point(precision_gps_m=8)
        self.assertNotIn(qualite.REGLE_GPS, qualite.analyser_point(p))

    def test_doublons_automatiques(self):
        p1 = self.point(nom='A', latitude=1.4097, longitude=30.2800)
        p2 = self.point(nom='B', latitude=1.40973, longitude=30.28003)
        lignes = qualite.evaluer_points([p1, p2])
        par_nom = {p.nom: codes for p, codes, _g in lignes}
        self.assertIn(qualite.REGLE_DOUBLON, par_nom['A'])
        self.assertIn(qualite.REGLE_DOUBLON, par_nom['B'])
        self.assertEqual(qualite.gravite_statut(par_nom['A']), qualite.GRAVITE_ERREUR)

    def test_points_eloignes_pas_doublons(self):
        p1 = self.point(nom='A', latitude=1.4097, longitude=30.2800)
        p2 = self.point(nom='B', latitude=1.5, longitude=30.4)
        for _p, codes, _g in qualite.evaluer_points([p1, p2]):
            self.assertNotIn(qualite.REGLE_DOUBLON, codes)


class TestOuvragesQualite(BaseCartographieTest):
    """Règles appliquées aux ouvrages hydrauliques."""

    def setUp(self):
        super().setUp()
        self.projet_ad = ProjetAdduction.objects.create(nom='Adjet Test')

    def ouvrage(self, type_='source', **kw):
        data = dict(type=type_, nom='Ouvrage 1', latitude=1.6785,
                    longitude=29.233, altitude_m=1000)
        data.update(kw)
        return OuvrageHydraulique.objects.create(projet=self.projet_ad, **data)

    def test_altitude_absente(self):
        o = self.ouvrage(type='repere', altitude_m=None, village='')
        codes = qualite.analyser_ouvrage(o)
        self.assertIn(qualite.REGLE_ALTITUDE, codes)
        self.assertEqual(qualite.gravite_statut(codes), qualite.GRAVITE_A_VERIFIER)

    def test_source_sans_village(self):
        o = self.ouvrage(village='')
        codes = qualite.analyser_ouvrage(o)
        self.assertIn(qualite.REGLE_SOURCE_VILLAGE, codes)
        self.assertEqual(qualite.gravite_statut(codes), qualite.GRAVITE_ERREUR)

    def test_source_avec_village(self):
        o = self.ouvrage(village='Bogoro')
        self.assertNotIn(qualite.REGLE_SOURCE_VILLAGE, qualite.analyser_ouvrage(o))

    def test_borne_sans_village(self):
        o = self.ouvrage(type='borne', village='')
        codes = qualite.analyser_ouvrage(o)
        self.assertIn(qualite.REGLE_BORNE_VILLAGE, codes)
        self.assertEqual(qualite.gravite_statut(codes), qualite.GRAVITE_ERREUR)

    def test_photo_manquante_source(self):
        self.assertIn(qualite.REGLE_PHOTO, qualite.analyser_ouvrage(self.ouvrage()))

    def test_repere_sans_photo_ok(self):
        self.assertNotIn(qualite.REGLE_PHOTO,
                         qualite.analyser_ouvrage(self.ouvrage(type='repere')))

    def test_debit_non_renseigne(self):
        self.assertIn(qualite.REGLE_DEBIT, qualite.analyser_ouvrage(self.ouvrage()))

    def test_debit_renseigne_releve(self):
        o = self.ouvrage()
        ReleveSource.objects.create(ouvrage=o, debit_mesure=2.5)
        self.assertNotIn(qualite.REGLE_DEBIT,
                         qualite.analyser_ouvrage(o, debit_renseigne=True))

    def test_precision_gps_insuffisante(self):
        self.assertIn(qualite.REGLE_GPS,
                      qualite.analyser_ouvrage(self.ouvrage(precision_gps_m=180)))


class TestTracesQualite(BaseCartographieTest):
    """Règles origine/destination des tracés de conduites."""

    def setUp(self):
        super().setUp()
        self.projet_ad = ProjetAdduction.objects.create(nom='Adjet Trace')

    def ouvrage(self, type_, lat, lon):
        return OuvrageHydraulique.objects.create(
            projet=self.projet_ad, type=type_, nom='W', latitude=lat,
            longitude=lon, altitude_m=1000)

    def trace(self, coords):
        return TraceAdduction.objects.create(
            projet=self.projet_ad, nom='Conduite',
            coordonnees=coords)

    def test_conduite_sans_origine_ni_destination(self):
        t = self.trace([[30.2, 1.40], [30.3, 1.41]])
        codes = qualite.analyser_trace(t, [])
        self.assertIn(qualite.REGLE_TRACE_ORIGINE, codes)
        self.assertIn(qualite.REGLE_TRACE_DESTINATION, codes)
        self.assertEqual(qualite.gravite_statut(codes), qualite.GRAVITE_ERREUR)

    def test_conduite_reliant_source_village(self):
        src = self.ouvrage('source', 1.4000, 30.2000)
        vil = self.ouvrage('village', 1.4100, 30.3000)
        t = self.trace([[30.20005, 1.40005], [30.30005, 1.41005]])
        codes = qualite.analyser_trace(t, [src, vil])
        self.assertNotIn(qualite.REGLE_TRACE_ORIGINE, codes)
        self.assertNotIn(qualite.REGLE_TRACE_DESTINATION, codes)

    def test_trace_point_unique(self):
        t = self.trace([[30.2, 1.40]])
        self.assertIn(qualite.REGLE_COORDONNEES, qualite.analyser_trace(t, []))


class TestTableauQualite(BaseCartographieTest):
    """Vue du tableau de qualité des données."""

    def setUp(self):
        super().setUp()
        self.projet_ad = ProjetAdduction.objects.create(nom='Adjet QA')
        PointGeographique.objects.create(
            nom='Point vide', latitude=0, longitude=0, projet=self.projet,
            auteur=self.admin)
        OuvrageHydraulique.objects.create(
            projet=self.projet_ad, type='source', nom='Source isolée',
            latitude=1.4, longitude=30.2, altitude_m=800, village='')
        TraceAdduction.objects.create(
            projet=self.projet_ad, nom='Conduite nue',
            coordonnees=[[30.2, 1.4], [30.3, 1.41]])

    def test_page_qualite_liste_entites(self):
        r = self.client.get('/qualite/')
        self.assertEqual(r.status_code, 200)
        contenu = r.content.decode()
        self.assertIn('Qualité des données', contenu)
        self.assertIn('Source isolée', contenu)
        self.assertIn('Point vide', contenu)

    def test_filtre_module_points(self):
        r = self.client.get('/qualite/?module=points')
        contenu = r.content.decode()
        self.assertIn('Point vide', contenu)
        self.assertNotIn('Source isolée', contenu)

    def test_filtre_par_regle(self):
        r = self.client.get('/qualite/?regle=source_sans_village')
        contenu = r.content.decode()
        self.assertIn('Source isolée', contenu)
        self.assertNotIn('Point vide', contenu)

    def test_export_csv(self):
        r = self.client.get('/qualite/?export=csv')
        self.assertEqual(r.status_code, 200)
        self.assertIn('source_sans_village', r.content.decode())