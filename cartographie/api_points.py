# -*- coding: utf-8 -*-
"""API JSON de la table attributaire professionnelle (points).

Filtres : AND/OR, plages de dates, valeurs numériques, recherche textuelle,
filtre spatial (bbox), colonnes dynamiques issues du champ JSON « donnees ».
"""

import json
import math
import csv
import io

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.contrib.auth.models import User

from .models import PointGeographique
from .views import _projet_actif, _audit, _valider_coordonnees_wgs84


def _float_ou_nul(valeur):
    """Float si convertible, sinon None (précision GPS facultative)."""
    if valeur is None or valeur == '':
        return None
    try:
        return float(valeur)
    except (TypeError, ValueError):
        return None

# ─── Registre des colonnes du modèle ─────────────────────────────
# type : text | nb | date | choix | fkey
CHAMPS_MODELE = {
    'code': 'text',
    'identifiant': 'text',
    'nom': 'text',
    'description': 'text',
    'latitude': 'nb',
    'longitude': 'nb',
    'precision_gps_m': 'nb',
    'altitude': 'nb',
    'adresse': 'text',
    'categorie': 'choix',
    'statut': 'choix',
    'etat_avancement': 'text',
    'province': 'text',
    'territoire': 'text',
    'commune': 'text',
    'secteur': 'text',
    'quartier': 'text',
    'village': 'text',
    'observations': 'text',
    'date_creation': 'date',
    'date_visite': 'date',
    'source_fichier': 'text',
    'source_format': 'text',
    'projet': 'fkey',
    'activite': 'fkey',
    'auteur': 'fkey',
    'agent': 'fkey',
}

CHOIX_CATEGORIE = dict(PointGeographique.CATEGORIE_CHOICES)
CHOIX_STATUT = dict(PointGeographique.STATUT_CHOICES)

MAX_PAGE = 200
MAX_EXPORT = 5000
MAX_SCAN_COLONNES = 3000

# Champs triables directement en SQL (ordre SQL équivalent au tri Python).
ORDRE_SQL = {
    'code': 'code', 'identifiant': 'identifiant',
    'nom': 'nom', 'description': 'description',
    'latitude': 'latitude', 'longitude': 'longitude',
    'precision_gps_m': 'precision_gps_m', 'altitude': 'altitude',
    'categorie': 'categorie', 'statut': 'statut', 'etat_avancement': 'etat_avancement',
    'province': 'province', 'territoire': 'territoire', 'commune': 'commune',
    'secteur': 'secteur', 'quartier': 'quartier', 'village': 'village',
    'adresse': 'adresse', 'observations': 'observations',
    'date_creation': 'date_creation', 'date_visite': 'date_visite',
    'source_fichier': 'source_fichier', 'source_format': 'source_format',
}


# ─── Helpers ─────────────────────────────────────────────────────


def _type_champ(champ):
    if champ.startswith('d:'):
        return 'json'
    return CHAMPS_MODELE.get(champ, 'json')


def _valeur_ligne(p, champ):
    """Valeur d'un champ (modèle ou clé JSON « d:cle ») pour un point."""
    if champ.startswith('d:'):
        cle = champ[2:]
        return str((p.donnees or {}).get(cle, '') or '')
    if champ == 'projet':
        return p.projet.nom if p.projet else ''
    if champ == 'activite':
        return p.activite.nom_activite if p.activite else ''
    if champ == 'auteur':
        if p.auteur:
            return p.auteur.get_full_name() or p.auteur.username
        return ''
    if champ == 'agent':
        if p.agent:
            return p.agent.get_full_name() or p.agent.username
        return ''
    if champ == 'date_creation':
        return p.date_creation.strftime('%d/%m/%Y %H:%M')
    if champ == 'date_visite':
        return p.date_visite.strftime('%d/%m/%Y %H:%M') if p.date_visite else ''
    val = getattr(p, champ, '')
    return val if val is not None else ''


