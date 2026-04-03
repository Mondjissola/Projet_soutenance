// Configuration des graphiques
const chartConfig = {
    type: 'line',
    options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
            duration: 0
        },
        plugins: {
            legend: {
                display: false
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                grid: {
                    display: true,
                    color: 'rgba(0,0,0,0.1)'
                }
            },
            x: {
                type: 'time',
                time: {
                    parser: 'HH:mm:ss',
                    tooltipFormat: 'HH:mm:ss',
                    displayFormats: {
                        second: 'HH:mm:ss',
                        minute: 'HH:mm:ss',
                        hour: 'HH:mm:ss',
                        day: 'HH:mm:ss'
                    },
                    unit: 'second',
                    stepSize: 3
                },

                ticks: {
                    maxTicksLimit: 5,
                    source: 'data',
                    autoSkip: false
                },
                grid: {
                    display: true,
                    color: 'rgba(0,0,0,0.2)'
                }
            }
        },
        elements: {
            line: {
                tension: 0.4
            },
            point: {
                radius: 0
            }
        }
    }
};

// Stockage des données historiques pour les graphiques avec timestamps
const chartHistory = {
    soilHumidity: [],
    temperature: [],
    airHumidity: [],
    ph: [],
    nitrogen: [],
    phosphorus: [],
    potassium: []
};

// Lissage côté interface pour limiter les bonds (EMA + cap de delta)
const sensorSmooth = {
    airHumidity: null
};

function smoothValue(name, raw) {
    const stepMs = (window.AgriSmartConfig && window.AgriSmartConfig.CONNECTION && window.AgriSmartConfig.CONNECTION.FETCH_INTERVAL) || 3000;
    const stepScale = Math.max(0.2, stepMs / 3000.0);
    const betaBase = 0.2; // poids de l'EMA de base
    const beta = betaBase * stepScale;
    const maxDeltaBase = 0.8; // cap de variation par tick (~0.8%)
    const maxDelta = maxDeltaBase * stepScale;
    const prev = sensorSmooth[name];
    let candidate = raw;
    if (typeof prev === 'number' && !Number.isNaN(prev)) {
        candidate = prev + beta * (raw - prev);
        const delta = candidate - prev;
        if (delta > maxDelta) candidate = prev + maxDelta;
        if (delta < -maxDelta) candidate = prev - maxDelta;
    }
    sensorSmooth[name] = candidate;
    return candidate;
}

function round2(value) {
    const num = typeof value === 'number' ? value : parseFloat(value);
    if (!isFinite(num)) return 0;
    return parseFloat(num.toFixed(2));
}

function format2(value) {
    const num = typeof value === 'number' ? value : parseFloat(value);
    if (!isFinite(num)) return '0.00';
    return num.toFixed(2);
}

// Configuration des échelles Y spécifiques pour chaque capteur
const sensorScales = {
    soilHumidity: { min: 0, max: 100, unit: '%' },
    temperature: { min: 0, max: 50, unit: '°C' },
    airHumidity: { min: 0, max: 100, unit: '%' },
    ph: { min: 0, max: 14, unit: '' },
    nitrogen: { min: 0, max: 300, unit: 'mg/kg' },
    phosphorus: { min: 0, max: 150, unit: 'mg/kg' },
    potassium: { min: 0, max: 200, unit: 'mg/kg' }
};

// Fonction pour ajouter une nouvelle valeur à l'historique avec timestamp
function addToHistory(type, value) {
    const step = 3000;
    const list = chartHistory[type];
    let x;
    if (list.length > 0) {
        x = new Date(list[list.length - 1].x.getTime() + step);
    } else {
        const aligned = Math.floor(Date.now() / step) * step;
        x = new Date(aligned);
    }
    const dataPoint = {
        x: x,
        y: round2(value),
        timestamp: Math.floor(x.getTime() / 1000)
    };
    list.push(dataPoint);
    const maxPoints = (type === 'nitrogen' || type === 'phosphorus' || type === 'potassium') ? 4 : 5;
    if (list.length > maxPoints) {
        list.shift();
    }
}

