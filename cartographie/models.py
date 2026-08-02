from django.db import models
from django.contrib.auth.models import User
from django.contrib.auth import get_user_model


class PointGeographique(models.Model):
    CATEGORIE_CHOICES = [
        ('hopital', 'Hôpital'), ('ecole', 'École'), ('eglise', 'Église'),
        ('police', 'Police'), ('marche', 'Marché'), ('projet', 'Projet'),
        ('incident', 'Incident'), ('village', 'Village'), ('ville', 'Ville'),
        ('pont', 'Pont'), ('route', 'Route'), ('entreprise', 'Entreprise'),
        ('zone_rouge', 'Zone rouge'), ('zone_verte', 'Zone verte'),
        ('zone_orange', 'Zone orange'), ('autre', 'Autre'),
    ]
    STATUT_CHOICES = [
        ('actif', 'Actif'), ('inactif', 'Inactif'),
        ('en_cours', 'En cours'), ('termine', 'Terminé'),
    ]
    nom = models.CharField(max_length=200, verbose_name="Nom du lieu")
    description = models.TextField(blank=True, verbose_name="Description")
    latitude = models.FloatField(verbose_name="Latitude")
    longitude = models.FloatField(verbose_name="Longitude")
    photo = models.ImageField(upload_to='photos_lieux/', blank=True, verbose_name="Photo du lieu")
    categorie = models.CharField(max_length=20, choices=CATEGORIE_CHOICES, default='autre', verbose_name="Catégorie")
    statut = models.CharField(max_length=20, choices=STATUT_CHOICES, default='actif', verbose_name="État")
    province = models.CharField(max_length=100, blank=True, verbose_name="Province")
    commune = models.CharField(max_length=100, blank=True, verbose_name="Commune")
    quartier = models.CharField(max_length=100, blank=True, verbose_name="Quartier")
    projet = models.ForeignKey('Projet', on_delete=models.SET_NULL, null=True, blank=True, related_name='points', verbose_name="Projet")
    activite = models.ForeignKey('Activite', on_delete=models.SET_NULL, null=True, blank=True, related_name='points', verbose_name="Activité")
    auteur = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Auteur")
    date_creation = models.DateTimeField(auto_now_add=True, verbose_name="Date d'encodage")
    donnees = models.JSONField(default=dict, blank=True, verbose_name="Données complètes (import)")
    source_fichier = models.CharField(max_length=255, blank=True, verbose_name="Fichier source")
    source_format = models.CharField(max_length=20, blank=True, verbose_name="Format source")

    class Meta:
        ordering = ['-date_creation']
        verbose_name = "Point Géographique"
        verbose_name_plural = "Points Géographiques"

    def __str__(self):
        return f"{self.nom} ({self.latitude}, {self.longitude})"


class Projet(models.Model):
    STATUT_CHOICES = [
        ('actif', 'Actif'), ('archive', 'Archivé'),
    ]
    nom = models.CharField(max_length=200, verbose_name="Nom du projet")
    description = models.TextField(blank=True, verbose_name="Description du projet")
    but = models.TextField(blank=True, verbose_name="But de l'activité")
    statut = models.CharField(max_length=20, choices=STATUT_CHOICES, default='actif', verbose_name="Statut")
    cree_par = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='projets_crees', verbose_name="Créé par")
    date_creation = models.DateTimeField(auto_now_add=True, verbose_name="Date de création")

    class Meta:
        ordering = ['-date_creation']
        verbose_name = "Projet"
        verbose_name_plural = "Projets"

    def __str__(self):
        return self.nom


class ProfilAgent(models.Model):
    utilisateur = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profil')
    telephone = models.CharField(max_length=20, verbose_name="Numéro de téléphone")
    fonction = models.CharField(max_length=200, verbose_name="Fonction dans le projet")
    motif_mission = models.TextField(blank=True, verbose_name="Motif de la mission")
    photo = models.ImageField(upload_to='agents/', blank=True, verbose_name="Photo d'identité")
    latitude = models.FloatField(null=True, blank=True, verbose_name="Latitude")
    longitude = models.FloatField(null=True, blank=True, verbose_name="Longitude")
    est_bloque = models.BooleanField(default=False, verbose_name="Bloqué")
    date_enregistrement = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Profil Agent"
        verbose_name_plural = "Profils Agents"

    def __str__(self):
        return f"{self.utilisateur.get_full_name() or self.utilisateur.username} - {self.fonction}"


