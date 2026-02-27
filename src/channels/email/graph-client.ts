import { ConfidentialClientApplication } from "@azure/msal-node";
import type {
  M365Config,
  M365ConnectionTest,
  GraphMailMessage,
  GraphMailFolder,
  GraphUser,
} from "./types.js";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const GRAPH_SCOPE = "https://graph.microsoft.com/.default";

/**
 * Microsoft Graph API client for M365/Exchange email access.
 * Uses Application Permissions (client_credentials flow) — no browser login needed.
 * Requires Azure AD admin consent for Mail.Read, Mail.ReadWrite, Mail.Send.
 */
export class GraphClient {
  private readonly msalApp: ConfidentialClientApplication;
  private readonly config: M365Config;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(config: M365Config) {
    this.config = config;
    this.msalApp = new ConfidentialClientApplication({
      auth: {
        clientId: config.clientId,
        authority: `https://login.microsoftonline.com/${config.tenantId}`,
        clientSecret: config.clientSecret,
      },
    });
  }

  // ---------- Authentication ----------

  private async getToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    const result = await this.msalApp.acquireTokenByClientCredential({
      scopes: [GRAPH_SCOPE],
    });

    if (!result?.accessToken) {
      throw new Error("Failed to acquire Microsoft Graph access token");
    }