// Configuration spécifique pour le graphique NPK
const npkChartConfig = {
    type: 'line',
    options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
            duration: 0
        },
        plugins: {
            legend: {
                display: true,
                position: 'top',
                labels: {
                    usePointStyle: true,
                    padding: 15
                }
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                grid: {
                    display: true,
                    color: 'rgba(0,0,0,0.1)'
                }
            },
            x: {
                type: 'time',
                time: {
                    parser: 'HH:mm:ss',
                    tooltipFormat: 'HH:mm:ss',
                    displayFormats: {
                        millisecond: 'HH:mm:ss',
                        second: 'HH:mm:ss',
                        minute: 'HH:mm:ss',
                        hour: 'HH:mm:ss',
                        day: 'HH:mm:ss'
                    },
                    unit: 'second'
                },
                ticks: {
                    maxTicksLimit: 5,
                    callback: function(value, index, values) {
                        const date = new Date(value);
                        const hours = date.getHours().toString().padStart(2, '0');
                        const minutes = date.getMinutes().toString().padStart(2, '0');
                        const seconds = date.getSeconds().toString().padStart(2, '0');
                        return `${hours}:${minutes}:${seconds}`;
                    }
                },
                grid: {
                    display: true,
                    color: 'rgba(0,0,0,0.2)'
                }
            }
        },
        elements: {
            line: {
                tension: 0.4
            },
            point: {
                radius: 2
            }
        }
    }
};

// Fonction pour créer un graphique
function createChart(canvasId, label, color) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    
    if (canvasId === 'npkChart') {
        return new Chart(ctx, {
            ...npkChartConfig,
            data: {
                datasets: [
                    {
                        label: 'Azote (N)',
                        data: [...chartHistory.nitrogen],
                        borderColor: '#f1c40f',
                        backgroundColor: '#f1c40f20',
                        fill: false
                    },
                    {
                        label: 'Phosphore (P)',
                        data: [...chartHistory.phosphorus],
                        borderColor: '#e67e22',
                        backgroundColor: '#e67e2220',
                        fill: false
                    },
                    {
                        label: 'Potassium (K)',
                        data: [...chartHistory.potassium],
                        borderColor: '#3498db',
                        backgroundColor: '#3498db20',
                        fill: false
                    }
                ]
            },
            options: {
                ...npkChartConfig.options,
                scales: {
                    ...npkChartConfig.options.scales,
                    y: {
                        ...npkChartConfig.options.scales.y,
                        min: 0,
                        max: 300,
                        ticks: {
                            callback: function(value) {
                                return value + ' mg/kg';
                            }
                        }
                    },
                    x: {
                        ...npkChartConfig.options.scales.x
                    }
                }
            }
        });
    } else {
        const historyKey = getHistoryKey(canvasId);
        const scale = sensorScales[historyKey];
        
        return new Chart(ctx, {
            ...chartConfig,
            data: {
                datasets: [{
                    label: label,
                    data: [...chartHistory[historyKey]],
                    borderColor: color,
                    backgroundColor: color + '20',
                    fill: true
                }]
            },
            options: {
                ...chartConfig.options,
                scales: {
                    ...chartConfig.options.scales,
                    y: {
                        ...chartConfig.options.scales.y,
                        min: scale.min,
                        max: scale.max,
                        ticks: {
                            callback: function(value) {
                                return value + scale.unit;
                            }
                        }
                    },
                    x: {
                        type: 'time',
                        time: {
                            parser: 'HH:mm:ss',
                            tooltipFormat: 'HH:mm:ss',
                            displayFormats: {
                                second: 'HH:mm:ss',
                                minute: 'HH:mm:ss',
                                hour: 'HH:mm:ss',
                                day: 'HH:mm:ss'
                            },
                            unit: 'second',
                            stepSize: 3
                        },
                        ticks: {
                            maxTicksLimit: 5,
                            source: 'data',
                            autoSkip: false,
                            callback: function(value, index, values) {
                                const date = new Date(value);
                                return date.getHours().toString().padStart(2, '0') + ':' +
                                       date.getMinutes().toString().padStart(2, '0') + ':' +
                                       date.getSeconds().toString().padStart(2, '0');
                            }
                        },
                        grid: {
                            display: true,
                            color: 'rgba(0,0,0,0.2)'
                        }
                    }
                }
            }
        });
    }
}

