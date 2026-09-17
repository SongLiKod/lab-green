/* Electron 主进程：本地 Git 能力 + 文件对话框 */
const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const { execFile } = require('child_process')

const isDev = !!process.env.VITE_DEV_SERVER_URL

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: '#0b2e1c',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

/* 本地 git 执行（子进程，带超时） */
ipcMain.handle('git:exec', async (_e, { cwd, args, timeout }) => {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, timeout: timeout || 30000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: err?.code ?? 0, stdout: String(stdout || ''), stderr: String(stderr || err || '') })
    })
  })
})

ipcMain.handle('dialog:save', async (_e, { defaultName, filters }) => {
  const r = await dialog.showSaveDialog({ defaultPath: defaultName, filters })
  return r.canceled ? null : r.filePath
})
ipcMain.handle('dialog:open', async (_e, { filters }) => {
  const r = await dialog.showOpenDialog({ properties: ['openFile'], filters })
  return r.canceled ? null : r.filePaths[0]
})
ipcMain.handle('dialog:dir', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  return r.canceled ? null : r.filePaths[0]
})

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
