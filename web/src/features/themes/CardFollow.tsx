"use client";
// A card's action on `/themes` (R6, D-230; D-231): Follow (to the theme with its follow sheet open), or "Following"
// once the signed-in wallet copies that basket. The server's HTML and a signed-out visitor get Follow; once a wallet
// is signed in and the data layer is up, the wallet's own consents load beside the card (`CardFollowing`, lazy — off
// the page's first load; every card shares one `/api/strategies/mine` read) and Follow stays until it answers.
// Refero: UGLYCASH's trader profile (c4c2bc7d-01a8-4e47-a349-0f667472460b → 408b3f30-9289-48bd-b949-c1960c055bbe): the
// accent Follow pill turns quiet grey once followed; here the kit's ghost pill.
import Link from "next/link";
import { lazy, Suspense } from "react";
import { pillButtonVariants } from "@/components/kit/pill-variants";
import { useWalletSession } from "@/lib/wallet-session";
import { useDataReady } from "@/providers/data/context";
import { THEMES } from "./copy";

const C = THEMES.card;
const CardFollowing = lazy(() => import("./CardFollowing").then((m) => ({ default: m.CardFollowing })));

export interface CardFollowProps {
  href: string;
  name: string;
  strategyId: string;
}

export function FollowPill({ href, name }: CardFollowProps) {
  return <Link href={`${href}?follow=1`} className={pillButtonVariants({ tone: "accent", size: "sm" })} aria-label={`${C.follow} ${name}`}>{C.follow}</Link>;
}

export function FollowingPill({ href, name }: CardFollowProps) {
  return <Link href={href} className={pillButtonVariants({ tone: "ghost", size: "sm" })} aria-label={`${C.following} ${name}`}>{C.following}</Link>;
}

export function CardFollow(props: CardFollowProps) {
  const ready = useDataReady();
  const who = useWalletSession().address;
  if (!ready || who === null) return <FollowPill {...props} />;
  return (
    <Suspense fallback={<FollowPill {...props} />}>
      <CardFollowing who={who} {...props} />
    </Suspense>
  );
}
