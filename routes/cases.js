const express = require('express');
const { body, validationResult } = require('express-validator');
// All database operations now use req.supabase (user-authenticated client)
const { sendCaseStatusEmail } = require('../utils/email');
const router = express.Router();

// Validation middleware
const validateCaseSubmission = [
  body('caseTitle').trim().isLength({ min: 5 }).withMessage('Case title must be at least 5 characters'),
  body('disputeType').isIn(['consumer', 'employment', 'contract', 'property', 'family', 'other']),
  body('description').trim().isLength({ min: 20 }).withMessage('Description must be at least 20 characters'),
  body('disputeAmount').optional().isNumeric().withMessage('Dispute amount must be a number'),
  body('respondentName').trim().isLength({ min: 2 }).withMessage('Respondent name is required'),
  body('respondentEmail').optional().isEmail(),
  body('respondentPhone').optional().trim(),
  body('preferredResolution').optional().trim()
];

// Get all cases for current user
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, status, disputeType } = req.query;
    const offset = (page - 1) * limit;

    let query = req.supabase
      .from('cases')
      .select(`
        *,
        case_files (
          id,
          file_name,
          file_url,
          uploaded_at
        )
      `)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }
    if (disputeType) {
      query = query.eq('dispute_type', disputeType);
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
    console.error('Get cases error:', error);
    res.status(500).json({
      error: 'Failed to fetch cases',
      code: 'FETCH_ERROR'
    });
  }
});

// Get specific case by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: case_, error } = await req.supabase
      .from('cases')
      .select(`
        *,
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
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !case_) {
      return res.status(404).json({
        error: 'Case not found',
        code: 'CASE_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      case: case_
    });

  } catch (error) {
    console.error('Get case error:', error);
    res.status(500).json({
      error: 'Failed to fetch case',
      code: 'FETCH_ERROR'
    });
  }
});

// Submit new case
router.post('/submit', validateCaseSubmission, async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const {
      caseTitle,
      disputeType,
      description,
      disputeAmount,
      respondentName,
      respondentEmail,
      respondentPhone,
      preferredResolution,
      urgencyLevel = 'medium'
    } = req.body;

    // Auto-assign department based on dispute type
    const departmentMapping = {
      'consumer': 'Consumer Affairs',
      'employment': 'Employment',
      'contract': 'Legal',
      'property': 'Property',
      'family': 'Family',
      'other': 'General'
    };

    const assignedDepartment = departmentMapping[disputeType] || 'General';

    // Create case in database
    const { data: newCase, error } = await req.supabase
      .from('cases')
      .insert({
        user_id: req.user.id,
        user_email: req.user.email,
        case_title: caseTitle,
        dispute_type: disputeType,
        description,
        dispute_amount: disputeAmount ? parseFloat(disputeAmount) : null,
        respondent_name: respondentName,
        respondent_email: respondentEmail,
        respondent_phone: respondentPhone,
        preferred_resolution: preferredResolution,
        urgency_level: urgencyLevel,
        assigned_department: assignedDepartment,
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({
        error: 'Failed to create case',
        code: 'CREATION_ERROR'
      });
    }

    // Send confirmation email (async)
    sendCaseStatusEmail(req.user.email, req.user.full_name, newCase, 'submitted')
      .catch(console.error);

    res.status(201).json({
      success: true,
      message: 'Case submitted successfully',
      case: newCase
    });

  } catch (error) {
    console.error('Case submission error:', error);
    res.status(500).json({
      error: 'Failed to submit case',
      code: 'SUBMISSION_ERROR'
    });
  }
});

// Update case (limited fields for users)
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const allowedUpdates = ['preferred_resolution', 'description'];
    const updates = {};

    // Filter allowed updates
    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
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

    const { data: updatedCase, error } = await req.supabase
      .from('cases')
      .update(updates)
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error || !updatedCase) {
      return res.status(404).json({
        error: 'Case not found or update failed',
        code: 'UPDATE_ERROR'
      });
    }

    res.json({
      success: true,
      message: 'Case updated successfully',
      case: updatedCase
    });

  } catch (error) {
    console.error('Case update error:', error);
    res.status(500).json({
      error: 'Failed to update case',
      code: 'UPDATE_ERROR'
    });
  }
});

// Get case statistics for dashboard
router.get('/stats/dashboard', async (req, res) => {
  try {
    // Get case counts by status
    const { data: statusStats, error: statusError } = await req.supabase
      .from('cases')
      .select('status')
      .eq('user_id', req.user.id);

    if (statusError) {
      return res.status(400).json({
        error: 'Failed to fetch statistics',
        code: 'STATS_ERROR'
      });
    }

    // Calculate statistics
    const stats = {
      total: statusStats.length,
      pending: statusStats.filter(c => c.status === 'pending').length,
      in_review: statusStats.filter(c => c.status === 'in_review').length,
      resolved: statusStats.filter(c => c.status === 'resolved').length,
      rejected: statusStats.filter(c => c.status === 'rejected').length
    };

    // Get recent cases
    const { data: recentCases, error: recentError } = await req.supabase
      .from('cases')
      .select('id, case_title, status, created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(5);

    if (recentError) {
      return res.status(400).json({
        error: 'Failed to fetch recent cases',
        code: 'RECENT_CASES_ERROR'
      });
    }

    res.json({
      success: true,
      stats,
      recentCases
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch dashboard statistics',
      code: 'STATS_ERROR'
    });
  }
});

// Delete case (soft delete - mark as cancelled)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Only allow deletion of pending cases
    const { data: case_, error: fetchError } = await req.supabase
      .from('cases')
      .select('status')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (fetchError || !case_) {
      return res.status(404).json({
        error: 'Case not found',
        code: 'CASE_NOT_FOUND'
      });
    }

    if (case_.status !== 'pending') {
      return res.status(400).json({
        error: 'Only pending cases can be cancelled',
        code: 'CANNOT_CANCEL'
      });
    }

    // Update status to cancelled instead of deleting
    const { error: updateError } = await req.supabase
      .from('cases')
      .update({ 
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', req.user.id);

    if (updateError) {
      return res.status(400).json({
        error: 'Failed to cancel case',
        code: 'CANCEL_ERROR'
      });
    }

    res.json({
      success: true,
      message: 'Case cancelled successfully'
    });

  } catch (error) {
    console.error('Case deletion error:', error);
    res.status(500).json({
      error: 'Failed to cancel case',
      code: 'CANCEL_ERROR'
    });
  }
});

module.exports = router;
