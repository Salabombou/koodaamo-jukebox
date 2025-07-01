import React, { useRef, useState, useEffect, useLayoutEffect } from "react";
import ReactDOM from "react-dom";

interface ContextMenuProps {
  children: React.ReactNode;
  controlsDisabled?: boolean;
  onPlayNext?: () => void;
  onDelete?: () => void;
  onCopyUrl: () => void;
}

export default function ContextMenu({ children, controlsDisabled, onPlayNext, onDelete, onCopyUrl }: ContextMenuProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setVisible(false);
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setVisible(false);
    }
    function handleScroll() {
      setVisible(false);
    }
    function handleGlobalClose() {
      setVisible(false);
    }

    if (visible) {
      document.addEventListener("mousedown", handleClick);
      document.addEventListener("keydown", handleEsc);
      window.addEventListener("scroll", handleScroll, true);
      window.addEventListener("closeAllContextMenus", handleGlobalClose);
    }
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("closeAllContextMenus", handleGlobalClose);
    };
  }, [visible]);

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    // Close all other context menus before opening this one
    window.dispatchEvent(new Event("closeAllContextMenus"));
    console.log("Context menu opened at", e.clientX, e.clientY);
    setPos({ x: e.clientX, y: e.clientY });
    setVisible(true);
  }

  // Adjust menu position to keep it within viewport
  useLayoutEffect(() => {
    if (visible && menuRef.current) {
      const menu = menuRef.current;
      const rect = menu.getBoundingClientRect();
      let newX = pos.x;
      let newY = pos.y;
      const padding = 4; // small margin from edge
      if (rect.right > window.innerWidth) {
        newX = Math.max(window.innerWidth - rect.width - padding, 0);
      }
      if (rect.bottom > window.innerHeight) {
        newY = Math.max(window.innerHeight - rect.height - padding, 0);
      }
      if (newX !== pos.x || newY !== pos.y) {
        setPos({ x: newX, y: newY });
      }
    }
  }, [visible, pos]);

  return (
    <div
      style={{
        display: "inline-block",
        position: "relative",
        width: "100%",
        height: "100%",
      }}
      onContextMenu={handleContextMenu}
    >
      {children}
      {!controlsDisabled &&
        visible &&
        typeof window !== "undefined" &&
        ReactDOM.createPortal(
          <div
            ref={menuRef}
            data-custom-context-menu // Add this attribute for global context menu logic
            style={{
              position: "fixed",
              top: pos.y,
              left: pos.x,
              zIndex: 1000,
            }}
          >
            <ul tabIndex={0} className="dropdown-content menu p-2 shadow rounded-box w-52 bg-context-menu backdrop-blur">
              {onPlayNext && (
                <li>
                  <button
                    onClick={() => {
                      onPlayNext();
                      setVisible(false);
                    }}
                  >
                    Play Next
                  </button>
                </li>
              )}
              <li>
                <button
                  onClick={() => {
                    onCopyUrl();
                    setVisible(false);
                  }}
                >
                  Copy URL
                </button>
              </li>
              {onDelete && (
                <li className="text-red-500 hover:text-red-700">
                  <button
                    onClick={() => {
                      onDelete();
                      setVisible(false);
                    }}
                  >
                    Delete
                  </button>
                </li>
              )}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );
}