def _normaliser_date(v):
    """'YYYY-MM-DD' -> date, sinon None."""
    if not v:
        return None
    v = str(v).strip()
    if len(v) == 10 and v[4] == '-' and v[7] == '-':
        try:
            from datetime import date
            return date.fromisoformat(v)
        except ValueError:
            return None
    return None


def _comparer_op(valeur, op, attendu):
    """Applique un opérateur sur une valeur déjà extraite (comparaison naive)."""
    if op == 'vide':
        return valeur == '' or valeur is None
    if op == 'non_vide':
        return valeur != '' and valeur is not None
    if op == 'eq':
        return str(valeur) == str(attendu)
    if op == 'ne':
        return str(valeur) != str(attendu)
    if op == 'contient':
        return str(attendu).lower() in str(valeur).lower()
    if op == 'commence':
        return str(valeur).lower().startswith(str(attendu).lower())
    if op == 'finit':
        return str(valeur).lower().endswith(str(attendu).lower())
    if op == 'dans':
        return str(valeur) in {str(x) for x in (attendu or [])}
    if op in ('entre', 'sup', 'inf'):
        try:
            n = float(valeur)
            numerique = True
        except (TypeError, ValueError):
            numerique = False
        if op == 'entre' and isinstance(attendu, (list, tuple)) and len(attendu) == 2:
            try:
                a, b = float(attendu[0]), float(attendu[1])
                return numerique and a <= n <= b
            except (TypeError, ValueError):
                return False
        if op == 'sup':
            try:
                return numerique and n >= float(attendu)
            except (TypeError, ValueError):
                return False
        if op == 'inf':
            try:
                return numerique and n <= float(attendu)
            except (TypeError, ValueError):
                return False
    return False


def _filtres_dans(qs, filtres):
    """Construit un Q (SQL) pour les filtres sur champs du modèle. Retourne (qs, restants)."""
    from django.db.models import Q
    logique = filtres.get('logique', 'et')
    liste = filtres.get('filtres') or []
    q_total = None
    restants = []
    for f in liste:
        champ = f.get('champ', '')
        op = f.get('op', 'eq')
        attendu = f.get('valeur', '')
        if champ.startswith('d:') or champ not in CHAMPS_MODELE:
            restants.append(f)
            continue
        q = None
        if champ == 'projet':
            if op == 'eq':
                q = Q(projet__nom__iexact=str(attendu))
            elif op == 'contient':
                q = Q(projet__nom__icontains=str(attendu))
            elif op == 'vide':
                q = Q(projet__isnull=True)
            elif op == 'non_vide':
                q = Q(projet__isnull=False)
            elif op == 'dans':
                q = Q(projet__nom__in=[str(x) for x in (attendu or [])])
        elif champ == 'activite':
            if op == 'eq':
                q = Q(activite__nom_activite__iexact=str(attendu))
            elif op == 'contient':
                q = Q(activite__nom_activite__icontains=str(attendu))
            elif op == 'vide':
                q = Q(activite__isnull=True)
            elif op == 'non_vide':
                q = Q(activite__isnull=False)
        elif champ == 'auteur':
            if op == 'eq':
                q = (Q(auteur__username__iexact=str(attendu))
                     | Q(auteur__first_name__icontains=str(attendu))
                     | Q(auteur__last_name__icontains=str(attendu)))
            elif op == 'vide':
                q = Q(auteur__isnull=True)
            elif op == 'non_vide':
                q = Q(auteur__isnull=False)
        elif champ == 'date_creation':
            if op == 'entre' and isinstance(attendu, (list, tuple)) and len(attendu) == 2:
                d1, d2 = _normaliser_date(attendu[0]), _normaliser_date(attendu[1])
                if d1:
                    q = Q(date_creation__date__gte=d1)
                if d2:
                    q2 = Q(date_creation__date__lte=d2)
                    q = q & q2 if q else q2
            elif op == 'sup':
                d = _normaliser_date(attendu)
                if d:
                    q = Q(date_creation__date__gte=d)
            elif op == 'inf':
                d = _normaliser_date(attendu)
                if d:
                    q = Q(date_creation__date__lte=d)
        elif champ in ('latitude', 'longitude'):
            try:
                if op == 'entre' and isinstance(attendu, (list, tuple)) and len(attendu) == 2:
                    q = Q(**{f'{champ}__gte': float(attendu[0]), f'{champ}__lte': float(attendu[1])})
                elif op == 'sup':
                    q = Q(**{f'{champ}__gte': float(attendu)})
                elif op == 'inf':
                    q = Q(**{f'{champ}__lte': float(attendu)})
                elif op == 'eq':
                    q = Q(**{champ: float(attendu)})
            except (TypeError, ValueError):
                q = None
        elif champ in ('categorie', 'statut'):
            if op == 'eq':
                q = Q(**{champ: str(attendu)})
            elif op == 'dans':
                q = Q(**{champ + '__in': [str(x) for x in (attendu or [])]})
            elif op == 'ne':
                q = ~Q(**{champ: str(attendu)})
            elif op == 'vide':
                q = Q(**{champ: ''})
            elif op == 'non_vide':
                q = ~Q(**{champ: ''})
        else:  # champs texte
            if op == 'eq':
                q = Q(**{champ + '__iexact': str(attendu)})
            elif op == 'contient':
                q = Q(**{champ + '__icontains': str(attendu)})
            elif op == 'commence':
                q = Q(**{champ + '__istartswith': str(attendu)})
            elif op == 'finit':
                q = Q(**{champ + '__iendswith': str(attendu)})
            elif op == 'dans':
                q = Q(**{champ + '__in': [str(x) for x in (attendu or [])]})
            elif op == 'vide':
                q = Q(**{champ + '__in': ['', None]})
            elif op == 'non_vide':
                q = ~Q(**{champ: ''})
        if q is not None:
            q_total = q_total & q if q_total and logique == 'et' else (q_total | q if q_total and logique == 'ou' else q)
    return (qs.filter(q_total) if q_total is not None else qs), restants


