from django.contrib.staticfiles.storage import staticfiles_storage
from django.shortcuts import render, redirect
from django.core.mail import send_mail, EmailMessage
from django.http.response import HttpResponse
from django.contrib.sessions.models import Session
#from .models import Data
from django.http import JsonResponse
from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
from asgiref.sync import async_to_sync
import base64
import json
from datetime import datetime
import random
import time
import threading
from datetime import datetime, timedelta
from .models import userDonne, plantInfo, AlerteModel, SensorDataHistory

# Configuration des données de capteurs
UPDATE_INTERVAL = 3
BACKGROUND_SIM_ENABLED = False
MAX_HISTORY_POINTS = 100
SIM_MODE = 'dry'
STALE_THRESHOLD_SECONDS = 15
RESAMPLE_STEP_SECONDS = UPDATE_INTERVAL
RESAMPLE_ANCHOR_TS = None

# Données actuelles des capteurs (en mémoire pour performance)
current_sensor_data = {
    "soil_humidity": 65.50,
    "temperature": 23.20,
    "npk": {
        "nitrogen": 120.0,
        "phosphorus": 45.0,
        "potassium": 85.0
    },
    "air_humidity": 55.80,
    "soil_ph": 6.80,
    "last_update": time.time(),
    "status": "active"
}

# Thread de mise à jour des données
data_update_thread = None
thread_running = False

def simulate_sensor_changes():
    """
    Simule les changements des données de capteurs avec des variations réalistes
    """
    global current_sensor_data
    
    # Variations réalistes pour chaque capteur avec formatage des décimales
    current_sensor_data["soil_humidity"] += random.uniform(-1.5, 1.5)
    current_sensor_data["soil_humidity"] = round(max(0, min(100, current_sensor_data["soil_humidity"])), 2)
    
    current_sensor_data["temperature"] += random.uniform(-0.8, 0.8)
    current_sensor_data["temperature"] = round(max(10, min(45, current_sensor_data["temperature"])), 2)
    
    current_sensor_data["air_humidity"] += random.uniform(-2, 2)
    current_sensor_data["air_humidity"] = round(max(20, min(100, current_sensor_data["air_humidity"])), 2)
    
    current_sensor_data["soil_ph"] += random.uniform(-0.1, 0.1)
    current_sensor_data["soil_ph"] = round(max(4.0, min(9.0, current_sensor_data["soil_ph"])), 2)
    
    # NPK avec variations plus importantes et formatage à 1 décimale
    current_sensor_data["npk"]["nitrogen"] += random.uniform(-3, 3)
    current_sensor_data["npk"]["nitrogen"] = round(max(0, min(200, current_sensor_data["npk"]["nitrogen"])), 1)
    
    current_sensor_data["npk"]["phosphorus"] += random.uniform(-2, 2)
    current_sensor_data["npk"]["phosphorus"] = round(max(0, min(100, current_sensor_data["npk"]["phosphorus"])), 1)
    
    current_sensor_data["npk"]["potassium"] += random.uniform(-2, 2)
    current_sensor_data["npk"]["potassium"] = round(max(0, min(150, current_sensor_data["npk"]["potassium"])), 1)
    
    current_sensor_data["last_update"] = time.time()

def save_sensor_data_to_history():
    """
    Sauvegarde les données actuelles des capteurs dans l'historique de la base de données
    """
    try:
        # Sauvegarder chaque type de capteur
        SensorDataHistory.objects.create(
            sensor_type='soil_humidity',
            value=current_sensor_data['soil_humidity']
        )
        
        SensorDataHistory.objects.create(
            sensor_type='temperature',
            value=current_sensor_data['temperature']
        )
        
        SensorDataHistory.objects.create(
            sensor_type='air_humidity',
            value=current_sensor_data['air_humidity']
        )
        
        SensorDataHistory.objects.create(
            sensor_type='soil_ph',
            value=current_sensor_data['soil_ph']
        )
        
        SensorDataHistory.objects.create(
            sensor_type='nitrogen',
            value=current_sensor_data['npk']['nitrogen']
        )
        
        SensorDataHistory.objects.create(
            sensor_type='phosphorus',
            value=current_sensor_data['npk']['phosphorus']
        )
        
        SensorDataHistory.objects.create(
            sensor_type='potassium',
            value=current_sensor_data['npk']['potassium']
        )
        
        # Nettoyer l'historique ancien (garder seulement les MAX_HISTORY_POINTS plus récents)
        for sensor_type in ['soil_humidity', 'temperature', 'air_humidity', 'soil_ph', 'nitrogen', 'phosphorus', 'potassium']:
            old_records = SensorDataHistory.objects.filter(sensor_type=sensor_type).order_by('-timestamp')[MAX_HISTORY_POINTS:]
            if old_records:
                SensorDataHistory.objects.filter(
                    sensor_type=sensor_type,
                    id__in=[record.id for record in old_records]
                ).delete()
                
    except Exception as e:
        print(f"Erreur lors de la sauvegarde des données: {e}")

def get_latest_sensor_data_from_db():
    """Récupère les dernières données de chaque type de capteur depuis la base de données"""
    try:
        latest_data = {}
        sensor_types = ['soil_humidity', 'temperature', 'air_humidity', 'soil_ph', 'nitrogen', 'phosphorus', 'potassium']
        
        for sensor_type in sensor_types:
            latest_record = SensorDataHistory.objects.filter(
                sensor_type=sensor_type
            ).order_by('-timestamp').first()
            
            if latest_record:
                if sensor_type in ['nitrogen', 'phosphorus', 'potassium']:
                    if 'npk' not in latest_data:
                        latest_data['npk'] = {}
                    latest_data['npk'][sensor_type] = latest_record.value
                else:
                    latest_data[sensor_type] = latest_record.value
        
        return latest_data
    except Exception as e:
        print(f"Erreur lors de la récupération des données de la base: {e}")
        return None

def update_sensor_data_loop():
    """
    Boucle de mise à jour des données de capteurs qui s'exécute en arrière-plan
    """
    global thread_running, current_sensor_data
    if not BACKGROUND_SIM_ENABLED:
        thread_running = False
        return
    server_connected = True
    consecutive_failures = 0
    max_failures_before_disconnect = 3  # Nombre d'échecs consécutifs avant de marquer comme déconnecté
    
    while thread_running:
        try:
            # Tentative de connexion au serveur externe
            import requests
            response = requests.get('http://localhost:5000/api/sensors', timeout=3)
            
            if response.status_code == 200:
                # Serveur externe connecté - récupérer les vraies données du serveur
                if not server_connected:
                    print("Serveur externe reconnecté")
                    server_connected = True
                
                # Réinitialiser le compteur d'échecs
                consecutive_failures = 0
                
                # Récupérer les données du serveur externe au lieu de simuler
                external_data = response.json()
                
                # Gérer les deux formats : avec ou sans objet 'data' imbriqué
                if 'data' in external_data:
                    server_data = external_data['data']
                elif 'soil_humidity' in external_data and 'temperature' in external_data:
                    # Format direct sans objet 'data'
                    server_data = external_data
                else:
                    server_data = None
                
                if server_data and 'soil_humidity' in server_data:
                    current_sensor_data.update({
                        'soil_humidity': server_data.get('soil_humidity', current_sensor_data['soil_humidity']),
                        'temperature': server_data.get('temperature', current_sensor_data['temperature']),
                        'npk': server_data.get('npk', current_sensor_data['npk']),
                        'air_humidity': server_data.get('air_humidity', current_sensor_data['air_humidity']),
                        'soil_ph': server_data.get('soil_ph', current_sensor_data['soil_ph']),
                        'last_update': time.time(),
                        'status': 'active'
                    })
                    print(f"Données mises à jour depuis le serveur externe: T={server_data.get('temperature')}°C, H={server_data.get('soil_humidity')}%")
                else:
                    # Fallback: garder les dernières données valides si le format n'est pas correct
                    print(f"Format de données incorrect du serveur externe: {external_data}")
                    current_sensor_data['status'] = 'inactive'
            else:
                raise Exception(f"Serveur externe retourne le code {response.status_code}")
                
        except Exception as e:
            consecutive_failures += 1
            
            # Ne marquer comme déconnecté qu'après plusieurs échecs consécutifs
            if consecutive_failures >= max_failures_before_disconnect:
                if server_connected:
                    print(f"Serveur externe déconnecté après {consecutive_failures} tentatives: {e}")
                    server_connected = False
                
                # Utiliser les dernières données de la base SANS simulation
                latest_data = get_latest_sensor_data_from_db()
                if latest_data:
                    current_sensor_data.update(latest_data)
                
                current_sensor_data['status'] = 'disconnected'
                current_sensor_data['last_update'] = time.time()
            else:
                # Encore en période de grâce, garder le statut actuel SANS simulation
                print(f"Tentative {consecutive_failures}/{max_failures_before_disconnect} - Erreur temporaire: {e}")
                current_sensor_data['last_update'] = time.time()
        
        # Sauvegarder les données dans l'historique
        save_sensor_data_to_history()
        time.sleep(UPDATE_INTERVAL)

def start_sensor_data_thread():
    """
    Démarre le thread de mise à jour des données de capteurs
    """
    global data_update_thread, thread_running
    if not BACKGROUND_SIM_ENABLED:
        thread_running = False
        return
    if not thread_running:
        thread_running = True
        data_update_thread = threading.Thread(target=update_sensor_data_loop, daemon=True)
        data_update_thread.start()
        print(f"🔄 Thread de mise à jour des données démarré (intervalle: {UPDATE_INTERVAL}s)")

def get_sensor_data():
    latest = get_latest_sensor_data_from_db() or {}
    last_record = SensorDataHistory.objects.order_by('-timestamp').first()
    now_ts = time.time()
    last_update_ts = last_record.timestamp.timestamp() if last_record else now_ts
    if (now_ts - last_update_ts) > STALE_THRESHOLD_SECONDS:
        return {
            'soil_humidity': 0,
            'temperature': 0,
            'npk': {'nitrogen': 0, 'phosphorus': 0, 'potassium': 0},
            'air_humidity': 0,
            'soil_ph': 0,
            'last_update': last_update_ts,
            'status': 'inactive'
        }
    return {
        'soil_humidity': latest.get('soil_humidity', 0),
        'temperature': latest.get('temperature', 0),
        'npk': latest.get('npk', {'nitrogen': 0, 'phosphorus': 0, 'potassium': 0}),
        'air_humidity': latest.get('air_humidity', 0),
        'soil_ph': latest.get('soil_ph', 0),
        'last_update': last_update_ts,
        'status': 'active'
    }

def get_sensor_history(sensor_type, limit=50):
    """
    Récupère l'historique d'un type de capteur depuis la base de données
    """
    try:
        history = SensorDataHistory.objects.filter(
            sensor_type=sensor_type
        ).order_by('-timestamp')[:limit]
        
        return [{
            'timestamp': record.timestamp.timestamp(),
            'value': record.value
        } for record in reversed(history)]
        
    except Exception as e:
        print(f"Erreur lors de la récupération de l'historique: {e}")
        return []

def get_resampled_history(sensor_type, points=50, step_seconds=RESAMPLE_STEP_SECONDS):
    try:
        global RESAMPLE_ANCHOR_TS
        now_ts = int(time.time())
        aligned_now = (now_ts // step_seconds) * step_seconds
        if RESAMPLE_ANCHOR_TS is None:
            RESAMPLE_ANCHOR_TS = aligned_now
        else:
            if aligned_now > RESAMPLE_ANCHOR_TS:
                steps_ahead = (aligned_now - RESAMPLE_ANCHOR_TS) // step_seconds
                RESAMPLE_ANCHOR_TS += steps_ahead * step_seconds
        end_ts = RESAMPLE_ANCHOR_TS
        result = []

        # Valeur à reporter en cas d'absence de mesure dans le créneau
        carry_val = None
        # Initialiser avec la dernière valeur connue avant la fenêtre
        initial_record = SensorDataHistory.objects.filter(
            sensor_type=sensor_type,
            timestamp__lte=datetime.fromtimestamp(end_ts)
        ).order_by('-timestamp').first()
        if initial_record:
            carry_val = initial_record.value
        else:
            carry_val = 0

        for i in range(points, 0, -1):
            slot_ts = end_ts - (i * step_seconds)
            slot_time = datetime.fromtimestamp(slot_ts)
            slot_prev = datetime.fromtimestamp(slot_ts - step_seconds)
            rec = SensorDataHistory.objects.filter(
                sensor_type=sensor_type,
                timestamp__gt=slot_prev,
                timestamp__lte=slot_time
            ).order_by('-timestamp').first()
            if rec:
                carry_val = rec.value
            result.append({'timestamp': slot_ts, 'value': carry_val})
        return result
    except Exception as e:
        print(f"Erreur lors du resampling: {e}")
        return []

def index(request):
    contexte = {'information': ""}
    return render(request, 'AgriSmart/index.html', contexte)

def alertes(request):
    contexte = {'information': ""}
    return render(request, 'AgriSmart/alertes.html', contexte)

@csrf_exempt
def manage_alertes(request):
    if request.method == 'GET':
        try:
            user_id = request.session.get('user_id')
            
            # Pour les tests, permettre l'accès sans authentification en affichant toutes les alertes
            if not user_id:
                # Mode test - afficher toutes les alertes
                alertes = AlerteModel.objects.all()
                alertes_data = []
                for alerte in alertes:
                    alertes_data.append({
                        'id': alerte.id,
                        'titre': alerte.titre,
                        'description': alerte.description,
                        'type_alerte': alerte.type_alerte,
                        'urgence': alerte.urgence,
                        'zone': alerte.zone,
                        'date_creation': alerte.date_creation.isoformat(),
                        'est_resolue': alerte.est_resolue,
                        'date_resolution': alerte.date_resolution.isoformat() if alerte.date_resolution else None
                    })
                return JsonResponse({"status": "success", "alertes": alertes_data})
            
            user = userDonne.objects.get(id=user_id)
            alertes = AlerteModel.objects.filter(proprio=user.fullName)
            
            alertes_data = []
            for alerte in alertes:
                alertes_data.append({
                    'id': alerte.id,
                    'titre': alerte.titre,
                    'description': alerte.description,
                    'type_alerte': alerte.type_alerte,
                    'urgence': alerte.urgence,
                    'zone': alerte.zone,
                    'date_creation': alerte.date_creation.isoformat(),
                    'est_resolue': alerte.est_resolue,
                    'date_resolution': alerte.date_resolution.isoformat() if alerte.date_resolution else None
                })
            
            return JsonResponse({"status": "success", "alertes": alertes_data})
            
        except userDonne.DoesNotExist:
            return JsonResponse({"status": "error", "message": "Utilisateur non trouvé"}, status=404)
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=500)
    
    elif request.method == 'POST':
        try:
            user_id = request.session.get('user_id')
            data = json.loads(request.body.decode('utf-8'))
            
            # Déterminer le propriétaire
            if user_id:
                user = userDonne.objects.get(id=user_id)
                proprio = user.fullName
            else:
                # Mode test - utiliser "Admin" comme propriétaire par défaut
                proprio = "Admin"
            
            alerte = AlerteModel.objects.create(
                proprio=proprio,
                titre=data['titre'],
                description=data['description'],
                type_alerte=data.get('type_alerte', 'info'),
                urgence=data.get('urgence', 1),
                zone=data.get('zone', '')
            )
            
            return JsonResponse({
                "status": "success", 
                "message": "Alerte créée avec succès",
                "alerte_id": alerte.id
            })
            
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=500)
    
    elif request.method == 'PUT':
        try:
            user_id = request.session.get('user_id')
            data = json.loads(request.body.decode('utf-8'))
            alerte_id = data.get('alerte_id')
            
            # Récupérer l'alerte - en mode test, ne pas filtrer par propriétaire
            if user_id:
                user = userDonne.objects.get(id=user_id)
                alerte = AlerteModel.objects.get(id=alerte_id, proprio=user.fullName)
            else:
                alerte = AlerteModel.objects.get(id=alerte_id)
            
            if 'est_resolue' in data:
                alerte.est_resolue = data['est_resolue']
                if data['est_resolue']:
                    alerte.date_resolution = datetime.now()
                    alerte.urgence = 0  # Les alertes résolues passent à urgence 0
                else:
                    alerte.date_resolution = None
            
            if 'urgence' in data:
                alerte.urgence = data['urgence']
            
            alerte.save()
            
            return JsonResponse({"status": "success", "message": "Alerte mise à jour"})
            
        except AlerteModel.DoesNotExist:
            return JsonResponse({"status": "error", "message": "Alerte non trouvée"}, status=404)
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=500)
    
    elif request.method == 'DELETE':
        try:
            user_id = request.session.get('user_id')
            data = json.loads(request.body.decode('utf-8'))
            alerte_id = data.get('alerte_id')
            
            # Récupérer l'alerte - en mode test, ne pas filtrer par propriétaire
            if user_id:
                user = userDonne.objects.get(id=user_id)
                alerte = AlerteModel.objects.get(id=alerte_id, proprio=user.fullName)
            else:
                alerte = AlerteModel.objects.get(id=alerte_id)
                
            alerte.delete()
            
            return JsonResponse({"status": "success", "message": "Alerte supprimée"})
            
        except AlerteModel.DoesNotExist:
            return JsonResponse({"status": "error", "message": "Alerte non trouvée"}, status=404)
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=500)
    
    else:
        return JsonResponse({"status": "error", "message": "Méthode non autorisée"}, status=405)

