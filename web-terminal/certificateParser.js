const forge = require('node-forge');
const fs = require('fs');

/**
 * Extracts Aadhaar eSign details from X.509 certificate
 * Equivalent to Java ReadAadhaarCertDetails.java
 */
class CertificateParser {
    
    static NA = 'NA';
    
    /**
     * Parse certificate file and extract Aadhaar details
     * @param {string} certPath - Path to certificate file (.cer, .pem, .crt)
     * @returns {Object} Aadhaar sign details
     */
    static parseCertificate(certPath) {
        try {
            // Read certificate file
            const certData = fs.readFileSync(certPath, 'utf8');
            
            // Parse certificate
            let cert;
            if (certData.includes('BEGIN CERTIFICATE')) {
                // PEM format
                cert = forge.pki.certificateFromPem(certData);
            } else {
                // DER format - convert to PEM first
                const derBuffer = fs.readFileSync(certPath);
                const derString = forge.util.binary.raw.encode(new Uint8Array(derBuffer));
                cert = forge.pki.certificateFromAsn1(forge.asn1.fromDer(derString));
            }
            
            return this.extractAadhaarSignDetails(cert);
            
        } catch (error) {
            throw new Error(`Failed to parse certificate: ${error.message}`);
        }
    }
    
    /**
     * Parse certificate from buffer and extract Aadhaar details
     * @param {Buffer} certBuffer - Certificate buffer data
     * @returns {Object} Aadhaar sign details
     */
    static parseCertificateFromBuffer(certBuffer) {
        try {
            // Try to parse as PEM first (text format)
            const certText = certBuffer.toString('utf8');
            
            let cert;
            if (certText.includes('BEGIN CERTIFICATE')) {
                // PEM format
                try {
                    cert = forge.pki.certificateFromPem(certText);
                } catch (pemError) {
                    // If PEM parsing fails due to non-RSA key, try ASN.1 parsing directly
                    const derString = forge.util.binary.raw.encode(new Uint8Array(certBuffer));
                    return this.extractFromAsn1(forge.asn1.fromDer(derString));
                }
            } else {
                // DER format - binary data
                const derString = forge.util.binary.raw.encode(new Uint8Array(certBuffer));
                try {
                    const asn1 = forge.asn1.fromDer(derString);
                    console.log(`    ASN.1 parsed, type: ${asn1.type}, tagClass: ${asn1.tagClass}, value length: ${asn1.value ? asn1.value.length : 'N/A'}`);
                    
                    // Check the structure
                    if (asn1.value && Array.isArray(asn1.value)) {
                        console.log(`    ASN.1 has ${asn1.value.length} top-level elements`);
                        for (let i = 0; i < Math.min(asn1.value.length, 5); i++) {
                            const elem = asn1.value[i];
                            console.log(`      Element ${i}: type=${elem.type}, tagClass=${elem.tagClass}`);
                        }
                    }
                    
                    cert = forge.pki.certificateFromAsn1(asn1);
                } catch (asn1Error) {
                    console.log(`    Standard certificate parsing failed: ${asn1Error.message}`);
                    console.log('    Trying ASN.1 fallback extraction...');
                    
                    // If standard parsing fails (e.g., non-RSA key or X509v3 error), extract directly from ASN.1
                    if (asn1Error.message && (asn1Error.message.includes('OID is not RSA') || asn1Error.message.includes('X509v3 Certificate'))) {
                        const asn1Obj = forge.asn1.fromDer(derString);
                        return this.extractFromAsn1(asn1Obj);
                    }
                    throw asn1Error;
                }
            }
            
            return this.extractAadhaarSignDetails(cert);
            
        } catch (error) {
            throw new Error(`Failed to parse certificate from buffer: ${error.message}`);
        }
    }
    
