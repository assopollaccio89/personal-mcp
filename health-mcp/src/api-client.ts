const OPEN_WEARABLES_URL = process.env.OPEN_WEARABLES_URL || "http://localhost:8080";

export class HealthApiClient {
  private async request<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${OPEN_WEARABLES_URL}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Open-Wearables API error ${response.status}: ${response.statusText}`);
    }

    return await response.json() as T;
  }

  getDailySummary(date: string) {
    return this.request("/api/v1/metrics/daily", { date });
  }

  getHeartRate(date: string) {
    return this.request("/api/v1/metrics/heart-rate", { date });
  }

  getSleep(date: string) {
    return this.request("/api/v1/metrics/sleep", { date });
  }

  getActivities(limit: number = 5) {
    return this.request("/api/v1/activities", { limit: limit.toString() });
  }

  getBodyMetrics() {
    return this.request("/api/v1/metrics/body");
  }
}
