// Gestionnaire global des données de capteurs
class SensorManager {
    constructor() {
        // Attendre que la configuration soit disponible
        this.waitForConfig().then(() => {
            this.initializeWithConfig();
        });
    }
    
    async waitForConfig() {
        while (!window.AgriSmartConfig) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    initializeWithConfig() {
        const config = window.AgriSmartConfig;
        
        this.data = {
            soilHumidity: null,
            temperature: null,
            npk: { nitrogen: null, phosphorus: null, potassium: null },
            airHumidity: null,
            soilPh: null,
            lastUpdate: null
        };
        
        this.listeners = [];
        this.updateInterval = null;
        this.connectionCheckInterval = null;
        this.apiUrl = '/api/sensors'; // Utilise l'endpoint Django au lieu du serveur externe
        this.isServerOnline = false;
        this.connectionAttempts = 0;
        this.maxConnectionAttempts = config.CONNECTION.MAX_FAILED_ATTEMPTS;
        this.consecutiveFailures = 0;
        this.maxFailuresBeforeDisconnect = config.CONNECTION.MAX_FAILED_ATTEMPTS;
        this.fetchInterval = 3000;
        this.timeout = config.CONNECTION.TIMEOUT;
        this.lastFetchTs = 0;
        
        this.startAutoUpdate();
        this.startConnectionMonitoring();
    }
    
    // Démarre la mise à jour automatique
    startAutoUpdate() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        this.fetchInterval = 3000;
        this.fetchData(); // Première récupération
        this.updateInterval = setInterval(() => {
            this.fetchData();
        }, this.fetchInterval);
    }
    
    // Démarre la surveillance de la connexion (intégrée dans fetchData)
    startConnectionMonitoring() {
        // La surveillance est maintenant intégrée dans fetchData pour éviter les conflits
        console.log('🔄 Surveillance de connexion intégrée dans fetchData');
    }
    
    // Arrête la mise à jour automatique
    stopAutoUpdate() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        // Plus besoin de connectionCheckInterval car intégré dans fetchData
    }
    
    // Vérifie si le serveur Python est en ligne
    // Méthode checkServerStatus supprimée - logique intégrée dans fetchData
    
    // Fonction showConnectionStatus supprimée - indicateur de connexion retiré
    
    // Récupère les données depuis l'API Python
    async fetchData() {
        try {
            const now = Date.now();
            if (this.lastFetchTs && (now - this.lastFetchTs) < (this.fetchInterval - 50)) {
                return;
            }
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeout);
            
            const response = await fetch(this.apiUrl, {
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const newData = await response.json();
            
            // Marquer le serveur comme en ligne et réinitialiser les compteurs à chaque succès
            if (!this.isServerOnline) {
                this.isServerOnline = true;
                console.log('🟢 Serveur de capteurs reconnecté');
            }
            
            // Réinitialiser les compteurs à chaque succès pour éviter les fausses déconnexions
            this.connectionAttempts = 0;
            this.consecutiveFailures = 0;
            
            // Met à jour les données
            this.data = {
                soilHumidity: newData.soil_humidity,
                temperature: newData.temperature,
                npk: {
                    nitrogen: newData.npk.nitrogen,
                    phosphorus: newData.npk.phosphorus,
                    potassium: newData.npk.potassium
                },
                airHumidity: newData.air_humidity,
                soilPh: newData.soil_ph,
                lastUpdate: new Date(newData.last_update * 1000)
            };
            
            // Mettre à jour les données globales
            window.updateGlobalSensorData(this.data, this.isServerOnline);
            
            this.lastFetchTs = Date.now();
            // Notifie tous les listeners
            this.notifyListeners();
            
            // Afficher les données dans la console (optionnel)
            console.log('📊 Données capteurs mises à jour:', {
                'Humidité sol': this.data.soilHumidity + '%',
                'Température': this.data.temperature + '°C',
                'NPK': `N:${this.data.npk.nitrogen} P:${this.data.npk.phosphorus} K:${this.data.npk.potassium}`,
                'Humidité air': this.data.airHumidity + '%',
                'pH': this.data.soilPh
            });
            
        } catch (error) {
            this.consecutiveFailures++;
            this.connectionAttempts++;
            
            // Ne marquer comme déconnecté qu'après 3 échecs consécutifs
            if (this.consecutiveFailures >= this.maxFailuresBeforeDisconnect) {
                if (this.isServerOnline) {
                    this.isServerOnline = false;
                    // Mettre à jour les données globales avec le statut déconnecté
                    window.updateGlobalSensorData(this.data, false);
                    console.log(`🔴 Serveur de capteurs déconnecté après ${this.consecutiveFailures} tentatives`);
                } else {
                    // Même si pas encore marqué comme en ligne, marquer comme déconnecté après 3 échecs
                    this.isServerOnline = false;
                    // Mettre à jour les données globales avec le statut déconnecté
                    window.updateGlobalSensorData(this.data, false);
                    console.log(`🔴 Serveur de capteurs inaccessible après ${this.consecutiveFailures} tentatives`);
                }
            } else {
                console.log(`⚠️ Tentative ${this.consecutiveFailures}/${this.maxFailuresBeforeDisconnect} - Erreur temporaire de récupération des données`);
            }
            
            if (this.connectionAttempts === 4) {
                console.error('❌ Serveur de capteurs non accessible. Vérifiez que sensor_api.py est démarré sur le port 8000');
            }
        }
    }
    
    // Ajoute un listener pour les changements de données
    addListener(callback) {
        this.listeners.push(callback);
    }
    
    // Supprime un listener
    removeListener(callback) {
        this.listeners = this.listeners.filter(l => l !== callback);
    }
    
    // Notifie tous les listeners des changements
    notifyListeners() {
        this.listeners.forEach(callback => {
            try {
                callback(this.data);
            } catch (error) {
                console.error('Erreur dans un listener de capteur:', error);
            }
        });
    }
    
    // Getters pour accéder facilement aux données
    getSoilHumidity() {
        return this.data.soilHumidity;
    }
    
    getTemperature() {
        return this.data.temperature;
    }
    
    getNPK() {
        return this.data.npk;
    }
    
    getAirHumidity() {
        return this.data.airHumidity;
    }
    
    getSoilPh() {
        return this.data.soilPh;
    }
    
    getAllData() {
        return { ...this.data };
    }
    
    getLastUpdate() {
        return this.data.lastUpdate;
    }
    
    // Méthode pour vérifier si les données sont disponibles
    isDataAvailable() {
        return this.data.soilHumidity !== null && 
               this.data.temperature !== null &&
               this.data.npk.nitrogen !== null;
    }
    
    // Méthode pour vérifier si le serveur est en ligne
    getServerOnlineStatus() {
        return this.isServerOnline;
    }
    
    // Récupère l'historique des données depuis la base Django
    async getHistoryData(sensorType = null, limit = 50) {
        try {
            const url = sensorType 
                ? `/api/sensor-history?type=${sensorType}&limit=${limit}`
                : `/api/sensor-history?limit=${limit}`;
            
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (result.status === 'success') {
                return result.data;
            } else {
                throw new Error(result.message || 'Erreur lors de la récupération de l\'historique');
            }
        } catch (error) {
            console.error('Erreur lors de la récupération de l\'historique:', error);
            return null;
        }
    }
    
    // Parse les données d'historique pour les graphiques
    parseHistoryForChart(historyData, timeFormat = 'hour') {
        if (!historyData || !Array.isArray(historyData)) {
            return [];
        }
        
        return historyData.map(point => {
            const date = new Date(point.timestamp * 1000);
            
            return {
                x: date,  // Utiliser l'objet Date directement pour Chart.js
                y: point.value,
                timestamp: point.timestamp
            };
        });
    }
    
    // Fonction getConnectionStatus supprimée - statut de connexion retiré
}