@csrf_exempt
def delete_all_alertes(request):
    if request.method == 'DELETE':
        try:
            user_id = request.session.get('user_id')
            
            # En mode test, supprimer toutes les alertes
            if not user_id:
                AlerteModel.objects.all().delete()
            else:
                user = userDonne.objects.get(id=user_id)
                AlerteModel.objects.filter(proprio=user.fullName).delete()
            
            return JsonResponse({"status": "success", "message": "Toutes les alertes ont été supprimées"})
            
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=500)
    else:
        return JsonResponse({"status": "error", "message": "Méthode non autorisée"}, status=405)

@csrf_exempt
def delete_all_alertes(request):
    if request.method == 'DELETE':
        try:
            user_id = request.session.get('user_id')
            
            # En mode test, supprimer toutes les alertes
            if not user_id:
                AlerteModel.objects.all().delete()
            else:
                user = userDonne.objects.get(id=user_id)
                AlerteModel.objects.filter(proprio=user.fullName).delete()
            
            return JsonResponse({"status": "success", "message": "Toutes les alertes ont été supprimées"})
            
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=500)
    else:
        return JsonResponse({"status": "error", "message": "Méthode non autorisée"}, status=405)

def cultures(request):
    contexte = {'information': ""}
    return render(request, 'AgriSmart/cultures.html', contexte)

def auth(request):
    contexte = {'information': ""}
    return render(request, 'AgriSmart/auth.html', contexte)

def auth_treatment(request):
    if request.method == "POST":
        try:
            data = json.loads(request.body.decode('utf-8'))
            
            if "email" in data:  # Registration
                if data["password"] != data["confirm_password"]:
                    return JsonResponse({"status": "error", "message": "Les mots de passe ne correspondent pas"})
                
                # Check if user already exists
                if userDonne.objects.filter(mail=data["email"]).exists():
                    return JsonResponse({"status": "error", "message": "Cet email est déjà utilisé"})
                
                informations = ""
                if (data["terms_accepted"]):
                    informations = "consent"
                else:
                    informations = "non-consent"

                # Create new user
                new_user = userDonne(
                    fullName=data["username"].strip(),
                    mail=data["email"],
                    mdp=data["password"].strip(),
                    informations = informations
                )
                new_user.save()
                return JsonResponse({"status": "success", "message": "Inscription réussie"})
            else:  # Login
                print(data["username"], data["password"])
                user = userDonne.objects.filter(fullName=data["username"].strip(), mdp=data["password"].strip()).first()
                print(user)
                if user:
                    request.session["user_id"] = user.id
                    return JsonResponse({"status": "success", "message": "Connexion réussie"})
                else:
                    return JsonResponse({"status": "error", "message": "Nom d'utilisateur ou mot de passe incorrect"})
        except json.JSONDecodeError:
            return JsonResponse({"status": "error", "message": "Données JSON invalides"})
    
    return JsonResponse({"status": "error", "message": "Méthode non autorisée"})

def parametres(request):
    contexte = {'information': ""}
    return render(request, 'AgriSmart/parametres.html', contexte)

