// Rodar: npx tsx scripts/check-file-import.ts
//
// Arquivos de exemplo INVENTADOS (lojas, valores e contas fictícios),
// no formato que os bancos exportam.
import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";
import { decodeText, FileReadError } from "../src/lib/import/file-statement";
import { ofxAmountCents, parseOfx } from "../src/lib/import/ofx";
import {
  applyMapping,
  guessMapping,
  mappingFits,
  parseAmount,
  parseCsv,
  parseDate,
  readTable,
  tableSignature,
} from "../src/lib/import/table";

// --- OFX 1 (SGML), conta corrente americana ---------------------------------
const sgml = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252

<OFX>
<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS><DTSERVER>20260901120000</SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><TRNUID>1<STMTRS>
<CURDEF>USD
<BANKACCTFROM><BANKID>000000000<ACCTID>0000001234<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260801
<DTEND>20260831
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260803120000[-5:EST]
<TRNAMT>-42.17
<FITID>A1
<NAME>CORNER GROCERY #12 SPRINGFI
<MEMO>CORNER GROCERY #12 SPRINGFIELD
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260805
<TRNAMT>2500.00
<FITID>A2
<NAME>ACME PAYROLL
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260805
<TRNAMT>-42.17
<FITID>A3
<NAME>CORNER GROCERY #12 SPRINGFI
<MEMO>CORNER GROCERY #12 SPRINGFIELD
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260805
<TRNAMT>-42.17
<FITID>A3
<NAME>REPETIDO NO ARQUIVO
</STMTTRN>
<STMTTRN>
<TRNTYPE>CHECK
<DTPOSTED>20260810
<TRNAMT>-150
<FITID>A4
<CHECKNUM>1001
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260812
<TRNAMT>-9.99
<FITID>A5
<NAME>STREAMCO
<MEMO>RECURRING CARD PURCHASE
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>3297.67<DTASOF>20260831</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>
`;
{
  const s = parseOfx(sgml);
  assert.equal(s.kind, "bank");
  assert.equal(s.periodStart, "2026-08-01");
  assert.equal(s.periodEnd, "2026-08-12");
  assert.deepEqual(s.balance, { cents: 329767, date: "2026-08-31" });
  // A3 repetido entra uma vez.
  assert.equal(s.transactions.length, 5);
  assert.deepEqual(s.transactions[0], {
    date: "2026-08-03",
    description: "CORNER GROCERY #12 SPRINGFIELD",
    amountCents: 4217,
    direction: "out",
    mcc: null,
  });
  assert.equal(s.transactions[1].direction, "in");
  assert.equal(s.transactions[1].amountCents, 250000);
  assert.equal(s.transactions[3].description, "Cheque 1001");
  assert.equal(s.transactions[4].description, "STREAMCO RECURRING CARD PURCHASE");
}

// --- OFX 2 (XML), cartão --------------------------------------------------
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?OFX OFXHEADER="200" VERSION="220" SECURITY="NONE"?>
<OFX>
  <CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS>
    <CURDEF>USD</CURDEF>
    <CCACCTFROM><ACCTID>XXXXXXXXXXXX9999</ACCTID></CCACCTFROM>
    <BANKTRANLIST>
      <DTSTART>20260715000000</DTSTART><DTEND>20260814000000</DTEND>
      <STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260716000000</DTPOSTED><TRNAMT>-23.40</TRNAMT><FITID>c1</FITID><NAME>PIZZA PLACE &amp; GRILL</NAME><SIC>5812</SIC></STMTTRN>
      <STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20260720000000</DTPOSTED><TRNAMT>500.00</TRNAMT><FITID>c2</FITID><NAME>PAYMENT THANK YOU</NAME></STMTTRN>
      <STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260801000000</DTPOSTED><TRNAMT>-1,234.50</TRNAMT><FITID>c3</FITID><NAME>FURNITURE OUTLET</NAME></STMTTRN>
    </BANKTRANLIST>
    <LEDGERBAL><BALAMT>-757.90</BALAMT><DTASOF>20260814000000</DTASOF></LEDGERBAL>
  </CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1>
</OFX>`;
{
  const s = parseOfx(xml);
  assert.equal(s.kind, "card");
  assert.equal(s.periodStart, "2026-07-15");
  assert.equal(s.transactions[0].description, "PIZZA PLACE & GRILL");
  assert.equal(s.transactions[0].mcc, "5812");
  assert.equal(s.transactions[1].direction, "in");
  assert.equal(s.transactions[2].amountCents, 123450);
  assert.deepEqual(s.balance, { cents: -75790, date: "2026-08-14" });
}

