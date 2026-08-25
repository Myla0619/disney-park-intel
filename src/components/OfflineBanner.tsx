"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/**
 * 离线提示条。
 *
 * 园区里信号时断时续，用户需要知道"现在看到的是不是实时数据"。没有这个提示，
 * 缓存里的旧排队时间看起来和实时数据一模一样，会直接把人带去排两小时的队。
 */
export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 bg-castle-500/95 px-3 py-1.5 text-xs font-medium text-night-950"
    >
      <WifiOff className="h-3.5 w-3.5" />
      当前离线，显示的是上次缓存的数据，排队时间可能已过时
    </div>
  );
}
