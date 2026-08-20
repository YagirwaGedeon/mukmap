# -*- coding: utf-8 -*-
"""Tests du géocodage professionnel (CARTES) :
parsing DMS, proxy serveur Nominatim/Photon, cache, secours."""

from unittest import mock

from django.urls import reverse

from cartographie import views

from .base import BaseCartographieTest

NOMINATIM_OK = [
    {
        'lat': '-1.6794', 'lon': '29.2245', 'type': 'city',
        'name': 'Goma', 'display_name': 'Goma, Nord-Kivu, République démocratique du Congo',
        'address': {'city': 'Goma', 'state': 'Nord-Kivu', 'country': 'République démocratique du Congo'},
    },
]
PHOTON_OK = [
    {
        'geometry': {'coordinates': [29.2245, -1.6794]},
        'properties': {'osm_value': 'village', 'name': 'Goma',
                       'city': 'Goma', 'state': 'Nord-Kivu', 'country': 'DR Congo'},
    },
]


class ParsingDMSTests(BaseCartographieTest):
    def test_decimal_simple(self):
        self.assertEqual(views._dms_vers_decimal('6.1257, 29.5611'), (6.1257, 29.5611))
        self.assertEqual(views._dms_vers_decimal('-1.6794 29.2245'), (-1.6794, 29.2245))
        self.assertEqual(views._dms_vers_decimal('6,1257 ; 29,5611'), (6.1257, 29.5611))

    def test_dms_complet(self):
        self.assertAlmostEqual(views._dms_vers_decimal("6°7'32.4\"S 29°33'40\"E")[0], -6.125666, places=4)
        self.assertAlmostEqual(views._dms_vers_decimal("6°7'32.4\"S 29°33'40\"E")[1], 29.561111, places=4)

    def test_dms_espaces(self):
        self.assertAlmostEqual(views._dms_vers_decimal('6 7 32.4 S 29 33 40 E')[0], -6.125666, places=4)
        self.assertAlmostEqual(views._dms_vers_decimal('6 7 32.4 S 29 33 40 E')[1], 29.561111, places=4)

    def test_dms_direction_prefixe(self):
        self.assertAlmostEqual(views._dms_vers_decimal('S6.1257 E29.5611')[0], -6.1257, places=4)
        self.assertAlmostEqual(views._dms_vers_decimal('S6.1257 E29.5611')[1], 29.5611, places=4)

    def test_invalides(self):
        self.assertIsNone(views._dms_vers_decimal(''))
        self.assertIsNone(views._dms_vers_decimal('bonjour le monde'))
        self.assertIsNone(views._dms_vers_decimal('999 999'))
        self.assertIsNone(views._dms_vers_decimal('12 99 99 N 5 6 7 E'))
        self.assertIsNone(views._dms_vers_decimal('10 20 30 40 50'))


class GeocoderEndpointTests(BaseCartographieTest):
    def setUp(self):
        super().setUp()
        views._GEOCODE_CACHE.clear()

    def _get(self, q):
        return self.client.get(reverse('geocoder_geographique'), {'q': q, 'lang': 'fr'})

    def test_requiert_parametre(self):
        self.assertEqual(self._get('').status_code, 200)
        self.assertEqual(self._get('').json()['resultats'], [])

    def test_coordonnees_directes(self):
        r = self._get('-1.6794, 29.2245')
        res = r.json()['resultats']
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]['type'], 'coord')
        self.assertAlmostEqual(res[0]['lat'], -1.6794)

    def test_dms_serveur(self):
        r = self._get("6°7'32.4\"S 29°33'40\"E")
        res = r.json()['resultats']
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]['type'], 'coord')
        self.assertAlmostEqual(res[0]['lat'], -6.125666, places=4)

    @mock.patch.object(views, '_geocode_nominatim', return_value=NOMINATIM_OK)
    def test_nominatim_succes(self, nominatim):
        r = self._get('Goma')
        self.assertEqual(r.status_code, 200)
        res = r.json()['resultats']
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]['nom'], 'Goma')
        self.assertEqual(res[0]['type'], 'city')
        self.assertEqual(res[0]['ville'], 'Goma')
        self.assertEqual(res[0]['pays'], 'République démocratique du Congo')
        self.assertEqual(res[0]['fournisseur'], 'nominatim')
        nominatim.assert_called_once()

    @mock.patch.object(views, '_geocode_nominatim', side_effect=Exception('KO'))
    @mock.patch.object(views, '_geocode_photon', return_value=PHOTON_OK)
    def test_secours_photon(self, photon, nominatim):
        r = self._get('Goma')
        self.assertEqual(r.status_code, 200)
        res = r.json()['resultats']
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]['nom'], 'Goma')
        self.assertEqual(res[0]['type'], 'village')
        self.assertEqual(res[0]['fournisseur'], 'photon')
        nominatim.assert_called_once()
        photon.assert_called_once()

    @mock.patch.object(views, '_geocode_nominatim', side_effect=Exception('KO'))
    @mock.patch.object(views, '_geocode_photon', side_effect=Exception('KO'))
    def test_indisponible_503(self, photon, nominatim):
        r = self._get('Goma')
        self.assertEqual(r.status_code, 503)
        self.assertEqual(r.json()['resultats'], [])

    @mock.patch.object(views, '_geocode_nominatim', return_value=NOMINATIM_OK)
    def test_cache(self, nominatim):
        self._get('Goma')
        self._get('Goma')
        self.assertEqual(nominatim.call_count, 1, 'second appel servi par le cache')

    @mock.patch.object(views, '_geocode_nominatim', return_value=NOMINATIM_OK)
    def test_entrees_invalides_ignorees(self, nominatim):
        views._geocode_nominatim.return_value = [{'lat': 'abc', 'lon': 'def', 'display_name': 'X'}]
        r = self._get('xyz')
        self.assertEqual(r.json()['resultats'], [])

    def test_methode_non_autorisee(self):
        r = self.client.post(reverse('geocoder_geographique'), {'q': 'Goma'})
        self.assertEqual(r.status_code, 405)