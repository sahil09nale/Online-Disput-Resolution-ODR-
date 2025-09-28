// Secure ResolveNOW Backend Server
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const path = require('path');
require('dotenv').config();

// Initialize Supabase (server-side only for admin operations)
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

let supabase = null;
if (supabaseUrl && supabaseAnonKey) {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
    console.log('✅ Supabase initialized for server operations');
} else {
    console.warn('⚠️ Supabase not configured properly');
}

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware with relaxed CSP for development
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.skypack.dev"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://*.supabase.co"]
        }
    }
}));
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 auth requests per windowMs
    message: 'Too many authentication attempts, please try again later.'
});

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use(express.static('.'));

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secure-secret-key-change-this-in-production';

// Authentication middleware
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Access token required' });
    }

    try {
        if (!supabase) {
            return res.status(500).json({ message: 'Database not configured' });
        }
        
        const { data: { user }, error } = await supabase.auth.getUser(token);
        
        if (error || !user) {
            return res.status(401).json({ message: 'Invalid token' });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Token verification failed:', error);
        return res.status(403).json({ message: 'Invalid or expired token' });
    }
};

// Admin authorization middleware
const requireAdmin = async (req, res, next) => {
    try {
        const { data: profile } = await supabase
            .from('users')
            .select('user_type')
            .eq('id', req.user.id)
            .single();
            
        if (!profile || profile.user_type !== 'admin') {
            return res.status(403).json({ message: 'Admin access required' });
        }
        next();
    } catch (error) {
        return res.status(403).json({ message: 'Admin verification failed' });
    }
};

// Validation helpers
const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

const validatePassword = (password) => {
    return password && password.length >= 8;
};

// CONFIGURATION ENDPOINT
app.get('/api/config', (req, res) => {
    try {
        // Only send safe, public configuration to frontend
        const config = {
            API_BASE_URL: req.protocol + '://' + req.get('host') + '/api',
            ENDPOINTS: {
                LOGIN: '/auth/login',
                REGISTER: '/auth/register',
                REGISTER_ADMIN: '/auth/register-admin',
                LOGOUT: '/auth/logout',
                VERIFY_TOKEN: '/auth/verify',
                CASES: '/cases',
                SUBMIT_CASE: '/cases/submit',
                UPLOAD_FILE: '/cases/upload',
                ADMIN_CASES: '/admin/cases',
                ADMIN_RESOLVE: '/admin/resolve',
                ADMIN_ASSIGN: '/admin/assign'
            },
            STORAGE_KEYS: {
                AUTH_TOKEN: 'auth_token',
                USER_DATA: 'user_data',
                LEGACY_USER_DATA: 'userData',
                LEGACY_LOGIN_STATUS: 'isLoggedIn'
            },
            SUPABASE: {
                URL: process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL',
                ANON_KEY: process.env.SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY'
            },
            DATABASE_PROVIDER: 'supabase'
        };

        res.json(config);
    } catch (error) {
        console.error('Configuration endpoint error:', error);
        res.status(500).json({ message: 'Failed to load configuration' });
    }
});

// AUTHENTICATION ENDPOINTS

// User Registration - handled by Supabase Auth
app.post('/api/auth/register', authLimiter, async (req, res) => {
    res.status(200).json({ 
        success: true, 
        message: 'Registration handled by client-side Supabase Auth' 
    });
});

// User Login - handled by Supabase Auth
app.post('/api/auth/login', authLimiter, async (req, res) => {
    res.status(200).json({ 
        success: true, 
        message: 'Login handled by client-side Supabase Auth' 
    });
});

// Token Verification
app.get('/api/auth/verify', authenticateToken, (req, res) => {
    const { password, ...userResponse } = req.user;
    res.json({ success: true, user: userResponse });
});

// Logout (optional - mainly for cleanup)
app.post('/api/auth/logout', authenticateToken, (req, res) => {
    // In a more sophisticated setup, you might blacklist the token
    res.json({ success: true, message: 'Logged out successfully' });
});

// CASE MANAGEMENT ENDPOINTS

