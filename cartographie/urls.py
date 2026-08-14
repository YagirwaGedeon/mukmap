from django.urls import path
from . import views
from . import api_points
from . import offline
from . import water_supply
from . import api_audit

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
    path('table-attributaire/', views.table_attributaire, name='table_attributaire'),

    # ── Table attributaire professionnelle ─────────────────────
    path('api/table-points/', api_points.api_points_lister, name='api_table_points'),
    path('api/table-points/creer/', api_points.api_points_creer, name='api_table_points_creer'),
    path('api/table-points/<int:pk>/modifier/', api_points.api_point_modifier, name='api_table_point_modifier'),
    path('api/table-points/supprimer/', api_points.api_points_supprimer, name='api_table_points_supprimer'),
    path('api/table-points/export/<str:format>/', api_points.api_points_export, name='api_table_points_export'),

    # ── Mode hors connexion / synchronisation ─────────────────
    path('api/offline/sync/', offline.api_sync, name='api_offline_sync'),
    path('api/offline/traces/', offline.api_traces_sync, name='api_offline_traces'),
    path('api/offline/photos/', offline.api_photo_upload, name='api_offline_photos'),
    path('export/carte-pdf/', views.export_carte_pdf, name='export_carte_pdf'),
    path('export/<str:format>/', views.export_points, name='export_points'),

    path('dashboard/', views.dashboard, name='dashboard'),
    path('qualite/', views.tableau_qualite, name='qualite_tableau'),
    path('adduction/dashboard/', views.adduction_dashboard, name='adduction_dashboard'),

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

    # ── Mode Avancé / codes d'accès ──────────────────────────
    path('api/mode/', views.api_mode, name='api_mode'),
    path('api/mode/changer/', views.api_mode_changer, name='api_mode_changer'),
    path('mode-avance/administration/', views.mode_avance_admin, name='mode_avance_admin'),
    path('api/mode-avance/codes/', views.api_codes_mode, name='api_codes_mode'),
    path('api/mode-avance/codes/<int:pk>/revoquer/', views.api_code_revoquer, name='api_code_revoquer'),

    # ── Fonds de carte personnalisés (Mode Avancé) ────────────
    path('api/fonds-personnalises/', views.api_fonds_personnalises, name='api_fonds_personnalises'),
    path('api/fonds-personnalises/<int:pk>/', views.api_fond_personnalise_detail, name='api_fond_personnalise_detail'),

    # ── Couches WMS superposables (Mode Avancé) ───────────────
    path('api/couches-wms/', views.api_couches_wms, name='api_couches_wms'),
    path('api/couches-wms/<int:pk>/', views.api_couche_wms_detail, name='api_couche_wms_detail'),

    # ── Imagerie aérienne (orthophotos drone, Mode Avancé) ────
    path('api/imagerie/', views.api_imagerie, name='api_imagerie'),
    path('api/imagerie/<int:pk>/', views.api_imagerie_detail, name='api_imagerie_detail'),
    path('api/imagerie/<int:pk>/visibilite/', views.api_imagerie_visibilite, name='api_imagerie_visibilite'),

    # ── Adduction d'eau — Water Supply Survey ─────────────────
    path('api/adduction/referentiels/', water_supply.referentiels_adduction, name='api_adduction_referentiels'),
    path('api/adduction/projets/', water_supply.api_projets_adduction, name='api_adduction_projets'),
    path('api/adduction/projets/<int:pk>/', water_supply.detail_projet_adduction, name='api_adduction_projet'),
    path('api/adduction/projets/<int:pk>/stats/', water_supply.stats_projet, name='api_adduction_stats'),
    path('api/adduction/projets/<int:pk>/rapport/', water_supply.rapport_projet, name='api_adduction_rapport'),
    path('api/adduction/projets/<int:pk>/export/<str:format>/', water_supply.exporter_ouvrages, name='api_adduction_export'),
    path('api/adduction/ouvrages/', water_supply.liste_ouvrages, name='api_adduction_ouvrages'),
    path('api/adduction/ouvrages/<int:pk>/', water_supply.detail_ouvrage, name='api_adduction_ouvrage'),
    path('api/adduction/traces/', water_supply.liste_traces, name='api_adduction_traces'),
    path('api/adduction/traces/<int:pk>/', water_supply.detail_trace, name='api_adduction_trace'),
    path('api/adduction/traces/<int:pk>/profil.pdf', water_supply.export_profil_pdf, name='api_adduction_profil_pdf'),

    # ── Fiche détaillée d'un élément (historique d'audit) ─────
    path('api/audit/objet/', api_audit.historique_objet, name='api_audit_objet'),
]
