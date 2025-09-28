// Dashboard JavaScript - Connects to ResolveNOW Backend API
class DashboardManager {
    constructor() {
        this.apiBase = '/api';
        this.user = null;
        this.refreshInterval = null;
        this.init();
    }

    async init() {
        try {
            // Check authentication and get user data
            await this.checkAuth();
            
            // Load dashboard data
            await this.loadDashboardData();
            
            // Set up auto-refresh (every 30 seconds)
            this.startAutoRefresh();
            
            // Set up event listeners
            this.setupEventListeners();
        } catch (error) {
            console.error('Dashboard initialization failed:', error);
            this.redirectToLogin();
        }
    }

    async checkAuth() {
        try {
            const response = await fetch(`${this.apiBase}/auth/me`, {
                method: 'GET',
                credentials: 'include', // Include HTTP-only cookies
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Authentication failed');
            }

            const data = await response.json();
            this.user = data.user;
            
            // Update welcome message
            const welcomeElement = document.getElementById('userWelcome');
            if (welcomeElement && this.user.profile) {
                welcomeElement.textContent = `Welcome, ${this.user.profile.full_name || this.user.email}`;
            }

            // Show role-specific sections
            this.showRoleSpecificSections();
            
        } catch (error) {
            console.error('Authentication check failed:', error);
            throw error;
        }
    }

    showRoleSpecificSections() {
        if (!this.user?.profile?.user_type) return;

        const userType = this.user.profile.user_type;
        
        // Show mediator section for mediators
        if (userType === 'mediator') {
            const mediatorSection = document.getElementById('mediatorSection');
            if (mediatorSection) {
                mediatorSection.style.display = 'block';
            }
        }

        // Show lawyer section for lawyers
        if (userType === 'lawyer') {
            const lawyerSection = document.getElementById('lawyerSection');
            if (lawyerSection) {
                lawyerSection.style.display = 'block';
            }
        }
    }

    async loadDashboardData() {
        try {
            // Load user dashboard data
            await this.loadUserDashboard();
            
            // Load role-specific data
            if (this.user?.profile?.user_type === 'mediator') {
                await this.loadMediationCases();
            }
            
            if (this.user?.profile?.user_type === 'lawyer') {
                await this.loadLawyerCases();
            }
            
        } catch (error) {
            console.error('Failed to load dashboard data:', error);
            this.showError('Failed to load dashboard data. Please refresh the page.');
        }
    }

    async loadUserDashboard() {
        try {
            const response = await fetch(`${this.apiBase}/users/dashboard`, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Dashboard API error: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.success && data.dashboard) {
                this.updateStatistics(data.dashboard.stats);
                this.updateRecentCases(data.dashboard.recentActivity);
            }
            
        } catch (error) {
            console.error('Failed to load user dashboard:', error);
            // Fallback to cases endpoint
            await this.loadCasesData();
        }
    }

    async loadCasesData() {
        try {
            const response = await fetch(`${this.apiBase}/cases`, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Cases API error: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.success && data.cases) {
                // Calculate statistics from cases data
                const stats = this.calculateStats(data.cases);
                this.updateStatistics(stats);
                this.updateRecentCases(data.cases.slice(0, 10)); // Show recent 10 cases
            }
            
        } catch (error) {
            console.error('Failed to load cases data:', error);
            throw error;
        }
    }

    calculateStats(cases) {
        return {
            totalCases: cases.length,
            pendingCases: cases.filter(c => c.status === 'Pending').length,
            inReviewCases: cases.filter(c => c.status === 'In Review').length,
            resolvedCases: cases.filter(c => c.status === 'Resolved').length
        };
    }

    updateStatistics(stats) {
        // Update stat cards
        const totalCasesEl = document.getElementById('totalCases');
        const activeCasesEl = document.getElementById('activeCases');
        const resolvedCasesEl = document.getElementById('resolvedCases');
        const pendingCasesEl = document.getElementById('pendingCases');

        if (totalCasesEl) totalCasesEl.textContent = stats.totalCases || 0;
        if (activeCasesEl) activeCasesEl.textContent = (stats.pendingCases || 0) + (stats.inReviewCases || 0);
        if (resolvedCasesEl) resolvedCasesEl.textContent = stats.resolvedCases || 0;
        if (pendingCasesEl) pendingCasesEl.textContent = stats.pendingCases || 0;
    }

    updateRecentCases(cases) {
        const tbody = document.getElementById('casesTableBody');
        if (!tbody) return;

        if (!cases || cases.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 48px 24px; color: var(--medium-gray);">
                        <div style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;">📋</div>
                        <div style="font-size: 16px; font-weight: 500; margin-bottom: 8px;">No cases found</div>
                        <div style="font-size: 14px;">
                            <a href="submit-dispute.html" style="color: var(--teal); text-decoration: none; font-weight: 500;">Submit your first case</a> to get started
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = cases.map(case_ => `
            <tr>
                <td><strong>#${case_.id.slice(0, 8)}</strong></td>
                <td>
                    <div style="font-weight: 500;">${this.escapeHtml(case_.case_title)}</div>
                </td>
                <td>
                    <span class="badge badge-${case_.case_type}">${this.formatDisputeType(case_.case_type)}</span>
                </td>
                <td>
                    <span class="status-badge status-${case_.status}">${this.formatStatus(case_.status)}</span>
                </td>
                <td>${this.formatDate(case_.created_at)}</td>
                <td>
                    <a href="case-details.html?id=${case_.id}" class="btn-link">View Details</a>
                </td>
            </tr>
        `).join('');
    }

    async loadMediationCases() {
        // This would require additional backend endpoints for mediator-specific cases
        // For now, show placeholder message
        console.log('Mediation cases loading not implemented yet');
    }

    async loadLawyerCases() {
        // This would require additional backend endpoints for lawyer-specific cases
        // For now, show placeholder message
        console.log('Lawyer cases loading not implemented yet');
    }

    startAutoRefresh() {
        // Refresh dashboard data every 30 seconds
        this.refreshInterval = setInterval(() => {
            this.loadDashboardData();
        }, 30000);
    }

    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    setupEventListeners() {
        // Handle page visibility change to pause/resume auto-refresh
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.stopAutoRefresh();
            } else {
                this.startAutoRefresh();
            }
        });

