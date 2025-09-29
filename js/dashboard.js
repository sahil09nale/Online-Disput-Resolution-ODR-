// Dashboard JavaScript - API-driven dashboard with NO localStorage usage
class DashboardManager {
    constructor() {
        this.apiBase = '/api';
        this.user = null;
        this.autoRefreshInterval = null;
        this.init();
    }

    async init() {
        try {
            // Check authentication via API only
            await this.checkAuth();
            
            // Load dashboard data from API
            await this.loadDashboard();
            
            // Set up auto-refresh
            this.setupAutoRefresh();
            
            // Set up event listeners
            this.setupEventListeners();
            
        } catch (error) {
            console.error('Dashboard initialization failed:', error);
            this.redirectToLogin();
        }
    }

    async checkAuth() {
        const authResult = await window.authManager.checkAuth();
        if (!authResult.success) {
            throw new Error('Authentication required');
        }
        this.user = authResult.user;
        
        // Update user info in UI
        this.updateUserInfo();
    }

    updateUserInfo() {
        const userNameEl = document.getElementById('userName');
        const userEmailEl = document.getElementById('userEmail');
        
        if (userNameEl && this.user.profile?.full_name) {
            userNameEl.textContent = this.user.profile.full_name;
        }
        if (userEmailEl) {
            userEmailEl.textContent = this.user.email;
        }
    }

    async loadDashboard() {
        try {
            this.showLoading(true);
            
            // Load ALL data from API - no localStorage
            await this.loadDashboardData();
            
        } catch (error) {
            console.error('Failed to load dashboard:', error);
            this.showError('Failed to load dashboard data');
        } finally {
            this.showLoading(false);
        }
    }

    async loadDashboardData() {
        try {
            // Load dashboard statistics from API
            const statsResponse = await window.authManager.apiRequest('/cases/stats/dashboard');
            
            if (!statsResponse.ok) {
                throw new Error('Failed to load dashboard statistics');
            }
            
            const statsData = await statsResponse.json();
            
            // Load user cases from API
            const casesResponse = await window.authManager.apiRequest('/cases?limit=5');
            
            if (!casesResponse.ok) {
                throw new Error('Failed to load user cases');
            }
            
            const casesData = await casesResponse.json();
            
            // Update UI with live API data
            this.updateStatistics(statsData.stats);
            this.updateRecentCases(casesData.cases);
            
            return {
                stats: statsData.stats,
                cases: casesData.cases
            };
            
        } catch (error) {
            console.error('Failed to load dashboard data:', error);
            this.showError('Failed to load dashboard data. Please refresh the page.');
            throw error;
        }
    }

    updateStatistics(stats) {
        // Update stat cards with live API data
        const totalCasesEl = document.getElementById('totalCases');
        const activeCasesEl = document.getElementById('activeCases');
        const resolvedCasesEl = document.getElementById('resolvedCases');
        const pendingCasesEl = document.getElementById('pendingCases');

        if (totalCasesEl) totalCasesEl.textContent = stats.total || 0;
        if (activeCasesEl) activeCasesEl.textContent = (stats.pending + stats.in_review) || 0;
        if (resolvedCasesEl) resolvedCasesEl.textContent = stats.resolved || 0;
        if (pendingCasesEl) pendingCasesEl.textContent = stats.pending || 0;
    }

    updateRecentCases(cases) {
        const tbody = document.querySelector('#recentCasesTable tbody');
        if (!tbody) {
            console.warn('Recent cases table not found');
            return;
        }

        if (!cases || cases.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #666;">No cases found</td></tr>';
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

    setupAutoRefresh() {
        // Refresh every 30 seconds with API calls
        this.autoRefreshInterval = setInterval(() => {
            this.loadDashboardData().catch(console.error);
        }, 30000);
    }

    setupEventListeners() {
        // Refresh button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadDashboard();
            });
        }

        // Quick action buttons
        const submitCaseBtn = document.getElementById('submitCaseBtn');
        if (submitCaseBtn) {
            submitCaseBtn.addEventListener('click', () => {
                window.location.href = 'submit-dispute.html';
            });
        }
    }

    showLoading(show) {
        const loadingEl = document.getElementById('dashboardLoading');
        if (loadingEl) {
            loadingEl.style.display = show ? 'block' : 'none';
        }
    }

    showError(message) {
        const errorEl = document.getElementById('dashboardError');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
            
            // Hide after 5 seconds
            setTimeout(() => {
                errorEl.style.display = 'none';
            }, 5000);
        }
    }

    redirectToLogin() {
        window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.pathname);
    }

    // Utility functions
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

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Cleanup
    destroy() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
        }
    }
}

// Global logout function
async function logout() {
    if (window.authManager) {
        await window.authManager.logout();
    }
    window.location.href = 'login.html';
}

// Initialize dashboard manager
document.addEventListener('DOMContentLoaded', () => {
    window.dashboardManager = new DashboardManager();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.dashboardManager) {
        window.dashboardManager.destroy();
    }
});