class Activite(models.Model):
    STATUT_CHOICES = [
        ('planifiee', 'Planifiée'), ('en_cours', 'En cours'),
        ('terminee', 'Terminée'), ('annulee', 'Annulée'),
    ]
    projet = models.ForeignKey(Projet, on_delete=models.CASCADE, related_name='activites', verbose_name="Projet")
    nom_activite = models.CharField(max_length=255, blank=True, verbose_name="Nom de l'activité réalisée")
    description = models.TextField(blank=True, verbose_name="Description de l'activité")
    agent = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='activites', verbose_name="Agent")
    rapport = models.TextField(verbose_name="Rapport d'activité")
    observations = models.TextField(blank=True, verbose_name="Observations")
    nombre_beneficiaires = models.PositiveIntegerField(default=0, verbose_name="Nombre de bénéficiaires")
    latitude = models.FloatField(verbose_name="Latitude")
    longitude = models.FloatField(verbose_name="Longitude")
    zone_visitee = models.CharField(max_length=200, blank=True, verbose_name="Zone visitée")
    niveau_securite = models.CharField(max_length=20, blank=True, verbose_name="Niveau de sécurité de la zone")
    statut = models.CharField(max_length=20, choices=STATUT_CHOICES, default='en_cours', verbose_name="Statut")
    date_debut = models.DateTimeField(null=True, blank=True, verbose_name="Date de début")
    date_fin = models.DateTimeField(null=True, blank=True, verbose_name="Date de fin")
    date_creation = models.DateTimeField(auto_now_add=True, verbose_name="Date de l'activité")

    class Meta:
        ordering = ['-date_creation']
        verbose_name = "Activité"
        verbose_name_plural = "Activités"

    def __str__(self):
        nom = self.nom_activite or 'Activité'
        return f"{nom} - {self.projet.nom} - {self.date_creation.strftime('%d/%m/%Y %H:%M')}"


class PhotoActivite(models.Model):
    activite = models.ForeignKey(Activite, on_delete=models.CASCADE, related_name='photos', verbose_name="Activité")
    image = models.ImageField(upload_to='photos_activites/', verbose_name="Photo")
    date_upload = models.DateTimeField(auto_now_add=True, verbose_name="Date d'upload")

    class Meta:
        verbose_name = "Photo"
        verbose_name_plural = "Photos"
        ordering = ['date_upload']

    def __str__(self):
        return f"Photo {self.pk} - {self.activite}"


class ZoneSecurite(models.Model):
    STATUT_CHOICES = [
        ('dangereuse', 'Zone dangereuse'),
        ('securisee', 'Zone sécurisée'),
        ('indisponible', 'Information indisponible'),
    ]
    nom = models.CharField(max_length=200, verbose_name="Nom de la zone")
    statut = models.CharField(max_length=20, choices=STATUT_CHOICES, verbose_name="Statut")
    motif = models.TextField(blank=True, verbose_name="Motif de déclaration")
    type_geometrie = models.CharField(max_length=50, default='Point', verbose_name="Type de géométrie")
    coordonnees = models.JSONField(verbose_name="Coordonnées", help_text="Coordonnées GeoJSON")
    rayon = models.FloatField(default=0, verbose_name="Rayon (m)", help_text="Rayon en mètres pour les zones ponctuelles")
    projet = models.ForeignKey(Projet, on_delete=models.SET_NULL, null=True, blank=True, related_name='zones', verbose_name="Projet")
    auteur = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='zones_crees', verbose_name="Auteur")
    modifie_par = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='zones_modifiees', verbose_name="Modifié par")
    date_declaration = models.DateTimeField(auto_now_add=True, verbose_name="Date de déclaration")
    date_modification = models.DateTimeField(auto_now=True, verbose_name="Dernière modification")

    class Meta:
        ordering = ['-date_declaration']
        verbose_name = "Zone de sécurité"
        verbose_name_plural = "Zones de sécurité"

    def __str__(self):
        return f"{self.nom} - {self.get_statut_display()}"

    def couleur(self):
        return {'dangereuse': '#ef4444', 'securisee': '#22c55e', 'indisponible': '#eab308'}.get(self.statut, '#888')


