# -*- coding: utf-8 -*-
"""Formats cartographiques supplémentaires pour MUKMAP.

Import : GeoPackage (.gpkg), DXF (ASCII R12), JSON générique (colonnes lat/lng).
Export : GeoJSON, JSON, KML, KMZ, GPX, GeoPackage, DXF.

Implémenté en pur Python (stdlib) : sqlite3 + parsing WKB maison pour GPKG,
analyseur de paires de codes DXF R12, générateurs XML via xml.sax.escape.
"""
import io
import json
import math
import os
import re
import sqlite3
import struct
import zipfile
from xml.sax.saxutils import escape as _xml_escape

from .models import CoucheGeometrie, Geometrie

# ─────────────────────────────────────────────────────────────────────────
# Helpers géométrie partagés (reprojection WGS84 : Web Mercator + UTM)
# ─────────────────────────────────────────────────────────────────────────


def _utm_inverse(easting, northing, zone, nord=True):
    """Inverse transverse Mercator (WGS84) : UTM -> WGS84 (formules USGS)."""
    a = 6378137.0
    f = 1.0 / 298.257223563
    e2 = 2 * f - f * f
    ep2 = e2 / (1 - e2)
    k0 = 0.9996
    x = easting - 500000.0
    y = northing if nord else northing - 10000000.0
    M = y / k0
    mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256))
    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    phi1 = (mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * math.sin(2 * mu)
            + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * math.sin(4 * mu)
            + (151 * e1 ** 3 / 96) * math.sin(6 * mu)
            + (1097 * e1 ** 4 / 512) * math.sin(8 * mu))
    N1 = a / math.sqrt(1 - e2 * math.sin(phi1) ** 2)
    T1 = math.tan(phi1) ** 2
    C1 = ep2 * math.cos(phi1) ** 2
    R1 = a * (1 - e2) / (1 - e2 * math.sin(phi1) ** 2) ** 1.5
    D = x / (N1 * k0)
    lat = phi1 - (N1 * math.tan(phi1) / R1) * (
        D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24
        + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720)
    lon = (D - (1 + 2 * T1 + C1) * D ** 3 / 6
           + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120) / math.cos(phi1)
    return (lon * 180.0 / math.pi + (zone * 6 - 183), lat * 180.0 / math.pi)


def _reprojection_wgs84(epsg):
    """Retourne une fonction (x, y) -> (lon, lat) WGS84, ou None si non supporté."""
    if not epsg or epsg == 4326:
        return lambda x, y: (x, y)
    if epsg == 3857:
        R = 20037508.34
        return lambda x, y: (x / R * 180.0, math.degrees(2 * math.atan(math.exp(y / R * math.pi)) - math.pi / 2))
    if 32601 <= epsg <= 32660:
        zone = epsg - 32600
        return lambda x, y: _utm_inverse(x, y, zone, nord=True)
    if 32701 <= epsg <= 32760:
        zone = epsg - 32700
        return lambda x, y: _utm_inverse(x, y, zone, nord=False)
    return None


def _reprojeter_coords(coords, gtype, transfo):
    """Reprojette des coordonnées (conserve l'altitude si présente)."""
    if gtype == 'Point':
        lon, lat = transfo(coords[0], coords[1])
        return [lon, lat] + list(coords[2:])
    if gtype == 'LineString':
        out = []
        for p in coords:
            lon, lat = transfo(p[0], p[1])
            out.append([lon, lat] + list(p[2:]))
        return out
    if gtype == 'Polygon':
        out = []
        for ring in coords:
            r = []
            for p in ring:
                lon, lat = transfo(p[0], p[1])
                r.append([lon, lat] + list(p[2:]))
            out.append(r)
        return out
    return coords


def _type_geometries_vers_couche(types):
    if not types:
        return 'point'
    if all(t == 'Point' for t in types):
        return 'point'
    if any(t == 'Polygon' for t in types):
        return 'polygone'
    if any(t == 'LineString' for t in types):
        return 'ligne'
    return 'point'


def _exploser_geometrie(gtype, coords):
    if gtype == 'Point':
        return [('Point', coords)]
    if gtype == 'MultiPoint':
        return [('Point', c) for c in coords]
    if gtype == 'LineString':
        return [('LineString', coords)]
    if gtype == 'MultiLineString':
        return [('LineString', c) for c in coords]
    if gtype == 'Polygon':
        return [('Polygon', coords)]
    if gtype == 'MultiPolygon':
        return [('Polygon', c) for c in coords]
    if gtype == 'GeometryCollection':
        out = []
        for g in coords or []:
            out.extend(_exploser_geometrie(g.get('type'), g.get('coordinates')))
        return out
    return []


def _creer_couche(nom_couche, nom_fichier, geometries, srid=4326, epsg=None,
                  crs_nom=None, format_nom=None, avertissement=None):
    """Crée une CoucheGeometrie + ses Geometrie à partir d'une liste de
    {'type', 'coords', 'proprietes'}."""
    if not geometries:
        raise ValueError("Aucune géométrie trouvée dans le fichier.")
    type_geo = _type_geometries_vers_couche([g['type'] for g in geometries])
    couche = CoucheGeometrie.objects.create(
        nom=nom_couche, type_geometrie=type_geo, fichier_source=nom_fichier,
        nom_original=nom_fichier, srid=srid, epsg=epsg or srid or 4326,
        nb_entites=len(geometries))
    for g in geometries:
        Geometrie.objects.create(couche=couche, type=g['type'],
                                 coordonnees=g['coords'], proprietes=g['proprietes'])
    dim = '3D' if any(
        (any(len(p) >= 3 for p in g['coords']) if isinstance(g['coords'][0], list) else len(g['coords']) >= 3)
        for g in geometries) else '2D'
    couche._rapport = {
        'fichier': nom_fichier,
        'format': format_nom or (nom_fichier.rsplit('.', 1)[-1].upper() if '.' in nom_fichier else 'FICHIER'),
        'lignes_analysees': len(geometries),
        'points_crees': len(geometries),
        'sans_coordonnees': 0,
        'invalides': 0,
        'doublons_position': 0,
        'colonnes': None,
        'srid': srid,
        'crs': crs_nom or ('WGS84 (EPSG:4326)' if srid == 4326 else f'EPSG:{srid}'),
        'dimension': dim,
    }
    if avertissement:
        couche._avertissement = avertissement
    return couche