    /**
     * Extract details directly from ASN.1 structure (for non-RSA certificates)
     * @param {Object} asn1Cert - ASN.1 certificate structure
     * @returns {Object} Aadhaar details
     */
    static extractFromAsn1(asn1Cert) {
        try {
            // Certificate structure: SEQUENCE { tbsCertificate, signatureAlgorithm, signature }
            // We need tbsCertificate -> subject and issuer
            const tbsCertificate = asn1Cert.value[0];
            
            // Find subject and issuer in tbsCertificate
            // Subject is typically at index 5, issuer at index 3
            let subjectAsn1 = null;
            let issuerAsn1 = null;
            let validity = null;
            let serialNumber = null;
            
            // Parse tbsCertificate fields
            for (let i = 0; i < tbsCertificate.value.length; i++) {
                const field = tbsCertificate.value[i];
                
                // Serial number (INTEGER)
                if (field.type === forge.asn1.Type.INTEGER && !serialNumber) {
                    serialNumber = forge.util.bytesToHex(field.value);
                }
                
                // Validity (SEQUENCE with two times)
                if (field.type === forge.asn1.Type.SEQUENCE && field.value.length === 2 && !validity) {
                    try {
                        const notAfter = forge.asn1.utcTimeToDate(field.value[1].value);
                        validity = notAfter;
                    } catch (e) {
                        // Might be GeneralizedTime instead
                        try {
                            const notAfter = forge.asn1.generalizedTimeToDate(field.value[1].value);
                            validity = notAfter;
                        } catch (e2) {
                            // Skip if can't parse
                        }
                    }
                }
                
                // Subject and Issuer are both SEQUENCE of SETs
                if (field.type === forge.asn1.Type.SEQUENCE) {
                    if (field.value.length > 0 && field.value[0].type === forge.asn1.Type.SET) {
                        if (!issuerAsn1) {
                            issuerAsn1 = field;
                        } else if (!subjectAsn1) {
                            subjectAsn1 = field;
                        }
                    }
                }
            }
            
            // Extract attributes from subject and issuer
            console.log('    [extractFromAsn1] Extracting subject attributes...');
            const subjectAttrs = this.extractAsn1Attributes(subjectAsn1);
            console.log('    [extractFromAsn1] Subject attributes found:', Object.keys(subjectAttrs));
            console.log('    [extractFromAsn1] Subject values:', JSON.stringify(subjectAttrs, null, 2));
            
            console.log('    [extractFromAsn1] Extracting issuer attributes...');
            const issuerAttrs = this.extractAsn1Attributes(issuerAsn1);
            console.log('    [extractFromAsn1] Issuer attributes found:', Object.keys(issuerAttrs));
            
            // Build Aadhaar details
            const details = {
                serialNumber: serialNumber || this.NA,
                endDate: validity ? validity.getTime() : 0,
                signerName: subjectAttrs['2.5.4.3'] || subjectAttrs['CN'] || this.NA,
                tpin: subjectAttrs['2.5.4.12'] || subjectAttrs['T'] || this.NA,
                state: subjectAttrs['2.5.4.8'] || subjectAttrs['ST'] || this.NA,
                gender: this.NA,
                yob: this.NA,
                pincode: this.NA,
                issuerName: issuerAttrs['2.5.4.3'] || issuerAttrs['CN'] || this.NA,
                issuerOrganisation: issuerAttrs['2.5.4.10'] || issuerAttrs['O'] || this.NA
            };
            
            console.log('    [extractFromAsn1] Basic details extracted:', JSON.stringify(details, null, 2));
            
            // Extract gender and YOB from dnQualifier
            const dnQualifier = subjectAttrs['2.5.4.46'] || subjectAttrs['dnQualifier'];
            console.log('    [extractFromAsn1] dnQualifier (OID 2.5.4.46):', dnQualifier ? `"${dnQualifier}"` : 'NOT FOUND');
            if (dnQualifier) {
                details.gender = this.getGenderInfo(dnQualifier);
                details.yob = this.getBirthYear(dnQualifier);
                console.log('      Extracted gender:', details.gender);
                console.log('      Extracted YOB:', details.yob);
            } else {
                console.log('    [extractFromAsn1] ⚠️  dnQualifier NOT FOUND - cannot extract gender/YOB!');
            }
            
            // Extract pincode
            const postalCode = subjectAttrs['2.5.4.17'] || subjectAttrs['postalCode'];
            console.log('    [extractFromAsn1] postalCode (OID 2.5.4.17):', postalCode ? `"${postalCode}"` : 'NOT FOUND');
            if (postalCode) {
                details.pincode = this.getPinCode(postalCode);
                console.log('      Extracted pincode:', details.pincode);
            } else {
                console.log('    [extractFromAsn1] ⚠️  postalCode NOT FOUND!');
            }
            
            console.log('    [extractFromAsn1] Final extracted details:', JSON.stringify(details, null, 2));
            
            return details;
            
        } catch (error) {
            throw new Error(`Failed to extract from ASN.1: ${error.message}`);
        }
    }
    
    /**
     * Extract attributes from ASN.1 name structure
     * @param {Object} nameAsn1 - ASN.1 name structure
     * @returns {Object} Map of OID to value
     */
    static extractAsn1Attributes(nameAsn1) {
        const attributes = {};
        
        if (!nameAsn1 || !nameAsn1.value) return attributes;
        
        // Name is SEQUENCE of SETs of SEQUENCES (RDN)
        for (const rdn of nameAsn1.value) {
            if (rdn.type === forge.asn1.Type.SET && rdn.value.length > 0) {
                const attrSeq = rdn.value[0];
                if (attrSeq.type === forge.asn1.Type.SEQUENCE && attrSeq.value.length >= 2) {
                    // First element is OID, second is value
                    const oid = forge.asn1.derToOid(attrSeq.value[0].value);
                    let value = '';
                    
                    // Value can be UTF8String, PrintableString, etc.
                    const valueAsn1 = attrSeq.value[1];
                    if (valueAsn1.value) {
                        if (typeof valueAsn1.value === 'string') {
                            value = valueAsn1.value;
                        } else {
                            // Convert bytes to string
                            value = forge.util.decodeUtf8(valueAsn1.value);
                        }
                    }
                    
                    attributes[oid] = value;
                    
                    // Also store by common name if known
                    const nameMap = {
                        '2.5.4.3': 'CN',
                        '2.5.4.6': 'C',
                        '2.5.4.7': 'L',
                        '2.5.4.8': 'ST',
                        '2.5.4.10': 'O',
                        '2.5.4.11': 'OU',
                        '2.5.4.12': 'T',
                        '2.5.4.17': 'postalCode',
                        '2.5.4.46': 'dnQualifier'
                    };
                    
                    if (nameMap[oid]) {
                        attributes[nameMap[oid]] = value;
                    }
                }
            }
        }
        
        return attributes;
    }
    
