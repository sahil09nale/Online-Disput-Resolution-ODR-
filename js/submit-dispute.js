// Submit Dispute JavaScript - Handles case submission with proper backend integration
class DisputeSubmissionManager {
    constructor() {
        this.apiBase = '/api';
        this.user = null;
        this.form = null;
        this.submitButton = null;
        this.uploadedFiles = [];
        this.init();
    }

    async init() {
        try {
            // Check authentication
            await this.checkAuth();
            
            // Initialize form
            this.setupForm();
            
            // Set up event listeners
            this.setupEventListeners();
            
        } catch (error) {
            console.error('Dispute submission initialization failed:', error);
            this.redirectToLogin();
        }
    }

    async checkAuth() {
        const authResult = await window.authManager.checkAuth();
        if (!authResult.success) {
            throw new Error('Authentication required');
        }
        this.user = authResult.user;
    }

    setupForm() {
        this.form = document.getElementById('disputeForm');
        this.submitButton = this.form?.querySelector('button[type="submit"]');
        
        if (!this.form) {
            console.error('Dispute form not found');
            return;
        }
    }

    setupEventListeners() {
        if (this.form) {
            this.form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleSubmission();
            });
        }

        // File upload handling
        const fileInput = document.getElementById('evidenceFiles');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                this.handleFileSelection(e);
            });
        }

        // Real-time validation
        const requiredFields = ['caseTitle', 'disputeType', 'description'];
        requiredFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.addEventListener('blur', () => {
                    this.validateField(fieldId, field.value);
                });
                field.addEventListener('input', () => {
                    this.clearFieldError(fieldId);
                });
            }
        });
    }

    async handleSubmission() {
        try {
            this.setLoading(true);
            this.clearMessages();

            // Validate form
            if (!this.validateForm()) {
                this.setLoading(false);
                return;
            }

            // Collect form data
            const formData = this.collectFormData();

            // Submit case
            const result = await this.submitCase(formData);

            if (result.success) {
                this.showSuccess('Case submitted successfully! Redirecting to case details...');
                
                // Redirect to case details after short delay
                setTimeout(() => {
                    window.location.href = `case-details.html?id=${result.case.id}`;
                }, 2000);
            } else {
                this.showError(result.error || 'Failed to submit case. Please try again.');
                this.setLoading(false);
            }

        } catch (error) {
            console.error('Case submission error:', error);
            this.showError('Failed to submit case: ' + (error.message || 'Internal server error during case submission'));
            this.setLoading(false);
        }
    }

    collectFormData() {
        const formData = new FormData(this.form);
        
        return {
            caseTitle: formData.get('caseTitle'),
            disputeType: formData.get('disputeType'),
            description: formData.get('description'),
            disputeAmount: formData.get('disputeAmount'),
            preferredResolution: formData.get('preferredResolution'),
            urgencyLevel: formData.get('urgencyLevel') || 'medium'
        };
    }

    async submitCase(caseData) {
        try {
            const response = await window.authManager.apiRequest('/cases/submit', {
                method: 'POST',
                body: JSON.stringify(caseData)
            });

            const data = await response.json();

            if (response.ok && data.success) {
                return { success: true, case: data.case };
            } else {
                return { success: false, error: data.error || 'Submission failed' };
            }

        } catch (error) {
            console.error('API request failed:', error);
            return { success: false, error: error.message || 'Network error' };
        }
    }

    validateForm() {
        let isValid = true;

        // Required fields validation
        const requiredFields = [
            { id: 'caseTitle', name: 'Case Title', minLength: 5 },
            { id: 'disputeType', name: 'Dispute Type' },
            { id: 'description', name: 'Description', minLength: 20 }
        ];

        requiredFields.forEach(field => {
            const element = document.getElementById(field.id);
            const value = element?.value?.trim();

            if (!value) {
                this.showFieldError(field.id, `${field.name} is required`);
                isValid = false;
            } else if (field.minLength && value.length < field.minLength) {
                this.showFieldError(field.id, `${field.name} must be at least ${field.minLength} characters`);
                isValid = false;
            }
        });

        // Dispute amount validation (if provided)
        const disputeAmount = document.getElementById('disputeAmount')?.value;
        if (disputeAmount && (isNaN(disputeAmount) || parseFloat(disputeAmount) < 0)) {
            this.showFieldError('disputeAmount', 'Please enter a valid amount');
            isValid = false;
        }

        return isValid;
    }

    validateField(fieldId, value) {
        const field = document.getElementById(fieldId);
        if (!field) return;

        switch (fieldId) {
            case 'caseTitle':
                if (!value || value.length < 5) {
                    this.showFieldError(fieldId, 'Case title must be at least 5 characters');
                    return false;
                }
                break;
            case 'disputeType':
                if (!value) {
                    this.showFieldError(fieldId, 'Please select a dispute type');
                    return false;
                }
                break;
            case 'description':
                if (!value || value.length < 20) {
                    this.showFieldError(fieldId, 'Description must be at least 20 characters');
                    return false;
                }
                break;
        }

        this.clearFieldError(fieldId);
        return true;
    }

    handleFileSelection(event) {
        const files = Array.from(event.target.files);
        const maxFiles = 5;
        const maxSize = 10 * 1024 * 1024; // 10MB
        const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];

        // Validate file count
        if (files.length > maxFiles) {
            this.showError(`Maximum ${maxFiles} files allowed`);
            event.target.value = '';
            return;
        }

        // Validate each file
        for (const file of files) {
            if (file.size > maxSize) {
                this.showError(`File "${file.name}" is too large. Maximum size is 10MB.`);
                event.target.value = '';
                return;
            }

            if (!allowedTypes.includes(file.type)) {
                this.showError(`File "${file.name}" has an invalid type. Only JPG, PNG, PDF, DOC, DOCX, and TXT files are allowed.`);
                event.target.value = '';
                return;
            }
        }

        // Update file list display
        this.updateFileList(files);
    }

    updateFileList(files) {
        const fileList = document.getElementById('fileList');
        if (!fileList) return;

        if (files.length === 0) {
            fileList.innerHTML = '';
            return;
        }

        fileList.innerHTML = `
            <div style="margin-top: 12px; padding: 12px; background: #f8f9fa; border-radius: 6px;">
                <h4 style="margin: 0 0 8px 0; font-size: 14px; color: #495057;">Selected Files:</h4>
                ${files.map(file => `
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                        <span style="font-size: 16px;">${this.getFileIcon(file.type)}</span>
                        <span style="font-size: 13px;">${this.escapeHtml(file.name)} (${this.formatFileSize(file.size)})</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    setLoading(loading) {
        if (!this.submitButton) return;

        if (loading) {
            this.submitButton.disabled = true;
            this.submitButton.innerHTML = `
                <span style="display: inline-flex; align-items: center; gap: 8px;">
                    <span class="spinner"></span>
                    Submitting Case...
                </span>
            `;
        } else {
            this.submitButton.disabled = false;
            this.submitButton.innerHTML = 'Submit Dispute';
        }
    }

    showError(message) {
        this.showMessage(message, 'error');
    }

    showSuccess(message) {
        this.showMessage(message, 'success');
    }

    showMessage(message, type) {
        this.clearMessages();
        
        const messageDiv = document.createElement('div');
        messageDiv.id = 'submission-message';
        messageDiv.className = `${type}-message`;
        messageDiv.style.cssText = `
            background: ${type === 'error' ? '#fee' : '#efe'};
            color: ${type === 'error' ? '#c33' : '#363'};
            padding: 12px 16px;
            border-radius: 6px;
            margin-bottom: 16px;
            border: 1px solid ${type === 'error' ? '#fcc' : '#cfc'};
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 8px;
        `;
        messageDiv.innerHTML = `
            <span style="font-size: 16px;">${type === 'error' ? '⚠️' : '✅'}</span>
            <span>${this.escapeHtml(message)}</span>
        `;

        this.form.insertBefore(messageDiv, this.form.firstChild);

        // Auto-hide success messages after 5 seconds
        if (type === 'success') {
            setTimeout(() => {
                if (messageDiv.parentNode) {
                    messageDiv.parentNode.removeChild(messageDiv);
                }
            }, 5000);
        }
    }

    clearMessages() {
        const existingMessage = document.getElementById('submission-message');
        if (existingMessage) {
            existingMessage.remove();
        }
    }

    showFieldError(fieldId, message) {
        this.clearFieldError(fieldId);
        
        const field = document.getElementById(fieldId);
        if (!field) return;

        const errorDiv = document.createElement('div');
        errorDiv.id = `${fieldId}-error`;
        errorDiv.className = 'field-error';
        errorDiv.style.cssText = `
            color: #dc3545;
            font-size: 12px;
            margin-top: 4px;
        `;
        errorDiv.textContent = message;

        field.parentNode.appendChild(errorDiv);
        field.style.borderColor = '#dc3545';
    }

    clearFieldError(fieldId) {
        const errorDiv = document.getElementById(`${fieldId}-error`);
        if (errorDiv) {
            errorDiv.remove();
        }

        const field = document.getElementById(fieldId);
        if (field) {
            field.style.borderColor = '';
        }
    }

    redirectToLogin() {
        window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.pathname);
    }

    // Utility functions
    getFileIcon(mimeType) {
        if (mimeType.startsWith('image/')) return '🖼️';
        if (mimeType.includes('pdf')) return '📄';
        if (mimeType.includes('word')) return '📝';
        if (mimeType.includes('text')) return '📄';
        return '📎';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Global logout function
async function logout() {
    if (window.authManager) {
        await window.authManager.logout();
    }
    window.location.href = 'login.html';
}

// Initialize dispute submission manager
document.addEventListener('DOMContentLoaded', () => {
    window.disputeSubmissionManager = new DisputeSubmissionManager();
});

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
    
    .field-error {
        animation: fadeIn 0.2s ease-out;
    }
    
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
`;
document.head.appendChild(style);
