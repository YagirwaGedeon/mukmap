# -*- coding: utf-8 -*-
"""Synchronisation mode hors connexion.

Protocole :
- Le client télécharge une zone (bbox) via api_points_lister et la stocke
  localement (IndexedDB) avec l'horodatage `dernier_sync` de chaque point.
- Les opérations locales (création / modification / suppression) sont mises
  en file (attente) puis envoyées en lot à POST /api/offline/sync/.
- Chaque opération transporte `base_updated` (updated_at du point au moment
  où le client l'a récupéré). Le serveur compare à sa propre valeur :
  différent → conflit (dernier écrit gagne n'est PAS appliqué : l'opération
  est renvoyée avec la version serveur pour résolution manuelle).
- La suppression est douce (soft-delete) pour rester récupérable et
  synchronisable.

Extensions :
- Tracés de conduite (module Adduction) : POST /api/offline/traces/ — même
  protocole (cree / modifie / supprime) sur TraceAdduction.
- Photos : POST /api/offline/photos/ (multipart) — rattache un fichier à un
  point créé hors ligne puis synchronisé.
"""

import json

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from .models import PointGeographique, ProjetAdduction, TraceAdduction
from .views import _audit, _creer_medias_point, _projet_actif
from .water_supply import _analyse_trace

CHAMPS_EDITION = ('nom', 'description', 'categorie', 'statut', 'province',
                  'commune', 'quartier', 'source_fichier', 'source_format')


def _champ_obligatoire(data, champ, convertir=None):
    valeur = data.get(champ)
    if valeur is None or valeur == '':
        return None
    if convertir is not None:
        try:
            return convertir(valeur)
        except (TypeError, ValueError):
            return None
    return valeur


def _appliquer_edition(p, data):
    for champ in CHAMPS_EDITION:
        if champ in data:
            valeur = str(data[champ])
            setattr(p, champ, valeur[:200] if champ in ('nom', 'source_fichier', 'source_format') else valeur)
    for champ in ('latitude', 'longitude'):
        valeur = _champ_obligatoire(data, champ, float)
        if valeur is not None:
            setattr(p, champ, valeur)
    precision = _champ_obligatoire(data, 'precision_gps_m', float)
    if precision is not None:
        p.precision_gps_m = precision
    if isinstance(data.get('donnees'), dict):
        p.donnees = {str(k): v for k, v in data['donnees'].items()}
    if data.get('synchro_id'):
        p.synchro_id = str(data['synchro_id'])[:64]


def _parse_updated(valeur):
    if not valeur:
        return None
    t = parse_datetime(str(valeur))
    if t is None:
        return None
    if timezone.is_naive(t):
        t = timezone.make_aware(t, timezone.get_current_timezone())
    return t


