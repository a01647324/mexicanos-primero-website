const XLSX = require('xlsx');
const fs = require('fs');

const workbook = XLSX.readFile('data.xlsx');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet, {range: 3});

const subcategory = [... new Set(data.map(row => row['Subcategoría']))];
const subcategorias = {
    total: subcategory.length,
    data: subcategory
};

const content = `export const subcategorias = ${JSON.stringify(subcategorias, null, 2)};
export const data = ${JSON.stringify(data, null, 2)};`;

fs.writeFileSync('data.js', content);

console.log(`✅ Convertido: ${data.length} registros → data.js`);
console.log(`✅ Subcategorías únicas: ${subcategorias.total}`);