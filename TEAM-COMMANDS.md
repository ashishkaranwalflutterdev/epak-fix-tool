# EPak Tool - Essential Commands for Team

## 🚀 Start the Tool

```bash
cd web-terminal
npm start
```

Open browser: http://localhost:3000

## 📋 Method 1: CSV Batch Processing (Simple)

### Connect to Database
```
connect localhost msb your_password msb
```

### Upload & Process CSV
```
batch
```
Then click "Batch CSV" button and upload your CSV file with EPak operations.

---

## 📁 Method 2: Automated Batch Processing (Advanced)

### Step 1: Check Available Batches
```
batches
```

### Step 2: Generate Fix Sheet (Process PDFs)
```
process batch-1
```
This will:
- Read corrupted ePak PDFs
- Extract Aadhaar certificate data
- Generate SQL fix commands
- Create fix sheet CSV

### Step 3: Execute Fix Operations
```
execute batch-1
```
This will:
- Load the generated fix sheet
- **OPTION: Export SQL to file for CMR** ✨ NEW!
- Process each ePak with confirmation
- Execute SQL operations in transactions
- Show summary report

#### 📄 Export SQL for CMR (Change Management Request)
When you run `execute batch-1`, you'll get an option:
```
1. Export SQL to file (for CMR/review)
2. Continue to execution
```

Choose option **1** to:
- Generate a formatted SQL file with all queries
- File saved in: `batch-job-sheets/batch-X-SQL-Export-TIMESTAMP.txt`
- Share this file with infrastructure team for CMR approval
- Execute later after approval

---

## That's It! 🎉

**Two main command workflows:**
1. `batch` → Upload CSV → Process
2. `batches` → `process batch-X` → `execute batch-X`



