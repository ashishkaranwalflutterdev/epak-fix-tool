// Terminal state - matches main.sh workflow exactly
const state = {
    step: 'start', // start, credentials, connected, epak_input, epak_loaded, building_ops, preview, executing
    dbConfig: null,
    epakId: null,
    documentId: null,
    signerId: null,
    userId: null,
    operations: [],
    opDescriptions: [],
    history: [],
    historyIndex: -1,
    currentBatchName: null, // Track current batch for auto-move to processed
    awaitingPrompt: false // Flag to prevent command execution during prompts
};

// DOM elements
const terminal = document.getElementById('terminal');
const commandInput = document.getElementById('command-input');
const executeBtn = document.getElementById('execute-btn');
const clearBtn = document.getElementById('clear-btn');
const batchBtn = document.getElementById('batch-btn');
const certBtn = document.getElementById('cert-btn');
const fileInput = document.getElementById('file-input');
const certInput = document.getElementById('cert-input');
const statusDiv = document.getElementById('status');

// Initialize
window.addEventListener('load', () => {
    // Try to load saved credentials
    const savedCreds = loadSavedCredentials();
    if (savedCreds) {
        printHeader('EPak Completion Script - Support Team Tool');
        printInfo('Loading database credentials...');
        print('');
        printSuccess('Using saved credentials');
        print(`  Host: ${savedCreds.host}`);
        print(`  Database: ${savedCreds.database}`);
        print(`  User: ${savedCreds.user}`);
        print(`  Password: ••••••••`);
        print('');
        print('Would you like to:', 'bold');
        print('  1. Continue with these credentials');
        print('  2. Change credentials (type: reset)');
        print('');
        print('Press Enter or type "1" to continue, or "reset" to clear credentials');
        print('');
        state.step = 'confirm_creds';
        state.savedCreds = savedCreds;
    } else {
        printWelcome();
    }
    loadCommandHistory();
    commandInput.focus();
});

// Print functions - matching main.sh colors
function print(text, className = '') {
    const line = document.createElement('div');
    line.className = `line ${className}`;
    line.textContent = text;
    terminal.appendChild(line);
    terminal.scrollTop = terminal.scrollHeight;
}

function printHeader(text) {
    print('');
    print('================================================================', 'blue bold');
    print(`  ${text}`, 'blue bold');
    print('================================================================', 'blue bold');
    print('');
}

function printSection(text) {
    print('');
    print(`=== ${text} ===`, 'info bold');
    print('');
}

function printSuccess(text) {
    print(`✅ ${text}`, 'success');
}

function printError(text) {
    print(`❌ ${text}`, 'error');
}

function printWarning(text) {
    print(`⚠️  ${text}`, 'warning');
}

function printInfo(text) {
    print(`ℹ️  ${text}`, 'info');
}

