/**
 * Performance Monitoring Hooks
 *
 * Client-side performance tracking using the Performance API.
 * Tracks Core Web Vitals and custom metrics.
 */

import { useEffect, useCallback, useRef } from "react";

// Performance budgets (in milliseconds)
export const PERFORMANCE_BUDGETS = {
  // Core Web Vitals
  FCP: 1500,   // First Contentful Paint
  LCP: 2500,   // Largest Contentful Paint
  FID: 100,    // First Input Delay
  CLS: 0.1,    // Cumulative Layout Shift (ratio)
  TTI: 3500,   // Time to Interactive

  // Custom thresholds
  API_RESPONSE: 500,    // API response time
  PAGE_LOAD: 3000,      // Full page load
  COMPONENT_RENDER: 16, // 60fps frame budget
};

interface PerformanceMetric {
  name: string;
  value: number;
  rating: "good" | "needs-improvement" | "poor";
  timestamp: number;
}

interface WebVitals {
  FCP?: number;
  LCP?: number;
  FID?: number;
  CLS?: number;
  TTFB?: number;
}

/**
 * Track Core Web Vitals
 */
export function useWebVitals(onReport?: (metric: PerformanceMetric) => void) {
  useEffect(() => {
    // Only run in browser
    if (typeof window === "undefined") return;

    const reportMetric = (name: string, value: number, threshold: number) => {
      const rating = value <= threshold ? "good" : value <= threshold * 1.5 ? "needs-improvement" : "poor";
      const metric: PerformanceMetric = {
        name,
        value,
        rating,
        timestamp: Date.now(),
      };

      // Log in development
      if (process.env.NODE_ENV === "development") {
        console.log(`[Perf] ${name}: ${value.toFixed(2)}ms (${rating})`);
      }

      onReport?.(metric);
    };

    // First Contentful Paint
    const paintObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === "first-contentful-paint") {
          reportMetric("FCP", entry.startTime, PERFORMANCE_BUDGETS.FCP);
        }
      }
    });

    try {
      paintObserver.observe({ type: "paint", buffered: true });
    } catch (e) {
      // Observer not supported
    }

    // Largest Contentful Paint
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      if (lastEntry) {
        reportMetric("LCP", lastEntry.startTime, PERFORMANCE_BUDGETS.LCP);
      }
    });

    try {
      lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
    } catch (e) {
      // Observer not supported
    }

    // First Input Delay
    const fidObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const fidEntry = entry as PerformanceEventTiming;
        reportMetric("FID", fidEntry.processingStart - fidEntry.startTime, PERFORMANCE_BUDGETS.FID);
      }
    });

    try {
      fidObserver.observe({ type: "first-input", buffered: true });
    } catch (e) {
      // Observer not supported
    }

    // Cumulative Layout Shift
    let clsValue = 0;
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const layoutShift = entry as any;
        if (!layoutShift.hadRecentInput) {
          clsValue += layoutShift.value;
        }
      }
      reportMetric("CLS", clsValue, PERFORMANCE_BUDGETS.CLS);
    });

    try {
      clsObserver.observe({ type: "layout-shift", buffered: true });
    } catch (e) {
      // Observer not supported
    }

    return () => {
      paintObserver.disconnect();
      lcpObserver.disconnect();
      fidObserver.disconnect();
      clsObserver.disconnect();
    };
  }, [onReport]);
}

/**
 * Track component render time
 */
export function useRenderTime(componentName: string) {
  const startTime = useRef(performance.now());

  useEffect(() => {
    const renderTime = performance.now() - startTime.current;

    if (renderTime > PERFORMANCE_BUDGETS.COMPONENT_RENDER) {
      console.warn(
        `[Perf] Slow render: ${componentName} took ${renderTime.toFixed(2)}ms`
      );
    }
  }, [componentName]);
}

/**
 * Track API call performance
 */
export function useApiTiming() {
  const trackCall = useCallback(
    async <T>(name: string, apiCall: () => Promise<T>): Promise<T> => {
      const start = performance.now();

      try {
        const result = await apiCall();
        const duration = performance.now() - start;

        if (duration > PERFORMANCE_BUDGETS.API_RESPONSE) {
          console.warn(`[Perf] Slow API: ${name} took ${duration.toFixed(2)}ms`);
        }

        return result;
      } catch (error) {
        const duration = performance.now() - start;
        console.error(`[Perf] Failed API: ${name} after ${duration.toFixed(2)}ms`);
        throw error;
      }
    },
    []
  );

  return { trackCall };
}

/**
 * Measure and log navigation timing
 */
export function measurePageLoad(): WebVitals | null {
  if (typeof window === "undefined") return null;

  const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;

  if (!navigation) return null;

  return {
    TTFB: navigation.responseStart - navigation.requestStart,
  };
}

/**
 * Create a performance mark for custom measurements
 */
export function mark(name: string) {
  performance.mark(name);
}

/**
 * Measure between two marks
 */
export function measure(name: string, startMark: string, endMark?: string) {
  try {
    if (endMark) {
      performance.measure(name, startMark, endMark);
    } else {
      performance.measure(name, startMark);
    }
    const entries = performance.getEntriesByName(name);
    const lastEntry = entries[entries.length - 1];
    return lastEntry?.duration;
  } catch {
    return null;
  }
}

/**
 * Check if the app is meeting performance budgets
 */
export function checkPerformanceBudget(): {
  passed: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  // Check navigation timing
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
  if (nav) {
    const loadTime = nav.loadEventEnd - nav.startTime;
    if (loadTime > PERFORMANCE_BUDGETS.PAGE_LOAD) {
      violations.push(`Page load: ${loadTime.toFixed(0)}ms (budget: ${PERFORMANCE_BUDGETS.PAGE_LOAD}ms)`);
    }
  }

  // Check paint timing
  const paints = performance.getEntriesByType("paint");
  for (const paint of paints) {
    if (paint.name === "first-contentful-paint" && paint.startTime > PERFORMANCE_BUDGETS.FCP) {
      violations.push(`FCP: ${paint.startTime.toFixed(0)}ms (budget: ${PERFORMANCE_BUDGETS.FCP}ms)`);
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

/**
 * Get all performance entries for debugging
 */
export function getPerformanceEntries() {
  return {
    navigation: performance.getEntriesByType("navigation"),
    resource: performance.getEntriesByType("resource"),
    paint: performance.getEntriesByType("paint"),
    marks: performance.getEntriesByType("mark"),
    measures: performance.getEntriesByType("measure"),
  };
}

export default {
  useWebVitals,
  useRenderTime,
  useApiTiming,
  measurePageLoad,
  mark,
  measure,
  checkPerformanceBudget,
  PERFORMANCE_BUDGETS,
};
