import "./kit.css";

/**
 * Mitoshi's component kit (R4-2, D-227) — Owarine 90a91d71's `components/kit` on Mitoshi's tokens, one barrel and one
 * stylesheet (`kit.css`, which opens with the `--ow-*` → Mitoshi token table). Every surface imports from here, never
 * from a port of its own. The overlay grammar lives in components/ui (`SlideOver`, `Modal`) and is re-exported: a sheet
 * with a pinned `footer` (or a body's `SheetFooter`), `size` md | lg, `onBack`, `urlKey` (Back closes it, D-190),
 * `fields` (drags only from its grab bar). Desktop keeps right drawers and centred modals (D-222). The desk kit (charts,
 * timeline, radio cards) is `@/components/kit/desk-kit`.
 */
export { PillButton, pillButtonVariants, type PillButtonProps, type PillTone } from "./PillButton";
export { Card, FeatureCard, Eyebrow, type FeatureTone } from "./Card";
export { TextTabs, TextTabPanel, type TextTab, type TextTabsProps } from "./TextTabs";
export { Odometer, directionOf, type OdometerKind, type OdometerProps } from "./Odometer";
export { PositionCard, type PositionCardProps } from "./PositionCard";
export { Sticker, type StickerTone } from "./Sticker";
export { Seal } from "./Seal";
export { SwipeToConfirm, type SwipeToConfirmProps } from "./SwipeToConfirm";
export { Keypad, type KeypadProps } from "./Keypad";
export { InfiniteSlider } from "./InfiniteSlider";
export { Masked, PrivacyToggle } from "./Masked";
export { ScrollRail } from "./ScrollRail";
export { SectionHeader, type SectionHeaderProps } from "../shell/SectionHeader";
export { HoldToConfirm, type HoldToConfirmProps } from "../ui/hold-to-confirm";
export { SlideOver, SlideOverContent, SlideOverTrigger, SlideOverClose, SheetFooter, type SlideOverProps, type SlideOverContentProps } from "../ui/drawer";
export { Modal, type ModalProps } from "../ui/modal";
