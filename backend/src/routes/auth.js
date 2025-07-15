// backend/src/routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Register endpoint
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('name').trim().isLength({ min: 2 }),
  body('userType').isIn(['retail_investor', 'financial_advisor', 'institution'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation errors', errors: errors.array() });
    }

    const { email, password, name, userType, finraRegistered, secRegistered } = req.body;

    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const userData = {
      email,
      password: hashedPassword,
      name,
      type: userType,
      finraRegistered: finraRegistered || false,
      secRegistered: secRegistered || false,
      permissions: getUserPermissions(userType, finraRegistered, secRegistered),
      createdAt: new Date().toISOString()
    };

    const user = await User.create(userData);

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email, type: user.type },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Remove password from response
    const { password: _, ...userResponse } = user;

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: userResponse
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Login endpoint
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').exists()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation errors', errors: errors.array() });
    }

    const { email, password } = req.body;

    // Find user
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check password
    let isPasswordValid = false;

    // For fake users, allow the password "password"
    if (password === 'password' && ['test@example.com', 'advisor@example.com', 'institution@example.com'].includes(email)) {
      isPasswordValid = true;
    } else {
      isPasswordValid = await bcrypt.compare(password, user.password);
    }

    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Update last login
    await User.updateLastLogin(user.id);

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email, type: user.type },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Remove password from response
    const { password: _, ...userResponse } = user;

    res.json({
      message: 'Login successful',
      token,
      user: userResponse
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Validate token endpoint
router.get('/validate', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    const { password: _, ...userResponse } = user;
    res.json({ user: userResponse });
  } catch (error) {
    console.error('Token validation error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Fake login endpoint for testing
router.post('/fake-login', async (req, res) => {
  try {
    const { userType = 'retail_investor' } = req.body;
    
    let user, token;
    
    switch (userType) {
      case 'financial_advisor':
        user = await User.findByEmail('advisor@example.com');
        token = 'fake-advisor-token';
        break;
      case 'institution':
        user = await User.findByEmail('institution@example.com');
        token = 'fake-institution-token';
        break;
      default:
        user = await User.findByEmail('test@example.com');
        token = 'fake-test-token';
    }

    if (!user) {
      return res.status(500).json({ message: 'Fake user not found' });
    }

    // Update last login
    await User.updateLastLogin(user.id);

    // Remove password from response
    const { password: _, ...userResponse } = user;

    res.json({
      message: 'Fake login successful',
      token,
      user: userResponse,
      note: 'This is a fake authentication system for testing'
    });

  } catch (error) {
    console.error('Fake login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Debug endpoint to see all fake users
router.get('/fake-users', (req, res) => {
  res.json({
    users: User.getAllUsers(),
    note: 'These are fake users for testing'
  });
});

// Helper function to determine user permissions
function getUserPermissions(userType, finraRegistered, secRegistered) {
  const basePermissions = ['chat', 'view_educational_content'];
  
  switch (userType) {
    case 'retail_investor':
      return [...basePermissions, 'basic_portfolio_info'];
    
    case 'financial_advisor':
      const advisorPermissions = [...basePermissions, 'advanced_topics', 'client_guidance'];
      if (finraRegistered) advisorPermissions.push('finra_topics');
      if (secRegistered) advisorPermissions.push('sec_topics');
      return advisorPermissions;
    
    case 'institution':
      return [...basePermissions, 'advanced_topics', 'institutional_guidance', 'compliance_tools'];
    
    default:
      return basePermissions;
  }
}

module.exports = router;







