# -*- coding: utf-8 -*-
"""Tests du module météo : API proxy, snapshot d'activité, rapports, fiabilité."""

import json
from datetime import datetime, timedelta
from unittest import mock

from django.core.cache import cache
from django.http import QueryDict
from django.test import TestCase
from django.utils import timezone

from cartographie.meteo import (libelle_conditions, recuperer_meteo,
                                _nom_vent, _valider_coordonnees)
from cartographie.models import Activite, MeteoActivite, PhotoActivite
from cartographie.tests.base import BaseCartographieTest


def _heures_futures(n):
    base = timezone.now().replace(minute=0, second=0, microsecond=0)
    return [(base + timedelta(hours=i)).isoformat() for i in range(n)]


def _dt_iso(valeur):
    dt = datetime.fromisoformat(valeur)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


DATA_OPEN_METEO = {
    'current': {
        'temperature_2m': 22.4, 'relative_humidity_2m': 68,
        'weather_code': 2, 'wind_speed_10m': 12.3, 'wind_direction_10m': 135,
        'precipitation_probability': 45,
    },
    'hourly': {
        'time': _heures_futures(3),
        'temperature_2m': [21.0, 22.4, 23.1],
        'weather_code': [2, 2, 3],
        'precipitation_probability': [40, 45, 50],
    },
    'daily': {
        'sunrise': ['2026-08-15T05:58'], 'sunset': ['2026-08-15T18:12'],
        'temperature_2m_max': [26.0], 'temperature_2m_min': [18.5],
    },
}


def fake_open_meteo(url, params):
    if 'bigdatacloud.net' in url:
        return {'city': 'Goma', 'locality': '', 'principalSubdivision': 'Nord-Kivu'}
    assert url.startswith('https://api.open-meteo.com/v1/forecast')
    return dict(DATA_OPEN_METEO)


class TestValideurs(TestCase):
    def test_coordonnees_valides(self):
        self.assertEqual(_valider_coordonnees('-1.67', '29.22'), (-1.67, 29.22))

    def test_coordonnees_invalides(self):
        self.assertEqual(_valider_coordonnees('abc', '29.22'), (None, None))
        self.assertEqual(_valider_coordonnees('95', '29.22'), (None, None))
        self.assertEqual(_valider_coordonnees(None, None), (None, None))

    def test_nom_vent(self):
        self.assertEqual(_nom_vent(0), 'N')
        self.assertEqual(_nom_vent(135), 'SE')
        self.assertEqual(_nom_vent(None), '')

    def test_libelle_conditions(self):
        lib, icone = libelle_conditions(2, 'fr')
        self.assertEqual(lib, 'Partiellement nuageux')
        lib2, _ = libelle_conditions(2, 'en')
        self.assertEqual(lib2, 'Partly cloudy')
        lib3, _ = libelle_conditions(None, 'fr')
        self.assertEqual(lib3, '')


class TestRecupererMeteo(TestCase):
    def setUp(self):
        cache.clear()

    @mock.patch('cartographie.meteo._requete_json', side_effect=fake_open_meteo)
    def test_recuperation_complete(self, req):
        d = recuperer_meteo(-1.67, 29.22, 'fr')
        self.assertIsNotNone(d)
        self.assertTrue(d['ok'])
        self.assertAlmostEqual(d['temperature'], 22.4)
        self.assertEqual(d['humidite'], 68)
        self.assertEqual(d['vent_direction'], 'SE')
        self.assertEqual(d['proba_pluie'], 45)
        self.assertEqual(d['source'], 'temps_reel')
        self.assertTrue(d['lever_soleil'])
        attendu = sum(
            1 for h in DATA_OPEN_METEO['hourly']['time']
            if _dt_iso(h) >= timezone.now())
        self.assertEqual(len(d['previsions']), attendu)
        self.assertEqual(d['localisation'], 'Goma, Nord-Kivu')
        req.assert_called()

    @mock.patch('cartographie.meteo._requete_json', side_effect=Exception('hors ligne'))
    def test_echec_service(self, req):
        d = recuperer_meteo(-1.67, 29.22)
        self.assertIsNone(d)

    @mock.patch('cartographie.meteo._requete_json', side_effect=fake_open_meteo)
    def test_coordonnees_invalides(self, req):
        self.assertIsNone(recuperer_meteo('x', 'y'))
        req.assert_not_called()


