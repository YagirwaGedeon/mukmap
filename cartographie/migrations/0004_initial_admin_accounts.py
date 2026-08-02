from django.db import migrations
from django.contrib.auth.hashers import make_password


def creer_admins(apps, schema_editor):
    User = apps.get_model('auth', 'User')
    admins = [
        {'username': 'YAGIRWA', 'password': 'YENE2026', 'first_name': 'Admin', 'last_name': 'YAGIRWA'},
        {'username': 'VALIO', 'password': 'VALIO2026', 'first_name': 'Admin', 'last_name': 'VALIO'},
        {'username': 'DECHARTE', 'password': 'DECHARTE2026', 'first_name': 'Admin', 'last_name': 'DECHARTE'},
    ]
    for a in admins:
        if not User.objects.filter(username=a['username']).exists():
            User.objects.create(
                username=a['username'],
                password=make_password(a['password']),
                first_name=a['first_name'],
                last_name=a['last_name'],
                is_superuser=True,
                is_staff=True,
            )


def supprimer_admins(apps, schema_editor):
    User = apps.get_model('auth', 'User')
    User.objects.filter(username__in=['YAGIRWA', 'VALIO', 'DECHARTE']).delete()


class Migration(migrations.Migration):
    dependencies = [
        ('cartographie', '0003_activite_agent_activite_niveau_securite_and_more'),
    ]

    operations = [
        migrations.RunPython(creer_admins, supprimer_admins),
    ]
