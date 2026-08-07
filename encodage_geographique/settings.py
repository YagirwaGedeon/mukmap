import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _lire_secret():
    """Clé secrète : variable d'environnement DJANGO_SECRET_KEY, sinon fichier
    local .django-secret (généré une fois, hors versionnage). Jamais de clé
    codée en dur dans le dépôt."""
    valeur = os.environ.get('DJANGO_SECRET_KEY')
    if valeur:
        return valeur.strip() or None
    fichier = BASE_DIR / '.django-secret'
    if fichier.exists():
        return fichier.read_text().strip() or None
    from django.core.management.utils import get_random_secret_key
    valeur = get_random_secret_key()
    fichier.write_text(valeur)
    return valeur


SECRET_KEY = _lire_secret()

DEBUG = os.environ.get('DJANGO_DEBUG', 'True').lower() in ('1', 'true', 'yes', 'on')

ALLOWED_HOSTS = [h.strip() for h in os.environ.get('DJANGO_ALLOWED_HOSTS', '*').split(',') if h.strip()]

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'cartographie',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'cartographie.middleware.NoCacheMiddleware',
'django.contrib.sessions.middleware.SessionMiddleware',
'cartographie.middleware.LangueMiddleware',
'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'encodage_geographique.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
                'cartographie.context_processors.mukmap_langue',
            ],
        },
    },
]

WSGI_APPLICATION = 'encodage_geographique.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'fr-fr'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATICFILES_DIRS = [BASE_DIR / 'cartographie' / 'static']
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

LOGIN_URL = '/connexion/'
LOGIN_REDIRECT_URL = '/'

# Export de cartes : les images base64 (JPEG haute résolution) sont envoyées
# au serveur pour composer les PDF — il faut autoriser des corps plus gros.
DATA_UPLOAD_MAX_MEMORY_SIZE = 50 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 50 * 1024 * 1024

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Mots de passe par défaut connus à signaler aux superadmins pour qu'ils les
# changent. Surcharger via DJANGO_PASSWORDS_DEFAUT (listes séparées par des virgules).
PASSWORDS_DEFAUT_SUPERADMIN = [
    p.strip()
    for p in os.environ.get(
        'DJANGO_PASSWORDS_DEFAUT',
        'YENE2026,VALIO2026,DECHARTE2026',
    ).split(',')
    if p.strip()
]
