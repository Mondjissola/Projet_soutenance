class UIManager {
    constructor() {
        this.currentModal = null;
        this.modals = new Map();
        this.currentInputValue = '';
        this.dataPlants = {};
        this.compatibilityThreshold = 80;
        // Gestion des rafraîchissements programmés et des listeners capteurs
        this._sensorEventCallback = null;
        this.productsRefreshInterval = null;
        this.inlineCompatInterval = null;
        this.init();
    }



    async loadPlantsInfos() {
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');

        try {
            const response = await fetch('/managePlantsData', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken,
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Erreur HTTP : ${response.status}`);
            }

            const data = await response.json();
            console.log("Données brutes reçues :", data);

            if (data && data.data) {
                const parsedData = typeof data.data === 'string' ? JSON.parse(data.data) : data.data;
                this.dataPlants = parsedData;
                console.log("Données bien stockées :", this.dataPlants);
                this.renderProducts(this.getProductsFromPlants());
            } else {
                console.error("Format de données invalide :", data);
                this.dataPlants = {};
            }
        } catch (error) {
            console.error("Erreur lors de la récupération des données :", error);
            this.dataPlants = {};
        }
    }

    async init() {
        this.setupModals();
        this.bindEvents();
        await this.loadPlantsInfos();
        this.loadSavedPlants();
        this.setupZoneChangeListener();
        this.setupPlantStatsModal();
        this.setupSensorDataListener();
    }

    setupModals() {
        // Register all modals with their configurations
        this.modals.set('ui-modal-1', {
            element: document.getElementById('ui-modal-1'),
            onShow: () => {},
            onHide: () => {}
        });

        this.modals.set('ui-modal-2', {
            element: document.getElementById('ui-modal-2'),
            onShow: () => {
                const input = document.getElementById('ui-text-input');
                setTimeout(() => input.focus(), 100);
            },
            onHide: () => {}
        });

        this.modals.set('ui-modal-3', {
            element: document.getElementById('ui-modal-3'),
            onShow: () => {
                // Initialiser countdown et bouton toggle
                if (this.countdownValue === undefined) this.countdownValue = 10;
                this.refreshPaused = !!this.refreshPaused;
                const countdownEl = document.getElementById('ui-refresh-countdown');
                const toggleBtn = document.getElementById('ui-refresh-toggle');
                if (countdownEl) countdownEl.textContent = `Actualisation dans ${this.countdownValue}s`;
                if (toggleBtn) {
                    toggleBtn.innerHTML = this.refreshPaused ? '<i class="fas fa-play"></i>' : '<i class="fas fa-pause"></i>';
                    toggleBtn.onclick = () => {
                        this.refreshPaused = !this.refreshPaused;
                        toggleBtn.innerHTML = this.refreshPaused ? '<i class="fas fa-play"></i>' : '<i class="fas fa-pause"></i>';
                    };
                }
            },
            onHide: () => {}
        });

        this.modals.set('ui-modal-4', {
            element: document.getElementById('ui-modal-4'),
            onShow: () => {},
            onHide: () => {}
        });
    }

    bindEvents() {
        // Start button
        document.querySelector('.buttonDisabled').addEventListener('click', () => {
            this.showModal('ui-modal-1');
        });

        // Choice buttons
        document.getElementById('ui-yes-btn').addEventListener('click', () => {
            this.showModal('ui-modal-2');
        });

        document.getElementById('ui-no-btn').addEventListener('click', () => {
            this.showModal('ui-modal-3');
        });

        // Validate button
        document.getElementById('ui-validate-btn').addEventListener('click', () => {
            this.handleValidation();
        });

        // Handle Enter key in input
        document.getElementById('ui-text-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleValidation();
            }
        });

        // Search functionality
        document.getElementById('ui-search-input').addEventListener('input', (e) => {
            this.handleSearch(e.target.value);
        });

        const thresholdInput = document.getElementById('ui-threshold-input');
        const thresholdValue = document.getElementById('ui-threshold-value');
        if (thresholdInput && thresholdValue) {
            thresholdValue.textContent = `${this.compatibilityThreshold}%`;
            thresholdInput.value = String(this.compatibilityThreshold);
            const updateThreshold = (val) => {
                const num = Math.max(0, Math.min(100, parseInt(val, 10) || 0));
                this.compatibilityThreshold = num;
                thresholdValue.textContent = `${num}%`;
                this.renderProducts(this.getProductsFromPlants());
            };
            thresholdInput.addEventListener('input', (e) => updateThreshold(e.target.value));
            thresholdInput.addEventListener('change', (e) => updateThreshold(e.target.value));
        }

        // Bind close buttons automatically
        document.querySelectorAll('.ui-close-btn').forEach(button => {
            button.addEventListener('click', () => {
                this.hideCurrentModal();
            });
        });

        // Click outside to close
        document.querySelectorAll('.ui-modal-overlay').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideCurrentModal();
                }
            });
        });


    }



    handleSearch(searchTerm) {
        if (!searchTerm.trim()) {
            this.renderProducts(this.getProductsFromPlants());
            return;
        }

        // Search by both name and key (ID)
        const allProducts = this.getProductsFromPlants();
        const filteredProducts = allProducts.filter(product => {
            const searchLower = searchTerm.toLowerCase();
            return product.title.toLowerCase().includes(searchLower) || 
                   product.key.toLowerCase().includes(searchLower);
        });
        
        this.renderProducts(filteredProducts);
    }

    showModal(modalId) {
        this.hideCurrentModal();
        
        const modalConfig = this.modals.get(modalId);
        if (!modalConfig) {
            console.error(`Modal ${modalId} not found`);
            return;
        }

        const modal = modalConfig.element;
        modal.classList.remove('ui-hidden');
        modal.classList.add('ui-show');
        
        this.currentModal = modal;
        this.currentModalId = modalId;

        // Execute onShow callback
        if (modalConfig.onShow) {
            modalConfig.onShow();
        }
    }

    hideCurrentModal() {
        if (this.currentModal) {
            const modalConfig = this.modals.get(this.currentModalId);
            
            // Execute onHide callback
            if (modalConfig && modalConfig.onHide) {
                modalConfig.onHide();
            }

            this.currentModal.classList.remove('ui-show');
            this.currentModal.classList.add('ui-hidden');
            this.currentModal = null;
            this.currentModalId = null;
        }
    }

    handleValidation() {
        const input = document.getElementById('ui-text-input');
        const inputValue = input.value.trim().toLowerCase();
        
        if (inputValue) {
            this.currentInputValue = inputValue;
            this.generateInfo(inputValue);
            this.showModal('ui-modal-4');
            input.value = ''; // Reset input
        } else {
            input.focus();
            input.classList.add('ui-error');
            setTimeout(() => input.classList.remove('ui-error'), 300);
        }
    }

    generateInfo(inputValue) {
        const container = document.getElementById('ui-info-container');
        // Mémoriser la plante actuellement affichée (clé si trouvée, sinon la valeur d'entrée)
        this.currentInputValue = inputValue;
        
        // Check if data is loaded
        if (!this.dataPlants || typeof this.dataPlants !== 'object') {
            container.innerHTML = `
                <div class="ui-not-found-container">
                    <div class="ui-not-found-icon">
                        <i class="fas fa-hourglass-half"></i>
                    </div>
                    <h2 class="ui-not-found-title">Chargement en cours...</h2>
                    <p class="ui-not-found-message">Les données des plantes sont en cours de chargement.</p>
                </div>
            `;
            return;
        }
        
        // Try to find the plant primarily by name, then by key
        let plantData = null;
        let foundKey = null;
        
        // First try to find by name (priorité aux noms)
        for (const [key, data] of Object.entries(this.dataPlants)) {
            if (data.nom && data.nom.toLowerCase() === inputValue) {
                plantData = data;
                foundKey = key;
                break;
            }
        }
        
        // If not found by name, try by key as fallback
        if (!plantData) {
            plantData = this.dataPlants[inputValue];
            foundKey = inputValue;
        }
        
        // Mettre à jour la valeur courante si une clé a été déterminée
        if (foundKey) {
            this.currentInputValue = foundKey;
        }

        // If still not found, show error message
        if (!plantData) {
            container.innerHTML = `
                <div class="ui-not-found-container">
                    <div class="ui-not-found-icon">
                        <i class="fas fa-search"></i>
                    </div>
                    <h2 class="ui-not-found-title">Plante non trouvée</h2>
                    <p class="ui-not-found-message">
                        Désolé, nous n'avons pas d'informations sur "${inputValue}" dans notre base de données.
                    </p>
                    <div class="ui-available-plants">
                        <h3>Plantes disponibles :</h3>
                        <div class="ui-plants-list">
                            ${Object.entries(this.dataPlants).map(([key, data]) => `
                                <button class="ui-plant-suggestion" onclick="uiManager.selectSuggestedPlant('${data.nom.toLowerCase()}')">
                                    ${data.nom}
                                </button>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        // Calculer la compatibilité en temps réel pour affichage dans la fiche
        const realtimeCompatibility = this.calculateCompatibility(plantData);

        container.innerHTML = `
            <h2 class="ui-info-title">
                <i class="fas fa-leaf"></i>
                Informations sur votre ${plantData.nom}
            </h2>
            
            <div class="ui-difficulty-badge ${plantData.difficulte}">
                <i class="fas fa-star"></i>
                ${plantData.difficulte === 'easy' ? 'Facile' : plantData.difficulte === 'medium' ? 'Moyen' : 'Difficile'}
                <span class="ui-compatibility-inline" style="margin-left:8px; font-weight:600;">
                    <i class="fas fa-check-circle"></i> Compatibilité: ${Math.round(realtimeCompatibility)}%
                </span>
            </div>

            <div class="ui-plant-stats">
                <div class="ui-stat-card">
                    <i class="fas fa-clock"></i>
                    <h4>Temps de pousse</h4>
                    <p>${plantData.temps_de_pousse}</p>
                </div>
                <div class="ui-stat-card">
                    <i class="fas fa-calendar-alt"></i>
                    <h4>Période de plantation</h4>
                    <p>${plantData.periode_plantation}</p>
                </div>
                <div class="ui-stat-card">
                    <i class="fas fa-harvest"></i>
                    <h4>Période de récolte</h4>
                    <p>${plantData.periode_recolte}</p>
                </div>
            </div>

            <div class="ui-info-section">
                <h3><i class="fas fa-info-circle"></i> Informations générales</h3>
                <div class="ui-info-grid">
                    <div class="ui-info-item">
                        <strong>Nom scientifique:</strong> ${plantData.nom_latin}
                    </div>
                    <div class="ui-info-item">
                        <strong>Famille:</strong> ${plantData.famille}
                    </div>
                    <div class="ui-info-item">
                        <strong>Origine:</strong> ${plantData.origine}
                    </div>
                    <div class="ui-info-item">
                        <strong>Milieu naturel:</strong> ${plantData.milieu_naturel}
                    </div>
                </div>
            </div>

            <div class="ui-info-section">
                <h3><i class="fas fa-seedling"></i> Conditions de culture</h3>
                <div class="ui-culture-grid">
                    <div class="ui-culture-card">
                        <i class="fas fa-mountain"></i>
                        <h4>Sol</h4>
                        <p>${plantData.type_sol}</p>
                    </div>
                    <div class="ui-culture-card">
                        <i class="fas fa-tint"></i>
                        <h4>Arrosage</h4>
                        <p>${plantData.besoin_en_eau}</p>
                    </div>
                    <div class="ui-culture-card">
                        <i class="fas fa-sun"></i>
                        <h4>Exposition</h4>
                        <p>${plantData.exposition}</p>
                    </div>
                    <div class="ui-culture-card">
                        <i class="fas fa-flask"></i>
                        <h4>pH du sol</h4>
                        <p>${plantData.ph_min} - ${plantData.ph_max}</p>
                    </div>
                </div>
            </div>

            <div class="ui-info-section">
                <h3><i class="fas fa-thermometer-half"></i> Conditions environnementales</h3>
                <div class="ui-env-grid">
                    <div class="ui-env-item">
                        <strong>Température de l'air:</strong> ${plantData.temperature_air_min}°C - ${plantData.temperature_air_max}°C
                    </div>
                    <div class="ui-env-item">
                        <strong>Humidité de l'air:</strong> ${plantData.humidite_air_min}% - ${plantData.humidite_air_max}%
                    </div>
                    <div class="ui-env-item">
                        <strong>Humidité du sol:</strong> ${plantData.humidite_sol_min}% - ${plantData.humidite_sol_max}%
                    </div>
                    <div class="ui-env-item">
                        <strong>Luminosité:</strong> ${plantData.luminosite_min ? plantData.luminosite_min.toLocaleString() : 'Non spécifié'} - ${plantData.luminosite_max ? plantData.luminosite_max.toLocaleString() : 'Non spécifié'} Lux
                    </div>
                </div>
            </div>

            <div class="ui-info-section">
                <h3><i class="fas fa-spa"></i> Engrais recommandé</h3>
                <p>${plantData.engrais_recommande}</p>
            </div>

            <div class="ui-info-section">
                <h3><i class="fas fa-exclamation-triangle"></i> Sensibilités</h3>
                <div class="ui-sensibility-list">
                    ${this.formatSensibilite(plantData.sensibilite)}
                </div>
            </div>

            <div class="ui-action-buttons">
                <button class="ui-back-btn" onclick="uiManager.goBackToProducts()">
                    <i class="fas fa-arrow-left"></i>
                    Retour aux suggestions
                </button>
                <button class="ui-plant-btn" onclick="uiManager.plantCultureByName('${plantData.nom}')">
                    <i class="fas fa-seedling"></i>
                    Planter cette culture
                </button>
            </div>
        `;
    }

    // Rafraîchissements programmés: liste toutes les 10s, compatibilité inline modale toutes les 10s
    setupSensorDataListener() {
        // Nettoyage d’éventuels listeners/intervales précédemment enregistrés
        if (this._sensorEventCallback) {
            window.removeEventListener('globalSensorDataUpdated', this._sensorEventCallback);
            if (typeof window.offSensorDataChange === 'function') {
                try { window.offSensorDataChange(this._sensorEventCallback); } catch (e) {}
            }
            this._sensorEventCallback = null;
        }
        if (this.productsRefreshInterval) {
            try { clearInterval(this.productsRefreshInterval); } catch (e) {}
            this.productsRefreshInterval = null;
        }
        if (this.inlineCompatInterval) {
            try { clearInterval(this.inlineCompatInterval); } catch (e) {}
            this.inlineCompatInterval = null;
        }
        if (this.currentCultureCompatInterval) {
            try { clearInterval(this.currentCultureCompatInterval); } catch (e) {}
            this.currentCultureCompatInterval = null;
        }

        // Rafraîchit la liste des plantes compatibles toutes les 10 secondes
        // État global pause et countdown
        if (this.refreshPaused === undefined) this.refreshPaused = false;
        if (this.countdownValue === undefined) this.countdownValue = 10;

        const updateCountdownUI = () => {
            if (this.currentModalId !== 'ui-modal-3') return;
            const el = document.getElementById('ui-refresh-countdown');
            const btn = document.getElementById('ui-refresh-toggle');
            if (el) el.textContent = `Actualisation dans ${this.countdownValue}s`;
            if (btn) btn.innerHTML = this.refreshPaused ? '<i class="fas fa-play"></i>' : '<i class="fas fa-pause"></i>';
        };

        const refreshProducts = () => {
            if (this.refreshPaused) return;
            const products = this.getProductsFromPlants();
            this.renderProducts(products);
            // Reset countdown when a refresh occurs
            this.countdownValue = 10;
            updateCountdownUI();
        };
        this.productsRefreshInterval = setInterval(refreshProducts, 10000);
        // Exécuter immédiatement une première fois pour cohérence
        refreshProducts();

        // Rafraîchit uniquement la compatibilité inline de la fiche info toutes les 10 secondes
        const refreshInlineCompat = () => {
            if (this.refreshPaused) return;
            // Met à jour compatibilité dans la fiche info (modal) et dans la carte "culture en cours"
            this.updateInlineCompatibilityUI();
            this.updateCurrentCultureCompatibility();
        };
        this.inlineCompatInterval = setInterval(refreshInlineCompat, 10000);
        // Exécuter immédiatement une première fois
        refreshInlineCompat();

        // Décompte visuel toutes les secondes
        if (this.countdownInterval) {
            try { clearInterval(this.countdownInterval); } catch (e) {}
            this.countdownInterval = null;
        }
        this.countdownInterval = setInterval(() => {
            if (this.refreshPaused) return;
            this.countdownValue = Math.max(0, this.countdownValue - 1);
            if (this.countdownValue === 0) {
                // Le rafraîchissement périodique fera le travail; on remet juste à 10 pour affichage
                this.countdownValue = 10;
            }
            updateCountdownUI();
        }, 1000);
    }

    // Met à jour uniquement la zone de compatibilité en temps réel dans la fiche plante
    updateInlineCompatibilityUI() {
        if (this.currentModalId !== 'ui-modal-4') return;
        const container = document.getElementById('ui-info-container');
        if (!container) return;
        const compatSpan = container.querySelector('.ui-compatibility-inline');
        if (!compatSpan) return;

        let key = this.currentInputValue;
        let plantData = this.dataPlants ? this.dataPlants[key] : null;
        if (!plantData && key) {
            const foundKey = this.findPlantKeyByName(key);
            if (foundKey) {
                key = foundKey;
                plantData = this.dataPlants[foundKey];
            }
        }
        if (!plantData) return;

        const score = this.calculateCompatibility(plantData);
        // Afficher le libellé complet
        compatSpan.innerHTML = `Compatibilité: <strong>${score}%</strong>`;
    }

    // Met à jour le badge de compatibilité dans la carte "culture en cours"
    updateCurrentCultureCompatibility() {
        const detailsContainer = document.getElementById('selectedCultureDetails');
        if (!detailsContainer) return;
        if (!this.currentPlantData || !this.currentPlantData.data) return;
        const scoreEl = detailsContainer.querySelector('.compat-score');
        if (!scoreEl) return;
        const score = this.calculateCompatibility(this.currentPlantData.data);
        scoreEl.textContent = `${score}%`;
    }



    getProductsFromPlants() {
        if (!this.dataPlants || typeof this.dataPlants !== 'object') {
            return [];
        }
        return Object.entries(this.dataPlants).map(([key, plantData]) => ({
            title: plantData.nom || 'Nom non disponible',
            description: this.sanitizeText(plantData.description || 'Description non disponible'),
            image: this.getPlantImage(plantData),
            key: key,
            compatibility: this.calculateCompatibility(plantData),
            compatibilityReasons: this.getCompatibilityReasons(plantData)
        }));
    }

    // Nettoyage des descriptions pour éviter l'apparition de texte technique
    sanitizeText(text) {
        if (!text || typeof text !== 'string') return '';
        let cleaned = text;
        cleaned = cleaned.replace(/\[oaicite:[^\]]*\]/gi, '');
        cleaned = cleaned.replace(/contentReference\[[^\]]*\]/gi, '');
        cleaned = cleaned.replace(/<[^>]*>/g, '');
        cleaned = cleaned.replace(/\s+/g, ' ').trim();
        return cleaned;
    }

    getPlantImage(plantData) {
        // Retourne l'image basée sur le nom de la plante + .png
        const plantName = typeof plantData === 'string' ? plantData : plantData.nom;
        const imageName = plantName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        return `/static/AgriSmart/assets/images/${imageName}.png`;
    }

    calculateCompatibility(plantData) {
        // Calcul de compatibilité en temps réel basé sur les capteurs et les plages min/max de la plante
        // Objectif: résultats plus discriminants sans être trop sévères
        const sensorData = (typeof window.getSensorData === 'function') ? window.getSensorData() : (window.globalSensorData || {});

        // Extraire et parser les bornes de la plante
        const tMin = parseFloat(plantData.temperature_air_min);
        const tMax = parseFloat(plantData.temperature_air_max);
        const shMin = parseFloat(plantData.humidite_sol_min);
        const shMax = parseFloat(plantData.humidite_sol_max);
        const phMin = parseFloat(plantData.ph_min);
        const phMax = parseFloat(plantData.ph_max);
        const ahMin = parseFloat(plantData.humidite_air_min);
        const ahMax = parseFloat(plantData.humidite_air_max);

        // Vérifier si les données nécessaires sont présentes
        const hasSensors = sensorData && sensorData.temperature != null && sensorData.soilHumidity != null && sensorData.soilPh != null;
        const hasRanges = ![tMin, tMax, shMin, shMax, phMin, phMax].some(v => Number.isNaN(v));

        // Si capteurs ou bornes manquants, ne pas afficher (compatibilité 0)
        if (!hasSensors || !hasRanges) {
            return 0;
        }

        // Score paramétrique via pénalité exponentielle en fonction de l'écart normalisé à la largeur de plage
        const expPenaltyScore = (value, min, max) => {
            if ([value, min, max].some(v => Number.isNaN(v))) return 0.0;
            const w = Math.max(0.0001, max - min);
            let d = 0;
            if (value < min) d = (min - value) / w;
            else if (value > max) d = (value - max) / w;
            else d = 0;
            const alpha = 3.0; // ajustable: >2 pour pénalité réaliste sans être trop dure
            return Math.exp(-alpha * d); // 1 à l'intérieur, décroissance douce hors plage
        };

        const sTemp = expPenaltyScore(parseFloat(sensorData.temperature), tMin, tMax);
        const sSoilHum = expPenaltyScore(parseFloat(sensorData.soilHumidity), shMin, shMax);
        const sPh = expPenaltyScore(parseFloat(sensorData.soilPh), phMin, phMax);
        const hasAirHumRanges = !(Number.isNaN(ahMin) || Number.isNaN(ahMax));
        const sAirHum = hasAirHumRanges && sensorData.airHumidity != null ? expPenaltyScore(parseFloat(sensorData.airHumidity), ahMin, ahMax) : null;

        // Pondération (somme à 1). Moyenne géométrique pondérée pour éviter les scores trop élevés si un paramètre est faible
        let weights;
        if (sAirHum != null) {
            weights = { temperature: 0.30, soilHumidity: 0.35, ph: 0.25, airHumidity: 0.10 };
        } else {
            weights = { temperature: 0.40, soilHumidity: 0.40, ph: 0.20 };
        }

        // Produit des scores^poids (moyenne géométrique)
        let product = Math.pow(sTemp, weights.temperature) * Math.pow(sSoilHum, weights.soilHumidity) * Math.pow(sPh, weights.ph);
        if (sAirHum != null) {
            product *= Math.pow(sAirHum, weights.airHumidity);
        }

        // Bonus léger pour les plantes "faciles" afin d'éviter un durcissement excessif
        let bonus = 0;
        if (plantData.difficulte === 'easy') bonus = 3;

        const score = Math.max(0, Math.min(100, Math.round(product * 100 + bonus)));
        return score;
    }

    getCompatibilityReasons(plantData) {
        const reasons = [];

        // Données capteurs
        const sensorData = (typeof window.getSensorData === 'function') ? window.getSensorData() : (window.globalSensorData || {});

        const pushReason = (msg) => { if (msg) reasons.push(msg); };

        // Faits contextuels
        if (plantData.exposition && plantData.exposition.toLowerCase().includes('soleil')) {
            pushReason('Exposition: soleil recommandé');
        }
        if (plantData.type_sol && plantData.type_sol.toLowerCase().includes('drain')) {
            pushReason('Type de sol: bien drainé');
        }

        // Analyse par rapport aux bornes
        const checks = [
            {
                label: 'Température', value: sensorData.temperature,
                min: parseFloat(plantData.temperature_air_min), max: parseFloat(plantData.temperature_air_max), unit: '°C'
            },
            {
                label: 'Humidité du sol', value: sensorData.soilHumidity,
                min: parseFloat(plantData.humidite_sol_min), max: parseFloat(plantData.humidite_sol_max), unit: '%'
            },
            {
                label: 'pH du sol', value: sensorData.soilPh,
                min: parseFloat(plantData.ph_min), max: parseFloat(plantData.ph_max), unit: ''
            }
        ];

        const ahMin = parseFloat(plantData.humidite_air_min);
        const ahMax = parseFloat(plantData.humidite_air_max);
        if (!Number.isNaN(ahMin) && !Number.isNaN(ahMax) && sensorData.airHumidity != null) {
            checks.push({ label: "Humidité de l'air", value: sensorData.airHumidity, min: ahMin, max: ahMax, unit: '%' });
        }

        checks.forEach(({ label, value, min, max, unit }) => {
            if ([value, min, max].some(v => v == null || Number.isNaN(parseFloat(v)))) return;
            const v = parseFloat(value), mn = parseFloat(min), mx = parseFloat(max);
            if (v < mn) pushReason(`${label} trop basse (${v}${unit}). Idéal: ${mn}–${mx}${unit}`);
            else if (v > mx) pushReason(`${label} trop élevée (${v}${unit}). Idéal: ${mn}–${mx}${unit}`);
            else pushReason(`${label} dans l'intervalle idéal (${mn}–${mx}${unit})`);
        });

        if (reasons.length === 0 && plantData.difficulte) {
            const diffLabel = plantData.difficulte === 'easy' ? 'facile' : plantData.difficulte === 'medium' ? 'moyenne' : 'difficile';
            pushReason(`Difficulté intrinsèque: ${diffLabel}`);
        }

        return reasons.length > 0 ? reasons : ['Aucune raison trouvée'];
    }

    formatSensibilite(sensibilite) {
        if (!sensibilite) {
            return '<div class="ui-sensibility-item"><i class="fas fa-warning"></i><span>Aucune sensibilité connue</span></div>';
        }
        
        // Si c'est un array (cas où les données sont déjà parsées)
        if (Array.isArray(sensibilite)) {
            return sensibilite.map(sens => `
                <div class="ui-sensibility-item">
                    <i class="fas fa-warning"></i>
                    <span>${sens}</span>
                </div>
            `).join('');
        }
        
        // Si c'est une chaîne de caractères
        return `<div class="ui-sensibility-item">
            <i class="fas fa-warning"></i>
            <span>${sensibilite}</span>
        </div>`;
    }

    renderProducts(products) {
        const grid = document.getElementById('ui-products-grid');
        grid.innerHTML = '';

        const threshold = (typeof this.compatibilityThreshold === 'number') ? this.compatibilityThreshold : 80;
        const filtered = products.filter(p => {
            const val = (typeof p.compatibility === 'number') ? p.compatibility : 0;
            return val >= threshold;
        });

        if (filtered.length === 0) {
            const noResults = document.createElement('div');
            noResults.className = 'ui-no-results';
            noResults.innerHTML = `
                <div class="ui-no-results-icon">
                    <i class="fas fa-search-minus"></i>
                </div>
                <div class="ui-no-results-text">Non trouvé</div>
                <div class="ui-no-results-subtitle">Aucune plante ≥ ${threshold}% de compatibilité dans les conditions actuelles</div>
            `;
            grid.appendChild(noResults);
            return;
        }

        filtered.forEach(product => {
            const card = this.createProductCard(product);
            grid.appendChild(card);
        });
    }

    createProductCard(product) {
        const card = document.createElement('div');
        card.className = 'ui-product-card';
        
        // Truncate description if longer than 150 characters
        const maxLength = 150;
        const description = product.description;
        const truncatedDescription = description.length > maxLength 
            ? description.substring(0, maxLength) 
            : description;
        const needsTruncation = description.length > maxLength;
        
        card.innerHTML = `
            <div class="ui-product-card-inner">
                <div class="ui-product-card-front">
                    <div class="ui-product-img">
                        <img src="${product.image}" alt="${product.title}" />
                    </div>
                    <div class="ui-product-info">
                        <h3 class="ui-product-title">${product.title}</h3>
                        <p class="ui-product-desc">
                            ${truncatedDescription}${needsTruncation ? '<span class="ui-read-more" onclick="uiManager.showFullDescription(this)">...lire tout</span>' : ''}
                        </p>
                        <button class="ui-compatibility-cta" onclick="uiManager.showCompatibility(this)">
                            <i class="fas fa-chart-line"></i>
                            <span class="ui-compatibility-text">
                                <span class="ui-compatibility-score">${product.compatibility}%</span>
                                <span class="ui-compatibility-label">Compatible</span>
                            </span>
                            <i class="fas fa-chevron-right"></i>
                        </button>
                        <button class="ui-cta-btn" onclick="uiManager.selectProduct('${product.key}')">
                            <i class="fas fa-seedling"></i>
                            Voir les informations
                        </button>
                    </div>
                </div>
                <div class="ui-product-card-back">
                    <div class="ui-compatibility-details">
                        <h3><i class="fas fa-info-circle"></i> Compatibilité ${product.compatibility}%</h3>
                        <ul>
                            ${(product.compatibilityReasons || ['Aucune raison trouvée']).map(reason => `
                                <li><i class="fas fa-check-circle"></i> ${reason}</li>
                            `).join('')}
                        </ul>
                        <button class="ui-flip-back-btn" onclick="uiManager.flipCardBack(this)">
                            <i class="fas fa-arrow-left"></i>
                            Retour
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Store full description for later use
        card.setAttribute('data-full-description', description);
        card.setAttribute('data-title', product.title);
        
        return card;
    }



    selectProduct(productKey) {
        // Show plant information for the selected product
        this.generateInfo(productKey);
        this.showModal('ui-modal-4');
    }

    selectSuggestedPlant(plantName) {
        // Convertir le nom en clé pour compatibilité
        this.generateInfo(plantName);
    }
    
    // Helper function pour trouver la clé à partir du nom
    findPlantKeyByName(plantName) {
        for (const [key, data] of Object.entries(this.dataPlants)) {
            if (data.nom && data.nom.toLowerCase() === plantName.toLowerCase()) {
                return key;
            }
        }
        return null;
    }

    showFullDescription(element) {
        const card = element.closest('.ui-product-card');
        const fullDescription = card.getAttribute('data-full-description');
        const title = card.getAttribute('data-title');
        
        // Get the back face and replace content with full description
        const backFace = card.querySelector('.ui-product-card-back');
        backFace.innerHTML = `
            <div class="ui-full-description">
                <h3><i class="fas fa-leaf"></i> ${title}</h3>
                <div class="ui-full-description-content">
                    ${fullDescription}
                </div>
                <button class="ui-back-btn" onclick="uiManager.flipCardBack(this)">
                    <i class="fas fa-arrow-left"></i>
                    Retour
                </button>
            </div>
        `;
        
        // Flip the card
        card.classList.add('flipped-description');
    }

    showCompatibility(element) {
        const card = element.closest('.ui-product-card');
        const productKey = card.querySelector('.ui-cta-btn').getAttribute('onclick').match(/'(.+?)'/)[1];
        const plantData = this.dataPlants[productKey];
        
        // Calculate compatibility and reasons
        const compatibility = this.calculateCompatibility(plantData);
        const compatibilityReasons = this.getCompatibilityReasons(plantData);
        
        // Get the back face and replace content with compatibility details
        const backFace = card.querySelector('.ui-product-card-back');
        backFace.innerHTML = `
            <div class="ui-compatibility-details">
                <h3><i class="fas fa-info-circle"></i> Compatibilité ${compatibility}%</h3>
                <ul>
                    ${compatibilityReasons.map(reason => `
                        <li><i class="fas fa-check-circle"></i> ${reason}</li>
                    `).join('')}
                </ul>
                <button class="ui-flip-back-btn" onclick="uiManager.flipCardBack(this)">
                    <i class="fas fa-arrow-left"></i>
                    Retour
                </button>
            </div>
        `;
        
        // Flip the card
        card.classList.add('flipped');
    }

    flipCardBack(element) {
        const card = element.closest('.ui-product-card');
        card.classList.remove('flipped', 'flipped-description');
    }

    goBackToProducts() {
        this.hideCurrentModal();
        this.showModal('ui-modal-3');
    }

    plantCulture(plantKey) {
        const plantData = this.dataPlants[plantKey];
        if (!plantData) {
            console.error('Plante non trouvée:', plantKey);
            return;
        }

        // Sauvegarder dans localStorage
        const selectedZone = document.getElementById('zone').value;
        if (selectedZone === 'vide') {
            alert('Veuillez d\'abord sélectionner une zone');
            return;
        }

        const plantInfo = {
            key: plantKey,
            name: plantData.nom,
            zone: selectedZone,
            plantedDate: new Date().toISOString(),
            data: plantData
        };

        // Sauvegarder la plante pour cette zone
        localStorage.setItem(`agrismart_zone_${selectedZone}`, JSON.stringify(plantInfo));

        // Générer une alerte automatique pour la nouvelle plante
        if (typeof window.generatePlantAlert === 'function') {
            window.generatePlantAlert(plantData.nom, selectedZone);
        }

        // Fermer tous les modals
        this.hideCurrentModal();

        // Mettre à jour l'affichage
        this.updateZoneSelector();
        this.displaySelectedPlant(plantInfo);

        // Afficher une notification de succès
        if (typeof showSuccessMessage === 'function') {
            showSuccessMessage(`${plantData.nom} a été planté avec succès dans la ${selectedZone}!`);
        }
    }
    
    plantCultureByName(plantName) {
        // Trouver la clé correspondant au nom
        const plantKey = this.findPlantKeyByName(plantName);
        if (plantKey) {
            this.plantCulture(plantKey);
        } else {
            console.error('Plante non trouvée par nom:', plantName);
        }
    }

    updateZoneSelector() {
        const select = document.getElementById('zone');
        const options = select.querySelectorAll('option');
        
        options.forEach(option => {
            if (option.value !== 'vide') {
                const plantInfo = localStorage.getItem(`agrismart_zone_${option.value}`);
                if (plantInfo) {
                    const plant = JSON.parse(plantInfo);
                    option.textContent = `${option.value} - ${plant.name}`;
                } else {
                    option.textContent = option.value;
                }
            }
        });
    }

    displaySelectedPlant(plantInfo) {
        const detailsContainer = document.getElementById('selectedCultureDetails');
        if (!detailsContainer) {
            console.log('Container selectedCultureDetails non trouvé');
            return;
        }

        // Afficher le conteneur et masquer le message "aucune culture sélectionnée"
        detailsContainer.style.display = 'block';
        detailsContainer.classList.add('active');
        const noCultureNotice = document.getElementById('noCultureSelected');
        if (noCultureNotice) noCultureNotice.style.display = 'none';

        // Calculer compatibilité et préparer les métriques
        const plantData = plantInfo.data || {};
        const compatibility = this.calculateCompatibility(plantData);
        const phRange = `${plantData.ph_min ?? '?'} – ${plantData.ph_max ?? '?'}`;
        const tempRange = `${plantData.temperature_air_min ?? '?'}°C – ${plantData.temperature_air_max ?? '?'}°C`;
        const soilHumRange = `${plantData.humidite_sol_min ?? '?'}% – ${plantData.humidite_sol_max ?? '?'}%`;
        const airHumRange = (plantData.humidite_air_min != null && plantData.humidite_air_max != null)
            ? `${plantData.humidite_air_min}% – ${plantData.humidite_air_max}%`
            : null;

        // Construire le nouveau rendu UI de la culture en cours
        const safeDesc = this.sanitizeText(plantData.description || 'Description non disponible');
        const imgSrc = this.getPlantImage(plantData);

        detailsContainer.innerHTML = `
            <article class="current-culture-card" role="region" aria-labelledby="currentCultureTitle">
                <header class="current-culture-hero">
                    <div class="hero-left">
                        <div class="culture-image">
                            <img id="selectedCultureImage" src="${imgSrc}" alt="${plantInfo.name}" />
                        </div>
                    </div>
                    <div class="hero-right">
                        <h3 id="currentCultureTitle" class="hero-subtitle"><i class="fas fa-seedling"></i> Culture en cours</h3>
                        <h2 id="selectedCultureName" class="hero-title">${plantInfo.name}</h2>
                        <div class="compat-badge" aria-label="Compatibilité de la plante">
                            <i class="fas fa-heart"></i>
                            <span><span class="compat-score">${compatibility}%</span> compatible</span>
                        </div>
                        <div class="metric-chips">
                            <div class="metric-chip" title="Plage idéale du pH">
                                <i class="fas fa-flask"></i><span>pH ${phRange}</span>
                            </div>
                            <div class="metric-chip" title="Température idéale">
                                <i class="fas fa-thermometer-half"></i><span>${tempRange}</span>
                            </div>
                            <div class="metric-chip" title="Humidité du sol idéale">
                                <i class="fas fa-tint"></i><span>${soilHumRange}</span>
                            </div>
                            ${airHumRange ? `
                            <div class="metric-chip" title="Humidité de l'air idéale">
                                <i class="fas fa-cloud"></i><span>${airHumRange}</span>
                            </div>` : ''}
                        </div>
                    </div>
                </header>
                <section class="current-culture-content">
                    <p id="selectedCultureDescription" class="current-culture-description">${safeDesc}</p>
                    <div class="action-bar">
                        <button id="moreOptionsBtn" class="btn btn-primary">
                            <i class="fas fa-chart-line"></i>
                            Voir statistiques
                        </button>
                        <button id="checkConditionsBtn" class="btn btn-ghost">
                            <i class="fas fa-search"></i>
                            Scanner l'état
                        </button>
                    </div>
                </section>
            </article>
        `;

        // Stocker les données de la plante pour le modal de statistiques
        this.currentPlantData = plantInfo;
        console.log('UI de culture en cours rendu, compatibilité:', compatibility);
    }

    // Les styles sont désormais gérés via CSS. Cette méthode est conservée vide
    // pour éviter d'écraser la nouvelle charte graphique par des styles inline.
    forceStyles() { }

    loadSavedPlants() {
        // Charger les plantes sauvegardées au démarrage
        this.updateZoneSelector();
        
        // Afficher la plante de la zone actuellement sélectionnée
        const selectedZone = document.getElementById('zone').value;
        if (selectedZone !== 'vide') {
            const plantInfo = localStorage.getItem(`agrismart_zone_${selectedZone}`);
            if (plantInfo) {
                this.displaySelectedPlant(JSON.parse(plantInfo));
            }
        }
    }

    setupZoneChangeListener() {
        const zoneSelect = document.getElementById('zone');
        if (zoneSelect) {
            zoneSelect.addEventListener('change', () => {
                const selectedZone = zoneSelect.value;
                if (selectedZone !== 'vide') {
                    const plantInfo = localStorage.getItem(`agrismart_zone_${selectedZone}`);
                    if (plantInfo) {
                        this.displaySelectedPlant(JSON.parse(plantInfo));
                    } else {
                        // Cacher les détails s'il n'y a pas de plante pour cette zone
                        const detailsContainer = document.getElementById('selectedCultureDetails');
                        if (detailsContainer) {
                            detailsContainer.style.display = 'none';
                        }
                    }
                } else {
                    // Cacher les détails si aucune zone n'est sélectionnée
                    const detailsContainer = document.getElementById('selectedCultureDetails');
                    if (detailsContainer) {
                        detailsContainer.style.display = 'none';
                    }
                }
            });
        }
    }

    setupPlantStatsModal() {
        // Utiliser la délégation d'événement pour capturer les clics
        document.body.addEventListener('click', (e) => {
            // Bouton "Statistiques"
            if (e.target.id === 'moreOptionsBtn' || e.target.closest('#moreOptionsBtn')) {
                e.preventDefault();
                e.stopPropagation();
                console.log('Bouton Statistiques cliqué!');
                this.showPlantStatsModal();
                return;
            }
            // Bouton "Scanner l'état" (délégué pour survivre aux rerenders)
            if (e.target.id === 'checkConditionsBtn' || e.target.closest('#checkConditionsBtn')) {
                e.preventDefault();
                e.stopPropagation();
                if (typeof window.checkCurrentCultureConditions === 'function') {
                    console.log('Scanner l\'état déclenché');
                    window.checkCurrentCultureConditions();
                } else {
                    console.warn('Fonction checkCurrentCultureConditions introuvable');
                }
                return;
            }
            
            // Bouton de fermeture du modal
            if (e.target.classList.contains('plant-stats-close') || e.target.closest('.plant-stats-close')) {
                e.preventDefault();
                this.hidePlantStatsModal();
                return;
            }
            
            // Clic sur l'overlay pour fermer
            if (e.target.classList.contains('plant-stats-modal')) {
                e.preventDefault();
                this.hidePlantStatsModal();
                return;
            }
        });
    }

    showPlantStatsModal() {
        if (!this.currentPlantData) {
            console.log('Pas de données de plante disponibles');
            return;
        }

        const modal = document.getElementById('plantStatsModal');
        if (!modal) {
            console.log('Modal introuvable');
            return;
        }

        const plantData = this.currentPlantData.data;
        console.log('Affichage du modal pour:', this.currentPlantData.name);

        // Remplir le titre
        const titleElement = document.getElementById('plantStatsTitle');
        if (titleElement) {
            titleElement.innerHTML = `<i class="fas fa-info-circle"></i>${this.currentPlantData.name}`;
        }

        // Remplir les statistiques
        const statElements = {
            'statPH': `${plantData.ph_min} - ${plantData.ph_max}`,
            'statTemperature': `${plantData.temperature_air_min}°C - ${plantData.temperature_air_max}°C`,
            'statSoilHumidity': `${plantData.humidite_sol_min}% - ${plantData.humidite_sol_max}%`,
            'statAirHumidity': `${plantData.humidite_air_min}% - ${plantData.humidite_air_max}%`
        };

        Object.entries(statElements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        });

        // Remplir les conseils
        this.displayConseils();

        // Afficher le modal avec une méthode plus robuste
        modal.classList.remove('plant-stats-hide');
        modal.classList.add('plant-stats-show');
        modal.style.setProperty('display', 'flex', 'important');
        modal.style.setProperty('z-index', '9999', 'important');
        
        // Force aussi l'affichage du contenu
        const modalContent = modal.querySelector('.plant-stats-content');
        if (modalContent) {
            modalContent.style.setProperty('display', 'block', 'important');
            modalContent.style.setProperty('visibility', 'visible', 'important');
            modalContent.style.setProperty('opacity', '1', 'important');
            modalContent.style.setProperty('width', '90%', 'important');
            modalContent.style.setProperty('max-width', '900px', 'important');
            console.log('Contenu du modal forcé visible');
        }
        
        // S'assurer que le modal reste visible avec un observateur
        let keepAliveInterval = setInterval(() => {
            if (modal && modal.classList.contains('plant-stats-show')) {
                modal.style.setProperty('display', 'flex', 'important');
                modal.style.setProperty('z-index', '9999', 'important');
                
                // Aussi pour le contenu
                const modalContent = modal.querySelector('.plant-stats-content');
                if (modalContent) {
                    modalContent.style.setProperty('display', 'block', 'important');
                    modalContent.style.setProperty('visibility', 'visible', 'important');
                    modalContent.style.setProperty('opacity', '1', 'important');
                }
            } else {
                clearInterval(keepAliveInterval);
            }
        }, 100);
        
        // Nettoyer l'intervalle après 5 secondes
        setTimeout(() => {
            clearInterval(keepAliveInterval);
        }, 5000);
        
        // Empêcher les autres systèmes de modal de fermer le nôtre
        this.protectModal(modal);
        
        console.log('Modal affiché avec classes:', modal.classList.toString());
        
        // Debug complet
        this.debugModal(modal);
        
        // Méthode ultime si ça ne marche toujours pas
        setTimeout(() => {
            this.bruteForceShowModal(modal);
        }, 200);
    }
    
    bruteForceShowModal(modal) {
        if (!modal) return;
        
        console.log('BRUTE FORCE ACTIVATION');
        
        // Supprimer toutes les classes et styles existants
        modal.className = 'plant-stats-modal plant-stats-show';
        modal.style.cssText = `
            display: flex !important;
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            background-color: rgba(0, 0, 0, 0.6) !important;
            z-index: 99999 !important;
            justify-content: center !important;
            align-items: center !important;
            visibility: visible !important;
            opacity: 1 !important;
        `;
        
        const content = modal.querySelector('.plant-stats-content');
        if (content) {
            content.style.cssText = `
                background-color: white !important;
                border-radius: 16px !important;
                max-width: 900px !important;
                width: 90% !important;
                max-height: 90vh !important;
                overflow-y: auto !important;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3) !important;
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
                position: relative !important;
                margin: 0 !important;
                padding: 0 !important;
            `;
        }
        
        console.log('BRUTE FORCE APPLIQUÉ');
    }
    
    debugModal(modal) {
        console.log('=== DEBUG MODAL ===');
        console.log('Modal element:', modal);
        console.log('Modal display:', window.getComputedStyle(modal).display);
        console.log('Modal visibility:', window.getComputedStyle(modal).visibility);
        console.log('Modal z-index:', window.getComputedStyle(modal).zIndex);
        
        const content = modal.querySelector('.plant-stats-content');
        if (content) {
            console.log('Content element:', content);
            console.log('Content display:', window.getComputedStyle(content).display);
            console.log('Content visibility:', window.getComputedStyle(content).visibility);
            console.log('Content opacity:', window.getComputedStyle(content).opacity);
            console.log('Content width:', window.getComputedStyle(content).width);
        }
        console.log('==================');
    }

    protectModal(modal) {
        // Override temporaire des fonctions qui pourraient fermer le modal
        const originalStyle = modal.style.cssText;
        
        // Observer les changements de style
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    if (modal.classList.contains('plant-stats-show')) {
                        if (modal.style.display !== 'flex') {
                            modal.style.setProperty('display', 'flex', 'important');
                            console.log('Modal protection: style restauré');
                        }
                        
                        // Protéger aussi le contenu
                        const modalContent = modal.querySelector('.plant-stats-content');
                        if (modalContent && modalContent.style.display === 'none') {
                            modalContent.style.setProperty('display', 'block', 'important');
                            modalContent.style.setProperty('visibility', 'visible', 'important');
                            modalContent.style.setProperty('opacity', '1', 'important');
                            console.log('Contenu modal protection: style restauré');
                        }
                    }
                }
            });
        });
        
        observer.observe(modal, {
            attributes: true,
            attributeFilter: ['style', 'class']
        });
        
        // Arrêter l'observation après 10 secondes
        setTimeout(() => {
            observer.disconnect();
        }, 10000);
    }

    hidePlantStatsModal() {
        const modal = document.getElementById('plantStatsModal');
        if (modal) {
            modal.classList.remove('plant-stats-show');
            modal.classList.add('plant-stats-hide');
            modal.style.setProperty('display', 'none', 'important');
            console.log('Modal fermé');
        }
    }

    getConseils() {
        return {
            jardinage: {
                icon: 'fas fa-seedling',
                title: 'Jardinage',
                conseils: [
                    'Préparez bien le sol en l\'ameublissant et en y incorporant du compost bien décomposé pour améliorer sa structure.',
                    'Effectuez une taille légère si nécessaire pour favoriser la croissance et éliminer les parties abîmées.',
                    'Inspectez régulièrement les feuilles pour détecter tout signe de maladie ou d\'attaque de parasites.'
                ]
            },
            arrosage: {
                icon: 'fas fa-tint',
                title: 'Arrosage & Hydratation',
                conseils: [
                    'Maintenez un arrosage régulier mais évitez l\'excès d\'eau qui pourrait provoquer la pourriture des racines.',
                    'Vérifiez l\'humidité du sol avant d\'arroser en enfonçant votre doigt dans la terre.',
                    'Arrosez de préférence le matin pour éviter l\'évaporation excessive.'
                ]
            },
            environnement: {
                icon: 'fas fa-thermometer-half',
                title: 'Conditions Environnementales',
                conseils: [
                    'Assurez-vous que votre plante reçoit suffisamment de lumière selon ses besoins spécifiques.',
                    'Surveillez les variations de température et protégez vos plants des conditions climatiques extrêmes.',
                    'Maintenir une bonne circulation d\'air autour des plants pour éviter les maladies fongiques.'
                ]
            },
            planification: {
                icon: 'fas fa-calendar-alt',
                title: 'Planification',
                conseils: [
                    'Respectez les périodes de plantation et de récolte recommandées pour optimiser le rendement de votre culture.',
                    'Planifiez la rotation des cultures pour maintenir la fertilité du sol.',
                    'Tenez un carnet de culture pour suivre les progrès et ajuster les soins.'
                ]
            }
        };
    }

    displayConseils() {
        const container = document.getElementById('conseilsContainer');
        const conseilsData = this.getConseils();
        
        container.innerHTML = Object.entries(conseilsData).map(([key, typeData]) => `
            <div class="conseil-type-section">
                <div class="conseil-type-header">
                    <div class="conseil-type-icon">
                        <i class="${typeData.icon}"></i>
                    </div>
                    <h4 class="conseil-type-title">${typeData.title}</h4>
                </div>
                <div class="conseil-type-content">
                    ${typeData.conseils.map(conseil => `
                        <div class="conseil-item">
                            <i class="fas fa-check-circle"></i>
                            <span>${conseil}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');
    }
}

// Initialize the UI manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.uiManager = new UIManager();
});
