import React from 'react';
import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { ChatPanel } from './components/ChatPanel';
import { InfoPanel } from './components/InfoPanel';

export const App: React.FC = () => {
  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-white">
      <TitleBar />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <ChatPanel />
        <InfoPanel />
      </div>
    </div>
  );
};
