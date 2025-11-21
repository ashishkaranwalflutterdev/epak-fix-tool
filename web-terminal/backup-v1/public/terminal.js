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
    historyIndex: -1
};

// DOM elements
const terminal = document.getElementById('terminal');
const commandInput = document.getElementById('command-input');
const executeBtn = document.getElementById('execute-btn');
const clearBtn = document.getElementById('clear-btn');
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

// Main command executor
async function executeCommand(cmd) {
    if (!cmd.trim()) return;

    printPrompt(cmd);
    state.history.push(cmd);
    state.historyIndex = state.history.length;

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

            case 'connected':
                // Check if command is a number (EPak ID)
                if (!isNaN(command) && command.trim() !== '') {
                    await handleEpakInput(command);
                } else {
                    printInfo('Enter EPak ID');
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
                } else if (command === 'reset') {
                    clearSavedCredentials();
                    print('');
                    printInfo('Please refresh the page to reconnect');
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
    print('4. reset');
    print('   Clear saved credentials');
    print('');
    print('5. clear');
    print('   Clear terminal screen');
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
    print('');
    print('Enter choice [1-7]:');
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
        default:
            printError('Invalid choice');
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

// Event listeners
executeBtn.addEventListener('click', () => {
    const cmd = commandInput.value;
    executeCommand(cmd);
    commandInput.value = '';
});

commandInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
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
