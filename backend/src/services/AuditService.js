// backend/src/services/AuditService.js
const pool = require('../config/database');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'mcp-financial-chat' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/audit.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

class AuditService {
  async logEvent(category, action, details) {
    const logEntry = {
      id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      category,
      action,
      details,
      status: 'logged'
    };

    try {
      // Log to Winston
      logger.info('Audit Event', logEntry);

      // Store in database
      await this.storeAuditLog(logEntry);

      return logEntry;
    } catch (error) {
      logger.error('Failed to log audit event', { error: error.message, logEntry });
      throw error;
    }
  }

  async storeAuditLog(logEntry) {
    const query = `
      INSERT INTO audit_logs (id, timestamp, category, action, details, status)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;

    const values = [
      logEntry.id,
      logEntry.timestamp,
      logEntry.category,
      logEntry.action,
      JSON.stringify(logEntry.details),
      logEntry.status
    ];

    await pool.query(query, values);
  }

  async getUserAuditLogs(userId, filters = {}) {
    let query = `
      SELECT * FROM audit_logs 
      WHERE details->>'userId' = $1
    `;
    const values = [userId];

    if (filters.category) {
      query += ` AND category = $${values.length + 1}`;
      values.push(filters.category);
    }

    if (filters.startDate) {
      query += ` AND timestamp >= $${values.length + 1}`;
      values.push(filters.startDate);
    }

    if (filters.endDate) {
      query += ` AND timestamp <= $${values.length + 1}`;
      values.push(filters.endDate);
    }

    query += ` ORDER BY timestamp DESC LIMIT ${filters.limit || 50}`;

    const result = await pool.query(query, values);
    return result.rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      category: row.category,
      action: row.action,
      details: JSON.parse(row.details),
      status: row.status
    }));
  }
}

module.exports = AuditService;