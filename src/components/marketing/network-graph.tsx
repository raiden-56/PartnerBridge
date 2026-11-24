"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";

interface Node {
  id: string;
  label: string;
  sub: string;
  x: number;
  y: number;
  color: string;
}

const PALETTE = ["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#172554", "#ea580c"];

const POSITIONS = [
  [250, 70],
  [420, 140],
  [440, 300],
  [280, 380],
  [100, 300],
  [80, 140],
  [250, 225],
  [395, 420],
];

const LINKS: [number, number, string][] = [
  [6, 0, "Technology"],
  [6, 1, "Marketing"],
  [6, 2, "Distributor"],
  [6, 3, "Referral"],
  [6, 4, "Supply chain"],
  [6, 5, "Reseller"],
  [0, 1, ""],
  [2, 7, ""],
  [4, 5, ""],
  [3, 7, ""],
];

/** Interactive partnership-network illustration. Nodes use real company names when available. */
export function NetworkGraph({ companies }: { companies: { name: string; industry?: string | null }[] }) {
  const reduce = useReducedMotion();
  const [hover, setHover] = React.useState<number | null>(null);
  const fallback = [
    { name: "Technology", industry: "Partner" },
    { name: "Marketing", industry: "Partner" },
    { name: "Distribution", industry: "Partner" },
    { name: "Logistics", industry: "Partner" },
    { name: "Manufacturing", industry: "Partner" },
    { name: "Retail", industry: "Partner" },
    { name: "Your company", industry: "You" },
    { name: "Travel", industry: "Partner" },
  ];
  const source = companies.length >= 7 ? companies : fallback;
  const nodes: Node[] = POSITIONS.map(([x, y], i) => {
    const c = i === 6 ? { name: "Your company", industry: "Discover → Grow" } : source[i < 6 ? i : 7] ?? fallback[i]!;
    return { id: String(i), label: c.name, sub: c.industry ?? "", x: x!, y: y!, color: i === 6 ? "#172554" : PALETTE[i % PALETTE.length]! };
  });

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[520px]" aria-hidden>
      <div className="absolute inset-6 rounded-full bg-gradient-to-br from-blue-100/70 via-white to-indigo-100/60 blur-2xl" />
      <svg viewBox="0 0 520 500" className="relative size-full">
        <defs>
          <linearGradient id="pb-link" x1="0" x2="1">
            <stop offset="0" stopColor="#2563eb" stopOpacity="0.55" />
            <stop offset="1" stopColor="#172554" stopOpacity="0.25" />
          </linearGradient>
        </defs>
        {LINKS.map(([a, b, label], i) => {
          const na = nodes[a]!;
          const nb = nodes[b]!;
          const active = hover === null || hover === a || hover === b;
          return (
            <g key={i} opacity={active ? 1 : 0.25} style={{ transition: "opacity .2s" }}>
              <motion.line
                x1={na.x}
                y1={na.y}
                x2={nb.x}
                y2={nb.y}
                stroke="url(#pb-link)"
                strokeWidth={label ? 2 : 1.2}
                strokeDasharray={label ? "0" : "4 6"}
                initial={reduce ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.1, delay: 0.2 + i * 0.08 }}
              />
              {label && !reduce && (
                <motion.circle
                  r={3.5}
                  fill="#2563eb"
                  initial={{ cx: na.x, cy: na.y }}
                  animate={{ cx: [na.x, nb.x, na.x], cy: [na.y, nb.y, na.y] }}
                  transition={{ duration: 6 + i, repeat: Infinity, ease: "easeInOut" }}
                />
              )}
              {label && (
                <text x={(na.x + nb.x) / 2} y={(na.y + nb.y) / 2 - 6} textAnchor="middle" className="fill-slate-500 text-[10px] font-medium">
                  {label}
                </text>
              )}
            </g>
          );
        })}
        {nodes.map((n, i) => (
          <motion.g
            key={n.id}
            initial={reduce ? false : { opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.1 + i * 0.07 }}
            style={{ transformOrigin: `${n.x}px ${n.y}px`, cursor: "pointer" }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <circle cx={n.x} cy={n.y} r={i === 6 ? 40 : 28} fill="white" stroke={n.color} strokeWidth={i === 6 ? 3 : 2} filter="drop-shadow(0 6px 12px rgb(23 37 84 / .12))" />
            <text x={n.x} y={n.y + 5} textAnchor="middle" className="text-[13px] font-bold" fill={n.color}>
              {n.label
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w[0])
                .join("")
                .toUpperCase()}
            </text>
            <text x={n.x} y={n.y + (i === 6 ? 58 : 46)} textAnchor="middle" className="fill-slate-800 text-[11px] font-semibold">
              {n.label.length > 22 ? n.label.slice(0, 21) + "…" : n.label}
            </text>
            <text x={n.x} y={n.y + (i === 6 ? 72 : 59)} textAnchor="middle" className="fill-slate-500 text-[9.5px]">
              {n.sub}
            </text>
          </motion.g>
        ))}
      </svg>
    </div>
  );
}
