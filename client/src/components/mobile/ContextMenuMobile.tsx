import React, { useEffect, useImperativeHandle, useRef, useState } from "react";

export interface ContextMenuMobileItem {
  children: React.ReactNode;
  action: () => void;
  className?: string;
}

export interface ContextMenuMobileRef {
  readonly isOpen: boolean;
  open: (pos?: { x: number; y: number }) => void;
  close: () => void;
}

interface ContextMenuMobileProps {
  ref?: React.RefObject<ContextMenuMobileRef | null>;
  children: React.ReactNode;
  controlsDisabled?: boolean;
  items: ContextMenuMobileItem[];
}

/**
 * Renders a custom context menu for mobile as a modal using daisyUI.
 * The menu is triggered by a long press (touch and hold) on the child element.
 * @param children Elements that should trigger the custom context menu on long press.
 * @param controlsDisabled When true the menu will not be rendered (acts as a permissions / busy gate).
 * @param items List of menu item descriptors to render.
 * @param ref Forwarded ref for the context menu.
 */
const LONG_PRESS_DURATION = 400; // ms

export default function ContextMenuMobile({ children, controlsDisabled, items, ref }: ContextMenuMobileProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const longPressTimeout = useRef<NodeJS.Timeout | null>(null);
  // Suppress accidental click after long press opens modal
  const suppressNextClick = useRef(false);

  useImperativeHandle(
    ref,
    () => ({
      get isOpen() {
        return isOpen;
      },
      open: () => {
        if (!controlsDisabled && dialogRef.current && !dialogRef.current.open) {
          dialogRef.current.showModal();
          setIsOpen(true);
        }
      },
      close: () => {
        if (dialogRef.current && dialogRef.current.open) {
          dialogRef.current.close();
          setIsOpen(false);
        }
      },
    }),
    [isOpen, controlsDisabled],
  );

  // Long press handlers
  function handleTouchStart() {
    if (controlsDisabled) return;
    if (longPressTimeout.current) clearTimeout(longPressTimeout.current);
    longPressTimeout.current = setTimeout(() => {
      if (dialogRef.current && !dialogRef.current.open) {
        dialogRef.current.showModal();
        setIsOpen(true);
        suppressNextClick.current = true;
      }
    }, LONG_PRESS_DURATION);
  }
  // Prevent accidental click/tap after opening modal via long press
  function handleModalClickCapture(e: React.SyntheticEvent) {
    if (suppressNextClick.current) {
      e.stopPropagation();
      e.preventDefault();
      suppressNextClick.current = false;
    }
  }
  function handleTouchEnd() {
    if (longPressTimeout.current) {
      clearTimeout(longPressTimeout.current);
      longPressTimeout.current = null;
    }
  }

  // Close state sync
  function handleDialogClose() {
    setIsOpen(false);
  }

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <div
      style={{ width: "100%", height: "100%", display: "inline-block", position: "relative" }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchEnd}
      onContextMenu={(e) => e.preventDefault()} // Prevent native context menu
    >
      {children}
      {!controlsDisabled && (
        <dialog
          className="modal backdrop-blur-xs"
          ref={dialogRef}
          onClose={handleDialogClose}
          onClickCapture={handleModalClickCapture}
        >
          <div className="modal-box p-0 bg-context-menu backdrop-blur shadow rounded-box w-11/12 max-w-xs">
            <ul className="menu w-full">
              {items.map((item, idx) => (
                <li key={idx} className={item.className}>
                  <button
                    className="w-full text-left"
                    style={{ WebkitTapHighlightColor: "transparent", color: "inherit" }}
                    onMouseDown={e => e.preventDefault()} // Prevent focus highlight on tap
                    onClick={() => {
                      item.action();
                      if (dialogRef.current) dialogRef.current.close();
                      setIsOpen(false);
                    }}
                  >
                    {item.children}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button>close</button>
          </form>
        </dialog>
      )}
    </div>
  );
}