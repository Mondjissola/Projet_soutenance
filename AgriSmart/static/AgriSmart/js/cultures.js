// Gestion du modal
const modal = document.getElementById('cultureModal');
const addCultureBtn = document.querySelector('.add-culture-btn');
var closeModal = document.querySelector('.close-modal');
const cancelBtn = document.querySelector('.cancel-btn');
const cultureForm = document.getElementById('cultureForm');

// Fonction pour obtenir les données actuelles des capteurs pour une zone
function getCurrentSoilData(zoneName) {
    const sensorData = getSensorData();
    if (!sensorData || !sensorData.soilHumidity) {
        // Données par défaut si le capteur n'est pas disponible
        return {
            ph: 6.5,
            humidity: 65,
            nitrogen: 120,
            phosphorus: 45,
            culture: null
        };
    }

    return {
        ph: sensorData.soilPh,
        humidity: sensorData.soilHumidity,
        nitrogen: sensorData.npk.nitrogen,
        phosphorus: sensorData.npk.phosphorus,
        culture: null
    };
}

const cultureCompatibility = {
    tomates: {
        idealConditions: {
            ph: { min: 6.0, max: 6.8 },
            humidity: { min: 60, max: 70 },
            nitrogen: { min: 100, max: 150 },
            phosphorus: { min: 40, max: 60 }
        },
        recommendations: [
            "Maintenir une humidité constante",
            "Tuteurer les plants dès qu'ils atteignent 30cm",
            "Surveiller les signes de mildiou"
        ]
    },
    carottes: {
        idealConditions: {
            ph: { min: 6.0, max: 7.0 },
            humidity: { min: 50, max: 65 },
            nitrogen: { min: 80, max: 120 },
            phosphorus: { min: 45, max: 65 }
        },
        recommendations: [
            "Sol meuble et bien drainé",
            "Éviter l'excès d'azote",
            "Biner régulièrement"
        ]
    },
    laitue: {
        idealConditions: {
            ph: { min: 6.0, max: 7.0 },
            humidity: { min: 60, max: 70 },
            nitrogen: { min: 90, max: 130 },
            phosphorus: { min: 35, max: 55 }
        },
        recommendations: [
            "Arrosage régulier mais léger",
            "Protection contre le soleil direct",
            "Surveillance des limaces"
        ]
    },
    haricots: {
        idealConditions: {
            ph: { min: 6.0, max: 7.5 },
            humidity: { min: 55, max: 65 },
            nitrogen: { min: 70, max: 110 },
            phosphorus: { min: 40, max: 60 }
        },
        recommendations: [
            "Support pour les variétés grimpantes",
            "Éviter l'excès d'eau",
            "Rotation des cultures recommandée"
        ]
    }
};

// Données des cultures
const culturesData = {
    laitue: {
        title: "Laitue",
        ph: "6.0 - 7.0",
        soilHumidity: "60% - 70%",
        airHumidity: "65% - 75%",
        temperature: "15°C - 20°C",
        nitrogen: "120 - 150 mg/kg",
        phosphorus: "45 - 60 mg/kg",
        potassium: "150 - 180 mg/kg"
    },
    tomate: {
        title: "Tomate",
        ph: "6.0 - 6.8",
        soilHumidity: "60% - 80%",
        airHumidity: "65% - 85%",
        temperature: "20°C - 25°C",
        nitrogen: "150 - 180 mg/kg",
        phosphorus: "60 - 80 mg/kg",
        potassium: "180 - 200 mg/kg"
    },
    carotte: {
        title: "Carotte",
        ph: "6.0 - 7.0",
        soilHumidity: "50% - 70%",
        airHumidity: "60% - 70%",
        temperature: "15°C - 20°C",
        nitrogen: "100 - 120 mg/kg",
        phosphorus: "40 - 60 mg/kg",
        potassium: "120 - 150 mg/kg"
    }
};

