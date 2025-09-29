// WebSocket Integration Middleware
// This middleware adds WebSocket broadcasting capabilities to routes

const websocketIntegration = (wsManager) => {
    return (req, res, next) => {
        // Add WebSocket broadcasting methods to the request object
        req.broadcast = {
            // Broadcast case updates
            caseUpdate: (caseData, excludeUserId = null) => {
                if (wsManager) {
                    wsManager.broadcastCaseUpdate(caseData, excludeUserId);
                }
            },

            // Broadcast new case creation
            newCase: (caseData) => {
                if (wsManager) {
                    wsManager.broadcastNewCase(caseData);
                }
            },

            // Broadcast case status changes
            caseStatusChange: (caseData, oldStatus, newStatus) => {
                if (wsManager) {
                    wsManager.broadcastCaseStatusChange(caseData, oldStatus, newStatus);
                }
            },

            // Broadcast statistics updates
            statsUpdate: (stats, targetUserId = null) => {
                if (wsManager) {
                    wsManager.broadcastStatsUpdate(stats, targetUserId);
                }
            },

            // Broadcast dashboard refresh
            dashboardRefresh: (targetUserId = null) => {
                if (wsManager) {
                    wsManager.broadcastDashboardRefresh(targetUserId);
                }
            }
        };

        next();
    };
};

module.exports = websocketIntegration;
