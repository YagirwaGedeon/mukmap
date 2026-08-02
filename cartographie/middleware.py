# -*- coding: utf-8 -*-
from django.utils import translation

from .i18n import LANGUES, LANGUE_PAR_DEFAUT


class LangueMiddleware:
    """Active la langue choisie (session ou cookie) pour toute l'application."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        codes = dict(LANGUES)
        langue = request.session.get('langue') or request.COOKIES.get('mukmap_langue') or LANGUE_PAR_DEFAUT
        if langue not in codes:
            langue = LANGUE_PAR_DEFAUT
        translation.activate(langue)
        request.LANGUAGE_CODE = langue
        response = self.get_response(request)
        translation.deactivate()
        return response


class NoCacheMiddleware:
    """Empêche le navigateur de servir une version en cache (ou du bfcache)
    des pages de l'application, qui sont dynamiques."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        ctype = response.get('Content-Type', '')
        if ctype.startswith('text/html'):
            response['Cache-Control'] = 'no-store, max-age=0, must-revalidate'
            response['Pragma'] = 'no-cache'
            response['Expires'] = '0'
        return response