// Gestion des modaux
const modals = {
    initial: document.getElementById('addCultureModal'),
    existing: document.getElementById('existingCultureModal'),
    new: document.getElementById('newCultureModal'),
    info: document.getElementById('cultureInfoModal')
};

// Fonction pour ouvrir un modal
function openModal(modalId) {
    const modal = modals[modalId];
    if (!modal) return;
    
    modal.style.display = 'block';
    
    // Gestion de la fermeture par clic sur la croix
    const closeBtn = modal.querySelector('.close');
    if (closeBtn) {
        closeBtn.onclick = () => closeModal(modalId);
    }
    
    // Gestion de la fermeture par clic à l'extérieur
    window.onclick = (event) => {
        if (event.target === modal) {
            closeModal(modalId);
        }
    };
}

// Fonction pour fermer un modal
function closeModal(modalId) {
    const modal = modals[modalId];
    if (!modal) return;
    
    modal.style.display = 'none';
    
    // Si c'est le modal initial, réinitialiser son état
    if (modalId === 'initial') {
        resetInitialModal();
    }
}

// Fonction pour réinitialiser le modal initial
function resetInitialModal() {
    const initialModal = modals.initial;
    if (!initialModal) return;

    // Réinitialiser les champs si nécessaire
    const inputs = initialModal.querySelectorAll('input');
    inputs.forEach(input => {
        input.value = '';
    });
}

// Initialisation des événements
document.addEventListener('DOMContentLoaded', () => {
    // Récupération des éléments
    const addCultureModal = document.getElementById('addCultureModal');
    const existingCultureModal = document.getElementById('existingCultureModal');
    const newCultureModal = document.getElementById('newCultureModal');
    const btnYes = document.getElementById('btnYesCulture');
    const btnNo = document.getElementById('btnNoCulture');

    // Gestionnaire pour le bouton "Oui"
    btnYes.addEventListener('click', () => {
        addCultureModal.style.display = 'none';
        existingCultureModal.style.display = 'block';
    });

    // Gestionnaire pour le bouton "Non"
    btnNo.addEventListener('click', () => {
        addCultureModal.style.display = 'none';
        newCultureModal.style.display = 'block';
        try {
            if (typeof displaySuggestedCultures === 'function') {
                const sensorSnapshot = {
                    temperature: parseFloat(document.getElementById('temperature').textContent),
                    soilHumidity: parseFloat(document.getElementById('soil-humidity').textContent),
                    ph: parseFloat(document.getElementById('ph').textContent),
                    npk: {
                        nitrogen: parseFloat(document.getElementById('nitrogen').textContent),
                        phosphorus: parseFloat(document.getElementById('phosphorus').textContent),
                        potassium: parseFloat(document.getElementById('potassium').textContent)
                    }
                };
                displaySuggestedCultures(sensorSnapshot);
            }
        } catch (e) {}
    });

    // Gestion de la fermeture des modaux
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) {
                closeAllModals();
            }
        });
    });

    // Fermeture en cliquant à l'extérieur
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            closeAllModals();
        }
    });

    // Fermeture avec la touche Échap
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAllModals();
        }
    });

    const pressed = new Set();
    document.addEventListener('keydown', async (e) => {
        pressed.add(e.key.toLowerCase());
        if (pressed.has('a') && pressed.has('z') && pressed.has('e') && pressed.has('r')) {
            try {
                const res = await fetch('/api/sim-mode', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mode: 'wet' })
                });
                await res.text();
            } catch (err) {}
        }
        if (pressed.has('q') && pressed.has('s') && pressed.has('d')) {
            try {
                const res = await fetch('/api/sim-mode', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mode: 'zero' })
                });
                await res.text();
            } catch (err) {}
        }
        if (pressed.has('w') && pressed.has('x') && pressed.has('c')) {
            try {
                const res = await fetch('/api/sim-mode', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mode: 'dry' })
                });
                await res.text();
            } catch (err) {}
        }
    });
    document.addEventListener('keyup', (e) => {
        pressed.delete(e.key.toLowerCase());
    });
});

