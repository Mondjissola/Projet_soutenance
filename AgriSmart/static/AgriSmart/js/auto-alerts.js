// Module pour la génération automatique d'alertes
class AutoAlertsGenerator {
    constructor() {
        this.thresholds = {
            temperature: { min: 18, max: 30 },
            humidity: { min: 40, max: 80 },
            ph: { min: 6.0, max: 7.0 },
            nitrogen: { min: 20, max: 100 },
            phosphorus: { min: 10, max: 50 },
            potassium: { min: 20, max: 80 }
        };
    }

    // Appeler cette fonction quand une nouvelle plante est ajoutée
    async onPlantAdded(plantName, zone) {
        if (typeof alertesManager !== 'undefined') {
            await alertesManager.generatePlantAlert(plantName, zone);
        } else {
            // Si alertesManager n'est pas disponible, créer l'alerte directement
            await this.createDirectAlert({
                titre: `Nouvelle plante ajoutée - ${plantName}`,
                description: `Félicitations, Une nouvelle plante (${plantName}) a été ajoutée dans ${zone}.`,
                type_alerte: 'info',
                urgence: 1,
                zone: zone
            });
        }
    }

    // Surveiller les statistiques et générer des alertes
    async checkStatistics(stats, zone) {
        const alerts = [];

        // Vérifier la température
        if (stats.temperature < this.thresholds.temperature.min || stats.temperature > this.thresholds.temperature.max) {
            const threshold = stats.temperature < this.thresholds.temperature.min ? this.thresholds.temperature.min : this.thresholds.temperature.max;
            alerts.push({
                type: 'temperature',
                value: stats.temperature,
                threshold: threshold,
                zone: zone
            });
        }

        // Vérifier l'humidité
        if (stats.humidity < this.thresholds.humidity.min || stats.humidity > this.thresholds.humidity.max) {
            const threshold = stats.humidity < this.thresholds.humidity.min ? this.thresholds.humidity.min : this.thresholds.humidity.max;
            alerts.push({
                type: 'humidity',
                value: stats.humidity,
                threshold: threshold,
                zone: zone
            });
        }

        // Vérifier le pH
        if (stats.ph < this.thresholds.ph.min || stats.ph > this.thresholds.ph.max) {
            const threshold = stats.ph < this.thresholds.ph.min ? this.thresholds.ph.min : this.thresholds.ph.max;
            alerts.push({
                type: 'ph',
                value: stats.ph,
                threshold: threshold,
                zone: zone
            });
        }

        // Vérifier les nutriments
        ['nitrogen', 'phosphorus', 'potassium'].forEach(nutrient => {
            if (stats[nutrient] < this.thresholds[nutrient].min || stats[nutrient] > this.thresholds[nutrient].max) {
                const threshold = stats[nutrient] < this.thresholds[nutrient].min ? this.thresholds[nutrient].min : this.thresholds[nutrient].max;
                alerts.push({
                    type: 'nutrition',
                    subtype: nutrient,
                    value: stats[nutrient],
                    threshold: threshold,
                    zone: zone
                });
            }
        });

        // Générer les alertes
        for (const alert of alerts) {
            if (typeof alertesManager !== 'undefined') {
                await alertesManager.generateStatAlert(alert.type, alert.value, alert.threshold, alert.zone);
            } else {
                await this.createDirectAlert(this.buildStatAlert(alert));
            }
        }
    }

