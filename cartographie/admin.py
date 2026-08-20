from django.contrib import admin
from .models import (
    PointGeographique, Projet, Activite, PhotoActivite,
    ProfilAgent, ZoneSecurite, Itineraire,
    CoucheGeometrie, Geometrie, JournalAudit, MediaPoint,
    CodeAccesAvance, PreferenceUtilisateur, FondCartePersonnalise, ImageAerienne, CoucheWMS,
    ProjetAdduction, OuvrageHydraulique, TraceAdduction,
    ReleveSource, ReleveVillage, ReleveConsommation, ReleveRepere,
    StatutPoint, HistoriquePoint, Visite,
)


@admin.register(PointGeographique)
class PointGeographiqueAdmin(admin.ModelAdmin):
    list_display = ('code', 'nom', 'categorie', 'statut', 'projet', 'province', 'territoire', 'auteur', 'date_creation')
    list_filter = ('categorie', 'statut', 'archive', 'projet', 'province')
    search_fields = ('code', 'identifiant', 'nom', 'description', 'adresse', 'village')


@admin.register(StatutPoint)
class StatutPointAdmin(admin.ModelAdmin):
    list_display = ('nom', 'code', 'couleur', 'ordre', 'projet', 'actif')
    list_filter = ('actif', 'projet')
    search_fields = ('nom', 'code')


@admin.register(HistoriquePoint)
class HistoriquePointAdmin(admin.ModelAdmin):
    list_display = ('point', 'type', 'action', 'utilisateur', 'date')
    list_filter = ('type', 'date')
    search_fields = ('action', 'point__nom', 'point__code')


@admin.register(Visite)
class VisiteAdmin(admin.ModelAdmin):
    list_display = ('point', 'agent', 'date_visite', 'statut')
    list_filter = ('statut', 'date_visite')
    search_fields = ('point__nom', 'point__code', 'notes')


admin.site.register(Projet)
admin.site.register(ProfilAgent)
admin.site.register(Activite)
admin.site.register(PhotoActivite)
admin.site.register(ZoneSecurite)
admin.site.register(Itineraire)
admin.site.register(CoucheGeometrie)
admin.site.register(Geometrie)
admin.site.register(JournalAudit)
admin.site.register(MediaPoint)
admin.site.register(CodeAccesAvance)
admin.site.register(PreferenceUtilisateur)
admin.site.register(FondCartePersonnalise)
admin.site.register(ImageAerienne)
admin.site.register(CoucheWMS)
admin.site.register(ProjetAdduction)
admin.site.register(OuvrageHydraulique)
admin.site.register(TraceAdduction)
admin.site.register(ReleveSource)
admin.site.register(ReleveVillage)
admin.site.register(ReleveConsommation)
admin.site.register(ReleveRepere)
