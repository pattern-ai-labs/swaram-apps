import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

// Match the worker to the bundled pdfjs version (no local worker bundling needed).
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function PdfViewer({ source }: { source: File | string }) {
  const [numPages, setNumPages] = useState(0);
  const [width, setWidth] = useState(560);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(240, el.clientWidth - 8)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className="pdf-scroll">
      <Document
        file={source}
        onLoadSuccess={(d: { numPages: number }) => setNumPages(d.numPages)}
        loading={<p className="muted">Loading PDF…</p>}
        error={<p className="muted">Couldn't render the PDF — switch to Text.</p>}
      >
        {Array.from({ length: numPages }, (_, i) => (
          <Page
            key={i}
            pageNumber={i + 1}
            width={width}
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        ))}
      </Document>
    </div>
  );
}
