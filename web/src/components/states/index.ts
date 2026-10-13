// Ported from Masayume 68f7a09:web/src/components/states/index.ts — R6 (D-230): one states kit. Import a piece
// directly where the bundle matters (`@/components/states/BlockedCta`); this barrel is the map.
export { BoundaryScreen } from "./BoundaryScreen";
export { ErrorBoundary } from "./ErrorBoundary";
export { LiveRegion, announce } from "./LiveRegion";
export { ReadingBoundary, type ReadingMeta } from "./ReadingBoundary";
export { localClock, StaleTick } from "./StaleTick";
// revamped, same props + optional new ones
export { ActionPill, EmptyState, StateFrame, type NextAction, type EmptyStateProps } from "./EmptyState";
export { ErrorState, type ErrorStateProps } from "./ErrorState";
export { LoadingFrame, LoadingState, type LoadingShape, type LoadingStateProps } from "./LoadingState";
export { useHeldLoading } from "./useHeldLoading";
// new
export { BlockedCta, useFixRunner, type BlockedCtaProps, type BlockedTone, type HostFix } from "./BlockedCta";
export { Faces } from "./Faces";
export { WaitingText, useWaitClock, waitPhase, type WaitingTextProps, type WaitClock, type WaitPhase } from "./WaitingText";
export { SignedOutPreview, type SignedOutPreviewProps } from "./SignedOutPreview";
// the tx family, re-exported so features import one barrel
export { TxCta, TxSteps, TxPlaced, TxFailureCard, TxMorph, type TxCtaProps, type TxPlacedProps } from "@/components/tx";
// removed: BlockedButton, ButtonTone (0 importers; BlockedCta replaces it)
