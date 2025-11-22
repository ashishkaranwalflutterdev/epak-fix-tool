const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Database Connection Manager
 * Handles MySQL database connections with multiple credential sources
 */
class DbConnection {
    
    constructor() {
        this.pool = null;
        this.config = null;
    }
    
    /**
     * Connect to database using credentials from various sources
     * Priority: 1. Environment vars, 2. Config file, 3. .my.cnf
     */
    async connect() {
        // Try to load credentials
        this.config = this.loadCredentials();
        
        if (!this.config) {
            throw new Error('No database credentials found. Please set environment variables or create a config file.');
        }
        
        // Create connection pool
        this.pool = mysql.createPool({
            host: this.config.host,
            user: this.config.user,
            password: this.config.password,
            database: this.config.database,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });
        
        // Test connection
        try {
            const connection = await this.pool.getConnection();
            await connection.query('SELECT 1');
            connection.release();
        } catch (error) {
            throw new Error(`Failed to connect to database: ${error.message}`);
        }
    }
    
    /**
     * Load database credentials from various sources
     * @returns {Object|null} Database config object or null if not found
     */
    loadCredentials() {
        // Priority 1: Environment variables
        if (process.env.EPAK_DB_HOST) {
            return {
                host: process.env.EPAK_DB_HOST,
                user: process.env.EPAK_DB_USER || 'msb',
                password: process.env.EPAK_DB_PASS || '',
                database: process.env.EPAK_DB_NAME || 'msb'
            };
        }
        
        // Priority 2: Config file in project directory
        const configPath = path.join(__dirname, '..', '.epak-config');
        if (fs.existsSync(configPath)) {
            try {
                const configContent = fs.readFileSync(configPath, 'utf8');
                const config = {};
                
                // Parse bash-style config
                configContent.split('\n').forEach(line => {
                    const match = line.match(/^([A-Z_]+)=["']?([^"']*)["']?$/);
                    if (match) {
                        config[match[1]] = match[2];
                    }
                });
                
                if (config.DB_HOST) {
                    return {
                        host: config.DB_HOST,
                        user: config.DB_USER || 'msb',
                        password: config.DB_PASS || '',
                        database: config.DB_NAME || 'msb'
                    };
                }
            } catch (error) {
                console.warn(`Failed to read config file: ${error.message}`);
            }
        }
        
        // Priority 3: MySQL config file (~/.my.cnf)
        const myCnfPath = path.join(os.homedir(), '.my.cnf');
        if (fs.existsSync(myCnfPath)) {
            try {
                const myCnfContent = fs.readFileSync(myCnfPath, 'utf8');
                const config = {
                    host: 'localhost',
                    user: 'msb',
                    password: '',
                    database: 'msb'
                };
                
                // Parse .my.cnf format
                myCnfContent.split('\n').forEach(line => {
                    const hostMatch = line.match(/^host\s*=\s*(.+)/);
                    if (hostMatch) config.host = hostMatch[1].trim();
                    
                    const userMatch = line.match(/^user\s*=\s*(.+)/);
                    if (userMatch) config.user = userMatch[1].trim();
                    
                    const passMatch = line.match(/^password\s*=\s*(.+)/);
                    if (passMatch) config.password = passMatch[1].trim();
                    
                    const dbMatch = line.match(/^database\s*=\s*(.+)/);
                    if (dbMatch) config.database = dbMatch[1].trim();
                });
                
                return config;
            } catch (error) {
                console.warn(`Failed to read .my.cnf: ${error.message}`);
            }
        }
        
        return null;
    }
    
    /**
     * Execute a query
     * @param {string} sql - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise<Array>} Query results
     */
    async query(sql, params = []) {
        if (!this.pool) {
            throw new Error('Database not connected. Call connect() first.');
        }
        
        const [rows] = await this.pool.execute(sql, params);
        return rows;
    }
    
    /**
     * Close database connection
     */
    async close() {
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
        }
    }
}

module.exports = DbConnection;





