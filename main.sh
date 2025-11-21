#!/bin/bash
#===============================================================================
# EPak Completion Script - Production Version for Support Team
#
# Required Files:
#   - fix-epak-interactive.sh (this file)
#   - epak-status-fix-script.sql (must be in same directory)
#
# Usage:
#   ./fix-epak-interactive.sh                      - Normal operation
#   ./fix-epak-interactive.sh --batch <csv_file>   - Batch process from CSV
#   ./fix-epak-interactive.sh --config             - Manage credentials
#   ./fix-epak-interactive.sh --reset              - Reset credentials
#   ./fix-epak-interactive.sh --help               - Show help
#===============================================================================

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 
# This script helps support team fix corrupted/pending EPaks manually
# Features:
# - Shows current state of all tables
# - Takes user input for EPak ID and parameters
# - Previews what changes will be made
# - Allows commit or rollback
# - Generates rollback script for post-commit recovery
#===============================================================================

#===============================================================================
# CREDENTIAL MANAGEMENT SYSTEM
# Priority order:
# 1. Environment variables (EPAK_DB_HOST, EPAK_DB_NAME, EPAK_DB_USER, EPAK_DB_PASS)
# 2. Config file (~/.epak-config)
# 3. MySQL config file (~/.my.cnf)
# 4. Interactive prompt
#===============================================================================
CONFIG_FILE="${HOME}/.epak-config"
USE_MYSQL_CNF=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Helper functions
print_header() {
    echo ""
    echo -e "${BOLD}${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
    printf "${BOLD}${BLUE}║${NC} %-60s ${BOLD}${BLUE}║${NC}\n" "$1"
    echo -e "${BOLD}${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${CYAN}ℹ️  $1${NC}"
}

print_section() {
    echo ""
    echo -e "${BOLD}${CYAN}═══ $1 ═══${NC}"
    echo ""
}

# Wrapper for mysql command to suppress password warning
run_mysql() {
    if [ "$USE_MYSQL_CNF" = true ]; then
        mysql "$@" 2>&1 | grep -v "Using a password"
    else
        mysql -h"${DB_HOST}" -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" "$@" 2>&1 | grep -v "Using a password"
    fi
}

# Load credentials from multiple sources
load_credentials() {
    local source_used=""
    
    # Priority 1: Check environment variables
    if [ -n "${EPAK_DB_HOST}" ]; then
        DB_HOST="${EPAK_DB_HOST}"
        DB_NAME="${EPAK_DB_NAME:-msb}"
        DB_USER="${EPAK_DB_USER:-msb}"
        DB_PASS="${EPAK_DB_PASS}"
        source_used="environment variables"
        print_success "Using credentials from environment variables"
        return 0
    fi
    
    # Priority 2: Check config file
    if [ -f "$CONFIG_FILE" ]; then
        # Verify file permissions (should be 600)
        FILE_PERMS=$(stat -f "%Lp" "$CONFIG_FILE" 2>/dev/null || stat -c "%a" "$CONFIG_FILE" 2>/dev/null)
        
        if [ "$FILE_PERMS" != "600" ]; then
            print_warning "Config file has insecure permissions: $FILE_PERMS (should be 600)"
            print_info "Run: chmod 600 $CONFIG_FILE"
            echo ""
        else
            # Load config file
            source "$CONFIG_FILE"
            source_used="config file"
            print_success "Loaded credentials from $CONFIG_FILE"
            return 0
        fi
    fi
    
    # Priority 3: Try MySQL config file
    if [ -f "${HOME}/.my.cnf" ]; then
        print_info "Found ~/.my.cnf, testing MySQL config authentication..."
        if mysql -e "SELECT 1;" > /dev/null 2>&1; then
            USE_MYSQL_CNF=true
            # Extract connection details from .my.cnf if possible
            DB_HOST=$(grep -E "^host\s*=" ~/.my.cnf 2>/dev/null | cut -d'=' -f2 | tr -d ' ' || echo "localhost")
            DB_NAME=$(grep -E "^database\s*=" ~/.my.cnf 2>/dev/null | cut -d'=' -f2 | tr -d ' ' || echo "msb")
            DB_USER=$(grep -E "^user\s*=" ~/.my.cnf 2>/dev/null | cut -d'=' -f2 | tr -d ' ' || echo "msb")
            source_used="MySQL config file"
            print_success "Using credentials from ~/.my.cnf"
            return 0
        fi
    fi
    
    # Priority 4: No credentials found, will prompt user
    return 1
}

# Save credentials to config file
save_credentials() {
    cat > "$CONFIG_FILE" <<EOF
# EPak Tool Configuration
# Created: $(date)
# 
# WARNING: This file contains sensitive credentials
# Keep it secure with: chmod 600 $CONFIG_FILE
#
DB_HOST="$DB_HOST"
DB_NAME="$DB_NAME"
DB_USER="$DB_USER"
DB_PASS="$DB_PASS"
EOF
    chmod 600 "$CONFIG_FILE"
    print_success "Configuration saved to $CONFIG_FILE"
    print_info "File permissions set to 600 (only you can read/write)"
}

# Show help
show_help() {
echo ""
    echo "EPak Fix Tool - Usage"
    echo ""
    echo "Usage:"
    echo "  $0                         Run the EPak fix tool (normal operation)"
    echo "  $0 --batch <csv_file>      Batch process EPaks from CSV file"
    echo "  $0 --config                Manage saved credentials"
    echo "  $0 --reset                 Reset/delete saved credentials"
    echo "  $0 --help                  Show this help message"
    echo ""
    echo "Batch Processing File Formats:"
    echo ""
    echo "  1. Excel/Sheets → Save as Tab Delimited (RECOMMENDED)"
    echo "     - Create 3 columns in Excel: epak_id | operation_type | sql_statement"
    echo "     - Save As → Tab Delimited Text (.txt or .tsv)"
    echo "     - Run: ./fix-epak-interactive.sh --batch your-file.txt"
    echo ""
    echo "  2. Text Editor → Use pipe delimiter"
    echo "     - Format: epak_id|operation_type|sql_statement"
    echo "     - Save as .csv or .txt"
    echo ""
    echo "  Examples:"
    echo "    Tab-delimited:  1513469[TAB]UPDATE[TAB]UPDATE epak SET status='Completed'..."
    echo "    Pipe-delimited: 1513469|UPDATE|UPDATE epak SET status='Completed'..."
    echo ""
    echo "  Note: Script auto-detects delimiter (no conversion needed!)"
    echo ""
    echo "Credential Management:"
    echo "  Credentials are automatically loaded from:"
    echo "    1. Environment variables (EPAK_DB_*)"
    echo "    2. Config file (~/.epak-config)"
    echo "    3. MySQL config (~/.my.cnf)"
    echo "    4. Interactive prompt (if none found)"
    echo ""
    echo "Examples:"
    echo "  ./fix-epak-interactive.sh"
    echo "  ./fix-epak-interactive.sh --batch epaks_to_fix.csv"
    echo "  ./fix-epak-interactive.sh --config"
    echo "  EPAK_DB_PASS='password' ./fix-epak-interactive.sh"
    echo ""
    exit 0
}

