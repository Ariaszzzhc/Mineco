import { ipcMain, dialog, BrowserWindow } from 'electron';
import Store from 'electron-store';
import { v4 as uuidv4 } from 'uuid';
import { IPC_CHANNELS } from '../../shared/ipc';
import type {
  Session,
  StreamEvent,
  AppConfig,
} from '../../shared/types';
import { AgentLoop } from '../services/agent/loop';
import '../services/tools'; // Register tools

const store = new Store<{ config: AppConfig }>();
const sessions = new Map<string, Session>();
const agentLoops = new Map<string, AgentLoop>();

export function setupIPC(mainWindow: BrowserWindow): void {
  const agentLoop = new AgentLoop(mainWindow);
  agentLoops.set('default', agentLoop);

  // Config management
  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, () => {
    return store.get('config', {
      providers: [],
      defaultProvider: '',
      theme: 'system',
    } as AppConfig);
  });

  ipcMain.handle(IPC_CHANNELS.CONFIG_SET, (_event, config: Partial<AppConfig>) => {
    const current = store.get('config', {
      providers: [],
      defaultProvider: '',
      theme: 'system',
    } as AppConfig);
    store.set('config', { ...current, ...config });
  });

  // Session management
  ipcMain.handle(IPC_CHANNELS.SESSION_CREATE, (_event, workingDir?: string) => {
    const session: Session = {
      id: uuidv4(),
      title: 'New Chat',
      messages: [],
      workingDir: workingDir || null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    sessions.set(session.id, session);
    return session;
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_LIST, () => {
    return Array.from(sessions.values());
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_GET, (_event, sessionId: string) => {
    return sessions.get(sessionId);
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_DELETE, (_event, sessionId: string) => {
    sessions.delete(sessionId);
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_UPDATE, (_event, session: Session) => {
    session.updatedAt = Date.now();
    sessions.set(session.id, session);
    return session;
  });

  // Agent control
  ipcMain.on(
    IPC_CHANNELS.AGENT_START,
    (
      _event,
      { sessionId, message, providerConfig }: { sessionId: string; message: string; providerConfig: AppConfig['providers'][0] }
    ) => {
      const session = sessions.get(sessionId);
      if (!session) return;

      if (providerConfig) {
        agentLoop.setProvider(providerConfig);
      }

      agentLoop.start(session, message, (event: StreamEvent) => {
        mainWindow.webContents.send(IPC_CHANNELS.AGENT_STREAM, event);
      });
    }
  );

  ipcMain.on(IPC_CHANNELS.AGENT_STOP, () => {
    agentLoop.stop();
  });

  // File system
  ipcMain.handle(IPC_CHANNELS.FS_OPEN_FOLDER, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });
    return result.filePaths[0] || null;
  });

  ipcMain.handle(IPC_CHANNELS.FS_READ_FILE, async (_event, filePath: string) => {
    const fs = await import('fs/promises');
    return fs.readFile(filePath, 'utf-8');
  });

  ipcMain.handle(
    IPC_CHANNELS.FS_WRITE_FILE,
    async (_event, filePath: string, content: string) => {
      const fs = await import('fs/promises');
      return fs.writeFile(filePath, content, 'utf-8');
    }
  );

  ipcMain.handle(IPC_CHANNELS.FS_LIST_DIR, async (_event, dirPath: string) => {
    const fs = await import('fs/promises');
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.map((e) => ({
      name: e.name,
      isDirectory: e.isDirectory(),
    }));
  });

  // Window controls
  ipcMain.on(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
    mainWindow.minimize();
  });

  ipcMain.on(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.on(IPC_CHANNELS.WINDOW_CLOSE, () => {
    mainWindow.close();
  });
}
