# -*- coding: utf-8 -*-
"""MUKMAP — Contrôle de qualité des données.

Analyse automatique des points, ouvrages hydrauliques et tracés selon
un jeu de règles métier. Chaque entité reçoit une liste de codes de
règles violées ; le statut global d'une entité est la gravité la plus
forte parmi ses violations :

- ``erreur``      🔴 données invalides ou manquantes (obligatoire non renseigné) ;
- ``a_verifier``  🟠 données incomplètes à compléter / à contrôler ;
- ``ok``          🟢 conforme.

Les codes retournés sont stables (utilisés par le tableau, l'export).
"""

import math

# ── Règles (code → gravité + clé i18n) ─────────────────────────
REGLE_COORDONNEES = 'coordonnees_manquantes'
REGLE_GPS = 'precision_gps'
REGLE_ALTITUDE = 'altitude_absente'
REGLE_DOUBLON = 'doublon'
REGLE_PHOTO = 'photo_manquante'
REGLE_DEBIT = 'debit_non_renseigne'
REGLE_SOURCE_VILLAGE = 'source_sans_village'
REGLE_BORNE_VILLAGE = 'borne_sans_village'
REGLE_TRACE_ORIGINE = 'conduite_sans_origine'
REGLE_TRACE_DESTINATION = 'conduite_sans_destination'

GRAVITE_ERREUR = 'erreur'
GRAVITE_A_VERIFIER = 'a_verifier'
GRAVITE_OK = 'ok'
POIDS = {GRAVITE_OK: 0, GRAVITE_A_VERIFIER: 1, GRAVITE_ERREUR: 2}

# (code, gravite, clé i18n)
REGLES = [
    (REGLE_COORDONNEES, GRAVITE_ERREUR, 'q_coordonnees'),
    (REGLE_GPS, GRAVITE_A_VERIFIER, 'q_gps'),
    (REGLE_ALTITUDE, GRAVITE_A_VERIFIER, 'q_altitude'),
    (REGLE_DOUBLON, GRAVITE_ERREUR, 'q_doublon'),
    (REGLE_PHOTO, GRAVITE_ERREUR, 'q_photo'),
    (REGLE_DEBIT, GRAVITE_A_VERIFIER, 'q_debit'),
    (REGLE_SOURCE_VILLAGE, GRAVITE_ERREUR, 'q_source_village'),
    (REGLE_BORNE_VILLAGE, GRAVITE_ERREUR, 'q_borne_village'),
    (REGLE_TRACE_ORIGINE, GRAVITE_ERREUR, 'q_trace_origine'),
    (REGLE_TRACE_DESTINATION, GRAVITE_ERREUR, 'q_trace_destination'),
]
REGLES_PAR_CODE = {code: {'gravite': gravite, 'cle': cle}
                   for code, gravite, cle in REGLES}

# Types d'ouvrages hydrauliques exigeant une photo / un débit.
PHOTO_OBLIGATOIRE = {'source', 'captage', 'borne', 'consommation',
                     'reservoir', 'reseau', 'village'}
DEBIT_ATTENDU = {'source', 'captage', 'borne', 'consommation', 'reservoir'}
SOURCE_VILLAGE_ATTENDU = {'source', 'captage'}
BORNE_VILLAGE_ATTENDU = {'borne', 'consommation'}

# Seuils
PRECISION_GPS_MAX_M = 100.0   # au-delà → position incertaine (🟠)
DOUBLON_DECIMALES = 4         # ≈ 11 m à l'équateur
EXTREMITE_TRACE_M = 150.0     # rayon de rattachement d'une extrémité de tracé


def gravite_statut(codes):
    """Gravité globale d'une entité à partir des codes violés."""
    grav = GRAVITE_OK
    for c in codes:
        g = (REGLES_PAR_CODE.get(c) or {}).get('gravite') or GRAVITE_OK
        if POIDS[g] > POIDS[grav]:
            grav = g
    return grav


def _coordonnees_valides(lat, lon):
    """Latitude/longitude exploitables (non nulles, dans le domaine)."""
    try:
        lat = float(lat)
        lon = float(lon)
    except (TypeError, ValueError):
        return False
    if abs(lat) > 90 or abs(lon) > 180:
        return False
    if lat == 0.0 and lon == 0.0:
        return False
    return True


def cle_doublon(lat, lon):
    """Position arrondie servant à détecter les doublons (~11 m)."""
    try:
        return (round(float(lat), DOUBLON_DECIMALES),
                round(float(lon), DOUBLON_DECIMALES))
    except (TypeError, ValueError):
        return None


def index_doublons(identifiants_lat_lon):
    """Compte les occurrences par position arrondie.

    ``identifiants_lat_lon`` : itérable de tuples (identifiant, lat, lon).
    Retourne {identifiant: nombre d'entités à la même position}.
    """
    comptes = {}
    par_position = {}
    for ident, lat, lon in identifiants_lat_lon:
        cle = cle_doublon(lat, lon)
        if cle is None:
            continue
        par_position.setdefault(cle, []).append(ident)
    for liste in par_position.values():
        if len(liste) > 1:
            for ident in liste:
                comptes[ident] = len(liste)
    return comptes