function printPrompt(text) {
    const line = document.createElement('div');
    line.className = 'line';
    line.innerHTML = '<span style="color: #00ff00; font-weight: bold;">$</span> ' + escapeHtml(text);
    terminal.appendChild(line);
    terminal.scrollTop = terminal.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Print table matching mysql -t output with borders
function printTable(data) {
    if (!data || data.length === 0) {
        print('Empty set');
        return;
    }

    const headers = Object.keys(data[0]);
    const colWidths = headers.map(h => {
        const dataWidths = data.map(row => String(row[h] === null ? 'NULL' : row[h]).length);
        return Math.max(h.length, ...dataWidths) + 2;
    });

    // Create border line
    const borderLine = '+' + colWidths.map(w => '-'.repeat(w)).join('+') + '+';
    
    // Print top border
    print(borderLine);
    
    // Print header row
    const headerRow = '|' + headers.map((h, i) => {
        return ' ' + h.padEnd(colWidths[i] - 1);
    }).join('|') + '|';
    print(headerRow);
    
    // Print separator after header
    print(borderLine);
    
    // Print data rows
    data.forEach(row => {
        const values = '|' + headers.map((h, i) => {
            const val = row[h] === null ? 'NULL' : String(row[h]);
            return ' ' + val.padEnd(colWidths[i] - 1);
        }).join('|') + '|';
        print(values);
    });
    
    // Print bottom border
    print(borderLine);
}

function printWelcome() {
    printHeader('EPak Completion Script - Support Team Tool');
    printInfo('Loading database credentials...');
    print('');
    printWarning('No saved credentials found');
    print('');
    state.step = 'credentials';
    printInfo('Enter database credentials:');
    print('Command: connect <host> <user> <password> <database>');
    print('Example: connect localhost msb mypass msb');
    print('');
}

// Credential storage functions
function saveCredentials(host, user, password, database) {
    const creds = { host, user, password, database };
    localStorage.setItem('epak_credentials', JSON.stringify(creds));
    printSuccess('Credentials saved for future use');
}

function loadSavedCredentials() {
    try {
        const saved = localStorage.getItem('epak_credentials');
        return saved ? JSON.parse(saved) : null;
    } catch (e) {
        return null;
    }
}

function clearSavedCredentials() {
    localStorage.removeItem('epak_credentials');
    printSuccess('Credentials cleared');
}

// Command history storage functions
function saveCommandHistory() {
    try {
        // Keep only last 100 commands
        const historyToSave = state.history.slice(-100);
        localStorage.setItem('epak_command_history', JSON.stringify(historyToSave));
    } catch (e) {
        console.error('Failed to save command history:', e);
    }
}

function loadCommandHistory() {
    try {
        const saved = localStorage.getItem('epak_command_history');
        if (saved) {
            state.history = JSON.parse(saved);
            state.historyIndex = state.history.length;
        }
    } catch (e) {
        console.error('Failed to load command history:', e);
        state.history = [];
        state.historyIndex = -1;
    }
}

function clearCommandHistory() {
    localStorage.removeItem('epak_command_history');
    state.history = [];
    state.historyIndex = -1;
    printSuccess('Command history cleared');
}

function showCommandHistory() {
    print('');
    printSection('Command History');
    print('');
    if (state.history.length === 0) {
        printInfo('No commands in history');
        print('');
        return;
    }
    
    printInfo(`Showing last ${Math.min(state.history.length, 20)} commands:`);
    print('');
    
    // Show last 20 commands
    const recentHistory = state.history.slice(-20);
    recentHistory.forEach((cmd, idx) => {
        const lineNum = state.history.length - 20 + idx + 1;
        print(`  ${lineNum}. ${cmd}`);
    });
    
    print('');
    printInfo('Use ⬆️ ⬇️ arrow keys to navigate through history');
    print('');
}

// Main command executor
async function executeCommand(cmd) {
    if (!cmd.trim()) return;

    printPrompt(cmd);
    state.history.push(cmd);
    state.historyIndex = state.history.length;
    saveCommandHistory(); // Persist to localStorage

    const parts = cmd.trim().split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    try {
        switch (state.step) {
            case 'confirm_creds':
                if (cmd.trim() === '' || cmd.trim() === '1') {
                    // Auto-connect with saved credentials
                    await autoConnect();
                } else if (command === 'reset') {
                    clearSavedCredentials();
                    clearTerminal();
                    printWelcome();
                } else {
                    printInfo('Press Enter to continue or type "reset" to clear credentials');
                }
                break;

            case 'credentials':
                if (command === 'connect') {
                    await handleConnect(args);
                } else {
                    printError('Please connect first: connect <host> <user> <password> <database>');
                }
                break;

            case 'awaiting_pdf_path':
                if (command) {
                    state.step = 'connected';
                    await handleBatchPdfProcessing(command);
                } else {
                    printError('Please enter a directory path');
                }
                break;

            case 'connected':
                // Check for commands first
                if (command === 'batch') {
                    handleBatchCommand();
                } else if (command === 'pdfbatch' && args.length > 0) {
                    await handleBatchPdfProcessing(args.join(' '));
                } else if (command === 'pdfbatch') {
                    state.step = 'awaiting_pdf_path';
                    print('');
                    printSection('Batch PDF Processing');
                    print('');
                    printInfo('Enter the directory path containing signed PDFs:');
                    print('');
                    print('Examples:');
                    print('  - Relative: signed_pdfs/');
                    print('  - Absolute: /Users/username/Documents/signed_files');
                    print('  - Windows: C:\\Users\\username\\Documents\\signed_files');
                    print('');
                    print('Type the path and press Enter:');
                    print('');
                } else if (command === 'fixsheet' && args.length > 0) {
                    // File path provided
                    await handleFixSheetPath(args.join(' '));
                } else if (command === 'fixsheet') {
                    // No args, show help
                    handleFixSheetCommand();
                } else if (command === 'batches') {
                    // List all batches
                    await handleListBatches();
                } else if (command === 'process' && args.length > 0) {
                    // Process a batch (generate fix sheet)
                    await handleProcessBatch(args[0]);
                } else if (command === 'process') {
                    printError('Usage: process <batch-name>');
                    print('Example: process batch-1');
                } else if (command === 'execute' && args.length > 0) {
                    // Execute fix sheet
                    await handleExecuteBatch(args[0]);
                } else if (command === 'execute') {
                    printError('Usage: execute <batch-name>');
                    print('Example: execute batch-1');
                } else if (command === 'cert') {
                    handleCertCommand();
                } else if (command === 'cert' && args.length > 0) {
                    const subCmd = args[0];
                    if (subCmd === 'upload') {
                        certInput.click();
                    } else if (subCmd === 'path' && args.length > 1) {
                        await handleCertPath(args.slice(1).join(' '));
                    } else {
                        printError('Invalid cert command. Use "cert upload" or "cert path <path>"');
                    }
                } else if (command === 'help') {
                    showHelp();
                } else if (command === 'clear') {
                    clearTerminal();
                } else if (command === 'history') {
                    showCommandHistory();
                } else if (command === 'reset') {
                    clearSavedCredentials();
                    print('');
                    printInfo('Please refresh the page to reconnect');
                } else if (!isNaN(command) && command.trim() !== '') {
                    // Check if command is a number (EPak ID)
                    await handleEpakInput(command);
                } else {
                    printInfo('Enter EPak ID, type "batch" for bulk processing, or "cert" to extract certificate');
                    print('Example: 1513469');
                }
                break;

            case 'epak_loaded':
                // Show operations menu
                if (command === 'menu' || command === '1' || command === '2' || command === '3' || command === '4' || command === '5' || command === '6' || command === '7') {
                    await handleOperationsMenu(command === 'menu' ? '0' : command);
                } else {
                    printError('Type a number 1-7 for the operations menu');
                }
                break;

            case 'building_ops':
                // Handle building operations
                await handleBuildingOperations(cmd, args);
                break;

            case 'preview':
                // Handle preview confirmation
                if (cmd.trim().toUpperCase() === 'EXECUTE') {
                    await handleExecute();
                } else {
                    printWarning('Type "EXECUTE" to proceed or refresh page to cancel');
                }
                break;

            default:
                if (command === 'help') {
                    showHelp();
                } else if (command === 'clear') {
                    clearTerminal();
                } else if (command === 'history') {
                    showCommandHistory();
                } else if (command === 'reset') {
                    clearSavedCredentials();
                    print('');
                    printInfo('Please refresh the page to reconnect');
                } else if (command === 'batch') {
                    handleBatchCommand();
                } else if (command === 'pdfbatch' && args.length > 0) {
                    await handleBatchPdfProcessing(args.join(' '));
                } else if (command === 'pdfbatch') {
                    state.step = 'awaiting_pdf_path';
                    print('');
                    printSection('Batch PDF Processing');
                    print('');
                    printInfo('Enter the directory path containing signed PDFs:');
                    print('');
                    print('Examples:');
                    print('  - Relative: signed_pdfs/');
                    print('  - Absolute: /Users/username/Documents/signed_files');
                    print('  - Windows: C:\\Users\\username\\Documents\\signed_files');
                    print('');
                    print('Type the path and press Enter:');
                    print('');
                } else if (command === 'fixsheet' && args.length > 0) {
                    // File path provided
                    await handleFixSheetPath(args.join(' '));
                } else if (command === 'fixsheet') {
                    // No args, show help
                    handleFixSheetCommand();
                } else if (command === 'cert') {
                    handleCertCommand();
                } else if (command === 'cert' && args.length > 0) {
                    const subCmd = args[0];
                    if (subCmd === 'upload') {
                        certInput.click();
                    } else if (subCmd === 'path' && args.length > 1) {
                        await handleCertPath(args.slice(1).join(' '));
                    } else {
                        printError('Invalid cert command. Use "cert upload" or "cert path <path>"');
                    }
                } else {
                    printError(`Unknown command: ${command}. Type "help" for commands.`);
                }
        }
    } catch (error) {
        printError(`Error: ${error.message}`);
    }

    print('');
}

function showHelp() {
    print('');
    print('EPak Fix Tool - Commands:', 'info bold');
    print('');
    print('1. connect <host> <user> <password> <database>');
    print('   Connect to database (credentials saved for next time)');
    print('');
    print('2. <epak_id>');
    print('   Start fixing an EPak (e.g., 1513469)');
    print('');
    print('3. Follow the on-screen prompts');
    print('   - Operations menu (1-7)');
    print('   - Build operations');
    print('   - Execute');
    print('');
    print('4. batch');
    print('   Upload Excel/CSV file for batch processing');
    print('   Supports: .xlsx, .xls, .csv, .tsv, .txt');
    print('');
    print('5. Certificate Commands:');
    print('   - Click "Certificate" button to upload certificate or signed PDF');
    print('     Supports: .cer, .crt, .pem, .pdf');
    print('   - certpath <path>  Parse certificate from server path');
    print('     Example: certpath certificates/CertExchangeAshishKaranwal.cer');
    print('   - Menu option 8: Parse certificate during EPak fix');
    print('');
    print('6. pdfbatch [directory_path]');
    print('   Process all signed PDFs in a directory');
    print('   Extracts Aadhaar details from all PDFs and exports to CSV');
    print('   Usage:');
    print('   - Type "pdfbatch" and you will be prompted for the path');
    print('   - Or type: pdfbatch signed_pdfs/');
    print('   - Or type: pdfbatch /Users/username/Documents/signed_files');
    print('');
    print('7. fixsheet [csv_path]');
    print('   Generate ePak fix sheet from corrupted ePak list');
    print('   - Upload via UI: Click "Batch Upload" button');
    print('   - Or type: fixsheet path/to/epaks-to-fix.csv');
    print('   CSV format: epak_uuid, doc_uuid, signed_pdf_path');
    print('   Outputs SQL commands to fix corrupted ePaks');
    print('');
    print('8. Automated Batch Processing:');
    print('   - batches           List all pending and ready batches');
    print('   - process <batch>   Generate fix sheet for a batch');
    print('     Example: process batch-1');
    print('   - execute <batch>   Execute fix sheet operations');
    print('     Example: execute batch-1');
    print('   ');
    print('   📁 Directory Structure:');
    print('   data-source/');
    print('     corrupted-epaks/to-process/batch-1/  (put CSV + PDFs here)');
    print('     fix-sheets/to-process/batch-1/       (generated fix sheets)');
    print('');
    print('10. reset');
    print('   Clear saved credentials');
    print('');
    print('11. clear');
    print('   Clear terminal screen');
    print('');
    print('Navigation:', 'info bold');
    print('  ⬆️  Arrow Up    - Previous command in history');
    print('  ⬇️  Arrow Down  - Next command in history');
    print('  💾 History is automatically saved and persisted');
    print('');
}

// Auto-connect with saved credentials
async function autoConnect() {
    if (!state.savedCreds) return;
    
    print('');
    printInfo('Testing database connection...');
    
    const { host, user, password, database } = state.savedCreds;
    
    try {
        const response = await fetch('/api/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ host, user, password, database })
        });

        const result = await response.json();

        if (result.success) {
            state.dbConfig = { host, user, password, database };
            state.step = 'connected';
            statusDiv.textContent = `Connected: ${database}@${host}`;
            statusDiv.classList.add('connected');
            printSuccess('Connected to database successfully!');
            print('');
            printSection('Step 1: Enter EPak Details');
            print('Enter EPak ID: <epak_id>');
            print('Example: 1513469');
            print('');
            print('Or type "batch" to upload Excel/CSV file for bulk processing', 'info');
        } else {
            printError(result.error);
            print('');
            printWarning('Saved credentials failed. Please reconnect.');
            clearSavedCredentials();
            state.step = 'credentials';
            printInfo('Enter database credentials:');
            print('Command: connect <host> <user> <password> <database>');
        }
    } catch (error) {
        printError(`Connection failed: ${error.message}`);
        clearSavedCredentials();
    }
}