# ─────────────────────────────────────────────────────────────────────────
# GeoPackage (GPKG) — import
# ─────────────────────────────────────────────────────────────────────────

_TAILLES_ENVELOPPE = {0: 0, 1: 32, 2: 48, 3: 48, 4: 48, 5: 64, 6: 64, 7: 80}

_GEOM_TYPE_NOMS = {
    1: 'Point', 2: 'LineString', 3: 'Polygon', 4: 'MultiPoint',
    5: 'MultiLineString', 6: 'MultiPolygon', 7: 'GeometryCollection',
}


def _wkb_vers_geojson(wkb):
    """Parse un WKB (avec ou sans en-tête GeoPackageBinary 'GP') en géométrie GeoJSON.

    Retourne (geojson, srid) où srid peut être None si absent.
    """
    if len(wkb) < 5:
        raise ValueError("Blob géométrique trop court (WKB invalide).")
    pos = 0
    srid = None
    if wkb[:2] == b'GP':
        if len(wkb) < 8:
            raise ValueError("En-tête GeoPackageBinary invalide.")
        drapeaux = wkb[3]
        srid = struct.unpack_from('<I', wkb, 4)[0]
        pos = 8 + _TAILLES_ENVELOPPE.get(drapeaux & 0x1F, 0)
        wkb = wkb[pos:]
        pos = 0

    endian = wkb[pos]
    if endian not in (0, 1):
        raise ValueError("WKB invalide (octet d'ordre illisible).")
    fmt = '<' if endian == 1 else '>'
    pos += 1
    if pos + 4 > len(wkb):
        raise ValueError("WKB tronqué (code de type manquant).")
    type_code = struct.unpack_from(fmt + 'I', wkb, pos)[0]
    pos += 4
    if type_code & 0x20000000:
        if pos + 4 > len(wkb):
            raise ValueError("WKB tronqué (SRID manquant).")
        srid = struct.unpack_from(fmt + 'I', wkb, pos)[0]
        pos += 4
    base = (type_code & 0xFFFF) % 1000
    ewkb_z = bool(type_code & 0x80000000)
    ewkb_m = bool(type_code & 0x40000000)
    iso_code = type_code // 1000 if not (ewkb_z or ewkb_m) else None
    has_z = ewkb_z or (iso_code is not None and iso_code % 10 >= 1)
    has_m = ewkb_m or (iso_code is not None and iso_code % 10 >= 2)
    nb_axes = 2 + (1 if has_z else 0) + (1 if has_m else 0)
    geojson, pos = _parse_wkb_geom(wkb, pos, fmt, base, nb_axes)
    return geojson, srid


def _parse_wkb_geom(wkb, pos, fmt, base, nb_axes):
    def points(n):
        nonlocal pos
        out = []
        for _ in range(n):
            if pos + 8 * nb_axes > len(wkb):
                raise ValueError("WKB tronqué (coordonnées manquantes).")
            out.append(list(struct.unpack_from(fmt + 'd' * nb_axes, wkb, pos)))
            pos += 8 * nb_axes
        return out

    if base == 1:  # Point
        return {'type': 'Point', 'coordinates': points(1)[0]}, pos
    if base == 2:  # LineString
        if pos + 4 > len(wkb):
            raise ValueError("WKB tronqué (nombre de points manquant).")
        n = struct.unpack_from(fmt + 'I', wkb, pos)[0]
        pos += 4
        return {'type': 'LineString', 'coordinates': points(n)}, pos
    if base == 3:  # Polygon
        if pos + 4 > len(wkb):
            raise ValueError("WKB tronqué (nombre d'anneaux manquant).")
        n = struct.unpack_from(fmt + 'I', wkb, pos)[0]
        pos += 4
        rings = []
        for _ in range(n):
            if pos + 4 > len(wkb):
                raise ValueError("WKB tronqué (anneau manquant).")
            m = struct.unpack_from(fmt + 'I', wkb, pos)[0]
            pos += 4
            rings.append(points(m))
        return {'type': 'Polygon', 'coordinates': rings}, pos
    if base in (4, 5, 6, 7):  # Multi* / GeometryCollection
        if pos + 4 > len(wkb):
            raise ValueError("WKB tronqué (nombre d'éléments manquant).")
        n = struct.unpack_from(fmt + 'I', wkb, pos)[0]
        pos += 4
        geoms = []
        for _ in range(n):
            if pos >= len(wkb):
                raise ValueError("WKB tronqué (élément Multi manquant).")
            e = wkb[pos]
            f2 = '<' if e == 1 else '>'
            pos += 1
            tc = struct.unpack_from(f2 + 'I', wkb, pos)[0]
            pos += 4
            b2 = (tc & 0xFFFF) % 1000
            z2 = bool(tc & 0x80000000)
            m2 = bool(tc & 0x40000000)
            iso2 = tc // 1000 if not (z2 or m2) else None
            ax = 2 + (1 if (z2 or (iso2 is not None and iso2 % 10 >= 1)) else 0) \
                + (1 if (m2 or (iso2 is not None and iso2 % 10 >= 2)) else 0)
            g, pos = _parse_wkb_geom(wkb, pos, f2, b2, ax)
            geoms.append(g)
        types = {g['type'] for g in geoms}
        if base == 4:
            return {'type': 'MultiPoint', 'coordinates': [g['coordinates'] for g in geoms]}, pos
        if base == 5:
            return {'type': 'MultiLineString', 'coordinates': [g['coordinates'] for g in geoms]}, pos
        if base == 6:
            return {'type': 'MultiPolygon', 'coordinates': [g['coordinates'] for g in geoms]}, pos
        return {'type': 'GeometryCollection', 'geometries': geoms}, pos
    raise ValueError(f"Type de géométrie WKB inconnu : {base}.")


