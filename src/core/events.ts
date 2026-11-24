import { EventEmitter } from 'node:events';
import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { Context } from './types.js';
import type { Store } from './store.js';
import { resolveToken } from './auth.js';
import { hasPermission, type Permission } from './rbac.js';

interface Client {
  socket: WebSocket;
  ctx: Context;
}

export const bus = new EventEmitter();

export class EventHub {
  private wss: WebSocketServer | null = null;
  private clients = new Set<Client>();

  constructor(private store: Store) {}

  attach(server: Server): void {
    this.wss = new WebSocketServer({ noServer: true });
    server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
      if (url.pathname !== '/ws') {
        socket.destroy();
        return;
      }
      const token = url.searchParams.get('token') || '';
      void resolveToken(this.store, token, request.socket.remoteAddress || '', String(request.headers['user-agent'] || ''))
        .then((ctx) => {
          if (!ctx) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
          }
          this.wss!.handleUpgrade(request, socket, head, (ws) => {
            this.clients.add({ socket: ws, ctx });
            ws.on('close', () => this.clients.delete(this.clientsBySocket(ws)));
            ws.on('message', (data) => {
              try {
                const message = JSON.parse(String(data)) as { type?: string };
                if (message.type === 'ping') ws.send(JSON.stringify({ type: 'pong', at: Date.now() }));
              } catch { /* ignore invalid frames */ }
            });
            ws.send(JSON.stringify({ type: 'connected', businessId: ctx.businessId, at: Date.now() }));
          });
        })
        .catch(() => {
          socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
          socket.destroy();
        });
    });
  }

  private clientsBySocket(socket: WebSocket): Client {
    let found: Client | undefined;
    this.clients.forEach((client) => { if (client.socket === socket) found = client; });
    return found as Client;
  }

  async broadcast(ctx: Context, type: string, payload: Record<string, unknown>, audience?: Permission): Promise<void> {
    const message = JSON.stringify({ type, payload, businessId: ctx.businessId, at: Date.now() });
    for (const client of this.clients) {
      if (client.ctx.businessId !== ctx.businessId) continue;
      if (audience && !(await hasPermission(client.ctx, audience, this.store))) continue;
      if (client.socket.readyState === WebSocket.OPEN) client.socket.send(message);
    }
    bus.emit(type, { ctx, payload });
  }

  close(): void {
    for (const client of this.clients) client.socket.close();
    this.wss?.close();
  }
}