# Batch processing from CSV
batch_process_csv() {
    local csv_file="$1"
    
    if [ ! -f "$csv_file" ]; then
        print_error "CSV file not found: $csv_file"
        exit 1
    fi
    
    print_header "Batch Processing Mode"
    print_info "CSV File: $csv_file"
    
    # Load and validate credentials
    if ! load_credentials; then
        print_warning "No saved credentials found"
        echo ""
        read -p "Database Host [localhost]: " DB_HOST
        DB_HOST=${DB_HOST:-localhost}
        read -p "Database Name [msb]: " DB_NAME
        DB_NAME=${DB_NAME:-msb}
        read -p "Database User [msb]: " DB_USER
        DB_USER=${DB_USER:-msb}
        read -sp "Database Password: " DB_PASS
        echo ""
    fi
    
    # Test connection
    print_info "Testing database connection..."
    if ! run_mysql -e "SELECT 1;" > /dev/null 2>&1; then
        print_error "Failed to connect to database!"
        exit 1
    fi
    print_success "Connected to database successfully!"
    echo ""
    
    # Read CSV and group by EPak ID
    print_info "Reading file: $csv_file"
    
    # Auto-detect delimiter (pipe or tab)
    FIRST_LINE=$(head -1 "$csv_file")
    if [[ "$FIRST_LINE" == *$'\t'* ]]; then
        DELIMITER=$'\t'
        FORMAT_NAME="tab-delimited (TSV)"
        print_success "Detected: Tab-delimited format (Excel/Sheets compatible)"
    elif [[ "$FIRST_LINE" == *'|'* ]]; then
        DELIMITER='|'
        FORMAT_NAME="pipe-delimited"
        print_success "Detected: Pipe-delimited format"
    else
        print_error "Could not detect delimiter (expecting tab or pipe)"
        print_info "First line: $FIRST_LINE"
        exit 1
    fi
    
    echo ""
    
    declare -A epak_operations
    local line_num=0
    
    while IFS="$DELIMITER" read -r epak_id op_type sql_statement || [ -n "$epak_id" ]; do
        line_num=$((line_num + 1))
        
        # Skip header
        if [ $line_num -eq 1 ]; then
            continue
        fi
        
        # Skip empty lines
        if [ -z "$epak_id" ]; then
            continue
        fi
        
        # Trim whitespace
        epak_id=$(echo "$epak_id" | xargs)
        op_type=$(echo "$op_type" | xargs)
        sql_statement=$(echo "$sql_statement" | xargs)
        
        # Validate required fields
        if [ -z "$sql_statement" ]; then
            print_warning "Line $line_num: Empty SQL statement, skipping"
            continue
        fi
        
        # Ensure SQL ends with semicolon
        if [[ "$sql_statement" != *\; ]]; then
            sql_statement="${sql_statement};"
        fi
        
        # Append to epak operations
        if [ -z "${epak_operations[$epak_id]}" ]; then
            epak_operations[$epak_id]="$sql_statement"
        else
            epak_operations[$epak_id]="${epak_operations[$epak_id]}|||$sql_statement"
        fi
        
    done < "$csv_file"
    
    local total_epaks=${#epak_operations[@]}
    print_success "Loaded $total_epaks EPaks with operations"
        echo ""
    
    # Process each EPak
    local processed=0
    local successful=0
    local skipped=0
    local failed=0
    
    for epak_id in "${!epak_operations[@]}"; do
        processed=$((processed + 1))
        
        print_header "Processing EPak $processed/$total_epaks"
        
        echo ""
        echo -e "${BOLD}EPak ID: ${epak_id}${NC}"
        echo ""
        
        # Show current state
        print_section "Current EPak State"
        mysql -h"${DB_HOST}" -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" -t <<EOF 2>&1 | grep -v "Using a password"
SELECT id, status, progressPercent, subject
FROM epak 
WHERE id = ${epak_id};
EOF
        
        # Show operations to execute
        echo ""
        print_section "Operations to Execute"
        
        IFS='|||' read -ra OPS <<< "${epak_operations[$epak_id]}"
        local op_num=1
        for op in "${OPS[@]}"; do
            echo -e "${GREEN}${op_num}. ${op}${NC}"
            op_num=$((op_num + 1))
        done
        
        echo ""
        echo "Options:"
        echo "  1. Execute these operations"
        echo "  2. Skip this EPak"
        echo "  3. Stop batch processing"
        echo ""
        read -p "Choose [1-3]: " BATCH_CHOICE
        
        case $BATCH_CHOICE in
            1)
                # Execute operations
                TEMP_SQL="/tmp/epak_batch_${epak_id}_$$.sql"
                
                cat > "$TEMP_SQL" <<EOFBATCH
-- Batch operation for EPak ID: ${epak_id}
-- Generated: $(date)
START TRANSACTION;

EOFBATCH
                
                for op in "${OPS[@]}"; do
                    echo "$op" >> "$TEMP_SQL"
                done
                
                echo "COMMIT;" >> "$TEMP_SQL"
                echo "SELECT 'EPak ${epak_id} completed successfully!' as Status;" >> "$TEMP_SQL"
                
                print_info "Executing operations..."
                EXEC_OUTPUT=$(mysql -h"${DB_HOST}" -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" < "$TEMP_SQL" 2>&1 | grep -v "Using a password")
                EXEC_STATUS=$?
                
                if [ $EXEC_STATUS -eq 0 ]; then
                    print_success "EPak ${epak_id} processed successfully!"
                    successful=$((successful + 1))
                    
                    # Show final state
                    echo ""
                    print_section "Final State"
                    mysql -h"${DB_HOST}" -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" -t <<EOFSTATE 2>&1 | grep -v "Using a password"
SELECT id, status, progressPercent
FROM epak 
WHERE id = ${epak_id};
EOFSTATE
                else
                    print_error "Failed to process EPak ${epak_id}"
                    echo "$EXEC_OUTPUT"
                    failed=$((failed + 1))
                fi
                
                rm -f "$TEMP_SQL"
                ;;
            2)
                print_warning "Skipped EPak ${epak_id}"
                skipped=$((skipped + 1))
                ;;
            3)
                print_warning "Batch processing stopped by user"
                break
                ;;
            *)
                print_error "Invalid choice, skipping EPak ${epak_id}"
                skipped=$((skipped + 1))
                ;;
        esac
        
        echo ""
        read -p "Press Enter to continue to next EPak..."
    done
    
    # Summary
    print_header "Batch Processing Summary"
    echo ""
    echo "Total EPaks:      $total_epaks"
    echo -e "${GREEN}Successful:       $successful${NC}"
    echo -e "${YELLOW}Skipped:          $skipped${NC}"
    echo -e "${RED}Failed:           $failed${NC}"
    echo ""
    
    exit 0
}

# Credential configuration menu
# Parameter: $1 = "standalone" (exits after) or "inline" (returns to main flow)
manage_credentials() {
    local mode="${1:-standalone}"
    
    print_header "Credential Management"
    
    echo ""
    echo "Config file location: ${CONFIG_FILE}"
    echo ""
    
    if [ -f "$CONFIG_FILE" ]; then
        # Config exists - show current settings
        print_info "Current saved credentials found"
        echo ""
        
        # Load and display (mask password)
        source "$CONFIG_FILE"
        echo -e "${BOLD}Current Configuration:${NC}"
        echo "  Host:     ${DB_HOST}"
        echo "  Database: ${DB_NAME}"
        echo "  User:     ${DB_USER}"
        echo "  Password: ••••••••"
        echo ""
        
        # Check permissions
        FILE_PERMS=$(stat -f "%Lp" "$CONFIG_FILE" 2>/dev/null || stat -c "%a" "$CONFIG_FILE" 2>/dev/null)
        if [ "$FILE_PERMS" = "600" ]; then
            print_success "File permissions: $FILE_PERMS (secure)"
        else
            print_warning "File permissions: $FILE_PERMS (should be 600)"
        fi
        
    echo ""
        echo -e "${BOLD}What would you like to do?${NC}"
        echo "  1. Update credentials (enter new values)"
        echo "  2. Delete credentials (start fresh)"
        echo "  3. Test connection"
        echo "  4. Fix file permissions"
        if [ "$mode" = "standalone" ]; then
            echo "  5. Exit"
        else
            echo "  5. Return to main flow"
        fi
    echo ""
        read -p "Enter choice [1-5]: " CHOICE
        
        case $CHOICE in
            1)
                # Update credentials
                echo ""
                print_section "Enter New Credentials"
                
                read -p "Database Host [$DB_HOST]: " NEW_HOST
                NEW_HOST=${NEW_HOST:-$DB_HOST}
                
                read -p "Database Name [$DB_NAME]: " NEW_NAME
                NEW_NAME=${NEW_NAME:-$DB_NAME}
                
                read -p "Database User [$DB_USER]: " NEW_USER
                NEW_USER=${NEW_USER:-$DB_USER}
                
                read -sp "Database Password (leave blank to keep current): " NEW_PASS
    echo ""
                
                if [ -z "$NEW_PASS" ]; then
                    NEW_PASS="$DB_PASS"
                    print_info "Keeping existing password"
                fi
                
                # Save new credentials
                DB_HOST="$NEW_HOST"
                DB_NAME="$NEW_NAME"
                DB_USER="$NEW_USER"
                DB_PASS="$NEW_PASS"
                
                save_credentials

echo ""
                print_success "Credentials updated successfully!"
                echo ""
                read -p "Test connection now? (yes/no) [yes]: " TEST_CONN
                TEST_CONN=${TEST_CONN:-yes}
                
                if [[ "$TEST_CONN" == "yes" ]]; then
                    echo ""
                    print_info "Testing connection..."
                    if mysql -h"${DB_HOST}" -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" -e "SELECT 1;" > /dev/null 2>&1; then
                        print_success "Connection successful!"
                    else
                        print_error "Connection failed! Please check your credentials."
                    fi
                fi
                ;;
            2)
                # Delete credentials
                echo ""
                print_warning "This will delete your saved credentials!"
                read -p "Are you sure? (yes/no): " CONFIRM
                
                if [[ "$CONFIRM" == "yes" ]]; then
                    rm -f "$CONFIG_FILE"
                    print_success "Credentials deleted!"
                    print_info "Next run will prompt for new credentials"
                else
                    print_info "Cancelled"
                fi
                ;;
            3)
