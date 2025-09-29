// Admin Dashboard JavaScript - Connects to ResolveNOW Backend API
class AdminDashboardManager {
    constructor() {
        this.apiBase = '/api';
        this.user = null;
        this.cases = [];
        this.refreshInterval = null;
        this.init();
    }

    async init() {
        try {
            // Check admin authentication
            await this.checkAdminAuth();
            
            // Load admin dashboard data
            await this.loadDashboardData();
            
            // Set up auto-refresh (every 30 seconds)
            this.startAutoRefresh();
            
            // Set up event listeners
            this.setupEventListeners();
        } catch (error) {
            console.error('Admin dashboard initialization failed:', error);
            this.redirectToLogin();
        }
    }

    async checkAdminAuth() {
        const authResult = await window.authManager.checkAuth();
        if (!authResult.success) {
            throw new Error('Authentication required');
        }

        if (!window.authManager.isAdmin()) {
            window.location.href = 'dashboard.html';
            throw new Error('Admin access required');
        }

        this.user = authResult.user;
        
        // Update welcome message
        const welcomeElement = document.getElementById('adminWelcome');
        if (welcomeElement && this.user.profile) {
            welcomeElement.textContent = `Welcome, ${this.user.profile.full_name || this.user.email}`;
        }

        // Show department info
        const deptElement = document.getElementById('adminDepartment');
        if (deptElement && this.user.profile?.department) {
            deptElement.textContent = `${this.user.profile.department} Department`;
        }
    }

    async loadDashboardData() {
        try {
            // Load department cases
            await this.loadDepartmentCases();
            
            // Load department statistics
            await this.loadDepartmentStats();
            
        } catch (error) {
            console.error('Failed to load dashboard data:', error);
            this.showError('Failed to load dashboard data. Please refresh the page.');
        }
    }

