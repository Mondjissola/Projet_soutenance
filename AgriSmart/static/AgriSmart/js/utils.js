// Fonction utilitaire pour récupérer le nom d'utilisateur en toute sécurité
function getSavedUsername() {
    try {
        const storedData = localStorage.getItem("user-connexion-data");
        if (storedData) {
            const parsedData = JSON.parse(storedData);
            if (parsedData && parsedData.username) {
                return parsedData.username;
            }
        }
        return null;
    } catch (error) {
        console.error("Erreur lors de la lecture du nom d'utilisateur:", error);
        return null;
    }
}

// Fonction utilitaire pour récupérer le mot de passe en toute sécurité
function getSavedPass() {
    try {
        const storedData = localStorage.getItem("user-connexion-data");
        if (storedData) {
            const parsedData = JSON.parse(storedData);
            if (parsedData && parsedData.password) {
                return parsedData.password;
            }
        }
        return null;
    } catch (error) {
        console.error("Erreur lors de la lecture du mot de passe:", error);
        return null;
    }
}

// Fonction pour vérifier si l'utilisateur est connecté
function isUserLoggedIn() {
    return getSavedUsername() !== null;
}

// Fonction pour afficher un message de bienvenue personnalisé
function showWelcomeMessage(message, duration = 3000) {
    const username = getSavedUsername();
    if (username) {
        notifications.success(username + ", " + message, duration);
    } else {
        notifications.success(message, duration);
    }
}