# Test connection
                echo ""
                print_info "Testing connection..."
                if mysql -h"${DB_HOST}" -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" -e "SELECT 1;" 2>&1 | grep -v "Using a password" > /dev/null; then
                    print_success "Connection successful!"
                else
                    print_error "Connection failed!"
                    echo ""
                    print_info "Check your credentials with: ./fix-epak-interactive.sh --config"
                fi
                ;;
            4)
                # Fix permissions
                chmod 600 "$CONFIG_FILE"
                NEW_PERMS=$(stat -f "%Lp" "$CONFIG_FILE" 2>/dev/null || stat -c "%a" "$CONFIG_FILE" 2>/dev/null)
                print_success "Permissions updated to $NEW_PERMS"
                ;;
            5)
                if [ "$mode" = "standalone" ]; then
                    print_info "Exiting"
                    exit 0
                else
                    print_info "Returning to main flow"
                    echo ""
                    return 0
                fi
                ;;
            *)
                print_error "Invalid choice"
                if [ "$mode" = "standalone" ]; then
                    exit 1
                else
                    return 1
                fi
                ;;
        esac
    else
        # No config exists
        print_warning "No saved credentials found"
        echo ""
        print_info "Would you like to create a credential configuration now?"
        read -p "Create config? (yes/no): " CREATE_CONFIG
        
        if [[ "$CREATE_CONFIG" == "yes" ]]; then
            echo ""
            print_section "Enter Database Credentials"
            
            read -p "Database Host [localhost]: " DB_HOST
            DB_HOST=${DB_HOST:-localhost}
            
            read -p "Database Name [msb]: " DB_NAME
            DB_NAME=${DB_NAME:-msb}
            
            read -p "Database User [msb]: " DB_USER
            DB_USER=${DB_USER:-msb}
            
        read -sp "Database Password: " DB_PASS
        echo ""
            
            save_credentials
            
            echo ""
            print_success "Credentials saved!"
            echo ""
            read -p "Test connection now? (yes/no) [yes]: " TEST_CONN
            TEST_CONN=${TEST_CONN:-yes}
            
            if [[ "$TEST_CONN" == "yes" ]]; then
                echo ""
                print_info "Testing connection..."
                if mysql -h"${DB_HOST}" -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" -e "SELECT 1;" > /dev/null 2>&1; then
                    print_success "Connection successful!"
                else
                    print_error "Connection failed! Please check your credentials."
                fi
            fi
        else
            print_info "Cancelled"
        fi
    fi
    
        echo ""
    if [ "$mode" = "standalone" ]; then
        exit 0
    else
        return 0
    fi
}

# Quick reset function
reset_credentials() {
    print_header "Reset Credentials"
    
    if [ -f "$CONFIG_FILE" ]; then
        echo ""
        print_warning "This will delete your saved credentials!"
        echo "Location: $CONFIG_FILE"
        echo ""
        read -p "Are you sure? (yes/no): " CONFIRM
        
        if [[ "$CONFIRM" == "yes" ]]; then
            rm -f "$CONFIG_FILE"
            print_success "Credentials deleted!"
            echo ""
            print_info "Next time you run the script, you'll be prompted for credentials."
        else
            print_info "Cancelled - credentials not deleted"
        fi
    else
        print_info "No saved credentials found"
        echo "Location: $CONFIG_FILE"
    fi
    
    echo ""
    exit 0
}

#===============================================================================
# COMMAND-LINE ARGUMENT PARSING
#===============================================================================
case "${1:-}" in
    --batch|-b)
        if [ -z "$2" ]; then
            print_error "CSV file path required for batch processing"
            echo "Usage: $0 --batch <csv_file>"
            exit 1
        fi
        batch_process_csv "$2"
        ;;
    --config|--configure|-c)
        manage_credentials
        ;;
    --reset|-r)
        reset_credentials
        ;;
    --help|-h|help)
        show_help
        ;;
    "")
        # No arguments - normal operation
        ;;
    *)
        echo "Unknown option: $1"
        echo "Try '$0 --help' for more information."
        exit 1
        ;;
esac

#===============================================================================
# MAIN SCRIPT EXECUTION
#===============================================================================

# Main credential loading logic
print_header "EPak Completion Script - Support Team Tool"

print_info "Loading database credentials..."
    echo ""
    
if load_credentials; then
    # Credentials loaded successfully from a source
    if [ "$USE_MYSQL_CNF" = true ]; then
        echo -e "${BOLD}Current Connection Details:${NC}"
        echo "  Host: ${DB_HOST}"
        echo "  Database: ${DB_NAME}"
        echo "  User: ${DB_USER}"
        echo "  Auth: MySQL config file (~/.my.cnf)"
    else
        echo -e "${BOLD}Current Connection Details:${NC}"
        echo "  Host: ${DB_HOST}"
        echo "  Database: ${DB_NAME}"
        echo "  User: ${DB_USER}"
        echo "  Password: ••••••••"
    fi
    
    echo ""
    echo -e "${BOLD}Would you like to:${NC}"
    echo "  1. Continue with these credentials"
    echo "  2. Change/update credentials"
    echo "  3. Test connection first"
    echo ""
    read -p "Enter choice [1-3] (default: 1): " CRED_CHOICE
    CRED_CHOICE=${CRED_CHOICE:-1}
    
    case $CRED_CHOICE in
        1)
            print_info "Using current credentials"
            ;;
        2)
            # Call credential management function in inline mode
            manage_credentials "inline"
            # After managing credentials, reload them
            if load_credentials; then
                print_success "Credentials reloaded"
            else
                print_error "Failed to load credentials after update"
                exit 1
            fi
            ;;
        3)
            # Test connection first
            echo ""
            print_info "Testing connection..."
            if mysql -h"${DB_HOST}" -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" -e "SELECT 1;" > /dev/null 2>&1; then
                print_success "Connection successful!"
                echo ""
                read -p "Continue with these credentials? (yes/no) [yes]: " CONTINUE
                CONTINUE=${CONTINUE:-yes}
                if [[ "$CONTINUE" != "yes" ]]; then
                    manage_credentials "inline"
                    # After managing credentials, reload them
                    if load_credentials; then
                        print_success "Credentials reloaded"
                    else
                        print_error "Failed to load credentials after update"
                        exit 1
                    fi
                fi
            else
                print_error "Connection failed!"
                echo ""
                read -p "Would you like to update credentials? (yes/no) [yes]: " UPDATE
                UPDATE=${UPDATE:-yes}
                if [[ "$UPDATE" == "yes" ]]; then
                    manage_credentials "inline"
                    # After managing credentials, reload them
                    if load_credentials; then
                        print_success "Credentials reloaded"
                    else
                        print_error "Failed to load credentials after update"
                        exit 1
                    fi
                else
                    print_error "Cannot continue without valid credentials"
                    exit 1
                fi
            fi
            ;;
        *)
            print_warning "Invalid choice, using current credentials"
            ;;
    esac
else
    # No credentials found - prompt user
    print_warning "No saved credentials found"
    echo ""
echo -e "${BOLD}Enter Database Connection Details:${NC}"
echo ""

read -p "Database Host [localhost]: " DB_HOST
DB_HOST=${DB_HOST:-localhost}

read -p "Database Name [msb]: " DB_NAME
DB_NAME=${DB_NAME:-msb}

read -p "Database User [msb]: " DB_USER
DB_USER=${DB_USER:-msb}

read -sp "Database Password: " DB_PASS
echo ""
echo ""

    # Offer to save credentials
    print_info "Save these credentials for future use?"
    echo ""
    echo "Options:"
    echo "  1. Save to config file (${CONFIG_FILE})"
    echo "  2. Don't save (prompt each time)"
    echo ""
    read -p "Enter choice [1-2]: " SAVE_CHOICE
    
    if [[ "$SAVE_CHOICE" == "1" ]]; then
        save_credentials
        echo ""
    else
        print_info "Credentials not saved - you'll be prompted next time"
    echo ""
    fi
fi

echo ""