def _connexion_gpkg(contenu):
    """Ouvre le fichier GPKG en lecture seule (sqlite3 en mémoire)."""
    if not contenu:
        raise ValueError("Le fichier GeoPackage est vide ou illisible.")
    if b'SQLite format 3' not in contenu[:32]:
        raise ValueError("Ce fichier n'est pas un GeoPackage valide (base SQLite introuvable).")
    conn = sqlite3.connect(':memory:')
    try:
        conn.deserialize(contenu)
    except (sqlite3.DatabaseError, ValueError, OverflowError):
        conn.close()
        raise ValueError("Impossible d'ouvrir ce fichier : GeoPackage corrompu.")
    return conn


def infos_gpkg(contenu):
    """Liste les couches (tables de features) d'un GeoPackage.

    Retourne une liste de dicts : {nom, type, nb, srid}.
    """
    try:
        conn = _connexion_gpkg(contenu)
    except sqlite3.DatabaseError:
        raise ValueError("Impossible d'ouvrir ce fichier : GeoPackage corrompu.")
    try:
        cur = conn.cursor()
        cur.execute("SELECT table_name, data_type, srs_id FROM gpkg_contents ORDER BY table_name")
        tables = [(t, dt, s) for t, dt, s in cur.fetchall() if dt == 'features']
        if not tables:
            raise ValueError("Aucune couche de géométries trouvée dans ce GeoPackage.")
        info = []
        for table, _dt, srid in tables:
            try:
                cur.execute("SELECT column_name, geometry_type_name FROM gpkg_geometry_columns WHERE table_name = ?", (table,))
                ligne = cur.fetchone()
                col = ligne[0] if ligne else 'geom'
                gtype = ligne[1] if ligne else 'GEOMETRY'
                try:
                    cur.execute(f'SELECT COUNT(*) FROM "{table}"')
                    nb = cur.fetchone()[0]
                except sqlite3.DatabaseError:
                    nb = 0
                info.append({'nom': table, 'type': gtype, 'nb': nb, 'srid': srid})
            except sqlite3.DatabaseError:
                continue
        if not info:
            raise ValueError("Aucune couche lisible dans ce GeoPackage.")
        return info
    finally:
        conn.close()


def importer_gpkg(contenu, nom_couche, nom_fichier, noms_selectionnes=None):
    """Importe une ou plusieurs couches d'un GeoPackage. Retourne une liste de CoucheGeometrie.

    noms_selectionnes : liste des tables à importer (None = toutes).
    """
    try:
        conn = _connexion_gpkg(contenu)
    except sqlite3.DatabaseError:
        raise ValueError("Impossible d'ouvrir ce fichier : GeoPackage corrompu.")
    try:
        cur = conn.cursor()
        cur.execute("SELECT table_name, srs_id FROM gpkg_contents WHERE data_type = 'features' ORDER BY table_name")
        tables = cur.fetchall()
        tables_filtrees = []
        for table, srid_tab in tables:
            if noms_selectionnes and table not in noms_selectionnes:
                continue
            tables_filtrees.append((table, srid_tab))
        multi = len(tables_filtrees) > 1
        couches = []
        for table, srid_tab in tables_filtrees:
            try:
                cur.execute("SELECT column_name FROM gpkg_geometry_columns WHERE table_name = ?", (table,))
                ligne = cur.fetchone()
                col_geom = ligne[0] if ligne else 'geom'
                cur.execute(f'SELECT * FROM "{table}"')
                noms_cols = [d[0] for d in cur.description]
                epsg = srid_tab or 4326
                transfo = _reprojection_wgs84(epsg)
                geometries = []
                for row in cur.fetchall():
                    props = {}
                    blob = None
                    for nom, val in zip(noms_cols, row):
                        if nom == col_geom or nom == 'fid':
                            if nom == col_geom:
                                blob = val
                            continue
                        if isinstance(val, (bytes, bytearray, memoryview)):
                            continue
                        if isinstance(val, (dict, list)):
                            val = json.dumps(val, ensure_ascii=False)
                        props[nom] = val
                    if not blob:
                        continue
                    try:
                        geojson, _srid = _wkb_vers_geojson(bytes(blob))
                    except (ValueError, struct.error):
                        continue
                    gtype = geojson.get('type')
                    gcoords = geojson.get('coordinates')
                    if gtype not in ('Point', 'LineString', 'Polygon', 'MultiPoint',
                                     'MultiLineString', 'MultiPolygon', 'GeometryCollection'):
                        continue
                    parties = _exploser_geometrie(gtype, gcoords)
                    for ptype, pcoords in parties:
                        geometries.append({'type': ptype, 'coords': pcoords, 'proprietes': dict(props)})
                if not geometries:
                    continue
                if transfo is not None:
                    srid_couche = 4326
                    for g in geometries:
                        g['coords'] = _reprojeter_coords(g['coords'], g['type'], transfo)
                else:
                    srid_couche = epsg
                nom_final = nom_couche
                if multi:
                    titre = re.sub(r'[_\s]+', ' ', table).strip().title() or table
                    nom_final = f'{nom_couche} - {titre}'
                couche = _creer_couche(nom_final, nom_fichier, geometries, srid=srid_couche,
                                       epsg=epsg if transfo is None else 4326,
                                       crs_nom=('WGS84 (EPSG:4326)' if srid_couche == 4326 else f'EPSG:{epsg}'),
                                       format_nom='GEOPACKAGE')
                if transfo is None and epsg not in (None, 4326):
                    couche._avertissement = (
                        f"Projection EPSG:{epsg} non reconnue : les coordonnées ont été conservées telles quelles.")
                couche.epsg = epsg
                couches.append(couche)
            except (sqlite3.DatabaseError, ValueError):
                continue
        if not couches:
            raise ValueError("Aucune couche valide n'a pu être importée depuis ce GeoPackage.")
        return couches
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────────────────
# DXF — import (ASCII DXF R12)
# ─────────────────────────────────────────────────────────────────────────

