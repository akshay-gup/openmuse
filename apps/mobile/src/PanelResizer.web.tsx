import { useRef, useState } from "react";
import { PANEL_STEP, type PanelResizerProps } from "./panel-width";
import { colors } from "./ui";

/**
 * The thread panel's left edge, as a handle to drag. A pointer moves it, the arrow keys move it by a
 * step (Home and End go to the smallest and largest), and a double click puts it back.
 */
export default function PanelResizer({
  width,
  min,
  max,
  onChange,
  onCommit,
  onReset,
}: PanelResizerProps) {
  const drag = useRef<{ startX: number; startWidth: number; latest: number } | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const within = (value: number) => Math.min(max, Math.max(min, Math.round(value)));
  const lit = hovered || focused || dragging;
  const line = dragging ? colors.primary : colors.lineStrong;

  function finish() {
    const started = drag.current;
    drag.current = null;
    setDragging(false);
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
    if (started) onCommit(started.latest);
  }

  return (
    <hr
      aria-orientation="vertical"
      aria-label="Resize thread"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { startX: event.clientX, startWidth: width, latest: width };
        setDragging(true);
        // Keep the drag from selecting text, and the cursor from flickering over what it crosses.
        document.body.style.setProperty("cursor", "col-resize");
        document.body.style.setProperty("user-select", "none");
      }}
      onPointerMove={(event) => {
        const started = drag.current;
        if (!started) return;
        // The panel is on the right, so moving the edge to the left makes it wider.
        started.latest = within(started.startWidth + (started.startX - event.clientX));
        onChange(started.latest);
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onDoubleClick={onReset}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onKeyDown={(event) => {
        const next =
          event.key === "ArrowLeft"
            ? width + PANEL_STEP
            : event.key === "ArrowRight"
              ? width - PANEL_STEP
              : event.key === "Home"
                ? min
                : event.key === "End"
                  ? max
                  : undefined;
        if (next === undefined) return;
        event.preventDefault();
        const value = within(next);
        onChange(value);
        onCommit(value);
      }}
      style={{
        position: "absolute",
        left: -6,
        top: 0,
        bottom: 0,
        width: 12,
        height: "auto",
        margin: 0,
        padding: 0,
        border: 0,
        zIndex: 10,
        // The line shows while the edge is hovered, focused or dragged; the 12px around it is the grip.
        background: lit
          ? `linear-gradient(to right, transparent 4.5px, ${line} 4.5px, ${line} 7.5px, transparent 7.5px)`
          : "transparent",
        cursor: "col-resize",
        touchAction: "none",
        outline: "none",
      }}
    />
  );
}