// Connect to database
async function handleConnect(args) {
    if (args.length < 4) {
        printError('Usage: connect <host> <user> <password> <database>');
        return;
    }

    const [host, user, password, database] = args;
    
    print('');
    printInfo('Testing database connection...');
    
    try {
        const response = await fetch('/api/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ host, user, password, database })
        });

        const result = await response.json();

        if (result.success) {
            state.dbConfig = { host, user, password, database };
            state.step = 'connected';
            statusDiv.textContent = `Connected: ${database}@${host}`;
            statusDiv.classList.add('connected');
            printSuccess('Connected to database successfully!');
            print('');
            
            // Save credentials
            saveCredentials(host, user, password, database);
            print('');
            
            printSection('Step 1: Enter EPak Details');
            print('Enter EPak ID: <epak_id>');
            print('Example: 1513469');
            print('');
            print('Or type "batch" to upload Excel/CSV file for bulk processing', 'info');
        } else {
            printError(result.error);
        }
    } catch (error) {
        printError(`Connection failed: ${error.message}`);
    }
}

// Handle EPak ID input - EXACT flow from main.sh lines 826-892
async function handleEpakInput(epakId) {
    state.epakId = epakId;
    
    print('');
    printInfo('Checking documents in EPak...');
    
    try {
        // Get document count
        const countQuery = `SELECT COUNT(*) as count FROM epak_document WHERE ePakId = ${epakId}`;
        const countResult = await runQuery(countQuery);
        
        if (!countResult || countResult.length === 0 || countResult[0].count === 0) {
            printError(`No documents found for EPak ID ${epakId}. EPak may not exist!`);
            return;
        }

        const docCount = countResult[0].count;

        if (docCount === 1) {
            // Single document - auto-select
            const docQuery = `SELECT documentId FROM epak_document WHERE ePakId = ${epakId} LIMIT 1`;
            const docResult = await runQuery(docQuery);
            state.documentId = docResult[0].documentId;
            printSuccess(`Found 1 document (ID: ${state.documentId}) - auto-selected`);
        } else {
            // Multiple documents
            printWarning(`Found ${docCount} documents in this EPak!`);
            print('');
            print(`Documents in EPak #${epakId}:`, 'bold');
            
            const docsQuery = `SELECT ed.documentId, d.title as documentName FROM epak_document ed JOIN document d ON d.id = ed.documentId WHERE ed.ePakId = ${epakId} ORDER BY ed.documentId`;
            const docs = await runQuery(docsQuery);
            printTable(docs);
            
            // Auto-select first for simplicity in web version
            state.documentId = docs[0].documentId;
            printInfo(`Auto-selected first document: ${state.documentId}`);
        }

        // Show current state - EXACT from main.sh lines 894-984
        await showCurrentState();
        
    } catch (error) {
        printError(`Failed to load EPak: ${error.message}`);
    }
}

// Show current state - EXACT from main.sh lines 894-984
async function showCurrentState() {
    printHeader(`CURRENT STATE - EPak #${state.epakId}`);

    // 1. EPak Table
    printSection('1. EPak Table');
    const epakQuery = `SELECT id, status, progressPercent, subject, sentOn, modifiedOn, currentWorkflowStateId, ownerId FROM epak WHERE id = ${state.epakId}`;
    await runQueryAndPrint(epakQuery);

    // 2. Documents
    printSection('2. Documents in EPak');
    const docsQuery = `SELECT ed.documentId, d.title FROM epak_document ed JOIN document d ON d.id = ed.documentId WHERE ed.ePakId = ${state.epakId} ORDER BY ed.documentId`;
    await runQueryAndPrint(docsQuery);

    // 3. Signers
    printSection('3. EPak Workflow State Signers');
    const signersQuery = `SELECT id, userId, status, progressPercent, statusModifiedOn, workflowStateOrderId, signerOrderId FROM epak_workflowstate_signer WHERE ePakId = ${state.epakId} ORDER BY workflowStateOrderId`;
    await runQueryAndPrint(signersQuery);

    // 4. Document User Actions
    printSection('4. Document User Actions');
    const actionsQuery = `SELECT id, signerId, status, actedOn, workflowStateOrderId FROM docuseraction WHERE ePakId = ${state.epakId} ORDER BY workflowStateOrderId`;
    await runQueryAndPrint(actionsQuery);

    // 5. Document Activity
    printSection('5. ALL Document Activity (No Limit)');
    const docActivityQuery = `SELECT id, actedOn, action, actorEmail, actorFirstName, actorLastName, actorMiddleName, LEFT(comments, 100) as comments_preview FROM documentactivity WHERE documentId = ${state.documentId} ORDER BY actedOn ASC`;
    await runQueryAndPrint(docActivityQuery);

    // 6. EPak Activity
    printSection('6. ALL EPak Activity (No Limit)');
    const epakActivityQuery = `SELECT id, actedOn, action, actorEmail, actorFirstName, actorLastName, status FROM epakactivity WHERE ePakId = ${state.epakId} ORDER BY actedOn ASC`;
    await runQueryAndPrint(epakActivityQuery);

    // Ask what to do - EXACT from main.sh lines 986-1014
    print('');
    printWarning('Review the current state above carefully!');
    print('');
    print('What would you like to do?', 'bold');
    print('  1. Fix EPak with manual control (recommended)');
    print('  2. Corrupt EPak for testing');
    print('  3. Cancel operation');
    print('');
    print('Enter choice [1-3]: 1');
    print('(Auto-selected option 1 for web version)');
    print('');
    
    // Get pending signer - EXACT from main.sh lines 1016-1170
    await getPendingSigner();
}

// Get pending signer - EXACT from main.sh lines 1016-1170
async function getPendingSigner() {
    printSection('Step 2: Identify Pending Signer');
    
    const signerQuery = `SELECT ews.id, ews.userId, COALESCE(u.email, 'Unknown') as email FROM epak_workflowstate_signer ews LEFT JOIN user u ON u.id = ews.userId WHERE ews.ePakId = ${state.epakId} AND ews.status = 'Pending' ORDER BY ews.workflowStateOrderId DESC LIMIT 1`;
    
    try {
        const signers = await runQuery(signerQuery);
        
        if (!signers || signers.length === 0) {
            printWarning('No pending signer found! EPak may already be completed.');
            print('');
            print('For testing, you can still proceed to manual operations.');
            state.signerId = 0;
            state.userId = 0;
        } else {
            state.signerId = signers[0].id;
            state.userId = signers[0].userId;
            const email = signers[0].email;
            
            print('Pending Signer Details:', 'bold');
            print(`  Signer ID: ${state.signerId}`);
            print(`  User ID: ${state.userId}`);
            print(`  Email: ${email}`);
            print('');
        }

        // Start manual operations - EXACT from main.sh line 1177
        await showOperationsMenu();
        
    } catch (error) {
        printError(`Failed to get signer: ${error.message}`);
    }
}