// Mapper les IDs de canvas aux clés d'historique
function getHistoryKey(canvasId) {
    const mapping = {
        'soilHumidityChart': 'soilHumidity',
        'temperatureChart': 'temperature',
        'airHumidityChart': 'airHumidity',
        'phChart': 'ph'
    };
    return mapping[canvasId] || 'soilHumidity';
}



// Initialiser tous les graphiques
const charts = {
    soilHumidity: createChart('soilHumidityChart', 'Humidité du sol', '#2ecc71'),
    temperature: createChart('temperatureChart', 'Température', '#e74c3c'),
    airHumidity: createChart('airHumidityChart', 'Humidité de l\'air', '#3498db'),
    ph: createChart('phChart', 'pH', '#9b59b6'),
    npk: createChart('npkChart')
};

// Fonction pour mettre à jour les valeurs des capteurs
function updateSensorValue(elementId, newValue, unit = '') {
    const element = document.getElementById(elementId);
    if (element) {
        const str = typeof newValue === 'number' ? format2(newValue) : format2(parseFloat(newValue));
        element.textContent = unit ? `${str}` : `${str}`;
        element.parentElement.classList.add('value-update');
        setTimeout(() => {
            element.parentElement.classList.remove('value-update');
        }, 300);
    }
}

// Fonction pour mettre à jour le statut d'un capteur
function updateSensorStatus(sensorCard, status) {
    const statusDiv = sensorCard.querySelector('.sensor-status');
    if (!statusDiv) return;

    statusDiv.className = 'sensor-status ' + status;
    
    let icon, text;
    switch(status) {
        case 'optimal':
            icon = 'fa-check-circle';
            text = 'Optimal';
            break;
        case 'warning':
            icon = 'fa-exclamation-circle';
            text = 'Attention';
            break;
        case 'critical':
            icon = 'fa-times-circle';
            text = 'Critique';
            break;
    }
    
    statusDiv.innerHTML = `<i class="fas ${icon}"></i> ${text}`;
}



// Fonction pour mettre à jour les graphiques avec de nouvelles données
function updateChart(chartName, newData) {
    const chart = charts[chartName];
    if (!chart) return;

    // Vérifier si le graphique est en pause
    const chartId = chart.canvas.id;
    if (chartPauseStates[chartId]) {
        console.log(`⏸️ Graphique ${chartId} en pause, mise à jour ignorée`);
        return;
    }

    if (chartName === 'npk') {
        chart.data.datasets[0].data = [...chartHistory.nitrogen];
        chart.data.datasets[1].data = [...chartHistory.phosphorus];
        chart.data.datasets[2].data = [...chartHistory.potassium];
    } else {
        chart.data.datasets[0].data = [...chartHistory[chartName]];
    }
    
    // Force la mise à jour sans animation
    chart.update('none');
}

