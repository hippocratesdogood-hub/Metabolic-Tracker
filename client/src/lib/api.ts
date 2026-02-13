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

  async changePassword(newPassword: string) {
    return this.request<{ message: string }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ newPassword }),
    });
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
    tags?: any;
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

  async toggleFavorite(id: string) {
    return this.request<FoodEntry>(`/food/${id}/favorite`, {
      method: "PUT",
    });
  }

  async getFavorites() {
    return this.request<FoodEntry[]>("/food/favorites");
  }

  async deleteFoodEntry(id: string) {
    return this.request(`/food/${id}`, { method: "DELETE" });
  }

  async getFoodStreak() {
    return this.request<{
      streak: number;
      weekDays: { date: string; dayLabel: string; logged: boolean }[];
      daysLoggedThisWeek: number;
      totalDaysInWeek: number;
      message: string;
    }>("/food/streak");
  }

  async analyzeFoodEntry(rawText: string, timestamp?: Date) {
    return this.request<any>("/food/analyze", {
      method: "POST",
      body: JSON.stringify({ rawText, timestamp }),
    });
  }

  async analyzeFoodImage(imageFile: File, additionalText?: string) {
    const formData = new FormData();
    formData.append('image', imageFile);
    if (additionalText) {
      formData.append('text', additionalText);
    }
    
    const response = await fetch('/api/food/analyze-image', {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || 'Failed to analyze image');
    }
    
    return response.json();
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

  async setParticipantMacroTargets(userId: string, data: {
    calories?: number;
    proteinG?: number;
    carbsG?: number;
    fatG?: number;
    fiberG?: number;
  }) {
    return this.request<any>(`/admin/participants/${userId}/macro-targets`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async getAllUsers() {
    return this.request<any[]>("/admin/users");
  }

  async updateUserRole(userId: string, role: string) {
    return this.request<any>(`/admin/users/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
  }

  async getCoaches() {
    return this.request<any[]>("/admin/coaches");
  }

  async assignCoach(participantId: string, coachId: string) {
    return this.request<any>(`/admin/participants/${participantId}/assign-coach`, {
      method: "POST",
      body: JSON.stringify({ coachId }),
    });
  }

  async createParticipant(data: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    dateOfBirth?: string;
    coachId?: string;
    forcePasswordReset?: boolean;
  }) {
    return this.request<any>("/admin/participants", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateParticipant(id: string, data: any) {
    return this.request<any>(`/admin/participants/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async resetParticipantPassword(id: string, password: string, forcePasswordReset: boolean = true) {
    return this.request<any>(`/admin/participants/${id}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ password, forcePasswordReset }),
    });
  }

  // Admin - Prompts
  async getPrompts() {
    return this.request<any[]>("/admin/prompts");
  }

  async createPrompt(data: any) {
    return this.request<any>("/admin/prompts", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updatePrompt(id: string, data: any) {
    return this.request<any>(`/admin/prompts/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deletePrompt(id: string) {
    return this.request(`/admin/prompts/${id}`, { method: "DELETE" });
  }

  // Admin - Rules
  async getRules() {
    return this.request<any[]>("/admin/rules");
  }

  async createRule(data: any) {
    return this.request<any>("/admin/rules", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateRule(id: string, data: any) {
    return this.request<any>(`/admin/rules/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteRule(id: string) {
    return this.request(`/admin/rules/${id}`, { method: "DELETE" });
  }

  // Admin - Deliveries
  async getDeliveries(limit?: number) {
    const query = limit ? `?limit=${limit}` : "";
    return this.request<any[]>(`/admin/deliveries${query}`);
  }

  // Admin - Analytics
  async getAnalyticsOverview(range: number = 7, coachId?: string) {
    const params = new URLSearchParams({ range: range.toString() });
    if (coachId) params.append("coachId", coachId);
    return this.request<any>(`/admin/analytics/overview?${params}`);
  }

  async getAnalyticsFlags(range: number = 7, coachId?: string) {
    const params = new URLSearchParams({ range: range.toString() });
    if (coachId) params.append("coachId", coachId);
    return this.request<any>(`/admin/analytics/flags?${params}`);
  }

  async getAnalyticsMacros(range: number = 7, coachId?: string) {
    const params = new URLSearchParams({ range: range.toString() });
    if (coachId) params.append("coachId", coachId);
    return this.request<any>(`/admin/analytics/macros?${params}`);
  }

  async getAnalyticsOutcomes(range: number = 30, coachId?: string, compare: boolean = false) {
    const params = new URLSearchParams({ range: range.toString() });
    if (coachId) params.append("coachId", coachId);
    if (compare) params.append("compare", "true");
    return this.request<any>(`/admin/analytics/outcomes?${params}`);
  }

  async getAnalyticsCoaches(range: number = 7) {
    return this.request<any[]>(`/admin/analytics/coaches?range=${range}`);
  }

  async getAnalyticsTrends(range: number = 30, coachId?: string) {
    const params = new URLSearchParams({ range: range.toString() });
    if (coachId) params.append("coachId", coachId);
    return this.request<any[]>(`/admin/analytics/trends?${params}`);
  }

  async getAnalyticsDemographics(coachId?: string) {
    const params = new URLSearchParams();
    if (coachId) params.append("coachId", coachId);
    const query = params.toString();
    return this.request<any>(`/admin/analytics/demographics${query ? `?${query}` : ""}`);
  }

  // AI Report Assistant
  async askAIAssistant(messages: { role: "user" | "assistant"; content: string }[]) {
    return this.request<{ response: string }>("/admin/ai-assistant", {
      method: "POST",
      body: JSON.stringify({ messages }),
    });
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

  // Dashboard Stats (streak, trends)
  async getDashboardStats() {
    return this.request<{
      streak: number;
      daysInProgram: number;
      firstLogDate: string | null;
      totalLogs: number;
      trends: {
        weight: { direction: 'up' | 'down' | 'neutral'; value: string | null; isPositive: boolean };
        glucose: { direction: 'up' | 'down' | 'neutral'; value: string | null; isPositive: boolean };
        ketones: { direction: 'up' | 'down' | 'neutral'; value: string | null; isPositive: boolean };
        waist: { direction: 'up' | 'down' | 'neutral'; value: string | null; isPositive: boolean };
        bp: { direction: 'up' | 'down' | 'neutral'; value: string | null; isPositive: boolean };
      };
    }>("/dashboard-stats");
  }

  // Weekly Report
  async getWeeklyReport() {
    return this.request<{
      period: { start: string; end: string; label: string };
      streak: number;
      adherence: number;
      daysLogged: number;
      highlights: { type: 'positive' | 'negative'; text: string }[];
      averages: {
        glucose: number | null;
        glucoseVsPrev: number | null;
        ketones: number | null;
        ketonesVsPrev: number | null;
        weightChange: number | null;
      };
      nextFocus: string;
      metricsCount: {
        glucose: number;
        ketones: number;
        weight: number;
        meals: number;
      };
    }>("/reports/weekly");
  }
}

export const api = new ApiClient();
