// backend/src/models/User.js
const pool = require('../config/database');

class User {
  static async create(userData) {
    const {
      email,
      password,
      name,
      type,
      finraRegistered,
      secRegistered,
      permissions,
      createdAt
    } = userData;

    const query = `
      INSERT INTO users (email, password, name, type, finra_registered, sec_registered, permissions, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, email, name, type, finra_registered, sec_registered, permissions, created_at
    `;

    const values = [
      email,
      password,
      name,
      type,
      finraRegistered,
      secRegistered,
      JSON.stringify(permissions),
      createdAt
    ];

    const result = await pool.query(query, values);
    const user = result.rows[0];
    
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      type: user.type,
      finraRegistered: user.finra_registered,
      secRegistered: user.sec_registered,
      permissions: JSON.parse(user.permissions),
      createdAt: user.created_at
    };
  }

  static async findByEmail(email) {
    const query = 'SELECT * FROM users WHERE email = $1';
    const result = await pool.query(query, [email]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const user = result.rows[0];
    return {
      id: user.id,
      email: user.email,
      password: user.password,
      name: user.name,
      type: user.type,
      finraRegistered: user.finra_registered,
      secRegistered: user.sec_registered,
      permissions: JSON.parse(user.permissions),
      createdAt: user.created_at,
      lastLogin: user.last_login
    };
  }

  static async findById(id) {
    const query = 'SELECT * FROM users WHERE id = $1';
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const user = result.rows[0];
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      type: user.type,
      finraRegistered: user.finra_registered,
      secRegistered: user.sec_registered,
      permissions: JSON.parse(user.permissions),
      createdAt: user.created_at,
      lastLogin: user.last_login
    };
  }

  static async updateLastLogin(id) {
    const query = 'UPDATE users SET last_login = $1 WHERE id = $2';
    await pool.query(query, [new Date().toISOString(), id]);
  }
}

module.exports = User;