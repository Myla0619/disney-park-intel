"use client";

import { useState } from "react";
import { Crosshair, Loader2 } from "lucide-react";
import { nearestArea } from "@/lib/park-geo";

type Props = {
  areaNameOf: (areaId: string) => string;
  onLocated: (areaId: string) => void;
};

type State =
  | { kind: "idle" }
  | { kind: "locating" }
  | { kind: "error"; message: string }
  | { kind: "uncertain"; areaId: string; areaName: string };

/**
 * 自动定位当前所在主题区。
 *
 * 园区里边走边在九宫格里找自己在哪个区很烦，定位一下就好。但有两种情况必须
 * 交回给用户手选，不能替他决定：
 *   - 人不在园区范围内（提前一天在家规划）——硬套一个最近的区会给出错误的行程起点
 *   - 站在两区交界，最近与次近相差不大——先确认再重规划
 */
export default function LocateMeButton({ areaNameOf, onLocated }: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });

  const locate = () => {
    if (!("geolocation" in navigator)) {
      setState({ kind: "error", message: "当前浏览器不支持定位，请手动选择" });
      return;
    }

    setState({ kind: "locating" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const fix = nearestArea({ lat: pos.coords.latitude, lng: pos.coords.longitude });

        if (!fix) {
          setState({ kind: "error", message: "看起来你还不在园区里，请手动选择起点" });
          return;
        }
        if (fix.confidence !== "high") {
          setState({ kind: "uncertain", areaId: fix.areaId, areaName: areaNameOf(fix.areaId) });
          return;
        }
        setState({ kind: "idle" });
        onLocated(fix.areaId);
      },
      (err) => {
        const message =
          err.code === err.PERMISSION_DENIED
            ? "定位权限被拒绝，请手动选择"
            : err.code === err.TIMEOUT
            ? "定位超时，园区内信号较弱，请手动选择"
            : "无法获取位置，请手动选择";
        setState({ kind: "error", message });
      },
      // 园区内需要较高精度；信号差时不要一直等，超时后让用户手选更快
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 }
    );
  };

  if (state.kind === "uncertain") {
    return (
      <div className="mb-3 rounded-xl border border-blue-400/30 bg-blue-500/10 p-3">
        <p className="text-sm text-white/90">
          你可能在<span className="font-semibold">{state.areaName}</span>附近，也可能在相邻区域
        </p>
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => onLocated(state.areaId)}
            className="rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white"
          >
            就用{state.areaName}
          </button>
          <button
            onClick={() => setState({ kind: "idle" })}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white/70"
          >
            我自己选
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-3">
      <button
        onClick={locate}
        disabled={state.kind === "locating"}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-400/30 bg-blue-500/10 p-3 text-sm font-medium text-white transition-colors hover:bg-blue-500/20 disabled:opacity-60"
      >
        {state.kind === "locating" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            正在定位…
          </>
        ) : (
          <>
            <Crosshair className="h-4 w-4" />
            自动定位我在哪个区
          </>
        )}
      </button>
      {state.kind === "error" && (
        <p className="mt-1.5 text-center text-xs text-amber-300/90">{state.message}</p>
      )}
    </div>
  );
}
