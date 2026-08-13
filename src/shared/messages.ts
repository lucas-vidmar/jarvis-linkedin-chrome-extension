export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

import type { JarvisEnvelope } from '@/shared/composer';

export type RequestType =
  | 'GET_AUTH_STATUS'
  | 'CONNECT_GOOGLE'
  | 'DISCONNECT_GOOGLE'
  | 'SEND_SYNC_EMAIL'
  | 'OPEN_DRAFT_FALLBACK'
  | 'CONFIRM_DRAFT_SENT';

interface BaseRequest {
  requestId: string;
}

export interface GetAuthStatusRequest extends BaseRequest {
  type: 'GET_AUTH_STATUS';
}

export interface ConnectGoogleRequest extends BaseRequest {
  type: 'CONNECT_GOOGLE';
}

export interface DisconnectGoogleRequest extends BaseRequest {
  type: 'DISCONNECT_GOOGLE';
}

export interface SendSyncEmailRequest extends BaseRequest {
  type: 'SEND_SYNC_EMAIL';
  syncId: string;
  contactUrl: string;
  envelope: JarvisEnvelope;
}

export interface OpenDraftFallbackRequest extends BaseRequest {
  type: 'OPEN_DRAFT_FALLBACK';
  url: string;
}

export interface ConfirmDraftSentRequest extends BaseRequest {
  type: 'CONFIRM_DRAFT_SENT';
  contactUrl: string;
  syncId: string;
  lastMessageFingerprint: string | null;
  composedAtEpochMs: number;
}

export type PopupRequest =
  | GetAuthStatusRequest
  | ConnectGoogleRequest
  | DisconnectGoogleRequest
  | SendSyncEmailRequest
  | OpenDraftFallbackRequest
  | ConfirmDraftSentRequest;

export interface AuthStatusResult {
  connected: boolean;
  email?: string;
}

export interface ConnectResult {
  connected: boolean;
}

export interface DisconnectResult {
  disconnected: boolean;
}

export interface SendSyncEmailResult {
  messageId: string;
}

export interface OpenDraftFallbackResult {
  opened: boolean;
}

export interface ConfirmDraftSentResult {
  confirmed: boolean;
}

export type RequestData<T extends RequestType> = T extends 'GET_AUTH_STATUS'
  ? AuthStatusResult
  : T extends 'CONNECT_GOOGLE'
    ? ConnectResult
    : T extends 'DISCONNECT_GOOGLE'
      ? DisconnectResult
      : T extends 'SEND_SYNC_EMAIL'
        ? SendSyncEmailResult
        : T extends 'OPEN_DRAFT_FALLBACK'
          ? OpenDraftFallbackResult
          : T extends 'CONFIRM_DRAFT_SENT'
            ? ConfirmDraftSentResult
            : never;

export interface AppError {
  code: string;
  message: string;
  retryable: boolean;
}

export type SyncEmailReply =
  | { type: 'SEND_SYNC_EMAIL'; requestId: string; ok: true; data: SendSyncEmailResult }
  | { type: 'SEND_SYNC_EMAIL'; requestId: string; ok: false; error: AppError };

export type PopupReply<T extends RequestType = RequestType> =
  | { type: T; requestId: string; ok: true; data: RequestData<T> }
  | { type: T; requestId: string; ok: false; error: AppError };
