"use client";

import { useMemo, useCallback, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
  type NodeTypes,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import "@xyflow/react/dist/style.css";

import {
  StepNode,
  TerminatorNode,
  type StepNodeData,
  type StepStatus,
  type TerminatorNodeData,
} from "./flow-nodes";

/* ------------------------------------------------------------------ */
/*  Props                                                               */
/* ------------------------------------------------------------------ */

export interface SessionStep {
  type: "crm_action" | "notify" | "wait" | "ai_reason" | "human_checkpoint";
  description: string;
  config?: Record<string, unknown>;
}

export interface SessionEvent {
  id: string;
  stepIndex: number | null;
  type: string;
  data: Record<string, unknown>;
  createdAt: string;
}

interface SessionFlowDiagramProps {
  plan: SessionStep[];
  currentStepIndex: number;
  sessionStatus: string;
  events: SessionEvent[];
  /** Translated step labels by type */
  stepLabels: Record<string, string>;
  /** Translated start / end labels */
  startLabel: string;
  endLabel: string;
  /** Callback when a step node is clicked */
  onStepClick?: (stepIndex: number) => void;
}

/* ------------------------------------------------------------------ */
/*  Layout helpers (dagre)                                              */
/* ------------------------------------------------------------------ */

const NODE_WIDTH = 260;
const NODE_HEIGHT = 90;
const TERMINATOR_WIDTH = 140;
const TERMINATOR_HEIGHT = 36;

function getLayoutedElements(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 60, marginx: 20, marginy: 20 });

  nodes.forEach((node) => {
    const isTerminator = node.type === "terminator";
    g.setNode(node.id, {
      width: isTerminator ? TERMINATOR_WIDTH : NODE_WIDTH,
      height: isTerminator ? TERMINATOR_HEIGHT : NODE_HEIGHT,
    });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = g.node(node.id);
    const isTerminator = node.type === "terminator";
    const w = isTerminator ? TERMINATOR_WIDTH : NODE_WIDTH;
    const h = isTerminator ? TERMINATOR_HEIGHT : NODE_HEIGHT;

    return {
      ...node,
      position: {
        x: nodeWithPosition.x - w / 2,
        y: nodeWithPosition.y - h / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

/* ------------------------------------------------------------------ */
/*  Node types                                                          */
/* ------------------------------------------------------------------ */

const nodeTypes: NodeTypes = {
  step: StepNode,
  terminator: TerminatorNode,
};

/* ------------------------------------------------------------------ */
/*  Edge styles per status                                              */
/* ------------------------------------------------------------------ */

function getEdgeStyle(sourceStatus: StepStatus | "start", targetStatus: StepStatus | "end") {
  // Completed -> completed: green solid
  if (
    (sourceStatus === "start" || sourceStatus === "completed") &&
    (targetStatus === "completed" || targetStatus === "current" || targetStatus === "waiting")
  ) {
    return {
      stroke: "var(--success)",
      strokeWidth: 2,
      animated: false,
    };
  }

  // Current step outgoing: animated primary
  if (sourceStatus === "current" || sourceStatus === "waiting") {
    return {
      stroke: "var(--primary)",
      strokeWidth: 2,
      animated: true,
    };
  }

  // Failed
  if (sourceStatus === "failed") {
    return {
      stroke: "var(--destructive)",
      strokeWidth: 2,
      animated: false,
    };
  }

  // Default: muted dashed
  return {
    stroke: "var(--border)",
    strokeWidth: 1.5,
    animated: false,
  };
}

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

export function SessionFlowDiagram({
  plan,
  currentStepIndex,
  sessionStatus,
  events,
  stepLabels,
  startLabel,
  endLabel,
  onStepClick,
}: SessionFlowDiagramProps) {
  const isTerminal = ["completed", "cancelled", "failed"].includes(sessionStatus);

  // Count events per step
  const eventsByStep = useMemo(() => {
    const map = new Map<number, number>();
    for (const event of events) {
      if (event.stepIndex !== null) {
        map.set(event.stepIndex, (map.get(event.stepIndex) ?? 0) + 1);
      }
    }
    return map;
  }, [events]);

  // Determine step status
  const getStepStatus = useCallback(
    (index: number): StepStatus => {
      if (isTerminal && sessionStatus === "completed") return "completed";
      if (isTerminal && sessionStatus === "failed" && index === currentStepIndex) return "failed";
      if (isTerminal) return index < currentStepIndex ? "completed" : "pending";
      if (index < currentStepIndex) return "completed";
      if (index === currentStepIndex) {
        if (sessionStatus === "waiting_human") return "waiting";
        return "current";
      }
      return "pending";
    },
    [currentStepIndex, sessionStatus, isTerminal],
  );

  // Build nodes & edges
  const layoutResult = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Start node
    nodes.push({
      id: "start",
      type: "terminator",
      position: { x: 0, y: 0 },
      data: { label: startLabel, status: "default" } as Record<string, unknown>,
      draggable: false,
      selectable: false,
    });

    // Step nodes
    plan.forEach((step, i) => {
      const status = getStepStatus(i);
      const stepData: StepNodeData = {
        label: stepLabels[step.type] ?? step.type,
        description: step.description,
        stepType: step.type,
        status,
        index: i,
        eventCount: eventsByStep.get(i) ?? 0,
        config: step.config,
        duration: step.type === "wait" ? (step.config?.duration as string) : undefined,
      };

      nodes.push({
        id: `step-${i}`,
        type: "step",
        position: { x: 0, y: 0 },
        data: stepData as unknown as Record<string, unknown>,
        draggable: false,
      });
    });

    // End node
    const endStatus = isTerminal
      ? sessionStatus === "completed"
        ? "success"
        : sessionStatus === "failed"
          ? "failed"
          : "cancelled"
      : "default";

    nodes.push({
      id: "end",
      type: "terminator",
      position: { x: 0, y: 0 },
      data: { label: endLabel, status: endStatus } as Record<string, unknown>,
      draggable: false,
      selectable: false,
    });

    // Edges: start -> step-0 -> step-1 -> ... -> step-n -> end
    for (let i = 0; i < nodes.length - 1; i++) {
      const sourceId = nodes[i].id;
      const targetId = nodes[i + 1].id;

      // Determine source/target status for edge styling
      let sourceStatus: StepStatus | "start" = "start";
      if (sourceId.startsWith("step-")) {
        const idx = parseInt(sourceId.replace("step-", ""), 10);
        sourceStatus = getStepStatus(idx);
      }

      let targetStatus: StepStatus | "end" = "end";
      if (targetId.startsWith("step-")) {
        const idx = parseInt(targetId.replace("step-", ""), 10);
        targetStatus = getStepStatus(idx);
      }

      const edgeStyle = getEdgeStyle(sourceStatus, targetStatus);

      edges.push({
        id: `e-${sourceId}-${targetId}`,
        source: sourceId,
        target: targetId,
        type: "smoothstep",
        style: {
          stroke: edgeStyle.stroke,
          strokeWidth: edgeStyle.strokeWidth,
        },
        animated: edgeStyle.animated,
      });
    }

    // Apply dagre layout
    return getLayoutedElements(nodes, edges);
  }, [plan, getStepStatus, eventsByStep, stepLabels, startLabel, endLabel, sessionStatus, isTerminal]);

  const [nodes, , onNodesChange] = useNodesState(layoutResult.nodes);
  const [edges] = useEdgesState(layoutResult.edges);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.id.startsWith("step-") && onStepClick) {
        const idx = parseInt(node.id.replace("step-", ""), 10);
        onStepClick(idx);
      }
    },
    [onStepClick],
  );

  return (
    <div className="session-flow-diagram w-full h-125 rounded-xl border border-border bg-muted/20 overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnScroll
        zoomOnScroll
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} className="bg-transparent!" />
        <Controls
          showInteractive={false}
          className="bg-card! border-border! rounded-lg! shadow-sm! [&>button]:bg-card! [&>button]:border-border! [&>button]:text-foreground! [&>button:hover]:bg-muted!"
        />
      </ReactFlow>
    </div>
  );
}
