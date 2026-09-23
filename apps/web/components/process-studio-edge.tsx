'use client';

import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, Position, type EdgeProps } from '@xyflow/react';
import { memo } from 'react';

const PATH_OFFSET = 24;
const PATH_RADIUS = 12;
const HANDLE_CLEARANCE = 18;
const ALONG_SEGMENT = 42;
const LABEL_SIDE_GAP = 11;

function labelPosition(
  sourceX: number,
  sourceY: number,
  sourcePosition: Position,
  targetX: number,
  targetY: number,
  targetPosition: Position,
) {
  const [, centerX, centerY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: PATH_RADIUS,
    offset: PATH_OFFSET,
  });

  const dx = centerX - sourceX;
  const dy = centerY - sourceY;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;

  let x = sourceX + ux * (HANDLE_CLEARANCE + ALONG_SEGMENT);
  let y = sourceY + uy * (HANDLE_CLEARANCE + ALONG_SEGMENT);

  const nx = -uy;
  const ny = ux;
  const side = ny <= 0 ? 1 : -1;
  x += nx * LABEL_SIDE_GAP * side;
  y += ny * LABEL_SIDE_GAP * side;

  if (sourcePosition === Position.Right) x += 5;
  if (sourcePosition === Position.Left) x -= 5;
  if (sourcePosition === Position.Bottom) y += 5;
  if (sourcePosition === Position.Top) y -= 5;

  return { x, y };
}

function StudioFlowEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition = Position.Bottom,
  targetPosition = Position.Top,
  label,
  selected,
  markerEnd,
  style,
}: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: PATH_RADIUS,
    offset: PATH_OFFSET,
  });

  const labelCoords = label
    ? labelPosition(sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition)
    : null;

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} interactionWidth={22} />
      {label && labelCoords ? (
        <EdgeLabelRenderer>
          <div
            className={`process-studio-edge-label nodrag nopan${selected ? ' selected' : ''}`}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelCoords.x}px, ${labelCoords.y}px)`,
              pointerEvents: 'all',
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const StudioFlowEdge = memo(StudioFlowEdgeComponent);
