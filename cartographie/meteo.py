"""Module météo : proxy vers Open-Meteo (données + prévisions court terme),
localisation via BigDataCloud, cache serveur Django (10 min).
Utilisé par l'API /api/meteo/ et par la vue activite_create (snapshot auto).
Ne bloque jamais le flux principal : toutes les erreurs sont capturées et
renvoient None (données indisponibles)."""

import json
import logging
import urllib.parse
import urllib.request

from django.contrib.auth.decorators import login_required
from django.core.cache import cache
from django.http import JsonResponse
from django.utils import timezone

logger = logging.getLogger(__name__)

OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast'
REVERSE_GEO_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client'
TTL_CACHE = 600  # 10 minutes
TIMEOUT = 8

# Codes WMO -> libellés en 6 langues
_WMO = {
    0:   {'fr': 'Ciel dégagé', 'en': 'Clear sky', 'sw': 'Anga safi', 'ln': 'Likolo ezali petwa', 'pt': 'Céu limpo', 'zh': '晴朗'},
    1:   {'fr': 'Principalement dégagé', 'en': 'Mainly clear', 'sw': 'Anga safi kiasi', 'ln': 'Likolo petwa mingi', 'pt': 'Maiormente limpo', 'zh': '大部晴朗'},
    2:   {'fr': 'Partiellement nuageux', 'en': 'Partly cloudy', 'sw': 'Mawingu kidogo', 'ln': 'Lipata moke', 'pt': 'Parcialmente nublado', 'zh': '局部多云'},
    3:   {'fr': 'Couvert', 'en': 'Overcast', 'sw': 'Mawingu yamefuka', 'ln': 'Lipata', 'pt': 'Nublado', 'zh': '阴天'},
    45:  {'fr': 'Brouillard', 'en': 'Fog', 'sw': 'Ukungu', 'ln': 'Lipumbu', 'pt': 'Nevoeiro', 'zh': '雾'},
    48:  {'fr': 'Brouillard givrant', 'en': 'Rime fog', 'sw': 'Ukungu wa barafu', 'ln': 'Lipumbu ya malili', 'pt': 'Nevoeiro gelado', 'zh': '冻雾'},
    51:  {'fr': 'Bruine légère', 'en': 'Light drizzle', 'sw': 'Manyunyu hafifu', 'ln': 'Mbula ya moke', 'pt': 'Chuvisco leve', 'zh': '小毛毛雨'},
    53:  {'fr': 'Bruine modérée', 'en': 'Moderate drizzle', 'sw': 'Manyunyu ya wastani', 'ln': 'Mbula ya katikati', 'pt': 'Chuvisco moderado', 'zh': '毛毛雨'},
    55:  {'fr': 'Bruine dense', 'en': 'Dense drizzle', 'sw': 'Manyunyu makali', 'ln': 'Mbula ya makasi', 'pt': 'Chuvisco denso', 'zh': '浓毛毛雨'},
    56:  {'fr': 'Bruine verglaçante légère', 'en': 'Light freezing drizzle', 'sw': 'Manyunyu ya barafu hafifu', 'ln': 'Mbula ya malili ya moke', 'pt': 'Chuvisco congelante leve', 'zh': '小冻毛毛雨'},
    57:  {'fr': 'Bruine verglaçante dense', 'en': 'Dense freezing drizzle', 'sw': 'Manyunyu ya barafu makali', 'ln': 'Mbula ya malili ya makasi', 'pt': 'Chuvisco congelante denso', 'zh': '浓冻毛毛雨'},
    61:  {'fr': 'Pluie légère', 'en': 'Light rain', 'sw': 'Mvua hafifu', 'ln': 'Mbula ya moke', 'pt': 'Chuva leve', 'zh': '小雨'},
    63:  {'fr': 'Pluie modérée', 'en': 'Moderate rain', 'sw': 'Mvua ya wastani', 'ln': 'Mbula ya katikati', 'pt': 'Chuva moderada', 'zh': '中雨'},
    65:  {'fr': 'Pluie forte', 'en': 'Heavy rain', 'sw': 'Mvua kubwa', 'ln': 'Mbula ya makasi', 'pt': 'Chuva forte', 'zh': '大雨'},
    66:  {'fr': 'Pluie verglaçante légère', 'en': 'Light freezing rain', 'sw': 'Mvua ya barafu hafifu', 'ln': 'Mbula ya malili ya moke', 'pt': 'Chuva congelante leve', 'zh': '小冻雨'},
    67:  {'fr': 'Pluie verglaçante forte', 'en': 'Heavy freezing rain', 'sw': 'Mvua ya barafu kubwa', 'ln': 'Mbula ya malili ya makasi', 'pt': 'Chuva congelante forte', 'zh': '大冻雨'},
    71:  {'fr': 'Neige légère', 'en': 'Light snow', 'sw': 'Theluji hafifu', 'ln': 'Nzele ya moke', 'pt': 'Neve leve', 'zh': '小雪'},
    73:  {'fr': 'Neige modérée', 'en': 'Moderate snow', 'sw': 'Theluji ya wastani', 'ln': 'Nzele ya katikati', 'pt': 'Neve moderada', 'zh': '中雪'},
    75:  {'fr': 'Neige forte', 'en': 'Heavy snow', 'sw': 'Theluji kubwa', 'ln': 'Nzele ya makasi', 'pt': 'Neve forte', 'zh': '大雪'},
    77:  {'fr': 'Grains de neige', 'en': 'Snow grains', 'sw': 'Mche wa theluji', 'ln': 'Bamoke ya nzele', 'pt': 'Grãos de neve', 'zh': '雪粒'},
    80:  {'fr': 'Averses légères', 'en': 'Light showers', 'sw': 'Manyunyu hafifu', 'ln': 'Mbula ya moke', 'pt': 'Aguaceiros leves', 'zh': '小阵雨'},
    81:  {'fr': 'Averses modérées', 'en': 'Moderate showers', 'sw': 'Manyunyu ya wastani', 'ln': 'Mbula ya katikati', 'pt': 'Aguaceiros moderados', 'zh': '阵雨'},
    82:  {'fr': 'Averses violentes', 'en': 'Violent showers', 'sw': 'Manyunyu makali', 'ln': 'Mbula ya makasi', 'pt': 'Aguaceiros fortes', 'zh': '强阵雨'},
    85:  {'fr': 'Averses de neige légères', 'en': 'Light snow showers', 'sw': 'Manyunyu ya theluji hafifu', 'ln': 'Mbula ya nzele ya moke', 'pt': 'Aguaceiros de neve leves', 'zh': '小阵雪'},
    86:  {'fr': 'Averses de neige fortes', 'en': 'Heavy snow showers', 'sw': 'Manyunyu ya theluji makali', 'ln': 'Mbula ya nzele ya makasi', 'pt': 'Aguaceiros de neve fortes', 'zh': '强阵雪'},
    95:  {'fr': 'Orage', 'en': 'Thunderstorm', 'sw': 'Radi', 'ln': 'Kotakota', 'pt': 'Trovoada', 'zh': '雷暴'},
    96:  {'fr': 'Orage avec grêle légère', 'en': 'Thunderstorm with light hail', 'sw': 'Radi na mvua ya mawe hafifu', 'ln': 'Kotakota na mvula ya mabanga ya moke', 'pt': 'Trovoada com granizo leve', 'zh': '雷暴伴小冰雹'},
    99:  {'fr': 'Orage avec grêle forte', 'en': 'Thunderstorm with heavy hail', 'sw': 'Radi na mvua ya mawe kubwa', 'ln': 'Kotakota na mvula ya mabanga ya makasi', 'pt': 'Trovoada com granizo forte', 'zh': '雷暴伴大冰雹'},
}

