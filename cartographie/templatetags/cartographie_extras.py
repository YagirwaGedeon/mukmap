from django import template
from urllib.parse import urlencode

register = template.Library()


@register.filter
def get_item(dico, cle):
    """Accès à une clé de dictionnaire depuis un template (ex. stats_par_statut|get_item:val)."""
    if isinstance(dico, dict):
        return dico.get(cle, '')
    try:
        return getattr(dico, str(cle), '')
    except (TypeError, AttributeError):
        return ''


@register.simple_tag(takes_context=True)
def url_replace(context, **kwargs):
    """Conserve les paramètres GET actuels en remplaçant un paramètre
    (ex. {% url_replace page=2 %}, {% url_replace tri='nom' %})."""
    query = context.get('request').GET.copy()
    for cle, valeur in kwargs.items():
        query[cle] = valeur
    return '?' + urlencode(query)


@register.filter
def statut_couleur(code):
    """Couleur d'un statut de point (réplique de la config serveur par défaut)."""
    couleurs = {'actif': '#16a34a', 'nouveau': '#2563eb', 'planifie': '#7c3aed',
                'a_visiter': '#d97706', 'en_cours': '#ea580c', 'visite': '#0891b2',
                'verifie': '#059669', 'termine': '#166534', 'suspendu': '#dc2626',
                'inactif': '#64748b', 'archive': '#475569'}
    return couleurs.get(code, '#6b729c')