// Show operations menu - EXACT from main.sh lines 1177-1214
async function showOperationsMenu() {
    printHeader('Manual Database Operations');
    state.step = 'epak_loaded';
    await displayOperationsMenu();
}

async function displayOperationsMenu() {
    print('');
    printSection('Operation Menu');
    print('');
    print(`Current Operations Queued: ${state.operations.length}`, 'bold');
    if (state.operations.length > 0) {
        for (let i = 0; i < state.opDescriptions.length; i++) {
            print(`  ${i + 1}. ${state.opDescriptions[i]}`);
        }
    }
    print('');
    print('What would you like to do?', 'bold');
    print('  1. UPDATE a row');
    print('  2. INSERT a new row');
    print('  3. DELETE a row');
    print('  4. View data from a table');
    print('  5. Remove last operation');
    print('  6. Done - Execute all operations');
    print('  7. Cancel and exit');
    print('  8. Parse Certificate (extract Aadhaar details)');
    print('');
    print('Enter choice [1-8]:');
}

async function handleOperationsMenu(choice) {
    if (choice === '0') {
        await displayOperationsMenu();
        return;
    }

    switch (choice) {
        case '1':
            await handleUpdateOperation();
            break;
        case '2':
            await handleInsertOperation();
            break;
        case '3':
            await handleDeleteOperation();
            break;
        case '4':
            await handleViewData();
            break;
        case '5':
            handleRemoveLastOperation();
            break;
        case '6':
            await handleDone();
            break;
        case '7':
            handleCancel();
            break;
        case '8':
            await handleParseCertificate();
            break;
        default:
            printError('Invalid choice. Enter 1-8');
            await displayOperationsMenu();
    }
}

// Handle UPDATE - simplified for web
async function handleUpdateOperation() {
    print('');
    printInfo('UPDATE Operation');
    print('');
    print('Format: update <table> <id> <field=value> <field=value>...');
    print('Example: update epak 1513469 status=Completed progressPercent=100');
    print('');
    print('Quick commands:');
    print(`  update epak ${state.epakId} status=Completed progressPercent=100`);
    print(`  update epak_workflowstate_signer ${state.signerId} status=Signed progressPercent=100`);
    print('');
    state.step = 'building_ops';
    state.buildingOp = 'update';
}

async function handleInsertOperation() {
    print('');
    printInfo('INSERT Operation');
    print('');
    print('Format: insert <table> <field=value> <field=value>...');
    print('Example: insert epakactivity action=Completed actorId=123');
    print('');
    state.step = 'building_ops';
    state.buildingOp = 'insert';
}

async function handleDeleteOperation() {
    print('');
    printInfo('DELETE Operation');
    print('');
    print('Format: delete <table> <id>');
    print('Example: delete documentactivity 12345');
    print('');
    state.step = 'building_ops';
    state.buildingOp = 'delete';
}

async function handleViewData() {
    print('');
    printInfo('View Table Data');
    print('');
    print('Format: view <table> <where_clause>');
    print('Example: view epak id=' + state.epakId);
    print('');
    state.step = 'building_ops';
    state.buildingOp = 'view';
}

function handleRemoveLastOperation() {
    if (state.operations.length > 0) {
        state.operations.pop();
        state.opDescriptions.pop();
        printSuccess('Last operation removed');
    } else {
        printWarning('No operations to remove');
    }
    displayOperationsMenu();
}

async function handleDone() {
    if (state.operations.length === 0) {
        printWarning('No operations queued!');
        displayOperationsMenu();
        return;
    }
    
    // Preview - EXACT from main.sh lines 1672-1688
    printHeader('PREVIEW - All Operations to Execute');
    printSection(`Summary of ${state.operations.length} Operations:`);
    print('');
    
    for (let i = 0; i < state.operations.length; i++) {
        print(`Operation ${i + 1}: ${state.opDescriptions[i]}`, 'success bold');
        print(`   ${state.operations[i]}`);
        print('');
    }

    print('');
    printWarning(`FINAL CONFIRMATION: Execute ALL ${state.operations.length} operations above?`);
    print('');
    print("Type 'EXECUTE' to proceed:");
    
    state.step = 'preview';
}

function handleCancel() {
    printInfo('Operation cancelled by user');
    location.reload();
}

// Handle building operations
async function handleBuildingOperations(cmd, args) {
    const parts = cmd.trim().split(/\s+/);
    const operation = parts[0].toLowerCase();

    if (operation === 'menu') {
        state.step = 'epak_loaded';
        await displayOperationsMenu();
        return;
    }

    if (operation === 'update') {
        // Format: update <table> <id> <field=value>...
        if (parts.length < 4) {
            printError('Format: update <table> <id> <field=value> <field=value>...');
            return;
        }
        
        const table = parts[1];
        const id = parts[2];
        const updates = parts.slice(3);
        
        const setParts = [];
        for (const update of updates) {
            const [field, value] = update.split('=');
            if (!field || value === undefined) {
                printError(`Invalid format: ${update}`);
                return;
            }
            if (/^\d+$/.test(value) || value.toUpperCase() === 'NOW()') {
                setParts.push(`${field}=${value}`);
            } else {
                setParts.push(`${field}='${value}'`);
            }
        }

        const sql = `UPDATE ${table} SET ${setParts.join(', ')} WHERE id=${id};`;
        state.operations.push(sql);
        state.opDescriptions.push(`UPDATE ${table} WHERE id=${id}`);
        
        printSuccess(`Operation #${state.operations.length} added!`);
        print(`  ${sql}`, 'info');
        print('');
        print('Type "menu" to see options, or add more operations');
        
    } else if (operation === 'insert') {
        // Format: insert <table> <field=value>...
        if (parts.length < 3) {
            printError('Format: insert <table> <field=value> <field=value>...');
            return;
        }
        
        const table = parts[1];
        const fields = parts.slice(2);
        
        const columns = [];
        const values = [];
        
        for (const field of fields) {
            const [col, val] = field.split('=');
            if (!col || val === undefined) {
                printError(`Invalid format: ${field}`);
                return;
            }
            columns.push(col);
            if (/^\d+$/.test(val) || val.toUpperCase() === 'NOW()') {
                values.push(val);
            } else {
                values.push(`'${val}'`);
            }
        }
        
        const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')});`;
        state.operations.push(sql);
        state.opDescriptions.push(`INSERT INTO ${table}`);
        
        printSuccess(`Operation #${state.operations.length} added!`);
        print(`  ${sql}`, 'info');
        print('');
        print('Type "menu" to see options, or add more operations');
        
    } else if (operation === 'delete') {
        // Format: delete <table> <id>
        if (parts.length < 3) {
            printError('Format: delete <table> <id>');
            return;
        }
        
        const table = parts[1];
        const id = parts[2];
        
        const sql = `DELETE FROM ${table} WHERE id=${id};`;
        state.operations.push(sql);
        state.opDescriptions.push(`DELETE FROM ${table} WHERE id=${id}`);
        
        printSuccess(`Operation #${state.operations.length} added!`);
        print(`  ${sql}`, 'error');
        print('');
        print('Type "menu" to see options, or add more operations');
        
    } else if (operation === 'view') {
        // Format: view <table> <where>
        if (parts.length < 2) {
            printError('Format: view <table> <where_clause>');
            return;
        }
        
        const table = parts[1];
        const where = parts.slice(2).join(' ');
        const sql = where ? `SELECT * FROM ${table} WHERE ${where}` : `SELECT * FROM ${table}`;
        
        await runQueryAndPrint(sql);
        print('');
        print('Type "menu" to continue');
    } else if (operation === 'certpath') {
        // Format: certpath <path-to-cert>
        if (parts.length < 2) {
            printError('Format: certpath <path-to-certificate>');
            printInfo('Example: certpath certificates/CertExchangeAshishKaranwal.cer');
            return;
        }
        
        const certPath = parts.slice(1).join(' ');
        await handleCertPath(certPath);
        print('');
        print('Type "menu" to continue');
    }
}

