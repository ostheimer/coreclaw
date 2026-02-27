import type { KnowledgeSource, KnowledgeRecord, SearchOptions } from "./types.js";

interface WpConfig {
  url: string;
  user: string;
  appPassword: string;
}

/**
 * WordPress REST API knowledge source.
 * Reads posts, custom post types, pages, and users.
 * Supports WP Application Passwords for authentication.
 */
export class WordPressSource implements KnowledgeSource {
  readonly name = "wordpress";
  readonly type = "cms";
  private readonly config: WpConfig;
  private readonly headers: Record<string, string>;

  constructor(config?: Partial<WpConfig>) {
    this.config = {
      url: config?.url ?? process.env["WORDPRESS_URL"] ?? "",
      user: config?.user ?? process.env["WORDPRESS_USER"] ?? "",
      appPassword: config?.appPassword ?? process.env["WORDPRESS_APP_PASSWORD"] ?? "",
    };

    const auth = Buffer.from(`${this.config.user}:${this.config.appPassword}`).toString("base64");
    this.headers = {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/json",
    };
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await this.wpFetch("/wp-json/wp/v2/types");
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async search(query: string, options?: SearchOptions): Promise<KnowledgeRecord[]> {
    const limit = options?.limit ?? 10;
    const postType = options?.type ?? "posts";
    const endpoint = `/wp-json/wp/v2/${postType}?search=${encodeURIComponent(query)}&per_page=${limit}`;

    const res = await this.wpFetch(endpoint);
    if (!res.ok) return [];

    const posts = (await res.json()) as WpPost[];
    return posts.map((p) => this.postToRecord(p, postType));
  }

  async getById(id: string): Promise<KnowledgeRecord | null> {
    // Try common post types
    for (const type of ["posts", "pages"]) {
      const res = await this.wpFetch(`/wp-json/wp/v2/${type}/${id}`);
      if (res.ok) {
        const post = (await res.json()) as WpPost;
        return this.postToRecord(post, type);
      }
    }
    return null;
  }

  async getRelated(ref: string, options?: SearchOptions): Promise<KnowledgeRecord[]> {
    return this.search(ref, options);
  }

  /**
   * Get custom post type records (e.g., "cases", "products").
   */
  async getCustomPosts(postType: string, params?: Record<string, string>): Promise<KnowledgeRecord[]> {
    const query = new URLSearchParams({ per_page: "20", ...params });
    const res = await this.wpFetch(`/wp-json/wp/v2/${postType}?${query.toString()}`);
    if (!res.ok) return [];

    const posts = (await res.json()) as WpPost[];
    return posts.map((p) => this.postToRecord(p, postType));
  }

  /**
   * Create or update a post/custom post type.
   */
  async upsertPost(
    postType: string,
    data: { id?: number; title: string; content: string; status?: string; meta?: Record<string, unknown> },
  ): Promise<KnowledgeRecord | null> {
    const endpoint = data.id
      ? `/wp-json/wp/v2/${postType}/${data.id}`
      : `/wp-json/wp/v2/${postType}`;
    const method = data.id ? "PUT" : "POST";

    const res = await this.wpFetch(endpoint, {
      method,
      body: JSON.stringify({
        title: data.title,
        content: data.content,
        status: data.status ?? "publish",
        meta: data.meta,
      }),
    });

    if (!res.ok) return null;
    const post = (await res.json()) as WpPost;
    return this.postToRecord(post, postType);
  }

  // ---------- Helpers ----------

  private async wpFetch(endpoint: string, init?: RequestInit): Promise<Response> {
    const url = `${this.config.url.replace(/\/$/, "")}${endpoint}`;
    return fetch(url, { ...init, headers: { ...this.headers, ...init?.headers } });
  }

  private postToRecord(post: WpPost, postType: string): KnowledgeRecord {
    return {
      id: String(post.id),
      source: "wordpress",
      type: postType,
      title: post.title?.rendered ?? "",
      content: stripHtml(post.content?.rendered ?? ""),
      url: post.link,
      metadata: {
        status: post.status,
        author: post.author,
        categories: post.categories,
        tags: post.tags,
        meta: post.meta,
        modified: post.modified,
      },
      updatedAt: post.modified ?? post.date ?? new Date().toISOString(),
    };
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&[a-z]+;/g, " ").trim();
}

interface WpPost {
  id: number;
  title?: { rendered: string };
  content?: { rendered: string };
  status?: string;
  link?: string;
  author?: number;
  date?: string;
  modified?: string;
  categories?: number[];
  tags?: number[];
  meta?: Record<string, unknown>;
}
