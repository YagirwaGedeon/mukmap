from django.db import models
from django.contrib.auth.models import User
from django.contrib.auth import get_user_model
from django.utils import timezone
import hashlib


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
    style_options = models.JSONField(default=dict, blank=True, verbose_name="Options de style",
                                     help_text="Couleur, symbole, taille, opacité, étiquette et catégorisation")
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


class CodeAccesAvance(models.Model):
    """Code d'accès au Mode Avancé (temporaire ou permanent). Seul le hash est stocké."""
    TYPE_CHOICES = [
        ('temporaire', 'Code temporaire'),
        ('permanent', 'Code permanent'),
    ]
    libelle = models.CharField(max_length=200, blank=True, verbose_name="Libellé")
    code_hash = models.CharField(max_length=64, verbose_name="Code (empreinte SHA-256)")
    type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='permanent', verbose_name="Type")
    expire_le = models.DateTimeField(null=True, blank=True, verbose_name="Valable jusqu'au")
    max_utilisations = models.PositiveIntegerField(null=True, blank=True, verbose_name="Nombre d'utilisations max", help_text="Vide = illimité")
    utilisations = models.PositiveIntegerField(default=0, verbose_name="Utilisations effectuées")
    actif = models.BooleanField(default=True, verbose_name="Actif")
    cree_par = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='codes_crees', verbose_name="Créé par")
    date_creation = models.DateTimeField(auto_now_add=True, verbose_name="Date de création")

    class Meta:
        ordering = ['-date_creation']
        verbose_name = "Code d'accès au Mode Avancé"
        verbose_name_plural = "Codes d'accès au Mode Avancé"

    def __str__(self):
        return f"{self.get_type_display()} #{self.pk} ({self.utilisations} utilisations)"

    @staticmethod
    def _normaliser(code):
        """Normalisation identique au moment du stockage et de la vérification."""
        return str(code).strip().upper()

    @staticmethod
    def _hacher_legacy(code):
        """Ancienne empreinte SHA-256 non salée (rétro-compatibilité)."""
        return hashlib.sha256(('mukmap|' + str(code)).strip().upper().encode('utf-8')).hexdigest()

    @staticmethod
    def hacher(code):
        """Empreinte sécurisée (PBKDF2 via Django). Salée, lent par conception."""
        from django.contrib.auth.hashers import make_password
        return make_password(CodeAccesAvance._normaliser(code))

    def verifier_code(self, code):
        """Vérifie un code saisi contre l'empreinte stockée.

        Accepte les anciennes empreintes SHA-256 et les migre vers PBKDF2 au
        premier succès pour ne pas invalider les codes déjà distribués.
        """
        from django.contrib.auth.hashers import check_password
        code_brut = str(code).strip().upper()
        h = self.code_hash or ''
        if '$' in h:
            return check_password(code_brut, h)
        if h == CodeAccesAvance._hacher_legacy(code_brut):
            self.code_hash = CodeAccesAvance.hacher(code_brut)
            if self.pk:
                self.save(update_fields=['code_hash'])
            return True
        return False

    @staticmethod
    def generer():
        import secrets
        import string
        alphabet = string.ascii_uppercase + string.digits
        return '-'.join(''.join(secrets.choice(alphabet) for _ in range(4)) for _ in range(3))

    def est_valide(self):
        if not self.actif:
            return False
        if self.expire_le and timezone.now() > self.expire_le:
            return False
        if self.max_utilisations is not None and self.utilisations >= self.max_utilisations:
            return False
        return True

    def utiliser(self):
        self.utilisations += 1
        self.save(update_fields=['utilisations'])


