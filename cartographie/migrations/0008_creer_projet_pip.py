from django.db import migrations


def creer_projet_pip(apps, schema_editor):
    Projet = apps.get_model('cartographie', 'Projet')
    User = apps.get_model('auth', 'User')
    PointGeographique = apps.get_model('cartographie', 'PointGeographique')
    ZoneSecurite = apps.get_model('cartographie', 'ZoneSecurite')
    Itineraire = apps.get_model('cartographie', 'Itineraire')
    CoucheGeometrie = apps.get_model('cartographie', 'CoucheGeometrie')
    Activite = apps.get_model('cartographie', 'Activite')

    admin = User.objects.filter(is_superuser=True).first()
    projet = Projet.objects.filter(nom='Projet PIP').first()
    if projet is None:
        if Projet.objects.exists():
            projet = Projet.objects.first()
        else:
            projet = Projet.objects.create(
                nom='Projet PIP',
                description='Projet par défaut — données historiques rattachées automatiquement.',
                cree_par=admin,
            )
    PointGeographique.objects.filter(projet__isnull=True).update(projet=projet)
    ZoneSecurite.objects.filter(projet__isnull=True).update(projet=projet)
    Itineraire.objects.filter(projet__isnull=True).update(projet=projet)
    CoucheGeometrie.objects.filter(projet__isnull=True).update(projet=projet)
    Activite.objects.filter(projet__isnull=True).update(projet=projet)


class Migration(migrations.Migration):

    dependencies = [
        ('cartographie', '0007_activite_date_debut_activite_date_fin_and_more'),
    ]

    operations = [
        migrations.RunPython(creer_projet_pip, migrations.RunPython.noop),
    ]
