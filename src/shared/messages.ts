export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

export type RequestType = 'GET_AUTH_STATUS' | 'CONNECT_GOOGLE' | 'DISCONNECT_GOOGLE';

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

export type PopupRequest =
  | GetAuthStatusRequest
  | ConnectGoogleRequest
  | DisconnectGoogleRequest;

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

export type RequestData<T extends RequestType> = T extends 'GET_AUTH_STATUS'
  ? AuthStatusResult
  : T extends 'CONNECT_GOOGLE'
    ? ConnectResult
    : T extends 'DISCONNECT_GOOGLE'
      ? DisconnectResult
      : never;

export interface AppError {
  code: string;
  message: string;
  retryable: boolean;
}

export type PopupReply<T extends RequestType = RequestType> =
  | { type: T; requestId: string; ok: true; data: RequestData<T> }
  | { type: T; requestId: string; ok: false; error: AppError };
