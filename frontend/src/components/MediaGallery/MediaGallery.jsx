import { useState, useMemo } from "react";
import FileIcon from "../MessageBubble/FileIcon";
import "./MediaGallery.css";

const API_BASE = import.meta.env.VITE_API_URL || "";

function mediaUrl(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${API_BASE}/api/media?path=${encodeURIComponent(path)}`;
}

function extractLinks(text) {
  if (!text) return [];
  const re = /https?:\/\/[^\s<>"']+/g;
  return [...new Set(text.match(re) || [])];
}

function groupByMonth(items, getDate) {
  const groups = {};
  for (const item of items) {
    const d = new Date(getDate(item));
    // Modern Thai date format for grouping label
    const key = d.toLocaleDateString("th-TH", {
      year: "numeric",
      month: "long",
    });
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}

function fmtSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ─── Tab: Photos ────────────────────────────────────────────────────────────
function PhotosTab({ messages }) {
  const [lightbox, setLightbox] = useState(null);

  const allImages = useMemo(() => {
    const imageMessages = messages.filter(
      (m) =>
        m.messageType === "image" &&
        (m.metadata?.gcsPaths?.length > 0 ||
          m.metadata?.localPaths?.length > 0),
    );
    return imageMessages.flatMap((m) => {
      const paths = m.metadata.gcsPaths || m.metadata.localPaths || [];
      return paths.map((p) => ({ url: mediaUrl(p), timestamp: m.timestamp }));
    });
  }, [messages]);

  const grouped = useMemo(
    () => groupByMonth(allImages, (i) => i.timestamp),
    [allImages],
  );

  if (allImages.length === 0) {
    return (
      <div className="mg-empty">
        <div className="mg-empty-icon">📷</div>
        <div className="mg-empty-text">ไม่มีรูปภาพในแชทนี้</div>
      </div>
    );
  }

  return (
    <>
      {Object.entries(grouped).map(([month, imgs]) => (
        <div key={month} className="mg-group">
          <div className="mg-month">{month}</div>
          <div className="mg-photo-grid">
            {imgs.map((img, i) => (
              <img
                key={i}
                src={img.url}
                className="mg-photo-thumb"
                loading="lazy"
                onClick={() => setLightbox(img.url)}
                onError={(e) => {
                  e.target.style.display = "none";
                }}
                alt="Gallery item"
              />
            ))}
          </div>
        </div>
      ))}
      {lightbox && (
        <div className="mg-lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} className="mg-lightbox-img" alt="Fullscreen" />
          <button className="mg-lightbox-close" title="ปิด">
            ✕
          </button>
        </div>
      )}
    </>
  );
}

// ─── Tab: Videos ────────────────────────────────────────────────────────────
function VideosTab({ messages }) {
  const [playing, setPlaying] = useState(null);

  const videos = useMemo(
    () =>
      messages.filter(
        (m) =>
          m.messageType === "video" &&
          (m.metadata?.gcsPath || m.metadata?.localPath),
      ),
    [messages],
  );

  const grouped = useMemo(
    () => groupByMonth(videos, (m) => m.timestamp),
    [videos],
  );

  if (videos.length === 0) {
    return (
      <div className="mg-empty">
        <div className="mg-empty-icon">🎬</div>
        <div className="mg-empty-text">ไม่มีวิดีโอในแชทนี้</div>
      </div>
    );
  }

  return (
    <>
      {Object.entries(grouped).map(([month, vids]) => (
        <div key={month} className="mg-group">
          <div className="mg-month">{month}</div>
          <div className="mg-photo-grid">
            {vids.map((m, i) => (
              <div
                key={i}
                className="mg-video-thumb"
                onClick={() =>
                  setPlaying(
                    mediaUrl(m.metadata.gcsPath || m.metadata.localPath),
                  )
                }
              >
                <video
                  src={mediaUrl(m.metadata.gcsPath || m.metadata.localPath)}
                  className="mg-video-preview"
                />

                <div className="mg-play-btn">▶</div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {playing && (
        <div className="mg-lightbox" onClick={() => setPlaying(null)}>
          <video
            src={playing}
            controls
            autoPlay
            className="mg-lightbox-video"
            onClick={(e) => e.stopPropagation()}
          />
          <button className="mg-lightbox-close" title="ปิด">
            ✕
          </button>
        </div>
      )}
    </>
  );
}

// ─── Tab: Files ─────────────────────────────────────────────────────────────
function FilesTab({ messages }) {
  const files = useMemo(
    () =>
      messages.filter(
        (m) =>
          m.messageType === "file" &&
          (m.metadata?.gcsPath || m.metadata?.localPath),
      ),
    [messages],
  );
  const grouped = useMemo(
    () => groupByMonth(files, (m) => m.timestamp),
    [files],
  );

  if (files.length === 0) {
    return (
      <div className="mg-empty">
        <div className="mg-empty-icon">📎</div>
        <div className="mg-empty-text">ไม่มีไฟล์ในแชทนี้</div>
      </div>
    );
  }

  return (
    <>
      {Object.entries(grouped).map(([month, fls]) => (
        <div key={month} className="mg-group">
          <div className="mg-month">{month}</div>
          <div className="mg-file-list">
            {fls.map((m, i) => {
              const name =
                m.metadata.fileName ||
                m.metadata.gcsPath?.split("/").pop() ||
                m.metadata.localPath?.split("/").pop() ||
                "file";
              const url = mediaUrl(m.metadata.gcsPath || m.metadata.localPath);

              const date = new Date(m.timestamp).toLocaleDateString("th-TH", {
                day: "numeric",
                month: "short",
              });
              return (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="mg-file-row"
                >
                  <FileIcon fileName={name} size={36} />
                  <div className="mg-file-info">
                    <span className="mg-file-name">{name}</span>
                    <span className="mg-file-meta">
                      {fmtSize(m.metadata.fileSize)} · {date}
                    </span>
                  </div>
                  <span className="mg-file-dl">↓</span>
                </a>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

// ─── Tab: Links ─────────────────────────────────────────────────────────────
function LinksTab({ messages }) {
  const links = useMemo(() => {
    const lks = [];
    for (const m of messages) {
      if (m.text) {
        for (const url of extractLinks(m.text)) {
          lks.push({
            url,
            timestamp: m.timestamp,
            sender: m.user?.displayName,
          });
        }
      }
    }
    return lks;
  }, [messages]);

  const grouped = useMemo(
    () => groupByMonth(links, (l) => l.timestamp),
    [links],
  );

  if (links.length === 0) {
    return (
      <div className="mg-empty">
        <div className="mg-empty-icon">🔗</div>
        <div className="mg-empty-text">ไม่มีลิ้งค์ในแชทนี้</div>
      </div>
    );
  }

  return (
    <>
      {Object.entries(grouped).map(([month, lnks]) => (
        <div key={month} className="mg-group">
          <div className="mg-month">{month}</div>
          <div className="mg-file-list">
            {lnks.map((l, i) => {
              let domain = "";
              try {
                domain = new URL(l.url).hostname;
              } catch {}
              const date = new Date(l.timestamp).toLocaleDateString("th-TH", {
                day: "numeric",
                month: "short",
              });
              return (
                <a
                  key={i}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mg-file-row"
                >
                  <div className="mg-link-icon-box">🔗</div>
                  <div className="mg-file-info">
                    <span className="mg-file-name mg-link-url">{l.url}</span>
                    <span className="mg-file-meta">
                      {domain} · {l.sender} · {date}
                    </span>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

// ─── Main MediaGallery ────────────────────────────────────────────────────────
const TABS = [
  { id: "photo", label: "รูปภาพ" },
  { id: "video", label: "วิดีโอ" },
  { id: "file", label: "ไฟล์" },
  { id: "link", label: "ลิ้งค์" },
];

export default function MediaGallery({ messages, onClose }) {
  const [tab, setTab] = useState("photo");

  return (
    <div className="mg-panel">
      <div className="mg-header">
        <span className="mg-title">สื่อ ไฟล์ และลิ้งค์</span>
        <button className="mg-close-btn" onClick={onClose} title="ปิด">
          ✕
        </button>
      </div>

      <div className="mg-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`mg-tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mg-body">
        {tab === "photo" && <PhotosTab messages={messages} />}
        {tab === "video" && <VideosTab messages={messages} />}
        {tab === "file" && <FilesTab messages={messages} />}
        {tab === "link" && <LinksTab messages={messages} />}
      </div>
    </div>
  );
}
