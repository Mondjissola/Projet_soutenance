class NotificationManager {
    constructor() {
        this.container = this.createContainer();
    }

    createContainer() {
        const container = document.createElement('div');
        container.id = 'notification-container';
        container.style.cssText = `
            max-width: 90%;
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
        `;

        // Ajouter les styles d'animation
        const styleSheet = document.createElement('style');
        styleSheet.textContent = `
            @keyframes notification-glow {
                from {
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
                }
                to {
                    box-shadow: 0 8px 32px rgba(255, 255, 255, 0.2);
                }
            }
            .notification:hover .notification-icon {
                transform: scale(1.1) rotate(5deg);
            }
            .notification:hover {
                transform: translateX(0) scale(1.02) !important;
            }
        `;
        document.head.appendChild(styleSheet);
        document.body.appendChild(container);
        return container;
    }

    show(message, type = 'success', duration = 5000) {
        const notification = document.createElement('div');
        const iconMap = {
            success: '<i class="fas fa-check-circle"></i>',
            error: '<i class="fas fa-times-circle"></i>',
            info: '<i class="fas fa-info-circle"></i>'
        };
        const colorMap = {
            success: 'linear-gradient(135deg, rgba(40, 167, 69, 0.95), rgba(32, 201, 151, 0.9), rgba(40, 167, 69, 0.95))',
            error: 'linear-gradient(135deg, rgba(220, 53, 69, 0.95), rgba(247, 37, 133, 0.9), rgba(220, 53, 69, 0.95))',
            info: 'linear-gradient(135deg, rgba(13, 202, 240, 0.95), rgba(13, 110, 253, 0.9), rgba(13, 202, 240, 0.95))'
        };

        notification.className = `notification notification-${type}`;
        notification.style.cssText = `
            padding: 16px 20px;
            margin-bottom: 12px;
            min-width: 320px;
            max-width: 450px;
            background: ${colorMap[type]};
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.3);
            display: flex;
            align-items: center;
            transform: translateX(120%);
            transition: all 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
            position: relative;
            overflow: hidden;
            animation: notification-glow 2s ease-in-out infinite alternate;
        `;

        // Icon
        const icon = document.createElement('div');
        icon.className = 'notification-icon';
        icon.style.cssText = `
            width: 36px;
            height: 36px;
            border-radius: 50%;
            padding: 5px 10px;
            background: rgba(255, 255, 255, 0.25);
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: 15px;
            font-size: 18px;
            color: white;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            transition: transform 0.3s ease;
        `;
        icon.innerHTML = iconMap[type];

        // Message
        const messageDiv = document.createElement('div');
        messageDiv.className = 'notification-message';
        messageDiv.style.cssText = `
            color: white;
            font-size: 14.5px;
            flex-grow: 1;
            font-weight: 500;
            font-family: 'Poppins', sans-serif;
            letter-spacing: 0.3px;
            line-height: 1.4;
            text-shadow: 0 1px 2px rgba(0,0,0,0.1);
        `;
        messageDiv.textContent = message;

        // Bouton de fermeture
        const closeButton = document.createElement('div');
        closeButton.className = 'notification-close';
        closeButton.innerHTML = '<i class="fas fa-times"></i>';
        closeButton.style.cssText = `
            cursor: pointer;
            color: rgba(163, 18, 18, 0.91);
            padding: 20px;
            border: 1px solid rgba(255, 255, 255, 0.96);
            box-shadow: 0 2px 5px rgba(250, 250, 250, 0.67);
            margin-left: 10px;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            background: rgba(243, 243, 243, 0.97);
            transform: scale(.7);
        `;
        closeButton.addEventListener('mouseover', () => {
            closeButton.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
            closeButton.style.color = 'white';
            closeButton.style.transform = 'scale(1.1)';
        });
        closeButton.addEventListener('mouseout', () => {
            closeButton.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            closeButton.style.color = 'rgba(255, 255, 255, 0.8)';
            closeButton.style.transform = 'scale(1)';
        });
        closeButton.addEventListener('click', () => {
            notification.style.transform = 'translateX(120%)';
            setTimeout(() => {
                this.container.removeChild(notification);
            }, 500);
        });

        // Progress bar
        const progressBar = document.createElement('div');
        progressBar.className = 'notification-progress';
        progressBar.style.cssText = `
            position: absolute;
            bottom: 0;
            left: 0;
            width: 100%;
            height: 3px;
            background: rgba(255, 255, 255, 0.3);
            transform-origin: left;
        `;

        const progressInner = document.createElement('div');
        progressInner.style.cssText = `
            height: 100%;
            width: 100%;
            background: rgba(255, 255, 255, 0.7);
            transform-origin: left;
            transition: transform ${duration}ms linear;
        `;
        progressBar.appendChild(progressInner);

        // Assemble notification
        notification.appendChild(icon);
        notification.appendChild(messageDiv);
        notification.appendChild(closeButton);
        notification.appendChild(progressBar);
        this.container.appendChild(notification);

        // Animate in
        requestAnimationFrame(() => {
            notification.style.transform = 'translateX(0)';
            progressInner.style.transform = 'scaleX(0)';
        });

        // Remove after duration
        setTimeout(() => {
            notification.style.transform = 'translateX(120%)';
            setTimeout(() => {
                this.container.removeChild(notification);
            }, 500);
        }, duration);
    }

    success(message, duration = 5000) {
        this.show(message, 'success', duration);
    }

    error(message, duration = 5000) {
        this.show(message, 'error', duration);
    }

    info(message, duration = 5000) {
        this.show(message, 'info', duration);
    }
}

// Create global instance
const notifications = new NotificationManager(); 