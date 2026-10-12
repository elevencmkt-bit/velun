// Extração do texto do PDF, no NAVEGADOR.
//
// Duas razões pra não fazer isso no servidor:
//
// 1. Técnica: o leitor de PDF resolve dependências com require() de nome
//    variável. Empacotado pelo Next ele quebra; marcado como externo, o
//    Netlify não consegue carregá-lo dentro da função. O mesmo pacote
//    tem um build de navegador que é feito exatamente pra ser
//    empacotado, e é esse que roda aqui.
//
// 2. De produto: o extrato bancário nunca sai da máquina de quem
//    importa. O servidor recebe o texto já extraído, não o arquivo — o
//    que é a resposta certa num produto que vende privacidade.

/** O worker é copiado pra /public no build (scripts/copy-pdf-worker.mjs). */
const WORKER_URL = "/pdf.worker.mjs";

export async function extractPdfText(file: File): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  PDFParse.setWorker(WORKER_URL);

  const data = new Uint8Array(await file.arrayBuffer());
  const parser = new PDFParse({ data });
  try {
    return (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }
}