def _evaluer_filtre(p, f):
    """Évaluation uniforme d'un filtre (modèle ou JSON « d: ») sur un point."""
    champ = f.get('champ', '')
    op = f.get('op', 'eq')
    attendu = f.get('valeur', '')
    if champ.startswith('d:'):
        brut = (p.donnees or {}).get(champ[2:], '')
        return _comparer_op(brut if brut is not None else '', op, attendu)
    if champ in ('latitude', 'longitude'):
        return _comparer_op(getattr(p, champ), op, attendu)
    if champ == 'date_creation':
        valeur = p.date_creation.strftime('%Y-%m-%d')
        if op in ('entre', 'sup', 'inf') and isinstance(attendu, (list, tuple)):
            attendu = [str(x)[:10] for x in attendu] if isinstance(attendu[0], (list, tuple)) else [str(x)[:10] for x in attendu]
        elif isinstance(attendu, (list, tuple)):
            attendu = [str(x)[:10] for x in attendu]
        else:
            attendu = str(attendu)[:10]
        return _comparer_op(valeur, op, attendu)
    return _comparer_op(_valeur_ligne(p, champ), op, attendu)


def _lignes_filtrees(request, tri_champ=None, tri_dir='desc'):
    """Retourne la liste de points conforme à : q, bbox, filtres (AND/OR).

    Les champs du modèle passent par SQL (rapide) ; en mode OU avec filtres
    JSON mélangés, tout est évalué en Python pour garantir l'union exacte.
    Le tri SQL est appliqué pour les champs du modèle (ORDRE_SQL) — le tri
    JSON reste en Python (côté vue).
    """
    q = request.GET.get('q', '').strip()
    bbox = None
    try:
        bbox = [float(x) for x in (request.GET.get('bbox') or '').split(',')]
    except ValueError:
        bbox = None
    filtres = {'logique': 'et', 'filtres': []}
    try:
        data = json.loads(request.GET.get('filtres', 'null') or 'null') or {}
        if isinstance(data, dict):
            filtres['logique'] = data.get('logique', 'et')
            if isinstance(data.get('filtres'), list):
                filtres['filtres'] = data['filtres']
    except (ValueError, TypeError):
        pass

    liste_filtres = filtres['filtres']
    logique = filtres['logique']
    json_dans_ou = logique == 'ou' and any(
        not f.get('champ', '').startswith('d:') and f.get('champ') in CHAMPS_MODELE
        for f in liste_filtres)

    qs = PointGeographique.objects.select_related('projet', 'activite', 'auteur').all()

    if tri_champ in ORDRE_SQL:
        qs = qs.order_by(('-' if tri_dir == 'desc' else '') + ORDRE_SQL[tri_champ])

    # Hors connexion / synchronisation : masquer les points supprimés,
    # sauf demande explicite (pulls de synchronisation).
    if request.GET.get('supprimes') not in ('1', 'true'):
        qs = qs.filter(supprime=False)

    # Synchronisation incrémentale : uniquement les modifications depuis un instant.
    modifie_depuis = (request.GET.get('modifie_depuis') or '').strip()
    if modifie_depuis:
        from django.utils.dateparse import parse_datetime
        t = parse_datetime(modifie_depuis)
        if t is not None:
            qs = qs.filter(updated_at__gt=t)

    ids = request.GET.get('ids', '').strip()
    if ids:
        try:
            qs = qs.filter(pk__in=[int(x) for x in ids.split(',') if x.strip()])
        except (TypeError, ValueError):
            pass
    if json_dans_ou:
        # Union exacte : SQL ne suffit pas → évaluation Python de tous les filtres
        qs = _appliquer_bbox(qs, bbox)
        qs = _recherche_q(qs, q)
        lignes = list(qs)
        if liste_filtres:
            lignes = [p for p in lignes
                      if any(_evaluer_filtre(p, f) for f in liste_filtres)]
        return lignes

    qs, restants = _filtres_dans(qs, filtres)
    qs = _appliquer_bbox(qs, bbox)
    qs = _recherche_q(qs, q)
    lignes = list(qs)
    for f in restants:
        if f.get('champ', '').startswith('d:'):
            lignes = [p for p in lignes if _evaluer_filtre(p, f)]
    return lignes


