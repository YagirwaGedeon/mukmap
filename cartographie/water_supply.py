# -*- coding: utf-8 -*-
"""API JSON du module « Adduction d'eau — Water Supply Survey ».

Gère le cycle complet d'un PROJET D'ADDUCTION D'EAU :
projets, ouvrages hydrauliques (sources, bornes-fontaines, villages,
ouvrages existants, points repères/intermédiaires), tracés de
conduites potentielles, analyse d'altitude/distance, rapport de
terrain et exports (GeoJSON, CSV, GPX).
"""

import io
import json
import math
import csv

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse, HttpResponse
from django.shortcuts import get_object_or_404

from .models import ProjetAdduction, OuvrageHydraulique, TraceAdduction
from .views import _audit

# RAYON_TERRE = 6371000.0
RAYON_TERRE = 6371000.0


# ─── Sérialisation ───────────────────────────────────────────────


def _serialiser_projet(p):
    return {
        'id': p.pk,
        'nom': p.nom,
        'description': p.description,
        'commanditaire': p.commanditaire,
        'zone_nom': p.zone_nom,
        'bbox': p.bbox or [],
        'statut': p.statut,
        'statut_label': p.get_statut_display(),
        'observations': p.observations,
        'cree_par': p.cree_par.username if p.cree_par else None,
        'date_creation': p.date_creation.isoformat(),
        'nb_ouvrages': p.ouvrages.count(),
        'nb_traces': p.tracs.count(),
    }


def _serialiser_ouvrage(o):
    return {
        'id': o.pk,
        'projet_id': o.projet_id,
        'type': o.type,
        'type_label': o.get_type_display(),
        'nom': o.nom,
        'description': o.description,
        'latitude': o.latitude,
        'longitude': o.longitude,
        'altitude_m': o.altitude_m,
        'beneficiaires': o.beneficiaires,
        'caracteristiques': o.caracteristiques or {},
        'observations': o.observations,
        'photo': o.photo.url if o.photo else '',
        'statut': o.statut,
        'statut_label': o.get_statut_display(),
        'releve_par': o.releve_par.username if o.releve_par else None,
        'date_releve': o.date_releve.isoformat(),
    }


def _serialiser_trace(t):
    return {
        'id': t.pk,
        'projet_id': t.projet_id,
        'nom': t.nom,
        'description': t.description,
        'coordonnees': t.coordonnees or [],
        'longueur_m': t.longueur_m,
        'denivelee_m': t.denivelee_m,
        'observations': t.observations,
        'date_creation': t.date_creation.isoformat(),
    }


# ─── Helpers géométrie (WGS84) ───────────────────────────────────


def _rad(v):
    return v * math.pi / 180.0


