// Gestionnaire de paramètres utilisateur
class SettingsManager {
    constructor() {
        this.currentUser = null;
        this.originalValues = {};
        this.checkAuthentication();
        this.init();
    }

    // Vérification d'authentification
    checkAuthentication() {
        const userData = localStorage.getItem("user-connexion-data");
        
        if (!userData) {
            window.location.href = "/auth";
            return;
        }

        try {
            const parsedData = JSON.parse(userData);
            if (
                parsedData.username &&
                parsedData.password &&
                typeof parsedData.remember === "boolean"
            ) {
                console.log("Utilisateur authentifié via localStorage");
            } else {
                window.location.href = "/auth";
            }
        } catch (e) {
            window.location.href = "/auth";
        }
    }

    init() {
        this.loadUserData();
        this.updateRememberMeStatus();
        this.loadUserPreferences();
    }

    // Charger les données utilisateur depuis localStorage
    loadUserData() {
        const userData = localStorage.getItem("user-connexion-data");
        if (userData) {
            try {
                this.currentUser = JSON.parse(userData);
                document.getElementById('username-display').textContent = this.currentUser.username;
                document.getElementById('username').value = this.currentUser.username;
                this.originalValues.username = this.currentUser.username;
            } catch (e) {
                console.error('Erreur lors du chargement des données utilisateur:', e);
            }
        }
    }

    // Mettre à jour le statut "Se souvenir de moi"
    updateRememberMeStatus() {
        const statusElement = document.getElementById('remember-status');
        const indicator = statusElement.querySelector('.status-dot');
        const text = statusElement.querySelector('.status-text');
        const clearBtn = document.getElementById('clear-remember-btn');
        const enableBtn = document.getElementById('enable-remember-btn');
        
        if (this.currentUser && this.currentUser.remember) {
            indicator.classList.remove('inactive');
            text.textContent = 'Activé';
            clearBtn.classList.remove('hidden');
            enableBtn.classList.add('hidden');
        } else {
            indicator.classList.add('inactive');
            text.textContent = 'Désactivé';
            clearBtn.classList.add('hidden');
            enableBtn.classList.remove('hidden');
        }
    }

    // Charger les préférences utilisateur
    loadUserPreferences() {
        const preferences = JSON.parse(localStorage.getItem('user-preferences') || '{}');
        
        // Notifications
        document.getElementById('alerts-notifications').checked = preferences.alertsNotifications !== false;
        document.getElementById('plant-notifications').checked = preferences.plantNotifications !== false;
    }

    // Sauvegarder les préférences utilisateur (automatique)
    saveUserPreferences() {
        const preferences = {
            alertsNotifications: document.getElementById('alerts-notifications').checked,
            plantNotifications: document.getElementById('plant-notifications').checked
        };
        
        localStorage.setItem('user-preferences', JSON.stringify(preferences));
        // Sauvegarde automatique sans notification
    }

