import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useTweaks } from "./useTweaks";

describe("useTweaks", () => {
  beforeEach(() => { localStorage.clear(); });

  it("start met een uitgeklapte zijbalk", () => {
    const { result } = renderHook(() => useTweaks());
    expect(result.current.tweaks.sidebarCollapsed).toBe(false);
  });

  it("houdt de ingeklapte zijbalk vast over een refresh heen", () => {
    const first = renderHook(() => useTweaks());
    act(() => { first.result.current.set("sidebarCollapsed", true); });
    expect(first.result.current.tweaks.sidebarCollapsed).toBe(true);
    first.unmount();

    // Tweede mount = verse pagina; de waarde komt uit localStorage.
    const second = renderHook(() => useTweaks());
    expect(second.result.current.tweaks.sidebarCollapsed).toBe(true);
  });

  it("klapt weer uit zodra de gebruiker dat zelf doet", () => {
    const first = renderHook(() => useTweaks());
    act(() => { first.result.current.set("sidebarCollapsed", true); });
    act(() => { first.result.current.set("sidebarCollapsed", false); });
    first.unmount();

    const second = renderHook(() => useTweaks());
    expect(second.result.current.tweaks.sidebarCollapsed).toBe(false);
  });

  it("laat bestaande opgeslagen instellingen zonder de nieuwe sleutel intact", () => {
    localStorage.setItem("ma-tweaks", JSON.stringify({ theme: "dark", accent: "indigo" }));
    const { result } = renderHook(() => useTweaks());
    expect(result.current.tweaks.theme).toBe("dark");
    expect(result.current.tweaks.accent).toBe("indigo");
    expect(result.current.tweaks.sidebarCollapsed).toBe(false);
  });
});
