import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
describe("Dapodik spreadsheet compatibility",()=>{
  for(const bookType of ["xlsx","biff8","csv"] as const) it(`preserves Indonesian headers and leading-zero identifiers in ${bookType}`,()=>{
    const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([["Nama","NISN","Tanggal Lahir"],["Andi","0012345678","2010-01-02"]]),"Siswa");
    const bytes=XLSX.write(book,{type:"buffer",bookType});const result=XLSX.read(bytes,{type:"buffer",raw:true});
    const rows=XLSX.utils.sheet_to_json(result.Sheets[result.SheetNames[0]!]!,{raw:true});
    expect(rows[0]).toEqual({Nama:"Andi",NISN:"0012345678","Tanggal Lahir":"2010-01-02"});
  });
});