// Execute operations - EXACT from main.sh lines 1695-1758
async function handleExecute() {
    printHeader('Executing Database Operations');
    
    printInfo('Building SQL script from queued operations...');
    
    try {
        const queries = state.operations;
        
        printInfo(`Executing SQL script with ${queries.length} operations...`);
        
        const response = await fetch('/api/transaction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ queries })
        });

        const result = await response.json();

        if (!result.success) {
            printError('Script execution failed!');
            print(result.error, 'error');
            printInfo('Transaction was ROLLED BACK automatically');
            return;
        }

        printSuccess(`All ${queries.length} operations executed successfully!`);
        
        // Show final state - EXACT from main.sh lines 1760-1783
        await showFinalState();
        
    } catch (error) {
        printError(`Execution failed: ${error.message}`);
    }
}

// Show final state - EXACT from main.sh lines 1760-1783
async function showFinalState() {
    printHeader('FINAL STATE - After Completion');
    
    printSection('EPak Status');
    const epakQuery = `SELECT id, status, progressPercent, modifiedOn FROM epak WHERE id = ${state.epakId}`;
    await runQueryAndPrint(epakQuery);
    
    if (state.signerId) {
        printSection('Signer Status');
        const signerQuery = `SELECT id, status, progressPercent, statusModifiedOn FROM epak_workflowstate_signer WHERE id = ${state.signerId}`;
        await runQueryAndPrint(signerQuery);
    }
    
    printHeader('SUCCESS!');
    printSuccess(`EPak #${state.epakId} has been completed successfully!`);
    print('');
    printInfo('Refresh page to fix another EPak');
    print('');
}

// Helper functions
async function runQuery(sql) {
    const response = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sql })
    });

    const result = await response.json();

    if (!result.success) {
        throw new Error(result.error);
    }

    return result.data;
}

async function runQueryAndPrint(sql) {
    try {
        const data = await runQuery(sql);
        if (data && data.length > 0) {
            printTable(data);
        } else {
            print('(0 rows)');
        }
    } catch (error) {
        printError(error.message);
    }
}

function clearTerminal() {
    terminal.innerHTML = '';
    printWelcome();
}

// ================================================================
// BATCH PROCESSING HANDLERS
// ================================================================

async function handleListBatches() {
    try {
        print('');
        printSection('📁 Batch Processing Status');
        print('');
        
        const response = await fetch('/api/batches');
        const data = await response.json();
        
        if (!data.success) {
            printError(data.error);
            return;
        }
        
        // Show pending batches (ready for fix sheet generation)
        if (data.pending && data.pending.length > 0) {
            print('🔄 Pending (Ready for Processing):', 'info bold');
            print('');
            data.pending.forEach(batch => {
                if (batch.ready) {
                    print(`  ✅ ${batch.name}`, 'success');
                    print(`     📄 CSV: ${batch.csvFile ? '✓' : '✗'}`);
                    print(`     📑 PDFs: ${batch.pdfCount} file(s)`);
                    print(`     ⚡ Action: process ${batch.name}`);
                    print('');
                } else {
                    print(`  ⚠️  ${batch.name}`, 'warning');
                    print(`     📄 CSV: ${batch.csvFile ? '✓' : '✗'}`);
                    print(`     📑 PDFs: ${batch.pdfCount} file(s)`);
                    print(`     Status: Missing required files`);
                    print('');
                }
            });
        } else {
            print('No pending batches found.', 'warning');
            print('');
        }
        
        // Show ready for execution (fix sheets generated)
        if (data.ready && data.ready.length > 0) {
            print('🎯 Ready for Execution:', 'info bold');
            print('');
            data.ready.forEach(batch => {
                if (batch.ready) {
                    print(`  ✅ ${batch.name}`, 'success');
                    print(`     📊 Fix Sheets: ${batch.fixSheets.length} file(s)`);
                    print(`     ⚡ Action: execute ${batch.name}`);
                    print('');
                } else {
                    print(`  ⚠️  ${batch.name}`, 'warning');
                    print(`     Status: No fix sheets available`);
                    print('');
                }
            });
        } else {
            print('No batches ready for execution.', 'warning');
            print('');
        }
        
        print('─────────────────────────────────────────────────────');
        print('Commands:');
        print('  • process <batch-name>  - Generate fix sheet');
        print('  • execute <batch-name>  - Execute operations');
        print('');
        
    } catch (error) {
        printError('Failed to list batches: ' + error.message);
    }
}

async function handleProcessBatch(batchName) {
    try {
        print('');
        printSection(`Processing Batch: ${batchName}`);
        print('');
        printInfo('Generating fix sheet...');
        
        const response = await fetch(`/api/batch/process/${batchName}`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (!data.success) {
            printError(data.error);
            return;
        }
        
        print('');
        printSuccess('Fix sheet generated successfully!');
        print('');
        print('Summary:', 'info bold');
        print(`  Total ePaks: ${data.result.totalEpaks}`);
        print(`  Processed: ${data.result.processed}`);
        print(`  Fix commands: ${data.result.fixCommands}`);
        if (data.result.errors > 0) {
            print(`  Errors: ${data.result.errors}`, 'warning');
        }
        print('');
        print(`📄 Fix Sheet: ${data.fixSheetPath}`);
        print(`📦 Original Batch Moved: ${data.originalBatchMoved}`);
        print('');
        
        if (data.result.errorMessages && data.result.errorMessages.length > 0) {
            print('Errors:', 'warning bold');
            data.result.errorMessages.forEach(msg => print(`  • ${msg}`, 'warning'));
            print('');
        }
        
        print('Next Steps:', 'info bold');
        print(`  1. Review the fix sheet at: ${data.fixSheetPath}`);
        print(`  2. Execute operations: execute ${batchName}`);
        print('');
        
    } catch (error) {
        printError('Failed to process batch: ' + error.message);
    }
}

async function handleExecuteBatch(batchName) {
    try {
        print('');
        printSection(`Executing Batch: ${batchName}`);
        print('');
        printInfo('Loading fix sheet...');
        
        const response = await fetch(`/api/batch/execute/${batchName}`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (!data.success) {
            printError(data.error);
            return;
        }
        
        print('');
        printSuccess('Fix sheet loaded successfully!');
        print('');
        print(`📄 Fix Sheet: ${data.fixSheetPath}`);
        print('');
        
        // Set current batch name for auto-move after execution
        state.currentBatchName = batchName;
        
        // Now load and execute the fix sheet using batch processing logic
        // We need to read the file and parse it as batch operations
        await loadAndExecuteFixSheet(data.fixSheetPath);
        
    } catch (error) {
        printError('Failed to execute batch: ' + error.message);
        state.currentBatchName = null; // Clear on error
    }
}

async function loadAndExecuteFixSheet(fixSheetPath) {
    try {
        printSection('Batch Processing Mode');
        print('');
        printInfo(`File: ${fixSheetPath.split('/').pop()}`);
        printInfo('Parsing file...');
        
        // Read the fix sheet from server
        const response = await fetch('/api/read-fix-sheet', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                filePath: fixSheetPath
            })
        });
        
        const data = await response.json();
        
        if (!data.success) {
            printError(data.error);
            state.currentBatchName = null;
            return;
        }
        
        printSuccess('Detected format: CSV/TSV');
        printSuccess(`Loaded ${data.operations.length} operation(s)`);
        print('');
        
        if (data.operations.length === 0) {
            printWarning('No valid operations found in file');
            state.currentBatchName = null;
            return;
        }
        
        // Group operations by ePak
        const epakOperations = {};
        data.operations.forEach(op => {
            if (!epakOperations[op.epakId]) {
                epakOperations[op.epakId] = [];
            }
            epakOperations[op.epakId].push(op);
        });
        
        // Ask if user wants to export SQL for CMR
        print('');
        printSection('Export SQL for CMR?');
        print('');
        print('Options:');
        print('1. Export SQL to file (for CMR/review)');
        print('2. Continue to execution');
        print('');
        const exportChoice = await promptUser('Choose [1-2]: ');
        
        if (exportChoice === '1') {
            await exportBatchSQL(epakOperations, state.currentBatchName || 'batch');
            state.currentBatchName = null;
            return;
        }
        
        // Process each ePak
        await processBatchEpaks(epakOperations);
        
    } catch (error) {
        printError('Failed to load fix sheet: ' + error.message);
        state.currentBatchName = null;
    }
}

