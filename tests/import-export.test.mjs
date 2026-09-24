import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import * as spreadsheet from '../src/lib/spreadsheet.ts';
import { buildStyledWorkbook } from '../src/lib/excel-export.ts';
test('import preserves formulas without cached values and A1 offsets', () => {
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,{'!ref':'B3:C4',B3:{t:'s',v:'Amount'},C3:{t:'s',v:'Total'},B4:{t:'n',v:42},C4:{t:'n',f:'B4*2'}},'Data');
  const s=spreadsheet.workbookToSheets(wb); assert.equal(s[0].rows[3][1],'42'); assert.equal(s[0].rows[3][2],'=B4*2'); assert.equal(s[0].rows[2][1],'Amount');
});
test('export retains numeric types, text identifiers and formulas', () => {
  const wb=spreadsheet.sheetsToWorkbook([{name:'S',rows:[['Value','ID','Formula'],['42','0012','=A2*2']]}]); assert.equal(wb.Sheets.S.A2.t,'n'); assert.equal(wb.Sheets.S.B2.v,'0012'); assert.equal(wb.Sheets.S.C2.f,'A2*2');
});
test('styled export preserves identifiers and enables recalculation', async () => {
  const wb=await buildStyledWorkbook([{name:'S',rows:[['ID'],['00123'],['=1+1']]}]); assert.equal(wb.getWorksheet('S').getCell('A2').value,'00123'); assert.equal(wb.calcProperties.fullCalcOnLoad,true);
});
test('single-column CSV parsing preserves all rows', () => { assert.deepEqual(spreadsheet.parseDelimited('Name\nAlice\nBob'),[['Name'],['Alice'],['Bob']]); });
