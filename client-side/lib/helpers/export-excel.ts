import * as XLSX from 'xlsx';

/**
 * Mengambil array objek dan mengunduhnya sebagai file Excel.
 * 
 * @param data - Array data yang akan diekspor
 * @param fileName - Nama file (tanpa ekstensi)
 * @param sheetName - Nama sheet di dalam Excel
 */
export function exportToExcel(data: any[], fileName: string, sheetName: string = 'Sheet1') {
  try {
    // Membuat worksheet baru dari data JSON
    const worksheet = XLSX.utils.json_to_sheet(data);
    
    // Membuat workbook baru
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    
    // Menghasilkan file dan memicu download di browser
    XLSX.writeFile(workbook, `${fileName}.xlsx`);
  } catch (error) {
    console.error('Export to Excel failed:', error);
    alert('Gagal mengekspor data ke Excel. Silakan coba lagi.');
  }
}
