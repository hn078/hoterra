import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('hoterra', {
  platform: process.platform,
  version: '1.0.0',
});
