const forge = require('node-forge');

/**
 * Extracts certificates from signed PDF files
 */
class PDFCertificateExtractor {
    
    /**
     * Extract certificate from signed PDF buffer
     * @param {Buffer} pdfBuffer - PDF file buffer
     * @returns {Promise<Buffer>} Certificate buffer (DER format)
     */
    static async extractCertificateFromPDF(pdfBuffer) {
        try {
            // Convert buffer to string for parsing
            const pdfString = pdfBuffer.toString('latin1');
            
            // Find ALL signature dictionaries in PDF
            const sigRegex = /\/Contents\s*<([0-9A-Fa-f]+)>/g;
            const matches = [...pdfString.matchAll(sigRegex)];
            
            if (matches.length === 0) {
                throw new Error('No signature found in PDF. The PDF may not be digitally signed.');
            }
            
            console.log(`\n📝 Found ${matches.length} signature(s) in PDF, searching all for Aadhaar certificate...`);
            
            // Try EACH signature to find one with Aadhaar data
            const CertificateParser = require('./certificateParser');
            
            for (let sigIndex = 0; sigIndex < matches.length; sigIndex++) {
                console.log(`\n=== Signature ${sigIndex + 1}/${matches.length} ===`);
                const signatureHex = matches[sigIndex][1];
                console.log(`  Hex length: ${signatureHex.length} chars (${signatureHex.length / 2} bytes)`);
                
                // Convert hex string to binary
                const signatureBinary = this.hexToBytes(signatureHex);
                
                try {
                    // Parse PKCS#7 signature to extract certificate
                    const certificate = this.extractCertificateFromPKCS7(signatureBinary);
                    
                    // Test if this certificate has Aadhaar data
                    console.log(`  Testing certificate for Aadhaar data...`);
                    try {
                        const details = CertificateParser.parseCertificateFromBuffer(certificate);
                        console.log(`    Signer: ${details.signerName}`);
                        console.log(`    TPIN: ${details.tpin}`);
                        console.log(`    State: ${details.state}`);
                        console.log(`    Gender: ${details.gender}`);
                        console.log(`    YOB: ${details.yob}`);
                        console.log(`    Pincode: ${details.pincode}`);
                        console.log(`    Issuer: ${details.issuerName}`);
                        
                        // Check if this has Aadhaar data
                        const hasAadhaarData = details.tpin !== 'NA' || 
                                              details.gender !== 'NA' || 
                                              details.yob !== 'NA' || 
                                              details.pincode !== 'NA';
                        
                        if (hasAadhaarData) {
                            console.log(`  ✓✓✓ FOUND AADHAAR CERTIFICATE IN SIGNATURE ${sigIndex + 1}! ✓✓✓\n`);
                            return certificate;
                        } else {
                            console.log(`  ✗ No Aadhaar data (likely corporate cert)\n`);
                        }
                    } catch (parseError) {
                        console.log(`  ✗ Parse error: ${parseError.message}\n`);
                    }
                } catch (extractError) {
                    console.log(`  ✗ Extraction error: ${extractError.message}\n`);
                }
            }
            
            // If no signature has Aadhaar data, return the first one
            console.log(`⚠️  No signature contains Aadhaar certificate, returning first signature\n`);
            const signatureBinary = this.hexToBytes(matches[0][1]);
            return this.extractCertificateFromPKCS7(signatureBinary);
            
        } catch (error) {
            throw new Error(`Failed to extract certificate from PDF: ${error.message}`);
        }
    }
    
    /**
     * Extract certificate from PKCS#7 signature data
     * @param {string} pkcs7Binary - PKCS#7 signature data
     * @returns {Buffer} Certificate buffer
     */
    static extractCertificateFromPKCS7(pkcs7Binary) {
        try {
            // Try standard PKCS#7 parsing first
            try {
                const p7Asn1 = forge.asn1.fromDer(pkcs7Binary);
                const p7 = forge.pkcs7.messageFromAsn1(p7Asn1);
                
                // Extract certificates from PKCS#7
                if (p7.certificates && p7.certificates.length > 0) {
                    // Get the first certificate (signer certificate)
                    const cert = p7.certificates[0];
                    
                    // Convert certificate to DER format
                    const certAsn1 = forge.pki.certificateToAsn1(cert);
                    const certDer = forge.asn1.toDer(certAsn1);
                    
                    // Return as Buffer
                    return Buffer.from(certDer.getBytes(), 'binary');
                }
            } catch (pkcs7Error) {
                // If standard parsing fails, try to extract certificate directly from ASN.1
                console.log('Standard PKCS#7 parsing failed, trying direct ASN.1 extraction...');
                return this.extractCertificateFromASN1(pkcs7Binary);
            }
            
            throw new Error('No certificates found in signature');
            
        } catch (error) {
            throw new Error(`Failed to extract certificate from PKCS#7: ${error.message}`);
        }
    }
    
