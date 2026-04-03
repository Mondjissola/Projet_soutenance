// Exemple d'utilisation du gestionnaire de capteurs

// 1. Accès direct aux données
function displayCurrentData() {
    const data = getSensorData();
    console.log('Données actuelles:', data);
    
    // Ou accéder à des valeurs spécifiques
    console.log('Humidité du sol:', getSoilHumidity() + '%');
    console.log('Température:', getTemperature() + '°C');
    console.log('NPK:', getNPK());
    console.log('Humidité de l\'air:', getAirHumidity() + '%');
    console.log('pH du sol:', getSoilPh());
}

// 2. S'abonner aux changements de données
function setupDataListener() {
    onSensorDataChange((newData) => {
        console.log('Nouvelles données reçues:', newData);
        
        // Mettre à jour l'interface utilisateur
        updateUI(newData);
    });
}

// 3. Exemple de mise à jour de l'interface utilisateur
function updateUI(data) {
    // Mettre à jour les éléments DOM avec les nouvelles données
    const elements = {
        'soil-humidity-display': data.soilHumidity + '%',
        'temperature-display': data.temperature + '°C',
        'air-humidity-display': data.airHumidity + '%',
        'soil-ph-display': data.soilPh,
        'nitrogen-display': data.npk.nitrogen + ' ppm',
        'phosphorus-display': data.npk.phosphorus + ' ppm',
        'potassium-display': data.npk.potassium + ' ppm'
    };
    
    Object.entries(elements).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    });
    
    // Mettre à jour l'horodatage
    const lastUpdateElement = document.getElementById('last-update');
    if (lastUpdateElement && data.lastUpdate) {
        lastUpdateElement.textContent = 'Dernière mise à jour: ' + 
            data.lastUpdate.toLocaleTimeString();
    }
}

// 4. Exemple d'utilisation dans une fonction asynchrone
async function checkSensorStatus() {
    // Attendre que les données soient disponibles
    while (!window.sensorManager.isDataAvailable()) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    const temp = getTemperature();
    const humidity = getSoilHumidity();
    
    if (temp > 30) {
        console.warn('Température élevée détectée:', temp + '°C');
    }
    
    if (humidity < 30) {
        console.warn('Sol sec détecté:', humidity + '%');
    }
}

// Initialisation automatique
document.addEventListener('DOMContentLoaded', () => {
    setupDataListener();
    displayCurrentData();
    checkSensorStatus();
});
