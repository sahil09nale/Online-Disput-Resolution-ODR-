// Authentication utility - Replaces localStorage with proper API-based session management
class AuthManager {
    constructor() {
        this.apiBase = '/api';
        this.user = null;
        this.isAuthenticated = false;
    }

    // Check if user is authenticated by calling the backend
    async checkAuth() {
        try {
            const response = await fetch(`${this.apiBase}/auth/me`, {
                method: 'GET',
                credentials: 'include', // Include HTTP-only cookies
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success && data.user) {
                    this.user = data.user;
                    this.isAuthenticated = true;
                    return { success: true, user: data.user };
                }
            }

            this.user = null;
            this.isAuthenticated = false;
            return { success: false, error: 'Not authenticated' };

        } catch (error) {
            console.error('Auth check failed:', error);
            this.user = null;
            this.isAuthenticated = false;
            return { success: false, error: 'Authentication check failed' };
        }
    }

    // Login user
    async login(email, password) {
        try {
            const response = await fetch(`${this.apiBase}/auth/login`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                this.user = data.user;
                this.isAuthenticated = true;
                return { success: true, user: data.user };
            } else {
                return { success: false, error: data.error || 'Login failed' };
            }

        } catch (error) {
            console.error('Login failed:', error);
            return { success: false, error: 'Login request failed' };
        }
    }

    // Register user
    async register(userData) {
        try {
            const response = await fetch(`${this.apiBase}/auth/register`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(userData)
            });

            const data = await response.json();

            if (response.ok && data.success) {
                return { success: true, user: data.user, message: data.message };
            } else {
                return { success: false, error: data.error || 'Registration failed', details: data.details };
            }

        } catch (error) {
            console.error('Registration failed:', error);
            return { success: false, error: 'Registration request failed' };
        }
    }

    // Logout user
    async logout() {
        try {
            await fetch(`${this.apiBase}/auth/logout`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            // Always clear local state regardless of API response
            this.user = null;
            this.isAuthenticated = false;
            
            return { success: true };

        } catch (error) {
            console.error('Logout error:', error);
            // Still clear local state
            this.user = null;
            this.isAuthenticated = false;
            return { success: true }; // Always return success for logout
        }
    }

    // Get current user (from memory or API)
    async getCurrentUser() {
        if (this.isAuthenticated && this.user) {
            return { success: true, user: this.user };
        }

        return await this.checkAuth();
    }

    // Check if user has specific role
    hasRole(role) {
        return this.user?.profile?.user_type === role;
    }

    // Check if user is admin
    isAdmin() {
        return this.hasRole('admin');
    }

    // Redirect to login if not authenticated
    async requireAuth(redirectUrl = null) {
        const authResult = await this.checkAuth();
        
        if (!authResult.success) {
            const loginUrl = redirectUrl ? 
                `login.html?redirect=${encodeURIComponent(redirectUrl)}` : 
                'login.html';
            window.location.href = loginUrl;
            return false;
        }
        
        return true;
    }

    // Redirect to login if not admin
    async requireAdmin(redirectUrl = null) {
        const authResult = await this.checkAuth();
        
        if (!authResult.success) {
            window.location.href = 'admin-login.html';
            return false;
        }

        if (!this.isAdmin()) {
            window.location.href = 'dashboard.html';
            return false;
        }
        
        return true;
    }

    // Get authorization header for API requests
    getAuthHeader() {
        // Since we're using HTTP-only cookies, no need for explicit headers
        // Just ensure credentials: 'include' is used in fetch requests
        return {};
    }

    // Make authenticated API request
    async apiRequest(endpoint, options = {}) {
        const defaultOptions = {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        };

        const response = await fetch(`${this.apiBase}${endpoint}`, {
            ...defaultOptions,
            ...options
        });

        // Handle authentication errors
        if (response.status === 401) {
            this.user = null;
            this.isAuthenticated = false;
            throw new Error('Authentication required');
        }

        return response;
    }
}

// Create global auth manager instance
window.authManager = new AuthManager();

// Utility functions for backward compatibility and ease of use
async function checkAuth() {
    return await window.authManager.checkAuth();
}

async function requireAuth() {
    return await window.authManager.requireAuth(window.location.pathname);
}

async function requireAdmin() {
    return await window.authManager.requireAdmin();
}

async function logout() {
    const result = await window.authManager.logout();
    if (result.success) {
        window.location.href = 'login.html';
    }
    return result;
}

// Initialize auth check on page load for protected pages
document.addEventListener('DOMContentLoaded', async () => {
    const currentPage = window.location.pathname;
    const publicPages = ['/', '/index.html', '/pages/login.html', '/pages/register.html', '/pages/admin-login.html'];
    const adminPages = ['/pages/department.html', '/pages/admin-case-details.html'];
    
    // Skip auth check for public pages
    const isPublicPage = publicPages.some(page => 
        currentPage === page || currentPage.endsWith(page)
    );
    
    if (isPublicPage) {
        return;
    }

    // Check admin access for admin pages
    const isAdminPage = adminPages.some(page => 
        currentPage.endsWith(page)
    );
    
    if (isAdminPage) {
        await requireAdmin();
        return;
    }

    // Require auth for all other pages
    await requireAuth();
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthManager;
}