# ── Analyseurs par entité ─────────────────────────────────────────────

def analyser_point(p, comptes_doublons=None):
    """Codes de règles violées pour un PointGeographique (`p`)."""
    codes = set()
    if not _coordonnees_valides(p.latitude, p.longitude):
        codes.add(REGLE_COORDONNEES)
    if comptes_doublons and comptes_doublons.get(p.pk, 0) > 1:
        codes.add(REGLE_DOUBLON)
    precision = getattr(p, 'precision_gps_m', None)
    if precision is not None and precision > PRECISION_GPS_MAX_M:
        codes.add(REGLE_GPS)
    return codes


def analyser_ouvrage(o, comptes_doublons=None, debit_renseigne=False):
    """Codes de règles violées pour un OuvrageHydraulique (`o`).

    ``debit_renseigne`` : True si un débit (mesuré / estimé) existe
    par ailleurs (ReleveSource / ReleveConsommation / caractéristiques).
    """
    codes = set()
    if not _coordonnees_valides(o.latitude, o.longitude):
        codes.add(REGLE_COORDONNEES)
    if comptes_doublons and comptes_doublons.get(o.pk, 0) > 1:
        codes.add(REGLE_DOUBLON)
    precision = getattr(o, 'precision_gps_m', None)
    if precision is not None and precision > PRECISION_GPS_MAX_M:
        codes.add(REGLE_GPS)
    # Altitude absente
    if o.altitude_m is None:
        codes.add(REGLE_ALTITUDE)
    # Photo obligatoire
    if o.type in PHOTO_OBLIGATOIRE and not o.photo:
        codes.add(REGLE_PHOTO)
    # Débit non renseigné
    if o.type in DEBIT_ATTENDU and not debit_renseigne:
        codes.add(REGLE_DEBIT)
    # Rattachement village (texte libre)
    village = (o.village or '').strip() if hasattr(o, 'village') else ''
    if o.type in SOURCE_VILLAGE_ATTENDU and not village:
        codes.add(REGLE_SOURCE_VILLAGE)
    elif o.type in BORNE_VILLAGE_ATTENDU and not village:
        codes.add(REGLE_BORNE_VILLAGE)
    return codes


def _distance_m(lat1, lon1, lat2, lon2):
    """Distance haversine (m), tolérante aux mauvais types."""
    try:
        lat1, lon1, lat2, lon2 = map(float, (lat1, lon1, lat2, lon2))
    except (TypeError, ValueError):
        return None
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def analyser_trace(t, ouvrages):
    """Codes de règles violées pour un TraceAdduction (`t`).

    Origine / destination : chaque extrémité du tracé doit se trouver à
    moins de `EXTREMITE_TRACE_M` d'un ouvrage du même projet, apte par
    type (origine : source, captage, réservoir, réseau ; destination :
    borne, consommation, réservoir, village, réseau).
    """
    codes = set()
    coords = t.coordonnees or []
    try:
        coords = [[float(c[0]), float(c[1])] for c in coords]
    except (TypeError, ValueError, IndexError):
        coords = []
    if len(coords) < 2:
        codes.add(REGLE_COORDONNEES)
        return codes

    def proche(lat, lon, types_ok):
        for o in ouvrages:
            if o.type not in types_ok:
                continue
            d = _distance_m(lat, lon, o.latitude, o.longitude)
            if d is not None and d <= EXTREMITE_TRACE_M:
                return True
        return False

    debut = coords[0]
    fin = coords[-1]
    if not proche(debut[1], debut[0], {'source', 'captage', 'reservoir', 'reseau'}):
        codes.add(REGLE_TRACE_ORIGINE)
    if not proche(fin[1], fin[0], {'borne', 'consommation', 'reservoir', 'village', 'reseau'}):
        codes.add(REGLE_TRACE_DESTINATION)
    return codes


# ── Agrégations par module (utilisées par la vue) ─────────────────────

def evaluer_points(points):
    """[(objet, codes, gravite), ...] pour un itérable de points."""
    comptes = index_doublons((p.pk, p.latitude, p.longitude) for p in points)
    return [(p, analyser_point(p, comptes), None) for p in points]


def evaluer_ouvrages(ouvrages, releve_debits=None):
    """[(objet, codes, gravite), ...] pour un itérable d'ouvrages.

    ``releve_debits`` : dict {ouvrage_id: True} si un débit existe.
    """
    comptes = index_doublons((o.pk, o.latitude, o.longitude) for o in ouvrages)
    resultats = []
    for o in ouvrages:
        debit_ok = bool(releve_debits and releve_debits.get(o.pk))
        codes = analyser_ouvrage(o, comptes, debit_ok)
        resultats.append((o, codes, None))
    return resultats


def evaluer_traces(traces, ouvrages_par_projet):
    """[(objet, codes, gravite), ...] pour un itérable de tracés."""
    resultats = []
    for t in traces:
        codes = analyser_trace(t, ouvrages_par_projet.get(t.projet_id, []))
        resultats.append((t, codes, None))
    return resultats