plantes_info  = {
"manioc": {
  "nom": "Manioc",
  "nom_latin": "Manihot esculenta",
  "famille": "Euphorbiacées",
  "origine": "Amérique du Sud, largement cultivé au Bénin",
  "milieu_naturel": "Climat tropical humide à semi‑aride",
  "type_sol": "Sol léger à moyen, bien drainé",
  "besoin_en_eau": "Arroser modérément, tolère bien les sécheresses passagères",
  "exposition": "Plein soleil ou mi‑ombre",
  "temperature_air_min": 20,
  "temperature_air_max": 35,
  "humidite_air_min": 50,
  "humidite_air_max": 95,
  "humidite_sol_min": 20,
  "humidite_sol_max": 60,
  "N_min": 20,
  "N_max": 60,
  "P_min": 5,
  "P_max": 20,
  "K_min": 30,
  "K_max": 80,
  "ph_min": 5.5,
  "ph_max": 7.5,
  "difficulte": "easy",
  "periode_plantation": "Début de la saison des pluies",
  "temps_de_pousse": "8 à 12 mois selon la variété",
  "engrais_recommande": "Incorporez du compost bien décomposé avant plantation. Un apport léger de cendre ou de fumier peut être ajouté 2 mois après.",
  "sensibilite": "Sensible à l’eau stagnante, aux termites et aux rongeurs",
  "description": "Le manioc est une racine riche en amidon, transformée en gari, tapioca ou farine. C’est l’une des cultures vivrières majeures du Bénin.",
  "conseil": "1) Choisissez un terrain légèrement en pente ou bien drainé pour éviter l’eau stagnante.\n"
             "2) Plantez les tiges en les inclinant légèrement à 10–15 cm de profondeur.\n"
             "3) Espacez les plants d’environ 1 m pour favoriser le développement des racines.\n"
             "4) Désherbez régulièrement pendant les trois premiers mois.\n"
             "5) Apportez un peu de compost ou fumier 6 à 8 semaines après plantation.\n"
             "6) Récoltez lorsque les feuilles jaunissent, après 8 à 12 mois."
},

"mais": {
  "nom": "Maïs",
  "nom_latin": "Zea mays",
  "famille": "Poacées",
  "origine": "Amérique centrale, culture majeure au Bénin",
  "milieu_naturel": "Climat tropical humide à sec",
  "type_sol": "Sol léger à argileux, bien drainé",
  "besoin_en_eau": "Arroser régulièrement durant la croissance",
  "exposition": "Plein soleil",
  "temperature_air_min": 15,
  "temperature_air_max": 35,
  "humidite_air_min": 40,
  "humidite_air_max": 90,
  "humidite_sol_min": 30,
  "humidite_sol_max": 70,
  "N_min": 40,
  "N_max": 150,
  "P_min": 10,
  "P_max": 50,
  "K_min": 20,
  "K_max": 60,
  "ph_min": 5.5,
  "ph_max": 7.0,
  "difficulte": "easy",
  "periode_plantation": "Début des pluies",
  "temps_de_pousse": "90 à 120 jours selon la variété",
  "engrais_recommande": "Mélangez compost ou fumier au sol avant semis, puis ajoutez un peu de cendre pendant la croissance.",
  "sensibilite": "Très sensible à la sécheresse à la floraison",
  "description": "Le maïs est une céréale riche en glucides, très cultivée pour la consommation locale et l’alimentation du bétail.",
  "conseil": "1) Semez deux rangs de maïs autour d’une rangée de haricots ou gombo pour protéger et enrichir le sol.\n"
             "2) Éclaircissez les plants pour éviter la concurrence.\n"
             "3) Arrosez particulièrement durant l’épiaison.\n"
             "4) Buttez légèrement pour renforcer les tiges.\n"
             "5) Surveillez les ravageurs comme la pyrale."
},

"fonio": {
  "nom": "Fonio",
  "nom_latin": "Digitaria exilis",
  "famille": "Poacées",
  "origine": "Afrique de l’Ouest, culture traditionnelle",
  "milieu_naturel": "Climat sec à semi‑humide",
  "type_sol": "Sol sableux, pauvre, bien drainé",
  "besoin_en_eau": "Arrosage léger en début de saison",
  "exposition": "Plein soleil",
  "temperature_air_min": 18,
  "temperature_air_max": 35,
  "humidite_air_min": 30,
  "humidite_air_max": 80,
  "humidite_sol_min": 15,
  "humidite_sol_max": 40,
  "N_min": 5,
  "N_max": 20,
  "P_min": 3,
  "P_max": 10,
  "K_min": 10,
  "K_max": 25,
  "ph_min": 5.5,
  "ph_max": 7.0,
  "difficulte": "easy",
  "periode_plantation": "Début des pluies",
  "temps_de_pousse": "70 à 130 jours",
  "engrais_recommande": "Ajoutez une poignée de fumier ou compost avant semis.",
  "sensibilite": "Peu sensible aux parasites",
  "description": "Le fonio est une petite céréale traditionnelle, très nutritive et adaptée aux sols pauvres.",
  "conseil": "1) Associez-le avec des légumineuses pour fixer l’azote.\n"
             "2) Éclaircissez les semis pour favoriser la croissance.\n"
             "3) Arrosez modérément, surtout en début de culture.\n"
             "4) Cassez la croûte superficielle après la germination pour améliorer l’aération."
},

"igname": {
  "nom": "Igname",
  "nom_latin": "Dioscorea spp.",
  "famille": "Dioscoréacées",
  "origine": "Afrique de l’Ouest, culture locale",
  "milieu_naturel": "Climat tropical humide",
  "type_sol": "Sol léger à moyen, bien drainé",
  "besoin_en_eau": "Arrosage modéré, sol humide sans stagnation",
  "exposition": "Plein soleil à mi‑ombre",
  "temperature_air_min": 20,
  "temperature_air_max": 35,
  "humidite_air_min": 60,
  "humidite_air_max": 90,
  "humidite_sol_min": 25,
  "humidite_sol_max": 60,
  "N_min": 30,
  "N_max": 80,
  "P_min": 10,
  "P_max": 40,
  "K_min": 30,
  "K_max": 90,
  "ph_min": 5.5,
  "ph_max": 6.5,
  "difficulte": "easy",
  "periode_plantation": "Après le début des pluies",
  "temps_de_pousse": "150 à 300 jours selon variété",
  "engrais_recommande": "Incorporez compost avant plantation et ajoutez un peu de cendre lors de la formation des tubercules.",
  "sensibilite": "Sensibles à l’eau stagnante et aux champignons",
  "description": "L’igname est un tubercule énergétique, base de l’alimentation traditionnelle au Bénin.",
  "conseil": "1) Plantez sur des buttes pour faciliter le drainage.\n"
             "2) Installez des supports pour que les tiges grimpent.\n"
             "3) Arrosez régulièrement mais modérément.\n"
             "4) Ajoutez du compost 4‑6 semaines après le semis.\n"
             "5) Surveillez les attaques de champignons sur le feuillage."
},

"haricot": {
  "nom": "Haricot",
  "nom_latin": "Phaseolus vulgaris",
  "famille": "Fabacées",
  "origine": "Amérique du Sud, bien introduit au Bénin",
  "milieu_naturel": "Climat tropical tempéré",
  "type_sol": "Sol léger à moyen, frais et drainé",
  "besoin_en_eau": "Arroser régulièrement mais sans excès",
  "exposition": "Plein soleil à mi‑ombre",
  "temperature_air_min": 15,
  "temperature_air_max": 30,
  "humidite_air_min": 50,
  "humidite_air_max": 90,
  "humidite_sol_min": 30,
  "humidite_sol_max": 70,
  "N_min": 20,
  "N_max": 60,
  "P_min": 10,
  "P_max": 30,
  "K_min": 10,
  "K_max": 40,
  "ph_min": 6.0,
  "ph_max": 7.0,
  "difficulte": "easy",
  "periode_plantation": "Début à mi‑saison des pluies",
  "temps_de_pousse": "60 à 90 jours",
  "engrais_recommande": "Peu ou pas d’engrais – ces plantes fixent naturellement l’azote.",
  "sensibilite": "Fragile en cas d’excès d’eau",
  "description": "Légumineuse riche en protéines, consommée en sauce ou à sec au Bénin.",
  "conseil": "1) Tournez la rotation avec le maïs ou le gombo pour enrichir le sol.\n"
             "2) Arrosez le soir pour éviter le stress hydrique.\n"
             "3) Buttez légèrement les plants après germination.\n"
             "4) Récoltez régulièrement pour encourager la production.\n"
             "5) Vérifiez l’apparition de mauvaises herbes autour des plants."
},

"riz": {
  "nom": "Riz",
  "nom_latin": "Oryza sativa",
  "famille": "Poacées",
  "origine": "Asie, cultivé au Bénin en bas‑fonds",
  "milieu_naturel": "Climat tropical humide",
  "type_sol": "Sol argileux ou limoneux, bien irrigué",
  "besoin_en_eau": "Submersion partielle au début, puis humidité constante",
  "exposition": "Plein soleil",
  "temperature_air_min": 20,
  "temperature_air_max": 35,
  "humidite_air_min": 60,
  "humidite_air_max": 100,
  "humidite_sol_min": 70,
  "humidite_sol_max": 100,
  "N_min": 50,
  "N_max": 150,
  "P_min": 20,
  "P_max": 60,
  "K_min": 30,
  "K_max": 90,
  "ph_min": 5.5,
  "ph_max": 7.0,
  "difficulte": "easy",
  "periode_plantation": "Début des pluies en bas-fonds irrigués",
  "temps_de_pousse": "120 à 180 jours",
  "engrais_recommande": "Apportez du fumier avant le repiquage et ajoutez un peu de cendre pendant la croissance.",
  "sensibilite": "Sensibilité aux maladies fongiques si l’eau stagne",
  "description": "Céréale de base cultivée en bas‑fonds, essentielle à l'alimentation locale.",
  "conseil": "1) Maintenez l’eau à un niveau constant après repiquage.\n"
             "2) Ajoutez un peu de cendre au moment où les plants commencent à émerger.\n"
             "3) Surveillez la présence de mauvaises herbes et évitez l’eau stagnante hors saison."
},

"arachide": {
  "nom": "Arachide",
  "nom_latin": "Arachis hypogaea",
  "famille": "Fabacées",
  "origine": "Amérique du Sud, culture traditionnelle au Bénin",
  "milieu_naturel": "Climat tropical sec ou humide",
  "type_sol": "Sol léger, sableux à moyen, bien drainé",
  "besoin_en_eau": "Arrosage modéré, tolère sécheresse",
  "exposition": "Plein soleil",
  "temperature_air_min": 20,
  "temperature_air_max": 35,
  "humidite_air_min": 40,
  "humidite_air_max": 90,
  "humidite_sol_min": 30,
  "humidite_sol_max": 70,
  "N_min": 20,
  "N_max": 80,
  "P_min": 10,
  "P_max": 40,
  "K_min": 20,
  "K_max": 60,
  "ph_min": 5.5,
  "ph_max": 7.0,
  "difficulte": "easy",
  "periode_plantation": "Début des pluies",
  "temps_de_pousse": "90 à 120 jours",
  "engrais_recommande": "Compost avant semis et peu d’engrais puisqu’ils fixent leur propre azote.",
  "sensibilite": "Sensible à l’humidité excessive et à la jaunisse virale",
  "description": "Plante oléagineuse produisant des graines nutritives, utilisée dans les sauces et snacks.",
  "conseil": "1) Semez après le maïs pour tirer parti de l’azote résiduel.\n"
            "2) Choisissez un sol bien drainé pour éviter la pourriture.\n"
            "3) Éclaircissez les plants pour éviter la concurrence.\n"
            "4) Ramassez les gousses lorsqu’elles commencent à jaunir.\n"
            "5) Tournez la culture avec une céréale pour préserver la qualité du sol."
},

"soja": {
  "nom": "Soja",
  "nom_latin": "Glycine max",
  "famille": "Fabacées",
  "origine": "Asie de l’Est, culture en développement au Bénin",
  "milieu_naturel": "Climat tropical humide à tempéré",
  "type_sol": "Sol léger, bien drainé",
  "besoin_en_eau": "Arroser régulièrement, éviter la sécheresse prolongée",
  "exposition": "Plein soleil",
  "temperature_air_min": 15,
  "temperature_air_max": 35,
  "humidite_air_min": 50,
  "humidite_air_max": 90,
  "humidite_sol_min": 30,
  "humidite_sol_max": 70,
  "N_min": 20,
  "N_max": 100,
  "P_min": 10,
  "P_max": 40,
  "K_min": 20,
  "K_max": 60,
  "ph_min": 6.0,
  "ph_max": 7.0,
  "difficulte": "easy",
  "periode_plantation": "Début des pluies",
  "temps_de_pousse": "90 à 120 jours",
  "engrais_recommande": "Aucun ou très faible, car le soja fixe naturellement l’azote.",
  "sensibilite": "Sensibilité à l’excès d’eau et aux maladies racinaires",
  "description": "Légumineuse riche en protéines, utile pour la rotation des cultures et l’alimentation humaine et animale.",
  "conseil": "1) Intégrez-le dans une rotation avec des céréales pour améliorer le sol.\n"
             "2) Arrosez régulièrement, surtout au début.\n"
             "3) Eclaircissez pour favoriser la ventilation.\n"
             "4) Récoltez au bon moment pour éviter la casse."
},

"millet": {
  "nom": "Millet",
  "nom_latin": "Pennisetum glaucum",
  "famille": "Poacées",
  "origine": "Afrique de l’Ouest, culture traditionnelle du nord Bénin",
  "milieu_naturel": "Climat sec à semi‑aride",
  "type_sol": "Sol léger sableux, bien drainé",
  "besoin_en_eau": "Arrosage léger, adapté à la sécheresse",
  "exposition": "Plein soleil",
  "temperature_air_min": 18,
  "temperature_air_max": 35,
  "humidite_air_min": 20,
  "humidite_air_max": 80,
  "humidite_sol_min": 10,
  "humidite_sol_max": 50,
  "N_min": 5,
  "N_max": 30,
  "P_min": 3,
  "P_max": 15,
  "K_min": 10,
  "K_max": 40,
  "ph_min": 5.5,
  "ph_max": 7.0,
  "difficulte": "easy",
  "periode_plantation": "Début des pluies",
  "temps_de_pousse": "70 à 100 jours",
  "engrais_recommande": "Ajoutez un peu d’humus ou compost avant semis.",
  "sensibilite": "Très résistant à la sécheresse",
  "description": "Céréale rustique très cultivée dans le nord du Bénin.",
  "conseil": "1) Semez après les premières pluies.\n"
             "2) Arrosez légèrement les premiers jours.\n"
             "3) Éclaircissez pour donner de l’espace au plant.\n"
             "4) Associez à une légumineuse comme le niébé pour fixer l’azote."
},

"tomate": {
  "nom": "Tomate",
  "nom_latin": "Solanum lycopersicum",
  "famille": "Solanacées",
  "origine": "Amérique du Sud, culture très répandue au Bénin",
  "milieu_naturel": "Climat chaud tempéré à tropical",
  "type_sol": "Sol léger, riche et bien drainé",
  "besoin_en_eau": "Arroser régulièrement, maintenir le sol humide sans détremper",
  "exposition": "Plein soleil",
  "temperature_air_min": 18,
  "temperature_air_max": 30,
  "humidite_air_min": 50,
  "humidite_air_max": 80,
  "humidite_sol_min": 40,
  "humidite_sol_max": 70,
  "N_min": 30,
  "N_max": 100,
  "P_min": 10,
  "P_max": 40,
  "K_min": 20,
  "K_max": 80,
  "ph_min": 6.0,
  "ph_max": 7.0,
  "difficulte": "easy",
  "periode_plantation": "Au début des pluies ou sous irrigation",
  "temps_de_pousse": "90 à 120 jours suivant la variété",
  "engrais_recommande": "Incorporez du compost ou fumier bien décomposé avant plantation, puis ajoutez un peu de cendre ou d’engrais organique riche en potasse.",
  "sensibilite": "Peu tolérante à l’excès d’eau, sensible au mildiou",
  "description": "Le potager produit de fruits rouges, riches en vitamine C et lycopène, très consommés au Bénin.",
  "conseil": "1) Choisissez un sol bien drainé et enrichi avec du compost.\n"
             "2) Arrosez régulièrement, particulièrement pendant la fructification.\n"
             "3) Utilisez un tuteur ou une cage pour soutenir les plants.\n"
             "4) Retirez les pousses latérales pour favoriser la production fruitière.\n"
             "5) Plantez à proximité du basilic ou de l’oignon pour limiter les nuisibles."
},

"gombo": {
  "nom": "Gombo",
  "nom_latin": "Abelmoschus esculentus",
  "famille": "Malvaceae",
  "origine": "Afrique tropicale, largement cultivé au Bénin",
  "milieu_naturel": "Climat chaud tropical",
  "type_sol": "Sol léger, riche, bien drainé",
  "besoin_en_eau": "Arroser régulièrement, garder le sol légèrement humide",
  "exposition": "Plein soleil",
  "temperature_air_min": 20,
  "temperature_air_max": 35,
  "humidite_air_min": 50,
  "humidite_air_max": 90,
  "humidite_sol_min": 30,
  "humidite_sol_max": 70,
  "N_min": 20,
  "N_max": 80,
  "P_min": 10,
  "P_max": 30,
  "K_min": 20,
  "K_max": 70,
  "ph_min": 6.0,
  "ph_max": 7.5,
  "difficulte": "easy",
  "periode_plantation": "Début des pluies",
  "temps_de_pousse": "50 à 60 jours",
  "engrais_recommande": "Amendement avec compost avant semis et cendre en cours de culture.",
  "sensibilite": "Sensible à la pourriture si l’eau stagne",
  "description": "Le gombo produit des fruits verts utilisés pour épaissir les sauces ; riche en fibres et vitamines.",
  "conseil": "1) Semez à 2–3 graines par poquet puis éclaircissez à un plant.\n"
             "2) Arrosez régulièrement mais sans excès.\n"
             "3) Buttez légèrement après la levée pour tenir la plante droite.\n"
             "4) Récoltez jeune pour éviter fruits fibreux.\n5) Plantez à côté du maïs ou haricot."
},

"piment": {
  "nom": "Piment",
  "nom_latin": "Capsicum spp.",
  "famille": "Solanaceae",
  "origine": "Amérique tropicale, culture locale",
  "milieu_naturel": "Climat chaud, tropical ou tempéré",
  "type_sol": "Sol riche, léger, bien drainé",
  "besoin_en_eau": "Arrosage modéré et régulier",
  "exposition": "Plein soleil",
  "temperature_air_min": 18,
  "temperature_air_max": 32,
  "humidite_air_min": 50,
  "humidite_air_max": 85,
  "humidite_sol_min": 40,
  "humidite_sol_max": 70,
  "N_min": 30,
  "N_max": 90,
  "P_min": 10,
  "P_max": 40,
  "K_min": 20,
  "K_max": 70,
  "ph_min": 6.0,
  "ph_max": 7.0,
  "difficulte": "easy",
  "periode_plantation": "Sous abri ou en début des pluies",
  "temps_de_pousse": "90 à 120 jours",
  "engrais_recommande": "Compost riche en matière organique avant plantation, ajout léger cendre mi-saison.",
  "sensibilite": "Sensible au mildiou, à l’oïdium, aux pucerons, au froid et à l'excès d'humidité",
  "description": "Le piment est utilisé pour relever les sauces ; source de vitamines A et C.",
  "conseil": "1) Semez sous abri puis repiquez après 3–4 feuilles.\n"
             "2) Arrosez régulièrement mais évitez stagnation.\n "
             "3) Taillez les branches basses pour aérer.\n"
             "4) Récoltez selon le degré de maturité voulu.\n"
             "5) Plantez avec basilic ou oignon pour repousser les nuisibles."
},

"oignon": {
  "nom": "Oignon",
  "nom_latin": "Allium cepa",
  "famille": "Amaryllidaceae",
  "origine": "Asie Centrale/Moyen-Orient, culture locale",
  "milieu_naturel": "Climat tropical tempéré",
  "type_sol": "Sol riche, finement préparé, bien drainé",
  "besoin_en_eau": "Arrosage régulier, sol humide",
  "exposition": "Plein soleil",
  "temperature_air_min": 13,
  "temperature_air_max": 29,
  "humidite_air_min": 40,
  "humidite_air_max": 80,
  "humidite_sol_min": 40,
  "humidite_sol_max": 70,
  "N_min": 20,
  "N_max": 80,
  "P_min": 10,
  "P_max": 30,
  "K_min": 20,
  "K_max": 60,
  "ph_min": 6.0,
  "ph_max": 7.5,
  "difficulte": "easy",
  "periode_plantation": "Fin des pluies/début de saison sèche",
  "temps_de_pousse": "90 à 120 jours",
  "engrais_recommande": "Compost ou fumier avant plantation, un peu de cendre vers 6 semaines.",
  "sensibilite": "Sensible à la pourriture si eau stagnante",
  "description": "L’oignon aromatise de nombreuses préparations culinaires ; riche en antioxydants.",
  "conseil": "1) Mettez en rangs espacés de 20‑30 cm.\n"
             "2) Arrosez matin ou soir régulièrement.\n"
             "3) Sarclez après chaque arrosage.\n"
             "4) Buttez légèrement quand les bulbes se forment.\n"
             "5) Récoltez quand le feuillage jaunit et se couche."
},

"melon": {
  "nom": "Melon",
  "nom_latin": "Cucumis melo",
  "famille": "Cucurbitacées",
  "origine": "Asie/Afrique, cultivé au Bénin",
  "milieu_naturel": "Climat chaud, sec à semi‑humide",
  "type_sol": "Sol riche, léger, bien drainé",
  "besoin_en_eau": "Arrosage régulier et profond",
  "exposition": "Plein soleil",
  "temperature_air_min": 18,
  "temperature_air_max": 35,
  "humidite_air_min": 40,
  "humidite_air_max": 90,
  "humidite_sol_min": 30,
  "humidite_sol_max": 70,
  "N_min": 20,
  "N_max": 80,
  "P_min": 10,
  "P_max": 40,
  "K_min": 30,
  "K_max": 90,
  "ph_min": 6.0,
  "ph_max": 7.5,
  "difficulte": "easy",
  "periode_plantation": "Début des pluies ou en irrigation",
  "temps_de_pousse": "80 à 100 jours",
  "engrais_recommande": "Compost riche + cendre au soudure des premières fleurs.",
  "sensibilite": "Sensible à l’humidité et aux maladies fongiques",
  "description": "Le melon est un fruit sucré et rafraîchissant apprécié en saison chaude.",
  "conseil": "1) Installez un treillis pour aérer les fruits.\n"
             "2) Arrosez en profondeur une fois par semaine.\n"
             "3) Retirez les gourmands et surveillez les insectes.\n"
             "4) Récoltez lorsque le dessous brunit légèrement.\n"
             "5) Plantez après des légumineuses pour enrichir le sol."
},

"patate_douce": {
  "nom": "Patate douce",
  "nom_latin": "Ipomoea batatas",
  "famille": "Convolvulacées",
  "origine": "Amérique tropicale, culture de subsistance",
  "milieu_naturel": "Climat tropical humide",
  "type_sol": "Sol léger à sableux, bien drainé",
  "besoin_en_eau": "Arrosage modéré, sol humide mais drainé",
  "exposition": "Plein soleil",
  "temperature_air_min": 20,
  "temperature_air_max": 30,
  "humidite_air_min": 50,
  "humidite_air_max": 95,
  "humidite_sol_min": 30,
  "humidite_sol_max": 70,
  "N_min": 10,
  "N_max": 50,
  "P_min": 5,
  "P_max": 20,
  "K_min": 30,
  "K_max": 80,
  "ph_min": 5.5,
  "ph_max": 7.0,
  "difficulte": "easy",
  "periode_plantation": "Début des pluies",
  "temps_de_pousse": "90 à 150 jours",
  "engrais_recommande": "Compost léger avant semis et peu de cendre plus tard.",
  "sensibilite": "Sensible à l’excès d’eau stagnante",
  "description": "Tubercule riche en glucides et en bêta‑carotène, très nutritif.",
  "conseil": "1) Plantez les boutures sur billons pour le drainage.\n"
             "2) Arrosez régulièrement puis moins avant la récolte.\n"
             "3) Désherbez les 6 premières semaines.\n"
             "4) Récoltez les tubercules une fois les feuilles jaunies.\n"
             "5) Faites suivre d’une légumineuse pour enrichir la terre."
},

"lavande": {
  "nom": "Lavande",
  "nom_latin": "Lavandula angustifolia",
  "famille": "Lamiacées",
  "origine": "Europe méditerranéenne, cultivateurs béninois expérimentent",
  "milieu_naturel": "Climat tempéré, sec",
  "type_sol": "Sol léger, sableux, calcaire",
  "besoin_en_eau": "Arrosage très modéré, tolère la sécheresse",
  "exposition": "Plein soleil",
  "temperature_air_min": 5,
  "temperature_air_max": 30,
  "humidite_air_min": 30,
  "humidite_air_max": 80,
  "humidite_sol_min": 10,
  "humidite_sol_max": 50,
  "N_min": 5,
  "N_max": 30,
  "P_min": 3,
  "P_max": 15,
  "K_min": 5,
  "K_max": 30,
  "ph_min": 6.5,
  "ph_max": 8.0,
  "difficulte": "easy",
  "periode_plantation": "Fin de saison sèche/début des pluies",
  "temps_de_pousse": "180 à 240 jours",
  "engrais_recommande": "Très peu ou pas d’engrais, compost léger avant semis.",
  "sensibilite": "Très sensible à l’humidité excessive et aux gelées",
  "description": "Plante aromatique utilisée pour son parfum et propriétés antiseptiques.",
  "conseil": "1) Plantez dans un sol très drainant.\n"
             "2) Arrosez uniquement en période de sècheresse prolongée.\n"
             "3) Taillez après floraison pour stimuler la repousse.\n"
             "4) Récoltez les fleurs et séchez à l’ombre.\n"
             "5) Placez-la bien à l’écart des plantes gourmandes en eau."
},

"gingembre": {
  "nom": "Gingembre",
  "nom_latin": "Zingiber officinale",
  "famille": "Zingiberacées",
  "origine": "Asie tropicale, culture locale croissante",
  "milieu_naturel": "Climat chaud, humide",
  "type_sol": "Sol riche, humifère, bien drainé",
  "besoin_en_eau": "Arrosage régulier surtout après plantation",
  "exposition": "Ombre légère à mi-ombre",
  "temperature_air_min": 20,
  "temperature_air_max": 30,
  "humidite_air_min": 60,
  "humidite_air_max": 90,
  "humidite_sol_min": 40,
  "humidite_sol_max": 80,
  "N_min": 30,
  "N_max": 80,
  "P_min": 10,
  "P_max": 40,
  "K_min": 20,
  "K_max": 60,
  "ph_min": 6.0,
  "ph_max": 7.0,
  "difficulte": "easy",
  "periode_plantation": "Fin de saison des pluies à début saison sèche",
  "temps_de_pousse": "240 à 270 jours",
  "engrais_recommande": "Compost riche avant plantation, cendre légère après un mois.",
  "sensibilite": "Sensible à l’eau stagnante et à la pourriture",
  "description": "Racine aromatique utilisée dans la cuisine et la médecine traditionnelle.",
  "conseil": "1) Plantez les rhizomes sur billons ou plates-bandes.\n"
             "2) Maintenez le sol humide sans excès.\n"
             "3) Sarclez les 6 premières semaines.\n"
             "4) Couvrez d’un paillis pour conserver l’humidité.\n"
             "5) Récoltez après que les feuilles jaunit, environ 9 mois."
},

"citrouille": {
  "nom": "Citrouille",
  "nom_latin": "Cucurbita maxima",
  "famille": "Cucurbitacées",
  "origine": "Amérique centrale, culture en expansion",
  "milieu_naturel": "Climat chaud, semi‑humide",
  "type_sol": "Sol riche, meuble et bien drainé",
  "besoin_en_eau": "Arrosage régulier, surtout lors de la fructification",
  "exposition": "Plein soleil",
  "temperature_air_min": 18,
  "temperature_air_max": 35,
  "humidite_air_min": 40,
  "humidite_air_max": 90,
  "humidite_sol_min": 30,
  "humidite_sol_max": 70,
  "N_min": 20,
  "N_max": 80,
  "P_min": 10,
  "P_max": 40,
  "K_min": 30,
  "K_max": 90,
  "ph_min": 6.0,
  "ph_max": 7.5,
  "difficulte": "easy",
  "periode_plantation": "Début des pluies ou sous irrigation",
  "temps_de_pousse": "90 à 120 jours",
  "engrais_recommande": "Compost riche + cendre à la formation des fruits.",
  "sensibilite": "Sensible aux maladies fongiques si trop d’humidité",
  "description": "La citrouille produit de gros fruits très nutritifs, utilisés en cuisine et pâtisserie.",
  "conseil": "1) Installez un treillis ou espalier.\n"
             "2) Arrosez profondément plusieurs fois par semaine.\n"
             "3) Éliminez les gourmands et pistils excédentaires.\n"
             "4) Surveillez les ravageurs et maladies.\n"
             "5) Récoltez quand la peau devient ferme et la tige sèche."
},

"poivron": {
  "nom": "Poivron",
  "nom_latin": "Capsicum annuum",
  "famille": "Solanacées",
  "origine": "Amérique, cultivé au Bénin",
  "milieu_naturel": "Climat chaud tempéré à tropical",
  "type_sol": "Riche, léger et bien drainé",
  "besoin_en_eau": "Arrosage régulier sans excès",
  "exposition": "Plein soleil",
  "temperature_air_min": 18,
  "temperature_air_max": 30,
  "humidite_air_min": 50,
  "humidite_air_max": 80,
  "humidite_sol_min": 40,
  "humidite_sol_max": 70,
  "N_min": 30,
  "N_max": 80,
  "P_min": 10,
  "P_max": 40,
  "K_min": 20,
  "K_max": 70,
  "ph_min": 6.0,
  "ph_max": 7.0,
  "difficulte": "easy",
  "periode_plantation": "Début des pluies ou sous abri",
  "temps_de_pousse": "90 à 120 jours",
  "engrais_recommande": "Compost avant plantation, léger ajout de cendre mi-saison",
  "sensibilite": "Sensible à l’eau stagnante et au froid",
  "description": "Fruit riche en vitamines A et C, utilisé dans les sauces et salades.",
  "conseil": "1) Semez sous abri puis repiquez après 3–4 feuilles.\n"
             "2) Arrosez régulièrement tout en évitant les flaques.\n"
             "3) Taillez les branches basses pour améliorer l’aération.\n"
             "4) Paillez pour conserver l’humidité.\n"
             "5) Associez avec basilic pour repousser les ravageurs."
},

"chou": {
  "nom": "Chou",
  "nom_latin": "Brassica oleracea",
  "famille": "Brassicacées",
  "origine": "Europe, cultivé sous climat tempéré",
  "milieu_naturel": "Climat tempéré chaud",
  "type_sol": "Fertile, bien drainé, riche en matière organique",
  "besoin_en_eau": "Arrosage fréquent et uniforme",
  "exposition": "Plein soleil à mi‑ombre",
  "temperature_air_min": 15,
  "temperature_air_max": 24,
  "humidite_air_min": 60,
  "humidite_air_max": 90,
  "humidite_sol_min": 50,
  "humidite_sol_max": 80,
  "N_min": 30,
  "N_max": 100,
  "P_min": 15,
  "P_max": 50,
  "K_min": 20,
  "K_max": 70,
  "ph_min": 6.0,
  "ph_max": 7.5,
  "difficulte": "easy",
  "periode_plantation": "Fin des pluies",
  "temps_de_pousse": "90 à 120 jours",
  "engrais_recommande": "Compost riche avant plantation, cendre après formation du cœur",
  "sensibilite": "Sensible au chaud sec et aux limaces",
  "description": "Légume-feuille aux feuilles charnues, riche en vitamines et fibres.",
  "conseil": "1) Plantez en rangs espacés pour une bonne circulation de l’air.\n2) Maintenez un arrosage régulier.\n3) Protégez du chaud sec avec un voile ou paillage.\n4) Vérifiez la présence de limaces et pucerons.\n5) Récoltez progressivement selon la taille du cœur."
},

"citronnelle": {
  "nom": "Citronnelle",
  "nom_latin": "Cymbopogon citratus",
  "famille": "Poacées",
  "origine": "Asie, cultivée pour ses propriétés aromatiques",
  "milieu_naturel": "Climat tropical humide",
  "type_sol": "Humifère, bien drainé",
  "besoin_en_eau": "Arrosage régulier, conserve l’humidité",
  "exposition": "Plein soleil ou mi‑ombre",
  "temperature_air_min": 18,
  "temperature_air_max": 35,
  "humidite_air_min": 60,
  "humidite_air_max": 95,
  "humidite_sol_min": 40,
  "humidite_sol_max": 80,
  "N_min": 20,
  "N_max": 60,
  "P_min": 10,
  "P_max": 40,
  "K_min": 20,
  "K_max": 60,
  "ph_min": 6.0,
  "ph_max": 7.5,
  "difficulte": "easy",
  "periode_plantation": "Début des pluies",
  "temps_de_pousse": "90 à 120 jours",
  "engrais_recommande": "Compost avant plantation, paillage organique",
  "sensibilite": "Sensible à l’eau stagnante",
  "description": "Herbe aromatique utilisée en infusion et pour repousser les moustiques.",
  "conseil": "1) Plantez en poquets de 3 à 5 plants.\n"
             "2) Maintenez le sol humide sans excès.\n"
             "3) Paillez autour des plants pour conserver l’humidité.\n"
             "4) Coupez les tiges à 10 cm pour préserver la touffe.\n"
             "5) Occupons le terrain après récolte avec une légumineuse."
},

"moringa": {
  "nom": "Moringa",
  "nom_latin": "Moringa oleifera",
  "famille": "Moringacées",
  "origine": "Asie du Sud, introduit au Bénin",
  "milieu_naturel": "Climat tropical sec à humide",
  "type_sol": "Sol léger, bien drainé, tolère le calcaire",
  "besoin_en_eau": "Arrosage modéré, tolère la sécheresse",
  "exposition": "Plein soleil",
  "temperature_air_min": 22,
  "temperature_air_max": 35,
  "humidite_air_min": 30,
  "humidite_air_max": 90,
  "humidite_sol_min": 20,
  "humidite_sol_max": 70,
  "N_min": 20,
  "N_max": 60,
  "P_min": 5,
  "P_max": 20,
  "K_min": 20,
  "K_max": 60,
  "ph_min": 6.0,
  "ph_max": 7.5,
  "difficulte": "easy",
  "periode_plantation": "Début des pluies",
  "temps_de_pousse": "90 à 120 jours pour les feuilles",
  "engrais_recommande": "Peu ou pas nécessaire, compost léger suffisant",
  "sensibilite": "Peu sensible, résiste bien à la sécheresse",
  "description": "Arbre aux feuilles très nutritives, utilisé en alimentation et remèdes.",
  "conseil": "1) Plantez en espacement d’au moins 2 m.\n"
             "2) Taillez régulièrement pour stimuler les branches.\n"
             "3) Récoltez les feuilles de manière sélective.\n"
             "4) Utilisez les feuilles fraîches ou séchées en poudre.\n"
             "5) En fin de saison, enrichissez le sol avec ces feuilles."
},

"banane": {
  "nom": "Banane",
  "nom_latin": "Musa spp.",
  "famille": "Musacées",
  "origine": "Asie, culture bananière au Bénin",
  "milieu_naturel": "Climat tropical humide",
  "type_sol": "Riche, profond, bien drainé",
  "besoin_en_eau": "Arrosage copieux et régulier",
  "exposition": "Plein soleil ou légère mi-ombre",
  "temperature_air_min": 20,
  "temperature_air_max": 35,
  "humidite_air_min": 60,
  "humidite_air_max": 95,
  "humidite_sol_min": 50,
  "humidite_sol_max": 90,
  "N_min": 50,
  "N_max": 150,
  "P_min": 20,
  "P_max": 60,
  "K_min": 50,
  "K_max": 200,
  "ph_min": 5.5,
  "ph_max": 7.0,
  "difficulte": "easy",
  "periode_plantation": "Tout au long de l’année en climat adapté",
  "temps_de_pousse": "9 à 12 mois pour un régime",
  "engrais_recommande": "Compost ferme et cendre régulièrement",
  "sensibilite": "Sensible à la sécheresse et aux ravageurs sucriers",
  "description": "Fruit énergétique consommé frais, souvent en dessert ou encas.",
  "conseil": "1) Plantez en zone protégée du vent.\n"
             "2) Arrosez abondamment avec paillage.\n"
             "3) Apportez du compost chaque mois.\n"
             "4) Supprimez les rejets inutiles.\n"
             "5) Récoltez quand les régimes commencent à brunir."
},

"avocat": {
  "nom": "Avocatier",
  "nom_latin": "Persea americana",
  "famille": "Lauracées",
  "origine": "Amérique centrale, adapté au Bénin",
  "milieu_naturel": "Climat tropical humide à tempéré",
  "type_sol": "Riche, profond, bien drainé",
  "besoin_en_eau": "Arrosage régulier, sol humide",
  "exposition": "Plein soleil ou mi‑ombre",
  "temperature_air_min": 15,
  "temperature_air_max": 30,
  "humidite_air_min": 60,
  "humidite_air_max": 90,
  "humidite_sol_min": 40,
  "humidite_sol_max": 80,
  "N_min": 30,
  "N_max": 100,
  "P_min": 20,
  "P_max": 60,
  "K_min": 20,
  "K_max": 80,
  "ph_min": 5.5,
  "ph_max": 7.0,
  "difficulte": "easy",
  "periode_plantation": "Fin de saison des pluies",
  "temps_de_pousse": "3 à 4 ans avant fructification",
  "engrais_recommande": "Compost bien décomposé au pied chaque saison",
  "sensibilite": "Sensible au vent et au froid",
  "description": "Arbre fruitier produisant des avocats riches en bons lipides.",
  "conseil": "1) Installez un tuteur jusqu’à 1 m.\n"
             "2) Arrosez régulièrement et paillez abondamment.\n"
             "3) Taillez pour équilibrer la canopée.\n"
             "4) Apportez du compost chaque saison des pluies.\n"
             "5) Protégez du vent jeune."
},

"papaye": {
  "nom": "Papayer",
  "nom_latin": "Carica papaya",
  "famille": "Caricacées",
  "origine": "Amérique centrale, cultivé au Bénin",
  "milieu_naturel": "Climat tropical humide",
  "type_sol": "Riche, léger, bien drainé",
  "besoin_en_eau": "Arrosage régulier, sol humide sans stagnation",
  "exposition": "Plein soleil",
  "temperature_air_min": 20,
  "temperature_air_max": 35,
  "humidite_air_min": 60,
  "humidite_air_max": 95,
  "humidite_sol_min": 40,
  "humidite_sol_max": 80,
  "N_min": 30,
  "N_max": 100,
  "P_min": 20,
  "P_max": 60,
  "K_min": 30,
  "K_max": 100,
  "ph_min": 6.0,
  "ph_max": 7.5,
  "difficulte": "easy",
  "periode_plantation": "Fin de saison sèche ou début des pluies",
  "temps_de_pousse": "9 à 12 mois avant fruits",
  "engrais_recommande": "Compost bien décomposé autour du tronc chaque saison",
  "sensibilite": "Très sensible à l’eau stagnante et aux gelées",
  "description": "Fruit tropical juteux riche en enzymes digestives et vitamine C.",
  "conseil": "1) Plantez un tuteur au pied du plant jeune.\n"
             "2) Arrosez souvent avec paillage autour.\n"
             "3) Taillez les branches basses.\n"
             "4) Fertilisez chaque saison des pluies.\n"
             "5) Protégez des fortes pluies et du vent jeune."
},

"ail": {
  "nom": "Ail",
  "nom_latin": "Allium sativum",
  "famille": "Amaryllidacées",
  "origine": "Asie centrale, culture locale",
  "milieu_naturel": "Climat tempéré chaud",
  "type_sol": "Sol riche, bien drainé, pH 6–7",
  "besoin_en_eau": "Arrosage modéré",
  "exposition": "Plein soleil",
  "temperature_air_min": 10,
  "temperature_air_max": 30,
  "humidite_air_min": 40,
  "humidite_air_max": 80,
  "humidite_sol_min": 40,
  "humidite_sol_max": 70,
  "N_min": 20,
  "N_max": 100,
  "P_min": 10,
  "P_max": 40,
  "K_min": 20,
  "K_max": 60,
  "ph_min": 6.0,
  "ph_max": 7.0,
  "difficulte": "easy",
  "periode_plantation": "Fin des pluies/début de saison sèche",
  "temps_de_pousse": "90 à 120 jours",
  "engrais_recommande": "Compost ou fumier léger avant plantation",
  "sensibilite": "Sensible à l’eau stagnante",
  "description": "L’ail est utilisé comme condiment, reconnu pour ses propriétés antiseptiques.",
  "conseil": "1) Plantez les gousses tête tournée vers le haut.\n"
             "2) Arrosez régulièrement mais sans excès.\n"
             "3) Sarclez après la plantation.\n"
             "4) Buttez légèrement pour protéger les têtes.\n"
             "5) Récoltez quand les feuilles jaunissent."
},

"épinard_africain": {
  "nom": "Épinard africain",
  "nom_latin": "Amaranthus cruentus",
  "famille": "Amaranthacées",
  "origine": "Afrique, culture traditionnelle",
  "milieu_naturel": "Climat tropical humide",
  "type_sol": "Sol fertile, léger, bien drainé",
  "besoin_en_eau": "Arrosage régulier",
  "exposition": "Plein soleil ou mi‑ombre",
  "temperature_air_min": 20,
  "temperature_air_max": 35,
  "humidite_air_min": 50,
  "humidite_air_max": 90,
  "humidite_sol_min": 30,
  "humidite_sol_max": 70,
  "N_min": 20,
  "N_max": 60,
  "P_min": 10,
  "P_max": 30,
  "K_min": 10,
  "K_max": 40,
  "ph_min": 6.0,
  "ph_max": 7.0,
  "difficulte": "easy",
  "periode_plantation": "Début des pluies",
  "temps_de_pousse": "30 à 60 jours",
  "engrais_recommande": "Compost riche avant semis",
  "sensibilite": "Sensible à la sécheresse",
  "description": "Légume-feuille riche en fer et vitamines, très consommé localement.",
  "conseil": "1) Semez en ligne espacée.\n"
             "2) Arrosez fréquemment les jeunes plants.\n"
             "3) Récoltez les feuilles au fur et à mesure.\n"
             "4) Paillez pour conserver l’humidité.\n"
             "5) Remplacez le sol après plusieurs récoltes."
},

"niébé": {
  "nom": "Niébé",
  "nom_latin": "Vigna unguiculata",
  "famille": "Fabacées",
  "origine": "Afrique de l’Ouest",
  "milieu_naturel": "Climat tropical sec à humide",
  "type_sol": "Sol léger, bien drainé",
  "besoin_en_eau": "Arrosage modéré",
  "exposition": "Plein soleil",
  "temperature_air_min": 20,
  "temperature_air_max": 35,
  "humidite_air_min": 40,
  "humidite_air_max": 90,
  "humidite_sol_min": 30,
  "humidite_sol_max": 70,
  "N_min": 20,
  "N_max": 60,
  "P_min": 10,
  "P_max": 30,
  "K_min": 10,
  "K_max": 40,
  "ph_min": 6.0,
  "ph_max": 7.0,
  "difficulte": "easy",
  "periode_plantation": "Début des pluies",
  "temps_de_pousse": "60 à 90 jours",
  "engrais_recommande": "Compost avant semis, pas d’engrais azoté",
  "sensibilite": "Sensibilité à l’excès d’eau",
  "description": "Légumineuse riche en protéines, très prisée dans les sauces et salades.",
  "conseil": "1) Associez avec du maïs pour enrichir le sol.\n"
             "2) Arrosez régulièrement les premières semaines.\n"
             "3) Récoltez au moment où les gousses sèchent.\n"
             "4) Nettoyez les mauvaises herbes autour des plants.\n"
             "5) Utilisez les résidus en compost."
},

"basilic": {
  "nom": "Basilic",
  "nom_latin": "Ocimum basilicum",
  "famille": "Lamiacées",
  "origine": "Asie tropicale, aromatique",
  "milieu_naturel": "Climat chaud, humide",
  "type_sol": "Sol riche, bien drainé",
  "besoin_en_eau": "Arrosage régulier",
  "exposition": "Plein soleil à mi‑ombre",
  "temperature_air_min": 18,
  "temperature_air_max": 30,
  "humidite_air_min": 50,
  "humidite_air_max": 90,
  "humidite_sol_min": 40,
  "humidite_sol_max": 70,
  "N_min": 20,
  "N_max": 60,
  "P_min": 10,
  "P_max": 30,
  "K_min": 10,
  "K_max": 40,
  "ph_min": 6.0,
  "ph_max": 7.5,
  "difficulte": "easy",
  "periode_plantation": "Début des pluies ou sous abri",
  "temps_de_pousse": "60 à 90 jours",
  "engrais_recommande": "Compost léger avant semis",
  "sensibilite": "Sensibilité au froid",
  "description": "Plante aromatique utilisée pour relever les plats, favorise la lutte contre les insectes.",
  "conseil": "1) Coupez les tiges régulièrement pour stimuler la pousse.\n"
             "2) Arrosez modérément le matin.\n"
             "3) Paillez pour éviter la perte d’humidité.\n"
             "4) Plantez près du piment ou tomate pour renforcer la protection mutuelle.\n"
             "5) Récoltez les feuilles avant la floraison pour plus de parfum."
},

"menthe": {
  "nom": "Menthe",
  "nom_latin": "Mentha spicata",
  "famille": "Lamiacées",
  "origine": "Europe/Asie, aromatique",
  "milieu_naturel": "Climat tempéré humide",
  "type_sol": "Humifère, riche, frais",
  "besoin_en_eau": "Arrosage fréquent, sol toujours humide",
  "exposition": "Mi‑ombre à plein soleil",
  "temperature_air_min": 15,
  "temperature_air_max": 30,
  "humidite_air_min": 60,
  "humidite_air_max": 90,
  "humidite_sol_min": 50,
  "humidite_sol_max": 80,
  "N_min": 20,
  "N_max": 60,
  "P_min": 10,
  "P_max": 40,
  "K_min": 10,
  "K_max": 40,
  "ph_min": 6.0,
  "ph_max": 7.5,
  "difficulte": "easy",
  "periode_plantation": "Début des pluies ou sous abri",
  "temps_de_pousse": "60 à 90 jours",
  "engrais_recommande": "Compost avant plantation",
  "sensibilite": "Sensible à la chaleur excessive",
  "description": "Plante aromatique rafraîchissante, utilisée en infusion et cuisine.",
  "conseil": "1) Plantez en pot ou zone confinée (envahissante).\n"
             "2) Arrosez fréquemment et paillez profondément.\n"
             "3) Récoltez les jeunes pousses régulièrement.\n"
             "4) Taillez après floraison pour regénération.\n"
             "5) Surveillez la présence de pucerons."
},

"coriandre": {
  "nom": "Coriandre",
  "nom_latin": "Coriandrum sativum",
  "famille": "Apiacées",
  "origine": "Sud‑Ouest asiatique, aromatique",
  "milieu_naturel": "Climat tempéré à chaud",
  "type_sol": "Sol frais, riche, bien drainé",
  "besoin_en_eau": "Arrosage régulier",
  "exposition": "Plein soleil à mi‑ombre",
  "temperature_air_min": 15,
  "temperature_air_max": 30,
  "humidite_air_min": 50,
  "humidite_air_max": 90,
  "humidite_sol_min": 40,
  "humidite_sol_max": 70,
  "N_min": 20,
  "N_max": 60,
  "P_min": 10,
  "P_max": 40,
  "K_min": 10,
  "K_max": 40,
  "ph_min": 6.0,
  "ph_max": 7.5,
  "difficulte": "easy",
  "periode_plantation": "Fin des pluies ou sous abri",
  "temps_de_pousse": "40 à 60 jours",
  "engrais_recommande": "Compost léger avant semis",
  "sensibilite": "Sensible à l’humidité excessive",
  "description": "Herbe aromatique aux feuilles et graines utilisées en cuisine et médecine.",
  "conseil": "1) Semez en ligne espacée.\n"
             "2) Arrosez régulièrement le matin.\n"
             "3) Récoltez les feuilles avant la floraison.\n"
             "4) Éclaircissez pour aérer les plants.\n"
             "5) Laissez quelques plants monter en graines pour en récolter."
},

"fenouil": {
  "nom": "Fenouil",
  "nom_latin": "Foeniculum vulgare",
  "famille": "Apiacées",
  "origine": "Europe/Asie, cultivé localement",
  "milieu_naturel": "Climat méditerranéen à tempéré",
  "type_sol": "Sol riche, meuble, bien drainé",
  "besoin_en_eau": "Arrosage régulier, sol frais",
  "exposition": "Plein soleil à mi‑ombre",
  "temperature_air_min": 15,
  "temperature_air_max": 30,
  "humidite_air_min": 50,
  "humidite_air_max": 80,
  "humidite_sol_min": 40,
  "humidite_sol_max": 70,
  "N_min": 20,
  "N_max": 80,
  "P_min": 10,
  "P_max": 40,
  "K_min": 20,
  "K_max": 70,
  "ph_min": 6.0,
  "ph_max": 7.5,
  "difficulte": "easy",
  "periode_plantation": "Fin des pluies",
  "temps_de_pousse": "90 à 120 jours",
  "engrais_recommande": "Compost avant plantation",
  "sensibilite": "Sensible à la chaleur extrême",
  "description": "Plante aromatique et médicinale, utilisée en infusions et cuisine.",
  "conseil": "1) Plantez espacés de 30 cm.\n"
             "2) Arrosez régulièrement au pied.\n  "
             "3) Paillez pour garder l’humidité.\n"
             "4) Récoltez les feuilles jeunes pour plus de saveur.\n"
             "5) Faites une rotation avec une légumineuse."
},

"carotte": {
  "nom": "Carotte",
  "nom_latin": "Daucus carota subsp. sativus",
  "famille": "Apiacées",
  "origine": "Europe, largement cultivée en Afrique",
  "milieu_naturel": "Climat tempéré à subtropical",
  "type_sol": "Sableux, meuble, profond, bien drainé",
  "besoin_en_eau": "Arrosage léger mais fréquent",
  "exposition": "Plein soleil",
  "temperature_air_min": 16,
  "temperature_air_max": 25,
  "humidite_air_min": 50,
  "humidite_air_max": 80,
  "humidite_sol_min": 40,
  "humidite_sol_max": 70,
  "N_min": 30,
  "N_max": 80,
  "P_min": 15,
  "P_max": 45,
  "K_min": 20,
  "K_max": 70,
  "ph_min": 6.0,
  "ph_max": 7.0,
  "difficulte": "easy",
  "periode_plantation": "Début de saison sèche ou fin des pluies",
  "temps_de_pousse": "70 à 90 jours",
  "engrais_recommande": "Compost mûr, éviter l'excès d’azote",
  "sensibilite": "Sensible aux sols compacts et aux racines fourchues",
  "description": "Racine comestible riche en bêta-carotène, consommée crue ou cuite.",
  "conseil": "1) Préparez un sol finement émietté et sans pierres.\n"
             "2) Semez en ligne et éclaircissez dès que possible.\n"
             "3) Arrosez sans excès pour éviter les fissures.\n"
             "4) Sarclez régulièrement pour limiter les mauvaises herbes.\n"
             "5) Récoltez dès que les racines atteignent leur taille optimale."
},

"concombre": {
  "nom": "Concombre",
  "nom_latin": "Cucumis sativus",
  "famille": "Cucurbitacées",
  "origine": "Asie du Sud, cultivé mondialement",
  "milieu_naturel": "Climat chaud et humide",
  "type_sol": "Sol meuble, riche en humus, bien drainé",
  "besoin_en_eau": "Arrosage régulier et abondant",
  "exposition": "Plein soleil",
  "temperature_air_min": 20,
  "temperature_air_max": 30,
  "humidite_air_min": 60,
  "humidite_air_max": 90,
  "humidite_sol_min": 50,
  "humidite_sol_max": 80,
  "N_min": 30,
  "N_max": 90,
  "P_min": 20,
  "P_max": 60,
  "K_min": 30,
  "K_max": 90,
  "ph_min": 6.0,
  "ph_max": 7.5,
  "difficulte": "easy",
  "periode_plantation": "Début des pluies ou en irrigation",
  "temps_de_pousse": "50 à 70 jours",
  "engrais_recommande": "Compost + apport de cendre ou potassium naturel",
  "sensibilite": "Sensible à l’oïdium et au manque d’eau",
  "description": "Légume-fruit rafraîchissant, riche en eau, apprécié en salade.",
  "conseil": "1) Semez directement en poquets de 2-3 graines.\n"
             "2) Arrosez abondamment sans mouiller les feuilles.\n"
             "3) Tuteurez pour gagner de la place et éviter les maladies.\n"
             "4) Récoltez tôt pour un goût plus doux.\n"
             "5) Associez avec basilic pour éloigner les pucerons."
},

"aubergine": {
  "nom": "Aubergine",
  "nom_latin": "Solanum melongena",
  "famille": "Solanacées",
  "origine": "Asie du Sud, cultivée localement en Afrique",
  "milieu_naturel": "Climat tropical chaud et humide",
  "type_sol": "Sol riche, léger et bien drainé",
  "besoin_en_eau": "Arrosage régulier et modéré",
  "exposition": "Plein soleil",
  "temperature_air_min": 22,
  "temperature_air_max": 30,
  "humidite_air_min": 50,
  "humidite_air_max": 85,
  "humidite_sol_min": 40,
  "humidite_sol_max": 70,
  "N_min": 40,
  "N_max": 90,
  "P_min": 20,
  "P_max": 60,
  "K_min": 30,
  "K_max": 80,
  "ph_min": 6.0,
  "ph_max": 7.0,
  "difficulte": "easy",
  "periode_plantation": "Début des pluies ou sous irrigation",
  "temps_de_pousse": "90 à 120 jours",
  "engrais_recommande": "Compost bien mûr, et ajout de cendre en floraison",
  "sensibilite": "Sensible aux acariens et aux altises",
  "description": "Légume-fruit consommé cuit, utilisé dans les sauces ou fritures.",
  "conseil": "1) Semez sous pépinière et repiquez après 4 feuilles.\n"
             "2) Tuteurez les plants pour éviter que les tiges se cassent.\n"
             "3) Arrosez régulièrement, sans mouiller les feuilles.\n"
             "4) Récoltez les fruits jeunes et brillants.\n"
             "5) Associez avec le basilic pour éloigner les insectes."
},

"dalo": {
  "nom": "Dalo",
  "nom_latin": "Xanthosoma sagittifolium",
  "famille": "Aracées",
  "origine": "Amérique tropicale, cultivée en Afrique",
  "milieu_naturel": "Climat tropical humide",
  "type_sol": "Sol fertile, meuble et riche en matière organique",
  "besoin_en_eau": "Arrosage régulier pour maintenir le sol humide",
  "exposition": "Plein soleil ou mi-ombre",
  "temperature_air_min": 20,
  "temperature_air_max": 35,
  "humidite_air_min": 60,
  "humidite_air_max": 95,
  "humidite_sol_min": 50,
  "humidite_sol_max": 90,
  "N_min": 30,
  "N_max": 80,
  "P_min": 10,
  "P_max": 40,
  "K_min": 30,
  "K_max": 80,
  "ph_min": 5.5,
  "ph_max": 7.0,
  "difficulte": "easy",
  "periode_plantation": "Début des pluies",
  "temps_de_pousse": "6 à 9 mois",
  "engrais_recommande": "Compost bien mûr avant plantation, cendre 2 mois après",
  "sensibilite": "Sensible à l’eau stagnante sur les tubercules",
  "description": "Tubercule riche en amidon, très consommé comme aliment de base.",
  "conseil": "1) Plantez en billons pour faciliter le drainage.\n"
             "2) Arrosez régulièrement mais évitez le pourrissement.\n"
             "3) Désherbez les trois premiers mois.\n"
             "4) Apportez du compost à mi-croissance.\n"
             "5) Récoltez quand les feuilles jaunissent."
},

"haricots_niangon": {
  "nom": "Haricot Niangon",
  "nom_latin": "Voandzeia subterranea",
  "famille": "Fabacées",
  "origine": "Afrique tropicale, très cultivé au Bénin",
  "milieu_naturel": "Climat tropical humide à sec",
  "type_sol": "Sol léger, fertile, drainé",
  "besoin_en_eau": "Arrosage léger et régulier",
  "exposition": "Plein soleil",
  "temperature_air_min": 20,
  "temperature_air_max": 35,
  "humidite_air_min": 40,
  "humidite_air_max": 90,
  "humidite_sol_min": 30,
  "humidite_sol_max": 70,
  "N_min": 20,
  "N_max": 60,
  "P_min": 10,
  "P_max": 40,
  "K_min": 10,
  "K_max": 40,
  "ph_min": 5.5,
  "ph_max": 7.0,
  "difficulte": "easy",
  "periode_plantation": "Début des pluies",
  "temps_de_pousse": "80 à 100 jours",
  "engrais_recommande": "Compost léger avant semis, pas d’engrais azoté",
  "sensibilite": "Sensible à l’eau stagnante",
  "description": "Légume-grain produisant des tubercules comestibles, riche en protéines.",
  "conseil": "1) Semez dès les premières pluies.\n"
             "2) Arrosez légèrement si besoin.\n"
             "3) Désarrosez pour éviter les maladies.\n"
             "4) Récoltez quand les gousses sèchent.\n"
             "5) Rotatez avec des céréales."
},

"pois_d_angole": {
  "nom": "Pois d’Angole",
  "nom_latin": "Cajanus cajan",
  "famille": "Fabacées",
  "origine": "Inde, adapté localement",
  "milieu_naturel": "Climat tropical sec à humide",
  "type_sol": "Sol léger à moyen, drainé",
  "besoin_en_eau": "Arrosage modéré",
  "exposition": "Plein soleil",
  "temperature_air_min": 20,
  "temperature_air_max": 35,
  "humidite_air_min": 40,
  "humidite_air_max": 90,
  "humidite_sol_min": 30,
  "humidite_sol_max": 70,
  "N_min": 20,
  "N_max": 80,
  "P_min": 10,
  "P_max": 40,
  "K_min": 10,
  "K_max": 40,
  "ph_min": 5.5,
  "ph_max": 7.0,
  "difficulte": "easy",
  "periode_plantation": "Début des pluies",
  "temps_de_pousse": "90 à 150 jours",
  "engrais_recommande": "Compost léger avant semis, pas d’azote",
  "sensibilite": "Peu sensible, robuste en sécheresse",
  "description": "Légumineuse produisant des graines riches, idéale pour rotation des cultures.",
  "conseil": "1) Plantez après céréales pour fixer azote.\n"
             "2) Arrosez les premières semaines.\n"
             "3) Récoltez les gousses dès qu’elles sèchent.\n"
             "4) Encouragez la croissance des racines pour enrichir le sol.\n"
             "5) Utilisez comme couverture végétale."
},

"patate_amere": {
  "nom": "Patate amère",
  "nom_latin": "Tropaeolum tuberosum",
  "famille": "Tropaeolaceae",
  "origine": "Amérique du Sud, expérimentée localement",
  "milieu_naturel": "Climat tempéré tropical",
  "type_sol": "Sol léger, riche et bien drainé",
  "besoin_en_eau": "Arrosage modéré",
  "exposition": "Plein soleil",
  "temperature_air_min": 16,
  "temperature_air_max": 30,
  "humidite_air_min": 50,
  "humidite_air_max": 90,
  "humidite_sol_min": 40,
  "humidite_sol_max": 80,
  "N_min": 20,
  "N_max": 60,
  "P_min": 10,
  "P_max": 30,
  "K_min": 30,
  "K_max": 90,
  "ph_min": 5.5,
  "ph_max": 7.0,
  "difficulte": "easy",
  "periode_plantation": "Fin des pluies ou sous abri",
  "temps_de_pousse": "150 à 210 jours",
  "engrais_recommande": "Compost avant mise en terre, léger apport de cendre en croissance",
  "sensibilite": "Sensible au froid",
  "description": "Tubercule riche en protéines et amidon résistant.",
  "conseil": "1) Plantez rhizomes en billons.\n"
             "2) Arrosez avec soin pour maintenir humidité.\n"
             "3) Paillez pour préserver l'humidité.\n"
             "4) Récoltez après jaunissement des feuilles.\n"
             "5) Rotatez avec légumineuses."
},

"courge": {
  "nom": "Courge",
  "nom_latin": "Cucurbita pepo",
  "famille": "Cucurbitacées",
  "origine": "Amérique centrale, très cultivée en Afrique",
  "milieu_naturel": "Climat tropical à subtropical",
  "type_sol": "Sol riche, bien ameubli et drainé",
  "besoin_en_eau": "Arrosage abondant et régulier",
  "exposition": "Plein soleil",
  "temperature_air_min": 20,
  "temperature_air_max": 35,
  "humidite_air_min": 50,
  "humidite_air_max": 90,
  "humidite_sol_min": 40,
  "humidite_sol_max": 80,
  "N_min": 40,
  "N_max": 90,
  "P_min": 20,
  "P_max": 60,
  "K_min": 30,
  "K_max": 90,
  "ph_min": 6.0,
  "ph_max": 7.5,
  "difficulte": "easy",
  "periode_plantation": "Début des pluies",
  "temps_de_pousse": "90 à 120 jours",
  "engrais_recommande": "Compost et cendre de bois bien mélangés",
  "sensibilite": "Sensible à l’oïdium et aux mouches des fruits",
  "description": "Légume-fruit à gros fruits comestibles, très apprécié en sauce ou en purée.",
  "conseil": "1) Espacez les plants d’au moins 1 mètre.\n"
             "2) Arrosez abondamment sans mouiller les feuilles.\n"
             "3) Paillez pour limiter les mauvaises herbes.\n"
             "4) Récoltez quand la peau devient dure.\n"
             "5) Associez à la menthe ou au basilic contre les insectes."
},

"betterave": {
  "nom": "Betterave",
  "nom_latin": "Beta vulgaris",
  "famille": "Chénopodiacées",
  "origine": "Europe, introduite en Afrique",
  "milieu_naturel": "Climat tempéré ou tropical modéré",
  "type_sol": "Sol profond, meuble, riche en matière organique",
  "besoin_en_eau": "Arrosage régulier sans excès",
  "exposition": "Plein soleil ou légère mi-ombre",
  "temperature_air_min": 15,
  "temperature_air_max": 30,
  "humidite_air_min": 50,
  "humidite_air_max": 80,
  "humidite_sol_min": 40,
  "humidite_sol_max": 70,
  "N_min": 30,
  "N_max": 70,
  "P_min": 20,
  "P_max": 50,
  "K_min": 30,
  "K_max": 80,
  "ph_min": 6.0,
  "ph_max": 7.5,
  "difficulte": "easy",
  "periode_plantation": "Fin des pluies ou début de saison sèche",
  "temps_de_pousse": "60 à 90 jours",
  "engrais_recommande": "Compost mûr + fumure organique",
  "sensibilite": "Sensible à la sécheresse et aux sols acides",
  "description": "Racine rouge sucrée, consommée en salade ou cuite.",
  "conseil": "1) Travaillez le sol en profondeur.\n"
             "2) Arrosez légèrement mais souvent.\n"
             "3) Éclaircissez les jeunes plants.\n"
             "4) Récoltez quand les racines font la taille d'une balle de tennis.\n"
             "5) Associez avec la laitue ou l’oignon pour maximiser l’espace."
},

"laitue": {
  "nom": "Laitue",
  "nom_latin": "Lactuca sativa",
  "famille": "Astéracées",
  "origine": "Méditerranée, largement cultivée au Bénin",
  "milieu_naturel": "Climat frais ou modéré",
  "type_sol": "Sol riche, frais, bien drainé",
  "besoin_en_eau": "Arrosage régulier pour garder le sol humide",
  "exposition": "Plein soleil ou mi-ombre",
  "temperature_air_min": 15,
  "temperature_air_max": 28,
  "humidite_air_min": 50,
  "humidite_air_max": 90,
  "humidite_sol_min": 40,
  "humidite_sol_max": 80,
  "N_min": 20,
  "N_max": 60,
  "P_min": 10,
  "P_max": 30,
  "K_min": 20,
  "K_max": 50,
  "ph_min": 6.0,
  "ph_max": 7.0,
  "difficulte": "easy",
  "periode_plantation": "Fin des pluies ou en saison sèche",
  "temps_de_pousse": "40 à 60 jours",
  "engrais_recommande": "Compost léger, pas trop d’azote",
  "sensibilite": "Sensible à la chaleur et à la montée en graines",
  "description": "Légume-feuille consommé en salade, très prisé pour sa fraîcheur.",
  "conseil": "1) Semez à la volée ou en ligne, en pépinière ou directement.\n"
             "2) Arrosez tous les deux jours.\n"
             "3) Récoltez les feuilles avant floraison.\n"
             "4) Ombrez légèrement en pleine chaleur.\n"
             "5) Associez avec les carottes pour optimiser le terrain."
},

"sorgho": {
  "nom": "Sorgho",
  "nom_latin": "Sorghum bicolor",
  "famille": "Poacées",
  "origine": "Afrique sub-saharienne",
  "milieu_naturel": "Climat tropical sec à humide",
  "type_sol": "Sol léger à argileux, bien drainé",
  "besoin_en_eau": "Arrosage modéré, tolère la sécheresse",
  "exposition": "Plein soleil",
  "temperature_air_min": 18,
  "temperature_air_max": 35,
  "humidite_air_min": 30,
  "humidite_air_max": 90,
  "humidite_sol_min": 20,
  "humidite_sol_max": 70,
  "N_min": 20,
  "N_max": 100,
  "P_min": 10,
  "P_max": 50,
  "K_min": 20,
  "K_max": 80,
  "ph_min": 5.5,
  "ph_max": 7.0,
  "difficulte": "easy",
  "periode_plantation": "Début des pluies",
  "temps_de_pousse": "100 à 150 jours",
  "engrais_recommande": "Compost avant semis, cendre au tallage",
  "sensibilite": "Sensibilité modérée au climat trop humide",
  "description": "Céréale rustique utilisée pour la farine ou l’alimentation animale.",
  "conseil": "1) Semez en lignes espacées de 60 cm.\n"
             "2) Éclaircissez pour ne garder que les plants vigoureux.\n"
             "3) Arrosez en début, réduisez après levée.\n"
             "4) Buttez pour renforcer les tiges.\n"
             "5) Récoltez quand les panicules brunissent."
},

"anacarde": {
  "nom": "Noix de cajou",
  "nom_latin": "Anacardium occidentale",
  "famille": "Anacardiacées",
  "origine": "Amérique tropicale",
  "milieu_naturel": "Climat tropical semi‑humide",
  "type_sol": "Sol sablo‑argileux, bien drainé",
  "besoin_en_eau": "Arrosage modéré, tolère sécheresse",
  "exposition": "Plein soleil",
  "temperature_air_min": 18,
  "temperature_air_max": 35,
  "humidite_air_min": 50,
  "humidite_air_max": 95,
  "humidite_sol_min": 30,
  "humidite_sol_max": 70,
  "N_min": 20,
  "N_max": 80,
  "P_min": 10,
  "P_max": 40,
  "K_min": 20,
  "K_max": 80,
  "ph_min": 5.5,
  "ph_max": 7.0,
  "difficulte": "easy",
  "periode_plantation": "Fin saison des pluies",
  "temps_de_pousse": "3 à 5 ans avant première récolte",
  "engrais_recommande": "Compost annuel au pied",
  "sensibilite": "Sensible à l’eau stagnante et au vent fort",
  "description": "Arbre produisant noix comestibles très prisées comme fruit à coque.",
  "conseil": "1) Tuteurez jeune plant.\n"
             "2) Arrosez lors des sècheresses prolongées.\n"
             "3) Paillez pour conserver l’humidité.\n"
             "4) Taillez pour former une charpente solide.\n"
             "5) Protégez des insectes graves au début."
},

"arachide": {
  "nom": "Lentille de terre",
  "nom_latin": "Macrotyloma geocarpum",
  "famille": "Fabacées",
  "origine": "Afrique de l’Ouest",
  "milieu_naturel": "Climat tropical saisonnier",
  "type_sol": "Sol léger et fertile",
  "besoin_en_eau": "Arrosage léger, adapté à la pluie",
  "exposition": "Plein soleil",
  "temperature_air_min": 20,
  "temperature_air_max": 35,
  "humidite_air_min": 40,
  "humidite_air_max": 90,
  "humidite_sol_min": 30,
  "humidite_sol_max": 65,
  "N_min": 10,
  "N_max": 50,
  "P_min": 5,
  "P_max": 30,
  "K_min": 10,
  "K_max": 40,
  "ph_min": 6.0,
  "ph_max": 7.0,
  "difficulte": "easy",
  "periode_plantation": "Début des pluies",
  "temps_de_pousse": "90 à 120 jours",
  "engrais_recommande": "Peu d’engrais car fixatrice d’azote",
  "sensibilite": "Sensible à l’excès d’eau",
  "description": "Légumineuse produisant des graines nutritives enfouies dans le sol.",
  "conseil": "1) Semez en lignes espacées de 50 cm.\n"
             "2) Laisser fixer l’azote naturellement.\n"
             "3) Arrosez les premiers jours.\n"
             "4) Récoltez quand les gousses sont sèches.\n"
             "5) Utilisez en rotation pour enrichir le sol."
},

"Sésame": {
  "nom": "Sésame",
  "nom_latin": "Sesamum radiatum",
  "famille": "Pédaliacées",
  "origine": "Afrique de l’Ouest",
  "milieu_naturel": "Climat tropical chaud",
  "type_sol": "Sol sableux, bien drainé",
  "besoin_en_eau": "Arrosage modéré",
  "exposition": "Plein soleil",
  "temperature_air_min": 20,
  "temperature_air_max": 35,
  "humidite_air_min": 30,
  "humidite_air_max": 80,
  "humidite_sol_min": 30,
  "humidite_sol_max": 70,
  "N_min": 10,
  "N_max": 40,
  "P_min": 5,
  "P_max": 20,
  "K_min": 10,
  "K_max": 30,
  "ph_min": 6.0,
  "ph_max": 7.5,
  "difficulte": "easy",
  "periode_plantation": "Début des pluies",
  "temps_de_pousse": "70 à 90 jours",
  "engrais_recommande": "Compost léger avant semis",
  "sensibilite": "Sensible à l’humidité excessive",
  "description": "Plante oléagineuse nutritive utilisée pour ses graines.",
  "conseil": "1) Semez peu profond, éclaircissez.\n"
             "2) Arrosez régulièrement au début.\n"
             "3) Récoltez quand les capsules brunissent.\n"
             "4) Séchez soigneusement avant stockage.\n"
             "5) Plantez avec légumineuses pour enrichir le sol."
},

"cléome": {
  "nom": "Adjèlè",
  "nom_latin": "Cleome gynandra",
  "famille": "Capparidacées",
  "origine": "Afrique tropicale",
  "milieu_naturel": "Climat tropical humide",
  "type_sol": "Sol fertile, drainé",
  "besoin_en_eau": "Arrosage régulier",
  "exposition": "Plein soleil ou mi‑ombre",
  "temperature_air_min": 20,
  "temperature_air_max": 35,
  "humidite_air_min": 50,
  "humidite_air_max": 95,
  "humidite_sol_min": 40,
  "humidite_sol_max": 80,
  "N_min": 10,
  "N_max": 40,
  "P_min": 5,
  "P_max": 20,
  "K_min": 10,
  "K_max": 30,
  "ph_min": 6.0,
  "ph_max": 7.5,
  "difficulte": "easy",
  "periode_plantation": "Début des pluies",
  "temps_de_pousse": "30 à 60 jours",
  "engrais_recommande": "Compost léger avant semis",
  "sensibilite": "Peu sensible aux stress hydriques",
  "description": "Légume-feuille traditionnel riche en micronutriments.",
  "conseil": "1) Semez en pépinière, repiquez 20 cm.\n"
             "2) Récoltez les jeunes pousses.\n"
             "3) Arrosez pour maintenir humidité.\n"
             "4) Utilisez en rotation pour diversifier.\n"
             "5) Coupe fréquente favorise nouvelles pousses."
},

"pissenlit africain": {
  "nom": "pissenlit africain",
  "nom_latin": "Launaea taraxacifolia",
  "famille": "Astéracées",
  "origine": "Afrique de l’Ouest",
  "milieu_naturel": "Climat tropical humide",
  "type_sol": "Sol riche, drainé",
  "besoin_en_eau": "Arrosage régulier",
  "exposition": "Plein soleil à mi‑ombre",
  "temperature_air_min": 20,
  "temperature_air_max": 32,
  "humidite_air_min": 60,
  "humidite_air_max": 95,
  "humidite_sol_min": 40,
  "humidite_sol_max": 90,
  "N_min": 20,
  "N_max": 60,
  "P_min": 10,
  "P_max": 30,
  "K_min": 10,
  "K_max": 40,
  "ph_min": 6.0,
  "ph_max": 7.0,
  "difficulte": "easy",
  "periode_plantation": "Début des pluies",
  "temps_de_pousse": "30 à 60 jours",
  "engrais_recommande": "Compost léger avant semis",
  "sensibilite": "Peu sensible",
  "description": "Légume-feuille localement appelé “gnanri”.",
  "conseil": "1) Semis en ligne, éclaircissage 10 cm.\n"
             "2) Récolte continue des feuilles.\n"
             "3) Arrosage régulier.\n"
             "4) Paillez pour protéger le sol.\n"
             "5) Associez avec maïs ou sorgho."
},

"poivre de Guinée": {
  "nom": "Poivre de Guinée",
  "nom_latin": "Piper guineense",
  "famille": "Pipéracées",
  "origine": "Afrique de l’Ouest",
  "milieu_naturel": "Climat tropical humide",
  "type_sol": "Sol fertile, drainé",
  "besoin_en_eau": "Arrosage modéré",
  "exposition": "Mi‑ombre",
  "temperature_air_min": 20,
  "temperature_air_max": 30,
  "humidite_air_min": 60,
  "humidite_air_max": 95,
  "humidite_sol_min": 40,
  "humidite_sol_max": 80,
  "N_min": 20,
  "N_max": 60,
  "P_min": 10,
  "P_max": 40,
  "K_min": 10,
  "K_max": 40,
  "ph_min": 6.0,
  "ph_max": 7.0,
  "difficulte": "easy",
  "periode_plantation": "Début des pluies",
  "temps_de_pousse": "2 à 3 ans avant production",
  "engrais_recommande": "Compost organique annuel",
  "sensibilite": "Sensible au vent et à la sécheresse",
  "description": "Épice locale, baie parfumée utilisée en cuisine traditionnelle.",
  "conseil": "1) Installez un tuteur pour la plante grimpe.\n"
             "2) Arrosez régulièrement.\n"
             "3) Récoltez les baies rouges.\n"
             "4) Séchez à l’ombre.\n"
             "5) Plantez en haie autour du potager."
},

"tetragone": {
  "nom": "Tétragone",
  "nom_latin": "Tetragonia tetragonioides",
  "famille": "Aizoacées",
  "origine": "Australie et Nouvelle-Zélande, introduite au Bénin",
  "milieu_naturel": "Climat tropical modéré à humide",
  "type_sol": "Sol frais, meuble et bien drainé",
  "besoin_en_eau": "Arrosage régulier, surtout en période sèche",
  "exposition": "Plein soleil ou mi-ombre",
  "temperature_air_min": 18,
  "temperature_air_max": 30,
  "humidite_air_min": 50,
  "humidite_air_max": 90,
  "humidite_sol_min": 40,
  "humidite_sol_max": 80,
  "N_min": 20,
  "N_max": 50,
  "P_min": 10,
  "P_max": 30,
  "K_min": 20,
  "K_max": 60,
  "ph_min": 6.0,
  "ph_max": 7.5,
  "difficulte": "easy",
  "periode_plantation": "Début de saison sèche sous irrigation",
  "temps_de_pousse": "50 à 70 jours",
  "engrais_recommande": "Compost végétal ou fumier bien décomposé",
  "sensibilite": "Sensible au gel, mais bien adaptée à la chaleur",
  "description": "Légume-feuille ressemblant à l’épinard, très nutritif et résistant à la chaleur.",
  "conseil": "1) Semez directement en poquets espacés de 30 cm.\n"
             "2) Arrosez tous les deux jours pour favoriser la croissance.\n"
             "3) Récoltez les jeunes pousses pour stimuler la ramification.\n"
             "4) Paillez pour limiter les mauvaises herbes.\n"
             "5) Associez-la avec des carottes ou des oignons pour économiser l'espace."
},

"souchet": {
  "nom": "Souchet comestible",
  "nom_latin": "Cyperus esculentus",
  "famille": "Cypéracées",
  "origine": "Afrique de l’Ouest, notamment le Bénin et le Nigeria",
  "milieu_naturel": "Climat tropical chaud",
  "type_sol": "Sol sablonneux ou limoneux, meuble et bien drainé",
  "besoin_en_eau": "Arrosage fréquent jusqu’à formation des tubercules",
  "exposition": "Plein soleil",
  "temperature_air_min": 20,
  "temperature_air_max": 35,
  "humidite_air_min": 50,
  "humidite_air_max": 90,
  "humidite_sol_min": 40,
  "humidite_sol_max": 80,
  "N_min": 20,
  "N_max": 60,
  "P_min": 10,
  "P_max": 30,
  "K_min": 30,
  "K_max": 80,
  "ph_min": 6.0,
  "ph_max": 7.5,
  "difficulte": "easy",
  "periode_plantation": "Fin des pluies",
  "temps_de_pousse": "90 à 120 jours",
  "engrais_recommande": "Compost ou fumier léger avant plantation",
  "sensibilite": "Sensible à l’humidité excessive",
  "description": "Tubercule croquant au goût sucré, utilisé pour le lait végétal (‘horchata’) et les en-cas.",
  "conseil": "1) Semez les tubercules à 10 cm de profondeur.\n"
             "2) Arrosez régulièrement sans excès.\n"
             "3) Binez pour aérer le sol.\n"
             "4) Récoltez à la fin du cycle lorsque le feuillage jaunit.\n"
             "5) Laissez sécher les tubercules au soleil 3 à 4 jours avant stockage."
},

"millet": {
  "nom": "Millet",
  "nom_latin": "Pennisetum glaucum",
  "famille": "Poacées",
  "origine": "Afrique de l’Ouest",
  "milieu_naturel": "Climat tropical sec à semi-aride",
  "type_sol": "Sol sableux ou limoneux, bien drainé",
  "besoin_en_eau": "Très faible, tolère bien la sécheresse",
  "exposition": "Plein soleil",
  "temperature_air_min": 20,
  "temperature_air_max": 38,
  "humidite_air_min": 30,
  "humidite_air_max": 75,
  "humidite_sol_min": 20,
  "humidite_sol_max": 60,
  "N_min": 10,
  "N_max": 50,
  "P_min": 5,
  "P_max": 25,
  "K_min": 10,
  "K_max": 50,
  "ph_min": 5.5,
  "ph_max": 7.0,
  "difficulte": "easy",
  "periode_plantation": "Début de la saison des pluies",
  "temps_de_pousse": "70 à 100 jours",
  "engrais_recommande": "Fumier sec ou compost au semis",
  "sensibilite": "Sensible aux oiseaux et au vent fort",
  "description": "Céréale traditionnelle très nutritive, utilisée pour la bouillie, les galettes ou la pâte.",
  "conseil": "1) Semez à la volée ou en lignes espacées.\n"
             "2) Éclaircissez les jeunes pousses.\n"
             "3) Binez pour aérer le sol.\n"
             "4) Récoltez quand les épis deviennent bruns.\n"
             "5) Faites sécher les épis à l’ombre pour éviter la moisissure."
},

"corete_potagere": {
  "nom": "Corète potagère",
  "nom_latin": "Corchorus olitorius",
  "famille": "Tiliacées",
  "origine": "Afrique tropicale",
  "milieu_naturel": "Climat tropical humide à subhumide",
  "type_sol": "Sol léger, riche et bien drainé",
  "besoin_en_eau": "Arrosage régulier, sans excès",
  "exposition": "Plein soleil",
  "temperature_air_min": 20,
  "temperature_air_max": 32,
  "humidite_air_min": 50,
  "humidite_air_max": 90,
  "humidite_sol_min": 40,
  "humidite_sol_max": 75,
  "N_min": 20,
  "N_max": 60,
  "P_min": 10,
  "P_max": 30,
  "K_min": 20,
  "K_max": 50,
  "ph_min": 6.0,
  "ph_max": 7.5,
  "difficulte": "easy",
  "periode_plantation": "Début des pluies ou sous irrigation",
  "temps_de_pousse": "40 à 60 jours",
  "engrais_recommande": "Compost ou fumier organique",
  "sensibilite": "Sensible à l’humidité stagnante et aux maladies foliaires",
  "description": "Légume-feuille apprécié pour sa texture gluante, très utilisé dans les sauces locales (lalo).",
  "conseil": "1) Semez directement en lignes espacées.\n"
             "2) Éclaircissez dès la levée.\n"
             "3) Récoltez les jeunes feuilles pour une texture tendre.\n"
             "4) Évitez les arrosages excessifs.\n"
             "5) Associez-la avec le gombo pour optimiser la parcelle."
},

"corète ": {
  "nom": "mauve de jute",
  "nom_latin": "Corchorus olitorius",
  "famille": "Tiliacées",
  "origine": "Afrique tropicale",
  "milieu_naturel": "Climat tropical humide",
  "type_sol": "Sol fertile et drainé",
  "besoin_en_eau": "Arrosage régulier",
  "exposition": "Mi‑ombre à plein soleil",
  "temperature_air_min": 20,
  "temperature_air_max": 35,
  "humidite_air_min": 60,
  "humidite_air_max": 95,
  "humidite_sol_min": 40,
  "humidite_sol_max": 90,
  "N_min": 20,
  "N_max": 60,
  "P_min": 10,
  "P_max": 30,
  "K_min": 10,
  "K_max": 40,
  "ph_min": 6.0,
  "ph_max": 7.5,
  "difficulte": "easy",
  "periode_plantation": "Début des pluies",
  "temps_de_pousse": "50 à 70 jours",
  "engrais_recommande": "Compost léger avant repiquage",
  "sensibilite": "Sensible à la chaleur extrême",
  "description": "Feuilles mucilagineuses utilisées dans les sauces traditionnelles.",
  "conseil": "1) Semis direct ou repiquage en rangs.\n"
             "2) Récolte fréquente avant floraison.\n"
             "3) Arrosage régulier.\n"
             "4) Paillez pour protéger les racines.\n"
             "5) Tournez avec céréale ou légumineuse."
},

"basilic": {
  "nom": "Basilic africain",
  "nom_latin": "Ocimum gratissimum",
  "famille": "Lamiacées",
  "origine": "Afrique de l’Ouest",
  "milieu_naturel": "Climat tropical",
  "type_sol": "Sol léger, bien drainé et fertile",
  "besoin_en_eau": "Arrosage modéré",
  "exposition": "Plein soleil",
  "temperature_air_min": 20,
  "temperature_air_max": 35,
  "humidite_air_min": 50,
  "humidite_air_max": 90,
  "humidite_sol_min": 40,
  "humidite_sol_max": 70,
  "N_min": 20,
  "N_max": 60,
  "P_min": 10,
  "P_max": 30,
  "K_min": 10,
  "K_max": 40,
  "ph_min": 6.0,
  "ph_max": 7.5,
  "difficulte": "easy",
  "periode_plantation": "Début des pluies",
  "temps_de_pousse": "45 à 60 jours",
  "engrais_recommande": "Compost ménager",
  "sensibilite": "Sensible au gel",
  "description": "Plante aromatique utilisée en tisane ou pour parfumer les sauces.",
  "conseil": "1) Taillez régulièrement pour favoriser la ramification.\n"
             "2) Évitez l’excès d’eau.\n"
             "3) Récoltez les feuilles avant floraison.\n"
             "4) Peut être utilisé comme répulsif naturel contre les insectes.\n"
             "5) Associez avec le gombo ou le piment pour enrichir la culture."
},

"aubergine_africaine": {
  "nom": "Aubergine africaine",
  "nom_latin": "Solanum macrocarpon",
  "famille": "Solanacées",
  "origine": "Afrique de l’Ouest",
  "milieu_naturel": "Climat tropical humide",
  "type_sol": "Sol meuble, profond et fertile",
  "besoin_en_eau": "Arrosage modéré et régulier",
  "exposition": "Plein soleil",
  "temperature_air_min": 22,
  "temperature_air_max": 32,
  "humidite_air_min": 50,
  "humidite_air_max": 85,
  "humidite_sol_min": 40,
  "humidite_sol_max": 75,
  "N_min": 30,
  "N_max": 70,
  "P_min": 20,
  "P_max": 40,
  "K_min": 30,
  "K_max": 60,
  "ph_min": 5.8,
  "ph_max": 7.2,
  "difficulte": "easy",
  "periode_plantation": "Fin des pluies",
  "temps_de_pousse": "80 à 100 jours",
  "engrais_recommande": "Compost bien décomposé + fumure organique",
  "sensibilite": "Sensible à la pourriture racinaire",
  "description": "Plante cultivée pour ses feuilles comestibles et ses fruits amers.",
  "conseil": "1) Paillez pour maintenir l'humidité.\n"
             "2) Taillez les feuilles trop denses.\n"
             "3) Récoltez jeunes pour une meilleure tendreté.\n"
             "4) Associez à la tomate pour éloigner les ravageurs.\n"
             "5) Désherbez souvent pour éviter la concurrence."
},

"taro": {
  "nom": "Taro",
  "nom_latin": "Colocasia esculenta",
  "famille": "Aracées",
  "origine": "Asie tropicale, bien acclimaté en Afrique",
  "milieu_naturel": "Climat chaud et humide",
  "type_sol": "Sol argilo-limoneux, humide mais drainé",
  "besoin_en_eau": "Très fort besoin en eau",
  "exposition": "Mi-ombre à soleil filtré",
  "temperature_air_min": 22,
  "temperature_air_max": 35,
  "humidite_air_min": 60,
  "humidite_air_max": 95,
  "humidite_sol_min": 50,
  "humidite_sol_max": 90,
  "N_min": 40,
  "N_max": 90,
  "P_min": 20,
  "P_max": 40,
  "K_min": 40,
  "K_max": 80,
  "ph_min": 5.5,
  "ph_max": 7.0,
  "difficulte": "easy",
  "periode_plantation": "Début des pluies",
  "temps_de_pousse": "6 à 9 mois",
  "engrais_recommande": "Fumier de volaille ou compost",
  "sensibilite": "Sensible au gel et au manque d’eau",
  "description": "Tubercule riche en amidon, utilisé en purée, sauce ou bouillie.",
  "conseil": "1) Plantez dans des cuvettes pour garder l’humidité.\n"
             "2) Évitez les zones avec stagnation d’eau.\n"
             "3) Récoltez quand les feuilles jaunissent.\n"
             "4) Peut être cultivé en rotation avec le riz.\n"
             "5) Tenir les sols bien propres."
}
}

