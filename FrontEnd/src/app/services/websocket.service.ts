import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { environment } from '../../environments/environment';

interface WebSocketMessage {
  type: string;
  payload: any;
}

@Injectable({
  providedIn: 'root'
})
export class WebsocketService {
  private socket: WebSocket | null = null;
  private connected$ = new BehaviorSubject<boolean>(false);
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 1;
  private reconnectInterval = 2000; // 2 seconds
  private reconnectTimer: any = null;
  private platformId = inject(PLATFORM_ID);
  private isBrowser: boolean;

  // Event streams
  private uploadComplete$ = new Subject<any>();
  private uploadFailure$ = new Subject<any>();
  private processingStatus$ = new Subject<any>();
  private folderDownloadReady$ = new Subject<any>();
  private folderDownloadError$ = new Subject<any>();

  constructor() {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  /**
   * Connect to WebSocket server
   */
  connect(): void {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const wsUrl = `${environment.apiUrl}/ws`;


    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.connected$.next(true);
        this.reconnectAttempts = 0;
        this.clearReconnectTimer();
      };

      this.socket.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      this.socket.onclose = (event) => {
        this.connected$.next(false);
        this.handleReconnect();
      };

    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      this.handleReconnect();
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.clearReconnectTimer();
    this.connected$.next(false);
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): Observable<boolean> {
    return this.connected$.asObservable();
  }

  /**
   * Send message to server
   */
  send(type: string, payload: any): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({ type, payload });
      this.socket.send(message);
    } else {
      console.warn('WebSocket not connected. Cannot send message:', type);
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(message: WebSocketMessage): void {

    switch (message.type) {
      case 'connected':
        console.log('WebSocket handshake complete:', message.payload);
        break;

      case 'uploadComplete':
        this.uploadComplete$.next(message.payload);
        break;

      case 'uploadFailure':
        this.uploadFailure$.next(message.payload);
        break;

      case 'processingStatus':
        this.processingStatus$.next(message.payload);
        break;

      case 'folderDownloadReady':
        this.folderDownloadReady$.next(message.payload);
        break;

      case 'folderDownloadError':
        this.folderDownloadError$.next(message.payload);
        break;

      case 'pong':
        // Heartbeat response
        break;

      case 'error':
        console.error('WebSocket error message:', message.payload);
        break;

      default:
        console.warn('Unknown WebSocket message type:', message.type);
    }
  }

  /**
   * Handle WebSocket reconnection
   */
  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached. Giving up.');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Clear reconnection timer
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Observable for upload complete events
   */
  onUploadComplete(): Observable<any> {
    return this.uploadComplete$.asObservable();
  }

  /**
   * Observable for upload failure events
   */
  onUploadFailure(): Observable<any> {
    return this.uploadFailure$.asObservable();
  }

  /**
   * Observable for processing status events
   */
  onProcessingStatus(): Observable<any> {
    return this.processingStatus$.asObservable();
  }

  /**
   * Observable for folder download ready events
   */
  onFolderDownloadReady(): Observable<any> {
    return this.folderDownloadReady$.asObservable();
  }

  /**
   * Observable for folder download error events
   */
  onFolderDownloadError(): Observable<any> {
    return this.folderDownloadError$.asObservable();
  }

  /**
   * Send ping to keep connection alive
   */
  ping(): void {
    this.send('ping', { timestamp: Date.now() });
  }

  /**
   * Notify server of upload progress
   */
  reportUploadProgress(uploadId: string, progress: number, context: string): void {
    this.send('uploadProgress', {
      uploadId,
      progress,
      context,
      timestamp: Date.now()
    });
  }

  /**
   * Notify server of upload completion with full metadata for processing
   */
  reportUploadComplete(uploadId: string, context: string, files: any[], metadata: any = {}): void {
    this.send('uploadComplete', {
      uploadId,
      context,
      files,
      ...metadata,
      timestamp: Date.now()
    });
  }

  /**
   * Notify server of upload failure
   */
  reportUploadFailure(uploadId: string, context: string, error: string): void {
    this.send('uploadFailure', {
      uploadId,
      context,
      error,
      timestamp: Date.now()
    });
  }
}