class PreferenceUtilisateur(models.Model):
    """Préférences persistantes de l'utilisateur (mode, profil métier, fond par défaut)."""
    MODE_CHOICES = [
        ('classique', 'Classique'),
        ('avance', 'Avancé'),
    ]
    utilisateur = models.OneToOneField(User, on_delete=models.CASCADE, related_name='preference', verbose_name="Utilisateur")
    mode = models.CharField(max_length=20, choices=MODE_CHOICES, default='classique', verbose_name="Mode d'utilisation")
    profil_metier = models.CharField(max_length=30, blank=True, verbose_name="Profil métier")
    basemap_defaut = models.CharField(max_length=100, blank=True, verbose_name="Fond de carte par défaut")
    code_lie = models.ForeignKey(CodeAccesAvance, on_delete=models.SET_NULL, null=True, blank=True, related_name='utilisateurs_lies', verbose_name="Code permanent utilisé")
    date_maj = models.DateTimeField(auto_now=True, verbose_name="Dernière modification")

    class Meta:
        verbose_name = "Préférence utilisateur"
        verbose_name_plural = "Préférences utilisateurs"

    def __str__(self):
        return f"{self.utilisateur.username} — {self.get_mode_display()}"


class FondCartePersonnalise(models.Model):
    """Fond de carte défini par l'utilisateur (XYZ / WMS / WMTS / MVT / GeoTIFF…), pour le Mode Avancé."""
    TYPE_CHOICES = [
        ('xyz', 'XYZ / tuiles raster'),
        ('wms', 'WMS'),
        ('wmts', 'WMTS'),
        ('vector', 'Vectoriel (MVT)'),
        ('geotiff', 'GeoTIFF (COG)'),
        ('mbtiles', 'MBTiles'),
        ('arcgis', 'ArcGIS REST (tuiles)'),
    ]
    CATEGORIE_CHOICES = [
        ('geologie', 'Géologie'),
        ('mines', 'Mines'),
        ('environnement', 'Environnement'),
        ('topographie', 'Topographie'),
        ('imagerie', 'Imagerie'),
        ('generale', 'Cartographie générale'),
    ]
    nom = models.CharField(max_length=120, verbose_name="Nom")
    type_fond = models.CharField(max_length=8, choices=TYPE_CHOICES, default='xyz', verbose_name="Type")
    url = models.TextField(verbose_name="URL des tuiles", help_text="Modèle d'URL : {z}/{x}/{y} (XYZ/MVT), {bbox-epsg-3857} (WMS), ou {TileMatrix}/{TileCol}/{TileRow} (WMTS)")
    attribution = models.CharField(max_length=255, blank=True, verbose_name="Attribution")
    categorie = models.CharField(max_length=30, choices=CATEGORIE_CHOICES, default='geologie', verbose_name="Catégorie")
    cle_api = models.CharField(max_length=200, blank=True, verbose_name="Clé API (optionnelle)", help_text="Placez {cle_api} dans l'URL : la clé est injectée à l'affichage.")
    crs = models.CharField(max_length=30, default='EPSG:3857', verbose_name="Projection / CRS", help_text="MapLibre n'affiche que le Web Mercator (EPSG:3857) — autre CRS = fond documenté uniquement.")
    layers = models.CharField(max_length=300, blank=True, verbose_name="Source-layer (MVT)", help_text="Nom de la couche du tuilage vectoriel à afficher (optionnel hors MVT).")
    projet = models.ForeignKey('Projet', on_delete=models.SET_NULL, null=True, blank=True, related_name='fonds_cartes', verbose_name="Projet (portée)", help_text="Si défini, le fond est partagé dans le projet ; sinon il reste dans les préférences de l'utilisateur.")
    auteur = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='fonds_cartes', verbose_name="Créé par")
    visible = models.BooleanField(default=True, verbose_name="Visible")
    ordre = models.PositiveIntegerField(default=0, verbose_name="Ordre d'affichage")
    date_creation = models.DateTimeField(auto_now_add=True, verbose_name="Date de création")

    class Meta:
        ordering = ['-visible', 'ordre', 'nom']
        verbose_name = "Fond de carte personnalisé"
        verbose_name_plural = "Fonds de carte personnalisés"

    def __str__(self):
        return f"{self.nom} ({self.get_type_fond_display()})"


