import { useState, useEffect, useCallback } from "react";
import { formatTime, getColor, formatFileSize } from "../../utils/helpers";
import Avatar from "../Avatar/Avatar";
import VoiceMessage from "./VoiceMessage";
import FileIcon from "./FileIcon";
import "./MessageBubble.css";

const API_BASE = import.meta.env.VITE_API_URL || "";

// ─── File Accent Color (matches FileIcon brand colors) ─────────────────────────
const FILE_ACCENT = {
  pdf: "#E53935",
  doc: "#1565C0",
  docx: "#1565C0",
  xls: "#2E7D32",
  xlsx: "#2E7D32",
  ppt: "#E65100",
  pptx: "#E65100",
  txt: "#546E7A",
  csv: "#00897B",
  zip: "#F9A825",
  rar: "#F9A825",
  "7z": "#F9A825",
  tar: "#F9A825",
  gz: "#F9A825",
  mp3: "#8E24AA",
  wav: "#8E24AA",
  m4a: "#8E24AA",
  ogg: "#8E24AA",
  flac: "#8E24AA",
  mp4: "#00838F",
  mov: "#00838F",
  avi: "#00838F",
  mkv: "#00838F",
  jpg: "#5E35B1",
  jpeg: "#5E35B1",
  png: "#5E35B1",
  gif: "#5E35B1",
  webp: "#5E35B1",
  json: "#FF6F00",
  html: "#D84315",
  css: "#0277BD",
  js: "#F57F17",
  ts: "#1565C0",
  py: "#1565C0",
  java: "#C62828",
  go: "#00838F",
  md: "#424242",
};
function getFileAccent(fileName) {
  const ext = fileName?.split(".").pop()?.toLowerCase();
  return FILE_ACCENT[ext] || "#607D8B";
}