    /**
     * Extract certificate directly from ASN.1 structure
     * @param {string} asn1Binary - ASN.1 binary data
     * @returns {Buffer} Certificate buffer
     */
    static extractCertificateFromASN1(asn1Binary) {
        try {
            // Try to parse the ASN.1, catching any "unparsed bytes" errors
            let asn1;
            try {
                asn1 = forge.asn1.fromDer(asn1Binary);
            } catch (parseError) {
                // If the error is about unparsed bytes, we can still use what was parsed
                if (parseError.message && parseError.message.includes('Unparsed DER bytes')) {
                    // The error object might contain the parsed ASN.1 in bytesRead
                    // We'll try to manually truncate and re-parse
                    console.log('ASN.1 has extra bytes, attempting manual extraction...');
                    
                    // Try a different approach: look for certificate pattern in the binary data
                    // Certificates in PKCS#7 start with SEQUENCE tag (0x30)
                    // We'll scan for certificate boundaries manually
                    return this.extractCertificateByPattern(asn1Binary);
                }
                throw parseError;
            }
            
            // PKCS#7 SignedData structure:
            // SEQUENCE {
            //   contentType (OID)
            //   content [0] {
            //     version
            //     digestAlgorithms
            //     contentInfo
            //     certificates [0] IMPLICIT  <-- We want this
            //     ...
            //   }
            // }
            
            // Navigate through the structure to find certificates
            if (asn1.value && Array.isArray(asn1.value)) {
                // Look for the content field (usually at index 1)
                for (let i = 0; i < asn1.value.length; i++) {
                    const field = asn1.value[i];
                    
                    if (field.tagClass === 0 && field.type === 16) { // SEQUENCE
                        // Look for certificates field (tag 0, implicit)
                        if (field.value && Array.isArray(field.value)) {
                            for (const subField of field.value) {
                                // Certificates field is usually tagged with 0
                                if (subField.tagClass === 2 && subField.type === 0) {
                                    // Found certificates field
                                    if (subField.value && Array.isArray(subField.value) && subField.value.length > 0) {
                                        // Get first certificate
                                        const certAsn1 = subField.value[0];
                                        
                                        // Convert to DER
                                        const certDer = forge.asn1.toDer(certAsn1);
                                        return Buffer.from(certDer.getBytes(), 'binary');
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            throw new Error('Could not find certificate in ASN.1 structure');
            
        } catch (error) {
            throw new Error(`Failed to extract certificate from ASN.1: ${error.message}`);
        }
    }
    
    /**
     * Extract certificate by scanning for DER patterns in binary data
     * This is a fallback when standard ASN.1 parsing fails due to extra bytes
     * @param {string} pkcs7Binary - PKCS#7 binary data
     * @returns {Buffer} Certificate buffer
     */
    static extractCertificateByPattern(pkcs7Binary) {
        try {
            console.log(`Pattern extraction: analyzing ${pkcs7Binary.length} bytes`);
            
            const bytes = [];
            for (let i = 0; i < pkcs7Binary.length; i++) {
                bytes.push(pkcs7Binary.charCodeAt(i));
            }
            
            // STRATEGY 0: Direct scan for certificate patterns (handles BER indefinite length)
            // This is more robust for signatures that use indefinite length encoding (0x80)
            console.log('Strategy 0: Direct scan for certificate patterns (30 82/83)...');
            const foundCerts = this.scanForCertificates(bytes);
            
            if (foundCerts.length > 0) {
                console.log(`Found ${foundCerts.length} potential certificates via direct scan`);
                
                // Test each certificate for Aadhaar data
                const CertificateParser = require('./certificateParser');
                
                for (let i = 0; i < foundCerts.length; i++) {
                    const cert = foundCerts[i];
                    console.log(`\n  Testing Certificate ${i + 1}/${foundCerts.length} (${cert.size} bytes at offset ${cert.offset})...`);
                    
                    try {
                        const details = CertificateParser.parseCertificateFromBuffer(cert.buffer);
                        console.log(`    Signer: ${details.signerName}`);
                        console.log(`    TPIN: ${details.tpin}`);
                        console.log(`    Issuer: ${details.issuerName}`);
                        
                        const hasAadhaarData = details.tpin !== 'NA' || 
                                              details.gender !== 'NA' || 
                                              details.yob !== 'NA' || 
                                              details.pincode !== 'NA';
                        
                        if (hasAadhaarData) {
                            console.log(`    ✓✓✓ FOUND AADHAAR CERTIFICATE! ✓✓✓`);
                            return cert.buffer;
                        } else {
                            console.log(`    ✗ No Aadhaar data`);
                        }
                    } catch (parseError) {
                        console.log(`    ✗ Parse error: ${parseError.message}`);
                    }
                }
                
                // If no Aadhaar cert found, return the first valid one
                console.log(`\n  ⚠️  No Aadhaar certificate found, returning first certificate`);
                return foundCerts[0].buffer;
            }
            
            // STRATEGY 1: Look for 0xA0 tag followed by certificate SEQUENCE
            console.log('Strategy 1: Searching for A0 tag (certificates section)...');
            for (let i = 0; i < bytes.length - 4; i++) {
                if (bytes[i] === 0xA0) {
                    console.log(`Found A0 tag at position ${i}`);
                    
                    // Parse the A0 tag's length to find where certificates content starts
                    let pos = i + 1; // Position of first length byte
                    let certSectionLength = bytes[pos];
                    let contentStart;
                    
                    // Handle length encoding for A0 tag
                    if (certSectionLength === 0x80) {
                        // Indefinite length encoding (BER) - ends with 0x00 0x00
                        console.log(`  Indefinite length encoding detected (BER format)`);
                        contentStart = pos + 1;
                        // We can't determine the end, so we'll scan for certificates within
                        certSectionLength = bytes.length - contentStart; // Scan to end
                    } else if (certSectionLength & 0x80) {
                        // Long form length
                        const numLengthBytes = certSectionLength & 0x7F;
                        certSectionLength = 0;
                        for (let j = 0; j < numLengthBytes; j++) {
                            certSectionLength = (certSectionLength << 8) | bytes[pos + 1 + j];
                        }
                        contentStart = pos + 1 + numLengthBytes; // Skip tag, length indicator, and length bytes
                    } else {
                        // Short form length
                        contentStart = pos + 1; // Skip tag and single length byte
                    }
                    
                    console.log(`  Certificates section length: ${certSectionLength}`);
                    console.log(`  Certificates content starts at position: ${contentStart}`);
                    
                    // The certificates content might contain multiple certificates
                    // We need to find the FIRST SEQUENCE inside that is actually a certificate
                    console.log(`  Searching for first certificate SEQUENCE within certificates section...`);
                    
                    // Scan through the certificates content to find individual certificates
                    let scanPos = contentStart;
                    const sectionEnd = contentStart + certSectionLength;
                    
                    while (scanPos < sectionEnd && scanPos < bytes.length) {
                        // Look for SEQUENCE tag (0x30)
                        if (bytes[scanPos] === 0x30) {
                            console.log(`  Found SEQUENCE at position ${scanPos}`);
                            
                            // Parse this SEQUENCE's length
                            let seqLength = bytes[scanPos + 1];
                            let seqLengthBytes;
                            
                            if (seqLength & 0x80) {
                                const numLengthBytes = seqLength & 0x7F;
                                seqLength = 0;
                                for (let j = 0; j < numLengthBytes; j++) {
                                    seqLength = (seqLength << 8) | bytes[scanPos + 2 + j];
                                }
                                seqLengthBytes = 2 + numLengthBytes;
                            } else {
                                seqLengthBytes = 2;
                            }
                            
                            console.log(`    SEQUENCE length: ${seqLength} bytes (total ${seqLength + seqLengthBytes} with tag+length)`);
                            
                            // Extract this SEQUENCE
                            const seqBytes = bytes.slice(scanPos, scanPos + seqLengthBytes + seqLength);
                            const seqBinary = String.fromCharCode.apply(null, seqBytes);
                            
                            // Try to parse as certificate
                            try {
                                const testAsn1 = forge.asn1.fromDer(seqBinary);
                                
                                // A certificate should have exactly 3 top-level elements:
                                // 1. TBSCertificate (SEQUENCE)
                                // 2. SignatureAlgorithm (SEQUENCE)
                                // 3. SignatureValue (BIT STRING)
                                if (testAsn1.value && Array.isArray(testAsn1.value) && testAsn1.value.length === 3) {
                                    console.log(`    ✓ Valid X.509 certificate found with 3 elements!`);
                                    console.log(`      Element 0 (TBS): type=${testAsn1.value[0].type}`);
                                    console.log(`      Element 1 (SigAlg): type=${testAsn1.value[1].type}`);
                                    console.log(`      Element 2 (Sig): type=${testAsn1.value[2].type}`);
                                    return Buffer.from(seqBinary, 'binary');
                                } else if (testAsn1.value && Array.isArray(testAsn1.value) && testAsn1.value.length > 3) {
                                    // This might be a SEQUENCE containing multiple certificates
                                    // Look for nested SEQUENCEs that are actual certificates
                                    console.log(`    🔍 Found SEQUENCE with ${testAsn1.value.length} elements - searching for nested certificates...`);
                                    
                                    // Debug: show what each element is
                                    for (let k = 0; k < testAsn1.value.length; k++) {
                                        const elem = testAsn1.value[k];
                                        const elemInfo = `type=${elem.type}, tagClass=${elem.tagClass}, hasValue=${!!elem.value}, valueIsArray=${Array.isArray(elem.value)}`;
                                        if (Array.isArray(elem.value)) {
                                            console.log(`      Element ${k}: ${elemInfo}, valueLength=${elem.value.length}`);
                                        } else {
                                            console.log(`      Element ${k}: ${elemInfo}`);
                                        }
                                    }
                                    
                                    // Look for SEQUENCE with 3 elements (actual certificate)
                                    for (let k = 0; k < testAsn1.value.length; k++) {
                                        const elem = testAsn1.value[k];
                                        if (elem.type === forge.asn1.Type.SEQUENCE && elem.value && Array.isArray(elem.value) && elem.value.length === 3) {
                                            console.log(`      ✓ Found nested certificate at element ${k}!`);
                                            // Convert this nested certificate to DER
                                            const nestedCertDer = forge.asn1.toDer(elem);
                                            return Buffer.from(nestedCertDer.getBytes(), 'binary');
                                        }
                                    }
                                    
                                    // Also try scanning the raw bytes within this structure for 30 82 pattern (certificate SEQUENCE)
                                    console.log(`      Trying raw byte scan within this structure...`);
                                    const structStart = scanPos;
                                    const structEnd = scanPos + seqLengthBytes + seqLength;
                                    
                                    const foundCerts = [];
                                    
                                    for (let rawPos = structStart; rawPos < structEnd - 100; rawPos++) {
                                        if (bytes[rawPos] === 0x30 && (bytes[rawPos + 1] === 0x82 || bytes[rawPos + 1] === 0x83)) {
                                            console.log(`        Found 30 82/83 pattern at offset ${rawPos - structStart}`);
                                            
                                            // Parse length
                                            const numLengthBytes = bytes[rawPos + 1] & 0x7F;
                                            let certLen = 0;
                                            for (let j = 0; j < numLengthBytes; j++) {
                                                certLen = (certLen << 8) | bytes[rawPos + 2 + j];
                                            }
                                            const certLenBytes = 2 + numLengthBytes;
                                            
                                            console.log(`          Certificate length: ${certLen} bytes (total ${certLen + certLenBytes})`);
                                            
                                            // Extract and test (no size restriction!)
                                            if (certLen > 100 && certLen < 10000 && rawPos + certLenBytes + certLen <= bytes.length) {
                                                const rawCertBytes = bytes.slice(rawPos, rawPos + certLenBytes + certLen);
                                                const rawCertBinary = String.fromCharCode.apply(null, rawCertBytes);
                                                
                                                try {
                                                    const rawCertAsn1 = forge.asn1.fromDer(rawCertBinary);
                                                    if (rawCertAsn1.value && Array.isArray(rawCertAsn1.value) && rawCertAsn1.value.length === 3) {
                                                        console.log(`          ✓ Valid certificate structure!`);
                                                        foundCerts.push({
                                                            buffer: Buffer.from(rawCertBinary, 'binary'),
                                                            size: certLen + certLenBytes,
                                                            offset: rawPos - structStart
                                                        });
                                                    } else {
                                                        console.log(`          ✗ Invalid structure (${rawCertAsn1.value ? rawCertAsn1.value.length : 0} elements)`);
                                                    }
                                                } catch (e) {
                                                    console.log(`          ✗ Parse error: ${e.message}`);
                                                }
                                            } else {
                                                console.log(`          ✗ Size out of range or incomplete`);
                                            }
                                        }
                                    }
                                    
                                    // Test ALL certificates to find the one with Aadhaar data
                                    if (foundCerts.length > 0) {
                                        console.log(`      Found ${foundCerts.length} valid certificates, testing each for Aadhaar data...`);
                                        
                                        const CertificateParser = require('./certificateParser');
                                        
                                        for (let i = 0; i < foundCerts.length; i++) {
                                            const cert = foundCerts[i];
                                            console.log(`\n      === Testing Certificate ${i + 1}/${foundCerts.length} ===`);
                                            console.log(`        Size: ${cert.size} bytes, Offset: ${cert.offset}`);
                                            
                                            try {
                                                const details = CertificateParser.parseCertificateFromBuffer(cert.buffer);
                                                console.log(`        Signer Name: ${details.signerName}`);
                                                console.log(`        TPIN: ${details.tpin}`);
                                                console.log(`        State: ${details.state}`);
                                                console.log(`        Gender: ${details.gender}`);
                                                console.log(`        YOB: ${details.yob}`);
                                                console.log(`        Pincode: ${details.pincode}`);
                                                console.log(`        Issuer: ${details.issuerName}`);
                                                
                                                // Check if this has actual Aadhaar data (not all NA)
                                                const hasAadhaarData = details.tpin !== 'NA' || 
                                                                      details.gender !== 'NA' || 
                                                                      details.yob !== 'NA' || 
                                                                      details.pincode !== 'NA';
                                                
                                                if (hasAadhaarData) {
                                                    console.log(`        ✓✓✓ THIS IS THE AADHAAR CERTIFICATE! ✓✓✓`);
                                                    return cert.buffer;
                                                } else {
                                                    console.log(`        ✗ No Aadhaar data (likely CA cert)`);
                                                }
                                            } catch (parseError) {
                                                console.log(`        ✗ Parse error: ${parseError.message}`);
                                            }
                                        }
                                        
                                        // If no cert has Aadhaar data, return the largest one
                                        console.log(`\n      ⚠️  No certificate has Aadhaar data, returning largest`);
                                        foundCerts.sort((a, b) => b.size - a.size);
                                        return foundCerts[0].buffer;
                                    }
                                    
                                    console.log(`    ✗ No valid nested certificates found`);
                                } else {
                                    console.log(`    ✗ Not a certificate: has ${testAsn1.value ? testAsn1.value.length : 0} elements (need 3)`);
                                }
                            } catch (testError) {
                                console.log(`    ✗ Parse failed: ${testError.message}`);
                            }
                            
                            // Move to next SEQUENCE
                            scanPos += seqLengthBytes + seqLength;
                        } else {
                            scanPos++;
                        }
                    }
                    
                    console.log(`  ✗ No valid certificate found in certificates section`);
                }
            }
            
            // STRATEGY 2: Look for certificate SEQUENCE pattern directly (30 82 or 30 83)
            console.log('Strategy 2: Searching for certificate SEQUENCE pattern (30 82/83)...');
            for (let i = 0; i < bytes.length - 100; i++) {
                // Look for SEQUENCE with long-form length (typical for certificates)
                if (bytes[i] === 0x30 && (bytes[i + 1] === 0x82 || bytes[i + 1] === 0x83)) {
                    console.log(`Found potential certificate at position ${i}`);
                    
                    // Parse length
                    const numLengthBytes = bytes[i + 1] & 0x7F;
                    let certLength = 0;
                    for (let j = 0; j < numLengthBytes; j++) {
                        certLength = (certLength << 8) | bytes[i + 2 + j];
                    }
                    
                    const lengthOffset = 2 + numLengthBytes;
                    console.log(`  Certificate length: ${certLength} bytes`);
                    
                    // Sanity check: certificate should be between 500 and 5000 bytes typically
                    if (certLength < 400 || certLength > 10000) {
                        console.log(`  ✗ Length out of range, skipping`);
                        continue;
                    }
                    
                    // Check if we have enough bytes
                    if (i + lengthOffset + certLength > bytes.length) {
                        console.log(`  ✗ Not enough bytes remaining, skipping`);
                        continue;
                    }
                    
                    // Extract certificate
                    const certBytes = bytes.slice(i, i + lengthOffset + certLength);
                    const certBinary = String.fromCharCode.apply(null, certBytes);
                    
                    console.log(`  Extracted ${certBytes.length} bytes, attempting to parse...`);
                    
                    // Try to parse as certificate
                    try {
                        const testAsn1 = forge.asn1.fromDer(certBinary);
                        // Verify it has certificate structure (3 main sequences)
                        if (testAsn1.value && Array.isArray(testAsn1.value) && testAsn1.value.length >= 3) {
                            console.log('  ✓ Valid certificate structure found!');
                            return Buffer.from(certBinary, 'binary');
                        } else {
                            console.log('  ✗ Not a valid certificate structure');
                        }
                    } catch (testError) {
                        console.log(`  ✗ Parse failed: ${testError.message}`);
                    }
                }
            }
            
            console.log('✗ No valid certificate found with any strategy');
            throw new Error('Could not find valid certificate in PKCS#7 data using any extraction strategy');
            
        } catch (error) {
            throw new Error(`Pattern-based extraction failed: ${error.message}`);
        }
    }
    
    /**
     * Scan byte array for valid X.509 certificates
     * @param {Array<number>} bytes - Byte array to scan
     * @returns {Array<{buffer: Buffer, size: number, offset: number}>} Found certificates
     */
    static scanForCertificates(bytes) {
        const foundCerts = [];
        
        // Look for SEQUENCE tag with long-form length encoding (30 82 or 30 83)
        // This is the typical pattern for X.509 certificates
        for (let i = 0; i < bytes.length - 100; i++) {
            if (bytes[i] === 0x30 && (bytes[i + 1] === 0x82 || bytes[i + 1] === 0x83)) {
                // Parse the length
                const numLengthBytes = bytes[i + 1] & 0x7F;
                let certLen = 0;
                for (let j = 0; j < numLengthBytes; j++) {
                    certLen = (certLen << 8) | bytes[i + 2 + j];
                }
                const headerSize = 2 + numLengthBytes;
                
                // Sanity check: certificate should be between 500 and 10000 bytes
                if (certLen >= 500 && certLen <= 10000 && i + headerSize + certLen <= bytes.length) {
                    // Extract the certificate
                    const certBytes = bytes.slice(i, i + headerSize + certLen);
                    const certBinary = String.fromCharCode.apply(null, certBytes);
                    
                    try {
                        // Try to parse as ASN.1
                        const asn1 = forge.asn1.fromDer(certBinary);
                        
                        // Valid X.509 certificate must have exactly 3 top-level elements:
                        // 1. TBSCertificate (SEQUENCE)
                        // 2. SignatureAlgorithm (SEQUENCE)
                        // 3. SignatureValue (BIT STRING)
                        if (asn1.value && Array.isArray(asn1.value) && asn1.value.length === 3) {
                            foundCerts.push({
                                buffer: Buffer.from(certBinary, 'binary'),
                                size: headerSize + certLen,
                                offset: i
                            });
                        }
                    } catch (e) {
                        // Not a valid certificate, continue scanning
                    }
                }
            }
        }
        
        return foundCerts;
    }
    
    /**
     * Convert hex string to binary string
     * @param {string} hex - Hex string
     * @returns {string} Binary string
     */
    static hexToBytes(hex) {
        let bytes = '';
        for (let i = 0; i < hex.length; i += 2) {
            bytes += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
        }
        return bytes;
    }
    
    /**
     * Check if buffer is a PDF file
     * @param {Buffer} buffer - File buffer
     * @returns {boolean} True if PDF
     */
    static isPDF(buffer) {
        // PDF files start with %PDF-
        return buffer.toString('utf8', 0, 5) === '%PDF-';
    }
}

module.exports = PDFCertificateExtractor;




