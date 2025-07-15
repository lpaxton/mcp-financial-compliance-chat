// backend/src/models/User.js - In-memory fake user implementation for development

// Fake user database - stored in memory
const fakeUsers = new Map();

// Pre-populate with some test users
const testUsers = [
  {
    id: '1',
    email: 'test@test.com',
    password: '1234', // password: 'password'
    name: 'Test User',
    type: 'retail_investor',
    finraRegistered: false,
    secRegistered: false,
    permissions: ['chat', 'view_educational_content', 'basic_portfolio_info'],
    createdAt: new Date().toISOString(),
    lastLogin: null
  },
  {
    id: '2',
    email: 'test2@test.com',
    password: '1234', // password: 'password'
    name: 'Financial Advisor',
    type: 'financial_advisor',
    finraRegistered: true,
    secRegistered: true,
    permissions: ['chat', 'view_educational_content', 'advanced_topics', 'client_guidance', 'finra_topics', 'sec_topics'],
    createdAt: new Date().toISOString(),
    lastLogin: null
  },
  {
    id: '3',
    email: 'test3@test.com',
    password: '1234', // password: 'password'
    name: 'Institutional User',
    type: 'institution',
    finraRegistered: true,
    secRegistered: true,
    permissions: ['chat', 'view_educational_content', 'advanced_topics', 'institutional_guidance', 'compliance_tools'],
    createdAt: new Date().toISOString(),
    lastLogin: null
  }
];

// Initialize fake database
testUsers.forEach(user => {
  fakeUsers.set(user.email, user);
});

class User {
  static async create(userData) {
    const user = {
      id: Date.now().toString(),
      email: userData.email,
      password: userData.password,
      name: userData.name,
      type: userData.type,
      finraRegistered: userData.finraRegistered || false,
      secRegistered: userData.secRegistered || false,
      permissions: userData.permissions || [],
      createdAt: userData.createdAt || new Date().toISOString(),
      lastLogin: null
    };

    fakeUsers.set(user.email, user);
    console.log('Fake user created:', { ...user, password: '[HIDDEN]' });
    return user;
  }

  static async findByEmail(email) {
    const user = fakeUsers.get(email);
    if (user) {
      console.log('Fake user found by email:', { ...user, password: '[HIDDEN]' });
      return user;
    }
    console.log('Fake user not found by email:', email);
    return null;
  }

  static async findById(id) {
    for (const user of fakeUsers.values()) {
      if (user.id === id) {
        console.log('Fake user found by ID:', { ...user, password: '[HIDDEN]' });
        return user;
      }
    }
    console.log('Fake user not found by ID:', id);
    return null;
  }

  static async updateLastLogin(id) {
    for (const user of fakeUsers.values()) {
      if (user.id === id) {
        user.lastLogin = new Date().toISOString();
        console.log('Fake user last login updated:', id);
        return true;
      }
    }
    return false;
  }

  // Helper method to list all fake users (for debugging)
  static getAllUsers() {
    return Array.from(fakeUsers.values()).map(user => ({
      ...user,
      password: '[HIDDEN]'
    }));
  }
}

module.exports = User;