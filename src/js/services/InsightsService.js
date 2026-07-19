// src/js/services/InsightsService.js
import { getAllFromStore } from '../db.js';

const roundMoney = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

class GlobalInsightsService {
  processAnalytics(events, targetEmail = null, days = 30) {
    const data = {
      total: 0,
      categories: {},
      dayOfWeek: { 'Sun': 0, 'Mon': 0, 'Tue': 0, 'Wed': 0, 'Thu': 0, 'Fri': 0, 'Sat': 0 },
      trendLine: []
    };

    const now = new Date();
    const cutoffDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    
    const dateBuckets = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      dateBuckets[d.toISOString().split('T')[0]] = 0;
    }

    const processedIds = new Set();
    const deletedIds = new Set();

    events.forEach(e => {
      if (e.event_type === 'EXPENSE_DELETE') {
        const p = typeof e.payload_json === 'string' ? JSON.parse(e.payload_json) : e.payload_json;
        deletedIds.add(p.target_event_id);
      }
    });

    for (const event of events) {
      const id = event.eventId || event.event_id;
      if (processedIds.has(id) || deletedIds.has(id) || event.event_type !== 'EXPENSE_ADD') continue;
      processedIds.add(id);

      const payload = typeof event.payload_json === 'string' ? JSON.parse(event.payload_json) : event.payload_json;
      const eventDate = new Date(payload.custom_timestamp || event.timestamp);
      
      if (eventDate < cutoffDate) continue;

      let validAmount = 0;
      if (targetEmail) {
        const alloc = (payload.allocations || []).find(a => a.user === targetEmail);
        if (alloc) validAmount = parseFloat(alloc.value) || 0;
      } else {
        validAmount = parseFloat(payload.evaluated_amount) || 0;
      }

      if (validAmount <= 0) continue;
      validAmount = roundMoney(validAmount);

      data.total = roundMoney(data.total + validAmount);
      
      const cat = payload.category || 'General';
      data.categories[cat] = roundMoney((data.categories[cat] || 0) + validAmount);

      const dayName = eventDate.toLocaleDateString('en-US', { weekday: 'short' });
      data.dayOfWeek[dayName] = roundMoney(data.dayOfWeek[dayName] + validAmount);

      const dateStr = eventDate.toISOString().split('T')[0];
      if (dateBuckets[dateStr] !== undefined) {
        dateBuckets[dateStr] = roundMoney(dateBuckets[dateStr] + validAmount);
      }
    }

    data.trendLine = Object.keys(dateBuckets).sort().map(k => dateBuckets[k]);
    return data;
  }

  async getGlobalAnalytics(userEmail, days = 30) {
    const rawEvents = await getAllFromStore('group_events_cache');
    return this.processAnalytics(rawEvents, userEmail, days);
  }
}

export const InsightsService = new GlobalInsightsService();