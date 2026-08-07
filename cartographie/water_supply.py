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

from .models import ProjetAdduction, OuvrageHydraulique, TraceAdduction, ReleveSource, ReleveVillage, ReleveConsommation, ReleveRepere
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
    rs = None
    if o.type == 'source':
        try:
            rs = o.releve_source
        except ReleveSource.DoesNotExist:
            rs = None
    rv = None
    if o.type == 'village':
        try:
            rv = o.releve_village
        except ReleveVillage.DoesNotExist:
            rv = None
    rc = None
    if o.type == 'consommation':
        try:
            rc = o.releve_consommation
        except ReleveConsommation.DoesNotExist:
            rc = None
    rr = None
    if o.type == 'repere':
        try:
            rr = o.releve_repere
        except ReleveRepere.DoesNotExist:
            rr = None
    return {
        'id': o.pk,
        'projet_id': o.projet_id,
        'type': o.type,
        'type_label': o.get_type_display(),
        'sous_type': o.sous_type,
        'sous_type_label': o.get_sous_type_display() if o.sous_type else '',
        'representation': o.representation,
        'representation_label': o.get_representation_display(),
        'geometrie': o.geometrie or [],
        'code': o.code,
        'nom': o.nom,
        'description': o.description,
        'latitude': o.latitude,
        'longitude': o.longitude,
        'altitude_m': o.altitude_m,
        'beneficiaires': o.beneficiaires,
        'caracteristiques': o.caracteristiques or {},
        'qualites_eau': o.qualites_eau or {},
        'provenance': o.provenance,
        'territoire': o.territoire,
        'secteur_chefferie': o.secteur_chefferie,
        'localite': o.localite,
        'village': o.village,
        'agent_enqueteur': o.agent_enqueteur,
        'organisation': o.organisation,
        'code_projet': o.code_projet,
        'observations': o.observations,
        'photo': o.photo.url if o.photo else '',
        'statut': o.statut,
        'statut_label': o.get_statut_display(),
        'releve_par': o.releve_par.username if o.releve_par else None,
        'date_releve': o.date_releve.isoformat(),
        'releve_source': _serialiser_releve_source(rs),
        'releve_village': _serialiser_releve_village(rv),
        'releve_consommation': _serialiser_releve_consommation(rc),
        'releve_repere': _serialiser_releve_repere(rr),
    }


def _serialiser_releve_source(rs):
    """Sérialise le formulaire spécialisé Source d'eau (None si absent)."""
    if rs is None:
        return None
    return {
        'debit_mesure': rs.debit_mesure,
        'debit_unite': rs.debit_unite,
        'methode_mesure': rs.methode_mesure,
        'niveau_eau_m': rs.niveau_eau_m,
        'profondeur_m': rs.profondeur_m,
        'debit_saison_seche': rs.debit_saison_seche,
        'debit_saison_pluies': rs.debit_saison_pluies,
        'accessibilite': rs.accessibilite,
        'etat_source': rs.etat_source,
        'permanence': rs.permanence,
        'protection': rs.protection,
        'distance_village_m': rs.distance_village_m,
        'distance_consommation_m': rs.distance_consommation_m,
        'ph': rs.ph,
        'turbidite_ntu': rs.turbidite_ntu,
        'conductivite_us': rs.conductivite_us,
        'temperature_c': rs.temperature_c,
        'chlore_residuel': rs.chlore_residuel,
        'resultats_microbiologiques': rs.resultats_microbiologiques,
        'observation_qualite': rs.observation_qualite,
        'date_prelevement': rs.date_prelevement.isoformat() if rs.date_prelevement else None,
        'code_echantillon': rs.code_echantillon,
    }


def _serialiser_releve_village(rv):
    """Sérialise le formulaire spécialisé Village (None si absent)."""
    if rv is None:
        return None
    return {
        'population': rv.population,
        'menages': rv.menages,
        'population_cible': rv.population_cible,
        'beneficiaires_estimes': rv.beneficiaires_estimes,
        'ecoles': rv.ecoles,
        'centres_sante': rv.centres_sante,
        'autres_institutions': rv.autres_institutions,
        'source_eau_actuelle': rv.source_eau_actuelle,
        'distance_source_m': rv.distance_source_m,
        'situation_acces': rv.situation_acces,
    }


