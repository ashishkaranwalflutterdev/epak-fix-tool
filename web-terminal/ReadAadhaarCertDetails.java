package aadhaar;

import java.io.File;
import java.io.FileInputStream;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.HashMap;
import java.util.Map;
import org.apache.commons.lang3.StringUtils;
import org.bouncycastle.asn1.ASN1ObjectIdentifier;
import org.bouncycastle.asn1.x500.RDN;
import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.asn1.x500.style.BCStyle;
import org.bouncycastle.asn1.x500.style.IETFUtils;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Reads an Aadhaar eSign certificate from classpath and prints AadhaarSignDetails as JSON.
 */
public class ReadAadhaarCertDetails {
  
  private static final String NA = "NA";
  
  public static void main(String[] args) {
    try {
      
      File certFile = new File("1513469_patel.cer");
      FileInputStream fis = new FileInputStream(certFile);
      
      CertificateFactory cf = CertificateFactory.getInstance("X.509");
      X509Certificate cert = (X509Certificate) cf.generateCertificate(fis); 
      
      AadhaarSignDetails details = extractAadhaarSignDetails(cert);
      
      // Print as JSON
      ObjectMapper mapper = new ObjectMapper();
      Map<String, Object> jsonOutput = new HashMap<>();
      jsonOutput.put("aadhaarDetails", details);
      String jsonString = mapper.writerWithDefaultPrettyPrinter().writeValueAsString(jsonOutput);
      System.out.println(jsonString);
      
    } catch (Exception e) {
      e.printStackTrace();
    }
  }
  
  private static AadhaarSignDetails extractAadhaarSignDetails(X509Certificate cert)
      throws Exception {
    AadhaarSignDetails details = new AadhaarSignDetails();
    
    details.setSerialNumber(cert.getSerialNumber().toString());
    details.setEndDate(cert.getNotAfter().getTime());
    
    Map<ASN1ObjectIdentifier, String> subjectAttrs =
        getAttributes(cert.getSubjectX500Principal().getName());
    details.setSignerName(subjectAttrs.getOrDefault(BCStyle.CN, NA));
    details.setTpin(subjectAttrs.getOrDefault(BCStyle.T, NA));
    details.setState(subjectAttrs.getOrDefault(BCStyle.ST, NA));
    
    // DN Qualifier holds gender + birth year info (e.g. 1999Mxxxxx)
    String dnQualifier = subjectAttrs.get(BCStyle.DN_QUALIFIER);
    details.setGender(getGenderInfo(dnQualifier));
    details.setYob(getBirthYear(dnQualifier));
    
    // Extract postal code
    String postalCode = subjectAttrs.get(BCStyle.POSTAL_CODE);
    details.setPincode(getPinCode(postalCode));
    
    // Extract issuer details
    Map<ASN1ObjectIdentifier, String> issuerAttrs =
        getAttributes(cert.getIssuerX500Principal().getName());
    details.setIssuerName(issuerAttrs.getOrDefault(BCStyle.CN, NA));
    details.setIssuerOrganisation(issuerAttrs.getOrDefault(BCStyle.O, NA));
    
    return details;
  }
  
  private static Map<ASN1ObjectIdentifier, String> getAttributes(String dn) {
    Map<ASN1ObjectIdentifier, String> attributes = new HashMap<>();
    X500Name x500Name = new X500Name(dn);
    for (RDN rdn : x500Name.getRDNs()) {
      ASN1ObjectIdentifier type = rdn.getFirst().getType();
      String value = IETFUtils.valueToString(rdn.getFirst().getValue());
      attributes.put(type, value);
    }
    return attributes;
  }
  
  private static String getPinCode(String postalCode) {
    String pinCode = NA;
    try {
      if (postalCode != null && Integer.parseInt(postalCode) > 0) {
        pinCode = postalCode;
      }
    } catch (NumberFormatException e) {
      // ignore
    }
    return pinCode;
  }
  
  private static String getBirthYear(String dnQualifier) {
    String yob = NA;
    if (StringUtils.isNotBlank(dnQualifier)) {
      try {
        String sub = dnQualifier.substring(0, 4);
        if (Integer.parseInt(sub) > 1900) {
          yob = sub;
        }
      } catch (Exception ignored) {
      }
    }
    return yob;
  }
  
  private static String getGenderInfo(String dnQualifier) {
    String genderStr = NA;
    if (StringUtils.isNotBlank(dnQualifier) && dnQualifier.length() >= 5) {
      char gender = dnQualifier.charAt(4);
      if ("MmFfTt".indexOf(gender) >= 0) {
        genderStr = String.valueOf(Character.toUpperCase(gender));
      }
    }
    return genderStr;
  }
  
  // Simple POJO
  public static class AadhaarSignDetails {
    private String signerName;
    private String pincode;
    private String state;
    private String yob;
    private String gender;
    private String serialNumber;
    private String issuerName;
    private String issuerOrganisation;
    private long endDate;
    private String tpin;
    
    public String getSignerName() {
      return signerName;
    }
    
    public void setSignerName(String signerName) {
      this.signerName = signerName;
    }
    
    public String getPincode() {
      return pincode;
    }
    
    public void setPincode(String pincode) {
      this.pincode = pincode;
    }
    
    public String getState() {
      return state;
    }
    
    public void setState(String state) {
      this.state = state;
    }
    
    public String getYob() {
      return yob;
    }
    
    public void setYob(String yob) {
      this.yob = yob;
    }
    
    public String getGender() {
      return gender;
    }
    
    public void setGender(String gender) {
      this.gender = gender;
    }
    
    public String getSerialNumber() {
      return serialNumber;
    }
    
    public void setSerialNumber(String serialNumber) {
      this.serialNumber = serialNumber;
    }
    
    public String getIssuerName() {
      return issuerName;
    }
    
    public void setIssuerName(String issuerName) {
      this.issuerName = issuerName;
    }
    
    public String getIssuerOrganisation() {
      return issuerOrganisation;
    }
    
    public void setIssuerOrganisation(String issuerOrganisation) {
      this.issuerOrganisation = issuerOrganisation;
    }
    
    public long getEndDate() {
      return endDate;
    }
    
    public void setEndDate(long endDate) {
      this.endDate = endDate;
    }
    
    public String getTpin() {
      return tpin;
    }
    
    public void setTpin(String tpin) {
      this.tpin = tpin;
    }
  }
}
