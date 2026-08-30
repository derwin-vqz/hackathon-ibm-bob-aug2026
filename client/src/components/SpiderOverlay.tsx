/**
 * SpiderOverlay — draggable spider icons used as path-finder endpoints.
 *
 * Renders two draggable emoji elements as absolute-positioned overlays on top
 * of the Cytoscape canvas:
 *   - 🕷 Black spider (source) — home position: bottom-left corner.
 *   - 🕸 White spider (target) — home position: bottom-right corner.
 *
 * Drag behaviour (pointer events):
 *   - On `pointerdown`, the element captures the pointer so `pointermove` and
 *     `pointerup` are reliably received even if the pointer leaves the element.
 *   - On `pointermove`, the spider follows the cursor.
 *   - On `pointerup`, the component calls `cy.elementFromPoint` to detect
 *     whether a graph node is under the cursor.
 *     - Hit: calls `onSourcePlace` / `onTargetPlace` with the node ID and
 *       leaves the spider at the drop position.
 *     - Miss: snaps the spider back to its home corner and calls the callback
 *       with `null` to clear the placement.
 *
 * NOTE: This component is currently unused — spider placement has been
 * integrated directly into GraphView via its right-click context menu.
 * It is kept here as a standalone alternative implementation.
 */
import { useCallback, useRef, useState } from 'react';
import type React from 'react';
import type cytoscape from 'cytoscape';

/** Props accepted by SpiderOverlay. */
type Props = {
  /** Ref to the live Cytoscape instance used for hit-testing on drop. */
  cyRef: React.RefObject<cytoscape.Core | null>;
  /** Called with the node ID when the source spider is dropped on a node, or `null` on miss. */
  onSourcePlace: (nodeId: string | null) => void;
  /** Called with the node ID when the target spider is dropped on a node, or `null` on miss. */
  onTargetPlace: (nodeId: string | null) => void;
  /** Optional short label displayed beneath the source spider when placed. */
  sourceLabel?: string;
  /** Optional short label displayed beneath the target spider when placed. */
  targetLabel?: string;
};

/** Identifies which of the two spiders is being dragged. */
type SpiderKind = 'source' | 'target';

/**
 * Snapshot captured on `pointerdown` to track drag delta and restore position
 * on a miss-drop.
 */
interface DragState {
  /** Which spider is being dragged. */
  kind: SpiderKind;
  /** Client X when the drag started. */
  startX: number;
  /** Client Y when the drag started. */
  startY: number;
  /** Spider's absolute X position when the drag started. */
  originX: number;
  /** Spider's absolute Y position when the drag started. */
  originY: number;
  /** Pointer ID used to release pointer capture. */
  pointerId: number;
}

/**
 * Absolute CSS-pixel position of a spider overlay.
 * `null` values mean the spider is at its home (corner) position.
 */
interface SpiderPos {
  x: number | null;
  y: number | null;
}

export default function SpiderOverlay({
  cyRef,
  onSourcePlace,
  onTargetPlace,
  sourceLabel,
  targetLabel,
}: Props) {
  // null means "at home position" — rendered via CSS bottom/left or bottom/right
  const [sourcePos, setSourcePos] = useState<SpiderPos>({ x: null, y: null });
  const [targetPos, setTargetPos] = useState<SpiderPos>({ x: null, y: null });
  const [dragging, setDragging] = useState<SpiderKind | null>(null);

  const dragRef = useRef<DragState | null>(null);

  const getPos = (kind: SpiderKind) =>
    kind === 'source' ? sourcePos : targetPos;

  const setPos = useCallback(
    (kind: SpiderKind, pos: SpiderPos) => {
      if (kind === 'source') setSourcePos(pos);
      else setTargetPos(pos);
    },
    [],
  );

  const onPointerDown = useCallback(
    (kind: SpiderKind, e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      e.stopPropagation();

      const pos = getPos(kind);
      dragRef.current = {
        kind,
        startX: e.clientX,
        startY: e.clientY,
        originX: pos.x ?? 0,
        originY: pos.y ?? 0,
        pointerId: e.pointerId,
      };
      setDragging(kind);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sourcePos, targetPos],
  );

  const onPointerMove = useCallback(
    (kind: SpiderKind, e: React.PointerEvent<HTMLDivElement>) => {
      const state = dragRef.current;
      if (!state || state.kind !== kind) return;
      e.stopPropagation();

      const dx = e.clientX - state.startX;
      const dy = e.clientY - state.startY;
      setPos(kind, { x: state.originX + dx, y: state.originY + dy });
    },
    [setPos],
  );

  const onPointerUp = useCallback(
    (kind: SpiderKind, e: React.PointerEvent<HTMLDivElement>) => {
      const state = dragRef.current;
      if (!state || state.kind !== kind) return;
      e.stopPropagation();
      dragRef.current = null;
      setDragging(null);

      const cy = cyRef.current;
      if (!cy) {
        setPos(kind, { x: null, y: null });
        (kind === 'source' ? onSourcePlace : onTargetPlace)(null);
        return;
      }

      const rect = cy.container()!.getBoundingClientRect();
      const relX = e.clientX - rect.left;
      const relY = e.clientY - rect.top;

      // elementFromPoint exists at runtime but is missing from @types/cytoscape
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hit = (cy as any).elementFromPoint(relX, relY) as cytoscape.SingularElementReturnValue | undefined;
      const node = hit?.isNode() ? hit : null;

      if (node) {
        (kind === 'source' ? onSourcePlace : onTargetPlace)(node.id());
        // keep spider at drop position — already set by pointermove
      } else {
        setPos(kind, { x: null, y: null });
        (kind === 'source' ? onSourcePlace : onTargetPlace)(null);
      }
    },
    [cyRef, onSourcePlace, onTargetPlace, setPos],
  );

  const spiderStyle = (
    kind: SpiderKind,
    pos: SpiderPos,
    isDragging: boolean,
  ): React.CSSProperties => {
    if (pos.x !== null && pos.y !== null) {
      return {
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'auto',
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        touchAction: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        zIndex: 10,
      };
    }
    // Home position
    return {
      position: 'absolute',
      bottom: 16,
      ...(kind === 'source' ? { left: 16 } : { right: 16 }),
      pointerEvents: 'auto',
      cursor: isDragging ? 'grabbing' : 'grab',
      userSelect: 'none',
      touchAction: 'none',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      zIndex: 10,
    };
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    color: '#e6edf3',
    marginTop: 2,
    maxWidth: 80,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'center',
    background: 'rgba(15,17,23,0.7)',
    borderRadius: 3,
    padding: '1px 4px',
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
      }}
    >
      {/* Black spider — source */}
      <div
        style={spiderStyle('source', sourcePos, dragging === 'source')}
        onPointerDown={(e) => onPointerDown('source', e)}
        onPointerMove={(e) => onPointerMove('source', e)}
        onPointerUp={(e) => onPointerUp('source', e)}
      >
        <span style={{ fontSize: 28, lineHeight: 1 }}>🕷</span>
        {sourceLabel && <span style={labelStyle}>{sourceLabel}</span>}
      </div>

      {/* White spider — target */}
      <div
        style={spiderStyle('target', targetPos, dragging === 'target')}
        onPointerDown={(e) => onPointerDown('target', e)}
        onPointerMove={(e) => onPointerMove('target', e)}
        onPointerUp={(e) => onPointerUp('target', e)}
      >
        <span style={{ fontSize: 28, lineHeight: 1 }}>🕸</span>
        {targetLabel && <span style={labelStyle}>{targetLabel}</span>}
      </div>
    </div>
  );
}
