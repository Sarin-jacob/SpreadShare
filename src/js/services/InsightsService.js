// src/js/services/InsightsService.js
import { getAllFromStore } from '../db.js';

// Helper to prevent JavaScript floating point precision issues
const roundMoney = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

class GlobalInsightsService {
  
  /**
   * Scans the entire local cache across all groups to build a unified profile
   * of the user's personal spending habits.
   * 
   * @param {string} userEmail - The currently authenticated user's email
   * @returns {Object} Aggregated metrics by category, time, and group
   */
  async generateUserInsights(userEmail) {
    // 1. Pull every single event ever synced to this device
    const rawEvents = await getAllFromStore('group_events_cache');
    if (!rawEvents || rawEvents.length === 0) return this.getEmptyInsights();

    const processedEventIds = new Set();
    const deletedEventIds = new Set();

    // 2. Sort chronologically and extract global deletions
    const events = [...rawEvents].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    events.forEach(e => {
      const id = e.eventId || e.event_id;
      if (e.event_type === 'EXPENSE_DELETE') {
        const payload = typeof e.payload_json === 'string' ? JSON.parse(e.payload_json) : e.payload_json;
        deletedEventIds.add(payload.target_event_id);
      }
    });

    const insights = this.getEmptyInsights();

    // Establish time boundaries based on current client clock
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    // 3. Process the unified stream
    for (const event of events) {
      const id = event.eventId || event.event_id;
      
      // Enforce deduplication and deletion states
      if (processedEventIds.has(id) || deletedEventIds.has(id) || event.event_type === 'EXPENSE_DELETE') {
        continue;
      }
      processedEventIds.add(id);

      // Only standard expenses represent actual consumed value. 
      // Loans and transfers are balance sheet movements.
      if (event.event_type !== 'EXPENSE_ADD') continue;

      const payload = typeof event.payload_json === 'string' ? JSON.parse(event.payload_json) : event.payload_json;
      
      // 4. Extract the user's personal consumption for this specific event
      let userPersonalCost = 0;
      if (payload.allocations && payload.allocations.length > 0) {
        const userAlloc = payload.allocations.find(a => a.user === userEmail);
        if (userAlloc) userPersonalCost = parseFloat(userAlloc.value) || 0;
      }

      // Skip if the user had no financial stake in this specific split
      if (userPersonalCost <= 0) continue; 

      userPersonalCost = roundMoney(userPersonalCost);
      const category = payload.category || 'General';
      const eventDate = new Date(payload.custom_timestamp || event.timestamp);

      // --- AGGREGATION PIPELINE ---

      // Global Sum
      insights.totalPersonalExpense = roundMoney(insights.totalPersonalExpense + userPersonalCost);

      // Category Matrix
      if (!insights.byCategory[category]) insights.byCategory[category] = 0;
      insights.byCategory[category] = roundMoney(insights.byCategory[category] + userPersonalCost);

      // Temporal Matrix
      if (eventDate >= oneWeekAgo) {
        insights.byTime.lastWeek = roundMoney(insights.byTime.lastWeek + userPersonalCost);
      }
      if (eventDate >= oneMonthAgo) {
        insights.byTime.lastMonth = roundMoney(insights.byTime.lastMonth + userPersonalCost);
      }
      if (eventDate >= oneYearAgo) {
        insights.byTime.lastYear = roundMoney(insights.byTime.lastYear + userPersonalCost);
      }
      
      // Group Distribution Matrix
      const groupId = event.spreadsheetId;
      if (!insights.byGroup[groupId]) insights.byGroup[groupId] = 0;
      insights.byGroup[groupId] = roundMoney(insights.byGroup[groupId] + userPersonalCost);
    }

    return insights;
  }

  getEmptyInsights() {
    return {
      totalPersonalExpense: 0,
      byCategory: {},
      byTime: { lastWeek: 0, lastMonth: 0, lastYear: 0 },
      byGroup: {} 
    };
  }
}

export const InsightsService = new GlobalInsightsService();