def managePlantsData(request):
    if request.method == 'POST':
        try:
            # données POST (JSON string)
            body_unicode = request.body.decode('utf-8')
            data = json.loads(body_unicode)  # désérialisation
            for key, plant in plantes_info.items():
                plantInfo.objects.create(
                    key=key,
                    nom=str(plant.get("nom", "")),
                    nom_latin=str(plant.get("nom_latin", "")),
                    famille=str(plant.get("famille", "")),
                    origine=str(plant.get("origine", "")),
                    milieu_naturel=str(plant.get("milieu_naturel", "")),
                    type_sol=str(plant.get("type_sol", "")),
                    besoin_en_eau=str(plant.get("besoin_en_eau", "")),
                    exposition=str(plant.get("exposition", "")),
                    temperature_air_min=str(plant.get("temperature_air_min", "")),
                    temperature_air_max=str(plant.get("temperature_air_max", "")),
                    humidite_air_min=str(plant.get("humidite_air_min", "")),
                    humidite_air_max=str(plant.get("humidite_air_max", "")),
                    humidite_sol_min=str(plant.get("humidite_sol_min", "")),
                    humidite_sol_max=str(plant.get("humidite_sol_max", "")),
                    luminosite_min=str(plant.get("luminosite_min", "")),
                    luminosite_max=str(plant.get("luminosite_max", "")),
                    ph_min=str(plant.get("ph_min", "")),
                    ph_max=str(plant.get("ph_max", "")),
                    periode_plantation=str(plant.get("periode_plantation", "")),
                    periode_recolte=str(plant.get("periode_recolte", "")),
                    temps_de_pousse=str(plant.get("temps_de_pousse", "")),
                    engrais_recommande=str(plant.get("engrais_recommande", "")),
                    sensibilite=json.dumps(plant.get("sensibilite", [])),
                    difficulte=str(plant.get("difficulte", "")),
                    image= "image",
                    description=str(plant.get("description", "")),
                )
            return JsonResponse({"status": "success", "message": "Plantes enregistrées avec succès."})
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=400)

    elif request.method == 'GET':
        try:
            plants = plantInfo.objects.all()
            data = {}
            for plant in plants:
                data[plant.key] = {
                    "nom": plant.nom,
                    "nom_latin": plant.nom_latin,
                    "famille": plant.famille,
                    "origine": plant.origine,
                    "milieu_naturel": plant.milieu_naturel,
                    "type_sol": plant.type_sol,
                    "besoin_en_eau": plant.besoin_en_eau,
                    "exposition": plant.exposition,
                    "temperature_air_min": plant.temperature_air_min,
                    "temperature_air_max": plant.temperature_air_max,
                    "humidite_air_min": plant.humidite_air_min,
                    "humidite_air_max": plant.humidite_air_max,
                    "humidite_sol_min": plant.humidite_sol_min,
                    "humidite_sol_max": plant.humidite_sol_max,
                    "luminosite_min": plant.luminosite_min,
                    "luminosite_max": plant.luminosite_max,
                    "ph_min": plant.ph_min,
                    "ph_max": plant.ph_max,
                    "periode_plantation": plant.periode_plantation,
                    "periode_recolte": plant.periode_recolte,
                    "temps_de_pousse": plant.temps_de_pousse,
                    "engrais_recommande": plant.engrais_recommande,
                    "sensibilite": json.loads(plant.sensibilite) if plant.sensibilite and plant.sensibilite.startswith('[') else plant.sensibilite or "",
                    "difficulte": plant.difficulte,
                    "image": plant.image,
                    "description": plant.description,
                }
            return JsonResponse({"data": data})
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=500)

    else:
        return JsonResponse({"status": "error", "message": "Méthode non autorisée"}, status=405)

