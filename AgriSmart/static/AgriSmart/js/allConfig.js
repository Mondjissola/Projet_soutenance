// ===== CONFIGURATION GLOBALE DU PROJET =====
window.AgriSmartConfig = {
    // Configuration du serveur de données
    SERVER_URL: 'http://127.0.0.1:8000',
    
    // Configuration de la connexion aux capteurs
    CONNECTION: {
        MAX_FAILED_ATTEMPTS: 3,
        FETCH_INTERVAL: 3000, // 3 secondes
        TIMEOUT: 5000 // 5 secondes
    },
    
    // Configuration des endpoints API
    ENDPOINTS: {
        SENSOR_DATA: '/api/sensor-data/',
        SOIL_HUMIDITY: '/api/soil-humidity/',
        TEMPERATURE: '/api/temperature/',
        AIR_HUMIDITY: '/api/air-humidity/',
        SOIL_PH: '/api/soil-ph/',
        NPK: '/api/npk/'
    },
    
    // Configuration des seuils d'alerte
    THRESHOLDS: {
        SOIL_HUMIDITY: { critical: 30, warning: 50 },
        TEMPERATURE: { critical_min: 18, critical_max: 25, warning_min: 15, warning_max: 30 },
        AIR_HUMIDITY: { critical_min: 30, critical_max: 80, warning_min: 40, warning_max: 70 },
        SOIL_PH: { critical_min: 5.5, critical_max: 8.0, warning_min: 6.0, warning_max: 7.5 }
    }
};

// ===== FONCTIONS UTILITAIRES =====
function toggleMenu() {
  const navLinks = document.querySelector('.nav-links');
  const icon = document.getElementById('menu-icon');

  // Bascule le menu
  navLinks.classList.toggle('active');

  // Animation + changement d'icône
  if (icon.classList.contains('fa-bars')) {
    icon.classList.remove('fa-bars');
    icon.classList.add('fa-xmark');

    // Applique l'animation d'ouverture
    icon.classList.remove('menu-anim-close');
    icon.classList.add('menu-anim-open');

  } else {
    icon.classList.remove('fa-xmark');
    icon.classList.add('fa-bars');

    // Applique l'animation de fermeture
    icon.classList.remove('menu-anim-open');
    icon.classList.add('menu-anim-close');
  }
}

// Fermer le menu et réinitialiser l'icône après un clic sur un lien
document.querySelectorAll('.nav-links a').forEach(link => {
  link.addEventListener('click', () => {
    document.querySelector('.nav-links').classList.remove('active');
    const icon = document.getElementById('menu-icon');
    icon.classList.remove('fa-xmark', 'menu-anim-open');
    icon.classList.add('fa-bars', 'menu-anim-close');
  });
});

const elements = document.querySelectorAll('.animate-on-scroll');

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
});

elements.forEach(el => observer.observe(el));

