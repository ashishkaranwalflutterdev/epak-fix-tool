#!/usr/bin/env node

const EpakFixSheetGenerator = require('./epakFixSheetGenerator');
const DbConnection = require('./dbConnection');
const path = require('path');

/**
 * CLI tool for generating ePak fix sheets
 */

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length < 1) {
        console.log('\n╔════════════════════════════════════════════════════════════════╗');
        console.log('║        ePak Fix Sheet Generator - CLI                         ║');
        console.log('╚════════════════════════════════════════════════════════════════╝\n');
        console.log('Usage:');
        console.log('  node cli-epak-fix-generator.js <input-csv> [output-csv]\n');
        console.log('Arguments:');
        console.log('  input-csv   Path to CSV file with ePak list');
        console.log('              Format: epak_uuid,doc_uuid,signed_pdf_path\n');
        console.log('  output-csv  Path to output CSV (optional)');
        console.log('              Default: epak-fix-sheet-[timestamp].csv\n');
        console.log('Example:');
        console.log('  node cli-epak-fix-generator.js epak-list.csv');
        console.log('  node cli-epak-fix-generator.js epak-list.csv fix-commands.csv\n');
        process.exit(1);
    }
    
    const inputCsv = args[0];
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outputCsv = args[1] || `epak-fix-sheet-${timestamp}.csv`;
    
    try {
        // Initialize database connection
        console.log('🔌 Connecting to database...');
        const db = new DbConnection();
        await db.connect();
        console.log('✅ Database connected\n');
        
        // Create generator
        const generator = new EpakFixSheetGenerator(db);
        
        // Generate fix sheet
        const result = await generator.generateFixSheet(inputCsv, outputCsv);
        
        // Show summary
        console.log('\n' + '='.repeat(70));
        console.log('📊 SUMMARY');
        console.log('='.repeat(70));
        console.log(`Total ePaks:      ${result.total}`);
        console.log(`Processed:        ${result.processed}`);
        console.log(`Fix commands:     ${result.fixCommands}`);
        console.log(`Errors:           ${result.errors.length}`);
        
        if (result.errors.length > 0) {
            console.log('\n❌ Errors:');
            result.errors.forEach(err => {
                console.log(`   - ePak ${err.epak_uuid}: ${err.error}`);
            });
        }
        
        console.log(`\n✅ Output saved to: ${outputCsv}\n`);
        
        // Close database connection
        await db.close();
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

main();