_CODES_FLOAT = set(range(10, 60)) | set(range(110, 150)) | set(range(210, 240)) | set(range(1010, 1060))
_CODES_INT = (set(range(60, 100)) | set(range(160, 180)) | set(range(270, 300))
              | set(range(370, 390)) | set(range(420, 430)) | set(range(440, 460))
              | set(range(1060, 1072)))


def _lire_paires_dxf(texte):
    """Lit les paires (code, valeur) d'un DXF ASCII R12."""
    lignes = texte.splitlines()
    paires = []
    i = 0
    while i + 1 < len(lignes):
        code_txt = lignes[i].strip()
        val = lignes[i + 1]
        i += 2
        try:
            code = int(code_txt)
        except ValueError:
            continue
        if code in _CODES_FLOAT:
            try:
                val = float(val.strip())
            except ValueError:
                val = val.strip()
        elif code in _CODES_INT:
            try:
                val = int(float(val.strip()))
            except ValueError:
                val = val.strip()
        else:
            val = val.rstrip('\r')
        paires.append((code, val))
    return paires


def _coords_entite(paires, prefixe=0):
    """Coordonnées (x, y[, z]) d'une entité à partir des codes 10/20/30 (+prefixe)."""
    x = y = z = None
    for code, val in paires:
        if code == 10 + prefixe:
            x = val
        elif code == 20 + prefixe:
            y = val
        elif code == 30 + prefixe:
            z = val
    if x is None or y is None:
        return None
    pt = [float(x), float(y)]
    if z is not None:
        pt.append(float(z))
    return pt


def _segments_cercle(cx, cy, rayon, debut=0.0, fin=360.0, z=0.0, n=48):
    pts = []
    for i in range(n + 1):
        ang = math.radians(debut + (fin - debut) * i / n)
        pts.append([cx + rayon * math.cos(ang), cy + rayon * math.sin(ang), z])
    return pts


