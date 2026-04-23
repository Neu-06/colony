import { Injectable, signal, computed } from '@angular/core';
import { Client } from '@stomp/stompjs';
import { Subject } from 'rxjs';

export interface CollabAction {
  type: string;
  payload: any;
  senderId: string;
}

@Injectable({
  providedIn: 'root'
})
export class CollabService {
  private client: Client | null = null;
  private currentRoom: string | null = null;
  public readonly clientId = Math.random().toString(36).substring(2, 9);
  
  private _isInitiator = signal(false);
  private _roomCode = signal<string | null>(null);
  
  public isInitiator = this._isInitiator.asReadonly();
  public roomCode = this._roomCode.asReadonly();
  public isConnected = computed(() => this._roomCode() !== null);
  
  public actionReceived$ = new Subject<CollabAction>();

  public createRoom(): void {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    this._isInitiator.set(true);
    this._roomCode.set(code);
    this.connectToRoom(code);
  }

  public joinRoom(code: string): void {
    this._isInitiator.set(false);
    this._roomCode.set(code);
    this.connectToRoom(code);
  }

  public leaveRoom(): void {
    if (this._isInitiator()) {
      // Notify others that the room is closed
      this.sendAction({ type: 'ROOM_CLOSED', payload: null });
    }
    
    if (this.client) {
      this.client.deactivate();
      this.client = null;
    }
    this._roomCode.set(null);
    this._isInitiator.set(false);
    this.currentRoom = null;
  }

  private connectToRoom(code: string): void {
    this.currentRoom = code;
    
    this.client = new Client({
      brokerURL: 'ws://localhost:8080/ws-collab',
      reconnectDelay: 5000,
      onConnect: () => {
        if (this.client && this.currentRoom) {
          this.client.subscribe(`/topic/canvas/${this.currentRoom}`, (message) => {
            const action: CollabAction = JSON.parse(message.body);
            if (action.senderId !== this.clientId) {
              this.actionReceived$.next(action);
            }
          });
          
          if (!this._isInitiator()) {
            this.sendAction({ type: 'GUEST_JOINED', payload: null });
          }
        }
      }
    });
    
    this.client.activate();
  }

  public sendAction(action: Omit<CollabAction, 'senderId'>): void {
    if (this.client && this.client.connected && this.currentRoom) {
      const fullAction: CollabAction = { ...action, senderId: this.clientId };
      this.client.publish({
        destination: `/app/canvas/${this.currentRoom}/action`,
        body: JSON.stringify(fullAction)
      });
    }
  }
}
