"use client";
import { Direction } from "radix-ui";

export function RtlProvider({ children }: { children: React.ReactNode }) {
  return <Direction.DirectionProvider dir="rtl">{children}</Direction.DirectionProvider>;
}
