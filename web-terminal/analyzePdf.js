#!/usr/bin/env node

/**
 * PDF Signature Analyzer
 * Finds ALL signature dictionaries in a PDF file
 */

const fs = require('fs');
const path = require('path');

if (process.argv.length < 3) {
    console.log('Usage: node analyzePdf.js <pdf-file>');
    process.exit(1);
}

const pdfPath = process.argv[2];

if (!fs.existsSync(pdfPath)) {
    console.error(`File not found: ${pdfPath}`);
    process.exit(1);
}

console.log(`\n${'='.repeat(70)}`);
console.log(`PDF SIGNATURE ANALYZER`);
console.log(`${'='.repeat(70)}`);
console.log(`File: ${path.basename(pdfPath)}`);
console.log(`Size: ${fs.statSync(pdfPath).size} bytes`);
console.log(`${'='.repeat(70)}\n`);

const pdfBuffer = fs.readFileSync(pdfPath);
const pdfString = pdfBuffer.toString('latin1');

// Search for different signature patterns
const patterns = [
    {
        name: 'Standard /Contents hex',
        regex: /\/Contents\s*<([0-9A-Fa-f]+)>/g,
        extract: (match) => match[1]
    },
    {
        name: 'Indirect /Contents reference',
        regex: /\/Contents\s+(\d+)\s+(\d+)\s+R/g,
        extract: (match) => `${match[1]} ${match[2]} R`
    },
    {
        name: '/ByteRange with /Contents',
        regex: /\/ByteRange\s*\[([^\]]+)\][\s\S]{0,500}\/Contents\s*<([0-9A-Fa-f]+)>/g,
        extract: (match) => match[2]
    },
    {
        name: '/Sig dictionary',
        regex: /\/Type\s*\/Sig[\s\S]{0,1000}\/Contents\s*<([0-9A-Fa-f]+)>/g,
        extract: (match) => match[1]
    },
    {
        name: 'PKCS#7 detached',
        regex: /\/SubFilter\s*\/adbe\.pkcs7\.detached[\s\S]{0,1000}\/Contents\s*<([0-9A-Fa-f]+)>/g,
        extract: (match) => match[1]
    },
    {
        name: 'PKCS#7 SHA1',
        regex: /\/SubFilter\s*\/adbe\.pkcs7\.sha1[\s\S]{0,1000}\/Contents\s*<([0-9A-Fa-f]+)>/g,
        extract: (match) => match[1]
    },
    {
        name: 'Aadhaar eSign',
        regex: /\/SubFilter\s*\/ETSI\.CAdES\.detached[\s\S]{0,1000}\/Contents\s*<([0-9A-Fa-f]+)>/g,
        extract: (match) => match[1]
    }
];

let totalSignatures = 0;
const foundSignatures = [];

for (const pattern of patterns) {
    const matches = [...pdfString.matchAll(pattern.regex)];
    
    if (matches.length > 0) {
        console.log(`\n📝 Found ${matches.length} signature(s) matching: ${pattern.name}`);
        
        matches.forEach((match, index) => {
            const sigData = pattern.extract(match);
            const sigSize = typeof sigData === 'string' && sigData.match(/^[0-9A-Fa-f]+$/) 
                ? sigData.length / 2 
                : 'N/A';
            
            console.log(`   [${index + 1}] Size: ${sigSize} bytes, Position: ${match.index}`);
            
            foundSignatures.push({
                pattern: pattern.name,
                data: sigData,
                size: sigSize,
                position: match.index
            });
            
            totalSignatures++;
        });
    }
}

console.log(`\n${'='.repeat(70)}`);
console.log(`TOTAL SIGNATURES FOUND: ${totalSignatures}`);
console.log(`${'='.repeat(70)}\n`);

if (totalSignatures === 0) {
    console.log('⚠️  No signatures found! Searching for raw PKCS#7 structures...\n');
    
    // Search for PKCS#7 magic bytes (30 82 or 30 83 at start of potential signature)
    const pkcs7Pattern = /3082|3083/gi;
    const pkcs7Matches = [...pdfString.matchAll(pkcs7Pattern)];
    
    console.log(`Found ${pkcs7Matches.length} potential PKCS#7 patterns in PDF`);
    console.log('(Note: Many may be false positives)\n');
}

// Look for /Sig dictionaries
console.log('Searching for /Sig dictionaries...\n');
const sigDictPattern = /\/Type\s*\/Sig/g;
const sigDictMatches = [...pdfString.matchAll(sigDictPattern)];
console.log(`Found ${sigDictMatches.length} /Sig dictionary references`);

sigDictMatches.forEach((match, index) => {
    const contextStart = Math.max(0, match.index - 100);
    const contextEnd = Math.min(pdfString.length, match.index + 500);
    const context = pdfString.substring(contextStart, contextEnd);
    
    console.log(`\n--- /Sig Dictionary ${index + 1} ---`);
    console.log(`Position: ${match.index}`);
    console.log(`Context (showing 100 chars before and 500 after):`);
    console.log(context.substring(0, 300).replace(/[\x00-\x1F\x7F-\x9F]/g, '.'));
    console.log('...\n');
});

console.log(`${'='.repeat(70)}`);
console.log(`ANALYSIS COMPLETE`);
console.log(`${'='.repeat(70)}\n`);

// Export found signatures for testing
if (foundSignatures.length > 0) {
    console.log('Unique signature patterns found:');
    const uniquePatterns = [...new Set(foundSignatures.map(s => s.pattern))];
    uniquePatterns.forEach(p => console.log(`  - ${p}`));
}




