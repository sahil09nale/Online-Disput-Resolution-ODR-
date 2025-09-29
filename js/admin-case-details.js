// Admin Case Details JavaScript - API-driven case management
class AdminCaseDetailsManager {
    constructor() {
        this.currentCaseId = null;
        this.currentCaseData = null;
        this.init();
    }

    async init() {
        try {
            // Check authentication first
            if (!window.authManager) {
                window.location.href = 'login.html';
                return;
            }

            const authResult = await window.authManager.checkAuth();
            if (!authResult.success) {
                window.location.href = 'login.html';
                return;
            }

            // Load case details
            await this.loadCaseDetails();
        } catch (error) {
            console.error('Admin case details initialization failed:', error);
            this.redirectToLogin();
        }
    }

    async loadCaseDetails() {
        const urlParams = new URLSearchParams(window.location.search);
        this.currentCaseId = urlParams.get('id');

        if (!this.currentCaseId) {
            alert('Invalid case ID');
            window.location.href = 'department.html';
            return;
        }

        try {
            // Load case from API
            const response = await window.authManager.apiRequest(`/admin/cases/${this.currentCaseId}`);
            
            if (!response.ok) {
                throw new Error('Failed to load case details');
            }
            
            const data = await response.json();
            this.currentCaseData = data.case;

            if (!this.currentCaseData) {
                alert('Case not found');
                window.location.href = 'department.html';
                return;
            }

            // Load evidence files from API
            const evidenceFiles = this.currentCaseData.case_files || [];

            // Render case details
            this.renderCaseDetails(this.currentCaseData, evidenceFiles);

        } catch (error) {
            console.error('Failed to load case details:', error);
            alert('Failed to load case details: ' + error.message);
        }
    }