def _appliquer_bbox(qs, bbox):
    if not bbox or len(bbox) != 4:
        return qs
    try:
        lon_min, lat_min, lon_max, lat_max = (float(x) for x in bbox)
    except (TypeError, ValueError):
        return qs
    return qs.filter(longitude__gte=lon_min, longitude__lte=lon_max,
                     latitude__gte=lat_min, latitude__lte=lat_max)


def _recherche_q(qs, q):
    q = (q or '').strip()
    if not q:
        return qs
    from django.db.models import Q
    termes = [t for t in q.split() if t]
    if not termes:
        return qs
    q_total = None
    for t in termes:
        qq = (Q(nom__icontains=t) | Q(description__icontains=t)
              | Q(code__icontains=t) | Q(identifiant__icontains=t)
              | Q(adresse__icontains=t) | Q(village__icontains=t)
              | Q(territoire__icontains=t) | Q(secteur__icontains=t)
              | Q(province__icontains=t) | Q(commune__icontains=t)
              | Q(quartier__icontains=t) | Q(source_fichier__icontains=t)
              | Q(projet__nom__icontains=t) | Q(auteur__first_name__icontains=t)
              | Q(auteur__last_name__icontains=t) | Q(auteur__username__icontains=t))
        q_total = qq if q_total is None else q_total & qq
    return qs.filter(q_total) if q_total is not None else qs


