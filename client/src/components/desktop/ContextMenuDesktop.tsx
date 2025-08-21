import React, { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";

export interface ContextMenuDesktopItem {
  children: React.ReactNode;
  action: () => void;
  className?: string;
}

export interface ContextMenuDesktopRef {
  readonly isOpen: boolean;
}

interface ContextMenuProps {
  ref?: React.RefObject<ContextMenuDesktopRef | null>;
  children: React.ReactNode;
  controlsDisabled?: boolean;
  items: ContextMenuDesktopItem[];
}

/**
 * Renders a custom right–click context menu for its child subtree.
 * The native browser context menu is suppressed (handled globally in App).
 * When the user right–clicks within the wrapper the provided items are rendered
 * in a floating menu positioned near the cursor while staying within the viewport.
 * A global custom event ("closeAllContextMenus") is used so that only one menu can be open at a time.
 * @param children Elements that should trigger the custom context menu on right–click.
 * @param controlsDisabled When true the menu will not be rendered (acts as a permissions / busy gate).
 * @param items List of menu item descriptors to render.
 */
export default function ContextMenuDesktop({ ref, children, controlsDisabled, items }: ContextMenuProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    get isOpen() {
      return visible;
    }
  }));

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
    // Prevent opening a new menu if one is already open
    if (visible) return;
    // Close all other context menus before opening this one
    window.dispatchEvent(new Event("closeAllContextMenus"));
    console.log("Context menu opened at", e.clientX, e.clientY);
    setPos({ x: e.clientX, y: e.clientY });
    setVisible(true);
  }

  // Adjust menu position to keep it within viewport
  // Spawns top left of cursor position
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
          <>
            {/* Invisible backdrop to prevent accidental clicks */}
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                zIndex: 999,
                backgroundColor: "transparent",
              }}
              onClick={() => setVisible(false)}
            />
            <div
              ref={menuRef}
              data-custom-context-menu
              style={{
                position: "fixed",
                top: pos.y,
                left: pos.x,
                zIndex: 1000,
              }}
            >
              <ul tabIndex={0} className="dropdown-content menu p-2 shadow rounded-box w-52 bg-context-menu backdrop-blur">
                {items.map((item, index) => (
                  <li key={index} className={item.className}>
                    <button
                      onClick={() => {
                        item.action();
                        setVisible(false);
                      }}
                    >
                      {item.children}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
