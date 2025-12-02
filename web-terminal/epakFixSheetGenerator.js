const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { createObjectCsvWriter } = require('csv-writer');
const PDFCertificateExtractor = require('./pdfCertificateExtractor');
const CertificateParser = require('./certificateParser');

/**
 * ePak Fix Sheet Generator
 * Reads a list of corrupted ePaks and generates SQL fix commands
 */
class EpakFixSheetGenerator {
    
    constructor(dbConnection) {
        this.db = dbConnection;
    }
    
    /**
     * Generate fix sheet from input CSV
     * @param {string} inputCsvPath - Path to input CSV with ePak list
     * @param {string} outputCsvPath - Path to output CSV with fix commands
     * @returns {Promise<{total: number, processed: number, errors: Array}>}
     */
    async generateFixSheet(inputCsvPath, outputCsvPath) {
        console.log('\n╔════════════════════════════════════════════════════════════════╗');
        console.log('║        ePak Fix Sheet Generator                               ║');
        console.log('╚════════════════════════════════════════════════════════════════╝\n');
        
        console.log(`📄 Input CSV: ${inputCsvPath}`);
        console.log(`💾 Output CSV: ${outputCsvPath}`);
        console.log('');
        
        // Read input CSV
        const epakList = await this.readInputCsv(inputCsvPath);
        console.log(`✅ Found ${epakList.length} ePaks to process\n`);
        
        const fixCommands = [];
        const errors = [];
        let processedCount = 0;
        
        // Process each ePak
        for (let i = 0; i < epakList.length; i++) {
            const epak = epakList[i];
            console.log(`\n${'='.repeat(70)}`);
            console.log(`Processing ${i + 1}/${epakList.length}: ePak ${epak.epak_uuid}, Doc ${epak.doc_uuid}`);
            console.log('='.repeat(70));
            
            try {
                // Step 1: Query DB for current state
                console.log('\n📊 Step 1: Querying database for current state...');
                const currentState = await this.queryEpakState(epak.epak_uuid, epak.doc_uuid);
                
                // Step 2: Extract Aadhaar data from signed PDF
                console.log('\n📄 Step 2: Extracting Aadhaar data from PDF...');
                const aadhaarData = await this.extractAadhaarData(epak.signed_pdf_path);
                
                // Step 3: Generate fix commands based on state
                console.log('\n🔧 Step 3: Generating fix commands...');
                const commands = await this.generateFixCommands(
                    epak.epak_uuid,
                    epak.doc_uuid,
                    currentState,
                    aadhaarData
                );
                
                fixCommands.push(...commands);
                processedCount++;
                
                console.log(`✅ Generated ${commands.length} fix commands for ePak ${epak.epak_uuid}`);
                
            } catch (error) {
                console.error(`❌ Error processing ePak ${epak.epak_uuid}: ${error.message}`);
                errors.push({
                    epak_uuid: epak.epak_uuid,
                    doc_uuid: epak.doc_uuid,
                    error: error.message
                });
            }
        }
        
        // Write output CSV (only if there are commands)
        if (fixCommands.length > 0) {
            console.log('\n\n📝 Writing fix commands to CSV...');
            await this.writeOutputCsv(outputCsvPath, fixCommands);
            
            console.log('\n✅ Fix sheet generated successfully!');
            console.log(`   Total ePaks: ${epakList.length}`);
            console.log(`   Processed: ${processedCount}`);
            console.log(`   Errors: ${errors.length}`);
            console.log(`   Fix commands: ${fixCommands.length}`);
            console.log(`   Output: ${outputCsvPath}\n`);
        } else {
            console.log('\n⚠️  No fix commands generated (all ePaks may already be completed)');
            console.log(`   Total ePaks: ${epakList.length}`);
            console.log(`   Processed: ${processedCount}`);
            console.log(`   Errors: ${errors.length}\n`);
        }
        
        return {
            total: epakList.length,
            processed: processedCount,
            errors: errors,
            fixCommands: fixCommands.length
        };
    }
    
