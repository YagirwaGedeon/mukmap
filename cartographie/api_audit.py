# -*- coding: utf-8 -*-
"""MUKMAP - API d'audit : historique d'un objet (point / ouvrage hydraulique).

L'historique est reconstitué à partir du JournalAudit via la convention
des libellés `details` : "Point #<pk> - ...", "Ouvrage #<pk> - ..." et
"Média #<pk> du point #<pk>".
"""

import re

from django.contrib.auth.decorators import login_required
from django.db.models import Q
from django.http import JsonResponse

from .models import JournalAudit


@login_required
def historique_objet(request):
    """GET /api/audit/objet/?type=point|ouvrage&pk=<id>

    Retourne les dernières entrées du journal d'audit relatives à l'objet
    (50 max), de la plus récente à la plus ancienne.
    """
    type_objet = request.GET.get('type', 'point')
    pk = request.GET.get('pk', '')
    if not pk or not pk.isdigit():
        return JsonResponse({'erreur': "Paramètre 'pk' (entier) obligatoire."}, status=400)
    if type_objet not in ('point', 'ouvrage'):
        return JsonResponse({'erreur': "Paramètre 'type' invalide (point|ouvrage)."}, status=400)

    nom_objet = 'Point' if type_objet == 'point' else 'Ouvrage'
    motif = re.compile(
        rf'(?:^| ){nom_objet} #{pk}(?!\d)|du point #{pk}(?!\d)',
        re.IGNORECASE,
    )
    base = JournalAudit.objects.filter(
        Q(details__istartswith=f"{nom_objet} #{pk}") | Q(details__icontains='du point #')
    ).order_by('-date')[:200]
    entree = [e for e in base if motif.search(e.details or '')][:50]

    return JsonResponse({'historique': [
        {
            'action': e.action,
            'details': e.details,
            'utilisateur': e.utilisateur.username if e.utilisateur else '',
            'date': e.date.isoformat(),
            'adresse_ip': e.adresse_ip or '',
        }
        for e in entree
    ]})