# Test connection (final check before proceeding)
print_info "Testing database connection..."
TEST_OUTPUT=$(run_mysql -e "SELECT 1;" 2>&1)
if [ $? -ne 0 ]; then
    print_error "Failed to connect to database!"
    echo "$TEST_OUTPUT"
    echo ""
    if [ -f "$CONFIG_FILE" ]; then
        print_warning "Credentials may be incorrect. Run with --config to update:"
        echo "  ./fix-epak-interactive.sh --config"
    fi
    exit 1
fi
print_success "Connected to database successfully!"

# Get EPak ID
echo ""
print_section "Step 1: Enter EPak Details"

read -p "Enter EPak ID: " EPAK_ID
if [[ -z "$EPAK_ID" ]]; then
    print_error "EPak ID is required!"
    exit 1
fi

# Check for documents in this EPak
print_info "Checking documents in EPak..."

# Get all documents for this EPak
DOC_LIST=$(run_mysql -t <<EOF
SELECT 
    ed.documentId,
    d.title as documentName
FROM epak_document ed
JOIN document d ON d.id = ed.documentId
WHERE ed.ePakId = ${EPAK_ID}
ORDER BY ed.documentId;
EOF
)

# Count documents
DOC_COUNT=$(run_mysql -s -N -e "SELECT COUNT(*) FROM epak_document WHERE ePakId = ${EPAK_ID};")

if [[ "$DOC_COUNT" -eq 0 ]]; then
    print_error "No documents found for EPak ID ${EPAK_ID}. EPak may not exist!"
    exit 1
fi

if [[ "$DOC_COUNT" -eq 1 ]]; then
    # Single document - auto-select
    DOCUMENT_ID=$(run_mysql -s -N -e "SELECT documentId FROM epak_document WHERE ePakId = ${EPAK_ID} LIMIT 1;")
    print_success "Found 1 document (ID: ${DOCUMENT_ID}) - auto-selected"
else
    # Multiple documents - show selection menu
    print_warning "Found ${DOC_COUNT} documents in this EPak!"
    echo ""
    echo -e "${BOLD}Documents in EPak #${EPAK_ID}:${NC}"
    echo "$DOC_LIST"
    echo ""
    
    # Get document IDs for selection
    DOC_IDS=($(run_mysql -s -N -e "SELECT documentId FROM epak_document WHERE ePakId = ${EPAK_ID} ORDER BY documentId;"))
    
    echo -e "${BOLD}Select which document to fix:${NC}"
    for i in "${!DOC_IDS[@]}"; do
        DOC_ID="${DOC_IDS[$i]}"
        DOC_NAME=$(run_mysql -s -N -e "SELECT title FROM document WHERE id = ${DOC_ID};")
        echo "  $((i+1)). Document ID: ${DOC_ID} - ${DOC_NAME}"
    done
    echo ""
    
    read -p "Enter selection [1-${DOC_COUNT}]: " DOC_SELECTION
    
    if [[ "$DOC_SELECTION" =~ ^[0-9]+$ ]] && [ "$DOC_SELECTION" -ge 1 ] && [ "$DOC_SELECTION" -le "$DOC_COUNT" ]; then
        DOCUMENT_ID="${DOC_IDS[$((DOC_SELECTION-1))]}"
        DOC_NAME=$(run_mysql -s -N -e "SELECT title FROM document WHERE id = ${DOCUMENT_ID};")
        print_success "Selected: Document ID ${DOCUMENT_ID} - ${DOC_NAME}"
    else
        print_error "Invalid selection!"
        exit 1
    fi
fi

# Show current state of all tables
print_header "CURRENT STATE - EPak #${EPAK_ID}"

print_section "1. EPak Table"
mysql -h"${DB_HOST}" -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" -t <<EOF 2>&1 | grep -v "Using a password"
SELECT 
    id,
    status,
    progressPercent,
    subject,
    sentOn,
    modifiedOn,
    currentWorkflowStateId,
    ownerId
FROM epak 
WHERE id = ${EPAK_ID};
EOF

print_section "2. Documents in EPak"
mysql -h"${DB_HOST}" -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" -t <<EOF 2>&1 | grep -v "Using a password"
SELECT 
    ed.documentId,
    d.title,
    CASE 
        WHEN ed.documentId = ${DOCUMENT_ID} THEN '← SELECTED FOR FIX'
        ELSE ''
    END as selected
FROM epak_document ed
JOIN document d ON d.id = ed.documentId
WHERE ed.ePakId = ${EPAK_ID}
ORDER BY ed.documentId;
EOF

print_section "3. EPak Workflow State Signers"
mysql -h"${DB_HOST}" -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" -t <<EOF 2>&1 | grep -v "Using a password"
SELECT 
    id,
    userId,
    status,
    progressPercent,
    statusModifiedOn,
    workflowStateOrderId,
    signerOrderId
FROM epak_workflowstate_signer 
WHERE ePakId = ${EPAK_ID}
ORDER BY workflowStateOrderId;
EOF

print_section "4. Document User Actions"
mysql -h"${DB_HOST}" -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" -t <<EOF 2>&1 | grep -v "Using a password"
SELECT 
    id,
    signerId,
    status,
    actedOn,
    workflowStateOrderId
FROM docuseraction 
WHERE ePakId = ${EPAK_ID}
ORDER BY workflowStateOrderId;
EOF

print_section "5. ALL Document Activity (No Limit)"
mysql -h"${DB_HOST}" -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" -t <<EOF 2>&1 | grep -v "Using a password"
SELECT 
    id,
    actedOn,
    action,
    actorEmail,
    actorFirstName,
    actorLastName,
    actorMiddleName,
    LEFT(comments, 100) as comments_preview
FROM documentactivity 
WHERE documentId = ${DOCUMENT_ID}
ORDER BY actedOn ASC;
EOF

print_section "6. ALL EPak Activity (No Limit)"
mysql -h"${DB_HOST}" -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" -t <<EOF 2>&1 | grep -v "Using a password"
SELECT 
    id,
    actedOn,
    action,
    actorEmail,
    actorFirstName,
    actorLastName,
    status
FROM epakactivity 
WHERE ePakId = ${EPAK_ID}
ORDER BY actedOn ASC;
EOF

# Ask if user wants to proceed
echo ""
print_warning "Review the current state above carefully!"
    echo ""
echo -e "${BOLD}What would you like to do?${NC}"
echo "  1. Fix EPak with manual control (recommended)"
echo "  2. Corrupt EPak for testing"
echo "  3. Cancel operation"
echo ""
read -p "Enter choice [1-3]: " PROCEED_CHOICE

case $PROCEED_CHOICE in
    1)
        PROCEED="yes"
        print_info "Starting manual fix process..."
        ;;
    2)
        PROCEED="no_but_corrupt"
        print_info "Will corrupt EPak first..."
        ;;
    3)
        print_info "Operation cancelled by user."
        exit 0
        ;;
    *)
        print_error "Invalid choice"
        exit 1
        ;;
esac

# Get pending signer details
print_section "Step 2: Identify Pending Signer"

PENDING_SIGNER_INFO=$(mysql -h"${DB_HOST}" -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" -s -N <<EOF 2>&1 | grep -v "Using a password"
SELECT 
    ews.id,
    ews.userId,
    COALESCE(u.email, 'Unknown'),
    '',
    COALESCE(u.email, 'Unknown')
FROM epak_workflowstate_signer ews
LEFT JOIN user u ON u.id = ews.userId
WHERE ews.ePakId = ${EPAK_ID} 
AND ews.status = 'Pending'
ORDER BY ews.workflowStateOrderId DESC
LIMIT 1;
EOF
)

if [[ -z "$PENDING_SIGNER_INFO" ]] || [[ "$PROCEED" == "no_but_corrupt" ]]; then
    
    # If user already said they want to corrupt, don't ask again
    if [[ "$PROCEED" == "no_but_corrupt" ]]; then
        CORRUPT_FIRST="yes"
        print_header "Corrupting EPak #${EPAK_ID} as Requested"
    else
        print_warning "No pending signer found! EPak may already be completed."
        echo ""
        print_info "Would you like to corrupt this EPak first to prepare it for testing?"
        read -p "Corrupt EPak #${EPAK_ID} now? (yes/no): " CORRUPT_FIRST
    fi
    
    if [[ "$CORRUPT_FIRST" == "yes" ]]; then
        # Only show header if not already shown
        if [[ "$PROCEED" != "no_but_corrupt" ]]; then
            print_header "Corrupting EPak #${EPAK_ID} First"
        fi
        
        # Show current signer statuses BEFORE corruption
        print_section "Signer Statuses BEFORE Corruption"
        mysql -h"${DB_HOST}" -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" -t <<EOFBEFORE 2>&1 | grep -v "Using a password"
