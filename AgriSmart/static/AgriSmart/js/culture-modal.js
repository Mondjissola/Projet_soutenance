// Base de données des cultures (à remplacer par une vraie base de données)
const culturesDatabase = {
    'tomates': {
        conditions: {
            temperature: { min: 20, max: 25 },
            soilHumidity: { min: 60, max: 70 },
            ph: { min: 6.0, max: 6.8 },
            npk: {
                nitrogen: { min: 100, max: 140 },
                phosphorus: { min: 40, max: 60 },
                potassium: { min: 70, max: 90 }
            }
        },
        conseils: [
            "Arroser régulièrement mais éviter l'excès d'eau",
            "Tuteurer les plants dès qu'ils atteignent 30cm",
            "Supprimer les gourmands pour favoriser la croissance"
        ]
    },
    'laitue': {
        conditions: {
            temperature: { min: 15, max: 22 },
            soilHumidity: { min: 50, max: 65 },
            ph: { min: 6.0, max: 7.0 },
            npk: {
                nitrogen: { min: 80, max: 120 },
                phosphorus: { min: 30, max: 50 },
                potassium: { min: 60, max: 80 }
            }
        },
        conseils: [
            "Maintenir le sol frais et humide",
            "Protéger des fortes chaleurs",
            "Espacer les plants de 25-30cm"
        ]
    },
    'carottes': {
        conditions: {
            temperature: { min: 16, max: 20 },
            soilHumidity: { min: 55, max: 65 },
            ph: { min: 6.0, max: 7.0 },
            npk: {
                nitrogen: { min: 70, max: 100 },
                phosphorus: { min: 35, max: 55 },
                potassium: { min: 65, max: 85 }
            }
        },
        conseils: [
            "Sol meuble et profond nécessaire",
            "Éviter les sols pierreux",
            "Éclaircir les plants pour favoriser le développement"
        ]
    }
};

// Configuration des cultures
const cultureConfig = {
    laitue: {
        name: "Laitue",
        ph: "6.0 - 6.8",
        soilHumidity: "60-70%",
        airHumidity: "60-70%",
        temperature: "15-20°C",
        description: "Légume-feuille idéal pour les cultures en serre",
        npk: {
            nitrogen: "100-120 mg/kg",
            phosphorus: "45-55 mg/kg",
            potassium: "80-100 mg/kg"
        }
    },
    tomate: {
        name: "Tomate",
        ph: "5.5 - 6.8",
        soilHumidity: "60-80%",
        airHumidity: "65-75%",
        temperature: "20-25°C",
        description: "Fruit-légume polyvalent, riche en nutriments",
        npk: {
            nitrogen: "150-200 mg/kg",
            phosphorus: "60-80 mg/kg",
            potassium: "150-200 mg/kg"
        }
    },
    carotte: {
        name: "Carotte",
        ph: "6.0 - 6.8",
        soilHumidity: "50-70%",
        airHumidity: "60-70%",
        temperature: "15-20°C",
        description: "Légume-racine rustique adapté aux sols légers",
        npk: {
            nitrogen: "80-100 mg/kg",
            phosphorus: "50-70 mg/kg",
            potassium: "100-150 mg/kg"
        }
    }
};

// Fonction pour obtenir les données actuelles des capteurs
function getCurrentSensorData() {
    return {
        temperature: parseFloat(document.getElementById('temperature').textContent),
        soilHumidity: parseFloat(document.getElementById('soil-humidity').textContent),
        ph: parseFloat(document.getElementById('ph').textContent),
        npk: {
            nitrogen: parseFloat(document.getElementById('nitrogen').textContent),
            phosphorus: parseFloat(document.getElementById('phosphorus').textContent),
            potassium: parseFloat(document.getElementById('potassium').textContent)
        }
    };
}

