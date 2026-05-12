import jsPDF from 'jspdf';

export interface PdfFooterOptions {
  exportedBy?: string | null;
  generatedAt?: Date;
}

function formatTs(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function applyPdfFooter(doc: jsPDF, opts: PdfFooterOptions = {}): void {
  const generatedAt = formatTs(opts.generatedAt ?? new Date());
  const exportedBy = (opts.exportedBy ?? '').toString().trim();
  const footer = exportedBy
    ? `Generated: ${generatedAt} — Exported by: ${exportedBy}`
    : `Generated: ${generatedAt}`;

  const pageCount = doc.getNumberOfPages();
  const pageSize = doc.internal.pageSize;
  const pageWidth = typeof pageSize.getWidth === 'function' ? pageSize.getWidth() : (pageSize as any).width;
  const pageHeight = typeof pageSize.getHeight === 'function' ? pageSize.getHeight() : (pageSize as any).height;

  const prevFontSize = doc.getFontSize();
  const prevTextColor = doc.getTextColor();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120);
    doc.text(footer, 14, pageHeight - 8);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
  }

  doc.setFontSize(prevFontSize);
  doc.setTextColor(prevTextColor);
}
