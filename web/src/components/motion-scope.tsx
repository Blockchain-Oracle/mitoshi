"use client";

/**
 * Motion scope (plan §2.2, D-044; motion docs "Reduce bundle size" + "Accessibility"): only `m.*` components under
 * `LazyMotion` with `domAnimation` loaded async (`strict` throws if a full `motion.*` slips in), and `MotionConfig
 * reducedMotion="user"` so transforms stop for readers who ask. §3.1 / D-071: it is NOT mounted app-wide (motion's
 * runtime is ~60 KB even for `MotionConfig` alone); each lazy island that animates wraps its own root in it — the keys
 * list, the first-credit welcome, the dev fixtures. Routes that need drag or layout (the themes deck) nest `domMax`.
 */
import { LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";

const loadDomAnimation = () => import("./motion-features").then((mod) => mod.default);

export function MotionScope({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadDomAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
