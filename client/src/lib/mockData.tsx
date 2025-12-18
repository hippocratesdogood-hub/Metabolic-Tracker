import React, { createContext, useContext, useState, useEffect } from 'react';
import { addDays, format, subDays, isSameDay } from 'date-fns';

// Types
export type Role = 'participant' | 'coach' | 'admin';
export type UnitsPreference = 'US' | 'Metric';

export type User = {
  id: string;
  role: Role;
  name: string;
  email: string;
  coachName: string;
  programStartDate: Date;
  timezone: string;
  units: UnitsPreference;
};

export type MetricType = 'BP' | 'WAIST' | 'GLUCOSE' | 'KETONES' | 'WEIGHT';

export type MetricEntry = {
  id: string;
  type: MetricType;
  value: number; // Normalized
  valueRaw?: any; // For BP {systolic, diastolic}
  unit: string;
  timestamp: Date;
  context?: string; // fasting, post-prandial
};

export type FoodEntry = {
  id: string;
  timestamp: Date;
  text: string;
  photoUrl?: string;
  macros: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  qualityScore: number;
  notes: string;
};

export type Message = {
  id: string;
  sender: 'user' | 'coach';
  text: string;
  timestamp: Date;
};

export type Prompt = {
  id: string;
  key: string;
  name: string;
  category: 'reminder' | 'intervention' | 'education';
  channel: 'in_app' | 'email' | 'sms';
  active: boolean;
  message_template: string;
  variables: string[];
};

export type PromptRule = {
  id: string;
  key: string;
  promptKey: string;
  trigger_type: 'schedule' | 'event' | 'missed';
  schedule_json: any | null;
  conditions_json: any | null;
  cooldown_hours: number;
  priority: number;
  active: boolean;
};

// Mock Data
const MOCK_USER: User = {
  id: 'u1',
  role: 'participant',
  name: 'Alex Rivera',
  email: 'alex@example.com',
  coachName: 'Dr. Sarah',
  programStartDate: subDays(new Date(), 14),
  timezone: 'America/Los_Angeles',
  units: 'US',
};

const GENERATE_METRICS = () => {
  const metrics: MetricEntry[] = [];
  for (let i = 0; i < 30; i++) {
    const date = subDays(new Date(), i);
    // Weight
    metrics.push({
      id: `w-${i}`,
      type: 'WEIGHT',
      value: 180 - (i * 0.1) + (Math.random() * 2 - 1),
      unit: 'lbs',
      timestamp: date,
    });
    // Glucose
    metrics.push({
      id: `g-${i}`,
      type: 'GLUCOSE',
      value: 90 + (Math.random() * 20),
      unit: 'mg/dL',
      timestamp: date,
      context: 'fasting',
    });
  }
  return metrics;
};

const MOCK_MESSAGES: Message[] = [
  { id: 'm1', sender: 'coach', text: 'Welcome to Metabolic Magic! I am here to help you transform.', timestamp: subDays(new Date(), 14) },
  { id: 'm2', sender: 'user', text: 'Thanks! Excited to start.', timestamp: subDays(new Date(), 14) },
  { id: 'm3', sender: 'coach', text: 'Great progress on your fasting glucose this week, Alex!', timestamp: subDays(new Date(), 1) },
];

const MOCK_FOOD: FoodEntry[] = [
  {
    id: 'f1',
    timestamp: new Date(),
    text: 'Salmon salad with avocado',
    macros: { calories: 450, protein: 35, carbs: 12, fat: 28 },
    qualityScore: 92,
    notes: 'Excellent healthy fats and protein. Perfect for metabolic flexibility.',
  },
];

