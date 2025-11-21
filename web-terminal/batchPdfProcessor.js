const fs = require('fs');
const path = require('path');
const PDFCertificateExtractor = require('./pdfCertificateExtractor');
const CertificateParser = require('./certificateParser');

/**
 * Batch process multiple PDF files to extract Aadhaar signature data
 */
class BatchPdfProcessor {
    
    /**
     * Find all PDF files in a directory (recursive)
     * @param {string} dirPath - Directory path to search
     * @param {boolean} recursive - Whether to search recursively
     * @returns {Array<string>} Array of PDF file paths
     */
    static findPDFFiles(dirPath, recursive = true) {
        const pdfFiles = [];
        
        try {
            if (!fs.existsSync(dirPath)) {
                throw new Error(`Directory not found: ${dirPath}`);
            }
            
            const stat = fs.statSync(dirPath);
            if (!stat.isDirectory()) {
                throw new Error(`Path is not a directory: ${dirPath}`);
            }
            
            const items = fs.readdirSync(dirPath);
            
            for (const item of items) {
                const fullPath = path.join(dirPath, item);
                const itemStat = fs.statSync(fullPath);
                
                if (itemStat.isDirectory() && recursive) {
                    // Recursively search subdirectories
                    const subPdfs = this.findPDFFiles(fullPath, recursive);
                    pdfFiles.push(...subPdfs);
                } else if (itemStat.isFile() && item.toLowerCase().endsWith('.pdf')) {
                    pdfFiles.push(fullPath);
                }
            }
            
            return pdfFiles;
        } catch (error) {
            throw new Error(`Failed to find PDF files: ${error.message}`);
        }
    }
    
    /**
     * Process a single PDF file
     * @param {string} pdfPath - Path to PDF file
     * @returns {Promise<Object>} Processing result
     */
    static async processSinglePDF(pdfPath) {
        const result = {
            filePath: pdfPath,
            fileName: path.basename(pdfPath),
            success: false,
            aadhaarDetails: null,
            error: null
        };
        
        try {
            // Read PDF file
            const pdfBuffer = fs.readFileSync(pdfPath);
            
            // Check if it's a PDF
            if (!PDFCertificateExtractor.isPDF(pdfBuffer)) {
                throw new Error('File is not a valid PDF');
            }
            
            // Extract certificate from PDF
            let certBuffer;
            try {
                certBuffer = await PDFCertificateExtractor.extractCertificateFromPDF(pdfBuffer);
            } catch (extractError) {
                throw new Error(`Failed to extract certificate: ${extractError.message}`);
            }
            
            // DEBUG: Save extracted certificate to file for inspection
            const debugCertPath = path.join(__dirname, `debug_cert_${path.basename(pdfPath)}.cer`);
            try {
                fs.writeFileSync(debugCertPath, certBuffer);
                console.log(`  📝 DEBUG: Saved extracted certificate to: ${debugCertPath}`);
            } catch (saveError) {
                console.log(`  ⚠️  Could not save debug certificate: ${saveError.message}`);
            }
            
            // Parse certificate for Aadhaar details
            try {
                console.log(`  Certificate buffer size: ${certBuffer.length} bytes`);
                console.log('  Attempting to parse Aadhaar details...');
                const aadhaarDetails = CertificateParser.parseCertificateFromBuffer(certBuffer);
                console.log('  ✓ Aadhaar details parsed successfully!');
                result.aadhaarDetails = aadhaarDetails;
                result.success = true;
            } catch (parseError) {
                console.log(`  ✗ Aadhaar parsing failed: ${parseError.message}`);
                throw new Error(`Failed to parse certificate: ${parseError.message}`);
            }
            
        } catch (error) {
            result.error = error.message;
        }
        
        return result;
    }
    