    this.accessToken = result.accessToken;
    this.tokenExpiresAt = result.expiresOn?.getTime() ?? Date.now() + 3600_000;
    return this.accessToken;
  }

  // ---------- Connection Test ----------

  async testConnection(): Promise<M365ConnectionTest> {
    try {
      const user = await this.getUser(this.config.mailbox);
      if (!user) {
        return { success: false, error: `Mailbox "${this.config.mailbox}" not found` };
      }

      return {
        success: true,
        mailbox: user.mail ?? user.userPrincipalName,
        displayName: user.displayName,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("AADSTS")) {
        return { success: false, error: `Azure AD Fehler: ${extractAadError(msg)}` };
      }
      return { success: false, error: msg };
    }
  }

  // ---------- Users ----------

  async getUser(email: string): Promise<GraphUser | null> {
    const data = await this.graphGet<GraphUser>(`/users/${encodeURIComponent(email)}`);
    return data;
  }

  async listMailboxes(): Promise<GraphUser[]> {
    const data = await this.graphGet<{ value: GraphUser[] }>(
      "/users?$filter=assignedLicenses/$count ne 0&$count=true&$select=id,displayName,mail,userPrincipalName&$top=50",
      { ConsistencyLevel: "eventual" },
    );
    return data?.value ?? [];
  }

  // ---------- Mail Folders ----------

  async listFolders(): Promise<GraphMailFolder[]> {
    const data = await this.graphGet<{ value: GraphMailFolder[] }>(
      `/users/${enc(this.config.mailbox)}/mailFolders?$top=50`,
    );
    return data?.value ?? [];
  }

  async getFolderByName(name: string): Promise<GraphMailFolder | null> {
    const folders = await this.listFolders();
    return folders.find((f) => f.displayName.toLowerCase() === name.toLowerCase()) ?? null;
  }

  // ---------- Messages ----------

  async listMessages(folderId: string, top = 25): Promise<GraphMailMessage[]> {
    const data = await this.graphGet<{ value: GraphMailMessage[] }>(
      `/users/${enc(this.config.mailbox)}/mailFolders/${folderId}/messages?$top=${top}&$orderby=receivedDateTime desc`,
    );
    return data?.value ?? [];
  }

  async getMessage(messageId: string): Promise<GraphMailMessage | null> {
    return this.graphGet<GraphMailMessage>(
      `/users/${enc(this.config.mailbox)}/messages/${messageId}`,
    );
  }

  /**
   * Delta query for incremental sync — only returns new/changed messages since last call.
   * First call: returns all messages + deltaLink.
   * Subsequent calls with deltaLink: returns only changes.
   */
  async deltaMessages(folderId: string, deltaLink?: string | null): Promise<{
    messages: GraphMailMessage[];
    nextDeltaLink: string | null;
  }> {
    const url = deltaLink
      ?? `/users/${enc(this.config.mailbox)}/mailFolders/${folderId}/messages/delta?$select=id,subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,conversationId,isRead,importance,hasAttachments,internetMessageId,parentFolderId,categories&$top=50`;

    const messages: GraphMailMessage[] = [];
    let nextLink: string | null = url;
    let finalDeltaLink: string | null = null;

    interface DeltaPage {
      value: GraphMailMessage[];
      "@odata.nextLink"?: string;
      "@odata.deltaLink"?: string;
    }

    while (nextLink) {
      const data: DeltaPage | null = await this.graphGet<DeltaPage>(nextLink);

      if (!data) break;
      messages.push(...(data.value ?? []));
      nextLink = data["@odata.nextLink"] ?? null;
      finalDeltaLink = data["@odata.deltaLink"] ?? null;
    }

    return { messages, nextDeltaLink: finalDeltaLink };
  }

  async markAsRead(messageId: string): Promise<void> {
    await this.graphPatch(
      `/users/${enc(this.config.mailbox)}/messages/${messageId}`,
      { isRead: true },
    );
  }

  // ---------- Send / Reply ----------

  async sendMail(
    to: string[],
    subject: string,
    body: string,
    cc?: string[],
    replyToMessageId?: string,
  ): Promise<void> {
    if (replyToMessageId) {
      await this.graphPost(
        `/users/${enc(this.config.mailbox)}/messages/${replyToMessageId}/reply`,
        {
          message: {
            toRecipients: to.map(addr),
            ccRecipients: (cc ?? []).map(addr),
          },
          comment: body,
        },
      );
    } else {
      await this.graphPost(
        `/users/${enc(this.config.mailbox)}/sendMail`,
        {
          message: {
            subject,
            body: { contentType: "HTML", content: body },
            toRecipients: to.map(addr),
            ccRecipients: (cc ?? []).map(addr),
          },
        },
      );
    }
  }

  async createDraft(
    to: string[],
    subject: string,
    body: string,
    cc?: string[],
  ): Promise<GraphMailMessage | null> {
    return this.graphPost<GraphMailMessage>(
      `/users/${enc(this.config.mailbox)}/messages`,
      {
        subject,
        body: { contentType: "HTML", content: body },
        toRecipients: to.map(addr),
        ccRecipients: (cc ?? []).map(addr),
      },
    );
  }

  async sendDraft(draftId: string): Promise<void> {
    await this.graphPost(`/users/${enc(this.config.mailbox)}/messages/${draftId}/send`, {});
  }

  // ---------- Graph HTTP ----------

  private async graphGet<T>(urlOrPath: string, extraHeaders?: Record<string, string>): Promise<T | null> {
    const token = await this.getToken();
    const url = urlOrPath.startsWith("http") ? urlOrPath : `${GRAPH_BASE}${urlOrPath}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, ...extraHeaders },
    });

    if (!res.ok) {
      if (res.status === 404) return null;
      const body = await res.text();
      throw new Error(`Graph GET ${res.status}: ${body}`);
    }

    return res.json() as Promise<T>;
  }

  private async graphPost<T>(path: string, body: unknown): Promise<T | null> {
    const token = await this.getToken();
    const res = await fetch(`${GRAPH_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Graph POST ${res.status}: ${text}`);
    }

    if (res.status === 202 || res.status === 204) return null;
    return res.json() as Promise<T>;
  }

  private async graphPatch(path: string, body: unknown): Promise<void> {
    const token = await this.getToken();
    const res = await fetch(`${GRAPH_BASE}${path}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Graph PATCH ${res.status}: ${text}`);
    }
  }
}

function enc(email: string): string {
  return encodeURIComponent(email);
}

function addr(email: string): { emailAddress: { address: string } } {
  return { emailAddress: { address: email } };
}

function extractAadError(msg: string): string {
  const match = msg.match(/AADSTS\d+:\s*(.+?)(?:\r?\n|$)/);
  return match?.[1] ?? msg;
}