const MOCK_PROMPTS: Prompt[] = [
    {
      "id": "2b7a5f2a-0c8a-4c0b-a8e2-6d9d0e0a9c61",
      "key": "daily_checkin_reminder_7pm",
      "name": "Daily Check-in Reminder (7pm)",
      "category": "reminder",
      "channel": "in_app",
      "active": true,
      "message_template": "Quick check-in, {{firstName}} 👋\n\nIf you haven’t logged today’s metrics yet, take 60 seconds now: BP, waist, glucose, ketones, weight.\n\nSmall steps → big momentum.",
      "variables": [
        "firstName"
      ]
    },
    {
      "id": "a9f1b9d6-82b3-4fb9-b0a9-0cb1b3e0ad2a",
      "key": "high_fasting_glucose_3day",
      "name": "High Fasting Glucose (3-day pattern)",
      "category": "intervention",
      "channel": "in_app",
      "active": true,
      "message_template": "Heads up, {{firstName}}: your fasting glucose has been running higher than your target for a few days.\n\nTry this for the next 48 hours:\n1) protein-first breakfast\n2) carbs later in the day (if any)\n3) 10–15 min walk after meals\n4) earlier bedtime\n\nIf you want, message your coach and we’ll troubleshoot together.",
      "variables": [
        "firstName"
      ]
    },
    {
      "id": "d3a6c63a-2a78-4eaf-a4bb-6da62a2e1c7d",
      "key": "bp_elevated_repeat",
      "name": "Blood Pressure Elevated (repeat)",
      "category": "intervention",
      "channel": "in_app",
      "active": true,
      "message_template": "{{firstName}}, it looks like you’ve had a couple higher blood pressure readings recently.\n\nRecheck when you’re rested (seated, 5 minutes, feet flat) and avoid caffeine/exercise right before.\n\nIf you get readings in the 140/90+ range repeatedly or have symptoms (chest pain, severe headache, shortness of breath), contact a clinician or urgent care. This app can’t provide emergency care.",
      "variables": [
        "firstName"
      ]
    },
    {
      "id": "7bd1a2f8-0c3b-4c9e-9d6f-9e4c5d5fdb2e",
      "key": "missed_weight_3days",
      "name": "Missed Weight Logging (3 days)",
      "category": "reminder",
      "channel": "in_app",
      "active": true,
      "message_template": "Friendly nudge, {{firstName}}: I haven’t seen a weight entry in a few days.\n\nNo pressure—just log today’s number so your trends stay accurate.",
      "variables": [
        "firstName"
      ]
    },
    {
      "id": "f8f2a7c6-5e6b-48c5-9c64-50b2a5c7e6f9",
      "key": "ketones_low_if_keto_phase",
      "name": "Ketones Low (if Keto Phase enabled)",
      "category": "intervention",
      "channel": "in_app",
      "active": true,
      "message_template": "{{firstName}}, your ketones look lower than expected for a keto phase.\n\nCommon culprits:\n- hidden carbs (sauces, drinks, snacks)\n- too little total calories/protein timing\n- stress + poor sleep\n\nLog your next meal photo and we’ll help spot the hidden carbs.",
      "variables": [
        "firstName"
      ]
    }
];

