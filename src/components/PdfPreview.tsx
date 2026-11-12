"use client";

import { useEffect, useRef, useState } from "react";

// pdf.js 로 샘플 PDF 를 캔버스에 그림 (CDN 없이 public/vendor 의 워커 사용)
export function PdfPreview({ url, maxPages = 1, label }: { url: string; maxPages?: number; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    const host = box.current!;
    setState("loading");
    (async () => {
      try {
        // legacy 빌드: 구형 휴대전화 브라우저에서도 동작하도록 폴리필 포함
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
        const doc = await pdfjs.getDocument({ url, cMapUrl: "/vendor/cmaps/", cMapPacked: true }).promise;
        const canvases: HTMLCanvasElement[] = [];
        for (let i = 1; i <= Math.min(maxPages, doc.numPages); i++) {
          const page = await doc.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const scale = Math.min(2.5, (Math.max(host.clientWidth, 320) / base.width) * Math.min(window.devicePixelRatio || 1, 2));
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.setAttribute("role", "img");
          canvas.setAttribute("aria-label", `${label} ${i}쪽`);
          await page.render({ canvas, viewport }).promise;
          canvases.push(canvas);
        }
        if (cancelled) return;
        host.replaceChildren(...canvases);
        setState("ready");
      } catch (e) {
        console.error(e);
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, maxPages, label]);

  return (
    <div className="pdf" data-state={state}>
      <div ref={box} className="pdf__pages" />
      {state === "loading" ? <p className="pdf__msg">샘플을 불러오고 있습니다.</p> : null}
      {state === "error" ? (
        <p className="pdf__msg">
          미리보기를 표시하지 못했습니다. <a href={url} target="_blank" rel="noopener">새 창에서 샘플 열기</a>
        </p>
      ) : null}
    </div>
  );
}
