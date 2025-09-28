// Login page functionality - Uses AuthManager for secure authentication
class LoginManager {
    constructor() {
        this.form = null;
        this.submitButton = null;
        this.init();
    }

    init() {
        document.addEventListener('DOMContentLoaded', () => {
            this.form = document.getElementById('loginForm');
            this.submitButton = this.form?.querySelector('button[type="submit"]');
            
            if (this.form) {
                this.setupEventListeners();
                this.checkExistingAuth();
                this.handleRedirectParam();
            }
        });
    }

    async checkExistingAuth() {
        // Check if user is already authenticated
        const authResult = await window.authManager.checkAuth();
        if (authResult.success) {
            // Redirect authenticated users
            this.redirectAfterLogin();
        }
    }

    handleRedirectParam() {
        // Handle redirect parameter from URL
        const urlParams = new URLSearchParams(window.location.search);
        const redirectUrl = urlParams.get('redirect');
        if (redirectUrl) {
            // Store redirect URL for after login
            sessionStorage.setItem('loginRedirect', redirectUrl);
        }
    }

    setupEventListeners() {
        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        // Add real-time validation
        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');

        if (emailInput) {
            emailInput.addEventListener('blur', () => {
                this.validateEmail(emailInput.value);
            });
        }

        if (passwordInput) {
            passwordInput.addEventListener('input', () => {
                this.clearError();
            });
        }
    }

    async handleLogin() {
        try {
            this.setLoading(true);
            this.clearError();

            const formData = new FormData(this.form);
            const email = formData.get('email');
            const password = formData.get('password');

            // Basic validation
            if (!this.validateForm(email, password)) {
                this.setLoading(false);
                return;
            }

            // Attempt login
            const result = await window.authManager.login(email, password);

            if (result.success) {
                this.showSuccess('Login successful! Redirecting...');
                
                // Small delay for user feedback
                setTimeout(() => {
                    this.redirectAfterLogin();
                }, 1000);
            } else {
                this.showError(result.error || 'Login failed. Please check your credentials.');
                this.setLoading(false);
            }

        } catch (error) {
            console.error('Login error:', error);
            this.showError('Login failed. Please try again.');
            this.setLoading(false);
        }
    }

    validateForm(email, password) {
        if (!email) {
            this.showError('Email address is required');
            document.getElementById('email')?.focus();
            return false;
        }

        if (!this.isValidEmail(email)) {
            this.showError('Please enter a valid email address');
            document.getElementById('email')?.focus();
            return false;
        }

        if (!password) {
            this.showError('Password is required');
            document.getElementById('password')?.focus();
            return false;
        }

        if (password.length < 6) {
            this.showError('Password must be at least 6 characters long');
            document.getElementById('password')?.focus();
            return false;
        }

        return true;
    }

    validateEmail(email) {
        if (email && !this.isValidEmail(email)) {
            this.showError('Please enter a valid email address');
            return false;
        }
        this.clearError();
        return true;
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    redirectAfterLogin() {
        // Check for stored redirect URL
        const redirectUrl = sessionStorage.getItem('loginRedirect');
        if (redirectUrl) {
            sessionStorage.removeItem('loginRedirect');
            window.location.href = redirectUrl;
            return;
        }

        // Default redirect based on user role
        const user = window.authManager.user;
        if (user?.profile?.user_type === 'admin') {
            window.location.href = 'department.html';
        } else {
            window.location.href = 'dashboard.html';
        }
    }

    setLoading(loading) {
        if (!this.submitButton) return;

        if (loading) {
            this.submitButton.disabled = true;
            this.submitButton.innerHTML = `
                <span style="display: inline-flex; align-items: center; gap: 8px;">
                    <span class="spinner"></span>
                    Signing In...
                </span>
            `;
        } else {
            this.submitButton.disabled = false;
            this.submitButton.innerHTML = 'Sign In';
        }
    }

    showError(message) {
        this.clearMessages();
        
        const errorDiv = document.createElement('div');
        errorDiv.id = 'login-error';
        errorDiv.className = 'error-message';
        errorDiv.style.cssText = `
            background: #fee;
            color: #c33;
            padding: 12px 16px;
            border-radius: 6px;
            margin-bottom: 16px;
            border: 1px solid #fcc;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 8px;
        `;
        errorDiv.innerHTML = `
            <span style="font-size: 16px;">⚠️</span>
            <span>${this.escapeHtml(message)}</span>
        `;

        this.form.insertBefore(errorDiv, this.form.firstChild);
    }

    showSuccess(message) {
        this.clearMessages();
        
        const successDiv = document.createElement('div');
        successDiv.id = 'login-success';
        successDiv.className = 'success-message';
        successDiv.style.cssText = `
            background: #efe;
            color: #363;
            padding: 12px 16px;
            border-radius: 6px;
            margin-bottom: 16px;
            border: 1px solid #cfc;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 8px;
        `;
        successDiv.innerHTML = `
            <span style="font-size: 16px;">✅</span>
            <span>${this.escapeHtml(message)}</span>
        `;

        this.form.insertBefore(successDiv, this.form.firstChild);
    }

    clearError() {
        const errorDiv = document.getElementById('login-error');
        if (errorDiv) {
            errorDiv.remove();
        }
    }

    clearMessages() {
        const errorDiv = document.getElementById('login-error');
        const successDiv = document.getElementById('login-success');
        
        if (errorDiv) errorDiv.remove();
        if (successDiv) successDiv.remove();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize login manager
new LoginManager();

// Add spinner CSS
const style = document.createElement('style');
style.textContent = `
    .spinner {
        width: 16px;
        height: 16px;
        border: 2px solid #ffffff40;
        border-top: 2px solid #ffffff;
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    
    .error-message, .success-message {
        animation: slideIn 0.3s ease-out;
    }
    
    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateY(-10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
`;
document.head.appendChild(style);
