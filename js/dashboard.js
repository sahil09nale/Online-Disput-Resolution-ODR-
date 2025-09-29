// Dashboard JavaScript - API-driven dashboard with real-time updates
class DashboardManager {
    constructor() {
        this.apiBase = '/api';
        this.user = null;
        this.autoRefreshInterval = null;
        this.websocket = null;
        this.isVisible = true;
        this.refreshRate = 30000; // 30 seconds
        this.lastUpdate = null;
        this.init();
    }

    async init() {
        try {
            // Check authentication via API only
            await this.checkAuth();
            
            // Load dashboard data from API
            await this.loadDashboard();
            
            // Set up real-time updates
            this.setupRealTimeUpdates();
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Set up visibility change handling
            this.setupVisibilityHandling();
            
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

    setupRealTimeUpdates() {
        // Try WebSocket connection first, fallback to polling
        this.initializeWebSocket();
        
        // Set up intelligent polling as backup
        this.setupIntelligentPolling();
        
        // Add visual indicators for real-time status
        this.addRealTimeIndicators();
    }

    initializeWebSocket() {
        try {
            // Attempt WebSocket connection for real-time updates
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${wsProtocol}//${window.location.host}/ws/dashboard`;
            
            this.websocket = new WebSocket(wsUrl);
            
            this.websocket.onopen = () => {
                console.log('WebSocket connected for real-time updates');
                this.updateConnectionStatus('connected');
                
                // Send authentication token
                if (window.authManager.getToken) {
                    this.websocket.send(JSON.stringify({
                        type: 'auth',
                        token: window.authManager.getToken()
                    }));
                }
            };
            
            this.websocket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleWebSocketMessage(data);
                } catch (error) {
                    console.error('WebSocket message parsing error:', error);
                }
            };
            
            this.websocket.onclose = () => {
                console.log('WebSocket disconnected, falling back to polling');
                this.updateConnectionStatus('polling');
                this.websocket = null;
            };
            
            this.websocket.onerror = (error) => {
                console.warn('WebSocket error, using polling instead:', error);
                this.updateConnectionStatus('polling');
            };
            
        } catch (error) {
            console.warn('WebSocket not available, using polling:', error);
            this.updateConnectionStatus('polling');
        }
    }

    setupIntelligentPolling() {
        // Smart polling that adjusts based on activity and visibility
        this.autoRefreshInterval = setInterval(() => {
            if (this.isVisible && !this.websocket) {
                // Only poll if page is visible and WebSocket is not connected
                this.performIntelligentRefresh();
            }
        }, this.refreshRate);
    }

