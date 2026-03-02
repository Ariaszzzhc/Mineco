// Register all tools
import './registry';
import './read';
import './write';
import './edit';
import './list-dir';
import './search';
import './shell';
import './skill';
import './ask';
import './task';
import './spawn-teammate';
import './shutdown-teammate';
import './send-message';
import './read-inbox';

export { toolRegistry } from './registry';
export { setGetProviderConfig } from './task';
export { setTeammateManager, type TeammateManagerInterface } from './spawn-teammate';
export { setShutdownTeammateManager } from './shutdown-teammate';
export { setMessageService, type MessageServiceInterface } from './send-message';
export { setInboxService, type InboxServiceInterface } from './read-inbox';