@login_required
def api_sync(request):
    """POST : synchronisation bidirectionnelle des points.

    Corps : {"dernier_sync": ISO|null, "operations": [
        {"type": "cree"|"modifie"|"supprime", "id": int|null, "base_updated": ISO|null,
         "point": {...}}
    ]}

    Réponse : {"ok": [...], "conflits": [...], "pulls": [...], "horloge": ISO}
    """
    if request.method != 'POST':
        return JsonResponse({'erreur': 'Méthode non autorisée.'}, status=405)
    try:
        data = json.loads(request.body or '{}')
    except ValueError:
        data = {}

    operations = data.get('operations')
    if not isinstance(operations, list):
        return JsonResponse({'erreur': 'Liste d\'opérations requise.'}, status=400)

    projet = _projet_actif(request)
    resultats = []
    conflits = []
    en_erreur = []

    for op in operations:
        if not isinstance(op, dict):
            continue
        type_op = op.get('type')
        point_data = op.get('point') or {}
        base_updated = _parse_updated(op.get('base_updated'))

        if type_op == 'cree':
            synchro_id = str(point_data.get('synchro_id') or '').strip()
            nom = str(point_data.get('nom') or '').strip()
            lat = _champ_obligatoire(point_data, 'latitude', float)
            lng = _champ_obligatoire(point_data, 'longitude', float)
            if not nom or lat is None or lng is None:
                en_erreur.append({'id': op.get('id'), 'type': 'cree',
                                  'raison': 'nom, latitude et longitude requis'})
                continue
            existant = None
            if synchro_id:
                existant = PointGeographique.objects.filter(synchro_id=synchro_id).first()
            if existant is not None:
                resultats.append({'id': existant.pk, 'type': 'cree', 'deja_existant': True,
                                  'updated_at': existant.updated_at.isoformat() if existant.updated_at else None})
                continue
            p = PointGeographique.objects.create(
                nom=nom[:200],
                description=str(point_data.get('description') or ''),
                latitude=lat,
                longitude=lng,
                precision_gps_m=_champ_obligatoire(point_data, 'precision_gps_m', float),
                categorie=str(point_data.get('categorie') or 'autre'),
                statut=str(point_data.get('statut') or 'actif'),
                province=str(point_data.get('province') or ''),
                commune=str(point_data.get('commune') or ''),
                quartier=str(point_data.get('quartier') or ''),
                projet=projet,
                donnees={k: v for k, v in (point_data.get('donnees') or {}).items()},
                synchro_id=synchro_id,
                auteur=request.user,
            )
            resultats.append({'id': p.pk, 'type': 'cree',
                              'updated_at': p.updated_at.isoformat()})
            continue

        pk = op.get('id')
        try:
            pk = int(pk)
        except (TypeError, ValueError):
            en_erreur.append({'id': pk, 'type': type_op, 'raison': 'identifiant invalide'})
            continue
        p = PointGeographique.objects.filter(pk=pk).first()
        if p is None:
            en_erreur.append({'id': pk, 'type': type_op, 'raison': 'point introuvable'})
            continue
        if p.auteur != request.user and not request.user.is_superuser:
            conflits.append({'id': pk, 'type': type_op, 'raison': 'autorisation',
                             'version_serveur': p.pk})
            continue

        if base_updated is not None and p.updated_at is not None and p.updated_at > base_updated:
            conflits.append({'id': pk, 'type': type_op,
                             'raison': 'conflit',
                             'version_serveur': {
                                 'id': p.pk, 'nom': p.nom,
                                 'latitude': p.latitude, 'longitude': p.longitude,
                                 'categorie': p.categorie, 'statut': p.statut,
                                 'province': p.province, 'commune': p.commune,
                                 'quartier': p.quartier, 'description': p.description,
                                 'donnees': p.donnees or {},
                                 'updated_at': p.updated_at.isoformat() if p.updated_at else None,
                             }})
            continue

        if type_op == 'modifie':
            _appliquer_edition(p, point_data)
            p.save()
            resultats.append({'id': p.pk, 'type': 'modifie',
                              'updated_at': p.updated_at.isoformat()})
        elif type_op == 'supprime':
            p.supprime = True
            p.save()
            resultats.append({'id': p.pk, 'type': 'supprime',
                              'updated_at': p.updated_at.isoformat()})
        else:
            en_erreur.append({'id': pk, 'type': type_op, 'raison': 'type inconnu'})

    if resultats:
        noms = ', '.join(f"#{r['id']}" for r in resultats[:5])
        _audit(request, "Synchronisation hors ligne",
               f"{len(resultats)} opération(s) appliquée(s) : {noms}"
               + (f" ; {len(conflits)} conflit(s)" if conflits else ''))

    # Pull : points modifiés depuis la dernière synchronisation connue du client.
    pulls = []
    dernier_sync = _parse_updated(data.get('dernier_sync'))
    if dernier_sync is not None:
        qs = PointGeographique.objects.select_related('projet', 'activite', 'auteur') \
            .filter(updated_at__gt=dernier_sync)[:500]
        from .api_points import _serialiser_point
        for p in qs:
            pulls.append({'type': 'supprime' if p.supprime else 'modifie',
                          'point': _serialiser_point(p)})

    return JsonResponse({
        'ok': resultats,
        'conflits': conflits,
        'en_erreur': en_erreur,
        'pulls': pulls,
        'horloge': timezone.now().isoformat(),
    })


