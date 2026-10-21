"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Summary } from "@/lib/storage";
import { summaryCardSvg, summaryCsv, tradesCsv } from "@/lib/game-export";

function download(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
}
async function cardFile(summary: Summary, name: string) {
  const source = URL.createObjectURL(
    new Blob([summaryCardSvg(summary)], {
      type: "image/svg+xml;charset=utf-8",
    }),
  );
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not render card"));
      image.src = source;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 780;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image export unavailable");
    context.drawImage(image, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Could not export card"))),
        "image/png",
      ),
    );
    return new File([blob], name, { type: "image/png" });
  } finally {
    URL.revokeObjectURL(source);
  }
}
export default function SummaryExport({ summary }: { summary: Summary }) {
  const [preview, setPreview] = useState(false);
  const [card, setCard] = useState<{ file: File; url: string } | null>(null);
  const [files, setFiles] = useState<{ name: string; url: string }[]>([]);
  const [message, setMessage] = useState("");
  const [imageError, setImageError] = useState(false);
  const urls = useRef<string[]>([]);
  const base = `price-action-${summary.date.replace(/[^0-9]/g, "").slice(0, 14)}-${summary.id.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 8)}`;
  useEffect(() => {
    setCard(null);
    setPreview(false);
    setFiles([]);
    setMessage("");
    setImageError(false);
    return () => {
      urls.current.forEach((url) => URL.revokeObjectURL(url));
      urls.current = [];
    };
  }, [summary, base]);
  useEffect(() => {
    if (!preview || (card && card.file.name === `${base}.png`)) return;
    let live = true;
    setImageError(false);
    // Render only when requested; the separate Share click retains native activation.
    cardFile(summary, `${base}.png`)
      .then((file) => {
        if (!live) return;
        const url = URL.createObjectURL(file);
        urls.current.push(url);
        setCard({ file, url });
      })
      .catch(() => {
        if (live) setImageError(true);
      });
    return () => {
      live = false;
    };
    // card is the cached result, not a trigger for another render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, summary, base]);
  const share = async () => {
    if (!card) return;
    try {
      if (navigator.canShare?.({ files: [card.file] }) && navigator.share) {
        await navigator.share({
          files: [card.file],
          title: "My Price Action practice results",
        });
        setMessage("");
      } else {
        setMessage(
          "File sharing is unavailable in this browser. Use Download, or touch and hold the image to see your browser's image options.",
        );
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setMessage(
        "Sharing is unavailable. Use Download, or touch and hold the image for more options.",
      );
    }
  };
  const exportCsv = () => {
    files.forEach((file) => URL.revokeObjectURL(file.url));
    const next = [
      { name: `${base}-summary.csv`, content: summaryCsv(summary) },
      { name: `${base}-trades.csv`, content: tradesCsv(summary) },
    ].map(({ name, content }) => ({
      name,
      url: URL.createObjectURL(
        new Blob([content], { type: "text/csv;charset=utf-8" }),
      ),
    }));
    urls.current.push(...next.map((f) => f.url));
    setFiles(next);
    next.forEach((f) => download(f.url, f.name));
    setMessage(
      "CSV downloads requested. If your browser blocks a file, use the links below. Prices and quantities are normalized; real-price columns are included when source metadata is available. Final exit is the last fill; net P&L includes all partial closes and fees.",
    );
  };
  return (
    <div className="summary-export">
      <button
        className="secondary-button"
        onClick={() => {
          setMessage("");
          setPreview(true);
        }}
      >
        Share card
      </button>
      <button className="secondary-button" onClick={exportCsv}>
        Export CSVs
      </button>
      {preview && (
        <CardPreview close={() => setPreview(false)}>
          {card ? (
            <img
              className="share-card-image"
              src={card.url}
              alt="Price Action game summary card with balance, performance metrics and equity curve"
            />
          ) : (
            <p role="status">
              {imageError
                ? "Could not prepare the card. Close this preview and try again."
                : "Preparing your card…"}
            </p>
          )}
          <div className="share-card-actions">
            <button className="primary-button" disabled={!card} onClick={share}>
              Share
            </button>
            <button
              className="secondary-button"
              disabled={!card}
              onClick={() => {
                if (card) {
                  download(card.url, card.file.name);
                  setMessage(
                    "Download requested. On iPhone/iPad this may open a file preview. To save to Photos, use Share → Save Image, or touch and hold the card for image options.",
                  );
                }
              }}
            >
              Download
            </button>
          </div>
          <p className="input-help">
            iPhone / iPad: tap Share, then Save Image to save to Photos when
            available. Download saves a file and may open a preview. You can
            also touch and hold the card for image options.
          </p>
          {message && <p role="status">{message}</p>}
        </CardPreview>
      )}
      {files.map((f) => (
        <a key={f.name} href={f.url} download={f.name}>
          {f.name.endsWith("-summary.csv")
            ? "Download summary CSV"
            : "Download trades CSV"}
        </a>
      ))}
      {message && !preview && <p role="status">{message}</p>}
    </div>
  );
}

function CardPreview({
  close,
  children,
}: {
  close: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = dialog.current;
    node?.showModal();
    return () => {
      node?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="share-card-dialog"
      aria-labelledby="share-card-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="share-card-content">
        <div className="share-card-heading">
          <h3 id="share-card-title">Preview your card</h3>
          <button
            className="icon-button"
            aria-label="Close card preview"
            onClick={close}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="m6 6 12 12M6 18 18 6" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