_ROSE = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
         'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO']

_ICONES = {0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️', 45: '🌫️', 48: '🌫️',
           51: '🌦️', 53: '🌦️', 55: '🌧️', 56: '🌧️', 57: '🌧️',
           61: '🌧️', 63: '🌧️', 65: '🌧️', 66: '🌧️', 67: '🌧️',
           71: '🌨️', 73: '🌨️', 75: '❄️', 77: '🌨️',
           80: '🌦️', 81: '🌧️', 82: '⛈️', 85: '🌨️', 86: '🌨️',
           95: '⛈️', 96: '⛈️', 99: '⛈️'}


def _valider_coordonnees(lat, lon):
    """Valide et normalise des coordonnées GPS. Retourne (None, None) si invalides."""
    try:
        lat = float(lat)
        lon = float(lon)
    except (TypeError, ValueError):
        return None, None
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None, None
    return lat, lon


def _requete_json(url, params):
    qs = urllib.parse.urlencode(params)
    req = urllib.request.Request(
        url + '?' + qs,
        headers={'User-Agent': 'Mukmap/1.0 (suivi meteo activites de terrain)'})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return json.loads(resp.read().decode('utf-8'))


def libelle_conditions(code, langue='fr'):
    """Libellé WMO traduit + icône."""
    if code is None:
        return '', ''
    info = _WMO.get(int(code))
    if not info:
        return f'Code {code}', '🌡️'
    return info.get(langue, info['fr']), _ICONES.get(int(code), '🌡️')


def _nom_vent(deg):
    if deg is None:
        return ''
    return _ROSE[int(deg % 360 / 22.5) % 16]