const MOCK_RULES: PromptRule[] = [
    {
      "id": "8b4f9a4d-6b2d-4f6b-9c1d-1a9a2b3c4d5e",
      "key": "rule_daily_7pm_no_metrics",
      "promptKey": "daily_checkin_reminder_7pm",
      "trigger_type": "schedule",
      "schedule_json": {
        "type": "daily_local_time",
        "hour": 19,
        "minute": 0
      },
      "conditions_json": {
        "type": "no_metric_entries_today"
      },
      "cooldown_hours": 20,
      "priority": 10,
      "active": true
    },
    {
      "id": "4e1c2f8a-9d0b-4f91-8a2c-7d3e1b0a9c2d",
      "key": "rule_high_fasting_glucose_3days",
      "promptKey": "high_fasting_glucose_3day",
      "trigger_type": "event",
      "schedule_json": null,
      "conditions_json": {
        "type": "metric_pattern",
        "metric": "GLUCOSE",
        "context_tag": "fasting",
        "operator": ">=",
        "value_mgdl": 110,
        "window_days": 3,
        "min_days_meeting_condition": 3
      },
      "cooldown_hours": 72,
      "priority": 50,
      "active": true
    },
    {
      "id": "9a7c6b5d-4e3f-4a2b-9c8d-7e6f5a4b3c2d",
      "key": "rule_bp_140_90_twice_in_7d",
      "promptKey": "bp_elevated_repeat",
      "trigger_type": "event",
      "schedule_json": null,
      "conditions_json": {
        "type": "bp_repeat",
        "systolic_threshold": 140,
        "diastolic_threshold": 90,
        "window_days": 7,
        "min_occurrences": 2
      },
      "cooldown_hours": 168,
      "priority": 60,
      "active": true
    },
    {
      "id": "0c3d2e1f-4a5b-4c6d-8e9f-1a2b3c4d5e6f",
      "key": "rule_missed_weight_3days",
      "promptKey": "missed_weight_3days",
      "trigger_type": "missed",
      "schedule_json": {
        "type": "daily_local_time",
        "hour": 19,
        "minute": 15
      },
      "conditions_json": {
        "type": "no_metric_type_in_days",
        "metric": "WEIGHT",
        "days": 3
      },
      "cooldown_hours": 48,
      "priority": 30,
      "active": true
    },
    {
      "id": "b3c2d1e0-f9a8-4b7c-8d6e-5f4a3b2c1d0e",
      "key": "rule_ketones_low_if_keto_phase",
      "promptKey": "ketones_low_if_keto_phase",
      "trigger_type": "event",
      "schedule_json": null,
      "conditions_json": {
        "type": "metric_threshold_with_flag",
        "metric": "KETONES",
        "operator": "<",
        "value_mmol": 0.3,
        "window_days": 2,
        "min_occurrences": 2,
        "requires_user_flag": {
          "flag": "keto_phase_enabled",
          "value": true
        }
      },
      "cooldown_hours": 72,
      "priority": 40,
      "active": true
    }
];

// Context
type DataContextType = {
  user: User;
  metrics: MetricEntry[];
  foodEntries: FoodEntry[];
  messages: Message[];
  prompts: Prompt[];
  rules: PromptRule[];
  addMetric: (metric: Omit<MetricEntry, 'id'>) => void;
  addFood: (food: Omit<FoodEntry, 'id'>) => void;
  addMessage: (text: string) => void;
  getMetricsByType: (type: MetricType) => MetricEntry[];
};

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user] = useState(MOCK_USER);
  const [metrics, setMetrics] = useState<MetricEntry[]>(GENERATE_METRICS());
  const [foodEntries, setFoodEntries] = useState<FoodEntry[]>(MOCK_FOOD);
  const [messages, setMessages] = useState<Message[]>(MOCK_MESSAGES);
  const [prompts] = useState<Prompt[]>(MOCK_PROMPTS);
  const [rules] = useState<PromptRule[]>(MOCK_RULES);

  const addMetric = (metric: Omit<MetricEntry, 'id'>) => {
    const newMetric = { ...metric, id: Math.random().toString(36).substr(2, 9) };
    setMetrics(prev => [newMetric, ...prev]);
  };

  const addFood = (food: Omit<FoodEntry, 'id'>) => {
    const newFood = { ...food, id: Math.random().toString(36).substr(2, 9) };
    setFoodEntries(prev => [newFood, ...prev]);
  };

  const addMessage = (text: string) => {
    const newMessage: Message = {
      id: Math.random().toString(36).substr(2, 9),
      sender: 'user',
      text,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, newMessage]);
    
    // Simulate coach reply
    setTimeout(() => {
      const reply: Message = {
        id: Math.random().toString(36).substr(2, 9),
        sender: 'coach',
        text: "I've received your update. Keep up the great work!",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, reply]);
    }, 2000);
  };

  const getMetricsByType = (type: MetricType) => {
    return metrics.filter(m => m.type === type).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  };

  return (
    <DataContext.Provider value={{ user, metrics, foodEntries, messages, prompts, rules, addMetric, addFood, addMessage, getMetricsByType }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) throw new Error('useData must be used within DataProvider');
  return context;
};