def _serialiser_releve_consommation(rc):
    """Sérialise le formulaire spécialisé Point de consommation (None si absent)."""
    if rc is None:
        return None
    return {
        'population_desservie': rc.population_desservie,
        'menages_desservis': rc.menages_desservis,
        'nombre_robinets': rc.nombre_robinets,
        'etat': rc.etat,
        'existant_propose': rc.existant_propose,
        'debit_estime': rc.debit_estime,
        'besoin_estime': rc.besoin_estime,
        'photos': rc.photos or [],
    }


def _serialiser_releve_repere(rr):
    """Sérialise le formulaire spécialisé Repère / point intermédiaire (None si absent)."""
    if rr is None:
        return None
    return {
        'description': rr.description,
        'photo': rr.photo,
        'date_releve': rr.date_releve.isoformat() if rr.date_releve else None,
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
    sous_type = str(data.get('sous_type') or '')
    if o.type == 'source':
        if sous_type and sous_type not in dict(OuvrageHydraulique.SOURCES_CHOICES):
            raise ValueError('Classification (sous-type) de source invalide.')
        o.sous_type = sous_type
        o.representation = 'point'
    elif o.type == 'consommation':
        if sous_type and sous_type not in dict(OuvrageHydraulique.CONSOMMATION_CHOICES):
            raise ValueError('Classification (sous-type) de point de consommation invalide.')
        o.sous_type = sous_type
        o.representation = 'point'
    elif o.type == 'repere':
        if sous_type and sous_type not in dict(OuvrageHydraulique.REPERES_CHOICES):
            raise ValueError('Classification (sous-type) de repère invalide.')
        o.sous_type = sous_type
        o.representation = 'point'
    else:
        o.sous_type = ''
    representation = str(data.get('representation') or '')
    if representation in dict(OuvrageHydraulique.REPRESENTATION_CHOICES):
        o.representation = representation
    else:
        o.representation = 'point'
    geometrie = data.get('geometrie')
    if isinstance(geometrie, list):
        o.geometrie = [g for g in geometrie if isinstance(g, list) and len(g) >= 2]
    else:
        o.geometrie = []
    o.code = str(data.get('code') or '').strip()[:30]
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
    qual = data.get('qualites_eau')
    if isinstance(qual, dict):
        o.qualites_eau = {k: v for k, v in qual.items()}
    else:
        o.qualites_eau = {}
    o.provenance = str(data.get('provenance') or '')
    o.territoire = str(data.get('territoire') or '')
    o.secteur_chefferie = str(data.get('secteur_chefferie') or '')
    o.localite = str(data.get('localite') or '')
    o.village = str(data.get('village') or '')
    o.agent_enqueteur = str(data.get('agent_enqueteur') or '')
    o.organisation = str(data.get('organisation') or '')
    o.code_projet = str(data.get('code_projet') or '')
    o.observations = str(data.get('observations') or '')
    o.statut = str(data.get('statut') or 'projet')
    if o.statut not in dict(OuvrageHydraulique.STATUT_CHOICES):
        o.statut = 'projet'
    return o


def _creer_releve_source(o, data):
    """Crée ou met à jour le formulaire spécialisé Source d'eau."""
    if o.type != 'source':
        return None
    rs_data = data.get('source')
    if not isinstance(rs_data, dict):
        rs_data = {}
    try:
        rs, _ = ReleveSource.objects.get_or_create(ouvrage=o)
    except ReleveSource.MultipleObjectsReturned:
        rs = ReleveSource.objects.filter(ouvrage=o).first()
    for champ in ('debit_mesure', 'niveau_eau_m', 'profondeur_m', 'debit_saison_seche',
                  'debit_saison_pluies', 'distance_village_m', 'distance_consommation_m',
                  'ph', 'turbidite_ntu', 'conductivite_us', 'temperature_c', 'chlore_residuel'):
        v = rs_data.get(champ)
        if v in (None, ''):
            setattr(rs, champ, None)
        else:
            try:
                setattr(rs, champ, float(v))
            except (TypeError, ValueError):
                setattr(rs, champ, None)
    rs.debit_unite = str(rs_data.get('debit_unite') or 'l_s')
    if rs.debit_unite not in dict(OuvrageHydraulique.DEBITS_UNITE_CHOICES):
        rs.debit_unite = 'l_s'
    rs.methode_mesure = str(rs_data.get('methode_mesure') or '')
    if rs.methode_mesure not in dict(OuvrageHydraulique.MESURE_METHODES_CHOICES):
        rs.methode_mesure = ''
    rs.accessibilite = str(rs_data.get('accessibilite') or '')
    if rs.accessibilite not in dict(OuvrageHydraulique.ACCESSIBILITE_CHOICES):
        rs.accessibilite = ''
    rs.etat_source = str(rs_data.get('etat_source') or '')
    if rs.etat_source not in dict(OuvrageHydraulique.ETAT_SOURCE_CHOICES):
        rs.etat_source = ''
    rs.permanence = str(rs_data.get('permanence') or '')
    if rs.permanence not in dict(ReleveSource.PERMANENCE_CHOICES):
        rs.permanence = ''
    rs.protection = str(rs_data.get('protection') or '')
    if rs.protection not in dict(ReleveSource.PROTECTION_CHOICES):
        rs.protection = ''
    rs.resultats_microbiologiques = str(rs_data.get('resultats_microbiologiques') or '')
    rs.observation_qualite = str(rs_data.get('observation_qualite') or '')
    date_prev = rs_data.get('date_prelevement')
    if date_prev:
        try:
            from datetime import date as _date
            rs.date_prelevement = _date.fromisoformat(str(date_prev)[:10])
        except ValueError:
            rs.date_prelevement = None
    else:
        rs.date_prelevement = None
    rs.code_echantillon = str(rs_data.get('code_echantillon') or '')
    rs.save()
    return rs


def _creer_releve_village(o, data):
    """Crée ou met à jour le formulaire spécialisé Village / Localité."""
    if o.type != 'village':
        return None
    rv_data = data.get('village')
    if not isinstance(rv_data, dict):
        rv_data = {}
    rv = ReleveVillage.objects.filter(ouvrage=o).first()
    if rv is None:
        rv = ReleveVillage(ouvrage=o)
    for champ in ('population', 'menages', 'population_cible', 'beneficiaires_estimes',
                  'ecoles', 'centres_sante'):
        v = rv_data.get(champ)
        try:
            setattr(rv, champ, int(v or 0))
        except (TypeError, ValueError):
            setattr(rv, champ, 0)
    rv.autres_institutions = str(rv_data.get('autres_institutions') or '')
    acces = str(rv_data.get('source_eau_actuelle') or '')
    rv.source_eau_actuelle = acces if acces in dict(ReleveVillage.ACCES_CHOICES) else ''
    try:
        ds = rv_data.get('distance_source_m')
        rv.distance_source_m = float(ds) if ds not in (None, '') else None
    except (TypeError, ValueError):
        rv.distance_source_m = None
    sit = str(rv_data.get('situation_acces') or '')
    rv.situation_acces = sit if sit in dict(ReleveVillage.SITUATION_CHOICES) else ''
    rv.save()
    return rv


def _creer_releve_consommation(o, data):
    """Crée ou met à jour le formulaire spécialisé Point de consommation."""
    if o.type != 'consommation':
        return None
    rc_data = data.get('consommation')
    if not isinstance(rc_data, dict):
        rc_data = {}
    try:
        rc, _ = ReleveConsommation.objects.get_or_create(ouvrage=o)
    except ReleveConsommation.MultipleObjectsReturned:
        rc = ReleveConsommation.objects.filter(ouvrage=o).first()
    for champ in ('population_desservie', 'menages_desservis', 'nombre_robinets'):
        v = rc_data.get(champ)
        try:
            setattr(rc, champ, int(v or 0))
        except (TypeError, ValueError):
            setattr(rc, champ, 0)
    etat = str(rc_data.get('etat') or '')
    rc.etat = etat if etat in dict(ReleveConsommation.ETAT_POINT_CHOICES) else ''
    ep = str(rc_data.get('existant_propose') or '')
    rc.existant_propose = ep if ep in dict(ReleveConsommation.EXISTANT_PROPOSE_CHOICES) else ''
    for champ in ('debit_estime', 'besoin_estime'):
        v = rc_data.get(champ)
        if v in (None, ''):
            setattr(rc, champ, None)
        else:
            try:
                setattr(rc, champ, float(v))
            except (TypeError, ValueError):
                setattr(rc, champ, None)
    photos = rc_data.get('photos')
    if isinstance(photos, list):
        rc.photos = [str(p) for p in photos if isinstance(p, str) and p.strip()][:20]
    rc.save()
    return rc


def _creer_releve_repere(o, data):
    """Crée ou met à jour le formulaire spécialisé Repère / point intermédiaire."""
    if o.type != 'repere':
        return None
    rr_data = data.get('repere')
    if not isinstance(rr_data, dict):
        rr_data = {}
    try:
        rr, _ = ReleveRepere.objects.get_or_create(ouvrage=o)
    except ReleveRepere.MultipleObjectsReturned:
        rr = ReleveRepere.objects.filter(ouvrage=o).first()
    rr.description = str(rr_data.get('description') or '')
    photo = str(rr_data.get('photo') or '')
    rr.photo = photo[:2_000_000]
    date_r = rr_data.get('date_releve')
    if date_r:
        try:
            from datetime import date as _date
            rr.date_releve = _date.fromisoformat(str(date_r)[:10])
        except ValueError:
            rr.date_releve = None
    else:
        rr.date_releve = None
    rr.save()
    return rr


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


# ─── Référentiel de classification ────────────────────────────────


@login_required
def referentiels_adduction(request):
    """Classification des points à collecter + listes de valeurs.

    Chaque type d'ouvrage dispose d'une classification (sous-types) et
    d'un formulaire spécialisé. Pour « source » : la classification
    SOURCE D'EAU (A) et son formulaire (généralités / techniques /
    qualité de l'eau). La qualité de l'eau n'est pas une certification
    de potabilité — résultats de terrain ou de laboratoire à interpréter.
    """
    sources = [{'id': k, 'label': v} for k, v in OuvrageHydraulique.SOURCES_CHOICES]
    return JsonResponse({
        'types_ouvrages': [{'id': k, 'label': v} for k, v in OuvrageHydraulique.TYPE_CHOICES],
        'statuts': [{'id': k, 'label': v} for k, v in OuvrageHydraulique.STATUT_CHOICES],
        'sources': sources,
        'unites_debit': [{'id': k, 'label': v} for k, v in OuvrageHydraulique.DEBITS_UNITE_CHOICES],
        'methodes_mesure': [{'id': k, 'label': v} for k, v in OuvrageHydraulique.MESURE_METHODES_CHOICES],
        'accessibilites': [{'id': k, 'label': v} for k, v in OuvrageHydraulique.ACCESSIBILITE_CHOICES],
        'etats_source': [{'id': k, 'label': v} for k, v in OuvrageHydraulique.ETAT_SOURCE_CHOICES],
        'permanences': [{'id': k, 'label': v} for k, v in ReleveSource.PERMANENCE_CHOICES],
        'protections': [{'id': k, 'label': v} for k, v in ReleveSource.PROTECTION_CHOICES],
        'representations': [{'id': k, 'label': v} for k, v in OuvrageHydraulique.REPRESENTATION_CHOICES],
        'sources_eau_actuelles': [{'id': k, 'label': v} for k, v in ReleveVillage.ACCES_CHOICES],
        'situations_acces': [{'id': k, 'label': v} for k, v in ReleveVillage.SITUATION_CHOICES],
        'consommations': [{'id': k, 'label': v} for k, v in OuvrageHydraulique.CONSOMMATION_CHOICES],
        'reperes': [{'id': k, 'label': v} for k, v in OuvrageHydraulique.REPERES_CHOICES],
        'etats_point': [{'id': k, 'label': v} for k, v in OuvrageHydraulique.ETAT_POINT_CHOICES],
        'existant_proposes': [{'id': k, 'label': v} for k, v in OuvrageHydraulique.EXISTANT_PROPOSE_CHOICES],
        'potabilite_avertissement': (
            "Ces données de qualité de l'eau sont des résultats de terrain ou de "
            "laboratoire à interpréter selon les normes applicables ; elles ne "
            "constituent pas une certification de potabilité."
        ),
    })


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
            _creer_releve_source(o, data)
            _creer_releve_village(o, data)
            _creer_releve_consommation(o, data)
            _creer_releve_repere(o, data)
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
        _creer_releve_source(o, data)
        _creer_releve_village(o, data)
        _creer_releve_consommation(o, data)
        _creer_releve_repere(o, data)
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