# Fonction supprimée - les données sont maintenant récupérées depuis le serveur externe
# via la fonction get_sensor_data()

@csrf_exempt
def api_sensors(request):
    """API REST pour les données des capteurs"""
    if request.method == 'GET':
        sensor_data = get_sensor_data()
        return JsonResponse(sensor_data)
    else:
        return JsonResponse({"status": "error", "message": "Méthode non autorisée"}, status=405)

@csrf_exempt
def api_sensors_soil_humidity(request):
    """Retourne l'humidité du sol et son historique"""
    if request.method == 'GET':
        sensor_data = get_sensor_data()
        history = get_resampled_history('soil_humidity')
        
        return JsonResponse({
            "current_value": sensor_data.get('soil_humidity', 0),
            "history": history,
            "last_update": sensor_data.get('last_update', time.time()),
            "status": "success"
        })
    else:
        return JsonResponse({"status": "error", "message": "Méthode non autorisée"}, status=405)
        
@csrf_exempt
def api_sensors_temperature(request):
    """Retourne la température"""
    if request.method == 'GET':
        sensor_data = get_sensor_data()
        return JsonResponse({
            "value": sensor_data["temperature"],
            "unit": "°C",
            "last_update": sensor_data["last_update"],
            "status": "success"
        })
    else:
        return JsonResponse({"status": "error", "message": "Méthode non autorisée"}, status=405)

