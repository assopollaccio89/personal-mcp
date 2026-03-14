const BASE_URL = "https://rest.budgetbakers.com/wallet/v1/api";

export interface ApiResponse<T> {
  data: T;
  nextOffset?: number;
  rateLimitRemaining?: number;
}

export class WalletApiClient {
  private token: string;
  private baseUrl: string;

  constructor(token: string, baseUrl?: string) {
    this.token = token;
    this.baseUrl = baseUrl ?? BASE_URL;
  }

  async request<T>(
    endpoint: string,
    params?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== "") {
          url.searchParams.set(key, value);
        }
      }
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
      },
    });

    const rateLimitRemaining = response.headers.get("X-RateLimit-Remaining");

    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      throw new Error(
        `Rate limit exceeded (500 req/hr). Retry after ${retryAfter ?? "unknown"} seconds. ` +
          `Remaining: ${rateLimitRemaining ?? "0"}`
      );
    }

    if (response.status === 409) {
      throw new Error(
        "Data sync in progress on BudgetBakers servers. Try again in a few moments."
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        "Authentication failed. Your API token may have expired. " +
          "Generate a new one from Wallet web app: Settings > API."
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `API error ${response.status}: ${response.statusText}. ${body}`
      );
    }

    const data = (await response.json()) as T;

    return {
      data,
      rateLimitRemaining: rateLimitRemaining
        ? parseInt(rateLimitRemaining, 10)
        : undefined,
    };
  }

  getRecords(params?: Record<string, string>) {
    return this.request("/records", params);
  }

  getRecordById(id: string) {
    return this.request("/records/by-id", { id });
  }

  getAccounts(params?: Record<string, string>) {
    return this.request("/accounts", params);
  }

  getCategories(params?: Record<string, string>) {
    return this.request("/categories", params);
  }

  getBudgets(params?: Record<string, string>) {
    return this.request("/budgets", params);
  }

  getGoals(params?: Record<string, string>) {
    return this.request("/goals", params);
  }

  getStandingOrders(params?: Record<string, string>) {
    return this.request("/standing-orders", params);
  }

  getLabels(params?: Record<string, string>) {
    return this.request("/labels", params);
  }

  getRecordRules(params?: Record<string, string>) {
    return this.request("/record-rules", params);
  }

  getApiUsage() {
    return this.request("/api-usage/stats");
  }
}
