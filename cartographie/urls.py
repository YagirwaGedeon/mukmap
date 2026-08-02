from django.urls import path
from . import views

urlpatterns = [
    path('', views.index_cartographie, name='index_cartographie'),
    path('manifest.webmanifest', views.manifest_pwa, name='manifest_pwa'),
    path('sw.js', views.service_worker_pwa, name='service_worker_pwa'),
    path('connexion/', views.connexion, name='connexion'),
    path('deconnexion/', views.deconnexion, name='deconnexion'),
    path('changer-langue/', views.changer_langue, name='changer_langue'),
    path('profil/creer/', views.profil_creer, name='profil_creer'),
    path('profil/edit/', views.profil_edit, name='profil_edit'),

    path('importer/', views.importer_fichier, name='importer_fichier'),
    path('importer/excel/', views.importer_excel, name='importer_excel'),
    path('import/excel-intelligent/', views.importer_excel_v2, name='importer_excel_v2'),
    path('import/', views.import_page, name='import_page'),
    path('points/', views.points_liste, name='points_liste'),
    path('export/<str:format>/', views.export_points, name='export_points'),

    path('dashboard/', views.dashboard, name='dashboard'),

    path('point/<int:pk>/edit/', views.point_edit, name='point_edit'),
    path('point/<int:pk>/supprimer/', views.point_delete, name='point_delete'),
    path('media/<int:pk>/supprimer/', views.media_delete, name='media_delete'),

    path('activite/ajouter/', views.activite_create, name='activite_create'),
    path('activite/<int:pk>/', views.activite_detail, name='activite_detail'),
    path('activite/<int:pk>/supprimer/', views.activite_delete, name='activite_delete'),

    path('projets/', views.projet_list, name='projet_list'),
    path('projet/ajouter/', views.projet_create, name='projet_create'),
    path('projet/<int:pk>/edit/', views.projet_edit, name='projet_edit'),
    path('projet/<int:pk>/archiver/', views.projet_archive, name='projet_archive'),
    path('projet/<int:pk>/activite-modele/ajouter/', views.activite_modele_create, name='activite_modele_create'),
    path('activite-modele/<int:pk>/supprimer/', views.activite_modele_delete, name='activite_modele_delete'),

    path('selection/projet/', views.selection_projet, name='selection_projet'),
    path('api/projets/', views.api_projets, name='api_projets'),
    path('api/activites/', views.api_activites_suggestions, name='api_activites_suggestions'),

    path('zones/', views.zone_list, name='zone_list'),
    path('zone/ajouter/', views.zone_create, name='zone_create'),
    path('zone/<int:pk>/edit/', views.zone_edit, name='zone_edit'),
    path('zone/<int:pk>/supprimer/', views.zone_delete, name='zone_delete'),

    path('itineraire/', views.itineraire_list, name='itineraire_list'),
    path('itineraire/ajouter/', views.itineraire_create, name='itineraire_create'),
    path('itineraire/<int:pk>/', views.itineraire_detail, name='itineraire_detail'),
    path('itineraire/<int:pk>/supprimer/', views.itineraire_delete, name='itineraire_delete'),

    path('audit/', views.audit_list, name='audit_list'),

    path('agents/', views.agent_list, name='agent_list'),
    path('agent/creer/', views.agent_create, name='agent_create'),
    path('agent/<int:pk>/bloquer/', views.agent_bloquer, name='agent_bloquer'),

    path('rapport/', views.rapport_generer, name='rapport_generer'),
    path('rapport/telecharger/<str:format>/', views.rapport_telecharger, name='rapport_telecharger'),

    path('geometrie/importer/', views.importer_geometrie, name='importer_geometrie'),
    path('import/choix-colonnes/', views.import_choix_colonnes, name='import_choix_colonnes'),
    path('geometrie/couche/<int:pk>/supprimer/', views.couche_delete, name='couche_delete'),
    path('geometrie/donnees/', views.geometrie_donnees, name='geometrie_donnees'),
    path('dessin/sauvegarder/', views.dessin_save, name='dessin_save'),
    path('geometrie/<int:pk>/supprimer/', views.geometrie_delete, name='geometrie_delete'),
]
