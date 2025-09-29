const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

class WebSocketManager {
    constructor(server) {
        this.wss = new WebSocket.Server({ 
            server,
            path: '/ws/dashboard'
        });
        
        this.clients = new Map(); // userId -> Set of WebSocket connections
        this.adminClients = new Set(); // Admin connections
        
        this.setupWebSocketServer();
        console.log('WebSocket server initialized on /ws/dashboard');
    }

    setupWebSocketServer() {
        this.wss.on('connection', (ws, req) => {
            console.log('New WebSocket connection established');
            
            ws.isAlive = true;
            ws.userId = null;
            ws.isAdmin = false;
            
            // Handle pong responses for keepalive
            ws.on('pong', () => {
                ws.isAlive = true;
            });

            // Handle incoming messages
            ws.on('message', async (message) => {
                try {
                    const data = JSON.parse(message);
                    await this.handleMessage(ws, data);
                } catch (error) {
                    console.error('WebSocket message error:', error);
                    this.sendError(ws, 'Invalid message format');
                }
            });

            // Handle connection close
            ws.on('close', () => {
                this.removeClient(ws);
                console.log('WebSocket connection closed');
            });

            // Handle connection errors
            ws.on('error', (error) => {
                console.error('WebSocket error:', error);
                this.removeClient(ws);
            });
        });

        // Set up heartbeat to detect broken connections
        this.setupHeartbeat();
    }

    async handleMessage(ws, data) {
        switch (data.type) {
            case 'auth':
                await this.authenticateClient(ws, data.token);
                break;
            case 'subscribe':
                this.handleSubscription(ws, data.channel);
                break;
            case 'ping':
                this.sendMessage(ws, { type: 'pong' });
                break;
            default:
                console.log('Unknown WebSocket message type:', data.type);
        }
    }

    async authenticateClient(ws, token) {
        try {
            if (!token) {
                this.sendError(ws, 'Authentication token required');
                return;
            }

            // Verify JWT token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const userId = decoded.userId;

            // Set client info
            ws.userId = userId;
            ws.isAdmin = decoded.role === 'admin';
            ws.isAuthenticated = true;

            // Add to appropriate client collections
            if (!this.clients.has(userId)) {
                this.clients.set(userId, new Set());
            }
            this.clients.get(userId).add(ws);

            if (ws.isAdmin) {
                this.adminClients.add(ws);
            }

            // Send authentication success
            this.sendMessage(ws, {
                type: 'auth_success',
                userId: userId,
                isAdmin: ws.isAdmin
            });

            console.log(`WebSocket client authenticated: ${userId} (admin: ${ws.isAdmin})`);

        } catch (error) {
            console.error('WebSocket authentication error:', error);
            this.sendError(ws, 'Authentication failed');
            ws.close();
        }
    }

    handleSubscription(ws, channel) {
        if (!ws.isAuthenticated) {
            this.sendError(ws, 'Authentication required');
            return;
        }

        // Handle channel subscriptions (for future expansion)
        ws.subscribedChannels = ws.subscribedChannels || new Set();
        ws.subscribedChannels.add(channel);

        this.sendMessage(ws, {
            type: 'subscription_success',
            channel: channel
        });
    }

    removeClient(ws) {
        if (ws.userId && this.clients.has(ws.userId)) {
            this.clients.get(ws.userId).delete(ws);
            if (this.clients.get(ws.userId).size === 0) {
                this.clients.delete(ws.userId);
            }
        }

        if (ws.isAdmin) {
            this.adminClients.delete(ws);
        }
    }

    setupHeartbeat() {
        // Send ping to all clients every 30 seconds
        setInterval(() => {
            this.wss.clients.forEach((ws) => {
                if (!ws.isAlive) {
                    console.log('Terminating dead WebSocket connection');
                    return ws.terminate();
                }

                ws.isAlive = false;
                ws.ping();
            });
        }, 30000);
    }

    sendMessage(ws, message) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }

    sendError(ws, error) {
        this.sendMessage(ws, {
            type: 'error',
            error: error
        });
    }

    // Public methods for broadcasting updates

    broadcastCaseUpdate(caseData, excludeUserId = null) {
        const message = {
            type: 'case_update',
            case: caseData,
            timestamp: new Date().toISOString()
        };

        // Send to case owner
        if (caseData.user_id && caseData.user_id !== excludeUserId) {
            this.sendToUser(caseData.user_id, message);
        }

        // Send to all admin clients
        this.broadcastToAdmins(message);

        console.log(`Broadcasted case update for case ${caseData.id}`);
    }

    broadcastStatsUpdate(stats, targetUserId = null) {
        const message = {
            type: 'stats_update',
            stats: stats,
            timestamp: new Date().toISOString()
        };

        if (targetUserId) {
            // Send to specific user
            this.sendToUser(targetUserId, message);
        } else {
            // Send to all authenticated clients
            this.broadcastToAll(message);
        }

        console.log('Broadcasted stats update');
    }

    broadcastDashboardRefresh(targetUserId = null) {
        const message = {
            type: 'dashboard_refresh',
            timestamp: new Date().toISOString()
        };

        if (targetUserId) {
            this.sendToUser(targetUserId, message);
        } else {
            this.broadcastToAll(message);
        }

        console.log('Broadcasted dashboard refresh');
    }

    broadcastNewCase(caseData) {
        const message = {
            type: 'new_case',
            case: caseData,
            timestamp: new Date().toISOString()
        };

        // Notify all admins about new cases
        this.broadcastToAdmins(message);

        console.log(`Broadcasted new case notification: ${caseData.id}`);
    }

    broadcastCaseStatusChange(caseData, oldStatus, newStatus) {
        const message = {
            type: 'case_status_change',
            case: caseData,
            oldStatus: oldStatus,
            newStatus: newStatus,
            timestamp: new Date().toISOString()
        };

        // Send to case owner
        if (caseData.user_id) {
            this.sendToUser(caseData.user_id, message);
        }

        // Send to admins
        this.broadcastToAdmins(message);

        console.log(`Broadcasted status change for case ${caseData.id}: ${oldStatus} → ${newStatus}`);
    }

    // Helper methods

    sendToUser(userId, message) {
        const userConnections = this.clients.get(userId);
        if (userConnections) {
            userConnections.forEach(ws => {
                this.sendMessage(ws, message);
            });
        }
    }

    broadcastToAdmins(message) {
        this.adminClients.forEach(ws => {
            this.sendMessage(ws, message);
        });
    }

    broadcastToAll(message) {
        this.wss.clients.forEach(ws => {
            if (ws.isAuthenticated) {
                this.sendMessage(ws, message);
            }
        });
    }

    // Get connection statistics
    getStats() {
        return {
            totalConnections: this.wss.clients.size,
            authenticatedUsers: this.clients.size,
            adminConnections: this.adminClients.size,
            activeConnections: Array.from(this.wss.clients).filter(ws => ws.readyState === WebSocket.OPEN).length
        };
    }
}

module.exports = WebSocketManager;