// --- OFX de banco brasileiro: Windows-1252, vírgula, tudo positivo --------
const br = `OFXHEADER:100
DATA:OFXSGML
CHARSET:1252

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL
<BANKTRANLIST><DTSTART>20260901<DTEND>20260930
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260902<TRNAMT>89,90<FITID>1<MEMO>PAGTO CARTÃO PADARIA SÃO JOÃO
</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260905<TRNAMT>1.500,00<FITID>2<MEMO>PIX RECEBIDO FULANO
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
{
  const bytes = new Uint8Array([...br].map((ch) => ch.charCodeAt(0))) // bytes Latin-1;
  const text = decodeText(bytes);
  assert.ok(text.includes("CARTÃO"), "lê Windows-1252");
  const s = parseOfx(text);
  assert.equal(s.transactions[0].direction, "out");
  assert.equal(s.transactions[0].amountCents, 8990);
  assert.equal(s.transactions[1].direction, "in");
  assert.equal(s.transactions[1].amountCents, 150000);
  assert.equal(s.balance, null);
}

assert.equal(ofxAmountCents("-12.5"), -1250);
assert.equal(ofxAmountCents("1.234.567"), 123456700);
assert.equal(ofxAmountCents("+0.07"), 7);
assert.throws(() => parseOfx("Data,Valor\n01/01/2026,10"), FileReadError);
assert.throws(
  () =>
    parseOfx(
      "<OFX><STMTRS><BANKTRANLIST><STMTTRN><TRNAMT>-1<DTPOSTED>20260101<FITID>1</STMTTRN></BANKTRANLIST></STMTRS><STMTRS><BANKTRANLIST><STMTTRN><TRNAMT>-1<DTPOSTED>20260101<FITID>2</STMTTRN></BANKTRANLIST></STMTRS></OFX>",
    ),
  /mais de uma conta/,
);

// --- Datas e valores ------------------------------------------------------
assert.equal(parseDate("03/08/2026", "dmy"), "2026-08-03");
assert.equal(parseDate("03/08/2026", "mdy"), "2026-03-08");
assert.equal(parseDate("2026-08-03", "mdy"), "2026-08-03");
assert.equal(parseDate("3/8/26", "dmy"), "2026-08-03");
assert.equal(parseDate("15 ago 2026", "dmy"), "2026-08-15");
assert.equal(parseDate("15-Aug-26", "mdy"), "2026-08-15");
assert.equal(parseDate("Aug 15, 2026", "mdy"), "2026-08-15");
assert.equal(parseDate("46249", "dmy"), "2026-08-15"); // série do Excel
assert.equal(parseDate("31/02/2026", "dmy"), null);
assert.equal(parseDate("Saldo", "dmy"), null);

assert.equal(parseAmount("R$ 1.234,56", ","), 123456);
assert.equal(parseAmount("-R$ 12,50", ","), -1250);
assert.equal(parseAmount("12,50-", ","), -1250);
assert.equal(parseAmount("123,45 D", ","), -12345);
assert.equal(parseAmount("123,45 C", ","), 12345);
assert.equal(parseAmount("($1,234.56)", "."), -123456);
assert.equal(parseAmount("-9.99", "."), -999);
assert.equal(parseAmount("", "."), null);
assert.equal(parseAmount("abc", "."), null);

// --- CSV americano: Posting Date / Description / Amount -------------------
const usCsv = `Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #
DEBIT,08/14/2026,"CORNER GROCERY, SPRINGFIELD",-42.17,DEBIT_CARD,1210.33,,
CREDIT,08/13/2026,ACME PAYROLL,2500.00,ACH_CREDIT,1252.50,,
DEBIT,08/02/2026,STREAMCO,-9.99,DEBIT_CARD,-1247.50,,
`;
{
  const rows = parseCsv(usCsv);
  assert.equal(rows[1][2], "CORNER GROCERY, SPRINGFIELD");
  const m = guessMapping(rows, { currency: "USD", isCard: false });
  assert.equal(m.headerRow, 0);
  assert.equal(m.date, 1);
  assert.equal(m.description, 2);
  assert.equal(m.amount, 3);
  assert.equal(m.dateFormat, "mdy");
  assert.equal(m.decimal, ".");
  const s = applyMapping({ format: "csv", rows }, m);
  assert.equal(s.transactions.length, 3);
  assert.equal(s.periodStart, "2026-08-02");
  assert.equal(s.periodEnd, "2026-08-14");
  assert.deepEqual(s.transactions[0], {
    date: "2026-08-14",
    description: "CORNER GROCERY, SPRINGFIELD",
    amountCents: 4217,
    direction: "out",
    mcc: null,
  });
  assert.equal(tableSignature(rows, 0), "details|posting date|description|amount|type|balance|check or slip");
}

// --- CSV brasileiro: ; e linhas de saldo no meio ---------------------------
const brCsv = `Extrato de conta corrente
Agência;0001;Conta;12345-6

