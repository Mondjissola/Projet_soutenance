#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Serveur de données externe pour AgriSmart
Fournit les données des capteurs en temps réel via une API REST
"""
#--------------------------

import json
import time
import random
import threading
import os
from datetime import datetime
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Permet les requêtes cross-origin depuis Django

# Données simulées des capteurs avec historique
sensor_data = {
    "soil_humidity": 65.5,
    "temperature": 23.2,
    "npk": {
        "nitrogen": 120,
        "phosphorus": 45,
        "potassium": 85
    },
    "air_humidity": 55.8,
    "soil_ph": 6.8,
    "last_update": time.time(),
    "status": "active"
}

# Historique des données pour les graphiques
data_history = {
    "soil_humidity": [],
    "temperature": [],
    "air_humidity": [],
    "soil_ph": [],
    "nitrogen": [],
    "phosphorus": [],
    "potassium": []
}

# Configuration du serveur
SERVER_CONFIG = {
    "update_interval": 3,  # Intervalle par défaut (secondes)
    "max_history_points": 25,  # Garder 100 points d'historique maximum
    "simulation_enabled": True
}

# Override de configuration via variables d'environnement (pour déploiement/script)
try:
    env_interval = os.environ.get("DATA_UPDATE_INTERVAL")
    if env_interval:
        # Sécuriser une valeur minimale de 5s
        SERVER_CONFIG["update_interval"] = max(5, int(env_interval))
except Exception:
    # Ignorer silencieusement toute erreur de parsing
    pass

def simulate_realistic_sensor_data():
    """
    Simule des données de capteurs plus réalistes avec des variations graduelles
    """
    global sensor_data
    
    # Variations graduelles plutôt que complètement aléatoires
    current_time = time.time()
    
    # Humidité du sol (40-80%) - variation lente
    sensor_data["soil_humidity"] += random.uniform(-2, 2)
    sensor_data["soil_humidity"] = max(40, min(80, sensor_data["soil_humidity"]))
    sensor_data["soil_humidity"] = round(sensor_data["soil_humidity"], 1)
    
    # Température (18-35°C) - variation selon l'heure
    hour = datetime.now().hour
    if 6 <= hour <= 18:  # Jour
        temp_base = 25 + (hour - 12) * 0.8
    else:  # Nuit
        temp_base = 20
    
    sensor_data["temperature"] = temp_base + random.uniform(-3, 3)
    sensor_data["temperature"] = max(18, min(35, sensor_data["temperature"]))
    sensor_data["temperature"] = round(sensor_data["temperature"], 1)
    
    # NPK - variations lentes
    sensor_data["npk"]["nitrogen"] += random.randint(-5, 5)
    sensor_data["npk"]["nitrogen"] = max(80, min(150, sensor_data["npk"]["nitrogen"]))
    
    sensor_data["npk"]["phosphorus"] += random.randint(-2, 2)
    sensor_data["npk"]["phosphorus"] = max(30, min(60, sensor_data["npk"]["phosphorus"]))
    
    sensor_data["npk"]["potassium"] += random.randint(-3, 3)
    sensor_data["npk"]["potassium"] = max(60, min(100, sensor_data["npk"]["potassium"]))
    
    # Humidité de l'air (30-70%)
    sensor_data["air_humidity"] += random.uniform(-1.5, 1.5)
    sensor_data["air_humidity"] = max(30, min(70, sensor_data["air_humidity"]))
    sensor_data["air_humidity"] = round(sensor_data["air_humidity"], 1)
    
    # pH du sol (5.5-8.0) - très stable
    sensor_data["soil_ph"] += random.uniform(-0.1, 0.1)
    sensor_data["soil_ph"] = max(5.5, min(8.0, sensor_data["soil_ph"]))
    sensor_data["soil_ph"] = round(sensor_data["soil_ph"], 1)
    
    sensor_data["last_update"] = current_time

def update_data_history():
    """
    Met à jour l'historique des données pour les graphiques
    """
    global data_history
    
    timestamp = time.time()
    
    # Ajouter les nouvelles données à l'historique
    data_history["soil_humidity"].append({
        "timestamp": timestamp,
        "value": sensor_data["soil_humidity"]
    })
    
    data_history["temperature"].append({
        "timestamp": timestamp,
        "value": sensor_data["temperature"]
    })
    
    data_history["air_humidity"].append({
        "timestamp": timestamp,
        "value": sensor_data["air_humidity"]
    })
    
    data_history["soil_ph"].append({
        "timestamp": timestamp,
        "value": sensor_data["soil_ph"]
    })
    
    data_history["nitrogen"].append({
        "timestamp": timestamp,
        "value": sensor_data["npk"]["nitrogen"]
    })
    
    data_history["phosphorus"].append({
        "timestamp": timestamp,
        "value": sensor_data["npk"]["phosphorus"]
    })
    
    data_history["potassium"].append({
        "timestamp": timestamp,
        "value": sensor_data["npk"]["potassium"]
    })
    
    # Limiter la taille de l'historique
    max_points = SERVER_CONFIG["max_history_points"]
    for key in data_history:
        if len(data_history[key]) > max_points:
            data_history[key] = data_history[key][-max_points:]

def background_data_update():
    """
    Fonction qui s'exécute en arrière-plan pour mettre à jour les données
    """
    while SERVER_CONFIG["simulation_enabled"]:
        simulate_realistic_sensor_data()
        update_data_history()
        time.sleep(SERVER_CONFIG["update_interval"])

# Routes API

@app.route('/api/sensors', methods=['GET'])
def get_all_sensors():
    """
    Retourne toutes les données des capteurs
    """
    return jsonify({
        "status": "success",
        "data": sensor_data,
        "timestamp": time.time()
    })

@app.route('/api/sensors/soil_humidity', methods=['GET'])
def get_soil_humidity():
    """
    Retourne l'humidité du sol
    """
    return jsonify({
        "status": "success",
        "value": sensor_data["soil_humidity"],
        "unit": "%",
        "last_update": sensor_data["last_update"]
    })

@app.route('/api/sensors/temperature', methods=['GET'])
def get_temperature():
    """
    Retourne la température
    """
    return jsonify({
        "status": "success",
        "value": sensor_data["temperature"],
        "unit": "°C",
        "last_update": sensor_data["last_update"]
    })

@app.route('/api/sensors/npk', methods=['GET'])
def get_npk():
    """
    Retourne les valeurs NPK
    """
    return jsonify({
        "status": "success",
        "value": sensor_data["npk"],
        "unit": "ppm",
        "last_update": sensor_data["last_update"]
    })

@app.route('/api/sensors/air_humidity', methods=['GET'])
def get_air_humidity():
    """
    Retourne l'humidité de l'air
    """
    return jsonify({
        "status": "success",
        "value": sensor_data["air_humidity"],
        "unit": "%",
        "last_update": sensor_data["last_update"]
    })

@app.route('/api/sensors/soil_ph', methods=['GET'])
def get_soil_ph():
    """
    Retourne le pH du sol
    """
    return jsonify({
        "status": "success",
        "value": sensor_data["soil_ph"],
        "unit": "pH",
        "last_update": sensor_data["last_update"]
    })

@app.route('/api/history/<sensor_type>', methods=['GET'])
def get_sensor_history(sensor_type):
    """
    Retourne l'historique d'un capteur spécifique
    """
    if sensor_type not in data_history:
        return jsonify({
            "status": "error",
            "message": f"Capteur '{sensor_type}' non trouvé"
        }), 404
    
    # Paramètres optionnels
    limit = request.args.get('limit', type=int, default=50)
    
    history = data_history[sensor_type][-limit:] if limit else data_history[sensor_type]
    
    return jsonify({
        "status": "success",
        "sensor_type": sensor_type,
        "data": history,
        "count": len(history)
    })

@app.route('/api/history', methods=['GET'])
def get_all_history():
    """
    Retourne l'historique de tous les capteurs
    """
    limit = request.args.get('limit', type=int, default=50)
    
    result = {}
    for sensor_type, history in data_history.items():
        result[sensor_type] = history[-limit:] if limit else history
    
    return jsonify({
        "status": "success",
        "data": result,
        "timestamp": time.time()
    })

@app.route('/api/status', methods=['GET'])
def get_server_status():
    """
    Retourne le statut du serveur
    """
    return jsonify({
        "status": "success",
        "server_status": "running",
        "simulation_enabled": SERVER_CONFIG["simulation_enabled"],
        "update_interval": SERVER_CONFIG["update_interval"],
        "last_update": sensor_data["last_update"],
        "data_points": {key: len(history) for key, history in data_history.items()}
    })

@app.route('/api/config', methods=['GET', 'POST'])
def manage_config():
    """
    Gère la configuration du serveur
    """
    if request.method == 'GET':
        return jsonify({
            "status": "success",
            "config": SERVER_CONFIG
        })
    
    elif request.method == 'POST':
        try:
            new_config = request.get_json()
            
            if 'update_interval' in new_config:
                SERVER_CONFIG['update_interval'] = max(5, int(new_config['update_interval']))
            
            if 'max_history_points' in new_config:
                SERVER_CONFIG['max_history_points'] = max(10, int(new_config['max_history_points']))
            
            if 'simulation_enabled' in new_config:
                SERVER_CONFIG['simulation_enabled'] = bool(new_config['simulation_enabled'])
            
            return jsonify({
                "status": "success",
                "message": "Configuration mise à jour",
                "config": SERVER_CONFIG
            })
        
        except Exception as e:
            return jsonify({
                "status": "error",
                "message": f"Erreur lors de la mise à jour: {str(e)}"
            }), 400

if __name__ == '__main__':
    print("🌱 Démarrage du serveur de données AgriSmart...")
    print(f"📊 Intervalle de mise à jour: {SERVER_CONFIG['update_interval']} secondes")
    print(f"📈 Points d'historique maximum: {SERVER_CONFIG['max_history_points']}")
    
    # Démarrer le thread de mise à jour des données en arrière-plan
    data_thread = threading.Thread(target=background_data_update, daemon=True)
    data_thread.start()
    print("🔄 Thread de mise à jour des données démarré")
    
    # Démarrer le serveur Flask
    print("🚀 Serveur disponible sur http://localhost:5000")
    print("📡 API endpoints:")
    print("   - GET /api/sensors - Toutes les données")
    print("   - GET /api/sensors/{type} - Données spécifiques")
    print("   - GET /api/history/{type} - Historique d'un capteur")
    print("   - GET /api/status - Statut du serveur")
    
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)