    /**
     * Read input CSV file
     * @param {string} csvPath - Path to CSV file
     * @returns {Promise<Array>} Array of ePak records
     */
    async readInputCsv(csvPath) {
        return new Promise((resolve, reject) => {
            const results = [];
            const csvDir = path.dirname(csvPath);
            
            fs.createReadStream(csvPath)
                .pipe(csv())
                .on('data', (row) => {
                    let pdfPath = row.signed_pdf_path || row.pdf_path || row.pdfPath;
                    
                    // If PDF path is relative (just filename), resolve it relative to CSV directory
                    if (pdfPath && !path.isAbsolute(pdfPath)) {
                        pdfPath = path.join(csvDir, pdfPath);
                    }
                    
                    const epakUuid = row.epak_uuid || row.epak_id || row.ePakUUID;
                    const docUuid = row.doc_uuid || row.document_uuid || row.documentUUID;
                    
                    // Skip rows with missing essential data
                    if (!epakUuid || !docUuid) {
                        console.warn(`⚠️  Skipping invalid row - missing epak_uuid or doc_uuid:`, row);
                        return;
                    }
                    
                    results.push({
                        epak_uuid: epakUuid,
                        doc_uuid: docUuid,
                        signed_pdf_path: pdfPath
                    });
                })
                .on('end', () => {
                    console.log(`✓ Read ${results.length} valid rows from CSV`);
                    resolve(results);
                })
                .on('error', reject);
        });
    }
    
