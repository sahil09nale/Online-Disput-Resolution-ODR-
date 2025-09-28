// Case Details JavaScript - Connects to ResolveNOW Backend API
class CaseDetailsManager {
    constructor() {
        this.apiBase = '/api';
        this.caseId = null;
        this.caseData = null;
        this.user = null;
        this.init();
    }

    async init() {
        try {
            // Get case ID from URL
            this.caseId = this.getCaseIdFromUrl();
            if (!this.caseId) {
                this.showError('No case ID provided');
                return;
            }

            // Check authentication
            await this.checkAuth();
            
            // Load case data
            await this.loadCaseDetails();
            
            // Load case files
            await this.loadCaseFiles();
            
            // Set up event listeners
            this.setupEventListeners();
            
        } catch (error) {
            console.error('Case details initialization failed:', error);
            this.showError('Failed to load case details');
        }
    }

    getCaseIdFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('id');
    }

    async checkAuth() {
        const authResult = await window.authManager.checkAuth();
        if (!authResult.success) {
            window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
            throw new Error('Authentication required');
        }
        this.user = authResult.user;
    }

    async loadCaseDetails() {
        try {
            const response = await window.authManager.apiRequest(`/cases/${this.caseId}`);
            
            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Case not found');
                }
                throw new Error(`Failed to load case: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.success && data.case) {
                this.caseData = data.case;
                this.renderCaseDetails();
            } else {
                throw new Error('Invalid case data received');
            }
            
        } catch (error) {
            console.error('Failed to load case details:', error);
            this.showError(error.message || 'Failed to load case details');
        }
    }

    renderCaseDetails() {
        if (!this.caseData) return;

        const case_ = this.caseData;

        // Update page title
        document.title = `${case_.case_title} - ResolveNOW`;

        // Update case header
        this.updateElement('caseTitle', case_.case_title);
        this.updateElement('caseId', `#${case_.id.slice(0, 8)}`);
        this.updateElement('caseStatus', this.formatStatus(case_.status));
        
        // Update status badge class
        const statusBadge = document.querySelector('.status-badge');
        if (statusBadge) {
            statusBadge.className = `status-badge status-${case_.status}`;
        }

        // Update case information
        this.updateElement('disputeType', this.formatDisputeType(case_.case_type));
        this.updateElement('dateSubmitted', this.formatDate(case_.created_at));
        this.updateElement('lastUpdated', this.formatDate(case_.last_updated || case_.created_at));
        this.updateElement('assignedDepartment', case_.assigned_mediator_id ? 'Assigned' : 'Not assigned');
        
        if (case_.amount_involved) {
            this.updateElement('disputeAmount', this.formatCurrency(case_.amount_involved));
        }

        // Update parties information
        this.updateElement('applicantName', this.user.profile?.full_name || this.user.email);
        this.updateElement('applicantEmail', this.user.email);
        this.updateElement('respondentName', case_.respondent_name);
        
        if (case_.respondent_email) {
            this.updateElement('respondentEmail', case_.respondent_email);
        }
        if (case_.respondent_phone) {
            this.updateElement('respondentPhone', case_.respondent_phone);
        }

        // Update case description
        this.updateElement('caseDescription', case_.description);

        // Update resolution section
        if (case_.status === 'Resolved' && case_.resolution_notes) {
            this.showResolutionSection(case_.resolution_notes, case_.resolved_at);
        }

        // Update admin notes if present
        if (case_.admin_notes) {
            this.showAdminNotes(case_.admin_notes);
        }

        // Show/hide action buttons based on status
        this.updateActionButtons();
    }

    showResolutionSection(resolution, resolvedAt) {
        const resolutionSection = document.getElementById('resolutionSection');
        if (resolutionSection) {
            resolutionSection.style.display = 'block';
            this.updateElement('resolutionText', resolution);
            this.updateElement('resolutionDate', this.formatDate(resolvedAt));
        }
    }

    showAdminNotes(notes) {
        const notesSection = document.getElementById('adminNotesSection');
        if (notesSection) {
            notesSection.style.display = 'block';
            this.updateElement('adminNotesText', notes);
        }
    }

    updateActionButtons() {
        const editButton = document.getElementById('editCaseBtn');
        const cancelButton = document.getElementById('cancelCaseBtn');

        // Only allow editing/cancelling of pending cases
        if (this.caseData.status === 'Pending') {
            if (editButton) editButton.style.display = 'inline-block';
            if (cancelButton) cancelButton.style.display = 'inline-block';
        } else {
            if (editButton) editButton.style.display = 'none';
            if (cancelButton) cancelButton.style.display = 'none';
        }
    }

    async loadCaseFiles() {
        try {
            const response = await window.authManager.apiRequest(`/upload/case/${this.caseId}`);
            
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.renderCaseFiles(data.files);
                }
            }
            
        } catch (error) {
            console.error('Failed to load case files:', error);
            // Don't show error for files - it's not critical
        }
    }

    renderCaseFiles(files) {
        const filesContainer = document.getElementById('caseFiles');
        if (!filesContainer) return;

        if (!files || files.length === 0) {
            filesContainer.innerHTML = `
                <div style="text-align: center; padding: 24px; color: var(--medium-gray);">
                    <div style="font-size: 32px; margin-bottom: 8px;">📎</div>
                    <div>No files uploaded</div>
                </div>
            `;
            return;
        }

        filesContainer.innerHTML = files.map(file => `
            <div class="file-item" style="display: flex; align-items: center; justify-content: space-between; padding: 12px; border: 1px solid var(--light-gray); border-radius: 6px; margin-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="font-size: 24px;">${this.getFileIcon(file.file_type)}</div>
                    <div>
                        <div style="font-weight: 500;">${this.escapeHtml(file.file_name)}</div>
                        <div style="font-size: 12px; color: var(--medium-gray);">
                            ${this.formatFileSize(file.file_size)} • ${this.formatDate(file.uploaded_at)}
                        </div>
                    </div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button onclick="downloadFile('${file.id}')" class="btn-link">Download</button>
                    ${this.caseData.status === 'Pending' ? `<button onclick="deleteFile('${file.id}')" class="btn-link" style="color: var(--error-color);">Delete</button>` : ''}
                </div>
            </div>
        `).join('');
    }

    setupEventListeners() {
        // Edit case button
        const editButton = document.getElementById('editCaseBtn');
        if (editButton) {
            editButton.addEventListener('click', () => this.editCase());
        }

        // Cancel case button
        const cancelButton = document.getElementById('cancelCaseBtn');
        if (cancelButton) {
            cancelButton.addEventListener('click', () => this.cancelCase());
        }

        // File upload
        const uploadButton = document.getElementById('uploadFileBtn');
        if (uploadButton) {
            uploadButton.addEventListener('click', () => this.uploadFile());
        }
    }

    async editCase() {
        // For now, redirect to edit page or show modal
        // This would need an edit form implementation
        alert('Edit functionality would be implemented here');
    }

    async cancelCase() {
        if (!confirm('Are you sure you want to cancel this case? This action cannot be undone.')) {
            return;
        }

        try {
            const response = await window.authManager.apiRequest(`/cases/${this.caseId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.showSuccess('Case cancelled successfully');
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 2000);
            } else {
                const data = await response.json();
                throw new Error(data.error || 'Failed to cancel case');
            }

        } catch (error) {
            console.error('Cancel case error:', error);
            this.showError(error.message || 'Failed to cancel case');
        }
    }

    uploadFile() {
        // This would trigger file upload functionality
        alert('File upload functionality would be implemented here');
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
            'consumer': 'Consumer Dispute',
            'employment': 'Employment Dispute',
            'contract': 'Contract Dispute',
            'property': 'Property Dispute',
            'family': 'Family Dispute',
            'other': 'Other'
        };
        return types[type] || type;
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    getFileIcon(mimeType) {
        if (mimeType.startsWith('image/')) return '🖼️';
        if (mimeType.includes('pdf')) return '📄';
        if (mimeType.includes('word')) return '📝';
        if (mimeType.includes('text')) return '📄';
        return '📎';
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

// Global functions for file operations
async function downloadFile(fileId) {
    try {
        const response = await window.authManager.apiRequest(`/upload/file/${fileId}/download`);
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.file) {
                // Open file URL in new tab
                window.open(data.file.url, '_blank');
            }
        }
    } catch (error) {
        console.error('Download error:', error);
        alert('Failed to download file');
    }
}

async function deleteFile(fileId) {
    if (!confirm('Are you sure you want to delete this file?')) {
        return;
    }

    try {
        const response = await window.authManager.apiRequest(`/upload/file/${fileId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            // Reload case files
            if (window.caseDetailsManager) {
                await window.caseDetailsManager.loadCaseFiles();
            }
        } else {
            throw new Error('Failed to delete file');
        }
    } catch (error) {
        console.error('Delete file error:', error);
        alert('Failed to delete file');
    }
}

// Initialize case details manager
document.addEventListener('DOMContentLoaded', () => {
    window.caseDetailsManager = new CaseDetailsManager();
});
