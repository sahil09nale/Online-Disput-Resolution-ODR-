const express = require('express');
const { body, validationResult } = require('express-validator');
// All database operations now use req.supabase (user-authenticated client)
const router = express.Router();

// Get current user profile
router.get('/profile', async (req, res) => {
  try {
    // Profile data comes from user metadata (already available in req.user)
    const profile = {
      id: req.user.id,
      email: req.user.email,
      full_name: req.user.full_name,
      user_type: req.user.user_type,
      phone: req.user.phone,
      department: req.user.department,
      license_number: req.user.license_number,
      organization: req.user.organization,
      is_active: req.user.is_active
    };

    res.json({
      success: true,
      profile
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      error: 'Failed to fetch profile',
      code: 'FETCH_ERROR'
    });
  }
});

// Update user profile
router.patch('/profile', [
  body('full_name').optional().trim().isLength({ min: 2 }),
  body('phone').optional().isMobilePhone(),
  body('address').optional().trim(),
  body('organization').optional().trim(),
  body('license_number').optional().trim()
], async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const allowedUpdates = ['full_name', 'phone', 'address', 'organization', 'license_number'];
    const updates = {};

    // Filter allowed updates
    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key) && req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'No valid fields to update',
        code: 'NO_UPDATES'
      });
    }

    // Add updated timestamp
    updates.updated_at = new Date().toISOString();

    // Note: Profile updates now need to be handled via Supabase Auth user metadata updates
    // This requires a different approach since we're not using service role
    res.status(501).json({
      error: 'Profile updates not implemented without service role',
      code: 'NOT_IMPLEMENTED'
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      error: 'Failed to update profile',
      code: 'UPDATE_ERROR'
    });
  }
});

// Change password
router.patch('/change-password', [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
], async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { currentPassword, newPassword } = req.body;

    // Password changes require service role - not implemented without it
    res.status(501).json({
      error: 'Password changes not implemented without service role',
      code: 'NOT_IMPLEMENTED'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      error: 'Failed to change password',
      code: 'PASSWORD_CHANGE_ERROR'
    });
  }
});

// Get user notifications/activity
router.get('/notifications', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Get user's cases with recent updates as notifications
    const { data: notifications, error, count } = await req.supabase
      .from('cases')
      .select(`
        id,
        case_title,
        status,
        updated_at,
        resolved_at,
        admin_notes
      `)
      .eq('user_id', req.user.id)
      .not('updated_at', 'eq', 'created_at') // Only cases that have been updated
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(400).json({
        error: 'Failed to fetch notifications',
        code: 'FETCH_ERROR'
      });
    }

    // Format notifications
    const formattedNotifications = notifications.map(case_ => ({
      id: case_.id,
      type: 'case_update',
      title: `Case Update: ${case_.case_title}`,
      message: `Your case status has been updated to: ${case_.status}`,
      timestamp: case_.updated_at,
      read: false, // Could be tracked in a separate table
      data: {
        caseId: case_.id,
        status: case_.status,
        notes: case_.admin_notes
      }
    }));

    res.json({
      success: true,
      notifications: formattedNotifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      error: 'Failed to fetch notifications',
      code: 'FETCH_ERROR'
    });
  }
});

// Delete user account (soft delete)
router.delete('/account', [
  body('password').notEmpty().withMessage('Password confirmation required'),
  body('confirmation').equals('DELETE').withMessage('Please type DELETE to confirm')
], async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { password } = req.body;

    // Account deletion requires service role - not implemented without it
    res.status(501).json({
      error: 'Account deletion not implemented without service role',
      code: 'NOT_IMPLEMENTED'
    });

  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      error: 'Failed to delete account',
      code: 'DELETE_ERROR'
    });
  }
});

// Get user dashboard data
router.get('/dashboard', async (req, res) => {
  try {
    // Get case statistics
    const { data: cases, error: casesError } = await req.supabase
      .from('cases')
      .select('status, created_at, dispute_amount')
      .eq('user_id', req.user.id);

    if (casesError) {
      return res.status(400).json({
        error: 'Failed to fetch dashboard data',
        code: 'FETCH_ERROR'
      });
    }

    // Calculate statistics
    const stats = {
      totalCases: cases.length,
      pendingCases: cases.filter(c => c.status === 'pending').length,
      inReviewCases: cases.filter(c => c.status === 'in_review').length,
      resolvedCases: cases.filter(c => c.status === 'resolved').length,
      totalDisputeAmount: cases.reduce((sum, c) => sum + (c.dispute_amount || 0), 0)
    };

    // Get recent activity (last 5 cases)
    const { data: recentCases, error: recentError } = await req.supabase
      .from('cases')
      .select('id, case_title, status, created_at, updated_at')
      .eq('user_id', req.user.id)
      .order('updated_at', { ascending: false })
      .limit(5);

    if (recentError) {
      return res.status(400).json({
        error: 'Failed to fetch recent activity',
        code: 'FETCH_ERROR'
      });
    }

    res.json({
      success: true,
      dashboard: {
        stats,
        recentActivity: recentCases,
        user: {
          name: req.user.full_name,
          email: req.user.email,
          userType: req.user.user_type,
          memberSince: req.user.created_at
        }
      }
    });

  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({
      error: 'Failed to fetch dashboard data',
      code: 'FETCH_ERROR'
    });
  }
});

module.exports = router;
