import { WebSocketServer } from 'ws';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import Credentials from './Credentials.js';
import logger from '../utils/logger.js';
import websocketService from '../services/websocket.service.js';

/**
 * Initialize WebSocket server and integrate with Express HTTP server
 * @param {Object} httpServer - Express HTTP server instance
 * @param {Object} sessionMiddleware - Express session middleware
 * @returns {WebSocketServer} WebSocket server instance
 */
export function initializeWebSocketServer(httpServer, sessionMiddleware) {
  const wss = new WebSocketServer({ 
    server: httpServer,
    path: '/ws'
  });

  // Store client connections with metadata
  const clients = new Map();

  wss.on('connection', async (ws, request) => {
    logger.info('New WebSocket connection attempt');

    // Parse session from request
    try {
      // Use the session middleware to parse session
      await new Promise((resolve, reject) => {
        sessionMiddleware(request, {}, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const session = request.session;
      
      // Authenticate - require active admin session
      if (!session || !session.adminId) {
        logger.warn('WebSocket connection rejected: No valid session');
        ws.close(1008, 'Authentication required');
        return;
      }

      const clientId = session.adminId;
      
      // Store client connection
      clients.set(ws, {
        clientId,
        connectedAt: new Date(),
        activeUploads: new Map()
      });

      logger.info(`WebSocket client connected: ${clientId}`);

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connected',
        payload: {
          message: 'WebSocket connection established',
          clientId
        }
      }));

      // Handle incoming messages
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          handleClientMessage(ws, message, clients);
        } catch (err) {
          logger.error(`WebSocket message parse error: ${err.message}`);
          ws.send(JSON.stringify({
            type: 'error',
            payload: { message: 'Invalid message format' }
          }));
        }
      });

      // Handle connection close
      ws.on('close', () => {
        const clientData = clients.get(ws);
        if (clientData) {
          logger.info(`WebSocket client disconnected: ${clientData.clientId}`);
          clients.delete(ws);
        }
      });

      // Handle errors
      ws.on('error', (error) => {
        logger.error(`WebSocket error: ${error.message}`);
      });

      // Heartbeat mechanism
      ws.isAlive = true;
      ws.on('pong', () => {
        ws.isAlive = true;
      });

    } catch (err) {
      logger.error(`WebSocket authentication error: ${err.message}`);
      ws.close(1008, 'Authentication failed');
    }
  });

  // Heartbeat interval to detect broken connections
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        const clientData = clients.get(ws);
        if (clientData) {
          logger.info(`Terminating inactive WebSocket client: ${clientData.clientId}`);
          clients.delete(ws);
        }
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000); // 30 seconds

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  // Attach clients map for access by other modules (use different property name)
  wss.trackedClients = clients;

  return wss;
}

/**
 * Handle incoming client messages
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Parsed message object
 * @param {Map} clients - Map of connected clients
 */
function handleClientMessage(ws, message, clients) {
  const { type, payload } = message;
  const clientData = clients.get(ws);

  if (!clientData) {
    logger.warn('Received message from unauthenticated client');
    return;
  }

  logger.info(`WebSocket message from ${clientData.clientId}: ${type}`);

  switch (type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', payload: { timestamp: Date.now() } }));
      break;

    case 'uploadProgress':
      // Client reporting upload progress
      if (payload && payload.uploadId) {
        clientData.activeUploads.set(payload.uploadId, {
          ...payload,
          lastUpdate: new Date()
        });
      }
      break;

    case 'uploadComplete':
      // Client reporting upload completion - triggers processing
      if (payload && payload.uploadId) {
        clientData.activeUploads.delete(payload.uploadId);
      }
      
      if (payload && payload.files && payload.context) {
          logger.info(`Triggering processing for ${payload.files.length} files in context ${payload.context}`);
          for (const file of payload.files) {
              // Include foldername from payload or file object
              const fileWithFolder = {
                ...file,
                foldername: file.foldername || payload.foldername || null
              };
              websocketService.processUploadedFile(payload.context, fileWithFolder, clientData.clientId, payload.orderId);
          }
      }
      break;

    case 'uploadFailure':
      // Client reporting upload failure
      if (payload && payload.uploadId) {
        clientData.activeUploads.delete(payload.uploadId);
      }
      logger.warn(`Upload failure reported by ${clientData.clientId}: ${payload?.error}`);
      break;

    default:
      logger.warn(`Unknown WebSocket message type: ${type}`);
      ws.send(JSON.stringify({
        type: 'error',
        payload: { message: 'Unknown message type' }
      }));
  }
}

export default { initializeWebSocketServer };