SELECT 
    id,
    userId,
    status,
    progressPercent,
    workflowStateOrderId
FROM epak_workflowstate_signer 
WHERE ePakId = ${EPAK_ID}
ORDER BY workflowStateOrderId;
EOFBEFORE
        
        # Execute corruption using inline SQL (no external file needed)
        print_info "Executing corruption SQL..."
        
        CORRUPT_RESULT=$(mysql -h"${DB_HOST}" -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" 2>&1 <<EOFCORRUPT | grep -v "Using a password"
SET SESSION sql_notes = 0;
SET SESSION sql_warnings = 0;
START TRANSACTION;
SET @EPAK_ID = ${EPAK_ID};
SET @DOCUMENT_ID = ${DOCUMENT_ID};

-- Corruption logic inline
UPDATE epak 
SET status = 'Pending', 
    progressPercent = 50,
    modifiedOn = NOW()
WHERE id = @EPAK_ID;

UPDATE epak_workflowstate_signer 
SET status = 'Pending',
    progressPercent = 0,
    statusModifiedOn = NOW()
WHERE ePakId = @EPAK_ID 
AND status IN ('Signed', 'Completed')
ORDER BY workflowStateOrderId DESC 
LIMIT 1;

DELETE FROM documentactivity 
WHERE documentId = @DOCUMENT_ID 
AND action = 'Signed'
ORDER BY id DESC 
LIMIT 1;

DELETE FROM epakactivity 
WHERE ePakId = @EPAK_ID 
AND action = 'Completed'
ORDER BY id DESC 
LIMIT 1;

COMMIT;
SELECT 'EPak corrupted successfully' as Status;
EOFCORRUPT
)
        
        if [ $? -ne 0 ]; then
            print_error "Corruption failed!"
            echo "$CORRUPT_RESULT"
            exit 1
        fi
        
        print_success "EPak corrupted! Verifying changes..."
        
        # Show what happened during corruption
        print_section "EPak State After Corruption"
        mysql -h"${DB_HOST}" -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" -t <<EOFSHOW 2>&1 | grep -v "Using a password"
SELECT 
    id,
    userId,
    status,
    progressPercent,
    workflowStateOrderId
FROM epak_workflowstate_signer 
WHERE ePakId = ${EPAK_ID}
ORDER BY workflowStateOrderId;
EOFSHOW
        
        # Re-fetch pending signer after corruption (simplified query)
        print_info "Looking for pending signer..."
        PENDING_SIGNER_INFO=$(mysql -h"${DB_HOST}" -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" -s -N <<EOF 2>&1 | grep -v "Using a password"
SELECT 
    ews.id,
    ews.userId,
    COALESCE(u.email, 'Unknown'),
    '',
    COALESCE(u.email, 'Unknown')
FROM epak_workflowstate_signer ews
LEFT JOIN user u ON u.id = ews.userId
WHERE ews.ePakId = ${EPAK_ID} 
AND ews.status = 'Pending'
ORDER BY ews.workflowStateOrderId DESC
LIMIT 1;
EOF
)
        
        if [[ -z "$PENDING_SIGNER_INFO" ]]; then
            print_error "Still no pending signer found after corruption!"
            exit 1
        fi
    else
        print_info "Operation cancelled."
        exit 0
    fi
fi

# Parse signer info
SIGNER_ID=$(echo "$PENDING_SIGNER_INFO" | awk '{print $1}')
USER_ID=$(echo "$PENDING_SIGNER_INFO" | awk '{print $2}')
EMAIL=$(echo "$PENDING_SIGNER_INFO" | awk '{print $3}')

echo -e "${BOLD}Pending Signer Details:${NC}"
echo "  Signer ID: ${SIGNER_ID}"
echo "  User ID: ${USER_ID}"
echo "  Email: ${EMAIL}"
echo ""

#===============================================================================
# GENERALIZED MANUAL CONTROL SECTION
# User builds their own set of operations (INSERT/UPDATE/DELETE)
#===============================================================================

print_header "Manual Database Operations"

# Array to store all operations
declare -a OPERATIONS
declare -a OP_DESCRIPTIONS
OP_COUNT=0

# Helper function to add operation
add_operation() {
    local sql="$1"
    local description="$2"
    OPERATIONS[$OP_COUNT]="$sql"
    OP_DESCRIPTIONS[$OP_COUNT]="$description"
    OP_COUNT=$((OP_COUNT + 1))
}

# Main operations loop
while true; do
echo ""
    print_section "Operation Menu"
    echo ""
    echo -e "${BOLD}Current Operations Queued: ${OP_COUNT}${NC}"
    if [ $OP_COUNT -gt 0 ]; then
        for i in "${!OP_DESCRIPTIONS[@]}"; do
            echo "  $((i+1)). ${OP_DESCRIPTIONS[$i]}"
        done
    fi
    echo ""
    echo -e "${BOLD}What would you like to do?${NC}"
    echo "  1. UPDATE a row"
    echo "  2. INSERT a new row"
    echo "  3. DELETE a row"
    echo "  4. View data from a table"
    echo "  5. Remove last operation"
    echo "  6. Done - Execute all operations"
    echo "  7. Cancel and exit"
    echo ""
    read -p "Enter choice [1-7]: " OP_CHOICE
    
    case $OP_CHOICE in
        1)
            # UPDATE operation
            echo ""
            print_info "UPDATE Operation"
            echo ""
            echo "Available tables:"
            echo "  1. epak"
            echo "  2. epak_workflowstate_signer"
            echo "  3. docuseraction"
            echo "  4. documentactivity"
            echo "  5. epakactivity"
            echo "  6. Other (custom)"
            echo ""
            read -p "Select table [1-6]: " TABLE_CHOICE
            
            case $TABLE_CHOICE in
                1) 
                    TABLE_NAME="epak"
                    # Show current values first
                    echo ""
                    print_info "Current epak row for EPak ID ${EPAK_ID}:"
                    mysql -h"${DB_HOST}" -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" -t -e "SELECT id, status, progressPercent, modifiedOn FROM epak WHERE id = ${EPAK_ID};" 2>&1 | grep -v "Using a password"
                    echo ""
                    echo "Enter new values (press Enter to skip):"
                    read -p "status: " UPD_STATUS
                    read -p "progressPercent: " UPD_PROGRESS
                    read -p "modifiedOn [$(date '+%Y-%m-%d %H:%M:%S')]: " UPD_MODIFIED
                    UPD_MODIFIED=${UPD_MODIFIED:-$(date '+%Y-%m-%d %H:%M:%S')}
                    read -p "WHERE id = [${EPAK_ID}]: " UPD_WHERE_ID
                    UPD_WHERE_ID=${UPD_WHERE_ID:-${EPAK_ID}}
                    
                    # Build SET clause
                    SET_PARTS=()
                    [ -n "$UPD_STATUS" ] && SET_PARTS+=("status='${UPD_STATUS}'")
                    [ -n "$UPD_PROGRESS" ] && SET_PARTS+=("progressPercent=${UPD_PROGRESS}")
                    [ -n "$UPD_MODIFIED" ] && SET_PARTS+=("modifiedOn='${UPD_MODIFIED}'")
                    SET_CLAUSE=$(IFS=', '; echo "${SET_PARTS[*]}")
                    WHERE_CLAUSE="id=${UPD_WHERE_ID}"
                    ;;
                2) 
                    TABLE_NAME="epak_workflowstate_signer"
                    echo ""
                    print_info "Current signer rows for EPak ID ${EPAK_ID}:"
                    mysql -h"${DB_HOST}" -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" -t -e "SELECT id, userId, status, progressPercent, statusModifiedOn FROM epak_workflowstate_signer WHERE ePakId = ${EPAK_ID};" 2>&1 | grep -v "Using a password"
                    echo ""
                    echo "Enter new values (press Enter to skip):"
                    read -p "status: " UPD_STATUS
                    read -p "progressPercent: " UPD_PROGRESS
                    read -p "statusModifiedOn [$(date '+%Y-%m-%d %H:%M:%S')]: " UPD_MODIFIED
                    UPD_MODIFIED=${UPD_MODIFIED:-$(date '+%Y-%m-%d %H:%M:%S')}
                    read -p "WHERE id = : " UPD_WHERE_ID
                    
                    # Build SET clause
                    SET_PARTS=()
                    [ -n "$UPD_STATUS" ] && SET_PARTS+=("status='${UPD_STATUS}'")
                    [ -n "$UPD_PROGRESS" ] && SET_PARTS+=("progressPercent=${UPD_PROGRESS}")
                    [ -n "$UPD_MODIFIED" ] && SET_PARTS+=("statusModifiedOn='${UPD_MODIFIED}'")
                    SET_CLAUSE=$(IFS=', '; echo "${SET_PARTS[*]}")
                    WHERE_CLAUSE="id=${UPD_WHERE_ID}"
                    ;;
                3) 
                    TABLE_NAME="docuseraction"
                    echo ""
                    print_info "Current docuseraction rows for EPak ID ${EPAK_ID}:"
                    mysql -h"${DB_HOST}" -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" -t -e "SELECT id, signerId, status, actedOn FROM docuseraction WHERE ePakId = ${EPAK_ID};" 2>&1 | grep -v "Using a password"
                    echo ""
                    echo "Enter new values (press Enter to skip):"
                    read -p "status: " UPD_STATUS
                    read -p "actedOn [$(date '+%Y-%m-%d %H:%M:%S')]: " UPD_ACTED
                    UPD_ACTED=${UPD_ACTED:-$(date '+%Y-%m-%d %H:%M:%S')}
                    read -p "WHERE id = : " UPD_WHERE_ID
                    
                    # Build SET clause
                    SET_PARTS=()
                    [ -n "$UPD_STATUS" ] && SET_PARTS+=("status='${UPD_STATUS}'")
                    [ -n "$UPD_ACTED" ] && SET_PARTS+=("actedOn='${UPD_ACTED}'")
                    SET_CLAUSE=$(IFS=', '; echo "${SET_PARTS[*]}")
                    WHERE_CLAUSE="id=${UPD_WHERE_ID}"
                    ;;
                4|5)
                    if [ "$TABLE_CHOICE" = "4" ]; then
                        TABLE_NAME="documentactivity"
                    else
                        TABLE_NAME="epakactivity"
                    fi
                    echo ""
                    read -p "Enter WHERE clause (e.g., id=123): " WHERE_CLAUSE
                    echo ""
                    read -p "Enter column names to update (comma-separated, e.g., status,actedOn): " COLS_TO_UPDATE
                    
                    # Ask for each column value
                    IFS=',' read -ra COLS <<< "$COLS_TO_UPDATE"
                    SET_PARTS=()
                    for col in "${COLS[@]}"; do
                        col=$(echo "$col" | xargs) # trim whitespace
                        read -p "${col} = " COL_VAL
                        # Check if value needs quotes
                        if [[ "$COL_VAL" =~ ^[0-9]+$ ]]; then
                            SET_PARTS+=("${col}=${COL_VAL}")
                        else
                            SET_PARTS+=("${col}='${COL_VAL}'")
                        fi
                    done
                    SET_CLAUSE=$(IFS=', '; echo "${SET_PARTS[*]}")
                    ;;
                6) 
                    read -p "Enter table name: " TABLE_NAME
                    echo ""
                    read -p "Enter WHERE clause: " WHERE_CLAUSE
                    echo ""
                    read -p "Enter column names to update (comma-separated): " COLS_TO_UPDATE
                    
                    # Ask for each column value
                    IFS=',' read -ra COLS <<< "$COLS_TO_UPDATE"
                    SET_PARTS=()
                    for col in "${COLS[@]}"; do
                        col=$(echo "$col" | xargs)
                        read -p "${col} = " COL_VAL
                        if [[ "$COL_VAL" =~ ^[0-9]+$ ]]; then
                            SET_PARTS+=("${col}=${COL_VAL}")
                        else
                            SET_PARTS+=("${col}='${COL_VAL}'")
                        fi
                    done
                    SET_CLAUSE=$(IFS=', '; echo "${SET_PARTS[*]}")
                    ;;
                *) print_error "Invalid choice"; continue ;;
            esac
            
            # Build and show final query
            UPDATE_SQL="UPDATE ${TABLE_NAME} SET ${SET_CLAUSE} WHERE ${WHERE_CLAUSE};"
            
            while true; do