    /**
     * Query database for ePak current state (comprehensive version)
     * @param {string} epakUuid - ePak UUID or ID
     * @param {string} docUuid - Document UUID or ID
     * @returns {Promise<Object>} Current state object
     */
    async queryEpakState(epakUuid, docUuid) {
        console.log(`  [1/6] Querying epak table...`);
        
        // Validate inputs
        if (!epakUuid) {
            throw new Error('ePak UUID/ID is required but was undefined or empty');
        }
        if (!docUuid) {
            throw new Error('Document UUID/ID is required but was undefined or empty');
        }
        
        // Determine if epakUuid is a UUID or an integer ID
        const isEpakUuid = String(epakUuid).includes('-');
        const epakQuery = isEpakUuid ? `
            SELECT id, status, modifiedOn, progressPercent, subject
            FROM epak
            WHERE uuid = ?
        ` : `
            SELECT id, status, modifiedOn, progressPercent, subject
            FROM epak
            WHERE id = ?
        `;
        const epakData = await this.db.query(epakQuery, [epakUuid]);
        
        if (epakData.length === 0) {
            throw new Error(`ePak not found: ${epakUuid}`);
        }
        
        // Get the actual integer ID for subsequent queries
        const epakId = epakData[0].id;
        console.log(`  ✓ Found ePak ID: ${epakId}`);
        
        // Determine if docUuid is a UUID or an integer ID
        const isDocUuid = String(docUuid).includes('-');
        const docIdQuery = isDocUuid ? `
            SELECT id FROM document WHERE uuid = ?
        ` : `
            SELECT id FROM document WHERE id = ?
        `;
        const docIdData = await this.db.query(docIdQuery, [docUuid]);
        
        if (docIdData.length === 0) {
            throw new Error(`Document not found: ${docUuid}`);
        }
        
        const docId = docIdData[0].id;
        console.log(`  ✓ Found Document ID: ${docId}`);
        
        console.log(`  [2/6] Querying epak_workflowstate_signer table...`);
        const signerQuery = `
            SELECT id, userId, status, statusModifiedOn, progressPercent, ePakId
            FROM epak_workflowstate_signer
            WHERE ePakId = ? AND progressPercent < 100
        `;
        const signerData = await this.db.query(signerQuery, [epakId]);
        console.log(`        → Found ${signerData.length} signer(s) with progress < 100`);
        
        console.log(`  [3/6] Querying docuseraction table...`);
        const docUserQuery = `
            SELECT id, status, actedOn, documentId, signerId
            FROM docuseraction
            WHERE documentId = ? AND status = 'Registered'
        `;
        const docUserData = await this.db.query(docUserQuery, [docId]);
        console.log(`        → Found ${docUserData.length} document action(s) with status=Registered`);
        
        console.log(`  [4/6] Querying document table...`);
        const documentQuery = `
            SELECT id, filePath
            FROM document
            WHERE id = ?
        `;
        const documentData = await this.db.query(documentQuery, [docId]);
        
        console.log(`  [5/6] Checking for reminder activities...`);
        const reminderQuery = `
            SELECT id, action
            FROM epakactivity
            WHERE ePakId = ? 
            AND (action = 'Reminder' OR action = 'ReminderBySystem')
        `;
        const reminderData = await this.db.query(reminderQuery, [epakId]);
        console.log(`        → Found ${reminderData.length} reminder(s) to delete`);
        
        // Get user details for signers and their DocumentViewed activity
        console.log(`  [6/6] Fetching user details and device info for ${signerData.length} signer(s)...`);
        const signerUsers = [];
        for (let idx = 0; idx < signerData.length; idx++) {
            const signer = signerData[idx];
            console.log(`        → [${idx + 1}/${signerData.length}] Querying user ${signer.userId}...`);
            const userDetails = await this.getUserDetails(signer.userId);
            
            // Query documentactivity to get device/platform/userIp from ANY DocumentViewed action by this user
            // Note: We don't query the current document (docId) because it's corrupted and has no activity
            // Instead, we get device info from any recent DocumentViewed activity by this user
            const docViewedQuery = `
                SELECT comments, actedOn, documentId
                FROM documentactivity
                WHERE actorId = ? AND action = 'DocumentViewed'
                ORDER BY actedOn DESC
                LIMIT 1
            `;
            const docViewedData = await this.db.query(docViewedQuery, [signer.userId]);
            
            let deviceInfo = {
                userIp: "MANUAL",
                device: "MANUAL",
                platform: "MANUAL",
                browser: "MANUAL"
            };
            
            if (docViewedData.length > 0 && docViewedData[0].comments) {
                try {
                    const comments = typeof docViewedData[0].comments === 'string' 
                        ? JSON.parse(docViewedData[0].comments) 
                        : docViewedData[0].comments;
                    
                    deviceInfo = {
                        userIp: comments.userIp || "MANUAL",
                        device: comments.device || "MANUAL",
                        platform: comments.platform || "MANUAL",
                        browser: comments.browser || "MANUAL"
                    };
                    console.log(`           ✓ Device: ${deviceInfo.platform} / ${deviceInfo.device} / ${deviceInfo.browser}`);
                } catch (e) {
                    console.log(`           ⚠️  Could not parse device info`);
                }
            } else {
                console.log(`           ⚠️  No DocumentViewed found, using defaults`);
            }
            
            signerUsers.push({
                ...signer,
                userDetails,
                deviceInfo
            });
        }
        
        console.log(`\n  ✅ Database query complete:`);
        console.log(`     - ePak: ${epakData[0]?.status} (${epakData[0]?.progressPercent}%)`);
        console.log(`     - ${signerData.length} signer(s) to update`);
        console.log(`     - ${docUserData.length} document action(s) to update`);
        console.log(`     - ${reminderData.length} reminder(s) to delete`);
        
        return {
            epakId: epakId,           // Integer ID for SQL WHERE clauses
            docId: docId,             // Integer ID for SQL WHERE clauses
            epak: epakData[0] || null,
            signers: signerUsers,
            docUsers: docUserData,
            document: documentData[0] || null,
            reminders: reminderData
        };
    }
    
