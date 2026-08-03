export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

export type RequestType = 'GET_AUTH_STATUS' | 'CONNECT_GOOGLE';

interface BaseRequest {
  requestId: string;
}

export interface GetAuthStatusRequest extends BaseRequest {
  type: 'GET_AUTH_STATUS';
}

export interface ConnectGoogleRequest extends BaseRequest {
  type: 'CONNECT_GOOGLE';
}

export type PopupRequest = GetAuthStatusRequest | ConnectGoogleRequest;

export interface AuthStatusResult {
  connected: boolean;
}

export interface ConnectResult {
  connected: boolean;
}

export type RequestData<T extends RequestType> = T extends 'GET_AUTH_STATUS'
  ? AuthStatusResult
  : T extends 'CONNECT_GOOGLE'
    ? ConnectResult
    : never;

export interface AppError {
  code: string;
  message: string;
  retryable: boolean;
}

export type PopupReply<T extends RequestType = RequestType> =
  | { type: T; requestId: string; ok: true; data: RequestData<T> }
  | { type: T; requestId: string; ok: false; error: AppError };
