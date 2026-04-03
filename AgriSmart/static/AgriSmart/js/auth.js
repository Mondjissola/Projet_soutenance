// CRSF token pour donner un argument lors du fetch et empecher le piratage par middle
const csrftoken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');

// Récupération des données de connexion stockées localement
try {
    const localStoredData = localStorage.getItem("user-connexion-data");
    if (localStoredData) {
        const parsedData = JSON.parse(localStoredData);
        if (parsedData && parsedData.username && parsedData.password) {
            // Remplir les champs
            document.getElementById('login-username').value = parsedData.username;
            document.getElementById('login-password').value = parsedData.password;
            // Cocher la case "Se souvenir de moi"
            document.querySelector('.remember-me input[type="checkbox"]').checked = true;
            console.log(parsedData.username);
            // Afficher la notification
            setTimeout(() => {
                notifications.info(`Bienvenue de nouveau ${parsedData.username}, cliquez sur "Se connecter" pour vous connecter`, 7000);
            }, 500);
        }
    }
} catch (error) {
    console.error("Erreur lors de la récupération des données stockées:", error);
    localStorage.removeItem("user-connexion-data"); // Nettoyer les données corrompues
}

// Récupération des onglets et formulaires dès le début
const loginTab = document.getElementById('loginTab');
const registerTab = document.getElementById('registerTab');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

// Fonction pour afficher le formulaire de connexion
function showLoginForm() {
    loginForm.classList.add('active');
    registerForm.classList.remove('active');
    loginTab.classList.add('active');
    registerTab.classList.remove('active');
}

// Fonction pour afficher le formulaire d'inscription
function showRegisterForm() {
    loginForm.classList.remove('active');
    registerForm.classList.add('active');
    registerTab.classList.add('active');
    loginTab.classList.remove('active');
}

// Gestion des clics sur les onglets
loginTab.addEventListener('click', function (e) {
    e.preventDefault();
    showLoginForm();
});

registerTab.addEventListener('click', function (e) {
    e.preventDefault();
    showRegisterForm();
});

// Affichage initial : Formulaire de connexion actif
showLoginForm();

// Gestion des boutons "Afficher/Masquer mot de passe"
document.querySelectorAll('.toggle-password').forEach(button => {
    button.addEventListener('click', function () {
        const input = this.previousElementSibling;
        const icon = this.querySelector('i');

        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.replace('fa-eye', 'fa-eye-slash');
        } else {
            input.type = 'password';
            icon.classList.replace('fa-eye-slash', 'fa-eye');
        }
    });
});

// Validation des formulaires
class FormValidator {
    constructor(form) {
        this.form = form;
        this.inputs = form.querySelectorAll('input');
        this.submitButton = form.querySelector('.submit-btn');
        this.setupValidation();
    }

    setupValidation() {
        // Validation en temps réel
        this.inputs.forEach(input => {
            if (input.type !== 'checkbox') {
                input.addEventListener('input', () => this.validateInput(input));
                input.addEventListener('blur', () => this.validateInput(input));
            }
        });

        // Soumission du formulaire
        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            if (this.validateForm()) {
                this.handleSubmit();
            }
        });
    }

    validateInput(input) {
        const inputGroup = input.closest('.input-group');
        const errorElement = this.getErrorElement(input); // Doit retourner un élément valide

        if (!inputGroup || !errorElement) {
            console.warn("Structure manquante pour l'input : ", input);
            return false;
        }

        let isValid = true;
        let errorMessage = '';

        switch (true) {
            case input.id === 'login-username' || input.id === 'register-username':
                if (input.value.length < 3) {
                    isValid = false;
                    errorMessage = "Le nom d'utilisateur doit contenir au moins 3 caractères";
                }
                break;

            case input.id === 'register-email':
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(input.value)) {
                    isValid = false;
                    errorMessage = "Veuillez entrer une adresse email valide";
                }
                break;

            case input.id === 'login-password' || input.id === 'register-password':
                const password = input.value;
                const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[\W_]).{8,}$/;
                if (!passwordRegex.test(password)) {
                    isValid = false;
                    errorMessage = "Le mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule et un caractère spécial.";
                }
                break;

            case input.id === 'register-password-confirm':
                const originalPassword = document.getElementById('register-password').value;
                if (input.value !== originalPassword) {
                    isValid = false;
                    errorMessage = "Les mots de passe ne correspondent pas";
                }
                break;
        }

        if (isValid) {
            inputGroup.classList.remove('error');
            inputGroup.classList.add('success');
            errorElement.classList.remove('visible');
            errorElement.textContent = '';
        } else {
            inputGroup.classList.remove('success');
            inputGroup.classList.add('error');
            errorElement.textContent = errorMessage;
            errorElement.classList.add('visible');
        }

        return isValid;
    }

    validateForm() {
        let isValid = true;
        this.inputs.forEach(input => {
            if (input.type === 'checkbox') return;
            if (!this.validateInput(input)) {
                isValid = false;
            }
        });
        return isValid;
    }

    getErrorElement(input) {
        const formGroup = input.closest('.form-group');

        if (!formGroup) {
            console.warn('Aucun .form-group trouvé pour :', input);
            return null;
        }

        let errorElement = formGroup.querySelector('.error-message');

        if (!errorElement) {
            errorElement = document.createElement('div');
            errorElement.className = 'error-message';
            formGroup.appendChild(errorElement);
        }

        return errorElement;
    }

    fetchFunction(url, data = null) {
        const options = {
            method: data ? 'POST' : 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrftoken,
            }
        };

        if (data) {
            options.body = JSON.stringify(data);
        }
        return fetch(url, options)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Erreur HTTP : ${response.status}`);
                }
                return response.json();
            })
            .then(jsonData => {
                return jsonData;
            })
            .catch(error => {
                console.error('Erreur lors du fetch :', error.message);
                return { error: true, message: error.message };
            });
    }

    handleSubmit() {
        const formData = new FormData(this.form);
        const data = Object.fromEntries(formData.entries());

        // Déterminer s'il s'agit du formulaire d'inscription
        const isRegisterForm = this.form.id === "registerForm";

        // Construire l'objet à envoyer
        let donnee = {};

        if (isRegisterForm) {
            donnee = {
                username: data.username,
                email: data.email,
                password: data.password,
                confirm_password: data.confirm_password,
                terms_accepted: this.form.querySelector('[type="checkbox"]').checked
            };
        } else {
            donnee = {
                username: this.form.querySelector('#login-username').value,
                password: this.form.querySelector('#login-password').value,
                remember: this.form.querySelector('.remember-me input[type="checkbox"]').checked
            };
        }

        // Activer l'animation du bouton
        this.submitButton.classList.add('loading');

        // Envoi des données via fetch
        this.fetchFunction(infoLoaded.auth, donnee)
            .then(response => {
                console.log('Réponse', response);
                if (response.status === 'success') {
                    // Stocker les données dans le localStorage uniquement si la connexion est réussie et "Se souvenir de moi" est coché
                    if (isRegisterForm || donnee.remember) {
                        localStorage.setItem("user-connexion-data", JSON.stringify({
                            username: donnee.username,
                            password: donnee.password,
                            remember: true
                        }));
                    }
                    notifications.success("Bienvenue " + response.message, 3000);
                    setTimeout(() => {
                        window.location.href = '/';
                    }, 3500);
                } else {
                    notifications.error(response.message, 3500);
                }
            });
    }
}

new FormValidator(loginForm);
new FormValidator(registerForm);