// Instance globale - accessible partout dans l'application
window.sensorManager = new SensorManager();

// Variables globales pour les données des capteurs (accessibles partout)
window.globalSensorData = {
    soilHumidity: null,
    temperature: null,
    npk: { nitrogen: null, phosphorus: null, potassium: null },
    airHumidity: null,
    soilPh: null,
    lastUpdate: null,
    isConnected: false
};

// Fonction pour mettre à jour les données globales
window.updateGlobalSensorData = (data, isConnected) => {
    window.globalSensorData = {
        ...data,
        isConnected: isConnected
    };
    // Déclencher un événement personnalisé pour notifier les changements
    window.dispatchEvent(new CustomEvent('globalSensorDataUpdated', {
        detail: window.globalSensorData
    }));
};

// Fonctions utilitaires globales pour un accès facile
window.getSensorData = () => window.sensorManager.getAllData();
window.getSoilHumidity = () => window.sensorManager.getSoilHumidity();
window.getTemperature = () => window.sensorManager.getTemperature();
window.getNPK = () => window.sensorManager.getNPK();
window.getAirHumidity = () => window.sensorManager.getAirHumidity();
window.getSoilPh = () => window.sensorManager.getSoilPh();

// Fonction pour s'abonner aux changements de données
window.onSensorDataChange = (callback) => {
    window.sensorManager.addListener(callback);
};

// Fonction pour se désabonner des changements
window.offSensorDataChange = (callback) => {
    window.sensorManager.removeListener(callback);
};

// Fonction getSensorConnectionStatus supprimée - statut de connexion retiré

// Fonction pour vérifier si le serveur est en ligne
window.isSensorServerOnline = () => {
    return window.sensorManager.getServerOnlineStatus();
};

console.log('🌱 Gestionnaire de capteurs AgriSmart initialisé');
console.log('🔄 Surveillance automatique du serveur Python activée (toutes les 3s)');
console.log('📈 Mise à jour des données activée (toutes les 3s)');
