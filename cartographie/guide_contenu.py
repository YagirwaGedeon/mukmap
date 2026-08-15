# -*- coding: utf-8 -*-
"""Contenu du Guide Complet d'Utilisation MUKMAP — édité par MUKESHABA."""

META = {
    "app_nom": "MUKMAP",
    "app_version": "1.0",
    "societe": "MUKESHABA",
    "telephone": "+243 971460415",
    "email": "chroniquedejamesmukeshaba@gmail.com",
    "date_guide": "Août 2026",
    "developpeur": "Ir. Yagirwa Gedeon",
    "slogan": "Plateforme SIG professionnelle — collecte, suivi et sécurité",
    "contact": "+243 971460415 | chroniquedejamesmukeshaba@gmail.com",
}

FOOTER = "© MUKESHABA — Tous droits réservés | +243 971460415 | chroniquedejamesmukeshaba@gmail.com"

# Types de blocs : p (paragraphe), b (liste à puces), n (note), t (tableau), c (capture)
CHAPITRES = [
{
    "titre": "1. Introduction à MUKMAP",
    "sections": [
        {"titre": "1.1 Présentation générale",
         "blocs": [
            ("p", "MUKMAP est une plateforme SIG (Système d'Information Géographique) professionnelle développée par MUKESHABA pour la collecte, le suivi, la gestion des risques et la sécurité. Elle permet la cartographie des points d'intérêt, la délimitation des zones de sécurité, le suivi des itinéraires et la génération de rapports d'activités pour la supervision de projets. L'application est conçue pour être utilisée sur ordinateur (bureau), tablette et téléphone portable, avec ou sans connexion internet."),
            ("p", "MUKMAP organise toutes les données géographiques par projet puis par activité : chaque point, tracé, photo ou mesure collecté est rattaché au projet et à l'activité en cours. Cette organisation garantit un suivi rigoureux des opérations de terrain et des rapports fiables."),
            ("p", "L'application est développée par Ir. Yagirwa Gedeon — Consultant SIG & Développeur Web — et éditée par MUKESHABA, entreprise de conception et de développement de logiciels."),
            ("c", "Capture d'écran de la page d'accueil (connexion) de MUKMAP"),
         ]},
        {"titre": "1.2 Objectifs et domaines d'utilisation",
         "blocs": [
            ("p", "MUKMAP s'adresse aux entreprises, ONG, ingénieurs topographes, équipes de terrain et gestionnaires de projets qui doivent collecter, visualiser, analyser et exporter des données géospatiales. Ses principaux usages :"),
            ("b", [
                "Cartographier des points d'intérêt : hôpitaux, écoles, églises, marchés, villages, infrastructures, etc. ;",
                "Délimiter des zones de sécurité et signaler des zones dangereuses ;",
                "Réaliser des levés topographiques : points, repères géodésiques, altitudes, courbes de niveau, profils ;",
                "Suivre les réseaux d'adduction d'eau : captages, bornes-fontaines, réservoirs, villages desservis ;",
                "Travailler sur le terrain avec ou sans connexion (mode hors ligne) ;",
                "Générer des rapports d'activités professionnels en PDF, Word et Excel ;",
                "Importer et exporter des données SIG dans les formats standard : GeoJSON, KML, Shapefile, GPX, DXF.",
            ]),
            ("n", "L'application inclut également un module météo (temps réel et prévisions) intégré aux rapports d'activités, utile pour la planification des missions terrain."),
         ]},
        {"titre": "1.3 Ce que couvre ce guide",
         "blocs": [
            ("p", "Ce guide décrit, étape par étape, toutes les fonctionnalités de MUKMAP : connexion, tableau de bord, carte interactive, collecte de points, outils de dessin et de mesure, topographie, réseau d'eau, zones de sécurité, itinéraires, imports/exports, rapports, météo, gestion des agents, mode avancé, mode hors ligne et installation sur mobile."),
            ("p", "Conventions utilisées dans ce guide : les libellés des boutons et menus sont reproduits tels qu'ils apparaissent à l'écran (exemple : « Ouvrir la carte ») ; les actions à réaliser sont décrites dans l'ordre ; les encadrés signalent des remarques, avertissements ou astuces."),
            ("c", "Capture d'écran du tableau de bord analytique de MUKMAP"),
         ]},
        {"titre": "1.4 Versions et plateformes",
         "blocs": [
            ("p", "MUKMAP fonctionne dans tous les navigateurs modernes (Chrome, Firefox, Edge, Safari). Il peut être installé comme application sur téléphone et tablette (fonctionnalité PWA — Progressive Web App) pour un accès rapide, y compris avec un écran de démarrage et un fonctionnement hors ligne. Les écrans s'adaptent automatiquement à la taille de l'appareil : téléphone, tablette ou ordinateur."),
            ("t", {
                "colonnes": ["Appareil", "Fonctionnalités principales"],
                "lignes": [
                    ["Ordinateur (bureau)", "Toutes les fonctionnalités : carte, outils SIG, rapports, administration, export de cartes grand format."],
                    ["Tablette", "Toutes les fonctionnalités de collecte et de visualisation, interface adaptée au tactile."],
                    ["Téléphone", "Collecte sur le terrain, carte, dessin, mesures, météo, mode hors ligne, rapports."],
                ]}),
         ]},
    ],
},
{
    "titre": "2. Démarrage rapide",
    "sections": [
        {"titre": "2.1 Prérequis",
         "blocs": [
            ("p", "Pour utiliser MUKMAP, il vous faut : un navigateur web récent, une connexion internet (pour la première connexion et les mises à jour), et un compte utilisateur fourni par votre administrateur (ou le mode invité pour une découverte limitée)."),
            ("n", "Sur le terrain, une connexion internet n'est pas indispensable : MUKMAP permet de télécharger une zone de carte pour travailler hors ligne puis de synchroniser les données à la reconnexion (voir chapitre 17)."),
         ]},
        {"titre": "2.2 Ouvrir l'application",
         "blocs": [
            ("p", "Ouvrez votre navigateur et saisissez l'adresse (URL) de la plateforme communiquée par votre administrateur. L'écran de connexion s'affiche avec le logo MUKMAP et le slogan « Cartographie de terrain, collecte & suivi sécurisé. »"),
            ("c", "Capture d'écran de l'écran de connexion (panneau gauche et panneau droit)"),
         ]},
        {"titre": "2.3 Se connecter",
         "blocs": [
            ("p", "L'écran de connexion propose deux onglets selon le type de compte : « Agent » (icône utilisateur) ou « Administrateur » (icône bouclier). Choisissez l'onglet correspondant à votre compte, puis :"),
            ("b", [
                "Saisissez votre nom d'utilisateur dans le champ « Nom d'utilisateur » (exemple : YAGIRWA) ;",
                "Saisissez votre mot de passe (le bouton œil permet d'afficher ou de masquer le mot de passe) ;",
                "Cochez « Se souvenir de moi » pour rester connecté sur cet appareil ;",
                "Cliquez sur le bouton « Connexion ».",
            ]),
            ("p", "Si vous avez oublié votre mot de passe, cliquez sur « Mot de passe oublié ? » : une fenêtre indique la procédure à suivre (contacter l'administrateur de la plateforme)."),
            ("n", "L'onglet « Administrateur » est réservé aux comptes disposant des droits d'administration. Si vous êtes agent, utilisez l'onglet « Agent »."),
         ]},
        {"titre": "2.4 Mode invité",
         "blocs": [
            ("p", "Sans compte, vous pouvez cliquer sur « Continuer en tant qu'Invité ». Le mode invité donne un accès limité à la carte et à la consultation. Une bannière s'affiche : « Vous utilisez actuellement MUKMAP en Mode Invité (Accès limité). Connectez-vous pour accéder à toutes les fonctionnalités. » Le lien « Se connecter pour débloquer toutes les fonctionnalités » permet de revenir à l'écran de connexion."),
            ("n", "La collecte de points, l'enregistrement de données et la génération de rapports nécessitent un compte connecté."),
         ]},
        {"titre": "2.5 Premiers pas après la connexion",
         "blocs": [
            ("p", "Après connexion, vous arrivez sur le tableau de bord analytique. Pour commencer à travailler :"),
            ("b", [
                "Ouvrez la carte avec le bouton « Ouvrir la carte » du bandeau de session ;",
                "Sélectionnez le projet et l'activité en cours (voir chapitre 4) ;",
                "Collectez vos premiers points avec l'outil « Nouveau point » (voir chapitre 6).",
            ]),
         ]},
    ],
},
{
    "titre": "3. Le tableau de bord",
    "sections": [
        {"titre": "3.1 La barre de navigation",
         "blocs": [
            ("p", "La barre de navigation en haut du tableau de bord donne accès aux principales sections de l'application :"),
            ("t", {
                "colonnes": ["Lien", "Description"],
                "lignes": [
                    ["Tableau de bord", "Indicateurs, graphiques et dernières activités."],
                    ["Adduction d'eau", "Module de suivi des réseaux d'eau (projets, ouvrages, relevés)."],
                    ["Cartographie", "Ouvre la carte interactive (toutes les fonctionnalités SIG)."],
                    ["Tous les points", "Liste et table attributaire de tous les points enregistrés."],
                    ["Import de données", "Importation de fichiers SIG (GeoJSON, KML, etc.)."],
                    ["Zones", "Gestion des zones de sécurité et des zones dangereuses."],
                    ["Itinéraires", "Suivi des itinéraires de terrain."],
                    ["Historique", "Historique des actions et du journal d'audit."],
                    ["Rapports", "Assistant de génération de rapports d'activités."],
                    ["Qualité des données", "Analyse de la qualité et de la complétude des données."],
                    ["Agents", "Gestion des comptes agents (visible uniquement pour les administrateurs)."],
                ]}),
            ("p", "À droite de la barre se trouvent l'horloge (date et heure), le bouton « Thème » (mode clair/sombre) et le bouton « Déconnexion »."),
         ]},
        {"titre": "3.2 Le bandeau de session",
         "blocs": [
            ("p", "Sous la barre de navigation, le bandeau de session affiche : l'utilisateur connecté, le projet en cours (par défaut « Tous les projets »), l'activité en cours (par défaut « Aucune »), la date et l'heure, et les boutons « Ouvrir la carte », « Projets » (administrateurs) et « Rapports »."),
            ("n", "Le projet et l'activité en cours déterminent à quel projet/activité seront rattachées les données collectées."),
         ]},
        {"titre": "3.3 Les cartes KPI (indicateurs)",
         "blocs": [
            ("p", "Le tableau de bord affiche cinq indicateurs clés calculés en temps réel : « Points encodés », « Activités », « Bénéficiaires », « Zones dangereuses » et « Zones de sécurité ». Ces chiffres varient selon les filtres sélectionnés (projet, agent, période)."),
            ("c", "Capture d'écran des cartes d'indicateurs du tableau de bord"),
         ]},
        {"titre": "3.4 Les filtres",
         "blocs": [
            ("p", "Utilisez les listes « Projet » et « Agent » (options « Tous les projets », « Tous les agents ») puis cliquez sur « Filtrer » pour restreindre les statistiques, graphiques et le tableau des dernières activités à un projet ou un agent précis."),
         ]},
        {"titre": "3.5 Les graphiques",
         "blocs": [
            ("p", "Six graphiques complètent le tableau de bord : « Répartition par catégorie », « Points par mois », « Zones de sécurité », « Activités par projet », « Points par province » et « Bénéficiaires par mois ». Un graphique « Météo » affiche également les conditions météorologiques relevées."),
            ("n", "Les catégories affichées dans le graphique de répartition reprennent les catégories de points : Hôpital, École, Église, Police, Marché, Projet, Incident, Village, Ville, Pont, Route, Entreprise, Zone rouge, Zone verte, Zone orange, Autre."),
         ]},
        {"titre": "3.6 Le panneau administratif",
         "blocs": [
            ("p", "Le panneau administratif (visible pour les administrateurs) contient deux blocs :"),
            ("b", [
                "« Zones de sécurité » : liste des zones récentes avec leurs statuts (Sécurisée, Dangereuse, Indisponible), le motif et la date ; boutons « + Nouvelle zone », « Modifier », « Supprimer », liens « Voir toutes les zones » et « Zones dangereuses » ;",
                "« Rapport d'activités » : génération rapide du rapport de suivi pour la période choisie (Journalier, Hebdomadaire, Mensuel) avec les boutons « Voir le rapport », « Télécharger PDF » et « Télécharger Word ».",
            ]),
            ("p", "Lorsqu'aucune zone n'est déclarée, le message « Aucune zone déclarée. » s'affiche."),
         ]},
        {"titre": "3.7 Le tableau « Dernières activités »",
         "blocs": [
            ("p", "Le tableau des dernières activités présente les colonnes : Date, Projet, Agent, Rapport, Bénéficiaires et Sécurité. Le bouton « Voir » ouvre le détail de l'activité. Si aucune activité ne correspond aux filtres, le message « Aucune activité pour la période et les filtres sélectionnés. » s'affiche."),
         ]},
        {"titre": "3.8 Thème clair / sombre",
         "blocs": [
            ("p", "Le bouton « Thème » bascule l'interface entre le mode clair et le mode sombre. Le choix est conservé pour vos prochaines visites."),
         ]},
    ],
},
{
    "titre": "4. Projets et activités",
    "sections": [
        {"titre": "4.1 Les projets",
         "blocs": [
            ("p", "Un projet regroupe l'ensemble des données géographiques d'une opération (exemple : « Adduction d'eau — territoire de Nyiragongo »). Les administrateurs créent et gèrent les projets via le bouton « Projets » du bandeau de session."),
         ]},
        {"titre": "4.2 Les activités",
         "blocs": [
            ("p", "Une activité est une session de travail à l'intérieur d'un projet (exemple : « Supervision GPS des villages »). Toutes les données collectées sont rattachées au projet et à l'activité sélectionnés avant la collecte."),
         ]},
        {"titre": "4.3 Sélectionner le projet et l'activité en cours",
         "blocs": [
            ("p", "Sur la carte, le panneau « Projet & activité en cours » permet de choisir le projet, puis de saisir l'activité en cours dans le champ prévu (des suggestions automatiques sont proposées depuis l'historique des activités saisies). Cliquez sur « Valider et continuer » pour confirmer."),
            ("c", "Capture d'écran de la fenêtre de sélection du projet et de l'activité"),
         ]},
        {"titre": "4.4 Terminer une activité",
         "blocs": [
            ("p", "En fin de mission, ouvrez la fenêtre « Fin de l'activité » : elle rappelle que votre session de travail va se terminer et vous permet de laisser une observation facultative dans le champ « Observations (optionnel) ». Confirmez avec « Déconnexion » ou annulez pour continuer."),
         ]},
        {"titre": "4.5 Bonnes pratiques",
         "blocs": [
            ("b", [
                "Sélectionnez toujours le bon projet et la bonne activité avant de commencer la collecte ;",
                "Utilisez une activité différente pour chaque mission afin de distinguer les données ;",
                "Ajoutez une observation en fin d'activité pour documenter les conditions de la mission.",
            ]),
         ]},
    ],
},
{
    "titre": "5. La carte interactive",
    "sections": [
        {"titre": "5.1 Ouvrir la carte",
         "blocs": [
            ("p", "Cliquez sur « Cartographie » dans la navigation, ou sur « Ouvrir la carte » dans le bandeau de session du tableau de bord. La carte s'affiche avec le titre « MUKMAP v1.0 — Cartographie » et le sous-titre « Plateforme SIG professionnelle — collecte, suivi et sécurité »."),
            ("c", "Capture d'écran de la carte interactive avec le panneau des outils"),
         ]},
        {"titre": "5.2 Naviguer sur la carte",
         "blocs": [
            ("b", [
                "Déplacer la carte : maintenez le bouton gauche de la souris enfoncé et faites glisser (ou faites glisser le doigt sur écran tactile) ;",
                "Zoomer : molette de la souris, boutons de zoom, ou pincement des doigts sur mobile ;",
                "Double-clic : place un point ou termine un tracé selon l'outil actif.",
            ]),
         ]},
        {"titre": "5.3 Rechercher un lieu",
         "blocs": [
            ("p", "Le champ de recherche (barre supérieure) permet de chercher un lieu, une commune, une province… ou de saisir directement des coordonnées au format « lat, lng ». Les résultats sont centrés sur la carte."),
         ]},
        {"titre": "5.4 Choisir le fond de carte",
         "blocs": [
            ("p", "Le panneau « Fond de carte » propose dix fonds : OSM, Satellite, Topo, Relief, Dark, Light, Humanitaire, Administrative, Internationale et Minimaliste. Le fond « Satellite » est particulièrement utile pour identifier les infrastructures sur le terrain ; « Topo » et « Relief » servent aux études topographiques. Le bouton pro « Fonds de carte » donne accès à des fonds supplémentaires du Mode Avancé."),
            ("c", "Capture d'écran du sélecteur de fonds de carte"),
         ]},
        {"titre": "5.5 Imagerie aérienne et couches WMS",
         "blocs": [
            ("p", "Les sections « Imagerie aérienne » et « Couches WMS » du panneau « Outils & données » permettent d'ajouter des couches d'imagerie ou des couches distantes (WMS) pour enrichir la carte. Chaque couche chargée apparaît dans la section « Couches chargées » et peut être affichée ou masquée."),
         ]},
        {"titre": "5.6 Identifier un élément",
         "blocs": [
            ("p", "L'outil « Identifier » (panneau « Informations sur l'élément ») affiche les informations d'un point ou d'un tracé cliqué sur la carte : nom, catégorie, état, coordonnées, description, photos."),
         ]},
        {"titre": "5.7 Localiser par coordonnées",
         "blocs": [
            ("p", "La fonction « Localiser par coordonnées » permet de se rendre à un endroit précis : saisissez la longitude, la latitude et éventuellement l'altitude, puis cliquez sur « Localiser ». La carte se centre sur ces coordonnées."),
         ]},
        {"titre": "5.8 Plein écran",
         "blocs": [
            ("p", "Le bouton « Plein écran » de la barre supérieure agrandit la carte sur tout l'écran ; un nouvel appui revient à l'affichage normal."),
         ]},
    ],
},
{
    "titre": "6. Collecte des points",
    "sections": [
        {"titre": "6.1 Créer un point",
         "blocs": [
            ("p", "Ouvrez la section « Nouveau point » du panneau « Outils & données ». Le formulaire demande :"),
            ("b", [
                "Nom du lieu : le nom du point (exemple : « École primaire de Sake ») ;",
                "Catégorie : parmi les 32 catégories disponibles (voir 6.2) ;",
                "État : Actif, Inactif, En cours ou Terminé ;",
                "Description : précisions sur le point ;",
                "Photo principale : une photo d'illustration ;",
                "Galerie multimédia : photos, vidéos, audios ou PDF (le type est détecté automatiquement).",
            ]),
            ("p", "Les coordonnées se remplissent automatiquement en cliquant sur la carte (l'aide l'indique : « Cliquez sur la carte pour remplir automatiquement les coordonnées. »). Terminez avec le bouton « Enregistrer le point »."),
            ("c", "Capture d'écran du formulaire de création d'un point"),
            ("n", "Le point est rattaché au projet et à l'activité en cours (voir chapitre 4)."),
         ]},
        {"titre": "6.2 Les catégories de points",
         "blocs": [
            ("p", "MUKMAP distingue 32 catégories de points, organisées en familles : lieux et équipements, sécurité, topographie, infrastructure et réseau d'eau."),
            ("t", {
                "colonnes": ["Famille", "Catégories"],
                "lignes": [
                    ["Lieux & équipements", "Hôpital, École, Église, Police, Marché, Projet, Village, Ville, Pont, Route, Entreprise, Bâtiment, Centre de santé, Poteau, Arbre, Parcelle"],
                    ["Sécurité", "Zone rouge, Zone verte, Zone orange, Incident"],
                    ["Topographie", "Repère géodésique, Point d'altitude, Courbe de niveau, Zone de levé, Station topographique, Point GPS/GNSS, Point topographique"],
                    ["Réseau d'eau", "Ouvrage réseau eau, Borne-fontaine, Réservoir d'eau, Captage / source"],
                    ["Autre", "Autre"],
                ]}),
            ("n", "Chaque catégorie dispose d'une icône et d'une couleur propres, reprises dans la « Légende des catégories » du panneau de la carte."),
         ]},
        {"titre": "6.3 Photos et galerie multimédia",
         "blocs": [
            ("p", "Le point peut comporter une photo principale et une galerie multimédia (photos, vidéos, enregistrements audio, documents PDF). Le type de fichier est détecté automatiquement. Ces médias apparaissent dans la fiche du point et dans les rapports (section « Photos »)."),
         ]},
        {"titre": "6.4 Consulter, modifier et supprimer un point",
         "blocs": [
            ("p", "Cliquez sur un point de la carte ou utilisez « Tous les points » pour ouvrir sa fiche. La modification et la suppression d'un point sont des opérations réservées aux administrateurs (l'onglet « Agents » du panneau de la carte liste les comptes autorisés)."),
         ]},
        {"titre": "6.5 Le tableau « Tous les points »",
         "blocs": [
            ("p", "La section « Tous les points » présente la liste complète des points enregistrés sous forme de tableau attributaire : nom, catégorie, état, coordonnées, projet, agent, dates. Les filtres dynamiques (catégorie, état, province, agent, dates Du/Au) permettent de restreindre la liste ; le bouton « Réinitialiser » efface les filtres."),
         ]},
    ],
},
{
    "titre": "7. Dessin et mesures",
    "sections": [
        {"titre": "7.1 Les outils de dessin",
         "blocs": [
            ("p", "La section « Outils de terrain » du panneau propose les outils de dessin suivants (groupe « Dessin ») :"),
            ("t", {
                "colonnes": ["Outil", "Méthode"],
                "lignes": [
                    ["Point", "Cliquez pour placer le point."],
                    ["Ligne", "Cliquez pour tracer la ligne. Double-clic pour terminer."],
                    ["Polyligne", "Cliquez pour tracer la polyligne. Double-clic pour terminer."],
                    ["Polygone", "Cliquez pour tracer le polygone. Double-clic pour terminer."],
                    ["Cercle", "Cliquez pour le centre, puis un 2e clic pour le rayon."],
                    ["Rectangle", "Cliquez pour un coin, puis un 2e clic pour le coin opposé."],
                ]}),
            ("p", "Rappel affiché dans le panneau : « Sélectionnez un outil. Double-clic pour terminer un tracé. »"),
         ]},
        {"titre": "7.2 Les outils de mesure",
         "blocs": [
            ("t", {
                "colonnes": ["Outil", "Méthode"],
                "lignes": [
                    ["Distance", "Cliquez pour mesurer. Double-clic pour terminer."],
                    ["Surface", "Cliquez pour mesurer la surface. Double-clic pour terminer."],
                    ["Rayon", "Cliquez le centre puis un 2e point pour le rayon. Double-clic pour terminer."],
                    ["Angle", "Cliquez 3 points (sommet au 2e). Double-clic pour terminer."],
                    ["Azimut", "Cliquez le départ puis la direction. Double-clic pour terminer."],
                    ["Périmètre", "Cliquez pour mesurer le périmètre. Double-clic pour terminer."],
                ]}),
            ("p", "Les résultats s'affichent dans la barre de mesure en mètres (m) ou kilomètres (km) : « Rayon : … », « Angle : …° », « Azimut : …° », « Périmètre : … »."),
         ]},
        {"titre": "7.3 La barre de mesure",
         "blocs": [
            ("p", "Pendant une mesure, la barre de mesure affiche les boutons « Terminer » et « Effacer » : « Terminer » valide le tracé en cours, « Effacer » supprime les mesures en cours de saisie."),
         ]},
        {"titre": "7.4 Supprimer un dessin",
         "blocs": [
            ("p", "L'outil « Supprimer un dessin » (groupe « Effacer un dessin ») permet de retirer de la carte un dessin (ligne, polygone, cercle…) précédemment tracé."),
         ]},
        {"titre": "7.5 Exemples d'usage",
         "blocs": [
            ("b", [
                "Mesurer la distance entre un village et le point d'eau le plus proche (outil Distance) ;",
                "Délimiter une parcelle ou un terrain (outil Polygone ou Rectangle) ;",
                "Vérifier l'orientation d'un axe routier (outil Azimut) ;",
                "Estimer la surface d'une zone inondée (outil Surface).",
            ]),
         ]},
    ],
},
{
    "titre": "8. Topographie et SIG avancé",
    "sections": [
        {"titre": "8.1 Les outils topographiques",
         "blocs": [
            ("p", "Le groupe « Topographie » regroupe huit outils destinés aux levés topographiques et aux relevés GPS :"),
            ("t", {
                "colonnes": ["Outil", "Usage"],
                "lignes": [
                    ["Point topographique", "Poser un point de levé sur la carte."],
                    ["Repère géodésique", "Matérialiser un repère de référence."],
                    ["Point d'altitude", "Saisir l'altitude d'un point."],
                    ["Courbe de niveau", "Tracer une courbe iso-altitude."],
                    ["Profil en long / travers", "Établir un profil altimétrique."],
                    ["Zone de levé", "Délimiter l'emprise d'un levé topo."],
                    ["Station topographique", "Poser une station de mesure."],
                    ["Point GPS/GNSS", "Enregistrer un relevé GPS différentiel."],
                ]}),
            ("p", "Chaque point posé peut être nommé (fenêtre « Nom du point ») avec une description, puis enregistré. Les messages « Pose active : … » et « Point « … » posé sur la carte. » confirment les actions."),
            ("c", "Capture d'écran du menu des outils topographiques"),
         ]},
        {"titre": "8.2 Courbes de niveau et profils",
         "blocs": [
            ("p", "L'outil « Courbe de niveau » trace des lignes d'égale altitude pour représenter le relief. L'outil « Profil en long / travers » construit le profil altimétrique d'un axe (route, canal…) pour analyser les pentes — indispensable pour les études d'adduction d'eau et de routes."),
         ]},
        {"titre": "8.3 Fonds de carte pour les études",
         "blocs": [
            ("p", "Pour les travaux topographiques, utilisez les fonds « Topo » ou « Relief », complétés si nécessaire par l'imagerie aérienne et les couches WMS (voir chapitre 5)."),
         ]},
        {"titre": "8.4 Bonnes pratiques de levé",
         "blocs": [
            ("b", [
                "Toujours définir le projet et l'activité avant de commencer un levé ;",
                "Nommer chaque point de manière explicite (exemple : « PK3+250 — début courbe ») ;",
                "Vérifier l'altitude et les coordonnées avant d'enregistrer ;",
                "Documenter les stations et les repères pour pouvoir reproduire le levé.",
            ]),
         ]},
    ],
},
{
    "titre": "9. Infrastructures et réseau d'eau",
    "sections": [
        {"titre": "9.1 Les infrastructures",
         "blocs": [
            ("p", "Le groupe « Infrastructures » permet de cartographier les équipements : Route (axe routier), Pont (ouvrage d'art), Bâtiment (construction), École (établissement scolaire), Centre de santé (établissement sanitaire), Poteau (poteau électrique / réseau), Arbre (arbre remarquable) et Parcelle (parcelle cadastrale)."),
            ("c", "Capture d'écran du groupe d'outils Infrastructures"),
         ]},
        {"titre": "9.2 Le réseau d'eau",
         "blocs": [
            ("p", "Le groupe « Réseau eau » regroupe les éléments d'un réseau d'adduction d'eau :"),
            ("t", {
                "colonnes": ["Outil", "Description"],
                "lignes": [
                    ["Captage / source", "Source, forage ou puits de captage."],
                    ["Borne-fontaine", "Point d'eau public de distribution."],
                    ["Réservoir / château", "Réservoir d'eau de stockage."],
                    ["Ouvrage réseau", "Station, chambre de vanne, ouvrage de réseau."],
                    ["Village desservi", "Village ou localité desservi par le réseau."],
                ]}),
            ("p", "Le module « Adduction d'eau » (menu du tableau de bord) permet de gérer les projets d'adduction : ouvrages hydrauliques, tracés de conduites et relevés (source, village, consommation, repère, réservoir)."),
            ("c", "Capture d'écran du module Adduction d'eau"),
         ]},
        {"titre": "9.3 Suivi d'un projet d'adduction",
         "blocs": [
            ("p", "Pour documenter un réseau : cartographiez d'abord le captage/source et le réservoir, puis les bornes-fontaines et les villages desservis, enfin le tracé des conduites. Chaque élément peut être accompagné de photos (état des ouvrages, compteurs, etc.) et sera repris dans les rapports."),
         ]},
    ],
},
{
    "titre": "10. Zones de sécurité",
    "sections": [
        {"titre": "10.1 Le concept",
         "blocs": [
            ("p", "MUKMAP permet de délimiter des zones de sécurité pour la protection des équipes et des populations : les zones « Sécurisée », « Dangereuse » et « Indisponible ». Elles sont matérialisées sur la carte (catégories Zone rouge, Zone verte, Zone orange) et suivies dans le tableau de bord (indicateurs « Zones dangereuses » et « Zones de sécurité »)."),
         ]},
        {"titre": "10.2 Déclarer une zone",
         "blocs": [
            ("p", "Dans le panneau administratif du tableau de bord, cliquez sur « + Nouvelle zone ». Renseignez : la zone (tracé ou périmètre), le statut (Sécurisée, Dangereuse, Indisponible), le motif et la date. Enregistrez pour faire apparaître la zone sur la carte et dans les indicateurs."),
            ("c", "Capture d'écran du formulaire de déclaration d'une zone de sécurité"),
         ]},
        {"titre": "10.3 Modifier et supprimer une zone",
         "blocs": [
            ("p", "Dans le bloc « Zones de sécurité », utilisez « Modifier » pour mettre à jour le statut, le motif ou le périmètre d'une zone, et « Supprimer » pour la retirer. Le lien « Voir toutes les zones » ouvre la liste complète ; « Zones dangereuses » filtre sur les zones à risque."),
         ]},
        {"titre": "10.4 Les zones dangereuses dans les rapports",
         "blocs": [
            ("p", "Les zones dangereuses et sécurisées sont comptabilisées dans les rapports d'activités (KPI « Zones dangereuses », « Zones sécurisées », « Sans information ») et dans la section « Zones de sécurité » du rapport."),
         ]},
    ],
},
{
    "titre": "11. Itinéraires",
    "sections": [
        {"titre": "11.1 Suivi des itinéraires",
         "blocs": [
            ("p", "Le menu « Itinéraires » du tableau de bord permet de visualiser et de suivre les itinéraires parcourus par les équipes de terrain. Un itinéraire est un tracé enregistré (marche, véhicule) rattaché au projet et à l'activité en cours."),
         ]},
        {"titre": "11.2 Itinéraires et rapports",
         "blocs": [
            ("p", "Les itinéraires sont comptabilisés dans les rapports (KPI « Itinéraires ») et détaillés dans la section « Itinéraires » du rapport d'activités. Ils permettent de vérifier la couverture du terrain et la présence des équipes."),
         ]},
    ],
},
{
    "titre": "12. Imports et exports",
    "sections": [
        {"titre": "12.1 Exporter les données",
         "blocs": [
            ("p", "La section « Imports & exports » du panneau de la carte permet d'exporter les données dans huit formats :"),
            ("t", {
                "colonnes": ["Format", "Usage"],
                "lignes": [
                    ["GeoJSON", "Format standard web, interopérable (QGIS, ArcGIS, web)."],
                    ["KML", "Google Earth et applications Google."],
                    ["KMZ", "KML compressé (archives)."],
                    ["Shapefile (SHP)", "Format classique des logiciels SIG de bureau."],
                    ["GPX", "Formats GPS de terrain (appareils et applications de randonnée)."],
                    ["DXF (AutoCAD)", "Échange avec les logiciels de dessin (CAO/DAO)."],
                    ["PNG (capture carte)", "Image de la carte telle qu'affichée."],
                    ["PDF", "Document cartographique prêt à imprimer."],
                ]}),
            ("n", "L'export Shapefile génère une archive ZIP contenant l'ensemble des fichiers du format (SHP, SHX, DBF, PRJ…)."),
         ]},
        {"titre": "12.2 Importer des données",
         "blocs": [
            ("p", "Deux possibilités : le lien « Import de données » (menu du tableau de bord) et le bouton « Importer GeoJSON/KML » du panneau de la carte. Les fichiers GeoJSON et KML importés apparaissent comme couches sur la carte. Le bouton « Importer couche SIG » permet d'ajouter une couche nommée (champ « Nom de la couche SIG »)."),
         ]},
        {"titre": "12.3 Exporter la carte (document PDF/PNG)",
         "blocs": [
            ("p", "Le bouton « Exporter la carte » produit un document cartographique professionnel. Les options :"),
            ("b", [
                "Format : PDF ou PNG ;",
                "Zone à exporter : « Vue actuelle de la carte » ou « Toutes les données » ;",
                "Format de page : A4 à A0 ;",
                "Orientation : Paysage ou Portrait ;",
                "Résolution (DPI) et marges : Normales (12 mm), Réduites (8 mm) ou Personnalisées ;",
                "Options avancées : qualité JPEG (Haute, Standard, Très haute), taille (JPEG) ;",
                "Éléments à afficher : Titre, Sous-titre, Légende, Échelle, Flèche nord, Coordonnées, Source, Date, Projection, Projet, Logo ;",
                "Aperçu avant export : boutons « Aperçu » puis « Exporter ».",
            ]),
            ("c", "Capture d'écran de la fenêtre d'export de la carte (options de mise en page)"),
         ]},
    ],
},
{
    "titre": "13. Rapports d'activités",
    "sections": [
        {"titre": "13.1 Accéder aux rapports",
         "blocs": [
            ("p", "Cliquez sur « Rapports » dans la navigation du tableau de bord, ou utilisez le bouton « Rapports » du bandeau de session, ou le bloc « Rapport d'activités » du panneau administratif. L'assistant de rapport s'ouvre avec le sous-titre « Assistant de rapport »."),
         ]},
        {"titre": "13.2 L'assistant en 6 étapes",
         "blocs": [
            ("t", {
                "colonnes": ["Étape", "Contenu"],
                "lignes": [
                    ["1. Type de rapport", "Choisissez : Journalier, Hebdomadaire, Mensuel, Annuel ou Période personnalisée."],
                    ["2. Projet", "Sélectionnez le projet à couvrir, ou « Tous les projets »."],
                    ["3. Activités", "Cochez les activités à inclure, ou laissez « Toutes les activités »."],
                    ["4. Filtres avancés", "Affinez par agent ou par zone visitée ; option « Rapport global (tous projets, tous agents) »."],
                    ["5. Sections", "Choisissez les contenus à inclure parmi les 15 sections disponibles."],
                    ["6. Aperçu", "Vérifiez les filtres, puis générez ou téléchargez le rapport."],
                ]}),
            ("p", "La navigation se fait avec les boutons « Précédent » et « Suivant » ; la dernière étape affiche « Générer le rapport »."),
            ("c", "Capture d'écran de l'assistant de rapport (étapes)"),
         ]},
        {"titre": "13.3 Les types de rapports",
         "blocs": [
            ("p", "Le type « Journalier » couvre une journée, « Hebdomadaire » une semaine, « Mensuel » un mois (type par défaut), « Annuel » une année. Le type « Période personnalisée » permet de choisir librement les dates de début et de fin (maximum 365 jours)."),
            ("n", "Dans le tableau de bord, le bloc « Rapport d'activités » propose également une période « Trimestrielle » pour un accès rapide."),
         ]},
        {"titre": "13.4 Les 15 sections du rapport",
         "blocs": [
            ("t", {
                "colonnes": ["Section", "Contenu"],
                "lignes": [
                    ["Informations générales", "Projet, période, agent, contexte du rapport."],
                    ["Résumé & statistiques", "Indicateurs clés : hommes, femmes, enfants, ménages, agents, zones, points, itinéraires, sessions, photos."],
                    ["Activités détaillées", "Détail de chaque activité avec objectif, résultats obtenus, difficultés rencontrées, recommandations, observations."],
                    ["Bénéficiaires", "Bénéficiaires atteints par activité."],
                    ["Agents de terrain", "Agents mobilisés et leurs rôles."],
                    ["Présence terrain", "Temps et présence des équipes sur le terrain."],
                    ["Itinéraires", "Itinéraires parcourus pendant la période."],
                    ["Points visités", "Points collectés ou visités."],
                    ["Zones de sécurité", "Zones déclarées (sécurisées, dangereuses, indisponibles)."],
                    ["Zones de danger", "Détail des zones dangereuses."],
                    ["Photos", "Photos prises pendant les activités."],
                    ["Observations", "Observations des agents."],
                    ["Recommandations", "Recommandations formulées."],
                    ["Activités des administrateurs", "Actions des administrateurs sur la période (audit)."],
                    ["Conditions météorologiques", "Météo relevée au moment des activités."],
                ]}),
         ]},
        {"titre": "13.5 Générer et télécharger",
         "blocs": [
            ("p", "Une fois le rapport généré, l'aperçu s'affiche avec l'en-tête « Rapport d'activités de la période » et la période couverte. Trois formats de téléchargement sont proposés : « Télécharger PDF », « Télécharger Word » (DOCX) et « Télécharger Excel » (XLSX, avec une feuille dédiée « Météo »). Le bouton « Imprimer » envoie le rapport directement à l'imprimante."),
            ("c", "Capture d'écran de l'aperçu du rapport avec les boutons de téléchargement"),
         ]},
        {"titre": "13.6 Les KPI du rapport",
         "blocs": [
            ("p", "L'aperçu affiche les indicateurs : Activités, Bénéficiaires, Agents mobilisés, Zones dangereuses, Zones sécurisées, Sans information, Points visités, Itinéraires, Présence terrain, Photos. Si aucun point ne correspond aux critères : « Aucune donnée ne correspond aux critères sélectionnés. » avec le bouton « Modifier les filtres »."),
         ]},
    ],
},
{
    "titre": "14. Météo",
    "sections": [
        {"titre": "14.1 Le widget météo",
         "blocs": [
            ("p", "Le widget « Météo » (panneau de la carte et tableau de bord) affiche les conditions météorologiques en temps réel pour la position de l'utilisateur : température (en °C), humidité (%), vent (km/h et direction), probabilité de pluie (%), lever et coucher du soleil. Les badges indiquent la source des données : « Temps réel », « Hors ligne » ou « Cache local »."),
            ("c", "Capture d'écran du widget météo sur la carte"),
         ]},
        {"titre": "14.2 Actualiser et choisir la position",
         "blocs": [
            ("p", "Le bouton « Actualiser » recharge les données ; « Utiliser ma position » demande l'autorisation de géolocalisation du navigateur (si elle est refusée : « Autorisation de géolocalisation refusée. ») ; « Réessayer » tente une nouvelle connexion après un échec. La mention « Mis à jour le » indique l'heure de la dernière actualisation."),
            ("n", "Le widget peut être déplacé sur la carte (poignée) ; sa position est mémorisée sur votre appareil."),
         ]},
        {"titre": "14.3 Les prévisions",
         "blocs": [
            ("p", "MUKMAP affiche les prévisions horaires des prochaines heures (température, vent, pluie) pour faciliter la planification des missions : évitez les heures de pluie pour les activités en extérieur, prévoyez le matériel en cas de vent fort."),
         ]},
        {"titre": "14.4 La météo dans les rapports",
         "blocs": [
            ("p", "La section « Conditions météorologiques » du rapport d'activités (voir chapitre 13) reprend le relevé météo du moment de chaque activité avec sa source (« Temps réel », « Synchronisé » ou « Cache local »). Si aucune donnée n'est disponible : « Données météo indisponibles au moment de l'activité. »"),
         ]},
    ],
},
{
    "titre": "15. Agents et contrôle d'accès",
    "sections": [
        {"titre": "15.1 Les rôles",
         "blocs": [
            ("t", {
                "colonnes": ["Rôle", "Droits"],
                "lignes": [
                    ["Administrateur principal", "Accès complet : administration des codes du Mode Avancé, gestion des agents, toutes les fonctionnalités."],
                    ["Administrateur", "Accès aux fonctions d'administration : agents, projets, zones, modification/suppression de points, rapports."],
                    ["Agent", "Collecte de points, dessin, mesures, consultation de la carte et des données de son projet."],
                    ["Invité", "Consultation limitée de la carte, sans collecte ni rapports."],
                ]}),
            ("n", "La connexion se fait via l'onglet « Agent » ou « Administrateur » selon le type de compte."),
         ]},
        {"titre": "15.2 Créer un compte agent",
         "blocs": [
            ("p", "Dans « Gestion des agents » (menu « Agents »), cliquez sur « + Créer un compte agent ». Renseignez le nom, le téléphone, la fonction et l'e-mail de l'agent. Le compte est créé avec le statut « Actif »."),
            ("c", "Capture d'écran de la page de gestion des agents"),
         ]},
        {"titre": "15.3 Bloquer et débloquer un agent",
         "blocs": [
            ("p", "La liste des agents présente les colonnes : Nom, Téléphone, Fonction, E-mail, Statut (badge « Actif » ou « Bloqué ») et Action. Les boutons « Bloquer » / « Débloquer » suspendent ou rétablissent l'accès d'un agent à la plateforme."),
         ]},
        {"titre": "15.4 Le journal d'audit",
         "blocs": [
            ("p", "Le menu « Historique » donne accès au journal d'audit : colonnes Date, Utilisateur, Action, IP et Détails. Le filtre « Filtrer par agent : » (option « Tous ») permet d'isoler les actions d'un utilisateur. C'est l'outil de contrôle de l'activité de la plateforme."),
            ("c", "Capture d'écran du journal d'audit"),
         ]},
    ],
},
{
    "titre": "16. Le Mode Avancé (PRO)",
    "sections": [
        {"titre": "16.1 Présentation",
         "blocs": [
            ("p", "MUKMAP propose deux modes d'utilisation. Au démarrage, la fenêtre « Choisissez votre mode » propose :"),
            ("b", [
                "« MUKMAP Classique » : « Simple, rapide et accessible : recherche de lieux, carte, marqueurs, dessin, mesures, export et rapports. » ;",
                "« MUKMAP Pro / Mode Avancé » : « Environnement professionnel : SIG avancé, fonds de carte, terrain 3D, topographie, géologie, mines, sondages et rapports professionnels. »",
            ]),
            ("p", "Le Mode Avancé est protégé par un code d'accès fourni par l'administrateur principal."),
         ]},
        {"titre": "16.2 Choisir un mode",
         "blocs": [
            ("p", "Cliquez sur « Utiliser ce mode » pour valider votre choix. Pour le Mode Avancé, la fenêtre « Un code d'accès est requis pour le Mode Avancé. » s'affiche : « Saisissez le code permanent ou temporaire fourni par l'administrateur. » (format MUK-XXXX-XXXX), puis « Valider le code »."),
            ("c", "Capture d'écran de la fenêtre de choix du mode et de saisie du code"),
         ]},
        {"titre": "16.3 Les codes d'accès",
         "blocs": [
            ("p", "Les codes d'accès sont générés uniquement par l'administrateur principal (page « Codes d'accès au Mode Avancé — MUKMAP », badge PRO). Deux types :"),
            ("t", {
                "colonnes": ["Type", "Caractéristiques"],
                "lignes": [
                    ["Code permanent", "Valable sans limite de temps."],
                    ["Code temporaire", "Valable pour une durée (heures) et un nombre d'utilisations max définis."],
                ]}),
         ]},
        {"titre": "16.4 Gérer les codes (administrateur principal)",
         "blocs": [
            ("p", "Dans la page des codes (accessible depuis la navigation « Codes Mode Avancé » de l'administration), le formulaire permet de générer un code avec : un libellé optionnel (exemple : « Agent Validation Nord »), le type (permanent ou temporaire), la durée de validité en heures (défaut 24) et les utilisations max (vide = illimité). Cliquez sur « Générer » : le code s'affiche (« Code généré — à partager avec l'utilisateur : ») et doit être transmis à l'utilisateur."),
            ("p", "Le tableau « Codes générés » liste les codes avec Libellé, Type, Expire le, Utilisations et Statut (Actif / Révoqué). Le bouton « Révoquer » retire immédiatement l'accès (confirmation : « Révoquer ce code ? Les utilisateurs liés perdront l'accès au Mode Avancé. »)."),
            ("c", "Capture d'écran de la page d'administration des codes du Mode Avancé"),
            ("n", "Cette page est réservée à l'administrateur principal : « Administration · Codes d'accès au Mode Avancé — Réservé à l'administrateur principal (YAGIRWA). »"),
         ]},
    ],
},
{
    "titre": "17. Mode hors ligne",
    "sections": [
        {"titre": "17.1 Le principe",
         "blocs": [
            ("p", "MUKMAP enregistre automatiquement les données en local (IndexedDB) lorsqu'il n'y a pas de connexion. Le badge de statut indique l'état : « Synchronisé » (vert), « X en attente de synchronisation » (orange), « X conflit(s) à résoudre » (rouge), « Hors ligne » ou « Hors ligne · X en attente » (gris), « Erreur de synchronisation » (rouge)."),
         ]},
        {"titre": "17.2 Télécharger une zone",
         "blocs": [
            ("p", "Le panneau « Mode hors connexion » propose le bouton « Télécharger la zone (+ fond de carte) » : MUKMAP télécharge les données de la zone affichée, y compris les tuiles du fond de carte (« Fond de carte : X/Y » affiche la progression). À l'issue : « Zone téléchargée — X tuile(s) de fond de carte. »"),
            ("c", "Capture d'écran du panneau du mode hors ligne"),
         ]},
        {"titre": "17.3 Collecter hors ligne",
         "blocs": [
            ("p", "Sans connexion, vous continuez à collecter des points, des tracés et des photos : ils sont stockés localement (le panneau indique « Points locaux : », « Traces en attente : », « Photos en attente : »)."),
         ]},
        {"titre": "17.4 Synchroniser",
         "blocs": [
            ("p", "À la reconnexion, le bouton « Synchroniser maintenant » envoie les données en attente vers le serveur. Les messages confirment le résultat : « X opération(s) en attente. », « Synchronisation réussie. » ou « Échec de la synchronisation : … »."),
         ]},
        {"titre": "17.5 Résoudre les conflits",
         "blocs": [
            ("p", "Si un point a été modifié sur le serveur pendant votre travail hors ligne, MUKMAP détecte un conflit (« X conflit(s) détecté(s) : résolvez-les ci-dessous. »). Pour chaque conflit, choisissez « Garder ma version » ou « Garder la version serveur »."),
         ]},
        {"titre": "17.6 Effacer les données locales",
         "blocs": [
            ("p", "Le bouton « Effacer les données locales » supprime les données téléchargées et les opérations en attente sur l'appareil (message : « Données locales effacées. »). Utilisez-le avec précaution : les données en attente non synchronisées seraient perdues."),
         ]},
    ],
},
{
    "titre": "18. Installation sur mobile, tablette et ordinateur (PWA)",
    "sections": [
        {"titre": "18.1 Installer l'application",
         "blocs": [
            ("p", "MUKMAP est une application web installable (PWA). Le badge d'installation s'affiche avec le message « Installez MUKMAP sur votre appareil pour accéder rapidement à vos cartes et projets. » et les boutons « Installer » et « Plus tard »."),
            ("b", [
                "Ordinateur (Chrome, Edge) : cliquez sur l'icône d'installation dans la barre d'adresse, ou sur « Installer MUKMAP » dans le menu ;",
                "Android : après l'installation, l'icône MUKMAP apparaît sur l'écran d'accueil ;",
                "iPhone / iPad : « Sur iPhone/iPad : touchez le bouton Partager puis « Sur l'écran d'accueil » pour installer MUKMAP. »",
            ]),
         ]},
        {"titre": "18.2 Les mises à jour",
         "blocs": [
            ("p", "Lorsqu'une nouvelle version est disponible, le message « Une nouvelle version de MUKMAP est disponible. » s'affiche avec le bouton « Actualiser ». Une fois à jour : « MUKMAP est installé. »"),
         ]},
        {"titre": "18.3 L'interface sur mobile et tablette",
         "blocs": [
            ("p", "L'interface s'adapte automatiquement à l'écran :"),
            ("b", [
                "Téléphone : panneaux en bas d'écran (bottom sheets), bouton d'action flottant (FAB) pour la collecte, gestes tactiles pour la carte ;",
                "Tablette : panneaux latéraux, deux doigts pour zoomer ;",
                "Ordinateur : affichage complet avec panneaux latéraux redimensionnables.",
            ]),
            ("n", "Toutes les fonctionnalités décrites dans ce guide (collecte, dessin, mesures, météo, hors ligne, rapports) sont disponibles sur téléphone, tablette et ordinateur."),
            ("c", "Capture d'écran de l'interface MUKMAP sur téléphone"),
         ]},
    ],
},
{
    "titre": "19. Dépannage",
    "sections": [
        {"titre": "19.1 Impossibilité de se connecter",
         "blocs": [
            ("b", [
                "Vérifiez votre connexion internet ;",
                "Vérifiez l'onglet de connexion (Agent / Administrateur) : un compte agent ne peut pas se connecter via l'onglet Administrateur ;",
                "Vérifiez l'orthographe du nom d'utilisateur (respect de la casse) et du mot de passe ;",
                "Si le mot de passe est oublié, cliquez sur « Mot de passe oublié ? » et suivez la procédure ;",
                "Si votre compte est « Bloqué », contactez l'administrateur.",
            ]),
         ]},
        {"titre": "19.2 La carte ne charge pas ou est lente",
         "blocs": [
            ("b", [
                "Actualisez la page (F5) ;",
                "Changez de fond de carte (le fond Satellite peut être plus lent) ;",
                "Vérifiez votre connexion internet ;",
                "Fermez les autres onglets ou applications gourmands en mémoire.",
            ]),
         ]},
        {"titre": "19.3 La météo est indisponible",
         "blocs": [
            ("p", "Les messages « Données météo indisponibles pour le moment. » ou « Impossible de détecter la position. » s'affichent si le service météo ne répond pas ou si la géolocalisation est refusée. Cliquez sur « Réessayer » ou « Utiliser ma position » et vérifiez que la localisation du navigateur est autorisée pour le site."),
         ]},
        {"titre": "19.4 La synchronisation échoue",
         "blocs": [
            ("b", [
                "Vérifiez la connexion internet ;",
                "Cliquez sur « Synchroniser maintenant » après rétablissement de la connexion ;",
                "Si des conflits sont détectés, résolvez-les (voir chapitre 17) ;",
                "En cas d'« Erreur de synchronisation », recommencez ou effacez les données locales après avoir noté les informations importantes.",
            ]),
         ]},
        {"titre": "19.5 Le rapport est vide",
         "blocs": [
            ("p", "Le message « Aucune donnée ne correspond aux critères sélectionnés. » indique qu'aucune activité ne correspond aux filtres. Modifiez la période, le projet ou les activités, ou cliquez sur « Modifier les filtres » pour élargir la recherche."),
         ]},
        {"titre": "19.6 Un point ne s'enregistre pas",
         "blocs": [
            ("b", [
                "Vérifiez que le projet et l'activité sont bien sélectionnés ;",
                "Vérifiez que le nom et la catégorie sont renseignés ;",
                "Vérifiez que les coordonnées ont bien été remplies (clic sur la carte) ;",
                "Reconnectez-vous si la session a expiré.",
            ]),
         ]},
    ],
},
{
    "titre": "20. Sécurité et bonnes pratiques",
    "sections": [
        {"titre": "20.1 Protection des comptes",
         "blocs": [
            ("b", [
                "Choisissez un mot de passe robuste et ne le partagez jamais ;",
                "Ne communiquez jamais votre code du Mode Avancé ;",
                "Utilisez « Se souvenir de moi » uniquement sur vos appareils personnels ;",
                "Déconnectez-vous (bouton « Déconnexion ») sur les appareils partagés.",
            ]),
         ]},
        {"titre": "20.2 Rôles et responsabilités",
         "blocs": [
            ("p", "Chaque utilisateur travaille avec son propre compte : les actions sont enregistrées dans le journal d'audit (utilisateur, date, IP). L'administrateur peut bloquer un compte en cas d'usage anormal. Les opérations sensibles (modification, suppression de points) sont réservées aux administrateurs."),
         ]},
        {"titre": "20.3 Intégrité des données",
         "blocs": [
            ("b", [
                "Vérifiez les coordonnées et l'altitude avant d'enregistrer un point ;",
                "Nommez les points de manière claire et unique ;",
                "Synchronisez régulièrement les données collectées hors ligne ;",
                "Effectuez vos exports (GeoJSON, KML, SHP) comme sauvegardes périodiques.",
            ]),
         ]},
        {"titre": "20.4 Bonnes pratiques de collecte sur le terrain",
         "blocs": [
            ("b", [
                "Préparez la zone de travail hors ligne avant de partir sur le terrain ;",
                "Consultez la météo avant la mission (widget Météo) ;",
                "Prenez une photo principale pour chaque point important ;",
                "Renseignez les zones dangereuses dès qu'elles sont identifiées ;",
                "Terminez l'activité avec une observation en fin de mission.",
            ]),
         ]},
        {"titre": "20.5 Confidentialité",
         "blocs": [
            ("p", "Les données géographiques collectées (positions, photos, rapports) sont sensibles : partagez les exports uniquement avec les personnes autorisées et respectez les règles de protection des données de votre organisation."),
         ]},
    ],
},
{
    "titre": "Annexe A. Glossaire",
    "sections": [
        {"titre": "A.1 Termes techniques",
         "blocs": [
            ("t", {
                "colonnes": ["Terme", "Définition"],
                "lignes": [
                    ["SIG", "Système d'Information Géographique : logiciel de gestion et d'analyse de données géographiques."],
                    ["GPS", "Global Positioning System : système de positionnement par satellites."],
                    ["GNSS", "Global Navigation Satellite System : ensemble des constellations de satellites (GPS, Galileo, Glonass…)."],
                    ["WMS", "Web Map Service : service web standard de diffusion de couches cartographiques."],
                    ["GeoJSON", "Format de données géographiques ouvert (JSON) utilisé sur le web."],
                    ["KML / KMZ", "Format de données géographiques de Google Earth (KMZ = version compressée)."],
                    ["Shapefile (SHP)", "Format de données vectorielles historique des SIG de bureau."],
                    ["GPX", "Format d'échange GPS (waypoints, traces, routes)."],
                    ["DXF", "Format d'échange des logiciels de dessin (AutoCAD et compatibles)."],
                    ["PWA", "Progressive Web App : application web installable fonctionnant comme une application native."],
                    ["WMS / couche", "Couche de données affichée sur la carte (fond, imagerie, données)."],
                    ["Courbe de niveau", "Ligne reliant des points d'égale altitude."],
                    ["Profil en long", "Coupe verticale du relief le long d'un axe."],
                    ["Borne-fontaine", "Point d'eau public de distribution."],
                    ["IndexedDB", "Base de données locale du navigateur utilisée par le mode hors ligne."],
                ]}),
         ]},
    ],
},
{
    "titre": "Annexe B. Liste des outils et des icônes",
    "sections": [
        {"titre": "B.1 Les groupes d'outils de terrain",
         "blocs": [
            ("t", {
                "colonnes": ["Groupe", "Outils"],
                "lignes": [
                    ["Dessin", "Point, Ligne, Polyligne, Polygone, Cercle, Rectangle"],
                    ["Mesures", "Distance, Surface, Rayon, Angle, Azimut, Périmètre"],
                    ["Topographie", "Point topographique, Repère géodésique, Point d'altitude, Courbe de niveau, Profil en long / travers, Zone de levé, Station topographique, Point GPS/GNSS"],
                    ["Infrastructures", "Route, Pont, Bâtiment, École, Centre de santé, Poteau, Arbre, Parcelle"],
                    ["Réseau eau", "Captage / source, Borne-fontaine, Réservoir / château, Ouvrage réseau, Village desservi"],
                    ["Effacer un dessin", "Supprimer un dessin"],
                ]}),
         ]},
        {"titre": "B.2 Les icônes de la barre supérieure",
         "blocs": [
            ("t", {
                "colonnes": ["Icône", "Fonction"],
                "lignes": [
                    ["Recherche", "Rechercher un lieu, une commune, une province ou des coordonnées."],
                    ["Notifications", "Messages et alertes de la plateforme."],
                    ["Exporter la carte", "Export de la carte en PDF ou PNG."],
                    ["À propos", "Informations sur MUKMAP et l'éditeur."],
                    ["Mode (Classique / Pro)", "Affiche le mode actif ; ouvre le choix du mode."],
                    ["Thème", "Basculer entre le mode clair et le mode sombre."],
                    ["Plein écran", "Agrandir la carte sur tout l'écran."],
                    ["Déconnexion", "Se déconnecter de la plateforme."],
                ]}),
         ]},
    ],
},
{
    "titre": "Annexe C. Raccourcis et astuces",
    "sections": [
        {"titre": "C.1 Gestes et manipulations",
         "blocs": [
            ("t", {
                "colonnes": ["Action", "Manipulation"],
                "lignes": [
                    ["Terminer un tracé", "Double-clic sur la carte."],
                    ["Déplacer la carte", "Glisser avec la souris ou le doigt."],
                    ["Zoomer", "Molette, boutons de zoom, ou pincement des doigts."],
                    ["Remplir les coordonnées d'un point", "Cliquer sur la carte dans le formulaire « Nouveau point »."],
                    ["Rechercher une position précise", "Saisir « lat, lng » dans le champ de recherche."],
                    ["Se rendre à des coordonnées", "Outil « Localiser par coordonnées » (Longitude, Latitude, Altitude)."],
                ]}),
         ]},
        {"titre": "C.2 Astuces de travail",
         "blocs": [
            ("b", [
                "Utilisez les filtres dynamiques de la carte pour isoler une catégorie (exemple : bornes-fontaines) ;",
                "Réinitialisez les filtres avec le bouton « Réinitialiser » ;",
                "Téléchargez la zone hors ligne avant de partir sur le terrain ;",
                "Exportez régulièrement vos données en GeoJSON ou Shapefile ;",
                "Consultez la météo avant chaque mission.",
            ]),
         ]},
    ],
},
{
    "titre": "Annexe D. Foire aux questions (FAQ)",
    "sections": [
        {"titre": "D.1 Questions fréquentes",
         "blocs": [
            ("t", {
                "colonnes": ["Question", "Réponse"],
                "lignes": [
                    ["Puis-je utiliser MUKMAP sans compte ?", "Oui, en mode invité, avec un accès limité (consultation de la carte)."],
                    ["Mes données sont-elles conservées hors ligne ?", "Oui : points, tracés et photos sont stockés sur l'appareil jusqu'à la synchronisation."],
                    ["Comment obtenir le Mode Avancé ?", "Demandez un code d'accès à l'administrateur principal (page « Codes Mode Avancé »)."],
                    ["Quels formats d'export sont disponibles ?", "GeoJSON, KML, KMZ, Shapefile (SHP), GPX, DXF, PNG et PDF."],
                    ["Quels formats de rapport sont disponibles ?", "PDF, Word (DOCX) et Excel (XLSX), plus l'impression directe."],
                    ["Comment installer MUKMAP sur mon téléphone ?", "Via le badge d'installation, ou sur iPhone/iPad via le bouton Partager puis « Sur l'écran d'accueil »."],
                    ["Que faire en cas de conflit de synchronisation ?", "Choisissez « Garder ma version » ou « Garder la version serveur » pour chaque conflit."],
                    ["Puis-je changer la langue ?", "Oui : le sélecteur de langue propose 6 langues (Français, English, Kiswahili, Lingála, Português, 中文)."],
                    ["Comment sont comptés les bénéficiaires ?", "Les bénéficiaires sont saisis par activité et repris dans les indicateurs et les rapports."],
                    ["Qui peut supprimer un point ?", "Uniquement les administrateurs : la suppression n'est pas accessible aux agents."],
                ]}),
         ]},
    ],
},
{
    "titre": "Annexe E. Procédures types",
    "sections": [
        {"titre": "E.1 Procédure 1 : collecte de points sur le terrain",
         "blocs": [
            ("b", [
                "1. Téléchargez la zone de travail hors ligne (voir chapitre 17) ;",
                "2. Ouvrez la carte et vérifiez la météo (voir chapitre 14) ;",
                "3. Sélectionnez le projet et l'activité en cours (voir chapitre 4) ;",
                "4. Ouvrez « Nouveau point », cliquez sur la carte pour les coordonnées ;",
                "5. Renseignez le nom, la catégorie, l'état, la description et les photos ;",
                "6. Enregistrez le point et continuez la collecte ;",
                "7. En fin de mission, synchronisez les données et terminez l'activité avec une observation.",
            ]),
         ]},
        {"titre": "E.2 Procédure 2 : générer un rapport mensuel",
         "blocs": [
            ("b", [
                "1. Ouvrez « Rapports » depuis le tableau de bord ;",
                "2. Étape 1 : choisissez « Mensuel » (ou « Période personnalisée ») ;",
                "3. Étape 2 : choisissez le projet ou « Tous les projets » ;",
                "4. Étape 3 : cochez les activités concernées ;",
                "5. Étape 4 : affinez par agent ou zone si nécessaire ;",
                "6. Étape 5 : sélectionnez les sections (dont « Conditions météorologiques ») ;",
                "7. Étape 6 : cliquez sur « Générer le rapport » ;",
                "8. Téléchargez le rapport en PDF, Word ou Excel, ou imprimez-le.",
            ]),
         ]},
        {"titre": "E.3 Procédure 3 : déclarer une zone dangereuse",
         "blocs": [
            ("b", [
                "1. Ouvrez le tableau de bord ;",
                "2. Dans le panneau administratif, cliquez sur « + Nouvelle zone » ;",
                "3. Tracez le périmètre de la zone sur la carte ;",
                "4. Choisissez le statut « Dangereuse » et renseignez le motif ;",
                "5. Enregistrez : la zone apparaît sur la carte et dans les indicateurs ;",
                "6. Informez les agents concernés avant toute mission dans le secteur.",
            ]),
         ]},
        {"titre": "E.4 Procédure 4 : travail hors ligne complet",
         "blocs": [
            ("b", [
                "1. Ouvrez le panneau « Mode hors connexion » ;",
                "2. Cliquez sur « Télécharger la zone (+ fond de carte) » ;",
                "3. Réalisez la collecte hors ligne (points, tracés, photos) ;",
                "4. À la reconnexion, ouvrez le panneau et cliquez sur « Synchroniser maintenant » ;",
                "5. Résolvez les éventuels conflits ;",
                "6. Vérifiez le badge : « Synchronisé » (vert).",
            ]),
         ]},
        {"titre": "E.5 Procédure 5 : documenter un réseau d'adduction d'eau",
         "blocs": [
            ("b", [
                "1. Ouvrez le module « Adduction d'eau » depuis le tableau de bord ;",
                "2. Cartographiez le captage/source et le réservoir (groupe « Réseau eau ») ;",
                "3. Posez les bornes-fontaines et les villages desservis ;",
                "4. Tracez les conduites (ouvrage réseau) et les profils si nécessaire ;",
                "5. Photographiez chaque ouvrage ;",
                "6. Renseignez les relevés (consommation, repères) ;",
                "7. Générer un rapport incluant la section « Points visités » et « Conditions météorologiques ».",
            ]),
         ]},
    ],
},
]

APROPOS = {
    "titre": "À PROPOS DE MUKESHABA",
    "blocs": [
        ("p", "MUKESHABA est une entreprise spécialisée dans la conception et le développement de logiciels. Nous concevons et mettons au marché des solutions informatiques adaptées aux besoins professionnels."),
        ("p", "MUKMAP, plateforme SIG professionnelle de collecte, de suivi et de sécurité, est éditée par MUKESHABA et développée par Ir. Yagirwa Gedeon — Consultant SIG & Développeur Web."),
        ("b", [
            "Téléphone : +243 971460415",
            "E-mail : chroniquedejamesmukeshaba@gmail.com",
        ]),
        ("p", "Pour toute question, demande d'assistance ou de formation, contactez-nous : nos équipes vous répondent dans les plus brefs délais."),
        ("p", "© MUKESHABA — Tous droits réservés. Ce guide est la propriété de MUKESHABA. Toute reproduction, diffusion ou modification sans autorisation écrite est interdite."),
    ],
}