def importer_dxf(contenu, nom_couche, nom_fichier, epsg_utilisateur=None):
    """Importe un DXF ASCII (R12+). Retourne une CoucheGeometrie.

    epsg_utilisateur : code EPSG choisi par l'utilisateur (None = coordonnées
    conservées telles quelles avec avertissement).
    """
    try:
        texte = contenu.decode('utf-8', errors='replace')
    except Exception:
        raise ValueError("Ce fichier DXF n'est pas lisible (encodage inconnu).")
    paires = _lire_paires_dxf(texte)
    if not paires:
        raise ValueError("Ce fichier n'est pas un DXF valide (aucune paire de codes).")

    en_entites = False
    entites = []
    courante = None
    section = None
    i = 0
    n = len(paires)
    while i < n:
        code, val = paires[i]
        i += 1
        if code == 0:
            if val == 'SECTION':
                if i < n and paires[i][0] == 2:
                    section = paires[i][1]
                    i += 1
                else:
                    section = None
                courante = None
            elif val == 'ENDSEC':
                if section == 'ENTITIES' and courante is not None:
                    entites.append(courante)
                    courante = None
                section = None
            elif section == 'ENTITIES':
                if courante is not None:
                    entites.append(courante)
                courante = {'type': val, 'paires': []}
            else:
                courante = None
        elif section == 'ENTITIES' and courante is not None:
            courante['paires'].append((code, val))
    if courante is not None and section == 'ENTITIES':
        entites.append(courante)

    geometries = []
    nb_ignorees = 0
    for ent in entites:
        t = ent['type']
        p = ent['paires']
        calque = ''
        for code, val in p:
            if code == 8:
                calque = str(val)
                break
        props = {}
        if calque:
            props['calque'] = calque
        try:
            if t == 'POINT':
                c = _coords_entite(p)
                if c:
                    for code, val in p:
                        if code == 1:
                            props['texte'] = str(val)
                    geometries.append({'type': 'Point', 'coords': c, 'proprietes': props})
            elif t == 'LINE':
                a = _coords_entite(p)
                b = _coords_entite(p, 1)
                if a and b:
                    geometries.append({'type': 'LineString', 'coords': [a, b], 'proprietes': props})
            elif t == 'LWPOLYLINE':
                fermee = 0
                for code, val in p:
                    if code == 70:
                        fermee = int(val)
                pts = []
                for code, val in p:
                    if code == 10:
                        pts.append([float(val)])
                    elif code == 20 and pts:
                        pts[-1].append(float(val))
                if pts:
                    if fermee & 1 and pts[0] != pts[-1]:
                        pts.append(list(pts[0]))
                    if len(pts) >= 3 and fermee & 1:
                        geometries.append({'type': 'Polygon', 'coords': [pts], 'proprietes': props})
                    elif len(pts) >= 2:
                        geometries.append({'type': 'LineString', 'coords': pts, 'proprietes': props})
            elif t == 'POLYLINE':
                fermee = 0
                for code, val in p:
                    if code == 70:
                        fermee = int(val)
                sommets = []
                for sub in entites:
                    if sub['type'] == 'VERTEX':
                        c = _coords_entite(sub['paires'])
                        if c:
                            sommets.append(c)
                    elif sub['type'] == 'SEQEND':
                        break
                if len(sommets) >= 2:
                    if fermee & 1 and sommets[0] != sommets[-1]:
                        sommets.append(list(sommets[0]))
                    if len(sommets) >= 3 and fermee & 1:
                        geometries.append({'type': 'Polygon', 'coords': [sommets], 'proprietes': props})
                    else:
                        geometries.append({'type': 'LineString', 'coords': sommets, 'proprietes': props})
            elif t == 'CIRCLE':
                c = _coords_entite(p)
                rayon = None
                for code, val in p:
                    if code == 40:
                        rayon = float(val)
                if c and rayon:
                    z = c[2] if len(c) > 2 else 0.0
                    segs = _segments_cercle(c[0], c[1], rayon, z=z)
                    geometries.append({'type': 'Polygon', 'coords': [segs], 'proprietes': props})
            elif t == 'ARC':
                c = _coords_entite(p)
                rayon = debut = fin = None
                for code, val in p:
                    if code == 40:
                        rayon = float(val)
                    elif code == 50:
                        debut = float(val)
                    elif code == 51:
                        fin = float(val)
                if c and rayon and debut is not None and fin is not None:
                    z = c[2] if len(c) > 2 else 0.0
                    segs = _segments_cercle(c[0], c[1], rayon, debut, fin, z=z)
                    geometries.append({'type': 'LineString', 'coords': segs, 'proprietes': props})
            elif t == 'TEXT':
                c = _coords_entite(p)
                if c:
                    for code, val in p:
                        if code == 1:
                            props['texte'] = str(val)
                    geometries.append({'type': 'Point', 'coords': c, 'proprietes': props})
            else:
                nb_ignorees += 1
        except (ValueError, TypeError):
            continue

    if not geometries:
        raise ValueError(
            "Aucune géométrie exploitable dans ce DXF (POINT, LINE, POLYLINE, LWPOLYLINE, "
            "CIRCLE, ARC, TEXT). Vérifiez que le fichier est un DXF ASCII.")

    epsg = epsg_utilisateur or None
    transfo = None if epsg is None else _reprojection_wgs84(epsg)
    avertissement = None
    if transfo is not None:
        for g in geometries:
            g['coords'] = _reprojeter_coords(g['coords'], g['type'], transfo)
        srid_couche = 4326
        crs_nom = f'Reprojeté depuis EPSG:{epsg} vers WGS84 (EPSG:4326)' if epsg else 'WGS84 (EPSG:4326)'
    else:
        srid_couche = epsg or 4326
        if epsg:
            crs_nom = f'EPSG:{epsg} (coordonnées conservées)'
            avertissement = (f"La projection EPSG:{epsg} n'a pas pu être convertie automatiquement "
                             "en WGS84 : les coordonnées ont été conservées telles quelles.")
        else:
            crs_nom = 'Inconnue — coordonnées conservées telles quelles'
            avertissement = ("Le DXF n'est pas géoréférencé (aucun système de coordonnées détecté). "
                             "Les coordonnées ont été conservées telles quelles ; si les données sont "
                             "décalées sur la carte, réimportez le fichier en choisissant le bon EPSG.")

    couche = _creer_couche(nom_couche, nom_fichier, geometries, srid=srid_couche,
                           epsg=epsg or 4326, crs_nom=crs_nom, format_nom='DXF',
                           avertissement=avertissement)
    if nb_ignorees:
        couche._avertissement = ((couche._avertissement + ' ') if couche._avertissement else '') + \
            f"{nb_ignorees} entité(s) non convertie(s) (type non pris en charge)."
    return couche


# ─────────────────────────────────────────────────────────────────────────
# JSON générique — import
# ─────────────────────────────────────────────────────────────────────────

_CLE_LAT = ('latitude', 'lat', 'lat_d', 'latdec', 'y', 'coordy', 'coordonnee_y')
_CLE_LNG = ('longitude', 'lon', 'lng', 'lng_d', 'lngdec', 'x', 'coordx', 'coordonnee_x')


def _trouver_objet_geo(record):
    """Cherche des coordonnées dans un objet JSON quelconque.

    Retourne (lat, lng, props) ou None.
    """
    if not isinstance(record, dict):
        return None
    lat = lng = None
    for cle in _CLE_LAT:
        v = record.get(cle)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            lat = v
            break
    for cle in _CLE_LNG:
        v = record.get(cle)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            lng = v
            break
    if lat is not None and lng is not None:
        props = {k: (json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else v)
                 for k, v in record.items() if k not in _CLE_LAT + _CLE_LNG}
        return (lat, lng, props)
    if isinstance(record.get('coordonnees'), (list, tuple)) and len(record['coordonnees']) >= 2:
        c = record['coordonnees']
        if all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in c[:2]):
            props = {k: (json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else v)
                     for k, v in record.items() if k != 'coordonnees'}
            return (c[1], c[0], props)
    return None


