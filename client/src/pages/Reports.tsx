import React, { useRef, useState } from 'react';
import { useData } from '@/lib/dataAdapter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, Calendar, Trophy, TrendingUp, AlertCircle, CheckCircle2, Download, Loader2 } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function Reports() {
  const { user } = useData();
  const reportRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const today = new Date();
  const weekStart = subDays(today, 7);
  
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
      
      const fileName = `metabolic-report-${format(today, 'yyyy-MM-dd')}.pdf`;
      pdf.save(fileName);
      toast.success('PDF downloaded successfully!');
    } catch (error) {
      console.error('PDF generation error:', error);
      toast.error('Failed to generate PDF. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Mock Report Data (in a real app, this comes from the backend generator)
  const report = {
    period: `${format(weekStart, 'MMM d')} - ${format(today, 'MMM d, yyyy')}`,
    streak: 14,
    adherence: 92,
    highlights: [
      { type: 'positive', text: 'You hit your protein goal 6/7 days!' },
      { type: 'positive', text: 'Fasting glucose stabilized under 100 mg/dL.' },
      { type: 'negative', text: 'Missed evening ketone checks twice.' }
    ],
    averages: {
      glucose: 98,
      ketones: 0.8,
      weightChange: -1.4
    },
    nextFocus: 'Increase water intake to 3L/day to support ketone production.'
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
                {report.period}
              </div>
              <h2 className="text-3xl font-heading font-bold mb-2">Excellent Week, {user.name.split(' ')[0]}!</h2>
              <p className="text-primary-foreground/90 max-w-md">
                You've maintained high adherence and your metabolic flexibility is improving.
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
              <span className="text-2xl font-bold">{report.averages.glucose}</span>
              <span className="text-xs text-muted-foreground">mg/dL</span>
            </div>
            <div className="mt-2 text-xs text-green-600 flex items-center">
              <TrendingUp className="w-3 h-3 mr-1" />
              Stable vs last week
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Ketones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{report.averages.ketones}</span>
              <span className="text-xs text-muted-foreground">mmol/L</span>
            </div>
            <div className="mt-2 text-xs text-green-600 flex items-center">
              <TrendingUp className="w-3 h-3 mr-1" />
              +0.2 vs last week
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Weight Change</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{report.averages.weightChange}</span>
              <span className="text-xs text-muted-foreground">lbs</span>
            </div>
            <div className="mt-2 text-xs text-green-600 flex items-center">
              <TrendingUp className="w-3 h-3 mr-1" />
              On track
            </div>
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
            {report.highlights.map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-card shadow-sm border border-border/50">
                <div className={cn(
                  "mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0",
                  item.type === 'positive' ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                )}>
                  {item.type === 'positive' ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                </div>
                <p className="text-sm">{item.text}</p>
              </div>
            ))}
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
              <p className="text-lg font-medium text-primary mb-2">Hydration & Ketones</p>
              <p className="text-muted-foreground leading-relaxed">
                {report.nextFocus}
              </p>
              <Button className="mt-4 w-full" variant="outline">
                View Hydration Plan
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