    async performIntelligentRefresh() {
        try {
            // Show subtle loading indicator
            this.showRefreshIndicator(true);
            
            // Load data with timestamp to check for changes
            const newData = await this.loadDashboardData();
            
            // Update last refresh time
            this.lastUpdate = new Date();
            this.updateLastRefreshTime();
            
            // Hide loading indicator
            this.showRefreshIndicator(false);
            
        } catch (error) {
            console.error('Auto-refresh failed:', error);
            this.showRefreshIndicator(false);
            
            // Show subtle error indication
            this.showRefreshError();
        }
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

    handleWebSocketMessage(data) {
        switch (data.type) {
            case 'case_update':
                // Real-time case update
                this.handleCaseUpdate(data.case);
                break;
            case 'stats_update':
                // Real-time statistics update
                this.updateStatistics(data.stats);
                break;
            case 'dashboard_refresh':
                // Full dashboard refresh requested
                this.loadDashboardData();
                break;
            default:
                console.log('Unknown WebSocket message type:', data.type);
        }
    }

    handleCaseUpdate(caseData) {
        // Update specific case in the table without full refresh
        const tbody = document.querySelector('#recentCasesTable tbody');
        if (tbody) {
            const existingRow = tbody.querySelector(`tr[data-case-id="${caseData.id}"]`);
            if (existingRow) {
                // Update existing row
                existingRow.outerHTML = this.generateCaseRow(caseData);
                this.highlightUpdatedRow(caseData.id);
            } else {
                // Add new case to top of list
                const newRow = this.generateCaseRow(caseData);
                tbody.insertAdjacentHTML('afterbegin', newRow);
                this.highlightUpdatedRow(caseData.id);
            }
        }
    }

    generateCaseRow(case_) {
        return `
            <tr data-case-id="${case_.id}">
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
        `;
    }

    highlightUpdatedRow(caseId) {
        const row = document.querySelector(`tr[data-case-id="${caseId}"]`);
        if (row) {
            row.style.backgroundColor = '#e3f2fd';
            setTimeout(() => {
                row.style.backgroundColor = '';
            }, 2000);
        }
    }

    setupVisibilityHandling() {
        // Handle page visibility changes to optimize polling
        document.addEventListener('visibilitychange', () => {
            this.isVisible = !document.hidden;
            
            if (this.isVisible) {
                // Page became visible, refresh data
                this.loadDashboardData();
                this.updateConnectionStatus(this.websocket ? 'connected' : 'polling');
            }
        });

        // Handle window focus/blur
        window.addEventListener('focus', () => {
            this.isVisible = true;
            this.loadDashboardData();
        });

        window.addEventListener('blur', () => {
            this.isVisible = false;
        });
    }

    addRealTimeIndicators() {
        // Add connection status indicator
        const header = document.querySelector('.dashboard-header');
        if (header) {
            const statusIndicator = document.createElement('div');
            statusIndicator.id = 'connectionStatus';
            statusIndicator.style.cssText = `
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 12px;
                color: #6b7280;
                margin-left: auto;
            `;
            
            header.appendChild(statusIndicator);
        }

        // Add last update time indicator
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            const lastUpdateEl = document.createElement('span');
            lastUpdateEl.id = 'lastUpdate';
            lastUpdateEl.style.cssText = `
                font-size: 11px;
                color: #9ca3af;
                margin-left: 8px;
            `;
            refreshBtn.parentNode.insertBefore(lastUpdateEl, refreshBtn.nextSibling);
        }
    }

    updateConnectionStatus(status) {
        const statusEl = document.getElementById('connectionStatus');
        if (!statusEl) return;

        const statusConfig = {
            connected: {
                icon: '🟢',
                text: 'Live updates',
                color: '#10b981'
            },
            polling: {
                icon: '🔄',
                text: 'Auto-refresh (30s)',
                color: '#f59e0b'
            },
            error: {
                icon: '🔴',
                text: 'Connection error',
                color: '#ef4444'
            }
        };

        const config = statusConfig[status] || statusConfig.error;
        statusEl.innerHTML = `
            <span style="font-size: 10px;">${config.icon}</span>
            <span style="color: ${config.color};">${config.text}</span>
        `;
    }

    updateLastRefreshTime() {
        const lastUpdateEl = document.getElementById('lastUpdate');
        if (lastUpdateEl && this.lastUpdate) {
            const timeAgo = this.getTimeAgo(this.lastUpdate);
            lastUpdateEl.textContent = `Updated ${timeAgo}`;
        }
    }

    getTimeAgo(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);

        if (diffSecs < 60) return 'just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        return `${Math.floor(diffMins / 60)}h ago`;
    }

    showRefreshIndicator(show) {
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            if (show) {
                refreshBtn.style.opacity = '0.6';
                refreshBtn.innerHTML = '⏳ Refreshing...';
            } else {
                refreshBtn.style.opacity = '1';
                refreshBtn.innerHTML = '🔄 Refresh';
            }
        }
    }

    showRefreshError() {
        const statusEl = document.getElementById('connectionStatus');
        if (statusEl) {
            statusEl.style.color = '#ef4444';
            setTimeout(() => {
                this.updateConnectionStatus(this.websocket ? 'connected' : 'polling');
            }, 3000);
        }
    }

    // Cleanup
    destroy() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
        }
        if (this.websocket) {
            this.websocket.close();
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