// Fonction pour calculer la compatibilité d'une culture
function calculateCompatibility(cultureName, sensorData) {
    const culture = culturesDatabase[cultureName.toLowerCase()];
    if (!culture) return null;

    const scores = {
        temperature: 0,
        soilHumidity: 0,
        ph: 0,
        npk: 0
    };

    // Calcul du score pour chaque paramètre
    const calculateParameterScore = (value, min, max) => {
        if (value < min) return 1 - (min - value) / min;
        if (value > max) return 1 - (value - max) / max;
        return 1;
    };

    // Température
    scores.temperature = calculateParameterScore(
        sensorData.temperature,
        culture.conditions.temperature.min,
        culture.conditions.temperature.max
    );

    // Humidité du sol
    scores.soilHumidity = calculateParameterScore(
        sensorData.soilHumidity,
        culture.conditions.soilHumidity.min,
        culture.conditions.soilHumidity.max
    );

    // pH
    scores.ph = calculateParameterScore(
        sensorData.ph,
        culture.conditions.ph.min,
        culture.conditions.ph.max
    );

    // NPK (moyenne des trois valeurs)
    const npkScores = {
        nitrogen: calculateParameterScore(
            sensorData.npk.nitrogen,
            culture.conditions.npk.nitrogen.min,
            culture.conditions.npk.nitrogen.max
        ),
        phosphorus: calculateParameterScore(
            sensorData.npk.phosphorus,
            culture.conditions.npk.phosphorus.min,
            culture.conditions.npk.phosphorus.max
        ),
        potassium: calculateParameterScore(
            sensorData.npk.potassium,
            culture.conditions.npk.potassium.min,
            culture.conditions.npk.potassium.max
        )
    };
    scores.npk = (npkScores.nitrogen + npkScores.phosphorus + npkScores.potassium) / 3;

    // Score global (moyenne pondérée)
    const globalScore = (
        scores.temperature * 0.25 +
        scores.soilHumidity * 0.25 +
        scores.ph * 0.2 +
        scores.npk * 0.3
    ) * 100;

    return {
        globalScore: Math.round(globalScore),
        detailedScores: scores,
        conseils: culture.conditions
    };
}

// Fonction pour générer les recommandations
function generateRecommendations(compatibility, cultureName) {
    const culture = culturesDatabase[cultureName.toLowerCase()];
    if (!culture) return [];

    const recommendations = [];
    const sensorData = getCurrentSensorData();

    // Vérifier chaque paramètre et générer des recommandations
    if (sensorData.temperature < culture.conditions.temperature.min) {
        recommendations.push(`Augmenter la température (actuellement ${sensorData.temperature}°C, idéal ${culture.conditions.temperature.min}-${culture.conditions.temperature.max}°C)`);
    } else if (sensorData.temperature > culture.conditions.temperature.max) {
        recommendations.push(`Réduire la température (actuellement ${sensorData.temperature}°C, idéal ${culture.conditions.temperature.min}-${culture.conditions.temperature.max}°C)`);
    }

    if (sensorData.soilHumidity < culture.conditions.soilHumidity.min) {
        recommendations.push(`Augmenter l'irrigation (humidité actuelle ${sensorData.soilHumidity}%, idéal ${culture.conditions.soilHumidity.min}-${culture.conditions.soilHumidity.max}%)`);
    } else if (sensorData.soilHumidity > culture.conditions.soilHumidity.max) {
        recommendations.push(`Réduire l'irrigation (humidité actuelle ${sensorData.soilHumidity}%, idéal ${culture.conditions.soilHumidity.min}-${culture.conditions.soilHumidity.max}%)`);
    }

    if (sensorData.ph < culture.conditions.ph.min) {
        recommendations.push(`Augmenter le pH du sol (actuellement ${sensorData.ph}, idéal ${culture.conditions.ph.min}-${culture.conditions.ph.max})`);
    } else if (sensorData.ph > culture.conditions.ph.max) {
        recommendations.push(`Réduire le pH du sol (actuellement ${sensorData.ph}, idéal ${culture.conditions.ph.min}-${culture.conditions.ph.max})`);
    }

    // Ajouter les conseils généraux de la culture
    recommendations.push(...culture.conseils);

    return recommendations;
}

// Fonction pour afficher les cultures suggérées
function displaySuggestedCultures(sensorData) {
    const suggestedCulturesDiv = document.querySelector('.suggested-cultures');
    if (!suggestedCulturesDiv) return;
    let control = suggestedCulturesDiv.querySelector('.compat-threshold-control');
    let grid = suggestedCulturesDiv.querySelector('.suggested-cultures-grid');
    if (!control) {
        control = document.createElement('div');
        control.className = 'compat-threshold-control';
        control.innerHTML = `
            <div class="compat-threshold-header">
                <span class="compat-threshold-label">Seuil de compatibilité</span>
                <span id="compat-threshold-value">50%</span>
            </div>
            <input type="range" id="compat-threshold" min="0" max="100" step="1" value="50" class="compat-threshold-range" />
        `;
        suggestedCulturesDiv.appendChild(control);
        const range = control.querySelector('#compat-threshold');
        const valueLabel = control.querySelector('#compat-threshold-value');
        range.addEventListener('input', () => {
            valueLabel.textContent = `${range.value}%`;
            displaySuggestedCultures(sensorData);
        });
    }
    if (!grid) {
        grid = document.createElement('div');
        grid.className = 'suggested-cultures-grid';
        suggestedCulturesDiv.appendChild(grid);
    }
    grid.innerHTML = '';
    const thresholdEl = suggestedCulturesDiv.querySelector('#compat-threshold');
    const threshold = thresholdEl ? parseInt(thresholdEl.value, 10) : 50;

    Object.entries(culturesDatabase).forEach(([cultureName, cultureData]) => {
        const compatibility = calculateCompatibility(cultureName, sensorData);
        const recommendations = generateRecommendations(compatibility, cultureName);

        if (compatibility.globalScore < threshold) return;
        const cultureElement = document.createElement('div');
        cultureElement.className = 'culture-suggestion';
        cultureElement.innerHTML = `
            <h4>${cultureName.charAt(0).toUpperCase() + cultureName.slice(1)}</h4>
            <div class="compatibility-score">${compatibility.globalScore}% compatible</div>
            <div class="culture-advice">
                <strong>Conseils :</strong>
                <ul>
                    ${recommendations.map(rec => `<li>${rec}</li>`).join('')}
                </ul>
            </div>
            <button class="select-culture-btn" data-culture="${cultureName}">
                Choisir cette culture
            </button>
        `;

        grid.appendChild(cultureElement);
    });

    // Ajouter les écouteurs d'événements pour les boutons de sélection
    grid.querySelectorAll('.select-culture-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const cultureName = btn.dataset.culture;
            closeAllModals();
        });
    });
}