Data;Lançamento;Valor (R$);Saldo (R$)
01/09/2026;SALDO ANTERIOR;;1.000,00
02/09/2026;PIX ENVIADO MERCADINHO BOM PRECO;-89,90;910,10
05/09/2026;PIX RECEBIDO CICLANO;1.500,00;2.410,10
05/09/2026;SALDO DO DIA;;2.410,10
13/09/2026;TARIFA PACOTE;-12,00;2.398,10
`;
{
  const rows = parseCsv(brCsv);
  const m = guessMapping(rows, { currency: "BRL", isCard: false });
  assert.equal(m.headerRow, 2);
  assert.equal(m.date, 0);
  assert.equal(m.description, 1);
  assert.equal(m.amount, 2);
  assert.equal(m.dateFormat, "dmy");
  assert.equal(m.decimal, ",");
  const s = applyMapping({ format: "csv", rows }, m);
  assert.equal(s.transactions.length, 3);
  assert.equal(s.skipped, 2);
  assert.equal(s.transactions[1].amountCents, 150000);
  assert.equal(s.transactions[1].direction, "in");
  assert.equal(s.transactions[2].date, "2026-09-13");
}

// --- Débito e crédito em colunas separadas ---------------------------------
const dcCsv = `Date,Description,Debit,Credit,Balance
2026-08-01,Coffee Spot,4.50,,95.50
2026-08-02,Refund Shop,,10.00,105.50
`;
{
  const rows = parseCsv(dcCsv);
  const m = guessMapping(rows, { currency: "USD", isCard: false });
  assert.equal(m.amount, null);
  assert.equal(m.debit, 2);
  assert.equal(m.credit, 3);
  assert.equal(m.dateFormat, "ymd");
  const s = applyMapping({ format: "csv", rows }, m);
  assert.deepEqual(
    s.transactions.map((t) => [t.direction, t.amountCents]),
    [["out", 450], ["in", 1000]],
  );
}

// --- Fatura em CSV: compra positiva ----------------------------------------
const cardCsv = `date,title,amount
2026-09-03,Padaria Exemplo,18.90
2026-09-04,Loja Fictícia - Parcela 2/3,120.00
2026-09-10,Pagamento recebido,-500.00
`;
{
  const rows = parseCsv(cardCsv);
  const m = guessMapping(rows, { currency: "BRL", isCard: true });
  assert.equal(m.outIsNegative, false);
  assert.equal(m.description, 1);
  const s = applyMapping({ format: "csv", rows }, m);
  assert.deepEqual(
    s.transactions.map((t) => [t.direction, t.amountCents]),
    [["out", 1890], ["out", 12000], ["in", 50000]],
  );
  // A mesma fatura num cadastro de conta (não cartão): sinal padrão.
  assert.equal(guessMapping(rows, { currency: "BRL", isCard: false }).outIsNegative, true);
}

// --- Sem cabeçalho ----------------------------------------------------------
{
  const rows = parseCsv("03/08/2026,MERCADO X,-10.00\n04/08/2026,SALARIO,100.00\n");
  const m = guessMapping(rows, { currency: "USD", isCard: false });
  assert.equal(m.headerRow, -1);
  assert.equal(m.date, 0);
  assert.equal(m.description, 1);
  assert.equal(m.amount, 2);
  assert.equal(applyMapping({ format: "csv", rows }, m).transactions.length, 2);
  assert.equal(tableSignature(rows, -1), "cols:3");
}

// --- .xlsx ------------------------------------------------------------------
{
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="s"><v>2</v></c></row>
<row r="2"><c r="A2" s="1"><v>46249</v></c><c r="B2" t="s"><v>3</v></c><c r="D2"><v>-12.300000000000001</v></c></row>
<row r="3"><c r="A3" s="1"><v>46250</v></c><c r="B3" t="inlineStr"><is><t>Salário &amp; bônus</t></is></c><c r="D3"><v>3000</v></c></row>
</sheetData></worksheet>`;
  const shared = `<?xml version="1.0" encoding="UTF-8"?><sst><si><t>Data</t></si><si><t>Descrição</t></si><si><r><t>Va</t></r><r><t>lor</t></r></si><si><t>Mercado Fictício</t></si></sst>`;
  const workbook = `<workbook><sheets><sheet name="Extrato" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const rels = `<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>`;
  const zip = zipSync({
    "xl/workbook.xml": strToU8(workbook),
    "xl/_rels/workbook.xml.rels": strToU8(rels),
    "xl/sharedStrings.xml": strToU8(shared),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  });
  const table = readTable("extrato.xlsx", zip, decodeText);
  assert.equal(table.format, "xlsx");
  assert.deepEqual(table.rows[0], ["Data", "Descrição", "", "Valor"]);
  assert.deepEqual(table.rows[1], ["46249", "Mercado Fictício", "", "-12.30"]);
  const m = guessMapping(table.rows, { currency: "BRL", isCard: false });
  assert.equal(m.amount, 3);
  assert.equal(m.decimal, ".");
  assert.ok(mappingFits(table.rows, m));
  const s = applyMapping(table, m);
  assert.deepEqual(
    s.transactions.map((t) => [t.date, t.description, t.direction, t.amountCents]),
    [
      ["2026-08-15", "Mercado Fictício", "out", 1230],
      ["2026-08-16", "Salário & bônus", "in", 300000],
    ],
  );
  assert.throws(() => readTable("x.xlsx", new Uint8Array([1, 2, 3]), decodeText), FileReadError);
}

// Mapeamento que não serve mais (arquivo com menos colunas).
assert.equal(
  mappingFits(parseCsv("a,b\n1,2\n"), {
    headerRow: 0, date: 0, description: 1, amount: 4, debit: null, credit: null,
    dateFormat: "dmy", decimal: ",", outIsNegative: true,
  }),
  false,
);

console.log("ok: OFX, CSV e XLSX");