    /**
     * Process multiple PDF files from a directory
     * @param {string} dirPath - Directory path containing PDFs
     * @param {boolean} recursive - Search subdirectories
     * @param {Function} progressCallback - Called for each processed file
     * @returns {Promise<Object>} Processing results
     */
    static async processPDFDirectory(dirPath, recursive = true, progressCallback = null) {
        const startTime = Date.now();
        
        // Find all PDF files
        console.log(`Searching for PDFs in: ${dirPath}`);
        const pdfFiles = this.findPDFFiles(dirPath, recursive);
        console.log(`Found ${pdfFiles.length} PDF files`);
        
        const results = {
            totalFiles: pdfFiles.length,
            successCount: 0,
            failureCount: 0,
            processingTime: 0,
            files: []
        };
        
        // Process each PDF
        for (let i = 0; i < pdfFiles.length; i++) {
            const pdfPath = pdfFiles[i];
            
            console.log(`Processing ${i + 1}/${pdfFiles.length}: ${path.basename(pdfPath)}`);
            
            const result = await this.processSinglePDF(pdfPath);
            results.files.push(result);
            
            if (result.success) {
                results.successCount++;
            } else {
                results.failureCount++;
            }
            
            // Call progress callback if provided
            if (progressCallback) {
                progressCallback({
                    current: i + 1,
                    total: pdfFiles.length,
                    fileName: result.fileName,
                    success: result.success,
                    error: result.error
                });
            }
        }
        
        results.processingTime = Date.now() - startTime;
        
        return results;
    }
    
    /**
     * Convert processing results to CSV format
     * @param {Object} results - Processing results from processPDFDirectory
     * @param {boolean} includeFailures - Include failed files in CSV
     * @returns {string} CSV string
     */
    static resultsToCSV(results, includeFailures = false) {
        // CSV headers
        const headers = [
            'File Name',
            'File Path',
            'Status',
            'Signer Name',
            'TPIN',
            'Gender',
            'Year of Birth',
            'State',
            'Pincode',
            'Serial Number',
            'End Date',
            'Issuer Name',
            'Issuer Organisation',
            'Error'
        ];
        
        const rows = [headers];
        
        // Add data rows
        for (const file of results.files) {
            if (!file.success && !includeFailures) {
                continue; // Skip failures if not requested
            }
            
            const row = [
                this.escapeCSV(file.fileName),
                this.escapeCSV(file.filePath),
                file.success ? 'Success' : 'Failed'
            ];
            
            if (file.success && file.aadhaarDetails) {
                const details = file.aadhaarDetails;
                row.push(
                    this.escapeCSV(details.signerName || ''),
                    this.escapeCSV(details.tpin || ''),
                    this.escapeCSV(details.gender || ''),
                    this.escapeCSV(details.yob || ''),
                    this.escapeCSV(details.state || ''),
                    this.escapeCSV(details.pincode || ''),
                    this.escapeCSV(details.serialNumber || ''),
                    details.endDate ? new Date(details.endDate).toISOString() : '',
                    this.escapeCSV(details.issuerName || ''),
                    this.escapeCSV(details.issuerOrganisation || ''),
                    ''
                );
            } else {
                // Empty cells for failed processing
                row.push('', '', '', '', '', '', '', '', '', '', this.escapeCSV(file.error || 'Unknown error'));
            }
            
            rows.push(row);
        }
        
        // Convert to CSV string
        return rows.map(row => row.join(',')).join('\n');
    }
    
    /**
     * Convert processing results to JSON format
     * @param {Object} results - Processing results from processPDFDirectory
     * @param {boolean} includeFailures - Include failed files in JSON
     * @returns {Object} JSON object
     */
    static resultsToJSON(results, includeFailures = false) {
        const output = {
            summary: {
                totalFiles: results.totalFiles,
                successCount: results.successCount,
                failureCount: results.failureCount,
                processingTime: results.processingTime,
                processingTimeFormatted: this.formatTime(results.processingTime)
            },
            files: []
        };
        
        for (const file of results.files) {
            if (!file.success && !includeFailures) {
                continue;
            }
            
            const fileData = {
                fileName: file.fileName,
                filePath: file.filePath,
                status: file.success ? 'success' : 'failed'
            };
            
            if (file.success && file.aadhaarDetails) {
                fileData.aadhaarDetails = file.aadhaarDetails;
            } else {
                fileData.error = file.error;
            }
            
            output.files.push(fileData);
        }
        
        return output;
    }
    
    /**
     * Escape CSV field (handle commas, quotes, newlines)
     * @param {string} field - Field value
     * @returns {string} Escaped field
     */
    static escapeCSV(field) {
        if (field == null) return '';
        
        const str = String(field);
        
        // If contains comma, quote, or newline, wrap in quotes and escape quotes
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        
        return str;
    }
    
    /**
     * Format milliseconds to human-readable time
     * @param {number} ms - Milliseconds
     * @returns {string} Formatted time
     */
    static formatTime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }
}

module.exports = BatchPdfProcessor;