// Mettre à jour l'interface avec les vraies données
function updateDashboardWithRealData(sensorData) {
    const isPaused = (canvasId) => !!chartPauseStates[canvasId];

    if (!isPaused('soilHumidityChart')) {
        updateSensorValue('soil-humidity', round2(sensorData.soilHumidity), '%');
        addToHistory('soilHumidity', sensorData.soilHumidity);
        updateChart('soilHumidity', [...chartHistory.soilHumidity]);
    }
    if (!isPaused('temperatureChart')) {
        updateSensorValue('temperature', round2(sensorData.temperature), '°C');
        addToHistory('temperature', sensorData.temperature);
        updateChart('temperature', [...chartHistory.temperature]);
    }
    if (!isPaused('airHumidityChart')) {
        const ah = smoothValue('airHumidity', sensorData.airHumidity);
        updateSensorValue('air-humidity', round2(ah), '%');
        addToHistory('airHumidity', ah);
        updateChart('airHumidity', [...chartHistory.airHumidity]);
    }
    if (!isPaused('phChart')) {
        updateSensorValue('ph', round2(sensorData.soilPh));
        addToHistory('ph', sensorData.soilPh);
        updateChart('ph', [...chartHistory.ph]);
    }
    // NPK (pas de bouton pause dédié)
    updateSensorValue('nitrogen', round2(sensorData.npk.nitrogen), 'mg/kg');
    updateSensorValue('phosphorus', round2(sensorData.npk.phosphorus), 'mg/kg');
    updateSensorValue('potassium', round2(sensorData.npk.potassium), 'mg/kg');
    addToHistory('nitrogen', sensorData.npk.nitrogen);
    addToHistory('phosphorus', sensorData.npk.phosphorus);
    addToHistory('potassium', sensorData.npk.potassium);
    updateChart('npk');

    // Mettre à jour les statuts basés sur les vraies valeurs
    updateSensorStatuses(sensorData);
}

// Fonction pour déterminer le statut des capteurs
function updateSensorStatuses(data) {
    const sensorCards = document.querySelectorAll('.sensor-card');
    const thresholds = window.AgriSmartConfig?.THRESHOLDS;
    
    if (!thresholds) {
        console.warn('Configuration des seuils non disponible');
        return;
    }
    
    sensorCards.forEach(card => {
        const cardId = card.id;
        let status = 'optimal';
        
        // Logique de détermination du statut basée sur les vraies valeurs
        switch(cardId) {
            case 'soil-humidity-card':
                if (data.soilHumidity < thresholds.SOIL_HUMIDITY.critical) status = 'critical';
                else if (data.soilHumidity < thresholds.SOIL_HUMIDITY.warning) status = 'warning';
                break;
            case 'temperature-card':
                if (data.temperature > thresholds.TEMPERATURE.critical_max || data.temperature < thresholds.TEMPERATURE.critical_min) status = 'critical';
                else if (data.temperature > thresholds.TEMPERATURE.warning_max || data.temperature < thresholds.TEMPERATURE.warning_min) status = 'warning';
                break;
            case 'air-humidity-card':
                if (data.airHumidity < thresholds.AIR_HUMIDITY.critical_min || data.airHumidity > thresholds.AIR_HUMIDITY.critical_max) status = 'critical';
                else if (data.airHumidity < thresholds.AIR_HUMIDITY.warning_min || data.airHumidity > thresholds.AIR_HUMIDITY.warning_max) status = 'warning';
                break;
            case 'ph-card':
                if (data.soilPh < thresholds.SOIL_PH.critical_min || data.soilPh > thresholds.SOIL_PH.critical_max) status = 'critical';
                else if (data.soilPh < thresholds.SOIL_PH.warning_min || data.soilPh > thresholds.SOIL_PH.warning_max) status = 'warning';
                break;
        }
        
        updateSensorStatus(card, status);
    });
}

// Gestionnaire d'événements pour le sélecteur de zone
document.getElementById('zone')?.addEventListener('change', (e) => {
    const zone = e.target.value;
    // Les données sont maintenant gérées par le sensorManager global
    console.log('Zone changée:', zone);
});

