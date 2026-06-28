/// <reference types="vite/client" />

interface Window {
  hoterra?: {
    platform: string;
    version: string;
  };
  __HOTERRA_API__?: string;
}