class Itineraire(models.Model):
    utilisateur = models.ForeignKey(User, on_delete=models.CASCADE, related_name='itineraire')
    nom = models.CharField(max_length=200, verbose_name="Nom de l'itinéraire")
    coordonnees = models.JSONField(verbose_name="Coordonnées du tracé")
    projet = models.ForeignKey(Projet, on_delete=models.SET_NULL, null=True, blank=True, related_name='itineraires', verbose_name="Projet")
    analyse = models.JSONField(default=list, blank=True, verbose_name="Analyse des zones traversées")
    alerte = models.TextField(blank=True, verbose_name="Alerte")
    date_creation = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date_creation']
        verbose_name = "Itinéraire"
        verbose_name_plural = "Itinéraires"

    def __str__(self):
        return f"{self.nom} - {self.utilisateur.username}"


class CoucheGeometrie(models.Model):
    TYPE_CHOICES = [
        ('point', 'Points'),
        ('ligne', 'Lignes'),
        ('polygone', 'Polygones'),
    ]
    nom = models.CharField(max_length=200, verbose_name="Nom de la couche")
    type_geometrie = models.CharField(max_length=20, choices=TYPE_CHOICES, verbose_name="Type de géométrie")
    fichier_source = models.CharField(max_length=255, blank=True, verbose_name="Fichier source")
    srid = models.IntegerField(default=4326, verbose_name="SRID", help_text="Système de coordonnées (EPSG)")
    style_couleur = models.CharField(max_length=7, default='#3388ff', verbose_name="Couleur de style")
    projet = models.ForeignKey(Projet, on_delete=models.SET_NULL, null=True, blank=True, related_name='couches', verbose_name="Projet")
    fichier_kml = models.FileField(upload_to='kml_imports/', blank=True, verbose_name="Fichier KML généré")
    date_import = models.DateTimeField(auto_now_add=True, verbose_name="Date d'import")

    class Meta:
        ordering = ['-date_import']
        verbose_name = "Couche de géométrie"
        verbose_name_plural = "Couches de géométries"

    def __str__(self):
        return f"{self.nom} ({self.get_type_geometrie_display()})"


class Geometrie(models.Model):
    couche = models.ForeignKey(CoucheGeometrie, on_delete=models.CASCADE, related_name='geometries', verbose_name="Couche")
    type = models.CharField(max_length=50, verbose_name="Type GeoJSON")
    coordonnees = models.JSONField(verbose_name="Coordonnées")
    proprietes = models.JSONField(default=dict, blank=True, verbose_name="Propriétés")

    class Meta:
        verbose_name = "Géométrie"
        verbose_name_plural = "Géométries"

    def __str__(self):
        return f"{self.couche.nom} - {self.type}"


class MediaPoint(models.Model):
    TYPE_CHOICES = [
        ('photo', 'Photo'), ('video', 'Vidéo'),
        ('pdf', 'Document PDF'), ('audio', 'Audio'),
    ]
    point = models.ForeignKey(PointGeographique, on_delete=models.CASCADE, related_name='medias', verbose_name="Point")
    type = models.CharField(max_length=10, choices=TYPE_CHOICES, default='photo', verbose_name="Type")
    fichier = models.FileField(upload_to='medias_points/', verbose_name="Fichier")
    date_upload = models.DateTimeField(auto_now_add=True, verbose_name="Date d'upload")

    class Meta:
        ordering = ['date_upload']
        verbose_name = "Média"
        verbose_name_plural = "Médias"

    def __str__(self):
        return f"{self.get_type_display()} {self.pk} - {self.point.nom}"


class JournalAudit(models.Model):
    utilisateur = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Utilisateur")
    action = models.CharField(max_length=300, verbose_name="Action réalisée")
    date = models.DateTimeField(auto_now_add=True, verbose_name="Date et heure")
    adresse_ip = models.GenericIPAddressField(blank=True, null=True, verbose_name="Adresse IP")
    details = models.TextField(blank=True, verbose_name="Détails")

    class Meta:
        ordering = ['-date']
        verbose_name = "Journal d'audit"
        verbose_name_plural = "Journal d'audit"

    def __str__(self):
        return f"{self.date.strftime('%d/%m/%Y %H:%M')} - {self.utilisateur} - {self.action[:50]}"


class ActiviteModele(models.Model):
    projet = models.ForeignKey(Projet, on_delete=models.CASCADE, related_name='activites_modeles', verbose_name="Projet")
    nom = models.CharField(max_length=255, verbose_name="Nom de l'activité modèle")
    cree_par = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='activites_modeles', verbose_name="Créé par")
    date_creation = models.DateTimeField(auto_now_add=True, verbose_name="Date de création")

    class Meta:
        ordering = ['nom']
        verbose_name = "Activité modèle"
        verbose_name_plural = "Activités modèles"

    def __str__(self):
        return f"{self.nom} ({self.projet.nom})"