def _serialiser_point(p):
    return {
        'id': p.pk,
        'code': p.code,
        'identifiant': p.identifiant,
        'nom': p.nom,
        'description': p.description,
        'latitude': p.latitude,
        'longitude': p.longitude,
        'precision_gps_m': p.precision_gps_m,
        'altitude': p.altitude,
        'adresse': p.adresse,
        'categorie': p.categorie,
        'categorie_label': CHOIX_CATEGORIE.get(p.categorie, p.categorie),
        'statut': p.statut,
        'statut_label': CHOIX_STATUT.get(p.statut, p.statut),
        'etat_avancement': p.etat_avancement,
        'province': p.province,
        'territoire': p.territoire,
        'commune': p.commune,
        'secteur': p.secteur,
        'quartier': p.quartier,
        'village': p.village,
        'observations': p.observations,
        'projet': p.projet.nom if p.projet else '',
        'projet_id': p.projet_id,
        'activite': p.activite.nom_activite if p.activite else '',
        'auteur': (p.auteur.get_full_name() or p.auteur.username) if p.auteur else '',
        'agent': (p.agent.get_full_name() or p.agent.username) if p.agent else '',
        'date_creation': p.date_creation.strftime('%d/%m/%Y %H:%M'),
        'date_visite': p.date_visite.strftime('%d/%m/%Y %H:%M') if p.date_visite else '',
        'updated_at': p.updated_at.isoformat() if p.updated_at else None,
        'supprime': bool(p.supprime),
        'archive': bool(p.archive),
        'synchro_id': p.synchro_id,
        'donnees': p.donnees or {},
        'source_fichier': p.source_fichier,
        'source_format': p.source_format,
    }


def _colonnes_disponibles(lignes):
    """Colonnes du modèle + clés JSON (donnees) triées par fréquence décroissante."""
    frequences = {}
    for p in lignes[:MAX_SCAN_COLONNES]:
        for cle in (p.donnees or {}):
            frequences[cle] = frequences.get(cle, 0) + 1
    cles = [{'champ': 'd:' + c, 'type': 'json', 'frequence': f}
            for c, f in sorted(frequences.items(), key=lambda x: -x[1])]
    modele = [{'champ': c, 'type': t, 'frequence': 1000000 - i}
              for i, (c, t) in enumerate(CHAMPS_MODELE.items())]
    return modele + cles


def _detecter_type_valeurs(valeurs):
    """Type heuristique (nb/date/text) à partir d'échantillons de valeurs."""
    if not valeurs:
        return 'text'
    numeriques = 0
    dates = 0
    total = 0
    for v in valeurs[:200]:
        s = str(v or '').strip()
        if not s:
            continue
        total += 1
        try:
            float(s)
            numeriques += 1
        except ValueError:
            pass
        if _normaliser_date(s):
            dates += 1
    if total and numeriques / total >= 0.8:
        return 'nb'
    if total and dates / total >= 0.8:
        return 'date'
    return 'text'


def _stats_lignes(lignes, colonnes):
    stats = {
        'total': len(lignes),
        'par_categorie': {},
        'par_statut': {},
        'par_province': {},
        'numeriques': {},
        'date_min': None,
        'date_max': None,
    }
    valeurs_num = {}
    cles_num = [c['champ'] for c in colonnes if c['type'] == 'nb']
    for c in cles_num:
        valeurs_num[c] = []
    for p in lignes:
        cat = CHOIX_CATEGORIE.get(p.categorie, p.categorie or '—')
        stats['par_categorie'][cat] = stats['par_categorie'].get(cat, 0) + 1
        st = CHOIX_STATUT.get(p.statut, p.statut or '—')
        stats['par_statut'][st] = stats['par_statut'].get(st, 0) + 1
        prov = p.province or 'Non renseignée'
        stats['par_province'][prov] = stats['par_province'].get(prov, 0) + 1
        if stats['date_min'] is None or p.date_creation < stats['date_min']:
            stats['date_min'] = p.date_creation
        if stats['date_max'] is None or p.date_creation > stats['date_max']:
            stats['date_max'] = p.date_creation
        for c in cles_num:
            if c.startswith('d:'):
                v = (p.donnees or {}).get(c[2:], '')
            else:
                v = getattr(p, c, '')
            try:
                valeurs_num[c].append(float(v))
            except (TypeError, ValueError):
                pass
    for c, vals in valeurs_num.items():
        if vals:
            stats['numeriques'][c] = {
                'min': min(vals), 'max': max(vals),
                'moyenne': round(sum(vals) / len(vals), 4),
                'somme': round(sum(vals), 4),
                'count': len(vals),
            }
    if stats['date_min']:
        stats['date_min'] = stats['date_min'].strftime('%Y-%m-%d')
        stats['date_max'] = stats['date_max'].strftime('%Y-%m-%d')
    return stats


