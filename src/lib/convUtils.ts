import * as XLSX from 'xlsx';

export async function csvToExcel(file: File): Promise<Blob> {
  const text = await file.text();
  const workbook = XLSX.read(text, { type: 'string' });
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export async function jsonToExcel(file: File): Promise<Blob> {
  const text = await file.text();
  const jsonData = JSON.parse(text);
  const worksheet = XLSX.utils.json_to_sheet(Array.isArray(jsonData) ? jsonData : [jsonData]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export async function jsonToCsv(file: File): Promise<Blob> {
  const text = await file.text();
  const jsonData = JSON.parse(text);
  const worksheet = XLSX.utils.json_to_sheet(Array.isArray(jsonData) ? jsonData : [jsonData]);
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  return new Blob([csv], { type: 'text/csv' });
}
