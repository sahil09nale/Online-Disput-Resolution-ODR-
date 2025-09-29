const express = require('express');
const { body, validationResult } = require('express-validator');
// All database operations now use req.supabase (user-authenticated client)
const { requireAdmin } = require('../middleware/auth');
const { sendCaseStatusEmail } = require('../utils/email');
const router = express.Router();

// Apply admin middleware to all routes
router.use(requireAdmin);

// Get all cases for admin's department
router.get('/cases', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, urgency, search } = req.query;
    const offset = (page - 1) * limit;

    // Map admin department to case types
    const departmentToCaseTypes = {
      'Consumer Affairs': ['consumer'],
      'Employment': ['employment'],
      'Legal': ['contract'],
      'Property': ['property'],
      'Family': ['family'],
      'General': ['other']
    };

    const caseTypes = departmentToCaseTypes[req.user.department] || ['other'];

    let query = req.supabase
      .from('cases')
      .select(`
        *,
        user:users!cases_user_id_fkey (
          id,
          full_name,
          email,
          phone
        ),
        case_files (
          id,
          file_name,
          file_url,
          uploaded_at
        ),
        resolved_by_user:users!cases_resolved_by_fkey (
          id,
          full_name,
          email
        )
      `)
      .in('case_type', caseTypes)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }
    if (urgency) {
      query = query.eq('urgency_level', urgency);
    }
    if (search) {
      query = query.or(`case_title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { data: cases, error, count } = await query;

    if (error) {
      return res.status(400).json({
        error: 'Failed to fetch cases',
        code: 'FETCH_ERROR'
      });
    }

    res.json({
      success: true,
      cases,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error('Admin get cases error:', error);
    res.status(500).json({
      error: 'Failed to fetch cases',
      code: 'FETCH_ERROR'
    });
  }
});

// Get specific case details (admin view)
router.get('/cases/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: case_, error } = await req.supabase
      .from('cases')
      .select(`
        *,
        user:users!cases_user_id_fkey (
          id,
          full_name,
          email,
          phone,
          address,
          user_type
        ),
        case_files (
          id,
          file_name,
          file_url,
          file_size,
          uploaded_at
        ),
        resolved_by_user:users!cases_resolved_by_fkey (
          id,
          full_name,
          email
        )
      `)
      .eq('id', id)
      .eq('assigned_department', req.user.department)
      .single();

    if (error || !case_) {
      return res.status(404).json({
        error: 'Case not found or access denied',
        code: 'CASE_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      case: case_
    });

  } catch (error) {
    console.error('Admin get case error:', error);
    res.status(500).json({
      error: 'Failed to fetch case',
      code: 'FETCH_ERROR'
    });
  }
});

// Update case status and resolution
router.patch('/cases/:id/status', [
  body('status').isIn(['pending', 'in_review', 'resolved', 'rejected']),
  body('resolution').optional().trim(),
  body('admin_notes').optional().trim()
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

    const { id } = req.params;
    const { status, resolution, admin_notes } = req.body;

    // Get current case to check department access
    const { data: currentCase, error: fetchError } = await req.supabase
      .from('cases')
      .select('*, user:users!cases_user_id_fkey(full_name, email)')
      .eq('id', id)
      .single();

    if (fetchError || !currentCase) {
      return res.status(404).json({
        error: 'Case not found',
        code: 'CASE_NOT_FOUND'
      });
    }

    // Check if admin has access to this case type
    const departmentToCaseTypes = {
      'Consumer Affairs': ['consumer'],
      'Employment': ['employment'],
      'Legal': ['contract'],
      'Property': ['property'],
      'Family': ['family'],
      'General': ['other']
    };

    const allowedCaseTypes = departmentToCaseTypes[req.user.department] || ['other'];
    if (!allowedCaseTypes.includes(currentCase.case_type)) {
      return res.status(403).json({
        error: 'Access denied - case not in your department',
        code: 'ACCESS_DENIED'
      });
    }

    // Prepare update data
    const updateData = {
      status,
      updated_at: new Date().toISOString()
    };

    // Add resolution data if case is being resolved
    if (status === 'resolved') {
      if (!resolution) {
        return res.status(400).json({
          error: 'Resolution is required when marking case as resolved',
          code: 'RESOLUTION_REQUIRED'
        });
      }
      updateData.resolution = resolution;
      updateData.resolved_by = req.user.id;
      updateData.resolved_at = new Date().toISOString();
    }

    // Add admin notes if provided
    if (admin_notes) {
      updateData.admin_notes = admin_notes;
    }

    // Update case
    const { data: updatedCase, error: updateError } = await req.supabase
      .from('cases')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      return res.status(400).json({
        error: 'Failed to update case',
        code: 'UPDATE_ERROR'
      });
    }

    // Send notification email to user (async)
    sendCaseStatusEmail(
      currentCase.user.email,
      currentCase.user.full_name,
      updatedCase,
      status
    ).catch(console.error);

    // Broadcast case status change via WebSocket
    if (req.broadcast) {
      req.broadcast.caseStatusChange(updatedCase, currentCase.status, status);
    }

    res.json({
      success: true,
      message: 'Case status updated successfully',
      case: updatedCase
    });

  } catch (error) {
    console.error('Admin update case error:', error);
    res.status(500).json({
      error: 'Failed to update case',
      code: 'UPDATE_ERROR'
    });
  }
});

// Assign case to different department
router.patch('/cases/:id/assign', [
  body('department').isIn(['Consumer Affairs', 'Employment', 'Legal', 'Property', 'Family', 'General']),
  body('reason').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { id } = req.params;
    const { department, reason } = req.body;

    // Verify case exists and admin has access
    const { data: case_, error: fetchError } = await req.supabase
      .from('cases')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !case_) {
      return res.status(404).json({
        error: 'Case not found',
        code: 'CASE_NOT_FOUND'
      });
    }

    // Check if admin has access to this case type
    const departmentToCaseTypes = {
      'Consumer Affairs': ['consumer'],
      'Employment': ['employment'],
      'Legal': ['contract'],
      'Property': ['property'],
      'Family': ['family'],
      'General': ['other']
    };

    const allowedCaseTypes = departmentToCaseTypes[req.user.department] || ['other'];
    if (!allowedCaseTypes.includes(case_.case_type)) {
      return res.status(403).json({
        error: 'Access denied - case not in your department',
        code: 'ACCESS_DENIED'
      });
    }

    // Update department assignment
    const { data: updatedCase, error: updateError } = await req.supabase
      .from('cases')
      .update({
        assigned_department: department,
        admin_notes: reason ? `Reassigned: ${reason}` : 'Reassigned to different department',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      return res.status(400).json({
        error: 'Failed to reassign case',
        code: 'REASSIGN_ERROR'
      });
    }

    res.json({
      success: true,
      message: 'Case reassigned successfully',
      case: updatedCase
    });

  } catch (error) {
    console.error('Admin reassign case error:', error);
    res.status(500).json({
      error: 'Failed to reassign case',
      code: 'REASSIGN_ERROR'
    });
  }
});

// Get department statistics
router.get('/stats/department', async (req, res) => {
  try {
    // Map admin department to case types
    const departmentToCaseTypes = {
      'Consumer Affairs': ['consumer'],
      'Employment': ['employment'],
      'Legal': ['contract'],
      'Property': ['property'],
      'Family': ['family'],
      'General': ['other']
    };

    const caseTypes = departmentToCaseTypes[req.user.department] || ['other'];

    // Get case counts by status for admin's department
    const { data: cases, error } = await req.supabase
      .from('cases')
      .select('status, urgency_level, created_at')
      .in('case_type', caseTypes);

    if (error) {
      return res.status(400).json({
        error: 'Failed to fetch statistics',
        code: 'STATS_ERROR'
      });
    }

    // Calculate statistics
    const stats = {
      total: cases.length,
      pending: cases.filter(c => c.status === 'pending').length,
      in_review: cases.filter(c => c.status === 'in_review').length,
      resolved: cases.filter(c => c.status === 'resolved').length,
      rejected: cases.filter(c => c.status === 'rejected').length,
      high_priority: cases.filter(c => c.urgency_level === 'high').length,
      medium_priority: cases.filter(c => c.urgency_level === 'medium').length,
      low_priority: cases.filter(c => c.urgency_level === 'low').length
    };

    // Calculate monthly trends (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyData = cases
      .filter(c => new Date(c.created_at) >= sixMonthsAgo)
      .reduce((acc, case_) => {
        const month = new Date(case_.created_at).toISOString().slice(0, 7); // YYYY-MM
        acc[month] = (acc[month] || 0) + 1;
        return acc;
      }, {});

    res.json({
      success: true,
      department: req.user.department,
      stats,
      monthlyTrends: monthlyData
    });

  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch department statistics',
      code: 'STATS_ERROR'
    });
  }
});

// Get all users (admin only)
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 20, userType, search, isActive } = req.query;
    const offset = (page - 1) * limit;

    let query = req.supabase
      .from('users')
      .select('id, email, full_name, user_type, department, is_active, created_at, last_login')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (userType) {
      query = query.eq('user_type', userType);
    }
    if (search) {
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    }
    if (isActive !== undefined) {
      query = query.eq('is_active', isActive === 'true');
    }

    const { data: users, error, count } = await query;

    if (error) {
      return res.status(400).json({
        error: 'Failed to fetch users',
        code: 'FETCH_ERROR'
      });
    }

    res.json({
      success: true,
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error('Admin get users error:', error);
    res.status(500).json({
      error: 'Failed to fetch users',
      code: 'FETCH_ERROR'
    });
  }
});

// Toggle user active status
router.patch('/users/:id/toggle-status', async (req, res) => {
  try {
    const { id } = req.params;

    // Get current user status
    const { data: user, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('is_active, full_name, email')
      .eq('id', id)
      .single();

    if (fetchError || !user) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Toggle status
    const newStatus = !user.is_active;

    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ 
        is_active: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateError) {
      return res.status(400).json({
        error: 'Failed to update user status',
        code: 'UPDATE_ERROR'
      });
    }

    res.json({
      success: true,
      message: `User ${newStatus ? 'activated' : 'deactivated'} successfully`,
      user: {
        id,
        is_active: newStatus
      }
    });

  } catch (error) {
    console.error('Admin toggle user status error:', error);
    res.status(500).json({
      error: 'Failed to update user status',
      code: 'UPDATE_ERROR'
    });
  }
});

module.exports = router;
