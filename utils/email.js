const nodemailer = require('nodemailer');

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransporter({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

// Email templates
const emailTemplates = {
  welcome: (userName) => ({
    subject: 'Welcome to ResolveNOW - Your Account is Ready!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #2c5aa0 0%, #2ca58d 100%); padding: 40px 20px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to ResolveNOW</h1>
          <p style="color: #e8f4f8; margin: 10px 0 0 0; font-size: 16px;">AI-Powered Dispute Resolution Platform</p>
        </div>
        
        <div style="padding: 40px 20px; background: #f8f9fa;">
          <h2 style="color: #2c5aa0; margin-bottom: 20px;">Hello ${userName}!</h2>
          
          <p style="color: #333; line-height: 1.6; margin-bottom: 20px;">
            Thank you for joining ResolveNOW! Your account has been successfully created and you're now ready to access our comprehensive dispute resolution platform.
          </p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2ca58d;">
            <h3 style="color: #2ca58d; margin-top: 0;">What you can do now:</h3>
            <ul style="color: #333; line-height: 1.8;">
              <li>Submit dispute cases with our intelligent case submission system</li>
              <li>Track your cases in real-time through your dashboard</li>
              <li>Communicate with mediators and legal professionals</li>
              <li>Access AI-powered insights and recommendations</li>
              <li>Upload evidence and supporting documents securely</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/pages/login.html" 
               style="background: #2ca58d; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              Sign In to Your Dashboard
            </a>
          </div>
          
          <p style="color: #666; font-size: 14px; line-height: 1.6;">
            If you have any questions or need assistance, please don't hesitate to contact our support team at 
            <a href="mailto:support@resolvenow.com" style="color: #2ca58d;">support@resolvenow.com</a>
          </p>
        </div>
        
        <div style="background: #2c5aa0; color: white; padding: 20px; text-align: center; font-size: 14px;">
          <p style="margin: 0;">© 2024 ResolveNOW. Democratizing Justice Through Technology.</p>
        </div>
      </div>
    `
  }),

  caseStatus: (userName, case_, status) => {
    const statusMessages = {
      submitted: 'Your case has been successfully submitted and is now under review.',
      in_review: 'Your case is currently being reviewed by our team.',
      resolved: 'Great news! Your case has been resolved.',
      rejected: 'Your case has been reviewed and unfortunately cannot be processed at this time.'
    };

    const statusColors = {
      submitted: '#2ca58d',
      in_review: '#ffa500',
      resolved: '#28a745',
      rejected: '#dc3545'
    };

    return {
      subject: `Case Update: ${case_.case_title} - ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #2c5aa0 0%, #2ca58d 100%); padding: 40px 20px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Case Update</h1>
            <p style="color: #e8f4f8; margin: 10px 0 0 0; font-size: 16px;">ResolveNOW Dispute Resolution</p>
          </div>
          
          <div style="padding: 40px 20px; background: #f8f9fa;">
            <h2 style="color: #2c5aa0; margin-bottom: 20px;">Hello ${userName}!</h2>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${statusColors[status]};">
              <h3 style="color: ${statusColors[status]}; margin-top: 0;">Case Status Update</h3>
              <p style="color: #333; margin: 10px 0;"><strong>Case ID:</strong> ${case_.id}</p>
              <p style="color: #333; margin: 10px 0;"><strong>Case Title:</strong> ${case_.case_title}</p>
              <p style="color: #333; margin: 10px 0;"><strong>New Status:</strong> 
                <span style="background: ${statusColors[status]}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; text-transform: uppercase;">
                  ${status.replace('_', ' ')}
                </span>
              </p>
            </div>
            
            <p style="color: #333; line-height: 1.6; margin-bottom: 20px;">
              ${statusMessages[status]}
            </p>
            
            ${case_.resolution ? `
              <div style="background: #e8f5e8; padding: 15px; border-radius: 6px; margin: 20px 0;">
                <h4 style="color: #28a745; margin-top: 0;">Resolution Details:</h4>
                <p style="color: #333; margin: 0;">${case_.resolution}</p>
              </div>
            ` : ''}
            
            ${case_.admin_notes ? `
              <div style="background: #fff3cd; padding: 15px; border-radius: 6px; margin: 20px 0;">
                <h4 style="color: #856404; margin-top: 0;">Additional Notes:</h4>
                <p style="color: #333; margin: 0;">${case_.admin_notes}</p>
              </div>
            ` : ''}
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/pages/case-details.html?id=${case_.id}" 
                 style="background: #2ca58d; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                View Case Details
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px; line-height: 1.6;">
              You can view the full details of your case and track its progress by logging into your dashboard.
            </p>
          </div>
          
          <div style="background: #2c5aa0; color: white; padding: 20px; text-align: center; font-size: 14px;">
            <p style="margin: 0;">© 2024 ResolveNOW. Democratizing Justice Through Technology.</p>
          </div>
        </div>
      `
    };
  }
};

// Send welcome email
const sendWelcomeEmail = async (email, userName) => {
  try {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
      console.log('Email not configured, skipping welcome email');
      return;
    }

    const transporter = createTransporter();
    const template = emailTemplates.welcome(userName);

    await transporter.sendMail({
      from: `"ResolveNOW" <${process.env.SMTP_USER}>`,
      to: email,
      subject: template.subject,
      html: template.html
    });

    console.log(`Welcome email sent to ${email}`);
  } catch (error) {
    console.error('Failed to send welcome email:', error);
  }
};

// Send case status update email
const sendCaseStatusEmail = async (email, userName, case_, status) => {
  try {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
      console.log('Email not configured, skipping status email');
      return;
    }

    const transporter = createTransporter();
    const template = emailTemplates.caseStatus(userName, case_, status);

    await transporter.sendMail({
      from: `"ResolveNOW" <${process.env.SMTP_USER}>`,
      to: email,
      subject: template.subject,
      html: template.html
    });

    console.log(`Case status email sent to ${email} for case ${case_.id}`);
  } catch (error) {
    console.error('Failed to send case status email:', error);
  }
};

// Send password reset email
const sendPasswordResetEmail = async (email, resetToken) => {
  try {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
      console.log('Email not configured, skipping password reset email');
      return;
    }

    const transporter = createTransporter();
    const resetUrl = `${process.env.FRONTEND_URL}/pages/reset-password.html?token=${resetToken}`;

    await transporter.sendMail({
      from: `"ResolveNOW" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Reset Your ResolveNOW Password',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #2c5aa0 0%, #2ca58d 100%); padding: 40px 20px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Password Reset</h1>
            <p style="color: #e8f4f8; margin: 10px 0 0 0; font-size: 16px;">ResolveNOW</p>
          </div>
          
          <div style="padding: 40px 20px; background: #f8f9fa;">
            <h2 style="color: #2c5aa0; margin-bottom: 20px;">Reset Your Password</h2>
            
            <p style="color: #333; line-height: 1.6; margin-bottom: 20px;">
              You requested a password reset for your ResolveNOW account. Click the button below to reset your password:
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" 
                 style="background: #2ca58d; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                Reset Password
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px; line-height: 1.6;">
              This link will expire in 1 hour. If you didn't request this reset, please ignore this email.
            </p>
          </div>
          
          <div style="background: #2c5aa0; color: white; padding: 20px; text-align: center; font-size: 14px;">
            <p style="margin: 0;">© 2024 ResolveNOW. Democratizing Justice Through Technology.</p>
          </div>
        </div>
      `
    });

    console.log(`Password reset email sent to ${email}`);
  } catch (error) {
    console.error('Failed to send password reset email:', error);
  }
};

module.exports = {
  sendWelcomeEmail,
  sendCaseStatusEmail,
  sendPasswordResetEmail
};