@csrf_exempt
def api_sensors_npk(request):
    """Retourne les valeurs NPK"""
    if request.method == 'GET':
        sensor_data = get_sensor_data()
        return JsonResponse({
            "value": sensor_data["npk"],
            "unit": "ppm",
            "last_update": sensor_data["last_update"],
            "status": "success"
        })
    else:
        return JsonResponse({"status": "error", "message": "Méthode non autorisée"}, status=405)

@csrf_exempt
def api_sensors_air_humidity(request):
    """Retourne l'humidité de l'air"""
    if request.method == 'GET':
        sensor_data = get_sensor_data()
        return JsonResponse({
            "value": sensor_data["air_humidity"],
            "unit": "%",
            "last_update": sensor_data["last_update"],
            "status": "success"
        })
    else:
        return JsonResponse({"status": "error", "message": "Méthode non autorisée"}, status=405)

@csrf_exempt
def api_sensors_soil_ph(request):
    """Retourne le pH du sol"""
    if request.method == 'GET':
        sensor_data = get_sensor_data()
        return JsonResponse({
            "value": sensor_data["soil_ph"],
            "unit": "pH",
            "last_update": sensor_data["last_update"],
            "status": "success"
        })
    else:
        return JsonResponse({"status": "error", "message": "Méthode non autorisée"}, status=405)