class CoucheWMS(models.Model):
    """Couche WMS superposable au fond de carte, avec opacité réglable (Mode Avancé)."""
    nom = models.CharField(max_length=150, verbose_name="Nom")
    url = models.TextField(verbose_name="URL WMS (GetMap)", help_text="Ex. https://serveur/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=nom&STYLES=&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png")
    layers = models.CharField(max_length=500, blank=True, verbose_name="Noms de couches (séparés par des virgules)")
    version = models.CharField(max_length=20, default='1.1.1', verbose_name="Version WMS")
    attribution = models.CharField(max_length=255, blank=True, verbose_name="Attribution")
    opacite = models.FloatField(default=0.7, verbose_name="Opacité (0-1)")
    visibilite = models.BooleanField(default=True, verbose_name="Visible sur la carte")
    ordre = models.PositiveIntegerField(default=0, verbose_name="Ordre d'affichage")
    projet = models.ForeignKey('Projet', on_delete=models.SET_NULL, null=True, blank=True, related_name='couches_wms', verbose_name="Projet")
    auteur = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='couches_wms', verbose_name="Créé par")
    date_creation = models.DateTimeField(auto_now_add=True, verbose_name="Date de création")

    class Meta:
        ordering = ['ordre', 'nom']
        verbose_name = "Couche WMS"
        verbose_name_plural = "Couches WMS"

    def __str__(self):
        return self.nom


class ImageAerienne(models.Model):
    """Orthophoto / image drone géoréférencée superposée à la carte (Mode Avancé).

    Géoréférencement : WorldFile compagnon (.pgw/.jgw/.tfw), coordonnées EXIF GPS
    de l'appareil, ou emprise (bbox) saisie manuellement.
    """
    TYPE_CHOICES = [
        ('ortho', 'Orthophoto'),
        ('drone', 'Image drone'),
        ('satellite', 'Imagerie satellite'),
        ('photo', 'Photo géolocalisée'),
    ]
    MODE_GEO_CHOICES = [
        ('worldfile', 'WorldFile'),
        ('exif', 'Coordonnées EXIF GPS'),
        ('bbox', 'Emprise manuelle'),
    ]
    nom = models.CharField(max_length=150, verbose_name="Nom")
    fichier = models.ImageField(upload_to='imagerie/', verbose_name="Image")
    type_imagerie = models.CharField(max_length=20, choices=TYPE_CHOICES, default='ortho', verbose_name="Type d'imagerie")
    mode_geo = models.CharField(max_length=20, choices=MODE_GEO_CHOICES, default='bbox', verbose_name="Mode de géoréférencement")
    min_lon = models.FloatField(null=True, blank=True, verbose_name="Longitude min (ouest)")
    min_lat = models.FloatField(null=True, blank=True, verbose_name="Latitude min (sud)")
    max_lon = models.FloatField(null=True, blank=True, verbose_name="Longitude max (est)")
    max_lat = models.FloatField(null=True, blank=True, verbose_name="Latitude max (nord)")
    coords = models.JSONField(null=True, blank=True, verbose_name="Coins exacts de l'image", help_text="[[lon,lat] ×4] SW, SE, NE, NW — issu du WorldFile")
    altitude_m = models.FloatField(null=True, blank=True, verbose_name="Altitude de vol (m)")
    date_prise = models.DateField(null=True, blank=True, verbose_name="Date de prise de vue")
    description = models.TextField(blank=True, verbose_name="Description")
    visibilite = models.BooleanField(default=True, verbose_name="Visible sur la carte")
    projet = models.ForeignKey('Projet', on_delete=models.SET_NULL, null=True, blank=True, related_name='images_aeriennes', verbose_name="Projet")
    auteur = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='images_aeriennes', verbose_name="Ajouté par")
    cree_le = models.DateTimeField(auto_now_add=True, verbose_name="Date d'ajout")

    class Meta:
        ordering = ['-cree_le']
        verbose_name = "Image aérienne"
        verbose_name_plural = "Images aériennes (orthophotos)"

    def __str__(self):
        return self.nom
