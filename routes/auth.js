const express = require('express');
const { body, validationResult } = require('express-validator');
const { supabaseClient } = require('../config/supabase');
const { sendWelcomeEmail } = require('../utils/email');
const router = express.Router();

// Validation middleware
const validateRegistration = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('fullName').trim().isLength({ min: 2 }).withMessage('Full name is required'),
  body('userType').isIn(['individual', 'lawyer', 'mediator', 'organization', 'admin']),
  body('phone').optional().isMobilePhone(),
  body('department').optional().trim(),
  body('licenseNumber').optional().trim()
];

const validateLogin = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required')
];

// Register new user
router.post('/register', validateRegistration, async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { email, password, fullName, userType, phone, department, licenseNumber, organization } = req.body;

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          user_type: userType,
          phone,
          department: userType === 'admin' ? department : null,
          license_number: userType === 'lawyer' ? licenseNumber : null,
          organization: userType === 'organization' ? organization : null
        }
      }
    });

    if (authError) {
      return res.status(400).json({
        error: authError.message,
        code: 'AUTH_ERROR'
      });
    }

    if (!authData.user) {
      return res.status(400).json({
        error: 'User creation failed',
        code: 'USER_CREATION_ERROR'
      });
    }

    // Send welcome email (async, don't wait)
    sendWelcomeEmail(email, fullName).catch(console.error);

    res.status(201).json({
      success: true,
      message: 'User registered successfully. Please check your email to confirm your account.',
      user: {
        id: authData.user.id,
        email: authData.user.email,
        user_metadata: authData.user.user_metadata
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Registration failed',
      code: 'REGISTRATION_ERROR'
    });
  }
});

// Login user
router.post('/login', validateLogin, async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { email, password } = req.body;

    // Sign in with Supabase
    const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      return res.status(401).json({
        error: authError.message,
        code: 'LOGIN_ERROR'
      });
    }

    // User profile data is now in user_metadata from auth
    const profile = {
      id: authData.user.id,
      email: authData.user.email,
      full_name: authData.user.user_metadata?.full_name,
      user_type: authData.user.user_metadata?.user_type,
      phone: authData.user.user_metadata?.phone,
      department: authData.user.user_metadata?.department,
      license_number: authData.user.user_metadata?.license_number,
      organization: authData.user.user_metadata?.organization,
      is_active: true // New users are active by default
    };

    // Set HTTP-only cookie with session
    res.cookie('sb-access-token', authData.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: authData.user.id,
        email: authData.user.email,
        profile
      },
      session: {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
        expires_at: authData.session.expires_at
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      code: 'LOGIN_ERROR'
    });
  }
});

// Logout user
router.post('/logout', async (req, res) => {
  try {
    // Clear the HTTP-only cookie
    res.clearCookie('sb-access-token');

    res.json({
      success: true,
      message: 'Logout successful'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Logout failed',
      code: 'LOGOUT_ERROR'
    });
  }
});

// Refresh token
router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({
        error: 'Refresh token required',
        code: 'MISSING_REFRESH_TOKEN'
      });
    }

    const { data, error } = await supabaseClient.auth.refreshSession({
      refresh_token
    });

    if (error) {
      return res.status(401).json({
        error: error.message,
        code: 'REFRESH_ERROR'
      });
    }

    // Update HTTP-only cookie
    res.cookie('sb-access-token', data.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      success: true,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at
      }
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      error: 'Token refresh failed',
      code: 'REFRESH_ERROR'
    });
  }
});

// Get current user
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        error: 'Access token required',
        code: 'MISSING_TOKEN'
      });
    }

    const { data: { user }, error } = await supabaseClient.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }

    // Get profile from user metadata
    const profile = {
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name,
      user_type: user.user_metadata?.user_type,
      phone: user.user_metadata?.phone,
      department: user.user_metadata?.department,
      license_number: user.user_metadata?.license_number,
      organization: user.user_metadata?.organization,
      is_active: true
    };

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        profile
      }
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      error: 'Failed to get user',
      code: 'GET_USER_ERROR'
    });
  }
});

module.exports = router;
