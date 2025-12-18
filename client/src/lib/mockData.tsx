import React, { createContext, useContext, useState, useEffect } from 'react';
import { addDays, format, subDays, isSameDay } from 'date-fns';

// Types
export type User = {
  id: string;
  name: string;
  email: string;
  coachName: string;
  programStartDate: Date;
  units: 'US' | 'Metric';
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

// Mock Data
const MOCK_USER: User = {
  id: 'u1',
  name: 'Alex Rivera',
  email: 'alex@example.com',
  coachName: 'Dr. Sarah',
  programStartDate: subDays(new Date(), 14),
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

// Context
type DataContextType = {
  user: User;
  metrics: MetricEntry[];
  foodEntries: FoodEntry[];
  messages: Message[];
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
    <DataContext.Provider value={{ user, metrics, foodEntries, messages, addMetric, addFood, addMessage, getMetricsByType }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) throw new Error('useData must be used within DataProvider');
  return context;
};
