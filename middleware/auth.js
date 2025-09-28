const { supabaseClient, createUserClient } = require('../config/supabase');

// Middleware to authenticate requests using Supabase JWT
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        error: 'Access token required',
        code: 'MISSING_TOKEN'
      });
    }

    // Create authenticated client with user token
    const userClient = createUserClient(token);

    // Verify the JWT token with Supabase
    const { data: { user }, error } = await userClient.auth.getUser();

    if (error || !user) {
      return res.status(401).json({
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
    }

    // Get user profile from user metadata (no database table needed)
    const profile = {
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name,
      user_type: user.user_metadata?.user_type || 'individual',
      phone: user.user_metadata?.phone,
      department: user.user_metadata?.department,
      license_number: user.user_metadata?.license_number,
      organization: user.user_metadata?.organization,
      is_active: true // All authenticated users are considered active
    };

    // Attach user info to request
    req.user = {
      access_token: token,
      ...profile
    };

    // Attach authenticated Supabase client
    req.supabase = userClient;

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({
      error: 'Authentication service error',
      code: 'AUTH_SERVICE_ERROR'
    });
  }
};

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.user_type !== 'admin') {
    return res.status(403).json({
      error: 'Admin access required',
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }
  next();
};

// Middleware to check specific user types
const requireUserType = (allowedTypes) => {
  return (req, res, next) => {
    if (!req.user || !allowedTypes.includes(req.user.user_type)) {
      return res.status(403).json({
        error: `Access restricted to: ${allowedTypes.join(', ')}`,
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }
    next();
  };
};

// Middleware to check if user owns resource or is admin
const requireOwnershipOrAdmin = (userIdField = 'user_id') => {
  return (req, res, next) => {
    const resourceUserId = req.params[userIdField] || req.body[userIdField];
    
    if (req.user.user_type === 'admin' || req.user.id === resourceUserId) {
      next();
    } else {
      return res.status(403).json({
        error: 'Access denied: insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }
  };
};

module.exports = {
  authenticateToken,
  requireAdmin,
  requireUserType,
  requireOwnershipOrAdmin
};