def _distance_m(lat1, lon1, lat2, lon2):
    """Distance haversine en mètres entre deux coordonnées."""
    dlat = _rad(lat2 - lat1)
    dlon = _rad(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(_rad(lat1)) * math.cos(_rad(lat2)) * math.sin(dlon / 2) ** 2
    return 2 * RAYON_TERRE * math.asin(min(1, math.sqrt(a)))


def _creer_ouvrage_depuis(o, data):
    """Applique le payload JSON sur un ouvrage (création ou mise à jour)."""
    o.nom = str(data.get('nom') or '').strip()[:250]
    if not o.nom:
        raise ValueError('Le champ « nom » est obligatoire.')
    try:
        o.latitude = float(data.get('latitude'))
        o.longitude = float(data.get('longitude'))
    except (TypeError, ValueError):
        raise ValueError('Latitude et longitude numériques requises.')
    o.type = str(data.get('type') or 'source')
    if o.type not in dict(OuvrageHydraulique.TYPE_CHOICES):
        raise ValueError('Type d\'ouvrage invalide.')
    o.description = str(data.get('description') or '')
    try:
        alt = data.get('altitude_m')
        o.altitude_m = float(alt) if alt not in (None, '') else None
    except (TypeError, ValueError):
        o.altitude_m = None
    try:
        o.beneficiaires = int(data.get('beneficiaires') or 0)
    except (TypeError, ValueError):
        o.beneficiaires = 0
    caract = data.get('caracteristiques')
    if isinstance(caract, dict):
        o.caracteristiques = {k: v for k, v in caract.items()}
    elif isinstance(caract, str) and caract.strip():
        o.caracteristiques = {'details': caract.strip()}
    else:
        o.caracteristiques = {}
    o.observations = str(data.get('observations') or '')
    o.statut = str(data.get('statut') or 'projet')
    if o.statut not in dict(OuvrageHydraulique.STATUT_CHOICES):
        o.statut = 'projet'
    return o


# ─── Projets ───────────────────────────────────────────────────────


@login_required
def api_projets_adduction(request):
    """GET : liste des projets ; POST : création d'un projet."""
    if request.method == 'GET':
        qs = ProjetAdduction.objects.all()
        s = request.GET.get('statut')
        if s:
            qs = qs.filter(statut=s)
        return JsonResponse({
            'projets': [_serialiser_projet(p) for p in qs],
            'total': qs.count(),
        })

    if request.method != 'POST':
        return JsonResponse({'erreur': 'Méthode non autorisée.'}, status=405)
    try:
        data = json.loads(request.body or '{}')
    except ValueError:
        data = {}
    nom = str(data.get('nom') or '').strip()
    if not nom:
        return JsonResponse({'erreur': 'Le nom du projet est obligatoire.'}, status=400)
    bbox = data.get('bbox')
    if not isinstance(bbox, list) or len(bbox) != 4:
        bbox = []
    p = ProjetAdduction.objects.create(
        nom=nom[:250],
        description=str(data.get('description') or ''),
        commanditaire=str(data.get('commanditaire') or ''),
        zone_nom=str(data.get('zone_nom') or ''),
        bbox=bbox,
        statut=str(data.get('statut') or 'planifie'),
        observations=str(data.get('observations') or ''),
        cree_par=request.user,
    )
    _audit(request, 'Création projet adduction d\'eau', f"Projet #{p.pk} - {p.nom}")
    return JsonResponse({'ok': True, 'projet': _serialiser_projet(p)}, status=201)


@login_required
def detail_projet_adduction(request, pk):
    """GET : détail complet ; POST : mise à jour ; DELETE : suppression."""
    p = get_object_or_404(ProjetAdduction, pk=pk)
    if request.method == 'GET':
        return JsonResponse({'projet': _serialiser_projet(p)})
    if request.method == 'DELETE':
        _audit(request, 'Suppression projet adduction', f"Projet #{p.pk} - {p.nom}")
        p.delete()
        return JsonResponse({'ok': True})
    if request.method != 'PUT':
        return JsonResponse({'erreur': 'Méthode non autorisée.'}, status=405)
    try:
        data = json.loads(request.body or '{}')
    except ValueError:
        data = {}
    nom = str(data.get('nom') or '').strip()
    if not nom:
        return JsonResponse({'erreur': 'Le nom du projet est obligatoire.'}, status=400)
    bbox = data.get('bbox')
    if not isinstance(bbox, list) or len(bbox) != 4:
        bbox = p.bbox or []
    p.nom = nom[:250]
    p.description = str(data.get('description') or '')
    p.commanditaire = str(data.get('commanditaire') or '')
    p.zone_nom = str(data.get('zone_nom') or '')
    p.bbox = bbox
    p.statut = str(data.get('statut') or p.statut)
    p.observations = str(data.get('observations') or '')
    p.save()
    _audit(request, 'Modification projet adduction', f"Projet #{p.pk} - {p.nom}")
    return JsonResponse({'ok': True, 'projet': _serialiser_projet(p)})


# ─── Statistiques / analyse d'un projet ─────────────────────────


@login_required
def stats_projet(request, pk):
    """Analyse globale du projet : altitudes, distances, longueurs,
    dénivelés cumulés et charges potentielles."""
    p = get_object_or_404(ProjetAdduction, pk=pk)
    ouvrages = list(p.ouvrages.all())
    altitudes = [o.altitude_m for o in ouvrages if o.altitude_m is not None]
    stats = {
        'nb_ouvrages': len(ouvrages),
        'beneficiaires_total': sum(o.beneficiaires or 0 for o in ouvrages),
        'par_type': {},
        'altitude_min': min(altitudes) if altitudes else None,
        'altitude_max': max(altitudes) if altitudes else None,
        'difference_altitude': (max(altitudes) - min(altitudes)) if len(altitudes) >= 1 else 0,
        'distance_max_km': 0,
        'nb_traces': p.tracs.count(),
        'longueur_conduites_m': 0,
        'denivelee_conduites_m': 0,
    }
    for o in ouvrages:
        stats['par_type'][o.type] = stats['par_type'].get(o.type, 0) + 1
    # Distance maximale entre deux ouvrages (enveloppe) :
    if len(ouvrages) >= 2:
        dmax = 0
        for i in range(len(ouvrages)):
            for j in range(i + 1, len(ouvrages)):
                d = _distance_m(ouvrages[i].latitude, ouvrages[i].longitude,
                                ouvrages[j].latitude, ouvrages[j].longitude)
                if d > dmax:
                    dmax = d
        stats['distance_max_km'] = round(dmax / 1000.0, 2)
    # Longueurs de conduites cumulées :
    for t in p.tracs.all():
        stats['longueur_conduites_m'] += t.longueur_m or 0
        stats['denivelee_conduites_m'] += t.denivelee_m or 0
    stats['longueur_conduites_m'] = round(stats['longueur_conduites_m'], 1)
    stats['denivelee_conduites_m'] = round(stats['denivelee_conduites_m'], 1)
    return JsonResponse({'stats': stats})


# ─── Rapport text de terrain ────────────────────────────────────


@login_required
def rapport_projet(request, pk):
    """Génère un rapport de terrain (texte simple ligne par ligne)."""
    p = get_object_or_404(ProjetAdduction, pk=pk)
    ouvrages = list(p.ouvrages.all())
    traces = list(p.tracs.all())
    lignes = []
    lignes.append('RAPPORT DE TERRAIN — ADDUCTION D\'EAU')
    lignes.append('═' * 50)
    lignes.append(f'Projet : {p.nom}')
    if p.commanditaire:
        lignes.append(f'Commanditaire : {p.commanditaire}')
    if p.zone_nom:
        lignes.append(f'Zone d\'intervention : {p.zone_nom}')
    lignes.append(f'Statut : {p.get_statut_display()}')
    lignes.append(f'Date : {p.date_creation.strftime("%d/%m/%Y %H:%M")}')
    if p.observations:
        lignes.append('Observations :')
        lignes.append('  ' + p.observations)
    lignes.append('')
    lignes.append('OUVRAGES RELEVES (%d)' % len(ouvrages))
    lignes.append('─' * 50)
    if not ouvrages:
        lignes.append('Aucun ouvrage relevé.')
    for o in ouvrages:
        lignes.append(f'• {o.get_type_display().upper()} : {o.nom}')
        lignes.append(f'    Coordonnées : {o.latitude:.5f}, {o.longitude:.5f}')
        if o.altitude_m is not None:
            lignes.append(f'    Altitude : {o.altitude_m:.1f} m')
        if o.beneficiaires:
            lignes.append(f'    Bénéficiaires : {o.beneficiaires}')
        caract = o.caracteristiques or {}
        if caract:
            det = caract.get('details') if not isinstance(caract, dict) else None
            if det:
                lignes.append(f'    Caractéristiques : {det}')
            else:
                extra = '; '.join(f'{k} = {v}' for k, v in caract.items() if str(v).strip())
                if extra:
                    lignes.append(f'    Caractéristiques : {extra}')
        if o.observations:
            lignes.append(f'    Observation : {o.observations}')
    lignes.append('')
    lignes.append('TRACES DE CONDUITES (%d)' % len(traces))
    lignes.append('─' * 50)
    if not traces:
        lignes.append('Aucun tracé de conduite.')
    for t in traces:
        lignes.append(f'• {t.nom or "Tracé #" + str(t.pk)}')
        lignes.append(f'    Longueur : {t.longueur_m:.1f} m')
        lignes.append(f'    Dénivelé cumulé positif : {t.denivelee_m:.1f} m')
        if t.observations:
            lignes.append(f'    Observation : {t.observations}')
    lignes.append('')
    lignes.append('LE RAPPORT EST GÉNÉRÉ AUTOMATIQUEMENT PAR MUKMAP — WATER SUPPLY SURVEY.')
    return JsonResponse({
        'ok': True,
        'rapport': '\n'.join(lignes),
    })


@login_required
def exporter_ouvrages(request, pk, format):
    """Export : GeoJSON | CSV | GPX de tous les ouvrages d'un projet."""
    p = get_object_or_404(ProjetAdduction, pk=pk)
    ouvrages = list(p.ouvrages.all())
    nom_base = p.nom.lower().replace(' ', '_')[:40]

    if format == 'geojson':
        features = []
        for o in ouvrages:
            features.append({
                'type': 'Feature',
                'properties': {
                    'id': o.pk, 'type': o.type, 'nom': o.nom, 'statut': o.statut,
                    'altitude_m': o.altitude_m, 'beneficiaires': o.beneficiaires,
                    'observations': o.observations, 'desc': o.description,
                },
                'geometry': {'type': 'Point', 'coordinates': [o.longitude, o.latitude]},
            })
        # On inclut aussi les tracés :
        for t in p.tracs.all():
            coords = t.coordonnees or []
            if len(coords) >= 2:
                features.append({
                    'type': 'Feature',
                    'properties': {'nom': t.nom, 'type': 'trace', 'longueur_m': t.longueur_m,
                                   'denivelee_m': t.denivelee_m, 'observations': t.observations},
                    'geometry': {'type': 'LineString',
                                 'coordinates': [[c[0], c[1]] for c in coords]},
                })
        payload = json.dumps({'type': 'FeatureCollection', 'features': features}, ensure_ascii=False)
        return HttpResponse(payload, content_type='application/geo+json; charset=utf-8')

    if format == 'csv':
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(['id', 'type', 'nom', 'latitude', 'longitude', 'altitude_m',
                    'beneficiaires', 'statut', 'observations'])
        for o in ouvrages:
            w.writerow([o.pk, o.type, o.nom, o.latitude, o.longitude,
                        o.altitude_m or '', o.beneficiaires, o.statut, o.observations])
        res = HttpResponse(buf.getvalue(), content_type='text/csv; charset=utf-8')
        res['Content-Disposition'] = f'attachment; filename="adduction_{nom_base}.csv"'
        return res

    if format == 'gpx':
        buf = io.StringIO()
        buf.write('<?xml version="1.0" encoding="UTF-8"?>\n')
        buf.write('<gpx version="1.1" creator="MUKMAP — Water Supply Survey" '
                  'xmlns="http://www.topografix.com/GPX/1/1">\n')
        buf.write(f'  <metadata><name>{_xml(p.nom)}</name></metadata>\n')
        for o in ouvrages:
            buf.write(f'  <wpt lat="{o.latitude:.6f}" lon="{o.longitude:.6f}">\n')
            buf.write(f'    <name>{_xml(o.nom)}</name>\n')
            buf.write(f'    <cmt>Type={_xml(o.type)} ; statut={_xml(o.statut)}')
            if o.altitude_m is not None:
                buf.write(f' ; altitude={o.altitude_m:.1f} m')
            buf.write('</cmt>\n')
            if o.altitude_m is not None:
                buf.write(f'    <ele>{o.altitude_m:.2f}</ele>\n')
            buf.write('  </wpt>\n')
        for tr in p.tracs.all():
            coords = tr.coordonnees or []
            if len(coords) < 2:
                continue
            buf.write('  <trk>\n    <name>' + _xml(tr.nom or 'Tracé') + '</name>\n    <trkseg>\n')
            for c in coords:
                buf.write(f'      <trkpt lat="{c[1]:.6f}" lon="{c[0]:.6f}"')
                if len(c) > 2 and c[2] is not None:
                    buf.write(f' alt="{c[2]:.2f}"')
                buf.write('/>\n')
            buf.write('    </trkseg>\n  </trk>\n')
        buf.write('</gpx>\n')
        res = HttpResponse(buf.getvalue(), content_type='application/gpx+xml; charset=utf-8')
        res['Content-Disposition'] = f'attachment; filename="adduction_{nom_base}.gpx"'
        return res

    return JsonResponse({'erreur': 'Format inconnu (geojson, csv, gpx).'}, status=400)


def _xml(texte):
    return (str(texte).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            .replace('"', '&quot;'))


# ─── Ouvrages (CRUD) ────────────────────────────────────────────────


@login_required
def liste_ouvrages(request):
    """POST : création ; GET : liste (avec filtre par projet)."""
    if request.method == 'POST':
        try:
            data = json.loads(request.body or '{}')
        except ValueError:
            data = {}
        pid = data.get('projet_id')
        if not pid:
            return JsonResponse({'erreur': 'Un projet (projet_id) est obligatoire.'}, status=400)
        p = get_object_or_404(ProjetAdduction, pk=pid)
        try:
            o = _creer_ouvrage_depuis(OuvrageHydraulique(projet=p, releve_par=request.user), data)
            o.save()
        except ValueError as e:
            return JsonResponse({'erreur': str(e)}, status=400)
        _audit(request, 'Relevé d\'ouvrage hydraulique', f"Ouvrage #{o.pk} - {o.nom} ({o.type})")
        return JsonResponse({'ok': True, 'ouvrage': _serialiser_ouvrage(o)}, status=201)

    qs = OuvrageHydraulique.objects.all()
    pid = request.GET.get('projet')
    if pid:
        qs = qs.filter(projet_id=pid)
    t = request.GET.get('type')
    if t:
        qs = qs.filter(type=t)
    return JsonResponse({'ouvrages': [_serialiser_ouvrage(o) for o in qs]})


@login_required
def detail_ouvrage(request, pk):
    """GET / PUT / DELETE d'un ouvrage."""
    o = get_object_or_404(OuvrageHydraulique, pk=pk)
    if request.method == 'GET':
        return JsonResponse({'ouvrage': _serialiser_ouvrage(o)})
    if request.method == 'DELETE':
        _audit(request, 'Suppression d\'ouvrage hydraulique', f"Ouvrage #{o.pk} - {o.nom}")
        o.delete()
        return JsonResponse({'ok': True})
    if request.method != 'PUT':
        return JsonResponse({'erreur': 'Méthode non autorisée.'}, status=405)
    try:
        data = json.loads(request.body or '{}')
    except ValueError:
        data = {}
    try:
        _creer_ouvrage_depuis(o, data)
        o.save()
    except ValueError as e:
        return JsonResponse({'erreur': str(e)}, status=400)
    _audit(request, 'Modification d\'ouvrage hydraulique', f"Ouvrage #{o.pk} - {o.nom}")
    return JsonResponse({'ok': True, 'ouvrage': _serialiser_ouvrage(o)})


# ─── Tracés de conduites (CRUD) ────────────────────────────────────


@login_required
def liste_traces(request):
    """POST : création (avec calcul longueur/dénivelé) ; GET : liste."""
    if request.method == 'POST':
        try:
            data = json.loads(request.body or '{}')
        except ValueError:
            data = {}
        pid = data.get('projet_id')
        if not pid:
            return JsonResponse({'erreur': 'Un projet (projet_id) est obligatoire.'}, status=400)
        p = get_object_or_404(ProjetAdduction, pk=pid)
        coordonnees = data.get('coordonnees')
        if not isinstance(coordonnees, list) or len(coordonnees) < 2:
            return JsonResponse({'erreur': 'coordonnees : au moins 2 points [[lon, lat, alt], ...].'}, status=400)
        longueur, denivelee = _analyse_trace(coordonnees)
        t = TraceAdduction.objects.create(
            projet=p,
            nom=str(data.get('nom') or '')[:250],
            description=str(data.get('description') or ''),
            coordonnees=coordonnees,
            longueur_m=round(longueur, 1),
            denivelee_m=round(denivelee, 1),
            observations=str(data.get('observations') or ''),
        )
        _audit(request, 'Tracé de conduite', f"Tracé #{t.pk} - {t.nom or p.nom} ({t.longueur_m:.0f} m)")
        return JsonResponse({'ok': True, 'trace': _serialiser_trace(t)}, status=201)

    qs = TraceAdduction.objects.all()
    pid = request.GET.get('projet')
    if pid:
        qs = qs.filter(projet_id=pid)
    return JsonResponse({'traces': [_serialiser_trace(t) for t in qs]})


@login_required
def detail_trace(request, pk):
    """GET — DELETE d'un tracé (PUT pour ajustement)."""
    t = get_object_or_404(TraceAdduction, pk=pk)
    if request.method == 'GET':
        return JsonResponse({'trace': _serialiser_trace(t)})
    if request.method == 'DELETE':
        _audit(request, 'Suppression de tracé de conduite', f"Tracé #{t.pk} - {t.nom}")
        t.delete()
        return JsonResponse({'ok': True})
    if request.method != 'PUT':
        return JsonResponse({'erreur': 'Méthode non autorisée.'}, status=405)
    try:
        data = json.loads(request.body or '{}')
    except ValueError:
        data = {}
    coordonnees = data.get('coordonnees')
    if isinstance(coordonnees, list) and len(coordonnees) >= 2:
        longueur, denivelee = _analyse_trace(coordonnees)
        t.coordonnees = coordonnees
        t.longueur_m = round(longueur, 1)
        t.denivelee_m = round(denivelee, 1)
    if data.get('nom') is not None:
        t.nom = str(data.get('nom'))[:250]
    if data.get('description') is not None:
        t.description = str(data.get('description') or '')
    if data.get('observations') is not None:
        t.observations = str(data.get('observations') or '')
    t.save()
    _audit(request, 'Modification de tracé de conduite', f"Tracé #{t.pk}")
    return JsonResponse({'ok': True, 'trace': _serialiser_trace(t)})


def _analyse_trace(coordonnees):
    """Calcule longueur (m) et dénivelé cumulé positif (m) d'un tracé."""
    longueur = 0.0
    denivelee = 0.0
    for i in range(1, len(coordonnees)):
        lon1, lat1, alt1 = _point3(coordonnees[i - 1])
        lon2, lat2, alt2 = _point3(coordonnees[i])
        longueur += _distance_m(lat1, lon1, lat2, lon2)
        if alt1 is not None and alt2 is not None and alt2 > alt1:
            denivelee += (alt2 - alt1)
    return longueur, denivelee


def _point3(p):
    """Normalise [lon, lat, alt?] -> (lon, lat, alt|None)."""
    lon, lat = float(p[0]), float(p[1])
    alt = None
    if len(p) > 2 and p[2] is not None and str(p[2]).strip() != '':
        try:
            alt = float(p[2])
        except (TypeError, ValueError):
            alt = None
    return lon, lat, alt