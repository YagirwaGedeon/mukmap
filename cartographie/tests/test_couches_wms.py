# -*- coding: utf-8 -*-
"""API des couches WMS superposables (Mode Avancé) : création, liste, opacité, suppression."""

import json

from django.contrib.auth.models import User

from cartographie.models import CoucheWMS

from .base import BaseCartographieTest


def _url_wms(nom='couche', prefixe='https://geo.example/wms'):
    return '%s?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=%s&STYLES=&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png' % (prefixe, nom)


class TestsCouchesWMS(BaseCartographieTest):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.agent = User.objects.create_user('agentwms', 'agentwms@mukmap.local', 'pass')
        cls.principal = User.objects.get(username='YAGIRWA')

    def _activer_avance(self):
        s = self.client.session
        s['mode_avance_autorise'] = True
        s.save()

    def _poster(self, data):
        return self.client.post('/api/couches-wms/',
                                data=json.dumps(data), content_type='application/json')

    def test_creation_sans_acces_refusee(self):
        self.client.force_login(self.agent)
        r = self._poster({'nom': 'Hydro', 'url': _url_wms()})
        self.assertEqual(r.status_code, 403)
        self.assertEqual(CoucheWMS.objects.count(), 0)

    def test_creation_valide(self):
        self.client.force_login(self.agent)
        self._activer_avance()
        r = self._poster({'nom': 'Bassins HydroBASINS', 'url': _url_wms('basins'),
                          'attribution': '© HydroSHEDS', 'opacite': 0.55})
        self.assertEqual(r.status_code, 201)
        d = r.json()
        self.assertTrue(d['ok'])
        c = d['couche']
        self.assertEqual(c['nom'], 'Bassins HydroBASINS')
        self.assertEqual(c['opacite'], 0.55)
        self.assertTrue(c['visible'])
        obj = CoucheWMS.objects.get(pk=c['id'])
        self.assertEqual(obj.auteur, self.agent)
        self.assertEqual(obj.attribution, '© HydroSHEDS')
        self.assertEqual(str(obj), 'Bassins HydroBASINS')

    def test_creation_validation_champs(self):
        self.client.force_login(self.agent)
        self._activer_avance()
        r = self._poster({'nom': 'X', 'url': 'ftp://x'})
        self.assertEqual(r.status_code, 400)
        r = self._poster({'nom': 'X', 'url': 'https://x/wms?layers=a'})
        self.assertEqual(r.status_code, 400)
        r = self._poster({'nom': '', 'url': _url_wms()})
        self.assertEqual(r.status_code, 400)
        r = self._poster({'nom': 'OK', 'url': _url_wms('rivières')})
        self.assertEqual(r.status_code, 201)

    def test_opacite_bornee(self):
        self.client.force_login(self.agent)
        self._activer_avance()
        r = self._poster({'nom': 'Opacité', 'url': _url_wms(), 'opacite': 7})
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()['couche']['opacite'], 1.0)
        r = self._poster({'nom': 'Opacité 2', 'url': _url_wms('o2'), 'opacite': -3})
        self.assertEqual(r.json()['couche']['opacite'], 0.0)

    def test_liste(self):
        self.client.force_login(self.agent)
        self._activer_avance()
        self._poster({'nom': 'C1', 'url': _url_wms('c1')})
        r = self.client.get('/api/couches-wms/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.json()['couches']), 1)
        self.assertEqual(r.json()['couches'][0]['nom'], 'C1')

    def test_patch_opacite_et_visibilite(self):
        self.client.force_login(self.agent)
        self._activer_avance()
        r = self._poster({'nom': 'C2', 'url': _url_wms('c2'), 'opacite': 0.7})
        pk = r.json()['couche']['id']
        r = self.client.patch('/api/couches-wms/%d/' % pk,
                              data=json.dumps({'opacite': 0.3, 'visible': False}),
                              content_type='application/json')
        self.assertEqual(r.status_code, 200)
        c = r.json()['couche']
        self.assertEqual(c['opacite'], 0.3)
        self.assertFalse(c['visible'])
        obj = CoucheWMS.objects.get(pk=pk)
        self.assertAlmostEqual(obj.opacite, 0.3)
        self.assertFalse(obj.visibilite)

    def test_suppression_proprietaire(self):
        self.client.force_login(self.agent)
        c = CoucheWMS.objects.create(nom='C3', url=_url_wms('c3'), auteur=self.agent)
        r = self.client.delete('/api/couches-wms/%d/' % c.pk)
        self.assertEqual(r.status_code, 200)
        self.assertFalse(CoucheWMS.objects.filter(pk=c.pk).exists())

    def test_suppression_refusee_non_proprietaire(self):
        self.client.force_login(self.agent)
        c = CoucheWMS.objects.create(nom='C4', url=_url_wms('c4'), auteur=self.principal)
        r = self.client.delete('/api/couches-wms/%d/' % c.pk)
        self.assertEqual(r.status_code, 403)
        self.assertTrue(CoucheWMS.objects.filter(pk=c.pk).exists())

    def test_suppression_admin_principal(self):
        self.client.force_login(self.principal)
        c = CoucheWMS.objects.create(nom='C5', url=_url_wms('c5'), auteur=self.agent)
        r = self.client.delete('/api/couches-wms/%d/' % c.pk)
        self.assertEqual(r.status_code, 200)
        self.assertFalse(CoucheWMS.objects.filter(pk=c.pk).exists())