@csrf_exempt
def api_sensor_history(request):
    """Retourne l'historique de tous les capteurs ou d'un capteur spécifique"""
    if request.method == 'GET':
        sensor_type = request.GET.get('type', None)
        limit = int(request.GET.get('limit', 50))
        
        if sensor_type:
            history = get_resampled_history(sensor_type, limit)
            return JsonResponse({
                "status": "success",
                "sensor_type": sensor_type,
                "data": history,
                "count": len(history)
            })
        else:
            # Historique de tous les capteurs
            sensor_types = ['soil_humidity', 'temperature', 'air_humidity', 'soil_ph', 'nitrogen', 'phosphorus', 'potassium']
            all_history = {}
            
            for s_type in sensor_types:
                all_history[s_type] = get_resampled_history(s_type, limit)
            
            return JsonResponse({
                "status": "success",
                "data": all_history,
                "timestamp": time.time()
            })
    else:
        return JsonResponse({"status": "error", "message": "Méthode non autorisée"}, status=405)
@csrf_exempt
def api_data(request):
    if request.method == 'POST':
        try:
            global LAST_POST_TS
            now = time.time()
            if (now - LAST_POST_TS) < RATE_LIMIT_SECONDS:
                return JsonResponse({"status": "ignored", "message": "rate_limited"})
            body = request.body.decode('utf-8')
            data = json.loads(body)
            mappings = [
                ('soil_humidity', 'soil_moisture'),
                ('temperature', 'temperature_air'),
                ('air_humidity', 'humidity_air'),
                ('soil_ph', 'ph'),
            ]
            for dst, src in mappings:
                if src in data and data[src] is not None:
                    SensorDataHistory.objects.create(sensor_type=dst, value=float(data[src]))
            if 'N' in data and data['N'] is not None:
                SensorDataHistory.objects.create(sensor_type='nitrogen', value=float(data['N']))
            if 'P' in data and data['P'] is not None:
                SensorDataHistory.objects.create(sensor_type='phosphorus', value=float(data['P']))
            if 'K' in data and data['K'] is not None:
                SensorDataHistory.objects.create(sensor_type='potassium', value=float(data['K']))
            LAST_POST_TS = now
            return JsonResponse({"status": "success"})
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=400)
    else:
        return JsonResponse({"status": "error", "message": "Méthode non autorisée"}, status=405)

