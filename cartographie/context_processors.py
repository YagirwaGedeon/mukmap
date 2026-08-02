# -*- coding: utf-8 -*-
from django.templatetags.static import static
from .branding import DEVELOPPEUR, LOGO_FICHIER, VERSION
from .i18n import LANGUES, TRADUCTIONS


def mukmap_langue(request):
    """Injecte la langue courante et le dictionnaire de traductions dans tous les templates."""
    langue = getattr(request, 'LANGUAGE_CODE', 'fr') or 'fr'
    if langue not in dict(LANGUES):
        langue = 'fr'
    dico_actif = {}
    dico_fr = {}
    for cle, valeurs in TRADUCTIONS.items():
        if isinstance(valeurs, dict):
            if langue in valeurs:
                dico_actif[cle] = valeurs[langue]
            if 'fr' in valeurs:
                dico_fr[cle] = valeurs['fr']
    return {
        'mukmap_langue': langue,
        'mukmap_langues': LANGUES,
        'mukmap_i18n': {
            'langue': langue,
            'traductions': {langue: dico_actif, 'fr': dico_fr},
        },
        # Identité visuelle centralisée (logo géré dans branding.py)
        'mukmap_logo': static('logo/' + LOGO_FICHIER),
        'mukmap_logo_fichier': LOGO_FICHIER,
        'mukmap_version': VERSION,
        'mukmap_developpeur': DEVELOPPEUR,
    }