async function exportBatchSQL(epakOperations, batchName) {
    try {
        // Build simple SQL content - just queries
        let sqlContent = '';
        sqlContent += `-- EPak Batch SQL Export: ${batchName}\n`;
        sqlContent += `-- Generated: ${new Date().toLocaleString()}\n`;
        sqlContent += `-- Total EPaks: ${Object.keys(epakOperations).length}\n`;
        sqlContent += `-- Total Operations: ${Object.values(epakOperations).flat().length}\n\n`;
        
        let epakCount = 0;
        for (const [epakId, operations] of Object.entries(epakOperations)) {
            epakCount++;
            sqlContent += `-- EPak ${epakCount}: ${epakId}\n\n`;
            
            operations.forEach((op) => {
                sqlContent += `${op.sql};\n`;
            });
            
            sqlContent += `\n`;
        }
        
        // Send to server to save
        const response = await fetch('/api/export-batch-sql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                batchName: batchName,
                sqlContent: sqlContent
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            printSuccess(`✅ SQL exported: ${data.filePath}`);
        } else {
            printError('Failed to export SQL: ' + data.error);
        }
        
    } catch (error) {
        printError('Failed to export SQL: ' + error.message);
    }
}

async function moveBatchToProcessed(batchName) {
    try {
        printInfo('Moving batch to processed...');
        
        const response = await fetch(`/api/batch/complete/${batchName}`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            print('');
            printSuccess('✅ Batch moved to processed folder');
            print(`📦 ${data.movedPath}`);
            print('');
        }
        
        // Clear the batch name
        state.currentBatchName = null;
        
    } catch (error) {
        printError('Failed to move batch: ' + error.message);
        state.currentBatchName = null;
    }
}

// Event listeners
executeBtn.addEventListener('click', () => {
    const cmd = commandInput.value;
    executeCommand(cmd);
    commandInput.value = '';
});

commandInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        // Skip if we're awaiting a prompt response
        if (state.awaitingPrompt) {
            return;
        }
        const cmd = commandInput.value;
        executeCommand(cmd);
        commandInput.value = '';
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (state.historyIndex > 0) {
            state.historyIndex--;
            commandInput.value = state.history[state.historyIndex];
        }
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (state.historyIndex < state.history.length - 1) {
            state.historyIndex++;
            commandInput.value = state.history[state.historyIndex];
        } else {
            state.historyIndex = state.history.length;
            commandInput.value = '';
        }
    }
});

clearBtn.addEventListener('click', clearTerminal);

// Batch processing
batchBtn.addEventListener('click', () => {
    if (!state.dbConfig) {
        printError('Please connect to database first');
        return;
    }
    fileInput.click();
});

// Certificate parsing
certBtn.addEventListener('click', () => {
    printInfo('Click to select a certificate file (.cer, .crt, .pem)');
    print('');
    certInput.click();
});

fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    printHeader('Batch Processing Mode');
    printInfo(`File: ${file.name}`);
    print('');
    
    try {
        printInfo('Parsing file...');
        
        // Upload file to server for parsing
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('/api/parse-file', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (!result.success) {
            printError(`Failed to parse file: ${result.error}`);
            return;
        }
        
        // Check if this is a fix sheet CSV
        if (result.isFixSheet) {
            printSuccess('Detected: ePak Fix Sheet CSV');
            print('');
            printSection('Fix Sheet Generation Results');
            print('');
            
            const summary = result.summary;
            printSuccess(`Total ePaks processed: ${summary.processed}/${summary.total}`);
            printSuccess(`Fix commands generated: ${summary.fixCommands}`);
            
            if (summary.errors && summary.errors.length > 0) {
                print('');
                printWarning(`Errors: ${summary.errors.length}`);
                summary.errors.forEach(err => {
                    printError(`  ePak ${err.epak_uuid}: ${err.error}`);
                });
            }
            
            print('');
            printInfo('Downloading generated fix sheet...');
            
            // Download the CSV file
            const blob = new Blob([result.output], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = result.filename || 'epak-fix-sheet.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            printSuccess('Fix sheet downloaded!');
            print('');
            printInfo(`File saved as: ${a.download}`);
            print('');
            printSection('Next Steps');
            print('');
            print('1. Open the downloaded CSV file');
            print('2. Review the generated SQL commands');
            print('3. Fill in any fields marked as "MANUAL"');
            print('4. Upload the completed CSV using "Batch Upload" to execute');
            print('');
            
            return;
        }
        
        // Otherwise, process as normal batch operations
        printSuccess(`Detected format: ${result.format}`);
        printSuccess(`Loaded ${result.count} operation(s)`);
        print('');
        
        if (result.count === 0) {
            printWarning('No valid operations found in file');
            return;
        }
        
        // Group operations by EPak ID
        const epakOperations = {};
        result.operations.forEach(op => {
            if (!epakOperations[op.epakId]) {
                epakOperations[op.epakId] = [];
            }
            epakOperations[op.epakId].push(op.sql);
        });
        
        // Process batch
        await processBatchEpaks(epakOperations);
        
    } catch (error) {
        printError(`Failed to process file: ${error.message}`);
    }
    
    // Reset file input
    fileInput.value = '';
});

// Certificate input change event
certInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    printHeader('Certificate Parser');
    printInfo(`File: ${file.name}`);
    print('');

    try {
        printInfo('Parsing certificate...');

        // Upload file to server for parsing
        const formData = new FormData();
        formData.append('certificate', file);

        const response = await fetch('/api/parse-certificate', {
            method: 'POST',
            body: formData
        });

        // Check if response is OK
        if (!response.ok) {
            const errorText = await response.text();
            printError(`Server error (${response.status}): ${errorText}`);
            return;
        }

        const result = await response.json();

        if (!result.success) {
            printError(`Failed to parse certificate: ${result.error}`);
            return;
        }

        printSuccess('Certificate parsed successfully!');
        if (result.extractedFromPDF) {
            printInfo('Certificate was extracted from signed PDF');
        }
        print('');
        
        // Parse JSON string and display Aadhaar details
        const aadhaarDetails = JSON.parse(result.aadhaarDetails);
        displayAadhaarDetails(aadhaarDetails);

    } catch (error) {
        printError(`Failed to parse certificate: ${error.message}`);
    }

    // Reset cert input
    certInput.value = '';
});