@csrf_exempt
def api_server_status(request):
    """Vérifie le statut de connexion du serveur externe"""
    if request.method == 'GET':
        import requests
        try:
            # Tenter de se connecter au serveur externe
            response = requests.get('http://127.0.0.1:8000/status', timeout=2)
            if response.status_code == 200:
                return JsonResponse({
                    "status": "connected",
                    "server_status": "active",
                    "message": "Serveur de données connecté"
                })
            else:
                return JsonResponse({
                    "status": "disconnected",
                    "server_status": "inactive",
                    "message": "Serveur de données non disponible"
                })
        except (requests.exceptions.RequestException, requests.exceptions.Timeout):
            return JsonResponse({
                "status": "disconnected",
                "server_status": "inactive",
                "message": "Impossible de se connecter au serveur de données"
            })
    else:
        return JsonResponse({"status": "error", "message": "Méthode non autorisée"}, status=405)

@csrf_exempt
def update_username(request):
    """Mettre à jour le nom d'utilisateur"""
    if request.method == 'POST':
        try:
            # Vérifier d'abord la session Django
            user_id = request.session.get('user_id')
            
            # Si pas d'ID dans la session, essayer de récupérer depuis les données POST
            if not user_id:
                data = json.loads(request.body.decode('utf-8'))
                username = data.get('currentUsername', '').strip()
                password = data.get('currentPassword', '').strip()
                
                # Authentifier avec username/password
                if username and password:
                    user = userDonne.objects.filter(fullName=username, mdp=password).first()
                    if user:
                        request.session['user_id'] = user.id
                        user_id = user.id
                    else:
                        return JsonResponse({"status": "error", "message": "Données d'authentification invalides"}, status=401)
                else:
                    return JsonResponse({"status": "error", "message": "Non authentifié"}, status=401)
                
            data = json.loads(request.body.decode('utf-8'))
            new_username = data.get('newUsername', '').strip()
            
            if not new_username:
                return JsonResponse({"status": "error", "message": "Le nom d'utilisateur ne peut pas être vide"}, status=400)
            
            # Vérifier si le nom d'utilisateur existe déjà
            if userDonne.objects.filter(fullName=new_username).exclude(id=user_id).exists():
                return JsonResponse({"status": "error", "message": "Ce nom d'utilisateur est déjà pris"}, status=400)
            
            # Mettre à jour l'utilisateur
            user = userDonne.objects.get(id=user_id)
            user.fullName = new_username
            user.save()
            
            return JsonResponse({"status": "success", "message": "Nom d'utilisateur mis à jour"})
            
        except userDonne.DoesNotExist:
            return JsonResponse({"status": "error", "message": "Utilisateur non trouvé"}, status=404)
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=500)
    else:
        return JsonResponse({"status": "error", "message": "Méthode non autorisée"}, status=405)

@csrf_exempt
def update_password(request):
    """Mettre à jour le mot de passe"""
    if request.method == 'POST':
        try:
            # Vérifier d'abord la session Django
            user_id = request.session.get('user_id')
            
            # Si pas d'ID dans la session, essayer de récupérer depuis les données POST
            if not user_id:
                data = json.loads(request.body.decode('utf-8'))
                username = data.get('currentUsername', '').strip()
                current_password = data.get('currentPassword', '').strip()
                
                # Authentifier avec username/password
                if username and current_password:
                    user = userDonne.objects.filter(fullName=username, mdp=current_password).first()
                    if user:
                        request.session['user_id'] = user.id
                        user_id = user.id
                    else:
                        return JsonResponse({"status": "error", "message": "Données d'authentification invalides"}, status=401)
                else:
                    return JsonResponse({"status": "error", "message": "Non authentifié"}, status=401)
                
            data = json.loads(request.body.decode('utf-8'))
            current_password = data.get('currentPassword', '').strip()
            new_password = data.get('newPassword', '').strip()
            
            if not current_password or not new_password:
                return JsonResponse({"status": "error", "message": "Tous les champs sont requis"}, status=400)
            
            if len(new_password) < 6:
                return JsonResponse({"status": "error", "message": "Le mot de passe doit contenir au moins 6 caractères"}, status=400)
            
            # Vérifier l'utilisateur et le mot de passe actuel
            user = userDonne.objects.get(id=user_id)
            if user.mdp != current_password:
                return JsonResponse({"status": "error", "message": "Mot de passe actuel incorrect"}, status=400)
            
            # Mettre à jour le mot de passe
            user.mdp = new_password
            user.save()
            
            return JsonResponse({"status": "success", "message": "Mot de passe mis à jour"})
            
        except userDonne.DoesNotExist:
            return JsonResponse({"status": "error", "message": "Utilisateur non trouvé"}, status=404)
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=500)
    else:
        return JsonResponse({"status": "error", "message": "Méthode non autorisée"}, status=405)

@csrf_exempt
def delete_account(request):
    """Supprimer le compte utilisateur"""
    if request.method == 'DELETE':
        try:
            user_id = request.session.get('user_id')
            if not user_id:
                return JsonResponse({"status": "error", "message": "Non authentifié"}, status=401)
            
            # Récupérer l'utilisateur
            user = userDonne.objects.get(id=user_id)
            
            # Supprimer toutes les alertes de l'utilisateur
            AlerteModel.objects.filter(proprio=user.fullName).delete()
            
            # Supprimer l'utilisateur
            user.delete()
            
            # Nettoyer la session
            request.session.flush()
            
            return JsonResponse({"status": "success", "message": "Compte supprimé avec succès"})
            
        except userDonne.DoesNotExist:
            return JsonResponse({"status": "error", "message": "Utilisateur non trouvé"}, status=404)
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=500)
    else:
        return JsonResponse({"status": "error", "message": "Méthode non autorisée"}, status=405)

@csrf_exempt
def get_user_settings(request):
    """Récupérer les paramètres de l'utilisateur"""
    if request.method == 'GET':
        try:
            user_id = request.session.get('user_id')
            if not user_id:
                return JsonResponse({"status": "error", "message": "Non authentifié"}, status=401)
            
            user = userDonne.objects.get(id=user_id)
            
            return JsonResponse({
                "status": "success",
                "user": {
                    "id": user.id,
                    "fullName": user.fullName,
                    "mail": user.mail,
                    "informations": user.informations
                }
            })
            
        except userDonne.DoesNotExist:
            return JsonResponse({"status": "error", "message": "Utilisateur non trouvé"}, status=404)
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=500)
    else:
        return JsonResponse({"status": "error", "message": "Méthode non autorisée"}, status=405)
@csrf_exempt
def api_sim_mode(request):
    if request.method == 'GET':
        return JsonResponse({"mode": SIM_MODE})
    if request.method == 'POST':
        try:
            data = json.loads(request.body.decode('utf-8')) if request.body else {}
            mode = data.get('mode') or request.POST.get('mode')
            if mode not in ('dry', 'wet', 'zero'):
                return JsonResponse({"status": "error", "message": "mode invalide"}, status=400)
            globals()['SIM_MODE'] = mode
            return JsonResponse({"status": "success", "mode": SIM_MODE})
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=400)
    return JsonResponse({"status": "error", "message": "Méthode non autorisée"}, status=405)
LAST_POST_TS = 0.0
RATE_LIMIT_SECONDS = 3.0