// Gestionnaire de modaux
class ModalManager {
    constructor() {
        this.activeModals = new Set();
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // Fermeture par la touche Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
        });

        // Fermeture par clic sur l'overlay
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal(modal.id);
                }
            });
        });

        // Gestionnaire pour les boutons de fermeture
        document.querySelectorAll('.close').forEach(closeBtn => {
            closeBtn.addEventListener('click', () => {
                const modal = closeBtn.closest('.modal');
                if (modal) {
                    this.closeModal(modal.id);
                }
            });
        });
    }

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;

        modal.style.display = 'flex';
        modal.classList.add('active');
        this.activeModals.add(modalId);
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;

        modal.classList.remove('active');
        setTimeout(() => {
            if (!modal.classList.contains('active')) {
                modal.style.display = 'none';
                this.activeModals.delete(modalId);
            }
        }, 300);
    }

    closeAllModals() {
        this.activeModals.forEach(modalId => {
            this.closeModal(modalId);
        });
    }

    isModalOpen(modalId) {
        return this.activeModals.has(modalId);
    }
}

// Gestionnaire de détails des cultures
class CultureDetailsManager {
    constructor() {
        this.detailsContainer = document.getElementById('selectedCultureDetails');
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // Fermeture des détails
        const closeBtn = this.detailsContainer.querySelector('.close-details');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hideDetails());
        }

        // Gestionnaire pour les boutons d'info
        document.querySelectorAll('.info-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // Empêche la fermeture du modal parent
                const cultureName = btn.closest('.culture-card').dataset.culture;
                this.showCultureInfo(cultureName);
            });
        });
    }

    showDetails(cultureName) {
        const culture = cultureConfig[cultureName.toLowerCase()];
        if (!culture) return;

        // Mise à jour des informations
        document.getElementById('selectedCultureImage').src = `/static/AgriSmart/assets/images/${cultureName.toLowerCase()}.png`;
        document.getElementById('selectedCultureName').textContent = culture.name;
        document.getElementById('selectedPH').textContent = culture.ph;
        document.getElementById('selectedSoilHumidity').textContent = culture.soilHumidity;
        document.getElementById('selectedTemperature').textContent = culture.temperature;

        // Mise à jour des valeurs NPK avec un format plus lisible
        const npkValues = document.querySelector('.npk-values');
        npkValues.innerHTML = `
            <div class="npk-value">
                <i class="fas fa-leaf"></i>
                <h6>Azote (N)</h6>
                <span>${culture.npk.nitrogen}</span>
            </div>
            <div class="npk-value">
                <i class="fas fa-seedling"></i>
                <h6>Phosphore (P)</h6>
                <span>${culture.npk.phosphorus}</span>
            </div>
            <div class="npk-value">
                <i class="fas fa-sun"></i>
                <h6>Potassium (K)</h6>
                <span>${culture.npk.potassium}</span>
            </div>
        `;

        // Affichage avec animation
        this.detailsContainer.classList.add('active');
        
        // Scroll vers les détails
        this.detailsContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    hideDetails() {
        this.detailsContainer.classList.remove('active');
    }

    showCultureInfo(cultureName) {
        const culture = cultureConfig[cultureName.toLowerCase()];
        if (!culture) return;

        // Mise à jour du modal d'information
        document.querySelector('#modalCultureTitle span').textContent = culture.name;
        document.getElementById('modalPH').textContent = culture.ph;
        document.getElementById('modalSoilHumidity').textContent = culture.soilHumidity;
        document.getElementById('modalAirHumidity').textContent = culture.airHumidity;
        document.getElementById('modalTemperature').textContent = culture.temperature;
        document.getElementById('modalNitrogen').textContent = culture.npk.nitrogen;
        document.getElementById('modalPhosphorus').textContent = culture.npk.phosphorus;
        document.getElementById('modalPotassium').textContent = culture.npk.potassium;

        modalManager.showModal('cultureInfoModal');
    }
}

