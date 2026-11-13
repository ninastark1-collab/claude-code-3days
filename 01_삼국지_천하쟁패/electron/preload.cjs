// 렌더러에 세이브 파일 입출력만 노출 (Node 전체는 노출하지 않음)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('saveApi', {
  read: (name) => ipcRenderer.invoke('save:read', name),
  write: (name, text) => ipcRenderer.invoke('save:write', name, text),
  remove: (name) => ipcRenderer.invoke('save:remove', name),
  dir: () => ipcRenderer.invoke('save:dir'),
});