    async loadDepartmentCases() {
        try {
            const response = await window.authManager.apiRequest('/admin/cases?limit=20');
            
            if (!response.ok) {
                throw new Error(`Cases API error: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.success && data.cases) {
                this.cases = data.cases;
                this.renderCasesTable();
            }
            
        } catch (error) {
            console.error('Failed to load department cases:', error);
            throw error;
        }
    }

    async loadDepartmentStats() {
        try {
            const response = await window.authManager.apiRequest('/admin/stats/department');
            
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.stats) {
                    this.updateStatistics(data.stats);
                }
            }
            
        } catch (error) {
            console.error('Failed to load department stats:', error);
            // Don't throw - stats are not critical
        }
    }

    updateStatistics(stats) {
        // Update stat cards
        this.updateElement('totalCases', stats.total || 0);
        this.updateElement('pendingCases', stats.pending || 0);
        this.updateElement('inReviewCases', stats.in_review || 0);
        this.updateElement('resolvedCases', stats.resolved || 0);
        this.updateElement('highPriorityCases', stats.high_priority || 0);
    }

    renderCasesTable() {
        const tbody = document.getElementById('casesTableBody');
        if (!tbody) return;

        if (!this.cases || this.cases.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 48px 24px; color: var(--medium-gray);">
                        <div style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;">📋</div>
                        <div style="font-size: 16px; font-weight: 500; margin-bottom: 8px;">No cases assigned</div>
                        <div style="font-size: 14px;">Cases will appear here when assigned to your department</div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = this.cases.map(case_ => `
            <tr>
                <td><strong>#${case_.id.slice(0, 8)}</strong></td>
                <td>
                    <div style="font-weight: 500;">${this.escapeHtml(case_.case_title)}</div>
                    <div style="font-size: 12px; color: var(--medium-gray);">
                        ${case_.user?.full_name || case_.user_email}
                    </div>
                </td>
                <td>
                    <span class="badge badge-${case_.case_type}">${this.formatDisputeType(case_.case_type)}</span>
                </td>
                <td>
                    <span class="status-badge status-${case_.status}">${this.formatStatus(case_.status)}</span>
                </td>
                <td>
                    <span class="priority-badge priority-${case_.urgency_level || 'medium'}">${this.formatPriority(case_.urgency_level)}</span>
                </td>
                <td>${this.formatDate(case_.created_at)}</td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        <a href="admin-case-details.html?id=${case_.id}" class="btn-link">Review</a>
                        ${case_.status === 'Pending' ? `<button onclick="quickResolve('${case_.id}')" class="btn-link">Quick Resolve</button>` : ''}
                    </div>
                </td>
            </tr>
        `).join('');
    }

    async updateCaseStatus(caseId, status, resolution = null) {
        try {
            const requestBody = { status };
            if (resolution) {
                requestBody.resolution = resolution;
            }

            const response = await window.authManager.apiRequest(`/admin/cases/${caseId}/status`, {
                method: 'PATCH',
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to update case status');
            }

            const data = await response.json();
            
            if (data.success) {
                this.showSuccess('Case status updated successfully');
                // Reload cases to reflect changes
                await this.loadDepartmentCases();
                return true;
            } else {
                throw new Error(data.error || 'Update failed');
            }

        } catch (error) {
            console.error('Update case status error:', error);
            this.showError(error.message || 'Failed to update case status');
            return false;
        }
    }

    async quickResolve(caseId) {
        const resolution = prompt('Enter resolution details:');
        if (!resolution) return;

        await this.updateCaseStatus(caseId, 'Resolved', resolution);
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

        // Filter buttons
        const filterButtons = document.querySelectorAll('.filter-btn');
        filterButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.filterCases(e.target.dataset.filter);
            });
        });

        // Search functionality
        const searchInput = document.getElementById('caseSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchCases(e.target.value);
            });
        }
    }

    filterCases(filter) {
        // Update active filter button
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-filter="${filter}"]`)?.classList.add('active');

        // Filter and render cases
        let filteredCases = this.cases;
        
        if (filter !== 'all') {
            filteredCases = this.cases.filter(case_ => case_.status === filter);
        }

        this.renderFilteredCases(filteredCases);
    }

    searchCases(query) {
        if (!query) {
            this.renderCasesTable();
            return;
        }

        const filteredCases = this.cases.filter(case_ => 
            case_.case_title.toLowerCase().includes(query.toLowerCase()) ||
            case_.user_email.toLowerCase().includes(query.toLowerCase()) ||
            case_.id.toLowerCase().includes(query.toLowerCase())
        );

        this.renderFilteredCases(filteredCases);
    }

    renderFilteredCases(cases) {
        const originalCases = this.cases;
        this.cases = cases;
        this.renderCasesTable();
        this.cases = originalCases; // Restore original cases
    }

    redirectToLogin() {
        window.location.href = 'admin-login.html';
    }

    // Utility functions
    updateElement(id, content) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = content;
        }
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

    formatPriority(priority) {
        const priorities = {
            'high': 'High',
            'medium': 'Medium',
            'low': 'Low'
        };
        return priorities[priority] || 'Medium';
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    showError(message) {
        this.showMessage(message, 'error');
    }

    showSuccess(message) {
        this.showMessage(message, 'success');
    }

    showMessage(message, type) {
        // Remove existing messages
        const existingMessage = document.querySelector('.message-alert');
        if (existingMessage) {
            existingMessage.remove();
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = 'message-alert';
        messageDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 16px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 1000;
            max-width: 400px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            background: ${type === 'error' ? '#dc3545' : '#28a745'};
        `;
        messageDiv.textContent = message;

        document.body.appendChild(messageDiv);

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.parentNode.removeChild(messageDiv);
            }
        }, 5000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Global functions for admin actions
async function quickResolve(caseId) {
    if (window.adminDashboardManager) {
        await window.adminDashboardManager.quickResolve(caseId);
    }
}

// Global logout function
async function logout() {
    if (window.authManager) {
        await window.authManager.logout();
    }
    window.location.href = 'admin-login.html';
}

// Initialize admin dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.adminDashboardManager = new AdminDashboardManager();
});
