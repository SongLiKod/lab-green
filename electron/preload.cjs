const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  gitExec: (cwd, args, timeout) => ipcRenderer.invoke('git:exec', { cwd, args, timeout }),
  saveDialog: (defaultName, filters) => ipcRenderer.invoke('dialog:save', { defaultName, filters }),
  openDialog: (filters) => ipcRenderer.invoke('dialog:open', { filters }),
  chooseDir: () => ipcRenderer.invoke('dialog:dir'),
  platform: process.platform
})
