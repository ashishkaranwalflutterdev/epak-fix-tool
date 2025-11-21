const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database connection pool
let pool = null;

// Initialize database connection
function initializeDB(config) {
    pool = mysql.createPool({
        host: config.host,
        user: config.user,
        password: config.password,
        database: config.database,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });
    return pool;
}

// API: Test database connection
app.post('/api/connect', async (req, res) => {
    try {
        const { host, user, password, database } = req.body;
        
        if (!host || !user || !password || !database) {
            return res.status(400).json({ 
                success: false, 
                error: 'All fields are required' 
            });
        }

        // Initialize connection pool
        pool = initializeDB({ host, user, password, database });
        
        // Test connection
        const connection = await pool.getConnection();
        await connection.query('SELECT 1');
        connection.release();
        
        res.json({ 
            success: true, 
            message: '✅ Connected to database successfully!' 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: `❌ Connection failed: ${error.message}` 
        });
    }
});

// API: Execute SQL query
app.post('/api/query', async (req, res) => {
    try {
        if (!pool) {
            return res.status(400).json({ 
                success: false, 
                error: '❌ Not connected to database. Please connect first.' 
            });
        }

        const { query } = req.body;
        
        if (!query) {
            return res.status(400).json({ 
                success: false, 
                error: 'Query is required' 
            });
        }

        const [rows] = await pool.query(query);
        
        res.json({ 
            success: true, 
            data: rows,
            rowCount: Array.isArray(rows) ? rows.length : 0
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: `❌ Query failed: ${error.message}` 
        });
    }
});

// API: Get EPak details
app.get('/api/epak/:id', async (req, res) => {
    try {
        if (!pool) {
            return res.status(400).json({ 
                success: false, 
                error: 'Not connected to database' 
            });
        }

        const epakId = req.params.id;
        
        // Get EPak info
        const [epakRows] = await pool.query(
            'SELECT id, status, progressPercent, subject, sentOn, modifiedOn, currentWorkflowStateId, ownerId FROM epak WHERE id = ?',
            [epakId]
        );
        
        if (epakRows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: `❌ EPak ID ${epakId} not found` 
            });
        }

        // Get documents
        const [docRows] = await pool.query(
            `SELECT ed.documentId, d.title as documentName 
             FROM epak_document ed 
             JOIN document d ON d.id = ed.documentId 
             WHERE ed.ePakId = ? 
             ORDER BY ed.documentId`,
            [epakId]
        );

        // Get signers
        const [signerRows] = await pool.query(
            `SELECT id, userId, status, progressPercent, statusModifiedOn, workflowStateOrderId, signerOrderId 
             FROM epak_workflowstate_signer 
             WHERE ePakId = ? 
             ORDER BY workflowStateOrderId`,
            [epakId]
        );

        // Get document actions
        const [actionRows] = await pool.query(
            `SELECT id, signerId, status, actedOn, workflowStateOrderId 
             FROM docuseraction 
             WHERE ePakId = ? 
             ORDER BY workflowStateOrderId`,
            [epakId]
        );

        res.json({ 
            success: true, 
            data: {
                epak: epakRows[0],
                documents: docRows,
                signers: signerRows,
                actions: actionRows
            }
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: `Query failed: ${error.message}` 
        });
    }
});

// API: Execute transaction
app.post('/api/transaction', async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        if (!pool) {
            return res.status(400).json({ 
                success: false, 
                error: 'Not connected to database' 
            });
        }

        const { queries } = req.body;
        
        if (!queries || !Array.isArray(queries) || queries.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Queries array is required' 
            });
        }

        await connection.beginTransaction();
        
        const results = [];
        for (const query of queries) {
            const [result] = await connection.query(query);
            results.push(result);
        }
        
        await connection.commit();
        
        res.json({ 
            success: true, 
            message: '✅ Transaction completed successfully',
            results: results
        });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ 
            success: false, 
            error: `❌ Transaction failed: ${error.message}` 
        });
    } finally {
        connection.release();
    }
});

// API: Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Server is running',
        connected: pool !== null
    });
});

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║          EPak Fix Tool - Web Terminal                         ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`✅ Server running on: http://localhost:${PORT}`);
    console.log('');
    console.log('🌐 Open your browser and navigate to:');
    console.log(`   http://localhost:${PORT}`);
    console.log('');
    console.log('📝 No admin access required!');
    console.log('🚀 Works on Mac, Windows, Linux');
    console.log('');
    console.log('Press Ctrl+C to stop the server');
    console.log('');
});