    buildStatAlert(alertData) {
        let urgence = 1;
        let type = 'info';
        let titre = '';
        let description = '';

        // Déterminer l'urgence et le type selon l'écart avec le seuil
        const deviation = Math.abs(alertData.value - alertData.threshold) / alertData.threshold;
        
        if (deviation > 0.5) {
            urgence = 5;
            type = 'critical';
        } else if (deviation > 0.3) {
            urgence = 4;
            type = 'warning';
        } else if (deviation > 0.2) {
            urgence = 3;
            type = 'warning';
        } else if (deviation > 0.1) {
            urgence = 2;
            type = 'info';
        }

        switch(alertData.type) {
            case 'temperature':
                titre = `Température ${alertData.value > alertData.threshold ? 'élevée' : 'basse'} - ${alertData.zone}`;
                description = `La température est de ${alertData.value}°C (seuil optimal: ${alertData.threshold}°C). ${alertData.value > alertData.threshold ? 'Risque de stress thermique pour les cultures.' : 'Risque de ralentissement de croissance.'}`;
                break;
            case 'humidity':
                titre = `Humidité ${alertData.value > alertData.threshold ? 'excessive' : 'faible'} - ${alertData.zone}`;
                description = `L'humidité est de ${alertData.value}% (seuil optimal: ${alertData.threshold}%). ${alertData.value > alertData.threshold ? 'Risque de maladies fongiques.' : 'Risque de dessèchement des cultures.'}`;
                break;
            case 'ph':
                titre = `pH ${alertData.value > alertData.threshold ? 'alcalin' : 'acide'} - ${alertData.zone}`;
                description = `Le pH du sol est de ${alertData.value} (optimal: ${alertData.threshold}). Ajustement nécessaire pour optimiser l'absorption des nutriments.`;
                break;
            case 'nutrition':
                const nutrientNames = {
                    nitrogen: 'azote',
                    phosphorus: 'phosphore',
                    potassium: 'potassium'
                };
                const nutrientName = nutrientNames[alertData.subtype] || alertData.subtype;
                titre = `Niveau ${nutrientName} ${alertData.value > alertData.threshold ? 'excessif' : 'insuffisant'} - ${alertData.zone}`;
                description = `Le niveau de ${nutrientName} est de ${alertData.value} mg/kg (optimal: ${alertData.threshold} mg/kg). ${alertData.value < alertData.threshold ? 'Apport d\'engrais recommandé.' : 'Risque de sur-fertilisation.'}`;
                break;
        }

        return {
            titre,
            description,
            type_alerte: type,
            urgence,
            zone: alertData.zone
        };
    }

    async createDirectAlert(alerteData) {
        try {
            const response = await fetch('/manage_alertes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': document.querySelector('[name=csrf-token]').getAttribute('content')
                },
                body: JSON.stringify(alerteData)
            });

            const data = await response.json();
            if (data.status === 'success') {
                console.log('Alerte automatique créée:', alerteData.titre);
            }
        } catch (error) {
            console.error('Erreur lors de la création d\'alerte automatique:', error);
        }
    }

    // Fonction utilitaire pour simuler l'ajout d'une plante (à utiliser pour tester)
    async simulateNewPlant() {
        const plants = ['Tomate', 'Basilic', 'Gombo', 'Manioc', 'Maïs'];
        const zones = ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4'];
        
        const randomPlant = plants[Math.floor(Math.random() * plants.length)];
        const randomZone = zones[Math.floor(Math.random() * zones.length)];
        
        await this.onPlantAdded(randomPlant, randomZone);
    }

    // Fonction utilitaire pour simuler des valeurs critiques (à utiliser pour tester)
    async simulateCriticalStats() {
        const zones = ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4'];
        const randomZone = zones[Math.floor(Math.random() * zones.length)];
        
        // Simuler des valeurs critiques
        const criticalStats = {
            temperature: 35, // Trop élevé
            humidity: 20,    // Trop faible
            ph: 8.5,         // Trop alcalin
            nitrogen: 10,    // Trop faible
            phosphorus: 70,  // Trop élevé
            potassium: 15    // Trop faible
        };
        
        await this.checkStatistics(criticalStats, randomZone);
    }
}

// Initialiser le générateur d'alertes automatiques
let autoAlertsGenerator;
document.addEventListener('DOMContentLoaded', function() {
    autoAlertsGenerator = new AutoAlertsGenerator();
});

// Exposer les fonctions globalement pour être utilisées depuis d'autres scripts
window.generatePlantAlert = (plantName, zone) => {
    if (autoAlertsGenerator) {
        autoAlertsGenerator.onPlantAdded(plantName, zone);
    }
};

window.checkAndGenerateStatAlerts = (stats, zone) => {
    if (autoAlertsGenerator) {
        autoAlertsGenerator.checkStatistics(stats, zone);
    }
};
