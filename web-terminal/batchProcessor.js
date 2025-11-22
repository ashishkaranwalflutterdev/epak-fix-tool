const fs = require('fs');
const path = require('path');

class BatchProcessor {
    constructor(dataSourcePath) {
        this.dataSourcePath = dataSourcePath;
        this.corruptedEpaksPath = path.join(dataSourcePath, 'corrupted-epaks');
        this.fixSheetsPath = path.join(dataSourcePath, 'fix-sheets');
        
        // Ensure directories exist
        this.ensureDirectories();
    }
    
    ensureDirectories() {
        const dirs = [
            path.join(this.corruptedEpaksPath, 'to-process'),
            path.join(this.corruptedEpaksPath, 'processed'),
            path.join(this.fixSheetsPath, 'to-process'),
            path.join(this.fixSheetsPath, 'processed')
        ];
        
        dirs.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }
    
    /**
     * List all batches ready for fix sheet generation
     */
    listPendingBatches() {
        const toProcessPath = path.join(this.corruptedEpaksPath, 'to-process');
        
        if (!fs.existsSync(toProcessPath)) {
            return [];
        }
        
        const batches = fs.readdirSync(toProcessPath)
            .filter(item => {
                const itemPath = path.join(toProcessPath, item);
                return fs.statSync(itemPath).isDirectory();
            })
            .map(batchName => {
                const batchPath = path.join(toProcessPath, batchName);
                const files = fs.readdirSync(batchPath);
                const csvFile = files.find(f => f.endsWith('.csv'));
                const pdfFiles = files.filter(f => f.endsWith('.pdf'));
                
                return {
                    name: batchName,
                    path: batchPath,
                    csvFile: csvFile ? path.join(batchPath, csvFile) : null,
                    pdfCount: pdfFiles.length,
                    ready: !!csvFile && pdfFiles.length > 0
                };
            });
        
        return batches;
    }
    
    /**
     * List all batches ready for execution
     */
    listReadyForExecution() {
        const toProcessPath = path.join(this.fixSheetsPath, 'to-process');
        
        if (!fs.existsSync(toProcessPath)) {
            return [];
        }
        
        const batches = fs.readdirSync(toProcessPath)
            .filter(item => {
                const itemPath = path.join(toProcessPath, item);
                return fs.statSync(itemPath).isDirectory();
            })
            .map(batchName => {
                const batchPath = path.join(toProcessPath, batchName);
                const files = fs.readdirSync(batchPath);
                const fixSheets = files.filter(f => f.startsWith('fix-sheet-') && f.endsWith('.csv'));
                
                return {
                    name: batchName,
                    path: batchPath,
                    fixSheets: fixSheets.map(f => path.join(batchPath, f)),
                    ready: fixSheets.length > 0
                };
            });
        
        return batches;
    }
    
    /**
     * Move batch to processed after fix sheet generation
     */
    moveBatchToProcessed(batchName, type = 'corrupted-epaks') {
        const sourcePath = path.join(
            type === 'corrupted-epaks' ? this.corruptedEpaksPath : this.fixSheetsPath,
            'to-process',
            batchName
        );
        
        const destPath = path.join(
            type === 'corrupted-epaks' ? this.corruptedEpaksPath : this.fixSheetsPath,
            'processed',
            batchName
        );
        
        if (fs.existsSync(sourcePath)) {
            // If destination exists, append timestamp
            let finalDestPath = destPath;
            if (fs.existsSync(destPath)) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                finalDestPath = `${destPath}-${timestamp}`;
            }
            
            fs.renameSync(sourcePath, finalDestPath);
            return finalDestPath;
        }
        
        return null;
    }
    
    /**
     * Create fix sheet output directory
     */
    createFixSheetBatch(batchName) {
        const batchPath = path.join(this.fixSheetsPath, 'to-process', batchName);
        
        if (!fs.existsSync(batchPath)) {
            fs.mkdirSync(batchPath, { recursive: true });
        }
        
        return batchPath;
    }
    
    /**
     * Get fix sheet output path for a batch
     */
    getFixSheetPath(batchName) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const batchPath = this.createFixSheetBatch(batchName);
        return path.join(batchPath, `fix-sheet-${timestamp}.csv`);
    }
}

module.exports = BatchProcessor;



