import { app, BrowserWindow, ipcMain, dialog, shell, protocol } from "electron";
import path from "path";
import fs from "fs";

const isDev = !app.isPackaged;

// ── History file (persisted recent images/stickers) ────────────────────────
const HISTORY_PATH = path.join(app.getPath("userData"), "history.json");

function readHistory(): { images: string[]; stickers: string[] } {
  try {
    if (fs.existsSync(HISTORY_PATH)) {
      return JSON.parse(fs.readFileSync(HISTORY_PATH, "utf-8"));
    }
  } catch {}
  return { images: [], stickers: [] };
}

function writeHistory(data: { images: string[]; stickers: string[] }) {
  try {
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to write history:", e);
  }
}

// ── Window ──────────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    vibrancy: "under-window",
    backgroundColor: "#000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:3000");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    // Static export is in out/
    const indexPath = path.join(app.getAppPath(), "out", "index.html");
    win.loadFile(indexPath);
  }
}

app.whenReady().then(() => {
  // Register app:// protocol for production static assets
  // (allows file:// relative paths to resolve correctly)
  protocol.registerFileProtocol("app", (request, callback) => {
    const url = request.url.replace("app://./", "");
    const filePath = path.join(app.getAppPath(), "out", url);
    callback({ path: filePath });
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ── IPC: Save PNG via native dialog ─────────────────────────────────────────
ipcMain.handle("save-png", async (_event, dataUrl: string, defaultName: string) => {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return { success: false };

  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: "Save PNG",
    defaultPath: path.join(app.getPath("downloads"), defaultName),
    filters: [{ name: "PNG Image", extensions: ["png"] }],
  });

  if (canceled || !filePath) return { success: false };

  try {
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
    fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
    // Reveal in Finder
    shell.showItemInFolder(filePath);
    return { success: true, filePath };
  } catch (e) {
    console.error("save-png error:", e);
    return { success: false, error: String(e) };
  }
});

// ── IPC: Open image file via native dialog ───────────────────────────────────
ipcMain.handle("open-image", async (_event, target: "label" | "sticker") => {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return null;

  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: target === "label" ? "Choose Label Image" : "Choose Sticker Image",
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
    properties: ["openFile"],
  });

  if (canceled || filePaths.length === 0) return null;

  try {
    const filePath = filePaths[0];
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
    const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;

    // Update history
    const hist = readHistory();
    const key = target === "label" ? "images" : "stickers";
    hist[key] = [dataUrl, ...hist[key].filter((s) => s !== dataUrl)].slice(0, 6);
    writeHistory(hist);

    return { dataUrl, target };
  } catch (e) {
    console.error("open-image error:", e);
    return null;
  }
});

// ── IPC: Open multiple images (batch) ───────────────────────────────────────
ipcMain.handle("open-images-batch", async (_event) => {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return [];

  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: "Choose Images for Batch Export",
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
    properties: ["openFile", "multiSelections"],
  });

  if (canceled || filePaths.length === 0) return [];

  return filePaths.map((filePath) => {
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
    const name = path.basename(filePath, path.extname(filePath));
    return { dataUrl: `data:${mime};base64,${buffer.toString("base64")}`, name };
  });
});

// ── IPC: Save multiple PNGs (batch export) ──────────────────────────────────
ipcMain.handle("save-pngs-batch", async (_event, items: { dataUrl: string; name: string }[]) => {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return { success: false };

  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: "Choose Export Folder",
    properties: ["openDirectory", "createDirectory"],
  });

  if (canceled || filePaths.length === 0) return { success: false };

  const folder = filePaths[0];
  let saved = 0;

  for (const item of items) {
    try {
      const base64 = item.dataUrl.replace(/^data:image\/png;base64,/, "");
      const outPath = path.join(folder, `${item.name}.png`);
      fs.writeFileSync(outPath, Buffer.from(base64, "base64"));
      saved++;
    } catch (e) {
      console.error(`Failed to save ${item.name}:`, e);
    }
  }

  if (saved > 0) shell.openPath(folder);
  return { success: true, saved, folder };
});

// ── IPC: Persistent history ──────────────────────────────────────────────────
ipcMain.handle("get-history", async () => readHistory());

ipcMain.handle("set-history", async (_event, data: { images: string[]; stickers: string[] }) => {
  writeHistory(data);
  return true;
});