def analyser_json_generique(contenu):
    """Analyse un JSON non-GeoJSON et retourne une liste de {'type','coords','proprietes'}.

    Supporte : liste d'objets avec colonnes lat/lng, dictionnaire contenant une
    liste de tels objets (clés données/data/rows/records/points/features), et
    listes de paires [lat, lng].
    """
    try:
        data = json.loads(contenu.decode('utf-8-sig', errors='replace'))
    except (ValueError, TypeError):
        raise ValueError("Ce fichier JSON est corrompu ou illisible.")

    records = None
    if isinstance(data, list):
        records = data
    elif isinstance(data, dict):
        for cle in ('donnees', 'data', 'rows', 'records', 'points', 'features', 'resultats', 'results'):
            v = data.get(cle)
            if isinstance(v, list):
                records = v
                break
        if records is None and all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in list(data.values())[:2]):
            records = [data]
    if records is None:
        raise ValueError("Ce fichier JSON ne contient pas de données géographiques utilisables "
                         "(aucune liste d'objets détectée).")

    geometries = []
    for record in records:
        if isinstance(record, (list, tuple)) and len(record) >= 2:
            if all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in record[:2]):
                geometries.append({'type': 'Point', 'coords': [float(record[1]), float(record[0])],
                                   'proprietes': {'valeur': record[2] if len(record) > 2 else ''}})
                continue
        trouve = _trouver_objet_geo(record)
        if trouve:
            lat, lng, props = trouve
            geometries.append({'type': 'Point', 'coords': [float(lng), float(lat)], 'proprietes': props})
        else:
            for cle in ('geometry', 'geo'):
                g = record.get(cle) if isinstance(record, dict) else None
                if isinstance(g, dict):
                    trouve2 = _trouver_objet_geo(g)
                    if trouve2:
                        lat, lng, _ = trouve2
                        props = {k: (json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else v)
                                 for k, v in record.items() if k not in ('geometry', 'geo')}
                        geometries.append({'type': 'Point', 'coords': [float(lng), float(lat)], 'proprietes': props})
                        break

    if not geometries:
        raise ValueError("Ce fichier JSON ne contient pas de données géographiques utilisables "
                         "(aucune colonne de latitude/longitude détectée).")
    return geometries


# ─────────────────────────────────────────────────────────────────────────
# Exports — conversion d'une couche vers les formats
# ─────────────────────────────────────────────────────────────────────────

def _geometries_couche(couche):
    """(type GeoJSON simple, coordonnées, propriétés) pour chaque géométrie."""
    out = []
    for g in couche.geometries.all().order_by('id'):
        coords = g.coordonnees
        if not isinstance(coords, list) or not coords:
            continue
        out.append({'type': g.type, 'coords': coords, 'proprietes': g.proprietes or {}})
    return out


def _props_scalaires(proprietes):
    """Propriétés converties en valeurs scalaires JSON-sérialisables."""
    props = {}
    for k, v in (proprietes or {}).items():
        if isinstance(v, (dict, list)):
            v = json.dumps(v, ensure_ascii=False)
        props[k] = v
    return props


def exporter_geojson(couche):
    """FeatureCollection GeoJSON d'une couche."""
    features = []
    for g in _geometries_couche(couche):
        features.append({
            'type': 'Feature',
            'geometry': {'type': g['type'], 'coordinates': g['coords']},
            'properties': _props_scalaires(g['proprietes']),
        })
    return {
        'type': 'FeatureCollection',
        'name': couche.nom,
        'crs': {'type': 'name', 'properties': {'name': f'EPSG:{couche.epsg or couche.srid or 4326}'}},
        'features': features,
    }


def _kml_coord(pt):
    return '%s,%s' % (repr(float(pt[0])), repr(float(pt[1])))


def exporter_kml(couche):
    """Document KML 2.2 d'une couche."""
    couleur = (couche.style_options or {}).get('couleur') or '#3388ff'
    couleur = str(couleur).lstrip('#')
    if len(couleur) == 6:
        try:
            r, g, b = couleur[0:2], couleur[2:4], couleur[4:6]
            kml_coul = 'ff' + b + g + r
        except (ValueError, TypeError):
            kml_coul = 'ff3388ff'
    else:
        kml_coul = 'ff3388ff'
    nom = _xml_escape(couche.nom or 'Couche')
    morceaux = [f'<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">',
                f'<Document><name>{nom}</name>',
                f'<Style id="style_{couche.pk}">',
                '<IconStyle><color>%s</color><scale>0.9</scale></IconStyle>' % kml_coul,
                '<LineStyle><color>%s</color><width>2</width></LineStyle>' % kml_coul,
                '<PolyStyle><color>%s</color></PolyStyle>' % (kml_coul[:2] + '55' + kml_coul[4:]),
                '</Style>']
    for g in _geometries_couche(couche):
        props = _props_scalaires(g['proprietes'])
        pnom = _xml_escape(str(props.get('nom') or props.get('name') or f'Entité {g["type"]}')[:200])
        morceaux.append(f'<Placemark><name>{pnom}</name><styleUrl>#style_{couche.pk}</styleUrl>')
        ext = []
        for k, v in props.items():
            if k in ('nom', 'name', '_partie'):
                continue
            ext.append(f'<Data name="{_xml_escape(str(k))[:60]}"><value>{_xml_escape(str(v))[:500]}</value></Data>')
        if ext:
            morceaux.append('<ExtendedData>' + ''.join(ext) + '</ExtendedData>')
        if g['type'] == 'Point':
            morceaux.append(f'<Point><coordinates>{_kml_coord(g["coords"])}</coordinates></Point>')
        elif g['type'] == 'LineString':
            pts = ' '.join(_kml_coord(p) for p in g['coords'])
            morceaux.append(f'<LineString><coordinates>{pts}</coordinates></LineString>')
        elif g['type'] == 'Polygon':
            anneaux = []
            for ring in g['coords']:
                pts = ' '.join(_kml_coord(p) for p in ring)
                anneaux.append(f'<outerBoundaryIs><LinearRing><coordinates>{pts}</coordinates></LinearRing></outerBoundaryIs>')
            morceaux.append('<Polygon>' + ''.join(anneaux) + '</Polygon>')
        morceaux.append('</Placemark>')
    morceaux.append('</Document></kml>')
    return '\n'.join(morceaux)


