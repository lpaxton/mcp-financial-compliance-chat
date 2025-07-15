// backend/src/middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    // Add special bypass tokens for testing
    if (token === 'fake-test-token') {
      req.userId = '1';
      req.userEmail = 'test@example.com';
      req.userType = 'retail_investor';
      console.log('Using fake test token for user:', req.userEmail);
      return next();
    }

    if (token === 'fake-advisor-token') {
      req.userId = '2';
      req.userEmail = 'advisor@example.com';
      req.userType = 'financial_advisor';
      console.log('Using fake advisor token for user:', req.userEmail);
      return next();
    }

    if (token === 'fake-institution-token') {
      req.userId = '3';
      req.userEmail = 'institution@example.com';
      req.userType = 'institution';
      console.log('Using fake institution token for user:', req.userEmail);
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    req.userType = decoded.type;
    
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Socket authentication middleware
authMiddleware.verifySocketToken = async (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    return user;
  } catch (error) {
    throw new Error('Invalid token');
  }
};

module.exports = authMiddleware;