function handleBatchCommand() {
    if (!state.dbConfig) {
        printError('Please connect to database first');
        print('');
        printInfo('Batch processing requires active database connection');
        return;
    }
    
    printInfo('Click the "Batch CSV" button to upload a file');
    print('');
    print('Supported Formats:', 'bold');
    print('  • Excel files (.xlsx, .xls)');
    print('  • CSV/TSV files (.csv, .tsv, .txt)');
    print('');
    print('Excel Template Format:', 'bold');
    print('  Column A: ePakId');
    print('  Column B: Table');
    print('  Column C: Operation (UPDATE/INSERT/DELETE)');
    print('  Column D: Column & Values');
    print('  Column E: Where clause');
    print('  Column F: Status (optional)');
    print('  Column G: Last ran (optional)');
    print('');
    print('Example Excel row:');
    print('  ePakId: 3');
    print('  Table: epak');
    print('  Operation: UPDATE');
    print('  Column & Values: status=\'Completed\', progressPercent=100');
    print('  Where clause: id = 3');
    print('  Status: Pending');
    print('');
    print('CSV Format (pipe or tab delimited):');
    print('  ePakId|Table|Operation|Column & Values|Where clause');
    print('  3|epak|UPDATE|status=\'Completed\'|id = 3');
}

// processBatchCSV function removed - now using server-side file parsing via /api/parse-file

async function processBatchEpaks(epakOperations) {
    const totalEpaks = Object.keys(epakOperations).length;
    let processed = 0;
    let successful = 0;
    let skipped = 0;
    let failed = 0;
    
    for (const [epakId, operations] of Object.entries(epakOperations)) {
        processed++;
        
        printHeader(`Processing EPak ${processed}/${totalEpaks}`);
        print('');
        print(`EPak ID: ${epakId}`, 'bold');
        print('');
        
        // Show current state
        printSection('Current EPak State');
        try {
            // Check if epakId is a UUID (contains hyphens) or integer
            const isUUID = epakId.includes('-');
            let query;
            if (isUUID) {
                // Query by uuid column for UUID values
                query = `SELECT id, status, progressPercent, subject FROM epak WHERE uuid = '${epakId}'`;
            } else {
                // Query by id column for integer values
                query = `SELECT id, status, progressPercent, subject FROM epak WHERE id = ${epakId}`;
            }
            
            const currentState = await runQuery(query);
            if (currentState && currentState.length > 0) {
                printTable(currentState);
            } else {
                printWarning(`EPak ${epakId} not found!`);
            }
        } catch (error) {
            printError(`Failed to fetch EPak state: ${error.message}`);
        }
        
        // Show operations to execute
        print('');
        printSection('Operations to Execute');
        operations.forEach((op, index) => {
            // If op is an object with sql property, display the SQL
            const sqlText = typeof op === 'object' ? op.sql : op;
            print(`${index + 1}. ${sqlText}`, 'success');
        });
        
        print('');
        print('Options:', 'bold');
        print('  1. Execute these operations');
        print('  2. Skip this EPak');
        print('  3. Stop batch processing');
        print('');
        
        // For batch mode, auto-execute (you can add prompts if needed)
        const choice = await promptUser('Choose [1-3]: ');
        
        if (choice === '1') {
            // Execute operations
            print('');
            printInfo('Executing operations...');
            
            try {
                // Extract SQL strings from operation objects
                const queries = operations.map(op => {
                    return typeof op === 'object' ? op.sql : op;
                });
                
                const response = await fetch('/api/transaction', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ queries: queries })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    printSuccess(`EPak ${epakId} processed successfully!`);
                    successful++;
                    
                    // Show final state
                    print('');
                    printSection('Final State');
                    try {
                        const isUUID = epakId.includes('-');
                        let finalQuery;
                        if (isUUID) {
                            finalQuery = `SELECT id, status, progressPercent, subject FROM epak WHERE uuid = '${epakId}'`;
                        } else {
                            finalQuery = `SELECT id, status, progressPercent, subject FROM epak WHERE id = ${epakId}`;
                        }
                        const finalState = await runQuery(finalQuery);
                        if (finalState && finalState.length > 0) {
                            printTable(finalState);
                        }
                    } catch (stateError) {
                        printWarning('Could not fetch final state (EPak may have been updated successfully)');
                    }
                } else {
                    printError(`Failed to process EPak ${epakId}`);
                    print(result.error, 'error');
                    failed++;
                }
            } catch (error) {
                printError(`Failed to process EPak ${epakId}: ${error.message}`);
                failed++;
            }
        } else if (choice === '2') {
            printWarning(`Skipped EPak ${epakId}`);
            skipped++;
        } else if (choice === '3') {
            printWarning('Batch processing stopped by user');
            break;
        } else {
            printError('Invalid choice, skipping EPak');
            skipped++;
        }
        
        print('');
        await promptUser('Press Enter to continue to next EPak...');
    }
    
    // Summary (like main.sh lines 409-416)
    printHeader('Batch Processing Summary');
    print('');
    print(`Total EPaks:      ${totalEpaks}`);
    print(`Successful:       ${successful}`, 'success');
    print(`Skipped:          ${skipped}`, 'warning');
    print(`Failed:           ${failed}`, 'error');
    print('');
    
    // If this was from automated batch processing, move to processed
    if (state.currentBatchName) {
        await moveBatchToProcessed(state.currentBatchName);
    }
}

// Helper to prompt user in batch mode
function promptUser(message) {
    return new Promise((resolve) => {
        print(message, 'warning');
        state.awaitingPrompt = true; // Set flag to prevent command execution
        const handler = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                const value = commandInput.value.trim();
                commandInput.value = '';
                commandInput.removeEventListener('keydown', handler);
                state.awaitingPrompt = false; // Clear flag
                resolve(value || '1'); // Default to option 1
            }
        };
        commandInput.addEventListener('keydown', handler);
        commandInput.focus();
    });
}

// Certificate extraction handler
function handleCertCommand() {
    printInfo('Certificate Extraction');
    print('');
    print('Choose option:');
    print('  1. Upload certificate file (.cer, .crt, .pem)');
    print('  2. Use certificate from server path');
    print('');
    print('Type "cert upload" or "cert path <path>"');
    print('');
    print('Example: cert path certificates/CertExchangeAshishKaranwal.cer');
}

// Certificate file upload handler - REMOVED DUPLICATE (see line 1098)

// Display Aadhaar details in formatted output
function displayAadhaarDetails(details) {
    printSection('Aadhaar eSign Certificate Details');
    print('');
    
    // Create table-like output
    const data = [
        { field: 'Signer Name', value: details.signerName },
        { field: 'TPIN', value: details.tpin },
        { field: 'Gender', value: details.gender },
        { field: 'Year of Birth', value: details.yob },
        { field: 'State', value: details.state },
        { field: 'Pincode', value: details.pincode },
        { field: 'Serial Number', value: details.serialNumber },
        { field: 'End Date', value: new Date(details.endDate).toLocaleString() },
        { field: 'Issuer Name', value: details.issuerName },
        { field: 'Issuer Organisation', value: details.issuerOrganisation }
    ];
    
    // Calculate max width for alignment
    const maxFieldWidth = Math.max(...data.map(d => d.field.length));
    
    // Print formatted table
    print('+' + '-'.repeat(maxFieldWidth + 4) + '+' + '-'.repeat(50) + '+');
    print('| ' + 'Field'.padEnd(maxFieldWidth + 2) + '| ' + 'Value'.padEnd(48) + '|');
    print('+' + '-'.repeat(maxFieldWidth + 4) + '+' + '-'.repeat(50) + '+');
    
    data.forEach(row => {
        const field = row.field.padEnd(maxFieldWidth + 2);
        const value = (row.value || 'NA').toString().substring(0, 48).padEnd(48);
        print('| ' + field + '| ' + value + '|');
    });
    
    print('+' + '-'.repeat(maxFieldWidth + 4) + '+' + '-'.repeat(50) + '+');
    print('');
    
    // Print as JSON-encoded string
    printSection('JSON Output');
    print('');
    print(JSON.stringify({ aadhaarDetails: JSON.stringify(details) }, null, 2), 'info');
    print('');
}

