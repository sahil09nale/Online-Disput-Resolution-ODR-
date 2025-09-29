const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPG, PNG, PDF, DOC, DOCX, and TXT files are allowed.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
});

// Upload file to case (handles actual file upload to Supabase Storage)
router.post('/case/:caseId', upload.single('file'), async (req, res) => {
  try {
    const { caseId } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        error: 'No file provided',
        code: 'NO_FILE'
      });
    }

    // Validate case ownership
    const { data: case_, error: caseError } = await req.supabase
      .from('cases')
      .select('id, user_id')
      .eq('id', caseId)
      .eq('user_id', req.user.id)
      .single();

    if (caseError || !case_) {
      return res.status(404).json({
        error: 'Case not found or access denied',
        code: 'CASE_NOT_FOUND'
      });
    }

    // Generate unique filename
    const fileExtension = path.extname(file.originalname);
    const uniqueFilename = `${uuidv4()}${fileExtension}`;
    const filePath = `case-files/${caseId}/${uniqueFilename}`;

    // Upload file to Supabase Storage
    const { data: uploadData, error: uploadError } = await req.supabase.storage
      .from('case-files')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false
      });

    if (uploadError) {
      console.error('Supabase storage upload error:', uploadError);
      return res.status(400).json({
        error: 'Failed to upload file to storage',
        details: uploadError.message,
        code: 'STORAGE_UPLOAD_ERROR'
      });
    }

    // Record file metadata in database
    const { data: fileRecord, error: dbError } = await req.supabase
      .from('case_files')
      .insert({
        case_id: caseId,
        file_name: file.originalname,
        file_path: uploadData.path,
        file_size: file.size,
        file_type: file.mimetype,
        uploaded_by: req.user.id
      })
      .select()
      .single();

    if (dbError) {
      // If database insert fails, try to clean up the uploaded file
      await req.supabase.storage
        .from('case-files')
        .remove([uploadData.path]);
        
      return res.status(400).json({
        error: 'Failed to record file upload',
        code: 'RECORD_ERROR'
      });
    }

    // Update case timestamp
    await req.supabase
      .from('cases')
      .update({ last_updated: new Date().toISOString() })
      .eq('id', caseId);

    res.json({
      success: true,
      message: 'File uploaded successfully',
      file: fileRecord
    });

  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({
      error: 'Failed to upload file',
      code: 'UPLOAD_ERROR'
    });
  }
});