// ─── Preview Type Detector ─────────────────────────────────────────────────────
function getPreviewType(fileName) {
  const ext = fileName?.split(".").pop()?.toLowerCase();
  if (!ext) return "none";
  if (ext === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(ext))
    return "image";
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) return "video";
  if (["mp3", "wav", "m4a", "ogg", "flac"].includes(ext)) return "audio";
  if (
    [
      "txt",
      "md",
      "json",
      "js",
      "ts",
      "jsx",
      "tsx",
      "html",
      "css",
      "py",
      "java",
      "c",
      "cpp",
      "go",
      "sh",
      "yaml",
      "yml",
      "xml",
      "csv",
    ].includes(ext)
  )
    return "text";
  if (["doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(ext))
    return "office";
  return "none";
}

// ─── Text Preview ──────────────────────────────────────────────────────────────
function TextPreview({ url }) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(url)
      .then((r) => r.text())
      .then((t) => {
        setContent(t);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [url]);

  if (loading)
    return (
      <div className="media-modal-loading">
        <div className="media-modal-spinner" />
        กำลังโหลด...
      </div>
    );
  if (error)
    return (
      <div className="media-modal-loading media-modal-loading--error">
        <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
        </svg>
        {error}
      </div>
    );
  return <pre className="media-modal-text">{content}</pre>;
}

// ─── Video Thumbnail (adaptive aspect ratio) ───────────────────────────────────
const TARGET_AREA = 280 * 158;

function VideoThumb({ url, duration, onClick }) {
  const [style, setStyle] = useState({ width: "280px", aspectRatio: "16/9" });

  const handleMeta = useCallback((e) => {
    const { videoWidth: w, videoHeight: h } = e.target;
    if (!w || !h) return;
    const clamped = Math.min(
      Math.max(Math.round(Math.sqrt((TARGET_AREA * w) / h)), 130),
      360,
    );
    setStyle({ width: `${clamped}px`, aspectRatio: `${w}/${h}` });
  }, []);

  return (
    <div
      className="msg-video-thumb"
      style={style}
      role="button"
      tabIndex={0}
      onClick={onClick}
      title="กดเพื่อดูวิดีโอ"
    >
      <video
        src={url}
        preload="metadata"
        muted
        playsInline
        className="msg-video-thumb-video"
        onLoadedMetadata={handleMeta}
      />
      <div className="msg-video-thumb-overlay">
        <div className="msg-video-thumb-play">
          <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
        {duration != null && (
          <span className="msg-video-thumb-duration">
            {Math.floor(duration / 60000)}:
            {String(Math.floor((duration % 60000) / 1000)).padStart(2, "0")}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Parse text and linkify URLs ──────────────────────────────────────────────
function parseTextWithLinks(text, onLinkClick) {
  const parts = text.split(/(https?:\/\/[^\s<>"'[\]]+)/g);
  return parts.map((part, i) => {
    if (/^https?:\/\//.test(part)) {
      const url = part.replace(/[.,;:!?'")\]>]+$/, "");
      return (
        <span
          key={i}
          className="msg-link"
          onClick={(e) => {
            e.stopPropagation();
            onLinkClick(url);
          }}
          role="link"
          tabIndex={0}
          title={url}
        >
          {part}
        </span>
      );
    }
    return part;
  });
}

// ─── Link Preview Modal ────────────────────────────────────────────────────────
function LinkModal({ url, onClose }) {
  useEffect(() => {
    const fn = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  let hostname = url;
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = url;
  }

  return (
    <div className="media-modal-overlay" onClick={onClose}>
      <div className="media-modal" onClick={(e) => e.stopPropagation()}>
        <div className="media-modal-header">
          <span className="media-modal-title">
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
            </svg>
            {hostname}
          </span>
          <div className="media-modal-actions">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="media-modal-download"
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                width="13"
                height="13"
              >
                <path d="M19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z" />
              </svg>
              เปิดใน Browser
            </a>
            <button
              className="media-modal-close"
              onClick={onClose}
              aria-label="ปิด"
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                width="16"
                height="16"
              >
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          </div>
        </div>
        <div className="media-modal-body link-modal-body">
          <iframe
            src={url}
            title={url}
            className="media-modal-iframe"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        </div>
        <div className="link-modal-footer">
          <span className="link-modal-url-text">{url}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Media Modal (universal viewer) ───────────────────────────────────────────
function MediaModal({ media, onClose }) {
  useEffect(() => {
    const fn = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  const previewType = getPreviewType(media.fileName);
  const officeUrl = `https://docs.google.com/gview?url=${encodeURIComponent(media.url)}&embedded=true`;

  return (
    <div className="media-modal-overlay" onClick={onClose}>
      <div className="media-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="media-modal-header">
          <span className="media-modal-title">
            <FileIcon fileName={media.fileName} size={22} />{" "}
            {media.fileName || "ไฟล์"}
          </span>
          <div className="media-modal-actions">
            <a
              href={media.url}
              target="_blank"
              rel="noopener noreferrer"
              className="media-modal-download"
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                width="13"
                height="13"
              >
                <path d="M19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z" />
              </svg>
              เปิดใน Browser
            </a>
            <a
              href={media.url}
              download={media.fileName}
              className="media-modal-download"
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                width="13"
                height="13"
              >
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
              </svg>
              ดาวน์โหลด
            </a>
            <button
              className="media-modal-close"
              onClick={onClose}
              aria-label="ปิด"
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                width="16"
                height="16"
              >
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="media-modal-body">
          {/* Image */}
          {previewType === "image" && (
            <div className="media-modal-img-wrap">
              <img
                src={media.url}
                alt={media.fileName}
                className="media-modal-img"
              />
            </div>
          )}

          {/* Video */}
          {previewType === "video" && (
            <div className="media-modal-video-wrap">
              <video
                src={media.url}
                controls
                autoPlay
                className="media-modal-video"
              />
            </div>
          )}

          {/* Audio */}
          {previewType === "audio" && (
            <div className="media-modal-audio-wrap">
              <div className="media-modal-audio-icon">
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  width="40"
                  height="40"
                >
                  <path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z" />
                </svg>
              </div>
              <div className="media-modal-audio-name">{media.fileName}</div>
              <audio
                src={media.url}
                controls
                autoPlay
                className="media-modal-audio-player"
              />
            </div>
          )}

          {/* PDF */}
          {previewType === "pdf" && (
            <iframe
              src={media.url}
              title={media.fileName}
              className="media-modal-iframe"
            />
          )}

          {/* Text / Code */}
          {previewType === "text" && <TextPreview url={media.url} />}

          {/* Office → Google Docs Viewer */}
          {previewType === "office" && (
            <iframe
              src={officeUrl}
              title={media.fileName}
              className="media-modal-iframe"
            />
          )}

          {/* Fallback: open in browser */}
          {previewType === "none" && (
            <div className="media-modal-no-preview">
              <div className="media-modal-no-preview-icon">
                <FileIcon fileName={media.fileName} size={72} />
              </div>
              <p>ไม่สามารถแสดงตัวอย่างได้</p>
              <p className="media-modal-no-preview-hint">{media.fileName}</p>
              <a
                href={media.url}
                target="_blank"
                rel="noopener noreferrer"
                className="media-modal-dl-btn"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  width="14"
                  height="14"
                >
                  <path d="M19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z" />
                </svg>
                เปิดใน Browser
              </a>
              <a
                href={media.url}
                download={media.fileName}
                className="media-modal-dl-btn media-modal-dl-btn--secondary"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  width="14"
                  height="14"
                >
                  <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                </svg>
                ดาวน์โหลด
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function MessageBubble({ msg, prevMsg, allMessages }) {
  const [lightboxImg, setLightboxImg] = useState(null);
  const [mediaModal, setMediaModal] = useState(null);
  const [linkUrl, setLinkUrl] = useState(null);

  useEffect(() => {
    if (!lightboxImg) return;
    const fn = (e) => {
      if (e.key === "Escape") setLightboxImg(null);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [lightboxImg]);

  const openLightbox = useCallback((url) => setLightboxImg(url), []);
  const closeLightbox = useCallback(() => setLightboxImg(null), []);
  const openMedia = useCallback(
    (url, fileName) => setMediaModal({ url, fileName }),
    [],
  );
  const closeMedia = useCallback(() => setMediaModal(null), []);
  const openLink = useCallback((url) => setLinkUrl(url), []);

  if (!msg) return null;

  const getUserInfo = (m) => ({
    userId: m.userId || "unknown",
    displayName: m.user?.displayName || "Unknown",
    pictureUrl: m.user?.pictureUrl,
  });

  const currentUser = getUserInfo(msg);
  const prevUser = prevMsg ? getUserInfo(prevMsg) : null;
  const isNewSender = !prevMsg || prevUser.userId !== currentUser.userId;
  const userColor = getColor(currentUser.displayName);

  const quotedMessageId = msg.metadata?.quotedMessageId;
  const quotedMessage =
    quotedMessageId && allMessages
      ? allMessages.find((m) => m.messageId === quotedMessageId)
      : null;

  const getMinute = (ts) => {
    const d = new Date(ts);
    return `${d.getHours()}:${d.getMinutes()}`;
  };
  const isTimeBreak =
    !isNewSender &&
    prevMsg &&
    getMinute(msg.timestamp) !== getMinute(prevMsg.timestamp);

  const mediaUrl = (path) => {
    if (!path) return null;
    if (path.startsWith("http")) return path;
    return `${API_BASE}/api/media?path=${encodeURIComponent(path)}`;
  };

  return (
    <>
      <div
        className={`msg ${isNewSender ? "new" : ""} ${isTimeBreak ? "time-gap" : ""}`}
        data-id={msg.id}
      >
        {/* Avatar */}
        <div className="msg-avatar">
          {isNewSender && (
            <Avatar
              name={currentUser.displayName}
              size={40}
              pictureUrl={currentUser.pictureUrl}
            />
          )}
        </div>

        {/* Content */}
        <div className="msg-content">
          {isNewSender && (
            <div className="msg-meta">
              <span className="msg-name" style={{ color: userColor }}>
                {currentUser.displayName}
              </span>
            </div>
          )}

          <div className="msg-bubble-row">
            <div className="msg-bubble-content">
              {/* ── REPLY (Quote + Text integrated) ── */}
              {quotedMessage &&
                (() => {
                  const qColor = getColor(
                    quotedMessage.user?.displayName || "Unknown",
                  );
                  const qImgUrl =
                    quotedMessage.messageType === "image" &&
                    (quotedMessage.metadata?.gcsPaths?.[0] ||
                      quotedMessage.metadata?.localPaths?.[0])
                      ? mediaUrl(
                          quotedMessage.metadata.gcsPaths?.[0] ||
                            quotedMessage.metadata.localPaths[0],
                        )
                      : null;
                  const qName = quotedMessage.user?.displayName || "Unknown";
                  const qPreview =
                    quotedMessage.messageType === "text"
                      ? quotedMessage.text
                      : {
                          image: "📷 รูปภาพ",
                          sticker: "😊 สติกเกอร์",
                          video: "🎬 วิดีโอ",
                          audio: "🎤 เสียง",
                          file: "📎 ไฟล์",
                          location: "📍 ตำแหน่ง",
                        }[quotedMessage.messageType] || "📎 ไฟล์";

                  return (
                    <>
                      <div className="msg-reply-label">
                        <svg
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          width="10"
                          height="10"
                        >
                          <path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z" />
                        </svg>
                        {currentUser.displayName} ตอบกลับ {qName}
                      </div>
                      <div className="msg-reply-bubble">
                        <div
                          className="msg-quote"
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            const el = document.querySelector(
                              `[data-id="${quotedMessage.id}"]`,
                            );
                            if (el) {
                              el.scrollIntoView({
                                behavior: "smooth",
                                block: "center",
                              });
                              el.classList.add("highlight-quote");
                              setTimeout(
                                () => el.classList.remove("highlight-quote"),
                                2000,
                              );
                            }
                          }}
                        >
                          <div
                            className="msg-quote-accent"
                            style={{ background: qColor }}
                          />
                          <div className="msg-quote-inner">
                            <span
                              className="msg-quote-name"
                              style={{ color: qColor }}
                            >
                              {qName}
                            </span>
                            <span className="msg-quote-preview">
                              {qPreview}
                            </span>
                          </div>
                          {qImgUrl && (
                            <img
                              src={qImgUrl}
                              alt=""
                              className="msg-quote-thumb"
                            />
                          )}
                        </div>
                        {msg.messageType === "text" && (
                          <div className="msg-reply-text">
                            {msg.text
                              ? parseTextWithLinks(msg.text, openLink)
                              : "(ไม่มีข้อความ)"}
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              {/* ── TEXT (only when NOT a reply) ── */}
              {msg.messageType === "text" && !quotedMessage && (
                <div className="msg-text">
                  {msg.text
                    ? parseTextWithLinks(msg.text, openLink)
                    : "(ไม่มีข้อความ)"}
                </div>
              )}

              {/* ── IMAGES (disk storage: metadata.localPaths) ── */}
              {/* ── IMAGES ── */}
              {msg.messageType === "image" &&
                (() => {
                  const paths =
                    msg.metadata?.gcsPaths || msg.metadata?.localPaths || [];
                  const storedUrls = msg.metadata?.gcsUrls || [];
                  if (paths.length === 0) return null;
                  return (
                    <div
                      className="msg-images"
                      data-count={Math.min(paths.length, 3)}
                    >
                      {paths.map((p, i) => {
                        const url = storedUrls[i] || mediaUrl(p);
                        return (
                          <img
                            key={i}
                            src={url}
                            alt={`รูปภาพ ${i + 1}`}
                            className="msg-img"
                            loading="lazy"
                            onClick={() => openLightbox(url)}
                            onError={(e) => {
                              e.target.style.display = "none";
                            }}
                          />
                        );
                      })}
                    </div>
                  );
                })()}

              {/* ── VIDEO (disk storage: metadata.localPath) ── */}
              {/* ── VIDEO ── */}
              {msg.messageType === "video" &&
                (() => {
                  const url = msg.metadata?.gcsUrl ||
                    mediaUrl(msg.metadata?.gcsPath || msg.metadata?.localPath);
                  const name = msg.metadata?.fileName || "video.mp4";
                  if (url) {
                    return (
                      <VideoThumb
                        url={url}
                        duration={msg.metadata?.duration}
                        onClick={() => openMedia(url, name)}
                      />
                    );
                  }
                  return (
                    <div className="msg-file">
                      <svg
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        width="16"
                        height="16"
                      >
                        <path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z" />
                      </svg>
                      วิดีโอ
                      {msg.metadata?.duration != null && (
                        <span className="msg-file-info">
                          {Math.floor(msg.metadata.duration / 60000)}:
                          {String(
                            Math.floor((msg.metadata.duration % 60000) / 1000),
                          ).padStart(2, "0")}
                        </span>
                      )}
                    </div>
                  );
                })()}

              {/* ── AUDIO (disk storage: metadata.localPath) ── */}
              {/* ── AUDIO ── */}
              {msg.messageType === "audio" &&
                (() => {
                  const url = msg.metadata?.gcsUrl ||
                    mediaUrl(msg.metadata?.gcsPath || msg.metadata?.localPath);
                  return (
                    <VoiceMessage url={url} duration={msg.metadata?.duration} />
                  );
                })()}

              {/* ── FILE (disk storage: metadata.localPath) ── */}
              {/* ── FILE ── */}
              {msg.messageType === "file" &&
                (() => {
                  const url = msg.metadata?.gcsUrl ||
                    mediaUrl(msg.metadata?.gcsPath || msg.metadata?.localPath);
                  const fileName = msg.metadata?.fileName || "ไฟล์แนบ";
                  const accentColor = getFileAccent(fileName);
                  if (url) {
                    return (
                      <div
                        className="msg-file-card"
                        style={{ borderLeft: `4px solid ${accentColor}` }}
                        role="button"
                        tabIndex={0}
                        onClick={() => openMedia(url, fileName)}
                      >
                        <div className="msg-file-card-icon">
                          <FileIcon fileName={fileName} size={40} />
                        </div>
                        <div className="msg-file-card-info">
                          <span className="msg-file-card-name">{fileName}</span>
                          {msg.metadata?.fileSize && (
                            <span className="msg-file-card-size">
                              {formatFileSize(msg.metadata.fileSize)}
                            </span>
                          )}
                        </div>
                        <div className="msg-file-card-arrow">
                          <svg
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            width="16"
                            height="16"
                          >
                            <path
                              d="M9 18l6-6-6-6"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              fill="none"
                            />
                          </svg>
                        </div>
                      </div>
                    );
                  }
                  const missingFileName = msg.metadata?.fileName || "ไฟล์แนบ";
                  return (
                    <div
                      className="msg-file-card msg-file-card--missing"
                      style={{
                        borderLeft: `4px solid ${getFileAccent(missingFileName)}`,
                      }}
                    >
                      <div className="msg-file-card-icon">
                        <FileIcon fileName={missingFileName} size={40} />
                      </div>
                      <div className="msg-file-card-info">
                        <span className="msg-file-card-name">
                          {missingFileName}
                        </span>
                        <span className="msg-file-card-missing-label">
                          ไฟล์ถูกลบหรือหมดอายุ
                        </span>
                      </div>
                      <div className="msg-file-card-arrow msg-file-card-arrow--missing">
                        <svg
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          width="16"
                          height="16"
                        >
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                        </svg>
                      </div>
                    </div>
                  );
                })()}

              {/* ── LOCATION ── */}
              {msg.messageType === "location" && (
                <a
                  href={`https://maps.google.com/?q=${msg.metadata?.lat},${msg.metadata?.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="msg-location"
                >
                  <span className="msg-location-pin">
                    <svg
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      width="16"
                      height="16"
                    >
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z" />
                    </svg>
                  </span>
                  <div className="msg-location-info">
                    {msg.metadata?.title && (
                      <span className="msg-location-title">
                        {msg.metadata.title}
                      </span>
                    )}
                    <span className="msg-location-addr">
                      {msg.metadata?.address || "ดูบนแผนที่"}
                    </span>
                  </div>
                  <span className="msg-location-arrow">
                    <svg
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      width="14"
                      height="14"
                    >
                      <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                    </svg>
                  </span>
                </a>
              )}

              {/* ── STICKER ── */}
              {msg.messageType === "sticker" && (
                <div className="msg-sticker-wrapper">
                  {msg.metadata?.stickerUrl ? (
                    <img
                      src={msg.metadata.stickerUrl}
                      alt="Sticker"
                      className="msg-sticker"
                    />
                  ) : (
                    <span>[Sticker]</span>
                  )}
                </div>
              )}
            </div>
            {/* end msg-bubble-content */}

            <span className="msg-time-bubble">{formatTime(msg.timestamp)}</span>
          </div>
          {/* end msg-bubble-row */}
        </div>
        {/* end msg-content */}
      </div>

      {/* ✅ Image Lightbox with Zoom */}
      {lightboxImg &&
        (() => {
          const handleWheel = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const imgEl = e.currentTarget.querySelector(".lightbox-img");
            if (!imgEl) return;
            const currentScale = parseFloat(imgEl.dataset.zoom || "1");
            const delta = e.deltaY > 0 ? -0.15 : 0.15;
            const newScale = Math.min(Math.max(currentScale + delta, 0.5), 5);
            imgEl.dataset.zoom = newScale;
            imgEl.style.transform = `scale(${newScale}) translate(${imgEl.dataset.panX || 0}px, ${imgEl.dataset.panY || 0}px)`;
            // update zoom display
            const display = imgEl.parentElement.querySelector(
              ".lightbox-zoom-level",
            );
            if (display) display.textContent = `${Math.round(newScale * 100)}%`;
          };

          const handleZoomBtn = (dir) => {
            const imgEl = document.querySelector(".lightbox-img");
            if (!imgEl) return;
            const currentScale = parseFloat(imgEl.dataset.zoom || "1");
            const newScale = Math.min(
              Math.max(currentScale + dir * 0.25, 0.5),
              5,
            );
            imgEl.dataset.zoom = newScale;
            imgEl.style.transform = `scale(${newScale}) translate(${imgEl.dataset.panX || 0}px, ${imgEl.dataset.panY || 0}px)`;
            const display = document.querySelector(".lightbox-zoom-level");
            if (display) display.textContent = `${Math.round(newScale * 100)}%`;
          };

          const handleReset = () => {
            const imgEl = document.querySelector(".lightbox-img");
            if (!imgEl) return;
            imgEl.dataset.zoom = "1";
            imgEl.dataset.panX = "0";
            imgEl.dataset.panY = "0";
            imgEl.style.transform = "scale(1) translate(0px, 0px)";
            const display = document.querySelector(".lightbox-zoom-level");
            if (display) display.textContent = "100%";
          };

          const handleMouseDown = (e) => {
            if (e.button !== 0) return;
            const imgEl = e.currentTarget;
            const scale = parseFloat(imgEl.dataset.zoom || "1");
            if (scale <= 1) return;
            e.preventDefault();
            const startX = e.clientX;
            const startY = e.clientY;
            const initPanX = parseFloat(imgEl.dataset.panX || "0");
            const initPanY = parseFloat(imgEl.dataset.panY || "0");

            const onMove = (ev) => {
              const dx = (ev.clientX - startX) / scale;
              const dy = (ev.clientY - startY) / scale;
              imgEl.dataset.panX = initPanX + dx;
              imgEl.dataset.panY = initPanY + dy;
              imgEl.style.transform = `scale(${scale}) translate(${initPanX + dx}px, ${initPanY + dy}px)`;
            };
            const onUp = () => {
              window.removeEventListener("mousemove", onMove);
              window.removeEventListener("mouseup", onUp);
            };
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
          };

          return (
            <div
              className="lightbox-overlay"
              onClick={closeLightbox}
              onWheel={handleWheel}
            >
              {/* Close button */}
              <button
                className="lightbox-close"
                onClick={closeLightbox}
                aria-label="ปิด"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  width="18"
                  height="18"
                >
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>

              {/* Zoom controls */}
              <div
                className="lightbox-controls"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="lightbox-btn"
                  onClick={() => handleZoomBtn(-1)}
                  aria-label="Zoom out"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    width="16"
                    height="16"
                  >
                    <path d="M19 13H5v-2h14v2z" />
                  </svg>
                </button>
                <span className="lightbox-zoom-level">100%</span>
                <button
                  className="lightbox-btn"
                  onClick={() => handleZoomBtn(1)}
                  aria-label="Zoom in"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    width="16"
                    height="16"
                  >
                    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                  </svg>
                </button>
                <button
                  className="lightbox-btn"
                  onClick={handleReset}
                  aria-label="Reset zoom"
                  style={{ marginLeft: 4 }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    width="14"
                    height="14"
                  >
                    <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
                  </svg>
                </button>
              </div>

              {/* Image */}
              <img
                className="lightbox-img"
                src={lightboxImg}
                alt="ภาพขยาย"
                data-zoom="1"
                data-pan-x="0"
                data-pan-y="0"
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={handleReset}
                onMouseDown={handleMouseDown}
              />
            </div>
          );
        })()}

      {/* ✅ Media Modal */}
      {mediaModal && <MediaModal media={mediaModal} onClose={closeMedia} />}

      {/* ✅ Link Preview Modal */}
      {linkUrl && <LinkModal url={linkUrl} onClose={() => setLinkUrl(null)} />}
    </>
  );
}