    // Afficher une notification
    showNotification(message, type = 'info') {
        const container = document.getElementById('notification-container');
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="fas ${this.getNotificationIcon(type)}"></i>
            <span>${message}</span>
        `;

        container.appendChild(notification);

        // Animation d'entrée
        setTimeout(() => notification.classList.add('show'), 100);

        // Suppression automatique après 4 secondes
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => container.removeChild(notification), 300);
        }, 4000);
    }

    getNotificationIcon(type) {
        switch(type) {
            case 'success': return 'fa-check-circle';
            case 'error': return 'fa-exclamation-circle';
            case 'warning': return 'fa-exclamation-triangle';
            default: return 'fa-info-circle';
        }
    }

    // Faire une requête à l'API Django
    async makeRequest(url, method, data = null) {
        try {
            const options = {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCSRFToken()
                }
            };

            if (data) {
                options.body = JSON.stringify(data);
            }

            const response = await fetch(url, options);
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Erreur serveur');
            }

            return result;
        } catch (error) {
            console.error('Erreur API:', error);
            throw error;
        }
    }

    getCSRFToken() {
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'csrftoken') {
                return value;
            }
        }
        return '';
    }
}

// Instance globale
const settingsManager = new SettingsManager();

// Fonctions d'édition du nom d'utilisateur
function editUsername() {
    const input = document.getElementById('username');
    const saveBtn = document.getElementById('save-username');
    const cancelBtn = document.getElementById('cancel-username');
    const editBtn = document.querySelector('.btn-edit');

    input.disabled = false;
    input.focus();
    saveBtn.classList.remove('hidden');
    cancelBtn.classList.remove('hidden');
    editBtn.classList.add('hidden');
}

async function saveUsername() {
    const newUsername = document.getElementById('username').value.trim();
    
    if (!newUsername) {
        settingsManager.showNotification('Le nom d\'utilisateur ne peut pas être vide', 'error');
        return;
    }

    if (newUsername === settingsManager.originalValues.username) {
        cancelEditUsername();
        return;
    }

    try {
        await settingsManager.makeRequest('/update_username', 'POST', {
            newUsername: newUsername,
            currentUsername: settingsManager.currentUser.username,
            currentPassword: settingsManager.currentUser.password
        });

        // Mettre à jour les données locales
        settingsManager.currentUser.username = newUsername;
        localStorage.setItem('user-connexion-data', JSON.stringify(settingsManager.currentUser));
        
        document.getElementById('username-display').textContent = newUsername;
        settingsManager.originalValues.username = newUsername;
        
        settingsManager.showNotification('Nom d\'utilisateur mis à jour avec succès', 'success');
        cancelEditUsername();
    } catch (error) {
        settingsManager.showNotification(error.message, 'error');
    }
}

function cancelEditUsername() {
    const input = document.getElementById('username');
    const saveBtn = document.getElementById('save-username');
    const cancelBtn = document.getElementById('cancel-username');
    const editBtn = document.querySelector('.btn-edit');

    input.value = settingsManager.originalValues.username;
    input.disabled = true;
    saveBtn.classList.add('hidden');
    cancelBtn.classList.add('hidden');
    editBtn.classList.remove('hidden');
}

// Fonctions de gestion du mot de passe
function editPassword() {
    const form = document.getElementById('password-form');
    form.classList.remove('hidden');
}

async function savePassword() {
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    if (!currentPassword || !newPassword || !confirmPassword) {
        settingsManager.showNotification('Tous les champs sont requis', 'error');
        return;
    }

    if (newPassword !== confirmPassword) {
        settingsManager.showNotification('Les nouveaux mots de passe ne correspondent pas', 'error');
        return;
    }

    if (newPassword.length < 6) {
        settingsManager.showNotification('Le mot de passe doit contenir au moins 6 caractères', 'error');
        return;
    }

    try {
        await settingsManager.makeRequest('/update_password', 'POST', {
            currentPassword: currentPassword,
            newPassword: newPassword,
            currentUsername: settingsManager.currentUser.username
        });

        // Mettre à jour les données locales
        settingsManager.currentUser.password = newPassword;
        localStorage.setItem('user-connexion-data', JSON.stringify(settingsManager.currentUser));
        
        settingsManager.showNotification('Mot de passe mis à jour avec succès', 'success');
        cancelEditPassword();
    } catch (error) {
        settingsManager.showNotification(error.message, 'error');
    }
}

function cancelEditPassword() {
    const form = document.getElementById('password-form');
    form.classList.add('hidden');
    
    // Vider les champs
    document.getElementById('current-password').value = '';
    document.getElementById('new-password').value = '';
    document.getElementById('confirm-password').value = '';
}

// Fonction pour basculer la visibilité des mots de passe
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const icon = input.parentElement.querySelector('.input-icon i');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

// Fonction pour supprimer "Se souvenir de moi"
function clearRememberMe() {
    showModal(
        'Supprimer la connexion automatique',
        'Êtes-vous sûr de vouloir supprimer la connexion automatique ? Vous devrez vous reconnecter manuellement la prochaine fois.',
        () => {
            if (settingsManager.currentUser) {
                settingsManager.currentUser.remember = false;
                localStorage.setItem('user-connexion-data', JSON.stringify(settingsManager.currentUser));
                settingsManager.updateRememberMeStatus();
                settingsManager.showNotification('Connexion automatique désactivée', 'success');
            }
        }
    );
}

// Fonction pour réactiver "Se souvenir de moi"
function enableRememberMe() {
    if (settingsManager.currentUser) {
        settingsManager.currentUser.remember = true;
        localStorage.setItem('user-connexion-data', JSON.stringify(settingsManager.currentUser));
        settingsManager.updateRememberMeStatus();
        settingsManager.showNotification('Connexion automatique réactivée', 'success');
    }
}

// Fonction supprimée - plus de changement de thème

// Fonction pour supprimer le compte
function deleteAccount() {
    showModal(
        'Supprimer le compte',
        'Cette action est irréversible. Toutes vos données seront supprimées définitivement. Êtes-vous absolument sûr ?',
        async () => {
            try {
                await settingsManager.makeRequest('/delete_account', 'DELETE');
                
                // Supprimer toutes les données locales
                localStorage.removeItem('user-connexion-data');
                localStorage.removeItem('user-preferences');
                
                settingsManager.showNotification('Compte supprimé avec succès', 'success');
                
                // Rediriger vers la page de connexion après 2 secondes
                setTimeout(() => {
                    window.location.href = '/auth';
                }, 2000);
            } catch (error) {
                settingsManager.showNotification(error.message, 'error');
            }
        }
    );
}

// Fonction supprimée - sauvegarde automatique

// Fonctions de gestion du modal
function showModal(title, message, confirmCallback) {
    const modal = document.getElementById('confirmModal');
    const titleElement = document.getElementById('modal-title');
    const messageElement = document.getElementById('modal-message');
    const confirmBtn = document.getElementById('confirm-action');

    titleElement.textContent = title;
    messageElement.textContent = message;
    
    // Retirer les anciens écouteurs d'événements
    confirmBtn.replaceWith(confirmBtn.cloneNode(true));
    const newConfirmBtn = document.getElementById('confirm-action');
    
    newConfirmBtn.addEventListener('click', () => {
        confirmCallback();
        closeModal();
    });

    modal.classList.add('show');
}

function closeModal() {
    const modal = document.getElementById('confirmModal');
    modal.classList.remove('show');
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Fermeture du modal en cliquant à l'extérieur
    document.getElementById('confirmModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            closeModal();
        }
    });

    // Sauvegarder les préférences lorsque les toggles changent
    document.getElementById('alerts-notifications').addEventListener('change', () => {
        settingsManager.saveUserPreferences();
    });

    document.getElementById('plant-notifications').addEventListener('change', () => {
        settingsManager.saveUserPreferences();
    });

    // Sauvegarder automatiquement le thème quand il change
    document.querySelectorAll('input[name="theme"]').forEach(input => {
        input.addEventListener('change', (e) => {
            setTheme(e.target.value);
        });
    });

    // Entrée pour sauvegarder le nom d'utilisateur
    document.getElementById('username').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveUsername();
        }
        if (e.key === 'Escape') {
            cancelEditUsername();
        }
    });

    // Validation en temps réel du mot de passe
    document.getElementById('new-password').addEventListener('input', (e) => {
        const password = e.target.value;
        const confirmInput = document.getElementById('confirm-password');
        
        if (password.length > 0 && password.length < 6) {
            e.target.style.borderColor = '#e74c3c';
        } else {
            e.target.style.borderColor = '#e9ecef';
        }
        
        // Vérifier la correspondance si le champ de confirmation n'est pas vide
        if (confirmInput.value && password !== confirmInput.value) {
            confirmInput.style.borderColor = '#e74c3c';
        } else if (confirmInput.value) {
            confirmInput.style.borderColor = '#27ae60';
        }
    });

    document.getElementById('confirm-password').addEventListener('input', (e) => {
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = e.target.value;
        
        if (confirmPassword && newPassword !== confirmPassword) {
            e.target.style.borderColor = '#e74c3c';
        } else if (confirmPassword) {
            e.target.style.borderColor = '#27ae60';
        } else {
            e.target.style.borderColor = '#e9ecef';
        }
    });

    console.log('✅ Gestionnaire de paramètres initialisé');
});