echo ""
                echo "Final UPDATE query:"
                echo -e "${GREEN}${UPDATE_SQL}${NC}"
echo ""
                echo "Options:"
                echo "  1. Execute this query"
                echo "  2. Modify values"
                echo "  3. Cancel"
                read -p "Choose [1-3]: " UPDATE_CONFIRM
                
                case $UPDATE_CONFIRM in
                    1)
                        add_operation "$UPDATE_SQL" "UPDATE ${TABLE_NAME} WHERE ${WHERE_CLAUSE}"
                        print_success "Operation added!"
                        break
                        ;;
                    2)
echo ""
                        read -p "Enter new SET clause: " SET_CLAUSE
                        read -p "Enter new WHERE clause: " WHERE_CLAUSE
                        UPDATE_SQL="UPDATE ${TABLE_NAME} SET ${SET_CLAUSE} WHERE ${WHERE_CLAUSE};"
                        ;;
                    3)
                        print_info "Cancelled"
                        break
                        ;;
                    *)
                        print_error "Invalid choice"
                        ;;
                esac
            done
            ;;
            
        2)
            # INSERT operation
echo ""
            print_info "INSERT Operation"
            echo ""
            echo "Available tables:"
            echo "  1. documentactivity"
            echo "  2. epakactivity"
            echo "  3. Other (custom)"
            echo ""
            read -p "Select table [1-3]: " TABLE_CHOICE
            
            case $TABLE_CHOICE in
                1) 
                    TABLE_NAME="documentactivity"
echo ""
                    echo "Enter values (or press Enter to use template):"
                    read -p "actedOn timestamp: " ACTED_ON
                    read -p "action [Signed]: " ACTION
                    ACTION=${ACTION:-Signed}
                    read -p "actorEmail: " ACTOR_EMAIL
                    read -p "actorFirstName: " ACTOR_FIRST
                    read -p "actorId: " ACTOR_ID
                    read -p "actorLastName: " ACTOR_LAST
                    read -p "actorMiddleName (or blank): " ACTOR_MIDDLE
                    read -p "actorRole [Signer]: " ACTOR_ROLE
                    ACTOR_ROLE=${ACTOR_ROLE:-Signer}
                    read -p "documentId: " DOC_ID
                    read -p "tenantId: " TENANT_ID_INS
                    
                    COMMENTS='{"signReason":"Manual fix","signingPolicy":"Manual","browser":"ScriptFix"}'
                    DOC_NAME_INS=$(run_mysql -s -N -e "SELECT title FROM document WHERE id = ${DOC_ID};" 2>/dev/null || echo "Document")
                    
                    INSERT_SQL="INSERT INTO documentactivity (actedOn, action, actorEmail, actorFirstName, actorId, actorLastName, actorMiddleName, actorRole, comments, status, documentName, version, documentId, tenantId, reason) VALUES ('${ACTED_ON}', '${ACTION}', '${ACTOR_EMAIL}', '${ACTOR_FIRST}', ${ACTOR_ID}, '${ACTOR_LAST}', $([ -n "$ACTOR_MIDDLE" ] && echo "'${ACTOR_MIDDLE}'" || echo "NULL"), '${ACTOR_ROLE}', '${COMMENTS}', 'Draft', '${DOC_NAME_INS}', NULL, ${DOC_ID}, ${TENANT_ID_INS}, NULL);"
                    ;;
                2)
                    TABLE_NAME="epakactivity"
echo ""
                    read -p "actedOn timestamp: " ACTED_ON
                    read -p "action [Completed]: " ACTION
                    ACTION=${ACTION:-Completed}
                    read -p "actorEmail: " ACTOR_EMAIL
                    read -p "actorFirstName: " ACTOR_FIRST
                    read -p "actorId: " ACTOR_ID
                    read -p "actorLastName: " ACTOR_LAST
                    read -p "actorMiddleName (or blank): " ACTOR_MIDDLE
                    read -p "actorRole [Custodian]: " ACTOR_ROLE
                    ACTOR_ROLE=${ACTOR_ROLE:-Custodian}
                    read -p "ePakId: " EPAK_ID_INS
                    read -p "status [Completed]: " STATUS_INS
                    STATUS_INS=${STATUS_INS:-Completed}
                    read -p "tenantId: " TENANT_ID_INS
                    
                    EPAK_SUBJ=$(run_mysql -s -N -e "SELECT subject FROM epak WHERE id = ${EPAK_ID_INS};" 2>/dev/null || echo "EPak")
                    
                    INSERT_SQL="INSERT INTO epakactivity (actedOn, action, actorEmail, actorFirstName, actorId, actorLastName, actorMiddleName, actorRole, comments, ePakId, epakSubject, reason, status, tenantId) VALUES ('${ACTED_ON}', '${ACTION}', '${ACTOR_EMAIL}', '${ACTOR_FIRST}', ${ACTOR_ID}, '${ACTOR_LAST}', $([ -n "$ACTOR_MIDDLE" ] && echo "'${ACTOR_MIDDLE}'" || echo "NULL"), '${ACTOR_ROLE}', '{\"nxtStateMsg\":\"\"}', ${EPAK_ID_INS}, '${EPAK_SUBJ}', NULL, '${STATUS_INS}', ${TENANT_ID_INS});"
                    ;;
                3)
                    read -p "Enter table name: " TABLE_NAME
