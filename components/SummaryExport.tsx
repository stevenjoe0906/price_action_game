"use client";
import { useEffect, useRef, useState } from "react";
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
  const [card, setCard] = useState<{ file: File; url: string } | null>(null);
  const [files, setFiles] = useState<{ name: string; url: string }[]>([]);
  const [message, setMessage] = useState("");
  const [imageError, setImageError] = useState(false);
  const urls = useRef<string[]>([]);
  const base = `price-action-${summary.date.replace(/[^0-9]/g, "").slice(0, 14)}-${summary.id.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 8)}`;
  useEffect(() => {
    let live = true;
    setCard(null);
    setFiles([]);
    setMessage("");
    setImageError(false);
    // Prepare before the click so native sharing retains the user's gesture.
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
      urls.current.forEach((url) => URL.revokeObjectURL(url));
      urls.current = [];
    };
  }, [summary, base]);
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
        download(card.url, card.file.name);
        setMessage("Card downloaded. Attach it to your post or message.");
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setMessage("Sharing is unavailable. Use Download image below.");
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
      <button className="secondary-button" disabled={!card} onClick={share}>
        {imageError
          ? "Image unavailable"
          : card
            ? "Share card"
            : "Preparing card…"}
      </button>
      <button className="secondary-button" onClick={exportCsv}>
        Export CSVs
      </button>
      {card && (
        <a href={card.url} download={card.file.name}>
          Download image
        </a>
      )}
      {files.map((f) => (
        <a key={f.name} href={f.url} download={f.name}>
          {f.name.endsWith("-summary.csv")
            ? "Download summary CSV"
            : "Download trades CSV"}
        </a>
      ))}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