    renderCaseDetails(caseData, evidenceFiles) {
        const caseDetailsContainer = document.getElementById('caseDetailsContainer');
        if (!caseDetailsContainer) {
            console.error('Case details container not found');
            return;
        }

        caseDetailsContainer.innerHTML = `
            <div style="background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); padding: 32px; margin-bottom: 24px;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 24px;">
                    <div>
                        <h1 style="color: var(--deep-blue); font-size: 28px; font-weight: 700; margin-bottom: 8px;">
                            ${this.escapeHtml(caseData.case_title)}
                        </h1>
                        <div style="color: var(--medium-gray); font-size: 16px;">
                            Case ID: <strong>#${caseData.id.slice(0, 8)}</strong>
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <span class="status-badge status-${caseData.status.toLowerCase().replace(' ', '-')}" style="font-size: 16px; padding: 8px 16px;">${caseData.status}</span>
                        <div style="margin-top: 8px; color: var(--medium-gray); font-size: 14px;">
                            Filed: ${new Date(caseData.created_at || caseData.submittedAt).toLocaleDateString()}
                        </div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 32px;">
                    <div>
                        <h3 style="color: var(--deep-blue); margin-bottom: 16px;">Case Information</h3>
                        <div style="background: #f9fafb; padding: 20px; border-radius: 8px;">
                            <div style="margin-bottom: 12px;"><strong>Complainant:</strong> ${caseData.user?.full_name || caseData.user_email || 'Unknown'}</div>
                            <div style="margin-bottom: 12px;"><strong>Email:</strong> ${caseData.user_email || 'Not provided'}</div>
                            <div style="margin-bottom: 12px;"><strong>Dispute Type:</strong> ${this.formatDisputeType(caseData.case_type || caseData.type)}</div>
                            <div style="margin-bottom: 12px;"><strong>Amount:</strong> ${caseData.amount_involved ? '$' + caseData.amount_involved : 'Not specified'}</div>
                            <div style="margin-bottom: 12px;"><strong>Priority:</strong> ${this.formatPriority(caseData.urgency_level)}</div>
                            <div><strong>Department:</strong> ${caseData.department || 'Not assigned'}</div>
                        </div>
                    </div>

                    <div>
                        <h3 style="color: var(--deep-blue); margin-bottom: 16px;">Evidence Files (${evidenceFiles.length})</h3>
                        <div style="background: #f9fafb; padding: 20px; border-radius: 8px; max-height: 300px; overflow-y: auto;">
                            ${evidenceFiles.length > 0 ? evidenceFiles.map(file => `
                                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                                    <div>
                                        <div style="font-weight: 500;">${file.file_name || file.fileName}</div>
                                        <div style="font-size: 12px; color: var(--medium-gray);">Uploaded: ${new Date(file.created_at || file.uploadedAt).toLocaleDateString()}</div>
                                    </div>
                                    <button onclick="window.adminCaseDetailsManager.viewEvidence('${file.id}', '${file.file_name}')" 
                                            style="background: var(--teal); color: white; border: none; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">
                                        View
                                    </button>
                                </div>
                            `).join('') : '<p style="color: var(--medium-gray); text-align: center;">No evidence files uploaded</p>'}
                        </div>
                    </div>
                </div>

                <div style="margin-bottom: 32px;">
                    <h3 style="color: var(--deep-blue); margin-bottom: 16px;">Case Description</h3>
                    <div style="background: #f9fafb; padding: 20px; border-radius: 8px; line-height: 1.6;">
                        ${caseData.description || 'No description provided'}
                    </div>
                </div>

                ${caseData.preferred_resolution ? `
                    <div style="margin-bottom: 32px;">
                        <h3 style="color: var(--deep-blue); margin-bottom: 16px;">Preferred Resolution</h3>
                        <div style="background: #f9fafb; padding: 20px; border-radius: 8px; line-height: 1.6;">
                            ${caseData.preferred_resolution}
                        </div>
                    </div>
                ` : ''}

                <div style="margin-bottom: 32px;">
                    <h3 style="color: var(--deep-blue); margin-bottom: 16px;">Case Actions</h3>
                    <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                        <button onclick="window.adminCaseDetailsManager.updateCaseStatus('In Review')" 
                                class="btn-primary" style="background: #f59e0b;">
                            Mark as In Review
                        </button>
                        <button onclick="window.adminCaseDetailsManager.updateCaseStatus('Resolved')" 
                                class="btn-primary" style="background: #10b981;">
                            Mark as Resolved
                        </button>
                        <button onclick="window.adminCaseDetailsManager.updateCaseStatus('Closed')" 
                                class="btn-secondary">
                            Close Case
                        </button>
                        <button onclick="window.adminCaseDetailsManager.goBack()" 
                                class="btn-secondary">
                            Back to Department
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    async viewEvidence(fileId, fileName) {
        try {
            // This would integrate with your file viewing system
            alert(`Viewing evidence file: ${fileName}`);
            // TODO: Implement actual file viewing/download
        } catch (error) {
            console.error('Failed to view evidence:', error);
            alert('Failed to view evidence file');
        }
    }

    async updateCaseStatus(status) {
        if (!this.currentCaseId) {
            alert('No case loaded');
            return;
        }

        if (!confirm(`Are you sure you want to update this case status to "${status}"?`)) {
            return;
        }

        try {
            const response = await window.authManager.apiRequest(`/admin/cases/${this.currentCaseId}/status`, {
                method: 'PATCH',
                body: JSON.stringify({ status })
            });

            if (response.ok) {
                alert(`Case status updated to ${status}`);
                this.loadCaseDetails();
            } else {
                const data = await response.json();
                throw new Error(data.error || 'Failed to update case status');
            }
        } catch (error) {
            console.error('Failed to update case status:', error);
            alert('Failed to update case status: ' + error.message);
        }
    }

    goBack() {
        window.location.href = 'department.html';
    }

    redirectToLogin() {
        window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.pathname);
    }

    // Utility functions
    formatDisputeType(type) {
        const types = {
            'consumer': 'Consumer Dispute',
            'employment': 'Employment Dispute',
            'contract': 'Contract Dispute',
            'property': 'Property Dispute',
            'family': 'Family Dispute',
            'other': 'Other Dispute'
        };
        return types[type] || type;
    }

    formatPriority(priority) {
        const priorities = {
            'high': 'High Priority',
            'medium': 'Medium Priority',
            'low': 'Low Priority'
        };
        return priorities[priority] || 'Medium Priority';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Global logout function
async function logout() {
    try {
        if (window.authManager) {
            await window.authManager.logout();
        }
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Logout error:', error);
        window.location.href = 'login.html';
    }
}

// Initialize admin case details manager
document.addEventListener('DOMContentLoaded', () => {
    window.adminCaseDetailsManager = new AdminCaseDetailsManager();
});