// Get files for a case
router.get('/case/:caseId/files', async (req, res) => {
  try {
    const { caseId } = req.params;

    // Verify case exists and user has access
    const { data: case_, error: caseError } = await req.supabase
      .from('cases')
      .select('id, user_id')
      .eq('id', caseId)
      .single();

    if (caseError || !case_) {
      return res.status(404).json({
        error: 'Case not found',
        code: 'CASE_NOT_FOUND'
      });
    }

    // Check if user owns case or is admin
    const hasAccess = case_.user_id === req.user.id || req.user.user_type === 'admin';
    
    if (!hasAccess) {
      return res.status(403).json({
        error: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }

    // Get files for the case from database
    const { data: files, error: filesError } = await req.supabase
      .from('case_files')
      .select('*')
      .eq('case_id', caseId)
      .order('uploaded_at', { ascending: false });

    if (filesError) {
      return res.status(400).json({
        error: 'Failed to fetch files',
        code: 'FETCH_ERROR'
      });
    }

    res.json({
      success: true,
      files: files || []
    });

  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({
      error: 'Failed to fetch files',
      code: 'FETCH_ERROR'
    });
  }
});

// Record file upload (after client-side upload to Supabase Storage)
router.post('/case/:caseId/record', async (req, res) => {
  try {
    const { caseId } = req.params;
    const { fileName, filePath, fileUrl, fileSize, fileType } = req.body;

    if (!fileName || !filePath || !fileUrl) {
      return res.status(400).json({
        error: 'Missing required file information',
        code: 'MISSING_FILE_INFO'
      });
    }

    // Verify case exists and user owns it
    const { data: case_, error: caseError } = await req.supabase
      .from('cases')
      .select('id, user_id')
      .eq('id', caseId)
      .eq('user_id', req.user.id)
      .single();

    if (caseError || !case_) {
      return res.status(404).json({
        error: 'Case not found or access denied',
        code: 'CASE_NOT_FOUND'
      });
    }

    // Record file in database
    const { data: fileRecord, error: dbError } = await req.supabase
      .from('case_files')
      .insert({
        case_id: caseId,
        file_name: fileName,
        file_path: filePath,
        file_url: fileUrl,
        file_size: fileSize,
        file_type: fileType,
        uploaded_by: req.user.id
      })
      .select()
      .single();

    if (dbError) {
      return res.status(400).json({
        error: 'Failed to record file upload',
        code: 'RECORD_ERROR'
      });
    }

    // Update case timestamp
    await req.supabase
      .from('cases')
      .update({ last_updated: new Date().toISOString() })
      .eq('id', caseId);

    res.json({
      success: true,
      message: 'File upload recorded successfully',
      file: fileRecord
    });

  } catch (error) {
    console.error('Record file error:', error);
    res.status(500).json({
      error: 'Failed to record file upload',
      code: 'RECORD_ERROR'
    });
  }
});

// Delete a file
router.delete('/file/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;

    // Get file record with case info
    const { data: file, error: fileError } = await req.supabase
      .from('case_files')
      .select(`
        *,
        case:cases!case_files_case_id_fkey(user_id)
      `)
      .eq('id', fileId)
      .single();

    if (fileError || !file) {
      return res.status(404).json({
        error: 'File not found',
        code: 'FILE_NOT_FOUND'
      });
    }

    // Check if user owns the case or uploaded the file
    const canDelete = file.case.user_id === req.user.id || 
                     file.uploaded_by === req.user.id || 
                     req.user.user_type === 'admin';

    if (!canDelete) {
      return res.status(403).json({
        error: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }

    // Delete from database (client should handle Supabase Storage deletion)
    const { error: dbError } = await req.supabase
      .from('case_files')
      .delete()
      .eq('id', fileId);

    if (dbError) {
      return res.status(400).json({
        error: 'Failed to delete file record',
        code: 'DELETE_ERROR'
      });
    }

    res.json({
      success: true,
      message: 'File record deleted successfully',
      filePath: file.file_path // Return path for client-side storage deletion
    });

  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({
      error: 'Failed to delete file',
      code: 'DELETE_ERROR'
    });
  }
});

// Get file download URL (return file info for client-side access)
router.get('/file/:fileId/download', async (req, res) => {
  try {
    const { fileId } = req.params;

    // Get file record with case info
    const { data: file, error: fileError } = await req.supabase
      .from('case_files')
      .select(`
        *,
        case:cases!case_files_case_id_fkey(user_id)
      `)
      .eq('id', fileId)
      .single();

    if (fileError || !file) {
      return res.status(404).json({
        error: 'File not found',
        code: 'FILE_NOT_FOUND'
      });
    }

    // Check access permissions
    const hasAccess = file.case.user_id === req.user.id || 
                     req.user.user_type === 'admin';

    if (!hasAccess) {
      return res.status(403).json({
        error: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }

    // Return file information for client-side download
    res.json({
      success: true,
      file: {
        id: file.id,
        name: file.file_name,
        path: file.file_path,
        url: file.file_url,
        size: file.file_size,
        type: file.file_type,
        uploadedAt: file.uploaded_at
      },
      downloadInstructions: {
        bucket: 'case-files',
        path: file.file_path,
        note: 'Use Supabase client to create signed URL for download'
      }
    });

  } catch (error) {
    console.error('Download info error:', error);
    res.status(500).json({
      error: 'Failed to get download information',
      code: 'DOWNLOAD_ERROR'
    });
  }
});

// Error handling middleware for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large. Maximum size is 10MB.',
        code: 'FILE_TOO_LARGE'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        error: 'Too many files. Maximum is 5 files per upload.',
        code: 'TOO_MANY_FILES'
      });
    }
  }

  if (error.message.includes('Invalid file type')) {
    return res.status(400).json({
      error: error.message,
      code: 'INVALID_FILE_TYPE'
    });
  }

  next(error);
});

module.exports = router;
