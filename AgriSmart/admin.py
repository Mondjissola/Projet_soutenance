from django.contrib import admin
from .models import userDonne, plantInfo, AlerteModel, SensorDataHistory

@admin.register(userDonne)
class userDonne(admin.ModelAdmin):
    list_display = ("id", "fullName", "mail", "mdp", "informations")

@admin.register(plantInfo)
class PlantInfoAdmin(admin.ModelAdmin):
    list_display = (
        "key", "nom", "nom_latin", "famille", "origine", "milieu_naturel",
        "type_sol", "besoin_en_eau", "exposition",
        "temperature_air_min", "temperature_air_max",
        "humidite_air_min", "humidite_air_max",
        "humidite_sol_min", "humidite_sol_max",
        "luminosite_min", "luminosite_max",
        "ph_min", "ph_max", "periode_plantation",
        "periode_recolte", "temps_de_pousse",
        "engrais_recommande", "sensibilite", "difficulte", "image", "description"
    )

@admin.register(AlerteModel)
class AlerteAdmin(admin.ModelAdmin):
    list_display = ("id", "titre", "proprio", "type_alerte", "urgence", "zone", "date_creation", "est_resolue")
    list_filter = ("type_alerte", "urgence", "est_resolue", "proprio", "zone")
    search_fields = ("titre", "description", "proprio", "zone")
    readonly_fields = ("date_creation", "date_resolution")
    ordering = ("-urgence", "-date_creation")
    
    fieldsets = (
        ("Informations principales", {
            "fields": ("titre", "description", "proprio")
        }),
        ("Classification", {
            "fields": ("type_alerte", "urgence", "zone")
        }),
        ("Statut", {
            "fields": ("est_resolue", "date_creation", "date_resolution")
        }),
    )

@admin.register(SensorDataHistory)
class SensorDataHistoryAdmin(admin.ModelAdmin):
    list_display = ("id", "sensor_type", "value", "timestamp")
    list_filter = ("sensor_type", "timestamp")
    search_fields = ("sensor_type",)