// Fonction pour fermer tous les modaux
function closeAllModals() {
    document.querySelectorAll('.modal').forEach(modal => {
            modal.style.display = 'none';
        });
    resetModalStates();
}

// Fonction pour réinitialiser l'état des modaux
function resetModalStates() {
    document.getElementById('existingCultureName').value = '';
}

// Fonctions pour les modaux spécifiques
function closeExistingCultureModal() {
    document.getElementById('existingCultureModal').style.display = 'none';
    document.getElementById('addCultureModal').style.display = 'block';
}

function closeNewCultureModal() {
    document.getElementById('newCultureModal').style.display = 'none';
    document.getElementById('addCultureModal').style.display = 'block';
}

function validateExistingCulture() {
const cultureName = document.getElementById('existingCultureName').value;
if (!cultureName.trim()) {
showNotification('Veuillez entrer le nom de la culture', 'error');
return;
}

// Obtenir la zone sélectionnée
const zoneSelect = document.querySelector('.zone-select');
    const zone = zoneSelect ? zoneSelect.options[zoneSelect.selectedIndex].text : 'Zone inconnue';

    // Générer une alerte automatique pour la nouvelle plante
    if (typeof window.generatePlantAlert === 'function') {
        window.generatePlantAlert(cultureName, zone);
    }

    showNotification(`La culture "${cultureName}" a été validée avec succès !`, 'success');
    closeAllModals();
}

// Fonction pour planter une culture
function planterCulture(cultureName) {
    const data = culturesData[cultureName];
    if (!data) return;

    // Obtenir la zone sélectionnée
    const zoneSelect = document.querySelector('.zone-select');
    const zone = zoneSelect ? zoneSelect.options[zoneSelect.selectedIndex].text : 'Zone inconnue';

    // Générer une alerte automatique pour la nouvelle plante
    if (typeof window.generatePlantAlert === 'function') {
        window.generatePlantAlert(data.title, zone);
    }

    showNotification(`La culture de ${data.title} a été ajoutée avec succès !`, 'success');
    closeAllModals();
}

// Fonction pour afficher les informations d'une culture (popup)
function showCultureInfo(cultureName) {
    const popup = document.getElementById('cultureInfoModal');
    const data = culturesData[cultureName];

    if (!data) return;

    // Mise à jour des informations
    document.getElementById('modalCultureTitle').textContent = data.title;
    document.getElementById('modalPH').textContent = data.ph;
    document.getElementById('modalSoilHumidity').textContent = data.soilHumidity;
    document.getElementById('modalAirHumidity').textContent = data.airHumidity;
    document.getElementById('modalTemperature').textContent = data.temperature;
    document.getElementById('modalNitrogen').textContent = data.nitrogen;
    document.getElementById('modalPhosphorus').textContent = data.phosphorus;
    document.getElementById('modalPotassium').textContent = data.potassium;

    // Affichage du popup
    popup.classList.add('active');
    setTimeout(() => {
        popup.querySelector('.popup-content').style.transform = 'scale(1)';
        popup.querySelector('.popup-content').style.opacity = '1';
    }, 10);
}

// Fonction pour fermer le popup d'information
function closeCultureInfo() {
    const popup = document.getElementById('cultureInfoModal');
    popup.querySelector('.popup-content').style.transform = 'scale(0.7)';
    popup.querySelector('.popup-content').style.opacity = '0';
    
    setTimeout(() => {
        popup.classList.remove('active');
    }, 300);
}

