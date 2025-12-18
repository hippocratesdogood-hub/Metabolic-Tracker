import type { User, MetricEntry, FoodEntry, Conversation, Message } from "@shared/schema";

class ApiClient {
  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`/api${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      credentials: "include",
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: "Request failed" }));
      throw new Error(error.message || "Request failed");
    }

    return response.json();
  }

  // Auth
  async signup(data: { email: string; name: string; passwordHash: string; role?: string }) {
    return this.request<{ user: any }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async login(email: string, password: string) {
    return this.request<{ user: any }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  async logout() {
    return this.request("/auth/logout", { method: "POST" });
  }

  async getCurrentUser() {
    return this.request<{ user: any }>("/auth/me");
  }

  // Users
  async updateUser(id: string, data: Partial<User>) {
    return this.request<User>(`/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  // Metrics
  async createMetricEntry(entry: {
    type: string;
    valueJson: any;
    timestamp?: Date;
    notes?: string;
  }) {
    return this.request<MetricEntry>("/metrics", {
      method: "POST",
      body: JSON.stringify(entry),
    });
  }

  async getMetricEntries(params?: { type?: string; from?: string; to?: string }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request<MetricEntry[]>(`/metrics${query ? `?${query}` : ""}`);
  }

  async updateMetricEntry(id: string, data: Partial<MetricEntry>) {
    return this.request<MetricEntry>(`/metrics/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteMetricEntry(id: string) {
    return this.request(`/metrics/${id}`, { method: "DELETE" });
  }

  // Food
  async createFoodEntry(entry: {
    inputType: string;
    mealType?: string;
    rawText?: string;
    timestamp?: Date;
    aiOutputJson?: any;
  }) {
    return this.request<FoodEntry>("/food", {
      method: "POST",
      body: JSON.stringify(entry),
    });
  }

  async getFoodEntries(params?: { from?: string; to?: string }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request<FoodEntry[]>(`/food${query ? `?${query}` : ""}`);
  }

  async updateFoodEntry(id: string, data: Partial<FoodEntry>) {
    return this.request<FoodEntry>(`/food/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async analyzeFoodEntry(rawText: string, timestamp?: Date) {
    return this.request<any>("/food/analyze", {
      method: "POST",
      body: JSON.stringify({ rawText, timestamp }),
    });
  }

  // Macro Targets
  async getMacroTargets() {
    return this.request<any>("/macro-targets");
  }

  async updateMacroTargets(data: any, userId?: string) {
    return this.request<any>("/macro-targets", {
      method: "PUT",
      body: JSON.stringify({ ...data, userId }),
    });
  }

  async getMacroProgress(date?: string) {
    const query = date ? `?date=${date}` : "";
    return this.request<any>(`/macro-progress${query}`);
  }

  // Admin
  async getParticipants() {
    return this.request<any[]>("/admin/participants");
  }

  async getParticipantMacroTargets(userId: string) {
    return this.request<any>(`/admin/participants/${userId}/macro-targets`);
  }

  // Messaging
  async getConversations() {
    return this.request<Conversation[]>("/conversations");
  }

  async createConversation(coachId: string) {
    return this.request<Conversation>("/conversations", {
      method: "POST",
      body: JSON.stringify({ coachId }),
    });
  }

  async getMessages(conversationId: string) {
    return this.request<Message[]>(`/conversations/${conversationId}/messages`);
  }

  async createMessage(conversationId: string, body: string) {
    return this.request<Message>("/messages", {
      method: "POST",
      body: JSON.stringify({ conversationId, body }),
    });
  }
}

export const api = new ApiClient();