class TestApiMeteo(BaseCartographieTest):
    def setUp(self):
        super().setUp()
        cache.clear()

    def test_authentification_requise(self):
        self.client.logout()
        r = self.client.get('/api/meteo/?lat=-1.67&lon=29.22')
        self.assertEqual(r.status_code, 302)

    def test_coordonnees_invalides_400(self):
        r = self.client.get('/api/meteo/?lat=abc&lon=29.22')
        self.assertEqual(r.status_code, 400)

    @mock.patch('cartographie.meteo._requete_json', side_effect=fake_open_meteo)
    def test_ok(self, req):
        r = self.client.get('/api/meteo/?lat=-1.67&lon=29.22&lang=fr')
        self.assertEqual(r.status_code, 200)
        d = r.json()
        self.assertTrue(d['ok'])
        self.assertAlmostEqual(d['temperature'], 22.4)

    @mock.patch('cartographie.meteo._requete_json', side_effect=Exception('panne'))
    def test_service_indisponible_503(self, req):
        r = self.client.get('/api/meteo/?lat=-1.67&lon=29.22')
        self.assertEqual(r.status_code, 503)


class TestSnapshotActivite(BaseCartographieTest):
    def creer_activite(self, **meteo_post):
        data = {
            'projet': self.projet.pk, 'rapport': 'Visite de terrain',
            'latitude': '-1.67', 'longitude': '29.22',
            'agent': self.admin.pk,
        }
        data.update(meteo_post)
        return self.client.post('/activite/ajouter/', data)

    @mock.patch('cartographie.meteo.recuperer_meteo')
    def test_snapshot_envoye_par_le_widget(self, recup):
        recup.return_value = None  # ne doit pas être appelé si le POST porte le snapshot
        r = self.creer_activite(
            meteo_latitude='-1.67', meteo_longitude='29.22',
            meteo_temperature='22.4', meteo_conditions='Partiellement nuageux',
            meteo_code='2', meteo_humidite='68', meteo_vent_kmh='12.3',
            meteo_vent_direction='SE', meteo_proba_pluie='45',
            meteo_lever='2026-08-15T05:58:00+02:00', meteo_coucher='2026-08-15T18:12:00+02:00',
            meteo_localisation='Goma', meteo_source='temps_reel',
            meteo_horodatage='2026-08-15T09:30:00+02:00')
        self.assertEqual(r.status_code, 302)
        recup.assert_not_called()
        a = Activite.objects.get(rapport='Visite de terrain')
        m = a.meteo
        self.assertTrue(m.donnees_disponibles)
        self.assertAlmostEqual(m.temperature_c, 22.4)
        self.assertEqual(m.conditions, 'Partiellement nuageux')
        self.assertEqual(m.humidite, 68)
        self.assertEqual(m.vent_direction, 'SE')
        self.assertEqual(m.proba_pluie, 45)
        self.assertEqual(m.source, 'temps_reel')
        self.assertEqual(m.localisation, 'Goma')
        self.assertIsNotNone(m.lever_soleil)
        self.assertIsNotNone(m.horodatage_meteo)

    @mock.patch('cartographie.meteo.recuperer_meteo')
    def test_snapshot_cache_depuis_widget(self, recup):
        recup.return_value = None
        r = self.creer_activite(meteo_temperature='', meteo_source='cache')
        self.assertEqual(r.status_code, 302)
        recup.assert_not_called()
        a = Activite.objects.get(rapport='Visite de terrain')
        self.assertFalse(a.meteo.donnees_disponibles)
        self.assertEqual(a.meteo.source, 'cache')

    @mock.patch('cartographie.meteo.recuperer_meteo')
    def test_auto_fetch_serveur_sans_donnees_client(self, recup):
        recup.return_value = {
            'lat': -1.67, 'lon': 29.22, 'temperature': 21.0,
            'conditions': 'Ciel dégagé', 'code': 0, 'humidite': 70,
            'vent_kmh': 5.0, 'vent_direction': 'N', 'proba_pluie': 10,
            'lever_soleil': '2026-08-15T05:58:00+02:00',
            'coucher_soleil': '2026-08-15T18:12:00+02:00',
            'localisation': 'Goma', 'source': 'temps_reel',
            'horodatage': '2026-08-15T09:30:00+02:00',
        }
        r = self.creer_activite()
        self.assertEqual(r.status_code, 302)
        recup.assert_called_once()
        a = Activite.objects.get(rapport='Visite de terrain')
        self.assertTrue(a.meteo.donnees_disponibles)
        self.assertAlmostEqual(a.meteo.temperature_c, 21.0)

    @mock.patch('cartographie.meteo.recuperer_meteo', side_effect=Exception('panne totale'))
    def test_la_meteo_ne_bloque_jamais_la_creation(self, recup):
        r = self.creer_activite()
        self.assertEqual(r.status_code, 302)
        self.assertTrue(Activite.objects.filter(rapport='Visite de terrain').exists())

    def test_anti_doublon_update_or_create(self):
        r = self.creer_activite(meteo_temperature='22.0', meteo_source='temps_reel')
        self.assertEqual(r.status_code, 302)
        a = Activite.objects.get(rapport='Visite de terrain')
        # second enregistrement sur la même activité → toujours 1 ligne
        from cartographie.views import _enregistrer_meteo_activite
        _enregistrer_meteo_activite(a, {
            'lat': -1.67, 'lon': 29.22, 'temperature': 23.0,
            'conditions': '', 'code': None, 'humidite': None, 'vent_kmh': None,
            'vent_direction': '', 'vent_direction_deg': None, 'proba_pluie': None,
            'lever_soleil': None, 'coucher_soleil': None, 'localisation': '',
            'source': 'temps_reel', 'horodatage': None,
        })
        self.assertEqual(MeteoActivite.objects.filter(activite=a).count(), 1)
        a.meteo.refresh_from_db()
        self.assertAlmostEqual(a.meteo.temperature_c, 23.0)