// Fonction pour afficher les notifications
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
        <span>${message}</span>
    `;

    const container = document.getElementById('notification-container');
    container.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('show');
    }, 100);

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            container.removeChild(notification);
        }, 300);
    }, 3000);
}

// Cache pour les données des plantes
let plantesDataCache = null;

// Fonction pour récupérer les données des plantes depuis la base de données
async function fetchPlantesData() {
    if (plantesDataCache) {
        return plantesDataCache;
    }
    
    try {
        const response = await fetch('/managePlantsData', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        // La réponse de managePlantsData retourne directement {"data": {...}} ou {"status": "error", "message": "..."}
        if (data.status === 'error') {
            throw new Error(data.message || 'Erreur lors de la récupération des données');
        }
        
        if (data.data) {
            plantesDataCache = data.data;
            return plantesDataCache;
        } else {
            throw new Error('Format de données invalide');
        }
    } catch (error) {
        console.error('Erreur lors de la récupération des données des plantes:', error);
        throw error;
    }
}

// Fonction pour parser les valeurs numériques des champs texte
function parseNumericValue(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const parsed = parseFloat(value);
        return isNaN(parsed) ? null : parsed;
    }
    return null;
}

// Animation au défilement
// Fonction pour vérifier les conditions de la culture actuelle
async function checkCurrentCultureConditions() {
    try {
        // Récupérer la zone sélectionnée
        const zoneSelect = document.getElementById('zone');
        if (!zoneSelect || zoneSelect.value === 'vide') {
            showNotification('Aucune zone sélectionnée', 'error');
            return;
        }

        // Récupérer les informations de la plante plantée
        const selectedZone = zoneSelect.value;
        const plantInfo = localStorage.getItem(`agrismart_zone_${selectedZone}`);
        
        if (!plantInfo) {
            showNotification('Aucune culture plantée dans cette zone', 'error');
            return;
        }

        const plant = JSON.parse(plantInfo);
        const plantName = plant.name.toLowerCase();
        
        // Récupérer les données des plantes depuis la base de données
        const plantesData = await fetchPlantesData();
        
        if (!plantesData) {
            showNotification('Impossible de récupérer les données des plantes', 'error');
            return;
        }
        
        // Chercher les informations de la plante dans les données récupérées
        const plantData = Object.values(plantesData).find(p => 
            p.nom && p.nom.toLowerCase() === plantName
        );
        
        if (!plantData) {
            showNotification(`Données non disponibles pour ${plant.name}`, 'warning');
            return;
        }

        // Récupérer les données actuelles des capteurs
        const sensorData = getSensorData();
        if (!sensorData) {
            showNotification('Données des capteurs non disponibles', 'error');
            return;
        }

        // Vérifier chaque paramètre et générer des alertes si nécessaire
        const anomalies = [];
        
        // Vérification du pH
        const phMin = parseNumericValue(plantData.ph_min);
        const phMax = parseNumericValue(plantData.ph_max);
        if (phMin !== null && phMax !== null && sensorData.soilPh !== undefined) {
            if (sensorData.soilPh < phMin) {
                anomalies.push({
                    type: 'pH du sol trop bas',
                    current: sensorData.soilPh.toFixed(1),
                    expected: `${phMin} - ${phMax}`,
                    severity: 4
                });
            } else if (sensorData.soilPh > phMax) {
                anomalies.push({
                    type: 'pH du sol trop élevé',
                    current: sensorData.soilPh.toFixed(1),
                    expected: `${phMin} - ${phMax}`,
                    severity: 4
                });
            }
        }
        
        // Vérification de l'humidité du sol
        const humiditeMin = parseNumericValue(plantData.humidite_sol_min);
        const humiditeMax = parseNumericValue(plantData.humidite_sol_max);
        if (humiditeMin !== null && humiditeMax !== null && sensorData.soilHumidity !== undefined) {
            if (sensorData.soilHumidity < humiditeMin) {
                anomalies.push({
                    type: 'Humidité du sol insuffisante',
                    current: `${sensorData.soilHumidity.toFixed(1)}%`,
                    expected: `${humiditeMin}% - ${humiditeMax}%`,
                    severity: 4
                });
            } else if (sensorData.soilHumidity > humiditeMax) {
                anomalies.push({
                    type: 'Humidité du sol excessive',
                    current: `${sensorData.soilHumidity.toFixed(1)}%`,
                    expected: `${humiditeMin}% - ${humiditeMax}%`,
                    severity: 4
                });
            }
        }
        
        // Vérification de l'azote (N)
        const nMin = parseNumericValue(plantData.N_min);
        const nMax = parseNumericValue(plantData.N_max);
        if (nMin !== null && nMax !== null && sensorData.npk && sensorData.npk.nitrogen !== undefined) {
            if (sensorData.npk.nitrogen < nMin) {
                anomalies.push({
                    type: 'Niveau d\'azote insuffisant',
                    current: `${sensorData.npk.nitrogen.toFixed(1)} mg/kg`,
                    expected: `${nMin} - ${nMax} mg/kg`,
                    severity: 4
                });
            } else if (sensorData.npk.nitrogen > nMax) {
                anomalies.push({
                    type: 'Niveau d\'azote excessif',
                    current: `${sensorData.npk.nitrogen.toFixed(1)} mg/kg`,
                    expected: `${nMin} - ${nMax} mg/kg`,
                    severity: 4
                });
            }
        }
        
        // Vérification du phosphore (P)
        const pMin = parseNumericValue(plantData.P_min);
        const pMax = parseNumericValue(plantData.P_max);
        if (pMin !== null && pMax !== null && sensorData.npk && sensorData.npk.phosphorus !== undefined) {
            if (sensorData.npk.phosphorus < pMin) {
                anomalies.push({
                    type: 'Niveau de phosphore insuffisant',
                    current: `${sensorData.npk.phosphorus.toFixed(1)} mg/kg`,
                    expected: `${pMin} - ${pMax} mg/kg`,
                    severity: 4
                });
            } else if (sensorData.npk.phosphorus > pMax) {
                anomalies.push({
                    type: 'Niveau de phosphore excessif',
                    current: `${sensorData.npk.phosphorus.toFixed(1)} mg/kg`,
                    expected: `${pMin} - ${pMax} mg/kg`,
                    severity: 4
                });
            }
        }
        
        // Vérification du potassium (K)
        const kMin = parseNumericValue(plantData.K_min);
        const kMax = parseNumericValue(plantData.K_max);
        if (kMin !== null && kMax !== null && sensorData.npk && sensorData.npk.potassium !== undefined) {
            if (sensorData.npk.potassium < kMin) {
                anomalies.push({
                    type: 'Niveau de potassium insuffisant',
                    current: `${sensorData.npk.potassium.toFixed(1)} mg/kg`,
                    expected: `${kMin} - ${kMax} mg/kg`,
                    severity: 4
                });
            } else if (sensorData.npk.potassium > kMax) {
                anomalies.push({
                    type: 'Niveau de potassium excessif',
                    current: `${sensorData.npk.potassium.toFixed(1)} mg/kg`,
                    expected: `${kMin} - ${kMax} mg/kg`,
                    severity: 4
                });
            }
        }

        // Générer les alertes pour chaque anomalie détectée
        if (anomalies.length > 0) {
            anomalies.forEach(anomaly => {
                const alertTitle = `Anomalie détectée: ${anomaly.type}`;
                const alertDescription = `Valeur actuelle: ${anomaly.current}. Plage optimale pour ${plantData.nom}: ${anomaly.expected}`;
                
                // Utiliser la fonction globale createCriticalAlert pour générer une alerte de gravité 4
                 if (typeof window.createCriticalAlert === 'function') {
                     window.createCriticalAlert(
                         alertTitle,
                         alertDescription,
                         selectedZone
                     );
                 } else {
                     console.log(`ALERTE CRITIQUE: ${alertTitle} - ${alertDescription}`);
                 }
            });
            
            showNotification(`${anomalies.length} anomalie(s) détectée(s) pour ${plantData.nom}. Consultez les alertes.`, 'warning');
        } else {
            // Créer une alerte informative de vérification réussie
            const alertTitle = `Vérification des conditions - ${plantData.nom}`;
            const alertDescription = `Toutes les conditions sont optimales pour ${plantData.nom} dans ${selectedZone}. pH: ${sensorData.soilPh?.toFixed(1) || 'N/A'}, Humidité sol: ${sensorData.soilHumidity?.toFixed(1) || 'N/A'}%, NPK: N=${sensorData.npk?.nitrogen?.toFixed(1) || 'N/A'} P=${sensorData.npk?.phosphorus?.toFixed(1) || 'N/A'} K=${sensorData.npk?.potassium?.toFixed(1) || 'N/A'} mg/kg`;
            
            // Créer une alerte informative (gravité 1)
             if (typeof window.createInfoAlert === 'function') {
                 window.createInfoAlert(
                     alertTitle,
                     alertDescription,
                     selectedZone
                 );
             } else {
                 console.log(`INFO: ${alertTitle} - ${alertDescription}`);
             }
            
            showNotification(`Vérification de ${plantData.nom} effectuée sans complications.`, 'success');
        }
    } catch (error) {
        console.error('Erreur lors de la vérification des conditions des cultures:', error);
        
        // Créer une alerte d'erreur
         if (typeof window.createWarningAlert === 'function') {
             window.createWarningAlert(
                 'Erreur de vérification',
                 'Impossible de vérifier les conditions des cultures. Vérifiez la connexion aux capteurs.'
             );
         } else {
             console.log('ERREUR: Impossible de vérifier les conditions des cultures');
         }
        
        showNotification('Erreur lors de la vérification des conditions', 'error');
    }
}

// Fonction utilitaire pour parser les chaînes de plage (ex: "6.0 - 7.0")
function parseRangeString(rangeStr) {
    if (!rangeStr || typeof rangeStr !== 'string') return null;
    
    const match = rangeStr.match(/([\d.]+)\s*-\s*([\d.]+)/);
    if (match) {
        return {
            min: parseFloat(match[1]),
            max: parseFloat(match[2])
        };
    }
    return null;
}

document.addEventListener('DOMContentLoaded', () => {
    const cards = document.querySelectorAll('.culture-card');
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, {
        threshold: 0.1
    });

    cards.forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        observer.observe(card);
    });
    
    // Ajouter l'événement pour le bouton "Vérifier les conditions"
    const checkConditionsBtn = document.getElementById('checkConditionsBtn');
    if (checkConditionsBtn) {
        checkConditionsBtn.addEventListener('click', checkCurrentCultureConditions);
    }

    // Contrôles AZ, QS, WX activés uniquement sur la page cultures
    const comboWindowMs = 200;
    const lastKeys = {};
    function recordKey(k) {
        lastKeys[k] = Date.now();
    }
    function isCombo(a, b) {
        const ta = lastKeys[a];
        const tb = lastKeys[b];
        if (!ta || !tb) return false;
        return Math.abs(ta - tb) <= comboWindowMs;
    }
    async function postMode(mode) {
        try {
            const base = (window.AgriSmartConfig && window.AgriSmartConfig.SERVER_URL) || '';
            const url = base + '/api/sim-mode';
            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode })
            });
            return await resp.json();
        } catch (e) { return null; }
    }
    async function getMode() {
        try {
            const base = (window.AgriSmartConfig && window.AgriSmartConfig.SERVER_URL) || '';
            const url = base + '/api/sim-mode';
            const resp = await fetch(url);
            return await resp.json();
        } catch (e) { return null; }
    }
    document.addEventListener('keydown', async (e) => {
        const k = (e.key || '').toUpperCase();
        if (!k) return;
        if (!['A','Z','Q','S','W','X'].includes(k)) return;
        recordKey(k);
        if (isCombo('A','Z')) {
            await postMode('wet');
            return;
        }
        if (isCombo('Q','S')) {
            await postMode('zero');
            return;
        }
        if (isCombo('W','X')) {
            await postMode('dry');
        }
    });
});