        // Handle window beforeunload to cleanup
        window.addEventListener('beforeunload', () => {
            this.stopAutoRefresh();
        });
    }

    async logout() {
        try {
            const response = await fetch(`${this.apiBase}/auth/logout`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            // Always redirect to login, even if logout fails
            this.redirectToLogin();
            
        } catch (error) {
            console.error('Logout error:', error);
            // Still redirect to login
            this.redirectToLogin();
        }
    }

    redirectToLogin() {
        window.location.href = 'login.html';
    }

    showError(message) {
        // Create or update error message
        let errorDiv = document.getElementById('dashboard-error');
        if (!errorDiv) {
            errorDiv = document.createElement('div');
            errorDiv.id = 'dashboard-error';
            errorDiv.style.cssText = `
                background: #fee; 
                color: #c33; 
                padding: 12px 16px; 
                border-radius: 6px; 
                margin: 16px 0; 
                border: 1px solid #fcc;
            `;
            
            const dashboard = document.querySelector('.dashboard');
            if (dashboard) {
                dashboard.insertBefore(errorDiv, dashboard.firstChild);
            }
        }
        
        errorDiv.textContent = message;
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 5000);
    }

    // Utility functions
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatDisputeType(type) {
        const types = {
            'consumer': 'Consumer',
            'employment': 'Employment',
            'contract': 'Contract',
            'property': 'Property',
            'family': 'Family',
            'other': 'Other'
        };
        return types[type] || type;
    }

    formatStatus(status) {
        const statuses = {
            'Pending': 'Pending Review',
            'In Review': 'Under Review',
            'In Mediation': 'In Mediation',
            'Resolved': 'Resolved',
            'Closed': 'Closed'
        };
        return statuses[status] || status;
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }
}

// Global logout function for navbar
async function logout() {
    if (window.dashboardManager) {
        await window.dashboardManager.logout();
    } else {
        // Fallback logout
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'include'
            });
        } catch (error) {
            console.error('Logout error:', error);
        }
        window.location.href = 'login.html';
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dashboardManager = new DashboardManager();
});
