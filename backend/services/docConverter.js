// DOCX -> PDF conversion chain. Preserves the original company formatting when a converter is available:
//   1. LibreOffice (soffice) if installed   2. Microsoft Word via COM (Windows)   3. text-only fallback (handled by caller)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const SOFFICE_CANDIDATES = [
  process.env.SOFFICE_PATH,
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  '/usr/bin/soffice', '/usr/local/bin/soffice', '/Applications/LibreOffice.app/Contents/MacOS/soffice',
].filter(Boolean);

const run = (file, args, opts = {}) => new Promise((resolve, reject) => {
  execFile(file, args, { timeout: 90000, windowsHide: true, ...opts }, (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(stdout)));
});

async function viaLibreOffice(docx, outPdf) {
  const soffice = SOFFICE_CANDIDATES.find((p) => fs.existsSync(p));
  if (!soffice) throw new Error('LibreOffice not installed');
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cih-lo-'));
  try {
    await run(soffice, ['--headless', '--convert-to', 'pdf', '--outdir', outDir, docx]);
    const produced = path.join(outDir, path.basename(docx).replace(/\.docx$/i, '.pdf'));
    fs.copyFileSync(produced, outPdf);
  } finally { fs.rmSync(outDir, { recursive: true, force: true }); }
}

async function viaWord(docx, outPdf) {
  if (process.platform !== 'win32') throw new Error('Word COM only on Windows');
  const script = `$ErrorActionPreference='Stop'; $w=New-Object -ComObject Word.Application; $w.Visible=$false; $w.DisplayAlerts=0
try { $d=$w.Documents.Open($env:CIH_IN,$false,$true); $d.ExportAsFixedFormat($env:CIH_OUT,17); $d.Close(0) } finally { $w.Quit() }`;
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { env: { ...process.env, CIH_IN: docx, CIH_OUT: outPdf } });
  if (!fs.existsSync(outPdf)) throw new Error('Word did not produce a PDF');
}

async function docxToPdf(docx, outPdf) {
  const errors = [];
  for (const [name, fn] of [['LibreOffice', viaLibreOffice], ['Word', viaWord]]) {
    try { await fn(docx, outPdf); return { ok: true, engine: name }; } catch (e) { errors.push(`${name}: ${e.message.split('\n')[0]}`); }
  }
  return { ok: false, errors };
}

module.exports = { docxToPdf };
