/**
 * SmartPay CRM — WebSocket Service
 * Real-time event broadcasting for CRM updates, notifications, presence
 */

const { WebSocketServer } = require('ws');
const { verifyUserToken, parseCookies } = require('../middleware/auth');

let wss = null;
const clients = new Map(); // userId -> Set<ws>

/**
 * Initialize WebSocket server on the existing HTTP server
 */
function initWebSocket(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    // Authenticate via cookie
    const cookies = parseCookies(req);
    const token = cookies.smartpay_auth;
    const user = token ? verifyUserToken(token) : null;

    if (!user) {
      ws.close(4001, 'Authentication required');
      return;
    }

    ws.userId = user.id;
    ws.userName = user.name;
    ws.userRole = user.role || 'rep';
    ws.isAlive = true;

    // Track connected client
    if (!clients.has(user.id)) clients.set(user.id, new Set());
    clients.get(user.id).add(ws);

    console.log(`🔌 WebSocket connected: ${user.name} (ID: ${user.id})`);

    // Send welcome message
    ws.send(JSON.stringify({
      event: 'connected',
      data: { userId: user.id, name: user.name, role: user.role }
    }));

    // Handle pong for heartbeat
    ws.on('pong', () => { ws.isAlive = true; });

    // Handle incoming messages (for future use)
    ws.on('message', (msg) => {
      try {
        const data = JSON.parse(msg);
        // Handle client-side events (e.g., presence, typing indicators)
        if (data.event === 'ping') {
          ws.send(JSON.stringify({ event: 'pong', data: { time: Date.now() } }));
        }
      } catch (e) {
        // Invalid JSON — ignore
      }
    });

    ws.on('close', () => {
      const userClients = clients.get(user.id);
      if (userClients) {
        userClients.delete(ws);
        if (userClients.size === 0) clients.delete(user.id);
      }
      console.log(`🔌 WebSocket disconnected: ${user.name}`);
    });

    ws.on('error', (err) => {
      console.error(`WebSocket error for ${user.name}:`, err.message);
    });
  });

  // Heartbeat interval to clean up dead connections
  const heartbeat = setInterval(() => {
    wss.clients.forEach(ws => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(heartbeat));

  console.log('✅ WebSocket server initialized on /ws');
  return wss;
}

/**
 * Broadcast an event to all connected authenticated clients
 */
function broadcast(event, data) {
  if (!wss) return;
  const message = JSON.stringify({ event, data, timestamp: Date.now() });
  wss.clients.forEach(client => {
    if (client.readyState === 1) { // WebSocket.OPEN
      try { client.send(message); } catch (e) { /* ignore send errors */ }
    }
  });
}

/**
 * Send an event to a specific user's connections
 */
function sendToUser(userId, event, data) {
  const userClients = clients.get(userId);
  if (!userClients) return;
  const message = JSON.stringify({ event, data, timestamp: Date.now() });
  userClients.forEach(client => {
    if (client.readyState === 1) {
      try { client.send(message); } catch (e) { /* ignore */ }
    }
  });
}

/**
 * Get list of currently connected user IDs
 */
function getConnectedUsers() {
  return Array.from(clients.keys());
}

/**
 * Get total connected client count
 */
function getConnectionCount() {
  let count = 0;
  clients.forEach(set => count += set.size);
  return count;
}

module.exports = {
  initWebSocket,
  broadcast,
  sendToUser,
  getConnectedUsers,
  getConnectionCount
};