    /**
     * Get user details from documentactivity and user_tenant tables
     * @param {number} userId - User ID from epak_workflowstate_signer
     * @returns {Promise<Object>} User details
     */
    async getUserDetails(userId) {
        try {
            // Query user_tenant to get tenant info
            const userTenantQuery = `
                SELECT id, tenantId
                FROM user_tenant
                WHERE id = ?
                LIMIT 1
            `;
            const userTenantData = await this.db.query(userTenantQuery, [userId]);
            
            let tenantId = 'MANUAL';
            if (userTenantData.length > 0) {
                // Use tenantId column if it exists, otherwise fall back to userId
                tenantId = userTenantData[0].tenantId || userTenantData[0].id || userId;
            } else {
                console.warn(`    ⚠️  No user_tenant entry found for userId ${userId}`);
            }
            
            // Query documentactivity to get user names (they're cached/denormalized there)
            const actorQuery = `
                SELECT actorFirstName, actorLastName, actorMiddleName, actorEmail
                FROM documentactivity
                WHERE actorId = ?
                ORDER BY actedOn DESC
                LIMIT 1
            `;
            const actorData = await this.db.query(actorQuery, [userId]);
            
            if (actorData.length === 0) {
                console.warn(`    ⚠️  No documentactivity found for userId ${userId}`);
                
                // Fallback: try to get email from user table
                const userQuery = `SELECT email FROM user WHERE id = ? LIMIT 1`;
                const userData = await this.db.query(userQuery, [userId]);
                
                if (userData.length > 0 && userData[0].email) {
                    const email = userData[0].email;
                    const emailName = email.split('@')[0];
                    const nameParts = emailName.split('.');
                    
                    return {
                        id: userId,
                        email: email,
                        firstName: nameParts[0] || 'MANUAL',
                        lastName: nameParts[1] || 'MANUAL',
                        middleName: '',
                        tenantId: tenantId
                    };
                }
                
                return {
                    firstName: 'MANUAL',
                    lastName: 'MANUAL',
                    middleName: '',
                    email: 'MANUAL',
                    id: userId,
                    tenantId: tenantId
                };
            }
            
            const actor = actorData[0];
            
            return {
                id: userId,
                email: actor.actorEmail || 'MANUAL',
                firstName: actor.actorFirstName || 'MANUAL',
                lastName: actor.actorLastName || 'MANUAL',
                middleName: actor.actorMiddleName || '',
                tenantId: tenantId
            };
        } catch (error) {
            console.error(`    ✗ Error getting user details: ${error.message}`);
            return {
                firstName: 'MANUAL',
                lastName: 'MANUAL',
                middleName: '',
                email: 'MANUAL',
                id: userId,
                tenantId: 'MANUAL'
            };
        }
    }
    
    /**
     * Extract Aadhaar data from signed PDF
     * @param {string} pdfPath - Path to signed PDF
     * @returns {Promise<Object>} Aadhaar data
     */
    async extractAadhaarData(pdfPath) {
        try {
            const pdfBuffer = fs.readFileSync(pdfPath);
            const certBuffer = await PDFCertificateExtractor.extractCertificateFromPDF(pdfBuffer);
            const aadhaarData = CertificateParser.parseCertificateFromBuffer(certBuffer);
            
            console.log(`  ✓ Extracted: ${aadhaarData.signerName} (TPIN: ${aadhaarData.tpin})`);
            
            return aadhaarData;
        } catch (error) {
            console.warn(`  ⚠️  Failed to extract Aadhaar data: ${error.message}`);
            return {
                signerName: 'MANUAL',
                tpin: 'MANUAL',
                gender: 'MANUAL',
                yob: 'MANUAL',
                state: 'MANUAL',
                pincode: 'MANUAL',
                serialNumber: 'MANUAL',
                issuerName: 'MANUAL',
                issuerOrganisation: 'MANUAL',
                endDate: null
            };
        }
    }
    