def exporter_kmz(couche):
    """Archive KMZ contenant le KML principal (doc.kml)."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('doc.kml', exporter_kml(couche))
    return buf.getvalue()


def exporter_gpx(couche):
    """GPX 1.1 d'une couche (waypoints, tracks, routes)."""
    nom = _xml_escape(couche.nom or 'Couche')
    morceaux = ['<?xml version="1.0" encoding="UTF-8"?>',
                '<gpx version="1.1" creator="MUKMAP" xmlns="http://www.topografix.com/GPX/1/1">',
                f'<metadata><name>{nom}</name></metadata>']
    trks = []
    for g in _geometries_couche(couche):
        props = _props_scalaires(g['proprietes'])
        pnom = _xml_escape(str(props.get('nom') or props.get('name') or '')[:200]) or None
        if g['type'] == 'Point':
            lat, lon = float(g['coords'][1]), float(g['coords'][0])
            morceaux.append(f'<wpt lat="{repr(lat)}" lon="{repr(lon)}">')
            if pnom:
                morceaux.append(f'<name>{pnom}</name>')
            if len(g['coords']) > 2:
                morceaux.append(f'<ele>{repr(float(g["coords"][2]))}</ele>')
            for k, v in props.items():
                if k in ('nom', 'name'):
                    continue
                morceaux.append(f'<cmt>{_xml_escape(str(v))[:200]}</cmt>')
                break
            morceaux.append('</wpt>')
        elif g['type'] == 'LineString':
            pts = ['<trkpt lat="%s" lon="%s">' % (repr(float(p[1])), repr(float(p[0]))) +
                   (f'<ele>{repr(float(p[2]))}</ele>' if len(p) > 2 else '') + '</trkpt>' for p in g['coords']]
            trks.append('<trk>' + (f'<name>{pnom}</name>' if pnom else '') + '<trkseg>' + ''.join(pts) + '</trkseg></trk>')
        elif g['type'] == 'Polygon':
            pts = ['<trkpt lat="%s" lon="%s">' % (repr(float(p[1])), repr(float(p[0]))) +
                   (f'<ele>{repr(float(p[2]))}</ele>' if len(p) > 2 else '') + '</trkpt>'
                   for p in g['coords'][0]]
            trks.append('<trk>' + (f'<name>{pnom}</name>' if pnom else '') + '<trkseg>' + ''.join(pts) + '</trkseg></trk>')
    morceaux.extend(trks)
    morceaux.append('</gpx>')
    return '\n'.join(morceaux)


# ─────────────────────────────────────────────────────────────────────────
# GeoPackage — export
# ─────────────────────────────────────────────────────────────────────────

_WKT_WGS84 = ('GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],'
              'PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433],'
              'AUTHORITY["EPSG","4326"]]')


def _wkb_simple(gtype, coords):
    """WKB little-endian sans SRID d'une géométrie simple (Point/LineString/Polygon)."""
    out = bytearray()
    if gtype == 'Point':
        out += b'\x01' + struct.pack('<I', 1)
        for v in coords[:3]:
            out += struct.pack('<d', float(v))
    elif gtype == 'LineString':
        out += b'\x01' + struct.pack('<I', 2) + struct.pack('<I', len(coords))
        for p in coords:
            for v in p[:3]:
                out += struct.pack('<d', float(v))
    elif gtype == 'Polygon':
        out += b'\x01' + struct.pack('<I', 3) + struct.pack('<I', len(coords))
        for ring in coords:
            out += struct.pack('<I', len(ring))
            for p in ring:
                for v in p[:3]:
                    out += struct.pack('<d', float(v))
    return bytes(out)


