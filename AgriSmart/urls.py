
from django.urls import path, re_path
from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('auth', views.auth, name='auth'),
    path('auth_treatment', views.auth_treatment, name='auth_treatment'),
    path('cultures', views.cultures, name='cultures'),
    path('alertes', views.alertes, name='alertes'),
    path('manage_alertes', views.manage_alertes, name='manage_alertes'),
    path('delete_all_alertes', views.delete_all_alertes, name='delete_all_alertes'),
    path('parametres', views.parametres, name='parametres'),
    path('managePlantsData', views.managePlantsData, name='managePlantsData'),
    
    # API des capteurs
    path('api/data/', views.api_data, name='api_data'),
    path('api/sensors', views.api_sensors, name='api_sensors'),
    path('api/sensors/soil-humidity', views.api_sensors_soil_humidity, name='api_sensors_soil_humidity'),
    path('api/sensors/temperature', views.api_sensors_temperature, name='api_sensors_temperature'),
    path('api/sensors/npk', views.api_sensors_npk, name='api_sensors_npk'),
    path('api/sensors/air-humidity', views.api_sensors_air_humidity, name='api_sensors_air_humidity'),
    path('api/sensors/soil-ph', views.api_sensors_soil_ph, name='api_sensors_soil_ph'),
    path('api/sensor-history', views.api_sensor_history, name='api_sensor_history'),
    path('api/sim-mode', views.api_sim_mode, name='api_sim_mode'),
    
    # API des paramètres utilisateur
    path('update_username', views.update_username, name='update_username'),
    path('update_password', views.update_password, name='update_password'),
    path('delete_account', views.delete_account, name='delete_account'),
    path('get_user_settings', views.get_user_settings, name='get_user_settings'),
]