class TestMeteoDansRapports(BaseCartographieTest):
    def setUp(self):
        super().setUp()
        self.activite = Activite.objects.create(
            projet=self.projet, agent=self.admin, rapport='Rapport météo test',
            latitude=-1.67, longitude=29.22)
        MeteoActivite.objects.create(
            activite=self.activite, latitude=-1.67, longitude=29.22,
            localisation='Goma', temperature_c=22.4, conditions='Partiellement nuageux',
            code_conditions=2, humidite=68, vent_kmh=12.3, vent_direction='SE',
            proba_pluie=45, donnees_disponibles=True, source='temps_reel',
            horodatage_meteo=timezone.now())

    def test_donnees_rapport_contiennent_la_meteo(self):
        from cartographie.views import _filtres_rapport, _donnees_rapport_v2

        class _Requete:
            method = 'GET'
            GET = QueryDict('sections=toutes')
            user = self.admin

        f = _filtres_rapport(_Requete(), self.admin)
        f['sections'] = ['conditions_meteo']
        ctx = _donnees_rapport_v2(f)
        self.assertIn(self.activite.pk, ctx['meteo_par_activite'])
        m = ctx['meteo_par_activite'][self.activite.pk]
        self.assertAlmostEqual(m.temperature_c, 22.4)

    def test_telechargements_rapport(self):
        url = '/rapport/telecharger/{}/?sections=toutes'.format
        for fmt, ctype in [('docx', 'wordprocessingml'), ('pdf', 'application/pdf'),
                           ('xlsx', 'spreadsheetml')]:
            r = self.client.get(url(fmt))
            self.assertEqual(r.status_code, 200, fmt)
            self.assertIn(ctype, r['Content-Type'], fmt)
            self.assertGreater(len(r.content), 1000, fmt)

    def test_page_rapport_contient_la_section(self):
        r = self.client.get('/rapport/?sections=toutes')
        self.assertEqual(r.status_code, 200)
        contenu = r.content.decode('utf-8', errors='replace')
        self.assertIn('conditions_meteo', contenu)
        self.assertIn('Partiellement nuageux', contenu)
        self.assertIn('22,4', contenu)
