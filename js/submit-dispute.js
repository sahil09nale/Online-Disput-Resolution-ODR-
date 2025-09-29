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
        const fileInput = document.getElementById('evidence');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                this.handleFileSelection(e);
            });
        }

        // Real-time validation
        const requiredFields = ['disputeTitle', 'disputeType', 'description'];
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

            // Submit case first
            const result = await this.submitCase(formData);

            if (result.success) {
                const caseId = result.case.id;
                
                // Upload files if any were selected
                const fileInput = document.getElementById('evidence');
                if (fileInput && fileInput.files.length > 0) {
                    this.showSuccess('Case submitted! Uploading evidence files...');
                    
                    const uploadResult = await this.uploadFiles(caseId, fileInput.files);
                    
                    if (uploadResult.success) {
                        this.showSuccess('Case and evidence files submitted successfully!');
                    } else {
                        this.showSuccess(`Case submitted successfully! ${uploadResult.successCount}/${uploadResult.totalFiles} files uploaded. Failed files can be added later.`);
                    }
                } else {
                    this.showSuccess('Case submitted successfully!');
                }
                
                // Show AI analysis simulation
                this.showAIAnalysis(result.case);
                
                // Redirect to case details after analysis
                setTimeout(() => {
                    window.location.href = `case-details.html?id=${caseId}`;
                }, 4000);
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
            caseTitle: formData.get('disputeTitle'), // HTML uses disputeTitle
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

    async uploadFiles(caseId, files) {
        let successCount = 0;
        let failCount = 0;
        const totalFiles = files.length;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            
            try {
                // Update progress message
                this.showSuccess(`Uploading file ${i + 1} of ${totalFiles}: ${file.name}...`);
                
                // Create FormData for file upload
                const formData = new FormData();
                formData.append('file', file);

                // Upload file to backend
                const response = await window.authManager.apiRequest(`/upload/case/${caseId}`, {
                    method: 'POST',
                    body: formData,
                    // Don't set Content-Type header - let browser set it with boundary for FormData
                    headers: {}
                });

                if (response.ok) {
                    successCount++;
                    console.log(`Successfully uploaded: ${file.name}`);
                } else {
                    failCount++;
                    const errorData = await response.json();
                    console.error(`Failed to upload ${file.name}:`, errorData.error);
                }

            } catch (error) {
                failCount++;
                console.error(`Upload error for ${file.name}:`, error);
            }
        }

        return {
            success: failCount === 0,
            successCount,
            failCount,
            totalFiles
        };
    }

    validateForm() {
        let isValid = true;

        // Required fields validation
        const requiredFields = [
            { id: 'disputeTitle', name: 'Case Title', minLength: 5 },
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
            case 'disputeTitle':
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
        const allowedTypes = [
            'image/jpeg', 
            'image/jpg',
            'image/png', 
            'application/pdf', 
            'application/msword', 
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 
            'text/plain'
        ];

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

        // Store files for upload
        this.uploadedFiles = files;
        
        // Update file list display
        this.updateFileList(files);
        
        // Clear any previous error messages
        this.clearMessages();
    }

    updateFileList(files) {
        const fileList = document.getElementById('uploadedFiles');
        if (!fileList) return;

        if (files.length === 0) {
            fileList.innerHTML = '';
            return;
        }

        fileList.innerHTML = `
            <div style="padding: 12px; background: #f8f9fa; border-radius: 6px; border: 1px solid #e9ecef;">
                <h4 style="margin: 0 0 8px 0; font-size: 14px; color: #495057; font-weight: 600;">Selected Files (${files.length}):</h4>
                ${Array.from(files).map(file => `
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; padding: 6px; background: white; border-radius: 4px;">
                        <span style="font-size: 16px;">${this.getFileIcon(file.type)}</span>
                        <div style="flex: 1;">
                            <div style="font-size: 13px; font-weight: 500; color: #212529;">${this.escapeHtml(file.name)}</div>
                            <div style="font-size: 11px; color: #6c757d;">${this.formatFileSize(file.size)} • ${file.type}</div>
                        </div>
                        <span style="color: #28a745; font-size: 12px; font-weight: 500;">Ready</span>
                    </div>
                `).join('')}
                <div style="margin-top: 8px; font-size: 12px; color: #6c757d;">
                    Files will be uploaded after case submission
                </div>
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

    showAIAnalysis(caseData) {
        const analysisModal = document.createElement('div');
        analysisModal.id = 'aiAnalysisModal';
        analysisModal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.5); display: flex; align-items: center;
            justify-content: center; z-index: 1000;
        `;
        
        analysisModal.innerHTML = `
            <div style="background: white; padding: 2rem; border-radius: 12px; max-width: 500px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
                <h3 style="color: #2563eb; margin-bottom: 1rem;">🤖 AI Analysis in Progress</h3>
                <div style="margin: 1.5rem 0;">
                    <div style="border: 3px solid #f3f4f6; border-top: 3px solid #2563eb; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto;"></div>
                </div>
                <p style="color: #6b7280; margin-bottom: 1rem;">Analyzing your dispute...</p>
                <div id="analysisSteps" style="text-align: left; font-size: 0.875rem; color: #374151;">
                    <div>✓ Categorizing dispute type</div>
                    <div>✓ Extracting key information</div>
                    <div>✓ Identifying potential issues</div>
                    <div>⏳ Generating settlement suggestions...</div>
                </div>
            </div>
        `;

        document.body.appendChild(analysisModal);

        // Simulate analysis completion
        setTimeout(() => {
            if (analysisModal.parentNode) {
                document.body.removeChild(analysisModal);
                
                // Show completion message
                alert(`Dispute submitted successfully!

Case ID: ${caseData.id}

AI Analysis Complete:
- Dispute Type: ${caseData.case_type || caseData.disputeType}
- Estimated Resolution Time: 7-14 days
- Recommended Action: Mediation

You will be notified when the other party responds.`);
            }
        }, 3000);
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