// Initialisation
const modalManager = new ModalManager();
const cultureDetailsManager = new CultureDetailsManager();

// Event Listeners pour les boutons principaux
document.addEventListener('DOMContentLoaded', () => {
    // Bouton "Ajouter une culture"
    const addCultureBtn = document.querySelector('.addCultureBtnOne');
    if (addCultureBtn) {
        addCultureBtn.addEventListener('click', () => {
            modalManager.showModal('addCultureModal');
        });
    }

    // Boutons Oui/Non du premier modal
    const btnYesCulture = document.getElementById('btnYesCulture');
    const btnNoCulture = document.getElementById('btnNoCulture');

    if (btnYesCulture) {
        btnYesCulture.addEventListener('click', () => {
            modalManager.closeModal('addCultureModal');
            setTimeout(() => modalManager.showModal('existingCultureModal'), 300);
        });
    }

    if (btnNoCulture) {
        btnNoCulture.addEventListener('click', () => {
            modalManager.closeModal('addCultureModal');
            setTimeout(() => modalManager.showModal('newCultureModal'), 300);
        });
    }

    // Mise à jour des attributs data-culture sur les cartes de culture
    document.querySelectorAll('.culture-card').forEach(card => {
        const cultureName = card.querySelector('h3').textContent.toLowerCase();
        card.dataset.culture = cultureName;
    });

    // Gestionnaire pour les boutons "Planter"
    document.querySelectorAll('[onclick^="planterCulture"]').forEach(btn => {
        const cultureName = btn.getAttribute('onclick').match(/'([^']+)'/)[1];
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            cultureDetailsManager.showDetails(cultureName);
            modalManager.closeModal('newCultureModal');
        });
    });

    // Gestionnaire pour les boutons d'info
    document.querySelectorAll('.info-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const cultureName = e.target.closest('.culture-card').dataset.culture;
            cultureDetailsManager.showCultureInfo(cultureName);
        });
    });
});

// Validation d'une culture existante
function validateExistingCulture() {
    const cultureName = document.getElementById('existingCultureName').value;
        if (!cultureName) {
        showNotification('Veuillez entrer un nom de culture', 'error');
            return;
        }

    hideModal('existingCultureModal');
    showNotification('Analyse de compatibilité en cours...', 'info');
    // Ajoutez ici la logique d'analyse de compatibilité
}

// Affichage des informations d'une culture
function showCultureInfo(cultureName) {
    const cultureData = getCultureData(cultureName);
    if (cultureData) {
        document.getElementById('modalCultureTitle').textContent = cultureData.name;
        document.getElementById('modalPH').textContent = cultureData.ph;
        document.getElementById('modalSoilHumidity').textContent = cultureData.soilHumidity;
        document.getElementById('modalAirHumidity').textContent = cultureData.airHumidity;
        document.getElementById('modalTemperature').textContent = cultureData.temperature;
        document.getElementById('modalNitrogen').textContent = cultureData.npk.n;
        document.getElementById('modalPhosphorus').textContent = cultureData.npk.p;
        document.getElementById('modalPotassium').textContent = cultureData.npk.k;

        closeAllModals();
        showModal('cultureInfoModal');
    }
}

// Plantation d'une culture
function planterCulture(cultureName) {
    hideModal('newCultureModal');
    showNotification(`La culture de ${cultureName} a été ajoutée avec succès !`, 'success');
}

// Données des cultures
function getCultureData(cultureName) {
    const culturesData = {
        laitue: {
            name: 'Laitue',
            ph: '6.0 - 7.0',
            soilHumidity: '60-70%',
            airHumidity: '50-70%',
            temperature: '15-20°C',
            npk: {
                n: '100-120 mg/kg',
                p: '45-60 mg/kg',
                k: '80-100 mg/kg'
            }
        },
        tomate: {
            name: 'Tomate',
            ph: '6.0 - 6.8',
            soilHumidity: '60-80%',
            airHumidity: '65-75%',
            temperature: '20-25°C',
            npk: {
                n: '150-200 mg/kg',
                p: '60-80 mg/kg',
                k: '150-200 mg/kg'
            }
        },
        carotte: {
            name: 'Carotte',
            ph: '6.0 - 6.8',
            soilHumidity: '50-70%',
            airHumidity: '60-70%',
            temperature: '15-20°C',
            npk: {
                n: '80-120 mg/kg',
                p: '50-70 mg/kg',
                k: '100-150 mg/kg'
            }
        }
    };

    return culturesData[cultureName];
}