# ─── Tracés de conduite (module Adduction) ──────────────────────────

CHAMPS_TRACE = ('nom', 'description', 'observations')


def _serialiser_trace(t):
    return {
        'id': t.pk,
        'nom': t.nom,
        'description': t.description,
        'coordonnees': t.coordonnees,
        'longueur_m': t.longueur_m,
        'denivelee_m': t.denivelee_m,
        'observations': t.observations,
        'projet_id': t.projet_id,
        'synchro_id': t.synchro_id,
        'updated_at': t.updated_at.isoformat() if t.updated_at else None,
    }


def _appliquer_trace(t, data):
    for champ in CHAMPS_TRACE:
        if champ in data:
            valeur = str(data[champ])
            setattr(t, champ, valeur[:250] if champ == 'nom' else valeur)
    coordonnees = data.get('coordonnees')
    if isinstance(coordonnees, list) and len(coordonnees) >= 2:
        longueur, denivelee = _analyse_trace(coordonnees)
        t.coordonnees = coordonnees
        t.longueur_m = round(longueur, 1)
        t.denivelee_m = round(denivelee, 1)
    if data.get('synchro_id'):
        t.synchro_id = str(data['synchro_id'])[:64]
    return t


@login_required
def api_traces_sync(request):
    """POST : synchronisation bidirectionnelle des tracés de conduites.

    Corps : {"dernier_sync": ISO|null, "operations": [
        {"type": "cree"|"modifie"|"supprime", "id": int|null,
         "base_updated": ISO|null, "trace": {...}}
    ]}

    Réponse : {"ok": [...], "conflits": [...], "en_erreur": [...],
               "pulls": [...], "horloge": ISO}
    """
    if request.method != 'POST':
        return JsonResponse({'erreur': 'Méthode non autorisée.'}, status=405)
    try:
        data = json.loads(request.body or '{}')
    except ValueError:
        data = {}

    operations = data.get('operations')
    if not isinstance(operations, list):
        return JsonResponse({'erreur': 'Liste d\'opérations requise.'}, status=400)

    resultats = []
    conflits = []
    en_erreur = []

    for op in operations:
        if not isinstance(op, dict):
            continue
        type_op = op.get('type')
        trace_data = op.get('trace') or {}
        base_updated = _parse_updated(op.get('base_updated'))

        if type_op == 'cree':
            synchro_id = str(trace_data.get('synchro_id') or '').strip()
            coordonnees = trace_data.get('coordonnees')
            if not isinstance(coordonnees, list) or len(coordonnees) < 2:
                en_erreur.append({'id': op.get('id'), 'type': 'cree',
                                  'raison': 'coordonnees : au moins 2 points requis'})
                continue
            projet_id = trace_data.get('projet_id') or data.get('projet_id')
            projet = None
            if projet_id:
                projet = ProjetAdduction.objects.filter(pk=projet_id).first()
            if projet is None:
                projet = ProjetAdduction.objects.order_by('pk').first()
            if projet is None:
                en_erreur.append({'id': op.get('id'), 'type': 'cree',
                                  'raison': 'aucun projet adduction disponible'})
                continue
            existant = None
            if synchro_id:
                existant = TraceAdduction.objects.filter(synchro_id=synchro_id).first()
            if existant is not None:
                resultats.append({'id': existant.pk, 'type': 'cree', 'deja_existant': True,
                                  'updated_at': existant.updated_at.isoformat() if existant.updated_at else None})
                continue
            longueur, denivelee = _analyse_trace(coordonnees)
            t = TraceAdduction.objects.create(
                projet=projet,
                nom=str(trace_data.get('nom') or '')[:250],
                description=str(trace_data.get('description') or ''),
                coordonnees=coordonnees,
                longueur_m=round(longueur, 1),
                denivelee_m=round(denivelee, 1),
                observations=str(trace_data.get('observations') or ''),
                synchro_id=synchro_id,
                auteur=request.user,
            )
            resultats.append({'id': t.pk, 'type': 'cree',
                              'updated_at': t.updated_at.isoformat()})
            continue

        pk = op.get('id')
        try:
            pk = int(pk)
        except (TypeError, ValueError):
            en_erreur.append({'id': pk, 'type': type_op, 'raison': 'identifiant invalide'})
            continue
        t = TraceAdduction.objects.filter(pk=pk).first()
        if t is None:
            en_erreur.append({'id': pk, 'type': type_op, 'raison': 'tracé introuvable'})
            continue
        if t.auteur_id and t.auteur_id != request.user.pk and not request.user.is_superuser:
            conflits.append({'id': pk, 'type': type_op, 'raison': 'autorisation',
                             'version_trace': _serialiser_trace(t)})
            continue

        if base_updated is not None and t.updated_at is not None and t.updated_at > base_updated:
            conflits.append({'id': pk, 'type': type_op, 'raison': 'conflit',
                             'version_trace': _serialiser_trace(t)})
            continue

        if type_op == 'modifie':
            _appliquer_trace(t, trace_data)
            t.save()
            resultats.append({'id': t.pk, 'type': 'modifie',
                              'updated_at': t.updated_at.isoformat()})
        elif type_op == 'supprime':
            t.delete()
            resultats.append({'id': pk, 'type': 'supprime'})
        else:
            en_erreur.append({'id': pk, 'type': type_op, 'raison': 'type inconnu'})

    # Pull : tracés modifiés depuis la dernière synchronisation connue.
    pulls = []
    derniere_sync = _parse_updated(data.get('dernier_sync'))
    if derniere_sync is not None:
        qs = TraceAdduction.objects.filter(updated_at__gt=derniere_sync)[:500]
        for t in qs:
            pulls.append({'type': 'modifie', 'trace': _serialiser_trace(t)})

    return JsonResponse({
        'ok': resultats,
        'conflits': conflits,
        'en_erreur': en_erreur,
        'pulls': pulls,
        'horloge': timezone.now().isoformat(),
    })