echo ""
                    echo "Enter full INSERT statement:"
                    read -p "INSERT INTO ${TABLE_NAME} " INSERT_REST
                    INSERT_SQL="INSERT INTO ${TABLE_NAME} ${INSERT_REST};"
                    ;;
                *) print_error "Invalid choice"; continue ;;
            esac
            
            
            # Show final query and allow modifications
            while true; do
echo ""
                echo "Final INSERT query:"
                echo -e "${CYAN}${INSERT_SQL}${NC}"
echo ""
                echo "Options:"
                echo "  1. Execute this query"
                echo "  2. Edit values again"
                echo "  3. Cancel"
                read -p "Choose [1-3]: " INSERT_CONFIRM
                
                case $INSERT_CONFIRM in
                    1)
                        add_operation "$INSERT_SQL" "INSERT INTO ${TABLE_NAME}"
                        print_success "Operation added!"
                        break
                        ;;
                    2)
                        # Re-ask for values based on table type
                        if [ "$TABLE_NAME" = "documentactivity" ]; then
                            echo ""
                            read -p "actedOn timestamp: " ACTED_ON
                            read -p "action [Signed]: " ACTION
                            ACTION=${ACTION:-Signed}
                            read -p "actorEmail: " ACTOR_EMAIL
                            read -p "actorFirstName: " ACTOR_FIRST
                            read -p "actorId: " ACTOR_ID
                            read -p "actorLastName: " ACTOR_LAST
                            read -p "actorMiddleName (or blank): " ACTOR_MIDDLE
                            read -p "actorRole [Signer]: " ACTOR_ROLE
                            ACTOR_ROLE=${ACTOR_ROLE:-Signer}
                            read -p "documentId: " DOC_ID
                            read -p "tenantId: " TENANT_ID_INS
                            COMMENTS='{"signReason":"Manual fix","signingPolicy":"Manual","browser":"ScriptFix"}'
                            DOC_NAME_INS=$(run_mysql -s -N -e "SELECT title FROM document WHERE id = ${DOC_ID};" 2>/dev/null || echo "Document")
                            INSERT_SQL="INSERT INTO documentactivity (actedOn, action, actorEmail, actorFirstName, actorId, actorLastName, actorMiddleName, actorRole, comments, status, documentName, version, documentId, tenantId, reason) VALUES ('${ACTED_ON}', '${ACTION}', '${ACTOR_EMAIL}', '${ACTOR_FIRST}', ${ACTOR_ID}, '${ACTOR_LAST}', $([ -n "$ACTOR_MIDDLE" ] && echo "'${ACTOR_MIDDLE}'" || echo "NULL"), '${ACTOR_ROLE}', '${COMMENTS}', 'Draft', '${DOC_NAME_INS}', NULL, ${DOC_ID}, ${TENANT_ID_INS}, NULL);"
                        elif [ "$TABLE_NAME" = "epakactivity" ]; then
                            echo ""
                            read -p "actedOn timestamp: " ACTED_ON
                            read -p "action [Completed]: " ACTION
                            ACTION=${ACTION:-Completed}
                            read -p "actorEmail: " ACTOR_EMAIL
                            read -p "actorFirstName: " ACTOR_FIRST
                            read -p "actorId: " ACTOR_ID
                            read -p "actorLastName: " ACTOR_LAST
                            read -p "actorMiddleName (or blank): " ACTOR_MIDDLE
                            read -p "actorRole [Custodian]: " ACTOR_ROLE
                            ACTOR_ROLE=${ACTOR_ROLE:-Custodian}
                            read -p "ePakId: " EPAK_ID_INS
                            read -p "status [Completed]: " STATUS_INS
                            STATUS_INS=${STATUS_INS:-Completed}
                            read -p "tenantId: " TENANT_ID_INS
                            EPAK_SUBJ=$(run_mysql -s -N -e "SELECT subject FROM epak WHERE id = ${EPAK_ID_INS};" 2>/dev/null || echo "EPak")
                            INSERT_SQL="INSERT INTO epakactivity (actedOn, action, actorEmail, actorFirstName, actorId, actorLastName, actorMiddleName, actorRole, comments, ePakId, epakSubject, reason, status, tenantId) VALUES ('${ACTED_ON}', '${ACTION}', '${ACTOR_EMAIL}', '${ACTOR_FIRST}', ${ACTOR_ID}, '${ACTOR_LAST}', $([ -n "$ACTOR_MIDDLE" ] && echo "'${ACTOR_MIDDLE}'" || echo "NULL"), '${ACTOR_ROLE}', '{\"nxtStateMsg\":\"\"}', ${EPAK_ID_INS}, '${EPAK_SUBJ}', NULL, '${STATUS_INS}', ${TENANT_ID_INS});"
                        else
                            print_warning "Manual editing not supported for custom tables"
                            break
                        fi
                        ;;
                    3)
                        print_info "Cancelled"
                        break
                        ;;
                    *)
                        print_error "Invalid choice"
                        ;;
                esac
            done
            ;;
            
        3)
            # DELETE operation
echo ""
            print_info "DELETE Operation"
echo ""
            echo "Available tables:"
            echo "  1. epakactivity"
            echo "  2. documentactivity"
            echo "  3. Other (custom)"
            echo ""
            read -p "Select table [1-3]: " TABLE_CHOICE
            
            case $TABLE_CHOICE in
                1) 
                    TABLE_NAME="epakactivity"
                    echo ""
                    print_info "All epakactivity rows for EPak ID ${EPAK_ID}:"
                    mysql -h"${DB_HOST}" -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" -t -e "SELECT id, actedOn, action, actorEmail, status FROM epakactivity WHERE ePakId = ${EPAK_ID} ORDER BY id;" 2>&1 | grep -v "Using a password"
                    ;;
                2) 
                    TABLE_NAME="documentactivity"
                    echo ""
                    print_info "All documentactivity rows for Document ID ${DOCUMENT_ID}:"
                    mysql -h"${DB_HOST}" -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" -t -e "SELECT id, actedOn, action, actorEmail FROM documentactivity WHERE documentId = ${DOCUMENT_ID} ORDER BY id;" 2>&1 | grep -v "Using a password"
                    ;;
                3) 
                    read -p "Enter table name: " TABLE_NAME
                    echo ""
                    read -p "Enter WHERE clause to view rows: " VIEW_WHERE
                    mysql -h"${DB_HOST}" -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" -t -e "SELECT * FROM ${TABLE_NAME} WHERE ${VIEW_WHERE};" 2>&1 | grep -v "Using a password"
                    ;;
                *) print_error "Invalid choice"; continue ;;
            esac
            
            echo ""
            echo "How do you want to delete?"
            echo "  1. Delete by ID (single or multiple)"
            echo "  2. Delete by custom WHERE clause"
            read -p "Choose [1-2]: " DELETE_METHOD
            
            case $DELETE_METHOD in
                1)
                    read -p "Enter ID(s) to delete (comma-separated, e.g., 123,456,789): " DELETE_IDS
                    WHERE_CLAUSE="id IN (${DELETE_IDS})"
                    ;;
                2)
                    read -p "Enter WHERE clause: " WHERE_CLAUSE
                    ;;
                *)
                    print_error "Invalid choice"
                    continue
                    ;;
            esac
            
            DELETE_SQL="DELETE FROM ${TABLE_NAME} WHERE ${WHERE_CLAUSE};"
            
            while true; do
                echo ""
                echo "Final DELETE query:"
                echo -e "${RED}${DELETE_SQL}${NC}"
                echo ""
                echo "Options:"
                echo "  1. Execute this query"
                echo "  2. Modify WHERE clause"
                echo "  3. Cancel"
                read -p "Choose [1-3]: " DELETE_CONFIRM
                
                case $DELETE_CONFIRM in
                    1)
                        add_operation "$DELETE_SQL" "DELETE FROM ${TABLE_NAME} WHERE ${WHERE_CLAUSE}"
                        print_success "Operation added!"
                        break
                        ;;
                    2)
                        echo ""
                        read -p "Enter new WHERE clause: " WHERE_CLAUSE
                        DELETE_SQL="DELETE FROM ${TABLE_NAME} WHERE ${WHERE_CLAUSE};"
                        ;;
                    3)
                        print_info "Cancelled"
                        break
                        ;;
                    *)
                        print_error "Invalid choice"
                        ;;
                esac
            done
            ;;
            
        4)
            # View data
            echo ""
            print_info "View Table Data"
            echo ""
            read -p "Enter table name: " VIEW_TABLE
            read -p "Enter WHERE clause (or press Enter for all rows): " VIEW_WHERE
            
            if [ -n "$VIEW_WHERE" ]; then
                VIEW_SQL="SELECT * FROM ${VIEW_TABLE} WHERE ${VIEW_WHERE};"
            else
                VIEW_SQL="SELECT * FROM ${VIEW_TABLE};"
            fi
            
            echo ""
            print_info "Executing: ${VIEW_SQL}"
            echo ""
            mysql -h"${DB_HOST}" -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" -t -e "${VIEW_SQL}" 2>&1 | grep -v "Using a password"
            echo ""
            read -p "Press Enter to continue..."
            ;;
            
        5)
            # Remove last operation
            if [ $OP_COUNT -gt 0 ]; then
                OP_COUNT=$((OP_COUNT - 1))
                unset OPERATIONS[$OP_COUNT]
                unset OP_DESCRIPTIONS[$OP_COUNT]
                print_success "Last operation removed"
            else
                print_warning "No operations to remove"
            fi
            ;;
            
        6)
            # Done - proceed to execution
            if [ $OP_COUNT -eq 0 ]; then
                print_warning "No operations queued!"
                read -p "Exit anyway? (yes/no): " EXIT_EMPTY
                if [[ "$EXIT_EMPTY" == "yes" ]]; then
                    print_info "No operations performed"
    exit 0
