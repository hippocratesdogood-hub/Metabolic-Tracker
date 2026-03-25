import React, { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useData } from '@/lib/dataAdapter';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, Calendar, Trophy, TrendingUp, TrendingDown, AlertCircle, CheckCircle2, Download, Loader2, Minus } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function Reports() {
  const { user } = useData();
  const reportRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const { data: report, isLoading, error } = useQuery({
    queryKey: ['weekly-report'],
    queryFn: () => api.getWeeklyReport(),
  });

  const handleDownloadPDF = async () => {
    if (!report) return;

    setIsGenerating(true);
    toast.info('Generating PDF...');

    try {
      const { default: jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const W = 210;
      const margin = 16;
      const contentW = W - margin * 2;
      let y = 0;

      // --- Colors ---
      const primary = [59, 130, 246] as const;     // blue-500
      const primaryDark = [37, 99, 235] as const;  // blue-600
      const green = [22, 163, 74] as const;         // green-600
      const red = [220, 38, 38] as const;           // red-600
      const yellow = [202, 138, 4] as const;        // yellow-600
      const gray = [100, 116, 139] as const;        // slate-500
      const darkText = [15, 23, 42] as const;       // slate-900
      const lightGray = [241, 245, 249] as const;   // slate-100

      // --- Helper: rounded rect ---
      const roundedRect = (x: number, ry: number, w: number, h: number, r: number, fill: readonly [number, number, number]) => {
        pdf.setFillColor(fill[0], fill[1], fill[2]);
        pdf.roundedRect(x, ry, w, h, r, r, 'F');
      };

      // --- Hero Header (blue gradient band) ---
      roundedRect(0, 0, W, 72, 0, primary);
      // Overlay gradient effect
      roundedRect(0, 36, W, 36, 0, primaryDark);

      // Metabolic OS branding
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(255, 255, 255);
      pdf.text('Metabolic OS', margin, 12);

      // Period label
      pdf.setFontSize(10);
      pdf.setTextColor(220, 230, 255);
      pdf.text(report.period.label, margin, 22);

      // Greeting
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(22);
      pdf.setTextColor(255, 255, 255);
      const firstName = user.name.split(' ')[0];
      const greeting = report.adherence >= 85 ? 'Excellent Week' :
                       report.adherence >= 70 ? 'Good Progress' :
                       report.adherence >= 50 ? 'Solid Effort' :
                       report.daysLogged > 0 ? 'Getting Started' : 'Time to Log';
      pdf.text(`${greeting}, ${firstName}!`, margin, 34);

      // Subtitle
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(210, 220, 245);
      const subtitle = report.adherence >= 85 ? "High adherence — your metabolic flexibility is improving." :
                       report.adherence >= 70 ? "Good consistency this week. Keep building those habits!" :
                       report.adherence >= 50 ? "You're making progress. Try to log more consistently." :
                       report.daysLogged > 0 ? "Every day counts. Try to log meals and metrics daily." :
                       "Start tracking to see your progress!";
      pdf.text(subtitle, margin, 42);

      // Adherence & Streak badges
      const badgeW = 36;
      const badgeH = 28;
      const badgeX1 = W - margin - badgeW * 2 - 6;
      const badgeX2 = W - margin - badgeW;
      const badgeY = 48;

      // Adherence badge
      pdf.setFillColor(255, 255, 255, 0.2);
      roundedRect(badgeX1, badgeY, badgeW, badgeH, 4, [80, 150, 255]);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(18);
      pdf.setTextColor(255, 255, 255);
      pdf.text(`${report.adherence}%`, badgeX1 + badgeW / 2, badgeY + 14, { align: 'center' });
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.text('Adherence', badgeX1 + badgeW / 2, badgeY + 22, { align: 'center' });

      // Streak badge
      roundedRect(badgeX2, badgeY, badgeW, badgeH, 4, [80, 150, 255]);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(18);
      pdf.text(`${report.streak}`, badgeX2 + badgeW / 2, badgeY + 14, { align: 'center' });
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.text('Day Streak', badgeX2 + badgeW / 2, badgeY + 22, { align: 'center' });

      y = 82;

      // --- Key Metrics Cards ---
      const cardW = (contentW - 8) / 3;
      const cardH = 32;
      const metrics = [
        {
          label: 'Avg Glucose',
          value: report.averages.glucose !== null ? `${report.averages.glucose}` : '--',
          unit: 'mg/dL',
          sub: report.averages.glucoseVsPrev !== null
            ? `${report.averages.glucoseVsPrev > 0 ? '+' : ''}${report.averages.glucoseVsPrev} vs last week`
            : report.metricsCount.glucose > 0 ? `${report.metricsCount.glucose} readings this week` : '',
          subColor: report.averages.glucoseVsPrev !== null
            ? (report.averages.glucoseVsPrev <= 0 ? green : red)
            : gray,
        },
        {
          label: 'Avg Ketones',
          value: report.averages.ketones !== null ? `${report.averages.ketones}` : '--',
          unit: 'mmol/L',
          sub: report.averages.ketonesVsPrev !== null
            ? `${report.averages.ketonesVsPrev > 0 ? '+' : ''}${report.averages.ketonesVsPrev} vs last week`
            : report.metricsCount.ketones > 0 ? `${report.metricsCount.ketones} readings this week` : '',
          subColor: report.averages.ketonesVsPrev !== null
            ? (report.averages.ketonesVsPrev >= 0 ? green : yellow)
            : gray,
        },
        {
          label: 'Weight Change',
          value: report.averages.weightChange !== null
            ? `${report.averages.weightChange > 0 ? '+' : ''}${report.averages.weightChange}`
            : '--',
          unit: 'lbs',
          sub: report.averages.weightChange !== null
            ? (report.averages.weightChange <= 0 ? 'On track' : 'Monitor closely')
            : 'Need more data points',
          subColor: report.averages.weightChange !== null
            ? (report.averages.weightChange <= 0 ? green : yellow)
            : gray,
        },
      ];

      metrics.forEach((m, i) => {
        const cx = margin + i * (cardW + 4);
        roundedRect(cx, y, cardW, cardH, 3, lightGray);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(...gray);
        pdf.text(m.label, cx + 6, y + 8);

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(16);
        pdf.setTextColor(...darkText);
        pdf.text(m.value, cx + 6, y + 19);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(...gray);
        pdf.text(m.unit, cx + 6 + pdf.getTextWidth(m.value) + 2, y + 19);

        if (m.sub) {
          pdf.setFontSize(7);
          pdf.setTextColor(m.subColor[0], m.subColor[1], m.subColor[2]);
          pdf.text(m.sub, cx + 6, y + 27);
        }
      });

      y += cardH + 10;

      // --- Highlights & Setbacks ---
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.setTextColor(...darkText);
      pdf.text('Highlights & Setbacks', margin, y);
      y += 7;

      if (report.highlights.length > 0) {
        report.highlights.forEach((item) => {
          const isPositive = item.type === 'positive';
          const dotColor = isPositive ? green : red;

          roundedRect(margin, y, contentW, 14, 3, lightGray);

          // Status dot
          pdf.setFillColor(dotColor[0], dotColor[1], dotColor[2]);
          pdf.circle(margin + 6, y + 7, 2.5, 'F');

          // Icon
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(8);
          pdf.setTextColor(255, 255, 255);
          pdf.text(isPositive ? '✓' : '!', margin + 6, y + 8.5, { align: 'center' });

          // Text
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(9);
          pdf.setTextColor(...darkText);
          const lines = pdf.splitTextToSize(item.text, contentW - 18);
          pdf.text(lines[0], margin + 14, y + 8.5);

          y += 17;
        });
      } else {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(...gray);
        pdf.text('Start logging to see your weekly highlights!', margin, y + 6);
        y += 14;
      }

      y += 4;

      // --- Next Week's Focus ---
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.setTextColor(...darkText);
      pdf.text("Next Week's Focus", margin, y);
      y += 7;

      // Focus card with light blue background
      const focusTitle = report.adherence >= 70 ? 'Keep the Momentum' : 'Build Consistency';
      const focusLines = pdf.splitTextToSize(report.nextFocus, contentW - 16);
      const focusH = 16 + focusLines.length * 5;
      roundedRect(margin, y, contentW, focusH, 3, [239, 246, 255]); // blue-50

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(...primary);
      pdf.text(focusTitle, margin + 8, y + 10);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(...gray);
      pdf.text(focusLines, margin + 8, y + 18);

      y += focusH + 10;

      // --- Week Summary footer ---
      roundedRect(margin, y, contentW, 12, 3, lightGray);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(...gray);
      const totalMetrics = report.metricsCount.glucose + report.metricsCount.ketones + report.metricsCount.weight;
      pdf.text(`This week: ${report.metricsCount.meals} meals, ${totalMetrics} metrics logged`, margin + 6, y + 7.5);
      pdf.text(`${report.daysLogged}/7 days active`, W - margin - 6, y + 7.5, { align: 'right' });

      // --- Save ---
      const fileName = `metabolic-report-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      pdf.save(fileName);
      toast.success('PDF downloaded successfully!');
    } catch (error) {
      console.error('PDF generation error:', error);
      toast.error('Failed to generate PDF. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="space-y-8 pb-20 max-w-3xl mx-auto">
        <div>
          <h1 className="text-2xl font-heading font-bold">Weekly Report</h1>
          <p className="text-muted-foreground">Your metabolic digest for the week.</p>
        </div>
        <Card className="border-none shadow-sm">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              {error ? 'Failed to load report. Please try again.' : 'No report data available yet. Start logging to see your progress!'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Determine greeting based on adherence
  const getGreeting = () => {
    if (report.adherence >= 85) return 'Excellent Week';
    if (report.adherence >= 70) return 'Good Progress';
    if (report.adherence >= 50) return 'Solid Effort';
    if (report.daysLogged > 0) return 'Getting Started';
    return 'Time to Log';
  };

  const getSubtitle = () => {
    if (report.adherence >= 85) return "You've maintained high adherence and your metabolic flexibility is improving.";
    if (report.adherence >= 70) return "Good consistency this week. Keep building those healthy habits!";
    if (report.adherence >= 50) return "You're making progress. Try to log more consistently next week.";
    if (report.daysLogged > 0) return "Every day counts. Try to log your meals and metrics daily.";
    return "Start tracking your meals and metrics to see your progress!";
  };

  return (
    <div className="space-y-8 pb-20 max-w-3xl mx-auto" ref={reportRef}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold">Weekly Report</h1>
          <p className="text-muted-foreground">Your metabolic digest for the week.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownloadPDF}
          disabled={isGenerating}
          data-testid="button-download-pdf"
        >
          {isGenerating ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Download className="w-4 h-4 mr-2" />
          )}
          {isGenerating ? 'Generating...' : 'Download PDF'}
        </Button>
      </div>

      {/* Hero Summary Card */}
      <Card className="border-none shadow-lg bg-gradient-to-br from-primary to-primary/80 text-primary-foreground overflow-hidden relative">
        <div className="absolute top-0 right-0 p-32 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <CardContent className="p-8 relative z-10">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <div className="flex items-center gap-2 text-primary-foreground/80 font-medium mb-1">
                <Calendar className="w-4 h-4" />
                {report.period.label}
              </div>
              <h2 className="text-3xl font-heading font-bold mb-2">{getGreeting()}, {user.name.split(' ')[0]}!</h2>
              <p className="text-primary-foreground/90 max-w-md">
                {getSubtitle()}
              </p>
            </div>

            <div className="flex gap-4">
              <div className="bg-white/20 backdrop-blur-md rounded-2xl p-4 text-center min-w-[100px]">
                <div className="text-3xl font-bold">{report.adherence}%</div>
                <div className="text-xs font-medium opacity-80">Adherence</div>
              </div>
              <div className="bg-white/20 backdrop-blur-md rounded-2xl p-4 text-center min-w-[100px]">
                <div className="text-3xl font-bold">{report.streak}</div>
                <div className="text-xs font-medium opacity-80">Day Streak</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Glucose</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">
                {report.averages.glucose !== null ? report.averages.glucose : '--'}
              </span>
              <span className="text-xs text-muted-foreground">mg/dL</span>
            </div>
            {report.averages.glucoseVsPrev !== null && (
              <div className={cn(
                "mt-2 text-xs flex items-center",
                report.averages.glucoseVsPrev <= 0 ? "text-green-600" : "text-red-600"
              )}>
                {report.averages.glucoseVsPrev <= 0 ? (
                  <TrendingDown className="w-3 h-3 mr-1" />
                ) : (
                  <TrendingUp className="w-3 h-3 mr-1" />
                )}
                {report.averages.glucoseVsPrev > 0 ? '+' : ''}{report.averages.glucoseVsPrev} vs last week
              </div>
            )}
            {report.averages.glucoseVsPrev === null && report.metricsCount.glucose > 0 && (
              <div className="mt-2 text-xs text-muted-foreground flex items-center">
                <Minus className="w-3 h-3 mr-1" />
                {report.metricsCount.glucose} readings this week
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Ketones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">
                {report.averages.ketones !== null ? report.averages.ketones : '--'}
              </span>
              <span className="text-xs text-muted-foreground">mmol/L</span>
            </div>
            {report.averages.ketonesVsPrev !== null && (
              <div className={cn(
                "mt-2 text-xs flex items-center",
                report.averages.ketonesVsPrev >= 0 ? "text-green-600" : "text-yellow-600"
              )}>
                {report.averages.ketonesVsPrev >= 0 ? (
                  <TrendingUp className="w-3 h-3 mr-1" />
                ) : (
                  <TrendingDown className="w-3 h-3 mr-1" />
                )}
                {report.averages.ketonesVsPrev > 0 ? '+' : ''}{report.averages.ketonesVsPrev} vs last week
              </div>
            )}
            {report.averages.ketonesVsPrev === null && report.metricsCount.ketones > 0 && (
              <div className="mt-2 text-xs text-muted-foreground flex items-center">
                <Minus className="w-3 h-3 mr-1" />
                {report.metricsCount.ketones} readings this week
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Weight Change</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">
                {report.averages.weightChange !== null
                  ? `${report.averages.weightChange > 0 ? '+' : ''}${report.averages.weightChange}`
                  : '--'}
              </span>
              <span className="text-xs text-muted-foreground">lbs</span>
            </div>
            {report.averages.weightChange !== null && (
              <div className={cn(
                "mt-2 text-xs flex items-center",
                report.averages.weightChange <= 0 ? "text-green-600" : "text-yellow-600"
              )}>
                {report.averages.weightChange <= 0 ? (
                  <TrendingDown className="w-3 h-3 mr-1" />
                ) : (
                  <TrendingUp className="w-3 h-3 mr-1" />
                )}
                {report.averages.weightChange <= 0 ? 'On track' : 'Monitor closely'}
              </div>
            )}
            {report.averages.weightChange === null && (
              <div className="mt-2 text-xs text-muted-foreground flex items-center">
                <Minus className="w-3 h-3 mr-1" />
                Need more data points
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Highlights */}
        <div className="space-y-4">
          <h3 className="font-heading font-semibold text-lg flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-500" />
            Highlights & Setbacks
          </h3>
          <div className="space-y-3">
            {report.highlights.length > 0 ? (
              report.highlights.map((item, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-card shadow-sm border border-border/50">
                  <div className={cn(
                    "mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0",
                    item.type === 'positive' ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                  )}>
                    {item.type === 'positive' ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                  </div>
                  <p className="text-sm">{item.text}</p>
                </div>
              ))
            ) : (
              <div className="p-3 rounded-lg bg-card shadow-sm border border-border/50 text-sm text-muted-foreground">
                Start logging to see your weekly highlights!
              </div>
            )}
          </div>
        </div>

        {/* Next Week Focus */}
        <div className="space-y-4">
          <h3 className="font-heading font-semibold text-lg flex items-center gap-2">
            <ArrowRight className="w-5 h-5 text-primary" />
            Next Week's Focus
          </h3>
          <Card className="border-primary/20 bg-primary/5 shadow-none">
            <CardContent className="p-6">
              <p className="text-lg font-medium text-primary mb-2">
                {report.adherence >= 70 ? 'Keep the Momentum' : 'Build Consistency'}
              </p>
              <p className="text-muted-foreground leading-relaxed">
                {report.nextFocus}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Week Summary */}
      <Card className="border-none shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>This week: {report.metricsCount.meals} meals, {report.metricsCount.glucose + report.metricsCount.ketones + report.metricsCount.weight} metrics logged</span>
            <span>{report.daysLogged}/7 days active</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
