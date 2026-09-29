"use client";

/**
 * Motion for the whole app (plan §2.2, D-044; motion docs "Reduce bundle size" + "Accessibility"): only `m.*`
 * components under `LazyMotion` with `domAnimation` loaded after first paint (`strict` throws if a full `motion.*`
 * slips in), and `MotionConfig reducedMotion="user"` so transforms stop for readers who ask. Routes that need drag or
 * layout (the themes deck) nest their own async `domMax`.
 */
import { LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";

const loadDomAnimation = () => import("motion/react").then((mod) => mod.domAnimation);

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadDomAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