def _facettes(lignes, colonnes):
    """Valeurs distinctes (avec comptage) pour les champs de filtrage rapide."""
    priorites = ['categorie', 'statut', 'province', 'territoire', 'commune', 'secteur',
                 'quartier', 'village', 'projet', 'auteur', 'agent',
                 'source_fichier', 'source_format']
    facettes = {}
    for champ in priorites:
        comptes = {}
        for p in lignes:
            v = _valeur_ligne(p, champ)
            if v == '':
                v = '—'
            comptes[v] = comptes.get(v, 0) + 1
        if comptes:
            facettes[champ] = [
                {'valeur': v, 'total': t}
                for v, t in sorted(comptes.items(), key=lambda x: -x[1])
            ]
    for c in colonnes:
        if c['type'] == 'json':
            comptes = {}
            for p in lignes[:MAX_SCAN_COLONNES]:
                v = str((p.donnees or {}).get(c['champ'][2:], '') or '')
                if v == '':
                    continue
                comptes[v] = comptes.get(v, 0) + 1
            if comptes:
                facettes[c['champ']] = [
                    {'valeur': v, 'total': t}
                    for v, t in sorted(comptes.items(), key=lambda x: -x[1])[:40]
                ]
    return facettes


# ─── Vues ────────────────────────────────────────────────────────


