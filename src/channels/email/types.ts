/**
 * Types for the Microsoft 365 / Exchange email channel.
 * Uses Microsoft Graph API with Application Permissions (client_credentials).
 */

export interface M365Config {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  /** The mailbox to monitor, e.g. "support@firma.com" */
  mailbox: string;
  /** Sync interval in seconds (default: 60) */
  syncIntervalSec: number;
  /** Only sync emails from this folder (default: "Inbox") */
  folder: string;
  /** Mark emails as read after processing */
  markAsRead: boolean;
}

export interface M365SetupStep {
  step: number;
  title: string;
  description: string;
  completed: boolean;
}

export interface M365ConnectionTest {
  success: boolean;
  mailbox?: string;
  displayName?: string;
  mailboxCount?: number;
  error?: string;
}

export interface GraphMailMessage {
  id: string;
  subject: string | null;
  bodyPreview: string;
  body: { contentType: string; content: string };
  from: { emailAddress: { name: string; address: string } };
  toRecipients: Array<{ emailAddress: { name: string; address: string } }>;
  ccRecipients: Array<{ emailAddress: { name: string; address: string } }>;
  receivedDateTime: string;
  sentDateTime: string;
  conversationId: string;
  isRead: boolean;
  importance: string;
  hasAttachments: boolean;
  internetMessageId: string;
  parentFolderId: string;
  categories: string[];
}

export interface GraphMailFolder {
  id: string;
  displayName: string;
  totalItemCount: number;
  unreadItemCount: number;
}

export interface GraphUser {
  id: string;
  displayName: string;
  mail: string;
  userPrincipalName: string;
}

export interface DeltaSyncState {
  deltaLink: string | null;
  lastSyncAt: string;
  messagesProcessed: number;
}

export const DEFAULT_M365_CONFIG: M365Config = {
  tenantId: "",
  clientId: "",
  clientSecret: "",
  mailbox: "",
  syncIntervalSec: 60,
  folder: "Inbox",
  markAsRead: true,
};