// Submit new case
app.post('/api/cases/submit', authenticateToken, async (req, res) => {
    try {
        const {
            disputeType,
            disputeAmount,
            description,
            respondentName,
            respondentEmail,
            respondentPhone,
            evidenceFiles
        } = req.body;

        // Validation
        if (!disputeType || !description || !respondentName) {
            return res.status(400).json({ message: 'Required fields missing' });
        }

        if (disputeAmount && (isNaN(disputeAmount) || disputeAmount < 0)) {
            return res.status(400).json({ message: 'Invalid dispute amount' });
        }

        // Create case in Supabase
        const caseData = {
            user_id: req.user.id,
            dispute_type: disputeType,
            dispute_amount: disputeAmount || 0,
            description,
            respondent_name: respondentName,
            respondent_email: respondentEmail || null,
            respondent_phone: respondentPhone || null,
            status: 'Pending',
            case_number: `ODR${Date.now()}`,
            evidence_files: evidenceFiles || [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('cases')
            .insert([caseData])
            .select()
            .single();

        if (error) {
            throw error;
        }

        res.status(201).json({
            success: true,
            case: data
        });

    } catch (error) {
        console.error('Case submission error:', error);
        res.status(500).json({ message: 'Internal server error during case submission' });
    }
});

// Get user's cases
app.get('/api/cases', authenticateToken, async (req, res) => {
    try {
        const { data: cases, error } = await supabase
            .from('cases')
            .select('*')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false });

        if (error) {
            throw error;
        }

        res.json({ success: true, cases: cases || [] });

    } catch (error) {
        console.error('Fetch cases error:', error);
        res.status(500).json({ message: 'Internal server error while fetching cases' });
    }
});

// Get specific case
app.get('/api/cases/:caseId', authenticateToken, async (req, res) => {
    try {
        const { data: caseData, error } = await supabase
            .from('cases')
            .select('*')
            .eq('id', req.params.caseId)
            .single();
        
        if (error || !caseData) {
            return res.status(404).json({ message: 'Case not found' });
        }
        
        // Check if user owns this case or is admin
        const { data: profile } = await supabase
            .from('users')
            .select('user_type')
            .eq('id', req.user.id)
            .single();
            
        if (caseData.user_id !== req.user.id && profile?.user_type !== 'admin') {
            return res.status(403).json({ message: 'Access denied' });
        }

        res.json({
            success: true,
            case: caseData
        });

    } catch (error) {
        console.error('Get case error:', error);
        res.status(500).json({ message: 'Internal server error while fetching case' });
    }
});

// ADMIN ENDPOINTS

// Verify admin access
app.get('/api/admin/verify', authenticateToken, requireAdmin, (req, res) => {
    res.json({ success: true, message: 'Admin access verified' });
});

// Get all cases for admin
app.get('/api/admin/cases', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { department } = req.query;
        
        let query = supabase
            .from('cases')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (department) {
            query = query.eq('dispute_type', department);
        }

        const { data: cases, error } = await query;
        
        if (error) {
            throw error;
        }

        res.json({ success: true, cases: cases || [] });

    } catch (error) {
        console.error('Admin fetch cases error:', error);
        res.status(500).json({ message: 'Internal server error while fetching admin cases' });
    }
});

// Resolve case (admin only)
app.post('/api/admin/resolve', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { caseId, resolution, outcome } = req.body;

        if (!caseId || !resolution || !outcome) {
            return res.status(400).json({ message: 'Case ID, resolution, and outcome are required' });
        }

        const updateData = {
            status: 'Resolved',
            resolution,
            outcome,
            resolved_by: req.user.id,
            resolved_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('cases')
            .update(updateData)
            .eq('id', caseId)
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ message: 'Case not found' });
            }
            throw error;
        }

        res.json({ success: true, case: data });

    } catch (error) {
        console.error('Resolve case error:', error);
        res.status(500).json({ message: 'Internal server error while resolving case' });
    }
});

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ message: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ message: 'Endpoint not found' });
});

app.listen(PORT, () => {
    console.log(`🔒 Secure ResolveNOW server running on port ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});