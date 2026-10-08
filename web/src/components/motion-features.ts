// The feature package `MotionScope` hands LazyMotion after first render (motion docs, "Reduce bundle size"): a module of
// its own, so the lazy chunk holds `domAnimation` alone instead of the whole `motion/react` entry (D-183).
import { domAnimation } from "motion/react";

export default domAnimation;