# ─── Photos rattachées à un point (collecte hors connexion) ────────


@csrf_exempt
@require_POST
@login_required
def api_photo_upload(request):
    """POST multipart : fichier + point d'un média capturé hors ligne.

    Champs : point (id du point, déjà synchronisé), fichier,
    commentaire (optionnel), date_prise (ISO, optionnel).
    """
    point_id = request.POST.get('point_id') or request.POST.get('point')
    try:
        point_id = int(point_id)
    except (TypeError, ValueError):
        return JsonResponse({'erreur': 'point_id requis.'}, status=400)
    point = PointGeographique.objects.filter(pk=point_id).first()
    if point is None:
        return JsonResponse({'erreur': 'point introuvable'}, status=404)
    if point.auteur_id and point.auteur_id != request.user.pk and not request.user.is_superuser:
        return JsonResponse({'erreur': 'autorisation refusée'}, status=403)
    fichiers = request.FILES.getlist('fichier')
    if not fichiers:
        return JsonResponse({'erreur': 'fichier requis.'}, status=400)
    date_prise = None
    if request.POST.get('date_prise'):
        date_prise = _parse_updated(request.POST.get('date_prise')) or None
    _creer_medias_point(point, fichiers, request.user,
                        commentaire=request.POST.get('commentaire') or '',
                        date_prise_defaut=date_prise or timezone.now())
    _audit(request, "Photo hors connexion",
           f"{len(fichiers)} fichier(s) rattaché(s) au point #{point.pk} - {point.nom}")
    return JsonResponse({'ok': True, 'point_id': point.pk})
