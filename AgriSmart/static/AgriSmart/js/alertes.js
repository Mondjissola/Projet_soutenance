document.addEventListener('DOMContentLoaded', function() {
    console.log("Page alertes chargée, initialisation...");

    // Gestion des filtres
    const filterCheckboxes = document.querySelectorAll('.checkbox-container input');
    const periodSelect = document.querySelector('.period-select');
    const alertesList = document.querySelector('.alertes-list');
    const filterBtn = document.querySelector('.mobile-filter-btn');
    const alertesSidebar = document.querySelector('.alertes-sidebar');
    const markAllReadBtn = document.querySelector('.mark-all-read');

    // Vérification des éléments trouvés
    console.log("Éléments trouvés:", {
        filterCheckboxes: filterCheckboxes.length,
        periodSelect: !!periodSelect,
        alertesList: !!alertesList,
        filterBtn: !!filterBtn,
        alertesSidebar: !!alertesSidebar,
        markAllReadBtn: !!markAllReadBtn
    });

    // État des filtres
    let filters = {
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
        period: 'today'
    };

    // Mettre à jour les filtres lors du changement des checkboxes
    if (filterCheckboxes.length > 0) {
        filterCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const filterGroup = e.target.closest('.filter-group');
                if (!filterGroup) return;

                const filterType = filterGroup.querySelector('h4').textContent.toLowerCase();
                const label = e.target.parentElement.textContent.trim().toLowerCase();
                
                if (filterType.includes('type')) {
                    if (label.includes('critique')) filters.types.critical = e.target.checked;
                    else if (label.includes('avertissement')) filters.types.warning = e.target.checked;
                    else if (label.includes('information')) filters.types.info = e.target.checked;
                } else if (filterType.includes('zone')) {
                    const zone = 'zone' + label.match(/\d+/)[0];
                    filters.zones[zone] = e.target.checked;
                }
                
                applyFilters();
            });
        });
    }

    // Mettre à jour le filtre de période
    if (periodSelect) {
        periodSelect.addEventListener('change', (e) => {
            filters.period = e.target.value;
            applyFilters();
        });
    }

    // Gestion du bouton de filtre mobile
    if (filterBtn && alertesSidebar) {
        filterBtn.addEventListener('click', () => {
            alertesSidebar.classList.toggle('active');
        });
    }

    // Gestion du bouton "Tout marquer comme lu"
    if (markAllReadBtn) {
        markAllReadBtn.addEventListener('click', () => {
            const alertes = document.querySelectorAll('.alerte-card:not(.resolved)');
            alertes.forEach(alerte => {
                resolveAlerte(alerte);
            });
        });
    }

    // Gestion des boutons d'action individuels
    document.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const alerteCard = e.target.closest('.alerte-card');
            if (alerteCard) {
                resolveAlerte(alerteCard);
            }
        });
    });

    // Appliquer les filtres
    function applyFilters() {
        console.log("Application des filtres:", filters);
        const alertes = document.querySelectorAll('.alerte-card');
        
        alertes.forEach(alerte => {
            let shouldShow = true;
            
            // Vérifier le type d'alerte
            if (alerte.classList.contains('critical')) {
                shouldShow = shouldShow && filters.types.critical;
            } else if (alerte.classList.contains('warning')) {
                shouldShow = shouldShow && filters.types.warning;
            } else if (alerte.classList.contains('info')) {
                shouldShow = shouldShow && filters.types.info;
            }
            
            // Vérifier la zone
            const locationElement = alerte.querySelector('.alerte-location');
            if (locationElement) {
                const zoneText = locationElement.textContent.toLowerCase();
                if (zoneText !== 'toutes les zones') {
                    const zoneMatch = zoneText.match(/zone (\d+)/i);
                    if (zoneMatch) {
                        const zone = 'zone' + zoneMatch[1];
                        shouldShow = shouldShow && filters.zones[zone];
                    }
                }
            }
            
            // Vérifier la période
            const timeElement = alerte.querySelector('.alerte-time');
            if (timeElement) {
                shouldShow = shouldShow && checkPeriod(timeElement.textContent, filters.period);
            }
            
            // Afficher ou masquer l'alerte
            alerte.style.display = shouldShow ? 'flex' : 'none';
        });
    }

    // Vérifier si une alerte correspond à la période sélectionnée
    function checkPeriod(timeString, period) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const thisWeek = new Date(today);
        thisWeek.setDate(today.getDate() - today.getDay());
        const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        
        // Convertir la chaîne de temps en timestamp approximatif
        let timestamp;
        if (timeString.includes('minute')) {
            const minutes = parseInt(timeString.match(/\d+/)[0]);
            timestamp = new Date(now - minutes * 60000);
        } else if (timeString.includes('heure')) {
            const hours = parseInt(timeString.match(/\d+/)[0]);
            timestamp = new Date(now - hours * 3600000);
        } else if (timeString.includes('Hier')) {
            timestamp = new Date(now - 86400000);
        } else {
            return true; // Pour les autres cas, toujours afficher
        }
        
        switch (period) {
            case 'today':
                return timestamp >= today;
            case 'week':
                return timestamp >= thisWeek;
            case 'month':
                return timestamp >= thisMonth;
            default:
                return true;
        }
    }

    // Fonction pour résoudre une alerte
    function resolveAlerte(alerteCard) {
        if (!alerteCard) return;

        console.log("Résolution de l'alerte:", alerteCard);
        
        // Ajouter une animation de disparition
        alerteCard.style.transition = 'all 0.3s ease';
        alerteCard.style.opacity = '0';
        alerteCard.style.transform = 'translateX(20px)';
        
        // Attendre la fin de l'animation avant de modifier/supprimer l'alerte
        setTimeout(() => {
            if (alerteCard.classList.contains('info')) {
                // Pour les alertes info, simplement les supprimer
                alerteCard.remove();
            } else {
                // Pour les autres alertes, les marquer comme résolues
                alerteCard.className = 'alerte-card resolved';
                alerteCard.style.opacity = '1';
                alerteCard.style.transform = 'translateX(0)';
                
                // Mettre à jour l'icône et le contenu
                const icon = alerteCard.querySelector('.alerte-icon i');
                if (icon) {
                    icon.className = 'fas fa-check-circle';
                }
                
                // Mettre à jour le footer
                const footer = alerteCard.querySelector('.alerte-footer');
                const timeElement = alerteCard.querySelector('.alerte-time');
                const locationElement = alerteCard.querySelector('.alerte-location');
                
                if (footer && timeElement && locationElement) {
                    const timeElapsed = calculateTimeElapsed(timeElement.textContent);
                    footer.innerHTML = `
                        <span class="alerte-location">${locationElement.textContent}</span>
                        <span class="resolution-time">Résolu en ${timeElapsed}</span>
                    `;
                }
            }
        }, 300);
    }

    // Calculer le temps écoulé pour la résolution
    function calculateTimeElapsed(timeString) {
        if (timeString.includes('minute')) {
            const minutes = parseInt(timeString.match(/\d+/)[0]);
            return `${minutes} minutes`;
        } else if (timeString.includes('heure')) {
            const hours = parseInt(timeString.match(/\d+/)[0]);
            return `${hours} heures`;
        } else {
            return '1 jour';
        }
    }

    // Appliquer les filtres initiaux
    applyFilters();
}); 