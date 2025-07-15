// backend/src/services/AuditService.js
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

// Create a lazy-loaded database pool to prevent immediate connection
let pool;
function getPool() {
  // Only try to get the pool if DB audit is enabled
  if (process.env.DB_AUDIT_ENABLED === 'true') {
    if (!pool) {
      try {
        pool = require('../config/database');
      } catch (err) {
        console.warn('Failed to load database pool:', err.message);
      }
    }
    return pool;
  }
  return null;
}

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

      // Store in database only if enabled
      if (process.env.DB_AUDIT_ENABLED === 'true') {
        await this.storeAuditLog(logEntry).catch(err => {
          console.warn('Database logging failed, continuing with file log only:', err.message);
        });
      }

      return logEntry;
    } catch (error) {
      logger.error('Failed to log audit event', { error: error.message, logEntry });
      // Don't throw error to prevent disrupting application flow
      return logEntry;
    }
  }

  async storeAuditLog(logEntry) {
    try {
      // Check if DB storage is disabled
      const dbAuditEnabled = process.env.DB_AUDIT_ENABLED === 'true';
      
      if (!dbAuditEnabled) {
        console.log('Database audit logging disabled by configuration');
        return true; // Skip DB storage
      }

      const db = getPool();
      if (!db) {
        console.log('Database pool not available');
        return false;
      }

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

      // Try to store in database
      await db.query(query, values);
      return true;
    } catch (error) {
      console.warn('Failed to store audit log in database:', error.message);
      // Don't throw error, just continue without DB storage
      return false;
    }
  }

  async getUserAuditLogs(userId, filters = {}) {
    try {
      // Check if DB storage is disabled
      const dbAuditEnabled = process.env.DB_AUDIT_ENABLED === 'true';
      
      if (!dbAuditEnabled) {
        console.log('Database audit logging disabled by configuration');
        return []; // Return empty array
      }

      const db = getPool();
      if (!db) {
        console.log('Database pool not available');
        return [];
      }

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

      const result = await db.query(query, values);
      return result.rows.map(row => ({
        id: row.id,
        timestamp: row.timestamp,
        category: row.category,
        action: row.action,
        details: JSON.parse(row.details),
        status: row.status
      }));
    } catch (error) {
      console.warn('Failed to fetch audit logs:', error.message);
      return [];
    }
  }
}

module.exports = AuditService;