fi
            else
                print_success "Proceeding to execution..."
                break
            fi
            ;;
            
        7)
            # Cancel
            print_info "Operation cancelled by user"
            exit 0
            ;;
            
        *)
            print_error "Invalid choice"
            ;;
    esac
done

# Preview what will change
print_header "PREVIEW - All Operations to Execute"

print_section "Summary of ${OP_COUNT} Operations:"

echo ""
for i in "${!OPERATIONS[@]}"; do
    echo -e "${BOLD}${GREEN}Operation $((i+1)):${NC} ${OP_DESCRIPTIONS[$i]}"
    echo "   ${OPERATIONS[$i]}"
echo ""
done

# Final confirmation
echo ""
print_warning "FINAL CONFIRMATION: Execute ALL ${OP_COUNT} operations above?"
echo ""
read -p "Type 'EXECUTE' to proceed: " FINAL_CONFIRM

if [[ "$FINAL_CONFIRM" != "EXECUTE" ]]; then
    print_info "Operation cancelled by user."
    exit 0
fi

# Execute the fix
print_header "Executing Database Operations"

# Create temporary SQL file with all operations
TEMP_SQL="/tmp/epak_operations_${EPAK_ID}_$$.sql"

print_info "Building SQL script from queued operations..."

# Write header
cat > "$TEMP_SQL" <<EOFHEADER
-- ============================================================
-- Manual Database Operations Script
-- Generated: $(date)
-- EPak ID: ${EPAK_ID}
-- Total Operations: ${OP_COUNT}
-- ============================================================

START TRANSACTION;

EOFHEADER

# Add all operations
for i in "${!OPERATIONS[@]}"; do
    echo "-- Operation $((i+1)): ${OP_DESCRIPTIONS[$i]}" >> "$TEMP_SQL"
    echo "${OPERATIONS[$i]}" >> "$TEMP_SQL"
echo "" >> "$TEMP_SQL"
done

# Add commit
cat >> "$TEMP_SQL" <<EOFFOOTER
-- Commit all operations
COMMIT;

SELECT 'All operations committed successfully!' as Status;
EOFFOOTER

print_success "SQL script generated ($(wc -l < "$TEMP_SQL") lines)"
print_info "Temp SQL saved at: $TEMP_SQL"
echo ""

# Execute the combined SQL
print_info "Executing SQL script with ${OP_COUNT} operations..."
EXEC_OUTPUT=$(mysql -h"${DB_HOST}" -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" < "$TEMP_SQL" 2>&1 | grep -v "Using a password")
EXEC_STATUS=$?

# Show any output from SQL execution
if [ -n "$EXEC_OUTPUT" ]; then
    echo ""
    echo "SQL Output:"
    echo "$EXEC_OUTPUT"
    echo ""
fi

# Check if script executed successfully
if [ $EXEC_STATUS -ne 0 ]; then
    print_error "Script execution failed!"
    echo "$EXEC_OUTPUT"
    echo ""
    print_info "SQL file saved for review: $TEMP_SQL"
    print_warning "Transaction was ROLLED BACK automatically"
    exit 1
fi

print_success "All ${OP_COUNT} operations executed successfully!"

# Show final state
print_header "FINAL STATE - After Completion"

print_section "EPak Status"
mysql -h"${DB_HOST}" -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" -t <<EOF 2>&1 | grep -v "Using a password"
SELECT 
    id,
    status,
    progressPercent,
    modifiedOn
FROM epak 
WHERE id = ${EPAK_ID};
EOF

print_section "Signer Status"
mysql -h"${DB_HOST}" -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" -t <<EOF 2>&1 | grep -v "Using a password"
SELECT 
    id,
    status,
    progressPercent,
    statusModifiedOn
FROM epak_workflowstate_signer 
WHERE id = ${SIGNER_ID};
EOF

# Generate rollback script BEFORE committing
ROLLBACK_FILE="/tmp/rollback_epak_${EPAK_ID}_$(date +%Y%m%d_%H%M%S).sql"

print_section "Generating Rollback Script"

# Get current values before commit
OLD_EPAK_STATUS=$(run_mysql -s -N -e "SELECT status FROM epak WHERE id = ${EPAK_ID};")
OLD_EPAK_PROGRESS=$(run_mysql -s -N -e "SELECT progressPercent FROM epak WHERE id = ${EPAK_ID};")

# Get IDs of newly inserted records
DOC_ACTIVITY_ID=$(run_mysql -s -N -e "SELECT id FROM documentactivity WHERE documentId = ${DOCUMENT_ID} ORDER BY id DESC LIMIT 1;")
EPAK_ACTIVITY_ID=$(run_mysql -s -N -e "SELECT id FROM epakactivity WHERE ePakId = ${EPAK_ID} ORDER BY id DESC LIMIT 1;")

cat > "$ROLLBACK_FILE" <<ROLLBACK_SQL
-- ============================================================
-- ROLLBACK SCRIPT for EPak #${EPAK_ID}
-- Generated: $(date '+%Y-%m-%d %H:%M:%S')
-- ============================================================
-- IMPORTANT: Run this script ONLY if you need to undo the changes!
-- ============================================================

START TRANSACTION;

-- Restore EPak to previous state
UPDATE epak 
SET status = 'Pending',
    progressPercent = ${OLD_EPAK_PROGRESS}
WHERE id = ${EPAK_ID};

-- Restore Signer to Pending
UPDATE epak_workflowstate_signer 
SET status = 'Pending',
    progressPercent = 0
WHERE id = ${SIGNER_ID};

-- Delete the Document Activity record we inserted
DELETE FROM documentactivity WHERE id = ${DOC_ACTIVITY_ID};

-- Delete the EPak Activity record we inserted
DELETE FROM epakactivity WHERE id = ${EPAK_ACTIVITY_ID};

-- Note: docuseraction is NOT reverted because actedOn cannot be NULL
-- The EPak will be in Pending state, which is sufficient for rollback

-- Show results
SELECT 'EPak rolled back successfully!' as Status;

-- Commit the rollback
COMMIT;
ROLLBACK_SQL

print_success "Rollback script saved to: ${ROLLBACK_FILE}"

# Show success and rollback info
print_header "SUCCESS!"
print_success "EPak #${EPAK_ID} has been completed successfully!"
echo ""
print_info "Rollback script saved at:"
echo -e "  ${BOLD}${ROLLBACK_FILE}${NC}"
echo ""
print_warning "To undo this change, run:"
echo -e "  ${BOLD}mysql -h${DB_HOST} -u${DB_USER} -p${DB_PASS} ${DB_NAME} < ${ROLLBACK_FILE}${NC}"
echo ""

