import { api } from "@/components/api/client";
import {
    fetchPlaylist,
    getSignageVersion,
    PlaylistItems,
    VideoItem,
} from "@/services/MediaService";
import { fetchPromotions, MediaItem } from "@/services/PromotionService";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type SchedulerPriority = 1 | 2 | 3 | 4;

export interface SchedulerResult {
  isOnline: boolean;
  promotions: MediaItem[];
  playlist: PlaylistItems[];
  signageVideos: VideoItem[];
  lastUpdated: number | null;
}

type DueTask = {
  priority: SchedulerPriority;
  name: string;
  run: () => Promise<void>;
};

type SchedulerListener = (result: SchedulerResult) => void;

class ApiScheduler {
  private state: SchedulerResult = {
    isOnline: true,
    promotions: [],
    playlist: [],
    signageVideos: [],
    lastUpdated: null,
  };

  private listeners: Set<SchedulerListener> = new Set();
  private dueQueue: DueTask[] = [];
  private isRunning = false;

  // Timers
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private promotionTimer: ReturnType<typeof setInterval> | null = null;
  private playlistTimer: ReturnType<typeof setInterval> | null = null;
  private signageVersionTimer: ReturnType<typeof setInterval> | null = null;

  // Intervals
  private readonly HEARTBEAT_INTERVAL = 120_000; // 2 min
  private readonly PROMOTION_INTERVAL = 60_000; // 30 min
  private readonly PLAYLIST_INTERVAL = 60_000; // 30 min
  private readonly SIGNAGE_VERSION_INTERVAL = 60_000; // 30 min

  // Called between tasks to add delay for each API call
  private sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  // ─── Public API ───────────────────────────────────────────────
  subscribe(listener: SchedulerListener) {
    this.listeners.add(listener);
    listener(this.state); // emit current state immediately
    return () => this.listeners.delete(listener);
  }

  start() {
    console.log("[SCHEDULER] Starting....");
    this.runHeartbeat(); // run immediately on start
    this.enqueuePromotion(); // run immediately on start
    this.enqueuePlaylist();
    this.enqueueSignageVersion();
    this.startTimers();
  }

  stop() {
    console.log("[SCHEDULER] Stopping.....");
    [
      this.heartbeatTimer,
      this.promotionTimer,
      this.playlistTimer,
      this.signageVersionTimer,
    ].forEach((t) => {
      if (t) clearInterval(t);
    });
  }

  // ─── Timers ───────────────────────────────────────────────────
  private startTimers() {
    this.heartbeatTimer = setInterval(
      () => this.runHeartbeat(),
      this.HEARTBEAT_INTERVAL,
    );

    this.promotionTimer = setInterval(() => {
      console.log("[SCHEDULER] Promotion timer fired → marking due");
      this.enqueuePromotion();
    }, this.PROMOTION_INTERVAL);

    this.playlistTimer = setInterval(() => {
      console.log("[SCHEDULER] Playlist timer fired → marking due");
      this.enqueuePlaylist();
    }, this.PLAYLIST_INTERVAL);

    this.signageVersionTimer = setInterval(() => {
      console.log("[SCHEDULER] Signage version timer fired → marking due");
      this.enqueueSignageVersion();
    }, this.SIGNAGE_VERSION_INTERVAL);
  }

  // ─── Heartbeat (Priority 1 — gatekeeper) ─────────────────────
  private async runHeartbeat() {
    const outletId = await AsyncStorage.getItem("outlet_id");

    console.log("[SCHEDULER][P1] Running heartbeat...");

    try {
      const response = await fetch(api.heartbeat, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outlet_id: outletId,
          outlet_status: "online",
          timestamp: new Date().toISOString(),
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Heartbeat failed");

      const wasOffline = !this.state.isOnline;
      this.setState({ isOnline: true });
      console.log("[SCHEDULER][P1] Heartbeat success ✓");

      if (wasOffline) {
        console.log("[SCHEDULER] Back online — re-enqueueing all tasks");
        this.enqueuePromotion();
        this.enqueuePlaylist();
        this.enqueueSignageVersion();
      }

      // Heartbeat succeeded — drain the queue
      this.drainQueue();
    } catch (err) {
      console.warn("[SCHEDULER][P1] Heartbeat failed — going offline:", err);
      this.setState({ isOnline: false });
      // Don't drain queue — offline gatekeeper blocks everything
    }
  }

  // ─── Queue Management ─────────────────────────────────────────
  private enqueuePromotion() {
    this.enqueue({
      priority: 2,
      name: "Promotions",
      run: async () => {
        console.log("[SCHEDULER][P2] Running promotion fetch...");
        const promotions = await fetchPromotions();
        this.setState({ promotions });
        console.log(
          `[SCHEDULER][P2] Promotions done — ${promotions.length} items`,
        );
      },
    });
  }

  private enqueuePlaylist() {
    this.enqueue({
      priority: 3,
      name: "Playlist",
      run: async () => {
        console.log("[SCHEDULER][P3] Running playlist fetch...");
        const playlist = await fetchPlaylist();
        this.setState({ playlist });
        console.log(`[SCHEDULER][P3] Playlist done — ${playlist.length} items`);
      },
    });
  }

  private enqueueSignageVersion() {
    this.enqueue({
      priority: 3,
      name: "Signage Version",
      run: async () => {
        console.log("[SCHEDULER][P4] Checking signage version...");
        const { etag } = await getSignageVersion();
        console.log(`[SCHEDULER][P4] Signage version done — etag: ${etag}`);
        // Version check only; cache invalidation handled inside MediaService
      },
    });
  }

  private enqueue(task: DueTask) {
    // Deduplicate — don't add the same task twice
    const alreadyQueued = this.dueQueue.some((t) => t.name === task.name);
    if (alreadyQueued) {
      console.log(
        `[SCHEDULER] ${task.name} already in queue — skipping duplicate`,
      );
      return;
    }

    this.dueQueue.push(task);
    // Sort by priority ascending (lower number = higher priority)
    this.dueQueue.sort((a, b) => a.priority - b.priority);
    console.log(
      `[SCHEDULER] Enqueued: ${task.name} | Queue: [${this.dueQueue.map((t) => t.name).join(", ")}]`,
    );
  }

  private async drainQueue() {
    if (this.isRunning) {
      console.log("[SCHEDULER] Already running — drain skipped");
      return;
    }
    if (this.dueQueue.length === 0) {
      console.log("[SCHEDULER] Queue empty — nothing to drain");
      return;
    }
    if (!this.state.isOnline) {
      console.warn(
        "[SCHEDULER] Offline — drain blocked by heartbeat gatekeeper",
      );
      return;
    }

    this.isRunning = true;
    console.log(`[SCHEDULER] Draining queue — ${this.dueQueue.length} tasks`);

    while (this.dueQueue.length > 0 && this.state.isOnline) {
      const task = this.dueQueue.shift()!;
      console.log(`[SCHEDULER] ▶ Running: ${task.name}`);
      try {
        await task.run();
      } catch (err) {
        console.error(`[SCHEDULER] ✗ Task failed: ${task.name}`, err);
      }

      if (this.dueQueue.length > 0) {
        console.log("[SCHEDULER] Waiting 3s before next task...");
        await this.sleep(3000);
      }
    }

    this.setState({ lastUpdated: Date.now() });
    this.isRunning = false;
    console.log("[SCHEDULER] Queue drained ✓");
  }

  // ─── State Management ─────────────────────────────────────────

  private setState(partial: Partial<SchedulerResult>) {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((l) => l(this.state));
  }
}

// Singleton — one scheduler for the whole app
export const scheduler = new ApiScheduler();
