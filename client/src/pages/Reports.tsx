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
    if (!reportRef.current) return;

    setIsGenerating(true);
    toast.info('Generating PDF...');

    try {
      const html2canvas = (await import('html2canvas')).default;
      const jsPDF = (await import('jspdf')).default;

      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#f8fafc'
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const imgWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

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
