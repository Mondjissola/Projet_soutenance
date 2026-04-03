from django.db import models

# Create your models here.

class userDonne(models.Model):
    idSaved = models.TextField(max_length=6000, null= True)
    fullName = models.TextField(max_length=6000, null= True)
    mail = models.TextField(max_length=6000, null= True)
    mdp = models.TextField(max_length=6000, null= True)
    informations = models.TextField(max_length=6000, null= True)

class plantInfo(models.Model):
    key = models.TextField(null=True)  # ex: "tomate" ou "basilic"
    nom = models.TextField(null=True)
    nom_latin = models.TextField(null=True)
    famille = models.TextField(null=True)
    origine = models.TextField(null=True)
    milieu_naturel = models.TextField(null=True)
    type_sol = models.TextField(null=True)
    besoin_en_eau = models.TextField(null=True)
    exposition = models.TextField(null=True)
    temperature_air_min = models.TextField(null=True)
    temperature_air_max = models.TextField(null=True)
    humidite_air_min = models.TextField(null=True)
    humidite_air_max = models.TextField(null=True)
    humidite_sol_min = models.TextField(null=True)
    humidite_sol_max = models.TextField(null=True)
    luminosite_min = models.TextField(null=True)
    luminosite_max = models.TextField(null=True)
    ph_min = models.TextField(null=True)
    ph_max = models.TextField(null=True)
    periode_plantation = models.TextField(null=True)
    periode_recolte = models.TextField(null=True)
    temps_de_pousse = models.TextField(null=True)
    engrais_recommande = models.TextField(null=True)
    sensibilite = models.TextField(null=True)
    difficulte = models.TextField(null=True)
    image = models.TextField(null=True)
    description = models.TextField(null=True)

class AlerteModel(models.Model):
    URGENCE_CHOICES = [
        (1, 'Très faible'),
        (2, 'Faible'),
        (3, 'Moyen'),
        (4, 'Élevé'),
        (5, 'Critique'),
    ]
    
    TYPE_CHOICES = [
        ('critical', 'Critique'),
        ('warning', 'Avertissement'),
        ('info', 'Information'),
    ]
    
    proprio = models.CharField(max_length=255)  # Propriétaire (nom d'utilisateur)
    titre = models.CharField(max_length=255)
    description = models.TextField()
    type_alerte = models.CharField(max_length=10, choices=TYPE_CHOICES, default='info')
    urgence = models.IntegerField(choices=URGENCE_CHOICES, default=1)
    zone = models.CharField(max_length=50, null=True, blank=True)
    date_creation = models.DateTimeField(auto_now_add=True)
    est_resolue = models.BooleanField(default=False)
    date_resolution = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        ordering = ['-urgence', '-date_creation']

class SensorDataHistory(models.Model):
    SENSOR_TYPES = [
        ('soil_humidity', 'Humidité du sol'),
        ('temperature', 'Température'),
        ('air_humidity', 'Humidité de l\'air'),
        ('soil_ph', 'pH du sol'),
        ('nitrogen', 'Azote (N)'),
        ('phosphorus', 'Phosphore (P)'),
        ('potassium', 'Potassium (K)'),
    ]
    
    sensor_type = models.CharField(max_length=20, choices=SENSOR_TYPES)
    value = models.FloatField()
    timestamp = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['sensor_type', '-timestamp']),
        ]
    
    def __str__(self):
        return f"{self.get_sensor_type_display()}: {self.value} at {self.timestamp}"