// Handle cert path command
async function handleCertPath(certPath) {
    printHeader('Certificate Extraction');
    printInfo(`Certificate Path: ${certPath}`);
    print('');
    
    try {
        printInfo('Parsing certificate...');
        
        const response = await fetch('/api/parse-certificate-path', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ certPath })
        });
        
        const result = await response.json();
        
        if (!result.success) {
            printError(`Failed to parse certificate: ${result.error}`);
            return;
        }
        
        printSuccess('Certificate parsed successfully!');
        if (result.extractedFromPDF) {
            printInfo('Certificate was extracted from signed PDF');
        }
        print('');
        
        // Parse JSON string and display Aadhaar details
        const aadhaarDetails = JSON.parse(result.aadhaarDetails);
        displayAadhaarDetails(aadhaarDetails);
        
    } catch (error) {
        printError(`Failed to parse certificate: ${error.message}`);
    }
}

// Handle batch PDF processing from directory
async function handleBatchPdfProcessing(dirPath) {
    printHeader('Batch PDF Processing');
    printInfo(`Directory: ${dirPath}`);
    print('');
    
    printInfo('Processing all signed PDFs in directory...');
    printWarning('This may take a while depending on the number of files');
    print('');
    
    try {
        const response = await fetch('/api/batch-process-pdfs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                dirPath,
                recursive: true,
                format: 'csv',
                includeFailures: true
            })
        });
        
        const result = await response.json();
        
        if (!result.success) {
            printError(`Batch processing failed: ${result.error}`);
            return;
        }
        
        // Display summary
        printSection('Processing Summary');
        print('');
        print(`Total PDFs Found:   ${result.summary.totalFiles}`);
        print(`Successfully Parsed: ${result.summary.successCount}`, 'success');
        print(`Failed to Parse:     ${result.summary.failureCount}`, result.summary.failureCount > 0 ? 'error' : 'dim');
        print(`Processing Time:     ${result.summary.processingTimeFormatted}`);
        print('');
        
        // Check if all files failed
        if (result.summary.successCount === 0) {
            printError('All PDF files failed to process!');
            print('');
            printInfo('Common reasons for failure:');
            print('  - PDFs are not digitally signed');
            print('  - Signature format is not supported');
            print('  - PDF files are corrupted');
            print('');
            printInfo('Please check the error messages above and ensure your PDFs:');
            print('  1. Are digitally signed with valid certificates');
            print('  2. Use standard PKCS#7 signatures');
            print('  3. Are not corrupted or password-protected');
            print('');
            return; // Don't create CSV if all failed
        }
        
        // Display CSV preview (first 10 lines)
        printSection('CSV Output Preview (First 10 Lines)');
        print('');
        const csvLines = result.output.split('\n');
        const previewLines = csvLines.slice(0, 10);
        previewLines.forEach(line => {
            if (line.trim()) {
                print(line, 'dim');
            }
        });
        
        if (csvLines.length > 10) {
            print('');
            print(`... and ${csvLines.length - 10} more lines`, 'dim');
        }
        print('');
        
        // Download CSV
        printSection('Download CSV');
        print('');
        printInfo('Preparing CSV download...');
        
        // Create blob and download
        const blob = new Blob([result.output], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `aadhaar_certificates_${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        printSuccess('CSV file downloaded!');
        print('');
        printInfo(`File saved as: ${a.download}`);
        print('');
        
        printSection('CSV Columns');
        print('');
        print('File Name, File Path, Status, Signer Name, TPIN, Gender,');
        print('Year of Birth, State, Pincode, Serial Number, End Date,');
        print('Issuer Name, Issuer Organisation, Error');
        print('');
        
    } catch (error) {
        printError(`Failed to process PDFs: ${error.message}`);
    }
}

// Handle certificate parsing from menu option 8
async function handleParseCertificate() {
    print('');
    printSection('Certificate Parser');
    print('');
    print('You can parse certificate in two ways:', 'bold');
    print('');
    print('  1. Upload a certificate file or signed PDF');
    print('     Supports: .cer, .crt, .pem, .pdf');
    print('  2. Provide a path to certificate on the server');
    print('');
    print('To upload a file, click the "Certificate" button above');
    print('');
    print('To use a server path, type:', 'bold');
    print('  certpath <path-to-certificate>');
    print('');
    print('Example:', 'bold');
    print('  certpath certificates/CertExchangeAshishKaranwal.cer');
    print('');
    printInfo('Type "menu" to go back to operations menu');
    print('');
}

// Handle fix sheet generation command
function handleFixSheetCommand() {
    if (!state.dbConfig) {
        printError('Please connect to database first');
        print('');
        printInfo('Fix sheet generation requires active database connection');
        return;
    }
    
    print('');
    printSection('ePak Fix Sheet Generator');
    print('');
    printInfo('This feature generates SQL commands to fix corrupted ePaks.');
    print('');
    print('Input Format:', 'bold');
    print('  Upload a CSV file with the following columns:');
    print('  - epak_uuid:      ePak ID');
    print('  - doc_uuid:       Document ID  ');
    print('  - signed_pdf_path: Path to signed PDF file');
    print('');
    print('Example CSV:', 'bold');
    print('  epak_uuid,doc_uuid,signed_pdf_path');
    print('  3,6,/path/to/signed.pdf');
    print('  4,7,/path/to/another.pdf');
    print('');
    print('Output:', 'bold');
    print('  CSV file with SQL commands to:');
    print('  - Update ePak status to Completed');
    print('  - Update signer statuses');
    print('  - Delete reminder activities');
    print('  - Insert completion activities with Aadhaar data');
    print('');
    printInfo('Click the "Batch Upload" button to upload your CSV file');
    print('  (The system will automatically detect it\'s a fix sheet)');
    print('');
}

async function handleFixSheetPath(csvPath) {
    if (!state.dbConfig) {
        printError('Please connect to database first');
        return;
    }
    
    print('');
    printSection('Processing Fix Sheet');
    print('');
    printInfo(`Reading CSV from: ${csvPath}`);
    print('');
    printWarning('⏱️  Processing may take 1-2 minutes per ePak...');
    print('');
    print('Working on:', 'bold');
    print('  🔍 Querying database for current state');
    print('  📄 Extracting Aadhaar data from PDFs');
    print('  👤 Fetching user details');
    print('  💻 Getting device information');
    print('  🔧 Generating SQL fix commands');
    print('');
    printInfo('Please wait, this may take a moment...');
    print('');
    
    try {
        const response = await fetch('/api/generate-fix-sheet', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                csvPath: csvPath
            })
        });
        
        const result = await response.json();
        
        if (!result.success) {
            printError(result.error || 'Failed to generate fix sheet');
            return;
        }
        
        print('');
        print('✅ Fix sheet generated successfully!', 'success');
        print('');
        printSection('Summary');
        print('');
        print(`  📊 Total ePaks: ${result.summary.total}`);
        print(`  ✅ Processed: ${result.summary.processed}`);
        print(`  🔧 Fix commands generated: ${result.summary.fixCommands}`);
        print(`  ❌ Errors: ${result.summary.errors.length}`);
        print('');
        
        if (result.savedPath) {
            printSuccess(`📁 Saved to: ${result.savedPath}`);
            print('');
        }
        
        if (result.summary.errors.length > 0) {
            print('Errors:', 'error');
            result.summary.errors.forEach(err => {
                print(`  ePak ${err.epak_uuid}: ${err.error}`, 'error');
            });
            print('');
        }
        
        // Download the CSV if content exists
        if (result.output) {
            const blob = new Blob([result.output], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = result.filename || 'epak-fix-sheet.csv';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            printSuccess('📥 Downloaded: ' + (result.filename || 'epak-fix-sheet.csv'));
            print('');
        }
        
    } catch (error) {
        printError('Error processing fix sheet: ' + error.message);
        console.error(error);
    }
}