@login_required
def api_points_lister(request):
    """GET : recherche, tri, pagination, filtres (AND/OR), bbox, facettes, stats, colonnes."""
    try:
        page = max(1, int(request.GET.get('page', 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = max(1, min(MAX_PAGE, int(request.GET.get('page_size', 50))))
    except (TypeError, ValueError):
        page_size = 50
    tri_champ = request.GET.get('tri', 'date_creation')
    tri_dir = 'desc' if request.GET.get('direction', 'desc') == 'desc' else 'asc'
    q = request.GET.get('q', '').strip()

    lignes = _lignes_filtrees(request, tri_champ, tri_dir)

    # Tri Python — réservé aux champs JSON (d:...) et aux clés étrangères
    # (projet, activite, auteur) dont le tri SQL ne reproduit pas l'ordre exact.
    if tri_champ not in ORDRE_SQL:
        if tri_champ.startswith('d:'):
            def _cle_tri(p):
                return str((p.donnees or {}).get(tri_champ[2:], '') or '')
            lignes.sort(key=_cle_tri, reverse=(tri_dir == 'desc'))
        elif tri_champ in ('latitude', 'longitude'):
            lignes.sort(key=lambda p: (getattr(p, tri_champ) or 0), reverse=(tri_dir == 'desc'))
        elif tri_champ == 'date_creation':
            lignes.sort(key=lambda p: p.date_creation, reverse=(tri_dir == 'desc'))
        else:
            lignes.sort(key=lambda p: str(_valeur_ligne(p, tri_champ)).lower(),
                        reverse=(tri_dir == 'desc'))

    total = len(lignes)
    pages = max(1, math.ceil(total / page_size)) if total else 1
    debut = (page - 1) * page_size
    lignes_page = lignes[debut:debut + page_size]

    reponse = {
        'count': total,
        'page': page,
        'pages': pages,
        'page_size': page_size,
        'results': [_serialiser_point(p) for p in lignes_page],
    }

    if request.GET.get('apercu') in ('1', 'true'):
        colonnes = _colonnes_disponibles(lignes)
        reponse['colonnes'] = colonnes
        reponse['stats'] = _stats_lignes(lignes, colonnes)
        reponse['facettes'] = _facettes(lignes, colonnes)
    return JsonResponse(reponse)


@login_required
def api_points_creer(request):
    """POST : création d'un point (JSON)."""
    if request.method != 'POST':
        return JsonResponse({'erreur': 'Méthode non autorisée.'}, status=405)
    try:
        data = json.loads(request.body or '{}')
    except ValueError:
        data = {}
    nom = str(data.get('nom') or '').strip()
    lat, lng = _valider_coordonnees_wgs84(data.get('latitude'), data.get('longitude'))
    if lat is None:
        return JsonResponse({'erreur': 'Latitude et longitude numériques requises (WGS84 : lat -90 à 90, lon -180 à 180).'}, status=400)
    if not nom:
        return JsonResponse({'erreur': 'Le nom est obligatoire.'}, status=400)

    projet = _projet_actif(request)
    synchro_id = str(data.get('synchro_id') or '').strip()
    if synchro_id:
        existant = PointGeographique.objects.filter(synchro_id=synchro_id).first()
        if existant is not None:
            return JsonResponse({'ok': True, 'deja_existant': True, 'id': existant.pk,
                                 'result': _serialiser_point(existant)})
    p = PointGeographique.objects.create(
        nom=nom[:200],
        code=str(data.get('code') or '')[:30],
        identifiant=str(data.get('identifiant') or '')[:64],
        description=str(data.get('description') or ''),
        latitude=lat,
        longitude=lng,
        precision_gps_m=_float_ou_nul(data.get('precision_gps_m')),
        altitude=_float_ou_nul(data.get('altitude')),
        adresse=str(data.get('adresse') or ''),
        categorie=str(data.get('categorie') or 'autre'),
        statut=str(data.get('statut') or 'nouveau'),
        etat_avancement=str(data.get('etat_avancement') or '')[:40],
        province=str(data.get('province') or ''),
        territoire=str(data.get('territoire') or ''),
        commune=str(data.get('commune') or ''),
        secteur=str(data.get('secteur') or ''),
        quartier=str(data.get('quartier') or ''),
        village=str(data.get('village') or ''),
        observations=str(data.get('observations') or ''),
        projet=projet,
        donnees={k: v for k, v in (data.get('donnees') or {}).items()},
        synchro_id=synchro_id,
        auteur=request.user,
    )
    if data.get('agent'):
        agent = User.objects.filter(pk=data['agent']).first()
        if agent:
            p.agent = agent
            p.save(update_fields=['agent'])
    from .models import HistoriquePoint
    HistoriquePoint.objects.create(point=p, type='creation',
                                   action=f"Point créé (table) : {p.code or p.nom}",
                                   utilisateur=request.user)
    _audit(request, "Création de point (table)", f"Point #{p.pk} - {p.nom}")
    return JsonResponse({'ok': True, 'id': p.pk, 'result': _serialiser_point(p)}, status=201)


@login_required
def api_point_modifier(request, pk):
    """POST : modification d'un point (JSON). Contrôle auteur/admin."""
    if request.method != 'POST':
        return JsonResponse({'erreur': 'Méthode non autorisée.'}, status=405)
    p = PointGeographique.objects.filter(pk=pk).select_related('projet', 'auteur').first()
    if p is None:
        return JsonResponse({'erreur': 'Point introuvable.'}, status=404)
    if p.auteur != request.user and not request.user.is_superuser:
        return JsonResponse({'erreur': "Vous ne pouvez modifier que vos propres points."}, status=403)
    try:
        data = json.loads(request.body or '{}')
    except ValueError:
        data = {}
    for champ in ('nom', 'description', 'categorie', 'statut', 'province', 'commune', 'quartier',
                  'source_fichier', 'source_format', 'code', 'identifiant', 'adresse',
                  'territoire', 'secteur', 'village', 'observations', 'etat_avancement'):
        if champ in data:
            setattr(p, champ, str(data[champ])[:200] if champ in ('nom', 'source_fichier', 'source_format') else str(data[champ]))
    for champ in ('latitude', 'longitude'):
        if champ in data:
            try:
                valeur = float(data[champ])
            except (TypeError, ValueError):
                return JsonResponse({'erreur': f'Valeur invalide pour {champ}.'}, status=400)
            if champ == 'latitude':
                if not (-90 <= valeur <= 90):
                    return JsonResponse({'erreur': 'Latitude hors plage WGS84 (-90 à 90).'}, status=400)
            elif not (-180 <= valeur <= 180):
                return JsonResponse({'erreur': 'Longitude hors plage WGS84 (-180 à 180).'}, status=400)
            setattr(p, champ, valeur)
    if 'precision_gps_m' in data:
        p.precision_gps_m = _float_ou_nul(data['precision_gps_m'])
    if 'altitude' in data:
        p.altitude = _float_ou_nul(data['altitude'])
    if 'agent' in data:
        agent = User.objects.filter(pk=data['agent']).first()
        p.agent = agent
    if 'archive' in data:
        p.archive = bool(data['archive'])
    if isinstance(data.get('donnees'), dict):
        p.donnees = {str(k): v for k, v in data['donnees'].items()}
    p.save()
    from .models import HistoriquePoint
    HistoriquePoint.objects.create(point=p, type='modification',
                                   action=f"Point modifié (table) : {p.code or p.nom}",
                                   utilisateur=request.user)
    _audit(request, "Modification de point (table)", f"Point #{pk}")
    return JsonResponse({'ok': True, 'result': _serialiser_point(p)})


@login_required
def api_points_supprimer(request):
    """POST : suppression (JSON {ids:[...]}) — contrôle auteur/admin."""
    if request.method != 'POST':
        return JsonResponse({'erreur': 'Méthode non autorisée.'}, status=405)
    try:
        data = json.loads(request.body or '{}')
    except ValueError:
        data = {}
    ids = data.get('ids') or []
    try:
        ids = [int(x) for x in ids]
    except (TypeError, ValueError):
        return JsonResponse({'erreur': 'Liste d\'identifiants invalide.'}, status=400)
    if not ids:
        return JsonResponse({'erreur': 'Aucun point sélectionné.'}, status=400)
    points = PointGeographique.objects.filter(pk__in=ids)
    if not request.user.is_superuser:
        points = points.filter(auteur=request.user)
    supprimes = list(points.values_list('pk', flat=True))
    points.delete()
    _audit(request, "Suppression de points (table)", f"{len(supprimes)} point(s) : {supprimes}")
    return JsonResponse({'ok': True, 'supprimes': supprimes})


@login_required
def api_points_export(request, format):
    """GET : export CSV / GeoJSON / JSON des points filtrés (limite MAX_EXPORT)."""
    lignes = _lignes_filtrees(request)[:MAX_EXPORT]
    if format == 'geojson':
        features = [{
            'type': 'Feature',
            'id': p.pk,
            'properties': _serialiser_point(p),
            'geometry': {'type': 'Point', 'coordinates': [p.longitude, p.latitude]},
        } for p in lignes]
        return JsonResponse({'type': 'FeatureCollection', 'features': features})
    if format == 'json':
        return JsonResponse([_serialiser_point(p) for p in lignes], safe=False)
    if format == 'csv':
        donnees = [_serialiser_point(p) for p in lignes]
        colonnes_json = []
        for d in donnees:
            for cle in d.get('donnees', {}):
                if cle not in colonnes_json:
                    colonnes_json.append(cle)
        entetes = ['id', 'code', 'identifiant', 'nom', 'description', 'latitude', 'longitude',
                   'precision_gps_m', 'altitude', 'adresse', 'categorie', 'statut',
                   'etat_avancement', 'province', 'territoire', 'commune', 'secteur',
                   'quartier', 'village', 'observations', 'projet', 'activite',
                   'auteur', 'agent', 'date_creation', 'date_visite',
                   'source_fichier', 'source_format'] + colonnes_json
        buf = io.StringIO()
        ecrivain = csv.writer(buf)
        ecrivain.writerow(entetes)
        for d in donnees:
            ligne = [d.get(h, '') for h in entetes[:28]]
            for cle in colonnes_json:
                ligne.append(d.get('donnees', {}).get(cle, ''))
            ecrivain.writerow(ligne)
        contenu = buf.getvalue()
        from django.http import HttpResponse
        reponse = HttpResponse(('\ufeff' + contenu).encode('utf-8'),
                               content_type='text/csv; charset=utf-8')
        reponse['Content-Disposition'] = 'attachment; filename="points_export.csv"'
        return reponse
    return JsonResponse({'erreur': 'Format inconnu.'}, status=400)
