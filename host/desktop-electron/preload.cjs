const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pulsarHost", {
	invoke(namespace, method, payload) {
		return ipcRenderer.invoke("pulsar:host:invoke", namespace, method, payload);
	},
	listen(event, listener) {
		const channel = `pulsar:host:event:${event}`;
		const wrapped = (_ipcEvent, payload) => listener(payload);
		ipcRenderer.on(channel, wrapped);
		return () => ipcRenderer.removeListener(channel, wrapped);
	},
});
