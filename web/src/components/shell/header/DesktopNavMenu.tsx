"use client";
// Ported from Masayume 68f7a09:web/src/components/shell/header/DesktopNavMenu.tsx

import { Menu } from "@base-ui/react/menu";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import type { NavGroup } from "./nav-items";
import { isActiveNavGroup, isActiveNavItem } from "./nav-items";

type DesktopNavMenuProps = {
  group: NavGroup;
  pathname: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function DesktopNavMenu({ group, pathname, open, onOpenChange }: DesktopNavMenuProps) {
  const active = isActiveNavGroup(pathname, group);

  return (
    <Menu.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <Menu.Trigger className={`nav-link nav-menu-trigger ${active ? "active" : ""}`}>
        {group.name}
        <ChevronDown aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="nav-menu-positioner" sideOffset={18} align="end">
          {/* The panel is as wide as its sections — one column each — so a group that lost destinations
              (the owner, 2026-09-04: "why is the rectangle that big now?") does not keep their empty room. */}
          <Menu.Popup className={`nav-menu-popup nav-menu-popup--${group.id}`} style={{ "--nav-sections": group.sections.length } as CSSProperties}>
            <div className="nav-menu-intro">
              <span>{group.name}</span>
              <p>{group.description}</p>
            </div>
            <div className="nav-menu-sections">
              {group.sections.map((section) => (
                <Menu.Group className="nav-menu-section" key={section.id}>
                  <Menu.GroupLabel className="nav-menu-section-label">
                    <span>{section.name}</span>
                    <small>{section.description}</small>
                  </Menu.GroupLabel>
                  <div className="nav-menu-links">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const itemActive = isActiveNavItem(pathname, item);
                      return (
                        <Menu.LinkItem
                          key={item.id}
                          render={item.external ? <a href={item.href} /> : <Link href={item.href} />}
                          closeOnClick
                          className={`nav-menu-link ${itemActive ? "active" : ""}`}
                          aria-current={itemActive ? "page" : undefined}
                         
                        >
                          <span className="nav-menu-icon"><Icon aria-hidden="true" /></span>
                          <span className="nav-menu-copy">
                            <strong>{item.name}{item.beta && <sup>beta</sup>}</strong>
                            <small>{item.description}</small>
                          </span>
                        </Menu.LinkItem>
                      );
                    })}
                  </div>
                </Menu.Group>
              ))}
            </div>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