def exporter_gpkg(couches):
    """GeoPackage contenant une table par couche (fid + geom + attributs)."""
    if not isinstance(couches, (list, tuple)):
        couches = [couches]
    if not couches:
        raise ValueError("Aucune couche à exporter.")

    def _type_gpkg(type_geo):
        return {'point': 'POINT', 'ligne': 'LINESTRING', 'polygone': 'POLYGON'}.get(type_geo, 'GEOMETRY')

    conn = sqlite3.connect(':memory:')
    try:
        cur = conn.cursor()
        cur.execute("CREATE TABLE gpkg_spatial_ref_sys (srs_name TEXT NOT NULL, srs_id INTEGER NOT NULL PRIMARY KEY, "
                    "organization TEXT NOT NULL, organization_coordsys_id INTEGER NOT NULL, "
                    "definition TEXT NOT NULL, description TEXT)")
        cur.execute("INSERT INTO gpkg_spatial_ref_sys VALUES (?,?,?,?,?,?)",
                    ('WGS 84 geodetic', 4326, 'EPSG', 4326, _WKT_WGS84, 'longitude/latitude coordinates in decimal degrees'))
        cur.execute("CREATE TABLE gpkg_contents (table_name TEXT NOT NULL PRIMARY KEY, data_type TEXT NOT NULL, "
                    "identifier TEXT UNIQUE, description TEXT DEFAULT '', last_change DATETIME NOT NULL DEFAULT "
                    "(strftime('%Y-%m-%dT%H:%M:%fZ','now')), min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE, srs_id INTEGER)")
        cur.execute("CREATE TABLE gpkg_geometry_columns (table_name TEXT NOT NULL, column_name TEXT NOT NULL, "
                    "geometry_type_name TEXT NOT NULL, srs_id INTEGER NOT NULL, z TINYINT NOT NULL, m TINYINT NOT NULL, "
                    "PRIMARY KEY (table_name, column_name))")

        for couche in couches:
            table = re.sub(r'[^A-Za-z0-9_]+', '_', (couche.nom or 'couche').strip())[:50] or 'couche'
            table = 'couche_' + table if not table[0].isalpha() else table
            base = table
            n = 2
            while True:
                try:
                    cur.execute(f'CREATE TABLE "{table}" (fid INTEGER PRIMARY KEY AUTOINCREMENT, geom BLOB NOT NULL)')
                    break
                except sqlite3.OperationalError:
                    table = f'{base[:46]}_{n}'
                    n += 1
            champs = {}
            for g in _geometries_couche(couche):
                for k, v in _props_scalaires(g['proprietes']).items():
                    if k in ('fid', 'geom'):
                        continue
                    if k not in champs:
                        if isinstance(v, bool):
                            champs[k] = 'INTEGER'
                        elif isinstance(v, (int, float)):
                            champs[k] = 'REAL'
                        else:
                            champs[k] = 'TEXT'
            for k, t in champs.items():
                cur.execute(f'ALTER TABLE "{table}" ADD COLUMN "{k[:60]}" {t}')
            cur.execute("INSERT INTO gpkg_contents (table_name, data_type, identifier, description, srs_id) "
                        "VALUES (?, 'features', ?, ?, 4326)", (table, table, (couche.description or '')[:500]))
            cur.execute("INSERT INTO gpkg_geometry_columns VALUES (?, 'geom', ?, 4326, 0, 0)",
                        (table, _type_gpkg(couche.type_geometrie)))
            for g in _geometries_couche(couche):
                wkb = _wkb_simple(g['type'], g['coords'])
                blob = b'GP' + bytes([0, 0]) + struct.pack('<I', 4326) + wkb
                props = _props_scalaires(g['proprietes'])
                colonnes = [k for k in champs if k not in ('fid', 'geom')]
                valeurs = []
                for k in colonnes:
                    v = props.get(k)
                    if v is None:
                        valeurs.append(None)
                    elif isinstance(v, (int, float)) and not isinstance(v, bool):
                        valeurs.append(v)
                    else:
                        valeurs.append(str(v))
                cur.execute(f'INSERT INTO "{table}" (geom, {", ".join(f'"{c[:60]}"' for c in colonnes)}) '
                            f'VALUES (?, {", ".join("?" for _ in colonnes)})', [blob] + valeurs)
        conn.commit()
        donnees = conn.serialize()
    finally:
        conn.close()
    return donnees


# ─────────────────────────────────────────────────────────────────────────
# DXF — export (ASCII R12)
# ─────────────────────────────────────────────────────────────────────────

def _dxf_num(val):
    return ('%.6f' % float(val)).rstrip('0').rstrip('.')


def exporter_dxf(couche):
    """DXF ASCII R12 d'une couche (POINT / LINE / LWPOLYLINE)."""
    lignes = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009',
              '9', '$INSUNITS', '70', '6', '0', 'ENDSEC',
              '0', 'SECTION', '2', 'ENTITIES']
    for g in _geometries_couche(couche):
        props = _props_scalaires(g['proprietes'])
        calque = str(props.get('calque') or props.get('nom') or '0')[:30].replace(' ', '_') or '0'
        if g['type'] == 'Point':
            c = g['coords']
            lignes += ['0', 'POINT', '8', calque,
                       '10', _dxf_num(c[0]), '20', _dxf_num(c[1]),
                       '30', _dxf_num(c[2] if len(c) > 2 else 0)]
        elif g['type'] == 'LineString':
            pts = g['coords']
            if len(pts) == 2:
                a, b = pts[0], pts[1]
                lignes += ['0', 'LINE', '8', calque,
                           '10', _dxf_num(a[0]), '20', _dxf_num(a[1]), '30', _dxf_num(a[2] if len(a) > 2 else 0),
                           '11', _dxf_num(b[0]), '21', _dxf_num(b[1]), '31', _dxf_num(b[2] if len(b) > 2 else 0)]
            else:
                lignes += ['0', 'LWPOLYLINE', '8', calque, '90', str(len(pts)), '70', '0']
                for p in pts:
                    lignes += ['10', _dxf_num(p[0]), '20', _dxf_num(p[1])]
        elif g['type'] == 'Polygon':
            anneau = g['coords'][0]
            fermee = 1 if anneau and anneau[0] == anneau[-1] else 0
            pts = anneau[:-1] if fermee else anneau
            lignes += ['0', 'LWPOLYLINE', '8', calque, '90', str(len(pts)), '70', '1']
            for p in pts:
                lignes += ['10', _dxf_num(p[0]), '20', _dxf_num(p[1])]
    lignes += ['0', 'ENDSEC', '0', 'EOF']
    return '\r\n'.join(lignes) + '\r\n'