    /**
     * Generate fix commands based on current state (improved version)
     * @param {string} epakUuid - ePak UUID
     * @param {string} docUuid - Document UUID
     * @param {Object} currentState - Current state from DB
     * @param {Object} aadhaarData - Aadhaar data from PDF
     * @returns {Promise<Array>} Array of fix command objects
     */
    async generateFixCommands(epakUuid, docUuid, currentState, aadhaarData) {
        const commands = [];
        const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
        
        // Check if ePak is corrupted (progress < 100 or status != Completed)
        const isCorrupted = !currentState.epak || 
                           currentState.epak.progressPercent < 100 || 
                           currentState.epak.status !== 'Completed';
        
        if (!isCorrupted) {
            console.log('  ℹ️  ePak already completed, no fixes needed');
            return commands;
        }
        
        console.log('  🔍 ePak is corrupted, generating fix commands...');
        
        // Query 4: Delete reminder activities (do this first)
        if (currentState.reminders && currentState.reminders.length > 0) {
            const reminderIds = currentState.reminders.map(r => `'${r.id}'`).join(',');
            commands.push({
                epak_uuid: epakUuid,
                doc_uuid: docUuid,
                table: 'epakactivity',
                operation: 'DELETE',
                columns_values: '',
                where_clause: `id IN (${reminderIds})`,
                status: 'Pending',
                last_ran: ''
            });
            console.log(`    ✓ DELETE ${currentState.reminders.length} reminder activities`);
        }
        
        // Query 2: Update epak_workflowstate_signer (for each signer with progress < 100)
        for (const signer of currentState.signers) {
            commands.push({
                epak_uuid: epakUuid,
                doc_uuid: docUuid,
                table: 'epak_workflowstate_signer',
                operation: 'UPDATE',
                columns_values: `status = 'Signed', statusModifiedOn = '${timestamp}', progressPercent = 100`,
                where_clause: `id = ${signer.id}`,
                status: 'Pending',
                last_ran: ''
            });
        }
        console.log(`    ✓ UPDATE ${currentState.signers.length} signer(s) to Signed`);
        
        // Query 3: Update docuseraction (for entries with status='Registered')
        for (const docUser of currentState.docUsers) {
            commands.push({
                epak_uuid: epakUuid,
                doc_uuid: docUuid,
                table: 'docuseraction',
                operation: 'UPDATE',
                columns_values: `status = 'Signed', actedOn = '${timestamp}'`,
                where_clause: `id = ${docUser.id}`,
                status: 'Pending',
                last_ran: ''
            });
        }
        console.log(`    ✓ UPDATE ${currentState.docUsers.length} document action(s) to Signed`);
        
        // Query 5: INSERT documentactivity (for each signer)
        for (const signer of currentState.signers) {
            const user = signer.userDetails;
            const deviceInfo = signer.deviceInfo || {};
            
            // Build Aadhaar details as a JSON string (will be nested in comments)
            const aadhaarDetailsStr = JSON.stringify({
                signerName: aadhaarData.signerName,
                pincode: aadhaarData.pincode,
                state: aadhaarData.state,
                yob: aadhaarData.yob,
                gender: aadhaarData.gender,
                serialNumber: aadhaarData.serialNumber,
                issuerName: aadhaarData.issuerName,
                issuerOrganisation: aadhaarData.issuerOrganisation,
                endDate: aadhaarData.endDate,
                tpin: aadhaarData.tpin
            });
            
            // Build comments JSON with aadhaarDetails as a nested JSON string
            const commentsObj = {
                signReason: "I agree to the terms defined by the placement of my signature on this document.",
                aadhaarDetails: aadhaarDetailsStr, // This will be a JSON string inside the outer JSON
                signingPolicy: "Aadhaar",
                browser: deviceInfo.browser || "MANUAL",
                signConsent: "I agree that my digital signature is the legally binding equivalent to my handwritten signature. I will not, at any time in the future, repudiate the meaning of my digital signature or claim that my digital signature does not have the same validity and meaning as my handwritten signature. I understand that I am accountable and responsible for all actions associated with my digital Signature.",
                userIp: deviceInfo.userIp || "MANUAL",
                device: deviceInfo.device || "MANUAL",
                platform: deviceInfo.platform || "MANUAL"
            };
            
            /**
             * SQL JSON Escaping Rules for Nested JSON:
             * 
             * IMPORTANT: This escaping handles nested JSON strings correctly for MySQL.
             * 
             * The comments field contains a JSON object where aadhaarDetails is a JSON STRING (not object).
             * When preparing for SQL INSERT, we need different escape levels:
             * 
             * 1. Outer JSON quotes → \" (single backslash + quote)
             * 2. Nested JSON string quotes (inside aadhaarDetails) → \\" (double backslash + quote)
             * 
             * CORRECT OUTPUT:
             * {"signReason":"...","aadhaarDetails":"{\"signerName\":\"John\"}","signingPolicy":"Aadhaar"}
             * 
             * INCORRECT (causes MySQL json_extract errors):
             * {"signReason":"...","aadhaarDetails":"{\\"signerName\\":\\"John\\"}","signingPolicy":"Aadhaar"}
             * 
             * The transformation works as follows:
             * 1. JSON.stringify(commentsObj) creates: {"key":"value","aadhaarDetails":"{\"nested\":\"value\"}"}
             * 2. replace(/\\"/g, '\\\\"') converts \" → \\" for nested JSON strings
             * 3. replace(/"/g, '\\"') converts " → \" for outer JSON structure
             * 
             * DO NOT use .replace(/"/g, '\\"') alone - it creates wrong escaping for nested JSON!
             */
            const commentsJson = JSON.stringify(commentsObj).replace(/\\"/g, '\\\\"').replace(/"/g, '\\"');
            
            // Extract document name from filePath
            const filePath = currentState.document?.filePath || '';
            const documentName = filePath ? path.basename(filePath) : 'MANUAL';
            
            commands.push({
                epak_uuid: epakUuid,
                doc_uuid: docUuid,
                table: 'documentactivity',
                operation: 'INSERT',
                columns_values: `actedOn = '${timestamp}', action = 'Signed', actorEmail = '${user.email}', actorFirstName = '${user.firstName}', actorId = ${user.id}, actorLastName = '${user.lastName}', actorMiddleName = '${user.middleName || ''}', actorRole = 'Signer', comments = '${commentsJson}', status = 'Draft', documentName = '${documentName}', version = NULL, documentId = ${currentState.docId}, tenantId = ${user.tenantId}, reason = NULL`,
                where_clause: '',
                status: 'Pending',
                last_ran: ''
            });
        }
        console.log(`    ✓ INSERT ${currentState.signers.length} documentactivity record(s)`);
        
        // Query 6: INSERT epakactivity (Completed)
        // Get custodian/owner details (use first signer or MANUAL)
        const custodianUser = currentState.signers[0]?.userDetails || {
            email: 'MANUAL',
            firstName: 'MANUAL',
            id: 'MANUAL',
            lastName: 'MANUAL',
            middleName: '',
            tenantId: 'MANUAL'
        };
        
        const epakSubject = currentState.epak?.subject || 'MANUAL';
        
        const epakCommentsJson = JSON.stringify({
            nxtStateMsg: ""
        }).replace(/"/g, '\\"');
        
        commands.push({
            epak_uuid: epakUuid,
            doc_uuid: docUuid,
            table: 'epakactivity',
            operation: 'INSERT',
            columns_values: `actedOn = '${timestamp}', action = 'Completed', actorEmail = '${custodianUser.email}', actorFirstName = '${custodianUser.firstName}', actorId = ${custodianUser.id}, actorLastName = '${custodianUser.lastName}', actorMiddleName = '${custodianUser.middleName || ''}', actorRole = 'Custodian', comments = '${epakCommentsJson}', ePakId = ${currentState.epakId}, epakSubject = '${epakSubject}', reason = NULL, status = 'Completed', tenantId = ${custodianUser.tenantId}`,
            where_clause: '',
            status: 'Pending',
            last_ran: ''
        });
        console.log(`    ✓ INSERT epakactivity (Completed)`);
        
        // Query 1: Update ePak to Completed (LAST STEP)
        if (currentState.epak && currentState.epak.status !== 'Completed') {
            commands.push({
                epak_uuid: epakUuid,
                doc_uuid: docUuid,
                table: 'epak',
                operation: 'UPDATE',
                columns_values: `status = 'Completed', modifiedOn = '${timestamp}', progressPercent = 100`,
                where_clause: `id = ${currentState.epakId}`,
                status: 'Pending',
                last_ran: ''
            });
            console.log(`    ✓ UPDATE ePak to Completed (100%) - FINAL STEP`);
        }
        
        return commands;
    }
    
    /**
     * Write output CSV with fix commands
     * @param {string} csvPath - Path to output CSV
     * @param {Array} commands - Array of fix commands
     */
    async writeOutputCsv(csvPath, commands) {
        const csvWriter = createObjectCsvWriter({
            path: csvPath,
            header: [
                { id: 'epak_uuid', title: 'ePakUUID' },
                { id: 'doc_uuid', title: 'DocumentUUID' },
                { id: 'table', title: 'Table' },
                { id: 'operation', title: 'Operation' },
                { id: 'columns_values', title: 'Column & Values' },
                { id: 'where_clause', title: 'Where clause' },
                { id: 'status', title: 'Status' },
                { id: 'last_ran', title: 'Last ran' }
            ]
        });
        
        await csvWriter.writeRecords(commands);
        console.log(`  ✓ Wrote ${commands.length} commands to ${csvPath}`);
    }
}

module.exports = EpakFixSheetGenerator;