// Fonction pour attendre que sensorManager soit disponible
function waitForSensorManager() {
    return new Promise((resolve) => {
        if (window.sensorManager && typeof window.onSensorDataChange === 'function') {
            resolve();
        } else {
            const checkInterval = setInterval(() => {
                if (window.sensorManager && typeof window.onSensorDataChange === 'function') {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
        }
    });
}

// Fonction pour charger l'historique initial depuis la base de données
async function loadInitialHistory() {
    try {
        console.log('📈 Chargement de l\'historique initial...');
        
        // Charger l'historique pour chaque type de capteur
        const sensorTypes = ['soil_humidity', 'temperature', 'air_humidity', 'soil_ph', 'nitrogen', 'phosphorus', 'potassium'];
        
        for (const sensorType of sensorTypes) {
            // Charger moins de points pour NPK (4 points) pour améliorer la lisibilité
            const pointsToLoad = (sensorType === 'nitrogen' || sensorType === 'phosphorus' || sensorType === 'potassium') ? 4 : 5;
            const historyData = await window.sensorManager.getHistoryData(sensorType, pointsToLoad);
            if (historyData && Array.isArray(historyData)) {
                const stepMs = (window.AgriSmartConfig && window.AgriSmartConfig.CONNECTION && window.AgriSmartConfig.CONNECTION.FETCH_INTERVAL) || 3000;
                const endAligned = Math.floor(Date.now() / stepMs) * stepMs;
                const aligned = [];
                const values = historyData.map(h => h.value);
                for (let i = 0; i < values.length; i++) {
                    const x = new Date(endAligned - (values.length - 1 - i) * stepMs);
                    aligned.push({ x, y: parseFloat(values[i]), timestamp: Math.floor(x.getTime() / 1000) });
                }
                const typeMapping = {
                    'soil_humidity': 'soilHumidity',
                    'temperature': 'temperature',
                    'air_humidity': 'airHumidity',
                    'soil_ph': 'ph',
                    'nitrogen': 'nitrogen',
                    'phosphorus': 'phosphorus',
                    'potassium': 'potassium'
                };
                const historyKey = typeMapping[sensorType];
                if (historyKey && chartHistory[historyKey]) {
                    chartHistory[historyKey] = aligned;
                }
            }
        }
        
        console.log('✅ Historique initial chargé');
        
        // Mettre à jour tous les graphiques avec l'historique
        Object.keys(charts).forEach(chartName => {
            updateChart(chartName);
        });
        
    } catch (error) {
        console.error('❌ Erreur lors du chargement de l\'historique:', error);
    }
}

// Initialisation du dashboard avec les vraies données
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Initialisation du dashboard avec données réelles');
    
    // Attendre que sensorManager soit disponible
    await waitForSensorManager();
    console.log('✅ SensorManager prêt');
    
    // Charger l'historique initial
    await loadInitialHistory();
    
    // S'abonner aux changements de données du capteur (toutes les 3 secondes)
    onSensorDataChange((sensorData) => {
        console.log('📊 Mise à jour des graphiques avec nouvelles données');
        updateDashboardWithRealData(sensorData);
    });
    
    
});

// Variable pour suivre l'état de pause des graphiques
const chartPauseStates = {};

// Fonction pour gérer la pause/lecture des graphiques
function toggleChartRefresh(chartId) {
    // Trouver le bouton correspondant
    const button = document.querySelector(`button[onclick="toggleChartRefresh('${chartId}')"]`);
    if (!button) {
        console.error('Bouton non trouvé pour:', chartId);
        return;
    }

    const icon = button.querySelector('i');
    const isPaused = chartPauseStates[chartId] || false;

    if (isPaused) {
        // Reprendre le rafraîchissement
        chartPauseStates[chartId] = false;
        button.classList.remove('playing');
        icon.className = 'fas fa-pause';
        button.title = 'Mettre en pause le rafraîchissement';
        console.log(`📊 Rafraîchissement repris pour ${chartId}`);
    } else {
        // Mettre en pause
        chartPauseStates[chartId] = true;
        button.classList.add('playing');
        icon.className = 'fas fa-play';
        button.title = 'Reprendre le rafraîchissement';
        console.log(`⏸️ Rafraîchissement mis en pause pour ${chartId}`);
    }
}

// Rendre les données des capteurs accessibles globalement
window.getChartHistory = () => chartHistory;
window.getSensorScales = () => sensorScales;
window.addToChartHistory = addToHistory;
window.updateDashboardChart = updateChart;
window.toggleChartRefresh = toggleChartRefresh;
window.chartPauseStates = chartPauseStates;
