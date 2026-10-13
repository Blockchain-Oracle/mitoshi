// Ported from Owarine 90a91d71:docs-site/components/mdx.tsx (D-227): Mitoshi's components, plus the address and
// receipt ledgers read from the deployment fragments and acceptance records.
import defaultComponents from 'fumadocs-ui/mdx';
import { Callout } from 'fumadocs-ui/components/callout';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import type { MDXComponents } from 'mdx/types';
import { AppLink, JourneyList, ProductMap, WelcomeActions } from './welcome';
import { GuideCapture } from './guide-capture';
import { Walkthrough } from './walkthrough';
import { Architecture } from './architecture';
import { Mermaid } from './mermaid';
import { Deployments } from './deployments';
import { Tx, Address } from './chain-links';
export function getMDXComponents(components?: MDXComponents) {
  return { ...defaultComponents, Callout, Step, Steps, Tab, Tabs, AppLink, JourneyList, ProductMap, WelcomeActions, GuideCapture, Walkthrough, Architecture, Mermaid, Deployments, Tx, Address, ...components } satisfies MDXComponents;
}
export const useMDXComponents = getMDXComponents;
declare global { type MDXProvidedComponents = ReturnType<typeof getMDXComponents> }