    /**
     * Extract Aadhaar sign details from certificate
     * @param {Object} cert - Forge certificate object
     * @returns {Object} Aadhaar details
     */
    static extractAadhaarSignDetails(cert) {
        const details = {
            serialNumber: cert.serialNumber,
            endDate: cert.validity.notAfter.getTime(),
            signerName: this.NA,
            tpin: this.NA,
            state: this.NA,
            gender: this.NA,
            yob: this.NA,
            pincode: this.NA,
            issuerName: this.NA,
            issuerOrganisation: this.NA
        };
        
        // Extract subject attributes
        const subjectAttrs = this.getAttributes(cert.subject);
        details.signerName = subjectAttrs['CN'] || this.NA;
        details.tpin = subjectAttrs['T'] || this.NA;
        details.state = subjectAttrs['ST'] || this.NA;
        
        // DN Qualifier holds gender + birth year info (e.g. 1999Mxxxxx)
        const dnQualifier = subjectAttrs['dnQualifier'] || subjectAttrs['2.5.4.46'];
        details.gender = this.getGenderInfo(dnQualifier);
        details.yob = this.getBirthYear(dnQualifier);
        
        // Extract postal code
        const postalCode = subjectAttrs['postalCode'] || subjectAttrs['2.5.4.17'];
        details.pincode = this.getPinCode(postalCode);
        
        // Extract issuer details
        const issuerAttrs = this.getAttributes(cert.issuer);
        details.issuerName = issuerAttrs['CN'] || this.NA;
        details.issuerOrganisation = issuerAttrs['O'] || this.NA;
        
        return details;
    }
    
    /**
     * Get certificate attributes from subject or issuer
     * @param {Object} attributesObj - Forge attributes object
     * @returns {Object} Map of attribute OID/name to value
     */
    static getAttributes(attributesObj) {
        const attributes = {};
        
        if (attributesObj && attributesObj.attributes) {
            attributesObj.attributes.forEach(attr => {
                // Store by shortName (like CN, ST, O)
                if (attr.shortName) {
                    attributes[attr.shortName] = attr.value;
                }
                // Also store by OID (like 2.5.4.46 for dnQualifier)
                if (attr.type) {
                    attributes[attr.type] = attr.value;
                }
                // Store common names
                if (attr.name) {
                    attributes[attr.name] = attr.value;
                }
            });
        }
        
        return attributes;
    }
    
    /**
     * Extract and validate pincode
     * @param {string} postalCode - Postal code from certificate
     * @returns {string} Validated pincode or NA
     */
    static getPinCode(postalCode) {
        let pinCode = this.NA;
        try {
            if (postalCode && parseInt(postalCode) > 0) {
                pinCode = postalCode;
            }
        } catch (e) {
            // ignore
        }
        return pinCode;
    }
    
    /**
     * Extract birth year from DN Qualifier
     * Format: 1999Mxxxxx (first 4 chars are year)
     * @param {string} dnQualifier - DN Qualifier value
     * @returns {string} Birth year or NA
     */
    static getBirthYear(dnQualifier) {
        let yob = this.NA;
        if (dnQualifier && dnQualifier.length >= 4) {
            try {
                const sub = dnQualifier.substring(0, 4);
                const year = parseInt(sub);
                if (year > 1900) {
                    yob = sub;
                }
            } catch (e) {
                // ignore
            }
        }
        return yob;
    }
    
    /**
     * Extract gender from DN Qualifier
     * Format: 1999Mxxxxx (5th char is gender: M/F/T)
     * @param {string} dnQualifier - DN Qualifier value
     * @returns {string} Gender (M/F/T) or NA
     */
    static getGenderInfo(dnQualifier) {
        let genderStr = this.NA;
        if (dnQualifier && dnQualifier.length >= 5) {
            const gender = dnQualifier.charAt(4);
            if ('MmFfTt'.indexOf(gender) >= 0) {
                genderStr = gender.toUpperCase();
            }
        }
        return genderStr;
    }
}

module.exports = CertificateParser;

