const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const XLSX = require('xlsx');
const CertificateParser = require('./certificateParser');
const PDFCertificateExtractor = require('./pdfCertificateExtractor');
const BatchPdfProcessor = require('./batchPdfProcessor');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configure multer for file uploads (memory storage)
const upload = multer({ storage: multer.memoryStorage() });

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

// API: Parse Excel/CSV file
app.post('/api/parse-file', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded'
            });
        }

        const fileBuffer = req.file.buffer;
        const filename = req.file.originalname;
        const ext = path.extname(filename).toLowerCase();

        // Auto-detect if this is a fix sheet CSV (epak_uuid, doc_uuid, signed_pdf_path)
        const text = fileBuffer.toString('utf-8');
        const firstLine = text.split('\n')[0].toLowerCase();
        
        if (firstLine.includes('epak_uuid') && firstLine.includes('doc_uuid') && firstLine.includes('signed_pdf_path')) {
            // This is a fix sheet CSV - route to fix sheet generator
            console.log('Detected fix sheet CSV format, routing to fix sheet generator');
            
            if (!pool) {
                return res.status(400).json({
                    success: false,
                    error: 'Database not connected. Please connect to database first.',
                    isFixSheet: true
                });
            }
            
            // Save temporarily and process
            const fs = require('fs');
            const inputPath = path.join(__dirname, `temp-fixsheet-input-${Date.now()}.csv`);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const outputPath = path.join(__dirname, 'fix-sheets', `fix-sheet-${timestamp}.csv`);
            
            fs.writeFileSync(inputPath, fileBuffer);
            
            try {
                const DbConnection = require('./dbConnection');
                const EpakFixSheetGenerator = require('./epakFixSheetGenerator');
                
                // Create a DB wrapper using existing pool
                const dbWrapper = {
                    query: async (sql, params) => {
                        const [rows] = await pool.execute(sql, params);
                        return rows;
                    },
                    close: async () => {}
                };
                
                const generator = new EpakFixSheetGenerator(dbWrapper);
                const result = await generator.generateFixSheet(inputPath, outputPath);
                
                // Read the generated CSV (only if it exists - may not exist if no commands generated)
                let outputContent = '';
                let outputFilename = `epak-fix-sheet-${timestamp}.csv`;
                if (fs.existsSync(outputPath)) {
                    outputContent = fs.readFileSync(outputPath, 'utf8');
                }
                
                // Clean up temp input file only (keep the generated fix sheet)
                fs.unlinkSync(inputPath);
                
                return res.json({
                    success: true,
                    isFixSheet: true,
                    summary: result,
                    output: outputContent,
                    contentType: 'text/csv',
                    filename: outputFilename,
                    savedPath: outputContent ? outputPath : null
                });
            } catch (fixSheetError) {
                // Clean up on error
                try {
                    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                    // Don't delete output file on error - keep partial results
                } catch (cleanupError) {}
                
                return res.status(500).json({
                    success: false,
                    error: `Fix sheet generation failed: ${fixSheetError.message}`,
                    isFixSheet: true
                });
            }
        }
        
        // Otherwise, proceed with normal batch operations parsing
        let operations = [];

        if (ext === '.xlsx' || ext === '.xls') {
            // Parse Excel file
            const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

            // Find the header row (look for 'ePakId' or 'ePakUUID' or 'Table')
            let headerRowIndex = 0;
            for (let i = 0; i < Math.min(5, data.length); i++) {
                const row = data[i];
                const rowStr = JSON.stringify(row).toLowerCase();
                if (rowStr.includes('epakid') || rowStr.includes('epakuuid') || 
                    (rowStr.includes('table') && rowStr.includes('operation'))) {
                    headerRowIndex = i;
                    break;
                }
            }

            // Detect column format by looking at headers
            const headerRow = data[headerRowIndex];
            const headerStr = JSON.stringify(headerRow).toLowerCase();
            
            // Check if this is the new format with DocumentUUID
            const hasDocumentUUID = headerStr.includes('documentuuid');
            
            // Column indices based on format
            let epakIdCol, tableCol, operationCol, columnValuesCol, whereClauseCol, statusCol;
            
            if (hasDocumentUUID) {
                // New format: ePakUUID, DocumentUUID, Table, Operation, Column & Values, Where clause, Status, Last ran
                epakIdCol = 0;
                // Skip DocumentUUID (column 1)
                tableCol = 2;
                operationCol = 3;
                columnValuesCol = 4;
                whereClauseCol = 5;
                statusCol = 6;
            } else {
                // Old format: ePakId, Table, Operation, Column & Values, Where clause, Status, Last ran
                epakIdCol = 0;
                tableCol = 1;
                operationCol = 2;
                columnValuesCol = 3;
                whereClauseCol = 4;
                statusCol = 5;
            }
            
            // Parse data rows
            for (let i = headerRowIndex + 1; i < data.length; i++) {
                const row = data[i];
                if (row.length === 0 || !row[epakIdCol]) continue; // Skip empty rows

                const epakId = row[epakIdCol];
                const table = row[tableCol];
                const operation = row[operationCol];
                // Clean column values: remove newlines and extra whitespace
                let columnValues = row[columnValuesCol] ? row[columnValuesCol].toString().replace(/\n/g, ' ').replace(/\s+/g, ' ').trim() : '';
                let whereClause = row[whereClauseCol] ? row[whereClauseCol].toString().replace(/\n/g, ' ').replace(/\s+/g, ' ').trim() : '';
                const status = row[statusCol] || 'Pending';

                if (!epakId || !table || !operation) continue;
                
                // Skip if epakId looks like a header
                if (typeof epakId === 'string' && epakId.toLowerCase().includes('epak')) continue;

                // Validate Column & Values for INSERT/UPDATE operations
                if ((operation.toUpperCase() === 'INSERT' || operation.toUpperCase() === 'UPDATE') && columnValues) {
                    // Check for bare column names (column names without values)
                    // Pattern: word followed by comma or end, not preceded by =
                    const bareColumnPattern = /(?:^|,\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:,|$)/;
                    const parts = columnValues.split(',');
                    
                    for (const part of parts) {
                        const trimmed = part.trim();
                        // Skip if empty or if it contains an equals sign
                        if (!trimmed || trimmed.includes('=')) continue;
                        
                        // This is a bare column name without a value
                        console.warn(`Warning: Row ${i} - Bare column name detected: "${trimmed}"`);
                        console.warn(`Column & Values: ${columnValues}`);
                        throw new Error(`Invalid Column & Values syntax in row ${i}: Column "${trimmed}" has no value. Use: ${trimmed}=NULL or ${trimmed}='' or ${trimmed}='value'`);
                    }
                }

                // Build SQL statement
                let sql = '';
                if (operation.toUpperCase() === 'UPDATE') {
                    sql = `UPDATE ${table} SET ${columnValues}`;
                    if (whereClause && whereClause.trim()) {
                        // Check if WHERE is already included
                        if (!whereClause.trim().toUpperCase().startsWith('WHERE')) {
                            sql += ` WHERE ${whereClause}`;
                        } else {
                            sql += ` ${whereClause}`;
                        }
                    }
                } else if (operation.toUpperCase() === 'INSERT') {
                    sql = `INSERT INTO ${table} SET ${columnValues}`;
                } else if (operation.toUpperCase() === 'DELETE') {
                    sql = `DELETE FROM ${table}`;
                    if (whereClause && whereClause.trim()) {
                        // Check if WHERE is already included
                        if (!whereClause.trim().toUpperCase().startsWith('WHERE')) {
                            sql += ` WHERE ${whereClause}`;
                        } else {
                            sql += ` ${whereClause}`;
                        }
                    }
                }

                if (sql) {
                    operations.push({
                        epakId: epakId.toString(),
                        table,
                        operation,
                        sql: sql.trim(),
                        status,
                        rowNumber: i + 1
                    });
                }
            }
        } else {
            // Parse CSV file using proper CSV parser
            const csvParser = require('csv-parser');
            const { Readable } = require('stream');
            
            // Create a readable stream from buffer
            const stream = Readable.from(fileBuffer.toString('utf-8'));
            
            // Use promise to handle streaming
            const rows = await new Promise((resolve, reject) => {
                const results = [];
                stream
                    .pipe(csvParser())
                    .on('data', (data) => results.push(data))
                    .on('end', () => resolve(results))
                    .on('error', reject);
            });
            
            if (rows.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'No data rows found in CSV'
                });
            }
            
            // Detect format by checking first row keys
            const firstRow = rows[0];
            const keys = Object.keys(firstRow).map(k => k.toLowerCase());
            const hasDocumentUUID = keys.some(k => k.includes('documentuuid'));
            
            // Map column names (case-insensitive)
            const getColumn = (row, ...names) => {
                for (const name of names) {
                    const key = Object.keys(row).find(k => k.toLowerCase() === name.toLowerCase());
                    if (key && row[key]) return row[key];
                }
                return '';
            };
            
            // Parse each row
            for (const row of rows) {
                const epakId = getColumn(row, 'ePakUUID', 'ePakId', 'epakid', 'epak_uuid');
                const table = getColumn(row, 'Table', 'table');
                const operation = getColumn(row, 'Operation', 'operation');
                const columnValues = getColumn(row, 'Column & Values', 'Column&Values', 'columns', 'column_values');
                const whereClause = getColumn(row, 'Where clause', 'where', 'where_clause');
                const status = getColumn(row, 'Status', 'status') || 'Pending';
                
                if (!epakId || !table || !operation) continue;
                
                // Skip if epakId looks like a header
                if (typeof epakId === 'string' && epakId.toLowerCase().includes('epak') && epakId.toLowerCase().includes('uuid')) continue;

                // Build SQL statement
                let sql = '';
                if (operation.toUpperCase() === 'UPDATE') {
                    sql = `UPDATE ${table} SET ${columnValues}`;
                    if (whereClause && whereClause.trim()) {
                        if (!whereClause.trim().toUpperCase().startsWith('WHERE')) {
                            sql += ` WHERE ${whereClause}`;
                        } else {
                            sql += ` ${whereClause}`;
                        }
                    }
                } else if (operation.toUpperCase() === 'INSERT') {
                    sql = `INSERT INTO ${table} SET ${columnValues}`;
                } else if (operation.toUpperCase() === 'DELETE') {
                    sql = `DELETE FROM ${table}`;
                    if (whereClause && whereClause.trim()) {
                        // Check if WHERE is already included
                        if (!whereClause.trim().toUpperCase().startsWith('WHERE')) {
                            sql += ` WHERE ${whereClause}`;
                        } else {
                            sql += ` ${whereClause}`;
                        }
                    }
                }

                if (sql) {
                    operations.push({
                        epakId: epakId.toString(),
                        table,
                        operation,
                        sql: sql.trim(),
                        status
                    });
                }
            }
        }

        res.json({
            success: true,
            operations,
            count: operations.length,
            format: ext === '.xlsx' || ext === '.xls' ? 'Excel' : 'CSV/TSV'
        });

    } catch (error) {
        console.error('File parsing error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// API: Parse certificate file (supports .cer, .pem, .crt, and .pdf)
app.post('/api/parse-certificate', upload.single('certificate'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No certificate file uploaded'
            });
        }

        let certBuffer = req.file.buffer;
        let extractedFromPDF = false;

        // Check if uploaded file is a PDF
        if (PDFCertificateExtractor.isPDF(req.file.buffer)) {
            console.log('PDF detected, extracting certificate...');
            try {
                // Extract certificate from PDF
                certBuffer = await PDFCertificateExtractor.extractCertificateFromPDF(req.file.buffer);
                extractedFromPDF = true;
                console.log('Certificate extracted from PDF successfully');
            } catch (pdfError) {
                return res.status(400).json({
                    success: false,
                    error: `Failed to extract certificate from PDF: ${pdfError.message}`
                });
            }
        }

        // Parse certificate directly from buffer (no temp file needed)
        const aadhaarDetails = CertificateParser.parseCertificateFromBuffer(certBuffer);

        res.json({
            success: true,
            aadhaarDetails: JSON.stringify(aadhaarDetails),
            extractedFromPDF
        });

    } catch (error) {
        console.error('Certificate parsing error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// API: Parse certificate from server path
app.post('/api/parse-certificate-path', async (req, res) => {
    try {
        const { certPath } = req.body;
        
        if (!certPath) {
            return res.status(400).json({
                success: false,
                error: 'Certificate path is required'
            });
        }

        // Resolve path relative to project root
        const fullPath = path.isAbsolute(certPath) 
            ? certPath 
            : path.join(__dirname, certPath);

        // Check if file exists
        if (!require('fs').existsSync(fullPath)) {
            return res.status(404).json({
                success: false,
                error: `Certificate file not found: ${certPath}`
            });
        }

        // Parse certificate
        const aadhaarDetails = CertificateParser.parseCertificate(fullPath);

        res.json({
            success: true,
            aadhaarDetails: JSON.stringify(aadhaarDetails),
            filePath: certPath
        });

    } catch (error) {
        console.error('Certificate parsing error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// API: Batch process PDFs from directory
app.post('/api/batch-process-pdfs', async (req, res) => {
    try {
        const { dirPath, recursive = true, format = 'csv', includeFailures = true } = req.body;
        
        if (!dirPath) {
            return res.status(400).json({
                success: false,
                error: 'Directory path is required'
            });
        }

        // Resolve path relative to project root
        const fullPath = path.isAbsolute(dirPath) 
            ? dirPath 
            : path.join(__dirname, dirPath);

        console.log(`Starting batch PDF processing: ${fullPath}`);
        console.log(`Options: recursive=${recursive}, format=${format}, includeFailures=${includeFailures}`);

        // Process all PDFs in directory
        const results = await BatchPdfProcessor.processPDFDirectory(
            fullPath, 
            recursive,
            (progress) => {
                // Log progress (could be sent via WebSocket in future)
                console.log(`Progress: ${progress.current}/${progress.total} - ${progress.fileName} - ${progress.success ? 'Success' : 'Failed'}`);
            }
        );

        console.log(`Batch processing complete: ${results.successCount} success, ${results.failureCount} failed`);

        // Generate output based on format
        let output;
        let contentType;
        
        if (format === 'csv') {
            output = BatchPdfProcessor.resultsToCSV(results, includeFailures);
            contentType = 'text/csv';
        } else if (format === 'json') {
            output = BatchPdfProcessor.resultsToJSON(results, includeFailures);
            contentType = 'application/json';
        } else {
            return res.status(400).json({
                success: false,
                error: 'Invalid format. Use "csv" or "json"'
            });
        }

        res.json({
            success: true,
            summary: {
                totalFiles: results.totalFiles,
                successCount: results.successCount,
                failureCount: results.failureCount,
                processingTime: results.processingTime,
                processingTimeFormatted: BatchPdfProcessor.formatTime(results.processingTime)
            },
            format: format,
            output: output,
            contentType: contentType
        });

    } catch (error) {
        console.error('Batch PDF processing error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// API: Generate ePak fix sheet
app.post('/api/generate-fix-sheet', upload.single('file'), async (req, res) => {
    try {
        const fs = require('fs');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const outputPath = path.join(__dirname, 'fix-sheets', `fix-sheet-${timestamp}.csv`);
        
        let inputPath;
        let isTemporaryFile = false;
        
        // Check if this is a file upload or a path request
        if (req.file) {
            // File upload
            inputPath = path.join(__dirname, 'temp-input.csv');
            fs.writeFileSync(inputPath, req.file.buffer);
            isTemporaryFile = true;
        } else if (req.body && req.body.csvPath) {
            // Path provided (from terminal command)
            inputPath = req.body.csvPath;
            
            // Handle relative paths
            if (!path.isAbsolute(inputPath)) {
                inputPath = path.join(__dirname, inputPath);
            }
            
            // Check if file exists
            if (!fs.existsSync(inputPath)) {
                return res.status(400).json({
                    success: false,
                    error: `File not found: ${inputPath}`
                });
            }
        } else {
            return res.status(400).json({
                success: false,
                error: 'No CSV file uploaded or path provided'
            });
        }

        if (!pool) {
            return res.status(400).json({
                success: false,
                error: 'Database not connected. Please connect to database first.'
            });
        }

        // Create DB connection wrapper for the generator
        const DbConnection = require('./dbConnection');
        const EpakFixSheetGenerator = require('./epakFixSheetGenerator');
        
        // Create a custom DB connection that uses the existing pool
        const dbWrapper = {
            query: async (sql, params) => {
                const [rows] = await pool.execute(sql, params);
                return rows;
            },
            close: async () => {
                // Don't close the shared pool
            }
        };

        const generator = new EpakFixSheetGenerator(dbWrapper);
        const result = await generator.generateFixSheet(inputPath, outputPath);

        // Read the generated CSV (only if it exists)
        let outputContent = '';
        if (fs.existsSync(outputPath)) {
            outputContent = fs.readFileSync(outputPath, 'utf8');
        }
        
        // Clean up temp input file only (if it was uploaded)
        if (isTemporaryFile && fs.existsSync(inputPath)) {
            fs.unlinkSync(inputPath);
        }

        res.json({
            success: true,
            summary: result,
            output: outputContent,
            contentType: 'text/csv',
            filename: `fix-sheet-${timestamp}.csv`,
            savedPath: outputContent ? outputPath : null
        });

    } catch (error) {
        console.error('Fix sheet generation error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
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

// ===================================================================
// BATCH PROCESSING API
// ===================================================================

const BatchProcessor = require('./batchProcessor');
const dataSourcePath = path.join(__dirname, 'data-source');
const batchProcessor = new BatchProcessor(dataSourcePath);

// Ensure directories exist on startup
console.log('📁 Initializing batch processing directories...');
console.log(`   Data Source: ${dataSourcePath}`);

// List all batches
app.get('/api/batches', (req, res) => {
    try {
        const pendingBatches = batchProcessor.listPendingBatches();
        const readyBatches = batchProcessor.listReadyForExecution();
        
        res.json({
            success: true,
            pending: pendingBatches,
            ready: readyBatches
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Process a batch (generate fix sheet)
app.post('/api/batch/process/:batchName', async (req, res) => {
    try {
        const { batchName } = req.params;
        
        if (!pool) {
            return res.status(400).json({
                success: false,
                error: 'Database not connected'
            });
        }
        
        const pendingBatches = batchProcessor.listPendingBatches();
        const batch = pendingBatches.find(b => b.name === batchName);
        
        if (!batch || !batch.ready) {
            return res.status(404).json({
                success: false,
                error: `Batch '${batchName}' not found or not ready`
            });
        }
        
        // Generate fix sheet
        const EpakFixSheetGenerator = require('./epakFixSheetGenerator');
        const DbConnection = require('./dbConnection');
        
        const dbWrapper = {
            query: async (sql, params) => {
                const [rows] = await pool.execute(sql, params);
                return rows;
            },
            close: async () => {}
        };
        
        const generator = new EpakFixSheetGenerator(dbWrapper);
        const outputPath = batchProcessor.getFixSheetPath(batchName);
        
        const result = await generator.generateFixSheet(batch.csvFile, outputPath);
        
        // Move original batch to processed
        const movedPath = batchProcessor.moveBatchToProcessed(batchName, 'corrupted-epaks');
        
        res.json({
            success: true,
            result: result,
            fixSheetPath: outputPath,
            originalBatchMoved: movedPath
        });
        
    } catch (error) {
        console.error('Batch processing error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Execute a fix sheet batch
app.post('/api/batch/execute/:batchName', async (req, res) => {
    try {
        const { batchName } = req.params;
        
        if (!pool) {
            return res.status(400).json({
                success: false,
                error: 'Database not connected'
            });
        }
        
        const readyBatches = batchProcessor.listReadyForExecution();
        const batch = readyBatches.find(b => b.name === batchName);
        
        if (!batch || !batch.ready) {
            return res.status(404).json({
                success: false,
                error: `Batch '${batchName}' not found or not ready for execution`
            });
        }
        
        // Use the first fix sheet (usually only one per batch)
        const fixSheetPath = batch.fixSheets[0];
        
        res.json({
            success: true,
            message: 'Ready for execution',
            fixSheetPath: fixSheetPath,
            batch: batch
        });
        
    } catch (error) {
        console.error('Batch execution error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Complete batch processing (move to processed)
app.post('/api/batch/complete/:batchName', async (req, res) => {
    try {
        const { batchName } = req.params;
        
        // Move fix sheet batch to processed
        const movedPath = batchProcessor.moveBatchToProcessed(batchName, 'fix-sheets');
        
        if (movedPath) {
            res.json({
                success: true,
                movedPath: movedPath
            });
        } else {
            res.status(404).json({
                success: false,
                error: `Batch '${batchName}' not found`
            });
        }
        
    } catch (error) {
        console.error('Batch completion error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Export batch SQL to file (for CMR)
app.post('/api/export-batch-sql', async (req, res) => {
    try {
        const { batchName, sqlContent } = req.body;
        
        if (!batchName || !sqlContent) {
            return res.status(400).json({
                success: false,
                error: 'Batch name and SQL content are required'
            });
        }
        
        // Create exports directory if it doesn't exist
        const exportsDir = path.join(__dirname, 'batch-job-sheets');
        if (!fs.existsSync(exportsDir)) {
            fs.mkdirSync(exportsDir, { recursive: true });
        }
        
        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `${batchName}-SQL-Export-${timestamp}.txt`;
        const filePath = path.join(exportsDir, filename);
        
        // Write SQL content to file
        fs.writeFileSync(filePath, sqlContent, 'utf8');
        
        console.log(`SQL exported to: ${filePath}`);
        
        res.json({
            success: true,
            filePath: filePath,
            filename: filename
        });
        
    } catch (error) {
        console.error('SQL export error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Read and parse a fix sheet file
app.post('/api/read-fix-sheet', async (req, res) => {
    try {
        const { filePath } = req.body;
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                error: `File not found: ${filePath}`
            });
        }
        
        const operations = [];
        
        await new Promise((resolve, reject) => {
            const csvParser = require('csv-parser');
            
            fs.createReadStream(filePath)
                .pipe(csvParser())
                .on('data', (row) => {
                    // Parse the fix sheet format
                    // Headers: ePakUUID, DocumentUUID, Table, Operation, Column & Values, Where clause, Status, Last ran
                    
                    const epakId = row.ePakUUID || row.ePakId;
                    const table = row.Table;
                    const operation = row.Operation;
                    const columnValues = row['Column & Values'] || row['Column & Values'] || '';
                    const whereClause = row['Where clause'] || row['Where Clause'] || '';
                    
                    if (!epakId || !table || !operation) {
                        return; // Skip invalid rows
                    }
                    
                    // Build SQL statement
                    let sql = '';
                    if (operation === 'DELETE') {
                        sql = `DELETE FROM ${table}`;
                        if (whereClause) {
                            sql += ` WHERE ${whereClause}`;
                        }
                    } else if (operation === 'UPDATE') {
                        sql = `UPDATE ${table} SET ${columnValues}`;
                        if (whereClause) {
                            sql += ` WHERE ${whereClause}`;
                        }
                    } else if (operation === 'INSERT') {
                        sql = `INSERT INTO ${table} SET ${columnValues}`;
                    }
                    
                    if (sql) {
                        operations.push({
                            epakId: epakId,
                            table: table,
                            operation: operation,
                            sql: sql
                        });
                    }
                })
                .on('end', resolve)
                .on('error', reject);
        });
        
        res.json({
            success: true,
            operations: operations
        });
        
    } catch (error) {
        console.error('Read fix sheet error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
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