def _localisation(lat, lon):
    """Nom de lieu approximatif (ville, localité, subdivision) — silencieux en cas d'échec."""
    try:
        d = _requete_json(REVERSE_GEO_URL, {
            'latitude': lat, 'longitude': lon, 'localityLanguage': 'fr'})
        parts = [d.get('city'), d.get('locality'), d.get('principalSubdivision')]
        return ', '.join(p for p in parts if p) or ''
    except Exception:
        return ''


def _previsions_courtes(d):
    """Les 6 prochaines heures : heure, température, code WMO, probabilité de pluie."""
    try:
        hourly = d.get('hourly') or {}
        times = hourly.get('time') or []
        temps = hourly.get('temperature_2m') or []
        codes = hourly.get('weather_code') or []
        probs = hourly.get('precipitation_probability') or []
        maintenant = timezone.now() + timezone.timedelta(
            seconds=d.get('utc_offset_seconds') or 0)
        maintenant = maintenant.replace(tzinfo=None)
        debut = None
        for i, t in enumerate(times):
            try:
                dt = timezone.datetime.fromisoformat(t)
                if dt.tzinfo is not None:
                    dt = dt.replace(tzinfo=None)
                if dt >= maintenant:
                    debut = i
                    break
            except (ValueError, TypeError):
                continue
        if debut is None:
            return []
        out = []
        for i in range(debut, min(debut + 6, len(times))):
            out.append({
                'heure': times[i][11:16],
                'temperature': temps[i] if i < len(temps) else None,
                'code': codes[i] if i < len(codes) else None,
                'proba_pluie': probs[i] if i < len(probs) else None,
            })
        return out
    except Exception:
        return []


def recuperer_meteo(lat, lon, langue='fr'):
    """Récupère les conditions météo actuelles + prévisions (Open-Meteo) avec cache.
    Retourne un dict prêt pour l'API et le modèle MeteoActivite, ou None en cas
    de coordonnées invalides ou de service indisponible."""
    lat, lon = _valider_coordonnees(lat, lon)
    if lat is None:
        return None
    cle_cache = 'mukmap_meteo_{}_{}_{}'.format(round(lat, 3), round(lon, 3), langue)
    valide = cache.get(cle_cache)
    if valide:
        return valide

    params = {
        'latitude': lat,
        'longitude': lon,
        'current': 'temperature_2m,relative_humidity_2m,weather_code,'
                   'wind_speed_10m,wind_direction_10m,precipitation_probability',
        'hourly': 'temperature_2m,weather_code,precipitation_probability',
        'daily': 'sunrise,sunset,temperature_2m_max,temperature_2m_min',
        'timezone': 'auto',
        'forecast_days': 2,
    }
    try:
        d = _requete_json(OPEN_METEO_URL, params)
    except Exception as exc:
        logger.warning('Open-Meteo indisponible (%s, %s) : %s', lat, lon, exc)
        return None

    cur = d.get('current') or {}
    daily = d.get('daily') or {}
    code = cur.get('weather_code')
    libelle, icone = libelle_conditions(code, langue)
    resultat = {
        'ok': True,
        'lat': lat,
        'lon': lon,
        'localisation': _localisation(lat, lon),
        'temperature': cur.get('temperature_2m'),
        'code': code,
        'conditions': libelle,
        'icone': icone,
        'humidite': cur.get('relative_humidity_2m'),
        'vent_kmh': cur.get('wind_speed_10m'),
        'vent_direction_deg': cur.get('wind_direction_10m'),
        'vent_direction': _nom_vent(cur.get('wind_direction_10m')),
        'proba_pluie': cur.get('precipitation_probability'),
        'lever_soleil': (daily.get('sunrise') or [None])[0],
        'coucher_soleil': (daily.get('sunset') or [None])[0],
        'max_jour': (daily.get('temperature_2m_max') or [None])[0],
        'min_jour': (daily.get('temperature_2m_min') or [None])[0],
        'previsions': _previsions_courtes(d),
        'horodatage': timezone.now().isoformat(),
        'source': 'temps_reel',
    }
    cache.set(cle_cache, resultat, TTL_CACHE)
    return resultat


@login_required
def api_meteo(request):
    """GET /api/meteo/?lat=..&lon=..&lang=fr — conditions actuelles + prévisions."""
    lat, lon = _valider_coordonnees(
        request.GET.get('lat'), request.GET.get('lon'))
    if lat is None:
        return JsonResponse({'ok': False, 'erreur': 'Coordonnées GPS invalides.'}, status=400)
    langue = (request.GET.get('lang') or 'fr')[:2]
    donnees = recuperer_meteo(lat, lon, langue)
    if donnees is None:
        return JsonResponse(
            {'ok': False, 'erreur': 'Données météo indisponibles pour le moment. '
                                    'Réessayez plus tard.'}, status=503)
    return JsonResponse(donnees)