from django.contrib import admin
from .models import (
    PointGeographique, Projet, Activite, PhotoActivite,
    ProfilAgent, ZoneSecurite, Itineraire,
    CoucheGeometrie, Geometrie, JournalAudit, MediaPoint
)

admin.site.register(PointGeographique)
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
