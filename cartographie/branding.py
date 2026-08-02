# -*- coding: utf-8 -*-
"""MUKMAP — Identité visuelle centralisée.

Toute modification du logo officiel se fait en remplaçant le fichier
ci-dessous : l'interface, la PWA et les rapports utilisent tous ce module.
"""

import os

from django.conf import settings

LOGO_FICHIER = 'MUKMAP.png'
LOGO_RELATIF = os.path.join('logo', LOGO_FICHIER)

VERSION = '1.0'
NOM = 'MUKMAP'
TAGLINE_FR = 'Plateforme SIG professionnelle'
DEVELOPPEUR = 'Ir. Yagirwa Gedeon'

# ── Couleurs d'identité (PWA / rapports) ────────────────────────
COULEUR_FOND = '#FFFFFF'
COULEUR_THEME = '#4F46E5'
COULEUR_ACCENT = '#6D5DF6'
COULEUR_VERT = '#16A34A'
COULEUR_BLEU = '#2563EB'


def chemin_logo():
    """Chemin absolu du logo officiel sur le serveur (pour les rapports)."""
    return os.path.join(str(settings.STATICFILES_DIRS[0]), LOGO_RELATIF)


def logo_url():
    """URL publique du logo officiel (pour les gabarits)."""
    from django.templatetags.static import static
    return static('logo/' + LOGO_FICHIER)
