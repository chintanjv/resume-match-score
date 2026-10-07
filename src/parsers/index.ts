import { CONFIG } from '../engine/config';

type ParseErrorKind = 'too-large' | 'unsupported' | 'scanned' | 'unreadable' | 'empty';

export class ResumeParseError extends Error {
  constructor(
    readonly kind: ParseErrorKind,
    message: string,
  ) {
    super(message);
  }
}

interface ParsedFile {
  text: string;
  kind: 'pdf' | 'docx' | 'txt';
  pages?: number;
}

function kindOf(file: File): ParsedFile['kind'] | null {
  const name = file.name.toLowerCase();
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (
    name.endsWith('.docx') ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
    return 'docx';
  if (file.type.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.md')) return 'txt';
  return null;
}

/** Extract text from a resume file. Parsers load only when a file of that type arrives. */
export async function extractText(file: File): Promise<ParsedFile> {
  if (file.size > CONFIG.limits.maxFileBytes) {
    throw new ResumeParseError(
      'too-large',
      'That file is over 5 MB. Try exporting a lighter PDF or a DOCX.',
    );
  }
  const kind = kindOf(file);
  if (!kind) throw new ResumeParseError('unsupported', 'Please use a PDF, DOCX or TXT file.');

  let result: ParsedFile;
  try {
    if (kind === 'pdf') {
      const { pdfToText } = await import('./pdf');
      result = { kind, ...(await pdfToText(await file.arrayBuffer())) };
    } else if (kind === 'docx') {
      const { docxToText } = await import('./docx');
      result = { kind, text: await docxToText(await file.arrayBuffer()) };
    } else {
      result = { kind, text: await file.text() };
    }
  } catch {
    throw new ResumeParseError(
      'unreadable',
      'We couldn’t read that file. It may be password-protected or damaged.',
    );
  }

  const chars = result.text.replace(/\s+/g, '').length;
  if (kind === 'pdf' && chars < CONFIG.limits.minPdfChars) {
    throw new ResumeParseError(
      'scanned',
      'This PDF looks like a scanned image, so there’s no text to read.',
    );
  }
  if (chars < 40) throw new ResumeParseError('empty', 'That file seems to be empty.');
  return result;
}
