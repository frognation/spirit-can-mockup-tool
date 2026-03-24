import { contextBridge, ipcRenderer } from "electron";

// Types exposed to the renderer (window.electronAPI)
export interface ElectronAPI {
  /** Save a PNG dataURL via native Save dialog */
  savePng: (dataUrl: string, defaultName: string) => Promise<{ success: boolean; filePath?: string }>;

  /** Open a single image via native Open dialog */
  openImage: (target: "label" | "sticker") => Promise<{ dataUrl: string; target: "label" | "sticker" } | null>;

  /** Open multiple images for batch processing */
  openImagesBatch: () => Promise<{ dataUrl: string; name: string }[]>;

  /** Save multiple PNGs to a chosen folder */
  savePngsBatch: (items: { dataUrl: string; name: string }[]) => Promise<{ success: boolean; saved?: number; folder?: string }>;

  /** Get persistent image/sticker history */
  getHistory: () => Promise<{ images: string[]; stickers: string[] }>;

  /** Save persistent image/sticker history */
  setHistory: (data: { images: string[]; stickers: string[] }) => Promise<boolean>;
}

contextBridge.exposeInMainWorld("electronAPI", {
  savePng: (dataUrl: string, defaultName: string) =>
    ipcRenderer.invoke("save-png", dataUrl, defaultName),

  openImage: (target: "label" | "sticker") =>
    ipcRenderer.invoke("open-image", target),

  openImagesBatch: () =>
    ipcRenderer.invoke("open-images-batch"),

  savePngsBatch: (items: { dataUrl: string; name: string }[]) =>
    ipcRenderer.invoke("save-pngs-batch", items),

  getHistory: () =>
    ipcRenderer.invoke("get-history"),

  setHistory: (data: { images: string[]; stickers: string[] }) =>
    ipcRenderer.invoke("set-history", data),
} satisfies ElectronAPI);
