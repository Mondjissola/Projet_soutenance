class AlertesManager {
    constructor() {
        this.alertes = [];
        this.filters = {
            status: {
                unread: true,
                read: true
            },
            types: {
                critical: true,
                warning: true,
                info: true
            },
            zones: {
                zone1: true,
                zone2: true,
                zone3: true,
                zone4: true
            },
            period: 'all'
        };
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.syncFiltersWithUI();
        this.loadAlertes();
    }

    syncFiltersWithUI() {
        // Synchroniser les filtres de zone avec l'état des cases à cocher
        const zoneCheckboxes = document.querySelectorAll('.checkbox-container input[type="checkbox"]');
        
        zoneCheckboxes.forEach(checkbox => {
            const label = checkbox.parentElement.textContent.trim().toLowerCase();
            
            if (label.includes('zone')) {
                const zoneMatch = label.match(/\d+/);
                if (zoneMatch) {
                    const zone = 'zone' + zoneMatch[0];
                    this.filters.zones[zone] = checkbox.checked;
                }
            }
        });
    }

    setupEventListeners() {
        // Filtres par statut (lu/non lu)
        const filterUnread = document.getElementById('filter-unread');
        const filterRead = document.getElementById('filter-read');
        
        if (filterUnread) {
            filterUnread.addEventListener('change', (e) => {
                this.filters.status.unread = e.target.checked;
                this.applyFilters();
            });
        }
        
        if (filterRead) {
            filterRead.addEventListener('change', (e) => {
                this.filters.status.read = e.target.checked;
                this.applyFilters();
            });
        }

        // Filtres par type et zone
        const filterCheckboxes = document.querySelectorAll('.checkbox-container input:not(#filter-unread):not(#filter-read)');
        filterCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                this.updateFilters(e);
                // updateFilters appelle déjà applyFilters, pas besoin de double appel
            });
        });

        // Filtre par période
        const periodSelect = document.querySelector('.period-select');
        if (periodSelect) {
            periodSelect.addEventListener('change', (e) => {
                this.filters.period = e.target.value;
                this.applyFilters();
            });
        }

        // Bouton tout marquer comme lu
        const markAllReadBtn = document.querySelector('.mark-all-read');
        if (markAllReadBtn) {
            markAllReadBtn.addEventListener('click', () => {
                this.markAllAsRead();
            });
        }

        // Bouton effacer toutes les alertes
        const deleteAllBtn = document.querySelector('.delete-all-alerts');
        if (deleteAllBtn) {
            deleteAllBtn.addEventListener('click', () => {
                this.deleteAllAlertes();
            });
        }


    }

    async loadAlertes() {
        try {
            console.log('Chargement des alertes...');
            const response = await fetch('/manage_alertes');
            console.log('Réponse reçue:', response.status);
            
            const data = await response.json();
            console.log('Données:', data);
            
            if (data.status === 'success') {
                this.alertes = data.alertes;
                // Trier par date de création décroissante (plus récentes d'abord)
                this.alertes.sort((a, b) => new Date(b.date_creation) - new Date(a.date_creation));
                console.log('Alertes chargées:', this.alertes.length);
                this.renderAlertes();
            } else {
                console.error('Erreur lors du chargement des alertes:', data.message);
                this.showError('Erreur lors du chargement des alertes: ' + data.message);
            }
        } catch (error) {
            console.error('Erreur réseau:', error);
            this.showError('Erreur de connexion au serveur');
        }
    }

    renderAlertes() {
        const alertesList = document.querySelector('.alertes-list');
        if (!alertesList) return;

        alertesList.innerHTML = '';

        if (this.alertes.length === 0) {
            alertesList.innerHTML = `
                <div class="no-alerts-message">
                    <div class="no-alerts-icon">
                        <i class="fas fa-leaf"></i>
                        <i class="fas fa-check-circle check-overlay"></i>
                    </div>
                    <h3>Tout va bien !</h3>
                    <p>Aucune alerte n'est actuellement active dans votre système agricole.</p>
                    <p class="no-alerts-subtitle">Vos cultures sont surveillées en continu.</p>
                </div>
            `;
            return;
        }

        this.alertes.forEach(alerte => {
            const alerteElement = this.createAlerteElement(alerte);
            alertesList.appendChild(alerteElement);
        });

        this.applyFilters();
    }

    createAlerteElement(alerte) {
        const div = document.createElement('div');
        div.className = `alerte-card ${alerte.type_alerte} ${alerte.est_resolue ? 'resolved' : ''}`;
        div.dataset.alerteId = alerte.id;

        const timeAgo = this.calculateTimeAgo(alerte.date_creation);
        const urgenceBar = this.createUrgenceBar(alerte.urgence, alerte.est_resolue);

        div.innerHTML = `
            <div class="alerte-icon">
                <i class="fas ${this.getIconClass(alerte.type_alerte, alerte.est_resolue)}"></i>
            </div>
            <div class="alerte-content">
                <div class="alerte-header">
                    <h3>${alerte.titre}</h3>
                    <span class="alerte-time">${timeAgo}</span>
                </div>
                <div class="urgence-display">
                    <span class="urgence-label">Niveau de gravité:</span>
                    <div class="urgence-bar-container">
                        ${urgenceBar}
                    </div>
                    <span class="urgence-text">${alerte.est_resolue ? 'Traitée' : `${alerte.urgence}/5`}</span>
                </div>
                <p class="alerte-description">${alerte.description}</p>
                <div class="alerte-footer">
                    <span class="alerte-location">${alerte.zone || 'Toutes les zones'}</span>
                    ${alerte.est_resolue && alerte.date_resolution ? 
                        `<span class="resolution-time">Traitée le ${new Date(alerte.date_resolution).toLocaleDateString()}</span>` : 
                        ''
                    }
                </div>
                <div class="alerte-actions">
                    ${!alerte.est_resolue ? `
                        <button class="action-btn resolve-btn" onclick="alertesManager.resolveAlerte(${alerte.id})">
                            <i class="fas fa-check"></i> Marquer comme traitée
                        </button>
                    ` : ''}
                    <button class="action-btn delete-btn" onclick="alertesManager.deleteAlerte(${alerte.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;

        return div;
    }

    createUrgenceBar(urgence, isResolved) {
        if (isResolved) {
            urgence = 0; // Les alertes résolues ont une urgence de 0
        }
        
        let bars = '';
        for (let i = 1; i <= 5; i++) {
            const isActive = i <= urgence;
            bars += `<div class="urgence-bar-segment ${isActive ? 'active' : ''}"></div>`;
        }
        return bars;
    }

    getIconClass(type, isResolved) {
        if (isResolved) return 'fa-check-circle';
        
        switch (type) {
            case 'critical': return 'fa-exclamation-circle';
            case 'warning': return 'fa-exclamation-triangle';
            case 'info': return 'fa-info-circle';
            default: return 'fa-info-circle';
        }
    }

    calculateTimeAgo(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 60) {
            return `Il y a ${diffMins} minute${diffMins > 1 ? 's' : ''}`;
        } else if (diffHours < 24) {
            return `Il y a ${diffHours} heure${diffHours > 1 ? 's' : ''}`;
        } else {
            return `Il y a ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
        }
    }

    updateFilters(event) {
        const filterGroup = event.target.closest('.filter-group');
        if (!filterGroup) return;

        const filterType = filterGroup.querySelector('h4').textContent.toLowerCase();
        const label = event.target.parentElement.textContent.trim().toLowerCase();
        
        if (filterType.includes('type')) {
            if (label.includes('critique')) this.filters.types.critical = event.target.checked;
            else if (label.includes('avertissement')) this.filters.types.warning = event.target.checked;
            else if (label.includes('information')) this.filters.types.info = event.target.checked;
        } else if (filterType.includes('zone')) {
            const zoneMatch = label.match(/\d+/);
            if (zoneMatch) {
                const zone = 'zone' + zoneMatch[0];
                this.filters.zones[zone] = event.target.checked;
            }
        }
        
        // Appliquer les filtres immédiatement après la mise à jour
        this.applyFilters();
    }

    applyFilters() {
        const alerteCards = document.querySelectorAll('.alerte-card');
        
        alerteCards.forEach(card => {
            const alerte = this.alertes.find(a => a.id == card.dataset.alerteId);
            if (!alerte) return;

            let shouldShow = true;

            // Filtre par statut (lu/non lu)
            if (alerte.est_resolue) {
                shouldShow = shouldShow && this.filters.status.read;
            } else {
                shouldShow = shouldShow && this.filters.status.unread;
            }

            // Filtre par type
            shouldShow = shouldShow && this.filters.types[alerte.type_alerte];

            // Filtre par zone - CORRECTION PRINCIPALE
            if (alerte.zone) {
                if (alerte.zone.toLowerCase() === 'toutes les zones') {
                    // Pour "Toutes les zones", vérifier si au moins une zone est cochée
                    const hasAnyZoneSelected = Object.values(this.filters.zones).some(zone => zone);
                    shouldShow = shouldShow && hasAnyZoneSelected;
                } else {
                    // Pour les zones spécifiques, extraire le numéro de zone
                    // Gérer différents formats : "Zone 1", "zone 1", "Zone1", etc.
                    const zoneMatch = alerte.zone.toLowerCase().match(/(\d+)/);
                    if (zoneMatch) {
                        const zoneNumber = zoneMatch[1];
                        const zoneKey = 'zone' + zoneNumber;
                        shouldShow = shouldShow && this.filters.zones[zoneKey];
                    } else {
                        // Si aucun numéro trouvé, afficher par défaut
                        shouldShow = true;
                    }
                }
            }

            // Filtre par période
            shouldShow = shouldShow && this.checkPeriod(alerte.date_creation, this.filters.period);

            card.style.display = shouldShow ? 'flex' : 'none';
        });
    }

    checkPeriod(dateString, period) {
        const alerteDate = new Date(dateString);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const thisWeek = new Date(today);
        thisWeek.setDate(today.getDate() - today.getDay());
        const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        switch (period) {
            case 'today':
                return alerteDate >= today;
            case 'week':
                return alerteDate >= thisWeek;
            case 'month':
                return alerteDate >= thisMonth;
            case 'all':
                return true;
            default:
                return true;
        }
    }

    async resolveAlerte(alerteId) {
        try {
            const response = await fetch('/manage_alertes', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCSRFToken()
                },
                body: JSON.stringify({
                    alerte_id: alerteId,
                    est_resolue: true
                })
            });

            const data = await response.json();
            if (data.status === 'success') {
                await this.loadAlertes();
                this.showNotification('Alerte marquée comme résolue', 'success');
            } else {
                this.showNotification('Erreur lors de la résolution de l\'alerte', 'error');
            }
        } catch (error) {
            console.error('Erreur:', error);
            this.showNotification('Erreur réseau', 'error');
        }
    }

    async reopenAlerte(alerteId) {
        try {
            const response = await fetch('/manage_alertes', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCSRFToken()
                },
                body: JSON.stringify({
                    alerte_id: alerteId,
                    est_resolue: false
                })
            });

            const data = await response.json();
            if (data.status === 'success') {
                await this.loadAlertes();
                this.showNotification('Alerte rouverte', 'success');
            } else {
                this.showNotification('Erreur lors de la réouverture de l\'alerte', 'error');
            }
        } catch (error) {
            console.error('Erreur:', error);
            this.showNotification('Erreur réseau', 'error');
        }
    }

    async deleteAlerte(alerteId, showConfirm = true) {
        if (showConfirm && !confirm('Êtes-vous sûr de vouloir supprimer cette alerte ?')) {
            return;
        }

        try {
            const response = await fetch('/manage_alertes', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCSRFToken()
                },
                body: JSON.stringify({
                    alerte_id: alerteId
                })
            });

            const data = await response.json();
            if (data.status === 'success') {
                await this.loadAlertes();
                if (showConfirm) {
                    this.showNotification('Alerte supprimée', 'success');
                }
            } else {
                this.showNotification('Erreur lors de la suppression de l\'alerte', 'error');
            }
        } catch (error) {
            console.error('Erreur:', error);
            this.showNotification('Erreur réseau', 'error');
        }
    }

    async markAllAsRead() {
        const unresolvedAlertes = this.alertes.filter(alerte => !alerte.est_resolue);
        
        for (const alerte of unresolvedAlertes) {
            await this.resolveAlerte(alerte.id);
        }
    }

    async deleteAllAlertes() {
        if (!confirm('Êtes-vous sûr de vouloir supprimer TOUTES les alertes ? Cette action est irréversible.')) {
            return;
        }

        try {
            const response = await fetch('/delete_all_alertes', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCSRFToken()
                }
            });

            const data = await response.json();
            if (data.status === 'success') {
                await this.loadAlertes();
                this.showNotification('Toutes les alertes ont été supprimées', 'success');
            } else {
                this.showNotification('Erreur lors de la suppression des alertes', 'error');
            }
        } catch (error) {
            console.error('Erreur lors de la suppression des alertes:', error);
            this.showNotification('Erreur lors de la suppression', 'error');
        }
    }

    // Générer automatiquement une alerte pour une nouvelle plante
    async generatePlantAlert(plantName, zone) {
        const alerteData = {
            titre: `Nouvelle plante ajoutée - ${plantName}`,
            description: `Félicitations, une nouvelle plante (${plantName}) a été ajoutée dans ${zone}.`,
            type_alerte: 'info',
            urgence: 2,
            zone: zone
        };

        try {
            const response = await fetch('/manage_alertes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCSRFToken()
                },
                body: JSON.stringify(alerteData)
            });

            const data = await response.json();
            if (data.status === 'success') {
                await this.loadAlertes();
                this.showNotification(`Alerte générée pour ${plantName}`, 'info');
            }
        } catch (error) {
            console.error('Erreur lors de la génération de l\'alerte:', error);
        }
    }

    // Générer automatiquement des alertes basées sur les statistiques
    async generateStatAlert(statType, value, threshold, zone) {
        let urgence = 1;
        let type = 'info';
        let titre = '';
        let description = '';

        // Déterminer l'urgence et le type selon l'écart avec le seuil
        const deviation = Math.abs(value - threshold) / threshold;
        
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

        switch(statType) {
            case 'temperature':
                titre = `Température ${value > threshold ? 'élevée' : 'basse'} - ${zone}`;
                description = `La température est de ${value}°C (seuil optimal: ${threshold}°C). ${value > threshold ? 'Risque de stress thermique pour les cultures.' : 'Risque de ralentissement de croissance.'}`;
                break;
            case 'humidity':
                titre = `Humidité ${value > threshold ? 'excessive' : 'faible'} - ${zone}`;
                description = `L'humidité est de ${value}% (seuil optimal: ${threshold}%). ${value > threshold ? 'Risque de maladies fongiques.' : 'Risque de dessèchement des cultures.'}`;
                break;
            case 'ph':
                titre = `pH ${value > threshold ? 'alcalin' : 'acide'} - ${zone}`;
                description = `Le pH du sol est de ${value} (optimal: ${threshold}). Ajustement nécessaire pour optimiser l'absorption des nutriments.`;
                break;
            case 'nutrition':
                titre = `Niveau nutritif ${value > threshold ? 'excessif' : 'insuffisant'} - ${zone}`;
                description = `Le niveau de ${statType} est de ${value} mg/kg (optimal: ${threshold} mg/kg). ${value < threshold ? 'Apport d\'engrais recommandé.' : 'Risque de sur-fertilisation.'}`;
                break;
        }

        const alerteData = {
            titre,
            description,
            type_alerte: type,
            urgence,
            zone
        };

        try {
            const response = await fetch('/manage_alertes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCSRFToken()
                },
                body: JSON.stringify(alerteData)
            });

            const data = await response.json();
            if (data.status === 'success') {
                await this.loadAlertes();
            }
        } catch (error) {
            console.error('Erreur lors de la génération de l\'alerte statistique:', error);
        }
    }



    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="fas ${type === 'success' ? 'fa-check' : type === 'error' ? 'fa-times' : 'fa-info'}"></i>
            <span>${message}</span>
        `;

        const container = document.getElementById('notification-container');
        if (container) {
            container.appendChild(notification);
            
            setTimeout(() => {
                notification.remove();
            }, 3000);
        }
    }

    getCSRFToken() {
        // Essayer plusieurs méthodes pour récupérer le token CSRF
        let token = null;
        
        // Méthode 1: meta tag csrf-token
        const metaToken = document.querySelector('[name=csrf-token]');
        if (metaToken) {
            token = metaToken.getAttribute('content');
        }
        
        // Méthode 2: input hidden dans un formulaire
        if (!token) {
            const hiddenToken = document.querySelector('[name=csrfmiddlewaretoken]');
            if (hiddenToken) {
                token = hiddenToken.value;
            }
        }
        
        // Méthode 3: cookie
        if (!token) {
            const cookies = document.cookie.split(';');
            for (let cookie of cookies) {
                const [name, value] = cookie.trim().split('=');
                if (name === 'csrftoken') {
                    token = value;
                    break;
                }
            }
        }
        
        return token || '';
    }

    showError(message) {
        const alertesList = document.querySelector('.alertes-list');
        if (alertesList) {
            alertesList.innerHTML = `
                <div class="error-message">
                    <div class="error-icon">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <h3>Erreur de chargement</h3>
                    <p>${message}</p>
                    <button class="retry-btn" onclick="alertesManager.loadAlertes()">
                        <i class="fas fa-redo"></i> Réessayer
                    </button>
                </div>
            `;
        }
    }
}

// Initialiser le gestionnaire d'alertes
let alertesManager;
document.addEventListener('DOMContentLoaded', function() {
    alertesManager = new AlertesManager();
    
    // Rendre les fonctions d'alertes globales
    window.generatePlantAlert = (plantName, zone) => {
        if (alertesManager) {
            alertesManager.generatePlantAlert(plantName, zone);
        }
    };
    
    window.generateStatAlert = (statType, value, threshold, zone) => {
        if (alertesManager) {
            alertesManager.generateStatAlert(statType, value, threshold, zone);
        }
    };
    
    window.resolveAlerte = (alerteId) => {
        if (alertesManager) {
            alertesManager.resolveAlerte(alerteId);
        }
    };
    
    window.deleteAlerte = (alerteId, showConfirm = true) => {
        if (alertesManager) {
            alertesManager.deleteAlerte(alerteId, showConfirm);
        }
    };
    
    // Fonction globale pour créer une alerte personnalisée
    window.createCustomAlert = (titre, description, type = 'info', urgence = 1, zone = null) => {
        if (alertesManager) {
            const alerteData = {
                titre: titre,
                description: description,
                type_alerte: type, // 'critical', 'warning', 'info'
                urgence: urgence, // 1-5
                zone: zone
            };
            
            fetch('/manage_alertes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': alertesManager.getCSRFToken()
                },
                body: JSON.stringify(alerteData)
            })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    alertesManager.loadAlertes();
                    alertesManager.showNotification(`Alerte créée: ${titre}`, 'success');
                } else {
                    alertesManager.showError('Erreur lors de la création de l\'alerte');
                }
            })
            .catch(error => {
                console.error('Erreur:', error);
                alertesManager.showError('Erreur lors de la création de l\'alerte');
            });
        }
    };
    
    // Fonction globale pour créer une alerte critique rapide
    window.createCriticalAlert = (titre, description, zone = null) => {
        window.createCustomAlert(titre, description, 'critical', 5, zone);
    };
    
    // Fonction globale pour créer une alerte d'avertissement
    window.createWarningAlert = (titre, description, zone = null) => {
        window.createCustomAlert(titre, description, 'warning', 3, zone);
    };
    
    // Fonction globale pour créer une alerte d'information
    window.createInfoAlert = (titre, description, zone = null) => {
        window.createCustomAlert(titre, description, 'info', 1, zone);
    };
    
    // Fonction globale pour marquer toutes les alertes comme lues
    window.markAllAlertsAsRead = () => {
        if (alertesManager) {
            alertesManager.markAllAsRead();
        }
    };
    
    // Fonction globale pour supprimer toutes les alertes
    window.deleteAllAlerts = () => {
        if (alertesManager) {
            alertesManager.deleteAllAlertes();
        }
    };
    
    // Fonction globale pour rouvrir une alerte
    window.reopenAlerte = (alerteId) => {
        if (alertesManager) {
            alertesManager.reopenAlerte(alerteId);
        }
    };
});
