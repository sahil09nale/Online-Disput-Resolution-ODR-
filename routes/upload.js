const express = require('express');
const router = express.Router();

// Upload files for a case
router.post('/case/:caseId', async (req, res) => {
  res.status(501).json({
    error: 'File upload not implemented without service role',
    code: 'NOT_IMPLEMENTED'
  });
});

// Get files for a case
router.get('/case/:caseId', async (req, res) => {
  res.status(501).json({
    error: 'File operations not implemented without service role',
    code: 'NOT_IMPLEMENTED'
  });
});

// Delete a file
router.delete('/file/:fileId', async (req, res) => {
  res.status(501).json({
    error: 'File operations not implemented without service role',
    code: 'NOT_IMPLEMENTED'
  });
});

// Get file download URL
router.get('/file/:fileId/download', async (req, res) => {
  res.status(501).json({
    error: 'File operations not implemented without service role',
    code: 'NOT_IMPLEMENTED'
  });
});

module.exports = router;
